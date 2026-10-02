'use strict';

export default class FormatHelper {
    /**
     * Abbreviate a large number the way the EVE client does, e.g. 18452338921 -> "18.45B".
     */
    static compact(value, digits = 2) {
        const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
        for (const [size, suffix] of units) {
            if (Math.abs(value) >= size) {
                return (value / size).toLocaleString(navigator.language, {
                    minimumFractionDigits: digits,
                    maximumFractionDigits: digits,
                }) + suffix;
            }
        }

        return FormatHelper.number(value);
    }

    static number(value, digits = 0) {
        return (value || 0).toLocaleString(navigator.language, {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
        });
    }

    /**
     * An EVE notification type as words, e.g. "StructureUnderAttack" -> "Structure Under Attack".
     */
    static notificationTitle(type) {
        return String(type || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
    }

    /**
     * Fraction (0-1) of a queue entry that has been trained so far.
     */
    static trainingProgress(queueEntry) {
        const start = new Date(queueEntry.start_date).getTime();
        const end = new Date(queueEntry.finish_date).getTime();

        return (end > start) ? (new Date().getTime() - start) / (end - start) : 0;
    }
}
