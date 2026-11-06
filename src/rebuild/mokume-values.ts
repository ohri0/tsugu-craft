// 「模様の試し」（木目金を、手順のとおりに作ったらどんな模様になるか）の計算に使う値。ここ 1 か所にまとめる。
// 出典のある値は、research/mokume/answer.md の番号（A7 など）と URL を書く。出典のない値は kari: true（画面に「仮」と出す）。
// どれも、絵を描くための目安。金属の本当の流れや熱は計算していない。

export interface MokumeValue {
  /** 画面に出す名前 */
  label: string;
  value: number;
  /** 画面に出す単位や言い方（「割」など）。なければ数だけ */
  unit?: string;
  /** 出典（answer.md の番号と URL）。kari のときは、なぜこの値にしたか */
  source: string;
  /** 出典のない値 */
  kari?: boolean;
}

export const MOKUME_VALUES = {
  layers: {
    label: "重ねる板の枚数",
    value: 16,
    unit: "枚",
    source: "資料に枚数は無い。写真の鐔で、1 つの目に見える輪の数（4〜6）に近くなるように選んだ。",
    kari: true,
  },
  thin: {
    label: "叩いてのばして、薄くする割合",
    value: 0.5,
    unit: "（元の厚みに対して）",
    source: "A7。今の作り手の目安「全体で約 50% 薄くする」https://blademag.com/knifemaking/knifemaking-101-how-to-make-mokume",
  },
  carveDepth: {
    label: "彫る深さ（いちばん深い所）",
    value: 1 / 3,
    unit: "（板の厚みに対して）",
    source: "A8。「彫る深さは地金の厚さの 1/3 までが目安」https://blademag.com/?p=42548",
  },
  cycles: {
    label: "彫る・平らにする、をくり返す回数",
    value: 2,
    unit: "回",
    source: "A9 は「何度もくり返すと模様が細かくなる」とだけ書く。回数は無いので、いちばん少ない「くり返し」の 2 回にした。",
    kari: true,
  },
  pits1: {
    label: "1 回目に彫る所の数",
    value: 110,
    unit: "か所",
    source: "資料に無い。写真の鐔の目の数に近くなるように選んだ。",
    kari: true,
  },
  pitSize1: {
    label: "1 回目に彫るくぼみの大きさ（半径）",
    value: 0.05,
    unit: "（板の幅に対して）",
    source: "資料に無い。写真の鐔の目の大きさ（径の 1/10 ほど）に近づけた。",
    kari: true,
  },
  pits2: {
    label: "2 回目に彫る所の数",
    value: 90,
    unit: "か所",
    source: "資料に無い。1 回目より小さく、多く彫るとした。",
    kari: true,
  },
  pitSize2: {
    label: "2 回目に彫るくぼみの大きさ（半径）",
    value: 0.034,
    unit: "（板の幅に対して）",
    source: "資料に無い。",
    kari: true,
  },
  punches: {
    label: "裏から打ち出す所の数（Claude の手順だけ）",
    value: 24,
    unit: "か所",
    source: "Claude の手順「裏から打ち出して平らにする」に数は無い。",
    kari: true,
  },
  punchSize: {
    label: "裏から打ち出す所の大きさ（半径）",
    value: 0.06,
    unit: "（板の幅に対して）",
    source: "資料に無い。",
    kari: true,
  },
  stretch: {
    label: "目が一つの向きにのびる割合",
    value: 1.3,
    unit: "倍",
    source: "資料に無い。叩いてのばすと目が縦長になる（写真の鐔）のを、絵で似せるため。",
    kari: true,
  },
  unbondedMax: {
    label: "つなぐ手順を一つもしないときの、つながらない所",
    value: 0.5,
    unit: "（層の境の面積に対して）",
    source: "資料に無い。つながりの手順（A2・A4・A5・A6）が欠けるほど、層の境につながらない所が増える、という考えだけを絵にした。",
    kari: true,
  },
  wPolish: { label: "つながりへの重み：面をみがく（A2）", value: 0.2, source: "資料に無い。", kari: true },
  wClamp: { label: "つながりへの重み：締めつけて固定する（A4）", value: 0.25, source: "資料に無い。", kari: true },
  wFuse: { label: "つながりへの重み：熱してつなぐ（A5）", value: 0.35, source: "資料に無い。", kari: true },
  wHotHammer: { label: "つながりへの重み：すぐ叩いて仕上げる（A6）", value: 0.2, source: "資料に無い。", kari: true },
  partial: {
    label: "「一部」の手順を、どれだけできたとみなすか",
    value: 0.5,
    unit: "（一致を 1、たどり着けずを 0 として）",
    source: "資料に無い。一致と、たどり着けずの間。",
    kari: true,
  },
  grind: {
    label: "最後に平らに削る深さ",
    value: 0.02,
    unit: "（板の厚みに対して）",
    source: "資料に無い。表をならす程度の、ごく薄い削り。",
    kari: true,
  },
  wobble: {
    label: "叩いたときの、層のゆらぎ",
    value: 0.03,
    unit: "（板の幅に対して）",
    source: "資料に無い。輪がまっすぐな円にならないように。",
    kari: true,
  },
} satisfies Record<string, MokumeValue>;

export type MokumeValueId = keyof typeof MOKUME_VALUES;

/** 値だけ */
export const mv = (id: MokumeValueId): number => MOKUME_VALUES[id].value;

/** 金属の色。色の出方（赤銅＝紫がかった黒、銅＝赤茶）は A11 の出典（https://kotobank.jp/word/赤銅 など）。色の数字は、写真に近づけた絵の色（仮） */
export const MOKUME_METALS = {
  shakudo: {
    name: "赤銅",
    plain: "しゃくどう＝銅に金を少し加えた合金",
    raw: "#8a6650",
    niiro: "#1f1b20",
  },
  copper: {
    name: "銅",
    plain: "どう",
    raw: "#cf8a64",
    niiro: "#ad472b",
  },
} as const;

/** 重ねる金属。メトロポリタン美術館の木目金の鐔（34992）の材料「金属の積層板、鉄、赤銅、銅」から（answer.md H3）。一番上を赤銅にする（写真の地が黒いので） */
export const MOKUME_STACK: readonly (keyof typeof MOKUME_METALS)[] = ["shakudo", "copper"];
