'use strict';

import {httpRequest} from './HttpClient';
import log from 'electron-log';

import appProperties from './../../../resources/properties';
import EsiRateLimiter from './EsiRateLimiter';

export default class EsiClient {

    constructor(options) {
        if (options === undefined) {
            options = {};
        }

        this.esiBaseUrl = options.hasOwnProperty('esiBaseUrl') ? options['esiBaseUrl'] : appProperties.eve_esi_url;
        this.tenant = options.hasOwnProperty('tenant') ? options['tenant'] : appProperties.eve_esi_tenant;
        this.compatibilityDate = options.hasOwnProperty('compatibilityDate') ?
            options['compatibilityDate'] : appProperties.eve_esi_compatibility_date;
        this.token = undefined;
    }

    async authChar(authorizedCharacter) {
        this.token = await authorizedCharacter.getAccessToken();
        this.scopes = authorizedCharacter.scopes;
        // authenticated routes are rate limited per character
        this.characterId = authorizedCharacter.id;
    }

    async get(endpoint, requiredScopes, options) {
        return await this.request('GET', endpoint, requiredScopes, options);
    }

    // GETs every page of a paginated endpoint (ESI reports the page count in X-Pages) and concatenates them.
    async getAllPages(endpoint, requiredScopes, options) {
        options = options || {};
        const first = await this.request('GET', endpoint, requiredScopes, {...options, query: {...options.query, page: 1}, fullResponse: true});
        const pages = parseInt(first.headers['x-pages'], 10) || 1;

        let results = [...first.body];
        for (let page = 2; page <= pages; page++) {
            results = results.concat(await this.request('GET', endpoint, requiredScopes, {...options, query: {...options.query, page}}));
        }
        return results;
    }

    async post(endpoint, requiredScopes, options) {
        return await this.request('POST', endpoint, requiredScopes, options);
    }

    async request(method, endpoint, requiredScopes, options) {
        if (requiredScopes === undefined) {
            requiredScopes = [];
        } else if (typeof requiredScopes === 'string') {
            requiredScopes = [requiredScopes];
        }

        if (requiredScopes.length > 0) {
            for(const scope of requiredScopes) {
                if (!this.scopes.includes(scope)) {
                    log.warn(`[ESI] Skipping ${method} ${endpoint}, scope missing.`);
                    throw 'Scope missing';
                }
            }
        }

        if (options === undefined) {
            options = {};
        }

        let requestOptions = {
            method: method,
            url: this.constructUrl(endpoint),
            headers: {
                'User-Agent': `podstack/${appProperties.version}`,
                'Accept': 'application/json',
                'X-Compatibility-Date': this.compatibilityDate,
                'X-Tenant': this.tenant
            }
        };

        if (options.hasOwnProperty('query')) {
            requestOptions['query'] = options['query'];
        }

        if (this.token !== undefined) {
            requestOptions['headers']['Authorization'] = 'Bearer ' + this.token;
        }

        if (options.hasOwnProperty('body')) {
            requestOptions['body'] = options['body'];
        }

        return EsiClient.send(requestOptions, method, endpoint, this.characterId !== undefined ? String(this.characterId) : 'public',
            options.fullResponse === true);
    }

    // Sends a request within ESI's limits (see EsiRateLimiter). Retries once after a server error or a dropped
    // connection, and after the wait ESI asks for on 429/420; other errors (4xx) aren't retried, as they'd only fail
    // again and cost more of the error budget.
    // With fullResponse, resolves with {body, headers} instead of just the parsed body.
    static async send(requestOptions, method, endpoint, who, fullResponse) {
        for (let attempt = 1; ; attempt++) {
            await EsiRateLimiter.acquire(endpoint, who);

            let response;
            try {
                log.verbose(`[ESI] Firing ${method} ${endpoint}...`);
                response = await httpRequest(requestOptions);
            } catch (err) {
                const status = err.statusCode;
                const retryDelay = EsiRateLimiter.record(endpoint, who, status, err.response && err.response.headers);
                EsiRateLimiter.release();

                const retryable = status === undefined || status >= 500 || retryDelay > 0;
                if (!retryable || attempt >= 2) {
                    log.warn(`[ESI] Failed ${method} ${endpoint} (${status || err.message}), giving up.`);
                    throw err;
                }

                log.warn(`[ESI] Failed ${method} ${endpoint} (${status || err.message}), retrying...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay || 2000));
                continue;
            }

            EsiRateLimiter.record(endpoint, who, response.statusCode, response.headers);
            EsiRateLimiter.release();

            const body = response.body !== '' ? JSON.parse(response.body) : undefined;
            return fullResponse ? {body, headers: response.headers} : body;
        }
    }

    constructUrl(endpoint) {
        return EsiClient.trimSlashes(this.esiBaseUrl) + '/' + EsiClient.trimSlashes(endpoint);
    }

    static trimSlashes(str) {
        return str.replace(/^\/+|\/+$/g, '');
    }
}