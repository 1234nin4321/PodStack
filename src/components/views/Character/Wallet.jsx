'use strict';

import React from 'react';

import CharacterModel from '../../../models/Character';
import FormatHelper from '../../../helpers/FormatHelper';
import ImageHelper from '../../../helpers/ImageHelper';
import Panel from '../../ui/Panel';
import ScopeNotice from '../../ui/ScopeNotice';
import StatTile from '../../ui/StatTile';

// rows shown before asking the user to narrow the search, to keep long journals responsive
const ROW_LIMIT = 300;

// "player_donation" -> "Player Donation"
function refTypeLabel(refType) {
    return (refType || '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatDate(date) {
    return new Date(date).toLocaleString(navigator.language, {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

function Isk({value}) {
    return (
        <span className={`num ${value > 0 ? 'isk-in' : value < 0 ? 'isk-out' : ''}`}>
            {value > 0 ? '+' : ''}{FormatHelper.number(value, 2)}
        </span>
    );
}

// The character's wallet journal and market transactions from the last 30 days, like EVE's own wallet window.
export default class Wallet extends React.Component {
    constructor(props) {
        super(props);

        this.state = {view: 'journal', query: ''};
    }

    renderJournal(char, query) {
        if (char.walletJournal === undefined) {
            return <div style={{padding: 16}}><ScopeNotice character={char} type="wallet_journal" scope="Read Wallet" what="the wallet journal"/></div>;
        }

        const entries = query === '' ? char.walletJournal : char.walletJournal.filter(e =>
            [refTypeLabel(e.ref_type), e.description, e.reason, e.first_party, e.second_party]
                .some(text => text && text.toLowerCase().includes(query))
        );
        if (entries.length === 0) {
            return <p className="empty" style={{margin: 0, padding: 16}}>{query !== '' ? 'Nothing matches.' : 'No wallet activity in the last 30 days.'}</p>;
        }

        return (
            <div>
                <table className="data-table wallet-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th className="right">Amount</th>
                            <th className="right">Balance</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.slice(0, ROW_LIMIT).map(e =>
                            <tr key={e.id}>
                                <td className="muted nowrap">{formatDate(e.date)}</td>
                                <td className="nowrap">{refTypeLabel(e.ref_type)}</td>
                                <td className="right nowrap"><Isk value={e.amount}/></td>
                                <td className="right num muted nowrap">{e.balance !== undefined ? FormatHelper.number(e.balance, 2) : ''}</td>
                                <td>
                                    {e.description}
                                    {e.reason && <div className="faint">{e.reason}</div>}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
                {entries.length > ROW_LIMIT && <p className="muted" style={{margin: 0, padding: '8px 16px'}}>Showing the latest {ROW_LIMIT} of {FormatHelper.number(entries.length)} entries. Search to narrow it down.</p>}
            </div>
        );
    }

    renderTransactions(char, query) {
        if (char.walletTransactions === undefined) {
            return <div style={{padding: 16}}><ScopeNotice character={char} type="wallet_transactions" scope="Read Wallet" what="market transactions"/></div>;
        }

        const transactions = query === '' ? char.walletTransactions : char.walletTransactions.filter(t =>
            [t.name, t.client, t.location].some(text => text && text.toLowerCase().includes(query))
        );
        if (transactions.length === 0) {
            return <p className="empty" style={{margin: 0, padding: 16}}>{query !== '' ? 'Nothing matches.' : 'No market transactions.'}</p>;
        }

        return (
            <div>
                <table className="data-table wallet-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Item</th>
                            <th className="right">Qty</th>
                            <th className="right">Price</th>
                            <th className="right">Total</th>
                            <th>Client</th>
                            <th>Where</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.slice(0, ROW_LIMIT).map(t =>
                            <tr key={t.id}>
                                <td className="muted nowrap">{formatDate(t.date)}</td>
                                <td>
                                    <span className="type-cell">
                                        <img src={ImageHelper.typeIcon(t.type_id, 32)} alt=""/>
                                        <span>{t.name}</span>
                                    </span>
                                </td>
                                <td className="right num">{FormatHelper.number(t.quantity)}</td>
                                <td className="right num muted nowrap">{FormatHelper.number(t.unit_price, 2)}</td>
                                <td className="right nowrap"><Isk value={(t.is_buy ? -1 : 1) * t.quantity * t.unit_price}/></td>
                                <td>{t.client || ''}</td>
                                <td className="muted">{t.location || ''}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
                {transactions.length > ROW_LIMIT && <p className="muted" style={{margin: 0, padding: '8px 16px'}}>Showing the latest {ROW_LIMIT} of {FormatHelper.number(transactions.length)} transactions. Search to narrow it down.</p>}
            </div>
        );
    }

    render() {
        const char = CharacterModel.get(this.props.characterId);
        const {view} = this.state;
        const query = this.state.query.trim().toLowerCase();
        const info = char.getDataRefreshInfo().find(c => c.type === (view === 'journal' ? 'Wallet Journal' : 'Wallet Transactions'));

        const journal = char.walletJournal || [];
        const income = journal.filter(e => e.amount > 0).reduce((sum, e) => sum + e.amount, 0);
        const expenses = journal.filter(e => e.amount < 0).reduce((sum, e) => sum + e.amount, 0);

        return (
            <div className="stack">
                <div className="stats">
                    <StatTile label="Balance" icon="account_balance_wallet" value={FormatHelper.number(char.balance, 2)} unit="ISK"/>
                    <StatTile label="Income (30 days)" icon="trending_up" value={FormatHelper.compact(income)} unit="ISK"/>
                    <StatTile label="Expenses (30 days)" icon="trending_down" value={FormatHelper.compact(-expenses)} unit="ISK"/>
                    <StatTile label="Net (30 days)" icon="balance" value={(income + expenses > 0 ? '+' : '') + FormatHelper.compact(income + expenses)} unit="ISK"
                              warn={income + expenses < 0}/>
                </div>

                <Panel
                    title={view === 'journal' ? 'Journal' : 'Transactions'}
                    icon={view === 'journal' ? 'receipt_long' : 'storefront'}
                    flush={true}
                    subtitle={info !== undefined ? `Updated ${info.lastRefresh}` : undefined}
                    actions={
                        <div className="seg">
                            <button type="button" className={view === 'journal' ? 'active' : ''} onClick={() => this.setState({view: 'journal'})}>Journal</button>
                            <button type="button" className={view === 'transactions' ? 'active' : ''} onClick={() => this.setState({view: 'transactions'})}>Transactions</button>
                        </div>
                    }
                >
                    <div className="asset-search">
                        <input
                            className="field"
                            type="search"
                            placeholder={view === 'journal' ? 'Search type, description or party…' : 'Search items, clients or locations…'}
                            value={this.state.query}
                            onChange={e => this.setState({query: e.target.value})}
                        />
                    </div>

                    {view === 'journal' ? this.renderJournal(char, query) : this.renderTransactions(char, query)}
                </Panel>
            </div>
        );
    }
}
