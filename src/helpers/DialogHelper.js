'use strict';

import {ipcRenderer} from 'electron';

// Native file dialogs live in the main process; these wrappers keep the old callback-style results.
export default class DialogHelper {
    /**
     * @returns {Promise<string[]|undefined>} selected paths, or undefined if cancelled
     */
    static async showOpenDialog(options) {
        const result = await ipcRenderer.invoke('dialog:open', options);
        return result.canceled ? undefined : result.filePaths;
    }

    /**
     * @returns {Promise<string|undefined>} chosen path, or undefined if cancelled
     */
    static async showSaveDialog(options) {
        const result = await ipcRenderer.invoke('dialog:save', options);
        return result.canceled ? undefined : result.filePath;
    }
}
