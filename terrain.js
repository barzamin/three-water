// @ts-check

import * as T from "three";
import { clamp } from './utils.js';

export class TerrainMap {
    /**
     * @param {number} width
     * @param {number} height
     */
    constructor(width, height) {
        this.width = width;
        this.height = height;
        const size = width * height;
        this.buf = new Float32Array(size);
        this.texture = new T.DataTexture(this.buf, width, height, T.RedFormat, T.FloatType);
        this.texture.magFilter = T.LinearFilter;
        this.texture.needsUpdate = true;
    }

    // texture sampling on the CPU
    sample(u, v) {
        // find enclosing quad
        // 00───────10
        //  │       │
        //  │       │
        // 01───────11
        // and lerp within it (linear upscaling, pretend we have flat quads connecting heights)

        // scaled so that fractional is within a quad
        const p = u * (this.width - 1);
        const q = v * (this.height - 1);

        const i00 = Math.floor(p);
        const j00 = Math.floor(q);
        // uv within quad
        const s = p % 1
        const t = q % 1;

        const y00 = this.clampedAt(i00, j00);
        const y01 = this.clampedAt(i00, j00 + 1);
        const y10 = this.clampedAt(i00 + 1, j00);
        const y11 = this.clampedAt(i00 + 1, j00 + 1);

        return (1 - s) * (1 - t) * y00
            + s * (1 - t) * y10
            + (1 - s) * t * y01
            + s * t * y11;
    }

    at(i, j) {
        return this.buf[i + j * this.width];
    }

    clampedAt(i, j) {
        return this.at(clamp(i, 0, this.width - 1), clamp(j, 0, this.height - 1));
    }

    /** map a function across the heightmap and writeback in place
     * @param {(height: number, i: number, j: number) => number} fn
     */
    apply(fn) {
        for (let i = 0; i < this.width; i++) {
            for (let j = 0; j < this.height; j++) {
                this.buf[i + j * this.width] = fn(this.buf[i + j * this.width], i, j);
            }
        }
    }

    /**
     * @param {T.BufferGeometry} geom
     */
    warpMesh(geom) {
        const verts = /**@type {Float32Array}*/ (geom.attributes['position'].array);
        const uvs = /**@type {Float32Array}*/ (geom.attributes['uv'].array);
        for (let i = 0; i < verts.length/3; i++) {
            verts[i*3 + 1] = this.sample(uvs[i*2 + 0], uvs[i*2+1]);
        }

        geom.attributes.position.needsUpdate = true;
        geom.computeVertexNormals();
    }
}

export function generateTestTerrain(width, height) {
    const heightmap = new TerrainMap(width, height);
    for (let i = 0; i < width; i++) {
        for (let j = 0; j < height; j++) {
            heightmap.buf[i + j * width] = 2*(Math.sin(2 * Math.PI * i / width) + Math.sin(2*Math.PI * 1.5 * j / height));
        }
    }

    return heightmap;
}

export function loadTerrain(uri) {
    const imgLoader = new T.ImageLoader();
    return imgLoader.loadAsync(uri).then(img => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        return imgData;
    }).then(imgData => {
        const heightmap = new TerrainMap(imgData.width, imgData.height);
        const terrainTypeMap = new TerrainMap(imgData.width, imgData.height);
        for (let i = 0; i < imgData.width * imgData.height; i++) {
            heightmap.buf[i] = imgData.data[i*4]/256. - 0.5;
            terrainTypeMap.buf[i] = imgData.data[i*4 + 1]/256.;
        }
        return [heightmap, terrainTypeMap];
    });
}

export class Ground {
    static id = 0;
    uiHidden = true;

    /**
     * @param {TerrainMap} heightmap
     * @param {TerrainMap} typemap
     */
    constructor(heightmap, typemap) {
        const geom = new T.PlaneGeometry(20, 20, heightmap.width - 1, heightmap.height - 1);
        geom.rotateX(-Math.PI / 2);
        const mat = new T.ShaderMaterial({
            vertexShader: /*glsl*/`
            varying vec2 v_uv;
            void main() {
                v_uv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
            `,
            fragmentShader: /*glsl*/`
            varying vec2 v_uv;
            uniform sampler2D t_typemap;
            void main() {
                vec3 groundColor = mix(vec3(0.6, 0.4, 0.3), vec3(0.3, 0.6, 0.4), texture2D(t_typemap, v_uv).x);
                gl_FragColor = vec4(groundColor, 1.);
            }
            `,
            uniforms: {
                't_typemap': {value: typemap.texture},
            },
            side: T.DoubleSide
        });
        const obj = new T.Mesh(geom, mat);

        this.obj = obj;
        this.subdivs = [heightmap.width, heightmap.height];

        heightmap.warpMesh(geom);
    }
};
