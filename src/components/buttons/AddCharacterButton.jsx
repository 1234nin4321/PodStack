'use strict';

import React from 'react';

import CharacterHelper from '../../helpers/CharacterHelper';

import RaisedButton from 'material-ui/RaisedButton';
import FontIcon from 'material-ui/FontIcon';
import LinearProgress from 'material-ui/LinearProgress';

const BUSY_STAGES = ['login', 'token', 'loading'];

// Kept outside the component so an add in progress survives navigating away from and back to the page.
let currentStatus = {stage: 'idle'};
let clearTimer;
const listeners = new Set();

function setStatus(status) {
    clearTimeout(clearTimer);
    currentStatus = status;
    listeners.forEach(listener => listener(status));

    // let the final message linger briefly before going back to idle
    if (status.stage === 'done' || status.stage === 'error') {
        clearTimer = setTimeout(() => setStatus({stage: 'idle'}), status.stage === 'done' ? 4000 : 8000);
    }
}

export default class AddCharacterButton extends React.Component {
    constructor(props) {
        super(props);

        this.state = {status: currentStatus};
        this.handleClick = this.handleClick.bind(this);
        this.handleStatus = status => this.setState({status});
    }

    componentDidMount() {
        listeners.add(this.handleStatus);
        this.handleStatus(currentStatus);
    }

    componentWillUnmount() {
        listeners.delete(this.handleStatus);
    }

    handleClick() {
        if (!BUSY_STAGES.includes(currentStatus.stage)) {
            CharacterHelper.addCharacter(setStatus);
        }
    }

    renderStatus() {
        const {stage, message, done, total} = this.state.status;

        if (stage === 'idle') {
            return null;
        }

        const busy = BUSY_STAGES.includes(stage);
        const determinate = stage === 'loading' && total > 0;

        return (
            <div className={`add-character-status ${stage}`}>
                <div className="add-character-status-text" title={message}>
                    {determinate && <span className="add-character-status-count">{done}/{total}</span>}
                    {message}
                </div>
                {busy && (
                    <LinearProgress
                        mode={determinate ? 'determinate' : 'indeterminate'}
                        value={determinate ? done : undefined}
                        max={determinate ? total : undefined}
                    />
                )}
            </div>
        );
    }

    render() {
        const busy = BUSY_STAGES.includes(this.state.status.stage);

        return (
            <div className="add-character">
                {this.renderStatus()}
                <RaisedButton
                    label={busy ? 'Adding Character…' : 'Authorize Character'}
                    primary={true}
                    disabled={busy}
                    onClick={this.handleClick}
                    icon={<FontIcon className="material-icons">person_add</FontIcon>}
                />
            </div>
        );
    }
}
