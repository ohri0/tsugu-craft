// 手順のめずらしい架空の技（scripts/pattern-odd-cases.ts）を、途切れた技の流れのとおりに、本物の Claude で 1 回ずつ通す（2026-11-08）。
// 流れ：手がかり → propose_restoration（案） → predict_pattern（模様の操作） → 計算で絵（表と断面）。何度も回して良い絵を選ぶことはしない。
// Claude は、画面と同じ api/claude.ts の関数を通して呼ぶ（キーは .env から読むだけ。表に出さない）。職人の帳面は渡す（画面のはじめと同じ）。
// 使い方：npx tsx scripts/pattern-odd.ts <.env のある所> [技の id ...]
//         npx tsx scripts/pattern-odd.ts --render   （Claude を呼ばず、残した見込みから絵だけ描き直す）
// 出すもの：docs/pattern-demo/odd/<id>-top.png・-section.png、odd/cases/<id>.json・.replies.json・.predictions.json・.log.md
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { encodePng } from "./png";
import { ODD_CASES, type OddCase } from "./pattern-odd-cases";
import repoLedger from "../ledger/jewelry.json";
import type { Ledger } from "../src/rules/ledger";
import { seedTechLedger, TECH_IDS, TECHS } from "../src/rules/techniques";
import { bookText, readBook } from "../src/rebuild/book";
import { modelOf, topImage } from "../src/rebuild/pattern-model";
import { opWords, parsePattern, patternContext, type PatternPrediction, patternPrompt, patternRequest, PREDICT_PATTERN } from "../src/rebuild/pattern-tools";
import { addClue, applyPlan, clueRefs, knownClueIds, namesOf, newProject, plainWords, setPattern, sourceText, toFile, type RestoreProject } from "../src/rebuild/restore";
import { restoreContent, restorePrompt } from "../src/rebuild/restore-prompt";
import { parseRestoration, PROPOSE_RESTORATION } from "../src/rebuild/restore-tools";
import { callTool } from "../src/rebuild/run";

const DAY = "2026-11-08";
const OUT = "docs/pattern-demo/odd";

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

async function render(id: string, pred: PatternPrediction): Promise<string[]> {
  const m = modelOf(pred, 7);
  const top = await topImage(m, 400, 2);
  writeFileSync(`${OUT}/${id}-top.png`, encodePng(top.w, top.h, top.data));
  const sec = m.section(640, 140, m.row, 2);
  writeFileSync(`${OUT}/${id}-section.png`, encodePng(sec.w, sec.h, sec.data));
  return m.notes;
}

async function run(c: OddCase) {
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
  let p: RestoreProject = { ...newProject(`odd-${c.id}`, c.name, DAY), sample: true };
  for (const clue of c.clues) {
    const r = addClue(p, clue, DAY);
    if ("error" in r) throw new Error(r.error);
    p = r.project;
  }
  const log: string[] = [`# ${c.name}（${c.id}）`, `考えた手順（Claude には渡さない）：${c.process}`];
  const base = `${OUT}/cases/${c.id}`;
  const save = (pred?: PatternPrediction) => {
    writeFileSync(`${base}.json`, JSON.stringify(toFile(p, {}, DAY), null, 2));
    writeFileSync(`${base}.replies.json`, JSON.stringify(replies, null, 2));
    if (pred) writeFileSync(`${base}.predictions.json`, JSON.stringify([{ version: 1, tag: "", prediction: pred }], null, 2));
    writeFileSync(`${base}.log.md`, log.join("\n") + "\n");
  };
  try {
    const t0 = Date.now();
    const r = await callTool({
      system: restorePrompt({ book: true }),
      user: restoreContent(p, [], book),
      tool: PROPOSE_RESTORATION,
      parse: (x) => parseRestoration(x, { ids: knownClueIds(p), bookIds: book.map((b) => b.id) }),
      password,
      fetch: fetchShim,
    });
    if (!r.ok) throw new Error(`案：${r.error}`);
    p = applyPlan(p, r.value, { date: DAY, sent: clueRefs(p), photosSent: [], bookOn: true, book: book.map((b) => ({ id: b.id, title: b.title })), sources: `${sourceText(p)}\n${bookText(book)}`, warnings: r.warnings });
    const plan = p.plans.at(-1)!;
    log.push(`\n## 案 ${plan.version}（${Math.round((Date.now() - t0) / 1000)} 秒）\n${plan.summary}`);
    plan.steps.forEach((s, i) =>
      log.push(`${i + 1}. ${s.title}${s.basis === "prior" ? "［もともとの知識］" : ""}${s.unsourced?.length ? `［手がかりにない数字：${s.unsourced.join("・")}］` : ""}\n   ${s.detail}${s.uncertain ? `\n   分からない：${s.uncertain}` : ""}`),
    );
    if (plan.notes.length) log.push(`受け取るときに気づいたこと：${plan.notes.join(" / ")}`);

    const t1 = Date.now();
    const names = namesOf(p, plan);
    const q = await callTool({
      system: patternPrompt(),
      user: patternRequest(p.name, plan, (s) => plainWords(s, names), patternContext(p, plan)),
      tool: PREDICT_PATTERN,
      parse: (x) => parsePattern(x, { steps: plan.steps.length }),
      password,
      fetch: fetchShim,
    });
    if (!q.ok) throw new Error(`模様：${q.error}`);
    p = setPattern(p, plan.version, { date: DAY, prediction: q.value, notes: q.warnings ?? [] }, DAY);
    const pred = q.value;
    log.push(`\n### 模様の見込み（${Math.round((Date.now() - t1) / 1000)} 秒）：${pred.applicable ? "描く" : "描かない"}\n${pred.reason}\n${pred.summary}`);
    if (q.warnings?.length) log.push(`直したこと：${q.warnings.join(" / ")}`);
    for (const o of pred.ops) log.push(`- ${o.op}（工程 ${o.step || "なし"}）${opWords(o)}${o.assumed ? `　仮：${o.assumed}` : ""}`);
    if (pred.cannot_show) log.push(`表せないこと：${pred.cannot_show}`);
    if (pred.applicable) {
      const notes = await render(c.id, pred);
      if (notes.length) log.push(`計算の知らせ：${notes.join(" / ")}`);
    }
    save(pred);
    return `${c.id}：${pred.applicable ? pred.ops.map((o) => o.op).join("→") : "描かない"}`;
  } catch (e) {
    log.push(`\n止まった：${String(e)}`);
    save();
    throw e;
  }
}

mkdirSync(`${OUT}/cases`, { recursive: true });
if (process.argv[2] === "--render") {
  for (const c of ODD_CASES) {
    const saved = `${OUT}/cases/${c.id}.predictions.json`;
    if (!existsSync(saved)) continue;
    for (const x of JSON.parse(readFileSync(saved, "utf8")) as { prediction: PatternPrediction }[]) if (x.prediction.applicable) console.log(c.id, (await render(c.id, x.prediction)).join(" / "));
  }
  process.exit(0);
}
loadEnv(process.argv[2]);
const pick = process.argv.slice(3);
const cases = ODD_CASES.filter((c) => !pick.length || pick.includes(c.id));
const results = await Promise.allSettled(cases.map(run));
results.forEach((r, i) => console.log(r.status === "fulfilled" ? r.value : `${cases[i].id}：止まった ${String(r.reason)}`));
