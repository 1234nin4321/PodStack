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

        const isConfirm = request.kind === 'confirm';
        const actions = [];
        if (isConfirm) {
            actions.push(<FlatButton key="cancel" label={request.cancelLabel} onClick={() => ConfirmHelper.answer(false)}/>);
        }
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

        return (
            <Dialog
                title={request.title}
                open={true}
                modal={false}
                // clicking outside or Esc: no for a question, just closes a message
                onRequestClose={() => ConfirmHelper.answer(!isConfirm)}
                contentStyle={{width: 460}}
                actions={actions}
            >
                {String(request.message || '').split(/\n\s*\n/).map((paragraph, i) =>
                    <p key={i} className={i === 0 ? 'confirm-text' : 'confirm-text muted'}>{paragraph}</p>
                )}
            </Dialog>
        );
    }
}
