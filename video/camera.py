# 2 倍の細かさで撮った画面（3200×1800）の上を、見せたい所へなめらかに動くカメラ。1920×1080 の mp4 にする。
# 使い方：python -I camera.py <章のフォルダ> <カメラの台本.json> <出力.mp4>
# 台本：{"from": 0, "to": 300, "keys": [{"f": こま, "to": "full" | 枠の名前 | [x, y, w, h], "pad": 余白の割合, "move": 動くこま数}]}
# 枠は meta.json の boxes（ページの px）。カメラは、キーのこまから move こまかけて、ゆっくり始まりゆっくり止まる
import json, sys, subprocess, os
from PIL import Image

D, script, out = sys.argv[1], json.load(open(sys.argv[2])), sys.argv[3]
meta = json.load(open(os.path.join(D, "meta.json")))
W, H = 3200, 1800
OW, OH = 1920, 1080
A = OW / OH

def rect_of(to, pad):
    if to == "full":
        return (0, 0, W, H)
    if isinstance(to, str):
        b = meta["boxes"][to]; x, y, w, h = b["x"] * 2, b["y"] * 2, b["w"] * 2, b["h"] * 2
    else:
        x, y, w, h = [v * 2 for v in to]
    cx, cy = x + w / 2, y + h / 2
    w, h = w * (1 + pad), h * (1 + pad)
    if w / h > A: h = w / A
    else: w = h * A
    w = min(w, W); h = min(h, H)
    x = min(max(0, cx - w / 2), W - w); y = min(max(0, cy - h / 2), H - h)
    return (x, y, w, h)

ease = lambda u: u * u * (3 - 2 * u) if u < 1 else 1.0
keys = sorted(script["keys"], key=lambda k: k["f"])
rects = [(k["f"], rect_of(k["to"], k.get("pad", 0.12)), k.get("move", 16)) for k in keys]

def cam(f):
    cur = rects[0][1]
    for i, (kf, r, mv) in enumerate(rects):
        if f < kf: break
        prev = rects[i - 1][1] if i else r
        u = (f - kf) / max(1, mv)
        e = ease(min(1, u))
        cur = tuple(prev[j] + (r[j] - prev[j]) * e for j in range(4))
    return cur

tmp = os.path.join(D, "_cam"); os.makedirs(tmp, exist_ok=True)
a, b = script.get("from", 0), script.get("to", meta["frames"])
for n, f in enumerate(range(a, b)):
    img = Image.open(os.path.join(D, f"{f:04d}.jpg"))
    x, y, w, h = cam(f)
    img.crop((int(x), int(y), int(x + w), int(y + h))).resize((OW, OH), Image.LANCZOS).save(os.path.join(tmp, f"{n:04d}.jpg"), quality=93)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(script.get("fps", 30)), "-i", os.path.join(tmp, "%04d.jpg"), "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", out], check=True)
for fn in os.listdir(tmp): os.remove(os.path.join(tmp, fn))
print("できた", out, b - a, "こま")
