'use strict';

// SP farm economics, per 30 days at each farm's current training speed:
//
//   SP/min × 43,200 min (30 days) = SP per month
//   SP per month ÷ 500,000        = Large Skill Injectors per month (one Skill Extractor each)
//   injectors × injector price × (1 − sell fees)   income
//   − injectors × extractor price                  extractors
//   − subscription (Omega or MCT, in PLEX)         = profit (negative is a loss)
//
// Each price is either the market's lowest sell order (PLEX on New Eden's single PLEX market, the rest in Jita), or
// the player's own: PLEX in ISK, everything else in PLEX (as sold in the New Eden Store, whose prices drop during
// sales) and converted to ISK at the PLEX price.

import SettingsHelper from './SettingsHelper';
import MarketHelper, {THE_FORGE, GLOBAL_PLEX_MARKET} from './MarketHelper';

export const TYPES = {
    injector: 40520,     // Large Skill Injector
    extractor: 40519,    // Skill Extractor
    plex: 44992,
};

export const INJECTOR_SP = 500000;
export const MINUTES_PER_MONTH = 30 * 24 * 60;

export const SUBSCRIPTIONS = [
    {id: 'omega', label: 'Omega'},
    {id: 'mct', label: 'MCT'},
    {id: 'none', label: 'Already paid'},
];

// items whose price can be the market's or the player's own (in PLEX)
export const PRICED_ITEMS = [
    {id: 'injector', label: 'Large Skill Injector', note: 'sold'},
    {id: 'extractor', label: 'Skill Extractor', note: 'one per injector'},
];

const DEFAULT_SETTINGS = {
    omegaPlex: 500,      // PLEX for 30 days of Omega in the New Eden Store
    feesPercent: 5,      // sales tax + broker fee when selling injectors
    plex: {source: 'market', isk: undefined},
    injector: {source: 'market', plex: undefined},
    extractor: {source: 'market', plex: undefined},
    // MCT is only sold in the New Eden Store (the certificate can't be traded any more), so its price is in PLEX
    mct: {plex: undefined},
};

export default class FarmProfitHelper {
    static getSettings() {
        const saved = SettingsHelper.get('farm_profit', {});
        const settings = {...DEFAULT_SETTINGS, ...saved};
        ['plex', ...PRICED_ITEMS.map(i => i.id)].forEach(id => settings[id] = {...DEFAULT_SETTINGS[id], ...(saved[id] || {})});
        return settings;
    }

    static setSettings(settings) {
        SettingsHelper.set('farm_profit', settings);
    }

    /**
     * Lowest sell prices: PLEX on New Eden's single PLEX market, the rest in Jita (The Forge). Cached for 6 hours
     * unless forced.
     *
     * @returns {Promise<object>} {injector, extractor, plex} (null where nobody sells or it failed to load)
     */
    static async getMarketPrices(force = false) {
        const regional = [TYPES.injector, TYPES.extractor];
        const [forge, global] = await Promise.all([
            MarketHelper.getLowestSell(THE_FORGE, regional, force),
            MarketHelper.getLowestSell(GLOBAL_PLEX_MARKET, [TYPES.plex], force),
        ]);
        const prices = {...forge, ...global};

        const result = {};
        Object.entries(TYPES).forEach(([key, typeId]) => result[key] = prices[typeId] !== undefined ? prices[typeId] : null);
        return result;
    }

    // when the market prices in use were fetched (the oldest of them), or undefined
    static marketPriceDate() {
        const forge = MarketHelper.priceDate(THE_FORGE, [TYPES.injector, TYPES.extractor]);
        const global = MarketHelper.priceDate(GLOBAL_PLEX_MARKET, [TYPES.plex]);
        return forge !== undefined && global !== undefined ? new Date(Math.min(forge, global)) : undefined;
    }

    /**
     * The ISK prices to calculate with, from the market and the player's own prices.
     *
     * @returns {object} {plex, injector, extractor, mct, omega} in ISK; null where a market price is missing
     */
    static resolvePrices(market, settings) {
        const known = v => typeof v === 'number' && !isNaN(v);
        const plex = settings.plex.source === 'custom' && known(settings.plex.isk) ? settings.plex.isk : market.plex;

        const resolved = {plex};
        PRICED_ITEMS.forEach(({id}) => {
            const own = settings[id];
            resolved[id] = own.source === 'custom' && known(own.plex) ?
                (plex === null ? null : own.plex * plex) :
                market[id];
        });
        resolved.omega = plex === null ? null : settings.omegaPlex * plex;
        resolved.mct = plex !== null && known(settings.mct.plex) ? settings.mct.plex * plex : null;
        return resolved;
    }

    // Whether every price the calculation needs is known; the MCT price only matters if a farm pays for MCT.
    static isComplete(prices, needsMct = false) {
        const known = p => p !== null && p !== undefined && !isNaN(p);
        return ['plex', 'injector', 'extractor', 'omega'].every(k => known(prices[k])) && (!needsMct || known(prices.mct));
    }

    static needsMct(farms) {
        return farms.some(farm => farm.subscription === 'mct');
    }

    static subscriptionCost(subscription, prices) {
        switch (subscription) {
            case 'mct':
                return prices.mct;
            case 'none':
                return 0;
            default:
                return prices.omega;
        }
    }

    /**
     * One farm's month, at its current training speed.
     *
     * @param {object} prices from resolvePrices
     * @returns {object} {spPerMinute, spPerMonth, injectorsPerMonth, income, extractors, subscription, profit,
     *                   readyValue}; ISK per 30 days, readyValue is what the injectors ready now are worth
     */
    static forFarm(character, farm, prices, settings) {
        const spPerMinute = character.getCurrentSpPerHour() / 60;
        const spPerMonth = spPerMinute * MINUTES_PER_MONTH;
        const injectorsPerMonth = spPerMonth / INJECTOR_SP;
        const netInjector = prices.injector * (1 - settings.feesPercent / 100);

        const income = injectorsPerMonth * netInjector;
        const extractors = injectorsPerMonth * prices.extractor;
        const subscription = FarmProfitHelper.subscriptionCost(farm.subscription || 'omega', prices);

        return {
            spPerMinute,
            spPerMonth,
            injectorsPerMonth,
            income,
            extractors,
            subscription,
            profit: income - extractors - subscription,
            readyValue: character.getInjectorsReady(farm.baseSp) * (netInjector - prices.extractor),
        };
    }

    // ISK one extracted injector brings in: sale after fees, minus the extractor.
    static profitPerInjector(prices, settings) {
        return prices.injector * (1 - settings.feesPercent / 100) - prices.extractor;
    }
}
