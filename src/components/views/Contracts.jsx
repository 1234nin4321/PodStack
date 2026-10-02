'use strict';

import React from 'react';

import ContractsTable from '../tables/ContractsTable';
import Character from '../../models/Character';
import PageHeader from '../ui/PageHeader';
import Panel from '../ui/Panel';
import StatTile from '../ui/StatTile';

export default class Contracts extends React.Component {
    render() {
        const pending = Character.getAllContracts(false);
        const completed = Character.getAllContracts(true);
        const couriers = pending.filter(c => c.type === 'courier').length;

        return (
            <div>
                <PageHeader eyebrow="Industry" title="Contracts"/>

                <div className="stats">
                    <StatTile label="Active" icon="pending_actions" value={pending.length}/>
                    <StatTile label="Couriers In Flight" icon="local_shipping" value={couriers}/>
                    <StatTile label="Completed" icon="task_alt" value={completed.length}/>
                </div>

                <div className="stack">
                    <Panel title="Pending Contracts" icon="pending_actions" subtitle={`${pending.length} contracts`}>
                        <ContractsTable contracts={pending}/>
                    </Panel>

                    <Panel title="Completed Contracts" icon="task_alt" subtitle={`${completed.length} contracts`}>
                        <ContractsTable contracts={completed} complete={true}/>
                    </Panel>
                </div>
            </div>
        );
    }
}
