'use strict';

import React from 'react';

import Checkbox from 'material-ui/Checkbox';
import IconButton from 'material-ui/IconButton';
import FontIcon from 'material-ui/FontIcon';
import Popover from 'material-ui/Popover';
import {Table, TableBody, TableHeader, TableHeaderColumn, TableRow, TableRowColumn, TableFooter} from 'material-ui/Table';

import { SortableContainer, SortableElement } from 'react-sortable-hoc';

import DateHelper from '../../helpers/DateTimeHelper';
import AllSkills from '../../../resources/all_skills';
import {colors} from '../theme';

const styles = {
    planRow: {
        height: 20,
    },
    planRowHighlight: {
        height: 20,
        background: colors.panelRaised,
    },
    planRowColumn: {
        height: 20,
        paddingRight: 6,
        paddingLeft: 6,
        textTransform: 'capitalize',
    },
    planRowColumnBuffer: {
        height: 20,
        width: '0%',
        paddingRight: 6,
        paddingLeft: 6,
        textTransform: 'capitalize',
    },
    planRowColumnHidden: {
        height: 20,
        paddingRight: 0,
        paddingLeft: 0,
        visibility: 'hidden',
        width: 0,
    },
    // no fixed width: the skill name takes whatever is left (truncated with an ellipsis), so the time, comparison
    // and action columns always stay visible, even in a narrow window
    planRowColumnSkill: {
        position: 'relative',   // anchors the hover "+ Level N" button
        height: 20,
        minWidth: 140,
        paddingRight: 6,
        paddingLeft: 6,
    },
    // fixed widths for the optional text columns, so the skill name keeps the leftover space
    planRowColumnGroup: {
        height: 20,
        width: 150,
        paddingRight: 6,
        paddingLeft: 6,
        textTransform: 'capitalize',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
    },
    planRowColumnAttributes: {
        height: 20,
        width: 80,
        paddingRight: 6,
        paddingLeft: 6,
        textTransform: 'capitalize',
    },
    planRowColumnTime: {
        height: 20,
        width: 110,
        paddingRight: 6,
        paddingLeft: 6,
    },
    planRowColumnDelete: {
        height: 20,
        width: 20,
        paddingRight: 3,
        paddingLeft: 6,
    },
    planRowColumnCompare: {
        height: 20,
        width: 96,
        paddingRight: 6,
        paddingLeft: 6,
    },
    // header cells don't clip by default, so long text would run into the next column
    planRowColumnCompareHeader: {
        height: 20,
        width: 96,
        paddingRight: 6,
        paddingLeft: 6,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
    },
    planRowColumnSPh: {
        height: 20,
        width: 40,
        paddingRight: 6,
        paddingLeft: 6,
    },
    planRowColumnEdit: {
        height: 20,
        width: 20,
        paddingRight: 0,
        paddingLeft: 0,
    },
    deleteButton: {
        height: 20,
        width: 20,
        margin: 0,
        fontSize: 16,
        padding: 0,
    },
};

const LEVEL_NUMERALS = ['0', 'I', 'II', 'III', 'IV', 'V'];

// Comparison times rounded to the minute (seconds only under a minute), so they fit their columns.
function compareTime(ms) {
    return DateHelper.niceCountdown(ms >= 60000 ? Math.round(ms / 60000) * 60000 : ms);
}

// "Change" column for an implant/accelerator comparison: time saved (green, minus) or added (amber, plus).
function changeCell(base, compared) {
    const delta = compared - base;
    if (Math.abs(delta) < 30000) {
        return <span style={{color: 'var(--text-faint)'}}>—</span>;
    }
    return (
        <span style={{color: delta < 0 ? 'var(--good)' : 'var(--warn)'}}>
            {delta < 0 ? '−' : '+'}{compareTime(Math.abs(delta))}
        </span>
    );
}

const SortableItem = SortableElement(
    class SortableItemA extends React.PureComponent {
        constructor() {
            super();
            this.handleMouseDown = this.handleMouseDown.bind(this);
        }

        handleMouseDown(e) {
            if (e.target.innerText !== undefined && e.target.innerText === 'add' && this.props.onAddLevel !== undefined) {
                // the "+ Level N" button shown on hover
                e.stopPropagation();
                this.props.onAddLevel(this.props.idx);
            } else if (e.target.innerText !== undefined && e.target.innerText === 'delete') {
                this.props.onRemove(this.props.idx, e);
            } else if (e.target.innerText !== undefined && e.target.innerText === 'mode_edit') {
                this.props.onEdit(this.props.idx, e);
            } else {
                this.props.onMouseDown(this.props.idx, e);
            }
        }

        render() {
            const style = this.props.highlighted ? styles.planRowHighlight : styles.planRow;
            switch (this.props.value.type) {
                case 'skill': {
                    const nextLevel = this.props.value.level + 1;

                    return (
                        <TableRow selectable style={style} onMouseDown={this.handleMouseDown} className="plan-skill-row">
                            <TableRowColumn style={styles.planRowColumnSkill}>
                                {this.props.value.title}
                                {this.props.canAddLevel &&
                                    // the label comes from CSS (data-label), so the button's text stays "add" for the
                                    // click and drag checks
                                    <button type="button" className="plan-add-level" data-label={`Level ${LEVEL_NUMERALS[nextLevel]}`}
                                            title={`Add next level: ${this.props.value.name} ${LEVEL_NUMERALS[nextLevel]}`}>
                                        <i className="material-icons">add</i>
                                    </button>
                                }
                            </TableRowColumn>
                            <TableRowColumn style={this.props.columnTime}>
                                {DateHelper.niceCountdown(this.props.value.time)}
                            </TableRowColumn>
                            {this.props.compare &&
                                <TableRowColumn style={styles.planRowColumnCompare}>
                                    {compareTime(this.props.compare.times[`${this.props.value.id}:${this.props.value.level}`] || 0)}
                                </TableRowColumn>
                            }
                            {this.props.compare &&
                                <TableRowColumn style={styles.planRowColumnCompare}>
                                    {changeCell(this.props.value.time, this.props.compare.times[`${this.props.value.id}:${this.props.value.level}`] || 0)}
                                </TableRowColumn>
                            }
                            <TableRowColumn style={this.props.columnMarketGroup}>
                                {AllSkills.skills[this.props.value.id].market_group_name}
                            </TableRowColumn>
                            <TableRowColumn style={this.props.columnAttributes}>
                                {this.props.value.attributeTitle}
                            </TableRowColumn>
                            <TableRowColumn style={this.props.columnSPhs}>
                                {this.props.value.spHour}
                            </TableRowColumn>
                            <TableRowColumn style={this.props.columnLastRemap}>
                                {DateHelper.niceCountdown(this.props.value.lastRemap)}
                            </TableRowColumn>
                            <TableRowColumn style={styles.planRowColumnEdit}>
                            </TableRowColumn>
                            <TableRowColumn style={styles.planRowColumnDelete}>
                                <IconButton
                                    style={styles.deleteButton}
                                    iconStyle={styles.deleteButton}
                                >
                                    <FontIcon style={styles.deleteButton} className="material-icons">delete</FontIcon>
                                </IconButton>
                            </TableRowColumn>
                        </TableRow>
                    );
                }
                case 'note':
                case 'remap': {
                    return (
                        <TableRow selectable style={style} onMouseDown={this.handleMouseDown}>
                            <TableRowColumn style={styles.planRowColumnSkill}>
                                {this.props.value.title}
                            </TableRowColumn>
                            <TableRowColumn style={this.props.columnTime} />
                            {this.props.compare && <TableRowColumn style={styles.planRowColumnCompare} />}
                            {this.props.compare && <TableRowColumn style={styles.planRowColumnCompare} />}
                            <TableRowColumn style={this.props.columnMarketGroup} />
                            <TableRowColumn style={this.props.columnAttributes} />
                            <TableRowColumn style={this.props.columnSPhs} />
                            <TableRowColumn style={this.props.columnLastRemap} />
                            <TableRowColumn style={styles.planRowColumnEdit}>
                                <IconButton
                                    style={styles.deleteButton}
                                    iconStyle={styles.deleteButton}
                                >
                                    <FontIcon style={styles.deleteButton} className="material-icons">mode_edit</FontIcon>
                                </IconButton>
                            </TableRowColumn>
                            <TableRowColumn style={styles.planRowColumnDelete}>
                                <IconButton
                                    style={styles.deleteButton}
                                    iconStyle={styles.deleteButton}
                                >
                                    <FontIcon style={styles.deleteButton} className="material-icons">delete</FontIcon>
                                </IconButton>
                            </TableRowColumn>
                        </TableRow>
                    );
                }
                default: {
                    return (<TableRow />);
                }
            }
        }
    },
);

const SortableList = SortableContainer(
    class SortableListAnonymous extends React.Component {
        render() {
            return (
                <TableBody displayRowCheckbox={false}>
                    {this.props.items.map((value, index) => {
                        {
                            const highlighted = this.props.selection !== undefined ? this.props.selection.indexOf(index) > -1 : 0;
                            // offer the next level unless the skill is at V or that level is already planned
                            const canAddLevel = this.props.onAddLevel !== undefined && value.type === 'skill' && value.level < 5
                                && !this.props.items.some(i => i.type === 'skill' && i.id === value.id && i.level === value.level + 1);
                            return (
                                <SortableItem
                                    key={value.type === 'skill' ? `skill-${value.title}` : `item-${index}`}
                                    index={index}
                                    value={value}
                                    onRemove={this.props.onRemove}
                                    onMouseDown={this.props.onMouseDown}
                                    onEdit={this.props.onEdit}
                                    onAddLevel={this.props.onAddLevel}
                                    canAddLevel={canAddLevel}
                                    compare={this.props.compare}
                                    idx={index}
                                    highlighted={highlighted}
                                    columnTime={this.props.columnTime}
                                    columnMarketGroup={this.props.columnMarketGroup}
                                    columnAttributes={this.props.columnAttributes}
                                    columnSPhs={this.props.columnSPhs}
                                    columnLastRemap={this.props.columnLastRemap}
                                />
                            );
                        }
                    })
                    }
                </TableBody>
            );
        }
    },
);

// workaround for https://github.com/mui-org/material-ui/issues/6579
SortableList.muiName = 'TableBody';

export default class SkillPlanTable extends React.Component {
    // the Group column makes way for the two comparison columns, so the skill names keep enough room
    groupColumnStyle() {
        return this.props.compare ? styles.planRowColumnHidden : this.state.columnMarketGroupStyle;
    }

    constructor(props) {
        super(props);

        // start from the plan passed in: the table is created fresh when switching from the Training Queue to a plan,
        // and componentWillReceiveProps only sees later changes
        this.state = {
            items: props.items || [],
            totalTime: props.totalTime || 0,
            selection: [],
            columnTimeChecked: true,
            columnMarketGroupChecked: true,
            columnAttributesChecked: false,
            columnSPhsStyleChecked: false,
            columnLastRemapChecked: false,
            columnTimeStyle: styles.planRowColumnTime,
            columnMarketGroupStyle: styles.planRowColumnGroup,
            columnAttributesStyle: styles.planRowColumnHidden,
            columnSPhsStyle: styles.planRowColumnHidden,
            columnLastRemapStyle: styles.planRowColumnHidden,
        };

        this.handleColumnEditRequestClose = this.handleColumnEditRequestClose.bind(this);

        this.handleSortEnd = this.handleSortEnd.bind(this);
        this.handleDelete = this.handleDelete.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.shouldCancelStart = this.shouldCancelStart.bind(this);
    }

    componentWillReceiveProps(nextProps) {
        if (nextProps.items !== this.props.items) {
            this.setState({ items: nextProps.items });
        }
        if (nextProps.totalTime !== this.props.totalTime) {
            this.setState({ totalTime: nextProps.totalTime });
        }
    }

    handleDelete(index, e) {
        this.props.onRemove(index, e);
    }

    handleMouseDown(index, event) {
        let newSelection = this.state.selection;
        const testIndex = newSelection.indexOf(index);

        if (event.shiftKey && this.state.selection.length === 1) {
            if (newSelection[0] > index) {
                for (let i = index; i < newSelection[0]; i += 1) {
                    newSelection = newSelection.concat([i]);
                }
            } else {
                for (let i = index; i > newSelection[0]; i -= 1) {
                    newSelection = newSelection.concat([i]);
                }
            }
        } else if (event.ctrlKey || event.metaKey || this.state.selection.length === 0) {
            if (newSelection && testIndex !== -1) {
                newSelection.splice(testIndex, 1);
            } else {
                newSelection = newSelection.concat([index]);
            }
        } else if (testIndex === -1) {
            newSelection = [index];
        }
        this.setState({
            selection: newSelection.sort((a, b) => (a - b)),
        });
        event.preventDefault();
        return false;
    }

    handleSortEnd({ oldIndex, newIndex }) {
        this.props.onSkillMove(oldIndex, newIndex, this.state.selection);
        this.setState({ selection: [] });
    }

    shouldCancelStart(e) {
        // Prevent sorting from being triggered if target is input or button
        if (['delete', 'mode_edit', 'add'].indexOf(e.target.textContent.toLowerCase()) !== -1) {
            return true; // Return true to cancel sorting
        }
        return false;
    }

    handleColumnEditRequestClose() {
        this.setState({
            columnEditOpen: false,
        });
    }

    render() {
        return (
            <div>
                <Popover
                    open={this.state.columnEditOpen}
                    anchorEl={this.state.columnEditAnchor}
                    anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
                    targetOrigin={{ horizontal: 'right', vertical: 'top' }}
                    onRequestClose={this.handleColumnEditRequestClose}
                    style={{ background: colors.panelRaised }}
                >
                    <div style={{ margin: 10 }}>
                        <Checkbox
                            label="Time"
                            style={styles.checkbox}
                            checked={this.state.columnTimeChecked}
                            onCheck={(e, c) => this.setState({
                                columnTimeStyle: c ? styles.planRowColumnTime : styles.planRowColumnHidden,
                                columnTimeChecked: c,
                            })}
                        />
                        <Checkbox
                            label="Group"
                            style={styles.checkbox}
                            checked={this.state.columnMarketGroupChecked}
                            onCheck={(e, c) => this.setState({
                                columnMarketGroupStyle: c ? styles.planRowColumnGroup : styles.planRowColumnHidden,
                                columnMarketGroupChecked: c,
                             })}
                        />
                        <Checkbox
                            label="Attributes"
                            style={styles.checkbox}
                            checked={this.state.columnAttributesChecked}
                            onCheck={(e, c) => this.setState({
                                columnAttributesStyle: c ? styles.planRowColumnAttributes : styles.planRowColumnHidden,
                                columnAttributesChecked: c,
                             })}
                        />
                        <Checkbox
                            label="SP/h"
                            style={styles.checkbox}
                            checked={this.state.columnSPhsStyleChecked}
                            onCheck={(e, c) => this.setState({
                                columnSPhsStyle: c ? styles.planRowColumnSPh : styles.planRowColumnHidden,
                                columnSPhsStyleChecked: c,
                            })}
                        />
                        <Checkbox
                            label="Remap"
                            style={styles.checkbox}
                            checked={this.state.columnLastRemapChecked}
                            onCheck={(e, c) => this.setState({
                                columnLastRemapStyle: c ? styles.planRowColumn : styles.planRowColumnHidden,
                                columnLastRemapChecked: c,
                            })}
                        />
                    </div>
                </Popover>
                <Table style={{overflow: 'hidden'}}>
                    <TableHeader displaySelectAll={false} adjustForCheckbox={false}>
                        <TableRow style={styles.planRow}>
                            <TableHeaderColumn style={styles.planRowColumnSkill}>Skill</TableHeaderColumn>
                            <TableHeaderColumn style={this.state.columnTimeStyle}>Training Time</TableHeaderColumn>
                            {this.props.compare &&
                                <TableHeaderColumn style={styles.planRowColumnCompareHeader} tooltip={this.props.compare.label}>
                                    <span className="compare-header">With setup</span>
                                </TableHeaderColumn>
                            }
                            {this.props.compare &&
                                <TableHeaderColumn style={styles.planRowColumnCompareHeader}>Change</TableHeaderColumn>
                            }
                            <TableHeaderColumn style={this.groupColumnStyle()}>Group</TableHeaderColumn>
                            <TableHeaderColumn style={this.state.columnAttributesStyle}>Attributes</TableHeaderColumn>
                            <TableHeaderColumn style={this.state.columnSPhsStyle}>SP/h</TableHeaderColumn>
                            <TableHeaderColumn style={this.state.columnLastRemapStyle}>Since remap</TableHeaderColumn>
                            <TableHeaderColumn style={styles.planRowColumnEdit}></TableHeaderColumn>
                            <TableHeaderColumn style={styles.planRowColumnDelete}>
                                <IconButton
                                    style={styles.deleteButton}
                                    iconStyle={styles.deleteButton}
                                    onClick={e => this.setState({
                                        columnEditOpen: true,
                                        columnEditAnchor: e.currentTarget,
                                    })}
                                >
                                    <FontIcon style={styles.deleteButton} className="material-icons">keyboard_arrow_down</FontIcon>
                                </IconButton>
                            </TableHeaderColumn>
                        </TableRow>
                    </TableHeader>
                    <SortableList
                        items={this.state.items}
                        distance={1}
                        shouldCancelStart={this.shouldCancelStart}
                        selection={this.state.selection}
                        onEdit={this.props.onEdit}
                        onAddLevel={this.props.onAddLevel}
                        compare={this.props.compare}
                        onMouseDown={this.handleMouseDown}
                        onRemove={this.handleDelete}
                        onSortEnd={this.handleSortEnd}
                        columnTime={this.state.columnTimeStyle}
                        columnMarketGroup={this.groupColumnStyle()}
                        columnAttributes={this.state.columnAttributesStyle}
                        columnSPhs={this.state.columnSPhsStyle}
                        columnLastRemap={this.state.columnLastRemapStyle}
                    />
                    <TableFooter style={styles.planRow} adjustForCheckbox={false}>
                        <TableRow style={styles.planRow}>
                            <TableHeaderColumn style={styles.planRowColumnSkill}>
                                {
                                    this.state.selection && this.state.selection.length > 1 ?
                                    `${this.state.items.length} skills (${this.state.selection.length} selected - ${
                                        DateHelper.niceCountdown(
                                            this.state.selection.reduce(
                                                (totalTime, index) => (totalTime + (this.state.items[index] && this.state.items[index].type === 'skill' ? this.state.items[index].time : 0)), 0,
                                            ),
                                        )
                                    })`
                                    :
                                    `${this.state.items.length} skills`
                                }</TableHeaderColumn>
                            <TableHeaderColumn style={this.state.columnTimeStyle}>{DateHelper.niceCountdown(this.state.totalTime)}</TableHeaderColumn>
                            {this.props.compare &&
                                <TableHeaderColumn style={styles.planRowColumnCompareHeader}>{compareTime(this.props.compare.total)}</TableHeaderColumn>
                            }
                            {this.props.compare &&
                                <TableHeaderColumn style={styles.planRowColumnCompareHeader}>{changeCell(this.state.totalTime, this.props.compare.total)}</TableHeaderColumn>
                            }
                            <TableHeaderColumn style={this.groupColumnStyle()} />
                            <TableHeaderColumn style={this.state.columnAttributesStyle} />
                            <TableHeaderColumn style={this.state.columnSPhsStyle} />
                            <TableHeaderColumn style={this.state.columnLastRemapStyle} />
                            <TableHeaderColumn style={styles.planRowColumnEdit} />
                            <TableHeaderColumn style={styles.planRowColumnDelete} />
                        </TableRow>
                    </TableFooter>
                </Table>
            </div>
        );
    }
}
