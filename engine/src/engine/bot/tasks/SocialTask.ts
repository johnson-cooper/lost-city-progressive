/**
 * SocialTask.ts
 *
 * "Extras" personality — social bot.
 * Approaches real players, chats, then leads them on a short walking tour.
 *
 * Pathfinding strategy:
 *  - Scan areas use safe OUTDOOR spawn coords — never inside buildings.
 *  - Wander during scan uses pre-defined outdoor waypoints, not random offsets.
 *  - Floor-level 0 is enforced every tick — if the bot ends up upstairs it is
 *    immediately teleported back to the safe spawn and the sequence resets.
 *  - Lead walking uses 5-tile steps. Stuck phases escalate quickly:
 *      phase 1 (0-3 ticks)  — direct step toward target
 *      phase 2 (4-9 ticks)  — perpendicular left detour
 *      phase 3 (10-16 ticks) — perpendicular right detour
 *      phase 4 (17+ ticks)  — small 6-tile forward hop (teleport), then reset
 *  - BLOCKED_ZONES prevents steps toward known permanently impassable tiles.
 *  - Destinations are filtered to within [15, 120] tiles of the bot so it
 *    never tries to cross the map.
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

const SCAN_RADIUS      = 20;
const FOLLOW_RADIUS    = 14;    // tiles — "player is keeping up"
const DEST_MIN_DIST    = 15;    // don't pick a destination closer than this
const DEST_MAX_DIST    = 120;   // don't pick a destination further than this
const LEAD_STEP        = 5;     // tiles per step when walking
const STUCK_PERP_TICK  = 4;     // ticks before trying perpendicular detour
const STUCK_PERP2_TICK = 10;    // ticks before trying opposite perpendicular
const STUCK_HOP_TICK   = 17;    // ticks before tiny teleport hop forward
const ARRIVE_LINGER    = 120;   // ticks to hang around after arriving
const MISS_LIMIT       = 4;     // consecutive missed follow-checks before giving up

// Tiles the bot must never step toward — permanently locked doors, bank interiors, etc.
// Each entry is [centerX, centerZ, avoidRadius].
const BLOCKED_ZONES: [number, number, number][] = [
    [3216, 3381, 4],   // south Varrock permanently locked door
    [3186, 3446, 3],   // Varrock West Bank teller zone (behind counter)
];

// ── Scan areas ────────────────────────────────────────────────────────────────
// x/z    — scan-center used for isNear proximity check only
// spawnX/Z — guaranteed safe OUTDOOR position used for all teleportation
// wanderPoints — pre-defined outdoor spots the bot cycles through when idle;
//                NEVER uses random offsets from bank interior coords

interface ScanArea {
    x: number; z: number;
    spawnX: number; spawnZ: number;
    wanderPoints: [number, number][];
}

const SCAN_AREAS: ScanArea[] = [
    {
        // Varrock West Bank — bot stays on the road south of the building.
        // Bank interior is at z≈3444; road outside starts at z≈3434.
        x: 3185, z: 3444,
        spawnX: 3185, spawnZ: 3433,
        wanderPoints: [
            [3185, 3433], [3178, 3434], [3192, 3434],
            [3173, 3436], [3197, 3432], [3182, 3428], [3190, 3430],
        ],
    },
    {
        // Draynor Village Bank — road south of the bank.
        x: 3092, z: 3245,
        spawnX: 3092, spawnZ: 3240,
        wanderPoints: [
            [3092, 3240], [3087, 3242], [3097, 3241],
            [3085, 3237], [3100, 3238], [3090, 3234], [3095, 3244],
        ],
    },
    {
        // Varrock East Bank — road south of the building.
        x: 3253, z: 3420,
        spawnX: 3253, spawnZ: 3415,
        wanderPoints: [
            [3253, 3415], [3259, 3417], [3246, 3416],
            [3255, 3411], [3262, 3413], [3248, 3412], [3257, 3419],
        ],
    },
];

// ── Destinations ──────────────────────────────────────────────────────────────

interface Destination {
    name: string;
    x: number;
    z: number;
    radius: number;
    // Road waypoints the bot walks through in order before reaching the final coord.
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
        waypoints: [
            [3175, 3433],  // road west from Varrock West Bank
        ],
        approachPhrases: ['follow me to the GE!', 'lets check the marketplace', 'heading to GE, u coming?', 'marketplace is just up here'],
        arrivalPhrases:  ['here we are!', 'GE, always busy', 'love this spot'],
        idlePhrases:     ['u ever trade here?', 'prices are alright', 'busy place', 'what do u usually buy?', 'I come here loads'],
    },
    {
        name: 'Varrock Square',
        x: 3212, z: 3446, radius: 5,
        waypoints: [
            [3196, 3440],  // east along south road
        ],
        approachPhrases: ['come see varrock square', 'follow me to the fountain', 'this way!', 'varrock centre, follow'],
        arrivalPhrases:  ['the fountain!', 'classic varrock square', 'nice spot right'],
        idlePhrases:     ['people always hang here', 'varrock is my fave town', 'chill spot tbh', 'u been here before?', 'pretty central'],
    },
    {
        name: 'Varrock Palace',
        x: 3213, z: 3468, radius: 6,
        waypoints: [
            [3196, 3440],  // east road
            [3210, 3452],  // through the square, heading north
        ],
        approachPhrases: ['wanna see the palace?', 'follow me north', 'come check the palace out', 'just up here, follow'],
        arrivalPhrases:  ['the palace!', 'pretty big right', 'guards everywhere lol'],
        idlePhrases:     ['wonder what the king gets up to', 'big fancy building lol', 'lots of guards', 'u done the varrock quest?', 'impressive building'],
    },
    {
        name: 'Barbarian Village',
        x: 3082, z: 3422, radius: 6,
        waypoints: [
            [3155, 3433],  // west road out of Varrock
            [3120, 3433],  // continuing west
            [3100, 3425],  // approaching barb village
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
            [3195, 3378],  // outside south wall, clear of locked door
        ],
        approachPhrases: ['come see the champions guild', 'follow me south', 'just down here, follow', 'cool building south of varrock'],
        arrivalPhrases:  ['champions guild!', 'u gotta do dragon slayer to get in', 'cool spot'],
        idlePhrases:     ['u done dragon slayer?', 'need 32 qp to enter', 'fancy looking building', 'good goal to work toward', 'classic rs milestone'],
    },
    {
        name: 'Varrock Smithy',
        x: 3188, z: 3426, radius: 5,
        waypoints: [
            [3192, 3433],  // east from West Bank, south side of road
        ],
        approachPhrases: ['come see the smithy', 'follow me east', 'smithy is just here', 'good spot for smithing'],
        arrivalPhrases:  ['the smithy!', 'loads of anvils here', 'good spot to train smithing'],
        idlePhrases:     ['u train smithing?', 'need a lot of ore for this', 'good xp if u got the bars', 'classic training spot', 'u use the ge for bars?'],
    },

    // ── Draynor / south area ──────────────────────────────────────────────────
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
        name: 'Lumbridge Road',
        x: 3148, z: 3271, radius: 7,
        waypoints: [
            [3105, 3259],  // road north-east out of Draynor
            [3130, 3266],  // road toward Lumbridge
        ],
        approachPhrases: ['come this way toward lumbridge', 'follow me up the road', 'good walk east', 'road to lumbridge, this way'],
        arrivalPhrases:  ['nice road this', 'halfway to lumbridge', 'peaceful walk eh'],
        idlePhrases:     ['lumbridge is not far from here', 'good road to know', 'cows just east of here', 'u been to lumbridge much?', 'classic starter area nearby'],
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
            [3020, 3370],  // road south into falador
        ],
        approachPhrases: ['follow me to falador bank', 'falador bank is just here', 'come this way', 'heading to the bank'],
        arrivalPhrases:  ['falador east bank!', 'handy bank', 'solid spot'],
        idlePhrases:     ['decent bank location', 'mining guild is nearby', 'u mine at all?', 'good central bank', 'falador is underrated tbh'],
    },
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
    private wanderIdx = 0;    // cycles through scan-area outdoor wander points

    // Lead state
    private waypointIndex       = 0;
    private leadTicks           = 0;
    private leadCommentTick     = 0;
    private missedFollowChecks  = 0;

    // Smart pathfinding — position-change stuck detection
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

        // ── Floor-level guard ─────────────────────────────────────────────────
        // Social bots always operate at ground level (level 0).
        // If the bot somehow ends up upstairs or inside a restricted area on a
        // different floor, teleport it back to the current scan area's safe
        // outdoor spawn immediately.
        if (player.level !== 0) {
            const area = SCAN_AREAS[this.areaIndex]!;
            teleportNear(player, area.spawnX, area.spawnZ);
            this._resetTarget();   // also sets state = 'scan'
            this.cooldown = 3;
            return;
        }

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
        this.wanderIdx = 0;
    }

    // ── States ────────────────────────────────────────────────────────────────

    private handleScan(player: Player): void {
        const area = SCAN_AREAS[this.areaIndex]!;

        // Navigate to this area if not already nearby.
        // Use the safe spawn coord — never the bank interior center.
        if (!isNear(player, area.x, area.z, 14)) {
            if (Math.abs(player.x - area.spawnX) > 60 || Math.abs(player.z - area.spawnZ) > 60) {
                teleportNear(player, area.spawnX, area.spawnZ);
            } else {
                this._stuckWalk(player, area.spawnX, area.spawnZ);
            }
            this.cooldown = 2;
            return;
        }

        // Idle wander: cycle through pre-defined outdoor waypoints so the bot
        // never randomly walks into a building or behind a bank counter.
        if (Math.random() < 0.3) {
            const wp = area.wanderPoints[this.wanderIdx % area.wanderPoints.length]!;
            this.wanderIdx++;
            walkTo(player, wp[0], wp[1]);
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

        // Pick a destination near the bot's current position.
        this.destination        = this._pickNearbyDest(player);
        this.waypointIndex      = 0;
        this.leadTicks          = 0;
        this.leadCommentTick    = 0;
        this.missedFollowChecks = 0;
        this.leadLastX          = player.x;
        this.leadLastZ          = player.z;
        this.leadStuckTick      = 0;

        player.say(pickRandom(FOLLOW_PROMPTS));
        this.state    = 'lead';
        this.cooldown = randInt(5, 8);
    }

    /**
     * Lead state — walks toward destination via road waypoints.
     *
     * Navigation:
     *  - Each waypoint must be physically reached (within 5 tiles) before
     *    advancing to the next. leadStuckTick resets when advancing.
     *  - Movement is delegated to _leadWalk which handles obstacles.
     *  - Pauses and calls out when the player falls behind.
     *  - Gives up and says farewell if player disappears for MISS_LIMIT checks.
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

        // Arrived at destination?
        if (isNear(player, dest.x, dest.z, dest.radius)) {
            player.say(pickRandom(dest.arrivalPhrases));
            this.arrivedTicks    = 0;
            this.idleCommentTick = 0;
            this.state    = 'arrived';
            this.cooldown = randInt(4, 8);
            return;
        }

        // Determine current navigation target: next waypoint or final dest.
        const waypoints = dest.waypoints;
        let navX = dest.x;
        let navZ = dest.z;

        while (this.waypointIndex < waypoints.length) {
            const [wx, wz] = waypoints[this.waypointIndex]!;
            if (chebyshev(player.x, player.z, wx, wz) <= 5) {
                // Reached this waypoint — advance and reset stuck counter so
                // the new leg starts with a clean slate.
                this.waypointIndex++;
                this.leadStuckTick = 0;
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

        // Pause and wait if the player has fallen behind.
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

        // Trigger coin-reward trade once when player is nearby.
        if (playerNearby && t && !this.rewardGiven) {
            this.rewardGiven = true;
            this.rewardStage = 0;
            player.say(pickRandom(REWARD_PHRASES));
            this.state    = 'reward';
            this.cooldown = randInt(3, 5);
            return;
        }

        // Idle wander within the destination radius.
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
        const area = SCAN_AREAS[this.areaIndex]!;
        // Always teleport/walk to the safe outdoor spawn, not the scan center.
        if (Math.abs(player.x - area.spawnX) > 70 || Math.abs(player.z - area.spawnZ) > 70) {
            teleportNear(player, area.spawnX, area.spawnZ);
        } else {
            this._stuckWalk(player, area.spawnX, area.spawnZ);
        }
        this.state    = 'scan';
        this.cooldown = randInt(8, 16);
    }

    // ── Pathfinding ───────────────────────────────────────────────────────────

    /**
     * Smart walker used during the lead phase.
     *
     * Uses the bot's actual position change each tick to detect being stuck,
     * then escalates through four phases:
     *
     *   Phase 1 (0–3 ticks)   direct 5-tile step toward the nav target.
     *                          If the step would land in a BLOCKED_ZONE, deflect
     *                          perpendicular-left instead.
     *   Phase 2 (4–9 ticks)   perpendicular-left detour — route around the wall.
     *   Phase 3 (10–16 ticks) perpendicular-right detour — try the other side.
     *   Phase 4 (17+ ticks)   tiny 6-tile teleport hop in the travel direction,
     *                          then reset the stuck counter to phase 1.
     *
     * The stuck counter is also reset whenever the bot advances to the next
     * waypoint (handled in handleLead).
     */
    private _leadWalk(player: Player, tx: number, tz: number): void {
        // Update stuck counter based on whether position changed since last call.
        if (player.x === this.leadLastX && player.z === this.leadLastZ) {
            this.leadStuckTick++;
        } else {
            this.leadStuckTick = 0;
        }
        this.leadLastX = player.x;
        this.leadLastZ = player.z;

        const dx = tx - player.x;
        const dz = tz - player.z;
        const sx = Math.sign(dx);   // -1, 0, or 1
        const sz = Math.sign(dz);   // -1, 0, or 1

        // If already at target nothing to do.
        if (sx === 0 && sz === 0) return;

        if (this.leadStuckTick < STUCK_PERP_TICK) {
            // Phase 1: step directly toward the target.
            let stepX = player.x + (sx !== 0 ? sx * Math.min(Math.abs(dx), LEAD_STEP) : 0);
            let stepZ = player.z + (sz !== 0 ? sz * Math.min(Math.abs(dz), LEAD_STEP) : 0);

            // If that step would land near a known blocked zone, deflect left.
            if (BLOCKED_ZONES.some(([bx, bz, r]) => chebyshev(stepX, stepZ, bx, bz) <= r)) {
                const psx = sx !== 0 ? sx : 1;
                const psz = sz !== 0 ? sz : 1;
                stepX = player.x + (-psz) * LEAD_STEP;
                stepZ = player.z + psx  * LEAD_STEP;
            }
            walkTo(player, stepX, stepZ);

        } else if (this.leadStuckTick < STUCK_PERP2_TICK) {
            // Phase 2: perpendicular-left = (-sz, sx).
            const psx = sx !== 0 ? sx : 1;
            const psz = sz !== 0 ? sz : 1;
            walkTo(player, player.x + (-psz) * LEAD_STEP, player.z + psx * LEAD_STEP);

        } else if (this.leadStuckTick < STUCK_HOP_TICK) {
            // Phase 3: perpendicular-right = (sz, -sx).
            const psx = sx !== 0 ? sx : 1;
            const psz = sz !== 0 ? sz : 1;
            walkTo(player, player.x + psz * LEAD_STEP, player.z + (-psx) * LEAD_STEP);

        } else {
            // Phase 4: small forward hop — just enough to get past the wall.
            const psx = sx !== 0 ? sx : 1;
            const psz = sz !== 0 ? sz : 1;
            teleportNear(player, player.x + psx * 6, player.z + psz * 6);
            this.leadStuckTick = 0;
        }
    }

    // ── General helpers ───────────────────────────────────────────────────────

    /**
     * Pick a destination within walking distance of the bot's current position.
     * Prevents cross-map trips that guarantee pathfinding failures.
     */
    private _pickNearbyDest(player: Player): Destination {
        const nearby = DESTINATIONS.filter(d => {
            const dist = chebyshev(player.x, player.z, d.x, d.z);
            return dist >= DEST_MIN_DIST && dist <= DEST_MAX_DIST;
        });
        return pickRandom(nearby.length >= 1 ? nearby : DESTINATIONS);
    }

    private _resetTarget(): void {
        if (this.target) this._clearTrade(this.target);
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
