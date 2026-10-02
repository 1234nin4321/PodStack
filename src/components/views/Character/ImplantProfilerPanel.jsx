'use strict';

import React from 'react';

import FontIcon from 'material-ui/FontIcon';
import IconButton from 'material-ui/IconButton';
import MenuItem from 'material-ui/MenuItem';
import SelectField from 'material-ui/SelectField';
import TextField from 'material-ui/TextField';

import Panel from '../../ui/Panel';

import DateTimeHelper from '../../../helpers/DateTimeHelper';
import TrainingProfileHelper, {CURRENT_CLONE} from '../../../helpers/TrainingProfileHelper';

const SCENARIOS = [
    {implants: CURRENT_CLONE, label: 'Current clone'},
    {implants: 0, label: 'No implants'},
    {implants: 1, label: '+1 set'},
    {implants: 2, label: '+2 set'},
    {implants: 3, label: '+3 set'},
    {implants: 4, label: '+4 set'},
    {implants: 5, label: '+5 set'},
];
const ACCELERATOR_BONUSES = [0, 2, 3, 4, 5, 6, 8, 10, 12];
const ATTRIBUTE_ORDER = ['perception', 'memory', 'willpower', 'intelligence', 'charisma'];

const formatDate = date => date.toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'});

// Compares a queue's training time under different implant sets and cerebral accelerators.
export default class ImplantProfilerPanel extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            acceleratorBonus: 0,
            acceleratorDays: '7',
        };
    }

    componentDidUpdate(prevProps) {
        if (prevProps.queue !== this.props.queue) {
            this.results = undefined;
        }
    }

    // Replaying the queue per scenario is the slow part, so results are kept until the inputs change.
    getResults() {
        const key = `${this.state.acceleratorBonus}:${this.state.acceleratorDays}`;
        if (this.results === undefined || this.resultsKey !== key) {
            const accelerator = {bonus: this.state.acceleratorBonus, days: parseFloat(this.state.acceleratorDays)};
            this.results = SCENARIOS.map(s => ({
                ...s,
                time: TrainingProfileHelper.simulate(this.props.characterId, this.props.queue, s.implants, accelerator),
            }));
            this.resultsKey = key;
        }
        return this.results;
    }

    render() {
        const hasSkills = this.props.queue.some(item => item.type === 'skill');
        const bonuses = TrainingProfileHelper.getImplantBonuses(this.props.characterId);
        const base = TrainingProfileHelper.getBaseAttributes(this.props.characterId);
        const results = hasSkills ? this.getResults() : [];
        const current = results[0];

        return (
            <Panel
                title="Implants & Boosters"
                icon="psychology"
                className="analysis-panel"
                subtitle={this.props.label}
                actions={
                    <IconButton tooltip="Close" onClick={this.props.onClose} style={{width: 32, height: 32, padding: 4}}>
                        <FontIcon className="material-icons" color="var(--text-dim)">close</FontIcon>
                    </IconButton>
                }
            >
                <div className="profiler-clone">
                    {ATTRIBUTE_ORDER.map(a =>
                        <div key={a} className="profiler-attribute">
                            <div className="analysis-total-label">{a}</div>
                            <div className="num">
                                {base[a]}
                                {bonuses[a] > 0 && <span className="profiler-bonus"> +{bonuses[a]}</span>}
                            </div>
                        </div>
                    )}
                </div>

                <div className="fit-actions" style={{marginTop: 0}}>
                    <SelectField
                        floatingLabelText="Cerebral accelerator"
                        value={this.state.acceleratorBonus}
                        onChange={(e, i, acceleratorBonus) => this.setState({acceleratorBonus})}
                        style={{width: 220}}
                    >
                        {ACCELERATOR_BONUSES.map(b =>
                            <MenuItem key={b} value={b} primaryText={b === 0 ? 'None' : `+${b} to all attributes`}/>
                        )}
                    </SelectField>
                    {this.state.acceleratorBonus > 0 &&
                        <TextField
                            id="acceleratorDays"
                            floatingLabelText="Lasts (days)"
                            type="number"
                            min="0"
                            value={this.state.acceleratorDays}
                            onChange={(e, acceleratorDays) => this.setState({acceleratorDays})}
                            style={{width: 120}}
                        />
                    }
                </div>

                {!hasSkills ?
                    <p className="empty">This plan has no skills to train.</p> :
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Clone</th>
                                <th className="right">Training time</th>
                                <th className="right">Finishes</th>
                                <th className="right">vs current</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.map(r => {
                                const delta = r.time - current.time;
                                return (
                                    <tr key={r.label} className={r === current ? 'profiler-current' : ''}>
                                        <td>{r.label}</td>
                                        <td className="right num">{DateTimeHelper.niceCountdown(r.time)}</td>
                                        <td className="right num muted">{formatDate(new Date(Date.now() + r.time))}</td>
                                        <td className="right num" style={{color: Math.abs(delta) < 60000 ? 'var(--text-faint)' : (delta < 0 ? 'var(--good)' : 'var(--warn)')}}>
                                            {Math.abs(delta) < 60000 ? '—' : `${delta < 0 ? '−' : '+'}${DateTimeHelper.niceCountdown(Math.abs(delta))}`}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                }

                <p className="muted analysis-note">
                    Base attributes are EVE's values minus your current implants (shown as +N). Times assume training
                    starts now. EVE doesn't report boosters, so PodStack can't tell whether an accelerator is active;
                    use the setting above to see its effect.
                </p>
            </Panel>
        );
    }
}
