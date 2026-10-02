'use strict';

import {app, BrowserWindow, Tray, Menu, shell, ipcMain, dialog, screen, clipboard} from 'electron';
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
app.on('second-instance', () => showWindow());

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
                finish({error: params.get('error') || 'unknown', description: params.get('error_description') || undefined});
            }
        };

        authWindow.webContents.on('will-redirect', handleNavigation);
        authWindow.webContents.on('will-navigate', handleNavigation);

        // EVE answers some bad requests with a JSON error page, e.g. {"error":"invalid_scope","error_description":...}
        // when the application doesn't have a requested scope enabled; otherwise it shows a plain "error" page when
        // the client id or callback is misconfigured.
        authWindow.webContents.on('did-finish-load', async () => {
            try {
                const text = await authWindow.webContents.executeJavaScript('document.body ? document.body.innerText : ""');
                const body = JSON.parse(text);
                if (body && typeof body.error === 'string') {
                    finish({error: body.error, description: typeof body.error_description === 'string' ? body.error_description : undefined});
                    return;
                }
            } catch (err) {
                // not a JSON page
            }
            if (!settled) {
                authWindow.webContents.findInPage('error');
            }
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
ipcMain.on('window:show', () => showWindow());
// The window can't use the clipboard or shell modules itself any more (see helpers/NativeHelper.js).
ipcMain.handle('clipboard:read-text', () => clipboard.readText());
ipcMain.handle('clipboard:write-text', (event, text) => {
    if (typeof text === 'string') {
        clipboard.writeText(text);
    }
});
ipcMain.handle('shell:open-external', (event, url) => {
    // only web links, like the window's own link handling
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
        shell.openExternal(url);
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

// Brings the window back whether it's minimised to the taskbar or hidden in the tray.
function showWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }
        mainWindow.show();
        mainWindow.focus();
    }
}

function quitApp() {
    app.isQuiting = true;
    app.quit();
}

// What closing the window does: 'ask' (default), 'minimize' (to the taskbar), 'tray' (keep running in the
// system tray) or 'quit'. Set from the question below ("Remember my choice") or on the Settings page.
const CLOSE_ACTIONS = ['ask', 'minimize', 'tray', 'quit'];
let askingToClose = false;

function doCloseAction(action) {
    if (action === 'quit') {
        quitApp();
    } else if (action === 'tray') {
        mainWindow.hide();
    } else {
        mainWindow.minimize();
    }
}

async function handleCloseRequest() {
    const action = windowStore.get('closeAction', 'ask');
    if (action !== 'ask') {
        doCloseAction(action);
        return;
    }
    if (askingToClose) {
        return;
    }

    askingToClose = true;
    try {
        const {response, checkboxChecked} = await dialog.showMessageBox(mainWindow, {
            type: 'question',
            title: 'Close PodStack',
            message: 'Close PodStack completely, or keep it running?',
            detail: 'Minimised, PodStack keeps refreshing your characters and can still show alerts. You can change ' +
                'this later on the Settings page.',
            buttons: ['Minimise to taskbar', 'Quit PodStack', 'Cancel'],
            defaultId: 0,
            cancelId: 2,
            noLink: true,
            checkboxLabel: 'Remember my choice',
            checkboxChecked: false,
        });

        const chosen = ['minimize', 'quit'][response];
        if (chosen === undefined) {
            return;   // cancelled
        }
        if (checkboxChecked) {
            windowStore.set('closeAction', chosen);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('window:close-action', chosen);
            }
        }
        doCloseAction(chosen);
    } finally {
        askingToClose = false;
    }
}

ipcMain.handle('window:get-close-action', () => windowStore.get('closeAction', 'ask'));
ipcMain.handle('window:set-close-action', (event, action) => {
    if (CLOSE_ACTIONS.includes(action)) {
        windowStore.set('closeAction', action);
    }
    return windowStore.get('closeAction', 'ask');
});

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
        {label: 'Show', click: () => showWindow()},
        {label: 'Quit', click: () => quitApp()}
    ]);
    trayIcon.setContextMenu(contextMenu);
    trayIcon.on('click', () => showWindow());

    // Minimising goes to the taskbar, or to the tray for those who chose that for closing.
    mainWindow.on('minimize', () => {
        if (windowStore.get('closeAction', 'ask') === 'tray') {
            mainWindow.hide();
        }
    });
    mainWindow.on('close', (e) => {
        if (app.isQuiting) {
            return;
        }
        e.preventDefault();
        handleCloseRequest();
    });
    // Windows is shutting down or logging off: quit without asking, or the question would hold it up
    mainWindow.on('query-session-end', () => {
        app.isQuiting = true;
    });
    mainWindow.on('session-end', () => {
        app.isQuiting = true;
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
