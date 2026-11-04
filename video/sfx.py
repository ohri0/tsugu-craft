# 動画の効果音を、プログラムで一から作る（外の音を使わないので、使う権利で迷わない）。
# 使い方：python -I sfx.py <sfx.json> <出力.wav> <長さ秒>
# sfx.json：[{k: 種類, at: 秒}] または {"sfx": [...]}（reel.py の _cues.json）
# 種類：whoosh（つなぎの風）・hit（ドン）・key（キー）・click（カチッ）・tick（言葉が出る小さな音）・shimmer（キラッ：Claude）・ding（作れます）
#       tink（鏨を小さく打つ金属の音：言葉が出る所）・kan（金床を打つ音：大事な所）
import json, sys, wave
import numpy as np

SR = 48000
ev = json.load(open(sys.argv[1]))
if isinstance(ev, dict):
    ev = ev["sfx"]
total = float(sys.argv[3]) + 1
n = int(total * SR)
L = np.zeros(n); R = np.zeros(n)
rng = np.random.default_rng(3)


def add(x, at, pan=0.0, g=1.0):
    a = int(max(0, at) * SR)
    b = min(n, a + len(x))
    if b <= a:
        return
    if x.ndim == 2:
        L[a:b] += x[: b - a, 0] * g; R[a:b] += x[: b - a, 1] * g
    else:
        L[a:b] += x[: b - a] * g * (1 - pan); R[a:b] += x[: b - a] * g * (1 + pan)


def env(t, a, d):
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / d)


def band(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = 1 / np.sqrt(1 + (f / hi) ** 4) / np.sqrt(1 + (lo / np.maximum(f, 1)) ** 4)
    return np.fft.irfft(X * g, len(x))


def whoosh(d=0.42):
    # 高い所から低い所へ流れる風（帯を 4 つ、時間をずらして重ね、左右に流す）
    t = np.arange(int(d * SR)) / SR
    u = t / d
    out = np.zeros((len(t), 2))
    for k, (lo, hi) in enumerate([(3000, 9000), (1500, 5000), (700, 2600), (300, 1200)]):
        x = band(rng.standard_normal(len(t)), lo, hi)
        c = 0.18 + 0.2 * k
        e = np.exp(-((u - c) / 0.16) ** 2)
        p = -0.6 + 1.2 * u
        out[:, 0] += x * e * (1 - p) * 0.5
        out[:, 1] += x * e * (1 + p) * 0.5
    return out * 0.9


def hit():
    t = np.arange(int(0.7 * SR)) / SR
    f = 42 + 95 * np.exp(-t * 22)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(t, 0.002, 0.26)
    top = band(rng.standard_normal(len(t)), 800, 7000) * env(t, 0.001, 0.035) * 0.5
    return np.tanh(1.4 * (body + top)) * 0.9


def key():
    t = np.arange(int(0.05 * SR)) / SR
    clk = band(rng.standard_normal(len(t)), 1500, 9000) * env(t, 0.0004, 0.005)
    tone = np.sin(2 * np.pi * (2100 + rng.uniform(-300, 300)) * t) * env(t, 0.0005, 0.008) * 0.25
    thock = np.sin(2 * np.pi * 180 * t) * env(t, 0.001, 0.012) * 0.4
    return (clk + tone + thock) * 0.55


def click():
    t = np.arange(int(0.09 * SR)) / SR
    return (np.sin(2 * np.pi * 1400 * t) * env(t, 0.0005, 0.012) + band(rng.standard_normal(len(t)), 2000, 10000) * env(t, 0.0003, 0.004) * 0.6 + np.sin(2 * np.pi * 240 * t) * env(t, 0.001, 0.02) * 0.4) * 0.6


def tick():
    t = np.arange(int(0.12 * SR)) / SR
    return (np.sin(2 * np.pi * 2637 * t) * env(t, 0.0008, 0.03) * 0.4 + np.sin(2 * np.pi * 1318 * t) * env(t, 0.001, 0.05) * 0.3)


def shimmer():
    # キラッ：高い鐘のような音を 4 つ、少しずつずらして
    t = np.arange(int(1.2 * SR)) / SR
    out = np.zeros((len(t), 2))
    for k, m in enumerate([88, 93, 95, 100]):
        f = 440 * 2 ** ((m - 69) / 12)
        a = int(k * 0.045 * SR)
        x = (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 2.76 * t)) * env(t, 0.002, 0.35)
        p = -0.5 + k / 3
        out[a:, 0] += x[: len(t) - a] * (1 - p) * 0.12
        out[a:, 1] += x[: len(t) - a] * (1 + p) * 0.12
    return out


def ding():
    t = np.arange(int(1.4 * SR)) / SR
    x = sum(a * np.sin(2 * np.pi * 880 * r * t) * np.exp(-t / d) for r, a, d in [(1, 1, 0.6), (2, 0.4, 0.3), (3.01, 0.2, 0.2)])
    y = sum(a * np.sin(2 * np.pi * 1318.5 * r * t) * np.exp(-t / d) for r, a, d in [(1, 1, 0.6), (2, 0.4, 0.3)])
    y = np.concatenate([np.zeros(int(0.09 * SR)), y])[: len(t)]
    return (x + y) * 0.16


def tink():
    t = np.arange(int(0.3 * SR)) / SR
    j = rng.uniform(0.97, 1.03)
    x = sum(a * np.sin(2 * np.pi * f * j * t) * np.exp(-t / d) for f, a, d in [(2310, 1.0, 0.07), (4120, 0.55, 0.045), (6030, 0.35, 0.03)])
    click_ = band(rng.standard_normal(len(t)), 2000, 12000) * env(t, 0.0003, 0.003) * 0.6
    return (x * 0.45 + click_) * 0.5


def kan():
    t = np.arange(int(2.2 * SR)) / SR
    x = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t / d) for f, a, d in [(612, 1.0, 0.9), (1187, 0.7, 0.6), (1830, 0.5, 0.45), (2690, 0.35, 0.3)])
    body = np.sin(2 * np.pi * np.cumsum(70 * (1 + 0.9 * np.exp(-t * 16))) / SR) * env(t, 0.002, 0.35) * 1.3
    return np.tanh(1.1 * (x * 0.45 + body)) * 0.8


W, H_, C, T_, D_ = whoosh(), hit(), click(), tick(), ding()
K_ = kan()
S_ = shimmer()
last = {}
for e in ev:
    k, at = e["k"], e["at"]
    # 同じ音が近すぎるときは間引く（つぶれて聞こえるので）
    if k in last and at - last[k] < {"key": 0.045, "click": 0.08, "tick": 0.12, "tink": 0.1, "kan": 0.3, "whoosh": 0.25, "hit": 0.2, "shimmer": 0.6, "ding": 0.6}.get(k, 0.05):
        continue
    last[k] = at
    if k == "whoosh": add(W, at - 0.12, 0, 0.55)
    elif k == "hit": add(H_, at, 0, 0.7)
    elif k == "key": add(key(), at, rng.uniform(-0.15, 0.15), 0.55)
    elif k == "click": add(C, at, 0, 0.6)
    elif k == "tick": add(T_, at, rng.uniform(-0.2, 0.2), 0.5)
    elif k == "shimmer": add(S_, at, 0, 0.8)
    elif k == "ding": add(D_, at, 0, 0.8)
    elif k == "tink": add(tink(), at, rng.uniform(-0.25, 0.25), 0.55)
    elif k == "kan": add(K_, at, 0, 0.75)
peak = max(np.abs(L).max(), np.abs(R).max(), 1e-6)
st = (np.stack([L, R], 1) / peak * 0.85 * 32767).astype(np.int16)
with wave.open(sys.argv[2], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())
print("効果音", len(ev))
