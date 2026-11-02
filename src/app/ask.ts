// 聞く：学ぶ人が、職人の残した決まりに質問する。答えは短く、「なぜ？」で理由と職人の言葉が開く。
// 目安帳で答えられないことは、職人への質問（残す）に回す。
// Claude につながらないときは、目安帳から近い決まりを探して出す（デモが止まらないように）。
import { parseAskAnswer, type AskAnswer } from "../claude/answer";
import { runClaude } from "../claude/loop";
import { askPrompt } from "../claude/prompt";
import { TOOLS, type ToolHost } from "../claude/tools";
import type { ClaudeMessageParam } from "../claude/wire";
import { activeRules, type Rule } from "../rules/ledger";
import { findRules } from "../rules/search";
import { addQuestion, groupQuestions } from "../rules/teacher-queue";
import { esc, store, today } from "./store";
import { bindVoice } from "./voice";
import { askPassword, resetPassword } from "./password";
import { masterName, ruleQuote } from "./master";
import { getVideo } from "./video-store";

const SUGGEST = ["ロウ付けの前、両端はどう削る？", "ヤスリをかけるとき、角度はどうする？", "どこまで削ればいい？", "金属を持つ手は、どうしておく？"];

export function mountAsk(root: HTMLElement): { refresh(): void } {
  root.innerHTML = `
  <section class="view ask">
    <div class="master-card">
      <div class="avatar" aria-hidden="true"></div>
      <div class="who"><b class="master-title"></b><small>宝飾の彫金職人 ・ ヤスリ・ロウ付け</small></div>
      <div class="master-stats"></div>
    </div>
    <div class="thread" aria-live="polite">
      <div class="empty">
        <h2>何でも聞いてください</h2>
        <p class="master-lead"></p>
        <div class="chips"></div>
      </div>
    </div>
    <form class="composer">
      <textarea rows="1" placeholder="書くか、マイクで話す" aria-label="質問"></textarea>
      <button type="button" class="icon voice" aria-label="声で聞く" title="声で聞く"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-2.1A7 7 0 0 0 19 12h-2Z" fill="currentColor"/></svg></button>
      <button type="submit" class="send">聞く</button>
    </form>
    <p class="status small"></p>
  </section>`;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const thread = $(".thread");
  const field = $<HTMLTextAreaElement>(".composer textarea");
  const status = (t: string) => ($(".status").textContent = t);
  let messages: ClaudeMessageParam[] = [];
  let busy = false;

  function refresh() {
    const ledger = store.ledger();
    const name = masterName(ledger);
    const mine = activeRules(ledger).filter((r) => r.source.kind === "craftsman");
    $(".avatar").textContent = name.slice(0, 1);
    $(".master-title").textContent = `${name}さんの技`;
    $(".master-lead").textContent = `${name}さんが残した決まり ${mine.length} 個から、理由つきで答えます。答えられないことは、${name}さんに回します。`;
    const open = groupQuestions(store.queue()).filter((g) => !g.answeredRuleId).length;
    $(".master-stats").innerHTML = `<span><b>${mine.length}</b>決まり</span><span><b>${open}</b>質問中</span>`;
  }

  $(".chips").innerHTML = SUGGEST.map((s) => `<button type="button" class="chip">${esc(s)}</button>`).join("");
  root.querySelectorAll<HTMLButtonElement>(".chip").forEach((b) => b.addEventListener("click", () => void ask(b.textContent ?? "")));

  function bubble(cls: string, html: string): HTMLElement {
    $(".empty").hidden = true;
    const el = document.createElement("div");
    el.className = cls;
    el.innerHTML = html;
    thread.appendChild(el);
    el.scrollIntoView({ block: "end", behavior: "smooth" });
    return el;
  }

  function ruleBlock(r: Rule): string {
    const q = ruleQuote(r);
    return `<div class="evidence">
      ${q ? `<blockquote>「${esc(q)}」</blockquote>` : ""}
      <p class="ev-rule">決まり：${esc(r.title)}</p>
      <div class="ev-video" data-rule="${esc(r.id)}" hidden></div>
      <p class="ev-src">${esc(r.source.kind === "craftsman" ? `${r.source.name}さん` : r.source.kind === "public" ? `公開情報：${r.source.title}` : "仮の目安")} ・ ${esc(r.date)}</p>
    </div>`;
  }

  function answerCard(a: AskAnswer, rules: Rule[], via: "claude" | "local", asked: boolean): string {
    const name = masterName(store.ledger());
    return `<p class="a-short">${esc(a.short)}</p>
      ${a.why || rules.length ? `<button type="button" class="why-btn" aria-expanded="false">なぜ？</button>
      <div class="a-why" hidden>${a.why ? `<p>${esc(a.why)}</p>` : ""}${rules.map(ruleBlock).join("")}</div>` : ""}
      <p class="a-meta">${asked ? `<span class="tag gold">${esc(name)}さんに回しました ・ 残す に届きます</span>` : ""}${via === "local" ? `<span class="tag">Claude なし ・ 目安帳から探しました</span>` : ""}${rules.length ? `<span>決まり ${rules.length} つから</span>` : ""}</p>`;
  }

  /** 職人が動画で見せた答えがあれば、なぜ？の中に出す */
  async function attachVideos(el: HTMLElement) {
    for (const box of el.querySelectorAll<HTMLElement>(".ev-video")) {
      const blob = await getVideo(`rule:${box.dataset.rule}`);
      if (!blob) continue;
      box.hidden = false;
      box.innerHTML = `<p class="small">${esc(masterName(store.ledger()))}さんが見せた動画</p><video src="${URL.createObjectURL(blob)}" controls playsinline muted></video>`;
    }
  }

  function wireWhy(el: HTMLElement) {
    void attachVideos(el);
    const b = el.querySelector<HTMLButtonElement>(".why-btn");
    const w = el.querySelector<HTMLElement>(".a-why");
    if (!b || !w) return;
    b.addEventListener("click", () => {
      w.hidden = !w.hidden;
      b.setAttribute("aria-expanded", String(!w.hidden));
      b.textContent = w.hidden ? "なぜ？" : "閉じる";
    });
  }

  function sendToMaster(question: string, why: string): string {
    const { queue, item } = addQuestion(store.queue(), { question, whyUnanswered: why, date: today() });
    store.setQueue(queue);
    return item.id;
  }

  function localAnswer(question: string, el: HTMLElement, reason: string) {
    const rules = activeRules(store.ledger());
    const found = findRules(question, rules);
    if (found.length) {
      const r = found[0];
      el.innerHTML = answerCard({ short: r.text, why: r.reason, ruleIds: found.map((x) => x.id) }, found, "local", false);
    } else {
      sendToMaster(question, "目安帳に近い決まりがなかった");
      const name = masterName(store.ledger());
      el.innerHTML = answerCard({ short: `${name}さんに聞いておきます。答えが届いたら、ここで答えられるようになります。`, why: "", ruleIds: [] }, [], "local", true);
    }
    wireWhy(el);
    status(reason);
  }

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    busy = true;
    field.value = "";
    bubble("q", esc(question));
    const el = bubble("a", `<p class="thinking"><span></span><span></span><span></span></p>`);
    const ledger = store.ledger();
    const password = store.password() || (await askPassword());
    if (!password) {
      localAnswer(question, el, "合言葉がないので、Claude なしで目安帳から探しました。");
      busy = false;
      return;
    }
    let asked = false;
    const host: ToolHost<null> = {
      setSetting: () => Promise.reject(new Error("使わない")),
      setShank: () => Promise.reject(new Error("使わない")),
      check: () => Promise.reject(new Error("使わない")),
      look: () => Promise.reject(new Error("使わない")),
      snapshot: () => null,
      restore: () => undefined,
      askTeacher: (input) => {
        asked = true;
        return { queued: true, id: sendToMaster(input.question, input.why_unanswered) };
      },
    };
    if (messages.length > 16) messages = [];
    messages = [...messages, { role: "user", content: question }];
    const r = await runClaude({
      host,
      messages,
      system: askPrompt(ledger, masterName(ledger)),
      tools: TOOLS.filter((t) => t.name === "ask_teacher"),
      password,
      maxTurns: 3,
    });
    busy = false;
    if (r.offline || (r.error && !r.finalText)) {
      if (r.error?.code === "wrong_password") resetPassword();
      localAnswer(question, el, `Claude につながらないので、目安帳から探しました。${r.error?.message ? `（${r.error.message}）` : ""}`);
      return;
    }
    messages = r.messages;
    const rules = activeRules(store.ledger());
    const a = parseAskAnswer(r.finalText, rules.map((x) => x.id));
    el.innerHTML = answerCard(a, a.ruleIds.map((id) => rules.find((x) => x.id === id)!).filter(Boolean), "claude", asked);
    wireWhy(el);
    status(r.remaining !== undefined ? `今日あと ${r.remaining} 回` : "");
  }

  $(".composer").addEventListener("submit", (e) => {
    e.preventDefault();
    void ask(field.value);
  });
  field.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void ask(field.value);
    }
  });
  field.addEventListener("input", () => {
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 140)}px`;
  });
  bindVoice($<HTMLButtonElement>(".voice"), field, { onError: status });

  refresh();
  return { refresh };
}
