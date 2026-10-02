'use strict';

import React from 'react';
import {clipboard} from 'electron';

import FontIcon from 'material-ui/FontIcon';
import RaisedButton from 'material-ui/RaisedButton';

import PageHeader from '../ui/PageHeader';
import Panel from '../ui/Panel';
import appProperties from '../../../resources/properties';
import pkg from '../../../package.json';

const REPOSITORY = `https://github.com/${pkg.repository.replace(/^github:/, '')}`;
const ORIGINAL_PROJECT = 'https://github.com/PrometheusSatyen/Cerebral';

const HIGHLIGHTS = [
    {icon: 'hub', title: 'Fleet-wide command', text: 'Every capsuleer you fly on one screen: skill points, wallets, clones, queues and contracts, refreshed straight from New Eden.'},
    {icon: 'event_note', title: 'Precision skill planning', text: 'Stack plans by priority, merge them, sort for the fastest train and let the remap optimiser squeeze every last SP per hour out of your attributes.'},
    {icon: 'rocket_launch', title: 'Fit-to-fly in one paste', text: 'Drop in an EFT, Pyfa, XML or DNA fit and get a chronological plan that puts you in the hull first and unlocks the rest of the fit fastest.'},
    {icon: 'monitor_heart', title: 'Zero idle queues', text: 'Queue Health watches every account for paused training, short queues and ready injectors, so no character sits idle on your watch.'},
];

const MODERNISED = [
    'Moved to ESI\'s new versioning: requests carry a compatibility date and tenant instead of the old versioned routes and datasource parameter, so CCP\'s API changes don\'t silently break your data.',
    'Rebuilt the EVE SSO login for modern Electron: the login window now runs in the main process, as the old remote module it depended on no longer exists.',
    'Upgraded from Electron 4 (2019) to Electron 44, with a new build system and an installer that keeps itself up to date.',
    'A new Photon-style interface with themes, plus skill planning, fit planning, skillbook pricing, implant profiling and queue health.',
];

// About PodStack: what it is, where it came from, and how to support it.
export default class About extends React.Component {
    constructor(props) {
        super(props);

        this.state = {copied: false};
    }

    componentWillUnmount() {
        clearTimeout(this.copiedTimer);
    }

    copyDonationName() {
        clipboard.writeText(appProperties.donation_character);
        this.setState({copied: true});
        clearTimeout(this.copiedTimer);
        this.copiedTimer = setTimeout(() => this.setState({copied: false}), 2500);
    }

    render() {
        const donationCharacter = appProperties.donation_character;

        return (
            <div className="about">
                <PageHeader eyebrow="System" title="About"/>

                <section className="panel about-hero">
                    <img src="./../resources/icon.png" alt="" className="about-logo"/>
                    <div>
                        <div className="about-name">PodStack</div>
                        <div className="about-version">Version {appProperties.display_version}</div>
                        <p className="about-tagline">
                            The capsuleer command suite for pilots who run more than one clone. PodStack plugs straight
                            into the EVE Swagger Interface to give you real-time situational awareness across your
                            entire roster: skill queues, SP, ISK, contracts and mail, so you spend less time
                            alt-tabbing and more time undocking.
                        </p>
                        <div className="about-links">
                            <a href={REPOSITORY} target="_blank"><i className="material-icons">code</i>Source code</a>
                            <a href={`${REPOSITORY}/releases`} target="_blank"><i className="material-icons">new_releases</i>Releases</a>
                            <a href={`${REPOSITORY}/issues`} target="_blank"><i className="material-icons">bug_report</i>Report a bug</a>
                        </div>
                    </div>
                </section>

                <div className="about-highlights">
                    {HIGHLIGHTS.map(h =>
                        <div key={h.title} className="panel about-highlight">
                            <i className="material-icons">{h.icon}</i>
                            <div className="about-highlight-title">{h.title}</div>
                            <p>{h.text}</p>
                        </div>
                    )}
                </div>

                <div className="about-columns">
                    <Panel title="Heritage" icon="history_edu">
                        <p style={{marginTop: 0}}>
                            PodStack is a fork of <a href={ORIGINAL_PROJECT} target="_blank">Cerebral</a>, the
                            open-source EVE Online character manager, whose last release was in early 2019. Since
                            then EVE's login and APIs have moved on, so we brought it back into service:
                        </p>
                        <ul className="about-list">
                            {MODERNISED.map(item => <li key={item}>{item}</li>)}
                        </ul>
                        <p className="muted" style={{marginBottom: 0}}>
                            Like Cerebral, PodStack is free software under the{' '}
                            <a href="https://www.gnu.org/licenses/agpl-3.0" target="_blank">GNU AGPL v3</a>. Fly safe,
                            and thanks to everyone who built the original.
                        </p>
                    </Panel>

                    <Panel title="Support PodStack" icon="volunteer_activism" className="about-donate">
                        <p style={{marginTop: 0}}>
                            PodStack is free and always will be. If it's saved you a few hours of spreadsheet
                            wrangling (or an idle queue), an ISK donation keeps the developer in ships and the
                            updates coming.
                        </p>

                        {donationCharacter ?
                            <div className="about-donate-box">
                                <div>
                                    <div className="analysis-total-label">Send ISK in game to</div>
                                    <div className="about-donate-name">{donationCharacter}</div>
                                </div>
                                <RaisedButton
                                    label={this.state.copied ? 'Copied' : 'Copy name'}
                                    primary={!this.state.copied}
                                    onClick={() => this.copyDonationName()}
                                    icon={<FontIcon className="material-icons">{this.state.copied ? 'check' : 'content_copy'}</FontIcon>}
                                />
                            </div> :
                            <p className="empty">The donation character will be announced here soon.</p>
                        }

                        <p className="muted about-donate-steps">
                            In EVE: search for the character, right-click their name and choose <strong>Give
                            Money</strong>. Donations are gifts: they don't unlock anything, and every PodStack feature
                            stays free.
                        </p>
                    </Panel>
                </div>

                <p className="muted about-footer">
                    EVE Online and the EVE logo are the registered trademarks of CCP hf. All rights are reserved
                    worldwide. PodStack is a third-party tool and is not affiliated with or endorsed by CCP hf.
                </p>
            </div>
        );
    }
}
