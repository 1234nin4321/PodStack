'use strict';

import React from 'react';

import MenuItem from 'material-ui/MenuItem';
import SelectField from 'material-ui/SelectField';
import RaisedButton from 'material-ui/RaisedButton';
import FontIcon from 'material-ui/FontIcon';

import Character from '../../models/Character';
import AllSkills from '../../../resources/all_skills';
import DateTimeHelper from '../../helpers/DateTimeHelper';
import FittingHelper from '../../helpers/FittingHelper';
import ImageHelper from '../../helpers/ImageHelper';
import ShipHelper from '../../helpers/ShipHelper';
import SkillPlanStore from '../../helpers/SkillPlanStore';
import PageHeader from '../ui/PageHeader';
import Panel from '../ui/Panel';

const ALL = 'all';
const NEW_PLAN = 'new';
const META_ORDER = ['Tech I', 'Faction', 'Storyline', 'Tech II', 'Tech III'];

function shortTime(ms) {
    // "2d 4h" from niceCountdown's longer form
    return DateTimeHelper.niceCountdown(ms).split(' ').slice(0, 2).join(' ');
}

// Every ship in EVE, and for a character: whether they can fly it, how long until they can, and the skills that takes,
// with a button to add them to a skill plan.
export default class ShipBrowser extends React.Component {
    constructor(props) {
        super(props);

        const characters = ShipBrowser.characters();
        this.state = {
            characterId: characters.length > 0 ? characters[0].id : undefined,
            query: '',
            race: ALL,
            meta: ALL,
            flyableOnly: false,
            open: {},
            selected: undefined,
            target: NEW_PLAN,
            added: undefined,
        };
    }

    static characters() {
        return Object.values(Character.getAll())
            .filter(c => c.hasBasicInfo())
            .sort((a, b) => b.getTotalSp() - a.getTotalSp());
    }

    // per character, worked out once per visit (or after adding to a plan)
    training() {
        if (this.state.characterId === undefined) {
            return {};
        }
        if (this.cache === undefined || this.cache.characterId !== this.state.characterId) {
            this.cache = {characterId: this.state.characterId, needed: ShipHelper.trainingNeeded(this.state.characterId)};
        }
        return this.cache.needed;
    }

    toggle(group) {
        this.setState({open: {...this.state.open, [group]: !this.isOpen(group)}});
    }

    isOpen(group) {
        // searching opens every class with a match; otherwise classes open on click
        return this.state.query.trim() !== '' ? this.state.open[group] !== false : this.state.open[group] === true;
    }

    handleAdd(ship, needed) {
        const {characterId, target} = this.state;
        const isNew = target === NEW_PLAN;
        const name = `Fly ${ship.name}`;
        const queue = [{type: 'note', text: name, details: `${ship.group} · ${ShipHelper.raceName(ship.race_id)}`}, ...needed.queue];

        try {
            const planId = FittingHelper.addToPlan(characterId, isNew ? undefined : target, name, queue);
            const plan = SkillPlanStore.getSkillPlan(characterId, planId);
            this.setState({target: planId, added: `Added ${needed.queue.length} skill level${needed.queue.length === 1 ? '' : 's'} to "${plan ? plan.name : name}".`});
        } catch (err) {
            this.setState({added: `Couldn't add to the plan: ${err.message}`});
        }
    }

    renderCatalogue(character, training) {
        const query = this.state.query.trim().toLowerCase();
        const ships = ShipHelper.all().filter(ship =>
            (this.state.race === ALL || String(ship.race_id) === this.state.race) &&
            (this.state.meta === ALL || ship.meta === this.state.meta) &&
            (!this.state.flyableOnly || (character !== undefined && ShipHelper.canFly(character, ship))) &&
            (query === '' || ship.name.toLowerCase().includes(query) || ship.group.toLowerCase().includes(query)));

        const groups = new Map();
        ships.forEach(ship => {
            if (!groups.has(ship.group)) {
                groups.set(ship.group, []);
            }
            groups.get(ship.group).push(ship);
        });
        const sorted = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));

        return (
            <Panel title="Ships" icon="rocket_launch" flush={true} className="catalogue" subtitle={`${ships.length}`}>
                <div className="ship-filters">
                    <input className="field" type="search" placeholder="Search ships or classes…" value={this.state.query}
                           onChange={e => this.setState({query: e.target.value})}/>
                    <div className="ship-filter-row">
                        <select className="field small" value={this.state.race} onChange={e => this.setState({race: e.target.value})}>
                            <option value={ALL}>All races</option>
                            {Object.entries(ShipHelper.races()).sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) =>
                                <option key={id} value={id}>{name}</option>
                            )}
                        </select>
                        <select className="field small" value={this.state.meta} onChange={e => this.setState({meta: e.target.value})}>
                            <option value={ALL}>All tech levels</option>
                            {META_ORDER.map(meta => <option key={meta} value={meta}>{meta}</option>)}
                        </select>
                    </div>
                    <label className="ship-flyable">
                        <input type="checkbox" checked={this.state.flyableOnly} disabled={character === undefined}
                               onChange={e => this.setState({flyableOnly: e.target.checked})}/>
                        Only ships {character !== undefined ? character.getDisplayName() : 'the pilot'} can fly
                    </label>
                </div>

                {sorted.length === 0 && <p className="empty" style={{margin: 0, padding: 16}}>No ships match.</p>}

                {sorted.map(([group, list]) => {
                    const open = this.isOpen(group);
                    const flyable = character !== undefined ? list.filter(s => ShipHelper.canFly(character, s)).length : 0;
                    return (
                        <div key={group} className="asset-group">
                            <div className="asset-group-head" onClick={() => this.toggle(group)}>
                                <i className={`material-icons chevron ${open ? 'open' : ''}`}>expand_more</i>
                                <span className="asset-group-name">{group}</span>
                                <span className="muted num">{character !== undefined ? `${flyable}/${list.length}` : list.length}</span>
                            </div>
                            {open && list.sort((a, b) => a.name.localeCompare(b.name)).map(ship => {
                                const can = character !== undefined && ShipHelper.canFly(character, ship);
                                const needed = training[ship.type_id];
                                return (
                                    <div key={ship.type_id}
                                         className={`ship-row ${this.state.selected === ship.type_id ? 'selected' : ''}`}
                                         onClick={() => this.setState({selected: ship.type_id, added: undefined})}>
                                        <img src={ImageHelper.typeIcon(ship.type_id, 32)} alt=""/>
                                        <span className="ship-row-name">{ship.name}</span>
                                        {character !== undefined && (can ?
                                            <i className="material-icons ship-can" title="Can fly">check_circle</i> :
                                            <span className="faint num">{needed !== undefined ? shortTime(needed.time) : ''}</span>)}
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </Panel>
        );
    }

    renderDetail(character, training) {
        const ship = this.state.selected !== undefined ? ShipHelper.get(this.state.selected) : undefined;
        if (ship === undefined) {
            return (
                <Panel title="No Ship Selected" icon="rocket_launch">
                    <p className="empty" style={{margin: 0}}>
                        Pick a ship to see the skills it needs, whether the pilot can fly it, and how long until they can.
                    </p>
                </Panel>
            );
        }

        const can = character !== undefined && ShipHelper.canFly(character, ship);
        const needed = training[ship.type_id];
        const plans = character !== undefined ? SkillPlanStore.getSkillPlansForCharacter(character.id) : [];

        return (
            <div className="stack">
                <div className="panel ship-hero">
                    <img src={`https://images.evetech.net/types/${ship.type_id}/render?size=128`} alt="" width={128} height={128}/>
                    <div>
                        <div className="ship-hero-name">{ship.name}</div>
                        <div className="muted">{ship.group} · {ShipHelper.raceName(ship.race_id)} · {ship.meta}</div>
                        {character !== undefined &&
                            <div style={{marginTop: 10}}>
                                {can ?
                                    <span className="badge good">{character.getDisplayName()} can fly it</span> :
                                    <span className="badge warn">{needed !== undefined ? `${DateTimeHelper.niceCountdown(needed.time)} to fly` : 'Can\'t fly yet'}</span>}
                            </div>
                        }
                    </div>
                </div>

                <Panel title="Required Skills" icon="school" flush={true}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Skill</th>
                                <th className="right">Needs</th>
                                {character !== undefined && <th className="right">Has</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {ship.skills.map(req => {
                                const has = character !== undefined ? ShipHelper.trainedLevel(character, req.id) : undefined;
                                return (
                                    <tr key={req.id}>
                                        <td>{(AllSkills.skills[req.id] || {}).name || `Skill #${req.id}`}</td>
                                        <td className="right num">{ShipHelper.levelName(req.level)}</td>
                                        {character !== undefined &&
                                            <td className="right num" style={{color: has >= req.level ? 'var(--good)' : 'var(--warn)'}}>
                                                {has > 0 ? ShipHelper.levelName(has) : '—'}
                                            </td>}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </Panel>

                {character !== undefined && !can && needed !== undefined && needed.queue.length > 0 &&
                    <Panel title="To Train" icon="playlist_add" flush={true}
                           subtitle={`${needed.queue.length} level${needed.queue.length === 1 ? '' : 's'} · ${DateTimeHelper.niceCountdown(needed.time)}`}>
                        {needed.queue.map((item, i) =>
                            <div key={i} className="list-row">
                                <span>{item.name} <strong>{ShipHelper.levelName(item.level)}</strong></span>
                                <span className="num muted">{DateTimeHelper.niceCountdown(item.time)}</span>
                            </div>
                        )}
                        <div className="ship-add">
                            <SelectField
                                floatingLabelText="Add to plan"
                                value={this.state.target}
                                onChange={(e, i, target) => this.setState({target, added: undefined})}
                                style={{width: 260, marginTop: -14}}
                            >
                                <MenuItem value={NEW_PLAN} primaryText={`New plan "Fly ${ship.name}"`}/>
                                {plans.map(plan => <MenuItem key={plan.id} value={plan.id} primaryText={plan.name}/>)}
                            </SelectField>
                            <RaisedButton
                                label="Add skills"
                                primary={true}
                                onClick={() => this.handleAdd(ship, needed)}
                                icon={<FontIcon className="material-icons">playlist_add</FontIcon>}
                            />
                        </div>
                        {this.state.added && <p className="muted" style={{margin: 0, padding: '0 16px 12px'}}>{this.state.added}</p>}
                    </Panel>
                }
            </div>
        );
    }

    render() {
        const characters = ShipBrowser.characters();
        const character = this.state.characterId !== undefined ? Character.get(this.state.characterId) : undefined;
        const training = this.training();

        return (
            <div>
                <PageHeader eyebrow="Command" title="Ship Browser"/>

                <div className="split">
                    <div className="stack">
                        <Panel title="Pilot" icon="person">
                            <SelectField
                                fullWidth={true}
                                floatingLabelText="Character"
                                value={this.state.characterId}
                                onChange={(e, i, characterId) => this.setState({characterId, target: NEW_PLAN, added: undefined})}
                            >
                                {characters.map(c => <MenuItem key={c.id} value={c.id} primaryText={c.getDisplayName()}/>)}
                            </SelectField>
                        </Panel>
                        {this.renderCatalogue(character, training)}
                    </div>

                    {this.renderDetail(character, training)}
                </div>
            </div>
        );
    }
}
