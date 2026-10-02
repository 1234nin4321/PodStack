'use strict';

import React from 'react';

export default function SkillPips({level, halfTrained}) {
    const pips = [];
    for (let i = 1; i <= 5; i++) {
        let cls = '';
        if (i <= level) {
            cls = 'on';
        } else if (halfTrained && i === level + 1) {
            cls = 'half';
        }
        pips.push(<i key={i} className={cls}/>);
    }

    return <span className={`pips ${level === 5 ? 'five' : ''}`}>{pips}</span>;
}
