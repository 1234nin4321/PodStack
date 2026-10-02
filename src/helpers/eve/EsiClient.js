'use strict';

import rp from 'request-promise-native';
import log from 'electron-log';

import appProperties from './../../../resources/properties';

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
    }

    async get(endpoint, requiredScopes, options) {
        return await this.request('GET', endpoint, requiredScopes, options);
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
            uri: this.constructUrl(endpoint),
            qs: {},
            headers: {
                'User-Agent': `podstack/${appProperties.version}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-Compatibility-Date': this.compatibilityDate,
                'X-Tenant': this.tenant
            }
        };

        if (options.hasOwnProperty('query')) {
            requestOptions['qs'] = options['query'];
        }

        if (this.token !== undefined) {
            requestOptions['headers']['Authorization'] = 'Bearer ' + this.token;
        }

        if (options.hasOwnProperty('body')) {
            requestOptions['body'] = options['body'];
            requestOptions['json'] = true;
        }

        try {
            log.verbose(`[ESI] Firing ${method} ${endpoint}...`);
            let body = await rp(requestOptions);
            return (typeof body === 'string') ? JSON.parse(body) : body;
        } catch(err) {
            log.warn(`[ESI] Failed ${method} ${endpoint}, retrying...`);
            try {
                let body = await rp(requestOptions);
                return (typeof body === 'string') ? JSON.parse(body) : body;
            } catch(err) {
                log.warn( `[ESI] Failed x2 ${method} ${endpoint}, throwing error.`);
                throw err;
            }
        }
    }

    constructUrl(endpoint) {
        return EsiClient.trimSlashes(this.esiBaseUrl) + '/' + EsiClient.trimSlashes(endpoint);
    }

    static trimSlashes(str) {
        return str.replace(/^\/+|\/+$/g, '');
    }
}