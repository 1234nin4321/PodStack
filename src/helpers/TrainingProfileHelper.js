'use strict';

import Character from '../models/Character';
import PlanCharacter from '../models/PlanCharacter';

import AllSkills from '../../resources/all_skills';

// Dogma attributes holding an implant's bonus to each character attribute.
const IMPLANT_BONUS_ATTRIBUTES = {
    charisma: 175,
    intelligence: 176,
    memory: 177,
    perception: 178,
    willpower: 179,
};
const ATTRIBUTES = Object.keys(IMPLANT_BONUS_ATTRIBUTES);

export const CURRENT_CLONE = 'current';

export default class TrainingProfileHelper {
    /**
     * Skills in a queue the character hasn't injected yet, i.e. the skillbooks they still need.
     * Injected but untrained skills are listed by EVE with level 0, so they don't count.
     *
     * @returns {array} [{id, name}] sorted by name
     */
    static getMissingSkillbooks(characterId, queue) {
        const character = Character.get(characterId);
        const injected = new Set((character.skills || []).map(s => s.skill_id));
        const needed = new Map();

        queue.forEach(item => {
            if (item.type === 'skill' && !injected.has(item.id) && AllSkills.skills[item.id] !== undefined) {
                needed.set(item.id, {id: item.id, name: AllSkills.skills[item.id].name});
            }
        });

        return [...needed.values()].sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Current implant bonus per attribute. EVE reports attributes with implants already included, so subtracting
     * these gives the character's base (remapped) attributes.
     */
    static getImplantBonuses(characterId) {
        const bonuses = {};
        ATTRIBUTES.forEach(a => bonuses[a] = 0);

        for (const implant of Character.get(characterId).implants || []) {
            for (const attr of implant.dogmaAttributes || []) {
                ATTRIBUTES.forEach(a => {
                    if (attr.attribute_id === IMPLANT_BONUS_ATTRIBUTES[a]) {
                        bonuses[a] += attr.value;
                    }
                });
            }
        }

        return bonuses;
    }

    static getBaseAttributes(characterId) {
        const attributes = Character.get(characterId).attributes;
        const bonuses = TrainingProfileHelper.getImplantBonuses(characterId);

        const base = {};
        ATTRIBUTES.forEach(a => base[a] = (attributes[a] || 0) - bonuses[a]);
        return base;
    }

    /**
     * Training time of a queue under a clone setup.
     *
     * @param {string} characterId
     * @param {array} queue PlanCharacter queue items (skills, remaps, notes)
     * @param {string|number} implants CURRENT_CLONE for the character's actual implants, or an implant set bonus
     *                                  (0-5) applied to every attribute in place of them
     * @param {object} accelerator optional {bonus, days}: a cerebral accelerator adding bonus to every attribute
     *                             for the first `days` days of training
     * @returns {number} training time in ms
     */
    static simulate(characterId, queue, implants, accelerator) {
        const withoutBooster = TrainingProfileHelper.itemTimes(characterId, queue, implants, 0);

        if (accelerator === undefined || !(accelerator.bonus > 0) || !(accelerator.days > 0)) {
            return withoutBooster.reduce((total, t) => total + t, 0);
        }

        // SP accrues linearly, so a skill straddling the expiry trains the boosted share at the boosted rate
        // and the rest at the normal rate.
        const boosted = TrainingProfileHelper.itemTimes(characterId, queue, implants, accelerator.bonus);
        const window = accelerator.days * 24 * 3600 * 1000;
        let elapsed = 0;

        boosted.forEach((fast, i) => {
            const remainingWindow = Math.max(0, window - elapsed);
            if (fast <= remainingWindow) {
                elapsed += fast;
            } else {
                const doneWhileBoosted = fast > 0 ? remainingWindow / fast : 1;
                elapsed += remainingWindow + (1 - doneWhileBoosted) * withoutBooster[i];
            }
        });

        return elapsed;
    }

    // Per-skill training times with the given implants and an extra flat bonus, in queue order (skills only).
    static itemTimes(characterId, queue, implants, extraBonus) {
        const planCharacter = new PlanCharacter(characterId);
        const base = TrainingProfileHelper.getBaseAttributes(characterId);

        if (implants === CURRENT_CLONE) {
            ATTRIBUTES.forEach(a => planCharacter.attributes[a] += extraBonus);
        } else {
            ATTRIBUTES.forEach(a => planCharacter.attributes[a] = base[a] + implants + extraBonus);
        }

        const times = [];
        for (const item of queue) {
            if (item.type === 'remap') {
                // a remap sets new base attributes; implants and booster still apply on top
                const remapImplants = implants === CURRENT_CLONE ? item.implants : implants;
                planCharacter.addRemap(item.attributes, remapImplants + extraBonus);
            } else if (item.type === 'skill') {
                const before = planCharacter.queue.length;
                planCharacter.planSkill(item.id, item.level);
                planCharacter.queue.slice(before).forEach(q => times.push(q.time));
            }
        }

        return times;
    }
}
