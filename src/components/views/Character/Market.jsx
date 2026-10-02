'use strict';

import React from 'react';

import CharacterModel from '../../../models/Character';
import FormatHelper from '../../../helpers/FormatHelper';
import Panel from '../../ui/Panel';
import ScopeNotice from '../../ui/ScopeNotice';
import StatTile from '../../ui/StatTile';
import MarketOrdersTable from '../../tables/MarketOrdersTable';

// Buy and sell orders, like the Orders tab of EVE's market window: what's still open, and what ended in the last 90 days.
export default class Market extends React.Component {
    constructor(props) {
        super(props);

        this.state = {view: 'active', query: ''};
    }

    render() {
        const char = CharacterModel.get(this.props.characterId);
        const info = char.getDataRefreshInfo().find(c => c.type === 'Market Orders');

        if (char.marketOrders === undefined) {
            return (
                <Panel title="Market Orders" icon="storefront">
                    <ScopeNotice character={char} type="market_orders" scope="Read Market Orders" what="market orders"/>
                </Panel>
            );
        }

        const {view} = this.state;
        const query = this.state.query.trim().toLowerCase();
        const active = char.marketOrders.filter(o => o.state === 'active');
        const sells = active.filter(o => !o.is_buy_order);
        const buys = active.filter(o => o.is_buy_order);
        const sellValue = sells.reduce((sum, o) => sum + o.price * o.volume_remain, 0);
        const buyValue = buys.reduce((sum, o) => sum + o.price * o.volume_remain, 0);
        const escrow = buys.reduce((sum, o) => sum + (o.escrow || 0), 0);

        const orders = (view === 'active' ? active : char.marketOrders.filter(o => o.state !== 'active'))
            .filter(o => query === '' || [o.name, o.location, o.region].some(t => t && t.toLowerCase().includes(query)));

        return (
            <div className="stack">
                <div className="stats">
                    <StatTile label="Sell Orders" icon="sell" value={sells.length} foot={`${FormatHelper.compact(sellValue)} ISK listed`}/>
                    <StatTile label="Buy Orders" icon="shopping_cart" value={buys.length} foot={`${FormatHelper.compact(buyValue)} ISK to buy`}/>
                    <StatTile label="In Escrow" icon="lock" value={FormatHelper.compact(escrow)} unit="ISK"/>
                </div>

                <Panel
                    title={view === 'active' ? 'Open Orders' : 'Order History'}
                    icon={view === 'active' ? 'storefront' : 'history'}
                    flush={true}
                    subtitle={info !== undefined ? `Updated ${info.lastRefresh}` : undefined}
                    actions={
                        <div className="seg">
                            <button type="button" className={view === 'active' ? 'active' : ''} onClick={() => this.setState({view: 'active'})}>Open</button>
                            <button type="button" className={view === 'history' ? 'active' : ''} onClick={() => this.setState({view: 'history'})}>History</button>
                        </div>
                    }
                >
                    <div className="asset-search">
                        <input className="field" type="search" placeholder="Search items, stations or regions…"
                               value={this.state.query} onChange={e => this.setState({query: e.target.value})}/>
                    </div>

                    <MarketOrdersTable
                        rows={orders.map(order => ({character: char, order}))}
                        history={view !== 'active'}
                        emptyText={query !== '' ? 'Nothing matches.' : view === 'active' ? 'No open orders.' : 'No orders ended in the last 90 days.'}
                    />
                </Panel>
            </div>
        );
    }
}
