'use strict';

import React from 'react';

import Character from '../../models/Character';
import FormatHelper from '../../helpers/FormatHelper';
import MarketOrdersHelper from '../../helpers/MarketOrdersHelper';
import MarketOrdersTable from '../tables/MarketOrdersTable';
import PageHeader from '../ui/PageHeader';
import Panel from '../ui/Panel';
import StatTile from '../ui/StatTile';

// Every character's market orders on one page: what's open (and running out), and what ended in the last 90 days.
export default class MarketOrders extends React.Component {
    constructor(props) {
        super(props);

        this.state = {view: 'active', query: ''};
    }

    componentDidMount() {
        this.subscriberId = Character.subscribe(this);
    }

    componentWillUnmount() {
        Character.unsubscribe(this.subscriberId);
    }

    render() {
        const characters = Object.values(Character.getAll());
        const all = MarketOrdersHelper.allOrders(characters);
        const active = all.filter(o => o.order.state === 'active');
        const sells = active.filter(o => !o.order.is_buy_order);
        const buys = active.filter(o => o.order.is_buy_order);
        const sellValue = sells.reduce((sum, o) => sum + o.order.price * o.order.volume_remain, 0);
        const escrow = buys.reduce((sum, o) => sum + (o.order.escrow || 0), 0);
        const expiring = active.filter(o => MarketOrdersHelper.isExpiringSoon(o.order)).length;
        const missing = characters.filter(c => c.marketOrders === undefined).length;

        const {view} = this.state;
        const query = this.state.query.trim().toLowerCase();
        const rows = (view === 'active' ? active : all.filter(o => o.order.state !== 'active'))
            .filter(({character, order}) => query === '' ||
                [order.name, order.location, order.region, character.getDisplayName()].some(t => t && t.toLowerCase().includes(query)));

        return (
            <div>
                <PageHeader eyebrow="Trade" title="Market Overview"/>

                <div className="stats">
                    <StatTile label="Sell Orders" icon="sell" value={sells.length} foot={`${FormatHelper.compact(sellValue)} ISK listed`}/>
                    <StatTile label="Buy Orders" icon="shopping_cart" value={buys.length} foot={`${FormatHelper.compact(escrow)} ISK in escrow`}/>
                    <StatTile label="Expiring Today" icon="timer" value={expiring} warn={expiring > 0} foot="Open orders with under a day left"/>
                </div>

                <Panel
                    title={view === 'active' ? 'Open Orders' : 'Order History'}
                    icon={view === 'active' ? 'storefront' : 'history'}
                    flush={true}
                    subtitle={missing > 0 ? `${missing} character(s) need to re-authorize to show orders` : undefined}
                    actions={
                        <div className="seg">
                            <button type="button" className={view === 'active' ? 'active' : ''} onClick={() => this.setState({view: 'active'})}>Open</button>
                            <button type="button" className={view === 'history' ? 'active' : ''} onClick={() => this.setState({view: 'history'})}>History</button>
                        </div>
                    }
                >
                    <div className="asset-search">
                        <input className="field" type="search" placeholder="Search items, characters, stations or regions…"
                               value={this.state.query} onChange={e => this.setState({query: e.target.value})}/>
                    </div>

                    <MarketOrdersTable
                        rows={rows}
                        history={view !== 'active'}
                        showCharacter={true}
                        emptyText={query !== '' ? 'Nothing matches.' : view === 'active' ? 'No open orders.' : 'No orders ended in the last 90 days.'}
                    />
                </Panel>
            </div>
        );
    }
}
