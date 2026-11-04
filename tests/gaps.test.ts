import { describe, expect, it } from "vitest";
import repoLedger from "../ledger/jewelry.json";
import { activeRules, addRule, effectiveGuides, seedLedger, valueFor, type Ledger } from "../src/rules/ledger";
import { answerToDraft, applyDraft, isYes, pickNumber, readNumbers, ringAnswerToDraft, ringGaps, type Gap } from "../src/rules/gaps";
import { parseAskGap, parseGapRule } from "../src/claude/gap";

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

// 数字で答える所（形だけの例。魚々子の帳面を 2026-11-04 に外したので、ここで作る）
const numberGap: Gap = {
  id: "t:plate",
  technique: "bezel",
  kind: "missing",
  expects: "number",
  param: "plate.minThicknessMm",
  unit: "mm",
  title: "板の厚み",
  question: "板の厚みが何ミリより薄いと、打ったときに穴があきますか？",
  why: "資料に数字がない",
  reason: "うすい板は穴があく",
};

describe("数字で答える所", () => {
  it("答えの数字だけが決まりの値になる（職人・名前・日付・言葉そのまま）", () => {
    const said = "0.5ミリより薄いと、だいたい穴があくね";
    const r = answerToDraft(numberGap, said, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(0.5);
    expect(r.draft).toMatchObject({ param: "plate.minThicknessMm", value: 0.5, quote: said, source: { kind: "craftsman", name: "石川" }, date: "2026-11-03", gap: numberGap.id });
  });

  it("数字がない・2 つあるときは決まりにせず、聞き直すか選んでもらう", () => {
    const gap = numberGap;
    expect(answerToDraft(gap, "場合による", ctx).ok).toBe(false);
    const two = answerToDraft(gap, "0.4か0.5ミリかな", ctx);
    expect(two.ok).toBe(false);
    if (!two.ok) expect(two.candidates).toEqual([0.4, 0.5]);
    const chosen = answerToDraft(gap, "0.4か0.5ミリかな", ctx, 0.5);
    expect(chosen.ok && chosen.value).toBe(0.5);
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
  const gap = numberGap;
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
