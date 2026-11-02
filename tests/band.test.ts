import { describe, expect, it } from "vitest";
import { bandHowTo, bandInnerDiameter, bandMesh, checkBand, type Band } from "../src/studio/band";

const base: Band = { gou: 12, kind: "kouman", top: { width: 4, thickness: 1.6 }, bottom: { width: 4, thickness: 1.6 }, density: 15.5, metalLabel: "K18" };

describe("石のない指輪", () => {
  it("目安の内側なら、作れない所はない", () => {
    expect(checkBand(base)).toEqual([]);
  });
  it("薄い・細いと、作れない所に出て、直すと消える", () => {
    const thin: Band = { ...base, bottom: { width: 1.5, thickness: 1.0 } };
    const p = checkBand(thin);
    expect(p.map((x) => x.title)).toEqual(["腕が薄い", "幅が細い"]);
    let fixed = thin;
    for (const x of p) fixed = x.fix.apply(fixed);
    expect(checkBand(fixed)).toEqual([]);
  });
  it("形の重さは正で、厚いほど重い", () => {
    const a = bandMesh(base).weightG;
    const b = bandMesh({ ...base, top: { width: 4, thickness: 2.2 }, bottom: { width: 4, thickness: 2.2 } }).weightG;
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
  });
  it("手作りの材料の長さは（内径 ＋ 厚み）× π、太さを変えると「形を整える」が入る", () => {
    const steps = bandHowTo(base, "hand", 3);
    const len = (bandInnerDiameter(12) + 1.6) * Math.PI;
    expect(steps[0].specs.find((s) => s.label === "長さ")!.value).toContain(len.toFixed(1));
    expect(steps.some((s) => s.title === "形を整える")).toBe(false);
    const taper = bandHowTo({ ...base, bottom: { width: 2.5, thickness: 1.3 } }, "hand", 3);
    expect(taper.some((s) => s.title === "形を整える")).toBe(true);
    expect(bandHowTo(base, "cast", 3)[0].title).toBe("原型を作る");
  });
});
