#!/bin/zsh
# 最終案 10〜12 の素材を、コマンド 1 つで撮る（今のアプリを組んで、撮る用のサーバーを立て、撮って、止める）。
# 使い方：zsh video/capture10.sh [章…]（なしなら最終案 10 で使う章を全部。例：zsh video/capture10.sh ops11 gothic11）
#   本物の Claude の返事は work/story/_claude9/ に覚えてあるので、ふつうは Claude を呼ばない（覚えていない所は止める）。
#   新しく本物の Claude を呼ぶときだけ CLAUDE9=1 を付ける（開発用のサーバーを 5432 番に立てる。キーは .env からそのサーバーが読む）。
#   最初の版（7606ee7）の形は work/story/first9_geom.json（capture/first9-dump.cjs が作る。作り直すときだけ）。
# 使う番号：5431（撮る用）・5432（Claude を呼ぶときだけ）。5180・5199・5201・5213・5222 は使わない。
set -e
cd "${0:A:h}/.."
REPO=$PWD
WORK=${TSUGU_VIDEO_WORK:-$REPO/video/work}
# 言葉で頼む場面（deco11）は「アールデコな感じ」の、作者が選んだ回の本物の返事（覚えた返事。Claude は呼ばない）。
#   2026-11-06 夕方：2 回目の試し（彫りの模様を足した後）の 5 回目＝ work/story/_claude9/deco11_t5/（000.json〜002.json）。
#   2026-11-07（最終案 17〜）：作者が選んだ 9 回目＝ work/story/_claude9/deco11_t16/（000.json〜001.json）。これを既定にした
#   形を替えるとき：選んだ回の返事（API の返事そのまま）を _claude9/deco11_t<番号>/ に置いて DECO_USE=<番号>、
#   または DECO_REPLY_DIR=<返事の所> を付けて、zsh video/capture10.sh deco11 → python -I video/final9.py --plan 10
export DECO_USE=${DECO_USE:-16}
# 最終案 12 で使う章（ops12＝手で操作する 3 つ。結は実写なので decoring11 は使わない）
# 最終案 13：断面を手で描くは sec13（何度も変える・赤 → 元に戻す）。ops12 は爪と留め方に使う。deco11 は ?nooffload で撮る（爪のつまみをゆっくり）
# 最終案 14：残すは teach14（本物の「Claude に教える」。覚えた返事 _claude9/teach14/）、伝統の仕上げは finish14、作り方は make14（職人の決まりまで）、
#   学ぶは learn11（9.3 mm の問い）。ops12（爪・留め方）と word10 は使わない。どの章も、印は止めない（a.drift。作者の声：止まるとラグに見える）
# 最終案 15：残すの本物の画面は teach15（話して直す所だけ）、伝統の仕上げ → 作り方は finish15
# 最終案 16：本物の指輪の前のテンションの計算は tension16
CHAPTERS=(${@:-draw10 first9 teach15 sec13 finish15 deco11 tension16 make14 learn11 kebori9 hands9 moyou11})
echo "今のアプリを組む → $WORK/dist-cap10"
npx vite build --outDir "$WORK/dist-cap10" --emptyOutDir > /dev/null
PIDS=()
cleanup() { for p in $PIDS; do kill $p 2>/dev/null || true; done }
trap cleanup EXIT INT TERM
if [[ -n "$CLAUDE9" ]]; then
  npx vite --port 5432 --strictPort --host 127.0.0.1 > "$WORK/log-api10.txt" 2>&1 &
  PIDS+=($!)
  API=5432
else
  export CLAUDE9_OFF=1
  API=9
fi
CAP_DIST="$WORK/dist-cap10" CAP_PORT=5431 API_PORT=$API node video/capture/serve.cjs > "$WORK/log-serve10.txt" 2>&1 &
PIDS+=($!)
sleep 2
export TSUGU_CAP=http://localhost:5431
# 図面（章の扉と行き来の図に使う）
if [[ -z "$1" || " $* " == *" draw10 "* ]]; then node video/capture/draw10.cjs; fi
CH=(${CHAPTERS:#draw10})
if (( ${#CH} )); then node video/capture/story.cjs $CH; fi
echo "撮り終わった：${CHAPTERS[*]}"
