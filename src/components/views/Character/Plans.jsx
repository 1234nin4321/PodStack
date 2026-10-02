'use strict';

import React from 'react';

import FontIcon from 'material-ui/FontIcon';
import RaisedButton from 'material-ui/RaisedButton';

import ExportFromPlanPopover from '../../popovers/ExportFromPlanPopover';
import FitPlanner from './FitPlanner';
import ImplantProfilerPanel from './ImplantProfilerPanel';
import SkillbookPanel from './SkillbookPanel';
import PlanList, {TRAINING_QUEUE} from './PlanList';
import MergePlansDialog from '../../dialogs/MergePlansDialog';
import TrainingQueueTable from '../../tables/TrainingQueueTable';
import ImportExportHelper from '../../../helpers/ImportExportHelper';
import SkillPlanHelper from '../../../helpers/SkillPlanHelper';
import Popover from 'material-ui/Popover';
import Menu from 'material-ui/Menu';
import MenuItem from 'material-ui/MenuItem';
import RemapHelper from '../../../helpers/RemapHelper';
import TrainingProfileHelper from '../../../helpers/TrainingProfileHelper';
import Character from '../../../models/Character';
import FilteredSkillList from '../../skillbrowser/FilteredSkillList';
import ImportToPlanPopover from '../../popovers/ImportToPlanPopover';
import PasteSkillsDialog from '../../dialogs/PasteSkillsDialog';
import NewRenamePlanPopover from '../../popovers/NewRenamePlanPopover';
import NoteDialog from '../../dialogs/NoteDialog';
import PlanCharacter from '../../../models/PlanCharacter';
import AcceleratorHelper from '../../../helpers/AcceleratorHelper';
import PlanSkillPopover from '../../popovers/PlanSkillToLevelPopover';
import RemapDialog from '../../dialogs/RemapDialog';
import SkillPlanStore from '../../../helpers/SkillPlanStore';
import SkillPlanTable from '../../tables/SkillPlanTable';
import Panel from '../../ui/Panel';


const styles = {
    button: {
        minWidth: 0,
        height: 32,
        lineHeight: '32px',
    },
    // compact enough for the whole toolbar to fit on one row at the minimum window width
    buttonLabel: {
        fontSize: 12,
        letterSpacing: '0.03em',
        paddingLeft: 5,
        paddingRight: 9,
    },
    buttonIcon: {
        fontSize: 17,
        marginLeft: 8,
    },
};

export default class Plans extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            selectedType: 0,
            items: [],
            selection: [],
            totalTime: 0,
            selectedPlanId: undefined,

            skillPlans: SkillPlanStore.getSkillPlansForCharacter(this.props.characterId),
            skillPlanId: undefined,
            skillPlanName: undefined,

            planSkillPopoverOpen: false,
            planSkillPopoverAnchor: undefined,

            newSkillPopoverOpen: false,
            newSkillPopoverAnchor: undefined,

            renameSkillPopoverOpen: false,
            renameSkillPopoverAnchor: undefined,

            remapDialogOpen: false,
            remapAttribues: {},
            remapImplants: 0,

            fitPlannerOpen: false,
            mergeDialogOpen: false,
            implantsOpen: false,
            compareProfile: undefined,   // implant/accelerator setup picked in the Implants panel, compared per skill

            // the combined queue of all switched-on plans; shown instead of a plan while showQueue is set
            showQueue: false,
            queue: [],
            queueTime: undefined,
        };

        
        this.handleSkillSelected = this.handleSkillSelected.bind(this);
        this.handleSkillAdd = this.handleSkillAdd.bind(this);

        this.handleNoteAdd = this.handleNoteAdd.bind(this);
        this.handleRemapAdd = this.handleRemapAdd.bind(this);

        this.handleItemEdit = this.handleItemEdit.bind(this);

        this.handleItemMove = this.handleItemMove.bind(this);
        this.handleItemRemove = this.handleItemRemove.bind(this);
        this.handleAddNextLevel = this.handleAddNextLevel.bind(this);

        this.handleSkillPlanAdd = this.handleSkillPlanAdd.bind(this);
        this.handleSkillPlanChanged = this.handleSkillPlanChanged.bind(this);
        this.handleSkillPlanDuplicate = this.handleSkillPlanDuplicate.bind(this);
        this.handleSkillPlanRemove = this.handleSkillPlanRemove.bind(this);
        this.handleSkillPlanRename = this.handleSkillPlanRename.bind(this);
        this.handleImport = this.handleImport.bind(this);
        this.handleExportClose = this.handleExportClose.bind(this);
        this.handleFitAdded = this.handleFitAdded.bind(this);
        this.handleListSelect = this.handleListSelect.bind(this);
        this.handlePlanToggle = this.handlePlanToggle.bind(this);
        this.handlePlanMove = this.handlePlanMove.bind(this);
        this.handleMerge = this.handleMerge.bind(this);
        this.handleSort = this.handleSort.bind(this);
        this.handleCopyQueue = this.handleCopyQueue.bind(this);

        this.planCharacter = new PlanCharacter(this.props.characterId);
    }

    componentDidMount() {
        // open on the training queue when there are plans to combine
        if (this.state.skillPlans.length > 0) {
            this.showTrainingQueue();
        }
    }

    componentDidUpdate(prevProps, prevState) {
        // A plan was opened or edited: refresh the plan list's counts and the queue total. Deferred because some
        // handlers (e.g. drag-to-reorder) only save the plan after this runs.
        if (prevState.items !== this.state.items && !this.state.showQueue) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = setTimeout(() => this.setState({
                skillPlans: SkillPlanStore.getSkillPlansForCharacter(this.props.characterId),
                queueTime: SkillPlanHelper.buildTrainingQueue(this.props.characterId).time,
            }), 0);
        }
    }

    componentWillUnmount() {
        clearTimeout(this.refreshTimer);
    }

    showTrainingQueue() {
        const {queue, time} = SkillPlanHelper.buildTrainingQueue(this.props.characterId);
        this.setState({
            showQueue: true,
            queue,
            queueTime: time,
            skillPlans: SkillPlanStore.getSkillPlansForCharacter(this.props.characterId),
        });
    }

    handleListSelect(id) {
        if (id === TRAINING_QUEUE) {
            this.showTrainingQueue();
        } else {
            this.setState({showQueue: false});
            this.handleSkillPlanChanged(id);
        }
    }

    // Priority or on/off changed: refresh the list, and the queue if it's showing (else just its total).
    afterPlansChanged() {
        if (this.state.showQueue) {
            this.showTrainingQueue();
        } else {
            this.setState({
                skillPlans: SkillPlanStore.getSkillPlansForCharacter(this.props.characterId),
                queueTime: SkillPlanHelper.buildTrainingQueue(this.props.characterId).time,
            });
        }
    }

    handlePlanToggle(planId, enabled) {
        SkillPlanStore.setPlanEnabled(this.props.characterId, planId, enabled);
        this.afterPlansChanged();
    }

    handlePlanMove(planId, direction) {
        const ids = this.state.skillPlans.map(p => p.id);
        const from = ids.indexOf(planId);
        const to = from + direction;

        if (from === -1 || to < 0 || to >= ids.length) {
            return;
        }

        ids.splice(to, 0, ids.splice(from, 1)[0]);
        SkillPlanStore.setPlanOrder(this.props.characterId, ids);
        this.afterPlansChanged();
    }

    handleMerge(planIds, name) {
        this.setState({mergeDialogOpen: false});

        const newId = SkillPlanHelper.mergePlans(this.props.characterId, planIds, name);
        this.setState({showQueue: false});
        this.handleSkillPlanChanged(newId);
    }

    handleSort() {
        SkillPlanHelper.sortByTrainingTime(this.planCharacter);
        this.setState({
            items: this.planCharacter.queue,
            totalTime: this.planCharacter.time,
            selection: [],
        });
        SkillPlanStore.storeSkillPlan(
            this.props.characterId,
            this.state.skillPlanId,
            this.state.skillPlanName,
            this.planCharacter.queue,
        );
    }

    handleCopyQueue() {
        ImportExportHelper.ExportClipboard(this.state.queue);
    }

    componentWillReceiveProps(nextProps) {
        if (nextProps.characterId !== this.props.characterId) {
            if (nextProps.characterId !== undefined && nextProps.characterId !== 0) {
                this.planCharacter = new PlanCharacter(nextProps.characterId);
                this.setState({
                    totalTime: this.planCharacter.time,
                    items: this.planCharacter.queue,
                    skillPlans: SkillPlanStore.getSkillPlansForCharacter(nextProps.characterId),
                    skillPlanId: undefined,
                    skillPlanName: undefined,
                });
            }
        }
    }

    handleItemMove(oldIndex, newIndex, selected) {
        if (selected === undefined || selected.length <= 1) {
            this.planCharacter.moveQueuedItemByPosition(oldIndex, newIndex, true);
            this.setState({
                items: this.planCharacter.queue,
                totalTime: this.planCharacter.time,
                selection: [],
            });
            SkillPlanStore.storeSkillPlan(
                this.props.characterId,
                this.state.skillPlanId,
                this.state.skillPlanName,
                this.planCharacter.queue,
            );
        } else if (selected !== undefined || selected.length > 1) {
            this.planCharacter.moveQueuedItemsByPosition(oldIndex, newIndex, selected);
            this.setState({
                items: this.planCharacter.queue,
                totalTime: this.planCharacter.time,
                selection: [],
            });
            SkillPlanStore.storeSkillPlan(
                this.props.characterId,
                this.state.skillPlanId,
                this.state.skillPlanName,
                this.planCharacter.queue,
            );
        }
    }

    handleSkillSelected(selectedType, e) {
        if (this.state.showQueue) {
            return;
        }
        this.setState({
            planSkillPopoverAnchor: e.currentTarget,
            planSkillPopoverOpen: true,
            selectedType,
        });
    }

    handleSkillAdd(level, prereqs) {
        this.setState({ planSkillPopoverOpen: false });

        if (this.state.selectedType !== undefined && level !== undefined) {
            const preReqLevel = prereqs !== undefined && prereqs > 0 ? prereqs : 0;
            this.planCharacter.planSkill(this.state.selectedType, level, preReqLevel);
            this.setState({
                items: this.planCharacter.queue,
                totalTime: this.planCharacter.time,
            });
            SkillPlanStore.storeSkillPlan(
                this.props.characterId,
                this.state.skillPlanId,
                this.state.skillPlanName,
                this.planCharacter.queue,
            );
        }
    }

    // "+ Level N" on a skill row: asks whether the next level goes right after this one or at the end of the plan.
    // The menu opens once the click is over, or the click itself would close it again.
    handleAddNextLevel(index, anchorEl) {
        const open = () => setTimeout(() => this.setState({addLevelMenu: {index, anchorEl}}), 0);
        if (typeof document !== 'undefined') {
            document.addEventListener('mouseup', open, {once: true});
        } else {
            open();
        }
    }

    // Plans the next level of the skill at index, right after it ('after') or at the end of the plan ('end'), then
    // recalculates the plan's times.
    addNextLevel(index, position) {
        this.setState({addLevelMenu: undefined});
        const item = this.state.items[index];
        if (item === undefined || item.type !== 'skill' || item.level >= 5) {
            return;
        }

        const before = this.planCharacter.queue.length;
        this.planCharacter.planSkill(item.id, item.level + 1);
        const added = this.planCharacter.queue.slice(before);
        if (added.length === 0) {
            return;
        }

        if (position === 'after') {
            const queue = this.planCharacter.queue.slice(0, before);
            queue.splice(index + 1, 0, ...added);
            this.planCharacter.reset();
            queue.forEach(queued => this.planCharacter.addItemToQueue(queued));
        }

        SkillPlanStore.storeSkillPlan(
            this.props.characterId,
            this.state.skillPlanId,
            this.state.skillPlanName,
            this.planCharacter.queue,
        );
        this.setState({
            items: this.planCharacter.queue,
            totalTime: this.planCharacter.time,
            selection: [],
            // the plan list shows each plan's skill count and time
            skillPlans: SkillPlanStore.getSkillPlansForCharacter(this.props.characterId),
        });
    }

    handleItemRemove(index, e) {
        if (e.ctrlKey || e.metaKey === 0) {
            this.planCharacter.removeItemByPosition(index, true);
        } else {
            this.planCharacter.removeItemByPosition(index);
        }

        this.setState({
            items: this.planCharacter.queue,
            totalTime: this.planCharacter.time,
        });
        SkillPlanStore.storeSkillPlan(
            this.props.characterId,
            this.state.skillPlanId,
            this.state.skillPlanName,
            this.planCharacter.queue,
        );
    }

    handleRemapAdd(attributes, implants, index, second) {
        if (attributes !== undefined && second !== undefined) {
            // the first remap as usual, then the second one inserted after the skill the optimiser chose
            const queue = [...this.planCharacter.queue];
            if (index === undefined) {
                queue.unshift({type: 'remap', attributes, implants});
            } else {
                queue[index] = {type: 'remap', attributes, implants};
            }
            const after = queue.findIndex((item, i) => (index === undefined || i > index) &&
                item.type === 'skill' && item.id === second.afterSkill.id && item.level === second.afterSkill.level);
            if (after !== -1) {
                queue.splice(after + 1, 0, {type: 'remap', attributes: second.attributes, implants});
            }

            this.planCharacter.reset();
            queue.forEach(item => this.planCharacter.addItemToQueue(item));
            this.setState({items: this.planCharacter.queue, totalTime: this.planCharacter.time});
            SkillPlanStore.storeSkillPlan(
                this.props.characterId,
                this.state.skillPlanId,
                this.state.skillPlanName,
                this.planCharacter.queue,
            );
        } else if (attributes !== undefined) {
            if (index === undefined) {
                // a new remap happens now, so it goes at the start of the plan; times after it are recalculated
                const queue = [...this.planCharacter.queue];
                this.planCharacter.reset();
                this.planCharacter.addRemap(attributes, implants);
                queue.forEach(item => this.planCharacter.addItemToQueue(item));
                this.setState({ items: this.planCharacter.queue, totalTime: this.planCharacter.time });
                SkillPlanStore.storeSkillPlan(
                    this.props.characterId,
                    this.state.skillPlanId,
                    this.state.skillPlanName,
                    this.planCharacter.queue,
                );
            } else {
                this.planCharacter.editRemapAtPosition(attributes, implants, index);
                this.setState({
                    items: this.planCharacter.queue,
                    totalTime: this.planCharacter.time,
                });
                SkillPlanStore.storeSkillPlan(
                    this.props.characterId,
                    this.state.skillPlanId,
                    this.state.skillPlanName,
                    this.planCharacter.queue,
                );
            }
        }
        this.setState({
            remapDialogOpen: false,
            remapDialogEditIndex: undefined,
        });
    }

    handleNoteAdd(text, details, index) {
        if (text !== undefined) {
            if (index === undefined) {
                this.planCharacter.addNote(text, details);
                this.setState({ items: this.planCharacter.queue });
                SkillPlanStore.storeSkillPlan(
                    this.props.characterId,
                    this.state.skillPlanId,
                    this.state.skillPlanName,
                    this.planCharacter.queue,
                );
            } else {
                this.planCharacter.editNoteAtPosition(text, details, index);
                this.setState({
                    items: this.planCharacter.queue,
                    totalTime: this.planCharacter.time,
                });
                SkillPlanStore.storeSkillPlan(
                    this.props.characterId,
                    this.state.skillPlanId,
                    this.state.skillPlanName,
                    this.planCharacter.queue,
                );
            }
        }
        this.setState({
            noteDialogOpen: false,
            noteDialogEditIndex: undefined,
        });
    }

    handleItemEdit(index) {
        if (this.state.items[index] !== undefined && this.state.items[index].type === 'remap') {
            this.setState({
                remapAttribues: Object.assign({}, this.state.items[index].attributes),
                remapImplants: this.state.items[index].implants,
                remapDialogOpen: true,
                remapDialogEditIndex: index,
            });
        } else if (this.state.items[index] !== undefined && this.state.items[index].type === 'note') {
            this.setState({
                noteText: this.state.items[index].text,
                noteDetails: this.state.items[index].details,
                noteDialogOpen: true,
                noteDialogEditIndex: index,
            });
        }
    }

    handleSkillPlanAdd(name) {
        this.setState({
            newSkillPopoverOpen: false,
            newSkillPopoverAnchor: undefined,
        });
        if (name !== undefined) {
            this.planCharacter.reset();

            const newId = ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
                (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
            )

            SkillPlanStore.storeSkillPlan(this.props.characterId, newId, name, this.planCharacter.queue);
            this.setState({
                items: this.planCharacter.queue,
                totalTime: this.planCharacter.time,
                skillPlans: SkillPlanStore.getSkillPlansForCharacter(this.props.characterId),
                skillPlanId: newId,
                skillPlanName: name,
                showQueue: false,
            });
        }
    }

    // A new plan holding the character's skill queue in EVE (as last loaded from ESI): the levels not yet trained,
    // in the queue's order. A paused queue counts too.
    handleImportEveQueue() {
        this.setState({importToPlanPopoverOpen: false});

        const character = Character.get(this.props.characterId);
        const now = new Date();
        const entries = (character.skillQueue || [])
            .filter(entry => entry.finish_date === undefined || new Date(entry.finish_date) > now)
            .sort((a, b) => (a.queue_position || 0) - (b.queue_position || 0));
        if (entries.length === 0) {
            alert(`${character.getDisplayName()}'s skill queue in EVE is empty, so there's nothing to make a plan from.`);
            return;
        }

        this.planCharacter.reset();
        this.planCharacter.addNote('EVE skill queue', `Copied from the skill queue in EVE on ${now.toLocaleString(navigator.language)}`);
        entries.forEach(entry => this.planCharacter.planSkill(entry.skill_id, entry.finished_level));

        const id = crypto.randomUUID();
        const name = `EVE skill queue ${now.toLocaleDateString(navigator.language)}`;
        SkillPlanStore.storeSkillPlan(this.props.characterId, id, name, this.planCharacter.queue);
        this.setState({
            items: this.planCharacter.queue,
            totalTime: this.planCharacter.time,
            skillPlans: SkillPlanStore.getSkillPlansForCharacter(this.props.characterId),
            skillPlanId: id,
            skillPlanName: name,
            showQueue: false,
            selection: [],
        });
    }

    handleSkillPlanChanged(skillPlanId) {
        if (skillPlanId !== undefined) {
            const plan = SkillPlanStore.getSkillPlan(this.props.characterId, skillPlanId);

            if (plan !== undefined) {
                this.planCharacter.reset();
                plan.queue.forEach(item =>
                    this.planCharacter.addItemToQueue(item),
                );
                this.setState({
                    skillPlanId,
                    items: this.planCharacter.queue,
                    totalTime: this.planCharacter.time,
                    skillPlanName: plan.name,
                    showQueue: false,
                    skillPlans: SkillPlanStore.getSkillPlansForCharacter(this.props.characterId),
                });
            }
        }
    }

    handleSkillPlanRename(name) {
        if (this.state.skillPlanId !== undefined
            && SkillPlanStore.doesPlanExist(this.props.characterId, this.state.skillPlanId)) {
            this.setState({
                renameSkillPopoverOpen: false,
                renameSkillPopoverAnchor: undefined,
            });
            if (name !== undefined) {
                SkillPlanStore.storeSkillPlan(
                    this.props.characterId,
                    this.state.skillPlanId,
                    name,
                    this.planCharacter.queue,
                );
                this.setState({
                    skillPlans: SkillPlanStore.getSkillPlansForCharacter(this.props.characterId),
                });
            }
        }
    }

    handleSkillPlanRemove() {
        const plan = SkillPlanStore.getSkillPlansForCharacter(this.props.characterId).find(p => p.id === this.state.skillPlanId);
        const name = plan !== undefined ? plan.name : this.state.skillPlanName;
        const skills = plan !== undefined ? plan.skillCount : 0;
        if (!confirm(`Delete the plan "${name}"?\n\n` +
            (skills > 0 ? `Its ${skills} skill level${skills === 1 ? '' : 's'} will be removed. ` : '') + 'This can\'t be undone.')) {
            return;
        }

        SkillPlanStore.deleteSkillPlan(this.props.characterId, this.state.skillPlanId);
        const plans = SkillPlanStore.getSkillPlansForCharacter(this.props.characterId);

        this.planCharacter.reset();
        this.setState({
            items: this.planCharacter.queue,
            skillPlans: plans,
            skillPlanId: undefined,
            skillPlanName: undefined,
        });
        this.showTrainingQueue();
    }

    handleSkillPlanDuplicate() {
        if (this.state.skillPlanId !== undefined
            && SkillPlanStore.doesPlanExist(this.props.characterId, this.state.skillPlanId)) {
            const newId = ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
                (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
            )

            const newName = `Copy of ${this.state.skillPlanName}`;
            SkillPlanStore.storeSkillPlan(
                this.props.characterId,
                newId, newName,
                this.planCharacter.queue,
            );
            this.setState({
                items: this.planCharacter.queue,
                totalTime: this.planCharacter.time,
                skillPlans: SkillPlanStore.getSkillPlansForCharacter(this.props.characterId),
                skillPlanId: newId,
                skillPlanName: newName,
            });
        }
    }

    handleImport(name, source, skills) {
        if (name !== undefined && source !== undefined && skills !== undefined && skills.length > 0) {
            this.planCharacter.addNote(name, `Imported from ${source}`);
            skills.forEach(s => this.planCharacter.planSkill(s.typeId, s.level));
            
            SkillPlanStore.storeSkillPlan(
                this.props.characterId,
                this.state.skillPlanId,
                this.state.skillPlanName,
                this.planCharacter.queue,
            );
            this.setState({
                items: this.planCharacter.queue,
                totalTime: this.planCharacter.time,
                skillPlans: SkillPlanStore.getSkillPlansForCharacter(this.props.characterId),
            });
        }
        this.setState({ importToPlanPopoverOpen: false });
    }

    // The fit planner wrote to a plan (possibly a new one): refresh the list and show that plan.
    handleFitAdded(planId) {
        this.setState({skillPlans: SkillPlanStore.getSkillPlansForCharacter(this.props.characterId)});
        this.handleSkillPlanChanged(planId);

        return SkillPlanStore.getSkillPlan(this.props.characterId, planId);
    }

    handleExportClose() {
        this.setState({ exportFromPlanPopoverOpen: false });
    }


    // Per-skill times for the setup picked in the Implants & Accelerators panel: {label, times: {"id:level": ms}, total}, or
    // undefined. Cached until the queue or the setup changes.
    getComparison(queue) {
        const profile = this.state.compareProfile;
        if (profile === undefined || !queue.some(item => item.type === 'skill')) {
            return undefined;
        }

        if (this.comparison === undefined || this.comparison.queue !== queue || this.comparison.profile !== profile) {
            const items = TrainingProfileHelper.simulateItems(this.props.characterId, queue, profile.implants, profile.accelerator);
            const times = {};
            items.forEach(item => times[`${item.id}:${item.level}`] = item.time);

            this.comparison = {
                queue,
                profile,
                result: {label: profile.label, times, total: items.reduce((total, item) => total + item.time, 0)},
            };
        }

        return this.comparison.result;
    }

    // Plans count an active accelerator for as long as EVE's queue does; this switches that off (or on again) for
    // all of the character's plans, and re-times the open plan and the training queue.
    handleAcceleratorToggle() {
        const character = Character.get(this.props.characterId);
        character.planIgnoreAccelerator = character.planIgnoreAccelerator !== true;
        character.save();

        const items = this.planCharacter.queue.slice();
        this.planCharacter = new PlanCharacter(this.props.characterId);
        items.forEach(item => this.planCharacter.addItemToQueue(item));

        this.setState({items: this.planCharacter.queue, totalTime: this.planCharacter.time});
        if (this.state.showQueue) {
            this.showTrainingQueue();
        } else {
            this.setState({queueTime: SkillPlanHelper.buildTrainingQueue(this.props.characterId).time});
        }
    }

    // The active accelerator's switch in the toolbar, when there is one plans could count.
    renderAcceleratorToggle() {
        const character = Character.get(this.props.characterId);
        const window = AcceleratorHelper.planWindow(character);
        if (window === undefined) {
            return null;
        }

        const on = character.planIgnoreAccelerator !== true;
        const until = window.end.toLocaleString(navigator.language, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});
        return (
            <div className="plan-toolbar-group">
                <button
                    type="button"
                    className={`accel-toggle ${on ? 'on' : ''}`}
                    onClick={() => this.handleAcceleratorToggle()}
                    title={on ?
                        `Plan times include the active +${window.bonus} cerebral accelerator until ${until}, when EVE's skill queue stops counting it. Click to plan without it.` :
                        `Plan times leave out the active +${window.bonus} cerebral accelerator. Click to include it until ${until}, as EVE's skill queue does.`}
                >
                    <i className="material-icons">bolt</i>
                    <span>+{window.bonus} accelerator</span>
                    <span className="accel-toggle-switch"/>
                </button>
            </div>
        );
    }

    // Says on the plan whether its times include the active accelerator.
    acceleratorNote() {
        const character = Character.get(this.props.characterId);
        const window = AcceleratorHelper.planWindow(character);
        if (window === undefined) {
            return undefined;
        }
        if (character.planIgnoreAccelerator === true) {
            return `Without the +${window.bonus} accelerator`;
        }
        return `With +${window.bonus} accelerator until ${window.end.toLocaleString(navigator.language, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}`;
    }

    // where "+ Level N" puts the new level
    renderAddLevelMenu() {
        const menu = this.state.addLevelMenu;
        const item = menu !== undefined ? this.state.items[menu.index] : undefined;
        if (item === undefined || item.type !== 'skill') {
            return null;
        }
        const next = `${item.name} ${['', 'I', 'II', 'III', 'IV', 'V'][item.level + 1]}`;

        return (
            <Popover
                open={true}
                anchorEl={menu.anchorEl}
                anchorOrigin={{horizontal: 'right', vertical: 'bottom'}}
                targetOrigin={{horizontal: 'right', vertical: 'top'}}
                onRequestClose={() => this.setState({addLevelMenu: undefined})}
            >
                <Menu desktop={true}>
                    <MenuItem primaryText={`Add ${next} right after this level`} onClick={() => this.addNextLevel(menu.index, 'after')}/>
                    <MenuItem primaryText={`Add ${next} at the end of the plan`} onClick={() => this.addNextLevel(menu.index, 'end')}/>
                </Menu>
            </Popover>
        );
    }

    renderRemapDialog() {
        const character = Character.get(this.props.characterId);
        const bonuses = TrainingProfileHelper.getImplantBonuses(this.props.characterId);
        const values = Object.values(bonuses);
        const fullSet = Math.min(...values);

        return (
            <RemapDialog
                open={this.state.remapDialogOpen}
                editIndex={this.state.remapDialogEditIndex}
                attributes={this.state.remapAttribues}
                implants={this.state.remapImplants}
                skills={this.state.remapDialogOpen ? RemapHelper.sectionAfter(this.state.items, this.state.remapDialogEditIndex) : []}
                currentAttributes={TrainingProfileHelper.getBaseAttributes(this.props.characterId)}
                currentImplants={fullSet}
                mixedImplants={values.some(v => v !== fullSet)}
                isOmega={this.planCharacter.isOmega}
                remapInfo={character.attributes ? {
                    bonusRemaps: character.attributes.bonus_remaps || 0,
                    nextYearly: character.getNextYearlyRemapDate(),
                } : undefined}
                onAddRemap={this.handleRemapAdd}
            />
        );
    }

    render() {
        return (
            <div>
                {this.renderRemapDialog()}
                {this.renderAddLevelMenu()}
                <NoteDialog
                    text={this.state.noteText}
                    details={this.state.noteDetails}
                    editIndex={this.state.noteDialogEditIndex}
                    onAddNote={this.handleNoteAdd}
                    open={this.state.noteDialogOpen}
                />
                <PlanSkillPopover
                    open={this.state.planSkillPopoverOpen}
                    anchorEl={this.state.planSkillPopoverAnchor}
                    onLevelSelected={this.handleSkillAdd}
                />
                <NewRenamePlanPopover
                    open={this.state.newSkillPopoverOpen}
                    anchorEl={this.state.newSkillPopoverAnchor}
                    onNewName={this.handleSkillPlanAdd}
                />
                <NewRenamePlanPopover
                    open={this.state.renameSkillPopoverOpen}
                    anchorEl={this.state.renameSkillPopoverAnchor}
                    onNewName={this.handleSkillPlanRename}
                />
                <ImportToPlanPopover
                    open={this.state.importToPlanPopoverOpen}
                    anchorEl={this.state.importToPlanPopoverAnchor}
                    onImport={this.handleImport}
                    onFitting={() => this.setState({importToPlanPopoverOpen: false, fitPlannerOpen: true})}
                    onPaste={source => this.setState({importToPlanPopoverOpen: false, pasteSkillsOpen: true, pasteSource: source})}
                    onEveQueue={() => this.handleImportEveQueue()}
                />
                <PasteSkillsDialog
                    open={this.state.pasteSkillsOpen === true}
                    source={this.state.pasteSource}
                    onClose={() => this.setState({pasteSkillsOpen: false})}
                    onImport={skills => {
                        this.setState({pasteSkillsOpen: false});
                        if (this.state.pasteSource === 'eve') {
                            this.handleImport('EVE skill plan', 'the EVE client', skills);
                        } else {
                            this.handleImport('Pasted skill list', 'pasted text', skills);
                        }
                    }}
                />
                <ExportFromPlanPopover
                    open={this.state.exportFromPlanPopoverOpen}
                    anchorEl={this.state.exportFromPlanPopoverAnchor}
                    items={this.state.items}
                    onClose={this.handleExportClose}
                    name={this.state.skillPlanName}
                />
                <div className="panel plan-toolbar">

                    <div className="plan-toolbar-group">
                        <RaisedButton
                            style={styles.button}
                            labelStyle={styles.buttonLabel}
                            onClick={(e) => this.setState({
                                newSkillPopoverOpen: true,
                                newSkillPopoverAnchor: e.currentTarget,
                            })}
                            label="New"
                            icon={<FontIcon className="material-icons" style={styles.buttonIcon}>add</FontIcon>}
                        />
                        <RaisedButton
                            style={styles.button}
                            labelStyle={styles.buttonLabel}
                            onClick={(e) => this.setState({
                                renameSkillPopoverOpen: true,
                                renameSkillPopoverAnchor: e.currentTarget,
                            })}
                            label="Rename"
                            disabled={this.state.showQueue || this.state.skillPlanId === undefined}
                            icon={<FontIcon className="material-icons" style={styles.buttonIcon}>edit</FontIcon>}
                        />
                        <RaisedButton
                            style={styles.button}
                            labelStyle={styles.buttonLabel}
                            onClick={this.handleSkillPlanDuplicate}
                            label="Duplicate"
                            disabled={this.state.showQueue || this.state.skillPlanId === undefined}
                            icon={<FontIcon className="material-icons" style={styles.buttonIcon}>content_copy</FontIcon>}
                        />
                        <RaisedButton
                            style={styles.button}
                            labelStyle={styles.buttonLabel}
                            onClick={this.handleSkillPlanRemove}
                            label="Delete"
                            disabled={this.state.showQueue || this.state.skillPlanId === undefined}
                            icon={<FontIcon className="material-icons" style={styles.buttonIcon}>delete</FontIcon>}
                        />
                    </div>

                    <div className="plan-toolbar-group">
                        <RaisedButton
                            style={styles.button}
                            labelStyle={styles.buttonLabel}
                            onClick={(e) => this.setState({
                                importToPlanPopoverOpen: true,
                                importToPlanPopoverAnchor: e.currentTarget })}
                            label="Import"
                            disabled={this.state.showQueue}
                            icon={<FontIcon className="material-icons" style={styles.buttonIcon}>file_download</FontIcon>}
                        />
                        <RaisedButton
                            style={styles.button}
                            labelStyle={styles.buttonLabel}
                            onClick={(e) => this.setState({
                                exportFromPlanPopoverOpen: true,
                                exportFromPlanPopoverAnchor: e.currentTarget })}
                            label="Export"
                            disabled={this.state.showQueue}
                            icon={<FontIcon className="material-icons" style={styles.buttonIcon}>file_upload</FontIcon>}
                        />
                    </div>

                    <div className="plan-toolbar-group">
                        <RaisedButton
                            style={styles.button}
                            labelStyle={styles.buttonLabel}
                            onClick={() => this.setState({implantsOpen: !this.state.implantsOpen})}
                            label="Implants & Accelerators"
                            primary={this.state.implantsOpen}
                            icon={<FontIcon className="material-icons" style={styles.buttonIcon}>psychology</FontIcon>}
                        />
                    </div>

                    {this.renderAcceleratorToggle()}
                </div>

                {this.state.fitPlannerOpen &&
                    <FitPlanner
                        key={this.props.characterId}
                        characterId={this.props.characterId}
                        plans={this.state.skillPlans}
                        currentPlanId={this.state.skillPlanId}
                        onAdded={this.handleFitAdded}
                        onClose={() => this.setState({fitPlannerOpen: false})}
                    />
                }

                {this.state.implantsOpen &&
                    <ImplantProfilerPanel
                        characterId={this.props.characterId}
                        queue={this.state.showQueue ? this.state.queue : this.state.items}
                        label={this.state.showQueue ? 'Training Queue' : (this.state.skillPlanName || 'Unsaved plan')}
                        onProfileChange={compareProfile => this.setState({compareProfile})}
                        onClose={() => this.setState({implantsOpen: false, compareProfile: undefined})}
                    />
                }

                <MergePlansDialog
                    open={this.state.mergeDialogOpen}
                    plans={this.state.skillPlans}
                    onMerge={this.handleMerge}
                    onClose={() => this.setState({mergeDialogOpen: false})}
                />

                <div className="split">
                    <div className="stack">
                        <PlanList
                            plans={this.state.skillPlans}
                            selectedId={this.state.showQueue ? TRAINING_QUEUE : this.state.skillPlanId}
                            queueTime={this.state.queueTime}
                            onSelect={this.handleListSelect}
                            onToggle={this.handlePlanToggle}
                            onMove={this.handlePlanMove}
                            onMerge={() => this.setState({mergeDialogOpen: true})}
                        />

                        <Panel
                            title="Skill Catalogue"
                            icon="menu_book"
                            flush={true}
                            className="catalogue"
                            subtitle={this.state.showQueue ? 'Open a plan to add skills' : undefined}
                        >
                            <FilteredSkillList
                                characterId={this.props.characterId}
                                onSkillSelectionChange={this.handleSkillSelected}
                            />
                        </Panel>
                    </div>

                    {this.state.showQueue ?
                    <Panel
                        title="Training Queue"
                        icon="playlist_play"
                        flush={true}
                        subtitle={[
                            this.state.compareProfile ? `Compared with: ${this.state.compareProfile.label}` : 'Switched-on plans, highest priority first',
                            this.acceleratorNote(),
                        ].filter(Boolean).join(' · ')}
                        actions={
                            <RaisedButton
                                style={styles.button}
                                labelStyle={styles.buttonLabel}
                                onClick={this.handleCopyQueue}
                                disabled={this.state.queue.length === 0}
                                label="Copy"
                                title="Copy as EVE skill list"
                                icon={<FontIcon className="material-icons" style={styles.buttonIcon}>content_copy</FontIcon>}
                            />
                        }
                    >
                        <SkillbookPanel characterId={this.props.characterId} queue={this.state.queue}/>
                        <TrainingQueueTable queue={this.state.queue} time={this.state.queueTime}
                                            compare={this.getComparison(this.state.queue)}/>
                    </Panel>
                    :
                    <Panel
                        title={this.state.skillPlanName || 'Plan'}
                        icon="format_list_numbered"
                        subtitle={[
                            this.state.compareProfile && `Compared with: ${this.state.compareProfile.label}`,
                            this.acceleratorNote(),
                        ].filter(Boolean).join(' · ') || undefined}
                        flush={true}
                        actions={
                            <div style={{display: 'flex', gap: 6}}>
                                <RaisedButton
                                    style={styles.button}
                                    labelStyle={styles.buttonLabel}
                                    onClick={this.handleSort}
                                    disabled={this.state.items.length < 2}
                                    label="Sort"
                                    title="Fastest to train first, prerequisites kept in order"
                                    icon={<FontIcon className="material-icons" style={styles.buttonIcon}>sort</FontIcon>}
                                />
                                <RaisedButton
                                    style={styles.button}
                                    labelStyle={styles.buttonLabel}
                                    onClick={() => this.setState({ remapDialogOpen: true })}
                                    label="Remap"
                                    icon={<FontIcon className="material-icons" style={styles.buttonIcon}>tune</FontIcon>}
                                />
                                <RaisedButton
                                    style={styles.button}
                                    labelStyle={styles.buttonLabel}
                                    onClick={() => this.setState({ noteDialogOpen: true })}
                                    label="Note"
                                    icon={<FontIcon className="material-icons" style={styles.buttonIcon}>sticky_note_2</FontIcon>}
                                />
                            </div>
                        }
                    >
                        <SkillbookPanel characterId={this.props.characterId} queue={this.state.items}/>
                        <SkillPlanTable
                            onEdit={this.handleItemEdit}
                            onRemove={this.handleItemRemove}
                            onSkillMove={this.handleItemMove}
                            onAddLevel={this.handleAddNextLevel}
                            compare={this.getComparison(this.state.items)}
                            items={this.state.items}
                            totalTime={this.state.totalTime}
                            selected={this.state.selected}
                        />
                    </Panel>
                    }
                </div>
            </div>
        );
    }
}