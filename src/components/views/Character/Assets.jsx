'use strict';

import React from 'react';

import CharacterModel from '../../../models/Character';
import FormatHelper from '../../../helpers/FormatHelper';
import ImageHelper from '../../../helpers/ImageHelper';
import MarketHelper from '../../../helpers/MarketHelper';
import Panel from '../../ui/Panel';
import ScopeNotice from '../../ui/ScopeNotice';

// rows shown per location before asking the user to narrow the search, to keep big hangars responsive
const ROW_LIMIT = 300;

// The character's assets, grouped by the station/structure/system they're in, with a search over item names,
// ship/container names and locations. Values are EVE's universe-wide average prices (blueprint copies count as 0).
export default class Assets extends React.Component {
    constructor(props) {
        super(props);

        this.state = {query: '', open: {}, prices: undefined};
    }

    componentDidMount() {
        MarketHelper.getAveragePrices()
            .then(prices => !this.unmounted && this.setState({prices}))
            .catch(() => !this.unmounted && this.setState({prices: {}}));
    }

    componentWillUnmount() {
        this.unmounted = true;
    }

    toggle(locationId) {
        this.setState({open: {...this.state.open, [locationId]: !this.state.open[locationId]}});
    }

    value(asset) {
        const prices = this.state.prices || {};
        return asset.is_blueprint_copy ? 0 : (prices[asset.type_id] || 0) * asset.quantity;
    }

    render() {
        const char = CharacterModel.get(this.props.characterId);
        const info = char.getDataRefreshInfo().find(c => c.type === 'Assets');

        if (char.assets === undefined) {
            return (
                <Panel title="Assets" icon="inventory_2">
                    <ScopeNotice character={char} type="assets" scope="Read Assets" what="assets"/>
                </Panel>
            );
        }

        const byId = new Map(char.assets.map(a => [a.item_id, a]));
        const label = a => a.custom_name ? `${a.custom_name} (${a.name})` : a.name;
        const query = this.state.query.trim().toLowerCase();

        // group by location; a location's name matching the search shows everything in it
        const groups = new Map();
        for (const asset of char.assets) {
            const locationName = char.assetLocations[asset.root_location_id] || `Location #${asset.root_location_id}`;
            const parent = asset.parent_id !== undefined ? byId.get(asset.parent_id) : undefined;
            const matches = query === '' ||
                label(asset).toLowerCase().includes(query) ||
                locationName.toLowerCase().includes(query) ||
                (parent !== undefined && label(parent).toLowerCase().includes(query));
            if (!matches) {
                continue;
            }

            if (!groups.has(asset.root_location_id)) {
                groups.set(asset.root_location_id, {id: asset.root_location_id, name: locationName, items: [], value: 0});
            }
            const group = groups.get(asset.root_location_id);
            group.items.push({asset, parent});
            group.value += this.value(asset);
        }

        const sorted = [...groups.values()].sort((a, b) => (b.value - a.value) || a.name.localeCompare(b.name));
        const total = char.assets.reduce((sum, a) => sum + this.value(a), 0);
        const shown = sorted.reduce((sum, g) => sum + g.items.length, 0);

        return (
            <Panel
                title="Assets"
                icon="inventory_2"
                flush={true}
                subtitle={
                    <span>
                        {FormatHelper.number(char.assets.length)} items
                        {this.state.prices !== undefined && ` · ~${FormatHelper.compact(total)} ISK`}
                        {info !== undefined && ` · Updated ${info.lastRefresh}`}
                    </span>
                }
            >
                <div className="asset-search">
                    <input
                        className="field"
                        type="search"
                        placeholder="Search items, ship names or locations…"
                        value={this.state.query}
                        onChange={e => this.setState({query: e.target.value})}
                    />
                    {query !== '' && <span className="muted">{FormatHelper.number(shown)} {shown === 1 ? 'match' : 'matches'} in {sorted.length} {sorted.length === 1 ? 'location' : 'locations'}</span>}
                </div>

                {sorted.length === 0 &&
                    <p className="empty" style={{margin: 0, padding: 16}}>{query !== '' ? 'Nothing matches.' : 'No assets.'}</p>}

                {sorted.map(group => {
                    // searching opens every matching location; otherwise locations open on click
                    const open = query !== '' ? this.state.open[group.id] !== false : this.state.open[group.id] === true;
                    const items = group.items.slice().sort((a, b) => (this.value(b.asset) - this.value(a.asset)) || a.asset.name.localeCompare(b.asset.name));

                    return (
                        <div key={group.id} className="asset-group">
                            <div className="asset-group-head" onClick={() => this.toggle(group.id)}>
                                <i className={`material-icons chevron ${open ? 'open' : ''}`}>expand_more</i>
                                <span className="asset-group-name">{group.name}</span>
                                <span className="muted num">
                                    {FormatHelper.number(group.items.length)} {group.items.length === 1 ? 'item' : 'items'}
                                    {this.state.prices !== undefined && ` · ${FormatHelper.compact(group.value)} ISK`}
                                </span>
                            </div>

                            {open &&
                                <table className="data-table">
                                    <tbody>
                                        {items.slice(0, ROW_LIMIT).map(({asset, parent}) =>
                                            <tr key={asset.item_id}>
                                                <td>
                                                    <span className="type-cell">
                                                        <img src={ImageHelper.typeIcon(asset.type_id, 32)} alt=""/>
                                                        <span>
                                                            {label(asset)}
                                                            {asset.is_blueprint_copy && <span className="badge info" style={{marginLeft: 6}}>BPC</span>}
                                                        </span>
                                                    </span>
                                                </td>
                                                <td className="muted">{parent !== undefined ? `in ${label(parent)}` : ''}</td>
                                                <td className="right num">{FormatHelper.number(asset.quantity)}</td>
                                                <td className="right num muted">
                                                    {this.state.prices !== undefined && this.value(asset) > 0 ? `${FormatHelper.compact(this.value(asset))} ISK` : ''}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            }
                            {open && items.length > ROW_LIMIT &&
                                <p className="muted" style={{margin: 0, padding: '8px 16px'}}>
                                    Showing the {ROW_LIMIT} most valuable of {FormatHelper.number(items.length)} items. Search to narrow it down.
                                </p>
                            }
                        </div>
                    );
                })}
            </Panel>
        );
    }
}
