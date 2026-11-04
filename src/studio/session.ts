// 指輪の設計の場：石と設計を持ち、Claude の道具（set_setting / set_shank / check / look）を、
// 人のボタンと同じ関数で実行する。確かめは、いつも今の帳面（職人の決まり）で行う。画面には依存しない（look の画像だけ外から受け取る）。
import { buildRing, type RingDesign } from "../geometry/ring";
import { tAtOutlineIndex, type SolidQuality } from "../geometry/setting";
import type { SectionCurve, SectionPoint, ShankSection } from "../geometry/shank";
import type { StoneParams } from "../geometry/stone";
import { FIXES, checkRing, holdRatio, type FixId, type Problem } from "../rules/checks";
import { GUIDES, requiredHold, stoneSizeMm, type HeightOption, type MetalId, type StonePosition } from "../rules/guides";
import { effectiveGuides, prongMinOverride, ruleForCheck, type Ledger, type Rule } from "../rules/ledger";
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
  /** 腕の断面（なければ甲丸） */
  shankSection?: ShankSection;
  /** 手で描いた腕の断面の点（shankSection が free のとき） */
  sectionPoints?: SectionPoint[];
  /** 手で描いた腕の断面の線（なめらかな線の制御点と節。shankSection が free のとき。sectionPoints より先に使う。作品といっしょに残る） */
  sectionCurve?: SectionCurve;
  /** 尖った角を V 字の爪で包むか（なければ包まない：丸い爪を角に立てる普通の爪留め。作者の判断） */
  vCorners?: boolean;
  /** 石の一番下と指のすき間（mm）を直接決める（高さの選択より優先。職人の決まりに合わせて直すとき） */
  culetGapMm?: number;
  position: StonePosition;
}

/** つまみや Claude の set_setting が止まってから、細かい一体の形を作り直すまでの待ち（ms） */
export const FINAL_DELAY_MS = 250;

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
  "band-thin": "腕の厚み",
  "band-narrow": "腕の幅",
  "band-spike": "腕の断面のとがり・薄いヒレ",
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
    case "vAtCorner":
      // 爪の本数を自動に戻すと、尖った角に 1 本ずつ置く（V 字の爪は画面では使わない）
      return { tool: "set_setting", input: { style: "prong", v_corners: false, prong_count: 0 } };
    case "thickerBand":
      return { tool: "set_shank", input: { thickness_mm: GUIDES.band.minThicknessMm } };
    case "widerBand":
      return { tool: "set_shank", input: { width_mm: GUIDES.band.minWidthMm } };
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
    this.onChange(this.built, this.finalWhy);
  }

  private compose(quality: SolidQuality): Built {
    const s = this.state;
    const outline = this.stone.outlineMm;
    const ledger = this.ledger();
    const guides = effectiveGuides(ledger, this.sizeMm());
    const ring = buildRing({
      stone: this.stone,
      setting: {
        style: s.style,
        height: s.height,
        culetGapMm: s.culetGapMm,
        prongCount: s.prongCount,
        prongDiameterMm: s.prongMm,
        minProngMm: prongMinOverride(guides),
        prongs: s.prongPositions?.length ? s.prongPositions.map((i) => ({ t: tAtOutlineIndex(outline, i) })) : undefined,
        solid: this.solid,
        solidQuality: quality,
        // 既定は、角を丸い爪で押さえる普通の爪留め（作者の判断）。V 字の爪は選んだときだけ
        // V 字の爪は、形の出来がまだ足りないので画面では使わない（作者と決めた。2026-11-04）
        vAtCorners: false,
      },
      shank: {
        gou: s.gou,
        metal: metalIdOf(s.metal),
        widthMm: s.shankWidthMm,
        thicknessMm: s.shankThicknessMm,
        section: s.shankSection,
        sectionPoints: s.shankSection === "free" ? s.sectionPoints : undefined,
        sectionCurve: s.shankSection === "free" ? s.sectionCurve : undefined,
      },
      orientation: s.orientation,
    });
    const problems = checkRing(ring, { position: s.position, guides }).map((p) => ({ ...p, rule: ruleForCheck(ledger, p.check) }));
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
      bezel_wall_mm: st.bezel ? Math.round(st.bezel.wallMm * 100) / 100 : null,
    };
  }

  // ---- 道具 ----

  setSetting(input: SetSettingInput): SetSettingResult {
    const s = this.state;
    if (input.style) s.style = input.style;
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
    if (input.orientation) s.orientation = input.orientation;
    const b = this.build(input.reason);
    return {
      setting: this.settingState(),
      hold: {
        value: Math.round(holdRatio(b.ring.setting, effectiveGuides(this.ledger(), this.sizeMm())) * 100) / 100,
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
    if (input.section_curve) {
      s.shankSection = "free";
      s.sectionCurve = { points: input.section_curve.points.map((p) => ({ x: p.x, y: p.y })), knots: input.section_curve.knots ? [...input.section_curve.knots] : undefined };
      s.sectionPoints = undefined;
    }
    const b = this.build(input.reason);
    const sh = b.ring.shank;
    return {
      shank: {
        width_mm: Math.round(sh.widthMm * 100) / 100,
        thickness_mm: Math.round(sh.thicknessMm * 100) / 100,
        section: sh.section,
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
    const std = b.ring.setting.standardProngMm;
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

/** 直し方の名前（画面のボタン） */
export const FIX_LABEL = (id: FixId) => FIXES[id].label;
/** 高さの目安（画面の説明に使う） */
export const HEIGHT_OPTIONS = GUIDES.height.options;
