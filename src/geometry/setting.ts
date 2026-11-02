// 石座（覆輪・爪・V 字の爪・石座の輪）を、石の縁の形に沿わせて作る。画面に依存しない純粋な関数。
// 座標は stone.ts と同じ：mm、x が長辺、y が幅、z が上（テーブル側）、z = 0 が縁（ガードル）の真ん中。
// 職人の目安の値はすべて src/rules/guides.ts から読む。ここにある定数は「形を作るための決まり」だけ。
import { GUIDES, minProngMm, standardProngMm, stoneSizeMm, type HeightOption } from "../rules/guides";
import { findCorners, type Corner } from "./corners";
import { closedPart, concat, ringsToTube, rodAlongPath, type V3 } from "./mesh";
import { outwardNormals } from "./offset";
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
}

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
  /** 石座の下の端（腕の中へ入る所）の z */
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
const PRONG_SIDES = 8;
const RING_SIDES = 8;
/** 爪と覆輪の下の端を、腕の厚みのこの割合だけ腕の中へ入れる（つながって見えるように） */
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
  const d = params.prongDiameterMm ?? standardProngMm(stoneSizeMm(s.longMm, s.widthMm));
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
  const isV = params.vAtCorners ?? true;
  const rest = spread(fixed, count - fixed.length, longEndT(s.outlineMm));
  return [
    ...fixed.map((t) => ({ t, isV, diameterMm: d })),
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
  const lowerRingZ = Math.min(shankTopZ + wire / 2, k.girdleBottom - 2 * wire);
  const upperRingZ = (k.girdleBottom + lowerRingZ) / 2;
  const baseZ = Math.min(shankTopZ - shankT * EMBED_RATIO, lowerRingZ - wire);
  return { culetGapMm: gap, fingerZ, shankTopZ, baseZ, lowerRingZ, upperRingZ };
}

/** 縁を細かく取り直した点・外向きの法線・石と同じ中心 */
interface Frame {
  pts: Point[];
  normals: Point[];
  center: Point;
  h: StoneHeights;
}

interface Sample {
  p: Point;
  n: Point;
}

function frameOf(stone: StoneParams): Frame {
  const pts = resample(toCounterClockwise(stone.outlineMm), OUTLINE_POINTS);
  return { pts, normals: outwardNormals(pts), center: girdleCenter(stone.outlineMm), h: stoneHeights(stone) };
}

/** 縁の上の位置 t の点と外向きの法線（隣の点の間をなめらかにつなぐ） */
function sampleAt(f: Frame, t: number): Sample {
  const n = f.pts.length;
  const u = wrap(t) * n;
  const i0 = Math.floor(u) % n;
  const i1 = (i0 + 1) % n;
  const w = u - Math.floor(u);
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

/** 高さ z の石の外側（縁の形を縮めたもの）から、外へ d だけ離れた点 */
function at(f: Frame, s: Sample, z: number, d: number): V3 {
  const k = stoneScaleAt(f.h, z);
  return [f.center.x + (s.p.x - f.center.x) * k + s.n.x * d, f.center.y + (s.p.y - f.center.y) * k + s.n.y * d, z];
}

function ringAt(f: Frame, z: number, d: number): V3[] {
  return f.pts.map((p, i) => at(f, { p, n: f.normals[i] }, z, d));
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

export function buildSetting(params: SettingParams): SettingResult {
  const f = frameOf(params.stone);
  const h = f.h;
  const k = stoneKnots(h);
  const size = stoneSizeMm(params.stone.longMm, params.stone.widthMm);
  const dStd = standardProngMm(size);
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

  if (params.style === "prong") {
    const plans = planProngs(params, corners);
    const meanD = plans.reduce((s, p) => s + p.diameterMm, 0) / Math.max(1, plans.length);
    // 輪の太さは標準の爪の太さから決める（爪だけ太く・細くしても、石座の高さは変わらないように）
    const wire = stdWire;
    v = vertical(h, "prong", height, params.culetGapMm, shankT, wire, wall);
    const tz = params.tipRatio !== undefined ? h.culetZ + params.tipRatio * (h.tableZ - h.culetZ) : defaultTipZ(h);
    tipZ = tz;
    const knots = ascending([v.baseZ, v.lowerRingZ, v.upperRingZ, k.pavilionMid, h.culetZ, k.girdleBottom, k.girdleTop], v.baseZ, k.girdleTop);

    for (const plan of plans) {
      const r = plan.diameterMm / 2;
      const tipAt = sampleAt(f, plan.t);
      const legTs = plan.isV ? [-1, 1].map((sgn) => wrap(plan.t + (sgn * GUIDES.prong.vLegSpreadRatio * plan.diameterMm) / total)) : [plan.t];
      const tris: number[] = [];
      const legPoints: Point[] = [];
      for (const lt of legTs) {
        const s = sampleAt(f, lt);
        const path = knots.map((z) => at(f, s, z, cl + r));
        // 先は石の上側に乗る（太さの半分だけ外）。V 字は 2 本の足が角の上で合わさる
        path.push(at(f, tipAt, tz, r));
        rodAlongPath(path, r, [s.n.x, s.n.y, 0], PRONG_SIDES, tris);
        const g = at(f, s, 0, cl + r);
        legPoints.push({ x: g[0], y: g[1] });
      }
      const c = at(f, tipAt, 0, cl + r);
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
        triangles: addPart(closedPart(tris)),
      });
    }

    // 石座の輪：爪の中心を通る輪を 2 段（下側の途中と、腕のすぐ上）
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
  } else {
    v = vertical(h, "bezel", height, params.culetGapMm, shankT, stdWire, wall);
    const b = GUIDES.bezel;
    const coverMm = Math.min(b.crownCoverRatio * h.crownMm, b.crownCoverMaxMm);
    const topZ = k.girdleTop + coverMm;
    // 壁の断面：外の下 → 外の上（石の上側に沿って少し内へ倒れる）→ 内の上 → 内の下。内側は石の面から clearance だけ外
    const zs = ascending([v.baseZ, h.culetZ, k.pavilionMid, k.girdleBottom, k.girdleTop, topZ], v.baseZ, topZ);
    const profile = [...zs.map((z) => ringAt(f, z, cl + wall)), ...[...zs].reverse().map((z) => ringAt(f, z, cl))];
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
    minProngMm: minProngMm(size),
    standardProngMm: dStd,
    standardLengthMm,
  };
}

function wrap(t: number): number {
  const u = t - Math.floor(t);
  return u >= 1 ? 0 : u;
}
