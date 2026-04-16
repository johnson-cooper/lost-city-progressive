/**
 * HerbloreTask.ts
 *
 * Makes attack potions from scratch in a four-phase supply run:
 *   1. Buy empty vials  — Aemad's Adventuring Supplies, East Ardougne
 *   2. Fill vials       — Fountain near Falador west bank  (one at a time)
 *   3. Buy eye of newt  — Betty's Magic Emporium, Port Sarim
 *   4. Mix at bank      — withdraw guams → mix unf → mix attack potions
 *
 * All travel between the four sites uses player.teleJump() so the bot
 * never needs pathfinding across distant areas.
 *
 * Brew mechanics
 * ──────────────
 * Unfinished guam:  [opheldu,vial_water] triggers attempt_brew_potion.
 *                   No XP awarded.
 * Attack potion:    [opheldu,guamvial]   triggers attempt_brew_potion.
 *                   25 XP (250 internal) per successful brew.
 *
 * Both mixing steps fall back to direct inventory simulation when the
 * server script doesn't run (map_members=false or similar).
 */

import {
    BotTask,
    Player,
    InvType,
    walkTo,
    interactNpcOp,
    findNpcByName,
    findNpcByPrefix,
    findLocByName,
    findLocByPrefix,
    hasItem,
    countItem,
    addItem,
    removeItem,
    addXp,
    getBaseLevel,
    PlayerStat,
    Items,
    Locations,
    isNear,
    bankInvId,
    StuckDetector,
    ProgressWatchdog,
    advanceBankWalk
} from '#/engine/bot/tasks/BotTaskBase.js';
import type { SkillStep } from '#/engine/bot/BotKnowledge.js';
import { interactHeldOpU, interactUseLocOp } from '#/engine/bot/BotAction.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum vials (and guams, and newts) processed per cycle. */
const BATCH_MAX = 9;

/** Minimum guams in bank + inventory to start the task. */
const MIN_GUAMS = 5;

/** Minimum coins needed for one full batch. */
const MIN_COINS = BATCH_MAX * (2 + 3); // 9 × (vial 2gp + newt 3gp) = 45

/** Ticks to wait after interacting with a shop NPC before buying. */
const SHOP_WAIT_TICKS = 3;

/** Ticks to wait after calling a brew/fill interaction before checking result. */
const BREW_WAIT_TICKS = 2;

/** After this many failed brew attempts per item, simulate manually. */
const BREW_FAIL_LIMIT = 3;

type HerbloreState =
    | 'buy_vials'    // teleport + find Aemad + trade + buy empty vials
    | 'fill_vials'   // teleport to Falador fountain + fill all empty vials
    | 'buy_newt'     // teleport + find Betty + trade + buy eye of newt
    | 'bank_walk'    // advance to nearest bank
    | 'withdraw'     // withdraw guams equal to vial_water count
    | 'mix_unf'      // mix vial_of_water + guam_leaf → unfinished guam (loop)
    | 'mix_pot'      // mix unfinished_guam + eye_of_newt → attack potion (loop)
    | 'deposit';     // bank all potions, reset cycle

// ── Shop sub-phase index (buy_vials / buy_newt states) ────────────────────────
// 0 = teleport to shop, 1 = find NPC + open trade, 2 = wait for shop UI, 3 = buy items
type ShopPhase = 0 | 1 | 2 | 3;

export class HerbloreTask extends BotTask {
    private readonly step: SkillStep;

    private state: HerbloreState = 'buy_vials';
    private shopPhase: ShopPhase = 0;
    private shopWaitTicks = 0;
    private brewFailCount = 0;

    private readonly stuck = new StuckDetector(30, 4, 2);
    private readonly watchdog = new ProgressWatchdog(400);

    constructor(step: SkillStep) {
        super('Herblore');
        this.step = step;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    shouldRun(player: Player): boolean {
        const level = getBaseLevel(player, PlayerStat.HERBLORE);
        if (level < 1) return false;

        // Need guams available (bank or inventory)
        const guamCount = this._totalItem(player, Items.CLEAN_GUAM);
        if (guamCount < MIN_GUAMS) return false;

        // Need coins for at least one batch
        const coins = this._totalCoins(player);
        if (coins < MIN_COINS) return false;

        return true;
    }

    isComplete(_player: Player): boolean {
        return false;
    }

    reset(): void {
        super.reset();
        this.state = 'buy_vials';
        this.shopPhase = 0;
        this.shopWaitTicks = 0;
        this.brewFailCount = 0;
        this.stuck.reset();
        this.watchdog.reset();
    }

    // ── Tick ──────────────────────────────────────────────────────────────────

    tick(player: Player): void {
        if (this.interrupted) return;

        const banking = this.state === 'bank_walk';
        if (this.watchdog.check(player, banking)) {
            this.interrupt();
            return;
        }

        if (this.cooldown > 0) {
            this.cooldown--;
            return;
        }

        this._tick(player);
    }

    private _tick(player: Player): void {
        switch (this.state) {

            // ── 1. Buy vials from Aemad (East Ardougne) ─────────────────────
            case 'buy_vials': {
                // Skip if we already have enough vials (or water) for a full batch
                const haveVials = countItem(player, Items.VIAL_EMPTY) + countItem(player, Items.VIAL_OF_WATER);
                if (haveVials >= BATCH_MAX) {
                    this._log(player, 'already have vials, skipping buy');
                    this.state = 'fill_vials';
                    this.shopPhase = 0;
                    return;
                }

                this._runShopPhase(
                    player,
                    Locations.AEMAD_SUPPLIES,
                    'aemad',
                    Items.VIAL_EMPTY,
                    2, // cost per vial
                    'fill_vials'
                );
                return;
            }

            // ── 2. Fill vials at Falador fountain ────────────────────────────
            case 'fill_vials': {
                // Done if no empty vials remain
                const emptyCount = countItem(player, Items.VIAL_EMPTY);
                if (emptyCount === 0) {
                    this._log(player, 'all vials filled → buy_newt');
                    this.state = 'buy_newt';
                    this.shopPhase = 0;
                    return;
                }

                this._doFillVials(player);
                return;
            }

            // ── 3. Buy eye of newt from Betty (Port Sarim) ───────────────────
            case 'buy_newt': {
                // Skip if we already have enough newts
                if (countItem(player, Items.EYE_OF_NEWT) >= BATCH_MAX) {
                    this._log(player, 'already have newts, skipping buy');
                    this.state = 'bank_walk';
                    this.shopPhase = 0;
                    return;
                }

                // Buy as many as we have vial_water (one newt per potion)
                const newtNeeded = countItem(player, Items.VIAL_OF_WATER);
                if (newtNeeded === 0) {
                    // No vials of water — something went wrong, restart cycle
                    this._log(player, 'no vial_water → restart cycle');
                    this.state = 'buy_vials';
                    this.shopPhase = 0;
                    return;
                }

                this._runShopPhase(
                    player,
                    Locations.PORT_SARIM_HERBS,
                    'betty',
                    Items.EYE_OF_NEWT,
                    3, // cost per eye of newt
                    'bank_walk'
                );
                return;
            }

            // ── 4. Walk to nearest bank ───────────────────────────────────────
            case 'bank_walk': {
                const result = advanceBankWalk(player, this.stuck);
                if (result === 'walk') return;
                this.cooldown = result === 'ready' ? 3 : 0;
                this.state = 'withdraw';
                return;
            }

            // ── 5. Withdraw guams equal to number of vials of water ───────────
            case 'withdraw': {
                const vialWater = countItem(player, Items.VIAL_OF_WATER);
                const eyeNewt   = countItem(player, Items.EYE_OF_NEWT);
                // How many complete potions can we make?
                const pairs = Math.min(vialWater, eyeNewt);
                if (pairs === 0) {
                    // Nothing to mix — restart supply run
                    this._log(player, 'no mixing pairs available → restart');
                    this._depositAll(player);
                    this.state = 'buy_vials';
                    this.shopPhase = 0;
                    return;
                }

                const withdrawn = this._withdrawGuams(player, pairs);
                if (!withdrawn) {
                    this._log(player, 'no guams in bank → interrupt');
                    this.interrupt();
                    return;
                }
                this.brewFailCount = 0;
                this.state = 'mix_unf';
                this.cooldown = 1;
                return;
            }

            // ── 6. Mix unfinished guam potions ───────────────────────────────
            // interactHeldOpU fires [opheldu,vial_water] which calls executeScript
            // synchronously, so the inventory update happens on the same tick.
            // We check the result immediately and only fall back manually on repeated
            // failures (e.g. map_members=false blocks the server script).
            case 'mix_unf': {
                const vialSlot = this._findSlot(player, Items.VIAL_OF_WATER);
                const guamSlot = this._findSlot(player, Items.CLEAN_GUAM);

                if (vialSlot === -1 || guamSlot === -1) {
                    // All unfinished potions mixed → proceed to add secondaries
                    this._log(player, 'unf mix done → mix_pot');
                    this.brewFailCount = 0;
                    this.state = 'mix_pot';
                    return;
                }

                const inv = player.getInventory(InvType.INV);
                if (!inv) return;

                const prevUnf = countItem(player, Items.UNFINISHED_GUAM);
                const ok = interactHeldOpU(player, inv,
                    Items.VIAL_OF_WATER, vialSlot,
                    Items.CLEAN_GUAM,    guamSlot
                );
                const newUnf = countItem(player, Items.UNFINISHED_GUAM);

                if (ok && newUnf > prevUnf) {
                    // Brew succeeded
                    this.watchdog.notifyActivity();
                    this.brewFailCount = 0;
                    this.cooldown = 1; // brief delay between successive brews
                } else {
                    // Script blocked (members check / delayed / wrong items)
                    this.brewFailCount++;
                    if (this.brewFailCount >= BREW_FAIL_LIMIT) {
                        this._log(player, 'unf brew failed, simulating manually');
                        this._manualBrewUnf(player);
                        this.brewFailCount = 0;
                    }
                    this.cooldown = 1;
                }
                return;
            }

            // ── 7. Mix attack potions ────────────────────────────────────────
            // interactHeldOpU fires [opheldu,guamvial] → synchronous execute.
            case 'mix_pot': {
                const unfSlot  = this._findSlot(player, Items.UNFINISHED_GUAM);
                const newtSlot = this._findSlot(player, Items.EYE_OF_NEWT);

                if (unfSlot === -1 || newtSlot === -1) {
                    // All potions mixed → deposit and start next cycle
                    this._log(player, 'attack potion mix done → deposit');
                    this.state = 'deposit';
                    return;
                }

                const inv = player.getInventory(InvType.INV);
                if (!inv) return;

                const prevPot = countItem(player, Items.ATTACK_POTION_3);
                const ok = interactHeldOpU(player, inv,
                    Items.UNFINISHED_GUAM, unfSlot,
                    Items.EYE_OF_NEWT,     newtSlot
                );
                const newPot = countItem(player, Items.ATTACK_POTION_3);

                if (ok && newPot > prevPot) {
                    this.watchdog.notifyActivity();
                    this.brewFailCount = 0;
                    this.cooldown = 1;
                } else {
                    this.brewFailCount++;
                    if (this.brewFailCount >= BREW_FAIL_LIMIT) {
                        this._log(player, 'attack brew failed, simulating manually');
                        this._manualBrewPot(player);
                        this.brewFailCount = 0;
                    }
                    this.cooldown = 1;
                }
                return;
            }

            // ── 8. Deposit attack potions and any leftover vials ─────────────
            case 'deposit': {
                this._depositAll(player);
                this._log(player, 'cycle complete → buy_vials');
                this.state = 'buy_vials';
                this.shopPhase = 0;
                this.cooldown = 2;
                return;
            }
        }
    }

    // ── Shop helper (shared by buy_vials and buy_newt) ────────────────────────

    /**
     * Drives a four-phase shop visit:
     *   Phase 0 — teleJump to shop location
     *   Phase 1 — find NPC by name, then call interactNpcOp op3 (Trade)
     *   Phase 2 — wait SHOP_WAIT_TICKS for shop UI to open
     *   Phase 3 — buy items via direct inventory simulation
     */
    private _runShopPhase(
        player: Player,
        location: [number, number, number],
        npcName: string,
        itemId: number,
        costEach: number,
        nextState: HerbloreState
    ): void {
        const [sx, sz, sl] = location;

        switch (this.shopPhase) {
            case 0: {
                // Teleport directly to the shop area
                player.teleJump(sx, sz, sl);
                this.shopPhase = 1;
                this.cooldown = 2;
                return;
            }
            case 1: {
                // Find shop NPC
                const npc = findNpcByName(player.x, player.z, player.level, npcName, 15)
                    ?? findNpcByPrefix(player.x, player.z, player.level, npcName, 15);
                if (!npc) {
                    // NPC not found yet — wait a tick (might still be loading after teleport)
                    this.shopWaitTicks++;
                    if (this.shopWaitTicks >= 10) {
                        // Give up and teleport again
                        this._log(player, `NPC '${npcName}' not found after 10 ticks; re-teleporting`);
                        this.shopPhase = 0;
                        this.shopWaitTicks = 0;
                    }
                    return;
                }
                // NPC found — reset tick counter so phase 2 wait starts fresh
                this.shopWaitTicks = 0;
                interactNpcOp(player, npc, 3); // op3 = Trade on all shops
                this.shopPhase = 2;
                this.cooldown = 1;
                return;
            }
            case 2: {
                // Waiting for shop UI to open
                this.shopWaitTicks++;
                if (this.shopWaitTicks >= SHOP_WAIT_TICKS) {
                    this.shopPhase = 3;
                    this.shopWaitTicks = 0;
                }
                return;
            }
            case 3: {
                // Buy items (direct inventory simulation, same as ShopTripTask)
                const qty = this._buyFromShop(player, itemId, costEach);
                this._log(player, `bought ${qty}× item #${itemId}`);
                this.shopPhase = 0;
                this.state = nextState as HerbloreState;
                this.cooldown = 1;
                return;
            }
        }
    }

    // ── Fill vials at fountain ────────────────────────────────────────────────

    private _doFillVials(player: Player): void {
        // Teleport to Falador fountain if not already there
        const [fx, fz, fl] = Locations.FALADOR_FOUNTAIN;
        if (!isNear(player, fx, fz, 25, fl)) {
            player.teleJump(fx, fz, fl);
            this.cooldown = 2;
            return;
        }

        // Find a watersource loc nearby
        const fountain =
            findLocByName(player.x, player.z, player.level, 'fountain', 30)
            ?? findLocByPrefix(player.x, player.z, player.level, 'fountain', 30)
            ?? findLocByName(player.x, player.z, player.level, 'pump', 30)
            ?? findLocByName(player.x, player.z, player.level, 'sink', 30);

        if (!fountain) {
            this._log(player, 'no watersource found near Falador; manual-filling all vials');
            this._manualFillAllVials(player);
            this.state = 'buy_newt';
            this.shopPhase = 0;
            return;
        }

        // Walk adjacent to the fountain if needed
        if (!isNear(player, fountain.x, fountain.z, 1)) {
            walkTo(player, fountain.x, fountain.z);
            return;
        }

        // Use one vial_empty on the fountain
        const vialSlot = this._findSlot(player, Items.VIAL_EMPTY);
        if (vialSlot === -1) {
            // All filled
            this.state = 'buy_newt';
            this.shopPhase = 0;
            return;
        }

        const prevWater = countItem(player, Items.VIAL_OF_WATER);
        const ok = interactUseLocOp(player, fountain, Items.VIAL_EMPTY, vialSlot);

        if (ok) {
            this.cooldown = BREW_WAIT_TICKS;
            // Check immediately in case server processes synchronously
            if (countItem(player, Items.VIAL_OF_WATER) > prevWater) {
                this.watchdog.notifyActivity();
            }
        } else {
            // Interaction blocked (delayed, wrong item, etc.) — simulate manually
            this._log(player, 'fill interaction failed, simulating manually');
            this._manualFillAllVials(player);
            this.state = 'buy_newt';
            this.shopPhase = 0;
        }
    }

    // ── Bank helpers ──────────────────────────────────────────────────────────

    private _withdrawGuams(player: Player, count: number): boolean {
        const bid = bankInvId();
        if (bid === -1) return false;

        const bank = player.getInventory(bid);
        const inv  = player.getInventory(InvType.INV);
        if (!bank || !inv) return false;

        for (let i = 0; i < bank.capacity; i++) {
            const item = bank.get(i);
            if (!item || item.id !== Items.CLEAN_GUAM) continue;

            // Free slots in inventory
            let freeSlots = 0;
            for (let j = 0; j < inv.capacity; j++) {
                if (inv.get(j) === null) freeSlots++;
            }

            const toTake = Math.min(count, item.count, freeSlots);
            if (toTake <= 0) break;

            const removed = bank.remove(Items.CLEAN_GUAM, toTake);
            if (removed.completed > 0) {
                inv.add(Items.CLEAN_GUAM, removed.completed);
                return true;
            }
        }
        return false;
    }

    private _depositAll(player: Player): void {
        const bid = bankInvId();
        if (bid === -1) return;

        const bank = player.getInventory(bid);
        const inv  = player.getInventory(InvType.INV);
        if (!bank || !inv) return;

        // Keep coins; deposit everything else
        const keepIds = new Set<number>([Items.COINS]);

        for (let slot = 0; slot < inv.capacity; slot++) {
            const item = inv.get(slot);
            if (!item || keepIds.has(item.id)) continue;
            const moved = inv.remove(item.id, item.count);
            if (moved.completed > 0) bank.add(item.id, moved.completed);
        }
    }

    // ── Shop buying ───────────────────────────────────────────────────────────

    /** Direct inventory simulation: spend coins, add items. Returns qty bought. */
    private _buyFromShop(player: Player, itemId: number, costEach: number): number {
        const coins = countItem(player, Items.COINS);
        const inv   = player.getInventory(InvType.INV);
        if (!inv || costEach <= 0) return 0;

        // Count free slots
        let freeSlots = 0;
        for (let j = 0; j < inv.capacity; j++) {
            if (inv.get(j) === null) freeSlots++;
        }

        const canAfford = Math.floor(coins / costEach);
        const qty = Math.min(BATCH_MAX, canAfford, freeSlots);
        if (qty <= 0) return 0;

        removeItem(player, Items.COINS, qty * costEach);
        addItem(player, itemId, qty);
        return qty;
    }

    // ── Manual fallbacks ──────────────────────────────────────────────────────

    /** Converts all vial_empty in inventory to vial_water without server script. */
    private _manualFillAllVials(player: Player): void {
        const inv = player.getInventory(InvType.INV);
        if (!inv) return;
        for (let slot = 0; slot < inv.capacity; slot++) {
            const item = inv.get(slot);
            if (!item || item.id !== Items.VIAL_EMPTY) continue;
            inv.remove(Items.VIAL_EMPTY, 1);
            inv.add(Items.VIAL_OF_WATER, 1);
        }
        this.watchdog.notifyActivity();
    }

    /** Manually mixes one vial_of_water + guam_leaf → unf_guam. No XP (correct). */
    private _manualBrewUnf(player: Player): void {
        if (!hasItem(player, Items.VIAL_OF_WATER) || !hasItem(player, Items.CLEAN_GUAM)) return;
        removeItem(player, Items.VIAL_OF_WATER, 1);
        removeItem(player, Items.CLEAN_GUAM,    1);
        addItem(player, Items.UNFINISHED_GUAM, 1);
        this.watchdog.notifyActivity();
    }

    /** Manually mixes one unf_guam + eye_of_newt → attack_potion_3 + 25 XP. */
    private _manualBrewPot(player: Player): void {
        if (!hasItem(player, Items.UNFINISHED_GUAM) || !hasItem(player, Items.EYE_OF_NEWT)) return;
        removeItem(player, Items.UNFINISHED_GUAM, 1);
        removeItem(player, Items.EYE_OF_NEWT,     1);
        addItem(player, Items.ATTACK_POTION_3, 1);
        addXp(player, PlayerStat.HERBLORE, this.step.xpPerAction); // 250 = 25.0 XP
        this.watchdog.notifyActivity();
    }

    // ── Inventory helpers ─────────────────────────────────────────────────────

    private _findSlot(player: Player, itemId: number): number {
        const inv = player.getInventory(InvType.INV);
        if (!inv) return -1;
        for (let i = 0; i < inv.capacity; i++) {
            const item = inv.get(i);
            if (item && item.id === itemId) return i;
        }
        return -1;
    }

    private _totalItem(player: Player, itemId: number): number {
        let total = countItem(player, itemId);
        const bid = bankInvId();
        if (bid === -1) return total;
        const bank = player.getInventory(bid);
        if (!bank) return total;
        for (let i = 0; i < bank.capacity; i++) {
            const it = bank.get(i);
            if (it?.id === itemId) total += it.count;
        }
        return total;
    }

    private _totalCoins(player: Player): number {
        let total = countItem(player, Items.COINS);
        const bid = bankInvId();
        if (bid === -1) return total;
        const bank = player.getInventory(bid);
        if (!bank) return total;
        for (let i = 0; i < bank.capacity; i++) {
            const it = bank.get(i);
            if (it?.id === Items.COINS) total += it.count;
        }
        return total;
    }

    private _log(player: Player, msg: string): void {
        console.log(`[HerbloreTask][${player.username}][${this.state}] ${msg}`);
    }
}
