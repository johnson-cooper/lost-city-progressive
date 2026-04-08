/**
 * FishingTask.ts — Fish at spots, bank when full, progression-aware fishing loop.
 */

import {
    BotTask, Player, Npc, InvType,
    walkTo, interactNpc, interactNpcOp,
    findNpcBySuffix, findNpcByPrefix,
    hasItem, countItem, isInventoryFull, isNear,
    getBaseLevel, PlayerStat,
    Items, Locations, getProgressionStep,
    teleportToSafety, teleportNear, randInt, bankInvId, INTERACT_TIMEOUT,
    StuckDetector, ProgressWatchdog,
    openNearbyGate, botJitter,
} from '#/engine/bot/tasks/BotTaskBase.js';
import type { SkillStep } from '#/engine/bot/tasks/BotTaskBase.js';

export class FishingTask extends BotTask {
    private step: SkillStep;

    private state: 'walk' | 'approach' | 'scan' | 'interact' | 'bank_walk' | 'bank_done' = 'walk';

    private interactTicks = 0;
    private lastXp = 0;
    private scanFailTicks = 0;
    private approachTicks = 0;

    private currentSpot: Npc | null = null;

    private readonly stuck = new StuckDetector(30, 4, 2);
    private readonly watchdog = new ProgressWatchdog();

    constructor(step: SkillStep) {
        super('Fish');
        this.step = step;
    }

    shouldRun(player: Player): boolean {
        return this.step.toolItemIds.every(id => hasItem(player, id));
    }

    tick(player: Player): void {
        if (this.interrupted) return;

        const banking = this.state === 'bank_walk' || this.state === 'bank_done';
        if (this.watchdog.check(player, banking)) { this.interrupt(); return; }

        if (this.cooldown > 0) {
            this.cooldown--;
            return;
        }

        // ── Progression upgrade ─────────────────────────────────────────────
        const level = getBaseLevel(player, PlayerStat.FISHING);
        const newStep = getProgressionStep('FISHING', level);

        if (newStep && newStep.minLevel > this.step.minLevel) {
            this.step = newStep;
            this.state = 'walk';
            this.currentSpot = null;
        }

        // ── Bank flow ────────────────────────────────────────────────────────
        if (this.state === 'bank_walk') {
            const [bx, bz] = Locations.DRAYNOR_BANK;

            if (!isNear(player, bx, bz, 8)) {
                this._stuckWalk(player, bx, bz);
                return;
            }

            const banker = findNpcByPrefix(player.x, player.z, player.level, 'banker', 10);
            if (!banker) {
                walkTo(player, bx, bz);
                return;
            }

            interactNpcOp(player, banker, 3);
            this.cooldown = 4;
            this.state = 'bank_done';
            return;
        }

        if (this.state === 'bank_done') {
            this._depositFish(player);
            this.state = 'walk';
            this.cooldown = 3;
            return;
        }

        if (isInventoryFull(player)) {
            this.state = 'bank_walk';
            return;
        }

        // ── Consumable check ────────────────────────────────────────────────
        if (this.step.itemConsumed && !hasItem(player, this.step.itemConsumed)) {
            this.state = 'bank_walk';
            return;
        }

        // ── Walk to fishing zone ─────────────────────────────────────────────
        if (this.state === 'walk') {
            const [lx, lz, ll] = this.step.location;

            if (!isNear(player, lx, lz, 15, ll)) {
                const [jx, jz] = botJitter(player, lx, lz, 5);
                this._stuckWalk(player, jx, jz);
                return;
            }

            this.state = 'approach';
            return;
        }

        // ── Approach fishing spot ────────────────────────────────────────────
        if (this.state === 'approach') {
            const spot = this._findFishSpot(player);

            if (!spot) {
                this.scanFailTicks++;

                if (this.scanFailTicks > 10) {
                    const [lx, lz] = this.step.location;
                    walkTo(player, lx + randInt(-4, 4), lz + randInt(-4, 4));
                    this.scanFailTicks = 0;
                }
                return;
            }

            this.scanFailTicks = 0;
            this.currentSpot = spot;

            // move into range before interacting (important stability fix)
            if (!isNear(player, spot.x, spot.z, 2)) {
                this.approachTicks++;
                walkTo(player, spot.x, spot.z);

                if (this.approachTicks > 25) {
                    this.currentSpot = null;
                    this.approachTicks = 0;
                }
                return;
            }

            this.state = 'scan';
            this.approachTicks = 0;
            return;
        }

        // ── Scan / engage spot ───────────────────────────────────────────────
        if (this.state === 'scan') {
            if (!this.currentSpot) {
                this.state = 'approach';
                return;
            }

            this._interact(player, this.currentSpot);
            this.state = 'interact';
            this.interactTicks = 0;
            this.lastXp = player.stats[PlayerStat.FISHING];
            return;
        }

        // ── Fishing loop ─────────────────────────────────────────────────────
        if (this.state === 'interact') {
            this.interactTicks++;

            if (player.stats[PlayerStat.FISHING] > this.lastXp) {
                this.lastXp = player.stats[PlayerStat.FISHING];
                this.interactTicks = 0;
                this.watchdog.notifyActivity();
                return;
            }

            if (this.interactTicks >= INTERACT_TIMEOUT) {
                this.state = 'approach';
                this.currentSpot = null;
                this.interactTicks = 0;
            }

            // mid-fish depletion
            if (this.step.itemConsumed && !hasItem(player, this.step.itemConsumed)) {
                this.state = 'bank_walk';
            }
        }
    }

    isComplete(_p: Player): boolean {
        return false;
    }

    override reset(): void {
        super.reset();
        this.state = 'walk';
        this.interactTicks = 0;
        this.scanFailTicks = 0;
        this.approachTicks = 0;
        this.lastXp = 0;
        this.currentSpot = null;
        this.stuck.reset();
        this.watchdog.reset();
    }

    // ── Spot detection ───────────────────────────────────────────────────────

    private _findFishSpot(player: Player): Npc | null {
        const isFreshwater =
            this.step.itemGained === Items.RAW_TROUT ||
            this.step.itemGained === Items.RAW_SALMON;

        const suffix = isFreshwater ? '_freshfish' : '_saltfish';

        return findNpcBySuffix(player.x, player.z, player.level, suffix, 20);
    }

    private _interact(player: Player, spot: Npc): void {
        const useOp3 =
            this.step.itemConsumed === Items.FISHING_BAIT ||
            this.step.itemGained === Items.RAW_LOBSTER ||
            this.step.itemGained === Items.RAW_SWORDFISH;

        if (useOp3) interactNpcOp(player, spot, 3);
        else interactNpc(player, spot);
    }

    // ── Banking ──────────────────────────────────────────────────────────────

    private _depositFish(player: Player): void {
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
             console.log(`[FSH:${player.username}] Deposited fish into the bank.`);
        }

    }

    // ── Stuck handling (WC-style upgrade) ────────────────────────────────────

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

        const dx = lx - player.x;
        const dz = lz - player.z;

        const escX =
            player.x +
            (Math.abs(dz) > Math.abs(dx)
                ? randInt(-10, 10)
                : dz > 0
                    ? 10
                    : -10);

        const escZ =
            player.z +
            (Math.abs(dx) > Math.abs(dz)
                ? randInt(-10, 10)
                : dx > 0
                    ? 10
                    : -10);

        walkTo(player, escX, escZ);
    }
}