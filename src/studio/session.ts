// 指輪の設計の場：石と設計を持ち、Claude の道具（set_setting / set_shank / check / look）を、
// 人のボタンと同じ関数で実行する。確かめは、いつも今の帳面（職人の決まり）で行う。画面には依存しない（look の画像だけ外から受け取る）。
import { buildRing, type RingDesign, type StonePlace } from "../geometry/ring";
import { layoutRow, layoutTrio, scaleStone } from "../geometry/multi";
import { PRESETS, presetOutline } from "./presets";
import { autoOrientation, tAtOutlineIndex, type JoinStyle, type ProngTip, type SolidQuality } from "../geometry/setting";
import type { SectionCurve, SectionPoint, ShankSection, ShankStation } from "../geometry/shank";
import type { ReliefParams } from "../geometry/shank-relief";
import type { TensionGrip, TensionInfo } from "../geometry/tension";
import type { StoneParams } from "../geometry/stone";
import { FIXES, checkRing, cornerDistances, grooveNote, holdRatio, tensionInsert, tensionNotes, tensionOpening, tensionOpeningText, type FixId, type Problem } from "../rules/checks";
import { springForClaude, springIdOf, tensionCautions, tensionSpring } from "../rules/tension-calc";
import { GUIDES, requiredHold, stoneSizeMm, type Guides, type HeightOption, type MetalId, type StonePosition } from "../rules/guides";
import { effectiveGuides, prongMinOverride, ruleForCheck, type Ledger, type Rule } from "../rules/ledger";
import { INPUT_BOUNDS } from "../claude/tools";
import type {
  CheckResult,
  FixOption,
  LookInput,
  LookResult,
  Metal,
  SetSettingInput,
  SetSettingResult,
  SetShankInput,
  SetShankResult,
  ShankReliefInput,
  ShankStationInput,
  SetStonesInput,
  SetStonesResult,
  StoneLayout,
  SettingState,
  ToolHost,
} from "../claude/tools";

/** 並べる石の形：photo ＝ 今の石（真ん中の石）と同じ形を大きさだけ変える。ほかは、よくある形（presets.ts の id） */
export type SlotShape = "photo" | "round" | "oval" | "princess" | "emerald" | "pear" | "marquise";

/** 真ん中の石のほかに、腕に並べる石 1 つ */
export interface StoneSlot {
  /** 腕のいちばん上から、腕の外側に沿って測った場所（mm、＋ は +y の側） */
  atMm: number;
  shape: SlotShape;
  /** 長辺（mm）。幅は形の比のまま */
  longMm: number;
  /** 留め方（なければ真ん中の石と同じ） */
  style?: "prong" | "bezel";
  /** 爪の本数（なければ石の形から自動） */
  prongCount?: number;
  /** 爪の太さ（mm。なければ、その石の大きさの標準） */
  prongMm?: number;
}

/** 設計（Claude の道具と、人のつまみが同じものを動かす） */
export interface RingState {
  style: "prong" | "bezel" | "tension";
  /** テンションに切り替える前の腕（戻したときに元へ。テンションの間だけ） */
  beforeTension?: Pick<RingState, "shankSection" | "shankWidthMm" | "shankThicknessMm" | "sectionPoints" | "sectionCurve">;
  /** テンションの挟む向き（なければ石の形の既定） */
  tensionGrip?: TensionGrip;
  /** 爪の本数（なければ石の形から自動） */
  prongCount?: number;
  /** 爪の太さ（mm、なければ標準） */
  prongMm?: number;
  /** 爪を置く輪郭の点の番号（なければ自動） */
  prongPositions?: number[];
  /** 爪の先の形を、この設計で選んだとき（なければ今の帳面のベーシックの形。帳面になければ丸い爪） */
  prongTip?: ProngTip;
  height: HeightOption;
  orientation: "along" | "across";
  /** 向きを人が選んだか（選んでいなければ、尖った角が腕に当たらない向きを自動で選ぶ） */
  orientationSet?: boolean;
  /** 付け方を人が選んだか（選んでいなければ、小さな石は腕の上にのせる） */
  joinSet?: boolean;
  /** 道具で選んだ地金の名前（見た目は 3 種の地金のどれかで出す） */
  metal: Metal;
  gou: number;
  shankWidthMm?: number;
  shankThicknessMm?: number;
  /** 腕の断面（なければ甲丸） */
  shankSection?: ShankSection;
  /** 手で描いた腕の断面の点（shankSection が free のとき） */
  sectionPoints?: SectionPoint[];
  /** 手で描いた腕の断面の線（なめらかな線の制御点と節。shankSection が free のとき。sectionPoints より先に使う。作品といっしょに残る） */
  sectionCurve?: SectionCurve;
  /** 腕の場所ごとの形（なければ、どこも同じ形。shankWidthMm・shankThicknessMm・断面が、いちばん上の形。テンションと石を並べた指輪では使わない） */
  shankStations?: ShankStation[];
  /** 腕の彫り（なければ彫らない。テンションと石を並べた指輪では使わない） */
  shankRelief?: ReliefParams;
  /** 重ねて彫る模様（縁の粒、肩の葉など） */
  shankReliefMore?: ReliefParams[];
  /** 尖った角を V 字の爪で包むか（なければ包まない：丸い爪を角に立てる普通の爪留め。作者の判断） */
  vCorners?: boolean;
  /** 石の一番下と指のすき間（mm）を直接決める（高さの選択より優先。職人の決まりに合わせて直すとき） */
  culetGapMm?: number;
  position: StonePosition;
  /** 石の並べ方（なければ一粒）。free ＝ 人が 1 つずつ置いた */
  layout?: StoneLayout | "free";
  /** 真ん中の石のほかに並べる石（一粒なら空） */
  stones?: StoneSlot[];
  /** 真ん中の石の場所（mm、腕に沿って。横一列で石の数が偶数のとき 0 でない） */
  mainAtMm?: number;
  /** 三石・横一列の並べ方で、石座どうしの間を既定より広げる長さ（mm） */
  spreadMm?: number;
  /** 石座と腕の付け方（爪留めだけ。なければ腕の上にのせる。腕の間に挟むのは一粒の指輪だけ） */
  join?: JoinStyle;
  /** 腕の間に挟む石座の下の輪の高さ・板の厚み（mm。なければ目安。直し方で変える） */
  collarHeightMm?: number;
  collarWallMm?: number;
}

/** 並べる石 1 つの、形と大きさ（石の座標） */
export function slotStone(main: StoneParams, slot: Pick<StoneSlot, "shape" | "longMm">): StoneParams {
  if (slot.shape === "photo") return scaleStone(main, slot.longMm / main.longMm);
  const p = PRESETS.find((x) => x.id === slot.shape) ?? PRESETS[0];
  const k = slot.longMm / p.longMm;
  const preset = { ...p, longMm: p.longMm * k, widthMm: p.widthMm * k, depthMm: p.depthMm * k };
  return { outlineMm: presetOutline(preset), longMm: preset.longMm, widthMm: preset.widthMm, depthMm: preset.depthMm };
}

/** 三石の脇の石を、先が外へ向くように回す角度（ペア。ほかの形は向きのとおり） */
export function trioTurn(slot: Pick<StoneSlot, "shape" | "atMm">): number | undefined {
  // ペアの先は、形の +x の側（presets.ts）。＋の側の石は先を +y へ、−の側の石は −y へ
  return slot.shape === "pear" ? (slot.atMm >= 0 ? Math.PI / 2 : -Math.PI / 2) : undefined;
}

/** 並べる石の形の名前（画面） */
export const SLOT_SHAPE_LABEL: Record<SlotShape, string> = { photo: "今の石と同じ形", round: "ラウンド", oval: "オーバル", princess: "スクエア", emerald: "エメラルド", pear: "ペア", marquise: "マーキス" };
export const LAYOUT_LABEL: Record<StoneLayout | "free", string> = { solo: "一粒", trio: "三石", row: "横一列", free: "自由な並び" };

/** つまみや Claude の set_setting が止まってから、細かい一体の形を作り直すまでの待ち（ms）。作り直しは重いので、続けて押している間は始めない */
export const FINAL_DELAY_MS = 500;

// 石座の付け方の既定は「腕の間に挟む」（職人の言う基本の作り方。作者が決めた 2026-11-04）。「腕の上にのせる」も選べる。石がいくつもの指輪は、形の方で腕の上にのせる
export const DEFAULT_STATE: RingState = { style: "prong", height: "standard", orientation: "along", metal: "k18yg", gou: 11, position: "top", join: "between" };

/**
 * 石を変えるときに、今の設計から新しい石の設計へ引き継ぐ。
 * 引き継ぐ：石の形に関係しない物（地金・号・腕の断面と太さ・留め方・高さ・石の下のすき間）。
 * 向きと付け方は、人が選んだ物だけ（選んでいなければ、新しい石に合わせて自動で決め直す）。
 * 爪の本数と位置は石の形で、爪の太さと下の輪の寸法は石の大きさで決まるので、同じ形・同じ大きさのときだけ渡す。
 * 石を並べる設定は引き継がない（欄を隠している間は、一粒に戻る）
 */
export function carryDesign(prev: RingState, base: RingState, same: { shape?: boolean; size?: boolean } = {}): RingState {
  const out: RingState = {
    ...base,
    style: prev.style,
    height: prev.height,
    culetGapMm: prev.culetGapMm,
    prongTip: prev.prongTip,
    metal: prev.metal,
    gou: prev.gou,
    position: prev.position,
    shankWidthMm: prev.shankWidthMm,
    shankThicknessMm: prev.shankThicknessMm,
    shankSection: prev.shankSection,
    sectionPoints: prev.sectionPoints && structuredClone(prev.sectionPoints),
    sectionCurve: prev.sectionCurve && structuredClone(prev.sectionCurve),
    shankStations: prev.shankStations && structuredClone(prev.shankStations),
    shankRelief: prev.shankRelief && { ...prev.shankRelief },
    shankReliefMore: prev.shankReliefMore && structuredClone(prev.shankReliefMore),
    beforeTension: prev.beforeTension && structuredClone(prev.beforeTension),
  };
  if (prev.orientationSet) {
    out.orientation = prev.orientation;
    out.orientationSet = true;
  }
  if (prev.joinSet) {
    out.join = prev.join;
    out.joinSet = true;
  }
  if (same.shape) {
    out.prongCount = prev.prongCount;
    out.prongPositions = prev.prongPositions && [...prev.prongPositions];
    out.tensionGrip = prev.tensionGrip;
  }
  if (same.shape && same.size) {
    out.prongMm = prev.prongMm;
    out.collarHeightMm = prev.collarHeightMm;
    out.collarWallMm = prev.collarWallMm;
  }
  return out;
}

/**
 * 爪の太さを、留まりと太さの確かめが通るまで上げる（軽い作り方で数回だけ試す）。
 * 帳面を切り替えたとき・最初の案を作るときと、帳面ごとの比べの表で、同じ太さになるように 1 か所に。
 */
export function tuneProngMm(s: RingSession): void {
  const solid = s.solid;
  s.solid = false;
  for (let i = 0; i < 4; i++) {
    const b = s.build("爪の太さを決める");
    if (!b.problems.some((p) => p.check === "hold" || p.check === "prong-thin")) break;
    const cur = b.ring.setting.prongs[0]?.diameterMm ?? b.ring.setting.standardProngMm;
    s.state.prongMm = Math.ceil(cur * 1.08 * 100) / 100;
  }
  s.solid = solid;
}

/** その帳面に切り替えたら、今の設計はどうなるか（画面を変えずに、帳面の切り替えと同じ順で組む） */
export function underLedger(stone: StoneParams, state: RingState, ledger: Ledger): Built {
  const s = new RingSession(stone, () => ledger, () => undefined, () => "");
  // 爪の形も、その帳面のベーシックから（手で選んだ形を持ち越すと、帳面ごとの違いが見えない）
  s.state = { ...structuredClone(state), prongMm: undefined, prongTip: undefined };
  tuneProngMm(s);
  return s.build("帳面ごとに比べる");
}

/** 石の長辺の欄で入れられる範囲（mm。石の大きさのつまみと、Claude の choose_stone と同じ） */
export const STONE_LONG_RANGE = { min: INPUT_BOUNDS.stone_long_mm[0], max: INPUT_BOUNDS.stone_long_mm[1] } as const;

/** 長辺の欄に打った数を、範囲に収める。数でなければ今の値のまま。fixed ＝ 打った数のままではなくなった */
export function fitStoneLong(raw: number, current: number): { mm: number; fixed: boolean } {
  if (!Number.isFinite(raw) || raw === 0) return { mm: current, fixed: false };
  const mm = Math.min(STONE_LONG_RANGE.max, Math.max(STONE_LONG_RANGE.min, raw));
  return { mm, fixed: mm !== raw };
}

/** 深さの欄に打った数。0 以下や数でなければ今の値のまま。長辺の上限より深くはしない */
export function fitStoneDepth(raw: number, current: number): { mm: number; fixed: boolean } {
  if (!Number.isFinite(raw) || raw === 0) return { mm: current, fixed: false };
  if (raw < 0) return { mm: current, fixed: true };
  const mm = Math.min(STONE_LONG_RANGE.max, raw);
  return { mm, fixed: mm !== raw };
}

/** 道具の地金の名前 → 形と重さを出す地金 */
export function metalIdOf(m: Metal): MetalId {
  if (m === "pt900") return "pt900";
  if (m === "sv925") return "sv925";
  return "k18y";
}

export const METAL_LABEL: Record<Metal, string> = { pt900: "Pt900", k18yg: "K18 イエロー", k18wg: "K18 ホワイト", k18pg: "K18 ピンク", sv925: "SV925" };

/** 道具の入力の、腕の場所の形 → 設計に残す形 */
export function stationFrom(st: ShankStationInput): ShankStation {
  return {
    atDeg: st.at_deg,
    widthMm: st.width_mm,
    thicknessMm: st.thickness_mm,
    ...(st.section ? { section: st.section } : {}),
    ...(st.section_curve ? { section: "free" as const, curve: { points: st.section_curve.points.map((p) => ({ x: p.x, y: p.y })), knots: st.section_curve.knots ? [...st.section_curve.knots] : undefined } } : {}),
    ...(st.sway_mm ? { swayMm: st.sway_mm } : {}),
  };
}

/** 設計に残した腕の場所の形 → 道具の入力の形 */
export function stationTo(st: ShankStation): ShankStationInput {
  return {
    at_deg: st.atDeg,
    width_mm: st.widthMm,
    thickness_mm: st.thicknessMm,
    ...(st.curve ? { section_curve: { points: st.curve.points.map((p) => ({ x: p.x, y: p.y })), knots: st.curve.knots } } : st.section && st.section !== "free" ? { section: st.section } : {}),
    ...(st.swayMm ? { sway_mm: st.swayMm } : {}),
  };
}

/** 道具の入力の彫り → 設計に残す形（省いた数は、今の彫り、なければ既定） */
export function reliefFrom(r: ShankReliefInput, cur: ReliefParams | undefined): ReliefParams | undefined {
  if (r.pattern === "none") return undefined;
  return {
    kind: r.pattern,
    count: r.count ?? cur?.count ?? 4,
    depthMm: r.depth_mm ?? cur?.depthMm ?? GUIDES.band.relief.depthMm,
    fromDeg: r.from_deg ?? cur?.fromDeg ?? 25,
    toDeg: r.to_deg ?? cur?.toDeg ?? 100,
    ...((r.columns ?? cur?.columns) ? { columns: r.columns ?? cur?.columns } : {}),
    ...(r.across_from !== undefined && r.across_to !== undefined ? { across: [r.across_from, r.across_to] as const } : cur?.across ? { across: cur.across } : {}),
  };
}

/** 彫りの下の地金が足りないときの直し方：足りるところまで浅くする */
export function reliefFixInput(s: RingState, underMm: number, g: Guides = GUIDES): ShankReliefInput | undefined {
  const r = s.shankRelief;
  if (!r) return undefined;
  const depth = Math.max(0.1, Math.floor((r.depthMm - (g.band.relief.minUnderMm - underMm)) * 20 + 1e-6) / 20);
  return { pattern: r.kind, depth_mm: depth };
}

/**
 * 腕の確かめの直し方（厚くする・幅を広げる）の入力。場所ごとの形があるときは、足りない場所だけ上げる。
 * いちばん上がもう足りていれば、いちばん上は変えない
 */
export function bandFixInput(id: "thickerBand" | "widerBand", s: RingState, g: Guides = GUIDES): Pick<SetShankInput, "thickness_mm" | "width_mm" | "stations"> {
  const stations = s.shankStations?.length ? s.shankStations : null;
  if (id === "thickerBand") {
    const min = g.band.minThicknessMm;
    const top = s.shankThicknessMm;
    return {
      ...(!stations || top === undefined || top < min ? { thickness_mm: min } : {}),
      ...(stations ? { stations: stations.map((st) => stationTo({ ...st, thicknessMm: Math.max(st.thicknessMm, min) })) } : {}),
    };
  }
  const min = g.band.minWidthMm;
  const top = s.shankWidthMm;
  return {
    ...(!stations || top === undefined || top < min ? { width_mm: min } : {}),
    ...(stations ? { stations: stations.map((st) => stationTo({ ...st, widthMm: Math.max(st.widthMm, min) })) } : {}),
  };
}

/** 確かめの結果に、根拠の決まりを添えたもの */
export type Cited = Problem & { rule?: Rule };

export interface Built {
  ring: RingDesign;
  problems: Cited[];
}

const CHECK_NAME: Record<string, string> = {
  "finger-gap": "石の一番下と指のすき間",
  "prong-thin": "爪の太さ",
  "tip-height": "爪の先の高さ",
  hold: "石の留まり",
  "prong-gap": "爪と爪の間",
  corner: "尖った角の守り",
  "bezel-wall": "覆輪の壁の厚み",
  "band-thin": "腕の厚み",
  "band-narrow": "腕の幅",
  "band-spike": "腕の断面のとがり・薄いヒレ",
  "band-relief": "腕の彫りの下の地金",
  "band-valley": "断面の溝の底の厚み",
  "stone-space": "となりの石との間",
  "metal-space": "となりの石座との間",
  "collar-wall": "石座の下の輪の板の厚み",
  "band-end": "腕の端と石座の下の輪",
  "tension-gap": "腕の開き",
  "tension-cut": "溝で腕が切れないか",
  "tension-lip": "溝の高さが腕に収まるか",
  "tension-girdle": "石の縁が溝に入るか",
  "tension-pit": "くぼみの両わきの地金",
  "tension-culet": "石の先が腕の内側より指の側へ出ないか",
  "tension-sunk": "石が腕の中に沈まないか",
  "tension-overhang": "石が腕の幅の外へ出すぎないか",
};

/** テンションで意味のある確かめ（爪の確かめや留まりの比べはない） */
const TENSION_CHECKS = new Set(["finger-gap", "band-thin", "band-narrow", "band-spike", "tension-gap", "tension-cut", "tension-lip", "tension-girdle", "tension-pit", "tension-culet", "tension-sunk", "tension-overhang"]);

/** 直し方 → Claude が使える道具と入力の例 */
function hintFor(id: FixId, s: RingState, std: number, tension?: TensionInfo | null): FixOption["tool_hint"] {
  switch (id) {
    case "raise":
      return { tool: "set_setting", input: { height: s.height === "low" ? "standard" : "high" } };
    case "lower":
      return { tool: "set_setting", input: { height: s.height === "high" ? "standard" : "low" } };
    case "thicker":
      return { tool: "set_setting", input: { prong_mm: Math.round((s.prongMm ?? std) * 1.15 * 100) / 100 } };
    case "moreProngs":
    case "addProng":
      return { tool: "set_setting", input: { prong_count: Math.min(8, (s.prongCount ?? 4) + 1) } };
    case "bezel":
      return { tool: "set_setting", input: { style: "bezel" } };
    case "prongInstead":
      return { tool: "set_setting", input: { style: "prong" } };
    case "thickerWire": {
      // 今の線より 0.5 mm 太く（1 歩）
      const next = Math.round(((s.shankThicknessMm ?? GUIDES.tension.wireMm) + WIRE_STEP_MM) * 100) / 100;
      return { tool: "set_shank", input: { width_mm: next, thickness_mm: next } };
    }
    case "thinnerWire": {
      const next = Math.round(((s.shankThicknessMm ?? GUIDES.tension.wireMm) - WIRE_STEP_MM) * 100) / 100;
      return { tool: "set_shank", input: { width_mm: next, thickness_mm: next } };
    }
    case "turnGrip":
      return { tool: "set_setting", input: { tension_grip: nextGrip(tension) } };
    case "vAtCorner":
      // 爪の本数を自動に戻すと、尖った角に 1 本ずつ置く（V 字の爪は画面では使わない）
      return { tool: "set_setting", input: { style: "prong", v_corners: false, prong_count: 0 } };
    case "shallowerRelief": {
      const r = reliefFixInput(s, GUIDES.band.relief.minUnderMm - 0.1);
      return r ? { tool: "set_shank", input: { relief: r } } : undefined;
    }
    case "thickerBand":
      return { tool: "set_shank", input: bandFixInput("thickerBand", s) };
    case "widerBand":
      return { tool: "set_shank", input: bandFixInput("widerBand", s) };
    case "spreadStones":
      return s.layout === "trio" || s.layout === "row" ? { tool: "set_stones", input: { layout: s.layout, spread_mm: Math.round(((s.spreadMm ?? 0) + SPREAD_STEP_MM) * 100) / 100 } } : undefined;
    case "smallerStones":
      return s.layout === "trio" ? { tool: "set_stones", input: { layout: "trio", side_mm: Math.round((s.stones?.[0]?.longMm ?? 4) * SMALLER_STEP * 10) / 10 } } : undefined;
    default:
      return undefined;
  }
}

/** 直し方「挟む向きを変える」の行き先：角をくぼみに入れられる石はそれを先に（角で止まるので、いちばん横にずれない）。なければ長い向き */
export function nextGrip(t?: TensionInfo | null): TensionGrip {
  if (!t) return "short";
  if (t.grip === "short") return t.grips.includes("corner") ? "corner" : t.grips.includes("long") ? "long" : "short";
  return "short";
}

export class RingSession implements ToolHost<RingState> {
  state: RingState = { ...DEFAULT_STATE };
  built: Built | null = null;

  constructor(
    public stone: StoneParams,
    private ledger: () => Ledger,
    /** 形が変わったとき（画面を描き直す）。refined ＝ 同じ設計の細かい形への作り直し（確かめの結果は同じ） */
    private onChange: (b: Built, why: string, refined?: boolean) => void,
    /** look の道具：その向きの画像（base64 の PNG） */
    private shoot: (view: LookInput["view"]) => Promise<string> | string,
  ) {}

  /** 石座を継ぎ目のない一体の形で作る（画面と STL。重いのでテストでは使わない） */
  solid = false;
  /**
   * 一体の形を、動かしている間は粗く速く作り、止まって FINAL_DELAY_MS たったら細かく作り直すか。
   * 既定は、画面（window がある）のときだけ。テストでは同期のまま（いつも細かい形）
   */
  deferFinal = typeof window !== "undefined";
  /** 細かい一体の形を一度作ったか（最初の 1 回は、粗い形を見せずに細かく作る） */
  private hadFinal = false;
  private finalTimer: ReturnType<typeof setTimeout> | null = null;
  private finalWhy = "";

  private sizeMm() {
    return stoneSizeMm(this.stone.longMm, this.stone.widthMm);
  }

  /**
   * 今の設計で組んで、今の帳面で確かめる。
   * 一体の形で、続けて動かしているときは、まず粗い形ですぐ返し、少し待って細かい形で作り直して、同じ onChange をもう一度呼ぶ。
   * 確かめ（problems）は形の網目を使わないので、粗くても細かくても同じ
   */
  build(why = ""): Built {
    // 向きを人が選んでいなければ、尖った角が腕に当たらない向きにする（爪は腕を避けるので、角が腕の上だと爪で守れない）
    const st = this.state;
    if (st.style !== "tension" && !st.orientationSet && (st.join ?? "between") === "between" && !st.layout && !st.stones?.length) {
      st.orientation = autoOrientation(this.stone, st.shankWidthMm ?? GUIDES.shank.widthMm);
    }
    const preview = this.solid && this.deferFinal && this.hadFinal;
    if (this.solid) this.cancelFinal();
    this.built = this.compose(preview ? "preview" : "final");
    if (this.solid && !preview) this.hadFinal = true;
    if (preview) {
      this.finalWhy = why;
      this.finalTimer = setTimeout(() => this.finish(), FINAL_DELAY_MS);
    }
    this.onChange(this.built, why);
    return this.built;
  }

  /** 今の帳面で使う目安（職人が上書きした値をふくむ） */
  guides() {
    return effectiveGuides(this.ledger(), this.sizeMm());
  }

  /** 細かい形への作り直しを待っているか */
  get pendingFinal(): boolean {
    return this.finalTimer !== null;
  }

  /** 待っている細かい形への作り直しを、今すぐ済ませる（look の画像・書き出しの前など） */
  flush(): void {
    if (this.finalTimer === null) return;
    this.cancelFinal();
    this.finish();
  }

  private cancelFinal() {
    if (this.finalTimer !== null) clearTimeout(this.finalTimer);
    this.finalTimer = null;
  }

  private finish() {
    this.finalTimer = null;
    this.built = this.compose("final");
    this.onChange(this.built, this.finalWhy, true);
  }

  private compose(quality: SolidQuality): Built {
    const s = this.state;
    const outline = this.stone.outlineMm;
    const ledger = this.ledger();
    const guides = effectiveGuides(ledger, this.sizeMm());
    // 爪の先の形：この設計で選んだ形。なければ帳面のベーシック（石川工房は丸い爪、見本の工房 B は尖り爪）
    const prongTip = s.prongTip ?? ledger.basics?.prongTip ?? "round";
    // 三石の両脇の石座は、真ん中より低め（脇の石の縁が下に来て、3 つの縁が ゆるい弧を描く）。石の一番下の高さを直接決めたときも、脇は低めのまま
    const trio = s.layout === "trio";
    const head = {
      height: trio ? GUIDES.multi.trio.sideHeight : s.height,
      culetGapMm: trio ? undefined : s.culetGapMm,
      minProngMm: prongMinOverride(guides),
      solid: this.solid,
      solidQuality: quality,
      vAtCorners: false,
      prongTip,
    } as const;
    // 石の大きさで変わる職人の決まり（爪の太さなど）は、石ごとに、その石の大きさの値を使う
    const slotGuides = (s.stones ?? []).map((slot) => {
      const st = slotStone(this.stone, slot);
      return effectiveGuides(ledger, stoneSizeMm(st.longMm, st.widthMm));
    });
    const others: StonePlace[] = (s.style === "tension" ? [] : (s.stones ?? [])).map((slot, i) => ({
      stone: slotStone(this.stone, slot),
      orientation: s.orientation,
      atMm: slot.atMm,
      turnRad: trio ? trioTurn(slot) : undefined,
      setting: { ...head, minProngMm: prongMinOverride(slotGuides[i]), style: slot.style ?? (s.style === "tension" ? "prong" : s.style), prongCount: slot.prongCount, prongDiameterMm: slot.prongMm },
    }));
    const ringParams = {
      atMm: s.mainAtMm,
      others,
      joinHeads: trio,
      stone: this.stone,
      tension: s.style === "tension" && s.tensionGrip ? { grip: s.tensionGrip } : undefined,
      setting: {
        style: s.style,
        height: s.height,
        // テンションには高さの選び方がない。石の先と指のすき間は、今の帳面の最低か、直し方で決めた値
        culetGapMm: s.style === "tension" ? Math.max(s.culetGapMm ?? 0, guides.height.minFingerGapMm, GUIDES.tension.culetGapMm) : s.culetGapMm,
        prongCount: s.prongCount,
        prongDiameterMm: s.prongMm,
        minProngMm: prongMinOverride(guides),
        prongs: s.prongPositions?.length ? s.prongPositions.map((i) => ({ t: tAtOutlineIndex(outline, i) })) : undefined,
        solid: this.solid,
        solidQuality: quality,
        // 既定は、角を丸い爪で押さえる普通の爪留め（作者の判断）。V 字の爪は選んだときだけ
        // V 字の爪は、形の出来がまだ足りないので画面では使わない（作者と決めた。2026-11-04）
        vAtCorners: false,
        prongTip,
        join: s.join ?? "between", // 前に残した設計（付け方の記録がない）も、既定の「腕の間に挟む」で
        collarHeightMm: s.collarHeightMm,
        collarWallMm: s.collarWallMm,
      },
      shank: {
        gou: s.gou,
        metal: metalIdOf(s.metal),
        widthMm: s.shankWidthMm,
        thicknessMm: s.shankThicknessMm,
        section: s.shankSection,
        sectionPoints: s.shankSection === "free" ? s.sectionPoints : undefined,
        sectionCurve: s.shankSection === "free" ? s.sectionCurve : undefined,
        stations: s.style === "tension" ? undefined : s.shankStations,
        // 動かしている間は彫らない（止まったら細かく作り直す。確かめの数は同じ）
        relief: s.style === "tension" || !s.shankRelief ? undefined : quality === "preview" ? { ...s.shankRelief, draft: true } : s.shankRelief,
        reliefMore: s.style === "tension" ? undefined : s.shankReliefMore,
      },
      orientation: s.orientation,
    };
    let ring = buildRing(ringParams);
    // 腕の間に挟めない石：爪が腕を避けられない・角を爪で守れない・下の輪が石に収まらない
    const blocked = (r: typeof ring) =>
      r.setting.join === "between" && (r.setting.prongsOnArm > 0 || r.setting.collarBlocked || cornerDistances(r.setting).some((d) => d > guides.prong.cornerReachMm + 1e-9));
    if (!s.joinSet && !trio && !s.layout && blocked(ring)) {
      // 向きを人が選んでいなければ、もう一方の向きを試す
      let done = false;
      if (!s.orientationSet) {
        const other = s.orientation === "along" ? "across" : "along";
        const r2 = buildRing({ ...ringParams, orientation: other });
        if (!blocked(r2)) {
          ring = r2;
          s.orientation = other;
          done = true;
        }
      }
      // それでもだめなら、腕の上にのせる（職人 2026-11-05。別の留め方をすすめる一言は画面が出す）
      if (!done) ring = buildRing({ ...ringParams, setting: { ...ringParams.setting, join: "on" as const } });
    }
    const problems = checkRing(ring, { position: s.position, guides, guidesFor: (i) => (i === 0 ? guides : slotGuides[i - 1]) }).map((p) => ({ ...p, rule: ruleForCheck(ledger, p.check) }));
    return { ring, problems };
  }

  private settingState(): SettingState {
    const st = this.built!.ring.setting;
    return {
      style: st.style,
      prong_count: st.style === "prong" ? st.prongs.length : null,
      v_prong_count: st.prongs.filter((p) => p.isV).length,
      prong_mm: st.style === "prong" ? Math.round((st.prongs[0]?.diameterMm ?? 0) * 100) / 100 : null,
      prong_positions: this.state.prongPositions ?? [],
      v_corners: !!this.state.vCorners,
      height: this.state.height,
      orientation: this.state.orientation,
      join: st.join,
      prong_tip: st.prongTip,
      bezel_wall_mm: st.bezel ? Math.round(st.bezel.wallMm * 100) / 100 : null,
      ...(st.tension
        ? {
            tension: {
              gap_mm: Math.round(st.tension.gapMm * 100) / 100,
              ends: st.tension.ends.map((e) => ({ kind: e.kind, depth_mm: Math.round(e.depthMm * 100) / 100 })),
              grip: st.tension.grip,
              grips: st.tension.grips,
              insert: tensionInsert(st.tension).how,
              no_side_stop: tensionInsert(st.tension).noStop,
              overhang_mm: Math.round(st.tension.overhangMm * 100) / 100,
            },
          }
        : {}),
    };
  }

  // ---- 道具 ----

  setSetting(input: SetSettingInput): SetSettingResult {
    const s = this.state;
    if (input.style) this.switchStyle(input.style);
    if (input.v_corners !== undefined) {
      s.vCorners = input.v_corners;
      // V 字の爪は尖った角に立てる（手で決めた爪の位置は使わない）
      if (input.v_corners && !input.prong_positions) s.prongPositions = undefined;
    }
    if (input.prong_count !== undefined) {
      // 0 は「自動」（角の数・石の形から決める）
      s.prongCount = input.prong_count > 0 ? input.prong_count : undefined;
      s.prongPositions = undefined;
    }
    if (input.prong_positions) s.prongPositions = input.prong_positions;
    if (input.prong_mm !== undefined) s.prongMm = input.prong_mm;
    if (input.height) {
      s.height = input.height;
      s.culetGapMm = undefined;
    }
    if (input.culet_gap_mm !== undefined) s.culetGapMm = input.culet_gap_mm;
    if (input.orientation) {
      s.orientation = input.orientation;
      s.orientationSet = true;
    }
    if (input.join) {
      s.join = input.join;
      s.joinSet = true;
    }
    if (input.tension_grip) s.tensionGrip = input.tension_grip;
    if (input.prong_tip) s.prongTip = input.prong_tip;
    const b = this.build(input.reason);
    if (b.ring.setting.style === "tension") {
      return {
        setting: this.settingState(),
        hold: { value: 0, required: 0, where: s.position, note: "テンションは爪の留まりでは比べない。地金は加工硬化した硬い状態が条件。最後は職人が決める" },
      };
    }
    return {
      setting: this.settingState(),
      hold: {
        value: Math.round(holdRatio(b.ring.setting, effectiveGuides(this.ledger(), this.sizeMm())) * 100) / 100,
        required: requiredHold(s.position),
        where: s.position,
        note: "標準の 4 本爪・標準の太さ・標準の高さ ＝ 1.0×。爪を片持ちの棒と見なした目安の比べで、強度計算の代わりではない",
      },
      ...(input.v_corners ? { note: "V 字の爪は形の出来がまだ足りないので、今は作れない。尖った角には丸い爪を立てた形で出している" } : {}),
    };
  }

  /**
   * 留め方を変える。テンションに入るときは、腕を職人の丸線に替え（前の腕は覚えておく）、石は一粒にする。
   * テンションから出るときは、前の腕へ戻す
   */
  private switchStyle(style: RingState["style"]): void {
    const s = this.state;
    if (style === s.style) return;
    if (style === "tension") {
      s.beforeTension = { shankSection: s.shankSection, shankWidthMm: s.shankWidthMm, shankThicknessMm: s.shankThicknessMm, sectionPoints: s.sectionPoints, sectionCurve: s.sectionCurve };
      Object.assign(s, { shankSection: "maru", shankWidthMm: GUIDES.tension.wireMm, shankThicknessMm: GUIDES.tension.wireMm, sectionPoints: undefined, sectionCurve: undefined, layout: undefined, stones: undefined, mainAtMm: undefined, spreadMm: undefined });
    } else if (s.style === "tension") {
      Object.assign(s, s.beforeTension ?? { shankSection: undefined, shankWidthMm: undefined, shankThicknessMm: undefined, sectionPoints: undefined, sectionCurve: undefined });
      s.beforeTension = undefined;
      s.culetGapMm = undefined;
    }
    s.style = style;
  }

  setShank(input: SetShankInput): SetShankResult {
    const s = this.state;
    // テンションの腕は丸線のまま（石を挟む溝が腕の形で決まる）。断面の線と場所ごとの形は使わない
    const free = s.style !== "tension";
    if (input.width_mm !== undefined) s.shankWidthMm = input.width_mm;
    if (input.thickness_mm !== undefined) s.shankThicknessMm = input.thickness_mm;
    if (input.gou !== undefined) s.gou = input.gou;
    if (input.metal) s.metal = input.metal;
    if (input.stations && free) s.shankStations = input.stations.length ? input.stations.map(stationFrom) : undefined;
    if (input.relief && free) s.shankRelief = reliefFrom(input.relief, s.shankRelief);
    if (input.relief_more && free) s.shankReliefMore = input.relief_more.length ? input.relief_more.flatMap((q) => reliefFrom(q, undefined) ?? []) : undefined;
    if (input.section) {
      s.shankSection = input.section;
      if (input.section !== "free") {
        s.sectionPoints = undefined;
        s.sectionCurve = undefined;
      }
    }
    if (input.section_points) {
      s.shankSection = "free";
      s.sectionPoints = input.section_points.map((p) => ({ x: p.x, y: p.y }));
      s.sectionCurve = undefined;
    }
    if (input.section_curve && free) {
      s.shankSection = "free";
      s.sectionCurve = { points: input.section_curve.points.map((p) => ({ x: p.x, y: p.y })), knots: input.section_curve.knots ? [...input.section_curve.knots] : undefined };
      s.sectionPoints = undefined;
    }
    const b = this.build(input.reason);
    const sh = b.ring.shank;
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const notes = [
      s.metal === "k18wg" || s.metal === "k18pg" ? "重さは K18 イエローで出している（色は選んだ地金）" : "",
      !free && (input.section_curve || input.stations || input.relief) ? "テンションの腕は丸線のままなので、断面の線・場所ごとの形・彫りは使っていない" : "",
      free && (s.shankStations?.length || s.shankRelief) && s.shankSection === "maru" ? "丸線の腕には場所ごとの形と彫りを使えない。使うなら断面を変える" : "",
      free && (s.shankStations?.length || s.shankRelief) && b.ring.stones.length > 1 ? "石を並べた指輪の腕はどこも同じ形で、彫りもしていない" : "",
    ].filter(Boolean);
    return {
      shank: {
        width_mm: r2(sh.widthMm),
        thickness_mm: r2(sh.thicknessMm),
        section: sh.section,
        gou: s.gou,
        inner_diameter_mm: r2(sh.innerDiameterMm),
        metal: s.metal,
        ...(sh.along && s.shankStations?.length
          ? {
              stations: s.shankStations.map((st) => ({ at_deg: st.atDeg, width_mm: r2(st.widthMm), thickness_mm: r2(st.thicknessMm) })),
              min_width_mm: r2(sh.minWidthMm ?? sh.widthMm),
              min_thickness_mm: r2(sh.minThicknessMm ?? sh.thicknessMm),
            }
          : {}),
        ...(sh.relief ? { relief: { pattern: sh.relief.kind, count: sh.relief.count, depth_mm: sh.relief.depthMm, from_deg: Math.round(sh.relief.fromDegUsed), to_deg: Math.round(sh.relief.toDegUsed), under_mm: r2(sh.relief.peakUnderMm) } } : {}),
      },
      weight_g: Math.round(b.ring.metalWeightG * 10) / 10,
      note: notes.length ? notes.join("。") : undefined,
    };
  }

  /** 三石・横一列に並べ直す（石の場所は、石座どうしの間が既定の間 ＋ spreadMm になる所） */
  arrange(layout: StoneLayout, opts: { count?: number; sideMm?: number; sideStyle?: "prong" | "bezel"; spreadMm?: number; sideShape?: SlotShape } = {}): void {
    const s = this.state;
    s.layout = layout;
    if (opts.spreadMm !== undefined) s.spreadMm = opts.spreadMm;
    const extra = s.spreadMm ?? 0;
    const shank = { gou: s.gou, widthMm: s.shankWidthMm, thicknessMm: s.shankThicknessMm, section: s.shankSection };
    // 組むときと同じ石座で並べる（目安帳の爪の太さの決まりも同じ）
    const minProngMm = prongMinOverride(this.guides());
    const head = { style: s.style, height: s.height, culetGapMm: s.culetGapMm, prongCount: s.prongCount, prongDiameterMm: s.prongMm, vAtCorners: false, minProngMm };
    if (layout === "solo") {
      s.stones = undefined;
      s.mainAtMm = undefined;
      s.spreadMm = undefined;
    } else if (layout === "trio") {
      const prev = s.stones?.[0];
      // 両脇の石は、なければ丸い石（三石のよくある形。作者の頼み）
      const shape = opts.sideShape ?? prev?.shape ?? "round";
      // 脇の石の大きさの既定：真ん中の石の長辺の sideRatio（ペアのような細長い形は、その幅になり、長さは形の比のぶん長くなる）。形を変えたときは大きさも決め直す
      const pre = PRESETS.find((x) => x.id === shape);
      const aspect = shape !== "photo" && pre ? pre.longMm / pre.widthMm : 1;
      const keep = prev && prev.shape === shape ? prev.longMm : undefined;
      const sideMm = opts.sideMm ?? keep ?? Math.round(this.stone.longMm * GUIDES.multi.sideRatio * aspect * 10) / 10;
      const style = opts.sideStyle ?? prev?.style;
      const side = slotStone(this.stone, { shape, longMm: sideMm });
      const sideHead = { ...head, height: GUIDES.multi.trio.sideHeight, culetGapMm: undefined, style: style ?? s.style, prongCount: shape === "pear" ? GUIDES.multi.trio.pearProngCount : undefined, prongDiameterMm: undefined, minProngMm: this.minProngFor(side) };
      const [l, r] = layoutTrio(this.stone, side, head, shank, extra, s.orientation, sideHead, trioTurn({ shape, atMm: 1 }));
      s.mainAtMm = undefined;
      const prongCount = shape === "pear" ? GUIDES.multi.trio.pearProngCount : undefined;
      s.stones = [l, r].map((atMm) => ({ atMm, shape, longMm: sideMm, style, prongCount }));
    } else {
      const [lo, def, hi] = GUIDES.multi.rowCount;
      const n = Math.max(lo, Math.min(hi, Math.round(opts.count ?? (s.stones && s.layout === "row" ? s.stones.length + 1 : def))));
      const at = layoutRow(this.stone, n, head, shank, extra, s.orientation);
      // 真ん中の石は、並びの真ん中（偶数のときは真ん中の 2 つのうち − の側）
      const mid = Math.floor((n - 1) / 2);
      s.mainAtMm = at[mid] === 0 ? undefined : at[mid];
      const style = opts.sideStyle;
      s.stones = at.filter((_, i) => i !== mid).map((atMm) => ({ atMm, shape: "photo" as const, longMm: this.stone.longMm, style }));
    }
  }

  /** その石の大きさでの、目安帳の爪の最低の太さ（決まりがなければ undefined） */
  private minProngFor(st: StoneParams): number | undefined {
    return prongMinOverride(effectiveGuides(this.ledger(), stoneSizeMm(st.longMm, st.widthMm)));
  }

  setStones(input: SetStonesInput): SetStonesResult {
    this.arrange(input.layout, { count: input.count, sideMm: input.side_mm, sideStyle: input.side_style, spreadMm: input.spread_mm });
    const b = this.build(input.reason);
    return {
      layout: input.layout,
      stones: b.ring.stones.map((st, i) => ({ no: i + 1, at_mm: Math.round(st.atMm * 100) / 100, long_mm: Math.round(st.params.longMm * 100) / 100, style: st.setting.style })),
      note: "石の番号 1 は真ん中の石（今の石）。場所は、腕のいちばん上から腕に沿って測った長さ（mm）。間の数字は仮の目安・最後は職人が決める",
    };
  }

  /** 人が 1 つずつ置く：腕の上の場所に石を足す（形と大きさは、なければ今の石の 6 割ほどの同じ形） */
  addStone(atMm: number, slot: Partial<Omit<StoneSlot, "atMm">> = {}): number {
    const s = this.state;
    const last = s.stones?.[s.stones.length - 1];
    const longMm = slot.longMm ?? last?.longMm ?? Math.round(this.stone.longMm * GUIDES.multi.sideRatio * 10) / 10;
    s.stones = [...(s.stones ?? []), { atMm, shape: slot.shape ?? last?.shape ?? "photo", longMm, style: slot.style ?? last?.style, prongCount: slot.prongCount }];
    s.layout = "free";
    return s.stones.length;
  }

  /** 並べた石（番号は RingDesign.stones の番号。0 ＝ 真ん中の石）を動かす・変える・外す */
  moveStone(i: number, atMm: number): void {
    const s = this.state;
    if (i === 0) s.mainAtMm = atMm === 0 ? undefined : atMm;
    else if (s.stones?.[i - 1]) s.stones[i - 1] = { ...s.stones[i - 1], atMm };
    s.layout = "free";
  }

  editStone(i: number, patch: Partial<Omit<StoneSlot, "atMm">>): void {
    const s = this.state;
    if (i <= 0 || !s.stones?.[i - 1]) return;
    s.stones[i - 1] = { ...s.stones[i - 1], ...patch };
    if (s.layout !== "row" && s.layout !== "trio") s.layout = "free";
  }

  removeStone(i: number): void {
    const s = this.state;
    if (i <= 0 || !s.stones?.[i - 1]) return;
    s.stones = s.stones.filter((_, k) => k !== i - 1);
    if (!s.stones.length) {
      s.stones = undefined;
      s.layout = undefined;
      s.mainAtMm = undefined;
    } else s.layout = "free";
  }

  /** 石の間を広げる（直し方）。三石・横一列は並べ直し、自由に置いた石は、間の狭い 2 つを離す */
  spreadStones(pair?: [number, number]): void {
    const s = this.state;
    if (s.layout === "trio" || s.layout === "row") {
      this.arrange(s.layout, { spreadMm: (s.spreadMm ?? 0) + SPREAD_STEP_MM, count: s.layout === "row" ? (s.stones?.length ?? 0) + 1 : undefined });
      return;
    }
    const ring = this.built?.ring;
    if (!ring || !pair) return;
    const [a, b] = pair.map((i) => ring.stones[i]);
    const dir = Math.sign(b.atMm - a.atMm) || 1;
    // 真ん中の石は動かさず、ほかの石を外へ
    const move = (i: number, by: number) => this.moveStone(i, ring.stones[i].atMm + by);
    if (pair[0] === 0) move(pair[1], dir * SPREAD_STEP_MM * 2);
    else if (pair[1] === 0) move(pair[0], -dir * SPREAD_STEP_MM * 2);
    else {
      move(pair[0], -dir * SPREAD_STEP_MM);
      move(pair[1], dir * SPREAD_STEP_MM);
    }
  }

  /** 横の石を小さくする（直し方）。三石は並べ直す */
  smallerStones(): void {
    const s = this.state;
    if (!s.stones?.length) return;
    if (s.layout === "trio") {
      this.arrange("trio", { sideMm: Math.round(s.stones[0].longMm * SMALLER_STEP * 10) / 10 });
      return;
    }
    s.stones = s.stones.map((x) => ({ ...x, longMm: Math.round(x.longMm * SMALLER_STEP * 10) / 10 }));
  }

  check(): CheckResult {
    const b = this.built ?? this.build();
    const std = b.ring.setting.standardProngMm;
    const failed = new Set(b.problems.map((p) => p.check));
    const opening = tensionOpening(b.ring.setting, b.ring.shank, this.guides(), springIdOf(this.state.metal));
    const spring = tensionSpring(b.ring.setting, b.ring.shank, "hardened", this.guides());
    const insert = b.ring.setting.tension ? tensionInsert(b.ring.setting.tension) : null;
    const groove = grooveNote(b.ring.shank, this.guides());
    return {
      problems: b.problems.map((p) => ({
        check: CHECK_NAME[p.check] ?? p.check,
        where: p.where,
        current: p.current,
        required: p.required,
        reason: p.rule ? `${p.reason}（根拠：${p.rule.title}・${p.rule.source.kind === "craftsman" ? `職人 ${p.rule.source.name}` : p.rule.source.kind === "public" ? `公開情報 ${p.rule.source.title}` : "仮の目安"}）` : p.reason,
        options: p.options.map((o) => ({ action: o.label, appearance: o.effectOnLook, tool_hint: hintFor(o.id, this.state, std, b.ring.setting.tension) })),
      })),
      passed: Object.entries(CHECK_NAME)
        .filter(([k]) => !failed.has(k as Problem["check"]) && (b.ring.setting.style === "tension" ? TENSION_CHECKS.has(k) : !k.startsWith("tension-") && (b.ring.stones.length > 1 || !k.endsWith("-space")) && (b.ring.setting.collar !== null || (k !== "collar-wall" && k !== "band-end")) && (k !== "band-relief" || !!b.ring.shank.relief) && (k !== "band-valley" || b.ring.shank.section === "free")))
        .map(([, v]) => v),
      note: `数字は目安・最後は職人が決める。石の一番下と指のすき間は ${b.ring.culetGapMm.toFixed(2)} mm、地金は約 ${b.ring.metalWeightG.toFixed(1)} g。${tensionNotes(b.ring.setting, b.ring.shank.thicknessMm, this.guides()).join(" ")}${insert ? ` 石の入れ方：${insert.how}。${insert.hold}。` : ""}${opening ? ` ${tensionOpeningText(opening)}` : ""}${groove ? ` ${groove.where} ${groove.widthMm.toFixed(2)} mm：${groove.text}（止めません。形はこのままでかまいません）。` : ""}`.trim(),
      ...(spring
        ? {
            tension_calc: {
              ...springForClaude(spring),
              cautions: tensionCautions(b.ring.setting, spring, springIdOf(this.state.metal), this.guides()).map((c) => ({ title: c.title, text: c.text })),
            },
          }
        : {}),
    };
  }

  async look(input: LookInput): Promise<LookResult> {
    // Claude には、細かい形の画像を見せる
    this.flush();
    const data = await this.shoot(input.view);
    return { view: input.view, media_type: "image/png", data };
  }

  snapshot(): RingState {
    return structuredClone(this.state);
  }

  restore(s: RingState): void {
    this.state = structuredClone(s);
    this.build("元に戻した");
  }
}

/** 石の間を広げる直し方で、1 回に広げる長さ（mm）と、横の石を小さくする割合（直し方の 1 歩。形を作るための決まり） */
export const SPREAD_STEP_MM = 0.3;
/** 下の輪を高くする直し方の 1 歩（mm）と、腕を薄くする 1 歩（mm）。形を作るための決まり */
export const COLLAR_STEP_MM = 0.2;
export const BAND_THIN_STEP_MM = 0.1;
/** テンションの腕の線を太くする直し方の 1 歩（mm）。形を作るための決まり */
export const WIRE_STEP_MM = 0.5;
export const SMALLER_STEP = 0.85;

/** 直し方の名前（画面のボタン） */
export const FIX_LABEL = (id: FixId) => FIXES[id].label;
/** 高さの目安（画面の説明に使う） */
export const HEIGHT_OPTIONS = GUIDES.height.options;
