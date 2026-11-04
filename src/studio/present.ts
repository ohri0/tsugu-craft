// 見せる：お客さまや職人に見せるための全画面の表示。黒の上で指輪が回り、左下に本物の数字と職人の言葉、
// その上に押して切り替えられる選ぶ欄（石の大きさ・腕の断面・留め方・地金）。値は組んだ指輪からだけ読む。
// 作者の声：動画のためだけの見た目は作らない。動画に出すものはアプリでできることにする（2026-11-04）。

export interface PresentInfo {
  stone: string;
  prong: string;
  shank: string;
  metal: string;
  gou: string;
  verdict: { ok: boolean; text: string };
  quote?: { text: string; by: string };
}
export interface PresentGroup {
  key: string;
  label: string;
  options: { v: string; label: string }[];
  on: string;
}

const esc = (t: string) => t.replace(/[<&>"]/g, (c) => ({ "<": "&lt;", "&": "&amp;", ">": "&gt;", '"': "&quot;" })[c]!);

export function presentHtml(info: PresentInfo, groups: PresentGroup[], active: string): string {
  const g = groups.find((x) => x.key === active) ?? groups[0];
  const cell = (k: string, v: string, cls = "") => `<div><div class="pk">${esc(k)}</div><div class="pv ${cls}">${esc(v)}</div></div>`;
  return `<div class="pr-tabs" role="tablist">${groups.map((x) => `<button type="button" role="tab" data-g="${x.key}" aria-selected="${x.key === g.key}">${esc(x.label)}</button>`).join("")}</div>
    ${g ? `<div class="pr-opt" role="group" aria-label="${esc(g.label)}">${g.options.map((o) => `<button type="button" data-g="${g.key}" data-v="${esc(o.v)}" aria-pressed="${o.v === g.on}">${esc(o.label)}</button>`).join("")}</div>` : ""}
    ${info.quote ? `<p class="pr-q">「${esc(info.quote.text)}」<small>${esc(info.quote.by)}</small></p>` : ""}
    <div class="pr-grid">${cell("石", info.stone)}${cell("爪", info.prong)}${cell("腕", info.shank)}${cell("地金", info.metal)}${cell("号", info.gou)}${cell("確かめ", info.verdict.text, info.verdict.ok ? "ok" : "ng")}</div>`;
}

/** 見せる表示で選べる石の大きさ（長辺 mm）。カラットとの換算は資料ごとに食いちがうので mm で出す。
 * 6.5 mm だけ「約 1 ct」を添える（多くの資料が一致：https://www.royalcoster.com/blog/mm-to-carat） */
export const STONE_SIZES: { mm: number; label: string }[] = [
  { mm: 5, label: "5 mm" },
  { mm: 6.5, label: "6.5 mm（約 1 ct）" },
  { mm: 8, label: "8 mm" },
  { mm: 10, label: "10 mm" },
];
