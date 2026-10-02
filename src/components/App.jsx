'use strict';

import React from 'react';
import {Route} from 'react-router-dom';

import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider';

import buildMuiTheme from './theme';
import ThemeHelper from '../helpers/ThemeHelper';
import LeftNav from './nav/LeftNav';
import UpdateBanner from './ui/UpdateBanner';
import Overview from './views/Overview';
import SkillBrowser from './views/SkillBrowser';
import SpFarming from './views/SpFarming';
import QueueHealth from './views/QueueHealth';
import Contracts from './views/Contracts';
import Character from './views/Character';
import Settings from './views/Settings';

export default class App extends React.Component {
    constructor(props) {
        super(props);

        this.state = {muiTheme: buildMuiTheme()};
    }

    componentDidMount() {
        this.unsubscribeTheme = ThemeHelper.subscribe(() => this.setState({muiTheme: buildMuiTheme()}));
    }

    componentWillUnmount() {
        this.unsubscribeTheme();
    }

    render() {
        return (
            <MuiThemeProvider muiTheme={this.state.muiTheme}>
                <div>
                    <LeftNav/>

                    <main className="app-main">
                        <UpdateBanner/>
                        <Route exact path="/" component={Overview} />
                        <Route path="/sp-farming" component={SpFarming} />
                        <Route path="/queue-health" component={QueueHealth} />
                        <Route path="/skill-browser" component={SkillBrowser} />
                        <Route path="/contracts" component={Contracts} />
                        <Route path="/settings" component={Settings} />
                        <Route path="/characters/:characterId" component={Character} />
                    </main>
                </div>
            </MuiThemeProvider>
        );
    }
}
