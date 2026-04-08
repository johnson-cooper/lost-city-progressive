import {
    BotTask, Player, Npc, InvType,
    walkTo, interactNpcOp,
    findNpcByName, findNpcByPrefix, findNpcBySuffix,
    hasItem, isInventoryFull, isNear,
    getBaseLevel, PlayerStat,
    Items, Locations, getProgressionStep,
    teleportNear, randInt, bankInvId,
    INTERACT_TIMEOUT, StuckDetector, ProgressWatchdog,
    openNearbyGate,
    addXp, setCombatStyle,
    botJitter, nearestBank,
} from '#/engine/bot/tasks/BotTaskBase.js';
import type { SkillStep } from '#/engine/bot/tasks/BotTaskBase.js';
import {
    findObjByName,
    findObjByPrefix,
    interactHeldOp,
    pickupGroundItem,
    removeItem,
} from '#/engine/bot/BotAction.js';

type CombatExtra = {
    npcName?: string;
    npcType?: string;
    npcTypes?: string[];
    npcPrefix?: string;
    npcSuffix?: string;
    hitsToKill?: number;
};

// Melee style rotation: accurate(0)→attack, aggressive(1)→strength, defensive(3)→defence
const TRAIN_CYCLE: Array<{ stat: PlayerStat; style: 0 | 1 | 3 }> = [
    { stat: PlayerStat.ATTACK,   style: 0 },
    { stat: PlayerStat.STRENGTH, style: 1 },
    { stat: PlayerStat.DEFENCE,  style: 3 },
];

export class CombatTask extends BotTask {
    private step: SkillStep;
    private readonly primaryStat: PlayerStat; // governs location/progression
    private stat: PlayerStat;                 // current training stat (rotates per kill)
    private trainIndex = 0;
    private readonly noAttackTimeoutTicks = 4; // ~2 seconds

    private state:
        | 'walk'
        | 'patrol'
        | 'scan'
        | 'interact'
        | 'shop_walk'
        | 'shop_open'
        | 'shop_sell'
        | 'bank_walk'
        | 'bank_deposit'
        | 'loot'
        | 'bury'
        = 'walk';

    private interactTicks = 0;
    private approachTicks = 0;
    private lastXp = 0;
    private scanFail = 0;

    private lastBuryTime = Date.now();
    private readonly BURY_INTERVAL = .10 * 60 * 1000;
    private buryCount = 0;
    private buryWaitTicks = 0;

    private currentNpc: Npc | null = null;

    private readonly stuck = new StuckDetector(30, 4, 2);
    private readonly watchdog = new ProgressWatchdog(150);

    private intentCooldown = 0;

    private patrolTarget: [number, number] | null = null;
    private patrolTicks = 0;

    constructor(step: SkillStep, stat: PlayerStat) {
        super('Combat');
        this.step = step;
        this.primaryStat = stat;
        this.stat = TRAIN_CYCLE[0].stat; // always start on attack
    }

    // ─────────────────────────────────────────────
    // LOGGING
    // ─────────────────────────────────────────────
    private lastLogKey = '';
    private lastLogTime = 0;

    private _log(player: Player | null, msg: string, key?: string): void {
        const now = Date.now();
        const logKey = key ?? msg;

        if (this.lastLogKey === logKey && now - this.lastLogTime < 750) return;

        this.lastLogKey = logKey;
        this.lastLogTime = now;

        const prefix = player ? `[P:${player.x},${player.z}]` : '[BOT]';
        console.log(`${prefix} [CombatTask] ${msg}`);
    }

    shouldRun(player: Player): boolean {
        return this.step.toolItemIds.every(id => hasItem(player, id));
    }

    tick(player: Player): void {
        const now = Date.now();

        if (this.interrupted) return;

        const banking =
            this.state === 'shop_walk' ||
            this.state === 'shop_open' ||
            this.state === 'shop_sell' ||
            this.state === 'bank_walk' ||
            this.state === 'bank_deposit';

        if (this.watchdog.check(player, banking)) {
            this._log(player, 'WATCHDOG TRIGGERED → interrupt', 'watchdog');
            this.interrupt();
            return;
        }

        if (this.cooldown > 0) {
            this.cooldown--;
            return;
        }

        if (this.intentCooldown > 0) this.intentCooldown--;

        const hasBones =
            hasItem(player, Items.BONES) ||
            hasItem(player, Items.BIG_BONES);

        const inventoryFull = isInventoryFull(player);
        const timeReady = (now - this.lastBuryTime) >= this.BURY_INTERVAL;
        const shouldBury = hasBones && timeReady;

        if (this.state !== 'bury' && shouldBury) {
            this.state = 'bury';
            this._log(player, '→ bury bones', 'bury_bones');
            return;
        }

       if (this.state === 'bury') {
            const inv = player.getInventory(InvType.INV);
            if (!inv) {
                this.state = 'scan';
                return;
            }

            // BIG BONES FIRST
            for (let slot = 0; slot < inv.capacity; slot++) {
                const item = inv.get(slot);
                if (!item) continue;

                if (item.id === Items.BIG_BONES) {
                    const moved = inv.remove(item.id, 1);

                    if (moved.completed > 0) {
                        addXp(player, PlayerStat.PRAYER, 150);
                        this._log(player, 'buried big bones +150 XP', 'bury_big');
                        this.cooldown = randInt(2, 4);
                    }

                    return;
                }
            }

            // NORMAL BONES
            for (let slot = 0; slot < inv.capacity; slot++) {
                const item = inv.get(slot);
                if (!item) continue;

                if (item.id === Items.BONES) {
                    interactHeldOp(player, inv, item.id, slot, 1);
                    this._log(player, 'buried bones +45 XP', 'bury_small');
                    this.cooldown = randInt(2, 4);
                    return;
                }
            }

            // but wait 1 extra tick as a safety net before giving up.
            this.buryWaitTicks++;
            if (this.buryWaitTicks < 2) {
                return;
            }

            // All bones buried or server never delivered
            this._log(player, 'finished burying', 'bury_done');
            this.lastBuryTime = now;
            this.buryCount = 0;
            this.buryWaitTicks = 0;
            this.state = 'scan';
            return;
        }

        // ── LEVEL UPDATE ─────────────────────────────
        const level = getBaseLevel(player, this.primaryStat);
        const skillName =
            this.primaryStat === PlayerStat.ATTACK ? 'ATTACK' :
            this.primaryStat === PlayerStat.STRENGTH ? 'STRENGTH' :
            'DEFENCE';

        const newStep = getProgressionStep(skillName, level);
        if (newStep && newStep.minLevel > this.step.minLevel) {
            this._log(player, `LEVEL UP → ${this.step.minLevel} → ${newStep.minLevel}`, 'level_up');
            this.step = newStep;
            this.state = 'walk';
            this.currentNpc = null;
            this.scanFail = 0;
            this.patrolTarget = null;
            this.patrolTicks = 0;
        }

        // ── INVENTORY FULL ───────────────────────────
        if (isInventoryFull(player) &&
            !['bank_walk', 'bank_deposit', 'shop_sell', 'shop_open'].includes(this.state)) {
            this._log(player, 'INVENTORY FULL → shop_walk', 'inv_full');
            this.state = 'shop_walk';
            this.currentNpc = null;
            return;
        }

        // ── SHOP ──────────────────────────────────────
        if (this.state === 'shop_walk') {
            const [sx, sz, sl] = Locations.LUMBRIDGE_GENERAL;

            if (!isNear(player, sx, sz, 8, sl)) {
                this._stuckWalk(player, sx, sz);
                return;
            }

            const shopNpc = findNpcByName(player.x, player.z, player.level, 'generalshopkeeper1', 10);
            if (!shopNpc) return;

            interactNpcOp(player, shopNpc, 3);
            this.currentNpc = shopNpc;
            this.state = 'shop_open';
            this.cooldown = 2;
            return;
        }

        if (this.state === 'shop_open') {
            this.state = 'shop_sell';
            return;
        }

        if (this.state === 'shop_sell') {
            if (!this.currentNpc) {
                this.state = 'bank_walk';
                return;
            }

            this._sellJunk(player, this.currentNpc);

            if (!isInventoryFull(player)) {
                this.state = 'bank_walk';
                this.currentNpc = null;
            }

            return;
        }

        // ── BANK ──────────────────────────────────────
        if (this.state === 'bank_walk') {
            const [bx, bz] = nearestBank(player);

            if (!isNear(player, bx, bz, 8)) {
                this._stuckWalk(player, bx, bz);
                return;
            }

            const banker = findNpcByPrefix(player.x, player.z, player.level, 'banker', 10);
            if (!banker) return;
            // Walk close to the banker first — prevents the engine routing backward
            // around bank counters when setInteraction is called from 8+ tiles away.
            if (!isNear(player, banker.x, banker.z, 3)) { walkTo(player, banker.x, banker.z); return; }

            interactNpcOp(player, banker, 3);
            this.state = 'bank_deposit';
            this.cooldown = 2;
            return;
        }

        if (this.state === 'bank_deposit') {
            this._depositGold(player);
            this._depositLoot(player);

            this.state = 'walk';
            this.cooldown = 3;
            return;
        }

        // ── WALK ──────────────────────────────────────
        if (this.state === 'walk') {
            const [lx, lz, ll] = this.step.location;

            if (!isNear(player, lx, lz, 15, ll)) {
                const [jx, jz] = botJitter(player, lx, lz, 6);
                this._stuckWalk(player, jx, jz);
                return;
            }

            this.state = 'patrol';
            this.patrolTicks = 0;
            this.patrolTarget = null;
            return;
        }

        // ── PATROL ────────────────────────────────────
        if (this.state === 'patrol') {
            const [cx, cz] = this.step.location;
            const [jcx, jcz] = botJitter(player, cx, cz, 8);

            this.patrolTicks++;

            if (!this.patrolTarget || this.patrolTicks % randInt(3, 6) === 0) {
                this.patrolTarget = [
                    jcx + randInt(-8, 8),
                    jcz + randInt(-8, 8)
                ];
            }

            const [tx, tz] = this.patrolTarget;
            walkTo(player, tx, tz);

            if (this.patrolTicks % 2 === 0) {
                let npc = this._findTargetNpc(player);

                if (!npc) {
                    npc = this._findTargetNpcWider(player);
                }

                if (npc) {
                    this._log(player, `patrol found NPC → ${this._npcLabel(npc)}`, 'patrol_found');

                    // Walk into melee range before engaging — prevents the engine
                    // routing backward when the NPC is partially obstructed.
                    if (!isNear(player, npc.x, npc.z, 5)) {
                        walkTo(player, npc.x, npc.z);
                        return;
                    }

                    this.currentNpc = npc;
                    setCombatStyle(player, TRAIN_CYCLE[this.trainIndex].style);
                    interactNpcOp(player, npc, 2);

                    this.state = 'interact';
                    this.interactTicks = 0;
                    this.approachTicks = 0;
                    this.lastXp = player.stats[this.stat];
                    this.scanFail = 0;
                    return;
                }
            }

            if (this.patrolTicks > randInt(6, 12)) {
                this.state = 'scan';
                this.patrolTicks = 0;
                this.patrolTarget = null;
            }

            return;
        }

        // ── SCAN ──────────────────────────────────────
        if (this.state === 'scan') {
            if (this.intentCooldown === 0) {
                if (openNearbyGate(player, 6)) {
                    this._log(player, 'opened gate during scan', 'gate_open_scan');
                    this.intentCooldown = 3;
                    return;
                }
            }

            let npc = this._findTargetNpc(player);

            if (!npc) {
                this.scanFail++;

                if (this.scanFail <= 2) {
                    this._log(player, `scan fail ${this.scanFail}`, 'scan_fail');
                }

                if (this.scanFail === 2) {
                    npc = this._findTargetNpcWider(player);
                }

                if (this.scanFail === 3) {
                    this._stuckWalk(player, player.x + randInt(-4, 4), player.z + randInt(-4, 4));
                    return;
                }

                if (this.scanFail >= 4) {
                    this.scanFail = 0;
                    this.state = 'patrol';
                }

                return;
            }

            this._log(player, `found NPC → ${this._npcLabel(npc)}`, 'npc_found');

            // Walk into melee range before engaging — prevents the engine
            // routing backward when the NPC is partially obstructed.
            if (!isNear(player, npc.x, npc.z, 5)) {
                walkTo(player, npc.x, npc.z);
                return;
            }

            this.currentNpc = npc;
            setCombatStyle(player, TRAIN_CYCLE[this.trainIndex].style);
            interactNpcOp(player, npc, 2);

            this.state = 'interact';
            this.interactTicks = 0;
            this.approachTicks = 0;
            this.lastXp = player.stats[this.stat];
            this.scanFail = 0;
            return;
        }

        // ── LOOT ──────────────────────────────────────
        if (this.state === 'loot') {
            let obj =
                findObjByName(player.x, player.z, player.level, 'bones', 6) ??
                findObjByName(player.x, player.z, player.level, 'big bones', 6);

            if (!obj) {
                obj =
                    findObjByPrefix(player.x, player.z, player.level, 'coin', 6) ??
                    findObjByPrefix(player.x, player.z, player.level, 'arrow', 6);
            }

            if (!obj) {
                if (hasItem(player, Items.BONES) || hasItem(player, Items.BIG_BONES)) {
                    this._log(player, 'no loot → bury', 'no_loot_bury');
                    this.state = 'bury';
                } else {
                    this._log(player, 'no loot → scan', 'no_loot');
                    this.state = 'scan';
                }
                return;
            }

            this._log(player, `looting ${obj.type} @ ${obj.x},${obj.z}`, 'loot_found');

            if (!isNear(player, obj.x, obj.z, 1)) {
                walkTo(player, obj.x, obj.z);
                return;
            }

            // Directly add to inventory and remove from world — bypasses the engine
            // interaction system which has unreliable timing for Obj OP triggers.
            const picked = pickupGroundItem(player, obj as any);

            if (!picked) {
                // Obj went invalid between finding it and picking it up (another player,
                // despawn race, no inventory space). Skip it and scan for the next target.
                this._log(player, `pickup failed ${obj.type} → scan`, 'pickup_fail');
                this.state = 'scan';
                return;
            }

            this._log(player, `picked up ${obj.type} @ ${obj.x},${obj.z}`, `pickup_${obj.type}`);
            this.watchdog.notifyActivity();

            const isBones = obj.type === Items.BONES || obj.type === Items.BIG_BONES;
            if (isBones) {
                // Item is already in inventory — go bury immediately.
                this.buryWaitTicks = 0;
                this.state = 'bury';
            }
            this.cooldown = randInt(1, 2);
            return;
        }

        // ── COMBAT ───────────────────────────────────
        if (this.state === 'interact') {
            this.interactTicks++;
            this.approachTicks++;

            if (player.stats[this.stat] > this.lastXp) {

    const roll = randInt(0, 2);

    let stat: PlayerStat;

    if (roll === 0) stat = PlayerStat.ATTACK;
    else if (roll === 1) stat = PlayerStat.STRENGTH;
    else stat = PlayerStat.DEFENCE;

    addXp(player, stat, 20); // or your per-hit XP amount

    this._log(player, `random XP → ${stat}`, 'xp_gain_random');

    this.lastXp = player.stats[this.stat];

    this.state = 'loot';
    this.interactTicks = 0;
    this.approachTicks = 0;

    return;
}

            if (this.interactTicks >= this.noAttackTimeoutTicks) {
                this._log(player, 'no attack after 2s → retarget', 'no_attack_timeout');
                this.currentNpc = null;
                this.state = 'scan';
                this.approachTicks = 0;
                this.interactTicks = 0;
                this.scanFail = 0;
                return;
            }

            if (this.approachTicks >= INTERACT_TIMEOUT) {
                if (openNearbyGate(player, 6)) {
                    this.approachTicks = 0;
                    this.cooldown = 4;
                    return;
                }

                this.currentNpc = null;
                this.state = 'scan';
                this.approachTicks = 0;
                this.interactTicks = 0;
                return;
            }

            if (this.interactTicks >= INTERACT_TIMEOUT * 2) {
                this.currentNpc = null;
                this.state = 'scan';
                this.approachTicks = 0;
                this.interactTicks = 0;
            }
        }
    }

    isComplete(): boolean {
        return false;
    }

    override reset(): void {
        super.reset();

        this.state = 'walk';
        this.interactTicks = 0;
        this.approachTicks = 0;
        this.lastXp = 0;
        this.scanFail = 0;
        this.currentNpc = null;
        this.intentCooldown = 0;

        this.trainIndex = 0;
        this.stat = TRAIN_CYCLE[0].stat;

        this.patrolTarget = null;
        this.patrolTicks = 0;

        this.lastBuryTime = 0; // expire immediately so timer-fallback fires on first tick with bones
        this.buryCount = 0;
        this.buryWaitTicks = 0;

        this.stuck.reset();
        this.watchdog.reset();
    }

    private _npcLabel(npc: Npc): string {
        const anyNpc = npc as any;
        return anyNpc.type ?? anyNpc.name ?? anyNpc.index ?? 'unknown';
    }

    // ─────────────────────────────────────────────
    // NPC SEARCH
    // ─────────────────────────────────────────────
    private _findTargetNpc(player: Player): Npc | null {
        const extra = this.step.extra as CombatExtra | undefined;
        const radius = 22;

        if (!extra) return null;

        const names: string[] = [];

        if (extra.npcTypes?.length) {
            names.push(...extra.npcTypes);
        }

        if (extra.npcType) {
            names.push(extra.npcType);
        }

        if (extra.npcName) {
            names.push(extra.npcName);
        }

        for (const name of names.sort(() => Math.random() - 0.5)) {
            const npc =
                findNpcByName(player.x, player.z, player.level, name, radius) ??
                findNpcByPrefix(player.x, player.z, player.level, name, radius);

            if (npc) return npc;
        }

        if (extra.npcPrefix) {
            return findNpcByPrefix(player.x, player.z, player.level, extra.npcPrefix, radius);
        }

        if (extra.npcSuffix) {
            return findNpcBySuffix(player.x, player.z, player.level, extra.npcSuffix, radius);
        }

        return null;
    }

    private _findTargetNpcWider(player: Player): Npc | null {
        const extra = this.step.extra as CombatExtra | undefined;
        const radius = 30;

        if (!extra) return null;

        const names: string[] = [];

        if (extra.npcTypes?.length) {
            names.push(...extra.npcTypes);
        }

        if (extra.npcType) {
            names.push(extra.npcType);
        }

        if (extra.npcName) {
            names.push(extra.npcName);
        }

        for (const name of names.sort(() => Math.random() - 0.5)) {
            const npc =
                findNpcByName(player.x, player.z, player.level, name, radius) ??
                findNpcByPrefix(player.x, player.z, player.level, name, radius);

            if (npc) return npc;
        }

        return null;
    }

    // ─────────────────────────────────────────────
    // STUCK SYSTEM
    // ─────────────────────────────────────────────
    private _stuckWalk(player: Player, lx: number, lz: number): void {
        if (!this.stuck.check(player, lx, lz)) {
            walkTo(player, lx, lz);
            return;
        }

        if (this.stuck.desperatelyStuck) {
            teleportNear(player, lx, lz);
            this.stuck.reset();
            return;
        }

        if (openNearbyGate(player, 10)) {
            this.intentCooldown = 3;
            return;
        }

        walkTo(
            player,
            player.x + randInt(-10, 10),
            player.z + randInt(-10, 10)
        );
    }

    // ─────────────────────────────────────────────
    // SHOP + BANK
    // ─────────────────────────────────────────────
    private _sellJunk(player: Player, shopNpc: Npc): void {
        const inv = player.getInventory(InvType.INV);
        if (!inv) return;

        const protectedItems = new Set(this.step.toolItemIds);

        for (let slot = 0; slot < inv.capacity; slot++) {
            const item = inv.get(slot);
            if (!item) continue;

            if (protectedItems.has(item.id)) continue;
            if (item.id === Items.COINS) continue;

            interactNpcOp(player, shopNpc, 3);
            return;
        }
    }

    private _depositGold(player: Player): void {
        const inv = player.getInventory(InvType.INV);
        const bid = bankInvId();
        if (!inv || bid === -1) return;

        const bank = player.getInventory(bid);
        if (!bank) return;

        for (let slot = 0; slot < inv.capacity; slot++) {
            const item = inv.get(slot);
            if (!item || item.id !== Items.COINS) continue;

            const moved = inv.remove(item.id, item.count);
            if (moved.completed > 0) {
                bank.add(Items.COINS, moved.completed);
            }
        }
    }

    private _depositLoot(player: Player): void {
        const inv = player.getInventory(InvType.INV);
        const bid = bankInvId();
        if (!inv || bid === -1) return;

        const bank = player.getInventory(bid);
        if (!bank) return;

        for (let slot = 0; slot < inv.capacity; slot++) {
            const item = inv.get(slot);
            if (!item) continue;

            if (this.step.toolItemIds.includes(item.id)) continue;
            if (item.id === Items.COINS) continue;

            const moved = inv.remove(item.id, item.count);
            if (moved.completed > 0) {
                bank.add(item.id, moved.completed);
            }
        }
    }
}
