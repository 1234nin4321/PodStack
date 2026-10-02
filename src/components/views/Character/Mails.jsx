'use strict';

import React from 'react';

import CharacterModel from '../../../models/Character';

import MailTable from '../../tables/MailTable';
import Panel from '../../ui/Panel';

export default class Mails extends React.Component {
    constructor(props) {
        super(props);
    }

    markAllRead(char) {
        char.markAllMailsRead();
        this.forceUpdate();
        if (this.props.onRead !== undefined) {
            this.props.onRead();
        }
    }

    render() {
        const char = CharacterModel.get(this.props.characterId);
        // shown as read once marked read in PodStack, too
        const mails = char.getMails().map(m => ({...m, is_read: !char.isMailUnread(m)}));
        const unread = char.getUnreadMailCount();

        return (
            <Panel
                title="EVE Mail"
                icon="mail"
                subtitle={
                    <span>
                        {unread > 0 && <span className="badge info" style={{marginRight: 8}}>{unread} unread</span>}
                        {(info => info !== undefined ? `Updated ${info.lastRefresh}` : 'Not loaded yet')(char.getDataRefreshInfo().find(c => c.type === 'Mails'))}
                    </span>
                }
                actions={
                    <button type="button" className="link-button mark-read" disabled={unread === 0}
                            onClick={() => this.markAllRead(char)}>
                        Mark all read
                    </button>
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
