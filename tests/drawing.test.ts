import { describe, expect, it } from "vitest";
import { drawingPage, pickScale } from "../src/studio/drawing";

describe("図面", () => {
  it("紙に収まるいちばん大きな尺度を選ぶ", () => {
    expect(pickScale([{ widthMm: 25, heightMm: 28 }, { widthMm: 10, heightMm: 28 }, { widthMm: 14, heightMm: 14 }])).toBe(4);
    expect(pickScale([{ widthMm: 200, heightMm: 30 }])).toBe(1);
  });
  it("図ごとに画像と寸法、表題欄に尺度と単位", () => {
    const html = drawingPage({
      title: "甲丸の指輪",
      date: "2026-11-02",
      pxPerMm: 40,
      problems: [],
      rows: [{ label: "号・内径", value: "12 号" }],
      views: [{ name: "正面図", url: "data:,", widthMm: 24, heightMm: 24, widthPx: 960, heightPx: 960, project: (x, y) => ({ x: x * 40, y: y * 40 }), dims: [{ a: [0, 0, 0], b: [10, 0, 0], label: "内径 ø16.7" }] }],
    });
    expect(html).toContain("正面図");
    expect(html).toContain("内径 ø16.7");
    expect(html).toContain("尺度");
    expect(html).toContain("mm");
  });
});
