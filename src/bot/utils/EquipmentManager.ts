import BotPlayer from '../BotPlayer.js';

interface ToolTier {
    id: number;
    level: number;
}

export class EquipmentManager {
    // Array order matters: highest tier first
    private static pickaxes: ToolTier[] = [
        { id: 1275, level: 41 }, // Rune
        { id: 1271, level: 31 }, // Adamant
        { id: 1273, level: 21 }, // Mithril
        { id: 1269, level: 11 }, // Steel
        { id: 1267, level: 1 },  // Iron
        { id: 1265, level: 1 }   // Bronze
    ];

    private static axes: ToolTier[] = [
        { id: 1359, level: 41 }, // Rune
        { id: 1357, level: 31 }, // Adamant
        { id: 1355, level: 21 }, // Mithril
        { id: 1353, level: 11 }, // Steel
        { id: 1349, level: 1 },  // Iron
        { id: 1351, level: 1 }   // Bronze
    ];

    /**
     * Equips the best tool in the inventory based on the player's skill level.
     * @param player The BotPlayer instance
     * @param skillIndex The index of the skill (e.g., 8 for Woodcutting, 14 for Mining)
     * @param type 'pickaxe' or 'axe'
     */
    static equipBestTool(player: BotPlayer, skillIndex: number, type: 'pickaxe' | 'axe'): void {
        const tools = type === 'pickaxe' ? this.pickaxes : this.axes;
        const currentLevel = player.baseLevels[skillIndex];

        // 1. Check what they already have equipped
        // Assuming equipment array has weapon slot at index 3
        const equippedWeapon = player.equipment[3]; 

        for (const tool of tools) {
            // If they meet the level requirement
            if (currentLevel >= tool.level) {
                // If they already have it equipped, do nothing
                if (equippedWeapon === tool.id) {
                    return;
                }
                
                // If they have it in their inventory, equip it
                if (this.hasItemMock(player, tool.id)) {
                    this.equipMock(player, tool.id);
                    return; // Stop after equipping the best one
                }
            }
        }
    }

    private static hasItemMock(player: BotPlayer, id: number): boolean {
        // Mock inventory check. Assume they have all tools for framework demonstration.
        return true; 
    }

    private static equipMock(player: BotPlayer, id: number): void {
        // Mock equip action
        // player.client.sendPacket({ type: "EQUIP_ITEM", id });
        player.equipment[3] = id; 
    }
}
