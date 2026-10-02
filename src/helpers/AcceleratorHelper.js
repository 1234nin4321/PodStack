'use strict';

// Detects an active cerebral accelerator and estimates when it runs out.
//
// ESI doesn't say which booster a character is using, so the bonus is worked out two ways, and either is enough:
//  * attributes: base (remapped) attributes always add up to 99 (17 each plus 14 to spread), so whatever ESI's
//    attributes hold beyond that and the implants' bonuses, divided by five, is an accelerator's bonus;
//  * training speed: the skill queue gives the speed the current skill really trains at; if that's faster than the
//    attributes explain, the difference is an accelerator the attributes don't include.
//
// ESI doesn't give the end time either. The start is taken as when the bonus was first seen (or, when it shows in
// the training speed, when the current skill's training was last recalculated, which happens when one is plugged
// in), the duration from the accelerator the player picks among those with that bonus, extended by Biology.

import AllSkills from '../../resources/all_skills';
import {ACCELERATORS} from '../../resources/clone_items';

const ATTRIBUTES = ['perception', 'memory', 'willpower', 'intelligence', 'charisma'];
// dogma attributes implants (and boosters) add to the character's attributes
const BONUS_ATTRIBUTES = {charisma: 175, intelligence: 176, memory: 177, perception: 178, willpower: 179};
const BASE_TOTAL = 5 * 17 + 14;
const BIOLOGY = 3405;
const BIOLOGY_BONUS = 0.2;   // booster duration per level
const DAY = 24 * 3600 * 1000;
// a bonus seen this long ago or more can't still be from the same accelerator (the longest lasts 12.5 days, +100%)
const MAX_DURATION = 25 * DAY;

function implantBonus(character) {
    let total = 0;
    for (const implant of character.implants || []) {
        for (const attr of implant.dogmaAttributes || []) {
            if (Object.values(BONUS_ATTRIBUTES).includes(attr.attribute_id)) {
                total += attr.value;
            }
        }
    }
    return total;
}

export default class AcceleratorHelper {
    /**
     * @returns {object} {bonus, source: 'attributes'|'training'} of an active accelerator, or {bonus: 0}
     */
    static detect(character) {
        const attributes = character.attributes;
        if (attributes === undefined || character.implants === undefined) {
            return {bonus: 0};
        }

        // attributes beyond the base total and the implants
        const leftover = ATTRIBUTES.reduce((sum, a) => sum + (attributes[a] || 0), 0) - BASE_TOTAL - implantBonus(character);
        if (leftover > 0 && leftover % 5 === 0) {
            return {bonus: leftover / 5, source: 'attributes'};
        }

        // training faster than the attributes allow (Omega only: Alpha clones train at a reduced speed)
        const skill = character.getCurrentSkill();
        const info = skill !== undefined ? AllSkills.skills[skill.skill_id] : undefined;
        if (info !== undefined && character.isOmega() === true) {
            const hours = (new Date(skill.finish_date) - new Date(skill.start_date)) / 3600000;
            const spPerHour = (skill.level_end_sp - skill.training_start_sp) / hours;
            const primary = attributes[info.primary_attribute];
            const secondary = attributes[info.secondary_attribute];
            if (hours > 0.25 && spPerHour > 0 && primary > 0) {
                const bonus = (spPerHour / 60 - primary - secondary / 2) / 1.5;
                if (bonus >= 0.8 && Math.abs(bonus - Math.round(bonus)) < 0.2) {
                    return {bonus: Math.round(bonus), source: 'training'};
                }
            }
        }

        return {bonus: 0};
    }

    /**
     * Updates character.accelerator after a refresh: started when a bonus appears (or changes), cleared when it's
     * gone. The player's choice of accelerator and start time are kept while the same bonus stays active.
     */
    static update(character, now = Date.now()) {
        const {bonus, source} = AcceleratorHelper.detect(character);
        const previous = character.accelerator;

        if (bonus === 0) {
            if (previous !== undefined) {
                character.lastAccelerator = {...previous, endedSeen: now};
            }
            character.accelerator = undefined;
            return;
        }
        if (previous !== undefined && previous.bonus === bonus && now - previous.estimatedStart < MAX_DURATION) {
            character.accelerator = {...previous, source};
            return;
        }

        let estimatedStart = now;
        const skill = character.getCurrentSkill();
        if (source === 'training' && skill !== undefined) {
            const start = new Date(skill.start_date).getTime();
            if (start <= now && now - start < MAX_DURATION) {
                estimatedStart = start;
            }
        }
        character.accelerator = {bonus, source, firstSeen: now, estimatedStart};
    }

    // the accelerators that give this bonus, for the player to pick from
    static candidates(bonus) {
        return ACCELERATORS.filter(a => a.bonus === bonus);
    }

    static biologyLevel(character) {
        const biology = (character.skills || []).find(s => s.skill_id === BIOLOGY);
        return biology !== undefined ? biology.active_skill_level : 0;
    }

    /**
     * @returns {object|undefined} {bonus, item (the picked or likeliest accelerator), start: Date, end: Date,
     *          remaining (ms, may be negative if it should have ended), estimated (the start wasn't set by the player),
     *          biology} for an active accelerator, or undefined
     */
    static status(character, now = Date.now()) {
        const state = character.accelerator;
        if (state === undefined) {
            return undefined;
        }

        const candidates = AcceleratorHelper.candidates(state.bonus);
        // the player's pick, else the regular store accelerator of that bonus ('Boost'), else the first match
        const item = candidates.find(a => a.typeId === state.typeId) ||
            candidates.find(a => / 'Boost' /.test(a.name)) || candidates[0];
        const biology = AcceleratorHelper.biologyLevel(character);
        const start = new Date(state.start !== undefined ? state.start : state.estimatedStart);

        if (item === undefined) {
            return {bonus: state.bonus, item: undefined, start, end: undefined, remaining: undefined, estimated: state.start === undefined, biology};
        }

        const duration = item.days * DAY * (1 + BIOLOGY_BONUS * biology);
        const end = new Date(start.getTime() + duration);
        return {bonus: state.bonus, item, start, end, remaining: end - now, estimated: state.start === undefined, biology};
    }

    // the player's corrections: which accelerator it is, and when it was plugged in
    static setChoice(character, changes) {
        if (character.accelerator !== undefined) {
            character.accelerator = {...character.accelerator, ...changes};
            character.save();
        }
    }

    /**
     * When EVE's skill queue stops counting the accelerator. EVE times every queued skill with the accelerator until
     * the moment it expects it to run out, and at the normal speed after: the first entry training slower than
     * boosted marks that moment (inside it, when it straddles the end). This needn't match the accelerator's own
     * timer, so plans use it to come out at the same time as EVE's queue.
     *
     * @returns {Date|undefined} undefined when the queue doesn't show it (nothing queued past the end, or the
     *          speeds don't fit the attributes)
     */
    static queueBoostEnd(character, now = Date.now()) {
        const state = character.accelerator;
        if (state === undefined || character.attributes === undefined || character.isOmega() === false) {
            return undefined;
        }

        const booster = AcceleratorHelper.attributeBonus(character);
        const base = a => (character.attributes[a] || 0) - booster;
        const entries = (character.skillQueue || [])
            .filter(o => o.start_date !== undefined && o.finish_date !== undefined && new Date(o.finish_date) > now)
            .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

        for (const entry of entries) {
            const info = AllSkills.skills[entry.skill_id];
            const start = new Date(entry.start_date).getTime();
            const hours = (new Date(entry.finish_date).getTime() - start) / 3600000;
            const sp = entry.level_end_sp - entry.training_start_sp;
            // entries of a few minutes are too short to tell the speeds apart (EVE's times are whole seconds)
            if (info === undefined || !(hours > 0.25) || !(sp > 0)) {
                continue;
            }

            const normal = (base(info.primary_attribute) + base(info.secondary_attribute) / 2) * 60;
            const boosted = normal + state.bonus * 1.5 * 60;
            const rate = sp / hours;
            if (!(normal > 0)) {
                return undefined;
            }

            if (rate >= boosted * 0.995) {
                continue;
            }
            if (rate <= normal * 1.005) {
                return new Date(start);
            }
            if (rate < boosted) {
                // straddles the end: boostedHours at the boosted speed, the rest at the normal one
                const boostedHours = (sp - normal * hours) / (boosted - normal);
                return new Date(start + boostedHours * 3600000);
            }
            return undefined;
        }

        return undefined;
    }

    /**
     * The active accelerator as plans count it: its bonus, and how long from now it applies (EVE's skill queue's
     * idea of that when it shows it, else the accelerator's estimated end).
     *
     * @returns {object|undefined} {bonus, end: Date, remaining: ms}, or undefined when there's none left
     */
    static planWindow(character, now = Date.now()) {
        const status = AcceleratorHelper.status(character, now);
        if (status === undefined) {
            return undefined;
        }

        const end = AcceleratorHelper.queueBoostEnd(character, now) || status.end;
        if (end === undefined || end.getTime() <= now) {
            return undefined;
        }
        return {bonus: status.bonus, end, remaining: end.getTime() - now};
    }

    // bonus the accelerator adds to ESI's attributes (when they include it), so base attributes can be worked out
    static attributeBonus(character) {
        const state = character.accelerator;
        return state !== undefined && state.source === 'attributes' ? state.bonus : 0;
    }
}
