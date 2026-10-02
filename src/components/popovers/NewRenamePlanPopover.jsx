import React from 'react';
import Popover from 'material-ui/Popover';
import TextField from 'material-ui/TextField';
import {colors} from '../theme';

const styles = {
    popover: {
        background: colors.panelRaised,
    },
    margin10: {
        margin: 10,
    },
};

export default class NewRenamePlanPopover extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            open: false,
            anchorEl: undefined,
            text: this.props.text !== undefined ? this.props.text : '',
        };
        this.handleRequestClose = this.handleRequestClose.bind(this);
    }

    componentWillReceiveProps(nextProps) {
        if (nextProps.open !== this.props.open) {
            this.setState({ open: nextProps.open });
        }
        // start each opening from the given text (e.g. the current name when renaming)
        if (nextProps.open && !this.props.open) {
            this.setState({ text: nextProps.text !== undefined ? nextProps.text : '' });
        }
        if (nextProps.anchorEl !== this.props.anchorEl) {
            this.setState({ anchorEl: nextProps.anchorEl });
        }
    }


    handleRequestClose() {
        this.setState({
            open: false,
        });
        if (this.state.text !== undefined && this.state.text.length > 0) {
            this.props.onNewName(this.state.text);
        } else {
            this.props.onNewName(undefined);
        }
    }

    render() {
        return (
            <Popover style={styles.popover}
                open={this.state.open}
                anchorEl={this.state.anchorEl}
                style={{ background: colors.panelRaised }}
                onRequestClose={this.handleRequestClose}
            >
                <div style={styles.margin10}>
                    <TextField
                        id={'text-field-controlled'}
                        hintText={this.props.hint || 'Plan Name'}
                        onChange={(e) => this.setState({ text: e.target.value })}
                        value={this.state.text}
                        onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                                this.handleRequestClose();
                                e.preventDefault();
                            }
                        }}
                    />
                </div>
            </Popover>
        );
    }
}
