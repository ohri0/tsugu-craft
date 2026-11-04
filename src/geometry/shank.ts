// 腕：内側が平らで、外側の断面（甲丸・平打ち・半甲丸・角・手で描いた形）を指のまわりに回した輪。画面に依存しない純粋な関数。
// 座標は指輪の座標（ring.ts と同じ）：mm、x が指の向き（指の付け根 → 指先）、z が上（石のある側）、
// y は x と z の両方に直角（右手系）。指の軸は x 軸そのもので、腕は y–z の面にある円。
// 腕の内側のいちばん上（指のいちばん上）は z ＝ 内径 ÷ 2 の所。
import { GUIDES, innerDiameterMm, type MetalId } from "../rules/guides";
import { closedPart, ringsToTube, type V3 } from "./mesh";
import { meshVolume } from "./stone";
import { adaptiveSample, sampleCurve, uniformKnots, validKnots } from "./bspline";

/** 腕の断面：甲丸・平打ち・半甲丸・角、と手で描いた形 */
export type ShankSection = "kouman" | "hirauchi" | "hangouman" | "kaku" | "free";
export const SHANK_SECTIONS = ["kouman", "hirauchi", "hangouman", "kaku"] as const;
export const SHANK_SECTION_LABEL: Record<ShankSection, string> = { kouman: "甲丸", hirauchi: "平打ち", hangouman: "半甲丸", kaku: "角", free: "手で描く" };

/** 断面の点（幅の位置 x：真ん中 0〜端 1、高さ y：内側 0〜いちばん厚い所 1） */
export interface SectionPoint {
  x: number;
  y: number;
}

export interface ShankParams {
  /** 号数（日本のサイズ） */
  gou: number;
  /** 幅（mm、指の向きの長さ）。なければ目安 */
  widthMm?: number;
  /** 厚み（mm、いちばん厚い真ん中）。なければ目安 */
  thicknessMm?: number;
  /** 地金。なければ K18 イエロー */
  metal?: MetalId;
  /** 断面。なければ甲丸 */
  section?: ShankSection;
  /**
   * 手で描いた断面（section が free のとき）：片側の形を決める点。真ん中のいちばん上（x ＝ 0）から、端の内側（y ＝ 0）へ順に。
   * 左右は同じ形（真ん中で折り返す）。点はなめらかな線（B スプライン）の制御点で、線は点の内側を通る
   */
  sectionPoints?: readonly SectionPoint[];
  /** 手で描いた断面の線（左右の制御点と節。section が free のとき。sectionPoints より先に使う） */
  sectionCurve?: SectionCurve;
  /**
   * 石座を受ける肩。腕のいちばん上のまわりだけ幅を広げ、石座の足が腕の幅に収まるようにする。
   * なければ、どこも同じ幅（いちばん上で広げない）
   */
  head?: ShankHead;
}

export interface ShankHead {
  /** いちばん上の幅（mm）。腕の幅より狭ければ広げない */
  widthMm: number;
  /** その幅を保つ長さ（mm、腕の外側に沿って測る。真ん中が腕のいちばん上） */
  spanMm: number;
  /** 広い所から元の幅へ、なめらかに戻る長さ（mm、片側） */
  taperMm: number;
}

export interface ShankResult {
  /** 三角形ごとに 3 頂点 × xyz（頂点は共有しない） */
  positions: Float32Array;
  gou: number;
  innerDiameterMm: number;
  innerRadiusMm: number;
  /** 外側のいちばん上の半径（内径 ÷ 2 ＋ 厚み） */
  outerRadiusMm: number;
  widthMm: number;
  thicknessMm: number;
  section: ShankSection;
  metal: MetalId;
  /** 体積（mm³） */
  volumeMm3: number;
  /** 重さの見積もり（g）＝ 体積 × 地金の密度（目安） */
  weightG: number;
}

/** 指のまわりの分け方と、内側の平らな所の分け方（形を作るための決まり） */
const AROUND = 128;
const FLAT = 6;
/**
 * 断面の形の決まり（形を作るための決まり。職人の目安の数ではない。**仮**：作者が見て、実物の線材に合わせて直す。
 * .claude/skills/jeweler-guides/SKILL.md の「腕とサイズ」にも書いた）。
 * どの断面も、なめらかな線（3 次の B スプライン）の制御点（線を引っぱる点）で決める。片側だけを書き、真ん中で折り返す。
 * 点は、真ん中のいちばん上（x ＝ 0）から、端の内側（y ＝ 0）へ順に。線は点を通らず、点の内側をなめらかに通る。
 * - 甲丸：半楕円（だ円の半分）に合わせた点（半楕円とのずれは幅の 0.1 % 以下）。
 * - 半甲丸：端は縦に立ち、上はゆるい丸み。
 * - 平打ち：上は平ら、角はなめらかに丸く、横は縦。
 * - 角：四角。角だけ小さく丸い。
 * turnDeg・stepLen：3D に使う点の細かさ（向きが turnDeg 度変わるか、stepLen 進むごとに点を置く。幅・厚みを 1 とした長さ）
 */
export const SECTION_SHAPE = {
  presets: {
    kouman: [[0, 1.109], [0.784, 0.784], [1, 0.262], [1, 0]],
    hangouman: [[0, 1], [0.5, 1], [0.95, 0.8], [1, 0.5], [1, 0]],
    hirauchi: [[0, 1], [0.4, 1], [0.72, 1], [1, 0.8], [1, 0.4], [1, 0]],
    kaku: [[0, 1], [0.5, 1], [0.86, 1], [1, 1], [1, 0.86], [1, 0.4], [1, 0]],
  } as Record<Exclude<ShankSection, "free">, [number, number][]>,
  turnDeg: 3,
  stepLen: 0.25,
};

/**
 * 手で描いた断面：なめらかな線の制御点（右の端の内側 → 上 → 左の端の内側。最初と最後の点は内側の線 y ＝ 0 の上）と節。
 * x は幅の位置（線の左右の端が −1 と 1）、y は高さ（いちばん高い所が 1）にそろえておく（normalizeCurve）。
 * 節がなければ等しい間隔
 */
export interface SectionCurve {
  points: SectionPoint[];
  knots?: number[];
}

/** 片側の点（真ん中 → 端）を折り返して、左右の点の列（右の端 → 左の端）にする */
export function curveFromHalf(half: readonly SectionPoint[]): SectionCurve {
  const h = cleanPoints(half);
  // 3 次の線には左右で 4 点以上いる（片側 2 点なら、間に 1 点足す）
  if (h.length < 3) h.splice(1, 0, { x: h[1].x / 2, y: h[0].y });
  const points = [...[...h].reverse().map((p) => ({ ...p })), ...h.slice(1).map((p) => ({ x: -p.x, y: p.y }))];
  return normalizeCurve({ points, knots: uniformKnots(points.length) });
}

/** 決まった断面の線（左右の制御点と節） */
export function presetCurve(section: ShankSection): SectionCurve {
  return curveFromHalf(sectionControlPoints(section));
}

/** 節を取り出す（なかったり、合わなかったりすれば、等しい間隔） */
export function curveKnots(c: SectionCurve): number[] {
  return validKnots(c.points.length, c.knots) ? [...c.knots!] : uniformKnots(c.points.length);
}

/** 線の大きさ（細かく取った線の左右の端と、いちばん高い所） */
export function curveExtent(c: SectionCurve): { xMin: number; xMax: number; yMax: number } {
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMax = 0;
  for (const { p } of sampleCurve(c.points, curveKnots(c), 24)) {
    xMin = Math.min(xMin, p.x);
    xMax = Math.max(xMax, p.x);
    yMax = Math.max(yMax, p.y);
  }
  return { xMin, xMax, yMax };
}

/** 線の左右の端が −1 と 1、いちばん高い所が 1 になるよう、点を動かしてそろえる（形は同じ。線は点と同じように伸び縮みする） */
export function normalizeCurve(c: SectionCurve): SectionCurve {
  const knots = curveKnots(c);
  const { xMin, xMax, yMax } = curveExtent({ points: c.points, knots });
  const cx = (xMin + xMax) / 2;
  const hw = Math.max(1e-6, (xMax - xMin) / 2);
  const t = Math.max(1e-6, yMax);
  const points = c.points.map((p, i) => ({ x: (p.x - cx) / hw, y: i === 0 || i === c.points.length - 1 ? 0 : Math.max(0, p.y) / t }));
  return { points, knots };
}

/**
 * 断面の外側の線（幅の位置 ξ：−1〜1、高さ η：0〜1）。右の端の内側から、左の端の内側まで（両端をふくむ）。
 * なめらかな線を、曲がる所ほど細かく取る。どの断面も、幅の端が ±1、いちばん高い所が 1
 */
export function sectionOutline(section: ShankSection = "kouman", points?: readonly SectionPoint[], curve?: SectionCurve): [number, number][] {
  const c = section === "free" ? (curve?.points.length ? normalizeCurve(curve) : curveFromHalf(points?.length ? points : sectionControlPoints("kouman"))) : presetCurve(section);
  return adaptiveSample(c.points, curveKnots(c), SECTION_SHAPE.turnDeg, SECTION_SHAPE.stepLen).map((p) => [p.x, Math.max(0, p.y)] as [number, number]);
}

/** 決まった断面の片側の制御点（真ん中のいちばん上 → 端の内側） */
export function sectionControlPoints(section: ShankSection): SectionPoint[] {
  const key = section === "free" ? "kouman" : section;
  return SECTION_SHAPE.presets[key].map(([x, y]) => ({ x, y }));
}

/** 片側の点（真ん中 → 端）を、なめらかな線にする（左右同じ形。幅の端が ±1、いちばん高い所が 1） */
export function freeOutline(points: readonly SectionPoint[]): [number, number][] {
  return sectionOutline("free", points);
}

/**
 * 片側の点を、使える形に整える：x は 0 以上、y は 0〜（いちばん高い点の 1.5 倍まで）、最初は真ん中（x ＝ 0）、最後は端の内側（y ＝ 0）
 */
export function cleanPoints(points: readonly SectionPoint[]): SectionPoint[] {
  const fin = (v: number) => (Number.isFinite(v) ? v : 0);
  const p = points.map((q) => ({ x: Math.max(0, fin(q.x)), y: Math.max(0, fin(q.y)) }));
  if (p.length < 2) return SECTION_SHAPE.presets.kouman.map(([x, y]) => ({ x, y }));
  p[0] = { x: 0, y: Math.max(0.05, p[0].y) };
  const n = p.length - 1;
  p[n] = { x: Math.max(p[n].x, 0.05), y: 0 };
  return p;
}

export function buildShank(p: ShankParams): ShankResult {
  const section = p.section ?? "kouman";
  const w = p.widthMm ?? GUIDES.shank.widthMm;
  // 角の断面は、厚みを決めていなければ幅と同じ（四角）
  const t = p.thicknessMm ?? (section === "kaku" ? w : GUIDES.shank.thicknessMm);
  const metal = p.metal ?? "k18y";
  const dIn = innerDiameterMm(p.gou);
  const r = dIn / 2;
  // 断面（ξ：幅の中の位置 −1〜1、ρ：指の軸からの距離）。内側の平らな所を −1 → +1、外側を +1 → −1
  const section2: [number, number][] = [];
  // 外側の線は右の端の内側（y ＝ 0）から左の端の内側まで。内側の平らな所は、左の端 → 右の端（右の端は外側の線の始まり）
  const outer = sectionOutline(section, p.sectionPoints, p.sectionCurve);
  const xR = outer[0][0];
  const xL = outer[outer.length - 1][0];
  for (let i = 0; i < FLAT; i++) section2.push([xL + ((xR - xL) * i) / FLAT, r]);
  for (const [xi, eta] of outer.slice(0, -1)) section2.push([xi, r + t * eta]);
  // 指のまわりの角度 φ での幅（肩のある所だけ広い）。φ = 0 がいちばん上（+z）
  const widthAt = shoulderWidth(w, r + t, p.head);
  // 断面の点ごとに、指のまわりを 1 周する輪
  const rings: V3[][] = section2.map(([xi, rho]) =>
    Array.from({ length: AROUND }, (_, k) => {
      const phi = (k / AROUND) * Math.PI * 2;
      return [(xi * widthAt(phi)) / 2, rho * Math.sin(phi), rho * Math.cos(phi)] as V3;
    }),
  );
  const tris: number[] = [];
  ringsToTube(rings, tris);
  const positions = closedPart(tris);
  const volumeMm3 = meshVolume(positions);
  return {
    positions,
    gou: p.gou,
    innerDiameterMm: dIn,
    innerRadiusMm: r,
    outerRadiusMm: r + t,
    widthMm: w,
    thicknessMm: t,
    section,
    metal,
    volumeMm3,
    weightG: weightG(volumeMm3, metal),
  };
}

/**
 * 指のまわりの角度 φ（ラジアン、いちばん上が 0）での腕の幅。肩がなければいつも w。
 * 肩があれば、いちばん上から外側に沿って spanMm / 2 までは広い幅、そこから taperMm でなめらかに（余弦の形で）元の幅へ戻る。
 */
function shoulderWidth(w: number, outerR: number, head: ShankHead | undefined): (phi: number) => number {
  if (!head || head.widthMm <= w) return () => w;
  return (phi) => {
    const a = Math.atan2(Math.sin(phi), Math.cos(phi)); // −π〜π にそろえる
    const s = Math.abs(a) * outerR - head.spanMm / 2;
    const k = s <= 0 ? 1 : s >= head.taperMm ? 0 : 0.5 * (1 + Math.cos((Math.PI * s) / head.taperMm));
    return w + (head.widthMm - w) * k;
  };
}

/** 体積（mm³）から重さ（g）の見積もり。1 cm³ ＝ 1000 mm³ */
export function weightG(volumeMm3: number, metal: MetalId): number {
  return (volumeMm3 / 1000) * GUIDES.metals[metal].densityGPerCm3;
}
