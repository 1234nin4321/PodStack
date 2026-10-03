'use strict';

import React from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';

import ShipModelHelper from '../../helpers/ShipModelHelper';
import ShipPaint from '../../helpers/ShipPaint';
import ShipSof from '../../helpers/ShipSof';
import {parseDds, decodeInto} from '../../helpers/granny/Dds';

const HEIGHT = 460;
const COMPRESSED = {
    BC7: {extension: 'EXT_texture_compression_bptc', format: THREE.RGBA_BPTC_Format},
    BC1: {extension: 'WEBGL_compressed_texture_s3tc', format: THREE.RGB_S3TC_DXT1_Format},
    BC3: {extension: 'WEBGL_compressed_texture_s3tc', format: THREE.RGBA_S3TC_DXT5_Format},
};
const LIGHTING = {
    ingame: {label: 'In-game', background: 0x050506, env: 1.1, key: 3.0, rim: 1.4, ambient: 0.04},
    studio: {label: 'Studio', background: 0x0b0e13, env: 1.6, key: 2.0, rim: 1.2, ambient: 0.15},
    space: {label: 'Deep space', background: 0x020306, env: 0.35, key: 3.2, rim: 0.6, ambient: 0.05},
    bright: {label: 'Bright', background: 0x1a1f27, env: 1.6, key: 1.6, rim: 1.0, ambient: 0.6},
};

// how dirty the hull is: the client sets a dirt level per ship while it runs (it isn't in its files), which scales the
// hull's dirt map
const DIRT = {
    clean: {label: 'Clean', level: 0},
    used: {label: 'Used', level: 0.5},
    dirty: {label: 'Dirty', level: 1},
};

// a 1x1 black texture, for pattern layers that aren't in use
const BLANK = () => dataTexture({width: 1, height: 1, data: new Uint8Array([0, 0, 0, 255])}, THREE.NoColorSpace);

// whether a hull's mask is read with its levels blended: its own (weathered) textures, or the clean set a SKIN names
// where it was found; a SKIN whose set the client lacks keeps crisp areas, as its colours would otherwise run into
// each other over the weathering
function maskBlends(textures) {
    return !textures.skinSet || textures.inserted;
}

function dataTexture(t, colorSpace) {
    const texture = new THREE.DataTexture(t.data, t.width, t.height, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = colorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    return texture;
}

// The ship's hull in 3D, from the player's own EVE client files (see ShipModelHelper), with orbit/zoom controls.
export default class ShipViewer extends React.Component {
    constructor(props) {
        super(props);

        this.state = {status: 'loading', error: undefined, autoRotate: true, lighting: 'ingame', dirt: 'clean', skin: 'default', paintSource: 'none'};
        this.mount = React.createRef();
    }

    componentDidMount() {
        this.setUp();
        // let "Loading…" paint before the (synchronous) model load
        this.loadTimer = setTimeout(() => this.loadShip(), 30);
    }

    componentDidUpdate(prevProps, prevState) {
        if (prevProps.ship.type_id !== this.props.ship.type_id) {
            this.setState({status: 'loading', error: undefined, skin: 'default'});
            clearTimeout(this.loadTimer);
            this.loadTimer = setTimeout(() => this.loadShip(), 30);
        }
        if (prevState.lighting !== this.state.lighting) {
            this.applyLighting();
        }
        if (prevState.dirt !== this.state.dirt && this.paint !== undefined) {
            this.paint.dirtLevel.value = DIRT[this.state.dirt].level;
        }
        if (prevState.skin !== this.state.skin) {
            this.applyTextureSet();
            this.applyPaint();
            // logos follow the SKIN's faction
            this.addDecals();
        }
        if (this.controls !== undefined) {
            this.controls.autoRotate = this.state.autoRotate;
        }
    }

    componentWillUnmount() {
        clearTimeout(this.loadTimer);
        cancelAnimationFrame(this.frame);
        if (this.observer !== undefined) {
            this.observer.disconnect();
        }
        this.clearShip();
        for (const texture of [...(this.masks || new Map()).values(), ...(this.decalTextures || new Map()).values()]) {
            if (texture !== undefined) {
                texture.dispose();
            }
        }
        if (this.controls !== undefined) {
            this.controls.dispose();
        }
        if (this.envMap !== undefined) {
            this.envMap.dispose();
        }
        if (this.renderer !== undefined) {
            this.renderer.dispose();
            this.renderer.forceContextLoss();
            this.renderer.domElement.remove();
        }
    }

    setUp() {
        const container = this.mount.current;
        const renderer = new THREE.WebGLRenderer({antialias: true});
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(container.clientWidth, HEIGHT);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        container.appendChild(renderer.domElement);
        this.renderer = renderer;

        const scene = new THREE.Scene();
        const pmrem = new THREE.PMREMGenerator(renderer);
        this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
        scene.environment = this.envMap;
        this.scene = scene;

        this.camera = new THREE.PerspectiveCamera(35, container.clientWidth / HEIGHT, 0.1, 10000);
        this.camera.position.set(1, 0.5, 1);

        this.ambient = new THREE.AmbientLight(0xffffff, 0.25);
        this.key = new THREE.DirectionalLight(0xfff4e6, 2.2);
        this.key.position.set(3, 4, 2);
        this.rim = new THREE.DirectionalLight(0x9ec8ff, 1.2);
        this.rim.position.set(-4, 1, -3);
        scene.add(this.ambient, this.key, this.rim, this.stars());

        this.controls = new OrbitControls(this.camera, renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.autoRotate = this.state.autoRotate;
        this.controls.autoRotateSpeed = 0.6;
        this.applyLighting();

        this.observer = new ResizeObserver(() => {
            const width = container.clientWidth;
            if (width > 0) {
                renderer.setSize(width, HEIGHT);
                this.camera.aspect = width / HEIGHT;
                this.camera.updateProjectionMatrix();
            }
        });
        this.observer.observe(container);

        const loop = () => {
            this.frame = requestAnimationFrame(loop);
            this.controls.update();
            renderer.render(scene, this.camera);
        };
        loop();
    }

    // a faint starfield far away, for depth
    stars() {
        const count = 1500;
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const v = new THREE.Vector3().randomDirection().multiplyScalar(4000);
            positions.set([v.x, v.y, v.z], i * 3);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.starField = new THREE.Points(geometry, new THREE.PointsMaterial({color: 0xaab4c8, size: 1.4, sizeAttenuation: false}));
        return this.starField;
    }

    applyLighting() {
        const preset = LIGHTING[this.state.lighting];
        this.scene.background = new THREE.Color(preset.background);
        this.ambient.intensity = preset.ambient;
        this.key.intensity = preset.key;
        this.rim.intensity = preset.rim;
        this.scene.environmentIntensity = preset.env;
    }

    clearShip() {
        if (this.ship === undefined) {
            return;
        }
        this.removeDecals();
        this.scene.remove(this.ship);
        this.ship.geometry.dispose();
        if (this.paint !== undefined) {
            this.paint.surfaceMap.value.dispose();
            this.paint = undefined;
        }
        for (const material of this.ship.material) {
            for (const key of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) {
                if (material[key]) {
                    material[key].dispose();
                }
            }
            material.dispose();
        }
        this.ship = undefined;
    }

    loadShip() {
        let model;
        try {
            model = ShipModelHelper.load(this.props.ship, ShipSof.textureSet(this.props.ship, undefined));
        } catch (err) {
            this.clearShip();
            this.setState({status: 'error', error: err.message});
            return;
        }

        this.clearShip();
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(model.positions, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(model.uvs, 2));
        geometry.setIndex(new THREE.BufferAttribute(model.indices, 1));
        const kinds = ['hull', 'glass', 'glow', 'booster'];
        for (const group of model.groups) {
            geometry.addGroup(group.start, group.count, kinds.indexOf(group.kind));
        }
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();

        const ship = new THREE.Mesh(geometry, this.materials(model.textures));
        // centre it, and frame it whatever its size (EVE hulls range from shuttles to titans)
        const sphere = geometry.boundingSphere;
        ship.position.copy(sphere.center).multiplyScalar(-1);
        this.ship = ship;
        this.scene.add(ship);
        this.model = model;
        model.typeId = this.props.ship.type_id;
        this.addDecals();

        this.radius = sphere.radius;
        this.resetView();
        this.setState({status: 'ready', textured: model.textures.albedo !== undefined && this.albedoSupported});
    }

    // A look whose texture set differs from the one loaded (a SKIN's clean "nefantar" set over the hull's weathered
    // own, or back): its textures into the hull material, where the client has them.
    applyTextureSet() {
        // (not while another ship is loading: its own look is set as it loads)
        if (this.model === undefined || this.hull === undefined || this.state.skin === '' || this.model.typeId !== this.props.ship.type_id) {
            return;
        }
        const skin = this.state.skin === 'default' ? undefined : this.state.skin;
        const wanted = ShipSof.textureSet(this.props.ship, skin);
        const current = this.model.textures;
        if (wanted === current.insert && ShipSof.namesTextureSet(skin) === Boolean(current.skinSet)) {
            return;
        }
        let textures;
        try {
            textures = ShipModelHelper.texturesFor(this.props.ship, wanted);
        } catch (err) {
            textures = undefined;
        }
        if (textures === undefined) {
            return;
        }
        textures.skinSet = ShipSof.namesTextureSet(skin);
        // the same maps as before where the set doesn't have them only costs a reload, so it's done once per set
        this.setTextures(this.hull, textures);
        this.model.textures = textures;
    }

    // the hull's maps into its material, replacing (and freeing) those it had
    setTextures(hull, textures) {
        const old = [hull.map, hull.normalMap, hull.emissiveMap, this.paint && this.paint.surfaceMap.value];
        hull.map = null;
        hull.normalMap = null;
        hull.emissiveMap = null;

        // the albedo stays block-compressed on the graphics card, where the card supports the format
        const albedo = textures.albedo;
        const compressed = albedo !== undefined ? COMPRESSED[albedo.format] : undefined;
        this.albedoSupported = compressed !== undefined && this.renderer.extensions.has(compressed.extension);
        if (this.albedoSupported) {
            const map = new THREE.CompressedTexture(albedo.mips, albedo.width, albedo.height, compressed.format);
            map.colorSpace = THREE.SRGBColorSpace;
            map.wrapS = map.wrapT = THREE.RepeatWrapping;
            map.minFilter = THREE.LinearMipmapLinearFilter;
            map.anisotropy = 8;
            map.needsUpdate = true;
            hull.map = map;
        } else {
            // a plain map, so the shader still has the hull's texture coordinates for the masks
            hull.map = dataTexture({width: 1, height: 1, data: new Uint8Array([141, 147, 155, 255])}, THREE.SRGBColorSpace);
        }
        if (textures.normal !== undefined) {
            hull.normalMap = dataTexture(textures.normal, THREE.NoColorSpace);
        }
        if (textures.glow !== undefined) {
            hull.emissiveMap = dataTexture(textures.glow, THREE.NoColorSpace);
            hull.emissive = new THREE.Color(0xffc48a);
            hull.emissiveIntensity = 3;
        }

        // SKIN paint: the surface map's R says which of four areas a pixel is in, each painted with its own material
        // (colour, roughness, metalness); G is the hull's roughness detail
        const surface = textures.surface !== undefined ? dataTexture(textures.surface, THREE.NoColorSpace) :
            dataTexture({width: 1, height: 1, data: new Uint8Array([0, 128, 0, 255])}, THREE.NoColorSpace);
        if (this.paint !== undefined) {
            this.paint.surfaceMap.value = surface;
            this.paint.maskBlend.value = maskBlends(textures) ? 1 : 0;
        }
        hull.needsUpdate = true;
        for (const texture of old) {
            if (texture && !Object.values(hull).includes(texture) && texture !== surface) {
                texture.dispose();
            }
        }
        return surface;
    }

    materials(textures) {
        const hull = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 0.5, metalness: 0.15});
        this.paint = undefined;
        const surface = this.setTextures(hull, textures);
        this.paint = {
            surfaceMap: {value: surface},
            // 1: blend between the mask's four levels (weathered panels part-way between two materials); 0: crisp areas
            maskBlend: {value: maskBlends(textures) ? 1 : 0},
            paintAmount: {value: 0},
            dirtLevel: {value: DIRT[this.state.dirt].level},
            mtlDiffuse: {value: [0, 1, 2, 3].map(() => new THREE.Color(0x808080))},
            mtlSpecular: {value: [0, 1, 2, 3].map(() => new THREE.Color(0x0a0a0a))},
            mtlRough: {value: [0.5, 0.5, 0.5, 0.5]},
            // up to two SKIN pattern layers: a mask projected through a box placed on the hull, painting a material
            patternMask0: {value: BLANK()},
            patternMask1: {value: BLANK()},
            patternOn: {value: [0, 0]},
            patternPos: {value: [new THREE.Vector3(), new THREE.Vector3()]},
            patternScale: {value: [new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1)]},
            patternRot: {value: [new THREE.Vector4(0, 0, 0, 1), new THREE.Vector4(0, 0, 0, 1)]},
            patternMirror: {value: [0, 0]},
            // per axis, how a layer's mask carries on outside its box: 0 repeats, 1 clamps (its edge stretches outwards),
            // 2 stops (nothing outside), as the pattern files' projection types
            patternModeU: {value: [0, 0]},
            patternModeV: {value: [0, 0]},
            patternDiffuse: {value: [new THREE.Color(), new THREE.Color()]},
            patternSpecular: {value: [new THREE.Color(), new THREE.Color()]},
            patternRough: {value: [0.5, 0.5]},
            // the paint areas each layer paints: 1 or 0 for areas 1-4
            patternTarget: {value: [new THREE.Vector4(1, 1, 1, 1), new THREE.Vector4(1, 1, 1, 1)]},
        };
        hull.onBeforeCompile = shader => {
            Object.assign(shader.uniforms, this.paint);
            // the position on the hull itself (before it's centred in the scene), which patterns are placed against
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', `#include <common>
varying vec3 vHullPosition;`)
                .replace('#include <begin_vertex>', `#include <begin_vertex>
vHullPosition = position;`);
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', `#include <common>
uniform sampler2D surfaceMap;
uniform float paintAmount;
uniform vec3 mtlDiffuse[4];
uniform vec3 mtlSpecular[4];
uniform float mtlRough[4];
uniform float maskBlend;
uniform float dirtLevel;
varying vec3 vHullPosition;
uniform sampler2D patternMask0;
uniform sampler2D patternMask1;
uniform float patternOn[2];
uniform vec3 patternPos[2];
uniform vec3 patternScale[2];
uniform vec4 patternRot[2];
uniform float patternMirror[2];
uniform float patternModeU[2];
uniform float patternModeV[2];
uniform vec3 patternDiffuse[2];
uniform vec3 patternSpecular[2];
uniform float patternRough[2];
uniform vec4 patternTarget[2];
// rotates v by the inverse of the unit quaternion q
vec3 unrotate(vec4 q, vec3 v) {
    vec3 u = -q.xyz;
    return 2.0 * dot(u, v) * u + (q.w * q.w - dot(u, u)) * v + 2.0 * q.w * cross(u, v);
}
// where a pattern layer's mask is sampled here, as the client's vertex shader works it out: the hull position in the
// layer's box, whose y and z span the texture. It runs through the whole hull along the box's x; mirrored layers use
// |x|, so both sides get the +x side's paint. z is 0 where an axis that stops is outside the box, else 1.
vec3 patternCoords(int i) {
    vec3 p = vHullPosition;
    if (patternMirror[i] > 0.5) { p.x = abs(p.x); }
    vec3 local = unrotate(patternRot[i], p - patternPos[i]) / max(patternScale[i], vec3(1e-4));
    vec2 uv = local.yz * 0.5 + 0.5;
    float inside = 1.0;
    if (patternModeU[i] > 1.5) { inside *= step(0.0, uv.x) * step(uv.x, 1.0); }
    if (patternModeV[i] > 1.5) { inside *= step(0.0, uv.y) * step(uv.y, 1.0); }
    if (patternModeU[i] > 0.5) { uv.x = clamp(uv.x, 0.0, 1.0); }
    if (patternModeV[i] > 0.5) { uv.y = clamp(uv.y, 0.0, 1.0); }
    return vec3(uv, inside);
}
float patternMask(sampler2D mask, int i) {
    vec3 pc = patternCoords(i);
    return texture2D(mask, pc.xy).r * pc.z;
}`)
                .replace('#include <map_fragment>', `#include <map_fragment>
vec4 surfaceSample = texture2D(surfaceMap, vMapUv);
// As the client's hull shader (quadv5) paints: the mask's four levels (0, 85, 170, 255) are the four areas, each fully
// its own within about 2.5 of its level and blending linearly into the next in between (a hull's own textures are
// weathered, e.g. the default Rifter's panels, between blued steel and rust). Where a SKIN's clean texture set is
// missing, its weathering is read as the nearest area instead (crisp), or its colours would run into each other.
vec4 areaWeight = clamp(1.0319 - 3.1915 * abs(vec4(surfaceSample.r) - vec4(0.0, 1.0 / 3.0, 2.0 / 3.0, 1.0)), 0.0, 1.0);
if (maskBlend < 0.5) {
    float maskValue = surfaceSample.r * 255.0;
    areaWeight = maskValue < 42.0 ? vec4(1.0, 0.0, 0.0, 0.0) : maskValue < 145.0 ? vec4(0.0, 1.0, 0.0, 0.0) :
        maskValue < 254.0 ? vec4(0.0, 0.0, 1.0, 0.0) : vec4(0.0, 0.0, 0.0, 1.0);
}
// SKIN patterns paint their material over each area they target, before the areas are blended. Layer 1 lies over
// layer 2 (the client also has variants where layer 2 only shows inside layer 1, or ignores it; nothing in the
// pattern files says which a SKIN uses, so the commonest is used)
float mask1 = patternOn[0] > 0.5 ? patternMask(patternMask0, 0) : 0.0;
float mask2 = patternOn[1] > 0.5 ? patternMask(patternMask1, 1) * (1.0 - mask1) : 0.0;
vec3 areaColor = vec3(0.0);
vec3 areaSpecular = vec3(0.0);
float areaGloss = 0.0;
for (int k = 0; k < 4; k++) {
    float layer1 = mask1 * patternTarget[0][k];
    float layer2 = mask2 * patternTarget[1][k];
    areaColor += areaWeight[k] * mix(mix(mtlDiffuse[k], patternDiffuse[0], layer1), patternDiffuse[1], layer2);
    areaSpecular += areaWeight[k] * mix(mix(mtlSpecular[k], patternSpecular[0], layer1), patternSpecular[1], layer2);
    areaGloss += areaWeight[k] * mix(mix(1.0 - mtlRough[k], 1.0 - patternRough[0], layer1), 1.0 - patternRough[1], layer2);
}
// dirt (_d, times the ship's dirt level) turns the paint to bare, non-metal grey with a gloss of 0.4
float dirt = dirtLevel * surfaceSample.b;
areaColor = mix(areaColor, vec3(1.0), dirt);
areaSpecular = mix(areaSpecular, vec3(0.0384, 0.0394, 0.0392), dirt);
// the roughness map scales the material's gloss
float paintGloss = mix(areaGloss * surfaceSample.g, 0.4, dirt);
// the hull's colour texture is greyscale shading (panels, recesses, highlights), which the client multiplies the
// material's colour by as it is (it isn't stored as sRGB); scaled to the game's paint brightness measured in
// side-by-side screenshots (top view: 0.073 in game)
float shading = pow(max(diffuseColor.r, 0.0), 1.0 / 2.2);
float detail = clamp(shading * 0.7, 0.0, 0.85);
diffuseColor.rgb = mix(diffuseColor.rgb, areaColor * detail, paintAmount);`)
                .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness;
// painted: 1 - gloss, as the client's shader has it (squared into the specular lobe's width, as here)
roughnessFactor = mix(surfaceSample.g, clamp(1.0 - paintGloss, 0.04, 1.0), paintAmount);`)
                // the client raises the glow map to the power 2.4
                .replace('#include <emissivemap_fragment>', `#ifdef USE_EMISSIVEMAP
totalEmissiveRadiance *= pow(texture2D(emissiveMap, vEmissiveMapUv).rgb, vec3(2.4));
#endif`)
                .replace('#include <metalnessmap_fragment>', `float metalnessFactor = mix(metalness, 0.0, paintAmount);`)
                // painted: the material's own specular colour, as the client's shaders use it
                .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
material.specularColorBlended = mix(material.specularColorBlended, areaSpecular, paintAmount);`);
        };
        this.hull = hull;
        this.applyPaint();

        const glass = new THREE.MeshStandardMaterial({
            color: 0x10202c, roughness: 0.08, metalness: 0.9, transparent: true, opacity: 0.85,
        });
        const glow = new THREE.MeshStandardMaterial({
            color: 0x332211, emissive: new THREE.Color(0xffa860), emissiveIntensity: 2.5, roughness: 0.4,
        });
        const booster = new THREE.MeshStandardMaterial({
            color: 0x221a14, emissive: new THREE.Color(0xffb070), emissiveIntensity: 2, roughness: 0.4,
        });
        this.glass = glass;
        this.glowMaterial = glow;
        this.booster = booster;
        this.applyColors();
        return [hull, glass, glow, booster];
    }

    // Puts the chosen paint into the hull shader: 'default' = the ship's own look, a SKIN id, or '' = unpainted (the
    // textures as they are). The client's own materials are used when its files have them, else an approximation from
    // the SDE (see ShipPaint).
    applyPaint() {
        if (this.paint === undefined) {
            return;
        }
        const {skin} = this.state;
        const ship = this.props.ship;
        let areas;
        let exact = false;
        if (skin !== '') {
            // a guessed metal/rough material as diffuse and specular: diffuse fades and specular takes the colour as
            // it gets more metallic
            const guessed = a => {
                const color = new THREE.Color(a.color);
                return {
                    diffuse: color.clone().multiplyScalar(1 - a.metalness),
                    specular: new THREE.Color(0.04, 0.04, 0.04).lerp(color, a.metalness),
                    roughness: a.roughness,
                };
            };
            const sof = ShipSof.areas(ship, skin === 'default' ? undefined : skin);
            if (sof !== undefined) {
                areas = sof.map(a => a.missing ? guessed(ShipPaint.fromName(a.name)) :
                    {diffuse: new THREE.Color().setRGB(...a.diffuse), specular: new THREE.Color().setRGB(...a.specular), roughness: a.roughness});
                exact = sof.every(a => !a.missing);
            } else if (skin !== 'default') {
                const approx = ShipPaint.areas(skin);
                if (approx !== undefined) {
                    areas = approx.areas.map(guessed);
                }
            }
        }
        this.paint.paintAmount.value = areas !== undefined ? 1 : 0;
        if (areas !== undefined) {
            areas.forEach((area, i) => {
                this.paint.mtlDiffuse.value[i].copy(area.diffuse);
                this.paint.mtlSpecular.value[i].copy(area.specular);
                this.paint.mtlRough.value[i] = area.roughness;
            });
        }
        this.applyPattern(skin, areas);
        this.applyColors();
        const source = areas === undefined ? 'none' : exact ? 'client' : 'approximate';
        if (this.state.paintSource !== source) {
            this.setState({paintSource: source});
        }
    }

    // A SKIN's pattern layers into the shader (none for the default look, unpainted, or a hull it isn't placed on).
    applyPattern(skin, areas) {
        const paint = typeof skin === 'number' ? ShipPaint.paint(skin) : undefined;
        const located = ShipModelHelper.locate(this.props.ship);
        const hull = located !== undefined ? located.hull : this.props.ship.model && this.props.ship.model.hull;
        const layers = paint !== undefined && areas !== undefined ? ShipSof.pattern(paint.pattern, hull) : [];

        [0, 1].forEach(i => {
            const layer = layers[i];
            const mask = layer !== undefined ? this.maskTexture(layer.mask, layer) : undefined;
            this.paint.patternOn.value[i] = mask !== undefined ? 1 : 0;
            if (mask === undefined) {
                return;
            }
            this.paint[`patternMask${i}`].value = mask;
            this.paint.patternPos.value[i].fromArray(layer.position);
            this.paint.patternScale.value[i].fromArray(layer.scaling);
            this.paint.patternRot.value[i].fromArray(layer.rotation);
            this.paint.patternMirror.value[i] = layer.mirrored ? 1 : 0;
            this.paint.patternModeU.value[i] = layer.projectionU || 0;
            this.paint.patternModeV.value[i] = layer.projectionV || 0;
            this.paint.patternTarget.value[i].set(...layer.targets.map(t => (t ? 1 : 0)));

            // 4 and 5: the SKIN's custom materials; 0-3: the hull's own
            const source = layer.materialSource;
            let material = source >= 4 ? ShipSof.material(paint.custom[source - 4]) : undefined;
            if (source >= 4 && material === undefined && paint.custom[source - 4]) {
                const guess = ShipPaint.fromName(paint.custom[source - 4]);
                const color = new THREE.Color(guess.color);
                material = {diffuse: color.clone().multiplyScalar(1 - guess.metalness).toArray(),
                    specular: new THREE.Color(0.04, 0.04, 0.04).lerp(color, guess.metalness).toArray(), roughness: guess.roughness};
            }
            if (material !== undefined) {
                this.paint.patternDiffuse.value[i].setRGB(...material.diffuse);
                this.paint.patternSpecular.value[i].setRGB(...material.specular);
                this.paint.patternRough.value[i] = material.roughness;
            } else if (areas !== undefined && areas[source] !== undefined) {
                this.paint.patternDiffuse.value[i].copy(areas[source].diffuse);
                this.paint.patternSpecular.value[i].copy(areas[source].specular);
                this.paint.patternRough.value[i] = areas[source].roughness;
            } else {
                this.paint.patternOn.value[i] = 0;
            }
        });
    }

    removeDecals() {
        if (this.decals === undefined) {
            return;
        }
        for (const decal of this.decals) {
            this.ship.remove(decal);
            decal.geometry.dispose();
            decal.material.dispose();
        }
        this.decals = undefined;
    }

    // The hull's decals (markings, lettering, stripes, the faction logo): each a thin mesh on the triangles it covers,
    // its texture projected through its box (along the box's x), cut out by its transparency map.
    addDecals() {
        if (this.ship === undefined || this.model === undefined) {
            return;
        }
        this.removeDecals();
        if (this.state.skin === '') {
            return;   // unpainted: just the textures
        }
        const ship = this.props.ship;
        const located = ShipModelHelper.locate(ship);
        const hull = located !== undefined ? located.hull : ship.model && ship.model.hull;
        const faction = ShipSof.factionFor(ship, typeof this.state.skin === 'number' ? this.state.skin : undefined);
        const positions = this.ship.geometry.getAttribute('position');
        const normals = this.ship.geometry.getAttribute('normal');
        const p = new THREE.Vector3();
        const q = new THREE.Quaternion();

        this.decals = [];
        for (const decal of ShipSof.decals(hull, faction)) {
            if (decal.meshIndex !== 0) {
                continue;   // only the main mesh's decals
            }
            const albedo = this.decalTexture(decal.textures.DecalAlbedoMap, 'color');
            if (albedo === undefined) {
                continue;
            }
            const transparency = decal.textures.DecalTransparencyMap !== undefined ?
                this.decalTexture(decal.textures.DecalTransparencyMap, 'mask') : undefined;

            const count = decal.indices.length - decal.indices.length % 3;
            const pos = new Float32Array(count * 3);
            const nor = new Float32Array(count * 3);
            const uv = new Float32Array(count * 2);
            q.fromArray(decal.rotation).invert();
            let used = 0;
            for (let i = 0; i < count; i++) {
                const v = decal.indices[i];
                if (v >= positions.count) {
                    continue;
                }
                p.fromBufferAttribute(positions, v);
                pos.set([p.x, p.y, p.z], used * 3);
                nor.set([normals.getX(v), normals.getY(v), normals.getZ(v)], used * 3);
                // into the decal's box: its texture spans the box's y and z
                p.sub(new THREE.Vector3().fromArray(decal.position)).applyQuaternion(q);
                uv.set([p.y / decal.scaling[1] * 0.5 + 0.5, p.z / decal.scaling[2] * 0.5 + 0.5], used * 2);
                used++;
            }
            if (used < 3) {
                continue;
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, used * 3), 3));
            geometry.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, used * 3), 3));
            geometry.setAttribute('uv', new THREE.BufferAttribute(uv.subarray(0, used * 2), 2));

            const material = new THREE.MeshStandardMaterial({
                map: albedo, alphaMap: transparency, transparent: true, depthWrite: false,
                roughness: 0.5, metalness: 0.2,
                polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
            });
            // nothing outside the decal's box
            material.onBeforeCompile = shader => {
                shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `if (vMapUv.x < 0.0 || vMapUv.x > 1.0 || vMapUv.y < 0.0 || vMapUv.y > 1.0) discard;
#include <map_fragment>`);
            };
            const mesh = new THREE.Mesh(geometry, material);
            mesh.renderOrder = 1;
            this.ship.add(mesh);
            this.decals.push(mesh);
        }
    }

    // a decal texture from the client (kept for the session): 'color' as it is, 'mask' with its one channel in R, G
    // and B (three.js reads cut-outs from G); undefined when it can't be read
    decalTexture(res, kind) {
        this.decalTextures = this.decalTextures || new Map();
        const key = `${res}:${kind}`;
        if (!this.decalTextures.has(key)) {
            let texture;
            try {
                const bytes = ShipModelHelper.resource(res);
                const dds = bytes !== undefined ? parseDds(bytes) : undefined;
                if (dds !== undefined && kind === 'mask' && dds.format === 'BC4') {
                    const mip = dds.mips[0];
                    const rgba = new Uint8Array(mip.width * mip.height * 4).fill(255);
                    decodeInto(mip, 'BC4', rgba, [0]);
                    for (let i = 0; i < rgba.length; i += 4) {
                        rgba[i + 1] = rgba[i + 2] = rgba[i];
                    }
                    texture = dataTexture({width: mip.width, height: mip.height, data: rgba}, THREE.NoColorSpace);
                } else if (dds !== undefined) {
                    texture = this.ddsTexture(dds);
                    if (texture !== undefined && kind === 'color') {
                        texture.colorSpace = THREE.SRGBColorSpace;
                    }
                }
                if (texture !== undefined) {
                    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
                }
            } catch (err) {
                texture = undefined;
            }
            this.decalTextures.set(key, texture);
        }
        return this.decalTextures.get(key);
    }

    // a pattern mask from the client (kept for the session), or undefined when it can't be read
    maskTexture(res, layer) {
        this.masks = this.masks || new Map();
        const key = `${res}:${layer.projectionU}:${layer.projectionV}`;
        if (!this.masks.has(key)) {
            let texture;
            try {
                const bytes = ShipModelHelper.resource(res);
                const dds = bytes !== undefined ? parseDds(bytes) : undefined;
                if (dds !== undefined) {
                    texture = this.ddsTexture(dds);
                    if (texture !== undefined) {
                        // only projection type 0 repeats; 1 and 2 are clamped (2 then stops at the box, in the shader)
                        texture.wrapS = layer.projectionU ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
                        texture.wrapT = layer.projectionV ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
                    }
                }
            } catch (err) {
                texture = undefined;
            }
            this.masks.set(key, texture);
        }
        return this.masks.get(key);
    }

    // a texture from a parsed DDS: one or two channel formats decoded here, colour ones left compressed
    ddsTexture(dds) {
        if (dds.format === 'BC4' || dds.format === 'BC5') {
            const mip = dds.mips[0];
            const rgba = new Uint8Array(mip.width * mip.height * 4).fill(255);
            decodeInto(mip, dds.format, rgba, dds.format === 'BC5' ? [0, 1] : [0]);
            return dataTexture({width: mip.width, height: mip.height, data: rgba}, THREE.NoColorSpace);
        }
        const compressed = COMPRESSED[dds.format];
        if (compressed === undefined || !this.renderer.extensions.has(compressed.extension)) {
            return undefined;
        }
        const texture = new THREE.CompressedTexture(dds.mips, dds.width, dds.height, compressed.format);
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.needsUpdate = true;
        return texture;
    }

    // The faction's colours on the hull's glow map, reactors, engine exhaust and glass (glows can be brighter than 1).
    applyColors() {
        const {skin} = this.state;
        const colors = skin !== '' ? ShipSof.colors(ShipSof.factionFor(this.props.ship, typeof skin === 'number' ? skin : undefined)) : undefined;
        const set = (material, key, fallback, scale = 1) => {
            if (material === undefined) {
                return;
            }
            if (colors !== undefined && colors[key] !== undefined) {
                material.emissive.setRGB(...colors[key].map(v => v * scale));
                material.emissiveIntensity = 1;
            } else {
                material.emissive.set(fallback);
                material.emissiveIntensity = fallback === '#000000' ? 0 : 2.5;
            }
        };
        if (this.hull !== undefined && this.hull.emissiveMap) {
            set(this.hull, 'Hull', '#ffc48a', 0.6);
        }
        set(this.glowMaterial, 'Reactor', '#ffa860', 0.6);
        set(this.booster, 'Booster', '#ffb070', 1.5);
        set(this.glass, 'Glass', '#000000', 0.5);
    }

    resetView() {
        if (this.radius === undefined) {
            return;
        }
        const distance = this.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.05;
        this.camera.position.set(distance * 0.7, distance * 0.35, distance * 0.62);
        this.camera.near = this.radius / 100;
        this.camera.far = distance * 20 + 5000;
        this.camera.updateProjectionMatrix();
        this.controls.target.set(0, 0, 0);
        this.controls.minDistance = this.radius * 0.6;
        this.controls.maxDistance = distance * 4;
        this.controls.update();
    }

    render() {
        const {ship} = this.props;
        const {status, error} = this.state;

        return (
            <div className="ship-viewer">
                <div ref={this.mount} className="ship-viewer-canvas" style={{height: HEIGHT}}/>

                {status === 'loading' &&
                    <div className="ship-viewer-overlay"><span className="muted">Loading {ship.name} from your EVE client…</span></div>}
                {status === 'error' &&
                    <div className="ship-viewer-overlay">
                        <img src={`https://images.evetech.net/types/${ship.type_id}/render?size=256`} alt="" width={256} height={256}/>
                        <span className="muted">{error} Showing CCP's render instead.</span>
                    </div>
                }

                <div className="ship-viewer-toolbar">
                    <select className="field small ship-skin" value={this.state.skin} title="SKIN"
                            onChange={e => this.setState({skin: ['', 'default'].includes(e.target.value) ? e.target.value : Number(e.target.value)})}>
                        <option value="default">Default</option>
                        {ShipPaint.skinsFor(ship).map(skin => <option key={skin.id} value={skin.id}>{skin.name}</option>)}
                        <option value="">Unpainted</option>
                    </select>
                    {status === 'ready' && this.state.skin !== '' && this.state.paintSource !== 'none' &&
                        <span className="faint" title={this.state.paintSource === 'client' ? 'Paint from your EVE client\'s own material files' :
                            'Your client\'s material files for this paint weren\'t found, so it\'s approximated from its name'}>
                            {this.state.paintSource === 'client' ? 'Client paint' : 'Approximate paint'}
                        </span>}
                    <div className="seg">
                        {Object.entries(LIGHTING).map(([key, preset]) =>
                            <button key={key} type="button" className={this.state.lighting === key ? 'active' : ''}
                                    onClick={() => this.setState({lighting: key})}>{preset.label}</button>
                        )}
                    </div>
                    <div className="seg" title="Dirt">
                        {Object.entries(DIRT).map(([key, preset]) =>
                            <button key={key} type="button" className={this.state.dirt === key ? 'active' : ''}
                                    onClick={() => this.setState({dirt: key})}>{preset.label}</button>
                        )}
                    </div>
                    <button type="button" className="link-button" onClick={() => this.setState({autoRotate: !this.state.autoRotate})}>
                        {this.state.autoRotate ? 'Stop rotating' : 'Rotate'}
                    </button>
                    <button type="button" className="link-button" onClick={() => this.resetView()}>Reset view</button>
                    <span className="faint ship-viewer-hint">Drag to orbit · scroll to zoom · right-drag to pan</span>
                </div>
                {status === 'ready' && !this.state.textured &&
                    <p className="faint" style={{margin: 0, padding: '0 12px 10px'}}>
                        Your graphics card can't show this hull's colour texture (BC7), so it's shown in plain metal.
                    </p>}
            </div>
        );
    }
}
