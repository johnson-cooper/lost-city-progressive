import IdkType from '#/cache/config/IdkType.js';
import InvType from '#/cache/config/InvType.js';
import { Items, randInt } from '#/engine/bot/tasks/BotTaskBase.js';
import Player from '#/engine/entity/Player.js';
import { check, IDKTypeValid } from '#/engine/script/ScriptValidators.js';

const SKIN_TONES = [0, 1, 2, 3, 4, 5];
const HAIR_COLOURS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MAN_HAIR_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const MAN_JAW_IDS = [10, 11, 12, 13, 14, 15, 16, 17];
const MAN_TORSO_IDS = [18, 19, 20, 21, 22, 23, 24, 25];
const MAN_ARMS_IDS = [26, 27, 28, 29, 30, 31];
const MAN_HANDS_IDS = [33, 34];
const MAN_LEGS_IDS = [36, 37, 38, 39, 40];
const MAN_FEET_IDS = [42, 43];
const WOMAN_HAIR_IDS = [45, 46, 47, 48, 49, 50, 51, 52, 53, 54];
const WOMAN_TORSO_IDS = [56, 57, 58, 59, 60];
const WOMAN_ARMS_IDS = [61, 62, 63, 64, 65];
const WOMAN_HANDS_IDS = [66, 67];
const WOMAN_FEET_IDS = [68, 69];
const WOMAN_LEGS_IDS = [70, 71, 72, 73, 74, 75, 76, 77];

const GENDERS = {
    MALE: 0,
    FEMALE: 1
};

const STARTER_WEAPONS = [Items.BRONZE_AXE, Items.BRONZE_PICKAXE, Items.BRONZE_SWORD, Items.BRONZE_SCIMITAR, Items.IRON_AXE, Items.IRON_SCIMITAR];

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function item(id: number, player:Player) {
    return { id, count: 1, owner: player?.username };
}

export class BotAppearance {

    static set_appearance(player:Player, idkit:number, color:number) {
        const idkType: IdkType = check(idkit, IDKTypeValid);
        let slot = idkType.type;
        if (player.gender === 1) {
            slot -= 7;
        }
        player.body[slot] = idkType.id;
        // 0 - hair/jaw
        // 1 - torso
        // 2 - legs
        // 3 - boots
        // 4 - skin
        let type = idkType.type;
        if (player.gender === 1) {
            type -= 7;
        }
        let colorSlot = -1;
        if (type === 0 || type === 1) {
            colorSlot = 0;
        } else if (type === 2 || type === 3) {
            colorSlot = 1;
        } else if (type === 4) {
            /* no-op (no hand recoloring) */
        } else if (type === 5) {
            colorSlot = 2;
        } else if (type === 6) {
            colorSlot = 3;
        }
        if (colorSlot !== -1) {
            player.colors[colorSlot] = color;
        }
    }

    static randomize(player: Player): void {

        const worn = player.getInventory(InvType.WORN);
        if (!worn) throw new Error('WORN inventory missing');

        // gender
        const gender = Math.random() < 0.5 ? GENDERS.MALE : GENDERS.FEMALE;
        player.gender = gender;

        // appearance
                if (player.gender === GENDERS.MALE) {
            BotAppearance.set_appearance(player, MAN_HAIR_IDS[randInt(0, MAN_HAIR_IDS.length-1)], HAIR_COLOURS[randInt(0, HAIR_COLOURS.length-1)]);
            BotAppearance.set_appearance(player, MAN_JAW_IDS[randInt(0, MAN_JAW_IDS.length-1)], HAIR_COLOURS[randInt(0, HAIR_COLOURS.length-1)]);
            BotAppearance.set_appearance(player, MAN_TORSO_IDS[randInt(0, MAN_TORSO_IDS.length-1)], HAIR_COLOURS[randInt(0, HAIR_COLOURS.length-1)]);
            BotAppearance.set_appearance(player, MAN_ARMS_IDS[randInt(0, MAN_ARMS_IDS.length-1)], HAIR_COLOURS[randInt(0, HAIR_COLOURS.length-1)]);
            BotAppearance.set_appearance(player, MAN_LEGS_IDS[randInt(0, MAN_LEGS_IDS.length-1)], HAIR_COLOURS[randInt(0, HAIR_COLOURS.length-1)]);
            BotAppearance.set_appearance(player, MAN_FEET_IDS[randInt(0, MAN_FEET_IDS.length-1)], HAIR_COLOURS[randInt(0, HAIR_COLOURS.length-1)]);
            BotAppearance.set_appearance(player, MAN_HANDS_IDS[randInt(0, MAN_HANDS_IDS.length-1)], HAIR_COLOURS[randInt(0, HAIR_COLOURS.length-1)]);
            player.colors[4] = SKIN_TONES[randInt(0, SKIN_TONES.length-1)];
        } else {
            BotAppearance.set_appearance(player, WOMAN_HAIR_IDS[randInt(0, WOMAN_HAIR_IDS.length-1)], HAIR_COLOURS[randInt(0, HAIR_COLOURS.length-1)]);
            BotAppearance.set_appearance(player, MAN_JAW_IDS[4], 0); //Always 0 for women? //4 is bald id
            BotAppearance.set_appearance(player, WOMAN_TORSO_IDS[randInt(0, WOMAN_TORSO_IDS.length-1)], HAIR_COLOURS[randInt(0, HAIR_COLOURS.length-1)]);
            BotAppearance.set_appearance(player, WOMAN_ARMS_IDS[randInt(0, WOMAN_ARMS_IDS.length-1)], HAIR_COLOURS[randInt(0, HAIR_COLOURS.length-1)]);
            BotAppearance.set_appearance(player, WOMAN_LEGS_IDS[randInt(0, WOMAN_LEGS_IDS.length-1)], HAIR_COLOURS[randInt(0, HAIR_COLOURS.length-1)]);
            BotAppearance.set_appearance(player, WOMAN_FEET_IDS[randInt(0, WOMAN_FEET_IDS.length-1)], HAIR_COLOURS[randInt(0, HAIR_COLOURS.length-1)]);
            BotAppearance.set_appearance(player, WOMAN_HANDS_IDS[randInt(0, WOMAN_HANDS_IDS.length-1)], HAIR_COLOURS[randInt(0, HAIR_COLOURS.length-1)]);
            player.colors[4] = SKIN_TONES[randInt(0, SKIN_TONES.length-1)];
        }

        worn.set(3, item(pick(STARTER_WEAPONS), player)); // weapon
        //^ I believe the login script already does this ^

        // Set movement animations so the run-toggle in walkTo works.
        // Without a valid runanim the engine hard-forces MoveSpeed.WALK
        // regardless of player.run, so bots can never run.
        player.readyanim  = 808; // human_ready
        player.walkanim   = 819; // human_walk_f
        player.walkanim_b = 820; // human_walk_b
        player.walkanim_l = 821; // human_walk_l
        player.walkanim_r = 822; // human_walk_r
        player.runanim    = 824; // human_running

        player.buildAppearance(InvType.WORN);
    }
}
