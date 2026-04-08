/**
 * WoodcuttingTask.ts
 *
 * Chops trees using real engine loc interactions (APLOC1 = Chop down).
 * Progression: normal trees (level 1) → oaks (15) → willows (30) → yews (60).
 * Sells logs at Lumbridge General Store for coins to fund axe upgrades.
 *
 * Key behaviours:
 *   - PRE-WALKS adjacent to the tree before calling interactLoc().
 *     The engine clears interaction silently if the bot is not operable distance,
 *     so we must be touching the tree face before triggering it.
 *   - Excludes stumps ('treestump'.startsWith('tree') = true — no op1 script).
 *   - StuckDetector catches oscillation as well as stationary stuck.
 *   - Opens nearby fence gates automatically when stuck.
 *   - Level-up upgrades step and re-walks to new area.
 */

import LocType from '#/cache/config/LocType.js';
import {
    BotTask, Player, Loc, InvType,
    walkTo, interactLoc, interactNpcOp,
    findLocByPrefix, findNpcByName,
    hasItem, addItem, isInventoryFull, isNear,
    getBaseLevel, PlayerStat,
    Items, Locations, getProgressionStep,
    teleportToSafety, teleportNear, randInt, bankInvId, INTERACT_TIMEOUT, StuckDetector, ProgressWatchdog,
    isAdjacentToLoc, openNearbyGate, botJitter,
} from '#/engine/bot/tasks/BotTaskBase.js';
import type { SkillStep } from '#/engine/bot/tasks/BotTaskBase.js';
import { findNpcByPrefix } from './BotTaskBase.js';

export class WoodcuttingTask extends BotTask {
    private step: SkillStep;

    /**
     * State machine:
     *   walk      → walking to tree area
     *   approach  → found a tree, walking adjacent to it
     *   interact  → adjacent, interaction queued, waiting for XP
     *   bank_walk → walking to sell logs
     *   bank_done → logs sold, return to walk
     */
    private state: 'walk' | 'approach' | 'interact' | 'bank_walk' | 'bank_done' = 'walk';
    private interactTicks  = 0;
    private lastXp         = 0;
    private scanFailTicks  = 0;
    private approachTicks  = 0;   // ticks spent approaching a tree
    private currentTree:  Loc | null = null;
    private readonly stuck    = new StuckDetector(30, 4, 2);
    private readonly watchdog = new ProgressWatchdog();

    constructor(step: SkillStep) {
        super('Woodcut');
        this.step = step;
    }

    shouldRun(player: Player): boolean {
        return this.step.toolItemIds.every(id => hasItem(player, id));
    }

    tick(player: Player): void {
        if (this.interrupted) return;
        const banking = this.state === 'bank_walk' || this.state === 'bank_done';
        if (this.watchdog.check(player, banking)) { this.interrupt(); return; }
        if (this.cooldown > 0) { this.cooldown--; return; }

        // Upgrade step when level-up unlocks a better tree tier
        const level   = getBaseLevel(player, PlayerStat.WOODCUTTING);
        const newStep = getProgressionStep('WOODCUTTING', level);
        if (newStep && newStep.minLevel > this.step.minLevel) {
            this.step         = newStep;
            this.state        = 'walk';
            this.currentTree  = null;
        }

        // ── Sell logs at general store ────────────────────────────────────────
  if (this.state === 'bank_walk') {
            const [bx, bz] = Locations.DRAYNOR_BANK;
            if (!isNear(player, bx, bz, 8)) { this._stuckWalk(player, bx, bz); return; }
            const banker = findNpcByPrefix(player.x, player.z, player.level, 'banker', 10);
            if (!banker) { walkTo(player, bx, bz); return; }
            interactNpcOp(player, banker, 3);
            this.cooldown = 4; this.state = 'bank_done'; return;
        }

        if (this.state === 'bank_done') {
            this._depositLoot(player);
            this.state = 'walk'; this.cooldown = 3; return;
        }

        if (isInventoryFull(player)) { this.state = 'bank_walk'; return; }

        // ── Walk to tree area ─────────────────────────────────────────────────
        if (this.state === 'walk') {
            const [lx, lz, ll] = this.step.location;
            if (!isNear(player, lx, lz, 15, ll)) {
                const [jx, jz] = botJitter(player, lx, lz, 5);
                this._stuckWalk(player, jx, jz);
                return;
            }
            this.state = 'approach'; // arrived — now find and approach a tree
            return;
        }

        // ── Find tree and walk adjacent ───────────────────────────────────────
        if (this.state === 'approach') {
            // If we just became full, bank first
            if (isInventoryFull(player)) { this.state = 'bank_walk'; return; }

            // Drop stale reference if another player felled the tree
            if (this.currentTree && !this._isTreeStillValid(this.currentTree)) {
                this.currentTree   = null;
                this.approachTicks = 0;
            }

            const tree = this.currentTree ?? this._findTree(player);
            if (!tree) {
                this.scanFailTicks++;
                if (this.scanFailTicks === 1) {
                    console.log(`[WC:${player.username}] No '${this._treePrefix()}' tree near (${player.x},${player.z})`);
                }
                if (this.scanFailTicks > 10) {
                    // Wander within tree area and try again
                    const [lx, lz] = this.step.location;
                    walkTo(player, lx + randInt(-5, 5), lz + randInt(-5, 5));
                    this.scanFailTicks = 0;
                }
                return;
            }
            this.scanFailTicks = 0;
            this.currentTree   = tree;

            if (isAdjacentToLoc(player, tree)) {
                // Already adjacent — interact immediately
                console.log(`[WC:${player.username}] Adjacent to '${this._treePrefix()}' at (${tree.x},${tree.z}), interacting`);
                interactLoc(player, tree);
                this.state         = 'interact';
                this.interactTicks = 0;
                this.lastXp        = player.stats[PlayerStat.WOODCUTTING];
                this.approachTicks = 0;
            } else {
                // Walk to the tile directly adjacent to the tree's nearest face
                const [tx, tz] = this._approachTile(player, tree);
                walkTo(player, tx, tz);
                this.approachTicks++;
                if (this.approachTicks > 30) {
                    // Can't reach this tree — try another
                    console.log(`[WC:${player.username}] Can't reach tree at (${tree.x},${tree.z}), retrying`);
                    this.currentTree   = null;
                    this.approachTicks = 0;
                }
            }
            return;
        }

        // ── Chopping ──────────────────────────────────────────────────────────
        if (this.state === 'interact') {
            // Tree was felled mid-chop by another player — rescan immediately
            if (this.currentTree && !this._isTreeStillValid(this.currentTree)) {
                this.state        = 'approach';
                this.currentTree  = null;
                this.interactTicks = 0;
                return;
            }
            this.interactTicks++;

            if (player.stats[PlayerStat.WOODCUTTING] > this.lastXp) {
                console.log(`[WC:${player.username}] XP gained! total=${player.stats[PlayerStat.WOODCUTTING]}`);
                this.lastXp        = player.stats[PlayerStat.WOODCUTTING];
                this.interactTicks = 0;
                this.watchdog.notifyActivity();
                return;
            }

            if (this.interactTicks >= INTERACT_TIMEOUT) {
                // Tree depleted or interaction was cleared — find another
                console.log(`[WC:${player.username}] Interact timeout, rescanning`);
                this.state        = 'approach';
                this.currentTree  = null;
                this.interactTicks = 0;
            }
        }
    }

    isComplete(_p: Player): boolean { return false; }

    override reset(): void {
        super.reset();
        this.state         = 'walk';
        this.interactTicks = 0;
        this.scanFailTicks = 0;
        this.approachTicks = 0;
        this.lastXp        = 0;
        this.currentTree   = null;
        this.stuck.reset();
        this.watchdog.reset();
    }

    // ── Tree search ───────────────────────────────────────────────────────────

    private _findTree(player: Player): Loc | null {
        // 'treestump'.startsWith('tree') = true — must exclude stumps.
        // Stumps have no [oploc1] script so the woodcutting script silently fails.
        return findLocByPrefix(player.x, player.z, player.level, this._treePrefix(), 15, 'stump');
    }

    /**
     * Returns false if the stored tree reference has been replaced by a stump
     * (another player felled it while this bot was approaching or chopping).
     */
    private _isTreeStillValid(tree: Loc): boolean {
        const name = LocType.get(tree.type).debugname ?? '';
        return name.startsWith(this._treePrefix()) && !name.includes('stump');
    }

    private _treePrefix(): string {
        switch (this.step.itemGained) {
            case Items.OAK_LOGS:    return 'oaktree';
            case Items.WILLOW_LOGS: return 'willow_tree';
            case Items.MAPLE_LOGS:  return 'maple_tree';
            case Items.YEW_LOGS:    return 'yew_tree';
            default:                return 'tree';
        }
    }

    /**
     * Returns the tile the bot should walk to in order to be adjacent to the tree.
     * Picks the nearest face of the loc's bounding box, offset by 1 tile outward.
     */
    private _approachTile(player: Player, tree: Loc): [number, number] {
        // Tree occupies [tree.x .. tree.x+width-1] x [tree.z .. tree.z+length-1]
        const w = 2; const l = 2; // normal trees are always 2x2

        // Find closest point on the bounding box to the player
        const closestX = Math.max(tree.x, Math.min(player.x, tree.x + w - 1));
        const closestZ = Math.max(tree.z, Math.min(player.z, tree.z + l - 1));

        // Step 1 tile away from that point toward the player
        const dx = player.x - closestX;
        const dz = player.z - closestZ;

        if (Math.abs(dx) >= Math.abs(dz)) {
            return [closestX + Math.sign(dx), closestZ];
        } else {
            return [closestX, closestZ + Math.sign(dz)];
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
            if (moved.completed > 0) bank.add(item.id, moved.completed);
        }
            console.log(`[WC:${player.username}] Deposited logs into the bank.`);
    }


    // ── Stuck walk with gate opener ───────────────────────────────────────────

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
        if (openNearbyGate(player, 5)) return;

        const dx   = lx - player.x;
        const dz   = lz - player.z;
        const escX = player.x + (Math.abs(dz) > Math.abs(dx) ? randInt(-10, 10) : (dz > 0 ? 10 : -10));
        const escZ = player.z + (Math.abs(dx) > Math.abs(dz) ? randInt(-10, 10) : (dx > 0 ? 10 : -10));
        walkTo(player, escX, escZ);
    }
}
