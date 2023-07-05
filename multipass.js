import * as T from 'three';

/**
 * @param {T.WebGLRenderer} renderer
 * @param {*} options
 * @returns {T.WebGLRenderTarget}
 */
export function makeRenderTgt(renderer, options = {}) {
    const depth = options['depth'] || false;
    const dims = renderer.getDrawingBufferSize(new T.Vector2());
    return new T.WebGLRenderTarget(dims.width, dims.height, {
        minFilter: T.LinearFilter,
        magFilter: T.LinearFilter,
        depthTexture: depth ? new T.DepthTexture(dims.width, dims.height, T.FloatType) : null,
        ...(options['targetOptions'] || {})
    });
}


// useless and trivial screenfill
const fsTriCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const fsTriGeom = new T.BufferGeometry();
fsTriGeom.setAttribute('position', new T.Float32BufferAttribute([- 1, 3, 0, - 1, - 1, 0, 3, - 1, 0], 3));
fsTriGeom.setAttribute('uv', new T.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));

export class PassthroughPass {
    constructor(options = {}) {
        this.copyDepth = options['copyDepth'] || false;
        let frag = /*glsl*/`\
varying vec2 v_uv;
uniform sampler2D texColor;
uniform sampler2D texDepth;
void main() {
    gl_FragColor = texture2D(texColor, v_uv);
`;
        if (this.copyDepth) {
            frag += '    gl_FragDepth = texture2D(texDepth, v_uv).x;\n';
        }
        frag += '}';
        // console.log(frag);

        const fbPassthroughMat = new T.ShaderMaterial({
            vertexShader: /*glsl*/`
            varying vec2 v_uv;
            void main() {
                v_uv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
            }
            `,
            fragmentShader: frag,
            uniforms: {
                'texColor': { value: null },
                'texDepth': { value: null },
            }
        });

        this.fsMesh = new T.Mesh(fsTriGeom, fbPassthroughMat);
    }

    /** render a pass, copying data fromTarget -> toTarget.
     * @param {T.WebGLRenderer} renderer
     * @param {T.WebGLRenderTarget | null} toTarget
     * @param {T.WebGLRenderTarget} fromTarget
     */
    render(renderer, toTarget, fromTarget) {
        renderer.setRenderTarget(toTarget);
        renderer.clear(true, true, true);
        this.fsMesh.material.uniforms['texColor'].value = fromTarget.texture;
        if (this.copyDepth) {
            this.fsMesh.material.uniforms['texDepth'].value = fromTarget.depthTexture;
        }

        renderer.render(this.fsMesh, fsTriCam);
    }
}
