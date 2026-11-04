// 石座と腕のつなぎ目：腕の上を石座の下の輪の形に合わせて削り（座）、両側の接点にロウを流す（ロウの丸み）。
// 画面に依存しない純粋な関数。座標は指輪の座標（ring.ts・shank.ts と同じ。mm、z が上）。
//
// 職人の作り方（docs/RESEARCH-rules2.md の「石座を腕に付ける」）：腕の上を、石座の底が座るようにヤスリで合わせ、
// 石座が腕に当たる両側に小さなロウを置いて流す。ロウは目に見えないくらい少しで、すみに小さな丸みになって入る。
// 一粒石の指輪では、石座の下の輪が腕を横切る所が 2 か所（腕に沿って前と後ろ）できる。そこが接点。
import { GUIDES } from "../rules/guides";
import type { V3 } from "./mesh";
import type { SeatCut } from "./notch";
import type { RingTransform } from "./ring";
import { buildSolid, smin } from "./sdf";
import type { SettingResult } from "./setting";
import { shoulderWidth, type ShankResult } from "./shank";

/** 石座の下の輪（指輪の座標）：中心の線（閉じた輪）と、線の半径 */
export interface Rail {
  pts: V3[];
  radiusMm: number;
}

/** 石座の下の輪を、指輪の座標に置く（爪留めでなければ null） */
export function railInRing(setting: SettingResult, t: RingTransform): Rail | null {
  if (!setting.lowerRail) return null;
  const c = Math.cos(t.rotationZ);
  const s = Math.sin(t.rotationZ);
  const pts = setting.lowerRail.pts.map(([x, y, z]) => [x * c - y * s, x * s + y * c, z + t.translateZ] as V3);
  return { pts, radiusMm: setting.lowerRail.radiusMm };
}

/**
 * 腕の上の座（溝）：上から見て (x, y) の真上を下の輪が通るとき、輪の下の面の z（通らなければ +Infinity）。
 * 腕の点をこの高さより下げると、腕の上が輪の丸みに合った溝になり、石座がぴったり座る。
 * 下の輪は水平（同じ z の輪）なので、上から見た輪の中心の線までの距離 d から、z ＝ 中心 − √(半径² − d²)
 */
export function railSeatZ(rail: Rail): (x: number, y: number) => number {
  const { pts, radiusMm: a } = rail;
  const n = pts.length;
  return (x, y) => {
    let best = Infinity;
    let zc = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % n];
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const L2 = dx * dx + dy * dy;
      let u = L2 > 0 ? ((x - p[0]) * dx + (y - p[1]) * dy) / L2 : 0;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const ex = p[0] + dx * u - x;
      const ey = p[1] + dy * u - y;
      const d2 = ex * ex + ey * ey;
      if (d2 < best) {
        best = d2;
        zc = p[2] + (q[2] - p[2]) * u;
      }
    }
    return best < a * a ? zc - Math.sqrt(a * a - best) : Infinity;
  };
}

/** 中心の線（折れ線）までの距離 − 半径（管の表面までの距離。内側は負） */
function tubeDistance(pts: readonly V3[], a: number, closed: boolean): (x: number, y: number, z: number) => number {
  const m = closed ? pts.length : pts.length - 1;
  return (x, y, z) => {
    let best = Infinity;
    for (let i = 0; i < m; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const dz = q[2] - p[2];
      const L2 = dx * dx + dy * dy + dz * dz;
      let u = L2 > 0 ? ((x - p[0]) * dx + (y - p[1]) * dy + (z - p[2]) * dz) / L2 : 0;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const ex = p[0] + dx * u - x;
      const ey = p[1] + dy * u - y;
      const ez = p[2] + dz * u - z;
      best = Math.min(best, ex * ex + ey * ey + ez * ez);
    }
    return Math.sqrt(best) - a;
  };
}

/**
 * 腕の表面までの距離（内側は負。座とザグりは入れない）。腕は断面を指のまわりに回した形なので、
 * 指の軸をふくむ面（x と、軸からの距離 ρ）の上で、断面の線までの距離を測る。肩で広がる所は、幅の比で x を縮めて測る
 */
export function bandDistance(shank: ShankResult, cellMm = 0): (x: number, y: number, z: number) => number {
  const r = shank.innerRadiusMm;
  const w = shank.widthMm;
  const widthAt = shoulderWidth(w, shank.outerRadiusMm, shank.head ?? undefined);
  // 断面の多角形：外側の線（右の端の内側 → 左の端の内側）を、内側の平らな線で閉じる
  const poly = shank.outlineMm.map(([x, y]) => [x, r + y] as [number, number]);
  const n = poly.length;
  const meridian = (u: number, rho: number) => {
    let best = Infinity;
    let inside = false;
    for (let i = 0; i < n; i++) {
      const [ax, ay] = poly[i];
      const [bx, by] = poly[(i + 1) % n];
      const dx = bx - ax;
      const dy = by - ay;
      const L2 = dx * dx + dy * dy;
      let t = L2 > 0 ? ((u - ax) * dx + (rho - ay) * dy) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      best = Math.min(best, (ax + dx * t - u) ** 2 + (ay + dy * t - rho) ** 2);
      if (ay > rho !== by > rho && u < ax + ((rho - ay) * dx) / dy) inside = !inside;
    }
    return inside ? -Math.sqrt(best) : Math.sqrt(best);
  };
  // cellMm を渡すと、断面の面の上の距離を格子に覚えて、間を補う（同じ所を何度も測るロウの丸みを速くする）
  const m = cellMm > 0 ? lazyGrid(-w / 2 - 1.5, r - 1, w / 2 + 1.5, shank.outerRadiusMm + 1.5, cellMm, meridian) : meridian;
  return (x, y, z) => m((x * w) / widthAt(Math.atan2(y, z)), Math.hypot(y, z));
}

/**
 * 2 つの変数の関数を、間隔 cell の格子の点で（はじめて要るときに）測って覚え、間は双一次で補う。範囲の外はそのまま測る。
 * 距離の値の補いの誤差は、格子の間隔の範囲（面の位置が 1 目より小さくずれるだけ）
 */
function lazyGrid(x0: number, y0: number, x1: number, y1: number, cell: number, f: (x: number, y: number) => number): (x: number, y: number) => number {
  const nx = Math.ceil((x1 - x0) / cell) + 1;
  const ny = Math.ceil((y1 - y0) / cell) + 1;
  const v = new Float64Array(nx * ny).fill(NaN);
  const at = (i: number, j: number) => {
    const k = j * nx + i;
    const c = v[k];
    if (c === c) return c;
    return (v[k] = f(x0 + i * cell, y0 + j * cell));
  };
  return (x, y) => {
    const fx = (x - x0) / cell;
    const fy = (y - y0) / cell;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= ny - 1) return f(x, y);
    const tx = fx - i;
    const ty = fy - j;
    return (at(i, j) * (1 - tx) + at(i + 1, j) * tx) * (1 - ty) + (at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx) * ty;
  };
}

/** 水平な輪（同じ z の閉じた折れ線）の管までの距離。上から見た線までの距離を格子に覚えて速くする */
function flatLoopDistance(pts: readonly V3[], a: number, cell: number): (x: number, y: number, z: number) => number {
  const zc = pts[0][2];
  const n = pts.length;
  const d2 = (x: number, y: number) => {
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % n];
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const L2 = dx * dx + dy * dy;
      let u = L2 > 0 ? ((x - p[0]) * dx + (y - p[1]) * dy) / L2 : 0;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      best = Math.min(best, (p[0] + dx * u - x) ** 2 + (p[1] + dy * u - y) ** 2);
    }
    return Math.sqrt(best);
  };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  }
  const pad = a + 1;
  const g = lazyGrid(x0 - pad, y0 - pad, x1 + pad, y1 + pad, cell, d2);
  return (x, y, z) => Math.hypot(g(x, y), z - zc) - a;
}

/** ザグりのくぼみ（球と、その上にまっすぐ立つ筒）の表面までの距離（内側は負）。ザグりがなければ null */
function ballDistance(shank: ShankResult): ((x: number, y: number, z: number) => number) | null {
  const b = shank.notchBall;
  if (!b) return null;
  const cz = b.bottomZ + b.radiusMm;
  return (x, y, z) => {
    const h = Math.hypot(x - b.cx, y - b.cy);
    return (z > cz ? h : Math.hypot(h, z - cz)) - b.radiusMm;
  };
}

export interface Solder {
  /** ロウの丸み（三角形ごとに 3 頂点 × xyz）。接点ごとに閉じた形 */
  positions: Float32Array;
  /** 頂点ごとの向き */
  normals: Float32Array;
  /** 接点の数（ふつう 2） */
  contacts: number;
  /** 丸みの大きさ（mm） */
  filletMm: number;
}

/** ロウの丸みを作る格子の細かさと、丸みの面を内へ沈める量（mm。形を作るための決まり） */
const SOLDER_GRID = { cellMm: 0.04, sinkMm: 0.02 };

/**
 * 接点ごとのロウの丸み。下の輪と腕を「なめらかな最小」でつないだ形のうち、輪からも腕からも丸みの大きさ以内の所だけを取る：
 * G ＝ max(smin(輪, 腕, k), 輪 − k, 腕 − k)。外から見えるのは、輪と腕のすみを埋める丸み（ロウが流れた形）だけで、
 * ほかの面は輪か腕の中に隠れる。石とはすき間を残す（石の下の面 − すき間 より上は作らない）
 */
export function buildSolder(rail: Rail, shank: ShankResult, cut: SeatCut | null): Solder {
  const k = GUIDES.gallery.solderFilletRatio * 2 * rail.radiusMm;
  const a = rail.radiusMm;
  const plain = bandDistance(shank, SOLDER_GRID.cellMm / 2);
  const ball = ballDistance(shank);
  // ザグりのくぼみは腕から引く。ロウもくぼみの中には入れない（くぼみの上は石の通り道）
  const band = ball ? (x: number, y: number, z: number) => Math.max(plain(x, y, z), -ball(x, y, z)) : plain;
  // 輪の点のうち、腕の表面まで「線の半径 ＋ 丸み × 2」より近い点をつなげて、接点の区間にする（ロウの丸みは、この区間のまわりにしかできない）
  const pts = rail.pts;
  const n = pts.length;
  const near = pts.map((p) => band(p[0], p[1], p[2]) < a + 2 * k);
  // 区間：輪の点の番号の並び（両端を 2 点ずつ延ばす）。輪ぜんぶが近ければ、輪ぜんぶで 1 つ（閉じた輪）
  const runs: { idx: number[]; closed: boolean }[] = [];
  const start = near.indexOf(false);
  if (start < 0) runs.push({ idx: pts.map((_, i) => i), closed: true });
  else {
    let cur: number[] | null = null;
    for (let s = 0; s <= n; s++) {
      const i = (start + s) % n;
      if (near[i] && s < n) (cur ??= []).push(i);
      else if (cur) {
        const first = cur[0];
        const last = cur[cur.length - 1];
        runs.push({ idx: [(first - 2 + n) % n, (first - 1 + n) % n, ...cur, (last + 1) % n, (last + 2) % n], closed: false });
        cur = null;
      }
    }
  }
  const floor = cut ? (x: number, y: number) => cut.floorAt(x, y) : null;
  const pos: Float32Array[] = [];
  const nor: Float32Array[] = [];
  // 下の輪は水平（どの点も同じ z）。そうなら速い測り方（上から見た線までの距離を覚える）、ちがえば区間の線で測る
  const flat = pts.every((p) => Math.abs(p[2] - pts[0][2]) < 1e-9) ? flatLoopDistance(pts, a, SOLDER_GRID.cellMm / 2) : null;
  for (const run of runs) {
    const line = run.idx.map((i) => pts[i]);
    const rail1 = flat ?? tubeDistance(line, a, run.closed);
    const G = (x: number, y: number, z: number) => {
      const dr = rail1(x, y, z);
      if (dr > k) return dr - k;
      const db = band(x, y, z);
      // 丸みの面を SOLDER_GRID.sinkMm だけ内へ沈める：丸みの端が腕や輪の面にぴったり重ならず、少しの角度で入りこむ（重なると面がちらつく）
      const g = Math.max(smin(dr, db, k) + SOLDER_GRID.sinkMm, dr - k, db - k);
      return ball ? Math.max(g, -ball(x, y, z)) : g;
    };
    const m = a + k + 0.05;
    const min: V3 = [Infinity, Infinity, Infinity];
    const max: V3 = [-Infinity, -Infinity, -Infinity];
    for (const p of line)
      for (let c = 0; c < 3; c++) {
        min[c] = Math.min(min[c], p[c] - m);
        max[c] = Math.max(max[c], p[c] + m);
      }
    const solid = buildSolid([], {
      cell: SOLDER_GRID.cellMm,
      blend: SOLDER_GRID.cellMm,
      fields: [{ dist: G, min, max, owner: 0 }],
      subtract: floor ? (x, y, z) => floor(x, y) - z : undefined,
    });
    const kept = dropSpecks(solid.positions, solid.normals);
    if (!kept.positions.length) continue;
    pos.push(kept.positions);
    nor.push(kept.normals);
  }
  return { positions: join(pos), normals: join(nor), contacts: pos.length, filletMm: k };
}

/**
 * 面のつながり（同じ点を通る三角形）ごとに分け、面積がごく小さいかけら（0.001 mm² 未満）を捨てる。
 * 格子の上で、ロウの丸みの端がくぼみの面とちょうど重なる所に、離れた小さな四角がまれにでき、STL の開いた辺になるため
 */
function dropSpecks(p: Float32Array, nrm: Float32Array): { positions: Float32Array; normals: Float32Array } {
  const nt = p.length / 9;
  const ids = new Map<string, number>();
  const vid = (i: number) => {
    const k = `${p[i]},${p[i + 1]},${p[i + 2]}`;
    let v = ids.get(k);
    if (v === undefined) ids.set(k, (v = ids.size));
    return v;
  };
  const tv = new Int32Array(nt * 3);
  for (let t = 0; t < nt; t++) for (let c = 0; c < 3; c++) tv[t * 3 + c] = vid(t * 9 + c * 3);
  const parent = Array.from({ length: ids.size }, (_, i) => i);
  const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  for (let t = 0; t < nt; t++) {
    const a = find(tv[t * 3]);
    parent[find(tv[t * 3 + 1])] = a;
    parent[find(tv[t * 3 + 2])] = a;
  }
  const area = new Map<number, number>();
  for (let t = 0; t < nt; t++) {
    const o = t * 9;
    const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2];
    const vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2];
    const a = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    const r = find(tv[t * 3]);
    area.set(r, (area.get(r) ?? 0) + a);
  }
  const keep: number[] = [];
  for (let t = 0; t < nt; t++) if ((area.get(find(tv[t * 3])) ?? 0) >= 1e-3) keep.push(t);
  if (keep.length === nt) return { positions: p, normals: nrm };
  const positions = new Float32Array(keep.length * 9);
  const normals = new Float32Array(keep.length * 9);
  keep.forEach((t, i) => {
    positions.set(p.subarray(t * 9, t * 9 + 9), i * 9);
    normals.set(nrm.subarray(t * 9, t * 9 + 9), i * 9);
  });
  return { positions, normals };
}

function join(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
