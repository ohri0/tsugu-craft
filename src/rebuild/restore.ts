// 「自分の技を組み立て直す」の記録：答えのない技について、手がかり・Claude の案・職人の試した結果を持つ。
// 力試し（木目金。src/rebuild/material.ts）とちがって、答え合わせはない。工程を確かにできるのは、職人の試した結果だけ。
// 画面に依存しない、純粋な関数だけを置く。保存は src/app/restore-store.ts。
import type { Basis, Confidence, HypothesisStep } from "./tools";

export type ClueKind = "object" | "record" | "material" | "opinion";

/** 手がかりの種類（並べる順） */
export const CLUE_KINDS: Record<ClueKind, { label: string; hint: string }> = {
  object: { label: "残った品物", hint: "どんな品か。形・色・手ざわり・傷・裏側など、見て分かること" },
  record: { label: "古い記録", hint: "書いてある文を、そのまま。読めない所は、読めないと書く" },
  material: { label: "金属・道具", hint: "使われた金属や道具。分かっている物、一緒に見つかった物" },
  opinion: { label: "職人の見立て", hint: "職人が見て、こうではないかと思うこと。なぜそう思うかも" },
};
export const CLUE_KIND_IDS = Object.keys(CLUE_KINDS) as ClueKind[];

/** 入れられる長さの上限（読み込んだ記録にも使う） */
export const TEXT_LIMITS = { name: 40, title: 60, text: 4000, source: 300, note: 2000 } as const;

export interface PhotoMeta {
  w: number;
  h: number;
  /** ファイルの大きさ（バイト） */
  bytes: number;
}

export interface RestoreClue {
  /** C1 など。消しても番号は使い回さない（前の案の根拠の番号が別の手がかりを指さないように） */
  id: string;
  kind: ClueKind;
  title: string;
  text: string;
  /** どこで見たか（本の名前・持ち主・聞いた人など） */
  source?: string;
  /** 写真の本体は重いので、別の置き場（src/app/restore-store.ts）に置く */
  photo?: PhotoMeta;
  date: string;
}

export type Outcome = "ok" | "ng" | "pending";

/** 職人の、工程ごとの試した結果。案ごとに 1 つ */
export interface TrialResult {
  /** T1 など。手がかりとして Claude に渡すときの番号 */
  id: string;
  stepKey: string;
  stepTitle: string;
  planVersion: number;
  outcome: Outcome;
  note: string;
  date: string;
}

export type StepChange = "same" | "changed" | "new";

export interface PlanStep extends HypothesisStep {
  /** 案が変わっても、同じ工程なら同じ印（結果と前の案をたどるため） */
  key: string;
  /** 危ない物や作業の注意 */
  caution?: string;
  change: StepChange;
  /** 前の案の何番目から続くか（1 から。新しい工程にはない） */
  prevStep?: number;
  changeNote?: string;
  /** 手がかりにない数字（職人の言葉にも資料にもない。試すまで使わない） */
  unsourced?: string[];
}

export interface DroppedStep {
  key: string;
  title: string;
  /** やめた理由（Claude が書かなかったときは空） */
  why: string;
}

export interface UnknownPoint {
  what: string;
  why: string;
  /** 関わる工程の番号（1 から）。全体のことなら 0 */
  step: number;
}

export type CheckKind = "trial" | "research" | "ask";
export const CHECK_KINDS: Record<CheckKind, string> = { trial: "試作", research: "調べる", ask: "人に聞く" };

export interface NextCheck {
  what: string;
  why: string;
  kind: CheckKind;
  step: number;
  caution?: string;
  unsourced?: string[];
}

export interface PlanClueRef {
  id: string;
  title: string;
}

export interface RestorePlan {
  /** 案 1、案 2、… */
  version: number;
  date: string;
  steps: PlanStep[];
  dropped: DroppedStep[];
  unknowns: UnknownPoint[];
  nextChecks: NextCheck[];
  summary: string;
  /** 前の案からの違いのあらまし */
  changes: string;
  /** この案に渡した手がかりと結果の控え（消したあとでも、何を渡したか分かるように） */
  clues: PlanClueRef[];
  /** 写真を渡した手がかりの番号 */
  photosSent: string[];
  /** 受け取るときに気づいたこと（無い番号を外した、言い切りの言葉があった など） */
  notes: string[];
}

/**
 * この技の決まり：職人が試して確かめた工程から作った決まり。この記録の中だけに持つ。
 * 指輪の帳面（src/rules/ledger.ts）には入れないので、指輪の設計の確かめと、学ぶの答えには混ざらない。
 */
export interface TechRule {
  /** R1 など。消しても番号は使い回さない */
  id: string;
  stepKey: string;
  stepTitle: string;
  planVersion: number;
  title: string;
  text: string;
  reason: string;
  /** 職人の言葉そのまま */
  quote?: string;
  /** 職人の名前 */
  by: string;
  date: string;
}

export interface RestoreProject {
  id: string;
  name: string;
  /** 作り話の例（research/restore/sample.json）。画面に「これは作り話の例です」と出す */
  sample?: boolean;
  created: string;
  updated: string;
  clues: RestoreClue[];
  plans: RestorePlan[];
  results: TrialResult[];
  /** この技の決まり */
  rules: TechRule[];
  nextClue: number;
  nextResult: number;
  nextStep: number;
  nextRule: number;
}

/** Claude が出した案（src/rebuild/restore-tools.ts で確かめたあとの形） */
export interface RestorationOutput {
  steps: (HypothesisStep & { caution?: string; prev_step: number; change: StepChange; change_note?: string })[];
  dropped: { prev_step: number; why: string }[];
  unknowns: UnknownPoint[];
  next_checks: Omit<NextCheck, "unsourced">[];
  summary: string;
  changes: string;
}

export function newProject(id: string, name: string, date: string): RestoreProject {
  return { id, name: name.trim().slice(0, TEXT_LIMITS.name), created: date, updated: date, clues: [], plans: [], results: [], rules: [], nextClue: 1, nextResult: 1, nextStep: 1, nextRule: 1 };
}

export function renameProject(p: RestoreProject, name: string, date: string): RestoreProject {
  const clean = name.trim().slice(0, TEXT_LIMITS.name);
  return clean ? { ...p, name: clean, updated: date } : p;
}

export interface ClueInput {
  kind: ClueKind;
  title?: string;
  text: string;
  source?: string;
  photo?: PhotoMeta;
}

/** 見出しを書かなかったときは、本文の頭から作る */
function titleFrom(text: string, photo: boolean): string {
  const first = text.split(/\r?\n/)[0].trim();
  if (!first) return photo ? "写真" : "";
  return first.length > 24 ? `${first.slice(0, 24)}…` : first;
}

/** 手がかりを 1 つ足す。文も写真もなければ足さない */
export function addClue(p: RestoreProject, input: ClueInput, date: string): { project: RestoreProject; clue: RestoreClue } | { error: string } {
  const text = input.text.trim().slice(0, TEXT_LIMITS.text);
  if (!text && !input.photo) return { error: "手がかりの文を書くか、写真をつけてください。" };
  const clue: RestoreClue = {
    id: `C${p.nextClue}`,
    kind: input.kind,
    title: (input.title?.trim() || titleFrom(text, !!input.photo)).slice(0, TEXT_LIMITS.title),
    text,
    date,
  };
  const source = input.source?.trim().slice(0, TEXT_LIMITS.source);
  if (source) clue.source = source;
  if (input.photo) clue.photo = input.photo;
  return { project: { ...p, clues: [...p.clues, clue], nextClue: p.nextClue + 1, updated: date }, clue };
}

/** 手がかりを消す。これまでの案は記録として残す（どの案が何を見たかは変わらない） */
export function removeClue(p: RestoreProject, id: string, date: string): RestoreProject {
  return { ...p, clues: p.clues.filter((c) => c.id !== id), updated: date };
}

/** 手がかりとして渡す結果（「まだ」で言葉もないものは渡さない） */
export function usableResults(p: RestoreProject): TrialResult[] {
  return p.results.filter((r) => r.outcome !== "pending" || r.note.trim() !== "");
}

/** Claude が引いてよい番号 */
export function knownClueIds(p: RestoreProject): string[] {
  return [...p.clues.map((c) => c.id), ...usableResults(p).map((r) => r.id)];
}

/** 案に渡す手がかりと結果の控え */
export function clueRefs(p: RestoreProject): PlanClueRef[] {
  return [...p.clues.map((c) => ({ id: c.id, title: c.title })), ...usableResults(p).map((r) => ({ id: r.id, title: `試した結果：${r.stepTitle}` }))];
}

/** 工程の試した結果を残す（同じ案の同じ工程なら書き直す）。「まだ」で言葉もなければ消す */
export function setResult(p: RestoreProject, plan: RestorePlan, step: PlanStep, input: { outcome: Outcome; note: string }, date: string): RestoreProject {
  const note = input.note.trim().slice(0, TEXT_LIMITS.note);
  const same = (r: TrialResult) => r.stepKey === step.key && r.planVersion === plan.version;
  const before = p.results.find(same);
  if (input.outcome === "pending" && !note) {
    return before ? { ...p, results: p.results.filter((r) => !same(r)), updated: date } : p;
  }
  if (before) {
    return { ...p, results: p.results.map((r) => (same(r) ? { ...r, outcome: input.outcome, note, stepTitle: step.title, date } : r)), updated: date };
  }
  const added: TrialResult = { id: `T${p.nextResult}`, stepKey: step.key, stepTitle: step.title, planVersion: plan.version, outcome: input.outcome, note, date };
  return { ...p, results: [...p.results, added], nextResult: p.nextResult + 1, updated: date };
}

/** この案のこの工程の結果。「そのまま」の工程には、前の案の結果を引き継ぐ */
export function resultFor(p: RestoreProject, plan: RestorePlan, step: PlanStep): { result: TrialResult; carried: boolean } | null {
  const own = p.results.find((r) => r.stepKey === step.key && r.planVersion === plan.version);
  if (own) return { result: own, carried: false };
  if (step.change !== "same") return null;
  const older = p.plans.filter((x) => x.version < plan.version).reverse();
  for (const v of older) {
    const r = p.results.find((x) => x.stepKey === step.key && x.planVersion === v.version);
    if (r) return { result: r, carried: true };
    const s = v.steps.find((x) => x.key === step.key);
    if (s?.change !== "same") break;
  }
  return null;
}

/** 前の案までの、この工程の結果（新しい順） */
export function pastResults(p: RestoreProject, plan: RestorePlan, step: PlanStep): TrialResult[] {
  return p.results.filter((r) => r.stepKey === step.key && r.planVersion < plan.version).sort((a, b) => b.planVersion - a.planVersion);
}

/** 確かめた工程を、この技の決まりにする */
export function addTechRule(p: RestoreProject, plan: RestorePlan, step: PlanStep, input: { title: string; text: string; reason: string; quote?: string; by: string }, date: string): RestoreProject {
  const rule: TechRule = {
    id: `R${p.nextRule}`,
    stepKey: step.key,
    stepTitle: step.title,
    planVersion: plan.version,
    title: input.title.trim().slice(0, TEXT_LIMITS.title),
    text: input.text.trim().slice(0, TEXT_LIMITS.text),
    reason: input.reason.trim().slice(0, TEXT_LIMITS.text),
    by: input.by,
    date,
  };
  const quote = input.quote?.trim();
  if (quote) rule.quote = quote.slice(0, TEXT_LIMITS.note);
  return { ...p, rules: [...p.rules, rule], nextRule: p.nextRule + 1, updated: date };
}

export function removeTechRule(p: RestoreProject, id: string, date: string): RestoreProject {
  return { ...p, rules: p.rules.filter((r) => r.id !== id), updated: date };
}

/** 前の案のあとに増えた・減った手がかりと結果の数（「もう一度組み立て直す」に出す） */
export function freshSince(p: RestoreProject): { clues: number; results: number; removed: number } {
  const last = p.plans.at(-1);
  if (!last) return { clues: p.clues.length, results: 0, removed: 0 };
  const seen = new Set(last.clues.map((c) => c.id));
  const now = new Set(knownClueIds(p));
  return {
    clues: p.clues.filter((c) => !seen.has(c.id)).length,
    results: usableResults(p).filter((r) => !seen.has(r.id)).length,
    removed: last.clues.filter((c) => !now.has(c.id)).length,
  };
}

// ---- 画面の流れ：① 分かることを入れる → ② Claude が作り方の案を出す → ③ 試して、結果を入れる ----

export type Stage = 1 | 2 | 3;

/** この技が、流れのどこまで来ているか */
export function stageOf(p: RestoreProject): Stage {
  if (!p.clues.length) return 1;
  return p.plans.length ? 3 : 2;
}

/** 開いたときに見せる所：案があれば案、なければ入れる所 */
export const firstView = (p: RestoreProject): Stage => (p.plans.length ? 2 : 1);

export type NextAct = { do: "plan" | "view"; view?: Stage; label: string } | { do: "none" };

/** 次に押す 1 つのボタン。見ている所（view）で変わる。なければ none（③ で結果を待つときなど） */
export function nextAct(p: RestoreProject, view: Stage): NextAct {
  if (!p.clues.length) return view === 1 ? { do: "none" } : { do: "view", view: 1, label: "分かることを入れる" };
  if (!p.plans.length) return { do: "plan", label: "Claude に案を出してもらう" };
  const fresh = freshSince(p);
  if (fresh.results) return { do: "plan", label: "結果を入れて、案を出し直す" };
  if (fresh.clues || fresh.removed) return { do: "plan", label: "入れたことを足して、案を出し直す" };
  if (view === 1) return { do: "view", view: 2, label: "次へ：案を見る" };
  if (view === 2) return { do: "view", view: 3, label: "次へ：試して、結果を入れる" };
  return { do: "none" };
}

/** ③ で「次はこれ」と示す工程（まだ結果のない最初の工程）の順番。全部あれば -1 */
export function nextUntried(p: RestoreProject, plan: RestorePlan): number {
  return plan.steps.findIndex((s) => !resultFor(p, plan, s));
}

/** この案の前の案（なければ undefined） */
export const previousPlan = (p: RestoreProject, plan: RestorePlan): RestorePlan | undefined => p.plans[p.plans.indexOf(plan) - 1];

// ---- 人に見せる言葉：番号（C1・T2）は見せず、名前で ----

/** 番号 → 人に見せる名前。消した手がかりは、案の控えから */
export function namesOf(p: RestoreProject): Map<string, string> {
  const names = new Map<string, string>();
  const label = (id: string, title: string) => (id.startsWith("T") ? `「${title.replace(/^試した結果：/, "")}」の結果` : title);
  for (const v of p.plans) for (const c of v.clues) names.set(c.id, label(c.id, c.title));
  for (const c of p.clues) names.set(c.id, c.title);
  for (const r of p.results) names.set(r.id, label(r.id, r.stepTitle));
  return names;
}

/**
 * Claude の文を、人に見せる言葉に直す（画面に出すときだけ。記録の中身は変えない）。
 * 番号 → 名前、「工程」→「手順」、「手がかり」→「入れたこと」。
 */
export function plainWords(text: string, names: ReadonlyMap<string, string>): string {
  const fallback = (kind: string) => (kind === "T" ? "試した結果" : "入れたこと");
  return text
    .replace(/ ?([CT])\d+\s*[〜～~ー-]\s*\1?\d+ ?/g, (_m, kind: string) => fallback(kind))
    .replace(/ ?\b[CT]\d+\b ?/g, (hit) => {
      const id = hit.trim();
      const name = names.get(id);
      if (!name) return fallback(id[0]);
      return id[0] === "T" ? name : `「${name}」`;
    })
    .replace(/工程/g, "手順")
    .replace(/手がかり/g, "入れたこと");
}

/** 例の中の印（【架空】）を画面では外す。例には「これは作り話の例です」の札が 1 つあるので。記録の中には残す */
export const withoutMark = (text: string): string => text.replace(/【架空】\s*/g, "").replace(/架空の/g, "");

// ---- 数字と言い切りの見張り（CLAUDE.md：出典のない数字は作らない。答えのない技で、確かな作り方だと言わない） ----

const KANJI_DIGIT: Record<string, number> = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const KANJI_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };

function zen2han(s: string): string {
  return s.replace(/[０-９．％]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/** 漢数字の値：「三」3、「二十五」25、「三百五十」350 */
function kanjiValue(s: string): number {
  let total = 0;
  let cur = 0;
  for (const ch of s) {
    if (ch in KANJI_UNIT) {
      total += (cur || 1) * KANJI_UNIT[ch];
      cur = 0;
    } else {
      cur = cur * 10 + KANJI_DIGIT[ch];
    }
  }
  return total + cur;
}

/** 文の中の数（単位は見ない）。古い記録の「三度」「二十日」のために、漢数字も読む */
function numbersIn(text: string): Set<number> {
  const s = zen2han(text);
  const out = new Set<number>();
  for (const m of s.matchAll(/\d+(?:\.\d+)?/g)) out.add(Number(m[0]));
  for (const m of s.matchAll(/[〇一二三四五六七八九十百千]+/g)) out.add(kanjiValue(m[0]));
  return out;
}

const UNIT_RE = /(\d+(?:\.\d+)?)\s*(℃|°C|度|mm|ミリ|cm|センチ|μm|ミクロン|%|パーセント|割|時間|分|秒|日|週間|か月|ヶ月|kg|キロ|g|グラム|倍|枚|層|回)/g;
/** 1〜2 枚・2 回のような数は、作り方の値というより言葉のあやなので見ない */
const COUNT_UNITS = new Set(["枚", "層", "回", "倍", "度"]);

/** 工程の文にある、手がかりにない数字（単位つきのものだけ見る） */
export function unsourcedNumbers(text: string, sources: string): string[] {
  const known = numbersIn(sources);
  const out: string[] = [];
  for (const m of zen2han(text).matchAll(UNIT_RE)) {
    const v = Number(m[1]);
    if (known.has(v)) continue;
    if (COUNT_UNITS.has(m[2]) && v <= 2) continue;
    const label = `${m[1]} ${m[2]}`;
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

const ASSERTIVE = /確実|間違いな|まちがいな|正しい作り方|本当の作り方(?!は分か|は分から|は残|ではな)|確かな作り方(?!では|とは)|これが答え/;

/** 言い切りの言葉があるか（答えのない技なので、案として読んでもらう） */
export function isAssertive(text: string): boolean {
  return ASSERTIVE.test(text);
}

/** 手がかりと職人の言葉を 1 つの文に（数字の見張りに使う） */
export function sourceText(p: RestoreProject): string {
  return [...p.clues.flatMap((c) => [c.title, c.text, c.source ?? ""]), ...usableResults(p).map((r) => r.note)].join("\n");
}

// ---- 案を受け取る ----

export interface PlanContext {
  date: string;
  /** 渡した手がかりと結果の控え */
  sent: PlanClueRef[];
  photosSent: string[];
  /** 渡した手がかりの文 */
  sources: string;
  warnings?: string[];
}

/** Claude の案を、新しい案として記録に足す（前の案は消さない） */
export function applyPlan(p: RestoreProject, out: RestorationOutput, ctx: PlanContext): RestoreProject {
  const prev = p.plans.at(-1);
  let nextStep = p.nextStep;
  const used = new Set<string>();
  const notes = [...(ctx.warnings ?? [])];

  const steps: PlanStep[] = out.steps.map((s, i) => {
    const from = s.prev_step > 0 ? prev?.steps[s.prev_step - 1] : undefined;
    // 1 つの工程を 2 つに分けたときは、前の工程の印を先の 1 つだけが引き継ぐ
    let key = from?.key;
    if (!key || used.has(key)) key = `s${nextStep++}`;
    used.add(key);
    const unsourced = unsourcedNumbers(`${s.title}\n${s.detail}`, ctx.sources);
    if (isAssertive(`${s.title}\n${s.detail}`)) notes.push(`工程 ${i + 1} に、言い切りの言葉があります。案として読んでください。`);
    const step: PlanStep = {
      title: s.title,
      detail: s.detail,
      clue_ids: s.clue_ids,
      basis: s.basis,
      confidence: s.confidence,
      key,
      change: from ? s.change : "new",
    };
    if (s.uncertain) step.uncertain = s.uncertain;
    if (s.caution) step.caution = s.caution;
    if (from) step.prevStep = s.prev_step;
    if (from && s.change_note) step.changeNote = s.change_note;
    if (unsourced.length) step.unsourced = unsourced;
    return step;
  });

  const dropped: DroppedStep[] = out.dropped.flatMap((d) => {
    const s = prev?.steps[d.prev_step - 1];
    return s ? [{ key: s.key, title: s.title, why: d.why }] : [];
  });

  const nextChecks: NextCheck[] = out.next_checks.map((c) => {
    const unsourced = unsourcedNumbers(c.what, ctx.sources);
    return unsourced.length ? { ...c, unsourced } : { ...c };
  });

  if (isAssertive(out.summary)) notes.push("あらましに、言い切りの言葉があります。案として読んでください。");

  const plan: RestorePlan = {
    version: (prev?.version ?? 0) + 1,
    date: ctx.date,
    steps,
    dropped,
    unknowns: out.unknowns,
    nextChecks,
    summary: out.summary,
    changes: out.changes,
    clues: ctx.sent,
    photosSent: ctx.photosSent,
    notes,
  };
  return { ...p, plans: [...p.plans, plan], nextStep, updated: ctx.date };
}

/** 前の案とのちがいの数。最初の案なら null */
export function planDiff(plan: RestorePlan): { same: number; changed: number; added: number; dropped: number } | null {
  if (plan.version <= 1) return null;
  const count = (c: StepChange) => plan.steps.filter((s) => s.change === c).length;
  return { same: count("same"), changed: count("changed"), added: count("new"), dropped: plan.dropped.length };
}

/** 一覧に出す数 */
export function projectCounts(p: RestoreProject): { clues: number; plans: number; ok: number; ng: number; rules: number } {
  return { clues: p.clues.length, plans: p.plans.length, rules: p.rules.length, ok: p.results.filter((r) => r.outcome === "ok").length, ng: p.results.filter((r) => r.outcome === "ng").length };
}

// ---- 書き出しと読み込み ----

export const FILE_FORMAT = "tsugu-restore";
export const FILE_VERSION = 1;
/** 読み込む写真の base64 の長さの上限（1 枚） */
export const IMPORT_PHOTO_CHARS = 12_000_000;

export interface PhotoFile {
  media: string;
  /** base64（data: は付けない） */
  data: string;
}

export interface RestoreFile {
  format: typeof FILE_FORMAT;
  version: typeof FILE_VERSION;
  exported: string;
  project: RestoreProject;
  photos: Record<string, PhotoFile>;
}

export function toFile(p: RestoreProject, photos: Record<string, PhotoFile>, date: string): RestoreFile {
  return { format: FILE_FORMAT, version: FILE_VERSION, exported: date, project: p, photos };
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 8000): string => (typeof v === "string" ? v.slice(0, max) : "");
const optStr = (v: unknown, max = 8000): string | undefined => (typeof v === "string" && v.trim() ? v.slice(0, max) : undefined);
const int = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : fallback);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateOr = (v: unknown, fallback: string): string => (typeof v === "string" && DATE.test(v) ? v : fallback);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const CLUE_ID = /^C\d+$/;
const RESULT_ID = /^T\d+$/;
const STEP_KEY = /^s\d+$/;
const RULE_ID = /^R\d+$/;
const numAfter = (id: string) => Number(id.slice(1));

function readClue(v: unknown, fallbackDate: string): RestoreClue | null {
  if (!isRec(v) || typeof v.id !== "string" || !CLUE_ID.test(v.id)) return null;
  const text = str(v.text, TEXT_LIMITS.text);
  const photo = isRec(v.photo) ? { w: int(v.photo.w), h: int(v.photo.h), bytes: int(v.photo.bytes) } : undefined;
  if (!text.trim() && !photo) return null;
  const clue: RestoreClue = {
    id: v.id,
    kind: CLUE_KIND_IDS.includes(v.kind as ClueKind) ? (v.kind as ClueKind) : "object",
    title: str(v.title, TEXT_LIMITS.title) || titleFrom(text, !!photo),
    text,
    date: dateOr(v.date, fallbackDate),
  };
  const source = optStr(v.source, TEXT_LIMITS.source);
  if (source) clue.source = source;
  if (photo) clue.photo = photo;
  return clue;
}

function readStep(v: unknown): PlanStep | null {
  if (!isRec(v) || typeof v.key !== "string" || !STEP_KEY.test(v.key)) return null;
  const title = str(v.title);
  const detail = str(v.detail);
  if (!title || !detail) return null;
  const change: StepChange = v.change === "same" || v.change === "changed" ? v.change : "new";
  const step: PlanStep = {
    key: v.key,
    title,
    detail,
    clue_ids: strList(v.clue_ids),
    basis: (v.basis === "clues" ? "clues" : "prior") as Basis,
    confidence: (v.confidence === 2 || v.confidence === 3 ? v.confidence : 1) as Confidence,
    change,
  };
  const uncertain = optStr(v.uncertain);
  if (uncertain) step.uncertain = uncertain;
  const caution = optStr(v.caution);
  if (caution) step.caution = caution;
  const changeNote = optStr(v.changeNote);
  if (changeNote) step.changeNote = changeNote;
  if (int(v.prevStep) > 0) step.prevStep = int(v.prevStep);
  const unsourced = strList(v.unsourced);
  if (unsourced.length) step.unsourced = unsourced;
  return step;
}

function readPlan(v: unknown, fallbackDate: string): RestorePlan | null {
  if (!isRec(v) || !Array.isArray(v.steps) || int(v.version) < 1) return null;
  const steps = v.steps.map(readStep);
  if (!steps.length || steps.some((s) => !s)) return null;
  const list = (x: unknown) => (Array.isArray(x) ? x.filter(isRec) : []);
  return {
    version: int(v.version),
    date: dateOr(v.date, fallbackDate),
    steps: steps as PlanStep[],
    dropped: list(v.dropped).map((d) => ({ key: str(d.key, 40), title: str(d.title), why: str(d.why) })),
    unknowns: list(v.unknowns).map((u) => ({ what: str(u.what), why: str(u.why), step: int(u.step) })),
    nextChecks: list(v.nextChecks).map((c) => {
      const check: NextCheck = { what: str(c.what), why: str(c.why), kind: c.kind === "research" || c.kind === "ask" ? c.kind : "trial", step: int(c.step) };
      const caution = optStr(c.caution);
      if (caution) check.caution = caution;
      const unsourced = strList(c.unsourced);
      if (unsourced.length) check.unsourced = unsourced;
      return check;
    }),
    summary: str(v.summary),
    changes: str(v.changes),
    clues: list(v.clues).map((c) => ({ id: str(c.id, 20), title: str(c.title) })),
    photosSent: strList(v.photosSent),
    notes: strList(v.notes),
  };
}

function readResult(v: unknown, fallbackDate: string): TrialResult | null {
  if (!isRec(v) || typeof v.id !== "string" || !RESULT_ID.test(v.id) || typeof v.stepKey !== "string" || !STEP_KEY.test(v.stepKey)) return null;
  if (v.outcome !== "ok" && v.outcome !== "ng" && v.outcome !== "pending") return null;
  return { id: v.id, stepKey: v.stepKey, stepTitle: str(v.stepTitle), planVersion: int(v.planVersion), outcome: v.outcome, note: str(v.note, TEXT_LIMITS.note), date: dateOr(v.date, fallbackDate) };
}

function readRule(v: unknown, fallbackDate: string): TechRule | null {
  if (!isRec(v) || typeof v.id !== "string" || !RULE_ID.test(v.id) || typeof v.stepKey !== "string" || !STEP_KEY.test(v.stepKey)) return null;
  const title = str(v.title, TEXT_LIMITS.title);
  const text = str(v.text, TEXT_LIMITS.text);
  if (!title.trim() || !text.trim()) return null;
  const rule: TechRule = { id: v.id, stepKey: v.stepKey, stepTitle: str(v.stepTitle), planVersion: int(v.planVersion), title, text, reason: str(v.reason, TEXT_LIMITS.text), by: str(v.by, 80), date: dateOr(v.date, fallbackDate) };
  const quote = optStr(v.quote, TEXT_LIMITS.note);
  if (quote) rule.quote = quote;
  return rule;
}

/** 保存した・読み込んだ記録を、画面がそのまま描ける形にする。読めなければ null */
export function readProject(raw: unknown): RestoreProject | null {
  if (!isRec(raw) || typeof raw.id !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(raw.id)) return null;
  const name = str(raw.name, TEXT_LIMITS.name).trim();
  if (!name) return null;
  const created = dateOr(raw.created, "2026-11-05");
  const clues = (Array.isArray(raw.clues) ? raw.clues : []).map((c) => readClue(c, created)).filter((c): c is RestoreClue => !!c);
  const plans = (Array.isArray(raw.plans) ? raw.plans : []).map((v) => readPlan(v, created));
  if (plans.some((v) => !v)) return null;
  const okPlans = plans as RestorePlan[];
  // 案の番号は、結果と結びついているので、順に増えていること
  if (okPlans.some((v, i) => i > 0 && v.version <= okPlans[i - 1].version)) return null;
  const results = (Array.isArray(raw.results) ? raw.results : []).map((r) => readResult(r, created)).filter((r): r is TrialResult => !!r);
  const rules = (Array.isArray(raw.rules) ? raw.rules : []).map((r) => readRule(r, created)).filter((r): r is TechRule => !!r);
  // 番号の続きは、中身から数え直す（手で直した記録でも、番号が重ならないように）
  const after = (ids: number[], stored: unknown) => Math.max(int(stored, 1), ...ids.map((n) => n + 1), 1);
  const stepNums = okPlans.flatMap((v) => v.steps.map((s) => numAfter(s.key)));
  return {
    id: raw.id,
    name,
    ...(raw.sample === true ? { sample: true } : {}),
    created,
    updated: dateOr(raw.updated, created),
    clues,
    plans: okPlans,
    results,
    rules,
    nextClue: after(clues.map((c) => numAfter(c.id)), raw.nextClue),
    nextResult: after(results.map((r) => numAfter(r.id)), raw.nextResult),
    nextStep: after(stepNums, raw.nextStep),
    nextRule: after(rules.map((r) => numAfter(r.id)), raw.nextRule),
  };
}

const PHOTO_MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** 書き出したファイルの中身を読む。形がちがえば理由を返す。おかしい写真は外して warnings に書く */
export function parseRestoreFile(raw: unknown): { ok: true; project: RestoreProject; photos: Record<string, PhotoFile>; warnings: string[] } | { ok: false; error: string } {
  if (!isRec(raw) || raw.format !== FILE_FORMAT) return { ok: false, error: "「自分の技を組み立て直す」の記録のファイルではないようです。" };
  if (raw.version !== FILE_VERSION) return { ok: false, error: "この記録のファイルは、今の継ぐでは読めない形です。" };
  const project = readProject(raw.project);
  if (!project) return { ok: false, error: "記録のファイルの中身が読めませんでした。" };
  const warnings: string[] = [];
  const photos: Record<string, PhotoFile> = {};
  const given = isRec(raw.photos) ? raw.photos : {};
  for (const c of project.clues) {
    if (!c.photo) continue;
    const f = given[c.id];
    if (isRec(f) && typeof f.data === "string" && typeof f.media === "string" && PHOTO_MEDIA.includes(f.media) && f.data.length <= IMPORT_PHOTO_CHARS && BASE64.test(f.data)) {
      photos[c.id] = { media: f.media, data: f.data };
    } else {
      warnings.push(`${c.id} の写真は読めませんでした。`);
    }
  }
  return { ok: true, project, photos, warnings };
}
