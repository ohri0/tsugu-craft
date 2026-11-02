// 輪郭を外へ（または内へ）一定の距離だけずらす。覆輪の内側（縁 ＋ 0.04 mm）や外側（＋ 壁の厚み）に使う。
import { resample, signedArea, toCounterClockwise, type Point } from "./polygon";

/**
 * 反時計回りにそろえ、細かく取り直してから、各点を外向きの法線の方向へ d だけ動かす。
 * 石の縁はほぼ凸なので、この方法で十分。へこんだ所で線が交差しないよう、点は細かく取る。
 */
export function offsetOutline(outline: readonly Point[], d: number, samples = 360): Point[] {
  const pts = resample(toCounterClockwise(outline), samples);
  const n = pts.length;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    // 反時計回りなら、進む向きの右手が外
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const l = Math.hypot(tx, ty) || 1;
    out.push({ x: pts[i].x + (ty / l) * d, y: pts[i].y - (tx / l) * d });
  }
  return signedArea(out) > 0 ? out : out.reverse();
}
