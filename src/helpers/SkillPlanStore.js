'use strict';

import Store from 'electron-store';


let skillPlans = undefined;
const skillPlansStore = new Store({
    name: 'skillplans-store',
});
let skillPlansLastUsed = 0;
let thingsSaveTimeout;

export default class SkillPlanStore {

    /**
     * Retrieves skill plan
     *
     * @param {string}  characterId Character ID
     * @param {string}  planId ID of the plan
     * @returns {object} Plan object or undefined
     */
    static getSkillPlan(characterId, planId) {
        characterId = characterId.toString();

        SkillPlanStore.require();

        skillPlansLastUsed = new Date().getTime();

        if (skillPlans.hasOwnProperty(characterId) && skillPlans[characterId].hasOwnProperty(planId)) {
            return skillPlans[characterId][planId];
        }
        return undefined;
    }

    /**
     * Write skillplan to storage
     *
     * @param {string} characterId Character ID
     * @param {string} planId ID of the plan
     * @param {string} name Name of the plan
     * @param {array} queue Plan queue to store
     */
    static storeSkillPlan(characterId, planId, name, queue) {
        characterId = characterId.toString();

        SkillPlanStore.require();

        if (!skillPlans.hasOwnProperty(characterId)) {
            skillPlans[characterId] = {};
        }

        if (planId !== undefined && !skillPlans[characterId].hasOwnProperty(planId)) {
            skillPlans[characterId][planId] = {
                // new plans go to the bottom of the priority order, switched on
                priority: Object.values(skillPlans[characterId]).reduce((max, p) => Math.max(max, p.priority || 0), 0) + 1,
                enabled: true,
            };
            skillPlans[characterId][planId].queue = [...queue];
            skillPlans[characterId][planId].name = name;
            skillPlans[characterId][planId].lastSaved = new Date().getTime();
        } else if (planId !== undefined && skillPlans[characterId].hasOwnProperty(planId)) {
            skillPlans[characterId][planId].queue = [...queue];
            skillPlans[characterId][planId].name = name;
            skillPlans[characterId][planId].lastSaved = new Date().getTime();
        }

        skillPlansLastUsed = new Date().getTime();
        SkillPlanStore.save();
    }

    /**
     * Deleted skill plan
     *
     * @param {string}  characterId Character ID
     * @param {string}  planId ID of the plan
     */
    static deleteSkillPlan(characterId, planId) {
        characterId = characterId.toString();

        SkillPlanStore.require();

        if (!skillPlans.hasOwnProperty(characterId)) {
            skillPlans[characterId] = {};
        }

        if (skillPlans[characterId].hasOwnProperty(planId)) {
            delete skillPlans[characterId][planId];
        }

        skillPlansLastUsed = new Date().getTime();
        SkillPlanStore.save();
    }

    /**
     * Deletes all of a character's plans (when the character is removed)
     *
     * @param {string}  characterId Character ID
     */
    static deleteAllForCharacter(characterId) {
        SkillPlanStore.require();

        delete skillPlans[characterId.toString()];
        SkillPlanStore.saveImmediately();
    }

    /**
     * Checks if a plan exists
     *
     * @param {string}  characterId Character ID
     * @param {string}  planId ID of the plan
     * @returns {boolean}
     */
    static doesPlanExist(characterId, planId) {
        characterId = characterId.toString();

        SkillPlanStore.require();

        if (!skillPlans.hasOwnProperty(characterId)) {
            skillPlans[characterId] = {};
        }
        return skillPlans[characterId].hasOwnProperty(planId);
    }

    /**
     * Plans for a character in priority order (highest first), with a summary of each.
     *
     * @returns {array} [{id, name, enabled, priority, skillCount, time}]
     */
    static getSkillPlansForCharacter(characterId) {
        characterId = characterId.toString();

        SkillPlanStore.require();

        const plans = [];
        if (skillPlans.hasOwnProperty(characterId)) {
            for (const i in skillPlans[characterId]) {
                const plan = skillPlans[characterId][i];
                const skills = plan.queue.filter(item => item.type === 'skill');

                plans.push({
                    id: i,
                    name: plan.name,
                    // plans saved before priorities existed have none: they sort last and count as switched on
                    enabled: plan.enabled !== false,
                    priority: plan.priority !== undefined ? plan.priority : Number.MAX_SAFE_INTEGER,
                    skillCount: skills.length,
                    time: skills.reduce((total, item) => total + (item.time || 0), 0),
                });
            }
        }
        plans.sort((a, b) => (a.priority - b.priority) || a.name.localeCompare(b.name));

        skillPlansLastUsed = new Date().getTime();
        return plans;
    }

    /**
     * Sets the priority order of a character's plans.
     *
     * @param {string} characterId Character ID
     * @param {array} planIds Plan ids, highest priority first
     */
    static setPlanOrder(characterId, planIds) {
        characterId = characterId.toString();

        SkillPlanStore.require();

        planIds.forEach((planId, index) => {
            if (skillPlans.hasOwnProperty(characterId) && skillPlans[characterId].hasOwnProperty(planId)) {
                skillPlans[characterId][planId].priority = index + 1;
            }
        });

        skillPlansLastUsed = new Date().getTime();
        SkillPlanStore.save();
    }

    /**
     * Switches a plan on or off in the character's combined training queue.
     */
    static setPlanEnabled(characterId, planId, enabled) {
        characterId = characterId.toString();

        SkillPlanStore.require();

        if (skillPlans.hasOwnProperty(characterId) && skillPlans[characterId].hasOwnProperty(planId)) {
            skillPlans[characterId][planId].enabled = enabled;
        }

        skillPlansLastUsed = new Date().getTime();
        SkillPlanStore.save();
    }

    static doMaintenance() {
        if ((skillPlans !== undefined) && (skillPlansLastUsed + 10000 < new Date().getTime())) {
            SkillPlanStore.saveImmediately();
            skillPlans = undefined;
        }
    }

    static require() {
        skillPlansLastUsed = new Date().getTime();

        if (skillPlans === undefined) {
            const retrieved = skillPlansStore.get('skillplans-store');
            if (retrieved !== undefined && retrieved.hasOwnProperty('version') && retrieved.version === 1) {
                skillPlans = retrieved.plans;
            }
            if (skillPlans === undefined) {
                skillPlans = {};
            }
        }
    }

    static save() {
        if (skillPlans !== undefined) {
            if (thingsSaveTimeout !== undefined) {
                clearTimeout(thingsSaveTimeout);
            }

            thingsSaveTimeout = setTimeout(() => {
                skillPlansStore.set('skillplans-store', { version: 1, plans: skillPlans });
            }, 10000);
        }
    }

    static saveImmediately() {
        if (skillPlans !== undefined) {
            if (thingsSaveTimeout !== undefined) {
                clearTimeout(thingsSaveTimeout);
            }

            skillPlansStore.set('skillplans-store', { version: 1, plans: skillPlans });
        }
    }

}

setInterval(SkillPlanStore.doMaintenance, 5000);
