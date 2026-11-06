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
  const all = id === "ring" ? (activeRules(store.ledger()) as Rule<string>[]) : activeRules(store.techLedger(id));
  // 見本は作り話だけで流れを見せる。本当の職人の言葉は、見本の数にも答えにも混ぜない（混ぜると、見本が 2 つ目の段から始まっていた）
  return isMihon() ? all.filter((r) => r.source.kind !== "craftsman" || isMihonSource(r)) : all;
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

/** 段ごとの、残った数の短い言葉（段の印の下に小さく出す） */
function stepCount(id: FlowStepId, c: FlowCounts): string {
  if (id === "answer") return `決まり ${c.craftsman}`;
  if (id === "model") return `手本 ${c.models}`;
  if (id === "ask") return `聞いた ${c.asked}`;
  return `比べた ${c.compared}`;
}

/**
 * 4 つの段の案内（2026-11-06 作り直し：作者「分かりづらい」）。
 * いま開いている段（at）だけを強く目立たせる。まだの段のうち次にやる段は、小さな「次」の印だけ。
 * 前は「いま開いている段」と「次の段」が両方光って、どこにいるのか分からなかった。
 * 残った数は段の下に小さく（前は下に同じ数の段をもう 1 つ並べていた）。届いた質問があるときだけ、赤い帯で職人へ戻す。
 */
export function flowStrip(id: HowtoId, opts: { at?: FlowStepId; compact?: boolean } = {}): string {
  const c = flowCounts(id);
  const st = flowState(c);
  const node = (s: (typeof st.steps)[number], i: number) => {
    const at = opts.at === s.id;
    const next = s.current && !at;
    return `<li class="fl-step ${s.who}${s.done ? " done" : ""}${s.current ? " current" : ""}${at ? " at" : ""}">
      <a href="${stepHref(id, s.id)}" data-step="${s.id}"${at ? ` aria-current="step"` : ""} aria-label="${i + 1}. ${esc(s.next)}${s.done ? "（できた）" : ""}${at ? "（いまここ）" : next ? "（次はここ）" : ""}">
        <span class="fl-icon"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${ICONS[s.id]}</svg>${s.done ? `<i class="fl-ok">${CHECK}</i>` : ""}</span>
        <span class="fl-txt"><span class="fl-label">${esc(s.label)}</span><span class="fl-sub">${at ? "いまここ" : next ? "次はここ" : esc(stepCount(s.id, c))}</span></span>
      </a>
    </li>`;
  };
  const who = `<div class="fl-who" aria-hidden="true"><span class="master">職人が残す</span><span class="learner">学ぶ人が受け取る</span></div>`;
  const alert =
    !opts.compact && c.questions
      ? `<a class="fl-back has" href="#waza/${id}?step=answer"><b>${c.questions}</b><span>学ぶ人から質問が届いています</span><span class="fl-back-go">答える ›</span></a>`
      : "";
  return `<nav class="flow${opts.compact ? " compact" : ""}" aria-label="${esc(techName(id))}の流れ">
    ${who}
    <ol class="fl-steps">${st.steps.map(node).join("")}</ol>
    ${alert}
  </nav>`;
}

/** 技の札に出す「次にやること」（流れが全部終わっていれば null） */
export function nextStepLabel(id: HowtoId): { label: string; who: "master" | "learner"; done: number } | null {
  const st = flowState(flowCounts(id));
  const n = st.steps.find((s) => s.current);
  return n ? { label: n.next, who: n.who, done: st.doneCount } : null;
}

/** 技の札の小さな印（進み具合） */
export function flowDots(id: HowtoId): string {
  const st = flowState(flowCounts(id));
  return `<span class="fl-dots" role="img" aria-label="流れの ${FLOW_STEPS.length} つのうち ${st.doneCount} つできた">${st.steps.map((s) => `<i class="${s.who}${s.done ? " done" : ""}"></i>`).join("")}</span>`;
}

/** 学ぶの中の切り替え（聞く・手を比べる）。学ぶ人の画面には、職人の段を出さない（前は「手本を残す」が青く光って押したくなった） */
export function learnNav(id: HowtoId, at: "ask" | "hands"): string {
  const tab = (step: "ask" | "hands", label: string, icon: string) =>
    `<a href="${stepHref(id, step)}" data-step="${step}"${at === step ? ` aria-current="page"` : ""}><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${icon}</svg><span>${label}</span></a>`;
  return `<nav class="learn-nav" aria-label="学ぶ">${tab("ask", "職人に聞く", ICONS.ask)}${tab("hands", "手の動きを比べる", ICONS.hands)}</nav>`;
}

/** 技を選ぶ（学ぶの画面の上）。指輪は例の一つ */
export function techPicker(id: HowtoId, order: readonly HowtoId[], label: string): string {
  return `<label class="tech-pick"><span>${esc(label)}</span><select aria-label="${esc(label)}">${order.map((x) => `<option value="${x}"${x === id ? " selected" : ""}>${esc(techName(x))}</option>`).join("")}</select></label>`;
}

/** 名前に「さん」をつける（見本の人にはつけない） */
export const san = (name: string) => (name === MIHON_NAME ? name : `${name}さん`);

export const MIHON_BAR = `<div class="mihon-bar" role="note"><b>見本</b><span>作り話の例です。本当の職人の決まりではありません。入れたものは残りません。</span><a href="app.html#waza/kebori">見本をやめる</a></div>`;
