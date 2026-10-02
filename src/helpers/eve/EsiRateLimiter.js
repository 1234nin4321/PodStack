'use strict';

// Keeps PodStack inside ESI's limits (https://developers.eveonline.com/docs/services/esi/rate-limiting/).
//
// - Rate limit groups: every route belongs to a group with a token bucket per character (authenticated routes) or
//   per IP (public routes), e.g. char-detail 600 tokens / 15 min. A 2xx costs 2 tokens, 3xx 1, 4xx 5, 5xx 0, and
//   tokens come back one window after they were spent. We learn each bucket from the X-Ratelimit-* headers and slow
//   down before it runs dry, keeping a safety margin.
// - 429 Too Many Requests: the bucket is blocked until Retry-After.
// - Legacy error limit: 100 error responses per minute across all of ESI, after which every call fails with 420.
//   When X-ESI-Error-Limit-Remain gets low, all ESI calls pause until the window resets.
// - At most MAX_IN_FLIGHT requests run at once, so many characters refreshing together queue up instead of bursting.

export const MAX_IN_FLIGHT = 8;
const SAFETY_SHARE = 0.15;          // keep 15% of every bucket spare
const ERROR_LIMIT_FLOOR = 20;       // pause everything when fewer errors than this are left in the window
const DEFAULT_RETRY_AFTER = 60;     // seconds, when ESI doesn't say

// Rate limit groups of the routes PodStack calls, from ESI's OpenAPI spec (x-rate-limit, compatibility date
// 2026-08-18), so throttling works from the first request. Responses keep this up to date.
const KNOWN_ROUTE_GROUPS = {
    'characters/{id}/portrait': 'char-detail',
    'characters/{id}/skills': 'char-detail',
    'characters/{id}/skillqueue': 'char-detail',
    'characters/{id}/attributes': 'char-detail',
    'characters/{id}/implants': 'char-detail',
    'characters/{id}/clones': 'char-location',
    'characters/{id}/location': 'char-location',
    'characters/{id}/ship': 'char-location',
    'characters/{id}/fatigue': 'char-location',
    'characters/{id}/wallet': 'char-wallet',
    'characters/{id}/loyalty/points': 'char-wallet',
    'characters/{id}/contracts': 'char-contract',
    'characters/{id}/contracts/{id}/items': 'char-contract',
    'characters/{id}/mail': 'char-social',
    'characters/{id}/mail/labels': 'char-social',
    'characters/{id}/mail/lists': 'char-social',
    'characters/{id}/mail/{id}': 'char-social',
    'markets/{id}/orders': 'market-order',
};

const buckets = new Map();          // "group|who" -> {limit, windowMs, remaining, at, blockedUntil}
const routeGroups = new Map(Object.entries(KNOWN_ROUTE_GROUPS));   // route pattern -> group
let globalPauseUntil = 0;
let globalPauseReason;
let inFlight = 0;
const waiting = [];
const listeners = new Set();

let now = () => Date.now();
let sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// "characters/123/skills" -> "characters/{id}/skills", so one learned group covers every character
export function routePattern(endpoint) {
    return endpoint.replace(/^\/+|\/+$/g, '').replace(/\/\d+(?=\/|$)/g, '/{id}');
}

// "150/15m" -> {limit: 150, windowMs: 900000}
export function parseLimit(value) {
    const match = /^(\d+)\/(\d+)([smhd])$/.exec((value || '').trim());
    if (match === null) {
        return undefined;
    }
    const unit = {s: 1000, m: 60000, h: 3600000, d: 86400000}[match[3]];
    return {limit: parseInt(match[1], 10), windowMs: parseInt(match[2], 10) * unit};
}

function bucketKey(group, who) {
    return `${group}|${who}`;
}

function notify() {
    const status = EsiRateLimiter.getStatus();
    listeners.forEach(listener => listener(status));
}

// How long to wait before spending tokens from this bucket, in ms.
function bucketDelay(bucket) {
    const t = now();
    if (bucket.blockedUntil > t) {
        return bucket.blockedUntil - t;
    }

    const floor = Math.max(4, Math.ceil(bucket.limit * SAFETY_SHARE));
    if (bucket.remaining >= floor) {
        return 0;
    }

    // tokens return one window after they were spent; assume spending was spread over the window
    const missing = floor - bucket.remaining;
    const refillAt = bucket.at + (bucket.windowMs * missing) / bucket.limit;
    return Math.max(0, refillAt - t);
}

export default class EsiRateLimiter {
    /**
     * Waits until a request to `endpoint` for `who` (a character id, or 'public') can go out, then takes a slot.
     * Call release() when the request has finished.
     */
    static async acquire(endpoint, who) {
        for (;;) {
            const t = now();
            let delay = Math.max(0, globalPauseUntil - t);

            const group = routeGroups.get(routePattern(endpoint));
            const bucket = group !== undefined ? buckets.get(bucketKey(group, who)) : undefined;
            if (bucket !== undefined) {
                delay = Math.max(delay, bucketDelay(bucket));
            }

            if (delay > 0) {
                await sleep(Math.min(delay, 30000));
                continue;
            }

            if (inFlight >= MAX_IN_FLIGHT) {
                await new Promise(resolve => waiting.push(resolve));
                continue;
            }

            inFlight++;
            if (bucket !== undefined) {
                // reserve the tokens a success costs, so parallel requests don't all see the same headroom
                bucket.remaining -= 2;
            }
            return;
        }
    }

    static release() {
        inFlight = Math.max(0, inFlight - 1);
        const next = waiting.shift();
        if (next !== undefined) {
            next();
        }
    }

    /**
     * Learns from a response's headers (works for errors too). Returns how long to wait before retrying, in ms, when
     * ESI asked us to back off (429 / 420), otherwise 0.
     */
    static record(endpoint, who, status, headers) {
        const h = name => (headers ? headers[name] : undefined);
        const t = now();
        let retryDelay = 0;

        const group = h('x-ratelimit-group');
        if (group !== undefined) {
            routeGroups.set(routePattern(endpoint), group);

            const key = bucketKey(group, who);
            const parsed = parseLimit(h('x-ratelimit-limit'));
            const bucket = buckets.get(key) || {blockedUntil: 0};
            if (parsed !== undefined) {
                bucket.limit = parsed.limit;
                bucket.windowMs = parsed.windowMs;
            }
            const remaining = parseInt(h('x-ratelimit-remaining'), 10);
            if (!isNaN(remaining)) {
                bucket.remaining = remaining;
            }
            bucket.at = t;

            if (status === 429) {
                retryDelay = (parseInt(h('retry-after'), 10) || DEFAULT_RETRY_AFTER) * 1000;
                bucket.blockedUntil = t + retryDelay;
                globalPauseReason = 'rate-limit';
            }
            if (bucket.limit !== undefined) {
                buckets.set(key, bucket);
            }
        } else if (status === 429) {
            retryDelay = (parseInt(h('retry-after'), 10) || DEFAULT_RETRY_AFTER) * 1000;
            globalPauseUntil = Math.max(globalPauseUntil, t + retryDelay);
            globalPauseReason = 'rate-limit';
        }

        // legacy error limit, shared by every route
        const errorsLeft = parseInt(h('x-esi-error-limit-remain'), 10);
        const errorReset = parseInt(h('x-esi-error-limit-reset'), 10);
        if (status === 420 || (!isNaN(errorsLeft) && errorsLeft < ERROR_LIMIT_FLOOR)) {
            const pause = ((isNaN(errorReset) ? DEFAULT_RETRY_AFTER : errorReset) + 1) * 1000;
            globalPauseUntil = Math.max(globalPauseUntil, t + pause);
            globalPauseReason = 'error-limit';
            retryDelay = Math.max(retryDelay, status === 420 ? pause : 0);
        }

        if (retryDelay > 0 || globalPauseUntil > t) {
            notify();
        }
        return retryDelay;
    }

    /**
     * What the UI shows: whether ESI calls are currently held back, until when and why.
     */
    static getStatus() {
        const t = now();
        let blockedUntil = globalPauseUntil > t ? globalPauseUntil : 0;
        buckets.forEach(b => {
            if (b.blockedUntil > t) {
                blockedUntil = Math.max(blockedUntil, b.blockedUntil);
            }
        });

        return {
            paused: blockedUntil > t,
            pausedUntil: blockedUntil > t ? blockedUntil : undefined,
            reason: blockedUntil > t ? globalPauseReason : undefined,
            inFlight,
            queued: waiting.length,
        };
    }

    static subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    // For tests: replace the clock and sleep, and clear all state.
    static _reset(clock, sleeper) {
        buckets.clear();
        routeGroups.clear();
        Object.entries(KNOWN_ROUTE_GROUPS).forEach(([route, group]) => routeGroups.set(route, group));
        globalPauseUntil = 0;
        globalPauseReason = undefined;
        inFlight = 0;
        waiting.length = 0;
        now = clock || (() => Date.now());
        sleep = sleeper || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    }
}
