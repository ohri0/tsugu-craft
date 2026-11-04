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
function headAt(stone: StoneParams, head: HeadSetting, shank: ShankParams, orientation: Orientation, turnRad?: number) {
  const plain = buildShank(shank);
  const setting = buildSetting({ ...head, stone, shankThicknessMm: plain.thicknessMm, solid: false });
  const local: RingTransform = { rotationZ: turnRad ?? (orientation === "across" ? Math.PI / 2 : 0), translateZ: plain.innerRadiusMm - setting.heights.fingerZ };
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

/** 爪 1 本の中心の線（指輪の座標）と、爪の半径 */
export interface ProngLine {
  pts: V3[];
  r: number;
}

/**
 * 石座の爪の中心の線（指輪の座標）。爪は、縁の上の点から外へ「すき間 ＋ 爪の半径」の所を、
 * 石座と同じ縮み（settingScaleAt）で上下へたどった線（爪の下の端から先まで）。V 字の爪は使わないので、足 1 本の爪だけ
 */
export function prongLines(st: HeadShape, n = 12): ProngLine[] {
  if (st.setting.style !== "prong") return [];
  const ccw = toCounterClockwise(st.params.outlineMm);
  const c = girdleCenter(st.params.outlineMm);
  const h = stoneHeights(st.params);
  const k0 = settingScaleAt(h, 0) || 1;
  const sh = st.setting.heights;
  return st.setting.prongs.map((pr) => {
    const q = ccw[pr.index];
    const r = pr.diameterMm / 2;
    // 縁の高さの爪の中心 ＝ 縮めた縁の点 ＋ 外向き × ずれ。そのずれと向きを、縁の高さの点から取り出す
    const base = { x: c.x + (q.x - c.x) * k0, y: c.y + (q.y - c.y) * k0 };
    const dx = pr.point.x - base.x;
    const dy = pr.point.y - base.y;
    const zs = steps(sh.baseZ + r, pr.tipZ, n);
    const pts = zs.map((z) => {
      const k = settingScaleAt(h, z);
      return placePoint(st.transform, c.x + (q.x - c.x) * k + dx, c.y + (q.y - c.y) * k + dy, z);
    });
    return { pts, r };
  });
}

/** 2 つの石座の爪どうしの、いちばん近い所の間（mm。爪の太さを引いた値。当たれば負） */
export function prongGapMm(a: readonly ProngLine[], b: readonly ProngLine[]): number {
  let best = Infinity;
  for (const pa of a)
    for (const pb of b)
      for (const p of pa.pts) for (const q of pb.pts) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) - pa.r - pb.r);
  return best;
}

/** 爪が、となりの石（すき間をふくめて）に入りこむか */
function prongInStone(lines: readonly ProngLine[], other: HeadShape, samples = LAYOUT_SAMPLES): boolean {
  const base = resample(toCounterClockwise(other.params.outlineMm), samples);
  const normals = outwardNormals(base);
  const c = girdleCenter(other.params.outlineMm);
  const h = stoneHeights(other.params);
  const k = stoneKnots(h);
  return lines.some((l) => {
    const st = stackOf(base, normals, c, [h.culetZ, k.pavilionMid, k.girdleBottom, 0, k.girdleTop, k.crownMid, h.tableZ], (z) => stoneScaleAt(h, z), l.r + GUIDES.bezel.clearanceMm);
    return l.pts.some((p) => insideStack(st, toStone(other.transform, p)));
  });
}

/** 三石のとなりどうし（真ん中と脇）の間：石どうし・爪どうし（mm）と、爪がとなりの石に入りこむか */
export interface TrioClearance {
  stoneGapMm: number;
  prongGapMm: number;
  prongInStone: boolean;
}

export function trioClearance(a: HeadShape, b: HeadShape, samples = 72): TrioClearance {
  const eA = envelopeOf(a, samples);
  const eB = envelopeOf(b, samples);
  const st = closest(eA.stone, eB.stone, eA.stoneStack, eB.stoneStack, eA.transform, eB.transform);
  const la = prongLines(a);
  const lb = prongLines(b);
  return { stoneGapMm: st.gap, prongGapMm: prongGapMm(la, lb), prongInStone: prongInStone(la, b) || prongInStone(lb, a) };
}

/**
 * 三石：真ん中の石（いちばん上）の両脇に、同じ石を 1 つずつ。
 * 両脇の石座は真ん中の石座に寄せて、地金どうしはつなげる（ロウ付けで一つにする。ring.ts の joinHeads）。
 * 寄せる限り：石どうしの間が GUIDES.multi.trio.stoneGapMm ＋ extra、爪どうしの間が GUIDES.multi.trio.prongGapMm、
 * 爪がとなりの石に入りこまない（すき間をふくめて）。どれも、離すほど広がるので、二分法で探す。
 * sideTurnRad：＋の側の脇の石を上から見て回す角度（−の側は向きを返す。ペアの先を外へ向けるとき。なければ向きのとおり）。
 * 返すのは両脇の石の場所（mm、腕の外側に沿って。[−の側, ＋の側]）
 */
export function layoutTrio(center: StoneParams, side: StoneParams, head: HeadSetting, shank: ShankParams, extraMm = 0, orientation: Orientation = "along", sideHead: HeadSetting = head, sideTurnRad?: number): [number, number] {
  const g = GUIDES.multi.trio;
  const A = headAt(center, head, shank, orientation);
  const B = headAt(side, sideHead, shank, orientation, sideTurnRad);
  const a: HeadShape = { params: A.params, setting: A.setting, transform: A.local };
  const ok = (at: number) => {
    const b: HeadShape = { params: B.params, setting: B.setting, transform: { ...B.local, tiltRad: at / B.outerR } };
    const c = trioClearance(a, b, LAYOUT_SAMPLES);
    return !c.prongInStone && c.stoneGapMm >= g.stoneGapMm + extraMm && c.prongGapMm >= g.prongGapMm;
  };
  let lo = 0;
  let hi = 4 * (A.params.longMm + B.params.longMm);
  for (let i = 0; i < 22; i++) {
    const m = (lo + hi) / 2;
    if (ok(m)) hi = m;
    else lo = m;
  }
  return [-hi, hi];
}

/** 横一列：同じ石を n 個、真ん中をいちばん上にして、石座どうしの間が既定の間 ＋ extra になるように並べる（場所の mm、−の側から） */
export function layoutRow(stone: StoneParams, n: number, head: HeadSetting, shank: ShankParams, extraMm = 0, orientation: Orientation = "along"): number[] {
  const gap = GUIDES.multi.layoutGapMm + extraMm;
  const h = headAt(stone, head, shank, orientation);
  const d = spacingFor(h, h, gap);
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * d);
}
