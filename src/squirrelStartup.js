'use strict';

// Handles the events Squirrel (the Windows installer) starts the app with, before any window opens.
// Like electron-squirrel-startup, except:
// - an update only refreshes shortcuts that still exist, so a desktop shortcut the user deleted doesn't come back;
// - shortcuts use PodStack's icon from a fixed file in the install folder (app.ico), refreshed on every update, so
//   they always match the app's icon instead of pointing into a version folder that's removed after updates.

import {app} from 'electron';
import {spawn} from 'child_process';
import fs from 'fs';
import path from 'path';

// %LocalAppData%\podstack, which holds Update.exe and one app-<version> folder per installed version.
function installRoot() {
    return path.resolve(path.dirname(process.execPath), '..');
}

// Detached so it finishes after the app has quit.
function runUpdateExe(args) {
    spawn(path.join(installRoot(), 'Update.exe'), args, {detached: true, stdio: 'ignore'}).unref();
}

// Copies this version's icon to <install root>\app.ico and returns the shortcut icon argument, or [] if that fails
// (shortcuts then fall back to the exe's own icon, which is the same image).
function shortcutIconArgs() {
    try {
        const target = path.join(installRoot(), 'app.ico');
        // the icon is inside app.asar, which Electron's fs can read but Windows can't
        fs.writeFileSync(target, fs.readFileSync(path.join(app.getAppPath(), 'resources', 'icon.ico')));
        return [`--icon=${target}`];
    } catch (err) {
        return [];
    }
}

// Asks Windows to refresh its icon cache, so shortcuts show a changed icon straight away.
function refreshIconCache() {
    try {
        const ie4uinit = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'ie4uinit.exe');
        spawn(ie4uinit, ['-show'], {detached: true, stdio: 'ignore'}).on('error', () => {}).unref();
    } catch (err) {}
}

// Returns true if this launch was a Squirrel event. The caller must then quit without opening a window.
export default function handleSquirrelEvent() {
    if (process.platform !== 'win32') {
        return false;
    }

    const exe = path.basename(process.execPath);
    switch (process.argv[1]) {
        case '--squirrel-install':
            // Desktop and Start Menu shortcuts on first install
            runUpdateExe([`--createShortcut=${exe}`, ...shortcutIconArgs()]);
            refreshIconCache();
            return true;
        case '--squirrel-updated':
            // point existing shortcuts at the new version and icon; don't recreate ones the user removed
            runUpdateExe([`--createShortcut=${exe}`, '--updateOnly', ...shortcutIconArgs()]);
            refreshIconCache();
            return true;
        case '--squirrel-uninstall':
            runUpdateExe([`--removeShortcut=${exe}`]);
            try {
                fs.unlinkSync(path.join(installRoot(), 'app.ico'));
            } catch (err) {}
            return true;
        case '--squirrel-obsolete':
            return true;
        default:
            return false;
    }
}
