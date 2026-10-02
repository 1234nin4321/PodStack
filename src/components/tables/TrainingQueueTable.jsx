'use strict';

import React from 'react';

import DateTimeHelper from '../../helpers/DateTimeHelper';

// Read-only view of a generated queue: the combined training queue (SkillPlanHelper.buildTrainingQueue) or a
// fit plan preview. showPlan adds a column with the plan each skill came from.
export default function TrainingQueueTable({queue, time, showPlan = true}) {
    const skills = queue.filter(item => item.type === 'skill');

    if (queue.length === 0) {
        return (
            <p className="empty" style={{margin: 16}}>
                Nothing to train. Switch on a plan in the Plans list, or create one.
            </p>
        );
    }

    let elapsed = 0;

    return (
        <table className="data-table training-queue">
            <thead>
                <tr>
                    <th>Skill</th>
                    {showPlan && <th>Plan</th>}
                    <th className="right">Training time</th>
                    <th className="right">Done in</th>
                </tr>
            </thead>
            <tbody>
                {queue.map((item, index) => {
                    if (item.type !== 'skill') {
                        return (
                            <tr key={index} className="training-queue-marker">
                                <td colSpan={showPlan ? 4 : 3}>
                                    <i className="material-icons">{item.type === 'remap' ? 'tune' : 'sticky_note_2'}</i>
                                    {item.type === 'note' ? item.text : item.title}
                                </td>
                            </tr>
                        );
                    }

                    elapsed += item.time;

                    return (
                        <tr key={index}>
                            <td>{item.title}</td>
                            {showPlan && <td className="muted">{item.planName}</td>}
                            <td className="right num">{DateTimeHelper.niceCountdown(item.time)}</td>
                            <td className="right num muted">{DateTimeHelper.niceCountdown(elapsed)}</td>
                        </tr>
                    );
                })}
            </tbody>
            <tfoot>
                <tr>
                    <th>{skills.length} skill{skills.length === 1 ? '' : 's'}</th>
                    {showPlan && <th/>}
                    <th className="right num">{DateTimeHelper.niceCountdown(time)}</th>
                    <th/>
                </tr>
            </tfoot>
        </table>
    );
}
