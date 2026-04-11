import * as fs from 'fs';
import * as path from 'path';
import BotPlayer from '../BotPlayer.js';
import { BotUtils } from '../utils/BotUtils.js';

interface Reply {
    text: string;
    weight: number;
}

interface Category {
    patterns: string[];
    replies: Reply[];
}

export class ChatEngine {
    private static responses: Record<string, Category> = {};

    static init() {
        try {
            // Adjust the path to where you ultimately store your JSON in the server structure
            const dataPath = path.resolve(process.cwd(), 'data/chat_responses.json');
            const fileData = fs.readFileSync(dataPath, 'utf-8');
            this.responses = JSON.parse(fileData);
            console.log('[ChatEngine] Loaded chat_responses.json');
        } catch (e) {
            console.warn('[ChatEngine] Could not load chat_responses.json. Bots will be mute.');
        }
    }

    /**
     * Determines if a bot should reply, evaluates the message against patterns,
     * selects a weighted reply, and executes it with a simulated human typing delay.
     */
    static processMessage(bot: BotPlayer, speakerId: string, message: string): void {
        const msgLower = message.toLowerCase();
        
        // 1. Evaluate "First Contact"
        // If the bot hasn't spoken to this person in the last 5 minutes, it has a high chance to reply.
        const now = Date.now();
        const lastContact = bot.memory.lastContactTime || 0;
        const isFirstContact = (now - lastContact) > 300000; // 5 minutes
        
        // If it's not first contact, add a random chance to ignore them so the bot isn't spammy
        if (!isFirstContact && Math.random() > 0.6) {
            return;
        }

        // 2. Find matching category based on patterns
        let selectedCategory = this.responses["generic_statements"]; // Default fallback
        for (const [key, category] of Object.entries(this.responses)) {
            if (key === "generic_statements") continue;

            const isMatch = category.patterns.some(pattern => {
                const regex = new RegExp(`\\b${pattern}\\b`, 'i');
                return regex.test(msgLower);
            });

            if (isMatch) {
                selectedCategory = category;
                break;
            }
        }

        if (!selectedCategory) return;

        // 3. Weighted Random Selection for Reply
        let replyText = this.getWeightedRandomReply(selectedCategory.replies);

        // 3.5. Parse dynamic variables (like skill levels)
        replyText = this.parseVariables(bot, replyText);

        // 4. Simulate human typing delay (WPM based)
        // Assume an average of 4 chars per second (250ms per char) + basic reaction time
        const typingDelayMs = 1500 + (replyText.length * 200);

        bot.memory.lastSpeakerId = speakerId;
        bot.memory.lastMessage = message;
        bot.memory.lastContactTime = now;
        bot.memory.isTyping = true;

        setTimeout(() => {
            // Verify bot still exists / hasn't disconnected
            if (bot && bot.memory) {
                bot.memory.isTyping = false;
                BotUtils.speakPublicly(bot, replyText);
            }
        }, typingDelayMs);
    }

    /**
     * Replaces template tags like {wc_level} with the bot's actual in-game stats.
     */
    private static parseVariables(bot: BotPlayer, text: string): string {
        // baseLevels index mapping (LostCity standard)
        // 8 = Woodcutting, 10 = Fishing, 14 = Mining, etc.
        
        return text
            .replace(/{wc_level}/g, bot.baseLevels[8]?.toString() || '1')
            .replace(/{fish_level}/g, bot.baseLevels[10]?.toString() || '1')
            .replace(/{mine_level}/g, bot.baseLevels[14]?.toString() || '1')
            .replace(/{combat_level}/g, bot.combatLevel?.toString() || '3')
            .replace(/{name}/g, bot.username);
    }

    private static getWeightedRandomReply(replies: Reply[]): string {
        const totalWeight = replies.reduce((sum, reply) => sum + reply.weight, 0);
        let random = Math.random() * totalWeight;

        for (const reply of replies) {
            random -= reply.weight;
            if (random <= 0) {
                return reply.text;
            }
        }
        return replies[0].text; // Fallback
    }
}
