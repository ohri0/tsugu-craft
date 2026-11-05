# 最終案 8：作者の映像（work/footage/raw/。変えない）を補正して、動画で使う形にする。git に入れるのはこの手順だけ（映像は work の中）。
#  - 手元：raw/file_hands.mov の 4 秒 → work/footage/ring1.mov（暗部を締める。肌はそのまま。最後の 0.8 秒で黒へ）。音は hand_sound.wav（ヤスリの音）
#  - 材料と道具：raw/parts2〜4 の、置く所だけをつないだ 4 秒 → work/footage/parts.mov（真っ白な紙を、暗い動画になじむように下げる）
#    紙の明るさのむら（左上が白く飛ぶ・右下が暗い）は、何も置いていないこま（parts1 の頭）で割って平らにする。
#    カメラが明るさを勝手に変える分（物が増えると明るくなる：+50 %）は、紙の右上の明るさでこまごとに打ち消す。
#    そのあと、まん中だけ少し明るく、まわりは黒へ落ちる光を当て直す。
#  - 完成した指輪：本物の映像 raw/finished.mov があれば、同じ補正で → work/footage/finished.mov（final_build8.py は、これがあれば自動でこちらを使う）。
#    まだない間の仮：今の既定の三角（story/finished8。黒と白の地で撮った 2 枚）を、何も置いていない紙のこまの上、石を置いた位置に重ねる → work/footage/kari_finished.mov
# 使い方：python -I foot8.py [hands] [parts] [finished]（reel.py が読むこま work/footage/_ring1・_parts なども消して作り直させる）
import os, shutil, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get("TSUGU_VIDEO_WORK", os.path.join(HERE, "work"))
RAW = os.path.join(WORK, "footage", "raw")
OUT = os.path.join(WORK, "footage")
W, H, FPS = 1920, 1080, 30


def read(name, ss=None, t=None, fps=None):
    cmd = ["ffmpeg", "-v", "error"]
    if ss is not None:
        cmd += ["-ss", str(ss)]
    if t is not None:
        cmd += ["-t", str(t)]
    vf = f"scale={W}:{H}:flags=lanczos"
    if fps:
        vf = f"fps={fps}," + vf
    cmd += ["-i", os.path.join(RAW, name), "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)


def write(frames, name):
    dst = os.path.join(OUT, name)
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                          "-vf", "format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-color_range", "tv", "-movflags", "+faststart", dst], stdin=subprocess.PIPE)
    for f in frames:
        p.stdin.write(f.tobytes())
    p.stdin.close()
    p.wait()
    d = os.path.join(OUT, "_" + os.path.splitext(name)[0])
    if os.path.isdir(d):
        shutil.rmtree(d)  # reel.py が新しい映像からこまを切り出し直す
    print("できた", dst, len(frames) / FPS, "秒")


def lin(a):
    return np.power(a.astype(np.float32) / 255.0, 2.2)


def enc(a):
    return (np.power(np.clip(a, 0, 1), 1 / 2.2) * 255.0 + 0.5).astype(np.uint8)


# ================================================================ 手元
HAND_SS, HAND_LEN, HAND_FADE = 5.85, 4.0, 0.8


def hands():
    a = read("file_hands.mov", HAND_SS, HAND_LEN + 0.1, FPS)[: int(HAND_LEN * FPS)]
    k = np.arange(a.shape[0])
    out = []
    n = len(k)
    for i, f in enumerate(a):
        x = f.astype(np.float32) / 255.0
        # 暗部を締める：黒の持ち上がりを落とす（肌より上はほとんど変えない）。色は変えない
        Y = 0.2126 * x[..., 0] + 0.7152 * x[..., 1] + 0.0722 * x[..., 2]
        BP = 0.035
        Y2 = np.clip((Y - BP) / (1 - BP), 0, 1)
        Y2 = Y2 * (0.72 + 0.28 * np.clip(Y2 / 0.22, 0, 1))  # ごく暗い所だけ、もう少し落とす
        g = (Y2 + 1e-4) / (Y + 1e-4)
        x = np.clip(x * g[..., None], 0, 1)
        t = i / FPS
        fade = np.clip((HAND_LEN - t) / HAND_FADE, 0, 1)
        fade = fade * fade * (3 - 2 * fade)
        out.append((x * fade * 255.0 + 0.5).astype(np.uint8))
    write(out, "ring1.mov")
    # 音（本物のヤスリの音）：同じ 4 秒。うなりと高い雑音を切る。最後は絵と同じに消す。大きさは final.py で決める
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(HAND_SS), "-t", str(HAND_LEN), "-i", os.path.join(RAW, "file_hands.mov"), "-vn",
                    "-af", f"highpass=f=180,lowpass=f=11000,afade=t=out:st={HAND_LEN - HAND_FADE}:d={HAND_FADE}", "-ar", "48000", "-ac", "2", os.path.join(OUT, "hand_sound.wav")], check=True)


# ================================================================ 材料と道具
# [ファイル, はじめのこま, おわりのこま, 速さ]：置く所だけ（24 こま／秒の元のこまの番号）。stone は parts2 の頭で見える
PARTS = [("parts2_metal.mov", 2, 24, 1.15), ("parts3_files.mov", 3, 26, 1.15), ("parts4_tools.mov", 5, 29, 1.15)]
HOLD_LAST = None  # 残りは最後の形のまま（parts4 の、手が抜けたあとの本物のこまを流す）
PARTS_LEN = 4.0    # 置き終わって 1 拍以上おいてから、指輪に切り替わる
PAPER = 0.12       # 紙のまん中の明るさ（リニア）。sRGB で 約 0.38
TINT = (1.0, 0.965, 0.90)  # 手元の暖かい光に寄せる


def poly_field(img):
    """何も置いていない紙の明るさのむらを、なめらかな面で近づける（リニア）。3 色それぞれ"""
    h, w = img.shape[:2]
    ys, xs = np.mgrid[0:h:12, 0:w:12]
    u, v = xs / w - 0.5, ys / h - 0.5
    terms = [u ** i * v ** j for i in range(5) for j in range(5 - i)]
    A = np.stack([t.ravel() for t in terms], 1)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    U, V = xx / w - 0.5, yy / h - 0.5
    out = np.zeros_like(img)
    for c in range(3):
        b = img[::12, ::12, c].ravel()
        co, *_ = np.linalg.lstsq(A, b, rcond=None)
        out[..., c] = sum(k * (U ** i * V ** j) for k, (i, j) in zip(co, [(i, j) for i in range(5) for j in range(5 - i)]))
    return np.maximum(out, 1e-3)


def parts():
    empty = lin(read("parts1_stone.mov", 0, 0.3)).mean(axis=0)
    F = poly_field(empty)
    patch = lambda a: a[10:150, 1520:1880].mean(axis=(0, 1))  # 紙の右上（どのこまでも何も来ない所）。3 色  # noqa: E731
    p0 = patch(empty)
    # 当て直す光：まん中が明るく、まわりは黒へ（窓のふちを切らずに、黒い画面に溶ける）
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx - W * 0.5) / (W * 0.60)) ** 2 + ((yy - H * 0.5) / (H * 0.66)) ** 2)
    u = np.clip((r - 0.35) / 0.65, 0, 1)
    L = PAPER * (1 - u * u * (3 - 2 * u)) ** 1.25
    L = np.stack([L * t for t in TINT], 2).astype(np.float32)
    frames = []
    for name, a, b, sp in PARTS:
        arr = read(name)
        for i in np.arange(a, b, 24 / FPS * sp):
            f = lin(arr[min(arr.shape[0] - 1, int(round(i)))])
            g = patch(f) / p0  # カメラが明るさを変えた分
            R = f / (F * g[None, None, :])
            R = np.clip(R, 0, 1.25)
            frames.append(enc(np.power(R, 1.25) * L))
    n = int(PARTS_LEN * FPS)
    # 足りない分は、最後の本物のこまの続きで埋める（止めない）
    arr = read("parts4_tools.mov")
    j = PARTS[-1][2]
    while len(frames) < n:
        j += 24 / FPS
        f = lin(arr[min(arr.shape[0] - 1, int(round(j)))])
        g = patch(f) / p0
        R = np.clip(f / (F * g[None, None, :]), 0, 1.25)
        frames.append(enc(np.power(R, 1.25) * L))
    write(frames[:n] if len(frames) >= n else frames, "parts.mov")


# ================================================================ 完成した指輪（1.5 秒ほど使う）
FIN_LEN = 2.0
STONE_AT = (1167, 423)      # 映像の中で、三角の石を置いた所（1920 × 1080）
MM_PX = 10.0                # 映像の中の 1 mm（石の長辺 8.88 mm が 約 88 px）。本当の大きさのまま
FIN_TURN = -14              # 少し回して置く（まっすぐだと、図のように見える）
FIN_GAIN = 0.92


def relight():
    """紙のむら・カメラの明るさのゆれを除いて、光を当て直す道具（parts と同じ）"""
    empty = lin(read("parts1_stone.mov", 0, 0.3)).mean(axis=0)
    F = poly_field(empty)
    patch = lambda a: a[10:150, 1520:1880].mean(axis=(0, 1))  # noqa: E731
    p0 = patch(empty)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx - W * 0.5) / (W * 0.60)) ** 2 + ((yy - H * 0.5) / (H * 0.66)) ** 2)
    u = np.clip((r - 0.35) / 0.65, 0, 1)
    L = PAPER * (1 - u * u * (3 - 2 * u)) ** 1.25
    L = np.stack([L * t for t in TINT], 2).astype(np.float32)

    def one(f):
        g = patch(f) / p0
        R = np.clip(f / (F * g[None, None, :]), 0, 1.25)
        return np.power(R, 1.25) * L

    return empty, one


def finished():
    empty, one = relight()
    real = os.path.join(RAW, "finished.mov")
    if os.path.exists(real):
        arr = read("finished.mov", None, None, FPS)
        write([enc(one(lin(f))) for f in arr], "finished.mov")
        return
    from PIL import Image, ImageFilter
    import json as _j
    S = os.path.join(WORK, "story", "finished8")
    info = _j.load(open(os.path.join(S, "info.json")))
    B = Image.open(os.path.join(S, "0000.jpg")).convert("RGB")
    Wh = Image.open(os.path.join(S, "0001.jpg")).convert("RGB")
    pxmm = info["pxmm"] * 2  # こまは 2 倍の細かさ
    k = MM_PX / pxmm
    size = (int(B.width * k), int(B.height * k))
    B = B.resize(size, Image.LANCZOS)
    Wh = Wh.resize(size, Image.LANCZOS)
    cx, cy = info["stone"][0] * 2 * k, info["stone"][1] * 2 * k
    b = np.asarray(B, np.float32) / 255.0
    w = np.asarray(Wh, np.float32) / 255.0
    alpha = np.clip(1 - (w - b).mean(axis=2), 0, 1)
    alpha[alpha < 0.02] = 0
    alpha[:, : int(640 * 2 * k) + 1] = 0  # 3D の所（.gl）の外は、ページの黒。指輪ではない
    # 指輪を回して、石のまん中を、映像の石の場所へ
    A_ = Image.fromarray((alpha * 255).astype(np.uint8), "L").rotate(FIN_TURN, Image.BICUBIC, center=(cx, cy))
    C_ = Image.fromarray((b * 255).astype(np.uint8), "RGB").rotate(FIN_TURN, Image.BICUBIC, center=(cx, cy))
    ox, oy = int(round(STONE_AT[0] - cx)), int(round(STONE_AT[1] - cy))
    layerA = Image.new("L", (W, H), 0)
    layerA.paste(A_, (ox, oy))
    layerC = Image.new("RGB", (W, H), (0, 0, 0))
    layerC.paste(C_, (ox, oy))
    plate = enc(one(empty)).astype(np.float32) / 255.0
    # 紙に落ちる、やわらかい影（映像の影と同じ、右下へ）
    sh = np.asarray(layerA.point(lambda v: min(255, int(v * 1.6))).filter(ImageFilter.GaussianBlur(9)), np.float32) / 255.0
    sh = np.roll(np.roll(sh, 12, axis=0), 9, axis=1)
    plate2 = plate * (1 - 0.55 * sh[..., None])
    a = np.asarray(layerA, np.float32)[..., None] / 255.0
    c = np.asarray(layerC, np.float32) / 255.0
    out = np.clip(c * FIN_GAIN + (1 - a) * plate2, 0, 1)
    img = (out * 255 + 0.5).astype(np.uint8)
    write([img] * int(FIN_LEN * FPS), "kari_finished.mov")


if __name__ == "__main__":
    what = sys.argv[1:] or ["hands", "parts", "finished"]
    if "hands" in what:
        hands()
    if "parts" in what:
        parts()
    if "finished" in what:
        finished()
