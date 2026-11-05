// strict の道具の上限を見張る。
// Claude の API は、1 回の呼び出しで送る strict のスキーマの大きさに上限を持つ。超えると 400「Schema is too complex for compilation」で断られ、
// その作業がまるごと止まる。偽物の Claude のテストは全部通るので、ここで数える。
// 上限の数の出典：https://platform.claude.com/docs/en/build-with-claude/structured-outputs （2026-11-06 に確かめた）
import { describe, expect, it } from "vitest";
import { ASK_GAP, GAP_RULE } from "../src/claude/gap";
import { RED_PEN } from "../src/claude/redpen";
import { parseToolCall, TOOLS } from "../src/claude/tools";
import type { ClaudeTool } from "../src/claude/wire";
import { PROPOSE_RESTORATION } from "../src/rebuild/restore-tools";
import { GRADE_PROCESS, PROPOSE_PROCESS } from "../src/rebuild/tools";
import { MAKE_BAND } from "../src/studio/band";
import { generationTools } from "../src/studio/make-run";
import { SORT_TIPS } from "../src/studio/tips";

const API_LIMITS = { strictTools: 20, optional: 24, unions: 16 };

type Schema = { properties?: Record<string, Schema>; required?: string[]; items?: Schema; anyOf?: Schema[]; type?: unknown };

/** 1 回の呼び出しの strict のスキーマを数える。省ける項目は、入れ子も数える（文書の「required にない項目はすべて」の、厳しい方の読み方） */
function strictLoad(tools: readonly ClaudeTool[]) {
  const load = { strictTools: 0, optional: 0, unions: 0 };
  const walk = (s: Schema) => {
    if (s.anyOf || Array.isArray(s.type)) load.unions++;
    const required = new Set(s.required ?? []);
    for (const [key, value] of Object.entries(s.properties ?? {})) {
      if (!required.has(key)) load.optional++;
      walk(value);
    }
    if (s.items) walk(s.items);
    for (const value of s.anyOf ?? []) walk(value);
  };
  for (const t of tools) {
    if (!t.strict) continue;
    load.strictTools++;
    walk(t.input_schema as Schema);
  }
  return load;
}

function expectWithinLimits(tools: readonly ClaudeTool[]) {
  const load = strictLoad(tools);
  expect(load.strictTools).toBeLessThanOrEqual(API_LIMITS.strictTools);
  expect(load.optional).toBeLessThanOrEqual(API_LIMITS.optional);
  expect(load.unions).toBeLessThanOrEqual(API_LIMITS.unions);
}

describe("strict の道具が、API の上限の中に収まる", () => {
  it("道具を全部送るとき（いちばん多い組み合わせ）", () => {
    expectWithinLimits(TOOLS);
  });

  it("指輪の生成で送る組み合わせ（石もおまかせ・今の石のまま）", () => {
    expectWithinLimits(generationTools(true));
    expectWithinLimits(generationTools(false));
  });

  it("1 つだけ送る道具", () => {
    for (const tool of [MAKE_BAND, SORT_TIPS, RED_PEN, ASK_GAP, GAP_RULE, PROPOSE_PROCESS, GRADE_PROCESS, PROPOSE_RESTORATION]) expectWithinLimits([tool]);
  });
});

describe("strict でない腕の道具（set_shank）の入力は、parseToolCall が確かめる", () => {
  const base = { reason: "確かめ" };
  const station = { at_deg: 60, width_mm: 3, thickness_mm: 2 };

  it("知らない項目は、黙って捨てずに断る（Claude が変えたつもりで進まないように）", () => {
    expect(parseToolCall("set_shank", { ...base, width: 3 }).ok).toBe(false);
    expect(parseToolCall("set_shank", { ...base, stations: [{ ...station, wide: 3 }] }).ok).toBe(false);
    expect(parseToolCall("set_shank", { ...base, relief: { pattern: "arch", deep: 0.2 } }).ok).toBe(false);
    expect(parseToolCall("set_shank", { ...base, relief_more: [{ pattern: "mil", deep: 0.2 }] }).ok).toBe(false);
    expect(parseToolCall("set_shank", { ...base, section_curve: { points: [], smooth: true } }).ok).toBe(false);
  });

  it("形や型の違いも断る", () => {
    expect(parseToolCall("set_shank", { ...base, width_mm: "3" }).ok).toBe(false);
    expect(parseToolCall("set_shank", { ...base, stations: [{ at_deg: 60, width_mm: 3 }] }).ok).toBe(false);
    expect(parseToolCall("set_shank", { ...base, relief: { count: 4 } }).ok).toBe(false);
    expect(parseToolCall("set_shank", { ...base, relief_more: [{ pattern: "mil", count: "30" }] }).ok).toBe(false);
    expect(parseToolCall("set_shank", { ...base, relief_more: { pattern: "mil" } }).ok).toBe(false);
  });

  it("正しい入力は通る", () => {
    expect(parseToolCall("set_shank", { ...base, width_mm: 3 }).ok).toBe(true);
    expect(parseToolCall("set_shank", { ...base, stations: [station] }).ok).toBe(true);
    expect(parseToolCall("set_shank", { ...base, relief: { pattern: "arch", count: 4 }, relief_more: [{ pattern: "mil", count: 30 }] }).ok).toBe(true);
  });
});
