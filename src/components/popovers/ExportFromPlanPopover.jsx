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

    handleEVEClipboard(){
        ImportExportHelper.ExportClipboard(this.props.items);
        this.setState({
            open: false,
        });
        this.props.onClose();
    }

    handleEVEClipboardShoppingList() {

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
                    <MenuItem primaryText="Clipboard (first 50)" onClick={() => this.handleEVEClipboard()} />
                    <MenuItem disabled primaryText="Clipboard (Shopping List)" onClick={() => this.handleEVEClipboardShoppingList()} />
                </Menu>
            </Popover>
        );
    }
}
