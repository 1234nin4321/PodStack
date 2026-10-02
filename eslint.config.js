'use strict';

// Lint for real problems (undefined names, unused code, React mistakes) rather than formatting style.
const js = require('@eslint/js');
const react = require('eslint-plugin-react');
const globals = require('globals');

module.exports = [
    {
        ignores: ['dist/**', 'out/**', 'node_modules/**', 'resources/all_skills.js', 'resources/alpha_skill_set.js'],
    },
    {
        files: ['src/**/*.{js,jsx}', 'resources/**/*.js'],
        ...js.configs.recommended,
        plugins: {react},
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            parserOptions: {ecmaFeatures: {jsx: true}},
            // the UI runs with Node integration, so both sets of globals are available
            globals: {...globals.browser, ...globals.node},
        },
        settings: {react: {version: '16.7'}},
        rules: {
            ...js.configs.recommended.rules,
            ...react.configs.recommended.rules,
            'no-unused-vars': ['error', {args: 'none', caughtErrors: 'none', ignoreRestSiblings: true}],
            'no-empty': ['error', {allowEmptyCatch: true}],
            'no-prototype-builtins': 'off',
            // the codebase uses React 16 class lifecycles and has no PropTypes
            'react/prop-types': 'off',
            'react/display-name': 'off',
            'react/no-deprecated': 'off',
            'react/no-unescaped-entities': 'off',
        },
    },
    {
        files: ['*.js', 'scripts/**/*.js'],
        ...js.configs.recommended,
        languageOptions: {ecmaVersion: 2022, sourceType: 'commonjs', globals: globals.node},
    },
];
