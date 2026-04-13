const fs = require('fs');
const content = fs.readFileSync('engine/src/engine/entity/Player.ts', 'utf8');

const search = `  processIntent(message: string): string {
    const data = loadChatResponses();
    const msg = message.toLowerCase();

    // Greetings
    if (data.greetings.patterns.some(p => msg.includes(p))) {`;

const replace = `  checkSkillLevelIntent(msg: string): string | null {
    if (!msg.includes('level') && !msg.includes('lvl')) {
        return null;
    }

    // Check for "total level"
    if (msg.includes('total')) {
        let total = 0;
        for (let stat = 0; stat < this.baseLevels.length; stat++) {
            total += this.baseLevels[stat];
        }
        return \`My total level is \${total}.\`;
    }

    // Common abbreviations map to their full skill name keys in PlayerStatMap
    const skillAbbreviations: Record<string, string> = {
        'wc': 'WOODCUTTING',
        'hp': 'HITPOINTS',
        'rc': 'RUNECRAFT',
        'herb': 'HERBLORE',
        'mage': 'MAGIC',
        'str': 'STRENGTH',
        'att': 'ATTACK',
        'def': 'DEFENCE',
        'pray': 'PRAYER',
        'fish': 'FISHING',
        'cook': 'COOKING',
        'fletch': 'FLETCHING',
        'fm': 'FIREMAKING',
        'craft': 'CRAFTING',
        'smith': 'SMITHING',
        'mine': 'MINING',
        'agil': 'AGILITY',
        'thiev': 'THIEVING'
    };

    const words = msg.replace(/[?!.]/g, '').split(' ');
    for (const word of words) {
        let statKey = null;

        // Check against abbreviations
        if (skillAbbreviations[word]) {
            statKey = skillAbbreviations[word];
        } else {
            // Check against full skill names (case-insensitive)
            const upperWord = word.toUpperCase();
            if (PlayerStatMap.has(upperWord)) {
                statKey = upperWord;
            }
        }

        if (statKey) {
            const stat = PlayerStatMap.get(statKey);
            if (stat !== undefined && stat < this.baseLevels.length) {
                return \`My \${statKey.toLowerCase()} level is \${this.baseLevels[stat]}.\`;
            }
        }
    }

    return null;
  }

  processIntent(message: string): string {
    const data = loadChatResponses();
    const msg = message.toLowerCase();

    const skillResponse = this.checkSkillLevelIntent(msg);
    if (skillResponse) {
        return skillResponse;
    }

    // Greetings
    if (data.greetings.patterns.some(p => msg.includes(p))) {`;

const newContent = content.replace(search, replace);
fs.writeFileSync('engine/src/engine/entity/Player.ts', newContent);
