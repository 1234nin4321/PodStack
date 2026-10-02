'use strict';

import React from 'react';

import Character from '../../models/Character';
import FarmCharacter from '../../models/FarmCharacter';
import FormatHelper from '../../helpers/FormatHelper';

import AddFarmDialog from '../dialogs/AddFarmDialog';
import SpFarmingTable from '../tables/SpFarmingTable';
import FarmProfitPanel from '../tables/FarmProfitPanel';
import FarmProfitHelper from '../../helpers/FarmProfitHelper';
import PageHeader from '../ui/PageHeader';
import StatTile from '../ui/StatTile';

export default class SpFarming extends React.Component {
    constructor(props) {
        super(props);

        this.state = {prices: undefined};
    }

    componentDidMount() {
        this.subscriberId = FarmCharacter.subscribe(this);
    }

    componentWillUnmount() {
        FarmCharacter.unsubscribe(this.subscriberId);
    }

    render() {
        const farms = FarmCharacter.getAll()
            .map(farm => ({farm: farm, char: Character.get(farm.id)}))
            .filter(o => o.char !== undefined);
        const injectors = farms.reduce((sum, o) => sum + o.char.getInjectorsReady(o.farm.baseSp), 0);
        const spPerHour = farms.reduce((sum, o) => sum + o.char.getCurrentSpPerHour(), 0);
        const idle = farms.filter(o => o.char.getCurrentSkill() === undefined).length;
        const prices = this.state.prices;
        const profit = prices !== undefined && !Object.values(prices).some(p => p === null) ?
            farms.reduce((sum, o) => sum + FarmProfitHelper.forFarm(o.char, o.farm, prices, FarmProfitHelper.getSettings()).profit, 0) :
            undefined;

        return (
            <div>
                <PageHeader eyebrow="Industry" title="SP Farming">
                    <AddFarmDialog/>
                </PageHeader>

                <div className="stats">
                    <StatTile label="Farms" icon="opacity" value={farms.length}/>
                    <StatTile label="Injectors Ready" icon="vaccines" value={FormatHelper.number(injectors)}
                              foot="500,000 SP each"/>
                    <StatTile label="Combined Rate" icon="speed" value={FormatHelper.number(spPerHour)} unit="SP/h"
                              foot={`${FormatHelper.number(spPerHour * 24 * 30 / 500000, 1)} injectors / 30 days`}/>
                    <StatTile label="Idle Farms" icon="warning" value={idle} warn={idle > 0}
                              foot={idle > 0 ? 'Queues need attention' : 'All farms training'}/>
                    <StatTile label="Profit / 30 Days" icon="savings" value={profit !== undefined ? FormatHelper.compact(profit) : '—'}
                              unit={profit !== undefined ? 'ISK' : undefined} warn={profit !== undefined && profit < 0}
                              foot="After fees, extractors and subscriptions"/>
                </div>

                <SpFarmingTable/>
                <FarmProfitPanel onPrices={prices => this.setState({prices})}/>
            </div>
        );
    }
}
