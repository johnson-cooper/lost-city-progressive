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
        const emptyPacket = new Packet(new Uint8Array(0));
        const player      = PlayerLoading.load(cfg.username, emptyPacket, null);

        const [x, z, l] = Locations.LUMBRIDGE_SPAWN;
        player.x         = x;
        player.z         = z;
        player.level     = l;

        this.prevLevels.set(cfg.username, new Uint8Array(player.baseLevels));

        const bot = new BotPlayer(player, cfg.makePlanner());
        this.bots.set(cfg.username, bot);

        this.world.newPlayers.add(player);
        console.log(`[BotManager] Queued: ${cfg.username} (${cfg.description})`);
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

    private _printStatus(): void {
        const lines: string[] = [''];
        lines.push('┌─────────┬────────────┬────┬────┬────┬────┬────┬────┬────┬─────────────────────┐');
        lines.push('│ Bot     │ Task       │ WC │Fish│Mine│ Atk│ Str│ Def│ HP │ Position            │');
        lines.push('├─────────┼────────────┼────┼────┼────┼────┼────┼────┼────┼─────────────────────┤');
        for (const bot of this.bots.values()) {
            if (bot.player.slot === -1) continue;
            const s   = bot.snapshot();
            const pos = `(${s.x}, ${s.z}, ${s.level})`.padEnd(21);
            lines.push(
                `│ ${s.name.padEnd(7)} │ ${(s.task ?? 'idle').padEnd(10)} │` +
                ` ${String(s.wc).padStart(2)} │ ${String(s.fishing).padStart(2)} │` +
                ` ${String(s.mining).padStart(2)} │ ${String(s.attack).padStart(2)} │` +
                ` ${String(s.strength).padStart(2)} │ ${String(s.defence).padStart(2)} │` +
                ` ${String(s.hitpoints).padStart(2)} │ ${pos}│`
            );
        }
        lines.push('└─────────┴────────────┴────┴────┴────┴────┴────┴────┴────┴─────────────────────┘');
        lines.push('');
        console.log(lines.join('\n'));
    }
}

export const BotManager = new BotManagerClass();