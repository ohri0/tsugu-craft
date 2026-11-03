// 作り方の札（1 工程 1 枚）：番号・題・ひとこと・数字の表・「詳しく」の行。画面に依存しない。
//
// - 道具は、もう札の下に並べない。「詳しく」の「道具」の行に、押せる言葉として入れる。
// - 言葉の説明（ことば帳）は、process.ts の TERMS と、toolbox.ts の道具を 1 つにしたもの。
//   同じ物の言葉（芯金・バーナー など）は 1 つにまとめ、意味に道具の使い方を添える。
// - 印刷（指示書・作品の記録の帳面）も、同じ札の形を使う。
import type { Spec, Step } from "./howto";
import { TERMS, type Detail } from "./process";
import { KIND_LABEL, TOOLS, toolsForStep, type Tool } from "./toolbox";

/** ことば帳の 1 語 */
export interface Gloss {
  word: string;
  reading?: string;
  meaning: string;
  /** 道具なら：道具箱の名前・種類・使い方・気をつける所 */
  tool?: { name: string; kind: string; what: string; how: string[]; watch?: string };
}

/**
 * 道具 → 文の中で使う言葉。TERMS に同じ物の言葉があれば、その書き方にそろえる（糸のこ・木づち など）。
 * ここにない道具は、名前の（ ）の前を言葉にする。
 */
export const TOOL_WORD: Record<string, string> = {
  saw: "糸のこ",
  mallet: "木づち",
  "rolling-mill": "圧延機",
  mandrel: "芯金",
  torch: "バーナー",
  pickle: "酸洗い",
  burnisher: "ヘラ",
  "prong-pusher": "押し棒",
  sprue: "湯道",
  wax: "ワックス",
  buff: "バフ",
  solder: "ロウ",
  "wax-printer": "3D プリンター",
  "sprue-base": "ゴム台",
};

/** 道具の、文の中で使う言葉 */
export function toolWord(t: Tool): string {
  return TOOL_WORD[t.id] ?? t.name.replace(/（.*$/, "").trim();
}

let cache: Gloss[] | null = null;
/** ことば帳（TERMS と道具を 1 つに。同じ言葉は 1 つ） */
export function glossary(): Gloss[] {
  if (cache) return cache;
  const map = new Map<string, Gloss>();
  for (const t of TERMS) map.set(t.word, { word: t.word, reading: t.reading, meaning: t.meaning });
  for (const t of TOOLS) {
    const word = toolWord(t);
    const tool = { name: t.name, kind: KIND_LABEL[t.kind], what: t.what, how: t.how, watch: t.watch };
    const had = map.get(word);
    map.set(word, had ? { ...had, tool } : { word, reading: t.reading, meaning: t.what, tool });
  }
  cache = [...map.values()];
  return cache;
}

export function glossOf(word: string): Gloss | undefined {
  return glossary().find((g) => g.word === word);
}

let re: RegExp | null = null;
/** 印を付ける言葉（1 文字の言葉は、ほかの言葉の中に入りやすいので付けない）。長い言葉を先に */
function termRe(): RegExp {
  if (re) return re;
  const words = glossary()
    .map((g) => g.word)
    .filter((w) => w.length > 1)
    .sort((a, b) => b.length - a.length);
  re = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
  return re;
}

/** 文の中の言葉に印を付ける（同じ言葉は 1 回だけ）。text はもう esc してあること */
export function markTerms(text: string, seen: Set<string> = new Set()): string {
  return text.replace(termRe(), (w) => {
    if (seen.has(w)) return w;
    seen.add(w);
    return `<button type="button" class="term" data-term="${w}">${w}</button>`;
  });
}

/** 文の中に出てくる、ことば帳の言葉（出てくる順） */
export function wordsIn(text: string): string[] {
  return [...text.matchAll(termRe())].map((m) => m[0]);
}

/** 「詳しく」の 1 行：太字の頭と、続きの文 */
export interface Line {
  lead: string;
  text: string;
  /** 頭が見出し（「道具」「例」など）なら true。文の頭を太くしただけなら false（間をあけない） */
  head: boolean;
}

/**
 * 1 行の頭を分ける。「見出し：文」なら見出しを頭に。
 * そうでなければ、はじめの「は」「、」「。」の前（「では」はふくめる）を頭に。頭が長すぎるときは頭なし。
 */
export function splitLead(text: string): Line {
  const head = /^([^：。、]{1,10})：(.+)$/.exec(text);
  if (head) return { lead: head[1], text: head[2], head: true };
  let cut = -1;
  for (let i = 1; i < text.length; i++) {
    const c = text[i];
    if (c === "、" || c === "。") {
      cut = i;
      break;
    }
    if (c === "は" && i >= 2) {
      cut = text[i - 1] === "で" ? i + 1 : i;
      break;
    }
  }
  if (cut < 1 || cut > 18) return { lead: "", text, head: false };
  return { lead: text.slice(0, cut), text: text.slice(cut), head: false };
}

/** 「詳しく」のまとまり（「焼成」など）。見出しがないまとまりは group が空 */
export interface LineGroup {
  group: string;
  lines: Line[];
}

/**
 * 細かい手順を、まとまりと行に分ける。同じ見出し（「焼成：」）が 2 行以上続けば、まとまりの見出しにする。
 * 1 行だけの見出し（「例：」「SV925：」）は、その行の頭にする。
 */
export function detailGroups(list: readonly Detail[]): LineGroup[] {
  const heads = list.map((d) => /^([^：。、]{1,10})：(.+)$/.exec(d.text));
  const groups: LineGroup[] = [];
  list.forEach((d, i) => {
    const h = heads[i];
    const repeated = !!h && (heads[i - 1]?.[1] === h[1] || heads[i + 1]?.[1] === h[1]);
    const group = repeated ? h![1] : "";
    const line = splitLead(repeated ? h![2] : d.text);
    const last = groups[groups.length - 1];
    if (last && last.group === group) last.lines.push(line);
    else groups.push({ group, lines: [line] });
  });
  return groups;
}

/** 1 枚の札 */
export interface Card {
  /** 01, 02 … */
  no: string;
  title: string;
  text: string;
  rows: Spec[];
  watch?: string;
  /** この工程で使う道具の言葉（ことば帳にある） */
  tools: string[];
  groups: LineGroup[];
}

export function stepCard(st: Step, i: number): Card {
  const tools = [...new Set(toolsForStep(st.title).map(toolWord))];
  const groups = detailGroups(st.details ?? []);
  if (tools.length) groups.unshift({ group: "", lines: [{ lead: "道具", text: tools.join("、"), head: true }] });
  return { no: String(i + 1).padStart(2, "0"), title: st.title, text: st.text, rows: st.specs, watch: st.watch, tools, groups };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** 印刷用の札の CSS（白い紙。sc- で始まる名前だけ使う） */
export const CARDS_PRINT_CSS = `
.sc { list-style: none; margin: 0; padding: 0; display: grid; gap: 3mm; }
.sc-card { border: 0.3mm solid #d8d2c6; border-radius: 2mm; padding: 3mm 4mm; break-inside: avoid; page-break-inside: avoid; }
.sc-card.long { break-inside: auto; page-break-inside: auto; }
.sc-head { display: grid; grid-template-columns: 9mm 1fr; gap: 0 2mm; align-items: baseline; }
.sc-no { font: 600 10pt ui-monospace, "SF Mono", Menlo, monospace; color: #9a9184; }
.sc-head h3 { margin: 0; font-size: 11pt; font-weight: 700; }
.sc-head p { grid-column: 2; margin: 0.8mm 0 0; font-size: 9.5pt; line-height: 1.6; color: #333; }
.sc-body { margin-left: 11mm; }
.sc-rows { border-collapse: collapse; width: 100%; margin-top: 2mm; font-size: 9pt; }
.sc-rows td { padding: 0.9mm 2mm; border-top: 0.2mm solid #e6e0d4; vertical-align: top; font-variant-numeric: tabular-nums; }
.sc-rows tr:first-child td { border-top: 0; }
.sc-rows td:first-child { width: 30%; color: #6e665b; padding-left: 0; }
.sc-watch { margin: 1.5mm 0 0; font-size: 8.5pt; color: #8a5a00; }
.sc-tip { margin: 1.5mm 0 0; font-size: 8.5pt; color: #0b5cad; }
.sc-lines { margin: 2mm 0 0; padding: 2mm 0 0; border-top: 0.2mm dashed #d8d2c6; list-style: none; font-size: 8.5pt; line-height: 1.6; color: #333; }
.sc-lines li { margin: 0 0 0.8mm; }
.sc-lines li b { color: #111; }
.sc-lines li b.h { margin-right: 1.5mm; }
.sc-lines .sc-grp { margin-top: 1.5mm; font-size: 8pt; font-weight: 700; color: #6e665b; letter-spacing: 0.05em; }
`;

/** 印刷用の札の並び。details が true なら「詳しく」の行も入れる。extra は工程ごとに足す HTML（前の記録のコツ など） */
export function cardsPrintHtml(steps: readonly Step[], o: { details: boolean; extra?: (st: Step) => string }): string {
  return `<ol class="sc">${steps
    .map((st, i) => {
      const c = stepCard(st, i);
      const lines = o.details
        ? c.groups
            .map((g) => `${g.group ? `<li class="sc-grp">${esc(g.group)}</li>` : ""}${g.lines.map((l) => `<li>${l.lead ? `<b${l.head ? ' class="h"' : ""}>${esc(l.lead)}</b>` : ""}${esc(l.text)}</li>`).join("")}`)
            .join("")
        : "";
      const n = c.groups.reduce((a, g) => a + g.lines.length, 0);
      return `<li class="sc-card${o.details && n > 8 ? " long" : ""}"><div class="sc-head"><span class="sc-no">${c.no}</span><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p></div><div class="sc-body">${
        c.rows.length ? `<table class="sc-rows">${c.rows.map((x) => `<tr><td>${esc(x.label)}</td><td>${esc(x.value)}</td></tr>`).join("")}</table>` : ""
      }${c.watch ? `<p class="sc-watch">！ ${esc(c.watch)}</p>` : ""}${o.extra?.(st) ?? ""}${lines ? `<ul class="sc-lines">${lines}</ul>` : ""}</div></li>`;
    })
    .join("")}</ol>`;
}
