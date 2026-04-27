/**
 * SocialTask.ts
 *
 * "Extras" personality — social bot.
 * Finds real (non-bot) players, approaches them, chats, then leads them on a
 * walking tour of a nearby landmark. Actively moves throughout the interaction
 * to make the world feel populated and lively.
 */

import {
    BotTask,
    Player,
    walkTo,
    isNear,
    randInt,
    StuckDetector,
    teleportNear,
    Locations,
} from '#/engine/bot/tasks/BotTaskBase.js';
import World from '#/engine/World.js';

const SCAN_RADIUS = 20;
const FOLLOW_RADIUS = 14;       // player is "following" if within this many tiles
const WAIT_FOLLOW_TICKS = 40;   // how long to wait for a slow follower before giving up
const ARRIVE_LINGER_TICKS = 120;// how long to hang out at the destination

interface Destination {
    name: string;
    x: number;
    z: number;
    radius: number;
    approachPhrases: string[];
    arrivalPhrases: string[];
    idlePhrases: string[];
}

const DESTINATIONS: Destination[] = [
    {
        name: 'Grand Exchange',
        x: 3181, z: 3429, radius: 6,
        approachPhrases: [
            'follow me to the marketplace!',
            'lets check the marketplace',
            'heading to marketplace, u coming?',
            'marketplace is just up here, follow me',
        ],
        arrivalPhrases: [
            'here we are lol',
            'marketplace always has ppl trading',
            'love this spot',
        ],
        idlePhrases: [
            'u ever buy anything here?',
            'prices are decent rn',
            'I come here all the time',
            'busy spot',
            'what do u usually buy?',
        ],
    },
    {
        name: 'Varrock fountain',
        x: 3212, z: 3446, radius: 4,
        approachPhrases: [
            'come see the centre of varrock',
            'follow me to varrock square',
            'let me show u the fountain',
            'this way!',
        ],
        arrivalPhrases: [
            'the fountain!',
            'classic varrock square',
            'nice spot right',
        ],
        idlePhrases: [
            'people always hang around here',
            'varrock is one of my fave towns',
            'chill spot tbh',
            'u been to varrock much?',
            'pretty central location',
        ],
    },
    {
        name: 'Draynor bank',
        x: 3092, z: 3245, radius: 5,
        approachPhrases: [
            'lets go draynor',
            'follow me to draynor bank',
            'draynor is just down here come',
            'quick trip to draynor',
        ],
        arrivalPhrases: [
            'draynor bank!',
            'good place to chill',
            'love this bank actually',
        ],
        idlePhrases: [
            'quiet town usually',
            'good fishing spot nearby',
            'u train wc around here?',
            'the willows by the river are good',
            'draynor manor is creepy lol',
        ],
    },
    {
        name: 'Barbarian Village',
        x: 3082, z: 3420, radius: 6,
        approachPhrases: [
            'ever been to barbarian village?',
            'come to barb village with me',
            'follow me, I wanna show u something',
            'this way, barb village!',
        ],
        arrivalPhrases: [
            'barbarian village lol',
            'bit sketchy but cool right',
            'love this area',
        ],
        idlePhrases: [
            'barbarians everywhere lol',
            'decent fishing along the river here',
            'u like combat?',
            'wild spot',
            'the stronghold is near here too',
        ],
    },
    {
        name: 'Falador park',
        x: 2993, z: 3373, radius: 6,
        approachPhrases: [
            'lets go falador!',
            'follow me to falador park',
            'heading to falador, come with',
            'I love falador, follow me',
        ],
        arrivalPhrases: [
            'falador park!',
            'nice open area right',
            'falador is underrated tbh',
        ],
        idlePhrases: [
            'the banks here are good',
            'white knights castle is nearby',
            'falador is one of the bigger cities',
            'u done the quest here?',
            'clean city vibes lol',
        ],
    },
    {
        name: 'Lumbridge',
        x: 3222, z: 3218, radius: 6,
        approachPhrases: [
            'lets go lumbridge!',
            'follow me to lumbridge',
            'lumbridge is classic, come',
            'heading south, follow me!',
        ],
        arrivalPhrases: [
            'lumbridge! the starting town',
            'classic rs vibes here',
            'castle looks cool right',
        ],
        idlePhrases: [
            'everyone starts here lol',
            'the castle interior is sick',
            'river lum runs right through',
            'cooking range nearby is op',
            'nice place to show new players',
        ],
    },
];

const SCAN_AREAS: [number, number][] = [
    [Locations.VARROCK_WEST_BANK[0], Locations.VARROCK_WEST_BANK[1]],
    [Locations.DRAYNOR_BANK[0], Locations.DRAYNOR_BANK[1]],
    [Locations.VARROCK_EAST_BANK[0], Locations.VARROCK_EAST_BANK[1]],
];

const GREET_PHRASES = ['hey', 'hi', 'yo', 'hiya', 'sup', 'ello', 'heya', 'wagwan'];

const CHAT_BEFORE_LEAD = [
    'nice to meet u!',
    'how long u been playing?',
    'ur levels look decent',
    'what quest r u doing?',
    'this game is addictive ngl',
];

const FOLLOW_PROMPTS = [
    'follow me ill show u something cool',
    'wanna see something? follow me!',
    'come with me, I know a good spot',
    'follow me real quick',
    'I wanna show u around, follow!',
    'let\'s go exploring, follow me',
];

const WAIT_FOLLOW_PHRASES = [
    'u coming?',
    'this way!',
    'come on lol',
    'wait up? or catch up lol',
    'follow me!',
    'u lost? I\'m over here',
];

const MOVING_COMMENTARY = [
    'almost there',
    'not far now',
    'just up here',
    'follow follow',
    'good spot ahead',
    'u\'ll like this place',
    'nearly there lol',
];

const FAREWELL_PHRASES = [
    'nice chatting! gl with ur gains',
    'cya around!',
    'was fun, gotta go now lol',
    'laters!',
    'good luck on ur adventures',
    'see u round!',
];

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
        if (d <= radius && d < bestDist) {
            best = p;
            bestDist = d;
        }
    }
    return best;
}

export class SocialTask extends BotTask {
    private state: 'scan' | 'approach' | 'chat' | 'lead' | 'wait_follow' | 'arrived' | 'move_area' = 'scan';
    private target: Player | null = null;
    private destination: Destination | null = null;

    private areaIndex = 0;
    private scanFail = 0;

    private chatPhase = 0;
    private leadTicks = 0;
    private leadCommentTick = 0;
    private missedFollowChecks = 0;
    private waitFollowTicks = 0;
    private arrivedTicks = 0;
    private idleCommentTick = 0;

    private readonly stuck = new StuckDetector(20, 3, 1);

    constructor() {
        super('Social');
    }

    shouldRun(_player: Player): boolean {
        return true;
    }

    tick(player: Player): void {
        if (this.interrupted) return;

        if (this.cooldown > 0) {
            this.cooldown--;
            return;
        }

        switch (this.state) {
            case 'scan':         return this.handleScan(player);
            case 'approach':     return this.handleApproach(player);
            case 'chat':         return this.handleChat(player);
            case 'lead':         return this.handleLead(player);
            case 'wait_follow':  return this.handleWaitFollow(player);
            case 'arrived':      return this.handleArrived(player);
            case 'move_area':    return this.handleMoveArea(player);
        }
    }

    isComplete(): boolean {
        return false;
    }

    override reset(): void {
        super.reset();
        this.state = 'scan';
        this.target = null;
        this.destination = null;
        this.scanFail = 0;
        this.chatPhase = 0;
        this.leadTicks = 0;
        this.leadCommentTick = 0;
        this.missedFollowChecks = 0;
        this.waitFollowTicks = 0;
        this.arrivedTicks = 0;
        this.idleCommentTick = 0;
        this.stuck.reset();
    }

    // ── States ────────────────────────────────────────────────────────────────

    private handleScan(player: Player): void {
        // Wander around the scan area while looking.
        const [ax, az] = SCAN_AREAS[this.areaIndex]!;
        if (!isNear(player, ax, az, 12)) {
            walkTo(player, ax + randInt(-5, 5), az + randInt(-5, 5));
            this.cooldown = 2;
            return;
        }

        // Drift around the scan area.
        if (Math.random() < 0.3) {
            walkTo(player, ax + randInt(-8, 8), az + randInt(-6, 6));
        }

        const found = findNearbyRealPlayer(player, SCAN_RADIUS);
        if (found) {
            this.target = found;
            this.chatPhase = 0;
            this.scanFail = 0;
            this.state = 'approach';
            return;
        }

        this.scanFail++;
        if (this.scanFail >= 6) {
            this.scanFail = 0;
            this.state = 'move_area';
        }
        this.cooldown = randInt(6, 12);
    }

    private handleApproach(player: Player): void {
        const t = this.target;
        if (!t || (t as any).is_bot) {
            this._resetTarget();
            return;
        }
        if (chebyshev(player.x, player.z, t.x, t.z) > 45) {
            this._resetTarget();
            return;
        }

        if (!isNear(player, t.x, t.z, 2)) {
            this._stuckWalk(player, t.x + randInt(-1, 1), t.z + randInt(-1, 1));
            this.cooldown = 1;
            return;
        }

        // Close enough — greet them.
        const greet = pickRandom(GREET_PHRASES);
        player.say(Math.random() < 0.5 ? `${greet} ${t.displayName}!` : greet);
        this.state = 'chat';
        this.chatPhase = 0;
        this.cooldown = randInt(5, 9);
    }

    private handleChat(player: Player): void {
        const t = this.target;
        if (!t || chebyshev(player.x, player.z, t.x, t.z) > 25) {
            this._resetTarget();
            return;
        }

        // Stay close to the target while chatting.
        if (!isNear(player, t.x, t.z, 3)) {
            walkTo(player, t.x + randInt(-1, 1), t.z + randInt(-1, 1));
        }

        this.chatPhase++;

        if (this.chatPhase <= 2) {
            player.say(pickRandom(CHAT_BEFORE_LEAD));
            this.cooldown = randInt(8, 16);
            return;
        }

        // Pick a random destination and invite the player to follow.
        this.destination = DESTINATIONS[Math.floor(Math.random() * DESTINATIONS.length)] ?? null;
        player.say(pickRandom(FOLLOW_PROMPTS));
        this.leadTicks = 0;
        this.leadCommentTick = 0;
        this.missedFollowChecks = 0;
        this.state = 'lead';
        this.cooldown = randInt(6, 10);
    }

    private handleLead(player: Player): void {
        const t = this.target;
        const dest = this.destination;

        if (!t || !dest || chebyshev(player.x, player.z, t.x, t.z) > 60) {
            if (t) player.say(pickRandom(FAREWELL_PHRASES));
            this._resetTarget();
            return;
        }

        this.leadTicks++;

        // Check if we've arrived at the destination.
        if (isNear(player, dest.x, dest.z, dest.radius)) {
            player.say(pickRandom(dest.arrivalPhrases));
            this.arrivedTicks = 0;
            this.idleCommentTick = 0;
            this.state = 'arrived';
            this.cooldown = randInt(6, 10);
            return;
        }

        // Check follower status every 12 ticks.
        if (this.leadTicks % 12 === 0) {
            const isFollowing = chebyshev(player.x, player.z, t.x, t.z) <= FOLLOW_RADIUS;
            if (!isFollowing) {
                this.missedFollowChecks++;
                if (this.missedFollowChecks >= 2) {
                    // Player hasn't been following — pause and wait.
                    this.waitFollowTicks = 0;
                    this.state = 'wait_follow';
                    this.cooldown = 2;
                    return;
                }
            } else {
                this.missedFollowChecks = Math.max(0, this.missedFollowChecks - 1);
            }
        }

        // Periodically comment while walking.
        this.leadCommentTick++;
        if (this.leadCommentTick >= randInt(18, 28)) {
            if (Math.random() < 0.6) {
                player.say(pickRandom(dest.approachPhrases.concat(MOVING_COMMENTARY)));
            }
            this.leadCommentTick = 0;
        }

        // Move toward destination — teleport when far to avoid terrain traps.
        const dx = dest.x - player.x;
        const dz = dest.z - player.z;
        const dist = Math.max(Math.abs(dx), Math.abs(dz));

        if (dist > 15) {
            teleportNear(player, dest.x, dest.z);
            this.cooldown = randInt(2, 4);
            return;
        }
        // Close — walk the last stretch naturally.
        this._stuckWalk(player, dest.x + randInt(-2, 2), dest.z + randInt(-2, 2));

        this.cooldown = 1;
    }

    private handleWaitFollow(player: Player): void {
        const t = this.target;
        if (!t) {
            this._resetTarget();
            return;
        }

        this.waitFollowTicks++;

        // Say something to encourage the player.
        if (this.waitFollowTicks % randInt(8, 14) === 0) {
            player.say(pickRandom(WAIT_FOLLOW_PHRASES));
        }

        // If player catches up, continue leading.
        if (chebyshev(player.x, player.z, t.x, t.z) <= FOLLOW_RADIUS) {
            this.missedFollowChecks = 0;
            this.state = 'lead';
            this.cooldown = 2;
            return;
        }

        // Give up if waited too long.
        if (this.waitFollowTicks >= WAIT_FOLLOW_TICKS) {
            player.say(pickRandom(FAREWELL_PHRASES));
            this._resetTarget();
            return;
        }

        this.cooldown = randInt(4, 7);
    }

    private handleArrived(player: Player): void {
        const dest = this.destination;
        if (!dest) {
            this._resetTarget();
            return;
        }

        this.arrivedTicks++;

        const t = this.target;
        const playerNearby = t && chebyshev(player.x, player.z, t.x, t.z) <= 30;

        // Drift around the destination area energetically.
        if (Math.random() < 0.35) {
            const r = dest.radius + 3;
            walkTo(player, dest.x + randInt(-r, r), dest.z + randInt(-r, r));
        }

        // Periodic comments about the location.
        this.idleCommentTick++;
        if (this.idleCommentTick >= randInt(14, 22) && playerNearby) {
            player.say(pickRandom(dest.idlePhrases));
            this.idleCommentTick = 0;
        }

        // After lingering, say farewell and go back to scanning.
        if (this.arrivedTicks >= ARRIVE_LINGER_TICKS) {
            if (playerNearby && t) {
                player.say(pickRandom(FAREWELL_PHRASES));
            }
            this._resetTarget();
            return;
        }

        this.cooldown = randInt(8, 14);
    }

    private handleMoveArea(player: Player): void {
        this.areaIndex = (this.areaIndex + 1) % SCAN_AREAS.length;
        const [tx, tz] = SCAN_AREAS[this.areaIndex]!;

        if (Math.abs(player.x - tx) > 70 || Math.abs(player.z - tz) > 70) {
            teleportNear(player, tx, tz);
        } else {
            walkTo(player, tx + randInt(-6, 6), tz + randInt(-4, 4));
        }

        this.state = 'scan';
        this.cooldown = randInt(8, 16);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private _resetTarget(): void {
        this.target = null;
        this.destination = null;
        this.chatPhase = 0;
        this.leadTicks = 0;
        this.leadCommentTick = 0;
        this.missedFollowChecks = 0;
        this.waitFollowTicks = 0;
        this.arrivedTicks = 0;
        this.idleCommentTick = 0;
        this.stuck.reset();
        this.state = 'scan';
        this.cooldown = randInt(5, 10);
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
        walkTo(player, player.x + randInt(-8, 8), player.z + randInt(-8, 8));
    }
}
