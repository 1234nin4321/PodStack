'use strict';

import React from 'react';

import CharacterModel from '../../../models/Character';
import FormatHelper from '../../../helpers/FormatHelper';
import ImageHelper from '../../../helpers/ImageHelper';
import Panel from '../../ui/Panel';
import ScopeNotice from '../../ui/ScopeNotice';

const DAY = 24 * 3600 * 1000;

// Research points build up with an agent from when the research started (remainder_points is what was there then).
function currentPoints(agent) {
    const days = (Date.now() - new Date(agent.started_at).getTime()) / DAY;
    return (agent.remainder_points || 0) + agent.points_per_day * Math.max(0, days);
}

// Research agents and the research points the character has with each, for datacores.
export default class Research extends React.Component {
    render() {
        const char = CharacterModel.get(this.props.characterId);

        if (char.researchAgents === undefined) {
            return (
                <Panel title="Research Agents" icon="science">
                    <ScopeNotice character={char} type="research_agents" scope="Read Research Agents" what="research agents"/>
                </Panel>
            );
        }

        const agents = char.researchAgents.slice().sort((a, b) => currentPoints(b) - currentPoints(a));
        const perDay = agents.reduce((sum, a) => sum + a.points_per_day, 0);

        return (
            <Panel title="Research Agents" icon="science" flush={true}
                   subtitle={agents.length > 0 ? `${FormatHelper.number(perDay, 1)} RP/day in total` : undefined}>
                {agents.length === 0 ?
                    <p className="empty" style={{margin: 0, padding: 16}}>No research agents. Start research with an R&amp;D agent in game.</p> :
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Agent</th>
                                <th>Field</th>
                                <th className="right">RP / day</th>
                                <th className="right">Research Points</th>
                                <th className="right">Since</th>
                            </tr>
                        </thead>
                        <tbody>
                            {agents.map(a =>
                                <tr key={a.agent_id}>
                                    <td>
                                        <span className="type-cell">
                                            <img src={ImageHelper.characterPortrait(a.agent_id, 32)} alt=""/>
                                            <span>{a.agent_name}</span>
                                        </span>
                                    </td>
                                    <td>{a.skill_name}</td>
                                    <td className="right num">{FormatHelper.number(a.points_per_day, 2)}</td>
                                    <td className="right num">{FormatHelper.number(currentPoints(a), 0)}</td>
                                    <td className="right muted nowrap">{new Date(a.started_at).toLocaleDateString(navigator.language)}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                }
            </Panel>
        );
    }
}
