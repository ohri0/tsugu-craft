// 聞く：学ぶ人が、職人の残した決まりに質問する。答えは短く、「なぜ？」で理由と職人の言葉が開く。
// 目安帳で答えられないことは、職人への質問（帳面の「届いている質問」）に回す。
// Claude につながらないときは、目安帳から近い決まりを探して出す（デモが止まらないように）。
import { parseAskAnswer, type AskAnswer } from "../claude/answer";
import { runClaude } from "../claude/loop";
import { offlineWhy } from "../claude/words";
import { askPrompt, askPromptText } from "../claude/prompt";
import { TOOLS, type ToolHost } from "../claude/tools";
import type { ClaudeMessageParam } from "../claude/wire";
import { LEARN_SUGGEST, openQuestions, WAZA_ORDER } from "../rules/flow";
import type { HowtoId } from "../rules/howto-steps";
import { sourceLabel, type Rule } from "../rules/ledger";
import { isTechId, techLedgerText } from "../rules/techniques";
import { findRules, prongSizeAnswer } from "../rules/search";
import { checkProngAnswer, prongLearnAnswer, prongLearnColumns, prongLearnFacts, type ProngLearnFacts } from "../rules/prong-learn";
import { addQuestion } from "../rules/teacher-queue";
import { isMihonSource, learnNav, techName, techPicker, techRules } from "./flow-view";
import { flowUI, isMihon, MIHON_NAME, MIHON_UNKNOWN } from "./mihon";
import { esc, store, today } from "./store";
import { bindVoice } from "./voice";
import { askPassword, resetPassword } from "./password";
import { GUIDE_NOTE } from "../rules/guides";
import { mmText } from "../rules/prong-points";
import { bookLabel, masterName, ruleQuote } from "./master";
import { getVideo } from "./video-store";

export function mountAsk(root: HTMLElement): { refresh(): void; route(tech?: string): void } {
  const flow = flowUI();
  root.innerHTML = `
  <section class="view ask${flow ? " in-flow" : ""}">
    ${flow ? `<div class="fl-slot"></div><div class="tech-pick-slot"></div>` : ""}
    <header class="view-head learn-head">
      <div><h2>職人に聞く</h2><p class="lead">帳面の決まりから、理由つきで答えます。</p></div>
      <a class="ghost btnlike to-hands" href="#learn/hands">手の動きで比べる ›</a>
    </header>
    <div class="master-card">
      <div class="avatar" aria-hidden="true"></div>
      <div class="who"><b class="master-title"></b><small class="master-sub"></small></div>
      <div class="master-stats"></div>
    </div>
    <div class="thread" aria-live="polite">
      <div class="empty">
        <p class="master-lead"></p>
        ${flow && !isMihon() ? `<p class="learn-pw" hidden><span>いまは Claude なしで、帳面から探します（合言葉は右上）。</span></p>` : ""}
        ${flow ? `<p class="chips-h">例を押すと、すぐ聞けます</p>` : ""}
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
  /** いま学んでいる技 */
  let tech: HowtoId = "ring";

  /** 答える人の呼び名（指輪の帳面は工房の名前、ほかの技も同じ工房の職人に回す） */
  const whoLabel = () => (isMihon() ? MIHON_NAME : bookLabel(store.ledger()));
  const rulesNow = (): Rule[] => techRules(tech) as unknown as Rule[];

  function refresh() {
    const ledger = store.ledger();
    const label = whoLabel();
    const all = rulesNow();
    const mine = all.filter((r) => r.source.kind === "craftsman");
    $(".avatar").textContent = label.slice(0, 1);
    $(".master-title").textContent = flow ? label : `${label}の技`;
    $(".master-sub").textContent = flow ? (isMihon() ? "作り話の例" : `職人：${masterName(store.mainLedger())}`) : `宝飾の彫金 ・ 職人：${masterName(ledger)}`;
    const unknown = flow && !mine.length ? "この技の職人の言葉は、まだありません。今は資料の決まりから答えます。" : "";
    const open = openQuestions(store.queue(), tech).length;
    if (flow) {
      // 数だけを並べると何の数か分からなかった（2026-11-06）。言葉で 1 行に
      $(".master-lead").textContent = unknown || `帳面から、職人の言葉つきで答えます。帳面にないことは、${label}に質問が届きます。`;
      $(".master-stats").innerHTML = `<span class="ms-line">決まり <b>${all.length}</b>（${isMihon() ? "残した" : "職人の言葉"} <b>${mine.length}</b>）${open ? ` ・ <i class="alert">返事待ちの質問 <b>${open}</b></i>` : ""}</span>`;
      const pw = root.querySelector<HTMLElement>(".learn-pw");
      if (pw) {
        pw.hidden = !!store.password();
        // 合言葉のボタンは上の帯に 1 つだけ（同じボタンが 2 つあると、どちらを押すか迷う）
      }
    } else {
      $(".master-lead").textContent = `${unknown}下の例を押すか、書いて聞いてください。帳面の決まり ${all.length} から答えます。答えられないことは${label}に回します。`;
      $(".master-stats").innerHTML = `<span><b>${all.length}</b>決まり</span><span><b>${mine.length}</b>${isMihon() ? "残した" : "職人"}</span><span><b>${open}</b>質問中</span>`;
    }
    if (flow) {
      $(".fl-slot").innerHTML = learnNav(tech, "ask");
      $(".to-hands").setAttribute("href", `#learn/hands/${tech}`);
      if (!$(".tech-pick-slot").childElementCount) {
        $(".tech-pick-slot").innerHTML = techPicker(tech, WAZA_ORDER, "どの技を学びますか");
        $<HTMLSelectElement>(".tech-pick-slot select").addEventListener("change", (e) => (location.hash = `#learn/${(e.target as HTMLSelectElement).value}`));
      }
      $<HTMLSelectElement>(".tech-pick-slot select").value = tech;
    }
  }

  function renderChips() {
    const list = [...LEARN_SUGGEST[tech], ...(isMihon() && tech === "kebori" ? [MIHON_UNKNOWN] : [])];
    $(".chips").innerHTML = list.map((s) => `<button type="button" class="chip">${esc(s)}</button>`).join("");
    root.querySelectorAll<HTMLButtonElement>(".chip").forEach((b) => b.addEventListener("click", () => void ask(b.textContent ?? "")));
  }
  renderChips();

  /** 別の技へ。話の流れは技ごとに分ける（ちがう技の帳面の話が混ざらないように） */
  function route(next?: string) {
    const id = (next && (next === "ring" || isTechId(next)) ? next : flow && (store.lastTech() === "ring" || isTechId(store.lastTech())) ? store.lastTech() : "ring") as HowtoId;
    if (next) store.setLastTech(id);
    if (id !== tech) {
      tech = id;
      messages = [];
      thread.querySelectorAll(".q, .a").forEach((el) => el.remove());
      $(".empty").hidden = false;
      status("");
      renderChips();
    }
    refresh();
  }

  function bubble(cls: string, html: string): HTMLElement {
    $(".empty").hidden = true;
    const el = document.createElement("div");
    el.className = cls;
    el.innerHTML = html;
    thread.appendChild(el);
    el.scrollIntoView({ block: "end", behavior: "smooth" });
    return el;
  }

  /** 決まりの出どころ（見本は作り話と書く。公開の資料はリンクつき） */
  function srcLine(r: Rule): string {
    if (isMihonSource(r)) return `作り話の例 ・ ${esc(MIHON_NAME)}`;
    return r.source.kind === "public" && r.source.url ? `<a href="${esc(r.source.url)}" target="_blank" rel="noopener">${esc(sourceLabel(r.source))}</a>` : esc(sourceLabel(r.source));
  }

  function ruleBlock(r: Rule): string {
    const q = ruleQuote(r);
    return `<div class="evidence">
      ${q ? `<blockquote>「${esc(q)}」</blockquote>` : ""}
      <p class="ev-rule">決まり：${esc(r.title)}</p>
      <div class="ev-video" data-rule="${esc(r.id)}" hidden></div>
      <p class="ev-src">${srcLine(r)}${r.unverified ? " ・ 未確認" : ""} ・ ${esc(r.date)}</p>
    </div>`;
  }

  /** 答えのすぐ下に、もとにした言葉（職人の言葉はそのまま、資料は出どころ）。押さなくても見える */
  function voiceBlock(rules: Rule[], short: string): string {
    const r = rules.find((x) => x.source.kind === "craftsman" && ruleQuote(x)) ?? rules[0];
    if (!flow || !r) return "";
    const q = r.source.kind === "craftsman" ? ruleQuote(r) : "";
    // 答えが職人の言葉そのままなら、同じ文を二度出さない
    return `<div class="a-voice${q ? " quoted" : ""}">${q && q !== short.trim() ? `<blockquote>「${esc(q)}」</blockquote>` : ""}<small>${srcLine(r)}${r.unverified ? " ・ 未確認" : ""} ・ ${esc(r.date)}</small></div>`;
  }

  /**
   * 爪の太さの問いの、職人の点と推測の値の小さな表（設計の画面の pt-table と同じ見た目）。
   * 数字はすべて画面の計算（src/rules/prong-learn.ts）。職人の点は「職人」、推し量った値は「推測」の印
   */
  function prongBlock(f: ProngLearnFacts): string {
    const cols = prongLearnColumns(f);
    const tag = (by: string) => (by === "craftsman" ? `<i class="pt-c">職人</i>` : `<i class="pt-g">推測</i>`);
    const cls = (by: string) => (by === "craftsman" ? "is-c" : "is-g");
    const typical = cols.some((c) => c.typical);
    return `<div class="pt-learn">
      <table class="pt-table"><thead><tr><th>石の大きさ（mm）</th>${cols.map((c) => `<th${c.now ? ` class="pt-now"` : ""}>${mmText(c.stoneMm)}</th>`).join("")}</tr></thead><tbody>
        <tr><th>爪の最低（mm）</th>${cols.map((c) => `<td class="${cls(c.min.by)}">${c.min.value.toFixed(2)}${tag(c.min.by)}</td>`).join("")}</tr>
        ${typical ? `<tr><th>ふつう（mm）</th>${cols.map((c) => (c.typical ? `<td class="${cls(c.typical.by)}">${mmText(c.typical.from)}〜${mmText(c.typical.to)}${tag(c.typical.by)}</td>` : "<td></td>")).join("")}</tr>` : ""}
      </tbody></table>
      ${f.size.longMm !== undefined || !f.asked ? `<p class="pt-how"><small>石の大きさ</small>${esc(f.size.read)}</p>` : ""}
      <p class="pt-how"><small>${f.exact ? "職人の言葉そのまま" : "推測の出し方"}</small>${esc(f.method)}</p>
      <p class="pt-src">職人：${esc(f.name)} ・ ${esc(f.date)}${f.exact ? "" : " ・ 推測は、職人がまだ確かめていない値"} ・ ${esc(GUIDE_NOTE)}</p>
    </div>`;
  }

  function answerCard(a: AskAnswer, rules: Rule[], via: "claude" | "local", asked: boolean, prong?: ProngLearnFacts | null, redone = false): string {
    const name = whoLabel();
    return `<p class="a-short">${esc(a.short)}</p>
      ${prong ? prongBlock(prong) : ""}
      ${voiceBlock(rules, a.short)}
      ${a.why || rules.length ? `<button type="button" class="why-btn" aria-expanded="false">なぜ？</button>
      <div class="a-why" hidden>${a.why ? `<p>${esc(a.why)}</p>` : ""}${rules.map(ruleBlock).join("")}</div>` : ""}
      <p class="a-meta">${asked ? `<span class="tag gold">${esc(name)}に回しました ・ 帳面に届きます</span>` : ""}${via === "local" && !isMihon() ? `<span class="tag">Claude なし ・ 帳面から探しました</span>` : ""}${redone ? `<span class="tag">Claude の数字が計算と合わないので、画面の計算で答えました</span>` : ""}${rules.length ? `<span>決まり ${rules.length} つから</span>` : ""}</p>
      ${asked && flow ? `<a class="linklike to-master" href="#waza/${tech}?step=answer">職人の画面で、届いた質問を見る ›</a>` : ""}`;
  }

  /** 職人が動画で見せた答えがあれば、なぜ？の中に出す */
  async function attachVideos(el: HTMLElement) {
    for (const box of el.querySelectorAll<HTMLElement>(".ev-video")) {
      const blob = await getVideo(`rule:${box.dataset.rule}`);
      if (!blob) continue;
      box.hidden = false;
      box.innerHTML = `<p class="small">職人：${esc(masterName(store.mainLedger()))}が見せた動画</p><video src="${URL.createObjectURL(blob)}" controls playsinline muted></video>`;
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
    const { queue, item } = addQuestion(store.queue(), { question, whyUnanswered: why, date: today(), ...(tech === "ring" ? {} : { technique: tech }) });
    store.setQueue(queue);
    return item.id;
  }

  function localAnswer(question: string, el: HTMLElement, reason: string) {
    const rules = rulesNow();
    const prong = tech === "ring" ? prongLearnFacts(question, rules) : null;
    const sized = tech === "ring" && !prong ? prongSizeAnswer(question, rules) : null;
    // 技の帳面は、職人の言葉を資料より先に出す（文字の重なりだけだと、言葉の多い資料が勝ってしまう）
    const hits = findRules(question, rules, 0.3, tech === "ring" ? 2 : 8);
    const found = tech === "ring" ? hits : [...hits.filter((r) => r.source.kind === "craftsman"), ...hits.filter((r) => r.source.kind !== "craftsman")].slice(0, 2);
    if (prong) {
      const r = rules.find((x) => x.id === prong.ruleId)!;
      el.innerHTML = answerCard({ ...prongLearnAnswer(prong), ruleIds: [r.id] }, [r], "local", false, prong);
    } else if (sized) {
      el.innerHTML = answerCard({ short: sized.short, why: sized.why, ruleIds: [sized.rule.id] }, [sized.rule], "local", false);
    } else if (found.length) {
      const r = found[0];
      el.innerHTML = answerCard({ short: r.text, why: r.reason, ruleIds: found.map((x) => x.id) }, found, "local", false);
    } else {
      sendToMaster(question, "帳面に近い決まりがなかった");
      const name = whoLabel();
      el.innerHTML = answerCard({ short: `${name}に聞いておきます。答えが届いたら、ここで答えられるようになります。`, why: "", ruleIds: [] }, [], "local", true);
    }
    wireWhy(el);
    status(reason);
  }

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    busy = true;
    field.value = "";
    if (flow) store.flowMark("asked", tech);
    bubble("q", esc(question));
    const el = bubble("a", `<p class="thinking"><span></span><span></span><span></span></p>`);
    const ledger = store.ledger();
    // 爪の太さの問いは、画面が先に職人の点から計算しておく（Claude は言い方だけ。数字はこの計算から）
    const prong = tech === "ring" ? prongLearnFacts(question, rulesNow()) : null;
    const password = store.password() || (await askPassword());
    if (!password) {
      localAnswer(question, el, isMihon() ? "" : "合言葉がないので、Claude なしで帳面から探しました。");
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
      system: tech === "ring" ? askPrompt(ledger, masterName(ledger), prong ?? undefined) : askPromptText(techLedgerText(store.techLedger(tech)), masterName(store.mainLedger()), techName(tech)),
      tools: TOOLS.filter((t) => t.name === "ask_teacher"),
      password,
      maxTurns: 3,
    });
    busy = false;
    if (r.offline || (r.error && !r.finalText)) {
      if (r.error?.code === "wrong_password") resetPassword();
      localAnswer(question, el, `Claude につながらないので、帳面から探しました。${offlineWhy(r.error?.message)}`);
      return;
    }
    messages = r.messages;
    const rules = rulesNow();
    let a = parseAskAnswer(r.finalText, rules.map((x) => x.id));
    let redone = false;
    if (prong && !asked) {
      // Claude の数字が、画面の計算（と問い・もとにした決まり）にあるか確かめる。合わなければ画面の計算の答えに替える
      const cited = a.ruleIds.map((id) => rules.find((x) => x.id === id)!).filter((x) => x && x.id !== prong.ruleId);
      const check = checkProngAnswer(`${a.short}\n${a.why}`, prong, question, cited);
      if (!check.ok) {
        a = { ...prongLearnAnswer(prong), ruleIds: [prong.ruleId, ...cited.map((x) => x.id)] };
        redone = true;
      } else if (!a.ruleIds.includes(prong.ruleId)) a = { ...a, ruleIds: [prong.ruleId, ...a.ruleIds] };
    }
    el.innerHTML = answerCard(a, a.ruleIds.map((id) => rules.find((x) => x.id === id)!).filter(Boolean), "claude", asked, asked ? null : prong, redone);
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
  // 合言葉を入れたら「Claude なし」の案内を消す
  window.addEventListener("tsugu:password", () => refresh());

  refresh();
  return { refresh, route };
}
