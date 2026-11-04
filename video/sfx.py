# 動画の効果音を、プログラムで一から作る（外の音を使わないので、使う権利で迷わない）。
# 使い方：python -I sfx.py <sfx.json> <出力.wav> <長さ秒>
# sfx.json：[{k: 'whoosh'|'hit'|'key'|'click', at: 秒}]
import json, sys, wave
import numpy as np

SR = 48000
ev = json.load(open(sys.argv[1]))
total = float(sys.argv[3]) + 1
n = int(total * SR)
L = np.zeros(n); R = np.zeros(n)
rng = np.random.default_rng(3)

def add(x, at, pan=0.0, g=1.0):
    a = int(max(0, at) * SR)
    b = min(n, a + len(x))
    if b <= a: return
    L[a:b] += x[: b - a] * g * (1 - pan) ; R[a:b] += x[: b - a] * g * (1 + pan)

def env(t, a, d):
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / d)

def whoosh():
    t = np.arange(int(0.35 * SR)) / SR
    x = rng.standard_normal(len(t))
    # 高い音から低い音へ流れる風の音（雑音を、だんだん強くぼかす）
    out = np.zeros_like(x); k = 1
    for i in range(len(x)):
        k = 2 + int(30 * i / len(x))
        pass
    x = np.convolve(x, np.ones(6) / 6, mode="same")
    return x * np.sin(np.pi * t / t[-1]) ** 2 * 0.5

def hit():
    t = np.arange(int(0.6 * SR)) / SR
    f = 45 + 90 * np.exp(-t * 25)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(t, 0.002, 0.22)
    top = rng.standard_normal(len(t)) * env(t, 0.001, 0.03) * 0.4
    return (body + top) * 0.9

def key():
    t = np.arange(int(0.05 * SR)) / SR
    click = rng.standard_normal(len(t)) * env(t, 0.0005, 0.006)
    tone = np.sin(2 * np.pi * (1800 + rng.uniform(-200, 200)) * t) * env(t, 0.0005, 0.01) * 0.3
    return (click + tone) * 0.5

def click():
    t = np.arange(int(0.08 * SR)) / SR
    return (np.sin(2 * np.pi * 1200 * t) * env(t, 0.0005, 0.015) + rng.standard_normal(len(t)) * env(t, 0.0003, 0.004) * 0.5) * 0.6

W = whoosh(); H = hit(); C = click()
for e in ev:
    k, at = e["k"], e["at"]
    if k == "whoosh": add(W, at, rng.uniform(-0.3, 0.3), 0.35)
    elif k == "hit": add(H, at, 0, 0.6)
    elif k == "key": add(key(), at, rng.uniform(-0.15, 0.15), 0.5)
    elif k == "click": add(C, at, 0, 0.55)
peak = max(np.abs(L).max(), np.abs(R).max(), 1e-6)
st = (np.stack([L, R], 1) / peak * 0.85 * 32767).astype(np.int16)
with wave.open(sys.argv[2], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())
print("効果音", len(ev))
