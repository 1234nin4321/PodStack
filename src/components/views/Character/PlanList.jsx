'use strict';

import React from 'react';

import Toggle from 'material-ui/Toggle';

import Panel from '../../ui/Panel';
import DateTimeHelper from '../../../helpers/DateTimeHelper';

export const TRAINING_QUEUE = '__queue__';

// The character's plans in priority order: open one, switch it on/off in the training queue, or move it up/down.
export default function PlanList({plans, selectedId, queueTime, onSelect, onToggle, onMove, onMerge}) {
    const enabledCount = plans.filter(p => p.enabled).length;

    return (
        <Panel
            title="Plans"
            icon="view_list"
            flush={true}
            subtitle={plans.length > 1 &&
                <button type="button" className="text-button" onClick={onMerge}>
                    <i className="material-icons">call_merge</i>Merge
                </button>
            }
        >
            <div
                className={`plan-list-row queue ${selectedId === TRAINING_QUEUE ? 'selected' : ''}`}
                onClick={() => onSelect(TRAINING_QUEUE)}
            >
                <i className="material-icons">playlist_play</i>
                <div className="plan-list-text">
                    <div className="plan-list-name">Training Queue</div>
                    <div className="plan-list-meta">
                        {enabledCount} of {plans.length} plan{plans.length === 1 ? '' : 's'} on
                        {queueTime !== undefined && ` · ${DateTimeHelper.niceCountdown(queueTime)}`}
                    </div>
                </div>
            </div>

            {plans.length === 0 &&
                <p className="empty plan-list-empty">No plans yet. Use New, or import a ship fitting.</p>
            }

            {plans.map((plan, index) =>
                <div
                    key={plan.id}
                    className={`plan-list-row ${selectedId === plan.id ? 'selected' : ''} ${plan.enabled ? '' : 'off'}`}
                    onClick={() => onSelect(plan.id)}
                >
                    <span className="plan-list-priority num">{index + 1}</span>
                    <div className="plan-list-text">
                        <div className="plan-list-name" title={plan.name}>{plan.name}</div>
                        <div className="plan-list-meta">
                            {plan.skillCount} skill{plan.skillCount === 1 ? '' : 's'}
                            {plan.skillCount > 0 && ` · ${DateTimeHelper.niceCountdown(plan.time)}`}
                        </div>
                    </div>

                    <div className="plan-list-controls" onClick={e => e.stopPropagation()}>
                        <button
                            type="button"
                            className="icon-button"
                            title="Higher priority"
                            disabled={index === 0}
                            onClick={() => onMove(plan.id, -1)}
                        >
                            <i className="material-icons">keyboard_arrow_up</i>
                        </button>
                        <button
                            type="button"
                            className="icon-button"
                            title="Lower priority"
                            disabled={index === plans.length - 1}
                            onClick={() => onMove(plan.id, 1)}
                        >
                            <i className="material-icons">keyboard_arrow_down</i>
                        </button>
                        <Toggle
                            toggled={plan.enabled}
                            onToggle={(e, enabled) => onToggle(plan.id, enabled)}
                            title={plan.enabled ? 'In the training queue' : 'Not in the training queue'}
                            style={{width: 'auto', marginLeft: 4}}
                        />
                    </div>
                </div>
            )}
        </Panel>
    );
}
