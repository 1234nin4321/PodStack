'use strict';

import React from 'react';

import DateTimeHelper from '../../helpers/DateTimeHelper';

// Read-only view of a generated queue: the combined training queue (SkillPlanHelper.buildTrainingQueue) or a
// fit plan preview. showPlan adds a column with the plan each skill came from.
// Comparison times rounded to the minute (seconds only under a minute), so they fit their columns.
function compareTime(ms) {
    return DateTimeHelper.niceCountdown(ms >= 60000 ? Math.round(ms / 60000) * 60000 : ms);
}

// Time saved (green, minus) or added (amber, plus) by the compared setup.
function change(base, compared) {
    const delta = compared - base;
    if (Math.abs(delta) < 30000) {
        return <span style={{color: 'var(--text-faint)'}}>—</span>;
    }
    return (
        <span style={{color: delta < 0 ? 'var(--good)' : 'var(--warn)'}}>
            {delta < 0 ? '−' : '+'}{compareTime(Math.abs(delta))}
        </span>
    );
}

// compare: optional {label, times: {"id:level": ms}, total} from the Implants panel, adding two columns.
export default function TrainingQueueTable({queue, time, showPlan = true, compare}) {
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
                    {compare && <th className="right" title={compare.label}>With setup</th>}
                    {compare && <th className="right">Change</th>}
                    <th className="right">Done in</th>
                </tr>
            </thead>
            <tbody>
                {queue.map((item, index) => {
                    if (item.type !== 'skill') {
                        return (
                            <tr key={index} className="training-queue-marker">
                                <td colSpan={(showPlan ? 4 : 3) + (compare ? 2 : 0)}>
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
                            {compare && <td className="right num">{compareTime(compare.times[`${item.id}:${item.level}`] || 0)}</td>}
                            {compare && <td className="right num">{change(item.time, compare.times[`${item.id}:${item.level}`] || 0)}</td>}
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
                    {compare && <th className="right num">{compareTime(compare.total)}</th>}
                    {compare && <th className="right num">{change(time, compare.total)}</th>}
                    <th/>
                </tr>
            </tfoot>
        </table>
    );
}
