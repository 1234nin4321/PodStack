'use strict';

import React from 'react';

import CharacterModel from '../../../models/Character';
import PlanetsTable from '../../tables/PlanetsTable';
import Panel from '../../ui/Panel';
import ScopeNotice from '../../ui/ScopeNotice';

export default function Planets({characterId}) {
    const char = CharacterModel.get(characterId);
    const info = char.getDataRefreshInfo().find(c => c.type === 'Planetary Colonies');

    return (
        <Panel title="Planetary Industry" icon="public" flush={char.planets !== undefined}
               subtitle={info !== undefined ? `Updated ${info.lastRefresh}` : undefined}>
            {char.planets === undefined ?
                <ScopeNotice character={char} type="planets" scope="Read Planetary Colonies" what="planetary colonies"/> :
                <PlanetsTable characters={[char]}/>
            }
        </Panel>
    );
}
