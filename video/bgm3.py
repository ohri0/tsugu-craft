# 最終案の音楽を、一から作る（外の曲・外の音は使わない。使う権利で迷わない）。
# 120 拍／分、イ短調。台本（final.json）の "music"（小節ごとの場面）に合わせて、楽器を足し引きする。
#  - 覚えやすい 2 小節のくり返し（つかみの旋律）。式年遷宮の所だけ、同じ旋律を都節（日本の音階）で、琴のような音に
#  - ダン・ダン・ダン（3 つの打つ音）・上がる音・落ちる所（直前に 1 拍の無音）
#  - 太鼓に合わせて、低音と和音が息をする（サイドチェイン）。残響は、作った残響の形をたたみこむ
# 使い方：python -I bgm3.py final.json 出力.wav
import json, sys, wave
import numpy as np

SR = 48000
tl = json.load(open(sys.argv[1]))
BPM = tl.get("bpm", 120)
BEAT = 60 / BPM
BAR = 4 * BEAT
TOTAL = tl["len"] * BEAT + 3.0
N = int(TOTAL * SR)
rng = np.random.default_rng(7)

bus = {k: np.zeros((N, 2), np.float32) for k in ("drums", "bass", "pad", "lead", "fx", "send")}


def put(name, x, at, g=1.0, pan=0.0, send=0.0):
    a = int(round(at * SR))
    if a >= N or g == 0:
        return
    if x.ndim == 1:
        x = np.stack([x * (1 - max(0, pan)), x * (1 + min(0, pan))], 1)
    if a < 0:
        x = x[-a:]
        a = 0
    b = min(N, a + len(x))
    bus[name][a:b] += x[: b - a] * g
    if send:
        bus["send"][a:b] += x[: b - a] * g * send


hz = lambda m: 440.0 * 2 ** ((m - 69) / 12)
T = lambda d: np.arange(int(d * SR)) / SR


def env(t, a, d):
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / d)


def fft_filter(x, lo=None, hi=None):
    n = len(x)
    X = np.fft.rfft(x, n)
    f = np.fft.rfftfreq(n, 1 / SR)
    g = np.ones_like(f)
    if hi:
        g *= 1 / np.sqrt(1 + (f / hi) ** 4)
    if lo:
        g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1)) ** 4)
    return np.fft.irfft(X * g, n).astype(np.float32)


def fade_edges(x, a=0.003, b=0.02):
    n = len(x)
    ia, ib = int(a * SR), int(b * SR)
    if ia:
        x[:ia] *= np.linspace(0, 1, ia)
    if ib and ib < n:
        x[-ib:] *= np.linspace(1, 0, ib)
    return x


# ---------------------------------------------------------------- 楽器
def kick(g=1.0):
    t = T(0.5)
    f = 46 + 120 * np.exp(-t * 28)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(t, 0.001, 0.24)
    click = rng.standard_normal(len(t)) * env(t, 0.0003, 0.004) * 0.35
    return np.tanh(2.0 * (x + click)) * g


def clap():
    t = T(0.35)
    n = rng.standard_normal(len(t))
    n = fft_filter(n, lo=900, hi=5200)
    e = sum(env(np.maximum(0, t - o), 0.0008, 0.012) * (t >= o) for o in (0, 0.011, 0.023)) + env(np.maximum(0, t - 0.03), 0.001, 0.11) * (t >= 0.03)
    body = np.sin(2 * np.pi * 185 * t) * env(t, 0.001, 0.05) * 0.4
    return (n * e * 0.9 + body) * 0.8


def snare():
    t = T(0.25)
    n = fft_filter(rng.standard_normal(len(t)), lo=1500, hi=9000) * env(t, 0.0008, 0.07)
    body = np.sin(2 * np.pi * 200 * t) * env(t, 0.001, 0.04)
    return (n * 0.8 + body * 0.5) * 0.7


HAT_F = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]


def hat(open_=False):
    t = T(0.45 if open_ else 0.07)
    x = sum(np.sign(np.sin(2 * np.pi * f * 7.6 * t + i)) for i, f in enumerate(HAT_F))
    x = fft_filter(x + rng.standard_normal(len(t)) * 2, lo=7000, hi=16000)
    return x * env(t, 0.0005, 0.12 if open_ else 0.018) * 0.12


def crash():
    t = T(2.6)
    x = fft_filter(rng.standard_normal(len(t)), lo=4500, hi=15000)
    x2 = fft_filter(rng.standard_normal(len(t)), lo=4500, hi=15000)
    e = env(t, 0.002, 0.9)
    return np.stack([x * e, x2 * e], 1) * 0.3


def tom(m):
    t = T(0.6)
    f = hz(m) * (1 + 0.6 * np.exp(-t * 20))
    return np.tanh(1.5 * np.sin(2 * np.pi * np.cumsum(f) / SR) * env(t, 0.001, 0.25)) * 0.8


def saw(f, t, n=None):
    # 帯域を守ったのこぎり波（倍音を足す）
    n = n or max(1, min(40, int(16000 / f)))
    x = np.zeros_like(t)
    for k in range(1, n + 1):
        x += np.sin(2 * np.pi * f * k * t) / k
    return x * 0.6


def bass_note(m, d, pump=True):
    t = T(d)
    f = hz(m)
    x = saw(f, t, 12) * 0.5 + np.sin(2 * np.pi * f * t) * 0.9
    x = np.tanh(1.6 * x)
    x = fft_filter(x, hi=900)
    e = np.minimum(1, t / 0.006) * np.minimum(1, (d - t) / 0.03)
    return x * e * 0.55


def pad_chord(ms, d, bright=1200):
    t = T(d)
    x = np.zeros((len(t), 2), np.float32)
    for m in ms:
        for j, det in enumerate((-0.11, 0.0, 0.12)):
            f = hz(m) * 2 ** (det / 12)
            s = saw(f, t + rng.uniform(0, 0.01), 10)
            x[:, j % 2] += s * 0.5
            x[:, (j + 1) % 2] += s * 0.25
    x[:, 0] = fft_filter(x[:, 0], hi=bright)
    x[:, 1] = fft_filter(x[:, 1], hi=bright)
    e = np.minimum(1, t / 0.35) * np.minimum(1, (d - t) / 0.4)
    return x * e[:, None] * 0.07


def pluck(m, d=0.32, bright=1.0):
    # 倍音ごとに消える速さを変える（高い倍音ほど早く消える）→ はじく音
    t = T(d + 0.25)
    f = hz(m)
    x = np.zeros_like(t)
    for k in range(1, 16):
        if f * k > 15000:
            break
        x += np.sin(2 * np.pi * f * k * t + k) / k ** 1.1 * np.exp(-t * (6 + k * 3.2 / bright))
    x += np.sin(2 * np.pi * f * 2 * t) * 0.25 * np.exp(-t * 9)
    return fade_edges(x * np.minimum(1, t / 0.002) * 0.42)


def bell(m, d=2.2):
    t = T(d)
    f = hz(m)
    parts = [(1.0, 1.0, 1.4), (2.0, 0.6, 0.9), (2.76, 0.45, 0.7), (5.4, 0.25, 0.35), (8.93, 0.12, 0.2)]
    x = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / dec) for r, a, dec in parts)
    return fade_edges(x * np.minimum(1, t / 0.002) * 0.22)


def koto(m, d=1.8):
    # 琴のような、はじいた弦（カープラス・ストロング）
    f = hz(m)
    n = int(d * SR)
    p = max(2, int(SR / f))
    buf = rng.uniform(-1, 1, p).astype(np.float64)
    out = np.zeros(n)
    idx = 0
    prev = 0.0
    for i in range(n):
        v = buf[idx]
        nv = 0.5 * (v + buf[(idx + 1) % p]) * 0.9965
        buf[idx] = nv
        out[i] = v
        idx = (idx + 1) % p
    out = fft_filter(out, hi=5200)
    t = np.arange(n) / SR
    return fade_edges(out * np.minimum(1, t / 0.001) * 0.35)


def taiko():
    t = T(1.4)
    f = 58 * (1 + 0.5 * np.exp(-t * 14))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(t, 0.003, 0.45)
    skin = fft_filter(rng.standard_normal(len(t)), lo=120, hi=1800) * env(t, 0.001, 0.05) * 0.5
    return np.tanh(1.2 * (body + skin)) * 0.9


def impact():
    """ダン：低い落ちる音・太鼓・こすれる音・短い和音"""
    t = T(2.4)
    f = 62 * np.exp(-t * 1.3) + 30
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(t, 0.002, 0.9)
    tomx = np.sin(2 * np.pi * np.cumsum(95 * (1 + 0.8 * np.exp(-t * 18))) / SR) * env(t, 0.001, 0.22)
    nz = fft_filter(rng.standard_normal(len(t)), lo=200, hi=6000) * env(t, 0.001, 0.18) * 0.5
    st = T(0.5)
    stab = sum(saw(hz(m), st, 18) for m in (45, 52, 57, 60)) * env(st, 0.004, 0.16)
    stab = fft_filter(np.tanh(1.5 * stab), hi=2600)
    x = np.tanh(1.3 * (sub * 1.1 + tomx * 0.8 + nz))
    x[: len(stab)] += stab * 0.45
    return x * 0.95


def riser(d):
    t = T(d)
    u = t / d
    nz = rng.standard_normal(len(t))
    nz = fft_filter(nz, lo=400, hi=9000) * u ** 2.2
    f = 180 * (12 ** u)
    sw = np.sin(2 * np.pi * np.cumsum(f) / SR) * u ** 2 * 0.25
    trem = 0.75 + 0.25 * np.sin(2 * np.pi * np.cumsum(2 + 14 * u) / SR)
    return (nz * 0.45 + sw) * trem


def downlift(d=1.6):
    t = T(d)
    u = t / d
    nz = fft_filter(rng.standard_normal(len(t)), lo=300, hi=7000) * (1 - u) ** 2
    f = 900 * (0.12 ** u)
    sw = np.sin(2 * np.pi * np.cumsum(f) / SR) * (1 - u) ** 2 * 0.2
    return nz * 0.35 + sw


def sub_drone(m, d):
    t = T(d)
    x = np.sin(2 * np.pi * hz(m) * t) + 0.3 * np.sin(2 * np.pi * hz(m + 12) * t)
    return x * np.minimum(1, t / 1.0) * np.minimum(1, (d - t) / 1.0) * 0.22


# ---------------------------------------------------------------- 曲の材料（イ短調）
# 和音（1 小節ずつ）：Am → F → C → G
PROG = [(45, [57, 60, 64]), (41, [57, 60, 65]), (48, [55, 60, 64]), (43, [55, 59, 62])]
# 落とす所（式年遷宮）：Am → Em → F → G（2 小節ずつ）
PROG_B = [(45, [57, 60, 64, 69]), (40, [55, 59, 64, 67]), (41, [57, 60, 65, 69]), (43, [55, 59, 62, 67])]
# つかみの旋律：2 小節（16 分の位置, 音, 長さ）
HOOK = [
    [(0, 69, 3), (3, 72, 3), (6, 76, 2), (8, 74, 2), (10, 72, 2), (12, 69, 2), (14, 67, 2)],
    [(0, 69, 3), (3, 72, 3), (6, 76, 2), (8, 79, 4), (12, 76, 2), (14, 74, 2)],
]
# 同じ旋律を、都節（ミヤコブシ）の音へ寄せる：A B♭ D E F
MIYAKO = {67: 64, 69: 69, 72: 70, 74: 74, 76: 76, 79: 77}

S16 = BEAT / 4

parts = tl["music"]


def part_at(b):
    for p in parts:
        if p["at"] <= b < p["at"] + p["len"]:
            return p
    return None


kicks = []
nbars = int(tl["len"] // 4) + 1
for bar in range(nbars):
    b0 = bar * 4
    p = part_at(b0)
    if not p:
        continue
    kind = p["part"]
    lv = p.get("lv", 0.7)
    t0 = b0 * BEAT
    bar_in = (b0 - p["at"]) // 4
    last_bar = b0 + 4 >= p["at"] + p["len"]
    root, ch = PROG[bar % 4]
    # ---------------- 和音と低音
    if kind in ("title", "verse", "build", "drop", "chorus", "light", "rise", "final"):
        put("pad", pad_chord(ch, BAR * 1.02, 900 + 1400 * lv), t0, 0.9 + 0.4 * lv, send=0.35)
    if kind in ("break",):
        rb, chb = PROG_B[(bar // 2) % 4]
        if (b0 - p["at"]) % 8 == 0:
            put("pad", pad_chord(chb, BAR * 2.02, 900), t0, 2.2, send=0.6)
            put("bass", sub_drone(rb - 12, BAR * 2), t0, 1.4)
        # 太鼓のような低い音：小節の頭に大きく、3 拍目に小さく
        put("drums", taiko(), t0, 0.9, send=0.5)
        put("drums", taiko(), t0 + 2 * BEAT, 0.45, send=0.5)
    if kind in ("title", "outro"):
        put("bass", sub_drone(root - 12, BAR), t0, 0.7)
    if kind in ("verse", "rise"):
        put("bass", bass_note(root - 12, BAR * 0.98), t0, 0.55 + 0.3 * lv)
    if kind in ("drop", "chorus", "final", "light", "build"):
        for e8 in range(8):
            if kind == "build" and e8 % 2:
                continue
            put("bass", bass_note(root - 12 + (12 if e8 % 4 == 3 else 0), BEAT / 2 * 0.85), t0 + e8 * BEAT / 2, (0.75 if e8 % 2 else 0.95) * (0.8 if kind == "light" else 1.0))
    # ---------------- 太鼓
    for q in range(4):
        tb = t0 + q * BEAT
        if kind in ("drop", "chorus", "final"):
            put("drums", kick(), tb, 1.0); kicks.append(tb)
            if q in (1, 3):
                put("drums", clap(), tb, 0.75, send=0.15)
            for h in range(4):
                put("drums", hat(), tb + h * S16, 0.9 if h == 2 else 0.45, pan=0.25)
            put("drums", hat(True), tb + BEAT / 2, 0.5, pan=-0.2)
        elif kind == "light":
            put("drums", kick(0.85), tb, 0.85); kicks.append(tb)
            if q in (1, 3):
                put("drums", clap(), tb, 0.45, send=0.2)
            put("drums", hat(), tb + BEAT / 2, 0.7, pan=0.25)
        elif kind in ("verse",):
            if q in (0, 2):
                put("drums", kick(0.8), tb, 0.8); kicks.append(tb)
            if q == 2:
                put("drums", snare(), tb, 0.35, send=0.3)
            put("drums", hat(), tb + BEAT / 2, 0.5, pan=0.2)
        elif kind == "title":
            if q == 0:
                put("drums", kick(0.7), tb, 0.6); kicks.append(tb)
        elif kind == "rise":
            k = (b0 - p["at"]) / max(1, p["len"])
            if q in (0, 2) or k > 0.5:
                put("drums", kick(0.85), tb, 0.85); kicks.append(tb)
            put("drums", hat(), tb + BEAT / 2, 0.4 + 0.4 * k, pan=0.2)
            if k > 0.5 and q in (1, 3):
                put("drums", clap(), tb, 0.5, send=0.2)
        elif kind == "build":
            put("drums", kick(0.9), tb, 0.9); kicks.append(tb)
    # 上がる所：最後の小節で、細かくなる小太鼓
    if kind == "build" or (kind in ("verse", "rise", "light") and p.get("roll") and last_bar):
        k = (b0 - p["at"]) / max(4, p["len"])
        div = 2 if k < 0.5 else 4 if k < 0.75 else 8
        if last_bar:
            div = 8
        for s in range(4 * div):
            put("drums", snare(), t0 + s * BEAT / div, 0.18 + 0.4 * (s / (4 * div)) * (1 if last_bar else 0.6), send=0.15)
    # ---------------- 旋律（つかみ）
    if kind in ("title", "drop", "chorus", "final", "light", "rise"):
        ph = HOOK[bar % 2]
        for (s, m, ln) in ph:
            tt = t0 + s * S16
            if kind == "title":
                put("lead", bell(m + 12, 1.6), tt, 0.85 * (0.7 + 0.3 * lv), pan=0.15 * (1 if s % 4 else -1), send=0.6)
            elif kind == "light":
                put("lead", pluck(m, ln * S16, 0.8), tt, 0.32, pan=0.2 * (1 if s % 4 else -1), send=0.35)
            elif kind == "rise":
                kk = (b0 - p["at"]) / max(1, p["len"])
                put("lead", pluck(m, ln * S16, 0.6 + 0.6 * kk), tt, 0.22 + 0.25 * kk, pan=0.2 * (1 if s % 4 else -1), send=0.4)
            else:
                put("lead", pluck(m, ln * S16, 1.2), tt, 0.48, pan=0.18 * (1 if s % 4 else -1), send=0.3)
                put("lead", pluck(m + 12, ln * S16, 1.0), tt, 0.16, pan=-0.3, send=0.3)
                if kind == "final":
                    put("lead", bell(m + 12, 0.9), tt, 0.16, send=0.4)
    if kind == "break":
        # 同じ旋律を、琴のような音で、都節へ（1 小節おきに）
        if (b0 - p["at"]) % 8 == 0 or p.get("dense"):
            for (s, m, ln) in HOOK[(bar // 2) % 2]:
                mm = MIYAKO.get(m, m)
                put("lead", koto(mm - 12, 1.6), t0 + s * S16 * 2 if not p.get("dense") else t0 + s * S16, 1.3, pan=0.25 * (1 if s % 4 else -1), send=0.55)
    if kind == "verse" and lv >= 0.45:
        ph = HOOK[bar % 2]
        for (s, m, ln) in ph[:3]:
            put("lead", pluck(m - 12, ln * S16, 0.6), t0 + s * S16, 0.22, send=0.35)
    if kind == "outro" and bar_in == 0:
        for k, m in enumerate((69, 72, 76, 81)):
            put("lead", bell(m + 12, 3.5), t0 + k * BEAT * 0.5, 0.4, send=0.8)

# ---------------- 合図：ダン・上がる音・落ちる所・抜く所
for h in tl.get("hits", []):
    put("fx", impact(), h * BEAT, 1.0, send=0.5)
    kicks.append(h * BEAT)
for r in tl.get("risers", []):
    a, b = r
    put("fx", riser((b - a) * BEAT), a * BEAT, 0.55, send=0.3)
for d in tl.get("drops", []):
    put("fx", crash(), d * BEAT, 0.9, send=0.3)
    put("drums", kick(1.2), d * BEAT, 1.0)
for d in tl.get("downs", []):
    put("fx", downlift(), d * BEAT, 0.5, send=0.4)

# 抜く所（落ちる前の一瞬の無音）：その間、太鼓・低音・旋律・和音を消す
gate = np.ones(N, np.float32)
for s in tl.get("stops", []):
    a, b = int(s[0] * BEAT * SR), int(s[1] * BEAT * SR)
    r = int(0.01 * SR)
    gate[a:b] = 0
    gate[max(0, a - r) : a] = np.linspace(1, 0, min(r, a))
for k in ("drums", "bass", "pad", "lead"):
    bus[k] *= gate[:, None]

# ---------------- サイドチェイン（太鼓が鳴ると、低音と和音が少し下がる）
ctl = np.zeros(N, np.float32)
for kt in kicks:
    a = int(kt * SR)
    if a < N:
        ctl[a] = 1
kr = int(0.32 * SR)
kern = np.exp(-np.arange(kr) / SR / 0.09).astype(np.float32)
duck = np.minimum(1, np.convolve(ctl, kern)[:N])
sc = 1 - 0.62 * duck
bus["bass"] *= sc[:, None]
bus["pad"] *= (1 - 0.45 * duck)[:, None]

# ---------------- 残響（作った残響の形を、たたみこむ）
def reverb(x, rt=2.2, pre=0.02):
    n = int(rt * SR)
    t = np.arange(n) / SR
    out = np.zeros_like(x)
    for c in range(2):
        ir = rng.standard_normal(n) * np.exp(-t * 6.9 / rt)
        ir = fft_filter(ir, lo=200, hi=6000)
        ir[: int(pre * SR)] = 0
        ir /= np.sqrt((ir ** 2).sum())
        L = 1 << 18
        y = np.zeros(len(x) + n)
        Hf = np.fft.rfft(ir, L + n)
        for s in range(0, len(x), L):
            seg = x[s : s + L, c]
            Y = np.fft.irfft(np.fft.rfft(seg, L + n) * Hf, L + n)
            y[s : s + len(seg) + n] += Y[: len(seg) + n]
        out[:, c] = y[: len(x)]
    return out


wet = reverb(bus["send"]) * 0.55
# ディレイ（付点 8 分）を旋律に
lead = bus["lead"].copy()
dd = int(BEAT * 0.75 * SR)
for k in range(1, 5):
    sh = np.zeros_like(lead)
    sh[dd * k :] = lead[: -dd * k] * (0.35 ** k)
    if k % 2:
        sh = sh[:, ::-1]
    bus["lead"] += sh

mix = bus["drums"] * 0.9 + bus["bass"] * 0.85 + bus["pad"] * 1.0 + bus["lead"] * 0.85 + bus["fx"] * 0.85 + wet
# 全体の強さの流れ（場面の lv）
lvc = np.ones(N, np.float32)
for p in parts:
    a, b = int(p["at"] * BEAT * SR), int((p["at"] + p["len"]) * BEAT * SR)
    lvc[a:b] = 0.55 + 0.45 * p.get("lv", 0.7)
k = int(0.2 * SR)
lvc = np.convolve(lvc, np.ones(k) / k, mode="same")
mix *= lvc[:, None]
fade = np.minimum(1, (TOTAL - np.arange(N) / SR) / 2.5)
mix *= fade[:, None]
peak = np.abs(mix).max() + 1e-9
mix = np.tanh(mix / peak * 1.6) / np.tanh(1.6) * 0.89
with wave.open(sys.argv[2], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print("音楽", sys.argv[2], round(TOTAL, 1), "秒")
