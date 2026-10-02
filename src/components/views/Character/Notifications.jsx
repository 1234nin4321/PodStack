'use strict';

import React from 'react';

import CharacterModel from '../../../models/Character';
import DateTimeHelper from '../../../helpers/DateTimeHelper';
import FormatHelper from '../../../helpers/FormatHelper';
import Panel from '../../ui/Panel';
import ScopeNotice from '../../ui/ScopeNotice';

const ROW_LIMIT = 300;

// The notification's details as "key: value" lines (ESI gives them as YAML), ids and all.
function details(text) {
    return String(text || '').split('\n').map(l => l.trimEnd()).filter(l => l !== '' && l !== '{}');
}

// EVE's in-game notifications (the ones in the Notifications window, not mail), newest first.
export default class Notifications extends React.Component {
    constructor(props) {
        super(props);

        this.state = {query: '', open: undefined};
    }

    markAllRead(char) {
        char.markAllNotificationsRead();
        this.forceUpdate();
        if (this.props.onRead !== undefined) {
            this.props.onRead();
        }
    }

    render() {
        const char = CharacterModel.get(this.props.characterId);
        const info = char.getDataRefreshInfo().find(c => c.type === 'EVE Notifications');

        if (char.eveNotifications === undefined) {
            return (
                <Panel title="Notifications" icon="notifications">
                    <ScopeNotice character={char} type="notifications" scope="Read EVE Notifications" what="notifications"/>
                </Panel>
            );
        }

        const query = this.state.query.trim().toLowerCase();
        const list = char.eveNotifications.filter(n => query === '' ||
            [FormatHelper.notificationTitle(n.type), n.sender_name, n.text].some(t => t && t.toLowerCase().includes(query)));
        const unread = char.getUnreadNotificationCount();

        return (
            <Panel title="Notifications" icon="notifications" flush={true}
                   subtitle={`${FormatHelper.number(char.eveNotifications.length)} · ${unread} unread${info !== undefined ? ` · Updated ${info.lastRefresh}` : ''}`}
                   actions={
                       <button type="button" className="link-button mark-read" disabled={unread === 0}
                               onClick={() => this.markAllRead(char)}>
                           Mark all read
                       </button>
                   }>
                <div className="asset-search">
                    <input className="field" type="search" placeholder="Search type, sender or details…"
                           value={this.state.query} onChange={e => this.setState({query: e.target.value})}/>
                </div>

                {list.length === 0 && <p className="empty" style={{margin: 0, padding: 16}}>{query !== '' ? 'Nothing matches.' : 'No notifications.'}</p>}

                {list.slice(0, ROW_LIMIT).map(n => {
                    const open = this.state.open === n.notification_id;
                    const date = new Date(n.timestamp);
                    return (
                        <div key={n.notification_id} className="asset-group">
                            <div className="asset-group-head" onClick={() => this.setState({open: open ? undefined : n.notification_id})}>
                                <i className={`material-icons chevron ${open ? 'open' : ''}`}>expand_more</i>
                                {char.isNotificationUnread(n) && <span className="unread-dot" title="Unread"/>}
                                <span className="asset-group-name" style={{fontWeight: char.isNotificationUnread(n) ? 600 : 'normal'}}>{FormatHelper.notificationTitle(n.type)}</span>
                                <span className="muted">{n.sender_name || ''}</span>
                                <span className="muted nowrap" title={date.toLocaleString(navigator.language)}>{DateTimeHelper.timeSince(date)} ago</span>
                            </div>
                            {open &&
                                <pre className="notification-text">{details(n.text).join('\n') || 'No details.'}</pre>
                            }
                        </div>
                    );
                })}
                {list.length > ROW_LIMIT && <p className="muted" style={{margin: 0, padding: '8px 16px'}}>Showing the latest {ROW_LIMIT}. Search to narrow it down.</p>}
            </Panel>
        );
    }
}
