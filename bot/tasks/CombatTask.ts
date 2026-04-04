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
} from '#/engine/bot/tasks/BotTaskBase.js';

import type { SkillStep } from '#/engine/bot/tasks/BotTaskBase.js';

type CombatExtra = {
    npcName?: string;
    npcType?: string;

    // ✅ NEW (multi-target support)
    npcTypes?: string[];

    npcPrefix?: string;
    npcSuffix?: string;

    hitsToKill?: number; // (you’re already using this too)
};

export class CombatTask extends BotTask {
    private step: SkillStep;
    private readonly stat: PlayerStat;

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
        = 'walk';

    private interactTicks = 0;
    private approachTicks = 0;
    private lastXp = 0;
    private scanFail = 0;

    private currentNpc: Npc | null = null;

    private readonly stuck = new StuckDetector(30, 4, 2);
    private readonly watchdog = new ProgressWatchdog(150);

    // prevents gate spam + repeated interactions
    private intentCooldown = 0;

    // patrol roaming
    private patrolTarget: [number, number] | null = null;
    private patrolTicks = 0;

    constructor(step: SkillStep, stat: PlayerStat) {
        super('Combat');
        this.step = step;
        this.stat = stat;
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

        // ── LEVEL UPDATE ─────────────────────────────
        const level = getBaseLevel(player, this.stat);
        const skillName =
            this.stat === PlayerStat.ATTACK ? 'ATTACK' :
            this.stat === PlayerStat.STRENGTH ? 'STRENGTH' :
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
            const [bx, bz] = Locations.DRAYNOR_BANK;

            if (!isNear(player, bx, bz, 8)) {
                this._stuckWalk(player, bx, bz);
                return;
            }

            const banker = findNpcByPrefix(player.x, player.z, player.level, 'banker', 10);
            if (!banker) return;

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
                this._stuckWalk(player, lx, lz);
                return;
            }

            // roam a bit before scanning to look more human
            this.state = 'patrol';
            this.patrolTicks = 0;
            this.patrolTarget = null;
            return;
        }

        // ── PATROL ────────────────────────────────────
        if (this.state === 'patrol') {
            const [cx, cz] = this.step.location;

            this.patrolTicks++;

            // pick a new target every few ticks
            if (!this.patrolTarget || this.patrolTicks % randInt(3, 6) === 0) {
                this.patrolTarget = [
                    cx + randInt(-12, 8),
                    cz + randInt(-12, 8)
                ];
            }

            const [tx, tz] = this.patrolTarget;
            walkTo(player, tx, tz);

            // occasionally search for NPCs while roaming
            if (this.patrolTicks % 2 === 0) {
                let npc = this._findTargetNpc(player);

                if (!npc) {
                    npc = this._findTargetNpcWider(player);
                }

                if (npc) {
                    this._log(player, `patrol found NPC → ${this._npcLabel(npc)}`, 'patrol_found');

                    this.currentNpc = npc;
                    interactNpcOp(player, npc, 2);

                    this.state = 'interact';
                    this.interactTicks = 0;
                    this.approachTicks = 0;
                    this.lastXp = player.stats[this.stat];
                    this.scanFail = 0;
                    return;
                }
            }

            // after a short roam, switch into scan mode
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

            this.currentNpc = npc;
            interactNpcOp(player, npc, 2);

            this.state = 'interact';
            this.interactTicks = 0;
            this.approachTicks = 0;
            this.lastXp = player.stats[this.stat];
            this.scanFail = 0;
            return;
        }

        // ── COMBAT ───────────────────────────────────
        if (this.state === 'interact') {
            this.interactTicks++;
            this.approachTicks++;

            if (player.stats[this.stat] > this.lastXp) {
                this._log(player, 'XP GAINED', 'xp_gain');
                this.lastXp = player.stats[this.stat];
                this.interactTicks = 0;
                this.approachTicks = 0;
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

        this.patrolTarget = null;
        this.patrolTicks = 0;

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

    // ── normalize all possible inputs into one array
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

    // ── randomize so bots don’t all pick same NPC
    for (const name of names.sort(() => Math.random() - 0.5)) {
        const npc =
            findNpcByName(player.x, player.z, player.level, name, radius) ??
            findNpcByPrefix(player.x, player.z, player.level, name, radius);

        if (npc) return npc;
    }

    // ── fallback matching
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

        if (openNearbyGate(player, 5)) {
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
