import BotPlayer from '../BotPlayer.js';

export class BotUtils {
    /**
     * Finds the nearest object by ID from the server's object manager.
     */
    static find(player: BotPlayer, ids: number[]): any | null {
        // Mocking God View: world.getObjectManager().getNearest(player.pos)
        // In a real environment, iterate through ids and return the nearest match
        return { id: ids[0], x: player.x + 1, z: player.z + 1, type: 'loc' }; 
    }

    /**
     * Finds the nearest NPC by ID within a radius
     */
    static findNpc(player: BotPlayer, radius: number): any | null {
        return { id: 1, x: player.x, z: player.z, type: 'npc' }; 
    }

    /**
     * Direct interact override. Sends the packet logic instantly.
     */
    static interact(player: BotPlayer, target: any, action: string): void {
        player.setInteraction(target);
        // player.walkToAndInteract(target, action);
    }

    /**
     * Checks if the player's inventory is full.
     */
    static isFull(player: BotPlayer): boolean {
        return player.invFull();
    }

    /**
     * Checks if the player's inventory is empty.
     */
    static isEmpty(player: BotPlayer): boolean {
        // Mock: true if inventory contains no items
        return player.inv.freeSpace() === 28;
    }

    /**
     * Checks if the player's inventory contains an item.
     */
    static hasItem(player: BotPlayer, itemId: number): boolean {
        // Mock inventory check
        return true; 
    }

    /**
     * Interactions specific to an inventory slot/item.
     */
    static interactInventory(player: BotPlayer, itemId: number, action: string): void {
        // Mock packet handling for item interaction
    }

    /**
     * Interactions specific to using an item on an object.
     */
    static useItemOnObject(player: BotPlayer, itemId: number, targetObj: any): void {
        player.setInteraction(targetObj);
        // Mock packet handling for item on loc
    }

    /**
     * Gets the current HP percentage of the player.
     */
    static getHpPercent(player: BotPlayer): number {
        return (player.currentHealth / player.baseLevels[3]) * 100;
    }

    /**
     * Helper to drop items (Mock for Power Leveling).
     */
    static dropItems(player: BotPlayer, keepIds: number[] = []): void {
        // Mock: player.inventory.filter(i => !keepIds.includes(i.id)).forEach(i => player.drop(i));
        player.clearInventory();
    }

    /**
     * Helper to speak/interact with an NPC through dialogue.
     */
    static handleDialogue(player: BotPlayer, targetNpc: any): void {
        player.setInteraction(targetNpc);
        // Mock: player.client.sendPacket({ type: "NPC_ACTION_1", target: targetNpc.id });
    }

    /**
     * Helper to walk to the bank (Mock).
     * Calculates the nearest bank from the Locations file and initiates pathing.
     */
    static walkToBank(player: BotPlayer): void {
        player.activeBotSkill = "Banking";
    }

    /**
     * Finds the closest bank coordinates based on the player's current position.
     */
    static getNearestBank(player: BotPlayer): { x: number, z: number, y?: number } {
        const { Locations } = require('./Locations.js');
        const banks = [
            Locations.Lumbridge.bank,
            Locations.Draynor.bank,
            Locations.Varrock.west_bank,
            Locations.Varrock.east_bank,
            Locations.Falador.west_bank,
            Locations.Falador.east_bank,
            Locations.AlKharid.bank,
            Locations.Catherby.bank,
            Locations.Seers.bank,
            Locations.Ardougne.north_bank,
            Locations.Ardougne.south_bank,
            Locations.Edgeville.bank
        ];

        let nearest = banks[0];
        let minDist = Infinity;

        for (const bank of banks) {
            const dist = Math.abs(player.x - bank.x) + Math.abs(player.z - bank.z);
            if (dist < minDist) {
                minDist = dist;
                nearest = bank;
            }
        }
        return nearest;
    }

    /**
     * Helper to teleport/bank items instantly (God Mode shortcut)
     */
    static bankItems(player: BotPlayer, keepIds: number[] = []): void {
        // player.bank.addAll(player.inventory.filter(i => !keepIds.includes(i.id)));
        player.clearInventory(); 
    }
    
    /**
     * ADVANCED: Commands the player to walk to specific coordinates.
     */
    static walkTo(player: BotPlayer, coords: { x: number, z: number, y?: number }): void {
        player.queueWaypoints([coords]);
    }

    /**
     * ADVANCED: Checks if the player is currently within 5 tiles of coordinates.
     */
    static isNear(player: BotPlayer, coords: { x: number, z: number, y?: number }): boolean {
        return Math.abs(player.x - coords.x) <= 5 && Math.abs(player.z - coords.z) <= 5;
    }

    /**
     * ADVANCED: Emits public chat text.
     */
    static speakPublicly(player: BotPlayer, message: string): void {
        // Mock: player.client.sendChat(message);
    }
    
    /**
     * ADVANCED: Verifies if the bot has clear line of sight to a target.
     */
    static hasLineOfSight(player: BotPlayer, target: any): boolean {
        // Mock: World.hasLineOfSight(player, target)
        return true;
    }
}
