'use strict';

const DAY = 24 * 3600 * 1000;

// Market orders across characters, for the Market Orders page and its nav badge.
export default class MarketOrdersHelper {
    // [{character, order}] of every character's loaded orders, newest first
    static allOrders(characters) {
        return characters
            .flatMap(character => (character.marketOrders || []).map(order => ({character, order})))
            .sort((a, b) => new Date(b.order.issued) - new Date(a.order.issued));
    }

    static expiresAt(order) {
        return new Date(new Date(order.issued).getTime() + order.duration * DAY);
    }

    // still open but running out within a day, so worth relisting
    static isExpiringSoon(order, now = Date.now()) {
        if (order.state !== 'active') {
            return false;
        }
        const left = MarketOrdersHelper.expiresAt(order).getTime() - now;
        return left > 0 && left < DAY;
    }

    // nav badge
    static countExpiringSoon(characters) {
        return MarketOrdersHelper.allOrders(characters).filter(o => MarketOrdersHelper.isExpiringSoon(o.order)).length;
    }
}
