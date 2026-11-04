// 長辺・深さの欄に何でも入らないこと（2026-11-05 点検：−5 mm で「作れます」、100 mm で約 52 秒止まった）
import { describe, expect, it } from "vitest";
import { STONE_LONG_RANGE, fitStoneDepth, fitStoneLong } from "../src/studio/session";
import { presentHtml } from "../src/studio/present";

describe("長辺の欄", () => {
  it("範囲の中はそのまま", () => {
    expect(fitStoneLong(8.88, 5)).toEqual({ mm: 8.88, fixed: false });
    expect(fitStoneLong(STONE_LONG_RANGE.min, 5)).toEqual({ mm: STONE_LONG_RANGE.min, fixed: false });
    expect(fitStoneLong(STONE_LONG_RANGE.max, 5)).toEqual({ mm: STONE_LONG_RANGE.max, fixed: false });
  });
  it("外れたら、範囲の端に収める", () => {
    expect(fitStoneLong(100, 5)).toEqual({ mm: STONE_LONG_RANGE.max, fixed: true });
    expect(fitStoneLong(0.5, 5)).toEqual({ mm: STONE_LONG_RANGE.min, fixed: true });
    expect(fitStoneLong(-5, 5)).toEqual({ mm: STONE_LONG_RANGE.min, fixed: true });
  });
  it("空や数でなければ、今の値のまま", () => {
    expect(fitStoneLong(0, 5)).toEqual({ mm: 5, fixed: false });
    expect(fitStoneLong(Number.NaN, 5)).toEqual({ mm: 5, fixed: false });
  });
});

describe("深さの欄", () => {
  it("0 以下は今の値のまま、大きすぎれば上限に", () => {
    expect(fitStoneDepth(4.2, 3)).toEqual({ mm: 4.2, fixed: false });
    expect(fitStoneDepth(-1, 3)).toEqual({ mm: 3, fixed: true });
    expect(fitStoneDepth(0, 3)).toEqual({ mm: 3, fixed: false });
    expect(fitStoneDepth(100, 3)).toEqual({ mm: STONE_LONG_RANGE.max, fixed: true });
  });
});

describe("見せる", () => {
  it("石のない指輪には、石と爪の項目を出さない", () => {
    const html = presentHtml({ shank: "甲丸", metal: "K18", gou: "12 号", verdict: { ok: true, text: "作れます" } }, [{ key: "section", label: "腕の断面", options: [{ v: "kouman", label: "甲丸" }], on: "kouman" }], "stone");
    expect(html).not.toContain(">石<");
    expect(html).not.toContain(">爪<");
    expect(html).toContain(">腕<");
    // 選んでいた欄が石のない指輪にないときは、はじめの欄を出す
    expect(html).toContain('data-g="section"');
    expect(html).toContain('aria-selected="true"');
  });
});
