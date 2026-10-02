'use strict';

import React from 'react';

import CharacterModel from '../../../models/Character';
import appProperties from '../../../../resources/properties';

import ContractsTable from '../../tables/ContractsTable';
import Panel from '../../ui/Panel';

export default class Contracts extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        const char = CharacterModel.get(this.props.characterId);
        const contracts = char.contracts || [];
        const info = char.getDataRefreshInfo().find(c => c.type === 'Contracts');
        const lastUpdate = info !== undefined ? info.lastRefresh : 'not yet';

        return (
            <div className="stack">
                <Panel
                    title="Incomplete Contracts"
                    icon="pending_actions"
                    subtitle={`${char.contractSlotsUsed} / ${char.getMaxContracts()} slots · Updated ${lastUpdate}`}
                >
                    <ContractsTable contracts={contracts.filter(c => !appProperties.contract_completed_statuses.includes(c.status))}/>
                </Panel>

                <Panel title="Completed Contracts" icon="task_alt">
                    <ContractsTable
                        contracts={contracts.filter(c => appProperties.contract_completed_statuses.includes(c.status))}
                        complete={true}
                    />
                </Panel>
            </div>
        );
    }
}
