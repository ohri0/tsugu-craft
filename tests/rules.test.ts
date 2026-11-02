import { describe, expect, it } from "vitest";
import { innerDiameterMm, minProngMm, standardProngMm, stoneSizeMm } from "../src/rules/guides";

describe("職人の目安の式", () => {
  it("1ct（約 6.4 mm）の爪の最低は 1.0 mm、標準は 1.15 mm", () => {
    expect(minProngMm(6.4)).toBeCloseTo(1.0, 6);
    expect(standardProngMm(6.4)).toBeCloseTo(1.15, 6);
  });

  it("爪の最低の太さは、公開情報の点をまっすぐつないだ線", () => {
    expect(minProngMm(2.5)).toBeCloseTo(0.45, 6);
    expect(minProngMm(1.5)).toBeCloseTo(0.45, 6); // メレより小さくても 0.45 mm
    expect(minProngMm(4.0)).toBeCloseTo(0.6, 6);
    expect(minProngMm(5.2)).toBeCloseTo(0.8, 6); // 4.0 と 6.4 のちょうど間
    expect(minProngMm(8.0)).toBeCloseTo(1.2, 6);
    expect(minProngMm(9.6)).toBeCloseTo(1.4, 6); // 最後の傾きのまま
    // 大きいほど太い（どこでも）
    for (let s = 1; s < 12; s += 0.25) expect(minProngMm(s + 0.25)).toBeGreaterThanOrEqual(minProngMm(s));
  });

  it("石の大きさは長辺と幅の平均", () => {
    expect(stoneSizeMm(8.88, 7.52)).toBeCloseTo(8.2, 6);
  });

  it("号数から内径：1 号 13.0 mm、10 号 16.0 mm", () => {
    expect(innerDiameterMm(1)).toBeCloseTo(13.0, 6);
    expect(innerDiameterMm(10)).toBeCloseTo(16.0, 6);
  });
});
