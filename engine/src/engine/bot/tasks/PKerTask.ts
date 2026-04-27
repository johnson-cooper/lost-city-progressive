/**
 * PKerTask.ts
 *
 * "Extras" personality — wilderness PKer.
 * Picks one of four gear profiles on first initialisation (mithril / adamant /
 * rune-light / rune-full), sets matching combat stats, then hunts across
 * wilderness zones appropriate for that level.
 * HP is recovered passively by chance when below threshold — no banking.
 */

import Player, { getExpByLevel } from '#/engine/entity/Player.js';
import {
    BotTask,
    walkTo,
    isNear,
    randInt,
    InvType,
    StuckDetector,
    ProgressWatchdog,
    teleportNear,
    PlayerStat,
    hasItem,
    Items,
} from '#/engine/bot/tasks/BotTaskBase.js';
import {
    addItem,
    interactPlayerOp,
    _equipLoot,
} from '#/engine/bot/BotAction.js';
import World from '#/engine/World.js';

// ── Profiles ──────────────────────────────────────────────────────────────────

interface PkerProfile {
    name: string;
    skillLevel: number;   // atk / str / def / hp all set to this
    weapon: number;
    helm: number;
    body: number;
    legs: number;
}

// Deep wilderness hunting zones (wild levels ~18–38).
// At these depths the ±wildLevel combat range covers virtually every player,
// so all profiles share the full zone pool.
const HUNTING_ZONES: [number, number][] = [
    [3082, 3663],  //  0 — Graveyard of Shadows west  (~wild 18)
    [3235, 3663],  //  1 — Graveyard of Shadows east  (~wild 18)
    [3050, 3695],  //  2 — west wilderness             (~wild 22)
    [3100, 3715],  //  3 — mid wilderness              (~wild 25)
    [3285, 3715],  //  4 — east wilderness ruins       (~wild 25)
    [3060, 3750],  //  5 — deep west                  (~wild 29)
    [3190, 3752],  //  6 — deep mid                   (~wild 30)
    [3290, 3752],  //  7 — deep east                  (~wild 30)
    [3050, 3790],  //  8 — far west                   (~wild 34)
    [3105, 3800],  //  9 — far mid (Lava Maze area)    (~wild 36)
    [3240, 3800],  // 10 — far east                   (~wild 36)
    [2972, 3820],  // 11 — far west deep               (~wild 38)
];

// skillLevel 21 → combat 24  (base 0.25*(21+21)=10.5, melee 0.325*(21+21)=13.65 → floor=24)
// skillLevel 35 → combat 40  (base=17.5, melee=22.75 → floor=40)
// skillLevel 47 → combat 54  (base=23.5, melee=30.55 → floor=54)
// skillLevel 60 → combat 69  ("60+")
const PKER_PROFILES: PkerProfile[] = [
    {
        name: 'mithril',
        skillLevel: 21,
        weapon: Items.MITHRIL_SCIMITAR,
        helm:   Items.MITHRIL_FULL_HELM,
        body:   Items.MITHRIL_PLATEBODY,
        legs:   Items.MITHRIL_PLATELEGS,
    },
    {
        name: 'adamant',
        skillLevel: 35,
        weapon: Items.ADAMANT_SCIMITAR,
        helm:   Items.ADAMANT_FULL_HELM,
        body:   Items.ADAMANT_PLATEBODY,
        legs:   Items.ADAMANT_PLATELEGS,
    },
    {
        name: 'rune-light',
        skillLevel: 47,
        weapon: Items.RUNE_SCIMITAR,
        helm:   Items.RUNE_FULL_HELM,
        body:   Items.RUNE_CHAINBODY,
        legs:   Items.RUNE_PLATELEGS,
    },
    {
        name: 'rune-full',
        skillLevel: 60,
        weapon: Items.RUNE_SCIMITAR,
        helm:   Items.RUNE_FULL_HELM,
        body:   Items.RUNE_PLATEBODY,
        legs:   Items.RUNE_PLATELEGS,
    },
];

// ── Constants ─────────────────────────────────────────────────────────────────

const HEAL_HP_FRAC   = 0.6;   // start passively healing below 60% HP
const HEAL_CHANCE    = 0.15;  // 15% chance per tick to heal when below threshold
const SCAN_RADIUS    = 25;
const DISENGAGE_DIST = 55;
const ZONE_DURATION_MIN = 60;
const ZONE_DURATION_MAX = 130;
const ZONE_WANDER = 18;

const PATROL_TAUNTS = ['1v1?', 'looking for trouble', 'come out come out', 'safe spot?', 'gf gear', 'who wants some', 'free kills', 'anyone out here?'];
const FIGHT_TAUNTS  = ['get rekt', 'gg', 'nowhere to run', 'rip', 'gf noob', 'lol', 'u ded', 'ez'];

// ── Helpers ───────────────────────────────────────────────────────────────────

// The wilderness begins at Z=3520. Each level is 8 tiles wide northward.
const WILD_Z_START = 3520;

function chebyshev(ax: number, az: number, bx: number, bz: number): number {
    return Math.max(Math.abs(ax - bx), Math.abs(az - bz));
}

// Returns the wilderness level (1–56) at the given Z coordinate, or 0 if not in wilderness.
function wildernessLevel(z: number): number {
    if (z < WILD_Z_START) return 0;
    return Math.max(1, Math.floor((z - WILD_Z_START) / 8) + 1);
}

// Returns true if attacker at the given wilderness depth can fight a target with that combat level gap.
function inCombatRange(wildLevel: number, attackerCb: number, targetCb: number): boolean {
    if (wildLevel <= 0) return false;
    return Math.abs(attackerCb - targetCb) <= wildLevel;
}

function findNearbyRealPlayer(bot: Player, radius: number): Player | null {
    const wildLevel = wildernessLevel(bot.z);
    if (wildLevel <= 0) return null; // not in wilderness

    let best: Player | null = null;
    let bestDist = radius + 1;
    for (const p of (World as any).playerLoop.all() as Iterable<Player>) {
        if (p === bot) continue;
        if ((p as any).is_bot) continue;
        if (p.level !== bot.level) continue; // dimension check (floor level)
        if (!inCombatRange(wildLevel, bot.combatLevel, p.combatLevel)) continue;
        const d = chebyshev(bot.x, bot.z, p.x, p.z);
        if (d < bestDist) { best = p; bestDist = d; }
    }
    return best;
}

// ── Task ──────────────────────────────────────────────────────────────────────

export class PKerTask extends BotTask {
    private state: 'init' | 'walk' | 'patrol' | 'engage' = 'init';

    // Profile is chosen once in handleInit and kept for the lifetime of the task.
    private profile: PkerProfile | null = null;

    private target: Player | null = null;
    private engageTicks = 0;

    private zonePoolIdx = 0;    // index into HUNTING_ZONES
    private zoneTicks = 0;
    private zoneDuration = 0;
    private waypointX = 0;
    private waypointZ = 0;
    private waypointSet = false;

    private readonly stuck = new StuckDetector(25, 4, 2);
    private readonly watchdog = new ProgressWatchdog(200);

    constructor() {
        super('PKer');
        this.zonePoolIdx = Math.floor(Math.random() * 6); // rough starting scatter
        this.zoneDuration = randInt(ZONE_DURATION_MIN, ZONE_DURATION_MAX);
    }

    shouldRun(_player: Player): boolean {
        return true;
    }

    tick(player: Player): void {
        if (this.interrupted) return;

        if (this.watchdog.check(player, false)) {
            this.interrupt();
            return;
        }

        if (this.cooldown > 0) {
            this.cooldown--;
            return;
        }

        const hp    = player.stats[PlayerStat.HITPOINTS];
        const maxHp = player.baseLevels[PlayerStat.HITPOINTS];

        // Respawn recovery: far from wilderness after a death → teleport back.
        if (this.profile && this.state !== 'init' && this.state !== 'walk') {
            const [zx, zz] = this._currentZoneCoords();
            if (chebyshev(player.x, player.z, zx, zz) > 100) {
                this.target = null;
                this.state = 'walk';
                return;
            }
        }

        // Passive HP regeneration — no food needed.
        if (this.state !== 'init' && hp < maxHp * HEAL_HP_FRAC) {
            if (Math.random() < HEAL_CHANCE) {
                player.levels[PlayerStat.HITPOINTS] = Math.min(maxHp, hp + randInt(1, 5));
            }
        }

        switch (this.state) {
            case 'init':   return this.handleInit(player);
            case 'walk':   return this.handleWalk(player);
            case 'patrol': return this.handlePatrol(player);
            case 'engage': return this.handleEngage(player);
        }
    }

    isComplete(): boolean {
        return false;
    }

    override reset(): void {
        super.reset();
        this.state = 'init';
        this.target = null;
        this.engageTicks = 0;
        this.zoneTicks = 0;
        this.waypointSet = false;
        // profile intentionally NOT reset — bot keeps its identity across task cycles
        this.stuck.reset();
        this.watchdog.reset();
    }

    // ── States ────────────────────────────────────────────────────────────────

    private handleInit(player: Player): void {
        // Pick a random profile on first init; keep it if already assigned.
        if (!this.profile) {
            this.profile = PKER_PROFILES[Math.floor(Math.random() * PKER_PROFILES.length)]!;
            this.zonePoolIdx = Math.floor(Math.random() * HUNTING_ZONES.length);
        }

        const p = this.profile;

        // Set combat stats — must update baseLevels, levels (current), stats (XP), and
        // the cached combatLevel field, otherwise the bot displays as level 3.
        if (player.baseLevels[PlayerStat.ATTACK] !== p.skillLevel) {
            const xp = getExpByLevel(p.skillLevel);
            const combatStats = [PlayerStat.ATTACK, PlayerStat.STRENGTH, PlayerStat.DEFENCE];
            for (const stat of combatStats) {
                player.baseLevels[stat] = p.skillLevel;
                player.levels[stat]     = p.skillLevel;
                player.stats[stat]      = xp;
            }
            player.baseLevels[PlayerStat.HITPOINTS] = p.skillLevel;
            player.levels[PlayerStat.HITPOINTS]     = p.skillLevel;
            player.stats[PlayerStat.HITPOINTS]      = p.skillLevel;
            player.combatLevel = player.getCombatLevel();
        }

        // Give gear if missing.
        for (const id of [p.weapon, p.helm, p.body, p.legs]) {
            if (!hasItem(player, id) && !this._wornContains(player, id)) {
                addItem(player, id, 1);
            }
        }

        _equipLoot(player);

        console.log(`[PKerTask] ${player.displayName} profile=${p.name} skill=${p.skillLevel} combat=${player.combatLevel}`);

        this.state = 'walk';
        this.cooldown = randInt(2, 4);
    }

    private handleWalk(player: Player): void {
        const [zx, zz] = this._currentZoneCoords();
        if (!isNear(player, zx, zz, ZONE_WANDER + 5)) {
            if (Math.abs(player.x - zx) > 120 || Math.abs(player.z - zz) > 120) {
                teleportNear(player, zx, zz);
                this.cooldown = randInt(1, 2);
                return;
            }
            this._stuckWalk(player, zx + randInt(-8, 8), zz + randInt(-8, 8));
            this.cooldown = 1;
            return;
        }
        this.waypointSet = false;
        this.state = 'patrol';
    }

    private handlePatrol(player: Player): void {
        this.zoneTicks++;

        // Scan from current position every tick.
        const found = findNearbyRealPlayer(player, SCAN_RADIUS);
        if (found) {
            this.target = found;
            this.engageTicks = 0;
            this.state = 'engage';
            interactPlayerOp(player, found.slot, 2);
            walkTo(player, found.x, found.z);
            this.watchdog.notifyActivity();
            return;
        }

        // Cycle to next zone in pool after spending enough time here.
        if (this.zoneTicks >= this.zoneDuration) {
            this.zoneTicks = 0;
            this.zoneDuration = randInt(ZONE_DURATION_MIN, ZONE_DURATION_MAX);
            this.zonePoolIdx = (this.zonePoolIdx + 1) % HUNTING_ZONES.length;
            this.waypointSet = false;
            if (Math.random() < 0.4) {
                player.say(PATROL_TAUNTS[Math.floor(Math.random() * PATROL_TAUNTS.length)]!);
            }
            this.state = 'walk';
            return;
        }

        // Pick a new waypoint within the zone when the current one is reached.
        const [zx, zz] = this._currentZoneCoords();
        if (!this.waypointSet || isNear(player, this.waypointX, this.waypointZ, 3)) {
            this.waypointX = zx + randInt(-ZONE_WANDER, ZONE_WANDER);
            this.waypointZ = zz + randInt(-ZONE_WANDER / 2, ZONE_WANDER / 2);
            this.waypointSet = true;
        }

        this._stuckWalk(player, this.waypointX, this.waypointZ);

        if (Math.random() < 0.008) {
            player.say(PATROL_TAUNTS[Math.floor(Math.random() * PATROL_TAUNTS.length)]!);
        }

        this.cooldown = 1;
    }

    private handleEngage(player: Player): void {
        const t = this.target;
        if (!t) { this.state = 'patrol'; return; }

        this.engageTicks++;

        if (chebyshev(player.x, player.z, t.x, t.z) > DISENGAGE_DIST) {
            this.target = null;
            this.state = 'patrol';
            return;
        }

        // Drop target if combat level gap is no longer legal (target fled to shallower wild).
        const wildLevel = wildernessLevel(player.z);
        if (!inCombatRange(wildLevel, player.combatLevel, t.combatLevel)) {
            this.target = null;
            this.state = 'patrol';
            return;
        }

        walkTo(player, t.x, t.z);

        if (this.engageTicks % 5 === 0) {
            interactPlayerOp(player, t.slot, 2);
            this.watchdog.notifyActivity();
        }

        if (Math.random() < 0.015) {
            player.say(FIGHT_TAUNTS[Math.floor(Math.random() * FIGHT_TAUNTS.length)]!);
        }

        this.cooldown = 1;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private _currentZoneCoords(): [number, number] {
        return HUNTING_ZONES[this.zonePoolIdx % HUNTING_ZONES.length] ?? [3100, 3752];
    }

    private _wornContains(player: Player, itemId: number): boolean {
        const worn = player.getInventory(InvType.WORN);
        if (!worn) return false;
        for (let slot = 0; slot < worn.capacity; slot++) {
            if (worn.get(slot)?.id === itemId) return true;
        }
        return false;
    }

    private _stuckWalk(player: Player, tx: number, tz: number): void {
        if (!this.stuck.check(player, tx, tz)) {
            walkTo(player, tx, tz);
            return;
        }
        if (this.stuck.desperatelyStuck) {
            teleportNear(player, tx, tz);
            this.stuck.reset();
            return;
        }
        walkTo(player, player.x + randInt(-10, 10), player.z + randInt(-10, 10));
    }
}
