'use strict';

import React from 'react';

import FontIcon from 'material-ui/FontIcon';
import RaisedButton from 'material-ui/RaisedButton';

import ThemeHelper, {THEMES} from '../../helpers/ThemeHelper';
import UpdateHelper from '../../helpers/UpdateHelper';
import UpdateProgress from '../ui/UpdateProgress';
import DateTimeHelper from '../../helpers/DateTimeHelper';
import appProperties from '../../../resources/properties';
import PageHeader from '../ui/PageHeader';
import Panel from '../ui/Panel';
import AlertSettings from '../settings/AlertSettings';
import BackupSettings from '../settings/BackupSettings';
import WindowSettings from '../settings/WindowSettings';
import EveFolderSettings from '../settings/EveFolderSettings';

export default class Settings extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            theme: ThemeHelper.get(),
            update: undefined,
        };
    }

    componentDidMount() {
        this.unsubscribeTheme = ThemeHelper.subscribe(theme => this.setState({theme}));
        UpdateHelper.getStatus().then(update => this.setState({update}));
        this.unsubscribeUpdate = UpdateHelper.subscribe(update => this.setState({update}));
    }

    componentWillUnmount() {
        this.unsubscribeTheme();
        this.unsubscribeUpdate();
    }

    renderUpdateStatus() {
        const update = this.state.update;
        if (update === undefined) {
            return null;
        }

        const checked = update.checkedAt ? ` Last checked ${DateTimeHelper.timeSince(new Date(update.checkedAt))} ago.` : '';
        switch (update.status) {
            case 'checking':
                return <span className="muted">Checking for updates…</span>;
            case 'up-to-date':
                return <span style={{color: 'var(--good)'}}>You're on the latest version.{checked}</span>;
            case 'downloading':
            case 'installing':
                return <UpdateProgress status={update}/>;
            case 'ready':
                return <span style={{color: 'var(--good)'}}>{update.version} is installed. Restart to start using it.</span>;
            case 'available':
                return (
                    <span>
                        {update.version} is available.{' '}
                        {update.error && <span style={{color: 'var(--warn)'}}>Last attempt failed: {update.error} </span>}
                        {update.canAutoInstall ? '' : 'This copy can\'t update itself (portable or unsigned build), so download it from the release page.'}
                    </span>
                );
            case 'error':
                return <span style={{color: 'var(--warn)'}}>Couldn't check for updates: {update.error}</span>;
            default:
                return <span className="muted">Not checked yet.</span>;
        }
    }

    renderUpdateAction() {
        const update = this.state.update || {};

        if (update.status === 'ready') {
            return (
                <RaisedButton label="Restart to update" primary={true} onClick={() => UpdateHelper.install()}
                              icon={<FontIcon className="material-icons">restart_alt</FontIcon>}/>
            );
        }
        if (update.status === 'available' && update.canAutoInstall) {
            return (
                <div className="update-actions">
                    <RaisedButton label="What's new" onClick={() => UpdateHelper.openRelease()}
                                  icon={<FontIcon className="material-icons">open_in_new</FontIcon>}/>
                    <RaisedButton label={update.error ? 'Try again' : 'Update now'} primary={true}
                                  onClick={() => UpdateHelper.download()}
                                  icon={<FontIcon className="material-icons">download</FontIcon>}/>
                </div>
            );
        }
        if (update.status === 'available') {
            return (
                <RaisedButton label="Open download page" primary={true} onClick={() => UpdateHelper.openRelease()}
                              icon={<FontIcon className="material-icons">open_in_new</FontIcon>}/>
            );
        }

        return (
            <RaisedButton
                label="Check for updates"
                disabled={['checking', 'downloading', 'installing'].includes(update.status)}
                onClick={() => UpdateHelper.check()}
                icon={<FontIcon className="material-icons">sync</FontIcon>}
            />
        );
    }

    render() {
        return (
            <div>
                <PageHeader eyebrow="System" title="Settings"/>

                <Panel title="Updates" icon="system_update" style={{maxWidth: 960, marginBottom: 16}}>
                    <div className="update-settings">
                        <div className="update-settings-text">
                            <div className="update-version">
                                PodStack {appProperties.display_version}
                                <span className="muted"> ({appProperties.version})</span>
                            </div>
                            <div className="update-status">{this.renderUpdateStatus()}</div>
                            <div className="muted update-note">
                                PodStack checks for new versions at startup and every 4 hours and lets you know. Nothing is
                                downloaded until you choose Update now; after it installs, you choose when to restart.
                            </div>
                        </div>
                        {this.renderUpdateAction()}
                    </div>
                </Panel>

                <WindowSettings/>

                <EveFolderSettings/>

                <AlertSettings/>

                <BackupSettings/>

                <Panel title="Theme" icon="palette" style={{maxWidth: 960}}>
                    <div className="theme-grid" role="radiogroup" aria-label="Theme">
                        {THEMES.map(theme => {
                            const selected = theme.id === this.state.theme;

                            return (
                                <button
                                    key={theme.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    className={`theme-card ${selected ? 'selected' : ''}`}
                                    onClick={() => ThemeHelper.set(theme.id)}
                                >
                                    {/* data-theme makes the preview render in that theme's colours */}
                                    <div className="theme-preview" data-theme={theme.id} aria-hidden="true">
                                        <div className="theme-preview-nav">
                                            <span className="dot accent"/>
                                            <span className="line"/>
                                            <span className="line short"/>
                                        </div>
                                        <div className="theme-preview-main">
                                            <div className="theme-preview-panel">
                                                <span className="line strong"/>
                                                <span className="line"/>
                                                <span className="bar"><span/></span>
                                            </div>
                                            <div className="theme-preview-swatches">
                                                <span style={{background: 'var(--accent)'}}/>
                                                <span style={{background: 'var(--omega)'}}/>
                                                <span style={{background: 'var(--good)'}}/>
                                                <span style={{background: 'var(--danger)'}}/>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="theme-card-label">
                                        <div className="theme-card-name">
                                            {theme.name}
                                            {selected && <i className="material-icons">check_circle</i>}
                                        </div>
                                        <div className="theme-card-description">{theme.description}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </Panel>
            </div>
        );
    }
}
