'use strict';

import React from 'react';

import Character from '../../models/Character';
import DateTimeHelper from '../../helpers/DateTimeHelper';
import IndustryHelper from '../../helpers/IndustryHelper';
import IndustryJobsTable from '../tables/IndustryJobsTable';
import PageHeader from '../ui/PageHeader';
import Panel from '../ui/Panel';
import StatTile from '../ui/StatTile';

// Industry jobs across all characters.
export default class Industry extends React.Component {
    componentDidMount() {
        this.subscriberId = Character.subscribe(this);
    }

    componentWillUnmount() {
        Character.unsubscribe(this.subscriberId);
    }

    render() {
        const characters = Object.values(Character.getAll());
        const jobs = IndustryHelper.openJobs(characters);
        const ready = jobs.filter(o => IndustryHelper.isJobReady(o.job)).length;
        const next = jobs.find(o => !IndustryHelper.isJobReady(o.job) && o.job.status === 'active');
        const missing = characters.filter(c => c.industryJobs === undefined).length;

        return (
            <div>
                <PageHeader eyebrow="Industry" title="Industry Jobs"/>

                <div className="stats">
                    <StatTile label="Open Jobs" icon="precision_manufacturing" value={jobs.length}/>
                    <StatTile label="Ready To Deliver" icon="inventory" value={ready} warn={ready > 0}/>
                    <StatTile label="Next Completion" icon="schedule"
                              value={next !== undefined ? DateTimeHelper.timeUntil(new Date(next.job.end_date)) : '—'}
                              foot={next !== undefined ? next.character.name : undefined}/>
                </div>

                <Panel title="Jobs" icon="precision_manufacturing" flush={true}
                       subtitle={missing > 0 ? `${missing} character(s) need to re-authorize to show jobs` : undefined}>
                    <IndustryJobsTable characters={characters} showCharacter={true}/>
                </Panel>
            </div>
        );
    }
}
