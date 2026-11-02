// 指輪の設計の場：石と設計を持ち、Claude の道具（set_setting / set_shank / check / look）を、
// 人のボタンと同じ関数で実行する。確かめは、いつも今の帳面（職人の決まり）で行う。画面には依存しない（look の画像だけ外から受け取る）。
import { buildRing, type RingDesign } from "../geometry/ring";
import { tAtOutlineIndex } from "../geometry/setting";
import type { StoneParams } from "../geometry/stone";
import { FIXES, checkRing, holdRatio, type FixId, type Problem } from "../rules/checks";
import { GUIDES, requiredHold, standardProngMm, stoneSizeMm, type HeightOption, type MetalId, type StonePosition } from "../rules/guides";
import { effectiveGuides, ruleForCheck, type Ledger, type Rule } from "../rules/ledger";
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
  SettingState,
  ToolHost,
} from "../claude/tools";

/** 設計（Claude の道具と、人のつまみが同じものを動かす） */
export interface RingState {
  style: "prong" | "bezel";
  /** 爪の本数（なければ石の形から自動） */
  prongCount?: number;
  /** 爪の太さ（mm、なければ標準） */
  prongMm?: number;
  /** 爪を置く輪郭の点の番号（なければ自動） */
  prongPositions?: number[];
  height: HeightOption;
  orientation: "along" | "across";
  /** 道具で選んだ地金の名前（見た目は 3 種の地金のどれかで出す） */
  metal: Metal;
  gou: number;
  shankWidthMm?: number;
  shankThicknessMm?: number;
  position: StonePosition;
}

export const DEFAULT_STATE: RingState = { style: "prong", height: "standard", orientation: "along", metal: "k18yg", gou: 11, position: "top" };

/** 道具の地金の名前 → 形と重さを出す地金 */
export function metalIdOf(m: Metal): MetalId {
  if (m === "pt900") return "pt900";
  if (m === "sv925") return "sv925";
  return "k18y";
}

export const METAL_LABEL: Record<Metal, string> = { pt900: "Pt900", k18yg: "K18 イエロー", k18wg: "K18 ホワイト", k18pg: "K18 ピンク", sv925: "SV925" };

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
};

/** 直し方 → Claude が使える道具と入力の例 */
function hintFor(id: FixId, s: RingState, std: number): FixOption["tool_hint"] {
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
    default:
      return undefined;
  }
}

export class RingSession implements ToolHost<RingState> {
  state: RingState = { ...DEFAULT_STATE };
  built: Built | null = null;

  constructor(
    public stone: StoneParams,
    private ledger: () => Ledger,
    /** 形が変わったとき（画面を描き直す） */
    private onChange: (b: Built, why: string) => void,
    /** look の道具：その向きの画像（base64 の PNG） */
    private shoot: (view: LookInput["view"]) => Promise<string> | string,
  ) {}

  /** 石座を継ぎ目のない一体の形で作る（画面と STL。重いのでテストでは使わない） */
  solid = false;

  private sizeMm() {
    return stoneSizeMm(this.stone.longMm, this.stone.widthMm);
  }

  /** 今の設計で組んで、今の帳面で確かめる */
  build(why = ""): Built {
    const s = this.state;
    const outline = this.stone.outlineMm;
    const ring = buildRing({
      stone: this.stone,
      setting: {
        style: s.style,
        height: s.height,
        prongCount: s.prongCount,
        prongDiameterMm: s.prongMm,
        prongs: s.prongPositions?.length ? s.prongPositions.map((i) => ({ t: tAtOutlineIndex(outline, i) })) : undefined,
        solid: this.solid,
        // 角は丸い爪で押さえる普通の爪留め（作者の判断）。V 字の爪は使わない
        vAtCorners: false,
      },
      shank: { gou: s.gou, metal: metalIdOf(s.metal), widthMm: s.shankWidthMm, thicknessMm: s.shankThicknessMm },
      orientation: s.orientation,
    });
    const ledger = this.ledger();
    const problems = checkRing(ring, { position: s.position, guides: effectiveGuides(ledger, this.sizeMm()) }).map((p) => ({ ...p, rule: ruleForCheck(ledger, p.check) }));
    this.built = { ring, problems };
    this.onChange(this.built, why);
    return this.built;
  }

  private settingState(): SettingState {
    const st = this.built!.ring.setting;
    return {
      style: st.style,
      prong_count: st.style === "prong" ? st.prongs.length : null,
      v_prong_count: st.prongs.filter((p) => p.isV).length,
      prong_mm: st.style === "prong" ? Math.round((st.prongs[0]?.diameterMm ?? 0) * 100) / 100 : null,
      prong_positions: this.state.prongPositions ?? [],
      height: this.state.height,
      orientation: this.state.orientation,
      bezel_wall_mm: st.bezel ? Math.round(st.bezel.wallMm * 100) / 100 : null,
    };
  }

  // ---- 道具 ----

  setSetting(input: SetSettingInput): SetSettingResult {
    const s = this.state;
    if (input.style) s.style = input.style;
    if (input.prong_count !== undefined) {
      s.prongCount = input.prong_count;
      s.prongPositions = undefined;
    }
    if (input.prong_positions) s.prongPositions = input.prong_positions;
    if (input.prong_mm !== undefined) s.prongMm = input.prong_mm;
    if (input.height) s.height = input.height;
    if (input.orientation) s.orientation = input.orientation;
    const b = this.build(input.reason);
    return {
      setting: this.settingState(),
      hold: {
        value: Math.round(holdRatio(b.ring.setting) * 100) / 100,
        required: requiredHold(s.position),
        where: s.position,
        note: "標準の 4 本爪・標準の太さ・標準の高さ ＝ 1.0×。爪を片持ちの棒と見なした目安の比べで、強度計算の代わりではない",
      },
    };
  }

  setShank(input: SetShankInput): SetShankResult {
    const s = this.state;
    if (input.width_mm !== undefined) s.shankWidthMm = input.width_mm;
    if (input.thickness_mm !== undefined) s.shankThicknessMm = input.thickness_mm;
    if (input.gou !== undefined) s.gou = input.gou;
    if (input.metal) s.metal = input.metal;
    const b = this.build(input.reason);
    const sh = b.ring.shank;
    return {
      shank: {
        width_mm: Math.round(sh.widthMm * 100) / 100,
        thickness_mm: Math.round(sh.thicknessMm * 100) / 100,
        gou: s.gou,
        inner_diameter_mm: Math.round(sh.innerDiameterMm * 100) / 100,
        metal: s.metal,
      },
      weight_g: Math.round(b.ring.metalWeightG * 10) / 10,
      note: s.metal === "k18wg" || s.metal === "k18pg" ? "見た目と重さは K18 イエローで出している" : undefined,
    };
  }

  check(): CheckResult {
    const b = this.built ?? this.build();
    const std = standardProngMm(this.sizeMm());
    const failed = new Set(b.problems.map((p) => p.check));
    return {
      problems: b.problems.map((p) => ({
        check: CHECK_NAME[p.check] ?? p.check,
        where: p.where,
        current: p.current,
        required: p.required,
        reason: p.rule ? `${p.reason}（根拠：${p.rule.title}・${p.rule.source.kind === "craftsman" ? `職人 ${p.rule.source.name}` : p.rule.source.kind === "public" ? `公開情報 ${p.rule.source.title}` : "仮の目安"}）` : p.reason,
        options: p.options.map((o) => ({ action: o.label, appearance: o.effectOnLook, tool_hint: hintFor(o.id, this.state, std) })),
      })),
      passed: Object.entries(CHECK_NAME)
        .filter(([k]) => !failed.has(k as Problem["check"]))
        .map(([, v]) => v),
      note: `数字は目安・最後は職人が決める。石の一番下と指のすき間は ${b.ring.culetGapMm.toFixed(2)} mm、地金は約 ${b.ring.metalWeightG.toFixed(1)} g。`,
    };
  }

  async look(input: LookInput): Promise<LookResult> {
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

/** 直し方の名前（画面のボタン） */
export const FIX_LABEL = (id: FixId) => FIXES[id].label;
/** 高さの目安（画面の説明に使う） */
export const HEIGHT_OPTIONS = GUIDES.height.options;
