// 「継ぐ」がある場合と、Claude にただ聞く場合をくらべる（2026-11-08）。
// 同じモデル・同じ設定（api/claude.ts の関数を通す）・同じ手がかりの文で、2 つの条件を何回かずつ通す。
//   A「Claude だけ」：短いふつうの指示で 1 回聞く。道具も帳面も模様の計算も無い。手順と、できる模様を文で答える。
//   B「継ぐ」：画面と同じ流れ。組み立て直しの指示＋職人の帳面 → 案（propose_restoration）→ 模様の見込み（predict_pattern）→ 計算の絵。
//      A と同じ手がかりだけで比べるため、試した結果は入れず、案 1 と見込み 1 だけ（scripts/pattern-stress.ts の前半と同じ）。
// そのあと、別の Claude を審判にして（どちらの条件かは書かない。並べる順はくじ）、手がかりの点ごとに合うかを見てもらう。
// 数字の数え（根拠のない数字・根拠の見える手順）は、このファイルの中の決まりで機械的に数える。
// Claude は、画面と同じ api/claude.ts の関数を通して呼ぶ（キーは .env から。表に出さない）。
// 使い方：
//   npx tsx scripts/compare-plain.ts run <.env のある所> [--runs 2] [--only A|B] [技の id ...]   答えを docs/compare/raw/ に残す
//   npx tsx scripts/compare-plain.ts judge <.env のある所> [--no-picture] [技の id ...]          審判（raw/<id>-judge-<回>.json。--no-picture は B も文だけで -text.json に）
//   npx tsx scripts/compare-plain.ts score                                                     数えて docs/compare/results.json に
//   npx tsx scripts/compare-plain.ts chart                                                     まとめの絵 docs/compare/summary.png（results.json から）
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { encodePng } from "./png";
import { STRESS_CASES } from "./pattern-stress-cases";
import type { DemoCase } from "./pattern-cases";
import repoLedger from "../ledger/jewelry.json";
import type { Ledger } from "../src/rules/ledger";
import { seedTechLedger, TECH_IDS, TECHS } from "../src/rules/techniques";
import { bookText, readBook } from "../src/rebuild/book";
import { modelOf, topImage } from "../src/rebuild/pattern-model";
import { opWords, parsePattern, patternContext, type PatternPrediction, patternPrompt, patternRequest, PREDICT_PATTERN } from "../src/rebuild/pattern-tools";
import { addClue, applyPlan, clueRefs, knownClueIds, namesOf, newProject, plainWords, setPattern, sourceText, type RestorePlan, type RestoreProject } from "../src/rebuild/restore";
import { clueText, restoreContent, restorePrompt } from "../src/rebuild/restore-prompt";
import { parseRestoration, PROPOSE_RESTORATION } from "../src/rebuild/restore-tools";
import { callTool } from "../src/rebuild/run";
import { PASSWORD_HEADER } from "../src/claude/wire";

const DAY = "2026-11-08";
const OUT = "docs/compare";
const RAW = `${OUT}/raw`;

/** A の指示（短く、ふつうに）。道具・帳面・決まりは渡さない */
export const PLAIN_SYSTEM = "金工の技の手がかりから、作り方の手順と、できる模様を答えてください。";
const PLAIN_ASK = "作り方の手順を、1. 2. と番号をつけて書き、そのあとに「できる模様」を書いてください。";

// ---------- 技（手がかり） ----------

interface Case {
  id: string;
  name: string;
  clues: DemoCase["clues"];
  /** 描くのが正しいか（断る＝金属の模様の技ではない） */
  expect: "draw" | "decline" | "partial";
  /** 手がかりの文を、確かめられる点に分けたもの（見た目・形・並び・裏・断面・高さ。作り方の言葉は入れない）。この比べのために手で書いた */
  points: string[];
}

function sampleCase(file: string, id: string): Case | null {
  if (!existsSync(file)) return null;
  const p = JSON.parse(readFileSync(file, "utf8")).project as { name: string; clues: { kind: DemoCase["clues"][number]["kind"]; title: string; text: string; source: string }[] };
  return { id, name: p.name, expect: "draw", clues: p.clues.map((c) => ({ kind: c.kind, title: c.title, text: c.text, source: c.source })), points: [] };
}

const POINTS: Record<string, string[]> = {
  mijika: ["地が黒い", "線が銀色", "線が細い"],
  konoha: [
    "地は赤茶色",
    "白っぽい葉の形が、ばらばらの向きで散らばる",
    "葉はまわりが白、真ん中にいくと赤くなり、また白くなる（年輪のような輪）",
    "葉の先はとがり、根元は丸い",
    "葉の数は 15〜20 ほど",
    "表は平ら（出っぱりを削って平らにした）",
    "板の縁は少し丸めてある",
  ],
  mujun: [
    "地が黒い",
    "銀色のまっすぐな筋が 5 本ほど、平行に通る",
    "筋は地と同じ高さ",
    "割れた所で、筋が板の奥まで（裏まで）通って見える",
    "裏には銀の筋が見えず、全部黒い",
  ],
  shashin: ["地は灰色で、すこし緑っぽい", "地の表はざらざらで、光が鈍い", "白い丸が、ばらばらに 10 個くらい", "丸は米つぶくらいの大きさ", "丸の所だけ、つるっと光る", "丸は地と同じ高さ"],
  rojin: ["銅の板", "表に波の形が盛り上がる（裏から打った）", "表には彫りなど手を加えない", "仕上がりは茶色"],
  machigai: ["地は鉄の黒", "金色の唐草の模様", "金の所の下に、細かい網目の傷がある", "金はめっきではなく、打ち込んだもの（象嵌に近い）"],
  kasanebori: ["帯の表は銀色", "唐草が彫ってある", "彫った溝の底が黒く、深い所は赤い", "唐草の間の銀の地に、小さな輪がびっしり打ってある", "端の切り口に、白・黒・赤の 3 つの層が見える"],
  rougata: ["表は砂をまいたような細かいざらざらの肌", "へらで引いたような太めの渦の線がある", "渦の線は少しへこむ", "裏は表の凹凸の裏返しではなく、厚みがまちまち", "仕上げに煮色の色がつく"],
  senshippo: ["小さな丸い板", "銀色の細い線で、花の形がたくさん区切ってある", "区切りの中は、青と白のつやのあるガラス", "線とガラスは同じ高さ", "ふちに銅の色が少し見える"],
  utsuwa: ["銅の鉢（器の形）", "外側に波の形が盛り上がる", "波のふちに細い線がくっきり打ってある", "内側は、外の波の所がへこむ", "仕上げに煮色の色がつく"],
  yorisen: ["銀の細工", "よった細い線が、渦を巻いて並ぶ", "渦の間は透けて向こうが見える", "外の枠は太い線", "渦の真ん中に、小さな銀の粒が 1 つずつ"],
  urushi: ["表は真っ黒で、つやがある", "金色の細かな粉が、雲のように散らしてある", "粉の所も平ら", "黒い膜の下に、鉄の赤さびの地がある", "黒い膜は金属ではない"],
  chotsugai: ["ふたを開けても、蝶番が外から見えない", "後ろに細い筒が 5 つ、ふたと箱に交互についている", "筒の真ん中に棒が通っている", "箱の表は磨いてあるだけで、飾りは無い"],
  amadare: ["小さな板に、丸い目がほぼ同じ間で並ぶ", "目の中に、黒・白・赤の輪が重なって見える", "表は平ら（穴を穿ったあと打ち平めた）", "裏は平らで、打った跡も穴の跡もない"],
  wauchi: ["地が黒い", "けしの実ほどの小さな輪が、すき間なく列になって並ぶ", "地がざらりと光る", "金色の細い筋が何本か、波のようにゆるく流れる", "筋は地と同じ高さで、段がない"],
  damascus: [],
};

export function allCases(): Case[] {
  const out: Case[] = STRESS_CASES.map((c) => ({ id: c.id, name: c.name, clues: c.clues, expect: c.expect, points: POINTS[c.id] ?? [] }));
  for (const [file, id] of [
    ["research/restore/sample-moyou.json", "amadare"],
    ["research/restore/sample-moyou-surface.json", "wauchi"],
  ] as const) {
    const c = sampleCase(file, id);
    if (c) out.push({ ...c, points: POINTS[id] });
  }
  return out;
}

// ---------- 呼ぶ所 ----------

function loadEnv(path: string) {
  // この試しは 1 回の実行で 100 回近く呼ぶので、関数の中の 1 日の数え（ふだんは 200）に当たらないよう大きめに（この実行の中だけ）
  if (!process.env.DAILY_LIMIT) process.env.DAILY_LIMIT = "1000";
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

interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface CallLog {
  what: string;
  ms: number;
  status: number;
  usage?: Usage;
}

/** 手がかりだけを入れた記録（A と B で同じ手がかりの文にするため、どちらもここから作る） */
function projectOf(c: Case): RestoreProject {
  let p: RestoreProject = { ...newProject(`compare-${c.id}`, c.name, DAY), sample: true };
  for (const clue of c.clues) {
    const r = addClue(p, clue, DAY);
    if ("error" in r) throw new Error(r.error);
    p = r.project;
  }
  return p;
}

/** A と B に渡す手がかりの文（B の restoreContent の前半と同じ文） */
export function clueBody(p: RestoreProject): string {
  return `この技の呼び名（職人がつけた名前で、本当の名前とは限りません）：${p.name}\n\n## 手がかり\n\n<clues>\n${clueText(p, new Set())}\n</clues>`;
}

async function post(body: unknown): Promise<{ status: number; data: any; ms: number }> {
  const { handle } = await import("../api/claude");
  const t0 = Date.now();
  const res = await handle(
    new Request("http://localhost/api/claude", {
      method: "POST",
      headers: { "content-type": "application/json", [PASSWORD_HEADER]: encodeURIComponent(process.env.DEMO_PASSWORD!) },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, data: await res.json(), ms: Date.now() - t0 };
}

function textOf(message: any): string {
  return ((message?.content ?? []) as { type: string; text?: string }[])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();
}

async function runPlain(c: Case, n: number) {
  const p = projectOf(c);
  const user = `${clueBody(p)}\n\n${PLAIN_ASK}`;
  let last: { status: number; data: any; ms: number } | undefined;
  for (let tries = 0; tries < 3; tries++) {
    last = await post({ system: PLAIN_SYSTEM, messages: [{ role: "user", content: user }], tools: [] });
    if (last.status === 200 && textOf(last.data)) break;
  }
  const r = last!;
  const out = { id: c.id, cond: "A", run: n, date: DAY, system: PLAIN_SYSTEM, user, status: r.status, ms: r.ms, usage: r.data?.usage, model: r.data?.model, stop: r.data?.stop_reason, text: textOf(r.data), error: r.status === 200 ? undefined : r.data };
  writeFileSync(`${RAW}/${c.id}-A${n}.json`, JSON.stringify(out, null, 2));
  return out;
}

async function runTsugu(c: Case, n: number) {
  const { handle } = await import("../api/claude");
  const calls: CallLog[] = [];
  let current = "";
  const fetchShim: typeof fetch = async (_url, init) => {
    const t0 = Date.now();
    const res = await handle(new Request("http://localhost/api/claude", init as RequestInit));
    const body = await res.json();
    calls.push({ what: current, ms: Date.now() - t0, status: res.status, usage: body?.usage });
    return new Response(JSON.stringify(body), { status: res.status, headers: res.headers });
  };
  const password = process.env.DEMO_PASSWORD!;
  let p = projectOf(c);
  const rejected: string[] = [];
  const t0 = Date.now();
  current = "propose_restoration";
  const r = await callTool({
    system: restorePrompt({ book: true }),
    user: restoreContent(p, [], book),
    tool: PROPOSE_RESTORATION,
    parse: (x) => {
      const o = parseRestoration(x, { ids: knownClueIds(p), bookIds: book.map((b) => b.id) });
      if (!o.ok) rejected.push(o.error);
      return o;
    },
    password,
    fetch: fetchShim,
  });
  if (!r.ok) {
    const out = { id: c.id, cond: "B", run: n, date: DAY, error: r.error, calls, ms: Date.now() - t0 };
    writeFileSync(`${RAW}/${c.id}-B${n}.json`, JSON.stringify(out, null, 2));
    return out;
  }
  p = applyPlan(p, r.value, { date: DAY, sent: clueRefs(p), photosSent: [], bookOn: true, book: book.map((b) => ({ id: b.id, title: b.title })), sources: `${sourceText(p)}\n${bookText(book)}`, warnings: r.warnings });
  const v = p.plans.at(-1)!;
  const names = namesOf(p, v);
  current = "predict_pattern";
  const q = await callTool({
    system: patternPrompt(),
    user: patternRequest(p.name, v, (s) => plainWords(s, names), patternContext(p, v)),
    tool: PREDICT_PATTERN,
    parse: (x) => {
      const o = parsePattern(x, { steps: v.steps.length });
      if (!o.ok) rejected.push(o.error);
      return o;
    },
    password,
    fetch: fetchShim,
  });
  let prediction: PatternPrediction | undefined;
  let picture: { top: string; section: string; notes: string[] } | undefined;
  if (q.ok) {
    p = setPattern(p, v.version, { date: DAY, prediction: q.value, notes: q.warnings ?? [] }, DAY);
    prediction = q.value;
    if (prediction.applicable) {
      const m = modelOf(prediction, 7);
      const top = await topImage(m, 400, 2);
      const sec = m.section(640, 140, m.row, 2);
      const topFile = `${RAW}/${c.id}-B${n}-top.png`;
      const secFile = `${RAW}/${c.id}-B${n}-section.png`;
      writeFileSync(topFile, encodePng(top.w, top.h, top.data));
      writeFileSync(secFile, encodePng(sec.w, sec.h, sec.data));
      picture = { top: topFile, section: secFile, notes: m.notes };
    }
  }
  const out = {
    id: c.id,
    cond: "B",
    run: n,
    date: DAY,
    ms: Date.now() - t0,
    calls,
    rejected,
    plan: v,
    clueNames: Object.fromEntries(names),
    prediction,
    predictionError: q.ok ? undefined : q.error,
    predictionNotes: q.ok ? q.warnings ?? [] : [],
    picture,
  };
  writeFileSync(`${RAW}/${c.id}-B${n}.json`, JSON.stringify(out, null, 2));
  return out;
}

/** 同時に走らせる数をしぼって回す */
async function pool<T>(jobs: (() => Promise<T>)[], size: number): Promise<PromiseSettledResult<T>[]> {
  const out: PromiseSettledResult<T>[] = new Array(jobs.length);
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const i = next++;
      try {
        out[i] = { status: "fulfilled", value: await jobs[i]() };
      } catch (e) {
        out[i] = { status: "rejected", reason: e };
      }
    }
  }
  await Promise.all(Array.from({ length: size }, worker));
  return out;
}

// ---------- B を、画面に出る文にする（審判と数えに使う） ----------

export function tsuguText(b: any): { steps: string[]; whole: string; pattern: string } {
  const plan = b.plan as RestorePlan | undefined;
  if (!plan) return { steps: [], whole: "", pattern: "" };
  const names: Record<string, string> = b.clueNames ?? {};
  const bookTitle = (id: string) => plan.book.find((x) => x.id === id)?.title ?? "職人の帳面";
  const steps = plan.steps.map((s) => {
    const basis =
      s.basis === "prior"
        ? "もともとの知識から"
        : [s.clue_ids.length ? `手がかり：${s.clue_ids.map((id) => `「${names[id] ?? id}」`).join("")}` : "", s.book_ids?.length ? `職人の帳面：${s.book_ids.map((id) => `「${bookTitle(id)}」`).join("")}` : ""].filter(Boolean).join("、");
    return `${s.title}\n${s.detail}${basis ? `\n（${basis}）` : ""}${s.uncertain ? `\n分からない：${s.uncertain}` : ""}${s.caution ? `\n注意：${s.caution}` : ""}`;
  });
  const pred = b.prediction as PatternPrediction | undefined;
  const pattern = pred
    ? [
        pred.applicable ? "模様の見込み：描く" : "模様の見込み：描かない",
        pred.reason,
        pred.summary,
        pred.applicable ? `絵のための操作（この操作から計算で絵を描いた）：\n${pred.ops.map((o) => `- ${opWords(o)}${o.assumed ? `　仮：${o.assumed}` : ""}`).join("\n")}` : "",
        pred.cannot_show ? `この絵では表せないこと：${pred.cannot_show}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "模様の見込み：（受け取れなかった）";
  const whole = [
    `あらまし：${plan.summary}`,
    "作り方の手順（案）",
    steps.map((s, i) => `${i + 1}. ${s}`).join("\n\n"),
    plan.unknowns.length ? `まだ分からないこと：\n${plan.unknowns.map((u) => `- ${u.what}（${u.why}）`).join("\n")}` : "",
    plan.nextChecks.length ? `次に確かめること：\n${plan.nextChecks.map((x) => `- ${x.what}（${x.why}）`).join("\n")}` : "",
    "できる模様",
    pattern,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { steps, whole, pattern };
}

// ---------- A の答えを手順に分ける ----------

const STEP_HEAD = /^(?:#{1,4}\s*)?(?:\*\*)?\s*(?:手順|工程|ステップ)?\s*([0-9０-９]+|[①-⑳])\s*(?:[.．、)）:：]|\s|\*\*)/;

export function plainSteps(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const steps: string[] = [];
  let cur: string[] | null = null;
  let done = false;
  for (const line of lines) {
    if (done) break;
    const top = !/^\s/.test(line);
    if (top && /^#{1,2}\s/.test(line) && !STEP_HEAD.test(line) && steps.length + (cur ? 1 : 0) > 0) {
      // 手順のあとの大きな見出し（できる模様 など）で手順は終わり（### の小見出しは、手順の中の分かれ道として続ける）
      if (cur) steps.push(cur.join("\n"));
      cur = null;
      done = true;
      break;
    }
    if (top && /できる模様/.test(line) && (steps.length || cur)) {
      if (cur) steps.push(cur.join("\n"));
      cur = null;
      done = true;
      break;
    }
    if (top && STEP_HEAD.test(line)) {
      if (cur) steps.push(cur.join("\n"));
      cur = [line];
    } else if (cur) cur.push(line);
  }
  if (cur) steps.push(cur.join("\n"));
  return steps.map((s) => s.trim()).filter(Boolean);
}

// ---------- 数字を数える ----------

const KANJI: Record<string, number> = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function kanjiNum(s: string): number | null {
  if (!/^[〇一二三四五六七八九十百千]+$/.test(s)) return null;
  let total = 0;
  let cur = 0;
  for (const ch of s) {
    if (ch in KANJI) cur = KANJI[ch];
    else {
      const mul = ch === "十" ? 10 : ch === "百" ? 100 : 1000;
      total += (cur || 1) * mul;
      cur = 0;
    }
  }
  return total + cur;
}
const half = (s: string) => s.replace(/[０-９．]/g, (ch) => (ch === "．" ? "." : String.fromCharCode(ch.charCodeAt(0) - 0xfee0)));

/** 種類ごとの単位（物の量）。数（枚・回など）は別に数える */
const UNIT_KIND: [RegExp, string][] = [
  [/^(?:℃|°C|°|度)$/, "温度・角度"],
  [/^(?:mm|ミリ(?:メートル)?|cm|センチ(?:メートル)?|μm|ミクロン|m)$/, "長さ・厚さ"],
  [/^(?:%|％|パーセント|割|分の)$/, "割合"],
  [/^(?:秒|分間?|時間|日間?|晩|週間|か月|ヶ月|カ月)$/, "時間"],
  [/^(?:g|グラム|kg|キロ)$/, "重さ"],
  [/^(?:番|番手|#)$/, "番手"],
  [/^(?:世紀|年代|年頃|年ごろ)$/, "年代"],
  [/^(?:枚|回|層|本|個|粒|列|段|倍|往復|か所|箇所|つ)$/, "数"],
];
const UNIT_RE = UNIT_KIND.map(([r]) => r.source.slice(4, -2)).join("|");
const NUM_RE = "[0-9０-９]+(?:[.．][0-9０-９]+)?";
const KNUM_RE = "[〇一二三四五六七八九十百千]+";
const ITEM = new RegExp(`(#\\s*${NUM_RE})|((?:${NUM_RE}|${KNUM_RE})(?:\\s*(?:〜|～|~|-|–|から|ー)\\s*(?:${NUM_RE}|${KNUM_RE}))?)\\s*(${UNIT_RE})`, "g");

export interface NumHit {
  text: string;
  kind: string;
  sentence: string;
  why: "clue" | "ledger" | "marked" | "none";
}

function numsIn(s: string): number[] {
  const out: number[] = [];
  for (const m of s.matchAll(new RegExp(`${NUM_RE}|${KNUM_RE}`, "g"))) {
    const v = /[〇一二三四五六七八九十百千]/.test(m[0]) ? kanjiNum(m[0]) : Number(half(m[0]));
    if (v !== null && Number.isFinite(v)) out.push(v);
  }
  return out;
}

/** 手がかりと帳面にある数（帳面は数と単位の組で見る） */
export function sourcesOf(clues: string, ledger: string) {
  const clueNums = new Set(numsIn(clues));
  const ledgerPairs = new Set<string>();
  for (const h of scanRaw(ledger)) for (const v of numsIn(h.num)) ledgerPairs.add(`${v}|${h.kind}`);
  return { clueNums, ledgerPairs };
}

function scanRaw(text: string): { num: string; unit: string; kind: string; text: string; index: number }[] {
  const out: { num: string; unit: string; kind: string; text: string; index: number }[] = [];
  for (const m of text.matchAll(ITEM)) {
    const num = m[1] ? m[1].replace("#", "") : m[2];
    const unit = m[1] ? "#" : m[3];
    // 「一度に」「一つ」のような、ふつうの言葉の一は数えない
    if (/^[一]$/.test(num) || (unit === "つ" && /[〇一二三四五六七八九十]/.test(num) && kanjiNum(num)! < 2)) continue;
    if (unit === "番" && text[(m.index ?? 0) + m[0].length] === "目") continue;
    let kind = UNIT_KIND.find(([r]) => r.test(unit))?.[1] ?? "数";
    // 漢数字は、数のことば（三枚・二回 など）と割・世紀だけ（「十分」「一日」のような、ふつうの言葉を数えない）
    if (/[〇一二三四五六七八九十百千]/.test(num) && kind !== "数" && !/^(?:割|世紀)$/.test(unit)) continue;
    // 「2 度焼く」の度は回数
    if (unit === "度" && Math.max(...numsIn(num)) < 30) kind = "数";
    out.push({ num, unit, kind, text: m[0], index: m.index ?? 0 });
  }
  return out;
}

/** ledger：帳面の数を「根拠あり」と見るか（帳面を渡していない A では見ない。A が帳面を引けたはずはないので） */
export function scanNumbers(text: string, src: ReturnType<typeof sourcesOf>, ledger = true): NumHit[] {
  const hits: NumHit[] = [];
  for (const h of scanRaw(text)) {
    const start = Math.max(text.lastIndexOf("。", h.index), text.lastIndexOf("\n", h.index)) + 1;
    const endA = text.indexOf("。", h.index);
    const endB = text.indexOf("\n", h.index);
    const end = Math.min(endA < 0 ? text.length : endA, endB < 0 ? text.length : endB);
    const sentence = text.slice(start, end).trim();
    const vals = numsIn(h.num);
    let why: NumHit["why"] = "none";
    if (vals.every((v) => src.clueNums.has(v))) why = "clue";
    else if (ledger && vals.every((v) => src.ledgerPairs.has(`${v}|${h.kind}`))) why = "ledger";
    else if (/仮|目安/.test(sentence)) why = "marked";
    hits.push({ text: h.text.trim(), kind: h.kind, sentence: sentence.slice(0, 160), why });
  }
  return hits;
}

// ---------- 根拠の見える手順 ----------

const CLUE_WORDS = /手がかり|覚え書き|書きつけ|書付|メモ|写真|話では|の話|親方|見立て|記録|割れた所|断面|切り口|帳面|持ち主|年寄り/;
const GUESS_WORDS = /仮に?|仮の|推測|推定|手がかりにない|手がかりには(?:ない|書かれていない|無い)|もともと|一般的|ふつうは|通常は|分からない|わからない|不明|確かでない|試して(?:決める|確かめる)/;

/** 文だけで見て、その手順が、どこから来たか（手がかり・帳面・推し量り）を言っているか */
export function saysWhere(step: string, clueTexts: string[]): boolean {
  // 手がかりの番号（C1 など。A にも同じ番号つきの文を渡している）
  if (CLUE_WORDS.test(step) || GUESS_WORDS.test(step) || /(?<![A-Za-z])C\d+/.test(step)) return true;
  // 手がかりの文の一部（6 文字以上）を「」で引いている
  for (const m of step.matchAll(/「([^」]{6,})」/g)) if (clueTexts.some((t) => t.includes(m[1].slice(0, 6)))) return true;
  return false;
}

// ---------- 審判 ----------

const JUDGE_SYSTEM = `あなたは、金工の作り方の答えを、手がかりの点と照らして採点する係です。
答えは 2 つあり、どちらも同じ手がかりから作られました。どちらが誰の答えかは知らせません。2 つを比べて点をつけるのではなく、1 つずつ、同じ物差しで見てください。

見ること：
1. 手がかりの点ごとに、その答えのとおりに作ったら、その点がそうなると言えるか。
   - yes：答えの中で、その点がそうなると示されている（絵がある答えは、絵に見えること、または絵の文に書いてあることで判断する）。
   - partly：一部だけ合う、または、はっきりしない。
   - no：合わない、触れていない、または絵が反対のことを示している。
   絵のある答えは、絵に見えるものを重く見てください。絵と文が食いちがうときは no か partly にして、理由に書いてください。
   絵のない答えは、文で判断します。ただし、文が、物の理屈として起こりにくいこと（例：手順のどこでも表に出ない層の色が見えると言う、削らないのに中の層が出ると言う）を言うときは、yes にしないで、doubtful に書いてください。
2. doubtful：物の理屈として疑わしい言い分（手順と、できると言う見た目が合わない所）を、短く、あるだけ。
3. overclaim：手がかりに無いことを、確かなことのように言い切っている所（数字・材料・名前・歴史など）を、短く、あるだけ。「〜かもしれない」「仮に」のように、分からないと分かる書き方なら入れない。
4. honesty：手がかりが足りない所で、分からない・試して決める、と言っているか。0＝言わずに埋めている、1＝一部だけ言う、2＝足りない所をはっきり言う。

答えは、次の形の JSON だけを書いてください（前後に文を書かない）：
{"answers":[{"label":"答え1","points":[{"point":"P1","verdict":"yes|partly|no","why":"短く"}],"doubtful":["..."],"overclaim":["..."],"honesty":0,"note":"短いまとめ"},{"label":"答え2", ...}]}`;

function seeded(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}

/** pictures＝false：B の絵を渡さず、文だけで見てもらう（絵があるから点が下がったのか、案そのものが弱いのかを分けるため） */
async function judge(c: Case, n: number, pictures = true) {
  const a = JSON.parse(readFileSync(`${RAW}/${c.id}-A${n}.json`, "utf8"));
  const b = JSON.parse(readFileSync(`${RAW}/${c.id}-B${n}.json`, "utf8"));
  const bFirst = seeded(`${c.id}-${n}`) < 0.5;
  const p = projectOf(c);
  const items = bFirst ? [["B", b], ["A", a]] : [["A", a], ["B", b]];
  const content: any[] = [
    {
      type: "text",
      text: `${clueBody(p)}\n\n## 確かめる手がかりの点\n${c.points.map((x, i) => `P${i + 1} ${x}`).join("\n")}`,
    },
  ];
  items.forEach(([cond, r], i) => {
    const label = `答え${i + 1}`;
    if (cond === "A") content.push({ type: "text", text: `## ${label}（文だけ。絵は無い）\n\n${r.text || "（答えが無かった）"}` });
    else {
      const t = tsuguText(r);
      const pic = pictures && r.picture;
      content.push({ type: "text", text: pictures ? `## ${label}（文と、計算で描いた絵${r.picture ? "" : "：この答えは絵を描かなかった"}）\n\n${t.whole || "（答えが無かった）"}` : `## ${label}（文だけ。絵は無い）\n\n${t.whole || "（答えが無かった）"}` });
      if (pic) {
        content.push({ type: "text", text: `${label} の絵：上から見た表` });
        content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync(r.picture.top).toString("base64") } });
        content.push({ type: "text", text: `${label} の絵：断面（横から切った所。上が表）` });
        content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync(r.picture.section).toString("base64") } });
      }
    }
  });
  content.push({ type: "text", text: "JSON だけで答えてください。" });
  let r: { status: number; data: any; ms: number } | undefined;
  let parsed: any;
  for (let tries = 0; tries < 3; tries++) {
    r = await post({ system: JUDGE_SYSTEM, messages: [{ role: "user", content }], tools: [] });
    const t = textOf(r.data);
    const s = t.indexOf("{");
    const e = t.lastIndexOf("}");
    try {
      parsed = JSON.parse(t.slice(s, e + 1));
      if (Array.isArray(parsed.answers) && parsed.answers.length === 2) break;
    } catch {
      parsed = undefined;
    }
  }
  const order = items.map(([cond]) => cond);
  const out = { id: c.id, run: n, order, points: c.points, ms: r?.ms, usage: r?.data?.usage, raw: textOf(r?.data), result: parsed };
  writeFileSync(`${RAW}/${c.id}-judge-${n}${pictures ? "" : "-text"}.json`, JSON.stringify(out, null, 2));
  return out;
}

// ---------- 数える ----------

function score() {
  const cases = allCases().filter((c) => existsSync(`${RAW}/${c.id}-A1.json`));
  const ledger = bookText(book);
  const rows: any[] = [];
  for (const c of cases) {
    const p = projectOf(c);
    const clueTexts = c.clues.map((x) => x.text);
    const src = sourcesOf(clueTexts.join("\n"), ledger);
    for (const file of readdirSync(RAW).filter((f) => new RegExp(`^${c.id}-[AB]\\d+\\.json$`).test(f)).sort()) {
      const r = JSON.parse(readFileSync(`${RAW}/${file}`, "utf8"));
      let whole = "";
      let steps: string[] = [];
      let structured: number | undefined;
      let drew: boolean | undefined;
      let ms = r.ms as number;
      const usage = { in: 0, out: 0, cacheW: 0, cacheR: 0 };
      const add = (u?: Usage) => {
        if (!u) return;
        usage.in += u.input_tokens ?? 0;
        usage.out += u.output_tokens ?? 0;
        usage.cacheW += u.cache_creation_input_tokens ?? 0;
        usage.cacheR += u.cache_read_input_tokens ?? 0;
      };
      if (r.cond === "A") {
        whole = r.text ?? "";
        steps = plainSteps(whole);
        add(r.usage);
      } else {
        const t = tsuguText(r);
        whole = t.whole;
        steps = t.steps;
        const plan = r.plan as RestorePlan | undefined;
        if (plan) structured = plan.steps.filter((s) => s.basis === "prior" || s.clue_ids.length || s.book_ids?.length).length;
        drew = r.prediction ? !!r.prediction.applicable : undefined;
        for (const k of r.calls ?? []) add(k.usage);
      }
      const nums = scanNumbers(whole, src, r.cond === "B");
      const where = steps.filter((s) => saysWhere(s, clueTexts)).length;
      const jf = `${RAW}/${c.id}-judge-${r.run}.json`;
      let jud: any;
      if (existsSync(jf)) {
        const j = JSON.parse(readFileSync(jf, "utf8"));
        const k = (j.order as string[]).indexOf(r.cond);
        jud = j.result?.answers?.[k];
      }
      const verdicts = (jud?.points ?? []).map((x: any) => x.verdict as string);
      const tf = `${RAW}/${c.id}-judge-${r.run}-text.json`;
      let textVerdicts: string[] = [];
      if (existsSync(tf)) {
        const j = JSON.parse(readFileSync(tf, "utf8"));
        textVerdicts = (j.result?.answers?.[(j.order as string[]).indexOf(r.cond)]?.points ?? []).map((x: any) => x.verdict as string);
      }
      rows.push({
        id: c.id,
        name: c.name,
        expect: c.expect,
        cond: r.cond,
        run: r.run,
        error: r.error ?? r.predictionError,
        chars: whole.length,
        steps: steps.length,
        stepsWhere: where,
        stepsStructured: structured,
        drew,
        numbers: nums.length,
        unsourced: nums.filter((x) => x.why === "none" && x.kind !== "数").map((x) => `${x.text}（${x.kind}）`),
        unsourcedCounts: nums.filter((x) => x.why === "none" && x.kind === "数").map((x) => x.text),
        unsourcedHits: nums.filter((x) => x.why === "none"),
        numberHits: nums,
        points: c.points.length,
        yes: verdicts.filter((v: string) => v === "yes").length,
        partly: verdicts.filter((v: string) => v === "partly").length,
        no: verdicts.filter((v: string) => v === "no").length,
        textYes: textVerdicts.filter((v) => v === "yes").length,
        textPartly: textVerdicts.filter((v) => v === "partly").length,
        textNo: textVerdicts.filter((v) => v === "no").length,
        doubtful: jud?.doubtful ?? [],
        overclaim: jud?.overclaim ?? [],
        honesty: jud?.honesty,
        judgeNote: jud?.note,
        ms,
        usage,
      });
    }
  }
  writeFileSync(`${OUT}/results.json`, JSON.stringify(rows, null, 2));
  // あらまし
  const sum = (cond: string, f: (r: any) => number) => rows.filter((r) => r.cond === cond).reduce((a, r) => a + f(r), 0);
  const cnt = (cond: string) => rows.filter((r) => r.cond === cond).length;
  for (const cond of ["A", "B"]) {
    const n = cnt(cond);
    const pts = sum(cond, (r) => (r.yes + r.partly + r.no ? r.points : 0));
    console.log(
      `${cond}：${n} 回　根拠のない数字（量）${sum(cond, (r) => r.unsourced.length)}（1 回あたり ${(sum(cond, (r) => r.unsourced.length) / n).toFixed(1)}）・数のことば ${sum(cond, (r) => r.unsourcedCounts.length)}　手順 ${sum(cond, (r) => r.steps)} のうち、文で根拠が見える ${sum(cond, (r) => r.stepsWhere)}${cond === "B" ? `・記録で根拠がある ${sum(cond, (r) => r.stepsStructured ?? 0)}` : ""}　手がかりの点 yes ${sum(cond, (r) => r.yes)}/${pts}・partly ${sum(cond, (r) => r.partly)}・no ${sum(cond, (r) => r.no)}　疑わしい ${sum(cond, (r) => r.doubtful.length)}・言い切り ${sum(cond, (r) => r.overclaim.length)}　正直さ ${(sum(cond, (r) => r.honesty ?? 0) / n).toFixed(2)}　平均 ${(sum(cond, (r) => r.ms) / n / 1000).toFixed(0)} 秒`,
    );
  }
}


// ---------- まとめの絵（docs/compare/summary.png） ----------

/** 1 回あたりの費用（ドル）。Claude Opus 5.5 の値段：入力 $4・出力 $20・キャッシュから読む $0.20・キャッシュに書く $5（100 万トークンあたり。2026-11-08 の claude-api の資料） */
const PRICE = { in: 4, out: 20, cacheR: 0.2, cacheW: 5 };
export const costOf = (u: { in: number; out: number; cacheR: number; cacheW: number }) => (u.in * PRICE.in + u.out * PRICE.out + u.cacheR * PRICE.cacheR + u.cacheW * PRICE.cacheW) / 1e6;

export function aggregate(rows: any[]) {
  const by = (cond: string) => rows.filter((r) => r.cond === cond);
  const f = (cond: string) => {
    const rs = by(cond);
    const n = rs.length || 1;
    const steps = rs.reduce((a, r) => a + r.steps, 0);
    const judged = rs.filter((r) => r.yes + r.partly + r.no > 0);
    const pts = judged.reduce((a, r) => a + r.points, 0) || 1;
    return {
      runs: rs.length,
      unsourcedPerRun: rs.reduce((a, r) => a + r.unsourced.length, 0) / n,
      unsourcedRunsZero: rs.filter((r) => r.unsourced.length === 0).length,
      countsPerRun: rs.reduce((a, r) => a + r.unsourcedCounts.length, 0) / n,
      stepsWherePct: (100 * rs.reduce((a, r) => a + r.stepsWhere, 0)) / (steps || 1),
      yesPct: (100 * judged.reduce((a, r) => a + r.yes, 0)) / pts,
      partlyPct: (100 * judged.reduce((a, r) => a + r.partly, 0)) / pts,
      noPct: (100 * judged.reduce((a, r) => a + r.no, 0)) / pts,
      textYesPct: (100 * rs.reduce((a, r) => a + (r.textYes ?? 0), 0)) / (rs.filter((r) => r.textYes + r.textPartly + r.textNo > 0).reduce((a, r) => a + r.points, 0) || 1),
      overclaimLedgerPerRun: judged.reduce((a, r) => a + r.overclaim.filter((o: string) => /帳面|工房/.test(o)).length, 0) / (judged.length || 1),
      doubtfulPerRun: judged.reduce((a, r) => a + r.doubtful.length, 0) / (judged.length || 1),
      overclaimPerRun: judged.reduce((a, r) => a + r.overclaim.length, 0) / (judged.length || 1),
      honesty: judged.reduce((a, r) => a + (r.honesty ?? 0), 0) / (judged.length || 1),
      secPerRun: rs.reduce((a, r) => a + r.ms, 0) / n / 1000,
      costPerRun: rs.reduce((a, r) => a + costOf(r.usage), 0) / n,
      chars: rs.reduce((a, r) => a + r.chars, 0) / n,
    };
  };
  return { A: f("A"), B: f("B") };
}

async function chart() {
  const rows = JSON.parse(readFileSync(`${OUT}/results.json`, "utf8"));
  const g = aggregate(rows);
  const panels: { title: string; note: string; bars: [string, number, string][]; fmt: (v: number) => string; max: number }[] = [
    { title: "根拠のない数字が出た答え（30 回のうち）", note: "温度・長さ・時間・割合など。手がかりに無く（B は帳面にも無く）、仮・目安とも書いていない数字。どちらもほとんど無い", bars: [["A　Claude だけ", g.A.runs - g.A.unsourcedRunsZero, "var(--a)"], ["B　継ぐ", g.B.runs - g.B.unsourcedRunsZero, "var(--b)"]], fmt: (v) => `${v} 回`, max: g.A.runs },
    { title: "どこから来たかが見える手順", note: "手がかり・帳面・推し量りのどれから来たかを、その手順の文で言っている割合。多いほどよい", bars: [["A　Claude だけ", g.A.stepsWherePct, "var(--a)"], ["B　継ぐ", g.B.stepsWherePct, "var(--b)"]], fmt: (v) => `${Math.round(v)}%`, max: 100 },
    { title: "手がかりの点に「合う」（審判の Claude）", note: "文だけで見ると A が上。B の絵で見ると下がる。絵は、文の言い分のうち計算で出なかった所を見せる", bars: [["A　文で", g.A.yesPct, "var(--a)"], ["B　文で", g.B.textYesPct, "var(--b)"], ["B　絵で", g.B.yesPct, "var(--b2)"]], fmt: (v) => `${Math.round(v)}%`, max: 100 },
    { title: "分からない所を、分からないと言うか（審判・0〜2）", note: "0＝言わずに埋める、1＝一部だけ、2＝足りない所をはっきり言う。多いほどよい", bars: [["A　Claude だけ", g.A.honesty, "var(--a)"], ["B　継ぐ", g.B.honesty, "var(--b)"]], fmt: (v) => v.toFixed(2), max: 2 },
    { title: "手がかりに無いことの言い切り（審判・1 回あたり）", note: "B の数の多くは、渡した帳面を審判が知らずに数えたもの。少ないほどよい", bars: [["A　Claude だけ", g.A.overclaimPerRun, "var(--a)"], ["B　継ぐ", g.B.overclaimPerRun, "var(--b)"]], fmt: (v) => v.toFixed(1), max: Math.max(g.A.overclaimPerRun, g.B.overclaimPerRun) },
    { title: "1 回の待ち時間", note: "B は 2 回呼ぶ（案と模様の見込み）。少ないほどよい", bars: [["A　Claude だけ", g.A.secPerRun, "var(--a)"], ["B　継ぐ", g.B.secPerRun, "var(--b)"]], fmt: (v) => `${Math.round(v)} 秒`, max: Math.max(g.A.secPerRun, g.B.secPerRun) },
  ];
  const W = 1080;
  const bar = (label: string, v: number, max: number, color: string, text: string) =>
    `<div class="row"><div class="lab">${label}</div><div class="track"><div class="bar" style="width:${Math.max(0.6, (v / max) * 100)}%;background:${color}"></div></div><div class="val">${text}</div></div>`;
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
  :root{--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--grid:#e4e3df;--a:#eb6834;--b:#2a78d6;--b2:repeating-linear-gradient(135deg,#2a78d6 0 8px,#9cc0ec 8px 14px)}
  body{margin:0;background:var(--surface);color:var(--ink);font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN",sans-serif;width:${W}px}
  .wrap{padding:56px 56px 40px}
  h1{font-size:46px;margin:0 0 10px;font-weight:700;letter-spacing:.02em}
  .sub{font-size:26px;color:var(--ink2);margin:0 0 34px;line-height:1.5}
  .legend{display:flex;gap:36px;font-size:28px;margin-bottom:30px}
  .legend span{display:inline-flex;align-items:center;gap:12px}
  .sw{width:28px;height:28px;border-radius:4px;display:inline-block}
  .panel{border-top:2px solid var(--grid);padding:26px 0 22px}
  h2{font-size:32px;margin:0 0 6px;font-weight:700}
  .note{font-size:22px;color:var(--ink2);margin:0 0 18px;line-height:1.45}
  .row{display:flex;align-items:center;gap:16px;margin:10px 0}
  .lab{width:210px;font-size:26px;color:var(--ink2)}
  .track{flex:1;height:40px;position:relative}
  .bar{height:40px;border-radius:0 4px 4px 0}
  .val{width:150px;font-size:32px;font-weight:700;text-align:right;font-variant-numeric:tabular-nums}
  .foot{font-size:21px;color:var(--ink2);line-height:1.5;margin-top:18px;border-top:2px solid var(--grid);padding-top:20px}
  </style></head><body><div class="wrap">
  <h1>継ぐ がある時と、Claude だけの時</h1>
  <p class="sub">架空の技 ${rows.filter((r: any) => r.cond === "A" && r.run === 1).length} 個 × 2 回ずつ。同じモデル（Claude Opus 5.5）・同じ手がかりの文。A はふつうに 1 回聞く。B は帳面と道具と模様の計算を通す。2026-11-08</p>
  <div class="legend"><span><i class="sw" style="background:var(--a)"></i>A　Claude だけ</span><span><i class="sw" style="background:var(--b)"></i>B　継ぐ</span></div>
  ${panels.map((p) => `<div class="panel"><h2>${p.title}</h2><p class="note">${p.note}</p>${p.bars.map(([l, v, c]) => bar(l, v, p.max, c, p.fmt(v))).join("")}</div>`).join("")}
  <div class="foot">数が少ない試し（1 つの条件で ${g.A.runs} 回）。審判も Claude。技はどれも作り話で、本当の答えは無い。くわしくは docs/compare/README.md</div>
  </div></body></html>`;
  const tmp = `${RAW}/../summary.html`;
  writeFileSync(tmp, html);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: 800 }, deviceScaleFactor: 1 });
  await page.goto(`file://${process.cwd()}/${tmp}`);
  await page.screenshot({ path: `${OUT}/summary.png`, fullPage: true });
  await browser.close();
  console.log(JSON.stringify(g, null, 2));
}

// ---------- 入口 ----------

const [cmd, envPath, ...rest] = process.argv.slice(2);
mkdirSync(RAW, { recursive: true });
if (cmd === "score") {
  score();
  process.exit(0);
}
if (cmd === "chart") {
  await chart();
  process.exit(0);
}
if (!envPath || !["run", "judge"].includes(cmd)) {
  console.error("使い方：npx tsx scripts/compare-plain.ts run|judge <.env のある所> [--runs 2] [--only A|B] [技の id ...]　／　npx tsx scripts/compare-plain.ts score");
  process.exit(1);
}
loadEnv(envPath);
let runs = 2;
let only: string | undefined;
let noPicture = false;
const pick: string[] = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === "--runs") runs = Number(rest[++i]);
  else if (rest[i] === "--only") only = rest[++i];
  else if (rest[i] === "--no-picture") noPicture = true;
  else pick.push(rest[i]);
}
const cases = allCases().filter((c) => !pick.length || pick.includes(c.id));
const jobs: (() => Promise<unknown>)[] = [];
for (const c of cases)
  for (let n = 1; n <= runs; n++) {
    if (cmd === "judge") jobs.push(() => judge(c, n, !noPicture));
    else {
      if (only !== "B") jobs.push(() => runPlain(c, n));
      if (only !== "A") jobs.push(() => runTsugu(c, n));
    }
  }
const t0 = Date.now();
const res = await pool(jobs, 8);
res.forEach((r) => {
  if (r.status === "rejected") console.error("失敗：", String(r.reason));
  else {
    const v = r.value as any;
    console.log(`${v.id}${v.cond ? `-${v.cond}${v.run}` : `-judge-${v.run}`}：${v.error || v.predictionError ? `失敗 ${v.error ?? v.predictionError}` : "ok"}・${Math.round((v.ms ?? 0) / 1000)} 秒`);
  }
});
console.log(`全部で ${Math.round((Date.now() - t0) / 1000)} 秒`);
