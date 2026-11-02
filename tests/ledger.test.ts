import { describe, expect, it } from "vitest";
import { buildRing } from "../src/geometry/ring";
import { checkRing } from "../src/rules/checks";
import { GUIDES } from "../src/rules/guides";
import { activeRules, addRule, effectiveGuides, ledgerText, removeLastRule, ruleForCheck, seedLedger } from "../src/rules/ledger";
import { triangleStone } from "./helpers/stones";

const ring = () => buildRing({ stone: triangleStone(), setting: { style: "prong", height: "standard" }, shank: { gou: 11 } });

describe("目安帳", () => {
  it("出発点の値は guides.ts と同じ（数字は 1 か所）", () => {
    const g = effectiveGuides(seedLedger());
    expect(g.prong.cornerReachMm).toBe(GUIDES.prong.cornerReachMm);
    expect(g.height.minFingerGapMm).toBe(GUIDES.height.minFingerGapMm);
  });

  it("職人の決まりを足すと、同じ値の古い決まりを置き換え、履歴には残る", () => {
    const l = addRule(seedLedger(), {
      title: "石の先はもっと離す",
      text: "手をよく使うお客さまには、石の一番下を指から 1.0 mm 以上離す",
      reason: "高さが低いと、ぶつけたときに石の先が指に当たる",
      param: "height.minFingerGapMm",
      value: 1.0,
      source: { kind: "craftsman", name: "作者" },
      date: "2026-11-03",
    });
    expect(l.rules).toHaveLength(seedLedger().rules.length + 1);
    expect(activeRules(l).filter((r) => r.param === "height.minFingerGapMm")).toHaveLength(1);
    expect(effectiveGuides(l).height.minFingerGapMm).toBe(1.0);
    expect(ruleForCheck(l, "finger-gap")?.source).toEqual({ kind: "craftsman", name: "作者" });
  });

  it("職人の決まりで、確かめの結果が変わる（すき間 1.0 mm 以上にすると、低めの覆輪は問題になる）", () => {
    const low = buildRing({ stone: triangleStone(), setting: { style: "bezel", height: "low" }, shank: { gou: 11 } });
    expect(checkRing(low).some((p) => p.check === "finger-gap")).toBe(false);
    const l = addRule(seedLedger(), {
      title: "石の先はもっと離す",
      text: "石の一番下を指から 1.0 mm 以上離す",
      reason: "ぶつけたとき",
      param: "height.minFingerGapMm",
      value: 1.0,
      source: { kind: "craftsman", name: "作者" },
      date: "2026-11-03",
    });
    const p = checkRing(low, { guides: effectiveGuides(l) }).find((q) => q.check === "finger-gap");
    expect(p?.requiredValue).toBe(1.0);
  });

  it("最後に足した決まりを外すと、元の決まりに戻る", () => {
    const seed = seedLedger();
    const l = removeLastRule(addRule(seed, { title: "x", text: "x", reason: "x", param: "prong.cornerReachMm", value: 0.5, source: { kind: "craftsman", name: "作者" }, date: "2026-11-03" }));
    expect(effectiveGuides(l).prong.cornerReachMm).toBe(GUIDES.prong.cornerReachMm);
  });

  it("言葉だけの決まりも残り、Claude に渡す文章に名前と理由が入る", () => {
    const l = addRule(seedLedger(), {
      title: "鋳造の爪の根元",
      text: "鋳造で作るなら、爪の根元は細くしすぎない",
      reason: "地金が流れきらず、爪が欠ける",
      source: { kind: "craftsman", name: "作者" },
      date: "2026-11-03",
    });
    const text = ledgerText(l);
    expect(text).toContain("鋳造の爪の根元");
    expect(text).toContain("職人：作者");
    expect(text).toContain("地金が流れきらず");
    expect(effectiveGuides(l)).toEqual(effectiveGuides(seedLedger()));
  });

  it("確かめは、目安帳を渡さなければ今までと同じ", () => {
    expect(checkRing(ring())).toEqual(checkRing(ring(), { guides: effectiveGuides(seedLedger()) }));
  });
});
