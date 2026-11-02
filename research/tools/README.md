# 道具の調べ（tools）— 一粒石の指輪を作る道具

アプリの「作る。」（手作り・鋳造の作り方）で、工程ごとに使う道具を見せるために、公開の資料から道具の名前・使い道・使い方を集めた。データは `src/studio/toolbox.ts`、テストは `tests/toolbox.test.ts`。

- 調べた日：2026-11-02。ウェブ検索だけ。
- この環境では、資料の頁を直接開けなかった（gia.edu、javada.or.jp、mhlw.go.jp、pref.yamanashi.jp、ganoksin.com、doh.wa.gov、edu.gov.mb.ca などは、接続先として許されていない）。**どの説明も検索の要約にもとづく**。原文を開いて確かめた文は一つも無い。
- 文は写さず、自分の言葉で短くまとめた。
- 会社・店・商品の名前は書かない。道具はふつうの名前で書いた。出典の題も、店や工房の名前を出さない書き方にした（URL には団体の名前が出るものがある）。
- 店の頁（道具を売る頁）は、内容が合っていても出典にしなかった。

## 決めたこと

- **道具の説明に数字を書かない。** 寸法や目安の値は、`src/rules/` の設定と職人の言葉から出す（CLAUDE.md「コードに数字を散らさず」）。下の「見つけた数字」は、使うなら目安帳と Skill に入れる候補。
- 使い方の手順は、資料の要約と、宝飾のふつうの作業の順を合わせて書いた。作者（宝飾の彫金職人）が見て直す。
- 出典は、公的な機関・学校・博物館・論文・公開の技の解説だけ。テストで、出典の所を決めた一覧に限り、店らしい言葉（shop、store、mall など）が無いことを確かめる。
- 依頼にあった「店らしい言葉」のうち、会社の名前そのもの（大きな通販の名前）は、名前を書かない決まりに合わせてテストに入れなかった。代わりに、出典の所を決めた一覧（許す所だけ）で確かめる。

## 出典（使えたもの）

### 公的な機関・団体（日本）

| 題 | URL | 何に使ったか |
| --- | --- | --- |
| 中央職業能力開発協会：技能五輪「貴金属装身具」持参工具一覧（第 49 回） | https://www.javada.or.jp/jigyou/gino/zenkoku/n_49/kadai/23/23_03_kougu.pdf | 宝飾の職人が持つ道具の名前（やすり・やっとこ・糸のこと刃・芯金・木づちと金づち・すり板・ノギス・ルーペ・ピンセット・ろう付台・フラックスとほう砂・へら・たがね・保護めがね など） |
| 同 競技実施要領（第 62 回） | https://www.javada.or.jp/jigyou/gino/zenkoku/n_62/kadai/23/23_01_jisshiyouryou2_20241022_yu8g9dfxc4.pdf | 会場の設備：温める硫酸のポット（酸洗い）、ハンド・ドリル・モーター |
| 同 Q＆A（第 54 回） | https://www.javada.or.jp/jigyou/gino/zenkoku/n_54/kadai/23/23_02qa_2016541004.pdf | ロウの量の多すぎ・少なすぎが減点になる |
| 同 競技課題（第 58 回） | https://www.javada.or.jp/jigyou/gino/zenkoku/n_58/kadai/23/23_01kyougikadai_5820201106.pdf | ヤスリの目・ヤットコに別の地金が残っていたら落とす |
| 厚生労働省 技能振興の頁：貴金属装身具製作の技能士の話 | https://waza.mhlw.go.jp/ginoushi-kirari/interview/index04.html | やっとこは主に地金を曲げるのに使う |
| 山梨県 山梨ジュエリーミュージアム：技術 | https://www.pref.yamanashi.jp/smartphone/yjm/jewelry/gijyutu.html | 貴金属加工は地金加工・原型・鋳造・仕上げ。ワックスはロストワックスの原型の材料 |
| 山梨県立宝石美術専門学校：施設の紹介 | https://www.pref.yamanashi.jp/houseki/jewelry/gakko/shisetsu.html | トーチ、ハンドモーター、ワックスを出す 3D プリンター、鋳造機 |
| 山梨県 職人の情報誌 第 4 号（原型の職人） | https://www.pref.yamanashi.jp/documents/67233/cj4.pdf | ふつうはワックスの塊をヤスリで削る。ワックスペンは温度を整えたペン先でワックスを溶かして盛る |
| 山梨県の宝飾職人の紹介（ワックスの原型） | https://www.pref.yamanashi.jp/shokuninryugi/shokunin/story0012.html | ワックスはナイフなどで削れる |
| 山梨県の宝飾職人の紹介（貴金属加工） | https://www.pref.yamanashi.jp/shokuninryugi/shokunin/story0008.html | ピンセットを両手で使い、バーナーでロウ付けする |
| 山梨県の宝飾職人の紹介（学校で教える元職人） | https://www.pref.yamanashi.jp/shokuninryugi/shokunin/story0019.html | 金工の基本としてヤスリと糸鋸から教える。バーナーのロウ付けは地金全体が熱くなるので、石留めした物は石を外す |
| 文化遺産オンライン：鍛金 | https://online.bunka.go.jp/heritages/detail/215349 | 叩くと硬くなるので焼きなましとくり返す（`research/process/tsuchime.md` と同じ出典） |

### 宝石学の教育機関（GIA）

| 題 | URL | 何に使ったか |
| --- | --- | --- |
| 指輪のサイズの決め方 | https://4cs.gia.edu/en-us/blog/how-to-determine-ring-size-tips-and-ring-size-chart/ | リングゲージ（号ちがいの輪）、目盛りの芯金で号を読む、幅の広い指輪 |
| 品質の目安：指と指輪のサイズ | https://www.gia.edu/quality-assurance-benchmark/accurate-determination-finger-ring-size | 内側が真円でないと正しく測れない |
| 品質の目安：サイズ直し（バーナー） | https://www.gia.edu/quality-assurance-benchmark/sizing-up-platinum-alloy-ring-with-diamond-shank-using-torch | 継ぎ目にロウが余らない・見えない・穴が無い |
| 品質の目安：サイズを小さくする | https://www.gia.edu/quality-assurance-benchmark/sizing-down-platinum-cobalt-rings-with-diamonds-in-the-shank-using-a-laser-welder | 芯金に押しこみ、石の無い所を軽く叩き、回してくり返す |
| ベンチの豆知識 #5 | https://www.gia.edu/bench-tip-repair-fine-chain-with-soldering-technique | ロウ付けのあと冷まして酸洗い |
| ベンチの豆知識 #6 | https://www.gia.edu/bench-tip-use-split-mandrel-finishing-round-bezels | 丸い覆輪を割り芯金で真円に整える |
| ベンチの豆知識 #7 | https://www.gia.edu/bench-tip-modified-tool-to-bezel-set-round-faceted-stones | 覆輪の内側を丸バーで彫る、ハンドピースを回しながらヘラで縁を倒す |
| ベンチの豆知識 #8 | https://www.gia.edu/bench-tip-how-to-use-the-conduction-soldering-technique | フラックスは継ぎ目に塗る、ロウではなく継ぎ目の下から熱する |
| ベンチの豆知識 #13 | https://www.gia.edu/bench-tip-ergonomics-for-bench-pin-modifications | すり板に溝や斜めの面を削って使いやすくする |
| ベンチの豆知識 #14 | https://www.gia.edu/bench-tip-how-to-handle-the-flexshaft-and-handpiece | シャフトをゆっくり回しながら溝に合わせてつなぐ |
| ベンチの豆知識 #15 | https://www.gia.edu/bench-tip-modify-prong-pushers-to-make-more-versatile | 爪倒しの先に溝を付けてすべりにくくする |
| ベンチの豆知識 #17 | https://www.gia.edu/bench-tip-avoid-stone-loss-with-quality-assurance-benchmarks | 座と石の間にすき間を残さない |
| ベンチの豆知識 #18 | https://www.gia.edu/bench-tip-how-to-modify-wooden-ring-clamp | 木の指輪万力は爪を押すときにすべりやすい |
| ベンチの豆知識 #19 | https://www.gia.edu/bench-tip-quickly-accurately-saw-around-sharp-corner | 糸鋸で尖った角を切る |
| 論文：宝石の丈夫さ（1987、用語集） | https://www.gia.edu/gems-gemology/summer-1987-gemstone-durability-martin | タガネ（グレーバー）、ヘラ（バニシャー）、覆輪を倒すタガネ、フラックスの働き |
| 資料：持ち運べる道具と現場の宝石学 | https://www.gia.edu/dam/migrated-assets/docs/doc1/Portable-Instruments-and-Tips-on-Practical-Gemology-in-the-Field.pdf | 収差を直したルーペは縁がゆがみにくい |

### 海外の公的な機関・学校・博物館・論文

| 題 | URL | 何に使ったか |
| --- | --- | --- |
| カナダ マニトバ州 教育省：宝飾・金工の教育課程 | https://www.edu.gov.mb.ca/k12/cur/teched/sytep/jewellery/full_doc.pdf | 圧延ローラーで板を作る、圧延ローラーと線引き板で線を作る、酸洗いのポットの安全な使い方 |
| 西オーストラリア博物館 収蔵品：線引き板 | https://museum.wa.gov.au/online-collections/node/77700 | 穴の並んだ板で線を引く |
| 米国ワシントン州 保健局：宝飾・金工の害 | https://doh.wa.gov/community-and-environment/contaminants/art-hazards/jewelry-and-metalsmithing | 鉛・アンチモンの無いロウ、ふっ素の無いフラックス、ロウ付けの煙は換気、使った酸の液は流しに捨てない、保護めがね |
| 米国の公立カレッジ：工房の安全の決まり | https://www.southtexascollege.edu/academics/visual-arts/safety/jewelry.html | 酸は水に入れる（逆にしない）、換気、保護めがね |
| 米国の州立大学：工房の安全の手引き | https://www.umassd.edu/cvpa/student/health--safety-manual/jewelry-metals/ | 髪をまとめ、たれる物を外す |
| カナダの公立カレッジ：ロストワックスの講座 | https://www.vcc.ca/international/programs/courses/jewl-1118/ | ワックスの彫り・湯道・埋没・鋳造・仕上げの順 |
| 論文：3D 印刷の型の材料と面の粗さ | https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9965826/ | 鋳造用ワックスで印刷した型の鋳物の面がいちばんよい。印刷の材料によっては焼くときに型が割れる・灰が残る |

### 公開の技の解説（記事・職人の掲示板）

店ではなく、宝飾の技を集めて公開している所。掲示板は一人ひとりの職人の書きこみなので、**弱い出典**として扱う。

| 題 | URL | 何に使ったか |
| --- | --- | --- |
| 銀のロストワックス鋳造の覚え書き | https://www.ganoksin.com/article/casting-notes-for-silver-lost-wax-casting/ | ゴム台に湯道を立て、鋳型の筒をはめる |
| 掲示板：湯道の付け方 | https://orchid.ganoksin.com/t/spruing/8009 | 湯道は原型のいちばん厚い所に付ける |
| 掲示板：地金の量の出し方 | https://orchid.ganoksin.com/t/casting-calculating-the-amount-of-metal-needed/39061 | 湯道つきの原型の重さ × 地金の比重 ＋ 湯口の分 |
| 掲示板：爪に座を彫る | https://orchid.ganoksin.com/t/cutting-seats-in-prongs/21091 | まっすぐな壁のバーと、下に入りこむ溝を彫るハートバー |
| 丸いブリリアントカットを爪で留める | https://www.ganoksin.com/article/prong-setting-round-brilliant-gemstones/ | 座彫りのバーを遅く回す、バーが爪を回りこまないようにする |
| みがきの基本 | https://ganoksin.com/lesson/basic-polishing-technique | 粗い研磨剤 → 細かい研磨剤、バフを混ぜない、軸より下で当てる、マスク |

## 見つけた数字（道具箱には書いていない）

使うなら目安帳（`src/rules/`）と Skill に、出典と「目安・最後は職人が決める」を添えて入れる。どれも検索の要約で、原文は未確認。

- 爪の座：爪の太さの 40〜50% を彫る、座と石にすき間が無い（GIA ベンチの豆知識 #17）。爪に座を 40〜50% 彫る、という職人の掲示板の書きこみもある。
- 覆輪：座の深さは石の深さの 50% 以上、覆輪の高さ 4.0 mm 以上、縁は冠（石の上の部分）の 10% 以上にかぶせる（GIA ベンチの豆知識 #7。一つの例の値）。
- 酸洗い：技能五輪の会場では 10% の希硫酸を温めるポットを使う（第 62 回 競技実施要領）。
- ルーペ：10 倍、収差を直したもの（GIA の資料）。
- 原型の重さ → 地金：比重は地金でちがい、湯口の分は 5 g・10%・25〜50% と資料ごとにちがう（職人の掲示板）。**食いちがうので使わない。**
- 指輪の号と内周の表：日本の号の公的な表は、店でない出典では見つからなかった。**使わない。**

## 確かめられなかったこと

- **彫刻台（石留め台・彫金台、玉の形の万力）**：店でない出典が見つからなかったので、道具箱に入れなかった。指輪は指輪万力で持つ形にした。
- **ヤニ台**：技能五輪の一覧にあるが「裏取り」用で、一粒石の指輪の工程では使い道を確かめられなかったので入れなかった（`research/process/kebori.md` に東京都の資料あり）。
- **リングゲージの号の決まり（規格の番号や内周の表）**：見つからず。
- **糸鋸の刃の張り方、ヤスリの押す向き、指輪万力のくさびの使い方**：資料の要約には出てこなかった。宝飾のふつうのやり方として書いた。職人が確かめる。
- **ハートバー**：職人の掲示板の書きこみだけ。どちらのバーを使うかは職人によってちがう、と道具箱にも書いた。
- **「ハンドピース（リューター）」の呼び名**：資料では「ハンド・ドリル・モーター」「ハンドモーター」「フレキシブルシャフトとハンドピース」と呼び方がちがう。

## 次にすること

- 接続先が許されれば、技能五輪の持参工具一覧と GIA の頁を原文で開き、名前と使い方を一つずつ確かめる。
- 作者（職人）に、道具の手順と「気をつける所」を見てもらい、職人の言葉に直す。
