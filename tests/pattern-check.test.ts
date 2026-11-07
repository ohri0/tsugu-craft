// 模様の見込みの、言葉と計算の絵の食いちがいを確かめる（2026-11-08。docs/compare/ の「文では合うが、絵では合わない」の直し）
import { describe, expect, it } from "vitest";
import type { ClaudeMessage, ClaudeMessageParam } from "../src/claude/wire";
import { SYSTEM_MAX_CHARS } from "../src/claude/wire";
import { lookIssues, lookReviewText, patternRecordOf, reviewPattern, visibleLook } from "../src/rebuild/pattern-check";
import { metalColors, parsePattern, patternContext, patternPrompt, patternRequest, PREDICT_PATTERN, readPatternRecord, type PatternPrediction, type PredictedOp } from "../src/rebuild/pattern-tools";
import { colorWord, PATTERN_METALS } from "../src/rebuild/pattern-values";
import { addClue, newProject, type RestorePlan } from "../src/rebuild/restore";
import { callTool } from "../src/rebuild/run";

const op = (o: Partial<PredictedOp> & Pick<PredictedOp, "op">): PredictedOp => ({ step: 0, why: "", assumed: "", metals: [], amount: 0, size: 0, across: 0, count: 0, thickness: [], choice: "-", ...o });

/** 重ねて、裏から葉の鏨で打ち出し、表を削る（木の葉金のくらべで出た形。上の材料だけを変える） */
const leaves = (top: "silver" | "copper", claim: Partial<PatternPrediction> = {}): PatternPrediction => ({
  applicable: true,
  reason: "重ねて打ち出し、削る",
  ops: [
    op({ op: "stack", metals: top === "silver" ? ["silver", "copper"] : ["copper", "silver"], amount: 8 }),
    op({ op: "bond", choice: "good" }),
    op({ op: "punch", amount: 0.3, size: 0.06, count: 18, choice: "leaves" }),
    op({ op: "grind", amount: 0.04 }),
    op({ op: "color", choice: "patina" }),
  ],
  cannot_show: "",
  summary: "葉の輪",
  ...claim,
});

describe("絵の色の言葉", () => {
  it("材料の絵の色が、ふつうの言い方に分かれる", () => {
    expect(colorWord(PATTERN_METALS.silver.patina)).toBe("白");
    expect(colorWord(PATTERN_METALS.shakudo.patina)).toBe("黒");
    expect(colorWord(PATTERN_METALS.copper.raw)).toBe("赤茶");
    expect(colorWord(PATTERN_METALS.gold.raw)).toBe("金");
    expect(colorWord(PATTERN_METALS.iron.etch)).toBe("黒");
    expect(colorWord(PATTERN_METALS.iron.patina)).toBe("茶");
    expect(colorWord(PATTERN_METALS.shibuichi.patina)).toBe("灰");
    expect(colorWord(PATTERN_METALS.enamel_blue.raw)).toBe("青");
  });

  it("指示の材料の一覧に、色の出し方ごとの絵の色が入る（鉄を薬で色を出すと茶、酸なら黒、と選べるように）", () => {
    expect(metalColors("iron")).toBe("灰／黒／茶");
    const s = patternPrompt();
    expect(s).toContain(`- iron：鉄（${metalColors("iron")}）`);
    expect(s).toContain("銀は薬で色を出しても白いまま");
  });
});

describe("計算の絵の表に見える材料", () => {
  it("地は、削ったあとにいちばん上に残る層の材料。打ち出して削った輪に、下の層が出る", () => {
    const silverTop = visibleLook(leaves("silver"));
    expect(silverTop.ground).toBe("silver");
    expect(silverTop.groundColor).toBe("白");
    expect(silverTop.shares.find((x) => x.metal === "copper")!.share).toBeGreaterThan(0);
    const copperTop = visibleLook(leaves("copper"));
    expect(copperTop.ground).toBe("copper");
    expect(copperTop.groundColor).toBe("赤茶");
  });

  it("1 枚の板の飾りでも数える（透かした穴は数えない）", () => {
    const v = visibleLook({
      applicable: true,
      reason: "",
      ops: [op({ op: "plate", metals: ["iron"] }), op({ op: "zogan", metals: ["gold"], size: 0.02, across: 3, choice: "scroll" }), op({ op: "color", choice: "etch" })],
      cannot_show: "",
      summary: "x",
    });
    expect(v.ground).toBe("iron");
    expect(v.groundColor).toBe("黒");
    expect(v.shares.map((x) => x.metal)).toContain("gold");
  });
});

describe("言った見込みと、計算の絵をくらべる", () => {
  it("地を赤茶の銅と言ったのに、上を銀にした値なら、地の材料と色の食いちがいを知らせる", () => {
    const issues = lookIssues(leaves("silver", { ground_metal: "copper", ground_color: "赤茶", shown_metals: ["copper", "silver"] }));
    expect(issues.length).toBe(2);
    expect(issues[0]).toContain("見込みでは銅");
    expect(issues[0]).toContain("計算の絵では銀");
    expect(issues[1]).toContain("「白」");
  });

  it("言ったとおりの絵なら、食いちがいは無い", () => {
    expect(lookIssues(leaves("copper", { ground_metal: "copper", ground_color: "赤茶", shown_metals: ["copper", "silver"] }))).toEqual([]);
  });

  it("見えるはずと言った材料が出ない・言っていない材料が広く出る、も知らせる", () => {
    const issues = lookIssues(leaves("copper", { ground_metal: "copper", ground_color: "赤茶", shown_metals: ["copper", "gold"] }));
    expect(issues.some((t) => t.includes("見えるはずと言った金"))).toBe(true);
    const inlay: PatternPrediction = {
      applicable: true,
      reason: "",
      ops: [op({ op: "plate", metals: ["iron"] }), op({ op: "zogan", metals: ["gold"], size: 0.02, across: 3, choice: "scroll" }), op({ op: "color", choice: "etch" })],
      cannot_show: "",
      summary: "x",
      ground_metal: "iron",
      shown_metals: ["iron"],
    };
    expect(lookIssues(inlay).some((t) => t.includes("言っていない金"))).toBe(true);
  });

  it("見込みを言っていない答え（古い記録・MCP）と、描かない答えは、くらべない", () => {
    expect(lookIssues(leaves("silver"))).toEqual([]);
    expect(lookIssues({ applicable: false, reason: "漆", ops: [], cannot_show: "", summary: "", ground_metal: "copper" })).toEqual([]);
  });

  it("知らせる文は、仮の値だけを直し、色を合わせるためだけに材料や工程を変えない、出せないなら見込みの方を直す、と言う", () => {
    const t = lookReviewText(["地がちがう"], "predict_pattern");
    expect(t).toContain("- 地がちがう");
    expect(t).toContain("色を合わせるためだけに足したり変えたりしない");
    expect(t).toContain("cannot_show");
  });
});

describe("道具の入力：見込みの見た目", () => {
  it("値より前に、見込みの見た目を書く形（strict で全部要る）", () => {
    const schema = PREDICT_PATTERN.input_schema as { properties: Record<string, unknown>; required: string[] };
    const keys = Object.keys(schema.properties);
    for (const k of ["look", "ground_metal", "ground_color", "shown_metals"]) {
      expect(schema.required).toContain(k);
      expect(keys.indexOf(k)).toBeLessThan(keys.indexOf("ops"));
    }
  });

  it("受け取って残し、無い答え（古い記録）も受け取る。一覧に無い材料は使わない", () => {
    const base = { applicable: true, reason: "r", ops: [{ op: "stack", step: 1, why: "", assumed: "", metals: ["copper", "silver"], amount: 4, size: 0, across: 0, count: 0, thickness: [], choice: "-" }], cannot_show: "", summary: "s" };
    const a = parsePattern({ ...base, look: [{ point: "地の色", expect: "1 枚目の銅" }], ground_metal: "copper", ground_color: "赤茶", shown_metals: ["copper", "silver", "copper"] }, { steps: 3 });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.value.look).toEqual([{ point: "地の色", expect: "1 枚目の銅" }]);
    expect(a.value.ground_metal).toBe("copper");
    expect(a.value.ground_color).toBe("赤茶");
    expect(a.value.shown_metals).toEqual(["copper", "silver"]);
    const b = parsePattern(base, { steps: 3 });
    expect(b.ok && b.value.ground_metal === undefined && b.value.look === undefined).toBe(true);
    const c = parsePattern({ ...base, ground_metal: "mithril", ground_color: "-" }, { steps: 3 });
    expect(c.ok && c.value.ground_metal === undefined).toBe(true);
    expect(c.ok && c.warnings?.some((w) => w.includes("ground_metal"))).toBe(true);
  });

  it("指示に、値の前に見込みを言うこと、層の数え方、地と見分けられる輪の層が入る（指示は上限の中）", () => {
    const s = patternPrompt();
    for (const w of ["ops の値を決める前に、look に", "(k−1)/n", "地と見分けられる輪は、その 1 つ下の層から", "1 回だけ直してください"]) expect(s).toContain(w);
    expect(s.length).toBeLessThan(SYSTEM_MAX_CHARS);
  });

  it("手がかりの見た目の文を、絵の目当てとして渡す", () => {
    let p = newProject("chk1", "架空の技", "2026-11-08");
    const r = addClue(p, { kind: "object", title: "板の色", text: "赤茶色の地に、白い輪の葉" }, "2026-11-08");
    if ("error" in r) throw new Error(r.error);
    p = r.project;
    const plan = { version: 1, summary: "重ねて打つ", steps: [{ title: "重ねる", detail: "銅と銀を重ねる" }] } as unknown as RestorePlan;
    const ctx = patternContext(p, plan);
    expect(ctx.clues).toEqual([{ title: "板の色", text: "赤茶色の地に、白い輪の葉" }]);
    const u = patternRequest(p.name, plan, (s) => s, ctx);
    expect(u).toContain("<clues>\n- 板の色：赤茶色の地に、白い輪の葉\n</clues>");
  });
});

// ---- 1 回だけ直してもらう流れ（偽物の Claude） ----

type Block = Record<string, unknown>;
const message = (content: Block[]): ClaudeMessage => ({ id: "m", type: "message", role: "assistant", model: "test", content, stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }) as unknown as ClaudeMessage;
const use = (id: string, input: unknown): Block => ({ type: "tool_use", id, name: PREDICT_PATTERN.name, input });

function fakeFetch(replies: ClaudeMessage[]) {
  const requests: { messages: ClaudeMessageParam[] }[] = [];
  const impl: typeof fetch = async (_input, init) => {
    const n = requests.length;
    requests.push(JSON.parse(String(init?.body)));
    if (!replies[n]) throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(replies[n]), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { impl, requests };
}

const claim = { ground_metal: "copper", ground_color: "赤茶", shown_metals: ["copper", "silver"], look: [{ point: "地", expect: "1 枚目の銅" }] } as const;
const opts = (f: ReturnType<typeof fakeFetch>) => ({
  system: "s",
  user: "u",
  tool: PREDICT_PATTERN,
  parse: (x: unknown) => parsePattern(x, { steps: 5 }),
  review: reviewPattern(PREDICT_PATTERN.name),
  fetch: f.impl,
});

describe("食いちがえば、1 回だけ直してもらう", () => {
  it("1 回目が食いちがえば、知らせて出し直してもらい、1 回目の答えも残す", async () => {
    const f = fakeFetch([message([use("t1", { ...leaves("silver"), ...claim })]), message([use("t2", { ...leaves("copper"), ...claim })])]);
    const r = await callTool(opts(f));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(f.requests.length).toBe(2);
    const sent = f.requests[1].messages.at(-1)!.content as { type: string; tool_use_id: string; content: string; is_error?: boolean }[];
    expect(sent[0].type).toBe("tool_result");
    expect(sent[0].tool_use_id).toBe("t1");
    expect(sent[0].is_error).toBeUndefined();
    expect(sent[0].content).toContain("計算の絵では銀");
    expect(r.value.ops[0].metals[0]).toBe("copper");
    expect(r.reviewed?.first.ops[0].metals[0]).toBe("silver");
    const rec = patternRecordOf(r, "2026-11-08");
    expect(rec.firstTry?.prediction.ops[0].metals[0]).toBe("silver");
    expect(rec.firstTry?.issues.length).toBe(2);
    expect(rec.notes.some((n) => n.includes("1 回だけ直してもらいました"))).toBe(true);
    expect(rec.notes.some((n) => n.includes("まだ食いちがう"))).toBe(false);
    // 記録を読み直しても、1 回目の答えが残る
    const back = readPatternRecord(JSON.parse(JSON.stringify(rec)), 5);
    expect(back?.firstTry?.prediction.ops[0].metals[0]).toBe("silver");
    expect(back?.prediction.ground_metal).toBe("copper");
  });

  it("合っていれば 1 回で受け取る", async () => {
    const f = fakeFetch([message([use("t1", { ...leaves("copper"), ...claim })])]);
    const r = await callTool(opts(f));
    expect(r.ok && !r.reviewed).toBe(true);
    expect(f.requests.length).toBe(1);
  });

  it("直したあとも食いちがえば、受け取って、食いちがいを notes に残す（2 回目は確かめで止めない）", async () => {
    const f = fakeFetch([message([use("t1", { ...leaves("silver"), ...claim })]), message([use("t2", { ...leaves("silver"), ...claim })])]);
    const r = await callTool(opts(f));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(f.requests.length).toBe(2);
    const rec = patternRecordOf(r, "2026-11-08");
    expect(rec.notes.some((n) => n.includes("まだ食いちがう所"))).toBe(true);
  });

  it("出し直しを受け取れないとき（形の誤りが続く）は、1 回目の答えを使い、そう残す", async () => {
    const bad = { ...leaves("copper"), ...claim, summary: "" };
    const f = fakeFetch([message([use("t1", { ...leaves("silver"), ...claim })]), message([use("t2", bad)]), message([use("t3", bad)])]);
    const r = await callTool(opts(f));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.ops[0].metals[0]).toBe("silver");
    expect(r.reviewed?.unanswered).toBe(true);
    expect(patternRecordOf(r, "2026-11-08").notes[0]).toContain("1 回目の答えのまま");
  });
});

describe("七宝の区切りの線", () => {
  it("線は、ガラスの底から表まで立つ壁（断面に線が見える）", async () => {
    const { buildRelief, pointAt } = await import("../src/rebuild/pattern-relief");
    const { RELIEF_VALUES } = await import("../src/rebuild/pattern-values");
    const r = buildRelief([{ op: "plate", metal: "copper" }, { op: "shippo", colors: ["enamel_blue"], cells: "round", size: 0, across: 4, wire: "silver" }], 7);
    const wire = r.materials.indexOf("silver");
    const pts = Array.from({ length: 2000 }, (_, i) => pointAt(r, (i + 0.5) / 2000, 0.5)).filter((p) => p.add > 0.001 && p.addMat === wire);
    expect(pts.length).toBeGreaterThan(0);
    for (const p of pts) {
      expect(p.fillMat).toBe(wire);
      expect(p.fill).toBe(RELIEF_VALUES.enamelDepth);
    }
  });
});
