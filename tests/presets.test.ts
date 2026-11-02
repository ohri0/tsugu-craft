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
