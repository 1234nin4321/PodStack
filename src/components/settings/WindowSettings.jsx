'use strict';

import React from 'react';
import {ipcRenderer} from 'electron';

import Panel from '../ui/Panel';

const OPTIONS = [
    {id: 'ask', label: 'Ask every time', description: 'Choose between minimising and quitting when you close the window.'},
    {id: 'minimize', label: 'Minimise to taskbar', description: 'Keeps running, refreshing and alerting; click it on the taskbar to come back.'},
    {id: 'tray', label: 'Hide to system tray', description: 'Keeps running out of sight; click the tray icon to come back. Minimising does this too.'},
    {id: 'quit', label: 'Quit PodStack', description: 'Closes PodStack completely. Alerts stop until you start it again.'},
];

// What closing the window does (handled in the main process, see handleCloseRequest in index.js).
export default class WindowSettings extends React.Component {
    constructor(props) {
        super(props);

        this.state = {action: undefined};
        this.handleChanged = (event, action) => this.setState({action});
    }

    componentDidMount() {
        ipcRenderer.invoke('window:get-close-action').then(action => !this.unmounted && this.setState({action}));
        ipcRenderer.on('window:close-action', this.handleChanged);
    }

    componentWillUnmount() {
        this.unmounted = true;
        ipcRenderer.removeListener('window:close-action', this.handleChanged);
    }

    choose(action) {
        this.setState({action});
        ipcRenderer.invoke('window:set-close-action', action);
    }

    render() {
        return (
            <Panel title="When Closing The Window" icon="close_fullscreen" style={{maxWidth: 960, marginBottom: 16}}>
                <div className="close-options" role="radiogroup" aria-label="When closing the window">
                    {OPTIONS.map(option =>
                        <label key={option.id} className={`close-option ${this.state.action === option.id ? 'selected' : ''}`}>
                            <input type="radio" name="close-action" checked={this.state.action === option.id}
                                   onChange={() => this.choose(option.id)}/>
                            <span>
                                <span className="alert-type-name">{option.label}</span>
                                <span className="muted alert-type-description">{option.description}</span>
                            </span>
                        </label>
                    )}
                </div>
            </Panel>
        );
    }
}
