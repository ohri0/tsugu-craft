// 腕の面の仕上げを、材質で見せる：槌目（金づちの跡）と、布目象嵌（色のちがう地金の帯の模様）。
// 形（STL・図面）は変えない。光の向き（面の向き）と色だけを、腕の座標から決める。
// 座標：指のまわりの角度 φ（腕の外の半径で mm にする）と、断面に沿って測った長さ s（頂点の aFinS。src/geometry/finish.ts の sectionArc）。
//   s を使うので、甲丸のように縁で面が立つ腕でも、跡が縁でつぶれたり伸びたりしない（2026-11-07 作者の声）。
// 槌目（2026-11-07 作り直し。作者の声「もうちょっと本気で槌目っぽく。ちょっと雑」）：
// - 一打ちごとの跡（くぼみ）を、少しずつずらした六角の並び（ちょっと不ぞろいで、むらなく打った面）に置く。
// - 面は、重なった跡のうち いちばん深い所（本物も、あとの一打ちが前の跡を削る）。跡と跡の境が、細い稜線として光る。
//   稜線は画面の 1 点より少しだけ丸め、近くで見ても くっきり、遠くでも ちらつかない。
// - 跡の深さは目安の深さ（GUIDES.finish、仮）から。跡の縁の傾き ＝ 4 × 深さ ÷ 跡の大きさ（中で約 18°）。打つごとに深さ・大きさ・向きを少し変える。
// - 種類：丸槌目（丸いくぼみ、少しだけ細長い）・角槌目（平らな小さな面、少し傾く）・縦槌目（腕に沿って細長い）・荒らし槌目（細かく密、つやを抑える）。
// - 跡が画面の数点より小さくなると、跡を消して、そのぶん面を少しだけ曇らせる（遠くで模様がちらつかない。荒らしはもともと曇らせる）。
// 決まった場所の模様なので、回しても平らな図でもちらつかない。
// 座標は腕の形のまま（src/geometry/shank.ts）：x が指の軸、いちばん上が +z。物体の回転は z ＝ 床へ上げた分だけ。
import * as THREE from "three";
import type { TsuchimeStyle } from "../geometry/finish";

export interface FinishLook {
  /** 槌目の種類（なければ打たない） */
  style?: TsuchimeStyle;
  /** 槌目の跡の大きさ（幅、mm）。0 なら打たない */
  markMm: number;
  /** 跡の長さ（mm。縦槌目は幅より長い。ほかは幅と同じ） */
  lengthMm: number;
  /** 跡の深さ（mm。仮の目安） */
  depthMm: number;
  /** 槌目の場所：0＝外の面だけ、1＝外の面と横の面 */
  area: 0 | 1;
  /** 腕の外の半径（mm。跡を一周にきっちり並べるため） */
  outerRadiusMm: number;
  /** 布目象嵌の帯（なければ入れない）：帯の半分の幅・線の太さ（mm）と、はめこむ地金の色（リニア） */
  inlay?: { halfMm: number; lineMm: number; color: [number, number, number] };
}

const STYLE_ID: Record<TsuchimeStyle, number> = { maru: 0, kaku: 1, tate: 2, arashi: 3 };

/** 跡の並びの間かく（跡の大きさに対する割合）：となりの跡と少し重なる（一打ちずつ、半分ほど重ねて打つ） */
const SPACING = 0.82;

const VERT_PARS = /* glsl */ `
attribute float aFinS;
varying vec3 vFObj; varying vec3 vFObjN; varying vec3 vFTu; varying float vFinS;
`;
const VERT_MAIN = /* glsl */ `
vFObj = position; vFObjN = objectNormal; vFinS = aFinS;
{
  float rr = max(length(position.yz), 1e-4);
  vFTu = normalize(normalMatrix * (vec3(0.0, position.z, -position.y) / rr));
}
`;

const FRAG_PARS = /* glsl */ `
varying vec3 vFObj; varying vec3 vFObjN; varying vec3 vFTu; varying float vFinS;
uniform float uStyle; uniform float uMark; uniform float uLen; uniform float uDepth; uniform float uArea; uniform float uR0;
uniform float uCells; uniform float uCellU; uniform float uCellS;
uniform float uInlay; uniform float uInlayHalf; uniform float uInlayLine; uniform vec3 uInlayColor;
float fInlay = 0.0;
float fMatte = 0.0;
vec4 fHash4(vec2 p) {
  vec4 q = vec4(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)), dot(p, vec2(419.2, 371.9)), dot(p, vec2(113.5, 271.9)));
  return fract(sin(q) * 43758.5453);
}
// 一打ちの跡の高さ（mm、面より下が負）と、その傾き（u・s の向きの mm あたり）。q は (u, s) mm、c は跡の番号（u は一周で巻く）
// 戻り：x＝高さ、yz＝傾き
vec3 fStrike(vec2 q, vec2 c) {
  float row = c.y;
  vec2 key = vec2(mod(c.x, uCells), row);
  vec4 h = fHash4(key);
  vec4 h2 = fHash4(key + 31.7);
  // 六角の並び（行ごとに半分ずらす）＋ 少しの乱れ
  vec2 ctr = vec2((c.x + 0.5 + 0.5 * mod(row, 2.0) + 0.8 * (h.x - 0.5)) * uCellU, (row + 0.5 + 0.7 * (h.y - 0.5)) * uCellS);
  vec2 d = q - ctr;
  float depth = uDepth * (0.7 + 0.6 * h.z);
  // 跡の向きと半径（mm）。打つごとに大きさを変える
  float ang = 6.28318530718 * h.w;
  float ra = 0.5 * uLen * (0.78 + 0.44 * h2.x);
  float rb = 0.5 * uMark * (0.78 + 0.44 * fract(h2.x * 7.31 + h.z));
  // 丸・荒らし：芯金の上の丸い腕を叩くと、跡は腕の幅の向きに少し長くなる（向きは ±20° ほどばらつく）。角：向きはばらばら。縦：腕に沿う
  if (uStyle < 0.5 || uStyle > 2.5) { ang = 1.5708 + 0.7 * (h.w - 0.5); ra *= 1.1 + 0.2 * h2.y; rb *= 0.9; }
  else if (uStyle < 1.5) { ra *= 1.0 + 0.18 * h2.y; rb *= 1.0 - 0.08 * h2.y; }
  else { ang = 0.18 * (h.w - 0.5); }
  vec2 ax = vec2(cos(ang), sin(ang));
  vec2 ay = vec2(-ax.y, ax.x);
  vec2 e = vec2(dot(d, ax) / ra, dot(d, ay) / rb);
  float rho2 = dot(e, e);
  vec2 grad = 2.0 * depth * (e.x / ra * ax + e.y / rb * ay);
  float hgt = depth * (rho2 - 1.0);
  if (uStyle > 0.5 && uStyle < 1.5) {
    // 角槌目：平らな鎚の面が少し傾いて当たる。面はほとんど平らで、決まった向きに傾く。
    // どの面に入るかは、いちばん近い一打ち（平らな面どうしは、まっすぐな稜線で接する）。x は高さでなく、一打ちの中心からの距離（mm）
    float ta = 6.28318530718 * h2.z;
    vec2 tilt = (0.09 + 0.10 * h2.w) * vec2(cos(ta), sin(ta));
    hgt = sqrt(rho2) * 0.5 * uMark;
    grad = 0.25 * grad + tilt;
  }
  return vec3(hgt, grad);
}
// いちばん深い跡と、2 番目に深い跡をくらべ、境の稜線を画面の 1 点ほどだけ丸めた傾き
vec2 fHammer(vec2 q, float pxMm) {
  vec2 g = vec2(q.x / uCellU, q.y / uCellS);
  vec2 i0 = floor(g);
  float h1 = 1e9; float h2 = 1e9; vec2 g1 = vec2(0.0); vec2 g2 = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -2; i <= 1; i++) {
    vec2 c = i0 + vec2(float(i), float(j));
    vec3 s = fStrike(q, c);
    if (s.x < h1) { h2 = h1; g2 = g1; h1 = s.x; g1 = s.yz; }
    else if (s.x < h2) { h2 = s.x; g2 = s.yz; }
  }
  // 稜線の丸み：高さの差が、画面 1 点ぶん（と 0.006 mm）の傾きの差より小さい所は、2 つの跡の傾きを混ぜる
  float k = (uStyle > 0.5 && uStyle < 1.5 ? 1.0 : length(g1 - g2)) * max(pxMm * 1.2, 0.006) + 1e-6;
  float wB = 0.5 * (1.0 - smoothstep(0.0, 1.0, (h2 - h1) / k));
  return mix(g1, g2, wB);
}
// 外の面の真ん中の帯：両縁の線と、その間の菱つなぎの線（はめこんだ地金）。1 ならはめこんだ地金
float fInlayMask(float pxMm) {
  if (uInlay < 0.5) return 0.0;
  float rr = max(length(vFObj.yz), 1e-4);
  vec3 radial = vec3(0.0, vFObj.y, vFObj.z) / rr;
  float outerW = smoothstep(0.3, 0.7, dot(normalize(vFObjN), radial));
  float phi = atan(vFObj.y, vFObj.z);
  float x = vFinS;
  float u = phi * uR0;
  float hw = uInlayHalf;
  float lw = uInlayLine * 0.5;
  float aa = pxMm * 0.75 + 1e-4;
  float border = 1.0 - smoothstep(lw - aa, lw + aa, abs(abs(x) - (hw - lw)));
  float period = 6.28318530718 * uR0 / max(1.0, floor(6.28318530718 * uR0 / (hw * 2.6)));
  float t = abs(fract(u / period) - 0.5) * 2.0;
  float zig = (hw - 2.0 * lw) * (2.0 * t - 1.0);
  float dz = abs(abs(x) - abs(zig)) / sqrt(1.0 + pow(4.0 * (hw - 2.0 * lw) / period, 2.0));
  float diamond = 1.0 - smoothstep(lw * 0.8 - aa, lw * 0.8 + aa, dz);
  float inside = 1.0 - smoothstep(hw - aa, hw + aa, abs(x));
  return clamp(max(border, diamond), 0.0, 1.0) * inside * outerW;
}
`;

const FRAG_NORMAL = /* glsl */ `
{
  float rr = max(length(vFObj.yz), 1e-4);
  vec3 radial = vec3(0.0, vFObj.y, vFObj.z) / rr;
  vec3 on = normalize(vFObjN);
  float dr = dot(on, radial);
  // 外の面：少しでも外を向く面（甲丸の丸みの裾まで）。外側と横：指に当たる内側のほかは全部
  float outerW = smoothstep(0.08, 0.3, dr);
  float allW = smoothstep(-0.5, -0.25, dr);
  // 画面の 1 点が何 mm か（角度の継ぎ目でとばない、3D の位置から）
  float pxMm = length(fwidth(vFObj));
  if (uMark > 0.0) {
    float w = uArea > 0.5 ? allW : outerW;
    float phi = atan(vFObj.y, vFObj.z);
    vec2 q = vec2(phi * uR0, vFinS);
    // 跡が画面の 4〜12 点より小さくなると、だんだん消す（消えたぶん、面を少し曇らせる）
    float fade = 1.0 - smoothstep(uMark * 0.08, uMark * 0.25, pxMm);
    fMatte = w * ((1.0 - fade) * 0.12 + (uStyle > 2.5 ? 0.16 : 0.0));
    if (w * fade > 0.001) {
      vec2 gr = fHammer(q, pxMm);
      // 角度の向きの mm は、外の半径で測った長さ。いまの半径の長さに直す
      gr.x *= uR0 / rr;
      vec3 ts = normalize(cross(vFTu, normal));
      normal = normalize(normal - w * fade * (gr.x * vFTu + gr.y * ts));
    }
  }
}
`;

/** 材質に、腕の面の仕上げを足す（同じ材質を何度渡しても、1 回だけ足す）。形には aFinS（sectionArc）が要る */
export function applyFinishLook(mat: THREE.MeshStandardMaterial, look: FinishLook): THREE.MeshStandardMaterial {
  const mark = look.style ? Math.max(look.markMm, 0.05) : 0;
  const len = Math.max(look.lengthMm, mark);
  const cellU0 = Math.max(len * SPACING, 0.05);
  const cells = Math.max(6, Math.round((2 * Math.PI * look.outerRadiusMm) / cellU0));
  const uniforms = {
    uStyle: { value: look.style ? STYLE_ID[look.style] : 0 },
    uMark: { value: mark },
    uLen: { value: len },
    uDepth: { value: look.depthMm },
    uArea: { value: look.area },
    uR0: { value: look.outerRadiusMm },
    uCells: { value: cells },
    uCellU: { value: (2 * Math.PI * look.outerRadiusMm) / cells },
    // 行の間：六角の並び（間かく × √3/2）。縦槌目は幅の向きに詰める
    uCellS: { value: Math.max(mark * SPACING * 0.866, 0.04) },
    uInlay: { value: look.inlay ? 1 : 0 },
    uInlayHalf: { value: look.inlay?.halfMm ?? 0 },
    uInlayLine: { value: look.inlay?.lineMm ?? 0 },
    uInlayColor: { value: new THREE.Color().setRGB(...(look.inlay?.color ?? [1, 1, 1]), THREE.LinearSRGBColorSpace) },
  };
  mat.userData.finishLook = look;
  const physical = mat instanceof THREE.MeshPhysicalMaterial;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${VERT_PARS}`).replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERT_MAIN}`);
    let f = shader.fragmentShader.replace("#include <common>", `#include <common>\n${FRAG_PARS}`).replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n${FRAG_NORMAL}`);
    // はめこんだ地金：色を替え、煮色の膜（clearcoat）をかけない、少しよくみがいた面。槌目が遠い・荒らし：少し曇らせる
    f = f.replace(
      "#include <roughnessmap_fragment>",
      "#include <roughnessmap_fragment>\nfInlay = fInlayMask(length(fwidth(vFObj)));\nroughnessFactor = mix(roughnessFactor, min(roughnessFactor, 0.12), fInlay);",
    );
    // 曇らせるのは、面の向きを決めたあと（fMatte は FRAG_NORMAL で決まる）
    f = f.replace("#include <lights_physical_fragment>", "diffuseColor.rgb = mix(diffuseColor.rgb, uInlayColor, fInlay);\nroughnessFactor = min(1.0, roughnessFactor + fMatte * (1.0 - fInlay));\n#include <lights_physical_fragment>");
    if (physical) {
      f = f.replace("material.clearcoat = clearcoat;", "material.clearcoat = clearcoat * (1.0 - fInlay);");
      // 煮色の膜の映り込みも、跡のくぼみに沿って曲げる
      f = f.replace("#include <clearcoat_normal_fragment_maps>", "#include <clearcoat_normal_fragment_maps>\n#ifdef USE_CLEARCOAT\nif (uMark > 0.0) clearcoatNormal = normal;\n#endif");
    }
    shader.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => `finish-look2-${physical ? "p" : "s"}`;
  mat.needsUpdate = true;
  return mat;
}
