'use strict';

import React from 'react';
import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';

import ImportExportHelper from '../../helpers/ImportExportHelper';
import NativeHelper from '../../helpers/NativeHelper';

// Paste a skill list (one "Skill Name IV" per line) to add to the open plan. Opens with the clipboard's text.
export default class PasteSkillsDialog extends React.Component {
    constructor(props) {
        super(props);

        this.state = {text: ''};
    }

    componentDidUpdate(prevProps) {
        if (this.props.open && !prevProps.open) {
            this.setState({text: ''});
            NativeHelper.readClipboard().then(text => this.props.open && this.setState({text}));
        }
    }

    render() {
        const {skills, unknown} = ImportExportHelper.ParseSkillText(this.state.text);

        const actions = [
            <FlatButton key="cancel" label="Cancel" primary={true} onClick={() => this.props.onClose()}/>,
            <FlatButton key="import" label={`Add ${skills.length} skill${skills.length === 1 ? '' : 's'}`} primary={true}
                        disabled={skills.length === 0} onClick={() => this.props.onImport(skills)}/>,
        ];

        const fromEve = this.props.source === 'eve';

        return (
            <Dialog
                title={fromEve ? 'Import EVE Skill Plan' : 'Paste Skill List'}
                actions={actions}
                modal={false}
                open={this.props.open}
                onRequestClose={() => this.props.onClose()}
                contentStyle={{width: 560}}
            >
                {fromEve ?
                    <p className="muted" style={{marginTop: 0}}>
                        In EVE, open the Skills window (Alt+X), go to Skill Plans and select the plan, then use the ☰ menu
                        at its top right and choose to copy it to the clipboard. Paste it below if it isn't shown already.
                        Skills you've already trained are skipped and missing prerequisites are added.
                    </p> :
                    <p className="muted" style={{marginTop: 0}}>
                        One skill per line, as copied from the EVE client, EVEMon or a forum post, e.g. "Caldari Cruiser IV" or
                        "Caldari Cruiser 4". Missing prerequisites are added too.
                    </p>
                }
                <textarea
                    className="fit-input"
                    style={{minHeight: 220}}
                    placeholder={'Spaceship Command III\nCaldari Frigate IV\nCaldari Cruiser 4'}
                    value={this.state.text}
                    onChange={e => this.setState({text: e.target.value})}
                />
                <div className="paste-summary">
                    <span style={{color: skills.length > 0 ? 'var(--good)' : undefined}}>{skills.length} recognised</span>
                    {unknown.length > 0 &&
                        <span style={{color: 'var(--warn)'}} title={unknown.join('\n')}>
                            {unknown.length} not recognised: {unknown.slice(0, 3).join(', ')}{unknown.length > 3 ? '…' : ''}
                        </span>
                    }
                </div>
            </Dialog>
        );
    }
}
