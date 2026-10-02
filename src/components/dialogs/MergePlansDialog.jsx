'use strict';

import React from 'react';

import Checkbox from 'material-ui/Checkbox';
import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import TextField from 'material-ui/TextField';

// Picks two or more plans and a name for the plan they're merged into. The plans are merged in priority order.
export default class MergePlansDialog extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            selected: [],
            name: '',
        };
    }

    componentWillReceiveProps(nextProps) {
        if (nextProps.open && !this.props.open) {
            this.setState({selected: [], name: ''});
        }
    }

    toggle(planId, checked) {
        this.setState(state => ({
            selected: checked ? [...state.selected, planId] : state.selected.filter(id => id !== planId),
        }));
    }

    render() {
        const {plans, open, onMerge, onClose} = this.props;
        const canMerge = this.state.selected.length >= 2 && this.state.name.trim() !== '';

        return (
            <Dialog
                title="Merge Plans"
                open={open}
                modal={false}
                onRequestClose={onClose}
                contentStyle={{width: 440}}
                autoScrollBodyContent={true}
                actions={[
                    <FlatButton key="cancel" label="Cancel" onClick={onClose}/>,
                    <FlatButton
                        key="merge"
                        label="Merge"
                        primary={true}
                        disabled={!canMerge}
                        onClick={() => onMerge(
                            // keep priority order regardless of the order they were ticked in
                            plans.filter(p => this.state.selected.includes(p.id)).map(p => p.id),
                            this.state.name.trim(),
                        )}
                    />,
                ]}
            >
                <p className="muted" style={{marginTop: 0}}>
                    Creates a new plan from the selected plans, in priority order. The originals are kept.
                </p>

                {plans.map(plan =>
                    <Checkbox
                        key={plan.id}
                        label={plan.name}
                        checked={this.state.selected.includes(plan.id)}
                        onCheck={(e, checked) => this.toggle(plan.id, checked)}
                        style={{marginBottom: 8}}
                    />
                )}

                <TextField
                    id="mergedPlanName"
                    floatingLabelText="New plan name"
                    value={this.state.name}
                    onChange={(e, name) => this.setState({name})}
                    fullWidth={true}
                />
            </Dialog>
        );
    }
}
