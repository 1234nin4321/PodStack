'use strict';

// Ship models for the 3D viewer, read from the player's own EVE installation: nothing of CCP's (or RAD's) is shipped
// with PodStack. The client's tq\resfileindex.txt maps each resource ("res:/dx9/model/ship/...") to a file under
// ResFiles\; the hull models are Granny 2 files (see granny/GrannyFile.js) and the textures DDS files.

import fs from 'fs';
import path from 'path';

import GrannyFile from './granny/GrannyFile';
import BlackFile from './granny/BlackFile';
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
// the space object factory's factions (a ship's look, and each SKIN's), hulls and materials
const SOF_PREFIX = 'res:/dx9/model/spaceobjectfactory/';
// The client's files PodStack reads: everything under dx9/model (ships and their effects, the space object factory,
// decals, shared plating and tech textures, the odd hangar texture some hulls' areas use), textures (pattern masks,
// effects' caustics and gradients), generic meshes (planes), and the nebulas the client lights space with (cubemaps).
const MODEL_PREFIX = 'res:/dx9/model/';
const TEXTURE_PREFIX = 'res:/texture/';
const GENERIC_PREFIX = 'res:/graphics/generic/';
const NEBULA_PREFIX = 'res:/dx9/scene/universe/';
const PREFIXES = [MODEL_PREFIX, TEXTURE_PREFIX, GENERIC_PREFIX, NEBULA_PREFIX];
const NEBULA = /^res:\/dx9\/scene\/universe\/([a-z0-9_]+)_cube_lowdetail\.dds$/;

let index;      // {folder, files: Map(res path -> absolute file)}
const declaredAreas = new Map();   // hull -> its areas as its SOF file gives them (null when it has no file)
// a hull area's texture parameters -> the map suffix PodStack uses for them
const TEXTURE_PARAMETERS = {AlbedoMap: 'a', NormalMap: 'n', MaterialMap: 'm', RoughnessMap: 'r', GlowMap: 'g', PaintMaskMap: 'p3', DirtMap: 'd'};
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

    // A plain mesh, such as an effect's (a hologram, a plane): {positions, uvs, indices} of its full-detail meshes
    // together, or undefined when the client doesn't have it or it can't be read.
    static geometry(res) {
        const bytes = ShipModelHelper.resource(res);
        if (bytes === undefined) {
            return undefined;
        }
        try {
            const granny = new GrannyFile(bytes);
            const all = (granny.root().Meshes || []).filter(m => m !== undefined);
            const full = all.filter(m => !/ LOD \d+$/.test(m.Name || ''));
            const positions = [];
            const uvs = [];
            const indices = [];
            const normals = [];
            let base = 0;
            for (const mesh of full.length > 0 ? full : all.slice(0, 1)) {
                const vertices = granny.vertexArray(mesh.PrimaryVertexData && mesh.PrimaryVertexData.Vertices);
                const pos = vertices.fields.Position;
                const uv = vertices.fields.TextureCoordinates0;
                let meshIndices = granny.numberArray(mesh.PrimaryTopology, 'Indices16');
                if (meshIndices.length === 0) {
                    meshIndices = granny.numberArray(mesh.PrimaryTopology, 'Indices');
                }
                if (pos === undefined || pos.components < 3 || vertices.count === 0 || meshIndices.length === 0) {
                    continue;
                }
                positions.push(firstComponents(pos, 3, vertices.count));
                uvs.push(uv !== undefined && uv.components >= 2 ? firstComponents(uv, 2, vertices.count) : new Float32Array(vertices.count * 2));
                indices.push(Uint32Array.from(meshIndices, i => i + base));
                const frames = tangentFrames(vertices.fields.Tangent, vertices.count);
                normals.push(frames !== undefined ? frames.normals : undefined);
                base += vertices.count;
            }
            if (positions.length === 0) {
                return undefined;
            }
            return {
                positions: concat(Float32Array, positions), uvs: concat(Float32Array, uvs), indices: concat(Uint32Array, indices),
                // only when every mesh has its own
                normals: normals.every(Boolean) ? concat(Float32Array, normals) : undefined,
            };
        } catch (err) {
            log.warn(`[Models] Couldn't read ${res}`, err.message);
            return undefined;
        }
    }

    // the names of the client's nebulas (e.g. "c01"), whose cubemaps nebulaResource() gives
    static nebulas() {
        const files = ShipModelHelper.files();
        if (files === undefined) {
            return [];
        }
        return [...files.keys()].map(res => (res.match(NEBULA) || [])[1]).filter(Boolean).sort();
    }

    // a nebula's cubemap: its small HDR (BC6H) one, as the client uses at low detail
    static nebulaResource(name) {
        return ShipModelHelper.resource(`${NEBULA_PREFIX}${name}_cube_lowdetail.dds`);
    }

    // a nebula's reflection cube: what hulls reflect of it (128 pixels, DXT3, its mip levels ever more blurred)
    static nebulaReflection(name) {
        return ShipModelHelper.resource(`${NEBULA_PREFIX}${name}_cube_refl.dds`);
    }

    static isAvailable() {
        return ShipModelHelper.files() !== undefined;
    }

    /**
     * Loads a ship's hull for the viewer:
     * {positions, uvs, indices, normals and tangents (the model's own, see tangentFrames; undefined without), groups:
     * [{start, count, kind: 'hull'|'glass'|'glow'|'booster'|'none' (not drawn), materialIndex (its slot)}], passes (see slotPasses), textures: {albedo (parsed BC7/BC
     * DDS), normal, surface (paint area mask in R, roughness in G), glow (in R): each {width, height, data} RGBA},
     * parts (a Tech III cruiser with subsystems: [{hull, offset, vertexBase (its first vertex in the model)}])}.
     * Textures that are missing are left out. subsystems: a Tech III cruiser's choice (see subsystemModel), else its own.
     */
    static load(ship, insert, subsystems) {
        const assembled = subsystems !== undefined ? ShipModelHelper.subsystemModel(ship, subsystems) : undefined;
        const located = ShipModelHelper.locate(ship);
        const found = assembled !== undefined && located !== undefined ? {...located, model: assembled.model} : located;
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
        const frames = [];
        const groups = [];
        // how the client draws each slot (its SOF file's areas); by the part's name for a hull without one
        const passes = assembled !== undefined ? assembled.passes :
            ShipModelHelper.slotPasses(ship.model.hull) || ShipModelHelper.slotPasses(found.hull);
        // each subsystem's first vertex: its decals count from there
        const partBase = assembled !== undefined ? assembled.parts.map(() => Infinity) : [];
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
                frames.push(tangentFrames(vertices.fields.Tangent, vertices.count));

                const materials = (mesh.MaterialBindings || []).map(b => ((b.Material && b.Material.Name) || '').toLowerCase());
                const meshGroups = topology.Groups && topology.Groups.length > 0 ? topology.Groups :
                    [{MaterialIndex: 0, TriFirst: 0, TriCount: meshIndices.length / 3}];
                meshGroups.forEach((group, slot) => {
                    const name = materials[group.MaterialIndex] || '';
                    groups.push({
                        start: indexBase + group.TriFirst * 3,
                        count: group.TriCount * 3,
                        kind: passes !== undefined ? slotKind(passes.get(slot)) : materialKind(name),
                        // the hull area (see hullAreas) that paints it: the client counts the mesh's groups in order,
                        // whatever material they name (a Tech III cruiser's full-detail mesh names material 0 for all
                        // but its exhaust, though each subsystem has its own textures)
                        materialIndex: slot,
                    });
                    const area = assembled !== undefined ? assembled.opaque[slot] : undefined;
                    if (area !== undefined) {
                        for (let i = group.TriFirst * 3; i < (group.TriFirst + group.TriCount) * 3; i++) {
                            partBase[area.part] = Math.min(partBase[area.part], meshIndices[i] + vertexBase);
                        }
                    }
                });
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
        let areaTextures = {main: {}, sets: new Map(), areas: new Map()};
        try {
            areaTextures = ShipModelHelper.areaTextures(ship, insert, subsystems) || areaTextures;
        } catch (err) {
            log.warn(`[Models] Textures for ${found.model} failed`, err);
        }

        // the model's own normals and tangents, when every mesh has them
        const framed = frames.every(Boolean);
        return {
            positions: concat(Float32Array, positions),
            uvs: concat(Float32Array, uvs),
            indices: concat(Uint32Array, indices),
            normals: framed ? concat(Float32Array, frames.map(f => f.normals)) : undefined,
            tangents: framed ? concat(Float32Array, frames.map(f => f.tangents)) : undefined,
            groups,
            passes,
            textures: areaTextures.main,
            areaTextures,
            parts: assembled !== undefined ?
                assembled.parts.map((part, i) => ({...part, vertexBase: Number.isFinite(partBase[i]) ? partBase[i] : 0})) : undefined,
        };
    }

    /**
     * A ship's textures for a SKIN or faction whose look uses its own texture set (its "resPathInsert", e.g. "nefantar":
     * clean panels where the ship's own textures are weathered); undefined when the client has no model for it.
     */

    // The client's file for one of a hull's maps (a, n, m, r, g...): from the texture set `insert` names where the client
    // has one, else the hull's own. Returns {res, inserted}, or undefined.
    static textureFile(files, folder, names, map, insert) {
        const wanted = insert !== undefined && !/^(none|base)?$/i.test(insert) ? insert.toLowerCase() : undefined;
        for (const name of names) {
            if (wanted !== undefined) {
                // the set's usual places: a folder of its own beside the hull's, or its name in the file's
                const candidates = [`${folder}/${wanted}/${name}_${map}.dds`, `${folder}/${name}_${wanted}_${map}.dds`,
                    `${folder}/${wanted}/${name}_${wanted}_${map}.dds`];
                let res = candidates.find(c => files.has(c));
                if (res === undefined) {
                    const token = new RegExp(`[/_]${wanted.replace(/[^a-z0-9]/g, '.')}[/_.]`);
                    for (const key of files.keys()) {
                        if (key.startsWith(`${folder}/`) && key.endsWith(`_${map}.dds`) && key.includes(name) &&
                            token.test(key.slice(folder.length))) {
                            res = key;
                            break;
                        }
                    }
                }
                if (res !== undefined) {
                    return {res, inserted: true};
                }
            }
            const res = `${folder}/${name}_${map}.dds`;
            if (files.has(res)) {
                return {res, inserted: false};
            }
        }
        return undefined;
    }

    /**
     * A hull's areas as its space object factory file gives them: [{index (the mesh material slot it paints), name,
     * shader, areaType (which of the faction's area types paints it: 0 Primary, 1 Glass, 2 Sails, 3 Reactor,
     * 4 Darkhull, 5 Rock), textures: {a, n, m, r, g, p3, d: res paths}}], or undefined when the hull has no file. An area's
     * textures often aren't named after the hull: a Raptor uses its sister hull's, the Hulk the shared ORE barge
     * textures, and many hulls have areas of shared plating or tech.
     */
    static hullAreas(hull) {
        if (!hull) {
            return undefined;
        }
        const declared = ShipModelHelper.declared(hull);
        return declared !== undefined ? declared.opaque : undefined;
    }

    /**
     * How the client draws each of a hull's mesh material slots, from all of its SOF file's area lists: Map(slot ->
     * {opaque (the area painting it, as hullAreas gives them), transparent (a glass area drawn see-through), additive
     * ([areas drawn over it, glowing: fxv5's layers]), distortion (whether it bends what's behind it, which isn't
     * drawn)}), or undefined when the hull has no file. A slot no area names isn't drawn by the client.
     */
    static slotPasses(hull) {
        const declared = hull ? ShipModelHelper.declared(hull) : undefined;
        return declared !== undefined ? declared.passes : undefined;
    }

    /**
     * A Tech III cruiser with a choice of subsystems ([core, defensive, offensive, propulsion]: each a variant, 1-3):
     * {model (the client's model of that combination), parts: [{hull (the subsystem's SOF hull, e.g. "csc1_t3_s2v3"),
     * offset (where it sits: the core at the origin, each next one where the one before says, its "next_subsystem"
     * locator)}], opaque, passes (areas and passes as hullAreas and slotPasses give them, for the model's mesh groups:
     * each subsystem's areas in turn)}; undefined when the client hasn't got it.
     */
    static subsystemModel(ship, variants) {
        const files = ShipModelHelper.files();
        const hull = ship.model && ship.model.hull;
        if (files === undefined || !hull || !Array.isArray(variants) || variants.length !== 4) {
            return undefined;
        }
        const model = `${ship.model.folder}/${hull}_all/${hull}_${variants.join('')}.gr2`;
        if (!files.has(model)) {
            return undefined;
        }
        const parts = [];
        const opaque = [];
        const passes = new Map();
        let offset = [0, 0, 0];
        for (let slot = 1; slot <= 4; slot++) {
            const part = `${hull}_s${slot}v${variants[slot - 1]}`;
            const declared = ShipModelHelper.declared(part);
            if (declared === undefined) {
                return undefined;
            }
            parts.push({hull: part, offset});
            // the model's groups: each subsystem's areas in turn, in their order
            for (const area of [...declared.opaque].sort((a, b) => a.index - b.index)) {
                const index = opaque.length;
                opaque.push({...area, index, part: slot - 1});
                passes.set(index, {...(declared.passes.get(area.index) || {}), opaque: {...area, index}});
            }
            offset = declared.next ? offset.map((v, i) => v + declared.next[i]) : offset;
        }
        return {model, parts, opaque, passes};
    }

    // the subsystems a Tech III cruiser's own model has ([core, defensive, offensive, propulsion] variants, from the
    // subsystem textures its areas name, e.g. "csc1_t3_s1v2_a.dds"), or undefined
    static defaultSubsystems(hull) {
        const areas = ShipModelHelper.hullAreas(hull) || [];
        const variants = [1, 2, 3, 4].map(slot => {
            const match = areas.map(a => (a.textures.a || '').match(new RegExp(`_s${slot}v(\\d)_a\\.dds$`))).find(Boolean);
            return match ? Number(match[1]) : undefined;
        });
        return variants.every(Boolean) ? variants : undefined;
    }

    // a hull's areas, read once: {opaque: [areas], passes (see slotPasses), next (a Tech III subsystem's: where the
    // next one attaches)}, or undefined when it has no file
    static declared(hull) {
        if (!declaredAreas.has(hull)) {
            let declared = null;
            try {
                const bytes = ShipModelHelper.resource(`${SOF_PREFIX}hulls/${hull.toLowerCase()}.black`);
                const file = bytes !== undefined ? new BlackFile(bytes) : undefined;
                const list = name => ((file && file.findList(name, 'EveSOFDataHullArea')) || []).filter(Boolean).map(area => {
                    const textures = {};
                    const maps = {};
                    for (const t of area.textures || []) {
                        if (t && t.name && t.resFilePath) {
                            maps[t.name] = t.resFilePath.toLowerCase();
                            if (TEXTURE_PARAMETERS[t.name]) {
                                textures[TEXTURE_PARAMETERS[t.name]] = t.resFilePath.toLowerCase();
                            }
                        }
                    }
                    const parameters = Object.fromEntries((area.parameters || [])
                        .filter(p => p && p.name && Array.isArray(p.value)).map(p => [p.name, p.value]));
                    return {
                        index: area.index || 0, name: area.name, shader: area.shader || '', areaType: area.areaType || 0,
                        // engines and reactors: painted hull whose glow map glows in the faction's heat colour
                        heat: /quadheat/i.test(area.shader || ''),
                        textures, maps, parameters,
                    };
                });
                const opaque = file !== undefined ? file.findList('opaqueAreas', 'EveSOFDataHullArea') : undefined;
                if (opaque !== undefined) {
                    const passes = new Map();
                    const slot = index => {
                        if (!passes.has(index)) {
                            passes.set(index, {opaque: undefined, transparent: undefined, additive: [], distortion: false});
                        }
                        return passes.get(index);
                    };
                    const areas = list('opaqueAreas');
                    // alpha-cut parts (grilles, gantries) are drawn as hull: better than not at all
                    for (const area of [...areas, ...list('decalAreas')]) {
                        if (slot(area.index).opaque === undefined) {
                            slot(area.index).opaque = area;
                        }
                    }
                    for (const area of list('transparentAreas')) {
                        slot(area.index).transparent = area;
                    }
                    for (const area of list('additiveAreas')) {
                        slot(area.index).additive.push(area);
                    }
                    for (const area of list('distortionAreas')) {
                        slot(area.index).distortion = true;
                    }
                    // a Tech III subsystem's: where the next subsystem attaches
                    const locators = file.findList('locatorSets', 'EveSOFDataHullLocatorSet') || [];
                    const next = (locators.find(s => s && s.name === 'next_subsystem') || {}).locators;
                    const position = next && next[0] && next[0].position;
                    declared = {opaque: areas, passes, next: position && position.length === 3 ? Array.from(position) : undefined};
                }
            } catch (err) {
                log.warn(`[Models] Couldn't read the areas of ${hull}`, err.message);
            }
            declaredAreas.set(hull, declared);
        }
        return declaredAreas.get(hull) || undefined;
    }

    // the textures of a hull's main area (its first slot's, else the first area's with a colour texture), or undefined
    static hullTextures(hull) {
        const areas = (ShipModelHelper.hullAreas(hull) || []).filter(a => a.textures.a);
        const main = areas.find(a => a.index === 0) || areas[0];
        return main !== undefined ? main.textures : undefined;
    }

    /**
     * A ship's textures area by area: {main (its main area's, as textures() gives them), sets: Map(colour texture res
     * -> textures) of the areas with other textures, areas: Map(mesh material slot -> {set (a key of sets; undefined
     * for main), areaType})}; undefined when the client has no model for it. subsystems: a Tech III cruiser's choice,
     * whose areas are its subsystems' (see subsystemModel).
     */
    static areaTextures(ship, insert, subsystems) {
        const files = ShipModelHelper.files();
        const found = ShipModelHelper.locate(ship);
        if (files === undefined || found === undefined) {
            return undefined;
        }
        const hull = ship.model.hull;
        const assembled = subsystems !== undefined ? ShipModelHelper.subsystemModel(ship, subsystems) : undefined;
        const areas = assembled !== undefined ? assembled.opaque :
            ShipModelHelper.hullAreas(hull) || ShipModelHelper.hullAreas(found.hull) || [];
        // the main area's textures: the core subsystem's, for an assembled Tech III cruiser
        const mainTextures = assembled !== undefined ? (assembled.opaque[0] || {}).textures :
            ShipModelHelper.hullTextures(hull) || ShipModelHelper.hullTextures(found.hull);
        const main = ShipModelHelper.textures(files, found, hull, insert, assembled !== undefined ? mainTextures : undefined);
        const mainAlbedo = (mainTextures || {}).a;
        const sets = new Map();
        const byIndex = new Map();
        for (const area of areas) {
            let set;
            if (area.textures.a && area.textures.a !== mainAlbedo) {
                if (!sets.has(area.textures.a)) {
                    sets.set(area.textures.a, ShipModelHelper.textures(files, found, hull, insert, area.textures));
                }
                set = area.textures.a;
            }
            if (!byIndex.has(area.index)) {
                byIndex.set(area.index, {set, areaType: area.areaType, heat: area.heat});
            }
        }
        return {main, sets, areas: byIndex};
    }

    // The hull's textures, from its own set if it has one (e.g. a navy issue's colours) else the base hull's; and from
    // the texture set `insert` names (a SKIN's or faction's) where the client has it.
    // (declared: an area's textures, as hullAreas gives them; the main area's when left out)
    static textures(files, found, hull, insert, declared) {
        const used = [];
        // the textures the hull's SOF file names, else ones named after the hull
        const named = declared || ShipModelHelper.hullTextures(hull) || ShipModelHelper.hullTextures(found.hull) || {};
        // a map from the set, else (where the set hasn't got it, or it can't be read) the hull's own
        const pick = (map, set = insert) => {
            const res = named[map];
            const parts = res && res.match(/^(.*)\/([^/]+)_([a-z0-9]+)\.dds$/);
            let file = parts && parts[3] === map ? ShipModelHelper.textureFile(files, parts[1], [parts[2]], map, set) : undefined;
            // a name the client's texture sets can't be fitted to (e.g. "..._m2.dds"): as it is
            if (file === undefined && res && files.has(res)) {
                file = {res, inserted: false};
            }
            if (file === undefined) {
                file = ShipModelHelper.textureFile(files, found.folder, [hull, found.hull], map, set);
            }
            if (file === undefined) {
                return undefined;
            }
            try {
                const dds = parseDds(readFile(files.get(file.res)));
                if (file.inserted) {
                    used.push(file.res);
                }
                return dds;
            } catch (err) {
                log.warn(`[Models] ${file.res}: ${err.message}`);
                return file.inserted ? pick(map, 'none') : undefined;
            }
        };

        const textures = {};
        const albedo = pick('a');
        if (albedo !== undefined && !['BC1', 'BC2', 'BC3', 'BC7', 'RGBA8', 'BGRA8'].includes(albedo.format)) {
            log.warn(`[Models] ${found.model}: colour texture in ${albedo.format}, which the viewer can't show`);
        }
        if (albedo !== undefined && ['BC1', 'BC2', 'BC3', 'BC7', 'RGBA8', 'BGRA8'].includes(albedo.format)) {
            textures.albedo = albedo;
        }

        // normal map: two channels (BC5). The client's shader doesn't rebuild the third: it tilts the surface normal by
        // x and y along the tangents (normalize(N + x T + y B)), which is a third channel of 1 here
        const normal = pick('n');
        if (normal !== undefined && normal.format === 'BC5') {
            const mip = normal.mips[0];
            const rgba = new Uint8Array(mip.width * mip.height * 4).fill(255);
            decodeInto(mip, 'BC5', rgba, [0, 1]);
            textures.normal = {width: mip.width, height: mip.height, data: rgba};
        }

        // the material mask (which of the hull's four paint areas each pixel is: _m, in R) and roughness (_r, in G: the
        // client's shader uses it as a gloss multiplier)
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
        // whether the material mask came from the asked-for set (the viewer paints a weathered hull's mask differently)
        textures.insert = insert;
        textures.inserted = used.some(res => res.endsWith('_m.dds'));
        if (declared === undefined && insert !== undefined && !/^(none|base)?$/i.test(insert)) {
            log.info(`[Models] ${found.model}: texture set "${insert}" ${used.length > 0 ? `found (${used.join(', ')})` : 'not in the client, using the hull\'s own'}`);
        }
        return textures;
    }
}

// how a mesh slot is drawn, from the hull's areas for it (see slotPasses): painted hull (engines and reactors too: they
// glow through their glow map), glass, or 'none' where the client draws no surface (nothing names the slot, or only
// glowing layers over it and heat shimmer behind it, which the viewer adds separately or not at all)
function slotKind(pass) {
    if (pass === undefined) {
        return 'none';
    }
    if (pass.opaque !== undefined) {
        return /glass/i.test(pass.opaque.shader) ? 'glass' : 'hull';
    }
    return pass.transparent !== undefined ? 'glass' : 'none';
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

/**
 * The model's own normals and tangents, from its Tangent field: four bytes per vertex, each an angle (0-255 over -π to
 * π), as the client's vertex shader (quadv5) unpacks them: the tangent T and binormal B are unit vectors in spherical
 * coordinates (angles 0-1 and 2-3), and the normal is T × B, flipped unless angles 1 and 3 are both positive. Returns
 * {normals (xyz), tangents (xyzw: T, with w the sign that turns N × T into B, as three.js rebuilds the binormal)}, or
 * undefined without the field (the viewer then works normals out from the triangles).
 */
function tangentFrames(field, count) {
    if (field === undefined || field.components !== 4) {
        return undefined;
    }
    const normals = new Float32Array(count * 3);
    const tangents = new Float32Array(count * 4);
    const angle = b => b / 255 * 2 * Math.PI - Math.PI;
    for (let i = 0; i < count; i++) {
        const a = [0, 1, 2, 3].map(k => angle(field.data[i * 4 + k]));
        const t = [Math.abs(Math.sin(a[1])) * Math.cos(a[0]), Math.abs(Math.sin(a[1])) * Math.sin(a[0]), Math.cos(a[1])];
        const b = [Math.abs(Math.sin(a[3])) * Math.cos(a[2]), Math.abs(Math.sin(a[3])) * Math.sin(a[2]), Math.cos(a[3])];
        const flip = a[1] > 0 && a[3] > 0 ? 1 : -1;
        let n = [t[1] * b[2] - b[1] * t[2], t[2] * b[0] - b[2] * t[0], t[0] * b[1] - b[0] * t[1]];
        const length = Math.hypot(...n) || 1;
        n = n.map(c => c * flip / length);
        // which way N × T points along B
        const nt = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]];
        const w = nt[0] * b[0] + nt[1] * b[1] + nt[2] * b[2] < 0 ? -1 : 1;
        normals.set(n, i * 3);
        tangents.set([...t, w], i * 4);
    }
    return {normals, tangents};
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
