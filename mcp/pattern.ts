// 途切れた技の「模様の見込み」を、MCP の道具として出す（simulate_pattern・list_pattern_ops）。
// 画面と同じ純粋な計算（src/rebuild/pattern-model.ts）と、同じ入力の確かめ（parsePattern）で動く。絵は node だけで PNG にする。
// どれも形の見込み（仮の値）で、作り方の指示ではない。最後は職人が決める。
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { encodePng } from "../scripts/png";
import { modelOf, topImage } from "../src/rebuild/pattern-model";
import { LAYER_OPS, opWords, parsePattern, PREDICT_PATTERN, SURFACE_OPS, TOOL_OP_LABEL, TOOL_OPS, type PatternPrediction } from "../src/rebuild/pattern-tools";
import { METAL_IDS, OP_RANGE, PATTERN_LIMITS, PATTERN_METALS } from "../src/rebuild/pattern-values";
import { insideOut, shownPath, type ToolContext } from "./tools";

/** 道具の説明の終わりに必ず添える言葉 */
const SHAPE_ONLY = "形だけの見込み（絵のための仮の値）で、作り方の指示ではない。本当にどうなるか・どう作るかは、職人が決める。";

/** 絵の大きさ（上から見た面は正方形。画素） */
const TOP_PX = { min: 128, max: 800, default: 400 } as const;
/** 断面の絵の大きさ（scripts/pattern-demo.ts と同じ） */
const SECTION_PX = { w: 640, h: 140 } as const;
/** 細かい層をならす下ごしらえの倍率（scripts/pattern-demo.ts と同じ） */
const SUPERSAMPLE = 2;

/** predict_pattern の 1 つの操作の値の説明（同じ言葉を使う。ずれないように道具の定義から読む） */
type Prop = { description?: string; enum?: readonly string[] };
const ITEM_PROPS = (PREDICT_PATTERN.input_schema as { properties: { ops: { items: { properties: Record<string, Prop> } } } }).properties.ops.items.properties;
const said = (k: string) => ITEM_PROPS[k]?.description ?? "";

const opShape = z
  .looseObject({
    op: z.string().describe(`操作の種類：${TOOL_OPS.join("・")}（list_pattern_ops で意味と範囲を見られる）`),
    step: z.number().optional().describe("元になった案の工程の番号（なければ 0 か省く）"),
    why: z.string().optional().describe(said("why")),
    assumed: z.string().optional().describe(said("assumed")),
    metals: z.array(z.string()).optional().describe(said("metals")),
    amount: z.number().optional().describe(said("amount")),
    size: z.number().optional().describe(said("size")),
    across: z.number().optional().describe(said("across")),
    choice: z.string().optional().describe(said("choice")),
  })
  .describe("1 つの操作（predict_pattern の ops の 1 つと同じ形。使わない値は省いてよい）");

export const simulatePatternShape = {
  ops: z.array(opShape).describe(`作る順の操作（${OP_RANGE[0]}〜${OP_RANGE[1]} 個）。最初はかならず stack（重ねる）か plate（1 枚の板）。stack の後は重ねる操作と color だけ、plate の後は板の飾りの操作と color だけ`),
  summary: z.string().optional().describe("どんな模様になりそうかの見込み（1〜2 文）。省くと、こちらで短く書く"),
  cannot_show: z.string().optional().describe("この絵では表せないこと（熱の色・手ざわりなど）"),
  save_as: z.string().optional().describe("リポジトリの out/ の中に書き出す絵の名前（例：amadare）。<名前>-top.png と <名前>-section.png になる。省くと pattern"),
  section: z.boolean().optional().describe("断面の絵も書き出すか。省くと true"),
  size_px: z.number().int().min(TOP_PX.min).max(TOP_PX.max).optional().describe(`上から見た絵の一辺（画素、${TOP_PX.min}〜${TOP_PX.max}）。省くと ${TOP_PX.default}`),
  seed: z.number().int().optional().describe("散らばりのたね（同じたねなら同じ絵）。省くと 7（画面と同じ）"),
};
export type SimulatePatternInput = z.infer<z.ZodObject<typeof simulatePatternShape>>;

export const PATTERN_DESCRIPTIONS = {
  simulate_pattern:
    "途切れた技の案を置きかえた操作の並び（predict_pattern の ops と同じ形）から、模様の見込みの絵を描き、out/ に PNG で書き出す（上から見た面と、断面）。" +
    "計算は 2 つ：重ねた層の模様（最初が stack）と、1 枚の板の表の飾り（最初が plate）。返事は、計算の種類・層の数・計算からの知らせ（「模様を出す手順が無い」など）・範囲の外で直した値・仮の値のあらまし。" +
    `操作の名前と値の範囲は list_pattern_ops で見る。${SHAPE_ONLY}`,
  list_pattern_ops:
    "simulate_pattern に渡せる操作の一覧を返す：操作の名前と意味、2 つの計算（重ねる・1 枚の板）のどちらで使うか、材料の一覧、数の範囲、値の書き方、例。" +
    `操作を組む前にこれを読む。${SHAPE_ONLY}`,
} as const;

/** 書き出す名前から、拡張子をはずした元の名前 */
const baseName = (name: string | undefined) => (name?.trim() ? name.trim().replace(/\.png$/i, "") : "pattern");

export interface SimulatePatternResult {
  /** 人が読む短いまとめ（やさしい日本語） */
  text: string;
  /** JSON にできる結果 */
  result: {
    family: "layers" | "surface";
    family_label: string;
    facts: string;
    ops: { op: string; words: string; assumed?: string }[];
    notes: string[];
    fixed: string[];
    saved: { top: string; section?: string };
    note: string;
  };
  /** 書き出した絵（MCP の返事に絵として添える） */
  images: { name: string; png: Buffer }[];
}

/** 操作の並びから、模様の見込みの絵を描いて out/ に書き出す。入力は画面の Claude の答えと同じ関数で確かめる */
export async function simulatePatternTool(ctx: ToolContext, input: SimulatePatternInput): Promise<SimulatePatternResult> {
  const parsed = z.object(simulatePatternShape).parse(input);
  const base = baseName(parsed.save_as);
  // 書く前に、両方の名前が out/ の中かを確かめる
  const topPath = insideOut(ctx.outDir, `${base}-top.png`, ".png");
  const withSection = parsed.section ?? true;
  const sectionPath = withSection ? insideOut(ctx.outDir, `${base}-section.png`, ".png") : undefined;

  const checked = parsePattern(
    { applicable: true, reason: "", ops: parsed.ops, cannot_show: parsed.cannot_show ?? "", summary: parsed.summary?.trim() || "（MCP から描いた見込み）" },
    { steps: Number.MAX_SAFE_INTEGER },
  );
  if (!checked.ok) throw new Error(checked.error);
  const pred: PatternPrediction = checked.value;
  const fixed = checked.warnings ?? [];

  const model = modelOf(pred, parsed.seed ?? 7);
  const n = parsed.size_px ?? TOP_PX.default;
  const top = await topImage(model, n, SUPERSAMPLE);
  const images = [{ name: shownPath(topPath), png: encodePng(top.w, top.h, top.data) }];
  if (sectionPath) {
    const sec = model.section(SECTION_PX.w, SECTION_PX.h, model.row, SUPERSAMPLE);
    images.push({ name: shownPath(sectionPath), png: encodePng(sec.w, sec.h, sec.data) });
  }
  const paths = [topPath, ...(sectionPath ? [sectionPath] : [])];
  images.forEach((img, i) => {
    mkdirSync(dirname(paths[i]), { recursive: true });
    writeFileSync(paths[i], img.png);
  });

  const familyLabel = model.family === "layers" ? "重ねた層の模様（stack から）" : "1 枚の板の表の飾り（plate から）";
  const ops = pred.ops.map((o) => ({ op: o.op, words: opWords(o), ...(o.assumed ? { assumed: o.assumed } : {}) }));
  const note = "数はどれも絵のための仮の値で、出典のある測った値ではない。形だけの見込みで、作り方の指示ではない。本当にどうなるか・どう作るかは、職人が決める。";
  const lines = [
    `模様の見込み（${familyLabel}）`,
    model.facts ? `数：${model.facts}` : "",
    "操作：",
    ...ops.map((o, i) => `${i + 1}. ${o.words}${o.assumed ? `（仮：${o.assumed}）` : ""}`),
    model.notes.length ? `計算からの知らせ：\n${model.notes.map((s) => `- ${s}`).join("\n")}` : "",
    fixed.length ? `範囲の外などで直したこと：\n${fixed.map((s) => `- ${s}`).join("\n")}` : "",
    pred.cannot_show ? `この絵では表せないこと：${pred.cannot_show}` : "",
    `書き出した絵：${images.map((x) => x.name).join("、")}`,
    note,
  ].filter(Boolean);
  return {
    text: lines.join("\n"),
    result: {
      family: model.family,
      family_label: familyLabel,
      facts: model.facts,
      ops,
      notes: model.notes,
      fixed,
      saved: { top: images[0].name, ...(images[1] ? { section: images[1].name } : {}) },
      note,
    },
    images,
  };
}

/** 操作を組むための一覧（名前・意味・どちらの計算か・材料・範囲・値の書き方・例） */
export function listPatternOps() {
  const familyOf = (op: string) => (op === "color" ? "both" : (LAYER_OPS as readonly string[]).includes(op) ? "layers" : "surface");
  return {
    op_count: { min: OP_RANGE[0], max: OP_RANGE[1] },
    families: {
      layers: { label: "重ねた層の模様", first: "stack", ops: [...LAYER_OPS.filter((o) => o !== "stack"), "color"] },
      surface: { label: "1 枚の板の表の飾り", first: "plate", ops: [...SURFACE_OPS.filter((o) => o !== "plate"), "color"] },
      rule: "最初はかならず stack か plate を 1 つ。stack の後は重ねる操作と color だけ、plate の後は板の飾りの操作と color だけ（まぜない）",
    },
    ops: TOOL_OPS.map((op) => ({ op, label: TOOL_OP_LABEL[op], family: familyOf(op) })),
    metals: METAL_IDS.map((id) => ({ id, name: PATTERN_METALS[id].name })),
    limits: PATTERN_LIMITS,
    fields: {
      metals: said("metals"),
      amount: said("amount"),
      size: said("size"),
      across: said("across"),
      choice: said("choice"),
      choice_words: ITEM_PROPS.choice?.enum ?? [],
      out_of_range: "範囲の外の数は範囲におさめ、そのことを返事で知らせる。知らない操作・足りない値は断る",
    },
    examples: [
      {
        label: "重ねて穴をあけ、平らにして色を出す（重ねた層の模様）",
        ops: [
          { op: "stack", metals: ["shakudo", "silver", "copper"], amount: 3 },
          { op: "bond", choice: "good" },
          { op: "carve", amount: 0.7, size: 0.04, across: 8, choice: "dots" },
          { op: "flatten" },
          { op: "color", choice: "patina" },
        ],
      },
      {
        label: "銀の板に花の透かしと毛彫りの枠（1 枚の板の飾り）",
        ops: [
          { op: "plate", metals: ["silver"] },
          { op: "sukashi", size: 0.08, across: 4, choice: "petals" },
          { op: "kebori", amount: 0.2, size: 0.005, across: 2, choice: "border" },
        ],
      },
    ],
    note: `数はどれも絵のための仮の値。${SHAPE_ONLY}`,
  };
}
