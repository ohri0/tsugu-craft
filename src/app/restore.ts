// 途切れた技（#waza/restore・#waza/restore/<記録の id>）：作り方の途切れた、答えのない技に使う。
// 読まなくても 3 秒で分かる形（2026-11-05 作者の声）。流れは 3 つだけ：① 分かることを入れる → ② Claude が作り方の案を出す → ③ 試して、結果を入れる。
// 目立つボタンは常に 1 つ（次に押すもの。src/rebuild/restore.ts の nextAct）。番号や専門の言葉は画面に出さない（記録の中では C1・T1 を使う）。
// 答え合わせはない。案は案として出し、確かな作り方だと言わない。確かめた手順だけ、職人が「この技の決まり」にする
// （この記録の中だけに持ち、書き出しに入る。指輪の帳面には入れないので、指輪の設計の確かめと学ぶの答えには混ざらない）。
// 案を出すときは、手がかりと一緒に、この工房の職人の帳面も渡す（オフにもできる）。帳面は読むだけ。根拠が帳面なら、案に「職人の帳面から」と出す。
// 答えの分かっている技で試す頁は src/app/rebuild.ts（手がかりだけで、帳面は渡さない）。
import "./restore.css";
import { parseToolCall, TOOLS, type ProposeRuleInput } from "../claude/tools";
import {
  addClue,
  addTechRule,
  applyPlan,
  CHECK_KINDS,
  CLUE_KIND_IDS,
  clueRefs,
  firstView,
  knownClueIds,
  namesOf,
  newProject,
  nextAct,
  nextUntried,
  parseRestoreFile,
  pastResults,
  plainWords,
  planDiff,
  previousPlan,
  removeClue,
  removeTechRule,
  renameProject,
  resultFor,
  setResult,
  sourceText,
  stageOf,
  TEXT_LIMITS,
  toFile,
  usableResults,
  withoutMark,
  type ClueKind,
  type Outcome,
  type PhotoFile,
  type PlanStep,
  type RestorePlan,
  type RestoreProject,
  type Stage,
} from "../rebuild/restore";
import { bookText } from "../rebuild/book";
import { PHOTO_SEND, photosToSend, restoreContent, restorePrompt, ruleRequest, techRulePrompt } from "../rebuild/restore-prompt";
import { parseRestoration, PROPOSE_RESTORATION } from "../rebuild/restore-tools";
import { callTool } from "../rebuild/run";
import { askConfirm } from "./confirm";
import { flash } from "./interview";
import { masterName } from "./master";
import { askPassword, resetPassword } from "./password";
import { workshopBook } from "./restore-book";
import {
  blobToBase64,
  getPhoto,
  listProjects,
  loadDraft,
  loadProject,
  newProjectId,
  photoFileToBlob,
  putPhoto,
  removePhoto,
  removeProject,
  saveDraft,
  saveProject,
  shrinkPhoto,
} from "./restore-store";
import { esc, store, today } from "./store";
import { bindVoice } from "./voice";

const FLOW: { n: Stage; label: string }[] = [
  { n: 1, label: "分かることを入れる" },
  { n: 2, label: "Claude が作り方の案を出す" },
  { n: 3, label: "試して、結果を入れる" },
];
/** 一覧の札に出す、次にすること */
const NEXT_WORD: Record<Stage, string> = { 1: "次：分かることを入れる", 2: "次：Claude に案を出してもらう", 3: "次：試して、結果を入れる" };
const KIND_UI: Record<ClueKind, { label: string; example: string }> = {
  object: { label: "残った品物", example: "例：ふたの表に、霜のような白いまだらがある" },
  record: { label: "古い記録", example: "例：古い本に「灰をかけて火にあぶる」と書いてある" },
  material: { label: "金属・道具", example: "例：銀に銅が混ざっているようだ" },
  opinion: { label: "職人の見立て", example: "例：熱してから洗ったのではないか" },
};
const OUTCOMES: Outcome[] = ["ok", "ng", "pending"];
const OUT_UI: Record<Outcome, string> = { ok: "うまくいった", ng: "だめだった", pending: "まだ" };
const SURE: Record<number, string> = { 1: "推測", 2: "たぶん", 3: "入れたこととよく合う" };
const MIC = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-2.1A7 7 0 0 0 19 12h-2Z" fill="currentColor"/></svg>`;
const MIC_BUTTON = (cls: string) => `<button type="button" class="mic mic-big ${cls}" aria-label="話して書く">${MIC}<span>話す</span></button>`;

/** Claude に案を頼んでいる最中の記録（戻って開き直しても、2 度頼まないように） */
const inFlight = new Set<string>();
/** 案が届いたら描き直す先（記録の id → 今開いている画面） */
const watchers = new Map<string, () => void>();
/** 前に開いた画面の写真の URL を返す */
let releasePhotos: () => void = () => undefined;

export function mountRestore(root: HTMLElement, sub: string, opts: { onBack: () => void }): void {
  releasePhotos();
  if (sub) mountProject(root, sub);
  else mountList(root, opts);
}

// ---- 読み込み ----

/** 書き出したファイルの中身を、このブラウザの記録にする。同じ id がもうあれば、別の記録として足す（どちらも消さない） */
async function bringIn(raw: unknown): Promise<{ ok: true; project: RestoreProject; warnings: string[] } | { ok: false; error: string }> {
  const parsed = parseRestoreFile(raw);
  if (!parsed.ok) return parsed;
  const warnings = [...parsed.warnings];
  let project = parsed.project;
  if (loadProject(project.id)) {
    project = { ...project, id: newProjectId(), name: `${project.name.slice(0, TEXT_LIMITS.name - 6)}（読み込み）` };
  }
  const clues = [...project.clues];
  for (const [i, c] of clues.entries()) {
    const f = parsed.photos[c.id];
    if (!c.photo || !f) continue;
    try {
      // 大きな写真が混ざっていても、ふだんの大きさにそろえる
      const small = await shrinkPhoto(photoFileToBlob(f));
      await putPhoto(project.id, c.id, small.blob);
      clues[i] = { ...c, photo: { w: small.w, h: small.h, bytes: small.blob.size } };
    } catch {
      warnings.push(`「${c.title}」の写真を残せませんでした。`);
    }
  }
  project = { ...project, clues };
  const saved = saveProject(project);
  return saved.ok ? { ok: true, project, warnings } : { ok: false, error: saved.error };
}

/** ファイルを読み込む欄を結びつける（一覧と、技の「記録」で同じ） */
function wireImport(input: HTMLInputElement, say: (t: string) => void) {
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    say("読み込んでいます…");
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      return say("このファイルは読めませんでした。「ファイルに書き出す」で作ったファイルを選んでください。");
    }
    const r = await bringIn(raw);
    if (!r.ok) return say(r.error);
    flash(`読み込みました：${r.project.name}${r.warnings.length ? `（${r.warnings.join(" ")}）` : ""}`);
    location.hash = `#waza/restore/${r.project.id}`;
  });
}

// ---- 一覧 ----

function mountList(root: HTMLElement, opts: { onBack: () => void }) {
  const projects = listProjects();
  root.innerHTML = `
  <section class="view rs">
    <button type="button" class="rs-back">← 技を選ぶ</button>
    <h2 class="rs-title">途切れた技</h2>
    <p class="rs-lead">分かることを入れると、Claude が作り方の案を出します。</p>
    <div class="rs-start">
      <button type="button" class="primary rs-big rs-new-open">途切れた技を入れる</button>
      <form class="rs-new" hidden>
        <label>技の名前<input class="rs-new-name" maxlength="${TEXT_LIMITS.name}" placeholder="例：家に残った鍔の色つけ" autocomplete="off"></label>
        <button type="submit" class="primary rs-big">始める</button>
      </form>
    </div>
    <p class="rs-msg" role="status"></p>
    ${
      projects.length
        ? `<ul class="rs-cards">${projects
            .map(
              (p) => `<li><a class="rs-card" href="#waza/restore/${esc(p.id)}">
          <b>${esc(p.name)}${p.sample ? `<span class="rs-card-tag">作り話の例</span>` : ""}</b>
          <small>${NEXT_WORD[stageOf(p)]}</small>
          <span class="rs-go-mark" aria-hidden="true">›</span>
        </a></li>`,
            )
            .join("")}</ul>`
        : ""
    }
    <div class="rs-quiet"><button type="button" class="linklike rs-sample">例を見る</button></div>
    ${
      projects.length
        ? `<details class="rs-fold"><summary>記録</summary><div class="rs-fold-body"><div class="rs-file-acts"><label class="ghost btnlike rs-import">ファイルを読み込む<input type="file" accept=".json,application/json" hidden></label></div></div></details>`
        : ""
    }
  </section>`;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const say = (t: string) => ($(".rs-msg").textContent = t);
  $(".rs-back").addEventListener("click", opts.onBack);
  $(".rs-new-open").addEventListener("click", () => {
    $(".rs-new-open").hidden = true;
    $(".rs-new").hidden = false;
    $(".rs-new-name").focus();
  });
  $<HTMLFormElement>(".rs-new").addEventListener("submit", (e) => {
    e.preventDefault();
    const p = newProject(newProjectId(), $<HTMLInputElement>(".rs-new-name").value.trim() || "名前のない技", today());
    const saved = saveProject(p);
    if (!saved.ok) return void say(saved.error);
    // 手で集めた記録なので、ブラウザが勝手に片付けないよう頼む（断られても動く）
    void navigator.storage?.persist?.().catch(() => undefined);
    location.hash = `#waza/restore/${p.id}`;
  });
  const input = root.querySelector<HTMLInputElement>(".rs-import input");
  if (input) wireImport(input, say);
  $(".rs-sample").addEventListener("click", async () => {
    try {
      const raw = (await import("../../research/restore/sample.json")).default as unknown;
      const id = (raw as { project?: { id?: string } }).project?.id;
      // もう開いたことがあれば、それを開く
      if (id && loadProject(id)) {
        location.hash = `#waza/restore/${id}`;
        return;
      }
      const r = await bringIn(raw);
      if (!r.ok) return void say(r.error);
      location.hash = `#waza/restore/${r.project.id}`;
    } catch {
      say("例を読み込めませんでした。");
    }
  });
}

// ---- 一つの技 ----

function mountProject(root: HTMLElement, id: string) {
  const loaded = loadProject(id);
  if (!loaded) {
    root.innerHTML = `<section class="view rs"><button type="button" class="rs-back">← 途切れた技の一覧</button><p class="rs-empty">この記録は、このブラウザにありません。</p></section>`;
    root.querySelector(".rs-back")!.addEventListener("click", () => (location.hash = "#waza/restore"));
    return;
  }
  let project = loaded;
  /** 見ている所（流れの 3 つのどれか） */
  let view: Stage = firstView(project);
  /** 見ている案（null ならいちばん新しい案） */
  let viewing: number | null = null;
  let saveError = "";
  /** 残せなかった写真。この画面を開いている間だけ、ここに持つ */
  const unsaved = new Map<string, Blob>();
  const urls = new Map<string, string>();
  /** 入れる前の写真 */
  let pending: { blob: Blob; w: number; h: number; url: string } | null = null;
  let kind: ClueKind = "object";

  releasePhotos = () => {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls.clear();
  };

  root.innerHTML = `
  <section class="view rs">
    <button type="button" class="rs-back">← 途切れた技の一覧</button>
    <div class="rs-head"><h2 class="rs-title"></h2><span class="rs-example" hidden>これは作り話の例です</span></div>
    <div class="rs-save" role="status" aria-live="polite"></div>
    <ol class="rs-flow" aria-label="流れ">${FLOW.map((f) => `<li><button type="button" data-view="${f.n}"><span class="rs-flow-n" aria-hidden="true">${f.n}</span><span>${f.label}</span></button></li>`).join("")}</ol>
    <div class="rs-next">
      <button type="button" class="primary rs-big rs-next-go"></button>
      <p class="rs-next-note"></p>
      <p class="rs-status" role="status" aria-live="polite"></p>
    </div>

    <div class="rs-panel" data-panel="1">
      <form class="rs-add answer-box" novalidate>
        <div class="rs-kinds" role="radiogroup" aria-label="何について">${CLUE_KIND_IDS.map((k) => `<button type="button" role="radio" aria-checked="${k === kind}" data-k="${k}">${KIND_UI[k].label}</button>`).join("")}</div>
        <div class="ans-line"><textarea class="rs-text" rows="3" maxlength="${TEXT_LIMITS.text}" aria-label="分かること"></textarea>${MIC_BUTTON("rs-mic")}</div>
        <div class="rs-add-row">
          <label class="ghost btnlike rs-pick">写真をつける<input type="file" accept="image/*" hidden></label>
          <span class="rs-pending" hidden><img alt="つける写真"><button type="button" class="linklike rs-unpick">写真を外す</button></span>
        </div>
        <details class="rs-more rs-add-more"><summary>題名・どこで見たかを書く</summary>
          <div class="rs-fold-body">
            <label class="rs-field">題名<input class="rs-title-in" maxlength="${TEXT_LIMITS.title}" autocomplete="off"></label>
            <label class="rs-field">どこで見たか<input class="rs-source" maxlength="${TEXT_LIMITS.source}" autocomplete="off" placeholder="本の名前、持ち主、聞いた人など"></label>
          </div>
        </details>
        <button type="submit" class="primary rs-big rs-add-go">入れる</button>
        <p class="rs-add-st" role="status"></p>
      </form>
      <label class="rs-book">
        <input type="checkbox" class="rs-book-on">
        <span class="rs-book-text"><b>職人の帳面も渡す</b><small class="rs-book-n"></small></span>
      </label>
      <ul class="rs-facts"></ul>
    </div>
    <div class="rs-panel" data-panel="2"></div>
    <div class="rs-panel" data-panel="3"></div>

    <details class="rs-fold rs-rules-box" hidden>
      <summary>この技の決まり <span class="rs-rule-n"></span></summary>
      <div class="rs-fold-body">
        <p class="rs-file-note">この技の中だけに残ります。指輪の設計の確かめや、学ぶ人への答えには使いません。</p>
        <ul class="rule-cards rs-rules"></ul>
      </div>
    </details>
    <details class="rs-fold rs-file">
      <summary>記録</summary>
      <div class="rs-fold-body">
        <p class="rs-file-note">記録はこのブラウザの中にあります。大事なものは、ファイルに書き出してください。</p>
        <div class="rs-file-acts">
          <button type="button" class="ghost rs-export">ファイルに書き出す</button>
          <label class="ghost btnlike rs-import">ファイルを読み込む<input type="file" accept=".json,application/json" hidden></label>
          <button type="button" class="ghost rs-rename-open">名前を変える</button>
          <form class="rs-rename" hidden><input aria-label="技の名前" maxlength="${TEXT_LIMITS.name}"><button type="submit" class="ghost">決める</button></form>
          <button type="button" class="ghost rs-danger-btn rs-delete">この技を消す</button>
        </div>
        <p class="rs-add-st rs-file-st" role="status"></p>
      </div>
    </details>
  </section>`;

  const viewEl = root.querySelector<HTMLElement>(".view.rs")!;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => viewEl.querySelector<T>(s)!;
  const panel = (n: Stage) => $(`[data-panel="${n}"]`);
  /** 例の印を外す（例のときだけ。ふつうの記録の文は変えない） */
  const unmark = (s: string) => (project.sample ? withoutMark(s) : s);
  /** Claude の文：番号を名前に、言葉をふつうに */
  const says = (s: string, plan?: RestorePlan) => esc(plainWords(unmark(s), namesOf(project, plan)));
  /** 職人が入れた文 */
  const own = (s: string) => esc(unmark(s));

  // ---- 保存 ----

  function commit(next: RestoreProject) {
    project = next;
    const r = saveProject(project);
    saveError = r.ok ? "" : r.error;
    paintSave();
  }

  function paintSave() {
    const box = $(".rs-save");
    const lines: string[] = [];
    if (saveError) lines.push(`${saveError} この画面を閉じると消えます。`);
    if (unsaved.size) lines.push(`写真 ${unsaved.size} 枚を残せませんでした（写真が大きいか、ブラウザの置き場が足りません）。この画面を閉じると消えます。`);
    box.innerHTML = lines.length ? `<div class="rs-save-bad">${lines.map((l) => `<p>${esc(l)}</p>`).join("")}<button type="button" class="ghost rs-export-now">ファイルに書き出す</button></div>` : "";
    box.querySelector(".rs-export-now")?.addEventListener("click", () => void exportFile());
  }

  // ---- 流れと、次に押すボタン ----

  function paintFlow() {
    const done: Record<Stage, boolean> = { 1: project.clues.length > 0, 2: project.plans.length > 0, 3: usableResults(project).length > 0 };
    viewEl.querySelectorAll<HTMLButtonElement>(".rs-flow [data-view]").forEach((b) => {
      const n = Number(b.dataset.view) as Stage;
      const current = n === view;
      if (current) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
      b.parentElement!.classList.toggle("is-done", done[n] && !current);
      b.querySelector(".rs-flow-n")!.textContent = done[n] && !current ? "✓" : String(n);
    });
  }

  function paintNext() {
    const btn = $<HTMLButtonElement>(".rs-next-go");
    const note = $(".rs-next-note");
    const addBtn = $(".rs-add-go");
    const typing = view === 1 && (!!$<HTMLTextAreaElement>(".rs-text").value.trim() || !!pending);
    // ① で書いている間と、まだ何も入れていないときは「入れる」が目立つ
    addBtn.className = typing || !project.clues.length ? "primary rs-big rs-add-go" : "ghost rs-big is-quiet rs-add-go";
    btn.className = typing ? "ghost rs-big is-quiet rs-next-go" : "primary rs-big rs-next-go";
    if (inFlight.has(project.id)) {
      btn.hidden = false;
      btn.disabled = true;
      btn.textContent = "Claude が考えています…";
      note.textContent = "1〜2 分かかります。";
      return;
    }
    const act = nextAct(project, view);
    btn.hidden = act.do === "none";
    btn.disabled = false;
    if (act.do === "none") {
      note.textContent = "";
      return;
    }
    btn.textContent = act.label;
    const { left } = photosToSend(project.clues);
    note.textContent = act.do === "plan" ? `1〜2 分かかります。書いたことと写真${project.useBook && workshopBook().rules.length ? "、職人の帳面" : ""}を Claude に送ります。${left.length ? `写真は多くて ${PHOTO_SEND.count} 枚まで渡します。` : ""}` : "";
  }

  function setStatus(msg: string, opts: { bad?: boolean; working?: boolean } = {}) {
    const box = $(".rs-status");
    box.classList.toggle("is-bad", !!opts.bad);
    if (opts.working) box.innerHTML = `<span class="thinking inline"><span></span><span></span><span></span></span>`;
    else box.textContent = msg;
  }

  function show(v: Stage, scroll = false) {
    view = v;
    for (const n of [1, 2, 3] as Stage[]) panel(n).hidden = n !== v;
    setStatus("");
    paintFlow();
    paintNext();
    if (scroll) $(".rs-flow").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---- 写真 ----

  async function photoBlob(clueId: string): Promise<Blob | null> {
    return unsaved.get(clueId) ?? getPhoto(project.id, clueId);
  }

  async function photoUrl(clueId: string): Promise<string | null> {
    const known = urls.get(clueId);
    if (known) return known;
    const blob = await photoBlob(clueId);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urls.set(clueId, url);
    return url;
  }

  async function fillThumbs() {
    for (const btn of viewEl.querySelectorAll<HTMLButtonElement>(".rs-photo[data-photo]")) {
      const url = await photoUrl(btn.dataset.photo!);
      if (!btn.isConnected) continue;
      if (url) {
        btn.querySelector("img")!.src = url;
      } else {
        const gone = document.createElement("p");
        gone.className = "rs-file-note";
        gone.textContent = "写真は、このブラウザに残っていません。";
        btn.replaceWith(gone);
      }
    }
  }

  // ---- ① 分かることを入れる ----

  /** 職人の帳面も渡すか（読むだけ。ここで帳面は書き換えない） */
  function paintBook() {
    const { rules, total } = workshopBook();
    const check = $<HTMLInputElement>(".rs-book-on");
    check.disabled = !total;
    check.checked = !!total && project.useBook;
    $(".rs-book").classList.toggle("is-off", !check.checked);
    $(".rs-book-n").textContent = total ? `職人の決まり ${total}${rules.length < total ? `（新しい ${rules.length} を渡します）` : ""}` : "職人の決まりは、まだありません";
  }

  function paintFacts() {
    const list = $(".rs-facts");
    list.hidden = !project.clues.length;
    list.innerHTML = project.clues
      .map(
        // 題名を書かなかったものは、題名が文の頭と同じなので出さない
        (c) => `<li class="rs-fact" data-fact="${esc(c.id)}">
        ${c.text.startsWith(c.title.replace(/…$/, "")) ? "" : `<p class="rs-fact-title">${own(c.title)}</p>`}
        ${c.text ? `<p class="rs-fact-text">${own(c.text)}</p>` : ""}
        ${c.photo ? `<button type="button" class="rs-photo" data-photo="${esc(c.id)}" aria-label="写真を大きくする"><img alt="つけた写真"></button>` : ""}
        <p class="rs-fact-foot"><span>${KIND_UI[c.kind].label}${c.source ? ` ・ ${own(c.source)}` : ""}</span><button type="button" class="linklike" data-del="${esc(c.id)}">消す</button></p>
      </li>`,
      )
      .join("");
    list.querySelectorAll<HTMLButtonElement>("[data-del]").forEach((b) => b.addEventListener("click", () => void dropClue(b.dataset.del!)));
    list.querySelectorAll<HTMLButtonElement>(".rs-photo").forEach((b) => b.addEventListener("click", () => b.classList.toggle("big")));
    void fillThumbs();
  }

  async function dropClue(clueId: string) {
    const c = project.clues.find((x) => x.id === clueId);
    if (!c) return;
    if (!askConfirm(`「${c.title}」を消しますか？${c.photo ? "\n写真も消えます。" : ""}\n消すと戻せません。`)) return;
    commit(removeClue(project, clueId, today()));
    unsaved.delete(clueId);
    const u = urls.get(clueId);
    if (u) URL.revokeObjectURL(u);
    urls.delete(clueId);
    if (c.photo) void removePhoto(project.id, clueId);
    paintSave();
    paintAll();
  }

  function clueForm() {
    const field = $<HTMLTextAreaElement>(".rs-text");
    const title = $<HTMLInputElement>(".rs-title-in");
    const source = $<HTMLInputElement>(".rs-source");
    const st = (t: string) => ($(".rs-add-st").textContent = t);
    const paintKinds = () => {
      viewEl.querySelectorAll<HTMLButtonElement>(".rs-kinds [data-k]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.k === kind)));
      field.placeholder = KIND_UI[kind].example;
    };
    const draft = () => saveDraft(project.id, { kind, title: title.value, text: field.value, source: source.value });
    // 読み直しても、書きかけの文が消えないように
    const saved = loadDraft(project.id);
    if (saved) {
      if (CLUE_KIND_IDS.includes(saved.kind as ClueKind)) kind = saved.kind as ClueKind;
      field.value = saved.text;
      title.value = saved.title;
      source.value = saved.source;
      if (saved.title || saved.source) $<HTMLDetailsElement>(".rs-add-more").open = true;
    }
    paintKinds();
    viewEl.querySelectorAll<HTMLButtonElement>(".rs-kinds [data-k]").forEach((b) =>
      b.addEventListener("click", () => {
        kind = b.dataset.k as ClueKind;
        paintKinds();
        draft();
      }),
    );
    for (const el of [field, title, source]) el.addEventListener("input", draft);
    field.addEventListener("input", paintNext);
    const voice = bindVoice($<HTMLButtonElement>(".rs-mic"), field, { onError: st });

    const showPending = () => {
      const box = $(".rs-pending");
      box.hidden = !pending;
      if (pending) box.querySelector("img")!.src = pending.url;
      $(".rs-pick").hidden = !!pending;
      paintNext();
    };
    $<HTMLInputElement>(".rs-pick input").addEventListener("change", async (e) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      st("写真を小さくしています…");
      try {
        const small = await shrinkPhoto(file);
        if (pending) URL.revokeObjectURL(pending.url);
        pending = { ...small, url: URL.createObjectURL(small.blob) };
        st("");
        showPending();
      } catch {
        st("この写真は読めませんでした。ほかの形式（JPEG など）で試してください。");
      }
    });
    $(".rs-unpick").addEventListener("click", () => {
      if (pending) URL.revokeObjectURL(pending.url);
      pending = null;
      showPending();
    });
    $<HTMLFormElement>(".rs-add").addEventListener("submit", async (e) => {
      e.preventDefault();
      voice.stop();
      const photo = pending;
      const r = addClue(project, { kind, title: title.value, text: field.value, source: source.value, photo: photo ? { w: photo.w, h: photo.h, bytes: photo.blob.size } : undefined }, today());
      if ("error" in r) {
        st("文を書くか、写真をつけてください。");
        field.focus();
        return;
      }
      commit(r.project);
      field.value = "";
      title.value = "";
      source.value = "";
      saveDraft(project.id, null);
      pending = null;
      showPending();
      st(saveError ? "" : "入れました。");
      if (photo) {
        urls.set(r.clue.id, photo.url);
        try {
          await putPhoto(project.id, r.clue.id, photo.blob);
        } catch {
          unsaved.set(r.clue.id, photo.blob);
          st("入れましたが、写真は残せませんでした。");
          paintSave();
        }
      }
      paintAll();
    });
  }

  // ---- Claude に頼む ----

  async function build() {
    if (inFlight.has(project.id) || !project.clues.length) return;
    setStatus("");
    const pass = store.password() || (await askPassword(true));
    if (!pass) return setStatus("案を出すには、合言葉が要ります。入れたことは、このまま残っています。", { bad: true });
    const base = project;
    const book = base.useBook ? workshopBook().rules : [];
    inFlight.add(base.id);
    paintNext();
    setStatus("", { working: true });
    const { send, left } = photosToSend(base.clues);
    const photos: { id: string; media: string; data: string }[] = [];
    const missing: string[] = [];
    for (const clueId of send) {
      const blob = await photoBlob(clueId).catch(() => null);
      if (blob) photos.push({ id: clueId, media: blob.type || "image/jpeg", data: await blobToBase64(blob) });
      else missing.push(clueId);
    }
    const prev = base.plans.at(-1);
    const r = await callTool({
      system: restorePrompt({ book: book.length > 0 }),
      user: restoreContent(base, photos, book),
      tool: PROPOSE_RESTORATION,
      parse: (x) => parseRestoration(x, { ids: knownClueIds(base), bookIds: book.map((b) => b.id), prev }),
      password: pass,
    });
    inFlight.delete(base.id);
    if (!r.ok) {
      if (r.code === "wrong_password") resetPassword();
      if (viewEl.isConnected) {
        paintNext();
        setStatus(`${r.error} 入れたことは、このまま残っています。`, { bad: true });
      }
      return;
    }
    const warnings = [...(r.warnings ?? []), ...(left.length ? [`写真が多いので、渡していない写真があります。`] : []), ...(missing.length ? [`このブラウザに残っていない写真は、渡していません。`] : [])];
    // 待っている間に入れたことは消さない（渡したものだけを、この案の控えにする）
    const current = viewEl.isConnected ? project : (loadProject(base.id) ?? base);
    // 帳面の数字は職人の言葉なので、「入れたことにない数字」としない
    const next = applyPlan(current, r.value, { date: today(), sent: clueRefs(base), photosSent: photos.map((x) => x.id), bookOn: base.useBook, book: book.map((b) => ({ id: b.id, title: b.title })), sources: `${sourceText(base)}\n${bookText(book)}`, warnings });
    if (viewEl.isConnected) {
      commit(next);
      viewing = null;
      paintAll();
      show(2, true);
      setStatus("案ができました。");
    } else {
      const saved = saveProject(next);
      if (!saved.ok) flash(saved.error);
      watchers.get(base.id)?.();
    }
  }

  // ---- ② Claude が作り方の案を出す ----

  const viewedPlan = (): RestorePlan | undefined => (viewing === null ? project.plans.at(-1) : (project.plans.find((v) => v.version === viewing) ?? project.plans.at(-1)));

  /** もとにしたものの名前を並べる。消したものにはそう書く */
  function fromNames(ids: readonly string[]): string {
    const names = namesOf(project);
    const alive = new Set(knownClueIds(project));
    return ids.map((x) => esc(unmark(names.get(x) ?? (x[0] === "T" ? "試した結果" : "入れたこと"))) + (alive.has(x) ? "" : "（消した）")).join("・");
  }

  function stepCard(plan: RestorePlan, s: PlanStep, i: number): string {
    const found = resultFor(project, plan, s);
    const outcome: Outcome = found?.result.outcome ?? "pending";
    const prevPlan = previousPlan(project, plan);
    const prevStep = s.prevStep ? prevPlan?.steps[s.prevStep - 1] : undefined;
    const differs = prevStep && (prevStep.title !== s.title || prevStep.detail !== s.detail);
    const more = [
      s.uncertain ? `<p>まだ分からないこと：${says(s.uncertain, plan)}</p>` : "",
      s.changeNote ? `<p>変えたわけ：${says(s.changeNote, plan)}</p>` : "",
      `<p>どのくらい確かか：${SURE[s.confidence]}</p>`,
      differs && prevStep ? `<p>前の案の文${s.change === "same" ? "（Claude は「そのまま」としましたが、文は少しちがいます）" : ""}：${says(prevStep.title, prevPlan)}。${says(prevStep.detail, prevPlan)}</p>` : "",
    ].join("");
    return `<li class="rs-step">
      <span class="rs-num" aria-hidden="true">${i + 1}</span>
      <div class="rs-step-body">
        <h4>${says(s.title, plan)}${outcome !== "pending" ? `<span class="rs-pill ${outcome}">${OUT_UI[outcome]}</span>` : ""}${plan.version > 1 && s.change === "changed" ? `<span class="rs-pill changed">変わった</span>` : ""}${plan.version > 1 && s.change === "new" ? `<span class="rs-pill new">新しい</span>` : ""}</h4>
        <p class="rs-step-text">${says(s.detail, plan)}</p>
        ${
          s.basis === "prior"
            ? `<p class="rs-from is-prior">もとにしたもの：Claude がもともと知っていること（入れたこと${plan.bookOn ? "や帳面" : ""}には書かれていません）</p>`
            : `${s.clue_ids.length ? `<p class="rs-from">もとにしたもの：${fromNames(s.clue_ids)}</p>` : ""}${s.book_ids?.length ? `<p class="rs-from rs-from-book"><span class="rs-pill book">職人の帳面から</span>${s.book_ids.map((b) => esc(plan.book.find((x) => x.id === b)?.title ?? "")).filter(Boolean).join("・")}</p>` : ""}`
        }
        ${s.caution ? `<p class="rs-danger"><b>危ない所</b>${says(s.caution, plan)}</p>` : ""}
        ${s.unsourced?.length ? `<p class="rs-unsourced">入れたことにない数字：${esc(s.unsourced.join("・"))}（試すまで使わないでください）</p>` : ""}
        <details class="rs-more"><summary>くわしく</summary>${more}</details>
      </div>
    </li>`;
  }

  function paintPlan() {
    const box = panel(2);
    const plan = viewedPlan();
    if (!plan) {
      box.innerHTML = `<p class="rs-empty">まだ案はありません。</p>`;
      return;
    }
    const last = project.plans.at(-1)!;
    const latest = plan === last;
    const diff = planDiff(plan);
    const notes = plan.notes.filter((n) => /言い切り|写真/.test(n));
    box.innerHTML = `
      ${latest ? `<p class="rs-soft">これは案です。確かな作り方ではありません。試して確かめてください。</p>` : `<p class="rs-soft">前の案です。<button type="button" class="linklike rs-to-latest">今の案に戻る</button></p>`}
      <p class="rs-sum">${says(plan.summary, plan)}</p>
      ${notes.map((n) => `<p class="rs-unsourced">${says(n, plan)}</p>`).join("")}
      <ol class="rs-steps">${plan.steps.map((s, i) => stepCard(plan, s, i)).join("")}</ol>
      ${
        project.plans.length > 1
          ? `<details class="rs-fold"><summary>前の案とのちがい</summary><div class="rs-fold-body">
        ${diff ? `<p class="rs-counts"><span class="rs-pill changed">変わった ${diff.changed}</span><span class="rs-pill new">新しい ${diff.added}</span><span class="rs-pill ng">やめた ${diff.dropped}</span><span class="rs-pill">そのまま ${diff.same}</span></p>` : ""}
        ${plan.changes ? `<p>${says(plan.changes, plan)}</p>` : ""}
        ${plan.dropped.length ? `<ul class="rs-plain">${plan.dropped.map((d) => `<li>やめた手順：${says(d.title, plan)}${d.why ? `<small>${says(d.why, plan)}</small>` : ""}</li>`).join("")}</ul>` : ""}
        <div class="rs-file-acts">${project.plans
          .slice()
          .reverse()
          .map((v) => `<button type="button" class="ghost" data-v="${v.version}"${v === plan ? " disabled" : ""}>${project.plans.indexOf(v) + 1} 回目の案${v === last ? "（今）" : ""}を見る</button>`)
          .join("")}</div>
      </div></details>`
          : ""
      }`;
    box.querySelectorAll<HTMLButtonElement>("[data-v]").forEach((b) =>
      b.addEventListener("click", () => {
        viewing = Number(b.dataset.v);
        paintPlan();
        $(".rs-flow").scrollIntoView({ behavior: "smooth", block: "start" });
      }),
    );
    box.querySelector(".rs-to-latest")?.addEventListener("click", () => {
      viewing = null;
      paintPlan();
    });
  }

  // ---- ③ 試して、結果を入れる ----

  function checkLine(c: RestorePlan["nextChecks"][number], plan: RestorePlan): string {
    return `${says(c.what, plan)}${c.why ? `<small>${says(c.why, plan)}</small>` : ""}${c.caution ? `<small class="rs-danger"><b>危ない所</b>${says(c.caution, plan)}</small>` : ""}`;
  }

  function tryInner(plan: RestorePlan, s: PlanStep, i: number, isNext: boolean): string {
    const found = resultFor(project, plan, s);
    const outcome: Outcome = found?.result.outcome ?? "pending";
    const note = found && !found.carried ? found.result.note : "";
    const past = pastResults(project, plan, s);
    const kept = project.rules.find((r) => r.stepKey === s.key);
    return `
      ${isNext ? `<span class="rs-try-next">次はこれ</span>` : ""}
      <h4>${i + 1}. ${says(s.title, plan)}</h4>
      <div class="rs-out" role="radiogroup" aria-label="結果">${OUTCOMES.map((o) => `<button type="button" role="radio" aria-checked="${o === outcome}" data-o="${o}" class="o-${o}">${OUT_UI[o]}</button>`).join("")}</div>
      <div class="rs-note-box answer-box"${outcome !== "pending" || note ? "" : " hidden"}><div class="ans-line"><textarea class="rs-note-field" rows="2" maxlength="${TEXT_LIMITS.note}" placeholder="どうでしたか？（書かなくてもよい）" aria-label="どうでしたか">${own(note)}</textarea>${MIC_BUTTON("rs-note-mic")}</div></div>
      <p class="rs-try-st" role="status"></p>
      ${past.map((r) => `<p class="rs-past">前の案で：<span class="rs-pill ${r.outcome}">${OUT_UI[r.outcome]}</span>${r.note ? ` ${own(r.note)}` : ""}</p>`).join("")}
      ${
        kept
          ? `<p class="rs-kept">決まりに残しました：${esc(kept.title)} <a href="#" class="rs-to-rules">見る</a></p>`
          : outcome === "ok"
            ? `<button type="button" class="ghost rs-to-rule">決まりとして残す</button>`
            : ""
      }
      <p class="rs-rule-st" role="status"></p>
      <div class="proposal-slot"></div>`;
  }

  function wireTry(li: HTMLElement, plan: RestorePlan, s: PlanStep) {
    const field = li.querySelector<HTMLTextAreaElement>(".rs-note-field")!;
    const st = (t: string) => (li.querySelector(".rs-try-st")!.textContent = t);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const saveNote = () => {
      clearTimeout(timer);
      timer = undefined;
      const outcome = resultFor(project, plan, s)?.result.outcome ?? "pending";
      commit(setResult(project, plan, s, { outcome, note: field.value }, today()));
      paintFlow();
      paintNext();
    };
    field.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(saveNote, 400);
    });
    field.addEventListener("blur", () => {
      if (timer) saveNote();
    });
    li.querySelectorAll<HTMLButtonElement>(".rs-out [data-o]").forEach((b) =>
      b.addEventListener("click", () => {
        clearTimeout(timer);
        timer = undefined;
        commit(setResult(project, plan, s, { outcome: b.dataset.o as Outcome, note: field.value }, today()));
        paintTries(plan);
        paintFlow();
        paintNext();
      }),
    );
    bindVoice(li.querySelector<HTMLButtonElement>(".rs-note-mic")!, field, { onError: st });
    li.querySelector(".rs-to-rule")?.addEventListener("click", () => void makeRule(li, plan, s));
    li.querySelector(".rs-to-rules")?.addEventListener("click", (e) => {
      e.preventDefault();
      const box = $<HTMLDetailsElement>(".rs-rules-box");
      box.open = true;
      box.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function paintTries(plan: RestorePlan) {
    const list = panel(3).querySelector<HTMLElement>(".rs-tries");
    if (!list) return;
    const next = nextUntried(project, plan);
    list.innerHTML = plan.steps.map(() => "<li></li>").join("");
    list.querySelectorAll<HTMLElement>(":scope > li").forEach((li, i) => {
      li.className = `rs-try${i === next ? " is-next" : ""}`;
      li.innerHTML = tryInner(plan, plan.steps[i], i, i === next);
      wireTry(li, plan, plan.steps[i]);
    });
  }

  function paintTry() {
    const box = panel(3);
    const plan = project.plans.at(-1);
    if (!plan) {
      box.innerHTML = `<p class="rs-empty">案が出ると、ここで結果を入れられます。</p>`;
      return;
    }
    const [first, ...rest] = plan.nextChecks;
    box.innerHTML = `
      ${
        first
          ? `<section class="rs-sec"><h3>まず、これをやってみる</h3>
        <div class="rs-first"><b>${says(first.what, plan)}</b>${first.why ? `<p>${says(first.why, plan)}</p>` : ""}${first.caution ? `<p class="rs-danger"><b>危ない所</b>${says(first.caution, plan)}</p>` : ""}</div>
        ${rest.length ? `<details class="rs-fold"><summary>ほかにやってみること ${rest.length}</summary><div class="rs-fold-body"><ol>${rest.map((c) => `<li>${CHECK_KINDS[c.kind]}：${checkLine(c, plan)}</li>`).join("")}</ol></div></details>` : ""}
      </section>`
          : ""
      }
      <section class="rs-sec"><h3>手順ごとに、結果を入れる</h3><ul class="rs-tries"></ul></section>
      ${plan.unknowns.length ? `<details class="rs-fold"><summary>まだ分かっていないこと ${plan.unknowns.length}</summary><div class="rs-fold-body"><ol>${plan.unknowns.map((u) => `<li>${says(u.what, plan)}${u.why ? `<small>${says(u.why, plan)}</small>` : ""}</li>`).join("")}</ol></div></details>` : ""}`;
    paintTries(plan);
  }

  // ---- この技の決まり（帳面の聞き取りと同じ手順：案 → 職人が直す → 確かめの窓 → 足す。入れる先は、この記録の中だけ） ----

  function paintRules() {
    const box = $(".rs-rules-box");
    box.hidden = !project.rules.length;
    $(".rs-rule-n").textContent = project.rules.length ? String(project.rules.length) : "";
    const list = $(".rs-rules");
    list.innerHTML = project.rules
      .map(
        (r) => `<li class="rule-card">
        <p class="rc-title">${own(r.title)}</p>
        <p class="rc-text">${own(r.text)}</p>
        ${r.reason ? `<p class="rs-rule-why">なぜ：${own(r.reason)}</p>` : ""}
        ${r.quote ? `<blockquote>「${own(r.quote)}」</blockquote>` : ""}
        <p class="rc-meta"><span>${esc(r.by)} ・ 「${says(r.stepTitle)}」を試して</span><button type="button" class="linklike rc-del" data-del-rule="${esc(r.id)}">消す</button></p>
      </li>`,
      )
      .join("");
    list.querySelectorAll<HTMLButtonElement>("[data-del-rule]").forEach((b) =>
      b.addEventListener("click", () => {
        const r = project.rules.find((x) => x.id === b.dataset.delRule);
        if (!r || !askConfirm(`この技の決まりを消しますか？\n「${r.title}」\n消すと戻せません。`)) return;
        commit(removeTechRule(project, r.id, today()));
        paintAll();
      }),
    );
  }

  async function makeRule(li: HTMLElement, plan: RestorePlan, s: PlanStep) {
    const found = resultFor(project, plan, s);
    const st = (t: string) => (li.querySelector(".rs-rule-st")!.textContent = t);
    const said = found?.result.note.trim() ?? "";
    if (!said) {
      li.querySelector<HTMLTextAreaElement>(".rs-note-field")!.focus();
      return st("決まりにするには、どうだったかを言葉で書いてください。");
    }
    // 帳面から読むのは職人の名前だけ。帳面の中身は Claude に渡さない
    const name = masterName(store.ledger());
    const slot = li.querySelector<HTMLElement>(".proposal-slot")!;
    const direct = (why: string) => {
      st(why);
      showProposal(li, plan, s, { title: s.title, text: said, reason: "（理由はまだ聞いていない）", quote: said });
    };
    slot.innerHTML = "";
    const pass = store.password() || (await askPassword(true));
    if (!pass) return direct("書いた言葉をそのまま案にしました。直してから残せます。");
    st("Claude がまとめています…");
    const r = await callTool<ProposeRuleInput>({
      system: techRulePrompt(project, name),
      user: ruleRequest(s.title, s.detail, name, said),
      tool: TOOLS.find((t) => t.name === "propose_rule")!,
      parse: (x) => {
        const parsed = parseToolCall("propose_rule", x);
        return parsed.ok ? { ok: true, value: parsed.call.input as ProposeRuleInput } : { ok: false, error: parsed.error };
      },
      password: pass,
      speed: "fast",
    });
    if (!li.isConnected) return;
    if (!r.ok) {
      if (r.code === "wrong_password") resetPassword();
      return direct("Claude につながらないので、書いた言葉をそのまま案にしました。");
    }
    st("");
    showProposal(li, plan, s, r.value);
  }

  /** 決まりの案を見せる。職人が「残す」を押して、確かめの窓で OK したときだけ、この技の決まりに入る */
  function showProposal(li: HTMLElement, plan: RestorePlan, s: PlanStep, p: ProposeRuleInput) {
    const slot = li.querySelector<HTMLElement>(".proposal-slot")!;
    slot.innerHTML = `<div class="proposal">
      <p>決まりの案です。直してから残せます。</p>
      <label>短い名前<input data-p="title" value="${own(p.title)}"></label>
      <label>決まり<textarea data-p="text" rows="2">${own(p.text)}</textarea></label>
      <label>なぜ<textarea data-p="reason" rows="2">${own(p.reason)}</textarea></label>
      <div class="row"><button type="button" class="primary" data-a="ok">残す</button><button type="button" class="ghost" data-a="no">いらない</button></div>
    </div>`;
    const read = (k: string) => slot.querySelector<HTMLInputElement>(`[data-p="${k}"]`)!.value.trim();
    slot.querySelector('[data-a="no"]')!.addEventListener("click", () => (slot.innerHTML = ""));
    slot.querySelector('[data-a="ok"]')!.addEventListener("click", () => {
      const title = read("title");
      const text = read("text");
      if (!title || !text) return void (li.querySelector(".rs-rule-st")!.textContent = "短い名前と決まりは、空にできません。");
      if (!askConfirm("この決まりを、この技の決まりとして残しますか？\nこの技の中だけに残ります。指輪の設計の確かめや、学ぶ人への答えには使いません。")) return;
      commit(addTechRule(project, plan, s, { title, text, reason: read("reason"), quote: p.quote, by: masterName(store.ledger()) }, today()));
      paintTries(plan);
      paintRules();
      flash(`決まりに残しました：${title}`);
    });
  }

  // ---- 記録 ----

  async function exportFile() {
    const photos: Record<string, PhotoFile> = {};
    for (const c of project.clues) {
      if (!c.photo) continue;
      const blob = await photoBlob(c.id).catch(() => null);
      if (blob) photos[c.id] = { media: blob.type || "image/jpeg", data: await blobToBase64(blob) };
    }
    const file = new Blob([JSON.stringify(toFile(project, photos, today()), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = `組み立て直し_${project.name.replace(/[\\/:*?"<>|\s]+/g, "_")}_${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    flash("ファイルに書き出しました。");
  }

  function paintAll() {
    $("h2").textContent = project.name;
    $(".rs-example").hidden = !project.sample;
    paintBook();
    paintFacts();
    paintPlan();
    paintTry();
    paintRules();
    paintFlow();
    paintNext();
  }

  // ---- はじめの結びつけ ----

  $(".rs-back").addEventListener("click", () => (location.hash = "#waza/restore"));
  viewEl.querySelectorAll<HTMLButtonElement>(".rs-flow [data-view]").forEach((b) => b.addEventListener("click", () => show(Number(b.dataset.view) as Stage)));
  $(".rs-next-go").addEventListener("click", () => {
    const act = nextAct(project, view);
    if (act.do === "plan") {
      void build();
    } else if (act.do === "view" && act.view) {
      show(act.view, true);
    }
  });
  $<HTMLInputElement>(".rs-book-on").addEventListener("change", (e) => {
    commit({ ...project, useBook: (e.target as HTMLInputElement).checked, updated: today() });
    paintBook();
    paintNext();
  });
  $(".rs-export").addEventListener("click", () => void exportFile());
  wireImport($<HTMLInputElement>(".rs-import input"), (t) => ($(".rs-file-st").textContent = t));
  $(".rs-rename-open").addEventListener("click", () => {
    const form = $<HTMLFormElement>(".rs-rename");
    form.hidden = false;
    $(".rs-rename-open").hidden = true;
    const input = form.querySelector("input")!;
    input.value = project.name;
    input.select();
  });
  $<HTMLFormElement>(".rs-rename").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = $<HTMLFormElement>(".rs-rename");
    commit(renameProject(project, form.querySelector("input")!.value, today()));
    form.hidden = true;
    $(".rs-rename-open").hidden = false;
    $("h2").textContent = project.name;
  });
  $(".rs-delete").addEventListener("click", async () => {
    if (!askConfirm(`「${project.name}」を消しますか？\n入れたこと・案・結果・決まり・写真が全部なくなります。消すと戻せません。`)) return;
    const pid = project.id;
    const photos = project.clues.filter((c) => c.photo).map((c) => c.id);
    removeProject(pid);
    await Promise.all(photos.map((c) => removePhoto(pid, c)));
    flash(`消しました：${project.name}`);
    location.hash = "#waza/restore";
  });
  // 開き直した画面にも、待っていた案を届ける
  watchers.set(project.id, () => {
    if (!viewEl.isConnected) return;
    project = loadProject(project.id) ?? project;
    viewing = null;
    paintAll();
    show(2);
    setStatus("案ができました。");
  });

  clueForm();
  paintAll();
  paintSave();
  show(view);
  if (inFlight.has(project.id)) setStatus("", { working: true });
}
