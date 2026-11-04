# 仮の動画の声を、人に近い機械の声で読ませる（本番は作者の声に替えるかもしれない）。
# 使い方：python -I tts_kokoro.py <scenes.json か final.json> <出力の前置き> <出力のフォルダ> [声]   例：python -I tts_kokoro.py final.json k_ work/voice jm_kumo
# 要るもの：kokoro-onnx（MIT）と Kokoro-82M の重みと声（Apache-2.0。work/kokoro/ に置く。リポジトリには入れない）、misaki[ja]、unidic-lite
import json, subprocess, sys, os
import soundfile as sf
from kokoro_onnx import Kokoro
from misaki import ja

scenes, prefix, out = sys.argv[1], sys.argv[2], sys.argv[3]
voice = sys.argv[4] if len(sys.argv) > 4 else "jm_kumo"
here = os.path.dirname(os.path.abspath(__file__))
k = Kokoro(f"{here}/work/kokoro/kokoro-v1.0.onnx", f"{here}/work/kokoro/voices-v1.0.bin")
g2p = ja.JAG2P()
# 数字・名前・英字の読み（機械が読み違えるもの）
R = [("Claude Code", "クロード・コード"), ("Claude", "クロード"), ("AI", "エーアイ"), ("CAD", "キャド"),
     ("1.66 ミリ", "いってんろくろくミリ"), ("3.2 グラム", "さんてんにグラム"), ("2.5 グラム", "にてんごグラム"), ("0.7、", "れいてんなな、"), ("0.8 から 1 ミリ", "れいてんはちから、いちミリ"), ("24 年", "にじゅうよねん"), ("6 割", "ろくわり"), ("清書", "せいしょ"), ("組み立て直す", "くみたてなおす"), ("帳面", "ちょうめん"), ("0.7 ミリ", "れいてんななミリ"), ("0.7 ミリ、", "れいてんななミリ、"), ("0.8 ミリから 1 ミリ", "れいてんはちミリから、いちミリ"), ("0.8 から 1 ミリ", "れいてんはちから、いちミリ"),
     ("20 年", "にじゅうねん"), ("2 回ほど", "にかいほど"), ("1 時間", "いちじかん"),
     ("伊勢神宮", "いせじんぐう"), ("式年遷宮", "しきねんせんぐう"), ("御装束神宝", "おんしょうぞくしんぽう"),
     ("木目金", "もくめがね"), ("鍛造", "たんぞう"), ("神宝", "しんぽう"), ("9 つ", "ここのつ"), ("11 の工程", "じゅういちの工程"), ("1 枚", "いちまい"),
     ("飾太刀", "かざりたち"), ("鐔", "つば"), ("石座", "いしざ"), ("ロウ付け", "ろうづけ"), ("の座", "のざ"), ("ザグり", "ざぐり"), ("尖り", "とがり"), ("蓄え", "たくわえ"),
     ("11 のうち 9", "じゅういちのうち、きゅう"), ("9 か 10", "きゅうか、じゅう"), ("3 回", "さんかい"), ("1 つずつ", "ひとつずつ"), ("一人ひとり", "ひとりひとり"),
     ("伝統的工芸品", "でんとうてきこうげいひん"), ("扱う", "あつかう"),
     ("宝飾", "ほうしょく"), ("彫金", "ちょうきん"), ("継ぐ", "つぐ"), ("鋳造", "ちゅうぞう"), ("暗黙知", "あんもくち"), ("魚々子", "ななこ"), ("金工", "きんこう"), ("3D", "スリーディー"), ("帳面", "ちょうめん"), ("工房", "こうぼう"), ("石留め", "いしどめ"), ("爪", "つめ")]
data = json.load(open(scenes))
# 最終案（final.json）：{"voice": [{"n": 場面の番号, "text": 言葉}]} → <前置き>n<番号>.wav
items = [(f"n{v['n']}", v["text"], f"場面 {v['n']}") for v in data["voice"]] if isinstance(data, dict) else [(str(i), s["say"], s["name"]) for i, s in enumerate(data)]
for key, say, name in items:
    text = say.strip()
    dst = f"{out}/{prefix}{key}.wav"
    if not text:
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "0.2", dst], check=True)
        continue
    for a, b in R:
        text = text.replace(a, b)
    ph, _ = g2p(text)
    a, sr = k.create(ph, voice=voice, speed=1.21, lang="ja", is_phonemes=True)
    tmp = f"{out}/_k.wav"
    sf.write(tmp, a, sr)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", tmp, "-af", "loudnorm=I=-16:TP=-1.5", "-ar", "48000", "-ac", "2", dst], check=True)
    os.remove(tmp)
    print(key, name)
