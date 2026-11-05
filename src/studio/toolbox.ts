// 道具箱：一粒石の指輪を作る道具（手作り・鋳造・爪留め・覆輪留め・仕上げ）と、工程ごとに使う道具。画面に依存しない。
//
// 決まり：
// - 会社・店・商品の名前は書かない。道具はふつうの名前で書く。
// - 説明は公開の資料を自分の言葉で短くまとめたもの。出典は公的な機関・学校・博物館・論文・公開の技の解説を選び、店の頁は使わない。
// - 数字は書かない（寸法や目安の値は src/rules/ の設定と、職人の言葉から出す）。
// - この環境では資料の頁を直接開けなかったので、どれも検索の要約にもとづく。くわしくは research/tools/README.md。

export type ToolKind = "measure" | "cut" | "shape" | "join" | "set" | "finish" | "wax" | "safety";

export interface Source {
  title: string;
  url: string;
}

export interface Tool {
  id: string;
  name: string;
  reading: string;
  kind: ToolKind;
  /** 1 文：何に使うか */
  what: string;
  /** 使い方 2〜4 手、各 1 文 */
  how: string[];
  /** 気をつける所 1 文 */
  watch?: string;
  sources: Source[];
}

/** 道具の種類の、画面に出す言葉 */
export const KIND_LABEL: Record<ToolKind, string> = {
  measure: "測る",
  cut: "切る・削る",
  shape: "形を作る",
  join: "つなぐ",
  set: "石を留める",
  finish: "仕上げる",
  wax: "原型・鋳造",
  safety: "身を守る",
};

// ---- 出典（同じ頁を何度も使うので、ここにまとめる） ----

const S = {
  javadaTools: {
    title: "中央職業能力開発協会：技能五輪全国大会「貴金属装身具」職種 持参工具一覧（第 49 回）",
    url: "https://www.javada.or.jp/jigyou/gino/zenkoku/n_49/kadai/23/23_03_kougu.pdf",
  },
  javadaRules62: {
    title: "中央職業能力開発協会：技能五輪全国大会「貴金属装身具」職種 競技実施要領（第 62 回）",
    url: "https://www.javada.or.jp/jigyou/gino/zenkoku/n_62/kadai/23/23_01_jisshiyouryou2_20241022_yu8g9dfxc4.pdf",
  },
  javadaQa54: {
    title: "中央職業能力開発協会：技能五輪全国大会「貴金属装身具」職種 Q＆A（第 54 回）",
    url: "https://www.javada.or.jp/jigyou/gino/zenkoku/n_54/kadai/23/23_02qa_2016541004.pdf",
  },
  javadaTask58: {
    title: "中央職業能力開発協会：技能五輪全国大会「貴金属装身具」職種 競技課題（第 58 回）",
    url: "https://www.javada.or.jp/jigyou/gino/zenkoku/n_58/kadai/23/23_01kyougikadai_5820201106.pdf",
  },
  bunkaTankin: {
    title: "文化遺産オンライン：鍛金",
    url: "https://online.bunka.go.jp/heritages/detail/215349",
  },
  wazaInterview: {
    title: "厚生労働省 技能振興の頁：貴金属装身具製作の技能士の話",
    url: "https://waza.mhlw.go.jp/ginoushi-kirari/interview/index04.html",
  },
  giaRingSize: {
    title: "GIA：指輪のサイズの決め方",
    url: "https://4cs.gia.edu/en-us/blog/how-to-determine-ring-size-tips-and-ring-size-chart/",
  },
  giaQabFinger: {
    title: "GIA 品質の目安：指と指輪のサイズを正しく測る",
    url: "https://www.gia.edu/quality-assurance-benchmark/accurate-determination-finger-ring-size",
  },
  giaQabSizing: {
    title: "GIA 品質の目安：指輪のサイズ直し（バーナーで）",
    url: "https://www.gia.edu/quality-assurance-benchmark/sizing-up-platinum-alloy-ring-with-diamond-shank-using-torch",
  },
  giaQabSizingDown: {
    title: "GIA 品質の目安：指輪のサイズを小さくする（継ぎ目を整えて芯金で丸める）",
    url: "https://www.gia.edu/quality-assurance-benchmark/sizing-down-platinum-cobalt-rings-with-diamonds-in-the-shank-using-a-laser-welder",
  },
  giaTip5: {
    title: "GIA ベンチの豆知識 #5：細い鎖をロウ付けで直す",
    url: "https://www.gia.edu/bench-tip-repair-fine-chain-with-soldering-technique",
  },
  giaTip6: {
    title: "GIA ベンチの豆知識 #6：丸い覆輪を割り芯金で仕上げる",
    url: "https://www.gia.edu/bench-tip-use-split-mandrel-finishing-round-bezels",
  },
  giaTip7: {
    title: "GIA ベンチの豆知識 #7：丸いカットの石を覆輪で留める道具",
    url: "https://www.gia.edu/bench-tip-modified-tool-to-bezel-set-round-faceted-stones",
  },
  giaTip8: {
    title: "GIA ベンチの豆知識 #8：熱を伝えてロウ付けする",
    url: "https://www.gia.edu/bench-tip-how-to-use-the-conduction-soldering-technique",
  },
  giaTip13: {
    title: "GIA ベンチの豆知識 #13：すり板の手直し",
    url: "https://www.gia.edu/bench-tip-ergonomics-for-bench-pin-modifications",
  },
  giaTip14: {
    title: "GIA ベンチの豆知識 #14：フレキシブルシャフトとハンドピースの扱い",
    url: "https://www.gia.edu/bench-tip-how-to-handle-the-flexshaft-and-handpiece",
  },
  giaTip15: {
    title: "GIA ベンチの豆知識 #15：爪倒しを手直しして使いやすくする",
    url: "https://www.gia.edu/bench-tip-modify-prong-pushers-to-make-more-versatile",
  },
  giaTip17: {
    title: "GIA ベンチの豆知識 #17：石が落ちないための品質の目安",
    url: "https://www.gia.edu/bench-tip-avoid-stone-loss-with-quality-assurance-benchmarks",
  },
  giaTip18: {
    title: "GIA ベンチの豆知識 #18：木の指輪万力の手直し",
    url: "https://www.gia.edu/bench-tip-how-to-modify-wooden-ring-clamp",
  },
  giaTip19: {
    title: "GIA ベンチの豆知識 #19：尖った角を糸鋸で速く正しく切る",
    url: "https://www.gia.edu/bench-tip-quickly-accurately-saw-around-sharp-corner",
  },
  giaDurability: {
    title: "GIA 論文：宝石の丈夫さ ― デザインから陳列まで（用語集つき）",
    url: "https://www.gia.edu/gems-gemology/summer-1987-gemstone-durability-martin",
  },
  giaField: {
    title: "GIA 資料：持ち運べる道具と、現場での宝石学",
    url: "https://www.gia.edu/dam/migrated-assets/docs/doc1/Portable-Instruments-and-Tips-on-Practical-Gemology-in-the-Field.pdf",
  },
  yjmTech: {
    title: "山梨県 山梨ジュエリーミュージアム：技術（貴金属加工）",
    url: "https://www.pref.yamanashi.jp/smartphone/yjm/jewelry/gijyutu.html",
  },
  yamanashiSchool: {
    title: "山梨県立宝石美術専門学校：施設の紹介",
    url: "https://www.pref.yamanashi.jp/houseki/jewelry/gakko/shisetsu.html",
  },
  yamanashiWax: {
    title: "山梨県 職人の情報誌 第 4 号：原型の職人",
    url: "https://www.pref.yamanashi.jp/documents/67233/cj4.pdf",
  },
  yamanashiWaxCarver: {
    title: "山梨県の宝飾職人の紹介：ワックスを削る原型の職人",
    url: "https://www.pref.yamanashi.jp/shokuninryugi/shokunin/story0012.html",
  },
  yamanashiMetal: {
    title: "山梨県の宝飾職人の紹介：貴金属加工の職人",
    url: "https://www.pref.yamanashi.jp/shokuninryugi/shokunin/story0008.html",
  },
  yamanashiTeacher: {
    title: "山梨県の宝飾職人の紹介：学校で教える元職人",
    url: "https://www.pref.yamanashi.jp/shokuninryugi/shokunin/story0019.html",
  },
  manitoba: {
    title: "カナダ マニトバ州 教育省：宝飾・金工の教育課程（9〜12 年生）",
    url: "https://www.edu.gov.mb.ca/k12/cur/teched/sytep/jewellery/full_doc.pdf",
  },
  waMuseum: {
    title: "西オーストラリア博物館 収蔵品：線引き板",
    url: "https://museum.wa.gov.au/online-collections/node/77700",
  },
  waDoh: {
    title: "米国ワシントン州 保健局：宝飾・金工の害と防ぎ方",
    url: "https://doh.wa.gov/community-and-environment/contaminants/art-hazards/jewelry-and-metalsmithing",
  },
  umassdSafety: {
    title: "米国の州立大学：宝飾・金工の工房の安全の手引き",
    url: "https://www.umassd.edu/cvpa/student/health--safety-manual/jewelry-metals/",
  },
  stcSafety: {
    title: "米国の公立カレッジ：宝飾・金工の工房の安全の決まり",
    url: "https://www.southtexascollege.edu/academics/visual-arts/safety/jewelry.html",
  },
  vccCourse: {
    title: "カナダの公立カレッジ：ロストワックスの彫りと鋳造の講座の内容",
    url: "https://www.vcc.ca/international/programs/courses/jewl-1118/",
  },
  castNotes: {
    title: "宝飾の技の公開資料：銀のロストワックス鋳造の覚え書き",
    url: "https://www.ganoksin.com/article/casting-notes-for-silver-lost-wax-casting/",
  },
  spruingForum: {
    title: "宝飾の技の公開資料（職人の掲示板）：湯道の付け方",
    url: "https://orchid.ganoksin.com/t/spruing/8009",
  },
  waxWeightForum: {
    title: "宝飾の技の公開資料（職人の掲示板）：鋳造に要る地金の量の出し方",
    url: "https://orchid.ganoksin.com/t/casting-calculating-the-amount-of-metal-needed/39061",
  },
  seatForum: {
    title: "宝飾の技の公開資料（職人の掲示板）：爪に座を彫る",
    url: "https://orchid.ganoksin.com/t/cutting-seats-in-prongs/21091",
  },
  prongArticle: {
    title: "宝飾の技の公開資料：丸いブリリアントカットの石を爪で留める",
    url: "https://www.ganoksin.com/article/prong-setting-round-brilliant-gemstones/",
  },
  polishLesson: {
    title: "宝飾の技の公開資料：みがきの基本",
    url: "https://ganoksin.com/lesson/basic-polishing-technique",
  },
  printWaxPaper: {
    title: "論文：インベストメント鋳造で、3D 印刷の型の材料・積層の高さが面の粗さに与える影響",
    url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9965826/",
  },
} satisfies Record<string, Source>;

// ---- 道具 ----

export const TOOLS: Tool[] = [
  // 測る
  {
    id: "ring-gauge",
    name: "リングゲージ",
    reading: "りんぐげーじ",
    kind: "measure",
    what: "指の太さ（号）を、輪をはめて測る。",
    how: [
      "号ちがいの金属の輪を、指に順にはめてみる。",
      "関節を通り、つけたときにちょうどよい輪の号を選ぶ。",
      "幅の広い指輪なら、幅の広い輪で測る。",
    ],
    watch: "指ごとに太さがちがうので、指輪をつける指で測る。",
    sources: [S.giaRingSize, S.giaQabFinger],
  },
  {
    id: "calipers",
    name: "ノギス",
    reading: "のぎす",
    kind: "measure",
    what: "石の大きさや、線・板の太さと厚みを mm で測る。",
    how: [
      "測る物を、あごの間に軽くはさむ。",
      "目盛り（または表示）を読み、mm で書き留める。",
      "石は、長い向き・短い向き・深さを別々に測る。",
    ],
    watch: "強くはさむと、柔らかい地金やワックスがへこむ。",
    sources: [S.javadaTools],
  },
  {
    id: "loupe",
    name: "ルーペ",
    reading: "るーぺ",
    kind: "measure",
    what: "爪と石のすき間、ロウの流れ、傷を拡大して見る。",
    how: [
      "ルーペを目に近づけて持つ。",
      "見る物のほうを近づけて、ピントを合わせる。",
      "石座は、上・横・下から順に見る。",
    ],
    watch: "縁がゆがんで見えにくいときは、収差を直したルーペを選ぶ。",
    sources: [S.giaField, S.javadaTools],
  },
  {
    id: "scale",
    name: "はかり",
    reading: "はかり",
    kind: "measure",
    what: "原型の重さを量り、鋳造に要る地金の量の見当をつける。",
    how: [
      "湯道を付けた原型の重さを量る。",
      "その重さに、地金の比重をかけて、地金の重さの見当にする。",
      "湯口に残る分を足して、鋳造所に伝える。",
    ],
    watch: "足す分の量は資料によってちがうので、鋳造所の値に合わせる。",
    sources: [S.waxWeightForum],
  },

  // 切る・削る
  {
    id: "bench-pin",
    name: "すり板",
    reading: "すりいた",
    kind: "cut",
    what: "作業台の前に付ける木の板で、地金を当てて切る・削るときの支えにする。",
    how: [
      "地金をすり板にのせ、指で押さえる。",
      "すり板の切りこみの上で糸鋸を動かす。",
      "ヤスリをかけるときは、地金をすり板に当てて支える。当てる所は切りこみだけでなく、平らな面や横の面のこともある（直角を出すときは横の面に当てる など。作者の話）。",
    ],
    watch: "使いやすいように、自分で溝や斜めの面を削って直してよい。",
    sources: [S.javadaTools, S.giaTip13],
  },
  {
    id: "saw",
    name: "糸鋸と刃",
    reading: "いとのこ と は",
    kind: "cut",
    what: "地金の線や板を、細い刃で切る。",
    how: [
      "刃の歯が持ち手の向きに下を向くように、弓に張る。",
      "地金をすり板で押さえ、刃をまっすぐ立てて上下に動かす。",
      "角を曲がるときは、その場で刃を動かしながら向きを変える。",
    ],
    watch: "刃をねじったり押しつけたりすると折れる。",
    sources: [S.javadaTools, S.giaTip19, S.yamanashiTeacher],
  },
  {
    id: "file",
    name: "ヤスリ（平・甲丸）",
    reading: "やすり（ひら・こうまる）",
    kind: "cut",
    what: "地金を削って、面や継ぎ目を整える。平は平らな面と外側、甲丸（片側が丸い）は指輪の内側に使う。",
    how: [
      "地金をすり板に当てて支える。",
      "押すときに削れるので、押す向きに力を入れ、戻すときは軽く。",
      "内側は甲丸の丸い面で、丸みに沿って削る。",
    ],
    watch: "ヤスリの目に別の地金が残っていると、地金にまざるので落としてから使う。",
    sources: [S.javadaTools, S.javadaTask58, S.yamanashiTeacher],
  },
  {
    id: "needle-file",
    name: "細工ヤスリ（組ヤスリ）",
    reading: "さいくやすり（くみやすり）",
    kind: "cut",
    what: "細い形のヤスリで、爪の先や石座のすき間など細かい所を削る。",
    how: [
      "削る所の形に合う断面（平・丸・三角など）を選ぶ。",
      "指で地金を押さえ、小さく動かして削る。",
    ],
    watch: "細いので、ねじると折れる。",
    sources: [S.javadaTools],
  },
  {
    id: "handpiece",
    name: "ハンドピース（リューター）",
    reading: "はんどぴーす（りゅーたー）",
    kind: "cut",
    what: "モーターで先の道具（バー・みがきの軸など）を回し、削る・穴をあける・みがく。",
    how: [
      "先の道具を、奥まで差して締める。",
      "足のペダルで回る速さを変える。",
      "地金を固定し、手首を台に当てて支えながら当てる。",
    ],
    watch: "シャフトをハンドピースにつなぐときは、ゆっくり回しながら溝に合わせる（合わないまま押しこむと、こわれたり急に動いたりする）。",
    sources: [S.giaTip14, S.yamanashiSchool, S.javadaRules62],
  },

  // 形を作る
  {
    id: "rolling-mill",
    name: "圧延ローラー",
    reading: "あつえんろーらー",
    kind: "shape",
    what: "向かい合うローラーの間に地金を通して、板や角線を薄く・細くのばす。",
    how: [
      "ローラーのすき間を、地金より少しせまくする。",
      "地金をまっすぐ差しこみ、ハンドルを回して通す。",
      "少しずつすき間をせばめて、くり返す。",
    ],
    watch: "地金は叩いたりのばしたりすると硬くなるので、途中で焼きなます。",
    sources: [S.manitoba, S.bunkaTankin],
  },
  {
    id: "draw-plate",
    name: "線引き板",
    reading: "せんひきいた",
    kind: "shape",
    what: "大きさの順に穴が並んだ鋼の板で、線を穴に通して引き、細くする。",
    how: [
      "線の先を細く削り、穴に通る形にする。",
      "今の太さより一つ小さい穴に通し、引っぱり出す。",
      "穴を一つずつ小さくして、ほしい太さまでくり返す。",
    ],
    watch: "硬くなった線は切れやすいので、途中で焼きなます。",
    sources: [S.waMuseum, S.manitoba, S.bunkaTankin],
  },
  {
    id: "pliers",
    name: "ヤットコ（平・丸）",
    reading: "やっとこ（ひら・まる）",
    kind: "shape",
    what: "地金をはさんで曲げる・押さえる。平は面で押さえ、丸は丸く曲げる。",
    how: [
      "曲げたい所のすぐそばをはさむ。",
      "丸く曲げるときは、丸ヤットコの軸に沿わせて少しずつ曲げる。",
      "継ぎ目の両端は、平ヤットコで押してすき間なく合わせる。",
    ],
    watch: "強くはさむと、地金にあとが付く。",
    sources: [S.javadaTools, S.wazaInterview],
  },
  {
    id: "mandrel",
    name: "芯金（指輪の芯金）",
    reading: "しんがね",
    kind: "shape",
    what: "先が細くなった鉄の棒で、指輪をはめて丸く整え、号を合わせる。",
    how: [
      "指輪を芯金にしっかり押しこむ。",
      "横から木槌で軽く叩き、指輪を回してくり返す。",
      "目盛りのある芯金なら、指輪の号を読む。",
    ],
    watch: "内側が真円でないと、号を正しく読めない。",
    sources: [S.javadaTools, S.giaQabSizingDown, S.giaRingSize],
  },
  {
    id: "mallet",
    name: "木槌（樹脂の槌）",
    reading: "きづち",
    kind: "shape",
    what: "地金に傷を付けずに叩いて、形を整える。",
    how: [
      "芯金や台の上に地金をのせる。",
      "面を平らに当てて、軽く叩く。",
      "地金を少しずつ回して、むらなく叩く。",
    ],
    watch: "石が入っている所は叩かない。",
    sources: [S.javadaTools, S.giaQabSizingDown],
  },
  {
    id: "bezel-mandrel",
    name: "覆輪の芯金（割り芯金）",
    reading: "ふくりん の しんがね（わりしんがね）",
    kind: "shape",
    what: "覆輪の帯をはめて、内側を真円に整える。",
    how: [
      "ロウ付けした覆輪を芯金にはめる。",
      "木槌で軽く叩いて、丸く整える。",
      "石を当てて、すき間がないか確かめる。",
    ],
    sources: [S.giaTip6, S.giaTip7],
  },

  // つなぐ
  {
    id: "soldering-block",
    name: "ロウ付けの台",
    reading: "ろうづけ の だい",
    kind: "join",
    what: "熱に強い台で、ロウ付けのときに地金をのせて支える。",
    how: [
      "台の上に地金を置き、継ぎ目が合うように並べる。",
      "動きやすい部品は、台に差したピンなどで支える。",
    ],
    watch: "まわりに燃える物を置かない。",
    sources: [S.javadaTools],
  },
  {
    id: "torch",
    name: "バーナー（トーチ）",
    reading: "ばーなー",
    kind: "join",
    what: "炎で地金を熱して、ロウを溶かして流す。焼きなましにも使う。",
    how: [
      "まず地金全体を温め、それから継ぎ目のまわりを熱する。",
      "ロウそのものではなく、地金を熱してロウを呼ぶ。",
      "ロウが流れたら、すぐ炎を離す。",
    ],
    watch: "地金全体が熱くなるので、石が留まっている物は、先に石を外す。",
    sources: [S.javadaTools, S.yamanashiSchool, S.yamanashiTeacher, S.giaTip8],
  },
  {
    id: "solder",
    name: "ロウ（銀ロウ・金ロウ）",
    reading: "ろう",
    kind: "join",
    what: "地金より低い温度で溶ける合金で、継ぎ目を流れてつなぐ。",
    how: [
      "地金に合うロウを選ぶ。",
      "小さく切り、フラックスを塗った継ぎ目にのせる。",
      "熱して流し、継ぎ目にすき間なく入ったか見る。",
    ],
    watch: "多すぎても少なすぎてもいけない。鉛やアンチモンをふくまないロウを使う。",
    sources: [S.giaTip8, S.giaQabSizing, S.javadaQa54, S.waDoh],
  },
  {
    id: "flux",
    name: "フラックス",
    reading: "ふらっくす",
    kind: "join",
    what: "継ぎ目に塗る薬で、熱で地金が黒くなるのを防ぎ、ロウを流れやすくする。",
    how: [
      "ロウ付けの前に、継ぎ目に塗る。",
      "ロウ付けのあと、酸洗いで落とす。",
    ],
    watch: "ふっ素をふくまないものを選び、出る煙は換気で外に出す。",
    sources: [S.giaTip8, S.giaDurability, S.javadaTools, S.waDoh],
  },
  {
    id: "tweezers",
    name: "耐熱ピンセット",
    reading: "たいねつ ぴんせっと",
    kind: "join",
    what: "熱い地金や小さなロウを、つまんで動かす。",
    how: [
      "ロウ付けのときに、小さな部品やロウの位置を直す。",
      "熱いうちの地金をつまんで、酸洗いの液に移す。",
    ],
    sources: [S.javadaTools, S.yamanashiMetal],
  },
  {
    id: "pickle",
    name: "酸洗い（ピックル）",
    reading: "さんあらい",
    kind: "join",
    what: "ロウ付けで付いた黒い膜とフラックスを、うすい酸の液で落とす。",
    how: [
      "ロウ付けのあと、地金を少し冷ます。",
      "温めた酸の液に入れて、黒い膜を落とす。",
      "取り出して水でよく洗う。",
    ],
    watch: "酸は水に入れる（逆にしない）。換気をし、使い終えた液は流しに捨てない。",
    sources: [S.javadaRules62, S.giaTip5, S.stcSafety, S.waDoh, S.manitoba],
  },

  // 石を留める
  {
    id: "ring-clamp",
    name: "指輪万力（リングクランプ）",
    reading: "ゆびわまんりき",
    kind: "set",
    what: "指輪をはさんで固定し、座を彫る・石を留める・仕上げるときに持つ。",
    how: [
      "くさびを抜いて口を開き、指輪をはさむ。",
      "くさびを差しもどして締める。",
      "すり板に当てて支えながら作業する。",
    ],
    watch: "爪を押すときにすべりやすいので、すり板にしっかり当てる。",
    sources: [S.giaTip18],
  },
  {
    id: "bearing-bur",
    name: "座彫りのバー（ベアリングバー）",
    reading: "ざぼりのばー",
    kind: "set",
    what: "ハンドピースに付けて、爪の内側に石の縁がのる座を彫る。",
    how: [
      "石の大きさに合うバーを選ぶ。",
      "すべての爪に、同じ高さで座を彫る。",
      "石をのせて、座と石の間にすき間がないか確かめる。",
    ],
    watch: "彫りすぎると爪が弱くなる。バーが爪のまわりを回りこまないように、ゆっくり回す。",
    sources: [S.giaTip17, S.prongArticle, S.seatForum],
  },
  {
    id: "hart-bur",
    name: "ハートバー",
    reading: "はーとばー",
    kind: "set",
    what: "爪の内側に、石の縁が入る切りこみ（下に入りこんだ溝）を彫るバー。",
    how: [
      "石の縁の高さに合わせて、爪にバーを当てる。",
      "少しずつ切りこみ、石の縁が入る深さで止める。",
    ],
    watch: "まっすぐな壁のバーとどちらを使うかは、職人によってちがう。",
    sources: [S.seatForum],
  },
  {
    id: "ball-bur",
    name: "丸バー",
    reading: "まるばー",
    kind: "set",
    what: "先が玉の形のバーで、覆輪の内側に石の下の部分が入る逃げを彫る。",
    how: [
      "覆輪の内側の、石の下が当たる所を少しずつ彫る。",
      "石を入れて、まっすぐ座るか確かめる。",
    ],
    sources: [S.giaTip7, S.giaTip6],
  },
  {
    id: "prong-pusher",
    name: "爪倒し（プッシャー）",
    reading: "つめたおし",
    kind: "set",
    what: "爪を石の上に押し倒して、石を留める。",
    how: [
      "向かい合う爪を、順に少しずつ倒す。",
      "爪の先が石に沿って、すき間なく当たるまで押す。",
      "すべりやすいときは、先に溝を付けた爪倒しを使う。",
    ],
    watch: "強く押してすべると、石や手を傷つける。指輪万力を台に当てて支える。",
    sources: [S.giaTip15, S.giaTip18],
  },
  {
    id: "setting-punch",
    name: "覆輪のタガネ（セッティングパンチ）",
    reading: "ふくりん の たがね",
    kind: "set",
    what: "小さな金づちで後ろを叩き、覆輪の縁を石の上に倒す。",
    how: [
      "向かい合う所から順に、少しずつ倒す。",
      "まわり全体が石に当たるまで、くり返す。",
    ],
    watch: "強く叩くと石が割れることがある。",
    sources: [S.giaDurability],
  },
  {
    id: "burnisher",
    name: "ヘラ（バニシャー）",
    reading: "へら",
    kind: "set",
    what: "よくみがいた鋼のヘラで、覆輪の縁を石に押しつけ、面をなめらかにする。",
    how: [
      "覆輪の縁の斜めの面に当てて、押しながら石の上に倒す。",
      "指輪を回しながら、まわり全体を押す。",
      "最後に縁をこすって、光らせる。",
    ],
    sources: [S.giaTip7, S.giaDurability, S.javadaTools],
  },
  {
    id: "graver",
    name: "彫りタガネ（グレーバー）",
    reading: "ほりたがね",
    kind: "set",
    what: "鋭い刃で、地金を削って形を整える。地金を起こして石を押さえる粒を作ることもある。",
    how: [
      "刃をよく研いでおく。",
      "地金を固定し、刃を浅い角度で当てて押し進める。",
    ],
    sources: [S.giaDurability, S.javadaTools],
  },

  // 原型・鋳造
  {
    id: "wax",
    name: "原型用のワックス",
    reading: "わっくす",
    kind: "wax",
    what: "鋳造の原型を作る、削れて溶ける材料。",
    how: [
      "ワックスの塊を、ヤスリで削って形にする。",
      "ナイフなどでも削れる。",
      "できた原型は、湯道を付けて鋳造に出す。",
    ],
    watch: "ワックスの形がそのまま地金になるので、傷も写る。",
    sources: [S.yjmTech, S.yamanashiWax, S.yamanashiWaxCarver],
  },
  {
    id: "wax-pen",
    name: "ワックスペン",
    reading: "わっくすぺん",
    kind: "wax",
    what: "温度を整えたペン先でワックスを溶かし、盛ったり、つないだり、直したりする。",
    how: [
      "ペン先の温度を、ワックスに合わせる。",
      "ワックスを溶かして盛り、冷えて固まったら削って整える。",
    ],
    sources: [S.yamanashiWax],
  },
  {
    id: "wax-printer",
    name: "ワックス用の 3D プリンター",
    reading: "わっくすよう の すりーでぃー ぷりんたー",
    kind: "wax",
    what: "3D データから、鋳造できる原型を印刷する。",
    how: [
      "設計を 3D データ（STL）に出す。",
      "鋳造できる材料で印刷する。",
      "支えを外し、面を整えて、湯道を付ける。",
    ],
    watch: "材料によっては、焼くときにふくらんで型が割れたり灰が残ったりするので、鋳造所と合わせる。",
    sources: [S.yamanashiSchool, S.printWaxPaper],
  },
  {
    id: "sprue",
    name: "湯道（スプルー）",
    reading: "ゆみち",
    kind: "wax",
    what: "原型に付けるワックスの棒で、溶けた地金が流れこむ道になる。",
    how: [
      "原型のいちばん厚い所に付ける。",
      "温めた道具でワックスを少し溶かして、すき間なく付ける。",
      "湯道のもう一方の端を、ゴム台に立てる。",
    ],
    watch: "湯道の太さや付ける所が合わないと、地金が回らなかったり、巣（小さな穴）ができたりする。",
    sources: [S.spruingForum, S.castNotes, S.vccCourse],
  },
  {
    id: "sprue-base",
    name: "ゴム台（湯口台）",
    reading: "ごむだい",
    kind: "wax",
    what: "湯道を立てるゴムの台で、鋳型の筒をはめて石こうのような材料を流しこむ。",
    how: [
      "湯道を付けた原型を、ゴム台の中心に立てる。",
      "鋳型の筒をはめる（ここからは鋳造所の仕事）。",
    ],
    sources: [S.castNotes],
  },

  // 仕上げる
  {
    id: "buff",
    name: "研磨（バフと研磨剤）",
    reading: "けんま",
    kind: "finish",
    what: "布の輪（バフ）に研磨剤を付けて回し、地金を光らせる。",
    how: [
      "粗い研磨剤のバフで、傷とヤスリのあとを消す。",
      "洗ってから、細かい研磨剤のやわらかいバフで光らせる。",
      "地金は回る軸より下で、手前に向けて当てる。",
    ],
    watch: "バフに引っかかると地金を飛ばされる。研磨剤ごとにバフを分け、粉を吸わないようにマスクをする。",
    sources: [S.polishLesson],
  },

  // 身を守る
  {
    id: "safety-glasses",
    name: "保護めがね",
    reading: "ほごめがね",
    kind: "safety",
    what: "削りくず・折れた刃・熱・薬から目を守る。",
    how: [
      "糸鋸、ハンドピース、研磨、ロウ付けのときにかける。",
      "髪はまとめ、たれる物は外してから作業する。",
    ],
    sources: [S.javadaTools, S.stcSafety, S.umassdSafety, S.waDoh],
  },
];

// ---- 工程の題 → 使う道具（順に） ----
// 題は src/studio/howto.ts の工程の題と同じ。手作りと鋳造で同じ題（座を彫って、石を留める／仕上げ）は 1 つにまとめる。

export const STEP_TOOLS: Record<string, string[]> = {
  // 手作り
  材料を用意する: ["ring-gauge", "calipers", "rolling-mill", "draw-plate", "bench-pin", "saw", "file"],
  石座を組む: [
    "calipers",
    "pliers",
    "saw",
    "file",
    "needle-file",
    "soldering-block",
    "flux",
    "solder",
    "tweezers",
    "torch",
    "pickle",
    "safety-glasses",
  ],
  覆輪を作る: [
    "calipers",
    "rolling-mill",
    "saw",
    "pliers",
    "file",
    "soldering-block",
    "flux",
    "solder",
    "torch",
    "pickle",
    "bezel-mandrel",
    "mallet",
    "safety-glasses",
  ],
  石座を腕に付ける: ["file", "soldering-block", "flux", "solder", "tweezers", "torch", "pickle", "safety-glasses"],
  "座を彫って、石を留める": [
    "ring-clamp",
    "loupe",
    "handpiece",
    "bearing-bur",
    "hart-bur",
    "prong-pusher",
    "needle-file",
    "graver",
    "safety-glasses",
  ],
  "石を入れて、覆輪を倒す": ["ring-clamp", "loupe", "handpiece", "ball-bur", "setting-punch", "burnisher", "safety-glasses"],
  仕上げ: ["file", "needle-file", "handpiece", "buff", "loupe", "safety-glasses"],
  // 鋳造
  原型を作る: ["calipers", "wax", "file", "wax-pen", "wax-printer"],
  湯道を付ける: ["sprue", "wax-pen", "sprue-base", "scale"],
  // 地金のみの指輪で、上から下へ太さを変えるとき
  形を整える: ["ring-clamp", "file", "needle-file", "calipers", "loupe"],
  "湯道を切り、整える": ["saw", "file", "mandrel", "mallet", "handpiece", "loupe", "safety-glasses"],
  "埋没して、焼く": ["scale", "sprue-base", "safety-glasses"],
  鋳込む: ["scale", "torch", "tweezers", "safety-glasses"],
  "型から出し、洗う": ["pickle", "tweezers", "safety-glasses"],
  "焼きなまして、のばす": ["torch", "soldering-block", "pickle", "rolling-mill", "draw-plate", "calipers", "safety-glasses"],
  "切って、丸める": ["bench-pin", "saw", "file", "pliers", "mallet", "mandrel"],
  ロウ付けで閉じる: ["soldering-block", "flux", "solder", "tweezers", "torch", "pickle", "safety-glasses"],
  芯金で丸く整える: ["mandrel", "mallet", "ring-gauge", "file"],
};

const BY_ID = new Map(TOOLS.map((t) => [t.id, t]));

/** 工程の題から、使う道具を順に返す。知らない題なら空。 */
export function toolsForStep(title: string): Tool[] {
  return (STEP_TOOLS[title] ?? []).flatMap((id) => {
    const t = BY_ID.get(id);
    return t ? [t] : [];
  });
}

/** id から道具を返す */
export function toolById(id: string): Tool | undefined {
  return BY_ID.get(id);
}
