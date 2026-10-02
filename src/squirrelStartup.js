'use strict';

// Handles the events Squirrel (the Windows installer) starts the app with, before any window opens.
// Like electron-squirrel-startup, except an update only refreshes shortcuts that still exist, so a desktop shortcut
// the user deleted doesn't come back with every update.

import {spawn} from 'child_process';
import path from 'path';

// Detached so it finishes after the app has quit.
function runUpdateExe(args) {
    const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
    spawn(updateExe, args, {detached: true, stdio: 'ignore'}).unref();
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
            runUpdateExe([`--createShortcut=${exe}`]);
            return true;
        case '--squirrel-updated':
            // point existing shortcuts at the new version; don't recreate ones the user removed
            runUpdateExe([`--createShortcut=${exe}`, '--updateOnly']);
            return true;
        case '--squirrel-uninstall':
            runUpdateExe([`--removeShortcut=${exe}`]);
            return true;
        case '--squirrel-obsolete':
            return true;
        default:
            return false;
    }
}
