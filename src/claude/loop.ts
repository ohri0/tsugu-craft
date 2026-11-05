// 画面の中で回す、Claude との作業の繰り返し。
// /api/claude に会話を送る → 返事の中の道具の呼び出しを ToolHost で実行する → 結果を返す → また送る、を終わるまで続ける。
// API キーは画面に置かない。関数は 1 回の返事を取ってくるだけで、道具の実行はすべてここ（画面）でする。
import { SYSTEM_PROMPT, MAX_FIX_ROUNDS } from "./prompt";
import { CHANGING_TOOLS, parseToolCall, TOOLS, type ParsedToolCall, type ToolHost } from "./tools";
import {
  CLAUDE_ENDPOINT,
  isClaudeErrorBody,
  OFFLINE_ERROR_CODES,
  PASSWORD_HEADER,
  REMAINING_HEADER,
  type ClaudeContentBlockParam,
  type ClaudeTool,
  type ClaudeErrorCode,
  type ClaudeMessage,
  type ClaudeMessageParam,
  type ClaudeRequestBody,
  type ClaudeToolResultBlockParam,
  type ClaudeToolUseBlock,
} from "./wire";

/**
 * 1 回の作業の上限。
 * - check は、最初の 1 回 ＋ 直して確かめ直す 3 周（docs/SPEC.md「最大 3 周」）＝ 4 回まで。
 * - 呼ぶ回数（Claude の返事の数）は 12 回まで。組む（1〜2 回）＋ 確かめる（1 回）＋ 直して確かめる 3 周（各 2 回ほど）
 *   ＋ 見た目を見る（1 回）＋ まとめ（1 回）でおよそ 10 回なので、少し余裕を持たせた。
 *   道具は 1 つの返事で何本もまとめて呼べるので、ふつうはこれより少なく終わる。
 */
export const LOOP_LIMITS = {
  maxTurns: 12,
  maxChecks: 1 + MAX_FIX_ROUNDS,
} as const;

export interface ToolLogEntry {
  kind: "tool";
  /** 何回目の返事の中の呼び出しか（1 から） */
  turn: number;
  id: string;
  tool: string;
  input: unknown;
  /** Claude が残した理由（set_setting / set_shank） */
  reason?: string;
  ok: boolean;
  result?: unknown;
  error?: string;
  at: number;
}

export interface NoteLogEntry {
  kind: "note";
  turn: number;
  /** text＝Claude が書いた文、progress＝道具の合間の短い経過のメモ */
  source: "text" | "progress";
  text: string;
  at: number;
}

/** 画面の「作業の記録」に出すもの */
export type LogEntry = ToolLogEntry | NoteLogEntry;

/**
 * done：Claude が書き終えた / turn_limit：回数の上限で止めた / offline：つながらない（決まりごとから作った案に切り替える）
 * refused：Claude が答えなかった / error：そのほかの失敗 / aborted：人が止めた
 */
export type LoopStatus = "done" | "turn_limit" | "offline" | "refused" | "error" | "aborted";

export interface LoopOptions<S> {
  host: ToolHost<S>;
  /** ここまでの会話（最後は人の言葉）。続きから頼むときは、前の結果の messages に足して渡す。 */
  messages: ClaudeMessageParam[];
  system?: string;
  /** Claude に渡す道具（既定はすべて）。聞き取りでは propose_rule だけを渡す */
  tools?: ClaudeTool[];
  /** 公開ページの合言葉 */
  password?: string;
  /** fast＝考える量を少なくして速く返す */
  speed?: "fast";
  endpoint?: string;
  fetch?: typeof fetch;
  maxTurns?: number;
  maxChecks?: number;
  signal?: AbortSignal;
  /** 記録が 1 つ増えるたびに呼ぶ（画面に少しずつ出すため） */
  onLog?: (entry: LogEntry) => void;
  now?: () => number;
}

export interface LoopResult {
  status: LoopStatus;
  /** true なら画面は「決まりごとから」の案を出す */
  offline: boolean;
  /** 次に続けるときに渡す会話。道具の呼び出しには必ず結果が付いた、正しい形で終わる。 */
  messages: ClaudeMessageParam[];
  /** 最後の返事の文（やったこと・確かめたこと・残っていること） */
  finalText: string;
  log: LogEntry[];
  error?: { code?: ClaudeErrorCode; message: string };
  /** 今日あと何回呼べるか（分かれば） */
  remaining?: number;
  /** Claude が指輪の形を変えたか */
  changed: boolean;
  /** Claude がこの作業で変えたものを全部戻す。戻したら true。 */
  undo: () => boolean;
}

type CallOutcome =
  | { ok: true; message: ClaudeMessage; remaining?: number }
  | { ok: false; kind: "offline" | "error" | "aborted"; code?: ClaudeErrorCode; message: string; remaining?: number };

const MESSAGES = {
  offline: "Claude につながりませんでした。決まりごとから作った案を出します。",
  aborted: "作業を止めました。",
  badResponse: "Claude の返事の形が読めませんでした。",
  refused: "この内容には Claude が答えませんでした。言い方を変えてもう一度試してください。",
  truncated: "Claude の返事が長すぎて途中で切れました。",
  turnLimit: "作業の回数の上限に達したので、ここで止めました。",
  lastTurn: "次が最後の返事です。道具はもう使わず、やったこと・確かめたこと・残っていることをまとめてください。",
  notRun: "返事が途中で切れたので、この道具は実行しませんでした。",
} as const;

function readRemaining(res: Response): number | undefined {
  const v = res.headers.get(REMAINING_HEADER);
  if (v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function isMessage(v: unknown): v is ClaudeMessage {
  return typeof v === "object" && v !== null && Array.isArray((v as { content?: unknown }).content);
}

async function callOnce(
  fetchImpl: typeof fetch,
  endpoint: string,
  body: ClaudeRequestBody,
  password: string | undefined,
  signal: AbortSignal | undefined,
): Promise<CallOutcome> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (password) headers[PASSWORD_HEADER] = encodeURIComponent(password);
  let res: Response;
  try {
    res = await fetchImpl(endpoint, { method: "POST", headers, body: JSON.stringify(body), signal });
  } catch {
    if (signal?.aborted) return { ok: false, kind: "aborted", message: MESSAGES.aborted };
    // 通信そのものができない（電波がない、サーバーがない）
    return { ok: false, kind: "offline", message: MESSAGES.offline };
  }
  const remaining = readRemaining(res);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = undefined;
  }
  if (res.ok) {
    if (isMessage(data)) return { ok: true, message: data, remaining };
    return { ok: false, kind: "error", message: MESSAGES.badResponse, remaining };
  }
  if (isClaudeErrorBody(data)) {
    const { code, message } = data.error;
    const kind = OFFLINE_ERROR_CODES.includes(code) ? "offline" : "error";
    return { ok: false, kind, code, message, remaining };
  }
  // 関数が置かれていない（404）、公開先そのものが落ちている（5xx）などは、つながらないのと同じに扱う
  if (res.status === 404 || res.status >= 500) return { ok: false, kind: "offline", message: `${MESSAGES.offline}（サーバーの返事 ${res.status}）`, remaining };
  return { ok: false, kind: "error", message: `Claude とのやり取りに失敗しました（${res.status}）。`, remaining };
}

/** 返事の中の、人に見せる文と経過のメモ */
function notesOf(message: ClaudeMessage): { source: NoteLogEntry["source"]; text: string }[] {
  const out: { source: NoteLogEntry["source"]; text: string }[] = [];
  for (const b of message.content) {
    if (b.type === "text" && b.text.trim()) out.push({ source: "text", text: b.text.trim() });
    // 道具の合間のメモは thinking の形で届く（中身が空のものは出さない）
    if (b.type === "thinking" && b.thinking.trim()) out.push({ source: "progress", text: b.thinking.trim() });
  }
  return out;
}

function textOf(message: ClaudeMessage): string {
  return message.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("\n")
    .trim();
}

function errorResult(id: string, text: string): ClaudeToolResultBlockParam {
  return { type: "tool_result", tool_use_id: id, is_error: true, content: text };
}

async function dispatch<S>(host: ToolHost<S>, call: ParsedToolCall): Promise<unknown> {
  switch (call.name) {
    case "set_setting":
      return host.setSetting(call.input);
    case "set_shank":
      return host.setShank(call.input);
    case "check":
      return host.check();
    case "look":
      return host.look(call.input);
    case "propose_rule":
      if (!host.proposeRule) return { status: "declined", note: "この画面では決まりを足せません（聞き取りの画面で使ってください）" };
      return host.proposeRule(call.input);
    case "ask_teacher":
      if (!host.askTeacher) return { queued: false, note: "この画面では先生に回せません（教える画面で使ってください）。分からないことは、分からないと書いてください" };
      return host.askTeacher(call.input);
    case "set_stones":
      if (!host.setStones) return { layout: "solo", stones: [], note: "この画面では石を並べられません（一粒のまま）" };
      return host.setStones(call.input);
    case "choose_stone":
      // host.chooseStone がないときは、runTool が先に断っている
      return host.chooseStone!(call.input);
  }
}

/** Claude に作業を頼み、終わるまで道具を回す */
export async function runClaude<S>(opts: LoopOptions<S>): Promise<LoopResult> {
  const host = opts.host;
  const fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init));
  const endpoint = opts.endpoint ?? CLAUDE_ENDPOINT;
  const system = opts.system ?? SYSTEM_PROMPT;
  const maxTurns = Math.max(1, opts.maxTurns ?? LOOP_LIMITS.maxTurns);
  const maxChecks = Math.max(1, opts.maxChecks ?? LOOP_LIMITS.maxChecks);
  const now = opts.now ?? Date.now;

  const messages: ClaudeMessageParam[] = [...opts.messages];
  const log: LogEntry[] = [];
  let snapshot: { value: S } | undefined;
  let checks = 0;
  let finalText = "";
  let remaining: number | undefined;

  const record = (entry: LogEntry) => {
    log.push(entry);
    opts.onLog?.(entry);
  };
  const finish = (status: LoopStatus, error?: LoopResult["error"]): LoopResult => ({
    status,
    offline: status === "offline",
    messages,
    finalText,
    log,
    error,
    remaining,
    changed: snapshot !== undefined,
    undo: () => {
      if (!snapshot) return false;
      host.restore(snapshot.value);
      return true;
    },
  });

  const runTool = async (turn: number, block: ClaudeToolUseBlock): Promise<ClaudeToolResultBlockParam> => {
    const input = block.input as { reason?: unknown } | null;
    const entry: ToolLogEntry = {
      kind: "tool",
      turn,
      id: block.id,
      tool: block.name,
      input: block.input,
      reason: typeof input?.reason === "string" ? input.reason : undefined,
      ok: false,
      at: now(),
    };
    const fail = (text: string) => {
      entry.error = text;
      record(entry);
      return errorResult(block.id, text);
    };

    // 渡していない道具は、呼ばれても動かさない（「今の石を使う」で石が変わらないように）
    if (opts.tools && !opts.tools.some((t) => t.name === block.name)) return fail("この作業では、この道具は使えません");
    const parsed = parseToolCall(block.name, block.input);
    if (!parsed.ok) return fail(parsed.error);
    const call = parsed.call;
    if (call.name === "choose_stone" && !host.chooseStone) return fail("今の石を使う約束なので、石の形と大きさは変えられません");
    if (call.name === "check") {
      if (checks >= maxChecks) {
        return fail(`確かめは 1 回の作業で ${maxChecks} 回までです。ここで止めて、残っている問題は「残っていること」としてまとめてください。`);
      }
      checks++;
    }
    // 形を変える最初の道具の前に、今の指輪を写しておく（「この作業を全部戻す」のため）
    if (CHANGING_TOOLS.includes(call.name) && !snapshot) snapshot = { value: host.snapshot() };

    let result: unknown;
    try {
      result = await dispatch(host, call);
    } catch (e) {
      return fail(`道具がうまく動きませんでした：${e instanceof Error ? e.message : String(e)}`);
    }
    entry.ok = true;
    entry.result = result;
    record(entry);

    if (call.name === "look") {
      const img = result as { view: string; media_type: "image/png" | "image/jpeg" | "image/webp"; data: string };
      return {
        type: "tool_result",
        tool_use_id: block.id,
        content: [
          { type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } },
          { type: "text", text: `向き：${img.view}` },
        ],
      };
    }
    return { type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) };
  };

  for (let turn = 1; turn <= maxTurns; turn++) {
    if (opts.signal?.aborted) return finish("aborted", { message: MESSAGES.aborted });

    const outcome = await callOnce(fetchImpl, endpoint, { messages, system, tools: opts.tools ?? TOOLS, ...(opts.speed ? { speed: opts.speed } : {}) }, opts.password, opts.signal);
    if (outcome.remaining !== undefined) remaining = outcome.remaining;
    if (!outcome.ok) {
      return finish(outcome.kind === "offline" ? "offline" : outcome.kind, { code: outcome.code, message: outcome.message });
    }
    const message = outcome.message;

    // 途中で断られた返事は、道具の呼び出しが途中で切れていることがあるので、会話に足さず、道具も動かさない
    if (message.stop_reason === "refusal") return finish("refused", { message: MESSAGES.refused });

    for (const n of notesOf(message)) record({ kind: "note", turn, source: n.source, text: n.text, at: now() });
    const text = textOf(message);
    if (text) finalText = text;

    // 返事は中身を変えずにそのまま会話に足す（thinking の部分も含めて。変えると次の返事で使えなくなる）
    messages.push({ role: "assistant", content: message.content as ClaudeContentBlockParam[] });

    if (message.stop_reason === "pause_turn") continue;

    const toolUses = message.content.filter((b): b is ClaudeToolUseBlock => b.type === "tool_use");

    if (message.stop_reason === "max_tokens") {
      // 途中で切れた道具の入力は、形が正しく見えても中身が欠けていることがあるので、実行しない
      if (toolUses.length) messages.push({ role: "user", content: toolUses.map((b) => errorResult(b.id, MESSAGES.notRun)) });
      return finish("error", { message: MESSAGES.truncated });
    }
    if (message.stop_reason !== "tool_use" || toolUses.length === 0) {
      return message.stop_reason === "end_turn" || message.stop_reason === "stop_sequence"
        ? finish("done")
        : finish("error", { message: `Claude の返事が思わぬ形で終わりました（${message.stop_reason}）。` });
    }

    if (turn === maxTurns) {
      // 上限。会話が正しい形で終わるように、呼び出しには「実行しなかった」と返しておく
      messages.push({ role: "user", content: toolUses.map((b) => errorResult(b.id, MESSAGES.turnLimit)) });
      return finish("turn_limit", { message: MESSAGES.turnLimit });
    }

    // 1 つの返事の中の呼び出しは、書かれた順に 1 つずつ実行する（形を変える順番が大事なので）。
    // 結果はまとめて 1 つの返事にして返す。
    const results: ClaudeContentBlockParam[] = [];
    for (const block of toolUses) {
      if (opts.signal?.aborted) {
        results.push(errorResult(block.id, MESSAGES.aborted));
        continue;
      }
      results.push(await runTool(turn, block));
    }
    if (turn === maxTurns - 1) results.push({ type: "text", text: MESSAGES.lastTurn });
    messages.push({ role: "user", content: results });
  }
  // ここには来ない（上限の回は上で返す）
  return finish("turn_limit", { message: MESSAGES.turnLimit });
}
