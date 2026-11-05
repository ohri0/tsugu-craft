// 道具から届いた「腕の断面の線」を確かめる。壊れた線は、分かる言葉で返す（形を作る前に止める）。
// 公開の Claude の窓口（api/claude.ts → src/claude/tools.ts）からも読むので、読み込みは .js までつける。
import { sampleCurve, uniformKnots, type P2 } from "./bspline.js";

/**
 * 受け付ける範囲（形を作るための決まり。職人の目安の数ではない）。
 * x は幅の位置（−1〜1 が幅いっぱい。線は点の内側を通るので、点は少し外に置いてよい）、y は高さ（0 が指の側、1 がいちばん厚い所。点は少し上に置いてよい）。
 * minInnerHeight：両はしの近くを除いて、線がこの高さ（いちばん高い所に対する割合）より下がると、腕が左右に分かれてしまう
 */
export const SECTION_INPUT = { minPoints: 5, maxPoints: 40, xMax: 1.3, yMax: 1.6, minInnerHeight: 0.12, endZone: 0.1, minSpan: 0.2 } as const;

function crosses(a: P2, b: P2, c: P2, d: P2): boolean {
  const d1 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d2 = (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x);
  const d3 = (d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x);
  const d4 = (d.x - c.x) * (b.y - c.y) - (d.y - c.y) * (b.x - c.x);
  return d1 * d2 < -1e-12 && d3 * d4 < -1e-12;
}

/** 断面の線の点が使えるか。使えなければ、直し方の分かる言葉。使えれば null */
export function sectionCurveProblem(points: unknown): string | null {
  if (!Array.isArray(points)) return "断面の線の点は {x, y} の並びで書いてください";
  const L = SECTION_INPUT;
  if (points.length < L.minPoints || points.length > L.maxPoints) return `断面の線の点は ${L.minPoints}〜${L.maxPoints} 個で書いてください（今は ${points.length} 個）`;
  for (const q of points as { x?: unknown; y?: unknown }[]) {
    if (typeof q !== "object" || q === null || typeof q.x !== "number" || typeof q.y !== "number" || !Number.isFinite(q.x) || !Number.isFinite(q.y)) return "断面の線の点は、どれも数の {x, y} で書いてください";
    if (Math.abs(q.x) > L.xMax) return `断面の線の点の x は −${L.xMax}〜${L.xMax} で書いてください（今は ${q.x}）`;
    if (q.y < 0 || q.y > L.yMax) return `断面の線の点の y は 0〜${L.yMax} で書いてください（今は ${q.y}。0 が指の側です）`;
  }
  const pts = points as P2[];
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first.y !== 0 || last.y !== 0) return "断面の線の最初と最後の点は、指の側の線の上（y ＝ 0）に置いてください";
  if (first.x <= last.x) return "断面の線は、右の端の内側（x が大きい方）から、上を通って、左の端の内側（x が小さい方）へ、順に書いてください";
  const line = sampleCurve(pts, uniformKnots(pts.length), 12).map((s) => s.p);
  const xs = line.map((p) => p.x);
  const span = Math.max(...xs) - Math.min(...xs);
  const peak = Math.max(...line.map((p) => p.y));
  if (span < L.minSpan) return "断面の線の幅がありません。点を左右に広げてください";
  if (peak < L.minSpan) return "断面の線の高さがありません。上の点を高くしてください";
  // 線の長さの割合で、両はしの近くを除いた所が、指の側まで下がっていないか
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y));
  const total = cum[cum.length - 1];
  for (let i = 0; i < line.length; i++) {
    const f = cum[i] / total;
    if (f > L.endZone && f < 1 - L.endZone && line[i].y < L.minInnerHeight * peak) return "断面の線が途中で指の側まで下がっていて、腕が左右に分かれます。真ん中の点を上げてください";
  }
  // 線が自分と交わると、形が裏返る
  for (let i = 0; i + 1 < line.length; i++) for (let j = i + 2; j + 1 < line.length; j++) if (crosses(line[i], line[i + 1], line[j], line[j + 1])) return "断面の線が自分と交わっています。点の順番を、右の端から左の端へ順に直してください";
  return null;
}
