// 模様の見込み（#waza/restore/<記録の id>/moyou/<案の番号>）：途切れた技の案の手順のとおりに作ると、どんな模様になるか。
// 手順は、入れたことと職人の帳面から Claude が推し量った案。それを Claude が計算の操作に置きかえ（predict_pattern。src/rebuild/pattern-tools.ts）、
// 計算（src/rebuild/pattern-sim.ts）が、重ねた層がどう動くかを形だけで描く。金属の本当の流れや熱は計算しない。
// 見た目は、木目金の模様の試し（src/app/moyou-view.ts）にそろえる：段が 1 つずつ現れ（① 重ねる → … → 色を出す）、最後に表と断面。前の案の見込みがあれば並べる。
// 重ねた層の模様の技でなければ、Claude はそう答え、絵は描かない。
import "./moyou.css";
import "./pattern.css";
import { bondOf, buildSim, sectionImage, sectionRow, surfaceImage, surfaceImageAsync, type Rgba } from "../rebuild/pattern-sim";
import { opWords, parsePattern, patternPrompt, patternRequest, PREDICT_PATTERN, toPatternOps, TOOL_OP_LABEL, type PatternPrediction, type PatternRecord } from "../rebuild/pattern-tools";
import { namesOf, plainWords, setPattern, withoutMark, type RestorePlan, type RestoreProject } from "../rebuild/restore";
import { callTool, type CallToolResult } from "../rebuild/run";
import { askPassword, resetPassword } from "./password";
import { saveProject } from "./restore-store";
import { esc, store, today } from "./store";

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
/** 絵のたね（同じ技なら、案が変わっても同じ所に穴があく。ちがいが手順のちがいだけから出るように） */
const SEED = 7;

/** 頼んでいる最中の案（記録の id:案の番号） */
const inFlight = new Set<string>();

export const patternHash = (projectId: string, version: number) => `#waza/restore/${projectId}/moyou/${version}`;

/** Claude に、案の手順を模様の操作に置きかえてもらう */
export function predictFor(p: RestoreProject, plan: RestorePlan, password: string): Promise<CallToolResult<PatternPrediction>> {
  const names = namesOf(p, plan);
  return callTool({
    system: patternPrompt(),
    user: patternRequest(p.name, plan, (s) => plainWords(s, names)),
    tool: PREDICT_PATTERN,
    parse: (x) => parsePattern(x, { steps: plan.steps.length }),
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
  const record: PatternRecord = { date: today(), prediction: r.value, notes: r.warnings ?? [] };
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

/** 案の欄に出す小さな絵（すぐ描ける大きさ） */
export function drawThumb(c: HTMLCanvasElement, pred: PatternPrediction) {
  if (!pred.applicable) return;
  putImage(c, surfaceImage(buildSim(toPatternOps(pred), SEED), 96, 1));
}

const pause = () => new Promise<void>((r) => setTimeout(r, 0));

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
  let timers: number[] = [];
  const stopTimers = () => {
    timers.forEach((t) => clearTimeout(t));
    timers = [];
  };
  const cleanup = () => {
    gen++;
    stopTimers();
    window.removeEventListener("hashchange", onHash);
  };
  const onHash = () => {
    if (/\/moyou/.test(location.hash)) return;
    cleanup();
    html.classList.remove("mo-page");
  };
  cleanupPrev = cleanup;
  window.addEventListener("hashchange", onHash);

  const unmark = (s: string) => (p.sample ? withoutMark(s) : s);
  const says = (s: string, v: RestorePlan) => esc(plainWords(unmark(s), namesOf(p, v)));

  function basisOf(v: RestorePlan, step: number): string {
    const s = v.steps[step - 1];
    if (!s) return `<p class="pv-basis is-added">案にない操作（絵を描くために Claude が足した）</p>`;
    if (s.basis === "prior") return `<p class="pv-basis is-prior">もとにしたもの：Claude がもともと知っていること</p>`;
    const book = (s.book_ids ?? []).map((b) => v.book.find((x) => x.id === b)?.title).filter(Boolean);
    return `${book.length ? `<p class="pv-basis is-book"><span class="rs-pill book">職人の帳面から</span>${esc(book.join("・"))}</p>` : ""}${s.clue_ids.length ? `<p class="pv-basis">もとにしたもの：入れたこと（${esc(s.clue_ids.map((id) => unmark(namesOf(p).get(id) ?? "入れたこと")).join("・"))}）</p>` : ""}`;
  }

  function render() {
    gen++;
    stopTimers();
    const my = gen;
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
    root.innerHTML = `
    <section class="view moyou pv">
      <button type="button" class="rs-back pv-back">← 案にもどる</button>
      <header class="mo-head">
        <p class="mo-eyebrow">模様の見込み ・ 形だけの計算（仮）${p.sample ? `<span class="rs-example pv-example">これは作り話の例です</span>` : ""}</p>
        <h2>「${esc(p.name)}」を、${n} 回目の案の手順で作ると</h2>
        <p class="mo-lead">手順は、入れたこと${v.bookOn ? "と職人の帳面" : ""}から Claude が推し量った案です。Claude がその手順を計算の操作に置きかえ、重ねた層がどう動くかを形だけで描きました。<b>金属の本当の流れや熱は計算しません。数はどれも絵のための仮の値です。最後に決めるのは職人です。</b></p>
        ${tabs.length > 1 ? `<div class="mo-runs" role="radiogroup" aria-label="どの案の見込みか">${tabs.map((x) => `<button type="button" role="radio" aria-checked="${x === v}" data-v="${x.version}">${p.plans.indexOf(x) + 1} 回目の案</button>`).join("")}</div>` : ""}
      </header>
      ${
        !pred
          ? `<div class="pv-none"><p>この案の手順では、まだ模様の見込みを作っていません。</p>
             <button type="button" class="primary rs-big pv-make"${busy ? " disabled" : ""}>${busy ? "Claude が考えています…" : "この手順で作ると、どんな模様になるか見る"}</button>
             <p class="pv-st" role="status"></p></div>`
          : !pred.applicable
            ? `<div class="pv-decline">
                <p class="pv-decline-h">この技は、重ねた層の模様の技ではなさそうです。だから絵は描きません。</p>
                <p>Claude の答え：${says(pred.reason, v)}</p>
                ${pred.cannot_show ? `<p class="pv-sub">この計算で表せないこと：${says(pred.cannot_show, v)}</p>` : ""}
                <p class="pv-sub">この計算は、色のちがう材料を重ねて模様を出す技だけを描きます。合わない技を、無理に模様にはしません。</p>
              </div>`
            : `
      <p class="pv-sum">${says(pred.summary, v)}</p>
      <ol class="pv-stages">${pred.ops
        .map(
          (o, i) => `<li class="pv-stage" data-i="${i}">
          <div class="mo-sh"><span class="mo-n">${CIRCLED[i] ?? i + 1}</span><b>${TOOL_OP_LABEL[o.op]}</b></div>
          <canvas class="pv-sec" aria-label="${i + 1} 段目の断面"></canvas>
          <p class="pv-op">${esc(opWords(o))}</p>
          ${o.step ? `<p class="pv-from">手順 ${o.step}：${says(v.steps[o.step - 1]?.title ?? "", v)}</p>` : ""}
          ${basisOf(v, o.step)}
          ${o.assumed ? `<p class="pv-kari"><span class="kari">仮</span>${says(o.assumed, v)}</p>` : ""}
        </li>`,
        )
        .join("")}</ol>
      <div class="mo-ctrl"><button type="button" class="ghost pv-replay">はじめから見る</button><span class="mo-count pv-count"></span></div>
      <div class="pv-final${prev ? "" : " no-prev"}">
        <figure class="mo-big pv-big"><canvas class="pv-top" aria-label="上から見た面"></canvas>
          <figcaption><b>${n} 回目の案の手順で</b><span>上から見た面（最後の色）</span></figcaption></figure>
        ${
          prev
            ? `<figure class="mo-big pv-big pv-prev"><canvas class="pv-top-prev" aria-label="前の案の、上から見た面"></canvas>
          <figcaption><b>前の案（${p.plans.indexOf(prev) + 1} 回目）の手順で</b><span>同じ計算・同じ穴の並びで描いた</span></figcaption></figure>`
            : ""
        }
        <figure class="mo-big pv-big pv-secbig"><canvas class="pv-sec-final" aria-label="断面"></canvas>
          <figcaption><b>断面</b><span>見る所の真ん中を、横から切った面。上が表。黄はつながらない所</span></figcaption>
          ${prev ? `<canvas class="pv-sec-prev" aria-label="前の案の断面"></canvas><figcaption><span>前の案の断面</span></figcaption>` : ""}
        </figure>
      </div>
      ${prev ? `<div class="pv-diff"><b>前の案とのちがい</b>${diffList(prev.pattern!.prediction, pred)}</div>` : ""}
      <div class="pv-notes"></div>`
      }
      ${pred ? `<details class="pv-ops"><summary>Claude の置きかえ（手順 → 計算の操作）</summary><p>${says(pred.reason, v)}</p>${rec?.notes.length ? `<p class="pv-sub">受け取るときに直したこと：${esc(rec.notes.join(" / "))}</p>` : ""}</details>` : ""}
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
        if (my !== gen || me !== mounted) return;
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
    if (pred?.applicable) void draw(my, v, pred, prev?.pattern?.prediction);
  }

  async function draw(my: number, v: RestorePlan, pred: PatternPrediction, prevPred?: PatternPrediction) {
    const ops = toPatternOps(pred);
    const stages = [...root.querySelectorAll<HTMLElement>(".pv-stage")];
    const count = root.querySelector(".pv-count")!;
    const sim = buildSim(ops, SEED);
    // 断面は、出来上がりの模様をいちばん多く横切る所で切る（段の絵も同じ所）
    const row = sectionRow(sim);
    const bond = bondOf(ops);
    // 段の絵（その段までの操作で、断面）
    for (const [i, li] of stages.entries()) {
      putImage(li.querySelector("canvas")!, sectionImage(buildSim(ops.slice(0, i + 1), SEED, { bond }), 300, 125, row));
      await pause();
      if ((my !== gen || me !== mounted)) return;
    }
    putImage(root.querySelector<HTMLCanvasElement>(".pv-sec-final")!, sectionImage(sim, 560, 150, row));
    const notes = root.querySelector(".pv-notes")!;
    const kari = pred.ops.filter((o) => o.assumed).length;
    notes.innerHTML = [
      sim.notes.length ? `<div><b>計算からの知らせ</b><ul>${sim.notes.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>` : "",
      pred.cannot_show ? `<div><b>この絵では表せないこと</b><p>${says(pred.cannot_show, v)}</p></div>` : "",
      `<div><b>層の数</b><p>はじめ ${sim.count} 枚 → 最後 ${sim.layersFinal} 層（仮）${kari ? `。「仮」の値が ${kari} か所あります` : ""}</p></div>`,
    ].join("");
    const top = await surfaceImageAsync(sim, 320, 2, pause, () => (my !== gen || me !== mounted));
    if (!top) return;
    putImage(root.querySelector<HTMLCanvasElement>(".pv-top")!, top);
    if (prevPred) {
      const ps = buildSim(toPatternOps(prevPred), SEED);
      putImage(root.querySelector<HTMLCanvasElement>(".pv-sec-prev")!, sectionImage(ps, 560, 150, row));
      const pt = await surfaceImageAsync(ps, 320, 2, pause, () => (my !== gen || me !== mounted));
      if (!pt) return;
      putImage(root.querySelector<HTMLCanvasElement>(".pv-top-prev")!, pt);
    }
    play(stages, count);
  }

  /** 段を 1 つずつ見せる */
  function play(stages: HTMLElement[], count: Element) {
    stopTimers();
    const view = root.querySelector(".pv")!;
    view.classList.remove("on-final");
    stages.forEach((s) => s.classList.remove("on"));
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const step = reduce ? 0 : 650;
    stages.forEach((s, i) =>
      timers.push(
        window.setTimeout(() => {
          s.classList.add("on");
          count.textContent = `${i + 1} / ${stages.length} 段`;
        }, step * i),
      ),
    );
    timers.push(
      window.setTimeout(() => {
        view.classList.add("on-final");
        count.textContent = "出来上がり";
      }, step * stages.length),
    );
    root.querySelector(".pv-replay")?.addEventListener("click", () => play(stages, count), { once: true });
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
