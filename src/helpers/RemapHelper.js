'use strict';

export const ATTRIBUTES = ['perception', 'memory', 'willpower', 'intelligence', 'charisma'];
export const MIN_ATTRIBUTE = 17;
export const MAX_ATTRIBUTE = 27;
export const REMAP_POINTS = 14;   // spread over the five attributes on top of 17 each

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
