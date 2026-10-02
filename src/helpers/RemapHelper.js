'use strict';

export const ATTRIBUTES = ['perception', 'memory', 'willpower', 'intelligence', 'charisma'];
export const MIN_ATTRIBUTE = 17;
export const MAX_ATTRIBUTE = 27;
export const REMAP_POINTS = 14;   // spread over the five attributes on top of 17 each
export const REMAP_COOLDOWN = 365 * 24 * 3600 * 1000;   // between yearly remaps
// a second remap is only suggested if it saves at least this much
const MIN_SECOND_REMAP_SAVING = 24 * 3600 * 1000;

export default class RemapHelper {
    /**
     * The skills a remap affects: from the remap (or the start of the plan) up to the next remap.
     *
     * @param {array} queue plan queue items
     * @param {number|undefined} remapIndex index of the remap, or undefined for a remap at the start of the plan
     */
    static sectionAfter(queue, remapIndex) {
        const start = remapIndex === undefined ? 0 : remapIndex + 1;
        const skills = [];

        for (let i = start; i < queue.length; i++) {
            if (queue[i].type === 'remap') {
                break;
            }
            if (queue[i].type === 'skill') {
                skills.push(queue[i]);
            }
        }

        return skills;
    }

    // SP still to train, totalled per primary/secondary attribute pair.
    static spByPair(skills) {
        const pairs = {};
        for (const s of skills) {
            const key = `${s.primaryAttribute}/${s.secondaryAttribute}`;
            pairs[key] = pairs[key] || {primary: s.primaryAttribute, secondary: s.secondaryAttribute, sp: 0};
            pairs[key].sp += s.sp || 0;
        }
        return Object.values(pairs);
    }

    /**
     * Training time in ms for the skills with the given base attributes plus a flat implant bonus.
     * Alpha clones train at half speed.
     */
    static trainingTime(skills, attributes, implants = 0, isOmega = true) {
        return RemapHelper.timeForPairs(RemapHelper.spByPair(skills), attributes, implants, isOmega);
    }

    static timeForPairs(pairs, attributes, implants, isOmega) {
        let hours = 0;
        for (const p of pairs) {
            const spPerHour = ((attributes[p.primary] + implants) + (attributes[p.secondary] + implants) / 2) * 60;
            hours += p.sp / (isOmega ? spPerHour : spPerHour / 2);
        }
        return hours * 3600 * 1000;
    }

    /**
     * For skills that take longer than a year even with the best remap: the best place for a second remap, once the
     * yearly remap is available again (at least REMAP_COOLDOWN after the first). Every skill boundary from a year in
     * is tried, with each side optimised separately; the split with the shortest total wins.
     *
     * @returns {object|undefined} {first, second: {attributes, time}, splitAfter: index into skills of the last skill
     *          before the second remap, firstDuration, time, saving} or undefined if the plan is under a year or a
     *          second remap wouldn't save at least a day
     */
    static optimiseSecondRemap(skills, implants = 0, isOmega = true, current = undefined) {
        const single = RemapHelper.optimise(skills, implants, isOmega, current);
        if (skills.length < 2 || single.time <= REMAP_COOLDOWN) {
            return undefined;
        }

        // the first remap's own optimum is fastest for what comes before the split, so no split before the point
        // where even that reaches a year can work; start there
        let elapsed = 0;
        let start = skills.length;
        for (let i = 0; i < skills.length; i++) {
            elapsed += RemapHelper.trainingTime([skills[i]], single.attributes, implants, isOmega);
            if (elapsed >= REMAP_COOLDOWN) {
                start = i;
                break;
            }
        }

        let best;
        for (let i = start; i < skills.length - 1; i++) {
            const before = skills.slice(0, i + 1);
            const first = RemapHelper.optimise(before, implants, isOmega, current);
            // the second remap has to wait for the cooldown
            if (first.time < REMAP_COOLDOWN) {
                continue;
            }
            const second = RemapHelper.optimise(skills.slice(i + 1), implants, isOmega, first.attributes);
            const time = first.time + second.time;

            if (best === undefined || time < best.time - 1000) {
                best = {first, second, splitAfter: i, firstDuration: first.time, time};
            }
        }

        if (best === undefined || single.time - best.time < MIN_SECOND_REMAP_SAVING) {
            return undefined;
        }
        return {...best, saving: single.time - best.time};
    }

    /**
     * Fastest remap for the skills. Every legal split of the 14 points is tried (a few thousand), so the result is
     * the true optimum. Ties keep the split closest to `current`, so no pointless changes are suggested.
     *
     * @returns {{attributes: object, time: number}}
     */
    static optimise(skills, implants = 0, isOmega = true, current = undefined) {
        const pairs = RemapHelper.spByPair(skills);
        const extra = MAX_ATTRIBUTE - MIN_ATTRIBUTE;
        let best;

        const distance = attrs => (current === undefined ? 0 :
            ATTRIBUTES.reduce((d, a) => d + Math.abs(attrs[a] - current[a]), 0));

        for (let p = 0; p <= extra; p++) {
            for (let m = 0; m <= extra && p + m <= REMAP_POINTS; m++) {
                for (let w = 0; w <= extra && p + m + w <= REMAP_POINTS; w++) {
                    for (let i = 0; i <= extra && p + m + w + i <= REMAP_POINTS; i++) {
                        const c = REMAP_POINTS - p - m - w - i;
                        if (c > extra) {
                            continue;
                        }

                        const attrs = {
                            perception: MIN_ATTRIBUTE + p,
                            memory: MIN_ATTRIBUTE + m,
                            willpower: MIN_ATTRIBUTE + w,
                            intelligence: MIN_ATTRIBUTE + i,
                            charisma: MIN_ATTRIBUTE + c,
                        };
                        const time = RemapHelper.timeForPairs(pairs, attrs, implants, isOmega);

                        // under a second apart counts as a tie
                        if (best === undefined || time < best.time - 1000
                            || (Math.abs(time - best.time) <= 1000 && distance(attrs) < distance(best.attributes))) {
                            best = {attributes: attrs, time};
                        }
                    }
                }
            }
        }

        return best;
    }
}
