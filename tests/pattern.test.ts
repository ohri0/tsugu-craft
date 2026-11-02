import { describe, expect, it } from "vitest";
import { measureOutline } from "../src/geometry/measure";
import { offsetOutline } from "../src/geometry/offset";
import { extent, perimeter, signedArea } from "../src/geometry/polygon";
import { patternSvg, toSheet } from "../src/pattern/sheet";
import { ellipse, regular, triangle } from "./helpers/synth";

describe("輪郭をずらす", () => {
  it("円を 0.5 mm 外へ → 半径 ＋ 0.5", () => {
    const o = offsetOutline(ellipse(0, 0, 4, 4, 400), 0.5);
    expect(perimeter(o) / (2 * Math.PI)).toBeCloseTo(4.5, 2);
  });
  it("三角を 0.04 mm 外へ → 長辺も幅も少しだけ大きく", () => {
    const t = triangle(0, 0, 8.88, 7.52);
    const e0 = extent(t);
    const e1 = extent(offsetOutline(t, 0.04));
    expect(e1.width - e0.width).toBeGreaterThan(0.07);
    expect(e1.width - e0.width).toBeLessThan(0.09);
  });
  it("時計回りの入力でも外へ", () => {
    const sq = regular(0, 0, 3, 4).reverse();
    expect(Math.abs(signedArea(offsetOutline(sq, 0.5)))).toBeGreaterThan(Math.abs(signedArea(sq)));
  });
});

describe("原寸の型紙", () => {
  // 画像座標（y 下向き）の、左右非対称な三角
  const px = triangle(500, 400, 888, 752, 0.7);
  const m = measureOutline({ outlinePx: px, longMm: 8.88 });
  it("上から見た写真と同じ向き（鏡写しにしない）", () => {
    const onSheet = toSheet(m.outlineMm, 0, 0);
    // 回すだけなら、y 下向きの座標どうしで回り方の向きが同じ
    expect(Math.sign(signedArea(onSheet))).toBe(Math.sign(signedArea(px)));
  });
  it("A4 を mm でそのまま描く", () => {
    const svg = patternSvg({ ...m, depthMm: 4.35, shapeName: "三角" });
    expect(svg).toContain('width="210mm"');
    expect(svg).toContain('viewBox="0 0 210 297"');
    expect(svg).toContain("10 mm");
    expect(svg).toContain("50 mm");
    expect(svg).toContain("目安・最後は職人が決める");
  });
  it("原寸の輪郭は、長辺 8.88 mm のまま", () => {
    const e = extent(toSheet(m.outlineMm, 62, 105));
    expect(e.long).toBeCloseTo(8.88, 6);
  });
});
