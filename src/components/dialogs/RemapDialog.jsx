'use strict';

import React from 'react';
import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import Slider from 'material-ui/Slider';

import DateTimeHelper from '../../helpers/DateTimeHelper';
import RemapHelper, {ATTRIBUTES, MIN_ATTRIBUTE, MAX_ATTRIBUTE, REMAP_POINTS} from '../../helpers/RemapHelper';

const TOTAL = 5 * MIN_ATTRIBUTE + REMAP_POINTS;
const label = a => a.charAt(0).toUpperCase() + a.slice(1);
const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

/**
 * Remap editor. Compares the character's current attributes with the fastest remap for the skills this remap
 * affects, says what to change, and lets the split be adjusted before saving.
 *
 * Props: open, editIndex (undefined for a new remap), attributes/implants (the remap being edited), skills (queue
 * items the remap affects), currentAttributes (character's base attributes), currentImplants, isOmega,
 * remapInfo {bonusRemaps, nextYearly: Date|true}, onAddRemap(attributes, implants, editIndex, second) /
 * onAddRemap(undefined). second is {attributes, afterSkill: {id, level}} when the user accepts a suggested second
 * remap for skills that take over a year.
 */
export default class RemapDialog extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            attributes: {perception: 17, memory: 17, willpower: 17, intelligence: 17, charisma: 17},
            implants: 0,
        };
    }

    componentWillReceiveProps(nextProps) {
        if (nextProps.open && !this.props.open) {
            const implants = nextProps.editIndex !== undefined && nextProps.implants !== undefined ?
                nextProps.implants : (nextProps.currentImplants || 0);

            // editing keeps the saved split; a new remap starts on the optimum
            const attributes = nextProps.editIndex !== undefined && nextProps.attributes !== undefined ?
                {...nextProps.attributes} :
                RemapHelper.optimise(nextProps.skills || [], implants, nextProps.isOmega, nextProps.currentAttributes).attributes;

            this.setState({attributes, implants});
        }
    }

    // the second-remap search tries every split, so it's only redone when its inputs change
    secondRemap(skills, implants, isOmega, currentAttributes) {
        const key = this.secondRemapKey;
        if (key === undefined || key.skills !== skills || key.implants !== implants || key.isOmega !== isOmega) {
            this.secondRemapKey = {skills, implants, isOmega};
            this.secondRemapResult = RemapHelper.optimiseSecondRemap(skills, implants, isOmega, currentAttributes);
        }
        return this.secondRemapResult;
    }

    renderSecondRemap(skills, implants) {
        const {isOmega, currentAttributes, editIndex} = this.props;
        const plan = this.secondRemap(skills, implants, isOmega, currentAttributes);
        if (plan === undefined) {
            return null;
        }

        const after = skills[plan.splitAfter];
        const split = a => `P${a.perception} M${a.memory} W${a.willpower} I${a.intelligence} C${a.charisma}`;
        const second = {attributes: plan.second.attributes, afterSkill: {id: after.id, level: after.level}};

        return (
            <div className="remap-second">
                <div className="remap-second-head">
                    <i className="material-icons">event_repeat</i>
                    <strong>This takes over a year: remap a second time</strong>
                </div>
                <p style={{margin: '6px 0'}}>
                    Your yearly remap is available again after a year. Remap now to <b className="num">{split(plan.first.attributes)}</b>,
                    then after <b>{after.title || `${after.name} ${after.level}`}</b> (about {DateTimeHelper.niceCountdown(plan.firstDuration).split(' ').slice(0, 2).join(' ')} in)
                    remap to <b className="num">{split(plan.second.attributes)}</b>.
                </p>
                <div className="remap-second-foot">
                    <span>
                        Total <b className="num">{DateTimeHelper.niceCountdown(plan.time)}</b>
                        <span style={{color: 'var(--good)'}}> · saves {DateTimeHelper.niceCountdown(plan.saving)}</span> over one remap
                    </span>
                    <FlatButton label="Use both remaps" primary={true}
                                onClick={() => this.props.onAddRemap(plan.first.attributes, implants, editIndex, second)}/>
                </div>
            </div>
        );
    }

    handleSlider(attribute, value) {
        const attributes = {...this.state.attributes};
        const others = ATTRIBUTES.filter(a => a !== attribute).reduce((sum, a) => sum + attributes[a], 0);

        // can't spend more points than are left
        attributes[attribute] = Math.min(value, TOTAL - others);
        this.setState({attributes});
    }

    renderAvailability() {
        const info = this.props.remapInfo;
        if (info === undefined) {
            return null;
        }

        const yearly = info.nextYearly === true ? 'yearly remap available' :
            `next yearly remap in ${DateTimeHelper.timeUntil(info.nextYearly)}`;
        const ready = info.nextYearly === true || info.bonusRemaps > 0;

        return (
            <p className="remap-availability" style={{color: ready ? 'var(--good)' : 'var(--warn)'}}>
                {info.bonusRemaps} bonus remap{info.bonusRemaps === 1 ? '' : 's'} · {yearly}
            </p>
        );
    }

    render() {
        const {skills = [], currentAttributes, isOmega, editIndex} = this.props;
        const {attributes, implants} = this.state;

        const optimal = RemapHelper.optimise(skills, implants, isOmega, currentAttributes);
        const currentTime = currentAttributes ? RemapHelper.trainingTime(skills, currentAttributes, implants, isOmega) : undefined;
        const chosenTime = RemapHelper.trainingTime(skills, attributes, implants, isOmega);
        const spent = ATTRIBUTES.reduce((sum, a) => sum + attributes[a], 0);
        const unspent = TOTAL - spent;

        const changes = currentAttributes ? ATTRIBUTES
            .map(a => ({a, delta: optimal.attributes[a] - currentAttributes[a]}))
            .filter(c => c.delta !== 0) : [];
        const saving = currentTime !== undefined ? currentTime - optimal.time : 0;

        return (
            <Dialog
                title={editIndex !== undefined ? 'Edit Remap' : 'Remap'}
                modal={false}
                open={this.props.open}
                onRequestClose={() => this.props.onAddRemap(undefined)}
                contentStyle={{width: 720, maxWidth: '95%'}}
                autoScrollBodyContent={true}
                actions={[
                    <FlatButton key="optimal" label="Use optimal"
                                onClick={() => this.setState({attributes: {...optimal.attributes}})}/>,
                    currentAttributes &&
                        <FlatButton key="current" label="Use current"
                                    onClick={() => this.setState({attributes: {...currentAttributes}})}/>,
                    <FlatButton key="cancel" label="Cancel" onClick={() => this.props.onAddRemap(undefined)}/>,
                    <FlatButton key="save" label={editIndex !== undefined ? 'Save' : 'Add remap'} primary={true}
                                disabled={unspent !== 0}
                                onClick={() => this.props.onAddRemap(attributes, implants, editIndex)}/>,
                ]}
            >
                {this.renderAvailability()}

                {skills.length === 0 ?
                    <p className="empty">
                        There are no skills {editIndex !== undefined ? 'after this remap' : 'in this plan'} to optimise for.
                    </p> :
                    <div className="remap-advice">
                        {changes.length === 0 ?
                            <span style={{color: 'var(--good)'}}>Your current attributes are already optimal for this plan.</span> :
                            <span>
                                <strong>To train fastest:</strong>{' '}
                                {changes.map(c => `${signed(c.delta)} ${label(c.a)}`).join(', ')}
                                {saving > 60000 && <span style={{color: 'var(--good)'}}> · saves {DateTimeHelper.niceCountdown(saving)}</span>}
                            </span>
                        }
                        <div className="muted remap-scope">
                            Optimised for the {skills.length} skill level{skills.length === 1 ? '' : 's'}{' '}
                            {editIndex !== undefined ? 'between this remap and the next one' : 'in this plan up to its first remap'}.
                        </div>
                    </div>
                }

                <table className="data-table remap-table">
                    <thead>
                        <tr>
                            <th>Attribute</th>
                            {currentAttributes && <th className="right">Current</th>}
                            <th className="right">Optimal</th>
                            {currentAttributes && <th className="right">Change</th>}
                            <th>Remap to</th>
                            <th className="right"/>
                        </tr>
                    </thead>
                    <tbody>
                        {ATTRIBUTES.map(a => {
                            const delta = currentAttributes ? optimal.attributes[a] - currentAttributes[a] : 0;
                            return (
                                <tr key={a}>
                                    <td>{label(a)}</td>
                                    {currentAttributes && <td className="right num">{currentAttributes[a]}</td>}
                                    <td className="right num" style={{color: 'var(--accent)'}}>{optimal.attributes[a]}</td>
                                    {currentAttributes &&
                                        <td className="right num"
                                            style={{color: delta > 0 ? 'var(--good)' : delta < 0 ? 'var(--warn)' : 'var(--text-faint)'}}>
                                            {signed(delta)}
                                        </td>
                                    }
                                    <td className="remap-slider">
                                        <Slider
                                            axis="x" step={1} min={MIN_ATTRIBUTE} max={MAX_ATTRIBUTE}
                                            sliderStyle={{margin: 0}}
                                            value={attributes[a]}
                                            onChange={(e, value) => this.handleSlider(a, value)}
                                        />
                                    </td>
                                    <td className="right num remap-value">{attributes[a]}</td>
                                </tr>
                            );
                        })}
                        <tr>
                            <td>Implants</td>
                            {currentAttributes && <td/>}
                            <td/>
                            {currentAttributes && <td/>}
                            <td className="remap-slider">
                                <Slider axis="x" step={1} min={0} max={5} sliderStyle={{margin: 0}}
                                        value={implants} onChange={(e, value) => this.setState({implants: value})}/>
                            </td>
                            <td className="right num remap-value">+{implants}</td>
                        </tr>
                    </tbody>
                </table>

                {unspent !== 0 &&
                    <p className="fit-warning" style={{marginTop: 10}}>
                        {unspent > 0 ? `${unspent} point${unspent === 1 ? '' : 's'} left to assign.` : `${-unspent} points too many.`}
                    </p>
                }

                {skills.length > 0 && this.renderSecondRemap(skills, implants)}

                {skills.length > 0 &&
                    <div className="analysis-totals remap-times">
                        {currentTime !== undefined &&
                            <div>
                                <div className="analysis-total-label">Current attributes</div>
                                <div className="analysis-total num muted">{DateTimeHelper.niceCountdown(currentTime)}</div>
                            </div>
                        }
                        <div>
                            <div className="analysis-total-label">Optimal</div>
                            <div className="analysis-total num" style={{color: 'var(--accent)'}}>{DateTimeHelper.niceCountdown(optimal.time)}</div>
                        </div>
                        <div>
                            <div className="analysis-total-label">This remap</div>
                            <div className="analysis-total num">{DateTimeHelper.niceCountdown(chosenTime)}</div>
                        </div>
                    </div>
                }

                {this.props.mixedImplants &&
                    <p className="muted analysis-note">
                        Your current implants aren't the same for every attribute; times here assume +{implants} on all five.
                    </p>
                }
            </Dialog>
        );
    }
}
