'use strict';

import ShipData from '../../resources/ships';
import PlanCharacter from '../models/PlanCharacter';

const LEVELS = ['', 'I', 'II', 'III', 'IV', 'V'];

// Ships from EVE's static data (resources/ships.js, see scripts/update-ships.js) and what a character needs to fly them.
export default class ShipHelper {
    static all() {
        return Object.values(ShipData.ships);
    }

    static get(typeId) {
        return ShipData.ships[typeId];
    }

    static raceName(raceId) {
        return ShipData.races[raceId] || 'Other';
    }

    static races() {
        return ShipData.races;
    }

    static levelName(level) {
        return LEVELS[level] || String(level);
    }

    // the character's trained level of a skill (0 when not injected)
    static trainedLevel(character, skillId) {
        const skill = (character.skills || []).find(s => s.skill_id === skillId);
        return skill !== undefined ? skill.trained_skill_level : 0;
    }

    // Whether the character has every skill the ship needs at the level it needs (their prerequisites come with them).
    static canFly(character, ship) {
        return ship.skills.every(req => ShipHelper.trainedLevel(character, req.id) >= req.level);
    }

    /**
     * What the character still has to train for each ship, planned from its current skills (with an active
     * accelerator, as plans count it): {[typeId]: {time (ms), queue (PlanCharacter skill items)}}. One
     * PlanCharacter is reused, so the whole list takes a fraction of a second.
     */
    static trainingNeeded(characterId) {
        const planCharacter = new PlanCharacter(characterId);
        const result = {};
        for (const ship of ShipHelper.all()) {
            planCharacter.reset();
            ship.skills.forEach(req => planCharacter.planSkill(req.id, req.level));
            result[ship.type_id] = {time: planCharacter.time, queue: planCharacter.queue.slice()};
        }
        return result;
    }
}
