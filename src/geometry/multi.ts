// 石を並べる指輪：並べ方（三石・横一列）と、となりの石・石座の間を測る処理。画面に依存しない純粋な関数。
// 座標は指輪の座標（ring.ts・shank.ts と同じ。mm、x が指の向き、z が上、指の軸は x 軸）。
// 石の場所は「腕のいちばん上から、腕の外側に沿って測った長さ（mm）」で表す（ring.ts の atMm）。
//
// 間の測り方：石と石座を、高さごとの輪を積んだ形で表す（石座の形を作るのと同じ縮み：setting.ts の settingScaleAt）。
// - 石：縁の形を、高さごとの縮み（stoneScaleAt）で重心へ縮めた輪（キューレットからテーブルまで）。
// - 石座：同じ縮みの輪を、外へ「すき間 ＋ 爪の太さ」（覆輪は すき間 ＋ 壁）ずらした輪（石座の下の端から縁の上まで）と、下の輪。
//   爪のない所も、爪の太さの分だけ地金があるとみなす（爪の間を通る線は狭めに測る＝安全の側）。
// 2 つの石の輪の点どうしのいちばん近い所を、まっすぐの距離で測る。片方の点が、もう片方の形の中にあれば重なり（負の値）。
import { GUIDES } from "../rules/guides";
import { buildSetting, settingScaleAt, type SettingParams, type SettingResult } from "./setting";
import { buildShank, type ShankParams } from "./shank";
import { outwardNormals } from "./offset";
import { contains, resample, toCounterClockwise, type Point } from "./polygon";
import { placePoint, type Orientation, type RingTransform } from "./ring";
import { girdleCenter, stoneHeights, stoneKnots, stoneScaleAt, type StoneParams } from "./stone";

type V3 = [number, number, number];
type HeadSetting = Omit<SettingParams, "stone" | "shankThicknessMm">;

/** 丸い石（ラウンド）。深さは直径 × 0.6（よくある例。測った値に直す） */
export function roundStone(diameterMm: number, depthRatio = 0.6, n = 96): StoneParams {
  const r = diameterMm / 2;
  const outlineMm = Array.from({ length: n }, (_, i) => ({ x: r * Math.cos((i / n) * Math.PI * 2), y: r * Math.sin((i / n) * Math.PI * 2) }));
  return { outlineMm, longMm: diameterMm, widthMm: diameterMm, depthMm: diameterMm * depthRatio };
}

/** 石を、形はそのまま k 倍の大きさにする（深さも同じ割合） */
export function scaleStone(s: StoneParams, k: number): StoneParams {
  return { ...s, outlineMm: s.outlineMm.map((p) => ({ x: p.x * k, y: p.y * k })), longMm: s.longMm * k, widthMm: s.widthMm * k, depthMm: s.depthMm * k };
}

/** 間を測るのに要る、置いた石 1 つ（PlacedStone の一部） */
export interface HeadShape {
  params: StoneParams;
  setting: SettingResult;
  transform: RingTransform;
}

/** 石座のいちばん外までの、縁の形からのずれ（mm）：爪留めは すき間 ＋ 爪の太さ、覆輪は すき間 ＋ 壁 */
export function headReachMm(setting: SettingResult): number {
  const cl = GUIDES.bezel.clearanceMm;
  return setting.style === "bezel" ? cl + (setting.bezel?.wallMm ?? GUIDES.bezel.wallMm) : cl + Math.max(0, ...setting.prongs.map((p) => p.diameterMm));
}

/** 高さごとの輪（その石の座標）。inside で、ある点がその高さの輪の中か調べる */
interface Stack {
  levels: { z: number; ring: Point[] }[];
  zMin: number;
  zMax: number;
}

function stackOf(base: Point[], normals: Point[], c: Point, zs: number[], scale: (z: number) => number, d: number): Stack {
  const levels = zs.map((z) => {
    const k = scale(z);
    return { z, ring: base.map((p, i) => ({ x: c.x + (p.x - c.x) * k + normals[i].x * d, y: c.y + (p.y - c.y) * k + normals[i].y * d })) };
  });
  return { levels, zMin: Math.min(...zs), zMax: Math.max(...zs) };
}

function insideStack(s: Stack, p: V3): boolean {
  if (p[2] < s.zMin || p[2] > s.zMax) return false;
  // いちばん近い高さの輪で調べる
  let best = s.levels[0];
  for (const l of s.levels) if (Math.abs(l.z - p[2]) < Math.abs(best.z - p[2])) best = l;
  return contains(best.ring, { x: p[0], y: p[1] });
}

/** 間を測るための点：指輪の座標の点と、その点のまわりの太さ（線の半径。輪の点は 0） */
interface Sample {
  p: V3;
  r: number;
}

export interface Envelope {
  stone: Sample[];
  metal: Sample[];
  stoneStack: Stack;
  metalStack: Stack;
  transform: RingTransform;
}

/** 高さを lo〜hi の間で n 段（両端をふくむ）に分ける */
const steps = (lo: number, hi: number, n: number) => Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));

export function envelopeOf(st: HeadShape, samples = 72): Envelope {
  const t = st.transform;
  const base = resample(toCounterClockwise(st.params.outlineMm), samples);
  const normals = outwardNormals(base);
  const c = girdleCenter(st.params.outlineMm);
  const h = stoneHeights(st.params);
  const k = stoneKnots(h);
  const sh = st.setting.heights;
  const stoneStack = stackOf(base, normals, c, [h.culetZ, k.pavilionMid, (k.pavilionMid + k.girdleBottom) / 2, k.girdleBottom, 0, k.girdleTop, k.crownMid, h.tableZ], (z) => stoneScaleAt(h, z), 0);
  const top = st.setting.style === "bezel" ? (st.setting.bezel?.topZ ?? k.girdleTop) : k.girdleTop;
  const metalStack = stackOf(base, normals, c, steps(sh.baseZ, top, 8), (z) => settingScaleAt(h, z), headReachMm(st.setting));
  const toRing = (s: Stack): Sample[] => s.levels.flatMap((l) => l.ring.map((q) => ({ p: placePoint(t, q.x, q.y, l.z), r: 0 })));
  const metal = toRing(metalStack);
  const lr = st.setting.lowerRail;
  if (lr) for (const [x, y, z] of lr.pts) metal.push({ p: placePoint(t, x, y, z), r: lr.radiusMm });
  return { stone: toRing(stoneStack), metal, stoneStack, metalStack, transform: t };
}

/** 指輪の座標の点を、その石の座標（石の縁の真ん中が z ＝ 0、向きの回転も戻す）へ */
function toStone(t: RingTransform, p: V3): V3 {
  const a = t.tiltRad ?? 0;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const y = p[1] * ca - p[2] * sa;
  const z = p[1] * sa + p[2] * ca - t.translateZ;
  const c = Math.cos(t.rotationZ);
  const s = Math.sin(t.rotationZ);
  return [p[0] * c + y * s, -p[0] * s + y * c, z];
}

/** 2 つの点の組の、いちばん近い所（太さを引いた距離・その 2 点の真ん中）。片方の点が、もう片方の形の中にあれば重なり（負） */
function closest(A: Sample[], B: Sample[], sa: Stack, sb: Stack, ta: RingTransform, tb: RingTransform): { gap: number; mid: V3 } {
  let best = Infinity;
  let mid: V3 = [0, 0, 0];
  for (const a of A)
    for (const b of B) {
      const d = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]) - a.r - b.r;
      if (d < best) {
        best = d;
        mid = [(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2, (a.p[2] + b.p[2]) / 2];
      }
    }
  const inside = (S: Sample[], other: Stack, to: RingTransform) => S.some((s) => s.r === 0 && insideStack(other, toStone(to, s.p)));
  if (inside(A, sb, tb) || inside(B, sa, ta)) best = -Math.abs(best);
  return { gap: best, mid };
}

export interface PairSpace {
  /** 石の番号（RingDesign.stones の番号。a < b） */
  a: number;
  b: number;
  /** 石どうしの間（mm。重なれば負） */
  stoneGapMm: number;
  stoneMid: V3;
  /** 石座の地金どうしの間（mm。重なれば負 ＝ 石座がつながる） */
  metalGapMm: number;
  metalMid: V3;
}

function pair(A: Envelope, B: Envelope): Omit<PairSpace, "a" | "b"> {
  const st = closest(A.stone, B.stone, A.stoneStack, B.stoneStack, A.transform, B.transform);
  const mt = closest(A.metal, B.metal, A.metalStack, B.metalStack, A.transform, B.transform);
  return { stoneGapMm: st.gap, stoneMid: st.mid, metalGapMm: mt.gap, metalMid: mt.mid };
}

/** となり合う石（腕に沿って並べた順で、となり）ごとの間 */
export function stoneSpaces(stones: readonly (HeadShape & { atMm: number })[]): PairSpace[] {
  if (stones.length < 2) return [];
  const env = stones.map((s) => envelopeOf(s));
  const order = stones.map((s, i) => ({ i, at: s.atMm })).sort((x, y) => x.at - y.at);
  const out: PairSpace[] = [];
  for (let k = 0; k + 1 < order.length; k++) {
    const a = Math.min(order[k].i, order[k + 1].i);
    const b = Math.max(order[k].i, order[k + 1].i);
    out.push({ a, b, ...pair(env[order[k].i], env[order[k + 1].i]) });
  }
  return out;
}

// ---- 並べ方 ----

/** 並べ方を探すときの、輪 1 つの点の数（形を作るための決まり） */
const LAYOUT_SAMPLES = 40;

/** 腕にのせる前の石座（形は作らない軽い石座。高さと爪の太さを知るため）と、その石の座標 */
function headAt(stone: StoneParams, head: HeadSetting, shank: ShankParams, orientation: Orientation) {
  const plain = buildShank(shank);
  const setting = buildSetting({ ...head, stone, shankThicknessMm: plain.thicknessMm, solid: false });
  const local: RingTransform = { rotationZ: orientation === "across" ? Math.PI / 2 : 0, translateZ: plain.innerRadiusMm - setting.heights.fingerZ };
  return { params: stone, setting, local, outerR: plain.outerRadiusMm };
}

/**
 * A をいちばん上に置き、B を腕に沿って + の側へ動かして、石座の間（つながらないときは地金どうし、石どうしも見る）が gap になる場所（mm）。
 * 間は、動かすほど広がるので、二分法で探す
 */
function spacingFor(A: ReturnType<typeof headAt>, B: ReturnType<typeof headAt>, gap: number): number {
  // 並べ方を探す間は、点を少なめにして速くする（確かめは細かい点で測り直す）
  const eA = envelopeOf({ params: A.params, setting: A.setting, transform: A.local }, LAYOUT_SAMPLES);
  const gapAt = (at: number) => {
    const eB = envelopeOf({ params: B.params, setting: B.setting, transform: { ...B.local, tiltRad: at / B.outerR } }, LAYOUT_SAMPLES);
    const p = pair(eA, eB);
    return Math.min(p.metalGapMm, p.stoneGapMm);
  };
  let lo = 0;
  let hi = 4 * (A.params.longMm + B.params.longMm);
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (gapAt(m) < gap) lo = m;
    else hi = m;
  }
  return hi;
}

/**
 * 三石：真ん中の石（いちばん上）の両脇に、同じ石を 1 つずつ。石座どうしの間が、既定の間（GUIDES.multi.layoutGapMm）＋ extra になる所。
 * 返すのは両脇の石の場所（mm、腕の外側に沿って。[−の側, ＋の側]）
 */
export function layoutTrio(center: StoneParams, side: StoneParams, head: HeadSetting, shank: ShankParams, extraMm = 0, orientation: Orientation = "along", sideHead: HeadSetting = head): [number, number] {
  const gap = GUIDES.multi.layoutGapMm + extraMm;
  const d = spacingFor(headAt(center, head, shank, orientation), headAt(side, sideHead, shank, orientation), gap);
  return [-d, d];
}

/** 横一列：同じ石を n 個、真ん中をいちばん上にして、石座どうしの間が既定の間 ＋ extra になるように並べる（場所の mm、−の側から） */
export function layoutRow(stone: StoneParams, n: number, head: HeadSetting, shank: ShankParams, extraMm = 0, orientation: Orientation = "along"): number[] {
  const gap = GUIDES.multi.layoutGapMm + extraMm;
  const h = headAt(stone, head, shank, orientation);
  const d = spacingFor(h, h, gap);
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * d);
}
