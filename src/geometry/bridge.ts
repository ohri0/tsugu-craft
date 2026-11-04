// 三石：となりの石座をつなぐ短い線（ロウ付けで一つにする所）。画面に依存しない純粋な関数。
// 座標は指輪の座標（ring.ts と同じ。mm、x が指の向き、z が上）。
// 石座の輪（上の輪・下の輪）の中心の線どうしの、いちばん近い 2 点を、輪と同じ太さの丸い線でつなぐ。
// 線の両端は、それぞれの輪の中心まで入る（輪の中に埋まる）ので、外から見ると、2 つの石座が 1 つにつながって見える。
import { closedPart, sweepTube, type V3 } from "./mesh";

/** 石座の輪の中心の線（指輪の座標）と、輪の線の半径 */
export interface RailLine {
  pts: readonly V3[];
  radiusMm: number;
}

/** となりの石座をつなぐ所 1 つ */
export interface HeadJoin {
  /** つなぐ石の番号（RingDesign.stones の番号。a < b） */
  a: number;
  b: number;
  /** つなぐ線の両端（輪の中心の線の上の点） */
  from: V3;
  to: V3;
  /** つなぐ線の半径（mm） */
  radiusMm: number;
  /** 輪の外の面どうしの間（mm。線が見える長さ。重なっていれば 0 以下） */
  gapMm: number;
}

/** 線の断面の角の数と、丸いふたの段の数（形を作るための決まり。石座の輪と同じくらい） */
const SIDES = 16;
const CAP_STEPS = 7;

/** 2 組の輪の線の、いちばん近い 2 点（中心の線の上）と、外の面どうしの間 */
export function nearestRails(a: readonly RailLine[], b: readonly RailLine[]): { from: V3; to: V3; gapMm: number; ra: number; rb: number } | null {
  let best: { from: V3; to: V3; gapMm: number; ra: number; rb: number } | null = null;
  for (const la of a)
    for (const lb of b)
      for (const p of la.pts)
        for (const q of lb.pts) {
          const g = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) - la.radiusMm - lb.radiusMm;
          if (!best || g < best.gapMm) best = { from: p, to: q, gapMm: g, ra: la.radiusMm, rb: lb.radiusMm };
        }
  return best;
}

/** つなぐ線の形（両端が半球の丸い線。閉じた形）と、頂点ごとの向き */
export function joinMesh(j: Pick<HeadJoin, "from" | "to" | "radiusMm">): { positions: Float32Array; normals: Float32Array } {
  const { from: a, to: b, radiusMm: r } = j;
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.hypot(d[0], d[1], d[2]);
  const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  // 両端がほとんど同じ点なら、短い線を x の向きに置く（形はほぼ球）
  const u: V3 = L > 1e-6 ? [d[0] / L, d[1] / L, d[2] / L] : [1, 0, 0];
  const half = Math.max(L / 2, 1e-3);
  const p0: V3 = [mid[0] - u[0] * half, mid[1] - u[1] * half, mid[2] - u[2] * half];
  const p1: V3 = [mid[0] + u[0] * half, mid[1] + u[1] * half, mid[2] + u[2] * half];
  const side: V3 = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const tris: number[] = [];
  sweepTube([p0, mid, p1], { sides: SIDES, radius: () => [r, r], side, startCap: 1, endCap: 1, capSteps: CAP_STEPS }, tris);
  const positions = closedPart(tris);
  // 向き：線の軸（p0〜p1）の上のいちばん近い点から、外へ
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const v: V3 = [positions[i] - p0[0], positions[i + 1] - p0[1], positions[i + 2] - p0[2]];
    const t = Math.max(0, Math.min(2 * half, v[0] * u[0] + v[1] * u[1] + v[2] * u[2]));
    const n: V3 = [v[0] - u[0] * t, v[1] - u[1] * t, v[2] - u[2] * t];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    normals[i] = n[0] / l;
    normals[i + 1] = n[1] / l;
    normals[i + 2] = n[2] / l;
  }
  return { positions, normals };
}
