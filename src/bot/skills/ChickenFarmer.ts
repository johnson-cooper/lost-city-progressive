import { BotFSM, BotState } from '../ai/BotFSM.js';
import { IBotSkill } from '../framework/IBotSkill.js';
import BotPlayer from '../BotPlayer.js';
import { DefinitionLoader } from '../utils/DefinitionLoader.js';

export class ChickenFarmerSkill implements IBotSkill {
    readonly name = "Chicken Farmer";
    readonly requiredLevel = 1;
    
    private targetNpcId: number = -1;
    private lootId: number = -1;

    init(bot: BotPlayer): BotFSM {
        // Dynamically resolve IDs from server config cache
        this.targetNpcId = DefinitionLoader.getIdByName('Chicken', 'npc');
        this.lootId = DefinitionLoader.getIdByName('Feather', 'item');
        
        return new ChickenFSM(bot, this.targetNpcId, this.lootId);
    }

    inspectState(bot: BotPlayer): string {
        if (!bot.botFSM) return 'NOT_INITIALIZED';
        return (bot.botFSM as any).currentState;
    }
}

class ChickenFSM extends BotFSM {
    private chickenId: number;
    private featherId: number;
    
    // Hardcoded bounding box for Lumbridge chicken pen
    private bounds = { x1: 3225, z1: 3295, x2: 3235, z2: 3302 };

    constructor(bot: BotPlayer, chickenId: number, featherId: number) {
        super(bot);
        this.chickenId = chickenId;
        this.featherId = featherId;
    }

    protected update(): void {
        const bp = this.botPlayer;
        
        // Anti-wander protection
        if (bp.x < this.bounds.x1 || bp.x > this.bounds.x2 || bp.z < this.bounds.z1 || bp.z > this.bounds.z2) {
            this.transitionTo(BotState.MOVING);
            bp.queueWaypoints([{x: 3230, z: 3298}]); // Walk back to center
            return;
        }

        switch (this.currentState) {
            case BotState.IDLE:
                // Look for ground item (feathers) first
                // (Assuming server World object has a method to get ground items nearby)
                // if (foundFeather) { this.transitionTo(BotState.ACTION); bp.interactWithObj(featherId); return; }

                // Find nearest chicken
                const npc = this.findNearestNpc(this.chickenId);
                if (npc) {
                    this.transitionTo(BotState.ACTION);
                    bp.setInteraction(npc);
                } else {
                    // Wander around pen
                    const wanderX = this.bounds.x1 + Math.floor(Math.random() * (this.bounds.x2 - this.bounds.x1));
                    const wanderZ = this.bounds.z1 + Math.floor(Math.random() * (this.bounds.z2 - this.bounds.z1));
                    bp.queueWaypoints([{x: wanderX, z: wanderZ}]);
                    this.transitionTo(BotState.MOVING);
                }
                break;

            case BotState.MOVING:
                if (!bp.hasWaypoints() && bp.stepsTaken === 0) {
                    this.transitionTo(BotState.IDLE);
                }
                break;

            case BotState.ACTION:
                // Check if target is dead or interaction cleared
                if (!bp.target) {
                    this.transitionTo(BotState.IDLE);
                }
                break;
                
            case BotState.INTERRUPT:
                // Attempt to re-evaluate and recover on next tick
                this.transitionTo(BotState.IDLE);
                break;
        }
    }

    private findNearestNpc(id: number): any | null {
        // Mock method: In reality, access `World.gameMap.getZone(this.botPlayer.x, this.botPlayer.z).npcs`
        return null;
    }
}
