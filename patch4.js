const fs = require('fs');
const content = fs.readFileSync('engine/src/engine/bot/BotGoalPlanner.ts', 'utf8');

const search = `        return [
            Items.BRONZE_AXE,
            Items.BRONZE_SWORD,
            Items.IRON_SCIMITAR,
            Items.BRONZE_PICKAXE,
            Items.SMALL_FISHING_NET,
            Items.TINDERBOX,
        ];`;

const replace = `        return [
            Items.BRONZE_AXE,
            Items.BRONZE_SWORD,
            Items.IRON_SCIMITAR,
            Items.BRONZE_PICKAXE,
            Items.SMALL_FISHING_NET,
            Items.TINDERBOX,
            // Starter raw fish for cooking
            Items.RAW_SHRIMP,
        ];`;

const newContent = content.replace(search, replace);
fs.writeFileSync('engine/src/engine/bot/BotGoalPlanner.ts', newContent);
