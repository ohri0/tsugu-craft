// 「どんな模様になるか」（どの技でも：src/rebuild/pattern-sim.ts）の計算に使う値と色。ここ 1 か所にまとめる。
// どれも形の見込み（仮）。出典のある測った値ではない。絵を描くための目安で、金属の本当の流れや熱は計算しない。
// 木目金の試し（src/rebuild/mokume-values.ts）とは別。赤銅と銅の色だけは、同じ絵の色を使う。
import { MOKUME_METALS } from "./mokume-values";

/**
 * 重ねる材料。名前は画面に出す言葉。色は絵の色（仮）：raw＝磨いたまま、etch＝酸で地を出したとき、patina＝煮色のように色を出したとき。
 * 金属らしく見えるように、木目金の試しと同じ考えで選んだ（2026-11-07 見直し）：赤銅は煮色で紫がかった黒、銅は赤茶、銀は白、四分一は灰、
 * 鋼は、酸で炭素の多い方が青みの黒・少ない方が明るい灰。磨いたままの金属どうしは、色の差が小さい。
 */
export const PATTERN_METALS = {
  shakudo: { name: "赤銅", raw: MOKUME_METALS.shakudo.raw, etch: "#4a3a33", patina: MOKUME_METALS.shakudo.niiro },
  copper: { name: "銅", raw: MOKUME_METALS.copper.raw, etch: "#b8714f", patina: MOKUME_METALS.copper.niiro },
  shibuichi: { name: "四分一（銀と銅の合金）", raw: "#b9ab9b", etch: "#8f8578", patina: "#7d807e" },
  silver: { name: "銀", raw: "#e2e1dc", etch: "#ecebe6", patina: "#dcd9d0" },
  gold: { name: "金", raw: "#d9b45c", etch: "#dcb862", patina: "#d2a94c" },
  brass: { name: "真鍮", raw: "#cdb064", etch: "#b99a50", patina: "#8a6b3c" },
  nickel: { name: "ニッケル", raw: "#c9c9c4", etch: "#e3e4e2", patina: "#b9b9b3" },
  steel_dark: { name: "黒くなる鋼（炭素の多い鋼）", raw: "#8f9398", etch: "#24282e", patina: "#33302e" },
  steel_light: { name: "白く残る鋼（炭素の少ない鋼）", raw: "#a6aaaf", etch: "#c2c6cb", patina: "#8d8a86" },
  iron: { name: "鉄", raw: "#85878a", etch: "#3e4044", patina: "#4d3b30" },
  dark: { name: "暗い色の材料（名前が分からない）", raw: "#55524f", etch: "#33302f", patina: "#2a2624" },
  light: { name: "明るい色の材料（名前が分からない）", raw: "#cfccc4", etch: "#dedbd3", patina: "#cfc6b4" },
  red: { name: "赤い色の材料（名前が分からない）", raw: "#b0503a", etch: "#9c4532", patina: "#8a3626" },
  // 七宝のガラス（1 枚の板の飾りで使う。色を出す手順では変わらない）
  enamel_blue: { name: "七宝の青", raw: "#1f4f8a", etch: "#1f4f8a", patina: "#1f4f8a" },
  enamel_green: { name: "七宝の緑", raw: "#2f7a55", etch: "#2f7a55", patina: "#2f7a55" },
  enamel_red: { name: "七宝の赤", raw: "#a8322b", etch: "#a8322b", patina: "#a8322b" },
  enamel_white: { name: "七宝の白", raw: "#e9e6dc", etch: "#e9e6dc", patina: "#e9e6dc" },
  enamel_yellow: { name: "七宝の黄", raw: "#d9a933", etch: "#d9a933", patina: "#d9a933" },
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
  /** のばすとき・平らに叩くときの、横のゆらぎ（板の幅に対して）。平らに叩くだけなら小さく（並べた四角のさかいが、まっすぐに残るように） */
  wobble: { forge: 0.012, flatten: 0.003 },
  /** 叩くたびに層が波打つ大きさ（板の厚みに対して）。のばすときは、のばす割合の平方根をかける。streak＝長さの向きにのばすとき（下の streak の筋）。streakEdge＝その波打ちが消える、表と裏からの近さ */
  layerWave: { forge: 0.03, streak: 0.14, streakEdge: 0.02, flatten: 0.006, fold: 0.012 },
  /**
   * 長さの向きにのばすときの層の波打ち：のばした向きに長い筋の数と、細かさ（板の幅の中の波の数。x＝幅の向き、y＝長さの向き）。
   * 前は丸い波で、帯の間がまるいまだらになった。のばした向きに長く、大きく（layerWave.streak）すると、細い線が流れる（2026-11-07 夜）
   */
  streak: { n: 8, fx: [1.5, 6], fy: [0.3, 1.2] },
  /** 板そのもののわずかな波打ち（層の厚みに対して） */
  waviness: 0.25,
  /** 重ねて叩いたあとの層の数の上限（細かすぎると絵で見分けられない） */
  maxLayers: 4096,
  /** ねじる前に、重ねた板を四角い棒にのばす長さ（棒の幅に対して）。板のままの長さでねじると、ねじれが詰まりすぎる */
  twistBar: 2,
  /** ねじった棒を叩きもどすとき、回った四角を上下から押しもどす見方の割合（0＝円のようになめらかに回るだけ、1＝押しもどすだけ） */
  twistCorner: 0.5,
  /** ねじった棒を叩くと、出っぱった角が表の薄い皮に押しこまれる強さ（1＝そのまま。大きいほど、浅く削っても棒の真ん中に近い層が出る） */
  twistSkin: 3,
  /** 押しもどす見方の折れ目をならす幅（棒の幅の半分を 1 として） */
  twistSmooth: 0.1,
  /** 手であけた穴・刻んだ溝のばらつき（決まった間の穴でも、手の仕事なので少しずれる）。位置は間かくに対して、大きさ・深さ・楕円は割合で */
  handJitter: { pos: 0.1, size: 0.14, depth: 0.1, ellipse: 0.12, lineWander: 0.12 },
} as const;

/** 絵の光と手ざわり（どれも絵のための値。画面とファイルで同じ） */
export const PATTERN_LOOK = {
  /** 地のざらつき（明るさの割合） */
  grain: 0.03,
  /** 1 枚ずつの板の、わずかな色のちがい（明るさの割合） */
  layerTone: 0.035,
  /** 左上からの光：左上を明るく、右下を暗く（明るさの割合） */
  light: 0.07,
  shadow: 0.12,
  /** 磨いた面のやわらかな照り（明るさの割合） */
  sheen: 0.07,
  /** 酸で地を出したときの、わずかな凹凸の陰（明るい層が少し高い） */
  relief: 0.22,
  /** 画素より細かい層をならす幅の上限（層の数） */
  maxSpan: 64,
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
  /** 並べる・散らす物の、板全体（品物 1 つ）の数（count。2026-11-08） */
  items: [1, 600],
  /** 層の厚さの割合（thickness。いちばん薄い層と厚い層の差は、この中で。2026-11-08） */
  thickness: [0.1, 10],
  /** ねじった棒を並べてつなぐ本数（twist の across。2026-11-08） */
  bars: [1, 6],
} as const satisfies Record<string, readonly [number, number]>;

/** 道具が受け取る操作の数の範囲 */
export const OP_RANGE = [1, 20] as const;

/** 1 枚の板の飾り（src/rebuild/pattern-relief.ts）の形の値。どれも絵のための仮の値で、出典はない */
export const RELIEF_VALUES = {
  /** 板の厚み（板の幅に対して）。凹凸の陰の強さが、これで決まる */
  thickness: 0.03,
  /** 手で彫る線のゆらぎ（線の間かくに対して） */
  hand: 0.08,
  /** 道具の size（線の半分の幅）にかける数。小さな数でも線が見えるように */
  lineScale: 1,
  /** 片切彫り：斜めの面の幅と、立てた壁の幅（線の幅に対して）。壁が細いほど、ふちが鋭い */
  bevelFace: 1.7,
  bevelWall: 0.08,
  /** 散らした草の株が穴にかかるとき、置きなおす回数 */
  grassTries: 6,
  /** 蹴彫りの一打ちの長さ（線の幅に対して） */
  keriLength: 3,
  /** ふちにそった枠の線：いちばん外の線の、ふちからの近さと、線の間かく（板の幅に対して） */
  borderInset: 0.045,
  borderGap: 0.03,
  /** 魚々子：across にかける数（輪は小さく、たくさん並ぶ）・ずれ・溝の深さ */
  nanakoScale: 1,
  nanakoJitter: 0.04,
  nanakoDepth: 0.12,
  /** 魚々子がよける、前に彫った線の深さ（厚みに対して。これより深く彫った所には打たない） */
  nanakoSkip: 0.04,
  /** 魚々子・石目の数が 0 で来たとき、輪・点の大きさから数を決める：幅の中の数＝これ ÷ 半径（点の間が、点の大きさほどあく） */
  dotsFromSize: 0.25,
  /** 打つ点の大きさ（size にかける数） */
  punchScale: 1,
  /** 石目：across にかける数・点の深さ */
  ishimeScale: 2.2,
  ishimeDepth: 0.1,
  /** 槌目：跡の大きさにかける数・深さにかける数 */
  hammerScale: 1,
  hammerDepth: 0.35,
  /** 唐草（scroll）：列の高さを 1 として、つるの波の長さ・高さ、巻いた先の大きさと巻く数、葉の長さと開き（ラジアン） */
  scroll: { period: 1.25, amp: 0.1, curl: 0.2, turns: 1.4, leaf: 0.26, leafAngle: 0.8, leafWidth: 2.6 },
  /** 小さな渦を並べる道すじ（coils）：渦の半径（並べる間かくに対して） */
  coil: 0.42,
  /** 粒を線にそって詰めて、より線のように描くときの、粒の間（粒の半径に対して。2 で、となりの粒と触れる） */
  ropePitch: 1.3,
  /** より線の粒の半径の上限（となりの線との間に対して） */
  ropeGap: 0.3,
  /** 透かしを開けない、ふちの幅（板の幅に対して） */
  pierceRim: 0.07,
  /** 地を全部抜く透かし（ground）で残す、ふちの枠の幅（板の幅に対して） */
  groundFrame: 0.03,
  /** 透かしのふちに落ちる影の長さ（板の幅に対して） */
  shadow: 0.006,
  /** 打ち出しの高さにかける数（厚みに対して） */
  reliefHeight: 3,
  /** 象嵌の深さ（厚みに対して） */
  inlayDepth: 0.3,
  /** 粒の大きさにかける数・粒の高さにかける数（板の幅を厚みに直す） */
  grainScale: 1,
  grainHeight: 1 / 0.03,
  /** 七宝：区切りの線の太さ（板の幅に対して）・ガラスの深さ（厚みに対して） */
  wire: 0.006,
  enamelDepth: 0.35,
  /** 打ち出しのふちにそう線（outline）：高さの傾きを取る間（板の幅に対して）と、ふちと見なさない平らさ（高さを打ち出しの高さで割った値の、板の幅あたりの傾きがこれより小さい所） */
  outlineStep: 0.002,
  outlineFlat: 1.5,
  /** ふちにそう線を引かない、板のふちの幅（打ち出しは、ふち 0.08 の内で平らにもどる） */
  outlineInset: 0.05,
} as const;
