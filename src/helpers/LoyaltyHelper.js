'use strict';

import log from 'electron-log';

import EsiClient from './eve/EsiClient';
import MarketHelper from './MarketHelper';
import NameHelper from './NameHelper';

const MAX_AGE = 6 * 60 * 60 * 1000;
// offers repriced at Jita per store, picked by their value at EVE's average prices
const CANDIDATES = 10;
// a Jita price this far above EVE's average is a lone overpriced order, not what the item sells for
const MAX_ABOVE_AVERAGE = 3;

// per corporation: {date, offers: [...] sorted best first}, for the session
const cache = {};
const inFlight = {};

// ISK per LP of an offer at the given prices, or undefined when something in it has no price
function iskPerLp(offer, prices) {
    const product = prices[offer.type_id];
    if (typeof product !== 'number' || !(offer.lp_cost > 0)) {
        return undefined;
    }
    let cost = offer.isk_cost || 0;
    for (const item of offer.required_items || []) {
        const price = prices[item.type_id];
        if (typeof price !== 'number') {
            return undefined;
        }
        cost += price * item.quantity;
    }
    return (product * offer.quantity - cost) / offer.lp_cost;
}

// LP store offers turned into ISK: what each LP is worth when spent on a corporation's best offers and the item sold.
export default class LoyaltyHelper {
    /**
     * A corporation's LP store offers worth the most ISK per LP at Jita 4-4 sell prices, best first: [{offer_id,
     * type_id, name, quantity, lp_cost, isk_cost, required_items: [{type_id, quantity, name}], iskPerLp}]. Blueprint
     * copies and offers needing Analysis Kredits are left out (they have no meaningful market price).
     */
    static async bestOffers(corporationId) {
        const cached = cache[corporationId];
        if (cached !== undefined && Date.now() - cached.date < MAX_AGE) {
            return cached.offers;
        }
        if (inFlight[corporationId] === undefined) {
            inFlight[corporationId] = LoyaltyHelper.load(corporationId).finally(() => delete inFlight[corporationId]);
        }
        return inFlight[corporationId];
    }

    static async load(corporationId) {
        let offers;
        try {
            offers = await new EsiClient().get(`loyalty/stores/${corporationId}/offers`) || [];
        } catch (err) {
            log.warn(`[LP] Couldn't load the LP store of ${corporationId}`, err.message);
            return [];
        }

        const ids = offers.flatMap(o => [o.type_id, ...(o.required_items || []).map(i => i.type_id)]);
        const names = await NameHelper.resolve(ids);
        offers = offers.filter(o => !(o.ak_cost > 0) && !/ Blueprint$/.test(names[o.type_id] || ''));

        // screen everything at average prices, then price the likeliest at Jita
        const averages = await MarketHelper.getAveragePrices();
        const candidates = offers
            .map(o => ({offer: o, value: iskPerLp(o, averages)}))
            .filter(o => o.value !== undefined && o.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, CANDIDATES)
            .map(o => o.offer);

        const jita = await MarketHelper.getJitaLowestSell([...new Set(candidates.flatMap(o => [o.type_id, ...(o.required_items || []).map(i => i.type_id)]))]);
        const best = candidates
            .map(o => ({
                offer_id: o.offer_id,
                type_id: o.type_id,
                name: names[o.type_id] || `Type #${o.type_id}`,
                quantity: o.quantity,
                lp_cost: o.lp_cost,
                isk_cost: o.isk_cost || 0,
                required_items: (o.required_items || []).map(i => ({...i, name: names[i.type_id] || `Type #${i.type_id}`})),
                iskPerLp: iskPerLp(o, jita),
            }))
            .filter(o => o.iskPerLp !== undefined && o.iskPerLp > 0 &&
                !(jita[o.type_id] > (averages[o.type_id] || 0) * MAX_ABOVE_AVERAGE))
            .sort((a, b) => b.iskPerLp - a.iskPerLp);

        cache[corporationId] = {date: Date.now(), offers: best};
        return best;
    }
}
