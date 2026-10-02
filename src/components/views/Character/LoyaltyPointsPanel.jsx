'use strict';

import React from 'react';

import FormatHelper from '../../../helpers/FormatHelper';
import ImageHelper from '../../../helpers/ImageHelper';
import LoyaltyHelper from '../../../helpers/LoyaltyHelper';
import Panel from '../../ui/Panel';

// The character's loyalty points per corporation and roughly what they're worth: LP spent on the corporation's best
// LP store offer and the item sold at Jita 4-4's lowest sell price (before taxes and fees). Click a corporation for
// its best offers.
export default class LoyaltyPointsPanel extends React.Component {
    constructor(props) {
        super(props);

        this.state = {offers: {}, open: undefined};
    }

    componentDidMount() {
        this.load();
    }

    componentDidUpdate(prevProps) {
        if (prevProps.character !== this.props.character) {
            this.load();
        }
    }

    componentWillUnmount() {
        this.unmounted = true;
    }

    load() {
        for (const lp of this.props.character.loyalty_points || []) {
            if (this.state.offers[lp.corporation_id] !== undefined) {
                continue;
            }
            LoyaltyHelper.bestOffers(lp.corporation_id)
                .then(offers => !this.unmounted && this.setState(state => ({offers: {...state.offers, [lp.corporation_id]: offers}})))
                .catch(() => !this.unmounted && this.setState(state => ({offers: {...state.offers, [lp.corporation_id]: []}})));
        }
    }

    render() {
        const lps = this.props.character.loyalty_points || [];
        const value = lp => {
            const offers = this.state.offers[lp.corporation_id];
            return offers !== undefined && offers.length > 0 ? lp.loyalty_points * offers[0].iskPerLp : undefined;
        };
        const total = lps.reduce((sum, lp) => sum + (value(lp) || 0), 0);
        const loading = lps.some(lp => this.state.offers[lp.corporation_id] === undefined);

        return (
            <Panel title="Loyalty Points" icon="stars" flush={true}
                   subtitle={lps.length > 0 ? (loading ? 'Pricing…' : `~${FormatHelper.compact(total)} ISK at Jita`) : undefined}>
                {lps.length === 0 && <div className="list-row empty">No loyalty points</div>}

                {lps.map(lp => {
                    const offers = this.state.offers[lp.corporation_id];
                    const open = this.state.open === lp.corporation_id;
                    const worth = value(lp);

                    return (
                        <div key={lp.corporation_id} className="asset-group">
                            <div className="asset-group-head" onClick={() => this.setState({open: open ? undefined : lp.corporation_id})}>
                                <i className={`material-icons chevron ${open ? 'open' : ''}`}>expand_more</i>
                                <img width={24} height={24} src={ImageHelper.corporationLogo(lp.corporation_id, 32)} alt=""/>
                                <span className="asset-group-name">{lp.corporation.name}</span>
                                <span className="num">{FormatHelper.number(lp.loyalty_points)} LP</span>
                                <span className="muted num lp-worth">
                                    {offers === undefined ? '…' : worth !== undefined ? `~${FormatHelper.compact(worth)} ISK` : 'No priced offers'}
                                </span>
                            </div>

                            {open && offers !== undefined && offers.length > 0 &&
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Best offers</th>
                                            <th className="right">LP</th>
                                            <th className="right">+ ISK</th>
                                            <th className="right">ISK / LP</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {offers.slice(0, 5).map(o =>
                                            <tr key={o.offer_id}>
                                                <td>
                                                    <span className="type-cell">
                                                        <img src={ImageHelper.typeIcon(o.type_id, 32)} alt=""/>
                                                        <span>
                                                            {o.quantity > 1 ? `${FormatHelper.number(o.quantity)} × ` : ''}{o.name}
                                                            {o.required_items.length > 0 &&
                                                                <div className="faint">needs {o.required_items.map(i => `${FormatHelper.number(i.quantity)} × ${i.name}`).join(', ')}</div>}
                                                        </span>
                                                    </span>
                                                </td>
                                                <td className="right num">{FormatHelper.number(o.lp_cost)}</td>
                                                <td className="right num muted">{o.isk_cost > 0 ? FormatHelper.compact(o.isk_cost) : '—'}</td>
                                                <td className="right num">{FormatHelper.number(o.iskPerLp, 0)}</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            }
                            {open && offers !== undefined && offers.length === 0 &&
                                <p className="faint" style={{margin: 0, padding: '6px 16px 10px 44px'}}>No offer from this store has a reliable Jita price.</p>}
                        </div>
                    );
                })}

                {lps.length > 0 &&
                    <p className="faint lp-note">Best offer's item at Jita 4-4 sell, minus its ISK and item costs, before taxes and fees.</p>}
            </Panel>
        );
    }
}
