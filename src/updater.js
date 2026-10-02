'use strict';

// Auto-update (main process).
//
// Releases are published on GitHub. For installed Windows copies (Squirrel), PodStack downloads the release's full
// .nupkg itself, so it can report byte-level progress, checks it against the SHA1 in the release's RELEASES file, then
// hands the local folder to Squirrel's Update.exe to install, reading Update.exe's percentage output for the install
// step. Other copies (the portable zip, Linux, macOS) can't replace themselves, so they're told a new version exists
// and offered the download page.
//
// Releases marked "pre-release" on GitHub are ignored, so alphas/betas must be published as normal releases.

import {app, ipcMain, net, shell} from 'electron';
import {spawn} from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import log from 'electron-log/main';

import pkg from '../package.json';

const REPOSITORY = (pkg.repository || '').replace(/^github:/, '');   // "owner/name"
const FIRST_CHECK_DELAY = 15 * 1000;
const CHECK_INTERVAL = 4 * 60 * 60 * 1000;
const PROGRESS_INTERVAL = 250;   // ms between progress messages to the window

let getWindow = () => undefined;
// status: idle | checking | up-to-date | downloading | installing | ready | available | error
// downloading adds received/total (bytes) and speed (bytes/s); installing adds percent
let state = {status: 'idle'};

function setState(next) {
    state = {...next, currentVersion: app.getVersion(), canAutoInstall: canAutoInstall(), checkedAt: next.checkedAt || state.checkedAt};

    const window = getWindow();
    if (window && !window.isDestroyed()) {
        window.webContents.send('update:status', state);
    }
}

// Squirrel installs live in %LOCALAPPDATA%\podstack\app-<version>\ with Update.exe one level up.
function updateExe() {
    return path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
}

function canAutoInstall() {
    return app.isPackaged && process.platform === 'win32' && fs.existsSync(updateExe());
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

// "SHA1 filename size" lines; the file starts with a BOM.
export function parseReleases(text) {
    return text.replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(line => {
        const [sha1, file, size] = line.split(/\s+/);
        return {sha1: sha1.toUpperCase(), file: path.basename(file.split('?')[0]), size: parseInt(size, 10)};
    });
}

// Downloads url to file, calling onProgress(received, total) as data arrives. Returns the SHA1 of what was written.
async function download(url, file, onProgress) {
    const res = await net.fetch(url, {headers: {'User-Agent': `podstack/${app.getVersion()}`}});
    if (!res.ok) {
        throw new Error(`Download failed (${res.status}).`);
    }

    const total = parseInt(res.headers.get('content-length'), 10) || undefined;
    const hash = crypto.createHash('sha1');
    const out = fs.createWriteStream(file);
    const reader = res.body.getReader();
    let received = 0;

    try {
        for (;;) {
            const {done, value} = await reader.read();
            if (done) {
                break;
            }

            hash.update(value);
            received += value.length;
            if (!out.write(value)) {
                await new Promise(resolve => out.once('drain', resolve));
            }
            onProgress(received, total);
        }
    } finally {
        await new Promise(resolve => out.end(resolve));
    }

    return hash.digest('hex').toUpperCase();
}

// Runs Update.exe --update on a local folder holding RELEASES and the package, reporting its percentages.
function squirrelInstall(folder, onPercent) {
    return new Promise((resolve, reject) => {
        const child = spawn(updateExe(), ['--update', folder], {windowsHide: true});
        let buffered = '';

        child.stdout.on('data', chunk => {
            buffered += chunk.toString();
            const lines = buffered.split(/\r?\n/);
            buffered = lines.pop();
            lines.forEach(line => {
                const percent = parseInt(line.trim(), 10);
                if (!isNaN(percent) && percent >= 0 && percent <= 100) {
                    onPercent(percent);
                }
            });
        });
        child.on('error', reject);
        child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`Update.exe exited with code ${code}.`))));
    });
}

async function downloadAndInstall(release, version, checkedAt) {
    const asset = name => release.assets.find(a => a.name === name);
    const releasesAsset = asset('RELEASES');
    if (releasesAsset === undefined) {
        throw new Error('The release has no RELEASES file.');
    }

    const releasesText = await (await net.fetch(releasesAsset.browser_download_url)).text();
    const entry = parseReleases(releasesText).find(e => /-full\.nupkg$/i.test(e.file));
    const nupkg = entry && asset(entry.file);
    if (nupkg === undefined) {
        throw new Error('The release has no full update package.');
    }

    const folder = path.join(os.tmpdir(), `podstack-update-${version}`);
    fs.rmSync(folder, {recursive: true, force: true});
    fs.mkdirSync(folder, {recursive: true});

    // download with progress, throttled so the window isn't flooded
    const started = Date.now();
    let lastSent = 0;
    const sha1 = await download(nupkg.browser_download_url, path.join(folder, entry.file), (received, total) => {
        const now = Date.now();
        if (now - lastSent >= PROGRESS_INTERVAL || received === total) {
            lastSent = now;
            const elapsed = (now - started) / 1000;
            setState({
                status: 'downloading', version, url: release.html_url, checkedAt,
                received, total: total || entry.size, speed: elapsed > 0 ? received / elapsed : 0,
            });
        }
    });

    if (sha1 !== entry.sha1) {
        throw new Error('The downloaded update is corrupt (checksum mismatch).');
    }

    // Squirrel installs from a folder with a RELEASES file naming the local package
    fs.writeFileSync(path.join(folder, 'RELEASES'), `${entry.sha1} ${entry.file} ${entry.size}`);

    setState({status: 'installing', version, url: release.html_url, checkedAt, percent: 0});
    await squirrelInstall(folder, percent => setState({...state, status: 'installing', percent}));

    fs.rmSync(folder, {recursive: true, force: true});
    log.info(`[Update] ${version} installed, ready on restart`);
    setState({status: 'ready', version, url: release.html_url, checkedAt});
}

async function check() {
    if (['checking', 'downloading', 'installing', 'ready'].includes(state.status)) {
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
    if (!canAutoInstall()) {
        setState({status: 'available', version, url: release.html_url, checkedAt});
        return state;
    }

    // runs in the background; progress arrives through setState
    downloadAndInstall(release, version, checkedAt).catch(err => {
        log.warn('[Update] Download/install failed', err.message);
        setState({status: 'available', version, url: release.html_url, checkedAt, error: err.message});
    });

    return state;
}

// Starts the newly installed version and quits this one.
function restartIntoUpdate() {
    if (state.status !== 'ready') {
        return;
    }

    // --processStartAndWait waits for this process to exit first, so the single-instance lock doesn't stop the new one
    spawn(updateExe(), ['--processStartAndWait', path.basename(process.execPath)], {detached: true, stdio: 'ignore'}).unref();
    // the window's close handler only hides it unless we're quitting
    app.isQuiting = true;
    app.quit();
}

export function initUpdater(windowGetter) {
    getWindow = windowGetter;

    ipcMain.handle('update:get-status', () => ({...state, currentVersion: app.getVersion(), canAutoInstall: canAutoInstall()}));
    ipcMain.handle('update:check', () => check());
    ipcMain.handle('update:install', () => restartIntoUpdate());
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
