// 流れの案内：職人が残す → 学ぶ人が受け取る。どの画面の上にも同じ形で出す（読まなくても 3 秒で分かるように、絵と短い言葉）。
import { activeRules, type Rule } from "../rules/ledger";
import { flowState, FLOW_STEPS, openQuestions, type FlowCounts, type FlowStepId } from "../rules/flow";
import type { HowtoId } from "../rules/howto-steps";
import { TECHS } from "../rules/techniques";
import { recordCount } from "../ui/motion-ui";
import { isMihon, MIHON_NAME } from "./mihon";
import { esc, store } from "./store";

const ICONS: Record<FlowStepId, string> = {
  // 口で答える
  answer: `<path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Zm5.5-3a5.5 5.5 0 0 1-11 0M12 16.5V20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  // 撮る
  model: `<path d="M4 8h10a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 14 17H4a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 4 8Zm11.5 3.5L21 8.5v8l-5.5-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>`,
  // 吹き出しで聞く
  ask: `<path d="M4 5h16v11H9l-5 4V5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 9.2a2 2 0 1 1 2.9 1.8c-.6.3-.9.7-.9 1.3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  // 手を比べる
  hands: `<path d="M8 21v-3.5L5 13.2a1.4 1.4 0 0 1 2.2-1.7L9 13V5.5a1.3 1.3 0 0 1 2.6 0V11V4.2a1.3 1.3 0 0 1 2.6 0V11V5.5a1.3 1.3 0 0 1 2.6 0V12V8a1.3 1.3 0 0 1 2.6 0v7c0 2.6-1.2 4.3-2.5 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
};

const CHECK = `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** 段ごとの行き先 */
export function stepHref(id: HowtoId, step: FlowStepId): string {
  if (step === "ask") return `#learn/${id}`;
  if (step === "hands") return `#learn/hands/${id}`;
  return `#waza/${id}?step=${step}`;
}

/** その技の名前 */
export function techName(id: HowtoId): string {
  return id === "ring" ? "指輪の石留め" : TECHS[id].name;
}

/** その技の決まり（今効いているもの） */
export function techRules(id: HowtoId): Rule<string>[] {
  return id === "ring" ? (activeRules(store.ledger()) as Rule<string>[]) : activeRules(store.techLedger(id));
}

/** その技で、今まで残ったものの数 */
export function flowCounts(id: HowtoId): FlowCounts {
  const craftsman = techRules(id).filter((r) => r.source.kind === "craftsman").length;
  return { craftsman, models: recordCount(id), asked: store.flowCount("asked", id), compared: store.flowCount("compared", id), questions: openQuestions(store.queue(), id).length };
}

/** 帳面に残った決まりの呼び名（見本は作り話なので「職人の決まり」と書かない） */
export const ruleWord = () => (isMihon() ? "見本の決まり（作り話）" : "職人の決まり");

/** 決まりの出どころの名前（見本の人なら作り話と書く） */
export function isMihonSource(r: Rule<string> | Rule): boolean {
  return r.source.kind === "craftsman" && r.source.name === MIHON_NAME;
}

/** 4 つの段（いまどこまで進んだか）と、残った数 */
export function flowStrip(id: HowtoId, opts: { at?: FlowStepId; compact?: boolean } = {}): string {
  const c = flowCounts(id);
  const st = flowState(c);
  const node = (s: (typeof st.steps)[number]) => {
    const at = opts.at === s.id;
    return `<li class="fl-step ${s.who}${s.done ? " done" : ""}${s.current ? " current" : ""}${at ? " at" : ""}">
      <a href="${stepHref(id, s.id)}" data-step="${s.id}"${at ? ` aria-current="step"` : ""} aria-label="${esc(s.next)}${s.done ? "（できた）" : s.current ? "（次はここ）" : ""}">
        <span class="fl-icon"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">${ICONS[s.id]}</svg>${s.done ? `<i class="fl-ok">${CHECK}</i>` : ""}</span>
        <span class="fl-label">${esc(s.label)}</span>
      </a>
    </li>`;
  };
  const grow = (n: number, label: string, cls = "") => `<span class="fl-n${cls}${n ? " has" : ""}"><b>${n}</b>${esc(label)}</span>`;
  if (opts.compact) {
    return `<nav class="flow compact" aria-label="${esc(techName(id))}の流れ">
    <div class="fl-who"><span class="master">職人が残す</span><span class="learner">学ぶ人が受け取る</span></div>
    <ol class="fl-steps">${st.steps.map(node).join("")}</ol>
  </nav>`;
  }
  return `<nav class="flow" aria-label="${esc(techName(id))}の流れ">
    <div class="fl-who"><span class="master">職人が残す</span><span class="learner">学ぶ人が受け取る</span></div>
    <ol class="fl-steps">${st.steps.map(node).join("")}</ol>
    <a class="fl-back${c.questions ? " has" : ""}" href="#waza/${id}?step=answer"><svg viewBox="0 0 120 10" preserveAspectRatio="none" aria-hidden="true"><path d="M118 1v3a3 3 0 0 1-3 3H6" fill="none" stroke="currentColor" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="M6 4 2 7l4 3" fill="none" stroke="currentColor" stroke-width="1.2" vector-effect="non-scaling-stroke"/></svg><span>分からないことは、質問で職人へ戻る</span></a>
    <div class="fl-grow">${grow(c.craftsman, isMihon() ? "残した決まり" : "職人の決まり")}${grow(c.models, "手本")}${grow(c.questions, "届いた質問", c.questions ? " alert" : "")}</div>
  </nav>`;
}

/** 技の札の小さな印（進み具合） */
export function flowDots(id: HowtoId): string {
  const st = flowState(flowCounts(id));
  return `<span class="fl-dots" role="img" aria-label="流れの ${FLOW_STEPS.length} つのうち ${st.doneCount} つできた">${st.steps.map((s) => `<i class="${s.who}${s.done ? " done" : ""}"></i>`).join("")}</span>`;
}

/** 技を選ぶ（学ぶの画面の上）。指輪は例の一つ */
export function techPicker(id: HowtoId, order: readonly HowtoId[], label: string): string {
  return `<label class="tech-pick"><span>${esc(label)}</span><select aria-label="${esc(label)}">${order.map((x) => `<option value="${x}"${x === id ? " selected" : ""}>${esc(techName(x))}</option>`).join("")}</select></label>`;
}

/** 名前に「さん」をつける（見本の人にはつけない） */
export const san = (name: string) => (name === MIHON_NAME ? name : `${name}さん`);

export const MIHON_BAR = `<div class="mihon-bar" role="note"><b>見本</b><span>作り話の例です。本当の職人の決まりではありません。入れたものは残りません。</span><a href="app.html#waza/kebori">見本をやめる</a></div>`;
