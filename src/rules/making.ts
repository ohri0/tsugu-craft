// 作り方の決まり：機械で確かめられない職人の決まり（ヤスリの当て方など）を、作り方のどの工程の決まりかに結びつける。
// 手順の画面では、その工程の中に「職人の決まり」として出す。画面に依存しない。
import type { Rule } from "./ledger.js";

/** 作り方の工程（src/studio/steps.ts の工程の id と同じ） */
export const MAKING_STEPS = {
  model: "原型を作る",
  sprue: "湯道を付ける",
  invest: "埋没して、焼く",
  pour: "鋳込む",
  divest: "型から出し、洗う",
  cut_sprue: "湯道を切り、整える",
  material: "材料を用意する",
  anneal: "焼きなまして、のばす",
  bend: "切って、丸める",
  solder: "ロウ付けで閉じる",
  true: "芯金で丸く整える",
  head: "石座を組む",
  bezel_make: "覆輪を作る",
  attach: "石座を腕に付ける",
  prong: "座を彫って、石を留める",
  bezel: "石を入れて、覆輪を倒す",
  harden: "叩いて硬くする",
  tension_cut: "溝とくぼみを切る",
  tension_close: "開きを詰める",
  tension_set: "石を入れる",
  finish: "仕上げ",
} as const;

export type MakingStepId = keyof typeof MAKING_STEPS;
export const MAKING_STEP_IDS = Object.keys(MAKING_STEPS) as MakingStepId[];

/** 機械で確かめる決まりか（値か確かめに結びついている） */
export function isCheckRule(r: Pick<Rule, "param" | "checks">): boolean {
  return Boolean(r.param || r.checks?.length);
}

/**
 * この決まりが効く工程。決まりに steps があればそれ。なければ言葉から控えめに当てる
 * （当たらなければ空。当てずっぽうで広げない）。
 */
export function stepsOfRule(r: Pick<Rule, "steps" | "title" | "text" | "param" | "checks">): MakingStepId[] {
  if (r.steps?.length) return r.steps.filter((s): s is MakingStepId => s in MAKING_STEPS);
  if (isCheckRule(r)) return [];
  const t = `${r.title} ${r.text}`;
  const out = new Set<MakingStepId>();
  if (/ロウ付け|ろう付け|継ぎ目/.test(t)) out.add("solder");
  if (/石座/.test(t) && /ロウ付け|ろう付け/.test(t)) out.add("attach");
  if (/ヤスリ|やすり|削る|すり板/.test(t)) {
    out.add("cut_sprue");
    out.add("finish");
  }
  if (/磨/.test(t)) out.add("finish");
  if (/湯道/.test(t)) out.add("sprue");
  if (/鋳込|湯を/.test(t)) out.add("pour");
  if (/焼きなま|焼鈍/.test(t)) out.add("anneal");
  if (/爪を倒|座を彫|石を留/.test(t)) out.add("prong");
  if (/覆輪/.test(t)) out.add("bezel");
  return [...out];
}

/**
 * この工程に効く作り方の決まり：職人の決まり（新しい順）のあとに、資料から入れた決まり（工程を明示したものだけ。言葉から当てない）。
 * 確かめに結びつく決まりは出さない。
 */
export function makingRulesFor<R extends Rule>(rules: R[], step: string): R[] {
  const mine = rules.filter((r) => r.source.kind === "craftsman" && (stepsOfRule(r) as string[]).includes(step)).reverse();
  const pub = rules.filter((r) => r.source.kind !== "craftsman" && !isCheckRule(r) && (r.steps ?? []).includes(step));
  return [...mine, ...pub];
}
