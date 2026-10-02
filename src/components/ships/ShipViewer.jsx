'use strict';

import React from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';

import ShipModelHelper from '../../helpers/ShipModelHelper';

const HEIGHT = 460;
const COMPRESSED = {
    BC7: {extension: 'EXT_texture_compression_bptc', format: THREE.RGBA_BPTC_Format},
    BC1: {extension: 'WEBGL_compressed_texture_s3tc', format: THREE.RGB_S3TC_DXT1_Format},
    BC3: {extension: 'WEBGL_compressed_texture_s3tc', format: THREE.RGBA_S3TC_DXT5_Format},
};
const LIGHTING = {
    studio: {label: 'Studio', background: 0x0b0e13, env: 1.0, key: 2.2, rim: 1.2, ambient: 0.25},
    space: {label: 'Deep space', background: 0x020306, env: 0.35, key: 3.2, rim: 0.6, ambient: 0.05},
    bright: {label: 'Bright', background: 0x1a1f27, env: 1.6, key: 1.6, rim: 1.0, ambient: 0.6},
};

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

        this.state = {status: 'loading', error: undefined, autoRotate: true, lighting: 'studio'};
        this.mount = React.createRef();
    }

    componentDidMount() {
        this.setUp();
        // let "Loading…" paint before the (synchronous) model load
        this.loadTimer = setTimeout(() => this.loadShip(), 30);
    }

    componentDidUpdate(prevProps, prevState) {
        if (prevProps.ship.type_id !== this.props.ship.type_id) {
            this.setState({status: 'loading', error: undefined});
            clearTimeout(this.loadTimer);
            this.loadTimer = setTimeout(() => this.loadShip(), 30);
        }
        if (prevState.lighting !== this.state.lighting) {
            this.applyLighting();
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
        this.scene.remove(this.ship);
        this.ship.geometry.dispose();
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
            model = ShipModelHelper.load(this.props.ship);
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
        const kinds = ['hull', 'glass', 'glow'];
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

        this.radius = sphere.radius;
        this.resetView();
        this.setState({status: 'ready', textured: model.textures.albedo !== undefined && this.albedoSupported});
    }

    materials(textures) {
        const hull = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 1, metalness: 1});

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
            hull.color = new THREE.Color(0x8d939b);
        }
        if (textures.normal !== undefined) {
            hull.normalMap = dataTexture(textures.normal, THREE.NoColorSpace);
        }
        if (textures.surface !== undefined) {
            hull.roughnessMap = hull.metalnessMap = dataTexture(textures.surface, THREE.NoColorSpace);
        } else {
            hull.roughness = 0.6;
            hull.metalness = 0.4;
        }
        if (textures.glow !== undefined) {
            hull.emissiveMap = dataTexture(textures.glow, THREE.NoColorSpace);
            hull.emissive = new THREE.Color(0xffc48a);
            hull.emissiveIntensity = 3;
        }

        const glass = new THREE.MeshStandardMaterial({
            color: 0x10202c, roughness: 0.08, metalness: 0.9, transparent: true, opacity: 0.85,
        });
        const glow = new THREE.MeshStandardMaterial({
            color: 0x332211, emissive: new THREE.Color(0xffa860), emissiveIntensity: 2.5, roughness: 0.4,
        });
        return [hull, glass, glow];
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
                    <div className="seg">
                        {Object.entries(LIGHTING).map(([key, preset]) =>
                            <button key={key} type="button" className={this.state.lighting === key ? 'active' : ''}
                                    onClick={() => this.setState({lighting: key})}>{preset.label}</button>
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
