'use strict';

// Auto-update (main process).
//
// Releases are published on GitHub. Installed Windows copies (Squirrel) download and install updates through the free
// update.electronjs.org service, which reads the same GitHub releases. Other copies (the portable zip, Linux, macOS
// without code signing) can't replace themselves, so they're told a new version exists and offered the download page.
//
// update.electronjs.org ignores releases marked "pre-release" on GitHub, so releases must be published as normal
// releases even when the version is an alpha/beta (e.g. 0.1.0-alpha). This check ignores them too, to match.

import {app, autoUpdater, ipcMain, net, shell} from 'electron';
import fs from 'fs';
import path from 'path';
import log from 'electron-log/main';

import pkg from '../package.json';

const REPOSITORY = (pkg.repository || '').replace(/^github:/, '');   // "owner/name"
const FIRST_CHECK_DELAY = 15 * 1000;
const CHECK_INTERVAL = 4 * 60 * 60 * 1000;

let getWindow = () => undefined;
let state = {status: 'idle'};      // idle | checking | up-to-date | downloading | ready | available | error
let squirrelFeedSet = false;

function setState(next) {
    state = {...next, currentVersion: app.getVersion(), canAutoInstall: canAutoInstall(), checkedAt: next.checkedAt || state.checkedAt};

    const window = getWindow();
    if (window && !window.isDestroyed()) {
        window.webContents.send('update:status', state);
    }
}

// Squirrel installs live in %LOCALAPPDATA%\podstack\app-<version>\ with Update.exe one level up.
function canAutoInstall() {
    return app.isPackaged && process.platform === 'win32'
        && fs.existsSync(path.resolve(path.dirname(process.execPath), '..', 'Update.exe'));
}

// Semver comparison including pre-release tags: 0.1.0-alpha < 0.1.0-beta < 0.1.0 < 0.1.1
export function compareVersions(a, b) {
    const parse = v => {
        const [main, pre] = v.replace(/^v/, '').split('-', 2);
        return {nums: main.split('.').map(n => parseInt(n, 10) || 0), pre};
    };
    const x = parse(a);
    const y = parse(b);

    for (let i = 0; i < 3; i++) {
        if ((x.nums[i] || 0) !== (y.nums[i] || 0)) {
            return (x.nums[i] || 0) - (y.nums[i] || 0);
        }
    }
    if (x.pre === y.pre) {
        return 0;
    }
    if (x.pre === undefined) {
        return 1;
    }
    if (y.pre === undefined) {
        return -1;
    }
    return x.pre.localeCompare(y.pre, undefined, {numeric: true});
}

async function latestRelease() {
    const res = await net.fetch(`https://api.github.com/repos/${REPOSITORY}/releases?per_page=20`, {
        headers: {'Accept': 'application/vnd.github+json', 'User-Agent': `podstack/${app.getVersion()}`},
    });

    if (res.status === 404) {
        throw new Error(`No public releases found for ${REPOSITORY}.`);
    }
    if (!res.ok) {
        throw new Error(`GitHub returned ${res.status}.`);
    }

    const releases = (await res.json()).filter(r => !r.draft && !r.prerelease);
    return releases.reduce((best, r) => (best === undefined || compareVersions(r.tag_name, best.tag_name) > 0 ? r : best), undefined);
}

async function check() {
    if (['checking', 'downloading', 'ready'].includes(state.status)) {
        return state;
    }
    if (REPOSITORY === '') {
        setState({status: 'error', error: 'No release repository is configured.'});
        return state;
    }

    setState({status: 'checking'});

    let release;
    try {
        release = await latestRelease();
    } catch (err) {
        log.warn('[Update] Check failed', err.message);
        setState({status: 'error', error: err.message, checkedAt: Date.now()});
        return state;
    }

    const checkedAt = Date.now();
    if (release === undefined || compareVersions(release.tag_name, app.getVersion()) <= 0) {
        setState({status: 'up-to-date', checkedAt});
        return state;
    }

    const version = release.tag_name.replace(/^v/, '');
    const url = release.html_url;

    if (canAutoInstall()) {
        // Squirrel downloads in the background; 'update-downloaded' moves us to "ready"
        setState({status: 'downloading', version, url, checkedAt});
        try {
            autoUpdater.checkForUpdates();
        } catch (err) {
            log.warn('[Update] Squirrel check failed', err.message);
            setState({status: 'available', version, url, checkedAt});
        }
    } else {
        setState({status: 'available', version, url, checkedAt});
    }

    return state;
}

export function initUpdater(windowGetter) {
    getWindow = windowGetter;

    if (canAutoInstall() && !squirrelFeedSet) {
        autoUpdater.setFeedURL({
            url: `https://update.electronjs.org/${REPOSITORY}/${process.platform}-${process.arch}/${app.getVersion()}`,
        });
        squirrelFeedSet = true;

        autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
            log.info(`[Update] Downloaded ${releaseName}`);
            setState({...state, status: 'ready'});
        });
        autoUpdater.on('error', err => {
            log.warn('[Update] Squirrel error', err.message);
            // fall back to pointing at the download page
            if (state.status === 'downloading') {
                setState({...state, status: 'available'});
            }
        });
    }

    ipcMain.handle('update:get-status', () => ({...state, currentVersion: app.getVersion(), canAutoInstall: canAutoInstall()}));
    ipcMain.handle('update:check', () => check());
    ipcMain.handle('update:install', () => {
        if (state.status === 'ready') {
            // the window's close handler only hides it unless we're quitting
            app.isQuiting = true;
            autoUpdater.quitAndInstall();
        }
    });
    ipcMain.handle('update:open-release', () => {
        if (typeof state.url === 'string' && state.url.startsWith(`https://github.com/${REPOSITORY}/`)) {
            shell.openExternal(state.url);
        }
    });

    // automatic checks only for packaged builds; in development use "Check for updates" in Settings
    if (app.isPackaged) {
        setTimeout(check, FIRST_CHECK_DELAY);
        setInterval(check, CHECK_INTERVAL);
    }
}
