// 「どんな模様になるか」（どの技でも：src/rebuild/pattern-sim.ts）の計算に使う値と色。ここ 1 か所にまとめる。
// どれも形の見込み（仮）。出典のある測った値ではない。絵を描くための目安で、金属の本当の流れや熱は計算しない。
// 木目金の試し（src/rebuild/mokume-values.ts）とは別。赤銅と銅の色だけは、同じ絵の色を使う。
import { MOKUME_METALS } from "./mokume-values";

/** 重ねる材料。名前は画面に出す言葉。色は絵の色（仮）：raw＝そのまま、etch＝酸で地を出したとき、patina＝煮色のように色を出したとき */
export const PATTERN_METALS = {
  shakudo: { name: "赤銅", raw: MOKUME_METALS.shakudo.raw, etch: "#5a4436", patina: MOKUME_METALS.shakudo.niiro },
  copper: { name: "銅", raw: MOKUME_METALS.copper.raw, etch: "#b8714f", patina: MOKUME_METALS.copper.niiro },
  shibuichi: { name: "四分一（銀と銅の合金）", raw: "#b3a596", etch: "#8f8476", patina: "#6b6e6c" },
  silver: { name: "銀", raw: "#dcdcd8", etch: "#e8e8e4", patina: "#cfcdc6" },
  gold: { name: "金", raw: "#d9b45c", etch: "#dcb862", patina: "#d2a94c" },
  brass: { name: "真鍮", raw: "#cdb064", etch: "#b99a50", patina: "#8a6b3c" },
  nickel: { name: "ニッケル", raw: "#c9c9c4", etch: "#e6e6e1", patina: "#b9b9b3" },
  steel_dark: { name: "黒くなる鋼（炭素の多い鋼）", raw: "#8e9297", etch: "#2b2d30", patina: "#36322f" },
  steel_light: { name: "白く残る鋼（炭素の少ない鋼）", raw: "#a2a6ab", etch: "#c4c8cc", patina: "#8d8a86" },
  iron: { name: "鉄", raw: "#7e7b77", etch: "#4b4844", patina: "#4d3b30" },
  dark: { name: "暗い色の材料（名前が分からない）", raw: "#4a4644", etch: "#3a3634", patina: "#2a2624" },
  light: { name: "明るい色の材料（名前が分からない）", raw: "#d6d0c4", etch: "#e2ddd2", patina: "#cfc6b4" },
  red: { name: "赤い色の材料（名前が分からない）", raw: "#b0503a", etch: "#9c4532", patina: "#8a3626" },
} as const;

export type MetalId = keyof typeof PATTERN_METALS;
export const METAL_IDS = Object.keys(PATTERN_METALS) as MetalId[];

/** 絵の色（模様の外） */
export const PATTERN_COLORS = {
  /** はがれ（層がつながらない所）のふち */
  gap: "#e2a43c",
  /** はがれの口の中 */
  gapInside: "#120d0b",
  /** 断面の外（空気） */
  air: "#0c0b0b",
} as const;

/** 形の見込みの値（どれも仮。出典はない） */
export const PATTERN_VALUES = {
  /** つなぎ方ごとの、層の境のつながらない所の割合（0〜1）。つなぐ手順が見当たらないときは none */
  unbonded: { good: 0, partial: 0.12, poor: 0.35, none: 0.35 },
  /** はがれが表に口を開ける、表から層の境までの近さ（層の厚みを 1 として） */
  openDepth: 0.55,
  /** 平らに叩く・のばすときの、横のゆらぎ（板の幅に対して） */
  wobble: 0.012,
  /** 叩くたびに層が波打つ大きさ（板の厚みに対して）。のばすときは、のばす割合の平方根をかける */
  layerWave: { forge: 0.012, flatten: 0.006, fold: 0.006 },
  /** 板そのもののわずかな波打ち（層の厚みに対して） */
  waviness: 0.25,
  /** 重ねて叩いたあとの層の数の上限（細かすぎると絵で見分けられない） */
  maxLayers: 4096,
} as const;

/** 道具が受け取る数の範囲（はみ出したら、範囲におさめて知らせる） */
export const PATTERN_LIMITS = {
  count: [2, 64],
  metals: [1, 4],
  times: [1, 8],
  ratio: [1, 12],
  turns: [0.25, 12],
  depth: [0.02, 0.7],
  grind: [0.01, 0.7],
  size: [0.005, 0.25],
  across: [1, 40],
  pieces: [2, 12],
} as const satisfies Record<string, readonly [number, number]>;

/** 道具が受け取る操作の数の範囲 */
export const OP_RANGE = [1, 20] as const;
