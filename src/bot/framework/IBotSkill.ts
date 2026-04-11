import { BotFSM } from '../ai/BotFSM.js';
import BotPlayer from '../BotPlayer.js';

export interface IBotSkill {
    readonly name: string;
    readonly requiredLevel: number;
    
    /**
     * Initializes the skill FSM and binds the bot instance.
     */
    init(bot: BotPlayer): BotFSM;

    /**
     * Runs specific logic or returns a status string on demand.
     */
    inspectState(bot: BotPlayer): string;
}
