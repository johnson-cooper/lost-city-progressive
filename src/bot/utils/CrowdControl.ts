import World from '#/engine/World.js';
import { changePlayerCollision } from '#/engine/GameMap.js';

export class CrowdControl {
    /**
     * Checks the 3x3 radius around the bot's current coordinate.
     * If the tile has more than 1 player on it, the bot will step aside
     * to a valid adjacent tile to simulate human spacing around banks/skilling nodes.
     */
    public static calculateStepAside(bot: any): void {
        const x = bot.x;
        const z = bot.z;
        const level = bot.level;

        // Retrieve players on current tile using engine method
        let playersOnTile = 0;
        const zone = World.gameMap.getZone(x, z, level);
        
        // Count players manually or use a provided spatial hash
        for (const p of zone.players) {
            if (p.x === x && p.z === z) {
                playersOnTile++;
            }
        }

        if (playersOnTile > 1) {
            console.log(`[CrowdControl] ${bot.username} is stepping aside from crowded tile.`);
            const newCoord = this.findUnblockedAdjacentTile(x, z, level);
            if (newCoord) {
                bot.queueWaypoints([newCoord]);
            }
        }
    }

    private static findUnblockedAdjacentTile(x: number, z: number, level: number): { x: number, z: number } | null {
        // Iterate over a 3x3 grid (-1, 0, 1) to find a clear tile
        const offsets = [
            { dx: 1, dz: 0 }, { dx: -1, dz: 0 },
            { dx: 0, dz: 1 }, { dx: 0, dz: -1 },
            { dx: 1, dz: 1 }, { dx: -1, dz: -1 },
            { dx: 1, dz: -1 }, { dx: -1, dz: 1 }
        ];

        for (const offset of offsets) {
            const nx = x + offset.dx;
            const nz = z + offset.dz;
            
            // Check collision flag using LostCityRS native GameMap utility
            // In a real implementation, you would check CollisionFlag.WALK_BLOCKED
            const isBlocked = false; // Mocking collision check for the wrapper
            
            if (!isBlocked) {
                return { x: nx, z: nz };
            }
        }
        return null;
    }
}
