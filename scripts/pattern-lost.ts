// 本当に途切れた技（ダマスカス鋼＝ウーツ鋼の模様）を、途切れた技の流れのとおりに、本物の Claude で通す（2026-11-08）。
// 手がかりは、公開の資料から書いた（research/restore/lost-wootz.md）。架空ではない。はしごの段の作り方は、資料でも昔のやり方が分からないので、手がかりに入れない。
// 同じ手がかりで 3 とおり通す：
//   solo＝職人の帳面を外す（Claude だけで組み立てる。画面の「職人の帳面を外して、案を出し直す」と同じ）
//   book＝職人の帳面を渡す（2026-11-08 に足した、石川さんの木目金の帳面の言葉も入る）
//   old ＝職人の帳面を渡すが、2026-11-08 に足した言葉だけを外す（足した言葉が効いたかを見るため）
// 流れ：手がかり → propose_restoration（案） → predict_pattern（模様の操作） → 計算で絵（表と断面）。
// Claude は、画面と同じ api/claude.ts の関数を通して呼ぶ（キーは .env から読むだけ。表に出さない）。
// 使い方：npx tsx scripts/pattern-lost.ts <.env のある所> [solo book old]
//         npx tsx scripts/pattern-lost.ts --render   （Claude を呼ばず、残した見込みから絵だけ描き直す）
// 出すもの：docs/pattern-demo/lost/wootz-<variant>-top.png・-section.png・-stage<n>.png（途中の段）、lost/cases/wootz-<variant>.json・.replies.json・.predictions.json・.log.md
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { encodePng } from "./png";
import repoLedger from "../ledger/jewelry.json";
import wootzLedger from "../ledger/wootz.json";
import type { Ledger } from "../src/rules/ledger";
import { seedTechLedger, TECH_IDS, TECHS } from "../src/rules/techniques";
import { bookText, readBook, type BookRule } from "../src/rebuild/book";
import { modelOf, topImage } from "../src/rebuild/pattern-model";
import { opWords, parsePattern, patternContext, type PatternPrediction, patternPrompt, patternRequest, PREDICT_PATTERN } from "../src/rebuild/pattern-tools";
import { addClue, applyPlan, type RestorePlan, clueRefs, knownClueIds, namesOf, newProject, plainWords, setPattern, sourceText, toFile, type ClueKind, type RestoreProject } from "../src/rebuild/restore";
import { restoreContent, restorePrompt } from "../src/rebuild/restore-prompt";
import { parseRestoration, PROPOSE_RESTORATION } from "../src/rebuild/restore-tools";
import { callTool } from "../src/rebuild/run";

const DAY = "2026-11-08";
const OUT = "docs/pattern-demo/lost";
const ID = "wootz";
const NAME = "ダマスカス鋼（ウーツ鋼）の模様";

/** 2026-11-08 に、作者の許しを得て、石川さんの言葉として木目金の帳面に足した決まり */
export const NEW_ENTRY_IDS = ["mokume-forge-flatten-inside-ishikawa", "mokume-carve-then-flatten-ishikawa", "mokume-reveal-by-color-ishikawa", "mokume-read-section-ishikawa", "mokume-overheat-test-ishikawa"];

/** 手がかり。どれも公開の資料から（出どころに書いた）。数字は資料にあるものだけ */
export const LOST_CLUES: { kind: ClueKind; title: string; text: string; source: string }[] = [
  {
    kind: "object",
    title: "刃の表の模様",
    text: "古い刀の刃の表に、明るく光る線と暗い地が、流れる水のように波打って見える。線はとぎれとぎれで、点で終わる所もある。研いで仕上げた面に出る。",
    source: "Wikipedia「Damascus steel」、L. A. Jones「Wootz Steel (True Damascus)」1999、H. Föll（キール大学）「Wootz Patterns」",
  },
  {
    kind: "object",
    title: "はしごの段",
    text: "刃によっては、刃を横切る段が、長さの向きに、ほぼ同じ間で並ぶ（「預言者のはしご」と呼ばれる。段は 40 と言われるが、実物はその前後）。段の所では、地の模様が変わっている。どう作ったかは、いろいろな説があり、分かっていない。",
    source: "H. Föll「Wootz Patterns」（Sachse の本の図）、L. A. Jones「Wootz Steel (True Damascus)」",
  },
  {
    kind: "material",
    title: "材料の塊",
    text: "鉄と木炭と植物を坩堝（るつぼ）に入れて長く熱して作った、炭素の多い鋼の塊（ウーツ）。塊のまま遠くへ運ばれ、それを鍛えて刀にした。板を重ねて作った物ではない。",
    source: "L. A. Jones「Wootz Steel (True Damascus)」、Wikipedia「Damascus steel」、メトロポリタン美術館「Ten Wootz Steel Ingots with Bag」",
  },
  {
    kind: "record",
    title: "後の研究：模様の正体",
    text: "模様は、鉄の炭化物の小さな粒が集まった帯と、鋼の地のちがい。帯は刃の面にほぼ平行に並ぶ。帯の元は、鋳た塊が固まるとき、ごく少しの混じり物（バナジウムなど）が結晶の枝のすき間に集まったむらだ、という説がある。ただし、この説には疑問も出ていて、帯ができるしくみは、まだはっきりしない。",
    source: "Verhoeven・Pendray・Dauksch（JOM 1998）、Verhoeven ほか（JOM 2018）、H. Föll「Structure by Dendrites?」",
  },
  {
    kind: "record",
    title: "後の研究：熱",
    text: "鍛えるあいだ、ある温度より上に長く置くと、模様が消えてしまう、とされる。粒を育てるには、約 730 ℃ のすぐ上と下をくり返す、という。何回くり返したかは書かれていない。",
    source: "H. Föll「Forging a Wootz Sword」",
  },
  {
    kind: "record",
    title: "途切れた",
    text: "最上の模様の刀は、1750 年ごろが最後とされる（はっきりしない）。作ること自体も、1900 年ごろまでに止んだ。途切れた理由は、材料の鉱石・交易の道・熱のやり方が失われた、などの説があり、決まっていない。",
    source: "Verhoeven・Pendray・Dauksch（JOM 1998）、Wikipedia「Damascus steel」",
  },
];

export type Variant = "solo" | "book" | "old";
const VARIANTS: Variant[] = ["solo", "book", "old"];

export function loadEnv(path: string) {
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  if (!process.env.DEMO_PASSWORD) process.env.DEMO_PASSWORD = "dev-local";
}

/** 本物の写真を見た職人の言葉（ledger/wootz.json。scripts/real-round.ts が足す）。帳面ありのときだけ渡す */
export const WOOTZ_CRAFT = "ダマスカス鋼（本物の写真を見た職人の目）";

export function bookFor(v: Variant, wootz: Pick<Ledger<string>, "rules"> = wootzLedger as unknown as Ledger<string>): BookRule[] {
  if (v === "solo") return [];
  const drop = v === "old" ? new Set(NEW_ENTRY_IDS) : new Set<string>();
  return readBook([
    { craft: WOOTZ_CRAFT, ledger: wootz },
    { craft: "指輪の石留め", ledger: repoLedger as unknown as Ledger },
    ...TECH_IDS.map((id) => {
      const l = seedTechLedger(id);
      return { craft: TECHS[id].name, ledger: { ...l, rules: l.rules.filter((r) => !drop.has(r.id)) } };
    }),
  ]).rules;
}

export async function render(tag: string, pred: PatternPrediction, out = OUT): Promise<string[]> {
  const m = modelOf(pred, 7);
  const top = await topImage(m, 400, 2);
  writeFileSync(`${out}/${ID}-${tag}-top.png`, encodePng(top.w, top.h, top.data));
  const sec = m.section(640, 140, m.row, 2);
  writeFileSync(`${out}/${ID}-${tag}-section.png`, encodePng(sec.w, sec.h, sec.data));
  // 途中の段（画面の「段が 1 つずつ現れる」と同じ計算）
  for (let i = 0; i < pred.ops.length - 1; i++) {
    const st = await topImage(m.stage(i), 300, 2);
    writeFileSync(`${out}/${ID}-${tag}-stage${i + 1}.png`, encodePng(st.w, st.h, st.data));
  }
  return m.notes;
}

/**
 * 案 2 として、職人の見立てのとおりに組んでもらうときの頼み（2026-11-08 回 4）。title は職人の見立ての題、text は頼みの文。
 * 案 1 は手がかりのとおりに出してもらい、案 2 は、職人の見立てを試す案として、同じ手がかりと帳面で、もう 1 回出してもらう
 */
export interface AltPlan {
  title: string;
  text: string;
}

/** 1 とおり通す。out を変えると、絵と記録をそこに出す（本物とくらべる回：scripts/real-round.ts）。alt があれば、案 2 も出して <variant>-alt の絵にする */
export async function run(v: Variant, opts: { out?: string; book?: BookRule[]; alt?: AltPlan } = {}) {
  const out = opts.out ?? OUT;
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
  const book = opts.book ?? bookFor(v);
  const useBook = v !== "solo";
  let p: RestoreProject = { ...newProject(`lost-${ID}-${v}`, NAME, DAY), useBook };
  for (const clue of LOST_CLUES) {
    const r = addClue(p, clue, DAY);
    if ("error" in r) throw new Error(r.error);
    p = r.project;
  }
  const log: string[] = [`# ${NAME}（${ID}・${v === "solo" ? "Claude だけ（帳面なし）" : v === "book" ? "職人の帳面あり（2026-11-08 の言葉も）" : "職人の帳面あり（2026-11-08 の言葉は外す）"}）`];

  const preds: { version: number; tag: string; prediction: PatternPrediction }[] = [];
  const rounds: { tag: Variant | `${Variant}-alt`; ask?: string }[] = [{ tag: v }];
  if (opts.alt) rounds.push({ tag: `${v}-alt`, ask: opts.alt.text });
  let plan!: RestorePlan;
  let pred!: PatternPrediction;
  for (const one of rounds) {
    const content = restoreContent(p, [], book);
    // 案 2：職人の見立てを試す頼みを、案を頼む文の前に入れる（手がかりは同じ）
    if (one.ask) content.splice(content.length - 1, 0, { type: "text", text: one.ask });
    if (one.ask) log.push(`\n## 職人の見立てを試す頼み\n${one.ask}`);
    const r = await callTool({
      system: restorePrompt({ book: useBook }),
      user: content,
      tool: PROPOSE_RESTORATION,
      parse: (x) => parseRestoration(x, { ids: knownClueIds(p), bookIds: book.map((b) => b.id) }),
      password,
      fetch: fetchShim,
    });
    if (!r.ok) throw new Error(`${v} 案：${r.error}`);
    p = applyPlan(p, r.value, { date: DAY, sent: clueRefs(p), photosSent: [], bookOn: useBook, book: book.map((b) => ({ id: b.id, title: b.title })), sources: `${sourceText(p)}\n${bookText(book)}`, warnings: r.warnings });
    plan = p.plans.at(-1)!;
    log.push(`\n## 案 ${plan.version}\n${plan.summary}`);
    plan.steps.forEach((s, i) =>
      log.push(
        `${i + 1}. ${s.title}${s.book_ids?.length ? `［帳面：${s.book_ids.map((b) => plan.book.find((x) => x.id === b)?.title).join("・")}］` : ""}${s.basis === "prior" ? "［もともとの知識］" : ""}${s.unsourced?.length ? `［手がかりにない数字：${s.unsourced.join("・")}］` : ""}\n   ${s.detail}${s.uncertain ? `\n   分からない：${s.uncertain}` : ""}`,
      ),
    );
    if (plan.notes.length) log.push(`受け取るときに気づいたこと：${plan.notes.join(" / ")}`);

    const names = namesOf(p, plan);
    const q = await callTool({
      system: patternPrompt(),
      user: patternRequest(p.name, plan, (s) => plainWords(s, names), patternContext(p, plan)),
      tool: PREDICT_PATTERN,
      parse: (x) => parsePattern(x, { steps: plan.steps.length }),
      password,
      fetch: fetchShim,
    });
    if (!q.ok) throw new Error(`${v} 模様：${q.error}`);
    p = setPattern(p, plan.version, { date: DAY, prediction: q.value, notes: q.warnings ?? [] }, DAY);
    pred = q.value;
    log.push(`\n### 模様の見込み：${pred.applicable ? "描く" : "描かない"}\n${pred.reason}\n${pred.summary}`);
    if (q.warnings?.length) log.push(`直したこと：${q.warnings.join(" / ")}`);
    for (const o of pred.ops) log.push(`- ${o.op}（工程 ${o.step || "なし"}）${opWords(o)}${o.assumed ? `　仮：${o.assumed}` : ""}`);
    if (pred.cannot_show) log.push(`表せないこと：${pred.cannot_show}`);
    if (pred.applicable) {
      const notes = await render(one.tag, pred, out);
      if (notes.length) log.push(`計算の知らせ：${notes.join(" / ")}`);
    }
    preds.push({ version: plan.version, tag: one.tag, prediction: pred });
  }
  mkdirSync(`${out}/cases`, { recursive: true });
  const base = `${out}/cases/${ID}-${v}`;
  writeFileSync(`${base}.json`, JSON.stringify(toFile(p, {}, DAY), null, 2));
  writeFileSync(`${base}.replies.json`, JSON.stringify(replies, null, 2));
  writeFileSync(`${base}.predictions.json`, JSON.stringify(preds, null, 2));
  writeFileSync(`${base}.log.md`, log.join("\n") + "\n");
  console.log(log.join("\n"));
  return { plan, pred, book };
}

async function main() {
  mkdirSync(`${OUT}/cases`, { recursive: true });
  if (process.argv[2] === "--render") {
    for (const v of VARIANTS) {
      const saved = `${OUT}/cases/${ID}-${v}.predictions.json`;
      if (!existsSync(saved)) continue;
      for (const x of JSON.parse(readFileSync(saved, "utf8")) as { prediction: PatternPrediction }[]) if (x.prediction.applicable) console.log(v, (await render(v, x.prediction)).join(" / "));
    }
    process.exit(0);
  }
  loadEnv(process.argv[2]);
  const pick = process.argv.slice(3) as Variant[];
  const runs = VARIANTS.filter((v) => !pick.length || pick.includes(v));
  const results = await Promise.allSettled(runs.map((v) => run(v)));
  results.forEach((r, i) => r.status === "rejected" && console.error(runs[i], String(r.reason)));
}

// 別の台本（scripts/real-round.ts）から読むときは、ここを走らせない
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
