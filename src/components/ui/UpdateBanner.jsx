'use strict';

import React from 'react';

import UpdateHelper from '../../helpers/UpdateHelper';
import UpdateProgress from './UpdateProgress';

// Strip across the top of the app while an update downloads and installs, when it's ready, or when one is available
// to download (copies that can't update themselves).
export default class UpdateBanner extends React.Component {
    constructor(props) {
        super(props);

        this.state = {status: undefined, dismissed: undefined};
    }

    componentDidMount() {
        UpdateHelper.getStatus().then(status => this.setState({status}));
        this.unsubscribe = UpdateHelper.subscribe(status => this.setState({status}));
    }

    componentWillUnmount() {
        this.unsubscribe();
    }

    render() {
        const {status, dismissed} = this.state;

        if (status === undefined || !['downloading', 'installing', 'ready', 'available'].includes(status.status)) {
            return null;
        }

        // "Later" hides the banner for this version until it moves to the next step (e.g. downloaded -> ready)
        const busy = status.status === 'downloading' || status.status === 'installing';
        if (dismissed === `${busy ? 'busy' : status.status}:${status.version}`) {
            return null;
        }

        const ready = status.status === 'ready';

        if (busy) {
            return (
                <div className="update-banner" role="status">
                    <i className="material-icons">downloading</i>
                    <div className="update-banner-text"><UpdateProgress status={status}/></div>
                    <button type="button" className="text-button"
                            onClick={() => this.setState({dismissed: `busy:${status.version}`})}>
                        Hide
                    </button>
                </div>
            );
        }

        return (
            <div className="update-banner" role="status">
                <i className="material-icons">{ready ? 'system_update' : 'new_releases'}</i>
                <span className="update-banner-text">
                    {ready ?
                        `PodStack ${status.version} is installed. Restart to start using it.` :
                        `PodStack ${status.version} is available.`}
                </span>
                <button type="button" className="update-banner-action"
                        onClick={() => (ready ? UpdateHelper.install() : UpdateHelper.openRelease())}>
                    {ready ? 'Restart now' : 'Download'}
                </button>
                <button type="button" className="text-button"
                        onClick={() => this.setState({dismissed: `${status.status}:${status.version}`})}>
                    Later
                </button>
            </div>
        );
    }
}
