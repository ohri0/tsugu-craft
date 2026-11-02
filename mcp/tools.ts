// MCP サーバーが出す道具の中身。画面のボタンや画面の中の Claude と同じ関数（形の処理・確かめるルール・目安帳）で動く。
// ここの関数は MCP を知らない：入力を受け取って、そのまま JSON にできる結果を返す（テストから直接呼べるように）。
// 入力の形（Zod）もここで決め、server.ts はそれを登録するだけにする。
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import { metalName } from "../src/geometry/ring";
import { patternSvg } from "../src/pattern/sheet";
import { HOLD_NOTE, holdRatio } from "../src/rules/checks";
import { GUIDE_NOTE, GUIDES, type HeightOption, type MetalId } from "../src/rules/guides";
import { activeRules, addRule, effectiveGuides, ledgerText, PARAMS, sourceLabel, type Ledger, type ParamId, type Rule } from "../src/rules/ledger";
import { build, DEFAULT_DESIGN, type Design } from "../src/ui/design";
import { readLedger, REPO_ROOT, writeLedger } from "./ledger-file";
import { readyStone, STONE_PRESETS } from "./stone-input";

/** 道具が使う場所（テストでは一時フォルダを渡す） */
export interface ToolContext {
  ledgerPath: string;
  /** 型紙を書き出してよいフォルダ（リポジトリの out/） */
  outDir: string;
  /** 決まりに付ける日付（YYYY-MM-DD） */
  today?: () => string;
}

export function defaultContext(ledgerPath: string): ToolContext {
  return { ledgerPath, outDir: resolve(REPO_ROOT, "out") };
}

const todayLocal = () => new Date().toLocaleDateString("sv-SE");
const round = (v: number, digits = 2) => Number(v.toFixed(digits));
const nonEmpty = (label: string) => z.string().trim().min(1, `${label}を書いてください`);

// ---- 入力の形 ----

const paramIds = Object.keys(PARAMS) as [ParamId, ...ParamId[]];
const heightIds = Object.keys(GUIDES.height.options) as [HeightOption, ...HeightOption[]];
const metalIds = Object.keys(GUIDES.metals) as [MetalId, ...MetalId[]];

const stoneShape = z
  .object({
    preset: z
      .enum(STONE_PRESETS)
      .optional()
      .describe("輪郭の点がないときの簡単な形：triangle＝三角（長辺を底にした二等辺三角形）、oval＝楕円、round＝丸、square＝四角。既定は oval"),
    outline_mm: z
      .array(z.object({ x: z.number(), y: z.number() }))
      .optional()
      .describe("上から見た石の縁の点（mm、y は上向き）。あれば preset より優先。向きと真ん中はこちらでそろえる"),
    long_mm: z.number().positive().optional().describe("長辺（mm、ノギスで測った値）。preset のときは必ず。輪郭の点のときは、なければ点から測る"),
    width_mm: z.number().positive().optional().describe("幅（mm）。なければ形から（丸は長辺と同じ）"),
    depth_mm: z.number().positive().describe("深さ（mm、テーブルからキューレットまで）"),
  })
  .describe("石。ガードル＝石の縁、キューレット＝石の一番下");

const designShape = z
  .object({
    style: z.enum(["prong", "bezel"]).optional().describe("留め方：prong＝爪、bezel＝覆輪（縁をぐるりと金属の壁で包む）"),
    prong_count: z.number().int().min(0).max(12).optional().describe("爪の本数。0 か省略で自動（尖った角が 3〜6 なら角の数、細長い・大きい石は 6、それ以外は 4）"),
    prong_scale: z.number().min(0.3).max(3).optional().describe("爪の太さ ÷ 標準の太さ（1 が標準）"),
    height: z.enum(heightIds).optional().describe("石座の高さ：low＝低め、standard＝標準、high＝高め"),
    orientation: z.enum(["along", "across"]).optional().describe("向き：along＝長辺が指に沿う（縦）、across＝長辺が指を横切る（横）"),
    metal: z
      .enum(metalIds)
      .optional()
      .describe(`地金：${metalIds.map((m) => `${m}＝${GUIDES.metals[m].name}`).join("、")}`),
    gou: z.number().int().min(1).max(30).optional().describe("指輪のサイズ（日本の号数）"),
    position: z.enum(["top", "side", "palm"]).optional().describe("石の場所：top＝上（ふつう）、side＝横（肩）、palm＝手のひら側寄り。必要な留まりが変わる"),
  })
  .optional()
  .describe("指輪の設計。省略した所は、爪・自動の本数・標準の太さ・標準の高さ・縦・K18 イエロー・11 号・上");

export const listRulesShape = {
  include_history: z.boolean().optional().describe("true なら、置き換えられた古い決まりも履歴として返す"),
};

export const proposeRuleShape = {
  craftsman: nonEmpty("職人の名前").describe("この決まりを言った職人の名前（出どころとして残す）"),
  title: nonEmpty("短い名前").describe("短い名前（例：鋳造の爪の根元）"),
  text: nonEmpty("決まりの言葉").describe("決まりの言葉。ふつうの日本語で、いつ・何を・どこまで"),
  reason: nonEmpty("理由").describe("なぜそうするか（職人が言った理由）"),
  example: z.string().optional().describe("例（職人が挙げたもの）"),
  quote: z.string().optional().describe("職人の言葉そのまま（短く。言い換えないで残す）"),
  param: z
    .enum(paramIds)
    .optional()
    .describe(
      "機械で確かめる値のどれに当たるか：" +
        paramIds.map((k) => `${k}＝${PARAMS[k].label}${PARAMS[k].unit ? `（${PARAMS[k].unit}）` : ""}`).join("、"),
    ),
  value: z.number().optional().describe("param の値（職人が言った数字だけ。単位は param の説明のとおり）"),
};

export const checkRingShape = {
  stone: stoneShape,
  design: designShape,
};

export const patternSvgShape = {
  stone: stoneShape,
  label: z.string().optional().describe("型紙に添える名前（例：石の呼び名や番号）"),
  save_as: z.string().optional().describe("リポジトリの out/ の中に書き出すファイル名（例：triangle.svg）。省略すると書き出さず、SVG だけ返す"),
};

export type ListRulesInput = z.infer<z.ZodObject<typeof listRulesShape>>;
export type ProposeRuleInput = z.infer<z.ZodObject<typeof proposeRuleShape>>;
export type CheckRingInput = z.infer<z.ZodObject<typeof checkRingShape>>;
export type PatternSvgInput = z.infer<z.ZodObject<typeof patternSvgShape>>;

/** 道具の説明（Claude が読む） */
export const DESCRIPTIONS = {
  list_rules:
    "継ぐの目安帳（一粒石の指輪の設計の決まり）を読む。今効いている決まりを、言葉・理由・数字・出どころ（職人の名前／公開情報）・日付つきで返す。" +
    "設計を確かめる前や、生徒の「なぜ？」に答えるときに、まずこれを読む。値は目安で、最後は職人が決める。",
  propose_rule:
    "職人から聞き取った判断を、1 つの決まりにして目安帳（リポジトリの ledger/jewelry.json）に書き足す。職人が「足して」と言ったときだけ使う。" +
    "決まりは「判断と理由」だけ（作り方の手順は書かない）。職人の言葉を勝手に強めたり、数字を足したりしない。会社や計画の名前は書かない。" +
    "機械で確かめられる値に当たるときだけ param と value を付ける（両方付けるか、両方付けない）。同じ param の決まりがあれば置き換え、古い決まりは履歴に残る。",
  check_ring:
    "石と設計から指輪（石座・爪・腕）を組み、目安帳の決まりで確かめる。問題ごとに、どこ・今の値・必要な値・理由・直し方の選択肢（見た目への影響つき）と、" +
    "根拠の決まり（誰の・いつの）を返す。石の一番下と指のすき間、地金の重さの見積もり、石の留まりも返す。答えを 1 つに決めず、選択肢を職人やデザイナーに見せる。",
  pattern_svg:
    "石の原寸（1:1）の型紙を A4 の SVG（mm 単位）で返す。黒が石の縁、赤が覆輪の内側と外側。save_as を付けると、リポジトリの out/ に書き出す。" +
    "印刷は「実際のサイズ・100%」で、型紙の 10 mm と 50 mm を定規で確かめるよう伝える。",
} as const;

// ---- 道具の中身 ----

function ruleView(r: Rule) {
  const p = r.param ? PARAMS[r.param] : undefined;
  return {
    id: r.id,
    title: r.title,
    text: r.text,
    reason: r.reason,
    ...(r.example ? { example: r.example } : {}),
    ...(quoteOf(r) ? { quote: quoteOf(r) } : {}),
    ...(r.param ? { param: r.param, value: r.value, value_label: p ? `${p.label}${p.unit ? `（${p.unit}）` : ""}` : undefined } : {}),
    source: sourceLabel(r.source),
    date: r.date,
    ...(r.replaces ? { replaces: r.replaces } : {}),
  };
}

/** 職人の言葉そのもの。目安帳の型にはないが、ファイルには残す */
type RuleWithQuote = Rule & { quote?: string };
const quoteOf = (r: Rule) => (r as RuleWithQuote).quote;

export function listRules(ctx: ToolContext, input: ListRulesInput = {}) {
  const ledger = readLedger(ctx.ledgerPath);
  const active = activeRules(ledger);
  const activeIds = new Set(active.map((r) => r.id));
  const replacedBy = new Map(ledger.rules.flatMap((r) => (r.replaces ? [[r.replaces, r.id] as const] : [])));
  return {
    craft: ledger.craft,
    rules: active.map(ruleView),
    ...(input.include_history
      ? { history: ledger.rules.filter((r) => !activeIds.has(r.id)).map((r) => ({ ...ruleView(r), replaced_by: replacedBy.get(r.id) })) }
      : {}),
    note: GUIDE_NOTE,
  };
}

export function proposeRule(ctx: ToolContext, input: ProposeRuleInput) {
  const parsed = z.object(proposeRuleShape).parse(input);
  if ((parsed.param === undefined) !== (parsed.value === undefined)) {
    throw new Error("param と value は、両方付けるか、両方付けないかにしてください");
  }
  if (parsed.value !== undefined && !(Number.isFinite(parsed.value) && parsed.value > 0)) {
    throw new Error("value は 0 より大きい数にしてください");
  }
  const before = readLedger(ctx.ledgerPath);
  const rule: Omit<RuleWithQuote, "id" | "replaces"> = {
    title: parsed.title,
    text: parsed.text,
    reason: parsed.reason,
    ...(parsed.example?.trim() ? { example: parsed.example.trim() } : {}),
    ...(parsed.quote?.trim() ? { quote: parsed.quote.trim() } : {}),
    ...(parsed.param ? { param: parsed.param, value: parsed.value } : {}),
    source: { kind: "craftsman", name: parsed.craftsman },
    date: (ctx.today ?? todayLocal)(),
  };
  const after: Ledger = addRule(before, rule);
  writeLedger(ctx.ledgerPath, after);
  const added = after.rules[after.rules.length - 1];
  const replaced = added.replaces ? before.rules.find((r) => r.id === added.replaces) : undefined;
  return {
    rule_id: added.id,
    replaced: replaced ? { id: replaced.id, title: replaced.title, source: sourceLabel(replaced.source) } : null,
    ledger_file: shownPath(ctx.ledgerPath),
    active_rules: activeRules(after).length,
    note: "目安帳のファイルを書き換えた。git でコミットすると、誰がいつ足したかが履歴に残る。",
  };
}

export function checkRingTool(ctx: ToolContext, input: CheckRingInput) {
  const parsed = z.object(checkRingShape).parse(input);
  const ledger = readLedger(ctx.ledgerPath);
  const stone = readyStone(parsed.stone);
  const d = parsed.design ?? {};
  const design: Design = {
    style: d.style ?? DEFAULT_DESIGN.style,
    prongCount: d.prong_count ?? DEFAULT_DESIGN.prongCount,
    prongScale: d.prong_scale ?? DEFAULT_DESIGN.prongScale,
    height: d.height ?? DEFAULT_DESIGN.height,
    orientation: d.orientation ?? DEFAULT_DESIGN.orientation,
    metal: d.metal ?? DEFAULT_DESIGN.metal,
    gou: d.gou ?? DEFAULT_DESIGN.gou,
    position: d.position ?? DEFAULT_DESIGN.position,
  };
  const built = build(stone.params, design, ledger);
  const { ring } = built;
  const s = ring.setting;
  const g = effectiveGuides(ledger);
  const need = design.position === "palm" ? g.hold.requiredPalm : design.position === "side" ? g.hold.requiredSide : g.hold.requiredTop;
  return {
    ok: built.problems.length === 0,
    stone: {
      shape: stone.shapeName,
      long_mm: round(stone.params.longMm),
      width_mm: round(stone.params.widthMm),
      depth_mm: round(stone.params.depthMm),
      sharp_corners: stone.corners.map((c) => ({ angle_deg: Math.round(c.angleDeg) })),
    },
    design: {
      style: design.style,
      prong_count: s.style === "prong" ? s.prongs.length : null,
      v_prong_count: s.prongs.filter((p) => p.isV).length,
      prong_mm: s.prongs.length ? round(s.prongs[0].diameterMm) : null,
      min_prong_mm: round(s.minProngMm),
      standard_prong_mm: round(s.standardProngMm),
      bezel_wall_mm: s.bezel ? round(s.bezel.wallMm) : null,
      height: design.height,
      orientation: design.orientation,
      metal: metalName(design.metal),
      gou: design.gou,
      position: design.position,
    },
    culet_gap_mm: round(ring.culetGapMm),
    metal_weight_g: round(ring.metalWeightG),
    hold: { value: round(holdRatio(s)), required: need, note: HOLD_NOTE },
    problems: built.problems.map((p) => ({
      id: p.id,
      where: p.where,
      current: p.current,
      required: p.required,
      reason: p.reason,
      options: p.options.map((o) => ({ id: o.id, label: o.label, effect_on_look: o.effectOnLook })),
      rule: p.rule ? { id: p.rule.id, title: p.rule.title, text: p.rule.text, source: sourceLabel(p.rule.source), date: p.rule.date } : null,
    })),
    note: `${GUIDE_NOTE}。地金の重さは部品の重なりも数えた少し多めの見積もり。`,
  };
}

export function patternSvgTool(ctx: ToolContext, input: PatternSvgInput) {
  const parsed = z.object(patternSvgShape).parse(input);
  const stone = readyStone(parsed.stone);
  const svg = patternSvg({
    outlineMm: stone.params.outlineMm,
    longMm: stone.params.longMm,
    widthMm: stone.params.widthMm,
    depthMm: stone.params.depthMm,
    widthFromPhoto: false,
    shapeName: stone.shapeName,
    label: parsed.label,
    date: (ctx.today ?? todayLocal)(),
  });
  let savedTo: string | undefined;
  if (parsed.save_as) {
    const target = insideOut(ctx.outDir, parsed.save_as);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, svg, "utf8");
    savedTo = shownPath(target);
  }
  return {
    shape: stone.shapeName,
    long_mm: round(stone.params.longMm),
    width_mm: round(stone.params.widthMm),
    depth_mm: round(stone.params.depthMm),
    ...(savedTo ? { saved_to: savedTo } : {}),
    print_note: "「実際のサイズ・100%」で印刷し、型紙の 10 mm と 50 mm を定規で確かめる。",
    svg,
  };
}

/** 目安帳をふつうの文章で（Claude が読むため） */
export function ledgerAsText(ctx: ToolContext): string {
  const ledger = readLedger(ctx.ledgerPath);
  return `# 目安帳：${ledger.craft}\n（${GUIDE_NOTE}）\n\n${ledgerText(ledger)}\n`;
}

/** out/ の外へは書かない（../ や絶対パスを断る）。拡張子がなければ .svg を付ける */
function insideOut(outDir: string, name: string): string {
  const withExt = /\.svg$/i.test(name) ? name : `${name}.svg`;
  const target = resolve(outDir, withExt);
  const rel = relative(outDir, target);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("save_as は out/ の中のファイル名にしてください（../ や絶対パスは使えません）");
  return target;
}

function shownPath(p: string): string {
  const rel = relative(REPO_ROOT, p);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : p;
}
