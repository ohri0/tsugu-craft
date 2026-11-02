// 写真の読み取りと形の呼び名のための設定。職人の目安ではなく、読み取りの調整値。
// 本物の写真で試して直した値は docs/LOG.md に理由と一緒に残す。

export const DETECTION = {
  corners: {
    /** 輪郭を取り直す点の数 */
    samples: 180,
    /** 角の両側に伸ばす腕の長さ ÷ 周 */
    armRatio: 0.03,
    /** 画面に出す内角は、角から armRatio〜この割合の所の辺の向きで測る（角の丸みを飛ばす） */
    reportArmRatio: 0.08,
    /** これより小さい内角（度）を「尖った角」とみなす */
    maxInteriorDeg: 130,
    /** 角どうしの最小の間隔 ÷ 周 */
    minSeparationRatio: 0.08,
  },
  shape: {
    /** 長辺 ÷ 幅 がこれ未満なら丸 */
    roundRatio: 1.08,
    /** これ以上なら細長い */
    elongatedRatio: 1.6,
    /** 面積 ÷ 凸包の面積 がこれ未満ならいびつ（へこみがある） */
    solidityMin: 0.96,
  },
  vision: {
    /** 最初の粗い探しで使う画像の長い辺（px） */
    coarseMaxSide: 900,
    /** 背景の明るさのむらを曲面で近似するときの、外れ値を除く回数 */
    backgroundIterations: 4,
    /** 石とみなす最小の面積 ÷ 画像の面積 */
    minAreaRatio: 0.002,
    /** 弱いしきい値 ＝ 強いしきい値 × この値（淡い縁を拾うため） */
    weakThresholdFactor: 0.5,
    /** しきい値の下限（色の差、0〜441） */
    minThreshold: 12,
    /** 切り出すときの余白 ÷ 石の大きさ */
    cropMarginRatio: 0.15,
    /** 細かい輪郭のときのぼかしの半径（px） */
    refineBlurRadius: 1,
  },
} as const;
