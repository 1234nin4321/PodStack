'use strict';

import React from 'react';

import CharacterModel from '../../../models/Character';
import IndustryJobsTable from '../../tables/IndustryJobsTable';
import Panel from '../../ui/Panel';
import ScopeNotice from '../../ui/ScopeNotice';

export default function Industry({characterId}) {
    const char = CharacterModel.get(characterId);
    const info = char.getDataRefreshInfo().find(c => c.type === 'Industry Jobs');

    return (
        <Panel title="Industry Jobs" icon="precision_manufacturing" flush={char.industryJobs !== undefined}
               subtitle={info !== undefined ? `Updated ${info.lastRefresh}` : undefined}>
            {char.industryJobs === undefined ?
                <ScopeNotice character={char} type="industry_jobs" scope="Read Industry Jobs" what="industry jobs"/> :
                <IndustryJobsTable characters={[char]}/>
            }
        </Panel>
    );
}
