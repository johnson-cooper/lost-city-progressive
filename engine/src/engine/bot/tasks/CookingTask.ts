/**
 * CookingTask.ts — Cook raw fish on ranges/fires, bank cooked food, and progress tiers.
 */

import {
    BotTask, Player, Loc, InvType, Inventory,
    walkTo, interactLocOp,
    findLocByName,
    hasItem, isInventoryFull, isNear,
    getBaseLevel, PlayerStat,
    Items, Locations, getProgressionStep,
    teleportNear, randInt, bankInvId,
    INTERACT_TIMEOUT, StuckDetector, ProgressWatchdog,
    openNearbyGate, advanceBankWalk,
} from '#/engine/bot/tasks/BotTaskBase.js';
import type { SkillStep } from '#/engine/bot/tasks/BotTaskBase.js';
import { interactHeldOpU } from '#/engine/bot/BotAction.js';

export class CookingTask extends BotTask {
    private step: SkillStep;

    private state: 'walk' | 'scan' | 'interact' | 'bank_walk' | 'bank_done' = 'walk';
    private interactTicks = 0;
    private lastXp = 0;
    private scanFailTicks = 0;

    constructor(step: SkillStep) {
        super();
        this.step = step;
        this.logColor = 'yellow';
    }

    shouldRun(player: Player): boolean {
        // Need raw food to cook
        return this.step.toolItemIds.some(id => hasItem(player, id));
    }

    tick(player: Player): void {
        if (this.interrupted) return;
        const banking = this.state === 'bank_walk' || this.state === 'bank_done';
        if (this.watchdog.check(player, banking)) { this.interrupt(); return; }
        if (this.cooldown > 0) { this.cooldown--; return; }

        if (!this.shouldRun(player) && this.state !== 'bank_walk' && this.state !== 'bank_done') {
            this._log(player, 'out of raw food → banking');
            this.state = 'bank_walk';
        }

        switch (this.state) {
            case 'walk':
                if (isNear(player, this.step.location, 10)) {
                    this._log(player, 'arrived at cooking area');
                    this.state = 'scan';
                } else {
                    walkTo(player, this.step.location);
                    this.cooldown = randInt(2, 4);
                }
                break;

            case 'scan': {
                // Find a Range or Fire
                const cookingLoc = findLocByName(player, 10, 'Range', 'Fire', 'Cooking range');
                if (cookingLoc) {
                    this.targetLoc = cookingLoc;
                    this.state = 'interact';
                    this._log(player, `found ${cookingLoc.type === 2732 ? 'fire' : 'range'} at ${cookingLoc.x},${cookingLoc.z}`);
                } else {
                    this.scanFailTicks++;
                    if (this.scanFailTicks > 5) {
                        this._log(player, 'no range found → walk state');
                        this.state = 'walk';
                        this.scanFailTicks = 0;
                    }
                    this.cooldown = 3;
                }
                break;
            }

            case 'interact': {
                if (!this.targetLoc) {
                    this.state = 'scan';
                    return;
                }

                const currentXp = player.stats[PlayerStat.COOKING];
                if (currentXp > this.lastXp) {
                    this.watchdog.feed();
                    this.lastXp = currentXp;
                    this.interactTicks = 0;
                } else {
                    this.interactTicks++;
                }

                if (this.interactTicks > INTERACT_TIMEOUT) {
                    this._log(player, 'cooking timed out → scan');
                    this.state = 'scan';
                    this.interactTicks = 0;
                    return;
                }

                const inv = player.getInventory(InvType.INV);
                if (!inv) return;
                
                // Find raw food in inventory
                let rawFoodId = -1;
                let rawFoodSlot = -1;
                for (const id of this.step.toolItemIds) {
                    const slot = inv.indexOf(id);
                    if (slot !== -1) {
                        rawFoodId = id;
                        rawFoodSlot = slot;
                        break;
                    }
                }

                if (rawFoodId !== -1) {
                    if (player.stepsTaken === 0) {
                        // Use Raw Food on Range
                        interactHeldOpU(player, inv, rawFoodId, rawFoodSlot, this.targetLoc.type);
                        this.cooldown = 4; // 4 ticks per cook action
                    }
                } else {
                    this.state = 'bank_walk';
                }
                break;
            }

            case 'bank_walk':
                if (advanceBankWalk(player, this.step.location)) {
                    this._log(player, 'arrived at bank');
                    this.state = 'bank_done';
                }
                this.cooldown = randInt(2, 4);
                break;

            case 'bank_done': {
                const inv = player.getInventory(InvType.INV);
                const bank = player.getInventory(bankInvId(player));
                if (!inv || !bank) return;

                // Deposit all cooked or burnt food
                for (let i = 0; i < inv.capacity; i++) {
                    const item = inv.get(i);
                    if (item && !this.step.toolItemIds.includes(item.id)) {
                        player.queueClientPacket({
                            type: 'INV_ACTION',
                            interface: 3214,
                            component: 0,
                            op: 5, // Deposit all
                            id: item.id,
                            slot: i
                        } as any);
                    }
                }

                this.cooldown = 4;
                
                // Attempt to withdraw more raw food
                for (const rawId of this.step.toolItemIds) {
                    if (bank.has(rawId)) {
                         player.queueClientPacket({
                            type: 'INV_ACTION',
                            interface: 5382,
                            component: 0,
                            op: 5, // Withdraw all
                            id: rawId,
                            slot: bank.indexOf(rawId)
                        } as any);
                    }
                }

                if (!this.shouldRun(player)) {
                    // Out of raw food in bank
                    this._log(player, 'no more raw food in bank → finished');
                    this.finished = true;
                } else {
                    this.state = 'walk';
                }
                break;
            }
        }
    }
}
