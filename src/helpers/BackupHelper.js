'use strict';

// Password-protected backups of everything the user set up: characters (including their EVE logins), skill plans,
// SP farms, accounts, alerts and settings. Caches that PodStack rebuilds from ESI (types, stations, prices, mail
// bodies...) are left out.
//
// The file is JSON: the data is encrypted with AES-256-GCM using a key derived from the password with scrypt, so
// it can be restored on any computer with the password, and is useless without it (it contains refresh tokens).

import crypto from 'crypto';
import fs from 'fs';
import {ipcRenderer} from 'electron';
import Store from 'electron-store';

import Character from '../models/Character';
import SkillPlanStore from './SkillPlanStore';
import appProperties from '../../resources/properties';

const FORMAT = 'podstack-backup';
const STORES = [
    'authorized-characters',
    'character-data',
    'skillplans-store',
    'farm-characters',
    'accounts',
    'settings',
    'alerts',
    'window',
];
const LOCAL_STORAGE_PREFIX = 'podstack.';
const SCRYPT = {N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024};

function deriveKey(password, salt, params) {
    return crypto.scryptSync(password, salt, 32, params);
}

// Writes data that's only saved every few seconds, so the backup has the latest of it.
function flushPendingSaves() {
    const anyCharacter = Object.values(Character.getAll())[0];
    if (anyCharacter !== undefined) {
        anyCharacter.saveImmediately();
    }
    SkillPlanStore.saveImmediately();
}

export default class BackupHelper {
    static MIN_PASSWORD_LENGTH = 8;

    /**
     * @returns {object} what a backup would contain: {characters, plans}
     */
    static summarize(stores) {
        const characters = Object.keys((stores['authorized-characters'] || {}).authorizedCharacters || {}).length;
        const plans = Object.values((stores['skillplans-store'] || {})['skillplans-store'] || {})
            .reduce((sum, perCharacter) => sum + Object.keys(perCharacter).length, 0);
        return {characters, plans};
    }

    static createBackup(filePath, password) {
        flushPendingSaves();

        const stores = {};
        STORES.forEach(name => stores[name] = new Store({name}).store);

        const localStorageData = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(LOCAL_STORAGE_PREFIX)) {
                localStorageData[key] = localStorage.getItem(key);
            }
        }

        const payload = Buffer.from(JSON.stringify({stores, localStorage: localStorageData}), 'utf8');
        const salt = crypto.randomBytes(16);
        const iv = crypto.randomBytes(12);
        const params = {N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p};
        const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(password, salt, SCRYPT), iv);
        const data = Buffer.concat([cipher.update(payload), cipher.final()]);

        const file = {
            format: FORMAT,
            version: 1,
            created: new Date().toISOString(),
            app: `podstack/${appProperties.version}`,
            summary: BackupHelper.summarize(stores),
            kdf: {name: 'scrypt', ...params, salt: salt.toString('base64')},
            cipher: {name: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64')},
            data: data.toString('base64'),
        };
        fs.writeFileSync(filePath, JSON.stringify(file, null, 2), {encoding: 'utf8', mode: 0o600});

        return file.summary;
    }

    /**
     * Reads and decrypts a backup. Throws an Error with a user-facing message if it can't.
     *
     * @returns {object} {created, summary, contents}
     */
    static readBackup(filePath, password) {
        let file;
        try {
            file = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (err) {
            throw new Error('That file isn\'t a PodStack backup.');
        }
        if (file.format !== FORMAT || file.version !== 1 || !file.kdf || !file.cipher) {
            throw new Error('That file isn\'t a PodStack backup, or was made by a newer version of PodStack.');
        }

        let contents;
        try {
            const {N, r, p} = file.kdf;
            const key = deriveKey(password, Buffer.from(file.kdf.salt, 'base64'), {N, r, p, maxmem: SCRYPT.maxmem});
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(file.cipher.iv, 'base64'));
            decipher.setAuthTag(Buffer.from(file.cipher.tag, 'base64'));
            const payload = Buffer.concat([decipher.update(Buffer.from(file.data, 'base64')), decipher.final()]);
            contents = JSON.parse(payload.toString('utf8'));
        } catch (err) {
            throw new Error('Wrong password, or the backup file is damaged.');
        }

        return {created: file.created, summary: BackupHelper.summarize(contents.stores || {}), contents};
    }

    // Replaces the current data with a backup's and restarts PodStack.
    static restore(contents) {
        Object.entries(contents.stores || {}).forEach(([name, data]) => {
            if (STORES.includes(name) && data !== null && typeof data === 'object') {
                new Store({name}).store = data;
            }
        });
        Object.entries(contents.localStorage || {}).forEach(([key, value]) => {
            if (key.startsWith(LOCAL_STORAGE_PREFIX) && typeof value === 'string') {
                localStorage.setItem(key, value);
            }
        });

        ipcRenderer.send('app:relaunch');
    }
}
