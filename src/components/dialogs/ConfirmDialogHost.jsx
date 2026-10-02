'use strict';

import React from 'react';

import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';

import ConfirmHelper from '../../helpers/ConfirmHelper';

// Shows ConfirmHelper's confirmations and messages in PodStack's style. Mounted once, in App.
export default class ConfirmDialogHost extends React.Component {
    constructor(props) {
        super(props);

        this.state = {request: undefined};
    }

    componentDidMount() {
        ConfirmHelper.setHost(request => this.setState({request}));
    }

    componentWillUnmount() {
        ConfirmHelper.setHost(undefined);
    }

    render() {
        const {request} = this.state;
        if (request === undefined) {
            return null;
        }

        const paragraphs = String(request.message || '').split(/\n\s*\n/);
        const isConfirm = request.kind === 'confirm';
        const isChoice = request.kind === 'choose';
        const actions = [];
        if (isConfirm) {
            actions.push(<FlatButton key="cancel" label={request.cancelLabel} onClick={() => ConfirmHelper.answer(false)}/>);
        }
        if (isChoice) {
            actions.push(<FlatButton key="cancel" label={request.cancelLabel} onClick={() => ConfirmHelper.answer(undefined)}/>);
            request.choices.forEach(choice => actions.push(
                <FlatButton key={choice.value} label={choice.label} primary={choice.primary === true}
                            keyboardFocused={choice.primary === true} onClick={() => ConfirmHelper.answer(choice.value)}/>
            ));
        } else {
            actions.push(
                <FlatButton
                    key="ok"
                    label={request.confirmLabel}
                    primary={!request.danger}
                    className={request.danger ? 'confirm-danger' : undefined}
                    keyboardFocused={true}
                    onClick={() => ConfirmHelper.answer(true)}
                />
            );
        }

        return (
            <Dialog
                title={request.title}
                open={true}
                modal={false}
                // clicking outside or Esc: no for a question, nothing chosen, just closes a message
                onRequestClose={() => ConfirmHelper.answer(isChoice ? undefined : !isConfirm)}
                contentStyle={{width: isChoice ? 520 : 460}}
                actions={actions}
            >
                {paragraphs.slice(0, 1).map((paragraph, i) => <p key={i} className="confirm-text">{paragraph}</p>)}
                {request.rows !== undefined &&
                    <dl className="kv confirm-rows">
                        {request.rows.map(row => [
                            <dt key={`${row.label}-l`}>{row.label}</dt>,
                            <dd key={`${row.label}-v`} className="num">{row.value}</dd>,
                        ])}
                    </dl>
                }
                {paragraphs.slice(1).map((paragraph, i) => <p key={i + 1} className="confirm-text muted">{paragraph}</p>)}
            </Dialog>
        );
    }
}
