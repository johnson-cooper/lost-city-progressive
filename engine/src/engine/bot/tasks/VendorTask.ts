/**
 * VendorTask.ts
 *
 * "Extras" personality — vendor bot.
 * Carries a fixed stack (5k–8k) of noted random items to Varrock West Bank,
 * announces what they're selling, and accepts player trades to sell them.
 */

import {
    interactIF_UseOp,
    interactIfButtonByName,
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
    private stockMax = 0;       // original stocked amount — never decremented
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
        this.stockMax = 0;
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
        this.stockMax = this.itemCount;

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

        player.say(`Hi ${target.displayName}! ${this.stock?.name ?? 'items'} @ ${this.stock?.priceEach ?? 0}gp ea - put up gp and I'll offer what you can afford!`);
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

        if (player.botTradeTargetStage === 0) {
            // Wait for player to put up coins before offering items.
            let gpOffered = 0;
            for (let i = 0; i < 28; i++) {
                const item = this._getItemFromSlotInv(target, i, 90);
                if (item && item.id === Items.COINS) {
                    gpOffered = item.count;
                    break;
                }
            }

            if (!this.stock || gpOffered < this.stock.priceEach) {
                // Not enough GP yet — remind player occasionally.
                if (Math.random() < 0.3) {
                    if (gpOffered > 0) {
                        player.say(`Need at least ${this.stock?.priceEach ?? 0}gp for 1 item. You have ${gpOffered}gp up.`);
                    } else {
                        player.say(`Put up your gp and I'll offer what you can afford! (${this.stock?.priceEach ?? 0}gp ea)`);
                    }
                }
                this.cooldown = randInt(4, 7);
                return;
            }

            // Calculate how many items the player can afford.
            const canAfford = Math.min(Math.floor(gpOffered / this.stock.priceEach), this.itemCount);
            this.requestedCount = canAfford;
            this.requestedTotal = canAfford * this.stock.priceEach;

            // Trim our inventory to exactly canAfford items so "offer all" yields the right amount.
            const inv = player.getInventory(InvType.INV);
            if (inv && canAfford < this.itemCount) {
                const excess = this.itemCount - canAfford;
                inv.remove(this.stock.notedId, excess);
            }
            this.itemCount = canAfford;

            // Find the slot and offer all (now exactly canAfford items in inventory).
            if (inv) {
                for (let slot = 0; slot < inv.capacity; slot++) {
                    const item = inv.get(slot);
                    if (!item || item.id !== this.stock.notedId) continue;
                    interactIF_UseOp(player, Interfaces.TRADE_SIDE_INV, item.id, slot, 4, InvType.INV);
                    break;
                }
            }

            player.say(`Offering ${canAfford}x noted ${this.stock.name} for ${this.requestedTotal}gp. Accept when ready!`);
            player.botTradeTargetStage = 1;
            this.cooldown = randInt(3, 5);
            return;
        }

        if (player.botTradeTargetStage === 1) {
            // Items have been offered — move to confirm/accept.
            this.state = 'trade_confirm';
            this.cooldown = randInt(2, 4);
        }
    }

    private handleTradeConfirm(player: Player): void {
        const target = this._getTradeTarget(player);
        if (!target) {
            this._resetTrade(player, 'target lost');
            return;
        }

        // Re-verify coins are still there before accepting.
        let gpOffered = 0;
        for (let i = 0; i < 28; i++) {
            const item = this._getItemFromSlotInv(target, i, 90);
            if (item && item.id === Items.COINS) {
                gpOffered = item.count;
                break;
            }
        }

        if (gpOffered >= this.requestedTotal && this.requestedTotal > 0) {
            interactIfButtonByName(player, 'trademain:accept');
            this.state = 'trade_finalize';
            this.cooldown = randInt(2, 4);
        } else {
            // Coins were removed — remind player.
            if (Math.random() < 0.3) {
                player.say(`Still need ${this.requestedTotal}gp up, you have ${gpOffered}gp.`);
            }
            this.cooldown = randInt(5, 8);
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
                interactIfButtonByName(player, 'tradeconfirm:accept');
            } else {
                interactIfButtonByName(player, 'tradeconfirm:decline');
                scam = true;
            }
        }

        if (scam) {
            player.say(`Needed ${this.requestedTotal}gp, you offered ${gpOffered}. Declined!`);
        } else {
            player.say(Math.random() < 0.5 ? 'Pleasure doing business!' : 'Ty!');
            // itemCount was already updated when we trimmed inventory.
            // If trade completed: items went to player, coins came to us. Count is correct.
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

        // Replenish inventory back to the original stock amount so the bot
        // never "runs out" — vendors have effectively infinite supply.
        if (this.stock && this.stockMax > 0) {
            const inv = player.getInventory(InvType.INV);
            if (inv) {
                // Clear any leftover partial stack then restore the full original amount.
                for (let slot = 0; slot < inv.capacity; slot++) {
                    const existing = inv.get(slot);
                    if (existing && existing.id === this.stock.notedId) {
                        inv.remove(this.stock.notedId, existing.count);
                    }
                }
                inv.add(this.stock.notedId, this.stockMax);
            }
            this.itemCount = this.stockMax;
        }

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
