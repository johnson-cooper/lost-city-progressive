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
import { Interfaces, Items, Locations } from '#/engine/bot/BotKnowledge.js';
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
// 🔥 High-tier weapons & gear
{ notedId: Items.RUNE_SCIMITAR + 1, name: 'Rune scimitar', priceEach: 25000 },
{ notedId: Items.RUNE_2H_SWORD + 1, name: 'Rune 2h sword', priceEach: 40000 },
{ notedId: Items.RUNE_LONGSWORD + 1, name: 'Rune longsword', priceEach: 32000 },
{ notedId: Items.RUNE_KITESHIELD + 1, name: 'Rune kiteshield', priceEach: 35000 },

{ notedId: Items.DRAGON_DAGGER + 1, name: 'Dragon dagger', priceEach: 60000 },
{ notedId: Items.DRAGON_MED_HELM + 1, name: 'Dragon med helm', priceEach: 100000 },
{ notedId: Items.DRAGON_SQ_SHIELD + 1, name: 'Dragon sq shield', priceEach: 150000 },

// 🏹 Ranged BIS
{ notedId: Items.MAGIC_SHORTBOW + 1, name: 'Magic shortbow', priceEach: 30000 },
{ notedId: Items.MAGIC_LONGBOW + 1, name: 'Magic longbow', priceEach: 25000 },
{ notedId: Items.RUNE_ARROWHEADS + 1, name: 'Rune arrowheads', priceEach: 400 },
{ notedId: Items.ADAMANT_ARROWHEADS + 1, name: 'Adamant arrowheads', priceEach: 200 },

// 🧙 Magic essentials
{ notedId: Items.DEATH_RUNE + 1, name: 'Death rune', priceEach: 400 },
{ notedId: Items.BLOOD_RUNE + 1, name: 'Blood rune', priceEach: 500 },
{ notedId: Items.CHAOS_RUNE + 1, name: 'Chaos rune', priceEach: 120 },
{ notedId: Items.NATURE_RUNE + 1, name: 'Nature rune', priceEach: 250 },
{ notedId: Items.LAW_RUNE + 1, name: 'Law rune', priceEach: 300 },
{ notedId: Items.COSMIC_RUNE + 1, name: 'Cosmic rune', priceEach: 150 },

// 🧪 Potions (huge utility)
{ notedId: Items.PRAYER_POTION_3 + 1, name: 'Prayer potion (3)', priceEach: 8000 },
{ notedId: Items.STRENGTH_POTION_3 + 1, name: 'Strength potion (3)', priceEach: 3000 },
{ notedId: Items.ATTACK_POTION_3 + 1, name: 'Attack potion (3)', priceEach: 1500 },
{ notedId: Items.ANTIPOISON_POTION_3 + 1, name: 'Antipoison (3)', priceEach: 2000 },
{ notedId: Items.RESTORE_POTION_3 + 1, name: 'Restore potion (3)', priceEach: 2500 },

// 🍖 Food meta
{ notedId: Items.RAW_SHARK + 1, name: 'Raw shark', priceEach: 1000 },
{ notedId: Items.RAW_MANTA_RAY + 1, name: 'Raw manta ray', priceEach: 1200 },
{ notedId: Items.RAW_SEA_TURTLE + 1, name: 'Raw sea turtle', priceEach: 1100 },
{ notedId: Items.SWORDFISH + 1, name: 'Swordfish', priceEach: 400 },

// ⛏️ Skilling core
{ notedId: Items.RUNE_ESSENCE + 1, name: 'Rune essence', priceEach: 50 },
{ notedId: Items.COAL + 1, name: 'Coal', priceEach: 700 },
{ notedId: Items.MITHRIL_ORE + 1, name: 'Mithril ore', priceEach: 600 },
{ notedId: Items.IRON_ORE + 1, name: 'Iron ore', priceEach: 300 },

// 🌲 Logs progression
{ notedId: Items.LOGS + 1, name: 'Logs', priceEach: 100 },
{ notedId: Items.OAK_LOGS + 1, name: 'Oak logs', priceEach: 150 },
{ notedId: Items.WILLOW_LOGS + 1, name: 'Willow logs', priceEach: 200 },
{ notedId: Items.MAPLE_LOGS + 1, name: 'Maple logs', priceEach: 300 },
{ notedId: Items.YEW_LOGS + 1, name: 'Yew logs', priceEach: 500 },
{ notedId: Items.MAGIC_LOGS + 1, name: 'Magic logs', priceEach: 1000 },

// 💎 Crafting / money makers
{ notedId: Items.UNCUT_DIAMOND + 1, name: 'Uncut diamond', priceEach: 2000 },
{ notedId: Items.UNCUT_RUBY + 1, name: 'Uncut ruby', priceEach: 1200 },
{ notedId: Items.UNCUT_EMERALD + 1, name: 'Uncut emerald', priceEach: 800 },
{ notedId: Items.UNCUT_SAPPHIRE + 1, name: 'Uncut sapphire', priceEach: 500 },
{ notedId: Items.DRAGONSTONE + 1, name: 'Dragonstone', priceEach: 10000 },

// 🧪 Herblore secondaries (high demand)
{ notedId: Items.EYE_OF_NEWT + 1, name: 'Eye of newt', priceEach: 300 },
{ notedId: Items.SNAPE_GRASS + 1, name: 'Snape grass', priceEach: 800 },
{ notedId: Items.LIMPWURT_ROOT + 1, name: 'Limpwurt root', priceEach: 700 },
{ notedId: Items.RED_SPIDERS_EGGS + 1, name: 'Red spiders eggs', priceEach: 900 },

// 🌿 High-tier herbs
{ notedId: Items.GRIMY_RANARR + 1, name: 'Grimy ranarr', priceEach: 8000 },
{ notedId: Items.GRIMY_KWUARM + 1, name: 'Grimy kwuarm', priceEach: 5000 },
{ notedId: Items.GRIMY_CADANTINE + 1, name: 'Grimy cadantine', priceEach: 6000 },
{ notedId: Items.GRIMY_TORSTOL + 1, name: 'Grimy torstol', priceEach: 10000 },

// 🦴 Prayer training
{ notedId: Items.DRAGON_BONES + 1, name: 'Dragon bones', priceEach: 3000 },
{ notedId: Items.BABYDRAGON_BONES + 1, name: 'Babydragon bones', priceEach: 1500 },
{ notedId: Items.BIG_BONES + 1, name: 'Big bones', priceEach: 300 },

// 🧵 Fletching essentials
{ notedId: Items.BOW_STRING + 1, name: 'Bow string', priceEach: 200 },
{ notedId: Items.ARROW_SHAFT + 1, name: 'Arrow shaft', priceEach: 20 },

// 🛡️ Mid-tier gear (progression)
{ notedId: Items.ADAMANT_PLATEBODY + 1, name: 'Adamant platebody', priceEach: 40000 },
{ notedId: Items.MITHRIL_PLATEBODY + 1, name: 'Mithril platebody', priceEach: 20000 },
{ notedId: Items.BLACK_PLATEBODY + 1, name: 'Black platebody', priceEach: 10000 },

{ notedId: Items.ADAMANT_SCIMITAR + 1, name: 'Adamant scimitar', priceEach: 12000 },
{ notedId: Items.MITHRIL_SCIMITAR + 1, name: 'Mithril scimitar', priceEach: 6000 },

// 🎯 Extra economy fillers (useful bulk items)
{ notedId: Items.CAKE + 1, name: 'Cake', priceEach: 100 },

// 🧪 Supplies
{ notedId: Items.VIAL_OF_WATER + 1, name: 'Vial of water', priceEach: 50 },

{ notedId: Items.SOFT_CLAY + 1, name: 'Soft clay', priceEach: 200 },
{ notedId: Items.BUCKET_OF_WATER + 1, name: 'Bucket of water', priceEach: 50 },
{ notedId: Items.JUG_OF_WATER + 1, name: 'Jug of water', priceEach: 50 },
    { notedId: Items.BLUE_PARTYHAT + 1,  name: 'Blue Partyhat',   priceEach: 100000000  },
    { notedId: Items.RED_PARTYHAT + 1,  name: 'Red Partyhat',   priceEach: 100000000   },
    { notedId: Items.WHITE_PARTYHAT + 1,  name: 'White Partyhat',   priceEach: 100000000   },
    { notedId: Items.PURPLE_PARTYHAT + 1,  name: 'Purple Partyhat',   priceEach: 100000000   },
    { notedId: Items.GREEN_PARTYHAT + 1,  name: 'Green Partyhat',   priceEach: 100000000  },
    { notedId: Items.WHITE_PARTYHAT + 1,  name: 'White Partyhat',   priceEach: 100000000   },
    { notedId: Items.YELLOW_PARTYHAT + 1,  name: 'Yellow Partyhat',   priceEach: 100000000  },
    { notedId: Items.RED_HALLOWEEN_MASK + 1,  name: 'Red Halloween Mask',   priceEach: 100000000  },
    { notedId: Items.BLUE_HALLOWEEN_MASK + 1,  name: 'Blue Halloween Mask',   priceEach: 100000000 },
    { notedId: Items.GREEN_HALLOWEEN_MASK + 1,  name: 'Green Halloween Mask',   priceEach: 100000000 },
    { notedId: Items.SANTA_HAT + 1,  name: 'Santa Hat',   priceEach: 100000000   },
    
];

/**
 * Fixed stall positions spread outside Varrock West Bank.
 * All spots are on the accessible pavement/road — none inside the bank building.
 * Each vendor bot is assigned one position deterministically from its username
 * so bots never stack on top of each other.
 *
 * Anchor: VARROCK_WEST_BANK = [3185, 3444]  FIRE_VARROCK_ROAD = [3184, 3430]
 */
const VENDOR_SPOTS: Array<[number, number]> = [
    // ── In front of the bank entrance ────────────────────────
    [3181, 3439],
    [3181, 3438],
    [3181, 3437],
    [3194, 3439],
    // ── West side of the bank ─────────────────────────────────
    [3176, 3443],
    [3176, 3440],
    // ── East side of the bank ────────────────────────────────
    [3190, 3430],
    [3192, 3440],
    // ── Road going south ─────────────────────────────────────
    [3179, 3429],
    [3183, 3427],
    [3176, 3429],
    [3185, 3429],
];

export class VendorTask extends BotTask {
    private state: 'init' | 'walk' | 'idle' | 'trade_init' | 'trade_offer' | 'trade_confirm' | 'trade_finalize' = 'init';

    private stock: VendorStock | null = null;
    private itemCount = 0;
    private stockMax = 0;       // original stocked amount — never decremented
    private currentOfferSlot = 0;
    private assignedSpot: [number, number] | null = null; // deterministic stall position

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
        this.assignedSpot = null;
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
        // Resolve (once) the deterministic stall position for this bot.
        if (!this.assignedSpot) {
            this.assignedSpot = VENDOR_SPOTS[this._spotIndex(player.username)];
        }
        const [lx, lz] = this.assignedSpot;

        // Teleport if wildly far away.
        if (Math.abs(player.x - lx) > 80 || Math.abs(player.z - lz) > 80) {
            teleportNear(player, lx, lz);
            this.cooldown = randInt(2, 3);
            return;
        }

        if (!isNear(player, lx, lz, 2)) {
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

        // Drift slightly around the assigned stall — max ±1 tile so bots stay spread out.
        if (Math.random() < 0.2 && this.assignedSpot) {
            const [sx, sz] = this.assignedSpot;
            walkTo(player, sx + randInt(-1, 1), sz + randInt(-1, 1));
        }

        // Announce stock, always including the bot's name so players know who is selling.
        const name = player.displayName;
        const roll = Math.random();
        if (roll < 0.3) {
            player.say(`${name}: Selling ${this.itemCount}x noted ${this.stock.name} @ ${this.stock.priceEach}gp ea`);
        } else if (roll < 0.5) {
            player.say(`${name}: ${this.stock.name} (noted) ${this.stock.priceEach}gp ea | trade me`);
        } else if (roll < 0.65) {
            player.say(`${name} WTS ${this.itemCount} noted ${this.stock.name} - ${this.stock.priceEach}gp ea`);
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

    /**
     * Maps a username string to a consistent index into VENDOR_SPOTS.
     * Uses a simple djb2-style hash so the same bot always lands on the same spot.
     */
    private _spotIndex(username: string): number {
        let h = 5381;
        for (let i = 0; i < username.length; i++) {
            h = (Math.imul(h, 33) ^ username.charCodeAt(i)) | 0;
        }
        return Math.abs(h) % VENDOR_SPOTS.length;
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
