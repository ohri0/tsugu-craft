// 三角形の集まり（頂点を共有しない、三角形ごとに 3 頂点 × xyz）を組むための小さな道具。
// 石座と腕で使う。どの部品も「閉じた形」にし、面の向き（外向き）をそろえる。
import { meshVolume } from "./stone";

export type V3 = [number, number, number];

/** 三角形を 1 つ足す */
export function pushTri(out: number[], a: V3, b: V3, c: V3): void {
  out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
}

/**
 * 同じ点の数の閉じた輪を順につなぎ、最後の輪を最初の輪へ戻して、ドーナツ形の閉じた管にする。
 * 例：覆輪は「外の下 → 外の上 → 内の上 → 内の下」の輪を、縁に沿ってつなぐ。
 */
export function ringsToTube(rings: readonly V3[][], out: number[]): void {
  const m = rings.length;
  const n = rings[0].length;
  for (let k = 0; k < m; k++) {
    const a = rings[k];
    const b = rings[(k + 1) % m];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      pushTri(out, a[i], a[j], b[j]);
      pushTri(out, a[i], b[j], b[i]);
    }
  }
}

/**
 * 折れ線に沿って、正 sides 角形の断面の棒を作る（両端はふたで閉じる）。爪に使う。
 * ref は断面の向きの手がかり（ふつうは石の縁の外向き）。棒の向きとほぼ同じなら上向きを使う。
 */
export function rodAlongPath(path: readonly V3[], radius: number, ref: V3, sides: number, out: number[]): void {
  const sections: V3[][] = [];
  for (let j = 0; j < path.length; j++) {
    const p = path[j];
    const prev = path[Math.max(0, j - 1)];
    const next = path[Math.min(path.length - 1, j + 1)];
    const t = normalize(sub(next, prev));
    let u = sub(ref, scale(t, dot(ref, t)));
    if (Math.hypot(...u) < 1e-6) u = sub([0, 0, 1], scale(t, t[2]));
    u = normalize(u);
    const v = cross(t, u);
    const ring: V3[] = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      ring.push(add(p, add(scale(u, radius * Math.cos(a)), scale(v, radius * Math.sin(a)))));
    }
    sections.push(ring);
  }
  for (let j = 0; j + 1 < sections.length; j++) {
    const a = sections[j];
    const b = sections[j + 1];
    for (let k = 0; k < sides; k++) {
      const l = (k + 1) % sides;
      pushTri(out, a[k], a[l], b[l]);
      pushTri(out, a[k], b[l], b[k]);
    }
  }
  const first = sections[0];
  const last = sections[sections.length - 1];
  for (let k = 0; k < sides; k++) {
    const l = (k + 1) % sides;
    pushTri(out, path[0], first[l], first[k]);
    pushTri(out, path[path.length - 1], last[k], last[l]);
  }
}

/**
 * 1 つの閉じた部品を仕上げる。体積が負なら（面が内向きなら）全部の三角形を裏返して外向きにそろえる。
 * 組み方の向きの取り違えがあっても、出す形はいつも外向きになる。
 */
export function closedPart(tris: number[]): Float32Array {
  const a = new Float32Array(tris);
  if (meshVolume(a) < 0) {
    for (let i = 0; i < a.length; i += 9) {
      for (let c = 0; c < 3; c++) {
        const t = a[i + 3 + c];
        a[i + 3 + c] = a[i + 6 + c];
        a[i + 6 + c] = t;
      }
    }
  }
  return a;
}

/** いくつかの部品を 1 つの配列に並べる */
export function concat(parts: readonly Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function add(a: V3, b: V3): V3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
export function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function scale(a: V3, k: number): V3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}
export function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function normalize(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
