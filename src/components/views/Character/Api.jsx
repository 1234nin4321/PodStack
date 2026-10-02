'use strict';

import React from 'react';

import CharacterModel from '../../../models/Character';
import AuthorizedCharacter from '../../../models/AuthorizedCharacter';
import DateTimeHelper from '../../../helpers/DateTimeHelper';

import Panel from '../../ui/Panel';

export default class Api extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        const char = CharacterModel.get(this.props.characterId);
        const auth = AuthorizedCharacter.get(this.props.characterId);
        const authStatus = (auth.lastRefresh.success !== false) || (auth.lastRefresh.shouldRetry !== false);
        const scopes = auth.getScopeInfo();

        return (
            <div className="grid-2">
                <Panel
                    title="Scopes Granted"
                    icon="verified_user"
                    subtitle={`${scopes.filter(s => s.isGranted).length} / ${scopes.length}`}
                    flush={true}
                >
                    <p className="muted" style={{margin: 0, padding: '12px 16px', borderBottom: '1px solid var(--line)'}}>
                        If you are missing any scopes, use the Authorize Character button on the character overview and
                        re-add this character.
                    </p>

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
