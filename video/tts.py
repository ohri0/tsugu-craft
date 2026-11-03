# 仮の動画の確かめ用に、台本（scenes*.json の say）を機械の声で読ませる（本番は作者の声。この声は動画に使わない）。
# 使い方：python -I tts.py <scenes.json> <出力の前置き> <出力のフォルダ>   例：python -I tts.py scenes11.json s11_ voice
# 要るもの：pyopenjtalk（Open JTalk と「mei」の声。mei は CC BY 3.0。確かめ用だけに使い、リポジトリと本番の動画には入れない）
import json, subprocess, sys, wave
import numpy as np
import pyopenjtalk

scenes, prefix, out = sys.argv[1], sys.argv[2], sys.argv[3]
R = [("Claude Code", "クロード・コード"), ("Claude", "クロード"), ("AI", "エーアイ"), ("1.66", "一点六六"), ("0.8。", "零点八。"), ("0.7", "零点七"),
     ("3 本", "三本"), ("3 ミリ", "三ミリ"), ("12 ミリ", "十二ミリ"), ("20 年", "二十年"), ("10 年", "十年"), ("2 回か 3 回", "二回か三回"), ("CAD", "キャド")]
for i, s in enumerate(json.load(open(scenes))):
    text = s["say"].strip()
    dst = f"{out}/{prefix}{i}.wav"
    if not text:
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "0.2", dst], check=True)
        continue
    for a, b in R:
        text = text.replace(a, b)
    x, sr = pyopenjtalk.tts(text, speed=1.22)
    x = np.clip(x, -32768, 32767).astype(np.int16)
    with wave.open("/tmp/_tts.wav", "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(x.tobytes())
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", "/tmp/_tts.wav", "-af", "loudnorm=I=-16:TP=-1.5", "-ar", "48000", "-ac", "2", dst], check=True)
    print(i, s["name"])
