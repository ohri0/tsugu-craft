import { describe, expect, it } from "vitest";
import { isCheckRule, makingRulesFor, stepsOfRule, MAKING_STEP_IDS } from "../src/rules/making";
import { seedLedger, type Rule } from "../src/rules/ledger";
import repo from "../ledger/jewelry.json";

const base = { source: { kind: "craftsman" as const, name: "石川" }, date: "2026-11-03", reason: "" };
const rule = (r: Partial<Rule> & { title: string; text: string }): Rule => ({ id: r.title, ...base, ...r }) as Rule;

describe("作り方の決まり", () => {
  it("値に結びつく決まりは、確かめの決まりで、工程には出さない", () => {
    const r = rule({ title: "すき間", text: "石の下と指は 2.5 mm 空ける ロウ付け", param: "height.minFingerGapMm", value: 2.5 });
    expect(isCheckRule(r)).toBe(true);
    expect(stepsOfRule(r)).toEqual([]);
  });
  it("決まりに工程があれば、その工程に出す", () => {
    const r = rule({ title: "a", text: "なにか", steps: ["solder"] });
    expect(stepsOfRule(r)).toEqual(["solder"]);
    expect(makingRulesFor([r], "solder")).toHaveLength(1);
    expect(makingRulesFor([r], "finish")).toHaveLength(0);
  });
  it("工程がなければ、言葉から控えめに当て、当たらなければ出さない", () => {
    expect(stepsOfRule(rule({ title: "ロウ付けの面", text: "相手に合わせる" }))).toEqual(["solder"]);
    expect(stepsOfRule(rule({ title: "心がまえ", text: "お客さまの話をよく聞く" }))).toEqual([]);
  });
  it("知らない工程の名前は捨てる", () => {
    expect(stepsOfRule(rule({ title: "a", text: "b", steps: ["solder", "nope"] }))).toEqual(["solder"]);
  });
  it("資料の決まりは、工程を明示したときだけ、職人の決まりのあとに出す（言葉から当てない）", () => {
    const pub = { ...rule({ title: "ヤスリ", text: "ヤスリ", steps: ["finish"] }), source: { kind: "public" as const, title: "x" } };
    const guess = { ...rule({ title: "ヤスリ2", text: "ヤスリで削る" }), source: { kind: "public" as const, title: "x" } };
    const mine = rule({ title: "磨き", text: "磨く", steps: ["finish"] });
    expect(makingRulesFor([pub, guess, mine], "finish").map((r) => r.title)).toEqual(["磨き", "ヤスリ"]);
  });
  it("帳面の資料の作り方の決まりは、どれかの工程に出る", () => {
    const rules = (repo as { rules: Rule[] }).rules.filter((r) => r.source.kind === "public" && !isCheckRule(r));
    expect(rules.length).toBeGreaterThanOrEqual(20);
    for (const r of rules) expect(MAKING_STEP_IDS.some((s) => makingRulesFor([r], s).length === 1)).toBe(true);
  });
  it("帳面の職人の手の決まりは、どれも工程に結びついている", () => {
    const rules = (repo as { rules: Rule[] }).rules.filter((r) => r.source.kind === "craftsman" && !isCheckRule(r));
    for (const r of rules) {
      expect(r.steps?.length).toBeGreaterThan(0);
      for (const s of r.steps!) expect(MAKING_STEP_IDS).toContain(s);
    }
    expect(seedLedger().rules.length).toBeGreaterThan(0);
  });
});
