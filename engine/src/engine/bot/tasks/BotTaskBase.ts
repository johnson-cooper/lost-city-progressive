/**
 * BotTaskBase.ts
 *
 * Shared imports, helpers, constants, and the abstract BotTask base class.
 * All task files import from here.
 */

import Player from '#/engine/entity/Player.js';
import Npc from '#/engine/entity/Npc.js';
import Loc from '#/engine/entity/Loc.js';
import InvType from '#/cache/config/InvType.js';
import { Inventory } from '#/engine/Inventory.js';
import {
    walkTo,
    interactNpc,
    interactNpcOp,
    interactLoc,
    interactLocOp,
    interactUseLocOp,
    interactUseObjNpcOp,
    botInteractUseObjNpc,
    findNpcByName,
    findNpcByNameExcluding,
    findNpcByPrefix,
    findNpcBySuffix,
    findLocByPrefix,
    findLocByName,
    hasItem,
    countItem,
    addItem,
    removeItem,
    isInventoryFull,
    getBaseLevel,
    PlayerStat,
    hasWaypoints,
    addXp,
    setCombatStyle,
    setAutocastWindStrike,
    openNearbyGate,
    isAdjacentToLoc,
    botTeleport
} from '#/engine/bot/BotAction.js';
import { Items, Shops, Locations, getProgressionStep, GRIMY_HERB_MAP, FOOD_IDS } from '#/engine/bot/BotKnowledge.js';
import { isMapBlocked, isZoneAllocated } from '#/engine/GameMap.js';
import type { SkillStep } from '#/engine/bot/BotKnowledge.js';
import { getMissingPurchases, STARTING_COINS } from '#/engine/bot/BotNeeds.js';
import type { Purchase } from '#/engine/bot/BotNeeds.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Ticks before assuming an interaction failed (no XP / no response). */
export const INTERACT_TIMEOUT = 20;

/** Teleport destination when a bot is hopelessly stuck. */
const SAFE_SPAWN: [number, number, number] = Locations.LUMBRIDGE_SPAWN;

// ── Helpers ───────────────────────────────────────────────────────────────────

export function randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function isNear(player: Player, x: number, z: number, dist: number, level = 0): boolean {
    return player.level === level && Math.abs(player.x - x) <= dist && Math.abs(player.z - z) <= dist;
}

/** Returns the bank inventory ID, or -1 if not loaded. */
export function bankInvId(): number {
    try {
        return InvType.getId('bank');
    } catch {
        return -1;
    }
}

/**
 * Teleport bot to Lumbridge spawn — used when stuck with no path forward.
 * Plays the magic teleport animation so other players see the cast effect.
 */
export function teleportToSafety(player: Player): void {
    const [x, z, level] = SAFE_SPAWN;
    botTeleport(player, x, z, level);
}

/**
 * Teleport bot directly to (x, z) on the same floor.
 * Used when pathfinding consistently fails and the bot must skip to its destination.
 * Plays the magic teleport animation so other players see the cast effect.
 */
export function teleportNear(player: Player, x: number, z: number): void {
    botTeleport(player, x, z, player.level);
}

/**
 * Return a stable per-bot jitter offset so different bots spread around a
 * shared destination instead of all walking to the exact same tile.
 *
 * Uses the player's slot number as a deterministic seed so the offset is
 * consistent for each bot across ticks (no per-tick re-randomisation).
 *
 * @param radius  Maximum tile offset in each axis (default 5).
 */
// ── Nearest-bank helper ───────────────────────────────────────────────────────

/**
 * All bot-accessible banks on the ground floor.
 * Lumbridge castle 2nd-floor bank is intentionally excluded — bots don't
 * climb stairs.  Al Kharid bank is included; the GATEWAY_REGIONS routing in
 * walkTo handles the gate automatically.
 */
const BOT_BANKS: ReadonlyArray<[number, number, number]> = [
    Locations.DRAYNOR_BANK,
    Locations.VARROCK_WEST_BANK,
    Locations.VARROCK_EAST_BANK,
    Locations.AL_KHARID_BANK,
    Locations.FALADOR_WEST_BANK,
    Locations.FALADOR_EAST_BANK,
    Locations.SEERS_BANK,
    Locations.EDGEVILLE_BANK,
    Locations.YANILLE_BANK,
    Locations.CATHERBY_BANK,
    Locations.ARDOUGNE_NORTH_BANK,
    Locations.ARDOUGNE_SOUTH_BANK
];

/**
 * Returns the [x, z, level] tuple of the bank closest to the player's
 * current tile, using Chebyshev distance.  Tasks should call this once
 * per banking state entry rather than hard-coding a single bank.
 */
export function nearestBank(player: Player): [number, number, number] {
    let best = BOT_BANKS[0];
    let bestDist = Number.MAX_SAFE_INTEGER;
    for (const bank of BOT_BANKS) {
        const dist = Math.max(Math.abs(player.x - bank[0]), Math.abs(player.z - bank[1]));
        if (dist < bestDist) {
            bestDist = dist;
            best = bank;
        }
    }
    return best;
}

// ── botJitter ─────────────────────────────────────────────────────────────────

/**
 * Prime-pair seeds used by botJitter's fallback sequence.
 * Each entry produces a different (jx, jz) spread for the same slot number.
 * Keeping them here as a constant avoids re-allocating the array every tick.
 */
const JITTER_SEEDS: ReadonlyArray<[mx: number, mz: number, bx: number, bz: number]> = [
    [7, 13, 3, 7],
    [11, 17, 5, 11],
    [19, 23, 7, 13],
    [29, 31, 11, 17],
    [37, 41, 13, 19]
];

export function botJitter(player: Player, x: number, z: number, radius = 5): [number, number] {
    const slot = (player as any).slot ?? 0;
    const level = player.level;
    const span = radius * 2 + 1;

    // Try each deterministic seed in order until we land on a walkable tile.
    // Using the slot as the hash input keeps the result stable across ticks
    // (same bot always gets the same jittered destination for a given area).
    for (const [mx, mz, bx, bz] of JITTER_SEEDS) {
        const tx = x + ((slot * mx + bx) % span) - radius;
        const tz = z + ((slot * mz + bz) % span) - radius;
        if (isZoneAllocated(level, tx, tz) && !isMapBlocked(tx, tz, level)) {
            return [tx, tz];
        }
    }

    // All offsets are blocked — return the base tile unchanged
    return [x, z];
}

// ── Abstract base ─────────────────────────────────────────────────────────────

export abstract class BotTask {
    readonly name: string;
    interrupted = false;
    protected cooldown = 0;
    protected rescanTimer = 0;

    protected constructor(name: string) {
        this.name = name;
    }

    abstract shouldRun(player: Player): boolean;
    abstract tick(player: Player): void;
    abstract isComplete(player: Player): boolean;

    interrupt(): void {
        this.interrupted = true;
    }
    reset(): void {
        this.interrupted = false;
        this.cooldown = 0;
        this.rescanTimer = 0;
    }
}

// Re-export everything tasks need so they only import from this one file
export type { SkillStep } from '#/engine/bot/BotKnowledge.js';
export {
    Player,
    Npc,
    Loc,
    InvType,
    Inventory,
    walkTo,
    interactNpc,
    interactNpcOp,
    interactLoc,
    interactLocOp,
    interactUseLocOp,
    findNpcByName,
    findNpcByPrefix,
    findNpcBySuffix,
    findLocByPrefix,
    findLocByName,
    hasItem,
    countItem,
    addItem,
    removeItem,
    isInventoryFull,
    getBaseLevel,
    PlayerStat,
    hasWaypoints,
    addXp,
    setCombatStyle,
    setAutocastWindStrike,
    Items,
    Shops,
    Locations,
    getProgressionStep,
    FOOD_IDS,
    getMissingPurchases,
    STARTING_COINS,
    openNearbyGate,
    isAdjacentToLoc,
    interactUseObjNpcOp,
    botInteractUseObjNpc,
    findNpcByNameExcluding,
    botTeleport
};

// ── Shared banking helper ─────────────────────────────────────────────────────

/**
 * Drives the 'bank_walk' state for any gathering task.
 *
 * Priority order:
 *   1. Bank booth (bankbooth loc, op2 = Use-quickly → @openbank immediately, no dialog).
 *      Works at ALL banks.  Avoids NPC name ambiguity entirely.
 *   2. Banker NPC by prefix 'banker' (Lumbridge 2nd floor, Draynor, Varrock…).
 *   3. Banker NPC by prefix 'kharidbanker' (Al Kharid — debug name starts with 'kharid').
 *   4. Direct fallback: no interactive entity found but bot is already at the bank
 *      tile — proceed to deposit anyway (deposit functions work directly on
 *      inventory objects and do NOT require the bank UI to be open).
 *
 * Returns:
 *   'walk'   — still navigating, caller should return for this tick
 *   'ready'  — interaction queued (or fallback triggered), set cooldown + state
 *   'direct' — fallback: skip interaction, deposit immediately
 */
export function advanceBankWalk(player: Player, stuckDetector: StuckDetector): 'walk' | 'ready' | 'direct' {
    const [bx, bz] = nearestBank(player);

    if (!isNear(player, bx, bz, 3)) {
        // Still walking — drive bot all the way to the bank coord (which should be
        // inside the building) before the booth search activates.
        if (!stuckDetector.check(player, bx, bz)) {
            walkTo(player, bx, bz);
        } else if (stuckDetector.desperatelyStuck) {
            teleportNear(player, bx, bz);
            stuckDetector.reset();
        } else {
            walkTo(player, bx + randInt(-4, 4), bz + randInt(-4, 4));
        }
        return 'walk';
    }

    // ── At bank (inside): try booth first ────────────────────────────────────
    // Search radius 6 — large enough to find booths across the floor but small
    // enough not to reach through the walls of the building from outside.
    // The bot is already at the interior coord so no wall-pierce is possible.
    const booth = findLocByName(player.x, player.z, player.level, 'bankbooth', 6);
    if (booth) {
        if (!isNear(player, booth.x, booth.z, 1)) {
            walkTo(player, booth.x, booth.z);
            return 'walk';
        }
        interactLocOp(player, booth, 2); // op2 = Use-quickly → @openbank, no dialog
        return 'ready';
    }

    // ── Fallback: banker NPC ──────────────────────────────────────────────────
    // Al Kharid bankers have debug names starting with 'kharidbanker', not 'banker'.
    const banker = findNpcByPrefix(player.x, player.z, player.level, 'banker', 10) ?? findNpcByPrefix(player.x, player.z, player.level, 'kharidbanker', 10);
    if (banker) {
        if (!isNear(player, banker.x, banker.z, 3)) {
            walkTo(player, banker.x, banker.z);
            return 'walk';
        }
        interactNpcOp(player, banker, 3); // op3 = Bank on standard bankers
        return 'ready';
    }

    // ── Ultimate fallback: deposit without UI interaction ─────────────────────
    // Deposit functions use player.getInventory(bankInvId()) directly — no open
    // bank UI required.  Only reached if no booth or NPC is visible.
    return 'direct';
}

// ── StuckDetector ─────────────────────────────────────────────────────────────

/**
 * Detects both stationary AND oscillating bots.
 *
 * Every WINDOW ticks, compares current distance-to-destination against the
 * snapshot taken WINDOW ticks ago. If the bot hasn't closed the gap by at
 * least MIN_PROGRESS tiles, it's considered stuck — regardless of whether it
 * was stationary or bouncing back and forth.
 */
export class StuckDetector {
    private readonly window: number;
    private readonly minProgress: number;

    private ticks = 0;
    private snapshotDist = -1;
    private escapeCount = 0;

    private readonly escapeLimit: number;

    /**
     * @param windowTicks       How many ticks between progress checks
     * @param minProgressTiles  Minimum tiles of progress required per window
     * @param escapeLimit       Consecutive failed escape attempts before desperatelyStuck (default 3)
     */
    constructor(windowTicks = 40, minProgressTiles = 5, escapeLimit = 3) {
        this.window = windowTicks;
        this.minProgress = minProgressTiles;
        this.escapeLimit = escapeLimit;
    }

    /**
     * Call once per walk tick. Returns true when the bot is stuck.
     */
    check(player: { x: number; z: number }, destX: number, destZ: number): boolean {
        const dist = Math.abs(player.x - destX) + Math.abs(player.z - destZ);

        if (++this.ticks < this.window) return false;
        this.ticks = 0;

        if (this.snapshotDist < 0) {
            this.snapshotDist = dist;
            return false;
        }

        const progress = this.snapshotDist - dist;
        this.snapshotDist = dist;

        if (progress < this.minProgress) {
            this.escapeCount++;
            return true;
        }
        this.escapeCount = 0;
        return false;
    }

    /** True after escapeLimit+ failed escapes — teleport rather than detour. */
    get desperatelyStuck(): boolean {
        return this.escapeCount >= this.escapeLimit;
    }

    reset(): void {
        this.ticks = 0;
        this.snapshotDist = -1;
        this.escapeCount = 0;
    }
}

// ── ProgressWatchdog ──────────────────────────────────────────────────────────

/**
 * XP-stall watchdog — measures real progress by XP gain, not by position.
 *
 * Counts ticks without a `notifyActivity()` call. If the stall exceeds the
 * limit the bot is teleported to safety. Banking states can be paused so a
 * legitimate bank trip doesn't trigger a false rescue.
 *
 * Usage in a task's tick():
 *   const banking = this.state === 'bank_walk' || this.state === 'bank_done';
 *   if (this.watchdog.check(player, banking)) { this.reset(); return; }
 *
 * When XP is gained:
 *   this.watchdog.notifyActivity();
 *
 * Why position-based detection doesn't work:
 *   A bot oscillating between (3210,3198) and (3230,3194) moves ~24 tiles
 *   every window, always appearing to make progress.
 */
export class ProgressWatchdog {
    private readonly limit: number;
    private stallTicks = 0;

    /**
     * @param stallTickLimit  Ticks without XP before teleport (default 400 ≈ 4 min).
     *                        Generous enough to cover long walks (Barbarian Village,
     *                        Karamja ship travel), but catches indefinite oscillation.
     */
    constructor(stallTickLimit = 200) {
        this.limit = stallTickLimit;
    }

    /** Call when XP was gained. Resets the stall counter. */
    notifyActivity(): void {
        this.stallTicks = 0;
    }

    /**
     * Call every tick. Pass `paused=true` when the task is in a banking state
     * to avoid triggering during legitimate bank trips.
     *
     * Returns true if the bot was teleported (task should call reset() and return).
     */
    check(player: Player, paused = false): boolean {
        if (paused) return false;
        if (++this.stallTicks < this.limit) return false;
        teleportToSafety(player);
        this.reset();
        return true;
    }

    reset(): void {
        this.stallTicks = 0;
    }
}

/**
 * Cleans any grimy herbs in the player's inventory and awards Herblore XP.
 * Call this just before banking so cleaned herbs are banked instead of grimy ones.
 */
export function cleanGrimyHerbs(player: Player): void {
    const inv = player.getInventory(InvType.INV);
    if (!inv) return;
    for (let slot = 0; slot < inv.capacity; slot++) {
        const item = inv.get(slot);
        if (!item) continue;
        const entry = GRIMY_HERB_MAP[item.id];
        if (!entry) continue;
        const [cleanId, xp] = entry;
        const removed = inv.remove(item.id, item.count);
        if (removed.completed > 0) {
            inv.add(cleanId, removed.completed);
            addXp(player, PlayerStat.HERBLORE, xp * removed.completed);
        }
    }
}
