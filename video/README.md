# 動画を組む仕組み

## 最終案 5（2026-11-04 夜〜。いまの作り方）

最終案 4 の仕組みのまま、最終案 4 を見た作者の 13 の声を入れたもの。設計は `PLAN-final.md`、声の台本は `../docs/NARRATION-ad.md`（53 行）。

- 台本：`final_build5.py` → `final5.json`。`reel.py` に足した物：flow4 の戻る弧の両はし・高さ・おわりの字（`arc`・`arcH`・`okText`）、学校の図の石の形（`shapes`。エメラルドカット）、工房の新しい図 `senior5`、答え合わせの見出し（`title`）。
- 撮り直し：learn4m（決まりを直したので、本物の Claude の答えが変わる）。`npx vite build --outDir video/work/dist-cap --emptyOutDir` → `node video/capture/story.cjs learn4m`（5201 番の `capture/serve.cjs`、/api は 5180 番の開発用サーバー）。
- 仮声（作者の声：行を切る前に、少し速めただけの版を聞きたい）：ふつうの速さの機械の声を作り、作者の録音のまねとして、作者の録音と同じ道に通す。
  1. `KOKORO_SPEED=1.0 video/work/.venv/bin/python -I video/tts_kokoro.py video/final5.json "" video/work/voice/sim5`（1 秒に約 6 字）
  2. `TSUGU_OWN_VOICE=$PWD/video/work/voice/sim5 OWN_TEMPO=auto OWN_TEMPO_MAX=1.40 video/work/.venv/bin/python -I video/final.py --plan 5` → 3 分に入るいちばん遅い速さ（いまは 1.36 倍）で混ぜる。録音の場所が `work/voice` でないときは、まねとして `_仮声` の名前になる（`own_sim`）。
- 作者の録音がそろったら：`work/voice/n<番号>.wav` に置いて `video/work/.venv/bin/python -I video/final.py --plan 5`（速さはそのまま）。3 分を越えたら、作者と相談して `OWN_TEMPO=auto`（`OWN_TEMPO_MAX` で上限）か、行を減らす。

## 最終案 4（2026-11-04 夜）

最終案 3 の仕組みのまま、作者の 11 の直しを入れたもの。設計は `PLAN-final.md`、声の台本は `../docs/NARRATION-ad.md`。

- 台本：`final_build4.py` → `final4.json`（2 分 58 秒 ＝ 356 拍）。確かめ（1 拍に 1 つ・はみ出し・拍の途中の切り替え・すき間）は最終案 3 と同じ。
- `reel.py` に足した物：`flow4`（デザイン ⇄ 設計（CAD）→ 制作の図）・`imgs`（公開の画像を並べる）・`type3`（1 字ずつ打つ字）。
- 撮る：`capture/story.cjs` の hook4・multi4・red4・learn4m（スマホの幅）・same4・hero4。ほかは最終案 3 の章。
- 仮の声：`SSL_CERT_FILE=$(video/work/.venv/bin/python -m certifi) video/work/.venv/bin/python -I video/tts_kokoro.py video/final4.json k4_ video/work/voice jm_kumo`
- 組む：`video/work/.venv/bin/python -I video/final.py --plan 4` → `video/work/vc/継ぐ_デモ_最終案4.mp4`・`_仮声.mp4`・それぞれの `_スマホ.mp4`。
- 最初の版から、今の版へ（0:44、8 秒）：`work/beforeafter/` の before_*/after_*.png（hero・seat・under_gray。別の作業で、git の 7606ee7 と今の版を同じ石・同じカメラで撮った物。`notes.md`）。前と後は同じ構図で、左から右へ拭う（`reel.py` のつなぎ `wipe`。境に細い金の線）。窓の中の地だけを絵の地の色に（`innerBg`）、外は黒。札は窓の上の黒の所に。絵がないときは、場所だけ空けて「準備中」と出る。
- **作者の声**（51 行、`../docs/NARRATION-ad.md`）：`work/voice/n<番号>.wav`（.m4a・.mp3・.aif も可）を置いて組み直す。
  1. `final_build4.py` が録音を整える：前とうしろの無音を切る（声のはじまりの大きさは、部屋の静かさから決める）・75 Hz より下を切る・-16 LUFS（山 -1.5 dB）→ `work/voice/_own/n<番号>.wav`。録り直したら（大きさ・時刻が変わったら）作り直す。速さは変えない。
  2. のばす：声が、その場面（左の見出しが替わるまで）に入りきらないとき（次の場面へ 1.5 拍より多くはみ出す・次の場面の声を 1 拍より多く遅らせる・おわりの声が最後の 1 秒にかかる）、場面のおわりで絵をその所で止めて、小節（4 拍 ＝ 2 秒）ずつのばす。絵の中で止める所は、`reel.py` の `warp`（外の時刻 → 中の時刻。止める間は同じ時刻）。字はそのぶん長く出る。音楽はその所の段が小節ずつのび、止める所・上がる音・一打は切り替えについていく。
  3. つめる：その場面の声がみな作者の録音で、見せたい物（新しく出る物・カメラ・撮った画面の動き・字）がみな出て 2 拍たっても、場面のおわりに 1 小節以上あまるとき、切り替えの所の手前を小節ずつつめる（つかみ・題・おわりの題・図の場面はつめない）。
  4. 3 分（360 拍）を越えたら「3 分を越える」と出す。作者が良いと言ったときだけ、`OWN_TEMPO=auto`（1.00〜1.10 倍を 0.02 ずつ試して、3 分に入るいちばん遅い速さ）か `OWN_TEMPO=1.05` で、作者の声を少し速める（`final.py` が同じ速さで混ぜる）。
  - `final.py` は、画面の台本（絵・字・長さ）の指紋を `final4_video.mp4.sig` に残し、変わっていたら `--no-video` でも画面を作り直す（声で場面の長さが変わるため）。
  - 試し（2026-11-04）：仮声を前とうしろに無音をつけたファイルにして作者の録音のかわりに置くと、仮声の速さ（1 秒に約 7 字）で 2:58 のまま。0.9 倍の速さで 3:10（6 か所のばす）、0.85 倍で 3:18。`OWN_TEMPO=auto` なら 0.9 倍の声は 1.06 倍で 3:00、0.85 倍の声は 1.10 倍でも 3:04。

## 最終案 3（2026-11-04 夜）

最終案 2 の仕組みのまま、編集の決まり・字・音楽を作り直したもの。設計は `PLAN-final.md`、声の台本は `../docs/NARRATION-ad.md`。

- 台本：`final_build3.py` → `final3.json`（2 分 59 秒 ＝ 358 拍）。音楽の楽譜（段・止める所・一打・上がる音・金床の音）も同じ台本に書く。
  - 回すと、編集の決まりを確かめる：1 拍に 2 つ以上新しく出ないか、見出し・本文が左の欄（590 px）からはみ出さないか、拍の途中で切っていないか、すき間がないか。気になる所は「！」で出る。
- 組む：`reel.py`（`style: 3` の台本のとき、最終案 3 の決まりで組む。最終案 1・2 の台本は前のまま組める）。
  - 字は `head`（左の同じ所。言葉ごとに拍で出る。見出し 64 px・本文 32 px）・`logo`（題）・`tag3`（数字の札）。
  - 図は `flow3`（イメージ → デザイン ⇄ CAD → 職人、継ぐでたたまれる）・`school3`（学校）・`senior3`（工房）・`check3`（答え合わせの 11 工程）・`stat3`（作り手の数）。
  - カメラは 3 次のゆっくり・速く・ゆっくり（`cio`）。理由なく寄らない（ゆっくり寄り続ける drift なし、ぶれなし）。ふちをごく少し暗くする（vignette）。
  - スマホの幅で撮った章（960 × 1800）も組める（`meta.json` の `size`）。
- 音楽：`bgm5.py`（120 拍／分。vi–IV–I–V。4 音のモチーフ、締まったキックとクラップ、サイドチェーンの低音、止める → 打つ、合成の上がる音と逆回しのシンバル。最後は全音上げる。-14 LUFS、サンプルの間の山も -1.5 dB 以下）。
  - 試しに一部だけ：`video/work/.venv/bin/python -I video/bgm5.py video/final3.json 出力.wav --from 拍 --to 拍`
- 撮る：`capture/story.cjs` の hero3・build3・word3・fix3・section3・same3・workshops3・make3・rebuild3・anyone3b（1600 × 900）と、ledger3m・learn3m・waza3m（スマホの幅 480 × 900）。
  - アプリが変わったら、`npx vite build --outDir video/work/dist-cap --emptyOutDir` で組み直してから撮る。撮るたびに、新しい空の localStorage で始まる。
  - rebuild3 は、答え合わせの中身（どの本当の工程にたどり着いたか）を `work/story/rebuild3/grade.json` に残す。答え合わせの図は、これを読む。
- 仮の声：`SSL_CERT_FILE=$(video/work/.venv/bin/python -m certifi) video/work/.venv/bin/python -I video/tts_kokoro.py video/final3.json k3_ video/work/voice jm_kumo`
- 組む：`video/work/.venv/bin/python -I video/final.py --plan 3`。次のファイルができる。
  - `video/work/vc/継ぐ_デモ_最終案3.mp4`（音楽と効果音だけ）・`継ぐ_デモ_最終案3_仮声.mp4`（仮の声入り）
  - それぞれの `_スマホ.mp4`（1280 px・30 MB 以下）
  - 効果音は、押す音と打つ音だけを小さく（拍は音楽が作る）。音だけ混ぜ直すときは `--no-video`。
- 作者の声：`video/work/voice/n<番号>.wav`（台本は `docs/NARRATION-ad.md`）。

## 最終案 2（2026-11-04 夕方）

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
