'use strict';

import React from 'react';

import CharacterModel from '../../../models/Character';
import ImageHelper from '../../../helpers/ImageHelper';
import Panel from '../../ui/Panel';
import ScopeNotice from '../../ui/ScopeNotice';

// Medals awarded to the character by corporations, newest first.
export default class Medals extends React.Component {
    render() {
        const char = CharacterModel.get(this.props.characterId);

        if (char.medals === undefined) {
            return (
                <Panel title="Medals" icon="military_tech">
                    <ScopeNotice character={char} type="medals" scope="Read Medals" what="medals"/>
                </Panel>
            );
        }

        return (
            <Panel title="Medals" icon="military_tech" flush={true} subtitle={`${char.medals.length}`}>
                {char.medals.length === 0 && <p className="empty" style={{margin: 0, padding: 16}}>No medals yet.</p>}
                {char.medals.map(m =>
                    <div key={`${m.medal_id}:${m.date}`} className="list-row medal">
                        <img src={ImageHelper.corporationLogo(m.corporation_id, 64)} alt="" width={40} height={40}/>
                        <div className="grow">
                            <div>
                                <strong>{m.title}</strong>
                                {m.status === 'private' && <span className="badge" style={{marginLeft: 6}}>Private</span>}
                            </div>
                            <div className="muted">{m.corporation}{m.issuer ? ` · awarded by ${m.issuer}` : ''} · {new Date(m.date).toLocaleDateString(navigator.language)}</div>
                            {m.reason && <div style={{marginTop: 4}}>{m.reason}</div>}
                            {m.description && <div className="faint" style={{marginTop: 2}}>{m.description}</div>}
                        </div>
                    </div>
                )}
            </Panel>
        );
    }
}
