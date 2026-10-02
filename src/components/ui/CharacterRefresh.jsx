'use strict';

import React from 'react';

import LinearProgress from 'material-ui/LinearProgress';

import CharacterModel from '../../models/Character';
import DateTimeHelper from '../../helpers/DateTimeHelper';
import appProperties from '../../../resources/properties';

const cooldownMinutes = Math.round(appProperties.manual_refresh_cooldown / 60);

function ago(date) {
    const ms = Date.now() - date.getTime();
    return ms < 60000 ? 'just now' : `${DateTimeHelper.niceCountdown(ms)} ago`;
}

function clock(ms) {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// "Refresh from ESI" for one character: when its data was last updated, when the next automatic refresh is, and a
// manual refresh limited to once every few minutes to stay within EVE's API limits.
export default class CharacterRefresh extends React.Component {
    constructor(props) {
        super(props);

        this.state = {refreshing: false, progress: undefined, showWhy: false};
    }

    componentDidMount() {
        // keeps the "updated ... ago" text and the cooldown countdown moving
        this.timer = setInterval(() => this.forceUpdate(), 1000);
    }

    componentWillUnmount() {
        clearInterval(this.timer);
        this.unmounted = true;
    }

    async refresh() {
        this.setState({refreshing: true, progress: undefined, showWhy: false});
        try {
            await CharacterModel.refreshNow(this.props.characterId, progress => {
                if (!this.unmounted) {
                    this.setState({progress});
                }
            });
        } finally {
            if (!this.unmounted) {
                this.setState({refreshing: false, progress: undefined});
            }
        }
    }

    render() {
        const character = CharacterModel.get(this.props.characterId);
        if (character === undefined) {
            return null;
        }

        const {refreshing, progress, showWhy} = this.state;
        const updated = character.getLastUpdated();
        const nextAuto = character.getNextAutoRefresh();
        const wait = character.getManualRefreshWait();
        const determinate = progress !== undefined && progress.total > 0;

        return (
            <div className="char-refresh">
                <div className="char-refresh-row">
                    <div className="char-refresh-text">
                        {refreshing ?
                            <span>Refreshing from ESI{determinate ? ` · ${progress.done}/${progress.total}` : '…'}</span> :
                            <span>
                                Updated {updated ? ago(updated) : 'never'}
                                {nextAuto && nextAuto > new Date() &&
                                    <span className="muted"> · auto refresh in {DateTimeHelper.niceCountdown(nextAuto - new Date())}</span>
                                }
                            </span>
                        }
                    </div>

                    <button
                        type="button"
                        className="char-refresh-button"
                        disabled={refreshing || wait > 0}
                        onClick={() => this.refresh()}
                        title={wait > 0 ? `Available again in ${clock(wait)}` : 'Fetch this character\'s latest data from EVE now'}
                    >
                        <i className={`material-icons ${refreshing ? 'spin' : ''}`}>sync</i>
                        {refreshing ? 'Refreshing' : wait > 0 ? `Refresh in ${clock(wait)}` : 'Refresh from ESI'}
                    </button>
                    {wait > 0 && !refreshing &&
                        <button type="button" className="icon-button" title="Why the wait?" onClick={() => this.setState({showWhy: !showWhy})}>
                            <i className="material-icons">help_outline</i>
                        </button>
                    }
                </div>

                {refreshing &&
                    <LinearProgress mode={determinate ? 'determinate' : 'indeterminate'}
                                    value={determinate ? progress.done : undefined} max={determinate ? progress.total : undefined}/>
                }

                {showWhy && wait > 0 &&
                    <p className="char-refresh-why">
                        EVE's API (ESI) only allows each app a limited number of requests per character, and going over
                        it gets every character's updates paused for a while. To keep everything flowing, you can refresh
                        a character by hand once every {cooldownMinutes} minutes. PodStack also refreshes every character
                        automatically about once an hour, so your data never goes stale.
                    </p>
                }
            </div>
        );
    }
}
