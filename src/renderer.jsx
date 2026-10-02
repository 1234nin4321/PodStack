'use strict';

import React from 'react';
import ReactDOM from 'react-dom';
import {HashRouter} from 'react-router-dom';

import 'react-table/react-table.css';
import 'react-sortable-tree/style.css';

import App from './components/App';
import ThemeHelper from './helpers/ThemeHelper';
import AlertHelper from './helpers/AlertHelper';
import TrayHelper from './helpers/TrayHelper';
import log from 'electron-log';

// index.html already set the attribute before first paint; this also syncs the window background.
ThemeHelper.apply(ThemeHelper.get());

// anything that escapes the UI's error boundaries (event handlers, timers, promises) still ends up in the log file
log.errorHandler.startCatching({showDialog: false});

AlertHelper.start();
TrayHelper.start();

ReactDOM.render(<HashRouter><App/></HashRouter>, document.getElementById('App'));
