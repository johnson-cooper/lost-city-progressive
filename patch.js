const fs = require('fs');
const content = fs.readFileSync('engine/src/engine/bot/BotGoalPlanner.ts', 'utf8');

const search = `                            // Has everything — go do the skill
                            if (step.action === 'combat') return new CombatTask(step, stat);
                            if (step.action === 'woodcut') return new WoodcuttingTask(step);
                            if (step.action === 'mine')    return new MiningTask(step);
                            if (step.action === 'fish')    return new FishingTask(step);
                            if (step.action === 'firemaking')    return new FiremakingTask(step);

                            // Other skills (cook, smith, etc.) not yet implemented`;

const replace = `                            // Has everything — go do the skill
                            if (step.action === 'combat') return new CombatTask(step, stat);
                            if (step.action === 'woodcut') return new WoodcuttingTask(step);
                            if (step.action === 'mine')    return new MiningTask(step);
                            if (step.action === 'fish')    return new FishingTask(step);
                            if (step.action === 'firemaking')    return new FiremakingTask(step);
                            if (step.action === 'cook')    return new CookingTask(step);

                            // Other skills (smith, etc.) not yet implemented`;

const newContent = content.replace(search, replace);
fs.writeFileSync('engine/src/engine/bot/BotGoalPlanner.ts', newContent);
