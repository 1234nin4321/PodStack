'use strict';

import React from 'react';

// Shown in place of data that needs an ESI scope the character's login doesn't have (or hasn't loaded yet).
export default function ScopeNotice({character, type, scope, what}) {
    const refresh = character.nextRefreshes[type];

    if (refresh !== undefined && refresh.error === 'scope') {
        return (
            <p className="empty" style={{margin: 0}}>
                This character's login doesn't include the "{scope}" permission. Use Authorize Character on the
                Character Overview and log in with this character again to grant it.
            </p>
        );
    }

    return <p className="empty" style={{margin: 0}}>Loading {what}… this happens on the next refresh.</p>;
}
