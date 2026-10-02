'use strict';

import React from 'react';

export default function StatTile({label, icon, value, unit, foot, warn}) {
    return (
        <div className={`panel stat ${warn ? 'warn' : ''}`}>
            <div className="stat-label">
                {icon && <i className="material-icons">{icon}</i>}
                {label}
            </div>
            <div className="stat-value num">
                {value}
                {unit && <small>{unit}</small>}
            </div>
            {foot && <div className="stat-foot">{foot}</div>}
        </div>
    );
}
