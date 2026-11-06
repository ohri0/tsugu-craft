// テンション（挟む）の腕：開いた輪の両はしに、石の形（すき間を足した物）を彫る。画面に依存しない純粋な関数。
// 座標は指輪の座標（shank.ts と同じ）：mm、x が指の向き、z が上、腕は y–z の面。
// 職人（石川、2026-11-05）の決まり：片方の端は角のくぼみ、もう片方の端は辺の溝。数字は GUIDES.tension の 1 か所。
// 石の向きは選べる（TensionGrip）：狭い幅を挟む・長い向きを挟む・向かい合う角をくぼみに・（三角）短い辺を溝に。
//
// 作り方：腕の端の面を「断面の点 (x, h) ごとに、腕に沿ってどこで終わるか」として決める。
// 腕の端は y 一定の平らな面（図面の開き）で、そこから石の形だけ奥へ彫る。石は下へ行っても上へ行っても細くなるので、
// 彫った面は奥へ入りこまない（下から覗けない形にならない）。だから、面は (x, h) の上の 1 つの値になり、閉じた形が必ず作れる。
// 面の格子は高さの行を溝の折れ目にそろえるので、まっすぐな溝の折れ線は、そのまま形の辺になる。
import { GUIDES, innerDiameterMm, type Guides, type MetalId } from "../rules/guides";
import { tensionAdvice, type TensionAdvice } from "../rules/tension-set";
import { findCorners } from "./corners";
import { pushTri, closedPart, type V3 } from "./mesh";
import { convexHull, toCounterClockwise, type Point } from "./polygon";
import { sectionOutline, weightG, type ShankParams, type ShankResult, type ShankSection } from "./shank";
import { girdleCenter, meshVolume, stoneHeights, stoneKnots, stoneScaleAt, type StoneParams } from "./stone";

export type TensionMode = "corner-edge" | "edge-edge" | "corner-corner";
/**
 * 石のどこを腕で挟むか（上から見た石の向き）。
 * short：いちばん狭い幅を挟む（長い向きは指に沿って、腕の幅の外へ出る）。三角では、いちばん長い辺を溝に・向かいの角をくぼみに。
 * long：長い向きを挟む（短い辺や丸い端を溝に）。corner：向かい合う 2 つの角をくぼみに。
 * side：三角だけ。いちばん短い辺を溝に・反対の角（いちばん長い辺の片はし）をくぼみに。角から辺までが short より長い所を挟む。
 * 作者が実際に作った指輪の向き（職人 石川 2026-11-07「角を 1 個入れて、辺を 1 個溝に落とした」。角のくぼみ 0.4 mm・辺の溝 0.4 mm くらい。見た感じの値）。
 */
export type TensionGrip = "short" | "long" | "corner" | "side";

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
  /** 今の挟む向きと、この石で選べる挟む向き（1 つなら選ぶものはない） */
  grip: TensionGrip;
  grips: TensionGrip[];
  /** 腕の線の高さ（断面の高さ。mm） */
  wireMm: number;
  /** 石の先が、腕の端の内側の線より下（指の側）へ出る長さ（mm。− なら腕の内側より上） */
  culetBelowArmMm: number;
  /** 石の上面が、腕の端のいちばん上より低い長さ（mm。− なら腕より上に出ている） */
  tableBelowArmMm: number;
  /** 石の縁の高さで、腕の幅の外へはみ出す石の長さ（片側の大きい方。mm）と、その腕の幅に対する割合 */
  overhangMm: number;
  overhangRatio: number;
  /** 石を横（x の向き）から滑らせて入れられるか：両はしとも腕の幅いっぱいに抜けるまっすぐな溝で、石のどこも溝より奥へ出ない */
  slides: boolean;
  /** 腕の線の長さ（mm。太さの真ん中の線で、端の面から端の面まで。切り口を整える分はふくまない） */
  wireLengthMm: number;
  ends: [TensionEnd, TensionEnd];
}

export interface TensionOptions {
  /** 角のくぼみに入れる深さ（mm）。なければ、三角の短い辺を溝に入れるとき（side）は職人の値 shortSidePitMm、ほかは戻りきらない分を見込んだおすすめ（仮。tensionDefaultDepths） */
  cornerPitMm?: number;
  /** 辺の溝に入れる深さ（mm）。なければ、三角の side は職人の値 shortSideGrooveMm、ほかはおすすめ（仮） */
  edgeGrooveMm?: number;
  /** 石のすき間（mm）。なければ GUIDES.tension.clearanceMm */
  clearanceMm?: number;
  /** 石の先と指のすき間の最低（mm）。なければ GUIDES.height.minFingerGapMm */
  culetGapMm?: number;
  /** 腕の両はしを持ち上げるか。なければ GUIDES.tension.liftEnds */
  liftEnds?: boolean;
  /** 挟む向き。なければ short（角が 1 つの石は、いつも角をくぼみに。三角は short・side・corner） */
  grip?: TensionGrip;
  /** 石の縁の高さ（腕の太さのどこか。0.5 は真ん中）。なければ GUIDES.tension.girdleAtWire */
  girdleAtWire?: number;
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
/** これより大きく曲がる角は、丸く回らず、辺を延ばした交点まで広げる（度。形を作るための決まり） */
const SHARP_TURN_DEG = 30;
/** 溝をまっすぐにしてよい、腕の幅の中の輪郭の反り（腕の幅に対する割合。形を作るための決まり） */
const STRAIGHT_SAG_RATIO = 0.06;
/** 彫りの奥より少し先まで、腕を丸い弧のまま保つ長さ（mm。形を作るための決まり） */
const PLATEAU_MARGIN_MM = 0.5;
/** 開きの最低（mm。これより狭いと形が作れないので、ここで止める。確かめが「作れない」と言う） */
const MIN_GAP_MM = 0.1;
/** 端の面を探す回数：奥から平らな面まで見る数と、見つけた所を細かくする数（形を作るための決まり） */
const END_SCAN = 12;
const END_BISECT = 14;
/** 彫り口の折れ目を探す回数（形を作るための決まり） */
const SNAP_BISECT = 12;

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

/**
 * 凸の輪郭を外へ c だけ広げる。ゆるい角は丸く回り、とがった角（マーキスの先など）は、辺をそのまま延ばした交点まで広げる。
 * 丸く回ると、とがった先の所だけ、面の格子の細かさより小さくなり、すき間が残らなかった（マーキスの先で 0.004 mm）
 */
function offsetHull(hull: readonly Point[], c: number): Point[] {
  if (c <= 0) return [...hull];
  const out: Point[] = [];
  const n = hull.length;
  const step = (ARC_STEP_DEG * Math.PI) / 180;
  const sharp = (SHARP_TURN_DEG * Math.PI) / 180;
  for (let i = 0; i < n; i++) {
    const p = hull[(i + n - 1) % n];
    const q = hull[i];
    const r = hull[(i + 1) % n];
    const a0 = Math.atan2(q.y - p.y, q.x - p.x) - Math.PI / 2;
    let a1 = Math.atan2(r.y - q.y, r.x - q.x) - Math.PI / 2;
    while (a1 < a0) a1 += Math.PI * 2;
    const turn = a1 - a0;
    if (turn >= sharp && turn < Math.PI * 0.95) {
      const mid = (a0 + a1) / 2;
      const len = c / Math.cos(turn / 2);
      out.push({ x: q.x + len * Math.cos(mid), y: q.y + len * Math.sin(mid) });
      continue;
    }
    const m = Math.max(1, Math.ceil(turn / step));
    for (let k = 0; k <= m; k++) {
      const a = a0 + (turn * k) / m;
      out.push({ x: q.x + c * Math.cos(a), y: q.y + c * Math.sin(a) });
    }
  }
  return out;
}

const rotate = (p: Point, a: number): Point => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });

/**
 * 上から見た石の幅がいちばん狭くなる回し方（x に沿って長く、y に沿って短くなる向き）。同じくらいなら回さない。
 * around・halfDeg を渡すと、その角度のまわり ±halfDeg 度の中だけで探す（三角の短い辺を x に沿わせるとき）
 */
function narrowAngle(hull: readonly Point[], around = 0, halfDeg = 90): number {
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
  let best = around;
  let bestW = widthAt(around);
  for (let d = -halfDeg; d < halfDeg; d += 0.5) {
    const a = around + (d * Math.PI) / 180;
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

/** 内角が目安より鋭い角 */
function sharpCorners(stone: StoneParams) {
  return findCorners(stone.outlineMm).filter((c) => c.angleDeg < GUIDES.tension.cornerMaxDeg);
}

/** 上から見た長さと幅の比（narrowAngle の向きで測る） */
function aspectOf(hull: readonly Point[]): number {
  const a = narrowAngle(hull);
  const pts = hull.map((q) => rotate(q, a));
  const w = Math.max(...pts.map((q) => q.y)) - Math.min(...pts.map((q) => q.y));
  const l = Math.max(...pts.map((q) => q.x)) - Math.min(...pts.map((q) => q.x));
  return w > 1e-6 ? l / w : 1;
}

/**
 * この石で選べる挟む向き。丸い石に向きはない。角が 1 つ（しずく形）は角をくぼみ・向かいを溝に入れる形だけ。
 * 角が 3 つ（三角）：角と辺を挟む向きが 2 つ（short：いちばん長い辺を溝に・向かいの角をくぼみに。side：いちばん短い辺を溝に・反対の角をくぼみに）と、
 * 長い辺の両はしの角を両方くぼみに入れる向き（corner）。作者が実際に作った指輪は side（職人 2026-11-07「角を 1 個入れて、辺を 1 個溝に落とした」）。
 * 前（2026-11-07 の昼）は、作者の言葉を聞きちがえて、corner を作者の指輪の向きとしていた。
 * 角が 2 つ（マーキス）：腹を溝に／両先をくぼみに。角が 4 つ以上（スクエアなど）：辺を溝に／角をくぼみに（長方形なら長い向きも）。
 */
export function tensionGrips(stone: StoneParams): TensionGrip[] {
  const n = sharpCorners(stone).length;
  if (n === 1) return ["short"];
  if (n === 3) return ["short", "side", "corner"];
  const hull = toCounterClockwise(convexHull(toCounterClockwise(stone.outlineMm)));
  const long = aspectOf(hull) >= GUIDES.tension.gripAspect;
  if (n === 2) return ["short", "corner"];
  if (n >= 4) return long ? ["short", "long", "corner"] : ["short", "corner"];
  return long ? ["short", "long"] : ["short"];
}

/** 挟み方ごとの、両はしの種類 */
export function endKindsOf(mode: TensionMode): ["pit" | "groove", "pit" | "groove"] {
  return mode === "corner-edge" ? ["pit", "groove"] : mode === "corner-corner" ? ["pit", "pit"] : ["groove", "groove"];
}

/** おすすめの計算に使う地金の値（ヤング率・耐力（硬い状態）・密度）。K18 は色を分けない形の地金なので K18 イエロー、色金はばねの値がないので K18 イエローを借りる（src/rules/tension-calc.ts の springIdOf と同じ） */
export function adviceSpringOf(metal: MetalId, g: Guides = GUIDES): { youngGpa: number; proofMpa: number; densityGPerCm3: number } {
  const id = metal === "pt900" || metal === "sv925" ? metal : "k18y";
  const m = g.tension.spring.metals[id];
  return { youngGpa: m.young.gpa, proofMpa: m.hardened.proofMpa, densityGPerCm3: g.metals[metal].densityGPerCm3 };
}

/** 深さの既定とその出どころ：craftsman ＝ 職人の値（三角の side）、advice ＝ 戻りきらない分を見込んだおすすめ（仮） */
export interface TensionDefaultDepths {
  pitMm: number;
  grooveMm: number;
  from: "craftsman" | "advice";
  advice: TensionAdvice | null;
}

function defaultDepthsFor(pose: { mode: TensionMode; grip: TensionGrip }, radiusMm: number, wireMm: number, metal: MetalId, g: Guides = GUIDES, spring = adviceSpringOf(metal, g)): TensionDefaultDepths {
  const t = g.tension;
  if (pose.grip === "side") return { pitMm: t.shortSidePitMm, grooveMm: t.shortSideGrooveMm, from: "craftsman", advice: null };
  const advice = tensionAdvice({ radiusMm, wireMm, ...spring, kinds: endKindsOf(pose.mode) }, g);
  return { pitMm: advice.pitMm ?? t.cornerPitMm, grooveMm: advice.grooveMm ?? t.edgeGrooveMm, from: "advice", advice };
}

/**
 * この石・この挟む向き・この輪で、くぼみと溝の深さの既定（形を作らずに出す。設計の場が、帳面の値と選んだ地金の色で出し直すとき）。
 * spring を渡すと、その地金の値で（K18 の色ごと）
 */
export function tensionDefaultDepths(p: Pick<ShankParams, "gou" | "thicknessMm" | "metal">, stone: StoneParams, grip: TensionGrip | undefined, g: Guides = GUIDES, spring?: { youngGpa: number; proofMpa: number; densityGPerCm3: number }): TensionDefaultDepths {
  const pose = stonePose(stone, grip);
  const t = p.thicknessMm ?? GUIDES.tension.wireMm;
  const rc = innerDiameterMm(p.gou) / 2 + t / 2;
  const metal: MetalId = p.metal ?? "k18y";
  return defaultDepthsFor(pose, rc, t, metal, g, spring ?? adviceSpringOf(metal, g));
}

/** 石の向きと、どちらの端をくぼみにするか */
function stonePose(stone: StoneParams, wanted: TensionGrip | undefined): { mode: TensionMode; rotationZ: number; cornerCount: number; hull: Point[]; grip: TensionGrip; grips: TensionGrip[] } {
  const outline = toCounterClockwise(stone.outlineMm);
  const hull = toCounterClockwise(convexHull(outline));
  const corners = sharpCorners(stone);
  const n = corners.length;
  const grips = tensionGrips(stone);
  const grip = wanted && grips.includes(wanted) ? wanted : "short";
  if (n === 3 && grip === "side") {
    // 三角（短い辺を溝に）：いちばん短い辺（両はしの角を結ぶ線）を x に沿わせ、反対の角を +y へ。
    // 写真の輪郭の辺は外へ反るので、角を結ぶ線のまわり ±5° で、幅がいちばん狭くなる向きに合わせる（反った辺が溝の中で平らに当たり、溝がまっすぐになる。
    // 既定の三角では線から 3° ほど回る。線のままだと、腕の幅の中で辺が傾き、溝が辺に沿って曲がった）
    const pts = corners.map((c) => c.point);
    let lone = 0;
    let shortest = Infinity;
    for (let i = 0; i < 3; i++) {
      const p = pts[(i + 1) % 3];
      const q = pts[(i + 2) % 3];
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < shortest - 1e-6) {
        shortest = d;
        lone = i;
      }
    }
    const p = pts[(lone + 1) % 3];
    const q = pts[(lone + 2) % 3];
    let a = narrowAngle(hull, -Math.atan2(q.y - p.y, q.x - p.x), 5);
    if (rotate(pts[lone], a).y < (rotate(p, a).y + rotate(q, a).y) / 2) a += Math.PI;
    return { mode: "corner-edge", rotationZ: a, cornerCount: n, hull, grip, grips };
  }
  if (n === 3 && grip !== "corner") {
    // 三角（狭い幅を挟む）：いちばん長い辺を x に沿わせ（高さが y に沿う）、向かいの角を +y へ
    let a = narrowAngle(hull);
    const ys = corners.map((c) => rotate(c.point, a).y);
    const pairs = [0, 1, 2].map((i) => {
      const others = ys.filter((_, j) => j !== i);
      return { i, d: Math.abs(ys[i] - (others[0] + others[1]) / 2) };
    });
    const lone = pairs.reduce((p, q) => (q.d > p.d ? q : p)).i;
    if (ys[lone] < (ys[(lone + 1) % 3] + ys[(lone + 2) % 3]) / 2) a += Math.PI;
    return { mode: "corner-edge", rotationZ: a, cornerCount: n, hull, grip, grips };
  }
  if (n === 1) {
    // しずく形：先を +y へ（真ん中から先への線が y に沿う）
    const c = girdleCenter(stone.outlineMm);
    const p = corners[0].point;
    const a = Math.PI / 2 - Math.atan2(p.y - c.y, p.x - c.x);
    return { mode: "corner-edge", rotationZ: a, cornerCount: n, hull, grip, grips };
  }
  if (grip === "corner") {
    // 向かい合う 2 つの角（いちばん離れた組）を y に沿わせて、両方をくぼみに。三角では、いちばん長い辺の両はしの角になり、残りの角は横（腕の幅の外）へ出る
    let best: [Point, Point] = [corners[0].point, corners[1].point];
    let far = -1;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const d = Math.hypot(corners[i].point.x - corners[j].point.x, corners[i].point.y - corners[j].point.y);
        if (d > far + 1e-6) {
          far = d;
          best = [corners[i].point, corners[j].point];
        }
      }
    const a = Math.PI / 2 - Math.atan2(best[1].y - best[0].y, best[1].x - best[0].x);
    return { mode: "corner-corner", rotationZ: a, cornerCount: n, hull, grip, grips };
  }
  // 角のない石・角が 2 つや 4 つの石：くぼみを作る 1 つの角が決まらないので、両側を溝にする。short は狭い幅、long はそれと直角の向き
  const narrow = narrowAngle(hull);
  return { mode: "edge-edge", rotationZ: grip === "long" ? narrow + Math.PI / 2 : narrow, cornerCount: n, hull, grip, grips };
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
  // 石の向き：上から見て回し、くぼみの幅の真ん中（なければ石の真ん中）を腕の幅の真ん中へ
  const pose = stonePose(stone, o.grip);
  // 深さ：三角の短い辺を溝に・反対の角をくぼみに入れるときは、作者が実際に作った指輪の値（職人 2026-11-07。shortSidePitMm・shortSideGrooveMm）。
  // ほかは、戻りきらない分を見込んだ計算のおすすめ（仮。src/rules/tension-set.ts。前の 0.8・0.5 は作者が「適当に言ってるだけ」と外した）
  const def = o.cornerPitMm === undefined || o.edgeGrooveMm === undefined ? defaultDepthsFor(pose, rc, t, metal) : null;
  const pitDepth = o.cornerPitMm ?? def!.pitMm;
  const grooveDepth = o.edgeGrooveMm ?? def!.grooveMm;
  const pitTop = pose.mode !== "edge-edge";
  const pitBot = pose.mode === "corner-corner";
  const hullR = pose.hull.map((q) => rotate(q, pose.rotationZ));
  const xs = hullR.map((q) => q.x);
  let tx = -(Math.min(...xs) + Math.max(...xs)) / 2;
  if (pitTop) {
    const rough = polygonTable(hullR);
    const middle = (col: Float32Array, sign: 1 | -1) => {
      let tip = -Infinity;
      col.forEach((y) => {
        if (Number.isFinite(y) && sign * y > tip) tip = sign * y;
      });
      let lo = Infinity;
      let hi = -Infinity;
      col.forEach((y, i) => {
        if (!Number.isFinite(y) || sign * y < tip - pitDepth) return;
        const x = rough.xMin + i * TABLE_STEP_MM;
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      });
      return (lo + hi) / 2;
    };
    tx = pitBot ? -(middle(rough.yTop, 1) + middle(rough.yBot, -1)) / 2 : -middle(rough.yTop, 1);
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
  const depthTop = pitTop ? pitDepth : grooveDepth;
  const depthBot = pitBot ? pitDepth : grooveDepth;
  const straightTop = !pitTop && topMax - topMin <= STRAIGHT_SAG_RATIO * w;
  const straightBot = !pitBot && botMax - botMin <= STRAIGHT_SAG_RATIO * w;
  // 図面の開き：石が入る寸法のまま（プリロードは図面に入れない。作者が地金を硬くしながら詰める）
  const spanY = topMax - botMin;
  const gap = Math.max(MIN_GAP_MM, spanY - depthTop - depthBot);
  const planeAbs = gap / 2;
  const ty = planeAbs - (topMax - depthTop);

  // 石の高さ：縁を腕の太さの中ほどに。石の先が指に近すぎるときは、その分だけ上げる
  const h = stoneHeights(stone);
  const k = stoneKnots(h);
  const minGap = o.culetGapMm ?? g.culetGapMm;
  const girdleAt = o.girdleAtWire ?? g.girdleAtWire;
  const yIn = Math.min(planeAbs, rc * 0.95);
  const zMid = Math.sqrt(Math.max(0, rc * rc - yIn * yIn)) + (girdleAt - 0.5) * t;
  const zNeed = r + minGap - h.culetZ;
  const girdleZ = Math.max(zMid, zNeed);
  const lift = o.liftEnds ?? g.liftEnds;
  const liftMm = lift && girdleZ > zMid ? Math.hypot(yIn, girdleZ - (girdleAt - 0.5) * t) - rc : 0;
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
  // すき間を足した輪郭の、それぞれの端のいちばん奥（腕の幅の中）
  const reachOf = (col: Float32Array, sign: 1 | -1) => {
    let best = -Infinity;
    for (let i = 0; i < col.length; i++) {
      const x = table.xMin + i * TABLE_STEP_MM;
      if (Math.abs(x) <= w / 2 + 0.05 && Number.isFinite(col[i]) && sign * col[i] > best) best = sign * col[i];
    }
    return best;
  };
  const stoneReachTop = Math.max(straightTop ? yEdgeTop : reachOf(table.yTop, 1), planeAbs + depthTop + clear);
  const stoneReachBot = Math.max(straightBot ? -yEdgeBot : reachOf(table.yBot, -1), planeAbs + depthBot + clear);
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
  /** その (x, h) の線が腕の端の平らな面に届く角度（石がなければ、ここで止まる） */
  const planeAngle = (hh: number): number => Math.asin(Math.min(1, planeAbs / Math.max(1e-6, rhoEnd + hh - t / 2)));
  /**
   * 端の面の場所：その (x, h) の線が腕の端で止まる角度 a。それより先（a が大きい方）は地金で、石が入らない。
   * 線は奥へ進むほど下がる。石の上側（クラウン）が線より緩いと、線は端の面より奥でいったん石に入り、また出る。
   * 最初に石に当たる所で止めると、その奥の地金に石が入る（2026-11-05 に、浅くて大きい石で見つけた）。だから奥から見て、最後に石を出る所で止める
   */
  const endAngle = (side: 1 | -1, x: number, hh: number): number => {
    const aP = planeAngle(hh);
    if (aP >= aHi) return aHi;
    const free = (a: number) => {
      const [y, z] = onBand(hh, a);
      const s = stoneAbs(side, x, z);
      return s === null || y >= s;
    };
    // 石が届く奥の上限（これより奥に石はない。すき間を足した輪郭の、いちばん奥）
    const deepest = (side > 0 ? stoneReachTop : stoneReachBot) + 0.02;
    const aDeep = Math.min(aHi, Math.asin(Math.min(1, deepest / Math.max(1e-6, rhoEnd + hh - t / 2))));
    if (!free(aDeep)) return aHi;
    let prev = aDeep;
    for (let i = 1; i <= END_SCAN; i++) {
      const a = aDeep + ((aP - aDeep) * i) / END_SCAN;
      if (!free(a)) {
        let lo = a;
        let hi = prev;
        for (let it = 0; it < END_BISECT; it++) {
          const m = (lo + hi) / 2;
          if (free(m)) hi = m;
          else lo = m;
        }
        return hi;
      }
      prev = a;
    }
    return aP;
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
  /** その線が、端の面より奥まで彫られているか */
  const isCut = (side: 1 | -1, x: number, hh: number) => endAngle(side, x, hh) > planeAngle(hh) + 1e-9;
  // 腕の真ん中の、端の面での彫り口（端の面より奥まで彫る高さ）。腕の外まで彫るときは、石が端の面を通る高さで、はみ出す長さが分かる
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
    for (let hh = hMin; hh <= hMax + 1e-9; hh += 0.02) {
      if (!isCut(side, 0, hh)) continue;
      const z = wireAt(hh);
      if (z > top) top = z;
      if (z < bottom) bottom = z;
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
  /**
   * 端の面の格子の点を、彫り口の折れ目へ寄せる（のこぎりの歯のような折れ目にしない）。
   * 折れ目が通る格子の辺ごとに、近い方の点を、辺に沿って折れ目まで動かす。断面の 1 周の点は動かさない（腕の筒とつながっているので）。
   * 点ごとの止まる角度もいっしょに返す（同じ計算を 2 度しないように）
   */
  const snappedGrid = (side: 1 | -1) => {
    const gx = rows.map((_, j) => cols.map((_, q) => xAt(j, q)));
    const gh = rows.map((hh) => cols.map(() => hh));
    const angle = rows.map((_, j) => cols.map((_, q) => (collapsed[j] && q > 0 ? 0 : endAngle(side, gx[j][q], gh[j][q]))));
    for (let j = 0; j <= M; j++) if (collapsed[j]) for (let q = 1; q <= K; q++) angle[j][q] = angle[j][0];
    const f = rows.map((_, j) => cols.map((_, q) => angle[j][q] > planeAngle(gh[j][q]) + 1e-9));
    const moves = new Map<number, { d: number; x: number; h: number }>();
    const key = (j: number, q: number) => j * (K + 1) + q;
    const edge = (j0: number, q0: number, j1: number, q1: number) => {
      if (f[j0][q0] === f[j1][q1]) return;
      let lo = 0;
      let hi = 1;
      const at = (u: number) => [gx[j0][q0] + (gx[j1][q1] - gx[j0][q0]) * u, gh[j0][q0] + (gh[j1][q1] - gh[j0][q0]) * u];
      for (let it = 0; it < SNAP_BISECT; it++) {
        const m = (lo + hi) / 2;
        const [mx, mh] = at(m);
        if (isCut(side, mx, mh) === f[j0][q0]) lo = m;
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
      angle[j][q] = endAngle(side, m.x, m.h);
    }
    return { gx, gh, angle };
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
      const a0 = gridS.angle[j][q];
      const a1 = 2 * Math.PI - gridE.angle[j][q];
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
  const ends: [TensionEnd, TensionEnd] = [endInfo(1, pitTop ? "pit" : "groove", depthTop, straightTop), endInfo(-1, pitBot ? "pit" : "groove", depthBot, straightBot)];
  // 石の縁の高さの腕の幅の外へ、石がはみ出す長さ
  const seatWidth = Math.max(ends[0].contactWidthMm, ends[1].contactWidthMm) || w;
  const placedXs = hullPlaced.map((q) => q.x);
  const overhangMm = Math.max(0, Math.max(Math.abs(Math.min(...placedXs)), Math.abs(Math.max(...placedXs))) - seatWidth / 2);
  // 横から滑らせられるか：両はしとも、まっすぐな溝が腕の幅いっぱいに抜け、溝の奥より外へ出る所が石にない
  const placedYs = hull0.map((q) => q.y);
  const slides = straightTop && straightBot && Math.max(...placedYs) <= topMax + 1e-3 && Math.min(...placedYs) >= botMin - 1e-3;
  const info: TensionInfo = {
    wireLengthMm,
    mode: pose.mode,
    grip: pose.grip,
    grips: pose.grips,
    wireMm: t,
    culetBelowArmMm: wireBottomZ - (girdleZ + h.culetZ),
    tableBelowArmMm: wireTopZ - (girdleZ + h.tableZ),
    overhangMm,
    overhangRatio: overhangMm / seatWidth,
    slides,
    gapMm: gap,
    clearanceMm: clear,
    girdleZ,
    liftMm,
    rotationZ: pose.rotationZ,
    translateX: tx,
    translateY: ty,
    spanMm: spanY,
    cornerCount: pose.cornerCount,
    ends,
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
