/**
 * BotGoalPlanner.ts
 *
 * Picks the next task given the bot's personality and current state.
 *
 * Decision order each call:
 *   1. First ever call → InitTask
 *   2. Has bones + wants prayer → BuryBonesTask
 *   3. Weighted skill pick (filtered to skills with content)
 *   4a. Bot can't afford the tools → try a cheaper skill or combat for coins
 *   4b. Bot has tools → WoodcuttingTask/MiningTask/FishingTask/CombatTask
 *
 * Skill rotation is managed by BotPlayer's rescan timer (150 ticks),
 * not here. The planner is stateless about which skill was last chosen.
 */

import Player from '#/engine/entity/Player.js';
import { PlayerStat, getBaseLevel, hasItem } from '#/engine/bot/BotAction.js';
import { Items, SkillProgression, getProgressionStep } from '#/engine/bot/BotKnowledge.js';
import {
    getMissingPurchases, canAffordStep, totalCostOfMissing,
} from '#/engine/bot/BotNeeds.js';
import type { Purchase } from '#/engine/bot/BotNeeds.js';
import { bankInvId, BotTask }        from '#/engine/bot/tasks/BotTaskBase.js';
import { InitTask, BuryBonesTask, IdleTask } from '#/engine/bot/tasks/UtilTasks.js';
import { ShopTripTask }   from '#/engine/bot/tasks/ShopTripTask.js';
import { WoodcuttingTask } from '#/engine/bot/tasks/WoodcuttingTask.js';
import { MiningTask }     from '#/engine/bot/tasks/MiningTask.js';
import { FishingTask }    from '#/engine/bot/tasks/FishingTask.js';
import { CombatTask }     from '#/engine/bot/tasks/CombatTask.js';
import { FiremakingTask } from '#/engine/bot/tasks/FiremakingTask.js';

// ── Personality ───────────────────────────────────────────────────────────────

export interface BotPersonality {
    name:    string;
    weights: Partial<Record<string, number>>;
}

export const Personalities: Record<string, BotPersonality> = {
    SKILLER: {
        name: 'Skiller',
        weights: {
            WOODCUTTING: 25, FISHING: 25, MINING: 20,
            COOKING: 15, SMITHING: 10, PRAYER: 5, FIREMAKING: 25,
        },
    },
    FIGHTER: {
        name: 'Fighter',
        weights: {
            ATTACK: 30, STRENGTH: 30, DEFENCE: 20,
            RANGED: 10, MAGIC: 5, PRAYER: 5,
        },
    },
    BALANCED: {
        name: 'Balanced',
        weights: {
            ATTACK: 10, STRENGTH: 10, DEFENCE: 8,
            WOODCUTTING: 12, FISHING: 10, MINING: 8,
            COOKING: 8, SMITHING: 5, PRAYER: 5,
            RANGED: 4, MAGIC: 4, FIREMAKING: 25,
        },
    },
};

// Skill name → PlayerStat
const SKILL_STAT: Record<string, PlayerStat> = {
    ATTACK:      PlayerStat.ATTACK,
    STRENGTH:    PlayerStat.STRENGTH,
    DEFENCE:     PlayerStat.DEFENCE,
    HITPOINTS:   PlayerStat.HITPOINTS,
    RANGED:      PlayerStat.RANGED,
    PRAYER:      PlayerStat.PRAYER,
    MAGIC:       PlayerStat.MAGIC,
    COOKING:     PlayerStat.COOKING,
    WOODCUTTING: PlayerStat.WOODCUTTING,
    FLETCHING:   PlayerStat.FLETCHING,
    FISHING:     PlayerStat.FISHING,
    FIREMAKING:  PlayerStat.FIREMAKING,
    CRAFTING:    PlayerStat.CRAFTING,
    SMITHING:    PlayerStat.SMITHING,
    MINING:      PlayerStat.MINING,
    AGILITY:     PlayerStat.AGILITY,
    THIEVING:    PlayerStat.THIEVING,
    RUNECRAFT:   PlayerStat.RUNECRAFT,
};

// Only skills with content implemented in BotKnowledge.ts
const SKILLS_WITH_CONTENT = new Set(
    Object.entries(SkillProgression)
        .filter(([, steps]) => steps.length > 0)
        .map(([name]) => name)
);

// Shops close enough to Lumbridge spawn that bots can reach without getting stuck.
// Bots will ONLY go to these shops automatically. Starter weapons/tools are given
// via InitTask so bots never need to walk to Varrock or Port Sarim just to begin.
const NEARBY_SHOPS = new Set(['BOB_AXES', 'LUMBRIDGE_GENERAL', 'AL_KHARID_SCIMITARS']);

// ── Planner ───────────────────────────────────────────────────────────────────

export class BotGoalPlanner {
    readonly personality: BotPersonality;
    private initialised = false;

    constructor(personality: BotPersonality = Personalities.BALANCED) {
        this.personality = personality;
    }

    pickTask(player: Player): BotTask | null {

        // ── 1. Init ───────────────────────────────────────────────────────────
        if (!this.initialised) {
            this.initialised = true;
            return new InitTask(this._starterItems());
        }

        // ── 2. Passive prayer ─────────────────────────────────────────────────
        if ((this.personality.weights['PRAYER'] ?? 0) > 0) {
            if (hasItem(player, Items.BONES) || hasItem(player, Items.BIG_BONES)) {
                return new BuryBonesTask();
            }
        }

        // ── 3 + 4. Pick skill, handle affordability ───────────────────────────
        return this._pickBestTask(player);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    private _pickBestTask(player: Player): BotTask | null {
        // Build candidate list ordered by weight (highest first after shuffle)
        const candidates = this._buildCandidates(player);
        if (candidates.length === 0) return new IdleTask(30);

        for (const skillName of candidates) {
            const stat  = SKILL_STAT[skillName];
            const level = getBaseLevel(player, stat);
            const step  = getProgressionStep(skillName, level);
            if (!step) continue;

            const missing = getMissingPurchases(player, step);

            if (missing.length === 0) {
                // Double-check: getMissingPurchases omits unaffordable items (returns empty list
                // even if tools are missing), so we must verify the bot actually owns every tool.
                if (!step.toolItemIds.every(id => hasItem(player, id))) continue;

                // Check consumable availability (bait, feathers, raw fish for cooking, logs for FM)
                // If the step consumes an item that isn't purchasable (e.g. raw fish, logs),
                // the bot must first produce it via a different skill step.
            if (step.itemConsumed && step.itemConsumed !== -1) {

                const hasInv = hasItem(player, step.itemConsumed, 1);

                // 🔥 NEW: check bank too
                const bid = bankInvId();
                let hasBank = false;

                if (bid !== -1) {
                    const bank = player.getInventory(bid);
                    if (bank) {
                        for (let i = 0; i < bank.capacity; i++) {
                            const item = bank.get(i);
                            if (!item) continue;
                            if (item.id === step.itemConsumed) {
                                hasBank = true;
                                break;
                            }
                        }
                    }
                }

                if (!hasInv && !hasBank) {
                    // 🔥 fallback to woodcutting ONLY if no logs anywhere
                    if (skillName === 'FIREMAKING') {
                        const wcLevel = getBaseLevel(player, PlayerStat.WOODCUTTING);
                        const wcStep = getProgressionStep('WOODCUTTING', wcLevel);

                        if (wcStep) {
                            return new WoodcuttingTask(wcStep);
                        }
                    }

                    continue;
                }


                                const alsoConsumes = step.extra?.alsoConsumes as number | undefined;
                                if (alsoConsumes && !hasItem(player, alsoConsumes, 1)) {
                                    continue;
                                }
                            }
                            // Has everything — go do the skill
                            if (step.action === 'combat') return new CombatTask(step, stat);
                            if (step.action === 'woodcut') return new WoodcuttingTask(step);
                            if (step.action === 'mine')    return new MiningTask(step);
                            if (step.action === 'fish')    return new FishingTask(step);
                            if (step.action === 'firemaking')    return new FiremakingTask(step);
                            
                            // Other skills (cook, smith, etc.) not yet implemented
                            continue;
                        }

                        if (canAffordStep(player, step)) {
                            // Only go to nearby shops — distant shops cause bots to get stuck.
                            // Starter gear is provided by InitTask so basics are always available.
                            const first = missing[0];
                            if (NEARBY_SHOPS.has(first.shopKey)) {
                                return new ShopTripTask(first.shopKey, first.itemId, first.quantity, first.cost);
                            }
                            // Distant shop needed — skip this skill for now
                        }

                        // Can't afford this skill's tools — try the next candidate
                        // (lower-weight skills may be cheaper or tool-free)
                    }

                    // All skills need tools the bot can't afford.
                    // Fall back to combat to earn coins — chickens/goblins need only a sword (32gp)
                    // If even that's too expensive, idle briefly and hope for drops
                    const combatFallback = this._cheapestCombatTask(player);
                    return combatFallback ?? new IdleTask(30);
                }

    /**
     * Returns skill names in weighted-random order.
     * Skills the bot can't afford (and has no free fallback) sink to the bottom.
     */
    private _buildCandidates(player: Player): string[] {
        const affordable:   string[] = [];
        const unaffordable: string[] = [];

        const entries = Object.entries(this.personality.weights)
            .filter(([skill, w]) =>
                w && w > 0 &&
                SKILLS_WITH_CONTENT.has(skill) &&
                (() => {
                    const stat = SKILL_STAT[skill];
                    return stat !== undefined && getBaseLevel(player, stat) < 99;
                })()
            );

        // Weighted shuffle into two buckets
        let remaining = entries.slice();
        while (remaining.length > 0) {
            const total = remaining.reduce((s, [, w]) => s + (w ?? 0), 0);
            let roll    = Math.random() * total;
            let chosen  = remaining[remaining.length - 1];
            for (const entry of remaining) {
                roll -= entry[1] ?? 0;
                if (roll <= 0) { chosen = entry; break; }
            }
            remaining = remaining.filter(e => e !== chosen);

            const [skill] = chosen;
            const stat     = SKILL_STAT[skill];
            const level    = stat !== undefined ? getBaseLevel(player, stat) : 0;
            const step     = getProgressionStep(skill, level);
            if (!step) continue;

            if (canAffordStep(player, step)) {
                affordable.push(skill);
            } else {
                unaffordable.push(skill);
            }
        }

        // Affordable skills first, then unaffordable (so we try them but won't
        // issue an unaffordable shop trip — _pickBestTask skips those)
        return [...affordable, ...unaffordable];
    }

    /**
     * Fallback: find the cheapest combat progression step the bot can afford.
     * Used when all other skills are too expensive to get started.
     */
    private _cheapestCombatTask(player: Player): BotTask | null {
        for (const skillName of ['ATTACK', 'STRENGTH', 'DEFENCE']) {
            const stat = SKILL_STAT[skillName];
            if (!stat) continue;
            const level = getBaseLevel(player, stat);
            const step  = getProgressionStep(skillName, level);
            if (!step) continue;

            const missing = getMissingPurchases(player, step);
            if (missing.length === 0) {
                // getMissingPurchases silently drops unaffordable items, so verify ownership
                if (!step.toolItemIds.every(id => hasItem(player, id))) continue;
                // Has all tools — can fight
                return new CombatTask(step, stat); // has weapon
            }
            if (canAffordStep(player, step) && NEARBY_SHOPS.has(missing[0].shopKey)) {
                // Tools available at a nearby shop — go buy them
                return new ShopTripTask(missing[0].shopKey, missing[0].itemId, missing[0].quantity, missing[0].cost);
            }
            // Weapon only available at distant shop — skip combat for now
            // (bot should have received starter weapon from InitTask)
        }
        return null;
    }

    /**
     * All bots get a full starter kit so they can attempt any beginning skill
     * without a shop trip. This avoids long walks on the very first session.
     *
     * Given to every bot regardless of personality:
     *   bronze_axe      — woodcutting from level 1
     *   bronze_sword    — combat from level 1
     *   bronze_pickaxe  — mining from level 1
     *   small_net       — fishing (shrimp) from level 1
     *
     * As bots level up and earn coins from selling resources, they upgrade
     * to better equipment via shop trips.
     */
    private _starterItems(): number[] {
        return [
            Items.BRONZE_AXE,
            Items.BRONZE_SWORD,
            Items.IRON_SCIMITAR,
            Items.BRONZE_PICKAXE,
            Items.SMALL_FISHING_NET,
            Items.TINDERBOX,
        ];
    }
}

// ── Factories ─────────────────────────────────────────────────────────────────

export function makeSkiller():  BotGoalPlanner { return new BotGoalPlanner(Personalities.SKILLER);  }
export function makeFighter():  BotGoalPlanner { return new BotGoalPlanner(Personalities.FIGHTER);  }
export function makeBalanced(): BotGoalPlanner { return new BotGoalPlanner(Personalities.BALANCED); }

export function makeRandom(): BotGoalPlanner {
    const allSkills = Object.keys(SKILL_STAT).filter(s => SKILLS_WITH_CONTENT.has(s));
    const weights: Record<string, number> = {};
    for (const s of allSkills) weights[s] = Math.floor(Math.random() * 20) + 1;
    return new BotGoalPlanner({ name: 'Random', weights });
}
