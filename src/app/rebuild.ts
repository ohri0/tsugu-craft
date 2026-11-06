// 答えの分かっている技で試す（#waza/rebuild）：木目金で、Claude がどこまで当てられるかを見る。答えのない技は src/app/restore.ts。
// 途切れた技を、残っている手がかりだけから組み立て直す。答え（本当の作り方）は隠しておき、組み立てたあとで答え合わせをする。
// Claude は学習のときにこの技を読んでいるかもしれないので、工程ごとに「手がかりから」か「もともとの知識から」かを分けて数える。
import { TECHNIQUES, cluesFor, type Clue, type Condition, type Technique } from "../rebuild/material";
import { gradePrompt, gradeUserMessage, hypothesisPrompt, hypothesisUserMessage } from "../rebuild/prompt";
import { plainWords } from "../rebuild/restore";
import { callTool } from "../rebuild/run";
import { scoreLine, tally } from "../rebuild/score";
import { GRADE_PROCESS, PROPOSE_PROCESS, parseGradeProcess, parseProposeProcess, type Verdict } from "../rebuild/tools";
import { filming } from "./confirm";
import { askPassword, resetPassword } from "./password";
import { esc, today } from "./store";

import { PUBLISHED_RUNS } from "../rebuild/published";
import type { Run } from "../rebuild/runs";

const RUN_STORE = "tsugu.rebuildRuns.v1";
function loadRuns(): Run[] {
  try {
    const raw = localStorage.getItem(RUN_STORE);
    const v = raw ? (JSON.parse(raw) as Run[]) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function saveRun(r: Run) {
  const runs = loadRuns().filter((x) => !(x.technique === r.technique && x.condition === r.condition));
  try {
    localStorage.setItem(RUN_STORE, JSON.stringify([...runs, r]));
  } catch {
    // 残せなくても画面は動く
  }
}

/** このブラウザで組み立てたものがあればそれ、なければ公開の記録 */
function findRun(technique: string, condition: string): Run | null {
  return (
    loadRuns().find((r) => r.technique === technique && r.condition === condition) ??
    PUBLISHED_RUNS.find((r) => r.technique === technique && r.condition === condition) ??
    null
  );
}

const VERDICT: Record<Verdict, { label: string; cls: string }> = {
  match: { label: "一致", cls: "ok" },
  partial: { label: "一部", cls: "part" },
  miss: { label: "外れ", cls: "miss" },
};
const dots = (n: number) => "●".repeat(n) + "○".repeat(3 - n);

/** 言語モデルの覚えについての注意（長いので、たたんでおく） */
const CAVEAT = `<details class="caveat"><summary>注意</summary>
  <p>言語モデルは、学習のときにこの技の作り方を読んでいるかもしれません。だから、工程の一つ一つに「どの手がかりから考えたか」を書かせ、手がかりなしで出てきた工程は「もともとの知識から」として分けて数えます。</p>
  <p>Claude に渡すのは手がかりだけです。技の名前と本当の作り方は渡しません。公開の記録は、Claude が実際に組み立てた結果を、手を加えずに載せています。</p>
</details>`;

export function mountRebuild(root: HTMLElement, opts: { onBack?: () => void } = {}): void {
  let tech: Technique | null = null;
  let cond: Condition | null = null;
  let run: Run | null = null;
  let busy = false;

  function list() {
    tech = null;
    // 題材が 1 つなら、そのまま開く
    if (TECHNIQUES.length === 1) return open(TECHNIQUES[0]);
    root.innerHTML = `
    <section class="view rebuild">
      ${opts.onBack ? `<button type="button" class="back">← 技を選ぶ</button>` : ""}
      <header class="view-head">
        <h2>組み立て直す</h2>
        <p class="lead">途切れた技を、残った手がかりだけから組み立て、本当の作り方と比べます。</p>
      </header>
      <ul class="techs">${TECHNIQUES.map(
        (t, i) => `<li><button type="button" class="tech ready" data-i="${i}">
          <span class="tech-mark" aria-hidden="true">？</span>
          <span class="tech-body"><b>${esc(t.hiddenName)}</b><small>${esc(t.summary)}</small></span>
          <span class="tech-meta">手がかり ${cluesFor(t, t.conditions[0]).length}〜${t.clues.length}${PUBLISHED_RUNS.some((r) => r.technique === t.id) ? " ・ 公開の記録あり" : ""}</span>
        </button></li>`,
      ).join("")}</ul>
      ${CAVEAT}
    </section>`;
    root.querySelector(".back")?.addEventListener("click", () => opts.onBack?.());
    root.querySelectorAll<HTMLButtonElement>(".tech.ready").forEach((b) => b.addEventListener("click", () => open(TECHNIQUES[Number(b.dataset.i)])));
  }

  function open(t: Technique) {
    tech = t;
    cond = t.conditions[0];
    run = findRun(t.id, cond!.id);
    render();
  }

  /** 画面に出す番号を名前に（撮影のときは前のまま） */
  const shown = (s: string, clues: Clue[]) => (filming() ? s : plainWords(s, new Map(clues.map((c) => [c.id, c.title] as const))).replace(/入れたこと/g, "手がかり"));

  function clueChip(id: string, clues: Clue[]) {
    const c = clues.find((x) => x.id === id);
    return `<button type="button" class="cid" data-cid="${esc(id)}" title="${esc(c?.title ?? "")}">${esc(filming() ? id : (c?.title ?? id))}</button>`;
  }

  function render() {
    if (!tech || !cond) return list();
    const t = tech;
    const c = cond;
    const clues = cluesFor(t, c);
    const h = run?.hypothesis;
    const g = run?.grade;
    const sum = h && g ? tally(h, g, t.answer) : null;
    // 手がかりの選び方と、渡す手がかりの一覧（組み立てる前は上に、組み立てたあとは結果の下に）
    const cluePart = `
      <section class="tp-block">
      <h3><span class="tp-n">1</span>${h ? "渡した手がかり" : "手がかり"} <small>${clues.length} 個</small></h3>
      <p class="small muted">${h ? "Claude はこれだけを読んで組み立てました。" : "Claude に渡すのは手がかりだけです。技の名前と本当の作り方は渡しません。"}</p>
      <div class="cond" role="radiogroup" aria-label="渡す手がかり">${t.conditions
        .map((x) => `<button type="button" role="radio" aria-checked="${x.id === c.id}" data-c="${x.id}"><b>${esc(x.label)}</b><small>${esc(x.note)}</small></button>`)
        .join("")}</div>

      <details class="clues">
        <summary>手がかり <b>${clues.length}</b><span class="clue-peek">${clues.slice(0, 3).map((x) => (filming() ? `${esc(x.id)} ${esc(x.title)}` : esc(x.title))).join(" ・ ")}${clues.length > 3 ? ` ほか ${clues.length - 3}` : ""}</span></summary>
        <ol class="clue-list">${clues.map((x) => `<li id="clue-${esc(x.id)}">${filming() ? `<b>${esc(x.id)}</b> ` : ""}<span>${esc(x.title)}</span><p>${esc(x.text)}</p></li>`).join("")}</ol>
      </details>
      </section>`;
    // Claude が組み立てる（ボタンは 1 つ。組み立てたあとは答え合わせ）
    const actPart = `
      <section class="tp-block">
      <h3><span class="tp-n">2</span>Claude が組み立てる</h3>
      <div class="actions">
        <button type="button" class="primary go">${h ? "もう一度組み立てる" : `Claude が組み立てる（手がかり ${clues.length}）`}</button>
        ${h && !g ? `<button type="button" class="primary gold check">答え合わせ（答えを開く）</button>` : ""}
        ${h && !run!.published ? `<button type="button" class="ghost export">記録を書き出す</button>` : ""}
      </div>
      <p class="small status">${h ? "" : "組み立てには合言葉が要ります（1〜2 分）。"}</p>
      </section>`;
    root.innerHTML = `
    <section class="view rebuild tp">
      ${opts.onBack || TECHNIQUES.length > 1 ? `<button type="button" class="back">← ${TECHNIQUES.length > 1 ? "一覧へ" : "技を選ぶ"}</button>` : ""}
      <header class="tp-head">
        <span class="bt-mark" aria-hidden="true">？</span>
        <div class="tp-hb">
          ${
            // 撮影のときは前の名前のまま（動画の絵を変えない）
            filming()
              ? `<h2>組み立て直す（${esc(t.name)}）</h2>
          <p class="lead">作り方の残っていない技を、残った手がかりだけから Claude が組み立て、本当の作り方と比べます。</p>`
              : `<h2>答えの分かっている技で試す（${esc(t.name)}）</h2>
          <p class="lead">残った手がかりだけから Claude が組み立て、本当の作り方と比べます。</p>`
          }
        </div>
      </header>
      ${
        filming()
          ? ""
          : `<a class="rs-cross" href="#waza/restore"><span>自分の途切れた技を入れる</span><span aria-hidden="true">›</span></a>`
      }

      ${cluePart}${actPart}

      ${
        h
          ? `<section class="tp-block">
        <h3><span class="tp-n">3</span>${g ? "答え合わせの結果" : "組み立てた作り方"} <small>${esc(run!.date)}${run!.published ? " ・ 公開の記録" : ""}</small></h3>
        ${sum ? `<div class="score"><b>${sum.covered}<small>/${sum.answerSteps}</small></b><p>${esc(filming() ? scoreLine(sum) : scoreLine(sum).replace(/工程/g, "手順"))}</p></div>` : ""}
        <ol class="steps-h tp-check">${h.steps
          .map((s, i) => {
            const gs = g?.steps.find((x) => x.n === i + 1);
            const v = gs ? VERDICT[gs.verdict] : null;
            return `<li class="${s.basis === "prior" ? "prior" : ""}">
              <span class="n">${i + 1}</span>
              <div class="sbody">
                <p class="stitle">${esc(shown(s.title, clues))}${v ? `<span class="verdict ${v.cls}">${v.label}</span>` : ""}</p>
                <p class="sdetail">${esc(shown(s.detail, clues))}</p>
                <p class="smeta">${s.basis === "prior" ? `<span class="tag warn">手がかりなし ・ もともとの知識から</span>` : `根拠 ${s.clue_ids.map((id) => clueChip(id, clues)).join("")}`}<span class="conf" title="確からしさ">確からしさ ${dots(s.confidence)}</span></p>
                ${s.uncertain ? `<p class="sunsure">まだ分からない：${esc(shown(s.uncertain, clues))}</p>` : ""}
                ${gs?.note ? `<p class="gnote">${filming() && gs.answer_ids.length ? `<b>${gs.answer_ids.map(esc).join("・")}</b> ` : ""}${esc(filming() ? gs.note : gs.note.replace(/\b[AMH]\d+\b/g, "本当の手順").replace(/工程/g, "手順"))}</p>` : ""}
              </div>
            </li>`;
          })
          .join("")}</ol>
        ${h.summary ? `<p class="hsum">${esc(shown(h.summary, clues))}</p>` : ""}
        ${
          h.trials.length
            ? `<div class="trials"><h4>次に職人に試してほしいこと</h4><ul>${h.trials.map((x) => `<li><b>${esc(shown(x.what, clues))}</b><span>${esc(shown(x.why, clues))}</span></li>`).join("")}</ul></div>`
            : ""
        }
        ${
          g
            ? `${g.missed.length ? `<div class="missed"><h4>${filming() ? "たどり着けなかった本当の工程" : "たどり着けなかった本当の手順"}</h4><ul>${g.missed.map((m) => `<li><b>${filming() ? `${esc(m.answer_id)} ` : ""}${esc(t.answer.find((a) => a.id === m.answer_id)?.title ?? "")}</b><span>${esc(m.note)}</span></li>`).join("")}</ul></div>` : ""}
               ${g.summary ? `<p class="hsum">${esc(filming() ? g.summary : g.summary.replace(/\b[AMH]\d+\b/g, "本当の手順").replace(/工程/g, "手順"))}</p>` : ""}`
            : ""
        }
      </section>`
          : ""
      }

      ${
        t.id === "mokume"
          ? `<a class="mo-link" href="#waza/rebuild/moyou"><span class="mo-link-t"><b>模様の試し</b><small>本当の手順と Claude の手順で作ったら、どんな模様になるか。計算で描いた目安の絵で比べます。</small></span><span aria-hidden="true">›</span></a>`
          : ""
      }


      ${CAVEAT}
    </section>`;

    const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s);
    $(".back")?.addEventListener("click", () => (TECHNIQUES.length > 1 ? list() : opts.onBack?.()));
    root.querySelectorAll<HTMLButtonElement>(".cond [data-c]").forEach((b) =>
      b.addEventListener("click", () => {
        cond = t.conditions.find((x) => x.id === b.dataset.c)!;
        run = findRun(t.id, cond!.id);
        render();
      }),
    );
    root.querySelectorAll<HTMLButtonElement>(".cid").forEach((b) =>
      b.addEventListener("click", () => {
        $<HTMLDetailsElement>(".clues")!.open = true;
        const li = root.querySelector<HTMLElement>(`#clue-${CSS.escape(b.dataset.cid!)}`);
        li?.scrollIntoView({ behavior: "smooth", block: "center" });
        li?.classList.add("flash");
        setTimeout(() => li?.classList.remove("flash"), 1600);
      }),
    );
    $(".go")!.addEventListener("click", () => void build());
    $(".check")?.addEventListener("click", () => void check());
    $(".export")?.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(run, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `組み立て直し_${t.id}_${c.id}_${run!.date}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }

  function working(msg: string) {
    const st = root.querySelector<HTMLElement>(".status");
    if (st) st.innerHTML = `<span class="thinking inline"><span></span><span></span><span></span></span> ${esc(msg)}`;
    root.querySelectorAll<HTMLButtonElement>(".actions button").forEach((b) => (b.disabled = true));
  }
  function done(msg: string) {
    const st = root.querySelector<HTMLElement>(".status");
    if (st) st.textContent = msg;
    root.querySelectorAll<HTMLButtonElement>(".actions button").forEach((b) => (b.disabled = false));
  }

  async function password(): Promise<string> {
    return localStorage.getItem("tsugu.password.v1") || (await askPassword(true));
  }

  async function build() {
    if (!tech || !cond || busy) return;
    const t = tech;
    const c = cond;
    const pass = await password();
    if (!pass) return done("組み立てには Claude が要ります。合言葉を入れてください。");
    busy = true;
    working("Claude が手がかりを読んで、作り方を組み立てています（1〜2 分かかります）…");
    const clues = cluesFor(t, c);
    const r = await callTool({ system: hypothesisPrompt(t, c), user: hypothesisUserMessage(t, c), tool: PROPOSE_PROCESS, parse: (x) => parseProposeProcess(x, clues), password: pass });
    busy = false;
    if (!r.ok) {
      if (r.code === "wrong_password") resetPassword();
      return done(r.error);
    }
    run = { technique: t.id, condition: c.id, date: today(), hypothesis: r.value };
    saveRun(run);
    render();
    done(`組み立てました。${r.remaining !== undefined ? `今日あと ${r.remaining} 回。` : ""}次は「答え合わせ」で、本当の作り方と比べます。`);
  }

  async function check() {
    if (!tech || !run || busy) return;
    const t = tech;
    const h = run.hypothesis;
    const pass = await password();
    if (!pass) return done("答え合わせには Claude が要ります。合言葉を入れてください。");
    busy = true;
    working("本当の作り方を開いて、工程ごとに比べています…");
    const r = await callTool({ system: gradePrompt(t, h), user: gradeUserMessage(), tool: GRADE_PROCESS, parse: (x) => parseGradeProcess(x, h, t.answer), password: pass });
    busy = false;
    if (!r.ok) {
      if (r.code === "wrong_password") resetPassword();
      return done(r.error);
    }
    run = { ...run, grade: r.value };
    saveRun(run);
    render();
    root.querySelector(".score")?.scrollIntoView({ behavior: "smooth", block: "center" });
    done(r.remaining !== undefined ? `今日あと ${r.remaining} 回` : "");
  }

  list();
}
