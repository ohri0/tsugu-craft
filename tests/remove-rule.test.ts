import { describe, expect, it } from "vitest";
import { freshGap, ringGaps } from "../src/rules/gaps";
import { activeRules, addRule, removeRule, seedLedger } from "../src/rules/ledger";
import { addQuestion, removeQuestions } from "../src/rules/teacher-queue";

describe("まちがえて入れた決まり・質問を消す", () => {
  it("決まりを消すと、帳面から外れ、消した id が残る（読み直しても足し直さない）", () => {
    const l0 = seedLedger();
    const pub = activeRules(l0)[0];
    const l1 = removeRule(l0, pub.id);
    expect(l1.rules.some((r) => r.id === pub.id)).toBe(false);
    expect(l1.removed).toContain(pub.id);
    expect(removeRule(l1, "ない決まり")).toBe(l1);
  });
  it("前の決まりを置き換えていた職人の決まりを消すと、前の決まりがまた効く", () => {
    const one = { title: "爪の太さ", reason: "曲がる", param: "prong.minDiameterMm" as const, source: { kind: "craftsman" as const, name: "石川" }, date: "2026-11-05" };
    const l0 = addRule(seedLedger(), { ...one, text: "最低 0.6 mm", value: 0.6 });
    const l1 = addRule(l0, { ...one, text: "最低 0.7 mm（聞きまちがい）", value: 0.7 });
    const mine = l1.rules[l1.rules.length - 1];
    expect(mine.replaces).toBeTruthy();
    expect(activeRules(l1).some((r) => r.id === mine.replaces)).toBe(false);
    const l2 = removeRule(l1, mine.id);
    expect(activeRules(l2).some((r) => r.id === mine.replaces)).toBe(true);
  });
  it("職人の爪の決まりを消すと、その質問が新しく出る", () => {
    const l0 = addRule(seedLedger(), { title: "爪の太さ", text: "最低 0.7 mm", reason: "曲がる", param: "prong.minDiameterMm", value: 0.7, bySize: [{ upToMm: 2.5, value: 0.6 }, { upToMm: 8.2, value: 0.7 }], bySizeLine: true, source: { kind: "craftsman", name: "石川" }, date: "2026-11-05" });
    const before = new Set(ringGaps(l0).map((g) => g.id));
    const mine = l0.rules[l0.rules.length - 1];
    const after = ringGaps(removeRule(l0, mine.id));
    expect(freshGap(before, after)?.id).toBe("ring:prong-size:any");
    expect(freshGap(null, after)).toBeUndefined();
    expect(freshGap(new Set(after.map((g) => g.id)), after)).toBeUndefined();
  });
  it("届いた質問を消せる", () => {
    const { queue } = addQuestion({ items: [] }, { question: "帳面情報に害もいける", whyUnanswered: "目安帳に近い決まりがなかった", date: "2026-11-05" });
    expect(removeQuestions(queue, queue.items[0].id).items).toHaveLength(0);
  });
});
