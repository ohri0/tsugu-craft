// MCP の道具に渡される石を、形の処理の入力（StoneParams）にする。
// 写真がなくても試せるように、簡単な形（三角・楕円・丸・四角）を長辺・幅・深さから作れる。
// 輪郭の点を渡すときは、上から見た石の縁（mm、y は上向き）。
import { findCorners, type Corner } from "../src/geometry/corners";
import { measureOutline } from "../src/geometry/measure";
import { centroid, extent, type Point } from "../src/geometry/polygon";
import { nameShape } from "../src/geometry/shape";
import type { StoneParams } from "../src/geometry/stone";

export const STONE_PRESETS = ["triangle", "oval", "round", "square"] as const;
export type StonePreset = (typeof STONE_PRESETS)[number];

export interface StoneInput {
  /** 簡単な形。outline_mm があれば、そちらを使う */
  preset?: StonePreset;
  /** 上から見た縁の点（mm、y は上向き） */
  outline_mm?: Point[];
  /** 長辺（mm）。輪郭の点を渡したときは、なければ点から測る */
  long_mm?: number;
  /** 幅（mm）。なければ形から（丸は長辺と同じ） */
  width_mm?: number;
  /** 深さ（mm、ノギスで測った値） */
  depth_mm: number;
}

export interface ReadyStone {
  params: StoneParams;
  shapeName: string;
  corners: Corner[];
}

/** 輪郭の点の数（簡単な形を作るとき） */
const PRESET_POINTS = 160;

export function readyStone(s: StoneInput): ReadyStone {
  if (!(s.depth_mm > 0)) throw new Error("深さ（depth_mm）は 0 より大きい mm で渡してください");
  const params = s.outline_mm && s.outline_mm.length > 0 ? fromOutline(s, s.outline_mm) : fromPreset(s);
  const corners = findCorners(params.outlineMm);
  return { params, shapeName: nameShape(params.outlineMm, corners).name, corners };
}

/** 輪郭の点から：重心を真ん中に、いちばん長い向きを x 軸にそろえる（写真から読んだ輪郭と同じ扱い） */
function fromOutline(s: StoneInput, points: Point[]): StoneParams {
  if (points.length < 3) throw new Error("輪郭の点（outline_mm）は 3 つ以上要ります");
  if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error("輪郭の点に数でない値があります");
  // measureOutline は写真の座標（y が下向き）を受け取るので、上下を返して渡す。中で y を上向きに戻す。
  const flipped = points.map((p) => ({ x: p.x, y: -p.y }));
  const longMm = s.long_mm && s.long_mm > 0 ? s.long_mm : extent(flipped).long;
  if (!(longMm > 0)) throw new Error("輪郭の点がみな同じ所にあります");
  const m = measureOutline({ outlinePx: flipped, longMm, widthMm: s.width_mm });
  return { outlineMm: m.outlineMm, longMm: m.longMm, widthMm: m.widthMm, depthMm: s.depth_mm };
}

/** 簡単な形から：長辺を x 軸、幅を y 軸に置く */
function fromPreset(s: StoneInput): StoneParams {
  const preset = s.preset ?? "oval";
  const longMm = s.long_mm;
  if (!(longMm && longMm > 0)) throw new Error("簡単な形を使うときは、長辺（long_mm）を 0 より大きい mm で渡してください");
  const widthMm = preset === "round" ? longMm : s.width_mm && s.width_mm > 0 ? s.width_mm : longMm * DEFAULT_WIDTH_RATIO[preset];
  return { outlineMm: presetOutline(preset, longMm, widthMm), longMm, widthMm, depthMm: s.depth_mm };
}

/** 幅を渡されなかったときの、幅 ÷ 長辺（形の決まりで、職人の目安ではない） */
const DEFAULT_WIDTH_RATIO: Record<StonePreset, number> = { triangle: 0.87, oval: 0.75, round: 1, square: 1 };

/** 簡単な形の縁（mm、y は上向き、反時計回り、重心が原点）。三角は長辺を底にした二等辺三角形 */
export function presetOutline(preset: StonePreset, longMm: number, widthMm: number): Point[] {
  const a = longMm / 2;
  const b = widthMm / 2;
  if (preset === "oval" || preset === "round") {
    return Array.from({ length: PRESET_POINTS }, (_, i) => {
      const t = (i / PRESET_POINTS) * Math.PI * 2;
      return { x: a * Math.cos(t), y: b * Math.sin(t) };
    });
  }
  const corners: Point[] =
    preset === "triangle"
      ? [
          { x: -a, y: -b },
          { x: a, y: -b },
          { x: 0, y: b },
        ]
      : [
          { x: -a, y: -b },
          { x: a, y: -b },
          { x: a, y: b },
          { x: -a, y: b },
        ];
  const pts = densify(corners, PRESET_POINTS);
  // 型紙の「＋」は重心なので、重心を原点に置く
  const c = centroid(pts);
  return pts.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
}

/** 多角形の辺の上に点を足す（角はそのまま尖らせておく） */
function densify(poly: Point[], total: number): Point[] {
  const per = Math.max(1, Math.round(total / poly.length));
  const out: Point[] = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    for (let k = 0; k < per; k++) out.push({ x: p.x + ((q.x - p.x) * k) / per, y: p.y + ((q.y - p.y) * k) / per });
  });
  return out;
}
