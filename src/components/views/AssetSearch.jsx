'use strict';

import React from 'react';
import {Link} from 'react-router-dom';

import Character from '../../models/Character';
import FormatHelper from '../../helpers/FormatHelper';
import ImageHelper from '../../helpers/ImageHelper';
import MarketHelper from '../../helpers/MarketHelper';
import PageHeader from '../ui/PageHeader';
import Panel from '../ui/Panel';
import StatTile from '../ui/StatTile';

const ROW_LIMIT = 500;
// shown before anything is searched for
const TOP_ITEMS = 50;

// Every character's assets in one search: "where is my Orca?" Values are EVE's universe-wide average prices, like
// the Assets tab (blueprint copies count as 0).
export default class AssetSearch extends React.Component {
    constructor(props) {
        super(props);

        this.state = {query: '', prices: undefined};
    }

    componentDidMount() {
        this.subscriberId = Character.subscribe(this);
        MarketHelper.getAveragePrices()
            .then(prices => !this.unmounted && this.setState({prices}))
            .catch(() => !this.unmounted && this.setState({prices: {}}));
    }

    componentWillUnmount() {
        this.unmounted = true;
        Character.unsubscribe(this.subscriberId);
    }

    value(asset) {
        const prices = this.state.prices || {};
        return asset.is_blueprint_copy ? 0 : (prices[asset.type_id] || 0) * asset.quantity;
    }

    render() {
        const characters = Object.values(Character.getAll());
        const loaded = characters.filter(c => c.assets !== undefined);
        const query = this.state.query.trim().toLowerCase();
        const label = a => a.custom_name ? `${a.custom_name} (${a.name})` : a.name;

        const rows = [];
        let total = 0;
        let count = 0;
        for (const character of loaded) {
            const byId = new Map(character.assets.map(a => [a.item_id, a]));
            for (const asset of character.assets) {
                total += this.value(asset);
                count++;

                const location = (character.assetLocations || {})[asset.root_location_id] || `Location #${asset.root_location_id}`;
                const parent = asset.parent_id !== undefined ? byId.get(asset.parent_id) : undefined;
                if (query === '' || label(asset).toLowerCase().includes(query) || location.toLowerCase().includes(query) ||
                    (parent !== undefined && label(parent).toLowerCase().includes(query))) {
                    rows.push({character, asset, location, parent});
                }
            }
        }
        rows.sort((a, b) => (this.value(b.asset) - this.value(a.asset)) || a.asset.name.localeCompare(b.asset.name));
        const shown = query === '' ? rows.slice(0, TOP_ITEMS) : rows.slice(0, ROW_LIMIT);
        const matchValue = rows.reduce((sum, r) => sum + this.value(r.asset), 0);
        const missing = characters.length - loaded.length;

        return (
            <div>
                <PageHeader eyebrow="Inventory" title="Asset Search"/>

                <div className="stats">
                    <StatTile label="Items" icon="inventory_2" value={FormatHelper.number(count)} foot={`${loaded.length} characters`}/>
                    <StatTile label="Estimated Value" icon="payments" value={this.state.prices !== undefined ? FormatHelper.compact(total) : '…'} unit="ISK"
                              foot="EVE average prices"/>
                    {query !== '' &&
                        <StatTile label="Matches" icon="search" value={FormatHelper.number(rows.length)}
                                  foot={this.state.prices !== undefined ? `~${FormatHelper.compact(matchValue)} ISK` : undefined}/>}
                </div>

                <Panel
                    title={query === '' ? 'Most Valuable Items' : 'Results'}
                    icon={query === '' ? 'diamond' : 'search'}
                    flush={true}
                    subtitle={missing > 0 ? `${missing} character(s) have no assets loaded (missing Read Assets?)` : undefined}
                >
                    <div className="asset-search">
                        <input className="field" type="search" autoFocus={true}
                               placeholder="Search every character: items, ship or container names, stations…"
                               value={this.state.query} onChange={e => this.setState({query: e.target.value})}/>
                    </div>

                    {shown.length === 0 ?
                        <p className="empty" style={{margin: 0, padding: 16}}>{query !== '' ? 'Nothing matches.' : 'No assets loaded yet.'}</p> :
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th className="right">Qty</th>
                                    <th>Character</th>
                                    <th>Where</th>
                                    <th className="right">Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map(({character, asset, location, parent}) =>
                                    <tr key={`${character.id}:${asset.item_id}`}>
                                        <td>
                                            <span className="type-cell">
                                                <img src={ImageHelper.typeIcon(asset.type_id, 32)} alt=""/>
                                                <span>
                                                    {label(asset)}
                                                    {asset.is_blueprint_copy && <span className="badge info" style={{marginLeft: 6}}>BPC</span>}
                                                </span>
                                            </span>
                                        </td>
                                        <td className="right num">{FormatHelper.number(asset.quantity)}</td>
                                        <td className="nowrap">
                                            <Link to={`/characters/${character.id}`} className="type-cell">
                                                <img src={character.portraitUrl(32)} alt=""/>
                                                <span>{character.getDisplayName()}</span>
                                            </Link>
                                        </td>
                                        <td>
                                            {location}
                                            {parent !== undefined && <div className="faint">in {label(parent)}</div>}
                                        </td>
                                        <td className="right num muted nowrap">
                                            {this.state.prices !== undefined && this.value(asset) > 0 ? `${FormatHelper.compact(this.value(asset))} ISK` : ''}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    }
                    {query !== '' && rows.length > ROW_LIMIT &&
                        <p className="muted" style={{margin: 0, padding: '8px 16px'}}>Showing the {ROW_LIMIT} most valuable of {FormatHelper.number(rows.length)} matches. Search more precisely to narrow it down.</p>}
                </Panel>
            </div>
        );
    }
}
