// テンションの外れにくさ（浅く留めたいとき）：深さのかかり ＋ 詰めた分 ＋ 摩擦 と、落としたときの勢いを比べる（作者の頼み 2026-11-07）。
import { describe, expect, it } from "vitest";
import realTriangle from "./fixtures/real-triangle-outline.json";
import { measureOutline } from "../src/geometry/measure";
import { buildRing } from "../src/geometry/ring";
import type { StoneParams } from "../src/geometry/stone";
import { elasticOpeningMm, tensionNotes } from "../src/rules/checks";
import { GUIDES, type Guides } from "../src/rules/guides";
import repo from "../ledger/jewelry.json";
import { activeRules, addRule, effectiveGuides, seedLedger, type Ledger } from "../src/rules/ledger";
import { tensionSpring } from "../src/rules/tension-calc";
import { dropWorkNmm, frictionFactor, HOLD_WORDS, holdForClaude, holdSummary, holdWork, ringStiffnessNPerMm, tensionHold, tensionHoldSet, type HoldInput } from "../src/rules/tension-hold";
import { howToMake } from "../src/studio/howto";
import { DEFAULT_STATE, RingSession } from "../src/studio/session";
import { freshenRules } from "../src/ui/ledger-ui";

/** 写真から読んだ既定の三角（8.88 × 4.24 mm） */
const tri = (): StoneParams => {
  const m = measureOutline({ outlinePx: realTriangle as { x: number; y: number }[], longMm: 8.88 });
  return { outlineMm: m.outlineMm, longMm: m.longMm, widthMm: m.widthMm, depthMm: 4.24 };
};
/** 作者の本物の指輪：SV925・φ4 の丸線・14 号（作者が作った向きは side：短い辺を溝に・反対の角をくぼみに） */
const authorRing = (grip: "short" | "side" | "corner", pit?: number, groove?: number) =>
  buildRing({
    stone: tri(),
    setting: { style: "tension", culetGapMm: GUIDES.tension.culetGapMm },
    shank: { gou: 14, metal: "sv925", section: "maru", widthMm: 4, thicknessMm: 4 },
    tension: { grip, cornerPitMm: pit, edgeGrooveMm: groove },
  });
const holdOf = (ring: ReturnType<typeof authorRing>, g: Guides = GUIDES) => tensionHoldSet(tensionSpring(ring.setting, ring.shank, "hardened", g)!, ring.metalWeightG, "sv925", "sv925", g);

/** 作者の指輪に近い、形を作らない入力（SV925・φ4・14 号） */
const sv: HoldInput = {
  spanMm: 7.52,
  radiusMm: 8.667 + 2,
  wireMm: 4,
  massG: 8.2,
  spring: { name: "SV925", youngGpa: 80, limitMm: elasticOpeningMm(10.667, 4, 80, 465), factor: 1.16, provisional: true },
  depthSumMm: 1.3,
};

describe("外れにくさの式", () => {
  it("ばねの硬さは、開ける量の式と同じ細い輪の式：限界まで開く力 × 背中の腕の長さ 2R ＝ 耐力 × 断面係数", () => {
    const k = ringStiffnessNPerMm(10.667, 4, 80);
    const limit = elasticOpeningMm(10.667, 4, 80, 465);
    expect(k * limit * 2 * 10.667).toBeCloseTo(465 * ((Math.PI * 4 ** 3) / 32), 6);
    // 太さの 4 乗で硬くなる
    expect(ringStiffnessNPerMm(10.667, 5, 80) / ringStiffnessNPerMm(10.667, 4, 80)).toBeCloseTo((5 / 4) ** 4, 9);
  });

  it("内わけ：深さのかかり ＝ k e² ÷ 2、詰めた分 ＝ k e s、摩擦は全体に η − 1 をかけた分。深さが 0 なら、いくら詰めても 0", () => {
    const w = holdWork(80, 1, 0.5, 1.2);
    expect(w.lock).toBeCloseTo(40, 9);
    expect(w.squeeze).toBeCloseTo(40, 9);
    expect(w.friction).toBeCloseTo(16, 9);
    expect(w.total).toBeCloseTo(96, 9);
    expect(holdWork(80, 0, 5, 1.2).total).toBe(0);
  });

  it("摩擦の割合：摩擦 0 なら 1、45° の壁なら（1 ＋ μ）÷（1 − μ）。壁が摩擦より寝ていれば押しても出ない", () => {
    expect(frictionFactor(45, 0)).toBeCloseTo(1, 9);
    expect(frictionFactor(45, 0.1)).toBeCloseTo(1.1 / 0.9, 9);
    expect(frictionFactor(5, 0.2)).toBe(Infinity);
  });

  it("落としたときの勢い ＝ 重さ × 重力 × 高さ（8.2 g を 1 m で 約 80 N·mm）", () => {
    expect(dropWorkNmm(8.2, 1000)).toBeCloseTo(80.4, 1);
  });

  it("浅いほど、留めるのに要る詰める量が増える（深さを 0.05 mm ずつ浅くして、いつも増える）", () => {
    let prev = -Infinity;
    for (let e = 1.6; e >= 0.2 - 1e-9; e -= 0.05) {
      const h = tensionHold({ ...sv, depthSumMm: e });
      expect(h.needSqueezeMm).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = h.needSqueezeMm;
    }
    expect(tensionHold({ ...sv, depthSumMm: 0 }).needSqueezeMm).toBe(Infinity);
  });

  it("答えの 3 つ：戻りきらない分を引いて、安全な限界の内で要る量が残れば留まる見込み、前の計算（戻りきらない分なし・細い輪の式の上限）の内ならぎりぎり、超えれば足りない", () => {
    for (let e = 0.2; e <= 1.6; e += 0.05) {
      const h = tensionHold({ ...sv, depthSumMm: e });
      const want = h.needSqueezeMm <= h.safeEffectiveMm + 1e-9 ? "hold" : h.needSqueezeMm <= h.limitSqueezeMm + 1e-9 ? "tight" : "short";
      expect(h.verdict).toBe(want);
      // 詰められる量は、広げて入れる量（深さ ＋ 詰める量）が限界に届くまで。残せる締まりは、そこから戻りきらない分を引いた量
      const safe = sv.spring.limitMm / sv.spring.factor;
      expect(h.safeSqueezeMm + e).toBeCloseTo(safe, 9);
      expect(h.limitSqueezeMm + e).toBeCloseTo(sv.spring.limitMm, 9);
      expect(h.safeEffectiveMm).toBeCloseTo(h.safeSqueezeMm - GUIDES.tension.springSetRatio * safe, 9);
      // 残る締まり ＝ 縮める量 − 戻りきらない分。作る時の開き ＝ 図面の開き − 縮める量
      expect(h.effectiveSqueezeMm).toBeCloseTo(h.squeezeMm - h.setMm, 9);
      expect(h.makeGapMm).toBeCloseTo(sv.spanMm - e - h.squeezeMm, 9);
      expect(h.spreadMm).toBeCloseTo(e + h.squeezeMm, 9);
      if (h.verdict === "hold") {
        // 戻りきらない分を見込んで縮めると、ちょうど要る量が残り、求める分に届く。広げる量は安全な限界の内
        expect(h.effectiveSqueezeMm).toBeCloseTo(h.needSqueezeMm, 6);
        expect(h.margin).toBeGreaterThanOrEqual(1 - 1e-6);
        expect(h.spreadMm).toBeLessThanOrEqual(safe + 1e-9);
        // 見込まずに要る量だけ縮めると、戻りきらない分だけ締まりが減る
        if (h.naive!.setMm > 1e-6) expect(h.naive!.margin).toBeLessThan(1);
      } else if (h.verdict === "short") expect(h.margin).toBeLessThan(1);
    }
  });

  it("いちばん浅い深さ：その深さで、限界まで詰めると、ちょうど求める分になる。それより浅いと足りない・ぎりぎり、深いと留まる見込み", () => {
    const h = tensionHold(sv);
    const min = h.minDepthSumMm!;
    const safe = sv.spring.limitMm / sv.spring.factor;
    const at = tensionHold({ ...sv, depthSumMm: min }, GUIDES, safe - min);
    expect(at.margin).toBeCloseTo(1, 6);
    expect(tensionHold({ ...sv, depthSumMm: min - 0.02 }).verdict).not.toBe("hold");
    expect(tensionHold({ ...sv, depthSumMm: min + 0.02 }).verdict).toBe("hold");
    expect(h.minDepthSumTightMm!).toBeLessThan(min);
    // 地金がとても弱ければ、どの深さでも足りない
    expect(tensionHold({ ...sv, spring: { ...sv.spring, limitMm: 0.3 } }).minDepthSumMm).toBeNull();
  });

  it("落とす高さを高くすると、要る量が増える。職人が帳面で変えられる（仮の値の置き場は GUIDES.tension の 1 か所）", () => {
    expect(GUIDES.tension.holdDropMm).toBe(1000);
    expect(GUIDES.tension.holdFriction).toBe(0.1);
    const ledger = addRule(seedLedger() as Ledger, { title: "落としても外れない高さ", text: "2 m から落としても外れない", param: "tension.holdDropMm", value: 2000, source: { kind: "craftsman", name: "石川" }, date: "2026-11-07" } as never);
    const g = effectiveGuides(ledger);
    expect(g.tension.holdDropMm).toBe(2000);
    const e = 0.8;
    expect(tensionHold({ ...sv, depthSumMm: e }, g).needSqueezeMm).toBeGreaterThan(tensionHold({ ...sv, depthSumMm: e }).needSqueezeMm);
    expect(tensionHold({ ...sv, depthSumMm: e }, g).demandNmm).toBeCloseTo(2 * tensionHold({ ...sv, depthSumMm: e }).demandNmm, 9);
  });
});

describe("作者の本物の指輪（SV925・φ4・14 号・三角）", () => {
  it("前の深さ（くぼみ 0.8・溝 0.5。作者「適当に言ってるだけ」）：広げる量 1.3 mm だけで戻りきらない分が出て、安全な限界まで縮めても締まりが残らない。ぎりぎり・職人が確かめる", () => {
    const r = authorRing("short", 0.8, 0.5);
    const set = holdOf(r);
    expect(set.now.depthSumMm).toBeCloseTo(1.3, 6);
    // 前は「留まる見込み」（深さだけで足りる）。今は、安全な限界まで広げると 約 0.07 mm 開いたまま残り、石との間にすき間
    expect(set.now.needSqueezeMm).toBe(0);
    expect(set.now.safeEffectiveMm).toBeLessThan(0);
    expect(set.now.verdict).toBe("tight");
    const app = set.atAppSqueeze!;
    expect(app.squeezeMm).toBeCloseTo(0.04, 1);
    expect(app.setMm).toBeCloseTo(GUIDES.tension.springSetRatio * (1.3 + app.squeezeMm), 6);
    expect(app.effectiveSqueezeMm).toBeLessThan(0);
    expect(app.work.squeeze).toBe(0);
  });

  it("浅くすると：くぼみ 0.5・溝 0.3 は、戻りきらない分を見込むとぎりぎり（前は留まる見込み）、くぼみ 0.3・溝 0.2 はシルバーでは足りない", () => {
    expect(holdOf(authorRing("short", 0.5, 0.3)).now.verdict).toBe("tight");
    const shallow = holdOf(authorRing("short", 0.3, 0.2));
    expect(shallow.now.verdict).toBe("short");
    // 足りないときは、ほかの手を出す（地金ごと・線を太く）
    expect(shallow.options.map((o) => o.id)).toEqual(expect.arrayContaining(["metal:k18y", "metal:pt900", "wire:4.5"]));
  });

  it("作者が作った指輪（短い辺を溝に・反対の角をくぼみに。角のくぼみ 0.4・辺の溝 0.4 mm）は既定の深さで、前は留まる見込み（やっと）、戻りきらない分を見込むとぎりぎり。帳面に職人の言葉がある", () => {
    const r = authorRing("side");
    const i = r.setting.tension!;
    expect(i.ends.map((e) => [e.kind, e.depthMm])).toEqual([["pit", GUIDES.tension.shortSidePitMm], ["groove", GUIDES.tension.shortSideGrooveMm]]);
    expect(i.ends.map((e) => e.depthMm)).toEqual([0.4, 0.4]);
    const set = holdOf(r);
    expect(set.now.depthSumMm).toBeCloseTo(0.8, 6);
    // 前の計算（100 % 戻る）：要る量（約 0.53）が、安全に縮められる量（約 0.54）にやっと収まり「留まる見込み」だった。限界（細い輪の式）は約 0.76
    expect(set.now.needSqueezeMm).toBeCloseTo(0.525, 2);
    expect(set.now.safeSqueezeMm).toBeCloseTo(0.54, 2);
    expect(set.now.limitSqueezeMm).toBeCloseTo(0.76, 2);
    expect(set.now.safeSqueezeMm - set.now.needSqueezeMm).toBeLessThan(0.03);
    // 戻りきらない分（仮）を入れると、安全な限界まで広げて 約 0.07 mm 開いたまま残り、残せる締まりは 約 0.47 mm。安全な目安では要る量に届かない
    expect(set.now.safeEffectiveMm).toBeCloseTo(0.474, 2);
    // 限界（約 1.56 mm）まで広げれば届く：「留まる見込み（広げる量は安全な目安をこえる）」。札の見出しは作り方そのもの（前は「ぎりぎり・職人が確かめる」→「ぎりぎり入れれば、留まる見込み」。2026-11-08 作者の声）
    expect(set.now.verdict).toBe("tight");
    // 図面の開き ＝ 角から短い辺までの長さ − 0.8 mm（約 7.66）。限界いっぱいまで広げる作り方で、石より 約 0.76 mm 狭く、作る時の開き 約 6.90
    expect(set.now.gapMm).toBeCloseTo(i.spanMm - 0.8, 6);
    expect(set.now.makeGapMm).toBeCloseTo(i.gapMm - set.now.squeezeMm, 6);
    expect(set.now.squeezeMm).toBeCloseTo(set.now.limitSqueezeMm, 6);
    expect(set.now.makeGapMm).toBeCloseTo(6.9, 2);
    expect(set.now.spreadMm).toBeCloseTo(0.8 + set.now.squeezeMm, 6);
    // 広げて入れる量は、広げられる限界（約 1.56）いっぱい。そこまで広げると 約 0.23 mm 戻りきらない（仮）
    expect(set.now.spreadMm).toBeCloseTo(tensionSpring(r.setting, r.shank)!.rows.find((x) => x.metal === "sv925")!.limitMm, 6);
    expect(set.now.setMm).toBeCloseTo(0.234, 2);
    // 太い輪の分の限界まで縮めても、戻りきらない分を引くと、求める分の 約 0.94 倍（前は 約 1.02 倍）。縮めた分が半分ほどを受け持つ
    const app = set.atAppSqueeze!;
    expect(app.squeezeMm).toBeCloseTo(set.now.safeSqueezeMm, 6);
    expect(app.margin).toBeGreaterThan(0.9);
    expect(app.margin).toBeLessThan(1);
    expect(app.work.squeeze / app.work.total).toBeGreaterThan(0.4);
    // 同じ日に聞いた前の深さ：はじめの「くぼみも溝も 0.5」は留まる見込み、2 度目の「角のくぼみ 0.4、辺の溝 0.3」はぎりぎり
    expect(holdOf(authorRing("side", 0.5, 0.5)).now.verdict).toBe("hold");
    expect(holdOf(authorRing("side", 0.4, 0.3)).now.verdict).toBe("tight");
    const rule = activeRules(repo as unknown as Ledger).find((x) => x.id === "rule-tension-side-ishikawa")!;
    expect(rule.source).toEqual({ kind: "craftsman", name: "石川" });
    expect(rule.date).toBe("2026-11-07");
    expect(rule.quote).toBe("角を 1 個入れて、辺を 1 個溝に落とした（実際に作った指輪。角のくぼみ 0.4、辺の溝 0.4 ぐらい）");
    expect(rule.title).toContain("短い辺を溝に");
    expect(rule.text).toContain("角のくぼみ 0.4 mm・辺の溝 0.4 mm");
    expect(rule.text).not.toContain("0.3");
    expect(rule.text).not.toContain("両はしの角");
    expect(rule.calc).toBe("tension");
    // 聞きちがえた前の決まり（長い辺の両はしの角）は帳面から外した
    expect(activeRules(repo as unknown as Ledger).find((x) => x.id === "rule-tension-long-ishikawa")).toBeUndefined();
    expect((repo as { retired: string[] }).retired).toContain("rule-tension-long-ishikawa");
  });

  it("作者の向き（短い辺を溝に）で深さを変えると：0.8 ＋ 0.5 は深さだけで足りるが、広げるだけで戻りきらない分が出てぎりぎり、0.3 ＋ 0.3 もぎりぎり", () => {
    const deep = holdOf(authorRing("side", 0.8, 0.5)).now;
    expect(deep.verdict).toBe("tight");
    expect(deep.needSqueezeMm).toBe(0);
    expect(deep.safeEffectiveMm).toBeLessThan(0);
    const shallow = holdOf(authorRing("side", 0.3, 0.3)).now;
    expect(shallow.verdict).toBe("tight");
    expect(shallow.needSqueezeMm).toBeGreaterThan(shallow.safeSqueezeMm);
    expect(shallow.needSqueezeMm).toBeLessThanOrEqual(shallow.limitSqueezeMm);
  });

  it("作者の向きで、くぼみ 0.4 のまま溝 0.2 → 0.4：戻りきらない分を見込むと、作者の指輪の 0.4 / 0.4（和 0.8）までぎりぎりが続く。くぼみ 0.2 → 0.4（溝 0.3）は足りない → ぎりぎり", () => {
    const v = (pit: number, groove: number) => holdOf(authorRing("side", pit, groove)).now.verdict;
    expect([0.2, 0.25, 0.3, 0.35, 0.4].map((g) => v(0.4, g))).toEqual(["tight", "tight", "tight", "tight", "tight"]);
    expect([0.2, 0.25, 0.3, 0.35, 0.4].map((p) => v(p, 0.3))).toEqual(["short", "short", "tight", "tight", "tight"]);
    // 和 0.8 は、前は留まる見込み。戻りきらない分を見込むと、ぎりぎり。和 0.9 から留まる見込み（仮の値で）
    expect(v(0.45, 0.35)).toBe("tight");
    expect(v(0.4, 0.4)).toBe("tight");
    expect(v(0.5, 0.45)).toBe("hold");
  });

  it("このブラウザに前の文（くぼみも溝も 0.5／角のくぼみ 0.4・辺の溝 0.3）のまま残った決まりは、今の文（0.4 / 0.4）になる", () => {
    const rules = activeRules(repo as unknown as Ledger);
    const side = rules.find((x) => x.id === "rule-tension-side-ishikawa")!;
    const before = [
      "三角の石の短い辺を片はしの溝に落とし、反対の角をもう片はしのくぼみに入れるときは、くぼみも溝も 0.5 mm くらい。実際に作った指輪（シルバー 925・φ4 の丸線・14 号・8.88 mm の三角）の値。深さは石によって変わる",
      "三角の石の短い辺を片はしの溝に落とし、反対の角をもう片はしのくぼみに入れるときは、角のくぼみ 0.4 mm・辺の溝 0.3 mm くらい（見た感じ）。実際に作った指輪（シルバー 925・φ4 の丸線・14 号・8.88 mm の三角）の値。深さは石によって変わる",
    ];
    for (const text of before) {
      const fresh = freshenRules([{ ...side, text, quote: "前の言葉" }], rules)[0];
      expect(fresh.text).toBe(side.text);
      expect(fresh.quote).toBe(side.quote);
    }
  });

  it("浅い溝の注意「0.3 mm くらいでは絶対抜ける」は出さない（作者の判断 2026-11-07：絶対そうとは限らない。当たり前のことだから、消していい）", () => {
    for (const groove of [0.1, 0.2, 0.3]) {
      const r = authorRing("side", 0.4, groove);
      expect(tensionNotes(r.setting, r.shank.thicknessMm).join(" ")).not.toMatch(/抜ける/);
    }
    expect("weakGrooveMm" in GUIDES.tension).toBe(false);
  });

  it("分かりにくかった言葉を言いかえた（作者の声 2026-11-07）：答えの文に「詰める」「太い輪」「細い輪の式」を出さない", () => {
    const text = holdSummary(holdOf(authorRing("side")).now, "SV925");
    expect(text).toContain(HOLD_WORDS.need);
    expect(text).toContain(HOLD_WORDS.safe);
    expect(text).toContain(HOLD_WORDS.limit);
    expect(text).not.toMatch(/詰め|太い輪|細い輪/);
    // 2026-11-08 作者の声：「縮める量」「縮められる」も分かりにくい。本当の手順（石より狭く作る → 広げて入れる → 戻る力ではさむ）の言葉に
    expect(text).not.toMatch(/縮め/);
    expect(HOLD_WORDS).toMatchObject({ need: "石より狭く作る量（要る分）", safe: "狭くできる量（広げても戻る範囲）", limit: "狭くできる限界（広げて戻る限界）", make: "作る時の開き", spread: "石を入れる時に広げる量", spreadLimit: "広げられる限界" });
  });

  it("長い辺の両はしの角（両方くぼみ。作者の指輪の向きではない）：既定はおすすめ（0.6 ずつ。仮）。0.8 ＋ 0.8 はまっすぐ開くだけでは入らない、0.5 は留まる見込み、0.3 はぎりぎり、0.2 は足りない", () => {
    expect(authorRing("corner").setting.tension!.ends.map((e) => e.depthMm)).toEqual([0.6, 0.6]);
    expect(holdOf(authorRing("corner", 0.8)).now.verdict).toBe("short");
    expect(holdOf(authorRing("corner", 0.8)).now.limitSqueezeMm).toBeLessThan(0);
    expect(holdOf(authorRing("corner", 0.5)).now.verdict).toBe("hold");
    expect(holdOf(authorRing("corner", 0.3)).now.verdict).toBe("tight");
    expect(holdOf(authorRing("corner", 0.2)).now.verdict).toBe("short");
  });

  it("Claude が読む形と、作り方の「開きを縮める」に、深さと外れにくさが出る", () => {
    const r = authorRing("side", 0.3, 0.3);
    const c = holdForClaude(holdOf(r));
    expect(c.depth_sum_mm).toBeCloseTo(0.6, 6);
    expect(c.verdict).toBe("留まる見込み（広げる量は安全な目安をこえる）");
    expect(c.note).toContain("仮");
    const steps = howToMake({ ring: r, outlineMm: tri().outlineMm, longMm: 8.88, widthMm: 7.52, depthMm: 4.24, metalLabel: "SV925", springMetal: "sv925" }, "hand");
    const close = steps.find((s) => s.id === "tension_close")!;
    const depth = close.specs.find((x) => x.label === "深さ")!;
    expect(depth.value).toContain("くぼみ 0.30");
    expect(depth.value).toContain("溝 0.30");
    const hold = close.specs.find((x) => x.label.startsWith("外れにくさ"))!;
    expect(hold.value).toContain("留まる見込み（広げる量は安全な目安をこえる）");
    expect(hold.value).toContain("最後は職人が決める");
  });

  it("設計の場：深さを変えると形が作り直され、職人の値に戻せる", () => {
    const s = new RingSession(tri(), () => seedLedger() as Ledger, () => undefined, () => "");
    s.state = { ...DEFAULT_STATE, gou: 14, metal: "sv925" };
    s.setSetting({ style: "tension", tension_grip: "side", reason: "作者の向き" });
    // 短い辺を溝に・反対の角をくぼみに の既定は、職人の値 角のくぼみ 0.4 mm・辺の溝 0.4 mm（作者が実際に作った指輪を見た感じの深さ）
    expect(s.built!.ring.setting.tension!.ends.map((e) => e.depthMm)).toEqual([0.4, 0.4]);
    // 戻りきらない分（仮）を見込むと、作者の 0.4 / 0.4 はぎりぎり（前は留まる見込み）
    expect(s.check().tension_calc!.hold!.verdict).toBe("留まる見込み（広げる量は安全な目安をこえる）");
    s.setTensionDepths(0.5, 0.5);
    expect(s.built!.ring.setting.tension!.ends.map((e) => e.depthMm)).toEqual([0.5, 0.5]);
    expect(s.check().tension_calc!.hold!.verdict).toBe("留まる見込み");
    s.setTensionDepths(0.3, 0.3);
    expect(s.built!.ring.setting.tension!.ends.map((e) => e.depthMm)).toEqual([0.3, 0.3]);
    expect(s.check().tension_calc!.hold!.verdict).toBe("留まる見込み（広げる量は安全な目安をこえる）");
    s.setTensionDepths(undefined, undefined);
    expect(s.built!.ring.setting.tension!.ends.map((e) => e.depthMm)).toEqual([0.4, 0.4]);
    // 長い辺を溝に入れる向きに戻すと（既定はおすすめ）
    s.setSetting({ tension_grip: "short", reason: "戻す" });
    // ほかの向きの既定は、戻りきらない分を見込んだおすすめ（仮。前の 0.8・0.5 は作者が「適当に言ってるだけ」と外した）
    expect(s.built!.ring.setting.tension!.ends.map((e) => e.depthMm)).toEqual([0.65, 0.6]);
    // 長い辺の両はしの角も、おすすめ（作者の深さは、この向きの値ではない）
    s.setSetting({ tension_grip: "corner", reason: "比べる" });
    expect(s.built!.ring.setting.tension!.ends.map((e) => e.depthMm)).toEqual([0.6, 0.6]);
  });
});
