// 石座（覆輪・爪・V 字の爪・石座の輪）を、石の縁の形に沿わせて作る。画面に依存しない純粋な関数。
// 座標は stone.ts と同じ：mm、x が長辺、y が幅、z が上（テーブル側）、z = 0 が縁（ガードル）の真ん中。
// 職人の目安の値はすべて src/rules/guides.ts から読む。ここにある定数は「形を作るための決まり」だけ。
import { GUIDES, minProngMm, standardProngMm, stoneSizeMm, type HeightOption } from "../rules/guides";
import { findCorners, type Corner } from "./corners";
import { add, closedPart, closedParts, concat, dot, len, normalize, ringsToTube, scale, smoothPath, stackLoops, sub, sweepTube, type V3 } from "./mesh";
import { outwardNormals } from "./offset";
import { buildSolid, smax, type Box, type Field, type Tube } from "./sdf";
import { perimeter, resample, toCounterClockwise, type Point } from "./polygon";
import { girdleCenter, stoneHeights, stoneKnots, stoneScaleAt, type StoneHeights, type StoneParams } from "./stone";

export type SettingStyle = "bezel" | "prong";

/** 爪を 1 本ずつ手で決めるとき */
export interface ProngSpec {
  /** 縁の上の位置（0〜1、縁の最初の点から反時計回りに、周に対する割合） */
  t: number;
  /** V 字の爪にするか（角を包む。足 2 本） */
  v?: boolean;
  /** 太さ（mm）。なければ全体の太さ */
  diameterMm?: number;
}

export interface SettingParams {
  /** 爪の最低の太さ（mm）。目安帳に職人の決まりがあればその値（なければ guides.ts の式）。標準の太さは これ × 倍率 */
  minProngMm?: number;
  stone: StoneParams;
  style: SettingStyle;
  /** 高さ：低め / 標準 / 高め。既定は標準 */
  height?: HeightOption;
  /** 石の一番下と指のすき間（mm）を直接決める（高さの選択より優先。確かめのテスト用にも使う） */
  culetGapMm?: number;
  /** 爪の本数（なければ角の数・石の形から自動） */
  prongCount?: number;
  /** 爪の太さ（mm、全部の爪）。なければ標準の太さ */
  prongDiameterMm?: number;
  /** 爪を 1 本ずつ決める（本数・角の選択より優先） */
  prongs?: readonly ProngSpec[];
  /** 先に守る角（縁の上の位置 t）。なければ尖った角を尖った順に本数まで */
  cornerTs?: readonly number[];
  /** 選んだ角を V 字の爪で包むか。既定は包む */
  vAtCorners?: boolean;
  /** 爪の先の高さ ＝ 石の一番下から上面までの高さに対する割合。なければ目安の範囲の中で決める */
  tipRatio?: number;
  /** 覆輪の壁の厚み（mm）。なければ目安 */
  bezelWallMm?: number;
  /** 腕の厚み（mm）。石座の高さの下限を決めるのに使う。なければ目安 */
  shankThicknessMm?: number;
  /**
   * 爪留めの石座を、継ぎ目のない一体の形で作る（爪を起こし、つなぎ目に丸み、石の形で座を彫る）。
   * 画面と STL 用。確かめに使う数（爪の位置・長さなど）は変わらない。重いのでテストでは使わない
   */
  solid?: boolean;
  /** 一体の形の細かさ。preview は粗い格子で速く（つまみを動かしている間）、final は細かく（既定） */
  solidQuality?: SolidQuality;
}

export type SolidQuality = "preview" | "final";

export interface ProngInfo {
  /** 縁の上の位置（0〜1）。V 字の爪は包む角の位置 */
  t: number;
  /** その位置にいちばん近い、縁の点の番号（反時計回りにそろえた輪郭の番号） */
  index: number;
  isV: boolean;
  /** 留まりで数える足の本数（ふつうの爪 1、V 字 2） */
  legs: number;
  /** 足ごとの縁の上の位置 */
  legTs: number[];
  /** 上から見た爪の中心（縁の高さ）。V 字の爪は角を包む所 */
  point: Point;
  /** 上から見た足ごとの中心 */
  legPoints: Point[];
  diameterMm: number;
  /** 爪の長さ（mm）：上の石座の輪（支え）から爪の先までの高さ。留まりの比較に使う */
  lengthMm: number;
  tipZ: number;
  /** positions の中で、この爪の三角形の範囲（三角形の番号） */
  triangles: TriangleRange;
}

export interface TriangleRange {
  start: number;
  count: number;
}

export interface GalleryRing {
  z: number;
  /** 輪の線の太さ（mm） */
  wireMm: number;
  triangles: TriangleRange;
}

export interface BezelInfo {
  wallMm: number;
  clearanceMm: number;
  /** 上の端が縁の上から石の上側にかかる高さ（mm） */
  coverMm: number;
  topZ: number;
  bottomZ: number;
  /** 縁の高さでの、壁の内側と外側の線（3D の形と同じ点） */
  innerOutline: Point[];
  outerOutline: Point[];
  triangles: TriangleRange;
}

export interface SettingHeights extends StoneHeights {
  /** 指（腕の内側のいちばん上）の z */
  fingerZ: number;
  /** 腕の外側のいちばん上の z */
  shankTopZ: number;
  /** 石座の下の端の z。爪留めは下の輪の下の面（腕の上の溝に入る所。爪の下の端もここで切りそろえる）。覆輪は壁の下の端 */
  baseZ: number;
  /** 石の一番下と指のすき間（mm） */
  culetGapMm: number;
  /** 爪の先の z（覆輪なら null） */
  tipZ: number | null;
  upperRingZ: number | null;
  lowerRingZ: number | null;
  /** 石座のいちばん上の z */
  topZ: number;
  /** 指から石座のいちばん上までの高さ（mm） */
  heightAboveFingerMm: number;
}

export interface SettingResult {
  style: SettingStyle;
  /** 三角形ごとに 3 頂点 × xyz（頂点は共有しない）。爪・輪・覆輪の順 */
  positions: Float32Array;
  /** 一体の形のときの、頂点ごとの向き（positions と同じ並び）。なければ画面で面から求める */
  normals?: Float32Array;
  prongs: ProngInfo[];
  rings: GalleryRing[];
  bezel: BezelInfo | null;
  heights: SettingHeights;
  /** 縁から見つけた尖った角 */
  corners: Corner[];
  minProngMm: number;
  standardProngMm: number;
  /** 標準の 4 本爪・標準の太さ・標準の高さのときの爪の長さ（留まり 1.0× の基準） */
  standardLengthMm: number;
}

/** 縁を取り直す点の数（石座の 3D の細かさ） */
const OUTLINE_POINTS = 128;
/** 角で、隣の点どうしの外向きの向きがこの角度（ラジアン）より大きく回る所には点を足す。外へずらした線が角で丸く回る */
const MAX_TURN_RAD = (8 * Math.PI) / 180;
/** 爪の針金の断面の円を何角形で作るか（20 以上で、光の当たり方が丸く見える） */
export const PRONG_SIDES = 20;
/** 石座の輪の針金の断面 */
const RING_SIDES = 16;
/** 針金の端の丸いふたの段の数 */
const CAP_STEPS = 7;
/** 爪の中心の線を取り直す間隔（mm） */
const PATH_STEP = 0.1;
/**
 * 石の一番下の近くでは、石の外形はほとんど点まで縮む。爪の足と下の輪がそこへ集まって固まりにならないよう、
 * 石座の形は縁の形をこの倍率より小さくは縮めない
 */
const FOOT_SCALE = 0.2;
/** 爪の下の端の丸いふたの長さ（爪の半径に対する倍率）。下の輪の下の面で切りそろえた端なので、ほとんど平ら */
const FOOT_CAP = 0.35;
/**
 * 爪の先の形（爪の半径に対する倍率）。先は石の上側に乗るので、石に直角な向きに少し薄く（normal）、横に少し細く（side）し、
 * 先から taper 本分の長さで細くしていく。端は cap の長さの丸いふた
 */
const TIP = { normal: 0.78, side: 0.85, taper: 2.4, cap: 0.75 };
/** 爪の先の曲がり：縁の上から真上へ出る引っぱり（rise）と、石の面に沿って先へ届く引っぱり（lean）の強さ */
const BEND = { rise: 0.25, lean: 0.4 };
/**
 * V 字の爪の、角を包む板（上から見て V の字）。thick：板の厚み ＝ 爪の太さ × この値（足より少し薄い板が、角に沿って折れる）。
 * below：縁の下から下へ、爪の太さの何本分まで包むか。round：上下の端の丸みの高さ（板の厚みの半分に対する倍率）。
 * over：上の端の丸みのうち、先の高さより上に出る割合（残りは先の高さより下で、石の上側に乗る）。
 * steps：丸みの段の数。along：縁に沿った点の数。capSides：板の両端の半円の分け方。
 * upright：縁より下で、板の外側を石の下側の面のこの割合しか内へ倒さない（下へ行くほど板が厚くなり、足を受け止める）。
 * step：板の高さの方向の段の間隔（mm。細かいほど面がなめらか）。
 * square：断面の角の丸め方（2 で丸、大きいほど角の丸い四角）。capLength：両端の張り出しの長さ（厚みの半分に対する倍率）
 */
const V_WALL = { thick: 0.46, below: 0.35, round: 0.9, over: 0.45, steps: 8, along: 32, capSides: 12, upright: 1, step: 0.1, square: 3.2, capLength: 0.75 };
/** 板の外側の線を丸く太らせるときの、高さの方向の分け方 */
const ROUND_OFFSET_STEPS = 48;
/** V 字の爪の足：板の中に隠れるよう、板の厚みの半分の inside 倍まで細くなりながら、板の下の丸みの上（丸みの高さの into 倍だけ上）まで入る。
 * 端の丸いふたは短く（endCap 倍）して、板の外へ出ないようにする */
const V_LEG = { inside: 0.75, into: 0.1, endCap: 0.4 };
/** V 字の爪の 2 本の足が 1 本の軸に合わさる所：上の輪と下の輪の間のこの割合の高さ（0 なら下の輪の高さで、合わさる所が輪に隠れる）。軸は足よりわずかに太く */
const V_STEM = { at: 0, thicken: 1.06 };
/** 覆輪の上の端の丸み（半円）を何段で作るか（偶数にすると、いちばん上の点がちょうど上の端の高さに来る） */
const LIP_STEPS = 8;
/** 覆輪の壁の途中の高さの間隔（mm）。なめらかに見えるよう、段の間を細かく */
const WALL_STEP = 0.3;
/** 覆輪の下の端を、腕の厚みのこの割合だけ腕の中へ入れる（つながって見えるように）。爪留めの石座は使わない（下の輪で腕にのる） */
const EMBED_RATIO = 0.5;
/** 石座の輪 2 段を置くのに要る、縁の下と腕の上の間（輪の線の太さの何本分か） */
const RING_ROOM_WIRES = 3;
const EPS = 1e-6;

/** 爪の本数の決まり：角が 3〜6 つなら角の数、細長い・大きい石は 6、それ以外は 4 */
export function autoProngCount(longMm: number, widthMm: number, cornerCount: number): number {
  const p = GUIDES.prong;
  const [lo, hi] = p.cornerCountRange;
  if (cornerCount >= lo && cornerCount <= hi) return cornerCount;
  if (longMm / widthMm > p.elongatedRatio || longMm > p.largeLongMm) return 6;
  return GUIDES.hold.standardProngCount;
}

export interface ProngPlan {
  t: number;
  isV: boolean;
  diameterMm: number;
}

/** 爪の位置を決める（形はまだ作らない）。選んだ角を先に守り、残りは縁に均等に配る。t の小さい順 */
export function planProngs(params: SettingParams, corners: readonly Corner[] = findCorners(params.stone.outlineMm)): ProngPlan[] {
  const s = params.stone;
  const d = params.prongDiameterMm ?? stdProngFor(params);
  if (params.prongs) {
    return params.prongs.map((p) => ({ t: wrap(p.t), isV: !!p.v, diameterMm: p.diameterMm ?? d })).sort((a, b) => a.t - b.t);
  }
  const count = Math.max(1, Math.round(params.prongCount ?? autoProngCount(s.longMm, s.widthMm, corners.length)));
  const chosen = params.cornerTs
    ? params.cornerTs.map(wrap)
    : [...corners]
        .sort((a, b) => a.angleDeg - b.angleDeg || a.t - b.t)
        .slice(0, count)
        .map((c) => c.t);
  const fixed = [...new Set(chosen)].sort((a, b) => a - b).slice(0, count);
  // 角を V 字の爪で包むのは、三角・しずく形・舟形の先のような尖った角。四角い石（角が 4 つ以上で、直角に近い）は、丸い爪 1 本を角に立てる
  const angleAt = (t: number) => corners.find((c) => Math.abs(c.t - t) < 1e-9)?.angleDeg ?? 0;
  // 角を V 字で包むか、丸い爪を角に立てるか（画面は作者の判断で丸い爪：「かぶさる V 字ではなく、普通の爪留めに」）
  void angleAt;
  const vFor = (_t: number) => params.vAtCorners ?? GUIDES.prong.vAtCornersDefault;
  const rest = spread(fixed, count - fixed.length, longEndT(s.outlineMm));
  return [
    ...fixed.map((t) => ({ t, isV: vFor(t), diameterMm: d })),
    ...rest.map((t) => ({ t, isV: false, diameterMm: d })),
  ].sort((a, b) => a.t - b.t);
}

/**
 * 決まった位置の間に、残りの m 本を配る。いちばん広い間を順に割っていくので、いちばん空いた所が小さくなる。
 * 決まった位置がなければ、長辺の端から半歩ずらして均等に。
 */
function spread(fixed: readonly number[], m: number, startT: number): number[] {
  if (m <= 0) return [];
  if (fixed.length === 0) return Array.from({ length: m }, (_, k) => wrap(startT + (k + 0.5) / m));
  const gaps = fixed.map((t, j) => (j + 1 < fixed.length ? fixed[j + 1] : fixed[0] + 1) - t);
  const k = gaps.map(() => 0);
  for (let q = 0; q < m; q++) {
    let best = 0;
    for (let j = 1; j < gaps.length; j++) if (gaps[j] / (k[j] + 1) > gaps[best] / (k[best] + 1) + EPS) best = j;
    k[best]++;
  }
  const out: number[] = [];
  fixed.forEach((t, j) => {
    for (let q = 1; q <= k[j]; q++) out.push(wrap(t + (gaps[j] * q) / (k[j] + 1)));
  });
  return out;
}

/** 長辺の +x 側の端の、縁の上の位置 */
function longEndT(outline: readonly Point[]): number {
  const pts = resample(toCounterClockwise(outline), OUTLINE_POINTS);
  let best = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i].x > pts[best].x + EPS) best = i;
  return best / pts.length;
}

/** 縁の点の番号 → 縁の上の位置 t（反時計回りにそろえた輪郭の番号） */
export function tAtOutlineIndex(outline: readonly Point[], index: number): number {
  const pts = toCounterClockwise(outline);
  const n = pts.length;
  const total = perimeter(pts);
  let s = 0;
  const i = ((Math.round(index) % n) + n) % n;
  for (let k = 0; k < i; k++) s += Math.hypot(pts[k + 1].x - pts[k].x, pts[k + 1].y - pts[k].y);
  return total > 0 ? s / total : 0;
}

/** 縁の上の位置 t → いちばん近い縁の点の番号 */
export function outlineIndexAtT(outline: readonly Point[], t: number): number {
  const pts = toCounterClockwise(outline);
  const total = perimeter(pts);
  const u = wrap(t);
  let s = 0;
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k < pts.length; k++) {
    const f = total > 0 ? s / total : 0;
    const dd = Math.min(Math.abs(f - u), 1 - Math.abs(f - u));
    if (dd < bestD - EPS) {
      bestD = dd;
      best = k;
    }
    const q = pts[(k + 1) % pts.length];
    s += Math.hypot(q.x - pts[k].x, q.y - pts[k].y);
  }
  return best;
}

/** 爪の先の高さの目安の z。「上面までの 75〜85%」と「上側にかかる 33〜50%」の両方に入る所の真ん中 */
export function defaultTipZ(h: StoneHeights): number {
  const p = GUIDES.prong;
  const k = stoneKnots(h);
  const total = h.tableZ - h.culetZ;
  const [r0, r1] = p.tipHeightRatio;
  const [o0, o1] = p.crownOverlapRatio;
  const lo = Math.max(h.culetZ + r0 * total, k.girdleTop + o0 * h.crownMm);
  const hi = Math.min(h.culetZ + r1 * total, k.girdleTop + o1 * h.crownMm);
  if (lo <= hi) return (lo + hi) / 2;
  // 両方には入らない石（上側が極端に薄い・厚い）：高さの割合を守り、かかりはその中でいちばん近く
  const want = k.girdleTop + ((o0 + o1) / 2) * h.crownMm;
  return Math.min(h.culetZ + r1 * total, Math.max(h.culetZ + r0 * total, want));
}

/** 爪の先の高さを、目安と同じ物差しで測る */
export function tipMeasures(h: StoneHeights, tipZ: number): { ratio: number; overlap: number } {
  const k = stoneKnots(h);
  return {
    ratio: (tipZ - h.culetZ) / (h.tableZ - h.culetZ),
    overlap: h.crownMm > 0 ? (tipZ - k.girdleTop) / h.crownMm : 0,
  };
}

interface Vertical {
  culetGapMm: number;
  fingerZ: number;
  shankTopZ: number;
  baseZ: number;
  lowerRingZ: number;
  upperRingZ: number;
}

/**
 * 高さの決まり。石の一番下が指から 0.3 mm 以上離れる高さが最低（ただし石座の輪や覆輪が腕の上に
 * 収まる高さより低くはしない）。そこへ低め ＋0 / 標準 ＋0.5 / 高め ＋1.0 mm を足す。
 * 爪留めの石座は、爪と輪を 1 つにまとめた部品で、腕とは別に作ってのせる。腕の上に溝を入れて、
 * 下の輪を少し沈めてロウ付けする（爪が 1 本ずつ腕へささることはない）。石座の下の端 ＝ 下の輪の下の面。
 */
function vertical(
  h: StoneHeights,
  style: SettingStyle,
  height: HeightOption,
  culetGapOverride: number | undefined,
  shankT: number,
  wire: number,
  wall: number,
): Vertical {
  const k = stoneKnots(h);
  const below = k.girdleBottom - h.culetZ; // 縁の下から一番下まで
  const room = style === "prong" ? RING_ROOM_WIRES * wire : wall;
  const structural = shankT + room - below;
  const gap = culetGapOverride ?? Math.max(GUIDES.height.minFingerGapMm, structural) + GUIDES.height.options[height];
  const fingerZ = h.culetZ - gap;
  const shankTopZ = fingerZ + shankT;
  // 腕の上の溝の深さ（下の輪を沈める分）
  const notch = GUIDES.gallery.seatInShankRatio * wire;
  const lowerRingZ = Math.min(shankTopZ + wire / 2 - notch, k.girdleBottom - 2 * wire);
  const upperRingZ = (k.girdleBottom + lowerRingZ) / 2;
  const baseZ = style === "prong" ? lowerRingZ - wire / 2 : shankTopZ - shankT * EMBED_RATIO;
  return { culetGapMm: gap, fingerZ, shankTopZ, baseZ, lowerRingZ, upperRingZ };
}

/**
 * 縁を細かく取り直した点・外向きの法線・縁の上の位置 t・石と同じ中心。
 * 角では同じあたりの点に、向きだけ少しずつ回した点を足してある（外へずらすと、角が丸い弧になる）。
 */
interface Frame {
  pts: Point[];
  normals: Point[];
  ts: number[];
  center: Point;
  h: StoneHeights;
}

interface Sample {
  p: Point;
  n: Point;
}

function frameOf(stone: StoneParams): Frame {
  const base = resample(toCounterClockwise(stone.outlineMm), OUTLINE_POINTS);
  const nb = outwardNormals(base);
  const n = base.length;
  const pts: Point[] = [];
  const normals: Point[] = [];
  const ts: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    pts.push(base[i]);
    normals.push(nb[i]);
    ts.push(i / n);
    // 隣の点との間で外向きの向きが大きく回るなら、その間に点を足して少しずつ回す
    const turn = Math.atan2(nb[i].x * nb[j].y - nb[i].y * nb[j].x, nb[i].x * nb[j].x + nb[i].y * nb[j].y);
    const extra = Math.floor(Math.abs(turn) / MAX_TURN_RAD);
    for (let q = 1; q <= extra; q++) {
      const w = q / (extra + 1);
      const c = Math.cos(turn * w);
      const sn = Math.sin(turn * w);
      pts.push({ x: base[i].x + (base[j].x - base[i].x) * w, y: base[i].y + (base[j].y - base[i].y) * w });
      normals.push({ x: nb[i].x * c - nb[i].y * sn, y: nb[i].x * sn + nb[i].y * c });
      ts.push((i + w) / n);
    }
  }
  return { pts, normals, ts, center: girdleCenter(stone.outlineMm), h: stoneHeights(stone) };
}

/** 縁の上の位置 t の点と外向きの法線（隣の点の間をなめらかにつなぐ） */
function sampleAt(f: Frame, t: number): Sample {
  const u = wrap(t);
  const m = f.ts.length;
  // u 以下でいちばん大きい t の番号（ts は小さい順）
  let lo = 0;
  let hi = m - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (f.ts[mid] <= u) lo = mid;
    else hi = mid - 1;
  }
  const i0 = lo;
  const i1 = (i0 + 1) % m;
  const t1 = i1 === 0 ? 1 : f.ts[i1];
  const w = t1 > f.ts[i0] ? (u - f.ts[i0]) / (t1 - f.ts[i0]) : 0;
  const a = f.normals[i0];
  const b = f.normals[i1];
  const nx = a.x * (1 - w) + b.x * w;
  const ny = a.y * (1 - w) + b.y * w;
  const l = Math.hypot(nx, ny) || 1;
  return {
    p: { x: f.pts[i0].x * (1 - w) + f.pts[i1].x * w, y: f.pts[i0].y * (1 - w) + f.pts[i1].y * w },
    n: { x: nx / l, y: ny / l },
  };
}

/** 石座の形の縮み。石の一番下の近くでは、点まで縮めず FOOT_SCALE で止める */
function settingScaleAt(h: StoneHeights, z: number): number {
  return Math.max(stoneScaleAt(h, z), FOOT_SCALE);
}

/** 高さ z の石の外側（縁の形を縮めたもの）から、外へ d だけ離れた点 */
function at(f: Frame, s: Sample, z: number, d: number): V3 {
  const k = settingScaleAt(f.h, z);
  return [f.center.x + (s.p.x - f.center.x) * k + s.n.x * d, f.center.y + (s.p.y - f.center.y) * k + s.n.y * d, z];
}

/** 高さ z の、石の面そのものの点（縮みを止めない。爪の先が石に触れる所を出すのに使う） */
function onStone(f: Frame, s: Sample, z: number): V3 {
  const k = stoneScaleAt(f.h, z);
  return [f.center.x + (s.p.x - f.center.x) * k, f.center.y + (s.p.y - f.center.y) * k, z];
}

function ringAt(f: Frame, z: number, d: number): V3[] {
  return f.pts.map((p, i) => at(f, { p, n: f.normals[i] }, z, d));
}

/** 縁の向き（t が増える向き、上から見て反時計回り）。外向きの法線を 90° 回したもの */
function along(s: Sample): V3 {
  return [-s.n.y, s.n.x, 0];
}

/**
 * 爪の先の曲がり。縁の上（g）から真上へ出て、内へ曲がり、石の上側の面に沿って少し登って先の中心 e へ届く。
 * e は、石の上側の面から、先の断面の半径（halfThickness）だけ外に離れた所（爪の内側が石に触れる）。
 * 先の丸いふた（長さ capLength）の端が、ちょうど先の高さ tz に届くよう、e をふたの長さの分だけ下げてある。
 * 返すのは曲線の上の点（g は含めない）
 */
function clawBend(f: Frame, s: Sample, g: V3, tz: number, halfThickness: number, capLength: number): V3[] {
  const eps = 0.02;
  // 石の上側の面を、上へ登る向き（内向きに倒れている）と、面に直角に外を向く向き（外と上の間）
  const up = normalize(sub(onStone(f, s, tz + eps), onStone(f, s, tz - eps)));
  const nh: V3 = [s.n.x, s.n.y, 0];
  const out = normalize(sub(nh, scale(up, dot(nh, up))));
  const c = onStone(f, s, tz - up[2] * capLength);
  const e = add(c, scale(out, halfThickness));
  const span = len(sub(e, g));
  // 手前の引っぱり：g から真上へ。奥の引っぱり：e から石の面に沿って下へ
  const b1 = add(g, [0, 0, BEND.rise * span]);
  const b2 = sub(e, scale(up, BEND.lean * span));
  const pts: V3[] = [];
  const steps = 10;
  for (let q = 1; q <= steps; q++) {
    const u = q / steps;
    const v = 1 - u;
    pts.push(add(add(scale(g, v * v * v), scale(b1, 3 * v * v * u)), add(scale(b2, 3 * v * u * u), scale(e, u * u * u))));
  }
  return pts;
}

/** 曲線の各点から終わりまでの長さ */
function lengthsToEnd(path: readonly V3[]): number[] {
  const out = new Array<number>(path.length).fill(0);
  for (let j = path.length - 2; j >= 0; j--) out[j] = out[j + 1] + len(sub(path[j + 1], path[j]));
  return out;
}

function smoothstep(x: number): number {
  const u = Math.min(1, Math.max(0, x));
  return u * u * (3 - 2 * u);
}

/**
 * V 字の爪の、角を包む壁。高さごとに「太い V の字」の輪を作り、下から上へ積む。
 * 内側は石の面にほぼ沿い（縁の上では石の上側に乗る）、外側は角のまわりで丸く回る。両端は半円、上下の端も丸い。
 */
function vWall(f: Frame, tA: number, tB: number, zb: number, zt: number, half: number, dc: number, out: number[]): void {
  // 縁に沿った点の取り方：外側の線の長さで等しく分ける（角のまわりにも点が行きわたる）
  const fine = 600;
  const probe: { t: number; q: V3 }[] = [];
  for (let i = 0; i <= fine; i++) {
    const t = tA + ((tB - tA) * i) / fine;
    probe.push({ t, q: at(f, sampleAt(f, t), 0, dc + half) });
  }
  const acc = [0];
  for (let i = 1; i < probe.length; i++) acc.push(acc[i - 1] + len(sub(probe[i].q, probe[i - 1].q)));
  const total = acc[acc.length - 1];
  const ts: number[] = [];
  let k = 0;
  for (let j = 0; j < V_WALL.along; j++) {
    const target = (total * j) / (V_WALL.along - 1);
    while (k + 1 < acc.length - 1 && acc[k + 1] < target) k++;
    const w = acc[k + 1] > acc[k] ? (target - acc[k]) / (acc[k + 1] - acc[k]) : 0;
    ts.push(probe[k].t + (probe[k + 1].t - probe[k].t) * Math.min(1, Math.max(0, w)));
  }
  const samples = ts.map((t) => sampleAt(f, t));
  const sA = samples[0];
  const sB = samples[samples.length - 1];

  // 高さと、その高さの板の厚みの割合（1 ＝ そのままの厚み）。上下の端は丸く（厚み 0 まで）
  const rb = V_WALL.round * half;
  const levels: { z: number; w: number }[] = [];
  for (let q = 0; q <= V_WALL.steps; q++) {
    const beta = (q / V_WALL.steps) * (Math.PI / 2);
    levels.push({ z: zb + rb * (1 - squircle(Math.cos(beta))), w: squircle(Math.sin(beta)) });
  }
  const k0 = stoneKnots(f.h);
  const midFrom = zb + rb;
  const midTo = zt - rb;
  const mids = [k0.girdleBottom, k0.girdleTop, k0.crownMid];
  const nStep = Math.max(1, Math.ceil((midTo - midFrom) / V_WALL.step));
  for (let q = 1; q < nStep; q++) mids.push(midFrom + ((midTo - midFrom) * q) / nStep);
  for (const z of ascending(mids, midFrom + EPS, midTo - EPS)) levels.push({ z, w: 1 });
  for (let q = 0; q <= V_WALL.steps; q++) {
    const g = (q / V_WALL.steps) * (Math.PI / 2);
    levels.push({ z: midTo + rb * squircle(Math.sin(g)), w: squircle(Math.cos(g)) });
  }
  levels.sort((a, b) => a.z - b.z);

  // 板の内側は石の面から inner、外側は「石の形を外へ 2 × half ＋ inner だけ太らせた形」（縁の稜線のまわりは丸い弧）
  const inner = dc - half;
  const outerOf = (s: Sample, z: number) => roundOffset(f, s, z, inner + 2 * half);
  const loops = levels.map(({ z, w }) => {
    // 縁に沿った点ごとの、板の中心の線と厚みの半分
    const mid = samples.map((s) => {
      const o = outerOf(s, z);
      return { c: (inner + o) / 2, h: ((o - inner) / 2) * w };
    });
    const loop: V3[] = samples.map((s, j) => at(f, s, z, mid[j].c + mid[j].h));
    // 終わりの端（tB）：外 → 先 → 内。角の丸い四角に近い形（丸すぎると、溶けたように見える）
    const mB = mid[mid.length - 1];
    const cB = at(f, sB, z, mB.c);
    const nB: V3 = [sB.n.x, sB.n.y, 0];
    for (let q = 1; q < V_WALL.capSides; q++) {
      const th = (q / V_WALL.capSides) * Math.PI;
      loop.push(add(cB, add(scale(nB, mB.h * squircle(Math.cos(th))), scale(along(sB), mB.h * V_WALL.capLength * squircle(Math.sin(th))))));
    }
    for (let j = samples.length - 1; j >= 0; j--) loop.push(at(f, samples[j], z, mid[j].c - mid[j].h));
    // 始まりの端（tA）：内 → 手前 → 外
    const mA = mid[0];
    const cA = at(f, sA, z, mA.c);
    const nA: V3 = [sA.n.x, sA.n.y, 0];
    for (let q = 1; q < V_WALL.capSides; q++) {
      const th = Math.PI + (q / V_WALL.capSides) * Math.PI;
      loop.push(add(cA, add(scale(nA, mA.h * squircle(Math.cos(th))), scale(along(sA), mA.h * V_WALL.capLength * squircle(Math.sin(th))))));
    }
    return loop;
  });
  stackLoops(loops, out);
}

/** 丸と四角の間の形（超楕円）にするための、cos・sin の曲げ。V_WALL.square が 2 なら丸、大きいほど四角に近い */
function squircle(c: number): number {
  return Math.sign(c) * Math.abs(c) ** (2 / V_WALL.square);
}

/**
 * 縁の点 s を通る縦の断面で、石の外側の線を D だけ太らせた線（半径 D の円をその線に沿って転がした外側）が、
 * 高さ z で石の面から外へどれだけ離れているか（mm、水平に測る）。
 * 縁の稜線（いちばん外へ出る所）のまわりでは、太らせた線が丸い弧になるので、板の外側に角ができない。
 * 縁より下は、石の下側の面より立てた線を使う（板の下の方が、石から離れて縦に近くなる）。
 */
function roundOffset(f: Frame, s: Sample, z: number, D: number): number {
  const k0 = stoneKnots(f.h);
  // 石の外側の線の、外向きの水平の位置（縁の高さを 0 とする）
  const reach = (s.p.x - f.center.x) * s.n.x + (s.p.y - f.center.y) * s.n.y;
  const u = (zz: number) => -(1 - stoneScaleAt(f.h, zz)) * reach;
  const ub = u(k0.girdleBottom);
  const shaped = (zz: number) => (zz < k0.girdleBottom ? ub + V_WALL.upright * (u(zz) - ub) : u(zz));
  let best = -Infinity;
  const consider = (z0: number) => {
    const dz = z - z0;
    if (Math.abs(dz) > D) return;
    best = Math.max(best, shaped(z0) + Math.sqrt(D * D - dz * dz));
  };
  for (let q = 0; q <= ROUND_OFFSET_STEPS; q++) consider(z - D + (2 * D * q) / ROUND_OFFSET_STEPS);
  for (const z0 of [k0.girdleBottom, k0.girdleTop, k0.crownMid]) consider(z0);
  return best - u(z);
}

/** 下から順に、重ならない高さだけを残す */
function ascending(zs: number[], from: number, to: number): number[] {
  const out: number[] = [];
  for (const z of [...zs].sort((a, b) => a - b)) {
    if (z < from - EPS || z > to + EPS) continue;
    if (out.length === 0 || z > out[out.length - 1] + EPS) out.push(z);
  }
  return out;
}

/** 標準の爪の太さ：最低（職人の決まりか guides.ts の式）× 倍率 */
function stdProngFor(params: SettingParams): number {
  const size = stoneSizeMm(params.stone.longMm, params.stone.widthMm);
  return params.minProngMm !== undefined ? params.minProngMm * GUIDES.prong.standardFactor : standardProngMm(size);
}

export function buildSetting(params: SettingParams): SettingResult {
  const f = frameOf(params.stone);
  const h = f.h;
  const k = stoneKnots(h);
  const size = stoneSizeMm(params.stone.longMm, params.stone.widthMm);
  const dStd = stdProngFor(params);
  const shankT = params.shankThicknessMm ?? GUIDES.shank.thicknessMm;
  const wall = params.bezelWallMm ?? GUIDES.bezel.wallMm;
  const cl = GUIDES.bezel.clearanceMm;
  const height = params.height ?? "standard";
  const corners = findCorners(params.stone.outlineMm);
  const total = perimeter(f.pts);

  // 標準の 4 本爪・標準の太さ・標準の高さ・目安の先の高さのときの爪の長さ（留まり 1.0× の基準）
  const stdWire = GUIDES.gallery.wireRatio * dStd;
  const stdV = vertical(h, "prong", "standard", undefined, shankT, stdWire, wall);
  const standardLengthMm = defaultTipZ(h) - stdV.upperRingZ;

  const parts: Float32Array[] = [];
  let triCount = 0;
  const addPart = (a: Float32Array): TriangleRange => {
    parts.push(a);
    const r = { start: triCount, count: a.length / 9 };
    triCount += r.count;
    return r;
  };

  const prongs: ProngInfo[] = [];
  const rings: GalleryRing[] = [];
  let bezel: BezelInfo | null = null;
  let v: Vertical;
  let tipZ: number | null = null;
  let solidNormals: Float32Array | undefined;

  if (params.style === "prong") {
    const plans = planProngs(params, corners);
    const meanD = plans.reduce((s, p) => s + p.diameterMm, 0) / Math.max(1, plans.length);
    // 輪の太さは標準の爪の太さから決める（爪だけ太く・細くしても、石座の高さは変わらないように）
    const wire = stdWire;
    v = vertical(h, "prong", height, params.culetGapMm, shankT, wire, wall);
    const tz = params.tipRatio !== undefined ? h.culetZ + params.tipRatio * (h.tableZ - h.culetZ) : defaultTipZ(h);
    tipZ = tz;
    // 爪の中心の線が通る高さ：上の輪から縁の上まで（石の下側の面に沿う）と、上の輪より下（下の輪まで）
    const upper = ascending([v.upperRingZ, k.pavilionMid, k.girdleBottom, k.girdleTop], v.upperRingZ, k.girdleTop);
    // 下の輪より上の高さだけ（下の輪より下は、爪の下の端までまっすぐ下ろす）
    const lower = (from: number, below: number) =>
      ascending([v.lowerRingZ, h.culetZ, k.pavilionMid], Math.max(from, v.lowerRingZ), below).filter((z) => z < below - EPS);

    for (const plan of plans) {
      const r = plan.diameterMm / 2;
      const d = cl + r;
      const tipAt = sampleAt(f, plan.t);
      const spreadT = (GUIDES.prong.vLegSpreadRatio * plan.diameterMm) / total;
      const legTs = plan.isV ? [-1, 1].map((sgn) => wrap(plan.t + sgn * spreadT)) : [plan.t];
      const pieces: number[][] = [];
      const legPoints: Point[] = [];
      const side = (s: Sample): V3 => along(s);
      // 爪の下の端：石座の下の端（下の輪の下の面）で切りそろえる。丸いふたの下の端が baseZ に来るように。
      // 爪は腕へささらない。下の輪と一緒に、腕の上の溝に当たる
      const footZ = (rr: number) => v.baseZ + FOOT_CAP * rr;

      if (!plan.isV) {
        // ふつうの爪：石座の下の端 → 下の輪 → 上の輪 → 石の下側に沿って縁 → 縁の上で内へ曲がり、先が石の上側に乗る
        // 縁の高さでは、座を彫った分だけ爪が石の縁に食いこむ（爪の内側の座に縁が入る）
        const dSeat = cl + plan.diameterMm * (0.5 - GUIDES.prong.seatCutRatio);
        const ctrl: V3[] = [
          at(f, tipAt, footZ(r), d),
          ...lower(footZ(r) + EPS, v.upperRingZ).map((z) => at(f, tipAt, z, d)),
          ...upper.map((z) => at(f, tipAt, z, z >= k.girdleBottom - EPS ? dSeat : d)),
        ];
        // 先の丸いふたの長さ ＝ 先の断面の半径の平均 × TIP.cap（sweepTube と同じ決め方）
        const capLength = (TIP.cap * r * (TIP.normal + TIP.side)) / 2;
        ctrl.push(...clawBend(f, tipAt, ctrl[ctrl.length - 1], tz, TIP.normal * r, capLength));
        const path = smoothPath(ctrl, PATH_STEP);
        const rest = lengthsToEnd(path);
        const tris: number[] = [];
        sweepTube(
          path,
          {
            sides: PRONG_SIDES,
            side: side(tipAt),
            // 先へ向かって、石に直角な向きに少し薄く、横に少し細く（強く薄くすると、先と曲がりの間がくぼんで見える）
            radius: (j) => {
              const w = smoothstep(1 - rest[j] / (TIP.taper * r));
              return [r * (1 - w * (1 - TIP.normal)), r * (1 - w * (1 - TIP.side))];
            },
            startCap: FOOT_CAP,
            endCap: TIP.cap,
            capSteps: CAP_STEPS,
          },
          tris,
        );
        pieces.push(tris);
        legPoints.push({ x: at(f, tipAt, 0, d)[0], y: at(f, tipAt, 0, d)[1] });
      } else {
        // V 字の爪：角を包む壁 ＋ 角の両側の 2 本の足 ＋ 足が合わさった下の軸
        // 板：厚みの半分 hw、中心の線は石の面から cl/2 ＋ hw（内側が石の面に沿う）
        const hw = (V_WALL.thick * plan.diameterMm) / 2;
        const dcW = cl / 2 + hw;
        const rb = V_WALL.round * hw;
        const zb = k.girdleBottom - V_WALL.below * plan.diameterMm;
        const zt = tz + V_WALL.over * rb;
        const wallTris: number[] = [];
        vWall(f, plan.t - spreadT, plan.t + spreadT, zb, zt, hw, dcW, wallTris);
        pieces.push(wallTris);
        // 軸：石座の下の端から、下の輪の所まで（角の真下）。ふつうの爪と同じく、腕へはささらない
        const rs = r * V_STEM.thicken;
        const zm = v.lowerRingZ + (v.upperRingZ - v.lowerRingZ) * V_STEM.at;
        const merge = at(f, tipAt, zm, d);
        const stemCtrl: V3[] = [at(f, tipAt, footZ(rs), d), ...lower(footZ(rs) + EPS, zm).map((z) => at(f, tipAt, z, d)), merge];
        const stem: number[] = [];
        sweepTube(smoothPath(stemCtrl, PATH_STEP), { sides: PRONG_SIDES, side: side(tipAt), radius: () => [rs, rs], startCap: FOOT_CAP, endCap: 1, capSteps: CAP_STEPS }, stem);
        pieces.push(stem);
        // 足が板へ入る高さ（板の下の丸みの少し上）。足はそこへ向かって板の厚みまで細くなり、中心も板の中心の線へ寄る
        const legTop = Math.min(k.girdleBottom, zb + rb * (1 + V_LEG.into));
        const legR = V_LEG.inside * hw;
        const taper = (z: number) => smoothstep((z - v.upperRingZ) / (legTop - v.upperRingZ));
        for (const lt of legTs) {
          const s = sampleAt(f, lt);
          // 足：軸の上の端から分かれ、上の輪を通って石の下側に沿い、板の中で終わる
          const zs = ascending([...upper.filter((z) => z < legTop - EPS), (v.upperRingZ + legTop) / 2, legTop], v.upperRingZ, legTop);
          // 板の中では、板の本当の中心の線（下ほど厚い）へ寄せる
          const plateMid = (z: number) => (cl / 2 + roundOffset(f, s, z, cl / 2 + 2 * hw)) / 2;
          const legPath = smoothPath([merge, ...zs.map((z) => at(f, s, z, d + (plateMid(z) - d) * taper(z)))], PATH_STEP);
          const leg: number[] = [];
          sweepTube(
            legPath,
            {
              sides: PRONG_SIDES,
              side: side(s),
              radius: (j) => {
                const rr = r + (legR - r) * taper(legPath[j][2]);
                return [rr, rr];
              },
              // 軸の中で始まる（丸い端は短く、石座の下の端より下へ出ない）
              startCap: FOOT_CAP,
              endCap: V_LEG.endCap,
              capSteps: CAP_STEPS,
            },
            leg,
          );
          pieces.push(leg);
          const g = at(f, s, 0, d);
          legPoints.push({ x: g[0], y: g[1] });
        }
      }
      const c = at(f, tipAt, 0, d);
      prongs.push({
        t: plan.t,
        index: outlineIndexAtT(params.stone.outlineMm, plan.t),
        isV: plan.isV,
        legs: plan.isV ? GUIDES.hold.vProngLegs : 1,
        legTs,
        point: { x: c[0], y: c[1] },
        legPoints,
        diameterMm: plan.diameterMm,
        lengthMm: tz - v.upperRingZ,
        tipZ: tz,
        triangles: addPart(closedParts(pieces)),
      });
    }

    // 石座の輪：爪の中心を通る、丸い針金の輪を 2 段（下側の途中と、いちばん下。下の輪は腕の上の溝に入る）
    for (const z of [v.upperRingZ, v.lowerRingZ]) {
      const a = wire / 2;
      const profile: V3[][] = [];
      for (let q = 0; q < RING_SIDES; q++) {
        const th = (q / RING_SIDES) * Math.PI * 2;
        const ring = ringAt(f, z, cl + meanD / 2 + a * Math.cos(th));
        profile.push(ring.map((p) => [p[0], p[1], z + a * Math.sin(th)]));
      }
      const tris: number[] = [];
      ringsToTube(profile, tris);
      rings.push({ z, wireMm: wire, triangles: addPart(closedPart(tris)) });
    }
    if (params.solid) {
      const solid = solidHead(f, plans, v, tz, wire, meanD, total, params.solidQuality ?? "final");
      solidNormals = solid.normals;
      parts.length = 0;
      parts.push(solid.positions);
      triCount = solid.positions.length / 9;
      prongs.forEach((pr, i) => (pr.triangles = solid.ranges.get(i) ?? { start: 0, count: 0 }));
      rings.forEach((rg, i) => (rg.triangles = solid.ranges.get(RING_OWNER + i) ?? { start: 0, count: 0 }));
    }
  } else {
    v = vertical(h, "bezel", height, params.culetGapMm, shankT, stdWire, wall);
    const b = GUIDES.bezel;
    const coverMm = Math.min(b.crownCoverRatio * h.crownMm, b.crownCoverMaxMm);
    const topZ = k.girdleTop + coverMm;
    // 壁の断面：外の下 → 外の上 → 上の端の丸み（半円、いちばん上が topZ）→ 内の上 → 内の下。
    // 内側は石の面から clearance だけ外。縁より上では石の上側に沿って内へ倒れる（石を押さえる）
    const lip = wall / 2;
    const lipZ = topZ - lip;
    const steps = Math.max(1, Math.ceil((lipZ - v.baseZ) / WALL_STEP));
    const even = Array.from({ length: steps - 1 }, (_, q) => v.baseZ + ((lipZ - v.baseZ) * (q + 1)) / steps);
    const zs = ascending([v.baseZ, h.culetZ, k.pavilionMid, k.girdleBottom, k.girdleTop, ...even, lipZ], v.baseZ, lipZ);
    const top: V3[][] = [];
    for (let q = 1; q < LIP_STEPS; q++) {
      const th = (q / LIP_STEPS) * Math.PI;
      top.push(ringAt(f, lipZ + lip * Math.sin(th), cl + lip + lip * Math.cos(th)));
    }
    const profile = [...zs.map((z) => ringAt(f, z, cl + wall)), ...top, ...[...zs].reverse().map((z) => ringAt(f, z, cl))];
    const tris: number[] = [];
    ringsToTube(profile, tris);
    const flat = (d: number) => ringAt(f, 0, d).map((p) => ({ x: p[0], y: p[1] }));
    bezel = {
      wallMm: wall,
      clearanceMm: cl,
      coverMm,
      topZ,
      bottomZ: v.baseZ,
      innerOutline: flat(cl),
      outerOutline: flat(cl + wall),
      triangles: addPart(closedPart(tris)),
    };
  }

  const positions = concat(parts);
  let topZ = -Infinity;
  for (let i = 2; i < positions.length; i += 3) topZ = Math.max(topZ, positions[i]);
  return {
    style: params.style,
    positions,
    normals: solidNormals,
    prongs,
    rings,
    bezel,
    heights: {
      ...h,
      fingerZ: v.fingerZ,
      shankTopZ: v.shankTopZ,
      baseZ: v.baseZ,
      culetGapMm: v.culetGapMm,
      tipZ,
      upperRingZ: params.style === "prong" ? v.upperRingZ : null,
      lowerRingZ: params.style === "prong" ? v.lowerRingZ : null,
      topZ,
      heightAboveFingerMm: topZ - v.fingerZ,
    },
    corners,
    minProngMm: params.minProngMm ?? minProngMm(size),
    standardProngMm: dStd,
    standardLengthMm,
  };
}

// ---- 一体の石座（爪留め） ----
/** 爪の足を起こす角度（水平から、度）。70〜80°（docs/RESEARCH-setting.md の T1） */
const STAND_DEG = 76;
/** 一体の形の格子の間隔と、つなぎ目の丸み（mm） */
const SOLID = { cell: 0.075, blend: 0.16, step: 0.4 };
/** 動かしている間の粗い一体の形：格子を粗く、ならす回数を減らす（形の線・太さは同じ。面の細かさだけ違う） */
const SOLID_PREVIEW = { cell: 0.13, smooth: 3 };
const RING_OWNER = 100;
/**
 * 足の曲がり方（1 でまっすぐ。大きいほど縁の下で縦に立ち、下の輪の近くで寄る）。
 * はじめ 2.2 にしていたが、太い爪（例：1.66 mm）では、縁のまわりの固まりと、下の輪の近くで横に寝た腕に見え、
 * 「どこでつながっているの？」と作者に聞かれた（2026-11-03）。1（まっすぐ）にして、先から石に沿って下の輪まで 1 本の柱にした
 */
const LEG_CURVE = 1;
/** 一体の石座の上の輪の太さ（輪の線の太さに対する倍率。石の下側の途中の、細い支え） */
const SOLID_UPPER_RING = 0.72;

/** 座を彫る距離を、石からこの距離（mm）より近い所だけ正確に測る。遠い所は下の格子から、表面に近い側へ控えめに見積もる */
const SEAT_EXACT_MM = 0.4;
/** 縁の形（縮める前）の距離を覚えておく格子の間隔と、縁の外へのはみ出し（mm） */
const SEAT_GRID = { step: 0.08, margin: 1 };

/**
 * 石の表面までの距離（おおよそ、内側は負）。座を彫るのに使う。高さごとの縁の形は覚えておく。
 * exactWithin を渡すと、石からその距離より遠い所は、縁の形の距離の格子から「本当の値より 0 に近い」値を返す（速い）。
 * 遠い所の値は面の位置に効かない（座の面は石から cl の所）ので、形は変わらない
 */
function stoneDistanceFn(f: Frame, exactWithin?: number): (x: number, y: number, z: number) => number {
  const h = f.h;
  const pts = f.pts;
  const n = pts.length;
  const cx = f.center.x;
  const cy = f.center.y;
  let lastZ = NaN;
  let scale = 1;
  const poly = new Float64Array(n * 2);
  /** 多角形（xy の組の並び）までの、符号つきの距離 */
  const polyDist = (xy: Float64Array, x: number, y: number) => {
    let inside = false;
    let best = Infinity;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = xy[j * 2];
      const ay = xy[j * 2 + 1];
      const bx = xy[i * 2];
      const by = xy[i * 2 + 1];
      if (by > y !== ay > y && x < ((ax - bx) * (y - by)) / (ay - by || 1e-12) + bx) inside = !inside;
      const dx = bx - ax;
      const dy = by - ay;
      const L2 = dx * dx + dy * dy || 1e-12;
      let t = ((x - ax) * dx + (y - ay) * dy) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + dx * t - x;
      const ey = ay + dy * t - y;
      const d2 = ex * ex + ey * ey;
      if (d2 < best) best = d2;
    }
    const d = Math.sqrt(best);
    return inside ? -d : d;
  };
  const setZ = (z: number) => {
    if (z === lastZ) return;
    lastZ = z;
    scale = stoneScaleAt(h, Math.min(Math.max(z, h.culetZ), h.tableZ));
    for (let i = 0; i < n; i++) {
      poly[i * 2] = cx + (pts[i].x - cx) * scale;
      poly[i * 2 + 1] = cy + (pts[i].y - cy) * scale;
    }
  };
  const exact = (x: number, y: number, z: number) => {
    setZ(z);
    return Math.max(polyDist(poly, x, y), z - h.tableZ, h.culetZ - z);
  };
  if (exactWithin === undefined) return exact;

  // 縁の形（縮める前）の距離の格子。高さ z の縁は、縮める前の縁を中心から scale 倍したもの → 距離も scale 倍
  const base = new Float64Array(n * 2);
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  pts.forEach((p, i) => {
    base[i * 2] = p.x;
    base[i * 2 + 1] = p.y;
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  });
  const G = SEAT_GRID.step;
  const gx0 = x0 - SEAT_GRID.margin;
  const gy0 = y0 - SEAT_GRID.margin;
  const gw = Math.ceil((x1 - x0 + 2 * SEAT_GRID.margin) / G) + 1;
  const gh = Math.ceil((y1 - y0 + 2 * SEAT_GRID.margin) / G) + 1;
  let grid: Float32Array | null = null;
  const gridAt = (u: number, v: number): number => {
    if (!grid) {
      grid = new Float32Array(gw * gh);
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) grid[j * gw + i] = polyDist(base, gx0 + i * G, gy0 + j * G);
    }
    const fu = (u - gx0) / G;
    const fv = (v - gy0) / G;
    const i = Math.floor(fu);
    const j = Math.floor(fv);
    if (i < 0 || j < 0 || i >= gw - 1 || j >= gh - 1) return NaN;
    const a = fu - i;
    const b = fv - j;
    const q = j * gw + i;
    return (grid[q] * (1 - a) + grid[q + 1] * a) * (1 - b) + (grid[q + gw] * (1 - a) + grid[q + gw + 1] * a) * b;
  };
  return (x, y, z) => {
    setZ(z);
    const cap = Math.max(z - h.tableZ, h.culetZ - z);
    // 上面より上・一番下より下で遠い所：本当の値は cap 以上
    if (cap > exactWithin) return cap;
    if (scale > 0.05) {
      const u = cx + (x - cx) / scale;
      const v = cy + (y - cy) / scale;
      // 縁を囲む四角の外なら、その四角までの距離が下限
      const ox = Math.max(x0 - u, u - x1, 0);
      const oy = Math.max(y0 - v, v - y1, 0);
      const box = Math.hypot(ox, oy) * scale;
      if (box > exactWithin) return Math.max(box, cap);
      const g = gridAt(u, v);
      // 格子の補間の誤差は 1 目より小さい（距離は動いた分しか変わらない）。その分だけ 0 に寄せる
      if (g === g && Math.abs(g) * scale - G * scale > exactWithin) return Math.max(Math.sign(g) * (Math.abs(g) - G) * scale, cap);
    }
    return Math.max(polyDist(poly, x, y), cap);
  };
}

function solidHead(f: Frame, plans: ProngPlan[], v: Vertical, tz: number, wire: number, meanD: number, total: number, quality: SolidQuality) {
  const k = stoneKnots(f.h);
  const cl = GUIDES.bezel.clearanceMm;
  const seat = GUIDES.prong.seatCutRatio;
  const tubes: Tube[] = [];
  const boxes: Box[] = [];
  const fields: Field[] = [];
  const stoneDistance = stoneDistanceFn(f);
  const atGirdle = stoneDistanceFn(f);
  // 座を彫る距離（石から遠い所は速く見積もる。面の位置は変わらない）
  const seatDistance = stoneDistanceFn(f, SEAT_EXACT_MM);
  const girdleDistance = (x: number, y: number) => atGirdle(x, y, k.girdleBottom);
  // 石座は爪と輪を 1 つにまとめた部品（籠の形）。足は縁の下から下の輪へ寄り合い、下の輪の所で終わる。
  // 腕へはささらない：石座の下の端（下の輪の下の面 ＝ v.baseZ）が、腕の上の溝に当たる
  const footZAll = v.lowerRingZ;
  // 足の形：下の輪から、外へなめらかに開いて、縁の下でまっすぐ立つ曲線（チューリップの形）
  const legLine = (s: Sample, dTop: number, r: number, z: number): V3 => {
    const g = at(f, s, k.girdleBottom, dTop);
    const foot = at(f, s, footZAll, cl + r);
    const t = Math.min(1, (k.girdleBottom - z) / (k.girdleBottom - footZAll));
    // 水平の位置は、縁から下へ行くほど、はじめはゆっくり、足もと近くで急に寄る（縁の下では縦に近い）
    const w = Math.pow(t, LEG_CURVE);
    const p: V3 = [g[0] + (foot[0] - g[0]) * w, g[1] + (foot[1] - g[1]) * w, z];
    const safe = at(f, s, z, cl + r);
    const rp = Math.hypot(p[0] - f.center.x, p[1] - f.center.y);
    const rs = Math.hypot(safe[0] - f.center.x, safe[1] - f.center.y);
    return z > f.h.culetZ && rp < rs ? safe : p;
  };
  // 足の下の端：丸い端の下が、石座の下の端（v.baseZ ＝ 下の輪の下の面）にそろう所まで。爪が下の輪より下へ突き出ない
  const leg = (s: Sample, dTop: number, r: number): V3[] => {
    const zEnd = Math.max(footZAll, v.baseZ + r);
    const zs = Array.from({ length: 11 }, (_, q) => k.girdleBottom + ((zEnd - k.girdleBottom) * q) / 10);
    return zs.map((z) => legLine(s, dTop, r, z));
  };
  plans.forEach((plan, i) => {
    const r = plan.diameterMm / 2;
    const s0 = sampleAt(f, plan.t);
    if (!plan.isV) {
      // 同じ太さの一本の曲線：足もと → 外へ開いて縁の外に沿って立つ → 縁の上で少し内へ曲がり、先は石の上側に軽く乗る。
      // 縁では石に軽く触れるだけにして（座は見えない内側だけ）、外から見てくびれないようにする
      const dTouch = cl + r * 0.85;
      const down = leg(s0, dTouch, r).reverse();
      const g1 = at(f, s0, k.girdleTop, dTouch);
      const up = at(f, s0, (k.girdleTop + tz) / 2, cl + r * 0.95);
      const tipP = at(f, s0, tz - r * 0.6, cl + r * 0.75);
      const path = smoothPath([...down, g1, up, tipP], SOLID.step / 2);
      tubes.push({ pts: path, radii: path.map(() => r), owner: i });
    } else {
      // V 字の爪：石の面から少し離れた所を、角を中心に左右へ包む 1 枚の板。
      // 縁より上は石の上側に沿って内へ倒れて石を押さえ、縁より下は爪と同じ角度でまっすぐ下りる（えぐれない）。
      // 板の下からは、角の両側の 2 本の足が起きて下りる
      const hw = (V_WALL.thick * plan.diameterMm) / 2;
      const dS = cl + plan.diameterMm * (0.5 - seat);
      const zb = k.girdleBottom - V_WALL.below * plan.diameterMm;
      // 板は角から左右へ、爪の太さの 0.65 倍ずつ（仮の目安。本物の V 字の爪は辺に沿って短い）
      const reachL = 0.65 * plan.diameterMm;
      const round = hw * 0.6;
      const cot = 1 / Math.tan((STAND_DEG * Math.PI) / 180);
      const cg = at(f, s0, k.girdleBottom, 0);
      const plate = (x: number, y: number, z: number) => {
        // 石の面（縁より下は、起こした円すいの面）からの距離
        const ds = z >= k.girdleBottom ? stoneDistance(x, y, z) : girdleDistance(x, y) + (k.girdleBottom - z) * cot;
        const shell = Math.abs(ds - (cl + hw)) - hw;
        // 角からの広がり：角の点（高さに合わせて石と同じに縮む）からの水平の距離
        const sc = settingScaleAt(f.h, Math.max(z, k.girdleBottom));
        const kx = f.center.x + (cg[0] - f.center.x) * sc;
        const ky = f.center.y + (cg[1] - f.center.y) * sc;
        const side = Math.hypot(x - kx, y - ky) - reachL;
        const vert = Math.max(zb - z, z - tz);
        return smax(smax(shell, side, round), vert, round);
      };
      const R = reachL + 2 * hw + 0.3;
      fields.push({ dist: plate, min: [cg[0] - R, cg[1] - R, zb - 0.3], max: [cg[0] + R, cg[1] + R, tz + 0.3], owner: i });
      for (const sgn of [-1, 1]) {
        const s = sampleAt(f, wrap(plan.t + (sgn * reachL * 0.6) / total));
        const down = leg(s, dS, r).reverse();
        const path = smoothPath([...down.slice(0, -1), at(f, s, zb + hw, dS)], SOLID.step);
        tubes.push({ pts: path, radii: path.map(() => r), owner: i });
      }
    }
  });
  // 石座の輪 2 段（線を管にした形と同じ高さ）：上は石の下側の途中の細い支え、下は足が集まる輪（石座の底。腕の上の溝に入る）。
  // どちらも足と同じ曲線の上にあり、爪と 1 つにつながる
  const dRing = cl + meanD * (0.5 - seat);
  const ringLoop = (z: number, rr: number, owner: number) => {
    // 輪の中心は、爪の足の中心と同じ線の上（太さ meanD の爪の位置）。管の太さだけ rr
    const pts = f.pts.filter((_, i) => i % 2 === 0).map((p, i) => legLine({ p, n: f.normals[i * 2] }, dRing, meanD / 2, z));
    pts.push(pts[0]);
    tubes.push({ pts, radii: pts.map(() => rr), owner });
  };
  ringLoop(v.upperRingZ, (wire / 2) * SOLID_UPPER_RING, RING_OWNER);
  ringLoop(v.lowerRingZ, wire / 2, RING_OWNER + 1);
  // 石から遠い点は、石までの距離を細かく測らない（石を囲む円の外なら、その円までの距離で足りる）
  let rMax = 0;
  for (const p of f.pts) rMax = Math.max(rMax, Math.hypot(p.x - f.center.x, p.y - f.center.y));
  const subtract = (x: number, y: number, z: number) => {
    const far = Math.max(Math.hypot(x - f.center.x, y - f.center.y) - rMax, z - f.h.tableZ, f.h.culetZ - z);
    return (far > 0.3 ? far : seatDistance(x, y, z)) - cl;
  };
  const fine = quality === "final";
  return fine
    ? buildSolid(tubes, { cell: SOLID.cell, blend: SOLID.blend, subtract, boxes, fields })
    : buildSolid(tubes, { cell: SOLID_PREVIEW.cell, blend: SOLID.blend, smooth: SOLID_PREVIEW.smooth, normalsFrom: "mesh", subtract, boxes, fields });
}

function wrap(t: number): number {
  const u = t - Math.floor(t);
  return u >= 1 ? 0 : u;
}
