import { describe, expect, it } from "vitest";
import { findCorners } from "../src/geometry/corners";
import { measureOutline } from "../src/geometry/measure";
import { convexHull, extent, perimeter, resample, signedArea } from "../src/geometry/polygon";
import { nameShape } from "../src/geometry/shape";
import { buildStone, meshVolume, stoneHeights } from "../src/geometry/stone";
import { readFileSync } from "node:fs";
import type { Point } from "../src/geometry/polygon";
import { ellipse, regular, rounded, triangle } from "./helpers/synth";

/** 作者が撮った三角の石の拡大写真から取った輪郭（px）。2026-11-02 */
const realTriangle = JSON.parse(readFileSync(new URL("./fixtures/real-triangle-outline.json", import.meta.url), "utf8")) as Point[];

describe("多角形の基本", () => {
  const sq = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }];
  it("面積と周", () => {
    expect(signedArea(sq)).toBeCloseTo(2);
    expect(perimeter(sq)).toBeCloseTo(6);
  });
  it("凸包は内側の点を除く", () => {
    expect(convexHull([...sq, { x: 1, y: 0.5 }])).toHaveLength(4);
  });
  it("長辺はいちばん離れた 2 点、幅はそれに直角", () => {
    const t = triangle(0, 0, 8.88, 7.52);
    const e = extent(t);
    expect(e.long).toBeCloseTo(Math.max(8.88, Math.hypot(8.88 / 2 + 0.888, 7.52)), 6);
    const r = extent(sq);
    expect(r.long).toBeCloseTo(Math.hypot(2, 1));
  });
  it("等間隔に取り直す", () => {
    const pts = resample(sq, 60);
    expect(pts).toHaveLength(60);
    expect(perimeter(pts)).toBeCloseTo(6, 1);
  });
});

describe("尖った角を探す", () => {
  it("三角は 3 か所", () => expect(findCorners(triangle(0, 0, 9, 7.5))).toHaveLength(3));
  it("角を少し丸めた三角も 3 か所", () => expect(findCorners(rounded(triangle(0, 0, 9, 7.5), 0.4))).toHaveLength(3));
  it("角を大きく丸めた三角も 3 か所", () => expect(findCorners(rounded(triangle(0, 0, 9, 7.5), 1.0))).toHaveLength(3));
  it("本物の三角の石の写真（丸い角が 1 つある）も 3 か所", () => expect(findCorners(realTriangle)).toHaveLength(3));
  it("八角形（エメラルドカット風）の角は尖った角にしない", () => expect(findCorners(regular(0, 0, 5, 8))).toHaveLength(0));
  it("四角は 4 か所", () => expect(findCorners(regular(0, 0, 5, 4, 0.3))).toHaveLength(4));
  it("六角は 6 か所", () => expect(findCorners(regular(0, 0, 5, 6))).toHaveLength(6));
  it("丸と楕円は 0", () => {
    expect(findCorners(ellipse(0, 0, 5, 5))).toHaveLength(0);
    expect(findCorners(ellipse(0, 0, 7.5, 5))).toHaveLength(0);
    expect(findCorners(ellipse(0, 0, 10, 5))).toHaveLength(0);
  });
  it("角が丸くても、言う内角は本当の角に近い（丸み 0.4 mm の正三角形）", () => {
    const c = findCorners(rounded(regular(0, 0, 5, 3), 0.4));
    for (const k of c) expect(Math.abs(k.angleDeg - 60)).toBeLessThan(12);
  });
  it("内角はおよそ合う（正三角形で 60°前後）", () => {
    const c = findCorners(regular(0, 0, 5, 3));
    for (const k of c) expect(k.angleDeg).toBeGreaterThan(50), expect(k.angleDeg).toBeLessThan(75);
  });
});

describe("長辺だけで実寸に直す", () => {
  // 画像座標（y 下向き）で、長辺 888 px・高さ 752 px の三角
  const px = triangle(500, 400, 888, 752, 0.4);
  const truthLongPx = extent(px).long;
  const truthWidthPx = extent(px).width;
  it("長辺を入れると、幅は写真の比率から", () => {
    const m = measureOutline({ outlinePx: px, longMm: 8.88 });
    expect(m.longMm).toBe(8.88);
    expect(m.widthMm).toBeCloseTo((truthWidthPx / truthLongPx) * 8.88, 6);
    expect(m.widthFromPhoto).toBe(true);
    const e = extent(m.outlineMm);
    expect(e.long).toBeCloseTo(8.88, 6);
    expect(Math.abs(Math.sin(e.angle))).toBeLessThan(1e-6); // 長辺が x 軸に
    expect(signedArea(m.outlineMm)).toBeGreaterThan(0);
  });
  it("幅を測ったら上書き", () => {
    const m = measureOutline({ outlinePx: px, longMm: 8.88, widthMm: 7.6 });
    expect(m.widthMm).toBeCloseTo(7.6, 6);
    expect(m.widthFromPhoto).toBe(false);
  });
});

describe("形の呼び名", () => {
  it("三角", () => {
    const t = triangle(0, 0, 9, 7.5);
    expect(nameShape(t, findCorners(t)).name).toContain("トリリアント");
  });
  it("丸と楕円", () => {
    const c = ellipse(0, 0, 5, 5);
    expect(nameShape(c, findCorners(c)).name).toContain("ラウンド");
    const o = ellipse(0, 0, 6.5, 5);
    expect(nameShape(o, findCorners(o)).name).toContain("オーバル");
  });
});

describe("石の 3D", () => {
  const outlineMm = measureOutline({ outlinePx: triangle(0, 0, 888, 752), longMm: 8.88 }).outlineMm;
  const params = { outlineMm, longMm: 8.88, widthMm: 7.52, depthMm: 4.35 };
  it("深さは上側 3：下側 7（縁の厚みを除いて）", () => {
    const h = stoneHeights(params);
    expect(h.girdleMm).toBeCloseTo(0.02 * 8.2, 6);
    expect(h.tableZ - h.culetZ).toBeCloseTo(4.35, 6);
    expect(h.crownMm / (h.crownMm + h.pavilionMm)).toBeCloseTo(0.3, 6);
  });
  it("閉じた形で、面の向きがそろっている（体積が正）", () => {
    const m = buildStone(params);
    expect(meshVolume(m.positions)).toBeGreaterThan(0);
  });
  it("外形の大きさが長辺・深さと合う", () => {
    const { positions } = buildStone(params);
    let [x0, x1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      x0 = Math.min(x0, positions[i]);
      x1 = Math.max(x1, positions[i]);
      z0 = Math.min(z0, positions[i + 2]);
      z1 = Math.max(z1, positions[i + 2]);
    }
    expect(x1 - x0).toBeGreaterThan(8.88 * 0.97);
    expect(x1 - x0).toBeLessThanOrEqual(8.88 + 1e-4);
    expect(z1 - z0).toBeCloseTo(4.35, 4);
  });
  it("同じ入力なら同じ形", () => {
    expect(buildStone(params).positions).toEqual(buildStone(params).positions);
  });
});
