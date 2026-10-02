'use strict';

import React from 'react';

import CharacterModel from '../../../models/Character';
import ImageHelper from '../../../helpers/ImageHelper';
import Panel from '../../ui/Panel';
import ScopeNotice from '../../ui/ScopeNotice';
import {Standing} from './Standings';

function contactImage(c) {
    switch (c.contact_type) {
        case 'character':
            return ImageHelper.characterPortrait(c.contact_id, 32);
        case 'alliance':
            return ImageHelper.allianceLogo(c.contact_id, 32);
        default:
            return ImageHelper.corporationLogo(c.contact_id, 32);
    }
}

// The character's personal contacts (the People & Places address book), best standing first.
export default class Contacts extends React.Component {
    constructor(props) {
        super(props);

        this.state = {query: ''};
    }

    render() {
        const char = CharacterModel.get(this.props.characterId);

        if (char.contacts === undefined) {
            return (
                <Panel title="Contacts" icon="contacts">
                    <ScopeNotice character={char} type="contacts" scope="Read Contacts" what="contacts"/>
                </Panel>
            );
        }

        const query = this.state.query.trim().toLowerCase();
        const list = char.contacts
            .filter(c => query === '' || [c.name, c.contact_type, ...c.labels].some(t => t && t.toLowerCase().includes(query)))
            .sort((a, b) => (b.standing - a.standing) || a.name.localeCompare(b.name));

        return (
            <Panel title="Contacts" icon="contacts" flush={true} subtitle={`${char.contacts.length}`}>
                <div className="asset-search">
                    <input className="field" type="search" placeholder="Search names, types or labels…"
                           value={this.state.query} onChange={e => this.setState({query: e.target.value})}/>
                </div>

                {list.length === 0 ?
                    <p className="empty" style={{margin: 0, padding: 16}}>{query !== '' ? 'Nothing matches.' : 'No contacts.'}</p> :
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Contact</th>
                                <th>Type</th>
                                <th>Labels</th>
                                <th className="right">Standing</th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.map(c =>
                                <tr key={c.contact_id}>
                                    <td>
                                        <span className="type-cell">
                                            <img src={contactImage(c)} alt=""/>
                                            <span>
                                                {c.name}
                                                {c.is_watched && <i className="material-icons inline-icon" title="On the watch list">visibility</i>}
                                                {c.is_blocked && <span className="badge danger" style={{marginLeft: 6}}>Blocked</span>}
                                            </span>
                                        </span>
                                    </td>
                                    <td className="muted" style={{textTransform: 'capitalize'}}>{c.contact_type}</td>
                                    <td className="muted">{c.labels.join(', ')}</td>
                                    <td className="right"><Standing value={c.standing}/></td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                }
            </Panel>
        );
    }
}
