'use strict';

import React from 'react';

export function CloneStateBadge({character}) {
    switch (character.isOmega()) {
        case true:
            return <span className="badge omega" title="Omega clone state">Ω Omega</span>;
        case false:
            return <span className="badge alpha" title="Alpha clone state">α Alpha</span>;
        default:
            return null;
    }
}

export function TokenStatusDot({auth}) {
    if (auth === undefined) {
        return null;
    }

    if (auth.lastRefresh.success === false) {
        return <span className="status-dot error" title="Token refresh failing — re-authorize this character"/>;
    }

    return auth.ssoVersion === 2 ?
        <span className="status-dot" title="Token healthy"/> :
        <span className="status-dot legacy" title="Token healthy (legacy SSO v1)"/>;
}
