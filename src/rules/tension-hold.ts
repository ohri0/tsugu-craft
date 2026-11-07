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
// - 広げたあと戻りきらない分（2026-11-07 作者の声。src/rules/tension-set.ts・RESEARCH 15 節。仮）：石を入れたあとの締まりは、縮めた量 − 戻りきらない分。
//   答えはこの締まりで決め、作り方は戻りきらない分を見込んで縮める（作る時の開きをその分だけ狭く）。
import { GUIDES, type Guides } from "./guides";
import { type SpringMetalId, type SpringRow, type SpringTable } from "./tension-calc";
import {
  compensateSet,
  curvedWireFactor,
  dropWorkNmm,
  elasticOpeningMm,
  frictionFactor,
  holdWork,
  needSqueezeMm as needFor,
  permanentSetMm,
  planAt,
  ringStiffnessNPerMm,
  setCurve,
  tensionAdvice,
  type HoldWork,
  type SetCurve,
  type TensionAdvice,
} from "./tension-set";

// 式は src/rules/tension-set.ts（形の側からも読むので、そこに置いた）。前からの名前で読めるように
export { dropWorkNmm, frictionFactor, holdWork, ringStiffnessNPerMm, type HoldWork };

/**
 * 留まる見込み／留まる見込み（広げる量は安全な目安をこえる）／この地金・この太さでは足りない。
 * tight は前は「ぎりぎり・職人が確かめる」。作者の声（2026-11-08）：「結局職人が確かめてるんかい」。
 * 計算はもう、どうすれば留まるか（石より狭く作り、石が入るだけ広げて入れ、戻る力ではさむ）を知っているので、それを言う。
 * そのあと「限界まで広げて入れれば」も直した（作者の声 2026-11-08）：「限界いっぱい」ではなく、石がぎりぎり入るだけ広げる。広げすぎると戻らない。
 * さらに「ぎりぎり入れれば、留まる見込み」という言い方も要らない（作者の声 2026-11-08）。札の見出しは、作り方そのもの
 * （holdHeadline：「石より 0.76 mm 狭く作り、1.56 mm 広げて入れる」）。余裕が少ないことは、すぐ下の「安全に留めるなら」の案が示す。
 * ここの言葉は、一覧や道具の答えに使う短い言い方。
 * 戻りきらない分の値は仮なので、それは小さな字と「式と前提」に書く（holdTightNote）
 */
export type HoldVerdict = "hold" | "tight" | "short";
export const HOLD_VERDICT_LABEL: Record<HoldVerdict, string> = {
  hold: "留まる見込み",
  tight: "留まる見込み（広げる量は安全な目安をこえる）",
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
  /** 石を留めるのに、石を入れたあとに残っていてほしい締まり（mm。深さが 0 なら Infinity） */
  needSqueezeMm: number;
  /**
   * 広げる量が太い輪の分を見た限界（safe）・細い輪の式の限界（limit）に届くまで縮めたときの、作るときに縮める量。負なら広げて入れるだけで限界を超える。
   * 戻りきらない分は引いていない（引いた量は safeEffectiveMm・limitEffectiveMm）
   */
  safeSqueezeMm: number;
  limitSqueezeMm: number;
  /**
   * 戻りきらない分を引いた、石を入れたあとに残せる締まりの最大：安全に（広げる量が safe まで）と、限界まで（広げる量が limit まで）。
   * 要る量が safeEffectiveMm の内なら「留まる見込み」。超えても limitSqueezeMm（戻りきらない分を見ない前の計算）の内なら tight（広げる量は安全な目安をこえる）
   */
  safeEffectiveMm: number;
  limitEffectiveMm: number;
  verdict: HoldVerdict;
  /**
   * 作るときに縮める量（決めた量。なければ、戻りきらない分を見込んで、要る量が残る量。足りなければ安全な限界まで広げる量）と、
   * 作る時の開き・広げて入れる量（mm）
   */
  squeezeMm: number;
  makeGapMm: number;
  spreadMm: number;
  /** 広げたあと、戻りきらずに開いたまま残る量（mm）と、石を入れたあとに残る締まり（縮める量 − 残る量。負なら石との間にすき間） */
  setMm: number;
  effectiveSqueezeMm: number;
  /** 戻りきらない分の線（残りはじめ・限界・割合） */
  curve: SetCurve;
  /** 戻りきらない分を見込まずに、要る量だけ縮めて作ったとき（前の計算の作り方）。深さが 0 なら null */
  naive: { squeezeMm: number; spreadMm: number; setMm: number; effectiveSqueezeMm: number; margin: number } | null;
  /** その詰める量での外れにくさの内わけ（残る締まりで）と、求める側との比 */
  work: HoldWork;
  margin: number;
  /** この地金・この太さで、留まる見込みになるいちばん浅い深さの和（戻りきらない分を見込み、安全な限界まで広げたとき。mm。どの深さでも足りなければ null）と、ぎりぎりの深さの和（前の計算：限界まで、戻りきらない分なし） */
  minDepthSumMm: number | null;
  minDepthSumTightMm: number | null;
}

/** 締まりを残せる最大 C（深さの和をふくむ。広げる量の限界 − 戻りきらない分）で、留まる見込みになるいちばん浅い深さの和：k η e（C − e ÷ 2）＝ W を e について解く */
function minDepthFor(capMm: number, demand: number, k: number, eta: number): number | null {
  if (!Number.isFinite(eta)) return 0;
  const d = capMm * capMm - (2 * demand) / (k * eta);
  if (capMm <= 0 || d < 0) return null;
  return capMm - Math.sqrt(d);
}

/**
 * 深さの和と地金から、石より狭く作る量（要る分）・狭くできる量・答え。squeezeMm を渡すと、その量で作ったときの外れにくさ。
 * 広げたあと戻りきらない分（src/rules/tension-set.ts。仮）を入れる：答えは、戻りきらない分を引いた残る締まりで決める
 */
export function tensionHold(input: HoldInput, g: Guides = GUIDES, squeezeMm?: number): HoldResult {
  const t = g.tension;
  const e = Math.max(0, input.depthSumMm);
  const k = ringStiffnessNPerMm(input.radiusMm, input.wireMm, input.spring.youngGpa);
  const eta = frictionFactor(t.holdWallDeg, t.holdFriction);
  const demand = dropWorkNmm(input.massG, t.holdDropMm);
  const limitMm = input.spring.limitMm;
  const safeMm = limitMm / input.spring.factor;
  const curve = setCurve(safeMm, limitMm, t.springSetRatio);
  const safeSqueezeMm = safeMm - e;
  const limitSqueezeMm = limitMm - e;
  const safeEffectiveMm = safeSqueezeMm - permanentSetMm(safeMm, curve);
  const limitEffectiveMm = limitSqueezeMm - permanentSetMm(limitMm, curve);
  const needSqueezeMm = needFor(e, demand, k, eta);
  // 留まる見込み：戻りきらない分を見込んで、安全な限界までに要る量が残る。
  // 限界まで広げれば：そうはならないが、限界まで広げて戻りきらない分が出なければ（前の計算）届く。戻りきらない分の値は仮なので、小さな字に書く
  const verdict: HoldVerdict = needSqueezeMm <= safeEffectiveMm + 1e-9 ? "hold" : needSqueezeMm <= limitSqueezeMm + 1e-9 ? "tight" : "short";
  const plan =
    squeezeMm !== undefined
      ? planAt(e, squeezeMm, curve)
      : verdict === "hold"
        ? compensateSet(e, needSqueezeMm, curve, safeMm)!
        : verdict === "tight"
          ? // 限界まで広げて入れる作り方。戻りきらない分（仮）を見込んでも届けばその量、届かなければ限界いっぱいまで広げる量（2026-11-08）
            (compensateSet(e, needSqueezeMm, curve, limitMm) ?? planAt(e, Math.max(0, limitSqueezeMm), curve))
          : planAt(e, Math.max(0, safeSqueezeMm), curve);
  const gapMm = input.spanMm - e;
  const work = holdWork(k, e, plan.effectiveMm, eta);
  const marginOf = (w: HoldWork) => (demand > 0 ? w.total / demand : Infinity);
  const naivePlan = Number.isFinite(needSqueezeMm) ? planAt(e, needSqueezeMm, curve) : null;
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
    safeEffectiveMm,
    limitEffectiveMm,
    verdict,
    squeezeMm: plan.squeezeMm,
    makeGapMm: gapMm - plan.squeezeMm,
    spreadMm: plan.spreadMm,
    setMm: plan.setMm,
    effectiveSqueezeMm: plan.effectiveMm,
    curve,
    naive: naivePlan ? { squeezeMm: naivePlan.squeezeMm, spreadMm: naivePlan.spreadMm, setMm: naivePlan.setMm, effectiveSqueezeMm: naivePlan.effectiveMm, margin: marginOf(holdWork(k, e, naivePlan.effectiveMm, eta)) } : null,
    work,
    margin: marginOf(work),
    minDepthSumMm: minDepthFor(safeMm - permanentSetMm(safeMm, curve), demand, k, eta),
    minDepthSumTightMm: minDepthFor(limitMm, demand, k, eta),
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
  /** 戻りきらない分を引いて、安全に残せる締まり（mm） */
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
    options.push({ id: `metal:${r.metal}`, label: r.name, verdict: h.verdict, needSqueezeMm: h.needSqueezeMm, safeSqueezeMm: h.safeEffectiveMm, provisional: r.provisional });
  }
  // 線を 0.5 mm 太くする（同じ地金。重さは断面と輪の径に比例、限界は太さに反比例、太い輪の割合も変わる）
  const d = table.wireMm + 0.5;
  if (d <= g.tension.wireMaxMm + 1e-9) {
    const radiusMm = table.radiusMm + 0.25;
    const m = g.tension.spring.metals[metal];
    const limitMm = elasticOpeningMm(radiusMm, d, m.young.gpa, m.hardened.proofMpa);
    const massD = mass(metal) * (d / table.wireMm) ** 2 * (radiusMm / table.radiusMm);
    const h = tensionHold({ ...base, radiusMm, wireMm: d, massG: massD, spring: { ...spring, limitMm, factor: curvedWireFactor(radiusMm, d) } }, g);
    options.push({ id: `wire:${d.toFixed(1)}`, label: `${row.name}・線 ø ${d.toFixed(1)} mm`, verdict: h.verdict, needSqueezeMm: h.needSqueezeMm, safeSqueezeMm: h.safeEffectiveMm, provisional: row.provisional });
  }
  return { now, atAppSqueeze, options };
}

/**
 * 画面・作り方・図面の表題欄で使う言葉（作者の声 2026-11-07：「留めるのに要る詰める量」「詰められる量（太い輪の分）」「詰められる上限（細い輪の式）」が分かりにくい）。
 * 2026-11-08 作者の声：「止めるのに縮める量」「安全に縮められる量」「縮められる限界」もまだ分かりにくい。
 * 本当の手順（石より狭く作る → 広げて石を入れる → 戻る力ではさむ）に沿う言葉にした。言葉はここ 1 か所
 */
export const HOLD_WORDS = {
  /** 留めるのに要る締まり（needSqueezeMm）。前は「石を留めるのに縮める量」 */
  need: "石より狭く作る量（要る分）",
  /** 腕が戻れる範囲で狭くできる量・太い輪の分（safeSqueezeMm）。前は「安全に縮められる量」 */
  safe: "狭くできる量（広げても戻る範囲）",
  /** 狭くできる限界・細い輪の式（limitSqueezeMm）。前は「縮められる限界」 */
  limit: "狭くできる限界（広げて戻る限界）",
  /** 図面の開き（石が入ったとき） */
  gap: "図面の開き",
  /** 作る時の開き（makeGapMm） */
  make: "作る時の開き",
  /** 広げて入れる量（spreadMm） */
  spread: "石を入れる時に広げる量",
  /** 広げられる限界（細い輪の式。limitMm） */
  spreadLimit: "広げられる限界",
  /** 広げたあと戻りきらない分（setMm。作者の声 2026-11-07「1 に戻るんじゃなくて 1.2 とか」） */
  set: "広げたあと、戻りきらずに開いたまま残る量",
  /** 戻りきらない分を見込んだ作る時の開き（makeGapMm） */
  makeWithSet: "戻りきらない分を見込んだ、作る時の開き",
  /** 深さと開きのおすすめ（tensionAdvice） */
  advice: "おすすめ",
} as const;

/** 前提の一言（画面と作り方） */
export const HOLD_PREMISE =
  "外れにくさの目安：指輪を落として石から当たったとき、腕が石の深さの分だけ開かされる仕事で受け止められるか、の大まかな計算です。広げたあと戻りきらない分を引いた締まりで見ます。落とす高さ・摩擦・壁の傾き・戻りきらない割合は仮の値です。合否にはしません。最後は職人が決めます";

/** 短い答えの文（作り方・図面）。狭くできる量・限界は、戻りきらない分を引いた、石を入れたあとに残せる締まり */
export function holdSummary(h: HoldResult, name: string): string {
  const need = Number.isFinite(h.needSqueezeMm) ? `約 ${h.needSqueezeMm.toFixed(2)} mm` : "決まらない（深さが 0）";
  return `${HOLD_VERDICT_LABEL[h.verdict]}（${name}・深さの和 ${h.depthSumMm.toFixed(2)} mm：${HOLD_WORDS.need} ${need}、${HOLD_WORDS.safe} 約 ${h.safeEffectiveMm.toFixed(2)} mm・${HOLD_WORDS.limit} 約 ${h.limitEffectiveMm.toFixed(2)} mm（${HOLD_WORDS.set}を引いて）。落とす高さ ${(h.dropMm / 1000).toFixed(1)} m・戻りきらない割合 ${h.curve.ratio} の仮の目安）`;
}

/** 戻りきらない分の一言（作り方・図面）：広げる量、残る量、見込んだ作る時の開き */
export function setSummary(h: HoldResult): string {
  return `${HOLD_WORDS.spread} 約 ${h.spreadMm.toFixed(2)} mm で、${HOLD_WORDS.set} 約 ${h.setMm.toFixed(2)} mm（仮）。${HOLD_WORDS.makeWithSet} 約 ${h.makeGapMm.toFixed(2)} mm（${isNoSqueeze(h.squeezeMm) ? "図面の開きのまま" : `図面の開きより ${h.squeezeMm.toFixed(2)} mm 狭く`}）`;
}

/** 広げられる限界（細い輪の式。mm）＝ 狭くできる限界 ＋ 深さの和 */
const spreadLimitOf = (h: HoldResult) => h.limitSqueezeMm + h.depthSumMm;

/** 広げる量が安全な目安をこえるとき（tight）の、広げる量の添え書き（作者の声 2026-11-08：「限界いっぱい」ではなく、石がぎりぎり入るだけ。広げすぎると戻らない） */
export const HOLD_SPREAD_NOTE = "（石がぎりぎり入るだけ。広げすぎると戻らない）";

/**
 * 作る手順の一行（作者の声 2026-11-08：本当の順に）。石より狭く作る → 広げて石を入れる → 戻る力で石をはさむ。
 * 足りないとき（short）は、留まる作り方がないので null。広げる量が安全な目安をこえるとき（tight）は、広げすぎないことを添える
 */
export function holdSteps(h: HoldResult): string | null {
  if (h.verdict === "short") return null;
  const note = h.verdict === "tight" ? HOLD_SPREAD_NOTE : "";
  // 狭く作る量が 0 のときに「石より 0.00 mm 狭く作る」と出していた（2026-11-08 初めての人の試し）。言葉で言う
  const make = isNoSqueeze(h.squeezeMm) ? `図面の開きのまま作る（石より狭くしない。くぼみ・溝の深さで留める。開き ${h.makeGapMm.toFixed(2)} mm）` : `石より ${h.squeezeMm.toFixed(2)} mm 狭く作る（作る時の開き ${h.makeGapMm.toFixed(2)} mm）`;
  return `${make} → ${h.spreadMm.toFixed(2)} mm 広げて石を入れる${note} → 戻る力で石をはさむ`;
}

/**
 * 札の見出し。tight は作り方そのもの（作者の声 2026-11-08：「ぎりぎり入れれば、留まる見込み」のような言い方は要らない）。
 * 例：「石より 0.76 mm 狭く作り、1.56 mm 広げて入れる」。hold・short は HOLD_VERDICT_LABEL のまま
 */
export function holdHeadline(h: HoldResult): string {
  if (h.verdict !== "tight") return HOLD_VERDICT_LABEL[h.verdict];
  const make = isNoSqueeze(h.squeezeMm) ? "図面の開きのまま作り" : `石より ${h.squeezeMm.toFixed(2)} mm 狭く作り`;
  return `${make}、${h.spreadMm.toFixed(2)} mm 広げて入れる`;
}

/** 狭く作る量が、画面の細かさ（0.01 mm）で 0 か */
export function isNoSqueeze(mm: number): boolean {
  return Math.round(mm * 100) === 0;
}

/** 「石より 0.41 mm 狭く」。0 なら「石より狭くしない」（「0.00 mm 狭く」とは出さない） */
export function narrowerText(mm: number): string {
  return isNoSqueeze(mm) ? "石より狭くしない" : `石より ${mm.toFixed(2)} mm 狭く`;
}

/**
 * 石の入れ方の職人の言葉（作者の声 2026-11-08。帳面 rule-tension-insert-ishikawa と同じ言葉）。
 * 画面は帳面の決まりがあればその言葉を読み、なければこれ
 */
export const HOLD_INSERT_TIP = {
  ruleId: "rule-tension-insert-ishikawa",
  text: "角から斜めに入れながら、ぎりぎりの広げ方で入れる",
  by: "職人 石川の言葉 2026-11-08",
} as const;

/** 広げる量の計算の前提（正直に小さな字で）：石をまっすぐ入れるとして、石の長さいっぱいまで開く量。斜めに入れる分は計算に入れていない */
export const HOLD_STRAIGHT_NOTE =
  "広げる量は、石をまっすぐ入れるとして、腕の両はしが石の長さいっぱいまで開く量で計算しています。角から斜めに入れると、もっと少なく広げて済むことがあります（斜めに入れる分は、まだ計算に入れていません）";

/**
 * 広げる量が安全な目安をこえるとき（tight）の小さな字：戻りきらない分の値は仮なので、見込んだときの倍をここに。ほかは null
 */
export function holdTightNote(h: HoldResult): string | null {
  if (h.verdict !== "tight") return null;
  return `この作り方は、広げる量が安全な目安をこえ、限界 約 ${spreadLimitOf(h).toFixed(2)} mm の近くまで要ります。石が入るだけ広げ、それ以上は広げません。広げたあと戻りきらない分（仮）約 ${h.setMm.toFixed(2)} mm を見込むと、外れにくさは求める分の 約 ${h.margin.toFixed(2)} 倍。戻りきらない割合は仮の値です`;
}

/** 深さのつまみの範囲と刻み（mm。形を作るための決まり。作者の頼み 2026-11-07「0.2〜0.8 mm くらい」） */
export const HOLD_DEPTH_RANGE = { min: 0.2, max: 0.8, step: 0.05 } as const;

/** 安全に留める深さの案（今の深さから、いちばん少なく深くして「留まる見込み」になる組） */
export interface SafeDepths {
  /** 案の深さ（その種類の端がなければ null） */
  pitMm: number | null;
  grooveMm: number | null;
  /** 変える端の種類と、変えない端の種類（両はし同じ種類なら keep は null） */
  change: "pit" | "groove";
  keep: "pit" | "groove" | null;
  /** その深さで出した答え（いまの計算そのまま） */
  hold: HoldResult;
}

/**
 * 答えが「留まる見込み」でないとき、今の深さから、つまみの刻みで少しずつ深くして、はじめて「留まる見込み」になる深さ（作者の声 2026-11-08「安全圏の感じで、数値をうまいこと調整して」）。
 * 両はしの種類がちがえば溝だけを深く（くぼみはそのまま）、同じなら両はしを同じだけ深く。計算は tensionHold のまま（新しい数は作らない）。
 * つまみの範囲で届かなければ null
 */
export function safeDepths(base: Omit<HoldInput, "depthSumMm">, ends: readonly { kind: "pit" | "groove"; depthMm: number }[], g: Guides = GUIDES, range: { max: number; step: number } = HOLD_DEPTH_RANGE): SafeDepths | null {
  const sum = ends.reduce((a, e) => a + e.depthMm, 0);
  if (tensionHold({ ...base, depthSumMm: sum }, g).verdict === "hold") return null;
  const mixed = ends.some((e) => e.kind === "pit") && ends.some((e) => e.kind === "groove");
  const change: "pit" | "groove" = mixed ? "groove" : ends[0].kind;
  const moving = ends.filter((e) => e.kind === change);
  const fixed = sum - moving.reduce((a, e) => a + e.depthMm, 0);
  const from = Math.max(...moving.map((e) => e.depthMm));
  for (let i = Math.floor(from / range.step + 1e-6) + 1; i * range.step <= range.max + 1e-9; i++) {
    const v = Math.round(i * range.step * 100) / 100;
    const hold = tensionHold({ ...base, depthSumMm: fixed + v * moving.length }, g);
    if (hold.verdict !== "hold") continue;
    const depthOf = (k: "pit" | "groove") => (k === change ? v : (ends.find((e) => e.kind === k)?.depthMm ?? null));
    return { pitMm: ends.some((e) => e.kind === "pit") ? depthOf("pit") : null, grooveMm: ends.some((e) => e.kind === "groove") ? depthOf("groove") : null, change, keep: mixed ? "pit" : null, hold };
  }
  return null;
}

/** この設計（table：硬い状態の tensionSpring）の、安全に留める深さの案。tensionHoldSet と同じ地金・重さで */
export function safeDepthsFor(table: SpringTable, massG: number, metal: SpringMetalId, ends: readonly { kind: "pit" | "groove"; depthMm: number }[], g: Guides = GUIDES): SafeDepths | null {
  const row = table.rows.find((r) => r.metal === metal)!;
  return safeDepths({ spanMm: table.spanMm, radiusMm: table.radiusMm, wireMm: table.wireMm, massG, spring: holdSpringOf(row, table.factor) }, ends, g);
}

/** 安全に留める深さの案の一文：「安全に留めるなら：溝を 0.50 mm に（くぼみ 0.40 mm のまま）」 */
export function safeDepthsText(s: SafeDepths): string {
  const word = (k: "pit" | "groove") => (k === "pit" ? "くぼみ" : "溝");
  const v = (k: "pit" | "groove") => (k === "pit" ? s.pitMm : s.grooveMm)!;
  const keep = s.keep ? `（${word(s.keep)} ${v(s.keep).toFixed(2)} mm のまま）` : "";
  return `安全に留めるなら：${s.keep ? "" : "両はしの"}${word(s.change)}を ${v(s.change).toFixed(2)} mm に${keep}`;
}

/** 今の深さが、おすすめと同じか */
export function isAdvised(depths: readonly { kind: "pit" | "groove"; depthMm: number }[], a: TensionAdvice): boolean {
  return depths.every((e) => Math.abs(e.depthMm - ((e.kind === "pit" ? a.pitMm : a.grooveMm) ?? NaN)) < 1e-6);
}

/** この設計（table：硬い状態の tensionSpring、ends：両はし、spring：選んだ地金の値）の、深さと開きのおすすめ。形の既定（tensionDefaultDepths）と同じ計算 */
export function holdAdvice(table: Pick<SpringTable, "radiusMm" | "wireMm" | "spanMm">, ends: readonly { kind: "pit" | "groove" }[], spring: { youngGpa: number; proofMpa: number; densityGPerCm3: number }, g: Guides = GUIDES, actualMassG?: number): TensionAdvice {
  return tensionAdvice({ radiusMm: table.radiusMm, wireMm: table.wireMm, ...spring, kinds: ends.map((e) => e.kind), spanMm: table.spanMm, actualMassG }, g);
}

/** おすすめの一文（作者の頼みの形：くぼみ・溝、作る時の開き、広げる量、戻りきらない分） */
export function adviceText(a: TensionAdvice): string {
  const depth = [a.pitMm !== null ? `くぼみ ${a.pitMm.toFixed(2)} mm` : "", a.grooveMm !== null ? `溝 ${a.grooveMm.toFixed(2)} mm` : ""].filter(Boolean).join("・");
  const make = a.makeGapMm !== null ? `作る時の開き ${a.makeGapMm.toFixed(2)} mm、` : "";
  const set = a.noSet ? "広げても戻りきらない分は出ない見込み" : `戻りきらない分 約 ${a.setMm.toFixed(2)} mm を見込む`;
  return `${HOLD_WORDS.advice}：${depth}、${make}広げる量 ${a.spreadMm.toFixed(2)} mm（${set}）`;
}

/** おすすめが届かないときの手（線を太く・もっと硬く・深く）。数は仮 */
export function adviceLevers(table: Pick<SpringTable, "radiusMm" | "wireMm" | "spanMm">, ends: readonly { kind: "pit" | "groove" }[], spring: { youngGpa: number; proofMpa: number; densityGPerCm3: number }, g: Guides = GUIDES): string[] {
  const out: string[] = [];
  const d = table.wireMm + 0.5;
  if (d <= g.tension.wireMaxMm + 1e-9) {
    const a = holdAdvice({ radiusMm: table.radiusMm + 0.25, wireMm: d, spanMm: table.spanMm }, ends, spring, g);
    out.push(a.ok ? `線を太くする：ø ${d.toFixed(1)} mm なら、${adviceText({ ...a, makeGapMm: null })}（仮）` : `線を太くする（ø ${d.toFixed(1)} mm でも、まだ足りない見込み。仮）`);
  }
  out.push("もっと硬くする（加工硬化を強める・熱で硬くする合金にする）と、戻りきらない分が減り、狭くできる量が増えます。硬さの値は仮なので、職人が確かめます");
  out.push(`深く彫る（${g.tension.adviceDepthMaxMm.toFixed(1)} mm より深く。くぼみの両わきの地金が薄くなるので、形の確かめも見ます）`);
  return out;
}

const r2 = (v: number | null) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

/** Claude が読む形。advice があれば、おすすめも */
export function holdForClaude(set: TensionHoldSet, advice?: TensionAdvice, safe?: SafeDepths | null) {
  const h = set.now;
  return {
    depth_sum_mm: r2(h.depthSumMm),
    drop_height_mm: h.dropMm,
    friction: h.mu,
    need_squeeze_mm: r2(h.needSqueezeMm),
    safe_squeeze_mm: r2(h.safeSqueezeMm),
    limit_squeeze_mm: r2(h.limitSqueezeMm),
    safe_squeeze_after_set_mm: r2(h.safeEffectiveMm),
    limit_squeeze_after_set_mm: r2(h.limitEffectiveMm),
    verdict: HOLD_VERDICT_LABEL[h.verdict],
    steps: holdSteps(h),
    ...(safe ? { safe_depths: { pit_mm: safe.pitMm, groove_mm: safe.grooveMm, text: safeDepthsText(safe), verdict: HOLD_VERDICT_LABEL[safe.hold.verdict], steps: holdSteps(safe.hold) } } : {}),
    insert_tip: `${HOLD_INSERT_TIP.text}（${HOLD_INSERT_TIP.by}）`,
    spread_assumes_straight_insertion: HOLD_STRAIGHT_NOTE,
    set_ratio: h.curve.ratio,
    set_starts_at_spread_mm: r2(h.curve.onsetMm),
    plan: { make_smaller_by_mm: r2(h.squeezeMm), make_gap_mm: r2(h.makeGapMm), spread_mm: r2(h.spreadMm), stays_open_mm: r2(h.setMm), grip_after_set_mm: r2(h.effectiveSqueezeMm), margin: r2(h.margin) },
    without_set_allowance: h.naive ? { make_smaller_by_mm: r2(h.naive.squeezeMm), stays_open_mm: r2(h.naive.setMm), grip_after_set_mm: r2(h.naive.effectiveSqueezeMm), margin: r2(h.naive.margin) } : null,
    margin_at_calc_squeeze: set.atAppSqueeze ? r2(set.atAppSqueeze.margin) : null,
    shallowest_depth_sum_mm: r2(h.minDepthSumMm),
    other_ways: set.options.map((o) => ({ way: o.label, verdict: HOLD_VERDICT_LABEL[o.verdict], need_squeeze_mm: r2(o.needSqueezeMm), can_squeeze_mm: r2(o.safeSqueezeMm) })),
    ...(advice
      ? {
          advice: {
            found: advice.ok,
            pit_mm: advice.pitMm,
            groove_mm: advice.grooveMm,
            make_gap_mm: r2(advice.makeGapMm),
            make_smaller_by_mm: r2(advice.squeezeMm),
            spread_mm: r2(advice.spreadMm),
            stays_open_mm: r2(advice.setMm),
            grip_after_set_mm: r2(advice.effectiveMm),
            no_set: advice.noSet,
            text: adviceText(advice),
          },
        }
      : {}),
    note: `${HOLD_PREMISE}。広げたあと戻りきらない分（仮）を引いた締まりで答えを出す。落とす高さ（tension.holdDropMm）・摩擦（tension.holdFriction）・戻りきらない割合（tension.springSetRatio）は、職人が帳面で決められる。`,
  };
}
