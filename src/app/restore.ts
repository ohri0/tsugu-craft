// 自分の技を組み立て直す（本番）：作り方の途切れた、答えのない技に使う。#waza/restore（一覧）・#waza/restore/<記録の id>。
// 手がかりを職人が入れる → Claude が工程の案と、分かっていない所・次に確かめることを出す → 職人が工程ごとに試した結果を残す →
// 結果も手がかりに加えて、もう一度組み立て直す（前の案との違いが分かる）→ 確かめた工程だけ、職人が帳面の決まりにする。
// 答え合わせはない。画面のどこでも「案」として出し、確かな作り方だと言わない。力試し（答えの分かっている木目金）は src/app/rebuild.ts。
import "./restore.css";
import { keepPrompt } from "../claude/prompt";
import { parseToolCall, TOOLS, type ProposeRuleInput } from "../claude/tools";
import {
  addClue,
  applyPlan,
  CHECK_KINDS,
  CLUE_KIND_IDS,
  CLUE_KINDS,
  clueRefs,
  freshSince,
  knownClueIds,
  newProject,
  parseRestoreFile,
  pastResults,
  planDiff,
  projectCounts,
  removeClue,
  renameProject,
  resultFor,
  setResult,
  sourceText,
  TEXT_LIMITS,
  toFile,
  usableResults,
  type ClueKind,
  type Outcome,
  type PhotoFile,
  type PlanStep,
  type RestorePlan,
  type RestoreProject,
  type StepChange,
} from "../rebuild/restore";
import { OUTCOME_LABEL, PHOTO_SEND, photosToSend, restoreContent, restorePrompt, ruleRequest } from "../rebuild/restore-prompt";
import { parseRestoration, PROPOSE_RESTORATION } from "../rebuild/restore-tools";
import { callTool } from "../rebuild/run";
import { addRule } from "../rules/ledger";
import { askConfirm } from "./confirm";
import { flash } from "./interview";
import { bookLabel, bookTitle, masterName } from "./master";
import { askPassword, resetPassword } from "./password";
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
import { bindVoice, canListen } from "./voice";

const NOTE = `<p class="rs-note"><b>案・試して確かめる</b>ここに出る工程は Claude の案です。確かな作り方ではありません。最後は職人が試して決めます。</p>`;
const MIC = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-2.1A7 7 0 0 0 19 12h-2Z" fill="currentColor"/></svg>`;
const OUTCOMES: Outcome[] = ["ok", "ng", "pending"];
const OUT_CLS: Record<Outcome, string> = { ok: "ok", ng: "miss", pending: "" };
const CHANGE: Record<StepChange, { label: string; cls: string }> = {
  same: { label: "そのまま", cls: "same" },
  changed: { label: "変わった", cls: "part" },
  new: { label: "新しい", cls: "new" },
};
const dots = (n: number) => "●".repeat(n) + "○".repeat(3 - n);
const trialSummary = (outcome: Outcome | undefined, note: string) => (outcome ? `試した結果：${OUTCOME_LABEL[outcome]}${note ? "（言葉あり）" : ""}` : "試した結果を書く");

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

/** 一覧と本番の頁で使う、力試しへの札 */
const TO_TRIAL = `<a class="rs-cross" href="#waza/rebuild"><span><b>力試し（木目金）</b><small>答えの分かっている技で、Claude がどこまで届くか測る試し。本番の前に、どのくらい当てになるかを見られます</small></span><span class="bt-go" aria-hidden="true">›</span></a>`;

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
      warnings.push(`${c.id} の写真を残せませんでした。`);
    }
  }
  project = { ...project, clues };
  const saved = saveProject(project);
  return saved.ok ? { ok: true, project, warnings } : { ok: false, error: saved.error };
}

// ---- 一覧 ----

function mountList(root: HTMLElement, opts: { onBack: () => void }) {
  const projects = listProjects();
  root.innerHTML = `
  <section class="view rs tp">
    <button type="button" class="back">← 技を選ぶ</button>
    <header class="tp-head">
      <span class="bt-mark" aria-hidden="true">再</span>
      <div class="tp-hb">
        <h2>自分の技を組み立て直す</h2>
        <p class="lead">作り方の途切れた、答えのない技に使います。残った品物や古い記録などの手がかりを入れると、Claude が工程の案を作ります。職人が試して確かめ、確かになった工程だけを帳面の決まりにします。</p>
      </div>
    </header>
    ${NOTE}
    <form class="rs-new">
      <label>技の名前<input class="rs-new-name" maxlength="${TEXT_LIMITS.name}" placeholder="例：家に残った鍔の色つけ" autocomplete="off"></label>
      <button type="submit" class="primary">始める</button>
    </form>
    <p class="small rs-list-st" role="status"></p>
    ${
      projects.length
        ? `<h3 class="pub-sec-h">組み立て中の技 <small>${projects.length}</small></h3>
    <ul class="big-techs rs-list">${projects
      .map((p) => {
        const n = projectCounts(p);
        return `<li><a class="big-tech" href="#waza/restore/${esc(p.id)}">
        <span class="bt-body"><b>${esc(p.name)}</b><small>手がかり ${n.clues} ・ ${n.plans ? `案 ${n.plans}` : "案はまだ"}${n.ok + n.ng ? ` ・ 試した結果 うまくいった ${n.ok}・いかなかった ${n.ng}` : ""}</small><span class="bt-meta">${esc(p.updated)}</span></span>
        <span class="bt-go" aria-hidden="true">›</span>
      </a></li>`;
      })
      .join("")}</ul>`
        : `<div class="empty-card rs-empty"><p>まだ技がありません。上に名前を入れて始めます。</p></div>`
    }
    <div class="rs-io">
      <label class="ghost btnlike rs-import">記録のファイルを読み込む<input type="file" accept=".json,application/json" hidden></label>
      <button type="button" class="ghost rs-sample">見本を開く（架空の技）</button>
    </div>
    <p class="small muted">記録はこのブラウザの中に残ります。ほかの人には見えません。ブラウザの記録を消すと消えるので、大事な記録はファイルに書き出してください。</p>
    <h3 class="pub-sec-h">答えの分かっている技で試す</h3>
    ${TO_TRIAL}
  </section>`;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const st = (t: string) => ($(".rs-list-st").textContent = t);
  $(".back").addEventListener("click", opts.onBack);
  $<HTMLFormElement>(".rs-new").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $<HTMLInputElement>(".rs-new-name").value.trim();
    if (!name) {
      st("技の名前を入れてください。あとで変えられます。");
      $(".rs-new-name").focus();
      return;
    }
    const p = newProject(newProjectId(), name, today());
    const saved = saveProject(p);
    if (!saved.ok) return void st(saved.error);
    // 手で集めた記録なので、ブラウザが勝手に片付けないよう頼む（断られても動く）
    void navigator.storage?.persist?.().catch(() => undefined);
    location.hash = `#waza/restore/${p.id}`;
  });
  $<HTMLInputElement>(".rs-import input").addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    st("読み込んでいます…");
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      return void st("このファイルは読めませんでした。「記録を書き出す」で作ったファイルを選んでください。");
    }
    const r = await bringIn(raw);
    if (!r.ok) return void st(r.error);
    flash(`読み込みました：${r.project.name}${r.warnings.length ? `（${r.warnings.join(" ")}）` : ""}`);
    location.hash = `#waza/restore/${r.project.id}`;
  });
  $(".rs-sample").addEventListener("click", async () => {
    st("見本を読み込んでいます…");
    try {
      const raw = (await import("../../research/restore/sample.json")).default as unknown;
      const id = (raw as { project?: { id?: string } }).project?.id;
      // もう開いたことがあれば、それを開く
      if (id && loadProject(id)) {
        location.hash = `#waza/restore/${id}`;
        return;
      }
      const r = await bringIn(raw);
      if (!r.ok) return void st(r.error);
      location.hash = `#waza/restore/${r.project.id}`;
    } catch {
      st("見本を読み込めませんでした。");
    }
  });
}

// ---- 一つの技 ----

function mountProject(root: HTMLElement, id: string) {
  const loaded = loadProject(id);
  if (!loaded) {
    root.innerHTML = `<section class="view rs tp"><button type="button" class="back">← 自分の技の一覧</button><div class="empty-card"><p>この記録は、このブラウザにありません。消したか、別のブラウザで作った記録です。</p></div></section>`;
    root.querySelector(".back")!.addEventListener("click", () => (location.hash = "#waza/restore"));
    return;
  }
  let project = loaded;
  /** 見ている案（null ならいちばん新しい案） */
  let viewing: number | null = null;
  let saveError = "";
  /** 残せなかった写真。この画面を開いている間だけ、ここに持つ */
  const unsaved = new Map<string, Blob>();
  const urls = new Map<string, string>();
  /** 足す前の写真 */
  let pending: { blob: Blob; w: number; h: number; url: string } | null = null;
  let kind: ClueKind = "object";
  /** 開いている「試した結果」の欄（描き直しても閉じないように） */
  const openTrials = new Set<string>();

  releasePhotos = () => {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls.clear();
  };

  root.innerHTML = `
  <section class="view rs tp">
    <button type="button" class="back">← 自分の技の一覧</button>
    <header class="tp-head">
      <span class="bt-mark" aria-hidden="true">再</span>
      <div class="tp-hb">
        <div class="keep-name rs-name"><h2></h2><button type="button" class="linklike rs-rename">名前を変える</button></div>
        <p class="lead rs-counts"></p>
      </div>
    </header>
    ${NOTE}
    <div class="rs-save" role="status" aria-live="polite"></div>
    <nav class="tp-toc" aria-label="この頁の中">
      <a href="#" data-to="rs-clues"><span>1</span>手がかり</a><a href="#" data-to="rs-plan"><span>2</span>工程の案</a><a href="#" data-to="rs-next"><span>3</span>確かめる</a><a href="#" data-to="rs-file"><span>4</span>記録</a>
    </nav>

    <section class="tp-block" id="rs-clues">
      <h3><span class="tp-n">1</span>手がかり <small class="rs-clue-n"></small></h3>
      <p class="small muted">分かることを 1 つずつ足します。足すたびに、このブラウザに残ります。合言葉がなくても貯められます。</p>
      <details class="tp-more rs-add-box"><summary>手がかりを足す</summary>
      <form class="rs-add answer-box" novalidate>
        <div class="rs-kinds" role="radiogroup" aria-label="手がかりの種類">${CLUE_KIND_IDS.map((k) => `<button type="button" role="radio" aria-checked="${k === kind}" data-k="${k}">${CLUE_KINDS[k].label}</button>`).join("")}</div>
        <div class="ans-line"><textarea class="rs-text" rows="3" maxlength="${TEXT_LIMITS.text}" aria-label="手がかりの文"></textarea><button type="button" class="mic mic-big rs-mic" aria-label="話して書く">${MIC}<span>話す</span></button></div>
        <label class="rs-field">見出し（なくてもよい）<input class="rs-title" maxlength="${TEXT_LIMITS.title}" autocomplete="off"></label>
        <label class="rs-field">どこで見たか（なくてもよい）<input class="rs-source" maxlength="${TEXT_LIMITS.source}" autocomplete="off" placeholder="本の名前、持ち主、聞いた人など"></label>
        <div class="row rs-add-row">
          <label class="ghost btnlike rs-pick">写真をつける<input type="file" accept="image/*" hidden></label>
          <span class="rs-pending" hidden><img alt="つける写真"><button type="button" class="linklike rs-unpick">写真を外す</button></span>
          <button type="submit" class="primary rs-add-go">手がかりを足す</button>
        </div>
        <p class="small rs-add-st" role="status"></p>
      </form>
      </details>
      <details class="tp-more rs-clue-box"><summary>手がかりの一覧 <span class="rs-clue-sum"></span></summary><ol class="rs-clues"></ol></details>
    </section>

    <section class="tp-block" id="rs-plan">
      <h3><span class="tp-n">2</span>工程の案 <small class="rs-plan-n"></small></h3>
      <div class="actions rs-go-box">
        <button type="button" class="primary go rs-go"></button>
        <button type="button" class="ghost rs-pw" hidden>合言葉を入れる</button>
      </div>
      <p class="small rs-status" role="status" aria-live="polite"></p>
      <div class="rs-go-notes"></div>
      <div class="rs-plan-body"></div>
    </section>

    <section class="tp-block" id="rs-next">
      <h3><span class="tp-n">3</span>分かっていない所と、次に確かめること</h3>
      <div class="rs-next-body"></div>
    </section>

    <section class="tp-block" id="rs-file">
      <h3><span class="tp-n">4</span>記録</h3>
      <p class="small muted">手がかり・案・試した結果は、このブラウザの中に残ります。ブラウザの記録を消すと消えるので、大事な記録はファイルに書き出して、手元に置いてください。書き出したファイルは、ほかのブラウザでも読み込めます。</p>
      <div class="acts rs-file-acts">
        <button type="button" class="act rs-export"><b>記録を書き出す</b><small>写真も入ったファイルになります</small></button>
        <button type="button" class="act rs-delete"><b>この技の記録を消す</b><small>手がかり・案・試した結果・写真が、全部なくなります</small></button>
      </div>
    </section>
  </section>`;

  const view = root.querySelector<HTMLElement>(".view.rs")!;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => view.querySelector<T>(s)!;

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
    if (saveError) lines.push(`${saveError} 今の中身は、この画面を閉じると消えます。写真や手がかりを減らすか、記録を書き出して残してください。`);
    if (unsaved.size) lines.push(`写真 ${unsaved.size} 枚を残せませんでした（${[...unsaved.keys()].join("・")}）。写真が大きいか、ブラウザの置き場が足りません。この画面を閉じると、この写真は消えます。記録を書き出すと、写真もファイルに残せます。`);
    box.innerHTML = lines.length ? `<div class="rs-save-bad">${lines.map((l) => `<p>${esc(l)}</p>`).join("")}<button type="button" class="ghost rs-export-now">記録を書き出す</button></div>` : "";
    box.querySelector(".rs-export-now")?.addEventListener("click", () => void exportFile());
  }

  // ---- 見出し ----

  function paintHead() {
    $("h2").textContent = project.name;
    const n = projectCounts(project);
    const tried = n.ok + n.ng;
    $(".rs-counts").textContent = `手がかり ${n.clues} ・ ${n.plans ? `案 ${n.plans}` : "案はまだ"}${tried ? ` ・ 試した結果 うまくいった ${n.ok}・いかなかった ${n.ng}` : ""}`;
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
    for (const btn of view.querySelectorAll<HTMLButtonElement>(".rs-photo[data-photo]")) {
      const url = await photoUrl(btn.dataset.photo!);
      if (!btn.isConnected) continue;
      if (url) {
        btn.querySelector("img")!.src = url;
      } else {
        const gone = document.createElement("p");
        gone.className = "small muted";
        gone.textContent = "写真は、このブラウザに残っていません。";
        btn.replaceWith(gone);
      }
    }
  }

  // ---- 手がかり ----

  function paintClues() {
    $(".rs-clue-n").textContent = `${project.clues.length} 個${usableResults(project).length ? ` ＋ 試した結果 ${usableResults(project).length}` : ""}`;
    $(".rs-clue-sum").textContent = $(".rs-clue-n").textContent;
    $(".rs-clue-box").hidden = !project.clues.length && !usableResults(project).length;
    const clues = project.clues.map(
      // 見出しを書かなかった手がかりは、見出しが本文の頭と同じなので出さない
      (c) => `<li class="rs-clue" id="rs-clue-${esc(c.id)}">
        <p class="rs-clue-head"><b class="rs-cid">${esc(c.id)}</b><span class="tag">${esc(CLUE_KINDS[c.kind].label)}</span>${c.text.startsWith(c.title.replace(/…$/, "")) ? "" : `<span class="rs-clue-title">${esc(c.title)}</span>`}</p>
        ${c.text ? `<p class="rs-clue-text">${esc(c.text)}</p>` : ""}
        ${c.photo ? `<button type="button" class="rs-photo" data-photo="${esc(c.id)}" aria-label="${esc(c.id)} の写真を大きくする"><img alt="${esc(c.id)} の写真"></button>` : ""}
        <p class="rs-clue-meta"><span>${c.source ? `どこで見たか：${esc(c.source)} ・ ` : ""}${esc(c.date)}</span><button type="button" class="linklike rc-del" data-del="${esc(c.id)}">消す</button></p>
      </li>`,
    );
    const results = usableResults(project).map(
      (r) => `<li class="rs-clue rs-clue-t" id="rs-clue-${esc(r.id)}">
        <p class="rs-clue-head"><b class="rs-cid">${esc(r.id)}</b><span class="verdict ${OUT_CLS[r.outcome]}">${OUTCOME_LABEL[r.outcome]}</span><span class="rs-clue-title">案 ${r.planVersion} の工程「${esc(r.stepTitle)}」</span></p>
        ${r.note ? `<p class="rs-clue-text">${esc(r.note)}</p>` : ""}
        <p class="rs-clue-meta"><span>試した結果は、そのまま手がかりに入ります ・ ${esc(r.date)}</span></p>
      </li>`,
    );
    const list = $(".rs-clues");
    list.innerHTML = [...clues, ...results].join("");
    list.querySelectorAll<HTMLButtonElement>("[data-del]").forEach((b) => b.addEventListener("click", () => void dropClue(b.dataset.del!)));
    list.querySelectorAll<HTMLButtonElement>(".rs-photo").forEach((b) => b.addEventListener("click", () => b.classList.toggle("big")));
    void fillThumbs();
  }

  async function dropClue(clueId: string) {
    const c = project.clues.find((x) => x.id === clueId);
    if (!c) return;
    if (!askConfirm(`手がかり ${c.id}「${c.title}」を消しますか？${c.photo ? "\n写真も消えます。" : ""}\nこれまでの案はそのまま残ります。次に組み立て直すときは渡しません。\n消すと戻せません。`)) return;
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
    const title = $<HTMLInputElement>(".rs-title");
    const source = $<HTMLInputElement>(".rs-source");
    const st = (t: string) => ($(".rs-add-st").textContent = t);
    const placeholder = () => {
      field.placeholder = `${CLUE_KINDS[kind].hint}${canListen() ? "（話しても書けます）" : ""}`;
    };
    const paintKinds = () => {
      view.querySelectorAll<HTMLButtonElement>(".rs-kinds [data-k]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.k === kind)));
      placeholder();
    };
    const draft = () => saveDraft(project.id, { kind, title: title.value, text: field.value, source: source.value });
    // 読み直しても、書きかけの文が消えないように
    const saved = loadDraft(project.id);
    // 案ができるまでは開いておく。案ができたら、たたんで案を近くに（書きかけがあれば開く）
    $<HTMLDetailsElement>(".rs-add-box").open = !project.plans.length || !!saved;
    $<HTMLDetailsElement>(".rs-clue-box").open = !project.plans.length;
    if (saved) {
      if (CLUE_KIND_IDS.includes(saved.kind as ClueKind)) kind = saved.kind as ClueKind;
      field.value = saved.text;
      title.value = saved.title;
      source.value = saved.source;
    }
    paintKinds();
    view.querySelectorAll<HTMLButtonElement>(".rs-kinds [data-k]").forEach((b) =>
      b.addEventListener("click", () => {
        kind = b.dataset.k as ClueKind;
        paintKinds();
        draft();
      }),
    );
    for (const el of [field, title, source]) el.addEventListener("input", draft);
    const voice = bindVoice($<HTMLButtonElement>(".rs-mic"), field, { onError: st });

    const showPending = () => {
      const box = $(".rs-pending");
      box.hidden = !pending;
      if (pending) box.querySelector("img")!.src = pending.url;
      $(".rs-pick").hidden = !!pending;
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
        st(r.error);
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
      st(saveError ? "" : `${r.clue.id} を足しました。`);
      $<HTMLDetailsElement>(".rs-clue-box").open = true;
      if (photo) {
        urls.set(r.clue.id, photo.url);
        try {
          await putPhoto(project.id, r.clue.id, photo.blob);
        } catch {
          unsaved.set(r.clue.id, photo.blob);
          st(`${r.clue.id} を足しましたが、写真は残せませんでした。`);
          paintSave();
        }
      }
      paintHead();
      paintClues();
      paintGo();
    });
  }

  // ---- Claude に頼む ----

  function setStatus(msg: string, working = false) {
    const box = $(".rs-status");
    if (working) box.innerHTML = `<span class="thinking inline"><span></span><span></span><span></span></span> ${esc(msg)}`;
    else box.textContent = msg;
  }

  function paintGo() {
    const go = $<HTMLButtonElement>(".rs-go");
    const last = project.plans.at(-1);
    const fresh = freshSince(project);
    const busy = inFlight.has(project.id);
    const extras = [fresh.results ? `試した結果 ${fresh.results}` : "", fresh.clues ? `新しい手がかり ${fresh.clues}` : ""].filter(Boolean).join("・");
    go.textContent = !last ? `Claude に案を作ってもらう（手がかり ${project.clues.length}）` : extras ? `もう一度組み立て直す（${extras} を加えて）` : "もう一度組み立て直す";
    go.disabled = busy || !project.clues.length;
    const hasPass = !!store.password();
    $(".rs-pw").hidden = hasPass;
    const notes: string[] = [];
    if (!project.clues.length) notes.push("手がかりを 1 つ足すと、Claude に案を頼めます。");
    else if (project.clues.length < 3 && !last) notes.push("手がかりが少ないうちは、推し量りが多くなります。");
    if (!hasPass) notes.push("案を作るには Claude が要ります。合言葉を入れると使えます。手がかりを貯めることは、合言葉なしでできます。");
    const { left } = photosToSend(project.clues);
    if (left.length) notes.push(`写真が多いので、${left.join("・")} の写真は渡しません（多くて ${PHOTO_SEND.count} 枚まで）。`);
    if (project.clues.length) notes.push(`案を作るときは、手がかりの文と写真（小さくして）を Claude に送ります。1〜2 分かかります。${last ? "前の案は消えずに残ります。" : ""}`);
    $(".rs-go-notes").innerHTML = notes.map((n) => `<p class="small muted">${esc(n)}</p>`).join("");
    if (busy) setStatus("Claude が手がかりを読んで、案を作っています（1〜2 分かかります）…", true);
  }

  async function build() {
    if (inFlight.has(project.id) || !project.clues.length) return;
    const pass = store.password() || (await askPassword(true));
    paintGo();
    if (!pass) return setStatus("案を作るには Claude が要ります。合言葉を入れてください。手がかりは、このまま残っています。");
    const base = project;
    inFlight.add(base.id);
    paintGo();
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
      system: restorePrompt(),
      user: restoreContent(base, photos),
      tool: PROPOSE_RESTORATION,
      parse: (x) => parseRestoration(x, { ids: knownClueIds(base), prev }),
      password: pass,
    });
    inFlight.delete(base.id);
    if (!r.ok) {
      if (r.code === "wrong_password") resetPassword();
      if (view.isConnected) {
        paintGo();
        setStatus(`${r.error}${r.code === "wrong_password" ? " もう一度入れてください。" : ""} 手がかりは、このまま残っています。`);
      }
      return;
    }
    const warnings = [
      ...(r.warnings ?? []),
      ...(left.length ? [`写真が多いので、${left.join("・")} の写真は渡しませんでした。`] : []),
      ...(missing.length ? [`${missing.join("・")} の写真は、このブラウザに残っていないので渡しませんでした。`] : []),
    ];
    // 待っている間に足した手がかりは消さない（渡したものだけを、この案の控えにする）
    const current = view.isConnected ? project : (loadProject(base.id) ?? base);
    const next = applyPlan(current, r.value, { date: today(), sent: clueRefs(base), photosSent: photos.map((x) => x.id), sources: sourceText(base), warnings });
    if (view.isConnected) {
      commit(next);
      viewing = null;
      openTrials.clear();
      $<HTMLDetailsElement>(".rs-add-box").open = false;
      $<HTMLDetailsElement>(".rs-clue-box").open = false;
      paintAll();
      setStatus(`案 ${next.plans.at(-1)!.version} を作りました。これは案です。試して、結果を工程ごとに残してください。${r.remaining !== undefined ? `今日あと ${r.remaining} 回。` : ""}`);
      $("#rs-plan").scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      const saved = saveProject(next);
      if (!saved.ok) flash(saved.error);
      watchers.get(base.id)?.();
    }
  }

  // ---- 案 ----

  const viewedPlan = (): RestorePlan | undefined => (viewing === null ? project.plans.at(-1) : (project.plans.find((v) => v.version === viewing) ?? project.plans.at(-1)));

  /** 根拠の番号のボタン。消した手がかりにはそう書く */
  function chip(clueId: string, plan: RestorePlan): string {
    const ref = plan.clues.find((c) => c.id === clueId);
    const alive = project.clues.some((c) => c.id === clueId) || usableResults(project).some((t) => t.id === clueId);
    return `<button type="button" class="cid${alive ? "" : " gone"}" data-cid="${esc(clueId)}" title="${esc(alive ? (ref?.title ?? "") : `消した手がかり：${ref?.title ?? ""}`)}">${esc(clueId)}</button>`;
  }

  function stepInner(plan: RestorePlan, s: PlanStep, i: number, latest: boolean): string {
    const found = resultFor(project, plan, s);
    const outcome: Outcome = found?.result.outcome ?? "pending";
    const tested = outcome !== "pending";
    const chg = plan.version > 1 ? CHANGE[s.change] : null;
    const prevPlan = project.plans[project.plans.indexOf(plan) - 1];
    const prevStep = s.prevStep ? prevPlan?.steps[s.prevStep - 1] : undefined;
    const prevText = prevStep ? `<details><summary>前の案（案 ${prevPlan?.version} の工程 ${s.prevStep}）の文</summary><p><b>${esc(prevStep.title)}</b></p><p>${esc(prevStep.detail)}</p></details>` : "";
    const past = pastResults(project, plan, s).filter((r) => !(found?.carried && r.id === found.result.id));
    const kept = project.kept.find((k) => k.stepKey === s.key);
    const own = found && !found.carried ? found.result.note : "";
    return `
      <span class="n">${i + 1}</span>
      <div class="sbody">
        <p class="stitle">${esc(s.title)}${tested ? `<span class="verdict ${OUT_CLS[outcome]}">${OUTCOME_LABEL[outcome]}</span>` : `<span class="tag warn">案</span>`}${chg ? `<span class="verdict ${chg.cls}">${chg.label}</span>` : ""}</p>
        <p class="sdetail">${esc(s.detail)}</p>
        ${
          s.change === "changed" && (s.changeNote || prevStep)
            ? `<div class="rs-change"><p>${s.changeNote ? esc(s.changeNote) : "前の案から変わりました。"}</p>${prevText}</div>`
            : s.change === "same" && prevStep && (prevStep.title !== s.title || prevStep.detail !== s.detail)
              ? `<div class="rs-change rs-change-soft"><p>Claude は「そのまま」としましたが、文は少しちがいます。</p>${prevText}</div>`
              : ""
        }
        <p class="smeta">${s.basis === "prior" ? `<span class="tag warn">手がかりなし ・ もともとの知識から</span>` : `根拠 ${s.clue_ids.map((x) => chip(x, plan)).join("")}`}<span class="conf" title="確からしさ">確からしさ ${dots(s.confidence)}</span></p>
        ${s.uncertain ? `<p class="sunsure">まだ分からない：${esc(s.uncertain)}</p>` : ""}
        ${s.caution ? `<p class="rs-caution"><b>危ない所</b>${esc(s.caution)}</p>` : ""}
        ${s.unsourced?.length ? `<p class="rs-unsourced">手がかりにない数字：${esc(s.unsourced.join("・"))}（試すまで使わないでください）</p>` : ""}
        ${past.map((r) => `<p class="rs-past">案 ${r.planVersion} で試した結果：<span class="verdict ${OUT_CLS[r.outcome]}">${OUTCOME_LABEL[r.outcome]}</span>${r.note ? `「${esc(r.note)}」` : ""}</p>`).join("")}
        ${found?.carried ? `<p class="rs-past">案 ${found.result.planVersion} で試した結果を引き継いでいます：<span class="verdict ${OUT_CLS[outcome]}">${OUTCOME_LABEL[outcome]}</span>${found.result.note ? `「${esc(found.result.note)}」` : ""}</p>` : ""}
        ${
          latest
            ? `<details class="rs-trial"${openTrials.has(s.key) ? " open" : ""}>
          <summary>${trialSummary(found?.result.outcome, own)}</summary>
          <div class="rs-out" role="radiogroup" aria-label="試した結果">${OUTCOMES.map((o) => `<button type="button" role="radio" aria-checked="${o === outcome}" data-o="${o}" class="o-${o}">${OUTCOME_LABEL[o]}</button>`).join("")}</div>
          <div class="answer-box"><div class="ans-line"><textarea class="rs-note-field" rows="2" maxlength="${TEXT_LIMITS.note}" placeholder="試して分かったこと（職人の言葉で）" aria-label="試して分かったこと">${esc(own)}</textarea><button type="button" class="mic mic-big rs-note-mic" aria-label="話して書く">${MIC}<span>話す</span></button></div></div>
          <p class="small rs-trial-st" role="status"></p>
        </details>`
            : found && !found.carried
              ? `<p class="rs-past">試した結果：<span class="verdict ${OUT_CLS[outcome]}">${OUTCOME_LABEL[outcome]}</span>${own ? `「${esc(own)}」` : ""}</p>`
              : ""
        }
        ${
          kept
            ? `<p class="small rs-kept">帳面に入れました：<b>${esc(kept.title)}</b>（${esc(kept.book)} ・ ${esc(kept.date)}） <a href="#ledger">帳面を見る</a></p>`
            : latest && outcome === "ok"
              ? `<button type="button" class="ghost rs-to-rule">確かめた工程を、帳面の決まりにする</button>`
              : ""
        }
        <p class="small rs-rule-st" role="status"></p>
        <div class="proposal-slot"></div>
      </div>`;
  }

  function wireStep(li: HTMLElement, plan: RestorePlan, s: PlanStep, i: number) {
    const field = li.querySelector<HTMLTextAreaElement>(".rs-note-field");
    const details = li.querySelector<HTMLDetailsElement>(".rs-trial");
    if (!field || !details) return;
    details.addEventListener("toggle", () => {
      if (details.open) openTrials.add(s.key);
      else openTrials.delete(s.key);
    });
    const st = (t: string) => (li.querySelector(".rs-trial-st")!.textContent = t);
    const refreshAround = () => {
      paintHead();
      paintClues();
      paintGo();
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const saveNote = () => {
      clearTimeout(timer);
      timer = undefined;
      const outcome = resultFor(project, plan, s)?.result.outcome ?? "pending";
      commit(setResult(project, plan, s, { outcome, note: field.value }, today()));
      st(saveError ? "" : "残しました。");
      details.querySelector("summary")!.textContent = trialSummary(resultFor(project, plan, s)?.result.outcome, field.value.trim());
      refreshAround();
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
        openTrials.add(s.key);
        commit(setResult(project, plan, s, { outcome: b.dataset.o as Outcome, note: field.value }, today()));
        paintStep(li, plan, s, i);
        li.querySelector<HTMLElement>(`.rs-out [data-o="${b.dataset.o}"]`)?.focus();
        li.querySelector(".rs-trial-st")!.textContent = saveError ? "" : "残しました。";
        refreshAround();
      }),
    );
    bindVoice(li.querySelector<HTMLButtonElement>(".rs-note-mic")!, field, { onError: st });
    li.querySelector(".rs-to-rule")?.addEventListener("click", () => void makeRule(li, plan, s, i));
  }

  function paintStep(li: HTMLElement, plan: RestorePlan, s: PlanStep, i: number) {
    li.className = s.basis === "prior" ? "prior" : "";
    li.innerHTML = stepInner(plan, s, i, plan === project.plans.at(-1));
    wireStep(li, plan, s, i);
  }

  function paintPlan() {
    const body = $(".rs-plan-body");
    const plan = viewedPlan();
    const n = $(".rs-plan-n");
    if (!plan) {
      n.textContent = "";
      body.innerHTML = "";
      return;
    }
    const last = project.plans.at(-1)!;
    const latest = plan === last;
    n.textContent = `案 ${plan.version} ・ ${plan.date}`;
    const diff = planDiff(plan);
    body.innerHTML = `
      ${
        project.plans.length > 1
          ? `<div class="rs-versions" role="group" aria-label="案を選ぶ">${project.plans
              .map((v) => `<button type="button" class="ghost" aria-pressed="${v === plan}" data-v="${v.version}">案 ${v.version}${v === last ? "（いま）" : ""}</button>`)
              .join("")}</div>`
          : ""
      }
      ${latest ? "" : `<p class="rs-old">前の案です。いまの案は案 ${last.version} です。試した結果は、いまの案の工程に書きます。</p>`}
      ${
        diff
          ? `<div class="rs-diff"><h4>案 ${project.plans[project.plans.indexOf(plan) - 1]?.version} からの違い</h4>
          <p class="rs-diff-n"><span class="verdict part">変わった ${diff.changed}</span><span class="verdict new">新しい ${diff.added}</span><span class="verdict miss">やめた ${diff.dropped}</span><span class="verdict same">そのまま ${diff.same}</span></p>
          ${plan.changes ? `<p class="rs-diff-text">${esc(plan.changes)}</p>` : ""}</div>`
          : ""
      }
      <p class="hsum">${esc(plan.summary)}</p>
      <ol class="steps-h tp-check rs-steps">${plan.steps.map(() => "<li></li>").join("")}</ol>
      ${
        plan.dropped.length
          ? `<div class="missed"><h4>この案でやめた工程</h4><ul>${plan.dropped.map((d) => `<li><b>${esc(d.title)}</b><span>${d.why ? esc(d.why) : "Claude は理由を書きませんでした。"}</span></li>`).join("")}</ul></div>`
          : ""
      }
      <p class="small muted rs-sent">この案に渡した手がかり：${plan.clues.map((c) => esc(c.id)).join("・") || "なし"}${plan.photosSent.length ? ` ・ 写真 ${plan.photosSent.map(esc).join("・")}` : ""}</p>
      ${
        plan.notes.length
          ? `<details class="rs-notes"><summary>受け取るときに気づいたこと ${plan.notes.length}</summary><ul>${plan.notes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>`
          : ""
      }`;
    body.querySelectorAll<HTMLButtonElement>(".rs-versions [data-v]").forEach((b) =>
      b.addEventListener("click", () => {
        viewing = Number(b.dataset.v);
        paintPlan();
        paintNext();
      }),
    );
    body.querySelectorAll<HTMLElement>(".rs-steps > li").forEach((li, i) => paintStep(li, plan, plan.steps[i], i));
  }

  function paintNext() {
    const body = $(".rs-next-body");
    const plan = viewedPlan();
    if (!plan) {
      body.innerHTML = `<p class="small muted">案ができると、ここに、まだ分かっていない所と、次に確かめるとよい試作や調べが、順に出ます。</p>`;
      return;
    }
    const ref = (n: number) => (n ? `<small class="rs-ref">工程 ${n}</small>` : "");
    body.innerHTML = `
      <p class="small muted">答え合わせはありません。ここに出た順に確かめて、結果を工程の欄に残してください（案 ${plan.version}）。</p>
      <div class="trials rs-order"><h4>分かっていない所（大事な順）</h4>
        <ol>${plan.unknowns.map((u) => `<li><b>${esc(u.what)}</b>${u.why ? `<span>${esc(u.why)}</span>` : ""}${ref(u.step)}</li>`).join("")}</ol></div>
      <div class="trials rs-order"><h4>次に確かめるとよいこと（先にやる順）</h4>
        <ol>${plan.nextChecks
          .map(
            (c) => `<li><b><span class="tag">${CHECK_KINDS[c.kind]}</span> ${esc(c.what)}</b>${c.why ? `<span>${esc(c.why)}</span>` : ""}${c.caution ? `<span class="rs-caution"><b>危ない所</b>${esc(c.caution)}</span>` : ""}${c.unsourced?.length ? `<span class="rs-unsourced">手がかりにない数字：${esc(c.unsourced.join("・"))}</span>` : ""}${ref(c.step)}</li>`,
          )
          .join("")}</ol></div>`;
  }

  function paintAll() {
    paintHead();
    paintClues();
    paintGo();
    paintPlan();
    paintNext();
  }

  // ---- 帳面へ（帳面の聞き取りと同じ流れ：案 → 職人が直す → 確かめの窓 → 足す） ----

  async function makeRule(li: HTMLElement, plan: RestorePlan, s: PlanStep, i: number) {
    const found = resultFor(project, plan, s);
    const st = (t: string) => (li.querySelector(".rs-rule-st")!.textContent = t);
    const said = found?.result.note.trim() ?? "";
    if (!said) {
      openTrials.add(s.key);
      li.querySelector<HTMLDetailsElement>(".rs-trial")!.open = true;
      li.querySelector<HTMLTextAreaElement>(".rs-note-field")!.focus();
      return st("決まりにするには、試して分かったことを、職人の言葉で残してください。");
    }
    const ledger = store.ledger();
    const name = masterName(ledger);
    const slot = li.querySelector<HTMLElement>(".proposal-slot")!;
    const direct = (why: string) => {
      st(why);
      showProposal(li, plan, s, i, { title: `${project.name}：${s.title}`, text: said, reason: "（理由はまだ聞いていない）", quote: said });
    };
    slot.innerHTML = "";
    const pass = store.password() || (await askPassword(true));
    if (!pass) return direct("合言葉がないので、職人の言葉をそのまま案にしました。直してから足せます。");
    st("Claude が決まりの案にまとめています…");
    const r = await callTool<ProposeRuleInput>({
      system: keepPrompt(ledger, name),
      user: ruleRequest(project.name, s.title, s.detail, name, said),
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
      return direct(`Claude につながらないので、職人の言葉をそのまま案にしました。（${r.error}）`);
    }
    st("");
    showProposal(li, plan, s, i, r.value);
  }

  /** 決まりの案を見せる。職人が「これでいい」を押して、確かめの窓で OK したときだけ帳面に入る */
  function showProposal(li: HTMLElement, plan: RestorePlan, s: PlanStep, i: number, p: ProposeRuleInput) {
    const slot = li.querySelector<HTMLElement>(".proposal-slot")!;
    slot.innerHTML = `<div class="proposal">
      <p class="small">決まりの案です。直してから足せます。</p>
      <label>短い名前<input data-p="title" value="${esc(p.title)}"></label>
      <label>決まり<textarea data-p="text" rows="2">${esc(p.text)}</textarea></label>
      <label>なぜ<textarea data-p="reason" rows="2">${esc(p.reason)}</textarea></label>
      ${p.quote ? `<blockquote>「${esc(p.quote)}」</blockquote>` : ""}
      <div class="row"><button type="button" class="primary" data-a="ok">これでいい</button><button type="button" class="ghost" data-a="no">いらない</button></div>
    </div>`;
    const read = (k: string) => slot.querySelector<HTMLInputElement>(`[data-p="${k}"]`)!.value.trim();
    slot.querySelector('[data-a="no"]')!.addEventListener("click", () => (slot.innerHTML = `<p class="small">見送りました。</p>`));
    slot.querySelector('[data-a="ok"]')!.addEventListener("click", () => {
      const title = read("title");
      const text = read("text");
      if (!title || !text) return void (li.querySelector(".rs-rule-st")!.textContent = "短い名前と決まりは、空にできません。");
      const ledger = store.ledger();
      const book = bookTitle(bookLabel(ledger));
      if (!askConfirm(`この決まりを「${book}」に入れますか？\n設計の確かめと、学ぶ人への答えに使われます。`)) return;
      // 指輪の値（param）には結びつけない。別の技の決まりで、爪などの値が変わらないように
      const next = addRule(ledger, { title, text, reason: read("reason"), quote: p.quote, example: p.example, source: { kind: "craftsman", name: masterName(ledger) }, date: today() });
      const rule = next.rules[next.rules.length - 1];
      store.setLedger(next);
      commit({ ...project, kept: [...project.kept, { stepKey: s.key, ruleId: rule.id, title, book, date: today() }], updated: today() });
      paintStep(li, plan, s, i);
      flash(`帳面に入れました：${title}`);
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
    flash("記録を書き出しました。");
  }

  // ---- はじめの結びつけ ----

  $(".back").addEventListener("click", () => (location.hash = "#waza/restore"));
  view.querySelectorAll<HTMLAnchorElement>(".tp-toc a").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      view.querySelector(`#${a.dataset.to}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }),
  );
  $(".rs-rename").addEventListener("click", () => {
    const head = $(".rs-name");
    if (head.querySelector(".rename-form")) return;
    head.insertAdjacentHTML("beforeend", `<form class="rename-form"><input value="${esc(project.name)}" aria-label="技の名前" maxlength="${TEXT_LIMITS.name}"><button type="submit" class="primary">決める</button></form>`);
    const form = head.querySelector<HTMLFormElement>(".rename-form")!;
    const input = form.querySelector("input")!;
    input.select();
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      commit(renameProject(project, input.value, today()));
      form.remove();
      paintHead();
    });
  });
  $(".rs-go").addEventListener("click", () => void build());
  $(".rs-pw").addEventListener("click", async () => {
    await askPassword(true);
    paintGo();
  });
  // 根拠の番号を押すと、その手がかりへ
  $(".rs-plan-body").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".cid");
    if (!b) return;
    const li = view.querySelector<HTMLElement>(`#rs-clue-${CSS.escape(b.dataset.cid!)}`);
    if (!li) return flash("この手がかりは、もう消してあります。");
    $<HTMLDetailsElement>(".rs-clue-box").open = true;
    li.scrollIntoView({ behavior: "smooth", block: "center" });
    li.classList.add("flash");
    setTimeout(() => li.classList.remove("flash"), 1600);
  });
  $(".rs-export").addEventListener("click", () => void exportFile());
  $(".rs-delete").addEventListener("click", async () => {
    if (!askConfirm(`「${project.name}」の記録を消しますか？\n手がかり・案・試した結果・写真が全部なくなります。消すと戻せません。\n（書き出したファイルがあれば、あとで読み込めます）`)) return;
    const pid = project.id;
    const photos = project.clues.filter((c) => c.photo).map((c) => c.id);
    removeProject(pid);
    await Promise.all(photos.map((c) => removePhoto(pid, c)));
    flash(`消しました：${project.name}`);
    location.hash = "#waza/restore";
  });
  // 合言葉を、上の帯のボタンから入れたときも、案内を合わせる
  const onPassword = () => {
    if (!view.isConnected) return window.removeEventListener("tsugu:password", onPassword);
    paintGo();
  };
  window.addEventListener("tsugu:password", onPassword);
  // 開き直した画面にも、待っていた案を届ける
  watchers.set(project.id, () => {
    if (!view.isConnected) return;
    project = loadProject(project.id) ?? project;
    viewing = null;
    paintAll();
    setStatus("案ができました。これは案です。試して、結果を工程ごとに残してください。");
  });

  clueForm();
  paintAll();
  paintSave();
}
