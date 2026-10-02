'use strict';

import React from 'react';

export default class Panel extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            open: props.initiallyOpen !== false,
        };
    }

    toggle() {
        this.setState({open: !this.state.open});
    }

    render() {
        const {title, subtitle, icon, actions, collapsible, flush, className, style, children} = this.props;
        const open = !collapsible || this.state.open;
        const hasHeader = title !== undefined || actions !== undefined;

        return (
            <section className={`panel ${className || ''}`} style={style}>
                {hasHeader &&
                    <header
                        className={`panel-header ${collapsible ? 'clickable' : ''}`}
                        onClick={collapsible ? () => this.toggle() : undefined}
                    >
                        <div className="panel-title">
                            {icon && <i className="material-icons">{icon}</i>}
                            {title}
                        </div>

                        <div className="panel-subtitle">
                            {subtitle}
                            {actions}
                            {collapsible && <i className={`material-icons chevron ${open ? 'open' : ''}`}>expand_more</i>}
                        </div>
                    </header>
                }

                {open && <div className={`panel-body ${flush ? 'flush' : ''}`}>{children}</div>}
            </section>
        );
    }
}
