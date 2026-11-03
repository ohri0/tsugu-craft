// 聞き取り（まだ決まっていない所）で Claude に頼む 2 つのこと：
// 1. ask_gap：決まった質問を、職人に聞きやすい 1 つの問いに言い直す。
// 2. gap_rule：職人の答えを、決まり 1 つにまとめる。
// どちらも、職人が言っていない数字を入れないように、受け取った後で数字を確かめる（合わなければ Claude なしの案に戻す）。
import type { ClaudeTool } from "./wire";
import { readNumbers, type Gap } from "../rules/gaps";

export const ASK_GAP: ClaudeTool = {
  name: "ask_gap",
  description: "帳面のまだ決まっていない所について、職人に聞く問いを 1 つ書く。必ず 1 回だけ呼ぶ。",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      question: { type: "string", description: "職人への問い 1 つ（やさしい日本語、60 文字ほどまで。数字で答えてほしいときは単位も書く）" },
    },
    required: ["question"],
    additionalProperties: false,
  },
};

export const GAP_RULE: ClaudeTool = {
  name: "gap_rule",
  description: "職人の答えを、帳面の決まり 1 つにまとめる。必ず 1 回だけ呼ぶ。",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      has_value: { type: "boolean", description: "答えの中に、決まりにする数字があるか" },
      value: { type: "number", description: "決まりにする数字（mm、割合は 0〜1、倍はそのまま）。has_value が false なら 0" },
      title: { type: "string", description: "決まりの短い名前（20 文字ほど）" },
      text: { type: "string", description: "決まりの言葉（1〜2 文）。職人が言っていない数字は書かない" },
      reason: { type: "string", description: "職人が言った理由。言っていなければ「（理由はまだ聞いていない）」" },
      follow_up: { type: "string", description: "答えがあいまいで決まりにできないとき、聞き直す問い。決まりにできるなら空の文字" },
    },
    required: ["has_value", "value", "title", "text", "reason", "follow_up"],
    additionalProperties: false,
  },
};

export interface GapRuleOut {
  has_value: boolean;
  value: number;
  title: string;
  text: string;
  reason: string;
  follow_up: string;
}

const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** 文の中の数字が、もとの文のどれかにある数字だけか（Claude が数字を作っていないか） */
export function numbersCameFrom(text: string, sources: string[]): boolean {
  const allowed = sources.flatMap((s) => readNumbers(s).flatMap((n) => [n.value, n.value * 100, n.value * 10]));
  return readNumbers(text).every((n) => allowed.some((a) => close(a, n.value)));
}

export function parseAskGap(input: unknown, gap: Gap): { ok: true; value: string } | { ok: false; error: string } {
  const q = (input as { question?: unknown } | null)?.question;
  if (typeof q !== "string" || !q.trim()) return { ok: false, error: "question を書いてください" };
  if (!numbersCameFrom(q, [gap.question, gap.why])) return { ok: false, error: "もとの問いにない数字を入れないでください" };
  return { ok: true, value: q.trim().slice(0, 160) };
}

/** 答えの中の数字だけを決まりにできる。割合（unit ""）は 0〜1 */
export function parseGapRule(input: unknown, gap: Gap, answer: string): { ok: true; value: GapRuleOut } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) return { ok: false, error: "入力の形が正しくありません" };
  const r = input as Record<string, unknown>;
  for (const k of ["title", "text", "reason", "follow_up"]) if (typeof r[k] !== "string") return { ok: false, error: `${k} を書いてください` };
  if (typeof r.has_value !== "boolean" || typeof r.value !== "number" || !Number.isFinite(r.value)) return { ok: false, error: "has_value と value の形が正しくありません" };
  const out = r as unknown as GapRuleOut;
  if (out.has_value) {
    const said = readNumbers(answer).flatMap((n) => [n.value, gap.unit === "" ? n.value / 100 : n.value]);
    const keep = gap.expects === "confirm" && gap.current !== undefined && close(out.value, gap.current);
    if (!keep && !said.some((v) => close(v, out.value))) return { ok: false, error: `value ${out.value} は職人の答えの中にない数字です` };
  }
  if (!numbersCameFrom(out.text, [answer, gap.question, gap.ruleText ?? ""])) return { ok: false, error: "text に、職人が言っていない数字があります" };
  return { ok: true, value: { ...out, title: out.title.trim().slice(0, 40), text: out.text.trim(), reason: out.reason.trim(), follow_up: out.follow_up.trim() } };
}

const ROLE = `あなたは「継ぐ」の聞き手です。職人の判断を帳面（目安帳）に残すため、帳面のまだ決まっていない所を、職人に 1 つずつ聞きます。
- やさしい日本語で、短く。専門の言葉には、ふつうの言葉を添えます。
- 職人が言っていない数字は、決して書きません。資料にある数字は、資料の数字として書きます。
- Markdown の記号は使いません。`;

export function askGapPrompt(craft: string, ledgerText: string): string {
  return `${ROLE}

## 仕事
決まった問いを、職人が答えやすい 1 つの問いに言い直し、ask_gap で返します。数字で答えてほしいときは単位（ミリ）を書きます。問いにない数字は足しません。

## 技
${craft}

## 今の帳面
<ledger>
${ledgerText}
</ledger>`;
}

export function gapRulePrompt(craft: string, ledgerText: string): string {
  return `${ROLE}

## 仕事
職人の答えを、帳面の決まり 1 つにまとめ、gap_rule で返します。
- value は、職人の答えの中の数字だけ（mm。割合は 0〜1）。「はい」「そのまま」なら今の値。数字がなければ has_value を false。
- text は「いつ・何を・どこまで」が分かる 1〜2 文。職人が言っていない数字・理由は足しません。
- 答えがあいまいで決まりにできないときは、follow_up に聞き直す問いを書きます。

## 技
${craft}

## 今の帳面
<ledger>
${ledgerText}
</ledger>`;
}

export function askGapUser(gap: Gap): string {
  return `まだ決まっていない所：${gap.title}\nなぜ聞くか：${gap.why}\n決まった問い：${gap.question}`;
}

export function gapRuleUser(gap: Gap, asked: string, answer: string): string {
  return `まだ決まっていない所：${gap.title}（${gap.expects === "number" ? "数字で答える" : gap.expects === "confirm" ? "「はい」か、ちがう数字・言葉で答える" : "言葉で答える"}）${gap.current !== undefined ? `\n今の値：${gap.current}` : ""}${gap.ruleText ? `\n確かめている決まり：${gap.ruleText}` : ""}\n聞いた問い：${asked}\n職人の答え（そのまま）：${answer}`;
}
