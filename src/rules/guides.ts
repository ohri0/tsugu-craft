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
    /**
     * 最低の太さ：公開情報の 4 つの点 [石の大きさ mm, 爪の太さ mm] を、まっすぐな線でつなぐ（点の間は比例で）。
     * 最初の点より小さい石は最初の値、最後の点より大きい石は最後の 2 点の傾きのまま伸ばす。
     * 出どころ（docs/RESEARCH-rules.md）：メレの爪留め 0.45 mm 以上（メーカーの CAD 基準）、
     * 約 0.25 ct（約 4 mm）で約 0.6 mm（職人のフォーラム）、1 ct（約 6.4 mm）で 1.0〜1.3 mm の下の端（Skyjems）、
     * 2 ct（約 8 mm）で 1.2 mm 以上（職人のフォーラム）。点をつなぐ線は、作者の求めで作った仮の目安。
     */
    minByStoneSize: [
      [2.5, 0.45],
      [4.0, 0.6],
      [6.4, 1.0],
      [8.0, 1.2],
    ] as const,
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
    /** 形の処理の既定：角を V 字の爪で包むか。画面（継ぐのスタジオ）では作者の判断で false（丸い爪を角に立てる普通の爪留め）を渡す */
    vAtCornersDefault: true,
    /**
     * 座の深さ：縁の高さで、爪の太さのこの割合だけ内側を彫って石の縁を受ける。
     * 出どころ（docs/RESEARCH-setting.md）：40〜50 %（T1・T10）、30〜50 %（T5）。半分を超えると爪が弱い。
     * 形では、縁の高さの爪の中心を、石の縁から 爪の太さ ×（0.5 − この値）外に置く。
     */
    seatCutRatio: 0.45,
    /** 仮の目安：V 字の爪の 2 本の足の中心は、角から縁に沿って 爪の太さ × この値 の所 */
    vLegSpreadRatio: 1.0,
  },
  gallery: {
    /** 仮の目安：爪をつなぐ輪（石座の輪）の線の太さ ＝ 標準の爪の太さ × この値 */
    wireRatio: 0.7,
    /**
     * 仮の目安：石座（爪と輪をまとめた 1 つの部品）を腕にのせるとき、腕の上に溝（切り込み）を入れて、
     * 下の輪をこの割合（輪の線の太さに対する）だけ沈めてロウ付けする。爪が 1 本ずつ腕へささるのではなく、
     * 石座の下の面が腕の上に当たる（作者の言葉：2026-11-03、石座は石座、腕は腕で作って合わせる）
     */
    seatInShankRatio: 0.35,
    /**
     * 仮の目安：石座を腕にロウ付けした所の、すみの丸み（ロウが流れて入る丸み）の大きさ ＝ 下の輪の線の太さ × この値。
     * 出典の数字はない（ロウは「見えないくらい少し」と言われる。docs/RESEARCH-rules2.md）。作者が見て直す
     */
    solderFilletRatio: 0.3,
  },
  /**
   * 石座と腕の付け方（2026-11-04、職人 石川の言葉）。on ＝ 腕の上にのせる（今までの形）、between ＝ 腕の間に挟む。
   * 「腕の間に挟む」は、職人が「わりと基本的」と言った作り方：石座と腕は別に作り、腕のいちばん上を切って、
   * 腕の両端の間に石座の下の輪をはさんでロウ付けする（上にドン付けではない）。
   * 上の輪は丸線で、石の座をリューターでザグる。下の輪は丸線ではなく、板を丸めた輪（断面が四角い短い筒）。
   * 形の向きと作り方は職人の言葉から。2 回目（作者が写真を見て）：石はもっと下がる（下の輪にくっつくぐらい）。上から見て上の輪が見えない
   * （石の縁の真下、下側の斜めの面に当たる。石座は縁より少し小さい）。爪は反らずに、まっすぐ斜めに伸びて、先だけクイと曲がる。
   * 調べ（docs/RESEARCH-setting.md 1-9、T42〜T47）から形の決まりにした。出典のない数字は **仮の目安**（作者が見て直す）。
   * - prongAngleDeg：爪の傾き（水平から）。GIA の目安 70〜80°（T1）の中から 78°（仮：作者の言う「少しすぼまる」に寄せた）。
   *   爪は縁の座から下へ、この角度のまっすぐな線。下の輪の外も同じ傾きの円すい（輪と爪が線で合う）。
   * - upperWirePavilionRatio：上の輪の丸線の太さ ＝ 縁の下から石の一番下までの 1/3 以上（CAD の手引きの三分の一の決まり、T43）。標準の輪の太さより細くはしない。
   * - pavilionClearanceMm：上の輪・下の輪と石の下側の面とのすき間（ダイヤ 0.2〜0.3 mm、T43）。上の輪はザグって石に当てるので、下の輪の内の上の縁に使う。
   * - seatDepthRatio：上の輪をリューターでザグる深さ ＝ 線の太さ × この値（仮。技能五輪の課題は、爪の座を丸ヤスリで約 0.05 mm 合わせる程度、T42）。
   * - windowMm：上の輪の下と、下の輪の上の間（明り取り）の最低（仮。技能五輪の 1 ct の課題は 2.3 mm だが、職人は「下の輪にくっつくぐらい低く」）。
   *   高さの選び方（低め・標準・高め）は、この間を −0.5・0・＋0.5 mm 変える（0.1 mm より狭くしない）。
   * - collarHeightRatio：下の輪（板を丸めた輪）の高さ ＝ 腕の厚み × この値（指の真上で）。腕の端は指の丸みで下がるので、腕の端はまるごと輪の横に当たる。
   * - collarWallMm：下の輪の板の厚み。collarWallMinMm：板の厚みの最低（覆輪の壁の最低 0.45 mm を借りた。薄いと輪がゆがむ・ロウ付けで溶けやすい）。
   * - minEndContactRatio：腕の端の高さのうち、下の輪の横に当たっている割合の最低。これより少ないと、ロウ付けの面が足りない。
   */
  join: {
    between: {
      prongAngleDeg: 78,
      upperWirePavilionRatio: 1 / 3,
      pavilionClearanceMm: 0.25,
      seatDepthRatio: 0.2,
      windowMm: 0.3,
      collarHeightRatio: 0.75,
      collarWallMm: 0.5,
      collarWallMinMm: 0.45,
      minEndContactRatio: 0.75,
    },
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
    /**
     * 角に 1 本ずつ：1 のとき、角が 3 つの石（三角など）を角ごとに 1 本の丸い爪で留めると、その本数を「標準の本数」として数える
     * （3 本でも 4 本の標準と同じ 1.0×）。公開情報にはないので 0。職人の決まりで 1 になる（目安帳の hold.cornerSet。
     * 石川の判断「三角の石を 0.8 mm の爪 3 本で、角に 1 本ずつ留めて大丈夫」2026-11-03）。
     */
    cornerSet: 0,
    /** 「角に 1 本」とみなす：内角がこの値（度）より小さいものを角とし、爪がその角から縁の周のこの割合以内 */
    cornerSetMatch: { maxCornerAngleDeg: 100, tTolerance: 0.05 },
  },
  bezel: {
    /** 内側の線 ＝ 石の縁 ＋ この値（mm）。腕のザグり（石の下側と腕の間）にも同じすき間を借りる（geometry/notch.ts） */
    clearanceMm: 0.04,
    wallMm: 0.5,
    /** 壁の厚みの最低：0.45 mm 以上（docs/RESEARCH-setting.md の T22。2026-11-04 に原文 p.5 で確かめた）。5 mm より小さい石は 0.5 mm で足りる（T15） */
    wallMinMm: 0.45,
    /** 上の端が上側にかかる割合と上限（mm） */
    crownCoverRatio: 0.3,
    crownCoverMaxMm: 0.35,
  },
  height: {
    /** 石の一番下と指のすき間の最低（mm） */
    minFingerGapMm: 0.3,
    options: { low: 0, standard: 0.5, high: 1.0 } as const,
  },
  /**
   * 石のない指輪（甲丸・平打ち）の目安。出典は docs/RESEARCH-rules.md の「3. 腕（シャンク）の厚みと幅」（案 8・案 9）：
   * 腕のいちばん厚い所は 1.2 mm 以上（仕上げで最大 0.2 mm 削れる・1 mm より薄いと持ちが悪い）、幅は 1.7 mm 以上（細い腕は曲がって丸くなくなる）。
   */
  band: {
    minThicknessMm: 1.2,
    minWidthMm: 1.7,
    /**
     * 仮の目安（出典なし。作者の言葉「とがった先や薄いヒレだけが危ない。腕ぜんぶを薄いとは言わない」2026-11-04 から作った。作者が見て直す）。
     * 断面の局所の薄さ：直径 minLocalMm の円が入れない所（局所の厚み）と、とがった先の金属の側の角度。
     * - minLocalMm：局所の厚みの下限。覆輪の壁の最低（0.45 mm、docs/RESEARCH-setting.md の T22）を借りた。
     *   外側の線のうち、形の中に入るこの円のどれにも、半径（0.225 mm）より深く届かない所を知らせる（ふつうの 90° の角は届く）。
     * - minTipAngleDeg：とがった先の角度の下限（度）。これより鋭い先は、欠けたり曲がったりしやすい。
     */
    spike: { minLocalMm: 0.45, minTipAngleDeg: 60 },
  },
  /**
   * 石を並べる指輪（三石・横一列）の、となりの石との間。**すべて仮の目安**（出典の数字はまだない。作者が見て直す。2026-11-04）。
   * - stoneGapMinMm：石の縁どうしの間の最低。石どうしが当たると、縁が欠けやすい（当てないことは公開の作り方の説明にもあるが、数字は仮）。
   * - metalGapMinMm：となりの石座が離れているとき、その間の最低。これより狭いすき間は、磨きの道具が入らず、汚れもたまり、
   *   鋳造では型のうすい壁が欠けやすい（理由は作者の言葉とよくある説明から。数字は仮）。石座どうしが重なる（つながる）ときは数えない（ロウ付けで一つにする）。
   * - layoutGapMm：三石・横一列を並べるとき、石座の外の線（縁の高さ）の間にとる既定の間。metalGapMinMm より少し広く。
   * - rowCount：横一列の石の数（いちばん少ない・既定・いちばん多い）。
   * - sideRatio：三石の両脇の石の大きさ（真ん中の石に対する割合の既定）。
   * - trio：三石の並べ方（2026-11-04、作者の頼み：3 つの石が 1 つの形に見えるよう寄せ、石座はつなげてロウ付けする）。
   *   stoneGapMm：真ん中と脇の石の縁どうしの間。prongGapMm：となりの石座の爪どうしの間（爪が当たらない）。
   *   sideHeight：脇の石座の高さ（低め ＝ 脇の石の縁が真ん中より下に来て、縁が ゆるい弧を描く）。
   *   joinWireRatio：となりの石座をつなぐ短い線の太さ（石座の輪の線の太さに対する割合）。
   *   pearProngCount：脇の石をペアにしたときの爪の本数（先に 1 本 ＋ 丸い側に 2 本。丸い側の真ん中に爪を立てないので、真ん中の石に寄せられる）。
   */
  multi: {
    stoneGapMinMm: 0.15,
    metalGapMinMm: 0.3,
    layoutGapMm: 0.4,
    rowCount: [2, 5, 9] as const,
    sideRatio: 0.65,
    trio: { stoneGapMm: 0.3, prongGapMm: 0.15, sideHeight: "low" as "low" | "standard" | "high", joinWireRatio: 1, pearProngCount: 5 },
  },
  /**
   * テンション（ばねの力で石を挟む留め方）。職人（石川）の値（2026-11-05）。資料に mm の数字はない（docs/RESEARCH-tension.md）。
   * - cornerPitMm：片方の腕の端に掘るくぼみへ、石の角の先を入れる深さ。職人の言葉「角はくぼみに 1 mm くらい」（はじめ 0.8 mm、同じ日に 1 mm へ決め直した）。
   * - edgeGrooveMm：もう片方の腕の端の、まっすぐな溝へ、石の辺を入れる深さ。職人の言葉「辺は溝に 0.5 mm」。
   * - wireMm：腕の丸線の太さ。職人が本物の指輪に使う φ4 mm の丸線。
   * - girdleAtWire：石の縁の高さ（腕の太さのどこか。0.5 は真ん中）。職人：止める位置はもっと上（2026-11-05）。0.6 は仮（上げるほど、くぼみの両わきの地金が薄くなる）。
   * - culetGapMm：石の先と指のすき間。職人：石の先が指に当たると痛い。0.5 mm は仮。
   * - weakGrooveMm：これより浅い溝は抜けやすい、という注意。職人の言葉「0.3 mm くらいでは絶対抜ける」。
   * - minWireMm：これより細い線は注意（作れないとは言わない）。資料は職人の掲示板の声（TS14）。
   * 開きは図面では石が入る寸法のまま（石の高さ − くぼみ − 溝）。プリロードは図面に入れない（職人が地金を硬くしながら詰める）。
   * 以下は **仮**（形を作るための決まり。職人の値でも資料の値でもない。作者が見て直す）：
   * - clearanceMm：石と溝のすき間。覆輪の内側のすき間（bezel.clearanceMm）を借りた。
   * - cornerMaxDeg：内角がこれより鋭いものを「角」と数える（hold.cornerSetMatch と同じ値）。
   * - liftEnds・liftBlendDeg：縁を腕の太さの中ほどに置くと石の先が指に当たるとき、腕の両はしを指の丸みからなめらかに持ち上げるか、と、持ち上げる所の長さ（度）。
   * - thinLipMm：彫り口の上下や両わきに残る地金がこれより薄いと、注意を出す（覆輪の壁の最低を借りた）。
   * spring：参考の計算（地金が戻れる範囲で開ける量）に使う地金の値。合否には使わない。provisional の値は画面にも「仮」と出す。
   * 出どころは .claude/skills/jeweler-guides/SKILL.md の「テンション」の節。
   * - young：ヤング率。K18 は地金会社の表の 18 ct 3N・4N の値。K18 の値の出典は、これ 1 つ。
   * - hvToProofMpa：硬さ HV から耐力（MPa）を出す目安の倍率。貴金属の硬い状態の表（Pt 2.96・Au 2.89・PtIr10 2.93・PtRh10 3.28）から丸めた。測った耐力ではない。
   * - K18 の加工硬化：地金会社の表の 3N の加工 75 % の硬さ HV 250 × hvToProofMpa。別の資料の引張りの強さ 810〜880 MPa より低いので、矛盾はない。
   * - K18 の焼きなまし：検索の要約に 1 件あるだけの 180 MPa（状態の書き方なし。原文で確かめられない）。
   * - Pt900：Pt/Ir 900/100 の値。日本に多い Pd 入りの値は見つからない。
   * - シルバーの加工硬化：地金会社の表の加工 75 % の硬さ HV 155 × hvToProofMpa。
   */
  tension: {
    cornerPitMm: 1.0,
    edgeGrooveMm: 0.5,
    wireMm: 4,
    girdleAtWire: 0.6,
    culetGapMm: 0.5,
    weakGrooveMm: 0.3,
    minWireMm: 3,
    clearanceMm: 0.04,
    cornerMaxDeg: 100,
    liftEnds: true,
    liftBlendDeg: 70,
    thinLipMm: 0.45,
    spring: {
      hvToProofMpa: 3,
      metals: {
        k18y: {
          name: "K18",
          young: { gpa: 94, provisional: false, basis: "地金会社の表の 18 ct 3N・4N の値" },
          hardened: { proofMpa: 750, provisional: true, basis: "硬さ HV 250 からの換算の目安。耐力を測った値ではない" },
          annealed: { proofMpa: 180, provisional: true, basis: "資料の要約に 1 件だけ。原文で確かめられない" },
        },
        pt900: {
          name: "Pt900",
          young: { gpa: 220, provisional: true, basis: "Pt/Ir 900/100 の値。資料により 160〜220 GPa。Pd 入りの値は見つからない" },
          hardened: { proofMpa: 630, provisional: true, basis: "Pt/Ir 900/100 の値。Pd 入りの値は見つからない" },
          annealed: { proofMpa: 220, provisional: true, basis: "Pt/Ir 900/100 の値。Pd 入りの値は見つからない" },
        },
        sv925: {
          name: "SV925",
          young: { gpa: 80, provisional: false, basis: "地金会社の表の Ag925 の値" },
          hardened: { proofMpa: 465, provisional: true, basis: "硬さ HV 155 からの換算の目安。耐力を測った値ではない" },
          annealed: { proofMpa: 124, provisional: false, basis: "材料の解説の頁の値" },
        },
      },
    },
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
  const pts = p.minByStoneSize;
  if (sizeMm <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (sizeMm <= x1) return y0 + ((y1 - y0) * (sizeMm - x0)) / (x1 - x0);
  }
  // 最後の点より大きい石：最後の 2 点の傾きのまま
  const [x0, y0] = pts[pts.length - 2];
  const [x1, y1] = pts[pts.length - 1];
  return y1 + ((y1 - y0) * (sizeMm - x1)) / (x1 - x0);
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
