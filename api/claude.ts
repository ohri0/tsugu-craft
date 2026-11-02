// Claude API を呼ぶ、ただ 1 つの serverless 関数（Vercel の Node の実行環境。Web 標準の Request / Response で書く）。
//
// - API キー（ANTHROPIC_API_KEY）は process.env からだけ読む。ログにも返事にも出さない。
// - 画面から { messages, system?, tools } を受け取り、Messages API に 1 回だけ送って、返事をそのまま返す。
//   道具の実行と「結果を返して続ける」繰り返しは画面の中（src/claude/loop.ts）。
// - 公開ページの守り：合言葉（DEMO_PASSWORD）と、1 日の回数の上限（DAILY_LIMIT）。
//   Claude Console 側でも使える金額の上限を決めておく（docs/SPEC.md「公開しても安全にするための決まり」）。
import Anthropic from "@anthropic-ai/sdk";
import { timingSafeEqual } from "node:crypto";
import { isToolName } from "../src/claude/tools";
import {
  PASSWORD_HEADER,
  REMAINING_HEADER,
  type ClaudeErrorBody,
  type ClaudeErrorCode,
  type ClaudeMessage,
  type ClaudeMessageParam,
  type ClaudeTool,
} from "../src/claude/wire";

/** 使うモデル */
export const MODEL = "claude-opus-5-5";

/**
 * Messages API に送る決まった設定。
 * - max_tokens：考える分も含めて 16000。1 回の返事は道具の呼び出しか短いまとめなので足りる。
 * - effort：medium（このモデルの標準）。手順の多い道具の作業に向き、待ち時間も長くなりすぎない。
 * - thinking：adaptive（考える量はモデルが決める）。display を updates にすると、道具の合間の短い経過のメモが届き、
 *   画面の「作業の記録」に出せる（考えている中身そのものは返らない）。
 * - fallbacks：default。安全の仕組みが誤って断ったとき、サーバー側で決まった別のモデルがやり直す。
 * - cache_control：会話の前の部分（道具の定義・指示・ここまでのやり取り）を使い回し、繰り返しの回を安く速くする。
 */
const REQUEST_SETTINGS = {
  model: MODEL,
  max_tokens: 16000,
  betas: ["server-side-fallback-2026-07-01", "thinking-display-updates-2026-08-18"],
  fallbacks: "default",
  thinking: { type: "adaptive", display: "updates" },
  output_config: { effort: "medium" },
  cache_control: { type: "ephemeral" },
} satisfies Partial<Anthropic.Beta.Messages.MessageCreateParamsNonStreaming>;

/** 受け取る中身の上限。Vercel の関数が受け取れる大きさ（約 4.5 MB）より少し小さく。画像（look の結果や写真）が入るので大きめ。 */
const LIMITS = {
  bodyBytes: 4_000_000,
  messages: 80,
  systemChars: 40_000,
  tools: 8,
  /** Claude を待つ時間（ミリ秒）と、やり直しの回数 */
  timeoutMs: 120_000,
  maxRetries: 1,
} as const;

/** 日本時間の日付（1 日の回数を数える区切り） */
function dayKeyJst(nowMs: number): string {
  return new Date(nowMs + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 長さの違いも含めて、かかる時間が中身によらない比べ方（合言葉を 1 文字ずつ当てられないように） */
function samePassword(given: string, expected: string): boolean {
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

function decodeHeader(v: string | null): string {
  if (v === null) return "";
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

type ParsedBody = { messages: ClaudeMessageParam[]; system?: string; tools: ClaudeTool[] };

/** 受け取った中身を確かめる。画面以外から好きな道具や指示を混ぜて使われないよう、道具は「継ぐ」のものだけ通す。 */
function parseBody(raw: unknown): { ok: true; body: ParsedBody } | { ok: false; message: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, message: "送られた中身の形が正しくありません。" };
  const { messages, system, tools } = raw as Record<string, unknown>;
  if (!Array.isArray(messages) || messages.length === 0) return { ok: false, message: "会話（messages）がありません。" };
  if (messages.length > LIMITS.messages) return { ok: false, message: "会話が長すぎます。新しく始めてください。" };
  for (const m of messages) {
    const role = (m as { role?: unknown } | null)?.role;
    const content = (m as { content?: unknown } | null)?.content;
    if ((role !== "user" && role !== "assistant") || (typeof content !== "string" && !Array.isArray(content))) {
      return { ok: false, message: "会話の形が正しくありません。" };
    }
  }
  if (system !== undefined && (typeof system !== "string" || system.length > LIMITS.systemChars)) {
    return { ok: false, message: "指示（system）の形が正しくないか、長すぎます。" };
  }
  if (!Array.isArray(tools) || tools.length > LIMITS.tools) return { ok: false, message: "道具（tools）の形が正しくありません。" };
  for (const t of tools) {
    const tool = t as { name?: unknown; type?: unknown; input_schema?: unknown } | null;
    const custom = tool?.type === undefined || tool?.type === null || tool?.type === "custom";
    if (!custom || typeof tool?.name !== "string" || !isToolName(tool.name) || typeof tool.input_schema !== "object") {
      return { ok: false, message: "「継ぐ」の道具ではないものが入っています。" };
    }
  }
  return {
    ok: true,
    body: { messages: messages as ClaudeMessageParam[], system: system as string | undefined, tools: tools as ClaudeTool[] },
  };
}

function json(status: number, data: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

function fail(status: number, code: ClaudeErrorCode, message: string, headers?: Record<string, string>): Response {
  const body: ClaudeErrorBody = { error: { code, message } };
  return json(status, body, headers);
}

/** SDK の失敗を、画面に出せる日本語に直す（細かいものから順に見る） */
function fromApiError(e: unknown, headers: Record<string, string>): Response {
  if (e instanceof Anthropic.BadRequestError) {
    return fail(400, "claude_rejected_request", "Claude に送った中身に問題がありました。会話を新しく始めてください。", headers);
  }
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return fail(500, "claude_auth", "サーバーの API キーが使えません。管理する人に知らせてください。", headers);
  }
  if (e instanceof Anthropic.RateLimitError) {
    return fail(429, "claude_rate_limited", "Claude が混み合っています。少し待ってから、もう一度試してください。", headers);
  }
  if (e instanceof Anthropic.InternalServerError) {
    return fail(503, "claude_busy", "Claude が今、応えられません。決まりごとから作った案を出します。", headers);
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return fail(504, "claude_unreachable", "Claude につながりませんでした。決まりごとから作った案を出します。", headers);
  }
  if (e instanceof Anthropic.APIError) {
    return fail(502, "claude_error", `Claude とのやり取りに失敗しました（${e.status ?? "不明"}）。`, headers);
  }
  return fail(500, "internal", "サーバーの中で思わぬ失敗がありました。", headers);
}

/** Messages API を 1 回呼ぶ所。テストでは偽物に差し替える。 */
export type CreateMessage = (
  params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
) => Promise<ClaudeMessage>;

export interface HandlerDeps {
  /** 毎回読む（開発のサーバーが .env を後から入れても効くように） */
  env?: () => Record<string, string | undefined>;
  createMessage?: (apiKey: string) => CreateMessage;
  now?: () => number;
}

function sdkCreateMessage(apiKey: string): CreateMessage {
  // キーは明示して渡す（ほかの場所の認証情報を拾わないように）
  const client = new Anthropic({ apiKey, timeout: LIMITS.timeoutMs, maxRetries: LIMITS.maxRetries });
  return (params) => client.beta.messages.create(params);
}

/**
 * 関数の本体を作る。
 *
 * 1 日の回数は、関数の入れ物（インスタンス）の記憶の中で数える。手軽だが限りがある：
 * - Vercel は入れ物を複数立てたり、しばらく使わないと捨てたりするので、数は入れ物ごとで、捨てられると 0 に戻る。
 *   つまり「おおよその上限」でしかない。きちんと守るには、外の保存先（Vercel KV / Upstash など）で数える。
 * - 本当の歯止めは Claude Console で決める使える金額の上限。こちらは使いすぎを早めに止めるためのもの。
 */
export function createHandler(deps: HandlerDeps = {}): (request: Request) => Promise<Response> {
  const env = deps.env ?? (() => process.env);
  const makeCreate = deps.createMessage ?? sdkCreateMessage;
  const now = deps.now ?? Date.now;
  const counter = { day: "", count: 0 };

  return async (request) => {
    if (request.method !== "POST") {
      return fail(405, "method_not_allowed", "この呼び方には応えられません（POST で呼んでください）。", { allow: "POST" });
    }
    const e = env();
    const apiKey = e.ANTHROPIC_API_KEY;
    const password = e.DEMO_PASSWORD;
    if (!apiKey || !password) {
      // どちらが足りないかは書かない（外の人に設定の様子を見せない）
      return fail(500, "server_not_configured", "サーバーの設定が終わっていません。管理する人は .env（または公開先の環境変数）を確かめてください。");
    }
    if (!samePassword(decodeHeader(request.headers.get(PASSWORD_HEADER)), password)) {
      return fail(401, "wrong_password", "合言葉が違います。");
    }

    const limit = Number(e.DAILY_LIMIT);
    const dailyLimit = Number.isFinite(limit) && limit >= 0 ? Math.floor(limit) : 200;
    const today = dayKeyJst(now());
    if (counter.day !== today) {
      counter.day = today;
      counter.count = 0;
    }
    if (counter.count >= dailyLimit) {
      return fail(429, "daily_limit", "今日使える回数を使い切りました。見本の石で動きを見てください（明日また使えます）。", {
        [REMAINING_HEADER]: "0",
      });
    }

    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > LIMITS.bodyBytes) return fail(413, "too_large", "送る中身が大きすぎます。写真を小さくしてください。");
    let text: string;
    try {
      text = await request.text();
    } catch {
      return fail(400, "bad_request", "送られた中身が読めませんでした。");
    }
    if (Buffer.byteLength(text, "utf8") > LIMITS.bodyBytes) {
      return fail(413, "too_large", "送る中身が大きすぎます。写真を小さくしてください。");
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return fail(400, "bad_request", "送られた中身が JSON ではありません。");
    }
    const parsed = parseBody(raw);
    if (!parsed.ok) return fail(400, "bad_request", parsed.message);

    // 呼ぶ前に数える（失敗しても 1 回と数える。失敗の繰り返しで使いすぎないように）
    counter.count++;
    const headers = { [REMAINING_HEADER]: String(Math.max(0, dailyLimit - counter.count)) };

    try {
      const message = await makeCreate(apiKey)({
        ...REQUEST_SETTINGS,
        messages: parsed.body.messages,
        tools: parsed.body.tools,
        ...(parsed.body.system ? { system: parsed.body.system } : {}),
      });
      return json(200, message, headers);
    } catch (err) {
      // 中身（会話・キー）は書かず、失敗の種類だけ残す
      const status = err instanceof Anthropic.APIError ? err.status : undefined;
      console.error(`[api/claude] ${err instanceof Error ? err.constructor.name : "Error"} status=${status ?? "-"}`);
      return fromApiError(err, headers);
    }
  };
}

/** 入れ物が生きている間は、この 1 つを使い回す（1 日の回数を数えるため） */
export const handle = createHandler();

export function POST(request: Request): Promise<Response> {
  return handle(request);
}
