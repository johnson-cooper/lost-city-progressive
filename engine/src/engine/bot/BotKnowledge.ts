export const Items = {
    // Currency
    COINS:              995,

    // Axes  (all verified)
    BRONZE_AXE:         1351,
    IRON_AXE:           1349,
    STEEL_AXE:          1353,
    MITHRIL_AXE:        1355,
    ADAMANT_AXE:        1357,
    RUNE_AXE:           1359,

    // Pickaxes  (all verified)
    BRONZE_PICKAXE:     1265,
    IRON_PICKAXE:       1267,
    STEEL_PICKAXE:      1269,
    MITHRIL_PICKAXE:    1273,  // note: mithril before adamant in pack
    ADAMANT_PICKAXE:    1271,
    RUNE_PICKAXE:       1275,

    // Fishing gear  (internal names: net, big_net, fishing_bait)
    SMALL_FISHING_NET:  303,
    BIG_FISHING_NET:    305,
    FISHING_ROD:        307,
    FLY_FISHING_ROD:    309,
    HARPOON:            311,
    FISHING_BAIT:       313,
    FEATHER:            314,
    LOBSTER_POT:        301,

    // Logs  (all verified)
    LOGS:               1511,
    OAK_LOGS:           1521,
    WILLOW_LOGS:        1519,
    MAPLE_LOGS:         1517,
    YEW_LOGS:           1515,

    // Ores  (all verified)
    COPPER_ORE:         436,
    TIN_ORE:            438,
    IRON_ORE:           440,
    COAL:               453,
    MITHRIL_ORE:        447,
    ADAMANTITE_ORE:     449,

    // Bars  (all verified)
    BRONZE_BAR:         2349,
    IRON_BAR:           2351,
    STEEL_BAR:          2353,
    MITHRIL_BAR:        2359,

    // Raw fish  (all verified)
    RAW_SHRIMP:         317,
    RAW_SARDINE:        327,
    RAW_HERRING:        345,
    RAW_TROUT:          335,
    RAW_SALMON:         331,
    RAW_LOBSTER:        377,
    RAW_SWORDFISH:      371,

    // Cooked fish  (all verified)
    SHRIMP:             315,
    SARDINE:            325,
    HERRING:            343,
    TROUT:              333,
    SALMON:             329,
    LOBSTER:            379,
    SWORDFISH:          373,

    // Combat drops
    BONES:              526,
    BIG_BONES:          532,
    COW_HIDE:           1739,  // internal name: cow_hide

    // ── Goblin / early combat drops ──────────────────────────────────────────
    GOBLIN_MAIL:        288,
    BRONZE_MED_HELM:    1139,
    BRONZE_FULL_HELM:   1155,
    BRONZE_SQ_SHIELD:   1173,
    BRONZE_KITESHIELD:  1189,

    BRONZE_DAGGER:      1205,
    BRONZE_LONGSWORD:   1291,
    BRONZE_2H_SWORD:    1307,

    // ── Iron drops (early upgrade tier) ─────────────────────────────────────
    IRON_MED_HELM:      1141,
    IRON_FULL_HELM:     1153,
    IRON_SQ_SHIELD:     1175,
    IRON_KITESHIELD:    1191,

    IRON_DAGGER:        1203,
    IRON_LONGSWORD:     1293,
    IRON_2H_SWORD:      1309,

    // Food
    BREAD:              2309,

    // Firemaking
    TINDERBOX:          590,

    // Weapons — swords (Varrock sword shop)
    BRONZE_SWORD:       1277,
    IRON_SWORD:         1279,
    STEEL_SWORD:        1281,
    MITHRIL_SWORD:      1285,
    ADAMANT_SWORD:      1287,

    // Weapons — scimitars (Al Kharid, Zeke's only)
    BRONZE_SCIMITAR:    1321,
    IRON_SCIMITAR:      1323,
    STEEL_SCIMITAR:     1325,
    MITHRIL_SCIMITAR:   1329,

    // Bows (Varrock archery shop)
    SHORTBOW:           841,
    OAK_SHORTBOW:       843,
    LONGBOW:            839,

    // Arrows (Varrock archery shop)
    BRONZE_ARROW:       882,
    IRON_ARROW:         884,
    STEEL_ARROW:        886,

    // Magic
    STAFF_OF_AIR:       1381,
    // Rune IDs (internal names have no underscore: airrune, mindrune, etc.)
    AIR_RUNE:           556,
    MIND_RUNE:          558,
    WATER_RUNE:         555,
    EARTH_RUNE:         557,
    FIRE_RUNE:          554,
    BODY_RUNE:          559,
} as const;


export const Objects = {
    FIRE: 2732,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// World Locations  [x, z, level]
// Coordinates sourced from RS2 wiki / cross-referenced with content scripts.
//
// Accessibility guide:
//   ✅ No gates/walls      — pathfinder walks straight there
//   ⛩ Gateway-routed      — BotAction.walkTo() handles gate/toll approach
//   🚫 Avoid               — unreachable by bots (underground / boat-only)
// ─────────────────────────────────────────────────────────────────────────────

export const Locations = {
    // ── Spawn ─────────────────────────────────────────────────────────────────
    LUMBRIDGE_SPAWN:         [3180, 3240, 0] as [number, number, number],  // ✅ road north of Lumbridge castle

    // ── Banks ─────────────────────────────────────────────────────────────────
    LUMBRIDGE_BANK:          [3208, 3220, 2] as [number, number, number],  // castle 2nd floor
    DRAYNOR_BANK:            [3092, 3245, 0] as [number, number, number],  // ✅ primary bot bank
    VARROCK_WEST_BANK:       [3185, 3444, 0] as [number, number, number],  // ✅
    VARROCK_EAST_BANK:       [3253, 3420, 0] as [number, number, number],  // ✅
    AL_KHARID_BANK:          [3269, 3167, 0] as [number, number, number],  // ⛩ inside Al Kharid
    FALADOR_EAST_BANK:       [3013, 3355, 0] as [number, number, number],  // ✅

    // ── Shops ─────────────────────────────────────────────────────────────────
    BOB_AXES:                [3231, 3203, 0] as [number, number, number],  // ✅ Bob's Axes, Lumbridge
    LUMBRIDGE_GENERAL:       [3213, 3247, 0] as [number, number, number],  // ✅ General Store
    GERRANTS_FISHING:        [3014, 3224, 0] as [number, number, number],  // ✅ Port Sarim — only F2P fishing shop
    VARROCK_SWORD_SHOP:      [3205, 3420, 0] as [number, number, number],  // ✅ swords/longswords/daggers — no scimitars
    VARROCK_ARCHERY:         [3212, 3414, 0] as [number, number, number],  // ✅ Lowe's Archery
    VARROCK_RUNES:           [3253, 3401, 0] as [number, number, number],  // ✅ Aubury's Rune Shop
    AL_KHARID_SCIMITARS:     [3274, 3190, 0] as [number, number, number],  // ⛩ Zeke's — only F2P scimitar shop
    PORT_SARIM_RUNES:        [3013, 3224, 0] as [number, number, number],  // ✅

    // ── Woodcutting ───────────────────────────────────────────────────────────
    TREES_LUMBRIDGE:         [3194, 3226, 0] as [number, number, number],  // ✅ behind Lumbridge castle
    TREES_DRAYNOR:           [3091, 3271, 0] as [number, number, number],  // ✅ normal trees near Draynor
    OAKS_DRAYNOR:            [3088, 3236, 0] as [number, number, number],  // ✅ oaks south of Draynor bank
    WILLOWS_DRAYNOR:         [3180, 3270, 0] as [number, number, number],  // ✅ willows east of Draynor
    WILLOWS_BARBARIAN:       [3048, 3422, 0] as [number, number, number],  // ✅ willows along River Lum — gate-free
    YEWS_VARROCK:            [3204, 3499, 0] as [number, number, number],  // ⛩ north Varrock — VarrockNorth gateway
    YEWS_FALADOR:            [2987, 3340, 0] as [number, number, number],  // ✅ south-east of Falador, near east bank

    // ── Mining ────────────────────────────────────────────────────────────────
    // MINE_DWARVEN is now mapped to Barbarian Village surface mine:
    //   [3082, 3421] has copper, tin, iron AND coal on the surface.
    //   No gates, no walls. Banks at Draynor [3092, 3245] ~20 tiles away.
    MINE_LUMBRIDGE_SWAMP:    [3227, 3155, 0] as [number, number, number],  // ⛩ copper+tin, fenced
    MINE_AL_KHARID:          [3299, 3288, 0] as [number, number, number],  // ⛩ inside Al Kharid gate
    MINE_VARROCK_EAST:       [3285, 3365, 0] as [number, number, number],  // ✅ iron — open area, no gates
    MINE_VARROCK_WEST:       [3177, 3368, 0] as [number, number, number],  // ✅ tin + iron — open area
    MINE_DWARVEN:            [3082, 3421, 0] as [number, number, number],  // ✅ Barbarian Village surface mine — copper/tin/iron/coal, gate-free

    // ── Fishing ───────────────────────────────────────────────────────────────
    FISH_DRAYNOR:            [3088, 3228, 0] as [number, number, number],  // ✅ shrimp + sardine (net/bait)
    FISH_BARBARIAN:          [3105, 3432, 0] as [number, number, number],  // ✅ trout + salmon (fly rod) — best accessible spot
    FISH_KARAMJA:            [2924, 3173, 0] as [number, number, number],  // ⛩ lobster + swordfish (pot/harpoon) — boat-routed via Port Sarim
    FISH_ALKHARID:            [3277, 3142, 0] as [number, number, number],  // ✅ shrimp + sardine (net/bait)
    // ── Combat ────────────────────────────────────────────────────────────────
    CHICKENS_LUMBRIDGE:      [3232, 3295, 0] as [number, number, number],  // ✅ level 1 chickens, no walls
    CHICKENS_LUMBRIDGE2:      [3188, 3278, 0] as [number, number, number],  // ✅ level 1 chickens, no walls
    GOBLINS_LUMBRIDGE:       [3258, 3236, 0] as [number, number, number],  // ✅ level 2/5 goblins, road north of castle
    COWS_LUMBRIDGE:          [3255, 3276, 0] as [number, number, number],  // ⛩ level 2 cows, cowpen gateway
    COWS_LUMBRIDGE2:          [3175, 3320, 0] as [number, number, number],  // ⛩ level 2 cows, cowpen gateway
    BARBARIANS_VILLAGE:      [3082, 3434, 0] as [number, number, number],  // ✅ level 17 barbarians, aggressive, open area
    GUARDS_VARROCK:          [3224, 3470, 0] as [number, number, number],  // ⛩ level 21 guards, north Varrock
    AL_KHARID_WARRIORS:      [3294, 3172, 0] as [number, number, number],  // ⛩ Al Kharid palace — AlKharid gateway

    // ── Skilling stations ─────────────────────────────────────────────────────
    LUMBRIDGE_RANGE:         [3209, 3216, 0] as [number, number, number],  // ✅ Lumbridge castle kitchen range
    FIRE_LUMBRIDGE_ROAD:     [3218, 3253, 0] as [number, number, number],  // ✅ firemaking road
    AL_KHARID_FURNACE:       [3192, 3162, 0] as [number, number, number],  // ⛩ inside Al Kharid
    VARROCK_ANVIL:           [3188, 3422, 0] as [number, number, number],  // ✅
    LUMBRIDGE_ALTAR:         [3243, 3210, 0] as [number, number, number],  // ✅
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Shop stock  (verified against area configs/*.inv)
// ─────────────────────────────────────────────────────────────────────────────

export interface ShopItem {
    itemId: number;
    cost:   number;
}

export const Shops: Record<string, { location: [number, number, number]; stock: ShopItem[] }> = {

    // Bob's Brilliant Axes — Lumbridge
    BOB_AXES: {
        location: Locations.BOB_AXES,
        stock: [
            { itemId: Items.BRONZE_PICKAXE, cost: 1   },
            { itemId: Items.BRONZE_AXE,     cost: 16  },
            { itemId: Items.IRON_AXE,       cost: 56  },
            { itemId: Items.STEEL_AXE,      cost: 200 },
        ],
    },

    // Lumbridge General Store — no axes, no fishing gear
    LUMBRIDGE_GENERAL: {
        location: Locations.LUMBRIDGE_GENERAL,
        stock: [
            { itemId: Items.TINDERBOX, cost: 13 },
        ],
    },

    // Gerrant's Fishing Supplies — Port Sarim (ONLY fishing gear shop in F2P)
    GERRANTS_FISHING: {
        location: Locations.GERRANTS_FISHING,
        stock: [
            { itemId: Items.SMALL_FISHING_NET, cost: 5   },
            { itemId: Items.FISHING_ROD,       cost: 5   },
            { itemId: Items.FLY_FISHING_ROD,   cost: 5   },
            { itemId: Items.HARPOON,           cost: 45  },
            { itemId: Items.LOBSTER_POT,       cost: 20  },
            { itemId: Items.FISHING_BAIT,      cost: 3   },
            { itemId: Items.FEATHER,           cost: 2   },
        ],
    },

    // Varrock Sword Shop — swords, longswords, daggers; NO scimitars
    VARROCK_SWORDS: {
        location: Locations.VARROCK_SWORD_SHOP,
        stock: [
            { itemId: Items.BRONZE_SWORD,  cost: 32    },
            { itemId: Items.IRON_SWORD,    cost: 112   },
            { itemId: Items.STEEL_SWORD,   cost: 400   },
            { itemId: Items.MITHRIL_SWORD, cost: 3000  },
            { itemId: Items.ADAMANT_SWORD, cost: 12000 },
        ],
    },

    // Lowe's Archery Emporium — Varrock
    VARROCK_ARCHERY: {
        location: Locations.VARROCK_ARCHERY,
        stock: [
            { itemId: Items.SHORTBOW,      cost: 100  },
            { itemId: Items.OAK_SHORTBOW,  cost: 200  },
            { itemId: Items.BRONZE_ARROW,  cost: 7    },
            { itemId: Items.IRON_ARROW,    cost: 15   },
            { itemId: Items.STEEL_ARROW,   cost: 20   },
        ],
    },

    // Aubury's Rune Shop — Varrock
    VARROCK_RUNES: {
        location: Locations.VARROCK_RUNES,
        stock: [
            { itemId: Items.AIR_RUNE,   cost: 4  },
            { itemId: Items.MIND_RUNE,  cost: 4  },
            { itemId: Items.WATER_RUNE, cost: 4  },
            { itemId: Items.EARTH_RUNE, cost: 4  },
            { itemId: Items.FIRE_RUNE,  cost: 4  },
            { itemId: Items.BODY_RUNE,  cost: 4  },
        ],
    },

    // Zeke's Superior Scimitars — Al Kharid (ONLY place in F2P)
    AL_KHARID_SCIMITARS: {
        location: Locations.AL_KHARID_SCIMITARS,
        stock: [
            { itemId: Items.BRONZE_SCIMITAR,  cost: 32   },
            { itemId: Items.IRON_SCIMITAR,    cost: 200  },
            { itemId: Items.STEEL_SCIMITAR,   cost: 600  },
            { itemId: Items.MITHRIL_SCIMITAR, cost: 4000 },
        ],
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// Tool requirements per skill
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolRequirement {
    itemId:   number;
    levelReq: number;
    shopKey:  string;
}

// Axes — level requirements from axes.obj param=levelrequire
export const AxesByLevel: ToolRequirement[] = [
    { itemId: Items.BRONZE_AXE,  levelReq: 1,  shopKey: 'BOB_AXES' },
    { itemId: Items.IRON_AXE,    levelReq: 1,  shopKey: 'BOB_AXES' },
    { itemId: Items.STEEL_AXE,   levelReq: 6,  shopKey: 'BOB_AXES' },
    { itemId: Items.MITHRIL_AXE, levelReq: 21, shopKey: 'BOB_AXES' },
    { itemId: Items.ADAMANT_AXE, levelReq: 31, shopKey: 'BOB_AXES' },
    { itemId: Items.RUNE_AXE,    levelReq: 41, shopKey: 'BOB_AXES' },
];

// Pickaxes — Bob sells bronze_pickaxe; rest dropped/smithed
export const PickaxesByLevel: ToolRequirement[] = [
    { itemId: Items.BRONZE_PICKAXE, levelReq: 1, shopKey: 'BOB_AXES' },
];

// Fishing gear grouped by method
export const FishingGearByMethod: Record<string, ToolRequirement[]> = {
    'net':      [{ itemId: Items.SMALL_FISHING_NET, levelReq: 1,  shopKey: 'GERRANTS_FISHING' }],
    'bait_rod': [
        { itemId: Items.FISHING_ROD,  levelReq: 5,  shopKey: 'GERRANTS_FISHING' },
        { itemId: Items.FISHING_BAIT, levelReq: 5,  shopKey: 'GERRANTS_FISHING' },
    ],
    'fly_rod':  [
        { itemId: Items.FLY_FISHING_ROD, levelReq: 20, shopKey: 'GERRANTS_FISHING' },
        { itemId: Items.FEATHER,         levelReq: 20, shopKey: 'GERRANTS_FISHING' },
    ],
    'cage':     [{ itemId: Items.LOBSTER_POT, levelReq: 40, shopKey: 'GERRANTS_FISHING' }],
    'harpoon':  [{ itemId: Items.HARPOON,     levelReq: 35, shopKey: 'GERRANTS_FISHING' }],
};

// ─────────────────────────────────────────────────────────────────────────────
// Skill progression steps
//
// XP values are the internal engine format (×10):
//   engine stores "25.0 xp" as 250, "37.5 xp" as 375, etc.
//   Verified against:
//     Woodcutting: trees.dbrow    (productexp field)
//     Fishing:     fishing.struct (productexp field)
//     Mining:      mine.dbrow     (rock_exp field)
//     Cooking:     cooking_generic.dbrow (experience field)
//     Firemaking:  firemaking.obj (productexp field)
//     Smithing:    smelting.struct (productexp field)
//     Combat:      combat.rs2     (scale(400,100,damage*10))
//     Prayer:      bones bury = 45 (4.5xp), big bones = 150 (15xp)
//
// ACCESSIBILITY NOTES:
//   All active combat/skilling locations use gate-free spots OR are handled
//   by BotAction.walkTo() gateway routing (AlKharid, AlKharidExit, CowPen,
//   VarrockNorth, PortSarimToKaramja, KaramjaToPortSarim).
//   Karamja fishing (lobster/swordfish) is routed via the Port Sarim boat
//   gateways — bots teleport through the toll in both directions.
// ─────────────────────────────────────────────────────────────────────────────

export interface SkillStep {
    minLevel:       number;
    maxLevel:       number;
    action:         string;
    location:       [number, number, number];
    toolItemIds:    number[];
    xpPerAction:    number;
    ticksPerAction: number;
    successRate:    number;
    itemGained?:    number;
    itemConsumed?:  number;
    extra?:         Record<string, unknown>;
}

export const SkillProgression: Record<string, SkillStep[]> = {

    // ── Woodcutting ──────────────────────────────────────────────────────────
    // XP from trees.dbrow productexp, levels from levelrequired.
    // Level 30-59: two willow spots (Draynor + Barbarian Village) for variety.
    // Level 60+:   two yew spots (north Varrock via gateway, Falador south open).
    WOODCUTTING: [
        { minLevel: 1,  maxLevel: 14, action: 'woodcut', location: Locations.TREES_LUMBRIDGE,   toolItemIds: [Items.BRONZE_AXE],  xpPerAction: 250,  ticksPerAction: 5, successRate: 0.65, itemGained: Items.LOGS        },
        { minLevel: 1,  maxLevel: 14, action: 'woodcut', location: Locations.TREES_DRAYNOR,   toolItemIds: [Items.BRONZE_AXE],  xpPerAction: 250,  ticksPerAction: 5, successRate: 0.65, itemGained: Items.LOGS        },
        { minLevel: 15, maxLevel: 29, action: 'woodcut', location: Locations.OAKS_DRAYNOR,      toolItemIds: [Items.IRON_AXE],    xpPerAction: 375,  ticksPerAction: 5, successRate: 0.60, itemGained: Items.OAK_LOGS    },
        { minLevel: 30, maxLevel: 59, action: 'woodcut', location: Locations.WILLOWS_DRAYNOR,   toolItemIds: [Items.STEEL_AXE],   xpPerAction: 675,  ticksPerAction: 4, successRate: 0.65, itemGained: Items.WILLOW_LOGS },
        { minLevel: 30, maxLevel: 59, action: 'woodcut', location: Locations.WILLOWS_BARBARIAN, toolItemIds: [Items.STEEL_AXE],   xpPerAction: 675,  ticksPerAction: 4, successRate: 0.65, itemGained: Items.WILLOW_LOGS },
        { minLevel: 60, maxLevel: 99, action: 'woodcut', location: Locations.YEWS_VARROCK,      toolItemIds: [Items.STEEL_AXE], xpPerAction: 1750, ticksPerAction: 7, successRate: 0.40, itemGained: Items.YEW_LOGS    },
        { minLevel: 60, maxLevel: 99, action: 'woodcut', location: Locations.YEWS_FALADOR,      toolItemIds: [Items.STEEL_AXE], xpPerAction: 1750, ticksPerAction: 7, successRate: 0.40, itemGained: Items.YEW_LOGS    },
    ],

    // ── Fishing ──────────────────────────────────────────────────────────────
    // XP from fishing.struct productexp, levels from saltfish.rs2 / rarefish.rs2.
    // Karamja is reached via the PortSarimToKaramja / KaramjaToPortSarim boat
    // gateways in BotAction.walkTo() — bots teleport through the toll.
    // Banking: Draynor Bank (nearest) after the boat ride back to Port Sarim.
    FISHING: [
        // Level 1-19: net fishing — shrimp at Al Kharid shore
        { minLevel: 1,  maxLevel: 19,  action: 'fish', location: Locations.FISH_ALKHARID,   toolItemIds: [Items.SMALL_FISHING_NET],              xpPerAction: 100, ticksPerAction: 5, successRate: 0.60, itemGained: Items.RAW_SHRIMP                                    },
        { minLevel: 1,  maxLevel: 19,  action: 'fish', location: Locations.FISH_DRAYNOR,   toolItemIds: [Items.SMALL_FISHING_NET],              xpPerAction: 100, ticksPerAction: 5, successRate: 0.60, itemGained: Items.RAW_SHRIMP                                    },
        { minLevel: 1,  maxLevel: 19,  action: 'fish', location: Locations.FISH_KARAMJA,   toolItemIds: [Items.SMALL_FISHING_NET],              xpPerAction: 100, ticksPerAction: 5, successRate: 0.60, itemGained: Items.RAW_SHRIMP                                    },
        // Level 20-29: fly rod — trout at Barbarian Village
        { minLevel: 20, maxLevel: 29, action: 'fish', location: Locations.FISH_BARBARIAN, toolItemIds: [Items.FLY_FISHING_ROD, Items.FEATHER],  xpPerAction: 500, ticksPerAction: 5, successRate: 0.55, itemGained: Items.RAW_TROUT,   itemConsumed: Items.FEATHER      },
        // Level 30-39: fly rod — salmon at Barbarian Village
        { minLevel: 30, maxLevel: 39, action: 'fish', location: Locations.FISH_BARBARIAN, toolItemIds: [Items.FLY_FISHING_ROD, Items.FEATHER],  xpPerAction: 700, ticksPerAction: 5, successRate: 0.50, itemGained: Items.RAW_SALMON,  itemConsumed: Items.FEATHER      },
        // Level 40-49: cage — lobster at Karamja (boat-routed via Port Sarim)
        { minLevel: 40, maxLevel: 49, action: 'fish', location: Locations.FISH_KARAMJA,   toolItemIds: [Items.LOBSTER_POT],                    xpPerAction: 900, ticksPerAction: 5, successRate: 0.50, itemGained: Items.RAW_LOBSTER                                    },
        // Level 50-99: harpoon — swordfish at Karamja (boat-routed via Port Sarim)
        { minLevel: 50, maxLevel: 99, action: 'fish', location: Locations.FISH_KARAMJA,   toolItemIds: [Items.HARPOON],                        xpPerAction: 1000, ticksPerAction: 5, successRate: 0.45, itemGained: Items.RAW_SWORDFISH                                 },
    ],

    // ── Mining ───────────────────────────────────────────────────────────────
    // XP from mine.dbrow rock_exp, levels from rock_level.
    //
    // All tiers use MINE_DWARVEN = Barbarian Village surface mine [3082, 3421]:
    //   - copper, tin, iron AND coal all present on the surface
    //   - no gates, no walls — fully open area
    //   - Draynor bank [3092, 3245] is ~20 tiles away
    //
    // Varrock East [3285, 3365] added as iron variety (open area, near east bank).
    MINING: [
        // Level 1-14: copper & tin at Barbarian Village mine
        { minLevel: 1,  maxLevel: 14, action: 'mine', location: Locations.MINE_DWARVEN,      toolItemIds: [Items.BRONZE_PICKAXE], xpPerAction: 175, ticksPerAction: 4, successRate: 0.65, itemGained: Items.COPPER_ORE },
        { minLevel: 1,  maxLevel: 14, action: 'mine', location: Locations.MINE_DWARVEN,      toolItemIds: [Items.BRONZE_PICKAXE], xpPerAction: 175, ticksPerAction: 4, successRate: 0.65, itemGained: Items.TIN_ORE    },
        // Level 15-29: iron — Barbarian Village (primary) or Varrock East (variety)
        { minLevel: 15, maxLevel: 29, action: 'mine', location: Locations.MINE_DWARVEN,      toolItemIds: [Items.BRONZE_PICKAXE], xpPerAction: 350, ticksPerAction: 5, successRate: 0.55, itemGained: Items.IRON_ORE   },
        { minLevel: 15, maxLevel: 29, action: 'mine', location: Locations.MINE_VARROCK_EAST, toolItemIds: [Items.BRONZE_PICKAXE], xpPerAction: 350, ticksPerAction: 5, successRate: 0.55, itemGained: Items.IRON_ORE   },
        // Level 30+: coal at Barbarian Village mine (surface accessible!)
        { minLevel: 30, maxLevel: 99, action: 'mine', location: Locations.MINE_DWARVEN,      toolItemIds: [Items.BRONZE_PICKAXE], xpPerAction: 500, ticksPerAction: 6, successRate: 0.45, itemGained: Items.COAL       },
    ],

    // ── Firemaking ───────────────────────────────────────────────────────────
    // XP from firemaking.obj productexp, levels from levelrequire.
    // Location: Lumbridge road — wide, flat, no obstacles.
    FIREMAKING: [
        { minLevel: 1,  maxLevel: 14, action: 'firemaking', location: Locations.FIRE_LUMBRIDGE_ROAD, toolItemIds: [Items.TINDERBOX], xpPerAction: 400,  ticksPerAction: 4, successRate: 0.90, itemConsumed: Items.LOGS        },
        { minLevel: 15, maxLevel: 29, action: 'firemaking', location: Locations.FIRE_LUMBRIDGE_ROAD, toolItemIds: [Items.TINDERBOX], xpPerAction: 600,  ticksPerAction: 4, successRate: 0.90, itemConsumed: Items.OAK_LOGS    },
        { minLevel: 30, maxLevel: 44, action: 'firemaking', location: Locations.FIRE_LUMBRIDGE_ROAD, toolItemIds: [Items.TINDERBOX], xpPerAction: 900,  ticksPerAction: 4, successRate: 0.95, itemConsumed: Items.WILLOW_LOGS },
        { minLevel: 45, maxLevel: 59, action: 'firemaking', location: Locations.FIRE_LUMBRIDGE_ROAD, toolItemIds: [Items.TINDERBOX], xpPerAction: 1350, ticksPerAction: 4, successRate: 0.95, itemConsumed: Items.MAPLE_LOGS  },
        { minLevel: 60, maxLevel: 99, action: 'firemaking', location: Locations.FIRE_LUMBRIDGE_ROAD, toolItemIds: [Items.TINDERBOX], xpPerAction: 2025, ticksPerAction: 4, successRate: 0.95, itemConsumed: Items.YEW_LOGS    },
    ],

    // ── Cooking ──────────────────────────────────────────────────────────────
    // XP from cooking_generic.dbrow experience, levels from levelrequired.
    COOKING: [
        { minLevel: 1,  maxLevel: 4,  action: 'cook', location: Locations.LUMBRIDGE_RANGE, toolItemIds: [], xpPerAction: 300,  ticksPerAction: 4, successRate: 0.65, itemConsumed: Items.RAW_SHRIMP,    itemGained: Items.SHRIMP    },
        { minLevel: 1,  maxLevel: 14, action: 'cook', location: Locations.LUMBRIDGE_RANGE, toolItemIds: [], xpPerAction: 400,  ticksPerAction: 4, successRate: 0.65, itemConsumed: Items.RAW_SARDINE,   itemGained: Items.SARDINE   },
        { minLevel: 15, maxLevel: 24, action: 'cook', location: Locations.LUMBRIDGE_RANGE, toolItemIds: [], xpPerAction: 700,  ticksPerAction: 4, successRate: 0.70, itemConsumed: Items.RAW_TROUT,     itemGained: Items.TROUT     },
        { minLevel: 25, maxLevel: 39, action: 'cook', location: Locations.LUMBRIDGE_RANGE, toolItemIds: [], xpPerAction: 900,  ticksPerAction: 4, successRate: 0.70, itemConsumed: Items.RAW_SALMON,    itemGained: Items.SALMON    },
        { minLevel: 40, maxLevel: 44, action: 'cook', location: Locations.LUMBRIDGE_RANGE, toolItemIds: [], xpPerAction: 1200, ticksPerAction: 4, successRate: 0.80, itemConsumed: Items.RAW_LOBSTER,   itemGained: Items.LOBSTER   },
        { minLevel: 45, maxLevel: 99, action: 'cook', location: Locations.LUMBRIDGE_RANGE, toolItemIds: [], xpPerAction: 1400, ticksPerAction: 4, successRate: 0.85, itemConsumed: Items.RAW_SWORDFISH, itemGained: Items.SWORDFISH },
    ],

    // ── Combat — Attack ──────────────────────────────────────────────────────
    //
    // Progression tiers:
    //   1-9:   Chickens / Goblins   (BRONZE_SWORD — Lumbridge, fully accessible)
    //   10-19: Cows                 (IRON_SCIMITAR — cowpen gateway handles fence)
    //   20-29: Cows + Barbarians    (IRON_SCIMITAR — Barbarian Village fully open)
    //   30-39: Cows + Barbarians    (STEEL_SCIMITAR)
    //   40-99: Al Kharid Warriors   (MITHRIL_SCIMITAR — AlKharid gateway handles toll gate)
    //          + Barbarians variety (STEEL_SCIMITAR stays valid)
    //
    // Multiple entries at the same level give variety — getProgressionStep()
    // picks randomly, shouldRun() filters to whatever weapon the bot currently has.
    ATTACK: [
        // ── Level 1-9: chickens + goblins ────────────────────────────────────
        { minLevel: 1,  maxLevel: 99,  action: 'combat', location: Locations.CHICKENS_LUMBRIDGE, toolItemIds: [], xpPerAction: 120, ticksPerAction: 4, successRate: 1.0, itemGained: Items.BONES,    extra: { npcType: 'chicken',   hitsToKill: 2 } },
        { minLevel: 1,  maxLevel: 99,  action: 'combat', location: Locations.CHICKENS_LUMBRIDGE2, toolItemIds: [], xpPerAction: 120, ticksPerAction: 4, successRate: 1.0, itemGained: Items.BONES,    extra: { npcType: 'chicken',   hitsToKill: 2 } },
        { minLevel: 1,  maxLevel: 99,  action: 'combat', location: Locations.GOBLINS_LUMBRIDGE,  toolItemIds: [], xpPerAction: 120, ticksPerAction: 4, successRate: 1.0, itemGained: Items.BONES,    extra: { npcTypes: ['goblin', 'giant spider', 'man'],  hitsToKill: 3 } },
        { minLevel: 3, maxLevel: 99, action: 'combat', location: Locations.COWS_LUMBRIDGE,     toolItemIds: [], xpPerAction: 160, ticksPerAction: 4, successRate: 1.0, itemGained: Items.COW_HIDE, extra: { npcType: 'cow',       hitsToKill: 5 } },
        { minLevel: 3, maxLevel: 99, action: 'combat', location: Locations.COWS_LUMBRIDGE2,     toolItemIds: [], xpPerAction: 160, ticksPerAction: 4, successRate: 1.0, itemGained: Items.COW_HIDE, extra: { npcType: 'cow',       hitsToKill: 5 } },
        // ── Level 10-19: cows ─────────────────────────────────────────────────
        // ── Level 20-29: cows + barbarians ───────────────────────────────────
        { minLevel: 20, maxLevel: 99, action: 'combat', location: Locations.BARBARIANS_VILLAGE, toolItemIds: [Items.IRON_SCIMITAR], xpPerAction: 200, ticksPerAction: 4, successRate: 1.0, itemGained: Items.BONES,    extra: { npcType: 'barbarian', hitsToKill: 6 } },
        // ── Level 30-39: cows + barbarians (steel) ────────────────────────────
        // ── Level 40+: Al Kharid warriors (+ barbarian fallback) ─────────────
        { minLevel: 40, maxLevel: 99, action: 'combat', location: Locations.AL_KHARID_WARRIORS, toolItemIds: [Items.STEEL_SCIMITAR], xpPerAction: 280, ticksPerAction: 4, successRate: 1.0, itemGained: Items.BONES,    extra: { npcType: 'warrior',   hitsToKill: 8 } },
    ],

    // ── Combat — Strength ────────────────────────────────────────────────────
    STRENGTH: [
        // ── Level 1-9: chickens + goblins ────────────────────────────────────
        { minLevel: 1,  maxLevel: 99,  action: 'combat', location: Locations.CHICKENS_LUMBRIDGE, toolItemIds: [Items.BRONZE_SWORD], xpPerAction: 120, ticksPerAction: 4, successRate: 1.0, itemGained: Items.BONES,    extra: { npcType: 'chicken',   hitsToKill: 2 } },
        { minLevel: 1,  maxLevel: 99,  action: 'combat', location: Locations.CHICKENS_LUMBRIDGE2, toolItemIds: [Items.BRONZE_SWORD], xpPerAction: 120, ticksPerAction: 4, successRate: 1.0, itemGained: Items.BONES,    extra: { npcType: 'chicken',   hitsToKill: 2 } },
        { minLevel: 1,  maxLevel: 99,  action: 'combat', location: Locations.GOBLINS_LUMBRIDGE,  toolItemIds: [Items.BRONZE_SWORD], xpPerAction: 120, ticksPerAction: 4, successRate: 1.0, itemGained: Items.BONES,    extra: { npcTypes: ['goblin', 'giant spider', 'man'],  hitsToKill: 3 } },
        { minLevel: 3, maxLevel: 99, action: 'combat', location: Locations.COWS_LUMBRIDGE,     toolItemIds: [Items.IRON_SCIMITAR], xpPerAction: 160, ticksPerAction: 4, successRate: 1.0, itemGained: Items.COW_HIDE, extra: { npcType: 'cow',       hitsToKill: 5 } },
        { minLevel: 3, maxLevel: 99, action: 'combat', location: Locations.COWS_LUMBRIDGE2,     toolItemIds: [Items.IRON_SCIMITAR], xpPerAction: 160, ticksPerAction: 4, successRate: 1.0, itemGained: Items.COW_HIDE, extra: { npcType: 'cow',       hitsToKill: 5 } },
        // ── Level 10-19: cows ─────────────────────────────────────────────────
        // ── Level 20-29: cows + barbarians ───────────────────────────────────
        { minLevel: 20, maxLevel: 99, action: 'combat', location: Locations.BARBARIANS_VILLAGE, toolItemIds: [Items.IRON_SCIMITAR], xpPerAction: 200, ticksPerAction: 4, successRate: 1.0, itemGained: Items.BONES,    extra: { npcType: 'barbarian', hitsToKill: 6 } },
        // ── Level 30-39: cows + barbarians (steel) ────────────────────────────
        // ── Level 40+: Al Kharid warriors (+ barbarian fallback) ─────────────
        { minLevel: 40, maxLevel: 99, action: 'combat', location: Locations.AL_KHARID_WARRIORS, toolItemIds: [Items.MITHRIL_SCIMITAR], xpPerAction: 280, ticksPerAction: 4, successRate: 1.0, itemGained: Items.BONES,    extra: { npcType: 'warrior',   hitsToKill: 8 } },
    ],

    // ── Combat — Defence ─────────────────────────────────────────────────────
     DEFENCE: [
        // ── Level 1-9: chickens + goblins ────────────────────────────────────
        { minLevel: 1,  maxLevel: 99,  action: 'combat', location: Locations.CHICKENS_LUMBRIDGE, toolItemIds: [Items.BRONZE_SWORD], xpPerAction: 120, ticksPerAction: 4, successRate: 1.0, itemGained: Items.BONES,    extra: { npcType: 'chicken',   hitsToKill: 2 } },
        { minLevel: 1,  maxLevel: 99,  action: 'combat', location: Locations.CHICKENS_LUMBRIDGE2, toolItemIds: [Items.BRONZE_SWORD], xpPerAction: 120, ticksPerAction: 4, successRate: 1.0, itemGained: Items.BONES,    extra: { npcType: 'chicken',   hitsToKill: 2 } },
        { minLevel: 1,  maxLevel: 99,  action: 'combat', location: Locations.GOBLINS_LUMBRIDGE,  toolItemIds: [Items.BRONZE_SWORD], xpPerAction: 120, ticksPerAction: 4, successRate: 1.0, itemGained: Items.BONES,    extra: { npcTypes: ['goblin', 'giant spider', 'man'],  hitsToKill: 3 } },
        { minLevel: 3, maxLevel: 99, action: 'combat', location: Locations.COWS_LUMBRIDGE,     toolItemIds: [Items.IRON_SCIMITAR], xpPerAction: 160, ticksPerAction: 4, successRate: 1.0, itemGained: Items.COW_HIDE, extra: { npcType: 'cow',       hitsToKill: 5 } },
        { minLevel: 3, maxLevel: 99, action: 'combat', location: Locations.COWS_LUMBRIDGE2,     toolItemIds: [Items.IRON_SCIMITAR], xpPerAction: 160, ticksPerAction: 4, successRate: 1.0, itemGained: Items.COW_HIDE, extra: { npcType: 'cow',       hitsToKill: 5 } },
        // ── Level 10-19: cows ─────────────────────────────────────────────────
        // ── Level 20-29: cows + barbarians ───────────────────────────────────
        { minLevel: 20, maxLevel: 99, action: 'combat', location: Locations.BARBARIANS_VILLAGE, toolItemIds: [Items.IRON_SCIMITAR], xpPerAction: 200, ticksPerAction: 4, successRate: 1.0, itemGained: Items.BONES,    extra: { npcType: 'barbarian', hitsToKill: 6 } },
        // ── Level 30-39: cows + barbarians (steel) ────────────────────────────
        // ── Level 40+: Al Kharid warriors (+ barbarian fallback) ─────────────
        { minLevel: 40, maxLevel: 99, action: 'combat', location: Locations.AL_KHARID_WARRIORS, toolItemIds: [Items.MITHRIL_SCIMITAR], xpPerAction: 280, ticksPerAction: 4, successRate: 1.0, itemGained: Items.BONES,    extra: { npcType: 'warrior',   hitsToKill: 8 } },
    ],

    // ── Prayer ───────────────────────────────────────────────────────────────
    // Handled by CombatTask bone burying (bones=45 internal, big_bones=150 internal)
    PRAYER: [],

    // ── Hitpoints ────────────────────────────────────────────────────────────
    // Auto-trained via combat — no dedicated task needed
    HITPOINTS: [],

    // ── Magic ────────────────────────────────────────────────────────────────
    // wind strike: 5.5 xp = 55 internal (magic_combat_spells.dbrow)
    MAGIC: [
        { minLevel: 1, maxLevel: 99, action: 'magic', location: Locations.GOBLINS_LUMBRIDGE, toolItemIds: [Items.STAFF_OF_AIR, Items.MIND_RUNE], xpPerAction: 55, ticksPerAction: 5, successRate: 0.85, itemConsumed: Items.MIND_RUNE, extra: { spell: 'wind_strike', npcType: 'goblin' } },
    ],

    // ── Ranged ───────────────────────────────────────────────────────────────
    // bronze arrow: 4.0 xp = 40 internal per hit
    RANGED: [
        { minLevel: 1, maxLevel: 99, action: 'ranged', location: Locations.CHICKENS_LUMBRIDGE, toolItemIds: [Items.OAK_SHORTBOW, Items.BRONZE_ARROW], xpPerAction: 160, ticksPerAction: 5, successRate: 0.85, itemConsumed: Items.BRONZE_ARROW, extra: { npcType: 'chicken' } },
    ],

    // ── Smithing ─────────────────────────────────────────────────────────────
    // XP from smelting.struct productexp
    SMITHING: [
        { minLevel: 1,  maxLevel: 14, action: 'smelt', location: Locations.AL_KHARID_FURNACE, toolItemIds: [], xpPerAction: 62,  ticksPerAction: 5, successRate: 1.00, itemConsumed: Items.COPPER_ORE, itemGained: Items.BRONZE_BAR, extra: { alsoConsumes: Items.TIN_ORE } },
        { minLevel: 15, maxLevel: 29, action: 'smelt', location: Locations.AL_KHARID_FURNACE, toolItemIds: [], xpPerAction: 125, ticksPerAction: 5, successRate: 0.50, itemConsumed: Items.IRON_ORE,   itemGained: Items.IRON_BAR   },
        { minLevel: 30, maxLevel: 99, action: 'smelt', location: Locations.AL_KHARID_FURNACE, toolItemIds: [], xpPerAction: 175, ticksPerAction: 5, successRate: 1.00, itemConsumed: Items.IRON_ORE,   itemGained: Items.STEEL_BAR,  extra: { alsoConsumes: Items.COAL, alsoConsumesCount: 2 } },
    ],

    // ── Stubs ─────────────────────────────────────────────────────────────────
    FLETCHING:    [],  // requires stringing bows — complex multi-step
    THIEVING:     [],  // requires NPC pickpocket interaction
    AGILITY:      [],  // requires course loc sequences
    RUNECRAFT:    [],  // requires talisman + altar interaction
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a matching progression step for the given skill and level.
 * When multiple steps match (e.g. chickens OR goblins at level 1) one is
 * chosen at random — giving bots natural variety without any extra logic.
IEVING: [],

    // Agility — stub (requires course locs not easily spoofed with teleport)
    AGILITY: [],

    // Runecrafting — stub (requires talisman + altar interaction)
    RUNECRAFT: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a matching progression step for the given skill and level.
 * If multiple steps match (e.g. chickens OR goblins at level 1) picks randomly,
 * spreading bots across locations.
 *
 * @param hasItems  Optional predicate — called with a step's toolItemIds array.
 *                  When provided, only steps whose tools pass the check are eligible.
 *                  Use this at bank-cycle re-rolls so bots never choose a location
 *                  they lack the required weapon/tool for.
 */
export function getProgressionStep(
    skill: string,
    level: number,
    hasItems?: (toolItemIds: number[]) => boolean,
): SkillStep | null {
    const steps = SkillProgression[skill];
    if (!steps || steps.length === 0) return null;
    let matching = steps.filter(s => level >= s.minLevel && level <= s.maxLevel);
    if (hasItems) matching = matching.filter(s => hasItems(s.toolItemIds));
    if (matching.length === 0) return null;
    return matching[Math.floor(Math.random() * matching.length)];
}

/** Best axe available at a given woodcutting level. */
export function bestAxe(wcLevel: number): ToolRequirement {
    return [...AxesByLevel].reverse().find(t => wcLevel >= t.levelReq) ?? AxesByLevel[0];
}

/** Best pickaxe available at a given mining level (only bronze sold in shops). */
export function bestPickaxe(_miningLevel: number): ToolRequirement {
    return PickaxesByLevel[0];
}
