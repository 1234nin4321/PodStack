'use strict';

import Store from 'electron-store';

import EsiClient from '../helpers/eve/EsiClient';
import TypeHelper from '../helpers/TypeHelper';
import StationHelper from '../helpers/StationHelper';
import StructureHelper from '../helpers/StructureHelper';
import SystemHelper from '../helpers/SystemHelper';
import AuthorizedCharacter from './AuthorizedCharacter';

import appProperties from '../../resources/properties';
import alphaSkillSet from '../../resources/alpha_skill_set';
import AllSkills from '../../resources/all_skills';
import DateTimeHelper from '../helpers/DateTimeHelper';
import BulkIdResolver from '../helpers/BulkIdResolver';
import LocationHelper from '../helpers/LocationHelper';
import MailBodyHelper from '../helpers/MailBodyHelper';
import NameHelper from '../helpers/NameHelper';
import ImageHelper from '../helpers/ImageHelper';
import AcceleratorHelper from '../helpers/AcceleratorHelper';

let subscribedComponents = [];
let characters;
let buildRunning = false;
const CHARACTERS_AT_ONCE = 2;
const charactersStore = new Store({
    name: 'character-data'
});
let charactersSaveTimeout;
// characters removed this session; a refresh still in flight for one of them must not save it back
const deletedIds = new Set();

// Name of a station, structure or solar system an asset, job or colony is in. Structures need docking access.
async function resolveLocationName(id, client, characterId, names) {
    if (names[id] !== undefined) {
        return names[id];
    }
    if (!NameHelper.isStation(id) && !NameHelper.isSystem(id)) {
        try {
            const structure = await StructureHelper.resolveStructure(id, client, characterId);
            if (structure !== undefined && structure.name !== undefined) {
                return structure.name;
            }
        } catch (err) {}
        return `Structure #${id} (no access)`;
    }
    return `Location #${id}`;
}

class Character {
    constructor(id, name) {
        if (id !== undefined) {
            id = id.toString();
            this.id = id;
        }

        this.name = name;
        this.skills = [];
        this.skillQueue = [];
        this.skillTree = [];
        this.nextRefreshes = {};
        this.contractSlotsUsed = 0;
        this.mails = [];
        this.mailLabels = {};
        this.mailingLists = {};
    }

    // Lists and maps the UI iterates over must always exist, even if a refresh returned nothing (an empty ESI response
    // is undefined) or saved data predates them. Called after loading and after each refresh that sets one.
    normalize() {
        ['skills', 'skillQueue', 'skillTree', 'mails'].forEach(key => {
            if (!Array.isArray(this[key])) {
                this[key] = [];
            }
        });
        ['nextRefreshes', 'mailLabels', 'mailingLists'].forEach(key => {
            if (this[key] === null || typeof this[key] !== 'object' || Array.isArray(this[key])) {
                this[key] = {};
            }
        });
        return this;
    }

    // A character's data loads piece by piece (and a piece can fail), so the UI uses these instead of assuming it's there.
    getDisplayName() {
        return this.name || `Character #${this.id}`;
    }

    portraitUrl(size = 128) {
        const key = `px${size}x${size}`;
        return (this.portraits && (this.portraits[key] || this.portraits.px128x128)) || ImageHelper.characterPortrait(this.id, size);
    }

    getCorporationName() {
        return this.corporation !== undefined && this.corporation.name !== undefined ? this.corporation.name : 'Loading corporation…';
    }

    getAllianceName() {
        return this.alliance !== undefined && this.alliance.name !== undefined ? this.alliance.name : undefined;
    }

    // basic info (name and corporation) has loaded, so the character's pages can be shown
    hasBasicInfo() {
        return this.name !== undefined && this.corporation !== undefined;
    }

    getCurrentSkill() {
        const currentDate = new Date();

        for(let o of this.skillQueue) {
            if ((o.hasOwnProperty('finish_date')) && (new Date(o.finish_date) > currentDate)) {
                return o;
            }
        }

        return undefined;
    }

    getFinishedSkillsInQueue() {
        const currentDate = new Date();

        return this.skillQueue.filter((o) => {
            return (o.hasOwnProperty('finish_date')) && (new Date(o.finish_date) < currentDate);
        });
    }

    getMails() {
        return this.mails
    }

    // unread mail received (label 2 is the outbox, so mail the character sent doesn't count)
    getUnreadMailCount() {
        return (this.mails || []).filter(m => this.isMailUnread(m)).length;
    }

    // Unread in EVE, not sent by the character, and not marked read in PodStack (EVE's own read state can't be
    // changed without another scope, so "Mark all read" remembers which mails were seen; a new one counts again).
    isMailUnread(mail) {
        return !mail.is_read && !(mail.labels || []).includes(2) && !(this.seenMailIds || []).includes(mail.mail_id);
    }

    markAllMailsRead() {
        this.seenMailIds = (this.mails || []).filter(m => !m.is_read).map(m => m.mail_id);
        this.save();
    }

    getMailLabels() {
        return this.mailLabels
    }

    getLastSkill() {
        let lastDate = new Date();
        let lastSkill = undefined;

        for(let o of this.skillQueue) {
            if ((o.hasOwnProperty('finish_date')) && (new Date(o.finish_date) > lastDate)) {
                lastSkill = o;
                lastDate = new Date(o.finish_date);
            }
        }

        return lastSkill;
    }

    getCurrentSpPerMillisecond() {
        let currentSkill = this.getCurrentSkill();
        if (currentSkill === undefined) {
            return 0;
        }

        let startingSp = currentSkill.training_start_sp;
        let startingMilliseconds = new Date(currentSkill.start_date).getTime();
        let endingSp = currentSkill.level_end_sp;
        let endingMilliseconds = new Date(currentSkill.finish_date).getTime();
        return (endingSp - startingSp) / (endingMilliseconds - startingMilliseconds);
    }

    getCurrentSpPerHour() {
        return Math.round(this.getCurrentSpPerMillisecond() * 1000 * 3600);
    }

    getInjectorsReady(baseSp) {
        if (baseSp === undefined) {
            baseSp = 5000000;
        }

        return Math.max(0, Math.floor((this.getTotalSp() - baseSp) / 500000));
    }

    getNextInjectorDate(baseSp) {
        if (baseSp === undefined) {
            baseSp = 5000000;
        }

        const currentSp = this.getTotalSp();
        const nextInjectorTotalSp = baseSp + ((this.getInjectorsReady(baseSp) + 1) * 500000);

        const spNeeded = nextInjectorTotalSp - currentSp;
        const millisecondsToTrainSp = spNeeded / this.getCurrentSpPerMillisecond();

        return new Date(new Date().getTime() + millisecondsToTrainSp);
    }

    /**
     * Determining total SP is quite challenging. This is the method:
     *
     *  * Iterate over all skills the character has
     *  * If a skill is the currently training skill, we completely ignore the skillpoints_in_skill which CCP gives us.
     *    Instead, we use the training_start_sp figure from the queue, and then add on the projected SP which the
     *    character will have trained since the start_date.
     *  * Else if a skill is in the queue at least once listed as finished, we start with the skillpoints_in_skill
     *    figure for the skill. We then add on the difference between the end and start sp for each finished level of
     *    the skill in the queue.
     *  * Else, the skill is not in any way in the queue, and we can simply use the skillpoints_in_skill figure
     *
     * Note that this will NOT be accurate if the character is currently using a cerebral accelerator (boosters are not
     * shown in the API).
     *
     * @returns int projected character sp at this moment in time
     */
    getTotalSp() {
        let totalSp = 0;

        let currentSkill = this.getCurrentSkill();
        if (currentSkill === undefined) {
            return this.total_sp;
        }

        const finishedSkills = this.getFinishedSkillsInQueue();
        const finishedSkillIds = finishedSkills.map(o => o.skill_id);
        for(let skill of this.skills) {
            if (skill.skill_id === currentSkill.skill_id) {
                let startingMilliseconds = new Date(currentSkill.start_date).getTime();
                let millisecondsPassed = new Date().getTime() - startingMilliseconds;
                let additionalTrainedSp = millisecondsPassed * this.getCurrentSpPerMillisecond();
                totalSp += (currentSkill.training_start_sp + additionalTrainedSp);
            } else if (finishedSkillIds.includes(skill.skill_id)) {
                const queueEntries = finishedSkills.filter(o => o.skill_id === skill.skill_id);

                for(let queueEntry of queueEntries) {
                    totalSp += (queueEntry.level_end_sp - queueEntry.training_start_sp);
                }

                totalSp += skill.skillpoints_in_skill;
            } else {
                totalSp += skill.skillpoints_in_skill;
            }
        }

        return Math.floor(totalSp);
    }

    /**
     * How fast the current skill really trains (from EVE's skill queue) compared with full Omega speed for the
     * character's attributes: about 1 for Omega, 0.5 for Alpha, more with an accelerator the attributes don't include.
     *
     * @returns {number|undefined} undefined when nothing is training or the numbers aren't there
     */
    getTrainingSpeedRatio() {
        const skill = this.getCurrentSkill();
        const info = skill !== undefined ? AllSkills.skills[skill.skill_id] : undefined;
        if (info === undefined || this.attributes === undefined) {
            return undefined;
        }

        const hours = (new Date(skill.finish_date) - new Date(skill.start_date)) / 3600000;
        const fullSpeed = ((this.attributes[info.primary_attribute] || 0) + (this.attributes[info.secondary_attribute] || 0) / 2) * 60;
        if (!(hours > 0.05) || !(fullSpeed > 0) || !(skill.level_end_sp > skill.training_start_sp)) {
            return undefined;
        }
        return (skill.level_end_sp - skill.training_start_sp) / hours / fullSpeed;
    }

    isOmega() {
        // the training speed tells: Alpha clones train at half speed
        const ratio = this.getTrainingSpeedRatio();
        if (ratio !== undefined) {
            if (ratio >= 0.9) {
                return true;
            }
            if (ratio >= 0.45 && ratio <= 0.56) {
                return false;
            }
        }

        // if they have >5 mil sp and a skill actively training, must be omega
        if ((this.total_sp > 5000000) && (this.getCurrentSkill() != null)) {
            return true;
        }

        // if they have any skills with trained level > active, must be alpha
        if (this.skills.find(o => o.trained_skill_level > o.active_skill_level) !== undefined) {
            return false;
        }

        // if they have any skills with a higher active level than the maximum alpha level, must be omega

        if (this.skills.find(o => o.active_skill_level > 0 &&
                (
                    !alphaSkillSet.hasOwnProperty(o.skill_name) ||
                    o.active_skill_level > alphaSkillSet[o.skill_name]
                )
            ) !== undefined) {
            return true;
        }

        // if they have queued skills starting more than 24 hours from now, must be omega
        if ((this.skillQueue || []).find(o =>
                o.finish_date !== undefined && new Date(o.start_date).getTime() > Date.now() + 24 * 3600 * 1000
            ) !== undefined) {
            return true;
        }

        // no definitive answer
        return undefined;
    }

    getFatigueInfo() {
        if ((this.fatigue === undefined) || (this.fatigue.last_jump_date === undefined)) {
            return undefined;
        }

        const lastJumpDate = new Date(this.fatigue.last_jump_date);
        const blueTimerExpiryDate = new Date(this.fatigue.jump_fatigue_expire_date);
        const redTimerExpiryDate = new Date(this.fatigue.last_update_date);
        const curDate = new Date();

        return {
            last_jump: {
                date: lastJumpDate,
                relative: `${DateTimeHelper.timeSince(lastJumpDate)} ago `,
            },

            blue_timer_expiry: {
                date: blueTimerExpiryDate,
                relative: (blueTimerExpiryDate > curDate) ? DateTimeHelper.timeUntil(blueTimerExpiryDate) : 'None',
            },

            red_timer_expiry: {
                date: redTimerExpiryDate,
                relative: (redTimerExpiryDate > curDate) ? DateTimeHelper.timeUntil(redTimerExpiryDate) : 'None',
            },
        };
    }

    getCloneJumpAvailable() {
        const synchro = this.skills.find(o => o.skill_name === 'Infomorph Synchronizing');
        const millisecReduction = (synchro !== undefined) ? synchro.active_skill_level * 3600 * 1000 : 0;

        const lastJumpDate = new Date(this.last_clone_jump_date);
        const nextJumpDate = new Date(lastJumpDate.getTime() + (24 * 3600 * 1000) - millisecReduction);

        return {
            date: nextJumpDate,
            relative: (nextJumpDate > new Date()) ? DateTimeHelper.timeUntil(nextJumpDate) : 'Now'
        };
    }

    getMaxClones() {
        const psycho = this.skills.find(o => o.skill_name === 'Infomorph Psychology');
        const advPsycho = this.skills.find(o => o.skill_name === 'Advanced Infomorph Psychology');

        if (advPsycho !== undefined) {
            return psycho.active_skill_level + advPsycho.active_skill_level;
        } else if (psycho !== undefined) {
            return psycho.active_skill_level;
        } else {
            return 0;
        }
    }

    getMaxContracts() {
        const contracting = this.skills.find(o => o.skill_name === 'Contracting');

        if (contracting !== undefined) {
            return 1 + (contracting.active_skill_level * 4)
        } else {
            return 1;
        }
    }

    buildSkillTree() {
        let groups = {};

        for(const skill of this.skills) {
            if (!groups.hasOwnProperty(skill.skill_group_name)) {
                groups[skill.skill_group_name] = [];
            }

            groups[skill.skill_group_name].push(skill);
        }

        let groupsArray = [];
        for(const groupName in groups) {
            if (groups.hasOwnProperty(groupName)) {
                let skills = groups[groupName];
                skills.sort((a, b) => a.skill_name.localeCompare(b.skill_name));

                groupsArray.push({
                    name: groupName,
                    skills: skills,
                    total_sp: skills.reduce((total, skill) => total + skill.skillpoints_in_skill, 0)
                });
            }
        }

        groupsArray.sort((a, b) => a.name.localeCompare(b.name));

        this.skillTree = groupsArray;
    }

    async refreshAll(onProgress) {
        const report = onProgress || (() => {});

        // first refresh basic info which will be needed for the rest of the calls
        report({label: 'character info', done: 0, total: 0});
        await this.refreshInfo();

        // refresh access token if needed, enforce 60 second validity to prevent chance of a mid data pull refresh
        report({label: 'access token', done: 0, total: 0});
        await AuthorizedCharacter.get(this.id).getAccessToken(60);

        const tasks = [
            ['portrait', () => this.refreshPortrait()],
            ['skills', () => this.refreshSkills()],
            ['skill queue', () => this.refreshSkillQueue()],
            ['attributes', () => this.refreshAttributes()],
            ['corporation', () => this.refreshCorporation()],
            ['alliance', () => this.refreshAlliance()],
            ['wallet', () => this.refreshWallet()],
            ['wallet journal', () => this.refreshWalletJournal()],
            ['wallet transactions', () => this.refreshWalletTransactions()],
            ['implants', () => this.refreshImplants()],
            ['jump clones', () => this.refreshJumpClones()],
            ['location', () => this.refreshLocation()],
            ['ship', () => this.refreshShip()],
            ['fatigue', () => this.refreshFatigue()],
            ['loyalty points', () => this.refreshLoyaltyPoints()],
            ['contracts', () => this.refreshContracts()],
            ['mails', () => this.refreshMails()],
            ['mail labels', () => this.refreshMailLabels()],
            ['mailing lists', () => this.refreshMailingLists()],
            ['assets', () => this.refreshAssets()],
            ['industry jobs', () => this.refreshIndustryJobs()],
            ['planets', () => this.refreshPlanets()],
            ['market orders', () => this.refreshMarketOrders()],
            ['standings', () => this.refreshStandings()],
            ['research agents', () => this.refreshResearchAgents()],
            ['notifications', () => this.refreshNotifications()],
            ['calendar', () => this.refreshCalendar()],
            ['killmails', () => this.refreshKillmails()],
            ['medals', () => this.refreshMedals()],
            ['contacts', () => this.refreshContacts()],
            ['factional warfare', () => this.refreshFwStats()],
        ];

        // asynchronously fetch all the other information and return a promise which resolves when everything is fetched
        const pending = new Set(tasks.map(([label]) => label));
        let done = 0;
        report({label: [...pending].join(', '), done, total: tasks.length});

        try {
            return await Promise.all(tasks.map(([label, task]) => task().finally(() => {
                pending.delete(label);
                done++;
                report({label: [...pending].join(', '), done, total: tasks.length});
            })));
        } finally {
            // with attributes, implants and the skill queue all current, look for a cerebral accelerator
            AcceleratorHelper.update(this);
            this.save();
        }
    }

    getDateOfBirth() {
        return new Date(this.birthday);
    }

    getNextYearlyRemapDate() {
        const remapAvailable = new Date(this.attributes.accrued_remap_cooldown_date);
        return remapAvailable > new Date() ? remapAvailable : true;
    }

    async refreshInfo() {
        if (this.shouldRefresh('character_info')) {
            let client = new EsiClient();
            let charData = await client.get('characters/' + this.id);
            Object.assign(this, charData);
            this.save();
            this.markRefreshed('character_info');
        }
    }

    async refreshPortrait() {
        if (this.shouldRefresh('portrait')) {
            let client = new EsiClient();
            this.portraits = await client.get('characters/' + this.id + '/portrait');
            this.save();
            this.markRefreshed('portrait');
        }
    }

    async refreshCorporation() {
        if (this.shouldRefresh('corporation')) {
            let client = new EsiClient();
            this.corporation = await client.get('corporations/' + this.corporation_id);
            this.save();
            this.markRefreshed('corporation');
        }
    }

    async refreshAlliance() {
        if (this.shouldRefresh('alliance')) {
            if (this.alliance_id !== undefined) {
                let client = new EsiClient();
                this.alliance = await client.get('alliances/' + this.alliance_id);
                this.save();
                this.markRefreshed('alliance');
            }
        }
    }

    async refreshSkills() {
        if (this.shouldRefresh('skills')) {
            let client = new EsiClient();
            await client.authChar(AuthorizedCharacter.get(this.id));

            let skillData = await client.get('characters/' + this.id + '/skills');
            Object.assign(this, skillData || {});
            this.normalize();
            if (!skillData.hasOwnProperty('unallocated_sp')) {
                this.unallocated_sp = 0;
            }

            const spRequirements = {};
            spRequirements[0] = [0];
            for(const a of [1, 2, 3, 4, 5]) {
                spRequirements[a] = [];
                for(const b of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) {
                    const x = Math.round(250 * b * Math.pow(Math.sqrt(32), a - 1));
                    spRequirements[a].push(x);
                    spRequirements[a].push(x + 1);
                }
            }

            let promises = this.skills.map((o) => {
                return TypeHelper.resolveType(o.skill_id).then(res => {
                    o.skill_name = res.name;
                    o.skill_group_name = res.group.name;
                    o.half_trained = !spRequirements[parseInt(o.trained_skill_level)].includes(o.skillpoints_in_skill);
                    return o;
                });
            });

            await Promise.all(promises);

            this.buildSkillTree();

            this.save();
            this.markRefreshed('skills');
        }
    }

    async refreshSkillQueue() {
        if (this.shouldRefresh('skill_queue')) {
            let client = new EsiClient();
            await client.authChar(AuthorizedCharacter.get(this.id));

            this.skillQueue = await client.get('characters/' + this.id + '/skillqueue');
            this.normalize();

            let promises = this.skillQueue.map((o) => {
                return TypeHelper.resolveType(o.skill_id).then(res => {
                    o.skill_name = res.name;
                    return o;
                });
            });

            await Promise.all(promises);

            this.save();
            this.markRefreshed('skill_queue');
        }
    }

    async refreshAttributes() {
        if (this.shouldRefresh('attributes')) {
            let client = new EsiClient();
            await client.authChar(AuthorizedCharacter.get(this.id));

            this.attributes = await client.get('characters/' + this.id + '/attributes');
            this.save();
            this.markRefreshed('attributes');
        }
    }

    async refreshImplants() {
        if (this.shouldRefresh('implants')) {
            let client = new EsiClient();
            await client.authChar(AuthorizedCharacter.get(this.id));

            let implantIds = await client.get('characters/' + this.id + '/implants');
            this.implants = [];
            for (let id of implantIds) {
                this.implants.push({id: id});
            }

            let promises = this.implants.map((o) => {
                return TypeHelper.resolveType(o.id).then(res => {
                    o.name = res.name;
                    o.dogmaAttributes = res.dogma_attributes;
                    return o;
                });
            });

            await Promise.all(promises);

            this.save();
            this.markRefreshed('implants');
        }
    }

    async refreshJumpClones() {
        if (this.shouldRefresh('clones')) {
            let client = new EsiClient();
            await client.authChar(AuthorizedCharacter.get(this.id));

            let cloneData = await client.get('characters/' + this.id + '/clones');

            // last jump
            this.last_clone_jump_date = cloneData.last_clone_jump_date;

            // home location
            this.home_location = cloneData.home_location;
            if (this.home_location.location_type === 'station') {
                const station = await StationHelper.resolveStation(this.home_location.location_id);
                delete station.system.planets;
                this.home_location.location = station;
            } else if (this.home_location.location_type === 'structure') {
                const structure = await StructureHelper.resolveStructure(this.home_location.location_id, client, this.id);
                if (structure !== undefined) {
                    delete structure.system.planets;
                    this.home_location.location = structure;
                }
            }

            // general jump clone data + resolve implant names/dogma attributes in the clones
            let promises = [];
            this.jumpClones = [];
            for (let jumpCloneData of cloneData.jump_clones) {
                let jumpClone = {};

                jumpClone.implants = [];
                for (let id of jumpCloneData.implants) {
                    jumpClone.implants.push({id: id});
                }

                Array.prototype.push.apply(promises, jumpClone.implants.map((o) => {
                    return TypeHelper.resolveType(o.id).then(res => {
                        o.name = res.name;
                        o.dogmaAttributes = res.dogma_attributes;
                        return o;
                    });
                }));

                delete jumpCloneData.implants;
                Object.assign(jumpClone, jumpCloneData);

                this.jumpClones.push(jumpClone);
            }

            // resolve locations
            const that = this;
            Array.prototype.push.apply(promises, this.jumpClones.map((o) => {
                if (o.location_type === "station") {
                    return StationHelper.resolveStation(o.location_id).then(station => {
                        delete station.system.planets;
                        o.location = station;
                        return o;
                    });
                } else if (o.location_type === "structure") {
                    return StructureHelper.resolveStructure(o.location_id, client, that.id).then(structure => {
                        if (structure !== undefined) {
                            delete structure.system.planets;
                            o.location = structure;
                        }
                        return o;
                    });
                } else {
                    return Promise.resolve(undefined); // unknown location type (wtf? this won't happen, if it does, smths changed with jump clones)
                }
            }));

            await Promise.all(promises);

            this.save();
            this.markRefreshed('clones');
        }
    }

    async refreshLocation() {
        if (this.shouldRefresh('location')) {
            let client = new EsiClient();
            await client.authChar(AuthorizedCharacter.get(this.id));

            this.location = await client.get('characters/' + this.id + '/location');

            // standardising solar_system_id --> system_id since ccp is indecisive
            this.location.system_id = this.location.solar_system_id;
            delete this.location.solar_system_id;
            this.location.system = await SystemHelper.resolveSystem(this.location.system_id);

            // lookup station/structure
            if (this.location.station_id !== undefined) {
                const station = await StationHelper.resolveStation(this.location.station_id);
                delete station.system.planets;
                this.location.location = station;
            } else if (this.location.structure_id !== undefined) {
                const structure = await StructureHelper.resolveStructure(this.location.structure_id, client, this.id);
                if (structure !== undefined) {
                    delete structure.system.planets;
                    this.location.location = structure;
                }
            }

            this.save();
            this.markRefreshed('location');
        }
    }

    async refreshShip() {
        if (this.shouldRefresh('ship')) {
            let client = new EsiClient();
            await client.authChar(AuthorizedCharacter.get(this.id));

            this.ship = await client.get('characters/' + this.id + '/ship');
            this.ship.type = await TypeHelper.resolveType(this.ship.ship_type_id);

            this.save();
            this.markRefreshed('ship');
        }
    }

    async refreshWallet() {
        if (this.shouldRefresh('wallet')) {
            let client = new EsiClient();
            await client.authChar(AuthorizedCharacter.get(this.id));

            this.balance = await client.get('characters/' + this.id + '/wallet');
            this.save();
            this.markRefreshed('wallet');
        }
    }

    // The last 30 days of ISK movements (ESI keeps no more), newest first, with the parties' names resolved.
    async refreshWalletJournal() {
        if (this.shouldRefresh('wallet_journal')) {
            const client = new EsiClient();
            await client.authChar(AuthorizedCharacter.get(this.id));

            try {
                const raw = await client.getAllPages('characters/' + this.id + '/wallet/journal',
                    'esi-wallet.read_character_wallet.v1'
                );
                const names = await NameHelper.resolve([
                    ...raw.map(e => e.first_party_id),
                    ...raw.map(e => e.second_party_id),
                ]);

                this.walletJournal = raw
                    .map(e => ({
                        id: e.id,
                        date: e.date,
                        ref_type: e.ref_type,
                        amount: e.amount || 0,
                        balance: e.balance,
                        description: e.description,
                        reason: e.reason,
                        first_party: names[e.first_party_id],
                        second_party: names[e.second_party_id],
                        tax: e.tax,
                    }))
                    .sort((a, b) => new Date(b.date) - new Date(a.date));

                this.markRefreshed('wallet_journal');
            } catch (err) {
                if (err === 'Scope missing') {
                    this.markFailedNoScope('wallet_journal');
                }
            }

            this.save();
        }
    }

    // Market buys and sells, newest first (ESI returns the latest 2500), with item, client and location names.
    async refreshWalletTransactions() {
        if (this.shouldRefresh('wallet_transactions')) {
            const client = new EsiClient();
            await client.authChar(AuthorizedCharacter.get(this.id));

            try {
                const raw = await client.get('characters/' + this.id + '/wallet/transactions',
                    'esi-wallet.read_character_wallet.v1'
                ) || [];
                const locationIds = [...new Set(raw.map(t => t.location_id))];
                const names = await NameHelper.resolve([
                    ...raw.map(t => t.type_id),
                    ...raw.map(t => t.client_id),
                    ...locationIds.filter(id => NameHelper.isStation(id)),
                ]);

                const locations = {};
                for (const id of locationIds) {
                    locations[id] = await resolveLocationName(id, client, this.id, names);
                }

                this.walletTransactions = raw
                    .map(t => ({
                        id: t.transaction_id,
                        date: t.date,
                        type_id: t.type_id,
                        name: names[t.type_id] || `Type #${t.type_id}`,
                        quantity: t.quantity,
                        unit_price: t.unit_price,
                        is_buy: t.is_buy,
                        client: names[t.client_id],
                        location: locations[t.location_id],
                    }))
                    .sort((a, b) => new Date(b.date) - new Date(a.date));

                this.markRefreshed('wallet_transactions');
            } catch (err) {
                if (err === 'Scope missing') {
                    this.markFailedNoScope('wallet_transactions');
                }
            }

            this.save();
        }
    }

    // Runs fetch(client) for a data type that needs a scope, when it's due: marks it refreshed when that works, as
    // failing for want of the scope when the login lacks it, and leaves it due otherwise (retried next time).
    async refreshScoped(type, fetch) {
        if (!this.shouldRefresh(type)) {
            return;
        }

        const client = new EsiClient();
        await client.authChar(AuthorizedCharacter.get(this.id));
        try {
            await fetch(client);
            this.markRefreshed(type);
        } catch (err) {
            if (err === 'Scope missing') {
                this.markFailedNoScope(type);
            }
        }
        this.save();
    }

    // Active market orders and those that ended in the last 90 days (filled, expired or cancelled), newest first.
    async refreshMarketOrders() {
        const scope = 'esi-markets.read_character_orders.v1';
        await this.refreshScoped('market_orders', async client => {
            const active = (await client.get('characters/' + this.id + '/orders', scope) || []).map(o => ({...o, state: 'active'}));
            const history = await client.getAllPages('characters/' + this.id + '/orders/history', scope);
            const raw = [...active, ...history];

            const locationIds = [...new Set(raw.map(o => o.location_id))];
            const names = await NameHelper.resolve([
                ...raw.map(o => o.type_id),
                ...raw.map(o => o.region_id),
                ...locationIds.filter(id => NameHelper.isStation(id)),
            ]);
            const locations = {};
            for (const id of locationIds) {
                locations[id] = await resolveLocationName(id, client, this.id, names);
            }

            this.marketOrders = raw
                .filter(o => !o.is_corporation)
                .map(o => ({
                    order_id: o.order_id,
                    type_id: o.type_id,
                    name: names[o.type_id] || `Type #${o.type_id}`,
                    is_buy_order: o.is_buy_order === true,
                    price: o.price,
                    volume_total: o.volume_total,
                    volume_remain: o.volume_remain,
                    min_volume: o.min_volume,
                    range: o.range,
                    issued: o.issued,
                    duration: o.duration,
                    escrow: o.escrow,
                    // ESI reports filled orders as expired with nothing left
                    state: o.state === 'expired' && o.volume_remain === 0 ? 'filled' : o.state,
                    location: locations[o.location_id],
                    region: names[o.region_id],
                }))
                .sort((a, b) => new Date(b.issued) - new Date(a.issued));
        });
    }

    async refreshStandings() {
        await this.refreshScoped('standings', async client => {
            const raw = await client.get('characters/' + this.id + '/standings', 'esi-characters.read_standings.v1') || [];
            const names = await NameHelper.resolve(raw.map(s => s.from_id));
            this.standings = raw.map(s => ({...s, name: names[s.from_id] || `#${s.from_id}`}));
        });
    }

    async refreshResearchAgents() {
        await this.refreshScoped('research_agents', async client => {
            const raw = await client.get('characters/' + this.id + '/agents_research', 'esi-characters.read_agents_research.v1') || [];
            const names = await NameHelper.resolve([...raw.map(a => a.agent_id), ...raw.map(a => a.skill_type_id)]);
            this.researchAgents = raw.map(a => ({
                ...a,
                agent_name: names[a.agent_id] || `Agent #${a.agent_id}`,
                skill_name: names[a.skill_type_id] || `Skill #${a.skill_type_id}`,
            }));
        });
    }

    // In-game notifications (ESI returns the latest few hundred), newest first.
    async refreshNotifications() {
        await this.refreshScoped('notifications', async client => {
            const raw = await client.get('characters/' + this.id + '/notifications', 'esi-characters.read_notifications.v1') || [];
            // only ids universe/names knows (a structure or "other" sender would fail the whole lookup)
            const names = await NameHelper.resolve(raw
                .filter(n => ['character', 'corporation', 'alliance', 'faction'].includes(n.sender_type))
                .map(n => n.sender_id));
            this.eveNotifications = raw
                .map(n => ({
                    notification_id: n.notification_id,
                    type: n.type,
                    timestamp: n.timestamp,
                    is_read: n.is_read === true,
                    sender_type: n.sender_type,
                    sender_name: names[n.sender_id],
                    text: n.text,
                }))
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        });
    }

    getUnreadNotificationCount() {
        return (this.eveNotifications || []).filter(n => this.isNotificationUnread(n)).length;
    }

    // Unread in EVE and not marked read in PodStack (ESI can't mark notifications read, so "Mark all read" remembers
    // which were seen; a new one counts again).
    isNotificationUnread(notification) {
        return !notification.is_read && !(this.seenNotificationIds || []).includes(notification.notification_id);
    }

    markAllNotificationsRead() {
        this.seenNotificationIds = (this.eveNotifications || []).filter(n => !n.is_read).map(n => n.notification_id);
        this.save();
    }

    // Upcoming calendar events (ESI gives the next 50), soonest first.
    async refreshCalendar() {
        await this.refreshScoped('calendar', async client => {
            const raw = await client.get('characters/' + this.id + '/calendar', 'esi-calendar.read_calendar_events.v1') || [];
            this.calendarEvents = raw.sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
        });
    }

    // The 50 most recent kills and losses. A killmail never changes, so ones already loaded are kept as they are.
    async refreshKillmails() {
        await this.refreshScoped('killmails', async client => {
            const recent = (await client.getAllPages('characters/' + this.id + '/killmails/recent', 'esi-killmails.read_killmails.v1'))
                .sort((a, b) => b.killmail_id - a.killmail_id)
                .slice(0, 50);
            const known = new Map((this.killmails || []).map(k => [k.killmail_id, k]));

            const fetched = [];
            for (const {killmail_id, killmail_hash} of recent.filter(k => !known.has(k.killmail_id))) {
                try {
                    fetched.push({hash: killmail_hash, ...await new EsiClient().get(`killmails/${killmail_id}/${killmail_hash}`)});
                } catch (err) {}
            }

            const finalBlow = km => km.attackers.find(a => a.final_blow) || km.attackers[0] || {};
            const names = await NameHelper.resolve(fetched.flatMap(km => [
                km.victim.character_id, km.victim.corporation_id, km.victim.alliance_id, km.victim.ship_type_id,
                km.solar_system_id, finalBlow(km).character_id, finalBlow(km).corporation_id, finalBlow(km).ship_type_id,
            ]));
            for (const km of fetched) {
                const fb = finalBlow(km);
                known.set(km.killmail_id, {
                    killmail_id: km.killmail_id,
                    hash: km.hash,
                    time: km.killmail_time,
                    loss: String(km.victim.character_id) === this.id,
                    victim: {
                        character_id: km.victim.character_id,
                        name: names[km.victim.character_id] || names[km.victim.corporation_id] || 'Structure',
                        corporation: names[km.victim.corporation_id],
                        alliance: names[km.victim.alliance_id],
                        ship_type_id: km.victim.ship_type_id,
                        ship: names[km.victim.ship_type_id] || `Type #${km.victim.ship_type_id}`,
                        damage_taken: km.victim.damage_taken,
                    },
                    final_blow: {
                        name: names[fb.character_id] || names[fb.corporation_id] || 'NPC',
                        ship: names[fb.ship_type_id],
                    },
                    attackers: km.attackers.length,
                    system: names[km.solar_system_id] || `System #${km.solar_system_id}`,
                });
            }

            this.killmails = recent.map(k => known.get(k.killmail_id)).filter(k => k !== undefined);
        });
    }

    async refreshMedals() {
        await this.refreshScoped('medals', async client => {
            const raw = await client.get('characters/' + this.id + '/medals', 'esi-characters.read_medals.v1') || [];
            const names = await NameHelper.resolve(raw.flatMap(m => [m.corporation_id, m.issuer_id]));
            this.medals = raw
                .map(m => ({
                    medal_id: m.medal_id,
                    title: m.title,
                    description: m.description,
                    reason: m.reason,
                    date: m.date,
                    status: m.status,
                    corporation_id: m.corporation_id,
                    corporation: names[m.corporation_id],
                    issuer: names[m.issuer_id],
                }))
                .sort((a, b) => new Date(b.date) - new Date(a.date));
        });
    }

    async refreshContacts() {
        const scope = 'esi-characters.read_contacts.v1';
        await this.refreshScoped('contacts', async client => {
            const raw = await client.getAllPages('characters/' + this.id + '/contacts', scope);
            let labels = [];
            try {
                labels = await client.get('characters/' + this.id + '/contacts/labels', scope) || [];
            } catch (err) {}
            const labelNames = Object.fromEntries(labels.map(l => [l.label_id, l.label_name]));
            const names = await NameHelper.resolve(raw.map(c => c.contact_id));

            this.contacts = raw.map(c => ({
                contact_id: c.contact_id,
                contact_type: c.contact_type,
                name: names[c.contact_id] || `#${c.contact_id}`,
                standing: c.standing,
                is_watched: c.is_watched === true,
                is_blocked: c.is_blocked === true,
                labels: (c.label_ids || []).map(id => labelNames[id]).filter(Boolean),
            }));
        });
    }

    // Factional warfare enlistment, rank, kills and victory points; faction_id is missing when not enlisted.
    async refreshFwStats() {
        await this.refreshScoped('fw_stats', async client => {
            const stats = await client.get('characters/' + this.id + '/fw/stats', 'esi-characters.read_fw_stats.v1');
            if (stats !== undefined && stats.faction_id !== undefined) {
                const names = await NameHelper.resolve([stats.faction_id]);
                stats.faction = names[stats.faction_id];
            }
            this.fwStats = stats;
        });
    }

    async refreshFatigue() {
        if (this.shouldRefresh('fatigue')) {
            let client = new EsiClient();
            await client.authChar(AuthorizedCharacter.get(this.id));

            try {
                this.fatigue = await client.get('characters/' + this.id + '/fatigue', 'esi-characters.read_fatigue.v1');
                this.markRefreshed('fatigue');
            } catch (err) {
                if (err === 'Scope missing') {
                    this.markFailedNoScope('fatigue');
                }
            }

            this.save();
        }
    }

    async refreshLoyaltyPoints() {
        if (this.shouldRefresh('loyalty_points')) {
            let client = new EsiClient();
            await client.authChar(AuthorizedCharacter.get(this.id));

            try {
                const data = await client.get('characters/' + this.id + '/loyalty/points',
                    'esi-characters.read_loyalty.v1'
                );

                this.loyalty_points = [];
                for(let o of data) {
                    if (o.loyalty_points > 0) {
                        o.corporation = await client.get('corporations/' + o.corporation_id);
                        this.loyalty_points.push(o);
                    }
                }

                this.loyalty_points.sort((a, b) => a.corporation.name.localeCompare(b.corporation.name));

                this.markRefreshed('loyalty_points');
            } catch (err) {
                if (err === 'Scope missing') {
                    this.markFailedNoScope('loyalty_points');
                }
            }

            this.save();
        }
    }

    async refreshContracts() {
        if (this.shouldRefresh('contracts')) {
            let client = new EsiClient();
            await client.authChar(AuthorizedCharacter.get(this.id));

            try {
                this.contracts = await client.get('characters/' + this.id + '/contracts',
                    'esi-contracts.read_character_contracts.v1'
                );

                let resolver = new BulkIdResolver();
                this.contractSlotsUsed = 0;
                for(let contract of this.contracts) {
                    resolver.addId(contract.issuer_id);
                    resolver.addId(contract.issuer_corporation_id);
                    resolver.addId(contract.assignee_id);
                    resolver.addId(contract.acceptor_id);

                    // build used contracts value
                    if (
                        (!appProperties.contract_completed_statuses.includes(contract.status)) &&
                        (contract.issuer_id.toString() === this.id) &&
                        (contract.for_corporation === false) &&
                        (contract.availability !== 'corporation')
                    ) {
                        this.contractSlotsUsed++;
                    }
                }

                await resolver.resolve();

                for(let contract of this.contracts) {
                    contract.issuer = resolver.get(contract.issuer_id);
                    contract.issuer_corporation = resolver.get(contract.issuer_corporation_id);
                    contract.assignee = resolver.get(contract.assignee_id);
                    contract.acceptor = resolver.get(contract.acceptor_id);

                    // start+end locations
                    if (contract.start_location_id !== undefined) {
                        contract.start_location = await LocationHelper.resolveLocation(
                            contract.start_location_id, client, this.id
                        );
                    }
                    if (contract.end_location_id !== undefined) {
                        contract.end_location = await LocationHelper.resolveLocation(
                            contract.end_location_id, client, this.id
                        );
                    }
                }

                this.markRefreshed('contracts');
            } catch (err) {
                if (err === 'Scope missing') {
                    this.markFailedNoScope('contracts');
                }
            }

            this.save();
        }
    }

    async refreshMailLabels() {
        if (this.shouldRefresh('maillabels')) {
            const client = new EsiClient();
            await client.authChar(AuthorizedCharacter.get(this.id));

            try {
                const labels = await client.get('characters/' + this.id + '/mail/labels', 'esi-mail.read_mail.v1');

                const mailLabels = {};
                for (const label of labels) {
                    mailLabels[label.label_id] = label;
                }

                this.mailLabels = mailLabels;

                this.markRefreshed('maillabels');
            } catch (err) {
                if (err === 'Scope missing') {
                    this.markFailedNoScope('mails');
                }
            }

            this.save();
        }
    }
    
    async refreshMailingLists() {
        if (this.shouldRefresh('mailinglists')) {
            const client = new EsiClient();
            await client.authChar(AuthorizedCharacter.get(this.id));

            try {
                const mailingLists = await client.get('characters/' + this.id + '/mail/lists', 'esi-mail.read_mail.v1');

                const lists = {};

                for (const list of mailingLists) {
                    lists[list.mailing_list_id] = list;
                }

                this.mailingLists = lists;

                this.markRefreshed('mailinglists');
            } catch (err) {
                if (err === 'Scope missing') {
                    this.markFailedNoScope('mails');
                }
            }

            this.save();
        }
    }

    async refreshMails() {
        if (this.shouldRefresh('mails')) {
            const client = new EsiClient();
            await client.authChar(AuthorizedCharacter.get(this.id));

            try {
                this.mails = await client.get('characters/' + this.id + '/mail', 'esi-mail.read_mail.v1');
                this.normalize();

                const resolver = new BulkIdResolver();
                for (const mail of this.mails) {
                    // "Welcome" mail from a mailing list, mailing lists will not resolve
                    if (mail.recipients[0].recipient_type === 'mailing_list' && mail.recipients[0].recipient_id == mail.from){
                        mail.from_name = 'Welcome ML';
                    } else {
                        resolver.addId(mail.from);
                    }

                    // resolve any resolveable names
                    for (const recipient of mail.recipients) {
                        if (recipient.recipient_type !== undefined && recipient.recipient_id !== undefined) {
                            switch (recipient.recipient_type) {
                                case 'character':
                                case 'corporation':
                                case 'alliance':
                                    resolver.addId(recipient.recipient_id);
                                    break;
                                default:
                                    break;
                            }
                        }
                    }

                    const labelNames = [];
                    for (const label of mail.labels) {
                        // outbox
                        if (label === 2) {
                            this.is_sent = true;
                        }

                        if (this.mailLabels.hasOwnProperty(label)) {
                            labelNames.push(this.mailLabels[label].name);
                        }
                    }

                    mail.label_names = labelNames;
                    mail.is_sent = mail.hasOwnProperty('is_sent') ? mail.is_sent : false;
                    mail.is_read = mail.hasOwnProperty('is_read') ? mail.is_read : false;

                    mail.subject = mail.subject.replace(/&amp;/g, '&');
                    mail.subject = mail.subject.replace(/&lt;/g, '<');
                    mail.subject = mail.subject.replace(/&gt;/g, '>');
                    mail.subject = mail.subject.replace(/&quot;/g, '"');
                }

                await resolver.resolve();

                for (const mail of this.mails) {
                    if (resolver.get(mail.from) !== undefined) {
                        mail.from_name = resolver.get(mail.from).name;
                    } else if (this.mailingLists[mail.from] !== undefined) {
                        mail.from_name = this.mailingLists[mail.from].name;
                    } else {
                        mail.from_name = '*Unknown*';
                    }

                    for (const recipient of mail.recipients) {
                        if (recipient.recipient_type !== undefined && recipient.recipient_id !== undefined) {
                            switch (recipient.recipient_type) {
                                case 'character':
                                case 'corporation':
                                case 'alliance':
                                    recipient.recipient_name = resolver.get(recipient.recipient_id) !== undefined ? resolver.get(recipient.recipient_id).name : '*Unknown*';
                                    break;
                                case 'mailing_list':
                                    this.mailingLists[recipient.recipient_id] !== undefined ? recipient.recipient_name = this.mailingLists[recipient.recipient_id].name : '*Unknown Mailing List*';
                                    break;
                                default:
                                    recipient.recipient_name = '*Unknown*';
                                    break;
                            }
                        }
                    }

                    mail.body = await MailBodyHelper.retrieveMailBody(mail.mail_id,client,this.id)
                }

                this.markRefreshed('mails');
            } catch (err) {
                if (err === 'Scope missing') {
                    this.markFailedNoScope('mails');
                }
            }

            this.save();
        }
    }

    // Every asset with its type name, the container/ship it's in (parent_id) and the station, structure or system
    // its outermost container is in (root_location_id, named in assetLocations).
    async refreshAssets() {
        if (this.shouldRefresh('assets')) {
            const client = new EsiClient();
            await client.authChar(AuthorizedCharacter.get(this.id));

            try {
                const raw = await client.getAllPages('characters/' + this.id + '/assets', 'esi-assets.read_assets.v1');
                const byId = new Map(raw.map(a => [a.item_id, a]));

                const rootOf = (asset) => {
                    let current = asset;
                    for (let depth = 0; depth < 10 && byId.has(current.location_id); depth++) {
                        current = byId.get(current.location_id);
                    }
                    return current.location_id;
                };

                const roots = [...new Set(raw.map(rootOf))];
                const names = await NameHelper.resolve([
                    ...raw.map(a => a.type_id),
                    ...roots.filter(id => NameHelper.isStation(id) || NameHelper.isSystem(id)),
                ]);

                const locations = {};
                for (const id of roots) {
                    locations[id] = await resolveLocationName(id, client, this.id, names);
                }

                // custom names of ships and containers (anything assembled that holds other items)
                const customNames = {};
                const holders = new Set(raw.map(a => a.location_id));
                const named = raw.filter(a => a.is_singleton && holders.has(a.item_id)).map(a => a.item_id);
                for (let i = 0; i < named.length; i += 1000) {
                    try {
                        const res = await client.post('characters/' + this.id + '/assets/names', 'esi-assets.read_assets.v1',
                            {body: named.slice(i, i + 1000)});
                        res.filter(o => o.name && o.name !== 'None').forEach(o => customNames[o.item_id] = o.name);
                    } catch (err) {}
                }

                this.assets = raw.map(a => ({
                    item_id: a.item_id,
                    type_id: a.type_id,
                    name: names[a.type_id] || `Type #${a.type_id}`,
                    custom_name: customNames[a.item_id],
                    quantity: a.quantity,
                    flag: a.location_flag,
                    parent_id: byId.has(a.location_id) ? a.location_id : undefined,
                    root_location_id: rootOf(a),
                    is_blueprint_copy: a.is_blueprint_copy === true,
                }));
                this.assetLocations = locations;

                this.markRefreshed('assets');
            } catch (err) {
                if (err === 'Scope missing') {
                    this.markFailedNoScope('assets');
                }
            }

            this.save();
        }
    }

    async refreshIndustryJobs() {
        if (this.shouldRefresh('industry_jobs')) {
            const client = new EsiClient();
            await client.authChar(AuthorizedCharacter.get(this.id));

            try {
                const jobs = await client.get('characters/' + this.id + '/industry/jobs', 'esi-industry.read_character_jobs.v1');
                const names = await NameHelper.resolve([
                    ...jobs.map(j => j.blueprint_type_id),
                    ...jobs.map(j => j.product_type_id),
                    ...jobs.map(j => j.station_id).filter(NameHelper.isStation),
                ]);

                for (const job of jobs) {
                    job.blueprint_name = names[job.blueprint_type_id];
                    job.product_name = names[job.product_type_id];
                    job.location_name = await resolveLocationName(job.station_id, client, this.id, names);
                }

                this.industryJobs = jobs;
                this.markRefreshed('industry_jobs');
            } catch (err) {
                if (err === 'Scope missing') {
                    this.markFailedNoScope('industry_jobs');
                }
            }

            this.save();
        }
    }

    // Planetary colonies, each with its extractors (and when they stop), factory count and stored goods.
    async refreshPlanets() {
        if (this.shouldRefresh('planets')) {
            const client = new EsiClient();
            await client.authChar(AuthorizedCharacter.get(this.id));

            try {
                const colonies = await client.get('characters/' + this.id + '/planets', 'esi-planets.manage_planets.v1');

                for (const colony of colonies) {
                    const planet = await new EsiClient().get('universe/planets/' + colony.planet_id);
                    colony.planet_name = planet.name;

                    const layout = await client.get('characters/' + this.id + '/planets/' + colony.planet_id,
                        'esi-planets.manage_planets.v1');
                    const pins = layout.pins || [];

                    colony.extractors = pins.filter(p => p.extractor_details !== undefined).map(p => ({
                        pin_id: p.pin_id,
                        product_type_id: p.extractor_details.product_type_id,
                        qty_per_cycle: p.extractor_details.qty_per_cycle,
                        cycle_time: p.extractor_details.cycle_time,
                        install_time: p.install_time,
                        expiry_time: p.expiry_time,
                    }));
                    colony.factories = pins.filter(p => p.factory_details !== undefined).length;

                    const stored = {};
                    pins.forEach(p => (p.contents || []).forEach(c => stored[c.type_id] = (stored[c.type_id] || 0) + c.amount));
                    colony.storage = Object.entries(stored).map(([typeId, amount]) => ({type_id: parseInt(typeId, 10), amount}));
                }

                const names = await NameHelper.resolve([
                    ...colonies.map(c => c.solar_system_id),
                    ...colonies.flatMap(c => c.extractors.map(e => e.product_type_id)),
                    ...colonies.flatMap(c => c.storage.map(s => s.type_id)),
                ]);
                for (const colony of colonies) {
                    colony.system_name = names[colony.solar_system_id];
                    colony.extractors.forEach(e => e.product_name = names[e.product_type_id]);
                    colony.storage.forEach(s => s.name = names[s.type_id]);
                }

                this.planets = colonies;
                this.markRefreshed('planets');
            } catch (err) {
                if (err === 'Scope missing') {
                    this.markFailedNoScope('planets');
                }
            }

            this.save();
        }
    }

    shouldRefresh(type) {
        return (!this.nextRefreshes.hasOwnProperty(type)) || (new Date(this.nextRefreshes[type].do) < new Date());
    }

    markRefreshed(type) {
        // up to 10% random jitter, so characters added together don't all come due at the same moment
        const interval = appProperties.refresh_intervals[type] * 1000;
        this.nextRefreshes[type] = {
            last: new Date(),
            do: new Date(new Date().getTime() + interval + Math.random() * interval * 0.1)
        };
    }

    // When ESI data was last refreshed (most recent of any data type), or undefined.
    getLastUpdated() {
        const times = Object.values(this.nextRefreshes).map(r => new Date(r.last).getTime()).filter(t => !isNaN(t));
        return times.length > 0 ? new Date(Math.max(...times)) : undefined;
    }

    // When the next automatic refresh of any data type is due, or undefined.
    getNextAutoRefresh() {
        const times = Object.values(this.nextRefreshes)
            .filter(r => r.do !== undefined)
            .map(r => new Date(r.do).getTime())
            .filter(t => !isNaN(t));
        return times.length > 0 ? new Date(Math.min(...times)) : undefined;
    }

    // ms until the "Refresh from ESI" button can be used again (0 = now).
    getManualRefreshWait() {
        if (this.lastManualRefresh === undefined) {
            return 0;
        }
        const ready = new Date(this.lastManualRefresh).getTime() + appProperties.manual_refresh_cooldown * 1000;
        return Math.max(0, ready - Date.now());
    }

    /**
     * Mark a type of data refresh as a failure and that further refresh attempts should not be attempted
     *
     * @param {string} type - data type string, e.g. skills, see properties.js
     * @param {string} reason - failure reason: 'scope', 'token', 'client', 'error'
     * @param {boolean} temporary - if true, failure is expected to only be temporary
     */
    markTypeFailed(type, reason, temporary=false) {
        this.nextRefreshes[type] = {
            last: new Date(),
            do: temporary ? new Date(new Date().getTime() + (300 * 1000)) : undefined,
            error: reason
        };
    }

    /**
     * Mark data refresh for all data types as a failure and that further refresh attempts should not be attempted
     *
     * @param {string} reason - failure reason: 'scope', 'token', 'client', 'error'
     * @param {boolean} temporary - if true, failure is expected to only be temporary
     */
    markFailed(reason, temporary=false) {
        for(const type in this.nextRefreshes) {
            if (this.nextRefreshes.hasOwnProperty(type)) {
                this.markTypeFailed(type, reason, temporary);
            }
        }
    }

    /**
     * @deprecated use markTypeFailed(type, 'scope') instead
     */
    markFailedNoScope(type) {
        this.markTypeFailed(type, 'scope');
    }

    getDataRefreshInfo() {
        let info = [];

        const translations = {
            "character_info": "Character Info",
            "attributes": "Attributes and Remaps",
            "loyalty_points": "Loyalty Points",
            "wallet": "Wallet",
            "wallet_journal": "Wallet Journal",
            "wallet_transactions": "Wallet Transactions",
            "implants": "Active Implants",
            "clones": "Jump Clones",
            "skills": "Skills",
            "skill_queue": "Skill Queue",
            "contracts": "Contracts",
            "location": "Current Location",
            "ship": "Active Ship",
            "fatigue": "Jump Fatigue",
            "mails": "Mails",
            "maillabels": "Mail Labels",
            "mailinglists": "Mailing Lists",
            "assets": "Assets",
            "industry_jobs": "Industry Jobs",
            "planets": "Planetary Colonies",
            "market_orders": "Market Orders",
            "standings": "Standings",
            "research_agents": "Research Agents",
            "notifications": "EVE Notifications",
            "calendar": "Calendar",
            "killmails": "Killmails",
            "medals": "Medals",
            "contacts": "Contacts",
            "fw_stats": "Factional Warfare",
        };

        // TODO: clean this up jfc
        for(const key in translations) {
            if ((this.nextRefreshes.hasOwnProperty(key)) && (translations.hasOwnProperty(key))) {
                let las;
                if (this.nextRefreshes[key].error === undefined) {
                    const lastDate = new Date(this.nextRefreshes[key].last);
                    las = (lastDate.getTime() + 5000 < new Date().getTime()) ?
                        DateTimeHelper.timeSince(lastDate) + " ago" : "Just now";
                } else {
                    switch(this.nextRefreshes[key].error) {
                        case 'scope':
                            las = 'No Scope';
                            break;
                        case 'token':
                            las = 'Token Invalid';
                            break;
                        case 'client':
                            las = 'Client Invalid';
                            break;
                        default:
                            las = 'Error';
                    }
                }

                let nex;
                if (this.nextRefreshes[key].do !== undefined) {
                    const nextDate = new Date(this.nextRefreshes[key].do);
                    nex = (nextDate > new Date()) ? DateTimeHelper.timeUntil(nextDate) : "Due";
                } else {
                    nex = 'Never';
                }

                info.push({
                    type: translations[key],
                    lastRefresh: las,
                    nextRefresh: nex
                });
            }
        }

        return info;
    }

    static markCharacterForForceRefresh(characterId) {
        characterId = characterId.toString();

        if (characters.hasOwnProperty(characterId)) {
            let character = characters[characterId];
            for (const key in character.nextRefreshes) {
                if (character.nextRefreshes.hasOwnProperty(key)) {
                    character.nextRefreshes[key].do = new Date();
                    character.save();
                }
            }
        }
    }

    // Refreshes whatever data is due for every character. Runs every 15 seconds but only calls ESI for data whose
    // refresh time has passed, at most CHARACTERS_AT_ONCE characters at a time (EsiClient also rate limits).
    static async build() {
        if (buildRunning) {
            return;
        }
        buildRunning = true;
        Character.suspendSubscribers();

        try {
            const ids = Object.keys(AuthorizedCharacter.getAll());
            ids.forEach(id => {
                if (!characters.hasOwnProperty(id)) {
                    characters[id] = new Character(id);
                }
            });

            let next = 0;
            const worker = async () => {
                while (next < ids.length) {
                    const character = characters[ids[next++]];
                    try {
                        await character.refreshAll();
                    } catch (err) {}
                }
            };
            await Promise.all(Array.from({length: Math.min(CHARACTERS_AT_ONCE, ids.length)}, worker));
        } finally {
            buildRunning = false;
            Character.pushToSubscribers();
        }
    }

    /**
     * The "Refresh from ESI" button: refreshes all of a character's data now. Allowed once every
     * manual_refresh_cooldown seconds per character; returns false (doing nothing) while cooling down.
     */
    static async refreshNow(characterId, onProgress) {
        const character = characters[characterId.toString()];
        if (character === undefined || character.getManualRefreshWait() > 0) {
            return false;
        }

        character.lastManualRefresh = new Date();
        Character.markCharacterForForceRefresh(characterId);
        await Character.refreshOne(characterId, onProgress);
        return true;
    }

    // Refreshes a single (usually newly authorized) character and pushes the result to the UI straight away,
    // rather than waiting for every other character as build() does.
    static async refreshOne(characterId, onProgress) {
        characterId = characterId.toString();

        if (!characters.hasOwnProperty(characterId)) {
            characters[characterId] = new Character(characterId);
        }

        try {
            await characters[characterId].refreshAll(onProgress);
        } finally {
            Character.pushToSubscribers();
        }

        return characters[characterId];
    }

    static getAll() {
        return characters;
    }

    // Forgets a character's ESI data. See CharacterHelper.removeCharacter for removing a character completely.
    static delete(id) {
        id = id.toString();
        deletedIds.add(id);
        delete characters[id];

        if (charactersSaveTimeout !== undefined) {
            clearTimeout(charactersSaveTimeout);
        }
        charactersStore.set('characters', characters);
        Character.pushToSubscribers();
    }

    static getAllContracts(complete) {
        let contracts = [];
        let contractIds = [];

        for(const id in characters) {
            if (characters.hasOwnProperty(id)) {
                if (characters[id].hasOwnProperty('contracts') && characters[id].contracts !== undefined) {
                    for(const contract of characters[id].contracts) {
                        if (complete !== undefined) {
                            if ((complete === true) && (!appProperties.contract_completed_statuses.includes(contract.status))) {
                                continue;
                            } else if ((complete === false) && (appProperties.contract_completed_statuses.includes(contract.status))) {
                                continue;
                            }
                        }

                        if (!contractIds.includes(contract.contract_id)) {
                            contracts.push(contract);
                            contractIds.push(contract.contract_id);
                        }
                    }
                }
            }
        }

        return contracts;
    }

    static get(id) {
        return characters[id];
    }

    static load() {
        if (characters === undefined) {
            let rawCharacters = charactersStore.get('characters');
            let newCharacters = {};

            if (rawCharacters !== undefined) {
                Object.keys(rawCharacters).map(id => {
                    newCharacters[id.toString()] = new Character();
                    Object.assign(newCharacters[id.toString()], rawCharacters[id]);
                    newCharacters[id.toString()].id = id.toString();
                    newCharacters[id.toString()].normalize();
                });
            }

            characters = newCharacters;
        }
    }

    save() {
        if (characters !== undefined && !deletedIds.has(this.id)) {
            characters[this.id] = this;

            if (charactersSaveTimeout !== undefined) {
                clearTimeout(charactersSaveTimeout);
            }

            charactersSaveTimeout = setTimeout(() => {
                charactersStore.set('characters', characters);
            }, 10000);
        }
    }

    saveImmediately() {
        if (characters !== undefined && !deletedIds.has(this.id)) {
            characters[this.id] = this;

            if (charactersSaveTimeout !== undefined) {
                clearTimeout(charactersSaveTimeout);
            }

            charactersStore.set('characters', characters);
        }
    }

    static subscribe(component) {
        return subscribedComponents.push(component) - 1;
    }

    static unsubscribe(id) {
        subscribedComponents[id] = null;
    }

    static suspendSubscribers() {
        for(let component of subscribedComponents) {
            if (component !== null) {
                component.setState({'ticking': false});
            }
        }
    }

    static pushToSubscribers() {
        for(let component of subscribedComponents) {
            if (component !== null) {
                component.setState({'characters': Object.values(Character.getAll()).sort((a, b) => b.getTotalSp() - a.getTotalSp())});
                component.setState({'ticking': true});
            }
        }
    }
}

Character.load();

setInterval(Character.build, 15000);

export default Character;