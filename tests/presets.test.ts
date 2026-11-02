import { describe, expect, it } from "vitest";
import { PRESETS, presetOutline } from "../src/studio/presets";
import { signedArea } from "../src/geometry/polygon";

describe("よくある石の形", () => {
  it("どの形も、長辺と幅の大きさに収まり、反時計回り", () => {
    for (const p of PRESETS) {
      const o = presetOutline(p);
      const xs = o.map((q) => q.x);
      const ys = o.map((q) => q.y);
      expect(Math.max(...xs) - Math.min(...xs), p.id).toBeCloseTo(p.longMm, 1);
      expect(Math.max(...ys) - Math.min(...ys), p.id).toBeCloseTo(p.widthMm, 1);
      expect(signedArea(o), p.id).toBeGreaterThan(0);
    }
  });
});

import { measureOutline } from "../src/geometry/measure";
describe("四角い石の長さ × 幅", () => {
  it("四角い石は、対角ではなく辺の長さで測る", () => {
    const sq = presetOutline(PRESETS.find((p) => p.id === "emerald")!).map((q) => ({ x: 100 + q.x * 20, y: 100 - q.y * 20 }));
    const m = measureOutline({ outlinePx: sq, longMm: 8 });
    expect(m.widthMm).toBeCloseTo(6, 1);
  });
});
