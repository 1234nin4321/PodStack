'use strict';

import {ipcRenderer} from 'electron';

// Renderer side of the updater in src/updater.js.
export default class UpdateHelper {
    static getStatus() {
        return ipcRenderer.invoke('update:get-status');
    }

    static check() {
        return ipcRenderer.invoke('update:check');
    }

    // Restarts into the downloaded update (installed Windows copies only).
    static install() {
        return ipcRenderer.invoke('update:install');
    }

    static openRelease() {
        return ipcRenderer.invoke('update:open-release');
    }

    static subscribe(listener) {
        const handler = (event, status) => listener(status);
        ipcRenderer.on('update:status', handler);
        return () => ipcRenderer.removeListener('update:status', handler);
    }
}
