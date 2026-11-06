// テンションの外れにくさ（浅く留めたいとき）。画面に依存しない。
// 作者の頼み（2026-11-07）：「こんぐらい浅いと厳しい？」「浅く留めたいなら、どれだけテンションが要る？」。
// 大まかな計算で、合否にしない。値の多くは仮（GUIDES.tension.holdDropMm・holdFriction・holdWallDeg）。最後は職人が決める。
//
// 考え方（docs/RESEARCH-tension.md の 14 節）：
// - 腕のばねの硬さ k（両はしを 1 mm 開くのに要る力）＝ E × I ÷（3π R³）。開ける量の式（elasticOpeningMm）と同じ、切れ目のある細い輪の式。
// - 石が出るには、腕が両はしの深さの和 e だけ、今より開かなければならない（石をまっすぐ押し出すとき。RESEARCH 2-1 節）。
//   詰めた量 s の分、腕ははじめから開かされている。そこから e だけ開かせる仕事 ＝ k × e ×（s ＋ e ÷ 2）。
//   - 深さで止める分（かかり）：k × e² ÷ 2。詰めなくても、これだけある。
//   - 詰めて足す分：k × e × s。深さがほとんどないと、いくら詰めても小さい（e をかけるので）。
//   - 摩擦で足す分：石は壁をすべり上がるので、こすれる分だけ多く要る。壁の傾き β・摩擦 μ で、全体に η ＝ tanβ（1 ＋ μ tanβ）÷（tanβ − μ）をかける。
// - 求める側：指輪を高さ h から落として石から当たると、腕の重さ m の勢い m × g × h が、石を押し出す向きにかかる、とみなす（いちばん悪い場合）。
// - 外れにくさ ÷ 求める側 が 1 以上なら「留まる見込み」。詰める量はばねの限界まで（広げて入れる量 e ＋ s が、太い輪の分を見た限界まで）。
import { elasticOpeningMm } from "./checks";
import { GUIDES, type Guides } from "./guides";
import { curvedWireFactor, type SpringMetalId, type SpringRow, type SpringTable } from "./tension-calc";

const G_MS2 = 9.81;

/** 腕のばねの硬さ（N/mm）：開いた輪の両はしを 1 mm 開く力。丸い線。細い輪の式 */
export function ringStiffnessNPerMm(radiusMm: number, wireMm: number, youngGpa: number): number {
  const i = (Math.PI * wireMm ** 4) / 64;
  return (youngGpa * 1000 * i) / (3 * Math.PI * radiusMm ** 3);
}

/** 壁をすべり上がるときの摩擦の割合 η（1 以上）。壁が摩擦より寝ているとき（tanβ ≤ μ）は、押しても出ない（Infinity） */
export function frictionFactor(wallDeg: number, mu: number): number {
  const t = Math.tan((wallDeg * Math.PI) / 180);
  return t <= mu ? Infinity : (t * (1 + mu * t)) / (t - mu);
}

/** 外れにくさの内わけ（N·mm ＝ mJ） */
export interface HoldWork {
  /** 深さで止める分 */
  lock: number;
  /** 詰めて足す分 */
  squeeze: number;
  /** 摩擦で足す分 */
  friction: number;
  total: number;
}

/** 深さの和 e・詰めた量 s で、石を押し出すのに要る仕事（N·mm） */
export function holdWork(kNPerMm: number, eMm: number, sMm: number, eta: number): HoldWork {
  const lock = (kNPerMm * eMm * eMm) / 2;
  const squeeze = kNPerMm * eMm * Math.max(0, sMm);
  const base = lock + squeeze;
  const friction = Number.isFinite(eta) ? base * (eta - 1) : Infinity;
  return { lock, squeeze, friction, total: base + friction };
}

/** 落としたときに受け止める仕事（N·mm）：腕の重さ（g）× 重力 × 高さ（mm） */
export function dropWorkNmm(massG: number, heightMm: number): number {
  return (massG / 1000) * G_MS2 * heightMm;
}

/** 留まる見込み／ぎりぎり・職人が確かめる／この地金・この太さでは足りない */
export type HoldVerdict = "hold" | "tight" | "short";
export const HOLD_VERDICT_LABEL: Record<HoldVerdict, string> = {
  hold: "留まる見込み",
  tight: "ぎりぎり・職人が確かめる",
  short: "この地金・この太さでは足りない",
};

export interface HoldSpring {
  /** 地金の名前・ヤング率（GPa）・開ける限界（細い輪の式。mm）・太い輪の割合 */
  name: string;
  youngGpa: number;
  limitMm: number;
  factor: number;
  provisional: boolean;
}

export interface HoldInput {
  /** 石の長さ（腕の周りの向き。mm）。図面の開き ＝ これ − 深さの和 */
  spanMm: number;
  radiusMm: number;
  wireMm: number;
  /** 腕の重さ（g） */
  massG: number;
  spring: HoldSpring;
  /** 両はしの深さの和（mm） */
  depthSumMm: number;
}

export interface HoldResult {
  depthSumMm: number;
  /** 図面の開き（mm） */
  gapMm: number;
  kNPerMm: number;
  eta: number;
  /** 落としたときに受け止める仕事（N·mm）と、落とす高さ（mm）・摩擦・壁の傾き（度） */
  demandNmm: number;
  dropMm: number;
  mu: number;
  wallDeg: number;
  /** 留めるのに要る詰める量（mm。深さが 0 なら Infinity） */
  needSqueezeMm: number;
  /** 腕が戻れる範囲で詰められる量：太い輪の分を見た量（safe）と、細い輪の式の上限（limit）。負なら広げて入れるだけで限界を超える */
  safeSqueezeMm: number;
  limitSqueezeMm: number;
  verdict: HoldVerdict;
  /** 作るときに詰める量（決めた量。なければ要る量。足りなければ太い輪の分の限界）と、作る時の開き・広げて入れる量（mm） */
  squeezeMm: number;
  makeGapMm: number;
  spreadMm: number;
  /** その詰める量での外れにくさの内わけと、求める側との比 */
  work: HoldWork;
  margin: number;
  /** この地金・この太さで、留まる見込みになるいちばん浅い深さの和（太い輪の分の限界まで詰めたとき。mm。どの深さでも足りなければ null）と、ぎりぎりの深さの和 */
  minDepthSumMm: number | null;
  minDepthSumTightMm: number | null;
}

/** 詰める量の限界まで詰めたとき、留まる見込みになるいちばん浅い深さの和：k η e（S − e ÷ 2）＝ W を e について解く */
function minDepthFor(capMm: number, demand: number, k: number, eta: number): number | null {
  if (!Number.isFinite(eta)) return 0;
  const d = capMm * capMm - (2 * demand) / (k * eta);
  if (capMm <= 0 || d < 0) return null;
  return capMm - Math.sqrt(d);
}

/** 深さの和と地金から、留めるのに要る詰める量・詰められる量・答え。squeezeMm を渡すと、その量で作ったときの外れにくさ */
export function tensionHold(input: HoldInput, g: Guides = GUIDES, squeezeMm?: number): HoldResult {
  const t = g.tension;
  const e = Math.max(0, input.depthSumMm);
  const k = ringStiffnessNPerMm(input.radiusMm, input.wireMm, input.spring.youngGpa);
  const eta = frictionFactor(t.holdWallDeg, t.holdFriction);
  const demand = dropWorkNmm(input.massG, t.holdDropMm);
  const safeMm = input.spring.limitMm / input.spring.factor;
  const safeSqueezeMm = safeMm - e;
  const limitSqueezeMm = input.spring.limitMm - e;
  const needSqueezeMm = e <= 1e-9 ? Infinity : !Number.isFinite(eta) ? 0 : Math.max(0, demand / (k * eta * e) - e / 2);
  const verdict: HoldVerdict = needSqueezeMm <= safeSqueezeMm + 1e-9 ? "hold" : needSqueezeMm <= limitSqueezeMm + 1e-9 ? "tight" : "short";
  const s = squeezeMm ?? (verdict === "short" ? Math.max(0, safeSqueezeMm) : needSqueezeMm);
  const gapMm = input.spanMm - e;
  const work = holdWork(k, e, s, eta);
  return {
    depthSumMm: e,
    gapMm,
    kNPerMm: k,
    eta,
    demandNmm: demand,
    dropMm: t.holdDropMm,
    mu: t.holdFriction,
    wallDeg: t.holdWallDeg,
    needSqueezeMm,
    safeSqueezeMm,
    limitSqueezeMm,
    verdict,
    squeezeMm: s,
    makeGapMm: gapMm - s,
    spreadMm: e + s,
    work,
    margin: demand > 0 ? work.total / demand : Infinity,
    minDepthSumMm: minDepthFor(safeMm, demand, k, eta),
    minDepthSumTightMm: minDepthFor(input.spring.limitMm, demand, k, eta),
  };
}

/** 地金ごとの値を、外れにくさの計算の形に */
export function holdSpringOf(row: Pick<SpringRow, "name" | "young" | "limitMm" | "provisional">, factor: number): HoldSpring {
  return { name: row.name, youngGpa: row.young.gpa, limitMm: row.limitMm, factor, provisional: row.provisional };
}

/** 地金の密度（腕の重さを、ほかの地金に置きかえるとき）。K18 の色は K18 イエローの密度 */
export function densityOf(metal: SpringMetalId, g: Guides = GUIDES): number {
  return metal === "pt900" ? g.metals.pt900.densityGPerCm3 : metal === "sv925" ? g.metals.sv925.densityGPerCm3 : g.metals.k18y.densityGPerCm3;
}

/** 浅く留めたいときの、ほかの手（同じ深さのまま、地金・線の太さを変えたら） */
export interface HoldOption {
  id: string;
  label: string;
  verdict: HoldVerdict;
  needSqueezeMm: number;
  safeSqueezeMm: number;
  provisional: boolean;
}

export interface TensionHoldSet {
  /** 今の地金・今の深さで、留めるのに要る量で作るとき */
  now: HoldResult;
  /** 今の地金・今の深さで、地金ごとの計算の「小さめに作る」量で作ったとき（足りなければ null） */
  atAppSqueeze: HoldResult | null;
  options: HoldOption[];
}

/**
 * 1 つの設計の、外れにくさの計算一式。table は tensionSpring の結果（硬い状態）、massG は今の腕の重さ（sourceMetal の重さ）、metal は計算する地金。
 * 深さは table の要る量（両はしの深さの和）
 */
export function tensionHoldSet(table: SpringTable, massG: number, metal: SpringMetalId, sourceMetal: SpringMetalId, g: Guides = GUIDES): TensionHoldSet {
  const row = table.rows.find((r) => r.metal === metal)!;
  const mass = (m: SpringMetalId) => (massG * densityOf(m, g)) / densityOf(sourceMetal, g);
  const base = { spanMm: table.spanMm, radiusMm: table.radiusMm, wireMm: table.wireMm, depthSumMm: table.needMm };
  const spring = holdSpringOf(row, table.factor);
  const now = tensionHold({ ...base, massG: mass(metal), spring }, g);
  const atAppSqueeze = row.shrinkMm === null ? null : tensionHold({ ...base, massG: mass(metal), spring }, g, row.shrinkMm);
  const options: HoldOption[] = [];
  // ほかの地金（同じ深さ・同じ太さ）
  for (const r of table.rows) {
    if (r.metal === metal) continue;
    const h = tensionHold({ ...base, massG: mass(r.metal), spring: holdSpringOf(r, table.factor) }, g);
    options.push({ id: `metal:${r.metal}`, label: r.name, verdict: h.verdict, needSqueezeMm: h.needSqueezeMm, safeSqueezeMm: h.safeSqueezeMm, provisional: r.provisional });
  }
  // 線を 0.5 mm 太くする（同じ地金。重さは断面と輪の径に比例、限界は太さに反比例、太い輪の割合も変わる）
  const d = table.wireMm + 0.5;
  if (d <= g.tension.wireMaxMm + 1e-9) {
    const radiusMm = table.radiusMm + 0.25;
    const m = g.tension.spring.metals[metal];
    const limitMm = elasticOpeningMm(radiusMm, d, m.young.gpa, m.hardened.proofMpa);
    const massD = mass(metal) * (d / table.wireMm) ** 2 * (radiusMm / table.radiusMm);
    const h = tensionHold({ ...base, radiusMm, wireMm: d, massG: massD, spring: { ...spring, limitMm, factor: curvedWireFactor(radiusMm, d) } }, g);
    options.push({ id: `wire:${d.toFixed(1)}`, label: `${row.name}・線 ø ${d.toFixed(1)} mm`, verdict: h.verdict, needSqueezeMm: h.needSqueezeMm, safeSqueezeMm: h.safeSqueezeMm, provisional: row.provisional });
  }
  return { now, atAppSqueeze, options };
}

/** 前提の一言（画面と作り方） */
export const HOLD_PREMISE =
  "外れにくさの目安：指輪を落として石から当たったとき、腕が石の深さの分だけ開かされる仕事で受け止められるか、の大まかな計算です。落とす高さ・摩擦・壁の傾きは仮の値です。合否にはしません。最後は職人が決めます";

/** 短い答えの文（作り方・図面） */
export function holdSummary(h: HoldResult, name: string): string {
  const need = Number.isFinite(h.needSqueezeMm) ? `約 ${h.needSqueezeMm.toFixed(2)} mm` : "決まらない（深さが 0）";
  return `${HOLD_VERDICT_LABEL[h.verdict]}（${name}・深さの和 ${h.depthSumMm.toFixed(2)} mm：留めるのに要る詰める量 ${need}、詰められる量 約 ${h.safeSqueezeMm.toFixed(2)} mm・上限 約 ${h.limitSqueezeMm.toFixed(2)} mm。落とす高さ ${(h.dropMm / 1000).toFixed(1)} m の仮の目安）`;
}

const r2 = (v: number | null) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

/** Claude が読む形 */
export function holdForClaude(set: TensionHoldSet) {
  const h = set.now;
  return {
    depth_sum_mm: r2(h.depthSumMm),
    drop_height_mm: h.dropMm,
    friction: h.mu,
    need_squeeze_mm: r2(h.needSqueezeMm),
    safe_squeeze_mm: r2(h.safeSqueezeMm),
    limit_squeeze_mm: r2(h.limitSqueezeMm),
    verdict: HOLD_VERDICT_LABEL[h.verdict],
    margin_at_calc_squeeze: set.atAppSqueeze ? r2(set.atAppSqueeze.margin) : null,
    shallowest_depth_sum_mm: r2(h.minDepthSumMm),
    other_ways: set.options.map((o) => ({ way: o.label, verdict: HOLD_VERDICT_LABEL[o.verdict], need_squeeze_mm: r2(o.needSqueezeMm), can_squeeze_mm: r2(o.safeSqueezeMm) })),
    note: `${HOLD_PREMISE}。落とす高さ（tension.holdDropMm）と摩擦（tension.holdFriction）は、職人が帳面で決められる。`,
  };
}
