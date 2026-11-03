# 動画を組む仕組み

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

使い方（どの台本も、作業用のフォルダ `SP` の下に `vc/`・`cine/`・`voice/`・`footage/` を置く前提で、パスは各ファイルの頭に書いてある。別の場所で使うときは、そのパスを直す）：

1. `npx vite build --outDir <SP>/dist-t2` → `npx vite preview --outDir <SP>/dist-t2 --port 5200` で、組んだ継ぐを動かす。
2. `node capture/movall2.cjs`・`node capture/movmore2.cjs`（画面を録る）、`node cine/cine.cjs form 60`・`morph 60`・`metal`、`node cine/sizes.cjs`、`node cine/rec-html.cjs`。
3. `python -I tts.py scenes11.json s11_ <SP>/voice`（作者の声が届いたら、それに替える）。
4. `SCENES=scenes11.json VOICE=tts VPREFIX=s11_ OVERLAY=ov3.html OUT=継ぐ_仮の動画.mp4 node edit.cjs`。

作者が撮る素材は `footage/` に、英字と数字だけの名前で置く（te1・te2・D・B・E・F・G・L・I・J・ring1・ring2・end。日本語の名前は送ると消える）。置くと自動で差し替わる。

入れないもの：作者の声の録音、作者が送った見本の動画、録った画面・指輪のこま・組み上がった動画（大きいので作業用のフォルダだけに置く）。
