/**
 * AgilityTask.ts
 *
 * Runs agility courses in a sequence of obstacles.
 * Progression: Gnome (level 1) → Barbarian (35) → Wilderness (52).
 */

import {
    BotTask,
    Player,
    walkTo,
    interactLocOp,
    findLocByName,
    isNear,
    getBaseLevel,
    PlayerStat,
    Locations,
    getProgressionStep,
    randInt,
    INTERACT_TIMEOUT,
    StuckDetector,
    ProgressWatchdog,
    botJitter
} from '#/engine/bot/tasks/BotTaskBase.js';
import type { SkillStep } from '#/engine/bot/tasks/BotTaskBase.js';
import { AgilityCourses, AgilityObstacle } from '#/engine/bot/BotKnowledge.js';

export class AgilityTask extends BotTask {
    private step: SkillStep;
    private courseName: string;
    private obstacleIndex = 0;

    private state: 'walk' | 'approach' | 'interact' = 'walk';
    private interactTicks = 0;
    private lastXp = 0;

    private readonly stuck = new StuckDetector(30, 4, 2);
    private readonly watchdog = new ProgressWatchdog(300);

    constructor(step: SkillStep) {
        super('Agility');
        this.step = step;
        this.courseName = (step.extra?.course as string) ?? 'GNOME';
    }

    shouldRun(player: Player): boolean {
        return true; // Agility has no tool requirements
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

        // Upgrade course if level-up unlocks a better one
        const level = getBaseLevel(player, PlayerStat.AGILITY);
        const newStep = getProgressionStep('AGILITY', level);
        if (newStep && newStep.minLevel > this.step.minLevel) {
            this.step = newStep;
            this.courseName = (newStep.extra?.course as string) ?? 'GNOME';
            this.state = 'walk';
            this.obstacleIndex = 0;
        }

        switch (this.state) {
            case 'walk':
                this._doWalk(player);
                break;
            case 'approach':
                this._doApproach(player);
                break;
            case 'interact':
                this._doInteract(player);
                break;
        }
    }

    private _doWalk(player: Player): void {
        const [lx, lz, ll] = this.step.location;
        if (!isNear(player, lx, lz, 10, ll)) {
            const [jx, jz] = botJitter(player, lx, lz, 3);
            if (this.stuck.check(player, jx, jz)) {
                walkTo(player, jx + randInt(-5, 5), jz + randInt(-5, 5));
            } else {
                walkTo(player, jx, jz);
            }
            return;
        }
        this.state = 'approach';
        this.obstacleIndex = 0;
    }

    private _doApproach(player: Player): void {
        const obstacles = AgilityCourses[this.courseName];
        if (!obstacles || this.obstacleIndex >= obstacles.length) {
            this.obstacleIndex = 0;
            return;
        }

        const current = obstacles[this.obstacleIndex];
        const loc = findLocByName(player.x, player.z, player.level, current.name, 20);

        if (!loc) {
            // Can't find next obstacle, wander slightly or reset to course start
            if (this.obstacleIndex === 0) {
                 const [lx, lz] = this.step.location;
                 walkTo(player, lx + randInt(-2, 2), lz + randInt(-2, 2));
            } else {
                // If we're stuck in the middle, try walking back to course start
                this.state = 'walk';
            }
            return;
        }

        if (isNear(player, loc.x, loc.z, 2, player.level)) {
            interactLocOp(player, loc, current.op as any);
            this.state = 'interact';
            this.interactTicks = 0;
            this.lastXp = player.stats[PlayerStat.AGILITY];
            return;
        }

        walkTo(player, loc.x, loc.z);
    }

    private _doInteract(player: Player): void {
        this.interactTicks++;

        if (player.stats[PlayerStat.AGILITY] > this.lastXp) {
            this.lastXp = player.stats[PlayerStat.AGILITY];
            this.watchdog.notifyActivity();
            this.obstacleIndex++;

            const obstacles = AgilityCourses[this.courseName];
            if (this.obstacleIndex >= obstacles.length) {
                this.obstacleIndex = 0;
            }

            this.state = 'approach';
            this.cooldown = 2;
            return;
        }

        if (this.interactTicks >= INTERACT_TIMEOUT) {
            this.state = 'approach';
            this.interactTicks = 0;
        }
    }

    isComplete(_p: Player): boolean {
        return false;
    }

    override reset(): void {
        super.reset();
        this.state = 'walk';
        this.obstacleIndex = 0;
        this.interactTicks = 0;
        this.lastXp = 0;
        this.stuck.reset();
        this.watchdog.reset();
    }
}
