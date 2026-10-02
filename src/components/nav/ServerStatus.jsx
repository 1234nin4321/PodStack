'use strict';

import React from 'react';

import EsiClient from '../../helpers/eve/EsiClient';
import DateTimeHelper from '../../helpers/DateTimeHelper';
import FormatHelper from '../../helpers/FormatHelper';

// ESI caches the server status for 30 seconds; once a minute is plenty for a glance in the menu
const POLL_INTERVAL = 60 * 1000;

// Tranquility's state and player count, from ESI's /status. ESI answers with an error while the server is down
// (daily downtime), and not at all when PodStack can't reach it.
export default class ServerStatus extends React.Component {
    constructor(props) {
        super(props);

        this.state = {state: 'loading'};
    }

    componentDidMount() {
        this.poll();
        this.timer = setInterval(() => this.poll(), POLL_INTERVAL);
    }

    componentWillUnmount() {
        this.unmounted = true;
        clearInterval(this.timer);
    }

    async poll() {
        try {
            const status = await new EsiClient().get('status');
            if (!this.unmounted) {
                this.setState({state: status.vip ? 'vip' : 'online', status});
            }
        } catch (err) {
            if (!this.unmounted) {
                this.setState({state: err.statusCode !== undefined ? 'offline' : 'unreachable', status: undefined});
            }
        }
    }

    render() {
        const {state, status} = this.state;
        const labels = {
            loading: 'Checking…',
            online: 'Online',
            vip: 'VIP only',
            offline: 'Offline',
            unreachable: 'Unreachable',
        };

        const title = status !== undefined ?
            `Tranquility ${status.server_version || ''}, up ${DateTimeHelper.timeSince(new Date(status.start_time))}` :
            (state === 'offline' ? 'Tranquility is down (daily downtime is 11:00 EVE time)' :
                state === 'unreachable' ? 'Couldn\'t reach EVE\'s API' : undefined);

        return (
            <div className={`server-status ${state}`} title={title}>
                <span className="dot"/>
                <span className="server-status-name">Tranquility</span>
                <span>{labels[state]}</span>
                {status !== undefined &&
                    <span className="server-status-players num">{FormatHelper.number(status.players)} pilots</span>}
            </div>
        );
    }
}
