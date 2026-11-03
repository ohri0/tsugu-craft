// 作品の記録：作った物ごとに、画像・寸法・作れるか・作り方・職人のひとことを残す。
// 一点ものは同じ物を繰り返し作って覚えられない。だから作るたびに残し、次の人がそこから始められるようにする。
// このブラウザに残し（localStorage）、印刷できる。画面に依存しない（保存の所だけ localStorage を使う）。
import type { Step } from "./howto";
import { cardsPrintHtml, CARDS_PRINT_CSS } from "./cards";
import { DRAWING_CSS } from "./drawing";
import { withDetails } from "./steps";
import type { Tip } from "./tips";
import type { StoneParams } from "../geometry/stone";
import type { RingState } from "./session";

export interface WorkRecord {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  /** 何を作ったか（一粒石の指輪・甲丸の指輪 など） */
  kind: string;
  methodLabel: string;
  /** 小さな画像（data URL、JPEG） */
  image: string;
  specs: { label: string; value: string }[];
  problems: string[];
  steps: Step[];
  /** 職人のひとこと（あれば） */
  note: string;
  maker: string;
  /** 話したことを Claude が工程ごとに分けたコツ */
  tips?: Tip[];
  /** 組み直せる設計（一粒石の指輪）。新しい決まりで確かめ直すのに使う */
  design?: { stone: StoneParams; state: RingState };
  /** 図面（drawingPage の HTML。正面・側面・上面と寸法）。古い記録にはない */
  drawing?: string;
  /** 新しい決まりで直した記録（いつ・誰の決まりで・何を） */
  revisions?: { date: string; by: string; rule: string; change: string }[];
}

const STORE = "tsugu.works.v1";

export function parseWorks(raw: unknown): WorkRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((w): w is WorkRecord => typeof w === "object" && w !== null && typeof (w as WorkRecord).id === "string" && Array.isArray((w as WorkRecord).steps));
}

export function loadWorks(): WorkRecord[] {
  try {
    return parseWorks(JSON.parse(localStorage.getItem(STORE) ?? "[]"));
  } catch {
    return [];
  }
}

/** 置き換える（同じ id の記録を）。入りきらないときは false */
export function updateWork(w: WorkRecord): boolean {
  const all = loadWorks().map((x) => (x.id === w.id ? w : x));
  try {
    localStorage.setItem(STORE, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

/** 足す（新しい順の先頭に）。入りきらないときは false */
export function saveWork(w: WorkRecord): boolean {
  const all = [w, ...loadWorks()];
  try {
    localStorage.setItem(STORE, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function removeWork(id: string): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(loadWorks().filter((w) => w.id !== id)));
  } catch {
    // 消せなくても画面は動く
  }
}

export const newWorkId = () => `work-${Date.now().toString(36)}`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** 帳面の図面を、画面の幅に合わせて縮める（印刷のときは原寸の A4 横） */
const FIT_SCRIPT = `<script>function fitDw(){document.querySelectorAll('.dwbox').forEach(function(b){var i=b.firstElementChild,d=i&&i.firstElementChild;if(!d)return;var k=Math.max(b.clientWidth,620)/d.offsetWidth;d.style.transform='scale('+k+')';i.style.width=d.offsetWidth*k+'px';i.style.height=d.offsetHeight*k+'px';b.classList.toggle('wide',b.scrollWidth>b.clientWidth+1);})}addEventListener('resize',fitDw);addEventListener('load',fitDw);fitDw();</script>`;

/**
 * 記録の帳面：表紙と、1 作品ずつ（題・画像・寸法・作れるか・ひとこと・図面・作り方の札と詳しく）。
 * 紙（A4）では、作品ごとに新しいページから。図面は A4 横の 1 ページ。
 * 画面（スマホ）では、ページの高さを決めず、詰めて並べる。図面は幅に合わせて縮める。
 */
export function worksBookHtml(works: readonly WorkRecord[], date: string): string {
  const page = (w: WorkRecord) => {
    const tips = (st: Step) =>
      (w.tips ?? [])
        .filter((t) => t.step === st.title)
        .map((t) => `<p class="sc-tip">${esc(t.kind)}：${esc(t.text)}</p>`)
        .join("");
    return `<article class="work">
    <header><h2>${esc(w.title)}</h2><small>${esc(w.date)}${w.maker ? ` ・ ${esc(w.maker)}` : ""} ・ ${esc(w.methodLabel)}</small></header>
    <div class="top"><img alt="" src="${w.image}"><div><dl>${w.specs.map((s) => `<div><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`).join("")}</dl>
    <p class="v ${w.problems.length ? "ng" : "ok"}">${w.problems.length ? `作れない所があった：${w.problems.map(esc).join("、")}` : "作れる形だった"}</p></div></div>
    ${w.note ? (w.maker === "見本" ? `<p class="sample">${esc(w.note)}</p>` : `<blockquote>「${esc(w.note)}」</blockquote>`) : ""}
    ${(w.revisions ?? []).map((r) => `<p class="rev">${esc(r.date)} ${esc(r.by)}さんの決まり「${esc(r.rule)}」で直した：${esc(r.change)}</p>`).join("")}
    <section class="how"><h3 class="sec">作り方（${esc(w.methodLabel)}）<small>数字はこの形から計算した目安。最後は職人が決める。</small></h3>
    ${cardsPrintHtml(w.steps.map(withDetails), { details: true, extra: tips })}</section>
    <!-- 紙では作り方のあとに A4 横の 1 ページ。画面では作り方の前に出す（order） -->
    ${w.drawing ? `<div class="dwbox"><div class="dwin">${w.drawing}</div></div><p class="dwcap">図面（正面・側面・上面、寸法は mm）<span>横に動かして見られます</span></p>` : ""}
  </article>`;
  };
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>作品の記録</title><style>
@page { size: A4; margin: 14mm 14mm 12mm; }
@page land { size: A4 landscape; margin: 0; }
.dw { page: land; }
${DRAWING_CSS}
${CARDS_PRINT_CSS}
* { box-sizing: border-box; }
body { margin: 0; font-family: "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif; color: #1f1c18; }
.cover { padding: 50mm 0 0; }
.cover h1 { font-family: "Hiragino Mincho ProN", "Yu Mincho", serif; font-size: 28pt; font-weight: 600; margin: 0 0 6mm; letter-spacing: 0.1em; }
.cover p { font-size: 11pt; line-height: 1.9; color: #4a443c; max-width: 140mm; }
.work { page-break-before: always; break-before: page; }
.rev { color: #0b5cad; font-size: 9pt; margin: 2mm 0; }
.sample { font-size: 9pt; color: #6e665b; line-height: 1.6; margin: 3mm 0 0; }
header { display: flex; justify-content: space-between; align-items: baseline; gap: 4mm; border-bottom: 0.4mm solid #1f1c18; padding-bottom: 2mm; }
h2 { margin: 0; font-family: "Hiragino Mincho ProN", "Yu Mincho", serif; font-weight: 600; font-size: 17pt; }
header small { font-size: 8.5pt; color: #6e665b; white-space: nowrap; }
.top { display: grid; grid-template-columns: 56mm 1fr; gap: 6mm; margin-top: 5mm; }
.top img { width: 56mm; height: 56mm; object-fit: cover; border-radius: 2mm; background: #111; }
dl { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 3mm 5mm; align-content: start; }
dt { font-size: 7.5pt; color: #6e665b; } dd { margin: 0.5mm 0 0; font-size: 10.5pt; font-variant-numeric: tabular-nums; }
blockquote { margin: 4mm 0 0; padding: 3mm 4mm; border-left: 1mm solid #8c6a33; background: #f6f0e3; font-family: "Hiragino Mincho ProN", serif; font-size: 11pt; }
.v { margin: 4mm 0 0; padding: 2mm 4mm; border-radius: 2mm; font-size: 10pt; } .ok { background: #e6f2ea; color: #1f5c39; } .ng { background: #f8e3de; color: #8a2a1c; }
.sec { margin: 6mm 0 3mm; font-size: 11pt; font-weight: 700; display: flex; flex-wrap: wrap; align-items: baseline; gap: 1mm 3mm; }
.sec small { font-size: 8pt; font-weight: 400; color: #6e665b; }
.dwbox .dw { background: #fff; }
.work:last-child .dw { page-break-after: auto; }
.dwcap { display: none; }
@media print {
  .dwin { width: auto !important; height: auto !important; }
  .dwbox .dw { transform: none !important; }
}
@media screen {
  body { background: #e9e3d7; padding: 12px 12px 40px; }
  .cover, .work { max-width: 210mm; margin: 0 auto 14px; padding: 22px 20px; background: #fffdf8; border-radius: 12px; box-shadow: 0 1px 3px rgba(60, 45, 20, 0.12); }
  .cover h1 { font-size: 26px; margin: 4px 0 10px; }
  .cover p { font-size: 14px; line-height: 1.85; margin: 0 0 8px; }
  .work { display: flex; flex-direction: column; }
  .dwbox { order: 1; margin-top: 16px; overflow-x: auto; overflow-y: hidden; border: 1px solid #e3dccf; border-radius: 8px; background: #fff; -webkit-overflow-scrolling: touch; }
  .dwin { overflow: hidden; }
  .dwcap { order: 1; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 10px; margin: 6px 2px 0; font-size: 12px; color: #6e665b; }
  .dwcap span { display: none; }
  .dwbox.wide + .dwcap span { display: inline; }
  .dwbox .dw { transform-origin: 0 0; }
  .how { order: 2; }
  h2 { font-size: 20px; line-height: 1.35; }
  header small { font-size: 12px; }
  dt { font-size: 11px; } dd { font-size: 14px; }
  .v, .rev, .sample { font-size: 13px; }
  blockquote { font-size: 15px; }
  .sec { font-size: 16px; margin: 22px 0 10px; } .sec small { font-size: 11.5px; }
  .sc { gap: 10px; }
  .sc-card { padding: 14px 14px 12px; border-radius: 10px; border-width: 1px; }
  .sc-head { grid-template-columns: 30px 1fr; gap: 0 8px; }
  .sc-no { font-size: 13px; }
  .sc-head h3 { font-size: 15.5px; }
  .sc-head p { font-size: 13.5px; margin-top: 3px; }
  .sc-body { margin-left: 38px; }
  .sc-rows { font-size: 13px; margin-top: 10px; }
  .sc-rows td { padding: 5px 8px; border-top-width: 1px; }
  .sc-watch, .sc-tip { font-size: 12.5px; margin-top: 8px; }
  .sc-lines { font-size: 13px; line-height: 1.7; margin-top: 10px; padding-top: 10px; border-top-width: 1px; }
  .sc-lines li { margin-bottom: 5px; }
  .sc-lines .sc-grp { font-size: 12px; margin-top: 10px; }
}
@media screen and (max-width: 640px) {
  body { padding: 8px 8px 32px; }
  .cover, .work { padding: 18px 14px; border-radius: 10px; }
  header { flex-direction: column; gap: 4px; }
  .top { grid-template-columns: 1fr; gap: 12px; margin-top: 12px; }
  .top img { width: 100%; height: auto; aspect-ratio: 4 / 3; }
  dl { gap: 10px 14px; }
  .sc-body { margin-left: 0; }
  .sc-rows td:first-child { width: 38%; }
}
</style></head><body>
<section class="cover"><h1>作品の記録</h1><p>作った物ごとに、形・図面・作れるか・作り方・職人のひとことを残した帳面です。一点ものは、同じ物を繰り返し作って覚えることができません。だから作るたびに残し、次に作る人がここから始められるようにしています。</p><p>${works.length} 作品 ・ 書き出した日 ${esc(date)}</p></section>
${works.map(page).join("\n")}
${FIT_SCRIPT}
</body></html>`;
}
