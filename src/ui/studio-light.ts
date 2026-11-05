// 見せるための撮影台の光：暗い部屋に、強い光をいくつか。外の HDRI は使わず、すべて計算で作る。
// 磨いた金属には光の線と面が映り、石の面には白と黒の差が出る。
// 光の向きは「カメラのまわり」で決める（az：カメラの方向が 0、カメラから見て右が ＋、el：高さ。度）。
// 指輪を回すと、光は止まったまま指輪だけが回るように見える（Viewer が環境をカメラの向きに合わせて回す）。
import * as THREE from "three";

export interface LightPanel {
  kind: "panel";
  az: number;
  el: number;
  /** 幅と高さ（度。接する平面の上の半分の大きさ） */
  w: number;
  h: number;
  /** 縁のぼかし（度） */
  soft: number;
  power: number;
  /** 面の中の明るさの傾き（上が明るいと ＋） */
  grad?: number;
}
export interface LightLine {
  kind: "line";
  /** 高さ el の輪（真上の軸のまわり）の上の細い光。太さ w（度）、縁のぼかし soft（度） */
  el: number;
  w: number;
  soft: number;
  power: number;
  /** 輪の上で光る範囲（真ん中の方位・半分の幅・端のぼかし。度）。なければ 1 周 */
  arc?: [number, number, number];
}
export type Light = LightPanel | LightLine;
export interface StudioSpec {
  /** 地の明るさ：下・地平・上 */
  base: [number, number, number];
  lights: Light[];
  /** 小さな強い光（石のきらめき）：数・明るさ・大きさ（度）・乱数の種 */
  sparks?: { n: number; power: number; size: number; seed: number; minEl?: number; maxEl?: number };
}

/** 金属に映す光：上の大きな面、左右の弱い面、細い線と帯 */
export const METAL_STUDIO: StudioSpec = {
  base: [0.008, 0.035, 0.16],
  lights: [
    { kind: "panel", az: -30, el: 72, w: 26, h: 16, soft: 5, power: 3.2, grad: -0.5 },
    { kind: "panel", az: 60, el: 62, w: 9, h: 20, soft: 3, power: 1.6, grad: 0.4 },
    { kind: "panel", az: 95, el: 30, w: 12, h: 26, soft: 5, power: 1.0 },
    { kind: "panel", az: -115, el: 30, w: 11, h: 26, soft: 5, power: 1.2 },
    { kind: "line", el: 34, w: 1.6, soft: 0.8, power: 7 },
    { kind: "line", el: 12, w: 1.0, soft: 0.5, power: 6, arc: [-90, 110, 15] },
    { kind: "line", el: -10, w: 1.0, soft: 0.5, power: 4 },
    { kind: "panel", az: 80, el: 20, w: 3, h: 34, soft: 1, power: 8 },
    { kind: "panel", az: -110, el: 24, w: 3, h: 30, soft: 1, power: 8 },
    { kind: "panel", az: 175, el: 40, w: 40, h: 3, soft: 1, power: 7 },
    // 下から：腕の外側の下の面が黒くつぶれないように、弱い面と細い帯
    { kind: "panel", az: -60, el: -38, w: 34, h: 18, soft: 9, power: 0.55 },
    { kind: "panel", az: 70, el: -32, w: 30, h: 16, soft: 9, power: 0.45 },
    { kind: "panel", az: -85, el: -18, w: 3, h: 16, soft: 1, power: 5 },
    { kind: "panel", az: 120, el: -22, w: 3, h: 14, soft: 1, power: 4 },
  ],
  sparks: { n: 14, power: 12, size: 1, seed: 5 },
};

/** 石に映す光：大きな面はなく、強い光がいくつかと、たくさんの小さな光（面ごとの白と黒の差、きらめき） */
export const GEM_STUDIO: StudioSpec = {
  base: [0, 0.006, 0.05],
  lights: [
    { kind: "panel", az: -40, el: 62, w: 14, h: 10, soft: 2, power: 4.5 },
    { kind: "panel", az: 60, el: 55, w: 8, h: 12, soft: 2, power: 5 },
    { kind: "panel", az: 170, el: 50, w: 12, h: 5, soft: 2, power: 5 },
    { kind: "panel", az: -130, el: 35, w: 5, h: 14, soft: 1, power: 6 },
    { kind: "panel", az: 110, el: 25, w: 4, h: 14, soft: 1, power: 6 },
    { kind: "panel", az: 0, el: 30, w: 16, h: 3, soft: 1, power: 3.5 },
  ],
  sparks: { n: 40, power: 16, size: 1.8, seed: 3 },
};

const RAD = Math.PI / 180;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** 向き（カメラが x 軸の ＋ にあるときの世界の向き。z が上） */
export function lightDir(az: number, el: number, camAz = 0): [number, number, number] {
  const a = (az + camAz) * RAD;
  const e = el * RAD;
  return [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)];
}

/** 決まった乱数で小さな光を面の光に広げる（同じ種なら、いつも同じ場所） */
export function expandLights(spec: StudioSpec): Light[] {
  const out = [...spec.lights];
  const sp = spec.sparks;
  if (!sp) return out;
  let s = sp.seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const lo = sp.minEl ?? 15;
  const hi = sp.maxEl ?? 85;
  for (let i = 0; i < sp.n; i++) {
    const az = rnd() * 360 - 180;
    const el = lo + rnd() * (hi - lo);
    const power = sp.power * (0.5 + rnd());
    const size = sp.size * (0.6 + 0.8 * rnd());
    out.push({ kind: "panel", az, el, w: size, h: size, soft: size * 0.5, power });
  }
  return out;
}

interface PanelFrame {
  a: [number, number, number];
  r: [number, number, number];
  u: [number, number, number];
}
function panelFrame(p: LightPanel, camAz: number): PanelFrame {
  const a = lightDir(p.az, p.el, camAz);
  const up: [number, number, number] = Math.abs(a[2]) > 0.95 ? [0, 1, 0] : [0, 0, 1];
  const rx = up[1] * a[2] - up[2] * a[1];
  const ry = up[2] * a[0] - up[0] * a[2];
  const rz = up[0] * a[1] - up[1] * a[0];
  const l = Math.hypot(rx, ry, rz) || 1;
  const r: [number, number, number] = [rx / l, ry / l, rz / l];
  const u: [number, number, number] = [a[1] * r[2] - a[2] * r[1], a[2] * r[0] - a[0] * r[2], a[0] * r[1] - a[1] * r[0]];
  return { a, r, u };
}

const DOME_VERT = "varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
const BASE_FRAG = `varying vec3 vDir; uniform vec3 uBase;
  void main() {
    float h = normalize(vDir).z;
    float c = h < 0.0 ? mix(uBase.y, uBase.x, smoothstep(0.0, 0.5, -h)) : mix(uBase.y, uBase.z, smoothstep(0.0, 0.85, h));
    gl_FragColor = vec4(vec3(c), 1.0);
  }`;
const PANEL_FRAG = `varying vec3 vDir; uniform vec3 uA; uniform vec3 uR; uniform vec3 uU; uniform vec4 uP; uniform float uGrad;
  void main() {
    vec3 d = normalize(vDir);
    float ca = dot(d, uA);
    if (ca <= 0.02) discard;
    float x = dot(d, uR) / ca;
    float y = dot(d, uU) / ca;
    float m = (1.0 - smoothstep(uP.x - uP.z, uP.x + uP.z, abs(x))) * (1.0 - smoothstep(uP.y - uP.z, uP.y + uP.z, abs(y)));
    gl_FragColor = vec4(vec3(uP.w * m * (1.0 + uGrad * y / uP.y)), 1.0);
  }`;
const LINE_FRAG = `varying vec3 vDir; uniform vec4 uL; uniform vec3 uArc; uniform vec2 uArcCos;
  void main() {
    vec3 d = normalize(vDir);
    float m = 1.0 - smoothstep(uL.y - uL.z, uL.y + uL.z, abs(d.z - uL.x));
    if (uArcCos.x > -1.5) m *= smoothstep(uArcCos.x - uArcCos.y, uArcCos.x + uArcCos.y, dot(d, uArc));
    gl_FragColor = vec4(vec3(uL.w * m), 1.0);
  }`;

/** 光の球を重ねた場面（これを環境に写す） */
export function studioLightScene(spec: StudioSpec): THREE.Scene {
  const s = new THREE.Scene();
  const sphere = new THREE.SphereGeometry(50, 96, 48);
  const dome = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>, add: boolean) =>
    new THREE.Mesh(
      sphere,
      new THREE.ShaderMaterial({ side: THREE.BackSide, depthTest: false, depthWrite: false, toneMapped: false, transparent: add, blending: add ? THREE.AdditiveBlending : THREE.NoBlending, vertexShader: DOME_VERT, fragmentShader, uniforms }),
    );
  const base = dome(BASE_FRAG, { uBase: { value: new THREE.Vector3(...spec.base) } }, false);
  base.renderOrder = -1;
  s.add(base);
  for (const L of expandLights(spec)) {
    if (L.kind === "panel") {
      const f = panelFrame(L, 0);
      s.add(
        dome(
          PANEL_FRAG,
          {
            uA: { value: new THREE.Vector3(...f.a) },
            uR: { value: new THREE.Vector3(...f.r) },
            uU: { value: new THREE.Vector3(...f.u) },
            uP: { value: new THREE.Vector4(Math.tan(L.w * RAD), Math.tan(L.h * RAD), Math.tan(L.soft * RAD), L.power) },
            uGrad: { value: L.grad ?? 0 },
          },
          true,
        ),
      );
    } else {
      const arc = L.arc;
      s.add(
        dome(
          LINE_FRAG,
          {
            uL: { value: new THREE.Vector4(Math.sin(L.el * RAD), Math.sin(L.w * RAD), Math.sin(L.soft * RAD), L.power) },
            uArc: { value: new THREE.Vector3(...(arc ? lightDir(arc[0], L.el) : [1, 0, 0])) },
            uArcCos: { value: new THREE.Vector2(arc ? Math.cos(arc[1] * RAD) : -2, arc ? arc[2] * RAD : 0) },
          },
          true,
        ),
      );
    }
  }
  return s;
}

/** 同じ光の、向き d の明るさ（JS の計算。パストレーシングに渡す正距円筒の絵を作るため）。camAz：カメラの方位（度） */
export function radiance(spec: StudioSpec, lights: Light[], d: readonly [number, number, number], camAz: number): number {
  const h = d[2];
  const [low, mid, high] = spec.base;
  let c = h < 0 ? mid + (low - mid) * smooth(0, 0.5, -h) : mid + (high - mid) * smooth(0, 0.85, h);
  for (const L of lights) {
    if (L.kind === "panel") {
      const f = panelFrame(L, camAz);
      const ca = d[0] * f.a[0] + d[1] * f.a[1] + d[2] * f.a[2];
      if (ca <= 0.02) continue;
      const x = (d[0] * f.r[0] + d[1] * f.r[1] + d[2] * f.r[2]) / ca;
      const y = (d[0] * f.u[0] + d[1] * f.u[1] + d[2] * f.u[2]) / ca;
      const tw = Math.tan(L.w * RAD);
      const th = Math.tan(L.h * RAD);
      const s = Math.tan(L.soft * RAD);
      const m = (1 - smooth(tw - s, tw + s, Math.abs(x))) * (1 - smooth(th - s, th + s, Math.abs(y)));
      c += L.power * m * (1 + ((L.grad ?? 0) * y) / th);
    } else {
      const w = Math.sin(L.w * RAD);
      const s = Math.sin(L.soft * RAD);
      let m = 1 - smooth(w - s, w + s, Math.abs(d[2] - Math.sin(L.el * RAD)));
      if (m > 0 && L.arc) {
        const q = lightDir(L.arc[0], L.el, camAz);
        const k = d[0] * q[0] + d[1] * q[1] + d[2] * q[2];
        const cc = Math.cos(L.arc[1] * RAD);
        const ss = L.arc[2] * RAD;
        m *= smooth(cc - ss, cc + ss, k);
      }
      c += L.power * m;
    }
  }
  return c;
}
