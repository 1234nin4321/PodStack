'use strict';

import React from 'react';

import CharacterModel from '../../../models/Character';
import ImageHelper from '../../../helpers/ImageHelper';
import NativeHelper from '../../../helpers/NativeHelper';
import Panel from '../../ui/Panel';
import ScopeNotice from '../../ui/ScopeNotice';
import StatTile from '../../ui/StatTile';

// The character's 50 most recent kills and losses, with a link to each on zKillboard.
export default class Kills extends React.Component {
    constructor(props) {
        super(props);

        this.state = {view: 'all'};
    }

    render() {
        const char = CharacterModel.get(this.props.characterId);

        if (char.killmails === undefined) {
            return (
                <Panel title="Kill Log" icon="gps_fixed">
                    <ScopeNotice character={char} type="killmails" scope="Read Killmails" what="killmails"/>
                </Panel>
            );
        }

        const {view} = this.state;
        const kills = char.killmails.filter(k => !k.loss);
        const losses = char.killmails.filter(k => k.loss);
        const list = view === 'kills' ? kills : view === 'losses' ? losses : char.killmails;

        return (
            <div className="stack">
                <div className="stats">
                    <StatTile label="Kills" icon="gps_fixed" value={kills.length}/>
                    <StatTile label="Losses" icon="heart_broken" value={losses.length} warn={losses.length > 0}/>
                    <StatTile label="Last Activity" icon="schedule"
                              value={char.killmails.length > 0 ? new Date(char.killmails[0].time).toLocaleDateString(navigator.language) : '—'}/>
                </div>

                <Panel title="Kill Log" icon="gps_fixed" flush={true} subtitle="Latest 50"
                       actions={
                           <div className="seg">
                               {['all', 'kills', 'losses'].map(v =>
                                   <button key={v} type="button" className={view === v ? 'active' : ''} onClick={() => this.setState({view: v})}>{v}</button>
                               )}
                           </div>
                       }>
                    {list.length === 0 ?
                        <p className="empty" style={{margin: 0, padding: 16}}>No killmails.</p> :
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Ship</th>
                                    <th>Victim</th>
                                    <th>Final blow</th>
                                    <th>System</th>
                                    <th className="right">When</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {list.map(k =>
                                    <tr key={k.killmail_id}>
                                        <td>
                                            <span className="type-cell">
                                                <img src={ImageHelper.typeIcon(k.victim.ship_type_id, 32)} alt=""/>
                                                <span>
                                                    {k.victim.ship}
                                                    <span className={`badge ${k.loss ? 'danger' : 'good'}`} style={{marginLeft: 6}}>{k.loss ? 'Loss' : 'Kill'}</span>
                                                </span>
                                            </span>
                                        </td>
                                        <td>
                                            {k.victim.name}
                                            <div className="faint">{[k.victim.corporation, k.victim.alliance].filter(Boolean).join(' · ')}</div>
                                        </td>
                                        <td>
                                            {k.final_blow.name}
                                            <div className="faint">{k.final_blow.ship ? `${k.final_blow.ship} · ` : ''}{k.attackers} {k.attackers === 1 ? 'attacker' : 'attackers'}</div>
                                        </td>
                                        <td>{k.system}</td>
                                        <td className="right muted nowrap">{new Date(k.time).toLocaleString(navigator.language, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}</td>
                                        <td className="right">
                                            <button type="button" className="link-button" title="Open on zKillboard"
                                                    onClick={() => NativeHelper.openExternal(`https://zkillboard.com/kill/${k.killmail_id}/`)}>
                                                zKill
                                            </button>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    }
                </Panel>
            </div>
        );
    }
}
