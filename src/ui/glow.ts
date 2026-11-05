// 光のにじみ：輪郭のまわりに、ごく弱い光。黒から指輪が浮いて見える。
// 画面にはふつうに描いたまま、小さな HDR の絵を別に描き、明るい所だけをぼかして、上から足す。
import * as THREE from "three";

const LOOK = {
  /** 小さな絵の大きさ（画面の 1/4） */
  scale: 0.25,
  /** ぼかしの段の数（多いほど広がる） */
  levels: 5,
  /** これより明るい所だけ、にじむ */
  threshold: 0.8,
  /** 明るさの頭打ち（強い光だけが広がりすぎないように） */
  max: 2.5,
  /** にじみの濃さ（画面の明るさに足す） */
  strength: 0.1,
};

const VERT = "varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }";
const BRIGHT = `uniform sampler2D t; uniform float uT; uniform float uMax; varying vec2 vUv;
  void main() {
    vec3 c = texture2D(t, vUv).rgb;
    float m = max(c.r, max(c.g, c.b));
    c *= max(m - uT, 0.0) / max(m, 1e-4);
    m = max(c.r, max(c.g, c.b));
    if (m > uMax) c *= uMax / m;
    gl_FragColor = vec4(c, 1.0);
  }`;
const DOWN = `uniform sampler2D t; uniform vec2 px; varying vec2 vUv;
  void main() {
    vec3 c = texture2D(t, vUv).rgb * 0.25;
    c += texture2D(t, vUv + px * vec2(-1.0, -1.0)).rgb * 0.1875;
    c += texture2D(t, vUv + px * vec2(1.0, -1.0)).rgb * 0.1875;
    c += texture2D(t, vUv + px * vec2(-1.0, 1.0)).rgb * 0.1875;
    c += texture2D(t, vUv + px * vec2(1.0, 1.0)).rgb * 0.1875;
    gl_FragColor = vec4(c, 1.0);
  }`;
const UP = `uniform sampler2D t; uniform vec2 px; varying vec2 vUv;
  void main() {
    vec3 c = vec3(0.0);
    float w = 0.0;
    for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
      float k = (2.0 - abs(float(i))) * (2.0 - abs(float(j)));
      c += texture2D(t, vUv + px * vec2(float(i), float(j))).rgb * k;
      w += k;
    }
    gl_FragColor = vec4(c / w, 1.0);
  }`;
// 足すときに細かいざらつきを混ぜる（暗い所の明るさの段が、動画で縞にならないように）
const ADD = `uniform sampler2D t; uniform float k; varying vec2 vUv;
  float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec3 c = texture2D(t, vUv).rgb * k;
    float n = (h(gl_FragCoord.xy) - 0.5) / 255.0;
    gl_FragColor = vec4(max(c + n * step(0.002, max(c.r, max(c.g, c.b))), 0.0), 1.0);
  }`;

export class Glow {
  private base: THREE.WebGLRenderTarget | null = null;
  private levels: THREE.WebGLRenderTarget[] = [];
  private w = 0;
  private h = 0;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quadScene = new THREE.Scene();
  private quad: THREE.Mesh;
  private bright = this.pass(BRIGHT, { t: { value: null }, uT: { value: LOOK.threshold }, uMax: { value: LOOK.max } });
  private down = this.pass(DOWN, { t: { value: null }, px: { value: new THREE.Vector2() } });
  private up = this.pass(UP, { t: { value: null }, px: { value: new THREE.Vector2() } }, { blending: THREE.AdditiveBlending, transparent: true });
  private add = this.pass(ADD, { t: { value: null }, k: { value: LOOK.strength } }, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, transparent: true });

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(g, this.bright);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  private pass(fragmentShader: string, uniforms: Record<string, THREE.IUniform>, extra: Partial<THREE.ShaderMaterialParameters> = {}) {
    return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false, ...extra });
  }

  private ensure(w: number, h: number) {
    if (this.base && this.w === w && this.h === h) return;
    this.base?.dispose();
    this.levels.forEach((l) => l.dispose());
    this.w = w;
    this.h = h;
    this.base = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
    this.levels = [];
    let a = w;
    let b = h;
    for (let i = 0; i < LOOK.levels; i++) {
      a = Math.max(2, a >> 1);
      b = Math.max(2, b >> 1);
      this.levels.push(new THREE.WebGLRenderTarget(a, b, { type: THREE.HalfFloatType, depthBuffer: false }));
    }
  }

  private run(renderer: THREE.WebGLRenderer, mat: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    renderer.setRenderTarget(to);
    renderer.render(this.quadScene, this.cam);
  }

  /** 今の画面の上に、光のにじみを足す（画面はふつうに描いてから呼ぶ） */
  draw(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.ensure(Math.max(4, Math.round(size.x * LOOK.scale)), Math.max(4, Math.round(size.y * LOOK.scale)));
    const keep = { target: renderer.getRenderTarget(), auto: renderer.autoClear, alpha: renderer.getClearAlpha(), color: renderer.getClearColor(new THREE.Color()) };
    renderer.setClearColor(0x000000, 1);
    renderer.autoClear = true;
    renderer.setRenderTarget(this.base);
    renderer.render(scene, camera);
    renderer.autoClear = false;
    this.bright.uniforms.t.value = this.base!.texture;
    renderer.setRenderTarget(this.levels[0]);
    renderer.clear();
    this.run(renderer, this.bright, this.levels[0]);
    for (let i = 1; i < this.levels.length; i++) {
      this.down.uniforms.t.value = this.levels[i - 1].texture;
      this.down.uniforms.px.value.set(1 / this.levels[i - 1].width, 1 / this.levels[i - 1].height);
      renderer.setRenderTarget(this.levels[i]);
      renderer.clear();
      this.run(renderer, this.down, this.levels[i]);
    }
    for (let i = this.levels.length - 1; i > 0; i--) {
      this.up.uniforms.t.value = this.levels[i].texture;
      this.up.uniforms.px.value.set(1 / this.levels[i].width, 1 / this.levels[i].height);
      this.run(renderer, this.up, this.levels[i - 1]);
    }
    this.add.uniforms.t.value = this.levels[0].texture;
    this.run(renderer, this.add, keep.target);
    renderer.autoClear = keep.auto;
    renderer.setClearColor(keep.color, keep.alpha);
  }
}
