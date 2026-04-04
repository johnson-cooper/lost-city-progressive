import {
    BotTask, Player, Npc, InvType,
    walkTo, interactNpcOp,
    findNpcByName, findNpcByPrefix, findNpcBySuffix,
    hasItem, isInventoryFull, isNear,
    getBaseLevel, PlayerStat,
    Items, Locations, getProgressionStep,
    teleportNear, randInt, bankInvId,
    INTERACT_TIMEOUT, StuckDetector, ProgressWatchdog,
    openNearbyGate,
} from '#/engine/bot/tasks/BotTaskBase.js';
import type { SkillStep } from '#/engine/bot/tasks/BotTaskBase.js';
import { addItem } from '#/engine/bot/BotAction.js';

type CombatExtra = {
    npcName?: string;
    npcType?: string;
    npcPrefix?: string;
    npcSuffix?: string;
};

export class CombatTask extends BotTask {
    private step: SkillStep;
    private readonly stat: PlayerStat;

    private state: 'walk' | 'scan' | 'interact' | 'bank_walk' | 'bank_done' = 'walk';

    private interactTicks = 0;
    private approachTicks = 0;
    private lastXp = 0;
    private scanFail = 0;

    private currentNpc: Npc | null = null;

    private readonly stuck = new StuckDetector(30, 4, 2);
    private readonly watchdog = new ProgressWatchdog(150);

    constructor(step: SkillStep, stat: PlayerStat) {
        super('Combat');
        this.step = step;
        this.stat = stat;
    }

    // ─────────────────────────────────────────────
    // SMART DEBUG LOGGER (THROTTLED)
    // ─────────────────────────────────────────────
    private lastLogKey = '';
    private lastLogTime = 0;

    private _log(player: Player | null, msg: string, key?: string): void {
        const now = Date.now();
        const logKey = key ?? msg;

        if (this.lastLogKey === logKey && now - this.lastLogTime < 750) {
            return;
        }

        this.lastLogKey = logKey;
        this.lastLogTime = now;

        const prefix = player ? `[P:${player.x},${player.z}]` : '[BOT]';
        console.log(`${prefix} [CombatTask] ${msg}`);
    }

    shouldRun(player: Player): boolean {
        return this.step.toolItemIds.every(id => hasItem(player, id));
    }

    tick(player: Player): void {
        if (this.interrupted) return;

        const banking = this.state === 'bank_walk' || this.state === 'bank_done';
        if (this.watchdog.check(player, banking)) {
            this._log(player, 'WATCHDOG TRIGGERED → interrupt + teleport', 'watchdog');
            this.interrupt();
            return;
        }

        if (this.cooldown > 0) {
            this.cooldown--;
            return;
        }

        // ── LEVEL UPDATE ─────────────────────────────
        const level = getBaseLevel(player, this.stat);
        const skillName =
            this.stat === PlayerStat.ATTACK ? 'ATTACK' :
            this.stat === PlayerStat.STRENGTH ? 'STRENGTH' :
            'DEFENCE';

        const newStep = getProgressionStep(skillName, level);
        if (newStep && newStep.minLevel > this.step.minLevel) {
            this._log(player, `LEVEL UP → ${this.step.minLevel} → ${newStep.minLevel}`, 'level_up');

            this.step = newStep;
            this.state = 'walk';
            this.currentNpc = null;
        }

        // ── INVENTORY FULL ───────────────────────────
        if (isInventoryFull(player) && this.state !== 'bank_walk') {
            this._log(player, 'INVENTORY FULL → bank_walk', 'inv_full');
            this.state = 'bank_walk';
        }

        // ── SHOP SELL ────────────────────────────────
        if (this.state === 'bank_walk') {
            const [sx, sz, sl] = Locations.LUMBRIDGE_GENERAL;

            if (!isNear(player, sx, sz, 8, sl)) {
                this._stuckWalk(player, sx, sz);
                return;
            }

            const shopNpc = findNpcByName(player.x, player.z, player.level, 'generalshopkeeper1', 10);
            if (!shopNpc) {
                return;
            }

            this._log(player, 'selling junk', 'sell');
            interactNpcOp(player, shopNpc, 3);
            this._sellJunk(player);

            this.cooldown = 3;
            this.state = 'bank_done';
            return;
        }

        // ── BANK ──────────────────────────────────────
        if (this.state === 'bank_done') {
            const [bx, bz] = Locations.DRAYNOR_BANK;

            if (!isNear(player, bx, bz, 8)) {
                this._stuckWalk(player, bx, bz);
                return;
            }

            const banker = findNpcByPrefix(player.x, player.z, player.level, 'banker', 10);
            if (!banker) return;

            this._log(player, 'banking items', 'banking');
            interactNpcOp(player, banker, 3);

            this._depositGold(player);
            this._depositLoot(player);

            this.state = 'walk';
            this.cooldown = 3;
            return;
        }

        // ── WALK ──────────────────────────────────────
        if (this.state === 'walk') {
            const [lx, lz, ll] = this.step.location;

            if (!isNear(player, lx, lz, 15, ll)) {
                this._stuckWalk(player, lx, lz);
                return;
            }

            this.state = 'scan';
            this.scanFail = 0;
            return;
        }

        // ── SCAN ──────────────────────────────────────
        if (this.state === 'scan') {
            const npc = this._findTargetNpc(player);

            if (!npc) {
                this.scanFail++;

                if (this.scanFail === 1 || this.scanFail % 3 === 0) {
                    this._log(player, `scan failed (${this.scanFail})`, 'scan_fail');
                }

                if (this.scanFail % 3 === 0) {
                    openNearbyGate(player, 6);
                }

                if (this.scanFail > 5) {
                    this.state = 'walk';
                    this.scanFail = 0;
                }
                return;
            }

            this._log(player, `found NPC → ${this._npcLabel(npc)}`, 'npc_found');

            this.currentNpc = npc;
            interactNpcOp(player, npc, 2);

            this.state = 'interact';
            this.interactTicks = 0;
            this.approachTicks = 0;
            this.lastXp = player.stats[this.stat];
            return;
        }

        // ── COMBAT ───────────────────────────────────
        if (this.state === 'interact') {
            this.interactTicks++;
            this.approachTicks++;

            if (player.stats[this.stat] > this.lastXp) {
                this._log(player, 'XP GAINED', 'xp_gain');
                this.lastXp = player.stats[this.stat];
                this.interactTicks = 0;
                this.approachTicks = 0;
                this.watchdog.notifyActivity();
                return;
            }

            if (this.approachTicks >= INTERACT_TIMEOUT) {
                if (openNearbyGate(player, 6)) {
                    this.approachTicks = 0;
                    this.cooldown = 4;
                    return;
                }

                this.currentNpc = null;
                this.state = 'scan';
                this.approachTicks = 0;
                this.interactTicks = 0;
                return;
            }

            if (this.interactTicks >= INTERACT_TIMEOUT * 2) {
                this.currentNpc = null;
                this.state = 'scan';
                this.approachTicks = 0;
                this.interactTicks = 0;
            }
        }
    }

    isComplete(): boolean {
        return false;
    }

    override reset(): void {
        super.reset();
        this._log(null, 'RESET TASK', 'reset');

        this.state = 'walk';
        this.interactTicks = 0;
        this.approachTicks = 0;
        this.lastXp = 0;
        this.scanFail = 0;
        this.currentNpc = null;
        this.stuck.reset();
        this.watchdog.reset();
    }

    // ─────────────────────────────────────────────
    // NPC LABEL HELPER
    // ─────────────────────────────────────────────
    private _npcLabel(npc: Npc): string {
        const anyNpc = npc as any;
        return anyNpc.type ?? anyNpc.name ?? anyNpc.index ?? 'unknown';
    }

    // ─────────────────────────────────────────────
    // SELL VALUES
    // ─────────────────────────────────────────────
    private static readonly SELL_PRICES: Record<number, number> = {
        [Items.LOGS]: 3,
        [Items.OAK_LOGS]: 6,
        [Items.WILLOW_LOGS]: 14,
        [Items.MAPLE_LOGS]: 25,
        [Items.YEW_LOGS]: 50,

        [Items.BONES]: 1,
        [Items.COW_HIDE]: 3,

        // ── Low-tier gear (general store junk prices) ──
        [Items.GOBLIN_MAIL]: 10,

        [Items.BRONZE_MED_HELM]: 6,
        [Items.BRONZE_FULL_HELM]: 8,
        [Items.BRONZE_SQ_SHIELD]: 10,
        [Items.BRONZE_KITESHIELD]: 14,

        [Items.BRONZE_DAGGER]: 4,
        [Items.BRONZE_LONGSWORD]: 10,
        [Items.BRONZE_2H_SWORD]: 16,
    };

    private _sellJunk(player: Player): void {
        const inv = player.getInventory(InvType.INV);
        if (!inv) return;

        let coins = 0;

        for (let slot = 0; slot < inv.capacity; slot++) {
            const item = inv.get(slot);
            if (!item) continue;

            if (this.step.toolItemIds.includes(item.id)) continue;
            if (item.id === Items.COINS) continue;
            if (!(item.id in CombatTask.SELL_PRICES)) continue;

            coins += item.count * CombatTask.SELL_PRICES[item.id];
            inv.remove(item.id, item.count);
        }

        if (coins > 0) {
            this._log(player, `sold items → ${coins} coins`, 'sell_done');
            addItem(player, Items.COINS, coins);
        }
    }

    private _depositGold(player: Player): void {
        const inv = player.getInventory(InvType.INV);
        const bid = bankInvId();
        if (!inv || bid === -1) return;

        const bank = player.getInventory(bid);
        if (!bank) return;

        for (let slot = 0; slot < inv.capacity; slot++) {
            const item = inv.get(slot);
            if (!item || item.id !== Items.COINS) continue;

            const moved = inv.remove(item.id, item.count);
            if (moved.completed > 0) {
                bank.add(Items.COINS, moved.completed);
            }
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
            if (moved.completed > 0) {
                bank.add(item.id, moved.completed);
            }
        }
    }

    private _findTargetNpc(player: Player): Npc | null {
        const extra = this.step.extra as CombatExtra | undefined;

        for (const name of [extra?.npcType, extra?.npcName].filter(Boolean) as string[]) {
            const npc =
                findNpcByName(player.x, player.z, player.level, name, 15) ??
                findNpcByPrefix(player.x, player.z, player.level, name, 15);

            if (npc) return npc;
        }

        if (extra?.npcPrefix) {
            return findNpcByPrefix(player.x, player.z, player.level, extra.npcPrefix, 15);
        }

        if (extra?.npcSuffix) {
            return findNpcBySuffix(player.x, player.z, player.level, extra.npcSuffix, 15);
        }

        return null;
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
        if (openNearbyGate(player, 5)) return;

        const dx   = lx - player.x;
        const dz   = lz - player.z;
        const escX = player.x + (Math.abs(dz) > Math.abs(dx) ? randInt(-10, 10) : (dz > 0 ? 10 : -10));
        const escZ = player.z + (Math.abs(dx) > Math.abs(dz) ? randInt(-10, 10) : (dx > 0 ? 10 : -10));
        walkTo(player, escX, escZ);
    }
}
