// 石のない指輪の断面：見本の形（甲丸・平打ち・面取り など）と内甲丸（内側の丸み）から、閉じた断面の線を作る。画面に依存しない純粋な関数。
// 外の線は、腕の断面と同じ「なめらかな線」（src/geometry/shank.ts の SectionCurve）。手で描いた線も同じ形で持つ。
// 内の線は、両端を結ぶまっすぐな線（平ら）か、円の弧（内甲丸）。外の線がどんな形でも選べる（資料：https://zexy.net/article/app002512006/ ）。
// 高さ h は指の円からの距離（mm）。内の線のいちばん指に近い所が h ＝ 0 で、号の内径はここで測る（内甲丸の端は指から離れる）。
// 名前と形の出どころ：甲丸・平甲丸・平打ち・内甲丸は上の資料。丸線・角は腕の断面と同じ呼び方。かまぼこは前からの呼び名
//（辞書では甲丸の別名でもある。作者に確かめる）。面取り・山形・V 溝・段つき・くぼみは形の説明で、名前の出どころはない。
import { evalCurve, joinCurves, adaptiveParams, sampleCurve, uniformKnots, type P2 } from "../geometry/bspline";
import { SECTION_SHAPE, curveFromHalf, curveKnots, normalizeCurve, sectionControlPoints, type SectionCurve } from "../geometry/shank";
import { GUIDES } from "../rules/guides";
import type { LoopPt } from "./solid";

export type SectionKind = "kouman" | "hirauchi" | "kamaboko" | "hirakouman" | "kaku" | "maru" | "mentori" | "yamagata" | "vmizo" | "dan" | "kubomi" | "free";
export type PresetKind = Exclude<SectionKind, "free">;

export interface SectionInfo {
  id: PresetKind;
  label: string;
  /** ふつうの言葉の説明 */
  plain: string;
  /** 手で作るときの材料の線の名前 */
  wire: string;
  /** 線のままでは出ない形を、どう作るか（手で作るとき。線のままで出る形にはない） */
  carve?: string;
}

/** 断面の見本（画面に並べる順。丸い形から平らな形へ、そのあとに飾りのある形） */
export const SECTION_LIST: readonly SectionInfo[] = [
  { id: "kouman", label: "甲丸", plain: "外が丸く、内は平ら。指当たりがやさしい、いちばん多い形", wire: "甲丸線か平角線" },
  { id: "kamaboko", label: "かまぼこ", plain: "甲丸より低い、ゆるい丸み。横は少し立つ", wire: "甲丸線か平角線" },
  { id: "hirakouman", label: "平甲丸", plain: "甲丸と平打ちの中間。面は平らに近く、角を丸く削る", wire: "平角線", carve: "角をヤスリで丸く落とす" },
  { id: "hirauchi", label: "平打ち", plain: "四角い形。面が平らで、角が立つ。彫りが映える", wire: "平角線" },
  { id: "kaku", label: "角", plain: "幅と厚みが同じくらいの四角（角線）", wire: "角線" },
  { id: "maru", label: "丸線", plain: "断面がまん丸。内側も丸い", wire: "丸線" },
  { id: "mentori", label: "面取り", plain: "平打ちの角を、斜めに落とした形", wire: "平角線", carve: "角をヤスリで斜めに落とす" },
  { id: "yamagata", label: "山形", plain: "真ん中がとがる屋根の形（V 字を逆さにした形）", wire: "平角線", carve: "真ん中を残して、両側をヤスリで斜めに落とす" },
  { id: "vmizo", label: "V 溝", plain: "平らな面の真ん中に、V 字の溝", wire: "平角線", carve: "面の真ん中に、V 字の溝を切る" },
  { id: "dan", label: "段つき", plain: "真ん中が高く、両わきが一段低い", wire: "平角線", carve: "両わきを、一段低く削る" },
  { id: "kubomi", label: "くぼみ", plain: "面がゆるくへこむ。縁が高く、真ん中が低い", wire: "平角線", carve: "面をゆるくへこませる" },
];

const BY_ID = new Map(SECTION_LIST.map((s) => [s.id, s]));
export const sectionInfo = (k: PresetKind): SectionInfo => BY_ID.get(k)!;
export const SECTION_LABEL: Record<SectionKind, string> = { ...(Object.fromEntries(SECTION_LIST.map((s) => [s.id, s.label])) as Record<PresetKind, string>), free: "手で描いた形" };
export const isSectionKind = (v: unknown): v is SectionKind => v === "free" || BY_ID.has(v as PresetKind);

interface Part {
  pts: P2[];
  knots: number[];
}
const line = (a: P2, b: P2): Part => ({ pts: [0, 1, 2, 3].map((i) => ({ x: a.x + ((b.x - a.x) * i) / 3, y: a.y + ((b.y - a.y) * i) / 3 })), knots: uniformKnots(4) });
const spline = (pts: P2[]): Part => ({ pts, knots: uniformKnots(pts.length) });
const polyLen = (pts: readonly P2[]) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0);
/** 折れ目（角）でつないだ線を、そろえた線にする */
function joined(parts: Part[]): SectionCurve {
  const r = joinCurves(parts, parts.map((p) => polyLen(p.pts)));
  return normalizeCurve({ points: r.pts, knots: r.knots });
}
/** 折れ線（どの辺もまっすぐ、どの点も角）の線 */
const lines = (...v: P2[]): SectionCurve => joined(v.slice(1).map((p, i) => line(v[i], p)));

/**
 * 見本の外の線（そろえた線：幅の端が ±1、いちばん高い所が 1）。heightMm は、外の線の端からいちばん高い所まで（厚み − 内側の丸み）。
 * 角や溝の大きさは mm で決める（幅や厚みを変えても、角が大きくならない）
 */
export function bandCurve(kind: PresetKind, widthMm: number, heightMm: number): SectionCurve {
  const hw = widthMm / 2;
  const h = heightMm;
  const s = GUIDES.band.sectionShape;
  const cap = (mm: number) => Math.min(mm, s.limitRatio * Math.min(widthMm, h));
  switch (kind) {
    case "kouman":
    case "maru":
      return curveFromHalf(sectionControlPoints("kouman"));
    case "kamaboko":
      return curveFromHalf([{ x: 0, y: 1.05 }, { x: 0.62, y: 0.98 }, { x: 0.98, y: 0.74 }, { x: 1, y: 0.5 }, { x: 1, y: 0.25 }, { x: 1, y: 0 }]);
    case "hirakouman":
      return curveFromHalf(sectionControlPoints("hirauchi"));
    case "hirauchi":
    case "kaku": {
      // 角の点のとなりの点を近くに置くと、角だけが小さく丸い線になる（上と横はまっすぐ）
      const e = cap(s.edgeMm);
      const dx = e / hw;
      const dy = e / h;
      return curveFromHalf([{ x: 0, y: 1 }, { x: (1 - dx) / 2, y: 1 }, { x: 1 - dx, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 1 - dy }, { x: 1, y: (1 - dy) / 2 }, { x: 1, y: 0 }]);
    }
    case "mentori": {
      const c = cap(s.chamferMm);
      return lines({ x: hw, y: 0 }, { x: hw, y: h - c }, { x: hw - c, y: h }, { x: c - hw, y: h }, { x: -hw, y: h - c }, { x: -hw, y: 0 });
    }
    case "yamagata": {
      const e = h * s.ridgeRatio;
      return lines({ x: hw, y: 0 }, { x: hw, y: e }, { x: 0, y: h }, { x: -hw, y: e }, { x: -hw, y: 0 });
    }
    case "vmizo": {
      const g = Math.min(s.grooveHalfMm, hw * 0.4);
      const v = cap(s.grooveDepthMm);
      return lines({ x: hw, y: 0 }, { x: hw, y: h }, { x: g, y: h }, { x: 0, y: h - v }, { x: -g, y: h }, { x: -hw, y: h }, { x: -hw, y: 0 });
    }
    case "dan": {
      const a = hw * s.stepTopRatio;
      const u = cap(s.stepMm);
      return lines({ x: hw, y: 0 }, { x: hw, y: h - u }, { x: a, y: h - u }, { x: a, y: h }, { x: -a, y: h }, { x: -a, y: h - u }, { x: -hw, y: h - u }, { x: -hw, y: 0 });
    }
    case "kubomi": {
      // 3 次の線の真ん中は、中の 2 点の 3/4 まで下がる
      const k = cap(s.hollowMm) / 0.75;
      return joined([line({ x: hw, y: 0 }, { x: hw, y: h }), spline([{ x: hw, y: h }, { x: hw / 3, y: h - k }, { x: -hw / 3, y: h - k }, { x: -hw, y: h }]), line({ x: -hw, y: h }, { x: -hw, y: 0 })]);
    }
  }
}

/**
 * 手で描いた線が、見本のどれかと同じ形か（元に戻したときに、見本の名前に戻すため）。同じ形がなければ null。
 * 許す差は、断面の画面が「同じ形」と見る差と同じ（そろえた点で 0.005）
 */
export function matchPreset(c: SectionCurve, widthMm: number, heightMm: number): PresetKind | null {
  for (const s of SECTION_LIST) {
    const p = bandCurve(s.id, widthMm, heightMm).points;
    if (p.length === c.points.length && p.every((v, i) => Math.abs(v.x - c.points[i].x) < 0.005 && Math.abs(v.y - c.points[i].y) < 0.005)) return s.id;
  }
  return null;
}

/** 断面（外の線・幅・厚み・内側の丸み） */
export interface SectionSpec {
  curve: SectionCurve;
  widthMm: number;
  /** いちばん指に近い所から、いちばん高い所まで（mm） */
  thicknessMm: number;
  /** 内甲丸の丸みの深さ（mm。内の線の真ん中と端の高さの差）。0 なら内側は平ら */
  innerMm: number;
}

/** 外の線に残す高さの最低（mm。内側を丸くしても、外の線がつぶれないように。形を作るための決まり） */
const MIN_OUTER_MM = 0.3;
/** 内の線の丸みの、使える深さ（半円まで。外の線がつぶれない所まで） */
export function innerLimit(widthMm: number, thicknessMm: number): number {
  return Math.max(0, Math.min(widthMm / 2, thicknessMm - MIN_OUTER_MM));
}
const usedInner = (s: SectionSpec) => Math.min(Math.max(0, s.innerMm), innerLimit(s.widthMm, s.thicknessMm));

/** 内の線を分ける数の目安（形を作るための決まり）：平らなら少なく、弧は 8 度ごと。真ん中に点が来るよう偶数 */
const FLAT_STEPS = 6;
const ARC_STEP_DEG = 8;
function innerSteps(widthMm: number, depthMm: number): number {
  if (depthMm < 1e-6) return FLAT_STEPS;
  const c = widthMm / 2;
  const R = (c * c + depthMm * depthMm) / (2 * depthMm);
  const n = Math.ceil(((2 * Math.atan2(c, R - depthMm)) * 180) / Math.PI / ARC_STEP_DEG);
  return Math.max(FLAT_STEPS, n + (n % 2));
}

/**
 * 内の線（左の端 xL → 右の端 xR、両端をふくむ）。y は外の線の端の高さからの差で、0 以下（真ん中がいちばん低く −depthMm）。
 * 3D の高さにも、断面を描く画面にも使う
 */
export function innerArc(xL: number, xR: number, depthMm: number, steps = innerSteps(xR - xL, depthMm)): P2[] {
  const c = Math.max(1e-6, (xR - xL) / 2);
  const xc = (xL + xR) / 2;
  const d = Math.min(depthMm, c);
  const out: P2[] = [];
  if (d < 1e-6) {
    for (let i = 0; i <= steps; i++) out.push({ x: xL + ((xR - xL) * i) / steps, y: 0 });
    return out;
  }
  const R = (c * c + d * d) / (2 * d);
  const a = Math.atan2(c, R - d);
  for (let i = 0; i <= steps; i++) {
    const th = -a + (2 * a * i) / steps;
    out.push({ x: i === 0 ? xL : i === steps ? xR : xc + R * Math.sin(th), y: i === 0 || i === steps ? 0 : R - d - R * Math.cos(th) });
  }
  return out;
}

/** 小さい順にして、同じ値を 1 つにする */
const uniq = (v: number[]) => [...v].sort((a, b) => a - b).filter((x, i, a) => i === 0 || x - a[i - 1] > 1e-9);

/**
 * 外の線に点を置く、向きの変わりの目安（度。形を作るための決まり）。指が動いている間も形を作り直すので、腕の断面（3 度）より少し粗く。
 * 半径 1.5 mm の丸みで、線と本当の丸みの差は約 0.001 mm
 */
const TURN_DEG = 5;

/**
 * 外の線の t の並び（曲がる所ほど細かく。角の点をふくむ）。線の真ん中は必ず入れる
 * （左右対称の線では、いちばん高い所か、溝の底。そこが抜けると厚みが少し足りなくなる）
 */
const tsOf = (c: SectionCurve) => uniq([...adaptiveParams(c.points, curveKnots(c), TURN_DEG, SECTION_SHAPE.stepLen).map((s) => s.t), 0.5]);

const sameKnots = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

/** 線の長さの割合 s ↔ t の表（そろえた線の上で。adaptiveParams と同じ細かさなので、残した点の t は表の中にある） */
function arcTable(c: SectionCurve): { t: number[]; s: number[] } {
  const d = sampleCurve(c.points, curveKnots(c), 96);
  const s = [0];
  for (let i = 1; i < d.length; i++) s.push(s[i - 1] + Math.hypot(d[i].p.x - d[i - 1].p.x, d[i].p.y - d[i - 1].p.y));
  const total = s[s.length - 1] || 1;
  return { t: d.map((x) => x.t), s: s.map((v) => v / total) };
}
const lookup = (from: number[], to: number[], v: number): number => {
  let lo = 0;
  let hi = from.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (from[m] <= v) lo = m;
    else hi = m;
  }
  if (from[hi] <= v) return to[hi];
  const f = from[hi] - from[lo] < 1e-12 ? 0 : (v - from[lo]) / (from[hi] - from[lo]);
  return to[lo] + (to[hi] - to[lo]) * f;
};

/** 2 本の外の線の、対応する t の並び（同じ番号の点どうしが、指のまわりでつながる） */
function matchedTs(a: SectionCurve, b: SectionCurve): [number[], number[]] {
  if (a === b) {
    const t = tsOf(a);
    return [t, t];
  }
  if (sameKnots(curveKnots(a), curveKnots(b))) {
    const t = uniq([...tsOf(a), ...tsOf(b)]);
    return [t, t];
  }
  // 節がちがう線は、線の長さの割合でそろえる。どちらの線の角の点も残す
  const ta = arcTable(a);
  const tb = arcTable(b);
  const s = uniq([...tsOf(a).map((t) => lookup(ta.t, ta.s, t)), ...tsOf(b).map((t) => lookup(tb.t, tb.s, t))]);
  return [s.map((v) => lookup(ta.s, ta.t, v)), s.map((v) => lookup(tb.s, tb.t, v))];
}

function loopOf(spec: SectionSpec, ts: readonly number[], steps: number): LoopPt[] {
  const c = spec.curve;
  const u = curveKnots(c);
  const hw = spec.widthMm / 2;
  const d = usedInner(spec);
  const outerH = spec.thicknessMm - d;
  const outer = ts.map((t) => {
    const p = evalCurve(c.points, u, t);
    return { x: p.x * hw, h: d + Math.max(0, p.y) * outerH };
  });
  const arc = innerArc(outer[outer.length - 1].x, outer[0].x, d, steps);
  return [...outer, ...arc.slice(1, -1).map((p) => ({ x: p.x, h: d + p.y }))];
}

/** 2 つの断面を、同じ点の数の閉じた線にする（外の線 右の端 → 上 → 左の端、内の線 左 → 右）。同じ番号の点どうしが、指のまわりでつながる */
export function matchLoops(a: SectionSpec, b: SectionSpec): [LoopPt[], LoopPt[]] {
  const [ta, tb] = matchedTs(a.curve, b.curve);
  const steps = Math.max(innerSteps(a.widthMm, usedInner(a)), innerSteps(b.widthMm, usedInner(b)));
  const la = loopOf(a, ta, steps);
  return [la, a === b ? la : loopOf(b, tb, steps)];
}

/** 1 つの断面の閉じた線 */
export const sectionLoop = (s: SectionSpec): LoopPt[] => matchLoops(s, s)[0];

/**
 * 局所の薄さを確かめるための線（h を y に）。内側が平らなら外の線だけ（指の側は両端を結ぶ線）。
 * 内甲丸なら、内の線の真ん中から始まって 1 周し、真ん中へ戻る線（端の点の角度を、形の中の線どうしで測るため）
 */
export function thinOutline(s: SectionSpec): P2[] {
  const ts = tsOf(s.curve);
  const d = usedInner(s);
  const steps = innerSteps(s.widthMm, d);
  const loop = loopOf(s, ts, steps).map((p) => ({ x: p.x, y: p.h }));
  const outerCount = ts.length;
  if (d < 1e-6) return loop.slice(0, outerCount);
  const mid = outerCount + steps / 2 - 1;
  return [...loop.slice(mid), ...loop.slice(0, mid), loop[mid]];
}

/** 閉じた線の、幅の位置 x での下と上の高さ */
function spanAt(loop: readonly LoopPt[], x: number): { lo: number; hi: number } | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    if ((a.x - x) * (b.x - x) > 0 || a.x === b.x) continue;
    const h = a.h + ((b.h - a.h) * (x - a.x)) / (b.x - a.x);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  return hi >= lo ? { lo, hi } : null;
}

/** 溝やくぼみと数える深さ（mm。両側の厚い所より、これだけ薄い所。形を作るための決まり） */
const VALLEY_DEPTH_MM = 0.1;
/**
 * 溝やくぼみの底（両側より薄い所）の、いちばん薄い厚みと場所。なければ null。
 * 端へ向かって薄くなるだけの形（甲丸の端、内甲丸の端）は数えない
 */
export function valleyOf(s: SectionSpec): { xMm: number; thicknessMm: number } | null {
  const loop = sectionLoop(s);
  const xs = loop.map((p) => p.x);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const n = 80;
  const row: { x: number; t: number }[] = [];
  for (let i = 1; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const sp = spanAt(loop, x);
    if (sp) row.push({ x, t: sp.hi - sp.lo });
  }
  let best: { xMm: number; thicknessMm: number } | null = null;
  row.forEach((r, i) => {
    const left = Math.max(...row.slice(0, i + 1).map((q) => q.t));
    const right = Math.max(...row.slice(i).map((q) => q.t));
    if (left - r.t >= VALLEY_DEPTH_MM && right - r.t >= VALLEY_DEPTH_MM && (!best || r.t < best.thicknessMm)) best = { xMm: r.x, thicknessMm: r.t };
  });
  return best;
}

const pct = (v: number) => v.toFixed(3);
/** 断面の絵（SVG の path の d）。x は mm、y は上下を返した高さ（mm） */
export function sectionPath(loop: readonly LoopPt[]): string {
  return `M${loop.map((p) => `${pct(p.x)} ${pct(-p.h)}`).join("L")}Z`;
}
