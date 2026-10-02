'use strict';

import {ipcRenderer} from 'electron';

// The palettes live in css/main.css as [data-theme] blocks. index.html applies the saved theme before first paint
// using the same storage key, so keep the two in sync.
const STORAGE_KEY = 'podstack.theme';

export const THEMES = [
    {id: 'photon', name: 'Photon', description: 'Cyan on deep space. The default.'},
    {id: 'amarr', name: 'Amarr', description: 'Gold and warm bronze.'},
    {id: 'caldari', name: 'Caldari', description: 'Cool steel blue.'},
    {id: 'gallente', name: 'Gallente', description: 'Emerald and teal.'},
    {id: 'minmatar', name: 'Minmatar', description: 'Rust and ember.'},
    {id: 'daylight', name: 'Daylight', description: 'Light theme for bright rooms.'},
];

const DEFAULT_THEME = THEMES[0].id;
const listeners = new Set();

export default class ThemeHelper {
    static get() {
        let id;
        try {
            id = localStorage.getItem(STORAGE_KEY);
        } catch (err) {}

        return THEMES.some(t => t.id === id) ? id : DEFAULT_THEME;
    }

    static set(id) {
        if (!THEMES.some(t => t.id === id)) {
            return;
        }

        try {
            localStorage.setItem(STORAGE_KEY, id);
        } catch (err) {}

        ThemeHelper.apply(id);
        listeners.forEach(listener => listener(id));
    }

    static apply(id) {
        document.documentElement.setAttribute('data-theme', id);

        // Lets the main process match the window background, so a restart doesn't flash the wrong colour.
        ipcRenderer.send('theme:background', ThemeHelper.readColor('--bg-0'));
    }

    // Resolved value of a base token for the current theme, e.g. readColor('--accent') -> '#3fb8d9'.
    static readColor(token) {
        return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    }

    static subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }
}
