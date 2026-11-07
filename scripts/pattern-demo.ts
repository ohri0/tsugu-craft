// 架空の技（scripts/pattern-cases.ts）を、途切れた技の流れのとおりに、本物の Claude で通す。
// 手がかりを入れる → propose_restoration で案 → predict_pattern で模様の操作 → 計算で絵（表と断面）。試した結果のある技は、案 2 と見込み 2 も。
// Claude は、画面と同じ api/claude.ts の関数を通して呼ぶ（キーは .env から。表に出さない）。
// 使い方：npx tsx scripts/pattern-demo.ts <.env のある所> [技の id ...]
//         npx tsx scripts/pattern-demo.ts --render   （Claude を呼ばず、残した記録から絵だけ描き直す）
// 出すもの：docs/pattern-demo/<id>-*.png、docs/pattern-demo/cases/<id>.json（記録のファイル）と <id>.replies.json（Claude の返事。画面の撮影で使い回す）
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { encodePng } from "./png";
import { DEMO_CASES, type DemoCase } from "./pattern-cases";
import repoLedger from "../ledger/jewelry.json";
import type { Ledger } from "../src/rules/ledger";
import { seedTechLedger, TECH_IDS, TECHS } from "../src/rules/techniques";
import { bookText, readBook } from "../src/rebuild/book";
import { buildSim, sectionImage, sectionRow, surfaceImage } from "../src/rebuild/pattern-sim";
import { opWords, parsePattern, type PatternPrediction, patternPrompt, patternRequest, PREDICT_PATTERN, toPatternOps } from "../src/rebuild/pattern-tools";
import { addClue, applyPlan, clueRefs, knownClueIds, namesOf, newProject, parseRestoreFile, plainWords, setPattern, setResult, sourceText, toFile, type RestoreProject } from "../src/rebuild/restore";
import { restoreContent, restorePrompt } from "../src/rebuild/restore-prompt";
import { parseRestoration, PROPOSE_RESTORATION } from "../src/rebuild/restore-tools";
import { callTool } from "../src/rebuild/run";

const DAY = "2026-11-07";
const OUT = "docs/pattern-demo";

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

/** 見込みの絵（表と断面）を描いて残す。断面は、表の模様をいちばん多く横切る所で切る（画面と同じ） */
function render(id: string, version: number, pred: PatternPrediction): string[] {
  const sim = buildSim(toPatternOps(pred), 7);
  const tag = version > 1 ? `-v${version}` : "";
  const top = surfaceImage(sim, 400, 2);
  writeFileSync(`${OUT}/${id}${tag}-top.png`, encodePng(top.w, top.h, top.data));
  const sec = sectionImage(sim, 640, 140, sectionRow(sim));
  writeFileSync(`${OUT}/${id}${tag}-section.png`, encodePng(sec.w, sec.h, sec.data));
  return sim.notes;
}

async function run(c: DemoCase) {
  const { handle } = await import("../api/claude");
  const replies: { tool: string; response: unknown }[] = [];
  const fetchShim: typeof fetch = async (_url, init) => {
    const res = await handle(new Request("http://localhost/api/claude", init as RequestInit));
    const body = await res.json();
    const tool = (JSON.parse(String(init?.body)) as { tools: { name: string }[] }).tools[0].name;
    replies.push({ tool, response: { status: res.status, body } });
    return new Response(JSON.stringify(body), { status: res.status, headers: res.headers });
  };
  const password = process.env.DEMO_PASSWORD!;
  let p: RestoreProject = { ...newProject(`demo-${c.id}`, c.name, DAY), sample: true };
  for (const clue of c.clues) {
    const r = addClue(p, clue, DAY);
    if ("error" in r) throw new Error(r.error);
    p = r.project;
  }
  const log: string[] = [`# ${c.name}（${c.id}）`];

  async function plan() {
    const prev = p.plans.at(-1);
    const r = await callTool({
      system: restorePrompt({ book: true }),
      user: restoreContent(p, [], book),
      tool: PROPOSE_RESTORATION,
      parse: (x) => parseRestoration(x, { ids: knownClueIds(p), bookIds: book.map((b) => b.id), prev }),
      password,
      fetch: fetchShim,
    });
    if (!r.ok) throw new Error(`${c.id} 案：${r.error}`);
    p = applyPlan(p, r.value, { date: DAY, sent: clueRefs(p), photosSent: [], bookOn: true, book: book.map((b) => ({ id: b.id, title: b.title })), sources: `${sourceText(p)}\n${bookText(book)}`, warnings: r.warnings });
    const v = p.plans.at(-1)!;
    log.push(`\n## 案 ${v.version}\n${v.summary}`);
    v.steps.forEach((s, i) => log.push(`${i + 1}. ${s.title}${s.book_ids?.length ? `［帳面：${s.book_ids.map((b) => v.book.find((x) => x.id === b)?.title).join("・")}］` : ""}${s.basis === "prior" ? "［もともとの知識］" : ""}`));
  }

  async function predict() {
    const v = p.plans.at(-1)!;
    const names = namesOf(p, v);
    const r = await callTool({
      system: patternPrompt(),
      user: patternRequest(p.name, v, (s) => plainWords(s, names)),
      tool: PREDICT_PATTERN,
      parse: (x) => parsePattern(x, { steps: v.steps.length }),
      password,
      fetch: fetchShim,
    });
    if (!r.ok) throw new Error(`${c.id} 模様：${r.error}`);
    p = setPattern(p, v.version, { date: DAY, prediction: r.value, notes: r.warnings ?? [] }, DAY);
    const pred = r.value;
    log.push(`\n### 模様の見込み（案 ${v.version}）：${pred.applicable ? "描く" : "描かない"}\n${pred.reason}\n${pred.summary}`);
    if (r.warnings?.length) log.push(`直したこと：${r.warnings.join(" / ")}`);
    for (const o of pred.ops) log.push(`- ${o.op}（工程 ${o.step || "なし"}）${opWords(o)}${o.assumed ? `　仮：${o.assumed}` : ""}`);
    if (pred.cannot_show) log.push(`表せないこと：${pred.cannot_show}`);
    if (pred.applicable) {
      const notes = render(c.id, v.version, pred);
      if (notes.length) log.push(`計算の知らせ：${notes.join(" / ")}`);
    }
  }

  await plan();
  await predict();
  if (c.trial) {
    const v = p.plans.at(-1)!;
    const step = v.steps.find((s) => c.trial!.stepWords.test(s.title)) ?? v.steps[0];
    p = setResult(p, v, step, { outcome: c.trial.outcome, note: c.trial.note }, DAY);
    log.push(`\n試した結果（${step.title}）：${c.trial.outcome}　${c.trial.note}`);
    await plan();
    await predict();
  }
  writeFileSync(`${OUT}/cases/${c.id}.json`, JSON.stringify(toFile(p, {}, DAY), null, 2));
  writeFileSync(`${OUT}/cases/${c.id}.replies.json`, JSON.stringify(replies, null, 2));
  writeFileSync(`${OUT}/cases/${c.id}.log.md`, log.join("\n") + "\n");
  console.log(log.join("\n"));
}

if (process.argv[2] === "--render") {
  for (const c of DEMO_CASES) {
    const f = parseRestoreFile(JSON.parse(readFileSync(`${OUT}/cases/${c.id}.json`, "utf8")));
    if (!f.ok) throw new Error(`${c.id}：${f.error}`);
    for (const v of f.project.plans) if (v.pattern?.prediction.applicable) render(c.id, v.version, v.pattern.prediction);
  }
  process.exit(0);
}
loadEnv(process.argv[2]);
mkdirSync(`${OUT}/cases`, { recursive: true });
const pick = process.argv.slice(3);
const cases = DEMO_CASES.filter((c) => !pick.length || pick.includes(c.id));
const results = await Promise.allSettled(cases.map(run));
results.forEach((r, i) => r.status === "rejected" && console.error(cases[i].id, String(r.reason)));
