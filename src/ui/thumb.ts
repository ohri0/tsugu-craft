// 案のカードの小さな絵（上から見た図）。本当の石の輪郭と、本当に組んだ爪の位置から描く。
import { centroid, type Point } from "../geometry/polygon";
import type { RingDesign } from "../geometry/ring";

const METAL_FILL: Record<string, [string, string]> = {
  k18y: ["#d9b25f", "#a5822f"],
  pt900: ["#cfd0d4", "#8d8f95"],
  sv925: ["#dcdde0", "#9a9ca2"],
};

export function planThumb(ring: RingDesign, stoneFill = "#f2c7d3"): string {
  const rot = ring.transform.rotationZ;
  const c0 = Math.cos(rot);
  const s0 = Math.sin(rot);
  // 指の向き（x）を縦に描く：画面の上が指先
  const view = (p: Point) => {
    const x = p.x * c0 - p.y * s0;
    const y = p.x * s0 + p.y * c0;
    return { x: y, y: -x };
  };
  const outline = ring.params.stone.outlineMm.map(view);
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.3;
  const k = 56 / size;
  const c = centroid(outline);
  const tx = (p: Point) => [32 + (p.x - c.x) * k, 32 + (p.y - c.y) * k] as const;
  const pts = (arr: Point[]) => arr.map((p) => tx(p).map((v) => v.toFixed(1)).join(",")).join(" ");
  const [fill, stroke] = METAL_FILL[ring.metal] ?? METAL_FILL.k18y;
  let svg = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="27" y="0" width="10" height="64" rx="3" fill="${fill}" opacity="0.45"/>`;
  const bezel = ring.setting.bezel;
  if (bezel) svg += `<polygon points="${pts(bezel.outerOutline.map(view))}" fill="${fill}" stroke="${stroke}" stroke-width="0.8"/>`;
  svg += `<polygon points="${pts(outline)}" fill="${stoneFill}" stroke="#7d4a5a" stroke-width="0.8"/>`;
  for (const pr of ring.setting.prongs) {
    for (const lp of pr.legPoints) {
      const [x, y] = tx(view(lp));
      svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${Math.max(1.6, (pr.diameterMm / 2) * k).toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="0.6"/>`;
    }
  }
  return svg + "</svg>";
}
