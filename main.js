import * as THREE from 'three';
import * as Stats from 'stats.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { Sea } from './sea';
import * as Terrain from "./terrain.js";

import GUI from 'lil-gui';
import { PassthroughPass, makeRenderTgt } from './multipass';

class App {
    constructor() {
        const { innerWidth: width, innerHeight: height } = window;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(/* fov */ 45, width / height, /* near */ 0.1, /* far */ 2000);
        this.camera.position.set(10, 20, 10);
        this.camera.lookAt(new THREE.Vector3(0, 0, 0));

        this.renderer = new THREE.WebGLRenderer({
        });
        this.renderer.setSize(width, height);
        this.renderer.autoClear = false;

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);

        this.stats = new Stats();
        this.stats.showPanel(1); // 0: fps, 1: ms, 2: mb, 3+: custom

        this.gui = new GUI();

        this.sea = new Sea(20, 20, 5);
        this.sea.registerGui(this.gui);
        this.scene.add(this.sea.obj);

        Terrain.loadTerrain('./textures/heightmap.png').then(([heightMap, typeMap]) => {
            heightMap.apply((y) => y * 3. + 1.);
            const ground = new Terrain.Ground(heightMap, typeMap);
            this.scene.add(ground.obj);
        });

        /// -- lighting --
        const light = new THREE.DirectionalLight(0xffeeee, 1);
        light.position.set(10, 20, 30);
        light.lookAt(new THREE.Vector3(0, 0, 0));
        this.scene.add(new THREE.AmbientLight(0xffffff, .1));
        this.scene.add(light);

        const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xff00ff }));
        this.scene.add(cube);

        this.renderTargets = {
            'baseScene': makeRenderTgt(this.renderer, { depth: true }),
            'postWater': makeRenderTgt(this.renderer, { depth: false }),
        }

        this.passes = {
            'baseCopy': new PassthroughPass({ copyDepth: true }),
            'outputCopy': new PassthroughPass({ copyDepth: false }),
        }
    }

    run(ts) {
        this.stats.begin();

        if (this.last_ts) {
            const dt = ts - this.last_ts;
            this.update(dt);
        }
        this.render();

        this.last_ts = ts;
        window.requestAnimationFrame((ts) => this.run(ts));

        this.stats.end();
    }

    render(dt) {
        // this.sea.obj.visible = false;
        // this.renderer.render(this.scene, this.camera);


        // render the scene without water
        this.sea.obj.visible = false;
        this.renderer.setRenderTarget(this.renderTargets.baseScene);
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);

        // copy the base pass color to the new target
        this.passes.baseCopy.render(this.renderer, this.renderTargets.postWater, this.renderTargets.baseScene);
        this.sea.obj.visible = true;
        this.renderer.setRenderTarget(this.renderTargets.postWater);
        this.sea.updateCamera(this.renderer, this.camera);
        this.sea.updateScenePassInputs(this.renderTargets.baseScene);
        // console.log(this.sea.obj.material.uniforms);
        this.renderer.render(this.sea.obj, this.camera);

        // copy the result to the canvas
        this.passes.outputCopy.render(this.renderer, null, this.renderTargets.postWater);
    }

    update(dt) {
        // console.log(dt);
        this.sea.tick(dt);
    }

    resized(width, height) {
        this.camera.aspect = width / height;
        this.renderer.setSize(width, height);
        this.controls.update();
    }
}

const app = new App();
window.addEventListener('resize', (ev) => app.resized(window.innerWidth, window.innerHeight));
document.body.appendChild(app.renderer.domElement);
document.body.appendChild(app.stats.dom);

app.run();
