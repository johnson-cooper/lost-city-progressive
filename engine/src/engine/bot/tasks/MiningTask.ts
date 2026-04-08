/**
 * MiningTask.ts — Mine rocks, bank ore, progress through tiers.
 */

import {
    BotTask, Player, Loc, InvType,
    walkTo, interactLoc, interactNpcOp,
    findLocByPrefix, findNpcByPrefix,
    hasItem, isInventoryFull, isNear,
    getBaseLevel, PlayerStat,
    Items, Locations, getProgressionStep,
    teleportToSafety, teleportNear, randInt, bankInvId,
    INTERACT_TIMEOUT, StuckDetector, ProgressWatchdog,
    openNearbyGate, botJitter, nearestBank,
} from '#/engine/bot/tasks/BotTaskBase.js';
import type { SkillStep } from '#/engine/bot/tasks/BotTaskBase.js';

export class MiningTask extends BotTask {
    private step: SkillStep;

    private state: 'walk' | 'approach' | 'scan' | 'interact' | 'bank_walk' | 'bank_done' = 'walk';

    private interactTicks = 0;
    private lastXp = 0;
    private scanFailTicks = 0;
    private approachTicks = 0;

    private currentRock: Loc | null = null;

    private readonly stuck = new StuckDetector(30, 4, 2);
    private readonly watchdog = new ProgressWatchdog();

    constructor(step: SkillStep) {
        super('Mine');
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
        const level = getBaseLevel(player, PlayerStat.MINING);
        const newStep = getProgressionStep('MINING', level);

        if (newStep && newStep.minLevel > this.step.minLevel) {
            this.step = newStep;
            this.state = 'walk';
            this.currentRock = null;
        }

        // ── Banking ──────────────────────────────────────────────────────────
        if (this.state === 'bank_walk') {
            const [bx, bz] = nearestBank(player);

            if (!isNear(player, bx, bz, 8)) {
                this._stuckWalk(player, bx, bz);
                return;
            }

            const banker = findNpcByPrefix(player.x, player.z, player.level, 'banker', 10);
            if (!banker) {
                walkTo(player, bx, bz);
                return;
            }
            // Walk close to the banker first — prevents the engine routing backward
            // around bank counters when setInteraction is called from 8+ tiles away.
            if (!isNear(player, banker.x, banker.z, 3)) { walkTo(player, banker.x, banker.z); return; }

            interactNpcOp(player, banker, 3);
            this.cooldown = 4;
            this.state = 'bank_done';
            return;
        }

        if (this.state === 'bank_done') {
            this._depositOre(player);
            this.state = 'walk';
            this.cooldown = 3;
            return;
        }

        if (isInventoryFull(player)) {
            this.state = 'bank_walk';
            return;
        }

        // ── Walk to mining area ─────────────────────────────────────────────
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

        // ── Approach rock ────────────────────────────────────────────────────
        if (this.state === 'approach') {
            const rock = this._findRock(player);

            if (!rock) {
                this.scanFailTicks++;

                if (this.scanFailTicks > 10) {
                    const [lx, lz] = this.step.location;
                    walkTo(player, lx + randInt(-3, 3), lz + randInt(-3, 3));
                    this.scanFailTicks = 0;
                }
                return;
            }

            this.scanFailTicks = 0;
            this.currentRock = rock;

            if (!isNear(player, rock.x, rock.z, 2)) {
                this.approachTicks++;
                walkTo(player, rock.x, rock.z);

                if (this.approachTicks > 25) {
                    this.currentRock = null;
                    this.approachTicks = 0;
                }
                return;
            }

            this.state = 'scan';
            this.approachTicks = 0;
            return;
        }

        // ── Start mining ─────────────────────────────────────────────────────
        if (this.state === 'scan') {
            if (!this.currentRock) {
                this.state = 'approach';
                return;
            }

            interactLoc(player, this.currentRock);

            this.state = 'interact';
            this.interactTicks = 0;
            this.lastXp = player.stats[PlayerStat.MINING];
            return;
        }

        // ── Mining loop ──────────────────────────────────────────────────────
        if (this.state === 'interact') {
            this.interactTicks++;

            if (player.stats[PlayerStat.MINING] > this.lastXp) {
                this.lastXp = player.stats[PlayerStat.MINING];
                this.interactTicks = 0;
                this.watchdog.notifyActivity();
                return;
            }

            if (this.interactTicks >= INTERACT_TIMEOUT) {
                this.state = 'approach';
                this.currentRock = null;
                this.interactTicks = 0;
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
        this.currentRock = null;
        this.stuck.reset();
        this.watchdog.reset();
    }

    // ── Rock search ────────────────────────────────────────────────────────

    private _findRock(player: Player): Loc | null {
        const ore = this.step.itemGained;

        const prefix =
            ore === Items.TIN_ORE ? 'tinrock' :
            ore === Items.IRON_ORE ? 'ironrock' :
            ore === Items.COAL ? 'coalrock' :
            ore === Items.MITHRIL_ORE ? 'mithrilrock' :
            'copperrock';

        return findLocByPrefix(player.x, player.z, player.level, prefix, 15, 'empty');
    }

    // ── Banking ─────────────────────────────────────────────────────────────

    private _depositOre(player: Player): void {
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
         console.log(`[MG:${player.username}] Deposited ORES into the bank.`);
    }

    // ── Stuck handling (WC-style upgrade) ──────────────────────────────────

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
                : dz > 0 ? 10 : -10);

        const escZ =
            player.z +
            (Math.abs(dx) > Math.abs(dz)
                ? randInt(-10, 10)
                : dx > 0 ? 10 : -10);

        walkTo(player, escX, escZ);
    }
}