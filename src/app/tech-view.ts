// 技の頁：どの技も同じ形（2026-11-04 作者の声「頁ごとに見た目がちがって読みにくい」から）。
// 見出し（名前・一行の説明）→ ①作り方（工程を順に）→ ②職人の決まり（帳面と同じ札）→ ③Claude から質問（聞き取りの札）。
// 指輪の石留め（#waza/ring）も同じ形で、見出しに「設計で試す」を置く。六つの技は #waza/bezel・milgrain・tsuchime・kebori・nunome・mokume。
import { activeRules, editRule, ledgerText, removedList, removeRule, restoreRule, seedLedger, sourceLabel, type Ledger, type Rule } from "../rules/ledger";
import { answerToDraft, applyDraft, ringAnswerToDraft, ringGaps, techGaps, type Gap, type RuleDraft } from "../rules/gaps";
import type { ParamId } from "../rules/ledger";
import { howtoFor, howtoText, type HowtoId, type HowtoStep } from "../rules/howto-steps";
import { seedTechLedger, TECHS, techLedgerText, type TechId } from "../rules/techniques";
import { MAIN } from "../rules/workshops";
import { filming } from "./confirm";
import { flash, mountInterview, type InterviewTarget } from "./interview";
import { openRuleEditor, removedRulesHtml } from "./rule-editor";
import { masterName, sourceName } from "./master";
import { esc, store } from "./store";

const RING = "指輪の石留め（一粒石の指輪）";

export function ringTarget(): InterviewTarget {
  return {
    craft: RING,
    gaps: () => ringGaps(store.ledger()),
    draft: (gap, answer, ctx, chosen) => ringAnswerToDraft(store.ledger(), gap, answer, ctx, chosen),
    apply: (d) => store.setLedger(applyDraft(store.ledger(), d as RuleDraft<ParamId>)),
    ledgerText: () => ledgerText(store.ledger()),
    defaultName: () => sourceName(store.ledger(), store.workshops().active === MAIN),
  };
}

export function techTarget(id: TechId): InterviewTarget {
  const t = TECHS[id];
  return {
    craft: `${t.name}：${t.lead}`,
    gaps: () => techGaps(id, store.techLedger(id)),
    draft: (gap, answer, ctx, chosen) => answerToDraft(gap, answer, ctx, chosen),
    apply: (d) => store.setTechLedger(id, applyDraft<string>(store.techLedger(id), d as RuleDraft<string>)),
    // 作り方の工程も渡す（Claude が工程を知ったうえで、職人に聞く）
    ledgerText: () => `${techLedgerText(store.techLedger(id))}\n\n作り方（公開の資料から）：\n${howtoText(id)}`,
    defaultName: () => masterName(store.mainLedger()),
  };
}

/** 技の頁の名前・印・一行の説明 */
export function pageInfo(id: HowtoId): { name: string; mark: string; lead: string } {
  if (id === "ring") {
    const h = howtoFor("ring");
    return { name: h.name!, mark: h.mark!, lead: h.lead! };
  }
  return TECHS[id];
}

/** その技の、今の決まりと、まだ決まっていない所 */
function current(id: HowtoId): { rules: Rule<string>[]; gaps: Gap[] } {
  if (id === "ring") return { rules: activeRules(store.ledger()) as Rule<string>[], gaps: ringGaps(store.ledger()) };
  const l = store.techLedger(id);
  return { rules: activeRules(l), gaps: techGaps(id, l) };
}

export function pageCounts(id: HowtoId): { steps: number; craftsman: number; rules: number; gaps: number } {
  const { rules, gaps } = current(id);
  return { steps: howtoFor(id).steps.length, craftsman: rules.filter((r) => r.source.kind === "craftsman").length, rules: rules.length, gaps: gaps.length };
}

const link = (url: string, label: string) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;

function stepItem(s: HowtoStep, i: number): string {
  return `<li class="tp-step">
    <span class="tp-sn" aria-hidden="true">${i + 1}</span>
    <div class="tp-sb">
      <p class="tp-st">${esc(s.title)}${s.unverified ? ` <span class="tag warn">未確認</span>` : ""}${s.checkedBy ? ` <span class="tag ok" title="${esc(s.checkedBy)}">職人が確かめた</span>` : ""}</p>
      <p class="tp-sx">${esc(s.text)}</p>
      ${s.tools ? `<p class="tp-tools"><b>道具</b>${esc(s.tools)}</p>` : ""}
      ${s.fail ? `<p class="tp-fail"><b>失敗しやすい所</b>${esc(s.fail)}</p>` : ""}
      <p class="tp-src">出どころ：${s.sources.map((x) => `${x.url ? link(x.url, x.label) : esc(x.label)}${x.unverified ? `<span class="tp-uv">未確認</span>` : ""}`).join("、")}</p>
    </div>
  </li>`;
}

function ruleCard(r: Rule<string>): string {
  const craft = r.source.kind === "craftsman";
  const src = r.source.kind === "public" && r.source.url ? link(r.source.url, sourceLabel(r.source)) : esc(sourceLabel(r.source));
  return `<li class="rule-card">
    <p class="rc-title">${esc(r.title)}${r.unverified ? ` <span class="tag warn">未確認</span>` : ""}${r.source.kind === "provisional" ? ` <span class="tag">仮</span>` : ""}</p>
    <p class="rc-text">${esc(r.text)}</p>
    ${craft && r.quote ? `<blockquote>「${esc(r.quote)}」${r.question ? `<small>聞いたこと：${esc(r.question)}</small>` : ""}</blockquote>` : ""}
    <p class="rc-meta"><span>${src} ・ ${esc(r.date)}</span>${filming() ? "" : `<button type="button" class="linklike rc-del" data-edit-rule="${esc(r.id)}">編集</button>`}</p>
  </li>`;
}

/** その技の帳面を読む・書く（決まりの編集・消す・戻す） */
function ledgerOf(id: HowtoId): { get(): Ledger<string>; set(l: Ledger<string>): void; known(): Rule<string>[] } {
  if (id === "ring")
    return {
      get: () => store.ledger() as unknown as Ledger<string>,
      set: (l) => store.setLedger(l as unknown as Ledger),
      known: () => seedLedger().rules as Rule<string>[],
    };
  return { get: () => store.techLedger(id), set: (l) => store.setTechLedger(id, l), known: () => seedTechLedger(id).rules };
}

export function mountTech(root: HTMLElement, id: HowtoId, opts: { gapId?: string; onBack: () => void }): { refresh(): void } {
  const info = pageInfo(id);
  const howto = howtoFor(id);
  root.innerHTML = `
  <section class="view waza tp">
    <button type="button" class="back">← 技を選ぶ</button>
    <header class="tp-head">
      <span class="bt-mark" aria-hidden="true">${esc(info.mark)}</span>
      <div class="tp-hb">
        <h2>${esc(info.name)}</h2>
        <p class="lead">${esc(info.lead)}</p>
      </div>
    </header>
    ${id === "ring" ? `<a class="primary tp-try" href="studio.html">設計で試す <span aria-hidden="true">›</span></a>` : ""}
    <nav class="tp-toc" aria-label="この頁の中">
      <a href="#" data-to="tp-howto"><span>1</span>作り方</a><a href="#" data-to="tp-rules"><span>2</span>職人の決まり</a><a href="#" data-to="tp-ask"><span>3</span>Claude から質問</a>
    </nav>

    <section class="tp-block" id="tp-howto">
      <h3><span class="tp-n">1</span>作り方 <small>${howto.steps.length} 工程</small></h3>
      <ol class="tp-steps">${howto.steps.map(stepItem).join("")}</ol>
      <p class="small muted">数字は公開の資料から（出どころのリンクつき）。目安・最後は職人が決める。</p>
    </section>

    <section class="tp-block" id="tp-rules">
      <h3><span class="tp-n">2</span>職人の決まり <small class="rule-n"></small></h3>
      <ul class="rule-cards tp-mine"></ul>
      <div class="tp-pub"></div>
      <div class="tp-removed"></div>
    </section>

    <section class="tp-block" id="tp-ask">
      <h3><span class="tp-n">3</span>Claude から質問 <small class="gap-n"></small></h3>
      <p class="small muted">資料に無い所・食いちがう所を、Claude が 1 つずつ聞きます。答えると、職人の決まりとして ② に入ります。</p>
      <div class="iv-card iv-root"></div>
      <details class="tp-gaps"><summary>まだ決まっていない所の一覧</summary><ul class="nk-gaps"></ul></details>
    </section>
  </section>`;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  $(".back").addEventListener("click", opts.onBack);
  root.querySelectorAll<HTMLAnchorElement>(".tp-toc a").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      root.querySelector(`#${a.dataset.to}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }),
  );
  const interview = mountInterview($(".iv-root"), id === "ring" ? ringTarget() : techTarget(id), { onApplied: () => render() });
  if (opts.gapId) interview.focus(opts.gapId);

  const book = ledgerOf(id);
  function bindEdits() {
    root.querySelectorAll<HTMLButtonElement>("#tp-rules [data-edit-rule]").forEach((b) =>
      b.addEventListener("click", () => {
        const r = book.get().rules.find((x) => x.id === b.dataset.editRule);
        if (!r) return;
        openRuleEditor<string>(r, {
          save: (patch) => book.set(editRule(book.get(), r.id, patch)),
          remove: () => {
            book.set(removeRule(book.get(), r.id));
            flash("決まりを消しました。下の「消した決まり」から戻せます。");
          },
        });
      }),
    );
    root.querySelectorAll<HTMLButtonElement>("#tp-rules [data-restore]").forEach((b) =>
      b.addEventListener("click", () => {
        book.set(restoreRule(book.get(), b.dataset.restore!, book.known()));
        flash("決まりを元に戻しました。");
      }),
    );
  }

  function render() {
    const { rules, gaps } = current(id);
    const mine = rules.filter((r) => r.source.kind === "craftsman").reverse();
    const rest = rules.filter((r) => r.source.kind !== "craftsman");
    $(".rule-n").textContent = `職人 ${mine.length} ・ 資料 ${rest.length}`;
    $(".tp-mine").innerHTML = mine.length
      ? mine.map(ruleCard).join("")
      : `<li class="empty-card"><p>職人の決まりは、まだありません。③ の質問に答えると、ここに入ります。</p></li>`;
    // 資料の決まりは小さな札で。多いとき（指輪）は、たたんでおく
    const pub = `<ul class="rule-cards pub">${rest.map(ruleCard).join("")}</ul>`;
    $(".tp-pub").innerHTML = !rest.length
      ? ""
      : rest.length > 9
        ? `<details class="tp-more"><summary>資料から入れた決まり ${rest.length}</summary>${pub}</details>`
        : `<h4 class="tp-sub">資料から入れた決まり ${rest.length}</h4>${pub}`;
    $(".tp-removed").innerHTML = removedRulesHtml(removedList(book.get(), book.known()));
    bindEdits();
    $(".gap-n").textContent = `まだ決まっていない所 ${gaps.length}`;
    $(".nk-gaps").innerHTML = gaps.length
      ? gaps.map((g) => `<li><button type="button" class="gap-item" data-g="${esc(g.id)}"><b>${esc(g.title)}</b><small>${esc(g.why)}</small></button></li>`).join("")
      : `<li class="small">ありません</li>`;
    root.querySelectorAll<HTMLButtonElement>(".nk-gaps [data-g]").forEach((b) =>
      b.addEventListener("click", () => {
        interview.focus(b.dataset.g);
        $(".iv-root").scrollIntoView({ behavior: "smooth", block: "start" });
      }),
    );
  }

  render();
  return {
    refresh() {
      render();
      interview.refresh();
    },
  };
}
