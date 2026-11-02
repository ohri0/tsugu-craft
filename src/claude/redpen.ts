// 赤ペン：手本と学ぶ人の同じ瞬間の画像を Claude が見て、学ぶ人の画像に印（丸・矢印・線）を描き、ひとこと添える。
// 先生が赤ペンで手本と見比べて直すのと同じ形。座標は画像の幅・高さに対する 0〜1。
import type { ClaudeTool } from "./wire";

export type MarkKind = "circle" | "arrow" | "line";
export type MarkOn = "you" | "master";

export interface Mark {
  on: MarkOn;
  kind: MarkKind;
  /** circle は中心、arrow・line は始まり */
  x1: number;
  y1: number;
  /** arrow・line の終わり。circle では半径（画像の幅に対して）を x2 に入れ、y2 は使わない */
  x2: number;
  y2: number;
  /** 印のそばに書く短い言葉（10 文字ほど） */
  label: string;
}

export interface RedPen {
  marks: Mark[];
  /** 学ぶ人へのひとこと（1〜2 文） */
  comment: string;
  /** もとにした職人の決まりの id（なければ空） */
  rule_id: string;
  /** 画像からは判断できず、職人に聞くべきこと（なければ空） */
  ask_master: string;
}

export const RED_PEN: ClaudeTool = {
  name: "red_pen",
  description:
    "手本（1 枚目の画像）と学ぶ人（2 枚目の画像）を見比べ、学ぶ人の画像に赤ペンの印を描いて、ひとこと添える。必ず 1 回だけ呼ぶ。" +
    "印は 1〜3 個。座標は画像の幅・高さに対する 0〜1（左上が 0,0）。手本の画像に、正しい形を示す印を 1 つ描いてもよい。",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      marks: {
        type: "array",
        description: "印（1〜3 個）",
        items: {
          type: "object",
          properties: {
            on: { type: "string", enum: ["you", "master"], description: "you＝学ぶ人の画像、master＝手本の画像" },
            kind: { type: "string", enum: ["circle", "arrow", "line"] },
            x1: { type: "number", description: "circle は中心、arrow・line は始まり（0〜1）" },
            y1: { type: "number" },
            x2: { type: "number", description: "arrow・line の終わり（0〜1）。circle は半径（画像の幅に対して、0.03〜0.3）" },
            y2: { type: "number", description: "arrow・line の終わり（0〜1）。circle は 0" },
            label: { type: "string", description: "印のそばに書く短い言葉（10 文字ほど）" },
          },
          required: ["on", "kind", "x1", "y1", "x2", "y2", "label"],
          additionalProperties: false,
        },
      },
      comment: { type: "string", description: "学ぶ人へのひとこと（1〜2 文、やさしい日本語）" },
      rule_id: { type: "string", description: "もとにした職人の決まりの id。なければ空の文字" },
      ask_master: { type: "string", description: "画像からは判断できず、職人に聞くべきこと。なければ空の文字" },
    },
    required: ["marks", "comment", "rule_id", "ask_master"],
    additionalProperties: false,
  },
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function parseRedPen(input: unknown, ruleIds: readonly string[]): { ok: true; value: RedPen; warnings?: string[] } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) return { ok: false, error: "入力の形が正しくありません" };
  const r = input as Record<string, unknown>;
  if (!Array.isArray(r.marks)) return { ok: false, error: "marks は印の並びで書いてください" };
  if (typeof r.comment !== "string" || !r.comment.trim()) return { ok: false, error: "comment（ひとこと）を書いてください" };
  const warnings: string[] = [];
  const marks: Mark[] = [];
  for (const m of r.marks.slice(0, 3)) {
    const k = m as Record<string, unknown>;
    if (!["you", "master"].includes(k.on as string) || !["circle", "arrow", "line"].includes(k.kind as string)) {
      warnings.push("形の分からない印を外しました");
      continue;
    }
    const nums = [k.x1, k.y1, k.x2, k.y2];
    if (!nums.every((v) => typeof v === "number" && Number.isFinite(v))) {
      warnings.push("座標が数でない印を外しました");
      continue;
    }
    const [x1, y1, x2, y2] = nums as number[];
    marks.push({
      on: k.on as MarkOn,
      kind: k.kind as MarkKind,
      x1: clamp01(x1),
      y1: clamp01(y1),
      x2: k.kind === "circle" ? Math.min(0.3, Math.max(0.03, x2)) : clamp01(x2),
      y2: k.kind === "circle" ? 0 : clamp01(y2),
      label: typeof k.label === "string" ? k.label.slice(0, 20) : "",
    });
  }
  const ruleId = typeof r.rule_id === "string" && ruleIds.includes(r.rule_id) ? r.rule_id : "";
  if (typeof r.rule_id === "string" && r.rule_id && !ruleId) warnings.push(`目安帳にない決まり ${r.rule_id} を外しました`);
  return {
    ok: true,
    value: { marks, comment: r.comment.trim(), rule_id: ruleId, ask_master: typeof r.ask_master === "string" ? r.ask_master.trim() : "" },
    ...(warnings.length ? { warnings } : {}),
  };
}

/** 赤ペンの印を、画像の上に重ねる SVG（viewBox は 0〜1000） */
export function marksSvg(marks: readonly Mark[], on: MarkOn, aspect: number): string {
  const W = 1000;
  const H = Math.round(W / aspect);
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const color = on === "you" ? "#e0412b" : "#e9b44c";
  const parts: string[] = [];
  for (const m of marks.filter((x) => x.on === on)) {
    const x1 = m.x1 * W;
    const y1 = m.y1 * H;
    if (m.kind === "circle") {
      const r = m.x2 * W;
      parts.push(`<ellipse class="pen" cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" rx="${r.toFixed(1)}" ry="${(r * 0.92).toFixed(1)}" transform="rotate(-8 ${x1.toFixed(1)} ${y1.toFixed(1)})"/>`);
      if (m.label) parts.push(label(x1, y1 - r - 14, m.label));
    } else {
      const x2 = m.x2 * W;
      const y2 = m.y2 * H;
      parts.push(`<line class="pen" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"${m.kind === "arrow" ? ` marker-end="url(#head-${on})"` : ""}/>`);
      if (m.label) parts.push(label(x1, y1 - 14, m.label));
    }
  }
  function label(x: number, y: number, t: string) {
    const yy = Math.max(40, y);
    return `<text class="pen-label" x="${x.toFixed(1)}" y="${yy.toFixed(1)}" text-anchor="middle">${esc(t)}</text>`;
  }
  return `<svg class="pen-layer" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" style="--pen:${color}">
    <defs><marker id="head-${on}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${color}"/></marker></defs>
    ${parts.join("")}
  </svg>`;
}

/** 赤ペンの指示 */
export function redPenPrompt(master: string, rulesText: string): string {
  return `あなたは「継ぐ」の赤ペン係です。${master}さんの手本と、学ぶ人の作業の、同じ形の瞬間の画像を 1 枚ずつ見比べます。
1 枚目が${master}さんの手本、2 枚目が学ぶ人です。どちらにも、手の点の骨組みと、手のひらの中心が前後 1 秒に通った跡（線）が描いてあります。跡が長いほど、手が動いています。

## やること

- red_pen を 1 回だけ呼び、学ぶ人の画像に、手本といちばん違う所の印を 1〜3 個描きます（丸・矢印・線）。手本の画像に、正しい形を示す印を 1 つ描いてもかまいません。
- 印の座標は、画像の中で本当にその物がある所に置きます（手・道具・金属）。見えない物に印を付けません。
- comment は、学ぶ人へのひとこと（1〜2 文）。何が違い、どう直すかを、${master}さんの決まりの言葉で言います。決まりにないコツや数字を作りません。
- 画像から言えるのは見た目の違いだけです。力の入れ方など、画像から分からないことは推し量らず、ask_master に${master}さんへの質問として書きます。
- 違いがほとんどないときは、印を 1 つだけにして、そう書きます。
- Markdown の記号は使いません。

## ${master}さんの決まり（目安帳）

${rulesText}`;
}
