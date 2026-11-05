// 「組み立て直す」で Claude に渡す道具の定義と、その入力を確かめる関数。
// propose_process：手がかりから組み立てた作り方の仮説を出す。
// grade_process：仮説を、隠しておいた答えと照らし合わせて採点する。
// 道具の入力は Claude とやり取りするので、名前は snake_case にそろえる。
import type { ClaudeTool } from "../claude/wire";
import type { AnswerItem, Clue } from "./material";

/** 仮説の工程の数の範囲 */
export const STEP_RANGE = [3, 12] as const;
/** 職人に試してほしいことの数の範囲 */
export const TRIAL_RANGE = [1, 3] as const;

export type Basis = "clues" | "prior";
export type Confidence = 1 | 2 | 3;
export type Verdict = "match" | "partial" | "miss";

export interface HypothesisStep {
  title: string;
  detail: string;
  /** 根拠にした手がかりの番号（渡した一覧にあるものだけ） */
  clue_ids: string[];
  /** clues＝手がかりから考えた / prior＝もともとの知識から */
  basis: Basis;
  /** 1＝推し量り、2＝たぶん、3＝手がかりから強く言える */
  confidence: Confidence;
  /** まだ分からないこと */
  uncertain?: string;
}

export interface Trial {
  what: string;
  why: string;
}

export interface Hypothesis {
  steps: HypothesisStep[];
  /** 次に職人に小さく試してほしいこと */
  trials: Trial[];
  summary: string;
}

export interface GradeStep {
  /** 仮説の何番目の工程か（1 から） */
  n: number;
  verdict: Verdict;
  answer_ids: string[];
  note: string;
}

export interface GradeMissed {
  answer_id: string;
  note: string;
}

export interface Grade {
  /** 仮説の工程ごとの採点（n の順） */
  steps: GradeStep[];
  /** 仮説がたどり着かなかった本当の工程 */
  missed: GradeMissed[];
  summary: string;
}

/** 入力を確かめた結果。直して受け付けたところは warnings に残す */
export type Parsed<T> = { ok: true; value: T; warnings?: string[] } | { ok: false; error: string };

// ---- 道具の定義 ----
// 数の範囲（工程は 3〜12 など）は説明に書き、受け取ったあとに確かめる（strict の形では数の範囲を書けないものがあるため）。

export const PROPOSE_PROCESS: ClaudeTool = {
  name: "propose_process",
  description:
    "手がかりから組み立て直した作り方の仮説を出す。1 回だけ呼ぶ。" +
    `工程は作る順に ${STEP_RANGE[0]}〜${STEP_RANGE[1]} 個。どの工程にも、根拠にした手がかりの番号を付ける。` +
    "手がかりからではなく、もともと知っていたことから出てきた工程は、basis を prior にする（正直さが、合っていることより大事）。",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      steps: {
        type: "array",
        description: `作る順の工程（${STEP_RANGE[0]}〜${STEP_RANGE[1]} 個）`,
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "工程の短い名前（例：板を重ねる）" },
            detail: { type: "string", description: "何をするか、なぜそう考えたか（どの手がかりからか）。短く、やさしい日本語で" },
            clue_ids: {
              type: "array",
              items: { type: "string" },
              description: "根拠にした手がかりの番号（例：C3）。渡した一覧にある番号だけ。無ければ空にして basis を prior に",
            },
            basis: {
              type: "string",
              enum: ["clues", "prior"],
              description: "clues＝手がかり（と一般の物理）から考えた。prior＝手がかりからは出ず、もともと知っていたことから出た",
            },
            confidence: {
              type: "integer",
              enum: [1, 2, 3],
              description: "確からしさ。1＝推し量り、2＝たぶん、3＝手がかりから強く言える",
            },
            uncertain: { type: "string", description: "この工程でまだ分からないこと（温度、時間、順番など）。あれば" },
          },
          required: ["title", "detail", "clue_ids", "basis", "confidence"],
          additionalProperties: false,
        },
      },
      trials: {
        type: "array",
        description: `仮説を確かめるために、次に職人に小さく試してほしいこと（${TRIAL_RANGE[0]}〜${TRIAL_RANGE[1]} 個）`,
        items: {
          type: "object",
          properties: {
            what: { type: "string", description: "何を試すか（小さな切れ端で、など）" },
            why: { type: "string", description: "それで何が分かるか" },
          },
          required: ["what", "why"],
          additionalProperties: false,
        },
      },
      summary: { type: "string", description: "仮説のあらまし（2〜3 文）" },
    },
    required: ["steps", "trials", "summary"],
    additionalProperties: false,
  },
};

export const GRADE_PROCESS: ClaudeTool = {
  name: "grade_process",
  description:
    "仮説の工程を、本当の工程と照らし合わせて採点する。1 回だけ呼ぶ。" +
    "仮説の工程すべてに 1 つずつ判定を付け、仮説がたどり着かなかった本当の工程を missed に挙げる。",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      steps: {
        type: "array",
        description: "仮説の工程ごとの採点。仮説の工程すべてについて 1 つずつ",
        items: {
          type: "object",
          properties: {
            n: { type: "integer", description: "仮説の何番目の工程か（1 から）" },
            verdict: {
              type: "string",
              enum: ["match", "partial", "miss"],
              description: "match＝本当の工程と、肝心の作業が同じ。partial＝向きは合うが、肝心なところが欠ける・あいまい。miss＝本当の工程に無い、またはちがう",
            },
            answer_ids: {
              type: "array",
              items: { type: "string" },
              description: "当たる本当の工程の番号（例：A5）。miss なら空",
            },
            note: { type: "string", description: "なぜその判定か（短く）" },
          },
          required: ["n", "verdict", "answer_ids", "note"],
          additionalProperties: false,
        },
      },
      missed: {
        type: "array",
        description: "仮説がたどり着かなかった本当の工程（A の番号）",
        items: {
          type: "object",
          properties: {
            answer_id: { type: "string", description: "本当の工程の番号（例：A4）" },
            note: { type: "string", description: "何が欠けていたか（短く）" },
          },
          required: ["answer_id", "note"],
          additionalProperties: false,
        },
      },
      summary: { type: "string", description: "採点のまとめ（2〜3 文）" },
    },
    required: ["steps", "missed", "summary"],
    additionalProperties: false,
  },
};

// ---- 入力を確かめる（src/rebuild/restore-tools.ts も使う） ----

type Rec = Record<string, unknown>;

export const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);

export function text(r: Rec, key: string, where: string): string | { error: string } {
  const v = r[key];
  if (typeof v !== "string" || v.trim() === "") return { error: `${where}の ${key} を文字で書いてください` };
  return v.trim();
}

export function stringList(r: Rec, key: string, where: string): string[] | { error: string } {
  const v = r[key];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) return { error: `${where}の ${key} は文字の並びで書いてください` };
  return (v as string[]).map((x) => x.trim()).filter((x) => x !== "");
}

export const failed = (v: unknown): v is { error: string } => isRecord(v) && typeof v.error === "string";

/** 番号を、一覧にあるものだけに絞る。無いものは warnings に残す */
export function keepKnown(ids: string[], known: Set<string>, where: string, warnings: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (!known.has(id)) {
      warnings.push(`${where}：${id} という番号は無いので外しました`);
      continue;
    }
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** propose_process の入力を確かめる。clues は、その条件で渡した手がかり */
export function parseProposeProcess(input: unknown, clues: Clue[]): Parsed<Hypothesis> {
  if (!isRecord(input)) return { ok: false, error: "入力の形が正しくありません" };
  const known = new Set(clues.map((c) => c.id));
  const warnings: string[] = [];

  const rawSteps = input.steps;
  if (!Array.isArray(rawSteps)) return { ok: false, error: "steps（工程）を並びで書いてください" };
  if (rawSteps.length < STEP_RANGE[0] || rawSteps.length > STEP_RANGE[1]) {
    return { ok: false, error: `工程は ${STEP_RANGE[0]}〜${STEP_RANGE[1]} 個で書いてください（今は ${rawSteps.length} 個）` };
  }
  const steps: HypothesisStep[] = [];
  for (const [i, s] of rawSteps.entries()) {
    const where = `${i + 1} 番目の工程`;
    if (!isRecord(s)) return { ok: false, error: `${where}の形が正しくありません` };
    const title = text(s, "title", where);
    if (failed(title)) return { ok: false, error: title.error };
    const detail = text(s, "detail", where);
    if (failed(detail)) return { ok: false, error: detail.error };
    const ids = stringList(s, "clue_ids", where);
    if (failed(ids)) return { ok: false, error: ids.error };
    if (s.basis !== "clues" && s.basis !== "prior") return { ok: false, error: `${where}の basis は clues か prior です` };
    const c = s.confidence;
    if (c !== 1 && c !== 2 && c !== 3) return { ok: false, error: `${where}の confidence は 1・2・3 のどれかです` };
    if (s.uncertain !== undefined && s.uncertain !== null && typeof s.uncertain !== "string") {
      return { ok: false, error: `${where}の uncertain は文字で書いてください` };
    }
    const clue_ids = keepKnown(ids, known, where, warnings);
    let basis: Basis = s.basis;
    if (basis === "clues" && clue_ids.length === 0) {
      warnings.push(`${where}：手がかりの番号が無いので、もともとの知識から（prior）として数えます`);
      basis = "prior";
    }
    const step: HypothesisStep = { title, detail, clue_ids, basis, confidence: c };
    if (typeof s.uncertain === "string" && s.uncertain.trim()) step.uncertain = s.uncertain.trim();
    steps.push(step);
  }

  const rawTrials = input.trials;
  if (!Array.isArray(rawTrials)) return { ok: false, error: "trials（試してほしいこと）を並びで書いてください" };
  if (rawTrials.length < TRIAL_RANGE[0] || rawTrials.length > TRIAL_RANGE[1]) {
    return { ok: false, error: `試してほしいことは ${TRIAL_RANGE[0]}〜${TRIAL_RANGE[1]} 個で書いてください（今は ${rawTrials.length} 個）` };
  }
  const trials: Trial[] = [];
  for (const [i, t] of rawTrials.entries()) {
    const where = `${i + 1} 番目の試してほしいこと`;
    if (!isRecord(t)) return { ok: false, error: `${where}の形が正しくありません` };
    const what = text(t, "what", where);
    if (failed(what)) return { ok: false, error: what.error };
    const why = text(t, "why", where);
    if (failed(why)) return { ok: false, error: why.error };
    trials.push({ what, why });
  }

  const summary = text(input, "summary", "仮説");
  if (failed(summary)) return { ok: false, error: summary.error };

  return { ok: true, value: { steps, trials, summary }, ...(warnings.length ? { warnings } : {}) };
}

/** grade_process の入力を確かめる。hypothesis は採点した仮説、answer は答えの全体 */
export function parseGradeProcess(input: unknown, hypothesis: Hypothesis, answer: AnswerItem[]): Parsed<Grade> {
  if (!isRecord(input)) return { ok: false, error: "入力の形が正しくありません" };
  const known = new Set(answer.map((a) => a.id));
  const stepIds = new Set(answer.filter((a) => a.kind === "step").map((a) => a.id));
  const count = hypothesis.steps.length;
  const warnings: string[] = [];

  const rawSteps = input.steps;
  if (!Array.isArray(rawSteps)) return { ok: false, error: "steps（工程ごとの採点）を並びで書いてください" };
  const byN = new Map<number, GradeStep>();
  for (const [i, s] of rawSteps.entries()) {
    const where = `${i + 1} 番目の採点`;
    if (!isRecord(s)) return { ok: false, error: `${where}の形が正しくありません` };
    const n = s.n;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > count) {
      return { ok: false, error: `${where}の n は 1〜${count} の整数で書いてください（今は ${String(n)}）` };
    }
    if (s.verdict !== "match" && s.verdict !== "partial" && s.verdict !== "miss") {
      return { ok: false, error: `${where}の verdict は match・partial・miss のどれかです` };
    }
    const ids = stringList(s, "answer_ids", where);
    if (failed(ids)) return { ok: false, error: ids.error };
    if (typeof s.note !== "string") return { ok: false, error: `${where}の note を文字で書いてください` };
    if (byN.has(n)) {
      warnings.push(`${n} 番目の工程の採点が 2 つあったので、先のものを使いました`);
      continue;
    }
    let verdict: Verdict = s.verdict;
    const answer_ids = keepKnown(ids, known, `${n} 番目の工程の採点`, warnings);
    if (verdict !== "miss" && answer_ids.length === 0) {
      warnings.push(`${n} 番目の工程：当たる本当の工程の番号が無いので、miss として数えます`);
      verdict = "miss";
    }
    byN.set(n, { n, verdict, answer_ids, note: s.note.trim() });
  }
  const steps: GradeStep[] = [];
  for (let n = 1; n <= count; n++) {
    const g = byN.get(n);
    if (g) {
      steps.push(g);
    } else {
      warnings.push(`${n} 番目の工程に採点が無かったので、miss として数えます`);
      steps.push({ n, verdict: "miss", answer_ids: [], note: "採点がありませんでした" });
    }
  }

  const rawMissed = input.missed;
  if (!Array.isArray(rawMissed)) return { ok: false, error: "missed（たどり着かなかった工程）を並びで書いてください" };
  const hit = new Set(steps.filter((s) => s.verdict !== "miss").flatMap((s) => s.answer_ids));
  const missed: GradeMissed[] = [];
  for (const [i, m] of rawMissed.entries()) {
    const where = `たどり着かなかった工程の ${i + 1} 番目`;
    if (!isRecord(m)) return { ok: false, error: `${where}の形が正しくありません` };
    if (typeof m.answer_id !== "string" || typeof m.note !== "string") {
      return { ok: false, error: `${where}は answer_id と note を文字で書いてください` };
    }
    const id = m.answer_id.trim();
    if (!stepIds.has(id)) {
      warnings.push(`${where}：${id} は本当の工程の番号ではないので外しました`);
      continue;
    }
    if (hit.has(id)) {
      warnings.push(`${where}：${id} は仮説の工程で当たっているので外しました`);
      continue;
    }
    if (missed.some((x) => x.answer_id === id)) continue;
    missed.push({ answer_id: id, note: m.note.trim() });
  }

  const summary = text(input, "summary", "採点");
  if (failed(summary)) return { ok: false, error: summary.error };

  return { ok: true, value: { steps, missed, summary }, ...(warnings.length ? { warnings } : {}) };
}
