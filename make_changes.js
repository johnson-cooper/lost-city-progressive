const fs = require('fs');

let knowledge = fs.readFileSync('./engine/src/engine/bot/BotKnowledge.ts', 'utf8');
let herbloreTask = fs.readFileSync('./engine/src/engine/bot/tasks/HerbloreTask.ts', 'utf8');

knowledge = knowledge.replace(
    /    EYE_OF_NEWT: 221,\s*\/\/ secondary ingredient for attack potion \(Betty \/ Port Sarim\)\r?\n    UNFINISHED_GUAM: 91,\s*\/\/ guamvial — guam_leaf \+ vial_of_water\r?\n    ATTACK_POTION: 2428,\s*\/\/ 4dose1attack \(full dose, e\.g\. from Entrana drop\)\r?\n    ATTACK_POTION_3: 121\s*\/\/ 3dose1attack — freshly brewed unf_guam \+ eye_of_newt/g,
    `    // Secondaries
    EYE_OF_NEWT: 221,       // attack potion (Betty / Port Sarim)
    UNICORN_HORN_DUST: 235, // antipoison potion
    LIMPWURT_ROOT: 225,     // strength potion
    RED_SPIDERS_EGGS: 223,  // restore potion
    SNAPE_GRASS: 231,       // prayer restore potion

    // Unfinished Potions
    UNFINISHED_GUAM: 91,        // guamvial
    UNFINISHED_MARRENTILL: 93,  // marrentillvial
    UNFINISHED_TARROMIN: 95,    // tarrominvial
    UNFINISHED_HARRALANDER: 97, // harralandervial
    UNFINISHED_RANARR: 99,      // ranarrvial

    // Finished Potions (3-dose)
    ATTACK_POTION_3: 121,       // 3dose1attack
    ANTIPOISON_POTION_3: 175,   // 3doseantipoison
    STRENGTH_POTION_3: 115,     // 3dose1strength
    RESTORE_POTION_3: 127,      // 3dosestatrestore
    PRAYER_POTION_3: 139,       // 3doseprayerrestore

    ATTACK_POTION: 2428  // 4dose1attack (full dose, e.g. from Entrana drop)`
);

knowledge = knowledge.replace(
    /    HERBLORE: \[\r?\n        \{\r?\n            minLevel: 1,\r?\n            maxLevel: 99,\r?\n            action: 'herblore_attack',\r?\n            location: Locations\.AEMAD_SUPPLIES,\s*\/\/ placeholder — task uses teleJump\r?\n            toolItemIds: \[\],\s*\/\/ no persistent tool needed\r?\n            xpPerAction: 250,\s*\/\/ 25\.0 XP per attack potion × 10\r?\n            ticksPerAction: 3,\r?\n            successRate: 1\.0,\r?\n            itemConsumed: Items\.CLEAN_GUAM,\s*\/\/ consumed per batch\r?\n            itemGained:   Items\.ATTACK_POTION_3\s*\/\/ 3-dose attack potion \(freshly brewed\)\r?\n        \}\r?\n    \],/g,
    `    HERBLORE: [
        {
            minLevel: 1,
            maxLevel: 4,
            action: 'herblore_attack',
            location: Locations.AEMAD_SUPPLIES,   // placeholder — task uses teleJump
            toolItemIds: [],                       // no persistent tool needed
            xpPerAction: 250,                      // 25.0 XP per attack potion × 10
            ticksPerAction: 3,
            successRate: 1.0,
            itemConsumed: Items.CLEAN_GUAM,        // consumed per batch
            itemGained:   Items.ATTACK_POTION_3    // 3-dose attack potion (freshly brewed)
        },
        {
            minLevel: 5,
            maxLevel: 11,
            action: 'herblore_antipoison',
            location: Locations.AEMAD_SUPPLIES,
            toolItemIds: [],
            xpPerAction: 375,                      // 37.5 XP
            ticksPerAction: 3,
            successRate: 1.0,
            itemConsumed: Items.CLEAN_MARRENTILL,
            itemGained:   Items.ANTIPOISON_POTION_3
        },
        {
            minLevel: 12,
            maxLevel: 21,
            action: 'herblore_strength',
            location: Locations.AEMAD_SUPPLIES,
            toolItemIds: [],
            xpPerAction: 500,                      // 50.0 XP
            ticksPerAction: 3,
            successRate: 1.0,
            itemConsumed: Items.CLEAN_TARROMIN,
            itemGained:   Items.STRENGTH_POTION_3
        },
        {
            minLevel: 22,
            maxLevel: 37,
            action: 'herblore_restore',
            location: Locations.AEMAD_SUPPLIES,
            toolItemIds: [],
            xpPerAction: 625,                      // 62.5 XP
            ticksPerAction: 3,
            successRate: 1.0,
            itemConsumed: Items.CLEAN_HARRALANDER,
            itemGained:   Items.RESTORE_POTION_3
        },
        {
            minLevel: 38,
            maxLevel: 99,
            action: 'herblore_prayer',
            location: Locations.AEMAD_SUPPLIES,
            toolItemIds: [],
            xpPerAction: 875,                      // 87.5 XP
            ticksPerAction: 3,
            successRate: 1.0,
            itemConsumed: Items.CLEAN_RANARR,
            itemGained:   Items.PRAYER_POTION_3
        }
    ],`
);

herbloreTask = herbloreTask.replace(
    /import \{ interactHeldOpU, interactUseLocOp \} from '\#\/engine\/bot\/BotAction\.js';/g,
    `import { interactHeldOp, interactHeldOpU, interactUseLocOp } from '#/engine/bot/BotAction.js';\nimport { cleanGrimyHerbs } from '#/engine/bot/tasks/BotTaskBase.js';`
);

herbloreTask = herbloreTask.replace(
    /import type \{ SkillStep \} from '#\/engine\/bot\/BotKnowledge\.js';/g,
    `import type { SkillStep } from '#/engine/bot/BotKnowledge.js';\nimport { GRIMY_HERB_MAP } from '#/engine/bot/BotKnowledge.js';`
);

herbloreTask = herbloreTask.replace(
    /type HerbloreState =/g,
    `// Mappings based on the primary herb (step.itemConsumed)
const POTION_RECIPES: Record<number, { unf: number, secondary: number, finished: number, secondaryCost: number }> = {
    [Items.CLEAN_GUAM]:        { unf: Items.UNFINISHED_GUAM,        secondary: Items.EYE_OF_NEWT,       finished: Items.ATTACK_POTION_3,     secondaryCost: 3 },
    [Items.CLEAN_MARRENTILL]:  { unf: Items.UNFINISHED_MARRENTILL,  secondary: Items.UNICORN_HORN_DUST, finished: Items.ANTIPOISON_POTION_3, secondaryCost: 0 }, // no shop
    [Items.CLEAN_TARROMIN]:    { unf: Items.UNFINISHED_TARROMIN,    secondary: Items.LIMPWURT_ROOT,     finished: Items.STRENGTH_POTION_3,   secondaryCost: 0 }, // no shop
    [Items.CLEAN_HARRALANDER]: { unf: Items.UNFINISHED_HARRALANDER, secondary: Items.RED_SPIDERS_EGGS,  finished: Items.RESTORE_POTION_3,    secondaryCost: 0 }, // no shop
    [Items.CLEAN_RANARR]:      { unf: Items.UNFINISHED_RANARR,      secondary: Items.SNAPE_GRASS,       finished: Items.PRAYER_POTION_3,     secondaryCost: 0 }  // no shop
};

type HerbloreState =`
);

herbloreTask = herbloreTask.replace(
    /type HerbloreState =[\s\S]*?;/g,
    `type HerbloreState =
    | 'buy_vials'    // teleport + find Aemad + trade + buy empty vials
    | 'fill_vials'   // teleport to Falador fountain + fill all empty vials
    | 'buy_newt'     // teleport + find Betty + trade + buy eye of newt (only for guam)
    | 'bank_walk'    // advance to nearest bank
    | 'withdraw'     // withdraw herbs and secondaries
    | 'clean_herbs'  // clean grimy herbs before mixing
    | 'mix_unf'      // mix vial_of_water + clean_herb → unfinished potion (loop)
    | 'mix_pot'      // mix unfinished_potion + secondary → finished potion (loop)
    | 'deposit';     // bank all potions, reset cycle`
);

herbloreTask = herbloreTask.replace(
    /        const guamCount = this\._totalItem\(player, Items\.CLEAN_GUAM\);\r?\n        if \(guamCount < MIN_GUAMS\) return false;\r?\n\r?\n        \/\/ Need coins for at least one batch\r?\n        const coins = this\._totalCoins\(player\);\r?\n        if \(coins < MIN_COINS\) return false;/g,
    `        const recipe = POTION_RECIPES[this.step.itemConsumed!];
        if (!recipe) return false;

        // Need herbs available (bank or inventory) - check both clean and grimy
        let herbCount = this._totalItem(player, this.step.itemConsumed!); // clean
        // We can find the grimy herb from GRIMY_HERB_MAP
        const grimyHerbId = Object.keys(GRIMY_HERB_MAP).find(
            key => GRIMY_HERB_MAP[Number(key)][0] === this.step.itemConsumed
        );
        if (grimyHerbId) {
            herbCount += this._totalItem(player, Number(grimyHerbId));
        }

        if (herbCount < MIN_GUAMS) return false;

        // Need coins for at least one batch
        const coins = this._totalCoins(player);
        const recipeCost = 2 + recipe.secondaryCost;
        if (recipeCost > 0 && coins < BATCH_MAX * recipeCost) return false;`
);

herbloreTask = herbloreTask.replace(
    /            case 'buy_newt': \{[\s\S]*?(?=            case 'bank_walk':)/g,
    `            case 'buy_newt': {
                const recipe = POTION_RECIPES[this.step.itemConsumed!];
                if (recipe.secondaryCost === 0) {
                    this._log(player, 'secondary not bought from shop, skipping buy');
                    this.state = 'bank_walk';
                    this.shopPhase = 0;
                    return;
                }

                // Skip if we already have enough secondaries
                if (countItem(player, recipe.secondary) >= BATCH_MAX) {
                    this._log(player, 'already have secondaries, skipping buy');
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
                    recipe.secondary,
                    recipe.secondaryCost, // cost per secondary
                    'bank_walk'
                );
                return;
            }\n\n`
);

herbloreTask = herbloreTask.replace(
    /            case 'withdraw': \{[\s\S]*?(?=            \/\/ ── 6\. Mix unfinished guam potions)/g,
    `            case 'withdraw': {
                const recipe = POTION_RECIPES[this.step.itemConsumed!];
                const vialWater = countItem(player, Items.VIAL_OF_WATER);

                // If secondary is not shop-bought, we need to withdraw it
                if (recipe.secondaryCost === 0) {
                    const secondaryInBank = this._totalItem(player, recipe.secondary) - countItem(player, recipe.secondary);
                    const toWithdrawSecondary = Math.min(vialWater - countItem(player, recipe.secondary), secondaryInBank);
                    if (toWithdrawSecondary > 0) {
                        this._withdrawItems(player, recipe.secondary, toWithdrawSecondary);
                    }
                }

                const secondaryCount = countItem(player, recipe.secondary);
                // How many complete potions can we make?
                const pairs = Math.min(vialWater, secondaryCount);
                if (pairs === 0) {
                    // Nothing to mix — restart supply run
                    this._log(player, 'no mixing pairs available → restart');
                    this._depositAll(player);
                    this.state = 'buy_vials';
                    this.shopPhase = 0;
                    return;
                }

                // Withdraw clean or grimy herbs
                let withdrawn = this._withdrawItems(player, this.step.itemConsumed!, pairs);
                if (!withdrawn) {
                    const grimyHerbId = Object.keys(GRIMY_HERB_MAP).find(
                        key => GRIMY_HERB_MAP[Number(key)][0] === this.step.itemConsumed
                    );
                    if (grimyHerbId) {
                        withdrawn = this._withdrawItems(player, Number(grimyHerbId), pairs);
                    }
                }

                if (!withdrawn) {
                    this._log(player, 'no herbs in bank → interrupt');
                    this.interrupt();
                    return;
                }
                this.brewFailCount = 0;
                this.state = 'clean_herbs';
                this.cooldown = 1;
                return;
            }

            case 'clean_herbs': {
                const inv = player.getInventory(InvType.INV);
                if (!inv) return;

                // Find a grimy herb in inventory
                let grimySlot = -1;
                let grimyId = -1;
                for (let i = 0; i < inv.capacity; i++) {
                    const item = inv.get(i);
                    if (item && GRIMY_HERB_MAP[item.id]) {
                        grimySlot = i;
                        grimyId = item.id;
                        break;
                    }
                }

                if (grimySlot === -1) {
                    // All herbs clean → proceed
                    this.state = 'mix_unf';
                    return;
                }

                const prevClean = countItem(player, GRIMY_HERB_MAP[grimyId][0]);
                // Send op1 (clean)
                const ok = interactHeldOp(player, inv, grimyId, grimySlot, 1);
                const newClean = countItem(player, GRIMY_HERB_MAP[grimyId][0]);

                if (ok && newClean > prevClean) {
                    this.watchdog.notifyActivity();
                    this.brewFailCount = 0;
                    this.cooldown = 1;
                } else {
                    this.brewFailCount++;
                    if (this.brewFailCount >= BREW_FAIL_LIMIT) {
                        this._log(player, 'clean failed, simulating manually');
                        // Use cleanGrimyHerbs to clean remaining
                        cleanGrimyHerbs(player);
                        this.brewFailCount = 0;
                    }
                    this.cooldown = 1;
                }
                return;
            }\n\n`
);

herbloreTask = herbloreTask.replace(
    /            case 'mix_unf': \{[\s\S]*?(?=            \/\/ ── 7\. Mix attack potions)/g,
    `            case 'mix_unf': {
                const vialSlot = this._findSlot(player, Items.VIAL_OF_WATER);
                const herbSlot = this._findSlot(player, this.step.itemConsumed!);

                if (vialSlot === -1 || herbSlot === -1) {
                    // All unfinished potions mixed → proceed to add secondaries
                    this._log(player, 'unf mix done → mix_pot');
                    this.brewFailCount = 0;
                    this.state = 'mix_pot';
                    return;
                }

                const inv = player.getInventory(InvType.INV);
                if (!inv) return;

                const recipe = POTION_RECIPES[this.step.itemConsumed!];
                const prevUnf = countItem(player, recipe.unf);
                const ok = interactHeldOpU(player, inv,
                    Items.VIAL_OF_WATER, vialSlot,
                    this.step.itemConsumed!,    herbSlot
                );
                const newUnf = countItem(player, recipe.unf);

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
            }\n\n`
);

herbloreTask = herbloreTask.replace(
    /            case 'mix_pot': \{[\s\S]*?(?=            \/\/ ── 8\. Deposit attack potions)/g,
    `            // ── 7. Mix finished potions ────────────────────────────────────────
            case 'mix_pot': {
                const recipe = POTION_RECIPES[this.step.itemConsumed!];
                const unfSlot  = this._findSlot(player, recipe.unf);
                const newtSlot = this._findSlot(player, recipe.secondary);

                if (unfSlot === -1 || newtSlot === -1) {
                    // All potions mixed → deposit and start next cycle
                    this._log(player, 'potion mix done → deposit');
                    this.state = 'deposit';
                    return;
                }

                const inv = player.getInventory(InvType.INV);
                if (!inv) return;

                const prevPot = countItem(player, recipe.finished);
                const ok = interactHeldOpU(player, inv,
                    recipe.unf, unfSlot,
                    recipe.secondary,     newtSlot
                );
                const newPot = countItem(player, recipe.finished);

                if (ok && newPot > prevPot) {
                    this.watchdog.notifyActivity();
                    this.brewFailCount = 0;
                    this.cooldown = 1;
                } else {
                    this.brewFailCount++;
                    if (this.brewFailCount >= BREW_FAIL_LIMIT) {
                        this._log(player, 'potion brew failed, simulating manually');
                        this._manualBrewPot(player);
                        this.brewFailCount = 0;
                    }
                    this.cooldown = 1;
                }
                return;
            }\n\n`
);

herbloreTask = herbloreTask.replace(
    /    private _withdrawGuams\(player: Player, count: number\): boolean \{[\s\S]*?(?=    private _depositAll\(player: Player\): void \{)/g,
    `    private _withdrawItems(player: Player, itemId: number, count: number): boolean {
        const bid = bankInvId();
        if (bid === -1) return false;

        const bank = player.getInventory(bid);
        const inv  = player.getInventory(InvType.INV);
        if (!bank || !inv) return false;

        for (let i = 0; i < bank.capacity; i++) {
            const item = bank.get(i);
            if (!item || item.id !== itemId) continue;

            // Free slots in inventory
            let freeSlots = 0;
            for (let j = 0; j < inv.capacity; j++) {
                if (inv.get(j) === null) freeSlots++;
            }

            const toTake = Math.min(count, item.count, freeSlots);
            if (toTake <= 0) break;

            const removed = bank.remove(itemId, toTake);
            if (removed.completed > 0) {
                inv.add(itemId, removed.completed);
                return true;
            }
        }
        return false;
    }\n\n`
);

herbloreTask = herbloreTask.replace(
    /\/\*\* Manually mixes one vial_of_water \+ guam_leaf → unf_guam\. No XP \(correct\)\. \*\/\r?\n    private _manualBrewUnf\(player: Player\): void \{[\s\S]*?(?=\/\*\* Manually mixes one unf_guam \+ eye_of_newt → attack_potion_3 \+ 25 XP\. \*\/)/g,
    `/** Manually mixes one vial_of_water + clean_herb → unfinished_potion. No XP (correct). */
    private _manualBrewUnf(player: Player): void {
        const recipe = POTION_RECIPES[this.step.itemConsumed!];
        if (!hasItem(player, Items.VIAL_OF_WATER) || !hasItem(player, this.step.itemConsumed!)) return;
        removeItem(player, Items.VIAL_OF_WATER, 1);
        removeItem(player, this.step.itemConsumed!,    1);
        addItem(player, recipe.unf, 1);
        this.watchdog.notifyActivity();
    }

    `
);

herbloreTask = herbloreTask.replace(
    /\/\*\* Manually mixes one unf_guam \+ eye_of_newt → attack_potion_3 \+ 25 XP\. \*\/\r?\n    private _manualBrewPot\(player: Player\): void \{[\s\S]*?(?=    \/\/ ── Inventory helpers)/g,
    `/** Manually mixes one unfinished_potion + secondary → finished potion + XP. */
    private _manualBrewPot(player: Player): void {
        const recipe = POTION_RECIPES[this.step.itemConsumed!];
        if (!hasItem(player, recipe.unf) || !hasItem(player, recipe.secondary)) return;
        removeItem(player, recipe.unf, 1);
        removeItem(player, recipe.secondary,     1);
        addItem(player, recipe.finished, 1);
        addXp(player, PlayerStat.HERBLORE, this.step.xpPerAction); // XP per potion
        this.watchdog.notifyActivity();
    }

`
);

fs.writeFileSync('./engine/src/engine/bot/BotKnowledge.ts', knowledge);
fs.writeFileSync('./engine/src/engine/bot/tasks/HerbloreTask.ts', herbloreTask);
