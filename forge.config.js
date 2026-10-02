'use strict';

const build = require('./scripts/build');
const pkg = require('./package.json');

// "github:owner/name" in package.json; the app's updater reads the same field.
const [owner, name] = pkg.repository.replace(/^github:/, '').split('/');

// Only the bundled code and the static assets the UI loads at runtime are packaged.
const packagedPaths = ['/package.json', '/dist', '/resources', '/src/index.html', '/src/css'];

module.exports = {
    packagerConfig: {
        asar: true,
        icon: 'resources/icon',
        ignore: (file) => {
            if (!file || file === '/src') {
                return false;
            }

            return !packagedPaths.some(p => file === p || file.startsWith(p + '/'));
        },
    },
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            platforms: ['win32'],
            config: {
                name: 'podstack',
                setupIcon: 'resources/icon.ico',
                // icon for the entry in Settings > Apps > Installed apps (Squirrel needs a URL)
                iconUrl: `https://raw.githubusercontent.com/${owner}/${name}/master/resources/icon.ico`,
                loadingGif: 'resources/installing.gif',
            },
        },
        {
            name: '@electron-forge/maker-zip',
            platforms: ['win32', 'darwin'],
        },
        {
            name: '@electron-forge/maker-deb',
            platforms: ['linux'],
        },
        {
            name: '@electron-forge/maker-rpm',
            platforms: ['linux'],
        },
    ],
    publishers: [
        {
            name: '@electron-forge/publisher-github',
            config: {
                repository: {owner, name},
                // Created as a draft to review first. When publishing it, leave "Set as a pre-release" unticked:
                // the update service ignores pre-releases, even for versions like 0.1.0-alpha.
                draft: true,
                prerelease: false,
                tagPrefix: 'v',
            },
        },
    ],
    hooks: {
        generateAssets: async () => {
            await build({dev: process.argv.includes('start')});
        },
    },
};
