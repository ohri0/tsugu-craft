// Claude とのつなぎのテスト。本物の Claude は呼ばず、偽の fetch・偽の道具・偽の Messages API で確かめる。
import { describe, expect, it } from "vitest";
import { createHandler, MODEL, type CreateMessage } from "../api/claude";
import { LOOP_LIMITS, runClaude } from "../src/claude/loop";
import { JEWELER_GUIDES, skillBody, SYSTEM_PROMPT } from "../src/claude/prompt";
import { parseToolCall, TOOL_NAMES, TOOLS, type SettingState, type ToolHost } from "../src/claude/tools";
import { PASSWORD_HEADER, REMAINING_HEADER, type ClaudeMessage, type ClaudeMessageParam } from "../src/claude/wire";
import { GUIDE_NOTE } from "../src/rules/guides";

// ---- 偽物 ----

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
/** 会話の 1 つの中身を、テストで読みやすい形で取り出す */
const blocks = (m: ClaudeMessageParam | undefined): Block[] => (m?.content ?? []) as unknown as Block[];
const toolUse = (id: string, name: string, input: unknown): Block => ({ type: "tool_use", id, name, input });
const text = (t: string): Block => ({ type: "text", text: t });

type Reply = { status?: number; body?: unknown; raw?: string; headers?: Record<string, string> } | "network-error";

/** 決めた順に返事を返す fetch。送られた中身を残す。 */
function fakeFetch(replies: Reply[] | ((n: number) => Reply)) {
  const requests: { url: string; headers: Record<string, string>; body: { messages: ClaudeMessageParam[]; system?: string; tools: { name: string }[] } }[] = [];
  const impl: typeof fetch = async (input, init) => {
    const n = requests.length;
    requests.push({
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      // 送った後で会話の配列が伸びても、その時の中身を残す
      body: JSON.parse(String(init?.body)),
    });
    const r = typeof replies === "function" ? replies(n) : replies[n];
    if (!r || r === "network-error") throw new TypeError("Failed to fetch");
    const payload = r.raw ?? JSON.stringify(r.body);
    return new Response(payload, { status: r.status ?? 200, headers: { "content-type": "application/json", ...r.headers } });
  };
  return { impl, requests };
}

interface Ring {
  setting: SettingState;
  gou: number;
}

function fakeHost(opts: { failCheck?: boolean } = {}) {
  const ring: Ring = {
    setting: {
      style: "prong",
      prong_count: 4,
      v_prong_count: 0,
      prong_mm: 0.8,
      prong_positions: [],
      height: "standard",
      orientation: "along",
      bezel_wall_mm: null,
    },
    gou: 11,
  };
  const calls: string[] = [];
  const host: ToolHost<Ring> = {
    setSetting(input) {
      calls.push("set_setting");
      const { reason: _reason, ...rest } = input;
      Object.assign(ring.setting, rest);
      return { setting: { ...ring.setting }, hold: { value: 1.1, required: 1.0, where: "top", note: GUIDE_NOTE } };
    },
    setShank(input) {
      calls.push("set_shank");
      if (input.gou !== undefined) ring.gou = input.gou;
      return {
        shank: { width_mm: 2.2, thickness_mm: 1.6, gou: ring.gou, inner_diameter_mm: 16.33, metal: "pt900" },
        weight_g: 3.2,
      };
    },
    check() {
      calls.push("check");
      if (opts.failCheck) throw new Error("確かめの計算に失敗");
      return { problems: [], passed: ["石の一番下と指のすき間"], note: GUIDE_NOTE };
    },
    look(input) {
      calls.push("look");
      return { view: input.view, media_type: "image/png", data: "iVBORw0KGgo=" };
    },
    snapshot: () => structuredClone(ring),
    restore: (s) => {
      ring.setting = structuredClone(s.setting);
      ring.gou = s.gou;
    },
  };
  return { host, ring, calls };
}

const start: ClaudeMessageParam[] = [{ role: "user", content: "華奢に。手をよく使います。" }];

// ---- 繰り返し ----

describe("Claude との作業の繰り返し", () => {
  it("道具を実行し、結果を返して、書き終えるまで続ける", async () => {
    const { host, ring, calls } = fakeHost();
    const f = fakeFetch([
      { body: message("tool_use", [text("爪を 6 本にします。"), toolUse("t1", "set_setting", { prong_count: 6, reason: "手をよく使うので支えを増やす" })]) },
      { body: message("tool_use", [toolUse("t2", "check", {})]) },
      { body: message("end_turn", [text("やったこと：爪を 6 本に。確かめたこと：問題なし。残っていること：なし。")]) },
    ]);
    const r = await runClaude({ host, messages: start, fetch: f.impl, password: "あいことば" });

    expect(r.status).toBe("done");
    expect(r.offline).toBe(false);
    expect(calls).toEqual(["set_setting", "check"]);
    expect(ring.setting.prong_count).toBe(6);
    expect(r.finalText).toContain("やったこと");

    // 送った中身：道具の定義と指示が付き、合言葉はヘッダーに（日本語なのでエンコードして）
    expect(f.requests).toHaveLength(3);
    expect(f.requests[0].url).toBe("/api/claude");
    expect(f.requests[0].body.tools.map((t) => t.name)).toEqual([...TOOL_NAMES]);
    expect(f.requests[0].body.system).toBe(SYSTEM_PROMPT);
    expect(decodeURIComponent(f.requests[0].headers[PASSWORD_HEADER])).toBe("あいことば");

    // 2 回目には、1 回目の返事と道具の結果が順に入っている
    const second = f.requests[1].body.messages;
    expect(second).toHaveLength(3);
    expect(second[1].role).toBe("assistant");
    const results = blocks(second[2]);
    expect(results[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(JSON.parse(String(results[0].content)).setting.prong_count).toBe(6);

    // 作業の記録：文・道具・理由
    const tools = r.log.filter((e) => e.kind === "tool");
    expect(tools.map((e) => e.tool)).toEqual(["set_setting", "check"]);
    expect(tools[0]).toMatchObject({ ok: true, reason: "手をよく使うので支えを増やす", turn: 1 });
    expect(r.log.some((e) => e.kind === "note" && e.text === "爪を 6 本にします。")).toBe(true);

    // 次に続けられる形で終わっている
    expect(r.messages.at(-1)?.role).toBe("assistant");
  });

  it("1 つの返事の中の複数の呼び出しは、書かれた順に実行し、結果を 1 つにまとめて返す", async () => {
    const { host, calls } = fakeHost();
    const f = fakeFetch([
      {
        body: message("tool_use", [
          toolUse("a", "set_setting", { height: "low", reason: "引っかかりにくく" }),
          toolUse("b", "set_shank", { gou: 9, reason: "サイズ" }),
          toolUse("c", "check", {}),
        ]),
      },
      { body: message("end_turn", [text("おわり")]) },
    ]);
    await runClaude({ host, messages: start, fetch: f.impl });
    expect(calls).toEqual(["set_setting", "set_shank", "check"]);
    const msgs = f.requests[1].body.messages;
    const results = blocks(msgs[msgs.length - 1]);
    expect(results.map((b) => b.tool_use_id)).toEqual(["a", "b", "c"]);
  });

  it("look の結果は画像として返す", async () => {
    const { host } = fakeHost();
    const f = fakeFetch([
      { body: message("tool_use", [toolUse("l", "look", { view: "angle" })]) },
      { body: message("end_turn", [text("華奢に見えます")]) },
    ]);
    await runClaude({ host, messages: start, fetch: f.impl });
    const results = blocks(f.requests[1].body.messages[2]);
    const content = results[0].content as Block[];
    expect(content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } });
  });

  it("おかしな入力は道具に通さず、理由をつけて Claude に返す", async () => {
    const { host, calls } = fakeHost();
    const f = fakeFetch([
      {
        body: message("tool_use", [
          toolUse("x", "set_setting", { prong_count: 40, reason: "多めに" }),
          toolUse("y", "make_coffee", {}),
          toolUse("z", "set_shank", { gou: 9 }),
        ]),
      },
      { body: message("end_turn", [text("直します")]) },
    ]);
    const r = await runClaude({ host, messages: start, fetch: f.impl });
    expect(calls).toEqual([]);
    const results = blocks(f.requests[1].body.messages[2]);
    expect(results.every((b) => b.is_error === true)).toBe(true);
    expect(String(results[0].content)).toContain("3〜8");
    expect(r.log.filter((e) => e.kind === "tool" && !e.ok)).toHaveLength(3);
    // 形は変わっていないので、戻すものもない
    expect(r.changed).toBe(false);
    expect(r.undo()).toBe(false);
  });

  it("道具が失敗しても止まらず、失敗として Claude に返す", async () => {
    const { host } = fakeHost({ failCheck: true });
    const f = fakeFetch([
      { body: message("tool_use", [toolUse("c", "check", {})]) },
      { body: message("end_turn", [text("確かめられませんでした")]) },
    ]);
    const r = await runClaude({ host, messages: start, fetch: f.impl });
    expect(r.status).toBe("done");
    const results = blocks(f.requests[1].body.messages[2]);
    expect(results[0].is_error).toBe(true);
    expect(String(results[0].content)).toContain("確かめの計算に失敗");
  });

  it("回数の上限で止まり、会話は正しい形で終わる", async () => {
    const { host, calls } = fakeHost();
    let i = 0;
    const f = fakeFetch(() => ({
      body: message("tool_use", [toolUse(`s${++i}`, "set_setting", { prong_mm: 0.9, reason: "太く" })]),
    }));
    const r = await runClaude({ host, messages: start, fetch: f.impl, maxTurns: 4 });
    expect(r.status).toBe("turn_limit");
    expect(f.requests).toHaveLength(4);
    // 最後の回の呼び出しは実行しない
    expect(calls).toHaveLength(3);
    // 最後の 1 つ前に「次が最後」と伝えている
    const toLast = blocks(f.requests[3].body.messages.at(-1)!);
    expect(toLast.at(-1)).toMatchObject({ type: "text" });
    // 呼び出しには必ず結果が付いている
    const last = r.messages.at(-1)!;
    expect(last.role).toBe("user");
    expect(blocks(last)[0]).toMatchObject({ type: "tool_result", tool_use_id: "s4", is_error: true });
  });

  it("確かめは最初の 1 回 ＋ 直して 3 周まで", async () => {
    expect(LOOP_LIMITS.maxChecks).toBe(4);
    const { host, calls } = fakeHost();
    let i = 0;
    const f = fakeFetch((n) =>
      n < 6 ? { body: message("tool_use", [toolUse(`c${++i}`, "check", {})]) } : { body: message("end_turn", [text("まとめ")]) },
    );
    const r = await runClaude({ host, messages: start, fetch: f.impl });
    expect(calls.filter((c) => c === "check")).toHaveLength(4);
    const refused = r.log.filter((e) => e.kind === "tool" && !e.ok);
    expect(refused).toHaveLength(2);
    expect(refused[0].kind === "tool" && refused[0].error).toContain("4 回まで");
    expect(r.status).toBe("done");
  });

  it("「この作業を全部戻す」で、Claude が変える前に戻る", async () => {
    const { host, ring } = fakeHost();
    const before = structuredClone(ring);
    const f = fakeFetch([
      { body: message("tool_use", [toolUse("a", "set_setting", { style: "bezel", height: "high", reason: "取れにくく" })]) },
      { body: message("tool_use", [toolUse("b", "set_shank", { gou: 15, reason: "サイズ直し" })]) },
      { body: message("end_turn", [text("おわり")]) },
    ]);
    const r = await runClaude({ host, messages: start, fetch: f.impl });
    expect(ring.setting.style).toBe("bezel");
    expect(ring.gou).toBe(15);
    expect(r.changed).toBe(true);
    expect(r.undo()).toBe(true);
    expect(ring).toEqual(before);
  });

  it("通信できないときは offline を返し、それまでの作業も戻せる", async () => {
    const { host, ring } = fakeHost();
    const f = fakeFetch([
      { body: message("tool_use", [toolUse("a", "set_setting", { prong_count: 6, reason: "支えを増やす" })]) },
      "network-error",
    ]);
    const r = await runClaude({ host, messages: start, fetch: f.impl });
    expect(r.status).toBe("offline");
    expect(r.offline).toBe(true);
    expect(r.error?.message).toContain("決まりごと");
    expect(r.log.filter((e) => e.kind === "tool")).toHaveLength(1);
    expect(r.undo()).toBe(true);
    expect(ring.setting.prong_count).toBe(4);
  });

  it("関数が置かれていない（404）・Claude が応えないときも offline、合言葉違いはそうではない", async () => {
    const { host } = fakeHost();
    const notFound = await runClaude({ host, messages: start, fetch: fakeFetch([{ status: 404, raw: "<html>Not Found</html>" }]).impl });
    expect(notFound.offline).toBe(true);

    const busy = await runClaude({
      host,
      messages: start,
      fetch: fakeFetch([{ status: 503, body: { error: { code: "claude_busy", message: "応えられません" } } }]).impl,
    });
    expect(busy.offline).toBe(true);
    expect(busy.error?.code).toBe("claude_busy");

    const wrong = await runClaude({
      host,
      messages: start,
      fetch: fakeFetch([{ status: 401, body: { error: { code: "wrong_password", message: "合言葉が違います。" } } }]).impl,
    });
    expect(wrong.offline).toBe(false);
    expect(wrong.status).toBe("error");
    expect(wrong.error).toEqual({ code: "wrong_password", message: "合言葉が違います。" });
  });

  it("断られた返事の道具は動かさず、会話にも足さない", async () => {
    const { host, calls } = fakeHost();
    const f = fakeFetch([{ body: message("refusal", [toolUse("a", "set_setting", { reason: "x" })]) }]);
    const r = await runClaude({ host, messages: start, fetch: f.impl });
    expect(r.status).toBe("refused");
    expect(calls).toEqual([]);
    expect(r.messages).toEqual(start);
  });

  it("途中で切れた返事の道具は動かさない", async () => {
    const { host, calls } = fakeHost();
    const f = fakeFetch([{ body: message("max_tokens", [toolUse("a", "set_setting", { prong_count: 6 })]) }]);
    const r = await runClaude({ host, messages: start, fetch: f.impl });
    expect(r.status).toBe("error");
    expect(calls).toEqual([]);
    expect(blocks(r.messages.at(-1)!)[0]).toMatchObject({ type: "tool_result", is_error: true });
  });

  it("道具の合間の経過のメモ（thinking）は記録に残し、空のものは残さない", async () => {
    const { host } = fakeHost();
    const f = fakeFetch([
      {
        body: message("tool_use", [
          { type: "thinking", thinking: "", signature: "s" },
          { type: "thinking", thinking: "角が守られていないので V 字の爪を考える", signature: "s" },
          toolUse("c", "check", {}),
        ]),
        headers: { [REMAINING_HEADER]: "41" },
      },
      { body: message("end_turn", [text("おわり")]) },
    ]);
    const r = await runClaude({ host, messages: start, fetch: f.impl });
    const notes = r.log.filter((e) => e.kind === "note");
    expect(notes.map((n) => n.kind === "note" && n.source)).toEqual(["progress", "text"]);
    expect(r.remaining).toBe(41);
    // thinking の部分も変えずに送り返している
    expect(blocks(f.requests[1].body.messages[1]).filter((b) => b.type === "thinking")).toHaveLength(2);
  });

  it("人が止めたら、それ以上呼ばない", async () => {
    const { host } = fakeHost();
    const ac = new AbortController();
    const f = fakeFetch(() => {
      ac.abort();
      return { body: message("tool_use", [toolUse("c", "check", {})]) };
    });
    const r = await runClaude({ host, messages: start, fetch: f.impl, signal: ac.signal });
    expect(r.status).toBe("aborted");
    expect(f.requests).toHaveLength(1);
  });
});

// ---- 道具の定義 ----

describe("道具の定義", () => {
  it("仕様書の 4 つの道具が、strict で、理由を求める", () => {
    expect(TOOLS.map((t) => t.name)).toEqual(["set_setting", "set_shank", "check", "look"]);
    for (const t of TOOLS) {
      expect(t.strict).toBe(true);
      expect(t.description).toBeTruthy();
      expect((t.input_schema as { additionalProperties?: boolean }).additionalProperties).toBe(false);
    }
    expect(TOOLS[0].input_schema.required).toEqual(["reason"]);
    expect(TOOLS[1].input_schema.required).toEqual(["reason"]);
    expect(TOOLS[2].description).toContain("選択肢は答えではない");
  });

  it("入力を型と範囲で確かめる", () => {
    expect(parseToolCall("check", {}).ok).toBe(true);
    expect(parseToolCall("set_setting", { height: "standard", prong_positions: [0, 45], reason: "標準" }).ok).toBe(true);
    expect(parseToolCall("set_setting", { height: "tall", reason: "x" }).ok).toBe(false);
    expect(parseToolCall("set_setting", { prong_count: 4.5, reason: "x" }).ok).toBe(false);
    expect(parseToolCall("set_setting", { prong_count: 4, reason: " " }).ok).toBe(false);
    expect(parseToolCall("set_setting", { color: "red", reason: "x" }).ok).toBe(false);
    expect(parseToolCall("look", {}).ok).toBe(false);
    expect(parseToolCall("look", null).ok).toBe(false);
  });
});

// ---- 指示 ----

describe("Claude への指示", () => {
  it("Skill（職人の目安）を、見出しを除いてそのまま埋め込む", () => {
    expect(JEWELER_GUIDES.startsWith("# 職人の目安")).toBe(true);
    expect(JEWELER_GUIDES).not.toContain("name: jeweler-guides");
    expect(SYSTEM_PROMPT).toContain(JEWELER_GUIDES);
    expect(skillBody("---\nname: a\n---\n本文")).toBe("本文");
    expect(skillBody("見出しなし")).toBe("見出しなし");
  });

  it("役割・選択肢から選んで理由を残す・目安・分からない、を伝える", () => {
    expect(SYSTEM_PROMPT).toContain("理由を言います");
    expect(SYSTEM_PROMPT).toContain("選択肢");
    expect(SYSTEM_PROMPT).toContain(GUIDE_NOTE);
    expect(SYSTEM_PROMPT).toContain("「分からない」");
  });
});

// ---- serverless 関数 ----

describe("api/claude の関数", () => {
  const env = { ANTHROPIC_API_KEY: "test-key-not-real", DEMO_PASSWORD: "ひみつ", DAILY_LIMIT: "2" };
  const body = JSON.stringify({ messages: start, system: "指示", tools: TOOLS });

  function setup(overrides: Partial<typeof env> = {}, reply?: () => Promise<ClaudeMessage>) {
    const sent: Parameters<CreateMessage>[0][] = [];
    const keys: string[] = [];
    const handler = createHandler({
      env: () => ({ ...env, ...overrides }),
      createMessage: (apiKey) => {
        keys.push(apiKey);
        return async (params) => {
          sent.push(params);
          return reply ? reply() : message("end_turn", [text("こんにちは")]);
        };
      },
      now: () => Date.UTC(2026, 10, 2, 3, 0, 0),
    });
    return { handler, sent, keys };
  }
  const post = (b = body, password = "ひみつ") =>
    new Request("http://localhost/api/claude", {
      method: "POST",
      headers: { "content-type": "application/json", [PASSWORD_HEADER]: encodeURIComponent(password) },
      body: b,
    });

  it("合言葉が合えば、道具の定義と一緒に Messages API に送り、返事をそのまま返す", async () => {
    const { handler, sent, keys } = setup();
    const res = await handler(post());
    expect(res.status).toBe(200);
    expect(res.headers.get(REMAINING_HEADER)).toBe("1");
    const data = (await res.json()) as ClaudeMessage;
    expect(data.content[0]).toMatchObject({ type: "text", text: "こんにちは" });
    expect(keys).toEqual(["test-key-not-real"]);
    expect(sent[0].model).toBe(MODEL);
    expect(sent[0].max_tokens).toBeGreaterThanOrEqual(4000);
    expect(sent[0].system).toBe("指示");
    expect(sent[0].tools?.map((t) => (t as { name: string }).name)).toEqual([...TOOL_NAMES]);
    // キーは返事のどこにも出ない
    expect(JSON.stringify(data)).not.toContain("test-key-not-real");
  });

  it("合言葉が違えば 401、数えない", async () => {
    const { handler, sent } = setup();
    const res = await handler(post(body, "ちがう"));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("wrong_password");
    expect(sent).toHaveLength(0);
    expect((await handler(post())).status).toBe(200);
  });

  it("1 日の上限を超えたら 429", async () => {
    const { handler } = setup();
    expect((await handler(post())).status).toBe(200);
    expect((await handler(post())).status).toBe(200);
    const res = await handler(post());
    expect(res.status).toBe(429);
    const err = (await res.json()) as { error: { code: string; message: string } };
    expect(err.error.code).toBe("daily_limit");
    expect(err.error.message).toContain("今日");
  });

  it("キーか合言葉が設定されていなければ動かない", async () => {
    const noKey = setup({ ANTHROPIC_API_KEY: "" });
    const res = await noKey.handler(post());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).toContain("server_not_configured");
    expect((await setup({ DEMO_PASSWORD: "" }).handler(post(body, ""))).status).toBe(500);
  });

  it("POST 以外・JSON でない・Stone Fit の道具でないものは断る", async () => {
    const { handler, sent } = setup();
    expect((await handler(new Request("http://localhost/api/claude"))).status).toBe(405);
    expect((await handler(post("{ broken"))).status).toBe(400);
    const webSearch = JSON.stringify({ messages: start, tools: [{ type: "web_search_20260209", name: "web_search" }] });
    expect((await handler(post(webSearch))).status).toBe(400);
    const other = JSON.stringify({ messages: start, tools: [{ name: "send_email", input_schema: { type: "object" } }] });
    expect((await handler(post(other))).status).toBe(400);
    expect((await handler(post(JSON.stringify({ messages: [], tools: TOOLS })))).status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it("Claude につながらないときは、日本語の理由をつけて返す", async () => {
    const { APIConnectionError } = await import("@anthropic-ai/sdk");
    const { handler } = setup({}, async () => {
      throw new APIConnectionError({ message: "connection refused" });
    });
    const res = await handler(post());
    expect(res.status).toBe(504);
    const err = (await res.json()) as { error: { code: string; message: string } };
    expect(err.error.code).toBe("claude_unreachable");
    expect(err.error.message).toContain("つながりません");
  });
});
