export enum EventType {
    TICK = 'tick',
    DAMAGE_TAKEN = 'damageTaken',
    INVENTORY_FULL = 'inventoryFull',
    AREA_SOUND = 'areaSound',
    TARGET_DEAD = 'targetDead',
    RESOURCE_DEPLETED = 'resourceDepleted'
}

export interface IObserver {
    onNotify(event: EventType, data?: any): void;
}

/**
 * Event-Driven Architecture (Observer Pattern).
 * Replaces the heavy procedural polling loop with a Publisher-Subscriber model.
 * The bot remains entirely IDLE until the server broadcasts an event (e.g. DamageTaken).
 */
export class EventBus {
    private static observers: Map<EventType, IObserver[]> = new Map();

    public static subscribe(event: EventType, observer: IObserver): void {
        if (!this.observers.has(event)) {
            this.observers.set(event, []);
        }
        this.observers.get(event)!.push(observer);
    }

    public static unsubscribe(event: EventType, observer: IObserver): void {
        const subs = this.observers.get(event);
        if (subs) {
            this.observers.set(event, subs.filter(sub => sub !== observer));
        }
    }

    /**
     * Called globally by the Server Engine (e.g. inside World.onHit or Player.onInventoryAdd)
     * to immediately interrupt and notify all listening bots.
     */
    public static publish(event: EventType, data?: any): void {
        const subs = this.observers.get(event);
        if (subs) {
            for (const observer of subs) {
                observer.onNotify(event, data);
            }
        }
    }
}
