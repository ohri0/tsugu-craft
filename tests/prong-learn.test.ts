// 学ぶの爪の太さの問いに、職人の点から推し量って答える（作者の声 2026-11-07）。
// 職人が言っていない大きさ（長辺 9.3 mm の三角）は推測、言った大きさ（長辺 8.8 mm の三角）は職人の言葉そのまま。数字はすべて画面の計算から。
import { describe, expect, it } from "vitest";
import repo from "../ledger/jewelry.json";
import { askPrompt } from "../src/claude/prompt";
import { activeRules, type Ledger, type Rule } from "../src/rules/ledger";
import { minProngMm } from "../src/rules/guides";
import { checkProngAnswer, isProngThicknessQuestion, prongFactsText, prongLearnAnswer, prongLearnColumns, prongLearnFacts, readStoneSize } from "../src/rules/prong-learn";
import { craftProngPoints, inferredValue, prongMinAt, prongPointsRule } from "../src/rules/prong-points";

const ledger = repo as Ledger;
const rules = activeRules(ledger) as Rule[];
const rule = rules.find((r) => r.id === "rule-prong-min-ishikawa")!;
const Q93 = "長辺 9.3 mm の三角の石を留めたい。爪の太さは？";
const Q88 = "長辺 8.8 mm くらいの三角の石を留めたい。爪の太さは、どれくらい？";

describe("問いから石の大きさを読む", () => {
  it("長辺と形だけなら、幅は形の例の比（三角は作者の石 8.88 × 7.52 mm）から出し、石の大きさは長辺と幅の平均", () => {
    const r = readStoneSize(Q93)!;
    expect(r.stoneMm).toBe(8.6);
    expect(r.longMm).toBe(9.3);
    expect(r.shape).toBe("三角");
    expect(r.read).toMatch(/測った値ではない/);
    expect(readStoneSize(Q88)!.stoneMm).toBe(8.1);
  });
  it("長辺 × 幅、長辺と幅、「9 mm くらいの石」も読む", () => {
    expect(readStoneSize("8.88 × 7.52 mm の石の爪の太さ")!.stoneMm).toBe(8.2);
    expect(readStoneSize("長辺 10 mm、幅 8 mm の石の爪の太さは？")!.stoneMm).toBe(9);
    expect(readStoneSize("9 mm くらいの石の爪は、何 mm にする？")!.stoneMm).toBe(9);
    expect(readStoneSize("６．５ミリの石の爪は？")!.stoneMm).toBe(6.5);
  });
  it("爪の太さの数字を、石の大きさと取り違えない", () => {
    expect(readStoneSize("爪の太さは 0.8 mm で足りる？")).toBeUndefined();
    expect(readStoneSize("爪の太さは？")).toBeUndefined();
  });
  it("爪の太さの問いだけ（本数・高さは別）", () => {
    expect(isProngThicknessQuestion(Q93)).toBe(true);
    expect(isProngThicknessQuestion("9 mm くらいの石の爪は、何 mm にする？")).toBe(true);
    expect(isProngThicknessQuestion("三角の石は、爪 3 本で留まる？")).toBe(false);
    expect(isProngThicknessQuestion("爪の高さは？")).toBe(false);
    expect(isProngThicknessQuestion("ロウはどの順に使う？")).toBe(false);
  });
});

describe("Claude なしで、職人の点から推し量る", () => {
  it("長辺 9.3 mm の三角：職人が言っていない大きさなので推測。値は prong-points の割合の計算と同じ", () => {
    const f = prongLearnFacts(Q93, rules)!;
    expect(f.exact).toBe(false);
    expect(f.by).toBe("inferred");
    expect(f.value).toBe(inferredValue(craftProngPoints(ledger), 8.6));
    expect(f.value).toBe(0.73);
    // 職人の点は 2 つ（メレ 2.5 mm・0.6 mm と、この指輪の石 8.2 mm・0.7 mm）。割合は 8.2 mm の点から
    expect(f.points.map((p) => [p.stoneMm, p.value])).toEqual([[2.5, 0.6], [8.2, 0.7]]);
    expect(f.from.map((p) => p.stoneMm)).toEqual([8.2]);
    expect(f.ratio).toBeCloseTo(0.7 / minProngMm(8.2), 2);
    expect(f.method).toMatch(/公開の目安の線（8\.6 mm で 1\.27 mm）/);
    expect(f.method).toMatch(/0\.57 倍/);
    // ふつうの太さは、職人が自分の石で言った 0.8〜1 mm を、最低と同じ割合で動かす（推測）
    expect(f.typical).toMatchObject({ from: 0.83, to: 1.04, by: "inferred", saidFrom: 0.8, saidTo: 1 });
    expect(f.name).toBe("石川");
    expect(f.date).toBe("2026-11-03");
  });
  it("職人の言葉は、帳面の言葉からそのまま抜き出す（変えない）", () => {
    const f = prongLearnFacts(Q93, rules)!;
    for (const p of f.points) expect(rule.quote).toContain(p.said);
    expect(f.points.find((p) => p.stoneMm === 8.2)!.said).toBe("このサイズの石なら最低ライン 0.7 mm は欲しい感じ");
    expect(f.points.find((p) => p.stoneMm === 2.5)!.said).toBe("メレだと 0.6 mm とか");
    expect(rule.quote).toContain(f.typical!.said);
  });
  it("帳面を点の形（推測の点つき）にしても、同じ大きさの値はほぼ同じ（0.01 mm 以内）", () => {
    const pointsRule = { ...rule, ...prongPointsRule(craftProngPoints(ledger), rule.value), id: "x", replaces: rule.id };
    const asPoints: Ledger = { ...ledger, rules: [...ledger.rules, pointsRule] };
    expect(Math.abs(prongMinAt(asPoints, 8.6).value - prongLearnFacts(Q93, rules)!.value)).toBeLessThanOrEqual(0.01);
  });
  it("長辺 8.8 mm の三角：職人の石と同じ大きさなので、職人の言葉そのまま", () => {
    const f = prongLearnFacts(Q88, rules)!;
    expect(f.exact).toBe(true);
    expect(f.by).toBe("craftsman");
    expect(f.value).toBe(0.7);
    expect(f.typical).toMatchObject({ from: 0.8, to: 1, by: "craftsman" });
    expect(prongLearnAnswer(f).short).toMatch(/職人の言葉そのまま/);
    expect(prongLearnAnswer(f).short).not.toMatch(/推測/);
  });
  it("答えの文：推測の値に「推測・職人がまだ確かめていない値」、なぜに職人の名前・日付・言葉", () => {
    const a = prongLearnAnswer(prongLearnFacts(Q93, rules)!);
    expect(a.short).toBe("長辺 9.3 mm の三角の石（石の大きさ 約 8.6 mm）なら、爪の太さは最低 約 0.73 mm、ふつうは 0.83〜1.04 mm くらいと推測できます（推測・職人がまだ確かめていない値）。");
    expect(a.why).toMatch(/石川、2026-11-03/);
    expect(a.why).toMatch(/「このサイズの石なら最低ライン 0\.7 mm は欲しい感じ」/);
  });
  it("石の大きさのない問いは、職人の石の場合で答えて聞き返す。メレは職人の 2.5 mm の点", () => {
    const f = prongLearnFacts("爪の太さは、どれくらい？", rules)!;
    expect(f.asked).toBe(false);
    expect(f.exact).toBe(true);
    expect(f.size.stoneMm).toBe(8.2);
    expect(prongLearnAnswer(f).short).toMatch(/何 mm の石/);
    const m = prongLearnFacts("メレの爪の太さは？", rules)!;
    expect(m).toMatchObject({ exact: true, value: 0.6, asked: true });
  });
  it("職人の 2 点の間（5 mm）は、2 つの値の間に収める。小さい石にふつうの太さは出さない", () => {
    const f = prongLearnFacts("5 mm の石の爪の太さは？", rules)!;
    expect(f.from.map((p) => p.stoneMm)).toEqual([2.5, 8.2]);
    expect(f.value).toBeGreaterThanOrEqual(0.6);
    expect(f.value).toBeLessThanOrEqual(0.7);
    expect(f.method).toMatch(/間に収めて/);
    expect(f.typical).toBeUndefined();
  });
  it("表の列：職人の点（職人）と、この大きさ（推測）", () => {
    const cols = prongLearnColumns(prongLearnFacts(Q93, rules)!);
    expect(cols.map((c) => [c.stoneMm, c.min.value, c.min.by, c.now])).toEqual([
      [2.5, 0.6, "craftsman", false],
      [8.2, 0.7, "craftsman", false],
      [8.6, 0.73, "inferred", true],
    ]);
    expect(cols[1].typical).toEqual({ from: 0.8, to: 1, by: "craftsman" });
    expect(cols[2].typical).toEqual({ from: 0.83, to: 1.04, by: "inferred" });
    // 職人の石なら、列は職人の点だけ（推測の列はない）
    expect(prongLearnColumns(prongLearnFacts(Q88, rules)!).every((c) => c.min.by === "craftsman")).toBe(true);
  });
  it("爪の太さでない問い・職人の点のない帳面では null（今までの探し方）", () => {
    expect(prongLearnFacts("ロウはどの順に使う？", rules)).toBeNull();
    expect(prongLearnFacts(Q93, rules.filter((r) => r.id !== rule.id))).toBeNull();
  });
});

describe("Claude への指示に、画面の計算の事実を入れる", () => {
  it("推測のとき：値・使った職人の点・出し方・職人の言葉と、推測と書く頼み", () => {
    const f = prongLearnFacts(Q93, rules)!;
    const p = askPrompt(ledger, "石川", f);
    expect(p).toContain("<prong_facts>");
    expect(p).toContain(prongFactsText(f));
    expect(p).toContain("最低 約 0.73 mm（推測・職人がまだ確かめていない値）");
    expect(p).toContain("使った職人の点：石の大きさ 8.2 mm で最低 0.7 mm");
    expect(p).toContain("「このサイズの石なら最低ライン 0.7 mm は欲しい感じ」");
    expect(p).toMatch(/自分で計算し直したり/);
    expect(p).toMatch(/答えに「推測」と書き/);
  });
  it("職人の言葉そのままのとき：推測ではないと書く", () => {
    const p = askPrompt(ledger, "石川", prongLearnFacts(Q88, rules)!);
    expect(p).toContain("最低 0.7 mm（職人の言葉そのまま。推測ではない）");
    expect(p).toMatch(/「職人の言葉そのまま」と書き/);
  });
  it("石の大きさのない問い：聞き返す頼み", () => {
    expect(askPrompt(ledger, "石川", prongLearnFacts("爪の太さは？", rules)!)).toMatch(/1 つだけ聞き返します/);
  });
  it("爪の問いでなければ、指示は今までと同じ", () => {
    expect(askPrompt(ledger, "石川")).not.toContain("prong_facts");
    expect(askPrompt(ledger, "石川", undefined)).toBe(askPrompt(ledger, "石川"));
  });
});

describe("Claude の答えの数字を、画面の計算と比べる", () => {
  const f = prongLearnFacts(Q93, rules)!;
  it("計算の数字だけで、推測と書いた答えは通る", () => {
    const text =
      "答え：石川さんは、8.2 mm くらいの石なら最低 0.7 mm、メレ（2.5 mm）なら 0.6 mm と言っていました。割合から見ると、長辺 9.3 mm の三角の石（石の大きさ 約 8.6 mm）なら最低 約 0.73 mm、ふつうは 0.83〜1.04 mm くらいと推測できます（推測・職人がまだ確かめていない値）。\n" +
      "なぜ：公開の目安の線では 8.6 mm で 1.27 mm。石川さんの値はその 0.57 倍なので、同じ割合で出しました（2026-11-03）。";
    expect(checkProngAnswer(text, f, Q93)).toEqual({ ok: true, bad: [], noGuessWord: false });
  });
  it("Claude が自分で計算した数字（0.75 mm）は通らない", () => {
    const r = checkProngAnswer("最低 約 0.75 mm、ふつうは 0.8〜1 mm くらいと推測できます。", f, Q93);
    expect(r.ok).toBe(false);
    expect(r.bad).toEqual([0.75]);
  });
  it("推測の値なのに「推測」と書いていなければ通らない", () => {
    expect(checkProngAnswer("最低 0.73 mm です。", f, Q93)).toMatchObject({ ok: false, noGuessWord: true });
  });
  it("もとにした別の決まりの数字は通る", () => {
    const corner = rules.find((r) => /0\.9 mm/.test(r.text));
    if (!corner) return;
    expect(checkProngAnswer("推測で最低 0.73 mm。爪は角から 0.9 mm 以内に置きます。", f, Q93, [corner]).ok).toBe(true);
    expect(checkProngAnswer("推測で最低 0.73 mm。爪は角から 0.9 mm 以内に置きます。", f, Q93).bad).toEqual([0.9]);
  });
  it("前の動画の答え（8.8 mm を線で伸ばした 0.71 mm）は、計算と合わない", () => {
    const old = "答え：角に 1 本ずつ、0.8 mm くらいの爪を 3 本置きます。最低ラインは約 0.71 mm で、ふつうは 0.8〜1 mm です。";
    expect(checkProngAnswer(old, prongLearnFacts(Q88, rules)!, Q88).bad).toEqual([0.71]);
  });
});
