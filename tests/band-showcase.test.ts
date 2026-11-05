// 入口のページの見本の指輪：アプリの断面の編集で作った形が、閉じていて、作れる形で、同じ数字で開けること
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openEdges } from "../src/cad/solid";
import { sectionCurveProblem } from "../src/geometry/section-input";
import showcase from "../src/lp/band-showcase.json" with { type: "json" };
import { bandMesh, checkBand, normalizeBand, type Band } from "../src/studio/band";

const shapes = showcase.shapes as unknown as { id: string; name: string; caption: string; cut?: string; camera: object; band: Band }[];

describe("地金のみの指輪の見せ場", () => {
  it("3〜4 本あり、アプリの断面の編集で作った形と書いてある", () => {
    expect(shapes.length).toBeGreaterThanOrEqual(3);
    expect(shapes.length).toBeLessThanOrEqual(4);
    expect(showcase.source).toContain("アプリの断面の編集");
    expect(new Set(shapes.map((s) => s.id)).size).toBe(shapes.length);
  });
  it.each(shapes.map((s) => [s.id, s] as const))("%s：閉じていて、作れる形（薄すぎない・尖りすぎない・溝の底が薄くない）", (_id, s) => {
    const b = normalizeBand(s.band);
    expect(b.kind).toBe("free");
    expect(sectionCurveProblem(s.band.curve!.points)).toBeNull();
    if (s.band.bottomCurve) expect(sectionCurveProblem(s.band.bottomCurve.points)).toBeNull();
    expect(checkBand(b).map((p) => p.check)).toEqual([]);
    const m = bandMesh(b);
    expect(openEdges(m.positions)).toBe(0);
    expect(m.weightG).toBeGreaterThan(1);
    expect(m.positions.length / 9).toBeLessThan(200000);
  });
  it("撮影の道具と画面が、同じ数字を読む", () => {
    expect(readFileSync("scripts/lp-shots.cjs", "utf8")).toContain("band-showcase.json");
    expect(readFileSync("src/studio/main.ts", "utf8")).toContain("band-showcase.json");
  });
});
