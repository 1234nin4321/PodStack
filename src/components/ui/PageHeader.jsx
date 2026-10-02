'use strict';

import React from 'react';

export default function PageHeader({eyebrow, title, children}) {
    return (
        <header className="page-header">
            <div>
                {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
                <h1 className="page-title">{title}</h1>
            </div>

            {children && <div className="page-actions">{children}</div>}
        </header>
    );
}
