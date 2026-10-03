'use strict';

// A ship's paint as the EVE client defines it, read from the client's space object factory files (see
// granny/BlackFile.js): a faction (the ship's default look, or a SKIN's) gives the hull's four paint areas a material
// each, and each material file gives its diffuse colour, specular (Fresnel) colour and gloss, which the viewer uses
// as they are. SKINs that name their own materials (in the SDE) use those.

import log from 'electron-log';

import BlackFile from './granny/BlackFile';
import RedFile from './granny/RedFile';
import ShipModelHelper from './ShipModelHelper';
import ShipData from '../../resources/ships';

const SOF = 'res:/dx9/model/spaceobjectfactory/';
const DIELECTRIC = 0.04;   // the usual specular of a non-metal, when a material doesn't give one

// a colour type (as hulls' lights and decals give it) -> the faction colour set's colour; "Black" isn't stored
const COLOR_TYPES = ['Primary', 'Secondary', 'Tertiary', 'Black', 'White', 'Yellow', 'Orange', 'Red', 'Blue', 'Green', 'Cyan',
    'Fire', 'Hull', 'Glass', 'Reactor', 'Darkhull', 'Booster', 'Killmark', 'PrimaryLight', 'SecondaryLight', 'TertiaryLight',
    'WhiteLight', 'PrimarySpotlight', 'SecondarySpotlight', 'TertiarySpotlight', 'PrimaryHologram', 'SecondaryHologram',
    'TertiaryHologram'];

const cache = new Map();   // res path -> parsed root object (null when missing or unreadable)

function black(res) {
    if (!cache.has(res)) {
        let root = null;
        try {
            const bytes = ShipModelHelper.resource(res);
            if (bytes !== undefined) {
                root = new BlackFile(bytes).root || null;
            }
        } catch (err) {
            log.warn(`[SOF] Couldn't read ${res}`, err.message);
        }
        cache.set(res, root);
    }
    return cache.get(res) || undefined;
}

export default class ShipSof {
    // {diffuse: [r, g, b], specular: [r, g, b] (both linear), roughness, name} of a named material, as the client
    // defines it (diffuse colour, Fresnel colour, gloss), or undefined when the client doesn't have it
    static material(name) {
        if (!name) {
            return undefined;
        }
        const root = black(`${SOF}materials/${name.toLowerCase()}.black`);
        if (root === undefined || !Array.isArray(root.parameters)) {
            return undefined;
        }
        const params = Object.fromEntries(root.parameters.filter(p => p && p.name && p.value).map(p => [p.name, p.value]));
        if (params.DiffuseColor === undefined) {
            return undefined;
        }
        return {
            diffuse: params.DiffuseColor.slice(0, 3),
            specular: (params.FresnelColor || [DIELECTRIC, DIELECTRIC, DIELECTRIC]).slice(0, 3),
            roughness: Math.min(1, Math.max(0.04, 1 - (params.Gloss !== undefined ? params.Gloss[0] : 0.5))),
            name,
        };
    }

    // a faction's colour set: {Hull, Reactor, Booster, Glass, PrimaryLight, ...: [r, g, b] (may be over 1: glows)}
    static colors(faction) {
        const root = faction ? black(`${SOF}factions/${faction.toLowerCase()}.black`) : undefined;
        if (root === undefined || root.colorSet === undefined) {
            return undefined;
        }
        return Object.fromEntries(Object.entries(root.colorSet)
            .filter(([key, value]) => key !== '_class' && Array.isArray(value))
            .map(([key, value]) => [key, value.slice(0, 3)]));
    }

    /**
     * A SKIN pattern's layers on a hull: [{mask (res path of the mask texture), projectionU, projectionV (per axis,
     * outside the box: 0 or undefined repeats, 1 clamps, 2 stops),
     * materialSource (0-3: the hull's materials, 4-5: the SKIN's custom materials), position, scaling, rotation
     * (quaternion), mirrored, targets: [4 booleans: the paint areas it paints]}], only the layers placed on this hull;
     * [] when the pattern isn't placed on it.
     */
    static pattern(name, hull) {
        const root = name ? black(`${SOF}patterns/${name.toLowerCase()}.black`) : undefined;
        if (root === undefined || !Array.isArray(root.projections)) {
            return [];
        }
        const placed = root.projections.find(p => p && p.name === hull);
        if (placed === undefined) {
            return [];
        }
        return [[root.layer1, placed.transformLayer1], [root.layer2, placed.transformLayer2]]
            .filter(([layer, transform]) => layer && transform && layer.textureResFilePath && transform.position)
            .map(([layer, transform]) => ({
                mask: layer.textureResFilePath,
                projectionU: layer.projectionTypeU,
                projectionV: layer.projectionTypeV,
                materialSource: layer.materialSource,
                position: transform.position,
                scaling: transform.scaling || [1, 1, 1],
                rotation: transform.rotation || [0, 0, 0, 1],
                mirrored: transform.isMirrored === 1,
                // which of the hull's four paint areas the layer paints (stored only when off)
                targets: [1, 2, 3, 4].map(i => layer[`isTargetMtl${i}`] !== 0),
            }));
    }

    /**
     * The decals the client puts on a hull with a faction's look (markings, registry lettering, caution stripes, the
     * faction's logo):
     * [{name, meshIndex, indices (the full-detail triangles it covers, as vertex indices), position, rotation,
     * scaling (its projection box: it projects along the box's x, its texture spans y and z), textures: {DecalAlbedoMap,
     * DecalTransparencyMap, ...: res paths}}]. Logo decals take their textures from the faction's logo set.
     */
    static decals(hull, faction) {
        const cacheKey = `decals:${hull}:${faction}`;
        if (cache.has(cacheKey)) {
            return cache.get(cacheKey);
        }
        let decals = [];
        try {
            const bytes = hull ? ShipModelHelper.resource(`${SOF}hulls/${hull.toLowerCase()}.black`) : undefined;
            const sets = bytes !== undefined ? new BlackFile(bytes).findList('decalSets', 'EveSOFDataHullDecalSet') : undefined;
            const factionRoot = faction ? black(`${SOF}factions/${faction.toLowerCase()}.black`) : undefined;
            const logos = (factionRoot && factionRoot.logoSet) || {};
            // the hull's decal sets: those without a visibility group always show; the others (Tech I lettering, police,
            // tournament and event markings) only when the faction switches their group on
            const groups = ShipSof.visibilityGroups(faction);
            const items = (sets || [])
                .filter(set => set && (!set.visibilityGroup || groups.has(set.visibilityGroup)))
                .flatMap(set => set.items || []);
            decals = items
                .filter(item => item && Array.isArray(item.indexBuffers) && item.indexBuffers[0] && item.position && item.scaling)
                .map(item => {
                    let textures = Object.fromEntries((item.textures || [])
                        .filter(t => t && t.name && t.resFilePath)
                        .map(t => [t.name, t.resFilePath]));
                    if (Object.keys(textures).length === 0 && /logo/i.test(item.name || '')) {
                        const logo = logos.Primary;
                        textures = Object.fromEntries(((logo && logo.textures) || [])
                            .filter(t => t && t.name && t.resFilePath)
                            .map(t => [t.name, t.resFilePath]));
                    }
                    return {
                        name: item.name,
                        meshIndex: item.meshIndex || 0,
                        indices: item.indexBuffers[0].indexBuffer,
                        position: item.position,
                        rotation: item.rotation || [0, 0, 0, 1],
                        scaling: item.scaling,
                        textures,
                    };
                })
                .filter(d => d.textures.DecalAlbedoMap !== undefined);
        } catch (err) {
            log.warn(`[SOF] Couldn't read the decals of ${hull}`, err.message);
            decals = [];
        }
        cache.set(cacheKey, decals);
        return decals;
    }

    /**
     * A hull's running lights with a faction's look: [{position, color: [r, g, b] (from the faction's colour set),
     * blinkRate, blinkPhase, minScale, maxScale}], from the hull's sprite sets (those in a visibility group only when the
     * faction switches it on).
     */
    static lights(hull, faction) {
        const cacheKey = `lights:${hull}:${faction}`;
        if (cache.has(cacheKey)) {
            return cache.get(cacheKey);
        }
        let lights = [];
        try {
            const bytes = hull ? ShipModelHelper.resource(`${SOF}hulls/${hull.toLowerCase()}.black`) : undefined;
            const sets = bytes !== undefined ? new BlackFile(bytes).findList('spriteSets', 'EveSOFDataHullSpriteSet') : undefined;
            const groups = ShipSof.visibilityGroups(faction);
            const colors = ShipSof.colors(faction) || {};
            lights = (sets || [])
                .filter(set => set && (!set.visibilityGroup || groups.has(set.visibilityGroup)))
                .flatMap(set => set.items || [])
                .filter(item => item && Array.isArray(item.position))
                .map(item => ({
                    position: item.position,
                    color: colors[COLOR_TYPES[item.colorType || 0]] || [0, 0, 0],
                    blinkRate: item.blinkRate || 0,
                    blinkPhase: item.blinkPhase || 0,
                    minScale: item.minScale !== undefined ? item.minScale : 1,
                    maxScale: item.maxScale !== undefined ? item.maxScale : 1,
                }))
                .filter(light => light.color.some(c => c > 0));
        } catch (err) {
            log.warn(`[SOF] Couldn't read the lights of ${hull}`, err.message);
            lights = [];
        }
        cache.set(cacheKey, lights);
        return lights;
    }

    // the visibility groups a faction switches on (a hull's decals and effects that belong to one show only with it)
    static visibilityGroups(faction) {
        const root = faction ? black(`${SOF}factions/${faction.toLowerCase()}.black`) : undefined;
        const groupSet = root && root.visibilityGroupSet;
        return new Set(((groupSet && groupSet.visibilityGroups) || []).map(g => g && g.str).filter(Boolean));
    }

    /**
     * The effects a hull adds for a faction's look, such as a SKIN's holograms and glowing trails: the root objects of
     * the effect files (see granny/RedFile.js) in the hull's child sets whose visibility group the faction switches on.
     * The hull's always-on children (engine exhausts, lights) aren't included.
     */
    static effects(hull, faction) {
        const cacheKey = `effects:${hull}:${faction}`;
        if (cache.has(cacheKey)) {
            return cache.get(cacheKey);
        }
        let effects = [];
        try {
            const bytes = hull ? ShipModelHelper.resource(`${SOF}hulls/${hull.toLowerCase()}.black`) : undefined;
            const sets = bytes !== undefined ? new BlackFile(bytes).findList('childSets', 'EveSOFDataHullChildSet') : undefined;
            const groups = ShipSof.visibilityGroups(faction);
            const paths = new Set((sets || [])
                .filter(set => set && set.visibilityGroup && groups.has(set.visibilityGroup))
                .flatMap(set => set.items || [])
                .map(item => item && item.redFilePath)
                .filter(Boolean));
            for (const res of paths) {
                // the client keeps .red files under a .black name
                const red = ShipModelHelper.resource(res) || ShipModelHelper.resource(res.replace(/\.red$/i, '.black'));
                const root = red !== undefined ? new RedFile(red).root : undefined;
                if (root !== undefined) {
                    effects.push(root);
                } else {
                    log.warn(`[SOF] Couldn't read the effect ${res}`);
                }
            }
        } catch (err) {
            log.warn(`[SOF] Couldn't read the effects of ${hull}`, err.message);
            effects = [];
        }
        cache.set(cacheKey, effects);
        return effects;
    }

    // the faction whose look a ship has with a SKIN (its own faction when skinId is undefined)
    static factionFor(ship, skinId) {
        const paint = skinId !== undefined ? (ShipData.skins || {})[skinId] : undefined;
        return (paint !== undefined && paint.faction) || (ship.model && ship.model.faction) || undefined;
    }

    /**
     * The texture set a look uses (its "resPathInsert"): a SKIN's own where it names one ("none" = the hull's own
     * textures), else its faction's, e.g. "nefantar", whose textures have clean panels where the hull's own are
     * weathered. Undefined for none.
     */
    static textureSet(ship, skinId) {
        const paint = skinId !== undefined ? (ShipData.skins || {})[skinId] : undefined;
        if (paint !== undefined && paint.textures !== undefined && paint.textures !== null) {
            return /^(none)?$/i.test(paint.textures) ? undefined : paint.textures.toLowerCase();
        }
        const faction = ShipSof.factionFor(ship, skinId);
        const root = faction ? black(`${SOF}factions/${faction.toLowerCase()}.black`) : undefined;
        return root && root.resPathInsert ? root.resPathInsert.toLowerCase() : undefined;
    }

    // whether a SKIN names a texture set of its own (rather than its faction's, or the hull's own textures)
    static namesTextureSet(skinId) {
        const paint = skinId !== undefined ? (ShipData.skins || {})[skinId] : undefined;
        return paint !== undefined && typeof paint.textures === 'string' && !/^(none)?$/i.test(paint.textures);
    }

    // the four material names a faction gives a hull's main ("Primary") paint areas
    static factionMaterials(faction) {
        if (!faction) {
            return undefined;
        }
        const root = black(`${SOF}factions/${faction.toLowerCase()}.black`);
        const primary = root && root.areaTypes && root.areaTypes.Primary;
        if (primary === undefined) {
            return undefined;
        }
        return ['material1', 'material2', 'material3', 'material4'].map(m => primary[m]);
    }

    /**
     * The four paint areas for a ship with a SKIN (or its own look when skinId is undefined), each as material()
     * gives it ({name, missing: true} where the client has no file for the material); undefined when the client's
     * files don't say which materials it uses.
     */
    static areas(ship, skinId) {
        const paint = skinId !== undefined ? (ShipData.skins || {})[skinId] : undefined;
        const faction = (paint !== undefined && paint.faction) || (skinId === undefined && ship.model && ship.model.faction) || undefined;
        const base = ShipSof.factionMaterials(faction) ||
            (paint !== undefined ? ShipSof.factionMaterials(ship.model && ship.model.faction) : undefined) || [];
        // a SKIN's own materials replace its faction's
        const names = [0, 1, 2, 3].map(i => (paint !== undefined && paint.materials[i]) || base[i]);
        if (names.every(n => !n)) {
            return undefined;
        }
        // an area whose material file is missing keeps just its name, for the viewer to approximate
        return names.map(name => ShipSof.material(name) || {name, missing: true});
    }
}
