// 継承の流れ：職人が残す → 学ぶ人が受け取る → 質問が職人へ戻る。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import repoLedger from "../ledger/jewelry.json";
import { comparePose } from "../src/craft/pose";
import { importRecord } from "../src/craft/record";
import { askedGroupId, flowState, LEARN_SUGGEST, openQuestions, queueFor, questionGap, WAZA_ORDER } from "../src/rules/flow";
import { answerToDraft, applyDraft, techGaps } from "../src/rules/gaps";
import { activeRules as active, type Ledger, type Rule } from "../src/rules/ledger";
import { findRules, prongSizeAnswer } from "../src/rules/search";
import { addQuestion, emptyQueue, groupQuestions, markAnswered } from "../src/rules/teacher-queue";
import { seedTechLedger, TECH_IDS, TECHS } from "../src/rules/techniques";
import { MIHON_NAME, MIHON_UNKNOWN, mihonAnswer } from "../src/app/mihon";
import { parseLearn } from "../src/app/routes";

/** 技の帳面（決まりの値の名前が文字）も、指輪の帳面と同じ探し方に渡す */
const activeRules = (l: Ledger<string>) => active(l) as unknown as Rule[];

const zero = { craftsman: 0, models: 0, asked: 0, compared: 0, questions: 0 };

describe("流れの進み具合", () => {
  it("何も残っていなければ、次は「答える」", () => {
    const s = flowState(zero);
    expect(s.nextId).toBe("answer");
    expect(s.doneCount).toBe(0);
    expect(s.steps.filter((x) => x.current).map((x) => x.id)).toEqual(["answer"]);
  });
  it("残したものの数で、順に進む", () => {
    expect(flowState({ ...zero, craftsman: 1 }).nextId).toBe("model");
    expect(flowState({ ...zero, craftsman: 1, models: 1 }).nextId).toBe("ask");
    expect(flowState({ ...zero, craftsman: 1, models: 1, asked: 1 }).nextId).toBe("hands");
    const all = flowState({ ...zero, craftsman: 1, models: 1, asked: 1, compared: 1 });
    expect(all.nextId).toBeNull();
    expect(all.doneCount).toBe(4);
  });
  it("先に手本を残しても、まだの段のいちばん前が「次」", () => {
    expect(flowState({ ...zero, models: 1 }).nextId).toBe("answer");
  });
  it("段は職人の 2 つのあとに、学ぶ人の 2 つ", () => {
    expect(flowState(zero).steps.map((s) => s.who)).toEqual(["master", "master", "learner", "learner"]);
  });
});

describe("技の並び", () => {
  it("全部の技があり、指輪は例の一つとして後ろ", () => {
    expect(new Set(WAZA_ORDER)).toEqual(new Set([...TECH_IDS, "ring"]));
    expect(WAZA_ORDER[0]).toBe("kebori");
    expect(WAZA_ORDER[WAZA_ORDER.length - 1]).toBe("ring");
  });
});

describe("届いた質問は、その技の帳面へ戻る", () => {
  const q = (question: string, technique?: string) => ({ question, whyUnanswered: "帳面にない", date: "2026-11-05", ...(technique ? { technique } : {}) });
  it("技の印を残す。印のない前の質問は指輪のもの", () => {
    let queue = addQuestion(emptyQueue(), q("爪は何本？")).queue;
    queue = addQuestion(queue, q("失敗した線は消せますか？", "kebori")).queue;
    expect(queueFor(queue, "ring").items.map((x) => x.question)).toEqual(["爪は何本？"]);
    expect(queueFor(queue, "kebori").items.map((x) => x.question)).toEqual(["失敗した線は消せますか？"]);
    expect(queueFor(queue, "bezel").items).toEqual([]);
  });
  it("同じ言葉の質問でも、ちがう技ならまとめない（答えを入れる帳面がちがう）", () => {
    let queue = addQuestion(emptyQueue(), q("焼きなましの温度は？", "tsuchime")).queue;
    queue = addQuestion(queue, q("焼きなましの温度は？", "mokume")).queue;
    queue = addQuestion(queue, q("焼きなましの温度は？", "mokume")).queue;
    expect(groupQuestions(queue)).toHaveLength(2);
    expect(openQuestions(queue, "mokume")[0].count).toBe(2);
  });
  it("質問に答えると、言葉のまま職人の決まりになり、質問は答えた扱いになる。数字を足さない", () => {
    let queue = addQuestion(emptyQueue(), q("失敗した線は消せますか？", "kebori")).queue;
    const group = openQuestions(queue, "kebori")[0];
    const gap = questionGap("kebori", group);
    expect(askedGroupId(gap.id)).toBe(group.id);
    expect(askedGroupId("kebori:line-depth")).toBeNull();
    const said = "浅い線なら磨いて消す";
    const d = answerToDraft<string>(gap, said, { name: "石川", date: "2026-11-05", asked: gap.question });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.draft.text).toBe(said);
    expect(d.draft.quote).toBe(said);
    expect(d.draft.source).toEqual({ kind: "craftsman", name: "石川" });
    const ledger = applyDraft<string>(seedTechLedger("kebori"), d.draft);
    const rule = ledger.rules[ledger.rules.length - 1];
    queue = markAnswered(queue, group.ids, rule.id);
    expect(openQuestions(queue, "kebori")).toEqual([]);
    // 技の問い（資料にない所）は、届いた質問に答えても消えない
    expect(techGaps("kebori", ledger).map((g) => g.id)).toContain("kebori:line-depth");
    // 次からは帳面で答えられる
    expect(findRules(group.question, activeRules(ledger))[0]?.id).toBeDefined();
    expect(findRules(group.question, activeRules(ledger)).some((r) => r.id === rule.id)).toBe(true);
  });
});

describe("学ぶの例の問い", () => {
  it.each(TECH_IDS)("%s：どの問いも、その技の帳面に答えがある", (id) => {
    const rules = activeRules(seedTechLedger(id));
    expect(LEARN_SUGGEST[id].length).toBeGreaterThan(0);
    for (const s of LEARN_SUGGEST[id]) expect(findRules(s, rules), s).not.toEqual([]);
  });
  it("指輪の問いも、帳面に答えがある", () => {
    const rules = active(repoLedger as unknown as Ledger);
    for (const s of LEARN_SUGGEST.ring) expect(prongSizeAnswer(s, rules) !== null || findRules(s, rules).length > 0, s).toBe(true);
  });
  it("技の帳面の決まりは、資料のものか、作者の言葉か。見本の言葉は入っていない", () => {
    for (const id of TECH_IDS) {
      for (const r of TECHS[id].rules) {
        if (r.source.kind === "craftsman") expect(r.source.name).not.toBe(MIHON_NAME);
        expect(r.text).not.toContain("作り話");
      }
    }
  });
});

describe("見本（作り話の例）", () => {
  const gaps = techGaps("kebori", seedTechLedger("kebori"));
  it("どの答えも作り話と書いてあり、数字を作らない", () => {
    const asked = questionGap("kebori", openQuestions(addQuestion(emptyQueue(), { question: MIHON_UNKNOWN, whyUnanswered: "x", date: "2026-11-05", technique: "kebori" }).queue, "kebori")[0]);
    for (const g of [...gaps, asked]) {
      const a = mihonAnswer(g);
      expect(a).toContain("作り話");
      expect(a, a).not.toMatch(/[0-9０-９]/);
    }
  });
  it("帳面にない質問の例は、ほんとうに帳面にない", () => {
    expect(findRules(MIHON_UNKNOWN, activeRules(seedTechLedger("kebori")))).toEqual([]);
  });
  it("手本と学ぶ人の記録を比べると、学ぶ人のふらつきが大きく、ちがう瞬間が出る", () => {
    const read = (n: string) => importRecord(readFileSync(`public/mihon/${n}.json`, "utf8"));
    const master = read("master");
    const learner = read("learner");
    const c = comparePose(master.landmarksSampled, learner.landmarksSampled, "right");
    expect(c.seen.master).toBeGreaterThan(0.3);
    expect(c.seen.learner).toBeGreaterThan(0.3);
    expect(c.ratio).toBeGreaterThan(1.3);
    expect(c.moments.length).toBeGreaterThan(0);
  });
  it("記録に技の印が残る", () => {
    const r = importRecord(readFileSync("public/mihon/master.json", "utf8"));
    expect(r.technique).toBeUndefined();
    expect(importRecord({ ...r, technique: "kebori" }).technique).toBe("kebori");
  });
});

describe("学ぶの中の場所", () => {
  const isTech = (s: string) => s === "ring" || (TECH_IDS as string[]).includes(s);
  it("技を選ぶ", () => {
    expect(parseLearn("", isTech)).toEqual({ hands: false });
    expect(parseLearn("kebori", isTech)).toEqual({ hands: false, tech: "kebori" });
    expect(parseLearn("hands", isTech)).toEqual({ hands: true });
    expect(parseLearn("hands/kebori", isTech)).toEqual({ hands: true, tech: "kebori" });
    expect(parseLearn("hands/nanako", isTech)).toEqual({ hands: true });
    expect(parseLearn("?x=1", isTech)).toEqual({ hands: false });
  });
});
