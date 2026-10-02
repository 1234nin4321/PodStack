'use strict';

// In-app replacements for window.confirm and window.alert, which show the operating system's own dialog. The
// ConfirmDialogHost (mounted once in App) shows them in PodStack's style, one at a time.

let host;
const pending = [];

function show(request) {
    return new Promise(resolve => {
        pending.push({...request, resolve});
        if (host !== undefined) {
            host(pending[0]);
        }
    });
}

export default class ConfirmHelper {
    /**
     * @param {object} options {title, message (text; blank lines start a new paragraph), confirmLabel, cancelLabel,
     *                 danger (the confirm button is red)}
     * @returns {Promise<boolean>} true when confirmed
     */
    static confirm(options) {
        return show({cancelLabel: 'Cancel', confirmLabel: 'OK', ...options, kind: 'confirm'});
    }

    /**
     * @param {object|string} options {title, message} or just the message
     * @returns {Promise<void>} when it's dismissed
     */
    static alert(options) {
        const request = typeof options === 'string' ? {message: options} : options;
        return show({confirmLabel: 'OK', ...request, kind: 'alert'}).then(() => undefined);
    }

    // ConfirmDialogHost registers how it shows a request (undefined when unmounting).
    static setHost(showRequest) {
        host = showRequest;
        if (host !== undefined && pending.length > 0) {
            host(pending[0]);
        }
    }

    // The host's answer to the request on screen; shows the next one, if any.
    static answer(result) {
        const request = pending.shift();
        if (request !== undefined) {
            request.resolve(result);
        }
        if (host !== undefined) {
            host(pending[0]);
        }
    }
}
