# 継ぐの動画を、1 こまずつ組む（最終案）。
# 台本（final.json）は「拍」で書く（120 拍／分 → 1 拍 0.5 秒）。切り替え・寄り・大きな言葉が、みな拍の上に乗る。
#  - 本物の画面（story/<章>/、3200×1800 の JPEG）の上を、見せたい所へなめらかに動くカメラ（傾き・速いときのぶれ付き）
#  - 場面のつなぎ（切る・重ねる・寄って抜ける・横に流す・白く光る・黒をはさむ）
#  - 大きな日本語（1 語ずつ、拍ごとに、奥から手前へ）、下の見出し、数字の札、Claude の札、出どころ
#  - 効果音の合図（押した所・打った所・つなぎ）を cues.json に書く（音は bgm3.py・sfx.py が作る）
# 使い方：python -I reel.py final.json 出力.mp4 [並べる数]
import json, math, os, subprocess, sys, unicodedata
from functools import lru_cache
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
WORK = os.environ.get("TSUGU_VIDEO_WORK", os.path.join(HERE, "work"))
W, H, FPS = 1920, 1080, 30
SW, SH = 3200, 1800
FULL_S = W / SW  # 画面全体がちょうど入る倍率

TL = None
BEAT = 0.5


def sec(b):
    return b * BEAT


# ---------------------------------------------------------------- 字
FONT_DIR = "/System/Library/Fonts"
_font_files = {unicodedata.normalize("NFC", f): os.path.join(FONT_DIR, f) for f in os.listdir(FONT_DIR)}
FONT_NAMES = {
    "g1": "ヒラギノ角ゴシック W1.ttc", "g2": "ヒラギノ角ゴシック W2.ttc", "g3": "ヒラギノ角ゴシック W3.ttc", "g4": "ヒラギノ角ゴシック W4.ttc",
    "g5": "ヒラギノ角ゴシック W5.ttc", "g6": "ヒラギノ角ゴシック W6.ttc", "g7": "ヒラギノ角ゴシック W7.ttc", "g8": "ヒラギノ角ゴシック W8.ttc",
    "m3": "ヒラギノ明朝 ProN.ttc", "m6": "ヒラギノ明朝 ProN.ttc",
}


@lru_cache(maxsize=64)
def font(key, size):
    path = _font_files[unicodedata.normalize("NFC", FONT_NAMES[key])]
    index = 2 if key == "m6" else 0  # 明朝の ttc：0 ＝ ProN W3、2 ＝ ProN W6
    try:
        return ImageFont.truetype(path, size, index=index, layout_engine=ImageFont.Layout.RAQM)
    except OSError:
        return ImageFont.truetype(path, size, index=0, layout_engine=ImageFont.Layout.RAQM)


def hexrgb(c):
    c = c.lstrip("#")
    return tuple(int(c[i : i + 2], 16) for i in (0, 2, 4))


@lru_cache(maxsize=512)
def token_img(text, fkey, size, color, track=0.0, glow=False):
    """1 つの言葉を、透明の上に描く（文字の詰め palt。高さは、同じ大きさならいつも同じ）"""
    f = font(fkey, size)
    asc, desc = f.getmetrics()
    pad = int(size * 0.25)
    if track:
        widths = [f.getlength(ch, features=["palt"]) + track * size for ch in text]
        tw = sum(widths)
    else:
        tw = f.getlength(text, features=["palt"])
    im = Image.new("RGBA", (int(tw) + pad * 2, asc + desc + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    col = hexrgb(color) + (255,)
    if track:
        x = pad
        for ch, w in zip(text, widths):
            d.text((x, pad + asc), ch, font=f, fill=col, anchor="ls", features=["palt"])
            x += w
    else:
        d.text((pad, pad + asc), text, font=f, fill=col, anchor="ls", features=["palt"])
    if glow:
        g = im.filter(ImageFilter.GaussianBlur(size * 0.18))
        im = Image.alpha_composite(g, im)
    return im, pad, asc, desc


# ---------------------------------------------------------------- 動きの形
def clamp01(u):
    return 0.0 if u < 0 else 1.0 if u > 1 else u


def ease_io(u):
    u = clamp01(u)
    return u * u * u * (u * (u * 6 - 15) + 10)


def ease_out(u):
    u = clamp01(u)
    return 1 - (1 - u) ** 3


def ease_in(u):
    u = clamp01(u)
    return u ** 3


def ease_back(u):
    u = clamp01(u)
    c1, c3 = 1.4, 2.4
    return 1 + c3 * (u - 1) ** 3 + c1 * (u - 1) ** 2


EASES = {"io": ease_io, "out": ease_out, "in": ease_in, "lin": clamp01, "back": ease_back}

# ---------------------------------------------------------------- 本物の画面（章）
_meta = {}


def meta(ch):
    if ch not in _meta:
        with open(os.path.join(WORK, "story", ch, "meta.json")) as f:
            _meta[ch] = json.load(f)
    return _meta[ch]


def frame_ref(ch, v):
    """こまの番号：数・区切りの名前・「名前+5」"""
    if isinstance(v, (int, float)):
        return float(v)
    m = meta(ch)["marks"]
    for op in ("+", "-"):
        if op in v:
            k, n = v.split(op)
            base = m[k] if k in m else float(k)
            return base + float(n) * (1 if op == "+" else -1)
    return float(m[v])


@lru_cache(maxsize=24)
def load_frame(ch, idx, scale):
    """scale：1 ＝ 3200×1800、2 ＝ 1600×900（JPEG を小さく読むと速い）"""
    p = os.path.join(WORK, "story", ch, f"{idx:04d}.jpg")
    im = Image.open(p)
    if scale > 1:
        im.draft("RGB", (SW // scale, SH // scale))
    return im.convert("RGB")


def view_of(ch, v):
    """カメラの向き → (中心 x, 中心 y, 倍率 s, 傾き rx, ry, 回り roll)。座標は 3200×1800 の画像の px"""
    if isinstance(v, dict):
        base = v.get("v", v.get("box", "full"))
        pad = v.get("pad", 0.12)
        cx, cy, s = rect_view(ch, base, pad)
        s *= v.get("z", 1.0)
        cx += v.get("dx", 0) * 2
        cy += v.get("dy", 0) * 2
        return (cx, cy, s, v.get("rx", 0.0), v.get("ry", 0.0), v.get("roll", 0.0))
    cx, cy, s = rect_view(ch, v, 0.12)
    return (cx, cy, s, 0.0, 0.0, 0.0)


def rect_view(ch, v, pad):
    if v == "full":
        return (SW / 2, SH / 2, FULL_S)
    if isinstance(v, str) and v.startswith("win"):
        k = float(v.split(":")[1]) if ":" in v else 0.86
        return (SW / 2, SH / 2, FULL_S * k)
    if isinstance(v, str):
        b = meta(ch)["boxes"][v]
        x, y, w, h = b["x"], b["y"], b["w"], b["h"]
    else:
        x, y, w, h = v
    x, y, w, h = x * 2, y * 2, w * 2, h * 2
    cx, cy = x + w / 2, y + h / 2
    w2, h2 = w * (1 + pad), h * (1 + pad)
    s = min(W / w2, H / h2)
    return (cx, cy, s)


def clamp_view(cx, cy, s):
    """寄っているときは、画像の外（黒）が映らないように中心を寄せる"""
    if s >= FULL_S * 0.999:
        hw, hh = W / (2 * s), H / (2 * s)
        cx = min(max(cx, hw), SW - hw)
        cy = min(max(cy, hh), SH - hh)
    else:
        # 引いているとき（浮いた画面）は、まん中へ
        k = clamp01((FULL_S - s) / (FULL_S * 0.08))
        cx = cx + (SW / 2 - cx) * k
        cy = cy + (SH / 2 - cy) * k
    return cx, cy


def cam_at(clip, tl):
    """拍 tl（場面の頭から）のカメラ"""
    ch = clip["ch"]
    keys = clip.get("cam") or [[0, "full"], [clip["len"], {"v": "full", "z": 1.04}]]
    ks = [(k[0], view_of(ch, k[1]), k[2] if len(k) > 2 else "io") for k in keys]
    if tl <= ks[0][0]:
        v = ks[0][1]
    elif tl >= ks[-1][0]:
        v = ks[-1][1]
    else:
        for (t0, v0, _), (t1, v1, e) in zip(ks, ks[1:]):
            if t0 <= tl <= t1:
                u = EASES[e]((tl - t0) / max(1e-6, t1 - t0))
                v = tuple(
                    math.exp(math.log(v0[i]) + (math.log(v1[i]) - math.log(v0[i])) * u) if i == 2 else v0[i] + (v1[i] - v0[i]) * u
                    for i in range(6)
                )
                break
    cx, cy, s, rx, ry, roll = v
    # まわりの動き（止まった画面を作らない）：ごくゆっくり寄る
    drift = clip.get("drift", 0.02)
    s *= 1 + drift * clamp01(tl / max(1e-6, clip["len"]))
    cx, cy = clamp_view(cx, cy, s)
    return (cx, cy, s, rx, ry, roll)


def src_index(clip, tl):
    ch = clip["ch"]
    n = meta(ch)["frames"]
    if "ramp" in clip:
        pts = [(p[0], frame_ref(ch, p[1])) for p in clip["ramp"]]
        if tl <= pts[0][0]:
            f = pts[0][1]
        elif tl >= pts[-1][0]:
            f = pts[-1][1] + (tl - pts[-1][0]) * BEAT * FPS * clip.get("tail", 0)
        else:
            for (a0, f0), (a1, f1) in zip(pts, pts[1:]):
                if a0 <= tl <= a1:
                    f = f0 + (f1 - f0) * (tl - a0) / max(1e-6, a1 - a0)
                    break
    else:
        f0 = frame_ref(ch, clip.get("from", 0))
        f = f0 + (0 if clip.get("hold") else tl * BEAT * FPS * clip.get("speed", 1.0))
    return int(min(max(0, round(f)), n - 1))


def homography(src_pts, dst_pts):
    """dst（出力の px）→ src（元の画像の px）の写し方（PIL の PERSPECTIVE の 8 つの数）"""
    A, b = [], []
    for (x, y), (u, v) in zip(dst_pts, src_pts):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    return np.linalg.solve(np.array(A, float), np.array(b, float)).tolist()


def project(cam, pts):
    """元の画像の点 → 出力の点（傾いた板を、少しの遠近で）"""
    cx, cy, s, rx, ry, roll = cam
    f = 2200.0
    ax, ay, az = math.radians(rx), math.radians(ry), math.radians(roll)
    out = []
    for u, v in pts:
        X, Y, Z = (u - cx) * s, (v - cy) * s, 0.0
        X, Y = X * math.cos(az) - Y * math.sin(az), X * math.sin(az) + Y * math.cos(az)
        Y, Z = Y * math.cos(ax) - Z * math.sin(ax), Y * math.sin(ax) + Z * math.cos(ax)
        X, Z = X * math.cos(ay) + Z * math.sin(ay), -X * math.sin(ay) + Z * math.cos(ay)
        k = f / (f + Z)
        out.append((W / 2 + X * k, H / 2 + Y * k))
    return out


def render_view(ch, idx, cam, border=True):
    cx, cy, s, rx, ry, roll = cam
    scale = 2 if s < FULL_S * 0.92 else 1
    im = load_frame(ch, idx, scale)
    sw, sh = im.size
    k = sw / SW  # 読んだ画像の px ／ 3200 の px
    tilted = abs(rx) > 0.05 or abs(ry) > 0.05 or abs(roll) > 0.05
    if not tilted:
        hw, hh = W / (2 * s), H / (2 * s)
        x0, y0, x1, y1 = cx - hw, cy - hh, cx + hw, cy + hh
        if x0 >= -0.5 and y0 >= -0.5 and x1 <= SW + 0.5 and y1 <= SH + 0.5:
            box = (max(0, x0 * k), max(0, y0 * k), min(sw, x1 * k), min(sh, y1 * k))
            return im.resize((W, H), Image.BICUBIC, box=box, reducing_gap=2.5)
        # 浮いた画面：黒の上に置く
        out = Image.new("RGB", (W, H), (0, 0, 0))
        dw, dh = int(round(SW * s)), int(round(SH * s))
        ox, oy = int(round(W / 2 - cx * s)), int(round(H / 2 - cy * s))
        small = im.resize((dw, dh), Image.BICUBIC, reducing_gap=2.5)
        out.paste(small, (ox, oy))
        if border:
            d = ImageDraw.Draw(out)
            d.rectangle([ox - 1, oy - 1, ox + dw, oy + dh], outline=(58, 58, 62), width=1)
        return out
    corners = [(0, 0), (SW, 0), (SW, SH), (0, SH)]
    quad = project(cam, corners)
    coeffs = homography([(x * k, y * k) for x, y in corners], quad)
    out = im.transform((W, H), Image.PERSPECTIVE, coeffs, Image.BICUBIC, fillcolor=(0, 0, 0))
    if border:
        d = ImageDraw.Draw(out)
        d.line(quad + [quad[0]], fill=(58, 58, 62), width=1)
    return out


def render_story(clip, tl):
    ch = clip["ch"]
    idx = src_index(clip, tl)
    cam = cam_at(clip, tl)
    # 速く動くときは、少しぶらす（こまの間を 3〜5 回描いて重ねる）
    dt = 1.0 / FPS / BEAT
    c0, c1 = cam_at(clip, tl - dt * 0.5), cam_at(clip, tl + dt * 0.5)
    move = max(abs(c1[0] - c0[0]) * cam[2], abs(c1[1] - c0[1]) * cam[2], abs(math.log(c1[2] / c0[2])) * 900, abs(c1[3] - c0[3]) * 40, abs(c1[4] - c0[4]) * 40)
    if move < 20 or clip.get("noblur"):
        img = render_view(ch, idx, cam)
    else:
        # 大きく動くときは、重ねる数を増やす（少ないと、二重・三重に見える）
        n = 3 if move < 45 else min(15, int(move / 9) | 1)
        acc = None
        for j in range(n):
            u = (j / (n - 1) - 0.5) * 0.6
            c = cam_at(clip, tl + dt * u)
            a = np.asarray(render_view(ch, idx, c), dtype=np.float32)
            acc = a if acc is None else acc + a
        img = Image.fromarray((acc / n).astype(np.uint8))
    return img


# ---------------------------------------------------------------- 静止画（公開の画像など）
@lru_cache(maxsize=8)
def load_img(path):
    p = path if os.path.isabs(path) else os.path.join(REPO, path)
    return Image.open(p).convert("RGB")


def render_img(clip, tl):
    im = load_img(clip["img"])
    iw, ih = im.size
    keys = clip.get("cam") or [[0, [0, 0, 1, 1]], [clip["len"], [0.03, 0.03, 0.94, 0.94]]]

    def rect_at(t):
        if t <= keys[0][0]:
            return keys[0][1]
        if t >= keys[-1][0]:
            return keys[-1][1]
        for (t0, r0), (t1, r1) in zip(keys, keys[1:]):
            if t0 <= t <= t1:
                u = ease_io((t - t0) / max(1e-6, t1 - t0)) if clip.get("ease", "lin") == "io" else clamp01((t - t0) / max(1e-6, t1 - t0))
                return [r0[i] + (r1[i] - r0[i]) * u for i in range(4)]

    x, y, w, h = rect_at(tl)
    fit = clip.get("fit", "cover")
    bx = (x * iw, y * ih, (x + w) * iw, (y + h) * ih)
    bw, bh = bx[2] - bx[0], bx[3] - bx[1]
    if fit == "cover":
        # 枠の比を 16:9 にそろえる（はみ出す方を削る）
        a = W / H
        if bw / bh > a:
            c = (bx[0] + bx[2]) / 2; bw = bh * a; bx = (c - bw / 2, bx[1], c + bw / 2, bx[3])
        else:
            c = (bx[1] + bx[3]) / 2; bh = bw / a; bx = (bx[0], c - bh / 2, bx[2], c + bh / 2)
        return im.resize((W, H), Image.BICUBIC, box=bx, reducing_gap=2.5)
    # contain：黒の上に、area（出力の枠）の中へ収める
    ax, ay, aw, ah = clip.get("area", [0, 0, W, H])
    s = min(aw / bw, ah / bh)
    dw, dh = int(bw * s), int(bh * s)
    out = Image.new("RGB", (W, H), (0, 0, 0))
    out.paste(im.resize((dw, dh), Image.BICUBIC, box=bx, reducing_gap=2.5), (int(ax + (aw - dw) / 2), int(ay + (ah - dh) / 2)))
    return out


# ---------------------------------------------------------------- 左右に並べる
def render_split(clip, tl):
    out = Image.new("RGB", (W, H), (0, 0, 0))
    gap = 12
    half = (W - gap) // 2
    for side, sub in enumerate(clip["sides"]):
        sub = dict(sub)
        sub.setdefault("len", clip["len"])
        im = render_story(sub, tl)
        # 右と左で、指輪の所を真ん中に：出力の真ん中の half 幅を切る
        x0 = (W - half) // 2
        out.paste(im.crop((x0, 0, x0 + half, H)), (side * (half + gap), 0))
    return out


# ---------------------------------------------------------------- 作者の素材（あれば）
def footage_dir(name):
    d = os.path.join(WORK, "footage")
    if not os.path.isdir(d):
        return None
    for f in sorted(os.listdir(d)):
        if f.startswith(name) and f.lower().endswith((".mov", ".mp4", ".m4v")):
            out = os.path.join(WORK, "footage", f"_{name}")
            if not os.path.isdir(out) or not os.listdir(out):
                os.makedirs(out, exist_ok=True)
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(d, f), "-vf", f"fps={FPS},scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}", "-q:v", "3", os.path.join(out, "%05d.jpg")], check=True)
            return out
    return None


def render_foot(clip, tl):
    d = footage_dir(clip["foot"])
    if d is None:
        return render_clip(clip["fallback"] | {"len": clip["len"]}, tl)
    fs = sorted(os.listdir(d))
    mid = max(0, (len(fs) - int(sec(clip["len"]) * FPS)) // 2)
    i = min(len(fs) - 1, mid + int(sec(tl) * FPS))
    return Image.open(os.path.join(d, fs[i])).convert("RGB")


def render_clip(clip, tl):
    k = clip.get("kind")
    if k == "black":
        return Image.new("RGB", (W, H), tuple(clip.get("color", (0, 0, 0))))
    if k == "img":
        return render_img(clip, tl)
    if k == "split":
        return render_split(clip, tl)
    if k == "foot":
        return render_foot(clip, tl)
    return render_story(clip, tl)


def grade(img, clip, tl):
    g = clip.get("grade")
    if not g:
        return img
    a = np.asarray(img, dtype=np.float32)
    if g.get("dim") is not None:
        d = g["dim"]
        if isinstance(d, list):  # [はじめ, おわり]
            d = d[0] + (d[1] - d[0]) * clamp01(tl / max(1e-6, clip["len"]))
        a = a * (1 - d)
    if g.get("sat") is not None:
        l = a.mean(axis=2, keepdims=True)
        a = l + (a - l) * g["sat"]
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    if g.get("blur"):
        out = out.filter(ImageFilter.GaussianBlur(g["blur"]))
    return out


# ---------------------------------------------------------------- つなぎ
def main_at(t):
    """秒 t の画面（言葉の前）"""
    b = t / BEAT
    clips = TL["clips"]
    cur = None
    for i, c in enumerate(clips):
        if c["at"] <= b < c["at"] + c["len"] or (i == len(clips) - 1 and b >= c["at"]):
            cur = i
    if cur is None:
        return Image.new("RGB", (W, H), (0, 0, 0))
    c = clips[cur]
    tl = b - c["at"]
    img = grade(render_clip(c, tl), c, tl)
    tr = c.get("tr")
    if tr and cur > 0:
        L = tr.get("len", 0.5)
        if tl < L:
            p = clips[cur - 1]
            ptl = b - p["at"]
            u = tl / L
            kind = tr["type"]
            if kind == "xfade":
                prev = grade(render_clip(p, ptl), p, ptl)
                img = Image.blend(prev, img, ease_io(u))
            elif kind == "dip":
                if u < 0.5:
                    prev = grade(render_clip(p, ptl), p, ptl)
                    img = Image.blend(prev, Image.new("RGB", (W, H)), ease_io(u * 2))
                else:
                    img = Image.blend(Image.new("RGB", (W, H)), img, ease_io(u * 2 - 1))
            elif kind == "zoom":
                prev = grade(render_clip(p, ptl), p, ptl)
                img = zoom_through(prev, img, u, tr.get("at", (0.5, 0.5)))
            elif kind == "whip":
                prev = grade(render_clip(p, ptl), p, ptl)
                img = whip(prev, img, u, tr.get("dir", 1))
    return img


def zoom_scale(img, s, cx=0.5, cy=0.5):
    if abs(s - 1) < 1e-3:
        return img
    w, h = W / s, H / s
    x0, y0 = cx * W - w * cx, cy * H - h * cy
    if s > 1:
        return img.resize((W, H), Image.BICUBIC, box=(x0, y0, x0 + w, y0 + h))
    out = Image.new("RGB", (W, H))
    small = img.resize((int(W * s), int(H * s)), Image.BICUBIC)
    out.paste(small, (int(cx * W - W * s * cx), int(cy * H - H * s * cy)))
    return out


def zoom_through(prev, nxt, u, at):
    cx, cy = at
    s1 = 1 + 1.6 * ease_in(u)
    a = zoom_scale(prev, s1, cx, cy)
    b = zoom_scale(nxt, 1.35 - 0.35 * ease_out(u), 0.5, 0.5)
    # 寄るぶれ：少し大きくしたものを重ねる
    if 0.15 < u < 0.85:
        a = Image.blend(a, zoom_scale(a, 1.06, cx, cy), 0.5)
        b = Image.blend(b, zoom_scale(b, 1.04), 0.4)
    return Image.blend(a, b, ease_io((u - 0.25) / 0.5))


def whip(prev, nxt, u, d):
    e = ease_io(u)
    off = int(e * W) * d
    out = Image.new("RGB", (W, H))
    out.paste(prev, (-off, 0))
    out.paste(nxt, (W * d - off, 0))
    sp = abs(math.sin(math.pi * u))
    if sp > 0.05:
        a = np.asarray(out, dtype=np.float32)
        r = int(10 + 70 * sp)
        k = np.cumsum(a, axis=1)
        b = (k[:, r:] - k[:, :-r]) / r
        a[:, r // 2 : r // 2 + b.shape[1]] = b
        out = Image.fromarray(a.astype(np.uint8))
    return out


# ---------------------------------------------------------------- 言葉
def place(base, tok, x, y, scale=1.0, alpha=1.0, blur=0.0):
    """tok（RGBA）を、(x, y) を左上の基準に scale 倍で置く"""
    if alpha <= 0.003:
        return
    im = tok
    if abs(scale - 1) > 0.002:
        im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.BICUBIC)
    if blur > 0.3:
        im = im.filter(ImageFilter.GaussianBlur(blur))
    if alpha < 0.999:
        a = im.getchannel("A").point(lambda v: int(v * alpha))
        im = im.copy(); im.putalpha(a)
    base.alpha_composite(im, (int(round(x)), int(round(y))))


def scrim(img, kind, amount=1.0):
    a = np.asarray(img, dtype=np.float32)
    if kind == "bottom":
        g = np.clip((np.arange(H) - H * 0.52) / (H * 0.48), 0, 1) ** 1.3
        a *= (1 - 0.82 * amount * g)[:, None, None]
    elif kind == "left":
        g = np.clip(1 - np.arange(W) / (W * 0.62), 0, 1) ** 1.2
        a *= (1 - 0.8 * amount * g)[None, :, None]
    elif kind == "left2":
        g = np.clip(1 - (np.arange(W) - W * 0.5) / (W * 0.18), 0, 1) ** 1.5
        a *= (1 - 0.96 * amount * g)[None, :, None]
    elif kind == "all":
        a *= 1 - 0.62 * amount
    return Image.fromarray(a.astype(np.uint8))


def glass(img, box, amount=1.0, radius=18):
    """数字の札の下を、ぼかして暗くする（画面の字と重ならないように）"""
    x0, y0, x1, y1 = [int(v) for v in box]
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
    if x1 <= x0 or y1 <= y0:
        return img
    region = img.crop((x0, y0, x1, y1)).filter(ImageFilter.GaussianBlur(radius))
    a = np.asarray(region, dtype=np.float32) * (1 - 0.6 * amount) + 10 * amount
    region = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    mask = Image.new("L", region.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, region.width - 1, region.height - 1], radius=radius, fill=int(255 * min(1, amount)))
    img.paste(region, (x0, y0), mask)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([x0, y0, x1 - 1, y1 - 1], radius=radius, outline=tuple(int(v * amount) for v in (70, 70, 74)), width=1)
    return img


def layout_line(toks, gap):
    w = sum(t[0].width - 2 * t[1] for t in toks) + gap * (len(toks) - 1)
    return w


def card_alpha(card, b):
    """札全体の出入り（拍）"""
    t0, t1 = card["at"], card["at"] + card["len"]
    fi, fo = card.get("fin", 0.0), card.get("fout", 0.35)
    if b < t0 or b > t1:
        return 0.0
    a = 1.0
    if fi > 0:
        a = min(a, ease_out((b - t0) / fi))
    if fo > 0:
        a = min(a, ease_io((t1 - b) / fo))
    return a


def tok_anim(style, tb, life):
    """言葉 1 つの動き（tb：その言葉が出てからの秒）。返り値：倍率・濃さ・ぼかし・上下のずれ"""
    if tb < 0:
        return None
    if style == "depth":
        u = clamp01(tb / 0.32)
        e = ease_out(u)
        return (0.78 + 0.22 * e + 0.035 * clamp01(tb / max(0.5, life)), e, 9 * (1 - e), 0)
    if style == "near":
        u = clamp01(tb / 0.28)
        e = ease_out(u)
        return (1.5 - 0.5 * e + 0.03 * clamp01(tb / max(0.5, life)), e, 12 * (1 - e), 0)
    if style == "rise":
        u = clamp01(tb / 0.4)
        e = ease_out(u)
        return (1.0, e, 4 * (1 - e), 26 * (1 - e))
    if style == "pop":
        u = clamp01(tb / 0.3)
        return (0.6 + 0.4 * ease_back(u), clamp01(u * 2.5), 0, 0)
    if style == "fade":
        u = clamp01(tb / 0.5)
        return (1.0, ease_io(u), 0, 0)
    return (1.0, 1.0, 0, 0)


def draw_card(img, card, t):
    b = t / BEAT
    A = card_alpha(card, b)
    if A <= 0:
        return img
    mode = card.get("mode", "stack")
    fk, size, color = card.get("font", "g3"), card.get("size", 96), card.get("color", "#f5f5f7")
    style = card.get("anim", "depth")
    tb0 = b - card["at"]
    if card.get("scrim"):
        img = scrim(img, card["scrim"], A * card.get("scrimAmt", 1.0))
    base = img.convert("RGBA")
    if mode in ("stack", "lower", "swap"):
        lines = card["lines"]
        lh = int(size * card.get("lh", 1.42))
        rendered = []
        for ln in lines:
            row = []
            for tok in ln:
                text, at = tok[0], tok[1]
                opt = tok[2] if len(tok) > 2 else {}
                ti = token_img(text, opt.get("font", fk), opt.get("size", size), opt.get("color", color), card.get("track", 0.0), opt.get("glow", False))
                row.append((ti, at, opt))
            rendered.append(row)
        if mode == "swap":
            # 1 つずつ入れ替わる（前の言葉は手前へ抜ける）
            flat = [(ti, at, opt) for row in rendered for (ti, at, opt) in row]
            for k, (ti, at, opt) in enumerate(flat):
                nxt = flat[k + 1][1] if k + 1 < len(flat) else card["len"]
                tb = sec(tb0 - at)
                if tb0 < at or tb0 > nxt + 0.6:
                    continue
                im, pad, asc, desc = ti
                life = sec(nxt - at)
                an = tok_anim(opt.get("anim", style), tb, life)
                s, a, bl, dy = an
                if tb0 > nxt:  # 抜ける
                    u = clamp01(sec(tb0 - nxt) / 0.22)
                    s *= 1 + 0.5 * ease_in(u); a *= 1 - u; bl += 10 * u
                cx, cy = card.get("pos", (W / 2, H / 2))
                x = cx - im.width * s / 2
                y = cy - im.height * s / 2 + dy
                place(base, im, x, y, s, a * A, bl)
        else:
            gap = card.get("gap", 0)
            total_h = lh * len(rendered)
            if mode == "lower":
                x_left, y_top = card.get("pos", (120, H - 140 - total_h))
            else:
                cx, cy = card.get("pos", (W / 2, H / 2))
                y_top = cy - total_h / 2
            for li, row in enumerate(rendered):
                lw = sum(ti[0].width - 2 * ti[1] for (ti, _, _) in row) + gap * (len(row) - 1)
                if mode == "lower" or card.get("align") == "left":
                    x = x_left if mode == "lower" else card.get("pos")[0]
                else:
                    x = cx - lw / 2
                for ti, at, opt in row:
                    im, pad, asc, desc = ti
                    tb = sec(tb0 - at)
                    an = tok_anim(opt.get("anim", style), tb, sec(card["len"] - at))
                    w_tok = im.width - 2 * pad
                    if an:
                        s, a, bl, dy = an
                        # 言葉の真ん中を軸に大きさを変える
                        ox = x + w_tok / 2 - im.width * s / 2
                        oy = y_top + li * lh + lh / 2 - im.height * s / 2 + dy + (lh - im.height) * 0
                        place(base, im, ox, oy, s, a * A, bl)
                    x += w_tok + gap
    elif mode == "call":
        # 数字の札：下をぼかして暗くし、その上に大きな数字と小さな説明
        x, y = card["pos"]
        lab = card.get("label")
        main = token_img(card["text"], fk, size, color, 0.0, False)
        sub = token_img(lab, "g5", max(24, int(size * 0.36)), "#d0d0d4") if lab else None
        mw = main[0].width - 2 * main[1]
        sw_ = (sub[0].width - 2 * sub[1]) if sub else 0
        bw = max(mw, sw_) + 64
        bh = int(size * 1.25) + (int(size * 0.58) if sub else 0) + 30
        if card.get("anchor") == "c":
            x -= bw / 2
        tb = sec(tb0)
        an = tok_anim(style, tb, sec(card["len"])) or (1, 1, 0, 0)
        s, a, bl, dy = an
        img2 = base.convert("RGB")
        img2 = glass(img2, (x, y + dy, x + bw, y + dy + bh), a * A, card.get("radius", 22))
        base = img2.convert("RGBA")
        yy = y + dy + 14
        if sub:
            place(base, sub[0], x + 32 - sub[1], yy - sub[1] * 0.6, 1.0, a * A, 0)
            yy += int(size * 0.5)
        place(base, main[0], x + 32 - main[1] + mw * (1 - s) / 2, yy - main[1] * 0.75, s, a * A, bl)
    elif mode == "tag":
        # Claude の札：右上に小さく（本物の Claude が動いている所）
        txt = card["text"]
        ti = token_img(txt, "g5", 26, "#f5f5f7")
        nm = token_img("Claude", "g7", 26, "#ffffff")
        x1 = W - 64
        tw = ti[0].width - 2 * ti[1]
        nw = nm[0].width - 2 * nm[1]
        bw = 24 + 20 + nw + 12 + tw + 28
        x0 = x1 - bw
        y0 = card.get("y", 40)
        tb = sec(tb0)
        u = ease_out(clamp01(tb / 0.35))
        a = u * A
        img2 = base.convert("RGB")
        img2 = glass(img2, (x0, y0, x1, y0 + 56), a, 28)
        d = ImageDraw.Draw(img2)
        ccx, ccy = x0 + 30, y0 + 28
        r = 8 + 2 * math.sin(tb * 6)
        d.ellipse([ccx - r, ccy - r, ccx + r, ccy + r], fill=tuple(int(c * a) for c in (217, 119, 87)))
        base = img2.convert("RGBA")
        place(base, nm[0], ccx + 20 - nm[1], y0 + 28 - nm[0].height / 2, 1, a, 0)
        place(base, ti[0], ccx + 20 + nw + 12 - ti[1], y0 + 28 - ti[0].height / 2, 1, a * 0.92, 0)
    elif mode == "src":
        ti = token_img(card["text"], "g3", card.get("size", 22), card.get("color", "#8e8e93"))
        x, y = card.get("pos", (120, H - 70))
        place(base, ti[0], x - ti[1], y - ti[0].height / 2, 1, A * 0.95, 0)
    elif mode == "count":
        # 数が変わっていく（作り手の数など）
        u = ease_io(clamp01((sec(tb0) - card.get("delay", 0.4)) / card.get("dur", 2.4)))
        v = card["from"] + (card["to"] - card["from"]) * u
        txt = card.get("fmt", "{:.1f}").format(v)
        ti = token_img(txt, fk, size, color)
        x, y = card["pos"]
        an = tok_anim(style, sec(tb0), sec(card["len"]))
        s, a, bl, dy = an
        if card.get("anchor") == "c":
            x -= (ti[0].width - 2 * ti[1]) / 2
        place(base, ti[0], x - ti[1], y - ti[0].height / 2 + dy, s, a * A, bl)
    elif mode == "bar":
        u = ease_io(clamp01((sec(tb0) - card.get("delay", 0.4)) / card.get("dur", 2.4)))
        x, y, w0 = card["pos"][0], card["pos"][1], card["w"]
        w1 = w0 * (card["from"] + (card["to"] - card["from"]) * u) / card["from"]
        d = ImageDraw.Draw(base)
        a = int(255 * A)
        d.rounded_rectangle([x, y, x + w0, y + 16], radius=8, fill=(44, 44, 46, a))
        d.rounded_rectangle([x, y, x + w1, y + 16], radius=8, fill=hexrgb(card.get("color", "#f5f5f7")) + (a,))
    return base.convert("RGB")


def fx_at(img, t):
    b = t / BEAT
    for f in TL.get("fx", []):
        if f["k"] == "flash" and f["at"] <= b < f["at"] + f.get("len", 0.6):
            u = (b - f["at"]) / f.get("len", 0.6)
            amt = f.get("amt", 0.75) * (1 - ease_out(u))
            img = Image.blend(img, Image.new("RGB", (W, H), (255, 255, 255)), amt)
        if f["k"] == "fade" and f["at"] <= b < f["at"] + f.get("len", 2):
            u = clamp01((b - f["at"]) / f.get("len", 2))
            img = Image.blend(img, Image.new("RGB", (W, H)), ease_io(u) if f.get("out", True) else 1 - ease_io(u))
    return img


def frame(n):
    t = n / FPS
    img = main_at(t)
    b = t / BEAT
    for card in TL["text"]:
        if card["at"] <= b <= card["at"] + card["len"]:
            img = draw_card(img, card, t)
    img = fx_at(img, t)
    return img


def work(args):
    global TL, BEAT
    path, out, n0, n1 = args
    with open(path) as f:
        TL = json.load(f)
    BEAT = 60 / TL.get("bpm", 120)
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-g", "60", out], stdin=subprocess.PIPE)
    for n in range(n0, n1):
        p.stdin.write(frame(n).tobytes())
    p.stdin.close()
    p.wait()
    return out


def cues(tl):
    """効果音の合図：押した所・打った所（撮ったこまの記録から）、つなぎ、言葉"""
    global TL, BEAT
    TL = tl
    BEAT = 60 / tl.get("bpm", 120)
    ev = []
    clips = tl["clips"]
    for i, c in enumerate(clips):
        t0 = sec(c["at"])
        tr = c.get("tr", {}).get("type")
        if tr in ("whip", "zoom"):
            ev.append({"k": "whoosh", "at": t0 - 0.08})
        for s in c.get("sfx", []):
            ev.append({"k": s[1], "at": t0 + sec(s[0])})
        if c.get("kind") in (None, "story") and "ch" in c and not c.get("mute"):
            m = meta(c["ch"])
            cur = m.get("cur", [])
            seen = set()
            nb = int(sec(c["len"]) * FPS)
            prev_idx = None
            for k in range(nb):
                tl_ = k / FPS / BEAT
                idx = src_index(c, tl_)
                if idx == prev_idx:
                    continue
                lo = prev_idx + 1 if prev_idx is not None and idx > prev_idx else idx
                for j in range(lo, idx + 1):
                    if j in seen or j >= len(cur):
                        continue
                    seen.add(j)
                    if cur[j][2] >= 0.99:
                        ev.append({"k": "click", "at": t0 + k / FPS})
                prev_idx = idx
            # 打つ音：区切り type〜typed の間、2 こまに 1 字
            for a_, b_ in c.get("keys", []):
                fa, fb = frame_ref(c["ch"], a_), frame_ref(c["ch"], b_)
                last = -1
                for k in range(nb):
                    idx = src_index(c, k / FPS / BEAT)
                    if fa <= idx <= fb and (idx - fa) % 2 == 0 and idx != last:
                        ev.append({"k": "key", "at": t0 + k / FPS})
                        last = idx
    for card in tl["text"]:
        s = card.get("sfx")
        if not s:
            continue
        if card.get("mode") in ("swap", "stack", "lower"):
            for ln in card["lines"]:
                for tok in ln:
                    ev.append({"k": s, "at": sec(card["at"] + tok[1])})
        else:
            ev.append({"k": s, "at": sec(card["at"])})
    for f in tl.get("fx", []):
        if f["k"] == "flash" and f.get("sfx"):
            ev.append({"k": f["sfx"], "at": sec(f["at"])})
    for s in tl.get("sfx", []):
        ev.append({"k": s[1], "at": sec(s[0])})
    ev.sort(key=lambda e: e["at"])
    return ev


if __name__ == "__main__":
    path, out = sys.argv[1], sys.argv[2]
    jobs = int(sys.argv[3]) if len(sys.argv) > 3 else 8
    with open(path) as f:
        tl = json.load(f)
    total = tl["len"] * 60 / tl.get("bpm", 120)
    N = int(round(total * FPS))
    only = os.environ.get("ONLY")  # 試し：「拍のはじめ,拍のおわり」だけ組む
    n0, n1 = 0, N
    if only:
        a_, b_ = [float(x) for x in only.split(",")]
        n0, n1 = int(a_ * 60 / tl.get("bpm", 120) * FPS), int(b_ * 60 / tl.get("bpm", 120) * FPS)
    tmp = os.path.join(WORK, "vc", "_reel")
    os.makedirs(tmp, exist_ok=True)
    step = max(30, (n1 - n0 + jobs - 1) // jobs)
    parts = [(path, os.path.join(tmp, f"p{k:03d}.mp4"), a, min(n1, a + step)) for k, a in enumerate(range(n0, n1, step))]
    with Pool(len(parts)) as pool:
        done = pool.map(work, parts)
    with open(os.path.join(tmp, "list.txt"), "w") as f:
        f.write("".join(f"file '{d}'\n" for d in done))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", os.path.join(tmp, "list.txt"), "-c", "copy", out], check=True)
    ev = cues(tl)
    with open(os.path.splitext(out)[0] + "_cues.json", "w") as f:
        json.dump({"len": total, "sfx": ev}, f, ensure_ascii=False)
    print("できた", out, round((n1 - n0) / FPS, 2), "秒", len(ev), "の効果音")
