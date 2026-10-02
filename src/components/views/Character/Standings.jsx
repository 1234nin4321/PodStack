'use strict';

import React from 'react';

import CharacterModel from '../../../models/Character';
import FormatHelper from '../../../helpers/FormatHelper';
import ImageHelper from '../../../helpers/ImageHelper';
import Panel from '../../ui/Panel';
import ScopeNotice from '../../ui/ScopeNotice';
import StatTile from '../../ui/StatTile';

const CONNECTIONS = 3359;
const DIPLOMACY = 3357;

const GROUPS = [
    {type: 'faction', title: 'Factions', icon: 'flag'},
    {type: 'npc_corp', title: 'Corporations', icon: 'business'},
    {type: 'agent', title: 'Agents', icon: 'support_agent'},
];

export function Standing({value}) {
    const cls = value >= 5 ? 'excellent' : value > 0 ? 'good' : value <= -5 ? 'terrible' : value < 0 ? 'bad' : 'neutral';
    return <span className={`num standing ${cls}`}>{value > 0 ? '+' : ''}{FormatHelper.number(value, 2)}</span>;
}

function skillLevel(char, id) {
    const skill = (char.skills || []).find(s => s.skill_id === id);
    return skill !== undefined ? skill.active_skill_level : 0;
}

// What EVE uses with NPCs: Connections raises a positive standing, Diplomacy a negative one, each by 4% per level
// of the distance to 10.
function effective(standing, connections, diplomacy) {
    const level = standing >= 0 ? connections : diplomacy;
    return standing + (10 - standing) * 0.04 * level;
}

function portrait(s) {
    if (s.from_type === 'agent') {
        return ImageHelper.characterPortrait(s.from_id, 32);
    }
    return ImageHelper.corporationLogo(s.from_id, 32);
}

function FactionalWarfare({stats}) {
    if (stats === undefined || stats.faction_id === undefined) {
        return null;
    }
    const kills = stats.kills || {};
    const vp = stats.victory_points || {};

    return (
        <Panel title="Factional Warfare" icon="military_tech"
               subtitle={`${stats.faction || 'Enlisted'}${stats.enlisted_on ? ` · since ${new Date(stats.enlisted_on).toLocaleDateString(navigator.language)}` : ''}`}>
            <div className="stats" style={{marginBottom: 0}}>
                <StatTile label="Rank" icon="star" value={stats.current_rank !== undefined ? stats.current_rank : '—'}
                          foot={stats.highest_rank !== undefined ? `Highest ${stats.highest_rank}` : undefined}/>
                <StatTile label="Kills" icon="gps_fixed" value={FormatHelper.number(kills.total)}
                          foot={`${FormatHelper.number(kills.last_week)} last week · ${FormatHelper.number(kills.yesterday)} yesterday`}/>
                <StatTile label="Victory Points" icon="emoji_events" value={FormatHelper.compact(vp.total || 0)}
                          foot={`${FormatHelper.number(vp.last_week)} last week · ${FormatHelper.number(vp.yesterday)} yesterday`}/>
            </div>
        </Panel>
    );
}

// NPC standings toward the character, by faction, corporation and agent, with the standing EVE actually uses after
// Connections and Diplomacy.
export default class Standings extends React.Component {
    render() {
        const char = CharacterModel.get(this.props.characterId);

        if (char.standings === undefined) {
            return (
                <Panel title="Standings" icon="handshake">
                    <ScopeNotice character={char} type="standings" scope="Read Standings" what="standings"/>
                </Panel>
            );
        }

        const connections = skillLevel(char, CONNECTIONS);
        const diplomacy = skillLevel(char, DIPLOMACY);

        return (
            <div className="stack">
                <FactionalWarfare stats={char.fwStats}/>

                {GROUPS.map(group => {
                    const rows = char.standings.filter(s => s.from_type === group.type).sort((a, b) => b.standing - a.standing);
                    return (
                        <Panel key={group.type} title={group.title} icon={group.icon} flush={true} collapsible={true}
                               subtitle={`${rows.length}`}>
                            {rows.length === 0 ?
                                <p className="empty" style={{margin: 0, padding: 16}}>None.</p> :
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>{group.title.replace(/s$/, '')}</th>
                                            <th className="right">Standing</th>
                                            <th className="right" title={`With Connections ${connections} and Diplomacy ${diplomacy}`}>Effective</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map(s =>
                                            <tr key={s.from_id}>
                                                <td>
                                                    <span className="type-cell">
                                                        <img src={portrait(s)} alt=""/>
                                                        <span>{s.name}</span>
                                                    </span>
                                                </td>
                                                <td className="right"><Standing value={s.standing}/></td>
                                                <td className="right"><Standing value={effective(s.standing, connections, diplomacy)}/></td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            }
                        </Panel>
                    );
                })}
            </div>
        );
    }
}
