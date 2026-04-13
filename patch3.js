const fs = require('fs');
const content = fs.readFileSync('engine/src/engine/bot/BotGoalPlanner.ts', 'utf8');

const search = `import { CombatTask }     from '#/engine/bot/tasks/CombatTask.js';`;

const replace = `import { CombatTask }     from '#/engine/bot/tasks/CombatTask.js';
import { CookingTask }    from '#/engine/bot/tasks/CookingTask.js';`;

const newContent = content.replace(search, replace);
fs.writeFileSync('engine/src/engine/bot/BotGoalPlanner.ts', newContent);
