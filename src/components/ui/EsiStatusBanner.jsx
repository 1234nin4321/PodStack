'use strict';

import React from 'react';

import EsiRateLimiter from '../../helpers/eve/EsiRateLimiter';
import DateTimeHelper from '../../helpers/DateTimeHelper';

// Friendly notice while ESI has asked PodStack to slow down; refreshes carry on by themselves afterwards.
export default class EsiStatusBanner extends React.Component {
    constructor(props) {
        super(props);

        this.state = {status: EsiRateLimiter.getStatus()};
    }

    componentDidMount() {
        this.unsubscribe = EsiRateLimiter.subscribe(status => this.setState({status}));
        // re-check every second so the countdown moves and the banner goes away when the pause ends
        this.timer = setInterval(() => this.setState({status: EsiRateLimiter.getStatus()}), 1000);
    }

    componentWillUnmount() {
        this.unsubscribe();
        clearInterval(this.timer);
    }

    render() {
        const {status} = this.state;
        if (!status.paused) {
            return null;
        }

        const left = Math.max(1000, status.pausedUntil - Date.now());
        return (
            <div className="update-banner esi-banner" role="status">
                <i className="material-icons">hourglass_top</i>
                <span className="update-banner-text">
                    {status.reason === 'error-limit' ?
                        'EVE\'s API has seen a lot of failed requests and asked apps to back off for a moment.' :
                        'EVE\'s API asked PodStack to slow down so it stays within its request limits.'}
                    {' '}Updates continue automatically in {DateTimeHelper.niceCountdown(left)}. Nothing is lost.
                </span>
            </div>
        );
    }
}
