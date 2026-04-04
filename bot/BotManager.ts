/**
 * BotManager.ts
 *
 * Spawns and ticks all bots.
 *
 * World.ts integration (3 changes):
 *
 *   1. Import at top of World.ts:
 *        import { BotManager } from '#/engine/bot/BotManager.js';
 *
 *   2. In start(), before this.cycle():
 *        BotManager.init(this);   // ← pass `this` (the World instance)
 *
 *   3. In cycle(), after this.processPlayers():
 *        BotManager.tick();
 *
 *   4. In processLogouts() — protect bots from timeout (see INSTALL.md)
 *
 * NOTE: BotManager does NOT import World. Instead it receives the World
 * instance via init(world) to avoid a circular import cycle:
 *   World → BotManager → [BotAction/BotTask] → World  (would be circular)
 */
import fs from 'fs';
import path from 'path';
import Player from '#/engine/entity/Player.js';
import { PlayerStat, getBaseLevel } from '#/engine/bot/BotAction.js';
import { BotPlayer } from '#/engine/bot/BotPlayer.js';
import { setWorld, BotWorldHandle } from '#/engine/bot/BotWorld.js';
import {
    BotGoalPlanner,
    makeSkiller, makeFighter, makeBalanced, makeRandom,
} from '#/engine/bot/BotGoalPlanner.js';
import { PlayerLoading } from '#/engine/entity/PlayerLoading.js';
import Packet from '#/io/Packet.js';
import { Locations } from '#/engine/bot/BotKnowledge.js';

// ── Bot definitions ───────────────────────────────────────────────────────────

interface BotConfig {
    username:    string;
    makePlanner: () => BotGoalPlanner;
    description: string;
}

const BOT_CONFIGS: BotConfig[] = [
    { username: 'alice',   makePlanner: makeSkiller,  description: 'Skiller'   },
    { username: 'bob',     makePlanner: makeFighter,  description: 'Fighter'   },
    { username: 'charlie', makePlanner: makeBalanced, description: 'Balanced'  },
    { username: 'dave',    makePlanner: makeRandom,   description: 'Random'    },
    { username: 'eve',     makePlanner: makeSkiller,  description: 'Skiller 2' },
    { username: 'frank',   makePlanner: makeFighter,  description: 'Fighter 2' },
    { username: 'findme',   makePlanner: makeFighter,  description: 'Fighter 2' },
];

const STATUS_EVERY_TICKS = 100;

// ── BotManager singleton ──────────────────────────────────────────────────────

class BotManagerClass {
    private world:      BotWorldHandle | null = null;
    private bots:       Map<string, BotPlayer>  = new Map();
    private prevLevels: Map<string, Uint8Array> = new Map();
    private spawned     = false;
    private tickCount   = 0;

    /**
     * Call from World.ts start() before this.cycle():
     *   BotManager.init(this);
     */
    init(world: BotWorldHandle): void {
        if (this.spawned) return;
        this.spawned = true;
        this.world   = world;
        setWorld(world); // makes World available to BotAction/BotTask without import cycle
        console.log(`[BotManager] Spawning ${BOT_CONFIGS.length} bots from Lumbridge...`);
        for (const cfg of BOT_CONFIGS) this._spawnBot(cfg);
    }

    /** Call from World.ts cycle() after processPlayers(). */
    tick(): void {
        if (!this.world) return;
        if (this.world.shutdown || this.world.shutdownSoon) return;

        this.tickCount++;

        for (const bot of this.bots.values()) {
            if (bot.player.slot === -1) continue;
            this._checkLevelUps(bot);
            bot.tick();
        }

        if (this.tickCount % STATUS_EVERY_TICKS === 0) {
            this._printStatus();
        }
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private _spawnBot(cfg: BotConfig): void {
    if (!this.world) return;

    let packet: Packet;

    try {
        const savePath = `data/players/main/${cfg.username}.sav`;

        let save: Buffer;

        if (fs.existsSync(savePath)) {
            save = fs.readFileSync(savePath);

            // safety: empty or corrupted file guard
            if (!save || save.length === 0) {
                save = Buffer.alloc(0);
            }
        } else {
            save = Buffer.alloc(0);
        }

        packet = new Packet(save);

    } catch (err) {
        console.error(`[BotManager] Failed loading save for ${cfg.username}:`, err);
        packet = new Packet(new Uint8Array(0));
    }

    let player: Player;

    try {
        player = PlayerLoading.load(cfg.username, packet, null);
    } catch (err) {
        console.error(`[BotManager] Corrupt PlayerLoading data for ${cfg.username}, spawning fresh`, err);
        player = PlayerLoading.load(cfg.username, new Packet(new Uint8Array(0)), null);
    }

    // ── fallback spawn position if save doesn't include coords
    const [x, z, l] = Locations.LUMBRIDGE_SPAWN;

    player.x = player.x ?? x;
    player.z = player.z ?? z;
    player.level = player.level ?? l;

    // ── ensure baseLevels always valid
    if (!player.baseLevels || player.baseLevels.length !== 21) {
        player.baseLevels = new Uint8Array(21);
    }

    // ── store XP baseline safely
    this.prevLevels.set(cfg.username, new Uint8Array(player.baseLevels));

    const bot = new BotPlayer(player, cfg.makePlanner());
    this.bots.set(cfg.username, bot);

    this.world.newPlayers.add(player);

    console.log(`[BotManager] Loaded bot: ${cfg.username}`);
}

    private _checkLevelUps(bot: BotPlayer): void {
        const prev = this.prevLevels.get(bot.name);
        if (!prev) return;
        for (let stat = 0; stat < 21; stat++) {
            const cur = getBaseLevel(bot.player, stat as PlayerStat);
            if (cur > prev[stat]) {
                bot.onLevelUp(stat as PlayerStat, cur);
                prev[stat] = cur;
            }
        }
    }

private static readonly STAT_LABELS: string[] = [
    'Atk', 'Str', 'Def', 'HP', 'Rng', 'Pray', 'Mag',
    'Cook', 'WC', 'Flet', 'Fish', 'FM', 'Craft', 'Smith',
    'Mine', 'Herb', 'Agi', 'Thiev', 'Slay', 'Farm', 'RC',
];

private _printStatus(): void {
    const activeBots = [...this.bots.values()].filter(bot => bot.player.slot !== -1);
    const now = new Date().toLocaleTimeString();

    console.log('');
    console.log(`┌──────────────────── BotManager Status ────────────────────┐`);
    console.log(`│ Time: ${now.padEnd(50)}│`);
    console.log(`│ Bots: ${String(activeBots.length).padEnd(5)} active / ${String(this.bots.size).padEnd(5)} total${' '.repeat(25)}│`);
    console.log(`└───────────────────────────────────────────────────────────┘`);
    console.log('');

    for (const bot of activeBots) {
        const s = bot.snapshot();
        const levels = this._getAllSkillLevels(bot.player);

        const width = 98;
        const inner = width - 2;

        console.log(`┌${'─'.repeat(inner)}┐`);
        console.log(`│ ${`${s.name} • ${s.task ?? 'idle'}`.padEnd(inner - 1)}│`);
        console.log(`│ ${`Pos: (${s.x}, ${s.z}, ${s.level})`.padEnd(inner - 1)}│`);
        console.log(`│ ${this._skillRow(levels, 0, 7).padEnd(inner - 1)}│`);
        console.log(`│ ${this._skillRow(levels, 7, 7).padEnd(inner - 1)}│`);
        console.log(`│ ${this._skillRow(levels, 14, 7).padEnd(inner - 1)}│`);
        console.log(`└${'─'.repeat(inner)}┘`);
    }

    console.log('');
}

private _getAllSkillLevels(player: Player): number[] {
    const levels: number[] = [];
    for (let stat = 0; stat < 21; stat++) {
        levels.push(getBaseLevel(player, stat as PlayerStat));
    }
    return levels;
}

private _skillRow(levels: number[], start: number, count: number): string {
    const parts: string[] = [];

    for (let i = 0; i < count; i++) {
        const idx = start + i;
        const label = BotManagerClass.STAT_LABELS[idx] ?? `S${idx}`;
        const value = levels[idx] ?? 0;
        parts.push(`${label}:${String(value).padStart(2)}`);
    }

    return parts.join('  ');
}
}

export const BotManager = new BotManagerClass();
