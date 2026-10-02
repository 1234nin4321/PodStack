'use strict';

// Download counts per release, kept as a running total (`npm run stats`).
//
//   Installer  PodStack-<version>.Setup.exe       new installs from the releases page
//   Portable   PodStack-win32-x64-<version>.zip   portable copies
//   Updates    podstack-<version>-full.nupkg      installed copies updating in-app to this version
//
// GitHub forgets a release's counts when the release is deleted, so they're also kept in stats/downloads.json:
// counts there only ever go up, and a deleted release keeps its last numbers. `--save` writes the file; the
// "Download stats" workflow does that daily, so nothing is lost between runs.
//
// Works without a token for a public repo (60 requests an hour); set GITHUB_TOKEN for a higher limit.

const fs = require('fs');
const path = require('path');

const pkg = require('../package.json');

const REPOSITORY = (pkg.repository || '').replace(/^github:/, '');
const FILE = path.join(__dirname, '..', 'stats', 'downloads.json');
const KINDS = ['installer', 'portable', 'updates'];

function kind(name) {
    if (/\.Setup\.exe$/i.test(name)) {
        return 'installer';
    }
    if (/\.zip$/i.test(name)) {
        return 'portable';
    }
    if (/-full\.nupkg$/i.test(name)) {
        return 'updates';
    }
    return undefined;   // RELEASES and anything else
}

async function fetchReleases() {
    const headers = {'Accept': 'application/vnd.github+json', 'User-Agent': `podstack-stats/${pkg.version}`};
    if (process.env.GITHUB_TOKEN) {
        headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const all = [];
    for (let page = 1; ; page++) {
        const res = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases?per_page=100&page=${page}`, {headers});
        if (!res.ok) {
            throw new Error(`GitHub returned ${res.status} ${res.statusText}`);
        }
        const batch = await res.json();
        all.push(...batch);
        if (batch.length < 100) {
            return all.filter(r => !r.draft);
        }
    }
}

function load() {
    try {
        return JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch {
        return {releases: {}};   // no history yet
    }
}

// Merges GitHub's current counts into the saved history. Counts never go down (an asset re-uploaded under the same
// release starts again from 0 on GitHub), and releases GitHub no longer has are kept, marked removed.
function merge(history, releases) {
    const now = new Date().toISOString();
    const seen = new Set();
    const merged = {...history.releases};

    for (const release of releases) {
        const counts = Object.fromEntries(KINDS.map(k => [k, 0]));
        release.assets.forEach(asset => {
            const k = kind(asset.name);
            if (k !== undefined) {
                counts[k] += asset.download_count;
            }
        });

        const previous = merged[release.tag_name] || {};
        merged[release.tag_name] = {
            published: (release.published_at || previous.published || '').slice(0, 10),
            ...Object.fromEntries(KINDS.map(k => [k, Math.max(previous[k] || 0, counts[k])])),
            removed: false,
            lastSeen: now,
        };
        seen.add(release.tag_name);
    }

    Object.keys(merged).forEach(tag => {
        if (!seen.has(tag)) {
            merged[tag] = {...merged[tag], removed: true};
        }
    });

    const totals = Object.fromEntries(KINDS.map(k => [k, Object.values(merged).reduce((sum, r) => sum + (r[k] || 0), 0)]));
    totals.all = KINDS.reduce((sum, k) => sum + totals[k], 0);

    // newest first
    const releasesSorted = Object.fromEntries(Object.entries(merged)
        .sort(([a, ra], [b, rb]) => (rb.published || '').localeCompare(ra.published || '') || b.localeCompare(a, undefined, {numeric: true})));

    return {repository: REPOSITORY, updated: now, totals, releases: releasesSorted};
}

function print(stats) {
    const rows = Object.entries(stats.releases).map(([tag, r]) =>
        [tag + (r.removed ? ' (removed)' : ''), r.published || '', r.installer, r.portable, r.updates, r.installer + r.portable + r.updates]);
    const t = stats.totals;
    const table = [
        ['Version', 'Published', 'Installer', 'Portable', 'Updates', 'Total'],
        ...rows,
        ['All time', '', t.installer, t.portable, t.updates, t.all],
    ].map(row => row.map(String));

    const widths = table[0].map((_, i) => Math.max(...table.map(row => row[i].length)));
    const line = row => row.map((cell, i) => (i < 2 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join('  ');
    const rule = widths.map(w => '-'.repeat(w)).join('  ');

    console.log(`Downloads of ${stats.repository} releases (running total)\n`);
    console.log(line(table[0]));
    console.log(rule);
    table.slice(1, -1).forEach(row => console.log(line(row)));
    console.log(rule);
    console.log(line(table[table.length - 1]));
    console.log('\nInstaller = new installs, Portable = zip downloads, Updates = installed copies updating in-app.');
}

async function main() {
    const stats = merge(load(), await fetchReleases());
    print(stats);

    if (process.argv.includes('--save')) {
        fs.mkdirSync(path.dirname(FILE), {recursive: true});
        fs.writeFileSync(FILE, JSON.stringify(stats, null, 2) + '\n');
        console.log(`\nSaved to ${path.relative(process.cwd(), FILE)}`);
    }
}

main().catch(err => {
    console.error(`Couldn't load download stats: ${err.message}`);
    process.exit(1);
});
