'use strict';

import getMuiTheme from 'material-ui/styles/getMuiTheme';
import darkBaseTheme from 'material-ui/styles/baseThemes/darkBaseTheme';
import {fade} from 'material-ui/utils/colorManipulator';

import ThemeHelper from '../helpers/ThemeHelper';

// For inline styles. These follow the active theme automatically; the palettes are defined in css/main.css.
export const colors = {
    bg: 'var(--bg-0)',
    panel: 'var(--panel-solid)',
    panelRaised: 'var(--panel-raised)',
    line: 'var(--line)',
    lineStrong: 'var(--line-strong)',
    textStrong: 'var(--text-strong)',
    text: 'var(--text)',
    textDim: 'var(--text-dim)',
    textFaint: 'var(--text-faint)',
    accent: 'var(--accent)',
    accentBright: 'var(--accent-bright)',
    omega: 'var(--omega)',
    good: 'var(--good)',
    warn: 'var(--warn)',
    danger: 'var(--danger)',
};

const fontFamily = "'Inter', 'Segoe UI', Roboto, sans-serif";

// material-ui needs concrete colour values, so the theme is built from the resolved CSS tokens of the active theme.
export default function buildMuiTheme() {
    const c = {
        bg: ThemeHelper.readColor('--bg-0'),
        panel: ThemeHelper.readColor('--panel-solid'),
        panelRaised: ThemeHelper.readColor('--panel-raised'),
        lineBase: ThemeHelper.readColor('--line-base'),
        text: ThemeHelper.readColor('--text'),
        textDim: ThemeHelper.readColor('--text-dim'),
        textFaint: ThemeHelper.readColor('--text-faint'),
        accent: ThemeHelper.readColor('--accent'),
        accentBright: ThemeHelper.readColor('--accent-bright'),
    };

    return getMuiTheme(darkBaseTheme, {
        fontFamily: fontFamily,
        borderRadius: 0,
        palette: {
            primary1Color: c.accent,
            primary2Color: c.accentBright,
            primary3Color: c.textFaint,
            accent1Color: c.accent,
            accent2Color: c.panelRaised,
            accent3Color: c.textDim,
            textColor: c.text,
            secondaryTextColor: c.textDim,
            alternateTextColor: c.bg,
            canvasColor: c.panel,
            borderColor: fade(c.lineBase, 0.22),
            disabledColor: fade(c.text, 0.3),
            pickerHeaderColor: c.accent,
            clockCircleColor: fade(c.text, 0.07),
            shadowColor: '#000',
        },
        raisedButton: {
            color: c.panelRaised,
            textColor: c.text,
            primaryColor: c.accent,
            primaryTextColor: c.bg,
            disabledColor: fade(c.panelRaised, 0.6),
            disabledTextColor: c.textFaint,
            fontWeight: 600,
        },
        flatButton: {
            textColor: c.text,
            primaryTextColor: c.accent,
            fontWeight: 600,
        },
        table: {
            backgroundColor: 'transparent',
        },
        tableHeaderColumn: {
            textColor: c.textFaint,
            height: 40,
        },
        tableRow: {
            hoverColor: fade(c.accent, 0.06),
            stripeColor: fade(c.text, 0.03),
            selectedColor: fade(c.accent, 0.12),
            textColor: c.text,
            borderColor: fade(c.lineBase, 0.11),
        },
        tableRowColumn: {
            height: 56,
        },
        dialog: {
            titleFontSize: 20,
            bodyFontSize: 13,
            bodyColor: c.text,
        },
        paper: {
            backgroundColor: c.panel,
        },
        menuItem: {
            hoverColor: fade(c.accent, 0.08),
            selectedTextColor: c.accent,
        },
        textField: {
            focusColor: c.accent,
            floatingLabelColor: c.textDim,
            hintColor: c.textFaint,
        },
        toggle: {
            thumbOnColor: c.accent,
            trackOnColor: fade(c.accent, 0.45),
        },
        checkbox: {
            checkedColor: c.accent,
            boxColor: c.textDim,
        },
    });
}
