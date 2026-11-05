# 最終案を、はじめから終わりまで組む（画面 → 音楽 → 効果音 → 声 → 混ぜる）。
# 使い方：python -I final.py [--plan 2|3] [--variant A|B] [--no-video] [--jobs 12]
#   --plan 2 で最終案 2（final_build2.py・bgm4.py。--variant は終わり方の 2 案）、--plan 3 で最終案 3（final_build3.py・bgm5.py）
#   --plan 7 で最終案 7（final_build7.py・bgm5.py）。--variant B で工房ごとを外した版
#  1. final_build.py：台本（final.json。拍で書いた場面・言葉・音楽・声）
#  2. reel.py：本物の画面のこまに、カメラ・つなぎ・大きな言葉 → work/vc/final_video.mp4（＋効果音の合図）
#  3. bgm3.py：音楽（自作）　4. sfx.py：効果音（自作）
#  5. 声：作者の録音 work/voice/n<番号>.wav があればそれ、なければ機械の声 work/voice/k<案>_n<番号>.wav（tts_kokoro.py）
#     最終案 4 から：作者の録音は台本（final_build4.py）が整えて（無音を切る・大きさをそろえる → work/voice/_own/）、その長さで場面をのばす・つめる。
#     絵の台本が前と変わったら、--no-video でも画面を作り直す（作者の声で場面の長さが変わるため）
#  6. 混ぜる → work/vc/継ぐ_デモ_最終案1.mp4（音楽と効果音だけ）と、声入り（_仮声 か _声）
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get("TSUGU_VIDEO_WORK", os.path.join(HERE, "work"))
VC = os.path.join(WORK, "vc")
PY = sys.executable
args = sys.argv[1:]
jobs = args[args.index("--jobs") + 1] if "--jobs" in args else "12"
PLAN = args[args.index("--plan") + 1] if "--plan" in args else "1"
VARIANT = args[args.index("--variant") + 1] if "--variant" in args else ""
if VARIANT:
    os.environ["VARIANT"] = VARIANT
# 最終案 7：工房ごとを入れた版（--variant なし）と外した版（--variant B）で、名前を分ける
NAME = os.environ.get("NAME", f"継ぐ_デモ_最終案7_{'工房なし' if VARIANT == 'B' else '工房あり'}" if PLAN == "7" else f"継ぐ_デモ_最終案{PLAN}" + (f"_{VARIANT}" if VARIANT else ""))
BUILD = "final_build.py" if PLAN == "1" else f"final_build{PLAN}.py"
JSON = "final.json" if PLAN == "1" else (f"final{PLAN}.json" if VARIANT in ("", "A") else f"final{PLAN}{VARIANT}.json")
BGM = {"1": "bgm3.py", "2": "bgm4.py"}.get(PLAN, "bgm5.py")
VPRE = {"1": "k_", "2": "k2_"}.get(PLAN, f"k{PLAN}_")  # 仮の声（機械の声）のファイルの前置き
TAG = ("final" if PLAN == "1" else f"final{PLAN}") + VARIANT


# 音の圧縮：Mac の AudioToolbox の AAC があれば、それを使う（ffmpeg の内蔵の AAC は、この曲の打つ音で山が +2.5 dB まで出た。AudioToolbox は -0.8 dB）
AAC = "aac_at" if "aac_at" in subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True).stdout else "aac"


def run(cmd, **kw):
    print("→", " ".join(os.path.basename(c) if i < 3 else c for i, c in enumerate(cmd))[:160])
    subprocess.run(cmd, check=True, **kw)


def dur(f):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).decode())


os.makedirs(VC, exist_ok=True)
run([PY, "-I", os.path.join(HERE, BUILD)])
tl = json.load(open(os.path.join(HERE, JSON)))
total = tl["len"] * 60 / tl.get("bpm", 120)
video = os.path.join(VC, f"{TAG}_video.mp4")
cues = os.path.join(VC, f"{TAG}_video_cues.json")
# 画面の台本（絵・字・長さ）の指紋。前に作った画面と同じなら、--no-video で作り直さない
import hashlib  # noqa: E402
sig = hashlib.sha1(json.dumps([tl["clips"], tl["text"], tl["len"]], sort_keys=True, ensure_ascii=False).encode()).hexdigest()
sigf = video + ".sig"
same = os.path.exists(video) and os.path.exists(sigf) and open(sigf).read() == sig
if "--no-video" not in args or not same:
    if "--no-video" in args:
        print("画面の台本が前と変わったので、画面も作り直します（作者の声に合わせて、場面の長さが変わったなど）")
    run([PY, "-I", os.path.join(HERE, "reel.py"), os.path.join(HERE, JSON), video, jobs])
    open(sigf, "w").write(sig)
bgm = os.path.join(VC, f"{TAG}_bgm.wav")
run([PY, "-I", os.path.join(HERE, BGM), os.path.join(HERE, JSON), bgm])
fx = os.path.join(VC, f"{TAG}_sfx.wav")
run([PY, "-I", os.path.join(HERE, "sfx.py"), cues, fx, str(total)])

# ---- 声を並べる（場面の頭の拍 ＋ 0.15 秒。前の声が長ければ、終わって 0.3 秒あけてから）
# 機械の声（仮声）だけは、次の声の頭に間に合わないとき、1.25 倍までの速さで読ませて場面に合わせる。作者の録音は速さを変えない
VO = os.path.join(WORK, "voice")
lines, mine = [], 0
prev_end = 0.0
vs = sorted(tl["voice"], key=lambda x: x["at"])
head = lambda v: v["at"] * 60 / tl.get("bpm", 120) + 0.15  # noqa: E731
OWN_T = float(tl.get("own_tempo", 1.0) or 1.0)  # 作者が良いと言ったときだけ 1 より大きい（OWN_TEMPO）
for i, v in enumerate(vs):
    own = os.path.join(WORK, v["own"]) if v.get("own") else os.path.join(VO, f"n{v['n']}.wav")  # 台本が整えた録音（無音を切った・大きさをそろえた）
    tts = os.path.join(VO, f"{VPRE}n{v['n']}.wav")
    f = own if os.path.exists(own) else tts if os.path.exists(tts) else None
    if not f:
        continue
    mine += f == own
    at = max(head(v), prev_end + 0.3)
    d, tempo = dur(f), (OWN_T if f == own else 1.0)
    if f != own and PLAN != "1" and i + 1 < len(vs):
        room = head(vs[i + 1]) - 0.3 - at
        if 0 < room < d:
            tempo = min(1.25, d / room)
    prev_end = at + d / tempo
    lines.append((f, at, tempo))
    print(f"声 n{v['n']}", f"{at:.2f} 秒から", f"{d / tempo:.2f} 秒", f"（{tempo:.2f} 倍）" if tempo > 1.001 else "", f"遅れ {at - head(v):.2f}" if at - head(v) > 0.05 else "")
    if prev_end > total:
        print("声が長すぎて、終わりを越えます：", v["n"])
print("声", len(lines), "（作者の録音", mine, "）")


def loud(src, dst, target=-14.0):
    """2 回で、聞こえる大きさをそろえる（YouTube の目安 -14 LUFS、頭打ち -1.5 dB）"""
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", src, "-af", f"loudnorm=I={target}:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], capture_output=True, text=True).stderr
    j = json.loads(out[out.rindex("{") : out.rindex("}") + 1])
    flt = f"loudnorm=I={target}:TP=-1.5:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true"
    if PLAN not in ("1", "2"):
        # 最終案 3：AAC にすると山が少しはみ出すので、先に山だけを -3 dB で抑える（その分、聞こえる大きさを 0.3 だけ上げておく → -14 LUFS）
        flt = flt.replace(f"I={target}:", f"I={target + 0.3}:") + ",alimiter=limit=0.708:attack=2:release=60:level=disabled:asc=1"
    run(["ffmpeg", "-v", "error", "-y", "-i", src, "-af", flt, "-ar", "48000", dst])


# ---- 音楽と効果音だけ
mixA = os.path.join(VC, "_mixA.wav")
FXV = 0.42 if PLAN in ("1", "2") else 0.22  # 最終案 3：効果音は押す音と打つ音だけ、小さく（拍は音楽が作る）
run(["ffmpeg", "-v", "error", "-y", "-i", bgm, "-i", fx, "-filter_complex",
     f"[0:a]atrim=0:{total},volume=0.85[m];[1:a]atrim=0:{total},volume={FXV}[f];[m][f]amix=inputs=2:normalize=0,afade=t=out:st={total - 3}:d=3[a]",
     "-map", "[a]", mixA])
mixA2 = os.path.join(VC, "_mixA2.wav")
loud(mixA, mixA2)
outA = os.path.join(VC, f"{NAME}.mp4")
run(["ffmpeg", "-v", "error", "-y", "-i", video, "-i", mixA2, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", AAC, "-b:a", "256k", "-shortest", outA])

# ---- 声入り（声が出ている間、音楽を下げる）
if lines:
    ins, flt = ["-i", bgm, "-i", fx], []
    for k, (f, at, tempo) in enumerate(lines):
        ins += ["-i", f]
        ms = int(at * 1000)
        fast = f"atempo={tempo:.3f}," if tempo > 1.001 else ""
        flt.append(f"[{k + 2}:a]aresample=48000,aformat=channel_layouts=stereo,{fast}adelay={ms}|{ms}[v{k}]")
    flt.append("".join(f"[v{k}]" for k in range(len(lines))) + f"amix=inputs={len(lines)}:normalize=0,apad,atrim=0:{total},volume=1.0,asplit=2[vo][vk]")
    flt.append(f"[0:a]atrim=0:{total},volume=0.75[m]")
    # 最終案 7：音楽の強い所（ドロップ・groove・終わり）でも声が埋もれないよう、声が出ている間は少し深く下げる（声との差が 4 dB しかない行があった）
    sc = "threshold=0.016:ratio=8" if PLAN == "7" else "threshold=0.025:ratio=7"
    flt.append(f"[m][vk]sidechaincompress={sc}:attack=25:release=420:makeup=1[md]")
    flt.append(f"[1:a]atrim=0:{total},volume={0.3 if PLAN in ('1', '2') else 0.16}[f]")
    fo = 3 if PLAN in ("1", "2") else 1.0  # 最終案 3：音楽は自分で消えていく。終わりの声（作りました）を消さないよう、最後の 1 秒だけ
    flt.append(f"[vo][md][f]amix=inputs=3:normalize=0,afade=t=out:st={total - fo}:d={fo}[a]")
    mixB = os.path.join(VC, "_mixB.wav")
    run(["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", ";".join(flt), "-map", "[a]", mixB])
    mixB2 = os.path.join(VC, "_mixB2.wav")
    loud(mixB, mixB2)
    outB = os.path.join(VC, f"{NAME}_{'声' if mine == len(lines) and not tl.get('own_sim') else '仮声'}.mp4")  # noqa（own_sim：作者の録音のまね）
    run(["ffmpeg", "-v", "error", "-y", "-i", video, "-i", mixB2, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", AAC, "-b:a", "256k", "-shortest", outB])
    print("できた：", outB)
print("できた：", outA, round(total, 1), "秒")


def phone(src):
    """スマホで見る・送る用（1280 px・30 MB 以下。最終案 7 は 20 MB 以下）"""
    dst = src[:-4] + "_スマホ.mp4"
    limit = 20 if PLAN == "7" else 30
    # 最終案 7：黒が多く字が細いので、20 MB に余裕があるぶん画質を上げる（crf 28 で約 7 MB、crf 23 で約 9 MB だった）
    for crf in ((20, 22, 24, 26, 28) if PLAN == "7" else (28, 30, 32, 34)):
        run(["ffmpeg", "-v", "error", "-y", "-i", src, "-vf", "scale=1280:-2", "-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-pix_fmt", "yuv420p", "-c:a", AAC, "-b:a", "128k" if PLAN in ("1", "2") else "192k", "-movflags", "+faststart", dst])
        mb = os.path.getsize(dst) / 1e6
        print("スマホ用", os.path.basename(dst), f"crf {crf}", round(mb, 1), "MB")
        if mb < limit:
            break


if PLAN != "1":
    phone(outA)
    if lines:
        phone(outB)
