// Claude の聞き取り：帳面の「まだ決まっていない所」を 1 つずつ職人に聞き、答えを決まりにする部品。
// 指輪の石留めの帳面にも、ほかの技の帳面にも使う（どれも src/rules/gaps.ts で見つける）。
// 合言葉があれば Claude が問いを言い直し、答えを決まりにまとめる。なければ、決まった問いと数字を読むしくみで動く（画面にそう書く）。
import { askConfirm } from "./confirm";
import { askGapPrompt, askGapUser, ASK_GAP, gapRulePrompt, gapRuleUser, GAP_RULE, parseAskGap, parseGapRule, type GapRuleOut } from "../claude/gap";
import { callTool } from "../rebuild/run";
import { freshGap, valueText, type AnswerResult, type Gap, type RuleDraft } from "../rules/gaps";
import { PARAMS, type ParamId } from "../rules/ledger";
import { flowUI, isMihon } from "./mihon";
import { askPassword, passwordButton, resetPassword } from "./password";
import { esc, store, today } from "./store";
import { bindVoice, canListen } from "./voice";

const MIC = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-2.1A7 7 0 0 0 19 12h-2Z" fill="currentColor"/></svg>`;

export interface InterviewTarget {
  /** 技の名前（Claude に渡す） */
  craft: string;
  gaps(): Gap[];
  /** Claude なしで答えを決まりの案に */
  draft(gap: Gap, answer: string, ctx: { name: string; date: string; asked: string }, chosen?: number): AnswerResult;
  /** 案を帳面に入れる */
  apply(draft: RuleDraft): void;
  /** Claude に渡す帳面の文 */
  ledgerText(): string;
  /** 答える人の名前（はじめの値） */
  defaultName(): string;
}

export interface Interview {
  refresh(): void;
  /** 話して答える（声の聞き取りを始める。使えないブラウザでは何もしない） */
  listen(): void;
  /** この所を聞く（なければ先頭） */
  focus(gapId?: string): void;
}

const KIND: Record<Gap["kind"], string> = {
  missing: "決まりがない",
  unverified: "未確認",
  uncovered: "点が届いていない",
  provisional: "仮の目安のまま",
  public: "公開情報のまま",
  open: "資料にない",
  asked: "学ぶ人から",
};

export function mountInterview(root: HTMLElement, target: InterviewTarget, opts: { onApplied?: (title: string) => void; example?: (gap: Gap) => string } = {}): Interview {
  let current: string | undefined;
  /** いま描いた一覧の質問（帳面が変わって新しく出た質問を見つけるため） */
  let known: Set<string> | null = null;
  /** いま描いた中身（同じなら描き直さない。描き直すと Claude の言い直しをまた呼んでしまう） */
  let drawn = "";
  /** この画面を開いている間、とばした所 */
  const skipped = new Set<string>();
  let asked = "";
  let name = target.defaultName();
  let seq = 0;

  root.classList.add("iv");

  function pick(): Gap | undefined {
    const gaps = target.gaps();
    const want = gaps.find((g) => g.id === current);
    if (want) return want;
    return gaps.find((g) => !skipped.has(g.id)) ?? gaps[0];
  }

  const keyOf = (gaps: Gap[]) => JSON.stringify(gaps.map((g) => [g.id, g.question]));

  function render() {
    const gaps = target.gaps();
    const gap = pick();
    current = gap?.id;
    known = new Set(gaps.map((g) => g.id));
    drawn = keyOf(gaps);
    const claude = !!store.password();
    // 2026-11-06：字を減らす。理由は畳み、答える人は 1 行下へ、合言葉の入れ方はボタンで（撮影の前の絵は前のまま）
    const plain = flowUI();
    if (!gap) {
      root.innerHTML = plain
        ? `<div class="iv-empty"><p class="iv-done">いまは、聞くことはありません。</p><p class="small muted">学ぶ人から質問が届くと、ここに出ます。</p></div>`
        : `<div class="iv-head"><p class="eyebrow">Claude からの質問</p></div><p class="iv-done">今は聞くことはありません。</p>`;
      return;
    }
    asked = gap.question;
    const my = ++seq;
    root.innerHTML = `
      <div class="iv-head">
        <p class="eyebrow">${gap.kind === "asked" ? "学ぶ人から質問が届いています" : "Claude から質問が 1 つあります"} <span class="iv-mode">${isMihon() ? "見本（Claude は呼びません）" : claude ? "Claude が聞いています" : "Claude なし"}</span></p>
        <span class="iv-count">${plain ? (gaps.length > 1 ? `ほかに ${gaps.length - 1} 問` : "") : `まだ決まっていない所 ${gaps.length}`}</span>
      </div>
      <p class="iv-q" aria-live="polite">${esc(gap.question)}</p>
      ${plain ? `<details class="iv-why iv-why-more"><summary><span class="iv-kind">${KIND[gap.kind]}</span>なぜ聞くの？</summary><p>${esc(gap.why)}</p></details>` : `<p class="iv-why"><span class="iv-kind">${KIND[gap.kind]}</span>${esc(gap.why)}</p>`}
      <div class="answer-box">
        <div class="ans-line">
          <textarea rows="2" placeholder="${canListen() ? "右の「話す」を押して話すか、書いてください" : "答えを書いてください"}${gap.expects === "number" ? "（数字はミリで）" : gap.expects === "confirm" ? "（「はい」か、ちがう数字で）" : ""}" aria-label="答え"></textarea>
          <button type="button" class="mic mic-big" aria-label="話して答える">${MIC}<span>話す</span></button>
        </div>
        <div class="row">
          <button type="button" class="primary make">決まりにする</button>
          ${opts.example ? `<button type="button" class="ghost use-example">作り話の例を入れる</button>` : ""}
          <button type="button" class="ghost skip">${plain ? "あとで" : "とばす"}</button>
          ${plain ? "" : `<label class="iv-name">答える人<input value="${esc(name)}" aria-label="答える人の名前"></label>`}
        </div>
        ${plain ? `<label class="iv-name iv-name-line">答える人<input value="${esc(name)}" aria-label="答える人の名前"></label>` : ""}
        <p class="small box-status"></p>
        <div class="proposal-slot"></div>
      </div>
      ${
        plain
          ? `<p class="iv-foot"${isMihon() ? " hidden" : ""}>${claude ? "Claude が問いを言い直し、答えを決まりにまとめます。職人が言っていない数字は入れません。" : `<span>いまは Claude なし：決まった問いで聞き、答えの数字を読んで決まりにします。</span>`}</p>`
          : `<p class="iv-foot"${isMihon() ? " hidden" : ""}>${claude ? "問いは Claude が言い直し、答えは Claude が決まりにまとめます。職人が言っていない数字は入れません（入っていたら Claude なしの案に戻します）。" : `問いは決まった文で、答えの数字を読んで決まりにします。<button type="button" class="linklike use-claude">合言葉を入れて Claude に聞いてもらう</button>`}</p>`
      }`;
    if (plain && !claude && !isMihon()) root.querySelector(".iv-foot")!.append(passwordButton());
    const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
    const field = $<HTMLTextAreaElement>("textarea");
    const st = (t: string) => ($(".box-status").textContent = t);
    const voice = bindVoice($<HTMLButtonElement>(".mic"), field, { onError: st });
    $<HTMLInputElement>(".iv-name input").addEventListener("input", (e) => (name = (e.target as HTMLInputElement).value.trim() || target.defaultName()));
    $(".skip").addEventListener("click", () => {
      if (!askConfirm(flowUI() ? "この質問を、あとにしますか？\n書いた答えは消えます。質問は、あとでまた出ます。" : "この質問をとばしますか？\n書いた答えは消えます。質問は、あとでまた出ます。")) return;
      voice.stop();
      skipped.add(gap.id);
      const rest = target.gaps().filter((g) => !skipped.has(g.id));
      current = rest[0]?.id;
      if (!rest.length) skipped.clear();
      render();
    });
    root.querySelector(".use-example")?.addEventListener("click", () => {
      field.value = opts.example!(gap);
    });
    root.querySelector(".use-claude")?.addEventListener("click", async () => {
      if (await askPassword(true)) render();
    });
    $(".make").addEventListener("click", () => {
      voice.stop();
      void answer(gap, field.value.trim(), st);
    });
    // 学ぶ人から届いた質問は、その人の言葉のまま聞く
    if (claude && gap.kind !== "asked") void rephrase(gap, my);
  }

  async function rephrase(gap: Gap, my: number) {
    const q = root.querySelector<HTMLElement>(".iv-q")!;
    q.classList.add("pending");
    const r = await callTool<string>({
      system: askGapPrompt(target.craft, target.ledgerText()),
      user: askGapUser(gap),
      tool: ASK_GAP,
      parse: (x) => parseAskGap(x, gap),
      password: store.password(),
      speed: "fast",
    });
    if (my !== seq) return;
    q.classList.remove("pending");
    if (r.ok) {
      asked = r.value;
      q.textContent = r.value;
    } else {
      if (r.code === "wrong_password") resetPassword();
      root.querySelector(".iv-mode")!.textContent = "決まった問い（Claude につながらない）";
    }
  }

  async function answer(gap: Gap, said: string, st: (t: string) => void, chosen?: number) {
    const ctx = { name: name || target.defaultName(), date: today(), asked };
    const local = target.draft(gap, said, ctx, chosen);
    const slot = root.querySelector<HTMLElement>(".proposal-slot")!;
    if (!said) {
      st("答えを話すか、書いてください。");
      return;
    }
    let draft: RuleDraft | undefined = local.ok ? local.draft : undefined;
    let note = isMihon() ? "見本：Claude を呼ばず、答えをそのまま案にしました。" : "Claude なし：答えの数字を読んで決まりにしました。";
    if (store.password()) {
      st("Claude が決まりにまとめています…");
      const r = await callTool<GapRuleOut>({
        system: gapRulePrompt(target.craft, target.ledgerText()),
        user: gapRuleUser(gap, asked, said),
        tool: GAP_RULE,
        parse: (x) => parseGapRule(x, gap, said),
        password: store.password(),
        speed: "fast",
      });
      if (r.ok) {
        const out = r.value;
        if (out.follow_up && !local.ok) {
          st("");
          slot.innerHTML = `<p class="iv-follow">${esc(out.follow_up)}</p>`;
          return;
        }
        // 値は、Claude なしで読んだ値と同じしくみで入れ直す（指輪の爪の点など、帳面の形を守るため）
        const viaValue = out.has_value ? target.draft(gap, said, ctx, out.value) : local;
        const base = viaValue.ok ? viaValue.draft : draft;
        if (base) {
          draft = { ...base, title: out.title || base.title, reason: out.reason && !out.reason.includes("まだ聞いていない") ? out.reason : base.reason, ...(gap.param && gap.stoneMm !== undefined ? {} : { text: out.text || base.text }) };
          note = "Claude が決まりにまとめました。職人の言葉はそのまま残します。";
        }
      } else {
        if (r.code === "wrong_password") resetPassword();
        note = `Claude につながらないので、答えの数字を読んで決まりにしました。（${r.error}）`;
      }
    }
    st("");
    if (!draft) {
      if (!local.ok && local.candidates) {
        slot.innerHTML = `<p class="small">${esc(local.why)}</p><div class="row">${local.candidates.map((c) => `<button type="button" class="ghost" data-c="${c}">${esc(valueText(c, gap.unit ?? "mm"))}</button>`).join("")}</div>`;
        slot.querySelectorAll<HTMLButtonElement>("[data-c]").forEach((b) => b.addEventListener("click", () => void answer(gap, said, st, Number(b.dataset.c))));
      } else {
        st(local.ok ? "" : local.why);
        slot.innerHTML = "";
      }
      return;
    }
    showDraft(slot, draft, note);
  }

  function showDraft(slot: HTMLElement, d: RuleDraft, note: string) {
    const src = d.source.kind === "craftsman" ? `職人：${d.source.name}` : "";
    slot.innerHTML = `<div class="proposal">
      <p class="small">${esc(note)}</p>
      <p class="iv-rule"><b>${esc(d.title)}</b>${d.value !== undefined && !d.bySize ? `<span class="val">${esc(valueText(d.value, unitOf(d.param)))}</span>` : ""}</p>
      <p class="iv-text">${esc(d.text)}</p>
      <blockquote>「${esc(d.quote ?? "")}」</blockquote>
      <p class="small muted">${esc(isMihon() ? "作り話の例" : src)} ・ ${esc(d.date)}${d.replaces ? " ・ 今の決まりを置き換えます（前の決まりは履歴に残ります）" : ""}</p>
      <div class="row"><button type="button" class="primary" data-a="ok">これでいい（帳面に入れる）</button><button type="button" class="ghost" data-a="no">言い直す</button></div>
    </div>`;
    slot.querySelector('[data-a="ok"]')!.addEventListener("click", () => {
      if (!askConfirm(`この決まりを帳面に入れますか？\n「${d.title}」\n設計の確かめと、学ぶ人への答えに使われます。`)) return;
      target.apply(d);
      opts.onApplied?.(d.title);
      flash(`帳面に入れました：${d.title}`);
      current = undefined;
      render();
    });
    slot.querySelector('[data-a="no"]')!.addEventListener("click", () => {
      slot.innerHTML = "";
      root.querySelector<HTMLTextAreaElement>("textarea")!.focus();
    });
  }

  render();
  // 合言葉を入れたら、Claude が聞く形に描き直す（答えを書いている途中なら、そのまま）
  window.addEventListener("tsugu:password", () => {
    const t = root.querySelector<HTMLTextAreaElement>("textarea");
    if (root.isConnected && !(t && t.value.trim())) render();
  });
  return {
    refresh: () => {
      // 答えている途中（文字が入っている）なら描き直さない
      const t = root.querySelector<HTMLTextAreaElement>("textarea");
      if (t && t.value.trim()) return;
      const gaps = target.gaps();
      if (keyOf(gaps) === drawn) return;
      // 決まりを消すと、その所の質問がまた要る。前の質問に留まらず、新しく出た質問をすぐ出す（読み直すまで出なかった）
      const fresh = freshGap(known, gaps);
      if (fresh) current = fresh.id;
      render();
    },
    listen() {
      const b = root.querySelector<HTMLButtonElement>(".mic");
      if (b && !b.hidden && canListen()) b.click();
    },
    focus(gapId) {
      current = gapId;
      render();
      root.scrollIntoView({ behavior: "smooth", block: "start" });
      root.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
    },
  };
}

/** 決まりの値の単位（指輪の値は PARAMS、ほかは mm） */
function unitOf(param?: string): string {
  return param && param in PARAMS ? PARAMS[param as ParamId].unit : "mm";
}

export function flash(t: string) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = t;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
