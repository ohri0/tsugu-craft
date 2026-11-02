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
  const angles = new Array<number>(n);
  for (let i = 0; i < n; i++) {
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
    angles[i] = turn > 0 ? deg : 180;
  }
  const minSep = Math.max(1, Math.round(n * opts.minSeparationRatio));
  const order = [...angles.keys()].filter((i) => angles[i] < opts.maxInteriorDeg).sort((i, j) => angles[i] - angles[j]);
  const picked: number[] = [];
  for (const i of order) {
    if (picked.every((j) => Math.min(Math.abs(i - j), n - Math.abs(i - j)) >= minSep)) picked.push(i);
  }
  picked.sort((i, j) => i - j);
  return picked.map((i) => ({ point: pts[i], angleDeg: angles[i], t: i / n }));
}
