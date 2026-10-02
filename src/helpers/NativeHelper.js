'use strict';

import {ipcRenderer} from 'electron';

// The clipboard and opening links in the user's browser. Since Electron 40-something the window can only use
// ipcRenderer (plus contextBridge, webFrame and webUtils) from 'electron', so these go through the main process,
// see the 'clipboard:' and 'shell:' handlers in index.js.
export default class NativeHelper {
    /**
     * @returns {Promise<string>} the clipboard's text ('' if it holds none)
     */
    static async readClipboard() {
        try {
            return (await ipcRenderer.invoke('clipboard:read-text')) || '';
        } catch (err) {
            return '';
        }
    }

    static writeClipboard(text) {
        return ipcRenderer.invoke('clipboard:write-text', String(text));
    }

    // Opens an http(s) link in the user's browser.
    static openExternal(url) {
        return ipcRenderer.invoke('shell:open-external', url);
    }
}
