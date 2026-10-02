'use strict';

import React from 'react';

import CharacterModel from '../../../models/Character';
import DateTimeHelper from '../../../helpers/DateTimeHelper';
import Panel from '../../ui/Panel';
import ScopeNotice from '../../ui/ScopeNotice';

const RESPONSES = {
    accepted: <span className="badge good">Accepted</span>,
    tentative: <span className="badge warn">Tentative</span>,
    declined: <span className="badge danger">Declined</span>,
    not_responded: <span className="badge">No reply</span>,
};

// Upcoming events from the character's in-game calendar, soonest first.
export default class Calendar extends React.Component {
    render() {
        const char = CharacterModel.get(this.props.characterId);

        if (char.calendarEvents === undefined) {
            return (
                <Panel title="Calendar" icon="event">
                    <ScopeNotice character={char} type="calendar" scope="Read Calendar Events" what="calendar events"/>
                </Panel>
            );
        }

        const now = new Date();
        const events = char.calendarEvents.filter(e => new Date(e.event_date) > new Date(now.getTime() - 3600 * 1000));

        return (
            <Panel title="Upcoming Events" icon="event" flush={true} subtitle={`${events.length}`}>
                {events.length === 0 ?
                    <p className="empty" style={{margin: 0, padding: 16}}>Nothing on the calendar.</p> :
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>When</th>
                                <th className="right">In</th>
                                <th>Event</th>
                                <th>Reply</th>
                            </tr>
                        </thead>
                        <tbody>
                            {events.map(e => {
                                const date = new Date(e.event_date);
                                return (
                                    <tr key={e.event_id}>
                                        <td className="nowrap">
                                            {date.toLocaleString(navigator.language, {weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}
                                            <div className="faint">{date.toISOString().slice(11, 16)} EVE</div>
                                        </td>
                                        <td className="right num nowrap">{date > now ? DateTimeHelper.timeUntil(date) : 'Now'}</td>
                                        <td>
                                            {e.importance === 1 && <i className="material-icons important-flag" title="Important">priority_high</i>}
                                            {e.title}
                                        </td>
                                        <td>{RESPONSES[e.event_response] || e.event_response}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                }
            </Panel>
        );
    }
}
