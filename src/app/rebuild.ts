// 組み立て直す：途切れた技を、残っている手がかりだけから組み立て直す。
// 答え（本当の作り方）は隠しておき、組み立てたあとで答え合わせをする。
// Claude は学習のときにこの技を読んでいるかもしれないので、工程ごとに「手がかりから」か「もともとの知識から」かを分けて数える。
import { TECHNIQUES, cluesFor, type Clue, type Condition, type Technique } from "../rebuild/material";
import { gradePrompt, gradeUserMessage, hypothesisPrompt, hypothesisUserMessage } from "../rebuild/prompt";
import { callTool } from "../rebuild/run";
import { scoreLine, tally } from "../rebuild/score";
import { GRADE_PROCESS, PROPOSE_PROCESS, parseGradeProcess, parseProposeProcess, type Grade, type Hypothesis, type Verdict } from "../rebuild/tools";
import { askPassword, resetPassword } from "./password";
import { mountSim } from "./sim-view";
import { esc, today } from "./store";

/** 1 回の試し（このブラウザに残し、書き出せる） */
interface Run {
  technique: string;
  condition: Condition["id"];
  date: string;
  hypothesis: Hypothesis;
  grade?: Grade;
}

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

const VERDICT: Record<Verdict, { label: string; cls: string }> = {
  match: { label: "一致", cls: "ok" },
  partial: { label: "一部", cls: "part" },
  miss: { label: "外れ", cls: "miss" },
};
const dots = (n: number) => "●".repeat(n) + "○".repeat(3 - n);

export function mountRebuild(root: HTMLElement): void {
  let tech: Technique | null = null;
  let cond: Condition | null = null;
  let run: Run | null = null;
  let busy = false;

  function list() {
    tech = null;
    root.innerHTML = `
    <section class="view rebuild">
      <header class="view-head">
        <p class="eyebrow">途切れた技</p>
        <h2>組み立て直す</h2>
        <p class="lead">作り方が残っていない技を、残っている品物や材料の手がかりだけから組み立て直します。本当の作り方は隠しておき、最後に答え合わせをします。</p>
      </header>
      <ul class="techs">${TECHNIQUES.map(
        (t, i) => `<li><button type="button" class="tech ${t.status}" data-i="${i}" ${t.status === "soon" ? "disabled" : ""}>
          <span class="tech-mark" aria-hidden="true">${t.status === "ready" ? "？" : esc(t.name.slice(0, 1))}</span>
          <span class="tech-body"><b>${esc(t.status === "ready" ? t.hiddenName : t.name)}</b><small>${esc(t.summary)}</small></span>
          <span class="tech-meta">${t.status === "ready" ? `手がかり ${t.clues.length}` : "準備中"}</span>
        </button></li>`,
      ).join("")}</ul>
      <p class="honest">言語モデルは、学習のときにその技の作り方を読んでいるかもしれません。だから、工程の一つ一つに「どの手がかりから考えたか」を書かせ、手がかりなしで出てきた工程は「もともとの知識から」として分けて数えます。</p>
    </section>`;
    root.querySelectorAll<HTMLButtonElement>(".tech.ready").forEach((b) => b.addEventListener("click", () => open(TECHNIQUES[Number(b.dataset.i)])));
  }

  function open(t: Technique) {
    tech = t;
    cond = t.conditions[0];
    run = loadRuns().find((r) => r.technique === t.id && r.condition === cond!.id) ?? null;
    render();
  }

  function clueChip(id: string, clues: Clue[]) {
    const c = clues.find((x) => x.id === id);
    return `<button type="button" class="cid" data-cid="${esc(id)}" title="${esc(c?.title ?? "")}">${esc(id)}</button>`;
  }

  function render() {
    if (!tech || !cond) return list();
    const t = tech;
    const c = cond;
    const clues = cluesFor(t, c);
    const h = run?.hypothesis;
    const g = run?.grade;
    const sum = h && g ? tally(h, g, t.answer) : null;
    const revealed = !!g;
    root.innerHTML = `
    <section class="view rebuild">
      <button type="button" class="back ghost">← 一覧へ</button>
      <header class="view-head">
        <p class="eyebrow">${revealed ? "答え合わせ" : "名前を隠した技"}</p>
        <h2>${revealed ? `${esc(t.name)}<small>（${esc(t.reading)}）</small>` : esc(t.hiddenName)}</h2>
        <p class="lead">${esc(t.summary)}</p>
      </header>

      <div class="cond" role="radiogroup" aria-label="渡す手がかり">${t.conditions
        .map((x) => `<button type="button" role="radio" aria-checked="${x.id === c.id}" data-c="${x.id}"><b>${esc(x.label)}</b><small>${esc(x.note)}</small></button>`)
        .join("")}</div>

      <details class="clues">
        <summary>渡す手がかり <b>${clues.length}</b><span class="clue-peek">${clues.slice(0, 3).map((x) => `${esc(x.id)} ${esc(x.title)}`).join(" ・ ")}${clues.length > 3 ? ` ほか ${clues.length - 3}` : ""}</span></summary>
        <ol class="clue-list">${clues.map((x) => `<li id="clue-${esc(x.id)}"><b>${esc(x.id)}</b> <span>${esc(x.title)}</span><p>${esc(x.text)}</p></li>`).join("")}</ol>
      </details>

      ${
        h
          ? `<div class="block">
        <h3>組み立てた作り方 <small>${esc(run!.date)}</small></h3>
        ${sum ? `<div class="score"><b>${sum.covered}<small>/${sum.answerSteps}</small></b><p>${esc(scoreLine(sum))}</p></div>` : ""}
        <ol class="steps-h">${h.steps
          .map((s, i) => {
            const gs = g?.steps.find((x) => x.n === i + 1);
            const v = gs ? VERDICT[gs.verdict] : null;
            return `<li class="${s.basis === "prior" ? "prior" : ""}">
              <span class="n">${i + 1}</span>
              <div class="sbody">
                <p class="stitle">${esc(s.title)}${v ? `<span class="verdict ${v.cls}">${v.label}</span>` : ""}</p>
                <p class="sdetail">${esc(s.detail)}</p>
                <p class="smeta">${s.basis === "prior" ? `<span class="tag warn">手がかりなし ・ もともとの知識から</span>` : `根拠 ${s.clue_ids.map((id) => clueChip(id, clues)).join("")}`}<span class="conf" title="確からしさ">確からしさ ${dots(s.confidence)}</span></p>
                ${s.uncertain ? `<p class="sunsure">まだ分からない：${esc(s.uncertain)}</p>` : ""}
                ${gs?.note ? `<p class="gnote">${gs.answer_ids.length ? `<b>${gs.answer_ids.map(esc).join("・")}</b> ` : ""}${esc(gs.note)}</p>` : ""}
              </div>
            </li>`;
          })
          .join("")}</ol>
        ${h.summary ? `<p class="hsum">${esc(h.summary)}</p>` : ""}
        ${
          h.trials.length
            ? `<div class="trials"><h4>次に職人に試してほしいこと</h4><ul>${h.trials.map((x) => `<li><b>${esc(x.what)}</b><span>${esc(x.why)}</span></li>`).join("")}</ul></div>`
            : ""
        }
        ${
          g
            ? `${g.missed.length ? `<div class="missed"><h4>たどり着けなかった本当の工程</h4><ul>${g.missed.map((m) => `<li><b>${esc(m.answer_id)} ${esc(t.answer.find((a) => a.id === m.answer_id)?.title ?? "")}</b><span>${esc(m.note)}</span></li>`).join("")}</ul></div>` : ""}
               ${g.summary ? `<p class="hsum">${esc(g.summary)}</p>` : ""}`
            : ""
        }
      </div>`
          : `<div class="block empty-run"><p>まだ組み立てていません。手がかり ${clues.length} 個だけを Claude に渡して、作り方を組み立てます。技の名前と本当の作り方は渡しません。</p></div>`
      }

      ${h && t.id === "mokume" ? `<div class="block sim-slot"></div>` : ""}

      <div class="actions">
        <button type="button" class="primary go">${h ? "もう一度組み立てる" : "組み立てる"}</button>
        ${h && !g ? `<button type="button" class="primary gold check">答え合わせ（答えを開く）</button>` : ""}
        ${h ? `<button type="button" class="ghost export">記録を書き出す</button>` : ""}
      </div>
      <p class="small status"></p>
    </section>`;

    const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s);
    const slot = $(".sim-slot");
    if (slot) mountSim(slot);
    $(".back")!.addEventListener("click", list);
    root.querySelectorAll<HTMLButtonElement>(".cond [data-c]").forEach((b) =>
      b.addEventListener("click", () => {
        cond = t.conditions.find((x) => x.id === b.dataset.c)!;
        run = loadRuns().find((r) => r.technique === t.id && r.condition === cond!.id) ?? null;
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
    return localStorage.getItem("tsugu.password.v1") || (await askPassword());
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
