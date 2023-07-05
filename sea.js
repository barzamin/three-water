import * as T from 'three';
import GUI from 'lil-gui';

const VERT = /*glsl*/`
out vec2 v_uv;
out vec3 v_pos;
out vec3 v_normal;

uniform sampler2D noise;
uniform float time;

void main() {
    v_uv = uv;
    vec3 pos = position;
    // float height = texture2D(noise, mod(v_uv/3. + time/10., 1.)).r;
    // vec3 pos = position + height*normal*.3;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( pos, 1.0 );
    v_pos = pos;
    v_normal = normalMatrix * normal;
}`;

const FRAG = /*glsl*/`
#include <packing>
in vec2 v_uv;
in vec3 v_pos;
in vec3 v_normal;

// knobs
uniform vec3 u_surfaceWaterColor;
uniform vec3 u_deepWaterColor;
uniform vec3 u_shadowColor;
uniform vec3 u_highlightColor;

uniform float u_depthFalloff;
uniform float u_shallowTransmitAlpha;
uniform float u_deepTransmitAlpha;

uniform float u_shorelineFoamThickness;
uniform vec3 u_shorelineFoamColor;
uniform vec2 u_shorelineFoamVel;


uniform sampler2D t_noise;
uniform sampler2D t_foam;
uniform sampler2D t_waterMap;

uniform sampler2D t_sceneDepth;
uniform sampler2D t_sceneColor;

uniform vec2  u_fbRes;
uniform float u_camNear;
uniform float u_camFar;
uniform mat4  u_camProjMat;
uniform mat4  u_camProjMatInv;
uniform mat4  u_camWorldMat;

uniform float u_time;


vec4 getSceneViewPos(const in vec2 screenuv) {
    float depth = texture2D(t_sceneDepth, screenuv).x;
    float viewZ = perspectiveDepthToViewZ(depth, u_camNear, u_camFar);
    vec4 ndc = vec4(
        vec3(screenuv, depth) * 2. - 1.,
        1.
    );
    float clipW = u_camProjMat[2][3] * viewZ + u_camProjMat[3][3];
    ndc *= clipW; // reverse project

    return u_camProjMatInv * ndc;
}


void main() {
    vec2 screenuv = gl_FragCoord.xy / u_fbRes;

    float t = u_time * 0.2;
    vec2 uv = v_pos.xz/20.;

    vec3 sceneWorldPos = (u_camWorldMat * getSceneViewPos(screenuv)).xyz;
    float waterDepth = v_pos.y - sceneWorldPos.y;
    // float shallowness = 1.-clamp(waterDepth/u_depthFalloff, 0., 1.);
    float shallowness = clamp(exp(-waterDepth/u_depthFalloff), 0., 1.);


    vec2 pushnoise = texture(t_noise, uv*1.5).xy * 0.4;
    float highlightMask = texture(t_waterMap, (uv + mod(t/10., 1.)) * 3. + pushnoise).x;
    float shadowMask = texture(t_waterMap, (1.-uv + mod(t/8.*vec2(-0.5, -0.8), 1.)) * 3. + 1.1 + pushnoise).x;

    float shorelineFoamMask = step(texture2D(t_foam, uv*2. + u_shorelineFoamVel*t).x, pow(shallowness, 4.));

    vec3 waterColor = mix(u_deepWaterColor, u_surfaceWaterColor, shallowness);
    float transmitAlpha = mix(u_deepTransmitAlpha, u_shallowTransmitAlpha, shallowness);
    vec3 baseColor = waterColor;
    baseColor = mix(baseColor, u_shadowColor, shadowMask);
    baseColor = mix(baseColor, u_highlightColor, highlightMask);
    baseColor = mix(baseColor, texture2D(t_sceneColor, screenuv).xyz, transmitAlpha);
    baseColor = mix(baseColor, u_shorelineFoamColor, shorelineFoamMask);

    gl_FragColor = vec4(baseColor, 1.);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
}
`;

export class Sea /* implements SceneObj */ {
    static texld = new T.TextureLoader();

    constructor(width, height, subdivs) {
        const geom = new T.PlaneGeometry(width, height, subdivs, subdivs);
        geom.rotateX(-Math.PI / 2);

        const noise = Sea.texld.load('./textures/sea/noise.png');
        const waterMap = Sea.texld.load('./textures/sea/tiling_water.png');
        const foam = Sea.texld.load('./textures/sea/foam.png');
        waterMap.wrapS = waterMap.wrapT = T.RepeatWrapping;
        noise.wrapS = noise.wrapT = T.RepeatWrapping;
        foam.wrapS = foam.wrapT = T.RepeatWrapping;

        const mat = new T.ShaderMaterial({
            vertexShader: VERT,
            fragmentShader: FRAG,
            uniforms: {
                // -- knobs
                'u_shorelineFoamColor': { value: null },
                'u_surfaceWaterColor': { value: null },
                'u_deepWaterColor': { value: null },
                'u_shadowColor': { value: null },
                'u_highlightColor': { value: null },
                'u_depthFalloff': { value: null },
                'u_shorelineFoamVel': { value: null },
                'u_shallowTransmitAlpha': { value: null },
                'u_deepTransmitAlpha': { value: null },

                // --
                't_noise': { value: noise },
                't_waterMap': { value: waterMap },
                't_foam': { value: foam },

                // from earlier passes
                't_sceneDepth': { value: null },
                't_sceneColor': { value: null },

                // meta
                'u_fbRes': { value: null },
                'u_camFar': { value: 0. },
                'u_camNear': { value: 0. },
                'u_camProjMat': { value: new T.Matrix4() },
                'u_camProjMatInv': { value: new T.Matrix4() },
                'u_camWorldMat': { value: new T.Matrix4() },

                'u_time': { value: 0. },
            },
        });
        const obj = new T.Mesh(geom, mat);

        this.obj = obj;
        // SeaParams.addChangeListener(() => this.knobchange());
        // this.knobchange();

        this.params = {
            'shorelineFoamColor': new T.Color(.9, .9, 1.),
            'surfaceWaterColor': new T.Color(.0, .5, 0.8),
            'deepWaterColor': new T.Color(.0, .3, 0.4),
            'highlightColor': new T.Color(0.1, 0.8, 0.9),
            'shadowColor': new T.Color(.0, .3, 0.6),
            'depthFalloff': 0.6,
            'shorelineFoamVelX': 0.1,
            'shorelineFoamVelY': 0.1,
            'shallowTransmitAlpha': 0.2,
            'deepTransmitAlpha': 0.1,
        }
    }

    /**
     * @param {GUI} gui
     */
    registerGui(gui) {
        const folder = gui.addFolder('water');
        folder.addColor(this.params, 'shorelineFoamColor');
        folder.addColor(this.params, 'surfaceWaterColor');
        folder.addColor(this.params, 'deepWaterColor');
        folder.addColor(this.params, 'highlightColor');
        folder.addColor(this.params, 'shadowColor');
        // 'shorelineFoamColor': { type: 'color', desc: 'shoreline foam color', default: new T.Color(.9, .9, 1.) },
        //     'surfaceWaterColor': { type: 'color', desc: 'base color of shallow water', default: new T.Color(.0, .5, 0.8) },
        //     'deepWaterColor': { type: 'color', desc: 'base color of deep water', default: new T.Color(.0, .3, 0.4) },
        //     'highlightColor': { type: 'color', desc: 'surface highlights', default: new T.Color(0.1, 0.8, 0.9) },
        //     'shadowColor': { type: 'color', desc: 'surface shadows', default: new T.Color(.0, .3, 0.6) },
        folder.add(this.params, 'depthFalloff', 0.0, 2.0, 0.05);
        folder.add(this.params, 'shorelineFoamVelX', -1., 1., 0.1);
        folder.add(this.params, 'shorelineFoamVelY', -1., 1., 0.1);
        folder.add(this.params, 'shallowTransmitAlpha', 0., 1., 0.1);
        folder.add(this.params, 'deepTransmitAlpha', 0., 1., 0.1);
        //     'depthFalloff': { type: 'slider', desc: 'depth falloff (shoreline)', range: [0.0, 2.], default: 0.6, step: 0.05 },
        //     'shorelineFoamVelX': { type: 'slider', desc: 'shoreline foam velocity (x)', range: [-1., 1.], default: 0.1, step: 0.1 },
        //     'shorelineFoamVelY': { type: 'slider', desc: 'shoreline foam velocity (y)', range: [-1., 1.], default: 0.1, step: 0.1 },
        //     'shallowTransmitAlpha': { type: 'slider', desc: 'shallow water transmission alpha', range: [0., 1.], default: 0.2, step: 0.1 },
        //     'deepTransmitAlpha': { type: 'slider', desc: 'deep water transmission alpha', range: [0., 1.], default: 0.1, step: 0.1 },
        // }
        folder.onChange(() => this.knobchange());
        this.knobchange();
    }

    knobchange() {
        const u = this.obj.material.uniforms;
        const params = this.params;
        u['u_shorelineFoamColor'].value = params.shorelineFoamColor;
        u['u_surfaceWaterColor'].value = params.surfaceWaterColor;
        u['u_deepWaterColor'].value = params.deepWaterColor;
        u['u_highlightColor'].value = params.highlightColor;
        u['u_shadowColor'].value = params.shadowColor;
        u['u_depthFalloff'].value = params.depthFalloff;
        u['u_shorelineFoamVel'].value = new T.Vector2(params.shorelineFoamVelX, params.shorelineFoamVelY);
        u['u_shallowTransmitAlpha'].value = params.shallowTransmitAlpha;
        u['u_deepTransmitAlpha'].value = params.deepTransmitAlpha;
    }

    /**
     * @param {T.WebGLRenderer} renderer
     * @param {T.PerspectiveCamera} camera
     */
    updateCamera(renderer, camera) {
        const u = this.obj.material.uniforms;
        u['u_fbRes'].value = renderer.getDrawingBufferSize(new T.Vector2());
        u['u_camNear'].value = camera.near;
        u['u_camFar'].value = camera.far;
        u['u_camProjMat'].value = camera.projectionMatrix;
        u['u_camProjMatInv'].value = camera.projectionMatrixInverse;
        u['u_camWorldMat'].value = camera.matrixWorld
    }

    /**
     * @param {T.WebGLRenderTarget} target
     */
    updateScenePassInputs(target) {
        this.obj.material.uniforms['t_sceneDepth'].value = target.depthTexture;
        this.obj.material.uniforms['t_sceneColor'].value = target.texture;
    }

    tick(dt) {
        this.obj.material.uniforms['u_time'].value += dt / 1000;
    }
}