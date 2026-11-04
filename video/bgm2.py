# 広告のような、拍のはっきりした音楽を一から作る（外の曲を使わないので、使う権利で迷わない）。
# 120 拍／分。場面ごとの強さ（scenes の lv、0〜1）で、太鼓・低音・刻み・旋律を足し引きする。
# 強さが大きく上がる場面の頭は「落ちる」所（drop）にして、直前に上がっていく音を入れる。
# 使い方：python -I bgm2.py <scenes.json> <出力.wav>
import json, sys, wave
import numpy as np

SR = 48000
BPM = 120
beat = 60 / BPM
scenes = json.load(open(sys.argv[1]))
total = sum(s["d"] for s in scenes) + 1.5
n = int(total * SR)
L = np.zeros(n); R = np.zeros(n)
rng = np.random.default_rng(11)
edges = np.cumsum([0] + [s["d"] for s in scenes])
lvs = [s.get("lv", 0.6) for s in scenes]

def lv_at(t):
    i = int(np.searchsorted(edges, t, side="right")) - 1
    return lvs[max(0, min(i, len(lvs) - 1))]

def env(t, a, d):
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / d)

def put(x, at, g=1.0, pan=0.0):
    a = int(at * SR); b = min(n, a + len(x))
    if a < 0 or b <= a: return
    L[a:b] += x[: b - a] * g * (1 - pan); R[a:b] += x[: b - a] * g * (1 + pan)

hz = lambda m: 440 * 2 ** ((m - 69) / 12)
tt = lambda s: np.arange(int(s * SR)) / SR

def kick():
    t = tt(0.45); f = 42 + 110 * np.exp(-t * 32)
    return np.tanh(2.2 * np.sin(2 * np.pi * np.cumsum(f) / SR) * env(t, 0.001, 0.2))
def clap():
    t = tt(0.25); x = rng.standard_normal(len(t))
    e = env(t, 0.001, 0.06) + 0.5 * env(np.maximum(0, t - 0.012), 0.001, 0.05)
    return np.convolve(x, [1, -0.9], mode="same") * e * 0.6
def hat(open_=False):
    t = tt(0.18 if open_ else 0.05); x = np.diff(rng.standard_normal(len(t) + 1))
    return x * env(t, 0.0005, 0.06 if open_ else 0.012) * 0.35
def bass(m, d):
    t = tt(d); f = hz(m)
    x = np.tanh(1.8 * (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t)))
    return x * env(t, 0.005, d * 0.8) * np.minimum(1, (t[-1] - t) / 0.03 + 0.001)
def pluck(m, d=0.22):
    t = tt(d); f = hz(m)
    x = np.sign(np.sin(2 * np.pi * f * t)) * 0.3 + np.sin(2 * np.pi * f * 2 * t) * 0.4
    return np.convolve(x, np.ones(5) / 5, mode="same") * env(t, 0.002, 0.09)
def pad(ms, d):
    t = tt(d); x = sum(np.sin(2 * np.pi * hz(m) * t + j) + 0.5 * np.sin(2 * np.pi * hz(m) * 1.004 * t) for j, m in enumerate(ms))
    return x * np.minimum(1, t / 0.4) * np.minimum(1, (t[-1] - t) / 0.4 + 0.001) * 0.12
def riser(d):
    t = tt(d); x = rng.standard_normal(len(t))
    x = np.convolve(x, np.ones(4) / 4, mode="same")
    return x * (t / d) ** 2.5 * 0.35

# 和音（A マイナー → F → C → G）。1 小節ずつ
prog = [(57, [57, 60, 64]), (53, [53, 57, 60]), (48, [52, 55, 60]), (55, [55, 59, 62])]
arp = [0, 7, 12, 7, 3, 7, 12, 15]
bar = 4 * beat
nb = int(total / beat) + 1
for q in range(nb):
    t0 = q * beat
    if t0 >= total - 1: break
    g = lv_at(t0)
    root, ch = prog[(q // 4) % 4]
    if q % 4 == 0:
        put(pad(ch, bar * 1.02), t0, 0.9)
    if g >= 0.35:
        put(kick(), t0, 0.9 * min(1, g + 0.2))
    if g >= 0.55 and q % 2 == 1:
        put(clap(), t0, 0.8)
    if g >= 0.45:
        put(hat(), t0 + beat / 2, 0.9, 0.2)
        if g >= 0.75: put(hat(), t0, 0.6, -0.2)
        if g >= 0.85 and q % 4 == 3: put(hat(True), t0 + beat / 2, 0.8, 0.1)
    if g >= 0.4:
        # 低音：8 分で、裏を少し強く
        for h in (0, 0.5):
            put(bass(root - 24, beat / 2 * 0.9), t0 + h * beat, 0.45 * (1.1 if h else 0.9))
    if g >= 0.65:
        for h in range(2):
            m = root + arp[(q * 2 + h) % len(arp)]
            put(pluck(m + 12), t0 + h * beat / 2, 0.35, 0.3 if h else -0.3)

# 落ちる所：強さが 0.3 以上あがる場面の頭。直前に上がる音、頭にドン
for i in range(1, len(scenes)):
    if lvs[i] - lvs[i - 1] >= 0.3 or scenes[i].get("drop"):
        e = edges[i]
        put(riser(min(2.0, scenes[i - 1]["d"])), max(0, e - min(2.0, scenes[i - 1]["d"])), 0.8)
        put(kick() * 1.3, e, 1.0)

fade = np.minimum(1, (total - np.arange(n) / SR) / 2.5)
L *= fade; R *= fade
peak = max(np.abs(L).max(), np.abs(R).max(), 1e-6)
st = (np.tanh(np.stack([L, R], 1) / peak * 1.4) / np.tanh(1.4) * 0.85 * 32767).astype(np.int16)
with wave.open(sys.argv[2], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())
print("できた", sys.argv[2], round(total, 1), "秒")
