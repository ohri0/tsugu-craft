// テンション（挟む）の腕：開いた輪の両はしに、石の形（すき間を足した物）を彫る。画面に依存しない純粋な関数。
// 座標は指輪の座標（shank.ts と同じ）：mm、x が指の向き、z が上、腕は y–z の面。
// 職人（石川、2026-11-05）の決まり：片方の端は角のくぼみ、もう片方の端は辺の溝。数字は GUIDES.tension の 1 か所。
//
// 作り方：腕の端の面を「断面の点 (x, h) ごとに、腕に沿ってどこで終わるか」として決める。
// 腕の端は y 一定の平らな面（図面の開き）で、そこから石の形だけ奥へ彫る。石は下へ行っても上へ行っても細くなるので、
// 彫った面は奥へ入りこまない（下から覗けない形にならない）。だから、面は (x, h) の上の 1 つの値になり、閉じた形が必ず作れる。
// 面の格子は高さの行を溝の折れ目にそろえるので、まっすぐな溝の折れ線は、そのまま形の辺になる。
import { GUIDES, innerDiameterMm, type MetalId } from "../rules/guides";
import { findCorners } from "./corners";
import { pushTri, closedPart, type V3 } from "./mesh";
import { convexHull, toCounterClockwise, type Point } from "./polygon";
import { sectionOutline, weightG, type ShankParams, type ShankResult, type ShankSection } from "./shank";
import { girdleCenter, meshVolume, stoneHeights, stoneKnots, stoneScaleAt, type StoneParams } from "./stone";

export type TensionMode = "corner-edge" | "edge-edge";

export interface TensionEnd {
  kind: "pit" | "groove";
  /** ＋1 は +y の端、−1 は −y の端 */
  side: 1 | -1;
  /** 腕の端の平らな面の y（符号つき） */
  planeY: number;
  /** 石が腕の端の面より奥へ入る深さ（mm。職人の値） */
  depthMm: number;
  /** 彫った底までの深さ（mm）＝ 深さ ＋ 石のすき間 */
  floorMm: number;
  /** まっすぐな溝か（石の輪郭に沿って曲がる溝なら false。くぼみも false） */
  straight: boolean;
  /** 腕の真ん中（x ＝ 0）で、端の面での彫り口の上と下の z と、高さ */
  openTopZ: number;
  openBottomZ: number;
  openingMm: number;
  /** 腕の真ん中で、端の面での腕の上と下の z */
  wireTopZ: number;
  wireBottomZ: number;
  /** 彫り口の上と下に残る地金（mm。0 以下なら残らない） */
  lipTopMm: number;
  lipBottomMm: number;
  /** 石の縁の高さでの、腕の幅（石が溝に当たる長さの上限。mm） */
  contactWidthMm: number;
  /** 石の縁が、彫った底の所で腕の高さの中にあるか */
  girdleInWire: boolean;
  /** 端の面での彫り口の幅（x の向き。mm）と、その両わきに残る地金（片側 mm） */
  openWidthMm: number;
  sideWallMm: number;
}

export interface TensionInfo {
  mode: TensionMode;
  /** 図面の開き（両はしの平らな面の間。mm。プリロードは入れない） */
  gapMm: number;
  clearanceMm: number;
  /** 石の縁の真ん中の z（指輪の座標） */
  girdleZ: number;
  /** 指の丸みから、腕の両はしを持ち上げた量（mm） */
  liftMm: number;
  /** 石を上から見て回した角度と、ずらした量 */
  rotationZ: number;
  translateX: number;
  translateY: number;
  /** 腕の周りの向きの石の長さ（mm）＝ 開き ＋ 深さ 2 つ */
  spanMm: number;
  /** 角の数（内角が目安より鋭い物） */
  cornerCount: number;
  /** 腕の線の長さ（mm。太さの真ん中の線で、端の面から端の面まで。切り口を整える分はふくまない） */
  wireLengthMm: number;
  ends: [TensionEnd, TensionEnd];
}

export interface TensionOptions {
  /** 角のくぼみに入れる深さ（mm）。なければ GUIDES.tension.cornerPitMm */
  cornerPitMm?: number;
  /** 辺の溝に入れる深さ（mm）。なければ GUIDES.tension.edgeGrooveMm */
  edgeGrooveMm?: number;
  /** 石のすき間（mm）。なければ GUIDES.tension.clearanceMm */
  clearanceMm?: number;
  /** 石の先と指のすき間の最低（mm）。なければ GUIDES.height.minFingerGapMm */
  culetGapMm?: number;
  /** 腕の両はしを持ち上げるか。なければ GUIDES.tension.liftEnds */
  liftEnds?: boolean;
}

/** 指のまわりの分け方（形を作るための決まり） */
const AROUND = 128;
/** 端の面の、幅の向きの分け方（形を作るための決まり。φ4 mm で 0.04 mm ごと。くぼみは腕の幅の大部分を占める） */
const COLS = 100;
/** 高さの行の間の上限（mm）。これより広い行の間には足す。行どうしがこれより近ければまとめる */
const ROW = { maxStepMm: 0.05, minStepMm: 0.012 };
/** 石の輪郭の表の細かさ（mm） */
const TABLE_STEP_MM = 0.01;
/** すき間の角を丸く回る分け方（度） */
const ARC_STEP_DEG = 15;
/** 溝をまっすぐにしてよい、腕の幅の中の輪郭の反り（腕の幅に対する割合。形を作るための決まり） */
const STRAIGHT_SAG_RATIO = 0.06;
/** 彫りの奥より少し先まで、腕を丸い弧のまま保つ長さ（mm。形を作るための決まり） */
const PLATEAU_MARGIN_MM = 0.5;
/** 開きの最低（mm。これより狭いと形が作れないので、ここで止める。確かめが「作れない」と言う） */
const MIN_GAP_MM = 0.1;

/** 石の輪郭（上から見た形）の、x ごとの上と下の y の表 */
interface OutlineTable {
  xMin: number;
  yTop: Float32Array;
  yBot: Float32Array;
}

function polygonTable(poly: readonly Point[]): OutlineTable {
  const xs = poly.map((p) => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const n = Math.max(2, Math.ceil((xMax - xMin) / TABLE_STEP_MM) + 1);
  const yTop = new Float32Array(n).fill(-Infinity);
  const yBot = new Float32Array(n).fill(Infinity);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const k0 = Math.ceil((Math.min(a.x, b.x) - xMin) / TABLE_STEP_MM);
    const k1 = Math.floor((Math.max(a.x, b.x) - xMin) / TABLE_STEP_MM);
    for (let k = Math.max(0, k0); k <= Math.min(n - 1, k1); k++) {
      const x = xMin + k * TABLE_STEP_MM;
      const y = a.x === b.x ? Math.max(a.y, b.y) : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
      const y2 = a.x === b.x ? Math.min(a.y, b.y) : y;
      if (y > yTop[k]) yTop[k] = y;
      if (y2 < yBot[k]) yBot[k] = y2;
    }
    // 頂点そのものも表に入れる（細かい角の先を落とさない）
    const kv = Math.round((a.x - xMin) / TABLE_STEP_MM);
    if (kv >= 0 && kv < n) {
      if (a.y > yTop[kv]) yTop[kv] = a.y;
      if (a.y < yBot[kv]) yBot[kv] = a.y;
    }
  }
  return { xMin, yTop, yBot };
}

function lookup(t: OutlineTable, col: Float32Array, x: number): number | null {
  const u = (x - t.xMin) / TABLE_STEP_MM;
  if (u < -1e-6 || u > col.length - 1 + 1e-6) return null;
  const k = Math.min(col.length - 2, Math.max(0, Math.floor(u)));
  const f = Math.min(1, Math.max(0, u - k));
  const a = col[k];
  const b = col[k + 1];
  if (!Number.isFinite(a)) return Number.isFinite(b) ? b : null;
  if (!Number.isFinite(b)) return a;
  return a + (b - a) * f;
}

/** 凸の輪郭を外へ c だけ広げる（角は丸く回る） */
function offsetHull(hull: readonly Point[], c: number): Point[] {
  if (c <= 0) return [...hull];
  const out: Point[] = [];
  const n = hull.length;
  const step = (ARC_STEP_DEG * Math.PI) / 180;
  for (let i = 0; i < n; i++) {
    const p = hull[(i + n - 1) % n];
    const q = hull[i];
    const r = hull[(i + 1) % n];
    const a0 = Math.atan2(q.y - p.y, q.x - p.x) - Math.PI / 2;
    let a1 = Math.atan2(r.y - q.y, r.x - q.x) - Math.PI / 2;
    while (a1 < a0) a1 += Math.PI * 2;
    const m = Math.max(1, Math.ceil((a1 - a0) / step));
    for (let k = 0; k <= m; k++) {
      const a = a0 + ((a1 - a0) * k) / m;
      out.push({ x: q.x + c * Math.cos(a), y: q.y + c * Math.sin(a) });
    }
  }
  return out;
}

const rotate = (p: Point, a: number): Point => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });

/** 上から見た石の幅がいちばん狭くなる回し方（x に沿って長く、y に沿って短くなる向き）。同じくらいなら回さない */
function narrowAngle(hull: readonly Point[]): number {
  const widthAt = (a: number) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of hull) {
      const y = p.x * Math.sin(a) + p.y * Math.cos(a);
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
    return hi - lo;
  };
  let best = 0;
  let bestW = widthAt(0);
  for (let d = -90; d < 90; d += 0.5) {
    const a = (d * Math.PI) / 180;
    const w = widthAt(a);
    if (w < bestW - 1e-3) {
      bestW = w;
      best = a;
    }
  }
  for (let d = -0.5; d <= 0.5; d += 0.05) {
    const a = best + (d * Math.PI) / 180;
    const w = widthAt(a);
    if (w < bestW - 1e-4) {
      bestW = w;
      best = a;
    }
  }
  return best;
}

/** 石の向きと、どちらの端をくぼみにするか */
function stonePose(stone: StoneParams): { mode: TensionMode; rotationZ: number; cornerCount: number; hull: Point[] } {
  const outline = toCounterClockwise(stone.outlineMm);
  const hull = toCounterClockwise(convexHull(outline));
  const corners = findCorners(stone.outlineMm).filter((c) => c.angleDeg < GUIDES.tension.cornerMaxDeg);
  const n = corners.length;
  if (n === 3) {
    // 三角：いちばん長い辺を x に沿わせ（高さが y に沿う）、向かいの角を +y へ
    let a = narrowAngle(hull);
    const ys = corners.map((c) => rotate(c.point, a).y);
    const pairs = [0, 1, 2].map((i) => {
      const others = ys.filter((_, j) => j !== i);
      return { i, d: Math.abs(ys[i] - (others[0] + others[1]) / 2) };
    });
    const lone = pairs.reduce((p, q) => (q.d > p.d ? q : p)).i;
    if (ys[lone] < (ys[(lone + 1) % 3] + ys[(lone + 2) % 3]) / 2) a += Math.PI;
    return { mode: "corner-edge", rotationZ: a, cornerCount: n, hull };
  }
  if (n === 1) {
    // しずく形：先を +y へ（真ん中から先への線が y に沿う）
    const c = girdleCenter(stone.outlineMm);
    const p = corners[0].point;
    const a = Math.PI / 2 - Math.atan2(p.y - c.y, p.x - c.x);
    return { mode: "corner-edge", rotationZ: a, cornerCount: n, hull };
  }
  // 角のない石・角が 2 つや 4 つの石：くぼみを作る 1 つの角が決まらないので、狭い幅の両側を溝にする
  return { mode: "edge-edge", rotationZ: narrowAngle(hull), cornerCount: n, hull };
}

/** 断面（x：幅の向き、h：指の側からの高さ）の、高さごとの左右の端 */
function sectionSides(outer: readonly [number, number][], w: number, t: number) {
  const pts = outer.map(([xi, eta]) => [(xi * w) / 2, eta * t] as [number, number]);
  const sides = (h: number): { l: number; r: number } => {
    let l = Infinity;
    let r = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const [x0, h0] = pts[i];
      const [x1, h1] = pts[(i + 1) % pts.length];
      const eps = 1e-9;
      if (Math.abs(h0 - h1) < eps) {
        if (Math.abs(h - h0) < 1e-7) {
          l = Math.min(l, x0, x1);
          r = Math.max(r, x0, x1);
        }
        continue;
      }
      if ((h - h0) * (h - h1) > 1e-12) continue;
      const x = x0 + ((x1 - x0) * (h - h0)) / (h1 - h0);
      l = Math.min(l, x);
      r = Math.max(r, x);
    }
    return Number.isFinite(l) ? { l, r } : { l: 0, r: 0 };
  };
  return { pts, sides };
}

/** 石と腕の置き方を決め、腕を作る。石はこの結果の平行移動と回転で置く */
export function buildTensionBand(p: ShankParams, stone: StoneParams, o: TensionOptions = {}): { shank: ShankResult; info: TensionInfo } {
  const g = GUIDES.tension;
  const section: ShankSection = p.section ?? "maru";
  const w = p.widthMm ?? g.wireMm;
  const t = p.thicknessMm ?? g.wireMm;
  const metal: MetalId = p.metal ?? "k18y";
  const dIn = innerDiameterMm(p.gou);
  const r = dIn / 2;
  const rc = r + t / 2;
  const clear = o.clearanceMm ?? g.clearanceMm;
  const pitDepth = o.cornerPitMm ?? g.cornerPitMm;
  const grooveDepth = o.edgeGrooveMm ?? g.edgeGrooveMm;

  // 石の向き：上から見て回し、くぼみの幅の真ん中（なければ石の真ん中）を腕の幅の真ん中へ
  const pose = stonePose(stone);
  const hullR = pose.hull.map((q) => rotate(q, pose.rotationZ));
  const xs = hullR.map((q) => q.x);
  let tx = -(Math.min(...xs) + Math.max(...xs)) / 2;
  if (pose.mode === "corner-edge") {
    const rough = polygonTable(hullR);
    const tip = Math.max(...rough.yTop);
    let lo = Infinity;
    let hi = -Infinity;
    rough.yTop.forEach((y, i) => {
      if (y < tip - pitDepth) return;
      const x = rough.xMin + i * TABLE_STEP_MM;
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    });
    tx = -(lo + hi) / 2;
  }
  const hull0 = hullR.map((q) => ({ x: q.x + tx, y: q.y }));
  const bare = polygonTable(hull0);
  // 腕の幅の中の、輪郭の上と下の端
  const span = (col: Float32Array, pick: (a: number, b: number) => number) => {
    let v = pick(Infinity, -Infinity) === Infinity ? -Infinity : Infinity;
    for (let x = -w / 2; x <= w / 2 + 1e-9; x += 0.02) {
      const y = lookup(bare, col, x);
      if (y !== null) v = pick(v, y);
    }
    return v;
  };
  const topMax = span(bare.yTop, Math.max);
  const topMin = span(bare.yTop, Math.min);
  const botMin = span(bare.yBot, Math.min);
  const botMax = span(bare.yBot, Math.max);
  const corner = pose.mode === "corner-edge";
  const depthTop = corner ? pitDepth : grooveDepth;
  const depthBot = grooveDepth;
  const straightTop = !corner && topMax - topMin <= STRAIGHT_SAG_RATIO * w;
  const straightBot = botMax - botMin <= STRAIGHT_SAG_RATIO * w;
  // 図面の開き：石が入る寸法のまま（プリロードは図面に入れない。作者が地金を硬くしながら詰める）
  const spanY = topMax - botMin;
  const gap = Math.max(MIN_GAP_MM, spanY - depthTop - depthBot);
  const planeAbs = gap / 2;
  const ty = planeAbs - (topMax - depthTop);

  // 石の高さ：縁を腕の太さの中ほどに。石の先が指に近すぎるときは、その分だけ上げる
  const h = stoneHeights(stone);
  const k = stoneKnots(h);
  const minGap = o.culetGapMm ?? GUIDES.height.minFingerGapMm;
  const yIn = Math.min(planeAbs, rc * 0.95);
  const zMid = Math.sqrt(Math.max(0, rc * rc - yIn * yIn)) + (g.girdleAtWire - 0.5) * t;
  const zNeed = r + minGap - h.culetZ;
  const girdleZ = Math.max(zMid, zNeed);
  const lift = o.liftEnds ?? g.liftEnds;
  const liftMm = lift && girdleZ > zMid ? Math.hypot(yIn, girdleZ - (g.girdleAtWire - 0.5) * t) - rc : 0;
  const rhoEnd = rc + liftMm;

  // 腕の中心の線：指の丸み（半径 rc）。両はしの近くだけ、半径 rhoEnd の弧へなめらかに持ち上げる
  const reach = Math.max(depthTop, depthBot) + clear + PLATEAU_MARGIN_MM;
  const aHi = Math.min(Math.PI / 2, Math.asin(Math.min(0.98, (planeAbs + reach) / Math.max(1e-3, rhoEnd - t / 2))));
  const aBlend = Math.min(Math.PI * 0.95, aHi + (g.liftBlendDeg * Math.PI) / 180);
  const rhoAt = (a: number): { rho: number; drho: number } => {
    if (liftMm === 0 || a <= aHi) return { rho: rhoEnd, drho: 0 };
    if (a >= aBlend) return { rho: rc, drho: 0 };
    const u = (a - aHi) / (aBlend - aHi);
    return { rho: rc + (liftMm * (1 + Math.cos(Math.PI * u))) / 2, drho: (-liftMm * Math.PI * Math.sin(Math.PI * u)) / (2 * (aBlend - aHi)) };
  };
  /** 腕の上の点（y は正の側。a は腕のいちばん上から測った角度）。断面の高さ h は、中心の線の法線の向きに測る */
  const onBand = (hh: number, a: number): [number, number] => {
    const { rho, drho } = rhoAt(a);
    const sn = Math.sin(a);
    const cs = Math.cos(a);
    // 接線 (ρ' sin a ＋ ρ cos a, ρ' cos a − ρ sin a) に直角な、外向きの法線
    const ty0 = drho * sn + rho * cs;
    const tz0 = drho * cs - rho * sn;
    const l = Math.hypot(ty0, tz0) || 1;
    const ny = -tz0 / l;
    const nz = ty0 / l;
    const off = hh - t / 2;
    return [rho * sn + off * ny, rho * cs + off * nz];
  };

  // 石（すき間を足した形）：輪郭を外へ広げて表に。高さは上下へすき間だけずらす
  const place = (q: Point): Point => ({ x: q.x, y: q.y + ty });
  const hullPlaced = hull0.map(place);
  const table = polygonTable(offsetHull(hullPlaced, clear));
  const c0 = rotate(girdleCenter(stone.outlineMm), pose.rotationZ);
  const cx = c0.x + tx;
  const cy = c0.y + ty;
  const gTop = h.girdleMm / 2;
  const scaleAtZ = (z: number): number | null => {
    const zs = z - girdleZ;
    if (zs > h.tableZ + clear || zs < h.culetZ - clear) return null;
    if (Math.abs(zs) <= gTop + clear) return 1;
    const s = stoneScaleAt(h, zs > 0 ? zs - clear : zs + clear);
    return s > 0.02 ? s : null;
  };
  const yEdgeTop = topMax + ty + clear;
  const yEdgeBot = botMin + ty - clear;
  /** 石（すき間を足した形）の、その端の側の y の絶対値（石がなければ null） */
  const stoneAbs = (side: 1 | -1, x: number, z: number): number | null => {
    const s = scaleAtZ(z);
    if (s === null) return null;
    if (side > 0 && straightTop) return cy + s * (yEdgeTop - cy);
    if (side < 0 && straightBot) return -(cy + s * (yEdgeBot - cy));
    const xp = cx + (x - cx) / s;
    const y = lookup(table, side > 0 ? table.yTop : table.yBot, xp);
    if (y === null) return null;
    return side * (cy + s * (y - cy));
  };
  /** 端の面の場所：その (x, h) の線が腕の端で止まる角度 a（y ＝ 石か平らな面のどちらか奥の方） */
  const endAngle = (side: 1 | -1, x: number, hh: number): number => {
    const inside = (a: number) => {
      const [y, z] = onBand(hh, a);
      const s = stoneAbs(side, x, z);
      return y >= Math.max(planeAbs, s ?? -Infinity);
    };
    let lo = 0;
    let hi = aHi;
    if (inside(lo)) return lo;
    if (!inside(hi)) return hi;
    for (let it = 0; it < 26; it++) {
      const m = (lo + hi) / 2;
      if (inside(m)) hi = m;
      else lo = m;
    }
    return hi;
  };

  // 断面の高さの行：断面の線の点 ＋ 溝の折れ目
  const outer = sectionOutline(section, p.sectionPoints, p.sectionCurve);
  const { pts: sectionPts, sides } = sectionSides(outer, w, t);
  const hOf = (y: number, z: number) => Math.hypot(y, z) - rhoEnd + t / 2;
  const hMin = Math.min(...sectionPts.map((q) => q[1]));
  const hMax = Math.max(...sectionPts.map((q) => q[1]));
  const wireAt = (hh: number) => {
    const rho = rhoEnd + hh - t / 2;
    return Math.sqrt(Math.max(0, rho * rho - planeAbs * planeAbs));
  };
  const wireTopZ = wireAt(hMax);
  const wireBottomZ = wireAt(hMin);
  // 腕の真ん中の、端の面での彫り口（石が端の面より奥へ入っている高さ）
  const opening = (side: 1 | -1) => {
    let top = -Infinity;
    let bottom = Infinity;
    const zLo = girdleZ + h.culetZ - clear - 0.1;
    const zHi = girdleZ + h.tableZ + clear + 0.1;
    for (let z = zLo; z <= zHi; z += 0.005) {
      const s = stoneAbs(side, 0, z);
      if (s !== null && s > planeAbs) {
        if (z > top) top = z;
        if (z < bottom) bottom = z;
      }
    }
    return Number.isFinite(top) ? { top, bottom } : { top: girdleZ, bottom: girdleZ };
  };
  const features: number[] = [];
  for (const side of [1, -1] as const) {
    const op = opening(side);
    const ends = [op.top, op.bottom];
    const floors = [girdleZ + gTop + clear, girdleZ - gTop - clear, girdleZ + k.crownMid + clear, girdleZ + k.pavilionMid - clear];
    for (const z of ends) features.push(hOf(planeAbs, z));
    for (const z of floors) {
      const s = stoneAbs(side, 0, z);
      if (s !== null) features.push(hOf(Math.max(planeAbs, s), z));
    }
  }
  const rowSet: number[] = [hMin, hMax];
  for (const f of features) if (f > hMin + ROW.minStepMm && f < hMax - ROW.minStepMm && rowSet.every((x) => Math.abs(x - f) > ROW.minStepMm)) rowSet.push(f);
  for (const [, hh] of sectionPts) if (rowSet.every((x) => Math.abs(x - hh) > ROW.minStepMm)) rowSet.push(hh);
  rowSet.sort((a, b) => a - b);
  const rows: number[] = [];
  for (let j = 0; j < rowSet.length; j++) {
    rows.push(rowSet[j]);
    if (j + 1 < rowSet.length) {
      const d = rowSet[j + 1] - rowSet[j];
      const m = Math.ceil(d / ROW.maxStepMm);
      for (let q = 1; q < m; q++) rows.push(rowSet[j] + (d * q) / m);
    }
  }
  const M = rows.length - 1;
  // 幅の向きの列（0〜1）
  const cols = Array.from({ length: COLS + 1 }, (_, q) => q / COLS);
  const K = COLS;
  const rowSides = rows.map((hh) => sides(hh));
  const collapsed = rowSides.map((s) => s.r - s.l < 1e-6);
  const xAt = (j: number, k2: number) => (collapsed[j] ? (rowSides[j].l + rowSides[j].r) / 2 : rowSides[j].l + (rowSides[j].r - rowSides[j].l) * cols[k2]);

  // 両はしの面の点
  const point = (x: number, hh: number, phi: number): V3 => {
    const a = phi <= Math.PI ? phi : 2 * Math.PI - phi;
    const [y, z] = onBand(hh, a);
    return [x, phi <= Math.PI ? y : -y, z];
  };
  /** その (x, h) の所で、石が端の面より奥へ入っている長さ（＋ なら彫る所。0 の線が彫り口の折れ目） */
  const carve = (side: 1 | -1, x: number, hh: number) => {
    const rho = rhoEnd + hh - t / 2;
    const s = stoneAbs(side, x, Math.sqrt(Math.max(0, rho * rho - planeAbs * planeAbs)));
    return (s ?? -1) - planeAbs;
  };
  /**
   * 端の面の格子の点を、彫り口の折れ目へ寄せる（のこぎりの歯のような折れ目にしない）。
   * 折れ目が通る格子の辺ごとに、近い方の点を、辺に沿って折れ目まで動かす。断面の 1 周の点は動かさない（腕の筒とつながっているので）
   */
  const snappedGrid = (side: 1 | -1) => {
    const gx = rows.map((_, j) => cols.map((_, q) => xAt(j, q)));
    const gh = rows.map((hh) => cols.map(() => hh));
    const f = rows.map((_, j) => cols.map((_, q) => carve(side, gx[j][q], gh[j][q])));
    const moves = new Map<number, { d: number; x: number; h: number }>();
    const key = (j: number, q: number) => j * (K + 1) + q;
    const edge = (j0: number, q0: number, j1: number, q1: number) => {
      if (f[j0][q0] > 0 === f[j1][q1] > 0) return;
      let lo = 0;
      let hi = 1;
      const at = (u: number) => [gx[j0][q0] + (gx[j1][q1] - gx[j0][q0]) * u, gh[j0][q0] + (gh[j1][q1] - gh[j0][q0]) * u];
      for (let it = 0; it < 14; it++) {
        const m = (lo + hi) / 2;
        const [mx, mh] = at(m);
        if (carve(side, mx, mh) > 0 === f[j0][q0] > 0) lo = m;
        else hi = m;
      }
      const u = (lo + hi) / 2;
      const [x, hh] = at(u);
      const near = u < 0.5 ? [j0, q0, u] : [j1, q1, 1 - u];
      const inner = (j: number, q: number) => j > 0 && j < M && q > 0 && q < K && !collapsed[j];
      const cand = inner(near[0], near[1]) ? near : inner(u < 0.5 ? j1 : j0, u < 0.5 ? q1 : q0) ? ([u < 0.5 ? j1 : j0, u < 0.5 ? q1 : q0, u < 0.5 ? 1 - u : u] as number[]) : null;
      if (!cand) return;
      const k2 = key(cand[0], cand[1]);
      const old = moves.get(k2);
      if (!old || cand[2] < old.d) moves.set(k2, { d: cand[2], x, h: hh });
    };
    for (let j = 0; j <= M; j++) {
      if (collapsed[j]) continue;
      for (let q = 0; q < K; q++) edge(j, q, j, q + 1);
    }
    for (let j = 0; j < M; j++) {
      if (collapsed[j] || collapsed[j + 1]) continue;
      for (let q = 0; q <= K; q++) edge(j, q, j + 1, q);
    }
    for (const [k2, m] of moves) {
      const j = Math.floor(k2 / (K + 1));
      const q = k2 - j * (K + 1);
      gx[j][q] = m.x;
      gh[j][q] = m.h;
    }
    return { gx, gh };
  };
  const gridS = snappedGrid(1);
  const gridE = snappedGrid(-1);
  const angleS: number[][] = [];
  const angleE: number[][] = [];
  const capS: V3[][] = [];
  const capE: V3[][] = [];
  for (let j = 0; j <= M; j++) {
    const aS: number[] = [];
    const aE: number[] = [];
    const pS: V3[] = [];
    const pE: V3[] = [];
    for (let q = 0; q <= K; q++) {
      if (collapsed[j] && q > 0) {
        aS.push(aS[0]);
        aE.push(aE[0]);
        pS.push(pS[0]);
        pE.push(pE[0]);
        continue;
      }
      const a0 = endAngle(1, gridS.gx[j][q], gridS.gh[j][q]);
      const a1 = 2 * Math.PI - endAngle(-1, gridE.gx[j][q], gridE.gh[j][q]);
      aS.push(a0);
      aE.push(a1);
      pS.push(point(gridS.gx[j][q], gridS.gh[j][q], a0));
      pE.push(point(gridE.gx[j][q], gridE.gh[j][q], a1));
    }
    angleS.push(aS);
    angleE.push(aE);
    capS.push(pS);
    capE.push(pE);
  }

  // 断面の 1 周（下の行 → 右 → 上の行 → 左）。点は端の面の格子の点そのもの
  const contour: [number, number][] = [];
  if (collapsed[0]) contour.push([0, K]);
  else for (let q = 0; q <= K; q++) contour.push([0, q]);
  for (let j = 1; j < M; j++) contour.push([j, K]);
  if (collapsed[M]) contour.push([M, K]);
  else for (let q = K; q >= 0; q--) contour.push([M, q]);
  for (let j = M - 1; j >= 1; j--) contour.push([j, 0]);

  const tris: number[] = [];
  const loops: V3[][] = [];
  for (let l = 0; l <= AROUND; l++) {
    loops.push(
      contour.map(([j, q]) => {
        if (l === 0) return capS[j][q];
        if (l === AROUND) return capE[j][q];
        const u = l / AROUND;
        return point(xAt(j, q), rows[j], angleS[j][q] + (angleE[j][q] - angleS[j][q]) * u);
      }),
    );
  }
  const n = contour.length;
  for (let l = 0; l < AROUND; l++) {
    const a = loops[l];
    const b = loops[l + 1];
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      pushTri(tris, a[i], a[i2], b[i2]);
      pushTri(tris, a[i], b[i2], b[i]);
    }
  }
  capTriangles(capS, collapsed, true, tris);
  capTriangles(capE, collapsed, false, tris);
  const positions = closedPart(tris);
  const volumeMm3 = meshVolume(positions);

  // 測った数（確かめ・図面・札で使う）
  const endInfo = (side: 1 | -1, kind: "pit" | "groove", depthMm: number, straight: boolean): TensionEnd => {
    const op = opening(side);
    const floorAbs = planeAbs + depthMm;
    const hGirdleFloor = hOf(floorAbs, girdleZ);
    const girdleInWire = hGirdleFloor - gTop >= hMin && hGirdleFloor + gTop <= hMax;
    const hGirdle = hOf(planeAbs, girdleZ);
    const inRow = hGirdle >= hMin && hGirdle <= hMax;
    const sd = inRow ? sides(hGirdle) : { l: 0, r: 0 };
    const contactWidthMm = sd.r - sd.l;
    let oL = Infinity;
    let oR = -Infinity;
    for (let x = -w / 2 - 2; x <= w / 2 + 2; x += 0.01) {
      const s = stoneAbs(side, x, girdleZ);
      if (s !== null && s > planeAbs) {
        if (x < oL) oL = x;
        if (x > oR) oR = x;
      }
    }
    const openWidthMm = Number.isFinite(oL) ? oR - oL : 0;
    const sideWallMm = Number.isFinite(oL) ? Math.min(oL - sd.l, sd.r - oR) : contactWidthMm / 2;
    return {
      kind,
      side,
      planeY: side * planeAbs,
      depthMm,
      floorMm: depthMm + clear,
      straight,
      openTopZ: op.top,
      openBottomZ: op.bottom,
      openingMm: op.top - op.bottom,
      wireTopZ,
      wireBottomZ,
      lipTopMm: wireTopZ - op.top,
      lipBottomMm: op.bottom - wireBottomZ,
      contactWidthMm,
      girdleInWire,
      openWidthMm,
      sideWallMm,
    };
  };
  // 腕の真ん中の線の長さ（数値で足す）
  const a0 = endAngle(1, 0, t / 2);
  const a1 = endAngle(-1, 0, t / 2);
  let wireLengthMm = 0;
  {
    const steps = 720;
    let prev = onBand(t / 2, a0);
    for (let i = 1; i <= steps; i++) {
      const u = a0 + ((Math.PI - a0) * i) / steps;
      const q = onBand(t / 2, u);
      wireLengthMm += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
      prev = q;
    }
    prev = onBand(t / 2, a1);
    for (let i = 1; i <= steps; i++) {
      const u = a1 + ((Math.PI - a1) * i) / steps;
      const q = onBand(t / 2, u);
      wireLengthMm += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
      prev = q;
    }
  }
  const info: TensionInfo = {
    wireLengthMm,
    mode: pose.mode,
    gapMm: gap,
    clearanceMm: clear,
    girdleZ,
    liftMm,
    rotationZ: pose.rotationZ,
    translateX: tx,
    translateY: ty,
    spanMm: spanY,
    cornerCount: pose.cornerCount,
    ends: [endInfo(1, corner ? "pit" : "groove", depthTop, straightTop), endInfo(-1, "groove", depthBot, straightBot)],
  };
  const shank: ShankResult = {
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
    outlineMm: outer.map(([xi, eta]) => [(xi * w) / 2, eta * t] as [number, number]),
    sideWidthMm: w,
    notchDepthMm: 0,
    notchBallDiameterMm: 0,
    notchBall: null,
    notchBalls: [],
    head: null,
    railSeatDepthMm: 0,
    ends: [
      { y: planeAbs, topZ: wireTopZ, bottomZ: wireBottomZ },
      { y: -planeAbs, topZ: wireTopZ, bottomZ: wireBottomZ },
    ],
  };
  return { shank, info };
}

/**
 * 端の面の格子を三角形にする。始まりの端（start）は断面の 1 周と逆回り、終わりの端は同じ回りで、腕の筒と辺を共有する。
 * 四角の対角線は、折れの少ない方を選ぶ（くぼみの折れ目がのこぎりの歯にならないように）。点に縮んだ行の所は三角形を作らない
 */
function capTriangles(grid: V3[][], collapsed: readonly boolean[], start: boolean, out: number[]): void {
  const M = grid.length - 1;
  const K = grid[0].length - 1;
  const emit = (a: V3, b: V3, c: V3) => (start ? pushTri(out, a, c, b) : pushTri(out, a, b, c));
  const normal = (a: V3, b: V3, c: V3): V3 => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  };
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (let j = 0; j < M; j++) {
    for (let q = 0; q < K; q++) {
      const a = grid[j][q];
      const b = grid[j][q + 1];
      const c = grid[j + 1][q + 1];
      const d = grid[j + 1][q];
      if (collapsed[j]) {
        emit(a, c, d);
        continue;
      }
      if (collapsed[j + 1]) {
        emit(a, b, c);
        continue;
      }
      const ac = dot(normal(a, b, c), normal(a, c, d));
      const bd = dot(normal(a, b, d), normal(b, c, d));
      if (ac >= bd) {
        emit(a, b, c);
        emit(a, c, d);
      } else {
        emit(a, b, d);
        emit(b, c, d);
      }
    }
  }
}
