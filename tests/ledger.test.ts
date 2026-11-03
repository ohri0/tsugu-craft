import { describe, expect, it } from "vitest";
import { buildRing } from "../src/geometry/ring";
import { checkRing } from "../src/rules/checks";
import { GUIDES } from "../src/rules/guides";
import { activeRules, addRule, effectiveGuides, ledgerText, parseSizeSteps, removeLastRule, ruleForCheck, seedLedger, valueFor } from "../src/rules/ledger";
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

describe("石の大きさで変わる決まり", () => {
  const steps = parseSizeSteps("4:0.6, 6:0.8, 8:1.0, 1.2")!;
  it("「大きさ:値」の並びを読む（最後はそれより大きい石）", () => {
    expect(steps).toEqual([
      { upToMm: 4, value: 0.6 },
      { upToMm: 6, value: 0.8 },
      { upToMm: 8, value: 1.0 },
      { upToMm: null, value: 1.2 },
    ]);
    expect(parseSizeSteps("4-0.6")).toBeUndefined();
  });
  it("石の大きさに合う段の値を使う", () => {
    expect(valueFor({ bySize: steps }, 3)).toBe(0.6);
    expect(valueFor({ bySize: steps }, 6)).toBe(0.8);
    expect(valueFor({ bySize: steps }, 7.5)).toBe(1.0);
    expect(valueFor({ bySize: steps }, 12)).toBe(1.2);
  });
  it("職人の爪の太さの段で、確かめが変わる（大きさ約 7.9 mm の石に 1.3 mm 以上と決めると、式では足りる 1.2 mm の爪が問題になる）", () => {
    const strict = parseSizeSteps("4:0.6, 6:0.8, 8:1.3, 1.5")!;
    const l = addRule(seedLedger(), {
      title: "爪の太さ（石の大きさで）",
      text: "爪の太さは石の大きさで決める",
      reason: "小さい石に太い爪は重く、大きい石に細い爪は弱い",
      param: "prong.minDiameterMm",
      bySize: strict,
      source: { kind: "craftsman", name: "作者" },
      date: "2026-11-03",
    });
    const r = buildRing({ stone: triangleStone(), setting: { style: "prong", prongDiameterMm: 1.2 }, shank: { gou: 11 } });
    const size = (r.params.stone.longMm + r.params.stone.widthMm) / 2;
    expect(size).toBeGreaterThan(6);
    expect(size).toBeLessThanOrEqual(8);
    expect(checkRing(r).filter((p) => p.check === "prong-thin")).toHaveLength(0);
    const ps = checkRing(r, { guides: effectiveGuides(l, size) }).filter((p) => p.check === "prong-thin");
    expect(ps.length).toBeGreaterThan(0);
    expect(ps[0].requiredValue).toBe(1.3);
    expect(ruleForCheck(l, "prong-thin")?.title).toBe("爪の太さ（石の大きさで）");
    expect(ledgerText(l)).toContain("石の大きさ 4 mm まで 0.6mm");
  });
});

describe("職人の爪の最低の太さ", () => {
  it("決まりがあると、標準の爪はその値 × 倍率になり、石の大きさで値が変わる", async () => {
    const { RingSession } = await import("../src/studio/session");
    const { stoneFrom } = await import("./helpers/stones");
    const { triangle } = await import("./helpers/synth");
    const { addRule, seedLedger } = await import("../src/rules/ledger");
    const { GUIDES } = await import("../src/rules/guides");
    const led = addRule(seedLedger(), { title: "爪", text: "爪", reason: "落ちる", param: "prong.minDiameterMm", value: 0.7, bySize: [{ upToMm: 3, value: 0.6 }, { upToMm: null, value: 0.7 }], source: { kind: "craftsman", name: "石川" }, date: "2026-11-03" });
    const big = new RingSession(stoneFrom(triangle(200, 200, 160, 140), 8.88, 4.24), () => led, () => undefined, () => "").build("x");
    expect(big.ring.setting.standardProngMm).toBeCloseTo(0.7 * GUIDES.prong.standardFactor, 5);
    expect(big.ring.setting.prongs[0].diameterMm).toBeCloseTo(0.7 * GUIDES.prong.standardFactor, 5);
    const small = new RingSession(stoneFrom(triangle(200, 200, 160, 140), 2.5, 1.5), () => led, () => undefined, () => "").build("x");
    expect(small.ring.setting.standardProngMm).toBeCloseTo(0.6 * GUIDES.prong.standardFactor, 5);
  });
});

describe("石の大きさで割合で変わる決まり（点をまっすぐつなぐ）", () => {
  it("点の間はまっすぐ、端の外は同じ傾きで伸ばす", () => {
    const r = { bySize: [{ upToMm: 2.5, value: 0.6 }, { upToMm: 8.2, value: 0.7 }], bySizeLine: true };
    expect(valueFor(r, 2.5)).toBeCloseTo(0.6, 5);
    expect(valueFor(r, 8.2)).toBeCloseTo(0.7, 5);
    expect(valueFor(r, 5.35)).toBeCloseTo(0.65, 3);
    expect(valueFor(r, 13.9)).toBeCloseTo(0.8, 3);
    expect(valueFor(r, 1.5)).toBeLessThan(0.6);
  });
  it("下限があれば、小さい石でもそれより細くしない（作者：メレでも 0.6 mm）", () => {
    const r = { bySize: [{ upToMm: 2.5, value: 0.6 }, { upToMm: 8.2, value: 0.7 }], bySizeLine: true, bySizeFloor: 0.6 };
    expect(valueFor(r, 1.5)).toBeCloseTo(0.6, 5);
    expect(valueFor(r, 1.0)).toBeCloseTo(0.6, 5);
    expect(valueFor(r, 8.2)).toBeCloseTo(0.7, 5);
  });
});
