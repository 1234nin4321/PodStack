'use strict';

import React from 'react';

import CharacterModel from '../../../models/Character';
import DateTimeHelper from '../../../helpers/DateTimeHelper';
import FormatHelper from '../../../helpers/FormatHelper';
import ImageHelper from '../../../helpers/ImageHelper';

import Panel from '../../ui/Panel';
import AcceleratorPanel from './AcceleratorPanel';
import LoyaltyPointsPanel from './LoyaltyPointsPanel';
import Bar from '../../ui/Bar';

const attributeNames = ['intelligence', 'memory', 'perception', 'willpower', 'charisma'];

// Highest value an attribute can reach with a full remap and +5 implants.
const MAX_ATTRIBUTE = 32;

function describeLocation(location) {
    return location !== undefined ? <span>{location.name} <small>({location.type ? location.type.name : 'Structure'})</small></span> : 'Unknown Structure';
}

const notLoaded = <span className="faint">Not loaded yet</span>;

// a panel whose data hasn't loaded (yet, or its refresh failed)
function NotLoadedPanel({title, icon}) {
    return (
        <Panel title={title} icon={icon}>
            <p className="empty" style={{margin: 0}}>Not loaded yet. It loads on the next refresh.</p>
        </Panel>
    );
}

export default class Summary extends React.Component {
    constructor(props) {
        super(props);
    }

    renderDossier(char) {
        let currentLocation = notLoaded;
        if (char.location !== undefined) {
            if (char.location.hasOwnProperty('location')) {
                currentLocation = describeLocation(char.location.location);
            } else {
                currentLocation = char.location.hasOwnProperty('structure_id') ? 'Unknown Structure' : 'In space';
            }
        }

        return (
            <Panel title="Pilot Dossier" icon="badge">
                <dl className="kv">
                    <dt>Character ID</dt>
                    <dd className="num">{char.id}</dd>
                    <dt>Date of Birth</dt>
                    <dd>{char.birthday !== undefined ? char.getDateOfBirth().toLocaleString(navigator.language) : notLoaded}</dd>
                    <dt>Security Status</dt>
                    <dd className="num" style={{color: char.security_status < 0 ? 'var(--danger)' : 'var(--accent)'}}>
                        {FormatHelper.number(char.security_status, 2)}
                    </dd>
                    <dt>Wallet</dt>
                    <dd className="num">{FormatHelper.number(char.balance, 2)} ISK</dd>
                    <dt>Corporation</dt>
                    <dd>{char.getCorporationName()}</dd>
                    <dt>Alliance</dt>
                    <dd>{char.getAllianceName() !== undefined ? char.getAllianceName() : <span className="faint">None</span>}</dd>
                </dl>

                <div className="divider"/>

                <dl className="kv">
                    <dt>Solar System</dt>
                    <dd>{char.location !== undefined && char.location.system !== undefined ? char.location.system.name : notLoaded}</dd>
                    <dt>Location</dt>
                    <dd>{currentLocation}</dd>
                    <dt>Active Ship</dt>
                    <dd>{char.ship !== undefined && char.ship.type !== undefined ?
                        <span>{char.ship.ship_name} <small>({char.ship.type.name})</small></span> : notLoaded}</dd>
                    <dt>Home Station</dt>
                    <dd>{char.home_location !== undefined ? describeLocation(char.home_location.location) : notLoaded}</dd>
                </dl>
            </Panel>
        );
    }

    renderAttributes(char) {
        if (char.attributes === undefined) {
            return <NotLoadedPanel title="Attributes" icon="tune"/>;
        }
        const nextRemap = char.getNextYearlyRemapDate();

        return (
            <Panel title="Attributes" icon="tune">
                {attributeNames.map(name =>
                    <div key={name} className="attr-row">
                        <span className="label">{name}</span>
                        <Bar value={char.attributes[name] / MAX_ATTRIBUTE}/>
                        <span className="value num">{char.attributes[name]}</span>
                    </div>
                )}

                <div className="divider"/>

                <dl className="kv">
                    <dt>Unallocated SP</dt>
                    <dd className="num">{char.unallocated_sp !== undefined ? FormatHelper.number(char.unallocated_sp) : '0'}</dd>
                    <dt>Bonus Remaps</dt>
                    <dd className="num">{char.attributes.bonus_remaps}</dd>
                    <dt>Next Yearly Remap</dt>
                    <dd>{nextRemap !== true ? nextRemap.toLocaleString(navigator.language) : <span className="badge good">Available</span>}</dd>
                </dl>
            </Panel>
        );
    }

    renderJumpClones(char) {
        if (char.jumpClones === undefined) {
            return <NotLoadedPanel title="Jump Clones" icon="people_outline"/>;
        }
        const cloneJumpAvailable = char.getCloneJumpAvailable();

        return (
            <Panel
                title="Jump Clones"
                icon="people_outline"
                subtitle={`${char.jumpClones.length} / ${char.getMaxClones()}`}
                flush={true}
            >
                <div className="list-row">
                    <span className="muted">Clone jump available</span>
                    {cloneJumpAvailable.relative === 'Now' ?
                        <span className="badge good">Now</span> :
                        <span className="num" title={cloneJumpAvailable.date.toLocaleString(navigator.language)}>
                            {cloneJumpAvailable.relative}
                        </span>
                    }
                </div>

                {char.jumpClones.length > 0 ?
                    char.jumpClones.map(jumpClone =>
                        <div key={jumpClone.jump_clone_id} className="list-row" style={{display: 'block'}}>
                            <div>
                                <strong>{jumpClone.name ? jumpClone.name : 'Unnamed Clone'}</strong>
                                <span className="muted"> — {describeLocation(jumpClone.location)}</span>
                            </div>
                            {jumpClone.implants.length > 0 ?
                                <div style={{display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6}}>
                                    {jumpClone.implants.map(implant =>
                                        <img
                                            key={implant.id}
                                            src={ImageHelper.typeIcon(implant.id)}
                                            title={implant.name}
                                            width={28}
                                            height={28}
                                            alt={implant.name}
                                        />
                                    )}
                                </div> :
                                <div className="faint" style={{fontSize: 12}}>No implants</div>
                            }
                        </div>
                    ) :
                    <div className="list-row empty">No jump clones</div>
                }
            </Panel>
        );
    }

    renderSkillQueue(char) {
        const currentSkill = char.getCurrentSkill();
        const pending = char.skillQueue.filter(skill => new Date(skill.finish_date) >= new Date());

        return (
            <Panel
                title="Skill Queue"
                icon="schedule"
                subtitle={currentSkill !== undefined ?
                    <span className="num">{DateTimeHelper.timeUntil(new Date(char.getLastSkill().finish_date))}</span> :
                    <span className="badge warn">Not Training</span>
                }
                flush={true}
            >
                {pending.length > 0 ?
                    pending.map(skill => {
                        const isCurrent = currentSkill !== undefined && skill.queue_position === currentSkill.queue_position;

                        return (
                            <div key={skill.queue_position} className={`queue-item ${isCurrent ? 'current' : ''}`}>
                                <div className="queue-line">
                                    <span>{skill.skill_name} <strong>{skill.finished_level}</strong></span>
                                    <span className="num muted">
                                        {isCurrent ?
                                            DateTimeHelper.timeUntil(new Date(skill.finish_date)) :
                                            DateTimeHelper.skillLength(skill.start_date, skill.finish_date)
                                        }
                                    </span>
                                </div>
                                {isCurrent && <Bar value={FormatHelper.trainingProgress(skill)}/>}
                            </div>
                        );
                    }) :
                    <div className="list-row empty">No skills in queue</div>
                }
            </Panel>
        );
    }

    renderFatigue(fatigue) {
        return (
            <Panel title="Jump Fatigue" icon="flash_on" flush={true}>
                <table className="data-table">
                    <tbody>
                        <tr>
                            <td className="muted">Last Jump</td>
                            <td className="num">{fatigue.last_jump.relative}</td>
                            <td className="num faint right">{fatigue.last_jump.date.toLocaleString(navigator.language)}</td>
                        </tr>
                        <tr>
                            <td className="muted">Red Timer</td>
                            <td className="num timer-red">{fatigue.red_timer_expiry.relative}</td>
                            <td className="num faint right">
                                {fatigue.red_timer_expiry.relative !== 'None' ?
                                    fatigue.red_timer_expiry.date.toLocaleString(navigator.language) :
                                    ''
                                }
                            </td>
                        </tr>
                        <tr>
                            <td className="muted">Blue Timer</td>
                            <td className="num timer-blue">{fatigue.blue_timer_expiry.relative}</td>
                            <td className="num faint right">
                                {fatigue.blue_timer_expiry.relative !== 'None' ?
                                    fatigue.blue_timer_expiry.date.toLocaleString(navigator.language) :
                                    ''
                                }
                            </td>
                        </tr>
                    </tbody>
                </table>
            </Panel>
        );
    }

    renderImplants(char) {
        if (char.implants === undefined) {
            return <NotLoadedPanel title="Active Implants" icon="memory"/>;
        }
        return (
            <Panel title="Active Implants" icon="memory" subtitle={`${char.implants.length} / 10`} flush={true}>
                {char.implants.length > 0 ?
                    char.implants.map(implant =>
                        <div key={implant.id} className="list-row" style={{justifyContent: 'flex-start'}}>
                            <img width={28} height={28} src={ImageHelper.typeIcon(implant.id)} alt=""/>
                            <span>{implant.name}</span>
                        </div>
                    ) :
                    <div className="list-row empty">No active implants</div>
                }
            </Panel>
        );
    }

    render() {
        const char = CharacterModel.get(this.props.characterId);
        const fatigue = char.getFatigueInfo();

        return (
            <div className="grid-2">
                <div className="stack">
                    {this.renderDossier(char)}
                    {this.renderAttributes(char)}
                    {this.renderJumpClones(char)}
                </div>

                <div className="stack">
                    {this.renderSkillQueue(char)}
                    {fatigue !== undefined && this.renderFatigue(fatigue)}
                    {this.renderImplants(char)}
                    <AcceleratorPanel character={char}/>
                    {char.loyalty_points !== undefined && <LoyaltyPointsPanel character={char}/>}
                </div>
            </div>
        );
    }
}
