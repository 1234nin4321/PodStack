'use strict';

import PlanCharacter from '../models/PlanCharacter';
import SkillPlanStore from './SkillPlanStore';

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
