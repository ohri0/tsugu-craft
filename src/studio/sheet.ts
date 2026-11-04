// 指示書（印刷用）：1 枚目に、品の画像・大事な数字・作れるか・作り方の工程。2 枚目に原寸の型紙。言葉は短く、数字を大きく。
import type { Step } from "./howto";
import { DRAWING_CSS } from "./drawing";
import { CARDS_PRINT_CSS, cardsPrintHtml } from "./cards";

export interface SheetInput {
  title: string;
  date: string;
  imageDataUrl: string;
  specs: { label: string; value: string }[];
  /** 作れない所（なければ空） */
  problems: string[];
  methodLabel: string;
  steps: Step[];
  patternSvg: string;
  /** 図面のページ（drawingPage の HTML）。あれば最初に置く */
  drawingHtml?: string;
  /** 作り方のページを入れるか（入れないときは図面だけ） */
  includeSteps?: boolean;
  /** 「詳しく」の細かい手順も入れるか */
  includeDetails?: boolean;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function sheetHtml(o: SheetInput): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(o.title)}</title>
<style>
@page { size: A4; margin: 0; }
@page land { size: A4 landscape; margin: 0; }
.dw { page: land; }
${DRAWING_CSS}
* { box-sizing: border-box; }
body { margin: 0; font-family: "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif; color: #111; }
.page { width: 210mm; min-height: 297mm; padding: 14mm 14mm 10mm; page-break-after: always; }
.page:last-child { page-break-after: auto; }
/* 画面で見るとき：紙を灰色の上にまん中にそろえて並べる（印刷のときは紙のまま） */
@media screen {
  html { background: #e5e5e7; }
  body { padding: 16px 0; }
  .page, .dw { margin: 0 auto 16px; background: #fff; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12); }
}
header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 0.4mm solid #111; padding-bottom: 2mm; }
h1 { margin: 0; font-weight: 700; font-size: 17pt; }
header small { font-size: 8.5pt; color: #666; }
.top { display: grid; grid-template-columns: 78mm 1fr; gap: 6mm; margin-top: 5mm; }
.top img { width: 78mm; height: 78mm; object-fit: cover; border-radius: 2mm; background: #111; }
dl { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 3mm 5mm; align-content: start; }
dt { font-size: 7.5pt; color: #666; }
dd { margin: 0.5mm 0 0; font-size: 11pt; font-variant-numeric: tabular-nums; }
.verdict { margin-top: 4mm; padding: 2.5mm 4mm; border-radius: 2mm; font-size: 10.5pt; }
.ok { background: #e6f2ea; color: #1f5c39; }
.ng { background: #f8e3de; color: #8a2a1c; }
h2 { font-weight: 700; font-size: 11pt; margin: 6mm 0 3mm; }
${CARDS_PRINT_CSS}
.two .sc { grid-template-columns: 1fr 1fr; }
.two .sc-body { margin-left: 0; }
.foot { margin-top: 4mm; font-size: 7.5pt; color: #666; }
</style></head><body>
${o.drawingHtml ?? ""}
${o.includeSteps === false ? "" : `<section class="page">
  <header><h1>${esc(o.title)}</h1><small>継ぐ ・ ${esc(o.date)}</small></header>
  <div class="top">
    <img alt="" src="${o.imageDataUrl}">
    <div>
      <dl>${o.specs.map((s) => `<div><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`).join("")}</dl>
      <div class="verdict ${o.problems.length ? "ng" : "ok"}">${o.problems.length ? `このままでは作れない所：${o.problems.map(esc).join("、")}` : "このまま作れます"}</div>
    </div>
  </div>
  <h2>作り方（${esc(o.methodLabel)}）</h2>
  <div class="${o.includeDetails ? "one" : "two"}">${cardsPrintHtml(o.steps, { details: !!o.includeDetails })}</div>
  <p class="foot">数字は、この石とこの形から計算した目安です。手順は一般的な作り方の例で、最後は職人が決めます。${o.patternSvg ? "最後のページは原寸の型紙（「実際のサイズ・100%」で印刷）。" : ""}</p>
</section>`}
${o.patternSvg ? `<section class="page">${o.patternSvg}</section>` : ""}
</body></html>`;
}
