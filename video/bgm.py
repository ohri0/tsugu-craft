# 動画の音楽を、プログラムで一から作る（外の曲を使わないので、使う権利で迷わない）。
# 使い方：python -I bgm.py <scenes.json> <出力.wav>
# 台本の場面の長さから、場面の変わり目に合わせて盛り上がりを変える（静か → 拍が入る → いちばん強い → 静か → また上がる）
import json, sys, wave
import numpy as np

SR = 48000
BPM = 112
beat = 60 / BPM
scenes = json.load(open(sys.argv[1]))
total = sum(s["d"] for s in scenes) + 1.0
n = int(total * SR)
t = np.arange(n) / SR
L = np.zeros(n)
R = np.zeros(n)

# 場面ごとの強さ（0〜1）。名前で決め、なければ 0.5
LEVEL = {"問い": 0.15, "ネットの情報で": 0.35, "職人の一言": 0.6, "ほかの大きさにも": 0.85, "一言が残る": 0.8, "現場": 0.7, "学校": 0.6,
         "ここが出発点": 0.9, "最初の目標": 0.3, "万が一": 0.5, "第一歩": 0.95, "継ぐ": 0.25}
edges = np.cumsum([0] + [s["d"] for s in scenes])
lv = np.zeros(n)
for i, s in enumerate(scenes):
    a, b = int(edges[i] * SR), int(edges[i + 1] * SR)
    lv[a:b] = LEVEL.get(s["name"], 0.5)
# 強さの変わり目は 1.5 秒かけてなめらかに
k = int(1.5 * SR)
lv = np.convolve(np.pad(lv, (k // 2, k - k // 2 - 1), mode="edge"), np.ones(k) / k, mode="valid")

def env(x, a, d):
    return np.minimum(1, x / a) * np.exp(-np.maximum(0, x - a) / d)

# 和音（A マイナー → F → C → G）。2 小節ずつ
chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
hz = lambda m: 440 * 2 ** ((m - 69) / 12)
bar = 4 * beat
for ci in range(int(total / (2 * bar)) + 1):
    c = chords[ci % 4]
    a = int(ci * 2 * bar * SR)
    m = min(n, a + int(2 * bar * SR * 1.1))
    if a >= n:
        break
    tt = np.arange(m - a) / SR
    pad = np.zeros(m - a)
    for j, note in enumerate(c):
        f = hz(note)
        pad += np.sin(2 * np.pi * f * tt + j) * 0.5 + np.sin(2 * np.pi * f * 1.003 * tt) * 0.5
    pad *= np.minimum(1, tt / 1.2) * np.minimum(1, (tt[-1] - tt) / 1.0 + 0.001)
    L[a:m] += pad * 0.05
    R[a:m] += pad * 0.05
    # 低い音（根音）を 8 分で刻む。強いときだけ
    root = hz(c[0] - 24)
    for q in range(16):
        s0 = a + int(q * beat / 2 * SR)
        if s0 >= n:
            break
        s1 = min(n, s0 + int(beat / 2 * SR))
        x = np.arange(s1 - s0) / SR
        tone = np.sin(2 * np.pi * root * x) * env(x, 0.005, 0.12)
        g = np.clip((lv[s0] - 0.3) / 0.5, 0, 1)
        L[s0:s1] += tone * 0.22 * g
        R[s0:s1] += tone * 0.22 * g

# 拍：足（低いドン）、手（パチ）、小さなチッ
rng = np.random.default_rng(7)
for q in range(int(total / beat)):
    s0 = int(q * beat * SR)
    if s0 >= n:
        break
    g = lv[s0]
    x = np.arange(min(n - s0, int(0.4 * SR))) / SR
    if g > 0.3:
        f = 50 + 70 * np.exp(-x * 30)
        kick = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(x, 0.002, 0.16)
        L[s0:s0 + len(x)] += kick * 0.5 * g
        R[s0:s0 + len(x)] += kick * 0.5 * g
    if g > 0.55 and q % 2 == 1:
        sn = rng.standard_normal(len(x)) * env(x, 0.001, 0.07)
        L[s0:s0 + len(x)] += sn * 0.07 * g
        R[s0:s0 + len(x)] += sn * 0.07 * g
    for h in (0, 0.5):
        s1 = int((q + h) * beat * SR)
        if s1 >= n or g < 0.45:
            continue
        y = np.arange(min(n - s1, int(0.05 * SR))) / SR
        hat = np.diff(rng.standard_normal(len(y) + 1)) * env(y, 0.0005, 0.012)
        L[s1:s1 + len(y)] += hat * 0.035 * g
        R[s1:s1 + len(y)] += hat * 0.045 * g

# 場面の変わり目に、ふわっと上がる音
for e in edges[1:-1]:
    a = int(max(0, e - 1.2) * SR)
    b = min(n, int(e * SR))
    x = np.arange(b - a) / SR
    sw = rng.standard_normal(b - a) * (x / max(x[-1], 1e-3)) ** 2
    sw = np.convolve(sw, np.ones(8) / 8, mode="same")
    L[a:b] += sw * 0.03
    R[a:b] += sw * 0.03

# 終わりは 3 秒で消す
fade = np.minimum(1, (total - t) / 3)
L *= fade
R *= fade
peak = max(np.abs(L).max(), np.abs(R).max(), 1e-6)
st = (np.stack([L, R], 1) / peak * 0.8 * 32767).astype(np.int16)
with wave.open(sys.argv[2], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())
print("できた", sys.argv[2], round(total, 1), "秒")
