import { describe, expect, it } from "vitest";
import { innerDiameterMm, minProngMm, standardProngMm, stoneSizeMm } from "../src/rules/guides";

describe("職人の目安の式", () => {
  it("1ct（約 6.5 mm）の爪の最低は 1.0 mm、標準は 1.15 mm", () => {
    expect(minProngMm(6.5)).toBeCloseTo(1.0, 6);
    expect(standardProngMm(6.5)).toBeCloseTo(1.15, 6);
  });

  it("石の大きさは長辺と幅の平均", () => {
    expect(stoneSizeMm(8.88, 7.52)).toBeCloseTo(8.2, 6);
  });

  it("号数から内径：1 号 13.0 mm、10 号 16.0 mm", () => {
    expect(innerDiameterMm(1)).toBeCloseTo(13.0, 6);
    expect(innerDiameterMm(10)).toBeCloseTo(16.0, 6);
  });
});
