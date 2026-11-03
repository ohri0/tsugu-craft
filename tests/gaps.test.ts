import { describe, expect, it } from "vitest";
import repoLedger from "../ledger/jewelry.json";
import { activeRules, addRule, effectiveGuides, seedLedger, valueFor, type Ledger } from "../src/rules/ledger";
import { answerToDraft, applyDraft, isYes, nanakoGaps, pickNumber, readNumbers, ringAnswerToDraft, ringGaps, type Gap } from "../src/rules/gaps";
import { parseAskGap, parseGapRule } from "../src/claude/gap";
import { checkNanako, grainLayout, nanakoRuleFor, seedNanakoLedger, type NanakoDesign, type NanakoLedger } from "../src/rules/nanako";

const ctx = { name: "石川", date: "2026-11-03" };

describe("答えの数字を読む", () => {
  it("全角・ミリ・コンマ・半・ミクロン・%を読む", () => {
    expect(readNumbers("０．５ミリより薄いと穴があく").map((n) => n.value)).toEqual([0.5]);
    expect(readNumbers("れいコンマ3 くらい").map((n) => n.value)).toEqual([0.3]);
    expect(readNumbers("1ミリ半").map((n) => n.value)).toEqual([1.5]);
    expect(readNumbers("50ミクロン").map((n) => n.value)).toEqual([0.05]);
    expect(readNumbers("4割").map((n) => n.value)).toEqual([0.4]);
    expect(readNumbers("一ミリ").map((n) => n.value)).toEqual([1]);
    expect(readNumbers("穴はあかない")).toEqual([]);
  });
  it("「はい」に近い答え", () => {
    expect(isYes("はい、そうです")).toBe(true);
    expect(isYes("いいです")).toBe(true);
    expect(isYes("いいえ、もっと細かい")).toBe(false);
    expect(isYes("ちがう")).toBe(false);
  });
});

describe("魚々子の、まだ決まっていない所", () => {
  it("資料に数字のない値は決まりがなく、聞く所になる。数字のある未確認の決まりは確かめる所になる", () => {
    const l = seedNanakoLedger();
    expect(nanakoRuleFor(l, "plate.minThicknessMm")).toBeUndefined();
    const gaps = nanakoGaps(l);
    expect(gaps[0].id).toBe("nanako:plate.minThicknessMm");
    expect(gaps[0].question).toBe("板の厚みが何ミリより薄いと、打ったときに穴があきますか？");
    expect(gaps.map((g) => g.id)).toContain("nanako:grain.gapMinMm");
    const precision = gaps.find((g) => g.id === "nanako:strike.maxOffsetMm")!;
    expect(precision.kind).toBe("unverified");
    expect(precision.current).toBe(0.1);
    // 帳面の決まりは、どれも出どころの URL と「未確認」がついている
    for (const r of l.rules) {
      expect(r.unverified).toBe(true);
      expect(r.source.kind === "public" && r.source.url?.startsWith("https://")).toBe(true);
    }
  });

  it("答えると決まりになり（職人・名前・日付・言葉そのまま）、その所はもう聞かない", () => {
    let l: NanakoLedger = seedNanakoLedger();
    const gap = nanakoGaps(l)[0];
    const said = "0.5ミリより薄いと、だいたい穴があくね";
    const r = answerToDraft(gap, said, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(0.5);
    expect(r.draft).toMatchObject({ param: "plate.minThicknessMm", value: 0.5, quote: said, source: { kind: "craftsman", name: "石川" }, date: "2026-11-03", gap: gap.id });
    l = applyDraft(l, r.draft as never);
    expect(nanakoRuleFor(l, "plate.minThicknessMm")!.value).toBe(0.5);
    expect(nanakoGaps(l).map((g) => g.id)).not.toContain(gap.id);
  });

  it("数字がない・2 つあるときは決まりにせず、聞き直すか選んでもらう", () => {
    const gap = nanakoGaps(seedNanakoLedger())[0];
    expect(answerToDraft(gap, "場合による", ctx).ok).toBe(false);
    const two = answerToDraft(gap, "0.4か0.5ミリかな", ctx);
    expect(two.ok).toBe(false);
    if (!two.ok) expect(two.candidates).toEqual([0.4, 0.5]);
    const chosen = answerToDraft(gap, "0.4か0.5ミリかな", ctx, 0.5);
    expect(chosen.ok && chosen.value).toBe(0.5);
  });

  it("未確認の決まりを「はい」で確かめると、職人の決まりに置き換わる。言葉の決まりも置き換わる", () => {
    let l: NanakoLedger = seedNanakoLedger();
    const g = nanakoGaps(l).find((x) => x.id === "nanako:strike.maxOffsetMm")!;
    const r = answerToDraft(g, "はい、そのくらい", ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    l = applyDraft(l, r.draft as never);
    const now = nanakoRuleFor(l, "strike.maxOffsetMm")!;
    expect(now.source).toEqual({ kind: "craftsman", name: "石川" });
    expect(now.value).toBe(0.1);
    expect(now.unverified).toBeUndefined();
    const v = nanakoGaps(l).find((x) => x.id === "nanako:confirm:nanako-vertical")!;
    const r2 = answerToDraft(v, "傾けて打つこともある", ctx);
    expect(r2.ok && r2.draft.text).toBe("傾けて打つこともある");
    if (r2.ok) l = applyDraft(l, r2.draft as never);
    expect(activeRules(l).some((x) => x.id === "nanako-vertical")).toBe(false);
  });
});

describe("魚々子の図を、帳面の決まりで確かめる", () => {
  const d: NanakoDesign = { grainMm: 0.6, pitchMm: 0.8, rows: 3, cols: 5, plateMm: 0.4, offsetMm: 0, layout: "nanakoji" };

  it("決まりがない値は確かめず「まだ決まりがない」", () => {
    const c = checkNanako(d, seedNanakoLedger());
    const plate = c.findings.find((f) => f.key === "plate.minThicknessMm")!;
    expect(plate.status).toBe("none");
    expect(plate.gapId).toBe("nanako:plate.minThicknessMm");
    expect(c.bad.size).toBe(0);
  });

  it("職人が答えた板の厚みより薄いと、全部の粒が赤くなり、理由と出どころが出る", () => {
    const gap = nanakoGaps(seedNanakoLedger())[0];
    const r = answerToDraft(gap, "0.5ミリより薄いと穴があく", ctx);
    if (!r.ok) throw new Error(r.why);
    const l = applyDraft(seedNanakoLedger(), r.draft as never);
    const c = checkNanako(d, l);
    const plate = c.findings.find((f) => f.key === "plate.minThicknessMm")!;
    expect(plate.status).toBe("ng");
    expect(plate.rule!.source).toEqual({ kind: "craftsman", name: "石川" });
    expect(c.plateBad).toBe(true);
    expect(c.bad.size).toBe(15);
    expect(checkNanako({ ...d, plateMm: 0.6 }, l).bad.size).toBe(0);
  });

  it("魚子地で粒が重なると赤。荒らしなら重ねてよい", () => {
    const over = { ...d, plateMm: 1, pitchMm: 0.5 };
    expect(checkNanako(over, seedNanakoLedger()).findings.find((f) => f.key === "nanako-no-overlap")!.status).toBe("ng");
    expect(checkNanako({ ...over, layout: "arashi" }, seedNanakoLedger()).findings.some((f) => f.key === "nanako-no-overlap")).toBe(false);
  });

  it("打つ位置のずれは、決まり（資料の 0.1 mm）より大きくずれた粒だけ赤", () => {
    const dd = { ...d, plateMm: 1, offsetMm: 0.2, rows: 6, cols: 10 };
    const c = checkNanako(dd, seedNanakoLedger());
    const over = grainLayout(dd).filter((g) => g.offset > 0.1).length;
    expect(over).toBeGreaterThan(0);
    expect(over).toBeLessThan(60);
    expect(c.bad.size).toBe(over);
  });
});

describe("指輪の石留めの、まだ決まっていない所", () => {
  const ring = repoLedger as Ledger;

  it("職人の爪の点（約 2.5 mm と 8.2 mm）の間と、大きい石を聞く。仮の目安の留まりも聞く", () => {
    const gaps = ringGaps(ring);
    const sizes = gaps.filter((g) => g.kind === "uncovered").map((g) => g.stoneMm);
    expect(sizes).toEqual([5.5, 12]);
    expect(gaps.find((g) => g.id === "ring:hold.requiredTop")!.kind).toBe("provisional");
    expect(gaps.some((g) => g.id === "ring:hold.cornerSet")).toBe(false);
    expect(gaps.some((g) => g.id === "ring:hold.requiredSide" && g.kind === "missing")).toBe(true);
  });

  it("爪の答えは点として足され、設計が読む値（effectiveGuides）が変わる。聞いた石の大きさの数字は外す", () => {
    const gap = ringGaps(ring).find((g) => g.stoneMm === 5.5)!;
    const said = "5.5ミリの石なら0.65ミリはほしい";
    const r = ringAnswerToDraft(ring, gap, said, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(0.65);
    const l = applyDraft(ring, r.draft);
    const rule = activeRules(l).find((x) => x.param === "prong.minDiameterMm")!;
    expect(rule.quote).toBe(said);
    expect(rule.bySize!.map((s) => s.upToMm)).toEqual([2.5, 5.5, 8.2]);
    expect(valueFor(rule, 5.5)).toBe(0.65);
    expect((effectiveGuides(l, 5.5).prong as { minDiameterMm?: number }).minDiameterMm).toBe(0.65);
    // 前の職人の決まりは置き換えられて履歴に残る
    expect(l.rules.some((x) => x.id === "rule-prong-min-ishikawa")).toBe(true);
    expect(ringGaps(l).filter((g) => g.kind === "uncovered").map((g) => g.stoneMm)).toEqual([12]);
  });

  it("仮の目安を「はい」で確かめると、同じ値の職人の決まりになる。数字で答えればその値", () => {
    const g = ringGaps(ring).find((x) => x.id === "ring:hold.requiredTop")!;
    const yes = ringAnswerToDraft(ring, g, "はい、それでいい", ctx);
    expect(yes.ok && yes.draft.value).toBe(g.current);
    const num = ringAnswerToDraft(ring, g, "1.2倍あれば十分", ctx);
    expect(num.ok && num.draft.value).toBe(1.2);
    if (num.ok) expect(activeRules(applyDraft(ring, num.draft)).find((r) => r.param === "hold.requiredTop")!.source.kind).toBe("craftsman");
  });

  it("割合（爪の間の広さ）は % でも割でも読む", () => {
    const g: Gap = ringGaps(ring).find((x) => x.id === "ring:prong.maxGapRatio")!;
    expect(pickNumber(g, "35%まで")).toEqual({ ok: true, value: 0.35 });
    expect(pickNumber(g, "4割")).toEqual({ ok: true, value: 0.4 });
  });

  it("はじめの帳面（職人の点がない）では、爪の太さそのものを聞く。前の帳面の形はそのまま", () => {
    const seed = seedLedger();
    expect(ringGaps(seed)[0].id).toBe("ring:prong-size:any");
    const l = addRule(seed, { title: "t", text: "t", reason: "r", param: "prong.minDiameterMm", value: 0.7, source: { kind: "craftsman", name: "石川" }, date: "2026-11-03" });
    expect(activeRules(l).at(-1)!.checks).toEqual(["prong-thin"]);
  });
});

describe("Claude の聞き取りの返事を確かめる（言っていない数字を入れない）", () => {
  const gap = nanakoGaps(seedNanakoLedger())[0];
  it("問いに、もとの問いにない数字があれば受け取らない", () => {
    expect(parseAskGap({ question: "板が何ミリより薄いと穴があきますか？" }, gap).ok).toBe(true);
    expect(parseAskGap({ question: "板が 0.5 ミリより薄いと穴があきますか？" }, gap).ok).toBe(false);
  });
  it("決まりの値は、職人の答えの中の数字だけ", () => {
    const said = "0.5ミリより薄いと穴があく";
    const base = { has_value: true, title: "板", text: "板は 0.5 mm 以上", reason: "穴", follow_up: "" };
    expect(parseGapRule({ ...base, value: 0.5 }, gap, said).ok).toBe(true);
    expect(parseGapRule({ ...base, value: 0.7 }, gap, said).ok).toBe(false);
    expect(parseGapRule({ ...base, value: 0.5, text: "板は 0.7 mm 以上" }, gap, said).ok).toBe(false);
  });
});
