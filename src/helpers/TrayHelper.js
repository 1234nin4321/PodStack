'use strict';

// Keeps the tray icon's tooltip and menu showing each character's training, like EVEMon's tray icon: the tooltip has
// how long each queue has left (Windows cuts tooltips at 127 characters), the menu the skill in training too, and
// clicking a character there opens them.

import {ipcRenderer} from 'electron';

import Character from '../models/Character';
import DateTimeHelper from './DateTimeHelper';

const UPDATE_INTERVAL = 60 * 1000;
const TOOLTIP_MAX = 127;
const LEVELS = ['', 'I', 'II', 'III', 'IV', 'V'];

function short(ms) {
    return DateTimeHelper.niceCountdown(ms).split(' ').slice(0, 2).join(' ');
}

export default class TrayHelper {
    static start() {
        TrayHelper.update();
        setInterval(() => TrayHelper.update(), UPDATE_INTERVAL);
        // the main process asks to open a character picked from the tray menu
        ipcRenderer.on('tray:open-character', (event, id) => {
            window.location.hash = `#/characters/${id}`;
        });
    }

    static update() {
        const now = Date.now();
        const characters = Object.values(Character.getAll())
            .filter(c => c.name !== undefined)
            .sort((a, b) => b.getTotalSp() - a.getTotalSp());

        const entries = characters.map(c => {
            const current = c.getCurrentSkill();
            const last = c.getLastSkill();
            if (current === undefined || last === undefined) {
                return {id: c.id, short: `${c.getDisplayName()}: idle`, label: `${c.getDisplayName()} — not training`};
            }
            const name = current.skill_name || 'Training';
            return {
                id: c.id,
                short: `${c.getDisplayName()}: ${short(new Date(last.finish_date).getTime() - now)}`,
                label: `${c.getDisplayName()} — ${name} ${LEVELS[current.finished_level] || ''} · ` +
                    `${short(new Date(current.finish_date).getTime() - now)} (queue ${short(new Date(last.finish_date).getTime() - now)})`,
            };
        });

        // as many characters as fit in the tooltip, leaving room to say how many more the menu has
        let tooltip = 'PodStack';
        let shown = 0;
        for (const entry of entries) {
            const more = entries.length - shown - 1;
            const reserve = more > 0 ? `\n+${more} more (right-click)`.length : 0;
            if (tooltip.length + 1 + entry.short.length + reserve > TOOLTIP_MAX) {
                break;
            }
            tooltip += `\n${entry.short}`;
            shown++;
        }
        if (shown < entries.length) {
            tooltip += `\n+${entries.length - shown} more (right-click)`;
        }

        ipcRenderer.send('tray:update', {tooltip, characters: entries.map(e => ({id: e.id, label: e.label}))});
    }
}
