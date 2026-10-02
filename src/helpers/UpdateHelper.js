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

    // Accepts an available update: downloads and installs it in the background (installed Windows copies only).
    static download() {
        return ipcRenderer.invoke('update:download');
    }

    // Restarts into the installed update.
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
