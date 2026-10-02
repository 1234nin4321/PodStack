'use strict';

import log from 'electron-log';
import xml2js from 'xml2js';

import EsiClient from './eve/EsiClient';
import TypeHelper from './TypeHelper';
import PlanCharacter from '../models/PlanCharacter';
import SkillPlanHelper from './SkillPlanHelper';
import SkillPlanStore from './SkillPlanStore';

import AllSkills from '../../resources/all_skills';

// Dogma attribute ids for a type's required skills, as [skill attribute, level attribute] pairs.
const REQUIRED_SKILL_ATTRIBUTES = [
    [182, 277],
    [183, 278],
    [184, 279],
    [1285, 1286],
    [1289, 1287],
    [1290, 1288],
];

const CATEGORIES = {6: 'Ship', 7: 'Module', 8: 'Charge', 18: 'Drone', 20: 'Implant', 32: 'Subsystem', 87: 'Fighter'};

function userError(message) {
    const err = new Error(message);
    err.userFacing = true;
    return err;
}

export default class FittingHelper {
    /**
     * Parses one or more fits, detecting the format:
     *  - EFT, as copied from EVE's fitting window or exported by Pyfa (including Pyfa's mutated module notes)
     *  - EVE's XML fitting export, which may hold several fits
     *  - DNA, e.g. 587:2048;1:31718;1::, as used by in-game fitting links and Pyfa
     *
     * Items are identified by name (EFT, XML) or type id (DNA).
     *
     * @returns {array} [{format, fitName, ship: {name}|{typeId}, items: [{name}|{typeId}, quantity]}]
     */
    static parseFits(text) {
        text = (text || '').trim();
        if (text === '') {
            throw userError('Paste a fit first.');
        }

        if (text.startsWith('<')) {
            return FittingHelper.parseXml(text);
        }
        if (/^\[[^\]]+\]/.test(text)) {
            return [FittingHelper.parseEft(text)];
        }

        const dna = text.match(/(\d+(?::\d+_?(?:;\d+)?)*)::/);
        if (dna !== null) {
            return [FittingHelper.parseDna(dna[1])];
        }

        throw userError('Couldn\'t recognise that fit. Paste EFT text (first line [Ship, Fit name]), EVE fitting XML, or a DNA string.');
    }

    static parseEft(text) {
        const lines = text.split(/\r?\n/).map(l => l.trim());
        const header = lines[0].match(/^\[([^,\]]+)(?:,\s*(.*))?\]$/);
        if (header === null) {
            throw userError('That doesn\'t look like a fit. The first line should be [Ship name, Fit name].');
        }

        const shipName = header[1].trim();
        const quantities = new Map();

        for (const line of lines.slice(1)) {
            // Pyfa lists mutated modules' stats in blocks starting "[1] Module name" at the end; nothing after is fit
            if (/^\[\d+\]\s/.test(line)) {
                break;
            }
            // blank lines separate sections; [Empty Low slot] etc. are placeholders
            if (line === '' || (line.startsWith('[') && line.endsWith(']'))) {
                continue;
            }

            // "Module, Charge"; offline modules end in "/OFFLINE"; Pyfa marks mutated modules "Module [1]"
            for (let part of line.replace(/\s*\/offline$/i, '').split(',')) {
                part = part.trim().replace(/\s*\[\d+\]$/, '');
                let quantity = 1;

                const stack = part.match(/^(.*?)\s+x(\d+)$/);
                if (stack !== null) {
                    part = stack[1];
                    quantity = parseInt(stack[2], 10);
                }

                if (part !== '') {
                    quantities.set(part, (quantities.get(part) || 0) + quantity);
                }
            }
        }

        return {
            format: 'EFT',
            fitName: (header[2] || '').trim() || shipName,
            ship: {name: shipName},
            items: [...quantities].map(([name, quantity]) => ({name, quantity})),
        };
    }

    static parseXml(text) {
        let doc;
        let parseError;
        new xml2js.Parser().parseString(text, (err, result) => {
            parseError = err;
            doc = result;
        });

        const fittings = doc && doc.fittings && doc.fittings.fitting;
        if (parseError || !fittings) {
            throw userError('Couldn\'t read that XML. Expected an EVE fitting export (<fittings><fitting>…).');
        }

        return fittings.map(fitting => {
            const shipName = ((fitting.shipType || [])[0] || {$: {}}).$.value;
            if (!shipName) {
                throw userError('A fitting in that XML has no ship type.');
            }

            const quantities = new Map();
            for (const hardware of fitting.hardware || []) {
                const name = hardware.$.type;
                if (name) {
                    quantities.set(name, (quantities.get(name) || 0) + (parseInt(hardware.$.qty, 10) || 1));
                }
            }

            return {
                format: 'XML',
                fitName: (fitting.$ && fitting.$.name) || shipName,
                ship: {name: shipName},
                items: [...quantities].map(([name, quantity]) => ({name, quantity})),
            };
        });
    }

    static parseDna(dna) {
        const [ship, ...parts] = dna.split(':');
        const quantities = new Map();

        for (const part of parts) {
            const [id, qty] = part.replace('_', '').split(';');
            const typeId = parseInt(id, 10);
            quantities.set(typeId, (quantities.get(typeId) || 0) + (parseInt(qty, 10) || 1));
        }

        return {
            format: 'DNA',
            fitName: undefined,   // DNA carries no name; filled in with the ship's name once it's looked up
            ship: {typeId: parseInt(ship, 10)},
            items: [...quantities].map(([typeId, quantity]) => ({typeId, quantity})),
        };
    }

    /**
     * Looks up the ship and every item in a parsed fit, with the skills each one needs.
     *
     * @returns {{ship: object, fitName: string, items: array, unknown: array}} items (ship first) are
     *          {id, name, category, quantity, skills: [{id, level}]}; unknown lists names/ids that couldn't be found
     */
    static async getRequirements(fit) {
        try {
            return await FittingHelper.lookUp(fit);
        } catch (err) {
            if (err.userFacing) {
                throw err;
            }

            log.error('[Fitting] Lookup failed', err);
            throw new Error('Couldn\'t reach EVE to look up the fit. Try again in a moment.');
        }
    }

    static async lookUp(fit) {
        const entries = [{...fit.ship, quantity: 1, isShip: true}, ...fit.items];

        // names -> type ids, 500 per request
        const names = entries.filter(e => e.typeId === undefined).map(e => e.name);
        const ids = {};
        for (let i = 0; i < names.length; i += 500) {
            const res = await new EsiClient().post('universe/ids', [], {body: names.slice(i, i + 500)});
            for (const type of (res && res.inventory_types) || []) {
                ids[type.name.toLowerCase()] = type.id;
            }
        }

        const resolved = await Promise.all(entries.map(async entry => {
            const typeId = entry.typeId !== undefined ? entry.typeId : ids[entry.name.toLowerCase()];
            if (typeId === undefined) {
                return undefined;
            }

            try {
                return await TypeHelper.resolveType(typeId);
            } catch (err) {
                // an unknown id in a DNA string 404s; anything else is a connection problem
                if (err.statusCode === 404) {
                    return undefined;
                }
                throw err;
            }
        }));

        if (resolved[0] === undefined) {
            throw userError(`Couldn't find the ship "${fit.ship.name || fit.ship.typeId}".`);
        }

        const items = [];
        const unknown = [];
        entries.forEach((entry, i) => {
            const type = resolved[i];
            if (type === undefined) {
                unknown.push(entry.name || `#${entry.typeId}`);
                return;
            }

            items.push({
                id: type.type_id,
                name: type.name,
                category: entry.isShip ? 'Ship' : (CATEGORIES[type.group && type.group.category_id] || 'Item'),
                quantity: entry.quantity,
                skills: FittingHelper.requiredSkills(type),
            });
        });

        return {
            ship: {id: items[0].id, name: items[0].name},
            fitName: fit.fitName || items[0].name,
            items,
            unknown,
        };
    }

    static requiredSkills(type) {
        const attributes = {};
        for (const a of type.dogma_attributes || []) {
            attributes[a.attribute_id] = a.value;
        }

        const skills = [];
        for (const [skillAttr, levelAttr] of REQUIRED_SKILL_ATTRIBUTES) {
            const id = Math.round(attributes[skillAttr] || 0);
            const level = Math.round(attributes[levelAttr] || 0);

            if (id !== 0 && level !== 0) {
                if (AllSkills.skills[id] === undefined) {
                    log.warn(`[Fitting] ${type.name} requires unknown skill #${id}`);
                } else {
                    skills.push({id, level});
                }
            }
        }

        return skills;
    }

    /**
     * Cross-references a fit against the character and builds the plan to fly it.
     *
     * The plan gets the hull flyable first, then unlocks the rest of the fit one step at a time, always taking
     * whichever item is quickest to unlock next (items unlocked by the same skills are grouped). Each step starts with
     * a milestone note, and within a step skills are ordered fastest first with prerequisites kept ahead.
     *
     * @returns {{items: array, queue: array, time: number, milestones: array}}
     *   items: each requirements item plus usable and missing: [{id, name, level, trained}] (direct requirements)
     *   queue/time: the generated plan (PlanCharacter queue items) and its total training time
     *   milestones: [{label, items: [names], time}] with time = training time from the start until reached
     */
    static analyse(characterId, requirements) {
        const base = new PlanCharacter(characterId);
        const trained = id => (base.skills[id] || {}).trained_skill_level || 0;

        const items = requirements.items.map(item => {
            const missing = item.skills
                .filter(s => trained(s.id) < s.level)
                .map(s => ({id: s.id, name: AllSkills.skills[s.id].name, level: s.level, trained: trained(s.id)}));

            return {...item, usable: missing.length === 0, missing};
        });

        // Training time of every skill level the fit could need, from a plan of everything at once. With fixed
        // attributes a level takes the same time wherever it sits in a plan.
        const levelTime = {};
        const everything = new PlanCharacter(characterId);
        items.forEach(item => item.skills.forEach(s => everything.planSkill(s.id, s.level)));
        everything.queue.forEach(q => levelTime[`${q.id}:${q.level}`] = q.time);

        // Skill levels (prerequisites included) still to train to use an item, given what's already planned.
        const planned = {};
        const needed = (item) => {
            const levels = {};
            const visit = (id, level) => {
                if (Math.max(trained(id), planned[id] || 0, levels[id] || 0) >= level) {
                    return;
                }
                levels[id] = level;
                (AllSkills.skills[id].required_skills || []).forEach(req => visit(req.id, req.level));
            };
            item.skills.forEach(s => visit(s.id, s.level));
            return levels;
        };
        const cost = (levels) => Object.keys(levels).reduce((total, id) => {
            for (let l = Math.max(trained(id), planned[id] || 0) + 1; l <= levels[id]; l++) {
                total += levelTime[`${id}:${l}`] || 0;
            }
            return total;
        }, 0);

        // Greedy steps: hull first, then the cheapest remaining item each time.
        const steps = [];
        let remaining = items.filter(item => !item.usable);
        while (remaining.length > 0) {
            const hull = remaining.find(item => item.category === 'Ship' && item.id === requirements.ship.id);
            const next = hull || remaining.reduce((best, item) => (cost(needed(item)) < cost(needed(best)) ? item : best));

            const levels = needed(next);
            Object.keys(levels).forEach(id => planned[id] = Math.max(planned[id] || 0, levels[id]));

            // anything else these skills happen to unlock comes with this step
            const unlocked = remaining.filter(item => item === next || Object.keys(needed(item)).length === 0);
            remaining = remaining.filter(item => !unlocked.includes(item));
            steps.push({next, unlocked, levels});
        }

        const ship = requirements.ship.name;
        const planCharacter = new PlanCharacter(characterId);
        for (const step of steps) {
            const names = step.unlocked.map(item => item.name);
            const label = step.next === items[0] ? `Fly the ${ship}` :
                (names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2} more` : names.join(', '));

            planCharacter.addNote(`${ship}: ${label}`, names.join('\n'));
            Object.keys(step.levels).forEach(id => planCharacter.planSkill(parseInt(id, 10), step.levels[id]));
        }
        SkillPlanHelper.sortByTrainingTime(planCharacter);

        // when each milestone is reached, counting from the start of the plan
        const milestones = [];
        let elapsed = 0;
        planCharacter.queue.forEach(q => {
            if (q.type === 'note') {
                const step = steps[milestones.length];
                milestones.push({label: q.text.replace(`${ship}: `, ''), items: step.unlocked.map(i => i.name), time: 0});
            } else if (q.type === 'skill') {
                elapsed += q.time;
                milestones[milestones.length - 1].time = elapsed;
            }
        });

        return {items, queue: planCharacter.queue, time: planCharacter.time, milestones};
    }

    /**
     * Appends a generated fit plan to one of the character's plans, or creates a new plan with it when planId is
     * undefined. Skills the plan already has aren't added again. Returns the id of the plan that was written.
     */
    static addToPlan(characterId, planId, newPlanName, queue) {
        const planCharacter = new PlanCharacter(characterId);
        let name = newPlanName;

        if (planId !== undefined) {
            const plan = SkillPlanStore.getSkillPlan(characterId, planId);
            if (plan === undefined) {
                throw new Error('That plan no longer exists.');
            }

            name = plan.name;
            plan.queue.forEach(item => planCharacter.addItemToQueue(item));
        } else {
            planId = SkillPlanHelper.newPlanId();
        }

        queue.forEach(item => planCharacter.addItemToQueue(item));

        SkillPlanStore.storeSkillPlan(characterId, planId, name, planCharacter.queue);
        return planId;
    }
}
