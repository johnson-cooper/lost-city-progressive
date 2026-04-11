import BotPlayer from '../BotPlayer.js';
import { BotUtils } from './BotUtils.js';

// ==========================================
// THE HELPERS (Put these above your SkillBehaviors)
// ==========================================

// Handles world interactions (Mining, Woodcutting, Thieving, Fishing)
function handleAction(player: BotPlayer, ids: number | number[], action: string) {
    if (BotUtils.isFull(player)) return BotUtils.walkToBank(player); 
    if (player.target) return;
    
    const idArray = Array.isArray(ids) ? ids : [ids];
    const target = BotUtils.find(player, idArray);
    if (target) BotUtils.interact(player, target, action);
}

// Helper for finding NPCs specifically (for Thieving, Fishing)
function handleNpcAction(player: BotPlayer, ids: number | number[], action: string) {
    if (BotUtils.isFull(player)) return BotUtils.walkToBank(player); 
    if (player.target) return;
   
    const target = BotUtils.findNpc(player, 15); 
    if (target) BotUtils.interact(player, target, action);
}

// Handles inventory-only actions (Prayer, Cleaning Herbs, Fletching with knife)
function handleInventoryAction(player: BotPlayer, itemId: number, action: string) {
    if (BotUtils.isEmpty(player)) return BotUtils.walkToBank(player);
    if (player.target) return;

    if (BotUtils.hasItem(player, itemId)) {
        BotUtils.interactInventory(player, itemId, action);
    } else {
        BotUtils.walkToBank(player); // Out of supplies
    }
}

// Handles using items on world objects (Cooking on ranges, Smithing on furnaces, Runecrafting)
function handleItemOnObject(player: BotPlayer, itemId: number, objectId: number | number[]) {
    if (player.target) return;
    if (!BotUtils.hasItem(player, itemId)) return BotUtils.walkToBank(player);

    const objIds = Array.isArray(objectId) ? objectId : [objectId];
    const targetObj = BotUtils.find(player, objIds);
    if (targetObj) BotUtils.useItemOnObject(player, itemId, targetObj);
}

// Handles combat logic
function handleCombat(player: BotPlayer, npcIds: number | number[]) {
    if (BotUtils.isFull(player) || BotUtils.getHpPercent(player) < 20) return BotUtils.walkToBank(player);
    if (player.target) return; // Already fighting
    
    // In a full environment, verify `isDead()` and `isInCombat()` properties on target.
    const target = BotUtils.findNpc(player, 10);
    if (target) {
        BotUtils.interact(player, target, 'Attack');
    }
}


// ==========================================
// THE MASTER REGISTRY 
// ==========================================
export const SkillBehaviors: { [key: string]: (player: BotPlayer) => void } = {
   
    // ==========================================
    // WOODCUTTING (Object IDs)
    // ==========================================
    tree:       (player) => handleAction(player, [1276, 1277, 1278, 1279, 1280], 'Chop down'),
    oak:        (player) => handleAction(player, [1281], 'Chop down'),
    willow:     (player) => handleAction(player, [1308, 5551, 5552, 5553], 'Chop down'),
    maple:      (player) => handleAction(player, [1307, 4674], 'Chop down'),
    yew:        (player) => handleAction(player, [1309], 'Chop down'),
    magic:      (player) => handleAction(player, [1306], 'Chop down'),

    // ==========================================
    // MINING (Object IDs)
    // ==========================================
    clay:       (player) => handleAction(player, [2108, 2109], 'Mine'),
    tin:        (player) => handleAction(player, [2094, 2095], 'Mine'),
    copper:     (player) => handleAction(player, [2090, 2091], 'Mine'),
    iron:       (player) => handleAction(player, [2092, 2093], 'Mine'),
    silver:     (player) => handleAction(player, [2100, 2101], 'Mine'),
    coal:       (player) => handleAction(player, [2096, 2097], 'Mine'),
    gold:       (player) => handleAction(player, [2098, 2099], 'Mine'),
    mithril:    (player) => handleAction(player, [2102, 2103], 'Mine'),
    adamant:    (player) => handleAction(player, [2104, 2105], 'Mine'),
    rune:       (player) => handleAction(player, [2106, 2107], 'Mine'),

    // ==========================================
    // FISHING (NPC IDs - Lost City / 2004 era)
    // ==========================================
    shrimp:     (player) => handleNpcAction(player, 316, 'Net'),
    sardine:    (player) => handleNpcAction(player, 316, 'Bait'),
    trout:      (player) => handleNpcAction(player, 314, 'Lure'),
    pike:       (player) => handleNpcAction(player, 314, 'Bait'),
    lobster:    (player) => handleNpcAction(player, 312, 'Cage'),
    swordfish:  (player) => handleNpcAction(player, 312, 'Harpoon'),
    shark:      (player) => handleNpcAction(player, 313, 'Harpoon'),

    // ==========================================
    // THIEVING (NPC IDs)
    // ==========================================
    man:        (player) => handleNpcAction(player, [1, 2, 3, 4], 'Pickpocket'),
    farmer:     (player) => handleNpcAction(player, 7, 'Pickpocket'),
    guard:      (player) => handleNpcAction(player, 9, 'Pickpocket'),
    knight:     (player) => handleNpcAction(player, [23, 26], 'Pickpocket'),
    paladin:    (player) => handleNpcAction(player, 20, 'Pickpocket'),
    hero:       (player) => handleNpcAction(player, 21, 'Pickpocket'),

    // ==========================================
    // FIREMAKING (Item IDs used on Tinderbox)
    // ==========================================
    fm_normal:  (player) => handleAction(player, 1511, 'Light'), 
    fm_oak:     (player) => handleAction(player, 1521, 'Light'),
    fm_willow:  (player) => handleAction(player, 1519, 'Light'),
    fm_maple:   (player) => handleAction(player, 1517, 'Light'),
    fm_yew:     (player) => handleAction(player, 1515, 'Light'),
    fm_magic:   (player) => handleAction(player, 1513, 'Light'),

    // ==========================================
    // PRAYER (Burying Bones from Inventory)
    // ==========================================
    bones:          (player) => handleInventoryAction(player, 526, 'Bury'),
    bat_bones:      (player) => handleInventoryAction(player, 530, 'Bury'),
    big_bones:      (player) => handleInventoryAction(player, 532, 'Bury'),
    baby_dragon:    (player) => handleInventoryAction(player, 534, 'Bury'),
    dragon_bones:   (player) => handleInventoryAction(player, 536, 'Bury'),

    // ==========================================
    // COOKING (Using Raw Food on a Range ID: 114 or Fire ID: 2732)
    // ==========================================
    cook_beef:      (player) => handleItemOnObject(player, 2132, [114, 2732]),
    cook_chicken:   (player) => handleItemOnObject(player, 2138, [114, 2732]),
    cook_shrimp:    (player) => handleItemOnObject(player, 317, [114, 2732]),
    cook_trout:     (player) => handleItemOnObject(player, 335, [114, 2732]),
    cook_salmon:    (player) => handleItemOnObject(player, 331, [114, 2732]),
    cook_lobster:   (player) => handleItemOnObject(player, 377, [114, 2732]),
    cook_swordfish: (player) => handleItemOnObject(player, 371, [114, 2732]),
    cook_shark:     (player) => handleItemOnObject(player, 383, [114, 2732]),

    // ==========================================
    // SMITHING (Smelting Ore on Furnace ID: 116, 2643)
    // ==========================================
    smelt_bronze:   (player) => handleItemOnObject(player, 436, [116, 2643]), 
    smelt_iron:     (player) => handleItemOnObject(player, 440, [116, 2643]),
    smelt_silver:   (player) => handleItemOnObject(player, 442, [116, 2643]),
    smelt_steel:    (player) => handleItemOnObject(player, 440, [116, 2643]), 
    smelt_gold:     (player) => handleItemOnObject(player, 444, [116, 2643]),
    smelt_mithril:  (player) => handleItemOnObject(player, 447, [116, 2643]),
    smelt_adamant:  (player) => handleItemOnObject(player, 449, [116, 2643]),
    smelt_rune:     (player) => handleItemOnObject(player, 451, [116, 2643]),

    // ==========================================
    // FLETCHING (Cutting logs - assumes engine handles the Knife 946 dialogue)
    // ==========================================
    fletch_normal:  (player) => handleInventoryAction(player, 1511, 'Craft'), 
    fletch_oak:     (player) => handleInventoryAction(player, 1521, 'Craft'),
    fletch_willow:  (player) => handleInventoryAction(player, 1519, 'Craft'),
    fletch_maple:   (player) => handleInventoryAction(player, 1517, 'Craft'),
    fletch_yew:     (player) => handleInventoryAction(player, 1515, 'Craft'),
    fletch_magic:   (player) => handleInventoryAction(player, 1513, 'Craft'),

    // ==========================================
    // HERBLORE (Cleaning Grimy/Unidentified Herbs)
    // ==========================================
    clean_guam:     (player) => handleInventoryAction(player, 199, 'Clean'),
    clean_marentill:(player) => handleInventoryAction(player, 201, 'Clean'),
    clean_tarromin: (player) => handleInventoryAction(player, 203, 'Clean'),
    clean_harral:   (player) => handleInventoryAction(player, 205, 'Clean'),
    clean_ranarr:   (player) => handleInventoryAction(player, 207, 'Clean'),
    clean_toadflax: (player) => handleInventoryAction(player, 2998, 'Clean'),
    clean_irit:     (player) => handleInventoryAction(player, 209, 'Clean'),
    clean_avantoe:  (player) => handleInventoryAction(player, 211, 'Clean'),
    clean_kwuarm:   (player) => handleInventoryAction(player, 213, 'Clean'),
    clean_cadantine:(player) => handleInventoryAction(player, 215, 'Clean'),
    clean_lantadyme:(player) => handleInventoryAction(player, 2481, 'Clean'),
    clean_dwarf:    (player) => handleInventoryAction(player, 217, 'Clean'),
    clean_torstol:  (player) => handleInventoryAction(player, 219, 'Clean'),

    // ==========================================
    // RUNECRAFTING (Clicking Altars with Rune Essence 1436 in inventory)
    // ==========================================
    rc_air:         (player) => handleAction(player, 2478, 'Craft-rune'),
    rc_mind:        (player) => handleAction(player, 2479, 'Craft-rune'),
    rc_water:       (player) => handleAction(player, 2480, 'Craft-rune'),
    rc_earth:       (player) => handleAction(player, 2481, 'Craft-rune'),
    rc_fire:        (player) => handleAction(player, 2482, 'Craft-rune'),
    rc_body:        (player) => handleAction(player, 2483, 'Craft-rune'),
    rc_cosmic:      (player) => handleAction(player, 2484, 'Craft-rune'),
    rc_nature:      (player) => handleAction(player, 2486, 'Craft-rune'),
    rc_chaos:       (player) => handleAction(player, 2487, 'Craft-rune'),

    // ==========================================
    // CRAFTING (Cutting Uncut Gems with Chisel 1755)
    // ==========================================
    cut_sapphire:   (player) => handleInventoryAction(player, 1623, 'Craft'),
    cut_emerald:    (player) => handleInventoryAction(player, 1621, 'Craft'),
    cut_ruby:       (player) => handleInventoryAction(player, 1619, 'Craft'),
    cut_diamond:    (player) => handleInventoryAction(player, 1617, 'Craft'),
    cut_dragonstone:(player) => handleInventoryAction(player, 1631, 'Craft'),

    // ==========================================
    // COMBAT (Basic NPC Grinding)
    // ==========================================
    combat_chicken: (player) => handleCombat(player, [41, 1017]),
    combat_rat:     (player) => handleCombat(player, [86, 87]),
    combat_goblin:  (player) => handleCombat(player, [7, 11, 12, 17, 18]), 
    combat_cow:     (player) => handleCombat(player, [81, 397, 1766]), 
    combat_guard:   (player) => handleCombat(player, [9, 32]), 
    combat_hill_giant:(player) => handleCombat(player, 117),
    combat_moss_giant:(player) => handleCombat(player, 112),

    // ==========================================
    // BANKING (Utility)
    // ==========================================
    Banking:    (player) => {
        const nearestBank = BotUtils.getNearestBank(player);
        if (BotUtils.isNear(player, nearestBank)) {
            BotUtils.bankItems(player, [1351, 1265, 946, 1755, 303]); // Keep common tools
            player.activeBotSkill = player.previousBotSkill || "tree"; 
        } else {
            BotUtils.walkTo(player, nearestBank);
        }
    },

    // ==========================================
    // ADVANCED: FLAX SPINNER (Seers' Village)
    // ==========================================
    adv_flax_spinner: (player) => {
        const Locations = require('./Locations.js').Locations;
        if (BotUtils.isFull(player)) {
            // Need to spin it
            if (BotUtils.isNear(player, Locations.Seers.spinning_wheel)) {
                handleItemOnObject(player, 1779, 2644); // Use Flax on Wheel
            } else {
                BotUtils.walkTo(player, Locations.Seers.spinning_wheel);
            }
        } else {
            // Need to pick it
            if (BotUtils.isNear(player, Locations.Seers.flax_field)) {
                handleAction(player, 2646, 'Pick'); // Pick Flax
            } else {
                BotUtils.walkTo(player, Locations.Seers.flax_field);
            }
        }
    },

    // ==========================================
    // ADVANCED: AUTO-TYPER / MERCHANT (Varrock)
    // ==========================================
    adv_merchant: (player) => {
        const Locations = require('./Locations.js').Locations;
        if (!BotUtils.isNear(player, Locations.Varrock.west_bank)) {
            BotUtils.walkTo(player, Locations.Varrock.west_bank);
            return;
        }
        
        // Emulate an Auto-Typer by speaking every ~10 ticks (6 seconds)
        if (player.stepsTaken % 10 === 0) {
            BotUtils.speakPublicly(player, "cyan:wave: Selling lobbies 250ea! Trade me!");
        }

        // Mock trade acceptance hook logic would reside in the engine's TradeManager,
        // but this bot stays in its state accepting requests.
    },

    // ==========================================
    // ADVANCED: SAFE-SPOT RANGER / MAGE
    // ==========================================
    adv_safespot_ranger: (player) => {
        if (BotUtils.isFull(player) || BotUtils.getHpPercent(player) < 20) return BotUtils.walkToBank(player);
        if (player.target) return; // Already fighting
        
        const target = BotUtils.findNpc(player, 15); // e.g., Blue Dragon
        if (target && BotUtils.hasLineOfSight(player, target)) {
            // The bot uses BotUtils logic to verify LOS but maintain a distance > 1
            const dist = Math.abs(player.x - target.x) + Math.abs(player.z - target.z);
            if (dist > 3) {
                BotUtils.interact(player, target, 'Attack');
            } else {
                // Too close, walk back to a safe spot mock
                BotUtils.walkTo(player, { x: player.x - 2, z: player.z - 2 });
            }
        }
    }
};
