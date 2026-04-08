/**
 * BotAction.ts
 *
 * Low-level primitives that drive a real Player using the actual engine APIs.
 * Nothing here teleports. Every movement goes through the pathfinder.
 * Every interaction goes through setInteraction(). The engine's processInteraction()
 * client click does.
 *
 * Three categories of action:
 *
 *   WALK     — queueWaypoints via botWalkPath (accurate=true, range=104)
 *   INTERACT — setInteraction(Interaction.ENGINE, target, triggerType)
 *              The engine then walks the player to the target and fires the
 *              script trigger once in range. One call = one click.
 *   WORLD    — helpers to find NPCs and Locs near a coordinate so tasks
 *              can look up their targets before interacting.
 *
 * Import surface exposed to tasks:
 *   walkTo(player, x, z)
 *   isNear(player, x, z, dist)
 *   hasWaypoints(player)
 *   isMoving(player)
 *
 *   interactNpc(player, npc)          — op1 on an NPC (open shop, talk, etc.)
 *   interactLoc(player, loc)          — op1 on a Loc (chop tree, mine rock, etc.)
 *   interactLocOp(player, loc, op)    — opN on a Loc (specific option number)
 *   interactNpcOp(player, npc, op)    — opN on an NPC
 *
 *   findNpcNear(x, z, level, npcTypeId, radius)   — search for a live NPC
 *   findLocNear(x, z, level, locTypeId, radius)   — search for a live Loc
 *   findNpcByName(x, z, level, npcName, radius)   — search by debug name
 *   findLocByName(x, z, level, locName, radius)   — search by debug name
 *
 *   getLevel / getBaseLevel / getXp / addXp
 *   getBackpack / isInventoryFull / freeSlots
 *   countItem / addItem / removeItem / hasItem / clearBackpack
 *   getCombatLevel
 */

import Player from '#/engine/entity/Player.js';
import Npc from '#/engine/entity/Npc.js';
import Loc from '#/engine/entity/Loc.js';
import { Interaction } from '#/engine/entity/Interaction.js';
import { PlayerStat } from '#/engine/entity/PlayerStat.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import NpcType from '#/cache/config/NpcType.js';
import LocType from '#/cache/config/LocType.js';
import InvType from '#/cache/config/InvType.js';
import { getWorld } from '#/engine/bot/BotWorld.js';
import { botWalkPath, botFindPath } from '#/engine/GameMap.js';
import { MoveSpeed } from '#/engine/entity/MoveSpeed.js';
import VarPlayerType from '#/cache/config/VarPlayerType.js';
import Obj from '#/engine/entity/Obj.js';
import ObjType from '#/cache/config/ObjType.js';
import ScriptRunner from '#/engine/script/ScriptRunner.js';
import ScriptProvider from '#/engine/script/ScriptProvider.js';
import CategoryType from '#/cache/config/CategoryType.js';
import { Inventory } from '#/engine/Inventory.js';
import { Items } from '#/engine/bot/BotKnowledge.js';


export { PlayerStat };

// ── Walking ───────────────────────────────────────────────────────────────────

/**
 * Gateway regions — fenced or walled areas that require routing through a
 * specific approach tile / gate before reaching the interior destination.
 *
 * When walkTo() is called with a destination inside one of these regions and
 * the bot is currently outside, it walks to `approachX/Z` first, then tries
 * to open the gate before continuing.  Once the bot is inside the region
 * (playerInRegion = true) normal pathfinding resumes.
 *
 * Coordinate bounds are conservative on purpose — when in doubt keep them tight
 * so ordinary nearby destinations are never accidentally re-routed.
 */
type GatewayRegion = {
    readonly name: string;
    /** Destination is in the gated area. */
    readonly destInRegion:   (x: number, z: number) => boolean;
    /** Bot is already inside — skip gateway routing. */
    readonly playerInRegion: (x: number, z: number) => boolean;
    /** Tile to walk to so the bot faces the gate from the correct side. */
    readonly approachX: number;
    readonly approachZ: number;
    /** How close (Chebyshev) to the approach tile before trying to open the gate. */
    readonly arrivalRadius: number;
};

const GATEWAY_REGIONS: GatewayRegion[] = [
    {
        // ── Al Kharid south ───────────────────────────────────────────────────
        // The Lumbridge-AlKharid wall runs at x ≈ 3268, z ≈ 3197..3244.
        // Gate tile: ~[3268, 3227].  Destinations inside: warriors, bank,
        // scimitar shop, furnace, etc.  Bots must approach from the west side
        // (Lumbridge) to open the gate — NOT from the south where the wall has
        // no opening.  Without this routing a bot walking to [3294, 3172] hits
        // the wall 55 tiles south of the gate and can never open it.
        name: 'AlKharid',
        destInRegion:   (x, z) => x >= 3265 && z >= 3155 && z <= 3242,
        playerInRegion: (x, z) => x >= 3267 && z >= 3155 && z <= 3242,
        approachX: 3267,
        approachZ: 3228,
        arrivalRadius: 4,
    },
    {
        // ── Lumbridge cow pen ─────────────────────────────────────────────────
        // Fenced enclosure north of Lumbridge castle.  South gate at ~[3253, 3265].
        // Bots walking directly to the interior ([3255, 3276]) hit the south
        // fence unless they approach through the gate tile.
        name: 'CowPen',
        destInRegion:   (x, z) => x >= 3248 && x <= 3265 && z >= 3266 && z <= 3296,
        playerInRegion: (x, z) => x >= 3248 && x <= 3265 && z >= 3266 && z <= 3296,
        approachX: 3253,
        approachZ: 3263,
        arrivalRadius: 4,
    },
    {
        // ── Varrock north (yew trees behind palace) ───────────────────────────
        // The yews at [3204, 3499] are north of Varrock palace and reachable
        // only by navigating through the city.  Routing through the Varrock
        // south road entry gives the pathfinder a clear corridor to follow.
        name: 'VarrockNorth',
        destInRegion:   (x, z) => x >= 3180 && x <= 3240 && z >= 3470,
        playerInRegion: (x, z) => x >= 3180 && x <= 3240 && z >= 3430,
        approachX: 3212,
        approachZ: 3432,
        arrivalRadius: 10,
    },
];

/**
 * Raw pathfinding toward a single tile: accurate → relaxed → compass → naive.
 * Does NOT do any gateway pre-routing.  Call walkTo() for normal movement.
 */
function _pathTowards(player: Player, destX: number, destZ: number): void {
    const dx   = destX - player.x;
    const dz   = destZ - player.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 1) return;

    if (dist <= 100) {
        let path = botWalkPath(player.level, player.x, player.z, destX, destZ);
        if (path.length === 0) path = botFindPath(player.level, player.x, player.z, destX, destZ);
        if (path.length > 0) { player.queueWaypoints(path); return; }
    } else {
        const midX = Math.round(player.x + (dx / dist) * 90);
        const midZ = Math.round(player.z + (dz / dist) * 90);
        let path = botWalkPath(player.level, player.x, player.z, midX, midZ);
        if (path.length === 0) path = botFindPath(player.level, player.x, player.z, midX, midZ);
        if (path.length > 0) { player.queueWaypoints(path); return; }
    }

    // Both pathfinders failed — try 8 compass directions at 15 tiles
    const STEP = 15;
    const baseAngle = Math.atan2(dz, dx);
    for (const deg of [0, 45, -45, 90, -90, 135, -135, 180]) {
        const angle = baseAngle + deg * Math.PI / 180;
        const midX  = Math.round(player.x + Math.cos(angle) * STEP);
        const midZ  = Math.round(player.z + Math.sin(angle) * STEP);
        let path  = botWalkPath(player.level, player.x, player.z, midX, midZ);
        if (path.length === 0) path = botFindPath(player.level, player.x, player.z, midX, midZ);
        if (path.length > 0) { player.queueWaypoints(path); return; }
    }

    // Absolute last resort: 1-tile naive step
    player.queueWaypoint(player.x + Math.sign(dx), player.z + Math.sign(dz));
}

/**
 * Walk toward (destX, destZ) using accurate collision-respecting pathfinding.
 *
 * Automatically routes through known gateway regions (Al Kharid gate, cow pen,
 * Varrock north) so bots always approach gates from the correct side.
 *
 * For destinations beyond 100 tiles, walks in 90-tile segments — each call
 * advances the bot and the next tick continues toward the final goal.
 *
 * Must set moveSpeed=WALK first — updateMovement() skips its reset when
 * moveSpeed is INSTANT, permanently blocking headless player movement.
 */
export function walkTo(player: Player, destX: number, destZ: number): void {
    player.moveSpeed = MoveSpeed.WALK;

    if (Math.abs(player.x - destX) < 1 && Math.abs(player.z - destZ) < 1) return;

    // ── Gateway routing ─────────────────────────────────────────────────────
    // If the destination is inside a gated region and the bot is outside,
    // walk to the approach tile first, then open the gate, then proceed.
    for (const gw of GATEWAY_REGIONS) {
        if (!gw.destInRegion(destX, destZ))         continue; // dest not in this region
        if ( gw.playerInRegion(player.x, player.z)) continue; // already inside

        const gwDist = Math.max(
            Math.abs(player.x - gw.approachX),
            Math.abs(player.z - gw.approachZ)
        ); // Chebyshev distance

        if (gwDist > gw.arrivalRadius) {
            // Not yet at the approach tile — walk toward it first.
            _pathTowards(player, gw.approachX, gw.approachZ);
            return;
        }

        // Close to approach tile — try to open the gate.
        if (openNearbyGate(player, 8)) return; // gate interaction queued, wait
        // Gate is open (or no gate found) — fall through to normal pathfinding.
        break;
    }

    // ── Normal pathfinding ──────────────────────────────────────────────────
    _pathTowards(player, destX, destZ);
}


export function interactHeldOp(
    player: Player,
    inv: Inventory,
    itemId: number,
    slot: number,
    op: 1 | 2 | 3 | 4 | 5 | 6
): boolean {
    const trigger = (ServerTriggerType.OPHELD1 + (op - 1)) as ServerTriggerType;
    if (!inv || !inv.validSlot(slot) || !inv.hasAt(slot, itemId)) {
        player.clearPendingAction();
        return false;
    }
    const type = ObjType.get(itemId);
    if (player.delayed) {
        return false;
    }

    player.lastItem = itemId;
    player.lastSlot = slot;
    player.moveClickRequest = false;
    player.faceEntity = -1;
    player.masks |= player.entitymask;

    const script = ScriptProvider.getByTrigger(trigger, type.id, type.category);
    if (script) {
        player.executeScript(ScriptRunner.init(script, player), true);
    }

    if (op === 1 && itemId === Items.BONES) {
        console.log('BOT burying bone traditionally:', itemId);
        return true;
    }
    return true;
}

export function interactHeldOpU(
    player: Player,
    inv: Inventory,
    itemId: number,
    slot: number,
    useItem: number,
    useSlot: number
): boolean {
    if (player.delayed) {
        return false;
    }
    player.lastItem = itemId;
    player.lastSlot = slot;
    player.lastUseItem = useItem;
    player.lastUseSlot = useSlot;
    if(inv.get(slot)?.id !== itemId || inv.get(useSlot)?.id !== useItem) {
        console.log('Useitem data does not match!', itemId, useItem);
        return false;
    }
    const objType = ObjType.get(player.lastItem);
    const useObjType = ObjType.get(player.lastUseItem);

    player.clearPendingAction();
    player.faceEntity = -1;
    player.masks |= player.entitymask;

    // [opheldu,b]
    let script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.OPHELDU, objType.id, -1);

    // [opheldu,a]
    if (!script) {
        script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.OPHELDU, useObjType.id, -1);
        [player.lastItem, player.lastUseItem] = [player.lastUseItem, player.lastItem];
        [player.lastSlot, player.lastUseSlot] = [player.lastUseSlot, player.lastSlot];
    }

    // [opheld,b_category]
    const objCategory = objType.category !== -1 ? CategoryType.get(objType.category) : null;
    if (!script && objCategory) {
        script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.OPHELDU, -1, objCategory.id);
    }

    // [opheld,a_category]
    const useObjCategory = useObjType.category !== -1 ? CategoryType.get(useObjType.category) : null;
    if (!script && useObjCategory) {
        script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.OPHELDU, -1, useObjCategory.id);
        [player.lastItem, player.lastUseItem] = [player.lastUseItem, player.lastItem];
        [player.lastSlot, player.lastUseSlot] = [player.lastUseSlot, player.lastSlot];
    }

    if (script) {
        player.executeScript(ScriptRunner.init(script, player), true);
    }
    return true;
}

/** True if the bot has queued walk steps remaining. */
export function hasWaypoints(player: Player): boolean {
    return player.hasWaypoints();
}

/** True if the bot is currently mid-walk (has waypoints). */
export function isMoving(player: Player): boolean {
    return player.hasWaypoints();
}

/** True if the bot is within `dist` tiles of (x, z) on the same floor. */
export function isNear(player: Player, x: number, z: number, dist: number, level = 0): boolean {
    return player.level === level &&
           Math.abs(player.x - x) <= dist &&
           Math.abs(player.z - z) <= dist;
}

// ── Interactions ──────────────────────────────────────────────────────────────

/**
 * Interact with an NPC using op 1 (e.g. "Talk-to", "Attack").
 * The engine will path the bot to the NPC and fire [opnpc1,npcName].
 */
export function interactNpc(player: Player, npc: Npc): void {
    player.clearPendingAction();
    player.setInteraction(Interaction.ENGINE, npc, ServerTriggerType.APNPC1);
}

/**
 * Interact with an NPC using a specific option number (1-5).
 * op=2 is typically "Trade" for shops.
 */
export function interactNpcOp(player: Player, npc: Npc, op: 1 | 2 | 3 | 4 | 5): void {
    const trigger = (ServerTriggerType.APNPC1 + (op - 1)) as ServerTriggerType;
    player.clearPendingAction();
    player.setInteraction(Interaction.ENGINE, npc, trigger);
}

export function interactObjOp(
    player: Player,
    obj: Obj,
    op: 1 | 2 | 3 | 4 | 5
): void {
    const trigger = (ServerTriggerType.APOBJ1 + (op - 1)) as ServerTriggerType;

    player.clearPendingAction();
    player.setInteraction(Interaction.ENGINE, obj, trigger);

    if (op === 1) {
        // could later add anti-misclick, loot priority, etc.
    }
}

//Ground items
function _findObj(
    cx: number, cz: number, level: number,
    radius: number,
    predicate: (obj:Obj) => boolean
): Obj | null {
    let best: Obj | null = null;
    let bestDist = Infinity;

    const zoneRadius = Math.ceil(radius / 8) + 1;
    for (let dz = -zoneRadius; dz <= zoneRadius; dz++) {
        for (let dx = -zoneRadius; dx <= zoneRadius; dx++) {
            const zx = cx + dx * 8;
            const zz = cz + dz * 8;
            const zone = getWorld().gameMap.getZone(zx, zz, level);
            if (!zone) continue;
            for (const obj of zone.getAllObjsSafe()) {
                if (!predicate(obj)) continue;
                const dist = Math.abs(obj.x - cx) + Math.abs(obj.z - cz);
                if (dist <= radius * 2 && dist < bestDist) {
                    bestDist = dist;
                    best     = obj;
                }
            }
        }
    }
    return best;
}

export function findObjByPrefix(
    cx: number,
    cz: number,
    level: number,
    prefix: string,
    radius = 20
): Obj | null {
    return _findObj(cx, cz, level, radius, obj => {
        const t = ObjType.get(obj.type);
        return !!(t.debugname?.startsWith(prefix));
    });
}

export function findObjNear(
    cx: number,
    cz: number,
    level: number,
    objTypeId: number,
    radius = 10
): Obj | null {
    return _findObj(cx, cz, level, radius, obj => obj.type === objTypeId);
}

export function findObjByName(
    cx: number,
    cz: number,
    level: number,
    objName: string,
    radius = 10
): Obj | null {
    const typeId = ObjType.getId(objName);
    if (typeId === -1) return null;
    return findObjNear(cx, cz, level, typeId, radius);
}

/**
 * Interact with a Loc using op 1 (e.g. "Chop", "Mine", "Fish").
 * The engine will path the bot adjacent to the Loc and fire [oploc1,locName].
 */
export function interactLoc(player: Player, loc: Loc): void {
    player.clearPendingAction();
    player.setInteraction(Interaction.ENGINE, loc, ServerTriggerType.APLOC1);
}

/**
 * Interact with a Loc using a specific option number (1-5).
 */
export function interactLocOp(player: Player, loc: Loc, op: 1 | 2 | 3 | 4 | 5): void {
    const trigger = (ServerTriggerType.APLOC1 + (op - 1)) as ServerTriggerType;
    player.clearPendingAction();
    player.setInteraction(Interaction.ENGINE, loc, trigger);
}

// ── World search ──────────────────────────────────────────────────────────────

/**
 * Search zones around (cx, cz) for a live NPC matching npcTypeId.
 * Returns the closest one found within `radius` tiles, or null.
 */
export function findNpcNear(cx: number, cz: number, level: number, npcTypeId: number, radius = 10): Npc | null {
    return _findNpc(cx, cz, level, radius, npc => npc.type === npcTypeId);
}

/**
 * Search zones around (cx, cz) for a live NPC whose debug name matches.
 */
export function findNpcByName(cx: number, cz: number, level: number, npcName: string, radius = 10): Npc | null {
    const typeId = NpcType.getId(npcName);
    if (typeId === -1) return null;
    return findNpcNear(cx, cz, level, typeId, radius);
}

/**
 * Search zones around (cx, cz) for a live Loc (object in the world) matching locTypeId.
 * Returns the closest one found within `radius` tiles, or null.
 */
export function findLocNear(cx: number, cz: number, level: number, locTypeId: number, radius = 10): Loc | null {
    return _findLoc(cx, cz, level, radius, loc => loc.type === locTypeId);
}

/**
 * Search zones around (cx, cz) for a live Loc whose debug name matches.
 */
export function findLocByName(cx: number, cz: number, level: number, locName: string, radius = 10): Loc | null {
    const typeId = LocType.getId(locName);
    if (typeId === -1) return null;
    return findLocNear(cx, cz, level, typeId, radius);
}

/**
 * Search for any Loc whose type name starts with a prefix.
 * Optional exclude: substring that must NOT appear in the debugname.
 */
export function findLocByPrefix(cx: number, cz: number, level: number, prefix: string, radius = 10, exclude?: string): Loc | null {
    return _findLoc(cx, cz, level, radius, loc => {
        const name = LocType.get(loc.type).debugname;
        if (!name?.startsWith(prefix)) return false;
        if (exclude && name.includes(exclude)) return false;
        return true;
    });
}

/**
 * Search for any NPC whose type name starts with a prefix.
 */
export function findNpcByPrefix(cx: number, cz: number, level: number, prefix: string, radius = 20): Npc | null {
    return _findNpc(cx, cz, level, radius, npc => {
        const t = NpcType.get(npc.type);
        return !!(t.debugname?.startsWith(prefix));
    });
}

// ── Internal zone search ──────────────────────────────────────────────────────

function _findNpc(
    cx: number, cz: number, level: number,
    radius: number,
    predicate: (npc: Npc) => boolean
): Npc | null {
    let best: Npc | null = null;
    let bestDist = Infinity;

    const zoneRadius = Math.ceil(radius / 8) + 1;
    for (let dz = -zoneRadius; dz <= zoneRadius; dz++) {
        for (let dx = -zoneRadius; dx <= zoneRadius; dx++) {
            const zx = cx + dx * 8;
            const zz = cz + dz * 8;
            const zone = getWorld().gameMap.getZone(zx, zz, level);
            if (!zone) continue;
            for (const npc of zone.getAllNpcsSafe()) {
                if (!predicate(npc)) continue;
                const dist = Math.abs(npc.x - cx) + Math.abs(npc.z - cz);
                if (dist <= radius * 2 && dist < bestDist) {
                    bestDist = dist;
                    best     = npc;
                }
            }
        }
    }
    return best;
}

function _findLoc(
    cx: number, cz: number, level: number,
    radius: number,
    predicate: (loc: Loc) => boolean
): Loc | null {
    let best: Loc | null = null;
    let bestDist = Infinity;

    const zoneRadius = Math.ceil(radius / 8) + 1;
    for (let dz = -zoneRadius; dz <= zoneRadius; dz++) {
        for (let dx = -zoneRadius; dx <= zoneRadius; dx++) {
            const zx = cx + dx * 8;
            const zz = cz + dz * 8;
            const zone = getWorld().gameMap.getZone(zx, zz, level);
            if (!zone) continue;
            for (const loc of zone.getAllLocsSafe()) {
                if (!predicate(loc)) continue;
                const dist = Math.abs(loc.x - cx) + Math.abs(loc.z - cz);
                if (dist <= radius * 2 && dist < bestDist) {
                    bestDist = dist;
                    best     = loc;
                }
            }
        }
    }
    return best;
}

// ── Skills ────────────────────────────────────────────────────────────────────

export function getLevel(player: Player, stat: PlayerStat): number {
    return player.levels[stat];
}

export function getBaseLevel(player: Player, stat: PlayerStat): number {
    return player.baseLevels[stat];
}

export function getXp(player: Player, stat: PlayerStat): number {
    return player.stats[stat];
}

export function addXp(player: Player, stat: PlayerStat, xp: number): void {
    player.addXp(stat, xp);
}

/**
 * Sets the player's melee combat mode (com_mode varp).
 */
export function setCombatStyle(player: Player, style: 0 | 1 | 2 | 3): void {
    const varp = VarPlayerType.getByName('com_mode');
    if (varp) player.setVar(varp.id, style);
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export function getBackpack(player: Player) {
    return player.getInventory(InvType.INV);
}

export function isInventoryFull(player: Player): boolean {
    const inv = getBackpack(player);
    return inv ? inv.isFull : false;
}

export function freeSlots(player: Player): number {
    const inv = getBackpack(player);
    return inv ? inv.freeSlotCount : 0;
}

export function countItem(player: Player, itemId: number): number {
    const inv = getBackpack(player);
    if (!inv) return 0;
    let total = 0;
    for (const item of inv.items) {
        if (item && item.id === itemId) total += item.count;
    }
    return total;
}

export function addItem(player: Player, itemId: number, count = 1): boolean {
    const inv = getBackpack(player);
    if (!inv) return false;
    return inv.add(itemId, count).hasSucceeded();
}

export function removeItem(player: Player, itemId: number, count = 1): boolean {
    const inv = getBackpack(player);
    if (!inv) return false;
    return inv.remove(itemId, count).completed >= count;
}

export function clearBackpack(player: Player): void {
    getBackpack(player)?.removeAll();
}

/**
 * Directly picks up a ground object into the player's backpack,
 * bypassing the engine interaction / script system entirely.
 * Returns true if the item was added and the obj removed from the world.
 */
export function pickupGroundItem(player: Player, obj: Obj): boolean {
    if (!obj.isValid()) return false;

    const inv = getBackpack(player);
    if (!inv) return false;

    const added = inv.add(obj.type, obj.count);
    if (!added.hasSucceeded()) return false;

    getWorld().removeObj(obj);
    return true;
}

export function hasItem(player: Player, itemId: number, count = 1): boolean {
    return countItem(player, itemId) >= count;
}

export function getCombatLevel(player: Player): number {
    return player.combatLevel;
}

/**
 * Search for any NPC whose debugname ends with a given suffix.
 */
export function findNpcBySuffix(cx: number, cz: number, level: number, suffix: string, radius = 20): Npc | null {
    return _findNpc(cx, cz, level, radius, npc => {
        const t = NpcType.get(npc.type);
        return !!(t.debugname?.endsWith(suffix));
    });
}

// ── Gate handling ─────────────────────────────────────────────────────────────

/**
 * Returns true if the bot is standing adjacent (within 1 tile of any face)
 * of the given loc, accounting for the loc's width and length.
 */
export function isAdjacentToLoc(player: Player, loc: { x: number; z: number; type: number }): boolean {
    const t = LocType.get(loc.type);
    const w = t.width  ?? 1;
    const l = t.length ?? 1;
    const dx = Math.max(0, Math.max(loc.x - player.x, player.x - (loc.x + w - 1)));
    const dz = Math.max(0, Math.max(loc.z - player.z, player.z - (loc.z + l - 1)));
    return dx <= 1 && dz <= 1 && (dx + dz) <= 1;
}

/**
 * Open-action keywords (lowercased) that indicate a closed/passable door or gate.
 * Covers standard "Open", toll gates ("Pay-toll(10gp)"), and walk-through doors.
 */
const GATE_OPEN_KEYWORDS  = ['open', 'pay', 'pay-toll', 'walk-through', 'pass-through', 'enter'];
const GATE_CLOSE_KEYWORDS = ['close', 'shut'];

/**
 * Scan within `radius` tiles for any closed door, gate, or toll gate.
 * Handles standard "Open" ops as well as "Pay-toll(10gp)" variants used by
 * the Al Kharid gate and similar toll structures.
 *
 * Returns true if an obstruction was found and an Open/Pay interaction was
 * queued.  Call from walk/scan states when the bot appears blocked.
 */
export function openNearbyGate(player: Player, radius = 10): boolean {
    const blocker = _findLoc(player.x, player.z, player.level, radius, loc => {
        const t = LocType.get(loc.type);
        const ops = (t.op ?? [])
            .filter((o): o is string => typeof o === 'string')
            .map(o => o.toLowerCase());

        const hasOpenOp  = ops.some(op => GATE_OPEN_KEYWORDS.some(kw => op.startsWith(kw)));
        const hasCloseOp = ops.some(op => GATE_CLOSE_KEYWORDS.some(kw => op === kw));

        return hasOpenOp && !hasCloseOp;
    });

    if (!blocker) return false;

    interactLoc(player, blocker as any);
    return true;
}
