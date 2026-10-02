'use strict';

import AllSkills from '../../resources/all_skills';
import Character from '../models/Character';
import AcceleratorHelper from '../helpers/AcceleratorHelper';

// The character's attributes without an active cerebral accelerator, which runs out: plans add its bonus only for as
// long as EVE's skill queue counts it (see AcceleratorHelper.planWindow).
function attributesWithoutAccelerator(character) {
    const attributes = Object.assign({}, character.attributes);
    const booster = AcceleratorHelper.attributeBonus(character);
    ['perception', 'memory', 'willpower', 'intelligence', 'charisma'].forEach(a => {
        if (typeof attributes[a] === 'number') {
            attributes[a] -= booster;
        }
    });
    return attributes;
}

class PlanCharacter {

    /**
     * @param {string} id
     * @param {object} [options] {accelerator: false} to plan without the active accelerator (for comparisons that
     *                           apply one themselves)
     */
    constructor(id, options) {
        if (id !== undefined) {
            id = id.toString();
            this.baseCharacter = Character.get(id);
        }
        this.id = id;
        this.useAccelerator = !(options !== undefined && options.accelerator === false);
        this.load();
    }


    /**
     * (Re)Loads the character
     *
     */
    load() {
        this.name = this.baseCharacter.name.toString();
        this.attributes = attributesWithoutAccelerator(this.baseCharacter);
        this.isOmega = this.baseCharacter.isOmega();
        // {bonus, end, remaining (ms from now)} of an active accelerator, applied to the plan's first `remaining` ms,
        // unless switched off for this character's plans (see Plans' accelerator switch)
        this.accelerator = this.useAccelerator && this.baseCharacter.planIgnoreAccelerator !== true ?
            AcceleratorHelper.planWindow(this.baseCharacter) : undefined;

        this.skills = {};
        this.queue = [];
        this.time = 0;
        this.lastRemap = this.attributes.last_remap_date !== undefined ? (Date.now() - (new Date(this.attributes.last_remap_date).getTime())) : 0;

        const finishedSkills = this.baseCharacter.getFinishedSkillsInQueue();
        const finishedSkillIds = finishedSkills.map(o => o.skill_id);
        const currentSkill = this.baseCharacter.getCurrentSkill();

        Object.keys(AllSkills.skills).forEach((skill) => {
            const skillId = AllSkills.skills[skill].type_id;
            this.skills[skillId] = Object.assign({}, AllSkills.skills[skillId]);

            const baseCharacterSkill = this.baseCharacter.skills.filter(s => (s.skill_id.toString() === skill));
            if (baseCharacterSkill !== undefined && baseCharacterSkill[0] !== undefined) {

                let trainedSkillLevel = baseCharacterSkill[0].trained_skill_level;
                let skillPointsInSkill = baseCharacterSkill[0].skillpoints_in_skill;

                // is this the skill we are currently training? approximate the sp and use those instead
                if (currentSkill !== undefined && currentSkill.skill_id === skillId) {
                    let startingMilliseconds = new Date(currentSkill.start_date).getTime();
                    let millisecondsPassed = new Date().getTime() - startingMilliseconds;
                    let additionalTrainedSp = millisecondsPassed * this.baseCharacter.getCurrentSpPerMillisecond();
                    skillPointsInSkill = (currentSkill.training_start_sp + additionalTrainedSp);
                // any of the skills that already finished?
                } else if (finishedSkillIds.includes(skillId)) {
                    const queueEntries = finishedSkills.filter(o => o.skill_id === skillId);
                    queueEntries.sort((a, b) => (a.finished_level > b.finished_level));

                    trainedSkillLevel = queueEntries[0].finished_level;
                    skillPointsInSkill = queueEntries[0].level_end_sp;
                }

                this.skills[skillId].trained_skill_level = trainedSkillLevel;
                this.skills[skillId].planned_skill_level = 0;
                this.skills[skillId].skillpoints_in_skill = skillPointsInSkill;
                this.skills[skillId].planned_skillpoints_in_skill = 0;
                this.isUnknown = false;
            } else {
                this.skills[skillId].trained_skill_level = 0;
                this.skills[skillId].planned_skill_level = 0;
                this.skills[skillId].skillpoints_in_skill = 0;
                this.skills[skillId].planned_skillpoints_in_skill = 0;
                this.isUnknown = true;
            }
        });
    }

    /**
     * Resets any planned skill and queue for the character
     *
     */
    reset() {
        this.queue = [];
        this.time = 0;
        this.attributes = attributesWithoutAccelerator(this.baseCharacter);
        this.lastRemap = this.attributes.last_remap_date !== undefined ?  (Date.now() - (new Date(this.attributes.last_remap_date).getTime())) : 0;

        Object.keys(AllSkills.skills).forEach((skill) => {
            const skillId = AllSkills.skills[skill].type_id;
            this.skills[skillId].planned_skill_level = 0;
            this.skills[skillId].planned_skillpoints_in_skill = 0;
        });
    }

    /**
     * Add an item to the queue
     *
     * @param {object} skillQueueItem
     */
    addItemToQueue(skillQueueItem, bannedSkills) {
        if (skillQueueItem.type === 'skill') {
            this.planSkill(skillQueueItem.id, skillQueueItem.level, undefined, bannedSkills);
        } else if (skillQueueItem.type === 'remap') {
            this.addRemap(skillQueueItem.attributes, skillQueueItem.implants);
        } else if (skillQueueItem.type === 'note') {
            this.addNote(skillQueueItem.text, skillQueueItem.details);
        }
    }

    /**
     * Verifies if the skill in position oldIndex can be moved to newIndex.
     *
     * @param {number} oldIndex     Current position of the skill in queue
     * @param {number} newIndex     Desired position of the skill in queue
     * @returns {boolean} Valid move without violating prereqs
     */
    canMoveSkillToPosition(oldIndex, newIndex) {
        const skillToMove = this.queue[oldIndex];
        let illegalMove = false;

        // we only handle skills
        if (skillToMove.type !== 'skill') {
            return false;
        }

        // going down in the list?
        if (oldIndex < newIndex) {
            const queueSubset = this.queue.slice(oldIndex + 1, newIndex + 1);
            // do we have to rebuild the whole queue?
            illegalMove = queueSubset.some((skill) => {
                // not a skill, might be a remap => need to recalculate values
                if (skill.type !== 'skill') {
                    return true;
                }

                // same skill but higher level? can't move past it
                if (skill.id === skillToMove.id && skill.level > skillToMove.level) {
                    return true;
                }

                // any skill that requires this one? can't move past that one either
                if (skill.required_skills.length > 0 &&
                    skill.required_skills.some(
                        req => req.id === skillToMove.id && req.level >= skillToMove.level,
                    )) {
                    return true;
                }
                return false;
            });
            // going up, need to check the "to be moved" skill prereqs against those
        } else {
            const queueSubset = this.queue.slice(newIndex, oldIndex).reverse();
            illegalMove = queueSubset.some((skill) => {
                // not a skill, might be a remap => need to recalculate values
                if (skill.type !== 'skill') {
                    return true;
                }
                // same skill but lower level? can't move past it
                if (skillToMove.id === skill.id && skill.level < skillToMove.level) {
                    return true;
                }

                // are any of those a prereq for this one? can't move past
                if (skillToMove.required_skills.length > 0
                    && skillToMove.required_skills.some(
                        req => req.id === skill.id && skill.level <= req.level)
                ) {
                    return true;
                }
                return false;
            });
        }
        return !illegalMove;
    }

    /**
    * Tries to move an item in the current queue
    *
    * Attempt to move the skill or other item in position oldIndex to newIndex.
    * To force a move and allow other skills to be reorderd use forceMoveByRebuild.
    * Forced moves will still honor prereqs.
    *
    *
    * @param {number}   oldIndex     Current position of the item in queue
    * @param {number}   newIndex     Desired position of the item in queue
    * @param {boolean}  forceMoveByRebuild Rebuild queue to force a reorder if nessessacy
    *
    */
    moveQueuedItemByPosition(oldIndex, newIndex, forceMoveByRebuild) {
        const canMove = this.canMoveSkillToPosition(oldIndex, newIndex);

        if (canMove) {
            if (newIndex >= this.queue.length) {
                let k = newIndex - this.queue.length;
                while (k + 1) {
                    k -= 1;
                    this.queue.push(undefined);
                }
            }
            this.queue.splice(newIndex, 0, this.queue.splice(oldIndex, 1)[0]);
            // reset the queue and readd all skills
        } else if (forceMoveByRebuild) {
            const oldQueue = this.queue.slice(0);
            if (newIndex >= oldQueue.length) {
                let k = newIndex - oldQueue.length;
                while (k + 1) {
                    k -= 1;
                    oldQueue.push(undefined);
                }
            }
            oldQueue.splice(newIndex, 0, oldQueue.splice(oldIndex, 1)[0]);

            this.reset();

            oldQueue.forEach(item => this.addItemToQueue(item));
        }
    }

    /**
     * Attempts to move a set of items around. oldIndex can be any
     * Forces a rebuild of the queue with the new order.
     *
     *
     * @param {number}   oldIndex     Current position of any of the to be moved items
     * @param {number}   newIndex     Desired position of the item in queue
     * @param {Array}  itemsToMove    List of positions to move to newIndex
     *
     */
    moveQueuedItemsByPosition(oldIndex, newIndex, itemsToMove) {
        if (itemsToMove.length > 0) {
            let newItemOrder = [];
            const itemsToAppend = [];

            for (let i = 0; i < this.queue.length; i += 1) {
                // will we move this one around or does it "stay in place"
                if (itemsToMove.indexOf(i) === -1) {
                    // are we moving items to a later slot?
                    if (newIndex > oldIndex) {
                        // should it be added before or after our moved items?
                        if (i <= newIndex) {
                            newItemOrder.push(i);
                        } else if (i > newIndex) {
                            itemsToAppend.push(i);
                        }
                        // no, moving up in the list
                    } else if (newIndex < oldIndex) {
                        // should it be added before or after our moved items?
                        if (i < newIndex) {
                            newItemOrder.push(i);
                        } else if (i >= newIndex) {
                            itemsToAppend.push(i);
                        }
                    }
                }
            }
            newItemOrder = newItemOrder.concat(itemsToMove).concat(itemsToAppend);

            const newQueue = [...this.queue];
            let nIndex = newIndex;

            // remove all itemsToMove from the queue
            const itemsToInsert = [];
            for (let i = itemsToMove.length - 1; i >= 0; i -= 1) {
                const index = itemsToMove[i];
                // adjust newIndex if required
                if (index < nIndex && index !== oldIndex) {
                    nIndex -= 1;
                }

                itemsToInsert.unshift(newQueue[index]);
                newQueue.splice(index, 1);
            }

            // insert the items that should be moved into their new position
            let k = 0;
            for (let i = 0; i < itemsToInsert.length; i += 1) {
                newQueue.splice(nIndex + k, 0, itemsToInsert[i]);
                k += 1;
            }

            // reset and readd everything to the queue
            this.reset();
            newQueue.forEach(item => this.addItemToQueue(item));
        }
    }

    /**
     * Adds a remap to the queue.
     *
     * @param {object}   attributes   Object that has a number value for each of the 5 attributes
     * @param {number}   implants     Uniform +attribute implant set used
     *
     */
    addRemap(attributes, implants) {
        if (attributes !== undefined
            && implants !== undefined
            && attributes.hasOwnProperty('perception')
            && attributes.hasOwnProperty('memory')
            && attributes.hasOwnProperty('willpower')
            && attributes.hasOwnProperty('intelligence')
            && attributes.hasOwnProperty('charisma')
        ) {
            const fullAttributes = Object.assign({}, attributes);

            Object.keys(fullAttributes).forEach((attribute) => {
                fullAttributes[attribute] += implants;
            });

            this.attributes = fullAttributes;
            this.lastRemap = 0;

            const remapItem = {
                attributes: Object.assign({}, attributes),
                implants,
                type: 'remap',
                title: `Remap - P${fullAttributes.perception} M${fullAttributes.memory} W${fullAttributes.willpower} I${fullAttributes.intelligence} C${fullAttributes.charisma}`,
            };
            this.queue.push(remapItem);
        }
    }

    /**
     * Adds a note to the queue.
     *
     * @param {object}   attributes   Object that has a number value for each of the 5 attributes
     *
     */
    addNote(text, details) {
        if (text !== undefined) {
            const item = {
                text,
                details,
                title: `Note - ${text}`,
                type: 'note',
            };
            this.queue.push(item);
        }
    }

    /**
     * Edits a note to the queue
     *
     * @param {string} text    Header
     * @param {string} details Body
     * @param {index}  index   Position of the note to replace
     *
     */
    editNoteAtPosition(text, details, index) {
        if (text !== undefined
            && details !== undefined
            && index !== undefined) {
                if (this.queue[index] !== undefined && this.queue[index].type === 'note') {
                    this.queue[index].text = text;
                    this.queue[index].details = details;
                    this.queue[index].title = `Note - ${text}`;
                }
            }
    }

    /**
     * Edits a remap to the queue. Forces a rebuild.
     *
     * @param {object} attributes Object that has a number value for each of the 5 attributes
     * @param {number} implants   Attribute bonus added by implants
     * @param {index}  index      Position of the remap to replace
     *
     */
    editRemapAtPosition(attributes, implants, index) {
        if (attributes !== undefined
            && implants !== undefined
            && index !== undefined
            && this.queue[index].type === 'remap'
            && attributes.hasOwnProperty('perception')
            && attributes.hasOwnProperty('memory')
            && attributes.hasOwnProperty('willpower')
            && attributes.hasOwnProperty('intelligence')
            && attributes.hasOwnProperty('charisma')
        ) {
            const fullAttributes = Object.assign({}, attributes);
            Object.keys(fullAttributes).forEach((attribute) => {
                fullAttributes[attribute] += implants;
            });

            this.attributes = fullAttributes;

            const remapItem = {
                attributes: Object.assign({}, attributes),
                implants,
                type: 'remap',
                title: `Remap - P${fullAttributes.perception} M${fullAttributes.memory} W${fullAttributes.willpower} I${fullAttributes.intelligence} C${fullAttributes.charisma}`,
            };

            const newQueue = [...this.queue];

            this.reset();
            newQueue[index] = remapItem;
            newQueue.forEach(item => this.addItemToQueue(item));
        }
    }

    /**
     * Adds a skill to the queue.
     *
     * Resolves the skill and all prerequisite skills and adds them to the plan queue.
     * Optionally plan prerequisite skills to at least preReqLvl.
     *
     *
     * @param {number}   typeId       EVE Type ID of the skill to check.
     * @param {number}   lvl          Desired level of the skill.
     * @param {number}   [preReqLvl]  Desired level of any prerequisite skill.
     *                                Ignored if below the actual unlock level.
     *
     */
    planSkill(typeId, lvl, preReqLvl) {
        const skill = this.skills[typeId];

        // is it a valid skill and (do we need to train or do we care about prereqs)
        // train skill to level 0 but prereqs to x is valid
        if (skill !== undefined
            && ((skill.trained_skill_level < lvl && skill.planned_skill_level < lvl) || lvl === 0)) {
            const currentLvl = skill.trained_skill_level > skill.planned_skill_level ? skill.trained_skill_level : skill.planned_skill_level;

            // any required skills to train?
            if (skill.required_skills.length > 0) {
                skill.required_skills.forEach((requiredSkill) => {
                    // should we train to min lvl or a different level?
                    const targetLvl = preReqLvl !== undefined && preReqLvl > requiredSkill.level ? preReqLvl : requiredSkill.level;

                    // do we have a ban list? prereq skill must not be on the banlist?
                    if (!(this.bannedSkills !== undefined && this.bannedSkills.includes(requiredSkill.id))) {
                        // did we specifically ban this prereq?
                        if (!(this.bannedSkill !== undefined && this.bannedSkill === requiredSkill.id && this.bannedSkillLevel <= requiredSkill.level)) {
                            this.planSkill(requiredSkill.id, targetLvl, preReqLvl);
                        } else {
                            if (this.bannedSkills === undefined) {
                                this.bannedSkills = [];
                            }
                            this.bannedSkills.push(skill.type_id);
                        }
                    } else {
                        if (this.bannedSkills === undefined) {
                            this.bannedSkills = [];
                        }
                        this.bannedSkills.push(skill.type_id);
                    }
                });
            }

            let spPerHour = (this.attributes[skill.primary_attribute] +
                (this.attributes[skill.secondary_attribute] / 2)) * 60;
            // with an active accelerator: its bonus on both attributes
            let boostedSpPerHour = this.accelerator !== undefined ? spPerHour + this.accelerator.bonus * 1.5 * 60 : spPerHour;

            // Alpha clones train at half speed; a character not known to be Alpha is planned at Omega speed
            if (this.isOmega === false) {
                spPerHour *= 0.5;
                boostedSpPerHour *= 0.5;
            }

            // add each level individually
            for (let i = currentLvl + 1; i <= lvl; i += 1) {
                // the skill must not be on the band list and it must not be banned directly
                if ((!(this.bannedSkills !== undefined && this.bannedSkills.includes(skill.type_id)))
                    && (!((this.bannedSkill !== undefined && this.bannedSkill === skill.type_id)
                        && (this.bannedSkillLevel !== undefined && this.bannedSkillLevel <= i)))
                ) {
                    const currentSP = skill.skillpoints_in_skill > skill.planned_skillpoints_in_skill ? skill.skillpoints_in_skill : skill.planned_skillpoints_in_skill;
                    // EVE rounds each level's skill points up (e.g. 1,415 and 45,255 for a rank 1 skill)
                    const spForLevel = Math.ceil(250 * skill.training_time_multiplier * (32 ** ((i - 1) / 2)));
                    const missingSPforLevel = spForLevel - currentSP;

                    // seconds: at the boosted speed while the accelerator lasts, the normal speed after
                    const boostLeft = this.accelerator !== undefined ? Math.max(0, (this.accelerator.remaining - this.time) / 1000) : 0;
                    let time = missingSPforLevel * (3600 / boostedSpPerHour);
                    if (time > boostLeft) {
                        const spBoosted = boostLeft * boostedSpPerHour / 3600;
                        time = boostLeft + (missingSPforLevel - spBoosted) * (3600 / spPerHour);
                    }

                    this.time += time * 1000;
                    this.lastRemap += time * 1000;

                    skill.planned_skill_level = i;
                    skill.planned_skillpoints_in_skill = spForLevel;

                    this.queue.push({
                        type: 'skill',
                        id: typeId,
                        level: i,
                        name: skill.name,
                        title: `${skill.name} ${i}`,
                        sp: missingSPforLevel,
                        spTotal: spForLevel,
                        spHour: time > 0 ? Math.round(missingSPforLevel / (time / 3600)) : Math.round(spPerHour),
                        time: time * 1000,
                        lastRemap: this.lastRemap,
                        primaryAttribute: skill.primary_attribute,
                        secondaryAttribute: skill.secondary_attribute,
                        attributeTitle: `${skill.primary_attribute.substring(0, 3)} / ${skill.secondary_attribute.substring(0, 3)}`,
                        required_skills: skill.required_skills,
                    });
                }
            }
        }
    }

    /**
     * Tries to remove the item positioned in index
     *
     * Removes the item in the requested position if possible without violating prereqs.
     * Use force to remove the skill and all skills depended on it from the queue.
     *
     * @param {number}  index Position of the item in queue
     * @param {boolean} force I really want this skill gone
     */
    removeItemByPosition(index, force) {
        if (force === undefined || force === false) {
            const newQueue = [...this.queue];
            newQueue.splice(index, 1);
            this.reset();

            newQueue.forEach(item => this.addItemToQueue(item));
        } else if (force !== undefined || force === true) {
            const newQueue = [...this.queue];

            this.bannedSkills = [];
            this.bannedSkill = this.queue[index].id;
            this.bannedSkillLevel = this.queue[index].level;

            this.reset();
            newQueue.forEach(item => this.addItemToQueue(item));

            this.bannedSkills = undefined;
            this.bannedSkill = undefined;
            this.bannedSkillLevel = undefined;
        }
    }

}

export default PlanCharacter;
