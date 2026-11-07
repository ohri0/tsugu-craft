// 模様の見込み（#waza/restore/<記録の id>/moyou/<案の番号>）：途切れた技の案の手順のとおりに作ると、どんな模様・見た目になるか。
// 手順は、入れたことと職人の帳面から Claude が推し量った案。それを Claude が計算の操作に置きかえ（predict_pattern。src/rebuild/pattern-tools.ts）、
// 計算が形だけで描く。重ねる技は層の動き（src/rebuild/pattern-sim.ts）、重ねない技は 1 枚の板の表の凹凸と材料（src/rebuild/pattern-relief.ts）。
// 見た目は、木目金の模様の試し（src/app/moyou-view.ts）にそろえる：段が 1 つずつ現れ（同じ間・同じ字）、どの段も「横から見た切り口」と「上から見た面」。
// 最後に、出来上がりの面を大きく、前の案の見込みがあれば同じ大きさで並べ、断面も並べる。
// →・スペースで 1 段ずつ、← で戻る、R ではじめから、P で順に見る。
// 合う計算が無い技は、Claude がそう答え、絵は描かない。
import "./moyou.css";
import "./pattern.css";
import { patternRecordOf, reviewPattern } from "../rebuild/pattern-check";
import { modelOf, type PatternModel } from "../rebuild/pattern-model";
import type { Rgba } from "../rebuild/pattern-sim";
import { opWords, parsePattern, patternContext, patternPrompt, patternRequest, PREDICT_PATTERN, TOOL_OP_LABEL, type PatternPrediction, type PatternRecord } from "../rebuild/pattern-tools";
import { namesOf, plainWords, setPattern, withoutMark, type RestorePlan, type RestoreProject } from "../rebuild/restore";
import { callTool, type CallToolResult } from "../rebuild/run";
import { askPassword, resetPassword } from "./password";
import { saveProject } from "./restore-store";
import { esc, store, today } from "./store";

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
/** 絵のたね（同じ技なら、案が変わっても同じ所に穴があく。ちがいが手順のちがいだけから出るように） */
const SEED = 7;
/** 段を見せる間（木目金の模様の試しと同じ） */
const STEP_MS = 1900;
const FINAL_MS = 2400;

/** 頼んでいる最中の案（記録の id:案の番号） */
const inFlight = new Set<string>();

export const patternHash = (projectId: string, version: number) => `#waza/restore/${projectId}/moyou/${version}`;

/** Claude に、案の手順を模様の操作に置きかえてもらう。前の案の見込み（仮の値をそろえる）と、試した結果（絵を合わせる）も添える */
export function predictFor(p: RestoreProject, plan: RestorePlan, password: string): Promise<CallToolResult<PatternPrediction>> {
  const names = namesOf(p, plan);
  return callTool({
    system: patternPrompt(),
    user: patternRequest(p.name, plan, (s) => plainWords(s, names), patternContext(p, plan)),
    tool: PREDICT_PATTERN,
    parse: (x) => parsePattern(x, { steps: plan.steps.length }),
    // 言った見込み（地の材料と色・見える材料）を、計算の絵でくらべ、食いちがえば 1 回だけ直してもらう
    review: reviewPattern(PREDICT_PATTERN.name, SEED),
    password,
  });
}

/** 合言葉を聞いて Claude に頼み、案に残す。うまくいけば新しい記録、だめなら理由 */
export async function makePattern(p: RestoreProject, version: number): Promise<{ ok: true; project: RestoreProject } | { ok: false; error: string }> {
  const plan = p.plans.find((v) => v.version === version);
  if (!plan) return { ok: false, error: "案が見つかりません。" };
  const key = `${p.id}:${version}`;
  if (inFlight.has(key)) return { ok: false, error: "いま Claude が考えています。" };
  const pass = store.password() || (await askPassword(true));
  if (!pass) return { ok: false, error: "模様の見込みを作るには、合言葉が要ります。" };
  inFlight.add(key);
  const r = await predictFor(p, plan, pass);
  inFlight.delete(key);
  if (!r.ok) {
    if (r.code === "wrong_password") resetPassword();
    return { ok: false, error: r.error };
  }
  const record: PatternRecord = patternRecordOf(r, today(), SEED);
  const next = setPattern(p, version, record, today());
  const saved = saveProject(next);
  if (!saved.ok) return { ok: false, error: saved.error };
  return { ok: true, project: next };
}

export const patternBusy = (projectId: string, version: number) => inFlight.has(`${projectId}:${version}`);

/** 画素の並びを canvas に置く（大きさは CSS で） */
export function putImage(c: HTMLCanvasElement, img: Rgba) {
  c.width = img.w;
  c.height = img.h;
  c.getContext("2d")!.putImageData(new ImageData(img.data as unknown as Uint8ClampedArray<ArrayBuffer>, img.w, img.h), 0, 0);
}

const pause = () => new Promise<void>((r) => setTimeout(r, 0));

/** 案の欄に出す小さな絵 */
export function drawThumb(c: HTMLCanvasElement, pred: PatternPrediction) {
  if (!pred.applicable) return;
  void modelOf(pred, SEED)
    .top(96, 1, pause)
    .then((img) => img && putImage(c, img));
}

function dpr(): number {
  return Math.min(2, Math.max(1, window.devicePixelRatio || 1));
}

/** canvas の画素を、見えている大きさ × 画面の細かさに合わせる */
function fit(c: HTMLCanvasElement): { w: number; h: number; ctx: CanvasRenderingContext2D } {
  const r = c.getBoundingClientRect();
  const k = dpr();
  const w = Math.max(40, Math.round(r.width * k));
  const h = Math.max(20, Math.round(r.height * k));
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  return { w, h, ctx: c.getContext("2d")! };
}

function toCanvas(img: Rgba): HTMLCanvasElement {
  const t = document.createElement("canvas");
  t.width = img.w;
  t.height = img.h;
  t.getContext("2d")!.putImageData(new ImageData(img.data as unknown as Uint8ClampedArray<ArrayBuffer>, img.w, img.h), 0, 0);
  return t;
}

/** 断面を、上下に少し余白をとって描く（板が帯に見えるように） */
function drawSection(c: HTMLCanvasElement | null, m: PatternModel, row: number, fill: number) {
  if (!c?.isConnected) return;
  const { w, h, ctx } = fit(c);
  const band = Math.max(8, Math.round(h * fill));
  const img = m.section(w, band, row, dpr() >= 2 ? 1 : 2);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(toCanvas(img), 0, Math.round((h - band) / 2));
}

/** 上から見た面（canvas の形に合わせて、断面の行のまわりの帯を切り出す）。断面を切った所に、細い印 */
async function drawTop(c: HTMLCanvasElement | null, m: PatternModel, row: number, alive: () => boolean, mark: "line" | "ticks" | "none") {
  if (!c?.isConnected) return;
  const { w, h } = fit(c);
  const n = w;
  const span = h / w;
  let b0 = row - span / 2;
  b0 = Math.max(0, Math.min(1 - span, b0));
  const ss = n > 500 || dpr() >= 2 ? 1 : 2;
  const img = await m.top(n, ss, pause, () => !alive(), span >= 1 ? [0, 1] : [b0, b0 + span]);
  if (!img || !alive()) return;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(toCanvas(img), 0, 0, w, Math.round((img.h * w) / img.w));
  const y = Math.round((row - (span >= 1 ? 0 : b0)) * n) + 0.5;
  ctx.save();
  ctx.strokeStyle = "rgba(240, 217, 176, 0.75)";
  ctx.lineWidth = Math.max(1, dpr());
  if (mark === "line") {
    ctx.setLineDash([4 * dpr(), 4 * dpr()]);
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  } else if (mark === "ticks") {
    const t = Math.round(w * 0.025);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(t, y);
    ctx.moveTo(w - t, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** 今開いている頁の番号と、前の頁の片付け（案を切りかえると頁を作り直すので、前の頁の描きかけを止める） */
let mounted = 0;
let cleanupPrev: () => void = () => undefined;

export function mountPatternView(root: HTMLElement, project: RestoreProject, version: number | null, opts: { onBack: () => void }): void {
  cleanupPrev();
  const me = ++mounted;
  let p = project;
  const withPattern = () => p.plans.filter((v) => v.pattern);
  let plan = (version !== null ? p.plans.find((v) => v.version === version) : undefined) ?? p.plans.at(-1);
  const html = document.documentElement;
  html.classList.add("mo-page");
  let gen = 0;
  /** 頁を描き直した回（絵の描きかけの gen とは別。ボタンの答えが、古い頁に届かないように） */
  let renders = 0;
  let timer = 0;
  let step = 0;
  let last = 0;
  let redraw: () => void = () => undefined;
  const alive = (g: number) => () => g === gen && me === mounted;
  const stopTimer = () => {
    clearTimeout(timer);
    timer = 0;
  };
  const onKey = (e: KeyboardEvent) => {
    if (me !== mounted || !root.querySelector(".pv-stage")) return;
    if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName) && e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    if (e.key === "ArrowRight" || e.key === " ") {
      e.preventDefault();
      stopTimer();
      go(step + 1);
    } else if (e.key === "ArrowLeft") {
      stopTimer();
      go(step - 1);
    } else if (e.key === "r" || e.key === "R" || e.key === "Home") {
      stopTimer();
      go(0);
    } else if (e.key === "p" || e.key === "P") play();
  };
  let resizeTimer = 0;
  let lastWidth = window.innerWidth;
  const onResize = () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => redraw(), 250);
  };
  const cleanup = () => {
    gen++;
    stopTimer();
    window.removeEventListener("hashchange", onHash);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", onResize);
  };
  const onHash = () => {
    if (/\/moyou/.test(location.hash)) return;
    cleanup();
    html.classList.remove("mo-page");
  };
  cleanupPrev = cleanup;
  window.addEventListener("hashchange", onHash);
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);

  const unmark = (s: string) => (p.sample ? withoutMark(s) : s);
  const says = (s: string, v: RestorePlan) => esc(plainWords(unmark(s), namesOf(p, v)));

  function basisOf(v: RestorePlan, stepNo: number): string {
    const s = v.steps[stepNo - 1];
    if (!s) return `<p class="pv-basis is-added">案にない操作（絵を描くために Claude が足した）</p>`;
    if (s.basis === "prior") return `<p class="pv-basis is-prior">もとにしたもの：Claude がもともと知っていること</p>`;
    const book = (s.book_ids ?? []).map((b) => v.book.find((x) => x.id === b)?.title).filter(Boolean);
    return `${book.length ? `<p class="pv-basis is-book"><span class="rs-pill book">職人の帳面から</span>${esc(book.join("・"))}</p>` : ""}${s.clue_ids.length ? `<p class="pv-basis">もとにしたもの：入れたこと（${esc(s.clue_ids.map((id) => unmark(namesOf(p).get(id) ?? "入れたこと")).join("・"))}）</p>` : ""}`;
  }

  /** 見えている段に合わせて印をつける（絵は描き直さない） */
  function show() {
    const sec = root.querySelector<HTMLElement>(".pv");
    if (!sec) return;
    const stages = [...root.querySelectorAll<HTMLElement>(".pv-stage")];
    stages.forEach((s, i) => s.classList.toggle("on", step > i));
    sec.classList.toggle("on-final", step >= last);
    const count = root.querySelector(".pv-count");
    const names = stages.map((s) => s.dataset.name ?? "");
    if (count) count.textContent = step >= last ? "出来上がり" : step === 0 ? "はじめ" : `${CIRCLED[step - 1] ?? step} ${names[step - 1]}`;
    const next = root.querySelector<HTMLButtonElement>(".pv-next");
    if (next) next.disabled = step >= last;
    const prev = root.querySelector<HTMLButtonElement>(".pv-prev");
    if (prev) prev.disabled = step <= 0;
  }

  function go(n: number) {
    step = Math.max(0, Math.min(last, n));
    show();
  }

  /** はじめから順に（木目金の模様の試しと同じ間） */
  function play() {
    stopTimer();
    go(0);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return go(last);
    const tick = () => {
      if (me !== mounted || !root.isConnected) return;
      go(step + 1);
      if (step < last) timer = window.setTimeout(tick, step === last - 1 ? FINAL_MS : STEP_MS);
    };
    timer = window.setTimeout(tick, 700);
  }

  function render() {
    gen++;
    stopTimer();
    const my = ++renders;
    if (!plan) {
      root.innerHTML = `<section class="view moyou pv"><button type="button" class="rs-back pv-back">← 案にもどる</button><p class="rs-empty">まだ案がありません。</p></section>`;
      root.querySelector(".pv-back")!.addEventListener("click", opts.onBack);
      return;
    }
    const v = plan;
    const n = p.plans.indexOf(v) + 1;
    const rec = v.pattern;
    const pred = rec?.prediction;
    const prev = p.plans
      .slice(0, p.plans.indexOf(v))
      .reverse()
      .find((x) => x.pattern?.prediction.applicable);
    const tabs = withPattern();
    const busy = patternBusy(p.id, v.version);
    const ops = pred?.applicable ? pred.ops : [];
    last = ops.length + 1;
    const cols = ops.length <= 5 ? ops.length : Math.min(5, Math.ceil(ops.length / 2));
    const surface = ops[0]?.op === "plate";
    // 重ねずに 1 つの鋳た塊から始める技（ingot。2026-11-08）
    const cast = ops[0]?.op === "ingot";
    root.innerHTML = `
    <section class="view moyou pv">
      <button type="button" class="rs-back pv-back">← 案にもどる</button>
      <header class="mo-head">
        <p class="mo-eyebrow">${surface ? "見た目の見込み" : "模様の見込み"} ・ 形だけの計算（仮）${p.sample ? `<span class="rs-example pv-example">これは作り話の例です</span>` : ""}</p>
        <h2>「${esc(p.name)}」を、${n} 回目の案の手順で作ると</h2>
        <p class="mo-lead">手順は、入れたこと${v.bookOn ? "と職人の帳面" : ""}から Claude が推し量った案です。Claude がその手順を計算の操作に置きかえ、${surface ? "1 枚の板の表がどう変わるか" : cast ? "鋳た塊の中のむらがどう動くか" : "重ねた層がどう動くか"}を形だけで描きました。<b>金属の本当の流れや熱は計算しません。数はどれも絵のための仮の値です。最後に決めるのは職人です。</b></p>
        ${tabs.length > 1 ? `<div class="mo-runs" role="radiogroup" aria-label="どの案の見込みか">${tabs.map((x) => `<button type="button" role="radio" aria-checked="${x === v}" data-v="${x.version}">${p.plans.indexOf(x) + 1} 回目の案</button>`).join("")}</div>` : ""}
      </header>
      ${
        !pred
          ? `<div class="pv-none"><p>この案の手順では、まだ見込みを作っていません。</p>
             <button type="button" class="primary rs-big pv-make"${busy ? " disabled" : ""}>${busy ? "Claude が考えています…" : "この手順で作ると、どんな模様になるか見る"}</button>
             <p class="pv-st" role="status"></p></div>`
          : !pred.applicable
            ? `<div class="pv-decline">
                <p class="pv-decline-h">この技は、この計算で描ける技ではなさそうです。だから絵は描きません。</p>
                <p>Claude の答え：${says(pred.reason, v)}</p>
                ${pred.cannot_show ? `<p class="pv-sub">この計算で表せないこと：${says(pred.cannot_show, v)}</p>` : ""}
                <p class="pv-sub">この計算は、色のちがう材料を重ねて模様を出す技と、1 枚の板の表を彫る・打つ・透かす・はめるなどで飾る技を描きます。合わない技を、無理に絵にはしません。</p>
              </div>`
            : `
      <p class="pv-sum">${says(pred.summary, v)}</p>
      <ol class="pv-stages" style="--pv-cols:${cols}">${ops
        .map(
          (o, i) => `<li class="pv-stage" data-i="${i}" data-name="${esc(TOOL_OP_LABEL[o.op].replace(/（.*）/, ""))}">
          <div class="mo-sh"><span class="mo-n">${CIRCLED[i] ?? i + 1}</span><b>${esc(TOOL_OP_LABEL[o.op])}</b></div>
          <div class="pv-pics">
            <figure class="pv-pic"><canvas class="pv-sec" aria-label="${i + 1} 段目の、横から見た切り口"></canvas><figcaption>横から見た切り口</figcaption></figure>
            <figure class="pv-pic"><canvas class="pv-face" aria-label="${i + 1} 段目の、上から見た面"></canvas><figcaption>上から見た面</figcaption></figure>
          </div>
          <p class="pv-op">${esc(opWords(o))}</p>
          ${o.step ? `<p class="pv-from">手順 ${o.step}：${says(v.steps[o.step - 1]?.title ?? "", v)}</p>` : ""}
          ${basisOf(v, o.step)}
          ${o.assumed ? `<p class="pv-kari"><span class="kari">仮</span>${says(o.assumed, v)}</p>` : ""}
        </li>`,
        )
        .join("")}</ol>
      <div class="mo-ctrl">
        <button type="button" class="ghost pv-prev" aria-label="前の段">‹</button>
        <span class="mo-count pv-count" aria-live="polite"></span>
        <button type="button" class="primary pv-next">次へ</button>
        <button type="button" class="ghost pv-play">順に見る</button>
      </div>
      <div class="pv-final${prev ? "" : " no-prev"}">
        <figure class="pv-big pv-now"><div class="pv-frame"><canvas class="pv-top" aria-label="出来上がりの、上から見た面"></canvas></div>
          <figcaption><b>${n} 回目の案の手順で</b><span><small class="mo-sim">※ 計算で描いたシミュレーション</small>上から見た面（出来上がりの色）。左右の印は、下の断面を切った所</span></figcaption></figure>
        ${
          prev
            ? `<figure class="pv-big pv-prev"><div class="pv-frame"><canvas class="pv-top-prev" aria-label="前の案の、上から見た面"></canvas></div>
          <figcaption><b>前の案（${p.plans.indexOf(prev) + 1} 回目）の手順で</b><span><small class="mo-sim">※ 計算で描いたシミュレーション</small>同じ計算・同じたねで描いた。ちがいは手順のちがいだけから出る</span></figcaption></figure>`
            : ""
        }
        <figure class="pv-big pv-secbig">
          <div class="pv-secrow"><span class="pv-tag now">この案</span><canvas class="pv-sec-final" aria-label="断面"></canvas></div>
          ${prev ? `<div class="pv-secrow"><span class="pv-tag">前の案</span><canvas class="pv-sec-prev" aria-label="前の案の断面"></canvas></div>` : ""}
          <figcaption><b>断面</b><span>上の面の印の所を、横から切った面。上が表。厚みは大きくして描いた${surface || cast ? "" : "。黄はつながらない所"}</span></figcaption>
        </figure>
      </div>
      ${prev ? `<div class="pv-diff"><b>前の案とのちがい</b>${diffList(prev.pattern!.prediction, pred)}</div>` : ""}
      <div class="pv-notes"></div>`
      }
      ${pred ? `<details class="pv-ops"><summary>Claude の置きかえ（手順 → 計算の操作）</summary><p>${says(pred.reason, v)}</p>${pred.look?.length ? `<p class="pv-sub">値を決める前に言った見込み：</p><ul>${pred.look.map((l) => `<li>${says(l.point, v)}：${says(l.expect, v)}</li>`).join("")}</ul>` : ""}${rec?.notes.length ? `<p class="pv-sub">受け取るときに直したこと：${esc(rec.notes.join(" / "))}</p>` : ""}</details>` : ""}
      <p class="mo-honest">これは形だけの見込みです。金属の本当の流れ・熱・割れは計算しません。「仮」の数は、手順に書かれていないので絵のために決めた値で、作り方の数字ではありません。本当にどうなるかは、小さな切れ端で試して確かめてください。最後に決めるのは職人です。</p>
      ${pred ? `<div class="pv-acts"><button type="button" class="ghost pv-again"${busy ? " disabled" : ""}>この案で、見込みを作り直す</button><p class="pv-st" role="status"></p></div>` : ""}
    </section>`;
    const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s);
    $(".pv-back")!.addEventListener("click", opts.onBack);
    root.querySelectorAll<HTMLButtonElement>(".mo-runs [data-v]").forEach((b) =>
      b.addEventListener("click", () => {
        location.hash = patternHash(p.id, Number(b.dataset.v));
      }),
    );
    for (const sel of [".pv-make", ".pv-again"]) {
      $(sel)?.addEventListener("click", async () => {
        const btn = $<HTMLButtonElement>(sel)!;
        btn.disabled = true;
        btn.textContent = "Claude が考えています…（1 分ほど）";
        const r = await makePattern(p, v.version);
        if (my !== renders || me !== mounted) return;
        if (!r.ok) {
          btn.disabled = false;
          btn.textContent = sel === ".pv-make" ? "この手順で作ると、どんな模様になるか見る" : "この案で、見込みを作り直す";
          $(".pv-st")!.textContent = r.error;
          return;
        }
        p = r.project;
        plan = p.plans.find((x) => x.version === v.version);
        render();
      });
    }
    $(".pv-next")?.addEventListener("click", () => {
      stopTimer();
      go(step + 1);
    });
    $(".pv-prev")?.addEventListener("click", () => {
      stopTimer();
      go(step - 1);
    });
    $(".pv-play")?.addEventListener("click", () => play());
    if (pred?.applicable) {
      const model = modelOf(pred, SEED);
      const prevModel = prev ? modelOf(prev.pattern!.prediction, SEED) : undefined;
      fillNotes(v, pred, model);
      redraw = () => {
        gen++;
        void draw(alive(gen), model, prevModel);
      };
      gen++;
      void draw(alive(gen), model, prevModel);
      play();
    } else redraw = () => undefined;
  }

  function fillNotes(v: RestorePlan, pred: PatternPrediction, model: PatternModel) {
    const notes = root.querySelector(".pv-notes");
    if (!notes) return;
    const kari = pred.ops.filter((o) => o.assumed).length;
    notes.innerHTML = [
      model.notes.length ? `<div><b>計算からの知らせ</b><ul>${model.notes.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>` : "",
      pred.cannot_show ? `<div><b>この絵では表せないこと</b><p>${says(pred.cannot_show, v)}</p></div>` : "",
      `<div><b>${model.family === "layers" ? (model.facts.startsWith("1 つの鋳た塊") ? "塊" : "層の数") : "板と手順"}</b><p>${esc(model.facts)}${kari ? `。「仮」の値が ${kari} か所あります` : ""}</p></div>`,
    ].join("");
  }

  /** 絵を描く：段の絵を順に（見せるより先に）、そのあと出来上がり。重いので、間をあけて */
  async function draw(ok: () => boolean, model: PatternModel, prevModel?: PatternModel) {
    const row = model.row;
    const stages = [...root.querySelectorAll<HTMLElement>(".pv-stage")];
    for (const [i, li] of stages.entries()) {
      const sm = model.stage(i);
      drawSection(li.querySelector<HTMLCanvasElement>(".pv-sec"), sm, row, 0.62);
      await pause();
      if (!ok()) return;
      await drawTop(li.querySelector<HTMLCanvasElement>(".pv-face"), sm, row, ok, "line");
      if (!ok()) return;
    }
    if (!ok()) return;
    drawSection(root.querySelector<HTMLCanvasElement>(".pv-sec-final"), model, row, 0.8);
    if (prevModel) drawSection(root.querySelector<HTMLCanvasElement>(".pv-sec-prev"), prevModel, row, 0.8);
    await pause();
    if (!ok()) return;
    await drawTop(root.querySelector<HTMLCanvasElement>(".pv-top"), model, row, ok, "ticks");
    if (prevModel && ok()) await drawTop(root.querySelector<HTMLCanvasElement>(".pv-top-prev"), prevModel, row, ok, "ticks");
  }

  render();
}

/** 前の案の操作と、この案の操作のちがい（言葉で） */
function diffList(a: PatternPrediction, b: PatternPrediction): string {
  const wa = a.ops.map(opWords);
  const wb = b.ops.map(opWords);
  const gone = wa.filter((w) => !wb.includes(w));
  const added = wb.filter((w) => !wa.includes(w));
  if (!gone.length && !added.length) return `<p>計算の操作は同じです。</p>`;
  return `<ul>${gone.map((w) => `<li class="gone">前の案だけ：${esc(w)}</li>`).join("")}${added.map((w) => `<li class="added">この案で：${esc(w)}</li>`).join("")}</ul>`;
}
