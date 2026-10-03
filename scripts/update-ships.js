'use strict';

// Regenerates PodStack's ship data from EVE's static data export (SDE):
//
//   resources/ships.js   every published ship on the market: class, race, tech/meta group, the skills it needs, and
//                        where its hull model is in the EVE client's files and the SKINs it can wear (for the 3D
//                        viewer), plus each SKIN's paint: colours, materials and pattern; a Tech III cruiser's
//                        subsystems (which pick its model); and the names of the regions each of the client's
//                        nebulas is seen in (the viewer's backdrops)
//
// Usage: `npm run update-ships` downloads the latest SDE from CCP (about 100 MB), or
// `npm run update-ships -- <folder>` uses an already extracted JSONL SDE. It prints which ships are new or removed.
// Run it after CCP adds ships (alongside update-skills), then review and commit the changes.

const fs = require('fs');
const os = require('os');
const path = require('path');
const {execFileSync} = require('child_process');

const ROOT = path.join(__dirname, '..');
const SDE_URL = 'https://developers.eveonline.com/static-data/tranquility';
const SHIP_CATEGORY = 6;
const SUBSYSTEM_CATEGORY = 32;
// the dogma attribute naming the ship a subsystem fits
const FITS_TO_SHIP_TYPE = 1380;
const FILES = ['types.jsonl', 'groups.jsonl', 'typeDogma.jsonl', 'races.jsonl', 'metaGroups.jsonl', 'graphics.jsonl',
    'skins.jsonl', 'skinMaterials.jsonl', 'graphicMaterialSets.jsonl', 'mapRegions.jsonl', '_sde.jsonl'];

// the same skill/level dogma attribute pairs skills use for their prerequisites
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

function loadCurrent() {
    try {
        const source = fs.readFileSync(path.join(ROOT, 'resources', 'ships.js'), 'utf8')
            .replace(/^'use strict';/, '').replace(/export default/, 'module.exports =');
        const mod = {exports: {}};
        new Function('module', 'exports', source)(mod, mod.exports);
        return mod.exports;
    } catch {
        return {ships: {}};
    }
}

// The hull's folder and name in the client's resources, e.g. {folder: 'res:/dx9/model/ship/minmatar/frigate/mf4',
// hull: 'mf4_t1'}: its model is <folder>/<hull>.gr2 and its textures <folder>/<hull>_<map>.dds.
function modelOf(graphic) {
    if (!graphic || !graphic.sofHullName || !graphic.iconFolder) {
        return undefined;
    }
    const folder = graphic.iconFolder.replace(/\\/g, '/').replace(/\/icons\/?$/i, '').toLowerCase();
    return {folder, hull: graphic.sofHullName.toLowerCase(), faction: (graphic.sofFactionName || '').toLowerCase()};
}

// "#rrggbb" from the SDE's {r, g, b} in 0-1
function hex(color) {
    if (!color) {
        return undefined;
    }
    const c = v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
    return `#${c(color.r)}${c(color.g)}${c(color.b)}`;
}

// Each ship's SKINs ([{id, name}], by skin material, without duplicates) and each skin material's paint.
// a material or pattern name, or null where the SDE gives none ("None" means not set)
function named(value) {
    return value && !/^none$/i.test(value) ? value : null;
}

function buildSkins(dir) {
    const sets = new Map(readJsonl(dir, 'graphicMaterialSets.jsonl').map(m => [m._key, m]));
    const materials = new Map(readJsonl(dir, 'skinMaterials.jsonl').map(m => [m._key, m]));
    const byType = new Map();
    const paints = {};

    for (const skin of readJsonl(dir, 'skins.jsonl')) {
        const material = materials.get(skin.skinMaterialID);
        if (!skin.visibleTranquility || material === undefined) {
            continue;
        }
        const set = sets.get(material.materialSetID) || {};
        paints[skin.skinMaterialID] = paints[skin.skinMaterialID] || {
            name: material.displayName.en,
            faction: set.sofFactionName,
            colors: [hex(set.colorHull), hex(set.colorPrimary), hex(set.colorSecondary), hex(set.colorWindow)],
            materials: [named(set.material1), named(set.material2), named(set.material3), named(set.material4)],
            custom: [named(set.custommaterial1), named(set.custommaterial2)],
            pattern: named(set.sofPatternName) || undefined,
            textures: set.resPathInsert,
        };
        for (const typeId of skin.types || []) {
            const list = byType.get(typeId) || new Map();
            list.set(skin.skinMaterialID, {id: skin.skinMaterialID, name: material.displayName.en});
            byType.set(typeId, list);
        }
    }
    return {byType, paints};
}

// The subsystems each Tech III cruiser can fit: ship type -> [{id, name, slot (1 core, 2 defensive, 3 offensive,
// 4 propulsion), variant}], from the subsystem's model in the client ("csc1_t3_s2v3": slot 2, variant 3), which the
// ship's model is assembled from.
function buildSubsystems(dir, groups, graphics, dogma) {
    const byShip = new Map();
    for (const type of readJsonl(dir, 'types.jsonl')) {
        const group = groups.get(type.groupID);
        const match = ((graphics.get(type.graphicID) || {}).sofHullName || '').match(/_s([1-4])v(\d+)$/i);
        const ship = (dogma.get(type._key) || new Map()).get(FITS_TO_SHIP_TYPE);
        if (!group || group.categoryID !== SUBSYSTEM_CATEGORY || !type.published || !match || ship === undefined) {
            continue;
        }
        const list = byShip.get(ship) || [];
        list.push({id: type._key, name: type.name.en, slot: Number(match[1]), variant: Number(match[2])});
        byShip.set(ship, list);
    }
    for (const list of byShip.values()) {
        list.sort((a, b) => a.slot - b.slot || a.variant - b.variant);
    }
    return byShip;
}

// each nebula the regions use (by the name of its cubemap in the client, e.g. "c02") -> those regions' names, e.g.
// ["The Forge", "GPMR-01"]
function buildNebulas(dir, graphics) {
    const nebulas = {};
    for (const region of readJsonl(dir, 'mapRegions.jsonl')) {
        const graphic = graphics.get(region.nebulaID);
        const match = graphic && (graphic.graphicFile || '').match(/\/universe\/([a-z0-9_]+)_cube\.red$/i);
        if (match) {
            const name = match[1].toLowerCase();
            (nebulas[name] = nebulas[name] || []).push(region.name.en);
        }
    }
    return nebulas;
}

function build(dir) {
    const groups = new Map(readJsonl(dir, 'groups.jsonl').map(g => [g._key, g]));
    const races = new Map(readJsonl(dir, 'races.jsonl').map(r => [r._key, r.name.en]));
    const metaGroups = new Map(readJsonl(dir, 'metaGroups.jsonl').map(m => [m._key, m.name.en]));
    const graphics = new Map(readJsonl(dir, 'graphics.jsonl').map(g => [g._key, g]));
    const dogma = new Map(readJsonl(dir, 'typeDogma.jsonl')
        .map(t => [t._key, new Map((t.dogmaAttributes || []).map(a => [a.attributeID, a.value]))]));

    const {byType, paints} = buildSkins(dir);
    const subsystems = buildSubsystems(dir, groups, graphics, dogma);
    const ships = {};
    const usedRaces = {};
    for (const type of readJsonl(dir, 'types.jsonl')) {
        const group = groups.get(type.groupID);
        // published and sold on the market: leaves out NPC hulls, tournament prizes and the like
        if (!group || group.categoryID !== SHIP_CATEGORY || !type.published || type.marketGroupID === undefined) {
            continue;
        }

        const attributes = dogma.get(type._key) || new Map();
        const skills = PREREQUISITES
            .filter(([skill]) => attributes.has(skill))
            .map(([skill, level]) => ({id: attributes.get(skill), level: attributes.get(level) || 1}));

        if (type.raceID !== undefined && races.has(type.raceID)) {
            usedRaces[type.raceID] = races.get(type.raceID);
        }
        ships[type._key] = {
            type_id: type._key,
            name: type.name.en,
            group_id: type.groupID,
            group: group.name.en,
            race_id: type.raceID,
            meta: metaGroups.get(type.metaGroupID) || 'Tech I',
            skills,
            model: modelOf(graphics.get(type.graphicID)),
            skins: [...(byType.get(type._key) || new Map()).values()].sort((a, b) => a.name.localeCompare(b.name)),
        };
        if (subsystems.has(type._key)) {
            ships[type._key].subsystems = subsystems.get(type._key);
        }
    }

    // only the paints some ship here can wear
    const used = new Set(Object.values(ships).flatMap(s => s.skins.map(k => k.id)));
    const skinPaints = Object.fromEntries(Object.entries(paints).filter(([id]) => used.has(Number(id))));
    return {ships, races: usedRaces, skins: skinPaints, nebulas: buildNebulas(dir, graphics)};
}

function header(build, date) {
    return `'use strict';\n\n// Every published ship on the market, from EVE's static data export, build ${build} (${date}), generated by scripts/update-ships.js.\n`;
}

(async () => {
    const folder = process.argv[2];
    let source;
    if (folder !== undefined) {
        // the build is in _sde.jsonl when the folder has it
        let info = {};
        try {
            info = readJsonl(folder, '_sde.jsonl')[0] || {};
        } catch {
            // no _sde.jsonl: the build shows as "local"
        }
        source = {dir: folder, build: info.buildNumber || 'local', date: (info.releaseDate || new Date().toISOString()).slice(0, 10)};
    } else {
        source = await downloadSde();
    }

    const current = loadCurrent();
    const data = build(source.dir);

    const added = Object.keys(data.ships).filter(id => current.ships[id] === undefined);
    const removed = Object.keys(current.ships).filter(id => data.ships[id] === undefined);
    console.log(`${Object.keys(data.ships).length} ships (${added.length} new, ${removed.length} removed)`);
    added.slice(0, 50).forEach(id => console.log(`  + ${data.ships[id].name}`));
    removed.slice(0, 50).forEach(id => console.log(`  - ${current.ships[id].name}`));

    fs.writeFileSync(path.join(ROOT, 'resources', 'ships.js'),
        header(source.build, source.date) + 'export default ' + JSON.stringify(data) + ';\n');
})().catch(err => {
    console.error(err);
    process.exit(1);
});
