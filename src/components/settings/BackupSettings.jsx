'use strict';

import React from 'react';
import path from 'path';

import FontIcon from 'material-ui/FontIcon';
import RaisedButton from 'material-ui/RaisedButton';

import BackupHelper from '../../helpers/BackupHelper';
import DialogHelper from '../../helpers/DialogHelper';
import Panel from '../ui/Panel';

const FILTERS = [
    {name: 'PodStack Backups', extensions: ['podstack_backup']},
    {name: 'All Files', extensions: ['*']},
];

function plural(n, word) {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// mode: undefined | 'create' (asking for a new password) | 'restore' (asking for the backup's password)
//       | 'confirm' (backup decrypted, waiting for the user to confirm replacing their data)
export default class BackupSettings extends React.Component {
    constructor(props) {
        super(props);

        this.state = {mode: undefined, password: '', confirm: '', file: undefined, backup: undefined, message: undefined, error: undefined};
    }

    reset(changes) {
        this.setState({mode: undefined, password: '', confirm: '', file: undefined, backup: undefined, error: undefined, ...changes});
    }

    async handleCreate() {
        const {password, confirm} = this.state;
        if (password.length < BackupHelper.MIN_PASSWORD_LENGTH) {
            this.setState({error: `Use a password of at least ${BackupHelper.MIN_PASSWORD_LENGTH} characters.`});
            return;
        }
        if (password !== confirm) {
            this.setState({error: 'The passwords don\'t match.'});
            return;
        }

        const date = new Date().toISOString().slice(0, 10);
        const filePath = await DialogHelper.showSaveDialog({defaultPath: `PodStack ${date}.podstack_backup`, filters: FILTERS});
        if (filePath === undefined) {
            return;
        }

        try {
            const summary = BackupHelper.createBackup(filePath, password);
            this.reset({message: `Saved ${plural(summary.characters, 'character')} and ${plural(summary.plans, 'skill plan')} to ${path.basename(filePath)}.`});
        } catch (err) {
            this.setState({error: `Couldn't save the backup: ${err.message}`});
        }
    }

    async handlePickRestore() {
        const files = await DialogHelper.showOpenDialog({properties: ['openFile'], filters: FILTERS});
        if (files !== undefined) {
            this.reset({mode: 'restore', file: files[0], message: undefined});
        }
    }

    handleUnlock() {
        try {
            const backup = BackupHelper.readBackup(this.state.file, this.state.password);
            this.setState({mode: 'confirm', backup, password: '', error: undefined});
        } catch (err) {
            this.setState({error: err.message});
        }
    }

    renderForm() {
        const {mode, password, confirm, file, backup, error} = this.state;

        if (mode === 'create') {
            return (
                <form className="backup-form" onSubmit={e => { e.preventDefault(); this.handleCreate(); }}>
                    <p className="muted" style={{margin: 0}}>
                        The backup includes your characters' EVE logins, so it's encrypted with this password. You'll
                        need it to restore; it can't be recovered.
                    </p>
                    <input className="field" type="password" placeholder="Password" autoFocus value={password}
                           onChange={e => this.setState({password: e.target.value, error: undefined})}/>
                    <input className="field" type="password" placeholder="Repeat password" value={confirm}
                           onChange={e => this.setState({confirm: e.target.value, error: undefined})}/>
                    {error && <div style={{color: 'var(--warn)'}}>{error}</div>}
                    <div className="backup-actions">
                        <RaisedButton label="Cancel" onClick={() => this.reset()}/>
                        <RaisedButton label="Save backup…" primary={true} type="submit"/>
                    </div>
                </form>
            );
        }

        if (mode === 'restore') {
            return (
                <form className="backup-form" onSubmit={e => { e.preventDefault(); this.handleUnlock(); }}>
                    <p className="muted" style={{margin: 0}}>Password for {path.basename(file)}:</p>
                    <input className="field" type="password" placeholder="Password" autoFocus value={password}
                           onChange={e => this.setState({password: e.target.value, error: undefined})}/>
                    {error && <div style={{color: 'var(--warn)'}}>{error}</div>}
                    <div className="backup-actions">
                        <RaisedButton label="Cancel" onClick={() => this.reset()}/>
                        <RaisedButton label="Open" primary={true} type="submit"/>
                    </div>
                </form>
            );
        }

        if (mode === 'confirm') {
            return (
                <div className="backup-form">
                    <p style={{margin: 0}}>
                        Backup from {new Date(backup.created).toLocaleString(navigator.language)} with{' '}
                        {plural(backup.summary.characters, 'character')} and {plural(backup.summary.plans, 'skill plan')}.
                    </p>
                    <p style={{margin: 0, color: 'var(--warn)'}}>
                        Restoring replaces all characters, plans, farms, accounts and settings in PodStack with the
                        backup's, then restarts PodStack.
                    </p>
                    <div className="backup-actions">
                        <RaisedButton label="Cancel" onClick={() => this.reset()}/>
                        <RaisedButton label="Restore and restart" primary={true} onClick={() => BackupHelper.restore(backup.contents)}/>
                    </div>
                </div>
            );
        }

        return null;
    }

    render() {
        return (
            <Panel title="Backup & Restore" icon="backup" style={{maxWidth: 960, marginBottom: 16}}>
                <div className="update-settings">
                    <div className="update-settings-text">
                        <div>
                            Save your characters (with their EVE logins), skill plans, SP farms, accounts, alerts and
                            settings to one password-protected file, to keep safe or move PodStack to another computer.
                        </div>
                        {this.state.message && <div style={{color: 'var(--good)', marginTop: 6}}>{this.state.message}</div>}
                    </div>
                    {this.state.mode === undefined &&
                        <div className="update-actions">
                            <RaisedButton label="Restore…" onClick={() => this.handlePickRestore()}
                                          icon={<FontIcon className="material-icons">settings_backup_restore</FontIcon>}/>
                            <RaisedButton label="Create backup" primary={true} onClick={() => this.reset({mode: 'create', message: undefined})}
                                          icon={<FontIcon className="material-icons">backup</FontIcon>}/>
                        </div>
                    }
                </div>
                {this.renderForm()}
            </Panel>
        );
    }
}
