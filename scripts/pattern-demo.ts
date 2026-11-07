// 架空の技（scripts/pattern-cases.ts）を、途切れた技の流れのとおりに、本物の Claude で通す。
// 手がかりを入れる → propose_restoration で案 → predict_pattern で模様の操作 → 計算で絵（表と断面）。
// 試した結果のある技は、結果を入れて案 1 の見込みを作り直し（絵を結果に合わせる）、案 2 と見込み 2 も（前の見込みの仮の値をそろえる）。
// Claude は、画面と同じ api/claude.ts の関数を通して呼ぶ（キーは .env から。表に出さない）。
// 使い方：npx tsx scripts/pattern-demo.ts <.env のある所> [技の id ...]
//         npx tsx scripts/pattern-demo.ts --render   （Claude を呼ばず、残した記録から絵だけ描き直す。見本の sample-*.png も）
// 出すもの：docs/pattern-demo/<id>-*.png、docs/pattern-demo/cases/<id>.json（記録のファイル）と <id>.replies.json（Claude の返事。画面の撮影で使い回す）、
//           <id>.predictions.json（見込みを頼んだ順の答え。作り直す前の見込みの絵も描き直せるように）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { encodePng } from "./png";
import { DEMO_CASES, type DemoCase } from "./pattern-cases";
import repoLedger from "../ledger/jewelry.json";
import type { Ledger } from "../src/rules/ledger";
import { seedTechLedger, TECH_IDS, TECHS } from "../src/rules/techniques";
import { bookText, readBook } from "../src/rebuild/book";
import { modelOf, topImage } from "../src/rebuild/pattern-model";
import { opWords, parsePattern, patternContext, type PatternPrediction, patternPrompt, patternRequest, PREDICT_PATTERN, toPatternOps } from "../src/rebuild/pattern-tools";
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
async function render(id: string, tag: string, pred: PatternPrediction): Promise<string[]> {
  const m = modelOf(pred, 7);
  const top = await topImage(m, 400, 2);
  writeFileSync(`${OUT}/${id}${tag}-top.png`, encodePng(top.w, top.h, top.data));
  const sec = m.section(640, 140, m.row, 2);
  writeFileSync(`${OUT}/${id}${tag}-section.png`, encodePng(sec.w, sec.h, sec.data));
  return m.notes;
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
  const predictions: { version: number; tag: string; prediction: PatternPrediction }[] = [];

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

  /** 見込みを頼む（画面と同じく、前の案の見込みと試した結果を添える）。tag は絵のファイル名の後ろ */
  async function predict(version: number, tag: string) {
    const v = p.plans.find((x) => x.version === version)!;
    const names = namesOf(p, v);
    const r = await callTool({
      system: patternPrompt(),
      user: patternRequest(p.name, v, (s) => plainWords(s, names), patternContext(p, v)),
      tool: PREDICT_PATTERN,
      parse: (x) => parsePattern(x, { steps: v.steps.length }),
      password,
      fetch: fetchShim,
    });
    if (!r.ok) throw new Error(`${c.id} 模様：${r.error}`);
    p = setPattern(p, v.version, { date: DAY, prediction: r.value, notes: r.warnings ?? [] }, DAY);
    const pred = r.value;
    predictions.push({ version: v.version, tag, prediction: pred });
    log.push(`\n### 模様の見込み（案 ${v.version}・絵 ${c.id}${tag}）：${pred.applicable ? "描く" : "描かない"}\n${pred.reason}\n${pred.summary}`);
    if (r.warnings?.length) log.push(`直したこと：${r.warnings.join(" / ")}`);
    for (const o of pred.ops) log.push(`- ${o.op}（工程 ${o.step || "なし"}）${opWords(o)}${o.assumed ? `　仮：${o.assumed}` : ""}`);
    if (pred.cannot_show) log.push(`表せないこと：${pred.cannot_show}`);
    if (pred.applicable) {
      const notes = await render(c.id, tag, pred);
      if (notes.length) log.push(`計算の知らせ：${notes.join(" / ")}`);
    }
  }

  await plan();
  await predict(1, c.trial ? "-first" : "");
  if (c.trial) {
    const v = p.plans.at(-1)!;
    const step = v.steps.find((s) => c.trial!.stepWords.test(s.title)) ?? v.steps[0];
    p = setResult(p, v, step, { outcome: c.trial.outcome, note: c.trial.note }, DAY);
    log.push(`\n試した結果（${step.title}）：${c.trial.outcome}　${c.trial.note}`);
    // 結果を入れて、案 1 の見込みを作り直す（画面の「この案で、見込みを作り直す」と同じ）
    await predict(1, "");
    await plan();
    await predict(2, "-v2");
  }
  writeFileSync(`${OUT}/cases/${c.id}.json`, JSON.stringify(toFile(p, {}, DAY), null, 2));
  writeFileSync(`${OUT}/cases/${c.id}.replies.json`, JSON.stringify(replies, null, 2));
  writeFileSync(`${OUT}/cases/${c.id}.predictions.json`, JSON.stringify(predictions, null, 2));
  writeFileSync(`${OUT}/cases/${c.id}.log.md`, log.join("\n") + "\n");
  console.log(log.join("\n"));
}

/**
 * 重ねない技の、線の道すじと打ち出しの形の見本（Claude の答えではなく、ここで書いた操作）。
 * 唐草（scroll）・花びらの花・葉のふくらみ を、絵だけで確かめるため。
 */
const SAMPLES: { id: string; ops: PatternPrediction["ops"] }[] = (() => {
  const op = (o: string, choice: string, metals: string[] = [], amount = 0, size = 0, across = 0) => ({ op: o, step: 1, why: "見本", assumed: "見本のための値", metals, amount, size, across, choice });
  return [
    { id: "scroll", ops: [op("plate", "-", ["silver"]), op("kebori", "border", [], 0.2, 0.005, 2), op("katakiri", "scroll", [], 0.25, 0.007, 3), op("color", "none")] },
    { id: "petals", ops: [op("plate", "-", ["copper"]), op("uchidashi", "petals", [], 0.2, 0.06, 3), op("color", "none")] },
    { id: "leaves", ops: [op("plate", "-", ["silver"]), op("uchidashi", "leaves", [], 0.15, 0.06, 3), op("color", "none")] },
  ] as unknown as { id: string; ops: PatternPrediction["ops"] }[];
})();

if (process.argv[2] === "--render") {
  for (const s of SAMPLES) {
    const pred = { applicable: true, reason: "見本", summary: "見本", cannot_show: "", ops: s.ops } as PatternPrediction;
    await render(`sample-${s.id}`, "", pred);
  }
  for (const c of DEMO_CASES) {
    const saved = `${OUT}/cases/${c.id}.predictions.json`;
    if (existsSync(saved)) {
      for (const x of JSON.parse(readFileSync(saved, "utf8")) as { tag: string; prediction: PatternPrediction }[]) if (x.prediction.applicable) await render(c.id, x.tag, x.prediction);
      continue;
    }
    const f = parseRestoreFile(JSON.parse(readFileSync(`${OUT}/cases/${c.id}.json`, "utf8")));
    if (!f.ok) throw new Error(`${c.id}：${f.error}`);
    for (const v of f.project.plans) if (v.pattern?.prediction.applicable) await render(c.id, v.version > 1 ? `-v${v.version}` : "", v.pattern.prediction);
  }
  process.exit(0);
}
loadEnv(process.argv[2]);
mkdirSync(`${OUT}/cases`, { recursive: true });
const pick = process.argv.slice(3);
const cases = DEMO_CASES.filter((c) => !pick.length || pick.includes(c.id));
const results = await Promise.allSettled(cases.map(run));
results.forEach((r, i) => r.status === "rejected" && console.error(cases[i].id, String(r.reason)));
