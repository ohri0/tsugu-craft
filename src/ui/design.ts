// 画面で選ぶ指輪の設計（手順 6 のつまみ）と、決まりごとから作る 3 案（手順 5）。
// Claude が使えないときも、この 3 案を「決まりごとから」と書いて出す（SPEC「Claude の役割」）。
import type { Corner } from "../geometry/corners";
import { buildRing, type Orientation, type RingDesign } from "../geometry/ring";
import { autoProngCount, type JoinStyle, type ProngTip, type SettingStyle } from "../geometry/setting";
import type { SectionCurve, ShankSection, ShankStation } from "../geometry/shank";
import type { ReliefParams } from "../geometry/shank-relief";
import type { StoneParams } from "../geometry/stone";
import { checkRing, type Problem } from "../rules/checks";
import { effectiveGuides, ruleForCheck, seedLedger, type Ledger, type Rule } from "../rules/ledger";
import { standardProngMm, stoneSizeMm, type HeightOption, type MetalId, type StonePosition } from "../rules/guides";

export interface Design {
  style: SettingStyle;
  /** 爪の本数。0 なら自動（角の数・石の形から） */
  prongCount: number;
  /** 爪の太さ ÷ 標準の太さ */
  prongScale: number;
  height: HeightOption;
  orientation: Orientation;
  metal: MetalId;
  gou: number;
  /** 石の場所（必要な留まりが変わる） */
  position: StonePosition;
  /** 尖った角を V 字の爪で包むか（なければ形の処理の既定） */
  vCorners?: boolean;
  /** 腕の断面（なければ甲丸） */
  section?: ShankSection;
  /** 腕の断面の線（section が free のとき） */
  sectionCurve?: SectionCurve;
  /** 腕の場所ごとの形（なければ、どこも同じ形） */
  stations?: ShankStation[];
  /** 腕の彫り（なければ彫らない） */
  relief?: ReliefParams;
  /** 腕の幅・厚み（mm、なければ目安） */
  shankWidthMm?: number;
  shankThicknessMm?: number;
  /** 石座と腕の付け方（爪留めだけ。なければ腕の上にのせる） */
  join?: JoinStyle;
  /** 爪の先の形（なければ丸い爪） */
  prongTip?: ProngTip;
}

export const DEFAULT_DESIGN: Design = {
  style: "prong",
  prongCount: 0,
  prongScale: 1,
  height: "standard",
  orientation: "along",
  metal: "k18y",
  gou: 11,
  position: "top",
};

/** 確かめの結果に、根拠の決まりを添えたもの */
export type CitedProblem = Problem & { rule?: Rule };

export interface Built {
  design: Design;
  ring: RingDesign;
  problems: CitedProblem[];
}

export function build(stone: StoneParams, d: Design, ledger: Ledger = seedLedger()): Built {
  const std = standardProngMm(stoneSizeMm(stone.longMm, stone.widthMm));
  const ring = buildRing({
    stone,
    setting: {
      style: d.style,
      height: d.height,
      prongCount: d.prongCount > 0 ? d.prongCount : undefined,
      prongDiameterMm: std * d.prongScale,
      vAtCorners: d.vCorners,
      join: d.join,
      prongTip: d.prongTip,
    },
    shank: { gou: d.gou, metal: d.metal, section: d.section, sectionCurve: d.sectionCurve, stations: d.stations, relief: d.relief, widthMm: d.shankWidthMm, thicknessMm: d.shankThicknessMm },
    orientation: d.orientation,
  });
  const problems = checkRing(ring, { position: d.position, guides: effectiveGuides(ledger, stoneSizeMm(stone.longMm, stone.widthMm)) });
  return { design: d, ring, problems: problems.map((p) => ({ ...p, rule: ruleForCheck(ledger, p.check) })) };
}

export interface Plan {
  name: string;
  reason: string;
  design: Design;
}

/** 決まりごとから作る、向きの違う 3 案 */
export function rulePlans(stone: StoneParams, corners: readonly Corner[], base: Design = DEFAULT_DESIGN): Plan[] {
  const n = autoProngCount(stone.longMm, stone.widthMm, corners.length);
  const hasCorners = corners.length > 0;
  return [
    {
      name: hasCorners ? `角を守る V 字の爪（${n} か所）` : `爪 ${n} 本・標準の高さ`,
      reason: hasCorners
        ? `尖った角が ${corners.length} か所。角は欠けやすいので、V 字の爪で包んで守る。`
        : "石の形に合わせた本数の爪で、石を見せる。",
      design: { ...base, style: "prong", prongCount: 0, prongScale: 1, height: "standard", orientation: "along" },
    },
    {
      name: "覆輪（ふくりん）・低め",
      reason: "縁をぐるりと金属の壁で包む。いちばん取れにくく、引っかかりも少ない。手をよく使う人に。",
      design: { ...base, style: "bezel", height: "low", orientation: "along" },
    },
    {
      name: "横向き・高め",
      reason: "長辺を指に直角に置き、高めに留める。光が入り石が大きく見える。",
      design: { ...base, style: "prong", prongCount: 0, prongScale: 1, height: "high", orientation: "across" },
    },
  ];
}
