import { describe, expect, it } from "vitest";
import { DEFAULT_SIM, colorsShown, layerAt, patternAmount, topView } from "../src/rebuild/sim";

describe("模様の模型：重ねる → 彫る → 平らにする", () => {
  const n = 80;
  it("重ねただけでは、一番上の層の色しか出ない", () => {
    const v = topView(DEFAULT_SIM, n, "stack");
    expect(patternAmount(v, n)).toBe(0);
    expect(colorsShown(v, DEFAULT_SIM)).toBe(1);
  });
  it("彫って平らにすると、いくつもの層の色が輪になって出る", () => {
    const v = topView(DEFAULT_SIM, n, "flat");
    expect(patternAmount(v, n)).toBeGreaterThan(0.05);
    expect(colorsShown(v, DEFAULT_SIM)).toBeGreaterThanOrEqual(3);
  });
  it("層が 1 色なら、彫っても模様の色は 1 つ", () => {
    const p = { ...DEFAULT_SIM, palette: ["#b4643f"] };
    expect(colorsShown(topView(p, n, "flat"), p)).toBe(1);
  });
  it("彫らなければ（くぼみ 0）、平らにしても模様は出ない（層のゆらぎだけでは一番上の層のまま）", () => {
    const p = { ...DEFAULT_SIM, pits: 0 };
    expect(colorsShown(topView(p, n, "flat"), p)).toBe(1);
  });
  it("同じたねなら同じ模様", () => {
    expect(topView(DEFAULT_SIM, 40, "flat")).toEqual(topView(DEFAULT_SIM, 40, "flat"));
  });
  it("層の番号は 0〜層の数−1", () => {
    expect(layerAt(0, 10)).toBe(0);
    expect(layerAt(0.999, 10)).toBe(9);
    expect(layerAt(1.5, 10)).toBe(9);
  });
});
