// 図面（印刷用、A4 横）：3D から描いた正面図・側面図・上面図に寸法を入れ、右下に表題欄を置く。
// 作り方のページ（指示書）を後ろにつなげるかは、印刷のときに選ぶ。画面に依存しない（画像は外から渡す）。
import { dimsSvg, type Dim, type Project } from "./dims";

export interface DrawingView {
  name: string;
  /** 線画の画像（data URL） */
  url: string;
  widthMm: number;
  heightMm: number;
  widthPx: number;
  heightPx: number;
  project: Project;
  dims: Dim[];
}

export interface DrawingInput {
  title: string;
  date: string;
  /** 表題欄の行（品名・号・地金・重さ・石 など） */
  rows: { label: string; value: string }[];
  views: DrawingView[];
  /** 作れない所（なければ空） */
  problems: string[];
  /** 描いたときの 1 mm あたりの px */
  pxPerMm: number;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** 紙に収まる尺度（何倍で描くか）。図の並びの幅と高さから、いちばん大きく描ける整数倍 */
export function pickScale(views: { widthMm: number; heightMm: number }[], room = { w: 255, h: 128 }, gapMm = 16): number {
  for (const s of [6, 5, 4, 3, 2, 1]) {
    const w = views.reduce((a, v) => a + v.widthMm * s, 0) + gapMm * (views.length - 1);
    const h = Math.max(...views.map((v) => v.heightMm * s));
    if (w <= room.w && h <= room.h) return s;
  }
  return 1;
}

export const DRAWING_CSS = `
.dw { width: 297mm; height: 210mm; padding: 8mm; page-break-after: always; position: relative; }
.dw-frame { position: absolute; inset: 8mm; border: 0.5mm solid #111; }
.dw-views { position: absolute; left: 14mm; right: 14mm; top: 16mm; height: 140mm; display: flex; align-items: center; justify-content: center; gap: 16mm; }
.dw-view { position: relative; display: flex; flex-direction: column; align-items: center; gap: 3mm; }
.dw-view .fig { position: relative; }
.dw-view img { mix-blend-mode: multiply; }
.dw-view img, .dw-view svg { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; }
.dw-view h3 { margin: 0; font-size: 8.5pt; font-weight: 600; letter-spacing: 0.08em; }
.dw .dim-line, .dw .dim-leader, .dw .dim-ext { stroke: #111; fill: none; }
.dw .dim-arrow { fill: #111; }
.dw .dim-tag { fill: #fff; stroke: none; }
.dw .dim-text { fill: #111; font-family: "Hiragino Sans", "Noto Sans JP", sans-serif; font-weight: 500; }
.dw .dim.bad .dim-line, .dw .dim.bad .dim-ext, .dw .dim.bad .dim-leader { stroke: #c4291c; }
.dw .dim.bad .dim-arrow { fill: #c4291c; }
.dw .dim.bad .dim-text { fill: #c4291c; }
.dw-title { position: absolute; right: 8mm; bottom: 8mm; width: 128mm; border-left: 0.4mm solid #111; border-top: 0.4mm solid #111; display: grid; grid-template-columns: 1fr 1fr; font-size: 7.5pt; }
.dw-title div { padding: 1.2mm 2mm; border-right: 0.2mm solid #111; border-bottom: 0.2mm solid #111; }
.dw-title div:nth-child(2n) { border-right: 0; }
.dw-title .name { grid-column: span 2; font-size: 12pt; font-weight: 700; border-right: 0; }
.dw-title small { display: block; font-size: 6pt; color: #555; }
.dw-note { position: absolute; left: 12mm; bottom: 11mm; width: 140mm; font-size: 7.5pt; line-height: 1.6; }
.dw-note .ng { color: #c4291c; }
`;

/** 図面の 1 ページ（HTML の断片）。DRAWING_CSS と一緒に使う */
export function drawingPage(o: DrawingInput): string {
  const s = pickScale(o.views);
  // 紙の上で、字は約 2.6 mm、線は約 0.18 mm になるように
  const pxPerPaperMm = o.pxPerMm / s;
  const k = (2.6 * pxPerPaperMm) / 11;
  const stroke = (0.18 * pxPerPaperMm).toFixed(2);
  const views = o.views
    .map(
      (v) => `<figure class="dw-view" style="margin:0"><div class="fig" style="width:${(v.widthMm * s).toFixed(1)}mm;height:${(v.heightMm * s).toFixed(1)}mm">
        <img alt="" src="${v.url}">
        <svg viewBox="0 0 ${v.widthPx} ${v.heightPx}" style="stroke-width:${stroke}">${dimsSvg(v.dims, v.project, k)}</svg>
      </div><h3>${esc(v.name)}</h3></figure>`,
    )
    .join("");
  const cells = [...o.rows, { label: "尺度", value: `${s} : 1` }, { label: "単位", value: "mm" }, { label: "日付", value: o.date }, { label: "作成", value: "継ぐ" }];
  return `<section class="dw">
  <div class="dw-frame"></div>
  <div class="dw-views">${views}</div>
  <p class="dw-note">${o.problems.length ? `<span class="ng">このままでは作れない所：${o.problems.map(esc).join("、")}（赤い寸法）</span><br>` : "作れるかの確かめ：目安の内側<br>"}寸法は、この形から計算した目安です。最後は職人が決めます。</p>
  <div class="dw-title"><div class="name">${esc(o.title)}</div>${cells.map((c) => `<div><small>${esc(c.label)}</small>${esc(c.value)}</div>`).join("")}</div>
</section>`;
}
