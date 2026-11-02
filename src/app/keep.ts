// 残す：職人の画面。学ぶ人から届いた質問（似たものはまとめてある）に、空いた時間に声で答えるだけ。
// 答えは Claude が決まりの案にまとめ、職人が見て「これでいい」を押すと目安帳に入る。次からは「聞く」で答えられる。
// ほかに、手本を撮る（手の動きの記録）、帳面を見る・印刷する。
import { runClaude } from "../claude/loop";
import { keepPrompt } from "../claude/prompt";
import { TOOLS, type ProposeRuleInput, type ProposeRuleResult, type ToolHost } from "../claude/tools";
import { summarizeMetrics } from "../craft/motion";
import { bookHtml } from "../rules/book";
import { activeRules, addRule, type Rule } from "../rules/ledger";
import { groupQuestions, markAnswered, type QuestionGroup } from "../rules/teacher-queue";
import { mountMotion, savedRecords } from "../ui/motion-ui";
import { masterName } from "./master";
import { putVideo } from "./video-store";
import { askPassword, resetPassword } from "./password";
import { esc, store, today } from "./store";
import { bindVoice, canListen } from "./voice";

const MIC = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-2.1A7 7 0 0 0 19 12h-2Z" fill="currentColor"/></svg>`;

/** 答える欄ごとに、職人が見せた動画 */
const shownVideo = new WeakMap<HTMLElement, File>();

export function mountKeep(root: HTMLElement, opts: { onExampleSaved?: () => void } = {}): { refresh(): void } {
  root.innerHTML = `
  <section class="view keep">
    <header class="view-head">
      <p class="eyebrow">職人の画面</p>
      <h2 class="keep-title"></h2>
      <p class="lead">作業を撮るだけで手本になります。届いた質問には、空いた時間に声か動画で答えるだけ。答えは決まりになって、次の人に届きます。</p>
    </header>
    <div class="block tiles">
      <button type="button" class="tile" data-open="motion"><b>手本を撮る</b><small>作業を撮るだけ。話さなくていい。手の動きを数字にして、学ぶ人の動画と比べられます</small></button>
      <button type="button" class="tile" data-open="book"><b>帳面を見る</b><small class="book-sub"></small></button>
    </div>
    <div class="block panel motion-panel" hidden><div class="panel-head"><h3>手本を撮る</h3><button type="button" class="ghost close">閉じる</button></div><div class="motion-root"></div></div>
    <div class="block panel book-panel" hidden><div class="panel-head"><h3>帳面</h3><div class="row"><button type="button" class="ghost print">印刷する</button><button type="button" class="ghost close">閉じる</button></div></div><ul class="book-list"></ul></div>
    <div class="block">
      <h3>届いている質問 <small class="inbox-count"></small></h3>
      <ul class="inbox"></ul>
      <details class="free">
        <summary>質問がなくても、思いついたことを話して残す</summary>
        <div class="free-body"></div>
      </details>
    </div>
  </section>`;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;

  function refresh() {
    const ledger = store.ledger();
    const name = masterName(ledger);
    $(".keep-title").textContent = `${name}さんへ`;
    const groups = groupQuestions(store.queue()).filter((g) => !g.answeredRuleId);
    $(".inbox-count").textContent = groups.length ? `${groups.length} 件（似た質問はまとめてあります）` : "";
    $(".inbox").innerHTML = groups.length
      ? groups.map((g, i) => inboxItem(g, i)).join("")
      : `<li class="inbox-empty">今、届いている質問はありません。「聞く」で答えられなかった質問がここに届きます。</li>`;
    root.querySelectorAll<HTMLButtonElement>(".inbox [data-answer]").forEach((b) =>
      b.addEventListener("click", () => openAnswer(b.closest("li")!, groups[Number(b.dataset.answer)])),
    );
    const mine = activeRules(ledger).filter((r) => r.source.kind === "craftsman");
    $(".book-sub").textContent = `残した決まり ${mine.length} ・ 手の記録 ${savedRecords().length} ・ 印刷できます`;
    renderBook();
  }

  function inboxItem(g: QuestionGroup, i: number): string {
    return `<li>
      <div class="q-line"><p class="q-text">${esc(g.question)}</p><span class="q-count">${g.count > 1 ? `${g.count} 人から` : "1 人から"}</span></div>
      <p class="q-why">${esc(g.whyUnanswered)}</p>
      <div class="answer-slot"><button type="button" class="primary voice-cta" data-answer="${i}">${MIC}${canListen() ? "声で答える" : "答える"}</button></div>
    </li>`;
  }

  /** 答える欄を開く。g がなければ、質問なしで思いついたことを残す */
  function openAnswer(li: HTMLElement, g?: QuestionGroup) {
    const slot = li.querySelector<HTMLElement>(".answer-slot") ?? li;
    slot.innerHTML = `<div class="answer-box">
      <textarea rows="3" placeholder="${canListen() ? "マイクを押して話すと、ここに文字が入ります。書いてもかまいません。" : "答えを書いてください。"}"></textarea>
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
    if (canListen()) slot.querySelector<HTMLButtonElement>(".mic")!.click();
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
          if (b.dataset.a === "no") {
            slot.innerHTML = `<p class="small">見送りました。</p>`;
            resolve({ status: "declined", note: "職人が見送った" });
            return;
          }
          const ed = { title: read("title"), text: read("text"), reason: read("reason") };
          const next = addRule(store.ledger(), { ...ed, example: p.example, quote: p.quote, param: p.param, value: p.value, source: { kind: "craftsman", name: masterName(store.ledger()) }, date: today() });
          const id = next.rules[next.rules.length - 1].id;
          let holder: HTMLElement | null = slot;
          while (holder && !shownVideo.has(holder)) holder = holder.parentElement;
          const vid = holder ? shownVideo.get(holder) : undefined;
          if (vid) void putVideo(`rule:${id}`, vid);
          store.setLedger(next);
          if (g) store.setQueue(markAnswered(store.queue(), g.ids, id));
          const changed = ed.title !== p.title || ed.text !== p.text || ed.reason !== p.reason;
          resolve(changed ? { status: "edited", rule_id: id, note: `職人が直した：${ed.text}（理由：${ed.reason}）` } : { status: "accepted", rule_id: id });
          flash(`目安帳に足しました：${ed.title}`);
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

  function renderBook() {
    const rules = activeRules(store.ledger());
    const mine = rules.filter((r) => r.source.kind === "craftsman");
    const others = rules.filter((r) => r.source.kind !== "craftsman");
    const item = (r: Rule) => `<li><b>${esc(r.title)}</b><p>${esc(r.text)}</p><p class="small">なぜ：${esc(r.reason)}</p>${r.quote ? `<blockquote>「${esc(r.quote)}」</blockquote>` : ""}<p class="small muted">${esc(r.source.kind === "craftsman" ? `${r.source.name}さん` : r.source.kind === "public" ? `公開情報：${r.source.title}` : "仮の目安")} ・ ${esc(r.date)}</p></li>`;
    $(".book-list").innerHTML = mine.map(item).join("") + (others.length ? `<li class="sep">公開情報の目安（${others.length}）</li>${others.map(item).join("")}` : "");
  }

  function book(): string {
    const answered = groupQuestions(store.queue(), { includeAnswered: true })
      .filter((g) => g.answeredRuleId)
      .map((g) => ({ question: g.question, count: g.count, ruleId: g.answeredRuleId }));
    const motions = savedRecords().map((r) => ({ title: r.title, craftsman: r.craftsman, date: r.date, videoName: r.videoName, durationS: r.durationS, metrics: summarizeMetrics(r.metrics), notes: r.notes.map((n) => ({ t: n.t, text: n.text })) }));
    return bookHtml({ ledger: store.ledger(), answered, motions, date: today() });
  }

  let motionMounted = false;
  root.querySelectorAll<HTMLButtonElement>("[data-open]").forEach((b) =>
    b.addEventListener("click", () => {
      const which = b.dataset.open!;
      const panel = $(`.${which}-panel`);
      panel.hidden = false;
      if (which === "motion" && !motionMounted) {
        motionMounted = true;
        mountMotion($(".motion-root"), {
          // 手本として残したら、動画もこのブラウザにしまい、「見る」に出す
          onSaved: (r, video) => {
            if (!video) return;
            void putVideo(r.id, video).then(() => {
              flash(`手本として残しました：${r.title}（「見る」に出ます）`);
              refresh();
              opts.onExampleSaved?.();
            });
          },
        });
      }
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }),
  );
  root.querySelectorAll<HTMLButtonElement>(".panel .close").forEach((b) => b.addEventListener("click", () => (b.closest<HTMLElement>(".panel")!.hidden = true)));
  $(".print").addEventListener("click", () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(book());
    w.document.close();
  });
  const freeBody = $(".free-body");
  $(".free").addEventListener("toggle", () => {
    if ($<HTMLDetailsElement>(".free").open && !freeBody.childElementCount) openAnswer(freeBody);
  });

  refresh();
  return { refresh };
}
