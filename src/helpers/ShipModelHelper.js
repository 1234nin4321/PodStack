'use strict';

// Ship models for the 3D viewer, read from the player's own EVE installation: nothing of CCP's (or RAD's) is shipped
// with PodStack. The client's tq\resfileindex.txt maps each resource ("res:/dx9/model/ship/...") to a file under
// ResFiles\; the hull models are Granny 2 files (see granny/GrannyFile.js) and the textures DDS files.

import fs from 'fs';
import path from 'path';

import GrannyFile from './granny/GrannyFile';
import {parseDds, decodeInto} from './granny/Dds';
import SettingsHelper from './SettingsHelper';
import log from 'electron-log';

const SETTING = 'eve_folder';
// where EVE gets installed, relative to a drive's root: the launcher's default (CCP\EVE), the old shared cache
// (EVE\SharedCache), and other common choices
const DRIVE_PATHS = [
    'CCP\\EVE', 'EVE', 'EVE\\SharedCache', 'CCP\\EVE\\SharedCache', 'CCP\\SharedCache', 'SharedCache',
    'Program Files\\CCP\\EVE', 'Program Files (x86)\\CCP\\EVE', 'Games\\EVE', 'Games\\CCP\\EVE', 'Games\\EVE Online',
    'EVE Online', 'SteamLibrary\\steamapps\\common\\Eve Online', 'Steam\\steamapps\\common\\Eve Online',
    'Program Files (x86)\\Steam\\steamapps\\common\\Eve Online', 'Program Files\\Steam\\steamapps\\common\\Eve Online',
];
// folder names worth looking inside when searching a drive
const EVE_LIKE = /eve|ccp|sharedcache|games|steam/i;
const SHIP_PREFIX = 'res:/dx9/model/ship/';
// the space object factory's factions (a ship's look, and each SKIN's) and materials, for paint
const SOF_PREFIX = 'res:/dx9/model/spaceobjectfactory/';
// the masks SKIN patterns project onto hulls
const PATTERN_PREFIX = 'res:/texture/projection/';
// decal textures: markings, lettering, logos
const DECAL_PREFIX = 'res:/dx9/model/decal/';
const PREFIXES = [SHIP_PREFIX, SOF_PREFIX, PATTERN_PREFIX, DECAL_PREFIX];

let index;      // {folder, files: Map(res path -> absolute file)}
let detected;   // the auto-detected folder (null when none), found once per session

function isEveFolder(folder) {
    try {
        return fs.existsSync(path.join(folder, 'tq', 'resfileindex.txt')) && fs.existsSync(path.join(folder, 'ResFiles'));
    } catch (err) {
        return false;
    }
}

function subfolders(dir) {
    try {
        return fs.readdirSync(dir, {withFileTypes: true}).filter(e => e.isDirectory()).map(e => path.join(dir, e.name));
    } catch (err) {
        return [];   // no access, or not there
    }
}

// dir itself if it's an EVE install, else one inside it (up to `depth` levels down, only through EVE-like names below
// the first level), or undefined
function findIn(dir, depth) {
    if (isEveFolder(dir)) {
        return dir;
    }
    if (depth <= 0) {
        return undefined;
    }
    for (const sub of subfolders(dir)) {
        if (isEveFolder(sub)) {
            return sub;
        }
    }
    for (const sub of subfolders(dir).filter(s => EVE_LIKE.test(path.basename(s)))) {
        const found = findIn(sub, depth - 1);
        if (found !== undefined) {
            return found;
        }
    }
    return undefined;
}

function drives() {
    if (process.platform !== 'win32') {
        return [];
    }
    return 'CDEFGHIJKLMNOPQRSTUVWXYZAB'.split('').map(l => `${l}:\\`).filter(d => {
        try {
            return fs.existsSync(d);
        } catch (err) {
            return false;
        }
    });
}

// Install paths written in the EVE launcher's settings (any JSON/INI/YAML/text file in its AppData folders).
function launcherPaths() {
    const roots = [process.env.APPDATA, process.env.LOCALAPPDATA]
        .filter(Boolean)
        .flatMap(r => [path.join(r, 'EVE Online'), path.join(r, 'CCP'), path.join(r, 'eve-online')]);
    const found = new Set();
    const scan = (dir, depth) => {
        let entries = [];
        try {
            entries = fs.readdirSync(dir, {withFileTypes: true});
        } catch (err) {
            return;
        }
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory() && depth > 0) {
                scan(full, depth - 1);
            } else if (e.isFile() && /\.(json|ini|ya?ml|txt|cfg)$/i.test(e.name)) {
                try {
                    if (fs.statSync(full).size > 2 * 1024 * 1024) {
                        continue;
                    }
                    const text = fs.readFileSync(full, 'utf8').replace(/\\\\/g, '\\').replace(/\//g, '\\');
                    for (const m of text.matchAll(/[A-Za-z]:\\[^"'\r\n<>|?*]+/g)) {
                        found.add(m[0].replace(/\\+$/, ''));
                    }
                } catch (err) {
                    // unreadable: skip
                }
            }
        }
    };
    roots.forEach(r => scan(r, 3));
    // each path, and its parents, may be (or hold) the install
    const candidates = new Set();
    for (const p of found) {
        let dir = p;
        for (let i = 0; i < 4 && dir.length > 3; i++) {
            candidates.add(dir);
            dir = path.dirname(dir);
        }
    }
    return [...candidates];
}

// Looks for an EVE install: the usual places on every drive, paths in the launcher's settings, then folders named like
// EVE/CCP/Games/Steam up to two levels below each drive's root.
function detect() {
    const roots = drives();
    for (const drive of roots) {
        for (const rel of DRIVE_PATHS) {
            if (isEveFolder(path.join(drive, rel))) {
                return path.join(drive, rel);
            }
        }
    }
    for (const candidate of launcherPaths()) {
        const found = findIn(candidate, 1);
        if (found !== undefined) {
            return found;
        }
    }
    for (const drive of roots) {
        for (const sub of subfolders(drive).filter(s => EVE_LIKE.test(path.basename(s)))) {
            const found = findIn(sub, 2);
            if (found !== undefined) {
                return found;
            }
        }
    }
    return undefined;
}

function readFile(file) {
    const buffer = fs.readFileSync(file);
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

export default class ShipModelHelper {
    // The EVE folder to read models from: the one set in Settings, else the first standard install found.
    static eveFolder() {
        const saved = SettingsHelper.get(SETTING, '');
        if (saved !== '' && isEveFolder(saved)) {
            return saved;
        }
        if (detected === undefined) {
            detected = detect() || null;
        }
        return detected || undefined;
    }

    // Searches again (after installing EVE, or moving it). Returns the folder found, if any.
    static redetect() {
        detected = undefined;
        index = undefined;
        return ShipModelHelper.eveFolder();
    }

    static savedFolder() {
        return SettingsHelper.get(SETTING, '');
    }

    /**
     * Saves the folder holding an EVE install (with tq\\resfileindex.txt and ResFiles), or one found inside it (so
     * picking C:\\CCP or a SharedCache folder works too); '' goes back to finding it automatically.
     *
     * @returns {string|undefined} the folder saved, or undefined if there's no EVE install there
     */
    static setEveFolder(folder) {
        const found = folder === '' ? '' : findIn(folder, 2);
        if (found !== undefined) {
            SettingsHelper.set(SETTING, found);
            index = undefined;
        }
        return found;
    }

    // the ship resources in the client's index (read once; only ship models and textures are kept)
    static files() {
        const folder = ShipModelHelper.eveFolder();
        if (folder === undefined) {
            return undefined;
        }
        if (index === undefined || index.folder !== folder) {
            const files = new Map();
            const text = fs.readFileSync(path.join(folder, 'tq', 'resfileindex.txt'), 'utf8');
            for (const line of text.split('\n')) {
                if (!PREFIXES.some(prefix => line.startsWith(prefix))) {
                    continue;
                }
                const [res, file] = line.split(',');
                files.set(res.toLowerCase(), path.join(folder, 'ResFiles', ...file.split('/')));
            }
            index = {folder, files};
        }
        return index.files;
    }

    // {model: res path, hull: the hull the files are named after}, or undefined when the client has no model for it
    static locate(ship) {
        const files = ShipModelHelper.files();
        if (files === undefined || ship.model === undefined) {
            return undefined;
        }
        const {folder, hull} = ship.model;
        // variants (navy, pirate, special editions) without a model of their own use their base hull's
        const base = hull.replace(/_[^_]+$/, '');
        for (const name of [hull, `${base}_t1`]) {
            if (files.has(`${folder}/${name}.gr2`)) {
                return {model: `${folder}/${name}.gr2`, hull: name, folder};
            }
        }
        return undefined;
    }

    // the bytes of a client resource ("res:/..."), or undefined when the client doesn't have it
    static resource(res) {
        const files = ShipModelHelper.files();
        const file = files !== undefined ? files.get(res.toLowerCase()) : undefined;
        return file !== undefined ? readFile(file) : undefined;
    }

    static isAvailable() {
        return ShipModelHelper.files() !== undefined;
    }

    /**
     * Loads a ship's hull for the viewer:
     * {positions, uvs, indices, groups: [{start, count, kind: 'hull'|'glass'|'glow'|'booster'}], textures: {albedo (parsed BC7/BC
     * DDS), normal, surface (paint area mask in R, roughness in G), glow (in R): each {width, height, data} RGBA}}.
     * Textures that are missing are left out.
     */
    static load(ship) {
        const found = ShipModelHelper.locate(ship);
        if (found === undefined) {
            throw new Error('Your EVE client has no model for this ship.');
        }
        const files = ShipModelHelper.files();

        const file = found.model.split('/').pop();
        let granny;
        let root;
        try {
            granny = new GrannyFile(readFile(files.get(found.model)));
            root = granny.root();
        } catch (err) {
            log.warn(`[Models] Couldn't read ${found.model}`, err);
            throw new Error(`Couldn't read ${file}: ${err.message}.`);
        }
        // the full-detail meshes; the "LOD n" ones are lower-detail copies (used only when there's nothing else)
        const all = (root.Meshes || []).filter(m => m !== undefined);
        const full = all.filter(m => !/ LOD \d+$/.test(m.Name || ''));
        const meshes = full.length > 0 ? full : all.slice(0, 1);

        const positions = [];
        const uvs = [];
        const indices = [];
        const groups = [];
        const problems = [];
        let vertexBase = 0;
        let indexBase = 0;
        for (const mesh of meshes) {
            try {
                const vertices = granny.vertexArray(mesh.PrimaryVertexData && mesh.PrimaryVertexData.Vertices);
                const pos = vertices.fields.Position;
                const uv = vertices.fields.TextureCoordinates0;
                if (pos === undefined || pos.components < 3 || vertices.count === 0) {
                    problems.push(`${mesh.Name}: no positions`);
                    continue;
                }
                const topology = mesh.PrimaryTopology;
                let meshIndices = granny.numberArray(topology, 'Indices16');
                if (meshIndices.length === 0) {
                    meshIndices = granny.numberArray(topology, 'Indices');
                }
                if (meshIndices.length === 0) {
                    problems.push(`${mesh.Name}: no triangles`);
                    continue;
                }

                positions.push(firstComponents(pos, 3, vertices.count));
                uvs.push(uv !== undefined && uv.components >= 2 ? firstComponents(uv, 2, vertices.count) : new Float32Array(vertices.count * 2));
                indices.push(meshIndices.map(i => i + vertexBase));

                const materials = (mesh.MaterialBindings || []).map(b => ((b.Material && b.Material.Name) || '').toLowerCase());
                const meshGroups = topology.Groups && topology.Groups.length > 0 ? topology.Groups :
                    [{MaterialIndex: 0, TriFirst: 0, TriCount: meshIndices.length / 3}];
                for (const group of meshGroups) {
                    const name = materials[group.MaterialIndex] || '';
                    groups.push({
                        start: indexBase + group.TriFirst * 3,
                        count: group.TriCount * 3,
                        kind: materialKind(name),
                    });
                }
                vertexBase += vertices.count;
                indexBase += meshIndices.length;
            } catch (err) {
                problems.push(`${mesh.Name}: ${err.message}`);
            }
        }
        if (problems.length > 0) {
            log.warn(`[Models] ${found.model}: skipped ${problems.join('; ')}`);
        }
        if (positions.length === 0) {
            throw new Error(`${file} has no mesh PodStack can show${problems.length > 0 ? ` (${problems[0]})` : ''}.`);
        }

        // textures are a bonus: without them the hull is shown in plain metal
        let textures = {};
        try {
            textures = ShipModelHelper.textures(files, found, ship.model.hull);
        } catch (err) {
            log.warn(`[Models] Textures for ${found.model} failed`, err);
        }

        return {
            positions: concat(Float32Array, positions),
            uvs: concat(Float32Array, uvs),
            indices: concat(Uint32Array, indices),
            groups,
            textures,
        };
    }

    // The hull's textures, from its own set if it has one (e.g. a navy issue's colours) else the base hull's.
    static textures(files, found, hull) {
        const pick = map => {
            for (const name of [hull, found.hull]) {
                const res = `${found.folder}/${name}_${map}.dds`;
                if (files.has(res)) {
                    try {
                        return parseDds(readFile(files.get(res)));
                    } catch (err) {
                        return undefined;
                    }
                }
            }
            return undefined;
        };

        const textures = {};
        const albedo = pick('a');
        if (albedo !== undefined && ['BC1', 'BC3', 'BC7'].includes(albedo.format)) {
            textures.albedo = albedo;
        }

        // normal map: two channels (BC5), with the third rebuilt so ordinary normal mapping works
        const normal = pick('n');
        if (normal !== undefined && normal.format === 'BC5') {
            const mip = normal.mips[0];
            const rgba = new Uint8Array(mip.width * mip.height * 4).fill(255);
            decodeInto(mip, 'BC5', rgba, [0, 1]);
            for (let i = 0; i < rgba.length; i += 4) {
                const x = rgba[i] / 127.5 - 1;
                const y = rgba[i + 1] / 127.5 - 1;
                rgba[i + 2] = Math.round((Math.sqrt(Math.max(0, 1 - x * x - y * y)) + 1) * 127.5);
            }
            textures.normal = {width: mip.width, height: mip.height, data: rgba};
        }

        // the material mask (which of the hull's four paint areas each pixel is: _m, in R) and roughness (_r, in G)
        const mask = pick('m');
        const roughness = pick('r');
        const base = mask || roughness;
        if (base !== undefined) {
            const mip = base.mips[0];
            const rgba = new Uint8Array(mip.width * mip.height * 4).fill(255);
            for (let i = 0; i < rgba.length; i += 4) {
                rgba[i] = 0;          // area 0 (the main hull) where there's no mask
                rgba[i + 1] = 128;    // middling roughness where there's no roughness map
            }
            if (mask !== undefined && mask.format === 'BC4' && mask.width === mip.width) {
                decodeInto(mask.mips[0], 'BC4', rgba, [0]);
            }
            if (roughness !== undefined && roughness.format === 'BC4' && roughness.width === mip.width) {
                decodeInto(roughness.mips[0], 'BC4', rgba, [1]);
            }
            textures.surface = {width: mip.width, height: mip.height, data: rgba};
        }

        const glow = pick('g');
        if (glow !== undefined && glow.format === 'BC4') {
            const mip = glow.mips[0];
            const rgba = new Uint8Array(mip.width * mip.height * 4).fill(255);
            decodeInto(mip, 'BC4', rgba, [0]);
            for (let i = 0; i < rgba.length; i += 4) {
                rgba[i + 1] = rgba[i];
                rgba[i + 2] = rgba[i];
            }
            textures.glow = {width: mip.width, height: mip.height, data: rgba};
        }
        return textures;
    }
}

// how a material is drawn, from its name: glass, an engine's exhaust, another glowing part (reactor, lights), or hull
function materialKind(name) {
    if (name.includes('glass')) {
        return 'glass';
    }
    if (/exhaust|booster|thruster|engine/.test(name)) {
        return 'booster';
    }
    return /reactor|glow|light/.test(name) ? 'glow' : 'hull';
}

// the first n components of each item of a vertex field ({components, data}), packed tightly
function firstComponents(field, n, count) {
    if (field.components === n) {
        return field.data;
    }
    const out = new Float32Array(count * n);
    for (let i = 0; i < count; i++) {
        for (let c = 0; c < n; c++) {
            out[i * n + c] = field.data[i * field.components + c];
        }
    }
    return out;
}

function concat(Type, arrays) {
    const out = new Type(arrays.reduce((n, a) => n + a.length, 0));
    let offset = 0;
    for (const a of arrays) {
        out.set(a, offset);
        offset += a.length;
    }
    return out;
}
