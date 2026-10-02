'use strict';

import AuthorizedCharacter from '../models/AuthorizedCharacter';
import FarmCharacter from '../models/FarmCharacter';
import SettingsHelper from './SettingsHelper';
import DateTimeHelper from './DateTimeHelper';

export const LOW_QUEUE_OPTIONS = [12, 24, 48, 72, 168];   // hours
const DEFAULT_LOW_QUEUE_HOURS = 24;

// Flag levels, most severe first.
export const CRITICAL = 'critical';
export const WARNING = 'warning';
export const INFO = 'info';

export default class QueueHealthHelper {
    static getLowQueueHours() {
        return SettingsHelper.get('queue_low_hours', DEFAULT_LOW_QUEUE_HOURS);
    }

    static setLowQueueHours(hours) {
        SettingsHelper.set('queue_low_hours', hours);
    }

    /**
     * Health of one character's training.
     *
     * @returns {{training: boolean, queueEnds: Date|undefined, flags: [{level, text}]}}
     */
    static check(character) {
        const flags = [];
        const now = Date.now();
        const window = QueueHealthHelper.getLowQueueHours() * 3600 * 1000;
        const queue = character.skillQueue || [];
        const training = character.getCurrentSkill() !== undefined;

        const auth = AuthorizedCharacter.get(character.id);
        if (auth !== undefined && auth.lastRefresh && auth.lastRefresh.success === false) {
            flags.push({level: CRITICAL, text: 'Token failing, re-authorize (data may be stale)'});
        }

        let queueEnds;
        if (!training) {
            // EVE lists a paused queue's skills without start and finish dates
            if (queue.length > 0 && queue.every(q => q.finish_date === undefined)) {
                flags.push({level: CRITICAL, text: 'Training paused'});
            } else if (queue.length === 0) {
                flags.push({level: CRITICAL, text: 'Not training: queue empty'});
            } else {
                flags.push({level: CRITICAL, text: 'Not training: queue finished'});
            }
        } else {
            queueEnds = new Date(character.getLastSkill().finish_date);
            if (queueEnds.getTime() - now < window) {
                flags.push({level: WARNING, text: `Queue ends in ${DateTimeHelper.niceCountdown(queueEnds.getTime() - now)}`});
            }
        }

        const farm = FarmCharacter.get(character.id);
        if (farm !== undefined) {
            const ready = character.getInjectorsReady(farm.baseSp);
            if (ready > 0) {
                flags.push({level: INFO, text: `${ready} injector${ready === 1 ? '' : 's'} ready to extract`});
            } else if (training) {
                const next = character.getNextInjectorDate(farm.baseSp).getTime() - now;
                if (next < window) {
                    flags.push({level: INFO, text: `Injector ready in ${DateTimeHelper.niceCountdown(next)}`});
                }
            }
        }

        return {training, queueEnds, flags};
    }

    /**
     * Number of characters with a critical or warning flag, for the nav badge.
     */
    static countProblems(characters) {
        return characters.filter(c => QueueHealthHelper.check(c).flags.some(f => f.level !== INFO)).length;
    }
}
