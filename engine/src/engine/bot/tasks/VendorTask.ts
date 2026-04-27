/**
 * VendorTask.ts
 *
 * "Extras" personality — vendor bot.
 * Carries a fixed stack (5k–8k) of noted random items to Varrock West Bank,
 * announces what they're selling, and accepts player trades to sell them.
 */

import {
    interactIF_UseOp,
    interactIfButton,
    interactPlayerOp,
} from '#/engine/bot/BotAction.js';
import { findClosest, Interfaces, Items, Locations } from '#/engine/bot/BotKnowledge.js';
import {
    BotTask,
    Player,
    InvType,
    walkTo,
    isNear,
    randInt,
    StuckDetector,
    ProgressWatchdog,
    openNearbyGate,
    teleportNear,
} from '#/engine/bot/tasks/BotTaskBase.js';
import World from '#/engine/World.js';

interface VendorStock {
    notedId: number;
    name: string;
    priceEach: number;
}

const VENDOR_ITEMS: VendorStock[] = [
    { notedId: Items.IRON_ORE + 1,      name: 'Iron ore',    priceEach: 350  },
    { notedId: Items.COAL + 1,           name: 'Coal',        priceEach: 650  },
    { notedId: Items.LOGS + 1,           name: 'Logs',        priceEach: 150  },
    { notedId: Items.OAK_LOGS + 1,       name: 'Oak logs',    priceEach: 50   },
    { notedId: Items.WILLOW_LOGS + 1,    name: 'Willow logs', priceEach: 50   },
    { notedId: Items.YEW_LOGS + 1,       name: 'Yew logs',    priceEach: 400  },
    { notedId: Items.RAW_LOBSTER + 1,    name: 'Raw lobster', priceEach: 200  },
    { notedId: Items.BIG_BONES + 1,      name: 'Big bones',   priceEach: 300  },
    { notedId: Items.MITHRIL_ORE + 1,    name: 'Mithril ore', priceEach: 500  },
    { notedId: Items.RAW_SWORDFISH + 1,  name: 'Swordfish',   priceEach: 300  },
];

export class VendorTask extends BotTask {
    private state: 'init' | 'walk' | 'idle' | 'trade_init' | 'trade_offer' | 'trade_confirm' | 'trade_finalize' = 'init';

    private stock: VendorStock | null = null;
    private itemCount = 0;
    private currentOfferSlot = 0;

    private requestedCount = 0;
    private requestedTotal = 0;

    private duration = 3600; // ticks before restocking
    private readonly stuck = new StuckDetector(10, 2, 1);
    private readonly watchdog = new ProgressWatchdog();

    constructor() {
        super('Vendor');
    }

    shouldRun(): boolean {
        return true;
    }

    tick(player: Player): void {
        if (this.interrupted) return;

        if (this.watchdog.check(player, false)) {
            this.interrupt();
            return;
        }

        if (this.cooldown > 0) {
            this.cooldown--;
            return;
        }

        // Incoming trade request — handle it regardless of current idle state.
        if (player.botTradeTargetPid !== -1 && !this._isTradeState()) {
            this.state = 'trade_init';
        }

        if (this.duration > 0) {
            this.duration--;
        } else {
            // Restock with a new item.
            this.state = 'init';
            this.duration = randInt(2400, 3600);
        }

        switch (this.state) {
            case 'init':         return this.handleInit(player);
            case 'walk':         return this.handleWalk(player);
            case 'idle':         return this.handleIdle(player);
            case 'trade_init':   return this.handleTradeInit(player);
            case 'trade_offer':  return this.handleTradeOffer(player);
            case 'trade_confirm':return this.handleTradeConfirm(player);
            case 'trade_finalize': return this.handleTradeFinalize(player);
        }
    }

    isComplete(): boolean {
        return false;
    }

    override reset(): void {
        super.reset();
        this.state = 'init';
        this.stock = null;
        this.itemCount = 0;
        this.duration = 3600;
        this.currentOfferSlot = 0;
        this.stuck.reset();
        this.watchdog.reset();
    }

    // ── States ────────────────────────────────────────────────────────────────

    private handleInit(player: Player): void {
        // Clear any previous stock from inventory.
        const inv = player.getInventory(InvType.INV);
        if (inv) {
            for (let slot = 0; slot < inv.capacity; slot++) {
                const item = inv.get(slot);
                if (!item) continue;
                if (item.id === Items.COINS) continue;
                inv.remove(item.id, item.count);
            }
        }

        // Pick a random stock item and give it to the bot.
        const picked = VENDOR_ITEMS[Math.floor(Math.random() * VENDOR_ITEMS.length)];
        this.stock = picked;
        this.itemCount = randInt(5000, 8000);

        if (inv) {
            inv.add(picked.notedId, this.itemCount);
        }

        console.log(`[VendorTask] ${player.displayName} stocking ${this.itemCount}x noted ${picked.name} @ ${picked.priceEach}gp ea`);

        this.state = 'walk';
        this.cooldown = randInt(2, 4);
    }

    private handleWalk(player: Player): void {
        const [bx, bz] = Locations.VARROCK_WEST_BANK;
        if (Math.abs(player.x - bx) > 80 || Math.abs(player.z - bz) > 80) {
            teleportNear(player, bx, bz);
            this.cooldown = randInt(2, 3);
            return;
        }

        const dest = findClosest(player, [
            Locations.VARROCK_WEST_BANK,
            Locations.FIRE_VARROCK_ROAD,
        ]);

        if (!dest) return;
        const [lx, lz] = dest;

        if (!isNear(player, lx, lz, 3)) {
            this._stuckWalk(player, lx, lz);
            this.cooldown = 1;
            return;
        }

        this.state = 'idle';
        this.cooldown = randInt(4, 8);
    }

    private handleIdle(player: Player): void {
        if (!this.stock || this.itemCount <= 0) {
            this.state = 'init';
            return;
        }

        // Drift slightly around the bank.
        if (Math.random() < 0.2) {
            const [bx, bz] = Locations.VARROCK_WEST_BANK;
            walkTo(player, bx + randInt(-3, 3), bz + randInt(-2, 2));
        }

        // Announce stock.
        const roll = Math.random();
        if (roll < 0.3) {
            player.say(`Selling ${this.itemCount}x noted ${this.stock.name} @ ${this.stock.priceEach}gp ea`);
        } else if (roll < 0.5) {
            player.say(`${this.stock.name} (noted) ${this.stock.priceEach}gp ea | pm me`);
        } else if (roll < 0.65) {
            player.say(`WTS ${this.itemCount} noted ${this.stock.name}`);
        }

        this.watchdog.notifyActivity();
        this.cooldown = randInt(12, 20);
    }

    private handleTradeInit(player: Player): void {
        const target = this._getTradeTarget(player);
        if (!target) {
            this._resetTrade(player, 'no target');
            return;
        }

        player.say(`Hi ${target.displayName}! ${this.stock?.name ?? 'items'} @ ${this.stock?.priceEach ?? 0}gp ea - how many?`);
        interactPlayerOp(player, target.slot, 4);
        this.watchdog.notifyActivity();
        player.botTradeTargetStage = 0;
        this.state = 'trade_offer';
        this.currentOfferSlot = 0;
        this.cooldown = randInt(4, 6);
    }

    private handleTradeOffer(player: Player): void {
        const target = this._getTradeTarget(player);
        if (!target) {
            this._resetTrade(player, 'target lost');
            return;
        }

        switch (player.botTradeTargetStage) {
            case 0: {
                // Offer all our noted stock into the trade screen.
                const inv = player.getInventory(InvType.INV);
                if (!inv) break;

                for (; this.currentOfferSlot < inv.capacity; this.currentOfferSlot++) {
                    const item = inv.get(this.currentOfferSlot);
                    if (!item) continue;
                    if (this.stock && (item.id === this.stock.notedId)) {
                        interactIF_UseOp(player, Interfaces.TRADE_SIDE_INV, item.id, this.currentOfferSlot, 4, 90);
                        this.requestedCount = item.count;
                        break;
                    }
                }
                player.botTradeTargetStage = 1;
                break;
            }
            case 1: {
                if (!this.stock) break;
                this.requestedTotal = this.requestedCount * this.stock.priceEach;
                player.say(`Offering ${this.requestedCount}x noted ${this.stock.name}. Total: ${this.requestedTotal}gp - put up coins and I'll accept.`);
                this.state = 'trade_confirm';
                break;
            }
        }

        this.cooldown = randInt(4, 8);
    }

    private handleTradeConfirm(player: Player): void {
        const target = this._getTradeTarget(player);
        if (!target) {
            this._resetTrade(player, 'target lost');
            return;
        }

        // Check how many coins the player has offered.
        let gpOffered = 0;
        for (let i = 0; i < 28; i++) {
            const item = this._getItemFromSlotInv(target, i, 90);
            if (item && item.id === Items.COINS) {
                gpOffered = item.count;
                break;
            }
        }

        if (gpOffered >= this.requestedTotal && this.requestedTotal > 0) {
            this.state = 'trade_finalize';
            this.cooldown = randInt(2, 4);
        } else {
            // Not enough coins yet, remind player.
            if (Math.random() < 0.25) {
                player.say(`Need ${this.requestedTotal}gp, you offered ${gpOffered}.`);
            }
            this.cooldown = randInt(6, 10);
        }
    }

    private handleTradeFinalize(player: Player): void {
        const target = this._getTradeTarget(player);
        let scam = false;

        let gpOffered = 0;
        if (target) {
            for (let i = 0; i < 28; i++) {
                const item = this._getItemFromSlotInv(target, i, 90);
                if (item && item.id === Items.COINS) {
                    gpOffered = item.count;
                    break;
                }
            }

            if (gpOffered >= this.requestedTotal) {
                interactIfButton(player, 3546); // accept
            } else {
                interactIfButton(player, 3548); // decline
                scam = true;
            }
        }

        if (scam) {
            player.say(`Needed ${this.requestedTotal}gp, you offered ${gpOffered}. Declined!`);
        } else {
            player.say(Math.random() < 0.5 ? 'Pleasure doing business!' : 'Ty!');
            // Reduce our tracked count (approximate — actual count managed by engine).
            this.itemCount = Math.max(0, this.itemCount - this.requestedCount);
        }

        this._resetTrade(player);
        this.cooldown = randInt(20, 30);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private _isTradeState(): boolean {
        return this.state.startsWith('trade_');
    }

    private _getTradeTarget(player: Player): Player | null {
        if (player.botTradeTargetPid === -1) return null;
        const other = World.getPlayerByUid(player.botTradeTargetPid);
        if (other && player.inOperableDistance(other)) return other;
        return null;
    }

    private _getItemFromSlotInv(player: Player, slot: number, invId: number) {
        const inv = player.getInventory(invId);
        if (!inv) return null;
        return inv.get(slot) ?? null;
    }

    private _resetTrade(player: Player, reason?: string): void {
        if (reason) console.log(`[VendorTask] Trade reset: ${reason}`);
        player.botTradeTargetPid = -1;
        player.botTradeTargetStage = -1;
        player.botTradeTargetChatName = '';
        player.botTradeTargetChatMessage = '';
        this.requestedCount = 0;
        this.requestedTotal = 0;
        this.currentOfferSlot = 0;
        this.state = this.itemCount > 0 ? 'idle' : 'init';
    }

    private _stuckWalk(player: Player, tx: number, tz: number): void {
        if (!this.stuck.check(player, tx, tz)) {
            walkTo(player, tx, tz);
            return;
        }
        if (this.stuck.desperatelyStuck) {
            teleportNear(player, tx, tz);
            this.stuck.reset();
            return;
        }
        if (openNearbyGate(player, 20)) return;
        walkTo(player, player.x + randInt(-8, 8), player.z + randInt(-8, 8));
    }
}
