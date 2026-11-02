// 「組み立て直す」で Claude を 1 回だけ呼び、決まった道具の入力を受け取る小さな助け。
// 道具を使わずに文だけで返事をしたら 1 回だけ頼み直し、入力の形がおかしければ 1 回だけ理由を返して出し直してもらう。
// API キーは画面に置かない。送り先は /api/claude（src/claude/loop.ts と同じ形で送る）。
import {
  CLAUDE_ENDPOINT,
  isClaudeErrorBody,
  PASSWORD_HEADER,
  REMAINING_HEADER,
  type ClaudeContentBlockParam,
  type ClaudeMessage,
  type ClaudeMessageParam,
  type ClaudeRequestBody,
  type ClaudeTool,
  type ClaudeToolResultBlockParam,
  type ClaudeToolUseBlock,
} from "../claude/wire";

export interface CallToolOptions<T> {
  system: string;
  /** 人の言葉。画像を添えるときは中身の並び（文と画像）で渡す */
  user: string | ClaudeContentBlockParam[];
  tool: ClaudeTool;
  parse: (input: unknown) => { ok: true; value: T; warnings?: string[] } | { ok: false; error: string };
  /** 公開ページの合言葉 */
  password?: string;
  endpoint?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

export type CallToolResult<T> =
  | { ok: true; value: T; remaining?: number; warnings?: string[] }
  | { ok: false; error: string; code?: string; status?: number; remaining?: number };

const MESSAGES = {
  offline: "Claude につながりませんでした。通信を確かめて、もう一度試してください。",
  aborted: "止めました。",
  notFound: "Claude を呼ぶ所が見つかりませんでした（404）。",
  badResponse: "Claude の返事の形が読めませんでした。",
  refused: "この内容には Claude が答えませんでした。",
  noTool: "Claude が道具を使わずに返事をしたので、結果を受け取れませんでした。もう一度試してください。",
  others: "この道具は 1 回だけ呼んでください。",
} as const;

type Outcome =
  | { ok: true; message: ClaudeMessage; remaining?: number }
  | { ok: false; error: string; code?: string; status?: number; remaining?: number };

function readRemaining(res: Response): number | undefined {
  const v = res.headers.get(REMAINING_HEADER);
  if (v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

async function post(
  fetchImpl: typeof fetch,
  endpoint: string,
  body: ClaudeRequestBody,
  password: string | undefined,
  signal: AbortSignal | undefined,
): Promise<Outcome> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (password) headers[PASSWORD_HEADER] = encodeURIComponent(password);
  let res: Response;
  try {
    res = await fetchImpl(endpoint, { method: "POST", headers, body: JSON.stringify(body), signal });
  } catch {
    if (signal?.aborted) return { ok: false, error: MESSAGES.aborted, code: "aborted" };
    return { ok: false, error: MESSAGES.offline, code: "offline" };
  }
  const remaining = readRemaining(res);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = undefined;
  }
  if (res.ok) {
    const isMessage = typeof data === "object" && data !== null && Array.isArray((data as { content?: unknown }).content);
    return isMessage
      ? { ok: true, message: data as ClaudeMessage, remaining }
      : { ok: false, error: MESSAGES.badResponse, status: res.status, remaining };
  }
  if (isClaudeErrorBody(data)) {
    return { ok: false, error: data.error.message, code: data.error.code, status: res.status, remaining };
  }
  if (res.status === 404) return { ok: false, error: MESSAGES.notFound, status: 404, remaining };
  return { ok: false, error: `Claude とのやり取りに失敗しました（${res.status}）。`, status: res.status, remaining };
}

function errorResult(id: string, text: string): ClaudeToolResultBlockParam {
  return { type: "tool_result", tool_use_id: id, is_error: true, content: text };
}

/** Claude を呼び、tool の入力を parse で確かめて返す */
export async function callTool<T>(opts: CallToolOptions<T>): Promise<CallToolResult<T>> {
  const fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init));
  const endpoint = opts.endpoint ?? CLAUDE_ENDPOINT;
  const name = opts.tool.name;
  const messages: ClaudeMessageParam[] = [{ role: "user", content: opts.user }];
  let remaining: number | undefined;
  let askedForTool = false;
  let sentError = false;

  // 最初の 1 回 ＋ 文だけの返事への頼み直し 1 回 ＋ 形の直し 1 回 ＝ 多くて 3 回
  for (;;) {
    if (opts.signal?.aborted) return { ok: false, error: MESSAGES.aborted, code: "aborted", remaining };
    const out = await post(fetchImpl, endpoint, { messages, system: opts.system, tools: [opts.tool] }, opts.password, opts.signal);
    if (out.remaining !== undefined) remaining = out.remaining;
    if (!out.ok) return { ...out, remaining };
    const message = out.message;
    if (message.stop_reason === "refusal") return { ok: false, error: MESSAGES.refused, code: "refused", remaining };

    const uses = message.content.filter((b): b is ClaudeToolUseBlock => b.type === "tool_use");
    const use = uses.find((b) => b.name === name);
    // 返事は中身を変えずにそのまま会話に足す（thinking の部分も含めて）
    messages.push({ role: "assistant", content: message.content as ClaudeContentBlockParam[] });
    // ほかの呼び出しにも結果を付けて、会話を正しい形にしておく
    const others = uses.filter((b) => b !== use).map((b) => errorResult(b.id, MESSAGES.others));

    if (!use) {
      if (askedForTool) return { ok: false, error: MESSAGES.noTool, code: "no_tool", remaining };
      askedForTool = true;
      messages.push({
        role: "user",
        content: [
          ...others,
          { type: "text", text: `${name} の道具を 1 回だけ呼んで、答えを出してください。文だけの返事は受け取れません。` },
        ],
      });
      continue;
    }

    const parsed = opts.parse(use.input);
    if (parsed.ok) {
      return { ok: true, value: parsed.value, remaining, ...(parsed.warnings?.length ? { warnings: parsed.warnings } : {}) };
    }
    if (sentError) {
      return { ok: false, error: `Claude の答えの形が正しくありませんでした：${parsed.error}`, code: "bad_input", remaining };
    }
    sentError = true;
    messages.push({
      role: "user",
      content: [
        errorResult(use.id, `入力の形が正しくありません：${parsed.error}。直して、${name} をもう一度 1 回だけ呼んでください。`),
        ...others,
      ],
    });
  }
}
