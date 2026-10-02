'use strict';

// A ship's paint as the EVE client defines it, read from the client's space object factory files (see
// granny/BlackFile.js): a faction (the ship's default look, or a SKIN's) gives the hull's four paint areas a material
// each, and each material file gives its diffuse colour, specular (Fresnel) colour and gloss, which the viewer uses
// as they are. SKINs that name their own materials (in the SDE) use those.

import log from 'electron-log';

import BlackFile from './granny/BlackFile';
import ShipModelHelper from './ShipModelHelper';
import ShipData from '../../resources/ships';

const SOF = 'res:/dx9/model/spaceobjectfactory/';
const DIELECTRIC = 0.04;   // the usual specular of a non-metal, when a material doesn't give one

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
