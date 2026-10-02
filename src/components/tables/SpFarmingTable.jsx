'use strict';

import React from 'react';
import {Redirect} from 'react-router';

import Character from '../../models/Character';
import FarmCharacter from '../../models/FarmCharacter';
import FarmHelper from '../../helpers/FarmHelper';
import DateTimeHelper from '../../helpers/DateTimeHelper';
import FormatHelper from '../../helpers/FormatHelper';
import ImageHelper from '../../helpers/ImageHelper';

import IconButton from 'material-ui/IconButton';
import FontIcon from 'material-ui/FontIcon';

import {colors} from '../theme';
import Panel from '../ui/Panel';
import Bar from '../ui/Bar';
import {CloneStateBadge} from '../ui/CharacterBadges';

const INJECTOR_SP = 500000;

export default class SpFarmingTable extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            characters: FarmCharacter.getAll(),
            ticking: true,
            redirectPath: undefined
        };
    }

    componentDidMount() {
        this.timerId = setInterval(
            () => this.tick(),
            1000
        );

        this.subscriberId = FarmCharacter.subscribe(this);
    }

    componentWillUnmount() {
        clearInterval(this.timerId);

        FarmCharacter.unsubscribe(this.subscriberId);
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

    handleDelete(e, characterId) {
        e.stopPropagation();
        FarmHelper.deleteFarm(characterId);

        this.forceUpdate();
    };

    render() {
        if (this.state.redirectPath !== undefined) {
            this.setState({redirectPath: undefined});

            return <Redirect push to={this.state.redirectPath}/>;
        }

        if (this.state.characters.length === 0) {
            return (
                <Panel title="Farms" icon="opacity">
                    <p className="empty" style={{margin: 0}}>No farms yet. Use "Add/Update Farm" to track a character.</p>
                </Panel>
            );
        }

        return (
            <Panel title="Farms" icon="opacity" flush={true}>
                <div className="roster-head farm-grid">
                    <span/>
                    <span>Capsuleer</span>
                    <span>Skill Points</span>
                    <span>Next Injector</span>
                    <span>Training</span>
                    <span/>
                </div>

                {this.state.characters.map(farmChar => {
                    const char = Character.get(farmChar.id);
                    const currentSkill = char.getCurrentSkill();
                    const totalSp = char.getTotalSp();
                    const injectors = char.getInjectorsReady(farmChar.baseSp);
                    const progress = ((totalSp - farmChar.baseSp) % INJECTOR_SP) / INJECTOR_SP;

                    return (
                        <div key={char.id} className="roster-row farm-grid" onClick={e => this.handleClick(e, char.id)}>
                            <div className="portrait">
                                <img src={char.portraits.px128x128} alt=""/>
                            </div>

                            <div style={{minWidth: 0}}>
                                <div className="roster-name">
                                    {char.name}
                                    <CloneStateBadge character={char}/>
                                </div>
                                <div className="roster-corp">
                                    <img src={ImageHelper.corporationLogo(char.corporation_id, 32)} alt=""/>
                                    {char.corporation.name}
                                </div>
                            </div>

                            <div>
                                <div className="roster-figure num">{FormatHelper.number(totalSp)}<small>SP</small></div>
                                <div className="roster-caption num">Base {FormatHelper.number(farmChar.baseSp)}</div>
                            </div>

                            <div>
                                <div className="roster-training-skill">
                                    <span className="roster-figure num" style={{color: injectors > 0 ? 'var(--omega)' : undefined}}>
                                        {injectors}<small>READY</small>
                                    </span>
                                    <span className="num muted">
                                        {currentSkill !== undefined ? DateTimeHelper.timeUntil(char.getNextInjectorDate(farmChar.baseSp)) : '—'}
                                    </span>
                                </div>
                                <Bar value={progress} variant="omega"/>
                            </div>

                            <div>
                                {currentSkill !== undefined ?
                                    <div>
                                        <div className="roster-figure num">{FormatHelper.number(char.getCurrentSpPerHour())}<small>SP/H</small></div>
                                        <div className="roster-caption num">
                                            Queue ends in {DateTimeHelper.timeUntil(new Date(char.getLastSkill().finish_date))}
                                        </div>
                                    </div> :
                                    <span className="badge warn">Not Training</span>
                                }
                            </div>

                            <div style={{textAlign: 'right'}}>
                                <IconButton tooltip="Remove farm" onClick={e => this.handleDelete(e, char.id)}>
                                    <FontIcon className="material-icons" color={colors.textFaint} hoverColor={colors.danger}>delete</FontIcon>
                                </IconButton>
                            </div>
                        </div>
                    )
                })}
            </Panel>
        );
    }
}
