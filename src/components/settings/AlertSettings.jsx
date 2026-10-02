'use strict';

import React from 'react';
import {Link} from 'react-router-dom';

import FontIcon from 'material-ui/FontIcon';
import RaisedButton from 'material-ui/RaisedButton';
import Toggle from 'material-ui/Toggle';

import AlertHelper, {ALERT_TYPES} from '../../helpers/AlertHelper';
import DateTimeHelper from '../../helpers/DateTimeHelper';
import Panel from '../ui/Panel';

export default class AlertSettings extends React.Component {
    constructor(props) {
        super(props);

        this.state = {settings: AlertHelper.getSettings(), log: AlertHelper.getLog()};
    }

    componentDidMount() {
        this.unsubscribe = AlertHelper.subscribe(() => this.setState({settings: AlertHelper.getSettings(), log: AlertHelper.getLog()}));
    }

    componentWillUnmount() {
        this.unsubscribe();
    }

    update(changes) {
        AlertHelper.setSettings({...this.state.settings, ...changes});
    }

    render() {
        const {settings, log} = this.state;

        return (
            <Panel title="Alerts" icon="notifications" style={{maxWidth: 960, marginBottom: 16}}
                   actions={<RaisedButton label="Send test" onClick={() => AlertHelper.test()}
                                          icon={<FontIcon className="material-icons">notifications_active</FontIcon>}/>}>
                <div className="alert-settings">
                    <Toggle
                        label="Desktop notifications"
                        labelPosition="right"
                        toggled={settings.enabled}
                        onToggle={(e, enabled) => this.update({enabled})}
                    />
                    <p className="muted" style={{margin: '4px 0 16px'}}>
                        PodStack checks every minute, including while it's minimised to the tray, and alerts once per
                        event. Clicking an alert opens that character.
                    </p>

                    <div className={`alert-types ${settings.enabled ? '' : 'disabled'}`}>
                        {ALERT_TYPES.map(type =>
                            <label key={type.id} className="alert-type">
                                <input
                                    type="checkbox"
                                    checked={settings.types[type.id]}
                                    disabled={!settings.enabled}
                                    onChange={e => this.update({types: {...settings.types, [type.id]: e.target.checked}})}
                                />
                                <span>
                                    <span className="alert-type-name">{type.label}</span>
                                    <span className="muted alert-type-description">{type.description}</span>
                                </span>
                            </label>
                        )}
                    </div>

                    <label className="alert-threshold">
                        <span>Skill queue running low below</span>
                        <input
                            className="field"
                            type="number"
                            min={1}
                            max={240}
                            value={settings.queueLowHours}
                            disabled={!settings.enabled || !settings.types.queue_low}
                            onChange={e => this.update({queueLowHours: Math.max(1, Math.min(240, parseInt(e.target.value, 10) || 24))})}
                        />
                        <span>hours</span>
                    </label>

                    <div className="alert-log">
                        <div className="alert-log-head">
                            <span className="stat-label">Recent alerts</span>
                            {log.length > 0 && <button type="button" className="link-button" onClick={() => AlertHelper.clearLog()}>Clear</button>}
                        </div>
                        {log.length === 0 && <p className="muted" style={{margin: 0}}>None yet.</p>}
                        {log.slice(0, 10).map((entry, i) =>
                            <div key={i} className="list-row">
                                <span className="grow">
                                    {entry.characterId !== undefined ?
                                        <Link to={`/characters/${entry.characterId}`}>{entry.title}</Link> : entry.title}
                                    <span className="muted"> · {entry.body}</span>
                                </span>
                                <span className="muted num">{DateTimeHelper.timeSince(new Date(entry.time)) || '0s'} ago</span>
                            </div>
                        )}
                    </div>
                </div>
            </Panel>
        );
    }
}
