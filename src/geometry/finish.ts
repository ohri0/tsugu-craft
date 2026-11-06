// 伝統の仕上げ（槌目・ミル打ち・布目象嵌）の設計の値と、ミル打ちの粒の形。画面に依存しない純粋な関数。
// - 槌目と布目象嵌は、形（STL）を変えない面の仕上げ。3D では材質で見せる（src/ui/hammer.ts）。
// - ミル打ちは本当の形：腕の外の面の両縁に、小さな粒（閉じた球）を一列ずつ並べる。STL と図面に入る。
// 座標は指輪の座標（shank.ts と同じ）：x が指の軸、腕は y–z の面の円、いちばん上が +z。
import { GUIDES } from "../rules/guides";
import type { V3 } from "./mesh";

export type TsuchimeSize = "small" | "medium" | "large";
/** 槌目を打つ所：outer＝腕の外の面だけ、all＝外の面と横の面（指に当たる内側は打たない） */
export type TsuchimeArea = "outer" | "all";

export interface RingFinish {
  /** 槌目（なければ鏡面） */
  tsuchime?: { size: TsuchimeSize; area: TsuchimeArea };
  /** ミル打ち：edges＝腕の外の面の両縁に一列ずつ */
  milgrain?: "edges";
  /** 象嵌：nunome＝腕の外の真ん中に、色のちがう地金の帯の模様（布目象嵌） */
  inlay?: "nunome";
}

export const TSUCHIME_LABEL: Record<TsuchimeSize, string> = { small: "小", medium: "中", large: "大" };
export const TSUCHIME_AREA_LABEL: Record<TsuchimeArea, string> = { outer: "腕の外側", all: "外側と横" };

/** 仕上げが 1 つでもあるか */
export function hasFinish(f: RingFinish | undefined): f is RingFinish {
  return !!f && (!!f.tsuchime || !!f.milgrain || !!f.inlay);
}

/** 仕上げの言葉（図面の表題欄・指示書・Claude への返事）。なければ空 */
export function finishWords(f: RingFinish | undefined): string[] {
  if (!f) return [];
  const out: string[] = [];
  if (f.tsuchime) out.push(`槌目（${TSUCHIME_LABEL[f.tsuchime.size]}・${TSUCHIME_AREA_LABEL[f.tsuchime.area]}）`);
  if (f.milgrain) out.push(`ミル打ち（腕の縁・粒 ø${GUIDES.finish.milgrain.beadMm.toFixed(2)} mm）`);
  if (f.inlay) out.push("布目象嵌（腕の真ん中の帯）");
  return out;
}

// ---- ミル打ちの粒 ----

/** 粒の球（正二十面体を 2 回分けた、閉じた 320 の三角形）。半径 1、中心 0 の頂点と、三角形の頂点の番号 */
const ICO = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts: V3[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  let faces: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const norm = (v: V3): V3 => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  verts = verts.map(norm);
  for (let level = 0; level < 2; level++) {
    const mid = new Map<string, number>();
    const at = (a: number, b: number) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      let i = mid.get(key);
      if (i === undefined) {
        const p = verts[a];
        const q = verts[b];
        i = verts.length;
        verts.push(norm([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]));
        mid.set(key, i);
      }
      return i;
    };
    const next: [number, number, number][] = [];
    for (const [a, b, c] of faces) {
      const ab = at(a, b);
      const bc = at(b, c);
      const ca = at(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  return { verts, faces };
})();

/** 腕の断面を切った所の線分（x：幅の向き、rho：指の軸からの距離） */
interface Seg {
  x0: number;
  r0: number;
  x1: number;
  r1: number;
}

/** 三角形を、指のまわりの角度の箱に分ける（切る面に近い三角形だけ見るため） */
function binTriangles(pos: Float32Array, bins: number): number[][] {
  const out: number[][] = Array.from({ length: bins }, () => []);
  const step = (2 * Math.PI) / bins;
  for (let t = 0; t < pos.length; t += 9) {
    const ph = [0, 3, 6].map((k) => Math.atan2(pos[t + k + 1], pos[t + k + 2]));
    let lo = Math.min(...ph);
    let hi = Math.max(...ph);
    // いちばん下（±π）をまたぐ三角形
    if (hi - lo > Math.PI) {
      const wrapped = ph.map((p) => (p < 0 ? p + 2 * Math.PI : p));
      lo = Math.min(...wrapped);
      hi = Math.max(...wrapped);
    }
    const i0 = Math.floor((lo + Math.PI) / step) - 1;
    const i1 = Math.floor((hi + Math.PI) / step) + 1;
    for (let i = i0; i <= i1; i++) out[((i % bins) + bins) % bins].push(t);
  }
  return out;
}

/** 角度 phi（いちばん上 0、+y の向きへ正）の半平面で腕を切った線分 */
function sliceAt(pos: Float32Array, tris: readonly number[], phi: number): Seg[] {
  const dy = Math.sin(phi);
  const dz = Math.cos(phi);
  // 面の向き（x 軸をふくむ面）：m ＝ (0, cos, −sin)
  const my = dz;
  const mz = -dy;
  const out: Seg[] = [];
  for (const t of tris) {
    const pts: [number, number][] = [];
    for (let k = 0; k < 3; k++) {
      const a = t + k * 3;
      const b = t + ((k + 1) % 3) * 3;
      const sa = pos[a + 1] * my + pos[a + 2] * mz;
      const sb = pos[b + 1] * my + pos[b + 2] * mz;
      if ((sa > 0) === (sb > 0)) continue;
      const u = sa / (sa - sb);
      const x = pos[a] + (pos[b] - pos[a]) * u;
      const y = pos[a + 1] + (pos[b + 1] - pos[a + 1]) * u;
      const z = pos[a + 2] + (pos[b + 2] - pos[a + 2]) * u;
      const rho = y * dy + z * dz;
      if (rho <= 0) continue;
      pts.push([x, rho]);
    }
    if (pts.length === 2) out.push({ x0: pts[0][0], r0: pts[0][1], x1: pts[1][0], r1: pts[1][1] });
  }
  return out;
}

/** 断面の、片側（s ＝ ±1）の縁の粒の置き場所：幅の位置 x、外の面の rho、外の面の向き（x と rho の成分） */
function edgeSpot(segs: readonly Seg[], s: 1 | -1, r: number): { x: number; rho: number; nx: number; nr: number } | null {
  if (!segs.length) return null;
  let half = 0;
  for (const g of segs) half = Math.max(half, s * g.x0, s * g.x1);
  const x = s * (half - r);
  let best: { x: number; rho: number; nx: number; nr: number } | null = null;
  for (const g of segs) {
    const lo = Math.min(g.x0, g.x1);
    const hi = Math.max(g.x0, g.x1);
    if (x < lo || x > hi || hi - lo < 1e-9) continue;
    const u = (x - g.x0) / (g.x1 - g.x0);
    const rho = g.r0 + (g.r1 - g.r0) * u;
    if (best && rho <= best.rho) continue;
    // 外向き（rho が増える側）の向き
    let nx = -(g.r1 - g.r0);
    let nr = g.x1 - g.x0;
    if (nr < 0) {
      nx = -nx;
      nr = -nr;
    }
    const l = Math.hypot(nx, nr) || 1;
    best = { x, rho, nx: nx / l, nr: nr / l };
  }
  return best;
}

export interface MilgrainResult {
  /** 粒の三角形（三角形ごとに 3 頂点 × xyz）と、なめらかに見せる頂点の向き */
  positions: Float32Array;
  normals: Float32Array;
  /** 粒の数と、粒の大きさ・間かく（mm） */
  count: number;
  beadMm: number;
  pitchMm: number;
  /** 面の上に出た所の体積（mm³。重さに足す） */
  volumeMm3: number;
}

/**
 * 腕の外の面の両縁に、ミル打ちの粒を一列ずつ並べる。
 * shankPositions：腕の三角形（指輪の座標）。avoid：石座の三角形（同じ座標。石座のそばには打たない）。
 * 粒は「離さず、重ねず」（間かく ＝ 粒の大きさ）。腕の切れた端と石座のそばは、粒 1 つ分あけて止める
 */
export function milgrainBeads(shankPositions: Float32Array, avoid: Float32Array | null, o: { beadMm?: number; domeRatio?: number } = {}): MilgrainResult {
  const d = o.beadMm ?? GUIDES.finish.milgrain.beadMm;
  const r = d / 2;
  // 粒は、面に沿って半径 r、面から高さ k·r の低い山（つぶした球の半分が面の上に出る）
  const k = o.domeRatio ?? GUIDES.finish.milgrain.domeRatio;
  const BINS = 720;
  const bins = binTriangles(shankPositions, BINS);
  const binOf = (phi: number) => {
    const i = Math.floor(((phi + Math.PI) / (2 * Math.PI)) * BINS);
    return ((i % BINS) + BINS) % BINS;
  };
  // 外の半径のおおよそ（角度の刻みを決める）
  let outer = 0;
  let maxHalf = 0;
  for (let i = 0; i < shankPositions.length; i += 3) {
    outer = Math.max(outer, Math.hypot(shankPositions[i + 1], shankPositions[i + 2]));
    maxHalf = Math.max(maxHalf, Math.abs(shankPositions[i]));
  }
  // 石座のそば：腕の高さにある石座の点の、いちばん外の角度
  let headPhi = -1;
  if (avoid) {
    for (let i = 0; i < avoid.length; i += 3) {
      const rho = Math.hypot(avoid[i + 1], avoid[i + 2]);
      if (rho > outer + d + 0.3 || Math.abs(avoid[i]) > maxHalf + d) continue;
      headPhi = Math.max(headPhi, Math.abs(Math.atan2(avoid[i + 1], avoid[i + 2])));
    }
  }
  const margin = (r + 0.15) / Math.max(outer, 1);
  const stepPhi = d / 6 / Math.max(outer, 1);
  const n = Math.ceil((2 * Math.PI) / stepPhi);
  const positions: number[] = [];
  const normals: number[] = [];
  let count = 0;
  let volume = 0;
  // 面の上に出た半分の体積（つぶした球の半分）
  const capV = (2 / 3) * Math.PI * r * r * (k * r);
  for (const s of [1, -1] as const) {
    // 縁の線を、続いている所ごとに集める
    const runs: V3[][] = [];
    const norms: V3[][] = [];
    let run: V3[] = [];
    let nrun: V3[] = [];
    const close = () => {
      if (run.length > 1) {
        runs.push(run);
        norms.push(nrun);
      }
      run = [];
      nrun = [];
    };
    for (let k = 0; k <= n; k++) {
      const phi = -Math.PI + k * stepPhi;
      if (headPhi >= 0 && Math.abs(phi) < headPhi + margin) {
        close();
        continue;
      }
      const spot = edgeSpot(sliceAt(shankPositions, bins[binOf(phi)], phi), s, r);
      if (!spot) {
        close();
        continue;
      }
      const sy = Math.sin(phi);
      const cz = Math.cos(phi);
      run.push([spot.x, spot.rho * sy, spot.rho * cz]);
      nrun.push([spot.nx, spot.nr * sy, spot.nr * cz]);
    }
    close();
    // いちばん下（±π）でつながる 2 つの線は 1 つに
    if (runs.length > 1) {
      const first = runs[0];
      const last = runs[runs.length - 1];
      if (Math.abs(Math.atan2(first[0][1], first[0][2]) + Math.PI) < stepPhi * 1.5 && Math.abs(Math.atan2(last[last.length - 1][1], last[last.length - 1][2]) - Math.PI) < stepPhi * 1.5) {
        runs[0] = [...last, ...first];
        norms[0] = [...norms[norms.length - 1], ...norms[0]];
        runs.pop();
        norms.pop();
      }
    }
    runs.forEach((line, li) => {
      const nl = norms[li];
      const acc = [0];
      for (let i = 1; i < line.length; i++) acc.push(acc[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1], line[i][2] - line[i - 1][2]));
      const L = acc[acc.length - 1];
      // 切れた端からは粒 1 つ分あける（はみ出さない）
      const usable = L - 2 * (r + 0.1);
      if (usable < 0) return;
      const m = Math.floor(usable / d) + 1;
      const start = (L - (m - 1) * d) / 2;
      let j = 0;
      for (let b = 0; b < m; b++) {
        const at = start + b * d;
        while (j < acc.length - 2 && acc[j + 1] < at) j++;
        const u = (at - acc[j]) / Math.max(acc[j + 1] - acc[j], 1e-9);
        const p = line[j];
        const q = line[j + 1];
        const np = nl[j];
        const nq = nl[j + 1];
        const nn: V3 = [np[0] + (nq[0] - np[0]) * u, np[1] + (nq[1] - np[1]) * u, np[2] + (nq[2] - np[2]) * u];
        const nlen = Math.hypot(nn[0], nn[1], nn[2]) || 1;
        const n: V3 = [nn[0] / nlen, nn[1] / nlen, nn[2] / nlen];
        const c: V3 = [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u];
        // 粒の向き：縁に沿う向き t、面の向き n、その間 b（t・b・n で右手系）
        let t: V3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
        const tn = t[0] * n[0] + t[1] * n[1] + t[2] * n[2];
        t = [t[0] - tn * n[0], t[1] - tn * n[1], t[2] - tn * n[2]];
        const tl = Math.hypot(t[0], t[1], t[2]) || 1;
        t = [t[0] / tl, t[1] / tl, t[2] / tl];
        const bt: V3 = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]];
        for (const f of ICO.faces) {
          for (const vi of f) {
            const [vx, vy, vz] = ICO.verts[vi];
            positions.push(c[0] + r * (vx * t[0] + vy * bt[0] + k * vz * n[0]), c[1] + r * (vx * t[1] + vy * bt[1] + k * vz * n[1]), c[2] + r * (vx * t[2] + vy * bt[2] + k * vz * n[2]));
            // つぶした球の面の向き（つぶした向きは、向きを 1/k 倍）
            const gx = vx * t[0] + vy * bt[0] + (vz / k) * n[0];
            const gy = vx * t[1] + vy * bt[1] + (vz / k) * n[1];
            const gz = vx * t[2] + vy * bt[2] + (vz / k) * n[2];
            const gl = Math.hypot(gx, gy, gz) || 1;
            normals.push(gx / gl, gy / gl, gz / gl);
          }
        }
        count++;
        volume += capV;
      }
    });
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), count, beadMm: d, pitchMm: d, volumeMm3: volume };
}
