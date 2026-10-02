'use strict';

import Store from 'electron-store';
import log from 'electron-log';

import EsiClient from './eve/EsiClient';

const THE_FORGE = 10000002;           // Jita's region, where NPC-seeded skillbooks are sold
const MAX_AGE = 6 * 60 * 60 * 1000;   // prices are refetched after 6 hours
const CONCURRENCY = 8;

const marketStore = new Store({name: 'market-data'});
let cache;

function load() {
    if (cache === undefined) {
        cache = marketStore.get('cache') || {averages: undefined, forgeSell: {}};
    }
    return cache;
}

function fresh(entry) {
    return entry !== undefined && Date.now() - entry.date < MAX_AGE;
}

let saveTimeout;
function save() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => marketStore.set('cache', cache), 2000);
}

export default class MarketHelper {
    /**
     * EVE's universe-wide average prices, fetched in one request for every type.
     *
     * @returns {Promise<object>} {[typeId]: average price}
     */
    static async getAveragePrices() {
        const c = load();
        if (!fresh(c.averages)) {
            const prices = {};
            for (const p of await new EsiClient().get('markets/prices')) {
                if (p.average_price !== undefined) {
                    prices[p.type_id] = p.average_price;
                }
            }
            c.averages = {date: Date.now(), prices};
            save();
        }

        return c.averages.prices;
    }

    /**
     * Lowest sell order in The Forge for each type, or null where nobody is selling.
     *
     * @returns {Promise<object>} {[typeId]: price|null}; types that failed to load are left out
     */
    static async getForgeLowestSell(typeIds) {
        const c = load();
        const missing = typeIds.filter(id => !fresh(c.forgeSell[id]));

        // a few requests at a time; one per type
        for (let i = 0; i < missing.length; i += CONCURRENCY) {
            await Promise.all(missing.slice(i, i + CONCURRENCY).map(async typeId => {
                try {
                    const orders = await new EsiClient().get(`markets/${THE_FORGE}/orders`, [], {
                        query: {order_type: 'sell', type_id: typeId},
                    });
                    const lowest = orders.reduce((min, o) => (min === null || o.price < min ? o.price : min), null);
                    c.forgeSell[typeId] = {date: Date.now(), price: lowest};
                } catch (err) {
                    log.warn(`[Market] Couldn't load Forge orders for #${typeId}`, err.message);
                }
            }));
        }
        save();

        const result = {};
        typeIds.forEach(id => {
            if (c.forgeSell[id] !== undefined) {
                result[id] = c.forgeSell[id].price;
            }
        });
        return result;
    }
}
