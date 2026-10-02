'use strict';

import React from 'react';
import {Route} from 'react-router-dom';

import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider';

import buildMuiTheme from './theme';
import ThemeHelper from '../helpers/ThemeHelper';
import LeftNav from './nav/LeftNav';
import UpdateBanner from './ui/UpdateBanner';
import EsiStatusBanner from './ui/EsiStatusBanner';
import Overview from './views/Overview';
import SkillBrowser from './views/SkillBrowser';
import SpFarming from './views/SpFarming';
import QueueHealth from './views/QueueHealth';
import Contracts from './views/Contracts';
import Industry from './views/Industry';
import Planets from './views/Planets';
import Character from './views/Character';
import Settings from './views/Settings';
import About from './views/About';

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
                        <EsiStatusBanner/>
                        <Route exact path="/" component={Overview} />
                        <Route path="/sp-farming" component={SpFarming} />
                        <Route path="/queue-health" component={QueueHealth} />
                        <Route path="/skill-browser" component={SkillBrowser} />
                        <Route path="/contracts" component={Contracts} />
                        <Route path="/industry" component={Industry} />
                        <Route path="/planets" component={Planets} />
                        <Route path="/settings" component={Settings} />
                        <Route path="/about" component={About} />
                        <Route path="/characters/:characterId" component={Character} />
                    </main>
                </div>
            </MuiThemeProvider>
        );
    }
}
