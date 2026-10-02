'use strict';

import Store from 'electron-store';

// EVE's API doesn't say which characters share an account, so the user groups them here.
// Stored as {accounts: {[accountId]: {name}}, assignments: {[characterId]: accountId}}.
const accountsStore = new Store({name: 'accounts'});

function read() {
    return accountsStore.get('data') || {accounts: {}, assignments: {}};
}

function write(data) {
    accountsStore.set('data', data);
}

export default class AccountStore {
    /**
     * @returns {array} [{id, name}] sorted by name
     */
    static getAccounts() {
        const data = read();
        return Object.keys(data.accounts)
            .map(id => ({id, name: data.accounts[id].name}))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
    }

    static getAccountId(characterId) {
        return read().assignments[characterId.toString()];
    }

    static createAccount(name) {
        const data = read();
        const id = crypto.randomUUID();
        data.accounts[id] = {name};
        write(data);
        return id;
    }

    static renameAccount(accountId, name) {
        const data = read();
        if (data.accounts[accountId] !== undefined) {
            data.accounts[accountId].name = name;
            write(data);
        }
    }

    // Deleting an account leaves its characters unassigned.
    static deleteAccount(accountId) {
        const data = read();
        delete data.accounts[accountId];
        Object.keys(data.assignments).forEach(characterId => {
            if (data.assignments[characterId] === accountId) {
                delete data.assignments[characterId];
            }
        });
        write(data);
    }

    // accountId undefined unassigns the character.
    static assign(characterId, accountId) {
        const data = read();
        if (accountId === undefined || data.accounts[accountId] === undefined) {
            delete data.assignments[characterId.toString()];
        } else {
            data.assignments[characterId.toString()] = accountId;
        }
        write(data);
    }
}
