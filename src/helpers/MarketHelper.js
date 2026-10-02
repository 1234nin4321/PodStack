'use strict';

import Store from 'electron-store';
import log from 'electron-log';

import EsiClient from './eve/EsiClient';

export const THE_FORGE = 10000002;    // Jita's region, where NPC-seeded skillbooks are sold
// PLEX isn't traded in regions any more: it has one market for all of New Eden, which ESI serves as this region
export const GLOBAL_PLEX_MARKET = 19000001;
const MAX_AGE = 6 * 60 * 60 * 1000;   // prices are refetched after 6 hours
const CONCURRENCY = 8;

const marketStore = new Store({name: 'market-data'});
let cache;

function load() {
    if (cache === undefined) {
        cache = marketStore.get('cache') || {averages: undefined, forgeSell: {}};
        cache.sell = cache.sell || {};
    }
    return cache;
}

// cached lowest sell prices of a region: {[typeId]: {date, price}} (The Forge keeps its older cache key)
function sellCache(c, regionId) {
    if (regionId === THE_FORGE) {
        return c.forgeSell;
    }
    c.sell[regionId] = c.sell[regionId] || {};
    return c.sell[regionId];
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
    static async getForgeLowestSell(typeIds, force = false) {
        return MarketHelper.getLowestSell(THE_FORGE, typeIds, force);
    }

    /**
     * Lowest sell order in a region for each type, or null where nobody is selling. Cached for 6 hours unless forced.
     *
     * @returns {Promise<object>} {[typeId]: price|null}; types that failed to load are left out
     */
    static async getLowestSell(regionId, typeIds, force = false) {
        const prices = sellCache(load(), regionId);
        const missing = typeIds.filter(id => force || !fresh(prices[id]));

        // a few types at a time; every page of each type's orders
        for (let i = 0; i < missing.length; i += CONCURRENCY) {
            await Promise.all(missing.slice(i, i + CONCURRENCY).map(async typeId => {
                try {
                    const orders = await new EsiClient().getAllPages(`markets/${regionId}/orders`, [], {
                        query: {order_type: 'sell', type_id: typeId},
                    });
                    const lowest = orders.reduce((min, o) => (min === null || o.price < min ? o.price : min), null);
                    prices[typeId] = {date: Date.now(), price: lowest};
                } catch (err) {
                    log.warn(`[Market] Couldn't load orders for #${typeId} in region ${regionId}`, err.message);
                }
            }));
        }
        save();

        const result = {};
        typeIds.forEach(id => {
            if (prices[id] !== undefined) {
                result[id] = prices[id].price;
            }
        });
        return result;
    }

    // When the oldest of these cached prices was fetched, or undefined if any isn't cached.
    static priceDate(regionId, typeIds) {
        const prices = sellCache(load(), regionId);
        const dates = typeIds.map(id => prices[id] && prices[id].date);
        return dates.every(d => d !== undefined) ? new Date(Math.min(...dates)) : undefined;
    }
}
