'use strict';

import React from 'react';

import CharacterModel from '../../../models/Character';
import AuthorizedCharacter from '../../../models/AuthorizedCharacter';
import DateTimeHelper from '../../../helpers/DateTimeHelper';
import CharacterHelper from '../../../helpers/CharacterHelper';

import Panel from '../../ui/Panel';

export default class Api extends React.Component {
    constructor(props) {
        super(props);

        this.state = {removing: false, granting: undefined};
    }

    componentWillUnmount() {
        this.unmounted = true;
    }

    // Logs in with EVE again asking for every scope PodStack uses, which replaces this character's token.
    async handleGrantScopes(char) {
        this.setState({granting: {stage: 'login', message: 'Log in as ' + char.name + ' in the EVE window…'}});
        const id = await CharacterHelper.addCharacter(status => !this.unmounted && this.setState({granting: status}));
        if (this.unmounted) {
            return;
        }

        if (id !== undefined && id !== char.id) {
            const other = CharacterModel.get(id);
            alert(`You logged in as ${other !== undefined ? other.name : 'a different character'}, so that character was ` +
                `updated instead. To grant the missing permissions to ${char.name}, try again and pick ${char.name} on ` +
                'the EVE login page.');
        }
        this.setState({granting: undefined});
    }

    renderGrantButton(char, missing) {
        const granting = this.state.granting;
        if (granting !== undefined) {
            return <span className="muted grant-status">{granting.message || 'Waiting for EVE…'}</span>;
        }
        if (missing === 0) {
            return null;
        }

        return (
            <button type="button" className="grant-button" onClick={() => this.handleGrantScopes(char)}
                    title={`Log in with EVE again as ${char.name} to grant the ${missing} missing permission${missing === 1 ? '' : 's'}`}>
                <i className="material-icons">add_moderator</i>
                Add missing scopes
            </button>
        );
    }

    async handleRemove(char) {
        const confirmed = confirm(`Remove ${char.name} from PodStack?\n\n` +
            'This signs the character out of PodStack with EVE and deletes its data, skill plans and SP farm entry ' +
            'from this computer. You can add it again later with Authorize Character.');
        if (!confirmed) {
            return;
        }

        this.setState({removing: true});
        // leave the character's page first, so nothing renders a character that's gone
        window.location.hash = '#/';
        const revoked = await CharacterHelper.removeCharacter(char.id);
        if (!revoked) {
            alert(`${char.name} was removed from PodStack, but EVE couldn't be reached to revoke its login. ` +
                'To be sure, revoke PodStack under Third Party Applications on the EVE account management website.');
        }
    }

    render() {
        const char = CharacterModel.get(this.props.characterId);
        const auth = AuthorizedCharacter.get(this.props.characterId);
        const authStatus = (auth.lastRefresh.success !== false) || (auth.lastRefresh.shouldRetry !== false);
        const scopes = auth.getScopeInfo();
        const missing = scopes.filter(s => !s.isGranted).length;
        const unavailable = scopes.filter(s => !s.isGranted && CharacterHelper.unavailableScopes.includes(s.name));

        return (
            <div className="grid-2">
                <Panel
                    title="Scopes Granted"
                    icon="verified_user"
                    subtitle={`${scopes.length - missing} / ${scopes.length}`}
                    actions={this.renderGrantButton(char, missing - unavailable.length)}
                    flush={true}
                >
                    {missing > 0 && unavailable.length === 0 &&
                        <p className="muted" style={{margin: 0, padding: '12px 16px', borderBottom: '1px solid var(--line)'}}>
                            {missing} permission{missing === 1 ? ' is' : 's are'} missing, so some data can't load
                            {auth.usesLegacyClient() ? ' (this character was added with the older Cerebral login)' : ''}. Use
                            Add missing scopes and log in as {char.name} on the EVE page that opens.
                        </p>
                    }
                    {unavailable.length > 0 &&
                        <p style={{margin: 0, padding: '12px 16px', borderBottom: '1px solid var(--line)', color: 'var(--warn)'}}>
                            EVE's application for PodStack doesn't allow {unavailable.map(s => s.description).join(', ')} yet,
                            so {unavailable.length === 1 ? 'it' : 'they'} can't be granted. The rest work normally.
                        </p>
                    }

                    {scopes.map(scope =>
                        <div key={scope.name} className="list-row">
                            <span>{scope.description}</span>
                            {scope.isGranted ?
                                <span className="badge good">Granted</span> :
                                <span className="badge danger">Missing</span>
                            }
                        </div>
                    )}
                </Panel>

                <div className="stack">
                    <Panel title="API Health" icon="monitor_heart">
                        <dl className="kv">
                            <dt>SSO Version</dt>
                            <dd>v{auth.ssoVersion}</dd>
                            {auth.ssoVersion === 2 && <dt>EVE App</dt>}
                            {auth.ssoVersion === 2 &&
                                <dd>
                                    {auth.usesLegacyClient() ?
                                        <span title="Authorized before PodStack had its own EVE application. Use Add missing scopes to move it over.">
                                            <span className="badge warn">Cerebral (older login)</span>
                                        </span> :
                                        <span className="badge good">PodStack</span>
                                    }
                                </dd>
                            }
                            <dt>Token Status</dt>
                            <dd>
                                {authStatus ?
                                    <span className="badge good">OK</span> :
                                    <span className="badge danger">Dead — please re-authorize</span>
                                }
                            </dd>
                            <dt>Access Token</dt>
                            <dd className="faint">••••••••</dd>
                            <dt>Token Expiry</dt>
                            <dd>{DateTimeHelper.relativeTimeString(new Date(auth.accessTokenExpiry))}</dd>
                            <dt>Refresh Token</dt>
                            <dd className="faint">••••••••</dd>
                            {auth.lastRefresh.date !== undefined && <dt>Last Refresh</dt>}
                            {auth.lastRefresh.date !== undefined &&
                                <dd>
                                    {auth.lastRefresh.success !== false ?
                                        <span className="badge good">Success</span> :
                                        <span className="badge danger">Failure</span>
                                    }
                                    <span className="muted"> {DateTimeHelper.timeSince(new Date(auth.lastRefresh.date))} ago</span>
                                </dd>
                            }
                        </dl>
                    </Panel>

                    <Panel title="Remove Character" icon="person_remove">
                        <div className="remove-character">
                            <p className="muted" style={{margin: 0}}>
                                Signs this character out of PodStack with EVE and deletes its data, skill plans and SP
                                farm entry from this computer.
                            </p>
                            <button className="danger-button" type="button" disabled={this.state.removing}
                                    onClick={() => this.handleRemove(char)}>
                                <i className="material-icons">person_remove</i>
                                Remove
                            </button>
                        </div>
                    </Panel>

                    <Panel title="Data Refresh" icon="sync" flush={true}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Endpoint</th>
                                    <th className="right">Last</th>
                                    <th className="right">Next</th>
                                </tr>
                            </thead>

                            <tbody>
                                {char.getDataRefreshInfo().map(o =>
                                    <tr key={o.type}>
                                        <td>{o.type}</td>
                                        <td className="right num muted">{o.lastRefresh}</td>
                                        <td className="right num muted">{o.nextRefresh}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </Panel>
                </div>
            </div>
        );
    }
}
