'use strict';

// Minimal HTTPS client for ESI and SSO, replacing the deprecated `request` package. It uses Node's https module
// rather than the renderer's fetch, so requests aren't subject to CORS and can carry ESI's requested User-Agent.
//
// Errors carry statusCode and response ({statusCode, headers, body}) but never the request itself, so logging one
// can't leak an Authorization header or a token in a POST body.

import https from 'https';

const TIMEOUT = 30 * 1000;
const MAX_REDIRECTS = 5;

function httpError(message, response) {
    const err = new Error(message);
    if (response !== undefined) {
        err.statusCode = response.statusCode;
        err.response = response;
    }
    return err;
}

function send(method, url, headers, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, {method, headers, timeout: TIMEOUT}, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                body: Buffer.concat(chunks).toString('utf8'),
            }));
            res.on('error', reject);
        });

        req.on('timeout', () => req.destroy(new Error(`Request timed out after ${TIMEOUT / 1000}s`)));
        req.on('error', reject);
        req.end(body);
    });
}

/**
 * Sends a request and resolves with {statusCode, headers, body} (body as a string).
 *
 * @param {object} options - method, url, query (object), headers, body (string, or an object/array sent as JSON),
 *                           form (object sent urlencoded), throwOnError (default true: reject on non-2xx)
 */
export async function httpRequest({method = 'GET', url, query, headers = {}, body, form, throwOnError = true}) {
    let target = new URL(url);
    if (query !== undefined) {
        Object.entries(query).forEach(([key, value]) => target.searchParams.set(key, value));
    }

    headers = {...headers};
    if (form !== undefined) {
        body = new URLSearchParams(form).toString();
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else if (body !== undefined && typeof body !== 'string') {
        body = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
    }
    if (body !== undefined) {
        headers['Content-Length'] = Buffer.byteLength(body);
    }

    for (let redirects = 0; ; redirects++) {
        const response = await send(method, target, headers, body);

        // follow redirects for GETs only, and never carry credentials to another host or over plain http
        const location = response.headers.location;
        if (method === 'GET' && response.statusCode >= 300 && response.statusCode < 400 && location) {
            if (redirects >= MAX_REDIRECTS) {
                throw httpError('Too many redirects', response);
            }

            const next = new URL(location, target);
            if (next.protocol !== 'https:') {
                throw httpError(`Refusing redirect to ${next.protocol}`, response);
            }
            if (next.host !== target.host) {
                delete headers['Authorization'];
            }
            target = next;
            continue;
        }

        if (throwOnError && (response.statusCode < 200 || response.statusCode >= 300)) {
            throw httpError(`HTTP ${response.statusCode}`, response);
        }
        return response;
    }
}
