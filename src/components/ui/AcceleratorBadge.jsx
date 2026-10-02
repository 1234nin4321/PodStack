'use strict';

import React from 'react';

import AcceleratorHelper from '../../helpers/AcceleratorHelper';
import DateTimeHelper from '../../helpers/DateTimeHelper';

// "+10 · 3d 4h left" next to a character's name while a cerebral accelerator is active.
export default function AcceleratorBadge({character}) {
    const status = AcceleratorHelper.status(character);
    if (status === undefined) {
        return null;
    }

    const left = status.remaining === undefined ? 'active' :
        status.remaining > 60000 ? `${DateTimeHelper.niceCountdown(status.remaining).split(' ').slice(0, 2).join(' ')} left` : 'ending';
    const title = `Cerebral accelerator +${status.bonus} to all attributes` +
        (status.item ? ` (${status.item.name}?)` : '') +
        (status.end ? `, ends around ${status.end.toLocaleString(navigator.language)}` : '') +
        '. Details on the Summary tab.';

    return (
        <span className="badge accel" title={title}>
            <i className="material-icons">bolt</i>+{status.bonus} · {left}
        </span>
    );
}
