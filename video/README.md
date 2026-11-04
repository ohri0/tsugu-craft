# 動画を組む仕組み

## 最終案 2（2026-11-04 夕方〜。いまの作り方）

最終案 1 の仕組みのまま、見せ方と音を作り直したもの。設計は `PLAN-final2.md`、声の台本は `../docs/NARRATION-ad.md`。

- 台本：`final_build2.py`。`VARIANT=A`（ふつう）で `final2.json`、`VARIANT=B`（終わりの手前に未来の一行）で `final2B.json` を作る。
- 組む：`reel.py`。左に見出し（いつも同じ所で、1 行目を打つ）、右の窓に本物の画面、見せたい所に細い金の枠（ほかは少し暗く）。
  - 下に進み具合の線と、いまの段の名前を出す。
  - 「困りごと」の図（デザイン → CAD → 職人 → 作れない、と戻る）は reel.py が描く。
  - 絵巻は 3 段に折る。伝統の所は生成りの色に明朝。
  - ごく薄い粒（フィルムの感じ）を足す。
- 音楽：`bgm4.py`（鏨の音で刻む・金床のダン・ピアノ・都節の琴と太鼓）。効果音は `sfx.py` の tink・kan。
- 撮る：`capture/story.cjs` の fix2・stones・make2・section2・ask2・learn2・waza2・rebuild2（ほかは最終案 1 と同じ章）。アプリが変わったら、`npx vite build --outDir video/work/dist-cap --emptyOutDir` で組み直してから撮る。撮るたびに、新しい空の localStorage で始まる。
- 仮の声：`SSL_CERT_FILE=$(video/work/.venv/bin/python -m certifi) video/work/.venv/bin/python -I video/tts_kokoro.py video/final2B.json k2_ video/work/voice jm_kumo`（B 案は A 案の行を全部含む）。
- 組む：`video/work/.venv/bin/python -I video/final.py --plan 2 --variant A`（B 案は `--variant B`）。次のファイルができる。
  - `video/work/vc/継ぐ_デモ_最終案2_A.mp4`（音楽と効果音だけ）
  - `_A_仮声.mp4`（仮の声入り）
  - それぞれの `_スマホ.mp4`（1280 px・30 MB 以下）
  - 1 本 約 8 分。音だけ混ぜ直すときは `--no-video`。
  - 画質は `CRF`（ふつう 17）で変えられる。いまは 1 本 約 110 MB。
- 作者の声：`video/work/voice/n<番号>.wav`。作者の指輪：`video/work/footage/ring1.mov`・`ring2.mov`。
- 声の並べ方：場面の頭の拍から 0.15 秒あとに置く。前の声が長いときは、終わって 0.3 秒あけてから置く。
  - 仮の声（機械の声）だけは、次の声の頭に間に合わないとき、1.25 倍までの速さで読ませる。
  - 作者の録音は速さを変えない。

## 最終案 1（2026-11-04 昼）

デモ動画（2 分 56 秒）。映るのは、継ぐの本物の画面を本当に操作したもの（本物のボタン・本物の Claude）。それを 2 倍の細かさで 1 こまずつ撮り、あとから、見せたい所へなめらかに動くカメラ・拍に乗るつなぎ・大きな言葉・自作の音楽を付ける。場面の設計は `PLAN-final.md`、声の台本は `../docs/NARRATION-ad.md`。

| ファイル | すること |
| --- | --- |
| `PLAN-final.md` | 場面ごとの設計（時刻・画面・カメラ・音・大きな言葉・声） |
| `final_build.py` | 台本 `final.json` を作る。時刻はすべて「拍」（120 拍／分 → 1 拍 0.5 秒）。画面・言葉・音楽の場面・声の場所を 1 か所で決めるので、切り替えも言葉も音楽も拍に乗る |
| `capture/story.cjs` | 継ぐの本物の画面を操作して、2 倍（3200×1800）で 1 こまずつ撮る。章：build・word・fix・views・section・present・ask・workshops・make・learn・nanako・rebuild。マウスの位置・見せたい所の枠・区切りを `meta.json` に残す |
| `capture/vt.cjs` | ページの中の時計を、こちらで 1 こま（1/30 秒）ずつ進める。組み上がり・赤い点滅・回転・知らせ・スクロールが、撮るのが遅くても 30 こま／秒でなめらかに映る。待つ所（Claude の返事）は時計だけ早送り |
| `capture/serve.cjs` | 撮るための継ぐ（組んだ物）を出し、`/api` だけ開発用のサーバー（本物の Claude）へ渡す。開発用のサーバーは、ほかの作業で src が変わるとページを読み直してしまうため |
| `capture/tojpg.py` | 撮った PNG を JPEG に（組むときに速く読めるように） |
| `reel.py` | 1 こまずつ組む：カメラ（寄る・引く・傾いて浮いた画面・速いときのぶれ）、つなぎ（切る・重ねる・寄って抜ける・横に流す・白く光る）、大きな言葉（1 語ずつ拍に）、数字の札、Claude の札、出どころ。押した所・打った所・つなぎの効果音の合図も書き出す。いくつも同時に組む |
| `bgm3.py` | 音楽（自作）。覚えやすい 2 小節の旋律、ダン・ダン・ダン、上がる音、落ちる所の一瞬の無音、太鼓に合わせて低音が息をする。式年遷宮の所は同じ旋律を都節の音で、琴のような音と太鼓に |
| `sfx.py` | 効果音（自作）：風・ドン・キー・カチッ・言葉の小さな音・キラッ（Claude）・作れます |
| `tts_kokoro.py` | 仮の声（機械の声）。作者の声が届くまで |
| `final.py` | 全部を順に回して、混ぜる |

使い方（作業用のフォルダは `video/work/`、リポジトリに入れない）：

1. 開発用のサーバー（本物の Claude）：`npx vite --port 5180 --strictPort`（`.env` にキー）。
2. 撮るための継ぐ：`npx vite build --outDir video/work/dist-cap --emptyOutDir` → `node video/capture/serve.cjs`（5201 番）。
3. 撮る：`node video/capture/story.cjs`（章の名前を並べると、その章だけ）。1 章 1〜4 分。GPU で 3D を描く（`--use-angle=metal`）。
4. 仮の声：`SSL_CERT_FILE=$(video/work/.venv/bin/python -m certifi) video/work/.venv/bin/python -I video/tts_kokoro.py video/final.json k_ video/work/voice jm_kumo`
5. 組む：`video/work/.venv/bin/python -I video/final.py`（最終案 1）→ `video/work/vc/継ぐ_デモ_最終案1.mp4`（音楽と効果音だけ）と `継ぐ_デモ_最終案1_仮声.mp4`（仮の声入り）。全部で 6〜7 分。画面を作り直さず音だけ混ぜ直すときは `--no-video`。
   試しに一部だけ組む：`ONLY="拍のはじめ,拍のおわり" video/work/.venv/bin/python -I video/reel.py video/final.json 出力.mp4`

作者の声：`video/work/voice/n<場面の番号>.wav`（例：`n3.wav`。台本は `docs/NARRATION-ad.md`）。置くと機械の声と入れ替わる。全部そろうと `_声.mp4` になる。
作者が撮る素材：`video/work/footage/ring1.mov`（作業台の手元）・`ring2.mov`（できあがった本物の指輪）。置くと差し替わる（ないときは「見せる」の指輪で埋める）。

venv に要るもの：pillow・numpy（組む・音楽・効果音）、kokoro-onnx・misaki・soundfile（仮の声）。字は Mac にもとからあるヒラギノ角ゴシック・ヒラギノ明朝を使う（字のファイルは配らない）。

## 前の作り方（scenes11.json・scenes-ad.json）

デモ動画（3 分）を、台本（`scenes11.json`）どおりに組む。画面は継ぐを本当に動かして撮ったもの、指輪は継ぐの 3D を 1 こまずつ撮ったもの。

| ファイル | すること |
| --- | --- |
| `scenes11.json` | 台本：場面ごとの長さ・画面（shots）・大きな言葉（key / key2）・Claude の働き（claude）・声の言葉（say）・作者が撮る素材の名前（video） |
| `edit.cjs` | 台本から動画を組む。素材（footage）があればそれを、なければ録った画面か「撮る素材」の板を使い、字幕と声を重ねる |
| `ov3.html` | 字幕・大きな言葉を重ねる見た目（黒の上に小さく） |
| `tts.py` | 確かめ用の機械の声（本番は作者の声） |
| `cine/cine.cjs` | 黒の上の指輪を 1 こまずつ撮る（`form`：線 → 面 → 金、`morph`：爪 1.66 → 0.80 mm、`metal`：地金を替える） |
| `cine/sizes.cjs` | 石 3・5・8・12 mm で、公開情報だけ／工房 A の決まりの爪を撮る |
| `cine/rec-html.cjs`・`cine/html/` | 問い・決まり・全部に・現場・学校・受け継ぎ方・万が一・締めの場面（文字と図の動き） |
| `capture/` | 継ぐの画面を動いたまま録る（1920×1080）。`hero*.cjs` は太い爪と細い爪を並べる場面 |

使い方（場所は `paths.cjs` の 1 か所にまとめた。別の所にしたいときは `TSUGU_VIDEO_WORK`、継ぐを動かす所を変えるときは `TSUGU_BASE`）：

0. 最初の 1 回：`npm install`・`npx playwright install chromium`。機械の声を使うなら `python3 -m venv video/work/.venv && video/work/.venv/bin/pip install pyopenjtalk numpy`。
1. `npx vite build --outDir video/work/dist` → `npx vite preview --outDir video/work/dist --port 5200` で、組んだ継ぐを動かす。
2. 指輪のこま：`node video/cine/cine.cjs form 60`・`morph 60`・`metal`、`node video/capture/hero.cjs`・`hero-thick.cjs`・`hero-pair.cjs`（太い爪と細い爪を並べる）、`node video/cine/sizes.cjs`。
3. 文字と図の場面：`node video/cine/rec-html.cjs`（sizes は 2 のあとで。2 つをつないで sizes.mp4 にする）。画面：`node video/capture/movall2.cjs`・`movmore2.cjs`。
4. `video/work/.venv/bin/python -I video/tts.py video/scenes11.json s11_ video/work/voice`（作者の声が届いたら、それに替える）。
5. `VOICE=tts VPREFIX=s11_ OUT=継ぐ_仮の動画.mp4 node video/edit.cjs` → `video/work/vc/` にできる。

作者が撮る素材は `video/work/footage/` に、英字と数字だけの名前で置く（te1・te2・D・B・E・F・G・L・I・J・ring1・ring2・end。日本語の名前は送ると消える）。置くと自動で差し替わる。

入れないもの：作者の声の録音、作者が送った見本の動画、録った画面・指輪のこま・組み上がった動画（大きいので作業用のフォルダだけに置く）。
