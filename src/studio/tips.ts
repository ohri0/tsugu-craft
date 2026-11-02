// 話して残す：職人が話したことを、Claude が「どの工程の、どんなコツか」に分けて、作品の記録に入れる。
// 次に同じ工程を作る人の画面には「前の記録から」として出る。画面に依存しない。
import type { ClaudeTool } from "../claude/wire";
import type { WorkRecord } from "./works";

export type TipKind = "コツ" | "注意" | "判断";

export interface Tip {
  /** 工程の題（作り方の工程の題と同じ） */
  step: string;
  text: string;
  kind: TipKind;
}

export const SORT_TIPS: ClaudeTool = {
  name: "sort_tips",
  description: "職人が話したことを、作り方の工程ごとの短いコツに分けて残す。必ず 1 回だけ呼ぶ。",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      tips: {
        type: "array",
        description: "工程ごとのコツ。話に出てきたことだけ。足したり作ったりしない",
        items: {
          type: "object",
          properties: {
            step: { type: "string", description: "工程の題。渡した一覧の題をそのまま書く" },
            text: { type: "string", description: "コツを 1 文で。職人の言い方をなるべく残し、やさしい日本語で" },
            kind: { type: "string", enum: ["コツ", "注意", "判断"], description: "コツ＝うまくやる方法、注意＝失敗しやすい所、判断＝なぜそう決めたか" },
          },
          required: ["step", "text", "kind"],
          additionalProperties: false,
        },
      },
      left_over: { type: "string", description: "どの工程にも当てはまらなかった話（なければ空の文字）" },
    },
    required: ["tips", "left_over"],
    additionalProperties: false,
  },
};

export function tipsPrompt(steps: string[]): string {
  return `あなたは「継ぐ」の中で、職人が話したことを、作り方の工程ごとのコツに分けて残す係です。sort_tips を 1 回だけ呼びます。
- 工程の一覧：${steps.map((s) => `「${s}」`).join("、")}。step にはこの題をそのまま書きます。
- 話に出てきたことだけを書きます。話にない数字やコツを足しません。
- 1 つのコツは 1 文。職人の言い方（「〜は浅めに」など）をなるべく残します。
- どの工程にも当てはまらない話は left_over に書きます。
- Markdown の記号は使いません。`;
}

export interface SortedTips {
  tips: Tip[];
  leftOver: string;
}

export function parseTips(steps: string[]) {
  return (input: unknown): { ok: true; value: SortedTips } | { ok: false; error: string } => {
    if (typeof input !== "object" || input === null) return { ok: false, error: "入力の形が正しくありません" };
    const r = input as Record<string, unknown>;
    if (!Array.isArray(r.tips)) return { ok: false, error: "tips は配列です" };
    const tips: Tip[] = [];
    for (const t of r.tips as Record<string, unknown>[]) {
      const step = typeof t?.step === "string" ? t.step.trim() : "";
      const text = typeof t?.text === "string" ? t.text.trim() : "";
      const kind = (["コツ", "注意", "判断"] as const).find((k) => k === t?.kind) ?? "コツ";
      if (!text) continue;
      if (!steps.includes(step)) return { ok: false, error: `step「${step}」は工程の一覧にありません。一覧の題をそのまま書いてください` };
      tips.push({ step, text, kind });
    }
    return { ok: true, value: { tips, leftOver: typeof r.left_over === "string" ? r.left_over.trim() : "" } };
  };
}

export interface PastTip extends Tip {
  maker: string;
  date: string;
  title: string;
}

/** 前の記録から、この工程のコツを新しい順に（同じ文は 1 回だけ） */
export function tipsFor(works: WorkRecord[], step: string, max = 3): PastTip[] {
  const out: PastTip[] = [];
  const seen = new Set<string>();
  for (const w of works)
    for (const t of w.tips ?? [])
      if (t.step === step && !seen.has(t.text)) {
        seen.add(t.text);
        out.push({ ...t, maker: w.maker, date: w.date, title: w.title });
        if (out.length >= max) return out;
      }
  return out;
}
