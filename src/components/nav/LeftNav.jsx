'use strict';

import React from 'react';
import {NavLink, withRouter} from 'react-router-dom';

import Character from '../../models/Character';
import AuthorizedCharacter from '../../models/AuthorizedCharacter';
import {TokenStatusDot} from '../ui/CharacterBadges';
import QueueHealthHelper from '../../helpers/QueueHealthHelper';
import appProperties from '../../../resources/properties';

const sections = [
    {path: '/', label: 'Character Overview', icon: 'dashboard', exact: true},
    {path: '/skill-browser', label: 'Skill Browser', icon: 'account_tree'},
    {path: '/queue-health', label: 'Queue Health', icon: 'monitor_heart', badge: QueueHealthHelper.countProblems},
    {path: '/sp-farming', label: 'SP Farming', icon: 'opacity'},
    {path: '/contracts', label: 'Contracts', icon: 'assignment'},
];

function formatSp(sp) {
    if (sp >= 1000000) {
        return `${(sp / 1000000).toLocaleString(navigator.language, {maximumFractionDigits: 1})}M SP`;
    }

    return `${Math.round(sp / 1000).toLocaleString(navigator.language)}k SP`;
}

class LeftNav extends React.Component {
    componentDidMount() {
        this.subscriberId = Character.subscribe(this);
    }

    componentWillUnmount() {
        Character.unsubscribe(this.subscriberId);
    }

    render() {
        const characters = Object.values(Character.getAll()).sort((a, b) => b.getTotalSp() - a.getTotalSp());

        return (
            <nav className="nav">
                <div className="nav-brand">
                    <img src="./../resources/icon.png" alt=""/>
                    <div>
                        <div className="nav-brand-name">PODSTACK</div>
                        <div className="nav-brand-sub">Capsuleer Manager · {appProperties.display_version}</div>
                    </div>
                </div>

                <div className="nav-scroll">
                    <div className="nav-section">Command</div>
                    {sections.map(s => {
                        const badge = s.badge !== undefined ? s.badge(characters) : 0;

                        return (
                            <NavLink key={s.path} to={s.path} exact={s.exact} className="nav-link" activeClassName="active">
                                <i className="material-icons">{s.icon}</i>
                                {s.label}
                                {badge > 0 && <span className="nav-badge" title={`${badge} need attention`}>{badge}</span>}
                            </NavLink>
                        );
                    })}

                    <div className="nav-section">
                        <span>Capsuleers</span>
                        <span>{characters.length}</span>
                    </div>
                    {characters.map(character => {
                        const training = character.getCurrentSkill() !== undefined;

                        return (
                            <NavLink
                                key={character.id}
                                to={`/characters/${character.id}`}
                                className="nav-link nav-char"
                                activeClassName="active"
                            >
                                <div className="nav-char-portrait">
                                    <img src={character.portraits.px64x64 || character.portraits.px128x128} alt=""/>
                                    <TokenStatusDot auth={AuthorizedCharacter.get(character.id)}/>
                                </div>
                                <div className="nav-char-text">
                                    <div className="nav-char-name">{character.name}</div>
                                    <div className="nav-char-meta">
                                        {formatSp(character.getTotalSp())}
                                        {!training && <span style={{color: 'var(--warn)'}}> · Idle</span>}
                                    </div>
                                </div>
                            </NavLink>
                        );
                    })}
                </div>

                <div className="nav-footer">
                    <NavLink to="/settings" className="nav-link" activeClassName="active">
                        <i className="material-icons">settings</i>
                        Settings
                    </NavLink>
                </div>
            </nav>
        );
    }
}

// withRouter re-renders the nav on navigation so the active link stays in sync.
export default withRouter(LeftNav);
