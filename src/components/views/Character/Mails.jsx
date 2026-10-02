'use strict';

import React from 'react';

import CharacterModel from '../../../models/Character';

import MailTable from '../../tables/MailTable';
import Panel from '../../ui/Panel';

export default class Mails extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        const char = CharacterModel.get(this.props.characterId);
        const mails = char.getMails();
        const unread = mails.filter(m => !m.is_read).length;

        return (
            <Panel
                title="EVE Mail"
                icon="mail"
                subtitle={
                    <span>
                        {unread > 0 && <span className="badge info" style={{marginRight: 8}}>{unread} unread</span>}
                        Updated {char.getDataRefreshInfo().find(c => c.type === 'Mails').lastRefresh}
                    </span>
                }
            >
                <MailTable
                    mails={mails}
                    complete={true}
                />
            </Panel>
        );
    }
}
