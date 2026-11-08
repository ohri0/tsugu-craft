# 最終案 9 を、はじめから終わりまで組む（台本 → 絵 → 音楽 → 声 → 混ぜる → 提出用とスマホ用）。
# 使い方：python -I video/final9.py [--plan 10] [--jobs 12] [--no-video]（作者が Mac を使っている間は --jobs 3 くらいに。書き出しの ffmpeg は 4 本の糸まで）（--plan 10 で最終案 10：final_build10.py → final10.json → 継ぐ_デモ_最終案10_仮声.mp4）
#  1. final_build9.py：台本 final9.json（声の長さから場面の長さを決める。全体は 3:00 以内）
#  2. reel9.py：場面ごとの動画（変えた場面だけ組み直す）→ work/vc/final9_video.mp4
#  3. 音楽：work/music9/song.wav があればそれ（作者の曲）。なければ bgm9.py の案 D3 を章の秒に合わせて作る（同じ秒なら作り直さない）
#  4. 声：作者の録音 work/voice/n<番号>.wav があればそれ、なければ仮声 work/voice/sim9/n<番号>.wav（台本が選ぶ）
#  5. 混ぜる：声が出ている間は音楽を下げる。炎とヤスリの本物の音を小さく足す。-14 LUFS・頭打ち -1.5 dB
#  できる物：work/vc/継ぐ_デモ_最終案9_仮声.mp4（作者の録音がそろえば _声）と _スマホ.mp4
import hashlib, json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get("TSUGU_VIDEO_WORK", os.path.join(HERE, "work"))
VC = os.path.join(WORK, "vc")
MUSIC = os.path.join(WORK, "music9")
PY = sys.executable
args = sys.argv[1:]
jobs = args[args.index("--jobs") + 1] if "--jobs" in args else "12"
PLAN = args[args.index("--plan") + 1] if "--plan" in args else "9"
# 最終案 17e（別の案）：V17E=1 で、台本 final10e.json・動画 final10e_video.mp4・継ぐ_デモ_最終案10e_仮声.mp4（17d の物は上書きしない）
TAG = "e" if os.environ.get("V17E") == "1" else ""
AAC = "aac_at" if "aac_at" in subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True).stdout else "aac"


def run(cmd, **kw):
    print("→", " ".join(os.path.basename(c) if i < 3 else c for i, c in enumerate(cmd))[:150], flush=True)
    subprocess.run(cmd, check=True, **kw)


def main():
    os.makedirs(VC, exist_ok=True)
    os.makedirs(MUSIC, exist_ok=True)
    run([PY, "-I", os.path.join(HERE, f"final_build{PLAN}.py")])
    tl = json.load(open(os.path.join(HERE, f"final{PLAN}{TAG}.json"), encoding="utf8"))
    total = tl["len"]
    video = os.path.join(VC, f"final{PLAN}{TAG}_video.mp4")
    if "--no-video" not in args:
        run([PY, "-I", os.path.join(HERE, "reel9.py"), os.path.join(HERE, f"final{PLAN}{TAG}.json"), video, jobs])
    # 音楽
    song = os.path.join(MUSIC, "song.wav")
    if os.path.exists(song):
        bgm = song
        print("音楽：作者の曲", song)
    else:
        sig = hashlib.sha1((json.dumps(tl["music"], sort_keys=True) + open(os.path.join(HERE, "bgm9.py"), "rb").read().hex()[:4000]).encode()).hexdigest()[:10]
        bgm = os.path.join(MUSIC, f"d3_{sig}.wav")
        if not os.path.exists(bgm):
            sec = os.path.join(MUSIC, f"d3_{sig}.json")
            with open(sec, "w", encoding="utf8") as f:
                json.dump(tl["music"], f)
            run([PY, "-I", os.path.join(HERE, "bgm9.py"), "--plan", "D3", "--sections", sec, "--out", bgm, "--no-m4a"])
    # 混ぜる
    ins = ["-i", bgm]
    flt = []
    k = 1
    vkeys = []
    for v in tl["voice"]:
        ins += ["-i", os.path.join(WORK, v["file"])]
        ms = int(v["at"] * 1000)
        flt.append(f"[{k}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms}[v{k}]")
        vkeys.append(f"[v{k}]")
        k += 1
    # 2026-11-08 作者の声：声が曲より少し大きい → 若干（約 1.5 dB）下げる
    flt.append("".join(vkeys) + f"amix=inputs={len(vkeys)}:normalize=0,volume=0.84,apad,atrim=0:{total},asplit=2[vo][vk]")
    flt.append(f"[0:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:{total},volume=0.78[m]")
    # 最終案 17（作者の声：2:32 あたりで脈打つように聞こえる）：声の言葉ごとに音楽が上下しないよう、戻りをゆっくり（0.5 → 0.9 秒）、下がり始めも少しゆっくり
    flt.append("[m][vk]sidechaincompress=threshold=0.018:ratio=5:attack=80:release=900:makeup=1[md]")
    mix = ["[vo]", "[md]"]
    # 本物の音：炎（はじめ）とヤスリ（手元の場面）。ごく小さく
    by_id = {s["id"]: s for s in tl["scenes"]}
    nat = [("raw/anneal.mov", "flame", 1.0, 0.20), ("raw/file_hands.mov", "hands0", 3.4, 0.30)]
    for name, sid, t0, vol in nat:
        s = by_id.get(sid)
        if not s:
            continue
        p = os.path.join(WORK, "footage", name)
        if not os.path.exists(p):
            continue
        ins += ["-i", p]
        st = s["start"]
        ln = s.get("nat", s["len"])  # 最終案 14：炎の音は、彫りの映像に替わる所で消す（台本の nat）
        ms = int(st * 1000)
        flt.append(f"[{k}:a]atrim={t0}:{t0 + ln * 0.8},asetpts=N/SR/TB,atempo=0.8,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:d=0.5,afade=t=out:st={max(0.1, ln - 0.9)}:d=0.9,volume={vol},adelay={ms}|{ms}[n{k}]")
        mix.append(f"[n{k}]")
        k += 1
    flt.append("".join(mix) + f"amix=inputs={len(mix)}:normalize=0,afade=t=out:st={total - 1.2}:d=1.2,atrim=0:{total}[a]")
    raw = os.path.join(VC, f"_mix{PLAN}{TAG}.wav")
    run(["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", ";".join(flt), "-map", "[a]", "-ar", "48000", raw])
    # 確かめ用：声と、下げたあとの音楽（と本物の音）を別々に書く（声が音楽に埋もれていないか、数字で見る）
    stems = [f.replace("[a]", "[st]") if f.startswith("".join(mix)) else f for f in flt]
    stems[-1] = "".join(mix[1:]) + f"amix=inputs={len(mix) - 1}:normalize=0,atrim=0:{total}[st]"
    stems.append("[vo]anull[vst]")
    run(["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", ";".join(stems), "-map", "[st]", "-ar", "48000", os.path.join(VC, f"_stem{PLAN}{TAG}_music.wav"), "-map", "[vst]", "-ar", "48000", os.path.join(VC, f"_stem{PLAN}{TAG}_voice.wav")])
    # 大きさをそろえる（2 回）
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", raw, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], capture_output=True, text=True).stderr
    j = json.loads(out[out.rindex("{") : out.rindex("}") + 1])
    af = f"loudnorm=I=-13.7:TP=-1.5:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true,alimiter=limit=0.708:attack=2:release=60:level=disabled:asc=1"
    mixed = os.path.join(VC, f"_mix{PLAN}{TAG}b.wav")
    run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-af", af, "-ar", "48000", mixed])
    own = tl["voice_own"] == len(tl["voice"])
    name = f"継ぐ_デモ_最終案{PLAN}{TAG}_声" if own else f"継ぐ_デモ_最終案{PLAN}{TAG}_仮声"
    final = os.path.join(VC, name + ".mp4")
    run(["ffmpeg", "-v", "error", "-y", "-i", video, "-i", mixed, "-map", "0:v", "-map", "1:a",
         "-c:v", "libx264", "-threads", "4", "-preset", "medium", "-crf", "16", "-tune", "film", "-x264-params", "aq-mode=3:aq-strength=1.1:deblock=-1,-1",
         "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
         "-c:a", AAC, "-b:a", "256k", "-movflags", "+faststart", "-shortest", final])
    phone = os.path.join(VC, name + "_スマホ.mp4")
    for crf in (21, 23, 25, 27):
        run(["ffmpeg", "-v", "error", "-y", "-i", final, "-vf", "scale=1280:-2:flags=lanczos", "-c:v", "libx264", "-threads", "4", "-preset", "slow", "-crf", str(crf), "-pix_fmt", "yuv420p",
             "-c:a", AAC, "-b:a", "192k", "-movflags", "+faststart", phone])
        mb = os.path.getsize(phone) / 1e6
        print("スマホ用", f"crf {crf}", round(mb, 1), "MB")
        if mb < 30:
            break
    print("できた：", final, f"{os.path.getsize(final) / 1e6:.0f} MB", round(total, 2), "秒")


if __name__ == "__main__":
    main()
