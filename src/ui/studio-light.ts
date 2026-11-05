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

/** 見え方の値（1 か所にまとめる）。作者の声（2026-11-05）：ギラギラして目がチカチカする。静かで品のある絵に */
export interface RenderLook {
  metal: StudioSpec;
  gem: StudioSpec;
  /** 金属の粗さ。大きいほど映り込みの線が太く、やわらかい */
  roughness: number;
  /** 石の中で反射を追う回数。少ないほど破片が減り、面の形が大きく読める */
  gemBounces: number;
  /** 赤・緑・青の屈折率の差（緑からのずれ）。小さいほど虹色が弱い */
  gemSpread: [number, number];
  /** 石が環境を読むときのぼかし（粗さ）：表の反射・1 回目に中から出る光・2 回目より後 */
  gemBlur: [number, number, number];
  /** 近い向きの面を 1 つにまとめる角度（度） */
  gemMergeDeg: number;
  /** 光のにじみの濃さ */
  glow: number;
}

const panel = (az: number, el: number, w: number, h: number, soft: number, power: number, grad = 0): LightPanel => ({ kind: "panel", az, el, w, h, soft, power, grad });

/** 比べるための 3 段階 */
export const LOOKS: Record<"calm" | "mid" | "near", RenderLook> = {
  // 控えめ：線はなく、大きなやわらかい面だけ。石は面ごとのやわらかな濃淡
  calm: {
    metal: {
      base: [0.05, 0.11, 0.34],
      lights: [panel(-30, 68, 44, 30, 18, 1.5, -0.25), panel(95, 25, 24, 34, 16, 0.75), panel(-110, 28, 20, 34, 16, 0.85), panel(175, 35, 50, 12, 9, 1.2), panel(-60, -35, 44, 22, 16, 0.3), panel(70, -30, 40, 20, 16, 0.25)],
    },
    gem: {
      base: [0.04, 0.09, 0.3],
      lights: [panel(-35, 64, 30, 20, 10, 1.15), panel(70, 45, 18, 22, 8, 0.95), panel(175, 45, 26, 14, 8, 0.9), panel(-125, 30, 14, 22, 7, 0.85), panel(0, 22, 26, 7, 5, 0.6)],
    },
    roughness: 0.16,
    gemBounces: 2,
    gemSpread: [0.003, 0.004],
    gemBlur: [0.22, 0.28, 0.5],
    gemMergeDeg: 12,
    glow: 0.05,
  },
  // 中：大きな面に、太い帯を 2 本だけ。石は面の明暗をはっきり、白は抑える。作者の声で、今に近い方へほんの少し寄せた（2026-11-05）
  mid: {
    metal: {
      base: [0.04, 0.1, 0.3],
      lights: [panel(-30, 70, 36, 24, 11, 2.3, -0.32), panel(95, 28, 19, 31, 11, 1.0), panel(-112, 28, 15, 31, 11, 1.15), panel(78, 20, 5.5, 36, 3, 2.7), panel(175, 38, 44, 6, 4.5, 2.2), panel(-60, -36, 42, 20, 14, 0.3), panel(70, -30, 36, 18, 14, 0.25)],
    },
    gem: {
      base: [0.006, 0.026, 0.13],
      lights: [panel(-38, 62, 20, 14, 5.5, 2.45), panel(62, 50, 12, 17, 4.5, 2.2), panel(172, 48, 18, 8, 3.7, 2.1), panel(-128, 32, 8, 17, 3.7, 2.15), panel(108, 25, 7, 16, 3, 1.9), panel(0, 26, 21, 4.5, 3, 1.35)],
      sparks: { n: 6, power: 3, size: 2, seed: 3 },
    },
    roughness: 0.095,
    gemBounces: 3,
    gemSpread: [0.006, 0.008],
    gemBlur: [0.12, 0.16, 0.33],
    gemMergeDeg: 9,
    glow: 0.075,
  },
  // 今に近い：線と小さな光を残す（前の版よりは弱い）
  near: {
    metal: {
      base: [0.012, 0.045, 0.2],
      lights: [panel(-30, 72, 28, 18, 6, 2.6, -0.4), panel(60, 62, 10, 20, 3, 1.3, 0.3), panel(95, 30, 12, 26, 5, 0.9), panel(-115, 30, 11, 26, 5, 1.0), { kind: "line", el: 34, w: 1.6, soft: 0.9, power: 3.5 }, { kind: "line", el: -10, w: 1.0, soft: 0.6, power: 2.2 }, panel(80, 20, 3, 34, 1.2, 4.5), panel(-110, 24, 3, 30, 1.2, 4.5), panel(175, 40, 40, 3, 1.2, 4), panel(-60, -38, 34, 18, 9, 0.45), panel(70, -32, 30, 16, 9, 0.35)],
    },
    gem: {
      base: [0, 0.015, 0.09],
      lights: [panel(-40, 62, 14, 10, 3, 2.8), panel(60, 55, 8, 12, 3, 2.8), panel(170, 50, 12, 5, 3, 2.8), panel(-130, 35, 5, 14, 2, 3), panel(110, 25, 4, 14, 2, 3), panel(0, 30, 16, 3, 2, 1.8)],
      sparks: { n: 16, power: 6, size: 2, seed: 3 },
    },
    roughness: 0.06,
    gemBounces: 4,
    gemSpread: [0.008, 0.011],
    gemBlur: [0.08, 0.1, 0.3],
    gemMergeDeg: 8,
    glow: 0.09,
  },
};
/** いま使う見え方は「中」。ほかの段は ?look=calm・?look=near で比べられる（作者に見てもらうため） */
export const LOOK: RenderLook = LOOKS[(typeof location !== "undefined" && (new URLSearchParams(location.search).get("look") as "calm" | "mid" | "near")) || "mid"];
export const METAL_STUDIO: StudioSpec = LOOK.metal;
export const GEM_STUDIO: StudioSpec = LOOK.gem;

/** 地金の色（鏡面の光。リニアの赤・緑・青）。見た目のための仮の値で、職人の目安ではない。形と重さの地金とは別 */
export type MetalShade = "k18y" | "k18yg" | "k18wg" | "k18pg" | "pt900" | "sv925";
export const METAL_COLOR: Record<MetalShade, [number, number, number]> = {
  // K18 イエロー：やわらかな金色（シャンパン色では鈍いと作者。2026-11-05）
  k18y: [0.97, 0.75, 0.42],
  k18yg: [0.97, 0.75, 0.42],
  // K18 ホワイト：シルバー寄り。わずかに温かい
  k18wg: [0.88, 0.86, 0.82],
  // K18 ピンク：はっきり赤みがある
  k18pg: [0.95, 0.66, 0.54],
  // Pt900：少し暗く、色のない灰色
  pt900: [0.8, 0.8, 0.8],
  // SV925：いちばん白く明るい
  sv925: [0.92, 0.91, 0.88],
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
