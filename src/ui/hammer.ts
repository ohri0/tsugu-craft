// 腕の面の仕上げを、材質で見せる：槌目（金づちの跡の小さなくぼみ）と、布目象嵌（色のちがう地金の帯の模様）。
// 形（STL・図面）は変えない。光の向き（面の向き）と色だけを、腕の座標（指の軸 x のまわりの角度と幅の位置）から決める。
// - 跡は、腕の外の面に並べた、少しずつ大きさと傾きのちがう浅いくぼみ（ボロノイの区切り）。くぼみの境が、細い稜線として光る。
// - 決まった場所の模様なので、回しても平らな図でもちらつかない。画面より細かい跡は、自然に消す（細かい縞が出ないように）。
// 座標は腕の形のまま（src/geometry/shank.ts）：x が指の軸、いちばん上が +z。物体の回転は z ＝ 床へ上げた分だけ。
import * as THREE from "three";

export interface FinishLook {
  /** 槌目の跡の大きさ（mm）。0 なら打たない */
  markMm: number;
  /** 槌目の場所：0＝外の面だけ、1＝外の面と横の面 */
  area: 0 | 1;
  /** 腕の外の半径（mm。跡を一周にきっちり並べるため） */
  outerRadiusMm: number;
  /** 布目象嵌の帯（なければ入れない）：帯の半分の幅・線の太さ（mm）と、はめこむ地金の色（リニア） */
  inlay?: { halfMm: number; lineMm: number; color: [number, number, number] };
}

const VERT_PARS = /* glsl */ `
varying vec3 vFObj; varying vec3 vFObjN; varying vec3 vFTu; varying vec3 vFTv; varying vec3 vFTr;
`;
const VERT_MAIN = /* glsl */ `
vFObj = position; vFObjN = objectNormal;
{
  float rr = max(length(position.yz), 1e-4);
  vFTu = normalize(normalMatrix * (vec3(0.0, position.z, -position.y) / rr));
  vFTv = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
  vFTr = normalize(normalMatrix * (vec3(0.0, position.y, position.z) / rr));
}
`;

const FRAG_PARS = /* glsl */ `
varying vec3 vFObj; varying vec3 vFObjN; varying vec3 vFTu; varying vec3 vFTv; varying vec3 vFTr;
uniform float uMark; uniform float uArea; uniform float uR0; uniform float uCells;
uniform float uInlay; uniform float uInlayHalf; uniform float uInlayLine; uniform vec3 uInlayColor;
float fInlay = 0.0;
vec2 fHash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
// 一周にきっちり uCells 個の跡（いちばん下の継ぎ目で跡が切れない）。q は mm、戻りは いちばん近い跡の中心からの差（mm）と跡の乱れ
vec4 fCell(vec2 q, float cellV) {
  float cellU = 6.28318530718 * uR0 / uCells;
  vec2 g = vec2(q.x / cellU, q.y / cellV);
  vec2 i0 = floor(g);
  float best = 1e9; vec2 bestD = vec2(0.0); vec2 bestR = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = i0 + vec2(float(i), float(j));
    vec2 key = vec2(mod(c.x, uCells), c.y);
    vec2 h = fHash2(key);
    vec2 pt = vec2((c.x + 0.5 + 0.75 * (h.x - 0.5)) * cellU, (c.y + 0.5 + 0.75 * (h.y - 0.5)) * cellV);
    // 跡の大きさのばらつき：大きい跡ほど、となりを押しのける（重み付きの近さ）
    float wgt = 0.8 + 0.4 * fHash2(key + 17.0).x;
    vec2 d = q - pt;
    float dist = length(d) / wgt;
    if (dist < best) { best = dist; bestD = d; bestR = fHash2(key + 41.0) - 0.5; }
  }
  return vec4(bestD, bestR);
}
// 外の面の真ん中の帯：両縁の線と、その間の菱つなぎの線（はめこんだ地金）。1 ならはめこんだ地金
float fInlayMask() {
  if (uInlay < 0.5) return 0.0;
  float rr = max(length(vFObj.yz), 1e-4);
  vec3 radial = vec3(0.0, vFObj.y, vFObj.z) / rr;
  float outerW = smoothstep(0.3, 0.7, dot(normalize(vFObjN), radial));
  float phi = atan(vFObj.y, vFObj.z);
  float x = vFObj.x;
  float u = phi * uR0;
  float hw = uInlayHalf;
  float lw = uInlayLine * 0.5;
  float aa = max(fwidth(x), fwidth(u)) * 0.75 + 1e-4;
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
  // 外の面：少しでも外を向く面（甲丸の丸みの裾まで）。横の面（平打ちの側面）は外を向かない
  float outerW = smoothstep(0.08, 0.3, dot(on, radial));
  float sideW = smoothstep(0.6, 0.92, abs(on.x)) * (1.0 - smoothstep(0.05, 0.3, -dot(on, radial)));
  float phi = atan(vFObj.y, vFObj.z);
  if (uMark > 0.0) {
    float w = uArea > 0.5 ? max(outerW, sideW) : outerW;
    bool side = uArea > 0.5 && sideW > outerW;
    vec2 q = side ? vec2(phi * uR0, rr) : vec2(phi * uR0, vFObj.x);
    // 画面の 1 点が跡の何割か。跡が 4 点より小さくなると、だんだん消す
    float px = length(fwidth(q));
    float fade = 1.0 - smoothstep(uMark * 0.12, uMark * 0.3, px);
    if (w * fade > 0.001) {
      vec4 c = fCell(q, uMark);
      // くぼみの面の傾き：中心から離れるほど中心の側へ傾く（浅い球の面）。跡の縁で約 0.2 ラジアン ＋ 打つごとの小さな傾き
      vec2 g = c.xy / (uMark * 3.0) + c.zw * 0.08;
      vec3 t2 = side ? vFTr : vFTv;
      normal = normalize(normal - w * fade * (g.x * vFTu + g.y * t2));
    }
  }
}
`;

/** 材質に、腕の面の仕上げを足す（同じ材質を何度渡しても、1 回だけ足す） */
export function applyFinishLook(mat: THREE.MeshStandardMaterial, look: FinishLook): THREE.MeshStandardMaterial {
  const cells = Math.max(6, Math.round((2 * Math.PI * look.outerRadiusMm) / Math.max(look.markMm, 0.1)));
  const uniforms = {
    uMark: { value: look.markMm },
    uArea: { value: look.area },
    uR0: { value: look.outerRadiusMm },
    uCells: { value: cells },
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
    // はめこんだ地金：色を替え、煮色の膜（clearcoat）をかけない、少しよくみがいた面
    f = f.replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nfInlay = fInlayMask();\nroughnessFactor = mix(roughnessFactor, min(roughnessFactor, 0.12), fInlay);");
    f = f.replace("#include <lights_physical_fragment>", "diffuseColor.rgb = mix(diffuseColor.rgb, uInlayColor, fInlay);\n#include <lights_physical_fragment>");
    if (physical) {
      f = f.replace("material.clearcoat = clearcoat;", "material.clearcoat = clearcoat * (1.0 - fInlay);");
      // 煮色の膜の映り込みも、跡のくぼみに沿って曲げる
      f = f.replace("#include <clearcoat_normal_fragment_maps>", "#include <clearcoat_normal_fragment_maps>\n#ifdef USE_CLEARCOAT\nif (uMark > 0.0) clearcoatNormal = normal;\n#endif");
    }
    shader.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => `finish-look-${physical ? "p" : "s"}`;
  mat.needsUpdate = true;
  return mat;
}
