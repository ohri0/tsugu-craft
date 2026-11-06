// 指示書：確かめた設計を、職人・CAD オペレーターにそのまま渡せる紙にする。
// 1 ページ目が指示書（何を作るかだけ）、2 ページ目が原寸の型紙。作り方の手順は書かない。
// 画面に依存しない純粋な関数（3D の画像は呼ぶ側が渡す）。
import type { RingDesign } from "../geometry/ring";
import { metalName } from "../geometry/ring";
import { HOLD_NOTE, holdRatio, type Problem } from "../rules/checks";
import { GUIDE_NOTE } from "../rules/guides";
import { sourceLabel, type Rule } from "../rules/ledger";

export interface InstructionInput {
  ring: RingDesign;
  problems: (Problem & { rule?: Rule })[];
  shapeName: string;
  depthMm: number;
  widthFromPhoto: boolean;
  /** 選んだ理由（Claude の理由、または案の理由） */
  reason: string;
  /** 3D の画像（data URL）。なければ載せない */
  imageDataUrl?: string;
  /** 2 ページ目に載せる原寸の型紙（SVG） */
  patternSvg: string;
  /** 根拠にした職人の決まり（帳面から） */
  craftsmanRules: Rule[];
  date: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const mm = (v: number) => `${v.toFixed(2)} mm`;

export function instructionHtml(o: InstructionInput): string {
  const { ring } = o;
  const s = ring.setting;
  const st = ring.params.stone;
  const h = s.heights;
  const style =
    s.style === "bezel"
      ? `覆輪（ふくりん）：壁の厚み ${mm(s.bezel?.wallMm ?? 0)}`
      : `爪 ${s.prongs.length} か所（うち V 字 ${s.prongs.filter((p) => p.isV).length}）・太さ ${[...new Set(s.prongs.map((p) => mm(p.diameterMm)))].join("〜") || mm(0)}`;
  const rows: [string, string][] = [
    ["石", `${o.shapeName}　長辺 ${mm(st.longMm)} × 幅 ${mm(st.widthMm)}${o.widthFromPhoto ? "（写真から）" : ""} × 深さ ${mm(o.depthMm)}`],
    ["上側／下側", `${mm(ring.stone.heights.crownMm)} ／ ${mm(ring.stone.heights.pavilionMm)}`],
    ["留め方", style],
    ["高さ", `指から石座のいちばん上まで ${mm(h.heightAboveFingerMm)}`],
    ["向き", ring.orientation === "across" ? "横（長辺が指に直角）" : "縦（長辺が指に沿う）"],
    ["地金", `${metalName(ring.metal)}（約 ${ring.metalWeightG.toFixed(1)} g・目安）`],
    ["サイズ", `${ring.shank.gou} 号（内径 ${mm(ring.shank.innerDiameterMm)}）・腕 幅 ${mm(ring.shank.widthMm)} × 厚み ${mm(ring.shank.thicknessMm)}`],
  ];
  const checks: [string, string][] = [
    ["石の一番下と指のすき間", mm(ring.culetGapMm)],
    ["石の留まり", s.style === "bezel" ? "覆輪" : `標準の 4 本爪の ${holdRatio(s).toFixed(2)} 倍`],
  ];
  const problems = o.problems.length
    ? `<ul>${o.problems
        .map((p) => `<li>${esc(p.where)}：今 ${esc(p.current)}／必要 ${esc(p.required)}${p.rule ? `（根拠：${esc(p.rule.title)}・${esc(sourceLabel(p.rule.source))}）` : ""}</li>`)
        .join("")}</ul>`
    : "<p>確かめはすべて目安の内側。</p>";
  const rules = o.craftsmanRules.length
    ? `<ul>${o.craftsmanRules.map((r) => `<li>${esc(r.title)}：${esc(r.text)}（${esc(sourceLabel(r.source))}・${esc(r.date)}）</li>`).join("")}</ul>`
    : "<p>（この帳面には、まだ職人の決まりがありません）</p>";
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>指示書</title>
<style>
@page { size: A4; margin: 0; }
body { margin: 0; font-family: "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif; color: #222; }
.page { width: 210mm; min-height: 297mm; padding: 16mm; box-sizing: border-box; page-break-after: always; }
.page:last-child { page-break-after: auto; padding: 0; }
h1 { font-family: "Hiragino Mincho ProN", "Yu Mincho", serif; font-size: 20pt; margin: 0 0 2mm; }
h2 { font-size: 11pt; border-bottom: 1px solid #999; margin: 6mm 0 2mm; }
.top { display: grid; grid-template-columns: 1fr 70mm; gap: 6mm; }
.top img { width: 70mm; height: 70mm; object-fit: cover; border: 1px solid #ddd; border-radius: 2mm; }
table { border-collapse: collapse; width: 100%; font-size: 9.5pt; }
th, td { text-align: left; border-bottom: 1px solid #e3ddd0; padding: 1.5mm 2mm; vertical-align: top; }
th { width: 32mm; color: #555; font-weight: normal; }
p, li { font-size: 9.5pt; line-height: 1.6; } ul { margin: 0; padding-left: 5mm; }
.note { color: #666; font-size: 8.5pt; }
</style></head><body>
<section class="page">
  <h1>指示書</h1>
  <p class="note">継ぐ　${esc(o.date)}　何を作るかだけを書いています。作り方・石座の削り・最終の合わせは職人が決めます。</p>
  <div class="top">
    <table>${rows.map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join("")}</table>
    ${o.imageDataUrl ? `<img src="${o.imageDataUrl}" alt="選んだ案の 3D">` : ""}
  </div>
  <h2>確かめた結果</h2>
  <table>${checks.map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join("")}</table>
  ${problems}
  <h2>選んだ理由</h2>
  <p>${esc(o.reason)}</p>
  <h2>根拠にした職人の決まり</h2>
  ${rules}
  <p class="note">数字はすべて${GUIDE_NOTE}。${HOLD_NOTE}。2 ページ目は原寸の型紙（「実際のサイズ・100%」で印刷）。</p>
</section>
<section class="page">${o.patternSvg}</section>
</body></html>`;
}
