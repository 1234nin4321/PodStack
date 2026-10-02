'use strict';

import React from 'react';

import CharacterModel from '../../models/Character';
import AuthorizedCharacter from '../../models/AuthorizedCharacter';
import FormatHelper from '../../helpers/FormatHelper';
import ImageHelper from '../../helpers/ImageHelper';
import DateTimeHelper from '../../helpers/DateTimeHelper';

import Summary from './Character/Summary';
import Skills from './Character/Skills';
import Plans from './Character/Plans';
import Contracts from './Character/Contracts';
import Mails from './Character/Mails';
import Api from './Character/Api';
import {CloneStateBadge, TokenStatusDot} from '../ui/CharacterBadges';

const pages = [
    {key: 'summary', label: 'Summary', icon: 'assessment'},
    {key: 'skills', label: 'Skills', icon: 'library_books'},
    {key: 'plans', label: 'Plans', icon: 'format_list_numbered'},
    {key: 'mails', label: 'Mails', icon: 'mail'},
    {key: 'contracts', label: 'Contracts', icon: 'assignment'},
    {key: 'api', label: 'API', icon: 'vpn_key'},
];

export default class Character extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            currentPage: 'summary',
        }
    }

    switchPage(newPage) {
        this.setState({
            currentPage: newPage
        });
    }

    renderHero(char) {
        const currentSkill = char.getCurrentSkill();

        return (
            <div className="panel hero">
                <div className="hero-portrait">
                    <img src={char.portraits.px256x256 || char.portraits.px128x128} alt=""/>
                </div>

                <div className="hero-main">
                    <div>
                        <div className="hero-name">
                            {char.name}
                            <CloneStateBadge character={char}/>
                            <TokenStatusDot auth={AuthorizedCharacter.get(char.id)}/>
                        </div>
                        <div className="hero-affil">
                            <span>
                                <img src={ImageHelper.corporationLogo(char.corporation_id)} alt=""/>
                                {char.corporation.name}
                            </span>
                            {char.alliance_id !== undefined && char.alliance !== undefined &&
                                <span>
                                    <img src={ImageHelper.allianceLogo(char.alliance_id)} alt=""/>
                                    {char.alliance.name}
                                </span>
                            }
                        </div>
                    </div>

                    <div className="hero-stats">
                        <div>
                            <div className="stat-label">Skill Points</div>
                            <div className="stat-value num">{FormatHelper.number(char.getTotalSp())}</div>
                        </div>
                        <div>
                            <div className="stat-label">Wallet</div>
                            <div className="stat-value num">{FormatHelper.number(char.balance, 2)}<small>ISK</small></div>
                        </div>
                        <div>
                            <div className="stat-label">Training</div>
                            <div className="stat-value num" style={currentSkill === undefined ? {color: 'var(--warn)'} : undefined}>
                                {currentSkill !== undefined ?
                                    DateTimeHelper.timeUntil(new Date(char.getLastSkill().finish_date)) :
                                    'Idle'
                                }
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    render() {
        const characterId = this.props.match.params.characterId;
        const char = CharacterModel.get(characterId);

        let component;
        switch(this.state.currentPage) {
            case 'plans':
                component = <Plans key={characterId} characterId={characterId}/>;
            break;
            case 'skills':
                component = <Skills characterId={characterId}/>;
                break;
            case 'contracts':
                component = <Contracts characterId={characterId}/>;
                break;
            case 'mails':
                component = <Mails characterId={characterId}/>;
                break;
            case 'api':
                component = <Api characterId={characterId}/>;
                break;
            default:
                component = <Summary characterId={characterId}/>;
        }

        return (
            <div>
                {char !== undefined && this.renderHero(char)}

                <div className="tabs">
                    {pages.map(page =>
                        <button
                            key={page.key}
                            className={`tab ${this.state.currentPage === page.key ? 'active' : ''}`}
                            onClick={() => this.switchPage(page.key)}
                        >
                            <i className="material-icons">{page.icon}</i>
                            {page.label}
                        </button>
                    )}
                </div>

                {component}
            </div>
        );
    }
}
