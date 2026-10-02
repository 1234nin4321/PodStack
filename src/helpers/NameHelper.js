'use strict';

import log from 'electron-log';

import EsiClient from './eve/EsiClient';

// universe/names takes at most 1000 ids per request, and rejects the whole request if any id is unknown to it
// (structures, item ids), so only pass type, station, system, character, corporation and alliance ids.
const CHUNK = 1000;

// names of these things never change, so they're kept for the session
const cache = {};

export default class NameHelper {
    /**
     * @param {number[]} ids
     * @returns {Promise<object>} {[id]: name}; ids that couldn't be resolved are left out
     */
    static async resolve(ids) {
        const missing = [...new Set(ids.filter(id => id !== undefined && id !== null && cache[id] === undefined))];

        for (let i = 0; i < missing.length; i += CHUNK) {
            try {
                const res = await new EsiClient().post('universe/names', [], {body: missing.slice(i, i + CHUNK)});
                res.forEach(o => cache[o.id] = o.name);
            } catch (err) {
                log.warn('[Names] Bulk name lookup failed', err.message);
            }
        }

        const result = {};
        ids.forEach(id => {
            if (cache[id] !== undefined) {
                result[id] = cache[id];
            }
        });
        return result;
    }

    static isStation(id) {
        return id >= 60000000 && id < 64000000;
    }

    static isSystem(id) {
        return id >= 30000000 && id < 33000000;
    }
}
