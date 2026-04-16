import {
    BotTask, Player, Loc, InvType, Npc,
    walkTo, interactLocOp, findNpcNear, countItem,
    isInventoryFull, isNear, getBaseLevel, PlayerStat,
    bankInvId, StuckDetector, ProgressWatchdog, advanceBankWalk,
    teleportNear, randInt, findLocNear
} from '#/engine/bot/tasks/BotTaskBase.js';
import { getNpcCombatLevel, findAggressorNpc } from '#/engine/bot/BotAction.js';

const HP_SAFE_THRESHOLD = 15;
const HEAL_IF_HP_BELOW = 20;

export class BakerStallThiefTask extends BotTask {
    private state: 'VALIDATE' | 'POSITION' | 'AWARENESS' | 'INTERACT' | 'INVENTORY_MANAGEMENT' | 'bank_walk' | 'bank_done' | 'eat' | 'flee' = 'VALIDATE';
    private interactTicks = 0;
    private lastXp = 0;
    private lastHp = 0;
    private approachTicks = 0;
    private stunTicks = 0;
    private currentStall: Loc | null = null;

    private readonly STALL_ID = 2561;
    private readonly BAKER_NPC_ID = 591;
    private readonly GUARD_NPC_ID = 9;
    private readonly LOOT_IDS = [1891, 1893, 1895, 2309, 1901];
    private readonly ACTION_DELAY = 7;

    private readonly stuck = new StuckDetector(30, 4, 2);
    private readonly watchdog = new ProgressWatchdog();

    constructor() {
        super('BakerStallThief');
    }

    private debug(player: Player, message: string): void {
        console.log(`[BakerStallThief][${player.username}][${this.state}] ${message}`);
    }

    shouldRun(player: Player): boolean {
        // Level 5 Thieving required
        if (getBaseLevel(player, PlayerStat.THIEVING) < 5) return false;

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
        // Runs before state evaluation to properly catch HP drops right after a cooldown ends
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
            if (getBaseLevel(player, PlayerStat.THIEVING) < 5) {
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
            // Check if we need to heal first
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
            this.state = 'VALIDATE';
            return;
        }

        // --- POSITION ---
        if (this.state === 'POSITION') {
            // Find stall
            const stall = findLocNear(player.x, player.z, player.level, this.STALL_ID, 20);
            if (!stall) {
                // Not near ardy market probably, let's walk there
                // Ardougne Baker Stall is around 2667, 3310
                if (!isNear(player, 2667, 3310, 15)) {
                    this._stuckWalk(player, 2667, 3310);
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

            // Try to position specifically to avoid line of sight, e.g. behind the stall
            // Stall is at 2667, 3310, Baker usually faces south. Safest tile is inside the stall or to the sides
            const safeX = stall.x - 1; // Stand slightly west or east of the actual stall
            const safeZ = stall.z;

            if (!isNear(player, safeX, safeZ, 1)) {
                walkTo(player, safeX, safeZ);
                return;
            }

            this.state = 'AWARENESS';
            return;
        }

        // --- AWARENESS ---
        if (this.state === 'AWARENESS') {
            // Check for guards
            const guard = findNpcNear(player.x, player.z, player.level, this.GUARD_NPC_ID, 6);

            // Check if baker is facing us (simplified as distance check for now)
            const baker = findNpcNear(player.x, player.z, player.level, this.BAKER_NPC_ID, 3);

            // Basic awareness: if guard or baker is too close, pause for a tick or two
            if (guard || baker) {
                this.debug(player, 'Guard or Baker detected, pausing...');
                this.cooldown = randInt(2, 5);

                // Reposition logic: back away slightly
                if (baker && this.currentStall) {
                    walkTo(player, this.currentStall.x - 2, this.currentStall.z + 1);
                }

                // Keep checking awareness
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

            // Track HP before interacting
            this.lastHp = player.stats[PlayerStat.HITPOINTS];

            this.interactTicks++;
            interactLocOp(player, this.currentStall, 2); // Steal-from is usually op 2 on stalls

            this.lastXp = player.stats[PlayerStat.THIEVING];

            this.watchdog.notifyActivity();
            this.cooldown = this.ACTION_DELAY + randInt(0, 2); // Human-like randomization

            // Set state to check stun after cooldown
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
        const foodIds = [315, 325, 333, 329, 379, 373];
        for (const foodId of foodIds) {
            if (countItem(player, foodId) > 0) {
                return true;
            }
        }
        return false;
    }

    private _eatFood(player: Player): void {
        const inv = player.getInventory(InvType.INV);
        if (!inv) return;

        const foodIds = [373, 379, 329, 333, 325, 315];

        for (const foodId of foodIds) {
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

    private _depositLoot(player: Player): void {
        const bid = bankInvId();
        if (bid === -1) return;

        const bank = player.getInventory(bid);
        const inv = player.getInventory(InvType.INV);
        if (!bank || !inv) return;

        let deposited = 0;

        for (let slot = 0; slot < inv.capacity; slot++) {
            const item = inv.get(slot);
            if (!item) continue;
            // Only deposit loot
            if (!this.LOOT_IDS.includes(item.id)) continue;

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
            this.debug(player, `desperately stuck; teleporting`);
            teleportNear(player, lx, lz);
            this.stuck.reset();
            return;
        }

        const wx = player.x + randInt(-5, 5);
        const wz = player.z + randInt(-5, 5);
        this.debug(player, `stuck fallback to ${wx}, ${wz}`);
        walkTo(player, wx, wz);
    }
}
