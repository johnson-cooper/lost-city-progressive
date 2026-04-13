/**
 * ThievingTask.ts — Pickpocket NPCs, steal from stalls, eat when stunned, bank loot.
 */

import {
    BotTask, Player, Npc, InvType, Inventory,
    walkTo, interactNpcOp, interactLocOp,
    findNpcByName, findLocByName,
    hasItem, isInventoryFull, isNear,
    getBaseLevel, PlayerStat,
    Items, Locations, getProgressionStep,
    teleportNear, randInt, bankInvId,
    INTERACT_TIMEOUT, StuckDetector, ProgressWatchdog,
    openNearbyGate, advanceBankWalk, botJitter
} from '#/engine/bot/tasks/BotTaskBase.js';
import type { SkillStep } from '#/engine/bot/tasks/BotTaskBase.js';
import { getNpcCombatLevel, findAggressorNpc } from '#/engine/bot/BotAction.js';

export class ThievingTask extends BotTask {
    private step: SkillStep;

    private state: 'walk' | 'approach' | 'scan' | 'interact' | 'flee' | 'eat' | 'bank_walk' | 'bank_deposit' = 'walk';

    private interactTicks = 0;
    private lastXp = 0;
    private scanFailTicks = 0;
    private approachTicks = 0;
    private fleeTicks = 0;
    private readonly FLEE_TICKS = 12;

    constructor(step: SkillStep) {
        super();
        this.step = step;
        this.logColor = 'magenta';
    }

    shouldRun(player: Player): boolean {
        // Needs inventory space for loot, and HP > 20%
        const hpPercent = (player.stats[PlayerStat.HITPOINTS] / player.baseLevels[PlayerStat.HITPOINTS]) * 100;
        return !isInventoryFull(player) && hpPercent > 20;
    }

    tick(player: Player): void {
        const now = Date.now();
        if (this.interrupted) return;

        const banking = this.state === 'bank_walk' || this.state === 'bank_deposit';
        if (this.watchdog.check(player, banking)) { this.interrupt(); return; }
        if (this.cooldown > 0) { this.cooldown--; return; }

        // ── AGGRESSOR DETECTION (Caught pickpocketing or stealing) ───────────────
        if (!banking && this.state !== 'flee') {
            const aggressor = findAggressorNpc(player, 5);
            if (aggressor) {
                const hpPercent = (player.stats[PlayerStat.HITPOINTS] / player.baseLevels[PlayerStat.HITPOINTS]) * 100;
                if (hpPercent < 50) {
                    this.state = 'eat';
                } else {
                    this._log(player, `caught by ${this._npcLabel(aggressor)} → fleeing`, 'flee_trigger');
                    this.currentNpc = null;
                    this.targetLoc = null;
                    this.state = 'flee';
                    this.fleeTicks = 0;
                }
                return;
            }
        }

        if (!this.shouldRun(player) && !banking && this.state !== 'flee' && this.state !== 'eat') {
            this._log(player, 'inventory full or low HP → banking');
            this.state = 'bank_walk';
        }

        switch (this.state) {
            case 'walk':
                if (isNear(player, this.step.location, 10)) {
                    this._log(player, 'arrived at thieving area');
                    this.state = 'scan';
                } else {
                    walkTo(player, this.step.location);
                    this.cooldown = randInt(2, 4);
                }
                break;

            case 'scan': {
                // Determine if we are stealing from a Loc (Stall) or Npc (Pickpocket)
                if (this.step.action === 'Steal-from') {
                    // It's a stall
                    // We assume toolItemIds carries the string name of the stall since BotTaskBase doesn't support string Locs naturally in SkillStep,
                    // but for this implementation we'll hardcode or deduce it from location/level.
                    const stall = findLocByName(player, 15, 'Baker\'s stall', 'Silk stall', 'Silver stall');
                    if (stall) {
                        this.targetLoc = stall;
                        this.state = 'approach';
                    } else {
                        this.scanFailTicks++;
                        if (this.scanFailTicks > 5) {
                            this.state = 'walk';
                            this.scanFailTicks = 0;
                        }
                        this.cooldown = 3;
                    }
                } else {
                    // Pickpocketing
                    const npc = findNpcByName(player, 10, 'Man', 'Woman', 'Farmer', 'Master Farmer', 'Knight of Ardougne', 'Paladin');
                    if (npc) {
                        this.currentNpc = npc;
                        this.state = 'approach';
                    } else {
                        this.scanFailTicks++;
                        if (this.scanFailTicks > 5) {
                            this.state = 'walk';
                            this.scanFailTicks = 0;
                        }
                        this.cooldown = 3;
                    }
                }
                break;
            }

            case 'approach': {
                const targetX = this.targetLoc ? this.targetLoc.x : this.currentNpc?.x;
                const targetZ = this.targetLoc ? this.targetLoc.z : this.currentNpc?.z;
                
                if (!targetX || !targetZ) {
                    this.state = 'scan';
                    return;
                }

                if (isNear(player, {x: targetX, z: targetZ}, 1)) {
                    this.state = 'interact';
                    this.approachTicks = 0;
                } else {
                    if (this.approachTicks > 10) {
                        this._log(player, 'approach timed out → scan');
                        this.state = 'scan';
                        this.approachTicks = 0;
                        return;
                    }
                    walkTo(player, {x: targetX, z: targetZ});
                    this.approachTicks++;
                    this.cooldown = 2;
                }
                break;
            }

            case 'interact': {
                const currentXp = player.stats[PlayerStat.THIEVING];
                if (currentXp > this.lastXp) {
                    this.watchdog.feed();
                    this.lastXp = currentXp;
                    this.interactTicks = 0;
                    this.state = 'scan'; // Find next target immediately after success
                    return;
                } else {
                    this.interactTicks++;
                }

                if (this.interactTicks > INTERACT_TIMEOUT) {
                    this._log(player, 'thieving timed out → scan');
                    this.state = 'scan';
                    this.interactTicks = 0;
                    return;
                }

                if (player.stepsTaken === 0) {
                    if (this.targetLoc) {
                        interactLocOp(player, this.targetLoc.type, this.targetLoc.x, this.targetLoc.z, 2); // 'Steal-from'
                        this.cooldown = 4;
                    } else if (this.currentNpc) {
                        interactNpcOp(player, this.currentNpc.nid, 3); // 'Pickpocket' usually op 3 in LC
                        this.cooldown = 3;
                    }
                }
                break;
            }

            case 'flee':
                if (this.fleeTicks < this.FLEE_TICKS) {
                    // Randomly jitter away to drop aggro
                    walkTo(player, botJitter(player.x, player.z, 8));
                    this.fleeTicks += 2;
                    this.cooldown = 2;
                } else {
                    this._log(player, 'done fleeing → returning');
                    this.state = 'walk';
                }
                break;

            case 'eat': {
                const inv = player.getInventory(InvType.INV);
                if (inv) {
                    // Typical food IDs
                    const foodIds = [315, 333, 379, 385, 339, 361];
                    let ate = false;
                    for (const fId of foodIds) {
                        const slot = inv.indexOf(fId);
                        if (slot !== -1) {
                            player.queueClientPacket({
                                type: 'INV_ACTION',
                                interface: 3214,
                                component: 0,
                                op: 1, // Eat
                                id: fId,
                                slot: slot
                            } as any);
                            ate = true;
                            this.cooldown = 3;
                            break;
                        }
                    }
                    if (!ate) {
                        this._log(player, 'no food left → banking');
                        this.state = 'bank_walk';
                    } else {
                        this.state = 'flee'; // Continue fleeing while eating
                    }
                }
                break;
            }

            case 'bank_walk':
                if (advanceBankWalk(player, this.step.location)) {
                    this._log(player, 'arrived at bank');
                    this.state = 'bank_deposit';
                }
                this.cooldown = randInt(2, 4);
                break;

            case 'bank_deposit': {
                const inv = player.getInventory(InvType.INV);
                if (!inv) return;

                // Deposit all loot, keep food
                const foodIds = [315, 333, 379, 385, 339, 361];
                for (let i = 0; i < inv.capacity; i++) {
                    const item = inv.get(i);
                    if (item && !foodIds.includes(item.id)) {
                        player.queueClientPacket({
                            type: 'INV_ACTION',
                            interface: 3214,
                            component: 0,
                            op: 5, // Deposit All
                            id: item.id,
                            slot: i
                        } as any);
                    }
                }
                this.cooldown = 4;
                this.state = 'walk';
                break;
            }
        }
    }
}
