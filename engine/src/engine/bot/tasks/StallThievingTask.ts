import {
    BotTask, Player, Loc, InvType, Npc,
    walkTo, interactLocOp, findNpcNear, findNpcByName, countItem,
    isInventoryFull, isNear, getBaseLevel, PlayerStat,
    bankInvId, StuckDetector, ProgressWatchdog, advanceBankWalk,
    teleportNear, randInt, findLocNear, Items, FOOD_IDS
} from '#/engine/bot/tasks/BotTaskBase.js';
import type { SkillStep } from '#/engine/bot/tasks/BotTaskBase.js';
import { getNpcCombatLevel, findAggressorNpc } from '#/engine/bot/BotAction.js';

const HP_SAFE_THRESHOLD = 15;
const HEAL_IF_HP_BELOW = 20;

export class StallThievingTask extends BotTask {
    private step: SkillStep;
    private state: 'VALIDATE' | 'POSITION' | 'AWARENESS' | 'INTERACT' | 'INVENTORY_MANAGEMENT' | 'bank_walk' | 'bank_done' | 'eat' | 'flee' = 'VALIDATE';
    private interactTicks = 0;
    private lastXp = 0;
    private lastHp = 0;
    private approachTicks = 0;
    private stunTicks = 0;
    private currentStall: Loc | null = null;

    private readonly stallId: number;
    private readonly ownerNpcName: string;
    private readonly GUARD_NPC_ID = 9;
    private readonly ACTION_DELAY = 7;

    private readonly stuck = new StuckDetector(30, 4, 2);
    private readonly watchdog = new ProgressWatchdog();

    constructor(step: SkillStep) {
        super('StallThieving');
        this.step = step;
        this.stallId = step.extra?.stallId as number;
        this.ownerNpcName = step.extra?.npcType as string;
    }

    private debug(player: Player, message: string): void {
        console.log(`[StallThieving][${player.username}][${this.state}] ${message}`);
    }

    shouldRun(player: Player): boolean {
        if (getBaseLevel(player, PlayerStat.THIEVING) < this.step.minLevel) return false;

        const hp = player.stats[PlayerStat.HITPOINTS];
        if (hp < HP_SAFE_THRESHOLD) {
            this.debug(player, `not starting: HP too low (${hp})`);
            return false;
        }

        return true;
    }

    isComplete(_player: Player): boolean {
        return false;
    }

    tick(player: Player): void {
        if (this.interrupted) return;

        const banking = this.state === 'bank_walk' || this.state === 'bank_done' || this.state === 'eat';
        if (this.watchdog.check(player, banking)) { this.interrupt(); return; }

        if (this.cooldown > 0) {
            this.cooldown--;
            return;
        }

        // --- STUN CHECK ---
        if (this.lastHp > 0) {
            const currentHp = player.stats[PlayerStat.HITPOINTS];
            const hpDrop = this.lastHp - currentHp;

            if (hpDrop > 0 && this.lastXp === player.stats[PlayerStat.THIEVING]) {
                this.debug(player, `HP dropped by ${hpDrop} without XP gain - stunned!`);
                this.state = 'flee';
                this.stunTicks = 0;
                this.lastHp = 0;
                return;
            }

            this.lastHp = 0;
        }

        // --- DANGER HP CHECK ---
        const hp = player.stats[PlayerStat.HITPOINTS];
        if (hp < HP_SAFE_THRESHOLD && this.state !== 'flee' && this.state !== 'bank_walk' && this.state !== 'bank_done' && this.state !== 'eat') {
            this.debug(player, `HP low (${hp}); banking to recover`);
            this.state = 'bank_walk';
            return;
        }

        // --- AGGRESSOR DETECTION ---
        if (this.state !== 'bank_walk' && this.state !== 'bank_done' && this.state !== 'flee' && this.state !== 'eat') {
            const aggressor = findAggressorNpc(player, 8);
            if (aggressor) {
                const npcLvl = getNpcCombatLevel(aggressor);
                if (npcLvl > player.combatLevel) {
                    this.debug(player, 'aggressor attacking; fleeing');
                    this.state = 'flee';
                    this.stunTicks = 0;
                    return;
                }
            }
        }

        // --- VALIDATE ---
        if (this.state === 'VALIDATE') {
            if (getBaseLevel(player, PlayerStat.THIEVING) < this.step.minLevel) {
                this.interrupt();
                return;
            }
            if (isInventoryFull(player)) {
                this.state = 'INVENTORY_MANAGEMENT';
                return;
            }
            this.state = 'POSITION';
            return;
        }

        // --- FLEE ---
        if (this.state === 'flee') {
            const [lx, lz] = [player.x - 10, player.z];
            walkTo(player, lx, lz);
            this.stunTicks++;
            if (this.stunTicks > 10) {
                this.state = 'bank_walk';
            }
            return;
        }

        // --- EAT ---
        if (this.state === 'eat') {
            this._eatFood(player);
            return;
        }

        // --- INVENTORY_MANAGEMENT ---
        if (this.state === 'INVENTORY_MANAGEMENT') {
            if (this._shouldHeal(player) && this._hasFoodInInventory(player)) {
                this.state = 'eat';
                return;
            }
            this.state = 'bank_walk';
            return;
        }

        if (this.state === 'bank_walk') {
            const result = advanceBankWalk(player, this.stuck);
            if (result === 'walk') return;
            this.cooldown = result === 'ready' ? 3 : 0;
            this.state = 'bank_done';
            return;
        }

        if (this.state === 'bank_done') {
            this._depositLoot(player);
            this._withdrawFood(player);
            this.state = 'VALIDATE';
            return;
        }

        // --- POSITION ---
        if (this.state === 'POSITION') {
            const stall = findLocNear(player.x, player.z, player.level, this.stallId, 20);
            if (!stall) {
                const [sx, sz] = this.step.location;
                if (!isNear(player, sx, sz, 15)) {
                    this._stuckWalk(player, sx, sz);
                    return;
                }
                this.approachTicks++;
                if (this.approachTicks > 10) {
                    this.debug(player, 'Could not find stall.');
                    this.interrupt();
                }
                return;
            }

            this.approachTicks = 0;
            this.currentStall = stall;

            // Ardougne Market stalls logic
            let safeX = stall.x;
            let safeZ = stall.z;

            // Simple heuristic to stand behind or side of stall
            if (this.stallId === 2561) { // Baker
                 safeX = stall.x - 1;
                 safeZ = stall.z;
            } else if (this.stallId === 2560) { // Silk
                 safeX = stall.x;
                 safeZ = stall.z + 1;
            } else if (this.stallId === 2563) { // Fur
                 safeX = stall.x - 1;
                 safeZ = stall.z;
            } else if (this.stallId === 2562) { // Silver
                 safeX = stall.x;
                 safeZ = stall.z - 1;
            } else if (this.stallId === 2564) { // Spice
                 safeX = stall.x + 1;
                 safeZ = stall.z;
            } else if (this.stallId === 2565) { // Gem
                 safeX = stall.x;
                 safeZ = stall.z + 1;
            }

            if (!isNear(player, safeX, safeZ, 1)) {
                walkTo(player, safeX, safeZ);
                return;
            }

            this.state = 'AWARENESS';
            return;
        }

        // --- AWARENESS ---
        if (this.state === 'AWARENESS') {
            const guard = findNpcNear(player.x, player.z, player.level, this.GUARD_NPC_ID, 6);
            const owner = findNpcByName(player.x, player.z, player.level, this.ownerNpcName, 3);

            if (guard || owner) {
                this.debug(player, 'Guard or Owner detected, pausing...');
                this.cooldown = randInt(2, 5);
                return;
            }

            this.state = 'INTERACT';
            return;
        }

        // --- INTERACT ---
        if (this.state === 'INTERACT') {
            if (!this.currentStall) {
                this.state = 'VALIDATE';
                return;
            }

            if (!isNear(player, this.currentStall.x, this.currentStall.z, 2)) {
                this.state = 'POSITION';
                return;
            }

            if (isInventoryFull(player)) {
                this.state = 'INVENTORY_MANAGEMENT';
                return;
            }

            this.lastHp = player.stats[PlayerStat.HITPOINTS];
            this.interactTicks++;
            interactLocOp(player, this.currentStall, 2);
            this.lastXp = player.stats[PlayerStat.THIEVING];
            this.watchdog.notifyActivity();
            this.cooldown = this.ACTION_DELAY;
            this.state = 'VALIDATE';
            return;
        }
    }

    reset(): void {
        super.reset();
        this.state = 'VALIDATE';
        this.interactTicks = 0;
        this.lastXp = 0;
        this.lastHp = 0;
        this.stunTicks = 0;
        this.approachTicks = 0;
        this.currentStall = null;
        this.stuck.reset();
        this.watchdog.reset();
    }

    private _shouldHeal(player: Player): boolean {
        const hp = player.stats[PlayerStat.HITPOINTS];
        return hp < HEAL_IF_HP_BELOW;
    }

    private _hasFoodInInventory(player: Player): boolean {
        for (const foodId of FOOD_IDS) {
            if (countItem(player, foodId) > 0) {
                return true;
            }
        }
        return false;
    }

    private _eatFood(player: Player): void {
        const inv = player.getInventory(InvType.INV);
        if (!inv) return;
        for (const foodId of FOOD_IDS) {
            for (let slot = 0; slot < inv.capacity; slot++) {
                const item = inv.get(slot);
                if (!item || item.id !== foodId) continue;
                inv.remove(foodId, 1);
                this.debug(player, `ate ${item.id} to heal`);
                this.cooldown = 2;
                this.state = 'VALIDATE';
                return;
            }
        }
        this.debug(player, `no food to eat`);
        this.state = 'bank_walk';
    }

    private _withdrawFood(player: Player): void {
        const inv = player.getInventory(InvType.INV);
        const bid = bankInvId();
        if (!inv || bid === -1) return;

        const bank = player.getInventory(bid);
        if (!bank) return;

        let currentFoodCount = 0;
        for (const foodId of FOOD_IDS) {
            currentFoodCount += countItem(player, foodId);
        }

        if (currentFoodCount >= 5) return;

        const toWithdraw = 12 - currentFoodCount;
        let withdrawn = 0;

        for (const foodId of FOOD_IDS) {
            if (withdrawn >= toWithdraw) break;

            for (let i = 0; i < bank.capacity; i++) {
                const it = bank.get(i);
                if (it && it.id === foodId) {
                    const amount = Math.min(toWithdraw - withdrawn, it.count);
                    const moved = bank.remove(foodId, amount);
                    if (moved.completed > 0) {
                        inv.add(foodId, moved.completed);
                        withdrawn += moved.completed;
                    }
                    break;
                }
            }
        }
    }

    private _depositLoot(player: Player): void {
        const bid = bankInvId();
        if (bid === -1) return;
        const bank = player.getInventory(bid);
        const inv = player.getInventory(InvType.INV);
        if (!bank || !inv) return;
        let deposited = 0;
        // Collect all possible loot from all stalls
        const lootIds = [
            Items.CAKE, 1893, 1895, Items.BREAD, 1901,
            Items.SILK, Items.SILVER_ORE, Items.SPICE,
            Items.GREY_WOLF_FUR, Items.UNCUT_SAPPHIRE,
            Items.UNCUT_EMERALD, Items.UNCUT_RUBY, Items.UNCUT_DIAMOND
        ];
        for (let slot = 0; slot < inv.capacity; slot++) {
            const item = inv.get(slot);
            if (!item) continue;
            if (!lootIds.includes(item.id)) continue;
            if (FOOD_IDS.includes(item.id)) continue;

            const moved = inv.remove(item.id, item.count);
            if (moved.completed > 0) {
                bank.add(item.id, moved.completed);
                deposited += moved.completed;
            }
        }
        this.debug(player, `deposited ${deposited} items`);
    }

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
        const wx = player.x + randInt(-5, 5);
        const wz = player.z + randInt(-5, 5);
        walkTo(player, wx, wz);
    }
}
