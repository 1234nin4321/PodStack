'use strict';

import React from 'react';

import LinearProgress from 'material-ui/LinearProgress';

const mb = bytes => `${(bytes / 1048576).toFixed(bytes < 10 * 1048576 ? 1 : 0)} MB`;

function eta(status) {
    if (!status.speed || !status.total) {
        return '';
    }
    const seconds = Math.round((status.total - status.received) / status.speed);
    return seconds < 60 ? ` · ${seconds}s left` : ` · ${Math.ceil(seconds / 60)} min left`;
}

// Progress text and bar for an update that's downloading or installing (see src/updater.js for the status shape).
export default function UpdateProgress({status}) {
    if (status.status === 'downloading') {
        const percent = status.total ? Math.floor((status.received / status.total) * 100) : undefined;

        return (
            <div className="update-progress">
                <div className="update-progress-text">
                    <span>Downloading {status.version}{percent !== undefined && ` · ${percent}%`}</span>
                    <span className="num muted">
                        {status.total ? `${mb(status.received)} of ${mb(status.total)}` : mb(status.received || 0)}
                        {status.speed ? ` · ${mb(status.speed)}/s` : ''}
                        {eta(status)}
                    </span>
                </div>
                <LinearProgress mode={percent !== undefined ? 'determinate' : 'indeterminate'} value={percent} max={100}/>
            </div>
        );
    }

    if (status.status === 'installing') {
        return (
            <div className="update-progress">
                <div className="update-progress-text">
                    <span>Installing {status.version} · {status.percent || 0}%</span>
                </div>
                <LinearProgress mode="determinate" value={status.percent || 0} max={100}/>
            </div>
        );
    }

    return null;
}
