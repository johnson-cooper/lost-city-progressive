import Player from '#/engine/entity/Player.js';
import InvType from '#/cache/config/InvType.js';
import { randInt } from '#/engine/bot/tasks/BotTaskBase.js';

const SKIN_TONES = [0, 1, 2, 3, 4, 5];

const GENDERS = {
    MALE: 0,
    FEMALE: 1
};



const STARTER_WEAPONS = [1277, 1279, 1321, 1203, 1171, 1173];

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function item(id: number) {
    return { id, count: 1 };
}

export class BotAppearance {

    static randomize(player: Player): void {

        const worn = player.getInventory(InvType.WORN);
        if (!worn) throw new Error("WORN inventory missing");

        // gender
        const gender = Math.random() < 0.5 ? GENDERS.MALE : GENDERS.FEMALE;
        player.gender = gender;

        // appearance

        worn.set(3, item(pick(STARTER_WEAPONS))); // weapon

        player.buildAppearance(InvType.WORN);
    }
}
