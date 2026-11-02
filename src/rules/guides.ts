// 職人の目安の値。ここが 1 か所の置き場所で、コードの他の場所に数字を散らさない。
// 出どころは .claude/skills/jeweler-guides/SKILL.md。値を変えたら Skill も直す。
// すべて教科書・公開情報レベルの目安で、最後は職人が決める。

export const GUIDE_NOTE = "目安・最後は職人が決める";

export const GUIDES = {
  stone: {
    /** 縁（ガードル）の厚み ＝ 石の大きさ × この割合 */
    girdleThicknessRatio: 0.02,
    /** 横からの写真がないときの、上側（クラウン）：下側（パビリオン） */
    defaultCrownPavilion: [3, 7] as const,
  },
  prong: {
    /** 最低の太さ ＝ minBase ＋ perMm ×（石の大きさ − sizeOffset）mm */
    minBase: 0.5,
    perMm: 0.1,
    sizeOffset: 1.5,
    /** 標準の太さ ＝ 最低 × この倍率 */
    standardFactor: 1.15,
    /** 爪の先の高さ：石の上面までの高さに対する割合 */
    tipHeightRatio: [0.75, 0.85] as const,
    /** 爪が石にかかる長さ：上側の高さに対する割合 */
    crownOverlapRatio: [0.33, 0.5] as const,
    /** 尖った角から、この距離（mm）以内に爪がなければ守られていない */
    cornerReachMm: 0.9,
    /** 爪と爪の間のいちばん広い所 ÷ 縁の周 の上限 */
    maxGapRatio: 0.38,
    /** 細長いとみなす 長辺 ÷ 幅 */
    elongatedRatio: 1.45,
    /** 大きいとみなす長辺（mm） */
    largeLongMm: 9,
    /** 尖った角がこの数の範囲なら、爪の本数は角の数（角は V 字の爪で包む） */
    cornerCountRange: [3, 6] as const,
    /** 仮の目安：V 字の爪の 2 本の足の中心は、角から縁に沿って 爪の太さ × この値 の所 */
    vLegSpreadRatio: 1.0,
  },
  gallery: {
    /** 仮の目安：爪をつなぐ輪（石座の輪）の線の太さ ＝ 標準の爪の太さ × この値 */
    wireRatio: 0.7,
  },
  hold: {
    /** 必要な留まり（標準の 4 本爪 ＝ 1.0×） */
    requiredTop: 1.0,
    requiredSide: 1.2,
    requiredPalm: 1.4,
    bezel: 2.0,
    bead: 1.6,
    standardProngCount: 4,
    vProngLegs: 2,
  },
  bezel: {
    /** 内側の線 ＝ 石の縁 ＋ この値（mm） */
    clearanceMm: 0.04,
    wallMm: 0.5,
    wallMinMm: 0.4,
    /** 上の端が上側にかかる割合と上限（mm） */
    crownCoverRatio: 0.3,
    crownCoverMaxMm: 0.35,
  },
  height: {
    /** 石の一番下と指のすき間の最低（mm） */
    minFingerGapMm: 0.3,
    options: { low: 0, standard: 0.5, high: 1.0 } as const,
  },
  shank: {
    widthMm: 2.2,
    thicknessMm: 1.6,
    /** 号数から内径：base ＋（号数 − 1）÷ perGou */
    innerDiameterBaseMm: 13.0,
    gouPerMm: 3,
  },
  /**
   * 仮の目安：地金の密度（g/cm³）。重さの見積もりだけに使う。割り金の配合で変わるので、使う地金の値で上書きする。
   * 出典：https://learn.apmex.com/learning-guide/science/what-is-the-density-of-gold-vs-platinum/ ほか、
   * 公開の地金の重さの表（K18 イエロー 15.2〜15.6、Pt900 はパラジウム割りで約 19.9〜イリジウム割りで約 21.4、SV925 は 10.36〜10.4）
   */
  metals: {
    k18y: { name: "K18 イエローゴールド", densityGPerCm3: 15.5 },
    pt900: { name: "Pt900", densityGPerCm3: 20.0 },
    sv925: { name: "SV925", densityGPerCm3: 10.4 },
  },
} as const;

/** 数字の型を広げた目安（目安帳で値を上書きするため。GUIDES は文字どおりの値の型になっている） */
type Widen<T> = T extends number
  ? number
  : T extends string
    ? string
    : T extends readonly (infer U)[]
      ? readonly Widen<U>[]
      : T extends object
        ? { readonly [K in keyof T]: Widen<T[K]> }
        : T;
export type Guides = Widen<typeof GUIDES>;

export type MetalId = keyof typeof GUIDES.metals;
export type HeightOption = keyof typeof GUIDES.height.options;
export type StonePosition = "top" | "side" | "palm";

/** 石の場所ごとの、必要な留まり（標準の 4 本爪 ＝ 1.0×） */
export function requiredHold(position: StonePosition): number {
  const h = GUIDES.hold;
  return position === "palm" ? h.requiredPalm : position === "side" ? h.requiredSide : h.requiredTop;
}

/** 石の大きさ ＝（長辺 ＋ 幅）÷ 2 */
export function stoneSizeMm(longMm: number, widthMm: number): number {
  return (longMm + widthMm) / 2;
}

/** 爪の最低の太さ（mm） */
export function minProngMm(sizeMm: number): number {
  const p = GUIDES.prong;
  return p.minBase + p.perMm * (sizeMm - p.sizeOffset);
}

/** 爪の標準の太さ（mm） */
export function standardProngMm(sizeMm: number): number {
  return minProngMm(sizeMm) * GUIDES.prong.standardFactor;
}

/** 号数（日本のサイズ）から内径（mm） */
export function innerDiameterMm(gou: number): number {
  const s = GUIDES.shank;
  return s.innerDiameterBaseMm + (gou - 1) / s.gouPerMm;
}
