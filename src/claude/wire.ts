// 画面（src/claude/loop.ts）と serverless 関数（api/claude.ts）の間でやり取りする形。
// 両方がここを読むので、片方だけ変えて食い違うことがない。
// Claude API のデータの形は SDK の型をそのまま使う（自分で作り直さない）。型だけ読むので、画面の大きさは増えない。
import type Anthropic from "@anthropic-ai/sdk";

export type ClaudeMessage = Anthropic.Beta.BetaMessage;
export type ClaudeMessageParam = Anthropic.Beta.BetaMessageParam;
export type ClaudeTool = Anthropic.Beta.BetaTool;
export type ClaudeContentBlock = Anthropic.Beta.BetaContentBlock;
export type ClaudeContentBlockParam = Anthropic.Beta.BetaContentBlockParam;
export type ClaudeToolUseBlock = Anthropic.Beta.BetaToolUseBlock;
export type ClaudeToolResultBlockParam = Anthropic.Beta.BetaToolResultBlockParam;

/** 画面から呼ぶ所 */
export const CLAUDE_ENDPOINT = "/api/claude";

/**
 * 公開ページの合言葉を入れるヘッダー。
 * ヘッダーには日本語をそのまま入れられないので、encodeURIComponent してから入れる（受け取る側で戻す）。
 */
export const PASSWORD_HEADER = "x-tsugu-password";

/** 今日あと何回呼べるか（返事に付ける） */
export const REMAINING_HEADER = "x-tsugu-remaining";

/** 指示（system）の文字数の上限。関数が断る長さ（画面の指示がこれを超えないことを、テストで見張る） */
export const SYSTEM_MAX_CHARS = 40_000;

/** 画面から関数へ送る中身 */
export interface ClaudeRequestBody {
  messages: ClaudeMessageParam[];
  system?: string;
  tools: ClaudeTool[];
  /** fast＝考える量を少なくして速く返す（画面の前で待つ作業）。なければ ふつう */
  speed?: "fast";
}

/** うまくいかなかったときの理由。画面はこれを見て出し方を変える。 */
export type ClaudeErrorCode =
  | "method_not_allowed"
  | "bad_request"
  | "too_large"
  | "wrong_password"
  | "daily_limit"
  | "server_not_configured"
  | "claude_rejected_request"
  | "claude_auth"
  | "claude_rate_limited"
  | "claude_busy"
  | "claude_unreachable"
  | "claude_error"
  | "internal";

export interface ClaudeErrorBody {
  error: {
    code: ClaudeErrorCode;
    /** 画面にそのまま出せる日本語 */
    message: string;
  };
}

/** この理由のときは「通信できない」と同じに扱い、決まりごとから作った案に切り替える */
export const OFFLINE_ERROR_CODES: readonly ClaudeErrorCode[] = ["claude_unreachable", "claude_busy"];

export function isClaudeErrorBody(v: unknown): v is ClaudeErrorBody {
  if (typeof v !== "object" || v === null) return false;
  const e = (v as { error?: unknown }).error;
  return typeof e === "object" && e !== null && typeof (e as { code?: unknown }).code === "string"
    && typeof (e as { message?: unknown }).message === "string";
}
