'use strict';

import React from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';

import ShipModelHelper from '../../helpers/ShipModelHelper';
import ShipPaint from '../../helpers/ShipPaint';
import ShipSof from '../../helpers/ShipSof';
import ShipData from '../../../resources/ships';
import {parseDds, decodeInto} from '../../helpers/granny/Dds';

// the view's height: from its width (16:9), at least MIN_HEIGHT and at most MAX_SHARE of the window's
const ASPECT = 9 / 16;
const MIN_HEIGHT = 320;
const MAX_SHARE = 0.75;
const DEFAULT_HEIGHT = 460;

function viewerHeight(width) {
    return Math.round(Math.max(MIN_HEIGHT, Math.min(width * ASPECT, window.innerHeight * MAX_SHARE)));
}
const COMPRESSED = {
    BC7: {extension: 'EXT_texture_compression_bptc', format: THREE.RGBA_BPTC_Format},
    BC1: {extension: 'WEBGL_compressed_texture_s3tc', format: THREE.RGB_S3TC_DXT1_Format},
    BC2: {extension: 'WEBGL_compressed_texture_s3tc', format: THREE.RGBA_S3TC_DXT3_Format},
    BC3: {extension: 'WEBGL_compressed_texture_s3tc', format: THREE.RGBA_S3TC_DXT5_Format},
};
// Both light the ship as the client does in space: one white sun, and the hull reflecting its surroundings, which also
// light it softly (there's no other ambient light). 'In-game' reflects the chosen nebula, as the client does; 'Deep
// space' a dark generated sky. reflection: how strongly (the nebula's own strength is used where it has one); env: how
// strongly glass and effects reflect; bloom: how strongly bright pixels glow.
const LIGHTING = {
    ingame: {label: 'In-game', background: 0x050506, reflection: 1, env: 0.8, bloom: 0.15},
    space: {label: 'Deep space', background: 0x020306, reflection: 0.6, env: 0.6, bloom: 0.15},
};
// The sun: the client's ship preview scenes have a white sun of 1.5, which in three.js's units (its lights' diffuse is
// divided by π, the client's isn't) is 1.5π. The client puts it behind its camera, as here.
const SUN_INTENSITY = 1.5 * Math.PI;
// the nebula shown by default (The Citadel), where the client has it
const NEBULA = 'c01';
// the nebula the client's ship preview shows each race's ships in: Caldari, Minmatar, Amarr, Gallente, ORE
const RACE_NEBULAS = {1: 'c05', 2: 'm01', 4: 'a05', 8: 'g04', 128: 'c06'};
const NEBULA_INTENSITY = 0.5;
// how bright the nebula is behind the ship (before the exposure)
const NEBULA_BACKGROUND = 2;
// How strongly hulls reflect a nebula: its scene's reflectionIntensity, 1.55 in the a/c/g/j nebulas and 1.4 in the m
// ones (dx9/scene/universe/<name>_cube.black).
function reflectionIntensity(name) {
    return /^m/.test(name || '') ? 1.4 : 1.55;
}
// The client's exposure is set as it plays, from the picture's brightness; the viewer's is fixed, set by eye (the
// Apocalypse, Rifter and Golem in their races' nebulas).
const EXPOSURE = 0.3;

// The client's tone mapping (postprocess/tonemapping: Uncharted 2's curve, white point 11.2), in place of three.js's
// custom one, which the viewer uses.
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
    'vec3 CustomToneMapping( vec3 color ) { return color; }',
    `vec3 hableCurve( vec3 y ) { return ( y * ( 0.15 * y + 0.05 ) + 0.004 ) / ( y * ( 0.15 * y + 0.5 ) + 0.06 ) - 0.02 / 0.3; }
vec3 CustomToneMapping( vec3 color ) { return hableCurve( 2.0 * toneMappingExposure * color ) / hableCurve( vec3( 11.2 ) ); }`);

// a nebula by the regions it's seen in ("The Forge, GPMR-01" for c02, from the SDE); else its name in the client
function nebulaLabel(name) {
    const regions = (ShipData.nebulas || {})[name];
    return regions && regions.length > 0 ? regions.join(', ') : name;
}

// A block-compressed cubemap from the client (DDS: a nebula's BC6H backdrop, its DXT3 reflection cube) as a compressed
// cube texture, or undefined when it isn't one or the graphics card can't take it. allMips: with its mip chain (for
// reflections blurred by level), else only its full-size level.
function ddsCube(bytes, renderer, allMips) {
    if (bytes === undefined || bytes.length < 128) {
        return undefined;
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const fourCC = String.fromCharCode(bytes[84], bytes[85], bytes[86], bytes[87]);
    let format;
    let blockBytes;
    let header = 128;
    let cube = (view.getUint32(112, true) & 0x200) !== 0;
    if (fourCC === 'DX10') {
        const dxgi = view.getUint32(128, true);
        header = 148;
        cube = (view.getUint32(136, true) & 4) !== 0;
        if ((dxgi === 95 || dxgi === 96) && renderer.extensions.has('EXT_texture_compression_bptc')) {
            format = dxgi === 96 ? THREE.RGB_BPTC_SIGNED_Format : THREE.RGB_BPTC_UNSIGNED_Format;
            blockBytes = 16;
        }
    } else if (COMPRESSED[{DXT1: 'BC1', DXT3: 'BC2', DXT5: 'BC3'}[fourCC]] !== undefined) {
        const compressed = COMPRESSED[{DXT1: 'BC1', DXT3: 'BC2', DXT5: 'BC3'}[fourCC]];
        if (renderer.extensions.has(compressed.extension)) {
            format = compressed.format;
            blockBytes = fourCC === 'DXT1' ? 8 : 16;
        }
    }
    if (format === undefined || !cube) {
        return undefined;
    }
    const height = view.getUint32(12, true);
    const width = view.getUint32(16, true);
    const mips = Math.max(1, view.getUint32(28, true));
    // each face: its whole mip chain
    const levelSize = level => Math.max(1, (width >> level) + 3 >> 2) * Math.max(1, (height >> level) + 3 >> 2) * blockBytes;
    let faceSize = 0;
    for (let level = 0; level < mips; level++) {
        faceSize += levelSize(level);
    }
    if (header + faceSize * 6 > bytes.length) {
        return undefined;
    }
    const levels = allMips ? mips : 1;
    const images = [0, 1, 2, 3, 4, 5].map(face => {
        const mipmaps = [];
        let offset = header + face * faceSize;
        for (let level = 0; level < levels; level++) {
            const size = [Math.max(1, width >> level), Math.max(1, height >> level)];
            mipmaps.push({data: bytes.subarray(offset, offset + levelSize(level)), width: size[0], height: size[1]});
            offset += levelSize(level);
        }
        // WebGL wants the chain down to 1x1, which the client's files stop short of (a 128 cube's ends at 2x2): the
        // last level's one block again, which below 4x4 is the same size
        while (levels > 1 && (mipmaps[mipmaps.length - 1].width > 1 || mipmaps[mipmaps.length - 1].height > 1)) {
            const last = mipmaps[mipmaps.length - 1];
            if (last.width > 4 || last.height > 4) {
                break;
            }
            mipmaps.push({data: last.data, width: Math.max(1, last.width >> 1), height: Math.max(1, last.height >> 1)});
        }
        return {width, height, mipmaps};
    });
    // a chain that still stops short is left at its full-size level
    const complete = images[0].mipmaps.length > 1 && images[0].mipmaps[images[0].mipmaps.length - 1].width === 1;
    if (!complete) {
        images.forEach(image => image.mipmaps.splice(1));
    }
    const bc6 = format === THREE.RGB_BPTC_SIGNED_Format || format === THREE.RGB_BPTC_UNSIGNED_Format;
    const texture = new THREE.CompressedCubeTexture(images, format, bc6 ? THREE.HalfFloatType : THREE.UnsignedByteType);
    texture.minFilter = complete ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
}

// where the sun (the key light) is, which the space sky's sun matches
const SUN = new THREE.Vector3(3, 4, 2).normalize();

// A sky to reflect for the 'space' lighting: dark space with a blue nebula band and a warm sun, bright enough (above 1)
// for the hull's polished paint to pick out, as the client's nebula cubemaps are.
function spaceSky() {
    const scene = new THREE.Scene();
    const material = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {sun: {value: SUN}},
        vertexShader: `varying vec3 vDir;
void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec3 sun;
varying vec3 vDir;
void main() {
    vec3 d = normalize(vDir);
    // a soft, lumpy band of nebula around the sky, brightest towards the sun's side
    float band = exp(-pow(d.y * 2.2 + 0.25 * sin(d.x * 3.0 + d.z * 2.0), 2.0));
    float lumps = 0.6 + 0.4 * sin(d.x * 7.0 + sin(d.z * 5.0)) * sin(d.z * 6.0 - d.y * 4.0);
    vec3 color = vec3(0.004, 0.006, 0.012) + vec3(0.12, 0.38, 0.85) * band * lumps * (0.5 + 0.5 * max(dot(d, sun), 0.0));
    float facing = max(dot(d, sun), 0.0);
    // only a soft glow: the key light already gives the sun's sharp highlight, and a second one blinds polished paint
    color += vec3(1.0, 0.86, 0.7) * pow(facing, 12.0) * 0.5;
    gl_FragColor = vec4(color, 1.0);
}`,
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 64, 32), material));
    return scene;
}

// The client's "ubershader" (graphics/effect/managed/space/specialfx/ubershader.fx), which effects such as a SKIN's
// holograms and glowing trails are drawn with: up to three textures multiplied together, each scaled, offset and
// scrolling over time, times a mask and a colour, faded by how squarely the surface faces the camera ("Fresnel":
// power, strength, bias; a negative strength makes it brightest face-on).
const UBER_VERTEX = `varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
}`;
const UBER_FRAGMENT = `uniform vec4 diffuseColor;
uniform sampler2D map1;
uniform sampler2D map2;
uniform sampler2D map3;
uniform sampler2D maskMap;
uniform vec4 transform1;
uniform vec4 transform2;
uniform vec4 transform3;
uniform vec4 scroll1;
uniform vec4 scroll2;
uniform vec4 scroll3;
uniform float mapCount;
uniform vec4 fresnel;
uniform float time;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
vec2 layerUv(vec4 transform, vec4 scroll) { return vUv * transform.zw + transform.xy + scroll.xy * time + scroll.zw; }
void main() {
    vec4 color = texture2D(map1, layerUv(transform1, scroll1));
    if (mapCount > 1.5) { color *= texture2D(map2, layerUv(transform2, scroll2)); }
    if (mapCount > 2.5) { color *= texture2D(map3, layerUv(transform3, scroll3)); }
    color *= texture2D(maskMap, vUv) * diffuseColor;
    float facing = pow(1.0 - clamp(dot(normalize(vView), normalize(vNormal)) - fresnel.z, 0.0, 1.0), fresnel.x);
    float strength = fresnel.y < 0.0 ? -fresnel.y * (1.0 - min(1.0, facing)) : fresnel.y * facing;
    gl_FragColor = vec4(color.rgb * strength, clamp(color.a, 0.0, 1.0));
}`;

// The client's fxv5 (graphics/effect/managed/space/spaceobject/v5/fx), which glowing layers over hull parts are drawn
// with: each layer's texture coordinates scaled (transform.xy), offset (.zw) and scrolling (scroll.xy per second, plus
// .zw), the two layers multiplied with the mask and the colour, then faded by the Fresnel factors.
const FX_FRAGMENT = `uniform sampler2D layer1;
uniform sampler2D layer2;
uniform sampler2D mask;
uniform vec4 transform1;
uniform vec4 transform2;
uniform vec4 scroll1;
uniform vec4 scroll2;
uniform vec4 baseColor;
uniform vec4 fresnel;
uniform float time;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
vec2 layerUv(vec4 transform, vec4 scroll) { return vUv * transform.xy + transform.zw + scroll.xy * time + scroll.zw; }
void main() {
    vec4 color = texture2D(layer1, layerUv(transform1, scroll1)) * texture2D(layer2, layerUv(transform2, scroll2)) *
        texture2D(mask, vUv) * baseColor;
    float facing = pow(1.0 - clamp(dot(normalize(vView), normalize(vNormal)) - fresnel.z, 0.0, 1.0), fresnel.x);
    float strength = fresnel.y < 0.0 ? -fresnel.y * (1.0 - min(1.0, facing)) : fresnel.y * facing;
    gl_FragColor = vec4(color.rgb * strength, 1.0);
}`;

// A hull's running lights (see ShipSof.lights): glowing dots in the faction's colours, each pulsing between its
// smallest and largest size at its own rate and phase; sizes are in the hull's units. The colour sets keep lights'
// colours low, so they're brightened to glow (and bloom) as the client's do.
const LIGHT_BRIGHTNESS = 4;
// the share of a light's size its glow covers on screen
const LIGHT_SIZE = 0.5;
const LIGHT_VERTEX = `attribute vec3 lightColor;
attribute vec4 blink;
uniform float time;
uniform float viewportHeight;
varying vec3 vColor;
void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // blink: rate (per second), phase, smallest and largest size; a light that doesn't blink stays half way
    float pulse = blink.x > 0.0 ? 0.5 + 0.5 * sin(6.2831853 * (time * blink.x + blink.y)) : 0.5;
    float size = mix(blink.z, blink.w, pulse);
    gl_PointSize = max(1.0, size * projectionMatrix[1][1] * viewportHeight * 0.5 / -mv.z);
    vColor = lightColor;
    gl_Position = projectionMatrix * mv;
}`;
const LIGHT_FRAGMENT = `varying vec3 vColor;
void main() {
    vec2 d = gl_PointCoord * 2.0 - 1.0;
    float r = dot(d, d);
    if (r > 1.0) discard;
    gl_FragColor = vec4(vColor * exp(-r * 4.0), 1.0);
}`;

// the faction area types a hull area can be painted with (see ShipModelHelper.hullAreas); others take Primary
const AREA_TYPES = ['Primary', 'Glass', 'Sails', 'Reactor', 'Darkhull', 'Rock'];

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

        this.state = {status: 'loading', error: undefined, autoRotate: true, lighting: 'ingame', nebula: undefined, height: DEFAULT_HEIGHT, fullscreen: false, skin: 'default', paintSource: 'none'};
        this.mount = React.createRef();
        this.root = React.createRef();
        this.toolbar = React.createRef();
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
        if (prevState.lighting !== this.state.lighting || prevState.nebula !== this.state.nebula) {
            this.applyLighting();
        }
        if (prevState.skin !== this.state.skin) {
            this.applyTextureSet();
            this.applyPaint();
            // logos and effects follow the SKIN's faction
            this.addDecals();
            this.addEffects();
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
        if (this.resize !== undefined) {
            window.removeEventListener('resize', this.resize);
        }
        if (this.onFullscreen !== undefined) {
            document.removeEventListener('fullscreenchange', this.onFullscreen);
        }
        if (this.isFullscreen()) {
            document.exitFullscreen().catch(() => {});
        }
        this.clearShip();
        for (const texture of [...(this.masks || new Map()).values(), ...(this.decalTextures || new Map()).values(),
            ...(this.effectTextures || new Map()).values()]) {
            if (texture !== undefined) {
                texture.dispose();
            }
        }
        if (this.controls !== undefined) {
            this.controls.dispose();
        }
        if (this.skyTarget !== undefined) {
            this.skyTarget.dispose();
        }
        for (const envMap of [...Object.values(this.envMaps || {}), ...(this.nebulaEnvs || new Map()).values(),
            ...(this.nebulaCubes || new Map()).values(), ...(this.reflectionCubes || new Map()).values()]) {
            if (envMap) {
                envMap.dispose();
            }
        }
        if (this.composer !== undefined) {
            this.composer.dispose();
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
        const height = viewerHeight(container.clientWidth);
        renderer.setSize(container.clientWidth, height);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        // the client's curve (see CustomToneMapping above)
        renderer.toneMapping = THREE.CustomToneMapping;
        renderer.toneMappingExposure = EXPOSURE;
        container.appendChild(renderer.domElement);
        this.renderer = renderer;

        const scene = new THREE.Scene();
        const pmrem = new THREE.PMREMGenerator(renderer);
        this.envMaps = {space: pmrem.fromScene(spaceSky(), 0).texture};
        pmrem.dispose();
        // the generated sky as a cube with its mip chain, for hulls to reflect blurred by level as they do a nebula's
        this.skyTarget = new THREE.WebGLCubeRenderTarget(128, {type: THREE.HalfFloatType, generateMipmaps: true,
            minFilter: THREE.LinearMipmapLinearFilter});
        new THREE.CubeCamera(0.1, 1000, this.skyTarget).update(renderer, spaceSky());
        this.scene = scene;

        this.camera = new THREE.PerspectiveCamera(35, container.clientWidth / height, 0.1, 10000);
        this.camera.position.set(1, 0.5, 1);

        // the sun, the only light: the rest comes from what the hull reflects
        this.sun = new THREE.DirectionalLight(0xffffff, SUN_INTENSITY);
        this.sun.position.copy(SUN);
        scene.add(this.sun);
        // what hulls reflect (see paintShader): a cube, its strength, and -1 to mirror it as three.js does a cube
        // texture's backdrop (1 for the generated sky, which is drawn the right way round)
        this.reflection = {reflectionCube: {value: this.skyTarget.texture}, reflectionIntensity: {value: 1}, reflectionFlip: {value: 1}};

        // drawn through bloom, then tone mapped (the output pass uses the renderer's tone mapping and colour space)
        const target = new THREE.WebGLRenderTarget(container.clientWidth, height, {type: THREE.HalfFloatType, samples: 4});
        this.composer = new EffectComposer(renderer, target);
        this.composer.addPass(new RenderPass(scene, this.camera));
        // a weak bloom on the brightest highlights (set by eye: the client's own threshold and scale don't carry over to
        // three.js's bloom)
        this.bloom = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, height), 0.15, 0.4, 1.0);
        this.composer.addPass(this.bloom);
        this.composer.addPass(new OutputPass());

        this.controls = new OrbitControls(this.camera, renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.autoRotate = this.state.autoRotate;
        this.controls.autoRotateSpeed = 0.6;
        this.applyLighting();

        // the canvas's height in device pixels, for sizing running lights
        this.viewportHeight = {value: height * renderer.getPixelRatio()};
        this.setState({height});
        // follows the app's size: the panel's width, and the window's height
        this.resize = () => {
            const width = container.clientWidth;
            if (width > 0) {
                // full screen: the whole screen but the toolbar
                const toolbar = this.toolbar.current ? this.toolbar.current.offsetHeight : 0;
                const h = this.isFullscreen() ? Math.max(MIN_HEIGHT, window.innerHeight - toolbar) : viewerHeight(width);
                renderer.setSize(width, h);
                this.composer.setSize(width, h);
                this.camera.aspect = width / h;
                this.camera.updateProjectionMatrix();
                this.viewportHeight.value = h * renderer.getPixelRatio();
                if (h !== this.state.height) {
                    this.setState({height: h});
                }
            }
        };
        this.observer = new ResizeObserver(this.resize);
        this.observer.observe(container);
        window.addEventListener('resize', this.resize);
        this.onFullscreen = () => {
            this.setState({fullscreen: this.isFullscreen()});
            this.resize();
        };
        document.addEventListener('fullscreenchange', this.onFullscreen);

        // seconds, for effects' scrolling textures
        this.effectTime = {value: 0};
        const loop = () => {
            this.frame = requestAnimationFrame(loop);
            this.controls.update();
            this.effectTime.value = performance.now() / 1000;
            this.composer.render();
        };
        loop();
    }

    // the chosen nebula's name, or undefined for none (a plain background)
    nebulaName() {
        const name = this.state.nebula === undefined ? this.defaultNebula() : this.state.nebula;
        return name === 'none' ? undefined : name;
    }

    applyLighting() {
        const preset = LIGHTING[this.state.lighting];
        // the chosen nebula behind the ship, as the client draws space; else the preset's plain colour
        const name = this.nebulaName();
        const cube = this.nebulaCube(name);
        this.scene.background = cube || new THREE.Color(preset.background);
        this.scene.backgroundIntensity = NEBULA_BACKGROUND;
        // glass, decals and effects: three.js's own reflections of the nebula
        const nebula = this.nebulaEnv(name);
        this.scene.environment = nebula || this.envMaps.space;
        // the client's nebulas are brighter than the generated sky, with suns in them
        this.scene.environmentIntensity = preset.env * (nebula ? NEBULA_INTENSITY : 1);
        // hulls: the client's own reflection cube of the nebula (the default one's when there's no backdrop)
        const reflected = this.state.lighting === 'ingame' ? name || this.defaultNebula() : undefined;
        const refl = this.reflectionCube(reflected);
        this.reflection.reflectionCube.value = refl || this.skyTarget.texture;
        this.reflection.reflectionFlip.value = refl ? -1 : 1;
        this.reflection.reflectionIntensity.value = preset.reflection * (refl ? reflectionIntensity(reflected) : 1);
        this.bloom.strength = preset.bloom;
    }

    // the cube the client's hulls reflect of a nebula (128 pixels, blurred down its mip levels), or undefined
    reflectionCube(name) {
        if (!name) {
            return undefined;
        }
        this.reflectionCubes = this.reflectionCubes || new Map();
        if (!this.reflectionCubes.has(name)) {
            let cube;
            try {
                cube = ddsCube(ShipModelHelper.nebulaReflection(name), this.renderer, true);
                if (cube !== undefined) {
                    // its values as they are (read as sRGB, the cubes average about 0.01: hulls would be black out of
                    // the sun, which in the game they aren't)
                    cube.colorSpace = THREE.NoColorSpace;
                }
            } catch (err) {
                cube = undefined;
            }
            this.reflectionCubes.set(name, cube);
        }
        return this.reflectionCubes.get(name);
    }

    // the reflections of one of the client's nebulas, prefiltered for rough to polished surfaces (undefined when the
    // client hasn't got it or it can't be shown; the generated sky is used instead)
    nebulaEnv(name) {
        if (!name) {
            return undefined;
        }
        this.nebulaEnvs = this.nebulaEnvs || new Map();
        if (!this.nebulaEnvs.has(name)) {
            let env;
            try {
                const cube = this.nebulaCube(name);
                if (cube !== undefined) {
                    const pmrem = new THREE.PMREMGenerator(this.renderer);
                    env = pmrem.fromCubemap(cube).texture;
                    pmrem.dispose();
                }
            } catch (err) {
                env = undefined;
            }
            this.nebulaEnvs.set(name, env);
        }
        return this.nebulaEnvs.get(name);
    }

    // one of the client's nebulas as a cube texture, for the background and its reflections (undefined when it can't
    // be shown)
    nebulaCube(name) {
        if (!name) {
            return undefined;
        }
        this.nebulaCubes = this.nebulaCubes || new Map();
        if (!this.nebulaCubes.has(name)) {
            let cube;
            try {
                cube = ddsCube(ShipModelHelper.nebulaResource(name), this.renderer, false);
            } catch (err) {
                cube = undefined;
            }
            this.nebulaCubes.set(name, cube);
        }
        return this.nebulaCubes.get(name);
    }

    clearShip() {
        if (this.ship === undefined) {
            return;
        }
        this.removeDecals();
        this.removeEffects();
        // (overlays share the hull's vertex buffers, so they go with it)
        for (const overlay of this.overlays || []) {
            overlay.geometry.dispose();
            overlay.material.dispose();
        }
        this.overlays = undefined;
        this.scene.remove(this.ship);
        this.ship.geometry.dispose();
        for (const hull of this.hulls || []) {
            hull.surfaceMap.value.dispose();
        }
        this.hulls = undefined;
        this.paint = undefined;
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
        const {materials, slotFor} = this.materials(model);
        for (const group of model.groups) {
            if (group.kind !== 'none') {
                geometry.addGroup(group.start, group.count, slotFor(group));
            }
        }
        // the model's own normals (smoothed and bevelled as modelled, and whole across texture seams, where the mesh's
        // vertices are split) and tangents, which the normal map tilts the surface along as the client's shader does
        if (model.normals !== undefined) {
            geometry.setAttribute('normal', new THREE.BufferAttribute(model.normals, 3));
            geometry.setAttribute('tangent', new THREE.BufferAttribute(model.tangents, 4));
        } else {
            geometry.computeVertexNormals();
        }
        geometry.computeBoundingSphere();

        const ship = new THREE.Mesh(geometry, materials);
        // centre it, and frame it whatever its size (EVE hulls range from shuttles to titans)
        const sphere = geometry.boundingSphere;
        ship.position.copy(sphere.center).multiplyScalar(-1);
        this.ship = ship;
        this.scene.add(ship);
        this.model = model;
        model.typeId = this.props.ship.type_id;
        this.applyPaint();
        this.addDecals();
        this.addEffects();
        this.addOverlays(model);

        // the new ship's race's nebula, unless one was chosen
        if (this.state.nebula === undefined) {
            this.applyLighting();
        }
        this.radius = sphere.radius;
        this.resetView();
        this.setState({status: 'ready', textured: this.textureState(model.textures)});
    }

    // A look whose texture set differs from the one loaded (a SKIN's clean "nefantar" set over the hull's weathered
    // own, or back): its textures into the hull's materials, where the client has them.
    applyTextureSet() {
        // (not while another ship is loading: its own look is set as it loads)
        if (this.model === undefined || this.hulls === undefined || this.state.skin === '' || this.model.typeId !== this.props.ship.type_id) {
            return;
        }
        const skin = this.state.skin === 'default' ? undefined : this.state.skin;
        const wanted = ShipSof.textureSet(this.props.ship, skin);
        const current = this.model.textures;
        if (wanted === current.insert && ShipSof.namesTextureSet(skin) === Boolean(current.skinSet)) {
            return;
        }
        let areaTextures;
        try {
            areaTextures = ShipModelHelper.areaTextures(this.props.ship, wanted);
        } catch (err) {
            areaTextures = undefined;
        }
        if (areaTextures === undefined) {
            return;
        }
        const skinSet = ShipSof.namesTextureSet(skin);
        // the same maps as before where the set doesn't have them only costs a reload, so it's done once per set
        for (const hull of this.hulls) {
            const textures = hull.set !== undefined ? areaTextures.sets.get(hull.set) : areaTextures.main;
            if (textures !== undefined) {
                textures.skinSet = skinSet;
                this.setTextures(hull, textures);
            }
        }
        this.model.textures = areaTextures.main;
        this.model.areaTextures = areaTextures;
        this.setState({textured: this.textureState(areaTextures.main)});
    }

    // whether the hull's colour texture shows: true, or why not ('missing': none PodStack can read, 'unsupported': the
    // graphics card can't take its format)
    textureState(textures) {
        if (textures.albedo === undefined) {
            return 'missing';
        }
        return this.albedoSupported ? true : 'unsupported';
    }

    // an area's maps into its hull material, replacing (and freeing) those it had
    setTextures(hull, textures) {
        const material = hull.material;
        const old = [material.map, material.normalMap, material.emissiveMap, hull.surfaceMap.value];
        material.map = null;
        material.normalMap = null;
        material.emissiveMap = null;

        // the albedo stays block-compressed on the graphics card, where the card supports the format
        const albedo = textures.albedo;
        const map = albedo !== undefined ? this.ddsTexture(albedo) : undefined;
        if (hull.set === undefined) {
            this.albedoSupported = map !== undefined;
        }
        if (map !== undefined) {
            map.colorSpace = THREE.SRGBColorSpace;
            map.wrapS = map.wrapT = THREE.RepeatWrapping;
            map.anisotropy = 8;
            material.map = map;
        } else {
            // a plain map, so the shader still has the hull's texture coordinates for the masks
            material.map = dataTexture({width: 1, height: 1, data: new Uint8Array([141, 147, 155, 255])}, THREE.SRGBColorSpace);
        }
        if (textures.normal !== undefined) {
            material.normalMap = dataTexture(textures.normal, THREE.NoColorSpace);
        }
        if (textures.glow !== undefined) {
            material.emissiveMap = dataTexture(textures.glow, THREE.NoColorSpace);
            material.emissive = new THREE.Color(0xffc48a);
            material.emissiveIntensity = 3;
        }

        // SKIN paint: the surface map's R says which of four areas a pixel is in, each painted with its own material
        // (colour, roughness, metalness); G is the hull's roughness detail
        hull.surfaceMap.value = textures.surface !== undefined ? dataTexture(textures.surface, THREE.NoColorSpace) :
            dataTexture({width: 1, height: 1, data: new Uint8Array([0, 128, 0, 255])}, THREE.NoColorSpace);
        // 1: blend between the mask's four levels (weathered panels part-way between two materials); 0: crisp areas
        hull.maskBlend.value = maskBlends(textures) ? 1 : 0;
        material.needsUpdate = true;
        for (const texture of old) {
            if (texture && !Object.values(material).includes(texture) && texture !== hull.surfaceMap.value) {
                texture.dispose();
            }
        }
    }

    /**
     * The ship's materials: a hull material for each of its areas' texture sets and paint area types (see
     * ShipModelHelper.areaTextures), all painted by one shader; then glass, glow and booster. {materials, slotFor (a
     * mesh group -> its material's place in materials)}.
     */
    materials(model) {
        const areaTextures = model.areaTextures || {main: model.textures, sets: new Map(), areas: new Map()};
        // the paint every hull material shares: whether it's painted, and SKIN patterns
        this.paint = {
            paintAmount: {value: 0},
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
        // each area type's four paint materials (the faction's Primary, Darkhull, Sails, ...)
        this.areaPaint = {};
        this.hulls = [];

        const materials = [];
        const slots = new Map();
        const hullSlot = materialIndex => {
            const area = areaTextures.areas.get(materialIndex) || {};
            const textures = area.set !== undefined ? areaTextures.sets.get(area.set) : undefined;
            const set = textures !== undefined && textures.albedo !== undefined ? area.set : undefined;
            const areaType = AREA_TYPES[area.areaType] !== undefined ? area.areaType : 0;
            const heat = Boolean(area.heat);
            const key = `${set || ''}|${areaType}|${heat}`;
            if (!slots.has(key)) {
                slots.set(key, materials.length);
                const hull = this.hullMaterial(set !== undefined ? textures : areaTextures.main, set, areaType, heat);
                materials.push(hull.material);
                this.hulls.push(hull);
            }
            return slots.get(key);
        };
        // the main texture set first (the one the "plain metal" note is about)
        hullSlot(-1);
        for (const group of model.groups) {
            if (group.kind === 'hull') {
                hullSlot(group.materialIndex);
            }
        }
        this.hull = this.hulls[0].material;

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
        const others = {glass: materials.length, glow: materials.length + 1, booster: materials.length + 2};
        materials.push(glass, glow, booster);
        this.applyColors();
        return {materials, slotFor: group => (group.kind === 'hull' ? hullSlot(group.materialIndex) : others[group.kind])};
    }

    // A hull material for one area's textures and paint area type: {material, set, areaType, heat (an engine's or
    // reactor's: its glow map glows in the faction's heat colour), surfaceMap, maskBlend}.
    hullMaterial(textures, set, areaType, heat) {
        const hull = {
            material: new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 0.5, metalness: 0.15}),
            set,
            areaType,
            heat,
            surfaceMap: {value: BLANK()},
            maskBlend: {value: 1},
        };
        if (this.areaPaint[areaType] === undefined) {
            this.areaPaint[areaType] = {
                mtlDiffuse: {value: [0, 1, 2, 3].map(() => new THREE.Color(0x808080))},
                mtlSpecular: {value: [0, 1, 2, 3].map(() => new THREE.Color(0x0a0a0a))},
                mtlRough: {value: [0.5, 0.5, 0.5, 0.5]},
            };
        }
        this.setTextures(hull, textures);
        hull.material.onBeforeCompile = shader => {
            Object.assign(shader.uniforms, this.paint, this.areaPaint[areaType], this.reflection,
                {surfaceMap: hull.surfaceMap, maskBlend: hull.maskBlend});
            this.paintShader(shader);
        };
        return hull;
    }

    // the hull paint shader: the client's quadv5 paint and SKIN patterns, into a standard material's shader
    paintShader(shader) {
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
uniform samplerCube reflectionCube;
uniform float reflectionIntensity;
uniform float reflectionFlip;
// a view-space direction as the reflection cube is looked up: in the world, mirrored as the backdrop is
vec3 reflectionDirection(vec3 viewDirection) {
    vec3 world = inverseTransformDirection(viewDirection, viewMatrix);
    return vec3(reflectionFlip * world.x, world.yz);
}
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
// the roughness map scales the material's gloss (hulls are shown clean: the client's dirt map isn't used)
float paintGloss = areaGloss * surfaceSample.g;
// the hull's colour texture (panels, recesses, highlights; read as sRGB, as the client's shader declares it) times the
// material's colour
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * areaColor, paintAmount);`)
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
material.specularColorBlended = mix(material.specularColorBlended, areaSpecular, paintAmount);`)
            .replace('#include <lights_fragment_maps>', `
// What the hull reflects, as the client's quadv5 does it: its reflection cube at a mip level that blurs with the
// roughness (a = roughness², level 7 - log2(2 / a⁴ - 1) / 4: gloss 0.5 reflects level 4.75 of 7), dimmed where the
// reflection would come from inside the hull; and the cube's smallest level along the normal as soft light from all
// round (three.js divides it by π, as the client doesn't).
#if defined( RE_IndirectDiffuse )
    iblIrradiance += PI * reflectionIntensity * textureLod(reflectionCube, reflectionDirection(geometryNormal), 6.0).rgb;
#endif
#if defined( RE_IndirectSpecular )
{
    vec3 reflected = reflect(-geometryViewDir, geometryNormal);
    float a = material.roughness * material.roughness;
    float a4 = a * a * a * a;
    float level = a >= 0.000526 ? 7.0 - log2(2.0 / a4 - 1.0) / 4.0 : 0.0;
    float horizon = clamp(1.0 + 10.0 * (1.0 - a) * dot(nonPerturbedNormal, reflected), 0.0, 1.0);
    radiance += reflectionIntensity * horizon * textureLod(reflectionCube, reflectionDirection(reflected), level).rgb;
}
#endif`);
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
        // area type -> its four paint materials
        const typeAreas = {};
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
            const skinId = skin === 'default' ? undefined : skin;
            const fromSof = sof => sof.map(a => a.missing ? guessed(ShipPaint.fromName(a.name)) :
                {diffuse: new THREE.Color().setRGB(...a.diffuse), specular: new THREE.Color().setRGB(...a.specular), roughness: a.roughness});
            const sof = ShipSof.areas(ship, skinId);
            if (sof !== undefined) {
                areas = fromSof(sof);
                exact = sof.every(a => !a.missing);
            } else if (skin !== 'default') {
                const approx = ShipPaint.areas(skin);
                if (approx !== undefined) {
                    areas = approx.areas.map(guessed);
                }
            }
            // the hull's other area types (Darkhull, Sails, ...) take the faction's materials for them, else the main ones
            if (areas !== undefined) {
                for (const type of Object.keys(this.areaPaint)) {
                    const other = Number(type) !== 0 ? ShipSof.areas(ship, skinId, AREA_TYPES[type]) : undefined;
                    // a slot the faction leaves blank for this type keeps the main paint's
                    typeAreas[type] = other !== undefined ? fromSof(other).map((a, i) => (other[i].name ? a : areas[i])) : areas;
                }
            }
        }
        this.paint.paintAmount.value = areas !== undefined ? 1 : 0;
        for (const [type, list] of Object.entries(typeAreas)) {
            const uniforms = this.areaPaint[type];
            list.forEach((area, i) => {
                uniforms.mtlDiffuse.value[i].copy(area.diffuse);
                uniforms.mtlSpecular.value[i].copy(area.specular);
                uniforms.mtlRough.value[i] = area.roughness;
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

    // The glowing layers the client draws over some of the hull's parts (its additive areas, fxv5: a Golem's energy
    // fields, an Osprey's glowing panels, a Dominix's reactor), each over its slot's triangles.
    addOverlays(model) {
        this.overlays = [];
        const geometry = this.ship.geometry;
        for (const [slot, pass] of model.passes || new Map()) {
            const groups = model.groups.filter(g => g.materialIndex === slot);
            for (const area of groups.length > 0 ? pass.additive : []) {
                const overlay = new THREE.BufferGeometry();
                for (const name of ['position', 'normal', 'uv']) {
                    overlay.setAttribute(name, geometry.getAttribute(name));
                }
                overlay.setIndex(geometry.getIndex());
                groups.forEach(g => overlay.addGroup(g.start, g.count, 0));
                const mesh = new THREE.Mesh(overlay, [this.fxMaterial(area)]);
                mesh.renderOrder = 2;
                this.ship.add(mesh);
                this.overlays.push({geometry: overlay, material: mesh.material[0]});
            }
        }
    }

    // the client's fxv5 for a hull area: two scrolling layers times a mask and a colour, faded by the angle to the
    // camera (FresnelFactors: power, strength, shift; a negative strength makes it brightest face-on), added on
    fxMaterial(area) {
        const p = area.parameters;
        const vec4 = (name, fallback) => new THREE.Vector4(...(p[name] && p[name].length === 4 ? p[name] : fallback));
        return new THREE.ShaderMaterial({
            uniforms: {
                layer1: {value: this.effectTexture(area.maps.Layer1Map)},
                layer2: {value: this.effectTexture(area.maps.Layer2Map)},
                mask: {value: this.effectTexture(area.maps.LayerMaskMap)},
                transform1: {value: vec4('Layer1Transform', [1, 1, 0, 0])},
                transform2: {value: vec4('Layer2Transform', [1, 1, 0, 0])},
                scroll1: {value: vec4('Layer1Scroll', [0, 0, 0, 0])},
                scroll2: {value: vec4('Layer2Scroll', [0, 0, 0, 0])},
                baseColor: {value: vec4('BaseColor', [1, 1, 1, 1])},
                fresnel: {value: vec4('FresnelFactors', [1, -1, -1, 0])},
                time: this.effectTime,
            },
            vertexShader: UBER_VERTEX,
            fragmentShader: FX_FRAGMENT,
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
            blending: THREE.CustomBlending,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneFactor,
        });
    }

    removeEffects() {
        if (this.effects === undefined) {
            return;
        }
        this.ship.remove(this.effects);
        this.effects.traverse(object => {
            if (object.isMesh || object.isPoints) {
                object.geometry.dispose();
                object.material.dispose();
            }
        });
        this.effects = undefined;
    }

    // The effects on the hull with the look's faction (see ShipSof.effects): its own glowing pipes and exhausts, a
    // SKIN's holograms and glowing trails: their meshes, placed on the hull, drawn with the client's ubershader, and
    // their point lights (particles and animation curves in them aren't shown); and the hull's running lights in the
    // faction's colours.
    addEffects() {
        if (this.ship === undefined) {
            return;
        }
        this.removeEffects();
        if (this.state.skin === '') {
            return;
        }
        const ship = this.props.ship;
        const located = ShipModelHelper.locate(ship);
        const hull = located !== undefined ? located.hull : ship.model && ship.model.hull;
        const faction = ShipSof.factionFor(ship, typeof this.state.skin === 'number' ? this.state.skin : undefined);
        const roots = ShipSof.effects(hull, faction);
        const lights = ShipSof.lights(hull, faction);
        if (roots.length === 0 && lights.length === 0) {
            return;
        }
        this.effects = new THREE.Group();
        for (const root of roots) {
            this.addEffectNode(root, this.effects);
        }
        if (lights.length > 0) {
            this.effects.add(this.lightPoints(lights));
        }
        this.ship.add(this.effects);
    }

    // the hull's running lights as glowing points
    lightPoints(lights) {
        const positions = new Float32Array(lights.length * 3);
        const colors = new Float32Array(lights.length * 3);
        const blinks = new Float32Array(lights.length * 4);
        lights.forEach((light, i) => {
            positions.set(light.position, i * 3);
            colors.set(light.color.map(c => c * LIGHT_BRIGHTNESS), i * 3);
            blinks.set([light.blinkRate, light.blinkPhase, light.minScale * LIGHT_SIZE, light.maxScale * LIGHT_SIZE], i * 4);
        });
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('lightColor', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('blink', new THREE.BufferAttribute(blinks, 4));
        const material = new THREE.ShaderMaterial({
            uniforms: {time: this.effectTime, viewportHeight: this.viewportHeight},
            vertexShader: LIGHT_VERTEX,
            fragmentShader: LIGHT_FRAGMENT,
            transparent: true,
            depthWrite: false,
            blending: THREE.CustomBlending,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneFactor,
        });
        const points = new THREE.Points(geometry, material);
        points.renderOrder = 3;
        return points;
    }

    // a container or mesh of an effect (and what's in it) under parent
    addEffectNode(node, parent) {
        if (!node || typeof node !== 'object' || !['EveChildContainer', 'EveChildMesh'].includes(node._class)) {
            return;
        }
        const group = new THREE.Group();
        if (Array.isArray(node.translation) && node.translation.length === 3) {
            group.position.fromArray(node.translation);
        }
        if (Array.isArray(node.rotation) && node.rotation.length === 4) {
            const q = new THREE.Quaternion().fromArray(node.rotation);
            if (q.length() > 1e-6) {
                group.quaternion.copy(q.normalize());
            }
        }
        if (Array.isArray(node.scaling) && node.scaling.length === 3) {
            group.scale.fromArray(node.scaling);
        }
        parent.add(group);
        const mesh = node.mesh;
        if (node._class === 'EveChildMesh' && mesh && mesh.geometryResPath) {
            const model = ShipModelHelper.geometry(mesh.geometryResPath);
            if (model !== undefined) {
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(model.positions, 3));
                geometry.setAttribute('uv', new THREE.BufferAttribute(model.uvs, 2));
                geometry.setIndex(new THREE.BufferAttribute(model.indices, 1));
                if (model.normals !== undefined) {
                    geometry.setAttribute('normal', new THREE.BufferAttribute(model.normals, 3));
                } else {
                    geometry.computeVertexNormals();
                }
                for (const [areas, additive] of [[mesh.transparentAreas, false], [mesh.additiveAreas, true]]) {
                    for (const area of Array.isArray(areas) ? areas : []) {
                        const material = area && this.effectMaterial(area.effect, additive);
                        if (material !== undefined) {
                            const part = new THREE.Mesh(geometry.clone(), material);
                            part.renderOrder = 2;
                            group.add(part);
                        }
                    }
                }
                geometry.dispose();
            }
        }
        // its point lights, which colour the hull around it: strongest at the light, gone at its radius
        for (const light of Array.isArray(node.lights) ? node.lights : []) {
            const radius = light && Array.isArray(light.radius) ? light.radius[0] : 0;
            const brightness = light && Array.isArray(light.brightness) ? light.brightness[0] : 1;
            if (!Array.isArray(light.position) || !Array.isArray(light.color) || !(radius > 0)) {
                continue;
            }
            const point = new THREE.PointLight(new THREE.Color(...light.color.slice(0, 3)), brightness * radius * radius / 16, radius, 2);
            point.position.fromArray(light.position);
            group.add(point);
        }
        for (const child of Array.isArray(node.objects) ? node.objects : []) {
            this.addEffectNode(child, group);
        }
    }

    // an ubershader material for an effect's settings (undefined for other shaders)
    effectMaterial(effect, additive) {
        if (!effect || !/ubershader[a-z]*\.fx$/i.test(effect.effectFilePath || '')) {
            return undefined;
        }
        // its values: constant ones, then those that can be animated
        const values = {};
        for (const p of Array.isArray(effect.constParameters) ? effect.constParameters : []) {
            if (Array.isArray(p) && typeof p[0] === 'string') {
                values[p[0]] = p.slice(1, 5);
            }
        }
        for (const p of Array.isArray(effect.parameters) ? effect.parameters : []) {
            if (p && p.name && Array.isArray(p.value)) {
                values[p.name] = p.value;
            }
        }
        const textures = Object.fromEntries((Array.isArray(effect.resources) ? effect.resources : [])
            .filter(r => r && r.name && r.resourcePath)
            .map(r => [r.name, r.resourcePath]));
        const vec4 = (name, fallback) => new THREE.Vector4(...(values[name] && values[name].length === 4 ? values[name] : fallback));
        const mapCount = ['DiffuseMap1', 'DiffuseMap2', 'DiffuseMap3'].filter(name => textures[name]).length;
        return new THREE.ShaderMaterial({
            uniforms: {
                diffuseColor: {value: vec4('DiffuseColor', [1, 1, 1, 1])},
                map1: {value: this.effectTexture(textures.DiffuseMap1)},
                map2: {value: this.effectTexture(textures.DiffuseMap2)},
                map3: {value: this.effectTexture(textures.DiffuseMap3)},
                maskMap: {value: this.effectTexture(textures.MaskMap)},
                transform1: {value: vec4('TextureTransform1', [0, 0, 1, 1])},
                transform2: {value: vec4('TextureTransform2', [0, 0, 1, 1])},
                transform3: {value: vec4('TextureTransform3', [0, 0, 1, 1])},
                scroll1: {value: vec4('TextureScroll1', [0, 0, 0, 0])},
                scroll2: {value: vec4('TextureScroll2', [0, 0, 0, 0])},
                scroll3: {value: vec4('TextureScroll3', [0, 0, 0, 0])},
                mapCount: {value: Math.max(1, mapCount)},
                // without its own: full strength at every angle
                fresnel: {value: vec4('FresnelFactors', [1, -1, -1, 0])},
                time: this.effectTime,
            },
            vertexShader: UBER_VERTEX,
            fragmentShader: UBER_FRAGMENT,
            transparent: true,
            depthWrite: false,
            blending: additive ? THREE.CustomBlending : THREE.NormalBlending,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneFactor,
        });
    }

    // an effect's texture, repeating (white where it has none, or the client doesn't have it)
    effectTexture(res) {
        this.effectTextures = this.effectTextures || new Map();
        if (!this.effectTextures.has(res || '')) {
            let texture;
            try {
                const bytes = res ? ShipModelHelper.resource(res) : undefined;
                texture = bytes !== undefined ? this.ddsTexture(parseDds(bytes)) : undefined;
            } catch (err) {
                texture = undefined;
            }
            if (texture === undefined) {
                texture = dataTexture({width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255])}, THREE.NoColorSpace);
            }
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            this.effectTextures.set(res || '', texture);
        }
        return this.effectTextures.get(res || '');
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
            const glow = decal.kind === 'glow';
            // a light strip glows through its glow map (one channel); the others are painted with their colour map
            const albedo = glow ? this.decalTexture(decal.textures.DecalGlowMap, 'mask') : this.decalTexture(decal.textures.DecalAlbedoMap, 'color');
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

            const material = glow ?
                // added on in the faction's colour for it, at the decal's intensity
                new THREE.MeshBasicMaterial({
                    map: albedo, alphaMap: transparency, transparent: true, depthWrite: false,
                    color: new THREE.Color(...decal.glowColor.map(c => c * decal.intensity)),
                    blending: THREE.AdditiveBlending,
                    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
                }) :
                new THREE.MeshStandardMaterial({
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
        if (dds.format === 'RGBA8' || dds.format === 'BGRA8') {
            const mip = dds.mips[0];
            const rgba = new Uint8Array(mip.data);
            if (dds.format === 'BGRA8') {
                for (let i = 0; i < rgba.length; i += 4) {
                    [rgba[i], rgba[i + 2]] = [rgba[i + 2], rgba[i]];
                }
            }
            return dataTexture({width: mip.width, height: mip.height, data: rgba}, THREE.NoColorSpace);
        }
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
        for (const hull of this.hulls || []) {
            if (hull.material.emissiveMap) {
                // engines (quadheatv5) glow in the booster colour, reactors in the reactor colour, the rest of the hull
                // in its own glow colour
                if (hull.heat && hull.areaType === 3) {
                    set(hull.material, 'Reactor', '#ffa860', 0.6);
                } else if (hull.heat) {
                    set(hull.material, 'Booster', '#ffb070', 1.5);
                } else {
                    set(hull.material, 'Hull', '#ffc48a', 0.6);
                }
            }
        }
        set(this.glowMaterial, 'Reactor', '#ffa860', 0.6);
        set(this.booster, 'Booster', '#ffb070', 1.5);
        set(this.glass, 'Glass', '#000000', 0.5);
    }

    // the client's nebulas, read once
    nebulas() {
        if (this.nebulaNames === undefined) {
            this.nebulaNames = ShipModelHelper.nebulas().sort((a, b) => nebulaLabel(a).localeCompare(nebulaLabel(b)));
        }
        return this.nebulaNames;
    }

    // the nebula the client's own ship preview shows the ship's race in (dx9/scene/preview/<faction>.black), else The
    // Citadel's
    defaultNebula() {
        const names = this.nebulas();
        const preview = RACE_NEBULAS[this.props.ship.race_id];
        if (names.includes(preview)) {
            return preview;
        }
        return names.includes(NEBULA) ? NEBULA : names[0];
    }

    isFullscreen() {
        return this.root.current !== null && document.fullscreenElement === this.root.current;
    }

    // the view filling the screen, with its toolbar; or back in the page (Esc does that too)
    toggleFullscreen() {
        const done = this.isFullscreen() ? document.exitFullscreen() : this.root.current.requestFullscreen();
        done.catch(() => {});
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
            <div className="ship-viewer" ref={this.root}>
                <div ref={this.mount} className="ship-viewer-canvas" style={{height: this.state.height}}
                     onDoubleClick={() => this.toggleFullscreen()}/>

                {status === 'loading' &&
                    <div className="ship-viewer-overlay" style={{height: this.state.height}}><span className="muted">Loading {ship.name} from your EVE client…</span></div>}
                {status === 'error' &&
                    <div className="ship-viewer-overlay" style={{height: this.state.height}}>
                        <img src={`https://images.evetech.net/types/${ship.type_id}/render?size=256`} alt="" width={256} height={256}/>
                        <span className="muted">{error} Showing CCP's render instead.</span>
                    </div>
                }

                <div className="ship-viewer-toolbar" ref={this.toolbar}>
                    <span className="ship-viewer-label">Skin Selector</span>
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
                    {this.nebulas().length > 0 && <span className="ship-viewer-label">Nebula Selector</span>}
                    {this.nebulas().length > 0 &&
                        <select className="field small" value={this.nebulaName() || 'none'}
                                title="The space behind the ship, reflected on it"
                                onChange={e => this.setState({nebula: e.target.value})}>
                            <option value="none">No backdrop</option>
                            {this.nebulas().map(name => <option key={name} value={name}>{nebulaLabel(name)}</option>)}
                        </select>}
                    <button type="button" className="link-button" onClick={() => this.setState({autoRotate: !this.state.autoRotate})}>
                        {this.state.autoRotate ? 'Stop rotating' : 'Rotate'}
                    </button>
                    <button type="button" className="link-button" onClick={() => this.resetView()}>Reset view</button>
                    <button type="button" className="link-button" onClick={() => this.toggleFullscreen()}>
                        {this.state.fullscreen ? 'Exit full screen' : 'Full screen'}
                    </button>
                    <span className="faint ship-viewer-hint">Drag to orbit · scroll to zoom · right-drag to pan · double-click for full screen</span>
                </div>
                {status === 'ready' && this.state.textured !== true &&
                    <p className="faint" style={{margin: 0, padding: '0 12px 10px'}}>
                        {this.state.textured === 'unsupported' ?
                            'Your graphics card can\'t show this hull\'s colour texture, so it\'s shown in plain metal.' :
                            'PodStack couldn\'t read this hull\'s colour texture from your EVE client, so it\'s shown in plain metal.'}
                    </p>}
            </div>
        );
    }
}
