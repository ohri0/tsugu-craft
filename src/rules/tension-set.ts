// テンションの「戻りきらない分」（永久ひずみ）と、それを見込んだ作り方、深さと開きのおすすめ。画面にも形にもよらない、いちばん下の計算。
// 読むのは GUIDES だけ（形の側 src/geometry/tension.ts からも呼ぶので、ほかの rules を読まない）。
//
// 作者の声（2026-11-07）：石を入れるために腕を広げると、地金は元に戻りきらない。
// 「例えば 1 やって 1.5 に開いたら 1 に戻るんじゃなくて 1.2 とか」。前の計算は、限界の内なら 100 % 戻るとしていたので、
// 石を入れたあとの本当の締まり（詰めた量）は、計算より少ない。これを計算に入れてほしい。
// 作者の頼み（同じ日）：計算は判定だけでなく、おすすめも出す。広げすぎない（広げると戻りきらない）。ぎりぎりを狙いつつ安全に。
//
// 考え方（docs/RESEARCH-tension.md の 15 節。数はすべて仮）：
// - 腕を Δ だけ広げて離すと、p(Δ) だけ開いたまま残る（戻りきらない分）。
//   - Δ が「残りはじめ」Δ0 までは残らない（ばねの内）。
//   - Δ0 から細い輪の式の限界 L までは、なめらかに増える：p ＝（Δ − Δ0）² ÷（2（L − Δ0））。L で、広げた分がそのまま残る傾き 1 につながる。
//   - L を超えた分は、すべて残る：p ＝（L − Δ0）÷ 2 ＋（Δ − L）（前の計算の「曲がったまま残る量 ＝ 要る量 − L」と同じ考え）。
//   - Δ0 は、職人が言葉で変えられる 1 つの値 springSetRatio（太い輪の分を見た安全な限界 S まで広げたとき、広げた分の何割が残るか）から決める。
// - 石を入れたあとの締まり ＝ 作るときに縮めた量 s − p（深さの和 e ＋ s）。
// - 戻りきらない分を見込んだ作り方：残る締まりが、石を留めるのに要る量になる s を、s ＝ 要る量 ＋ p（e ＋ s）の繰り返しで解く。
import { GUIDES, type Guides } from "./guides";

const G_MS2 = 9.81;

/**
 * 開いた輪を、まっすぐ押し開くとき、地金が戻れる範囲（耐力を超えない範囲）で開ける量（mm）。
 * 切れ目のある輪の曲げ：開く量 δ ＝ 3π F R³ ÷（E I）、いちばん大きい曲げ（開きの反対側）M ＝ 2 F R、σ ＝ M（d ÷ 2）÷ I。
 * F と I を消すと δ ≒ 3π R² σ ÷（E d）。I が消えるので、断面の形によらず、高さ d で決まる。
 * 前提：細い輪の近似（R が d より十分大きい。太い輪では内側の曲げが強くなるので、実際は少なめになりやすい）、まっすぐ押し開く（ねじらない）、端の溝は無視。
 * radiusMm：中心の半径 R。wireMm：線の高さ d。youngGpa：ヤング率 E。proofMpa：耐力 σ
 */
export function elasticOpeningMm(radiusMm: number, wireMm: number, youngGpa: number, proofMpa: number): number {
  return (3 * Math.PI * radiusMm * radiusMm * proofMpa) / (youngGpa * 1000 * wireMm);
}

/**
 * 丸い線を曲げるとき、線の内側で曲げが強まる割合（ばねの手引きの式：Ki ＝（4C² − C − 1）÷（4C（C − 1））、C ＝ 輪の径 ÷ 線の太さ）。
 * 細い輪の式で出した「開ける量」を、この割合で割ると、太い輪の分を見た量になる。
 */
export function curvedWireFactor(radiusMm: number, wireMm: number): number {
  const c = (2 * radiusMm) / wireMm;
  return (4 * c * c - c - 1) / (4 * c * (c - 1));
}

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

/**
 * 深さの和 e・石を入れたあとの締まり s で、石を押し出すのに要る仕事（N·mm）。
 * s が負（腕が戻りきらず、石との間に −s のすき間がある）なら、すき間の分は腕を開かずに動けるので、深さのかかりは k（e ＋ s）² ÷ 2 に減る
 */
export function holdWork(kNPerMm: number, eMm: number, sMm: number, eta: number): HoldWork {
  const slack = Math.min(0, sMm);
  const e = Math.max(0, eMm + slack);
  const lock = (kNPerMm * e * e) / 2;
  const squeeze = kNPerMm * eMm * Math.max(0, sMm);
  const base = lock + squeeze;
  const friction = Number.isFinite(eta) ? base * (eta - 1) : Infinity;
  return { lock, squeeze, friction, total: base + friction };
}

/** 落としたときに受け止める仕事（N·mm）：腕の重さ（g）× 重力 × 高さ（mm） */
export function dropWorkNmm(massG: number, heightMm: number): number {
  return (massG / 1000) * G_MS2 * heightMm;
}

/** 石を留めるのに、石を入れたあとに残っていてほしい締まり（mm）。深さが 0 なら Infinity。深さだけで足りれば 0 */
export function needSqueezeMm(eMm: number, demandNmm: number, kNPerMm: number, eta: number): number {
  return eMm <= 1e-9 ? Infinity : !Number.isFinite(eta) ? 0 : Math.max(0, demandNmm / (kNPerMm * eta * eMm) - eMm / 2);
}

/** 戻りきらない分の線：安全な限界 S・細い輪の式の限界 L・残りはじめ Δ0（mm）と、S まで広げたときに残る割合 */
export interface SetCurve {
  safeMm: number;
  limitMm: number;
  onsetMm: number;
  /** S まで広げたとき、広げた分のうち残る割合（決めた値。表せる上限を超えたら上限） */
  ratio: number;
}

/** 表せるいちばん大きい割合（Δ0 ＝ 0 のとき：S ÷（2L）） */
export function maxSetRatio(safeMm: number, limitMm: number): number {
  return limitMm > 0 ? safeMm / (2 * limitMm) : 0;
}

/**
 * 残る割合 ratio から、残りはじめ Δ0 を決める：p（S）＝ ratio × S を、x ＝ S − Δ0 について解く（x² − 2 r S x − 2 r S（L − S）＝ 0）
 */
export function setCurve(safeMm: number, limitMm: number, ratio: number): SetCurve {
  const s = Math.max(0, safeMm);
  const l = Math.max(s, limitMm);
  const r = Math.min(Math.max(0, ratio), maxSetRatio(s, l));
  const x = r * s + Math.sqrt(r * r * s * s + 2 * r * s * (l - s));
  const onsetMm = Math.max(0, s - x);
  return { safeMm: s, limitMm: l, onsetMm, ratio: r };
}

/** 腕を spreadMm だけ広げて離したとき、戻りきらずに開いたまま残る量（mm） */
export function permanentSetMm(spreadMm: number, c: SetCurve): number {
  const d = Math.max(0, spreadMm);
  const span = c.limitMm - c.onsetMm;
  if (d <= c.onsetMm) return 0;
  if (span <= 1e-12) return d - c.limitMm;
  if (d <= c.limitMm) return ((d - c.onsetMm) * (d - c.onsetMm)) / (2 * span);
  return span / 2 + (d - c.limitMm);
}

/**
 * 職人の言い方「広げた分の何割が残る」を、この線の値 springSetRatio に置きかえる：spreadMm だけ広げて share の割合が残るなら、S まで広げたときは何割か。
 * 表せない（残りすぎ）なら null。例：作者の「1 で作って 1.5 に開いたら 1.2 に戻る」は、広げた 0.5 のうち 0.2（4 割）が残る、という言い方
 */
export function setRatioForShare(share: number, spreadMm: number, safeMm: number, limitMm: number): number | null {
  if (spreadMm <= 0 || share < 0) return null;
  if (share === 0) return 0;
  const at = (onset: number) => permanentSetMm(spreadMm, { safeMm, limitMm, onsetMm: onset, ratio: 0 }) / spreadMm;
  if (at(0) < share - 1e-12) return null;
  // Δ0 が小さいほど多く残る。Δ0 を二分して探す
  let lo = 0;
  let hi = limitMm;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) > share) lo = mid;
    else hi = mid;
  }
  const onset = (lo + hi) / 2;
  return permanentSetMm(safeMm, { safeMm, limitMm, onsetMm: onset, ratio: 0 }) / safeMm;
}

/** 戻りきらない分を見込んだ作り方 */
export interface SetPlan {
  /** 作るときに縮める量（図面の開きより狭くする量。mm） */
  squeezeMm: number;
  /** 石を入れる時に広げる量（深さの和 ＋ 縮める量。mm） */
  spreadMm: number;
  /** 戻りきらずに開いたまま残る量（mm） */
  setMm: number;
  /** 石を入れたあとに残る締まり（mm） */
  effectiveMm: number;
  /** 繰り返した回数 */
  iterations: number;
}

/** 縮める量 s で作ったとき（戻りきらない分と、残る締まり） */
export function planAt(eMm: number, squeezeMm: number, c: SetCurve): SetPlan {
  const s = Math.max(0, squeezeMm);
  const setMm = permanentSetMm(eMm + s, c);
  return { squeezeMm: s, spreadMm: eMm + s, setMm, effectiveMm: s - setMm, iterations: 0 };
}

/**
 * 石を入れたあとに targetMm の締まりが残るように、作るときに縮める量を解く（広げる量は capSpreadMm まで）。届かなければ null。
 * s ＝ target ＋ p（e ＋ s）を、s ＝ target から繰り返す（p は増える一方なので、いちばん小さい答えへ下から近づく）。
 * 限界の近くは傾きが 1 に近く、近づきが遅いので、回しきれなければ二分で仕上げる
 */
export function compensateSet(eMm: number, targetMm: number, c: SetCurve, capSpreadMm: number): SetPlan | null {
  const target = Math.max(0, targetMm);
  if (!Number.isFinite(target)) return null;
  const capS = capSpreadMm - eMm;
  if (capS < -1e-12) return null;
  const residual = (s: number) => s - permanentSetMm(eMm + s, c) - target;
  if (residual(Math.max(0, capS)) < -1e-9) return null;
  let s = target;
  let iterations = 0;
  for (; iterations < 1000; iterations++) {
    const next = target + permanentSetMm(eMm + s, c);
    if (Math.abs(next - s) < 1e-10) {
      s = next;
      break;
    }
    s = next;
  }
  if (iterations >= 1000) {
    let lo = s;
    let hi = Math.max(s, capS);
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (residual(mid) < 0) lo = mid;
      else hi = mid;
    }
    s = hi;
  }
  const plan = planAt(eMm, s, c);
  return { ...plan, iterations: iterations + 1 };
}

/** 輪の重さの多めの見積もり（g）：切れ目のない丸線の輪（腕の両はしを切った分・彫った分を引かない。おすすめを安全側にする） */
export function bandMassUpperG(radiusMm: number, wireMm: number, densityGPerCm3: number): number {
  return (densityGPerCm3 * Math.PI * wireMm * wireMm * Math.PI * radiusMm * 2) / 4 / 1000;
}

/** おすすめの入力：輪の中心の半径・線の太さ・地金（ヤング率・耐力（硬い状態）・密度）と、両はしの種類。石の長さがあれば作る時の開きも出す */
export interface AdviceInput {
  radiusMm: number;
  wireMm: number;
  youngGpa: number;
  proofMpa: number;
  densityGPerCm3: number;
  kinds: readonly ("pit" | "groove")[];
  spanMm?: number;
  /**
   * 本当の指輪の重さ（g）。あれば、選んだ組の作り方（縮める量・広げる量・戻りきらない分・倍）を、この重さで出し直す（外れにくさの計算と同じ数になる）。
   * 組を選ぶのは、いつも多めに見た重さ（形の既定と画面で、同じ組になるように）
   */
  actualMassG?: number;
}

/** 深さと開きのおすすめ */
export interface TensionAdvice {
  /** 戻りきらない分を見込んでも、腕が安全に戻れる範囲で留まる見込みになる組があったか */
  ok: boolean;
  /** くぼみの深さ・溝の深さ（その種類の端がなければ null。mm） */
  pitMm: number | null;
  grooveMm: number | null;
  depthSumMm: number;
  /** 石を留めるのに、石を入れたあとに残っていてほしい締まり（mm） */
  needMm: number;
  /** 作るときに縮める量・広げる量・戻りきらない分・残る締まり（mm） */
  squeezeMm: number;
  spreadMm: number;
  setMm: number;
  effectiveMm: number;
  /** 作る時の開き（石の長さがあるとき。mm） */
  makeGapMm: number | null;
  /** 求める分の何倍か（重さは多めに見た値で） */
  margin: number;
  /** 広げる量が、残りはじめより少ないか（戻りきらない分が出ない） */
  noSet: boolean;
  /** 残りはじめ・安全な限界・限界（mm） */
  onsetMm: number;
  safeMm: number;
  limitMm: number;
  /** 計算に使った輪の重さ（多めの見積もり。g） */
  massG: number;
}

/** おすすめが探す深さ（mm。両はしとも adviceDepthMinMm〜adviceDepthMaxMm を step ごと） */
export function adviceDepths(g: Guides = GUIDES): number[] {
  const t = g.tension;
  const out: number[] = [];
  const n = Math.round((t.adviceDepthMaxMm - t.adviceDepthMinMm) / t.adviceDepthStepMm);
  for (let i = 0; i <= n; i++) {
    const v = Math.round((t.adviceDepthMinMm + i * t.adviceDepthStepMm) * 1000) / 1000;
    out.push(v);
  }
  return out;
}

/**
 * この輪・この地金・この両はしで、戻りきらない分を見込んで「留まる見込み」になる深さの組と作り方のうち、広げる量がいちばん少ないもの。
 * 広げる量が残りはじめより少ない組があれば、それが選ばれる（広げる量の少ない順なので）。同じ広げる量なら、くぼみと溝の差が小さい方、くぼみが深い方。
 * どの組も届かなければ ok ＝ false で、石を入れるだけで安全な限界を超えない組のうち、安全な限界まで広げたときにいちばん外れにくい組（足りない）。
 * 輪の重さは、切れ目のない輪として多めに見る（安全側。実際の指輪では、外れにくさは少し上がる）
 */
export function tensionAdvice(a: AdviceInput, g: Guides = GUIDES): TensionAdvice {
  const t = g.tension;
  const limitMm = elasticOpeningMm(a.radiusMm, a.wireMm, a.youngGpa, a.proofMpa);
  const safeMm = limitMm / curvedWireFactor(a.radiusMm, a.wireMm);
  const curve = setCurve(safeMm, limitMm, t.springSetRatio);
  const k = ringStiffnessNPerMm(a.radiusMm, a.wireMm, a.youngGpa);
  const eta = frictionFactor(t.holdWallDeg, t.holdFriction);
  const massG = bandMassUpperG(a.radiusMm, a.wireMm, a.densityGPerCm3);
  const demand = dropWorkNmm(massG, t.holdDropMm);
  const hasPit = a.kinds.includes("pit");
  const hasGroove = a.kinds.includes("groove");
  const mixed = hasPit && hasGroove;
  const depths = adviceDepths(g);
  const cands: { pit: number | null; groove: number | null; e: number }[] = [];
  for (const v of depths) {
    if (mixed) for (const w of depths) cands.push({ pit: v, groove: w, e: v + w });
    else cands.push({ pit: hasPit ? v : null, groove: hasGroove ? v : null, e: 2 * v });
  }
  const diff = (c: { pit: number | null; groove: number | null }) => (c.pit !== null && c.groove !== null ? Math.abs(c.pit - c.groove) : 0);
  // 同じ値なら、くぼみと溝の差が小さい方、くぼみが深い方
  const evener = (c: (typeof cands)[number], b: (typeof cands)[number]) => diff(c) < diff(b) - 1e-9 || (Math.abs(diff(c) - diff(b)) <= 1e-9 && (c.pit ?? 0) > (b.pit ?? 0));
  let best: { c: (typeof cands)[number]; plan: SetPlan; need: number } | null = null;
  for (const c of cands) {
    const need = needSqueezeMm(c.e, demand, k, eta);
    const plan = compensateSet(c.e, need, curve, safeMm);
    if (!plan) continue;
    const better = !best || plan.spreadMm < best.plan.spreadMm - 1e-9 || (Math.abs(plan.spreadMm - best.plan.spreadMm) <= 1e-9 && evener(c, best.c));
    if (better) best = { c, plan, need };
  }
  const marginOf = (e: number, p: SetPlan) => holdWork(k, e, p.effectiveMm, eta).total / demand;
  const out = (ok: boolean, c: (typeof cands)[number], plan: SetPlan, need: number): TensionAdvice => ({
    ok,
    pitMm: c.pit,
    grooveMm: c.groove,
    depthSumMm: c.e,
    needMm: need,
    squeezeMm: plan.squeezeMm,
    spreadMm: plan.spreadMm,
    setMm: plan.setMm,
    effectiveMm: plan.effectiveMm,
    makeGapMm: a.spanMm === undefined ? null : a.spanMm - c.e - plan.squeezeMm,
    margin: marginOf(c.e, plan),
    noSet: plan.spreadMm <= curve.onsetMm + 1e-9,
    onsetMm: curve.onsetMm,
    safeMm,
    limitMm,
    massG,
  });
  if (best) {
    if (a.actualMassG === undefined) return out(true, best.c, best.plan, best.need);
    // 本当の重さは多めの見積もりより軽いので、要る量は減り、必ず届く
    const demandA = dropWorkNmm(a.actualMassG, t.holdDropMm);
    const needA = needSqueezeMm(best.c.e, demandA, k, eta);
    const planA = compensateSet(best.c.e, needA, curve, safeMm) ?? best.plan;
    return { ...out(true, best.c, planA, needA), margin: holdWork(k, best.c.e, planA.effectiveMm, eta).total / demandA };
  }
  // 届かない：広げる量が安全な限界の内（石を入れるだけで限界を超えない）の組から、安全な限界まで広げたとき、いちばん外れにくい組。
  // そういう組がなければ（深さの和がいちばん浅くても限界を超える）、いちばん浅い組
  const inside = cands.filter((c) => c.e <= safeMm + 1e-9);
  const minE = Math.min(...cands.map((c) => c.e));
  const pool = inside.length ? inside : cands.filter((c) => c.e <= minE + 1e-9);
  let worst: { c: (typeof cands)[number]; plan: SetPlan; m: number } | null = null;
  for (const c of pool) {
    const plan = planAt(c.e, Math.max(0, safeMm - c.e), curve);
    const m = marginOf(c.e, plan);
    if (!worst || m > worst.m + 1e-9 || (Math.abs(m - worst.m) <= 1e-9 && evener(c, worst.c))) worst = { c, plan, m };
  }
  return out(false, worst!.c, worst!.plan, needSqueezeMm(worst!.c.e, demand, k, eta));
}
