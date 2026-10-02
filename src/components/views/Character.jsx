'use strict';

import React from 'react';

import CharacterModel from '../../models/Character';
import AuthorizedCharacter from '../../models/AuthorizedCharacter';
import CharacterRefresh from '../ui/CharacterRefresh';
import FormatHelper from '../../helpers/FormatHelper';
import ImageHelper from '../../helpers/ImageHelper';
import DateTimeHelper from '../../helpers/DateTimeHelper';

import Summary from './Character/Summary';
import Skills from './Character/Skills';
import Plans from './Character/Plans';
import Contracts from './Character/Contracts';
import Mails from './Character/Mails';
import Api from './Character/Api';
import Assets from './Character/Assets';
import Industry from './Character/Industry';
import Planets from './Character/Planets';
import {CloneStateBadge, TokenStatusDot} from '../ui/CharacterBadges';
import ErrorBoundary from '../ui/ErrorBoundary';

const pages = [
    {key: 'summary', label: 'Summary', icon: 'assessment'},
    {key: 'skills', label: 'Skills', icon: 'library_books'},
    {key: 'plans', label: 'Plans', icon: 'format_list_numbered'},
    {key: 'mails', label: 'Mails', icon: 'mail'},
    {key: 'contracts', label: 'Contracts', icon: 'assignment'},
    {key: 'assets', label: 'Assets', icon: 'inventory_2'},
    {key: 'industry', label: 'Industry', icon: 'precision_manufacturing'},
    {key: 'planets', label: 'PI', icon: 'public'},
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
                    <img src={char.portraitUrl(256)} alt=""/>
                </div>

                <div className="hero-main">
                    <div>
                        <div className="hero-name">
                            {char.getDisplayName()}
                            <CloneStateBadge character={char}/>
                            <TokenStatusDot auth={AuthorizedCharacter.get(char.id)}/>
                        </div>
                        <div className="hero-affil">
                            <span>
                                <img src={ImageHelper.corporationLogo(char.corporation_id)} alt=""/>
                                {char.getCorporationName()}
                            </span>
                            {char.alliance_id !== undefined && char.getAllianceName() !== undefined &&
                                <span>
                                    <img src={ImageHelper.allianceLogo(char.alliance_id)} alt=""/>
                                    {char.getAllianceName()}
                                </span>
                            }
                        </div>
                    </div>

                    <CharacterRefresh key={char.id} characterId={char.id}/>

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
        if (char === undefined) {
            return <p className="empty">This character isn't in PodStack.</p>;
        }
        // just added, or its first refresh failed: there's nothing to show in the tabs yet
        if (!char.hasBasicInfo()) {
            return (
                <div>
                    {this.renderHero(char)}
                    <div className="panel" style={{marginTop: 18, padding: 18}}>
                        <p className="empty" style={{margin: 0}}>
                            {char.getDisplayName()}'s data is still loading. If this doesn't change within a few
                            minutes, use Refresh from ESI above, or check the character's login on the Character Overview.
                        </p>
                    </div>
                </div>
            );
        }

        let component;
        switch(this.state.currentPage) {
            case 'plans':
                // training times are worked out from the attributes
                component = char.attributes !== undefined ?
                    <Plans key={characterId} characterId={characterId}/> :
                    <div className="panel" style={{padding: 18}}>
                        <p className="empty" style={{margin: 0}}>
                            Skill plans need {char.getDisplayName()}'s attributes, which haven't loaded yet. They load on the
                            next refresh; Refresh from ESI above loads them now.
                        </p>
                    </div>;
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
            case 'assets':
                component = <Assets key={characterId} characterId={characterId}/>;
                break;
            case 'industry':
                component = <Industry characterId={characterId}/>;
                break;
            case 'planets':
                component = <Planets characterId={characterId}/>;
                break;
            case 'api':
                component = <Api characterId={characterId}/>;
                break;
            default:
                component = <Summary characterId={characterId}/>;
        }

        return (
            <div>
                {this.renderHero(char)}

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

                {/* a broken tab keeps the header and the other tabs usable */}
                <ErrorBoundary key={`${characterId}-${this.state.currentPage}`} area={`Character ${this.state.currentPage} tab`}
                               title="This tab couldn't be shown">
                    {component}
                </ErrorBoundary>
            </div>
        );
    }
}
