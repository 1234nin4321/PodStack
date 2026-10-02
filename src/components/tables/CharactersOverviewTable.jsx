'use strict';

import React from 'react';
import {Redirect} from 'react-router';

import Character from '../../models/Character';
import AuthorizedCharacter from '../../models/AuthorizedCharacter';
import DateTimeHelper from '../../helpers/DateTimeHelper';
import FormatHelper from '../../helpers/FormatHelper';
import ImageHelper from '../../helpers/ImageHelper';

import Panel from '../ui/Panel';
import Bar from '../ui/Bar';
import {CloneStateBadge, TokenStatusDot} from '../ui/CharacterBadges';

export default class CharactersOverviewTable extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            characters: Object.values(Character.getAll()).sort((a, b) => b.getTotalSp() - a.getTotalSp()),
            ticking: true,
            redirectPath: undefined
        };
    }

    componentDidMount() {
        this.timerId = setInterval(
            () => this.tick(),
            1000
        );

        this.subscriberId = Character.subscribe(this);
    }

    componentWillUnmount() {
        clearInterval(this.timerId);

        Character.unsubscribe(this.subscriberId);
    }

    tick() {
        if (this.state.ticking) {
            this.forceUpdate();
        }
    }

    handleClick(e, characterId) {
        let path = '/characters/' + characterId;

        this.setState({
            redirectPath: path
        });
    }

    render() {
        if (this.state.redirectPath !== undefined) {
            this.setState({redirectPath: undefined});

            return <Redirect push to={this.state.redirectPath}/>;
        }

        if (this.state.characters.length === 0) {
            return (
                <Panel title="Roster" icon="group">
                    <p className="empty">No characters yet. Use "Authorize Character" to add your first capsuleer.</p>
                </Panel>
            );
        }

        return (
            <Panel title="Roster" icon="group" subtitle="Sorted by skill points" flush={true}>
                <div className="roster-head">
                    <span/>
                    <span>Capsuleer</span>
                    <span>Wallet</span>
                    <span>Skill Points</span>
                    <span>Training</span>
                </div>

                {this.state.characters.map(char => {
                    const currentSkill = char.getCurrentSkill();
                    const lastSkill = char.getLastSkill();
                    const auth = AuthorizedCharacter.get(char.id);

                    return (
                        <div key={char.id} className="roster-row" onClick={(e) => this.handleClick(e, char.id)}>
                            <div className="portrait">
                                <img src={char.portraits.px128x128} alt=""/>
                                <TokenStatusDot auth={auth}/>
                            </div>

                            <div style={{minWidth: 0}}>
                                <div className="roster-name">
                                    {char.name}
                                    <CloneStateBadge character={char}/>
                                </div>
                                <div className="roster-corp">
                                    <img src={ImageHelper.corporationLogo(char.corporation_id, 32)} alt=""/>
                                    {char.corporation.name}
                                    {char.alliance_id !== undefined && char.alliance !== undefined &&
                                        <span className="faint">/ {char.alliance.name}</span>
                                    }
                                </div>
                            </div>

                            <div>
                                <div className="roster-figure num">{FormatHelper.compact(char.balance)}<small>ISK</small></div>
                                <div className="roster-caption num">{FormatHelper.number(char.balance, 2)}</div>
                            </div>

                            <div>
                                <div className="roster-figure num">{FormatHelper.compact(char.getTotalSp())}<small>SP</small></div>
                                <div className="roster-caption num">{FormatHelper.number(char.getTotalSp())}</div>
                            </div>

                            {currentSkill !== undefined ?
                                <div className="roster-training">
                                    <div className="roster-training-skill">
                                        <span>{currentSkill.skill_name} {currentSkill.finished_level}</span>
                                        <span className="num muted">{DateTimeHelper.timeUntil(new Date(currentSkill.finish_date))}</span>
                                    </div>
                                    <Bar value={FormatHelper.trainingProgress(currentSkill)}/>
                                    <div className="roster-caption">
                                        Queue ends in {DateTimeHelper.timeUntil(new Date(lastSkill.finish_date))}
                                    </div>
                                </div> :
                                <div>
                                    <span className="badge warn">Not Training</span>
                                </div>
                            }
                        </div>
                    );
                })}
            </Panel>
        );
    }
}
