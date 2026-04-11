import BotPlayer from '../BotPlayer.js';
import BotManager from '../BotManager.js';
import World from '#/engine/World.js';

type CommandCallback = (args: string[], player: any) => void;

/**
 * CommandRegistry: A modular decorator-like manager for registering admin commands
 * related to the bot framework without touching central Engine code.
 */
export class CommandRegistry {
    private static commands: Map<string, CommandCallback> = new Map();

    /**
     * Use this decorator to automatically register chat commands (e.g., ::bot spawn)
     */
    static register(command: string, callback: CommandCallback): void {
        this.commands.set(command, callback);
        console.log(`[CommandRegistry] Registered command: ::${command}`);
    }

    /**
     * Hook this method into PacketHandlers.ts -> handleClientCommand()
     */
    static handleCommand(player: any, commandString: string): boolean {
        const parts = commandString.split(' ');
        const cmd = parts[0];
        
        if (this.commands.has(cmd)) {
            const callback = this.commands.get(cmd)!;
            callback(parts.slice(1), player);
            return true;
        }
        return false;
    }
}

// ==========================================
// Register Default Bot Commands
// ==========================================

CommandRegistry.register("bot_spawn", (args, player) => {
    const count = args[0] ? parseInt(args[0]) : 1;
    BotManager.spawnBots(count);
    player.messageGame(`Spawned ${count} new bots.`);
});

CommandRegistry.register("bot_inspect", (args, player) => {
    const targetName = args.join(" ");
    if (!targetName) {
        player.messageGame("Usage: ::bot_inspect <bot_name>");
        return;
    }
    
    const bot = BotManager.bots.find(b => b.username.toLowerCase() === targetName.toLowerCase());
    if (bot) {
        player.messageGame(`[Inspect] ${bot.username} State: ${bot.getCurrentState()}`);
    } else {
        player.messageGame("Bot not found.");
    }
});
