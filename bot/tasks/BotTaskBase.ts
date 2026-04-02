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
    walkTo, interactNpc, interactNpcOp, interactLoc,
    findNpcByName, findNpcByPrefix, findNpcBySuffix, findLocByPrefix, findLocByName,
    hasItem, countItem, addItem, removeItem, isInventoryFull,
    getBaseLevel, PlayerStat, hasWaypoints,
    openNearbyGate, isAdjacentToLoc,
} from '#/engine/bot/BotAction.js';
import {
    Items, Shops, Locations,
    getProgressionStep,
} from '#/engine/bot/BotKnowledge.js';
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
    return player.level === level &&
           Math.abs(player.x - x) <= dist &&
           Math.abs(player.z - z) <= dist;
}

/** Returns the bank inventory ID, or -1 if not loaded. */
export function bankInvId(): number {
    try { return InvType.getId('bank'); } catch { return -1; }
}

/**
 * Teleport bot to Lumbridge spawn — used when stuck with no path forward.
 * Uses teleJump which sets tele=true so the client sees the position change.
 */
export function teleportToSafety(player: Player): void {
    const [x, z, level] = SAFE_SPAWN;
    player.teleJump(x, z, level);
}

/**
 * Teleport bot directly to (x, z) on the same floor.
 * Used when pathfinding consistently fails and the bot must skip to its destination.
 */
export function teleportNear(player: Player, x: number, z: number): void {
    player.teleJump(x, z, player.level);
}


// ── Abstract base ─────────────────────────────────────────────────────────────

export abstract class BotTask {
    readonly name: string;
    interrupted = false;
    protected cooldown = 0;

    protected constructor(name: string) { this.name = name; }

    abstract shouldRun(player: Player): boolean;
    abstract tick(player: Player): void;
    abstract isComplete(player: Player): boolean;

    interrupt(): void { this.interrupted = true; }
    reset(): void     { this.interrupted = false; this.cooldown = 0; }
}

// Re-export everything tasks need so they only import from this one file
export type { SkillStep } from '#/engine/bot/BotKnowledge.js';
export {
    Player, Npc, Loc, InvType, Inventory,
    walkTo, interactNpc, interactNpcOp, interactLoc,
    findNpcByName, findNpcByPrefix, findNpcBySuffix, findLocByPrefix, findLocByName,
    hasItem, countItem, addItem, removeItem, isInventoryFull,
    getBaseLevel, PlayerStat, hasWaypoints,
    Items, Shops, Locations, getProgressionStep,
    getMissingPurchases, STARTING_COINS,
    openNearbyGate, isAdjacentToLoc,
};

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
    get desperatelyStuck(): boolean { return this.escapeCount >= this.escapeLimit; }

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
    constructor(stallTickLimit = 400) {
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