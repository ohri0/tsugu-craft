// 「自分の技を組み立て直す」で Claude に渡す道具の定義と、その入力を確かめる関数。
// propose_restoration：答えのない技について、工程の案・分かっていない所・次に確かめることを出す。
// 道具の入力は Claude とやり取りするので、名前は snake_case にそろえる。
import type { ClaudeTool } from "../claude/wire";
import type { CheckKind, RestorationOutput, RestorePlan, StepChange, UnknownPoint } from "./restore";
import { failed, isRecord, keepKnown, stringList, text, type Basis, type Parsed } from "./tools";

/** 工程の数の範囲。手がかりが少なければ少なくてよいので、1 から */
export const PLAN_STEP_RANGE = [1, 15] as const;
/** 分かっていない所・次に確かめることの数の上限（超えた分は外す） */
export const UNKNOWN_MAX = 10;
export const CHECK_MAX = 8;

const CHECK_KIND_IDS: CheckKind[] = ["trial", "research", "ask"];
const CHANGE_IDS: StepChange[] = ["same", "changed", "new"];

export const PROPOSE_RESTORATION: ClaudeTool = {
  name: "propose_restoration",
  description:
    "答えのない技について、職人が試して確かめるための工程の案を出す。1 回だけ呼ぶ。" +
    `工程は作る順に ${PLAN_STEP_RANGE[0]}〜${PLAN_STEP_RANGE[1]} 個。どの工程にも、根拠にした手がかりの番号を付ける。` +
    "手がかりからでなく、もともと知っていたことから出た工程は、basis を prior にする。確かな作り方だと言わない。手がかりにない数字を書かない。",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      steps: {
        type: "array",
        description: `作る順の工程の案（${PLAN_STEP_RANGE[0]}〜${PLAN_STEP_RANGE[1]} 個）`,
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "工程の短い名前" },
            detail: { type: "string", description: "何をするか、なぜそう考えたか（どの手がかりからか）。短く、やさしい日本語で。手がかりにない数字は書かない" },
            clue_ids: {
              type: "array",
              items: { type: "string" },
              description: "根拠にした手がかりの番号（C で始まる手がかり、T で始まる試した結果）。一覧にある番号だけ。もともとの知識からなら空",
            },
            basis: { type: "string", enum: ["clues", "prior"], description: "clues＝手がかりから考えた。prior＝手がかりからは出ず、もともと知っていたことから出た" },
            confidence: { type: "integer", enum: [1, 2, 3], description: "確からしさ。1＝推し量り、2＝たぶん、3＝手がかりから強く言える（それでも案であることは変わらない）" },
            uncertain: { type: "string", description: "この工程でまだ分からないこと（温度、時間、順番など）。なければ空の文字" },
            caution: { type: "string", description: "危ない物や作業の注意。なければ空の文字" },
            prev_step: { type: "integer", description: "前の案の何番目の工程を続けるか（1 から）。新しい工程や、最初の案なら 0" },
            change: { type: "string", enum: ["same", "changed", "new"], description: "same＝前の案のまま。changed＝前の案から変えた。new＝新しい工程（最初の案はすべて new）" },
            change_note: { type: "string", description: "変えたとき、何をなぜ変えたか（どの手がかりや結果からか）。same や new なら空の文字" },
          },
          required: ["title", "detail", "clue_ids", "basis", "confidence", "uncertain", "caution", "prev_step", "change", "change_note"],
          additionalProperties: false,
        },
      },
      dropped: {
        type: "array",
        description: "前の案にあって、この案でやめた工程。最初の案なら空",
        items: {
          type: "object",
          properties: {
            prev_step: { type: "integer", description: "前の案の何番目の工程か（1 から）" },
            why: { type: "string", description: "やめた理由（どの手がかりや結果からか）" },
          },
          required: ["prev_step", "why"],
          additionalProperties: false,
        },
      },
      unknowns: {
        type: "array",
        description: `まだ分かっていない所（大事な順。1〜${UNKNOWN_MAX} 個）`,
        items: {
          type: "object",
          properties: {
            what: { type: "string", description: "何が分かっていないか" },
            why: { type: "string", description: "それが分からないと何に困るか" },
            step: { type: "integer", description: "関わる工程の番号（1 から）。全体のことなら 0" },
          },
          required: ["what", "why", "step"],
          additionalProperties: false,
        },
      },
      next_checks: {
        type: "array",
        description: `次に確かめるとよい試作や調べ（先にやるとよい順。1〜${CHECK_MAX} 個）`,
        items: {
          type: "object",
          properties: {
            what: { type: "string", description: "何をするか（小さな切れ端で、など）" },
            why: { type: "string", description: "それで何が分かるか。案のどの分かれ目がはっきりするか" },
            kind: { type: "string", enum: CHECK_KIND_IDS, description: "trial＝試作する。research＝調べる。ask＝人に聞く" },
            step: { type: "integer", description: "関わる工程の番号（1 から）。全体のことなら 0" },
            caution: { type: "string", description: "危ない物や作業の注意。なければ空の文字" },
          },
          required: ["what", "why", "kind", "step", "caution"],
          additionalProperties: false,
        },
      },
      summary: { type: "string", description: "案のあらまし（2〜3 文）。案であることが分かる言い方で" },
      changes: { type: "string", description: "前の案からの違いのあらまし（2〜3 文）。最初の案なら空の文字" },
    },
    required: ["steps", "dropped", "unknowns", "next_checks", "summary", "changes"],
    additionalProperties: false,
  },
};

/** 空でない文字ならそれ、ほかは空 */
const optional = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** 工程の番号を 0〜count におさめる（範囲の外は全体のこととして 0） */
function stepRef(v: unknown, count: number): number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= count ? v : 0;
}

/**
 * propose_restoration の入力を確かめる。
 * ids は Claude に渡した手がかりと結果の番号、prev は前の案。
 * 直せる所は直して warnings に残し（案は人が読むので、書き直しの呼び出しを増やさない）、工程や「分かっていない所」が無いときだけ断る。
 */
export function parseRestoration(input: unknown, ctx: { ids: readonly string[]; prev?: RestorePlan }): Parsed<RestorationOutput> {
  if (!isRecord(input)) return { ok: false, error: "入力の形が正しくありません" };
  const known = new Set(ctx.ids);
  const prevCount = ctx.prev?.steps.length ?? 0;
  const warnings: string[] = [];

  const rawSteps = input.steps;
  if (!Array.isArray(rawSteps)) return { ok: false, error: "steps（工程）を並びで書いてください" };
  if (rawSteps.length < PLAN_STEP_RANGE[0] || rawSteps.length > PLAN_STEP_RANGE[1]) {
    return { ok: false, error: `工程は ${PLAN_STEP_RANGE[0]}〜${PLAN_STEP_RANGE[1]} 個で書いてください（今は ${rawSteps.length} 個）` };
  }
  const steps: RestorationOutput["steps"] = [];
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
    if (!CHANGE_IDS.includes(s.change as StepChange)) return { ok: false, error: `${where}の change は same・changed・new のどれかです` };

    let clue_ids = keepKnown(ids, known, where, warnings);
    let basis: Basis = s.basis;
    if (basis === "clues" && clue_ids.length === 0) {
      warnings.push(`${where}：手がかりの番号が無いので、もともとの知識からとしました`);
      basis = "prior";
    }
    if (basis === "prior") clue_ids = [];

    let prev_step = typeof s.prev_step === "number" && Number.isInteger(s.prev_step) ? s.prev_step : 0;
    if (prev_step < 0 || prev_step > prevCount) {
      if (prevCount > 0) warnings.push(`${where}：前の案に ${prev_step} 番目の工程は無いので、新しい工程としました`);
      prev_step = 0;
    }
    let change = s.change as StepChange;
    if (prev_step === 0) change = "new";
    else if (change === "new") change = "changed";

    const step: RestorationOutput["steps"][number] = { title, detail, clue_ids, basis, confidence: c, prev_step, change };
    const uncertain = optional(s.uncertain);
    if (uncertain) step.uncertain = uncertain;
    const caution = optional(s.caution);
    if (caution) step.caution = caution;
    const note = optional(s.change_note);
    if (note && change !== "new") step.change_note = note;
    steps.push(step);
  }

  // やめた工程：前の案の工程は、どれも続けるかやめるかのどちらかになるように
  const continued = new Set(steps.map((s) => s.prev_step).filter((n) => n > 0));
  const dropped: RestorationOutput["dropped"] = [];
  for (const d of Array.isArray(input.dropped) ? input.dropped : []) {
    if (!isRecord(d)) continue;
    const n = d.prev_step;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > prevCount) continue;
    if (continued.has(n) || dropped.some((x) => x.prev_step === n)) continue;
    dropped.push({ prev_step: n, why: optional(d.why) });
  }
  for (let n = 1; n <= prevCount; n++) {
    if (continued.has(n) || dropped.some((x) => x.prev_step === n)) continue;
    warnings.push(`前の案の工程 ${n} がどうなったか、Claude が書きませんでした。やめた工程として出します`);
    dropped.push({ prev_step: n, why: "" });
  }

  const rawUnknowns = input.unknowns;
  if (!Array.isArray(rawUnknowns)) return { ok: false, error: "unknowns（分かっていない所）を並びで書いてください" };
  const unknowns: UnknownPoint[] = [];
  for (const u of rawUnknowns) {
    if (!isRecord(u)) continue;
    const what = optional(u.what);
    if (what) unknowns.push({ what, why: optional(u.why), step: stepRef(u.step, steps.length) });
  }
  // 答えのない技で「分かっていない所がない」ことはない
  if (!unknowns.length) return { ok: false, error: "unknowns（分かっていない所）を 1 つ以上書いてください。答えのない技なので、分かっていない所は必ずあります" };
  if (unknowns.length > UNKNOWN_MAX) {
    warnings.push(`分かっていない所が ${unknowns.length} 個あったので、はじめの ${UNKNOWN_MAX} 個を出します`);
    unknowns.length = UNKNOWN_MAX;
  }

  const rawChecks = input.next_checks;
  if (!Array.isArray(rawChecks)) return { ok: false, error: "next_checks（次に確かめること）を並びで書いてください" };
  const next_checks: RestorationOutput["next_checks"] = [];
  for (const c of rawChecks) {
    if (!isRecord(c)) continue;
    const what = optional(c.what);
    if (!what) continue;
    const check: RestorationOutput["next_checks"][number] = {
      what,
      why: optional(c.why),
      kind: CHECK_KIND_IDS.includes(c.kind as CheckKind) ? (c.kind as CheckKind) : "trial",
      step: stepRef(c.step, steps.length),
    };
    const caution = optional(c.caution);
    if (caution) check.caution = caution;
    next_checks.push(check);
  }
  if (!next_checks.length) return { ok: false, error: "next_checks（次に確かめること）を 1 つ以上書いてください" };
  if (next_checks.length > CHECK_MAX) {
    warnings.push(`次に確かめることが ${next_checks.length} 個あったので、はじめの ${CHECK_MAX} 個を出します`);
    next_checks.length = CHECK_MAX;
  }

  const summary = text(input, "summary", "案");
  if (failed(summary)) return { ok: false, error: summary.error };

  return { ok: true, value: { steps, dropped, unknowns, next_checks, summary, changes: optional(input.changes) }, ...(warnings.length ? { warnings } : {}) };
}
