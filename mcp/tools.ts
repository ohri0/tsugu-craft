// MCP サーバーが出す道具の中身。画面のボタンや画面の中の Claude と同じ関数（形の処理・確かめるルール・目安帳）で動く。
// ここの関数は MCP を知らない：入力を受け取って、そのまま JSON にできる結果を返す（テストから直接呼べるように）。
// 入力の形（Zod）もここで決め、server.ts はそれを登録するだけにする。
import { MAKING_STEPS, MAKING_STEP_IDS, stepsOfRule, type MakingStepId } from "../src/rules/making";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import { metalName } from "../src/geometry/ring";
import { patternSvg } from "../src/pattern/sheet";
import { HOLD_NOTE, holdRatio } from "../src/rules/checks";
import { GUIDE_NOTE, GUIDES, type HeightOption, type MetalId } from "../src/rules/guides";
import { activeRules, addRule, effectiveGuides, ledgerText, PARAMS, sourceLabel, type Ledger, type ParamId, type Rule } from "../src/rules/ledger";
import { build, DEFAULT_DESIGN, type Design } from "../src/ui/design";
import { sectionCurveProblem, SECTION_INPUT } from "../src/geometry/section-input";
import { INPUT_BOUNDS } from "../src/claude/tools";
import type { ShankStation } from "../src/geometry/shank";
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

/** 受ける石の大きさの上限（mm）。画面のつまみ（3〜14 mm）より広く、測った大きな石も受ける */
const STONE_MAX_MM = 25;

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
    // 上の限りは指輪の石として考えられる大きさ（40 mm の石でも「作れる」と返していた。2026-11-07 の試し）
    long_mm: z.number().positive().max(STONE_MAX_MM, `長辺は ${STONE_MAX_MM} mm までにしてください（指輪の石として大きすぎます）`).optional().describe("長辺（mm、ノギスで測った値）。preset のときは必ず。輪郭の点のときは、なければ点から測る"),
    width_mm: z.number().positive().max(STONE_MAX_MM, `幅は ${STONE_MAX_MM} mm までにしてください`).optional().describe("幅（mm）。なければ形から（丸は長辺と同じ）"),
    depth_mm: z.number().positive().max(STONE_MAX_MM, `深さは ${STONE_MAX_MM} mm までにしてください`).describe("深さ（mm、テーブルからキューレットまで）"),
  })
  .describe("石。ガードル＝石の縁、キューレット＝石の一番下");

/** 断面の線の点（画面の中の Claude の set_shank と同じ書き方。確かめも同じ関数） */
const sectionCurvePoints = z
  .array(z.object({ x: z.number(), y: z.number() }))
  .describe(
    `断面の線の制御点（なめらかな線は点の内側を通る）。指の側はいつも平らで、外側の線だけを書く。x は幅の位置（−1〜1）、y は高さ（0 が指の側、1 がいちばん厚い所）。右の端の内側（y ＝ 0）→ 上 → 左の端の内側（y ＝ 0）の順に ${SECTION_INPUT.minPoints}〜${SECTION_INPUT.maxPoints} 個。同じ点を 3 回続けると、そこで線が折れる（稜線）`,
  );

const stationShape = z.object({
  at_deg: z.number().min(INPUT_BOUNDS.at_deg[0]).max(INPUT_BOUNDS.at_deg[1]).describe("いちばん上から指のまわりに測った角度（度）。90 が指の真横、180 がいちばん下"),
  width_mm: z.number().min(INPUT_BOUNDS.width_mm[0]).max(INPUT_BOUNDS.width_mm[1]).describe("この場所の幅（mm）"),
  thickness_mm: z.number().min(INPUT_BOUNDS.thickness_mm[0]).max(INPUT_BOUNDS.thickness_mm[1]).describe("この場所の厚み（mm）"),
  section: z.enum(["kouman", "hirauchi", "hangouman", "kaku"]).optional().describe("この場所の断面（省くと、ひとつ上の場所と同じ）"),
  section_curve: sectionCurvePoints.optional().describe("この場所の断面の線（section より先に使う）"),
  sway_mm: z.number().min(INPUT_BOUNDS.sway_mm[0]).max(INPUT_BOUNDS.sway_mm[1]).optional().describe("腕を指の向きへ寄せる量（mm）。片方の肩が指先へ寄ると、もう片方は付け根へ寄る。いちばん下では 0"),
});

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
    v_corners: z
      .boolean()
      .optional()
      .describe("尖った角を V 字の爪で包むか。true＝V 字の爪、false＝角に丸い爪を立てる普通の爪留め（継ぐの画面の既定）。省略すると形の処理の既定（V 字）"),
    shank_section: z
      .enum(["kouman", "hirauchi", "hangouman", "kaku"])
      .optional()
      .describe("腕の断面：kouman＝甲丸（既定）、hirauchi＝平打ち、hangouman＝半甲丸、kaku＝角（厚みを書かなければ幅と同じ）"),
    shank_section_curve: sectionCurvePoints.optional().describe("腕の断面の線（自由な形。shank_section より先に使う）。いちばん上（石座のそば）の断面"),
    shank_stations: z
      .array(stationShape)
      .max(INPUT_BOUNDS.stations[1])
      .optional()
      .describe("腕の場所ごとの形（角度の小さい順。左右は同じ）。石座のそばの形は shank_width_mm・shank_thickness_mm・断面で決まり、ここにはそれより下の場所を書く。間はなめらかにつながる"),
    shank_relief: z
      .object({
        pattern: z.enum(["arch", "diamond", "wave", "beads", "lines", "leaf", "mil", "blade"]).describe("模様：arch＝先の尖ったアーチの列、diamond＝菱の格子、wave＝波の線、beads＝粒のくぼみ、lines＝横の筋、leaf＝葉とつる、mil＝縁の粒、blade＝尖った葉"),
        across_from: z.number().min(0).max(1).optional().describe("彫る帯の内側（真ん中 0・腕の縁 1 の割合）"),
        across_to: z.number().min(0).max(1).optional().describe("彫る帯の外側"),
        count: z.number().int().min(INPUT_BOUNDS.relief_count[0]).max(INPUT_BOUNDS.relief_count[1]).optional().describe("片側の腕に並べる数。省くと 4"),
        depth_mm: z.number().min(INPUT_BOUNDS.relief_depth[0]).max(INPUT_BOUNDS.relief_depth[1]).optional().describe(`深さ（mm）。省くと ${GUIDES.band.relief.depthMm} mm`),
        from_deg: z.number().min(INPUT_BOUNDS.relief_deg[0]).max(INPUT_BOUNDS.relief_deg[1]).optional().describe("彫り始める角度（度）。省くと 25"),
        to_deg: z.number().min(INPUT_BOUNDS.relief_deg[0]).max(INPUT_BOUNDS.relief_deg[1]).optional().describe("彫り終わる角度（度）。省くと 100"),
        columns: z.number().int().min(INPUT_BOUNDS.relief_columns[0]).max(INPUT_BOUNDS.relief_columns[1]).optional().describe("幅の向きに並べる数。省くと 1"),
      })
      .optional()
      .describe("腕の外の面に彫る浅い模様（穴は開かない）"),
    shank_width_mm: z.number().min(1).max(10).optional().describe(`腕の幅（mm）。いちばん上（石座のそば）の幅。省略で ${GUIDES.shank.widthMm} mm`),
    prong_tip: z
      .enum(["round", "oni"])
      .optional()
      .describe("爪の先の形（爪留めだけ）：round＝丸い爪（シンプル）、oni＝尖り爪（先が尖り、石の上に少しかかる。尖り具合の数字は仮の目安）。省略すると帳面のベーシックの形、なければ丸い爪"),
    join: z
      .enum(["on", "between"])
      .optional()
      .describe("石座と腕の付け方（爪留めだけ）：on＝腕の上にのせる（腕の上に溝を入れてのせ、ロウ付け。既定）、between＝腕の間に挟む（腕の上を切り、腕の両端の間に、板を丸めた下の輪をはさんでロウ付け。職人の言う基本の作り方）"),
    shank_thickness_mm: z.number().min(0.5).max(5).optional().describe(`腕の厚み（mm）。いちばん上（石座のそば）の厚み。省略で ${GUIDES.shank.thicknessMm} mm（角は幅と同じ）`),
  })
  .optional()
  .describe("指輪の設計。省略した所は、爪・自動の本数・標準の太さ・標準の高さ・縦・K18 イエロー・11 号・上・甲丸の腕");

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
  steps: z
    .array(z.enum(MAKING_STEP_IDS as [MakingStepId, ...MakingStepId[]]))
    .optional()
    .describe(
      "param を付けない決まり（手の動かし方・道具の当て方など）のとき、作り方のどの工程で効くか。画面の作るのその工程に出る：" +
        Object.entries(MAKING_STEPS)
          .map(([k, v]) => `${k}＝${v}`)
          .join("、"),
    ),
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
    ...(stepsOfRule(r).length ? { steps: stepsOfRule(r).map((x) => MAKING_STEPS[x]) } : {}),
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
    ...(!parsed.param && parsed.steps?.length ? { steps: parsed.steps } : {}),
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

/** 道具の入力の、腕の場所ごとの形 → 形の処理の形。壊れた線・順がちがう場所は、分かる言葉で断る */
function stationsFrom(list: NonNullable<NonNullable<CheckRingInput["design"]>["shank_stations"]>): ShankStation[] {
  let prev = 0;
  return list.map((st) => {
    if (st.at_deg <= prev) throw new Error(`腕の場所は、角度の小さい順に書いてください（${prev}° の次が ${st.at_deg}°）`);
    prev = st.at_deg;
    if (st.at_deg >= 180 && st.sway_mm) throw new Error("いちばん下（180°）では、腕を指の向きへ寄せられません（sway_mm は 0）");
    const problem = st.section_curve ? sectionCurveProblem(st.section_curve) : null;
    if (problem) throw new Error(`${st.at_deg}° の場所の${problem}`);
    return {
      atDeg: st.at_deg,
      widthMm: st.width_mm,
      thicknessMm: st.thickness_mm,
      ...(st.section ? { section: st.section } : {}),
      ...(st.section_curve ? { section: "free" as const, curve: { points: st.section_curve } } : {}),
      ...(st.sway_mm ? { swayMm: st.sway_mm } : {}),
    };
  });
}

export function checkRingTool(ctx: ToolContext, input: CheckRingInput) {
  const parsed = z.object(checkRingShape).parse(input);
  const ledger = readLedger(ctx.ledgerPath);
  const stone = readyStone(parsed.stone);
  const d = parsed.design ?? {};
  if (d.shank_section_curve) {
    const problem = sectionCurveProblem(d.shank_section_curve);
    if (problem) throw new Error(problem);
  }
  const design: Design = {
    style: d.style ?? DEFAULT_DESIGN.style,
    prongCount: d.prong_count ?? DEFAULT_DESIGN.prongCount,
    prongScale: d.prong_scale ?? DEFAULT_DESIGN.prongScale,
    height: d.height ?? DEFAULT_DESIGN.height,
    orientation: d.orientation ?? DEFAULT_DESIGN.orientation,
    metal: d.metal ?? DEFAULT_DESIGN.metal,
    gou: d.gou ?? DEFAULT_DESIGN.gou,
    position: d.position ?? DEFAULT_DESIGN.position,
    vCorners: d.v_corners,
    section: d.shank_section_curve ? "free" : d.shank_section,
    sectionCurve: d.shank_section_curve ? { points: d.shank_section_curve } : undefined,
    stations: d.shank_stations?.length ? stationsFrom(d.shank_stations) : undefined,
    relief: d.shank_relief ? { kind: d.shank_relief.pattern, count: d.shank_relief.count ?? 4, depthMm: d.shank_relief.depth_mm ?? GUIDES.band.relief.depthMm, fromDeg: d.shank_relief.from_deg ?? 25, toDeg: d.shank_relief.to_deg ?? 100, columns: d.shank_relief.columns, ...(d.shank_relief.across_from !== undefined && d.shank_relief.across_to !== undefined ? { across: [d.shank_relief.across_from, d.shank_relief.across_to] as const } : {}) } : undefined,
    shankWidthMm: d.shank_width_mm,
    shankThicknessMm: d.shank_thickness_mm,
    join: d.join,
    prongTip: d.prong_tip ?? ledger.basics?.prongTip,
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
      join: s.join,
      prong_tip: s.prongTip,
      metal: metalName(design.metal),
      gou: design.gou,
      position: design.position,
      shank: {
        section: ring.shank.section,
        width_mm: round(ring.shank.widthMm),
        thickness_mm: round(ring.shank.thicknessMm),
        ...(ring.shank.along ? { min_width_mm: round(ring.shank.minWidthMm ?? ring.shank.widthMm), min_thickness_mm: round(ring.shank.minThicknessMm ?? ring.shank.thicknessMm) } : {}),
      },
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
