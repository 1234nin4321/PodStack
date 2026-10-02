'use strict';

import React from 'react';

import CharacterSelector from '../skillbrowser/CharacterSelector';
import DateHelper from '../../helpers/DateTimeHelper';
import FilteredSkillList from '../skillbrowser/FilteredSkillList';
import PlanCharacter from '../../models/PlanCharacter';
import SkillInfoCard from '../skillbrowser/SkillInfoCard';
import SkillTree from '../skillbrowser/SkillTree';
import PageHeader from '../ui/PageHeader';
import Panel from '../ui/Panel';


export default class SkillBrowser extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            selectedType: 0,
            characterId: 0,
        };

        this.handleSkillListSelection = this.handleSkillListSelection.bind(this);
        this.handleCharacterChange = this.handleCharacterChange.bind(this);
        this.queue = [];
    }

    handleSkillListSelection(selectedType) {
        this.setState({ selectedType: selectedType });
        if (this.state.characterId !== undefined && this.state.characterId !== 0) {
            this.planCharacter = new PlanCharacter(this.state.characterId);
            this.planCharacter.planSkill(selectedType, 1, 0);
            this.queue = this.planCharacter.queue;
        }
    }

    handleCharacterChange(value) {
        this.setState({ characterId: value });
    }

    render() {
        return (
            <div>
                <PageHeader eyebrow="Command" title="Skill Browser"/>

                <div className="split">
                    <div className="stack">
                        <Panel title="Pilot" icon="person">
                            <CharacterSelector onCharacterChange={this.handleCharacterChange} />
                        </Panel>
                        <Panel title="Skill Catalogue" icon="menu_book" flush={true} className="catalogue">
                            <FilteredSkillList characterId={this.state.characterId} onSkillSelectionChange={this.handleSkillListSelection} />
                        </Panel>
                    </div>

                    <div className="stack">
                        {this.state.selectedType !== 0 ?
                            <SkillInfoCard characterId={this.state.characterId} selectedType={this.state.selectedType} /> :
                            <Panel title="No Skill Selected" icon="school">
                                <p className="empty" style={{margin: 0}}>
                                    Pick a skill from the catalogue to see its prerequisites and training times.
                                    Select a pilot to compare against their skill sheet.
                                </p>
                            </Panel>
                        }

                        {this.state.selectedType !== 0 &&
                            <Panel title="Prerequisites" icon="account_tree">
                                <SkillTree characterId={this.state.characterId} selectedType={this.state.selectedType} />
                            </Panel>
                        }

                        {this.queue.length > 0 &&
                            <Panel title="Individual Skill Breakdown" icon="list" collapsible={true} initiallyOpen={false} flush={true}>
                                {this.queue.map((s, i) =>
                                    <div key={i} className="list-row">
                                        <span>{s.name} <strong>{s.level}</strong></span>
                                        <span className="num muted">{DateHelper.niceCountdown(s.time)}</span>
                                    </div>
                                )}
                            </Panel>
                        }
                    </div>
                </div>
            </div>
        );
    }
}
