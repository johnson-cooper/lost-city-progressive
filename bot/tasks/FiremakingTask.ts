import {
    BotTask,
    Player,
    walkTo,
    hasItem,
    removeItem,
    isNear,
    getBaseLevel,
    getProgressionStep,
    PlayerStat,
    Items,
    Locations,
    randInt,
    INTERACT_TIMEOUT,
    StuckDetector,
    ProgressWatchdog,
    InvType,
    bankInvId,
    openNearbyGate,
    teleportNear,
} from '#/engine/bot/tasks/BotTaskBase.js';

import type { SkillStep } from '#/engine/bot/tasks/BotTaskBase.js';

export class FiremakingTask extends BotTask {
    private step: SkillStep;

    private state: 'walk' | 'burn' | 'move' | 'bank_walk' | 'bank_done' = 'walk';

    private interactTicks = 0;
    private lastXp = 0;

    // 🔥 FIX: prevents bank re-trigger loop
    private justBanked = false;

    private readonly stuck = new StuckDetector(30, 4, 2);
    private readonly watchdog = new ProgressWatchdog();

    constructor(step: SkillStep) {
        super('Firemaking');
        this.step = step;
    }

    shouldRun(): boolean {
        return true;
    }

    // ───────────────── HELPERS ─────────────────

    private isLog(itemId: number): boolean {
        return (
            itemId === Items.LOGS ||
            itemId === Items.OAK_LOGS ||
            itemId === Items.WILLOW_LOGS ||
            itemId === Items.MAPLE_LOGS ||
            itemId === Items.YEW_LOGS
        );
    }

    private getFirstLog(player: Player): number | null {
        const inv = player.getInventory(InvType.INV);
        if (!inv) return null;

        for (let i = 0; i < inv.capacity; i++) {
            const item = inv.get(i);
            if (item && this.isLog(item.id)) return item.id;
        }
        return null;
    }

    private hasAnyLogs(player: Player): boolean {
        return this.getFirstLog(player) !== null;
    }

    // ───────────────── MAIN LOOP ─────────────────

    tick(player: Player): void {
        if (this.interrupted) return;

        const banking = this.state === 'bank_walk' || this.state === 'bank_done';

        if (this.watchdog.check(player, banking)) {
            this.interrupt();
            return;
        }

        if (this.cooldown > 0) {
            this.cooldown--;
            return;
        }

        // ── LEVEL PROGRESSION
        const level = getBaseLevel(player, PlayerStat.FIREMAKING);
        const newStep = getProgressionStep('FIREMAKING', level);

        if (newStep && newStep.minLevel > this.step.minLevel) {
            this.step = newStep;

            this.state = 'walk';
            this.interactTicks = 0;

            this.stuck.reset();
            this.watchdog.reset();
        }

        // ─────────────────────────────
        // BANK IF OUT OF LOGS (FIXED LOCKED VERSION)
        // ─────────────────────────────
        if (!this.hasAnyLogs(player) && !this.justBanked) {
            this.state = 'bank_walk';
        }

        // reset bank lock once we have logs again
        if (this.hasAnyLogs(player)) {
            this.justBanked = false;
        }

        // ─────────────────────────────
        // BANK WALK
        // ─────────────────────────────
        if (this.state === 'bank_walk') {
            const [bx, bz] = Locations.DRAYNOR_BANK;

            if (!isNear(player, bx, bz, 8)) {
                this._stuckWalk(player, bx, bz);
                return;
            }

            this.state = 'bank_done';
            return;
        }

        // ─────────────────────────────
        // BANK WITHDRAW
        // ─────────────────────────────
        if (this.state === 'bank_done') {
            const bank = player.getInventory(bankInvId());
            const inv = player.getInventory(InvType.INV);

            if (!bank || !inv) return;

            let free = 0;
            for (let i = 0; i < inv.capacity; i++) {
                if (!inv.get(i)) free++;
            }

            for (let i = 0; i < bank.capacity; i++) {
                const item = bank.get(i);
                if (!item) continue;

                if (this.isLog(item.id)) {
                    const amount = Math.min(item.count, free);

                    bank.remove(item.id, amount);
                    inv.add(item.id, amount);

                    this.state = 'walk';
                    this.justBanked = true; // 🔥 IMPORTANT FIX
                    return;
                }
            }

            this.interrupt();
            return;
        }

        // ─────────────────────────────
        // WALK TO FIRE SPOT
        // ─────────────────────────────
        if (this.state === 'walk') {
            const [lx, lz] = Locations.FIRE_LUMBRIDGE_ROAD;

            if (!isNear(player, lx, lz, 8)) {
                this._stuckWalk(player, lx, lz);
                return;
            }

            this.state = 'burn';
            return;
        }

        // ─────────────────────────────
        // BURN LOGS (CORE LOOP)
        // ─────────────────────────────
        if (this.state === 'burn') {
            const logId = this.getFirstLog(player);

            if (!logId) {
                this.state = 'bank_walk';
                return;
            }

            const before = player.stats[PlayerStat.FIREMAKING];

            removeItem(player, logId, 1);

            const xp = this.getXp(logId);

            player.stats[PlayerStat.FIREMAKING] = before + xp;

            this.lastXp = player.stats[PlayerStat.FIREMAKING];

            this.watchdog.notifyActivity();

            this.cooldown = randInt(2, 4);
            this.state = 'move';

            return;
        }

        // ─────────────────────────────
        // MOVE
        // ─────────────────────────────
        if (this.state === 'move') {
            walkTo(player,
                player.x + randInt(-1, 1),
                player.z + randInt(-1, 1)
            );

            this.state = 'burn';
            return;
        }
    }




    
    // ───────────────── XP TABLE ─────────────────

    private getXp(log: number): number {
        switch (log) {
            case Items.LOGS: return 40;
            case Items.OAK_LOGS: return 60;
            case Items.WILLOW_LOGS: return 90;
            case Items.MAPLE_LOGS: return 135;
            case Items.YEW_LOGS: return 202;
            default: return 40;
        }
    }

    override reset(): void {
        super.reset();

        this.state = 'walk';
        this.interactTicks = 0;
        this.lastXp = 0;
        this.justBanked = false;

        this.stuck.reset();
        this.watchdog.reset();
    }

    // ───────────────── STUCK HANDLER ─────────────────

    private _stuckWalk(player: Player, x: number, z: number): void {
        if (!this.stuck.check(player, x, z)) {
            walkTo(player, x, z);
            return;
        }

        if (this.stuck.desperatelyStuck) {
            teleportNear(player, x, z);
            this.stuck.reset();
            return;
        }

        if (openNearbyGate(player, 5)) return;

        const dx = x - player.x;
        const dz = z - player.z;

        const escX = player.x + (Math.abs(dz) > Math.abs(dx) ? randInt(-10, 10) : (dx > 0 ? 10 : -10));
        const escZ = player.z + (Math.abs(dx) > Math.abs(dz) ? randInt(-10, 10) : (dz > 0 ? 10 : -10));

        walkTo(player, escX, escZ);
    }

    isComplete(): boolean {
        return false;
    }
}
