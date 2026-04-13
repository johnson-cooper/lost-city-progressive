import {
    BotTask,
    Player,
    Npc,
    InvType,
    walkTo,
    interactNpcOp,
    findNpcByName,
    findNpcByPrefix,
    findNpcBySuffix,
    hasItem,
    isInventoryFull,
    isNear,
    getBaseLevel,
    PlayerStat,
    Items,
    Locations,
    getProgressionStep,
    teleportNear,
    randInt,
    bankInvId,
    INTERACT_TIMEOUT,
    StuckDetector,
    ProgressWatchdog,
    openNearbyGate,
    addXp,
    setCombatStyle,
    botJitter,
    advanceBankWalk
} from '#/engine/bot/tasks/BotTaskBase.js';
import type { SkillStep } from '#/engine/bot/tasks/BotTaskBase.js';
import { findObjByName, findObjByPrefix, findObjNear, findAnyObj, interactHeldOp, pickupGroundItem, removeItem, findNpcFiltered, npcMatchesName, getNpcCombatLevel, findAggressorNpc, interactIF_UseOp, interactObjOp } from '#/engine/bot/BotAction.js';
import NpcType from '#/cache/config/NpcType.js';
import { Interfaces } from '#/engine/bot/BotKnowledge.js';
import ObjType from '#/cache/config/ObjType.js';

// ── Shared NPC claim registry ─────────────────────────────────────────────────
// Module-level set of NPC keys currently targeted by any CombatTask instance.
// Bots skip NPCs in this set so they don't pile onto the same target.
// Key: NPC index when available, otherwise a position+type composite.
const CLAIMED_NPCS = new Set<number>();

function _npcKey(npc: Npc): number {
    const idx = (npc as any).index;
    if (typeof idx === 'number') return idx;
    // Fallback composite — unique enough for the brief duration of a claim
    return npc.x * 100003 + npc.z * 1009 + npc.type;
}

type CombatExtra = {
    npcType?: string;
    npcTypes?: string[];
    hitsToKill?: number;
    itemsGained?: string[];
    npcName?: string;
    npcPrefix?: string;
    npcSuffix?: string;
};

// Melee style rotation: accurate(0)→attack, aggressive(1)→strength, defensive(3)→defence
const TRAIN_CYCLE: Array<{ stat: PlayerStat; style: 0 | 1 | 3 }> = [
    { stat: PlayerStat.ATTACK, style: 0 },
    { stat: PlayerStat.STRENGTH, style: 1 },
    { stat: PlayerStat.DEFENCE, style: 3 }
];

export class CombatTask extends BotTask {
    private step: SkillStep;
    private readonly primaryStat: PlayerStat; // governs location/progression
    private stat: PlayerStat; // current training stat (rotates per kill)
    private trainIndex = 0;
    private readonly noAttackTimeoutTicks = 12; // RS2 rounds are 5-6 ticks; allow ~2 full rounds before timeout

    private state: 'walk' | 'patrol' | 'scan' | 'interact' | 'flee' | 'shop_walk' | 'shop_open' | 'shop_sell' | 'bank_walk' | 'bank_deposit' | 'loot' | 'bury' = 'walk';

    private interactTicks = 0;
    private approachTicks = 0;
    private lastXp = 0;
    private scanFail = 0;
    private fleeTicks = 0;
    private readonly FLEE_TICKS = 12; // run for ~12 ticks before resuming combat

    private lastBuryTime = Date.now();
    private readonly BURY_INTERVAL = 0.1 * 60 * 1000;
    private buryCount = 0;
    private buryWaitTicks = 0;

    private currentNpc: Npc | null = null;
    /** Key of the NPC this instance has claimed in CLAIMED_NPCS, or -1 if none. */
    private claimedNpcKey = -1;

    private readonly stuck = new StuckDetector(30, 4, 2);
    private readonly watchdog = new ProgressWatchdog(150);

    private intentCooldown = 0;

    private patrolTarget: [number, number] | null = null;
    private patrolTicks = 0;

    private hasFoughtInArea = false;

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

        const banking = this.state === 'bank_walk' || this.state === 'bank_deposit';

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

        // ── AGGRESSOR DETECTION ──────────────────────────────────────────────────
        // If an NPC that we did not initiate combat with starts chasing the bot
        // and its combat level exceeds the bot's, retreat to the spawn area.
        // Skip this check while banking/shopping — the bot is already leaving.
        const safeStates = ['bank_walk', 'bank_deposit', 'flee', 'bury'];
        if (!safeStates.includes(this.state)) {
            const aggressor = findAggressorNpc(player, 8);
            if (aggressor && aggressor !== this.currentNpc) {
                const npcLvl = getNpcCombatLevel(aggressor);
                if (npcLvl > player.combatLevel) {
                    this._log(player, `fleeing from lvl-${npcLvl} ${this._npcLabel(aggressor)}`, 'flee_trigger');
                    this._releaseNpc();
                    this.currentNpc = null;
                    this.state = 'flee';
                    this.fleeTicks = 0;
                    return;
                }
            }
        }

        const hasBones = hasItem(player, Items.BONES) || hasItem(player, Items.BIG_BONES);

        const inventoryFull = isInventoryFull(player);
        const timeReady = now - this.lastBuryTime >= this.BURY_INTERVAL;
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
        const skillName = this.primaryStat === PlayerStat.ATTACK ? 'ATTACK' : this.primaryStat === PlayerStat.STRENGTH ? 'STRENGTH' : 'DEFENCE';

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
        if (isInventoryFull(player) && !['bank_walk', 'bank_deposit', 'shop_walk', 'shop_open', 'shop_sell'].includes(this.state)) {
            // Check if we have junk to sell - prefer shop over banking
            if (this._hasJunkToSell(player)) {
                this._log(player, 'INVENTORY FULL → shop_walk (selling junk)', 'inv_full');
                this.state = 'shop_walk';
            } else {
                this._log(player, 'INVENTORY FULL → bank_walk', 'inv_full');
                this.state = 'bank_walk';
            }
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
            this.cooldown = 2;
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
            const result = advanceBankWalk(player, this.stuck);
            if (result === 'walk') return;
            this.cooldown = result === 'ready' ? 3 : 0;
            this.state = 'bank_deposit';
            return;
        }

        if (this.state === 'bank_deposit') {
            this._equipLoot(player);
            this._depositGold(player);
            this._depositLoot(player);
            this._rerollStep(player); // re-randomise location for the next run

            this.state = 'walk';
            this.cooldown = 3;
            return;
        }

        // ── WALK ──────────────────────────────────────
        if (this.state === 'walk') {
            // Check for loot only if:
            // 1. Bot is near the combat area (within 20 tiles)
            // 2. Has fought in this area before
            const [lx, lz, ll] = this.step.location;
            const inCombatArea = isNear(player, lx, lz, 20, ll);

            if (inCombatArea && this.hasFoughtInArea) {
                const lootObj = findAnyObj(player, player.x, player.z, player.level, 5);
                if (lootObj) {
                    this.state = 'loot';
                    return;
                }
            }

            if (!isNear(player, lx, lz, 15, ll)) {
                // Via waypoint: route through intermediate coord before destination.
                // Used to steer around obstacles (e.g. Draynor Mansion for Barbarian
                // Village combat area).  Only apply when the bot hasn't yet passed it.
                const via = this.step.via;
                if (via && player.level === via[2] && player.z < via[1] && !isNear(player, via[0], via[1], 5)) {
                    const [jx, jz] = botJitter(player, via[0], via[1], 3);
                    this._stuckWalk(player, jx, jz);
                    return;
                }
                const [jx, jz] = botJitter(player, lx, lz, 6);
                this._stuckWalk(player, jx, jz);
                return;
            }

            this.state = 'patrol';
            this.patrolTicks = 0;
            this.patrolTarget = null;
            return;
        }

        // ── FLEE ──────────────────────────────────────
        // Run back toward the spawn area until clear of the aggressor.
        // walkTo automatically uses MoveSpeed.RUN when runenergy >= 30 %.
        if (this.state === 'flee') {
            // Check for loot only if near combat area and has fought before
            const [flx, flz] = this.step.location;
            const inCombatArea = isNear(player, flx, flz, 20);
            if (inCombatArea && this.hasFoughtInArea) {
                const lootObj = findAnyObj(player, player.x, player.z, player.level, 5);
                if (lootObj) {
                    this.state = 'loot';
                    return;
                }
            }

            this.fleeTicks++;
            const [lx, lz] = this.step.location;
            this._stuckWalk(player, lx, lz);

            if (this.fleeTicks >= this.FLEE_TICKS || isNear(player, lx, lz, 12)) {
                this._log(player, 'fled to safety → scan', 'flee_done');
                this.state = 'scan';
                this.fleeTicks = 0;
                this.scanFail = 0;
            }
            return;
        }

        // ── PATROL ────────────────────────────────────
        if (this.state === 'patrol') {
            // Check for loot only if near combat area and has fought before
            const [lx, lz] = this.step.location;
            const inCombatArea = isNear(player, lx, lz, 20);
            if (inCombatArea && this.hasFoughtInArea) {
                const lootObj = findAnyObj(player, player.x, player.z, player.level, 5);
                if (lootObj) {
                    this.state = 'loot';
                    return;
                }
            }

            const [cx, cz] = this.step.location;
            const [jcx, jcz] = botJitter(player, cx, cz, 8);

            // Try to open nearby gates while patrolling — handles cases where
            // the combat area is behind a fence the bot hasn't opened yet.
            if (this.intentCooldown === 0 && openNearbyGate(player, 8)) {
                this.intentCooldown = 4;
            }

            this.patrolTicks++;

            if (!this.patrolTarget || this.patrolTicks % randInt(3, 6) === 0) {
                this.patrolTarget = [jcx + randInt(-8, 8), jcz + randInt(-8, 8)];
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

                    this._claimNpc(npc);
                    this.currentNpc = npc;
                    setCombatStyle(player, TRAIN_CYCLE[this.trainIndex].style);
                    interactNpcOp(player, npc, 2);

                    this.state = 'interact';
                    this.interactTicks = 0;
                    this.approachTicks = 0;
                    this.lastXp = player.stats[this.stat];
                    this.scanFail = 0;
                    this.hasFoughtInArea = true;
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
            // Check for loot only if near combat area and has fought before
            const [lx, lz] = this.step.location;
            const inCombatArea = isNear(player, lx, lz, 20);
            if (inCombatArea && this.hasFoughtInArea) {
                const lootObj = findAnyObj(player, player.x, player.z, player.level, 5);
                if (lootObj) {
                    this.state = 'loot';
                    return;
                }
            }

            if (this.intentCooldown === 0) {
                if (openNearbyGate(player, 30)) {
                    this._log(player, 'opened gate during scan', 'gate_open_scan');
                    this.intentCooldown = 4;
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

            this._claimNpc(npc);
            this.currentNpc = npc;
            setCombatStyle(player, TRAIN_CYCLE[this.trainIndex].style);
            interactNpcOp(player, npc, 2);

            this.state = 'interact';
            this.interactTicks = 0;
            this.approachTicks = 0;
            this.lastXp = player.stats[this.stat];
            this.scanFail = 0;
            this.hasFoughtInArea = true;
            return;
        }

        // ── LOOT ──────────────────────────────────────
        if (this.state === 'loot') {
            // Blocklist: items to skip picking up
            const BLOCKLIST = [288]; // goblin mail

            // Find any ground object - picks up everything
            let obj = findAnyObj(player, player.x, player.z, player.level, 5);

            // Skip blocked items
            if (obj && BLOCKLIST.includes(obj.type)) {
                obj = null;
            }

            if (!obj) {
                this.state = 'interact';
                return;
            }

            this._log(player, `looting ${obj.type} @ ${obj.x},${obj.z}`, 'loot_found');

            if (!isNear(player, obj.x, obj.z, 1)) {
                walkTo(player, obj.x, obj.z);
                return;
            }

            interactObjOp(player, obj, 3);
            this.cooldown = randInt(1, 2);
            this.state = 'scan';
            return;
        }

        // ── COMBAT ───────────────────────────────────
        if (this.state === 'interact') {
            this.interactTicks++;
            this.approachTicks++;

            if (player.stats[this.stat] > this.lastXp) {
                // Hit landed — award bonus XP to a random melee stat.
                const roll = randInt(0, 2);
                let stat: PlayerStat;
                if (roll === 0) stat = PlayerStat.ATTACK;
                else if (roll === 1) stat = PlayerStat.STRENGTH;
                else stat = PlayerStat.DEFENCE;
                addXp(player, stat, 20);
                this._log(player, `hit landed → ${stat}`, 'xp_gain_random');
                this.lastXp = player.stats[this.stat];
                this.interactTicks = 0; // reset timeout — we just got a hit
                this.watchdog.notifyActivity();

                // Only move to loot when the NPC is actually gone from the world.
                if (this.currentNpc && this._isNpcAlive(player, this.currentNpc)) {
                    // Still alive — keep fighting; engine interaction persists.
                    return;
                }

                // NPC is dead / despawned — free the claim and go loot.
                this._releaseNpc();
                this.state = 'loot';
                this.interactTicks = 0;
                this.approachTicks = 0;
                return;
            }

            if (this.interactTicks >= this.noAttackTimeoutTicks) {
                if (this.currentNpc && this._isNpcAlive(player, this.currentNpc)) {
                    // NPC still alive but the engine lost the interaction — re-engage.
                    this._log(player, 're-engage NPC', 'reengage');
                    setCombatStyle(player, TRAIN_CYCLE[this.trainIndex].style);
                    interactNpcOp(player, this.currentNpc, 2);
                    this.interactTicks = 0;
                    return;
                }
                // NPC is gone — stop waiting and scan for another target.
                this._log(player, 'no attack after timeout → NPC gone → loot/scan', 'no_attack_timeout');
                this._releaseNpc();
                this.currentNpc = null;
                this.state = 'loot'; // check for dropped loot first
                this.approachTicks = 0;
                this.interactTicks = 0;
                this.scanFail = 0;
                return;
            }

            if (this.approachTicks >= INTERACT_TIMEOUT) {
                if (openNearbyGate(player, 30)) {
                    this.approachTicks = 0;
                    this.cooldown = 4;
                    return;
                }

                this._releaseNpc();
                this.currentNpc = null;
                this.state = 'scan';
                this.approachTicks = 0;
                this.interactTicks = 0;
                return;
            }

            if (this.interactTicks >= INTERACT_TIMEOUT * 2) {
                this._releaseNpc(); // was missing — ensure claim is freed
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

        this._releaseNpc(); // ensure any held claim is freed on task reassignment

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
        this.fleeTicks = 0;

        this.hasFoughtInArea = false;

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

    /**
     * Returns true if the NPC is available to be targeted:
     *   - not currently in combat (target not set)
     *   - not already claimed by another CombatTask bot
     */
    private _isNpcAvailable(npc: Npc): boolean {
        // Skip NPCs that already have a combat target (being fought by someone else)
        if ((npc as any).target !== null && (npc as any).target !== undefined) return false;
        // Skip NPCs already claimed by another bot this tick
        if (CLAIMED_NPCS.has(_npcKey(npc))) return false;
        return true;
    }

    private _findTargetNpc(player: Player): Npc | null {
        const extra = this.step.extra as CombatExtra | undefined;
        const radius = 22;
        if (!extra) return null;

        const names: string[] = [];
        if (extra.npcTypes?.length) names.push(...extra.npcTypes);
        if (extra.npcType) names.push(extra.npcType);
        if (extra.npcName) names.push(extra.npcName);

        for (const name of names.sort(() => Math.random() - 0.5)) {
            const npc = findNpcFiltered(player.x, player.z, player.level, npc => npcMatchesName(npc, name) && this._isNpcAvailable(npc), radius);
            if (npc) return npc;
        }

        if (extra.npcPrefix) {
            return findNpcFiltered(player.x, player.z, player.level, npc => !!NpcType.get(npc.type).debugname?.startsWith(extra.npcPrefix!) && this._isNpcAvailable(npc), radius);
        }

        if (extra.npcSuffix) {
            return findNpcFiltered(player.x, player.z, player.level, npc => !!NpcType.get(npc.type).debugname?.endsWith(extra.npcSuffix!) && this._isNpcAvailable(npc), radius);
        }

        return null;
    }

    private _findTargetNpcWider(player: Player): Npc | null {
        const extra = this.step.extra as CombatExtra | undefined;
        const radius = 30;
        if (!extra) return null;

        const names: string[] = [];
        if (extra.npcTypes?.length) names.push(...extra.npcTypes);
        if (extra.npcType) names.push(extra.npcType);
        if (extra.npcName) names.push(extra.npcName);

        for (const name of names.sort(() => Math.random() - 0.5)) {
            const npc = findNpcFiltered(player.x, player.z, player.level, npc => npcMatchesName(npc, name) && this._isNpcAvailable(npc), radius);
            if (npc) return npc;
        }

        return null;
    }

    // ─────────────────────────────────────────────
    // NPC ALIVE CHECK
    // ─────────────────────────────────────────────

    /**
     * Returns true if the NPC object still exists in the world near the player.
     * Uses an object-reference comparison so we never confuse a respawned NPC
     * of the same type with the original target.
     */
    private _isNpcAlive(player: Player, npc: Npc): boolean {
        return findNpcFiltered(player.x, player.z, player.level, n => n === npc, 30) !== null;
    }

    // ─────────────────────────────────────────────
    // NPC CLAIM REGISTRY
    // ─────────────────────────────────────────────

    /** Register this bot's current target so other bots skip it. */
    private _claimNpc(npc: Npc): void {
        this._releaseNpc();
        this.claimedNpcKey = _npcKey(npc);
        CLAIMED_NPCS.add(this.claimedNpcKey);
    }

    /** Release the current claim (NPC died, timed out, or task reset). */
    private _releaseNpc(): void {
        if (this.claimedNpcKey !== -1) {
            CLAIMED_NPCS.delete(this.claimedNpcKey);
            this.claimedNpcKey = -1;
        }
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

        if (openNearbyGate(player, 30)) {
            this.intentCooldown = 3;
            return;
        }

        walkTo(player, player.x + randInt(-10, 10), player.z + randInt(-10, 10));
    }

    // ─────────────────────────────────────────────
    // STEP RE-ROLL
    // ─────────────────────────────────────────────

    /**
     * After each bank trip, pick a fresh random step from all tiers the bot
     * qualifies for (level + tool ownership).  This spreads bots across
     * locations every inventory cycle instead of every level-up.
     */
    private _rerollStep(player: Player): void {
        const level = getBaseLevel(player, this.primaryStat);
        const skillName = this.primaryStat === PlayerStat.ATTACK ? 'ATTACK' : this.primaryStat === PlayerStat.STRENGTH ? 'STRENGTH' : 'DEFENCE';
        const newStep = getProgressionStep(skillName, level, ids => ids.every(id => hasItem(player, id)));
        if (newStep) {
            this.step = newStep;
            this.patrolTarget = null;
        }
    }

    // ─────────────────────────────────────────────
    // SHOP + BANK
    // ─────────────────────────────────────────────
    // ─────────────────────────────────────────────
    // SHOP + BANK
    // ─────────────────────────────────────────────
    private _hasJunkToSell(player: Player): boolean {
        const inv = player.getInventory(InvType.INV);
        if (!inv) return false;

        const protectedItems = new Set(this.step.toolItemIds);

        // Check if any item can be sold (not a tool item and not coins)
        for (let slot = 0; slot < inv.capacity; slot++) {
            const item = inv.get(slot);
            if (!item) continue;
            if (protectedItems.has(item.id)) continue;
            if (item.id === Items.COINS) continue;
            return true;
        }

        return false;
    }

    private _sellJunk(player: Player, shopNpc: Npc): void {
        //<- shopNpc isn't needed anymore
        const inv = player.getInventory(InvType.INV);
        if (!inv) return;

        const protectedItems = new Set(this.step.toolItemIds);

        for (let slot = 0; slot < inv.capacity; slot++) {
            const item = inv.get(slot);
            if (!item) continue;

            if (protectedItems.has(item.id)) continue;
            if (item.id === Items.COINS) continue; //<- also not needed anymore.

            if (interactIF_UseOp(player, Interfaces.SHOP_SIDE_INV, item.id, slot, 4)) {
                //info: Op 4 is sell 10 (Op1 value, op2 sell 1, op3 sell 5, op4 sell 10)(for SHOP_SIDE) Interfaces.SHOP_INV for buy
                console.log('(' + player.displayName + ') successfully sold item to shop: ' + item.id);
            } else {
                console.log('Could not sell item to shop! (' + item.id + ') for (' + player.displayName + ')');
            }
            //todo: check if more than 10 and repeat interfaceIF_UseOp
        }
    }

    private _depositGold(player: Player): void {
        const inv = player.getInventory(InvType.INV);
        const bid = bankInvId();
        if (!inv || bid === -1) return;

        const bank = player.getInventory(bid);
        if (!bank) return;

        // Keep 200gp in inventory — enough for ~20 Al Kharid gate passes (10gp each)
        // so the bot can exit after banking and reach its next task location.
        // Depositing every coin leaves the bot stranded inside gated areas.
        const KEEP_COINS = 200;

        for (let slot = 0; slot < inv.capacity; slot++) {
            const item = inv.get(slot);
            if (!item || item.id !== Items.COINS) continue;

            const toDeposit = Math.max(0, item.count - KEEP_COINS);
            if (toDeposit > 0) {
                const moved = inv.remove(item.id, toDeposit);
                if (moved.completed > 0) bank.add(Items.COINS, moved.completed);
            }
        }
    }

    
    /**
     * Has item equipped (itemId)
     * @param player
     * @param itemId
     * @private
     */
    private _wornContains(player: Player, itemId: number): boolean {
        const equip = player.getInventory(InvType.WORN);
        if (!equip) return false;

        for (let slot = 0; slot < equip.capacity; slot++) {
            const item = equip.get(slot);
            if (!item) continue;
            if(item.id === itemId) return true;
        }

        return false;
    }
    private _getWearSlot(oType: ObjType): number | null {
        return oType.wearpos ?? oType.wearpos2 ?? oType.wearpos3 ?? null;
    }
    private _getEquippedItem(player: Player, slotId: number) {
        const equip = player.getInventory(InvType.WORN);
        if (!equip) return null;

        return equip.get(slotId);
    }
    private _getTier(name?: string | null): number {
        if (!name) return 0;

        name = name.toLowerCase();

        if (name.includes('dragon')) return 6;
        if (name.includes('rune')) return 5;
        if (name.includes('adamant')) return 4;
        if (name.includes('mithril')) return 3;
        if (name.includes('black')) return 2;
        if (name.includes('steel')) return 1;
        if (name.includes('iron')) return 0;
        if (name.includes('bronze')) return 0;
        return -1;
    }

    private _isUpgrade(newItem: ObjType, currentItem: ObjType | null): boolean {
        if (!currentItem) return true;

        const newTier = this._getTier(newItem.name);
        const currentTier = this._getTier(currentItem.name);

        return newTier > currentTier;
    }

    private _equipLoot(player: Player): void {
        const inv = player.getInventory(InvType.INV);
        if (!inv) return;

        for (let slot = 0; slot < inv.capacity; slot++) {
            const item = inv.get(slot);
            if (!item) continue;

            if (this.step.toolItemIds.includes(item.id)) continue;
            if (item.id === Items.COINS) continue;

            const oType = ObjType.get(item.id);
            const wearSlot = this._getWearSlot(oType);
            if (wearSlot === null) continue;

            const equipped = this._getEquippedItem(player, wearSlot);
            const equippedType = equipped ? ObjType.get(equipped.id) : null;

            if (wearSlot === 3) { // weapon (attack req)
                if (this._getTier(oType.name) === 6 && player.baseLevels[0] < 60) continue;
                if (this._getTier(oType.name) === 5 && player.baseLevels[0] < 40) continue;
                if (this._getTier(oType.name) === 4 && player.baseLevels[0] < 30) continue;
                if (this._getTier(oType.name) === 3 && player.baseLevels[0] < 20) continue;
                if (this._getTier(oType.name) === 2 && player.baseLevels[0] < 10) continue;
                if (this._getTier(oType.name) === 1 && player.baseLevels[0] < 5) continue;
            } else if (wearSlot === 0 //hat
                   //|| wearSlot === 8 //head <- this isn't a real slot
                   ||  wearSlot === 4 //torso <- These all require defence
                   ||  wearSlot === 7 //legs
                   ||  wearSlot === 5) { //shield
                if (this._getTier(oType.name) === 6 && player.baseLevels[1] < 60) continue;
                if (this._getTier(oType.name) === 5 && player.baseLevels[1] < 40) continue;
                if (this._getTier(oType.name) === 4 && player.baseLevels[1] < 30) continue;
                if (this._getTier(oType.name) === 3 && player.baseLevels[1] < 20) continue;
                if (this._getTier(oType.name) === 2 && player.baseLevels[1] < 10) continue;
                if (this._getTier(oType.name) === 1 && player.baseLevels[1] < 5) continue;
            } else if (wearSlot === 1) { //Cape
                //We can add different tier systems in each of these.
            } else if (wearSlot === 2) { //Amulet
                //For example, tier 1 could be a strength / magic amulet
                //Tier 2 could be a power amulet
                //Tier 3 a glory
            } else if (wearSlot === 9) { //Hands
                //Not sure if theres much options for 04
            } else if (wearSlot === 10) { //Feet
                //Same ->
            } else if (wearSlot === 12) { //Ring
                //Same ->
            } else if (wearSlot === 13) { //Ammo
                //Bronze - Rune can be tiered
            } else { //Invalid slot continue;
                continue;
            }

            if (!this._isUpgrade(oType, equippedType)) continue;

            if (this._getTier(oType.name) != -1 && !this._wornContains(player, item.id)) {
                interactHeldOp(player, inv, item.id, slot, 2); //op 2 is equip the item
                this._log(player, '[upgrade]: equipped new item: ' + oType.name, 'equip_item');
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
