'use strict';

import React from 'react';
import {Link} from 'react-router-dom';

import FontIcon from 'material-ui/FontIcon';
import MenuItem from 'material-ui/MenuItem';
import RaisedButton from 'material-ui/RaisedButton';
import SelectField from 'material-ui/SelectField';

import Character from '../../models/Character';
import AccountStore from '../../helpers/AccountStore';
import DateTimeHelper from '../../helpers/DateTimeHelper';
import QueueHealthHelper, {CRITICAL, WARNING, INFO, LOW_QUEUE_OPTIONS} from '../../helpers/QueueHealthHelper';
import PageHeader from '../ui/PageHeader';
import NewRenamePlanPopover from '../popovers/NewRenamePlanPopover';
import Panel from '../ui/Panel';
import StatTile from '../ui/StatTile';
import ConfirmHelper from '../../helpers/ConfirmHelper';

const UNASSIGNED = '';
const BADGE = {[CRITICAL]: 'danger', [WARNING]: 'warn', [INFO]: 'good'};
const hoursLabel = h => (h % 24 === 0 ? `${h / 24} day${h === 24 ? '' : 's'}` : `${h} hours`);

// Training status across every character, grouped into the accounts the user sets up, so idle queues, paused
// training and ready injectors are visible at once.
export default class QueueHealth extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            accounts: AccountStore.getAccounts(),
            lowQueueHours: QueueHealthHelper.getLowQueueHours(),

            // name popover for creating (account undefined) or renaming an account
            namePopoverOpen: false,
            namePopoverAnchor: undefined,
            namePopoverAccount: undefined,
        };
    }

    componentDidMount() {
        this.subscriberId = Character.subscribe(this);
        // countdowns and thresholds move with time even when no new data arrives
        this.timer = setInterval(() => this.forceUpdate(), 60000);
    }

    componentWillUnmount() {
        Character.unsubscribe(this.subscriberId);
        clearInterval(this.timer);
    }

    refreshAccounts() {
        this.setState({accounts: AccountStore.getAccounts()});
    }

    openNamePopover(anchor, account) {
        this.setState({namePopoverOpen: true, namePopoverAnchor: anchor, namePopoverAccount: account});
    }

    handleName(name) {
        const account = this.state.namePopoverAccount;
        this.setState({namePopoverOpen: false});

        if (name !== undefined && name.trim() !== '') {
            if (account === undefined) {
                AccountStore.createAccount(name.trim());
            } else {
                AccountStore.renameAccount(account.id, name.trim());
            }
            this.refreshAccounts();
        }
    }

    async handleDelete(account) {
        const confirmed = await ConfirmHelper.confirm({
            title: 'Delete account',
            message: `Delete "${account.name}"? Its characters become unassigned.`,
            confirmLabel: 'Delete',
            danger: true,
        });
        if (confirmed) {
            AccountStore.deleteAccount(account.id);
            this.refreshAccounts();
        }
    }

    handleAssign(characterId, accountId) {
        AccountStore.assign(characterId, accountId === UNASSIGNED ? undefined : accountId);
        this.forceUpdate();
    }

    renderCharacter(row) {
        const {character, health} = row;
        const current = character.getCurrentSkill();

        return (
            <div key={character.id} className="health-row">
                <img className="health-portrait" alt="" src={(character.portraits || {}).px64x64}/>

                <div className="health-text">
                    <Link to={`/characters/${character.id}`} className="health-name">{character.name}</Link>
                    <div className="health-meta">
                        {current !== undefined ?
                            <span>
                                Training {current.skill_name} · queue ends in{' '}
                                {DateTimeHelper.niceCountdown(health.queueEnds.getTime() - Date.now())}
                            </span> :
                            <span>Not training</span>
                        }
                    </div>
                </div>

                <div className="health-flags">
                    {health.flags.length === 0 ?
                        <span className="badge good">OK</span> :
                        health.flags.map((f, i) => <span key={i} className={`badge ${BADGE[f.level]}`}>{f.text}</span>)
                    }
                </div>

                <select
                    className="health-account-select"
                    value={AccountStore.getAccountId(character.id) || UNASSIGNED}
                    onChange={e => this.handleAssign(character.id, e.target.value)}
                    title="Account"
                >
                    <option value={UNASSIGNED}>No account</option>
                    {this.state.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
            </div>
        );
    }

    renderGroup(title, rows, account) {
        const training = rows.filter(r => r.health.training).length;
        const idle = account !== undefined && rows.length > 0 && training === 0;

        return (
            <Panel
                key={account ? account.id : 'unassigned'}
                title={title}
                icon={account ? 'account_circle' : 'help_outline'}
                flush={true}
                className={idle ? 'health-idle' : ''}
                subtitle={
                    <span className="health-group-subtitle">
                        {idle && <span className="badge danger">No character training</span>}
                        {rows.length > 0 && <span>{training} of {rows.length} training</span>}
                        {account &&
                            <span>
                                <button type="button" className="text-button" onClick={e => this.openNamePopover(e.currentTarget, account)}>Rename</button>
                                {' · '}
                                <button type="button" className="text-button" onClick={() => this.handleDelete(account)}>Delete</button>
                            </span>
                        }
                    </span>
                }
            >
                {rows.length === 0 ?
                    <p className="empty plan-list-empty">No characters yet. Pick this account in a character's dropdown.</p> :
                    rows.map(r => this.renderCharacter(r))
                }
            </Panel>
        );
    }

    render() {
        const rows = Object.values(Character.getAll())
            .map(character => ({character, health: QueueHealthHelper.check(character)}))
            .sort((a, b) => a.character.name.localeCompare(b.character.name));

        const count = test => rows.filter(r => r.health.flags.some(test)).length;
        const notTraining = rows.filter(r => !r.health.training).length;
        const lowQueue = count(f => f.level === WARNING);
        const injectors = count(f => f.level === INFO);
        const idleAccounts = this.state.accounts.filter(a => {
            const members = rows.filter(r => AccountStore.getAccountId(r.character.id) === a.id);
            return members.length > 0 && members.every(r => !r.health.training);
        }).length;

        const unassigned = rows.filter(r => !this.state.accounts.some(a => a.id === AccountStore.getAccountId(r.character.id)));

        return (
            <div>
                <PageHeader eyebrow="Command" title="Queue Health">
                    <SelectField
                        floatingLabelText="Flag queues ending within"
                        value={this.state.lowQueueHours}
                        onChange={(e, i, lowQueueHours) => {
                            QueueHealthHelper.setLowQueueHours(lowQueueHours);
                            this.setState({lowQueueHours});
                        }}
                        style={{width: 220, marginTop: -24}}
                    >
                        {LOW_QUEUE_OPTIONS.map(h => <MenuItem key={h} value={h} primaryText={hoursLabel(h)}/>)}
                    </SelectField>
                    <RaisedButton
                        label="New account"
                        primary={true}
                        onClick={e => this.openNamePopover(e.currentTarget, undefined)}
                        icon={<FontIcon className="material-icons">group_add</FontIcon>}
                    />
                </PageHeader>

                <NewRenamePlanPopover
                    open={this.state.namePopoverOpen}
                    anchorEl={this.state.namePopoverAnchor}
                    hint="Account name"
                    text={this.state.namePopoverAccount ? this.state.namePopoverAccount.name : `Account ${this.state.accounts.length + 1}`}
                    onNewName={name => this.handleName(name)}
                />

                <div className="stats">
                    <StatTile label="Not Training" icon="pause_circle" value={notTraining} warn={notTraining > 0}
                              foot={notTraining > 0 ? 'Paused or empty queues' : 'Every character is training'}/>
                    <StatTile label="Low Queues" icon="hourglass_bottom" value={lowQueue} warn={lowQueue > 0}
                              foot={`Ending within ${hoursLabel(this.state.lowQueueHours)}`}/>
                    <StatTile label="Idle Accounts" icon="no_accounts" value={idleAccounts} warn={idleAccounts > 0}
                              foot={`${this.state.accounts.length} account${this.state.accounts.length === 1 ? '' : 's'} set up`}/>
                    <StatTile label="Extraction" icon="opacity" value={injectors}
                              foot="Farms ready or due soon"/>
                </div>

                {this.state.accounts.length === 0 &&
                    <p className="muted health-intro">
                        EVE doesn't say which characters share an account. Use <strong>New account</strong> and pick an
                        account for each character to see when a whole account has nothing training.
                    </p>
                }

                <div className="stack">
                    {this.state.accounts.map(account => this.renderGroup(
                        account.name,
                        rows.filter(r => AccountStore.getAccountId(r.character.id) === account.id),
                        account,
                    ))}
                    {unassigned.length > 0 &&
                        this.renderGroup(this.state.accounts.length > 0 ? 'No Account' : 'Characters', unassigned)}
                </div>
            </div>
        );
    }
}
