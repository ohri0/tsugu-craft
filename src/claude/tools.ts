// Claude に渡す道具の定義（docs/SPEC.md「道具」の表のとおり：set_setting / set_shank / check / look）。
// 道具は人のボタンと同じ関数で動く。その関数は画面が ToolHost として用意する（ここでは形だけ決める）。
// 道具の入力と結果は Claude とやり取りするので、名前は snake_case にそろえる。
import { GUIDE_NOTE, GUIDES } from "../rules/guides";
import type { ClaudeTool } from "./wire";

export const TOOL_NAMES = ["set_setting", "set_shank", "check", "look"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** 指輪の形を変える道具。最初に呼ばれる前に、戻すための写しを取る。 */
export const CHANGING_TOOLS: readonly ToolName[] = ["set_setting", "set_shank"];

export function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

// ---- 入力 ----

export type SettingStyle = "prong" | "bezel";
export type HeightChoice = keyof typeof GUIDES.height.options;
export type Orientation = "along" | "across";
export type Metal = "pt900" | "k18yg" | "k18wg" | "k18pg" | "sv925";
export type View = "top" | "side" | "front" | "angle";

export interface SetSettingInput {
  style?: SettingStyle;
  /** 爪を置く輪郭の点の番号 */
  prong_positions?: number[];
  prong_count?: number;
  prong_mm?: number;
  height?: HeightChoice;
  orientation?: Orientation;
  reason: string;
}

export interface SetShankInput {
  width_mm?: number;
  thickness_mm?: number;
  gou?: number;
  metal?: Metal;
  reason: string;
}

export interface LookInput {
  view: View;
}

// ---- 結果（どれもそのまま JSON にできる形） ----

/** 石の留まり。標準の 4 本爪・標準の太さ・標準の高さ ＝ 1.0×。強度計算の代わりではない。 */
export interface HoldReport {
  value: number;
  required: number;
  /** 石の向きで決まる、必要な留まりの理由（上・横・手のひら側） */
  where: "top" | "side" | "palm";
  note: string;
}

export interface SettingState {
  style: SettingStyle;
  prong_count: number | null;
  /** そのうち V 字の爪の数 */
  v_prong_count: number;
  prong_mm: number | null;
  prong_positions: number[];
  height: HeightChoice;
  orientation: Orientation;
  /** 覆輪の壁の厚み（爪のときは null） */
  bezel_wall_mm: number | null;
}

export interface SetSettingResult {
  setting: SettingState;
  hold: HoldReport;
  note?: string;
}

export interface ShankState {
  width_mm: number;
  thickness_mm: number;
  gou: number;
  inner_diameter_mm: number;
  metal: Metal;
}

export interface SetShankResult {
  shank: ShankState;
  /** 指輪全体のおおよその重さ（g） */
  weight_g: number;
  note?: string;
}

/** 直し方の選択肢。見た目への影響を必ず添える。 */
export interface FixOption {
  action: string;
  appearance: string;
  /** この直し方に使う道具と入力の例（あれば） */
  tool_hint?: { tool: "set_setting"; input: Partial<SetSettingInput> } | { tool: "set_shank"; input: Partial<SetShankInput> };
}

export interface CheckProblem {
  /** 確かめの名前（例：爪の太さ、尖った角） */
  check: string;
  /** どこ（例：3 番の角、すべての爪） */
  where: string;
  current: string;
  required: string;
  reason: string;
  options: FixOption[];
}

export interface CheckResult {
  problems: CheckProblem[];
  /** 確かめて問題がなかった項目 */
  passed: string[];
  note: string;
}

export interface LookResult {
  view: View;
  media_type: "image/png" | "image/jpeg" | "image/webp";
  /** base64（data: は付けない） */
  data: string;
}

type Awaitable<T> = T | Promise<T>;

/**
 * 画面が用意する、道具を実行する所。人のボタンと同じ関数を呼ぶ。
 * snapshot / restore は「Claude の作業を全部戻す」ためのもの。S は画面が決める、指輪の状態の写し。
 */
export interface ToolHost<S = unknown> {
  setSetting(input: SetSettingInput): Awaitable<SetSettingResult>;
  setShank(input: SetShankInput): Awaitable<SetShankResult>;
  check(): Awaitable<CheckResult>;
  look(input: LookInput): Awaitable<LookResult>;
  snapshot(): S;
  restore(snapshot: S): void;
}

// ---- 入力の受け付け範囲 ----
// 職人の目安ではなく「明らかにおかしい値を道具に通さない」ための範囲。目安との比べは check がする。

export const INPUT_BOUNDS = {
  prong_count: [3, 8],
  prong_mm: [0.3, 3],
  prong_position: [0, 9999],
  width_mm: [1, 10],
  thickness_mm: [0.8, 5],
  gou: [1, 30],
} as const;

// ---- 道具の定義（Claude に見せる説明つき） ----

const h = GUIDES.height;
const heightText = `low＝低め（石の一番下と指のすき間が最低の ${h.minFingerGapMm} mm）、standard＝標準（＋${h.options.standard} mm）、high＝高め（＋${h.options.high} mm）。高いほど光が入り石が大きく見えるが、引っかかりやすく、爪が長くなって弱くなる`;
const range = (k: keyof typeof INPUT_BOUNDS, unit = "") =>
  `${INPUT_BOUNDS[k][0]}〜${INPUT_BOUNDS[k][1]}${unit}`;

export const TOOLS: ClaudeTool[] = [
  {
    name: "set_setting",
    description:
      "石座（石を留める部分）を変える。書いた項目だけが変わり、省いた項目は今のまま。" +
      "変えたあとの留め方と、石の留まり（標準の 4 本爪 ＝ 1.0× とした目安の比べ。強度計算の代わりではない）を返す。" +
      "変えたら check で確かめ直すこと。",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        style: {
          type: "string",
          enum: ["prong", "bezel"],
          description: "留め方。prong＝爪留め、bezel＝覆輪（石の縁をぐるりと壁で包む。いちばん取れにくいが、見た目が大きく変わる）",
        },
        prong_positions: {
          type: "array",
          items: { type: "integer" },
          description:
            "爪を置く場所。石の輪郭の点の番号（読み取りで渡した番号）で書く。尖った角の番号に置いた爪は、角を包む V 字の爪になる。省くと、尖った角を先に守り、残りを縁に均等に配る。爪留めのときだけ使う",
        },
        prong_count: {
          type: "integer",
          description: `爪の本数（${range("prong_count", " 本")}）。V 字の爪も 1 本と数える。爪留めのときだけ使う`,
        },
        prong_mm: {
          type: "number",
          description: `爪の太さ（mm、${range("prong_mm", " mm")}）。省くと石の大きさから出した標準の太さ。太いほど強いが、少し重く見える`,
        },
        height: { type: "string", enum: ["low", "standard", "high"], description: `石座の高さ。${heightText}` },
        orientation: {
          type: "string",
          enum: ["along", "across"],
          description: "石の向き。along＝長辺を指に沿って縦、across＝長辺を指を横切る向きに",
        },
        reason: {
          type: "string",
          description: "なぜこう変えるか。お客さまの希望と確かめ結果から、短く書く（作業の記録と指示書に残る）",
        },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
  {
    name: "set_shank",
    description:
      "腕（リングの輪の部分、甲丸）を変える。書いた項目だけが変わり、省いた項目は今のまま。変えたあとの寸法と、指輪のおおよその重さを返す。",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        width_mm: { type: "number", description: `腕の幅（mm、${range("width_mm", " mm")}）。目安の初期値は ${GUIDES.shank.widthMm} mm` },
        thickness_mm: {
          type: "number",
          description: `腕の厚み（mm、${range("thickness_mm", " mm")}）。目安の初期値は ${GUIDES.shank.thicknessMm} mm`,
        },
        gou: { type: "integer", description: `指輪のサイズ（日本の号数、${range("gou", " 号")}）。号数から内径が決まる` },
        metal: {
          type: "string",
          enum: ["pt900", "k18yg", "k18wg", "k18pg", "sv925"],
          description: "地金。pt900＝プラチナ、k18yg＝18 金イエロー、k18wg＝18 金ホワイト、k18pg＝18 金ピンク、sv925＝シルバー",
        },
        reason: { type: "string", description: "なぜこう変えるか。短く書く（作業の記録に残る）" },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
  {
    name: "check",
    description:
      "今の指輪を職人の目安で確かめる。問題の一覧（どこ・今の値・必要な値・理由・直し方の選択肢と見た目への影響）と、問題のなかった項目を返す。" +
      "選択肢は答えではない。どれを選ぶかは、お客さまの希望から決めて、理由を残す。" +
      `値はすべて目安で、最後は職人が決める（${GUIDE_NOTE}）。`,
    strict: true,
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "look",
    description: "今の指輪の画像を、言われた向きから撮って返す。お客さまの言う印象（華奢に、など）になっているかを目で確かめるために使う。",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        view: {
          type: "string",
          enum: ["top", "side", "front", "angle"],
          description: "向き。top＝真上から、side＝横から（高さが分かる）、front＝指先の側から、angle＝斜め上から（はめたときの見え方）",
        },
      },
      required: ["view"],
      additionalProperties: false,
    },
  },
];

// ---- 入力を確かめる ----
// strict の道具なので形はふつう正しく届くが、届いた値はそのまま信じず、ここで型と範囲を確かめてから道具に渡す。

export type ParsedToolCall =
  | { name: "set_setting"; input: SetSettingInput }
  | { name: "set_shank"; input: SetShankInput }
  | { name: "check"; input: Record<string, never> }
  | { name: "look"; input: LookInput };

export type ParseResult = { ok: true; call: ParsedToolCall } | { ok: false; error: string };

interface PropSchema {
  type: "string" | "number" | "integer" | "array";
  enum?: readonly string[];
  items?: { type: "integer" };
}

const BOUND_OF: Record<string, keyof typeof INPUT_BOUNDS> = {
  prong_count: "prong_count",
  prong_mm: "prong_mm",
  prong_positions: "prong_position",
  width_mm: "width_mm",
  thickness_mm: "thickness_mm",
  gou: "gou",
};

function checkNumber(key: string, v: unknown, integer: boolean): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return `${key} は数で書いてください`;
  if (integer && !Number.isInteger(v)) return `${key} は整数で書いてください`;
  const b = BOUND_OF[key];
  if (b) {
    const [lo, hi] = INPUT_BOUNDS[b];
    if (v < lo || v > hi) return `${key} は ${lo}〜${hi} の間で書いてください（今は ${v}）`;
  }
  return null;
}

function checkProp(key: string, s: PropSchema, v: unknown): string | null {
  switch (s.type) {
    case "string":
      if (typeof v !== "string") return `${key} は文字で書いてください`;
      if (s.enum && !s.enum.includes(v)) return `${key} は ${s.enum.join(" / ")} のどれかです（今は ${v}）`;
      return null;
    case "number":
      return checkNumber(key, v, false);
    case "integer":
      return checkNumber(key, v, true);
    case "array":
      if (!Array.isArray(v)) return `${key} は番号の並びで書いてください`;
      for (const item of v) {
        const e = checkNumber(key, item, true);
        if (e) return e;
      }
      return null;
  }
}

/** 道具の名前と入力を、定義の形と受け付け範囲で確かめる */
export function parseToolCall(name: string, input: unknown): ParseResult {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool || !isToolName(name)) return { ok: false, error: `「${name}」という道具はありません` };
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "入力の形が正しくありません" };
  }
  const schema = tool.input_schema as { properties?: Record<string, PropSchema>; required?: readonly string[] };
  const props = schema.properties ?? {};
  const record = input as Record<string, unknown>;
  for (const key of schema.required ?? []) {
    if (record[key] === undefined) return { ok: false, error: `${key} がありません` };
  }
  for (const [key, value] of Object.entries(record)) {
    const s = props[key];
    if (!s) return { ok: false, error: `${key} という項目はありません` };
    if (value === undefined) continue;
    const e = checkProp(key, s, value);
    if (e) return { ok: false, error: e };
  }
  if (typeof record.reason === "string" && record.reason.trim() === "") {
    return { ok: false, error: "reason（理由）を短く書いてください" };
  }
  return { ok: true, call: { name, input } as ParsedToolCall };
}
