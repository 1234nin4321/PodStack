'use strict';

import React from 'react';

import DateTimeHelper from '../../helpers/DateTimeHelper';
import ImageHelper from '../../helpers/ImageHelper';
import IndustryHelper from '../../helpers/IndustryHelper';
import Bar from '../ui/Bar';

// Unfinished industry jobs of one or more characters, soonest first.
export default class IndustryJobsTable extends React.Component {
    componentDidMount() {
        this.timer = setInterval(() => this.forceUpdate(), 10000);
    }

    componentWillUnmount() {
        clearInterval(this.timer);
    }

    render() {
        const jobs = IndustryHelper.openJobs(this.props.characters);
        if (jobs.length === 0) {
            return <p className="empty" style={{margin: 0, padding: 16}}>No industry jobs running.</p>;
        }

        return (
            <table className="data-table">
                <thead>
                    <tr>
                        {this.props.showCharacter && <th>Character</th>}
                        <th>Activity</th>
                        <th>Blueprint</th>
                        <th className="right">Runs</th>
                        <th>Location</th>
                        <th style={{width: 180}}>Progress</th>
                        <th className="right">Ends</th>
                    </tr>
                </thead>
                <tbody>
                    {jobs.map(({job, character}) => {
                        const ready = IndustryHelper.isJobReady(job);

                        return (
                            <tr key={job.job_id}>
                                {this.props.showCharacter && <td>{character.name}</td>}
                                <td>{IndustryHelper.activityName(job.activity_id)}</td>
                                <td>
                                    <span className="type-cell">
                                        <img src={ImageHelper.typeIcon(job.blueprint_type_id, 32)} alt=""/>
                                        <span>
                                            {job.blueprint_name || `Type #${job.blueprint_type_id}`}
                                            {job.product_type_id !== job.blueprint_type_id && job.product_name &&
                                                <span className="muted"> → {job.product_name}</span>}
                                        </span>
                                    </span>
                                </td>
                                <td className="right num">{job.runs}</td>
                                <td className="muted">{job.location_name}</td>
                                <td><Bar value={IndustryHelper.jobProgress(job)} variant={ready ? 'omega' : ''}/></td>
                                <td className="right num">
                                    {job.status === 'paused' ? <span className="badge warn">Paused</span> :
                                        ready ? <span className="badge good">Ready</span> :
                                            DateTimeHelper.timeUntil(new Date(job.end_date))}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        );
    }
}
