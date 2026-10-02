'use strict';

import React from 'react';
import fs from 'fs';
import log from 'electron-log';

import FontIcon from 'material-ui/FontIcon';
import IconButton from 'material-ui/IconButton';
import MenuItem from 'material-ui/MenuItem';
import RaisedButton from 'material-ui/RaisedButton';
import SelectField from 'material-ui/SelectField';
import TextField from 'material-ui/TextField';

import Panel from '../../ui/Panel';
import TrainingQueueTable from '../../tables/TrainingQueueTable';

import DateTimeHelper from '../../../helpers/DateTimeHelper';
import DialogHelper from '../../../helpers/DialogHelper';
import NativeHelper from '../../../helpers/NativeHelper';
import FittingHelper from '../../../helpers/FittingHelper';

const NEW_PLAN = '__new__';
const LEVELS = ['0', 'I', 'II', 'III', 'IV', 'V'];

// Checks a ship fit against the character and generates the plan to fly it, which can be added to one of their plans.
export default class FitPlanner extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            fitText: '',
            checking: false,
            error: undefined,

            fits: [],                  // parsed fits; XML exports can hold several
            fitIndex: 0,
            requirements: undefined,   // looked-up items for the chosen fit
            analysis: undefined,       // cross-reference and generated plan

            target: props.currentPlanId !== undefined ? props.currentPlanId : NEW_PLAN,
            newPlanName: '',
            added: undefined,
        };

        this.handleCheck = this.handleCheck.bind(this);
        this.handlePaste = this.handlePaste.bind(this);
        this.handleOpenFile = this.handleOpenFile.bind(this);
        this.handleAddToPlan = this.handleAddToPlan.bind(this);
    }

    componentWillReceiveProps(nextProps) {
        // follow the plan open in the editor; fall back to "new plan" if the chosen one was deleted
        if (nextProps.currentPlanId !== this.props.currentPlanId && nextProps.currentPlanId !== undefined) {
            this.setState({target: nextProps.currentPlanId});
        } else if (this.state.target !== NEW_PLAN && !nextProps.plans.some(p => p.id === this.state.target)) {
            this.setState({target: NEW_PLAN});
        }
    }

    async handlePaste() {
        const fitText = await NativeHelper.readClipboard();
        this.setState({fitText}, this.handleCheck);
    }

    async handleOpenFile() {
        const files = await DialogHelper.showOpenDialog({
            properties: ['openFile'],
            filters: [
                {name: 'Ship fittings', extensions: ['xml', 'txt', 'eft', 'cfg']},
                {name: 'All Files', extensions: ['*']},
            ],
        });

        if (files !== undefined && files.length > 0) {
            try {
                this.setState({fitText: fs.readFileSync(files[0], 'utf8')}, this.handleCheck);
            } catch (err) {
                log.error('[Fitting] Failed to read fit file', err);
                this.setState({error: 'Couldn\'t read that file.'});
            }
        }
    }

    handleCheck() {
        let fits;
        try {
            fits = FittingHelper.parseFits(this.state.fitText);
        } catch (err) {
            this.setState({error: err.message, fits: [], requirements: undefined, analysis: undefined});
            return;
        }

        this.setState({fits, fitIndex: 0}, () => this.lookUpFit(0));
    }

    async lookUpFit(fitIndex) {
        this.setState({fitIndex, checking: true, error: undefined, added: undefined});

        try {
            const requirements = await FittingHelper.getRequirements(this.state.fits[fitIndex]);
            const analysis = FittingHelper.analyse(this.props.characterId, requirements);
            this.setState({requirements, analysis, checking: false, newPlanName: requirements.fitName});
        } catch (err) {
            this.setState({checking: false, requirements: undefined, analysis: undefined, error: err.message});
        }
    }

    handleAddToPlan() {
        const {target, newPlanName, analysis} = this.state;
        const isNew = target === NEW_PLAN;
        const name = newPlanName.trim();

        if (isNew && name === '') {
            return;
        }

        try {
            const planId = FittingHelper.addToPlan(this.props.characterId, isNew ? undefined : target, name, analysis.queue);
            const plan = this.props.onAdded(planId);
            this.setState({target: planId, added: `Added to "${plan ? plan.name : name}".`});
        } catch (err) {
            log.error('[Fitting] Failed to add fit to plan', err);
            this.setState({added: undefined, error: err.message});
        }
    }

    renderSummary() {
        const {requirements, analysis, fits, fitIndex} = this.state;
        const hull = analysis.items[0];
        const usable = analysis.items.filter(i => i.usable).length;
        const hullMilestone = analysis.milestones.find(m => m.items.includes(hull.name));

        return (
            <div className="fit-summary">
                <div>
                    <div className="fit-ship">{requirements.ship.name}</div>
                    <div className="muted">
                        {requirements.fitName} · {fits[fitIndex].format} · {usable} of {analysis.items.length} items usable now
                    </div>
                </div>
                <div className="fit-badges">
                    {hull.usable ?
                        <span className="badge good">Can fly hull</span> :
                        <span className="badge warn">Hull in {DateTimeHelper.niceCountdown(hullMilestone.time)}</span>
                    }
                    {analysis.queue.length === 0 ?
                        <span className="badge good">Ready to fly</span> :
                        <span className="badge warn">Full fit in {DateTimeHelper.niceCountdown(analysis.time)}</span>
                    }
                </div>
            </div>
        );
    }

    renderItems() {
        const {analysis} = this.state;

        return (
            <table className="data-table fit-items">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Type</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {analysis.items.map((item, i) =>
                        <tr key={i}>
                            <td>
                                {item.name}
                                {item.quantity > 1 && <span className="muted"> ×{item.quantity}</span>}
                            </td>
                            <td className="muted">{item.category}</td>
                            <td>
                                {item.usable ?
                                    <span style={{color: 'var(--good)'}}>
                                        <i className="material-icons fit-check">check</i> Ready
                                    </span> :
                                    item.missing.map(s =>
                                        <div key={s.id} style={{color: 'var(--warn)'}}>
                                            {s.name} {LEVELS[s.level]}
                                            <span className="muted"> (have {LEVELS[s.trained]})</span>
                                        </div>
                                    )
                                }
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        );
    }

    renderPlan() {
        const {analysis} = this.state;

        if (analysis.queue.length === 0) {
            return null;
        }

        return (
            <div className="fit-plan">
                <h3 className="fit-heading">Generated plan</h3>
                <p className="muted fit-plan-intro">
                    Hull first, then the rest of the fit in the order it unlocks fastest. Within each step the quickest
                    skills come first, with prerequisites always ahead of the skills that need them.
                </p>

                <ol className="fit-milestones">
                    {analysis.milestones.map((m, i) =>
                        <li key={i}>
                            <span className="fit-milestone-label" title={m.items.join(', ')}>{m.label}</span>
                            <span className="num muted">{DateTimeHelper.niceCountdown(m.time)}</span>
                        </li>
                    )}
                </ol>

                <Panel title="Skills" icon="format_list_numbered" flush={true} collapsible={true} initiallyOpen={false}
                       subtitle={`${analysis.queue.filter(q => q.type === 'skill').length} levels`}>
                    <TrainingQueueTable queue={analysis.queue} time={analysis.time} showPlan={false}/>
                </Panel>

                {this.renderAddToPlan()}
            </div>
        );
    }

    renderAddToPlan() {
        const isNew = this.state.target === NEW_PLAN;

        return (
            <div className="fit-actions">
                <SelectField
                    floatingLabelText="Add to"
                    value={this.state.target}
                    onChange={(e, i, target) => this.setState({target, added: undefined})}
                    style={{width: 260}}
                >
                    <MenuItem value={NEW_PLAN} primaryText="New plan…"/>
                    {this.props.plans.map(plan => <MenuItem key={plan.id} value={plan.id} primaryText={plan.name}/>)}
                </SelectField>

                {isNew &&
                    <TextField
                        id="newPlanName"
                        floatingLabelText="Plan name"
                        value={this.state.newPlanName}
                        onChange={(e, newPlanName) => this.setState({newPlanName})}
                        style={{width: 260}}
                    />
                }

                <RaisedButton
                    label={isNew ? 'Create plan' : 'Add to plan'}
                    primary={true}
                    disabled={isNew && this.state.newPlanName.trim() === ''}
                    onClick={this.handleAddToPlan}
                    icon={<FontIcon className="material-icons">playlist_add</FontIcon>}
                />

                {this.state.added && <span style={{color: 'var(--good)'}}>{this.state.added}</span>}
            </div>
        );
    }

    render() {
        const {checking, error, analysis, fits, fitIndex} = this.state;

        return (
            <Panel
                title="Ship Fitting"
                icon="rocket_launch"
                className="fit-planner"
                subtitle="EFT, Pyfa, EVE XML or DNA"
                actions={
                    <IconButton tooltip="Close" onClick={this.props.onClose} style={{width: 32, height: 32, padding: 4}}>
                        <FontIcon className="material-icons" color="var(--text-dim)">close</FontIcon>
                    </IconButton>
                }
            >
                <textarea
                    className="fit-input"
                    value={this.state.fitText}
                    onChange={e => this.setState({fitText: e.target.value})}
                    placeholder={'[Rifter, My Rifter]\nDamage Control I\n200mm AutoCannon I, EMP S\n…\n\nor EVE fitting XML, or a DNA string like 587:2048;1::'}
                    spellCheck={false}
                    rows={8}
                />

                <div className="fit-buttons">
                    <RaisedButton
                        label={checking ? 'Checking…' : 'Check fit'}
                        primary={true}
                        disabled={checking || this.state.fitText.trim() === ''}
                        onClick={this.handleCheck}
                        icon={<FontIcon className="material-icons">fact_check</FontIcon>}
                    />
                    <RaisedButton
                        label="Paste from clipboard"
                        disabled={checking}
                        onClick={this.handlePaste}
                        icon={<FontIcon className="material-icons">content_paste</FontIcon>}
                    />
                    <RaisedButton
                        label="Open file…"
                        disabled={checking}
                        onClick={this.handleOpenFile}
                        icon={<FontIcon className="material-icons">folder_open</FontIcon>}
                    />

                    {fits.length > 1 &&
                        <SelectField
                            floatingLabelText={`Fit (${fits.length} in file)`}
                            value={fitIndex}
                            disabled={checking}
                            onChange={(e, i, value) => this.lookUpFit(value)}
                            style={{width: 280, marginTop: -28}}
                        >
                            {fits.map((fit, i) =>
                                <MenuItem key={i} value={i} primaryText={`${fit.fitName} (${fit.ship.name})`}/>
                            )}
                        </SelectField>
                    }
                </div>

                {error && <p className="fit-error">{error}</p>}

                {analysis && !checking &&
                    <div className="fit-result">
                        {this.renderSummary()}

                        {this.state.requirements.unknown.length > 0 &&
                            <p className="fit-warning">
                                Not recognised, skipped: {this.state.requirements.unknown.join(', ')}
                            </p>
                        }

                        {this.renderItems()}
                        {this.renderPlan()}
                    </div>
                }
            </Panel>
        );
    }
}
