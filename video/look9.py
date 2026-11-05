# 新しい見た目の見本（静止画）を組む。今の動画（reel.py・final_build*.py）には触らない。
# 同じ言葉・同じ素材のまま、割り付けと字と色だけを変えて、「プロの映像に見えるか」を人の目で確かめるためのもの。
# 見本の決まりは video/LOOK9.md。
# 使い方：video/work/.venv/bin/python -I video/look9.py [場面の名前…]（なしなら全部）
#   出す所は環境変数 LOOK9_OUT。字（OFL）は video/work/fonts/ に置く（取り方は LOOK9.md）。
import json, math, os, sys
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
WORK = os.environ.get("TSUGU_VIDEO_WORK", os.path.join(HERE, "work"))
STORY = os.path.join(WORK, "story")
FONTS = os.path.join(WORK, "fonts")
OUT = os.environ.get("LOOK9_OUT", os.path.join(WORK, "look9"))
HERITAGE = os.path.join(REPO, "public", "heritage")
W, H = 1920, 1080
SS = 3  # 字は 3 倍で描いて縮める（細い線がきれいに出る）

# ---------------------------------------------------------------- 色の決まり
# 字は白の 1 種。金は品物だけが持つ（字に金を使わない）。赤は「作れない」だけ。朱は職人の直しの字だけ。
SUMI = (0.027, 0.024, 0.022)  # 墨（ほぼ黒。真っ黒より少しあたたかい）
SHIRO = (0.957, 0.945, 0.918)  # 字の白（黄ばまない程度にあたたかい）
PAPER = (0.925, 0.902, 0.855)  # 紙
INK = (0.086, 0.075, 0.066)  # 紙の上の墨の字
SHU = (0.745, 0.196, 0.118)  # 朱（直しの字）
AKA = (1.0, 0.27, 0.20)  # 赤（アプリの「作れない」）

# ---------------------------------------------------------------- 字の大きさは 5 つだけ（場面ごとに増やさない）
# XL＝題と大きな 1 語、L＝章の扉・帳面の字・品物の名、M＝見出し、S＝添える字、T＝札。クレジットだけ 22
XL, L, M, S, T = 200, 84, 60, 40, 26
# 外の余白（ここの線に、字の端をそろえる）
LEFT, RIGHT, TOP, BOTTOM = 96, W - 96, 96, H - 96

# 字の種類（みな OFL）。min＝しっぽり明朝、thin＝細い明朝（Noto Serif JP 200）、sans＝細いゴシック（Noto Sans JP）
FONT_FILES = {
    "min": ("shipporimincho/ShipporiMincho-Regular.ttf", None),
    "thin": ("notoserifjp/NotoSerifJP[wght].ttf", 200),
    "thin3": ("notoserifjp/NotoSerifJP[wght].ttf", 300),
    "sans2": ("notosansjp/NotoSansJP[wght].ttf", 200),
    "sans": ("notosansjp/NotoSansJP[wght].ttf", 300),
    "sans4": ("notosansjp/NotoSansJP[wght].ttf", 400),
}


@lru_cache(maxsize=128)
def font(key, px):
    path, wght = FONT_FILES[key]
    f = ImageFont.truetype(os.path.join(FONTS, path), px, layout_engine=ImageFont.Layout.RAQM)
    if wght:
        f.set_variation_by_axes([wght])
    return f


# ---------------------------------------------------------------- 板（0〜1 の小数の RGB）
def ground(c=SUMI):
    a = np.zeros((H, W, 3), np.float32)
    a[:] = c
    return a


def to_img(a):
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB")


def from_img(im):
    return np.asarray(im.convert("RGB"), np.float32) / 255.0


def lum(a):
    return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722


def _box(a, r, axis):
    """幅 2r+1 の平均（端はのばす）"""
    if r < 1:
        return a
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r + 1, r)
    c = np.cumsum(np.pad(a, pad, mode="edge"), axis=axis, dtype=np.float64)
    n = a.shape[axis]
    hi = np.take(c, np.arange(2 * r + 1, n + 2 * r + 1), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return ((hi - lo) / (2 * r + 1)).astype(np.float32)


def blur(a, sigma):
    """小数の板をぼかす（箱を 3 回で、ガウスのぼかしの代わり。大きなぼかしは縮めてから）"""
    if sigma <= 0:
        return a.copy()
    k = 1
    while sigma / k > 16:
        k *= 2
    gray = a.ndim == 2
    h, w = a.shape[:2]
    arr = a if not gray else a[..., None]
    chans = []
    for i in range(arr.shape[2]):
        c = arr[..., i].astype(np.float32)
        if k > 1:
            c = np.asarray(Image.fromarray(c, "F").resize((max(1, w // k), max(1, h // k)), Image.BILINEAR), np.float32)
        s = sigma / k
        r = max(1, int(round((math.sqrt(12 * s * s / 3 + 1) - 1) / 2)))
        for _ in range(3):
            c = _box(_box(c, r, 0), r, 1)
        if k > 1:
            c = np.asarray(Image.fromarray(c, "F").resize((w, h), Image.BICUBIC), np.float32)
        chans.append(c)
    out = np.stack(chans, axis=2)
    return out[..., 0] if gray else out


def screen(a, b):
    return 1 - (1 - np.clip(a, 0, 1)) * (1 - np.clip(b, 0, 1))


def smooth(u):
    u = np.clip(u, 0, 1)
    return u * u * (3 - 2 * u)


def ramp(x, a, b):
    return smooth((x - a) / (b - a))


def yy_xx():
    return np.mgrid[0:H, 0:W].astype(np.float32)


def glow_at(cx, cy, rx, ry, power=2.0):
    y, x = yy_xx()
    d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
    return np.exp(-(d ** (power / 2)))


def vignette(a, strength=0.45, inner=0.55):
    y, x = yy_xx()
    d = np.sqrt(((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2) / 1.414
    m = 1 - strength * ramp(d, inner, 1.05)
    return a * m[..., None]


def finish(a, grain=0.012, seed=7):
    """仕上げ：細かい粒（黒の帯のむらを消し、CG と写真を同じ空気にする）。黒の所は弱く"""
    rng = np.random.default_rng(seed)
    n = rng.normal(0, 1, (H, W)).astype(np.float32)
    coarse = blur(rng.normal(0, 1, (H, W)).astype(np.float32), 0.9)
    n = n * 0.55 + coarse / max(float(coarse.std()), 1e-6) * 0.45
    L0 = lum(a)
    weight = 0.14 + 0.86 * ramp(L0, 0.02, 0.35) * (1 - 0.4 * ramp(L0, 0.7, 1.0))
    return np.clip(a + (n * grain * weight)[..., None], 0, 1)


# ---------------------------------------------------------------- 字を描く（透明度の板を返す）
ENGINE = {"name": "web"}  # web＝ブラウザ（HTML と CSS）、pil＝PIL。比べて web に決めた（LOOK9.md）
CACHE = os.path.join(WORK, "look9_cache")


class TypePIL:
    """PIL で描く（比べるために残す）。縦書き・横書きを SS 倍で描き、end() で縮める"""

    def __init__(self):
        self.im = Image.new("L", (W * SS, H * SS), 0)
        self.d = ImageDraw.Draw(self.im)

    def v(self, x, y, text, fkey="min", px=L, track=0.14, fill=255):
        """縦書き 1 行。x は行の中心、y は 1 字目の上"""
        f = font(fkey, int(px * SS))
        yy = y * SS
        step = px * SS * (1 + track)
        for ch in text.replace("[", "").replace("]", ""):
            if ch == " ":
                yy += step * 0.5
                continue
            self.d.text((x * SS, yy), ch, font=f, fill=fill, direction="ttb", features=["vert"], anchor="mt")
            yy += step
        return yy / SS

    def h(self, x, y, text, fkey="min", px=M, track=0.06, fill=255, align="l"):
        """横書き 1 行。y は字の並ぶ線（ベースライン）。詰め（palt）を効かせてから字間を足す"""
        f = font(fkey, int(px * SS))
        widths = [f.getlength(ch, features=["palt"]) + track * px * SS for ch in text]
        tw = sum(widths) - track * px * SS
        xx = x * SS - (tw if align == "r" else tw / 2 if align == "c" else 0)
        for ch, w in zip(text, widths):
            self.d.text((xx, y * SS), ch, font=f, fill=fill, anchor="ls", features=["palt"])
            xx += w
        return tw / SS

    def line(self, x0, y0, x1, y1, w=1.0, fill=255):
        self.d.line([(x0 * SS, y0 * SS), (x1 * SS, y1 * SS)], fill=fill, width=max(1, int(round(w * SS))))

    def end(self):
        return np.asarray(self.im.resize((W, H), Image.LANCZOS), np.float32) / 255.0


_CSS_FONTS = {
    # 字の種類 → (ファイル, 太さ)
    "min": ("shipporimincho/ShipporiMincho-Regular.ttf", 400),
    "thin": ("notoserifjp/NotoSerifJP[wght].ttf", 200),
    "thin3": ("notoserifjp/NotoSerifJP[wght].ttf", 300),
    "sans2": ("notosansjp/NotoSansJP[wght].ttf", 200),
    "sans": ("notosansjp/NotoSansJP[wght].ttf", 300),
    "sans4": ("notosansjp/NotoSansJP[wght].ttf", 400),
}


def _esc(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _tcy(t):
    """[0.8] のように角かっこで囲んだ所を、縦書きの中で横に組む（縦中横）"""
    import re

    def rep(m):
        cls = "tcy2" if len(m.group(1)) > 2 else "tcy"
        return f'<span class="{cls}">{_esc(m.group(1))}</span>'

    return re.sub(r"\[([^\]]+)\]", rep, t)


def _font_css():
    out = []
    for key, (rel, wght) in _CSS_FONTS.items():
        url = "file://" + os.path.join(FONTS, rel).replace("[", "%5B").replace("]", "%5D")
        rng = "100 900" if "[wght]" in rel else str(wght)
        out.append(f'@font-face{{font-family:"{key}";src:url("{url}");font-weight:{rng};}}')
    return "\n".join(out)


class TypeWeb:
    """ブラウザで描く字の板。置き方は TypePIL と同じ。同じ中身は作業用のフォルダにためて使い回す"""

    def __init__(self):
        self.items = []

    def v(self, x, y, text, fkey="min", px=L, track=0.14, fill=255, feat="vpal"):
        wght = _CSS_FONTS[fkey][1]
        self.items.append(
            f'<div class="v" style="left:{x - px / 2:.2f}px;top:{y:.2f}px;width:{px}px;font-family:{fkey};font-weight:{wght};'
            f'font-size:{px}px;letter-spacing:{track}em;font-feature-settings:\'{feat}\'">{_tcy(_esc(text).replace("&lt;", "<").replace("&gt;", ">"))}</div>'
        )

    def h(self, x, y, text, fkey="min", px=M, track=0.06, fill=255, align="l", feat="palt"):
        wght = _CSS_FONTS[fkey][1]
        tx = {"l": "0", "c": "-50%", "r": "-100%"}[align]
        self.items.append(
            f'<div class="h" data-y="{y}" style="left:{x:.2f}px;top:0;transform:translateX({tx});margin-right:{-track}em;font-family:{fkey};font-weight:{wght};'
            f'font-size:{px}px;letter-spacing:{track}em;font-feature-settings:\'{feat}\'"><span class="bl"></span>{_esc(text)}</div>'
        )

    def line(self, x0, y0, x1, y1, w=1.0, fill=255):
        ln = math.hypot(x1 - x0, y1 - y0)
        ang = math.degrees(math.atan2(y1 - y0, x1 - x0))
        self.items.append(
            f'<div style="position:absolute;left:{x0:.2f}px;top:{y0 - w / 2:.2f}px;width:{ln:.2f}px;height:{w}px;background:#fff;'
            f'transform-origin:0 {w / 2}px;transform:rotate({ang:.3f}deg)"></div>'
        )

    def html(self):
        return (
            '<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>\n'
            + _font_css()
            + """
html,body{margin:0;width:1920px;height:1080px;background:transparent;overflow:hidden;color:#fff;
  -webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;font-kerning:normal;}
.v{position:absolute;writing-mode:vertical-rl;text-orientation:mixed;white-space:nowrap;line-height:1;}
.h{position:absolute;white-space:nowrap;line-height:1;}
.bl{display:inline-block;width:0;height:0;}
.tcy,.tcy2{display:inline-block;writing-mode:horizontal-tb;width:1em;height:1em;line-height:1;text-align:center;letter-spacing:0;font-feature-settings:normal;white-space:nowrap;}
.tcy2{font-size:.8em;width:1.25em;}
</style></head><body>"""
            + "".join(self.items)
            + "</body></html>"
        )

    def end(self):
        import hashlib, subprocess

        os.makedirs(CACHE, exist_ok=True)
        html = self.html()
        key = hashlib.sha1(html.encode("utf8")).hexdigest()[:20]
        png = os.path.join(CACHE, key + ".png")
        if not os.path.exists(png):
            hp = os.path.join(CACHE, key + ".html")
            with open(hp, "w", encoding="utf8") as f:
                f.write(html)
            jp = os.path.join(CACHE, key + ".json")
            with open(jp, "w", encoding="utf8") as f:
                json.dump([{"html": hp, "png": png}], f)
            subprocess.run(["node", os.path.join(HERE, "capture", "type9.cjs"), jp], check=True, cwd=REPO)
        a = Image.open(png).getchannel("A").resize((W, H), Image.LANCZOS)
        return np.asarray(a, np.float32) / 255.0


def Type():
    return TypeWeb() if ENGINE["name"] == "web" else TypePIL()


def ink(a, m, c=SHIRO, opacity=1.0):
    m = (m * opacity)[..., None]
    return a * (1 - m) + np.array(c, np.float32) * m


# ---------------------------------------------------------------- 素材
def frame(chapter, i):
    base = os.path.join(STORY, chapter, f"{i:04d}")
    return Image.open(base + ".jpg" if os.path.exists(base + ".jpg") else base + ".png").convert("RGB")


def cover(im, box=None):
    """box の所を 1920×1080 いっぱいに（box は 16:9 に合わせて渡す）"""
    if box:
        im = im.crop(box)
    r = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    x = (im.width - W) // 2
    y = (im.height - H) // 2
    return from_img(im.crop((x, y, x + W, y + H)))


_GOLD_STOPS = [
    (0.00, (0.010, 0.007, 0.004)),
    (0.10, (0.125, 0.074, 0.026)),
    (0.26, (0.345, 0.222, 0.086)),
    (0.48, (0.670, 0.505, 0.238)),
    (0.70, (0.885, 0.750, 0.470)),
    (0.88, (0.980, 0.915, 0.745)),
    (1.00, (1.000, 0.985, 0.945)),
]


def grade_gold(a, strength=0.9):
    """からし色の金を、あたたかい金へ。金色の所だけ、明るさから色を決め直す（石の白は保つ）"""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a.max(axis=2)
    mn = a.min(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1e-4)
    warm = np.clip((r - b) / np.maximum(mx, 1e-4), 0, 1)
    # 赤（作れない所の爪）は金に含めない：緑が赤の半分より少ないものは金ではない
    not_red = ramp(g / np.maximum(r, 1e-4), 0.40, 0.56)
    goldness = ramp(sat, 0.22, 0.55) * ramp(warm, 0.2, 0.5) * ramp(mx, 0.015, 0.06) * not_red
    L0 = lum(a)
    # コントラストを少し強く（暗い所はより暗く、光る所は光らせる）
    t = np.clip(L0 * 1.18, 0, 1)
    t = t ** 1.22
    xs = np.array([s[0] for s in _GOLD_STOPS], np.float32)
    out = np.stack([np.interp(t, xs, np.array([s[1][i] for s in _GOLD_STOPS], np.float32)) for i in range(3)], axis=2).astype(np.float32)
    k = (goldness * strength)[..., None]
    return a * (1 - k) + out * k


def silhouette(a, thr=0.03, close=7):
    """黒い地の上の品物の形（0〜1）。中の暗い所も品物として埋める"""
    m = (a.max(axis=2) > thr).astype(np.uint8) * 255
    im = Image.fromarray(m, "L")
    if close:
        im = im.filter(ImageFilter.MaxFilter(close)).filter(ImageFilter.MinFilter(close))
    # 縁を少し内へ（後光が縁まで届く。黒いふちを出さない）
    im = im.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(1.4))
    return np.asarray(im, np.float32) / 255.0


def bloom(a, thr=0.72, r1=7, r2=38, k1=0.30, k2=0.26, tint=(1.0, 0.93, 0.82)):
    hi = np.clip((a - thr) / (1 - thr), 0, 1) * a
    g = blur(hi, r1) * k1 + blur(hi, r2) * k2
    return screen(a, g * np.array(tint, np.float32))


def stage(sil, base=SUMI, halo=0.10, halo_r=120, color=(1.0, 0.86, 0.68), pool=None):
    """品物の後ろの暗闇に、かすかな光（品物の形からにじむ後光）。pool＝(cx, cy, rx, ry, 強さ) で光のたまりを足す"""
    a = ground(base)
    g = blur(sil, halo_r) * halo + blur(sil, halo_r * 0.28) * halo * 0.55
    a = screen(a, g[..., None] * np.array(color, np.float32))
    if pool:
        cx, cy, rx, ry, k = pool
        a = screen(a, (glow_at(cx, cy, rx, ry, 2.0) * k)[..., None] * np.array(color, np.float32))
    return a


def ring_on_black(chapter, i, box, mask_left=None, grade=True, dof=None):
    """黒地で撮った指輪を切り抜く。mask_left＝それより左（左の字）を消す、dof＝(y0, y1, r)：下へ行くほどぼかす"""
    full = frame(chapter, i)
    if mask_left is not None:
        ImageDraw.Draw(full).rectangle([0, 0, mask_left, full.height], fill=(0, 0, 0))
    r = cover(full, box)
    if grade:
        r = grade_gold(r)
    sil = silhouette(r)
    if dof:
        y0, y1, rad = dof
        y, _ = yy_xx()
        k = ramp(y, y0, y1)
        rb = blur(r, rad)
        sb = blur(sil, rad)
        r = r * (1 - k[..., None]) + rb * k[..., None]
        sil = sil * (1 - k) + sb * k
    return r, sil


def over_black(bg, r, sil):
    """切り抜いた品物を地に重ねる（r は黒地のまま）"""
    return bg * (1 - sil[..., None]) + r


SCENES = {}


def scene(fn):
    SCENES[fn.__name__] = fn
    return fn


def save(a, name, grain=0.012):
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, name + ".png")
    to_img(finish(a, grain=grain)).save(p, optimize=False, compress_level=4)
    print(p)
    return p


# ---------------------------------------------------------------- 紙と筆
def paper(seed=3, base=PAPER, fibers=2600):
    """紙（自前で作る。光は左上から）。写真を借りない"""
    rng = np.random.default_rng(seed)

    def noise(sigma):
        n = blur(rng.normal(0, 1, (H, W)).astype(np.float32), sigma)
        return n / max(float(n.std()), 1e-6)

    m = noise(160) * 0.006 + noise(18) * 0.0022 + noise(1.6) * 0.0042
    im = Image.new("L", (W * 2, H * 2), 128)
    d = ImageDraw.Draw(im)
    for _ in range(fibers):
        x, y = rng.uniform(0, W * 2), rng.uniform(0, H * 2)
        ang, ln = rng.uniform(0, math.tau), rng.uniform(16, 90)
        bend = rng.uniform(-0.6, 0.6)
        pts = [(x + math.cos(ang + bend * t) * ln * t, y + math.sin(ang + bend * t) * ln * t) for t in np.linspace(0, 1, 7)]
        d.line(pts, fill=int(128 + rng.choice([-1, 1]) * rng.uniform(14, 40)), width=1)
    f = (np.asarray(im.resize((W, H), Image.LANCZOS), np.float32) - 128) / 128 * 0.05
    a = ground(base) * (1 + m + f)[..., None]
    y, x = yy_xx()
    light = 1.03 - 0.10 * ramp(np.sqrt(((x - W * 0.40) / W) ** 2 + ((y - H * 0.34) / H) ** 2), 0.22, 1.0)
    return a * light[..., None]


class Pen:
    """手で引いた線（朱の直し）。太さが少しゆれる。透明度の板を返す"""

    def __init__(self, seed=11):
        self.im = Image.new("L", (W * SS, H * SS), 0)
        self.d = ImageDraw.Draw(self.im)
        self.rng = np.random.default_rng(seed)

    def stroke(self, pts, w=2.4, taper=True):
        pts = np.array(pts, np.float64)
        # Catmull-Rom でなめらかに
        P = np.vstack([pts[0], pts, pts[-1]])
        path = []
        for i in range(1, len(P) - 2):
            p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
            n = max(8, int(np.linalg.norm(p2 - p1) * SS / 2))
            for t in np.linspace(0, 1, n, endpoint=False):
                path.append(0.5 * ((2 * p1) + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t ** 2 + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3))
        path.append(P[-2])
        path = np.array(path)
        n = len(path)
        phase = self.rng.uniform(0, 6)
        for i, (x, y) in enumerate(path):
            u = i / max(1, n - 1)
            k = 0.86 + 0.14 * math.sin(phase + u * 9)
            if taper:
                k *= min(1.0, 0.45 + u * 6) * min(1.0, 0.25 + (1 - u) * 5)
            r = w * k * SS / 2
            self.d.ellipse([x * SS - r, y * SS - r, x * SS + r, y * SS + r], fill=255)

    def end(self):
        return np.asarray(self.im.resize((W, H), Image.LANCZOS), np.float32) / 255.0


def drawing_layer(box, scale, at, soften=0.0):
    """継ぐの本物の図面（story/draw9/draw.png）の線だけを、透明度の板にする。box の左上が at へ来る"""
    d = Image.open(os.path.join(STORY, "draw9", "draw.png")).convert("L")
    d = d.crop(box)
    d = d.resize((round(d.width * scale), round(d.height * scale)), Image.LANCZOS)
    m = 1 - np.asarray(d, np.float32) / 255.0
    out = np.zeros((H, W), np.float32)
    x0, y0 = at
    sx0, sy0 = max(0, -x0), max(0, -y0)
    ex, ey = min(W, x0 + m.shape[1]), min(H, y0 + m.shape[0])
    out[max(0, y0):ey, max(0, x0):ex] = m[sy0:sy0 + ey - max(0, y0), sx0:sx0 + ex - max(0, x0)]
    return blur(out, soften) if soften else out


def footage_still(rel, t):
    """映像の 1 こまを取り出す（作業用のフォルダの _look9 にためる）"""
    import subprocess

    cache = os.path.join(WORK, "footage", "_look9")
    os.makedirs(cache, exist_ok=True)
    p = os.path.join(cache, f"{os.path.basename(rel)}_{t:.2f}.png")
    if not os.path.exists(p):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", os.path.join(WORK, "footage", rel), "-frames:v", "1", p], check=True)
    return Image.open(p).convert("RGB")


# ---------------------------------------------------------------- 題
def title_scene(fkey, name, latin=False, track=-0.07, hz=False):
    a = ground()
    t = Type()
    if hz:
        t.h(W / 2, 600 if latin else 610, "継ぐ", fkey, XL, 0.10, align="c")
    else:
        t.v(W / 2, 276 if latin else 350, "継ぐ", fkey, XL, track)
    m = t.end()
    a = screen(a, blur(m, 30)[..., None] * 0.05)
    a = ink(a, m)
    if latin:
        t2 = Type()
        t2.h(W / 2, 800 if not hz else 740, "TSUGU CRAFT", "thin3", T, 0.62, align="c")
        a = ink(a, t2.end(), opacity=0.9)
    save(a, name)


@scene
def s01_title():
    title_scene("thin", "01a_題_細い明朝")
    title_scene("thin", "01b_題_TSUGU_CRAFT", latin=True)
    title_scene("min", "01c_題_しっぽり明朝")


# ---------------------------------------------------------------- 指輪が画面いっぱい
def ring_plate(shift_x=0, shift_y=0, scale_h=1200, halo=0.15):
    """三角の石の指輪を大きく。石の高さに焦点、腕は下へ行くほどぼける"""
    w = scale_h * 16 / 9
    cx, top = 2230 - shift_x, 360 - shift_y
    box = (int(cx - w / 2), int(top), int(cx + w / 2), int(top + scale_h))
    r, sil = ring_on_black("workshops8", 0, box, mask_left=1400, dof=(560, 1060, 7))
    r = bloom(r, thr=0.70)
    bg = stage(sil, halo=halo, halo_r=150)
    return over_black(bg, r, sil)


def ring_with_words(fkey, track, px=M, name="02_指輪いっぱい"):
    a = vignette(ring_plate(shift_x=-170, shift_y=0, scale_h=1130), 0.35)
    t = Type()
    t.v(RIGHT - 28, TOP + 8, "職人の判断を、", fkey, px, track)
    t.v(RIGHT - 28 - px * 1.62, TOP + 8, "次の人へ。", fkey, px, track)
    a = ink(a, t.end())
    save(a, name)


@scene
def s02_ring():
    ring_with_words("min", 0.12)


@scene
def s02b_ring_floor():
    """黒漆の台：指輪全体。下に映り込み（地面の気配）"""
    k_ = 0.62
    top = 248 - 70 / k_
    h_ = 1080 / k_
    w_ = 1920 / k_
    cx = 2270
    box = (int(cx - w_ / 2), int(top), int(cx + w_ / 2), int(top + h_))
    full = frame("hero8b", 0)
    ImageDraw.Draw(full).rectangle([0, 0, 1500, full.height], fill=(0, 0, 0))
    r = grade_gold(cover(full, box))
    sil = silhouette(r)
    ys = np.where(sil.max(axis=1) > 0.5)[0]
    yb = int(ys.max()) + 1
    hh = min(H - yb, yb)
    ref = np.zeros_like(r)
    ref[yb:yb + hh] = r[yb - hh:yb][::-1]
    ref = blur(ref, 2.4)
    y, _ = yy_xx()
    fade = 0.34 * np.exp(-np.clip(y - yb, 0, None) / 62.0) * (y >= yb)
    bg = stage(sil, halo=0.13, halo_r=150)
    # 台の上の、ごく弱い光のたまり
    bg = screen(bg, (glow_at(W / 2, yb + 4, 620, 20, 2.0) * 0.07)[..., None] * np.array((1.0, 0.86, 0.68), np.float32))
    a = screen(bg, ref * fade[..., None])
    a = over_black(a, bloom(r, thr=0.72), sil)
    a = vignette(a, 0.35)
    t = Type()
    t.h(W / 2, 1014, "職人の判断を、次の人へ。", "min", S, 0.14, align="c")
    a = ink(a, t.end())
    save(a, "02b_指輪_黒漆の台")


@scene
def s00_flame():
    """序：炎（作者の映像）。字は小さく右に"""
    im = footage_still("raw/anneal.mov", 6.0)
    a = cover(im)
    L0 = lum(a)
    # 壁を落とし、炎と赤い輪を残す
    a = np.clip(a, 0, 1) ** 1.9 * 1.25
    a = a * np.array((1.0, 0.95, 0.90), np.float32)
    y, x = yy_xx()
    a = a * (0.25 + 0.75 * ramp(y, 60, 420))[..., None]
    a = bloom(a, thr=0.6, r1=9, r2=46, k1=0.34, k2=0.32, tint=(1.0, 0.86, 0.72))
    a = vignette(a, 0.62, 0.42)
    t = Type()
    t.v(RIGHT - 30, TOP + 6, "私は、", "min", M, 0.12)
    t.v(RIGHT - 30 - 96, TOP + 6, "彫金の職人です。", "min", M, 0.12)
    a = ink(a, t.end())
    save(a, "00_序_炎", grain=0.014)


# ---------------------------------------------------------------- 作れない所は、赤く光る（アプリの画面を大きく）
def viewer_cut(i, box):
    """アプリの 3D の所（灰色の地）から、指輪だけを切り抜く。地は上下の色の帯なので、行ごとの色を引いて形を取る"""
    full = frame("red8", i)
    arr = from_img(full)
    # 地の色：右の帯のすぐ左の縦の列（ここは地のまま）
    col = arr[:, 2490:2510, :].mean(axis=1, keepdims=True)
    diff = np.abs(arr - col).max(axis=2)
    m0 = (diff > 0.035).astype(np.uint8) * 255
    im = Image.fromarray(m0, "L").filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    # 外から塗って、つながった地だけを地とする
    small = im.resize((im.width // 4, im.height // 4), Image.BILINEAR).point(lambda v: 255 if v > 127 else 0)
    ImageDraw.floodfill(small, (500, 40), 128, thresh=10)
    ImageDraw.floodfill(small, (10, 200), 128, thresh=10)
    bgm = np.asarray(small, np.uint8) == 128
    sil = Image.fromarray(((~bgm).astype(np.uint8)) * 255, "L").resize(full.size, Image.BICUBIC).filter(ImageFilter.GaussianBlur(1.6))
    s0 = np.asarray(sil, np.float32) / 255.0
    s0 = ramp(s0, 0.35, 0.8)
    # 3D の所（左の帯・上の帯・右の帯・下の欄）の外は捨てる
    s0[:, :96] = 0
    s0[:, 2512:] = 0
    s0[:96, :] = 0
    s0[1646:, :] = 0
    premult = arr * s0[..., None]
    crop = lambda a_: cover(to_img(a_), box)
    r = crop(premult)
    sl = lum(crop(np.repeat(s0[..., None], 3, axis=2)))
    return r, np.clip(sl, 0, 1)


def red_only(r):
    """赤い爪の所（光らせる）"""
    red = np.clip(r[..., 0] - np.maximum(r[..., 1], r[..., 2]), 0, 1)
    return ramp(red, 0.25, 0.6)


@scene
def s03_red():
    # 3D の所だけ（右の帯・上の帯は切る）。指輪を左へ寄せ、右下を空ける
    box = (560, 250, 2960, 1600)
    r, sil = viewer_cut(60, box)
    rm = red_only(r)
    r = grade_gold(r)
    y, x = yy_xx()
    k = ramp(y, 760, 1075)
    r2 = blur(r, 6)
    sb = blur(sil, 6)
    r = r * (1 - k[..., None]) + r2 * k[..., None]
    sil = sil * (1 - k) + sb * k
    r = bloom(r, thr=0.75, k1=0.22, k2=0.16)
    bg = stage(sil, halo=0.10, halo_r=140)
    a = over_black(bg, r, sil)
    # 赤が光る
    g = blur(rm, 12) * 0.5 + blur(rm, 60) * 0.55
    a = screen(a, g[..., None] * np.array((1.0, 0.12, 0.07), np.float32))
    # 右下へ、光を落とす（本物のつまみの行のため）
    fall = 1 - 0.97 * ramp(y, 660, 860) * ramp(x, 860, 1060)
    a = vignette(a * fall[..., None], 0.30)
    # 字（右の上から縦に）
    t = Type()
    t.v(RIGHT - 30, TOP + 6, "作れない所は、", "min", M, 0.12)
    t.v(RIGHT - 30 - 96, TOP + 6, "赤く光る。", "min", M, 0.12)
    a = ink(a, t.end())
    # 本物のつまみの行を、そのまま切り出して大きく（右の下。行の外の暗い地は黒へとかす）
    full = frame("red8", 60)
    row = full.crop((2540, 1108, 3182, 1196))
    rs = 1.22
    row = row.resize((round(row.width * rs), round(row.height * rs)), Image.LANCZOS)
    ra = np.clip((from_img(row) - 0.075) * 1.09, 0, 1)
    mask = Image.new("L", (row.width * 4, row.height * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle([4, 4, row.width * 4 - 5, row.height * 4 - 5], radius=int(25 * rs * 4), fill=255)
    mk = np.asarray(mask.resize(row.size, Image.LANCZOS), np.float32)[..., None] / 255.0
    x0, y0 = RIGHT - row.width, BOTTOM - row.height + 10
    a[y0:y0 + row.height, x0:x0 + row.width] = a[y0:y0 + row.height, x0:x0 + row.width] * (1 - mk) + ra * mk
    save(a, "03a_赤く光る")


# ---------------------------------------------------------------- 帳面（本物の画面を切り抜いて、そのまま全画面。縮めも広げもしない）
@scene
def s03b_card():
    full = Image.open(os.path.join(STORY, "ledger9", "page.png")).convert("RGB")
    top = 2490
    ca = from_img(full.crop((0, top, W, top + H)))
    # 画面の灰色を黒へ寄せる（枠の中の枠に見せない）
    a = np.clip((ca - 0.085) * 1.09, 0, 1)
    y, _ = yy_xx()
    # この決まりの札の上下は、なめらかに暗く
    keep = ramp(y, 92, 108) * (1 - ramp(y, 976, 992))
    a = a * keep[..., None]
    a = screen(a, ground())
    save(a, "03b_画面_帳面", grain=0.006)


# ---------------------------------------------------------------- 図 A：三幅（本物の素材で。ことばは「デザイン・設計（CAD）」と「制作」の 2 つ。戻りは制作から「デザイン・設計」へ）
def panel(im, target_w, target_h):
    r = max(target_w / im.width, target_h / im.height)
    im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    x = (im.width - target_w) // 2
    y = (im.height - target_h) // 2
    return from_img(im.crop((x, y, x + target_w, y + target_h)))


@scene
def s04a_flow_panels():
    pw = W // 3
    top, bot = 196, 856
    ph = bot - top
    p1 = frame("build", 60).crop((960, 400, 1880, 1350))
    p2 = frame("word3", 220).crop((600, 170, 2010, 1636))
    p3 = footage_still("raw/file_hands.mov", 6.0).crop((700, 130, 1400, 850))
    a1 = panel(p1, pw - 3, ph) * np.array((1.03, 0.99, 0.93), np.float32)
    a2 = grade_gold(panel(p2, pw - 6, ph))
    a3 = panel(p3, pw - 3, ph)
    a = ground()
    a[top:bot, 0:pw - 3] = np.clip(a1, 0, 1)
    a[top:bot, pw + 3:2 * pw - 3] = a2
    a[top:bot, 2 * pw + 3:W] = a3[:, : W - 2 * pw - 3]
    # ことば：パネルの下に。順番は細い線で
    t = Type()
    cx = [pw * 1.0, pw * 2.5]
    t.h(cx[0], 922, "デザイン・設計（CAD）", "min", S, 0.04, align="c")
    t.h(cx[1], 922, "制作", "min", S, 0.04, align="c")
    # 右向きの細い線（デザイン・設計 → 制作）
    xe = cx[1] - 64
    t.line(cx[0] + 190, 908, xe, 908, 0.8)
    t.line(xe - 13, 901, xe, 908, 0.8)
    t.line(xe - 13, 915, xe, 908, 0.8)
    a = ink(a, t.end())
    # 戻りの線：制作から「デザイン・設計」へ。上の黒の帯の中だけを通す
    t = Type()
    yl = 124
    t.line(cx[1], top - 10, cx[1], yl, 1.0)
    t.line(cx[1], yl, cx[0], yl, 1.0)
    t.line(cx[0], yl, cx[0], top - 10, 1.0)
    t.line(cx[0] - 10, top - 26, cx[0], top - 10, 1.0)
    t.line(cx[0] + 10, top - 26, cx[0], top - 10, 1.0)
    a = ink(a, t.end(), AKA)
    t = Type()
    t.h((cx[0] + cx[1]) / 2, yl - 22, "作れない", "min", S, 0.08, align="c")
    a = ink(a, t.end(), AKA)
    t = Type()
    t.h(W / 2, 1026, "デザイン・設計と制作を、行ったり来たり。", "min", M, 0.04, align="c")
    a = ink(a, t.end())
    save(a, "04a_図_三つの絵")


# ---------------------------------------------------------------- 図 B：朱入れの図面（紙の上の本物の図面に、職人の朱）
@scene
def s04b_flow_paper():
    a = paper()
    # 本物の図面（正面図だけを大きく、右へ。下の「正面図」の字は入れない）
    dl = drawing_layer((460, 560, 1760, 1490), 0.92, (690, 30))
    a = ink(a, dl, INK, 0.60)
    # 朱：図面の爪に丸
    pen = Pen(5)
    cx, cy, rx, ry = 1296, 168, 84, 92
    circ = []
    for u in np.linspace(0.04, 1.10, 30):
        ang = u * math.tau - 2.0
        wob = 1 + 0.025 * math.sin(u * 15) + 0.05 * (u - 0.5)
        circ.append((cx + rx * wob * math.cos(ang), cy + ry * wob * math.sin(ang)))
    pen.stroke(circ, w=2.6)
    # ことばの列（下）。「デザイン・設計」と「制作」の 2 つ（間は矢印でなく中黒。2026-11-05 作者）
    t = Type()
    base = 985
    px = M
    xs = [LEFT, LEFT + 712]
    t.h(xs[0], base, "デザイン・設計", "min", px, 0.02)
    t.h(xs[1], base, "制作", "min", px, 0.02)
    t.h(xs[0] + 330, base + 42, "CAD", "thin3", T, 0.20, align="c")
    # 右向きの細い線（図面の寸法線と同じ形）
    y_ = base - 21
    x0_, x1_ = xs[0] + 450, xs[1] - 20
    t.line(x0_, y_, x1_, y_, 1.0)
    t.line(x1_ - 13, y_ - 6, x1_, y_, 1.0)
    t.line(x1_ - 13, y_ + 6, x1_, y_, 1.0)
    a = ink(a, t.end(), INK)
    # 朱：制作から「デザイン・設計」へ戻る線
    x_end = xs[1] + 66
    x_start = xs[0] + 220
    mid = (x_end + x_start) / 2
    arc = [(x_end, base - 82), (x_end - 130, base - 196), (mid, base - 262), (x_start + 130, base - 200), (x_start, base - 88)]
    pen.stroke(arc, w=2.8)
    pen.stroke([(x_start - 22, base - 126), (x_start, base - 84)], w=2.8)
    pen.stroke([(x_start + 34, base - 118), (x_start, base - 84)], w=2.8)
    a = ink(a, pen.end(), SHU, 0.95)
    t2 = Type()
    t2.h(mid, base - 284, "作れない", "min", S, 0.04, align="c")
    a = ink(a, t2.end(), SHU)
    # 見出し
    t3 = Type()
    t3.v(LEFT + 224, TOP - 6, "デザイン・設計と", "min", M, 0.10)
    t3.v(LEFT + 134, TOP - 6, "制作を、", "min", M, 0.10)
    t3.v(LEFT + 44, TOP - 6, "行ったり来たり。", "min", M, 0.10)
    a = ink(a, t3.end(), INK)
    save(a, "04b_図_朱入れの図面", grain=0.010)


# ---------------------------------------------------------------- 字だけ A：字そのものが消えていく
def fading_words(small_lines, big, name, px=XL, x_big=1040, big_track=0.0):
    a = ground()
    y, x = yy_xx()
    t = Type()
    for i, line in enumerate(small_lines):
        t.v(x_big + 268 + (len(small_lines) - 1 - i) * 72, TOP + 18, line, "thin3", S, 0.14)
    a = ink(a, t.end())
    t2 = Type()
    t2.v(x_big, TOP - 28, big, "thin", px, big_track)
    m = t2.end()
    fade = 1 - 0.985 * ramp(y, 170, 930)
    a = ink(a, m * fade)
    save(a, name)


@scene
def s05a_words_fade():
    fading_words(["職人がいなくなれば、", "その判断も"], "消えます。", "05a_字だけ_消えていく字")


# ---------------------------------------------------------------- 字だけ B：帳面の 1 ページ（紙・罫・墨）
def ledger_page(seed=9):
    a = paper(seed=seed)
    t = Type()
    step = 132
    x = RIGHT - 30
    while x > 60:
        t.line(x, 66, x, H - 66, 0.75)
        x -= step
    t.line(0, 66, W, 66, 0.75)
    t.line(0, H - 66, W, H - 66, 0.75)
    a = ink(a, t.end(), SHU, 0.34)
    return a, step, RIGHT - 30


@scene
def s05b_words_ledger():
    a, step, x0 = ledger_page()
    cx = x0 - step / 2
    t = Type()
    t.v(cx, 108, "[8] ミリくらいの石なら、", "min", L, 0.06)
    t.v(cx - step, 108, "爪はだいたい", "min", L, 0.06)
    t.v(cx - step * 2, 108, "[0.8]〜[1] ミリ。", "min", L, 0.06)
    a = ink(a, t.end(), INK)
    t2 = Type()
    t2.v(cx - step * 3, 112, "職人の言葉", "sans", T, 0.30)
    a = ink(a, t2.end(), INK, 0.78)
    save(a, "05b_字だけ_帳面", grain=0.010)


# ---------------------------------------------------------------- 木目金（写真がほぼ全面。灰色の地と穴は黒へ）
def tsuba_cut():
    """鐔の写真（CC0）から、灰色の地と穴を抜く。返すのは (色, 形)"""
    im = Image.open(os.path.join(HERITAGE, "mokume-tsuba-2.jpg")).convert("RGB")
    a = from_img(im)
    mx, mn = a.max(axis=2), a.min(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1e-3)
    cand = ((sat < 0.17) & (lum(a) > 0.30)).astype(np.uint8) * 255
    m = Image.fromarray(cand, "L").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    for seed in [(4, 4), (1395, 4), (4, 1395), (1395, 1395), (440, 700), (705, 720), (980, 700)]:
        if m.getpixel(seed) == 255:
            ImageDraw.floodfill(m, seed, 128)
    bg = (np.asarray(m, np.uint8) == 128).astype(np.float32)
    # 縁のぎざぎざを消す：ぼかしてから切り直し、少し内へ（灰色のふちを残さない）
    soft = blur(bg, 5.0)
    bg2 = ramp(soft, 0.34, 0.40)
    bg2 = blur(bg2, 1.1)
    alpha = 1 - bg2
    # 暗部を沈め、さび色を深く
    c = np.clip((a - 0.03) * 1.10, 0, 1) ** 1.10
    c = c * np.array((1.03, 0.975, 0.93), np.float32)
    return c, alpha


def place(c, alpha, scale, ox, oy):
    """c を scale 倍して、その左上が (ox, oy) へ来るように置く。返すのは (黒地の色, 形)"""
    h, w = alpha.shape
    nw, nh = round(w * scale), round(h * scale)
    cim = to_img(c * alpha[..., None]).resize((nw, nh), Image.LANCZOS)
    aim = Image.fromarray((alpha * 255).astype(np.uint8), "L").resize((nw, nh), Image.LANCZOS)
    cc = Image.new("RGB", (W, H), (0, 0, 0))
    aa = Image.new("L", (W, H), 0)
    cc.paste(cim, (int(ox), int(oy)))
    aa.paste(aim, (int(ox), int(oy)))
    return from_img(cc), np.asarray(aa, np.float32) / 255.0


@scene
def s06_mokume():
    c, alpha = tsuba_cut()
    s_ = 1.745
    r, sil = place(c, alpha, s_, -130 * s_, -500 * s_)
    r = from_img(to_img(r).filter(ImageFilter.UnsharpMask(radius=2.2, percent=45, threshold=2)))
    bg = stage(sil, halo=0.05, halo_r=120, color=(1.0, 0.75, 0.55))
    a = over_black(bg, r, sil)
    a = vignette(a, 0.34, 0.55)
    t = Type()
    t.v(1540, 126, "木目金", "min", L, 0.16)
    a = ink(a, t.end())
    t = Type()
    t.v(1436, 130, "江戸時代の、", "min", S, 0.10)
    t.v(1378, 130, "刀の飾りの技。", "min", S, 0.10)
    a = ink(a, t.end())
    t2 = Type()
    t2.v(540, 150, "鐔：メトロポリタン美術館（CC0）", "sans", 22, 0.12)
    a = ink(a, t2.end(), opacity=0.86)
    save(a, "06_木目金", grain=0.014)


# ---------------------------------------------------------------- 章の扉：3 つの章が同じ形でくり返す
DOORS = [
    ("一", "デザインする人へ", 1440),
    ("二", "学ぶ人へ", 960),
    ("三", "次の時代へ", 480),
]
Y_THREAD = 952


def door(i, a, color, name, grain=0.012):
    """同じ形：糸（細い線）の上の同じ高さの字が、右から左へ渡っていく。地だけが章ごとに変わる"""
    num, word, x = DOORS[i]
    t = Type()
    t.v(x, TOP + 6, word, "min", L, 0.12)
    a = ink(a, t.end(), color)
    t2 = Type()
    t2.v(x + 86, TOP + 10, "渡す", "min", T, 0.20)
    a = ink(a, t2.end(), color, 0.94)
    # 糸
    t3 = Type()
    t3.line(0, Y_THREAD, W, Y_THREAD, 0.75)
    a = ink(a, t3.end(), color, 0.70)
    # 目印：3 つ。今の章だけ明るい
    for j, (n2, _, x2) in enumerate(DOORS):
        tk = Type()
        tk.line(x2, Y_THREAD - 10, x2, Y_THREAD + 10, 1.0)
        tk.h(x2, Y_THREAD + 52, n2, "min", T, 0, align="c")
        a = ink(a, tk.end(), color, 1.0 if j == i else 0.42)
    save(a, name, grain=grain)


def door_ground(i):
    if i == 0:
        a = paper(seed=21)
        dl = drawing_layer((620, 560, 1760, 1500), 0.98, (-70, 18))
        return ink(a, dl, INK, 0.46), INK
    if i == 1:
        im = footage_still("raw/file_hands.mov", 6.0)
        a = cover(im)
        a = np.clip(a, 0, 1) ** 1.2 * 0.72
        a = a * np.array((1.02, 0.98, 0.93), np.float32)
        return vignette(a, 0.5, 0.45), SHIRO
    c, alpha = tsuba_cut()
    r, sil = place(c, alpha, 1.5, 1440 - 700 * 1.5, 860 - 700 * 1.5)
    bg = stage(sil, halo=0.04, halo_r=120, color=(1.0, 0.75, 0.55))
    a = over_black(bg, r * 0.72, sil)
    return vignette(a, 0.42, 0.5), SHIRO


DOOR_NAMES = ["07a_章の扉_デザインする人へ", "07b_章の扉_学ぶ人へ", "07c_章の扉_次の時代へ"]


@scene
def s07_doors():
    tiles = []
    for i in range(3):
        a, c = door_ground(i)
        door(i, a, c, DOOR_NAMES[i], grain=0.010 if i == 0 else 0.013)
    # 3 枚を並べて、同じ形のくり返しを見る
    tw, th, gap = 960, 540, 12
    im = Image.new("RGB", (tw * 3 + gap * 2, th), (34, 34, 34))
    for k, n in enumerate(DOOR_NAMES):
        t = Image.open(os.path.join(OUT, n + ".png")).convert("RGB").resize((tw, th), Image.LANCZOS)
        im.paste(t, (k * (tw + gap), 0))
    p = os.path.join(OUT, "07_章の扉_3枚.png")
    im.save(p)
    print(p)


# ---------------------------------------------------------------- 字の比べ：明朝／細い明朝／細いゴシック
@scene
def s08_fonts():
    ring_with_words("min", 0.12, name="08a_字_しっぽり明朝")
    ring_with_words("thin", 0.12, name="08b_字_細い明朝")
    ring_with_words("sans2", 0.12, name="08c_字_細いゴシック")
    title_scene("sans2", "08d_題_細いゴシック")
    names = ["08a_字_しっぽり明朝", "08b_字_細い明朝", "08c_字_細いゴシック", "01c_題_しっぽり明朝", "01a_題_細い明朝", "08d_題_細いゴシック"]
    labels = ["しっぽり明朝", "細い明朝（Noto Serif JP 200）", "細いゴシック（Noto Sans JP 200）"]
    tw, th, gap, head = 960, 540, 12, 64
    im = Image.new("RGB", (tw * 3 + gap * 2, th * 2 + gap + head), (20, 20, 20))
    d = ImageDraw.Draw(im)
    f = font("sans", 26)
    for j, lb in enumerate(labels):
        d.text((j * (tw + gap) + 24, 18), lb, font=f, fill=(235, 232, 225))
    for k, n in enumerate(names):
        t = Image.open(os.path.join(OUT, n + ".png")).convert("RGB").resize((tw, th), Image.LANCZOS)
        im.paste(t, ((k % 3) * (tw + gap), head + (k // 3) * (th + gap)))
    p = os.path.join(OUT, "08_字の比べ.png")
    im.save(p)
    print(p)


# ---------------------------------------------------------------- 字を組む道具の比べ：ブラウザ（左）と PIL（右）
@scene
def s09_engine():
    def draw(cls):
        t = cls()
        t.v(780, 80, "職人の判断を、", "min", L, 0.10)
        t.v(660, 80, "次の人へ。", "min", L, 0.10)
        t.v(500, 80, "[8] ミリくらいの石なら、", "min", M, 0.08)
        t.v(420, 80, "爪はだいたい", "min", M, 0.08)
        t.v(340, 80, "[0.8]〜[1] ミリ。", "min", M, 0.08)
        t.h(60, 980, "作れない所は、赤く光る。", "min", S, 0.06)
        t.h(60, 1040, "0.55 mm", "sans", T, 0.04)
        return t.end()

    left, right = draw(TypeWeb), draw(TypePIL)
    a = ground()
    a = ink(a, left)
    b = ink(ground(), right)
    a[:, W // 2 :] = b[:, : W - W // 2]
    a[:, W // 2 - 1 : W // 2 + 1] = 0.35
    save(a, "09_字の道具_左ブラウザ_右PIL", grain=0.0)


# ---------------------------------------------------------------- 一覧（並べて見る用）
@scene
def z_sheet():
    order = [
        "00_序_炎", "01a_題_細い明朝", "02_指輪いっぱい", "02b_指輪_黒漆の台",
        "03a_赤く光る", "03b_画面_帳面", "04a_図_三つの絵", "04b_図_朱入れの図面",
        "05a_字だけ_消えていく字", "05b_字だけ_帳面", "06_木目金", "07a_章の扉_デザインする人へ",
        "07b_章の扉_学ぶ人へ", "07c_章の扉_次の時代へ",
    ]
    tw, th, gap, cols = 640, 360, 12, 4
    rows = (len(order) + cols - 1) // cols
    im = Image.new("RGB", (cols * tw + (cols + 1) * gap, rows * th + (rows + 1) * gap), (34, 34, 34))
    for k, n in enumerate(order):
        p = os.path.join(OUT, n + ".png")
        if os.path.exists(p):
            t = Image.open(p).convert("RGB").resize((tw, th), Image.LANCZOS)
            im.paste(t, (gap + (k % cols) * (tw + gap), gap + (k // cols) * (th + gap)))
    p = os.path.join(OUT, "00_一覧.png")
    im.save(p)
    print(p)


if __name__ == "__main__":
    names = sys.argv[1:] or list(SCENES)
    for n in names:
        SCENES[n]()
