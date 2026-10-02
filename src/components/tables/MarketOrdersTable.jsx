'use strict';

import React from 'react';
import {Link} from 'react-router-dom';

import FormatHelper from '../../helpers/FormatHelper';
import ImageHelper from '../../helpers/ImageHelper';
import DateTimeHelper from '../../helpers/DateTimeHelper';
import MarketOrdersHelper from '../../helpers/MarketOrdersHelper';

const ROW_LIMIT = 300;

const STATE_BADGES = {
    active: <span className="badge info">Active</span>,
    filled: <span className="badge good">Filled</span>,
    expired: <span className="badge">Expired</span>,
    cancelled: <span className="badge warn">Cancelled</span>,
};

function formatDate(date) {
    return new Date(date).toLocaleString(navigator.language, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});
}

/**
 * Market orders as [{character, order}]. history: ended orders (shows their state and issue date instead of the
 * time left); showCharacter: a column with each order's character.
 */
export default function MarketOrdersTable({rows, history, showCharacter, emptyText}) {
    if (rows.length === 0) {
        return <p className="empty" style={{margin: 0, padding: 16}}>{emptyText}</p>;
    }

    return (
        <div>
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th></th>
                        {showCharacter && <th>Character</th>}
                        <th className="right">Price</th>
                        <th className="right">Quantity</th>
                        <th>Where</th>
                        <th className="right">{history ? 'Issued' : 'Expires'}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.slice(0, ROW_LIMIT).map(({character, order: o}) => {
                        const expires = MarketOrdersHelper.expiresAt(o);
                        return (
                            <tr key={o.order_id}>
                                <td>
                                    <span className="type-cell">
                                        <img src={ImageHelper.typeIcon(o.type_id, 32)} alt=""/>
                                        <span>{o.name}</span>
                                    </span>
                                </td>
                                <td className="nowrap">
                                    <span className={`badge ${o.is_buy_order ? 'omega' : 'info'}`}>{o.is_buy_order ? 'Buy' : 'Sell'}</span>
                                    {history && <span style={{marginLeft: 6}}>{STATE_BADGES[o.state] || o.state}</span>}
                                </td>
                                {showCharacter &&
                                    <td className="nowrap">
                                        <Link to={`/characters/${character.id}`} className="type-cell">
                                            <img src={character.portraitUrl(32)} alt=""/>
                                            <span>{character.getDisplayName()}</span>
                                        </Link>
                                    </td>
                                }
                                <td className="right num nowrap">{FormatHelper.number(o.price, 2)}</td>
                                <td className="right num nowrap">{FormatHelper.number(o.volume_remain)} / {FormatHelper.number(o.volume_total)}</td>
                                <td className="muted">{o.location || o.region || ''}</td>
                                <td className="right muted nowrap">
                                    {history ? formatDate(o.issued) :
                                        <span title={expires.toLocaleString(navigator.language)}
                                              style={MarketOrdersHelper.isExpiringSoon(o) ? {color: 'var(--warn)'} : undefined}>
                                            {DateTimeHelper.timeUntil(expires)}
                                        </span>}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {rows.length > ROW_LIMIT &&
                <p className="muted" style={{margin: 0, padding: '8px 16px'}}>Showing {ROW_LIMIT} of {FormatHelper.number(rows.length)}. Search to narrow it down.</p>}
        </div>
    );
}
