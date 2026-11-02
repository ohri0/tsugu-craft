// 輪郭を外へ（または内へ）一定の距離だけずらす。覆輪の内側（縁 ＋ 0.04 mm）や外側（＋ 壁の厚み）に使う。
import { resample, signedArea, toCounterClockwise, type Point } from "./polygon";

/**
 * 反時計回りの閉じた輪の、各点の外向きの法線（長さ 1）。両隣の点を結ぶ向きの右手が外。
 * 型紙（offsetOutline）と 3D の石座（setting.ts）が同じ向きにずらすよう、ここ 1 か所で決める。
 */
export function outwardNormals(pts: readonly Point[]): Point[] {
  const n = pts.length;
  return pts.map((_, i) => {
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const l = Math.hypot(tx, ty) || 1;
    return { x: ty / l, y: -tx / l };
  });
}

/**
 * 反時計回りにそろえ、細かく取り直してから、各点を外向きの法線の方向へ d だけ動かす。
 * 石の縁はほぼ凸なので、この方法で十分。へこんだ所で線が交差しないよう、点は細かく取る。
 */
export function offsetOutline(outline: readonly Point[], d: number, samples = 360): Point[] {
  const pts = resample(toCounterClockwise(outline), samples);
  const normals = outwardNormals(pts);
  const out = pts.map((p, i) => ({ x: p.x + normals[i].x * d, y: p.y + normals[i].y * d }));
  return signedArea(out) > 0 ? out : out.reverse();
}
