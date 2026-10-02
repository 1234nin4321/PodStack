'use strict';

// Regenerates PodStack's skill data from EVE's static data export (SDE):
//
//   resources/all_skills.js         every published skill (attributes, rank, prerequisites) and the skill groups
//   resources/skill_base_prices.js  NPC base price of each skillbook
//   resources/alpha_skill_set.js    the highest level an Alpha clone can train each skill to
//
// Usage: `npm run update-skills` downloads the latest SDE from CCP (about 100 MB), or
// `npm run update-skills -- <folder>` uses an already extracted JSONL SDE. It prints which skills are new, removed
// or renamed. Run it after CCP adds skills, then review and commit the changes.

const fs = require('fs');
const os = require('os');
const path = require('path');
const {execFileSync} = require('child_process');

const ROOT = path.join(__dirname, '..');
const SDE_URL = 'https://developers.eveonline.com/static-data/tranquility';
const SKILL_CATEGORY = 16;
const SKILLS_MARKET_GROUP = 150;
const FILES = ['types.jsonl', 'groups.jsonl', 'marketGroups.jsonl', 'typeDogma.jsonl', 'cloneGrades.jsonl'];

// dogma attributes: which character attribute, training rank, and up to six prerequisite skill/level pairs
const ATTRIBUTES = {164: 'charisma', 165: 'intelligence', 166: 'memory', 167: 'perception', 168: 'willpower'};
const PRIMARY = 180;
const SECONDARY = 181;
const RANK = 275;
const PREREQUISITES = [[182, 277], [183, 278], [184, 279], [1285, 1286], [1289, 1287], [1290, 1288]];

async function downloadSde() {
    const latest = await (await fetch(`${SDE_URL}/latest.jsonl`)).json();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `sde-${latest.buildNumber}-`));
    const zip = path.join(dir, 'sde.zip');

    console.log(`Downloading SDE build ${latest.buildNumber} (${latest.releaseDate.slice(0, 10)})…`);
    const res = await fetch(`${SDE_URL}/eve-online-static-data-${latest.buildNumber}-jsonl.zip`);
    if (!res.ok) {
        throw new Error(`SDE download failed (${res.status})`);
    }
    fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));

    // unzip on Linux/macOS; Windows 10+ ships a tar that reads zip files
    try {
        execFileSync('unzip', ['-o', '-q', zip, ...FILES, '-d', dir]);
    } catch {
        execFileSync('tar', ['-xf', zip, '-C', dir, ...FILES]);
    }
    return {dir, build: latest.buildNumber, date: latest.releaseDate.slice(0, 10)};
}

function readJsonl(dir, file) {
    return fs.readFileSync(path.join(dir, file), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
}

// the current resources/all_skills.js, to report what changed
function loadCurrent() {
    try {
        const source = fs.readFileSync(path.join(ROOT, 'resources', 'all_skills.js'), 'utf8')
            .replace(/^'use strict';/, '').replace(/export default/, 'module.exports =');
        const mod = {exports: {}};
        new Function('module', 'exports', source)(mod, mod.exports);
        return mod.exports;
    } catch {
        return {skills: {}};   // no current file
    }
}

function build(dir) {
    const groups = new Map(readJsonl(dir, 'groups.jsonl').map(g => [g._key, g]));
    const marketGroups = new Map(readJsonl(dir, 'marketGroups.jsonl').map(m => [m._key, m]));
    const dogma = new Map(readJsonl(dir, 'typeDogma.jsonl')
        .map(t => [t._key, new Map((t.dogmaAttributes || []).map(a => [a.attributeID, a.value]))]));

    const skills = {};
    const prices = {};
    for (const type of readJsonl(dir, 'types.jsonl')) {
        const group = groups.get(type.groupID);
        if (!group || group.categoryID !== SKILL_CATEGORY || !type.published) {
            continue;
        }

        const d = dogma.get(type._key) || new Map();
        const marketGroup = marketGroups.get(type.marketGroupID);
        skills[type._key] = {
            name: type.name.en,
            description: (type.description && type.description.en) || '',
            type_id: type._key,
            market_group_id: type.marketGroupID,
            market_group_name: marketGroup ? marketGroup.name.en : group.name.en,
            primary_attribute: ATTRIBUTES[d.get(PRIMARY)],
            secondary_attribute: ATTRIBUTES[d.get(SECONDARY)],
            training_time_multiplier: d.get(RANK),
            required_skills: PREREQUISITES.filter(([skill]) => d.has(skill)).map(([skill, level]) => ({id: d.get(skill), level: d.get(level)})),
        };
        // skillbooks without an NPC price (found in exploration sites) are left out, which the skillbook panel shows as such
        if (type.basePrice > 0) {
            prices[type._key] = Math.round(type.basePrice);
        }
    }

    // skill browser groups: the market groups under "Skills" that hold published skills
    const skillGroups = [...marketGroups.values()]
        .filter(m => m.parentGroupID === SKILLS_MARKET_GROUP)
        .map(m => ({
            description: (m.description && m.description.en) || '',
            market_group_id: m._key,
            name: m.name.en,
            parent_group_id: SKILLS_MARKET_GROUP,
            types: Object.values(skills).filter(s => s.market_group_id === m._key)
                .sort((a, b) => a.name.localeCompare(b.name)).map(s => s.type_id),
        }))
        .filter(g => g.types.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name));

    // an Alpha clone's cap per skill; the four Alpha grades (one per empire) are combined, taking the highest level
    const alpha = {};
    for (const grade of readJsonl(dir, 'cloneGrades.jsonl')) {
        for (const {typeID, level} of grade.skills || []) {
            if (skills[typeID] !== undefined) {
                const name = skills[typeID].name;
                alpha[name] = Math.max(alpha[name] || 0, level);
            }
        }
    }

    return {skills, prices, skillGroups, alpha};
}

function sortedObject(object, compare) {
    return Object.fromEntries(Object.entries(object).sort(compare));
}

function write(file, header, data) {
    fs.writeFileSync(path.join(ROOT, 'resources', file), `'use strict';\n\n${header}export default ${JSON.stringify(data, null, 4)};\n`);
}

function report(current, skills) {
    const before = current.skills || {};
    const added = Object.values(skills).filter(s => before[s.type_id] === undefined);
    const removed = Object.values(before).filter(s => skills[s.type_id] === undefined);
    const renamed = Object.values(skills).filter(s => before[s.type_id] !== undefined && before[s.type_id].name !== s.name);

    console.log(`\n${Object.keys(skills).length} skills (was ${Object.keys(before).length})`);
    console.log(`New (${added.length}): ${added.map(s => s.name).sort().join(', ') || 'none'}`);
    console.log(`Removed (${removed.length}): ${removed.map(s => s.name).sort().join(', ') || 'none'}`);
    console.log(`Renamed (${renamed.length}): ${renamed.map(s => `${before[s.type_id].name} → ${s.name}`).join(', ') || 'none'}`);
}

async function main() {
    const local = process.argv[2];
    const sde = local ? {dir: local, build: process.env.SDE_BUILD || 'local', date: process.env.SDE_DATE || 'local'} : await downloadSde();
    const current = loadCurrent();
    const {skills, prices, skillGroups, alpha} = build(sde.dir);
    const source = `EVE's static data export, build ${sde.build} (${sde.date}), generated by scripts/update-skills.js`;

    write('all_skills.js', `// Every published skill and the skill groups, from ${source}.\n`,
        {skills: sortedObject(skills, ([a], [b]) => a - b), groups: skillGroups});
    write('skill_base_prices.js',
        `// NPC base price of every skillbook, from ${source}. Buying a skill directly from the in-game skill window\n` +
        '// costs this plus a markup (skill_window_markup in properties.js).\n',
        sortedObject(prices, ([a], [b]) => a - b));
    write('alpha_skill_set.js',
        `// The highest level an Alpha clone can train each skill to (any empire), from ${source}.\n`,
        sortedObject(alpha, ([a], [b]) => a.localeCompare(b)));

    report(current, skills);
    console.log(`\nWrote resources/all_skills.js, skill_base_prices.js and alpha_skill_set.js. Alpha skills: ${Object.keys(alpha).length}.`);
}

main().catch(err => {
    console.error(`Couldn't update skills: ${err.message}`);
    process.exit(1);
});
