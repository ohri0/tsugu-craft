// 目安帳の画面：決まりの一覧、手で足す、Claude の聞き取り。
// 目安帳はこのブラウザに残し（localStorage）、JSON に書き出してリポジトリにも残せる。
import { runClaude } from "../claude/loop";
import { interviewPrompt } from "../claude/prompt";
import { TOOLS, type ProposeRuleInput, type ProposeRuleResult, type ToolHost } from "../claude/tools";
import type { ClaudeMessageParam } from "../claude/wire";
import { activeRules, addRule, OFFERED_PARAM_IDS, PARAMS, removeLastRule, seedLedger, parseSizeSteps, sizeStepsText, sourceLabel, type Ledger, type ParamId, type Rule } from "../rules/ledger";


import repoLedger from "../../ledger/jewelry.json";
import { plainText } from "./plain";

const STORE = "tsugu.ledger.v1";

/**
 * 最初の帳面は、リポジトリに残した帳面（ledger/jewelry.json）。このブラウザに残した帳面があれば、それを使い、
 * リポジトリの帳面にあってまだ入っていない決まりだけを後ろに足す（職人がリポジトリに足した決まりが、どの画面にも届くように）。
 */
/** はじめの帳面の工房の名前を、このブラウザで変えたとき（帳面の画面で変える。どの画面もこの名前を使う） */
export const MAIN_NAME_STORE = "tsugu.workshopName.v1";
function savedMainName(): string {
  try {
    return localStorage.getItem(MAIN_NAME_STORE)?.trim() ?? "";
  } catch {
    return "";
  }
}

/**
 * リポジトリで文を直した決まりの、前の文（決まりの id → 前の本文）。
 * このブラウザに前の文のまま残っていれば、新しい文にする。職人がこのブラウザで書き直した文は、そのまま残す。
 */
const OLD_RULE_TEXTS: Record<string, string[]> = {
  "rule-tension-depth-ishikawa": [
    "三角の石を腕の両はしで挟むとき、片方の端に小さなくぼみを掘って、角の先を 1 mm くらい入れる。もう片方の端には、辺に沿ったまっすぐな溝を切って、辺を 0.5 mm 差し込む。角がくぼみで止まるので、石は横にずれない",
    "三角の石を腕の両はしで挟むとき、片方の端に小さなくぼみを掘って、角の先を 0.8 mm くらい入れる。もう片方の端には、辺に沿ったまっすぐな溝を切って、辺を 0.5 mm 差し込む。角がくぼみで止まるので、石は横にずれない",
  ],
  // 作者が指輪を見て直す前（2026-11-07「くぼみも溝も 0.5 ぐらい」→「角のくぼみ 0.4、辺の溝 0.3 ぐらい」→「溝はたぶん 0.4」）
  "rule-tension-side-ishikawa": [
    "三角の石の短い辺を片はしの溝に落とし、反対の角をもう片はしのくぼみに入れるときは、くぼみも溝も 0.5 mm くらい。実際に作った指輪（シルバー 925・φ4 の丸線・14 号・8.88 mm の三角）の値。深さは石によって変わる",
    "三角の石の短い辺を片はしの溝に落とし、反対の角をもう片はしのくぼみに入れるときは、角のくぼみ 0.4 mm・辺の溝 0.3 mm くらい（見た感じ）。実際に作った指輪（シルバー 925・φ4 の丸線・14 号・8.88 mm の三角）の値。深さは石によって変わる",
  ],
};

/** このブラウザに残した決まりを、リポジトリの決まりに合わせる（前の文のままなら新しい文に。計算とのつながりは足す） */
export function freshenRules(saved: readonly Rule[], repo: readonly Rule[]): Rule[] {
  const byId = new Map(repo.map((r) => [r.id, r]));
  return saved.map((r) => {
    const now = byId.get(r.id);
    if (!now) return r;
    if (OLD_RULE_TEXTS[r.id]?.includes(r.text)) return now;
    return now.calc && !r.calc ? { ...r, calc: now.calc } : r;
  });
}

export function loadLedger(): Ledger {
  const repo = repoLedger as Ledger;
  const named = (l: Ledger): Ledger => (savedMainName() ? { ...l, owner: savedMainName() } : l);
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const l = JSON.parse(raw) as Ledger;
      if (Array.isArray(l.rules)) {
        const have = new Set(l.rules.map((r) => r.id));
        // リポジトリで外した決まり（retired）は、このブラウザに残っていても出さない
        const retired = new Set((repoLedger as { retired?: string[] }).retired ?? []);
        // 職人がこのブラウザで消した決まり（removed）も、リポジトリの帳面から足し直さない
        const removed = new Set(l.removed ?? []);
        return named({ ...l, owner: repo.owner ?? l.owner, rules: [...freshenRules(l.rules, repo.rules).filter((r) => !retired.has(r.id)), ...repo.rules.filter((r) => !have.has(r.id) && !removed.has(r.id))] });
      }
    }
  } catch {
    // 読めなければリポジトリの帳面から
  }
  return named(Array.isArray(repo.rules) ? repo : seedLedger());
}

function saveLedger(l: Ledger) {
  try {
    localStorage.setItem(STORE, JSON.stringify(l));
  } catch {
    // 残せなくても画面は動く
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const today = () => new Date().toLocaleDateString("sv-SE");

export interface LedgerUI {
  ledger(): Ledger;
}

/** 目安帳が変わったとき。手で足したときは、足した決まりの id も渡す */
export type LedgerChange = (l: Ledger, why: string, addedRuleId?: string) => void;

export function mountLedger(root: HTMLElement, onChange: LedgerChange): LedgerUI {
  let ledger = loadLedger();
  let messages: ClaudeMessageParam[] = [];
  let pending: ((r: ProposeRuleResult) => void) | null = null;

  root.innerHTML = `
    <p class="note">職人の決まりを、名前・日付・理由つきでためます。確かめはこの決まりで動き、問題には「どの決まりか」が出ます。</p>
    <div id="ruleList"></div>
    <div class="row" style="margin-top:8px">
      <button id="ruleUndo">最後に足した決まりを外す</button>
      <button id="ruleExport">書き出す（JSON）</button>
      <label class="btn" for="ruleImport">読み込む</label><input id="ruleImport" type="file" accept="application/json">
    </div>

    <details class="sub" id="interview" open>
      <summary>聞き取り（Claude が質問して、決まりにまとめる）</summary>
      <div class="controls" style="margin-top:8px">
        <label>職人の名前<input id="ivName" type="text" placeholder="例：山田" /></label>
        <label>合言葉（公開ページ用）<input id="ivPass" type="password" autocomplete="off" /></label>
      </div>
      <div class="chat" id="ivLog"></div>
      <div id="ivProposal"></div>
      <div class="row" style="margin-top:6px">
        <textarea id="ivInput" rows="2" placeholder="最初は「始めて」と送るか、話したいことを書く"></textarea>
        <button id="ivSend" class="primary">送る</button>
      </div>
      <p class="note" id="ivStatus"></p>
    </details>

    <details class="sub">
      <summary>手で決まりを足す</summary>
      <div class="form" id="manual">
        <label>短い名前<input data-f="title" type="text" placeholder="例：鋳造の爪の根元"></label>
        <label>決まり<textarea data-f="text" rows="2" placeholder="いつ・何を・どこまで"></textarea></label>
        <label>理由<textarea data-f="reason" rows="2" placeholder="なぜそうするか"></textarea></label>
        <label>機械で確かめる値（あれば）<select data-f="param"><option value="">なし（言葉だけの決まり）</option>${OFFERED_PARAM_IDS.map((k) => [k, PARAMS[k]] as const)
          .map(([k, v]) => `<option value="${k}">${v.label}${v.unit ? `（${v.unit}）` : ""}</option>`)
          .join("")}</select></label>
        <label>値<input data-f="value" type="number" step="0.01"></label>
        <label>石の大きさで変える（なくてもよい）<input data-f="bySize" type="text" placeholder="例：4:0.6, 6:0.8, 8:1.0, 1.2（大きさ mm まで:値。最後はそれより大きい石）"></label>
        <label>職人の名前<input data-f="name" type="text"></label>
        <button id="manualAdd" class="primary">目安帳に足す</button>
      </div>
    </details>`;

  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

  function set(next: Ledger, why: string, addedRuleId?: string) {
    ledger = next;
    saveLedger(ledger);
    render();
    onChange(ledger, why, addedRuleId);
  }

  function render() {
    const replaced = new Set(ledger.rules.flatMap((r) => (r.replaces ? [r.replaces] : [])));
    const active = activeRules(ledger);
    const old = ledger.rules.filter((r) => replaced.has(r.id));
    $("ruleList").innerHTML = `<ul class="rules">${[...active]
      .reverse()
      .map((r) => ruleItem(r, false))
      .join("")}${old.map((r) => ruleItem(r, true)).join("")}</ul>`;
    $<HTMLButtonElement>("ruleUndo").disabled = ledger.rules.length <= seedLedger().rules.length;
  }

  function ruleItem(r: Rule, replaced: boolean): string {
    const kind = r.source.kind;
    const value =
      r.param && r.bySize
        ? esc(sizeStepsText(r.bySize, PARAMS[r.param].unit))
        : r.param && r.value !== undefined
          ? `${r.value}${PARAMS[r.param].unit}`
          : "";
    // 職人の決まりには、名前の一文字目の印（はんこ）。公開情報は「公」、仮は「仮」
    const seal = kind === "craftsman" ? [...r.source.name][0] ?? "職" : kind === "public" ? "公" : "仮";
    return `<li class="rule-card ${kind}${replaced ? " old" : ""}">
      <span class="seal seal-${kind}" aria-hidden="true">${esc(seal)}</span>
      <div class="rule-body">
        <div class="rule-head"><b>${esc(r.title)}</b>${value ? `<span class="val">${value}</span>` : ""}${replaced ? '<span class="badge">置き換え済み</span>' : ""}</div>
        <p class="rule-text">${esc(r.text)}</p>
        <p class="rule-why">理由：${esc(r.reason)}</p>
        ${r.quote ? `<p class="rule-quote">「${esc(r.quote)}」</p>` : ""}
        <p class="rule-src">${esc(sourceLabel(r.source))}・${r.date}</p>
      </div>
    </li>`;
  }

  $("ruleUndo").addEventListener("click", () => set(removeLastRule(ledger), "最後に足した決まりを外した"));
  $("ruleExport").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(ledger, null, 2)], { type: "application/json" }));
    a.download = `tsugu-ledger-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $<HTMLInputElement>("ruleImport").addEventListener("change", async (ev) => {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      const l = JSON.parse(await f.text()) as Ledger;
      if (!Array.isArray(l.rules)) throw new Error("rules がありません");
      set(l, "目安帳を読み込んだ");
    } catch (e) {
      alert(`読み込めませんでした：${String(e)}`);
    }
  });

  // ---- 手で足す ----
  $("manualAdd").addEventListener("click", () => {
    const v = (f: string) => document.querySelector<HTMLInputElement>(`#manual [data-f="${f}"]`)!.value.trim();
    if (!v("title") || !v("text") || !v("reason") || !v("name")) {
      alert("短い名前・決まり・理由・職人の名前を書いてください");
      return;
    }
    const param = (v("param") || undefined) as ParamId | undefined;
    const bySize = param && v("bySize") ? parseSizeSteps(v("bySize")) : undefined;
    if (param && v("bySize") && !bySize) {
      alert("石の大きさの段は「4:0.6, 6:0.8, 1.0」の形で書いてください");
      return;
    }
    const value = param && v("value") !== "" ? Number(v("value")) : bySize ? bySize[bySize.length - 1].value : undefined;
    if (param && value === undefined) {
      alert("機械で確かめる値を選んだときは、値も書いてください");
      return;
    }
    const next = addRule(ledger, {
        title: v("title"),
        text: v("text"),
        reason: v("reason"),
        param,
        value,
        bySize,
        source: { kind: "craftsman", name: v("name") },
        date: today(),
      });
    set(next, `決まり「${v("title")}」を足した`, next.rules[next.rules.length - 1].id);
    document.querySelectorAll<HTMLInputElement>("#manual [data-f]").forEach((el) => (el.value = ""));
  });

  // ---- 聞き取り ----
  const log = (who: "claude" | "you" | "note", t: string) => {
    const div = document.createElement("div");
    div.className = `msg ${who}`;
    div.textContent = who === "claude" ? plainText(t) : t;
    $("ivLog").appendChild(div);
    div.scrollIntoView({ block: "nearest" });
  };

  const host: ToolHost<null> = {
    setSetting: () => Promise.reject(new Error("聞き取りでは使わない")),
    setShank: () => Promise.reject(new Error("聞き取りでは使わない")),
    check: () => Promise.reject(new Error("聞き取りでは使わない")),
    look: () => Promise.reject(new Error("聞き取りでは使わない")),
    snapshot: () => null,
    restore: () => undefined,
    proposeRule: (input) => new Promise<ProposeRuleResult>((resolve) => showProposal(input, resolve)),
  };

  function showProposal(p: ProposeRuleInput, resolve: (r: ProposeRuleResult) => void) {
    pending = resolve;
    const name = ($<HTMLInputElement>("ivName").value || "職人").trim();
    $("ivProposal").innerHTML = `<div class="proposal">
      <p class="note">Claude からの決まりの案。直してから足すこともできます。</p>
      <label>短い名前<input data-p="title" value="${esc(p.title)}"></label>
      <label>決まり<textarea data-p="text" rows="2">${esc(p.text)}</textarea></label>
      <label>理由<textarea data-p="reason" rows="2">${esc(p.reason)}</textarea></label>
      ${p.param ? `<label>${esc(PARAMS[p.param].label)}<input data-p="value" type="number" step="0.01" value="${p.value ?? ""}"></label>` : ""}
      ${p.by_size && p.param ? `<p class="quote">石の大きさで：${esc(sizeStepsText(p.by_size.map((x) => ({ upToMm: x.up_to_mm, value: x.value })), PARAMS[p.param].unit))}</p>` : ""}
      ${p.quote ? `<p class="quote">「${esc(p.quote)}」</p>` : ""}
      <div class="row"><button class="primary" data-a="ok">目安帳に足す</button><button data-a="no">見送る</button></div>
    </div>`;
    const read = (k: string) => document.querySelector<HTMLInputElement>(`#ivProposal [data-p="${k}"]`)?.value.trim() ?? "";
    document.querySelectorAll<HTMLButtonElement>("#ivProposal [data-a]").forEach((b) =>
      b.addEventListener("click", () => {
        if (!pending) return;
        const done = pending;
        pending = null;
        if (b.dataset.a === "no") {
          $("ivProposal").innerHTML = "";
          log("note", `見送った：${p.title}`);
          done({ status: "declined", note: "職人が見送った" });
          return;
        }
        const edited = { title: read("title"), text: read("text"), reason: read("reason"), value: p.param ? Number(read("value")) : undefined };
        const changed = edited.title !== p.title || edited.text !== p.text || edited.reason !== p.reason || edited.value !== p.value;
        const next = addRule(ledger, {
          title: edited.title,
          text: edited.text,
          reason: edited.reason,
          example: p.example,
          quote: p.quote,
          param: p.param,
          value: edited.value,
          bySize: p.by_size?.map((x) => ({ upToMm: x.up_to_mm, value: x.value })),
          source: { kind: "craftsman", name },
          date: today(),
        });
        const id = next.rules[next.rules.length - 1].id;
        set(next, `聞き取りで決まり「${edited.title}」を足した`);
        $("ivProposal").innerHTML = "";
        log("note", `目安帳に足した：${edited.title}`);
        done(changed ? { status: "edited", rule_id: id, note: `職人が直した：${edited.text}（理由：${edited.reason}）` } : { status: "accepted", rule_id: id });
      }),
    );
  }

  async function send() {
    const input = $<HTMLTextAreaElement>("ivInput");
    const text = input.value.trim();
    if (!text) return;
    const name = ($<HTMLInputElement>("ivName").value || "職人").trim();
    input.value = "";
    log("you", text);
    messages = [...messages, { role: "user", content: text }];
    $<HTMLButtonElement>("ivSend").disabled = true;
    $("ivStatus").textContent = "Claude が考えています…";
    const r = await runClaude({
      host,
      messages,
      system: interviewPrompt(ledger, name),
      tools: TOOLS.filter((t) => t.name === "propose_rule"),
      password: $<HTMLInputElement>("ivPass").value,
      onLog: (e) => {
        if (e.kind === "note" && e.source === "text") log("claude", e.text);
      },
    });
    messages = r.messages;
    $<HTMLButtonElement>("ivSend").disabled = false;
    $("ivStatus").textContent = r.offline
      ? `Claude につながりません。${r.error?.message ? `（${r.error.message}）` : ""}決まりは「手で決まりを足す」からも足せます。`
      : r.error
        ? r.error.message
        : r.remaining !== undefined
          ? `今日あと ${r.remaining} 回`
          : "";
  }
  $("ivSend").addEventListener("click", send);

  render();
  return { ledger: () => ledger };
}
