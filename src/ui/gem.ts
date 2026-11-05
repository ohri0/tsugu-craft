// 石の材質：石の中の光の道を、面（平面）で 1 本ずつ追う。
// 面で曲がって入り、中で何度か反射して（全反射）、外へ出た向きの光を読む。色ごとに曲がり方を変えるので、虹色のきらめきが出る。
// 三角形の形は目に見える面だけに使い、中の反射は「面の平面の集まり」で計算する（どの石も、平面の数は 60〜100 ほど）。
import * as THREE from "three";

export interface GemQuality {
  /** 中で反射を追う回数 */
  bounces: number;
  /** 1 つの点で追う光の本数（面の中の模様のギザギザを消す） */
  samples: 1 | 4;
  /** 赤・緑・青で別に追う（虹色のきらめき）。false なら 1 本で 3 色ぶん */
  disperse: boolean;
  /** 環境の絵の、いちばんぼけた段の番号 */
  envMaxLod: number;
}

/** すべての石で共有する値（環境と、その向き、石座の地金の色） */
export interface GemShared {
  uEnv: { value: THREE.Texture | null };
  uEnvRot: { value: THREE.Matrix3 };
  uMetal: { value: THREE.Color };
}

export interface GemLook {
  /** 赤・緑・青の屈折率 */
  ior: [number, number, number];
  /** 1 mm 進むごとに吸われる割合（色のある石。赤・緑・青） */
  sigma: [number, number, number];
}

import { LOOK } from "./studio-light";

/** 色のない石（ダイヤモンドの屈折率）。色の分かれ方は小さくする（作者の声：目がチカチカする） */
export const COLORLESS_IOR: [number, number, number] = [2.426 - LOOK.gemSpread[0], 2.426, 2.426 + LOOK.gemSpread[1]];
/** 色のある石（サファイア・ルビーの屈折率） */
export const COLORED_IOR: [number, number, number] = [1.762 - LOOK.gemSpread[0], 1.762, 1.762 + LOOK.gemSpread[1]];

/** 近い向きの面を 1 つの平面にまとめる角度（度）。中の反射の道だけに使う。見える面は三角形のまま */
const PLANE_MERGE_DEG = LOOK.gemMergeDeg;

type Plane = [number, number, number, number];

/** 三角形の範囲 → 石の面の平面（外向き）。同じ面はまとめ、近い向きの面も 1 つにする */
export function stonePlanes(positions: Float32Array, start = 0, count = positions.length / 9): Plane[] {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = start * 9; i < (start + count) * 9; i += 3) {
    cx += positions[i];
    cy += positions[i + 1];
    cz += positions[i + 2];
  }
  const m = count * 3;
  cx /= m;
  cy /= m;
  cz /= m;
  const c = Math.cos((PLANE_MERGE_DEG * Math.PI) / 180);
  const out: { n: [number, number, number]; d: number; k: number }[] = [];
  for (let t = start; t < start + count; t++) {
    const k = t * 9;
    const ax = positions[k];
    const ay = positions[k + 1];
    const az = positions[k + 2];
    const ux = positions[k + 3] - ax;
    const uy = positions[k + 4] - ay;
    const uz = positions[k + 5] - az;
    const vx = positions[k + 6] - ax;
    const vy = positions[k + 7] - ay;
    const vz = positions[k + 8] - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) continue;
    nx /= len;
    ny /= len;
    nz /= len;
    let d = nx * ax + ny * ay + nz * az;
    // 外向きにそろえる（石の真ん中が内側）
    if (nx * cx + ny * cy + nz * cz - d > 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
      d = -d;
    }
    let best: (typeof out)[number] | null = null;
    let bestDot = c;
    for (const q of out) {
      const l = Math.hypot(q.n[0], q.n[1], q.n[2]);
      const dot = (q.n[0] * nx + q.n[1] * ny + q.n[2] * nz) / l;
      if (dot > bestDot && Math.abs(q.d / q.k - d) < 0.25) {
        bestDot = dot;
        best = q;
      }
    }
    if (best) {
      best.n[0] += nx;
      best.n[1] += ny;
      best.n[2] += nz;
      best.d += d;
      best.k += 1;
    } else out.push({ n: [nx, ny, nz], d, k: 1 });
  }
  return out.map((q) => {
    const l = Math.hypot(q.n[0], q.n[1], q.n[2]);
    return [q.n[0] / l, q.n[1] / l, q.n[2] / l, q.d / q.k];
  });
}

const VERT = /* glsl */ `
  #include <clipping_planes_pars_vertex>
  attribute vec2 aPlanes;
  varying vec3 vP;
  varying vec3 vN;
  varying vec3 vCam;
  flat varying vec2 vRange;
  void main() {
    vP = position;
    vN = normal;
    vRange = aPlanes;
    vCam = cameraPosition - modelMatrix[3].xyz;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    #include <clipping_planes_vertex>
    gl_Position = projectionMatrix * mvPosition;
  }`;

const FRAG = /* glsl */ `
  precision highp float;
  precision highp sampler2D;
  #include <clipping_planes_pars_fragment>
  varying vec3 vP;
  varying vec3 vN;
  varying vec3 vCam;
  flat varying vec2 vRange;
  uniform sampler2D uPlanes;
  uniform samplerCube uEnv;
  uniform mat3 uEnvRot;
  uniform vec3 uIor;
  uniform vec3 uSigma;
  uniform vec3 uMetal;
  uniform vec3 uBlur;
  // 環境をぼかして読む（r：粗さ。遠くの反射ほどぼかすと、細かい破片が消えて、面ごとの濃淡になる）
  vec3 env(vec3 d, float r) { return textureLod(uEnv, uEnvRot * d, ENV_MAX_LOD * r * (2.0 - r)).rgb; }
  // 石の下へ抜けた光は、石座の地金に当たって返る（下の向きを上へ折り返して読み、地金の色をかける）
  vec3 exitLight(vec3 o, float r) {
    float down = smoothstep(0.1, -0.35, o.z);
    if (down <= 0.0) return env(o, r);
    // 地金の色は薄く混ぜる（石ぜんぶが金色に染まって見えないように）
    return mix(env(o, r), env(vec3(o.x, o.y, abs(o.z)), r) * mix(vec3(1.0), uMetal, 0.35) * 0.55, down);
  }
  float fresnel(float cosI, float n1, float n2) {
    float s2 = (n1 / n2) * (n1 / n2) * (1.0 - cosI * cosI);
    if (s2 >= 1.0) return 1.0;
    float cosT = sqrt(1.0 - s2);
    float rs = (n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT);
    float rp = (n1 * cosT - n2 * cosI) / (n1 * cosT + n2 * cosI);
    return 0.5 * (rs * rs + rp * rp);
  }
  // 石の中を追う：屈折率 ior の光が、入った所から出るまでに集める光
  vec3 trace(vec3 P, vec3 V, vec3 N, float ior, int first, int count, out float f0) {
    float cosI = clamp(-dot(V, N), 0.0, 1.0);
    f0 = fresnel(cosI, 1.0, ior);
    vec3 d = refract(V, N, 1.0 / ior);
    vec3 p = P;
    vec3 T = vec3(1.0 - f0);
    vec3 col = vec3(0.0);
    for (int b = 0; b < BOUNCES; b++) {
      float tBest = 1e9;
      vec3 nBest = vec3(0.0);
      for (int j = first; j < first + count; j++) {
        vec4 pl = texelFetch(uPlanes, ivec2(j & 255, j >> 8), 0);
        float dn = dot(pl.xyz, d);
        if (dn > 1e-5) {
          float t = (pl.w - dot(pl.xyz, p)) / dn;
          if (t < tBest && t > -1e-4) {
            tBest = t;
            nBest = pl.xyz;
          }
        }
      }
      if (tBest > 1e8) break;
      p += d * tBest;
      T *= exp(-uSigma * max(tBest, 0.0));
      float c = dot(d, nBest);
      float F = fresnel(c, ior, 1.0);
      if (F < 1.0) {
        col += T * (1.0 - F) * exitLight(refract(d, -nBest, ior), b == 0 ? uBlur.y : uBlur.z);
        T *= F;
      }
      d = reflect(d, -nBest);
      p -= nBest * 1e-4;
      if (max(T.r, max(T.g, T.b)) < 0.004) break;
    }
    return col + T * exitLight(d, uBlur.z);
  }
  vec3 shade(vec3 P, vec3 V, vec3 N, int first, int count) {
    float fr;
    #if DISPERSE
      float fg;
      float fb;
      vec3 c = vec3(trace(P, V, N, uIor.r, first, count, fr).r, trace(P, V, N, uIor.g, first, count, fg).g, trace(P, V, N, uIor.b, first, count, fb).b);
      return c + env(reflect(V, N), uBlur.x) * vec3(fr, fg, fb);
    #else
      vec3 c = trace(P, V, N, uIor.g, first, count, fr);
      return c + env(reflect(V, N), uBlur.x) * fr;
    #endif
  }
  void main() {
    #include <clipping_planes_fragment>
    vec3 N = normalize(vN);
    // 正射のカメラ（平らな図）では、光線はどこでも同じ向き
    vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
    int first = int(vRange.x + 0.5);
    int count = int(vRange.y + 0.5);
    vec3 c = vec3(0.0);
    #if SAMPLES == 4
      vec3 dx = dFdx(vP);
      vec3 dy = dFdy(vP);
      c += shade(vP + dx * -0.125 + dy * -0.375, isOrthographic ? fwd : normalize(vP + dx * -0.125 + dy * -0.375 - vCam), N, first, count);
      c += shade(vP + dx * 0.375 + dy * -0.125, isOrthographic ? fwd : normalize(vP + dx * 0.375 + dy * -0.125 - vCam), N, first, count);
      c += shade(vP + dx * 0.125 + dy * 0.375, isOrthographic ? fwd : normalize(vP + dx * 0.125 + dy * 0.375 - vCam), N, first, count);
      c += shade(vP + dx * -0.375 + dy * 0.125, isOrthographic ? fwd : normalize(vP + dx * -0.375 + dy * 0.125 - vCam), N, first, count);
      c *= 0.25;
    #else
      c = shade(vP, isOrthographic ? fwd : normalize(vP - vCam), N, first, count);
    #endif
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** 石の材質を作る。geometry に、石ごとの平面の範囲（aPlanes）を足す。ranges：石ごとの三角形の範囲（なければ全部で 1 つの石） */
export function gemMaterial(geometry: THREE.BufferGeometry, positions: Float32Array, ranges: readonly { start: number; count: number }[] | undefined, look: GemLook, shared: GemShared, quality: GemQuality): THREE.ShaderMaterial {
  const total = positions.length / 9;
  const stones = ranges?.length ? ranges : [{ start: 0, count: total }];
  const all: number[] = [];
  const attr = new Float32Array(total * 3 * 2);
  for (const r of stones) {
    const planes = stonePlanes(positions, r.start, r.count);
    const first = all.length / 4;
    for (const p of planes) all.push(...p);
    for (let i = r.start * 3; i < (r.start + r.count) * 3; i++) {
      attr[i * 2] = first;
      attr[i * 2 + 1] = planes.length;
    }
  }
  geometry.setAttribute("aPlanes", new THREE.BufferAttribute(attr, 2));
  const n = all.length / 4;
  const h = Math.ceil(n / 256) || 1;
  const data = new Float32Array(256 * h * 4);
  data.set(all);
  const tex = new THREE.DataTexture(data, 256, h, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uPlanes: { value: tex },
      uEnv: shared.uEnv,
      uEnvRot: shared.uEnvRot,
      uMetal: shared.uMetal,
      uIor: { value: new THREE.Vector3(...look.ior) },
      uSigma: { value: new THREE.Vector3(...look.sigma) },
      uBlur: { value: new THREE.Vector3(...LOOK.gemBlur) },
    },
    defines: { BOUNCES: quality.bounces, SAMPLES: quality.samples, DISPERSE: quality.disperse ? 1 : 0, ENV_MAX_LOD: quality.envMaxLod.toFixed(1) },
    side: THREE.FrontSide,
    clipping: true,
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
  mat.userData.gem = true;
  mat.addEventListener("dispose", () => tex.dispose());
  return mat;
}
