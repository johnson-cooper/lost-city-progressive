/**
 * CombatTask.ts — Walk to a spawn area, find and attack NPCs, bank loot.
 */

import {
    BotTask, Player, Npc, InvType,
    walkTo, interactNpcOp,
    findNpcByName, findNpcByPrefix, findNpcBySuffix,
    hasItem, isInventoryFull, isNear,
    getBaseLevel, PlayerStat,
    Items, Locations, getProgressionStep,
    teleportToSafety, teleportNear, randInt, bankInvId,
    INTERACT_TIMEOUT, StuckDetector, ProgressWatchdog,
    openNearbyGate,
} from '#/engine/bot/tasks/BotTaskBase.js';
import type { SkillStep } from '#/engine/bot/tasks/BotTaskBase.js';

type CombatExtra = {
    npcName?:   string;
    npcType?:   string;
    npcPrefix?: string;
    npcSuffix?: string;
};

export class CombatTask extends BotTask {
    private step: SkillStep;
    private readonly stat: PlayerStat;

    private state: 'walk' | 'scan' | 'interact' | 'bank_walk' | 'bank_done' = 'walk';
    private interactTicks = 0;
    private approachTicks = 0;  // ticks engine hasn't moved us toward currentNpc
    private lastXp        = 0;
    private scanFail      = 0;
    private currentNpc: Npc | null = null;

    private readonly stuck    = new StuckDetector(30, 4, 2);
    private readonly watchdog = new ProgressWatchdog(150);

    constructor(step: SkillStep, stat: PlayerStat) {
        super('Combat');
        this.step = step;
        this.stat = stat;
    }

    shouldRun(player: Player): boolean {
        return this.step.toolItemIds.every(id => hasItem(player, id));
    }

    tick(player: Player): void {
        if (this.interrupted) return;

        // Teleport + abandon task if no XP for 400 ticks (BotPlayer will pick a fresh task)
        const banking = this.state === 'bank_walk' || this.state === 'bank_done';
        if (this.watchdog.check(player, banking)) { this.interrupt(); return; }

        if (this.cooldown > 0) { this.cooldown--; return; }

        // Upgrade step on level-up
        const level = getBaseLevel(player, this.stat);
        const skillName = this.stat === PlayerStat.ATTACK   ? 'ATTACK'
                        : this.stat === PlayerStat.STRENGTH ? 'STRENGTH'
                        : 'DEFENCE';
        const newStep = getProgressionStep(skillName, level);
        if (newStep && newStep.minLevel > this.step.minLevel) {
            this.step      = newStep;
            this.state     = 'walk';
            this.currentNpc = null;
        }

        if (this.state === 'bank_walk') {
            const [bx, bz] = Locations.DRAYNOR_BANK;
            if (!isNear(player, bx, bz, 8)) { this._stuckWalk(player, bx, bz); return; }
            const banker = findNpcByPrefix(player.x, player.z, player.level, 'banker', 10);
            if (!banker) { walkTo(player, bx, bz); return; }
            interactNpcOp(player, banker, 3);
            this.cooldown = 4; this.state = 'bank_done'; return;
        }

        if (this.state === 'bank_done') {
            this._depositLoot(player);
            this.state = 'walk'; this.cooldown = 3; return;
        }

        if (isInventoryFull(player)) { this.state = 'bank_walk'; return; }

        if (this.state === 'walk') {
            const [lx, lz, ll] = this.step.location;
            if (!isNear(player, lx, lz, 15, ll)) {
                this._stuckWalk(player, lx, lz); return;
            }
            console.log(`[Combat:${player.username}] Arrived at dest (${lx},${lz}), scanning for ${(this.step.extra as any)?.npcType}`);
            this.state   = 'scan';
            this.scanFail = 0;
            return;
        }

        if (this.state === 'scan') {
            const npc = this._findTargetNpc(player);
            if (!npc) {
                this.scanFail++;
                // Try opening a nearby door/gate — target may be locked inside
                if (this.scanFail % 3 === 0) openNearbyGate(player, 6);
                if (this.scanFail > 5) {
                    this.state    = 'walk';
                    this.scanFail = 0;
                }
                return;
            }
            console.log(`[Combat:${player.username}] Found NPC ${npc.type} at (${npc.x},${npc.z}), attacking`);
            this.scanFail    = 0;
            this.currentNpc  = npc;
            this.approachTicks = 0;
            interactNpcOp(player, npc, 2); // op2 = Attack
            this.state         = 'interact';
            this.interactTicks = 0;
            this.lastXp        = player.stats[this.stat];
            return;
        }

        if (this.state === 'interact') {
            this.interactTicks++;
            this.approachTicks++;

            if (player.stats[this.stat] > this.lastXp) {
                // XP gained — we're actively fighting
                this.lastXp        = player.stats[this.stat];
                this.interactTicks = 0;
                this.approachTicks = 0;
                this.watchdog.notifyActivity();
                return;
            }

            // Haven't landed a hit in a while — we may be unable to reach the NPC
            if (this.approachTicks >= INTERACT_TIMEOUT) {
                // Try opening a door/gate between us and the target
                if (openNearbyGate(player, 6)) {
                    this.approachTicks = 0;
                    this.cooldown      = 4;
                    return;
                }
                // Give up on this target — find a new one
                console.log(`[Combat:${player.username}] Can't reach NPC at (${this.currentNpc?.x},${this.currentNpc?.z}), finding new target`);
                this.currentNpc    = null;
                this.approachTicks = 0;
                this.interactTicks = 0;
                this.state         = 'scan';
                return;
            }

            // Full interact timeout — NPC likely dead or walked away
            if (this.interactTicks >= INTERACT_TIMEOUT * 2) {
                console.log(`[Combat:${player.username}] Interact timeout at (${player.x},${player.z})`);
                this.currentNpc    = null;
                this.approachTicks = 0;
                this.interactTicks = 0;
                this.state         = 'scan';
            }
        }
    }

    isComplete(_p: Player): boolean { return false; }

    override reset(): void {
        super.reset();
        this.state         = 'walk';
        this.interactTicks = 0;
        this.approachTicks = 0;
        this.lastXp        = 0;
        this.scanFail      = 0;
        this.currentNpc    = null;
        this.stuck.reset();
        this.watchdog.reset();
    }

    private _findTargetNpc(player: Player): Npc | null {
        const extra = this.step.extra as CombatExtra | undefined;

        // Try npcType / npcName first as exact match, then prefix/suffix fallback
        for (const name of [extra?.npcType, extra?.npcName].filter(Boolean) as string[]) {
            const npc = findNpcByName(player.x, player.z, player.level, name, 15)
                     ?? findNpcByPrefix(player.x, player.z, player.level, name, 15);
            if (npc) return npc;
        }
        if (extra?.npcPrefix) {
            const npc = findNpcByPrefix(player.x, player.z, player.level, extra.npcPrefix, 15);
            if (npc) return npc;
        }
        if (extra?.npcSuffix) {
            const npc = findNpcBySuffix(player.x, player.z, player.level, extra.npcSuffix, 15);
            if (npc) return npc;
        }
        return null;
    }

    private _depositLoot(player: Player): void {
        const inv = player.getInventory(InvType.INV);
        const bid = bankInvId();
        if (!inv || bid === -1) return;
        const bank = player.getInventory(bid);
        if (!bank) return;
        for (let slot = 0; slot < inv.capacity; slot++) {
            const item = inv.get(slot);
            if (!item) continue;
            if (this.step.toolItemIds.includes(item.id)) continue;
            if (item.id === Items.COINS) continue;
            const moved = inv.remove(item.id, item.count);
            if (moved.completed > 0) bank.add(item.id, moved.completed);
        }
    }

    private _stuckWalk(player: Player, lx: number, lz: number): void {
        if (!this.stuck.check(player, lx, lz)) {
            walkTo(player, lx, lz);
            return;
        }
        if (this.stuck.desperatelyStuck) {
            teleportNear(player, lx, lz);
            this.stuck.reset();
            return;
        }
        if (openNearbyGate(player, 5)) return;

        const dx   = lx - player.x;
        const dz   = lz - player.z;
        const escX = player.x + (Math.abs(dz) > Math.abs(dx) ? randInt(-10, 10) : (dz > 0 ? 10 : -10));
        const escZ = player.z + (Math.abs(dx) > Math.abs(dz) ? randInt(-10, 10) : (dx > 0 ? 10 : -10));
        walkTo(player, escX, escZ);
    }
}
