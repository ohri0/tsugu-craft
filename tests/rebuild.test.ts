// 「組み立て直す」のテスト。資料の読み取り、条件ごとの手がかり、指示に技の名前や URL が漏れないこと、
// 道具の入力の確かめ、点数の数え方、Claude を 1 回呼ぶ助け（偽の fetch で）を確かめる。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ClaudeMessage, ClaudeMessageParam } from "../src/claude/wire";
import { PASSWORD_HEADER, REMAINING_HEADER } from "../src/claude/wire";
import { cluesFor, parseAnswer, parseClues, TECHNIQUES, type Technique } from "../src/rebuild/material";
import { gradePrompt, gradeUserMessage, hypothesisPrompt, hypothesisUserMessage } from "../src/rebuild/prompt";
import { callTool } from "../src/rebuild/run";
import { scoreLine, tally } from "../src/rebuild/score";
import {
  GRADE_PROCESS,
  parseGradeProcess,
  parseProposeProcess,
  PROPOSE_PROCESS,
  type Grade,
  type Hypothesis,
} from "../src/rebuild/tools";

const read = (p: string) => readFileSync(new URL(`../research/mokume/${p}`, import.meta.url), "utf8");
const cluesMd = read("clues.md");
const answerMd = read("answer.md");
const range = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

const mokume = TECHNIQUES.find((t) => t.id === "mokume") as Technique;
const observe = mokume.conditions.find((c) => c.id === "observe")!;
const all = mokume.conditions.find((c) => c.id === "all")!;

describe("資料を読む", () => {
  it("手がかりは C1〜C20、見出しと出典つき", () => {
    const clues = parseClues(cluesMd);
    expect(clues.map((c) => c.id)).toEqual(range("C", 20));
    const c1 = clues[0];
    expect(c1.title).toBe("表面の模様");
    expect(c1.section).toBe("品物の見た目");
    expect(c1.text).toContain("木の板の木目のような");
    expect(c1.text).not.toContain("出典");
    expect(c1.sources).toEqual([
      "https://www.metmuseum.org/art/collection/search/34992",
      "https://www.metmuseum.org/art/collection/search/839561",
    ]);
    expect(clues.find((c) => c.id === "C20")!.section).toBe("一般に知られている物理の事実");
    // 太字の印は残さない
    for (const c of clues) expect(c.text).not.toContain("**");
    // 最後の「見つからなかった手がかり」は C20 に混ざらない
    expect(clues[19].text).not.toContain("見つからず");
  });

  it("答えは A1〜A11・M1〜M5・H1〜H9。文の中に続けて書いた M も読む", () => {
    const answer = parseAnswer(answerMd);
    expect(answer.filter((a) => a.kind === "step").map((a) => a.id)).toEqual(range("A", 11));
    expect(answer.filter((a) => a.kind === "modern").map((a) => a.id)).toEqual(range("M", 5));
    expect(answer.filter((a) => a.kind === "history").map((a) => a.id)).toEqual(range("H", 9));
    const m1 = answer.find((a) => a.id === "M1")!;
    expect(m1.title).toBe("締めつけ");
    expect(m1.text.startsWith("鉄の針金のかわりに")).toBe(true);
    const a5 = answer.find((a) => a.id === "A5")!;
    expect(a5.text).toContain("つながる仕組みは");
    expect(a5.text).not.toMatch(/^出典/m);
  });

  it("小さな例の文からも読める", () => {
    const md = "## 見た目\n\n**C1 模様**\n本文 1\n出典：https://a.example/x ／ https://b.example/y\n\n## 物理\n**C2 熱**\n本文 2\n";
    const clues = parseClues(md);
    expect(clues).toEqual([
      { id: "C1", title: "模様", text: "本文 1", section: "見た目", sources: ["https://a.example/x", "https://b.example/y"] },
      { id: "C2", title: "熱", text: "本文 2", section: "物理", sources: [] },
    ]);
  });

  it("並べる技は、手がかりと答えがそろったものだけ（中身のない「準備中」は出さない）", () => {
    expect(mokume.status).toBe("ready");
    expect(mokume.clues).toHaveLength(20);
    expect(mokume.answer.filter((a) => a.kind === "step")).toHaveLength(11);
    for (const t of TECHNIQUES) {
      expect(t.status).toBe("ready");
      expect(t.clues.length).toBeGreaterThan(0);
      expect(t.answer.length).toBeGreaterThan(0);
    }
  });
});

describe("条件ごとの手がかり", () => {
  it("品物だけ：品物の見た目と使われている金属（C1〜C9）だけ", () => {
    expect(observe.sections).toEqual(["品物の見た目", "使われている金属"]);
    const clues = cluesFor(mokume, observe);
    expect(clues.map((c) => c.id)).toEqual(range("C", 9));
    // 時代・道具・物理の手がかりは入らない
    for (const id of ["C12", "C16", "C17", "C18", "C20"]) expect(clues.some((c) => c.id === id)).toBe(false);
  });

  it("すべて：20 個すべて", () => {
    expect(cluesFor(mokume, all).map((c) => c.id)).toEqual(range("C", 20));
  });
});

describe("指示", () => {
  const forbidden = /木目金|杢目金|mokume/i;
  for (const id of ["observe", "all"] as const) {
    it(`仮説の指示（${id}）には、技の名前も URL も入らない`, () => {
      const c = mokume.conditions.find((x) => x.id === id)!;
      const p = hypothesisPrompt(mokume, c);
      expect(p).not.toMatch(forbidden);
      expect(p).not.toMatch(/https?:\/\//);
      expect(p).not.toMatch(/www\.|\.jp\b|\.com\b|\.org\b/);
      expect(hypothesisUserMessage(mokume, c)).not.toMatch(forbidden);
      // 渡した手がかりだけが入る
      for (const clue of cluesFor(mokume, c)) expect(p).toContain(`${clue.id} ${clue.title}`);
      expect(p).toContain("prior");
      expect(p).toContain(PROPOSE_PROCESS.name);
      expect(p.length).toBeLessThan(40_000);
    });
  }

  it("品物だけの指示には、時代や物理の手がかりが入らない", () => {
    const p = hypothesisPrompt(mokume, observe);
    expect(p).not.toContain("C18 ");
    expect(p).not.toContain("廃刀令");
    expect(p).not.toContain("拡散接合");
  });

  it("採点の指示には、答えの工程と仮説が入る（URL は入れない）", () => {
    const p = gradePrompt(mokume, goodHypothesis());
    for (const id of range("A", 11)) expect(p).toContain(`${id} `);
    expect(p).toContain("板を重ねる");
    expect(p).toContain("もともとの知識から");
    expect(p).toContain(GRADE_PROCESS.name);
    expect(p).not.toMatch(/https?:\/\//);
    expect(p.length).toBeLessThan(40_000);
    expect(gradeUserMessage()).toContain(GRADE_PROCESS.name);
  });
});

// ---- 道具の入力 ----

const clues = mokume.clues;

function step(title: string, clue_ids: string[], basis: "clues" | "prior" = "clues", confidence = 2) {
  return { title, detail: `${title}をする`, clue_ids, basis, confidence };
}

function goodInput() {
  return {
    steps: [
      step("板を用意する", ["C5", "C7"]),
      step("板を重ねる", ["C3"], "clues", 3),
      step("熱してつなぐ", [], "prior", 1),
      step("彫る", ["C3", "C16"]),
      step("叩いて平らにする", ["C15"]),
    ],
    trials: [{ what: "銅と銀の切れ端を重ねて熱する", why: "とかさずにつながるかが分かる" }],
    summary: "色のちがう板を重ねてつなぎ、彫って平らにする。",
  };
}

function goodHypothesis(): Hypothesis {
  const r = parseProposeProcess(goodInput(), clues);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe("propose_process の入力", () => {
  it("正しい入力を受け付ける", () => {
    const r = parseProposeProcess(goodInput(), clues);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.steps).toHaveLength(5);
    expect(r.value.steps[2].basis).toBe("prior");
    expect(r.warnings).toBeUndefined();
  });

  it("渡していない番号は外し、番号が無くなった clues は prior にする（警告つき）", () => {
    const input = goodInput();
    input.steps[0].clue_ids = ["C5", "C99"];
    input.steps[1].clue_ids = ["C18"]; // 品物だけの条件では渡していない
    const r = parseProposeProcess(input, cluesFor(mokume, observe));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.steps[0].clue_ids).toEqual(["C5"]);
    expect(r.value.steps[0].basis).toBe("clues");
    expect(r.value.steps[1].clue_ids).toEqual([]);
    expect(r.value.steps[1].basis).toBe("prior");
    expect(r.warnings?.some((w) => w.includes("C99"))).toBe(true);
    expect(r.warnings?.some((w) => w.includes("prior"))).toBe(true);
  });

  it("形のおかしい入力は理由つきで断る", () => {
    const few = { ...goodInput(), steps: goodInput().steps.slice(0, 2) };
    expect(parseProposeProcess(few, clues)).toMatchObject({ ok: false, error: expect.stringContaining("3〜12") });
    const badConf = goodInput();
    (badConf.steps[0] as { confidence: number }).confidence = 4;
    expect(parseProposeProcess(badConf, clues)).toMatchObject({ ok: false, error: expect.stringContaining("confidence") });
    const badBasis = goodInput();
    (badBasis.steps[0] as { basis: string }).basis = "web";
    expect(parseProposeProcess(badBasis, clues).ok).toBe(false);
    expect(parseProposeProcess({ ...goodInput(), trials: [] }, clues).ok).toBe(false);
    expect(parseProposeProcess({ ...goodInput(), summary: " " }, clues).ok).toBe(false);
    expect(parseProposeProcess(null, clues).ok).toBe(false);
  });
});

function goodGradeInput() {
  return {
    steps: [
      { n: 1, verdict: "match", answer_ids: ["A1"], note: "同じ" },
      { n: 2, verdict: "match", answer_ids: ["A3"], note: "同じ" },
      { n: 3, verdict: "match", answer_ids: ["A5"], note: "同じ" },
      { n: 4, verdict: "partial", answer_ids: ["A8"], note: "深さの話がない" },
      { n: 5, verdict: "match", answer_ids: ["A9", "A8"], note: "同じ" },
    ],
    missed: [
      { answer_id: "A2", note: "みがく" },
      { answer_id: "A4", note: "締めつけ" },
    ],
    summary: "大筋は合っている。",
  };
}

describe("grade_process の入力", () => {
  const answer = mokume.answer;

  it("正しい入力を受け付ける", () => {
    const r = parseGradeProcess(goodGradeInput(), goodHypothesis(), answer);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.steps.map((s) => s.verdict)).toEqual(["match", "match", "match", "partial", "match"]);
    expect(r.value.missed.map((m) => m.answer_id)).toEqual(["A2", "A4"]);
    expect(r.warnings).toBeUndefined();
  });

  it("無い番号は外し、番号の無い match は miss に、採点の無い工程も miss にする", () => {
    const input = goodGradeInput();
    input.steps[0].answer_ids = ["A99"];
    input.steps.pop(); // 5 番目の採点が無い
    input.missed.push({ answer_id: "A3", note: "当たっているのに挙げた" }, { answer_id: "Z1", note: "?" });
    const r = parseGradeProcess(input, goodHypothesis(), answer);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.steps[0]).toMatchObject({ verdict: "miss", answer_ids: [] });
    expect(r.value.steps[4]).toMatchObject({ n: 5, verdict: "miss" });
    expect(r.value.missed.map((m) => m.answer_id)).toEqual(["A2", "A4"]);
    expect(r.warnings?.length).toBeGreaterThanOrEqual(4);
  });

  it("n が仮説の範囲の外なら断る", () => {
    const input = goodGradeInput();
    input.steps[0].n = 6;
    expect(parseGradeProcess(input, goodHypothesis(), answer)).toMatchObject({ ok: false, error: expect.stringContaining("1〜5") });
    const bad = goodGradeInput();
    (bad.steps[0] as { verdict: string }).verdict = "ok";
    expect(parseGradeProcess(bad, goodHypothesis(), answer).ok).toBe(false);
  });
});

describe("点数", () => {
  it("当たった本当の工程を数え、手がかりからともともとの知識からに分ける", () => {
    const h = goodHypothesis();
    const g = parseGradeProcess(goodGradeInput(), h, mokume.answer);
    if (!g.ok) throw new Error(g.error);
    const t = tally(h, g.value, mokume.answer);
    expect(t).toEqual({
      steps: 5,
      match: 4,
      partial: 1,
      miss: 0,
      answerSteps: 11,
      covered: 5, // A1・A3・A5・A8・A9
      coverage: 5 / 11,
      clueBackedMatch: 4, // A5 だけが prior の工程から
      priorMatch: 1,
      priorSteps: 1,
    });
    expect(scoreLine(t)).toBe("本当の工程 11 のうち 5 にたどり着いた（手がかりから 4・もともとの知識から 1）");
  });

  it("同じ本当の工程に clues と prior の両方が当たれば、手がかりからと数える", () => {
    const h = goodHypothesis();
    const g: Grade = {
      steps: [
        { n: 1, verdict: "miss", answer_ids: [], note: "" },
        { n: 2, verdict: "partial", answer_ids: ["A5"], note: "" },
        { n: 3, verdict: "match", answer_ids: ["A5", "M2"], note: "" },
        { n: 4, verdict: "miss", answer_ids: [], note: "" },
        { n: 5, verdict: "miss", answer_ids: [], note: "" },
      ],
      missed: [],
      summary: "",
    };
    const t = tally(h, g, mokume.answer);
    expect(t).toMatchObject({ match: 1, partial: 1, miss: 3, covered: 1, clueBackedMatch: 1, priorMatch: 0 });
  });

  it("答えが空なら割合は 0", () => {
    const h = goodHypothesis();
    const t = tally(h, { steps: [], missed: [], summary: "" }, []);
    expect(t.coverage).toBe(0);
    expect(t.answerSteps).toBe(0);
  });
});

// ---- Claude を 1 回呼ぶ助け ----

type Block = Record<string, unknown>;

function message(stop_reason: string, content: Block[]): ClaudeMessage {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "test-model",
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as ClaudeMessage;
}
const toolUse = (id: string, name: string, input: unknown): Block => ({ type: "tool_use", id, name, input });
const textBlock = (t: string): Block => ({ type: "text", text: t });

type Reply = { status?: number; body?: unknown; raw?: string; headers?: Record<string, string> } | "network-error";

function fakeFetch(replies: Reply[]) {
  const requests: { url: string; headers: Record<string, string>; body: { messages: ClaudeMessageParam[]; system?: string; tools: { name: string }[] } }[] = [];
  const impl: typeof fetch = async (input, init) => {
    const n = requests.length;
    requests.push({ url: String(input), headers: (init?.headers ?? {}) as Record<string, string>, body: JSON.parse(String(init?.body)) });
    const r = replies[n];
    if (!r || r === "network-error") throw new TypeError("Failed to fetch");
    const payload = r.raw ?? JSON.stringify(r.body);
    return new Response(payload, { status: r.status ?? 200, headers: { "content-type": "application/json", ...r.headers } });
  };
  return { impl, requests };
}

const proposeOpts = (f: ReturnType<typeof fakeFetch>) => ({
  system: hypothesisPrompt(mokume, all),
  user: hypothesisUserMessage(mokume, all),
  tool: PROPOSE_PROCESS,
  parse: (input: unknown) => parseProposeProcess(input, clues),
  password: "あいことば",
  fetch: f.impl,
});

describe("callTool", () => {
  it("道具の入力を受け取り、残りの回数も返す", async () => {
    const input = goodInput();
    input.steps[0].clue_ids = ["C5", "C99"];
    const f = fakeFetch([
      { body: message("tool_use", [textBlock("考えます"), toolUse("t1", "propose_process", input)]), headers: { [REMAINING_HEADER]: "7" } },
    ]);
    const r = await callTool(proposeOpts(f));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.steps).toHaveLength(5);
    expect(r.remaining).toBe(7);
    expect(r.warnings?.[0]).toContain("C99");
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0].url).toBe("/api/claude");
    expect(f.requests[0].body.tools.map((t) => t.name)).toEqual(["propose_process"]);
    expect(f.requests[0].body.system).toBe(hypothesisPrompt(mokume, all));
    expect(decodeURIComponent(f.requests[0].headers[PASSWORD_HEADER])).toBe("あいことば");
  });

  it("文だけで返事をしたら 1 回だけ頼み直す", async () => {
    const f = fakeFetch([
      { body: message("end_turn", [textBlock("工程はこうです…")]) },
      { body: message("tool_use", [toolUse("t2", "propose_process", goodInput())]) },
    ]);
    const r = await callTool(proposeOpts(f));
    expect(r.ok).toBe(true);
    expect(f.requests).toHaveLength(2);
    const msgs = f.requests[1].body.messages;
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(JSON.stringify(msgs[2].content)).toContain("propose_process");
  });

  it("2 回とも文だけなら、あきらめて理由を返す", async () => {
    const f = fakeFetch([
      { body: message("end_turn", [textBlock("a")]) },
      { body: message("end_turn", [textBlock("b")]) },
    ]);
    const r = await callTool(proposeOpts(f));
    expect(r).toMatchObject({ ok: false, code: "no_tool" });
    expect(f.requests).toHaveLength(2);
  });

  it("入力の形がおかしければ、理由を返して 1 回だけ出し直してもらう", async () => {
    const f = fakeFetch([
      { body: message("tool_use", [toolUse("t3", "propose_process", { steps: [], trials: [], summary: "x" })]) },
      { body: message("tool_use", [toolUse("t4", "propose_process", goodInput())]) },
    ]);
    const r = await callTool(proposeOpts(f));
    expect(r.ok).toBe(true);
    const last = f.requests[1].body.messages.at(-1)!;
    const result = (last.content as unknown as Block[])[0];
    expect(result).toMatchObject({ type: "tool_result", tool_use_id: "t3", is_error: true });
    expect(String(result.content)).toContain("3〜12");
  });

  it("合言葉が違う（401）ときは、関数の返した言葉と理由を返す", async () => {
    const f = fakeFetch([{ status: 401, body: { error: { code: "wrong_password", message: "合言葉が違います。" } } }]);
    const r = await callTool(proposeOpts(f));
    expect(r).toEqual({ ok: false, error: "合言葉が違います。", code: "wrong_password", status: 401, remaining: undefined });
  });

  it("中身の読めない失敗は、番号つきの日本語にする", async () => {
    const f = fakeFetch([{ status: 502, raw: "<html>Bad Gateway</html>" }]);
    const r = await callTool(proposeOpts(f));
    expect(r).toMatchObject({ ok: false, status: 502, error: expect.stringContaining("502") });
  });

  it("つながらないときは offline", async () => {
    const f = fakeFetch(["network-error"]);
    const r = await callTool(proposeOpts(f));
    expect(r).toMatchObject({ ok: false, code: "offline", error: expect.stringContaining("つながりません") });
  });

  it("採点の道具でも同じに使える", async () => {
    const h = goodHypothesis();
    const f = fakeFetch([{ body: message("tool_use", [toolUse("g1", "grade_process", goodGradeInput())]) }]);
    const r = await callTool({
      system: gradePrompt(mokume, h),
      user: gradeUserMessage(),
      tool: GRADE_PROCESS,
      parse: (input) => parseGradeProcess(input, h, mokume.answer),
      fetch: f.impl,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(scoreLine(tally(h, r.value, mokume.answer))).toContain("11 のうち 5");
    // 合言葉が無ければヘッダーも付けない
    expect(f.requests[0].headers[PASSWORD_HEADER]).toBeUndefined();
  });
});

describe("サーバーが組み立て直すの道具を通す", () => {
  it("propose_process と grade_process は通し、ほかの名前は通さない", async () => {
    const { isAllowedToolName } = await import("../src/claude/tools");
    const { PROPOSE_PROCESS, GRADE_PROCESS } = await import("../src/rebuild/tools");
    expect(isAllowedToolName(PROPOSE_PROCESS.name)).toBe(true);
    expect(isAllowedToolName(GRADE_PROCESS.name)).toBe(true);
    expect(isAllowedToolName("web_search")).toBe(false);
  });
});

describe("赤ペン", () => {
  it("印の座標を 0〜1 におさめ、目安帳にない決まりの id は外す", async () => {
    const { parseRedPen, marksSvg } = await import("../src/claude/redpen");
    const r = parseRedPen(
      {
        marks: [
          { on: "you", kind: "circle", x1: 0.5, y1: 1.4, x2: 0.9, y2: 0, label: "動いている" },
          { on: "master", kind: "arrow", x1: 0.1, y1: 0.1, x2: 0.3, y2: 0.3, label: "ここ" },
          { on: "x", kind: "circle", x1: 0, y1: 0, x2: 0, y2: 0, label: "" },
        ],
        comment: "金属を持つ手を、すり板に押し付けて止めましょう。",
        rule_id: "nai",
        ask_master: "",
      },
      ["hold"],
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.marks).toHaveLength(2);
    expect(r.value.marks[0].y1).toBe(1);
    expect(r.value.marks[0].x2).toBe(0.3);
    expect(r.value.rule_id).toBe("");
    expect(marksSvg(r.value.marks, "you", 9 / 16)).toContain("ellipse");
    expect(marksSvg(r.value.marks, "master", 9 / 16)).toContain("marker-end");
  });
  it("ひとことがないものは受け付けない", async () => {
    const { parseRedPen } = await import("../src/claude/redpen");
    expect(parseRedPen({ marks: [], comment: " ", rule_id: "", ask_master: "" }, []).ok).toBe(false);
  });
});
