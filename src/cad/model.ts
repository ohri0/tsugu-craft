// 設計のデータ（職人が動かせる点・断面・彫った線・技法）と、そこから形を作る所。画面に依存しない。
import { outline, type FormId } from "./forms";
import { engraveRelief, nanakoRelief, sumRelief, tsuchimeRelief } from "./relief";
import { SECTION_PRESETS, innerDiameterOf, plateSolid, ringSolid, smoothClosed, type Pt, type Section } from "./solid";
import { DEFAULT_PARAMS, type MetalId, type TechniqueId, type TechniqueParams } from "./techniques";

export type Kind = "plate" | "ring";

export interface Design {
  name: string;
  kind: Kind;
  /** 元にした形（名前に使う） */
  shape: FormId;
  /** 板もの：輪郭の制御点（mm）。点を動かすと形が変わる */
  ctrl: Pt[];
  thickness: number;
  /** ふちの丸め（mm） */
  edgeRadius: number;
  /** 指輪 */
  gou: number;
  top: Section;
  bottom: Section;
  blendDeg: number;
  tech: TechniqueId;
  metal: MetalId;
  palette: number;
  tp: TechniqueParams;
  /** 毛彫りの線（板の上、mm） */
  engraves: Pt[][];
  engraveWidth: number;
  engraveDepth: number;
  reason?: string;
}

/** 元の形から、動かせる制御点を作る（大きさ size mm） */
export function presetCtrl(id: Exclude<FormId, "ring">, size: number): Pt[] {
  const n = id === "ume" ? 20 : id === "hyotan" ? 16 : 12;
  const pts = outline(id, size);
  const step = pts.length / n;
  return Array.from({ length: n }, (_, i) => {
    const p = pts[Math.round(i * step) % pts.length];
    return { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
  });
}

export function newDesign(shape: FormId, size = 30, thickness = 2): Design {
  const ring = shape === "ring";
  return {
    name: "",
    kind: ring ? "ring" : "plate",
    shape,
    ctrl: ring ? [] : presetCtrl(shape, size),
    thickness,
    edgeRadius: Math.min(0.5, thickness * 0.3),
    gou: 12,
    top: SECTION_PRESETS.kouman(6, 1.7),
    bottom: SECTION_PRESETS.kouman(4.5, 1.5),
    blendDeg: 120,
    tech: "mokume",
    metal: "copper",
    palette: 0,
    tp: { ...DEFAULT_PARAMS },
    engraves: [],
    engraveWidth: 0.35,
    engraveDepth: 0.12,
  };
}

/** なめらかにした輪郭（mm） */
export function outlineOf(d: Design): Pt[] {
  return smoothClosed(d.ctrl, 14);
}

/** 輪郭の大きさ（いちばん長い所、mm）と面積（mm²） */
export function measureOutline(pts: readonly Pt[]): { long: number; width: number; height: number; area: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    a += p.x * q.y - q.x * p.y;
  }
  const width = maxX - minX;
  const height = maxY - minY;
  return { long: Math.max(width, height), width, height, area: Math.abs(a) / 2 };
}

/** 技法の起伏（形そのものに入るもの）。木目金・布目象嵌・磨きは平らな面（模様は色） */
function techRelief(d: Design): ((x: number, y: number) => number) | null {
  if (d.tech === "nanako") return nanakoRelief(d.tp.dotMm, d.tp.pitchMm);
  if (d.tech === "tsuchime") return tsuchimeRelief(d.tp.dentMm, d.tp.dentMm * 0.04, d.tp.seed);
  return null;
}

/** 格子の細かさ（mm）：起伏が細かいほど細かく。点が多くなりすぎないよう、面積で下限を決める */
export function cellFor(d: Design, area: number, maxVerts = 220_000): number {
  let c = Math.max(0.12, Math.min(0.5, d.edgeRadius / 2.5));
  if (d.tech === "nanako") c = Math.min(c, d.tp.dotMm / 5);
  if (d.tech === "tsuchime") c = Math.min(c, d.tp.dentMm / 8);
  if (d.engraves.length) c = Math.min(c, d.engraveWidth / 3);
  return Math.max(c, Math.sqrt(area / maxVerts));
}

export interface Built {
  positions: Float32Array;
  uvs: Float32Array;
  indices?: Uint32Array;
  /** 実際に使った格子の細かさ（mm）。起伏が粗くなったら画面で知らせる */
  cell: number;
}

/** 設計から形を作る。coarse は、点を動かしている間の速い下書き（起伏なし・粗い格子） */
export function buildDesign(d: Design, coarse = false): Built {
  if (d.kind === "ring") {
    const relief = coarse ? null : techRelief(d);
    const w = Math.max(d.top.width, d.bottom.width);
    const circ = Math.PI * (innerDiameterOf(d.gou) + 2 * d.top.thickness);
    const cell = relief ? Math.max(cellFor(d, w * circ), 0.06) : 0.3;
    const around = Math.min(2400, Math.max(160, Math.round(circ / cell)));
    const across = Math.min(160, Math.max(16, Math.round(w / cell)));
    const r = ringSolid({ innerDiameter: innerDiameterOf(d.gou), top: d.top, bottom: d.bottom, blendDeg: d.blendDeg, around, across, relief: relief ?? undefined });
    return { ...r, cell };
  }
  const out = outlineOf(d);
  const m = measureOutline(out);
  const cell = coarse ? Math.max(0.5, Math.sqrt(m.area / 30_000)) : cellFor(d, m.area);
  const relief = coarse ? undefined : sumRelief(techRelief(d), d.engraves.length ? engraveRelief(d.engraves, d.engraveWidth, d.engraveDepth) : null);
  const mesh = plateSolid({ outline: out, thickness: d.thickness, edgeRadius: d.edgeRadius, cell, relief });
  return { ...mesh, cell };
}

/** 地金の比重（g/cm³）。重さの目安 */
export const DENSITY: Record<MetalId, number> = { k18: 15.5, pt: 21.4, sv: 10.4, copper: 8.9, shakudo: 9.0, shibuichi: 9.3, iron: 7.9 };
