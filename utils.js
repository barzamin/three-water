// ---- utilities ---

import * as THREE from "three";

export const argcmp = (cmp) => (arr) => arr.map((v, i) => [v, i]).reduce(cmp)[1];
export const argmax = argcmp((min, v) => (v[0] > min[0] ? v : min));
export const argmin = argcmp((min, v) => (v[0] < min[0] ? v : min));

export function remap(value, istart, istop, ostart, ostop) {
	return ostart + (ostop - ostart) * ((value - istart) / (istop - istart));
}

export function rgb2style(color) {
    const [r, g, b] = color;
    return `rgb(${r}, ${g}, ${b})`;
}

/**
 * wrapping modulus (negatives wrap up to positive)
 * @param {number} n
 * @param {number} m
 * @returns {number}
 */
export const wrap = (n, m) => ((n % m) + m) % m;

export function lerp(a, b, t) {
    return a * (1 - t) + b * t;
}

export function randIn(a, b) {
    return lerp(a, b, Math.random());
}

export function clamp(x, min, max) {
    return Math.min(Math.max(x, min), max);
}

export function binsearch(array, pred) {
    let l = -1, r = array.length;
    while (l < r - 1) {
        const pivot = l + ((r - l) >> 1);
        if (pred(array[pivot])) {
            r = pivot;
        } else {
            l = pivot;
        }
    }

    return r;
}

export function binsearchLowerBound(array, val) {
    return binsearch(array, q => val <= q);
}

export class MeshUVMaterial extends THREE.ShaderMaterial {
    constructor() {
        super({
            vertexShader: /*glsl*/`
            varying vec2 v_uv;
            void main() {
                v_uv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
            fragmentShader: /*glsl*/`
            varying vec2 v_uv;
            void main() {
                gl_FragColor = vec4(v_uv.x, v_uv.y, 0., 1.);
            }`,
        });
    }
}
