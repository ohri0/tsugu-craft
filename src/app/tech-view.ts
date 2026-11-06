// 技の頁：どの技も同じ形（2026-11-04 作者の声「頁ごとに見た目がちがって読みにくい」から）。
// 見出し（名前・一行の説明）→ ①作り方（工程を順に）→ ②職人の決まり（帳面と同じ札）→ ③Claude から質問（聞き取りの札）。
// 指輪の石留め（#waza/ring）も同じ形で、見出しに「設計で試す」を置く。六つの技は #waza/bezel・milgrain・tsuchime・kebori・nunome・mokume。
import { activeRules, editRule, ledgerText, removedList, removeRule, restoreRule, seedLedger, sourceLabel, type Ledger, type Rule } from "../rules/ledger";
import { answerToDraft, applyDraft, ringAnswerToDraft, ringGaps, techGaps, type Gap, type RuleDraft } from "../rules/gaps";
import { askedGroupId, flowState, FLOW_STEPS, openQuestions, questionGap, stepAfter, type FlowStepId } from "../rules/flow";
import { importRecord } from "../craft/record";
import { markAnswered } from "../rules/teacher-queue";
import { mountMotion, savedRecords, storeRecord } from "../ui/motion-ui";
import { flowCounts, flowStrip, isMihonSource, ruleWord, stepHref, techName } from "./flow-view";
import { clipUrl, flowUI, isMihon, MIHON_CLIPS, MIHON_NAME, mihonAnswer } from "./mihon";
import { putVideo } from "./video-store";
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
  const src = isMihonSource(r) ? `<span class="tag warn">作り話の例</span> ${esc(r.source.kind === "craftsman" ? r.source.name : "")}` : r.source.kind === "public" && r.source.url ? link(r.source.url, sourceLabel(r.source)) : esc(sourceLabel(r.source));
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

/** 技の頁の聞き取り：Claude の問いの前に、学ぶ人から届いた質問を出す。答えると質問に「答えた」が付き、次から帳面で答えられる */
function withQuestions(id: HowtoId, base: InterviewTarget): InterviewTarget {
  return {
    ...base,
    gaps: () => [...openQuestions(store.queue(), id).map((g) => questionGap(id, g)), ...base.gaps()],
    draft: (gap, answer, ctx, chosen) => (gap.kind === "asked" ? answerToDraft(gap, answer, ctx, chosen) : base.draft(gap, answer, ctx, chosen)),
    apply(d) {
      // 先に質問を探す（決まりを入れると画面が描き直される）
      const gid = askedGroupId(d.gap);
      const g = gid ? openQuestions(store.queue(), id).find((x) => x.id === gid) : undefined;
      base.apply(d);
      const rules = ledgerOf(id).get().rules;
      if (g && rules.length) store.setQueue(markAnswered(store.queue(), g.ids, rules[rules.length - 1].id));
    },
    defaultName: () => (isMihon() ? MIHON_NAME : base.defaultName()),
  };
}

export function mountTech(root: HTMLElement, id: HowtoId, opts: { gapId?: string; step?: string; onBack: () => void }): { refresh(): void } {
  const info = pageInfo(id);
  const howto = howtoFor(id);
  const flow = flowUI();
  const num = (n: number) => (flow ? "" : `<span class="tp-n">${n}</span>`);
  const howtoBody = `<ol class="tp-steps">${howto.steps.map(stepItem).join("")}</ol>
      <p class="small muted">数字は公開の資料から（出どころのリンクつき）。目安・最後は職人が決める。</p>`;
  const blocks = {
    howto: flow
      ? `<section class="tp-block" id="tp-howto"><details class="tp-more tp-howto-more"><summary>作り方を見る <small>${howto.steps.length} 工程 ・ 公開の資料から</small></summary><p class="tp-howto-lead">${esc(info.lead)}</p>${howtoBody}</details></section>`
      : `<section class="tp-block" id="tp-howto"><h3>${num(1)}作り方 <small>${howto.steps.length} 工程</small></h3>${howtoBody}</section>`,
    rules: `<section class="tp-block" id="tp-rules">
      <h3>${num(2)}${flow ? "帳面に残った決まり" : "職人の決まり"} <small class="rule-n"></small></h3>
      ${flow ? `<p class="small muted tp-rules-why">職人の答えが入り、学ぶ人への答えになります。</p>` : ""}
      <ul class="rule-cards tp-mine"></ul>
      <div class="tp-pub"></div>
      <div class="tp-removed"></div>
    </section>`,
    ask: `<section class="tp-block fl-panel" id="tp-ask">
      <h3>${flow ? `<span class="fl-h-n">1</span>` : num(3)}${flow ? "聞かれたことに答える" : "Claude から質問"} <small class="gap-n"></small></h3>
      <p class="small muted">${flow ? "答えは「帳面に残った決まり」に入ります。" : "資料に無い所・食いちがう所を、Claude が 1 つずつ聞きます。答えると、職人の決まりとして ② に入ります。"}</p>
      <div class="iv-card iv-root"></div>
      <details class="tp-gaps"><summary>まだ決まっていない所の一覧</summary><ul class="nk-gaps"></ul></details>
      ${flow ? `<div class="fl-next-slot" data-for="answer"></div>` : ""}
    </section>`,
  };
  // 2026-11-06（作者：パッと見て何のページか分からない）：流れの画面では、技の名前は上の細い行に置き、
  // いちばん大きな字で「このページは何をする所か」を 1 行で言う。技の説明は「作り方を見る」の中へ
  const head = flow
    ? `<div class="tp-crumb"><button type="button" class="back">← 技の一覧</button><span class="tp-crumb-tech"><span class="bt-mark" aria-hidden="true">${esc(info.mark)}</span><b>${esc(techName(id))}</b></span>${id === "ring" ? `<a class="tp-try tp-try-sm" href="studio.html">設計で試す ›</a>` : ""}</div>
    <header class="tp-head tp-purpose"><h2>職人が残し、学ぶ人が受け取る</h2></header>`
    : `<button type="button" class="back">← 技を選ぶ</button>
    <header class="tp-head">
      <span class="bt-mark" aria-hidden="true">${esc(info.mark)}</span>
      <div class="tp-hb">
        <h2>${esc(info.name)}</h2>
        <p class="lead">${esc(info.lead)}</p>
      </div>
    </header>`;
  root.innerHTML = `
  <section class="view waza tp${flow ? " tp-flow" : ""}">
    ${head}
    ${flow ? `<div class="fl-slot"></div><div class="fl-now"></div>` : ""}
    ${id === "ring" && !flow ? `<a class="primary tp-try" href="studio.html">設計で試す <span aria-hidden="true">›</span></a>` : ""}
    ${
      flow
        ? `${blocks.ask}
    <section class="tp-block fl-panel" id="tp-model" hidden>
      <h3><span class="fl-h-n">2</span>手本を残す <small class="model-n"></small></h3>
      <ul class="tp-models"></ul>
      <div class="model-root motion-root"></div>
      <div class="fl-next-slot" data-for="model"></div>
    </section>
    ${blocks.rules}${blocks.howto}`
        : `<nav class="tp-toc" aria-label="この頁の中">
      <a href="#" data-to="tp-howto"><span>1</span>作り方</a><a href="#" data-to="tp-rules"><span>2</span>職人の決まり</a><a href="#" data-to="tp-ask"><span>3</span>Claude から質問</a>
    </nav>
    ${blocks.howto}${blocks.rules}${blocks.ask}`
    }
  </section>`;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  $(".back").addEventListener("click", opts.onBack);
  root.querySelectorAll<HTMLAnchorElement>(".tp-toc a").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      root.querySelector(`#${a.dataset.to}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }),
  );
  /** いま見せる「残しました」（なければ空） */
  let savedNote: "" | "rule" | "model" = "";
  const base = id === "ring" ? ringTarget() : techTarget(id);
  const interview = mountInterview($(".iv-root"), flow ? withQuestions(id, base) : base, {
    onApplied: () => {
      if (flow) {
        savedNote = "rule";
        requestAnimationFrame(() => $(".fl-slot").scrollIntoView({ behavior: "smooth", block: "start" }));
      }
      render();
    },
    example: isMihon() ? mihonAnswer : undefined,
  });
  if (opts.gapId) interview.focus(opts.gapId);

  // ---- 流れ：いま開いている段（答える・手本を残す。聞く・比べるは学ぶの画面へ移る） ----
  const initial = (): FlowStepId | null => {
    if (opts.step === "answer" || opts.step === "model") return opts.step;
    if (opts.gapId) return "answer";
    const next = flowState(flowCounts(id)).nextId;
    if (next === "answer" || next === "model") return next;
    return flowCounts(id).questions ? "answer" : null;
  };
  let panel: FlowStepId | null = flow ? initial() : null;

  function openPanel(which: FlowStepId, scroll: boolean) {
    panel = which;
    render();
    if (which === "model") mountModel();
    if (scroll) requestAnimationFrame(() => root.querySelector(which === "model" ? "#tp-model" : "#tp-ask")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  let modelMounted = false;
  function mountModel() {
    if (modelMounted) return;
    modelMounted = true;
    const box = $(".model-root");
    if (isMihon()) {
      box.innerHTML = `<div class="mihon-model"><video src="${clipUrl(MIHON_CLIPS.master)}" muted playsinline controls preload="auto"></video><p class="small muted">見本：職人の本物の手元（ヤスリがけ。毛彫りの動画ではありません）。学ぶ人の手も、同じ職人の別の場面を見立てた例です。</p><button type="button" class="primary use-mihon-model">この動画を手本にする</button></div>`;
      box.querySelector(".use-mihon-model")!.addEventListener("click", async (e) => {
        const b = e.currentTarget as HTMLButtonElement;
        b.disabled = true;
        const record = importRecord(await (await fetch(MIHON_CLIPS.master.record)).text());
        const video = await (await fetch(clipUrl(MIHON_CLIPS.master))).blob();
        await putVideo(record.id, video);
        const title = "手本の例（ヤスリがけ）";
        storeRecord({ ...record, technique: id, title, craftsman: MIHON_NAME });
        b.hidden = true;
        modelSaved(title);
      });
      return;
    }
    mountMotion(box, {
      simple: true,
      technique: id,
      defaultTitle: `${info.name}の手本`,
      defaultWho: base.defaultName(),
      onSaved: (r, video) => {
        if (!video) return;
        void putVideo(r.id, video).then(() => modelSaved(r.title));
      },
    });
  }
  function modelSaved(title: string) {
    savedNote = "model";
    flash(`手本を残しました：${title}`);
    // 手本は帳面の外なので、ほかの画面にも知らせる（描き直しもここで動く）
    store.touch();
    requestAnimationFrame(() => $(".fl-slot").scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function renderFlow() {
    $(".fl-slot").innerHTML = flowStrip(id, { at: panel ?? undefined });
    const st = flowState(flowCounts(id));
    const nextInfo = FLOW_STEPS.find((s) => s.id === st.nextId);
    // 残したものを見せてから、次の 1 歩だけを出す
    const lastRule = savedNote === "rule" ? ledgerOf(id).get().rules.filter((r) => r.source.kind === "craftsman").pop() : undefined;
    const saved = lastRule
      ? `<div class="fl-saved"><p class="eyebrow">帳面に残りました</p><b>${esc(lastRule.title)}</b>${lastRule.quote ? `<blockquote>「${esc(lastRule.quote)}」</blockquote>` : ""}<small>${isMihonSource(lastRule) ? "作り話の例 ・ 見本の人" : esc(sourceLabel(lastRule.source))} ・ ${esc(lastRule.date)}</small></div>`
      : savedNote === "model"
        ? `<div class="fl-saved"><p class="eyebrow">手本を残しました</p><small>学ぶ人が、手の動きを比べられるようになりました。</small></div>`
        : "";
    // いちばん目立つボタンは 1 つだけ。段を開いて作業している間は出さず（作業の「決まりにする」などと並ばないように）、
    // 残したあとか、この頁で開く段がないときだけ、上に「次：…」を出す。作業中は段のいちばん下に、控えめな「次へ」
    const showGo = !!nextInfo && nextInfo.id !== panel && (savedNote !== "" || panel === null);
    const go = showGo && nextInfo ? `<a class="primary fl-go" href="${stepHref(id, nextInfo.id)}" data-step="${nextInfo.id}">次：${esc(nextInfo.next)} <span aria-hidden="true">›</span></a>` : "";
    const finished = !st.nextId && panel === null ? `<p class="fl-done">この技は、ひととおり通りました。届いた質問に答えるほど、帳面が育ちます。</p>` : "";
    $(".fl-now").innerHTML = saved + go + finished;
    root.querySelectorAll<HTMLElement>(".fl-next-slot").forEach((slot) => {
      const after = stepAfter(slot.dataset.for as FlowStepId);
      slot.innerHTML = after && !showGo ? `<a class="ghost btnlike fl-next" href="${stepHref(id, after.id)}" data-step="${after.id}">次の段へ：${esc(after.next)} <span aria-hidden="true">›</span></a>` : "";
    });
    $<HTMLElement>("#tp-ask").hidden = panel !== "answer";
    $<HTMLElement>("#tp-model").hidden = panel !== "model";
    // 同じ頁の中の段は、頁を開き直さずに切り替える（書きかけの答えが消えないように）
    root.querySelectorAll<HTMLAnchorElement>('.fl-slot a[data-step="answer"], .fl-slot a[data-step="model"], .fl-now a[data-step="answer"], .fl-now a[data-step="model"], .fl-next[data-step="model"], .fl-slot .fl-back').forEach((a) =>
      a.addEventListener("click", (e) => {
        e.preventDefault();
        savedNote = "";
        openPanel((a.dataset.step as FlowStepId | undefined) ?? "answer", true);
      }),
    );
    const mine = savedRecords().filter((r) => (r.technique ?? "ring") === id);
    $(".model-n").textContent = `残した手本 ${mine.length}`;
    $(".tp-models").innerHTML = mine.map((r) => `<li><b>${esc(r.title)}</b><small>${r.craftsman === MIHON_NAME ? "作り話の例" : esc(r.craftsman || "名前なし")} ・ ${esc(r.date)} ・ ${Math.round(r.durationS)} 秒</small></li>`).join("");
  }

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
    // 見本は作り話の決まりだけ（本当の職人の言葉は見本に混ぜない）
    const mine = rules.filter((r) => r.source.kind === "craftsman" && (!isMihon() || isMihonSource(r))).reverse();
    const rest = rules.filter((r) => r.source.kind !== "craftsman");
    $(".rule-n").textContent = `${flow ? ruleWord() : "職人"} ${mine.length} ・ 資料 ${rest.length}`;
    $(".tp-mine").innerHTML = mine.length
      ? mine.map(ruleCard).join("")
      : `<li class="empty-card"><p>${flow ? "職人の言葉は、まだありません。聞かれたことに答えると、ここに残ります。" : "職人の決まりは、まだありません。③ の質問に答えると、ここに入ります。"}</p></li>`;
    // 資料の決まりは小さな札で。多いとき（指輪）は、たたんでおく
    const pub = `<ul class="rule-cards pub">${rest.map(ruleCard).join("")}</ul>`;
    $(".tp-pub").innerHTML = !rest.length
      ? ""
      : rest.length > 9 || flow
        ? `<details class="tp-more"><summary>資料から入れた決まり ${rest.length}</summary>${pub}</details>`
        : `<h4 class="tp-sub">資料から入れた決まり ${rest.length}</h4>${pub}`;
    $(".tp-removed").innerHTML = removedRulesHtml(removedList(book.get(), book.known()));
    bindEdits();
    // 流れの画面では、聞き取りの札の中に同じ数が出る
    $(".gap-n").textContent = flow ? "" : `まだ決まっていない所 ${gaps.length}`;
    $(".nk-gaps").innerHTML = gaps.length
      ? gaps.map((g) => `<li><button type="button" class="gap-item" data-g="${esc(g.id)}"><b>${esc(g.title)}</b><small>${esc(g.why)}</small></button></li>`).join("")
      : `<li class="small">ありません</li>`;
    root.querySelectorAll<HTMLButtonElement>(".nk-gaps [data-g]").forEach((b) =>
      b.addEventListener("click", () => {
        interview.focus(b.dataset.g);
        $(".iv-root").scrollIntoView({ behavior: "smooth", block: "start" });
      }),
    );
    if (flow) renderFlow();
  }

  render();
  if (panel === "model") mountModel();
  // #waza/kebori?step=model で来たとき（画面の切り替えが頁の上へ戻したあとで動かす）
  if (opts.step === "answer" || opts.step === "model") setTimeout(() => root.querySelector(opts.step === "model" ? "#tp-model" : "#tp-ask")?.scrollIntoView({ block: "start" }), 0);
  return {
    refresh() {
      render();
      interview.refresh();
    },
  };
}
