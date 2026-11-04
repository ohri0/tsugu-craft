# 最終案 2 の音楽（自作。外の曲・外の音は使わない）。
# 作者の声「まだ AI が作った感じがする」から、電子音の打ち込みをやめ、彫金の音で拍を刻む：
#  - 鏨（たがね）を打つ小さな金属音（チン・チン）で 16 分の刻み。強弱と、ほんの少しのずれで人の手の感じ
#  - ダン・ダン・ダンは、金床を打つ大きな音 ＋ 太鼓 ＋ 低い響き
#  - 旋律はピアノ（倍音を少しずらした音）。弦の和音。式年遷宮の所は、同じ旋律を都節にして琴と太鼓
# 使い方：python -I bgm4.py final2.json 出力.wav
import json, sys, wave
import numpy as np

SR = 48000
tl = json.load(open(sys.argv[1]))
BEAT = 60 / tl.get("bpm", 120)
BAR = 4 * BEAT
TOTAL = tl["len"] * BEAT + 3.0
N = int(TOTAL * SR)
rng = np.random.default_rng(17)
bus = {k: np.zeros((N, 2), np.float32) for k in ("perc", "low", "keys", "pad", "fx", "room", "hall")}


def put(name, x, at, g=1.0, pan=0.0, room=0.0, hall=0.0):
    a = int(round(at * SR))
    if a >= N or g == 0:
        return
    if x.ndim == 1:
        x = np.stack([x * (1 - max(0, pan)), x * (1 + min(0, pan))], 1)
    if a < 0:
        x = x[-a:]; a = 0
    b = min(N, a + len(x))
    seg = x[: b - a] * g
    bus[name][a:b] += seg
    if room:
        bus["room"][a:b] += seg * room
    if hall:
        bus["hall"][a:b] += seg * hall


hz = lambda m: 440.0 * 2 ** ((m - 69) / 12)
T = lambda d: np.arange(int(d * SR)) / SR


def env(t, a, d):
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / d)


def filt(x, lo=None, hi=None):
    n = len(x)
    X = np.fft.rfft(x, n)
    f = np.fft.rfftfreq(n, 1 / SR)
    g = np.ones_like(f)
    if hi:
        g *= 1 / np.sqrt(1 + (f / hi) ** 4)
    if lo:
        g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1)) ** 4)
    return np.fft.irfft(X * g, n).astype(np.float32)


def edges(x, a=0.002, b=0.03):
    ia, ib = int(a * SR), int(b * SR)
    if ia:
        x[:ia] *= np.linspace(0, 1, ia)
    if ib and ib < len(x):
        x[-ib:] *= np.linspace(1, 0, ib)
    return x


# ---------------------------------------------------------------- 彫金の音
def tink(v=1.0):
    """鏨を小さく打つ音：高い金属の響き（少しずつ高さが違う）と、打った瞬間の音と、低いトン"""
    t = T(0.35)
    j = rng.uniform(0.97, 1.03)
    modes = [(2310 * j, 1.0, 0.07), (4120 * j, 0.55, 0.045), (6030 * j, 0.35, 0.03), (8240 * j, 0.2, 0.02)]
    x = sum(a * np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * np.exp(-t / d) for f, a, d in modes)
    click = filt(rng.standard_normal(len(t)), lo=2000, hi=12000) * env(t, 0.0003, 0.003) * 0.8
    thud = np.sin(2 * np.pi * 170 * t) * env(t, 0.001, 0.02) * 0.6
    return edges((x * 0.5 + click + thud) * v * 0.5)


def kan(v=1.0, ring=1.0):
    """金床を強く打つ音（ダン）：低い響き・金属の響き・打った瞬間"""
    t = T(2.6)
    modes = [(612, 1.0, 0.9 * ring), (1187, 0.7, 0.6 * ring), (1830, 0.5, 0.45 * ring), (2690, 0.35, 0.3 * ring), (3910, 0.2, 0.18)]
    x = sum(a * np.sin(2 * np.pi * f * t + k) * np.exp(-t / d) for k, (f, a, d) in enumerate(modes))
    body = np.sin(2 * np.pi * np.cumsum(70 * (1 + 0.9 * np.exp(-t * 16))) / SR) * env(t, 0.002, 0.35) * 1.4
    hit = filt(rng.standard_normal(len(t)), lo=600, hi=9000) * env(t, 0.0005, 0.02) * 1.0
    return np.tanh(1.1 * (x * 0.45 + body + hit)) * v * 0.9


def taiko(v=1.0):
    t = T(1.4)
    f = 56 * (1 + 0.55 * np.exp(-t * 14))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(t, 0.003, 0.42)
    skin = filt(rng.standard_normal(len(t)), lo=120, hi=1600) * env(t, 0.001, 0.05) * 0.5
    return np.tanh(1.2 * (body + skin)) * v * 0.9


def soft_kick(v=1.0):
    t = T(0.45)
    f = 48 + 70 * np.exp(-t * 30)
    return np.tanh(1.5 * np.sin(2 * np.pi * np.cumsum(f) / SR) * env(t, 0.002, 0.2)) * v * 0.8


def shaker(v=1.0):
    t = T(0.09)
    return filt(rng.standard_normal(len(t)), lo=5000, hi=13000) * env(t, 0.01, 0.025) * v * 0.18


# ---------------------------------------------------------------- 楽器
def piano(m, d=1.6, v=1.0, bright=1.0):
    """倍音を少しずらしたピアノ：2 段で消える。打った瞬間のこつん"""
    t = T(d + 0.6)
    f0 = hz(m)
    B = 0.00035
    x = np.zeros_like(t)
    for k in range(1, 14):
        fk = k * f0 * np.sqrt(1 + B * k * k)
        if fk > 14000:
            break
        amp = (1 / k ** 1.05) * (1 if k == 1 else 0.85) * np.exp(-(k - 1) * 0.12 / bright)
        dec = 1.8 / (1 + 0.35 * k)
        x += amp * np.sin(2 * np.pi * fk * t + k * 0.7) * (0.6 * np.exp(-t / (dec * 0.25)) + 0.4 * np.exp(-t / dec))
    ham = filt(rng.standard_normal(len(t)), lo=800, hi=5000) * env(t, 0.0005, 0.006) * 0.25
    rel = np.minimum(1, np.maximum(0, (d + 0.6 - t) / 0.25))
    return edges((x * 0.32 + ham) * rel * v)


def strings(ms, d, v=1.0, bright=2400):
    t = T(d)
    out = np.zeros((len(t), 2), np.float32)
    for m in ms:
        for j in range(5):
            f = hz(m) * 2 ** (rng.uniform(-0.12, 0.12) / 12)
            vib = 1 + 0.0025 * np.sin(2 * np.pi * (4.8 + 0.4 * j) * t + j)
            ph = 2 * np.pi * np.cumsum(f * vib) / SR
            s = np.zeros_like(t)
            for k in range(1, 9):
                s += np.sin(k * ph + j) / k
            out[:, j % 2] += s * 0.6
            out[:, (j + 1) % 2] += s * 0.4
    for c in range(2):
        out[:, c] = filt(out[:, c], lo=120, hi=bright)
    e = np.minimum(1, t / 0.7) * np.minimum(1, (d - t) / 0.8)
    return out * e[:, None] * 0.03 * v


def koto(m, d=1.8, v=1.0):
    f = hz(m)
    n = int(d * SR)
    p = max(2, int(SR / f))
    buf = rng.uniform(-1, 1, p)
    out = np.zeros(n)
    idx = 0
    for i in range(n):
        val = buf[idx]
        buf[idx] = 0.5 * (val + buf[(idx + 1) % p]) * 0.9965
        out[i] = val
        idx = (idx + 1) % p
    out = filt(out, hi=5200)
    t = np.arange(n) / SR
    return edges(out * np.minimum(1, t / 0.001) * 0.35 * v)


def sub(m, d, v=1.0):
    t = T(d)
    x = np.sin(2 * np.pi * hz(m) * t)
    return x * np.minimum(1, t / 0.05) * np.minimum(1, (d - t) / 0.2) * 0.32 * v


def riser(d):
    t = T(d)
    u = t / d
    nz = filt(rng.standard_normal(len(t)), lo=500, hi=9000) * u ** 2.4
    sw = np.sin(2 * np.pi * np.cumsum(220 * (8 ** u)) / SR) * u ** 2 * 0.2
    return nz * 0.35 + sw


def swell(d):
    """逆回しのシンバルのような、ふくらむ音"""
    t = T(d)
    u = t / d
    return filt(rng.standard_normal(len(t)), lo=3000, hi=14000) * u ** 3 * 0.25


# ---------------------------------------------------------------- 曲（イ短調）
PROG = [(45, [57, 60, 64]), (41, [57, 60, 65]), (48, [55, 60, 64]), (43, [55, 59, 62])]
PROG_B = [(45, [57, 60, 64, 69]), (40, [55, 59, 64, 67]), (41, [57, 60, 65, 69]), (43, [55, 59, 62, 67])]
HOOK = [
    [(0, 69, 3), (3, 72, 3), (6, 76, 2), (8, 74, 2), (10, 72, 2), (12, 69, 2), (14, 67, 2)],
    [(0, 69, 3), (3, 72, 3), (6, 76, 2), (8, 79, 4), (12, 76, 2), (14, 74, 2)],
]
MIYAKO = {67: 64, 69: 69, 72: 70, 74: 74, 76: 76, 79: 77}
# 鏨の刻み（16 分）：強弱
ACC = [1.0, 0.35, 0.55, 0.35, 0.9, 0.35, 0.6, 0.3, 0.95, 0.35, 0.55, 0.4, 0.85, 0.4, 0.65, 0.45]
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
    kind, lv = p["part"], p.get("lv", 0.7)
    t0 = b0 * BEAT
    root, ch = PROG[bar % 4]
    k_in = (b0 - p["at"]) / max(1, p["len"])
    # 和音
    if kind in ("title", "verse", "build", "chorus", "light", "rise", "final", "drop", "problem"):
        put("pad", strings(ch, BAR * 1.05, 0.7 + 0.6 * lv, 1800 + 1800 * lv), t0, 1.0, hall=0.5)
    if kind == "break":
        rb, chb = PROG_B[(bar // 2) % 4]
        if (b0 - p["at"]) % 8 == 0:
            put("pad", strings(chb, BAR * 2.05, 1.2, 1600), t0, 1.0, hall=0.7)
            put("low", sub(rb - 12, BAR * 2, 1.2), t0)
        put("perc", taiko(0.9), t0, 1.0, room=0.4)
        put("perc", taiko(0.45), t0 + 2 * BEAT, 1.0, room=0.4)
    # 低い音
    if kind in ("verse", "rise", "problem"):
        put("low", sub(root - 12, BAR * 0.98, 0.8 + 0.3 * lv), t0)
    if kind in ("chorus", "final", "drop", "light", "build"):
        for q in range(4):
            put("low", sub(root - 12, BEAT * 0.9, 1.1), t0 + q * BEAT)
            put("low", piano(root - 24, BEAT * 0.4, 0.5, 0.6), t0 + q * BEAT + BEAT / 2)
    # 刻み：鏨の音
    if kind in ("verse", "chorus", "final", "drop", "light", "rise", "problem", "build"):
        dens = {"problem": 8, "verse": 8, "light": 16, "chorus": 16, "final": 16, "drop": 16, "rise": 8 if k_in < 0.5 else 16, "build": 16}[kind]
        for sidx in range(16):
            if dens == 8 and sidx % 2:
                continue
            v = ACC[sidx] * (0.7 + 0.3 * lv) * rng.uniform(0.85, 1.1)
            jit = rng.normal(0, 0.004)
            put("perc", tink(v), t0 + sidx * S16 + jit, 0.75 if kind != "problem" else 0.55, pan=rng.uniform(-0.35, 0.35), room=0.25)
        if kind in ("chorus", "final", "drop", "build"):
            for q in range(4):
                put("perc", soft_kick(1.0), t0 + q * BEAT, 0.9); kicks.append(t0 + q * BEAT)
            for q in (1, 3):
                put("perc", kan(0.32, 0.4), t0 + q * BEAT, 0.8, room=0.35)
        elif kind in ("verse", "light", "rise", "problem"):
            for q in (0, 2):
                put("perc", soft_kick(0.8), t0 + q * BEAT, 0.75); kicks.append(t0 + q * BEAT)
        if kind in ("light", "chorus", "final"):
            for e8 in range(8):
                put("perc", shaker(0.9 if e8 % 2 else 0.5), t0 + e8 * BEAT / 2 + BEAT / 4, 0.8, pan=0.4)
    # 上がる所：最後の小節で、刻みが細かく強く
    if kind == "build" or (p.get("roll") and b0 + 4 >= p["at"] + p["len"]):
        for sidx in range(32):
            put("perc", tink(0.4 + 0.6 * sidx / 32), t0 + sidx * S16 / 2, 0.6, pan=rng.uniform(-0.3, 0.3), room=0.3)
    # 旋律：ピアノ
    if kind in ("title", "chorus", "final", "drop", "light", "rise", "verse"):
        ph = HOOK[bar % 2]
        if kind == "verse" and bar % 2:
            ph = ph[:3]
        for (sx, m, ln) in ph:
            tt = t0 + sx * S16
            g = {"title": 0.7, "verse": 0.45, "light": 0.55, "rise": 0.4 + 0.4 * k_in, "chorus": 0.75, "drop": 0.8, "final": 0.85}[kind]
            put("keys", piano(m, ln * S16 + 0.6, 1.0, 1.0 if kind != "title" else 0.8), tt, g, pan=0.15 * (1 if sx % 4 else -1), hall=0.35)
            if kind in ("chorus", "final", "drop"):
                put("keys", piano(m + 12, ln * S16 + 0.3, 0.5, 1.3), tt, g * 0.35, pan=-0.25, hall=0.35)
    if kind == "break":
        if (b0 - p["at"]) % 8 == 0 or p.get("dense"):
            for (sx, m, ln) in HOOK[(bar // 2) % 2]:
                mm = MIYAKO.get(m, m)
                at = t0 + (sx * S16 * 2 if not p.get("dense") else sx * S16)
                put("keys", koto(mm - 12, 1.6, 1.0), at, 1.2, pan=0.25 * (1 if sx % 4 else -1), hall=0.5)
    if kind == "problem":
        # 迷い：低いピアノの 2 音を、小節の頭に
        put("keys", piano(root - 12, 1.8, 0.8, 0.6), t0, 0.6, hall=0.4)
        put("keys", piano(root - 5, 1.2, 0.5, 0.6), t0 + 2 * BEAT, 0.45, hall=0.4)
    if kind == "outro" and (b0 - p["at"]) == 0:
        for k, m in enumerate((69, 72, 76, 81)):
            put("keys", piano(m, 3.4, 0.8, 0.9), t0 + k * BEAT * 0.5, 0.7, hall=0.7)
        put("pad", strings([57, 64, 69], BAR * 4, 1.0, 1400), t0, 1.0, hall=0.8)

# ---------------- 合図：ダン・上がる音・落ちる所・抜く所
for h in tl.get("hits", []):
    put("fx", kan(1.0, 1.4), h * BEAT, 1.0, room=0.3, hall=0.5)
    put("fx", taiko(1.0), h * BEAT, 0.9, room=0.3)
    kicks.append(h * BEAT)
for r in tl.get("risers", []):
    a, b = r
    put("fx", riser((b - a) * BEAT), a * BEAT, 0.5, hall=0.3)
    put("fx", swell((b - a) * BEAT), a * BEAT, 0.6)
for d in tl.get("drops", []):
    put("fx", kan(1.0, 1.6), d * BEAT, 1.0, hall=0.6)
    put("fx", taiko(1.0), d * BEAT, 0.9)
for d in tl.get("downs", []):
    put("fx", kan(0.6, 2.0), d * BEAT, 0.7, hall=0.8)

gate = np.ones(N, np.float32)
for s_ in tl.get("stops", []):
    a, b = int(s_[0] * BEAT * SR), int(s_[1] * BEAT * SR)
    r = int(0.01 * SR)
    gate[a:b] = 0
    gate[max(0, a - r):a] = np.linspace(1, 0, min(r, a))
for k in ("perc", "low", "keys", "pad", "room", "hall"):
    bus[k] *= gate[:, None]

# ---------------- 打つ音に合わせて、低い音と和音が少し下がる
ctl = np.zeros(N, np.float32)
for kt in kicks:
    a = int(kt * SR)
    if a < N:
        ctl[a] = 1
kern = np.exp(-np.arange(int(0.3 * SR)) / SR / 0.085).astype(np.float32)
duck = np.minimum(1, np.convolve(ctl, kern)[:N])
bus["low"] *= (1 - 0.5 * duck)[:, None]
bus["pad"] *= (1 - 0.3 * duck)[:, None]


def reverb(x, rt, pre, lo, hi):
    n = int(rt * SR)
    t = np.arange(n) / SR
    out = np.zeros_like(x)
    for c in range(2):
        ir = rng.standard_normal(n) * np.exp(-t * 6.9 / rt)
        ir = filt(ir, lo=lo, hi=hi)
        ir[: int(pre * SR)] = 0
        ir /= np.sqrt((ir ** 2).sum())
        L = 1 << 18
        y = np.zeros(len(x) + n)
        Hf = np.fft.rfft(ir, L + n)
        for s0 in range(0, len(x), L):
            seg = x[s0 : s0 + L, c]
            Y = np.fft.irfft(np.fft.rfft(seg, L + n) * Hf, L + n)
            y[s0 : s0 + len(seg) + n] += Y[: len(seg) + n]
        out[:, c] = y[: len(x)]
    return out


room = reverb(bus["room"], 0.9, 0.008, 300, 7000) * 0.5
hall = reverb(bus["hall"], 2.6, 0.025, 200, 5500) * 0.6
mix = bus["perc"] * 0.95 + bus["low"] * 0.9 + bus["keys"] * 1.0 + bus["pad"] * 1.0 + bus["fx"] * 0.9 + room + hall
lvc = np.ones(N, np.float32)
for p in parts:
    a, b = int(p["at"] * BEAT * SR), int((p["at"] + p["len"]) * BEAT * SR)
    lvc[a:b] = 0.6 + 0.4 * p.get("lv", 0.7)
k = int(0.25 * SR)
lvc = np.convolve(lvc, np.ones(k) / k, mode="same")
mix *= lvc[:, None]
mix *= np.minimum(1, (TOTAL - np.arange(N) / SR) / 2.5)[:, None]
peak = np.abs(mix).max() + 1e-9
mix = np.tanh(mix / peak * 1.5) / np.tanh(1.5) * 0.89
with wave.open(sys.argv[2], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print("音楽", sys.argv[2], round(TOTAL, 1), "秒")
