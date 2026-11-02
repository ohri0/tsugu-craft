// 原寸（1:1）の型紙。SVG を mm 単位でそのまま描く（印刷で大きさが変わらないように）。
// 黒：石の縁（写真から）。赤：覆輪の内側（点線）と外側。
import { offsetOutline } from "../geometry/offset";
import type { Point } from "../geometry/polygon";
import { GUIDE_NOTE, GUIDES } from "../rules/guides";

export const A4 = { w: 210, h: 297 };

export interface SheetInput {
  /** 縁の形（mm、y 上向き、長辺が x 軸）。measureOutline の outlineMm */
  outlineMm: readonly Point[];
  longMm: number;
  widthMm: number;
  depthMm: number;
  widthFromPhoto: boolean;
  shapeName: string;
  /** 型紙に添える名前（例：写真のファイル名） */
  label?: string;
  date?: string;
}

/** 型紙の座標（y 下向き）へ。上から見た石と同じ向き（鏡写しにしない） */
export function toSheet(pts: readonly Point[], cx: number, cy: number, scale = 1): Point[] {
  return pts.map((p) => ({ x: cx + p.x * scale, y: cy - p.y * scale }));
}

const f = (n: number) => n.toFixed(3);
const path = (pts: Point[]) => `M${pts.map((p) => `${f(p.x)},${f(p.y)}`).join("L")}Z`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function patternSvg(o: SheetInput): string {
  const b = GUIDES.bezel;
  const inner = offsetOutline(o.outlineMm, b.clearanceMm);
  const outer = offsetOutline(o.outlineMm, b.clearanceMm + b.wallMm);
  const c1 = { x: 62, y: 105 }; // 原寸の中心
  const c3 = { x: 150, y: 105 }; // 3 倍の中心
  const k3 = Math.min(3, 70 / Math.max(o.longMm, o.widthMm));
  // 図のすぐ下に名前を置く
  const reach = Math.max(...outer.map((p) => Math.abs(p.y)));
  const below = (k: number) => 105 + reach * k + 8;
  const font = `font-family="Hiragino Sans, Noto Sans JP, Yu Gothic, sans-serif"`;
  const t = (x: number, y: number, s: string, size = 3.4, extra = "") =>
    `<text x="${x}" y="${y}" font-size="${size}" ${font} fill="#222" ${extra}>${esc(s)}</text>`;
  const shapes = (cx: number, cy: number, k: number, lw: number) => {
    const cross = 1.2 * k;
    return [
      `<path d="${path(toSheet(outer, cx, cy, k))}" fill="none" stroke="#d0201b" stroke-width="${lw}"/>`,
      `<path d="${path(toSheet(inner, cx, cy, k))}" fill="none" stroke="#d0201b" stroke-width="${lw}" stroke-dasharray="${0.6 * Math.sqrt(k)} ${0.4 * Math.sqrt(k)}"/>`,
      `<path d="${path(toSheet(o.outlineMm, cx, cy, k))}" fill="none" stroke="#000" stroke-width="${lw}"/>`,
      `<path d="M${cx - cross},${cy}H${cx + cross}M${cx},${cy - cross}V${cy + cross}" stroke="#888" stroke-width="${lw * 0.8}"/>`,
    ].join("");
  };
  const ruler = (x: number, y: number, len: number) =>
    `<path d="M${x},${y}H${x + len}M${x},${y - 2}V${y + 2}M${x + len},${y - 2}V${y + 2}" stroke="#000" stroke-width="0.15"/>` +
    t(x, y - 3, `${len} mm`, 3);
  const dims = `長辺 ${o.longMm.toFixed(2)} × 幅 ${o.widthMm.toFixed(2)}${o.widthFromPhoto ? "（写真から）" : ""} × 深さ ${o.depthMm.toFixed(2)} mm`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${A4.w}mm" height="${A4.h}mm" viewBox="0 0 ${A4.w} ${A4.h}">
<rect width="${A4.w}" height="${A4.h}" fill="#fff"/>
${t(15, 20, "Stone Fit　原寸の型紙（1:1）", 6, 'font-weight="bold"')}
${t(15, 28, `${o.shapeName}　${dims}`)}
${t(15, 34, `${o.label ? `${o.label}　` : ""}${o.date ?? ""}`, 3, 'fill="#666"')}
${shapes(c1.x, c1.y, 1, 0.08)}
${t(c1.x, below(1), "原寸（1:1）", 3.6, 'font-weight="bold" text-anchor="middle"')}
${shapes(c3.x, c3.y, k3, 0.2)}
${t(c3.x, below(k3), `${k3.toFixed(k3 === 3 ? 0 : 1)} 倍（原寸ではない・見やすくするため）`, 3.2, 'text-anchor="middle"')}
<g transform="translate(15,170)">
  <path d="M0,0H8" stroke="#000" stroke-width="0.3"/>${t(10, 1.2, "黒：石の縁（写真から取った輪郭）", 3.2)}
  <path d="M0,7H8" stroke="#d0201b" stroke-width="0.3" stroke-dasharray="0.8 0.5"/>${t(10, 8.2, `赤の点線：覆輪の内側（縁 ＋ ${b.clearanceMm} mm）`, 3.2)}
  <path d="M0,14H8" stroke="#d0201b" stroke-width="0.3"/>${t(10, 15.2, `赤：覆輪の外側（壁の厚み ${b.wallMm} mm）`, 3.2)}
  ${t(0, 23, "＋：石の重心。長辺は左右の向き", 3.2)}
</g>
${ruler(15, 215, 10)}
${ruler(40, 215, 50)}
${t(15, 228, "「実際のサイズ・100%」で印刷し、上の 10 mm と 50 mm を定規で確かめてください。", 3.2)}
${t(15, 234, "透ける紙（トレーシングペーパー・OHP フィルム）に印刷すると、石にかぶせてずれを見られます。", 3.2)}
${t(15, 240, `寸法と覆輪の値は${GUIDE_NOTE}。作り方・石座の削り・最終の合わせは職人が決める。`, 3.2)}
</svg>`;
}
