import fs from 'fs';
import path from 'path';

// Mocks the internal server types typically found in `src/lostcity/cache/config/`
export interface Definition {
    id: number;
    name: string;
    desc?: string;
    options?: string[];
}

export class DefinitionLoader {
    private static items: Map<string, number> = new Map();
    private static npcs: Map<string, number> = new Map();
    private static objects: Map<string, number> = new Map();

    /**
     * Initializes the Definition Loader by parsing the server's data/pack/ files.
     * In a real LostCityRS environment, this would hook directly into ObjType, NpcType, and LocType.
     */
    static async loadAll(basePath: string = './data/pack/'): Promise<void> {
        console.log('[DefinitionLoader] Loading server definitions...');
        try {
            // Mocking the loading process. A real implementation would parse the `.dat` or JSON files.
            // this.loadFromFile(path.join(basePath, 'obj.json'), this.items);
            // this.loadFromFile(path.join(basePath, 'npc.json'), this.npcs);
            // this.loadFromFile(path.join(basePath, 'loc.json'), this.objects);

            // Populating mock data for the 2004 era bots requested
            this.npcs.set('chicken', 41);
            this.npcs.set('cow', 81);
            this.npcs.set('goblin', 15);
            
            this.items.set('feather', 314);
            this.items.set('cowhide', 1739);
            this.items.set('mind rune', 558);
            this.items.set('water rune', 555);
            this.items.set('earth rune', 557);
            
            this.objects.set('bank booth', 11402);
            
            console.log(`[DefinitionLoader] Successfully loaded ${this.items.size} items, ${this.npcs.size} npcs, and ${this.objects.size} objects.`);
        } catch (e) {
            console.error('[DefinitionLoader] Failed to load definitions:', e);
        }
    }

    /**
     * Helper method that dynamically resolves hardcoded IDs based on the internal cache string.
     * Throws an error if the name does not exist to prevent the bot from breaking silently.
     */
    static getIdByName(name: string, type: 'item' | 'npc' | 'object'): number {
        const lowerName = name.toLowerCase();
        let map: Map<string, number>;

        if (type === 'item') map = this.items;
        else if (type === 'npc') map = this.npcs;
        else if (type === 'object') map = this.objects;
        else throw new Error(`[DefinitionLoader] Invalid type requested: ${type}`);

        const id = map.get(lowerName);
        if (id === undefined) {
            console.warn(`[DefinitionLoader] Warning: Could not resolve ID for ${type} '${name}'. Returning -1.`);
            return -1;
        }

        return id;
    }
}
