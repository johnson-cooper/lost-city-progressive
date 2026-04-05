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


export { PlayerStat };

// ── Walking ───────────────────────────────────────────────────────────────────

/**
 * Walk toward (destX, destZ) using accurate collision-respecting pathfinding.
 *
 * Uses botWalkPath (accurate=true, range=104) so the bot always reaches the
 * exact destination tile and can route around castle walls, rivers, and gates.
 *
 * For destinations beyond 100 tiles, walks in 90-tile segments — each call
 * advances the bot and the next tick continues toward the final goal.
 *
 * Must set moveSpeed=WALK first — updateMovement() skips its reset when
 * moveSpeed is INSTANT, permanently blocking headless player movement.
 */
export function walkTo(player: Player, destX: number, destZ: number): void {
    player.moveSpeed = MoveSpeed.WALK;

    const dx   = destX - player.x;
    const dz   = destZ - player.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 1) return;

    if (dist <= 100) {
        // Try accurate=true first (exact tile), fall back to accurate=false (any adjacent tile)
        let path = botWalkPath(player.level, player.x, player.z, destX, destZ);
        if (path.length === 0) path = botFindPath(player.level, player.x, player.z, destX, destZ);
        if (path.length > 0) {
            player.queueWaypoints(path);
            return;
        }
    } else {
        const midX = Math.round(player.x + (dx / dist) * 90);
        const midZ = Math.round(player.z + (dz / dist) * 90);
        let path = botWalkPath(player.level, player.x, player.z, midX, midZ);
        if (path.length === 0) path = botFindPath(player.level, player.x, player.z, midX, midZ);
        if (path.length > 0) {
            player.queueWaypoints(path);
            return;
        }
    }

    // Both pathfinders failed — try 8 compass directions at 15 tiles
    const STEP = 15;
    const baseAngle = Math.atan2(dz, dx);
    const angles = [0, 45, -45, 90, -90, 135, -135, 180].map(d => d * Math.PI / 180);

    for (const offset of angles) {
        const angle = baseAngle + offset;
        const midX  = Math.round(player.x + Math.cos(angle) * STEP);
        const midZ  = Math.round(player.z + Math.sin(angle) * STEP);
        let path  = botWalkPath(player.level, player.x, player.z, midX, midZ);
        if (path.length === 0) path = botFindPath(player.level, player.x, player.z, midX, midZ);
        if (path.length > 0) {
            player.queueWaypoints(path);
            return;
        }
    }

    // Absolute last resort: 1-tile naive step
    player.queueWaypoint(player.x + Math.sign(dx), player.z + Math.sign(dz));
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

    // OPTIONAL: auto-pickup QoL (safe to include or remove)
    if (op === 1) {
        // could later add anti-misclick, loot priority, etc.
        // console.log('BOT picking up object:', obj.type);
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

    // Scan a grid of zones around the centre point
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
 * e.g. findNpcByName(..., 'bob') finds Bob the Axe Seller.
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
 * e.g. findLocByName(..., 'willow_tree') finds a willow tree.
 */
export function findLocByName(cx: number, cz: number, level: number, locName: string, radius = 10): Loc | null {
    const typeId = LocType.getId(locName);
    if (typeId === -1) return null;
    return findLocNear(cx, cz, level, typeId, radius);
}

/**
 * Search for any Loc whose type name starts with a prefix.
 * e.g. findLocByPrefix(..., 'copperrock') finds copperrock1 or copperrock2.
 * Optional exclude: substring that must NOT appear in the debugname.
 * e.g. findLocByPrefix(..., 'tree', 10, 'stump') skips tree stumps.
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
 * e.g. findNpcByPrefix(..., '_saltfish') finds any saltfish spot variant.
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

    // Scan a grid of zones around the centre point
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
 * This is the varp the combat engine reads to pick damagestyle from the weapon table.
 *
 * For unarmed (weapon_unarmed_table):
 *   0 = Accurate   → style_melee_accurate  → Attack XP
 *   1 = Aggressive → style_melee_aggressive → Strength XP
 *   2 = Defensive  → style_melee_defensive  → Defence XP
 *   3 → clamped to 2 by player_combat_stat  → Defence XP (safe alias)
 *
 * player_combat_stat re-reads com_mode every time a stat changes (via [changestat,_]),
 * so the new style takes effect on the first XP gain after this call.
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
    if (!obj.isValid()) return false; // skip ownership/reveal check — NPC drops have a specific receiver64 that won't match the bot's hash64

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
 * e.g. findNpcBySuffix(..., '_saltfish') matches '0_44_53_saltfish' etc.
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
    // Bot must be within 1 tile of any face of the bounding box
    const dx = Math.max(0, Math.max(loc.x - player.x, player.x - (loc.x + w - 1)));
    const dz = Math.max(0, Math.max(loc.z - player.z, player.z - (loc.z + l - 1)));
    return dx <= 1 && dz <= 1 && (dx + dz) <= 1;
}

/**
 * Scan within `radius` tiles for any closed door or gate (op1 = "Open").
 * Covers standard named gates/doors as well as loc_XXXX-named gates that
 * have no "gate" in their debugname.
 *
 * Returns true if an obstruction was found and an Open interaction was queued.
 * Call from walk/scan states when the bot appears blocked.
 */
export function openNearbyGate(player: Player, radius = 5): boolean {
    const blocker = _findLoc(player.x, player.z, player.level, radius, loc => {
        const t = LocType.get(loc.type);

        const ops = (t.op ?? [])
            .filter((o): o is string => typeof o === 'string')
            .map(o => o.toLowerCase());

        const isClosedGate =
            ops.includes('open') &&
            !ops.includes('close');

        return isClosedGate;
    });

    if (!blocker) return false;

    interactLoc(player, blocker as any);
    return true;
}
