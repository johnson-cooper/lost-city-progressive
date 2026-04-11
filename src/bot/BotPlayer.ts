import Player from '#/engine/entity/Player.js';
import { NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';
import { EventBus, EventType } from './ai/EventBus.js';
import { BotFSM } from './ai/BotFSM.js';
import { IBotSkill } from './framework/IBotSkill.js';
import { CrowdControl } from './utils/CrowdControl.js';

class DummyClient {
    remoteAddress: string = '127.0.0.1';
    state: number = 1;
    send(data: Uint8Array): void {}
}

interface BotMemory {
    // 🧍 Conversation ownership
    lastSpeakerId?: string;
    lastMessage?: string; 
    lastContactTime?: number;
    isTyping?: boolean;
}

export default class BotPlayer extends Player {
    public isBot: boolean = true;
    public botFSM: BotFSM | null = null;
    public currentSkill: IBotSkill | null = null;
    
    // Functional Mapping properties
    public activeBotSkill: string = "";
    public previousBotSkill: string = "";

    // Memory & Social capabilities
    public memory: BotMemory = {};

    constructor(username: string) {
        super(username, username);
        (this as any).client = new DummyClient();
        this.reconnecting = false;
        this.staffModLevel = 0;
    }

    public setSkill(skill: IBotSkill) {
        this.currentSkill = skill;
        this.botFSM = skill.init(this);
    }

    public getCurrentState(): string {
        return this.currentSkill ? this.currentSkill.inspectState(this) : 'NO_SKILL';
    }

    /**
     * Hooked into `World.cycle()` for the custom think logic.
     * The bot does *not* procedurally do actions here. Instead, it emits a TICK event
     * to the EventBus, allowing the Event-Driven FSM to wake up and process goals.
     */

    /**
     * Social interaction hook. Triggered when another player says a message near the bot.
     * Allows the bot to respond to 'first contact'.
     */
    public onChatMessage(speakerId: string, message: string): void {
        const { ChatEngine } = require('./ai/ChatEngine.js');
        
        // Prevent bot from replying if it is already typing a response to someone else
        if (this.memory.isTyping) return;
        
        ChatEngine.processMessage(this, speakerId, message);
    }

    public onTick(): void {
        // 1. Functional Mapping Behavior Execution
        if (this.activeBotSkill) {
            const { SkillBehaviors } = require('./utils/SkillBehaviors.js');
            const skillLogic = SkillBehaviors[this.activeBotSkill];
            if (skillLogic) {
                skillLogic(this);
            }
        }

        if (!this.botFSM) return;

        // Perform Crowd Control check if we just arrived at a destination
        if (!this.hasWaypoints() && this.stepsTaken === 0) {
            CrowdControl.calculateStepAside(this);
        }

        // Emit Tick Event for Observer Pattern FSM
        EventBus.publish(EventType.TICK, { uid: this.uid, bot: this });

        // Example of reading server internal updates and routing them as events:
        if (this.currentHealth < (this.baseLevels[3] * 0.5)) {
            EventBus.publish(EventType.DAMAGE_TAKEN, { uid: this.uid, health: this.currentHealth });
        }

        if (this.inv.freeSpace() === 0) {
            EventBus.publish(EventType.INVENTORY_FULL, { uid: this.uid });
        }
    }
}
