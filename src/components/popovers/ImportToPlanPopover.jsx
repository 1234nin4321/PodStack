import React from 'react';
import Popover from 'material-ui/Popover';
import Menu from 'material-ui/Menu';
import MenuItem from 'material-ui/MenuItem';

import ImportExportHelper from '../../helpers/ImportExportHelper';
import DialogHelper from '../../helpers/DialogHelper';

const path = require('path');
import {colors} from '../theme';

const styles = {
    popover: {
        background: colors.panelRaised,
    },
};

export default class ImportToPlanPopover extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            open: false,
            anchorEl: undefined,
        };
        this.handleRequestClose = this.handleRequestClose.bind(this);
        this.handlePlanJsonImport = this.handlePlanJsonImport.bind(this);
        this.handleEVEMonXmlImport = this.handleEVEMonXmlImport.bind(this);
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
        this.props.onImport(undefined);
    }

    handlePlanJsonImport(files) {
        if (files !== undefined) {
            const fileName = path.basename(files[0]);
            const skills = ImportExportHelper.ImportPlan(files[0]);
            this.props.onImport(`Import of "${fileName}"`, 'PodStack JSON', skills);
            this.setState({
                open: false,
            });
        }
    }

    handleEVEMonXmlImport(files) {
        if (files !== undefined) {
            const fileName = path.basename(files[0]);
            const skills = ImportExportHelper.ImportEVEMonXML(files[0]);
            this.props.onImport(`Import of "${fileName}"`, 'EVEMon XML', skills);
            this.setState({
                open: false,
            });
        }
    }

    handleEVEMonXml() {
        DialogHelper.showOpenDialog({
            properties: [
                'openFile',
            ],
            filters: [
                { name: 'EVEMon Skill Plans', extensions: ['xml'] },
                { name: 'All Files', extensions: ['*'] },
            ] }).then(this.handleEVEMonXmlImport);
    }

    handlePlanJson() {
        DialogHelper.showOpenDialog({
            properties: [
                'openFile',
            ],
            filters: [
                // .cerebral_plan is the legacy extension for the same JSON format.
                { name: 'PodStack Skill Plans', extensions: ['podstack_plan', 'cerebral_plan'] },
                { name: 'All Files', extensions: ['*'] },
            ] }).then(this.handlePlanJsonImport);
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
                    <MenuItem primaryText="EVEMon Plan" onClick={() => this.handleEVEMonXml()} />
                    <MenuItem primaryText="Ship Fitting" onClick={() => this.props.onFitting()} />
                    <MenuItem primaryText="EVE In-Game Plan" onClick={() => this.props.onPaste('eve')} />
                    <MenuItem primaryText="Paste Skill List" onClick={() => this.props.onPaste('text')} />
                </Menu>
            </Popover>
        );
    }
}
