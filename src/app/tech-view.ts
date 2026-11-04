// ほかの技（覆輪留め・ミル打ち・槌目・毛彫り・布目象嵌・木目金）の入口：Claude の質問 → 帳面 の順に並べる。
// 魚々子の入口（nanako-view.ts）と同じ形。図はまだないので、聞き取りと帳面だけ。
import { activeRules, sourceLabel, type Rule } from "../rules/ledger";
import { answerToDraft, applyDraft, techGaps, type RuleDraft } from "../rules/gaps";
import { TECHS, techLedgerText, type TechId } from "../rules/techniques";
import { mountInterview, type InterviewTarget } from "./interview";
import { masterName } from "./master";
import { esc, store } from "./store";

export function techTarget(id: TechId): InterviewTarget {
  const t = TECHS[id];
  return {
    craft: `${t.name}：${t.lead}`,
    gaps: () => techGaps(id, store.techLedger(id)),
    draft: (gap, answer, ctx, chosen) => answerToDraft(gap, answer, ctx, chosen),
    apply: (d) => store.setTechLedger(id, applyDraft<string>(store.techLedger(id), d as RuleDraft<string>)),
    ledgerText: () => techLedgerText(store.techLedger(id)),
    defaultName: () => masterName(store.mainLedger()),
  };
}

export function mountTech(root: HTMLElement, id: TechId, opts: { gapId?: string; onBack: () => void }): { refresh(): void } {
  const t = TECHS[id];
  root.innerHTML = `
  <section class="view waza tech-page">
    <button type="button" class="back">← 技を選ぶ</button>
    <header class="view-head">
      <h2>${esc(t.name)}</h2>
      <p class="lead">${esc(t.lead)}</p>
    </header>
    <div class="block panel iv-root"></div>
    <div class="block">
      <div class="panel-head"><h3>帳面 <small class="rule-n"></small></h3></div>
      <p class="small muted">公開の資料から入れた決まりです（出どころのリンクつき。目安・最後は職人が決める）。職人が答えると、職人の決まりが上に入ります。</p>
      <ul class="nk-rules tech-rules"></ul>
      <h3 class="nk-gap-h">まだ決まっていない所 <small class="gap-n"></small></h3>
      <ul class="nk-gaps"></ul>
    </div>
  </section>`;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  $(".back").addEventListener("click", opts.onBack);
  const interview = mountInterview($(".iv-root"), techTarget(id));
  if (opts.gapId) interview.focus(opts.gapId);

  function ruleItem(r: Rule<string>): string {
    const kind = r.source.kind;
    const src = r.source.kind === "public" && r.source.url ? `<a href="${esc(r.source.url)}" target="_blank" rel="noopener">${esc(sourceLabel(r.source))}</a>` : esc(sourceLabel(r.source));
    return `<li class="nk-rule ${kind}">
      <div class="nk-rule-head"><b>${esc(r.title)}</b>${r.unverified ? `<span class="tag warn">未確認</span>` : ""}${kind === "craftsman" ? `<span class="tag gold">職人</span>` : ""}</div>
      <p>${esc(r.text)}</p>
      ${r.quote && kind === "craftsman" ? `<blockquote>「${esc(r.quote)}」${r.question ? `<small>聞いたこと：${esc(r.question)}</small>` : ""}</blockquote>` : ""}
      <p class="small muted">${src} ・ ${esc(r.date)}</p>
    </li>`;
  }

  function render() {
    const l = store.techLedger(id);
    const rules = activeRules(l);
    const mine = rules.filter((r) => r.source.kind === "craftsman");
    const rest = rules.filter((r) => r.source.kind !== "craftsman");
    $(".rule-n").textContent = `${rules.length}（職人 ${mine.length}・資料 ${rest.length}）`;
    $(".tech-rules").innerHTML = [...mine.reverse(), ...rest].map(ruleItem).join("");
    const gaps = techGaps(id, l);
    $(".gap-n").textContent = String(gaps.length);
    $(".nk-gaps").innerHTML = gaps.length
      ? gaps.map((g) => `<li><button type="button" class="gap-item" data-g="${esc(g.id)}"><b>${esc(g.title)}</b><small>${g.kind === "unverified" ? "未確認 ・ " : "資料にない ・ "}${esc(g.why)}</small></button></li>`).join("")
      : `<li class="small">ありません</li>`;
    root.querySelectorAll<HTMLButtonElement>(".nk-gaps [data-g]").forEach((b) => b.addEventListener("click", () => interview.focus(b.dataset.g)));
  }

  render();
  return {
    refresh() {
      render();
      interview.refresh();
    },
  };
}
