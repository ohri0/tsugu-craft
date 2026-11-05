import { describe, expect, it } from "vitest";
import { bookTitle } from "../src/app/master";
import { freshGap, ringGaps } from "../src/rules/gaps";
import { activeRules, addRule, removedList, removeRule, restoreRule, seedLedger } from "../src/rules/ledger";
import { parseTechLedger, seedTechLedger } from "../src/rules/techniques";
import { addWorkshop, emptyWorkshops, removeWorkshop, renameWorkshop } from "../src/rules/workshops";
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
  it("消した決まりは一覧に残り、元に戻せる", () => {
    const l0 = seedLedger();
    const pub = activeRules(l0)[0];
    const l1 = removeRule(l0, pub.id);
    expect(removedList(l1).map((r) => r.id)).toEqual([pub.id]);
    const l2 = restoreRule(l1, pub.id);
    expect(activeRules(l2).some((r) => r.id === pub.id)).toBe(true);
    expect(l2.removed).toEqual([]);
    expect(removedList(l2)).toEqual([]);
    expect(restoreRule(l2, pub.id)).toBe(l2);
  });
  it("中身を残していなかった頃に消した決まりも、はじめの帳面から戻せる", () => {
    const l0 = seedLedger();
    const pub = activeRules(l0)[0];
    const old = { ...l0, rules: l0.rules.filter((r) => r.id !== pub.id), removed: [pub.id] };
    expect(removedList(old, l0.rules).map((r) => r.id)).toEqual([pub.id]);
    expect(removedList(old)).toEqual([]);
    expect(activeRules(restoreRule(old, pub.id, l0.rules)).some((r) => r.id === pub.id)).toBe(true);
  });
  it("戻す決まりと同じ値の決まりが今あれば、同じ値が 2 つ効かない", () => {
    const one = { title: "爪の太さ", reason: "曲がる", param: "prong.minDiameterMm" as const, source: { kind: "craftsman" as const, name: "石川" }, date: "2026-11-05" };
    const a = addRule(seedLedger(), { ...one, text: "最低 0.6 mm", value: 0.6 });
    const idA = a.rules[a.rules.length - 1].id;
    const b = addRule(removeRule(a, idA), { ...one, text: "最低 0.8 mm", value: 0.8 });
    const back = restoreRule(b, idA);
    expect(activeRules(back).filter((r) => r.param === one.param).map((r) => r.id)).toEqual([idA]);
  });
  it("技の帳面で消した決まりは、読み直しても戻らず、元に戻せる", () => {
    const seed = seedTechLedger("bezel");
    const first = activeRules(seed)[0];
    const l1 = removeRule(seed, first.id);
    const back = parseTechLedger("bezel", JSON.stringify(l1));
    expect(back.rules.some((r) => r.id === first.id)).toBe(false);
    expect(activeRules(restoreRule(back, first.id)).some((r) => r.id === first.id)).toBe(true);
  });
  it("工房の帳面の名前を変えて、消せる", () => {
    const ws = addWorkshop(emptyWorkshops(), "工房 B", seedLedger());
    const id = ws.active;
    const named = renameWorkshop(ws, id, "  工房 C ");
    expect(named.list[0].name).toBe("工房 C");
    expect(named.list[0].ledger.owner).toBe("工房 C");
    expect(renameWorkshop(ws, id, "   ")).toBe(ws);
    const gone = removeWorkshop(named, id);
    expect(gone.list).toEqual([]);
    expect(gone.active).toBe("main");
  });
  it("帳面の題は、英数字で終わる名前だけ間をあける", () => {
    expect(bookTitle("石川工房")).toBe("石川工房の帳面");
    expect(bookTitle("工房 B")).toBe("工房 B の帳面");
  });
  it("届いた質問を消せる", () => {
    const { queue } = addQuestion({ items: [] }, { question: "帳面情報に害もいける", whyUnanswered: "目安帳に近い決まりがなかった", date: "2026-11-05" });
    expect(removeQuestions(queue, queue.items[0].id).items).toHaveLength(0);
  });
});
