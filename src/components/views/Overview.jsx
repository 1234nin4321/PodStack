'use strict';

import React from 'react';

import Character from '../../models/Character';
import FormatHelper from '../../helpers/FormatHelper';

import AddCharacterButton from '../buttons/AddCharacterButton';
import CharactersOverviewTable from '../tables/CharactersOverviewTable';
import PageHeader from '../ui/PageHeader';
import StatTile from '../ui/StatTile';

export default class Overview extends React.Component {
    componentDidMount() {
        this.subscriberId = Character.subscribe(this);
    }

    componentWillUnmount() {
        Character.unsubscribe(this.subscriberId);
    }

    render() {
        const characters = Object.values(Character.getAll());
        const totalSp = characters.reduce((sum, c) => sum + c.getTotalSp(), 0);
        const totalIsk = characters.reduce((sum, c) => sum + (c.balance || 0), 0);
        const omegas = characters.filter(c => c.isOmega() === true).length;
        const idle = characters.filter(c => c.getCurrentSkill() === undefined).length;

        return (
            <div>
                <PageHeader eyebrow="Command" title="Character Overview">
                    <AddCharacterButton/>
                </PageHeader>

                <div className="stats">
                    <StatTile label="Capsuleers" icon="group" value={characters.length} foot={`${omegas} Omega`}/>
                    <StatTile label="Skill Points" icon="psychology" value={FormatHelper.compact(totalSp)} unit="SP"
                              foot={`${FormatHelper.number(totalSp)} SP`}/>
                    <StatTile label="Net Worth" icon="account_balance_wallet" value={FormatHelper.compact(totalIsk)} unit="ISK"
                              foot="Combined wallet balance"/>
                    <StatTile label="Training" icon="schedule" value={`${characters.length - idle}/${characters.length}`}
                              warn={idle > 0} foot={idle > 0 ? `${idle} idle queue${idle === 1 ? '' : 's'}` : 'All queues active'}/>
                </div>

                <CharactersOverviewTable/>
            </div>
        );
    }
}
