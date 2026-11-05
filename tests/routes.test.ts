// 画面のアドレス：前の名前（#see など）で来ても、新しい場所に送る。
import { describe, expect, it } from "vitest";
import { redirectHash } from "../src/app/routes";

describe("前の画面の名前を、新しい場所へ送る", () => {
  it("学ぶ・残す・組み立て直すの前の名前", () => {
    expect(redirectHash("#see")).toBe("#learn/hands");
    expect(redirectHash("#ask")).toBe("#learn");
    expect(redirectHash("#keep")).toBe("#ledger");
    expect(redirectHash("#rebuild")).toBe("#waza/rebuild");
  });
  it("魚々子は外したので、技の一覧へ。指輪の石留めは技の頁のまま", () => {
    expect(redirectHash("#waza/nanako")).toBe("#waza");
    expect(redirectHash("#waza/nanako?gap=x")).toBe("#waza");
    expect(redirectHash("#waza/ring")).toBeNull();
    expect(redirectHash("#waza/ring?gap=abc")).toBeNull();
  });
  it("今の場所は、そのまま", () => {
    for (const h of ["", "#ledger", "#learn", "#learn/hands", "#waza", "#waza/ring", "#waza/mokume", "#waza/rebuild", "#waza/restore", "#waza/restore/r1"]) expect(redirectHash(h)).toBeNull();
  });
});
