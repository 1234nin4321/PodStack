'use strict';

import React from 'react';
import ReactDOM from 'react-dom';
import {HashRouter} from 'react-router-dom';

import 'react-table/react-table.css';
import 'react-sortable-tree/style.css';

import App from './components/App';
import ThemeHelper from './helpers/ThemeHelper';
import AlertHelper from './helpers/AlertHelper';

// index.html already set the attribute before first paint; this also syncs the window background.
ThemeHelper.apply(ThemeHelper.get());

AlertHelper.start();

ReactDOM.render(<HashRouter><App/></HashRouter>, document.getElementById('App'));
