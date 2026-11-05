// 帳面：職人の決まりを、いちばん上に札で見せる（決まり・職人の言葉・名前と日・見せた動画）。
// その下に「Claude から質問が 1 つあります」（指輪の帳面のまだ決まっていない所。src/app/interview.ts の聞き取り）。
// そのあとに、ほかにできること：帳面を印刷・手本を撮る・思いついたことを話して残す・届いている質問（あるときだけ）。
// 届いた質問に答えると、Claude が決まりの案にまとめ、職人が「これでいい」を押すと帳面に入る。
import { askConfirm, filming } from "./confirm";
import { openRuleEditor, removedRulesHtml } from "./rule-editor";
import { runClaude } from "../claude/loop";
import { printHtml } from "../ui/print";
import { keepPrompt } from "../claude/prompt";
import { TOOLS, type ProposeRuleInput, type ProposeRuleResult, type ToolHost } from "../claude/tools";
import { summarizeMetrics } from "../craft/motion";
import { bookHtml } from "../rules/book";
import { freshGap, ringGaps } from "../rules/gaps";
import { activeRules, addRule, editRule, removedList, removeRule, restoreRule, seedLedger, sourceLabel, type Ledger, type Rule } from "../rules/ledger";
import { setBasics, MAIN, removeWorkshop, renameWorkshop, setActive } from "../rules/workshops";
import repoLedger from "../../ledger/jewelry.json";
import { groupQuestions, markAnswered, removeQuestions, type QuestionGroup } from "../rules/teacher-queue";
import { mountMotion, savedRecords } from "../ui/motion-ui";
import { mountInterview, type Interview } from "./interview";
import { bookLabel, bookTitle, masterName } from "./master";
import { openQuestions, WAZA_ORDER } from "../rules/flow";
import { flowCounts, flowDots, techName } from "./flow-view";
import { flowUI } from "./mihon";
import { getVideo, putVideo } from "./video-store";
import { askPassword, resetPassword } from "./password";
import { esc, store, today } from "./store";
import { bindVoice, canListen } from "./voice";
import { ringTarget } from "./waza";

const PUBLIC_NOTE = `<p class="small muted">公開の資料から入れた目安です。出どころのリンクつき。職人が確かめると、職人の決まりに置き換わります（目安・最後は職人が決める）。</p>`;

const MIC = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-2.1A7 7 0 0 0 19 12h-2Z" fill="currentColor"/></svg>`;

/** 答える欄ごとに、職人が見せた動画 */
const shownVideo = new WeakMap<HTMLElement, File>();

/** 「あとで」を押した回数（この画面を開いている間だけ） */
const LATER_STORE = "tsugu.ledgerLater.v1";
function laterCount(): number {
  try {
    return Number(sessionStorage.getItem(LATER_STORE) ?? "0") || 0;
  } catch {
    return 0;
  }
}
function setLater(n: number) {
  try {
    sessionStorage.setItem(LATER_STORE, String(n));
  } catch {
    // 残せなくても動く
  }
}

export function mountKeep(root: HTMLElement, opts: { onExampleSaved?: () => void } = {}): { refresh(): void; route(sub: string): void } {
  root.innerHTML = `
  <section class="view keep">
    <header class="view-head">
      <div class="keep-name"><h2 class="keep-title"></h2><button type="button" class="linklike rename">名前を変える</button><label class="ws-switch" hidden><span>帳面を切り替える</span><select aria-label="使う帳面"></select></label></div>
      <p class="lead">${flowUI() ? "決まりは、技ごとに残ります。" : "工房の決まり。設計の確かめと、学ぶ人への答えに使います。"}</p>
      <div class="keep-basics"><span>この工房のベーシック：爪の形</span><div class="seg-b" role="group" aria-label="爪の形（工房の既定）"><button type="button" data-tip="round">丸い爪</button><button type="button" data-tip="oni">鬼爪</button></div><small class="keep-basics-n"></small></div>
    </header>
    ${flowUI() ? `<ul class="book-techs"></ul><h3 class="pub-sec-h book-ring-h">指輪の石留めの決まり <small>設計の確かめにも使います</small></h3>` : ""}
    <div class="block ask-card iv-card" hidden></div>
    <ul class="rule-cards"></ul>
    ${
      // 撮影のときは、前のまま開いた形で（台本が中の札まで動かす）
      filming()
        ? `<section class="public-rules" hidden><h3 class="pub-sec-h public-sum"></h3>${PUBLIC_NOTE}<ul class="rule-cards pub"></ul></section>`
        : `<details class="public-rules" hidden><summary class="pub-sec-h public-sum"></summary>${PUBLIC_NOTE}<ul class="rule-cards pub"></ul></details>`
    }
    <div class="removed-slot"></div>
    <div class="block inbox-block" hidden>
      <h3>届いている質問 <small class="inbox-count"></small></h3>
      <ul class="inbox"></ul>
    </div>
    <div class="block">
      <h3>ほかにできること</h3>
      <div class="acts">
        <button type="button" class="act print"><b>帳面を印刷</b><small>紙にして工房に置く</small></button>
        <button type="button" class="act" data-open="motion"><b>手本を撮る</b><small>作業を撮るだけ。学ぶ人が手の動きを比べられます</small></button>
        <button type="button" class="act" data-open="free"><b>思いついたことを話して残す</b><small>話すか書くと、決まりの案になります</small></button>
      </div>
    </div>
    <div class="block panel motion-panel" hidden><div class="panel-head"><h3>手本を撮る</h3><button type="button" class="ghost close">閉じる</button></div><div class="motion-root"></div></div>
    <div class="block panel free-panel" hidden><div class="panel-head"><h3>話して残す</h3><button type="button" class="ghost close">閉じる</button></div><div class="free-body"></div></div>
  </section>`;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  // 届いている質問は、赤い印で来て探す物なので、札より上に置く（資料の決まりの下で 6,000 px 以上 遠かった）。撮影のときは前の順のまま
  if (!filming()) $(".iv-card").before($(".inbox-block"));
  /** 聞き取りを開いているときの部品（開いていなければ null） */
  let interview: Interview | null = null;
  /** 質問の札：いま描いた一覧と、留めている質問（決まりを消して新しく出た質問。「あとで」で外す） */
  let askKnown: Set<string> | null = null;
  let askPinned: string | undefined;

  function refresh() {
    const ledger = store.ledger();
    const label = bookLabel(ledger);
    $(".keep-title").textContent = bookTitle(label);
    const ws = store.workshops();
    $(".rename").textContent = ws.active === MAIN ? "名前を変える" : "名前を変える・消す";
    // 工房の帳面があれば、ここでも切り替えられる（帳面ごとに決まりを編集するため）
    const sw = $(".ws-switch");
    sw.hidden = !ws.list.length;
    const pick = sw.querySelector("select")!;
    pick.innerHTML = [`<option value="${MAIN}"${ws.active === MAIN ? " selected" : ""}>${esc(bookTitle(store.mainName()))}</option>`, ...ws.list.map((w) => `<option value="${esc(w.id)}"${ws.active === w.id ? " selected" : ""}>${esc(bookTitle(w.name))}</option>`)].join("");
    const tip = store.ledger().basics?.prongTip ?? "round";
    root.querySelectorAll<HTMLButtonElement>(".keep-basics button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tip === tip)));
    $(".keep-basics-n").textContent = ws.list.find((w) => w.id === ws.active)?.sample ? "見本の工房です。爪の太さと形は雰囲気の例。あとで直せます。目安・最後は職人が決めます。" : "いつもの雰囲気の既定。設計ごとにも選べます。";
    renderCards();
    renderRemoved();
    if (interview) interview.refresh();
    else renderAskCard();
    const flow = flowUI();
    if (flow) {
      // 技ごとの帳面：開くとその技の頁へ。届いた質問もそこで答える（答えがちがう技の帳面に入らないように）
      $(".book-techs").innerHTML = WAZA_ORDER.filter((id) => id !== "ring")
        .map((id) => {
          const c = flowCounts(id);
          return `<li><a href="#waza/${id}${c.questions ? "?step=answer" : ""}"><b>${esc(techName(id))}</b><span class="bk-n">${c.craftsman ? `言葉 ${c.craftsman}` : ""}${c.models ? ` ・ 手本 ${c.models}` : ""}${c.questions ? ` <i class="alert">質問 ${c.questions}</i>` : ""}</span>${flowDots(id)}</a></li>`;
        })
        .join("");
    }
    const groups = flow ? openQuestions(store.queue(), "ring") : groupQuestions(store.queue()).filter((g) => !g.answeredRuleId);
    $(".inbox-block").hidden = !groups.length;
    $(".inbox-count").textContent = groups.length ? `${groups.length} 件` : "";
    $(".inbox").innerHTML = groups.map((g, i) => inboxItem(g, i)).join("");
    root.querySelectorAll<HTMLButtonElement>(".inbox [data-answer]").forEach((b) =>
      b.addEventListener("click", () => openAnswer(b.closest("li")!, groups[Number(b.dataset.answer)])),
    );
    // まちがって届いた質問（声の聞きまちがいなど）を消す。似た質問をまとめた分も一緒に消える
    root.querySelectorAll<HTMLButtonElement>(".inbox [data-del-q]").forEach((b) =>
      b.addEventListener("click", () => {
        const g = groups[Number(b.dataset.delQ)];
        if (!g || !confirm(`この質問を消しますか？\n「${g.question}」${g.count > 1 ? `\n（似た質問 ${g.count} 件をまとめて消します）` : ""}`)) return;
        store.setQueue(removeQuestions(store.queue(), g.ids));
        refresh();
      }),
    );
  }

  /** 札の「編集」：直すことも消すこともできる窓を開く（2026-11-05 作者：消すだけでなく編集に） */
  function bindRuleEdit() {
    root.querySelectorAll<HTMLButtonElement>("[data-edit-rule]").forEach((b) =>
      b.addEventListener("click", () => {
        const r = store.ledger().rules.find((x) => x.id === b.dataset.editRule);
        if (!r) return;
        openRuleEditor(r, {
          save: (patch) => {
            store.setLedger(editRule(store.ledger(), r.id, patch));
            refresh();
          },
          remove: () => {
            store.setLedger(removeRule(store.ledger(), r.id));
            refresh();
            flash("決まりを消しました。下の「消した決まり」から戻せます。");
          },
        });
      }),
    );
  }

  /** 中身を残していなかった頃に消した決まりを探す所 */
  const knownRules = (): Rule[] => [...(repoLedger as Ledger).rules, ...seedLedger().rules];

  /** 消した決まりの一覧（元に戻せる） */
  function renderRemoved() {
    const box = $(".removed-slot");
    box.innerHTML = removedRulesHtml(removedList(store.ledger(), knownRules()));
    box.querySelectorAll<HTMLButtonElement>("[data-restore]").forEach((b) =>
      b.addEventListener("click", () => {
        store.setLedger(restoreRule(store.ledger(), b.dataset.restore!, knownRules()));
        refresh();
        flash("決まりを元に戻しました。");
      }),
    );
  }

  /** 工房の帳面の名前を変える・帳面ごと消す（札の「編集」と同じ形の窓） */
  function openWorkshopEditor() {
    const ws = store.workshops();
    const w = ws.list.find((x) => x.id === ws.active);
    if (!w) return;
    const dlg = document.createElement("dialog");
    dlg.className = "sheet rule-edit";
    dlg.innerHTML = `<form method="dialog">
      <h3>工房の帳面を編集</h3>
      <label>工房の名前<input class="re-title" value="${esc(w.name)}" maxlength="24"></label>
      <p class="re-err" role="alert" hidden></p>
      <div class="sheet-actions re-actions">
        <button type="button" class="ghost danger re-del">帳面を消す</button>
        <span class="re-right"><button type="button" class="ghost re-cancel">やめる</button><button type="submit" class="primary re-save">保存</button></span>
      </div>
    </form>`;
    document.body.appendChild(dlg);
    const q = <T extends HTMLElement>(s: string) => dlg.querySelector<T>(s)!;
    dlg.addEventListener("close", () => dlg.remove());
    q(".re-cancel").addEventListener("click", () => dlg.close());
    q(".re-del").addEventListener("click", () => {
      if (!confirm(`「${w.name}」の帳面を消しますか？\nこの帳面の決まりが全部なくなります。消すと戻せません。\nはじめの帳面に戻ります。`)) return;
      store.setWorkshops(removeWorkshop(store.workshops(), w.id));
      dlg.close();
      refresh();
      flash(`「${w.name}」の帳面を消しました。`);
    });
    q("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = q<HTMLInputElement>(".re-title").value.trim();
      if (!name) {
        const err = q(".re-err");
        err.textContent = "名前は、空にできません。";
        err.hidden = false;
        return;
      }
      store.setWorkshops(renameWorkshop(store.workshops(), w.id, name));
      dlg.close();
      refresh();
    });
    dlg.showModal();
    dlg.tabIndex = -1;
    dlg.focus();
  }

  // ---- 職人の決まり（札） ----
  function card(r: Rule): string {
    const who = r.source.kind === "craftsman" ? r.source.name : "";
    return `<li class="rule-card">
      <p class="rc-title">${esc(r.title)}</p>
      <p class="rc-text">${esc(r.text)}</p>
      ${r.quote ? `<blockquote>「${esc(r.quote)}」</blockquote>` : ""}
      ${r.calc === "tension" ? `<p class="rc-calc"><a class="linklike" href="studio.html#tension">この決まりの計算を、設計の画面で見る →</a></p>` : ""}
      <p class="rc-meta"><span>${who ? `職人：${esc(who)}` : ""} ・ ${esc(r.date)}</span><span class="rc-acts"><span class="rc-video" data-rule="${esc(r.id)}"></span><button type="button" class="linklike rc-del" data-edit-rule="${esc(r.id)}">編集</button></span></p>
    </li>`;
  }

  function renderCards() {
    const rules = activeRules(store.ledger());
    const mine = rules.filter((r) => r.source.kind === "craftsman");
    const others = rules.filter((r) => r.source.kind !== "craftsman");
    $(".rule-cards").innerHTML = mine.length
      ? mine.map(card).join("")
      : `<li class="empty-card"><p>職人の決まりは、まだありません。</p><button type="button" class="primary to-ask">Claude の質問に答える</button></li>`;
    root.querySelector(".to-ask")?.addEventListener("click", () => openInterview());
    void attachVideos();
    const pub = $(".public-rules");
    pub.hidden = !others.length;
    $(".public-sum").textContent = `資料から入れた決まり ${others.length}`;
    const src = (r: Rule) => (r.source.kind === "public" && r.source.url ? `<a href="${esc(r.source.url)}" target="_blank" rel="noopener">${esc(sourceLabel(r.source))}</a>` : esc(sourceLabel(r.source)));
    const item = (r: Rule) => `<li class="rule-card">
      <p class="rc-title">${esc(r.title)}${r.unverified ? ` <span class="tag warn">未確認</span>` : ""}${r.source.kind === "provisional" ? ` <span class="tag">仮</span>` : ""}</p>
      <p class="rc-text">${esc(r.text)}</p>
      <p class="rc-meta"><span>${src(r)} ・ ${esc(r.date)}</span><button type="button" class="linklike rc-del" data-edit-rule="${esc(r.id)}">編集</button></p>
    </li>`;
    $(".rule-cards.pub").innerHTML = others.map(item).join("");
    bindRuleEdit();
  }

  /** 職人が動画で見せた答えがあれば、札に再生のボタンを出す */
  async function attachVideos() {
    for (const slot of root.querySelectorAll<HTMLElement>(".rc-video")) {
      const blob = await getVideo(`rule:${slot.dataset.rule}`);
      if (!blob) continue;
      slot.innerHTML = `<button type="button" class="ghost tiny">▶ 見せた動画</button>`;
      slot.querySelector("button")!.addEventListener("click", () => {
        slot.closest(".rule-card")!.insertAdjacentHTML("beforeend", `<video class="rc-player" src="${URL.createObjectURL(blob)}" controls playsinline autoplay></video>`);
        slot.innerHTML = "";
      });
    }
  }

  // ---- Claude から質問 ----
  function renderAskCard(gapId?: string) {
    const box = $(".iv-card");
    const gaps = ringGaps(store.ledger());
    // 決まりを消して新しく出た質問は、すぐ見せる（読み直すまで順番の後ろに隠れていた）
    const fresh = freshGap(askKnown, gaps);
    if (fresh) askPinned = fresh.id;
    askKnown = new Set(gaps.map((g) => g.id));
    if (!gaps.length) {
      box.hidden = true;
      return;
    }
    const q = (gapId && gaps.find((g) => g.id === gapId)) || (askPinned && gaps.find((g) => g.id === askPinned)) || gaps[laterCount() % gaps.length];
    box.hidden = false;
    box.innerHTML = `
      <p class="eyebrow">Claude から質問が 1 つあります</p>
      <p class="iv-q">${esc(q.question)}</p>
      <div class="ask-acts">${canListen() ? `<button type="button" class="primary voice-cta speak">${MIC}話して答える</button><button type="button" class="ghost answer">書いて答える</button>` : `<button type="button" class="primary answer">答える</button>`}<button type="button" class="ghost later">あとで</button>${gaps.length > 1 ? `<span class="small muted">ほかに ${gaps.length - 1}</span>` : ""}</div>`;
    box.querySelector(".answer")!.addEventListener("click", () => openInterview(q.id));
    box.querySelector(".speak")?.addEventListener("click", () => {
      openInterview(q.id);
      interview?.listen();
    });
    box.querySelector(".later")!.addEventListener("click", () => {
      setLater(laterCount() + 1);
      askPinned = undefined;
      renderAskCard();
    });
  }

  function openInterview(gapId?: string) {
    const box = $(".iv-card");
    box.hidden = false;
    box.innerHTML = "";
    interview = mountInterview(box, ringTarget(), { onApplied: () => renderCards() });
    interview.focus(gapId);
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function route(sub: string) {
    const gap = new URLSearchParams(sub.split("?")[1] ?? "").get("gap");
    if (gap) openInterview(gap);
  }

  function inboxItem(g: QuestionGroup, i: number): string {
    return `<li>
      <div class="q-line"><p class="q-text">${esc(g.question)}</p><span class="q-count">${g.count > 1 ? `${g.count} 回 届きました` : "1 回 届きました"}</span></div>
      <p class="q-why">${esc(g.whyUnanswered)}</p>
      <div class="answer-slot"><button type="button" class="primary voice-cta" data-answer="${i}">${canListen() ? MIC : ""}答える</button></div>
      <button type="button" class="linklike q-del" data-del-q="${i}">この質問を消す</button>
    </li>`;
  }

  /** 答える欄を開く。g がなければ、質問なしで思いついたことを残す */
  function openAnswer(li: HTMLElement, g?: QuestionGroup) {
    const slot = li.querySelector<HTMLElement>(".answer-slot") ?? li;
    slot.innerHTML = `<div class="answer-box">
      <textarea rows="3" placeholder="${canListen() ? "「話す」を押して話すと、ここに文字が入ります。書いてもかまいません。" : "答えを書いてください。"}"></textarea>
      <div class="row"><button type="button" class="mic">${MIC}話す</button><label class="ghost btnlike show-vid">動画で見せる<input type="file" accept="video/*" capture="environment" hidden></label><button type="button" class="primary make">決まりにする</button></div>
      <p class="small vid-name" hidden></p>
      <p class="small box-status"></p>
      <div class="proposal-slot"></div>
    </div>`;
    const field = slot.querySelector("textarea")!;
    const st = (t: string) => (slot.querySelector(".box-status")!.textContent = t);
    const voice = bindVoice(slot.querySelector<HTMLButtonElement>(".mic")!, field, { onError: st });
    // 言葉で言いにくいことは、10 秒ほど動画で見せて答えられる（決まりと一緒に残り、「言葉で聞く」の答えに出る）
    slot.querySelector<HTMLInputElement>(".show-vid input")!.addEventListener("change", (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      shownVideo.set(slot, f);
      const n = slot.querySelector<HTMLElement>(".vid-name")!;
      n.hidden = false;
      n.textContent = `動画をつけました：${f.name}（決まりと一緒に残ります）`;
      if (!field.value.trim()) field.value = "（動画で見せた）";
    });
    // 「話す」は押すまで聞かない（開いただけでマイクが始まっていた）
    slot.querySelector<HTMLButtonElement>(".make")!.addEventListener("click", () => {
      voice.stop();
      void makeRule(slot, field.value.trim(), g, st);
    });
  }

  async function makeRule(slot: HTMLElement, said: string, g: QuestionGroup | undefined, st: (t: string) => void) {
    if (!said) {
      st("答えを話すか、書いてください。");
      return;
    }
    const ledger = store.ledger();
    const name = masterName(ledger);
    const password = store.password() || (await askPassword());
    const propSlot = slot.querySelector<HTMLElement>(".proposal-slot")!;
    const fallback = (why: string) => {
      st(why);
      void showProposal(propSlot, { title: g ? g.question.replace(/[？?]$/, "") : said.slice(0, 20), text: said, reason: "（理由はまだ聞いていない）", quote: said }, g);
    };
    if (!password) return fallback("合言葉がないので、話した言葉をそのまま案にしました。直してから足せます。");
    st("Claude が決まりの案にまとめています…");
    const host: ToolHost<null> = {
      setSetting: () => Promise.reject(new Error("使わない")),
      setShank: () => Promise.reject(new Error("使わない")),
      check: () => Promise.reject(new Error("使わない")),
      look: () => Promise.reject(new Error("使わない")),
      snapshot: () => null,
      restore: () => undefined,
      proposeRule: (input) => {
        st("");
        return showProposal(propSlot, input, g);
      },
    };
    const r = await runClaude({
      host,
      messages: [{ role: "user", content: g ? `学ぶ人の質問：${g.question}\n${name}さんの答え：${said}` : `${name}さんが話したこと：${said}` }],
      system: keepPrompt(ledger, name),
      tools: TOOLS.filter((t) => t.name === "propose_rule"),
      password,
      maxTurns: 3,
    });
    if (r.offline || (r.error && !r.log.some((e) => e.kind === "tool"))) {
      if (r.error?.code === "wrong_password") resetPassword();
      fallback(`Claude につながらないので、話した言葉をそのまま案にしました。${r.error?.message ? `（${r.error.message}）` : ""}`);
    }
  }

  function showProposal(slot: HTMLElement, p: ProposeRuleInput, g?: QuestionGroup): Promise<ProposeRuleResult> {
    return new Promise((resolve) => {
      slot.innerHTML = `<div class="proposal">
        <p class="small">決まりの案です。直してから足せます。</p>
        <label>短い名前<input data-p="title" value="${esc(p.title)}"></label>
        <label>決まり<textarea data-p="text" rows="2">${esc(p.text)}</textarea></label>
        <label>なぜ<textarea data-p="reason" rows="2">${esc(p.reason)}</textarea></label>
        ${p.quote ? `<blockquote>「${esc(p.quote)}」</blockquote>` : ""}
        <div class="row"><button type="button" class="primary" data-a="ok">これでいい</button><button type="button" class="ghost" data-a="no">いらない</button></div>
      </div>`;
      const read = (k: string) => slot.querySelector<HTMLInputElement>(`[data-p="${k}"]`)!.value.trim();
      slot.querySelectorAll<HTMLButtonElement>("[data-a]").forEach((b) =>
        b.addEventListener("click", () => {
          if (!b.isConnected) return;
          if (b.dataset.a === "no") {
            slot.innerHTML = `<p class="small">見送りました。</p>`;
            resolve({ status: "declined", note: "職人が見送った" });
            return;
          }
          if (!askConfirm("この決まりを帳面に入れますか？\n設計の確かめと、学ぶ人への答えに使われます。")) return;
          const ed = { title: read("title"), text: read("text"), reason: read("reason") };
          // 押したらすぐ案を消す。2 度押しで同じ決まりが 2 つ入らないように。答えの欄も空にして、同じ言葉から案を作り直さないように
          slot.innerHTML = `<p class="small">足しました：${esc(ed.title)}</p>`;
          const box = slot.closest(".answer-box");
          const asked = box?.querySelector("textarea");
          if (asked) asked.value = "";
          const said = box?.querySelector(".box-status");
          if (said) said.textContent = "";
          const next = addRule(store.ledger(), { ...ed, example: p.example, quote: p.quote, param: p.param, value: p.value, steps: p.steps, source: { kind: "craftsman", name: masterName(store.ledger()) }, date: today() });
          const id = next.rules[next.rules.length - 1].id;
          let holder: HTMLElement | null = slot;
          while (holder && !shownVideo.has(holder)) holder = holder.parentElement;
          const vid = holder ? shownVideo.get(holder) : undefined;
          if (vid) void putVideo(`rule:${id}`, vid);
          store.setLedger(next);
          if (g) store.setQueue(markAnswered(store.queue(), g.ids, id));
          const changed = ed.title !== p.title || ed.text !== p.text || ed.reason !== p.reason;
          resolve(changed ? { status: "edited", rule_id: id, note: `職人が直した：${ed.text}（理由：${ed.reason}）` } : { status: "accepted", rule_id: id });
          flash(`帳面に足しました：${ed.title}`);
          refresh();
        }),
      );
    });
  }

  function flash(t: string) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = t;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function book(): string {
    const answered = groupQuestions(store.queue(), { includeAnswered: true })
      .filter((g) => g.answeredRuleId)
      .map((g) => ({ question: g.question, count: g.count, ruleId: g.answeredRuleId }));
    const motions = savedRecords().map((r) => ({ title: r.title, craftsman: r.craftsman, date: r.date, videoName: r.videoName, durationS: r.durationS, metrics: summarizeMetrics(r.metrics), notes: r.notes.map((n) => ({ t: n.t, text: n.text })) }));
    return bookHtml({ ledger: store.ledger(), answered, motions, date: today() });
  }


  let motionMounted = false;
  function openPanel(which: string) {
    const panel = $(`.${which}-panel`);
    panel.hidden = false;
    if (which === "motion" && !motionMounted) {
      motionMounted = true;
      mountMotion($(".motion-root"), {
        // 手本として残したら、動画もこのブラウザにしまい、「学ぶ」の「手の動きで比べる」に出す
        onSaved: (r, video) => {
          if (!video) return;
          void putVideo(r.id, video).then(() => {
            flash(`手本として残しました：${r.title}（学ぶ に出ます）`);
            refresh();
            opts.onExampleSaved?.();
          });
        },
      });
    }
    if (which === "free" && !$(".free-body").childElementCount) openAnswer($(".free-body"));
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  root.querySelectorAll<HTMLButtonElement>("[data-open]").forEach((b) => b.addEventListener("click", () => openPanel(b.dataset.open!)));
  root.querySelectorAll<HTMLButtonElement>(".panel .close").forEach((b) => b.addEventListener("click", () => (b.closest<HTMLElement>(".panel")!.hidden = true)));
  $(".print").addEventListener("click", () => {
    printHtml(book());
  });

  root.querySelectorAll<HTMLButtonElement>(".keep-basics button").forEach((b) =>
    b.addEventListener("click", () => {
      store.setLedger(setBasics(store.ledger(), { prongTip: b.dataset.tip as "round" | "oni" }));
      refresh();
    }),
  );

  // 工房の名前を変える（ここ 1 か所。帳面・学ぶ・技・スタジオのどこでもこの名前になる）
  $(".ws-switch select").addEventListener("change", (e) => {
    store.setWorkshops(setActive(store.workshops(), (e.target as HTMLSelectElement).value));
    refresh();
  });
  $(".rename").addEventListener("click", () => {
    if (store.workshops().active !== MAIN) return openWorkshopEditor();
    const head = $(".keep-name");
    if (head.querySelector(".rename-form")) return;
    head.insertAdjacentHTML("beforeend", `<form class="rename-form"><input value="${esc(store.mainName())}" aria-label="工房の名前" maxlength="24"><button type="submit" class="primary">決める</button></form>`);
    const form = head.querySelector<HTMLFormElement>(".rename-form")!;
    const input = form.querySelector("input")!;
    input.select();
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      store.setMainName(input.value);
      form.remove();
      refresh();
    });
  });

  refresh();
  return {
    refresh() {
      refresh();
      interview?.refresh();
    },
    route(sub: string) {
      route(sub);
      // 「学ぶ」の「手本を撮る」から来たとき
      if (sub === "motion") openPanel("motion");
    },
  };
}
