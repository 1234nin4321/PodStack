'use strict';

// How a SKIN paints a hull, for the 3D viewer. A hull's material mask (its _m texture) splits it into four areas;
// a SKIN gives each area a material (colour and finish). Until the exact materials are read from the client's
// space object factory files, they're worked out from what the SDE says about the SKIN: its materials' names (e.g.
// "grey_darksteel_brushed", "yellow_starburst_enamel") or, where it lists none, its four colours.

import ShipData from '../../resources/ships';

// colour words in material names
const COLORS = {
    black: '#16181b', white: '#e4e6e8', grey: '#6d7277', gray: '#6d7277', silver: '#b8bcc0', chrome: '#d0d4d8',
    gold: '#c9a24a', bronze: '#8c6a3f', copper: '#a5643f', brass: '#b59a52', tan: '#a08a6a', beige: '#b9aa8c',
    cream: '#d8cdb2', brown: '#5e4632', red: '#8e1d1d', crimson: '#7a1020', orange: '#c4621c', yellow: '#d8b026',
    green: '#2f6b38', olive: '#5d6236', teal: '#1f6f6f', aqua: '#2b9bb0', cyan: '#2ba8c2', blue: '#24477e',
    navy: '#1b2a4a', purple: '#55307a', violet: '#6a3e9a', magenta: '#9a2a7a', pink: '#c27391', rust: '#7a3b22',
};

// finishes: [roughness, metalness]
const FINISHES = [
    [/chrome|mirror/, [0.06, 1.0]], [/polished/, [0.15, 0.95]], [/brushed/, [0.35, 0.9]], [/metallic|metal/, [0.3, 0.85]],
    [/satin/, [0.45, 0.35]], [/matt|matte|flat|rough/, [0.75, 0.1]], [/enamel|gloss/, [0.25, 0.1]],
    [/coated|paint/, [0.4, 0.15]], [/rust|weathered|worn/, [0.85, 0.3]], [/carbon/, [0.4, 0.2]],
];

function colorFromName(name) {
    const words = name.toLowerCase().split(/[_\s]+/);
    for (const word of words) {
        if (COLORS[word] !== undefined) {
            return COLORS[word];
        }
    }
    return undefined;
}

function finishFromName(name) {
    const found = FINISHES.find(([re]) => re.test(name.toLowerCase()));
    return found !== undefined ? found[1] : [0.45, 0.5];
}

export default class ShipPaint {
    // {color, roughness, metalness} guessed from a material's name, e.g. "grey_darksteel_brushed"
    static fromName(name, fallbackColor = '#808080') {
        const [roughness, metalness] = finishFromName(name || '');
        return {color: (name && colorFromName(name)) || fallbackColor, roughness, metalness, name};
    }

    static skinsFor(ship) {
        return ship.skins || [];
    }

    static paint(skinId) {
        return (ShipData.skins || {})[skinId];
    }

    /**
     * The four areas' materials for a SKIN: [{color: '#rrggbb', roughness, metalness}], area 0 being the hull's main
     * surface; and the colour its lights glow in.
     */
    static areas(skinId) {
        const paint = ShipPaint.paint(skinId);
        if (paint === undefined) {
            return undefined;
        }
        const areas = [0, 1, 2, 3].map(i => {
            const name = paint.materials[i];
            const fallback = paint.colors[Math.min(i, 2)] || '#808080';
            if (name) {
                const [roughness, metalness] = finishFromName(name);
                return {color: colorFromName(name) || fallback, roughness, metalness, name};
            }
            // a SKIN without named materials: its hull, primary and secondary colours, in a satin metal
            return {color: fallback, roughness: 0.45, metalness: 0.6};
        });
        return {areas, glow: paint.colors[3] || '#ffc48a'};
    }
}
