'use strict';

import {app, BrowserWindow, Tray, Menu, shell, ipcMain, dialog, screen} from 'electron';
import path from 'path';
import log from 'electron-log/main';
import Store from 'electron-store';

import appProperties from './../resources/properties';
import {initUpdater} from './updater';
import handleSquirrelEvent from './squirrelStartup';

// Installer events (install/update/uninstall) are handled and the app quits without opening a window.
const isSquirrelEvent = handleSquirrelEvent();
if (isSquirrelEvent) {
    app.quit();
}

let mainWindow;
let trayIcon;

const isDevMode = !app.isPackaged;
const iconPath = path.join(app.getAppPath(), 'resources', 'icon.ico');

// No session-wide preload: the UI loads electron-log itself (it has Node access), and the remote EVE
// login page should not get our scripts injected.
log.initialize({preload: false});
if (isDevMode) {
    log.transports.file.level = 'debug';
    log.transports.console.level = 'verbose';
} else {
    log.transports.file.level = 'info';
    log.transports.console.level = 'info';
}

// Windows only shows notifications for an app with an AppUserModelID; this is the one Squirrel's shortcuts carry.
if (process.platform === 'win32') {
    app.setAppUserModelId('com.squirrel.podstack.PodStack');
}

// Lets the renderer open stores; they resolve to the same userData files as before.
Store.initRenderer();

// Remembers the active theme's background so the window opens in the right colour instead of flashing.
const windowStore = new Store({name: 'window'});

const lockObtained = app.requestSingleInstanceLock();
app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
        mainWindow.show();
    }
});

if (!lockObtained) {
    app.quit();
}

/**
 * Opens the EVE SSO login in its own window and resolves once EVE redirects to our callback URL.
 * The login page is remote content, so this window keeps Electron's default sandboxing (no Node access).
 *
 * Resolves with {code}, {error} or {cancelled: true}.
 */
function authorizeWithEve(url) {
    return new Promise((resolve) => {
        const authWindow = new BrowserWindow({
            width: 475,
            height: 700,
            parent: mainWindow,
            show: false,
        });

        let settled = false;
        const finish = (result) => {
            if (settled) {
                return;
            }
            settled = true;
            resolve(result);

            if (!authWindow.isDestroyed()) {
                authWindow.destroy();
            }
        };

        const handleNavigation = (event, target) => {
            if (!target.startsWith(appProperties.eve_sso_callback_url)) {
                return;
            }

            event.preventDefault();
            const params = new URL(target).searchParams;
            if (params.get('code')) {
                finish({code: params.get('code')});
            } else {
                finish({error: params.get('error') || 'unknown'});
            }
        };

        authWindow.webContents.on('will-redirect', handleNavigation);
        authWindow.webContents.on('will-navigate', handleNavigation);

        // EVE shows a plain "error" page when the client id or callback is misconfigured.
        authWindow.webContents.on('did-finish-load', () => {
            authWindow.webContents.findInPage('error');
        });
        authWindow.webContents.on('found-in-page', (event, res) => {
            authWindow.webContents.stopFindInPage('clearSelection');
            if (res.matches > 0) {
                finish({error: 'client'});
            }
        });

        authWindow.on('closed', () => finish({cancelled: true}));

        // EVE's login treats unusual browsers with suspicion; present as the Chrome version Electron ships with.
        const userAgent = authWindow.webContents.getUserAgent().replace(/ (PodStack|Electron)\/\S+/g, '');
        authWindow.webContents.setUserAgent(userAgent);

        // Links on the login page (account recovery, sign-up) open in the user's browser.
        authWindow.webContents.setWindowOpenHandler(({url: target}) => {
            if (target.startsWith('https://')) {
                shell.openExternal(target);
            }

            return {action: 'deny'};
        });

        authWindow.setMenu(null);
        authWindow.loadURL(url);
        authWindow.show();
    });
}

ipcMain.handle('sso:authorize', (event, url) => authorizeWithEve(url));
ipcMain.handle('dialog:open', (event, options) => dialog.showOpenDialog(mainWindow, options));
ipcMain.on('theme:background', (event, color) => {
    if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) {
        windowStore.set('background', color);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setBackgroundColor(color);
        }
    }
});
ipcMain.handle('dialog:save', (event, options) => dialog.showSaveDialog(mainWindow, options));
// Clicking a desktop alert brings the window back from the tray.
ipcMain.on('window:show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
    }
});
// After restoring a backup: start afresh so no module writes its old in-memory data back over the restored files.
ipcMain.on('app:relaunch', () => {
    app.relaunch();
    app.exit(0);
});

// Narrowest page (window content) at which no page of the app breaks: every column shown, no squashed buttons, the
// character tabs on one row. The widest need is a skill plan with an implant/accelerator comparison (1200px) plus
// the 10px scrollbar. Measured page by page; re-measure when adding columns or tabs.
const MIN_CONTENT_WIDTH = 1210;
const DEFAULT_CONTENT_WIDTH = 1280;

const createWindow = () => {
    // a screen too small for the minimum gets a window that fills it rather than one that hangs off the edge
    const workArea = screen.getPrimaryDisplay().workAreaSize;
    const screenWidth = workArea.width - 16;
    const minWidth = Math.min(MIN_CONTENT_WIDTH, screenWidth);

    mainWindow = new BrowserWindow({
        // same icon as the exe, installer and shortcuts (the taskbar uses the window's icon)
        icon: iconPath,
        // sizes are the page's, not including the window frame
        useContentSize: true,
        width: Math.max(minWidth, Math.min(DEFAULT_CONTENT_WIDTH, screenWidth)),
        height: Math.min(800, workArea.height - 40),
        minWidth: minWidth,
        minHeight: 500,
        // Match the app background so the window doesn't flash white while loading.
        backgroundColor: windowStore.get('background', '#05070a'),
        webPreferences: {
            // The UI is local, trusted code that uses Node directly (stores, ESI requests, file import/export).
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false,
        },
    });

    if (isDevMode) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.loadFile(path.join(app.getAppPath(), 'src', 'index.html'));
    mainWindow.setTitle(`PodStack ${appProperties.display_version}`);
    mainWindow.setMenu(null);

    trayIcon = new Tray(iconPath);
    trayIcon.setToolTip('PodStack');
    let contextMenu = Menu.buildFromTemplate([
        {label: 'Show', click: () => {mainWindow.show()}},
        {label: 'Quit', click: () => {
            app.isQuiting = true;
            app.quit()
        }}
    ]);
    trayIcon.setContextMenu(contextMenu);
    trayIcon.on('click', () => {
        mainWindow.show();
    });

    mainWindow.on('minimize', (e) => {
        e.preventDefault();
        mainWindow.hide();
    });
    mainWindow.on('close', (e) => {
        if (!app.isQuiting) {
            e.preventDefault();
            mainWindow.hide();
        }

        return false;
    });
    mainWindow.on('page-title-updated', (e) => {
        e.preventDefault();
    });

    // Links in the app (e.g. target="_blank") open in the user's browser.
    mainWindow.webContents.setWindowOpenHandler(({url}) => {
        if (url.startsWith('https://') || url.startsWith('http://')) {
            shell.openExternal(url);
        }

        return {action: 'deny'};
    });
};

app.on('ready', () => {
    if (isSquirrelEvent) {
        return;
    }

    createWindow();
    initUpdater(() => mainWindow);
});
app.on('activate', () => {
    if (mainWindow === undefined) {
        createWindow();
    }
});
