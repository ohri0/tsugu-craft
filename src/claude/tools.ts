// Claude に渡す道具の定義（docs/SPEC.md「道具」の表のとおり：set_setting / set_shank / check / look）と、
// 聞き取りで職人の決まりを目安帳に足すための propose_rule、
// 教える画面で、目安帳では答えられない生徒の質問を「先生に聞くこと」に回す ask_teacher。
// 道具は人のボタンと同じ関数で動く。その関数は画面が ToolHost として用意する（ここでは形だけ決める）。
// 道具の入力と結果は Claude とやり取りするので、名前は snake_case にそろえる。
import { MAKING_STEPS, MAKING_STEP_IDS, type MakingStepId } from "../rules/making.js";
import { GUIDE_NOTE, GUIDES } from "../rules/guides.js";
import { PARAMS, type ParamId } from "../rules/ledger.js";
import { SECTION_INPUT, sectionCurveProblem } from "../geometry/section-input.js";
import type { ReliefKind } from "../geometry/shank-relief.js";
import { MILGRAIN_OFFERED } from "../geometry/finish.js";
import type { holdForClaude } from "../rules/tension-hold.js";
import type { ClaudeTool } from "./wire.js";

export const TOOL_NAMES = ["set_setting", "set_shank", "check", "look", "propose_rule", "ask_teacher", "set_stones", "choose_stone"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** 指輪の形を変える道具。最初に呼ばれる前に、戻すための写しを取る。 */
export const CHANGING_TOOLS: readonly ToolName[] = ["set_setting", "set_shank", "set_stones", "choose_stone"];

export function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

/**
 * 1 回だけ呼んで結果を受け取る道具（組み立て直す：src/rebuild/tools.ts・src/rebuild/restore-tools.ts、赤ペン：src/claude/redpen.ts、聞き取り：src/claude/gap.ts）。
 * 定義はそちらに置き、サーバーが「継ぐ」の道具として通す名前だけをここに書く。
 */
export const STRUCTURED_TOOL_NAMES = ["propose_process", "grade_process", "red_pen", "make_band", "sort_tips", "ask_gap", "gap_rule", "propose_restoration"] as const;

/** サーバー（api/claude.ts）が通す道具の名前 */
export function isAllowedToolName(name: string): boolean {
  return isToolName(name) || (STRUCTURED_TOOL_NAMES as readonly string[]).includes(name);
}

// ---- 入力 ----

/** 「石もおまかせ」で Claude が選べる、よくある形（画面の石の札 src/studio/presets.ts の id と同じ。テストで確かめる） */
export const STONE_SHAPES = ["round", "oval", "princess", "emerald", "pear", "marquise"] as const;
export type StoneShape = (typeof STONE_SHAPES)[number];

/** 石もおまかせのとき、石の形と大きさを選ぶ */
export interface ChooseStoneInput {
  shape: StoneShape;
  /** 長辺（mm）。幅と深さは、形の例の比から決まる */
  long_mm: number;
  reason: string;
}

export interface ChooseStoneResult {
  shape_name: string;
  long_mm: number;
  width_mm: number;
  /** 例の比から出した深さ（測った値ではない） */
  depth_mm: number;
  /** 新しい石の説明（輪郭の点の数と尖った角。爪の位置を決めるのに使う） */
  stone: string;
  note: string;
}

/** 聞き取りで、職人の言葉を決まりにして目安帳に足す案 */
export interface ProposeRuleInput {
  title: string;
  text: string;
  reason: string;
  example?: string;
  /** 職人の言葉そのまま（言い換えないで残す） */
  quote?: string;
  param?: ParamId;
  value?: number;
  /** 石の大きさで値を変えるとき（小さい順）。最後の段より大きい石は最後の値 */
  by_size?: { up_to_mm: number; value: number }[];
  /** 機械で確かめない決まりのとき、作り方のどの工程の決まりか */
  steps?: MakingStepId[];
  /** 職人が話した石の大きさ（mm。「このサイズ」なら今の設計の石の大きさ）。value はこの大きさの値 */
  stone_mm?: number;
  /**
   * 石の大きさごとの点。craftsman：職人が言った点。inferred：Claude が職人の点から割合で推し量った点（職人はまだ確かめていない）。
   * why：職人の点なら職人の言葉の短い引用、推測ならどう出したか
   */
  points?: ProposePoint[];
}

export interface ProposePoint {
  stone_mm: number;
  value: number;
  by: "craftsman" | "inferred";
  why: string;
}

export interface ProposeRuleResult {
  /** accepted：そのまま足した / edited：職人が直して足した / declined：足さなかった */
  status: "accepted" | "edited" | "declined";
  rule_id?: string;
  /** 職人が直した後の決まり、または見送った理由 */
  note?: string;
}

/** 目安帳では答えられない・職人でないと決められない生徒の質問を、先生に回す */
export interface AskTeacherInput {
  /** 生徒の質問（短く） */
  question: string;
  /** なぜ目安帳では答えられないか */
  why_unanswered: string;
  /** 先生が答えやすくなる、話の流れ（石の形、どの決まりの話か、など） */
  context?: string;
}

export interface AskTeacherResult {
  queued: true;
  /** 先生に聞くことの一覧での番号 */
  id: string;
}

export type SettingStyle = "prong" | "bezel" | "tension";
/** 並べた石の留め方（テンションは一粒だけ） */
export type SideStyle = "prong" | "bezel";
export type HeightChoice = keyof typeof GUIDES.height.options;
export type Orientation = "along" | "across";
/** 石座と腕の付け方：on＝腕の上にのせる、between＝腕の間に挟む */
export type Join = "on" | "between";
/** テンションの挟む向き：short＝狭い幅を挟む、long＝長い向きを挟む、corner＝向かい合う角をくぼみに */
export type TensionGripChoice = "short" | "long" | "corner";
export type Metal = "pt900" | "k18yg" | "k18wg" | "k18pg" | "sv925" | "shakudo" | "shibuichi" | "copper";
/** 煮色（にいろ）で色を出す色金（伝統の仕上げ） */
export const IROGANE = ["shakudo", "shibuichi", "copper"] as const satisfies readonly Metal[];
export const isIrogane = (m: Metal): m is (typeof IROGANE)[number] => (IROGANE as readonly string[]).includes(m);

/** 伝統の仕上げの入力（set_shank の finish）。書いた項目だけが変わる。none でなくす */
export interface FinishInput {
  tsuchime?: "none" | "small" | "medium" | "large";
  /** 槌目の種類：maru＝丸槌目、kaku＝角槌目（平槌目）、tate＝縦槌目（筋目）、arashi＝荒らし槌目 */
  tsuchime_style?: "maru" | "kaku" | "tate" | "arashi";
  tsuchime_area?: "outer" | "all";
  milgrain?: "none" | "edges";
  inlay?: "none" | "nunome";
}
export const FINISH_KEYS = { tsuchime: ["none", "small", "medium", "large"], tsuchime_style: ["maru", "kaku", "tate", "arashi"], tsuchime_area: ["outer", "all"], milgrain: ["none", "edges"], inlay: ["none", "nunome"] } as const;
/** Claude に出す仕上げの項目（ミル打ちは MILGRAIN_OFFERED のときだけ） */
export const FINISH_OFFERED_KEYS = (Object.keys(FINISH_KEYS) as (keyof typeof FINISH_KEYS)[]).filter((k) => MILGRAIN_OFFERED || k !== "milgrain");
export type View = "top" | "side" | "front" | "angle";

export type ProngTipChoice = "round" | "oni";

export interface SetSettingInput {
  style?: SettingStyle;
  /** 爪を置く輪郭の点の番号 */
  prong_positions?: number[];
  prong_count?: number;
  prong_mm?: number;
  /** 尖った角を V 字の爪で包むか */
  v_corners?: boolean;
  height?: HeightChoice;
  orientation?: Orientation;
  /** 石座と腕の付け方（爪留めだけ） */
  join?: Join;
  /** 爪の先の形（爪留めだけ）。round＝丸い爪、oni＝尖り爪 */
  prong_tip?: ProngTipChoice;
  /** 石の一番下（先）と指のすき間（mm）。腕の厚みより小さいと、石が腕に沈む */
  culet_gap_mm?: number;
  /** テンションの挟む向き（テンションだけ） */
  tension_grip?: TensionGripChoice;
  reason: string;
}

/** 石の並べ方：solo＝一粒、trio＝三石（真ん中 ＋ 両脇）、row＝横一列（同じ石を count 個） */
export type StoneLayout = "solo" | "trio" | "row";

export interface SetStonesInput {
  layout: StoneLayout;
  /** 横一列の石の数 */
  count?: number;
  /** 三石の両脇の石の長辺（mm） */
  side_mm?: number;
  /** 両脇の石（三石）・ほかの石の留め方 */
  side_style?: SideStyle;
  /** 石座どうしの間を、既定の間からさらに広げる長さ（mm） */
  spread_mm?: number;
  reason: string;
}

export interface SetStonesResult {
  layout: StoneLayout;
  stones: { no: number; at_mm: number; long_mm: number; style: SettingStyle }[];
  note: string;
}

/** 腕の断面。free は線で決めた形（Claude は section_curve を書くと free になる。section では選ばない） */
export type ShankSectionChoice = "kouman" | "hirauchi" | "hangouman" | "kaku" | "maru" | "free";

/** 断面の線：なめらかな線の制御点（右の端の内側 → 上 → 左の端の内側。x −1〜1・y 0〜1）。節は画面で描いたときだけ（Claude は書かない） */
export interface SectionCurveInput {
  points: { x: number; y: number }[];
  knots?: number[];
}

/** 腕の場所の形（石座のそばより下の場所）。左右は同じ */
export interface ShankStationInput {
  /** いちばん上から指のまわりに測った角度（度）。180 がいちばん下（手のひら側） */
  at_deg: number;
  width_mm: number;
  thickness_mm: number;
  /** この場所の断面（なければ、ひとつ上の場所と同じ） */
  section?: "kouman" | "hirauchi" | "hangouman" | "kaku";
  /** この場所の断面の線（section より先に使う） */
  section_curve?: SectionCurveInput;
  /** 腕を指の向きへ寄せる量（mm）。片方の肩が指先の側へ寄ると、もう片方は付け根の側へ寄る（S の字の流れ） */
  sway_mm?: number;
  /** ひとつ上の場所からここまでを、なめらかにつながず段で変える（段々の肩） */
  step?: boolean;
}

/** 腕の彫り。pattern が none なら彫りをなくす */
export interface ShankReliefInput {
  pattern: "none" | ReliefKind;
  count?: number;
  depth_mm?: number;
  from_deg?: number;
  to_deg?: number;
  columns?: number;
  /** 彫る帯の内と外（真ん中 0・腕の縁 1 の割合。左右同じ） */
  across_from?: number;
  across_to?: number;
}

export interface SetShankInput {
  /** いちばん上（石座のそば）の幅 */
  width_mm?: number;
  /** いちばん上（石座のそば）の厚み */
  thickness_mm?: number;
  section?: ShankSectionChoice;
  /** 手で描いた断面の点（画面だけが使う。片側、真ん中のいちばん上 → 端の内側、0〜1） */
  section_points?: { x: number; y: number }[];
  /** いちばん上（石座のそば）の断面の線 */
  section_curve?: SectionCurveInput;
  /** 石座のそばより下の場所の形（小さい角度から順に）。空の並びは、どこも同じ形に戻す */
  stations?: ShankStationInput[];
  /** 腕の外の面に彫る模様 */
  relief?: ShankReliefInput;
  /** 重ねて彫る模様（縁の粒、肩の葉など）。空の並びでなくす */
  relief_more?: ShankReliefInput[];
  gou?: number;
  metal?: Metal;
  /** 伝統の仕上げ（槌目・ミル打ち・布目象嵌） */
  finish?: FinishInput;
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
  /** 尖った角を V 字の爪で包む設定か */
  v_corners: boolean;
  height: HeightChoice;
  /**
   * テンションのとき：図面の開き（mm）と、両はしの深さ（mm。pit＝角のくぼみ、groove＝辺の溝）、挟む向きと選べる向き、
   * 石の入れ方（形から決まる動き）、横に止める物がないか、腕の幅の外へ出る長さ（片側 mm）
   */
  tension?: {
    gap_mm: number;
    ends: { kind: "pit" | "groove"; depth_mm: number }[];
    grip: TensionGripChoice;
    grips: TensionGripChoice[];
    insert: string;
    no_side_stop: boolean;
    overhang_mm: number;
  };
  orientation: Orientation;
  /** 石座と腕の付け方 */
  join: Join;
  /** 爪の先の形 */
  prong_tip: ProngTipChoice;
  /** 覆輪の壁の厚み（爪のときは null） */
  bezel_wall_mm: number | null;
}

export interface SetSettingResult {
  setting: SettingState;
  hold: HoldReport;
  note?: string;
}

export interface ShankState {
  /** いちばん上（石座のそば）の幅 */
  width_mm: number;
  /** いちばん上（石座のそば）の厚み */
  thickness_mm: number;
  section: ShankSectionChoice;
  gou: number;
  inner_diameter_mm: number;
  metal: Metal;
  /** 場所ごとの形（どこも同じ形ならなし）：置いた場所の角度と、そこの幅・厚み */
  stations?: { at_deg: number; width_mm: number; thickness_mm: number }[];
  /** 腕の彫り（なければなし）：実際に彫る角度と、彫りの下に残る厚み */
  relief?: { pattern: string; count: number; depth_mm: number; from_deg: number; to_deg: number; under_mm: number };
  /** ぐるりと見て、いちばん細い幅といちばん薄い厚み（確かめの目安と比べる数） */
  min_width_mm?: number;
  min_thickness_mm?: number;
  /** 伝統の仕上げ（なければ鏡面） */
  finish?: FinishState;
}

/** 伝統の仕上げの今の状態（Claude への返事） */
export interface FinishState {
  tsuchime?: "small" | "medium" | "large";
  tsuchime_style?: "maru" | "kaku" | "tate" | "arashi";
  tsuchime_area?: "outer" | "all";
  tsuchime_mark_mm?: number;
  milgrain?: "edges";
  milgrain_beads?: number;
  milgrain_bead_mm?: number;
  inlay?: "nunome";
  /** ふつうの言葉で */
  words: string;
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
  tool_hint?: { tool: "set_setting"; input: Partial<SetSettingInput> } | { tool: "set_shank"; input: Partial<SetShankInput> } | { tool: "set_stones"; input: Partial<SetStonesInput> };
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
  /**
   * 止めない注意（作れない所ではない）。腕の幅の黄色（細め）・オレンジ（かなり細い）、手で彫る細い溝。
   * problems とちがい、直さなくても作れる。お客さまの希望が細さなら、そのままでよい
   */
  cautions: { check: string; level: "yellow" | "orange"; where: string; current: string; text: string }[];
  note: string;
  /**
   * テンションのとき：地金ごとの大まかな計算（どれだけ小さめに作り、どれだけ広げて入れるか。合否にしない・最後は職人が決める）。
   * 作れない所ではないが伝えること（cautions）も入れる
   */
  tension_calc?: {
    state: "hardened" | "annealed";
    state_label: string;
    stone_span_mm: number | null;
    gap_mm: number | null;
    need_mm: number | null;
    need: string;
    can_slide: boolean;
    metals: {
      metal: string;
      provisional: boolean;
      limit_mm: number | null;
      limit_thick_ring_mm: number | null;
      verdict: "room" | "tight" | "short";
      smaller_by_mm: number | null;
      smaller_by_max_mm: number | null;
      make_gap_mm: number | null;
      spread_mm: number | null;
      grip_mm: number | null;
      stays_bent_mm: number | null;
      slide_smaller_by_mm: number | null;
    }[];
    note: string;
    cautions: { title: string; text: string }[];
    /** 外れにくさの目安（今の地金・今の深さ。落とす高さと摩擦は仮。合否にしない。src/rules/tension-hold.ts） */
    hold?: ReturnType<typeof holdForClaude>;
  };
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
  /** 決まりの案を職人に見せ、承認を待つ（聞き取りの画面だけが用意する） */
  proposeRule?(input: ProposeRuleInput): Awaitable<ProposeRuleResult>;
  /** 生徒の質問を「先生に聞くこと」に足す（教える画面だけが用意する） */
  askTeacher?(input: AskTeacherInput): Awaitable<AskTeacherResult>;
  /** 石を並べる（三石・横一列。指輪の作業の画面だけが用意する） */
  setStones?(input: SetStonesInput): Awaitable<SetStonesResult>;
  /** 石の形と大きさを選ぶ（「石もおまかせ」の生成だけが用意する。なければ、道具は断る） */
  chooseStone?(input: ChooseStoneInput): Awaitable<ChooseStoneResult>;
  snapshot(): S;
  restore(snapshot: S): void;
}

// ---- 入力の受け付け範囲 ----
// 職人の目安ではなく「明らかにおかしい値を道具に通さない」ための範囲。目安との比べは check がする。

/** 腕の幅の 3 段の言葉（Claude に渡す。値は guides.ts、職人 石川の決まり 2026-11-06） */
export const BAND_WIDTH_WORDS = `腕の幅は ${GUIDES.band.widthYellowMm} mm 以下で黄色の注意、${GUIDES.band.widthOrangeMm} mm より細いとオレンジの注意（どちらも止めない。cautions に出る）、${GUIDES.band.minWidthMm} mm 以下は赤（problems に出る。作れなくはないが職人の決まりで赤）。帳面で工房ごとに変わることがある`;

export const INPUT_BOUNDS = {
  prong_count: [3, 8],
  prong_mm: [0.3, 3],
  prong_position: [0, 9999],
  value: [0, 100],
  width_mm: [GUIDES.band.inputMinWidthMm, 10],
  thickness_mm: [0.8, 5],
  gou: [1, 30],
  count: [GUIDES.multi.rowCount[0], GUIDES.multi.rowCount[2]],
  side_mm: [1.5, 12],
  spread_mm: [0, 3],
  at_deg: [15, 180],
  sway_mm: [-2, 2],
  stations: [0, 4],
  relief_count: [1, 60],
  relief_across: [0, 1],
  relief_more: [0, 3],
  relief_depth: [0.1, 0.5],
  relief_deg: [15, 180],
  relief_columns: [1, 3],
  stone_long_mm: [3, 14],
  /** 決まりの点の石の大きさ（mm。石の大きさの段と同じ範囲） */
  stone_size_mm: [0.5, 30],
  culet_gap_mm: [GUIDES.height.minFingerGapMm, 6],
} as const;

// ---- 道具の定義（Claude に見せる説明つき） ----

const h = GUIDES.height;
const heightText = `low＝低め（石の一番下と指のすき間が最低の ${h.minFingerGapMm} mm）、standard＝標準（＋${h.options.standard} mm）、high＝高め（＋${h.options.high} mm）。高いほど光が入り石が大きく見えるが、引っかかりやすく、爪が長くなって弱くなる`;
const range = (k: keyof typeof INPUT_BOUNDS, unit = "") =>
  `${INPUT_BOUNDS[k][0]}〜${INPUT_BOUNDS[k][1]}${unit}`;

/** 断面の線の入力の形（set_shank のいちばん上の断面と、場所ごとの断面で同じ） */
/**
 * 腕の彫りの模様の名前（geometry/shank-relief.ts の RELIEF_KINDS と同じ並び。tests/shank-loft.test.ts が見る）。
 * ここに置くのは、公開先の関数（api/claude.ts）がこのファイルだけを読むため（形の処理を持ち込まない）
 */
export const RELIEF_PATTERNS = ["arch", "diamond", "wave", "beads", "lines", "leaf", "mil", "blade", "chevron", "zigzag", "fan", "steps", "panel", "flutes"] as const satisfies readonly ReliefKind[];

/**
 * 模様の説明。線の性格ごとにまとめる（どの言葉にどれ、とは決めない。Claude が言葉の性格から選ぶ）
 */
export const RELIEF_PATTERN_WORDS =
  "直線・水平と垂直・平らな面の模様：steps＝段の窓（長方形の窓の中が、平らな面のまま段々に深くなる。小さな四角い石を並べた列のようにも見える）、panel＝長方形の区切り（細長い長方形の窓の列。輪郭の線と浅い平らな底）、flutes＝平行の溝（腕に沿って続く細い溝を、幅の向きに等しい間で並べる）、lines＝腕を横切る筋。" +
  "幾何学の繰り返し・角の立つ模様：chevron＝山形（V の線が腕に沿って重なる。先は石座の側を向き、列の真ん中で左右対称）、zigzag＝ジグザグ（腕に沿う、角の立った折れ線）、diamond＝菱の格子。" +
  "中心から広がる模様：fan＝扇（かなめから骨が石座の側へ広がり、外の弧で閉じる。日の出のような放射。平らな面に、片側 1〜2 つを大きく）。" +
  "縦に高く伸びて先が尖る模様：arch＝先の鋭く尖った縦長の窓（幅があれば、中に 2 つの小窓と丸窓）、blade＝尖った葉（肩に少しだけ）。" +
  "曲線・やわらかい模様：wave＝腕に沿う波の線、leaf＝葉とつる、beads＝丸い粒のくぼみの列。" +
  "縁を飾る：mil＝縁の粒（帯の上面を削って粒を連ねる。縁取りの上に）";

const SECTION_CURVE_SCHEMA = {
  type: "object",
  description:
    "断面の線。なめらかな線（3 次の B スプライン）の制御点で書く。線は点を通らず、点のつくる折れ線の内側を通る（最初と最後の点は通る）。" +
    "指の側（内側）はいつも平らで、ここには外側の線だけを書く。x は幅の位置（−1 が左の端・1 が右の端）、y は高さ（0 が指の側、1 がいちばん厚い所）。実際の大きさは幅と厚みの数で決まり、線は幅いっぱい・厚みいっぱいに伸ばされる。" +
    `右の端の内側（x > 0, y ＝ 0）から、上を通って、左の端の内側（x < 0, y ＝ 0）へ順に、${SECTION_INPUT.minPoints}〜${SECTION_INPUT.maxPoints} 個。` +
    "稜線や角を立てたい所は、同じ点を 3 回続けて書く（そこで線が折れて、点を通る）。2 回なら少し丸い角。くぼみは、両わきより低い点を置く。左右はちがってもよい。" +
    "例：真ん中に稜線が立つ断面 [{x:1,y:0},{x:1,y:0.35},{x:0.55,y:0.55},{x:0,y:1},{x:0,y:1},{x:0,y:1},{x:-0.55,y:0.55},{x:-1,y:0.35},{x:-1,y:0}]。" +
    "建築のモールディングのように、段・溝・縁取りを重ねることもできる（片側を書いて折り返す。端から順に：壁 → 縁取り（少し高い帯）→ 溝（低く平らな底）→ 細い段 → 稜線）。例の片側 [{x:1,y:0},{x:1,y:0.3},{x:1,y:0.48},{x:0.98,y:0.62},{x:0.8,y:0.68},{x:0.76,y:0.5},{x:0.7,y:0.48},{x:0.46,y:0.48},{x:0.42,y:0.6},{x:0.34,y:0.62},{x:0,y:1},{x:0,y:1}]。" +
    `作れる形に：縁取りや段の幅は 0.45 mm くらいから、溝の底の厚みは ${GUIDES.band.valleyMinMm} mm 以上（check が見る）。溝の幅は ${GUIDES.band.grooveCastMinMm} mm 以上なら鋳造で出る。それより細い溝も入れてよいが、鋳造では出ないので、デザインの印として残し、あとから手で彫る（止まらない。check の note で知らせる）。幅は 3〜5 mm あると段と溝が読め、線の性格が強い言葉なら肩で ${INPUT_BOUNDS.width_mm[1]} mm まで使える。`,
  properties: {
    points: {
      type: "array",
      items: {
        type: "object",
        properties: { x: { type: "number" }, y: { type: "number" } },
        required: ["x", "y"],
        additionalProperties: false,
      },
    },
  },
  required: ["points"],
  additionalProperties: false,
} as const;

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
          enum: ["prong", "bezel", "tension"],
          description:
            `留め方。prong＝爪留め、bezel＝覆輪（石の縁をぐるりと壁で包む。いちばん取れにくいが、見た目が大きく変わる）、tension＝テンション（開いた腕の両はしで石を挟む。三角の石は、片方の端のくぼみに角の先を ${GUIDES.tension.cornerPitMm} mm、もう片方の端の溝に辺を ${GUIDES.tension.edgeGrooveMm} mm 入れる（tension_grip の corner なら、いちばん長い辺の両はしの角を、両方くぼみに ${GUIDES.tension.longCornerPitMm} mm。作者が本物の指輪で使った向きと深さ）。職人の値。腕は φ${GUIDES.tension.wireMm} mm の丸線に替わる。地金は加工硬化した硬い状態が条件。爪・高さ・向きの項目は使わない。挟む向きは tension_grip。check の tension_calc に、地金ごとの大まかな計算がある）`,
        },
        prong_positions: {
          type: "array",
          items: { type: "integer" },
          description:
            "爪を置く場所。石の輪郭の点の番号（読み取りで渡した番号）で書く。省くと、尖った角を先に守り、残りを縁に均等に配る。爪留めのときだけ使う。番号は機械のためのもので、人に見える文には書かない",
        },
        prong_count: {
          type: "integer",
          description: `爪の本数（${range("prong_count", " 本")}）。V 字の爪も 1 本と数える。爪留めのときだけ使う`,
        },
        prong_mm: {
          type: "number",
          description: `爪の太さ（mm、${range("prong_mm", " mm")}）。省くと石の大きさから出した標準の太さ。太いほど強いが、少し重く見える`,
        },
        v_corners: {
          type: "boolean",
          description:
            "尖った角を V 字の爪で包むか。今は形の出来が足りないので、true にしても V 字にならず、丸い爪を角に立てる普通の爪留めになる（結果の note で知らせる）",
        },
        height: { type: "string", enum: ["low", "standard", "high"], description: `石座の高さ。${heightText}` },
        culet_gap_mm: {
          type: "number",
          description: `石の一番下（先）と指のすき間（mm、${range("culet_gap_mm", " mm")}）。height より細かく決める。腕の厚みより小さくすると、石が腕に沈み、腕の上を石の形に自動で削る（ザグり）。腕を厚くして join を on にしたときに、石を腕の間に収めて一体に見せる。石の下に残る地金も腕なので、1 mm くらいは残す（腕の厚みの公開の目安を借りた。最後は職人が決める）`,
        },
        orientation: {
          type: "string",
          enum: ["along", "across"],
          description: "石の向き。along＝長辺を指に沿って縦、across＝長辺を指を横切る向きに",
        },
        tension_grip: {
          type: "string",
          enum: ["short", "long", "corner"],
          description:
            "テンションで石のどこを挟むか（テンションのときだけ。石の形で選べないものは、自動で short になる。三角は short と corner、しずく形は short だけ）。short＝いちばん狭い幅を挟む（長い向きは腕の幅の外へ出る。三角は角をくぼみ・向かいの辺を溝に）、long＝長い向きを挟む（短い辺や丸い端を溝に。開きは広くなる）、corner＝向かい合う 2 つの角をくぼみに（横にずれないが、挟む力が角の先にかかる。三角は、いちばん長い辺の両はしの角を挟み、残りの角は腕の幅の外へ出る。作者の本物の指輪はこの向き）",
        },
        prong_tip: {
          type: "string",
          enum: ["round", "oni"],
          description:
            "爪の先の形（爪留めのときだけ）。省くと今のまま（はじめは工房の帳面のベーシックの形）。round＝丸い爪（シンプル。先を丸める）、oni＝尖り爪（先が尖り、石の上に少しかかる。シャープな見た目）。太さとは別に選ぶ。尖り爪の尖り具合の数字は仮の目安で、最後は職人が決める",
        },
        join: {
          type: "string",
          enum: ["on", "between"],
          description:
            "石座と腕の付け方（爪留めのときだけ）。on＝腕の上にのせる（腕の上に溝を入れて石座をのせ、ロウ付け）、between＝腕の間に挟む（腕のいちばん上を切り、腕の両端の間に、板を丸めた下の輪をはさんでロウ付け。職人の言う基本の作り方）",
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
      "腕（リングの輪の部分）を変える。書いた項目だけが変わり、省いた項目は今のまま。変えたあとの寸法と、指輪のおおよその重さを返す。" +
      "腕の形は自由に決められる：断面の線（section_curve）と、腕の場所ごとの幅・厚み・断面・流れ（stations）。" +
      "内径は号で決まり、形を変えても変わらない。腕の端と石座のつなぎは、石座のそばの形でできる。丸線の腕とテンションには、section_curve と stations は使えない。",
    // この道具だけ strict にしない。strict の省ける項目は 1 回の呼び出しで全部合わせて 24 までで（API の上限。超えると 400 で断られ、生成が止まる）、
    // この道具だけで 26 ある。入力は parseToolCall で確かめ、知らない項目や形の違いは断って、理由を Claude に返す。見張りは tests/strict-limits.test.ts
    input_schema: {
      type: "object",
      properties: {
        section: {
          type: "string",
          enum: ["kouman", "hirauchi", "hangouman", "kaku", "maru"],
          description:
            "腕の断面（決まった形。自由な形は section_curve）。kouman＝甲丸（内側が平らで外側が丸い。既定）、hirauchi＝平打ち（外側が平らで角が丸い）、hangouman＝半甲丸（端に少し壁があり、上がゆるい丸み）、kaku＝角（四角に近く、角だけ少し丸い。厚みを書かなければ幅と同じ）、maru＝丸線（内側も丸い。厚みを書かなければ幅と同じ）",
        },
        section_curve: { ...SECTION_CURVE_SCHEMA, description: `いちばん上（石座のそば）の${SECTION_CURVE_SCHEMA.description}` },
        width_mm: { type: "number", description: `いちばん上（石座のそば）の腕の幅（mm、${range("width_mm", " mm")}）。目安の初期値は ${GUIDES.shank.widthMm} mm` },
        thickness_mm: {
          type: "number",
          description: `いちばん上（石座のそば）の腕の厚み（mm、${range("thickness_mm", " mm")}）。目安の初期値は ${GUIDES.shank.thicknessMm} mm`,
        },
        stations: {
          type: "array",
          description:
            `腕の場所ごとの形（${range("stations", " か所")}、角度の小さい順。空の並びは、どこも同じ形に戻す）。左右は同じ。いちばん上の形は width_mm・thickness_mm・断面で決まり、ここにはそれより下の場所を書く。間はなめらかにつながる。` +
            "肩を細く・太くする、下を薄く軽くする、上は稜線で下は指に沿う丸みにする、腕を S の字に流す、などに使う。石座のそばは、腕の端が石座に当たるので、いちばん上の形のまま保たれる（石の大きさで約 20〜40° まで）。" +
            `どの場所も、厚み ${GUIDES.band.minThicknessMm} mm 以上（目安）と、腕の幅の職人の決まりを check で見る（${BAND_WIDTH_WORDS}）。`,
          items: {
            type: "object",
            properties: {
              at_deg: { type: "number", description: `いちばん上から指のまわりに測った角度（度、${range("at_deg")}）。90 が指の真横、180 がいちばん下（手のひら側）` },
              width_mm: { type: "number", description: `この場所の幅（mm、${range("width_mm", " mm")}）` },
              thickness_mm: { type: "number", description: `この場所の厚み（mm、${range("thickness_mm", " mm")}）` },
              section: { type: "string", enum: ["kouman", "hirauchi", "hangouman", "kaku"], description: "この場所の断面（決まった形）。省くと、ひとつ上の場所と同じ" },
              section_curve: { ...SECTION_CURVE_SCHEMA, description: "この場所の断面の線。書き方はいちばん上の section_curve と同じ。section より先に使う" },
              sway_mm: { type: "number", description: `腕を指の向きへ寄せる量（mm、${range("sway_mm", " mm")}）。片方の肩が指先の側へ寄ると、もう片方は付け根の側へ寄り、腕が S の字に流れる。いちばん下（180°）では 0` },
              step: {
                type: "boolean",
                description:
                  "true なら、ひとつ上の場所からこの場所までを、なめらかにつながず段で変える（ひとつ上の幅・厚み・断面のまま進み、この場所の手前で短い立ち上がりで替わる。階段の段）。" +
                  "肩に 2〜3 か所、10〜15° おきに置き、幅を 0.6〜1 mm・厚みを 0.3〜0.5 mm ずつ減らすと、石座から段々に下がる肩になる（上からも横からも段が見える）。省くと、なめらかにつなぐ",
              },
            },
            required: ["at_deg", "width_mm", "thickness_mm"],
            additionalProperties: false,
          },
        },
        relief: {
          type: "object",
          description:
            "腕の外の面に彫る、細い線の模様（穴は開かない）。左右の腕に同じように彫る。石座のそば（腕の端）と腕の縁には彫らない。はじめと終わりはなめらかに消え、腕が細くなる所では模様も小さくなる。薄い所では自動で浅くなる。" +
            `彫った所の下に残る厚みは check が見る（${GUIDES.band.relief.minUnderMm} mm 以上。仮の目安）。作者が彫る本物の彫りの代わりではなく、形の案。`,
          properties: {
            pattern: {
              type: "string",
              enum: ["none", ...RELIEF_PATTERNS],
              description: `模様。${RELIEF_PATTERN_WORDS}、none＝彫りをなくす`,
            },
            count: { type: "integer", description: `片側の腕に並べる数（${range("relief_count", " つ")}）。省くと 4。平行の溝では、はじめと終わりの消える長さだけが変わる（溝の数は幅で決まる）` },
            depth_mm: { type: "number", description: `彫りの深さ（mm、${range("relief_depth", " mm")}）。省くと ${GUIDES.band.relief.depthMm} mm` },
            from_deg: { type: "number", description: `彫り始める場所（いちばん上からの角度、度、${range("relief_deg")}）。省くと 25` },
            to_deg: { type: "number", description: `彫り終わる場所（度、${range("relief_deg")}）。省くと 100。指の真横が 90` },
            columns: { type: "integer", description: `幅の向きに並べる数（${range("relief_columns", " 列")}）。省くと 1。真ん中に稜線のある断面では 2 にすると稜線の両側に並ぶ。尖った窓は、面が広いと自動で列が増える（縦に細長いまま）` },
            across_from: { type: "number", description: "彫る帯の内側（真ん中 0・腕の縁 1 の割合。外の面の線の長さで測る。左右同じ）。断面の溝や縁取りに模様を収めるときに書く。across_to と一緒に" },
            across_to: { type: "number", description: "彫る帯の外側（across_from より大きく）" },
          },
          required: ["pattern"],
          additionalProperties: false,
        },
        relief_more: {
          type: "array",
          description: `重ねて彫る模様（${range("relief_more", " つ")}。relief があるときだけ。空の並びでなくす）。溝の中に 1 つの模様、縁取りの上に粒、肩に別の模様、のように場所を分けると、断面と彫りが一体に見える`,
          items: {
            type: "object",
            properties: {
              pattern: { type: "string", enum: [...RELIEF_PATTERNS], description: "模様。relief と同じ" },
              count: { type: "integer", description: "片側の腕に並べる数" },
              depth_mm: { type: "number", description: "深さ（mm）" },
              from_deg: { type: "number", description: "彫り始める場所（度）" },
              to_deg: { type: "number", description: "彫り終わる場所（度）" },
              columns: { type: "integer", description: "帯の中の列の数" },
              across_from: { type: "number", description: "彫る帯の内側（真ん中 0・腕の縁 1 の割合）" },
              across_to: { type: "number", description: "彫る帯の外側" },
            },
            required: ["pattern"],
            additionalProperties: false,
          },
        },
        gou: { type: "integer", description: `指輪のサイズ（日本の号数、${range("gou", " 号")}）。号数から内径が決まる` },
        metal: {
          type: "string",
          enum: ["pt900", "k18yg", "k18wg", "k18pg", "sv925", ...IROGANE],
          description:
            "地金。pt900＝プラチナ、k18yg＝18 金イエロー、k18wg＝18 金ホワイト、k18pg＝18 金ピンク、sv925＝シルバー。" +
            "色金（いろがね。煮色＝にいろ で色を出す伝統の地金）：shakudo＝赤銅（煮色で紫がかった黒）、shibuichi＝四分一（煮色で銀灰）、copper＝銅（煮色で赤茶）。「四分一の煮色に」なら shibuichi",
        },
        finish: {
          type: "object",
          description:
            "伝統の仕上げ（彫金・鍛金の技）。書いた項目だけが変わり、none でなくす。" +
            `tsuchime＝槌目（金づちの跡を模様として残す。small・medium・large は跡の大きさ ${GUIDES.finish.tsuchime.small.markMm}・${GUIDES.finish.tsuchime.medium.markMm}・${GUIDES.finish.tsuchime.large.markMm} mm、仮の値）、` +
            `tsuchime_style＝槌目の種類（maru＝丸槌目：丸いくぼみ。kaku＝角槌目・平槌目：平らな小さな面。tate＝縦槌目・筋目：腕に沿って細長い跡。arashi＝荒らし槌目：細かく密で、つやを抑える。大きさは選ばず ${GUIDES.finish.tsuchimeStyle.arashi.markMm} mm。省くと丸槌目）、` +
            "tsuchime_area＝打つ所（outer＝腕の外側、all＝外側と横）、" +
            (MILGRAIN_OFFERED ? `milgrain＝ミル打ち（edges＝腕の外の面の両縁の細い縁に、ø${GUIDES.finish.milgrain.beadMm} mm の粒を一列ずつ、半分沈めて並べる。形と STL に入る）、` : "") +
            "inlay＝象嵌（nunome＝布目象嵌：腕の真ん中に、色のちがう地金の帯の模様）。" +
            `槌目は跡の深さだけ腕が薄くなる${MILGRAIN_OFFERED ? "。ミルの粒は腕の幅に収まる必要がある" : ""}（check が見る）`,
          properties: {
            tsuchime: { type: "string", enum: [...FINISH_KEYS.tsuchime], description: "槌目の跡の大きさ。none でやめる" },
            tsuchime_style: { type: "string", enum: [...FINISH_KEYS.tsuchime_style], description: "槌目の種類。省くと今の種類（はじめは maru）" },
            tsuchime_area: { type: "string", enum: [...FINISH_KEYS.tsuchime_area], description: "槌目を打つ所。省くと outer" },
            ...(MILGRAIN_OFFERED ? { milgrain: { type: "string", enum: [...FINISH_KEYS.milgrain], description: "ミル打ち。none でやめる" } } : {}),
            inlay: { type: "string", enum: [...FINISH_KEYS.inlay], description: "象嵌。none でやめる" },
          },
          additionalProperties: false,
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
      `cautions は止めない注意で、作れない所ではない（${BAND_WIDTH_WORDS}）。注意だけなら直さなくてよく、希望が細さなら、そのままにする。` +
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
  {
    name: "propose_rule",
    description:
      "聞き取りで、職人の答えを 1 つの決まりにまとめ、目安帳に足す案として職人に見せる。職人が承認・直す・見送るのを待ち、その結果を返す。" +
      "決まりは「判断と理由」だけ（作り方の手順は書かない）。職人の言葉を勝手に強めたり数字を足したりしない。" +
      "機械で確かめられる値に当たるときだけ param と value を付ける（単位は param の説明のとおり）。当たらないときは付けず、言葉だけの決まりにする。",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "短い名前（例：鋳造の爪の根元）" },
        text: { type: "string", description: "決まりの言葉。ふつうの日本語で、いつ・何を・どこまで" },
        reason: { type: "string", description: "なぜそうするか（職人が言った理由）" },
        example: { type: "string", description: "例（職人が挙げたもの）" },
        quote: { type: "string", description: "職人の言葉そのまま（短く）" },
        param: {
          type: "string",
          enum: Object.keys(PARAMS),
          description:
            "機械で確かめる値のどれに当たるか：" +
            Object.entries(PARAMS)
              .map(([k, v]) => `${k}＝${v.label}${v.unit ? `（${v.unit}）` : ""}`)
              .join("、"),
        },
        value: { type: "number", description: "param の値（職人が言った数字だけ）。石の大きさで変わるときは、いちばんよく使う大きさの値" },
        by_size: {
          type: "array",
          description:
            "石の大きさで値が変わると職人が言ったときだけ付ける。石の大きさ ＝（長辺 ＋ 幅）÷ 2（mm）。小さい順に「この大きさまでならこの値」を並べる。最後の段より大きい石は最後の値",
          items: {
            type: "object",
            properties: { up_to_mm: { type: "number" }, value: { type: "number" } },
            required: ["up_to_mm", "value"],
            additionalProperties: false,
          },
        },
        stone_mm: {
          type: "number",
          description:
            "職人が話した石の大きさ（mm。石の大きさ ＝（長辺 ＋ 幅）÷ 2）。「このサイズ」「この石」と言ったら、今の設計の石の大きさ。value はこの大きさの値。石の大きさの話でなければ付けない",
        },
        points: {
          type: "array",
          description:
            "爪の太さ（prong.minDiameterMm）のように、石の大きさで値が変わる決まりのときだけ付ける。石の大きさごとの点。" +
            "by＝craftsman は職人が言った点（職人が言った数字だけ。「この爪で十分」なら今の爪の太さ）。by＝inferred は、職人の点から割合で推し量った、ほかの大きさの値（職人はまだ確かめていない）。" +
            "why は、職人の点なら職人の言葉の短い引用、推測ならどう出したか（例：公開の目安の線を職人の 8 mm・0.7 mm に合わせて割合でずらした）",
          items: {
            type: "object",
            properties: {
              stone_mm: { type: "number", description: "石の大きさ（mm）" },
              value: { type: "number", description: "その大きさの値（mm）" },
              by: { type: "string", enum: ["craftsman", "inferred"] },
              why: { type: "string" },
            },
            required: ["stone_mm", "value", "by", "why"],
            additionalProperties: false,
          },
        },
        steps: {
          type: "array",
          description:
            "param を付けない決まり（手の動かし方・道具の当て方など）のとき、作り方のどの工程で効くか。作るの画面のその工程に出る。当てはまる工程だけ：" +
            Object.entries(MAKING_STEPS)
              .map(([k, v]) => `${k}＝${v}`)
              .join("、"),
          items: { type: "string", enum: MAKING_STEP_IDS },
        },
      },
      required: ["title", "text", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "ask_teacher",
    description:
      "生徒の質問を「先生に聞くこと」の一覧に足す。目安帳と職人の目安に答えになる決まりがないとき、" +
      "または職人でないと決められない判断（この石でこの形にしてよいか、など）のときに使う。" +
      "推し量って答えを作る代わりに使う道具。足したら、生徒には「先生に聞くことに足した」と短く伝える。",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string", description: "生徒の質問。短く、先生が一目で分かる言葉で" },
        why_unanswered: {
          type: "string",
          description: "なぜ目安帳では答えられないか（例：目安帳に決まりがない、決まりはあるがこの石には職人の判断が要る）",
        },
        context: { type: "string", description: "先生が答えやすくなる話の流れ（石の形、どの決まりの話か など。あれば）" },
      },
      required: ["question", "why_unanswered"],
      additionalProperties: false,
    },
  },
  {
    name: "set_stones",
    description:
      "石を並べる。solo＝一粒（今のまま）、trio＝三石（今の石を真ん中に、両脇に小さめの石を 1 つずつ）、row＝横一列（今の石と同じ石を count 個、腕に沿って）。" +
      "石の場所は、石座どうしの間が既定の間になるように自動で決まる（石ごとに同じ石座を作り、腕の丸みに沿って立てる）。" +
      "変えたら check で確かめ直すこと（石ごとの爪の確かめと、となりの石との間の確かめが出る）。",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        layout: { type: "string", enum: ["solo", "trio", "row"], description: "並べ方" },
        count: { type: "integer", description: `横一列の石の数（${range("count", " 個")}）。row のときだけ使う` },
        side_mm: { type: "number", description: `三石の両脇の石の長辺（mm、${range("side_mm", " mm")}）。省くと真ん中の石の ${Math.round(GUIDES.multi.sideRatio * 100)} %` },
        side_style: { type: "string", enum: ["prong", "bezel"], description: "ほかの石の留め方。省くと真ん中の石と同じ" },
        spread_mm: { type: "number", description: `石座どうしの間を、既定よりさらに広げる長さ（mm、${range("spread_mm", " mm")}）。間が狭いと言われたときに使う` },
        reason: { type: "string", description: "なぜこう並べるか。短く書く（作業の記録に残る）" },
      },
      required: ["layout", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "choose_stone",
    description:
      "石の形と大きさを選ぶ（石もおまかせ と言われたときだけ渡される道具）。今の石と入れ替わる。" +
      "形：round＝ラウンド、oval＝オーバル、princess＝スクエア、emerald＝エメラルド、pear＝ペア、marquise＝マーキス。" +
      "長辺を決めると、幅と深さは形の例の比から決まる（測った値ではないので、そう書く）。" +
      "はじめに選んでから組むこと。腕・地金・留め方はそのまま引き継ぎ、爪の本数と位置と太さは新しい石で決め直す。" +
      "結果に新しい石の輪郭の点の数と尖った角が返る。選んだら check で確かめること。",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        shape: { type: "string", enum: STONE_SHAPES, description: "石の形" },
        long_mm: { type: "number", description: `長辺（mm、${range("stone_long_mm", " mm")}）` },
        reason: { type: "string", description: "なぜこの形と大きさにしたか。希望のどの言葉からかが分かるように、短く書く（作業の記録に残る）" },
      },
      required: ["shape", "long_mm", "reason"],
      additionalProperties: false,
    },
  },
];

// ---- 入力を確かめる ----
// strict の道具は形がふつう正しく届くが（set_shank は strict でない）、届いた値はそのまま信じず、ここで型と範囲を確かめてから道具に渡す。

export type ParsedToolCall =
  | { name: "set_setting"; input: SetSettingInput }
  | { name: "set_shank"; input: SetShankInput }
  | { name: "check"; input: Record<string, never> }
  | { name: "look"; input: LookInput }
  | { name: "propose_rule"; input: ProposeRuleInput }
  | { name: "ask_teacher"; input: AskTeacherInput }
  | { name: "set_stones"; input: SetStonesInput }
  | { name: "choose_stone"; input: ChooseStoneInput };

export type ParseResult = { ok: true; call: ParsedToolCall } | { ok: false; error: string };

interface PropSchema {
  type: "string" | "number" | "integer" | "array" | "boolean" | "object";
  enum?: readonly string[];
  items?: { type: "integer" } | { type: "object" } | { type: "string"; enum?: readonly string[] };
}

const BOUND_OF: Record<string, keyof typeof INPUT_BOUNDS> = {
  prong_count: "prong_count",
  prong_mm: "prong_mm",
  prong_positions: "prong_position",
  width_mm: "width_mm",
  thickness_mm: "thickness_mm",
  gou: "gou",
  value: "value",
  count: "count",
  side_mm: "side_mm",
  spread_mm: "spread_mm",
  at_deg: "at_deg",
  sway_mm: "sway_mm",
  culet_gap_mm: "culet_gap_mm",
  long_mm: "stone_long_mm",
  stone_mm: "stone_size_mm",
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
    case "boolean":
      return typeof v === "boolean" ? null : `${key} は true か false で書いてください`;
    case "number":
      return checkNumber(key, v, false);
    case "integer":
      return checkNumber(key, v, true);
    case "array":
      if (!Array.isArray(v)) return `${key} は番号の並びで書いてください`;
      // 場所ごとの形は checkStations が見る
      if (key === "stations" || key === "relief_more") return null;
      if (key === "points") return checkPoints(v);
      if (s.items?.type === "object") return checkSizeSteps(key, v);
      // 文字の並び（propose_rule の steps など）。前は数として確かめて、工程を付けた決まりの案をいつも断っていた（2026-11-06 本物の Claude で見つけた）
      if (s.items?.type === "string") {
        const allowed = (s.items as { enum?: readonly string[] }).enum;
        for (const item of v) {
          if (typeof item !== "string") return `${key} は文字の並びで書いてください`;
          if (allowed && !allowed.includes(item)) return `${key} は ${allowed.join(" / ")} のどれかです（今は ${item}）`;
        }
        return null;
      }
      for (const item of v) {
        const e = checkNumber(key, item, true);
        if (e) return e;
      }
      return null;
    case "object":
      // 断面の線は checkSectionCurve が見る
      return typeof v === "object" && v !== null && !Array.isArray(v) ? null : `${key} の形が正しくありません`;
  }
}

/** 断面の線：{points} の形と、線が壊れていないか */
function checkSectionCurve(v: unknown): string | null {
  const c = v as { points?: unknown } | null;
  if (typeof c !== "object" || c === null || Array.isArray(c)) return "断面の線は {points: [{x, y}, …]} の形で書いてください";
  for (const k of Object.keys(c)) if (k !== "points") return `断面の線に ${k} という項目はありません（points だけ書いてください）`;
  return sectionCurveProblem(c.points);
}

/** 腕の場所ごとの形：数の範囲、角度の順、いちばん下の流れ、断面の線 */
function checkStations(v: unknown): string | null {
  if (!Array.isArray(v)) return "腕の場所ごとの形は、場所の並びで書いてください";
  const [, most] = INPUT_BOUNDS.stations;
  if (v.length > most) return `腕の場所は ${most} か所までです（今は ${v.length} か所）`;
  let prev = 0;
  const allowed = new Set(["at_deg", "width_mm", "thickness_mm", "section", "section_curve", "sway_mm", "step"]);
  for (const st of v as Record<string, unknown>[]) {
    if (typeof st !== "object" || st === null || Array.isArray(st)) return "腕の場所は {at_deg, width_mm, thickness_mm} の形で書いてください";
    for (const k of Object.keys(st)) if (!allowed.has(k)) return `腕の場所に ${k} という項目はありません`;
    for (const k of ["at_deg", "width_mm", "thickness_mm"]) {
      if (st[k] === undefined) return `腕の場所に ${k} がありません`;
      const e = checkNumber(k, st[k], false);
      if (e) return e;
    }
    const at = st.at_deg as number;
    if (at <= prev) return `腕の場所は、角度の小さい順に書いてください（${prev}° の次が ${at}°）`;
    prev = at;
    if (st.sway_mm !== undefined) {
      const e = checkNumber("sway_mm", st.sway_mm, false);
      if (e) return e;
      if (at >= 180 && st.sway_mm !== 0) return "いちばん下（180°）では、腕を指の向きへ寄せられません（sway_mm は 0）";
    }
    if (st.step !== undefined && typeof st.step !== "boolean") return "腕の場所の step は true か false で書いてください";
    if (st.section !== undefined && !["kouman", "hirauchi", "hangouman", "kaku"].includes(st.section as string)) return `場所ごとの断面は kouman / hirauchi / hangouman / kaku のどれかです（今は ${String(st.section)}）`;
    if (st.section_curve !== undefined) {
      const e = checkSectionCurve(st.section_curve);
      if (e) return `${at}° の場所の${e}`;
    }
  }
  return null;
}

/** 腕の彫り：模様の名前と数の範囲、始まりと終わりの順 */
function checkRelief(v: unknown): string | null {
  const r = v as Record<string, unknown> | null;
  if (typeof r !== "object" || r === null || Array.isArray(r)) return "腕の彫りは {pattern, …} の形で書いてください";
  const kinds: readonly string[] = ["none", ...RELIEF_PATTERNS];
  if (!kinds.includes(r.pattern as string)) return `腕の彫りの模様は ${kinds.join(" / ")} のどれかです（今は ${String(r.pattern)}）`;
  const bounds: Record<string, keyof typeof INPUT_BOUNDS> = { count: "relief_count", depth_mm: "relief_depth", from_deg: "relief_deg", to_deg: "relief_deg", columns: "relief_columns", across_from: "relief_across", across_to: "relief_across" };
  for (const k of Object.keys(r)) {
    if (k === "pattern") continue;
    const b = bounds[k];
    if (!b) return `腕の彫りに ${k} という項目はありません`;
    const [lo, hi] = INPUT_BOUNDS[b];
    if (typeof r[k] !== "number" || !Number.isFinite(r[k]) || (r[k] as number) < lo || (r[k] as number) > hi) return `腕の彫りの ${k} は ${lo}〜${hi} で書いてください（今は ${String(r[k])}）`;
    if ((k === "count" || k === "columns") && !Number.isInteger(r[k])) return `腕の彫りの ${k} は整数で書いてください`;
  }
  if (typeof r.from_deg === "number" && typeof r.to_deg === "number" && r.from_deg >= r.to_deg) return "腕の彫りは、彫り始める角度を、彫り終わる角度より小さくしてください";
  if ((r.across_from === undefined) !== (r.across_to === undefined)) return "腕の彫りの帯は、across_from と across_to を両方書いてください";
  if (typeof r.across_from === "number" && typeof r.across_to === "number" && r.across_from >= r.across_to) return "腕の彫りの帯は、across_from を across_to より小さくしてください";
  return null;
}

/** 伝統の仕上げ：知らない項目と、選べない値を断る */
function checkFinish(v: unknown): string | null {
  const f = v as Record<string, unknown> | null;
  if (typeof f !== "object" || f === null || Array.isArray(f)) return `仕上げは {${FINISH_OFFERED_KEYS.join(", ")}} の形で書いてください`;
  const keys = Object.keys(f);
  if (!keys.length) return "仕上げに変える項目がありません";
  for (const k of keys) {
    const allowed = (FINISH_OFFERED_KEYS as readonly string[]).includes(k) ? (FINISH_KEYS as Record<string, readonly string[]>)[k] : undefined;
    if (!allowed) return `仕上げに ${k} という項目はありません`;
    if (!allowed.includes(f[k] as string)) return `仕上げの ${k} は ${allowed.join(" / ")} のどれかです（今は ${String(f[k])}）`;
  }
  return null;
}

/** 石の大きさの段：大きさは 0.5〜30 mm で小さい順、値は 0〜100 */
function checkSizeSteps(key: string, v: unknown[]): string | null {
  if (v.length === 0 || v.length > 12) return `${key} は 1〜12 段で書いてください`;
  let last = 0;
  for (const item of v) {
    const r = item as { up_to_mm?: unknown; value?: unknown };
    if (typeof item !== "object" || item === null || typeof r.up_to_mm !== "number" || typeof r.value !== "number") {
      return `${key} は {up_to_mm, value} の並びで書いてください`;
    }
    if (r.up_to_mm < 0.5 || r.up_to_mm > 30 || r.up_to_mm <= last) return `${key} の大きさは 0.5〜30 mm で、小さい順に書いてください`;
    if (r.value < 0 || r.value > 100) return `${key} の値は 0〜100 で書いてください`;
    last = r.up_to_mm;
  }
  return null;
}

/** 石の大きさごとの点：大きさは 0.5〜30 mm、値は 0〜100、by は craftsman か inferred、同じ大きさの職人の点は 1 つ */
function checkPoints(v: unknown[]): string | null {
  if (v.length === 0 || v.length > 16) return "points は 1〜16 点で書いてください";
  const [lo, hi] = INPUT_BOUNDS.stone_size_mm;
  const seen: number[] = [];
  for (const item of v) {
    const r = item as { stone_mm?: unknown; value?: unknown; by?: unknown; why?: unknown } | null;
    if (typeof r !== "object" || r === null || Array.isArray(r)) return "points は {stone_mm, value, by, why} の並びで書いてください";
    for (const k of Object.keys(r)) if (!["stone_mm", "value", "by", "why"].includes(k)) return `points に ${k} という項目はありません`;
    if (typeof r.stone_mm !== "number" || !Number.isFinite(r.stone_mm) || r.stone_mm < lo || r.stone_mm > hi) return `points の stone_mm は ${lo}〜${hi} mm で書いてください`;
    if (typeof r.value !== "number" || !Number.isFinite(r.value) || r.value <= 0 || r.value > 100) return "points の value は 0 より大きく 100 以下で書いてください";
    if (r.by !== "craftsman" && r.by !== "inferred") return "points の by は craftsman か inferred です";
    if (r.why !== undefined && typeof r.why !== "string") return "points の why は文字で書いてください";
    if (r.by === "craftsman") {
      if (seen.some((s) => Math.abs(s - (r.stone_mm as number)) < 1e-9)) return `同じ石の大きさ（${r.stone_mm} mm）に職人の点が 2 つあります`;
      seen.push(r.stone_mm);
    }
  }
  return null;
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
  // 石の大きさの点だけ付けて value を忘れたとき：職人の点（stone_mm の点、なければ最後の職人の点）の値を value にする（決まりの中身は変えない）
  if (name === "propose_rule" && record.param !== undefined && record.value === undefined && Array.isArray(record.points)) {
    const craft = (record.points as unknown[]).filter((x): x is ProposePoint => typeof x === "object" && x !== null && (x as ProposePoint).by === "craftsman" && typeof (x as ProposePoint).value === "number");
    const at = craft.find((x) => typeof record.stone_mm === "number" && Math.abs(x.stone_mm - record.stone_mm) < 1e-9) ?? craft[craft.length - 1];
    if (at) return parseToolCall(name, { ...record, value: at.value });
  }
  if (name === "propose_rule" && (record.param === undefined) !== (record.value === undefined)) {
    return { ok: false, error: "param と value は、両方付けるか、両方付けないかにしてください" };
  }
  if (name === "propose_rule" && (record.points !== undefined || record.stone_mm !== undefined) && record.param === undefined) {
    return { ok: false, error: "stone_mm と points は、値（param と value）のある決まりにだけ付けてください" };
  }
  if (name === "ask_teacher") {
    for (const key of ["question", "why_unanswered"] as const) {
      if (typeof record[key] === "string" && record[key].trim() === "") return { ok: false, error: `${key} を短く書いてください` };
    }
  }
  // 理由だけでは形は変わらない（何も変えずに「変えた」と思って次へ進まないように）
  if ((name === "set_shank" || name === "set_setting") && !Object.keys(record).some((k) => k !== "reason" && record[k] !== undefined)) {
    return { ok: false, error: "変える項目が 1 つもありません。理由だけでは形は変わりません。変える数や形を項目に書いてください" };
  }
  if (name === "set_shank") {
    if (record.section !== undefined && record.section_curve !== undefined) return { ok: false, error: "断面は、決まった形（section）か線（section_curve）のどちらかを書いてください" };
    if (record.section_curve !== undefined) {
      const e = checkSectionCurve(record.section_curve);
      if (e) return { ok: false, error: e };
    }
    if (record.stations !== undefined) {
      const e = checkStations(record.stations);
      if (e) return { ok: false, error: e };
    }
    if (record.relief !== undefined) {
      const e = checkRelief(record.relief);
      if (e) return { ok: false, error: e };
    }
    if (record.finish !== undefined) {
      const e = checkFinish(record.finish);
      if (e) return { ok: false, error: e };
    }
    if (record.relief_more !== undefined) {
      if (!Array.isArray(record.relief_more) || record.relief_more.length > INPUT_BOUNDS.relief_more[1]) return { ok: false, error: `重ねる彫りは ${INPUT_BOUNDS.relief_more[1]} つまでの並びで書いてください` };
      for (const q of record.relief_more) {
        const e = checkRelief(q);
        if (e) return { ok: false, error: e };
      }
    }
  }
  if (typeof record.reason === "string" && record.reason.trim() === "") {
    return { ok: false, error: "reason（理由）を短く書いてください" };
  }
  return { ok: true, call: { name, input } as ParsedToolCall };
}
