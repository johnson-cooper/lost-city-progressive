const fs = require('fs');

function fix(file) {
    let code = fs.readFileSync(file, 'utf8');
    code = code.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    fs.writeFileSync(file, code);
}
fix('./engine/src/engine/bot/BotKnowledge.ts');
fix('./engine/src/engine/bot/tasks/HerbloreTask.ts');
