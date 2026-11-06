# 最終案 9 の絵を組む：final9.json（秒で書いた台本）→ 場面ごとの動画 → 1 本につなぐ。前の版（reel.py）には触らない。
# 見た目の決まりは LOOK9.md。字は動かない（濃くなるだけ）。枠は動かさない。切り替えは重ねるか、章の変わり目だけ黒をはさむ。
# 場面ごとに動画を残すので、変えた場面だけ組み直せる（work/vc/seg9/。台本・この絵の作り・撮ったこまが同じなら使い回す）。
# 使い方：python -I reel9.py final9.json 出す動画.mp4 [同時に組む数] [場面の名前…]
#   SHEET=1 を付けると、動画を作らず、場面ごとのこま送りの一覧を work/vc/sheet9/ に出す（場面の名前を足すと、その場面だけ）
import hashlib, json, math, os, subprocess, sys
from functools import lru_cache
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

os.environ.setdefault("LOOK9_OUT", os.path.join(HERE, "work", "look9"))
import look9 as L  # noqa: E402

W, H = L.W, L.H
WORK = L.WORK
STORY = L.STORY
HERITAGE = L.HERITAGE
FPS = 30
XL, LG, M, S, T = L.XL, L.L, L.M, L.S, L.T
LEFT, RIGHT, TOP, BOTTOM = L.LEFT, L.RIGHT, L.TOP, L.BOTTOM
SUMI, SHIRO, PAPER, INK, SHU, AKA = L.SUMI, L.SHIRO, L.PAPER, L.INK, L.SHU, L.AKA
SEG = os.path.join(WORK, "vc", "seg9")
F32 = np.float32


# ---------------------------------------------------------------- 小さな道具
def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def sm(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def fade(t, t0, d=0.9):
    """t0 から d 秒で濃くなる（1 次の変化で、終わりだけなめらかに）"""
    return sm((t - t0) / max(1e-6, d))


def fout(t, t1, d=0.6):
    return 1 - sm((t - t1) / max(1e-6, d))


class Mask(np.ndarray):
    """字の板（透明度）。bb：字のある所（y0, y1, x0, x1）。掛け算しても字のある所は広がらないので、そのまま受け継ぐ"""

    def __new__(cls, a, bb=None):
        o = np.asarray(a, F32).view(cls)
        o.bb = bb
        return o

    def __array_finalize__(self, obj):
        self.bb = getattr(obj, "bb", None)


def bbox_of(m, pad=4):
    ys = np.where(m.max(axis=1) > 0.002)[0]
    xs = np.where(m.max(axis=0) > 0.002)[0]
    if not len(ys):
        return (0, 0, 0, 0)
    return (max(0, ys[0] - pad), min(m.shape[0], ys[-1] + pad + 1), max(0, xs[0] - pad), min(m.shape[1], xs[-1] + pad + 1))


def ink(a, m, c=SHIRO, op=1.0):
    if op <= 0:
        return a
    bb = getattr(m, "bb", None)
    if bb and m.shape == a.shape[:2]:
        y0, y1, x0, x1 = bb
        if y1 <= y0 or x1 <= x0:
            return a
        out = a if a.flags.writeable else a.copy()
        k = (np.asarray(m[y0:y1, x0:x1]) * op)[..., None]
        out[y0:y1, x0:x1] = out[y0:y1, x0:x1] * (1 - k) + np.array(c, F32) * k
        return out
    k = (np.asarray(m) * op)[..., None]
    return a * (1 - k) + np.array(c, F32) * k


def screen(a, b):
    """重ねて明るくする（どちらも 0〜1 の前提）"""
    return a + b - a * b


@lru_cache(maxsize=96)
def plate(*items):
    """字の板（透明度）。items：("v", x, y, 字, 書体, 大きさ, 字間) ／ ("h", x, y, 字, 書体, 大きさ, 字間, 揃え) ／ ("l", x0, y0, x1, y1, 太さ)"""
    t = L.TypeWeb()
    for it in items:
        if it[0] == "v":
            t.v(it[1], it[2], it[3], it[4], it[5], it[6])
        elif it[0] == "h":
            t.h(it[1], it[2], it[3], it[4], it[5], it[6], align=it[7] if len(it) > 7 else "l")
        else:
            t.line(it[1], it[2], it[3], it[4], it[5] if len(it) > 5 else 1.0)
    m = t.end()
    return Mask(m, bbox_of(m))


def V(x, y, text, font="min", px=M, track=0.12):
    return plate(("v", x, y, text, font, px, track))


def Hz(x, y, text, font="min", px=S, track=0.06, align="l"):
    return plate(("h", x, y, text, font, px, track, align))


def Ln(x0, y0, x1, y1, w=1.0):
    return plate(("l", x0, y0, x1, y1, w))


@lru_cache(maxsize=8)
def vign(strength, inner):
    y, x = np.mgrid[0:H, 0:W].astype(F32)
    d = np.sqrt(((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2) / 1.414
    return (1 - strength * L.ramp(d, inner, 1.05))[..., None]


@lru_cache(maxsize=1)
def yy():
    return np.mgrid[0:H, 0:W].astype(F32)[0]


@lru_cache(maxsize=1)
def xx():
    return np.mgrid[0:H, 0:W].astype(F32)[1]


# 粒：場面をまたいで同じ物を使い回す（こまごとに動く粒）
GRAIN = None


def grain_fields():
    global GRAIN
    if GRAIN is None:
        p = os.path.join(L.CACHE, "grain9.npy")
        if not os.path.exists(p):
            os.makedirs(L.CACHE, exist_ok=True)
            rng = np.random.default_rng(9)
            fields = []
            for _ in range(8):
                n = rng.normal(0, 1, (H, W)).astype(F32)
                c = L.blur(rng.normal(0, 1, (H, W)).astype(F32), 0.9)
                fields.append(n * 0.55 + c / max(float(c.std()), 1e-6) * 0.45)
            np.save(p, np.stack(fields))
        GRAIN = np.load(p, mmap_mode="r")
    return GRAIN


def finish(a, f, g=0.010):
    if g <= 0:
        return np.clip(a, 0, 1)
    n = grain_fields()[f % 8]
    L0 = a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722
    weight = 0.16 + 0.84 * np.clip((L0 - 0.02) / 0.33, 0, 1)
    return np.clip(a + (n * g * weight)[..., None], 0, 1)


# ---------------------------------------------------------------- 撮った画面のこま
@lru_cache(maxsize=32)
def meta(ch):
    with open(os.path.join(STORY, ch, "meta.json"), encoding="utf8") as f:
        return json.load(f)


def mark(ch, k, off=0):
    m = meta(ch)
    return int(clamp(m["marks"][k] + off, 0, m["frames"] - 1))


@lru_cache(maxsize=12)
def shot(ch, i, box=None, size=(W, H)):
    """こま i の box（x, y, w, h。撮ったこまの px）を size にする。同じこまが続く所は読み直さない"""
    base = os.path.join(STORY, ch, f"{int(i):04d}")
    im = Image.open(base + ".jpg" if os.path.exists(base + ".jpg") else base + ".png").convert("RGB")
    if box:
        x, y, w, h = box
        im = im.crop((int(x), int(y), int(x + w), int(y + h)))
    if im.size != tuple(size):
        im = im.resize(size, Image.LANCZOS, reducing_gap=2.5)
    return np.asarray(im, F32) / 255.0


def ramp_frame(pts, t):
    """[(秒, こま), ...] の間を直線でつなぐ"""
    if t <= pts[0][0]:
        return pts[0][1]
    for (t0, f0), (t1, f1) in zip(pts, pts[1:]):
        if t <= t1:
            return f0 + (f1 - f0) * ((t - t0) / max(1e-6, t1 - t0))
    return pts[-1][1]


def lift(a, black=0.03, gain=1.0):
    """画面の灰色を黒へ少し寄せる（枠の中の枠に見せない）"""
    return np.clip((a - black) * gain / (1 - black), 0, 1)


def edges(a, top=46.0, bottom=70.0, floor=0.0):
    """画面の切り口（途中で切れた行）が見えないよう、上下をなめらかに暗くする"""
    y = yy()
    k = floor + (1 - floor) * (np.clip(y / max(top, 1e-3), 0, 1) ** 1.5 * np.clip((H - 1 - y) / max(bottom, 1e-3), 0, 1) ** 1.5)
    return a * k[..., None]


def band(a, y0, y1, dim=0.28, r=26.0):
    """y0〜y1 の帯だけ明るいまま、外を暗く（読むところだけ残す）"""
    y = yy()
    k = L.ramp(y, y0 - r, y0 + r) * (1 - L.ramp(y, y1 - r, y1 + r))
    return a * (dim + (1 - dim) * k)[..., None]


def dark_right(a, x0=1320, x1=1720, k=0.72):
    """右の字の下を暗く（映像の上に字を置くとき）"""
    return a * (1 - k * L.ramp(xx(), x0, x1))[..., None]


def dark_bottom(a, y0=860, y1=1040, k=0.7):
    return a * (1 - k * L.ramp(yy(), y0, y1))[..., None]


def soft_rect(x0, y0, x1, y1, r=24.0):
    """四角の中が 1、外が 0。縁はなめらか"""
    x, y = xx(), yy()
    return L.ramp(x, x0 - r, x0 + r) * (1 - L.ramp(x, x1 - r, x1 + r)) * L.ramp(y, y0 - r, y0 + r) * (1 - L.ramp(y, y1 - r, y1 + r))


# ---------------------------------------------------------------- 黒の上の指輪
def small(a, k=8):
    """にじみと後光のための小さな絵（間引くだけ。ぼかすので十分）"""
    return np.ascontiguousarray(a[k // 2::k, k // 2::k])


def up(g, size=(W, H)):
    im = Image.fromarray(g, "F") if g.ndim == 2 else None
    if im is not None:
        return np.asarray(im.resize(size, Image.BICUBIC), F32)
    return np.stack([np.asarray(Image.fromarray(g[..., i], "F").resize(size, Image.BICUBIC), F32) for i in range(g.shape[2])], axis=2)


def gauss(g, r):
    return L.blur(g.astype(F32), r)


def stage_ring(r, halo=0.12, color=(1.0, 0.86, 0.68), bloom=0.22, base=SUMI):
    """黒地で撮った指輪に、品物の形からにじむ後光と、光る所のにじみを足す。切り抜かない（黒の地に足すだけ）"""
    s8 = small(r, 8)
    m = (s8.max(axis=2) > 0.05).astype(F32)
    g = up(gauss(m, 12) * halo + gauss(m, 4) * halo * 0.5)
    a = np.zeros_like(r)
    a[:] = base
    a = screen(a, g[..., None] * np.array(color, F32))
    if bloom > 0:
        s4 = small(r, 4)
        hi = np.clip((s4 - 0.72) / 0.28, 0, 1) * s4
        bl = np.stack([gauss(hi[..., i], 5) * 0.7 + gauss(hi[..., i], 16) * 0.5 for i in range(3)], axis=2)
        a = screen(a, up(bl) * bloom * np.array((1.0, 0.94, 0.84), F32))
    return screen(a, r)


def ring_frame(ch, i, box=None, halo=0.12, color=(1.0, 0.86, 0.68), bloom=0.22, vg=0.3):
    r = shot(ch, int(i), box)
    a = stage_ring(r, halo, color, bloom)
    if vg:
        a = a * vign(vg, 0.55)
    return a


# ---------------------------------------------------------------- 映像（作者の映像。0.8 倍にすると 24 → 30 こま／秒でそのまま 1 こまずつになる）
def foot_dir(name):
    d = os.path.join(WORK, "footage", "_f9", os.path.splitext(os.path.basename(name))[0])
    if not os.path.isdir(d) or not os.listdir(d):
        os.makedirs(d, exist_ok=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(WORK, "footage", name), "-q:v", "2", os.path.join(d, "%05d.jpg")], check=True)
    return d


@lru_cache(maxsize=8)
def foot_frame(name, i, box=None):
    d = foot_dir(name)
    n = len(os.listdir(d))
    i = int(clamp(i, 0, n - 1))
    im = Image.open(os.path.join(d, f"{i + 1:05d}.jpg")).convert("RGB")
    if box:
        x, y, w, h = box
        im = im.crop((int(x), int(y), int(x + w), int(y + h)))
    if im.size != (W, H):
        r = max(W / im.width, H / im.height)
        im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
        x0, y0 = (im.width - W) // 2, (im.height - H) // 2
        im = im.crop((x0, y0, x0 + W, y0 + H))
    return np.asarray(im, F32) / 255.0


def foot_at(name, t, t0=0.0, speed=0.8, box=None, src_fps=24000 / 1001):
    """映像の t0 秒から speed 倍で。こまの間は混ぜる（ゆっくりでもカクつかない）"""
    u = (t0 + t * speed) * src_fps
    i = int(math.floor(u))
    k = u - i
    a = foot_frame(name, i, box)
    if k < 0.02:
        return a
    return a * (1 - k) + foot_frame(name, i + 1, box) * k


def grade_flame(a):
    a = np.clip(a, 0, 1) ** 1.85 * 1.28
    a = a * np.array((1.0, 0.95, 0.90), F32)
    a = a * (0.25 + 0.75 * L.ramp(yy(), 60, 420))[..., None]
    s4 = small(a, 4)
    hi = np.clip((s4 - 0.6) / 0.4, 0, 1) * s4
    bl = np.stack([gauss(hi[..., i], 3) * 0.34 + gauss(hi[..., i], 12) * 0.32 for i in range(3)], axis=2)
    a = screen(a, up(bl) * np.array((1.0, 0.86, 0.72), F32))
    return a * vign(0.62, 0.42)


def grade_hands(a, gain=0.86):
    a = np.clip(a, 0, 1) ** 1.2 * gain
    return a * np.array((1.02, 0.98, 0.93), F32)


# ---------------------------------------------------------------- 紙と帳面（作って、ためる）
def cached_npy(name, fn):
    p = os.path.join(L.CACHE, name + ".npy")
    if os.path.exists(p):
        return np.load(p)
    a = fn()
    os.makedirs(L.CACHE, exist_ok=True)
    tmp = p + f".{os.getpid()}.npy"
    np.save(tmp, a.astype(F32))
    os.replace(tmp, p)
    return a


@lru_cache(maxsize=4)
def paper_ground(seed=3):
    return cached_npy(f"paper{seed}", lambda: L.paper(seed=seed))


@lru_cache(maxsize=2)
def ledger_ground(seed=9):
    def make():
        a = L.paper(seed=seed)
        t = L.TypeWeb()
        step = 132
        x = RIGHT - 30
        while x > 60:
            t.line(x, 66, x, H - 66, 0.75)
            x -= step
        t.line(0, 66, W, 66, 0.75)
        t.line(0, H - 66, W, H - 66, 0.75)
        return L.ink(a, t.end(), SHU, 0.34)

    return cached_npy(f"ledger{seed}", make)


@lru_cache(maxsize=4)
def drawing(box, scale, at, soften=0.0):
    return L.drawing_layer(box, scale, at, soften)


@lru_cache(maxsize=1)
def tsuba2():
    p = os.path.join(L.CACHE, "tsuba2.npz")
    if not os.path.exists(p):
        c, al = L.tsuba_cut()
        np.savez(p + ".tmp.npz", c=c.astype(F32), al=al.astype(F32))
        os.replace(p + ".tmp.npz", p)
    d = np.load(p)
    return d["c"], d["al"]


@lru_cache(maxsize=2)
def tsuba1():
    p = os.path.join(L.CACHE, "tsuba1.npz")
    if not os.path.exists(p):
        im = Image.open(os.path.join(HERITAGE, "mokume-tsuba-1-black.jpg")).convert("RGB")
        a = np.asarray(im, F32) / 255.0
        np.savez(p + ".tmp.npz", c=a)
        os.replace(p + ".tmp.npz", p)
    return np.load(p)["c"]


# ---------------------------------------------------------------- 場面
FN = {}
USES = {}


def scene(*chapters):
    def deco(fn):
        FN[fn.__name__] = fn
        USES[fn.__name__] = chapters
        return fn

    return deco


def vat(s, k=0):
    """場面の中の、k 本目の声の頭の秒"""
    return s["voice"][k]["at"] if len(s["voice"]) > k else 0.0


def vend(s, k=-1):
    v = s["voice"][k]
    return v["at"] + v["dur"]


# ---- 序
@scene()
def flame(s, t, f):
    a = grade_flame(foot_at("raw/anneal.mov", t, t0=1.0))
    k = fade(t, vat(s) - 0.15, 1.0)
    if k > 0:
        a = ink(a, V(RIGHT - 30, TOP + 6, "私は、"), SHIRO, k)
        a = ink(a, V(RIGHT - 126, TOP + 6, "彫金の職人です。"), SHIRO, k)
    return a


HAND_BOX_WIDE = None
HAND_BOX_TIGHT = (560, 300, 1024, 576)  # 手元に寄る（元の映像の px）


@scene()
def hands0(s, t, f):
    a = grade_hands(foot_at("raw/file_hands.mov", t, t0=3.4))
    return a * vign(0.5, 0.45)


def vanishing(s, t, small_lines, big, x_big, track=0.0, small_at=None, big_at=None, fade_at=None, after=None):
    a = L.ground().copy()
    y = yy()
    k0 = fade(t, (small_at if small_at is not None else vat(s) - 0.1), 0.9)
    for i, line in enumerate(small_lines):
        a = ink(a, V(x_big + 268 + (len(small_lines) - 1 - i) * 72, TOP + 18, line, "thin3", S, 0.14), SHIRO, k0)
    m = V(x_big, TOP - 28, big, "thin", XL, track)
    end_voice = vend(s)
    k1 = fade(t, big_at if big_at is not None else end_voice - 1.0, 0.8)
    # 声に合わせて、下から暗くなる
    p = sm((t - (fade_at if fade_at is not None else end_voice - 0.25)) / 1.7)
    g = 1 - p * (0.985 * L.ramp(y, 170, 930))
    a = ink(a, m * g, SHIRO, k1)
    if after:
        a = after(a, t)
    return a


@scene()
def vanish(s, t, f):
    return vanishing(s, t, ["職人がいなくなれば、", "その判断も"], "消えます。", 1040)


def title_plate(latin=True):
    y0 = 276 if latin else 350
    return V(W / 2, y0, "継ぐ", "thin", XL, -0.07)


def reveal_v(m, t, t0, d=1.4, y0=240, y1=720, edge=120.0):
    """読む向き（上から下）に、やわらかいふちが通る。字は動かない"""
    u = sm((t - t0) / d)
    if u >= 1:
        return m
    line = y0 + (y1 + edge - y0) * u
    return m * (1 - L.ramp(yy(), line - edge, line))


@scene()
def title(s, t, f):
    a = L.ground().copy()
    m = title_plate()
    a = screen(a, L.blur(m, 30)[..., None] * 0.05 * fade(t, 0.8, 1.4))
    a = ink(a, reveal_v(m, t, 0.25))
    a = ink(a, Hz(W / 2, 800, "TSUGU CRAFT", "thin3", T, 0.62, "c"), SHIRO, 0.9 * fade(t, 1.2, 0.9))
    a = ink(a, Hz(W / 2, 962, "職人の判断を、次の人へ。", "min", S, 0.14, "c"), SHIRO, fade(t, vat(s) + 0.5, 0.9))
    return a


# ---- 残す
LEDGER_X0 = RIGHT - 30 - 66  # 帳面の 1 列目の中心


def ledger_words(a, t, lines, t0, step=132, tag=None, px=LG, gap=0.45, y=108):
    cx = LEDGER_X0
    for i, line in enumerate(lines):
        a = ink(a, V(cx - step * i, y, line, "min", px, 0.06), INK, fade(t, t0 + i * gap, 0.9))
    if tag:
        a = ink(a, V(cx - step * len(lines), y + 4, tag, "sans", T, 0.30), INK, 0.78 * fade(t, t0 + len(lines) * gap, 0.8))
    return a


@scene()
def paper1(s, t, f):
    a = ledger_ground().copy()
    a = ledger_words(a, t, ["[8] ミリくらいの石なら、", "爪はだいたい", "[0.8]〜[1] ミリ。"], vat(s) - 0.15, tag="職人の言葉")
    return a


WORD_X = 760  # 幅 860 の真ん中 480 を 4 倍


@scene("word9")
def word(s, t, f):
    a0, a1 = vat(s, 0), vat(s, 1)
    pts = [(0, mark("word9", "typed", -12)), (0.5, mark("word9", "typed")), (a0 - 0.1, mark("word9", "typed", 24)), (a0 + 0.35, mark("word9", "wait")),
           (a1 - 0.3, mark("word9", "proposal", 30)), (a1 + 0.5, mark("word9", "applied", -2)), (a1 + 0.9, mark("word9", "applied"))]
    i = ramp_frame(pts, t)
    bx = meta("word9")["boxes"]
    # こまごとに見せる高さを変える（入れる所 → 案 → 帳面に入った所。切って替える。枠は動かさない）
    if i < mark("word9", "wait"):
        y = (bx["field"]["y"] - 6) * 4
        r = lift(shot("word9", int(i), (WORD_X, y, 1920, 1080)), 0.05)
        r = band(r, 0, (bx["go"]["y"] + bx["go"]["h"] - bx["field"]["y"] + 40) * 4, 0.3)
        r = edges(r, 70, 60)
    elif i < mark("word9", "applied"):
        y = (bx["proposal"]["y"] - 8) * 4
        r = lift(shot("word9", int(i), (WORD_X, y, 1920, 1080)), 0.05)
        r = band(r, 0, (bx["proposal"]["h"] + 24) * 4, 0.3)
    else:
        r = lift(shot("word9", int(i), (WORD_X, 0, 1920, 1080)), 0.05)
        r = band(r, 0, 170 * 4, 0.3)
    return edges(r, 24, 60)


BOOK_BOX = {"A": None, "B": None}


@scene("book9")
def book(s, t, f):
    a = L.ground().copy()
    n = meta("book9")
    i0 = n["marks"]["A"] + int(t * FPS)
    i1 = n["marks"]["B"] + int(t * FPS)
    # 半分ずつ：撮ったこま 3200×1800 の真ん中を、幅 960 に
    left = ring_half("book9", i0)
    right = ring_half("book9", i1)
    a[:, :960] = left
    a[:, 960:] = right
    a = a * vign(0.3, 0.55)
    k = fade(t, 0.25, 0.8)
    a = ink(a, Ln(960, 96, 960, H - 150, 0.75), SHIRO, 0.5 * k)
    a = ink(a, Hz(480, 968, "石川工房", "min", S, 0.08, "c"), SHIRO, k)
    a = ink(a, Hz(480, 1016, "丸い爪 ø 0.80 mm", "sans", T, 0.06, "c"), SHIRO, 0.9 * k)
    a = ink(a, Hz(1440, 968, "工房 B（見本の工房）", "min", S, 0.08, "c"), SHIRO, k)
    a = ink(a, Hz(1440, 1016, "尖り爪 ø 1.00 mm", "sans", T, 0.06, "c"), SHIRO, 0.9 * k)
    a = ink(a, Hz(W / 2, 1060, "この石の場合の例。目安・最後は職人が決める", "sans", 22, 0.08, "c"), SHIRO, 0.8 * fade(t, 0.9, 0.8))
    return a


def ring_half(ch, i):
    # 3200×1800 の、指輪のある所（x 480〜2480）を幅 960 に。上に寄せて、下に字の場所
    r0 = shot(ch, int(i), (480, 0, 2000, 1800), (960, 864))
    r = np.zeros((1080, 960, 3), F32)
    r[40:40 + 864] = r0
    s8 = np.asarray(Image.fromarray((r * 255).astype(np.uint8)).resize((120, 135), Image.BILINEAR), F32) / 255.0
    m = (s8.max(axis=2) > 0.05).astype(F32)
    g = np.asarray(Image.fromarray(gauss(m, 12) * 0.12 + gauss(m, 4) * 0.06, "F").resize((960, 1080), Image.BICUBIC), F32)
    bg = np.zeros_like(r)
    bg[:] = SUMI
    bg = screen(bg, g[..., None] * np.array((1.0, 0.86, 0.68), F32))
    return screen(bg, r)


# 糸（章の扉をつなぐ細い線）
DOORS = [("一", "デザインする人へ", 1440), ("二", "学ぶ人へ", 960), ("三", "次の時代へ", 480)]
Y_THREAD = 952


def thread_layer(a, color, op=1.0, draw=1.0, active=None):
    """糸と目印。draw：右から左へ引かれた割合"""
    if draw >= 1:
        a = ink(a, Ln(0, Y_THREAD, W, Y_THREAD, 0.75), color, 0.70 * op)
    else:
        xe = W * (1 - draw)
        m = Ln(0, Y_THREAD, W, Y_THREAD, 0.75) * L.ramp(xx(), xe - 30, xe + 30)
        a = ink(a, m, color, 0.70 * op)
    for j, (n2, _, x2) in enumerate(DOORS):
        kj = sm((draw * W - (W - x2) + 40) / 200.0)
        if kj <= 0:
            continue
        m = plate(("l", x2, Y_THREAD - 10, x2, Y_THREAD + 10, 1.0), ("h", x2, Y_THREAD + 52, n2, "min", T, 0, "c"))
        o = 1.0 if j == active else 0.42 if active is not None else 0.6
        a = ink(a, m, color, o * kj * op)
    return a


@scene()
def thread(s, t, f):
    a = L.ground().copy()
    u = sm((t - 0.3) / 1.8)
    a = thread_layer(a, SHIRO, draw=u)
    k = fade(t, vat(s) - 0.1, 0.9)
    a = ink(a, V(RIGHT - 30, TOP + 6, "残した判断は、", "min", M, 0.10), SHIRO, k)
    a = ink(a, V(RIGHT - 126, TOP + 6, "次の人へ。", "min", M, 0.10), SHIRO, fade(t, vat(s) + 0.7, 0.9))
    return a


def door_words(a, i, color, t):
    num, word, x = DOORS[i]
    k = fade(t, 0.35, 1.2)
    # 章の扉だけ：読む向きにふちが通る
    m = V(x, TOP + 6, word, "min", LG, 0.12)
    a = ink(a, reveal_v(m, t, 0.3, 1.2, y0=TOP, y1=TOP + 760), color)
    a = ink(a, V(x + 86, TOP + 10, "渡す", "min", T, 0.20), color, 0.94 * k)
    return a


@lru_cache(maxsize=1)
def door1_ground():
    def make():
        a = L.paper(seed=21)
        dl = L.drawing_layer((420, 330, 1780, 1400), 0.80, (96, 66))
        return L.ink(a, dl, INK, 0.46)

    return cached_npy("door1b", make)


@scene("draw9")
def door1(s, t, f):
    a = door1_ground().copy()
    a = door_words(a, 0, INK, t)
    return thread_layer(a, INK, active=0)


@scene()
def door2(s, t, f):
    a = grade_hands(foot_at("pexels/6263175.mp4", t, t0=0.3, speed=0.6, src_fps=PEXELS_FPS), 0.9)
    a = a * vign(0.5, 0.45)
    a = door_words(a, 1, SHIRO, t)
    return thread_layer(a, SHIRO, active=1)


@lru_cache(maxsize=1)
def door3_ground():
    def make():
        c, al = tsuba2()
        r, sil = L.place(c, al, 1.5, 1440 - 700 * 1.5, 860 - 700 * 1.5)
        bg = L.stage(sil, halo=0.04, halo_r=120, color=(1.0, 0.75, 0.55))
        a = L.over_black(bg, r * 0.72, sil)
        return L.vignette(a, 0.42, 0.5)

    return cached_npy("door3", make)


@scene()
def door3(s, t, f):
    a = door3_ground().copy()
    a = door_words(a, 2, SHIRO, t)
    return thread_layer(a, SHIRO, active=2)


# ---- 行き来の図：紙の上の本物の図面と、朱の線
FLOW_BASE = 985
FLOW_X = [LEFT, LEFT + 712]
ARC_END = FLOW_X[1] + 66
ARC_START = FLOW_X[0] + 220


def bez(p0, p1, p2, p3, u):
    v = 1 - u
    return (v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0], v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1])


ARC_P = ((ARC_END, FLOW_BASE - 82), (ARC_END - 90, FLOW_BASE - 300), (ARC_START + 90, FLOW_BASE - 300), (ARC_START, FLOW_BASE - 88))


@lru_cache(maxsize=4)
def arc_mask(w=2.8, seed=5):
    pen = L.Pen(seed)
    pts = [bez(*ARC_P, u) for u in np.linspace(0, 1, 16)]
    pen.stroke(pts, w=w)
    pen.stroke([(ARC_START - 22, FLOW_BASE - 126), (ARC_START, FLOW_BASE - 84)], w=w)
    pen.stroke([(ARC_START + 34, FLOW_BASE - 118), (ARC_START, FLOW_BASE - 84)], w=w)
    return pen.end()


@lru_cache(maxsize=2)
def circle_mask():
    pen = L.Pen(5)
    cx, cy, rx, ry = 1346, 240, 66, 86
    circ = []
    for u in np.linspace(0.04, 1.10, 30):
        ang = u * math.tau - 2.0
        wob = 1 + 0.025 * math.sin(u * 15) + 0.05 * (u - 0.5)
        circ.append((cx + rx * wob * math.cos(ang), cy + ry * wob * math.sin(ang)))
    pen.stroke(circ, w=2.6)
    return pen.end()


@lru_cache(maxsize=2)
def flow_ground():
    def make():
        a = L.paper()
        dl = L.drawing_layer((420, 390, 1780, 1390), 0.82, (770, 96))
        return L.ink(a, dl, INK, 0.60)

    return cached_npy("flow_b", make)


def dot(a, x, y, c, r=7.0, op=1.0):
    """動く小さな印"""
    x0, x1 = int(x - r - 2), int(x + r + 3)
    y0, y1 = int(y - r - 2), int(y + r + 3)
    x0, y0 = max(0, x0), max(0, y0)
    yy_, xx_ = np.mgrid[y0:y1, x0:x1].astype(F32)
    d = np.sqrt((xx_ - x) ** 2 + (yy_ - y) ** 2)
    k = np.clip(r + 0.5 - d, 0, 1)[..., None] * op
    a[y0:y1, x0:x1] = a[y0:y1, x0:x1] * (1 - k) + np.array(c, F32) * k
    return a


def flow_row(a, t0, t, op=1.0):
    k = fade(t, t0, 0.7) * op
    m = plate(("h", FLOW_X[0], FLOW_BASE, "デザイン・設計", "min", M, 0.02), ("h", FLOW_X[1], FLOW_BASE, "制作", "min", M, 0.02),
              ("l", FLOW_X[0] + 450, FLOW_BASE - 21, FLOW_X[1] - 20, FLOW_BASE - 21, 1.0),
              ("l", FLOW_X[1] - 33, FLOW_BASE - 27, FLOW_X[1] - 20, FLOW_BASE - 21, 1.0), ("l", FLOW_X[1] - 33, FLOW_BASE - 15, FLOW_X[1] - 20, FLOW_BASE - 21, 1.0))
    a = ink(a, m, INK, k)
    a = ink(a, Hz(FLOW_X[0] + 210, FLOW_BASE + 42, "CAD", "thin3", T, 0.20, "c"), INK, k)
    return a


@scene("draw9")
def flow(s, t, f):
    a = flow_ground().copy()
    a = flow_row(a, 0.2, t)
    k = fade(t, 0.25, 0.9)
    a = ink(a, V(LEFT + 224, TOP - 6, "デザイン・設計と", "min", M, 0.10), INK, k)
    a = ink(a, V(LEFT + 134, TOP - 6, "制作を、", "min", M, 0.10), INK, k)
    a = ink(a, V(LEFT + 44, TOP - 6, "行ったり来たり。", "min", M, 0.10), INK, fade(t, 0.8, 0.9))
    # 行き来：細い印が制作へ進み、朱の線に沿って戻る。片道 0.6 秒。1 往復 1.4 秒。3 回で少し止まる
    t0 = vat(s) + 0.1
    a = ink(a, circle_mask(), SHU, 0.95 * fade(t, t0 + 0.6, 0.5))
    arc = arc_mask()
    # 朱の線：往復のたびに少しずつ濃くなる（行ったり来たりの跡）
    n_done = 0
    x_a, x_b = FLOW_X[0] + 450, FLOW_X[1] - 20
    y_row = FLOW_BASE - 21
    for r in range(3):
        rt = t - (t0 + r * 1.4)
        if rt < 0:
            break
        n_done = r + 1
        if rt < 0.6:
            u = sm(rt / 0.6)
            a = dot(a, x_a + (x_b - x_a) * u, y_row, INK)
        elif rt < 1.3:
            u = sm((rt - 0.6) / 0.7)
            x, y = bez(*ARC_P, u)
            a = dot(a, x, y, SHU)
    if t > t0 + 0.55:
        # 線は制作から引かれる（1 回目の戻りで引き終わる）
        draw_u = sm((t - (t0 + 0.6)) / 0.75)
        if draw_u >= 1:
            mask = arc
        else:
            xe = ARC_END - (ARC_END - ARC_START + 80) * draw_u
            mask = arc * L.ramp(xx(), xe - 16, xe + 16)
        a = ink(a, mask, SHU, min(1.0, 0.72 + 0.14 * (n_done - 1)))
        ko = fade(t, t0 + 1.25, 0.4)
        if ko > 0:
            a = ink(a, Hz((ARC_END + ARC_START) / 2, FLOW_BASE - 268, "作れない", "min", S, 0.04, "c"), SHU, ko)
    if n_done:
        label = f"{n_done} 回目"
        a = ink(a, Hz((ARC_END + ARC_START) / 2, FLOW_BASE - 204, label, "sans", T, 0.08, "c"), SHU, 0.95 * fade(t, t0 + 1.25, 0.3))
    return a


# 継ぐの枠の位置
BOX = (LEFT - 36, FLOW_BASE - 208, LEFT + 490, FLOW_BASE + 78)


def box_mask(u=1.0):
    x0, y0, x1, y1 = BOX
    L_ = 2 * ((x1 - x0) + (y1 - y0))
    return plate(("l", x0, y0, x1, y0, 1.0), ("l", x1, y0, x1, y1, 1.0), ("l", x1, y1, x0, y1, 1.0), ("l", x0, y1, x0, y0, 1.0))


@scene("draw9")
def flow2(s, t, f):
    a = flow_ground().copy()
    a = flow_row(a, -9, t)
    a0 = vat(s)
    # 枠が包む（濃くなるだけ）
    k = fade(t, a0 - 0.1, 0.9)
    a = ink(a, box_mask(), INK, 0.85 * k)
    a = ink(a, Hz(BOX[0] + 24, BOX[1] + 48, "継ぐ", "min", S, 0.08), INK, k)
    a = ink(a, Hz(FLOW_X[0] + 150, FLOW_BASE - 86, "職人の判断", "min", M, 0.02), SHU, fade(t, a0 + 0.3, 0.9))
    # 朱の線はごく細く薄く
    a = ink(a, arc_mask(), SHU, 0.8 * (1 - fade(t, 0.1, 1.1)) + 0.0)
    faint = Ln_faint()
    a = ink(a, faint, SHU, 0.5 * fade(t, 0.7, 0.8))
    # 印は制作へまっすぐ。1 回だけ
    x_a, x_b = BOX[2], FLOW_X[1] - 20
    rt = t - (a0 + 0.7)
    if 0 <= rt <= 1.5:
        a = dot(a, x_a + (x_b - x_a) * sm(rt / 1.5), FLOW_BASE - 21, INK)
    a = ink(a, V(LEFT + 134, TOP - 6, "戻りは、", "min", M, 0.10), INK, fade(t, a0 + 0.1, 0.9))
    a = ink(a, V(LEFT + 44, TOP - 6, "ごく少なく。", "min", M, 0.10), INK, fade(t, a0 + 0.6, 0.9))
    return a


@lru_cache(maxsize=1)
def Ln_faint():
    # 制作から枠の上へ、ごく細い線（「なくなる」とは言わない）
    pen = L.Pen(8)
    pts = [(ARC_END, FLOW_BASE - 82), (ARC_END - 100, FLOW_BASE - 220), (BOX[2] + 60, FLOW_BASE - 262), (BOX[2] - 30, BOX[1] - 4)]
    pen.stroke(pts, w=0.8, taper=False)
    return pen.end()


# ---- 指輪が変わる
@scene("first9")
def firstnow(s, t, f):
    a0 = vat(s)
    sw = a0 + 1.9  # 切り替わる秒（声の途中）
    n = meta("first9")
    i_first = n["marks"]["first"] + int(t * FPS)
    i_now = n["marks"]["now"] + int(t * FPS)
    k = sm((t - sw) / 0.8)
    if k <= 0:
        a = ring_frame("first9", i_first)
    elif k >= 1:
        a = ring_frame("first9", i_now)
    else:
        a = ring_frame("first9", i_first) * (1 - k) + ring_frame("first9", i_now) * k
    # 右に縦で、今どちらの版か。数字は右下に横書きで小さく（縦書きの中の mm は横に寝てしまうので）
    k1 = fade(t, 0.5, 0.8) * (1 - sm((t - sw) / 0.5))
    if k1 > 0:
        a = ink(a, V(RIGHT - 30, TOP + 6, "最初の版。", "min", M, 0.10), SHIRO, k1)
        a = ink(a, V(RIGHT - 110, TOP + 10, "ネットの情報だけ。", "min", S, 0.10), SHIRO, k1)
        a = ink(a, Hz(RIGHT, 1016, "最初の版　爪 ø 1.66 mm", "sans", T, 0.06, "r"), SHIRO, 0.9 * k1)
    k2 = fade(t, sw + 0.3, 0.8)
    if k2 > 0:
        a = ink(a, V(RIGHT - 30, TOP + 6, "職人の言葉から。", "min", M, 0.10), SHIRO, k2)
        a = ink(a, Hz(RIGHT, 1016, "今の版　爪 ø 0.80 mm", "sans", T, 0.06, "r"), SHIRO, 0.9 * k2)
        a = ink(a, Hz(RIGHT, 1052, "目安・最後は職人が決める", "sans", 22, 0.08, "r"), SHIRO, 0.82 * k2)
    return a


# ---- 石：写真 → 輪郭 → 組み上がる → よくある形を押す
@scene("photo9")
def stone(s, t, f):
    a0 = vat(s)
    d = s["voice"][0]["dur"]
    mid = a0 + d * 0.5
    m = meta("photo9")["marks"]
    # 写真と輪郭のあとは、組み上がったあとの絵（黒の地）へ重ねてつなぐ（組んでいる間の方眼の画面は見せない）
    last_photo = PHOTO_LAST  # 写真が薄れて方眼が見えはじめる前の、最後のこま（撮ったこまで測った）
    if t < mid:
        pts = [(0, m["photo"] + 10), (mid, last_photo)]
        return shot("photo9", int(ramp_frame(pts, t)), None)
    pts = [(mid, m["stoneCard"]), (mid + 0.5, m["stoneCard"] + 24), (mid + 1.1, m["pear"] - 2), (mid + 1.2, m["pear"]), (s["len"], m["pear"] + 49)]
    k = sm((t - mid) / 0.45)
    r = shot("photo9", int(ramp_frame(pts, t)), None)
    if k < 1:
        r0 = shot("photo9", last_photo, None)
        return r0 * (1 - k) + r * k
    return r


PHOTO_LAST = 98


# ---- 言葉で腕まで変わる
GOTHIC_WHITE = (0.92, 0.94, 1.0)


@scene("gothic9")
def gothic(s, t, f):
    a0 = vat(s)
    d = s["voice"][0]["dur"]
    m = meta("gothic9")["marks"]
    sw = a0 + d * 0.62  # 見せるの大きな指輪へ
    if t < sw:
        pts = [(0, m["type"]), (a0 + 0.55, m["typed"]), (a0 + 1.0, m["go"]), (a0 + d * 0.5, m["done"]), (sw, m["done"] + 30)]
        i = ramp_frame(pts, t)
        return shot("gothic9", int(i), None)
    i = m["present"] + int((t - sw) * FPS)
    # 石の上が切れないよう、少し小さくして下げる
    kk = 0.86
    w, h = int(W * kk), int(H * kk)
    rr = np.zeros((H, W, 3), F32)
    rr[H - h - 20:H - 20, (W - w) // 2 - 60:(W - w) // 2 - 60 + w] = shot("gothic9", int(i), None, (w, h))
    a = stage_ring(rr, 0.09, GOTHIC_WHITE, 0.16) * vign(0.3, 0.55)
    k = sm((t - sw) / 0.6)
    if k < 1:
        r0 = shot("gothic9", int(m["done"] + 30), None)
        a = r0 * (1 - k) + a * k
    k2 = fade(t, sw + 0.4, 0.9)
    a = ink(a, V(RIGHT - 30, TOP + 6, "「ゴシックな感じ」", "min", M, 0.08), SHIRO, k2)
    a = ink(a, V(RIGHT - 112, TOP + 12, "写真の石のまま。断面と彫りまで。", "min", S - 6, 0.08), SHIRO, 0.95 * k2)
    a = ink(a, Hz(RIGHT, 1052, "彫りの深さ 0.25 mm（目安・最後は職人が決める）", "sans", 22, 0.06, "r"), SHIRO, 0.82 * k2)
    return a


# ---- Claude が職人に聞く
@scene("ask9")
def ask(s, t, f):
    a0, a1 = vat(s, 0), vat(s, 1)
    m = meta("ask9")["marks"]
    bx = meta("ask9")["boxes"]
    d0 = s["voice"][0]["dur"]
    pts = [(0, m["card"]), (a0 + d0 * 0.55, m["card"] + 12), (a0 + d0 * 0.8, m["answerOpen"] + 8), (a1 - 0.5, m["typed"] + 14), (a1 - 0.1, m["wait"]), (s["len"], m["draft"] + 28)]
    i = ramp_frame(pts, t)
    if i < m["answerOpen"]:
        y = max(0, bx["cardBox"]["y"] - 8) * 4
        r = lift(shot("ask9", int(i), (0, y, 1920, 1080)), 0.05)
        r = band(r, 0, (bx["cardBox"]["h"] + 16) * 4, 0.3)
    elif i < m["wait"]:
        y = 36 * 4
        r = lift(shot("ask9", int(i), (0, y, 1920, 1080)), 0.05)
    else:
        y = (bx["draftBox"]["y"] + 50) * 4
        r = lift(shot("ask9", int(i), (0, y, 1920, 1080)), 0.05)
    return edges(r, 24, 50)


# ---- 作れない所を、職人の言葉で教える
@scene("reason9")
def reason(s, t, f):
    a0, a1 = vat(s, 0), vat(s, 1)
    m = meta("reason9")["marks"]
    d1 = s["voice"][1]["dur"]
    pts = [(0, m["red"]), (max(0.3, a0 - 0.2), m["red"] + 20), (a0 + 0.5, m["open"]), (a0 + 1.0, m["read"]), (a1 + d1 * 0.45, m["read"] + 80), (a1 + d1 * 0.8, m["press"] + 1), (a1 + d1 * 0.8 + 0.2, m["fixed"]), (s["len"], m["fixed"] + 60)]
    i = ramp_frame(pts, t)
    return shot("reason9", int(i), None)


# ---- 作り方
@scene("make9")
def make(s, t, f):
    a0 = vat(s)
    d = s["voice"][0]["dur"]
    m = meta("make9")["marks"]
    pts = [(0, m["cast"]), (a0 + d * 0.3, m["cast"] + 30), (a0 + d * 0.48, m["forge"]), (a0 + d * 0.62, m["card"]), (a0 + d * 0.8, m["press"]), (a0 + d * 0.86, m["open"]), (s["len"], m["open"] + 60)]
    i = ramp_frame(pts, t)
    return shot("make9", int(i), None)


# ---- 完成した指輪（本物の映像。あるときだけ）
@scene()
def finished(s, t, f):
    return grade_hands(foot_at(s["foot"], t, t0=0.0, speed=1.0), 1.0)


# ---- 学校
@scene()
def school(s, t, f):
    a = L.ground().copy()
    a0, a1 = vat(s, 0), vat(s, 1)
    k = fade(t, a0 - 0.1, 0.9)
    a = ink(a, V(RIGHT - 30, TOP + 6, "学校では、", "min", M, 0.10), SHIRO, k)
    a = ink(a, V(RIGHT - 126, TOP + 6, "独自のデザインは、", "min", M, 0.10), SHIRO, fade(t, a0 + 0.4, 0.9))
    a = ink(a, V(RIGHT - 222, TOP + 6, "先生に聞くしかない。", "min", M, 0.10), SHIRO, fade(t, a0 + 0.9, 0.9))
    # 待っている印：細い縦線が並ぶ。先頭の 1 本だけ明るい
    n = 30
    x0, x1 = 120, 1160
    ym0, ym1 = 720, 900
    for j in range(n):
        x = x0 + (x1 - x0) * j / (n - 1)
        kj = fade(t, a0 + 0.15 * (n - 1 - j) * 0.14, 0.5)
        if kj <= 0:
            continue
        col = 0.95 if j == 0 else 0.46
        a[ym0:ym1, int(x)] = a[ym0:ym1, int(x)] * (1 - kj * col) + np.array(SHIRO, F32) * kj * col
    a = ink(a, Ln(x0 - 40, Y_THREAD, x1 + 40, Y_THREAD, 0.75), SHIRO, 0.5 * fade(t, 0.2, 0.8))
    a = ink(a, Hz(x0, ym0 - 26, "先生", "sans", T, 0.1, "c"), SHIRO, 0.95 * fade(t, a0 + 0.3, 0.8))
    a = ink(a, Hz(x1, ym0 - 26, "聞きたい生徒", "sans", T, 0.1, "r"), SHIRO, 0.9 * fade(t, a0 + 0.8, 0.8))
    k2 = fade(t, a1 - 0.1, 0.9)
    if k2 > 0:
        a = ink(a, plate(("v", 660, TOP - 28, "[1]時間", "thin", XL, 0.0)), SHIRO, k2)
    return a


# ---- 学ぶ
@scene("learn9")
def learn(s, t, f):
    a0 = vat(s)
    m = meta("learn9")["marks"]
    bx = meta("learn9")["boxes"]
    pts = [(0, m["type"] + 18), (a0 + 0.1, m["typed"] + 8), (a0 + 0.7, m["wait"]), (s["len"], m["answer"] + 29)]
    i = ramp_frame(pts, t)
    if i < m["wait"]:
        # 問いを打っている所：字の欄を、ほどよい高さに
        y = (bx["composer"]["y"] - 170) * 4
        r = lift(shot("learn9", int(i), (0, y, 1920, 1080)), 0.05)
        r = band(r, 150 * 4, 270 * 4, 0.32)
    else:
        y = (bx["answer"]["y"] + 6) * 4
        r = lift(shot("learn9", int(i), (0, y, 1920, 1080)), 0.05)
    return edges(r, 24, 50)


# ---- 工房
@scene()
def hands1(s, t, f):
    a = dark_right(grade_hands(foot_at("raw/file_hands.mov", t, t0=4.4), 0.8) * vign(0.55, 0.42), 1300, 1660, 0.8)
    k = fade(t, vat(s) + 0.1, 0.9)
    a = ink(a, V(RIGHT - 30, TOP + 6, "手順や数字は、", "min", M, 0.10), SHIRO, k)
    a = ink(a, V(RIGHT - 126, TOP + 6, "継ぐで確かめる。", "min", M, 0.10), SHIRO, fade(t, vat(s) + 0.7, 0.9))
    return a


@scene()
def hands2(s, t, f):
    a = dark_right(grade_hands(foot_at("raw/file_hands.mov", t, t0=1.2, box=HAND_BOX_TIGHT), 0.8) * vign(0.6, 0.4), 1360, 1740, 0.82)
    a = ink(a, V(RIGHT - 60, TOP + 6, "手の感覚", "min", LG, 0.14), SHIRO, fade(t, vat(s) + 0.5, 1.0))
    return a


# ---- 作り手の数
@scene()
def stat(s, t, f):
    a = L.ground().copy()
    a0 = vat(s)
    x0, x1 = 120, 1340
    y = 760
    r = 48 / 115  # 約 4.8 万人 ／ 約 11.5 万人（経済産業省の説明資料）
    u = sm((t - (a0 + 0.3)) / 2.2)
    xe = x1 + (x0 + (x1 - x0) * r - x1) * u
    k = fade(t, 0.2, 0.8)
    a = ink(a, Ln(x0, y, x1, y, 0.75), SHIRO, 0.28 * k)
    a = ink(a, Ln(x0, y, xe, y, 2.0), SHIRO, k)
    a = ink(a, Ln(x0, y - 16, x0, y + 16, 1.0), SHIRO, k)
    a = ink(a, Ln(x1, y - 10, x1, y + 10, 0.75), SHIRO, 0.42 * k)
    a = ink(a, Ln(xe, y - 16, xe, y + 16, 1.0), SHIRO, k)
    a = ink(a, Hz(x1, y - 44, "1998 年度　約 11.5 万人", "min", S, 0.04, "r"), SHIRO, 0.9 * k)
    a = ink(a, Hz(x0 + (x1 - x0) * r, y + 76, "2022 年度　約 4.8 万人", "min", S, 0.04, "c"), SHIRO, 0.95 * fade(t, a0 + 2.2, 0.8))
    a = ink(a, plate(("v", 1600, TOP - 28, "約[6]割", "thin", XL, 0.0)), SHIRO, fade(t, a0 + 1.6, 0.9))
    if MID_CREDITS:
        a = ink(a, Hz(x0, 1016, "伝統的工芸品の従業員数。出典：経済産業省の説明資料", "sans", 22, 0.08), SHIRO, 0.82 * fade(t, 0.8, 0.8))
    return a


# ---- 20 年に一度
@lru_cache(maxsize=1)
def naiku_ground():
    def make():
        im = Image.open(os.path.join(HERITAGE, "naiku-1953.jpg")).convert("RGB")
        a = L.cover(im)
        a = np.clip(a, 0, 1) ** 1.25 * 0.86
        a = a * np.array((1.02, 0.99, 0.95), F32)
        x, y = xx(), yy()
        dark = (1 - 0.74 * L.ramp(x, 1250, 1680)) * (1 - 0.72 * L.ramp(y, 860, 1040))
        return L.vignette(a * dark[..., None], 0.45, 0.5)

    return cached_npy("naiku_b", make)


@scene()
def naiku(s, t, f):
    a = naiku_ground().copy()
    a0 = vat(s)
    a = ink(a, V(RIGHT - 30, TOP + 6, "[20] 年に一度しか、", "min", M, 0.10), SHIRO, fade(t, a0 - 0.1, 0.9))
    a = ink(a, V(RIGHT - 126, TOP + 6, "受け継ぐ機会が", "min", M, 0.10), SHIRO, fade(t, a0 + 0.5, 0.9))
    a = ink(a, V(RIGHT - 222, TOP + 6, "ない技もある。", "min", M, 0.10), SHIRO, fade(t, a0 + 1.1, 0.9))
    k = fade(t, a0 + 1.6, 0.9)
    a = ink(a, Hz(LEFT, 1000, "たとえば、伊勢神宮の式年遷宮。関われるのは、多い人で 3 回ほど" + ("（国土交通白書）。" if MID_CREDITS else "。"), "sans", T, 0.04), SHIRO, 0.95 * k)
    if MID_CREDITS:
        a = ink(a, Hz(LEFT, 1040, "写真：1953 年の内宮（本田照夫 撮影。パブリックドメイン）", "sans", 22, 0.06), SHIRO, 0.82 * k)
    return a


# ---- 毛彫りを 1 本通す：職人が残す（答える・手本）／ 学ぶ人が受け取る（聞く・比べる）
COL_W, COL_H = 816, 860
COL_Y = 168
COL_X = (96, 1008)


def col_shot(ch, i, y_src, lf=0.09):
    """幅 480 の 4 倍のこま（1920 px）の、高さ y_src から COL_H ぶんを、幅 COL_W の欄に"""
    h_src = int(1920 * COL_H / COL_W)
    r = shot(ch, int(i), (0, y_src, 1920, h_src), (COL_W, COL_H))
    return lift(r, lf, 1.05)


def col_place(a, c, x, op=1.0, y=COL_Y):
    # 欄の上下の端はなめらかに暗く
    h = c.shape[0]
    g = (np.clip(np.arange(h, dtype=F32) / 26, 0, 1) * np.clip((h - 1 - np.arange(h, dtype=F32)) / 40, 0, 1))[:, None, None]
    a[y:y + h, x:x + c.shape[1]] = a[y:y + h, x:x + c.shape[1]] * (1 - op * g) + c * op * g
    return a


def kebori_foot():
    return "raw/kebori.mov" if os.path.exists(os.path.join(WORK, "footage", "raw", "kebori.mov")) else "kari_kebori.mov"


def foot_col(t, t0=1.0):
    name = kebori_foot()
    fps = 25.0 if name.startswith("kari") else 24000 / 1001
    a = foot_at(name, t, t0=t0, speed=0.8 if not name.startswith("kari") else 25 / 30, src_fps=fps)
    # 1920×1080 → 欄に合わせて切る（真ん中）
    r = COL_W / COL_H
    w = int(1080 * r)
    x0 = (W - w) // 2 + 180
    im = Image.fromarray((np.clip(a[:, x0:x0 + w], 0, 1) * 255).astype(np.uint8)).resize((COL_W, COL_H), Image.LANCZOS)
    return (np.asarray(im, F32) / 255.0) ** 1.1 * 0.92


@scene("kebori9", "hands9")
def kebori(s, t, f):
    a0, a1 = vat(s, 0), vat(s, 1)
    d1 = s["voice"][1]["dur"]
    t_model = a1 - 0.2                # 手本へ
    t_ask = a1 + d1 * 0.45            # 学ぶ人が聞く
    t_hand = a1 + d1 * 0.78           # 手を比べる
    a = L.ground().copy()
    m = meta("kebori9")["marks"]
    # 左の欄：答える（本当の帳面の決まり）→ 手本を残す（映像）
    k_l0 = fade(t, 0.3, 0.8) * (1 - sm((t - t_model) / 0.6))
    if k_l0 > 0:
        y = int(meta("kebori9")["boxes"]["ruleHead"]["y"] - 6) * 4
        a = col_place(a, col_shot("kebori9", m["rule"], y), COL_X[0], k_l0)
    k_l1 = fade(t, t_model, 0.6)
    if k_l1 > 0:
        a = col_place(a, foot_col(t - t_model), COL_X[0], k_l1)
    # 右の欄：はじめは技の頁の案内（4 つの段）を薄く → 聞く → 比べる
    k_g = 0.55 * fade(t, 0.5, 0.9) * (1 - sm((t - t_ask) / 0.5))
    if k_g > 0:
        a = col_place(a, col_shot("kebori9", m["top"], GUIDE_Y), COL_X[1], k_g)
    k_r0 = fade(t, t_ask, 0.6) * (1 - sm((t - t_hand) / 0.6))
    if k_r0 > 0:
        y = max(0, int(meta("kebori9")["boxes"]["thread"]["y"] + 6)) * 4
        a = col_place(a, col_shot("kebori9", m["answer"], y), COL_X[1], k_r0)
    k_r1 = fade(t, t_hand, 0.6)
    if k_r1 > 0:
        a = col_place(a, col_shot("hands9", meta("hands9")["marks"]["result"], 0), COL_X[1], k_r1)
    # 見出し：何の場面か
    k = fade(t, 0.2, 0.9)
    a = ink(a, Hz(COL_X[0], 92, "職人が残す", "min", S, 0.08), SHIRO, k)
    a = ink(a, Hz(COL_X[1], 92, "学ぶ人が受け取る", "min", S, 0.08), SHIRO, fade(t, t_ask - 0.2, 0.8))
    a = ink(a, Hz(COL_X[0] + COL_W, 92, "答える", "sans", T, 0.08, "r"), SHIRO, 0.95 * k * (1 - sm((t - t_model) / 0.4)))
    a = ink(a, Hz(COL_X[0] + COL_W, 92, "手本を残す", "sans", T, 0.08, "r"), SHIRO, 0.95 * fade(t, t_model + 0.2, 0.5))
    a = ink(a, Hz(COL_X[1] + COL_W, 92, "聞く", "sans", T, 0.08, "r"), SHIRO, 0.95 * fade(t, t_ask, 0.5) * (1 - sm((t - t_hand) / 0.4)))
    a = ink(a, Hz(COL_X[1] + COL_W, 92, "手を比べる", "sans", T, 0.08, "r"), SHIRO, 0.95 * fade(t, t_hand + 0.2, 0.5))
    # 細い糸（上）
    a = ink(a, Ln(LEFT, 118, COL_X[0] + COL_W, 118, 0.75), SHIRO, 0.5 * k)
    a = ink(a, Ln(COL_X[1], 118, COL_X[1] + COL_W, 118, 0.75), SHIRO, 0.5 * fade(t, t_ask - 0.2, 0.8))
    # 出典（仮の映像のあいだだけ。作者の映像に替わると消える）
    if kebori_foot().startswith("kari") and k_l1 > 0:
        a = ink(a, Hz(COL_X[0], 1052, "仮の映像：「Gravieren von Zinngeschirr」Gabriel Simons / LVR-Institut für Landeskunde und Regionalgeschichte（CC BY 3.0）。切り抜き・色を変更", "sans", 22, 0.02), SHIRO, 0.82 * k_l1)
    if k_r1 > 0:
        a = ink(a, Hz(COL_X[1] + COL_W, 1020, "この比べの画面は、作り話の例", "sans", 22, 0.06, "r"), SHIRO, 0.82 * k_r1)
    return a


GUIDE_Y = 30 * 4   # 技の頁の案内の所（撮ったこま 1920 px の高さ）
GUIDE_Y11 = 50 * 4  # 最終案 11：作り直した頁の「職人が残し、学ぶ人が受け取る」から（技の名前の題は入れない）


# ---- もし途絶えても
@scene()
def vanish2(s, t, f):
    a0 = vat(s)
    d = s["voice"][0]["dur"]

    def after(a, tt):
        # 消えていったあとに、次の言葉
        k = fade(tt, a0 + d * 0.5, 0.9)
        a = ink(a, V(700, TOP + 18, "復元を、", "thin3", S, 0.14), SHIRO, k)
        a = ink(a, V(628, TOP + 18, "試みることができる。", "thin3", S, 0.14), SHIRO, k)
        return a

    return vanishing(s, t, ["もし、"], "途絶えて", 1040, big_at=a0 + 0.15, fade_at=a0 + d * 0.42, after=after)


# ---- 木目金
@lru_cache(maxsize=1)
def mokume_ground():
    def make():
        c, al = tsuba2()
        s_ = 1.745
        r, sil = L.place(c, al, s_, -130 * s_, -500 * s_)
        r = L.from_img(L.to_img(r).filter(ImageFilter.UnsharpMask(radius=2.2, percent=45, threshold=2)))
        bg = L.stage(sil, halo=0.05, halo_r=120, color=(1.0, 0.75, 0.55))
        a = L.over_black(bg, r, sil)
        return L.vignette(a, 0.34, 0.55)

    return cached_npy("mokume", make)


@scene()
def mokume(s, t, f):
    a = mokume_ground().copy()
    a0, a1 = vat(s, 0), vat(s, 1)
    a = ink(a, V(1540, 126, "木目金", "min", LG, 0.16), SHIRO, fade(t, a0 + s["voice"][0]["dur"] - 1.3, 1.0))
    k = fade(t, a0 + 0.1, 0.9)
    a = ink(a, V(1436, 130, "江戸時代の、", "min", S, 0.10), SHIRO, k)
    a = ink(a, V(1378, 130, "刀の飾りの技。", "min", S, 0.10), SHIRO, k)
    a = ink(a, V(640, 130, "一時途絶えたとされ、", "min", S, 0.10), SHIRO, fade(t, a1 - 0.1, 0.9))
    a = ink(a, V(582, 130, "のちに復元された。", "min", S, 0.10), SHIRO, fade(t, a1 + 0.5, 0.9))
    a = ink(a, Hz(LEFT, 1056, "鐔：メトロポリタン美術館（CC0）", "sans", 22, 0.08), SHIRO, 0.82 * fade(t, 0.6, 0.8))
    return a


# ---- 途切れた技：手がかりと、職人の帳面を渡す
@scene("restore9", "rebuild9")
def restore(s, t, f):
    """n35：木目金の「手がかり 9」の欄 → 「職人の帳面も渡す」の札だけを寄りで（作り話の品の名前は映さない）"""
    a0 = vat(s)
    d = s["voice"][0]["dur"]
    sw = a0 + d * 0.5
    # 前半：答えの分かっている技（木目金）の、渡した手がかりの欄。手がかりの行を明るく、下の札は少し暗く
    mr = meta("rebuild9")
    cb = mr["boxes"]["cluesBox"]
    r0 = lift(shot("rebuild9", mr["marks"]["clues"], (0, 0, 1920, 1080)), 0.05)
    r0 = edges(band(r0, (cb["y"] - 4) * 4, (cb["y"] + 74) * 4, 0.45), 30, 60)
    k = sm((t - sw) / 0.6)
    if k <= 0:
        return r0
    # 後半：途切れた技の頁の「職人の帳面も渡す」の札だけ（例の頁なので、右下に注）
    mb = meta("restore9")
    bb = mb["boxes"]["bookCard"]
    y0, y1 = int((bb["y"] - 14) * 4), int((bb["y"] + bb["h"] + 10) * 4)
    card = lift(shot("restore9", mb["marks"]["book"], (0, y0, 1920, y1 - y0), (1920, y1 - y0)), 0.05)
    r1 = np.zeros((H, W, 3), F32)
    top = (H - card.shape[0]) // 2
    g = (np.clip(np.arange(card.shape[0], dtype=F32) / 24, 0, 1) * np.clip((card.shape[0] - 1 - np.arange(card.shape[0], dtype=F32)) / 24, 0, 1))[:, None, None]
    r1[top:top + card.shape[0]] = card * g
    r1 = ink(r1, Hz(W - 40, 1056, "画面の例は作り話", "sans", 22, 0.06, "r"), SHIRO, 0.85)
    return r0 * (1 - k) + r1 * k


# ---- 力試し：手がかりだけを渡す
@scene("rebuild9")
def rebuild(s, t, f):
    m = meta("rebuild9")["marks"]
    return edges(lift(shot("rebuild9", m["clues"], (0, 0, 1920, 1080)), 0.05), 30, 60)


# ---- 11 のうち 9
@scene()
def score(s, t, f):
    a = L.ground().copy()
    a0 = vat(s)
    d = s["voice"][0]["dur"]
    x0, x1 = 300, 1620
    y0, y1 = 300, 700
    t_each = max(0.18, (d * 0.72) / 11)
    # 撮った回の答え合わせ（rebuild3/grade.json）：一致 6（A2・A3・A7・A8・A10・A11）、一部 3（A1・A5・A9）、たどり着けず 2（A4・A6）
    kinds = [2, 1, 1, 0, 2, 0, 1, 1, 2, 1, 1]
    for j in range(11):
        x = int(x0 + (x1 - x0) * j / 10)
        kj = fade(t, a0 + 0.2 + j * t_each, 0.5)
        base = 0.16
        goal = {1: 1.0, 2: 0.5, 0: 0.16}[kinds[j]]
        o = base * fade(t, 0.1, 0.5) + (goal - base) * kj
        w = {1: 3, 2: 2, 0: 1}[kinds[j]] if kj > 0.5 else 1
        a[y0:y1, x - w // 2:x - w // 2 + w] = a[y0:y1, x - w // 2:x - w // 2 + w] * (1 - o) + np.array(SHIRO, F32) * o
    k = fade(t, a0 + d * 0.72, 0.9)
    a = ink(a, plate(("h", W / 2, 960, "9 / 11", "thin", XL - 40, 0.02, "c")), SHIRO, k)
    k2 = fade(t, a0 + d * 0.62, 0.8)
    a = ink(a, Hz(x0, 268, "隠しておいた、本当の 11 の手順", "min", S - 4, 0.08), SHIRO, fade(t, a0, 0.9))
    a = ink(a, Hz(x1 + 2, 760, "白：一致 6　薄い白：一部 3　暗い：たどり着けず 2", "sans", T, 0.04, "r"), SHIRO, 0.92 * k2)
    a = ink(a, Hz(W / 2, 1040, "4 回試して 9〜10 / 11（手がかりだけ。職人の帳面は渡していない）", "sans", 22, 0.06, "c"), SHIRO, 0.82 * k2)
    return a


# ---- ここまで届く
@lru_cache(maxsize=1)
def tsuba_big():
    def make():
        c = tsuba1()
        m = c.max(axis=2) > 0.06
        ys, xs = np.where(m.any(axis=1))[0], np.where(m.any(axis=0))[0]
        crop = c[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        k = 900 / crop.shape[0]
        im = Image.fromarray((crop * 255).astype(np.uint8)).resize((round(crop.shape[1] * k), 900), Image.LANCZOS)
        a = L.ground().copy()
        x, y = 150, 90
        arr = np.asarray(im, F32) / 255.0
        a[y:y + arr.shape[0], x:x + arr.shape[1]] = screen(a[y:y + arr.shape[0], x:x + arr.shape[1]], arr)
        return L.vignette(a, 0.3, 0.6)

    return cached_npy("tsuba_big_b", make)


@scene()
def tsuba(s, t, f):
    a = tsuba_big().copy()
    a0, a1 = vat(s, 0), vat(s, 1)
    k0 = fade(t, a0 - 0.1, 0.9)
    a = ink(a, V(RIGHT - 30, TOP + 6, "手がかりだけでも、", "min", M, 0.10), SHIRO, k0)
    a = ink(a, V(RIGHT - 126, TOP + 6, "ここまで届く。", "min", M, 0.10), SHIRO, fade(t, a0 + 0.6, 0.9))
    k1 = fade(t, a1 - 0.1, 0.9)
    a = ink(a, V(RIGHT - 262, TOP + 6, "職人の帳面が加われば、", "min", M, 0.10), SHIRO, k1)
    a = ink(a, V(RIGHT - 358, TOP + 6, "失われた技も、", "min", M, 0.10), SHIRO, fade(t, a1 + 0.9, 0.9))
    a = ink(a, V(RIGHT - 454, TOP + 6, "組み立て直せるかもしれない。", "min", M, 0.10), SHIRO, fade(t, a1 + 1.8, 0.9))
    a = ink(a, Hz(LEFT, 1056, "鐔：メトロポリタン美術館（CC0）", "sans", 22, 0.08), SHIRO, 0.82 * fade(t, 0.6, 0.8))
    return a


# ---- 工房に
@scene()
def paper2(s, t, f):
    a = ledger_ground(seed=11).copy()
    return ledger_words(a, t, ["工房に入れておけば、", "万が一の時に、", "役立つ。"], vat(s) - 0.1, tag=None, gap=0.5)


# ---- 結
@scene("tension9")
def ring2(s, t, f):
    if s.get("foot"):
        return grade_hands(foot_at(s["foot"], t, t0=0.0, speed=0.8), 1.0)
    i = meta("tension9")["marks"]["whole"] + int(t * FPS)
    k = 0.84
    w, h = int(W * k), int(H * k)
    r = np.zeros((H, W, 3), F32)
    r[(H - h) // 2 + 30:(H - h) // 2 + 30 + h, (W - w) // 2:(W - w) // 2 + w] = shot("tension9", int(i), None, (w, h))
    return stage_ring(r, 0.1, GOTHIC_WHITE, 0.2) * vign(0.3, 0.55)


FLOOR_K = 0.74  # 指輪全体を、画面の高さのこの割合に


@scene("ring9")
def finale(s, t, f):
    i = meta("ring9")["marks"]["whole"] + int(t * FPS)
    w, h = int(W * FLOOR_K), int(H * FLOOR_K)
    small_r = shot("ring9", int(i), None, (w, h))
    r = np.zeros((H, W, 3), F32)
    x0, y0 = (W - w) // 2, 70
    r[y0:y0 + h, x0:x0 + w] = small_r
    # 黒漆の台：指輪の下に映り込み
    m = r.max(axis=2) > 0.05
    ys = np.where(m.any(axis=1))[0]
    yb = int(ys.max()) + 1 if len(ys) else H - 40
    hh = min(H - yb, yb)
    ref = np.zeros_like(r)
    if hh > 0:
        ref[yb:yb + hh] = r[yb - hh:yb][::-1]
        ref = np.stack([gauss(ref[..., c], 2.4) for c in range(3)], axis=2)
    y = yy()
    fd = 0.34 * np.exp(-np.clip(y - yb, 0, None) / 62.0) * (y >= yb)
    a = stage_ring(r, 0.13, (1.0, 0.86, 0.68), 0.22)
    a = screen(a, (L.glow_at(W / 2, yb + 4, 620, 20, 2.0) * 0.07)[..., None] * np.array((1.0, 0.86, 0.68), F32))
    a = screen(a, ref * fd[..., None])
    a = a * vign(0.35, 0.55)
    k = fade(t, vat(s) - 0.1, 0.9)
    a = ink(a, Hz(W / 2, 1024, "職人の判断を、次の人へ。", "min", S, 0.14, "c"), SHIRO, k)
    return a


@scene()
def credit(s, t, f):
    a = L.ground().copy()
    a0 = vat(s)
    k = fade(t, a0 - 0.1, 0.9)
    a = ink(a, Hz(W / 2, 520, "このアプリも、私が Claude Code と作りました。", "min", S + 4, 0.08, "c"), SHIRO, k)
    g = s.get("git") or {}
    if g.get("commits"):
        a = ink(a, Hz(W / 2, 590, f"{g['first_day']} から {g['commits']} 回のコミット", "sans", T, 0.08, "c"), SHIRO, 0.9 * fade(t, a0 + 0.8, 0.9))
    return a



# ================================================================ 最終案 10（作者の声：速すぎる・急に寄った画面から入るので、どこの何の機能か分からない）
# 画面は、まず全体（アプリのまま）→ 押す所（マウスの印）→ 寄る（撮ったこまの切り抜き。枠は動かさず、重ねて替える）
NAME_LATIN = os.environ.get("NAME_LATIN", "end")  # 英字の名前（TSUGU CRAFT）：end＝最後の題だけ／none＝出さない／both＝はじめの題にも


def kof(ch):
    m = meta(ch)
    return m["size"][0] / {"word10": 1280, "gothic10": 1280, "reason10": 1280, "make10": 1280}.get(ch, 960)


def full_view(ch, i):
    """アプリの全体（撮ったこま全体を 1920×1080 に）。こまの番号は、撮った数の中に収める"""
    return shot(ch, int(clamp(int(i), 0, meta(ch)["frames"] - 1)), None)


def zoom_view(ch, i, cx, cy, z=1.0):
    """寄る：撮ったこま（3〜4 倍）から、点 (cx, cy)（ページの px）のまわりを切り抜く。z＞1 でさらに寄る（くずれない範囲で）"""
    m = meta(ch)
    i = int(clamp(int(i), 0, m["frames"] - 1))
    K = kof(ch)
    sw, sh = m["size"]
    w, h = 1920 / z, 1080 / z
    x = clamp(cx * K - w / 2, 0, sw - w)
    y = clamp(cy * K - h / 2, 0, sh - h)
    return shot(ch, int(i), (int(x), int(y), int(w), int(h)))


def box_center(ch, key, dx=0, dy=0):
    b = meta(ch)["boxes"][key]
    return b["x"] + b["w"] / 2 + dx, b["y"] + b["h"] / 2 + dy


def blend_views(a, b, t, t0, d=0.5):
    k = sm((t - t0) / d)
    if k <= 0:
        return a() if callable(a) else a
    if k >= 1:
        return b() if callable(b) else b
    A = a() if callable(a) else a
    B = b() if callable(b) else b
    return A * (1 - k) + B * k


# ---- 序
@scene()
def vanish10(s, t, f):
    # 字の組を、画面のまん中に（大きな字と小さな 2 行の組の中心が、画面の中心に来るように）
    return vanishing(s, t, ["職人がいなくなれば、", "その判断も"], "消えます。", 830, fade_at=vend(s) - 0.1)


@scene()
def title10(s, t, f):
    a = L.ground().copy()
    m = V(W / 2, 330, "継ぐ", "thin", XL, -0.07)
    a = screen(a, L.blur(m, 30)[..., None] * 0.05 * fade(t, 0.8, 1.4))
    a = ink(a, reveal_v(m, t, 0.3, 1.6))
    if NAME_LATIN == "both":
        a = ink(a, Hz(W / 2, 840, "TSUGU CRAFT", "thin3", T, 0.62, "c"), SHIRO, 0.9 * fade(t, 1.4, 0.9))
    return a


# ---- 残す：本物の画面の全体 → 職人の言葉を入れる所 → Claude の数字つきの案 → これでいい → 帳面に入る
@scene("word10")
def word10(s, t, f):
    v = s["voice"]
    a0, a1, a2 = v[0]["at"], v[1]["at"], v[2]["at"]
    m = meta("word10")["marks"]
    pts = [(0, m["full"]), (a0 - 0.6, m["full"] + 22), (a0 + 0.9, m["refine"] + 8), (a0 + v[0]["dur"] + 0.2, m["field"] + 4),
           (a1 - 0.2, m["type"] + 30), (a1 + v[1]["dur"] * 0.45, m["typed"] + 22), (a1 + v[1]["dur"] * 0.65, m["proposal"]),
           (a2 - 0.1, m["proposal"] + 40), (a2 + v[2]["dur"] * 0.55, m["applied"] + 2), (s["len"], m["applied"] + 40)]
    i = ramp_frame(pts, t)
    # 全体：確かめるのタブを押して、欄まで（a0 + 1.6 秒まで）→ 寄る：欄・案・帳面に入った所
    tz = a0 + v[0]["dur"] - 0.4
    if i < m["proposal"]:
        cx, cy = box_center("word10", "field", -150, 40)
    elif i < m["applied"]:
        cx, cy = box_center("word10", "proposal", -150, 0)
    else:
        cx, cy = box_center("word10", "flash", -150, 60)
    full = lambda: full_view("word10", i)  # noqa: E731
    zoom = lambda: zoom_view("word10", i, cx, cy)  # noqa: E731
    return blend_views(full, zoom, t, tz, 0.6)


# ---- 残す（最終案 11）：初めて見る人に、まず「言葉 → 決まり」を字だけでやさしく（作者の声：スッと入らない）
@scene()
def rule11(s, t, f):
    a = L.ground().copy()
    a0, a1, a2 = vat(s, 0), vat(s, 1), vat(s, 2)
    # 左：職人のふだんの言葉
    k0 = fade(t, a0 - 0.2, 0.9)
    a = ink(a, Hz(520, 300, "職人の言葉", "sans", T, 0.10, "c"), SHIRO, 0.82 * k0)
    for j, line in enumerate(("「このサイズの石なら、", "最低ライン 0.7 ミリは", "欲しい感じ。」")):
        a = ink(a, Hz(520, 410 + j * 74, line, "min", M - 6, 0.04, "c"), SHIRO, k0)
    # 矢印と Claude
    k1 = fade(t, a1 + 0.1, 0.7)
    a = ink(a, plate(("l", 900, 482, 1020, 482, 1.2), ("l", 1004, 472, 1020, 482, 1.2), ("l", 1004, 492, 1020, 482, 1.2)), SHIRO, k1)
    a = ink(a, Hz(960, 450, "Claude", "sans", T, 0.06, "c"), SHIRO, 0.9 * k1)
    # 右：数字のついた決まり
    k2 = fade(t, a1 + 0.6, 0.9)
    a = ink(a, Hz(1400, 300, "決まり", "sans", T, 0.10, "c"), SHIRO, 0.82 * k2)
    a = ink(a, Hz(1400, 420, "石　約 8 mm", "min", M - 6, 0.04, "c"), SHIRO, k2)
    a = ink(a, Hz(1400, 496, "↓", "min", M - 10, 0.0, "c"), SHIRO, 0.85 * k2)
    a = ink(a, Hz(1400, 572, "爪の太さ　最低 0.7 mm", "min", M - 6, 0.04, "c"), SHIRO, k2)
    # 下：これでいい → 帳面に残る → 設計の確かめに使う
    words = ("「これでいい」", "帳面に残る", "設計の確かめに使う")
    xs = (500, 960, 1430)
    for j, (w, x) in enumerate(zip(words, xs)):
        kj = fade(t, a2 + j * 0.7, 0.6)
        a = ink(a, Hz(x, 830, w, "min", S, 0.06, "c"), SHIRO, kj)
        if j:
            ka = fade(t, a2 + j * 0.7 - 0.2, 0.5)
            x0 = xs[j - 1] + (150 if j == 1 else 130)
            x1 = x - (130 if j == 1 else 200)
            a = ink(a, plate(("l", x0, 816, x1, 816, 1.0), ("l", x1 - 12, 808, x1, 816, 1.0), ("l", x1 - 12, 824, x1, 816, 1.0)), SHIRO, 0.7 * ka)
    return a


@scene("word10")
def word11(s, t, f):
    """本物の画面（声なし）：全体 → 確かめるを押す → 欄に打つ → 決まりにする → Claude の案 → これでいい → 帳面に入る"""
    m = meta("word10")["marks"]
    n = s["len"]
    pts = [(0, 18), (1.2, m["refine"] + 2), (1.6, m["field"]), (2.2, m["type"]), (3.6, m["typed"]), (4.1, m["wait"]), (5.6, m["proposal"] + 40), (6.4, m["applied"] + 2), (n, min(m["applied"] + 2 + int((n - 6.4) * FPS), meta("word10")["frames"] - 1))]
    i = ramp_frame(pts, t)
    if i < m["proposal"]:
        cx, cy = box_center("word10", "field", -150, 40)
    elif i < m["applied"]:
        cx, cy = box_center("word10", "proposal", -150, 0)
    else:
        cx, cy = box_center("word10", "flash", -150, 60)
    return blend_views(lambda: full_view("word10", i), lambda: zoom_view("word10", i, cx, cy), t, 1.7, 0.5)


# ---- 渡す 1：行き来の図（デザイン・設計 ⇄ 制作。制作から何度も戻る）。図面は爪が見た目で分かるほど細い（作れない）
FLOW10_Y = 880
FLOW10_X = (560, 1360)  # 2 つの字のまん中
FLOW10_DK = 0.46  # 図面の大きさ（撮った図面の px → 画面）。図面の下の端は 150 + 1070 × 0.46 ＝ 642
FLOW10_DX = 470   # 図面の左の端（幅 626 → 右の端 1096）。朱の字は 1180 から右
FLOW10_NOTE_X = 1180


@lru_cache(maxsize=2)
def drawing10(name):
    """継ぐの本物の図面（story/draw10/）の正面図だけを、画面のまん中に"""
    d = Image.open(os.path.join(STORY, "draw10", name + ".png")).convert("L")
    d = d.crop((420, 330, 1780, 1400))
    # 図面は小さめに上へ（下の朱の弧・字と、図面の線・寸法の字が重ならないように。作者の声 2026-11-06）
    k = FLOW10_DK
    d = d.resize((round(d.width * k), round(d.height * k)), Image.LANCZOS)
    m = 1 - np.asarray(d, F32) / 255.0
    out = np.zeros((H, W), F32)
    x0 = FLOW10_DX  # 左に寄せ、右の何もない所に朱の字を並べる（最終案 11）
    y0 = 150
    out[y0:y0 + m.shape[0], x0:x0 + m.shape[1]] = m
    return out, x0, y0, k


def flow10_row(a, t, k_row=1.0):
    m = plate(("h", FLOW10_X[0], FLOW10_Y, "デザイン・設計", "min", M, 0.02, "c"), ("h", FLOW10_X[1], FLOW10_Y, "制作", "min", M, 0.02, "c"),
              ("l", FLOW10_X[0] + 250, FLOW10_Y - 21, FLOW10_X[1] - 90, FLOW10_Y - 21, 1.0),
              ("l", FLOW10_X[1] - 103, FLOW10_Y - 27, FLOW10_X[1] - 90, FLOW10_Y - 21, 1.0), ("l", FLOW10_X[1] - 103, FLOW10_Y - 15, FLOW10_X[1] - 90, FLOW10_Y - 21, 1.0))
    a = ink(a, m, INK, k_row)
    a = ink(a, Hz(FLOW10_X[0], FLOW10_Y + 46, "CAD", "thin3", T, 0.20, "c"), INK, k_row)
    return a


# 戻りの弧は浅く低く（いちばん高い所が 880 − 143 ＝ 737。図面の下の端 642 より下）
ARC10 = ((FLOW10_X[1] - 10, FLOW10_Y - 62), (FLOW10_X[1] - 150, FLOW10_Y - 170), (FLOW10_X[0] + 150, FLOW10_Y - 170), (FLOW10_X[0] + 10, FLOW10_Y - 66))


@lru_cache(maxsize=2)
def arc10_mask(w=2.8):
    pen = L.Pen(7)
    pen.stroke([bez(*ARC10, u) for u in np.linspace(0, 1, 18)], w=w)
    e = ARC10[3]
    pen.stroke([(e[0] - 22, e[1] - 40), (e[0], e[1])], w=w)
    pen.stroke([(e[0] + 32, e[1] - 34), (e[0], e[1])], w=w)
    return pen.end()


def mark_xy(px, py):
    """撮った図面の点（切り抜きの前の px）→ 画面の点"""
    k = FLOW10_DK
    return FLOW10_DX + (px - 420) * k, 150 + (py - 330) * k


@lru_cache(maxsize=8)
def ring_mark(cx, cy, rx, ry, seed=5):
    """手で描いたような朱の丸（少し開いた輪）"""
    pen = L.Pen(seed)
    pts = []
    for u in np.linspace(0.04, 1.10, 30):
        ang = u * math.tau - 2.0
        wob = 1 + 0.025 * math.sin(u * 15) + 0.05 * (u - 0.5)
        pts.append((cx + rx * wob * math.cos(ang), cy + ry * wob * math.sin(ang)))
    pen.stroke(pts, w=2.6)
    return pen.end()


# 朱入れ：1 回目は 2 つ（爪・ロウ付け）、2 回目（直した図面）は 1 つ（石の先）。印は図面の上、字は右の何もない所に
FLOW_NOTES = {
    "prong": (1130, 520, 52, 74, "爪が細すぎる"),
    "solder": (1010, 630, 30, 30, "ロウ付けしにくい"),
    "culet": (1145, 660, 28, 28, "石の先が指に当たる"),
}


def flow_note(a, key, t, t_on, t_off=None, row=0):
    px, py, rx, ry, word = FLOW_NOTES[key]
    k = fade(t, t_on, 0.5)
    if t_off is not None:
        k *= 1 - sm((t - t_off) / 0.6)
    if k <= 0:
        return a
    cx, cy = mark_xy(px, py)
    r = FLOW10_DK / 0.58
    a = ink(a, ring_mark(round(cx), round(cy), round(rx * r), round(ry * r)), SHU, 0.95 * k)
    y = 330 + row * 64
    a = ink(a, ring_mark(FLOW10_NOTE_X + 12, y - 13, 11, 11, 3), SHU, 0.95 * k)
    return ink(a, Hz(FLOW10_NOTE_X + 40, y, word, "min", S - 4, 0.04), SHU, k)


@lru_cache(maxsize=2)
def circle10():
    """図面の爪に朱の丸（ok.png と thin.png は同じ置き方）"""
    _, x0, y0, k = drawing10("thin")
    # 正面図の右の爪（撮った図面の px → 画面）
    cx, cy = x0 + (1130 - 420) * k, y0 + (520 - 330) * k
    r = k / 0.58
    pen = L.Pen(5)
    pts = []
    for u in np.linspace(0.04, 1.10, 30):
        ang = u * math.tau - 2.0
        wob = 1 + 0.025 * math.sin(u * 15) + 0.05 * (u - 0.5)
        pts.append((cx + 52 * r * wob * math.cos(ang), cy + 74 * r * wob * math.sin(ang)))
    pen.stroke(pts, w=2.6)
    return pen.end(), cx, cy


@scene()
def flow10(s, t, f):
    """行ったり来たり：1 回目の戻りで朱入れ 2 つ（爪が細すぎる・ロウ付けしにくい）→ 直した図面 → 2 回目の戻りでまた 1 つ（石の先が指に当たる）"""
    t0 = vat(s) + 0.2
    t_fix = t0 + 4.2                      # 直した図面に替わる
    a = paper_ground(4).copy()
    k_fix = sm((t - t_fix) / 0.8)
    if k_fix < 1:
        a = ink(a, drawing10("thin")[0], INK, 0.62 * (1 - k_fix))
    if k_fix > 0:
        a = ink(a, drawing10("low")[0], INK, 0.62 * k_fix)
    a = ink(a, Hz(W / 2, 112, "デザイン・設計と制作を、行ったり来たり。", "min", M, 0.04, "c"), INK, fade(t, 0.2, 1.0))
    a = flow10_row(a, t, fade(t, 0.3, 0.8))
    # 戻る：印が制作へ進み（0.6 秒）、朱の弧に沿って戻る（0.7 秒）。1 回目は t0、2 回目は t_fix + 0.4
    xa, xb = FLOW10_X[0] + 250, FLOW10_X[1] - 90
    n_done = 0
    for r, ts in enumerate((t0, t_fix + 0.4)):
        rt = t - ts
        if rt < 0:
            break
        n_done = r + 1
        if rt < 0.6:
            a = dot(a, xa + (xb - xa) * sm(rt / 0.6), FLOW10_Y - 21, INK)
        elif rt < 1.3:
            x, y = bez(*ARC10, sm((rt - 0.6) / 0.7))
            a = dot(a, x, y, SHU)
    if t > t0 + 0.6:
        u = sm((t - (t0 + 0.65)) / 0.7)
        arc = arc10_mask()
        if u < 1:
            xe = ARC10[0][0] - (ARC10[0][0] - ARC10[3][0] + 80) * u
            arc = arc * L.ramp(xx(), xe - 16, xe + 16)
        a = ink(a, arc, SHU, 0.75 if n_done < 2 else 0.9)
        # 「作れない」「N 回目」は、弧のいちばん高い所のすぐ上の、何もない所に（図面の下の端 642 と弧 737 の間）
        a = ink(a, Hz(W / 2 - 30, FLOW10_Y - 168, "作れない", "min", S, 0.04, "c"), SHU, fade(t, t0 + 1.1, 0.4))
    if n_done:
        a = ink(a, Hz(W / 2 + 70, FLOW10_Y - 168, f"{n_done} 回目", "sans", T, 0.08), SHU, 0.95 * fade(t, t0 + 1.2 if n_done == 1 else t_fix + 1.7, 0.3))
    # 朱入れ（印は図面の上、字は右）
    a = flow_note(a, "prong", t, t0 + 1.4, t_fix - 0.2, 0)
    a = flow_note(a, "solder", t, t0 + 2.5, t_fix - 0.2, 1)
    a = flow_note(a, "culet", t, t_fix + 1.8, None, 0)
    return a


BOX10 = (FLOW10_X[0] - 250, FLOW10_Y - 200, FLOW10_X[0] + 250, FLOW10_Y + 80)


@scene()
def flow10b(s, t, f):
    a = paper_ground(4).copy()
    dl, *_ = drawing10("ok")
    a = ink(a, dl, INK, 0.62)
    a = ink(a, Hz(W / 2, 112, "継ぐがあれば、戻りは、ごく少なく。", "min", M, 0.04, "c"), INK, fade(t, 0.5, 1.0))
    a = flow10_row(a, t)
    x0, y0, x1, y1 = BOX10
    k = fade(t, 0.2, 0.9)
    a = ink(a, plate(("l", x0, y0, x1, y0, 1.0), ("l", x1, y0, x1, y1, 1.0), ("l", x1, y1, x0, y1, 1.0), ("l", x0, y1, x0, y0, 1.0)), INK, 0.85 * k)
    a = ink(a, Hz(x0 + 24, y0 + 46, "継ぐ", "min", S, 0.08), INK, k)
    a = ink(a, Hz(FLOW10_X[0], FLOW10_Y - 92, "職人の判断", "min", M, 0.02, "c"), SHU, fade(t, 0.6, 0.9))
    # 戻りはごく細い線だけ。印は制作へまっすぐ
    pen_faint = faint10()
    a = ink(a, pen_faint, SHU, 0.45 * fade(t, 1.0, 0.8))
    rt = t - 1.4
    if 0 <= rt <= 1.6:
        a = dot(a, x1 + (FLOW10_X[1] - 90 - x1) * sm(rt / 1.6), FLOW10_Y - 21, INK)
    return a


@lru_cache(maxsize=1)
def faint10():
    pen = L.Pen(9)
    pts = [(FLOW10_X[1] - 10, FLOW10_Y - 62), (FLOW10_X[1] - 110, FLOW10_Y - 178), (BOX10[2] + 50, FLOW10_Y - 204), (BOX10[2] - 40, BOX10[1] - 4)]
    pen.stroke(pts, w=0.8, taper=False)
    return pen.end()


# ---- 最初の版と今の版：同じ向き・同じ大きさで並べる
@scene("first9")
def firstnow10(s, t, f):
    n = meta("first9")
    j = int(t * FPS * 0.62)  # 回る速さを少しゆっくりに（左右は同じこまの番号なので、同じ向き）
    a = L.ground().copy()
    a[:, :960] = first_half("first9", n["marks"]["first"] + min(j, 189))
    a[:, 960:] = first_half("first9", n["marks"]["now"] + j)
    a = a * vign(0.3, 0.55)
    k = fade(t, 0.4, 0.8)
    a = ink(a, Ln(960, 96, 960, H - 150, 0.75), SHIRO, 0.5 * k)
    a = ink(a, Hz(480, 968, "ネットの情報だけ", "min", S, 0.08, "c"), SHIRO, k)
    a = ink(a, Hz(480, 1016, "最初の版　爪 ø 1.66 mm", "sans", T, 0.06, "c"), SHIRO, 0.9 * k)
    k2 = fade(t, vat(s) + 1.2, 0.8)
    a = ink(a, Hz(1440, 968, "職人の言葉から", "min", S, 0.08, "c"), SHIRO, k2)
    a = ink(a, Hz(1440, 1016, "今の版　爪 ø 0.80 mm", "sans", T, 0.06, "c"), SHIRO, 0.9 * k2)
    a = ink(a, Hz(W / 2, 1060, "目安・最後は職人が決める", "sans", 22, 0.08, "c"), SHIRO, 0.8 * k2)
    return a


def first_half(ch, i):
    r0 = shot(ch, int(i), (500, 0, 2200, 1800), (960, 785))
    r = np.zeros((1080, 960, 3), F32)
    r[60:60 + 785] = r0
    s8 = np.ascontiguousarray(r[4::8, 4::8])
    m = (s8.max(axis=2) > 0.05).astype(F32)
    g = np.asarray(Image.fromarray(gauss(m, 12) * 0.12 + gauss(m, 4) * 0.06, "F").resize((960, 1080), Image.BICUBIC), F32)
    bg = np.zeros_like(r)
    bg[:] = SUMI
    bg = screen(bg, g[..., None] * np.array((1.0, 0.86, 0.68), F32))
    return screen(bg, r)


# ---- 言葉で腕まで変わる（今のアプリで、本物の Claude が組んだ「ゴシックな感じ」）
@scene("gothic10")
def gothic10(s, t, f):
    a0 = vat(s)
    d = s["voice"][0]["dur"]
    m = meta("gothic10")["marks"]
    pts = [(0, m["full"]), (a0 - 0.8, m["type"]), (a0 + 0.6, m["typed"]), (a0 + 1.2, m["go"]), (a0 + d * 0.62, m["done"]), (a0 + d * 0.82, m["done"] + 40),
           (a0 + d + 0.4, m["present"]), (s["len"], m["present"] + int((s["len"] - a0 - d - 0.4) * FPS))]
    i = ramp_frame(pts, t)
    tz = a0 - 1.0          # 希望の欄に寄る
    tz2 = a0 + d * 0.5     # 指輪が変わっていく所は全体で
    tp = a0 + d + 0.4      # 見せる（全体）
    tp2 = tp + 1.4         # 見せるの指輪に寄る
    if t < tz2:
        full = lambda: full_view("gothic10", i)  # noqa: E731
        zoom = lambda: zoom_view("gothic10", i, *box_center("gothic10", "wish", 160, -150))  # noqa: E731
        if t < tz + 0.6:
            return blend_views(full, zoom, t, tz, 0.6)
        return blend_views(zoom, full, t, tz2 - 0.6, 0.6)
    if t < tp2:
        return full_view("gothic10", i)
    return blend_views(lambda: full_view("gothic10", i), lambda: zoom_view("gothic10", i, 860, 380, 1.0), t, tp2, 0.7)


# ---- Claude が職人に聞く（帳面の画面の全体 → 書いて答える → 寄る）
@scene("ask10")
def ask10(s, t, f):
    a0, a1 = vat(s, 0), vat(s, 1)
    m = meta("ask10")["marks"]
    d0 = s["voice"][0]["dur"]
    pts = [(0, m["full"]), (a0 + d0 * 0.6, m["full"] + 26), (a0 + d0 + 0.3, m["answerOpen"] + 6), (a1 - 0.4, m["typed"] + 12), (a1 + 0.1, m["wait"]), (s["len"], m["draft"] + 28)]
    i = ramp_frame(pts, t)
    tz = a0 + d0 * 0.7
    if i < m["answerOpen"]:
        cx, cy = box_center("ask10", "card", 0, 40)
    elif i < m["wait"]:
        cx, cy = box_center("ask10", "cardOpen", 0, 30)
    else:
        cx, cy = box_center("ask10", "draftBox", 0, 20)
    return blend_views(lambda: full_view("ask10", i), lambda: zoom_view("ask10", i, cx, cy), t, tz, 0.6)


# ---- 作れない所を、職人の言葉で教える（全体 → 札を押す → 理由の窓に寄る → まとめて直す）
@scene("reason10")
def reason10(s, t, f):
    a0, a1 = vat(s, 0), vat(s, 1)
    d1 = s["voice"][1]["dur"]
    m = meta("reason10")["marks"]
    pts = [(0, m["red"]), (a0 - 0.2, m["red"] + 30), (a0 + 0.7, m["open"]), (a0 + 1.2, m["read"]), (a1 + d1 * 0.5, m["read"] + 70), (a1 + d1 * 0.85, m["press"] + 1), (a1 + d1 * 0.85 + 0.2, m["fixed"]), (s["len"], m["fixed"] + 58)]
    i = ramp_frame(pts, t)
    tz = a0 + 1.0
    cx, cy = box_center("reason10", "pop", -230, 40)
    return blend_views(lambda: full_view("reason10", i), lambda: zoom_view("reason10", i, cx, cy), t, tz, 0.6)


# ---- 作り方を自動で作る（全体のまま：手順を押す → 鋳造 → 鍛造 → 札が送られていく → 言葉を押すと開く。最後の札だけ軽く寄る）
# 作者の声（最終案 10 を見て）：寄ってから手順を送るのが分かりにくい。寄らずに、画面の全体のまま札が送られていく見せ方に
@scene("make10")
def make10(s, t, f):
    a0 = vat(s)
    d = s["voice"][0]["dur"]
    n = s["len"]
    m = meta("make10")["marks"]
    # 札の送り（card の前の 22 こま）を、ゆっくり 1.6 秒かけて見せる
    t_card = a0 + d * 0.62
    pts = [(0, m["full"] + 6), (a0 - 0.3, m["full"] + 34), (a0 + 0.3, m["cast"]), (a0 + d * 0.3, m["cast"] + 30), (a0 + d * 0.42, m["forge"]),
           (t_card - 1.6, m["card"] - 22), (t_card, m["card"]), (t_card + 0.9, m["press"] - 2), (t_card + 1.2, m["open"]), (n, min(m["open"] + int((n - t_card - 1.2) * FPS), meta("make10")["frames"] - 1))]
    i = ramp_frame(sorted(pts), t)
    tz = t_card + 1.6
    b = meta("make10")["boxes"].get("card") or meta("make10")["boxes"]["panel"]
    return blend_views(lambda: full_view("make10", i), lambda: css_crop("make10", i, b["x"] + b["w"] / 2 - 160, b["y"] + 200, 1040), t, tz, 0.7)


# ---- 学校：待つ生徒の線が 1 本ずつ増えて、1 時間に
@scene()
def school10(s, t, f):
    a = L.ground().copy()
    a0, a1 = vat(s, 0), vat(s, 1)
    k = fade(t, a0 - 0.1, 0.9)
    a = ink(a, V(RIGHT - 30, TOP + 6, "学校では、", "min", M, 0.10), SHIRO, k)
    a = ink(a, V(RIGHT - 126, TOP + 6, "独自のデザインは、", "min", M, 0.10), SHIRO, fade(t, a0 + 0.4, 0.9))
    a = ink(a, V(RIGHT - 222, TOP + 6, "先生に聞くしかない。", "min", M, 0.10), SHIRO, fade(t, a0 + 0.9, 0.9))
    n = 30
    x0, x1 = 120, 1160
    ym0, ym1 = 720, 900
    # 先生の 1 本はすぐ。生徒の線は 1 本ずつ、たたたた と増える（2 本目の声の頭までに並び終える）
    a = ink(a, Ln(x0 - 40, Y_THREAD, x1 + 40, Y_THREAD, 0.75), SHIRO, 0.5 * fade(t, 0.2, 0.8))
    t_start = a0 + 0.6
    t_end = max(t_start + 1.5, a1 - 0.2)
    for j in range(n):
        x = x0 + (x1 - x0) * j / (n - 1)
        tj = 0.3 if j == 0 else t_start + (t_end - t_start) * (j - 1) / (n - 2)
        kj = fade(t, tj, 0.12)
        if kj <= 0:
            continue
        col = 0.95 if j == 0 else 0.5
        a[ym0:ym1, int(x)] = a[ym0:ym1, int(x)] * (1 - kj * col) + np.array(SHIRO, F32) * kj * col
    a = ink(a, Hz(x0, ym0 - 26, "先生", "sans", T, 0.1, "c"), SHIRO, 0.95 * fade(t, 0.4, 0.8))
    a = ink(a, Hz(x1, ym0 - 26, "聞きたい生徒", "sans", T, 0.1, "r"), SHIRO, 0.9 * fade(t, t_start + 0.6, 0.8))
    k2 = fade(t, a1 - 0.1, 0.9)
    if k2 > 0:
        a = ink(a, plate(("v", 660, TOP - 28, "[1]時間", "thin", XL, 0.0)), SHIRO, k2)
    return a


# ---- 学ぶ（全体 → 問いを打つ → 答えに寄る）。最終案 11：作者の問い「長辺 8.8 mm くらいの三角の石を留めたい。爪の太さは、どれくらい？」で撮り直した learn11
@scene("learn11")
def learn10(s, t, f):
    a0 = vat(s)
    m = meta("learn11")["marks"]
    pts = [(0, m["full"]), (a0 - 1.2, m["full"] + 20), (a0 - 0.2, m["typed"] + 6), (a0 + 0.5, m["wait"]), (s["len"], m["answer"] + 38)]
    i = ramp_frame(pts, t)
    tz = a0 + 0.9
    b = meta("learn11")["boxes"]["thread"]
    return blend_views(lambda: full_view("learn11", i), lambda: css_crop("learn11", i, b["x"] + b["w"] / 2, box_center("learn11", "answer", 0, 30)[1], min(820, b["w"] + 40)), t, tz, 0.6)


# ---- 毛彫りを 1 本：声は n30 だけ。4 つの段を、ゆっくり順に（作り話の注は外した。仮の映像の出典は残す）
@scene("kebori9", "hands9")
def kebori10(s, t, f):
    a0 = vat(s)
    # それぞれの画面を読める長さ（約 3 秒ずつ）。移り変わりは 1 秒かけて（作者の声：移るのが速すぎる）
    t_model = a0 + 3.0
    t_ask = a0 + 5.7
    t_hand = a0 + 8.4
    a = L.ground().copy()
    m = meta("kebori9")["marks"]
    k_l0 = fade(t, 0.3, 0.8) * (1 - sm((t - t_model) / 1.0))
    if k_l0 > 0:
        y = int(meta("kebori9")["boxes"]["ruleHead"]["y"] - 6) * 4
        a = col_place(a, col_shot("kebori9", m["rule"], y), COL_X[0], k_l0)
    k_l1 = fade(t, t_model, 1.0)
    if k_l1 > 0:
        a = col_place(a, foot_col(t - t_model), COL_X[0], k_l1)
    # 右：作り直した技の頁の案内（職人が残し、学ぶ人が受け取る。① 答える ② 手本を残す → ③ 聞く ④ 手を比べる）。技の名前の題は切り抜きの外（GUIDE_Y11）
    k_g = fade(t, 0.5, 0.9) * (1 - sm((t - t_ask) / 1.0))
    if k_g > 0:
        a = col_place(a, col_shot("kebori9", m["top"], GUIDE_Y11), COL_X[1], k_g)
    k_r0 = fade(t, t_ask, 1.0) * (1 - sm((t - t_hand) / 1.0))
    if k_r0 > 0:
        y = max(0, int(meta("kebori9")["boxes"]["thread"]["y"] + 6)) * 4
        a = col_place(a, col_shot("kebori9", m["answer"], y), COL_X[1], k_r0)
    k_r1 = fade(t, t_hand, 1.0)
    if k_r1 > 0:
        a = col_place(a, col_shot("hands9", meta("hands9")["marks"]["result"], 0), COL_X[1], k_r1)
    k = fade(t, 0.2, 0.9)
    a = ink(a, Hz(COL_X[0], 92, "職人が残す", "min", S, 0.08), SHIRO, k)
    a = ink(a, Hz(COL_X[1], 92, "学ぶ人が受け取る", "min", S, 0.08), SHIRO, fade(t, t_ask - 0.2, 0.8))
    a = ink(a, Hz(COL_X[0] + COL_W, 92, "答える", "sans", T, 0.08, "r"), SHIRO, 0.95 * k * (1 - sm((t - t_model) / 0.4)))
    a = ink(a, Hz(COL_X[0] + COL_W, 92, "手本を残す", "sans", T, 0.08, "r"), SHIRO, 0.95 * fade(t, t_model + 0.2, 0.5))
    a = ink(a, Hz(COL_X[1] + COL_W, 92, "聞く", "sans", T, 0.08, "r"), SHIRO, 0.95 * fade(t, t_ask, 0.5) * (1 - sm((t - t_hand) / 0.4)))
    a = ink(a, Hz(COL_X[1] + COL_W, 92, "手を比べる", "sans", T, 0.08, "r"), SHIRO, 0.95 * fade(t, t_hand + 0.2, 0.5))
    a = ink(a, Ln(LEFT, 118, COL_X[0] + COL_W, 118, 0.75), SHIRO, 0.5 * k)
    a = ink(a, Ln(COL_X[1], 118, COL_X[1] + COL_W, 118, 0.75), SHIRO, 0.5 * fade(t, t_ask - 0.2, 0.8))
    if MID_CREDITS and kebori_foot().startswith("kari") and k_l1 > 0:
        a = ink(a, Hz(COL_X[0], 1052, "映像：「Gravieren von Zinngeschirr」Gabriel Simons / LVR-Institut für Landeskunde und Regionalgeschichte（CC BY 3.0）。切り抜き・色を変更", "sans", 22, 0.02), SHIRO, 0.82 * k_l1)
    return a


# ---- 木目金（n34 の声は外した。字だけ残す）
@scene()
def mokume10(s, t, f):
    a = mokume_ground().copy()
    a0 = vat(s)
    d = s["voice"][0]["dur"]
    a = ink(a, V(1540, 126, "木目金", "min", LG, 0.16), SHIRO, fade(t, a0 + d - 1.3, 1.0))
    k = fade(t, a0 + 0.1, 0.9)
    a = ink(a, V(1436, 130, "江戸時代の、", "min", S, 0.10), SHIRO, k)
    a = ink(a, V(1378, 130, "刀の飾りの技。", "min", S, 0.10), SHIRO, k)
    a = ink(a, V(640, 130, "一時途絶えたとされ、", "min", S, 0.10), SHIRO, fade(t, a0 + d + 0.3, 0.9))
    a = ink(a, V(582, 130, "のちに復元された。", "min", S, 0.10), SHIRO, fade(t, a0 + d + 0.9, 0.9))
    a = ink(a, Hz(LEFT, 1056, "鐔：メトロポリタン美術館（CC0）", "sans", 22, 0.08), SHIRO, 0.82 * fade(t, 0.6, 0.8))
    return a


# ---- 途切れた技：木目金の頁の全体 → 手がかり 9 → 職人の帳面も渡すの札（寄りだけ。作り話の品の名前は映さない。注は外した）
@scene("rebuild10", "restore9")
def restore10(s, t, f):
    a0 = vat(s)
    d = s["voice"][0]["dur"]
    m = meta("rebuild10")["marks"]
    sw = a0 + d * 0.55
    tz = a0 + 0.9
    pts = [(0, m["full"]), (a0 + 0.6, m["full"] + 26), (a0 + 1.0, m["open"]), (s["len"], m["open"] + 39)]
    i = ramp_frame(pts, t)
    if t < sw:
        full = lambda: full_view("rebuild10", i)  # noqa: E731
        zoom = lambda: zoom_view("rebuild10", i, *box_center("rebuild10", "cluesBox", 0, -60))  # noqa: E731
        return blend_views(full, zoom, t, tz, 0.6)
    mb = meta("restore9")
    bb = mb["boxes"]["bookCard"]
    y0, y1 = int((bb["y"] - 14) * 4), int((bb["y"] + bb["h"] + 10) * 4)
    card = lift(shot("restore9", mb["marks"]["book"], (0, y0, 1920, y1 - y0), (1920, y1 - y0)), 0.05)
    r1 = np.zeros((H, W, 3), F32)
    top = (H - card.shape[0]) // 2
    g = (np.clip(np.arange(card.shape[0], dtype=F32) / 24, 0, 1) * np.clip((card.shape[0] - 1 - np.arange(card.shape[0], dtype=F32)) / 24, 0, 1))[:, None, None]
    r1[top:top + card.shape[0]] = card * g
    r0 = zoom_view("rebuild10", i, *box_center("rebuild10", "cluesBox", 0, -60))
    k = sm((t - sw) / 0.6)
    return r0 * (1 - k) + r1 * k


# ---- 力試し：手がかりだけを渡す（同じ頁の手がかりの欄に寄ったまま）
@scene("rebuild10")
def rebuild10(s, t, f):
    m = meta("rebuild10")["marks"]
    i = min(m["open"] + 39 + int(t * FPS), meta("rebuild10")["frames"] - 1)
    return zoom_view("rebuild10", i, *box_center("rebuild10", "cluesBox", 0, 60))


# ---- 職人の帳面が加われば（n38 の声は外した）
@scene()
def tsuba10(s, t, f):
    a = tsuba_big().copy()
    a0 = vat(s)
    a = ink(a, V(RIGHT - 30, TOP + 6, "職人の帳面が加われば、", "min", M, 0.10), SHIRO, fade(t, a0 - 0.1, 0.9))
    a = ink(a, V(RIGHT - 126, TOP + 6, "失われた技も、", "min", M, 0.10), SHIRO, fade(t, a0 + 0.9, 0.9))
    a = ink(a, V(RIGHT - 222, TOP + 6, "組み立て直せるかもしれない。", "min", M, 0.10), SHIRO, fade(t, a0 + 1.8, 0.9))
    a = ink(a, Hz(LEFT, 1056, "鐔：メトロポリタン美術館（CC0）", "sans", 22, 0.08), SHIRO, 0.82 * fade(t, 0.6, 0.8))
    return a


# ---- 工房に入れておけば：本物の帳面の画面の全体
@scene("ledger10")
def ledger10(s, t, f):
    return full_view("ledger10", meta("ledger10")["marks"]["full"])


# ---- 継ぐで作れる形の幅（見本の形と、Claude が組んだゴシック。字なし）
SHAPES_ORDER = [("shapes11", "deco"), ("shapes11", "wing"), ("shapes11", "crossing")]  # 最終案 11：攻めたゴシックは外し、アールデコ（別の向き）と地金のみの指輪


@scene("shapes11")
def shapes10(s, t, f):
    n = len(SHAPES_ORDER)
    # はじめの形（攻めたゴシック）は、前の場面から黒をはさんで出てくる間（xf）の分だけ長く見せる
    xf = s.get("xf", 1.0)
    rest = (s["len"] - xf) / n
    bounds = [0.0] + [xf + rest * (k + 1) for k in range(n)]
    j = max(k for k in range(n) if t >= bounds[k]) if t >= 0 else 0
    seg = bounds[j + 1] - bounds[j]
    tl = t - bounds[j]

    def ring_at(jj, tt):
        ch, mk = SHAPES_ORDER[jj]
        i = meta(ch)["marks"][mk] + int(tt * FPS)
        return ring_frame(ch, i, None, halo=0.1, color=GOTHIC_WHITE if mk in ("attack", "deco") else (1.0, 0.86, 0.68), bloom=0.2)

    a = ring_at(j, tl)
    if j + 1 < n and tl > seg - 0.5:
        k = sm((tl - (seg - 0.5)) / 0.5)
        a = a * (1 - k) + ring_at(j + 1, 0) * k
    return a


@scene()
def title2(s, t, f):
    a = L.ground().copy()
    m = title_plate()
    a = screen(a, L.blur(m, 30)[..., None] * 0.05 * fade(t, 0.3, 1.0))
    a = ink(a, m, SHIRO, fade(t, vat(s) - 0.5, 1.0))
    if NAME_LATIN in ("end", "both"):
        a = ink(a, Hz(W / 2, 800, "TSUGU CRAFT", "thin3", T, 0.62, "c"), SHIRO, 0.9 * fade(t, vat(s) + 0.2, 0.9))
    return a



# ================================================================ 最終案 10 の続き（2026-11-06 作者の声：実際に使っている所を中心に。カーソルが本当に操作して、指輪がその場で変わる）
# どの画面も、まず全体 → 押す所 → 寄る（撮ったこまの切り抜きを重ねて替える。枠は動かさない）。手で変える操作は、声なしで短い見出しを 1 つずつ
# 出典は途中の画面に出さず、最後にまとめる（作者の判断 2026-11-06）。MID_CREDITS=1 で、前のように途中にも出す
MID_CREDITS = os.environ.get("MID_CREDITS") == "1"
CSSW = {"ask10": 960, "learn10": 960, "learn11": 960, "rebuild10": 960, "ledger10": 960}


def kof(ch):
    return meta(ch)["size"][0] / CSSW.get(ch, 1280)


def css_crop(ch, i, cx, cy, wcss):
    """撮ったこまの、ページの点 (cx, cy) を真ん中に、幅 wcss（ページの px）の 16:9 を切り抜いて 1920×1080 に（端ははみ出さない）"""
    m = meta(ch)
    i = int(clamp(int(i), 0, m["frames"] - 1))
    K = kof(ch)
    sw, sh = m["size"]
    w = min(sw, wcss * K)
    h = w * 9 / 16
    x = clamp(cx * K - w / 2, 0, sw - w)
    y = clamp(cy * K - h / 2, 0, sh - h)
    return shot(ch, int(i), (int(x), int(y), int(w), int(h)))


@lru_cache(maxsize=1)
def head_shade():
    y, x = np.mgrid[0:H, 0:W].astype(F32)
    d = np.clip(1 - np.sqrt((x / 1250) ** 2 + (y / 330) ** 2), 0, 1)
    return (d ** 1.2 * 0.7)[..., None]


@lru_cache(maxsize=1)
def head_shade_bl():
    y, x = np.mgrid[0:H, 0:W].astype(F32)
    d = np.clip(1 - np.sqrt((x / 1250) ** 2 + ((H - y) / 330) ** 2), 0, 1)
    return (d ** 1.2 * 0.7)[..., None]


def heading(a, text, t, t0, t1=None, pos="tl"):
    """操作の見出し（左上か左下。後ろを少し暗くして読めるように）"""
    k = fade(t, t0, 0.5)
    if t1 is not None:
        k *= 1 - sm((t - t1) / 0.4)
    if k <= 0:
        return a
    a = a * (1 - (head_shade() if pos == "tl" else head_shade_bl()) * k)
    return ink(a, Hz(LEFT, 146 if pos == "tl" else H - 104, text, "min", S + 6, 0.08), SHIRO, k)


def ops_frame(t, pts):
    return ramp_frame(pts, t)


OPS_Z = (840, 297, 880)       # 作る・確かめるの欄と指輪（右へずらした指輪と、右の欄）
OPS_MEASURE = (470, 360, 760)  # 正面から見た指輪の内側と、寸法の札


@scene("ops11")
def shape11(s, t, f):
    m = meta("ops11")["marks"]
    n = s["len"]
    i = ramp_frame([(0, 12), (1.35, m["yamagata"] + 2), (2.2, m["hirauchi"] - 13), (2.5, m["hirauchi"] + 2), (n, m["hirauchi"] + 2 + int((n - 2.5) * FPS))], t)
    tz = 1.5
    a = blend_views(lambda: full_view("ops11", i), lambda: css_crop("ops11", i, *OPS_Z), t, tz, 0.5)
    return heading(a, "腕の形を選ぶ", t, tz + 0.15)


@scene("ops11")
def section11(s, t, f):
    m = meta("ops11")["marks"]
    n = s["len"]
    # 最終案 11：前の「腕の形を選ぶ」を外したので、はじめに全体（押す所）を見せてから寄る
    i = ramp_frame([(0, m["hirauchi"] + 30), (1.0, m["draw"] - 18), (1.4, m["draw"]), (1.6, m["draw"] + 10), (3.3, m["dragged"]), (n, m["dragged"] + int((n - 3.3) * FPS))], t)
    a = blend_views(lambda: full_view("ops11", i), lambda: css_crop("ops11", i, *OPS_Z), t, 1.05, 0.5)
    return heading(a, "断面を手で描く", t, 1.2)


@scene("ops11")
def size11(s, t, f):
    m = meta("ops11")["marks"]
    n = s["len"]
    i = ramp_frame([(0, m["dragged"] + 54), (0.7, m["refine"]), (0.85, m["refine"] + 8), (1.15, m["gou0"]), (1.8, m["gou0"] + 28), (2.4, m["gou0"] + 47), (n, min(m["gou0"] + 47 + int((n - 2.4) * FPS), m["gou2"] + 20))], t)
    tz = 0.85
    a = blend_views(lambda: full_view("ops11", i), lambda: css_crop("ops11", i, *OPS_Z), t, tz, 0.45)
    return heading(a, "号を変える", t, tz + 0.15)


@scene("ops11")
def measure11(s, t, f):
    m = meta("ops11")["marks"]
    n = s["len"]
    i = ramp_frame([(0, m["gou2"] + 32), (0.7, m["front"]), (1.05, m["measure"] - 2), (1.85, m["measure"] + 23), (2.65, m["measured"]), (n, m["measured"] + int((n - 2.65) * FPS))], t)
    tz = 1.15
    a = blend_views(lambda: full_view("ops11", i), lambda: css_crop("ops11", i, *OPS_MEASURE), t, tz, 0.45)
    return heading(a, "寸法を引く", t, tz + 0.15, pos="bl")


# ---- 言葉で頼む（本物の Claude の「アールデコな感じ」。組んでいる途中の絵は使わず、作れますの出来上がりへ重ねて替える）
# 撮った章：deco11（本物の Claude に「アールデコな感じ」と頼んだ 4 回目の返事で撮った物。2026-11-06 作者が最終に決めた）。ゴシックの回は gothic11（GEN_CH=gothic11 で戻せる）
GEN_CH = os.environ.get("GEN_CH", "deco11")
GOTHIC_Z = (520, 300, 880)


@scene(GEN_CH)
def deco11(s, t, f):
    m = meta(GEN_CH)["marks"]
    a0 = vat(s)
    n = s["len"]
    t_go = a0 - 0.15            # 生成を押したこまが映る秒
    t_done = t_go + 0.9         # 出来上がり（作れます）へ重ねて替える秒
    if t < t_go + 0.05:
        i = ramp_frame([(0, 4), (0.7, m["type"] + 10), (t_go - 0.85, m["typed"] + 8), (t_go, m["go"] - 2)], t)
        return full_view(GEN_CH, i)
    j = m["done"] + int((t - t_done) * FPS) if t > t_done else m["done"]
    j = min(j, m["refine"] - 24)
    done_full = lambda: full_view(GEN_CH, j)  # noqa: E731
    if t < t_done + 0.6:
        k = sm((t - t_go) / (t_done + 0.6 - t_go))
        return full_view(GEN_CH, m["go"] - 2) * (1 - k) + done_full() * k
    return blend_views(done_full, lambda: css_crop(GEN_CH, j, *GOTHIC_Z), t, t_done + 1.6, 0.6)


# ---- 人が直す：爪を押して細くする → その場で作れない所 → 職人の言葉 → まとめて直す → 作れます
FIX_Z = (500, 300, 900)


@scene(GEN_CH)
def fix11(s, t, f):
    m = meta(GEN_CH)["marks"]
    a0, a1 = vat(s, 0), vat(s, 1)
    d1 = s["voice"][1]["dur"]
    n = s["len"]
    # 声（n18）の前に：確かめるを押す → 爪を押す → 太さのつまみを左へ → その場で赤（ここまで約 4 秒。台本の pre を 4.2 秒に固定）
    pts = [(0, m["refine"] - 22), (0.75, m["refine"] + 2), (1.0, m["refine"] + 10), (1.9, m["pop"]), (2.2, m["pop"] + 10),
           (3.5, m["thin"] - 2), (a0 + 0.1, m["thin"] + 5), (a0 + 1.6, m["thin"] + 30), (a1 - 0.6, m["reason"] - 4), (a1 + 0.3, m["reason"] + 14),
           (a1 + d1 + 0.2, m["press"] - 2), (a1 + d1 + 0.5, m["fixed"] + 2), (n, min(m["fixed"] + 2 + int((n - a1 - d1 - 0.5) * FPS), m["draw"] - 30))]
    pts = sorted(pts)
    i = ramp_frame(pts, t)
    tz = 1.3
    # 職人の言葉の窓を読む間は、窓と赤い爪にもう一段寄る
    tr0, tr1 = a1 - 0.2, a1 + d1 + 0.05
    if t < tr0 or t > tr1 + 0.5:
        return blend_views(lambda: full_view(GEN_CH, i), lambda: css_crop(GEN_CH, i, *FIX_Z), t, tz, 0.5)
    fix = lambda: css_crop(GEN_CH, i, *FIX_Z)  # noqa: E731
    near = lambda: css_crop(GEN_CH, i, *REASON_Z)  # noqa: E731
    # 同じこまの切り抜きどうしは、重ねる時間を短く（長いと、指輪が二重に見える）
    if t < tr1:
        return blend_views(fix, near, t, tr0, 0.3)
    return blend_views(near, fix, t, tr1, 0.3)


REASON_Z = (640, 250, 700)  # 窓の右の端（934）と、赤い爪（350 あたり）が入る


# ---- 図面と STL（声なし）。最終案 11：寄らずに全体のまま、図面を読める長さ見せる（作者の声：一瞬寄ってすぐ戻るのはやめる）
@scene(GEN_CH)
def out11(s, t, f):
    m = meta(GEN_CH)["marks"]
    n = s["len"]
    t_stl = n - 1.9
    if t < t_stl:
        i = ramp_frame([(0, m["fixed"] + 30), (0.9, m["draw"] - 2), (1.2, m["draw"] + 8), (t_stl, min(m["draw"] + 8 + int((t_stl - 1.2) * FPS), m["stl"] - 18))], t)
    else:
        i = ramp_frame([(t_stl, m["stl"] - 16), (t_stl + 0.6, m["stl"] + 2), (n, m["stl"] + 2 + int((n - t_stl - 0.6) * FPS))], t)
    return heading(full_view(GEN_CH, i), "図面と STL", t, 0.2)


# ---- 章の扉：手元の映像（作者の映像）の上に、章の名前
# 最終案 11：章の頭は、使ってよいネットの映像（Pexels。暗い工房の続き物）。色は今の暗い見た目にそろえる。冒頭の作者の映像（炎・ヤスリ）とは重ねない
PEXELS_FPS = 25.0


@scene()
def door1h(s, t, f):
    a = grade_hands(foot_at("pexels/6262756.mp4", t, t0=0.2, speed=0.6, src_fps=PEXELS_FPS), 0.78)
    a = a * vign(0.5, 0.45)
    a = door_words(a, 0, SHIRO, t)
    return thread_layer(a, SHIRO, active=0)


@scene()
def door3h(s, t, f):
    a = grade_hands(foot_at("pexels/6263749.mp4", t, t0=0.3, speed=0.6, src_fps=PEXELS_FPS), 0.8)
    a = a * vign(0.5, 0.45)
    a = door_words(a, 2, SHIRO, t)
    return thread_layer(a, SHIRO, active=2)


# ---- 行き来の図（1 場面にまとめた）：何度も戻る → 継ぐがあれば、戻りはごく少なく
@scene()
def flow11(s, t, f):
    # 2026-11-06 最終案 11：図面を小さく左上へ、弧を浅く低く。朱入れは 1 回目 2 つ・2 回目 1 つ（印は図面の上、字は右の何もない所）。弧・朱の字・図面の線と寸法の字が重ならない
    t_b = vat(s) + 0.2 + 4.2 + 3.7   # 2 回目の朱入れを読んでから、継ぐの枠に替わる
    if t < t_b + 0.7:
        a = flow10(s, t, f)
        if t > t_b:
            k = sm((t - t_b) / 0.7)
            a = a * (1 - k) + flow10b(s, t - t_b, f) * k
        return a
    return flow10b(s, t - t_b, f)


# ---- 途切れた技：木目金の鐔の写真の上で n32・n33
@scene()
def mokume11(s, t, f):
    a = mokume_ground().copy()
    a1 = vat(s, 1)
    d1 = s["voice"][1]["dur"]
    a = ink(a, V(1540, 126, "木目金", "min", LG, 0.16), SHIRO, fade(t, a1 + d1 - 1.5, 1.0))
    a = ink(a, V(1436, 132, "江戸時代の、刀の飾りの技。", "min", S, 0.10), SHIRO, fade(t, a1 + 0.2, 0.9))
    return a


# ---- 模様の試し（別の係が作った頁）：頁の全体 → 段が順に出る → 最後の 3 枚に寄る。n37 は頁の上で、n39 は 3 枚の上で
def moyou_zoom():
    b = meta("moyou11")["boxes"]
    bs = [b[k] for k in ("big0", "big1", "big2") if k in b]
    x0 = min(q["x"] for q in bs) - 18
    x1 = max(q["x"] + q["w"] for q in bs) + 18
    y0 = min(q["y"] for q in bs) - 14
    y1 = max(q["y"] + q["h"] for q in bs) + 10
    return (x0 + x1) / 2, (y0 + y1) / 2, max(x1 - x0, (y1 - y0) * 16 / 9)


@scene("moyou11")
def moyou11(s, t, f):
    m = meta("moyou11")["marks"]
    nfr = meta("moyou11")["frames"]
    a0 = vat(s, 0)
    a1 = vat(s, 1) if len(s["voice"]) > 1 else s["len"] - 4
    # 段：n37 の頭で ①、そこから 1.3 秒ごと。最後の 3 枚は、n39 の 1.6 秒前から
    t_s1 = a0 + 0.1
    t_fin = a1 - 1.8
    step = (t_fin - 0.5 - t_s1) / 4.6
    pts = [(0, m["full"] + 4), (t_s1 - 0.01, m["s1"] - 1)]
    for k in range(1, 6):
        tk = t_s1 + (k - 1) * step
        pts.append((tk, m[f"s{k}"]))
        nxt = m[f"s{k + 1}"] if k < 5 else m["final"]
        pts.append((t_s1 + k * step - 0.01 if k < 5 else t_fin - 0.01, nxt - 1))
    pts.append((t_fin, m["final"]))
    pts.append((s["len"], min(nfr - 1, m["final"] + int((s["len"] - t_fin) * FPS))))
    i = ramp_frame(sorted(pts), t)
    # 最後の 3 枚は頁の幅いっぱいに並ぶので、3 枚まとめては寄れない。1 枚ずつ寄る（本当の手順 → Claude の手順（黄の縁＝はがれ）→ 本物）→ 3 枚の並びに戻る
    tz = t_fin + 1.45
    views = [(tz, 0), (tz + 2.0, 1), (tz + 4.8, 2), (tz + 6.6, None)]  # 1 枚ずつ、読める長さ（2.0・2.8・1.8 秒）
    def view(k):
        if k is None:
            return lambda: full_view("moyou11", i)
        b = meta("moyou11")["boxes"][f"big{k}"]
        return lambda: css_crop("moyou11", i, b["x"] + b["w"] / 2, b["y"] + b["h"] / 2 - 6, 660)
    if t < tz:
        return full_view("moyou11", i)
    cur = None
    for j, (t0, k) in enumerate(views):
        if t >= t0:
            cur = j
    t0, k = views[cur]
    prev = views[cur - 1][1] if cur > 0 else "full"
    a_prev = (lambda: full_view("moyou11", i)) if prev == "full" else view(prev)
    # 全体と寄りの間は 0.6 秒、寄りどうし（同じこまの切り抜き）は 0.3 秒（長いと二重に見える）
    return blend_views(a_prev, view(k), t, t0, 0.3 if (prev not in ("full", None) and k is not None) else 0.6)


# ---- 結（最終案 11。作者の判断）：指輪は 1 つだけ。動画の主役のアールデコの指輪（本物の Claude が組んだ回）を、暗い部屋で、強い光の鋭い映り込みと弱い光のにじみで、ゆっくり回す。字はのせない
@scene("decoring11")
def decoring(s, t, f):
    i = meta("decoring11")["marks"]["whole"] + int(t * FPS)
    w, h = int(W * FLOOR_K), int(H * FLOOR_K)
    small_r = shot("decoring11", int(min(i, meta("decoring11")["frames"] - 1)), None, (w, h))
    r = np.zeros((H, W, 3), F32)
    x0, y0 = (W - w) // 2, 70
    r[y0:y0 + h, x0:x0 + w] = small_r
    m = r.max(axis=2) > 0.05
    ys = np.where(m.any(axis=1))[0]
    yb = int(ys.max()) + 1 if len(ys) else H - 40
    hh = min(H - yb, yb)
    ref = np.zeros_like(r)
    if hh > 0:
        ref[yb:yb + hh] = r[yb - hh:yb][::-1]
        ref = np.stack([gauss(ref[..., c], 2.4) for c in range(3)], axis=2)
    y = yy()
    fd = 0.30 * np.exp(-np.clip(y - yb, 0, None) / 62.0) * (y >= yb)
    a = stage_ring(r, 0.14, GOTHIC_WHITE, 0.26)
    a = screen(a, (L.glow_at(W / 2, yb + 4, 620, 20, 2.0) * 0.06)[..., None] * np.array(GOTHIC_WHITE, F32))
    a = screen(a, ref * fd[..., None])
    return a * vign(0.35, 0.55)


@scene()
def title3(s, t, f):
    """題「継ぐ」と「職人の判断を、次の人へ。」（n41 → n42）"""
    a = L.ground().copy()
    a0, a1 = vat(s, 0), vat(s, 1)
    m = title_plate()
    a = screen(a, L.blur(m, 30)[..., None] * 0.05 * fade(t, 0.3, 1.0))
    a = ink(a, m, SHIRO, fade(t, a0 - 0.4, 1.2))
    a = ink(a, Hz(W / 2, 860, "職人の判断を、次の人へ。", "min", S, 0.14, "c"), SHIRO, fade(t, a0 + 0.2, 1.0))
    if NAME_LATIN in ("end", "both"):
        a = ink(a, Hz(W / 2, 940, "TSUGU CRAFT", "thin3", T, 0.62, "c"), SHIRO, 0.85 * fade(t, a1 + 0.3, 0.9))
    return a


# ---- 出典（最後にまとめて）
SOURCES = [
    ("彫る手元の映像", ["「Gravieren von Zinngeschirr」Gabriel Simons / LVR-Institut für Landeskunde und Regionalgeschichte", "Wikimedia Commons（CC BY 3.0）。切り抜き・色を変更"]),
    ("木目金の鐔の写真", ["メトロポリタン美術館（CC0）"]),
    ("1953 年の内宮の写真", ["本田照夫 撮影、Wikimedia Commons（パブリックドメイン）"]),
    ("伝統的工芸品の作り手の数", ["経済産業省の資料"]),
    ("式年遷宮に関われる回数", ["国土交通白書"]),
    ("章の頭の工房の映像", ["Tima Miroshnichenko、Pexels（Pexels License）"]),
]


@scene()
def sources(s, t, f):
    a = L.ground().copy()
    k = fade(t, 0.15, 0.6)
    x0, x1 = 300, 760
    a = ink(a, Hz(x0, 300, "出典", "min", S, 0.12), SHIRO, k)
    y = 396
    for name, lines in SOURCES:
        a = ink(a, Hz(x0, y, name, "sans", T, 0.04), SHIRO, 0.95 * k)
        for j, ln in enumerate(lines):
            a = ink(a, Hz(x1, y + j * 40, ln, "sans", T - 2, 0.02), SHIRO, 0.86 * k)
        y += 40 * len(lines) + 34
    return a


# ---------------------------------------------------------------- 組む
def scene_frame(doc, idx, t, f):
    s = doc["scenes"][idx]
    return FN[s["id"]](s, t, f)


def full_frame(doc, idx, f_local):
    """場面 idx の、頭から f_local こま目（前の場面との重ねを含む）"""
    s = doc["scenes"][idx]
    t = f_local / FPS
    a = scene_frame(doc, idx, t, f_local)
    xf = s.get("xf", 0)
    if idx > 0 and t < xf:
        prev = doc["scenes"][idx - 1]
        tp = t + (s["start"] - prev["start"])
        b = scene_frame(doc, idx - 1, tp, f_local)
        u = t / xf
        if s.get("dip"):
            if u < 0.5:
                a = b * (1 - sm(u * 2)) + np.array(SUMI, F32) * sm(u * 2)
            else:
                a = np.array(SUMI, F32) * (1 - sm(u * 2 - 1)) + a * sm(u * 2 - 1)
        else:
            k = sm(u)
            a = b * (1 - k) + a * k
    # 全体の頭と終わり
    if idx == 0 and t < 0.8:
        a = a * sm(t / 0.8)
    end_t = s["start"] + t
    if end_t > doc["len"] - 1.2:
        a = a * sm((doc["len"] - end_t) / 1.2)
    return a


GRAIN_BY = {"word": 0.004, "ask": 0.004, "learn": 0.004, "restore": 0.004, "rebuild": 0.004, "stone": 0.003, "reason": 0.003, "make": 0.003, "paper1": 0.008, "paper2": 0.008, "flow": 0.008, "flow2": 0.008, "door1": 0.008}


def seg_frames(doc, idx):
    s = doc["scenes"][idx]
    if idx + 1 < len(doc["scenes"]):
        end = doc["scenes"][idx + 1]["start"]
    else:
        end = doc["len"]
    return int(round((end - s["start"]) * FPS))


# 場面ごとの動画を使い回すかどうかは、その場面（と前の場面）の関数の中身で決める。
# 場面に共通の道具（字の板・指輪の光・切り替えなど）を直したときは、COMMON を変える（全部の場面を組み直す）
COMMON = "2026-11-06h"


def scene_code(sid):
    import inspect

    fn = FN.get(sid)
    return inspect.getsource(fn) if fn else ""


def seg_key(doc, idx, code):
    s = doc["scenes"][idx]
    prev = doc["scenes"][idx - 1] if idx else None
    code = hashlib.sha1((COMMON + scene_code(s["id"]) + (scene_code(prev["id"]) if prev else "")).encode()).hexdigest()[:12]
    uses = list(USES.get(s["id"], ()))
    if prev:
        uses += list(USES.get(prev["id"], ()))
    stamps = {}
    for ch in uses:
        p = os.path.join(STORY, ch, "meta.json")
        if not os.path.exists(p):
            p = os.path.join(STORY, ch, "draw.png")
        stamps[ch] = os.path.getmtime(p) if os.path.exists(p) else 0
    # 全体の中の秒（start）は鍵に入れない：前の場面がのびても、この場面の絵は変わらない（前の場面との間の秒だけ入れる）
    rel = lambda x: {k: v for k, v in x.items() if k != "start"} if x else None  # noqa: E731
    gap = round(s["start"] - prev["start"], 3) if prev else 0
    blob = json.dumps([rel(s), rel(prev), gap, seg_frames(doc, idx), doc["len"] - s["start"] if idx == len(doc["scenes"]) - 1 else 0, stamps, code], sort_keys=True, ensure_ascii=False)
    return hashlib.sha1(blob.encode()).hexdigest()[:12]


def render_seg(args):
    doc, idx, path = args
    s = doc["scenes"][idx]
    n = seg_frames(doc, idx)
    tmp = path + ".tmp.mp4"
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "9", "-threads", "2", "-movflags", "+faststart", tmp]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    g = GRAIN_BY.get(s["id"], 0.011)
    for f in range(n):
        a = full_frame(doc, idx, f)
        a = finish(a, f + idx * 3, g)
        p.stdin.write((a * 255 + 0.5).astype(np.uint8).tobytes())
    p.stdin.close()
    p.wait()
    os.replace(tmp, path)
    return s["id"], n


def sheet(doc, names, cols=5, per=None):
    """場面ごとのこま送りの一覧：動画を作らず、場面の中を等しい間隔で見る"""
    out = os.path.join(WORK, "vc", "sheet9")
    os.makedirs(out, exist_ok=True)
    tw, th = 480, 270
    for idx, s in enumerate(doc["scenes"]):
        if names and s["id"] not in names:
            continue
        n = seg_frames(doc, idx)
        k = per or max(5, min(10, int(n / FPS * 1.4)))
        rows = (k + cols - 1) // cols
        im = Image.new("RGB", (cols * (tw + 6), rows * (th + 6)), (40, 40, 40))
        for j in range(k):
            f = int((j + 0.5) * n / k)
            a = finish(full_frame(doc, idx, f), f, GRAIN_BY.get(s["id"], 0.011))
            t = Image.fromarray((a * 255 + 0.5).astype(np.uint8)).resize((tw, th), Image.LANCZOS)
            im.paste(t, ((j % cols) * (tw + 6), (j // cols) * (th + 6)))
        p = os.path.join(out, f"{idx:02d}_{s['id']}.jpg")
        im.save(p, quality=90)
        print(p)


def one_frame(doc, name, t, path):
    for idx, s in enumerate(doc["scenes"]):
        if s["id"] == name:
            a = finish(full_frame(doc, idx, int(t * FPS)), 0, GRAIN_BY.get(name, 0.011))
            Image.fromarray((a * 255 + 0.5).astype(np.uint8)).save(path)
            print(path)
            return


def prepare(doc):
    # 台本に載らない物を場面へ渡す
    for s in doc["scenes"]:
        if s["id"] == "finished":
            s["foot"] = doc["foot"].get("finished")
        if s["id"] == "ring2":
            s["foot"] = doc["foot"].get("ring2")
        if s["id"] == "credit":
            s["git"] = doc["git"]
    return doc


def main():
    jpath, out = sys.argv[1], sys.argv[2]
    jobs = int(sys.argv[3]) if len(sys.argv) > 3 else 12
    only = sys.argv[4:]
    with open(jpath, encoding="utf8") as f:
        doc = prepare(json.load(f))
    if os.environ.get("SHEET"):
        with Pool(min(jobs, 8)) as pool:
            pool.starmap(sheet, [(doc, [s["id"]]) for s in doc["scenes"] if not only or s["id"] in only])
        return
    if os.environ.get("ONE"):
        name, t = os.environ["ONE"].split(":")
        one_frame(doc, name, float(t), out)
        return
    os.makedirs(SEG, exist_ok=True)
    with open(os.path.join(HERE, "reel9.py"), "rb") as f:
        code = hashlib.sha1(f.read()).hexdigest()[:12]
    work, paths = [], []
    for idx, s in enumerate(doc["scenes"]):
        key = seg_key(doc, idx, code)
        p = os.path.join(SEG, f"{idx:02d}_{s['id']}_{key}.mp4")
        paths.append(p)
        if os.path.exists(p):
            continue
        if only and s["id"] not in only:
            continue
        work.append((doc, idx, p))
    print(f"場面 {len(paths)}、組む {len(work)}")
    if work:
        with Pool(min(jobs, len(work))) as pool:
            for name, n in pool.imap_unordered(render_seg, work):
                print("組んだ", name, n, "こま", flush=True)
    if only:
        return
    lst = os.path.join(SEG, "_list.txt")
    with open(lst, "w", encoding="utf8") as f:
        for p in paths:
            f.write(f"file '{p}'\n")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", "-movflags", "+faststart", out], check=True)
    print("つないだ", out)


if __name__ == "__main__":
    main()
