// 爪の太さの、職人の点と推測の点（作者の頼み 2026-11-06）：
// 職人が 1 つの大きさで言った最低の太さから、ほかの大きさを割合で推し量り、推測と書く。職人が一言で直すと、その点が職人の点になる。
import { describe, expect, it } from "vitest";
import { craftPointsFromProposal, designNowText, previewPoints } from "../src/claude/rule-points";
import { correctPrompt } from "../src/claude/prompt";
import { parseToolCall, TOOLS, type ProposeRuleInput } from "../src/claude/tools";
import { buildRing } from "../src/geometry/ring";
import { checkRing } from "../src/rules/checks";
import { ringAnswerToDraft, ringGaps } from "../src/rules/gaps";
import { GUIDES, minProngMm } from "../src/rules/guides";
import { addRule, effectiveGuides, ledgerText, prongMinOverride, ruleForCheck, seedLedger, valueAtPoints, valueFor, type Ledger } from "../src/rules/ledger";
import { craftProngPoints, craftProngRule, inferProngPoints, mergeCraftPoints, prongMinAt, prongPointsRule, prongTable } from "../src/rules/prong-points";
import { prongSizeAnswer } from "../src/rules/search";
import { triangleStone } from "./helpers/stones";

const DATE = "2026-11-06";
const craftsman = { kind: "craftsman", name: "石川" } as const;

/** 職人の点から決まりを足した帳面 */
function withPoints(points: { stoneMm: number; value: number }[], base: Ledger = seedLedger()): Ledger {
  return addRule(base, { title: "爪の太さ（最低）", reason: "細いと曲がる", ...prongPointsRule(points), source: craftsman, date: DATE });
}

describe("職人の 1 点から、ほかの大きさを割合で推し量る", () => {
  const { points, note } = inferProngPoints([{ stoneMm: 8, value: 0.7 }]);

  it("職人の点はそのまま、ほかの大きさは公開の目安 × （0.7 ÷ 8 mm の公開の目安）で、推測と書く", () => {
    const ratio = 0.7 / minProngMm(8);
    const at = (s: number) => points.find((p) => p.stoneMm === s)!;
    expect(at(8)).toMatchObject({ value: 0.7, by: "craftsman" });
    expect(at(18).by).toBe("inferred");
    expect(at(18).value).toBeCloseTo(minProngMm(18) * ratio, 2);
    expect(at(12).value).toBeCloseTo(minProngMm(12) * ratio, 2);
    // 公開の目安のいちばん細い点（0.45 mm）より細くしない
    expect(at(3).value).toBe(GUIDES.prong.minByStoneSize[0][1]);
    expect(points.filter((p) => p.by === "craftsman")).toHaveLength(1);
    expect(note).toContain("公開の目安の曲線を、職人の 8 mm・0.7 mm に合わせて割合でずらした");
  });

  it("大きい石ほど太く（推測が職人の点の並びを逆にしない）", () => {
    const vs = points.map((p) => p.value);
    for (let i = 1; i < vs.length; i++) expect(vs[i]).toBeGreaterThanOrEqual(vs[i - 1]);
    // 職人の 2 点（メレ 2.5 mm で 0.6、8 mm で 0.7）の間の推測は、その 2 つの値の間に収まる
    const two = inferProngPoints([{ stoneMm: 2.5, value: 0.6 }, { stoneMm: 8, value: 0.7 }]).points;
    for (const p of two.filter((x) => x.stoneMm > 2.5 && x.stoneMm < 8)) {
      expect(p.value).toBeGreaterThanOrEqual(0.6);
      expect(p.value).toBeLessThanOrEqual(0.7);
    }
  });

  it("表は 3・5・8（職人）・12・18 mm", () => {
    const rows = prongTable(points);
    expect(rows.map((r) => r.stoneMm)).toEqual([3, 5, 8, 12, 18]);
    expect(rows.map((r) => r.by)).toEqual(["inferred", "inferred", "craftsman", "inferred", "inferred"]);
  });
});

describe("職人の一言で、推測の点が職人の点になり、線が変わる", () => {
  const before = mergeCraftPoints([], [{ stoneMm: 8, value: 0.7 }]);
  const after = mergeCraftPoints(before, [{ stoneMm: 18, value: 1.2 }]);
  const { points } = inferProngPoints(after);

  it("18 mm は職人の 1.2 mm になり、推測の 18 mm は消える", () => {
    const at18 = points.filter((p) => Math.abs(p.stoneMm - 18) < 0.5);
    expect(at18).toEqual([{ stoneMm: 18, value: 1.2, by: "craftsman" }]);
    expect(points.filter((p) => p.by === "craftsman").map((p) => p.stoneMm)).toEqual([8, 18]);
  });

  it("間の推測は、両方の職人の点を通る線から出し直す（8 と 18 の間に収まる）", () => {
    const at12 = points.find((p) => p.stoneMm === 12)!;
    expect(at12.by).toBe("inferred");
    expect(at12.value).toBeGreaterThan(0.7);
    expect(at12.value).toBeLessThan(1.2);
    const old12 = inferProngPoints(before).points.find((p) => p.stoneMm === 12)!.value;
    expect(at12.value).not.toBe(old12);
  });

  it("近い大きさの職人の点は、新しい言葉で置き換える", () => {
    expect(mergeCraftPoints([{ stoneMm: 8.2, value: 0.7 }], [{ stoneMm: 8, value: 0.8 }])).toEqual([{ stoneMm: 8, value: 0.8 }]);
  });

  it("同じ大きさに推測の点が残っていても、職人の点を先に使う", () => {
    const mixed = [
      { stoneMm: 12, value: 0.9, by: "inferred" as const },
      { stoneMm: 12.2, value: 1.05, by: "craftsman" as const },
      { stoneMm: 8, value: 0.7, by: "craftsman" as const },
    ];
    expect(valueAtPoints(mixed, 12.2)).toBe(1.05);
    // 12 mm の推測の点は、職人の 12.2 mm に近いので使わない（8 と 12.2 の職人の点をつなぐ）
    expect(valueAtPoints(mixed, 12)).toBeCloseTo(0.7 + ((1.05 - 0.7) * 4) / 4.2, 3);
  });
});

describe("確かめは、職人の点を先に、次に推測の点を使う", () => {
  const l1 = withPoints([{ stoneMm: 8, value: 0.7 }]);
  const l2 = withPoints(mergeCraftPoints(craftProngPoints(l1), [{ stoneMm: 18, value: 1.2 }]), l1);

  it("帳面の値：8 mm は職人の 0.7、18 mm は推測から職人の 1.2 へ", () => {
    const min = (l: Ledger, s: number) => prongMinOverride(effectiveGuides(l, s));
    expect(min(l1, 8)).toBe(0.7);
    expect(min(l1, 18)).toBeGreaterThan(1.2);
    expect(prongMinAt(l1, 18).by).toBe("inferred");
    expect(min(l2, 18)).toBe(1.2);
    expect(prongMinAt(l2, 18).by).toBe("craftsman");
    expect(prongMinAt(l2, 8).by).toBe("craftsman");
    // 前の決まりは履歴に残り、今の決まりは 1 つ
    expect(craftProngRule(l2)?.sizePoints?.filter((p) => p.by === "craftsman")).toHaveLength(2);
    expect(l2.rules.filter((r) => r.param === "prong.minDiameterMm")).toHaveLength(2);
  });

  it("赤（爪が細い）が、職人の点で出たり消えたりする", () => {
    const r = buildRing({ stone: triangleStone(), setting: { style: "prong", prongDiameterMm: 0.9 }, shank: { gou: 11 } });
    const size = (r.params.stone.longMm + r.params.stone.widthMm) / 2;
    const thin = (l: Ledger) => checkRing(r, { guides: effectiveGuides(l, size) }).filter((p) => p.check === "prong-thin");
    // 公開の目安だけなら 0.9 mm の爪は細い
    expect(thin(seedLedger()).length).toBeGreaterThan(0);
    // 職人が今の石の大きさで「0.7 mm あれば十分」と言えば赤は消える
    const ok = withPoints([{ stoneMm: size, value: 0.7 }]);
    expect(thin(ok)).toHaveLength(0);
    // 職人が「この石なら 1.0 は欲しい」と言えば、また赤になる（逆向きの直し）
    const strict = withPoints(mergeCraftPoints(craftProngPoints(ok), [{ stoneMm: size, value: 1.0 }]), ok);
    const ps = thin(strict);
    expect(ps.length).toBeGreaterThan(0);
    expect(ps[0].requiredValue).toBe(1.0);
    expect(ruleForCheck(strict, "prong-thin")?.sizePoints?.length).toBeGreaterThan(0);
  });

  it("目安帳の文（Claude に渡す）にも、職人と推測の点と出し方が入る", () => {
    const t = ledgerText(l2);
    expect(t).toContain("18 mm で 1.2 mm（職人）");
    expect(t).toContain("（推測）");
    expect(t).toContain("割合でずらした");
  });

  it("石の大きさの問いの答えも、推測と言う", () => {
    const rules = l2.rules.filter((r) => r.param === "prong.minDiameterMm").slice(-1);
    expect(prongSizeAnswer("12 mm くらいの石の爪は何ミリ？", rules)?.why).toContain("推測");
    expect(prongSizeAnswer("18 mm くらいの石の爪は何ミリ？", rules)?.why).toContain("職人が言った点");
  });

  it("点のない前の形の決まりは、今までどおり線でつなぐ", () => {
    expect(valueFor({ bySize: [{ upToMm: 2.5, value: 0.6 }, { upToMm: 8.2, value: 0.7 }], bySizeLine: true }, 5.35)).toBeCloseTo(0.65, 3);
  });
});

describe("聞き取りの爪の答えも、職人の点と推測の点になる", () => {
  it("12 mm の答えを足すと、12 mm が職人の点に、ほかは推測に", () => {
    const l1 = withPoints([{ stoneMm: 8, value: 0.7 }]);
    const gap = ringGaps(l1).find((g) => g.stoneMm === 12)!;
    expect(gap.why).toContain("推測");
    const r = ringAnswerToDraft(l1, gap, "12 ミリなら 1.0 ミリ", { name: "石川", date: DATE });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const craft = r.draft.sizePoints!.filter((p) => p.by === "craftsman").map((p) => [p.stoneMm, p.value]);
    expect(craft).toEqual([
      [8, 0.7],
      [12, 1.0],
    ]);
    expect(r.draft.bySize!.map((s) => s.upToMm)).toEqual([8, 12]);
  });
});

describe("propose_rule：石の大きさと点（前の形のままでも通る）", () => {
  const base = { title: "爪の太さ", text: "8 mm の石なら最低 0.7 mm", reason: "細いと曲がる", param: "prong.minDiameterMm", value: 0.7 };

  it("stone_mm と points（職人・推測）を受け取る", () => {
    const input = { ...base, stone_mm: 8, points: [{ stone_mm: 8, value: 0.7, by: "craftsman", why: "最低ライン 0.7 ミリは欲しい" }, { stone_mm: 18, value: 1.4, by: "inferred", why: "割合でずらした" }] };
    const r = parseToolCall("propose_rule", input);
    expect(r.ok).toBe(true);
  });

  it("value を忘れても、職人の点の値で補う（本物の Claude は points だけ付けて value を忘れた。2026-11-06）", () => {
    const { value: _v, ...noValue } = base;
    const r = parseToolCall("propose_rule", { ...noValue, stone_mm: 18, points: [{ stone_mm: 18, value: 1.2, by: "craftsman", why: "18 ミリなら 1.2 は欲しい" }] });
    expect(r.ok && (r.call.input as ProposeRuleInput).value).toBe(1.2);
    // 職人の点がなければ、今までどおり断る
    expect(parseToolCall("propose_rule", { ...noValue, points: [{ stone_mm: 18, value: 1.4, by: "inferred", why: "割合" }] }).ok).toBe(false);
  });

  it("前の形（点なし）も、そのまま通る", () => {
    expect(parseToolCall("propose_rule", base).ok).toBe(true);
    expect(parseToolCall("propose_rule", { title: "a", text: "b", reason: "c" }).ok).toBe(true);
    expect(parseToolCall("propose_rule", { ...base, by_size: [{ up_to_mm: 4, value: 0.6 }, { up_to_mm: 8, value: 0.7 }] }).ok).toBe(true);
  });

  it("工程（steps）は文字の並びで受け取る（前は数として確かめて断っていた）", () => {
    expect(parseToolCall("propose_rule", { title: "a", text: "b", reason: "c", steps: ["prong"] }).ok).toBe(true);
    expect(parseToolCall("propose_rule", { title: "a", text: "b", reason: "c", steps: ["no-such-step"] }).ok).toBe(false);
    expect(parseToolCall("propose_rule", { title: "a", text: "b", reason: "c", steps: [1] }).ok).toBe(false);
  });

  it("おかしな点は断る", () => {
    const bad = (x: object) => parseToolCall("propose_rule", { ...base, ...x });
    expect(bad({ points: [{ stone_mm: 8, value: 0.7, by: "guess", why: "" }] }).ok).toBe(false);
    expect(bad({ points: [{ stone_mm: 80, value: 0.7, by: "craftsman", why: "" }] }).ok).toBe(false);
    expect(bad({ points: [{ stone_mm: 8, value: 0.7, by: "craftsman", why: "", extra: 1 }] }).ok).toBe(false);
    expect(bad({ points: [] }).ok).toBe(false);
    expect(bad({ points: [{ stone_mm: 8, value: 0.7, by: "craftsman", why: "" }, { stone_mm: 8, value: 0.8, by: "craftsman", why: "" }] }).ok).toBe(false);
    expect(bad({ stone_mm: 0.1 }).ok).toBe(false);
    // 値のない決まりに点は付けない
    expect(parseToolCall("propose_rule", { title: "a", text: "b", reason: "c", stone_mm: 8 }).ok).toBe(false);
  });

  it("道具の定義：points の項目はすべて要る（strict の省ける項目の数を増やしすぎない）", () => {
    const schema = TOOLS.find((t) => t.name === "propose_rule")!.input_schema as { properties: Record<string, { items?: { required?: string[] } }> };
    expect(schema.properties.points.items?.required).toEqual(["stone_mm", "value", "by", "why"]);
    expect(schema.properties.stone_mm).toBeDefined();
  });
});

describe("案から職人の点を読む（数字は職人の言葉か、職人が指した今の設計から）", () => {
  const now = { stoneMm: 8.2, prongMm: 0.9 };
  const p = (x: Partial<ProposeRuleInput>): ProposeRuleInput => ({ title: "爪", text: "爪", reason: "曲がる", param: "prong.minDiameterMm", value: 0.7, ...x });

  it("「このサイズ（約 8 mm）の石なら、最低ライン 0.7 ミリは欲しい」→ 8 mm で 0.7 mm", () => {
    const said = "このサイズ（約 8 mm）の石なら、最低ライン 0.7 ミリは欲しい";
    const r = craftPointsFromProposal(p({ stone_mm: 8, points: [{ stone_mm: 8, value: 0.7, by: "craftsman", why: said }, { stone_mm: 18, value: 1.43, by: "inferred", why: "割合" }] }), said, now, DATE);
    expect(r.points).toEqual([{ stoneMm: 8, value: 0.7, quote: said, date: DATE }]);
    expect(r.dropped).toEqual([]);
  });

  it("「このサイズ」は今の石の大きさでもよい", () => {
    const r = craftPointsFromProposal(p({ stone_mm: 8.2 }), "このサイズなら最低 0.7 ミリ", now);
    expect(r.points.map((x) => x.stoneMm)).toEqual([8.2]);
  });

  it("「この爪は細く見えるけど、これで十分」→ 今の爪の太さが、今の石の大きさの職人の点", () => {
    const r = craftPointsFromProposal(p({ value: 0.9, stone_mm: 8.2 }), "この爪は細く見えるけど、これで十分", now);
    expect(r.points.map((x) => [x.stoneMm, x.value])).toEqual([[8.2, 0.9]]);
  });

  it("言葉にない数字は職人の点にしない", () => {
    const r = craftPointsFromProposal(p({ value: 1.1, stone_mm: 18 }), "18 ミリなら 1.2 は欲しい", now);
    expect(r.points).toEqual([]);
    expect(r.dropped[0]).toContain("1.1");
    const s = craftPointsFromProposal(p({ value: 1.2, stone_mm: 15 }), "大きい石なら 1.2 は欲しい", now);
    expect(s.points).toEqual([]);
  });

  it("前 → 後：18 mm の推測が、職人の 1.2 mm に変わる", () => {
    const l1 = withPoints([{ stoneMm: 8, value: 0.7 }]);
    const pv = previewPoints(l1, p({ value: 1.2, stone_mm: 18 }), "18 ミリなら 1.2 は欲しい", now, DATE)!;
    const row = pv.rows.find((r) => r.stoneMm === 18)!;
    expect(row.before.by).toBe("inferred");
    expect(row.after).toMatchObject({ value: 1.2, by: "craftsman" });
    expect(pv.rows.find((r) => r.stoneMm === 8)!.after.by).toBe("craftsman");
    expect(pv.rule.inferNote).toContain("18 mm・1.2 mm");
  });

  it("Claude の推測が画面の計算と食い違えば、Claude の考えは出さず、出し直したと言う", () => {
    const l1 = withPoints([{ stoneMm: 8, value: 0.7 }]);
    const said = "18 ミリなら 1.2 は欲しい";
    const wrong = previewPoints(l1, p({ value: 1.2, stone_mm: 18, points: [{ stone_mm: 18, value: 1.2, by: "craftsman", why: said }, { stone_mm: 12, value: 0.83, by: "inferred", why: "18 mm だけに合わせた" }] }), said, now)!;
    expect(wrong.claudeWhy).toEqual([]);
    expect(wrong.claudeRedone).toBe(true);
    const v12 = wrong.rows.find((r) => r.stoneMm === 12)!.after.value;
    const right = previewPoints(l1, p({ value: 1.2, stone_mm: 18, points: [{ stone_mm: 18, value: 1.2, by: "craftsman", why: said }, { stone_mm: 12, value: v12, by: "inferred", why: "両方の点を通る線" }] }), said, now)!;
    expect(right.claudeWhy).toEqual(["12 mm：両方の点を通る線"]);
    expect(right.claudeRedone).toBe(false);
  });

  it("Claude への指示に、今の設計と爪の点の表が入る", () => {
    const l1 = withPoints([{ stoneMm: 8, value: 0.7 }]);
    const text = designNowText(l1, now);
    expect(text).toContain("石の大きさ 8.2 mm");
    expect(text).toContain("18 mm で");
    expect(correctPrompt(l1, "石川", text)).toContain("by: inferred");
  });
});
