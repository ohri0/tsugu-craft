import { describe, expect, it } from "vitest";
import { holdPlain, ruleApplies } from "../src/rules/rule-quote";
import type { Rule } from "../src/rules/ledger";

const corner = { title: "三角の石を 3 本爪で留めるとき", param: "hold.cornerSet", value: 1, checks: ["hold"], quote: "大丈夫", source: { kind: "craftsman", name: "石川" }, date: "2026-11-03", id: "rule-corner-set-ishikawa" } as unknown as Rule;
const thin = { title: "爪の太さ", param: "prong.minDiameterMm", value: 0.7, checks: ["prong-thin"], source: { kind: "craftsman", name: "石川" }, date: "2026-11-03", id: "x" } as unknown as Rule;

describe("作れない所に添える職人の言葉", () => {
  it("三角の石の 3 本爪の決まりは、角に 1 本ずつの爪のときだけ添える", () => {
    expect(ruleApplies(corner, { cornerSet: false })).toBe(false);
    expect(ruleApplies(corner, { cornerSet: true })).toBe(true);
  });
  it("ほかの決まりは、そのまま添える", () => {
    expect(ruleApplies(thin, { cornerSet: false })).toBe(true);
  });
  it("石を押さえる力の比べを、ふつうの言葉で言う", () => {
    const t = holdPlain(0.29, 1);
    expect(t).toContain("約 29 %");
    expect(t).toContain("標準と同じ（1.00 倍）以上");
  });
});
