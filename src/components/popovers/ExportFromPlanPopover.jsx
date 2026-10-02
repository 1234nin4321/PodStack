import React from 'react';
import Popover from 'material-ui/Popover';
import Menu from 'material-ui/Menu';
import MenuItem from 'material-ui/MenuItem';

import ImportExportHelper from '../../helpers/ImportExportHelper';
import DialogHelper from '../../helpers/DialogHelper';

import {colors} from '../theme';


const styles = {
    popover: {
        background: colors.panelRaised,
    },
};

export default class ExportFromPlanPopover extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            open: false,
            anchorEl: undefined,
        };
        this.handleRequestClose = this.handleRequestClose.bind(this);
        this.handlePlanJsonExport = this.handlePlanJsonExport.bind(this);
    }

    componentWillReceiveProps(nextProps) {
        if (nextProps.open !== this.props.open) {
            this.setState({ open: nextProps.open });
        }
        if (nextProps.anchorEl !== this.props.anchorEl) {
            this.setState({ anchorEl: nextProps.anchorEl });
        }
    }

    handleRequestClose() {
        this.setState({
            open: false,
        });
        this.props.onClose(undefined);
    }

    handlePlanJsonExport(file) {
        if (file !== undefined) {
            ImportExportHelper.ExportPlan(file,this.props.items);

            this.setState({
                open: false,
            });
            this.props.onClose();
        }
    }

    handlePlanJson() {
        DialogHelper.showSaveDialog({
            defaultPath: `${this.props.name}.podstack_plan`,
            filters: [
                { name: 'PodStack Skill Plans', extensions: ['podstack_plan'] },
                { name: 'All Files', extensions: ['*'] },
            ] }).then(this.handlePlanJsonExport);
    }

    // EVE's skill plan format, for Skills → Skill Plans → import in the EVE client
    handleEVEClipboard() {
        const count = ImportExportHelper.ExportClipboard(this.props.items);
        this.setState({open: false});
        this.props.onClose(`Copied ${count} skill ${count === 1 ? 'level' : 'levels'} as an EVE skill plan. In EVE, import it from the clipboard in the Skill Plans window.`);
    }

    handleEVEText() {
        DialogHelper.showSaveDialog({
            defaultPath: `${this.props.name || 'Skill plan'}.txt`,
            filters: [
                { name: 'Text Files', extensions: ['txt'] },
                { name: 'All Files', extensions: ['*'] },
            ] }).then(file => {
                if (file === undefined) {
                    return;
                }
                let message;
                try {
                    const count = ImportExportHelper.ExportEveText(file, this.props.items);
                    message = `Saved ${count} skill ${count === 1 ? 'level' : 'levels'} as an EVE skill plan. Copy the file's text and import it from the clipboard in EVE's Skill Plans window.`;
                } catch (e) {
                    message = `Couldn't save the file: ${e.message}`;
                }
                this.setState({open: false});
                this.props.onClose(message);
            });
    }

    render() {
        return (
            <Popover style={styles.popover}
                open={this.state.open}
                anchorEl={this.state.anchorEl}
                anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
                targetOrigin={{ horizontal: 'left', vertical: 'top' }}
                onRequestClose={this.handleRequestClose}
            >
                <Menu style={styles.menu} menuItemStyle={styles.menuItem} listStyle={styles.listItem}>
                    <MenuItem primaryText="PodStack Plan" onClick={() => this.handlePlanJson()} />
                    <MenuItem primaryText="EVE Skill Plan (copy to clipboard)" onClick={() => this.handleEVEClipboard()} />
                    <MenuItem primaryText="EVE Skill Plan (.txt file)" onClick={() => this.handleEVEText()} />
                </Menu>
            </Popover>
        );
    }
}
