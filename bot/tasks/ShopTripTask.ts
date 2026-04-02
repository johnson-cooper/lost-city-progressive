/**
 * ShopTripTask.ts
 *
 * Walk to a shop NPC, trade, and buy a specific item.
 * Retries indefinitely until the item is purchased.
 * If coins run out, shouldRun() returns false and the planner re-routes.
 *
 * Stuck detection via StuckDetector catches both stationary bots and
 * oscillation (4-tile back-and-forth). After 5 failed escapes → teleport.
 */

import {
    BotTask, Player,
    walkTo, interactNpcOp, findNpcByName,
    hasItem, countItem, addItem, removeItem, isNear,
    Items, Shops,
    teleportToSafety, teleportNear, randInt, StuckDetector,
} from '#/engine/bot/tasks/BotTaskBase.js';

export class ShopTripTask extends BotTask {
    private readonly shopKey:  string;
    private readonly itemId:   number;
    private readonly quantity: number;
    private readonly costEach: number;
    private readonly npcName:  string;

    private state: 'walk' | 'find' | 'interact' | 'buy' | 'done' = 'walk';
    private waitTicks     = 0;
    private findFailTicks = 0;
    private readonly stuck = new StuckDetector(30, 4, 2);

    private static readonly NPC_NAMES: Record<string, string> = {
        BOB_AXES:            'bob',
        GERRANTS_FISHING:    'gerrant',
        VARROCK_SWORDS:      'swordshop1',
        VARROCK_ARCHERY:     'lowe',
        VARROCK_RUNES:       'aubury',
        AL_KHARID_SCIMITARS: 'zeke',
        LUMBRIDGE_GENERAL:   'generalshopkeeper1',
    };

    constructor(shopKey: string, itemId: number, quantity: number, costEach: number) {
        super('ShopTrip');
        this.shopKey  = shopKey;
        this.itemId   = itemId;
        this.quantity = quantity;
        this.costEach = costEach;
        this.npcName  = ShopTripTask.NPC_NAMES[shopKey] ?? shopKey;
    }

    shouldRun(player: Player): boolean {
        if (this.state === 'done') return false;
        // No point walking to shop if we can't afford anything
        if (countItem(player, Items.COINS) < this.costEach) return false;
        return true;
    }

    tick(player: Player): void {
        if (this.interrupted) return;
        if (this.cooldown > 0) { this.cooldown--; return; }

        const shop = Shops[this.shopKey];
        if (!shop) { this.state = 'done'; return; }
        const [sx, sz, sl] = shop.location;

        // ── Walk to shop ──────────────────────────────────────────────────────
        if (this.state === 'walk') {
            if (!isNear(player, sx, sz, 8, sl)) {
                this._stuckCheck(player, sx, sz);
                walkTo(player, sx, sz);
                return;
            }
            this.state         = 'find';
            this.findFailTicks = 0;
            return;
        }

        // ── Find shop NPC ─────────────────────────────────────────────────────
        if (this.state === 'find') {
            const npc = findNpcByName(player.x, player.z, player.level, this.npcName, 10);
            if (!npc) {
                this.findFailTicks++;
                walkTo(player, sx, sz);
                // NPC not found for a long time — teleport to shop and retry
                if (this.findFailTicks >= 40) {
                    teleportNear(player, sx, sz);
                    this.state         = 'find';
                    this.findFailTicks = 0;
                    this.stuck.reset();
                }
                return;
            }
            interactNpcOp(player, npc, 3); // op3 = Trade on all shops
            this.state     = 'interact';
            this.waitTicks = 0;
            return;
        }

        // ── Wait for shop to open ─────────────────────────────────────────────
        if (this.state === 'interact') {
            if (++this.waitTicks >= 3) this.state = 'buy';
            return;
        }

        // ── Buy item ──────────────────────────────────────────────────────────
        if (this.state === 'buy') {
            const bought = this._buy(player);
            if (bought > 0) {
                this.state = 'done';
            } else {
                // Ran out of coins during journey — reset and let planner decide
                this.state = 'walk';
            }
        }
    }

    isComplete(_p: Player): boolean { return this.state === 'done'; }

    override reset(): void {
        super.reset();
        this.state         = 'walk';
        this.waitTicks     = 0;
        this.findFailTicks = 0;
        this.stuck.reset();
    }

    private _buy(player: Player): number {
        const coins  = countItem(player, Items.COINS);
        const canBuy = Math.min(this.quantity, Math.floor(coins / this.costEach));
        if (canBuy <= 0) return 0;
        removeItem(player, Items.COINS, canBuy * this.costEach);
        addItem(player, this.itemId, canBuy);
        return canBuy;
    }

    private _stuckCheck(player: Player, destX: number, destZ: number): void {
        if (!this.stuck.check(player, destX, destZ)) return;
        if (this.stuck.desperatelyStuck) {
            teleportNear(player, destX, destZ);
            this.stuck.reset();
            return;
        }
        // Perpendicular escape to break oscillation
        const dx   = destX - player.x;
        const dz   = destZ - player.z;
        const escX = player.x + (Math.abs(dz) > Math.abs(dx) ? randInt(-10, 10) : (dz > 0 ? 10 : -10));
        const escZ = player.z + (Math.abs(dx) > Math.abs(dz) ? randInt(-10, 10) : (dx > 0 ? 10 : -10));
        walkTo(player, escX, escZ);
    }
}