'use strict';

import React from 'react';

import Character from '../../models/Character';
import DateTimeHelper from '../../helpers/DateTimeHelper';
import IndustryHelper from '../../helpers/IndustryHelper';
import PlanetsTable from '../tables/PlanetsTable';
import PageHeader from '../ui/PageHeader';
import Panel from '../ui/Panel';
import StatTile from '../ui/StatTile';

// Planetary colonies across all characters.
export default class Planets extends React.Component {
    componentDidMount() {
        this.subscriberId = Character.subscribe(this);
    }

    componentWillUnmount() {
        Character.unsubscribe(this.subscriberId);
    }

    render() {
        const characters = Object.values(Character.getAll());
        const colonies = IndustryHelper.colonies(characters);
        const extractors = colonies.flatMap(o => o.colony.extractors);
        const expired = extractors.filter(IndustryHelper.isExtractorExpired).length;
        const expiries = colonies.map(o => IndustryHelper.colonyNextExpiry(o.colony)).filter(d => d !== undefined);
        const next = expiries.length > 0 ? new Date(Math.min(...expiries)) : undefined;
        const missing = characters.filter(c => c.planets === undefined).length;

        return (
            <div>
                <PageHeader eyebrow="Industry" title="Planetary Industry"/>

                <div className="stats">
                    <StatTile label="Colonies" icon="public" value={colonies.length}/>
                    <StatTile label="Extractors Running" icon="bolt" value={extractors.length - expired}/>
                    <StatTile label="Extractors Expired" icon="warning" value={expired} warn={expired > 0}
                              foot={expired > 0 ? 'Restart them in-game' : 'All running'}/>
                    <StatTile label="Next Expiry" icon="schedule" value={next !== undefined ? DateTimeHelper.timeUntil(next) : '—'}/>
                </div>

                <Panel title="Colonies" icon="public" flush={true}
                       subtitle={missing > 0 ? `${missing} character(s) need to re-authorize to show colonies` : undefined}>
                    <PlanetsTable characters={characters} showCharacter={true}/>
                </Panel>
            </div>
        );
    }
}
