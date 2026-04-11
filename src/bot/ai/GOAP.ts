export interface AgentState {
    [key: string]: string | number | boolean;
}

export abstract class GOAPAction {
    public cost: number = 1;
    public preconditions: AgentState = {};
    public effects: AgentState = {};

    abstract isDone(): boolean;
    abstract checkProceduralPrecondition(bot: any): boolean;
    abstract perform(bot: any): boolean;

    /**
     * Checks if this action can be performed based on the current bot state.
     */
    public isCallable(state: AgentState, bot: any): boolean {
        for (const key in this.preconditions) {
            if (state[key] !== this.preconditions[key]) {
                return false;
            }
        }
        return this.checkProceduralPrecondition(bot);
    }
}

export class GOAPPlanner {
    /**
     * A highly simplified backward-chaining A* planner.
     * Takes a target state (e.g. { hasItem: 'Bronze Sword' }) and the available actions,
     * and attempts to find a sequence of actions that leads from the current state to the goal.
     */
    public plan(startState: AgentState, goalState: AgentState, availableActions: GOAPAction[]): GOAPAction[] | null {
        const usableActions = availableActions.filter(a => a.isCallable(startState, {})); // Bot context omitted for simplicity in this basic planner

        const leaves: { action: GOAPAction, state: AgentState, cost: number, parent: any }[] = [];

        // Build Graph
        const success = this.buildGraph({ action: null as any, state: startState, cost: 0, parent: null }, leaves, usableActions, goalState);

        if (!success || leaves.length === 0) {
            return null;
        }

        // Find the cheapest leaf node
        let cheapest = leaves[0];
        for (const leaf of leaves) {
            if (leaf.cost < cheapest.cost) {
                cheapest = leaf;
            }
        }

        // Walk up the tree to get the plan
        const result: GOAPAction[] = [];
        let n = cheapest;
        while (n.parent !== null) {
            result.push(n.action);
            n = n.parent;
        }

        return result.reverse();
    }

    private buildGraph(parent: any, leaves: any[], usableActions: GOAPAction[], goal: AgentState): boolean {
        let foundPath = false;

        for (const action of usableActions) {
            if (this.inState(action.preconditions, parent.state)) {
                // Apply the action's effects to the current state
                const currentState = { ...parent.state };
                for (const key in action.effects) {
                    currentState[key] = action.effects[key];
                }

                const node = { action, state: currentState, cost: parent.cost + action.cost, parent };

                if (this.inState(goal, currentState)) {
                    leaves.push(node);
                    foundPath = true;
                } else {
                    const subset = usableActions.filter(a => a !== action);
                    const found = this.buildGraph(node, leaves, subset, goal);
                    if (found) {
                        foundPath = true;
                    }
                }
            }
        }

        return foundPath;
    }

    private inState(test: AgentState, state: AgentState): boolean {
        for (const key in test) {
            if (state[key] !== test[key]) {
                return false;
            }
        }
        return true;
    }
}
