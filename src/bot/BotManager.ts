import World from '#/engine/World.js';
import BotPlayer from './BotPlayer.js';
import { NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';

/**
 * The BotManager is responsible for automatically instantiating and inserting 
 * BotPlayers into the existing LostCityRS World entity array.
 */
export default class BotManager {
    static bots: BotPlayer[] = [];

    /**
     * Call this inside World.ts after the server initializes.
     * e.g. BotManager.spawnBots(10);
     */
    static spawnBots(count: number): void {
        console.log(`[BotManager] Spawning ${count} Internal Bots...`);
        for (let i = 0; i < count; i++) {
            const username = `Bot_${i + 1}`;
            const bot = new BotPlayer(username);

            // Assign standard starting coordinates
            bot.x = 3222;
            bot.z = 3222;
            bot.level = 0;

            // Inject the bot into the engine's `newPlayers` array.
            // When World.processLogins() runs on the next tick, this bot will be
            // formally registered and placed into the game world for all to see.
            World.newPlayers.add(bot as unknown as NetworkPlayer);
            this.bots.push(bot);
            
            console.log(`[BotManager] Injected bot ${username} into the login queue.`);
        }
    }

    /**
     * Hook this function into World.ts's main loop (e.g. at the top of processPlayers).
     * This drives the AI for all simulated bots every 600ms server tick.
     */
    static tickBots(): void {
        for (const bot of this.bots) {
            // Only think if the bot has been fully logged in by the World cycle
            if (bot.client.state === 1) {
                bot.onTick();
            }
        }
    }
}
