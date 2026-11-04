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
  it("指輪の聞き取りは帳面へ。聞く所（gap）はそのまま", () => {
    expect(redirectHash("#waza/ring")).toBe("#ledger");
    expect(redirectHash("#waza/ring?gap=abc")).toBe("#ledger?gap=abc");
  });
  it("今の場所は、そのまま", () => {
    for (const h of ["", "#ledger", "#learn", "#learn/hands", "#waza", "#waza/nanako", "#waza/nanako?gap=x", "#waza/rebuild"]) expect(redirectHash(h)).toBeNull();
  });
});
