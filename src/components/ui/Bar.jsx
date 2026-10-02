'use strict';

import React from 'react';

export default function Bar({value, variant}) {
    const pct = Math.max(0, Math.min(1, value || 0)) * 100;

    return (
        <div className={`bar ${variant || ''}`}>
            <span style={{width: `${pct}%`}}/>
        </div>
    );
}
