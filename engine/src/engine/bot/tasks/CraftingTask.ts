/**
 * CraftingTask.ts
 *
 * Two-phase crafting task driven by BotGoalPlanner._findCraftingTask().
 *
 * ── Phase 1  (step.action === 'craft_wool')  ─────────────────────────────────
 *   Runs while Mining < 40 OR Smithing < 40.
 *   shear_walk → shear → climb → spin → descend → bank_walk → bank → repeat
 *
 *   Sheep field  → Lumbridge sheep NE of castle
 *   Spinning     → teleJump to Lumbridge castle 2nd floor, use ball_wool on wheel
 *   Banking      → teleJump back to ground floor, nearest ground-floor bank
 *
 * ── Phase 2  (step.action === 'craft_ring')  ─────────────────────────────────
 *   Unlocks once Mining >= 40 AND Smithing >= 40 (gold ore pipeline active).
 *   bank_walk → withdraw → furnace_walk → craft → bank_return → repeat
 *
 *   Materials    → gold bars from bank + ring_mould in inventory
 *   Output       → gold rings deposited each banking cycle
 */

import {
    BotTask,
    Player,
    InvType,
    walkTo,
    interactUseLocOp,
    botInteractUseObjNpc,
    findNpcByName,
    findLocByName,
    findLocByPrefix,
    hasItem,
    countItem,
    isNear,
    getBaseLevel,
    PlayerStat,
    Items,
    Locations,
    randInt,
    bankInvId,
    StuckDetector,
    ProgressWatchdog,
    openNearbyGate,
    teleportNear,
    advanceBankWalk,
    botTeleport
} from '#/engine/bot/tasks/BotTaskBase.js';
import type { SkillStep } from '#/engine/bot/tasks/BotTaskBase.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Collect this many ball_wool before heading to the spinning wheel. */
const SHEAR_BATCH = 14;

/** Consecutive failed interaction attempts before giving up on a state. */
const FAIL_LIMIT = 6;

// ── CraftingTask ──────────────────────────────────────────────────────────────

type Phase1State = 'shear_walk' | 'shear' | 'climb' | 'spin' | 'descend' | 'bank_walk' | 'bank';
type Phase2State = 'bank_walk' | 'withdraw' | 'furnace_walk' | 'craft' | 'bank_return';

export class CraftingTask extends BotTask {
    private readonly step: SkillStep;
    private readonly phase: 1 | 2;

    private p1State: Phase1State = 'shear_walk';
    private p2State: Phase2State = 'bank_walk';

    private failTicks = 0;
    private done = false;
    private lastBallWool = 0;

    private readonly stuck = new StuckDetector(30, 4, 2);
    private readonly watchdog = new ProgressWatchdog();

    constructor(step: SkillStep) {
        super('Crafting');
        this.step = step;
        this.phase = step.action === 'craft_wool' ? 1 : 2;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    shouldRun(player: Player): boolean {
        const mineLevel = getBaseLevel(player, PlayerStat.MINING);
        const smithLevel = getBaseLevel(player, PlayerStat.SMITHING);
        const phase2Unlocked = mineLevel >= 40 && smithLevel >= 40;

        if (this.phase === 1) {
            if (phase2Unlocked) return false; // gate closed
            return hasItem(player, Items.SHEARS);
        }

        // Phase 2
        if (!phase2Unlocked) return false;
        if (!hasItem(player, Items.RING_MOULD)) return false;
        return this._hasGoldBarsAnywhere(player);
    }

    isComplete(_player: Player): boolean {
        return this.done;
    }

    override reset(): void {
        super.reset();
        this.p1State = 'shear_walk';
        this.p2State = 'bank_walk';
        this.failTicks = 0;
        this.done = false;
        this.lastBallWool = 0;
        this.stuck.reset();
        this.watchdog.reset();
    }

    tick(player: Player): void {
        if (this.interrupted) return;

        const banking = this.phase === 1 ? this.p1State === 'bank_walk' || this.p1State === 'bank' : this.p2State === 'bank_walk' || this.p2State === 'withdraw' || this.p2State === 'bank_return';

        if (this.watchdog.check(player, banking)) {
            this.interrupt();
            return;
        }

        if (this.cooldown > 0) {
            this.cooldown--;
            return;
        }

        if (this.phase === 1) {
            this._tickPhase1(player);
        } else {
            this._tickPhase2(player);
        }
    }

    // ── Phase 1: wool spinning ────────────────────────────────────────────────

    private _tickPhase1(player: Player): void {
        switch (this.p1State) {
            // ── Walk to sheep field ───────────────────────────────────────────
            case 'shear_walk': {
                const [sx, sz] = this.step.extra!['sheepLocation'] as [number, number, number];
                // Radius 7 ensures the bot is inside the pen (not just near the east gate
                // approach tile at ~[3202, 3282], which is ~12 tiles away).
                // walkTo() handles the SheepPen GATEWAY_REGION automatically: it routes to
                // the east-gate approach tile, calls openNearbyGate, then pathfinds inside.
                if (!isNear(player, sx, sz, 7)) {
                    this._stuckWalk(player, sx, sz);
                    return;
                }
                this.p1State = 'shear';
                this.lastBallWool = countItem(player, Items.WOOL);
                return;
            }

            // ── Shear sheep until we have a full batch ────────────────────────
            case 'shear': {
                // Wait for cooldown between shearing attempts
                if (this.cooldown > 0) {
                    this.cooldown--;
                    return;
                }

                // Shearing gives raw wool (Items.WOOL).  Track that, not ball_of_wool.
                const woolCount = countItem(player, Items.WOOL);

                // Notify watchdog whenever we gain a wool
                if (woolCount > this.lastBallWool) {
                    this.watchdog.notifyActivity();
                    this.failTicks = 0;
                }
                this.lastBallWool = woolCount;

                if (woolCount >= SHEAR_BATCH) {
                    this.p1State = 'climb';
                    return;
                }

                // Locate shears in inventory — required for use-item-on-npc
                const inv = player.getInventory(InvType.INV);
                if (!inv) return;
                let shearsSlot = -1;
                for (let i = 0; i < inv.capacity; i++) {
                    if (inv.get(i)?.id === Items.SHEARS) {
                        shearsSlot = i;
                        break;
                    }
                }
                if (shearsSlot === -1) {
                    // Lost shears somehow — abort so planner can re-buy them
                    this.interrupt();
                    return;
                }

                // Cycle to a different sheep each attempt so multiple bots don't all
                // pile on the same target.  Falls back to any sheep if only one exists.
                // NPC debugname is 'sheepunsheered' — sheared sheep become 'sheepsheered'.
                const [sx, sz] = this.step.extra!['sheepLocation'] as [number, number, number];
                console.log(`[CraftingTask][${player.username}] Looking for sheep at ${player.x},${player.z} radius 10`);
                const sheep = findNpcByName(player.x, player.z, player.level, 'sheepunsheered', 20);

                if (!sheep) {
                    console.log(`[CraftingTask][${player.username}] No sheep found! failTicks=${this.failTicks}`);
                    this.failTicks++;
                    if (this.failTicks >= FAIL_LIMIT) {
                        // Walk back to sheep location center - no jitter
                        walkTo(player, sx, sz);
                        this.failTicks = 0;
                    }
                    return;
                }

                // Use shears on sheep (APNPCU trigger) — server drives the shearing
                // animation and grants the ball_wool on completion (~3 ticks).
                // Cooldown covers the full shearing action so the bot doesn't
                // spam the interaction before the server has finished.
                console.log(`[CraftingTask][${player.username}] Found sheep @ ${sheep.x},${sheep.z}, attempting shear`);
                const ok = botInteractUseObjNpc(player, sheep, Items.SHEARS, shearsSlot);
                if (ok) {
                    console.log(`[CraftingTask][${player.username}] Shear interaction sent! woolCount=${woolCount}`);
                    this.failTicks = 0;
                    this.cooldown = randInt(4, 6); // 3 ticks animation + 1-3 buffer
                } else {
                    console.log(`[CraftingTask][${player.username}] Shear FAILED! failTicks=${this.failTicks}`);
                    this.failTicks++;
                    if (this.failTicks >= FAIL_LIMIT) {
                        walkTo(player, sx, sz);
                        this.failTicks = 0;
                    }
                }
                return;
            }

            // ── Walk near the castle (outside), then teleJump to spinning wheel ─
            case 'climb': {
                // Walk to the outside-castle approach point, then teleJump directly
                // to the spinning wheel on level 1.  Never enters the castle building
                // — avoids the south door that blocks bot pathfinding.
                const [approachX, approachZ] = Locations.LUMBRIDGE_CASTLE_APPROACH;
                if (!isNear(player, approachX, approachZ, 10, 0)) {
                    this._stuckWalk(player, approachX, approachZ);
                    return;
                }
                const [wx, wz, wl] = Locations.LUMBRIDGE_POTTERS_WHEEL;
                botTeleport(player, wx, wz, wl);
                this.p1State = 'spin';
                this.failTicks = 0;
                return;
            }

            // ── Spin raw wool into ball of wool on the spinning wheel ────────────
            case 'spin': {
                // Raw wool (Items.WOOL) was obtained by shearing.
                // The spinning wheel script consumes Items.WOOL and produces Items.BALL_WOOL.
                const woolCount = countItem(player, Items.WOOL);
                if (woolCount === 0) {
                    this.p1State = 'descend';
                    return;
                }

                // Must be cardinally adjacent to the wheel before interacting.
                // reachedLoc requires cardinal adjacency — diagonal doesn't satisfy it.
                // LUMBRIDGE_POTTERS_WHEEL is already the adjacent tile, so this walk
                // normally completes in 0 ticks, but guards against any position drift.
                const [wx, wz, wl] = Locations.LUMBRIDGE_POTTERS_WHEEL;
                if (!isNear(player, wx, wz, 1, wl)) {
                    walkTo(player, wx, wz);
                    return;
                }

                const wheel = findLocByName(player.x, player.z, player.level, 'spinning_wheel', 20) ?? findLocByPrefix(player.x, player.z, player.level, 'spinning', 25);

                if (!wheel) {
                    console.log(`[CraftingTask][${player.username}] No spinning wheel found — descending`);
                    this.failTicks++;
                    if (this.failTicks >= FAIL_LIMIT) {
                        this.p1State = 'descend';
                        this.failTicks = 0;
                    }
                    return;
                }

                // Find raw wool slot
                const inv = player.getInventory(InvType.INV);
                if (!inv) return;
                let woolSlot = -1;
                for (let i = 0; i < inv.capacity; i++) {
                    if (inv.get(i)?.id === Items.WOOL) {
                        woolSlot = i;
                        break;
                    }
                }
                if (woolSlot === -1) {
                    this.p1State = 'descend';
                    return;
                }

                const ok = interactUseLocOp(player, wheel, Items.WOOL, woolSlot);
                if (ok) {
                    // Manual XP tracking to drive ProgressWatchdog
                    // (RuneScript handles actual stat_advance server-side)
                    player.stats[PlayerStat.CRAFTING] += this.step.xpPerAction;
                    this.watchdog.notifyActivity();
                    this.failTicks = 0;
                    this.cooldown = randInt(3, 6);
                } else {
                    this.failTicks++;
                    if (this.failTicks >= FAIL_LIMIT) {
                        this.p1State = 'descend';
                        this.failTicks = 0;
                    }
                }
                return;
            }

            // ── teleJump back to ground floor (outside castle) ────────────────
            case 'descend': {
                // Land outside the castle so the bot can walk freely to the bank
                // without navigating back through the castle door.
                const [ax, az, al] = Locations.LUMBRIDGE_CASTLE_APPROACH;
                botTeleport(player, ax, az, al);
                this.p1State = 'bank_walk';
                return;
            }

            // ── Walk to nearest ground-floor bank ─────────────────────────────
            case 'bank_walk': {
                const result = advanceBankWalk(player, this.stuck);
                if (result === 'walk') return;
                this.cooldown = result === 'ready' ? 3 : 0;
                this.p1State = 'bank';
                return;
            }

            // ── Deposit wool, loop back ───────────────────────────────────────
            case 'bank': {
                this._depositWool(player);
                this.p1State = 'shear_walk';
                return;
            }
        }
    }

    // ── Phase 2: gold ring crafting ───────────────────────────────────────────

    private _tickPhase2(player: Player): void {
        switch (this.p2State) {
            // ── Walk to nearest bank ──────────────────────────────────────────
            case 'bank_walk': {
                const result = advanceBankWalk(player, this.stuck);
                if (result === 'walk') return;
                this.cooldown = result === 'ready' ? 3 : 0;
                this.p2State = 'withdraw';
                return;
            }

            // ── Deposit rings, withdraw gold bars ─────────────────────────────
            case 'withdraw': {
                this._depositRings(player);

                if (!hasItem(player, Items.RING_MOULD)) {
                    console.log(`[CraftingTask][${player.username}] No ring mould — done`);
                    this.done = true;
                    this.interrupt();
                    return;
                }

                const withdrew = this._withdrawGoldBars(player);
                if (!withdrew) {
                    console.log(`[CraftingTask][${player.username}] No gold bars — done`);
                    this.done = true;
                    this.interrupt();
                    return;
                }

                this.p2State = 'furnace_walk';
                this.cooldown = 1;
                return;
            }

            // ── Walk to furnace ───────────────────────────────────────────────
            case 'furnace_walk': {
                const [lx, lz, ll] = this.step.location;
                if (!isNear(player, lx, lz, 3, ll)) {
                    this._stuckWalk(player, lx, lz);
                    return;
                }
                this.p2State = 'craft';
                this.failTicks = 0;
                return;
            }

            // ── Use gold bar on furnace ───────────────────────────────────────
            case 'craft': {
                if (!this._hasGoldBarsInInventory(player)) {
                    this.p2State = 'bank_return';
                    return;
                }

                const [lx, lz] = this.step.location;
                const furnace = findLocByPrefix(player.x, player.z, player.level, 'furnace', 15) ?? findLocByName(player.x, player.z, player.level, 'furnace', 15);

                if (!furnace) {
                    this._stuckWalk(player, lx, lz);
                    return;
                }

                // Find gold bar slot
                const inv = player.getInventory(InvType.INV);
                if (!inv) return;
                let barSlot = -1;
                for (let i = 0; i < inv.capacity; i++) {
                    if (inv.get(i)?.id === Items.GOLD_BAR) {
                        barSlot = i;
                        break;
                    }
                }
                if (barSlot === -1) {
                    this.p2State = 'bank_return';
                    return;
                }

                const ok = interactUseLocOp(player, furnace, Items.GOLD_BAR, barSlot);
                if (ok) {
                    // Manual XP tracking (RuneScript handles actual stat_advance)
                    player.stats[PlayerStat.CRAFTING] += this.step.xpPerAction;
                    this.watchdog.notifyActivity();
                    this.failTicks = 0;
                    this.cooldown = randInt(4, 8);
                } else {
                    this.failTicks++;
                    if (this.failTicks >= FAIL_LIMIT) {
                        this.p2State = 'bank_return';
                        this.failTicks = 0;
                    } else {
                        this.cooldown = 1;
                    }
                }
                return;
            }

            // ── Return to bank and loop ───────────────────────────────────────
            case 'bank_return': {
                const result = advanceBankWalk(player, this.stuck);
                if (result === 'walk') return;
                this.cooldown = result === 'ready' ? 3 : 0;
                this.p2State = 'withdraw';
                return;
            }
        }
    }

    // ── Inventory helpers ─────────────────────────────────────────────────────

    private _hasGoldBarsAnywhere(player: Player): boolean {
        if (countItem(player, Items.GOLD_BAR) > 0) return true;
        const bid = bankInvId();
        if (bid === -1) return false;
        const bank = player.getInventory(bid);
        if (!bank) return false;
        for (let i = 0; i < bank.capacity; i++) {
            if (bank.get(i)?.id === Items.GOLD_BAR) return true;
        }
        return false;
    }

    private _hasGoldBarsInInventory(player: Player): boolean {
        return countItem(player, Items.GOLD_BAR) > 0;
    }

    /** Withdraw up to 27 gold bars (leave 1 slot free for the ring_mould). */
    private _withdrawGoldBars(player: Player): boolean {
        const bid = bankInvId();
        if (bid === -1) return false;
        const bank = player.getInventory(bid);
        const inv = player.getInventory(InvType.INV);
        if (!bank || !inv) return false;

        for (let i = 0; i < bank.capacity; i++) {
            const item = bank.get(i);
            if (!item || item.id !== Items.GOLD_BAR) continue;
            const toWithdraw = Math.min(item.count, 27); // 1 slot reserved for ring_mould
            const moved = bank.remove(Items.GOLD_BAR, toWithdraw);
            if (moved.completed > 0) {
                inv.add(Items.GOLD_BAR, moved.completed);
                return true;
            }
        }
        // Already has bars in inventory
        return countItem(player, Items.GOLD_BAR) > 0;
    }

    /** Deposit ball_of_wool (and any leftover raw wool); keep shears and coins. */
    private _depositWool(player: Player): void {
        const bid = bankInvId();
        if (bid === -1) return;
        const bank = player.getInventory(bid);
        const inv = player.getInventory(InvType.INV);
        if (!bank || !inv) return;

        const keepIds = new Set<number>([Items.SHEARS, Items.COINS]);
        for (let slot = 0; slot < inv.capacity; slot++) {
            const item = inv.get(slot);
            if (!item || keepIds.has(item.id)) continue;
            const moved = inv.remove(item.id, item.count);
            if (moved.completed > 0) bank.add(item.id, moved.completed);
        }
    }

    /** Deposit gold rings (and anything else not needed); keep ring_mould, gold bars, coins. */
    private _depositRings(player: Player): void {
        const bid = bankInvId();
        if (bid === -1) return;
        const bank = player.getInventory(bid);
        const inv = player.getInventory(InvType.INV);
        if (!bank || !inv) return;

        const keepIds = new Set<number>([Items.COINS, Items.RING_MOULD, Items.GOLD_BAR]);
        for (let slot = 0; slot < inv.capacity; slot++) {
            const item = inv.get(slot);
            if (!item || keepIds.has(item.id)) continue;
            const moved = inv.remove(item.id, item.count);
            if (moved.completed > 0) bank.add(item.id, moved.completed);
        }
    }

    // ── Movement helper ───────────────────────────────────────────────────────

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
        if (openNearbyGate(player, 8)) return;
        walkTo(player, player.x + randInt(-10, 10), player.z + randInt(-10, 10));
    }
}
