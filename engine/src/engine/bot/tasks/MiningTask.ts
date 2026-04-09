/**
 * MiningTask.ts — Mine rocks, bank ore, progress through tiers.
 */

import {
    BotTask, Player, Loc, InvType,
    walkTo, interactLoc,
    findLocByPrefix,
    hasItem, isInventoryFull, isNear,
    getBaseLevel, PlayerStat,
    Items, Locations, getProgressionStep,
    teleportToSafety, teleportNear, randInt, bankInvId,
    INTERACT_TIMEOUT, StuckDetector, ProgressWatchdog,
    openNearbyGate, botJitter, advanceBankWalk,
} from '#/engine/bot/tasks/BotTaskBase.js';
import type { SkillStep } from '#/engine/bot/tasks/BotTaskBase.js';
import { getNpcCombatLevel, findAggressorNpc } from '#/engine/bot/BotAction.js';

export class MiningTask extends BotTask {
    private step: SkillStep;

    private state: 'walk' | 'approach' | 'scan' | 'interact' | 'flee' | 'bank_walk' | 'bank_done' = 'walk';

    private interactTicks = 0;
    private lastXp = 0;
    private scanFailTicks = 0;
    private approachTicks = 0;
    private fleeTicks = 0;
    private readonly FLEE_TICKS = 12;

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

        // ── Aggressor detection ─────────────────────────────────────────────
        if (this.state !== 'bank_walk' && this.state !== 'bank_done' && this.state !== 'flee') {
            const aggressor = findAggressorNpc(player, 8);
            if (aggressor) {
                const npcLvl = getNpcCombatLevel(aggressor);
                if (npcLvl > player.combatLevel) {
                    this.state = 'flee';
                    this.fleeTicks = 0;
                    this.currentRock = null;
                    return;
                }
            }
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
            const result = advanceBankWalk(player, this.stuck);
            if (result === 'walk') return;
            this.cooldown = result === 'ready' ? 3 : 0;
            this.state = 'bank_done';
            return;
        }

        if (this.state === 'bank_done') {
            this._depositOre(player);
            this._rerollStep(player); // re-randomise rock location for the next run
            this.state = 'walk';
            this.cooldown = 3;
            return;
        }

        if (isInventoryFull(player)) {
            this.state = 'bank_walk';
            return;
        }

        // ── Flee ──────────────────────────────────────────────────────────────
        if (this.state === 'flee') {
            this.fleeTicks++;
            const [lx, lz] = this.step.location;
            this._stuckWalk(player, lx, lz);
            if (this.fleeTicks >= this.FLEE_TICKS || isNear(player, lx, lz, 12)) {
                this.state = 'walk';
                this.fleeTicks = 0;
            }
            return;
        }

        // ── Walk to mining area ─────────────────────────────────────────────
        if (this.state === 'walk') {
            const [lx, lz, ll] = this.step.location;

            if (!isNear(player, lx, lz, 15, ll)) {
                // Via waypoint: route through intermediate coord before destination.
                // Used to steer around obstacles (e.g. Draynor Mansion for Barbarian
                // Village mine).  Only apply when the bot hasn't yet passed it.
                const via = this.step.via;
                if (via && player.level === via[2] && player.z < via[1] && !isNear(player, via[0], via[1], 5)) {
                    const [jx, jz] = botJitter(player, via[0], via[1], 3);
                    this._stuckWalk(player, jx, jz);
                    return;
                }
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
        this.fleeTicks = 0;
        this.currentRock = null;
        this.stuck.reset();
        this.watchdog.reset();
    }

    // ── Step re-roll ────────────────────────────────────────────────────────

    /** Pick a fresh random step matching the bot's current level and owned tools. */
    private _rerollStep(player: Player): void {
        const level = getBaseLevel(player, PlayerStat.MINING);
        const newStep = getProgressionStep(
            'MINING', level,
            ids => ids.every(id => hasItem(player, id)),
        );
        if (newStep) this.step = newStep;
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