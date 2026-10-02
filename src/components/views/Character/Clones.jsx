'use strict';

import React from 'react';

import CharacterModel from '../../../models/Character';
import FormatHelper from '../../../helpers/FormatHelper';
import ImageHelper from '../../../helpers/ImageHelper';
import MarketHelper, {THE_FORGE, JITA_44} from '../../../helpers/MarketHelper';
import Panel from '../../ui/Panel';
import StatTile from '../../ui/StatTile';

// dogma attribute holding an implant's slot (1-10)
const IMPLANT_SLOT_ATTRIBUTE = 331;

function implantSlot(implant) {
    const attr = (implant.dogmaAttributes || []).find(a => a.attribute_id === IMPLANT_SLOT_ATTRIBUTE);
    return attr !== undefined ? attr.value : undefined;
}

function sortedImplants(implants) {
    return (implants || []).slice().sort((a, b) => (implantSlot(a) || 99) - (implantSlot(b) || 99));
}

function locationName(location, fallbackId) {
    return location !== undefined && location.name !== undefined ? location.name : `Structure #${fallbackId} (no access)`;
}

function Security({system}) {
    if (system === undefined || system.security_status === undefined) {
        return null;
    }
    const sec = Math.round(system.security_status * 10) / 10;
    return <span className={`num sec ${sec >= 0.5 ? 'high' : sec > 0 ? 'low' : 'null'}`}>{FormatHelper.number(sec, 1)}</span>;
}

// Estimated value of implants at Jita: {value, unpriced (how many have no sell order there)}, or undefined while
// prices load.
function implantsValue(implants, prices) {
    if (prices === undefined) {
        return undefined;
    }
    let value = 0;
    let unpriced = 0;
    for (const implant of implants) {
        if (typeof prices[implant.id] === 'number') {
            value += prices[implant.id];
        } else {
            unpriced++;
        }
    }
    return {value, unpriced};
}

function ValueText({value}) {
    if (value === undefined) {
        return null;
    }
    return (
        <span className="num" title={value.unpriced > 0 ? `${value.unpriced} without a sell order at Jita 4-4, not counted` : undefined}>
            ~{FormatHelper.compact(value.value)} ISK{value.unpriced > 0 ? '*' : ''}
        </span>
    );
}

function ImplantList({implants, prices}) {
    if (implants.length === 0) {
        return <p className="faint" style={{margin: 0, padding: '6px 16px 10px 44px'}}>No implants</p>;
    }

    return (
        <table className="data-table">
            <tbody>
                {sortedImplants(implants).map(implant =>
                    <tr key={implant.id}>
                        <td className="muted num" style={{width: 64, paddingLeft: 44}}>{implantSlot(implant) !== undefined ? `Slot ${implantSlot(implant)}` : ''}</td>
                        <td>
                            <span className="type-cell">
                                <img src={ImageHelper.typeIcon(implant.id, 32)} alt=""/>
                                <span>{implant.name || `Type #${implant.id}`}</span>
                            </span>
                        </td>
                        <td className="right num muted nowrap">
                            {prices === undefined ? '' :
                                typeof prices[implant.id] === 'number' ? `${FormatHelper.compact(prices[implant.id])} ISK` :
                                    <span className="faint" title="No sell order at Jita 4-4">—</span>}
                        </td>
                    </tr>
                )}
            </tbody>
        </table>
    );
}

// The active clone and every jump clone, grouped by the station or structure they're stored in, with the implants'
// estimated value at Jita 4-4's lowest sell prices.
export default class Clones extends React.Component {
    constructor(props) {
        super(props);

        this.state = {closed: {}, prices: undefined};
    }

    componentDidMount() {
        this.loadPrices(false);
    }

    componentWillUnmount() {
        this.unmounted = true;
    }

    implantIds() {
        const char = CharacterModel.get(this.props.characterId);
        const implants = [...(char.implants || []), ...(char.jumpClones || []).flatMap(c => c.implants || [])];
        return [...new Set(implants.map(i => i.id))];
    }

    loadPrices(force) {
        const ids = this.implantIds();
        if (ids.length === 0) {
            this.setState({prices: {}});
            return;
        }
        this.setState({loadingPrices: true});
        MarketHelper.getJitaLowestSell(ids, force)
            .then(prices => !this.unmounted && this.setState({prices, loadingPrices: false}))
            .catch(() => !this.unmounted && this.setState({prices: {}, loadingPrices: false}));
    }

    toggle(id) {
        this.setState({closed: {...this.state.closed, [id]: !this.state.closed[id]}});
    }

    render() {
        const char = CharacterModel.get(this.props.characterId);

        if (char.jumpClones === undefined) {
            return (
                <Panel title="Clones" icon="people_outline">
                    <p className="empty" style={{margin: 0}}>Not loaded yet. It loads on the next refresh.</p>
                </Panel>
            );
        }

        const cloneJump = char.getCloneJumpAvailable();
        const home = char.home_location;

        const groups = new Map();
        for (const clone of char.jumpClones) {
            if (!groups.has(clone.location_id)) {
                groups.set(clone.location_id, {
                    id: clone.location_id,
                    name: locationName(clone.location, clone.location_id),
                    system: clone.location !== undefined ? clone.location.system : undefined,
                    clones: [],
                });
            }
            groups.get(clone.location_id).clones.push(clone);
        }
        const sorted = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));

        const {prices} = this.state;
        const activeValue = implantsValue(char.implants || [], prices);
        const totalValue = implantsValue([...(char.implants || []), ...char.jumpClones.flatMap(c => c.implants)], prices);
        const priceDate = prices !== undefined ? MarketHelper.priceDate(THE_FORGE, this.implantIds(), JITA_44) : undefined;

        const currentLocation = char.location !== undefined && char.location.location !== undefined ?
            char.location.location.name :
            (char.location !== undefined && char.location.system !== undefined ? `In space, ${char.location.system.name}` : undefined);

        return (
            <div className="stack">
                <div className="stats">
                    <StatTile label="Jump Clones" icon="people_outline" value={`${char.jumpClones.length} / ${char.getMaxClones()}`}/>
                    <StatTile label="Next Clone Jump" icon="schedule" value={cloneJump.relative}
                              foot={cloneJump.relative !== 'Now' ? cloneJump.date.toLocaleString(navigator.language) : undefined}/>
                    <StatTile label="Home Station" icon="home"
                              value={<span className="stat-text">{home !== undefined ? locationName(home.location, home.location_id) : '—'}</span>}/>
                    <StatTile label="Implants Value" icon="payments"
                              value={totalValue !== undefined ? FormatHelper.compact(totalValue.value) : '…'} unit="ISK"
                              foot={
                                  <span>
                                      Jita 4-4 sell{priceDate !== undefined && ` · ${priceDate.toLocaleTimeString(navigator.language, {hour: '2-digit', minute: '2-digit'})}`}
                                      {' · '}
                                      <button type="button" className="link-button" disabled={this.state.loadingPrices}
                                              onClick={() => this.loadPrices(true)}>
                                          {this.state.loadingPrices ? 'Updating…' : 'Update'}
                                      </button>
                                  </span>
                              }/>
                </div>

                <Panel title="Active Clone" icon="person" flush={true}
                       subtitle={<span>{currentLocation}{currentLocation !== undefined && activeValue !== undefined && ' · '}<ValueText value={activeValue}/></span>}>
                    <ImplantList implants={char.implants || []} prices={prices}/>
                </Panel>

                <Panel title="Jump Clones" icon="people_outline" flush={true}
                       subtitle={`${sorted.length} ${sorted.length === 1 ? 'location' : 'locations'}`}>
                    {sorted.length === 0 && <p className="empty" style={{margin: 0, padding: 16}}>No jump clones.</p>}

                    {sorted.map(group => {
                        const open = this.state.closed[group.id] !== true;
                        const groupValue = implantsValue(group.clones.flatMap(c => c.implants), prices);

                        return (
                            <div key={group.id} className="asset-group">
                                <div className="asset-group-head" onClick={() => this.toggle(group.id)}>
                                    <i className={`material-icons chevron ${open ? 'open' : ''}`}>expand_more</i>
                                    <Security system={group.system}/>
                                    <span className="asset-group-name">{group.name}</span>
                                    {home !== undefined && home.location_id === group.id && <span className="badge info">Home</span>}
                                    <span className="muted num">
                                        {group.clones.length} {group.clones.length === 1 ? 'clone' : 'clones'}
                                        {groupValue !== undefined && groupValue.value > 0 && <span> · <ValueText value={groupValue}/></span>}
                                    </span>
                                </div>

                                {open && group.clones.map(clone =>
                                    <div key={clone.jump_clone_id} className="clone-entry">
                                        <div className="clone-name">
                                            {clone.name ? clone.name : 'Unnamed Clone'}
                                            <span className="faint"> · {clone.implants.length} {clone.implants.length === 1 ? 'implant' : 'implants'}</span>
                                            {clone.implants.length > 0 && implantsValue(clone.implants, prices) !== undefined &&
                                                <span className="muted"> · <ValueText value={implantsValue(clone.implants, prices)}/></span>}
                                        </div>
                                        <ImplantList implants={clone.implants} prices={prices}/>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </Panel>
            </div>
        );
    }
}
