'use strict';

import React from 'react';

import UpdateHelper from '../../helpers/UpdateHelper';

// Strip across the top of the app when an update is ready to install, or available to download.
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

        if (status === undefined || !['ready', 'available'].includes(status.status)
            || dismissed === `${status.status}:${status.version}`) {
            return null;
        }

        const ready = status.status === 'ready';

        return (
            <div className="update-banner" role="status">
                <i className="material-icons">{ready ? 'system_update' : 'new_releases'}</i>
                <span className="update-banner-text">
                    {ready ?
                        `PodStack ${status.version} has been downloaded and is ready to install.` :
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
