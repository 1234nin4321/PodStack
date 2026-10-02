'use strict';

import React from 'react';

import AcceleratorHelper from '../../../helpers/AcceleratorHelper';
import DateTimeHelper from '../../../helpers/DateTimeHelper';
import Panel from '../../ui/Panel';

// value for a datetime-local input, in local time
function localInput(date) {
    const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
}

// The active cerebral accelerator: its bonus, which one it is and when it ends. ESI only reveals the bonus, so the
// player can say which accelerator it is and correct the start time; both are kept until it runs out.
export default class AcceleratorPanel extends React.Component {
    componentDidMount() {
        this.timer = setInterval(() => this.forceUpdate(), 60000);
    }

    componentWillUnmount() {
        clearInterval(this.timer);
    }

    render() {
        const char = this.props.character;
        const status = AcceleratorHelper.status(char);
        if (status === undefined) {
            return null;
        }
        const candidates = AcceleratorHelper.candidates(status.bonus);
        const set = changes => {
            AcceleratorHelper.setChoice(char, changes);
            this.forceUpdate();
        };

        return (
            <Panel title="Cerebral Accelerator" icon="bolt" subtitle={`+${status.bonus} to all attributes`}>
                <dl className="kv">
                    <dt>Accelerator</dt>
                    <dd>
                        {candidates.length > 0 ?
                            <select className="health-account-select accel-select" value={status.item ? status.item.typeId : ''}
                                    onChange={e => set({typeId: parseInt(e.target.value, 10)})}>
                                {candidates.map(a => <option key={a.typeId} value={a.typeId}>{a.name} ({a.days}d)</option>)}
                            </select> :
                            <span className="faint">Unknown +{status.bonus} accelerator</span>
                        }
                    </dd>
                    <dt>Started</dt>
                    <dd>
                        <input className="field accel-start" type="datetime-local" value={localInput(status.start)}
                               max={localInput(new Date())}
                               onChange={e => e.target.value && set({start: new Date(e.target.value).getTime()})}/>
                        {status.estimated && <span className="faint"> estimated</span>}
                    </dd>
                    <dt>Ends</dt>
                    <dd>
                        {status.end === undefined ? <span className="faint">Unknown</span> :
                            status.remaining > 0 ?
                                <span>
                                    <span className="num" style={{color: 'var(--good)'}}>in {DateTimeHelper.niceCountdown(status.remaining).split(' ').slice(0, 3).join(' ')}</span>
                                    <span className="muted"> · {status.end.toLocaleString(navigator.language)}</span>
                                </span> :
                                <span style={{color: 'var(--warn)'}}>Should have ended; it clears on the next refresh</span>
                        }
                    </dd>
                </dl>
                <p className="muted accel-note">
                    EVE only reveals the bonus, so check which accelerator it is and when you plugged it in.
                    {status.biology > 0 && ` Biology ${status.biology} makes it last ${status.biology * 20}% longer.`}
                </p>
            </Panel>
        );
    }
}
