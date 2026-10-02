'use strict';

import React from 'react';

import CharacterModel from '../../../models/Character';
import FormatHelper from '../../../helpers/FormatHelper';

import Panel from '../../ui/Panel';
import SkillPips from '../../ui/SkillPips';

export default class Skills extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        const char = CharacterModel.get(this.props.characterId);

        if ((char.skillTree === undefined) || (char.skillTree.length === 0)) {
            return (
                <Panel title="Skills" icon="library_books">
                    <p className="empty">
                        Sorry, could not find this character's skill sheet, please try again after the next skills refresh
                        occurs (~15 minutes max).
                    </p>
                </Panel>
            );
        }

        const trained = char.skills.filter(s => s.trained_skill_level > 0).length;
        const maxed = char.skills.filter(s => s.trained_skill_level === 5).length;

        return (
            <div>
                <div className="stats">
                    <div className="panel stat">
                        <div className="stat-label">Skills Known</div>
                        <div className="stat-value num">{char.skills.length}</div>
                    </div>
                    <div className="panel stat">
                        <div className="stat-label">Trained</div>
                        <div className="stat-value num">{trained}</div>
                    </div>
                    <div className="panel stat">
                        <div className="stat-label">At Level V</div>
                        <div className="stat-value num" style={{color: 'var(--omega)'}}>{maxed}</div>
                    </div>
                    <div className="panel stat">
                        <div className="stat-label">Skill Groups</div>
                        <div className="stat-value num">{char.skillTree.length}</div>
                    </div>
                </div>

                <div className="masonry">
                    {char.skillTree.map(group =>
                        <Panel
                            key={group.name}
                            title={group.name}
                            subtitle={<span className="num">{FormatHelper.number(group.total_sp)} SP</span>}
                            collapsible={true}
                            flush={true}
                        >
                            {group.skills.map(skill =>
                                <div key={skill.skill_id} className={`skill-row ${skill.trained_skill_level === 0 ? 'untrained' : ''}`}>
                                    <span>{skill.skill_name}</span>
                                    <SkillPips level={skill.trained_skill_level} halfTrained={skill.half_trained}/>
                                    <span className="muted">
                                        {skill.trained_skill_level !== 0 ? `Level ${skill.trained_skill_level}` : 'Untrained'}
                                    </span>
                                    <span className="num muted" style={{textAlign: 'right'}}>
                                        {FormatHelper.number(skill.skillpoints_in_skill)} SP
                                    </span>
                                </div>
                            )}
                        </Panel>
                    )}
                </div>
            </div>
        );
    }
}
