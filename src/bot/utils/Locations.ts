/**
 * Locations.ts
 * 
 * A Master Registry of popular 2004Scape coordinates to make bot authoring instantaneous.
 * Use these with `player.walkTo(Locations.Lumbridge.bank)` or similar "God View" commands.
 */

export const Locations = {
    // ==========================================
    // LUMBRIDGE (Newbie Hub)
    // ==========================================
    Lumbridge: {
        respawn: { x: 3222, z: 3218 },
        bank: { x: 3208, z: 3219, y: 2 }, // Top floor
        cow_pen: { x: 3254, z: 3275 },
        goblin_house: { x: 3246, z: 3230 },
        fishing_swamp: { x: 3240, z: 3160 },
        furnace: { x: 3226, z: 3255 }
    },

    // ==========================================
    // DRAYNOR VILLAGE (Willows & Banking)
    // ==========================================
    Draynor: {
        bank: { x: 3092, z: 3244 },
        willows: { x: 3087, z: 3235 },
        master_farmer: { x: 3080, z: 3250 },
        wheat_field: { x: 3110, z: 3280 }
    },

    // ==========================================
    // VARROCK (Trading Hub)
    // ==========================================
    Varrock: {
        center: { x: 3212, z: 3422 },
        west_bank: { x: 3185, z: 3436 },
        east_bank: { x: 3253, z: 3420 },
        yew_trees: { x: 3204, z: 3501 }, // Palace yews
        mining_se: { x: 3285, z: 3365 }, // South-east mine
        mining_sw: { x: 3175, z: 3365 }, // Champion's guild mine
        anvil: { x: 3227, z: 3438 },
        aubury_shop: { x: 3253, z: 3401 } // Rune shop for teleport
    },

    // ==========================================
    // FALADOR (Mining & Crafting)
    // ==========================================
    Falador: {
        center: { x: 2965, z: 3379 },
        west_bank: { x: 2946, z: 3368 },
        east_bank: { x: 3013, z: 3355 },
        furnace: { x: 2974, z: 3369 },
        mining_guild: { x: 3019, z: 3338 } // Ladder down
    },

    // ==========================================
    // AL KHARID (Desert Hub)
    // ==========================================
    AlKharid: {
        bank: { x: 3269, z: 3167 },
        furnace: { x: 3275, z: 3186 },
        mine_north: { x: 3298, z: 3315 },
        fishing_shrimp: { x: 3267, z: 3146 }
    },

    // ==========================================
    // CATHERBY (Fishing & Farming hub)
    // ==========================================
    Catherby: {
        bank: { x: 2809, z: 3440 },
        fishing_shore: { x: 2840, z: 3432 },
        range: { x: 2816, z: 3444 }
    },

    // ==========================================
    // SEERS' VILLAGE (Woodcutting & Flax)
    // ==========================================
    Seers: {
        bank: { x: 2725, z: 3492 },
        magic_trees: { x: 2695, z: 3424 },
        yew_trees: { x: 2713, z: 3460 },
        flax_field: { x: 2744, z: 3444 },
        spinning_wheel: { x: 2711, z: 3471, y: 1 }
    },
    
    // ==========================================
    // EDGEVILLE (Pking & Yews)
    // ==========================================
    Edgeville: {
        bank: { x: 3094, z: 3492 },
        yew_trees: { x: 3087, z: 3470 },
        furnace: { x: 3108, z: 3499 }
    },

    // ==========================================
    // GNOME STRONGHOLD
    // ==========================================
    GnomeStronghold: {
        bank: { x: 2445, z: 3425, y: 1 },
        agility_start: { x: 2474, z: 3436 }
    }
};