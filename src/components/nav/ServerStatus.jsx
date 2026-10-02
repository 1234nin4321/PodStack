'use strict';

import React from 'react';

import EsiClient from '../../helpers/eve/EsiClient';
import DateTimeHelper from '../../helpers/DateTimeHelper';
import FormatHelper from '../../helpers/FormatHelper';

// ESI caches the server status for 30 seconds; once a minute is plenty for a glance in the menu
const POLL_INTERVAL = 60 * 1000;
const DOWNTIME_HOUR = 11;   // EVE time (UTC), daily

// time until the next daily downtime, in ms
function untilDowntime(now) {
    const next = new Date(now);
    next.setUTCHours(DOWNTIME_HOUR, 0, 0, 0);
    if (next.getTime() <= now.getTime()) {
        next.setUTCDate(next.getUTCDate() + 1);
    }
    return next.getTime() - now.getTime();
}

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
        // the EVE clock moves on its own
        this.clock = setInterval(() => this.forceUpdate(), 15 * 1000);
    }

    componentWillUnmount() {
        this.unmounted = true;
        clearInterval(this.timer);
        clearInterval(this.clock);
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

        const now = new Date();
        const eveTime = now.toISOString().slice(11, 16);
        const downtime = untilDowntime(now);

        return (
            <div className="server-status-box">
                <div className={`server-status ${state}`} title={title}>
                    <span className="dot"/>
                    <span className="server-status-name">Tranquility</span>
                    <span>{labels[state]}</span>
                    {status !== undefined &&
                        <span className="server-status-players num">{FormatHelper.number(status.players)} pilots</span>}
                </div>
                <div className="eve-clock" title={`EVE time is UTC. Daily downtime starts at ${DOWNTIME_HOUR}:00 EVE time.`}>
                    <i className="material-icons">schedule</i>
                    <span className="num eve-clock-time">{eveTime}</span>
                    <span>EVE time</span>
                    <span className="eve-clock-downtime num">DT in {DateTimeHelper.niceCountdown(downtime).split(' ').slice(0, 2).join(' ')}</span>
                </div>
            </div>
        );
    }
}
