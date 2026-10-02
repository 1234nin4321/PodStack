'use strict';

import PlanCharacter from '../models/PlanCharacter';
import SkillPlanStore from './SkillPlanStore';
import {REMAP_COOLDOWN} from './RemapHelper';

import AllSkills from '../../resources/all_skills';

export default class SkillPlanHelper {
    static newPlanId() {
        return crypto.randomUUID();
    }

    /**
     * Reorders a plan so the skills that train fastest for this character come first, without ever putting a skill
     * ahead of its prerequisites or a level ahead of the level below it.
     *
     * Remaps and notes stay where they are and split the plan into sections that are sorted separately: a remap
     * changes training speed from that point on, and notes usually head a group of skills (e.g. a fit).
     *
     * @param {PlanCharacter} planCharacter Holds the plan to sort; its queue and times are rebuilt in place.
     */
    static sortByTrainingTime(planCharacter) {
        const sorted = [];
        let section = [];

        for (const item of planCharacter.queue) {
            if (item.type === 'skill') {
                section.push(item);
            } else {
                sorted.push(...SkillPlanHelper.sortSection(section), item);
                section = [];
            }
        }
        sorted.push(...SkillPlanHelper.sortSection(section));

        planCharacter.reset();
        sorted.forEach(item => planCharacter.addItemToQueue(item));
    }

    // Topological sort of one section's skills, always picking the quickest skill whose requirements are met.
    // Attributes don't change within a section, so each skill's training time doesn't depend on the order.
    static sortSection(items) {
        const blockers = items.map((item, i) => {
            const prerequisites = (AllSkills.skills[item.id] || {}).required_skills || [];

            return new Set(items
                .map((other, j) => j)
                .filter(j => j !== i && (
                    // lower level of the same skill
                    (items[j].id === item.id && items[j].level < item.level) ||
                    // a prerequisite, up to the level this skill needs
                    prerequisites.some(req => req.id === items[j].id && items[j].level <= req.level)
                )));
        });

        const done = new Set();
        const result = [];

        while (result.length < items.length) {
            let next = -1;
            items.forEach((item, i) => {
                if (done.has(i) || [...blockers[i]].some(j => !done.has(j))) {
                    return;
                }
                // ties keep the original order
                if (next === -1 || item.time < items[next].time) {
                    next = i;
                }
            });

            if (next === -1) {
                // can't happen with a valid plan, but never drop skills: keep the rest in their current order
                items.forEach((item, i) => !done.has(i) && result.push(item));
                break;
            }

            done.add(next);
            result.push(items[next]);
        }

        return result;
    }

    // For each skill item, the indexes of the skill items it must come after: the level below it, and its
    // prerequisites up to the level it needs.
    static blockersOf(items) {
        return items.map((item, i) => {
            if (item.type !== 'skill') {
                return new Set();
            }
            const prerequisites = (AllSkills.skills[item.id] || {}).required_skills || [];
            return new Set(items
                .map((other, j) => j)
                .filter(j => j !== i && items[j].type === 'skill' && (
                    (items[j].id === item.id && items[j].level < item.level) ||
                    prerequisites.some(req => req.id === items[j].id && items[j].level <= req.level)
                )));
        });
    }

    /**
     * Looks for an order of the plan that trains it all sooner, keeping every skill after its prerequisites and the
     * level below it. With the same attributes throughout, order makes no difference (each level takes its SP over
     * its speed wherever it is), so only two things can save time:
     *  - remaps in the plan: each skill goes in the remap section that trains it fastest (remaps keep their order);
     *  - an active accelerator: its bonus adds the same SP/hour to every skill, which helps the slowest skills most,
     *    so those go first while it lasts.
     * Notes move with the item below them. A yearly remap is never pulled to less than a year after the last one.
     *
     * @returns {object} {queue (the new order, to add to a reset PlanCharacter), time, before (ms), moved (skills
     *          now in another remap section)}, or undefined when no order is faster
     */
    static optimiseOrder(planCharacter) {
        const characterId = planCharacter.id;
        const original = planCharacter.queue.slice();
        const before = planCharacter.time;

        // units: skills and remaps, each with the notes just above it; notes at the very end stay there
        const units = [];
        let notes = [];
        for (const item of original) {
            if (item.type === 'note') {
                notes.push(item);
            } else {
                units.push({item, notes});
                notes = [];
            }
        }
        const trailingNotes = notes;

        const items = units.map(u => u.item);
        const remapIndexes = items.map((item, i) => item.type === 'remap' ? i : -1).filter(i => i >= 0);
        const sectionCount = remapIndexes.length + 1;
        const originalSection = items.map((item, i) => remapIndexes.filter(r => r < i).length);

        // attributes of each section: the character's own (without an accelerator), then each remap's with its implants
        const base = new PlanCharacter(characterId, {accelerator: false}).attributes;
        const sectionAttributes = [base, ...remapIndexes.map(i => {
            const attributes = {};
            Object.keys(items[i].attributes).forEach(a => attributes[a] = items[i].attributes[a] + items[i].implants);
            return attributes;
        })];
        const rate = (item, k) => sectionAttributes[k][item.primaryAttribute] + sectionAttributes[k][item.secondaryAttribute] / 2;
        const cost = (item, k) => item.sp / rate(item, k);

        const blockers = SkillPlanHelper.blockersOf(items);
        const dependents = items.map((item, i) => items.map((o, j) => j).filter(j => blockers[j].has(i)));
        const skillIdx = items.map((item, i) => i).filter(i => items[i].type === 'skill');

        // best section among the allowed ones; ties keep the current section, else the earliest
        const pick = (i, from, to) => {
            let best;
            for (let k = from; k <= to; k++) {
                if (best === undefined || cost(items[i], k) < cost(items[i], best) - 1e-9 ||
                    (Math.abs(cost(items[i], k) - cost(items[i], best)) <= 1e-9 && k === originalSection[i])) {
                    best = k;
                }
            }
            return best;
        };

        // two greedy passes (prerequisites first, and dependents first) plus the plan's own sections
        const forward = originalSection.slice();
        for (const i of skillIdx) {
            const from = Math.max(0, ...[...blockers[i]].map(j => forward[j]));
            forward[i] = pick(i, from, sectionCount - 1);
        }
        const backward = originalSection.slice();
        for (const i of skillIdx.slice().reverse()) {
            const to = Math.min(sectionCount - 1, ...dependents[i].map(j => backward[j]));
            backward[i] = pick(i, 0, to);
        }

        const build = sections => {
            const order = [];
            for (let k = 0; k < sectionCount; k++) {
                if (k > 0) {
                    const r = units[remapIndexes[k - 1]];
                    order.push(...r.notes, r.item);
                }
                // within a section: requirements first; while an accelerator lasts (section 0), slowest skills first
                const inSection = skillIdx.filter(i => sections[i] === k);
                const slowestFirst = k === 0 && planCharacter.accelerator !== undefined;
                const done = new Set(skillIdx.filter(i => sections[i] < k));
                while (inSection.some(i => !done.has(i))) {
                    let next;
                    for (const i of inSection) {
                        if (done.has(i) || [...blockers[i]].some(j => !done.has(j))) {
                            continue;
                        }
                        if (next === undefined || (slowestFirst && rate(items[i], 0) < rate(items[next], 0))) {
                            next = i;
                        }
                    }
                    if (next === undefined) {
                        return undefined;   // a requirement ended up later: not a valid order
                    }
                    done.add(next);
                    order.push(...units[next].notes, items[next]);
                }
            }
            return [...order, ...trailingNotes];
        };

        // when each remap happens: time since the last one, just before it
        const remapGaps = queue => {
            const gaps = [];
            let last = planCharacter.lastRemapAtStart;
            for (const item of queue) {
                if (item.type === 'remap') {
                    gaps.push(last);
                } else if (item.type === 'skill') {
                    last = item.lastRemap;
                }
            }
            return gaps;
        };
        const originalGaps = remapGaps(original);
        const skillCount = original.filter(i => i.type === 'skill').length;

        let best;
        for (const sections of [originalSection, forward, backward]) {
            const order = build(sections);
            if (order === undefined) {
                continue;
            }
            const trial = new PlanCharacter(characterId);
            order.forEach(item => trial.addItemToQueue(item));
            // same skills (nothing pulled in as a prerequisite), no yearly remap made too early
            const gaps = remapGaps(trial.queue);
            const valid = trial.queue.filter(i => i.type === 'skill').length === skillCount &&
                gaps.every((gap, r) => !(originalGaps[r] >= REMAP_COOLDOWN && gap < REMAP_COOLDOWN));
            if (valid && (best === undefined || trial.time < best.time)) {
                best = {queue: trial.queue, time: trial.time, sections};
            }
        }

        // worth it only if it saves at least a minute
        if (best === undefined || best.time > before - 60 * 1000) {
            return undefined;
        }
        return {
            queue: best.queue,
            time: best.time,
            before,
            moved: skillIdx.filter(i => best.sections[i] !== originalSection[i]).length,
        };
    }

    /**
     * Builds the character's training queue: every switched-on plan in priority order, combined. A skill that an
     * earlier plan already trains isn't repeated. Each item gets planId and planName saying where it came from.
     *
     * @returns {{queue: array, time: number, plans: array}} plans lists the plans that were included
     */
    static buildTrainingQueue(characterId) {
        const plans = SkillPlanStore.getSkillPlansForCharacter(characterId).filter(p => p.enabled);
        const planCharacter = new PlanCharacter(characterId);

        for (const plan of plans) {
            const start = planCharacter.queue.length;
            SkillPlanStore.getSkillPlan(characterId, plan.id).queue.forEach(item => planCharacter.addItemToQueue(item));

            planCharacter.queue.slice(start).forEach(item => {
                item.planId = plan.id;
                item.planName = plan.name;
            });
        }

        return {queue: planCharacter.queue, time: planCharacter.time, plans};
    }

    /**
     * Combines plans, in the order given, into a new plan. The originals are left as they are. Each plan's skills
     * are headed by a note naming it, and skills an earlier plan already covers aren't repeated.
     *
     * @returns {string} id of the new plan
     */
    static mergePlans(characterId, planIds, name) {
        const planCharacter = new PlanCharacter(characterId);

        for (const planId of planIds) {
            const plan = SkillPlanStore.getSkillPlan(characterId, planId);
            if (plan === undefined) {
                continue;
            }

            planCharacter.addNote(plan.name, 'Merged plan');
            plan.queue.forEach(item => planCharacter.addItemToQueue(item));
        }

        const newId = SkillPlanHelper.newPlanId();
        SkillPlanStore.storeSkillPlan(characterId, newId, name, planCharacter.queue);
        return newId;
    }
}
