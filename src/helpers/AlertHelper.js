'use strict';

// Desktop alerts (configured on the Settings page).
//
// Every minute each alert type lists the conditions that are true right now, each with a stable key (e.g.
// "queue-empty:<character>", "mail:<id>"). A notification is shown only for keys that weren't in the previous list,
// so each event alerts once, a condition that clears and comes back alerts again, and nothing alerts for what was
// already true when PodStack started for the first time (the first check only records the baseline). The previous
// list is saved, so restarting doesn't repeat alerts either. Types that are switched off are still tracked, so
// switching one on doesn't alert for everything that happened while it was off.

import {ipcRenderer} from 'electron';
import Store from 'electron-store';
import log from 'electron-log';

import Character from '../models/Character';
import FarmCharacter from '../models/FarmCharacter';
import IndustryHelper from './IndustryHelper';
import SettingsHelper from './SettingsHelper';
import DateTimeHelper from './DateTimeHelper';

const CHECK_INTERVAL = 60 * 1000;
const LOG_SIZE = 50;
// above this many at once, one summary notification is shown instead
const MAX_SEPARATE = 3;

const alertStore = new Store({name: 'alerts'});
let subscribers = [];

export const ALERT_TYPES = [
    {id: 'queue_empty', label: 'Training stopped', description: 'A skill queue runs out.'},
    {id: 'queue_low', label: 'Skill queue running low', description: 'A skill queue has less time left than the threshold below.'},
    {id: 'omega_lapsed', label: 'Lapsed to Alpha', description: 'A character that was Omega is now Alpha.'},
    {id: 'injector_ready', label: 'Injector ready', description: 'An SP farm has enough SP for another injector.'},
    {id: 'contract_finished', label: 'Contract completed', description: 'One of your contracts is completed.'},
    {id: 'new_mail', label: 'New EVE mail', description: 'An unread mail arrives.'},
    {id: 'fatigue_ended', label: 'Jump fatigue ended', description: 'A character\'s jump fatigue has worn off.'},
    {id: 'industry_ready', label: 'Industry job ready', description: 'An industry job has finished and can be delivered.'},
    {id: 'extractor_expired', label: 'PI extractor stopped', description: 'A planetary extractor has finished its cycle.'},
];

const DEFAULT_SETTINGS = {
    enabled: true,
    queueLowHours: 24,
    types: Object.fromEntries(ALERT_TYPES.map(t => [t.id, t.id !== 'new_mail'])),
};

// Conditions that are true now: [{key, type, characterId, title, body}]
function currentConditions(settings) {
    const conditions = [];
    const now = Date.now();
    const add = (type, key, character, title, body) => conditions.push({key: `${type}:${key}`, type, characterId: character.id, title, body});

    for (const character of Object.values(Character.getAll())) {
        if (character.name === undefined) {
            continue;
        }

        // skill queue: empty, or ending within the threshold
        const last = character.getLastSkill();
        if (last === undefined) {
            if ((character.skillQueue || []).length > 0 || character.isOmega() === true) {
                add('queue_empty', character.id, character, `${character.name}: training stopped`, 'The skill queue is empty.');
            }
        } else {
            const left = new Date(last.finish_date).getTime() - now;
            if (left < settings.queueLowHours * 3600 * 1000) {
                add('queue_low', character.id, character, `${character.name}: skill queue running low`,
                    `Training ends in ${DateTimeHelper.niceCountdown(left)}.`);
            }
        }

        if (character.isOmega() === false) {
            add('omega_lapsed', character.id, character, `${character.name} is now Alpha`, 'Omega has lapsed, so training has slowed or stopped.');
        }

        // one key per injector, so extracting (fewer ready) doesn't alert but each new one does
        const farm = FarmCharacter.get(character.id);
        if (farm !== undefined) {
            const ready = character.getInjectorsReady(farm.baseSp);
            for (let n = 1; n <= ready; n++) {
                add('injector_ready', `${character.id}:${n}`, character, `${character.name}: injector ready`,
                    `${ready} injector${ready === 1 ? '' : 's'} can be extracted.`);
            }
        }

        for (const contract of character.contracts || []) {
            if (['finished', 'finished_issuer', 'finished_contractor'].includes(contract.status)) {
                add('contract_finished', contract.contract_id, character, `${character.name}: contract completed`,
                    contract.title ? `"${contract.title}" (${contract.type})` : `A ${contract.type.replace('_', ' ')} contract.`);
            }
        }

        for (const mail of character.mails || []) {
            if (!mail.is_read && !(mail.labels || []).includes(2)) {
                add('new_mail', mail.mail_id, character, `${character.name}: new mail from ${mail.from_name || 'someone'}`, mail.subject);
            }
        }

        // fatigue that wore off in the last day (the expiry date is part of the key, so each jump alerts once)
        if (character.fatigue !== undefined && character.fatigue.jump_fatigue_expire_date !== undefined) {
            const expiry = new Date(character.fatigue.jump_fatigue_expire_date).getTime();
            if (expiry <= now && now - expiry < 24 * 3600 * 1000) {
                add('fatigue_ended', `${character.id}:${expiry}`, character, `${character.name}: jump fatigue ended`, 'Ready to jump again.');
            }
        }

        for (const job of character.industryJobs || []) {
            if (IndustryHelper.isJobReady(job)) {
                add('industry_ready', job.job_id, character, `${character.name}: industry job ready`,
                    `${IndustryHelper.activityName(job.activity_id)}: ${job.product_name || job.blueprint_name || 'job'} × ${job.runs}`);
            }
        }

        for (const colony of character.planets || []) {
            for (const extractor of colony.extractors || []) {
                if (IndustryHelper.isExtractorExpired(extractor)) {
                    add('extractor_expired', `${colony.planet_id}:${extractor.pin_id}:${extractor.expiry_time}`, character,
                        `${character.name}: extractor stopped`, `${extractor.product_name || 'Extractor'} on ${colony.planet_name}.`);
                }
            }
        }
    }

    return conditions;
}

function show(title, body, characterId) {
    try {
        const notification = new Notification(title, {body, icon: './../resources/icon.png'});
        notification.onclick = () => {
            ipcRenderer.send('window:show');
            if (characterId !== undefined) {
                window.location.hash = `#/characters/${characterId}`;
            }
        };
    } catch (err) {
        log.warn('[Alerts] Couldn\'t show notification', err.message);
    }
}

export default class AlertHelper {
    static getSettings() {
        const saved = SettingsHelper.get('alerts', {});
        return {...DEFAULT_SETTINGS, ...saved, types: {...DEFAULT_SETTINGS.types, ...(saved.types || {})}};
    }

    static setSettings(settings) {
        SettingsHelper.set('alerts', settings);
        AlertHelper.notify();
    }

    // Recent alerts, newest first: [{time, title, body, characterId}]
    static getLog() {
        return alertStore.get('log', []);
    }

    static clearLog() {
        alertStore.set('log', []);
        AlertHelper.notify();
    }

    static test() {
        show('PodStack alerts are working', 'You\'ll be notified like this when something needs your attention.');
    }

    static check() {
        const settings = AlertHelper.getSettings();
        const conditions = currentConditions(settings);
        const previous = alertStore.get('active');
        const knownCharacters = new Set(alertStore.get('characters', []));
        alertStore.set('active', conditions.map(c => c.key));
        alertStore.set('characters', Object.keys(Character.getAll()));

        // first run: only record what's already true
        if (previous === undefined) {
            return;
        }

        // likewise for a newly added character
        const seen = new Set(previous);
        const fresh = conditions.filter(c => !seen.has(c.key) && settings.types[c.type] && knownCharacters.has(c.characterId));
        // one alert per type and character per check (e.g. three new injectors are one alert)
        const unique = [...new Map(fresh.map(c => [`${c.type}:${c.characterId}`, c])).values()];
        if (unique.length === 0) {
            return;
        }

        const entries = unique.map(c => ({time: Date.now(), title: c.title, body: c.body, characterId: c.characterId}));
        alertStore.set('log', [...entries, ...AlertHelper.getLog()].slice(0, LOG_SIZE));
        AlertHelper.notify();

        if (!settings.enabled) {
            return;
        }
        if (unique.length > MAX_SEPARATE) {
            show(`PodStack: ${unique.length} alerts`, unique.map(c => c.title).slice(0, 5).join('\n'));
        } else {
            unique.forEach(c => show(c.title, c.body, c.characterId));
        }
    }

    static start() {
        setInterval(() => {
            try {
                AlertHelper.check();
            } catch (err) {
                log.warn('[Alerts] Check failed', err);
            }
        }, CHECK_INTERVAL);
    }

    static subscribe(callback) {
        subscribers.push(callback);
        return () => subscribers = subscribers.filter(s => s !== callback);
    }

    static notify() {
        subscribers.forEach(s => s());
    }
}
