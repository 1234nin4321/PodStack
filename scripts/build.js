'use strict';

// Bundles the main process and the renderer into dist/ with esbuild.
// Run directly (`npm run build`) or via the Forge generateAssets hook.

const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');

async function build({dev = false} = {}) {
    const common = {
        absWorkingDir: root,
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'node22',
        external: ['electron'],
        sourcemap: dev ? 'inline' : false,
        minify: !dev,
        logLevel: 'warning',
        define: {'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production')},
        loader: {'.js': 'jsx'},
    };

    await Promise.all([
        esbuild.build(Object.assign({}, common, {
            entryPoints: ['src/index.js'],
            outfile: 'dist/main.js',
            // electron-log copies function source into a preload script, which breaks when minified.
            minify: false,
        })),
        esbuild.build(Object.assign({}, common, {
            entryPoints: ['src/renderer.jsx'],
            outfile: 'dist/renderer.js',
            target: 'chrome140',
            // Several UI packages ship broken ES-module builds; their CommonJS builds are fine.
            mainFields: ['browser', 'main'],
            jsx: 'transform',
        })),
    ]);
}

module.exports = build;

if (require.main === module) {
    build({dev: process.argv.includes('--dev')}).catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
