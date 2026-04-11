import { EventType, IObserver, EventBus } from './EventBus.js';

export enum BotState {
    IDLE = 'IDLE',
    MOVING = 'MOVING',
    ACTION = 'ACTION',
    BANKING = 'BANKING',
    INTERRUPT = 'INTERRUPT'
}

export abstract class BotFSM implements IObserver {
    protected currentState: BotState = BotState.IDLE;
    protected botPlayer: any;

    constructor(botPlayer: any) {
        this.botPlayer = botPlayer;
        EventBus.subscribe(EventType.TICK, this);
        EventBus.subscribe(EventType.DAMAGE_TAKEN, this);
        EventBus.subscribe(EventType.INVENTORY_FULL, this);
    }

    /**
     * Hooked into the EventBus Observer pattern. 
     * The FSM transitions exclusively based on asynchronous events rather than procedural checking.
     */
    onNotify(event: EventType, data?: any): void {
        if (data && data.uid !== this.botPlayer.uid) return; // Ignore events for other players

        if (event === EventType.DAMAGE_TAKEN) {
            this.handleInterrupt("Damage Taken!");
            return;
        }

        if (event === EventType.INVENTORY_FULL) {
            this.transitionTo(BotState.BANKING);
            return;
        }

        if (event === EventType.TICK) {
            this.update();
        }
    }

    protected transitionTo(newState: BotState): void {
        console.log(`[BotFSM] ${this.botPlayer.username} transitioning: ${this.currentState} -> ${newState}`);
        this.currentState = newState;
    }

    private handleInterrupt(reason: string): void {
        console.warn(`[BotFSM] ${this.botPlayer.username} INTERRUPTED: ${reason}`);
        this.transitionTo(BotState.INTERRUPT);
        this.botPlayer.clearInteraction(); // Native server method
    }

    /**
     * Executes the current state's logic. Called exclusively on TICK events.
     */
    protected abstract update(): void;
}
