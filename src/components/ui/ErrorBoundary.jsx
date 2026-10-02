'use strict';

import React from 'react';
import {clipboard} from 'electron';
import log from 'electron-log';

import appProperties from '../../../resources/properties';

// Without this, an error while drawing any part of the UI unmounts all of it and leaves a blank window. Wrapped
// around an area, it shows what went wrong there instead (the rest keeps working), logs it, and lets the user retry
// or copy the details for a bug report. Give it a key that changes on navigation so leaving the page clears it.
export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);

        this.state = {error: undefined, componentStack: undefined, copied: false};
    }

    static getDerivedStateFromError(error) {
        return {error};
    }

    componentDidCatch(error, info) {
        const componentStack = info && info.componentStack;
        this.setState({componentStack});
        log.error(`[UI] ${this.props.area || 'Page'} crashed at ${window.location.hash}:`, error && error.stack ? error.stack : String(error),
            componentStack || '');
    }

    details() {
        const {error, componentStack} = this.state;
        return [
            `PodStack ${appProperties.version} (${navigator.platform})`,
            `Area: ${this.props.area || 'Page'} at ${window.location.hash || '#/'}`,
            '',
            error && error.stack ? error.stack : String(error),
            componentStack ? `\nComponents:${componentStack}` : '',
        ].join('\n');
    }

    copy() {
        clipboard.writeText(this.details());
        this.setState({copied: true});
        clearTimeout(this.copiedTimer);
        this.copiedTimer = setTimeout(() => this.setState({copied: false}), 2500);
    }

    componentWillUnmount() {
        clearTimeout(this.copiedTimer);
    }

    render() {
        const {error, copied} = this.state;
        if (error === undefined) {
            return this.props.children;
        }

        if (this.props.compact) {
            const fallback = (
                <div className="crash crash-compact" title={String(error && error.message)}>
                    <i className="material-icons">error_outline</i>
                    <span>Couldn't show this.</span>
                    <button type="button" className="link-button" onClick={() => this.setState({error: undefined})}>Retry</button>
                </div>
            );
            // the navigation keeps its place on screen
            return this.props.nav ? <nav className="nav">{fallback}</nav> : fallback;
        }

        return (
            <div className="panel crash">
                <div className="crash-head">
                    <i className="material-icons">error_outline</i>
                    <strong>{this.props.title || 'This page couldn\'t be shown'}</strong>
                </div>
                <p className="muted">
                    Something went wrong while showing it. The rest of PodStack still works. If it keeps happening, copy
                    the details below into a bug report on GitHub.
                </p>
                <code className="crash-message">{error && error.message ? error.message : String(error)}</code>
                <div className="crash-actions">
                    <button type="button" className="grant-button" onClick={() => this.setState({error: undefined})}>
                        <i className="material-icons">refresh</i>Try again
                    </button>
                    <button type="button" className="link-button" onClick={() => this.copy()}>
                        {copied ? 'Copied' : 'Copy error details'}
                    </button>
                    <button type="button" className="link-button" onClick={() => window.location.reload()}>Reload PodStack</button>
                </div>
            </div>
        );
    }
}
