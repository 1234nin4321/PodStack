'use strict';

import React from 'react';

import DialogHelper from '../../helpers/DialogHelper';
import ShipModelHelper from '../../helpers/ShipModelHelper';
import Panel from '../ui/Panel';

// Where the EVE client is installed: the Ship Browser's 3D viewer reads the hull models and textures from it.
export default class EveFolderSettings extends React.Component {
    constructor(props) {
        super(props);

        this.state = {message: undefined, searching: false};
    }

    async browse() {
        const paths = await DialogHelper.showOpenDialog({title: 'EVE install folder', properties: ['openDirectory']});
        if (paths === undefined || paths.length === 0) {
            return;
        }
        const found = ShipModelHelper.setEveFolder(paths[0]);
        this.setState({message: found !== undefined ? undefined :
            `No EVE install found in ${paths[0]}. Pick the folder that holds EVE's tq and ResFiles folders (by default C:\\CCP\\EVE).`});
    }

    useDetected() {
        ShipModelHelper.setEveFolder('');
        this.search();
    }

    // looks on every drive again (e.g. after installing or moving EVE)
    search() {
        this.setState({searching: true, message: undefined}, () => setTimeout(() => {
            const found = ShipModelHelper.redetect();
            this.setState({searching: false, message: found !== undefined ? undefined :
                'Couldn\'t find an EVE install on any drive. Use Choose folder… to point PodStack at it.'});
        }, 30));
    }

    render() {
        const folder = ShipModelHelper.eveFolder();
        const saved = ShipModelHelper.savedFolder();

        return (
            <Panel title="EVE Client" icon="view_in_ar" style={{maxWidth: 960, marginBottom: 16}}>
                <p className="muted" style={{marginTop: 0}}>
                    The Ship Browser shows ships in 3D using the models and textures from your own EVE install. PodStack only
                    reads them, on this computer.
                </p>
                <div className="eve-folder">
                    <span className={`eve-folder-path ${folder ? '' : 'missing'}`}>
                        {folder ? folder : 'No EVE install found'}
                        {folder && saved === '' && <span className="faint"> (found automatically)</span>}
                    </span>
                    <button type="button" className="link-button" onClick={() => this.browse()}>Choose folder…</button>
                    {saved !== '' ?
                        <button type="button" className="link-button" onClick={() => this.useDetected()}>Find automatically</button> :
                        <button type="button" className="link-button" disabled={this.state.searching} onClick={() => this.search()}>
                            {this.state.searching ? 'Searching…' : 'Search again'}
                        </button>}
                </div>
                {this.state.message && <p className="fit-error" style={{marginBottom: 0}}>{this.state.message}</p>}
            </Panel>
        );
    }
}
