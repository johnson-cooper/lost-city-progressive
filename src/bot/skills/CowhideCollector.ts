import { BotFSM, BotState } from '../ai/BotFSM.js';
import { IBotSkill } from '../framework/IBotSkill.js';
import BotPlayer from '../BotPlayer.js';
import { DefinitionLoader } from '../utils/DefinitionLoader.js';

export class CowhideCollectorSkill implements IBotSkill {
    readonly name = "Cowhide Collector";
    readonly requiredLevel = 1;
    
    private targetNpcId: number = -1;
    private lootId: number = -1;

    init(bot: BotPlayer): BotFSM {
        this.targetNpcId = DefinitionLoader.getIdByName('Cow', 'npc');
        this.lootId = DefinitionLoader.getIdByName('Cowhide', 'item');
        
        return new CowhideFSM(bot, this.targetNpcId, this.lootId);
    }

    inspectState(bot: BotPlayer): string {
        if (!bot.botFSM) return 'NOT_INITIALIZED';
        return (bot.botFSM as any).currentState;
    }
}

class CowhideFSM extends BotFSM {
    private cowId: number;
    private hideId: number;
    
    // Bounds for Lumbridge cow pen
    private farmBounds = { x1: 3254, z1: 3255, x2: 3265, z2: 3297 };
    
    // Bank coords (Lumbridge top floor or Al Kharid)
    private bankCoords = { x: 3208, z: 3219 }; // Mock coords

    constructor(bot: BotPlayer, cowId: number, hideId: number) {
        super(bot);
        this.cowId = cowId;
        this.hideId = hideId;
    }

    protected update(): void {
        const bp = this.botPlayer;
        
        // Banking logic
        if (bp.invFull()) {
            this.transitionTo(BotState.BANKING);
            return;
        }

        switch (this.currentState) {
            case BotState.IDLE:
                // Prioritize looting cowhides over attacking
                // if (foundCowhide) { this.transitionTo(BotState.ACTION); bp.interactWithObj(hideId); return; }

                // Find nearest Cow
                const npc = this.findNearestNpc(this.cowId);
                if (npc) {
                    this.transitionTo(BotState.ACTION);
                    bp.setInteraction(npc);
                } else {
                    // Wander around cow pen
                    const wanderX = this.farmBounds.x1 + Math.floor(Math.random() * (this.farmBounds.x2 - this.farmBounds.x1));
                    const wanderZ = this.farmBounds.z1 + Math.floor(Math.random() * (this.farmBounds.z2 - this.farmBounds.z1));
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
                if (!bp.target) {
                    this.transitionTo(BotState.IDLE);
                }
                break;

            case BotState.BANKING:
                // If near bank, deposit items, else path to bank
                const distToBank = Math.abs(bp.x - this.bankCoords.x) + Math.abs(bp.z - this.bankCoords.z);
                if (distToBank < 5) {
                    // Mock deposit
                    bp.clearInventory();
                    this.transitionTo(BotState.IDLE);
                    // Walk back to farm
                    bp.queueWaypoints([{x: 3260, z: 3275}]);
                } else {
                    bp.queueWaypoints([this.bankCoords]);
                }
                break;
                
            case BotState.INTERRUPT:
                this.transitionTo(BotState.IDLE);
                break;
        }
    }

    private findNearestNpc(id: number): any | null {
        // Mock method to find NPCs
        return null;
    }
}
