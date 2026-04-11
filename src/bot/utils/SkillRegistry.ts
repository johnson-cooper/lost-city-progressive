import BotPlayer from '../BotPlayer.js';

export interface SkillConfig {
    targetIds: number[];
    action: string;
    animationId: number;
    toolId?: number;
    bankCoords: { x: number, z: number };
}

export const SkillRegistry: Record<string, SkillConfig> = {
    "Woodcutting_Normal": {
        targetIds: [1276, 1278, 1281],
        action: "Chop down",
        animationId: 879,
        bankCoords: { x: 3208, z: 3219 } // Lumbridge
    },
    "Woodcutting_Oak": {
        targetIds: [1281, 3037],
        action: "Chop down",
        animationId: 879,
        bankCoords: { x: 3092, z: 3244 } // Draynor
    },
    "Woodcutting_Willow": {
        targetIds: [1308, 5551, 5552, 5553],
        action: "Chop down",
        animationId: 879,
        bankCoords: { x: 3092, z: 3244 } // Draynor
    },
    "Mining_Tin": {
        targetIds: [2094, 2095],
        action: "Mine",
        animationId: 624,
        bankCoords: { x: 3208, z: 3219 } // Lumbridge
    },
    "Mining_Copper": {
        targetIds: [2090, 2091],
        action: "Mine",
        animationId: 624,
        bankCoords: { x: 3208, z: 3219 }
    },
    "Fishing_Shrimp": {
        targetIds: [316, 319],
        action: "Net",
        animationId: 621,
        toolId: 303, // Small fishing net
        bankCoords: { x: 3269, z: 3167 } // Al Kharid
    }
};
