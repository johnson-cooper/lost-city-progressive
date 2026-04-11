import { BotFSM, BotState } from '../ai/BotFSM.js';
import { IBotSkill } from '../framework/IBotSkill.js';
import BotPlayer from '../BotPlayer.js';
import { DefinitionLoader } from '../utils/DefinitionLoader.js';

export class GoblinMageSkill implements IBotSkill {
    readonly name = "Goblin Mage";
    readonly requiredLevel = 1;
    
    private targetNpcId: number = -1;
    private lootIds: number[] = [];
    private spellId: number = -1;

    init(bot: BotPlayer): BotFSM {
        this.targetNpcId = DefinitionLoader.getIdByName('Goblin', 'npc');
        this.lootIds = [
            DefinitionLoader.getIdByName('Mind rune', 'item'),
            DefinitionLoader.getIdByName('Water rune', 'item'),
            DefinitionLoader.getIdByName('Earth rune', 'item')
        ];
        
        // Example dynamic ID for spell "Wind Strike"
        // Actually, spells might not be in the 'item' defs, but mock for now
        this.spellId = DefinitionLoader.getIdByName('Wind Strike', 'spell');
        
        return new GoblinMageFSM(bot, this.targetNpcId, this.lootIds, this.spellId);
    }

    inspectState(bot: BotPlayer): string {
        if (!bot.botFSM) return 'NOT_INITIALIZED';
        return (bot.botFSM as any).currentState;
    }
}

class GoblinMageFSM extends BotFSM {
    private goblinId: number;
    private runeIds: number[];
    private spellId: number;
    
    // Bounds for Lumbridge goblins across the bridge
    private goblinBounds = { x1: 3238, z1: 3225, x2: 3264, z2: 3245 };

    constructor(bot: BotPlayer, goblinId: number, runeIds: number[], spellId: number) {
        super(bot);
        this.goblinId = goblinId;
        this.runeIds = runeIds;
        this.spellId = spellId;
    }

    protected update(): void {
        const bp = this.botPlayer;
        
        switch (this.currentState) {
            case BotState.IDLE:
                // Prioritize looting runes
                // if (foundAnyRune) { this.transitionTo(BotState.ACTION); return; }

                // Find nearest Goblin
                const npc = this.findNearestNpc(this.goblinId);
                if (npc) {
                    this.transitionTo(BotState.ACTION);
                    // Use magic spell
                    this.castSpellOn(npc, this.spellId);
                } else {
                    const wanderX = this.goblinBounds.x1 + Math.floor(Math.random() * (this.goblinBounds.x2 - this.goblinBounds.x1));
                    const wanderZ = this.goblinBounds.z1 + Math.floor(Math.random() * (this.goblinBounds.z2 - this.goblinBounds.z1));
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
                
            case BotState.INTERRUPT:
                this.transitionTo(BotState.IDLE);
                break;
        }
    }

    private findNearestNpc(id: number): any | null {
        // Mock method to find NPCs
        return null;
    }
    
    private castSpellOn(target: any, spellId: number): void {
        const bp = this.botPlayer;
        bp.setInteraction(target);
        // Mock sending spell packet
        // bp.client.sendPacket({ type: 'MAGIC_ON_NPC', spell: spellId, target: target.id });
    }
}
