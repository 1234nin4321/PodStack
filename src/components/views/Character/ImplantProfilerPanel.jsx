'use strict';

import React from 'react';

import AutoComplete from 'material-ui/AutoComplete';
import FontIcon from 'material-ui/FontIcon';
import IconButton from 'material-ui/IconButton';
import MenuItem from 'material-ui/MenuItem';
import SelectField from 'material-ui/SelectField';
import TextField from 'material-ui/TextField';

import Panel from '../../ui/Panel';

import Character from '../../../models/Character';
import DateTimeHelper from '../../../helpers/DateTimeHelper';
import TrainingProfileHelper, {CURRENT_CLONE} from '../../../helpers/TrainingProfileHelper';
import {ACCELERATORS, IMPLANT_GRADES, IMPLANT_SLOTS} from '../../../../resources/clone_items';

const SCENARIOS = [
    {implants: CURRENT_CLONE, label: 'Current clone'},
    {implants: 0, label: 'No implants'},
    ...IMPLANT_GRADES.map(g => ({
        implants: g.bonus,
        label: `${g.grade} implants +${g.bonus}`,
        detail: IMPLANT_SLOTS.map(s => g.name(s.base)).join(' · '),
    })),
];
const NO_ACCELERATOR = 'none';
const CUSTOM_ACCELERATOR = 'custom';
const CUSTOM_BONUSES = [1, 2, 3, 4, 5, 6, 8, 10, 12];

// Options for the searchable accelerator box: "None", every accelerator as "Name +X", then "Custom…".
const ACCELERATOR_OPTIONS = [
    {id: NO_ACCELERATOR, text: 'None'},
    ...ACCELERATORS.map(a => ({id: a.typeId, text: `${a.name} +${a.bonus}`, days: a.days})),
    {id: CUSTOM_ACCELERATOR, text: 'Custom…'},
].map(o => ({
    ...o,
    value: <MenuItem primaryText={o.text} secondaryText={o.days !== undefined ? `${o.days}d` : undefined}/>,
}));
const optionText = id => (ACCELERATOR_OPTIONS.find(o => o.id === id) || ACCELERATOR_OPTIONS[0]).text;
const ATTRIBUTE_ORDER = ['perception', 'memory', 'willpower', 'intelligence', 'charisma'];

const formatDate = date => date.toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'});

// Short name of an implant scenario for column headers, e.g. "Improved +5".
const scenarioShortLabel = implants => (implants === CURRENT_CLONE ? 'Current clone' :
    implants === 0 ? 'No implants' : `${IMPLANT_GRADES.find(g => g.bonus === implants).grade} +${implants}`);

// Compares a queue's training time under different implant sets and cerebral accelerators. The selected row and
// accelerator are reported through onProfileChange, so the plan can show per-skill times for that setup.
export default class ImplantProfilerPanel extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            selectedImplants: CURRENT_CLONE,   // the implant row picked for comparison in the plan
            accelerator: NO_ACCELERATOR,   // NO_ACCELERATOR, CUSTOM_ACCELERATOR or an accelerator's typeId
            acceleratorSearch: 'None',      // text in the search box
            acceleratorBonus: 0,
            acceleratorDays: '7',
        };
    }

    componentDidUpdate(prevProps, prevState) {
        if (prevProps.queue !== this.props.queue) {
            this.results = undefined;
        }

        const changed = ['selectedImplants', 'accelerator', 'acceleratorBonus', 'acceleratorDays']
            .some(key => prevState[key] !== this.state[key]);
        if (changed && this.props.onProfileChange !== undefined) {
            this.props.onProfileChange(this.getProfile());
        }
    }

    // The setup to compare in the plan, or undefined when it's just the current clone with no accelerator.
    getProfile() {
        const {selectedImplants, acceleratorBonus, acceleratorDays} = this.state;
        const days = parseFloat(acceleratorDays);
        const hasAccelerator = acceleratorBonus > 0 && days > 0;

        if (selectedImplants === CURRENT_CLONE && !hasAccelerator) {
            return undefined;
        }

        const label = [
            scenarioShortLabel(selectedImplants),
            hasAccelerator ? `+${acceleratorBonus} accel ${days}d` : undefined,
        ].filter(Boolean).join(' · ');

        return {
            implants: selectedImplants,
            accelerator: hasAccelerator ? {bonus: acceleratorBonus, days} : undefined,
            label,
        };
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

    // Every word typed must appear somewhere in the option, in any order ("boost 10", "festival vii", "+8").
    // While the box still shows the current choice, the whole list is offered.
    filterAccelerators(searchText, key) {
        if (searchText === optionText(this.state.accelerator)) {
            return true;
        }

        const words = searchText.toLowerCase().split(/\s+/).filter(Boolean);
        return words.every(word => key.toLowerCase().includes(word));
    }

    handleAcceleratorPick(chosen, index) {
        // Enter without picking from the list takes the first match
        const option = index !== -1 ? chosen :
            ACCELERATOR_OPTIONS.find(o => this.filterAccelerators(this.state.acceleratorSearch, o.text));

        if (option === undefined) {
            this.setState({acceleratorSearch: optionText(this.state.accelerator)});
            return;
        }

        this.setState({acceleratorSearch: option.text});
        this.handleAccelerator(option.id);
    }

    handleAccelerator(accelerator) {
        if (accelerator === NO_ACCELERATOR) {
            this.setState({accelerator, acceleratorBonus: 0});
        } else if (accelerator === CUSTOM_ACCELERATOR) {
            this.setState({accelerator, acceleratorBonus: this.state.acceleratorBonus || 4});
        } else {
            const item = ACCELERATORS.find(a => a.typeId === accelerator);
            this.setState({accelerator, acceleratorBonus: item.bonus, acceleratorDays: String(item.days)});
        }
    }

    // The character's attribute implants, by name, for the "Current clone" row.
    currentImplantNames() {
        const bonusAttributes = [175, 176, 177, 178, 179];
        return (Character.get(this.props.characterId).implants || [])
            .filter(i => (i.dogmaAttributes || []).some(a => bonusAttributes.includes(a.attribute_id) && a.value > 0))
            .map(i => i.name);
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
                    <AutoComplete
                        id="acceleratorSearch"
                        floatingLabelText="Cerebral accelerator"
                        hintText="Type to search, e.g. boost 10"
                        searchText={this.state.acceleratorSearch}
                        dataSource={ACCELERATOR_OPTIONS}
                        dataSourceConfig={{text: 'text', value: 'value'}}
                        filter={(searchText, key) => this.filterAccelerators(searchText, key)}
                        onUpdateInput={acceleratorSearch => this.setState({acceleratorSearch})}
                        onNewRequest={(chosen, index) => this.handleAcceleratorPick(chosen, index)}
                        // leaving the box with half-typed text shows the current choice again (after any pick lands)
                        onBlur={() => setTimeout(() => this.setState(state => ({acceleratorSearch: optionText(state.accelerator)})), 0)}
                        openOnFocus={true}
                        maxSearchResults={ACCELERATOR_OPTIONS.length}
                        menuProps={{maxHeight: 320, desktop: true}}
                        listStyle={{maxHeight: 320, overflowY: 'auto'}}
                        style={{width: 380}}
                        fullWidth={true}
                    />
                    {this.state.accelerator === CUSTOM_ACCELERATOR &&
                        <SelectField
                            floatingLabelText="Bonus"
                            value={this.state.acceleratorBonus}
                            onChange={(e, i, acceleratorBonus) => this.setState({acceleratorBonus})}
                            style={{width: 120}}
                        >
                            {CUSTOM_BONUSES.map(b => <MenuItem key={b} value={b} primaryText={`+${b}`}/>)}
                        </SelectField>
                    }
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
                                    <tr
                                        key={r.label}
                                        className={`profiler-row ${r === current ? 'profiler-current' : ''} ${r.implants === this.state.selectedImplants ? 'profiler-selected' : ''}`}
                                        onClick={() => this.setState({selectedImplants: r.implants})}
                                        title="Compare this setup in the plan"
                                    >
                                        <td>
                                            <i className="material-icons profiler-radio">
                                                {r.implants === this.state.selectedImplants ? 'radio_button_checked' : 'radio_button_unchecked'}
                                            </i>
                                            {r.label}
                                            {(r === current ? this.currentImplantNames().join(' · ') : r.detail) &&
                                                <div className="profiler-implants">
                                                    {r === current ? this.currentImplantNames().join(' · ') : r.detail}
                                                </div>
                                            }
                                        </td>
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
                    Pick a row and/or an accelerator to compare it skill by skill in the plan below. Base attributes are
                    EVE's values minus your current implants (shown as +N). Times assume training starts now. EVE doesn't report boosters, so PodStack can't tell whether an accelerator is active;
                    use the setting above to see its effect.
                </p>
            </Panel>
        );
    }
}
