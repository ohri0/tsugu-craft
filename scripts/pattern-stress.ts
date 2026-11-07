// くせのある架空の技（scripts/pattern-stress-cases.ts）を、途切れた技の流れのとおりに本物の Claude で通し、弱い所を見つける。
// 流れは scripts/pattern-demo.ts と同じ：手がかり → 案 1 → 見込み 1 → 架空の試した結果 → 見込み 1 を作り直す → 案 2 → 見込み 2 → 絵。
// それに、見張りを足した：1 回ごとの待ち時間（90 秒をこえたら遅い）、道具の入力を断った回数（断った理由）、受け取るときに直したこと、
// 手がかりにない数字（案の工程）、仮の値に「仮」の説明が無い操作、絵がのっぺり（ほぼ 1 色）か、断るべき技を断ったか。
// Claude は、画面と同じ api/claude.ts の関数を通して呼ぶ（キーは .env から。表に出さない）。
// 使い方：npx tsx scripts/pattern-stress.ts <.env のある所> [技の id ...]
//         npx tsx scripts/pattern-stress.ts --render   （Claude を呼ばず、残した見込みから絵だけ描き直す）
// 出すもの：docs/pattern-demo/stress/<id>[-first|-v2]-top.png・-section.png、stress/cases/<id>.json（記録のファイル）・.replies.json・.predictions.json・.log.md・.check.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { encodePng } from "./png";
import { STRESS_CASES, type StressCase } from "./pattern-stress-cases";
import repoLedger from "../ledger/jewelry.json";
import type { Ledger } from "../src/rules/ledger";
import { seedTechLedger, TECH_IDS, TECHS } from "../src/rules/techniques";
import { bookText, readBook } from "../src/rebuild/book";
import { modelOf, topImage } from "../src/rebuild/pattern-model";
import { opWords, parsePattern, patternContext, type PatternPrediction, patternPrompt, patternRequest, PREDICT_PATTERN } from "../src/rebuild/pattern-tools";
import { addClue, applyPlan, clueRefs, knownClueIds, namesOf, newProject, plainWords, setPattern, setResult, sourceText, toFile, type RestoreProject } from "../src/rebuild/restore";
import { restoreContent, restorePrompt } from "../src/rebuild/restore-prompt";
import { parseRestoration, PROPOSE_RESTORATION } from "../src/rebuild/restore-tools";
import { callTool } from "../src/rebuild/run";
import type { Rgba } from "../src/rebuild/pattern-sim";

const DAY = "2026-11-07";
const OUT = "docs/pattern-demo/stress";
/** これより長く待ったら「遅い」 */
const SLOW_MS = 90_000;

function loadEnv(path: string) {
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  if (!process.env.DEMO_PASSWORD) process.env.DEMO_PASSWORD = "dev-local";
}

const book = readBook([
  { craft: "指輪の石留め", ledger: repoLedger as unknown as Ledger },
  ...TECH_IDS.map((id) => ({ craft: TECHS[id].name, ledger: seedTechLedger(id) })),
]).rules;

/** 絵の明るさのばらつき（0〜255）。小さいと、のっぺりした 1 色の絵 */
function spread(img: Rgba): number {
  let s = 0;
  let s2 = 0;
  let n = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue;
    const l = 0.3 * img.data[i] + 0.59 * img.data[i + 1] + 0.11 * img.data[i + 2];
    s += l;
    s2 += l * l;
    n++;
  }
  if (!n) return 0;
  const m = s / n;
  return Math.sqrt(Math.max(0, s2 / n - m * m));
}

async function render(id: string, tag: string, pred: PatternPrediction): Promise<{ notes: string[]; spread: number; ms: number }> {
  const t0 = Date.now();
  const m = modelOf(pred, 7);
  const top = await topImage(m, 400, 2);
  writeFileSync(`${OUT}/${id}${tag}-top.png`, encodePng(top.w, top.h, top.data));
  const sec = m.section(640, 140, m.row, 2);
  writeFileSync(`${OUT}/${id}${tag}-section.png`, encodePng(sec.w, sec.h, sec.data));
  return { notes: m.notes, spread: Math.round(spread(top) * 10) / 10, ms: Date.now() - t0 };
}

interface Check {
  id: string;
  calls: { tool: string; ms: number; rejected: string[]; warnings: string[] }[];
  predictions: { tag: string; applicable: boolean; ops: string[]; noAssumed: string[]; spread?: number; renderMs?: number; notes?: string[] }[];
  unsourced: string[];
  planNotes: string[];
  expect: StressCase["expect"];
  error?: string;
}

/** 数を持つ操作で、仮の値の説明（assumed）が無いもの */
function missingAssumed(pred: PatternPrediction): string[] {
  return pred.ops.filter((o) => o.step === 0 || ((o.amount || o.size || o.across) && !o.assumed)).filter((o) => !o.assumed).map((o) => `${o.op}（工程 ${o.step}）`);
}

async function run(c: StressCase): Promise<Check> {
  const { handle } = await import("../api/claude");
  const replies: { tool: string; response: unknown }[] = [];
  const check: Check = { id: c.id, calls: [], predictions: [], unsourced: [], planNotes: [], expect: c.expect };
  const fetchShim: typeof fetch = async (_url, init) => {
    const res = await handle(new Request("http://localhost/api/claude", init as RequestInit));
    const body = await res.json();
    const tool = (JSON.parse(String(init?.body)) as { tools: { name: string }[] }).tools[0].name;
    replies.push({ tool, response: { status: res.status, body } });
    return new Response(JSON.stringify(body), { status: res.status, headers: res.headers });
  };
  const password = process.env.DEMO_PASSWORD!;
  let p: RestoreProject = { ...newProject(`stress-${c.id}`, c.name, DAY), sample: true };
  for (const clue of c.clues) {
    const r = addClue(p, clue, DAY);
    if ("error" in r) throw new Error(r.error);
    p = r.project;
  }
  const log: string[] = [`# ${c.name}（${c.id}）`, `入れ方：${c.style}　正しい答え：${c.expect === "decline" ? "描かない" : c.expect === "partial" ? "描ける所だけ描き、残りを言う" : "描く"}`];
  const predictions: { version: number; tag: string; prediction: PatternPrediction }[] = [];

  async function timed<T>(tool: string, f: (rejected: string[]) => Promise<T & { warnings?: string[] }>): Promise<T> {
    const rejected: string[] = [];
    const t0 = Date.now();
    const r = await f(rejected);
    const ms = Date.now() - t0;
    check.calls.push({ tool, ms, rejected, warnings: r.warnings ?? [] });
    log.push(`（${tool}：${Math.round(ms / 1000)} 秒${ms > SLOW_MS ? "・遅い" : ""}${rejected.length ? `・断った ${rejected.length} 回：${rejected.join(" / ")}` : ""}）`);
    return r;
  }

  async function plan() {
    const prev = p.plans.at(-1);
    const r = await timed("propose_restoration", (rejected) =>
      callTool({
        system: restorePrompt({ book: true }),
        user: restoreContent(p, [], book),
        tool: PROPOSE_RESTORATION,
        parse: (x) => {
          const out = parseRestoration(x, { ids: knownClueIds(p), bookIds: book.map((b) => b.id), prev });
          if (!out.ok) rejected.push(out.error);
          return out;
        },
        password,
        fetch: fetchShim,
      }),
    );
    if (!r.ok) throw new Error(`${c.id} 案：${r.error}`);
    p = applyPlan(p, r.value, { date: DAY, sent: clueRefs(p), photosSent: [], bookOn: true, book: book.map((b) => ({ id: b.id, title: b.title })), sources: `${sourceText(p)}\n${bookText(book)}`, warnings: r.warnings });
    const v = p.plans.at(-1)!;
    log.push(`\n## 案 ${v.version}\n${v.summary}`);
    if (v.changes) log.push(`前からの違い：${v.changes}`);
    v.steps.forEach((s, i) => {
      log.push(`${i + 1}. ${s.title}${s.basis === "prior" ? "［もともとの知識］" : ""}${s.unsourced?.length ? `［手がかりにない数字：${s.unsourced.join("・")}］` : ""}\n   ${s.detail}${s.uncertain ? `\n   分からない：${s.uncertain}` : ""}`);
      for (const u of s.unsourced ?? []) check.unsourced.push(`案 ${v.version}「${s.title}」：${u}`);
    });
    for (const n of v.nextChecks) for (const u of n.unsourced ?? []) check.unsourced.push(`案 ${v.version} 次に確かめる「${n.what}」：${u}`);
    for (const n of v.notes) check.planNotes.push(`案 ${v.version}：${n}`);
    if (v.notes.length) log.push(`受け取るときに気づいたこと：${v.notes.join(" / ")}`);
  }

  async function predict(version: number, tag: string) {
    const v = p.plans.find((x) => x.version === version)!;
    const names = namesOf(p, v);
    const r = await timed("predict_pattern", (rejected) =>
      callTool({
        system: patternPrompt(),
        user: patternRequest(p.name, v, (s) => plainWords(s, names), patternContext(p, v)),
        tool: PREDICT_PATTERN,
        parse: (x) => {
          const out = parsePattern(x, { steps: v.steps.length });
          if (!out.ok) rejected.push(out.error);
          return out;
        },
        password,
        fetch: fetchShim,
      }),
    );
    if (!r.ok) throw new Error(`${c.id} 模様：${r.error}`);
    p = setPattern(p, v.version, { date: DAY, prediction: r.value, notes: r.warnings ?? [] }, DAY);
    const pred = r.value;
    predictions.push({ version: v.version, tag, prediction: pred });
    const entry: Check["predictions"][number] = { tag: tag || "-", applicable: pred.applicable, ops: pred.ops.map((o) => o.op), noAssumed: missingAssumed(pred) };
    log.push(`\n### 模様の見込み（案 ${v.version}・絵 ${c.id}${tag}）：${pred.applicable ? "描く" : "描かない"}\n${pred.reason}\n${pred.summary}`);
    if (r.warnings?.length) log.push(`直したこと：${r.warnings.join(" / ")}`);
    for (const o of pred.ops) log.push(`- ${o.op}（工程 ${o.step || "なし"}）${opWords(o)}${o.assumed ? `　仮：${o.assumed}` : ""}`);
    if (pred.cannot_show) log.push(`表せないこと：${pred.cannot_show}`);
    if (pred.applicable) {
      const out = await render(c.id, tag, pred);
      Object.assign(entry, { spread: out.spread, renderMs: out.ms, notes: out.notes });
      log.push(`絵：明るさのばらつき ${out.spread}${out.spread < 4 ? "（のっぺり）" : ""}・描くのに ${out.ms} ms`);
      if (out.notes.length) log.push(`計算の知らせ：${out.notes.join(" / ")}`);
    }
    check.predictions.push(entry);
  }

  try {
    await plan();
    await predict(1, "-first");
    const v = p.plans.at(-1)!;
    const step = v.steps.find((s) => c.trial.stepWords.test(s.title)) ?? v.steps[0];
    p = setResult(p, v, step, { outcome: c.trial.outcome, note: c.trial.note }, DAY);
    log.push(`\n試した結果（${step.title}）：${c.trial.outcome}　${c.trial.note}`);
    await plan();
    await predict(2, "-v2");
  } catch (e) {
    check.error = String(e);
    log.push(`\n止まった：${String(e)}`);
  }
  writeFileSync(`${OUT}/cases/${c.id}.json`, JSON.stringify(toFile(p, {}, DAY), null, 2));
  writeFileSync(`${OUT}/cases/${c.id}.replies.json`, JSON.stringify(replies, null, 2));
  writeFileSync(`${OUT}/cases/${c.id}.predictions.json`, JSON.stringify(predictions, null, 2));
  writeFileSync(`${OUT}/cases/${c.id}.log.md`, log.join("\n") + "\n");
  writeFileSync(`${OUT}/cases/${c.id}.check.json`, JSON.stringify(check, null, 2));
  return check;
}

mkdirSync(`${OUT}/cases`, { recursive: true });
if (process.argv[2] === "--render") {
  for (const c of STRESS_CASES) {
    const saved = `${OUT}/cases/${c.id}.predictions.json`;
    if (!existsSync(saved)) continue;
    for (const x of JSON.parse(readFileSync(saved, "utf8")) as { tag: string; prediction: PatternPrediction }[]) {
      if (!x.prediction.applicable) continue;
      const out = await render(c.id, x.tag, x.prediction);
      console.log(`${c.id}${x.tag}：ばらつき ${out.spread}・${out.ms} ms${out.notes.length ? `・${out.notes.join(" / ")}` : ""}`);
    }
  }
  process.exit(0);
}
loadEnv(process.argv[2]);
const pick = process.argv.slice(3);
const cases = STRESS_CASES.filter((c) => !pick.length || pick.includes(c.id));
const results = await Promise.allSettled(cases.map(run));
results.forEach((r, i) => {
  if (r.status === "rejected") return console.error(cases[i].id, String(r.reason));
  const k = r.value;
  const slow = k.calls.filter((x) => x.ms > SLOW_MS).length;
  const rej = k.calls.reduce((a, x) => a + x.rejected.length, 0);
  const pr = k.predictions.map((x) => `${x.tag}:${x.applicable ? `描く(${x.ops.join(",")})${x.spread !== undefined ? ` ばらつき${x.spread}` : ""}` : "描かない"}`).join(" | ");
  console.log(`${k.id}［正しい答え ${k.expect}］${k.error ? ` 止まった：${k.error}` : ""} 遅い ${slow}・断った ${rej}・手がかりにない数字 ${k.unsourced.length}\n  ${pr}`);
});
