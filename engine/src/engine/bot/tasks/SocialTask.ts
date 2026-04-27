/**
 * SocialTask.ts
 *
 * "Extras" personality — social bot.
 * Approaches real players, chats, then leads them on a short walking tour.
 *
 * Pathfinding strategy:
 *  - Destinations are filtered to those within ~120 tiles of the bot's current
 *    position, so the bot never tries to cross the map.
 *  - Walking uses short 5-tile steps. If the bot gets stuck it tries a
 *    perpendicular detour (go around the wall). Only as a last resort does it
 *    do a tiny 6-tile hop forward — never a full teleport to the destination.
 */

import {
    BotTask,
    Player,
    walkTo,
    isNear,
    randInt,
    InvType,
    Items,
    StuckDetector,
    teleportNear,
    Locations,
} from '#/engine/bot/tasks/BotTaskBase.js';
import { Interfaces } from '#/engine/bot/BotKnowledge.js';
import {
    addItem,
    interactPlayerOp,
    interactIF_UseOp,
    interactIfButton,
} from '#/engine/bot/BotAction.js';
import World from '#/engine/World.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const SCAN_RADIUS     = 20;
const FOLLOW_RADIUS   = 14;   // tiles — "player is keeping up"
// Tiles the bot must never walk toward — permanently locked doors, etc.
// Each entry is [x, z, avoidRadius].
const BLOCKED_ZONES: [number, number, number][] = [
    [3216, 3381, 4],  // south Varrock permanently locked door
];

const DEST_MIN_DIST   = 20;   // don't pick a destination this close
const DEST_MAX_DIST   = 120;  // don't pick a destination this far
const LEAD_STEP       = 5;    // tiles per step when walking
const STUCK_PERP_TICK = 5;    // ticks before trying perpendicular detour
const STUCK_PERP2_TICK = 13;  // ticks before trying opposite perpendicular
const STUCK_HOP_TICK  = 22;   // ticks before tiny teleport hop
const ARRIVE_LINGER   = 120;  // ticks to hang around after arriving
const MISS_LIMIT      = 4;    // consecutive missed follow-checks before giving up

// ── Destinations ──────────────────────────────────────────────────────────────

interface Destination {
    name: string;
    x: number;
    z: number;
    radius: number;
    // Road waypoints the bot walks through in order before reaching the
    // final coord. Keeps it on open ground and away from known obstacles.
    waypoints: [number, number][];
    approachPhrases: string[];
    arrivalPhrases:  string[];
    idlePhrases:     string[];
}

const DESTINATIONS: Destination[] = [
    // ── Varrock area ──────────────────────────────────────────────────────────
    {
        name: 'Grand Exchange',
        x: 3165, z: 3420, radius: 8,
        waypoints: [],
        approachPhrases: ['follow me to the GE!', 'lets check the marketplace', 'heading to GE, u coming?', 'marketplace is just up here'],
        arrivalPhrases:  ['here we are!', 'GE, always busy', 'love this spot'],
        idlePhrases:     ['u ever trade here?', 'prices are alright', 'busy place', 'what do u usually buy?', 'I come here loads'],
    },
    {
        name: 'Varrock Square',
        x: 3212, z: 3446, radius: 5,
        waypoints: [[3196, 3440]],
        approachPhrases: ['come see varrock square', 'follow me to the fountain', 'this way!', 'varrock centre, follow'],
        arrivalPhrases:  ['the fountain!', 'classic varrock square', 'nice spot right'],
        idlePhrases:     ['people always hang here', 'varrock is my fave town', 'chill spot tbh', 'u been here before?', 'pretty central'],
    },
    {
        name: 'Varrock Palace',
        x: 3213, z: 3468, radius: 6,
        waypoints: [[3210, 3450]],
        approachPhrases: ['wanna see the palace?', 'follow me north', 'come check the palace out', 'just up here, follow'],
        arrivalPhrases:  ['the palace!', 'pretty big right', 'guards everywhere lol'],
        idlePhrases:     ['wonder what the king gets up to', 'big fancy building lol', 'lots of guards', 'u done the varrock quest?', 'impressive building'],
    },
    {
        name: 'Barbarian Village',
        x: 3082, z: 3422, radius: 6,
        waypoints: [
            [3155, 3437],  // road west out of Varrock
            [3120, 3437],  // road continuing west
            [3100, 3428],  // approaching barb village
        ],
        approachPhrases: ['ever been to barb village?', 'follow me west', 'come to barb village with me', 'barb village is west of here'],
        arrivalPhrases:  ['barbarian village!', 'bit sketchy but cool', 'wild spot'],
        idlePhrases:     ['barbarians everywhere lol', 'good fishing on the river', 'stronghold is near here', 'u like combat stuff?', 'classic rs area'],
    },
    {
        name: 'Champions Guild',
        x: 3191, z: 3366, radius: 6,
        waypoints: [
            [3230, 3404],  // south road from east Varrock
            [3207, 3393],  // main south gate approach (west of locked door at 3216,3381)
            [3195, 3378],  // outside south wall, clear of the locked door
        ],
        approachPhrases: ['come see the champions guild', 'follow me south', 'just down here, follow', 'cool building south of varrock'],
        arrivalPhrases:  ['champions guild!', 'u gotta do dragon slayer to get in', 'cool spot'],
        idlePhrases:     ['u done dragon slayer?', 'need 32 qp to enter', 'fancy looking building', 'good goal to work toward', 'classic rs milestone'],
    },

    // ── Draynor area ─────────────────────────────────────────────────────────
    {
        name: 'Draynor Willows',
        x: 3086, z: 3236, radius: 5,
        waypoints: [],
        approachPhrases: ['come see the willows', 'follow me south', 'good wc spot down here', 'willows are just south'],
        arrivalPhrases:  ['the willows!', 'good woodcutting spot', 'people train here a lot'],
        idlePhrases:     ['u train woodcutting?', 'willows are solid xp', 'nice and peaceful here', 'good spot to afk', 'the river is right there'],
    },
    {
        name: 'Draynor Market',
        x: 3079, z: 3254, radius: 5,
        waypoints: [],
        approachPhrases: ['come see the market', 'follow me', 'market area, this way', 'just over here'],
        arrivalPhrases:  ['draynor market!', 'small but cosy', 'love draynor tbh'],
        idlePhrases:     ['quiet little town', 'got everything u need here', 'friendly vibe', 'u been to draynor before?', 'nice area'],
    },
    {
        name: 'Port Sarim',
        x: 3028, z: 3220, radius: 8,
        waypoints: [
            [3063, 3233],  // road south-west out of Draynor
            [3042, 3222],  // road to Port Sarim
        ],
        approachPhrases: ['ever been to port sarim?', 'follow me to the docks', 'port sarim is just west', 'ships are just down here'],
        arrivalPhrases:  ['port sarim!', 'u can get a boat from here', 'love the docks area'],
        idlePhrases:     ['u can sail to karamja from here', 'fishing is good near the docks', 'pirates lol', 'nice view of the sea', 'u done pirates quest?'],
    },

    // ── Falador area ─────────────────────────────────────────────────────────
    {
        name: 'Falador Park',
        x: 2993, z: 3373, radius: 6,
        waypoints: [
            [3033, 3390],  // east Falador road
            [3012, 3377],  // approaching park
        ],
        approachPhrases: ['come see falador park', 'follow me to the park', 'this way, falador!', 'falador park is just here'],
        arrivalPhrases:  ['falador park!', 'nice open area right', 'love it here'],
        idlePhrases:     ['white knights castle is nearby', 'one of the bigger cities', 'u done falador quest?', 'clean city vibes', 'good place to chill'],
    },
    {
        name: 'Falador East Bank',
        x: 3013, z: 3356, radius: 5,
        waypoints: [
            [3033, 3390],  // road from east
            [3020, 3370],  // road south
        ],
        approachPhrases: ['follow me to falador bank', 'falador bank is just here', 'come this way', 'heading to the bank'],
        arrivalPhrases:  ['falador east bank!', 'handy bank', 'solid spot'],
        idlePhrases:     ['decent bank location', 'mining guild is nearby', 'u mine at all?', 'good central bank', 'falador is underrated tbh'],
    },
];

// ── Scan areas ────────────────────────────────────────────────────────────────

const SCAN_AREAS: [number, number][] = [
    [Locations.VARROCK_WEST_BANK[0], Locations.VARROCK_WEST_BANK[1]],
    [Locations.DRAYNOR_BANK[0],      Locations.DRAYNOR_BANK[1]],
    [Locations.VARROCK_EAST_BANK[0], Locations.VARROCK_EAST_BANK[1]],
];

// ── Phrase banks ──────────────────────────────────────────────────────────────

const GREET_PHRASES    = ['hey', 'hi', 'yo', 'hiya', 'sup', 'ello', 'heya', 'wagwan'];
const CHAT_LINES       = ['nice to meet u!', 'how long u been playing?', 'ur levels look decent', 'what quest r u doing?', 'this game is addictive ngl'];
const FOLLOW_PROMPTS   = ['follow me ill show u something cool', 'wanna see a good spot? follow me!', 'come with me, I know somewhere', 'follow me real quick', "let's go exploring, follow!"];
const WAIT_PHRASES     = ['u coming?', 'this way!', 'come on lol', 'follow follow', "u lost? I'm over here", 'catch up!'];
const MOVING_LINES     = ['almost there', 'not far now', 'just up here', 'good spot ahead', "u'll like this place", 'nearly there'];
const FAREWELL_PHRASES = ['nice chatting! gl with ur gains', 'cya around!', 'gotta go, laters!', 'good luck on ur adventures', 'see u round!'];
const REWARD_PHRASES   = ['here, take this for following me :)', 'a lil reward for the walk!', 'cheers for coming, enjoy!', 'small tip for the tour lol'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function chebyshev(ax: number, az: number, bx: number, bz: number): number {
    return Math.max(Math.abs(ax - bx), Math.abs(az - bz));
}

function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)]!;
}

function findNearbyRealPlayer(bot: Player, radius: number): Player | null {
    let best: Player | null = null;
    let bestDist = radius + 1;
    for (const p of (World as any).playerLoop.all() as Iterable<Player>) {
        if (p === bot) continue;
        if ((p as any).is_bot) continue;
        if (p.level !== bot.level) continue;
        const d = chebyshev(bot.x, bot.z, p.x, p.z);
        if (d <= radius && d < bestDist) { best = p; bestDist = d; }
    }
    return best;
}

// ── Task ──────────────────────────────────────────────────────────────────────

export class SocialTask extends BotTask {
    private state: 'scan' | 'approach' | 'chat' | 'lead' | 'arrived' | 'reward' | 'move_area' = 'scan';

    private target:      Player | null = null;
    private destination: Destination | null = null;

    private areaIndex = 0;
    private scanFail  = 0;
    private chatPhase = 0;

    // Lead state
    private waypointIndex       = 0;
    private leadTicks           = 0;
    private leadCommentTick     = 0;
    private missedFollowChecks  = 0;

    // Smart pathfinding — stuck detection
    private leadLastX    = 0;
    private leadLastZ    = 0;
    private leadStuckTick = 0;

    // Arrived / reward state
    private arrivedTicks    = 0;
    private idleCommentTick = 0;
    private rewardGiven     = false;
    private rewardStage     = 0;
    private rewardCoins     = 0;

    private readonly stuck = new StuckDetector(12, 3, 1);

    constructor() { super('Social'); }

    shouldRun(_player: Player): boolean { return true; }

    tick(player: Player): void {
        if (this.interrupted) return;
        if (this.cooldown > 0) { this.cooldown--; return; }

        switch (this.state) {
            case 'scan':      return this.handleScan(player);
            case 'approach':  return this.handleApproach(player);
            case 'chat':      return this.handleChat(player);
            case 'lead':      return this.handleLead(player);
            case 'arrived':   return this.handleArrived(player);
            case 'reward':    return this.handleReward(player);
            case 'move_area': return this.handleMoveArea(player);
        }
    }

    isComplete(): boolean { return false; }

    override reset(): void {
        super.reset();
        this._resetTarget();
        this.areaIndex = 0;
        this.scanFail  = 0;
    }

    // ── States ────────────────────────────────────────────────────────────────

    private handleScan(player: Player): void {
        const [ax, az] = SCAN_AREAS[this.areaIndex]!;

        if (!isNear(player, ax, az, 12)) {
            if (Math.abs(player.x - ax) > 60 || Math.abs(player.z - az) > 60) {
                teleportNear(player, ax, az);
            } else {
                this._stuckWalk(player, ax + randInt(-5, 5), az + randInt(-5, 5));
            }
            this.cooldown = 2;
            return;
        }

        if (Math.random() < 0.3) {
            walkTo(player, ax + randInt(-8, 8), az + randInt(-6, 6));
        }

        const found = findNearbyRealPlayer(player, SCAN_RADIUS);
        if (found) {
            this.target    = found;
            this.chatPhase = 0;
            this.scanFail  = 0;
            this.state     = 'approach';
            return;
        }

        this.scanFail++;
        if (this.scanFail >= 6) { this.scanFail = 0; this.state = 'move_area'; }
        this.cooldown = randInt(6, 12);
    }

    private handleApproach(player: Player): void {
        const t = this.target;
        if (!t || (t as any).is_bot) { this._resetTarget(); return; }
        if (chebyshev(player.x, player.z, t.x, t.z) > 45) { this._resetTarget(); return; }

        if (!isNear(player, t.x, t.z, 2)) {
            this._stuckWalk(player, t.x + randInt(-1, 1), t.z + randInt(-1, 1));
            this.cooldown = 1;
            return;
        }

        const greet = pickRandom(GREET_PHRASES);
        player.say(Math.random() < 0.5 ? `${greet} ${t.displayName}!` : greet);
        this.state     = 'chat';
        this.chatPhase = 0;
        this.cooldown  = randInt(5, 9);
    }

    private handleChat(player: Player): void {
        const t = this.target;
        if (!t || chebyshev(player.x, player.z, t.x, t.z) > 25) { this._resetTarget(); return; }

        if (!isNear(player, t.x, t.z, 3)) {
            walkTo(player, t.x + randInt(-1, 1), t.z + randInt(-1, 1));
        }

        this.chatPhase++;
        if (this.chatPhase <= 2) {
            player.say(pickRandom(CHAT_LINES));
            this.cooldown = randInt(8, 16);
            return;
        }

        // Pick a destination that's actually near the bot's current position.
        this.destination     = this._pickNearbyDest(player);
        this.waypointIndex   = 0;
        this.leadTicks       = 0;
        this.leadCommentTick = 0;
        this.missedFollowChecks = 0;
        this.leadLastX = player.x;
        this.leadLastZ = player.z;
        this.leadStuckTick = 0;

        player.say(pickRandom(FOLLOW_PROMPTS));
        this.state    = 'lead';
        this.cooldown = randInt(5, 8);
    }

    /**
     * Lead state — walks toward the destination using road waypoints.
     *
     * Movement uses _leadWalk which:
     *   1. Walks in 5-tile steps normally.
     *   2. Tries a perpendicular detour when stuck (go around the wall).
     *   3. Tries the opposite perpendicular if still stuck.
     *   4. Takes a small 6-tile hop as a last resort (tiny, not to the destination).
     *
     * The bot only advances past each waypoint when it has physically walked there.
     * It pauses and calls out if the player isn't keeping up.
     */
    private handleLead(player: Player): void {
        const t    = this.target;
        const dest = this.destination;
        if (!t || !dest) { this._resetTarget(); return; }

        if (chebyshev(player.x, player.z, t.x, t.z) > 100) {
            player.say(pickRandom(FAREWELL_PHRASES));
            this._resetTarget();
            return;
        }

        this.leadTicks++;

        // Arrived at destination.
        if (isNear(player, dest.x, dest.z, dest.radius)) {
            player.say(pickRandom(dest.arrivalPhrases));
            this.arrivedTicks    = 0;
            this.idleCommentTick = 0;
            this.state    = 'arrived';
            this.cooldown = randInt(4, 8);
            return;
        }

        // Current nav target: next waypoint or final dest.
        const waypoints = dest.waypoints;
        let navX = dest.x;
        let navZ = dest.z;

        while (this.waypointIndex < waypoints.length) {
            const [wx, wz] = waypoints[this.waypointIndex]!;
            if (chebyshev(player.x, player.z, wx, wz) <= 5) {
                this.waypointIndex++;
            } else {
                navX = wx;
                navZ = wz;
                break;
            }
        }

        // Follower check every 10 ticks.
        const playerDist      = chebyshev(player.x, player.z, t.x, t.z);
        const playerFollowing = playerDist <= FOLLOW_RADIUS;

        if (this.leadTicks % 10 === 0) {
            if (!playerFollowing) {
                this.missedFollowChecks++;
                if (this.missedFollowChecks >= MISS_LIMIT) {
                    player.say(pickRandom(FAREWELL_PHRASES));
                    this._resetTarget();
                    return;
                }
                player.say(pickRandom(WAIT_PHRASES));
            } else {
                this.missedFollowChecks = Math.max(0, this.missedFollowChecks - 1);
            }
        }

        // Periodic moving commentary.
        this.leadCommentTick++;
        if (this.leadCommentTick >= randInt(22, 35)) {
            if (playerFollowing && Math.random() < 0.6) {
                player.say(pickRandom(dest.approachPhrases.concat(MOVING_LINES)));
            }
            this.leadCommentTick = 0;
        }

        // Pause and wait if player has fallen behind.
        if (!playerFollowing && this.missedFollowChecks >= 2) {
            this.cooldown = 3;
            return;
        }

        // Walk toward nav target with smart stuck handling.
        this._leadWalk(player, navX, navZ);
        this.cooldown = 1;
    }

    private handleArrived(player: Player): void {
        const dest = this.destination;
        if (!dest) { this._resetTarget(); return; }

        this.arrivedTicks++;

        const t            = this.target;
        const playerNearby = t && chebyshev(player.x, player.z, t.x, t.z) <= 20;

        // Give coin reward via trade once when player is nearby.
        if (playerNearby && t && !this.rewardGiven) {
            this.rewardGiven = true;
            this.rewardStage = 0;
            player.say(pickRandom(REWARD_PHRASES));
            this.state    = 'reward';
            this.cooldown = randInt(3, 5);
            return;
        }

        if (Math.random() < 0.35) {
            const r = dest.radius + 3;
            walkTo(player, dest.x + randInt(-r, r), dest.z + randInt(-r, r));
        }

        this.idleCommentTick++;
        if (this.idleCommentTick >= randInt(14, 22) && playerNearby) {
            player.say(pickRandom(dest.idlePhrases));
            this.idleCommentTick = 0;
        }

        if (this.arrivedTicks >= ARRIVE_LINGER) {
            if (playerNearby && t) player.say(pickRandom(FAREWELL_PHRASES));
            this._resetTarget();
            return;
        }

        this.cooldown = randInt(8, 14);
    }

    private handleReward(player: Player): void {
        const t = this.target;
        if (!t || chebyshev(player.x, player.z, t.x, t.z) > 25) {
            this._clearTrade(player);
            this.state = 'arrived';
            return;
        }

        switch (this.rewardStage) {
            case 0: {
                this.rewardCoins = randInt(500, 1000);
                addItem(player, Items.COINS, this.rewardCoins);
                interactPlayerOp(player, t.slot, 4);
                player.botTradeTargetPid   = t.uid;
                player.botTradeTargetStage = 0;
                this.rewardStage = 1;
                this.cooldown    = randInt(3, 5);
                break;
            }
            case 1: {
                const inv = player.getInventory(InvType.INV);
                if (inv) {
                    for (let slot = 0; slot < inv.capacity; slot++) {
                        const item = inv.get(slot);
                        if (item && item.id === Items.COINS) {
                            interactIF_UseOp(player, Interfaces.TRADE_SIDE_INV, Items.COINS, slot, 4, 90);
                            break;
                        }
                    }
                }
                this.rewardStage = 2;
                this.cooldown    = randInt(3, 5);
                break;
            }
            case 2: {
                interactIfButton(player, 3546);
                this.rewardStage = 3;
                this.cooldown    = randInt(2, 4);
                break;
            }
            case 3: {
                interactIfButton(player, 3546);
                this._clearTrade(player);
                this.rewardStage = 0;
                this.state       = 'arrived';
                this.cooldown    = randInt(5, 10);
                break;
            }
        }
    }

    private handleMoveArea(player: Player): void {
        this.areaIndex = (this.areaIndex + 1) % SCAN_AREAS.length;
        const [tx, tz] = SCAN_AREAS[this.areaIndex]!;
        if (Math.abs(player.x - tx) > 70 || Math.abs(player.z - tz) > 70) {
            teleportNear(player, tx, tz);
        } else {
            walkTo(player, tx + randInt(-6, 6), tz + randInt(-4, 4));
        }
        this.state    = 'scan';
        this.cooldown = randInt(8, 16);
    }

    // ── Pathfinding ───────────────────────────────────────────────────────────

    /**
     * Smart walker used during the lead phase.
     *
     * Phase 1 (not stuck): direct 5-tile step toward target.
     * Phase 2 (stuck 5+ ticks): perpendicular left — route around the wall.
     * Phase 3 (stuck 13+ ticks): perpendicular right — try the other side.
     * Phase 4 (stuck 22+ ticks): tiny 6-tile hop in the travel direction — last resort.
     *
     * The hop is small enough (6 tiles forward) that it's barely noticeable and
     * only triggers after the bot has genuinely tried both sides of an obstacle.
     */
    private _leadWalk(player: Player, tx: number, tz: number): void {
        // Detect if the bot hasn't moved since the last tick.
        if (player.x === this.leadLastX && player.z === this.leadLastZ) {
            this.leadStuckTick++;
        } else {
            this.leadStuckTick = 0;
        }
        this.leadLastX = player.x;
        this.leadLastZ = player.z;

        const dx = tx - player.x;
        const dz = tz - player.z;
        // Normalised direction signs for perpendicular calculation.
        const sx = Math.sign(dx) || 1;
        const sz = Math.sign(dz) || 1;

        if (this.leadStuckTick < STUCK_PERP_TICK) {
            // Normal: step directly toward target.
            let stepX = player.x + sx * Math.min(Math.abs(dx), LEAD_STEP);
            let stepZ = player.z + sz * Math.min(Math.abs(dz), LEAD_STEP);
            // If that step lands near a blocked zone, deflect perpendicular instead.
            if (BLOCKED_ZONES.some(([bx, bz, r]) => chebyshev(stepX, stepZ, bx, bz) <= r)) {
                stepX = player.x + (-sz) * LEAD_STEP;
                stepZ = player.z + sx  * LEAD_STEP;
            }
            walkTo(player, stepX, stepZ);

        } else if (this.leadStuckTick < STUCK_PERP2_TICK) {
            // Stuck: try perpendicular left to route around the obstacle.
            // Perpendicular left of (dx, dz) = (-dz, dx).
            walkTo(player, player.x + (-sz) * LEAD_STEP, player.z + sx * LEAD_STEP);

        } else if (this.leadStuckTick < STUCK_HOP_TICK) {
            // Still stuck: try perpendicular right = (dz, -dx).
            walkTo(player, player.x + sz * LEAD_STEP, player.z + (-sx) * LEAD_STEP);

        } else {
            // Desperately stuck: tiny hop forward — not to dest, just past the wall.
            teleportNear(player, player.x + sx * 6, player.z + sz * 6);
            this.leadStuckTick = 0;
        }
    }

    // ── General helpers ───────────────────────────────────────────────────────

    /**
     * Pick a destination that is within walking distance of the bot's current
     * position. This prevents the bot from trying to lead a player from Draynor
     * to Varrock (or similar cross-map trips that cause pathfinding failures).
     */
    private _pickNearbyDest(player: Player): Destination {
        const nearby = DESTINATIONS.filter(d => {
            const dist = chebyshev(player.x, player.z, d.x, d.z);
            return dist >= DEST_MIN_DIST && dist <= DEST_MAX_DIST;
        });
        return pickRandom(nearby.length >= 1 ? nearby : DESTINATIONS);
    }

    private _resetTarget(): void {
        if (this.target) this._clearTrade(null);
        this.target      = null;
        this.destination = null;
        this.chatPhase          = 0;
        this.waypointIndex      = 0;
        this.leadTicks          = 0;
        this.leadCommentTick    = 0;
        this.missedFollowChecks = 0;
        this.leadLastX          = 0;
        this.leadLastZ          = 0;
        this.leadStuckTick      = 0;
        this.arrivedTicks       = 0;
        this.idleCommentTick    = 0;
        this.rewardGiven        = false;
        this.rewardStage        = 0;
        this.rewardCoins        = 0;
        this.stuck.reset();
        this.state    = 'scan';
        this.cooldown = randInt(5, 10);
    }

    private _clearTrade(player: Player | null): void {
        if (!player) return;
        player.botTradeTargetPid   = -1;
        player.botTradeTargetStage = -1;
    }

    private _stuckWalk(player: Player, tx: number, tz: number): void {
        if (!this.stuck.check(player, tx, tz)) { walkTo(player, tx, tz); return; }
        if (this.stuck.desperatelyStuck) { teleportNear(player, tx, tz); this.stuck.reset(); return; }
        walkTo(player, player.x + randInt(-6, 6), player.z + randInt(-6, 6));
    }
}
