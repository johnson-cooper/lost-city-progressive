const fs = require('fs');
const content = fs.readFileSync('engine/src/engine/bot/BotGoalPlanner.ts', 'utf8');

const search = `import { IdleTask, BuryBonesTask, SellTask } from '#/engine/bot/tasks/UtilTasks.js';`;

const replace = `import { IdleTask, BuryBonesTask, SellTask } from '#/engine/bot/tasks/UtilTasks.js';
import { CookingTask } from '#/engine/bot/tasks/CookingTask.js';`;

const newContent = content.replace(search, replace);
fs.writeFileSync('engine/src/engine/bot/BotGoalPlanner.ts', newContent);
