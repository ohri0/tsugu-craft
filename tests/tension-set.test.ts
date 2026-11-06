// テンションの「戻りきらない分」（作者の声 2026-11-07「1 やって 1.5 に開いたら 1 に戻るんじゃなくて 1.2 とか」）と、それを見込んだ作り方・おすすめ。
import { describe, expect, it } from "vitest";
import realTriangle from "./fixtures/real-triangle-outline.json";
import { measureOutline } from "../src/geometry/measure";
import { buildRing } from "../src/geometry/ring";
import type { StoneParams } from "../src/geometry/stone";
import { adviceSpringOf, tensionDefaultDepths } from "../src/geometry/tension";
import { GUIDES, type Guides } from "../src/rules/guides";
import { addRule, effectiveGuides, seedLedger, type Ledger } from "../src/rules/ledger";
import { tensionSpring } from "../src/rules/tension-calc";
import { adviceLevers, adviceText, HOLD_WORDS, holdAdvice, holdForClaude, isAdvised, setSummary, tensionHoldSet } from "../src/rules/tension-hold";
import {
  adviceDepths,
  bandMassUpperG,
  compensateSet,
  curvedWireFactor,
  dropWorkNmm,
  elasticOpeningMm,
  frictionFactor,
  holdWork,
  maxSetRatio,
  permanentSetMm,
  needSqueezeMm,
  planAt,
  ringStiffnessNPerMm,
  setCurve,
  setRatioForShare,
  tensionAdvice,
} from "../src/rules/tension-set";
import { howToMake } from "../src/studio/howto";
import { DEFAULT_STATE, RingSession } from "../src/studio/session";

/** SV925・φ4・14 号（作者の本物の指輪）の限界：細い輪の式 L と、太い輪の分を見た S */
const R = 10.667;
const L = elasticOpeningMm(R, 4, 80, 465);
const S = L / curvedWireFactor(R, 4);

const tri = (): StoneParams => {
  const m = measureOutline({ outlinePx: realTriangle as { x: number; y: number }[], longMm: 8.88 });
  return { outlineMm: m.outlineMm, longMm: m.longMm, widthMm: m.widthMm, depthMm: 4.24 };
};
const authorRing = (grip: "short" | "side" | "corner", pit?: number, groove?: number) =>
  buildRing({ stone: tri(), setting: { style: "tension", culetGapMm: GUIDES.tension.culetGapMm }, shank: { gou: 14, metal: "sv925", section: "maru", widthMm: 4, thicknessMm: 4 }, tension: { grip, cornerPitMm: pit, edgeGrooveMm: groove } });
const holdOf = (ring: ReturnType<typeof authorRing>, g: Guides = GUIDES) => tensionHoldSet(tensionSpring(ring.setting, ring.shank, "hardened", g)!, ring.metalWeightG, "sv925", "sv925", g);
const adviceOf = (ring: ReturnType<typeof authorRing>, g: Guides = GUIDES) => holdAdvice(tensionSpring(ring.setting, ring.shank, "hardened", g)!, ring.setting.tension!.ends, adviceSpringOf("sv925", g), g, ring.metalWeightG);
const withRatio = (ratio: number): Guides => {
  const g = structuredClone(GUIDES) as unknown as { tension: { springSetRatio: number } };
  g.tension.springSetRatio = ratio;
  return g as unknown as Guides;
};

describe("戻りきらない分の線", () => {
  const c = setCurve(S, L, GUIDES.tension.springSetRatio);

  it("仮の値は guides の 1 か所（安全な限界まで広げると 5 % 残る）。残りはじめは、安全な限界の 約 8 割", () => {
    expect(GUIDES.tension.springSetRatio).toBe(0.05);
    expect(c.ratio).toBe(0.05);
    expect(permanentSetMm(S, c)).toBeCloseTo(0.05 * S, 9);
    expect(c.onsetMm / S).toBeGreaterThan(0.75);
    expect(c.onsetMm / S).toBeLessThan(0.85);
  });

  it("少し広げるだけなら残らない（残りはじめまで 0）", () => {
    for (let d = 0; d <= c.onsetMm; d += 0.01) expect(permanentSetMm(d, c)).toBe(0);
    expect(permanentSetMm(c.onsetMm + 0.01, c)).toBeGreaterThan(0);
  });

  it("広げるほど増える。増え方は広げた分を超えない（戻る分は減らない）", () => {
    let prev = 0;
    for (let d = 0; d <= 2.5; d += 0.005) {
      const p = permanentSetMm(d, c);
      expect(p).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(p - prev).toBeLessThanOrEqual(0.005 + 1e-9);
      prev = p;
    }
  });

  it("つながっている：残りはじめ・細い輪の式の限界の前後で飛ばない。限界からは、広げた分がすべて残る（傾き 1）", () => {
    const h = 1e-7;
    for (const at of [c.onsetMm, S, L]) expect(Math.abs(permanentSetMm(at + h, c) - permanentSetMm(at - h, c))).toBeLessThan(1e-6);
    const slope = (at: number) => (permanentSetMm(at + h, c) - permanentSetMm(at - h, c)) / (2 * h);
    expect(slope(L - 1e-4)).toBeCloseTo(1, 3);
    expect(slope(L + 0.1)).toBeCloseTo(1, 6);
    expect(permanentSetMm(L + 0.3, c) - permanentSetMm(L, c)).toBeCloseTo(0.3, 9);
  });

  it("割合が大きいほど早く残りはじめ、多く残る。表せる上限（S ÷ 2L）を超えた割合は上限にする", () => {
    const more = setCurve(S, L, 0.2);
    expect(more.onsetMm).toBeLessThan(c.onsetMm);
    for (const d of [1, 1.2, S, 1.5]) expect(permanentSetMm(d, more)).toBeGreaterThanOrEqual(permanentSetMm(d, c));
    expect(setCurve(S, L, 0.9).ratio).toBeCloseTo(maxSetRatio(S, L), 9);
    expect(setCurve(S, L, 0.9).onsetMm).toBe(0);
    expect(setCurve(S, L, 0).onsetMm).toBeCloseTo(S, 9);
  });

  it("職人の言い方（広げた分の何割が残るか）から割合を出し、戻すと同じ割合になる。作者の例「1 → 1.5 → 1.2」は、広げた分の 4 割", () => {
    const share = (1.2 - 1) / (1.5 - 1);
    expect(share).toBeCloseTo(0.4, 9);
    for (const spread of [1.2, S, 1.4]) {
      const r = setRatioForShare(0.1, spread, S, L)!;
      expect(permanentSetMm(spread, setCurve(S, L, r)) / spread).toBeCloseTo(0.1, 4);
    }
    // この輪で広げる量（約 1.3〜1.4 mm）で 4 割残るなら、割合はおよそ 0.38〜0.40
    expect(setRatioForShare(share, 1.33, S, L)!).toBeCloseTo(0.4, 1);
    // 1.2 mm しか広げないのに 4 割残る、はこの線では表せない（null）
    expect(setRatioForShare(share, 1.2, S, L)).toBeNull();
  });

  it("帳面で職人が変えられる（tension.springSetRatio）", () => {
    const ledger = addRule(seedLedger() as Ledger, { title: "戻りきらない分", text: "安全な限界まで広げると 1 割残る", param: "tension.springSetRatio", value: 0.1, source: { kind: "craftsman", name: "石川" }, date: "2026-11-07" } as never);
    expect(effectiveGuides(ledger).tension.springSetRatio).toBe(0.1);
  });
});

describe("戻りきらない分を見込んだ作り方", () => {
  const c = setCurve(S, L, GUIDES.tension.springSetRatio);

  it("繰り返しは落ち着き、残る締まりがちょうど要る量になる。広げる量は限界の内。少ない量なら、戻りきらない分を足すだけ", () => {
    for (let e = 0.6; e <= 1.3; e += 0.05)
      for (let target = 0; target <= 0.6; target += 0.05) {
        const p = compensateSet(e, target, c, S);
        if (!p) {
          // 届かないのは、安全な限界まで広げても残る締まりが足りないときだけ
          expect(planAt(e, Math.max(0, S - e), c).effectiveMm).toBeLessThan(target + 1e-9);
          continue;
        }
        expect(p.effectiveMm).toBeCloseTo(target, 8);
        expect(p.squeezeMm - p.setMm).toBeCloseTo(target, 8);
        expect(p.spreadMm).toBeLessThanOrEqual(S + 1e-9);
        expect(p.iterations).toBeLessThan(1100);
        if (e + target <= c.onsetMm) expect(p.squeezeMm).toBeCloseTo(target, 12);
        else expect(p.squeezeMm).toBeGreaterThan(target);
      }
  });

  it("限界ぎりぎりの答え（傾きが 1 に近い）も解ける", () => {
    const e = 0.8;
    const most = planAt(e, S - e, c).effectiveMm;
    const p = compensateSet(e, most - 1e-6, c, S)!;
    expect(p.effectiveMm).toBeCloseTo(most - 1e-6, 7);
    expect(compensateSet(e, most + 1e-3, c, S)).toBeNull();
  });

  it("腕が石に届かないとき（残る締まりが負）は、すき間の分だけ深さのかかりが減る", () => {
    expect(holdWork(80, 1, -0.2, 1).lock).toBeCloseTo((80 * 0.8 * 0.8) / 2, 9);
    expect(holdWork(80, 1, -0.2, 1).squeeze).toBe(0);
    expect(holdWork(80, 1, -1.5, 1).total).toBe(0);
  });
});

describe("作者の本物の指輪（SV925・φ4・14 号・三角・短い辺を溝に）", () => {
  it("くぼみ 0.4・溝 0.4（作者の新しい値）：前は「留まる見込み」。戻りきらない分を見込むと「ぎりぎり」", () => {
    const h = holdOf(authorRing("side", 0.4, 0.4)).now;
    expect(h.depthSumMm).toBeCloseTo(0.8, 9);
    expect(h.needSqueezeMm).toBeCloseTo(0.525, 2);
    // 前の計算：要る量 0.525 ≤ 安全に縮められる量 0.541 で留まる見込みだった
    expect(h.needSqueezeMm).toBeLessThan(h.safeSqueezeMm);
    // 今：安全な限界まで広げると 約 0.067 mm 戻りきらず、残せる締まりは 約 0.474 mm。要る量に届かない
    expect(h.safeEffectiveMm).toBeCloseTo(0.474, 2);
    expect(h.verdict).toBe("tight");
    expect(h.spreadMm).toBeCloseTo(S, 2);
    expect(h.setMm).toBeCloseTo(0.067, 2);
    expect(h.effectiveSqueezeMm).toBeCloseTo(0.474, 2);
    expect(h.margin).toBeCloseTo(0.94, 2);
    // 見込まずに要る量だけ縮めて作ると：広げる 1.325 mm、約 0.06 mm 戻りきらず、残る締まり 約 0.47 mm（0.94 倍）
    expect(h.naive!.spreadMm).toBeCloseTo(1.325, 2);
    expect(h.naive!.setMm).toBeCloseTo(0.059, 2);
    expect(h.naive!.margin).toBeLessThan(1);
  });

  it("くぼみ 0.4・溝 0.3：前も今も「ぎりぎり」。戻りきらない分で、残る締まりがさらに減る", () => {
    const h = holdOf(authorRing("side", 0.4, 0.3)).now;
    expect(h.verdict).toBe("tight");
    expect(h.needSqueezeMm).toBeCloseTo(0.707, 2);
    expect(h.safeEffectiveMm).toBeCloseTo(0.574, 2);
    expect(h.naive!.setMm).toBeCloseTo(0.107, 2);
    expect(h.naive!.effectiveSqueezeMm).toBeCloseTo(0.6, 2);
  });

  it("おすすめ：くぼみ 0.65・溝 0.6 mm、広げる量 約 1.30 mm（戻りきらない分 約 0.05 mm を見込む）。留まる見込み", () => {
    const r = authorRing("side", 0.4, 0.4);
    const a = adviceOf(r);
    expect(a.ok).toBe(true);
    expect([a.pitMm, a.grooveMm]).toEqual([0.65, 0.6]);
    expect(a.spreadMm).toBeCloseTo(1.295, 2);
    expect(a.setMm).toBeCloseTo(0.045, 2);
    expect(a.makeGapMm!).toBeCloseTo(r.setting.tension!.spanMm - 1.25 - a.squeezeMm, 9);
    expect(a.noSet).toBe(false);
    expect(a.spreadMm).toBeLessThanOrEqual(a.safeMm);
    expect(a.margin).toBeGreaterThanOrEqual(1);
    // その深さで作ると、外れにくさの計算も留まる見込み。作る時の開きも同じ
    const at = holdOf(authorRing("side", 0.65, 0.6)).now;
    expect(at.verdict).toBe("hold");
    expect(at.makeGapMm).toBeCloseTo(a.makeGapMm!, 3);
    expect(adviceText(a)).toBe(`おすすめ：くぼみ 0.65 mm・溝 0.60 mm、作る時の開き ${a.makeGapMm!.toFixed(2)} mm、広げる量 ${a.spreadMm.toFixed(2)} mm（戻りきらない分 約 ${a.setMm.toFixed(2)} mm を見込む）`);
  });

  it("おすすめは、広げる量がいちばん少ない組。ほかの組はどれも、届かないか、同じかもっと広げる。どの端も「0.3 mm くらいでは絶対抜ける」より深い", () => {
    const r = authorRing("side", 0.4, 0.4);
    const t = tensionSpring(r.setting, r.shank)!;
    const best = tensionAdvice({ radiusMm: t.radiusMm, wireMm: 4, ...adviceSpringOf("sv925"), kinds: ["pit", "groove"] });
    const g = GUIDES.tension;
    const lim = elasticOpeningMm(t.radiusMm, 4, 80, 465);
    const safe = lim / curvedWireFactor(t.radiusMm, 4);
    const c = setCurve(safe, lim, g.springSetRatio);
    const k = ringStiffnessNPerMm(t.radiusMm, 4, 80);
    const eta = frictionFactor(g.holdWallDeg, g.holdFriction);
    const demand = dropWorkNmm(bandMassUpperG(t.radiusMm, 4, GUIDES.metals.sv925.densityGPerCm3), g.holdDropMm);
    const depths = adviceDepths();
    expect(Math.min(...depths)).toBeGreaterThan(g.weakGrooveMm);
    expect(Math.max(...depths)).toBeCloseTo(g.adviceDepthMaxMm, 9);
    let found = 0;
    for (const pit of depths)
      for (const groove of depths) {
        const p = compensateSet(pit + groove, needSqueezeMm(pit + groove, demand, k, eta), c, safe);
        if (!p) continue;
        found++;
        expect(p.spreadMm).toBeGreaterThanOrEqual(best.spreadMm - 1e-9);
      }
    expect(found).toBeGreaterThan(0);
  });

  it("作者の例（広げた分の 4 割が残る）で計算すると：どの深さでも留まる見込みにならない。手（線を太く・硬く・深く）を出す", () => {
    const g = withRatio(0.4);
    const h = holdOf(authorRing("side", 0.4, 0.4), g).now;
    expect(h.curve.onsetMm).toBeLessThan(0.1);
    expect(h.naive!.setMm).toBeCloseTo(0.52, 1);
    expect(h.naive!.effectiveSqueezeMm).toBeLessThan(0.01);
    expect(h.margin).toBeLessThan(0.5);
    const a = adviceOf(authorRing("side", 0.4, 0.4), g);
    expect(a.ok).toBe(false);
    const t = tensionSpring(authorRing("side", 0.4, 0.4).setting, authorRing("side", 0.4, 0.4).shank, "hardened", g)!;
    const levers = adviceLevers(t, [{ kind: "pit" }, { kind: "groove" }], adviceSpringOf("sv925", g), g);
    expect(levers.join("\n")).toMatch(/線を太く/);
    expect(levers.join("\n")).toMatch(/硬く/);
    expect(levers.join("\n")).toMatch(/深く彫る/);
  });
});

describe("深さの既定（作者 2026-11-07：前の 0.8・0.5 は「適当に言ってるだけ。気にしなくていい。忘れてもいい」）", () => {
  it("三角の短い辺を溝に（side）は職人の値。ほかは、戻りきらない分を見込んだおすすめ（仮）で、形の既定と同じ", () => {
    const shank = { gou: 14, thicknessMm: 4, metal: "sv925" as const };
    const side = tensionDefaultDepths(shank, tri(), "side");
    expect(side.from).toBe("craftsman");
    expect([side.pitMm, side.grooveMm]).toEqual([GUIDES.tension.shortSidePitMm, GUIDES.tension.shortSideGrooveMm]);
    const short = tensionDefaultDepths(shank, tri(), "short");
    expect(short.from).toBe("advice");
    expect([short.pitMm, short.grooveMm]).toEqual([0.65, 0.6]);
    expect(authorRing("short").setting.tension!.ends.map((e) => e.depthMm)).toEqual([0.65, 0.6]);
    expect(holdOf(authorRing("short")).now.verdict).toBe("hold");
    // 前の値は guides に残るが、既定には使わない
    expect(GUIDES.tension.cornerPitMm).toBe(0.8);
  });

  it("設計の場：おすすめにする → 今の深さがおすすめと同じ。既定に戻すと、side は職人の値", () => {
    const s = new RingSession(tri(), () => seedLedger() as Ledger, () => undefined, () => "");
    s.state = { ...DEFAULT_STATE, gou: 14, metal: "sv925" };
    s.setSetting({ style: "tension", tension_grip: "side", reason: "作者の向き" });
    s.setTensionDepths(0.4, 0.4);
    const b = s.built!;
    const table = tensionSpring(b.ring.setting, b.ring.shank, "hardened", s.guides())!;
    const a = holdAdvice(table, b.ring.setting.tension!.ends, s.tensionSpringOf(), s.guides(), b.ring.metalWeightG);
    expect(isAdvised(b.ring.setting.tension!.ends, a)).toBe(false);
    s.setTensionDepths(a.pitMm ?? undefined, a.grooveMm ?? undefined, "おすすめ");
    expect(isAdvised(s.built!.ring.setting.tension!.ends, a)).toBe(true);
    const c = s.check().tension_calc!.hold!;
    expect(c.verdict).toBe("留まる見込み");
    expect(c.advice!.found).toBe(true);
    expect(c.advice!.pit_mm).toBe(0.65);
    expect(c.plan.stays_open_mm).toBeGreaterThan(0);
    s.setTensionDepths(undefined, undefined);
    expect(s.built!.ring.setting.tension!.ends.map((e) => e.depthMm)).toEqual([GUIDES.tension.shortSidePitMm, GUIDES.tension.shortSideGrooveMm]);
    // ほかの向きの既定は、帳面の値（戻りきらない割合など）で出し直す
    s.setSetting({ tension_grip: "short", reason: "比べる" });
    expect(s.built!.ring.setting.tension!.ends.map((e) => e.depthMm)).toEqual([0.65, 0.6]);
  });
});

describe("画面・作り方・Claude の言葉", () => {
  it("言葉はやさしく、1 か所に（作者の頼みの言い方）", () => {
    expect(HOLD_WORDS.set).toBe("広げたあと、戻りきらずに開いたまま残る量");
    expect(HOLD_WORDS.makeWithSet).toBe("戻りきらない分を見込んだ、作る時の開き");
    expect(HOLD_WORDS.advice).toBe("おすすめ");
    const h = holdOf(authorRing("side", 0.4, 0.4)).now;
    const line = setSummary(h);
    expect(line).toContain(`${HOLD_WORDS.set} 約 ${h.setMm.toFixed(2)} mm（仮）`);
    expect(line).toContain(`${HOLD_WORDS.makeWithSet} 約 ${h.makeGapMm.toFixed(2)} mm`);
  });

  it("作り方の「開きを縮める」に、戻りきらない分を見込んだ作る時の開きが出る。深さの出どころ（職人の値・おすすめ）も", () => {
    const r = authorRing("side", 0.65, 0.6);
    const steps = howToMake({ ring: r, outlineMm: tri().outlineMm, longMm: 8.88, widthMm: 7.52, depthMm: 4.24, metalLabel: "SV925", springMetal: "sv925" }, "hand");
    const close = steps.find((s) => s.id === "tension_close")!;
    const spec = close.specs.find((x) => x.label === HOLD_WORDS.makeWithSet)!;
    const h = holdOf(r).now;
    expect(spec.value).toContain(`${h.makeGapMm.toFixed(2)} mm`);
    expect(spec.value).toContain(HOLD_WORDS.set);
    expect(spec.value).toContain("職人が決める");
    const cut = steps.find((s) => s.id === "tension_cut")!;
    expect(JSON.stringify(cut.specs)).toContain("おすすめ");
    const own = howToMake({ ring: authorRing("side", 0.4, 0.45), outlineMm: tri().outlineMm, longMm: 8.88, widthMm: 7.52, depthMm: 4.24, metalLabel: "SV925", springMetal: "sv925" }, "hand");
    expect(JSON.stringify(own.find((s) => s.id === "tension_cut")!.specs)).toContain("選んだ深さ");
  });

  it("Claude が読む形に、戻りきらない分・見込んだ作り方・おすすめが入る", () => {
    const r = authorRing("side", 0.4, 0.4);
    const c = holdForClaude(holdOf(r), adviceOf(r));
    expect(c.verdict).toBe("ぎりぎり・職人が確かめる");
    expect(c.set_ratio).toBe(0.05);
    expect(c.plan.stays_open_mm).toBeCloseTo(0.07, 2);
    expect(c.without_set_allowance!.stays_open_mm).toBeCloseTo(0.06, 2);
    expect(c.advice!.text).toContain("おすすめ：くぼみ 0.65 mm・溝 0.60 mm");
    expect(c.note).toContain("tension.springSetRatio");
  });
});
