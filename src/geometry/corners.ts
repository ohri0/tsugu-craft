// 輪郭から尖った角を探す。
import { DETECTION } from "../rules/detection";
import { resample, toCounterClockwise, type Point } from "./polygon";

export interface Corner {
  /** 角の位置（入力と同じ座標） */
  point: Point;
  /** 内角（度） */
  angleDeg: number;
  /** 周の上の位置（0〜1、最初の点から反時計回り） */
  t: number;
}

export function findCorners(outline: readonly Point[], opts = DETECTION.corners): Corner[] {
  const pts = resample(toCounterClockwise(outline), opts.samples);
  const n = pts.length;
  const k = Math.max(2, Math.round(n * opts.armRatio));
  const angles = pts.map((_, i) => interiorAngle(pts, i, k));
  // 2 つ目の見方：少し長い腕で測り、両隣がまっすぐなのに、そこだけ曲がっている所
  const kw = Math.max(k + 1, Math.round(n * opts.wideArmRatio));
  const wide = pts.map((_, i) => interiorAngle(pts, i, kw));
  const f = Math.max(1, Math.round(n * opts.flankRatio));
  const isCorner = (i: number) => {
    if (angles[i] < opts.maxInteriorDeg) return true;
    const flank = Math.min(wide[(i + f) % n], wide[(i - f + n) % n]);
    return wide[i] < opts.wideMaxInteriorDeg && flank - wide[i] >= opts.contrastDeg;
  };
  const minSep = Math.max(1, Math.round(n * opts.minSeparationRatio));
  const order = [...angles.keys()].filter(isCorner).sort((i, j) => wide[i] - wide[j]);
  const picked: number[] = [];
  for (const i of order) {
    if (picked.every((j) => Math.min(Math.abs(i - j), n - Math.abs(i - j)) >= minSep)) picked.push(i);
  }
  picked.sort((i, j) => i - j);
  // 画面に出す角度は、角の丸みを飛ばした両側の辺どうしの角度（丸みに引っぱられない）
  const kr = Math.max(k + 1, Math.round(n * opts.reportArmRatio));
  return picked.map((i) => ({ point: pts[i], angleDeg: sideAngle(pts, i, k, kr), t: i / n }));
}

/** 角の両側で、k1〜k2 番目だけ離れた所の辺の向きどうしの角度（度） */
function sideAngle(pts: Point[], i: number, k1: number, k2: number): number {
  const n = pts.length;
  const a1 = pts[(i - k1 + n) % n];
  const a2 = pts[(i - k2 + n) % n];
  const b1 = pts[(i + k1) % n];
  const b2 = pts[(i + k2) % n];
  const ax = a2.x - a1.x;
  const ay = a2.y - a1.y;
  const bx = b2.x - b1.x;
  const by = b2.y - b1.y;
  const cos = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/** i 番目の点の内角（度）。外へ尖っていなければ 180 */
function interiorAngle(pts: Point[], i: number, k: number): number {
  const n = pts.length;
  const p = pts[i];
  const a = pts[(i - k + n) % n];
  const b = pts[(i + k) % n];
  const ax = a.x - p.x;
  const ay = a.y - p.y;
  const bx = b.x - p.x;
  const by = b.y - p.y;
  const cos = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1);
  const deg = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  // 外へ尖る角だけ（反時計回りで左に曲がる）
  const turn = (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x);
  return turn > 0 ? deg : 180;
}
