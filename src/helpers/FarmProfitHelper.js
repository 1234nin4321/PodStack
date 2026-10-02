'use strict';

// SP farm economics: what each farm earns per 30 days by extracting and selling Large Skill Injectors, after market
// fees, the Skill Extractors used and the farm's subscription (Omega bought with PLEX, or a Multiple Pilot Training
// Certificate for an extra training slot). Prices are the lowest Jita sell orders, as for skillbooks.

import SettingsHelper from './SettingsHelper';
import MarketHelper from './MarketHelper';

export const TYPES = {
    injector: 40520,     // Large Skill Injector
    extractor: 40519,    // Skill Extractor
    plex: 44992,
    mptc: 34133,         // Multiple Pilot Training Certificate: 30 days of training on one more character
};

const INJECTOR_SP = 500000;
const MONTH_HOURS = 30 * 24;

export const SUBSCRIPTIONS = [
    {id: 'omega', label: 'Omega (PLEX)'},
    {id: 'mct', label: 'MCT certificate'},
    {id: 'none', label: 'Already paid'},
];

const DEFAULT_SETTINGS = {
    omegaPlex: 500,      // PLEX for 30 days of Omega from the in-game store
    feesPercent: 5,      // sales tax + broker fee when selling injectors
};

export default class FarmProfitHelper {
    static getSettings() {
        return {...DEFAULT_SETTINGS, ...SettingsHelper.get('farm_profit', {})};
    }

    static setSettings(settings) {
        SettingsHelper.set('farm_profit', settings);
    }

    /**
     * @returns {Promise<object>} {injector, extractor, plex, mptc}: lowest Jita sell price of each, or null
     */
    static async getPrices() {
        const prices = await MarketHelper.getForgeLowestSell(Object.values(TYPES));
        const result = {};
        Object.entries(TYPES).forEach(([key, typeId]) => result[key] = prices[typeId] !== undefined ? prices[typeId] : null);
        return result;
    }

    // ISK one extracted injector brings in: sale after fees, minus the extractor.
    static profitPerInjector(prices, settings) {
        return prices.injector * (1 - settings.feesPercent / 100) - prices.extractor;
    }

    static subscriptionCost(subscription, prices, settings) {
        switch (subscription) {
            case 'mct':
                return prices.mptc;
            case 'none':
                return 0;
            default:
                return settings.omegaPlex * prices.plex;
        }
    }

    /**
     * @param {Character} character
     * @param {FarmCharacter} farm
     * @returns {object} {injectorsPerMonth, revenue, cost, profit, readyValue} (ISK per 30 days at the current
     *                   training rate, and the value of the injectors ready now)
     */
    static forFarm(character, farm, prices, settings) {
        const perInjector = FarmProfitHelper.profitPerInjector(prices, settings);
        const injectorsPerMonth = character.getCurrentSpPerHour() * MONTH_HOURS / INJECTOR_SP;
        const revenue = injectorsPerMonth * perInjector;
        const cost = FarmProfitHelper.subscriptionCost(farm.subscription || 'omega', prices, settings);

        return {
            injectorsPerMonth,
            revenue,
            cost,
            profit: revenue - cost,
            readyValue: character.getInjectorsReady(farm.baseSp) * perInjector,
        };
    }
}
