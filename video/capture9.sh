#!/bin/zsh
# 最終案 9 の素材を、コマンド 1 つで撮る（今のアプリを組んで、撮る用のサーバーを立て、撮って、止める）。
# 使い方：zsh video/capture9.sh [章…]（なしなら全部。例：zsh video/capture9.sh book9 gothic9）
#   本物の Claude の返事は work/story/_claude9/ に覚えてあるので、ふつうは Claude を呼ばない（覚えていない所は止める）。
#   新しく本物の Claude を呼ぶときだけ CLAUDE9=1 を付ける（開発用のサーバーを 5432 番に立てる。キーは .env からそのサーバーが読む）。
#   最初の版（7606ee7）の形は work/story/first9_geom.json（capture/first9-dump.cjs が作る。作り直すときだけ）。
# 使う番号：5431（撮る用）・5432（Claude を呼ぶときだけ）。5180・5199・5201・5213・5222 は使わない。
set -e
cd "${0:A:h}/.."
REPO=$PWD
WORK=${TSUGU_VIDEO_WORK:-$REPO/video/work}
CHAPTERS=(${@:-ring9 first9 book9 tension9 photo9 gothic9 word9 ask9 reason9 make9 learn9 kebori9 hands9 restore9 rebuild9})
echo "今のアプリを組む → $WORK/dist-cap9"
npx vite build --outDir "$WORK/dist-cap9" --emptyOutDir > /dev/null
PIDS=()
cleanup() { for p in $PIDS; do kill $p 2>/dev/null || true; done }
trap cleanup EXIT INT TERM
if [[ -n "$CLAUDE9" ]]; then
  npx vite --port 5432 --strictPort --host 127.0.0.1 > "$WORK/log-api9.txt" 2>&1 &
  PIDS+=($!)
  API=5432
else
  export CLAUDE9_OFF=1
  API=9
fi
CAP_DIST="$WORK/dist-cap9" CAP_PORT=5431 API_PORT=$API node video/capture/serve.cjs > "$WORK/log-serve9.txt" 2>&1 &
PIDS+=($!)
sleep 2
export TSUGU_CAP=http://localhost:5431
# 図面（章の扉と行き来の図に使う）
if [[ -z "$1" || " $* " == *" draw9 "* ]]; then node video/capture/draw9.cjs; fi
CH=(${CHAPTERS:#draw9})
if (( ${#CH} )); then node video/capture/story.cjs $CH; fi
echo "撮り終わった：${CHAPTERS[*]}"
