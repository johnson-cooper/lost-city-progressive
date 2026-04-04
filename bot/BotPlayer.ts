/**
 * BotPlayer.ts
 *
 * Wraps a real engine Player with bot AI.
 * Ticked once per game cycle by BotManager.
 *
 * Key timing decisions:
 *   RESCAN_TICKS = 600  (~6 minutes at 600ms/tick)
 *     Long enough to walk anywhere in the world and complete a skill session
 *     before the planner considers switching goals. Previously 150 caused bots
 *     to turn around mid-journey.
 *
 *   Rescan only interrupts long-running tasks (Woodcut/Fish/Mine/Combat/etc).
 *   ShopTrip, Bank, Walk, Init are one-shot tasks — never interrupted mid-run.
 */

import Player from '#/engine/entity/Player.js';
import InvType from '#/cache/config/InvType.js';
import { BotTask, IdleTask } from '#/engine/bot/tasks/Index.js';
import { BotGoalPlanner } from '#/engine/bot/BotGoalPlanner.js';
import { getBaseLevel, PlayerStat } from '#/engine/bot/BotAction.js';

// Ticks between goal re-evaluations — 600 ticks = ~6 minutes
// Must be longer than the time to walk anywhere in the world (~200 ticks)
const RESCAN_TICKS = 600;

// Tasks that should NEVER be interrupted mid-run by a rescan.
// These are one-shot journeys; let them complete naturally.
const NO_INTERRUPT_TASKS = new Set(['ShopTrip', 'Bank', 'Walk', 'Init', 'Idle', 'Prayer']);

const IDLE_PHRASES    = ['nice', 'gz', 'good spot', 'banking brb', 'almost there', 'good xp here', 'gg', 'brb'];
const LEVELUP_PHRASES = ['gz me', 'finally!', 'level up!', 'yes!', 'grind never stops', 'getting there'];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function chance(p: number): boolean { return Math.random() < p; }

export class BotPlayer {
    readonly player:  Player;
    readonly planner: BotGoalPlanner;
    readonly name:    string;

    currentTask:  BotTask | null = null;
    taskHistory:  string[]       = [];

    private ticksAlive   = 0;
    private rescanTimer  = 0;
    // Track consecutive shouldRun failures to avoid infinite loops
    private planFailCount = 0;

    constructor(player: Player, planner: BotGoalPlanner) {
        this.player  = player;
        this.planner = planner;
        this.name    = player.username;
    }

    tick(): void {
        this.ticksAlive++;
        this.player.afkEventReady = false

        // Force appearance mask every tick so nearby clients always see the bot.
        // buildAppearance() sets PlayerInfoProt.APPEARANCE in player.masks.
        this.player.buildAppearance(InvType.WORN);
        

        if (this.ticksAlive === 1) {
            this.log(`Online at (${this.player.x}, ${this.player.z}, ${this.player.level}) slot=${this.player.slot}`);
        }

        // Occasional flavour chat (~0.3% per tick = roughly once per 5 minutes)
        if (chance(0.003)) this._say(pick(IDLE_PHRASES));

        // ── Periodic re-evaluation ─────────────────────────────────────────────
        // Only interrupt tasks that are designed to run for a long time.
        // Never interrupt ShopTrip/Bank/Walk mid-journey.
        this.rescanTimer++;
        if (this.rescanTimer >= RESCAN_TICKS) {
            this.rescanTimer = 0;
            if (this.currentTask && !NO_INTERRUPT_TASKS.has(this.currentTask.name)) {
                const candidate = this.planner.pickTask(this.player);
                if (candidate && candidate.name !== this.currentTask.name) {
                    this.log(`Rescan: ${this.currentTask.name} → ${candidate.name}`);
                    this.currentTask.interrupt();
                    this.currentTask = candidate;
                    this.currentTask.reset();
                    this.planFailCount = 0;
                    return;
                }
            }
        }

        // ── Normal task loop ───────────────────────────────────────────────────

        if (!this.currentTask) {
            this.currentTask = this._pickTask();
            if (!this.currentTask) return;
        }

        if (this.currentTask.isComplete(this.player)) {
            this._recordComplete();
            this.currentTask = this._pickTask();
            if (!this.currentTask) return;
        }

        if (this.currentTask.interrupted) {
            this.currentTask = this._pickTask();
            if (!this.currentTask) return;
        }

        // shouldRun check — if task can't run (missing materials, tools dropped, etc.)
        if (!this.currentTask.shouldRun(this.player)) {
            this.planFailCount++;
            this.log(`${this.currentTask.name} can't run (fail #${this.planFailCount})`);

            if (this.planFailCount >= 5) {
                // Too many consecutive failures — force a full rescan
                this.planFailCount = 0;
                this.rescanTimer   = RESCAN_TICKS;
            }

            this.currentTask = this._pickTask();
            if (!this.currentTask) return;
            return;
        }

        this.planFailCount = 0;

        try {
            this.currentTask.tick(this.player);
        } catch (err) {
            console.error(`[Bot:${this.name}] Task error in ${this.currentTask.name}:`, err);
            this.currentTask = null;
        }
    }

    onLevelUp(stat: PlayerStat, newLevel: number): void {
        const statName = PlayerStat[stat] ?? `stat${stat}`;
        this.log(`LEVEL UP: ${statName} → ${newLevel}`);
        if (chance(0.6)) this._say(pick(LEVELUP_PHRASES) + ` (${statName.toLowerCase()} ${newLevel})`);
        // New level may unlock better actions — trigger rescan next tick
        this.rescanTimer = RESCAN_TICKS;
    }

    snapshot() {
        const p = this.player;
        return {
            name:        this.name,
            x:           p.x,
            z:           p.z,
            level:       p.level,
            task:        this.currentTask?.name ?? 'idle',
            wc:          getBaseLevel(p, PlayerStat.WOODCUTTING),
            fishing:     getBaseLevel(p, PlayerStat.FISHING),
            mining:      getBaseLevel(p, PlayerStat.MINING),
            attack:      getBaseLevel(p, PlayerStat.ATTACK),
            strength:    getBaseLevel(p, PlayerStat.STRENGTH),
            defence:     getBaseLevel(p, PlayerStat.DEFENCE),
            hitpoints:   getBaseLevel(p, PlayerStat.HITPOINTS),
            prayer:      getBaseLevel(p, PlayerStat.PRAYER),
            ticksAlive:  this.ticksAlive,
        };
    }

    log(msg: string): void {
        console.log(`[Bot:${this.name}][t${this.ticksAlive}] ${msg}`);
    }

    private _pickTask(): BotTask | null {
        const task = this.planner.pickTask(this.player);
        if (task) {
            task.reset();
            this.log(`→ ${task.name}`);
        }
        return task;
    }

    private _recordComplete(): void {
        if (!this.currentTask) return;
        this.log(`✓ ${this.currentTask.name}`);
        this.taskHistory.push(this.currentTask.name);
        if (this.taskHistory.length > 10) this.taskHistory.shift();
    }

    private _say(message: string): void {
        this.player.say(message);
    }
}
