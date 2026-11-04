# 最終案 3 の音楽（自作。外の曲・外の音・外の音源は使わない。どの音も、ここで式から合成する）。
# 作者の声（最終案 2 を聞いて）：「AI が作った感じ。素人っぽい。つまらない。つかまれない」。
# ねらい：今の製品の広告のような、少ない音で締まった曲。
#  - 締まったキック・切れのいいクラップとスナップ・キックに合わせて息をする深い低音（サイドチェーン）
#  - 覚えやすい 4 音のモチーフ（ミ・レ・ド・ソ）を、金属をはじいたような音（FM）で。はじめと終わりは、同じ 4 音を金床で打つ（彫金の印）
#  - 間を使う：大事な所の直前で、ぜんぶ止めてから打つ（ストップ → ヒット）
#  - 盛り上げは、音の高さが上がる音・逆回しのシンバル（どちらも合成）と、フィルターが開く音とスネアの連打。ノイズを流すだけの音は使わない
#  - 形：イントロ 8 小節 → だんだん → 職人の一言で指輪が変わる所でドロップ → 伝統の所で静かに（琴）→ 最後のドロップ（全音上げる）→ 終わり
#  - 和音：vi–IV–I–V（Am9・Fmaj9・Cadd9・G6sus4）。声部はなるべく動かさない。緊張の所は Fmaj7#11 → E7sus4 → E7
#  - 混ぜ方：残響とディレイは送りで。広いパッドは奥に。キックで低音とパッドを下げる。ゆるいコンプとリミッター、-14 LUFS、頭打ちなし
# 使い方：python -I bgm5.py final3.json 出力.wav [--from 拍 --to 拍]（試しに一部だけ）
import json, math, sys, wave
import numpy as np

SR = 48000
args = sys.argv[1:]
tl = json.load(open(args[0]))
OUTF = args[1]
B0 = float(args[args.index("--from") + 1]) if "--from" in args else 0.0
B1 = float(args[args.index("--to") + 1]) if "--to" in args else None
BPM = tl.get("bpm", 120)
BEAT = 60 / BPM
BAR = 4 * BEAT
S16 = BEAT / 4
SC = tl["score"]
LENB = tl["len"]
TOTAL = LENB * BEAT + 4.0
N = int(TOTAL * SR)
rng = np.random.default_rng(11)

BUSES = ("kick", "drums", "bass", "pad", "lead", "fx", "sendR", "sendD")
bus = {k: np.zeros((N, 2), np.float32) for k in BUSES}


def bt(b):
    """拍 → 秒"""
    return b * BEAT


def put(name, x, at, g=1.0, pan=0.0, rev=0.0, dly=0.0):
    """音 x（モノラルかステレオ）を、at 秒に置く。rev・dly は残響・ディレイへの送り"""
    if g == 0 or x is None:
        return
    a = int(round(at * SR))
    if x.ndim == 1:
        l, r = math.cos((pan + 1) * math.pi / 4), math.sin((pan + 1) * math.pi / 4)
        x = np.stack([x * l * 1.4142, x * r * 1.4142], 1)
    if a < 0:
        x = x[-a:]
        a = 0
    b = min(N, a + len(x))
    if b <= a:
        return
    seg = (x[: b - a] * g).astype(np.float32)
    bus[name][a:b] += seg
    if rev:
        bus["sendR"][a:b] += seg * rev
    if dly:
        bus["sendD"][a:b] += seg * dly


hz = lambda m: 440.0 * 2 ** ((m - 69) / 12)  # noqa: E731
T = lambda d: np.arange(int(d * SR)) / SR  # noqa: E731


def ffilt(x, fn):
    """周波数の側で、フィルターをかける（fn(f) が大きさ）。両端の折り返しを避けるため 0 を足す"""
    n = len(x)
    m = 1 << int(math.ceil(math.log2(n + 4096)))
    X = np.fft.rfft(x, m)
    f = np.fft.rfftfreq(m, 1 / SR)
    return np.fft.irfft(X * fn(f), m)[:n]


def lp(f, fc, q=0.707):
    r = f / fc
    return 1 / np.sqrt((1 - r * r) ** 2 + (r / q) ** 2)


def hp(f, fc, q=0.707):
    r = np.maximum(f, 1e-3) / fc
    return r * r / np.sqrt((1 - r * r) ** 2 + (r / q) ** 2)


def bell(f, fc, gain_db, q=1.0):
    g = 10 ** (gain_db / 20)
    return 1 + (g - 1) / (1 + ((f - fc) / (fc / q)) ** 2)


def band(x, lo, hi):
    return ffilt(x, lambda f: hp(f, lo) * lp(f, hi))


def noise(n):
    return rng.standard_normal(n)


def fade(x, a=0.001, b=0.01):
    ia, ib = int(a * SR), int(b * SR)
    if ia:
        x[:ia] *= np.linspace(0, 1, ia)
    if ib and ib < len(x):
        x[-ib:] *= np.linspace(1, 0, ib)
    return x


# ---------------------------------------------------------------- 帯域を限ったのこぎり波（表を読む。折り返しのない音）
TBL = 4096
_tabs = {}


def table_for(f):
    nh = max(1, int(15000 / max(f, 20)))
    key = 1 << int(math.floor(math.log2(nh)))
    if key not in _tabs:
        ph = np.arange(TBL) / TBL
        k = np.arange(1, key + 1)
        # 高い倍音を少し丸める（シャープすぎない）
        w = (1 / k) * np.exp(-k / (key * 0.9))
        _tabs[key] = (np.sin(2 * np.pi * np.outer(k, ph)) * w[:, None]).sum(0) * 0.6
    return _tabs[key]


def osc(tab, freq, n, ph0=None):
    ph0 = rng.uniform(0, 1) if ph0 is None else ph0
    if np.isscalar(freq):
        ph = (ph0 + freq * np.arange(n) / SR) % 1.0
    else:
        ph = (ph0 + np.cumsum(freq) / SR) % 1.0
    x = ph * TBL
    i = x.astype(np.int64)
    fr = x - i
    return tab[i % TBL] * (1 - fr) + tab[(i + 1) % TBL] * fr


def stft_tv(x, gain_at, nfft=2048, hop=512):
    """時間とともに変わるフィルター（短い区切りごとに周波数の側でかけ、重ねて足す）。gain_at(秒, 周波数) → 大きさ"""
    n = len(x)
    w = np.hanning(nfft + 1)[:-1]
    xp = np.concatenate([np.zeros(nfft), x, np.zeros(nfft)])
    out = np.zeros(len(xp))
    norm = np.zeros(len(xp))
    f = np.fft.rfftfreq(nfft, 1 / SR)
    for s in range(0, len(xp) - nfft, hop):
        t = (s + nfft / 2 - nfft) / SR
        Y = np.fft.rfft(xp[s : s + nfft] * w) * gain_at(t, f)
        out[s : s + nfft] += np.fft.irfft(Y, nfft) * w
        norm[s : s + nfft] += w * w
    return (out / np.maximum(norm, 1e-6))[nfft : nfft + n]


# ---------------------------------------------------------------- 打楽器
def kick(v=1.0, tone=52.0, length=0.5):
    t = T(length)
    f = tone + 122 * np.exp(-t / 0.028) + 14 * np.exp(-t / 0.2)
    body = 0.6 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.24) * (1 - np.exp(-t / 0.0007))
    click = band(noise(len(t)), 2500, 9000) * np.exp(-t / 0.0022) * 0.55 + np.sin(2 * np.pi * 1650 * t) * np.exp(-t / 0.0035) * 0.3
    x = np.tanh(1.7 * (body + click)) / np.tanh(1.7)
    return fade(x * v, 0.0, 0.03)


def clap(v=1.0):
    t = T(0.5)
    e = np.zeros(len(t))
    for o in (0.0, 0.0085, 0.0185, 0.030):
        e += (t >= o) * np.exp(-np.maximum(0, t - o) / 0.0042)
    e += (t >= 0.030) * np.exp(-np.maximum(0, t - 0.030) / 0.12) * 0.5
    x = noise(len(t)) * e
    x = ffilt(x, lambda f: hp(f, 850) * lp(f, 7500) * bell(f, 1550, 4, 1.2))
    return fade(x / (np.abs(x).max() + 1e-9) * v, 0.0, 0.05)


def snap(v=1.0):
    t = T(0.16)
    x = band(noise(len(t)), 1900, 9500) * np.exp(-t / 0.010) + np.sin(2 * np.pi * 2350 * t) * np.exp(-t / 0.0055) * 0.5
    return fade(x / (np.abs(x).max() + 1e-9) * v, 0.0, 0.02)


HAT_F = [3170.0, 4290.0, 5410.0, 6730.0, 8150.0, 9980.0]


def hat(v=1.0, opn=False):
    t = T(0.55 if opn else 0.13)
    met = sum(np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) for f in HAT_F) / 4
    x = met * 0.55 + noise(len(t))
    x = ffilt(x, lambda f: hp(f, 6800, 0.8) * lp(f, 15000))
    x *= np.exp(-t / (0.26 if opn else 0.030)) * (1 - np.exp(-t / 0.0006))
    return fade(x / (np.abs(x).max() + 1e-9) * v, 0.0, 0.02)


def tink(v=1.0, f0=2310.0):
    """鏨を小さく打つ音（彫金の刻み）"""
    t = T(0.30)
    j = rng.uniform(0.985, 1.015)
    x = sum(a * np.sin(2 * np.pi * f0 * r * j * t + rng.uniform(0, 6)) * np.exp(-t / d) for r, a, d in [(1, 1.0, 0.06), (1.78, 0.55, 0.04), (2.61, 0.35, 0.028), (3.57, 0.2, 0.018)])
    x = x * 0.6 + band(noise(len(t)), 2500, 11000) * np.exp(-t / 0.0025) * 0.7
    return fade(x / (np.abs(x).max() + 1e-9) * v, 0.0, 0.02)


def anvil(m, v=1.0, ring=1.0, weight=1.0):
    """金床を打つ音。いちばん大きい響きを音名にそろえる（曲の調に合う）＋金属の上の響き＋打った瞬間＋低い重さ"""
    f0 = hz(m)
    t = T(3.2)
    modes = [(1.0, 1.0, 1.5), (1.993, 0.32, 0.9), (2.76, 0.42, 0.62), (4.07, 0.24, 0.36), (5.40, 0.16, 0.24), (6.95, 0.09, 0.15)]
    out = np.zeros((len(t), 2))
    for c, det in enumerate((1.0, 1.0016)):
        x = sum(a * np.sin(2 * np.pi * f0 * r * det * t + 0.7 * k) * np.exp(-t / (d * ring)) for k, (r, a, d) in enumerate(modes) if f0 * r < 16000)
        out[:, c] = x
    hit = band(noise(len(t)), 900, 7000) * np.exp(-t / 0.004) * 0.9
    thump = np.sin(2 * np.pi * np.cumsum(62 + 70 * np.exp(-t / 0.02)) / SR) * np.exp(-t / 0.38) * 1.1 * weight
    out += (hit + thump)[:, None]
    out *= (1 - np.exp(-t / 0.0005))[:, None]
    out[-int(0.4 * SR):] *= np.linspace(1, 0, int(0.4 * SR))[:, None] ** 2  # 終わりをなめらかに（切れる音が出ないように）
    return out / (np.abs(out).max() + 1e-9) * v


def cymbal(d=2.6):
    """シンバル（合成）：高い所の、整数倍でない響きをたくさん重ねる"""
    t = T(d)
    fs = np.exp(rng.uniform(np.log(2600), np.log(14500), 70))
    x = np.zeros(len(t))
    for f in fs:
        x += np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * np.exp(-t / rng.uniform(0.5, 1.6)) * rng.uniform(0.3, 1.0)
    x += ffilt(noise(len(t)), lambda f: hp(f, 5500)) * np.exp(-t / 0.7) * 2.0
    x *= 1 - np.exp(-t / 0.001)
    x[-int(0.5 * SR):] *= np.linspace(1, 0, int(0.5 * SR)) ** 2
    return x / (np.abs(x).max() + 1e-9)


def rev_cymbal(d):
    """逆回しのシンバル：だんだんふくらみ、ちょうど d 秒で切れる"""
    c = cymbal(d + 0.4)[::-1][-int(d * SR) :]
    u = np.linspace(0, 1, len(c))
    return c * u ** 1.5


def subdrop(v=1.0):
    t = T(1.4)
    f = 38 + 60 * np.exp(-t / 0.22)
    return fade(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.75) * (1 - np.exp(-t / 0.002)) * v, 0.0, 0.3)


def boom(v=1.0):
    """太鼓のような低い音（伝統の所）"""
    t = T(1.6)
    f = 52 + 38 * np.exp(-t / 0.05)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.55)
    skin = band(noise(len(t)), 150, 1400) * np.exp(-t / 0.035) * 0.35
    return fade(np.tanh(1.3 * (body + skin)) * v, 0.0, 0.05)


# ---------------------------------------------------------------- 音の出る楽器
def pluck(m, dur=0.3, v=1.0, bright=1.0):
    """金属をはじいたような音（FM）：はじめは明るく、すぐ丸くなる。強く弾くと明るい"""
    f = hz(m)
    t = T(dur + 0.7)
    vv = 0.6 + 0.4 * v
    i1 = (1.25 * bright * vv) * np.exp(-t / 0.16) + 0.22
    i2 = (1.9 * bright * vv) * np.exp(-t / 0.035)
    out = np.zeros((len(t), 2))
    for c, cents in enumerate((-3.5, 3.5)):
        fc = f * 2 ** (cents / 1200)
        ph = 2 * np.pi * fc * t
        out[:, c] = np.sin(ph + i1 * np.sin(ph) + i2 * np.sin(3.5 * ph))
    sub = 0.22 * np.sin(np.pi * f * t)
    amp = np.exp(-t / 0.42) * (1 - np.exp(-t / 0.0015))
    rel = np.clip((dur + 0.08 - t) / 0.08, 0, 1) ** 2
    out = (out + sub[:, None]) * (amp * rel)[:, None]
    click = band(noise(len(t)), 3000, 12000) * np.exp(-t / 0.0018) * 0.25
    out += click[:, None]
    return out * v * 0.55


VOW = {"a": [(800, 90, 1.0), (1150, 100, 0.55), (2900, 140, 0.22), (3900, 160, 0.08)],
       "o": [(480, 80, 1.0), (820, 90, 0.6), (2830, 130, 0.12), (3800, 150, 0.05)],
       "u": [(340, 60, 1.0), (760, 80, 0.32), (2500, 130, 0.07)],
       "e": [(420, 70, 1.0), (1950, 110, 0.36), (2600, 130, 0.22), (3500, 150, 0.07)]}


def vchop(m, dur=0.22, vowel="a", v=1.0):
    """声を切って並べたような音（ボーカルチョップ風）：のこぎり波を、母音の響き（フォルマント）でしぼる。頭は少し下からすくう"""
    f0 = hz(m)
    t = T(dur + 0.25)
    fr = f0 * 2 ** ((-0.9 * np.exp(-t / 0.028)) / 12)
    src = osc(table_for(f0), fr, len(t), 0.0) + 0.08 * noise(len(t)) * np.exp(-t / 0.05)
    fm = VOW[vowel]
    y = ffilt(src, lambda f: sum(a / np.sqrt(1 + ((f - F) / (B / 2)) ** 2) for F, B, a in fm) * hp(f, 160))
    env = (1 - np.exp(-t / 0.006)) * np.clip((dur - t) / 0.05 + 1, 0, 1) ** 1.5
    y = y * env
    y = y / (np.abs(y).max() + 1e-9)
    out = np.stack([y, np.roll(y, int(0.007 * SR)) * 0.92], 1)
    return out * v


def padnotes(ms, d, bright=1.0, voices=5, spread=0.25):
    """広いパッド：のこぎり波を少しずつずらして重ね、左右に散らす（あとで低い所だけ通す）"""
    n = int(d * SR)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    for m in ms:
        f = hz(m)
        tab = table_for(f * 2)
        for j in range(voices):
            cents = (j - (voices - 1) / 2) / ((voices - 1) / 2) * 11 if voices > 1 else 0
            fr = f * 2 ** (cents / 1200) * (1 + 0.0012 * np.sin(2 * np.pi * (0.13 + 0.05 * j) * t + j))
            x = osc(tab, fr, n)
            p = (j / (voices - 1) - 0.5) * 2 * spread * 4 if voices > 1 else 0.0
            p = max(-1, min(1, p))
            out[:, 0] += x * math.cos((p + 1) * math.pi / 4)
            out[:, 1] += x * math.sin((p + 1) * math.pi / 4)
    a = np.minimum(1, t / 0.35)
    r = np.clip((d - t) / 0.55, 0, 1)
    return out * (a * r)[:, None] / (len(ms) * voices) * 2.2 * bright


def sub(m, d, v=1.0, glide_from=None):
    t = T(d)
    f = np.full(len(t), hz(m))
    if glide_from is not None:
        f = hz(m) + (hz(glide_from) - hz(m)) * np.exp(-t / 0.025)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR)
    x = np.tanh(1.35 * x) / np.tanh(1.35)  # 少しの倍音（スマホでも低音が聞こえる）
    return x * np.minimum(1, t / 0.006) * np.clip((d - t) / 0.03, 0, 1) * v


def bassline(m, d, v=1.0):
    """低音の上の倍音（800 Hz まで）：スマホの小さなスピーカーでも、低音の動きが聞こえるように"""
    t = T(d)
    y = np.zeros(len(t))
    for k in range(1, 9):
        fk = hz(m) * k
        if fk > 1600:
            break
        y += (1 / k) * np.sin(2 * np.pi * fk * t + 0.3 * k) / np.sqrt(1 + (fk / 650) ** 4)
    env = np.minimum(1, t / 0.01) * np.clip((d - t) / 0.05, 0, 1)
    return y * env * v


def midbass(m, d, v=1.0):
    """短い低音（ドロップの裏拍）：のこぎり波にフィルターの開け閉め"""
    t = T(d + 0.05)
    x = osc(table_for(hz(m)), hz(m), len(t), 0.0)
    fc = 280 + 1100 * np.exp(-t / 0.05)
    k = np.arange(1, 40)
    # 倍音ごとに、フィルターの大きさで重みをつけ直す（時間で変わる）
    y = np.zeros(len(t))
    for kk in k:
        fk = hz(m) * kk
        if fk > 6000:
            break
        y += (1 / kk) * np.sin(2 * np.pi * fk * t) / np.sqrt(1 + (fk / fc) ** 4)
    env = (1 - np.exp(-t / 0.003)) * np.clip((d - t) / 0.03 + 1, 0, 1)
    return np.tanh(1.2 * y * env) * v


def koto(m, dur=2.0, v=1.0, bend=0.0):
    """琴（合成）：はじいた弦。高い倍音ほど早く消える。はじく位置で倍音が抜ける。押して音を上げる（bend 半音）。胴の響き"""
    f0 = hz(m)
    t = T(dur)
    fr = f0 * 2 ** (bend * (1 - np.exp(-np.maximum(0, t - 0.12) / 0.07)) * (t > 0.12) / 12)
    ph = 2 * np.pi * np.cumsum(fr) / SR
    p = 0.17
    y = np.zeros(len(t))
    for k in range(1, 40):
        if f0 * k > 9000:
            break
        a = abs(math.sin(math.pi * k * p)) / k ** 1.25
        tau = 1.9 / (1 + 0.18 * k)
        y += a * np.sin(k * ph * (1 + 0.0004 * k * k)) * np.exp(-t / tau)
    y += band(noise(len(t)), 1800, 7000) * np.exp(-t / 0.005) * 0.25
    y = ffilt(y, lambda f: bell(f, 290, 4, 1.6) * bell(f, 1150, 3, 2.5) * bell(f, 2600, 2, 3) * lp(f, 7000))
    y *= 1 - np.exp(-t / 0.0008)
    return fade(y / (np.abs(y).max() + 1e-9) * v, 0.0, 0.1)


def riser(d, m0, v=1.0):
    """音の高さが上がる音：のこぎり波を 5 本、1 オクターブ上へ。フィルターが開いていく。ちょうど d 秒で切れる"""
    n = int(d * SR)
    t = np.arange(n) / SR
    u = t / d
    out = np.zeros((n, 2))
    for j in range(5):
        cents = (j - 2) * 9
        fr = hz(m0) * 2 ** (cents / 1200) * 2 ** (u ** 1.7)
        x = osc(table_for(hz(m0) * 2), fr, n)
        out[:, j % 2] += x
        out[:, (j + 1) % 2] += x * 0.5
    for c in range(2):
        out[:, c] = stft_tv(out[:, c], lambda tt, f: lp(f, 250 * (36 ** min(1.0, max(0.0, tt / d))), 1.1))
    return out * (u ** 2.2)[:, None] * v * 0.35


def make_ir(rt=2.0, pre=0.018, bright=1.0, seed=3):
    """残響の響き（合成）：高い所ほど早く消える。左右でちがう"""
    r = np.random.default_rng(seed)
    n = int(rt * 1.3 * SR)
    t = np.arange(n) / SR
    ir = np.zeros((n, 2))
    bands = [(20, 350, rt * 1.05), (350, 2200, rt), (2200, 6500, rt * 0.62), (6500, 20000, rt * 0.38)]
    for c in range(2):
        for lo, hi, r_ in bands:
            ir[:, c] += band(r.standard_normal(n), lo, hi) * np.exp(-6.9 * t / r_) * (bright if lo >= 2200 else 1.0)
        for k in range(10):  # はじめの反射
            ir[int((0.004 + 0.003 * k + r.uniform(0, 0.002)) * SR), c] += r.uniform(-0.6, 0.6) * (0.85 ** k) * 6
    ir[: int(pre * SR)] = 0
    ir /= np.sqrt((ir ** 2).sum(0, keepdims=True))
    return ir


def conv(x, ir):
    n = len(x) + len(ir)
    m = 1 << int(math.ceil(math.log2(n)))
    out = np.zeros((len(x), 2))
    for c in range(2):
        out[:, c] = np.fft.irfft(np.fft.rfft(x[:, c], m) * np.fft.rfft(ir[:, c], m), m)[: len(x)]
    return out


def pingpong(x, d=0.375, fb=0.36, taps=6, lpf=5200):
    """左右に跳ねるディレイ（付点 8 分）。くり返すほど、高い所が丸くなる"""
    mono = x.mean(1)
    n = len(mono) + int(d * SR * (taps + 1))
    m = 1 << int(math.ceil(math.log2(n)))
    X = np.fft.rfft(mono, m)
    f = np.fft.rfftfreq(m, 1 / SR)
    H = lp(f, lpf) * hp(f, 300)
    L = np.zeros(len(X), complex)
    R = np.zeros(len(X), complex)
    for k in range(1, taps + 1):
        y = (fb ** (k - 1)) * (H ** k) * np.exp(-2j * np.pi * f * k * d)
        (L if k % 2 else R)[:] += y
    out = np.stack([np.fft.irfft(X * L, m)[: len(x)], np.fft.irfft(X * R, m)[: len(x)]], 1)
    return out


# ================================================================ 曲の中身
# 和音：低音（MIDI）と、上の声（G3〜E4 のあたりで、なるべく動かさない）
CH = {
    "Am9": (33, [55, 59, 60, 64]),
    "Fmaj9": (29, [55, 57, 60, 64]),
    "Cadd9": (36, [55, 60, 62, 64]),
    "G6sus4": (31, [55, 57, 60, 62]),
    "G6": (31, [55, 59, 62, 64]),
    "Fmaj7#11": (29, [57, 59, 60, 64]),
    "E7sus4": (28, [57, 59, 62, 64]),
    "E7": (28, [56, 59, 62, 64]),
    "Em7": (28, [55, 59, 62, 64]),
    "Dm9": (38, [53, 57, 60, 64]),
}
CYCLE = ["Am9", "Fmaj9", "Cadd9", "G6sus4"]
# 4 音のモチーフ（16 分の位置・音・長さ）：ミ・レ・ド・ソ ／ 答え：ミ・レ・ド・（下の）ソ
MOTIF = [(0, 76, 2), (3, 74, 2), (6, 72, 2), (10, 79, 4)]
ANSWER = [(0, 76, 2), (3, 74, 2), (6, 72, 2), (10, 67, 5)]

secs = SC["sections"]


def sec_at(b):
    for s in secs:
        if s["at"] <= b < s["at"] + s["len"]:
            return s
    return None


def key_at(b):
    k = 0
    for at, st in SC.get("key", [[0, 0]]):
        if b >= at:
            k = st
    return k


def chord_at(bar):
    """小節の和音の名前"""
    b = bar * 4
    s = sec_at(b)
    name = s["name"] if s else ""
    rel = (b - s["at"]) // 4 if s else bar
    if name == "tension":
        return ["Fmaj7#11", "E7"][min(1, rel)]
    if name == "bridge":
        return ["Fmaj9", "G6", "Am9", "Em7", "Fmaj9", "G6", "Am9"][rel % 7]
    if name in ("breakdown",):
        return "Am9" if rel % 4 < 2 else "Fmaj9"
    if name in ("hook",):
        return "Am9"
    if name == "outro":
        return "G6sus4" if rel == 0 else "Cadd9"
    if name == "reveal":
        return ["Fmaj9", "G6sus4", "G6"][min(2, rel)]
    # ふつうは vi–IV–I–V を、段の頭から数えて回す（どの段も vi から始まる）
    return CYCLE[rel % 4]


SWING = 0.54


def sw(step):
    """16 分の位置 → 秒（2 つめの 16 分を少しうしろへ：スイング 54%）"""
    pair, odd = divmod(step, 2)
    return pair * 2 * S16 + (odd * 2 * S16 * SWING)


kicks = []  # サイドチェーンの合図（秒, 強さ）
stops = [(bt(a), bt(b)) for a, b in SC.get("stops", [])]


def stopped(t):
    return any(a - 0.002 <= t < b for a, b in stops)


def hum(t, s=0.003):
    return t + rng.normal(0, s)


def vel(v, s=0.07):
    return max(0.05, v * (1 + rng.normal(0, s)))


nbars = int(math.ceil(LENB / 4))
for bar in range(nbars):
    b = bar * 4
    s = sec_at(b)
    if not s:
        continue
    name = s["name"]
    lv = s.get("lv", 1.0)
    t0 = bt(b)
    rel = (b - s["at"]) // 4
    nrel = s["len"] // 4
    last = rel == nrel - 1
    tr = key_at(b)
    cname = chord_at(bar)
    root, upper = CH[cname]
    root += tr
    upper = [u + tr for u in upper]

    # ---------------- パッド（奥に、広く）
    if name not in ("hook",):
        padlv = {"intro": 0.55, "title": 0.7, "intro2": 0.55, "verse": 0.5, "tension": 0.55, "build": 0.6, "drop": 0.62, "groove": 0.5, "verse2": 0.45,
                 "light": 0.5, "bridge": 0.7, "breakdown": 0.55, "build2": 0.55, "reveal": 0.55, "final": 0.65, "outro": 0.6}.get(name, 0.5)
        put("pad", padnotes(upper, BAR + 0.6, padlv), t0, 1.0, rev=0.35)
        if name in ("drop", "final", "bridge"):
            put("pad", padnotes([u + 12 for u in upper[1:]], BAR + 0.6, padlv * 0.35, voices=3), t0, 1.0, rev=0.5)

    # ---------------- 低音（サブ）：根音を小節の頭から
    if name in ("intro", "title", "intro2"):
        put("bass", sub(root, BAR * 0.98, 0.55), t0)
    elif name == "hook":
        pass
    elif name == "build" and b >= s["at"] + s["len"] - 8:
        pass  # ドロップの前の 2 小節は、低音を抜く（戻ってきたときに大きく感じる）
    elif name == "reveal" and b < SC.get("reveal_hit", 1e9):
        pass
    elif name in ("verse", "verse2", "light", "groove", "build", "drop", "final", "build2", "reveal", "bridge", "tension"):
        lvb = {"verse": 0.8, "verse2": 0.75, "light": 0.72, "groove": 0.9, "build": 0.85, "drop": 1.0, "final": 1.0, "build2": 0.8, "reveal": 0.8, "bridge": 0.85, "tension": 0.6}[name]
        put("bass", sub(root, BAR * 0.99, lvb), t0)
        # 低音の「聞こえる」所（スマホでも線が分かるよう、1 オクターブ上の倍音を少し）
        put("bass", bassline(root + 12, BAR * 0.99, 0.32 * lvb), t0)
    elif name == "breakdown":
        if rel % 2 == 0:
            put("bass", sub(root, BAR * 2 * 0.99, 0.6), t0)
    elif name == "outro" and rel == 0:
        pass

    # ---------------- 裏拍の短い低音（ドロップ）
    if name in ("drop", "final") or (name == "groove" and rel % 2 == 1):
        for q in range(4):
            if stopped(t0 + q * BEAT + BEAT / 2):
                continue
            put("bass", midbass(root + 12, BEAT * 0.42, 0.42), t0 + q * BEAT + BEAT / 2)

    # ---------------- ドラム
    if name in ("verse", "verse2", "light"):
        steps_k = [0, 10] if name != "light" else [0, 8]
        for st in steps_k:
            put("kick", kick(0.85 * lv), t0 + st * S16); kicks.append((t0 + st * S16, 0.6))
        for st in (4, 12):
            put("drums", snap(0.42 * lv), hum(t0 + st * S16), pan=0.05, rev=0.18)
        for st in range(0, 16, 2):
            put("drums", hat(vel(0.13 + 0.05 * (st % 4 == 2)) * lv), hum(t0 + sw(st)), pan=0.28)
        if name == "verse2":
            for st in (3, 11):
                put("drums", tink(0.12), hum(t0 + sw(st)), pan=-0.3, rev=0.15)
    if name == "intro2":
        put("kick", kick(0.55), t0); kicks.append((t0, 0.35))
        for st in range(0, 16, 4):
            put("drums", hat(vel(0.07)), hum(t0 + sw(st + 2)), pan=0.3)
    if name in ("build", "build2"):
        prog = (b - s["at"]) / s["len"]
        four = name == "build" or rel >= 2
        if name == "build" and b >= s["at"] + s["len"] - 8:
            four = False  # 最後の 2 小節はキックも抜く（スネアの連打と上がる音だけ）
        elif four:
            for q in range(4):
                tq = t0 + q * BEAT
                if not stopped(tq):
                    put("kick", kick(0.7 + 0.25 * prog), tq); kicks.append((tq, 0.45 + 0.4 * prog))
        else:
            for st in (0, 10):
                put("kick", kick(0.8), t0 + st * S16); kicks.append((t0 + st * S16, 0.5))
        if name == "build" and b >= s["at"] + s["len"] - 8 and not last:  # 抜いた 1 小節め：8 分のスネアで刻む
            for k in range(8):
                put("drums", clap(0.16 + 0.12 * k / 8), t0 + k * BEAT / 2, rev=0.18)
        if prog > 0.35:
            for st in (4, 12):
                tq = t0 + st * S16
                if not stopped(tq):
                    put("drums", clap(0.42 + 0.25 * prog), hum(tq), rev=0.2)
        for st in range(16):
            tq = t0 + sw(st)
            if not stopped(tq):
                put("drums", hat(vel(0.08 + 0.12 * prog * (1 if st % 2 else 0.6))), hum(tq), pan=0.25)
        if last:  # 最後の小節：スネアの連打（だんだん細かく、だんだん大きく）
            for k in range(16):
                tq = t0 + k * S16
                if stopped(tq):
                    continue
                put("drums", clap(0.18 + 0.5 * k / 16), tq, pan=0.0, rev=0.15)
                if k >= 8:
                    put("drums", clap(0.15 + 0.4 * k / 16), tq + S16 / 2, rev=0.15)
    if name in ("drop", "final", "groove"):
        for q in range(4):
            tq = t0 + q * BEAT
            if stopped(tq):
                continue
            put("kick", kick(1.0), tq); kicks.append((tq, 1.0))
        for st in (4, 12):
            tq = t0 + st * S16
            if not stopped(tq):
                put("drums", clap(0.62 if name != "groove" else 0.5), hum(tq, 0.002), rev=0.22)
        for st in range(16):
            tq = t0 + sw(st)
            if stopped(tq):
                continue
            acc = 0.22 if st % 4 == 2 else (0.1 if st % 2 == 0 else 0.07)
            put("drums", hat(vel(acc)), hum(tq), pan=0.22)
        for st in (2, 10):
            tq = t0 + sw(st)
            if not stopped(tq) and name != "groove":
                put("drums", hat(vel(0.12), opn=True), hum(tq), pan=-0.18)
        for st in (7, 15):  # 鏨の刻み（彫金の印）
            tq = t0 + sw(st)
            if not stopped(tq):
                put("drums", tink(vel(0.16)), hum(tq), pan=-0.35, rev=0.15)
    if name == "bridge":
        put("kick", kick(0.8), t0); kicks.append((t0, 0.6))
        put("kick", kick(0.55), t0 + 11 * S16); kicks.append((t0 + 11 * S16, 0.4))
        put("drums", clap(0.45), hum(t0 + 8 * S16), rev=0.35)
        for st in range(0, 16, 2):
            put("drums", hat(vel(0.07)), hum(t0 + sw(st + 1)), pan=0.3)
    if name == "tension":
        put("kick", kick(0.6, tone=46), t0); kicks.append((t0, 0.3))
    if name == "reveal" and b < SC.get("reveal_hit", 1e9):
        for st in range(16):
            tq = t0 + sw(st)
            if not stopped(tq):
                put("drums", hat(vel(0.1 + 0.06 * (st % 2))), hum(tq), pan=0.25)
    if name == "breakdown":
        if rel % 2 == 0:
            put("fx", boom(0.6), t0, rev=0.4)
        if rel % 2 == 1:
            put("fx", boom(0.32), t0 + 2 * BEAT + S16 * 2, rev=0.4)

    # ---------------- 旋律（モチーフ）：金属をはじいた音。間をあけて（2 小節に 1 回）
    def motif(phrase, g, at=t0, oct=0, chop=False, br=1.0):
        for (st, m, ln) in phrase:
            tq = at + st * S16
            if stopped(tq):
                continue
            put("lead", pluck(m + tr + oct, ln * S16, vel(1.0, 0.05), br), hum(tq, 0.002), g, pan=0.12 * (1 if st % 2 else -1), rev=0.22, dly=0.28)
            if chop:
                put("lead", vchop(m + tr + oct - 12, ln * S16 * 0.9, "a" if st < 8 else "o", vel(1.0, 0.05)), hum(tq, 0.002), g * 0.42, rev=0.25, dly=0.12)

    if name == "intro" and rel % 2 == 0:
        motif(MOTIF, 0.32, br=0.8)
    if name == "intro" and rel % 2 == 1:
        motif(ANSWER[:3], 0.22, br=0.7)
    if name == "verse" and rel % 2 == 1:
        motif(MOTIF if rel % 4 == 1 else ANSWER, 0.3)
    if name in ("drop", "final"):
        motif(MOTIF if rel % 2 == 0 else ANSWER, 0.5, chop=True)
    if name == "groove" and rel % 4 == 0:
        motif(MOTIF, 0.34)
    if name == "light" and rel % 4 == 2:
        motif(MOTIF, 0.24, br=0.8)
    if name == "bridge" and rel % 2 == 0:
        # ゆっくりのモチーフ（倍の長さ）
        for (st, m, ln) in MOTIF:
            tq = t0 + st * S16 * 2
            put("lead", pluck(m + tr, ln * S16 * 2, 0.9, 0.7), tq, 0.3, rev=0.4, dly=0.3)
    if name == "build" and rel >= 1:
        motif(MOTIF if rel % 2 else ANSWER, 0.24 + 0.08 * rel, br=0.8 + 0.1 * rel)
    if name == "build2" and rel >= 2 and rel % 2 == 0:
        motif(MOTIF, 0.26)
    if name == "breakdown":
        # 琴：モチーフを、ゆっくり、五音（ラ・ド・レ・ミ・ソ）で。押して上げる音も
        kot = [(0, 76, 0.0), (6, 74, 0.0), (12, 72, 0.0), (20, 79, 0.0)] if rel % 2 == 0 else [(0, 76, 0.0), (6, 74, 0.0), (12, 72, 0.0), (20, 69, 1.0)]
        if rel < nrel - 1:
            for (st, m, bd) in kot:
                put("lead", koto(m - 12 + tr, 2.2, 0.55, bend=bd), hum(t0 + st * S16), 1.0, pan=0.2 * (1 if st % 4 else -1), rev=0.45, dly=0.18)
            if rel % 4 == 3:
                put("lead", koto(57 + tr, 2.6, 0.4), t0 + 14 * S16, 1.0, pan=-0.3, rev=0.5)

# ---------------- 合図：金床のモチーフ・大事な所の一打・上がる音・ピン（切り替えに合わせた一音）
for b, m, kind in SC.get("anvil", []):
    tq = bt(b)
    w = 1.0 if kind in ("hit", "title") else 0.7
    put("fx", anvil(m, 0.62 if kind != "title" else 0.75, ring=1.2 if kind == "title" else 1.0, weight=w), tq, 1.0, rev=0.3)
    put("kick", kick(0.9, tone=48), tq); kicks.append((tq, 0.8))
    if kind == "title":
        put("fx", subdrop(0.8), tq)
        put("fx", cymbal(2.8) * 0.18, tq, 1.0, rev=0.3)
for b in SC.get("impacts", []):
    tq = bt(b)
    put("kick", kick(1.0, tone=46, length=0.8), tq); kicks.append((tq, 1.0))
    put("fx", subdrop(0.55), tq)
    put("fx", np.stack([cymbal(3.0), cymbal(3.0)], 1) * 0.2, tq, 1.0, rev=0.35)
    put("fx", anvil(69 + key_at(b), 0.42, ring=1.3), tq, 1.0, rev=0.4)
for a, b in SC.get("risers", []):
    d = bt(b) - bt(a)
    put("fx", riser(d, 57 + key_at(a), 0.8), bt(a), 1.0, rev=0.25)
    rc = rev_cymbal(min(d, 3.0))
    put("fx", np.stack([rc, np.roll(rc, 240)], 1) * 0.3, bt(b) - min(d, 3.0), 1.0)
for b, m in SC.get("pings", []):
    put("lead", pluck(m + key_at(b), S16 * 3, 0.9, 1.1), bt(b), 0.36, rev=0.25, dly=0.3)
for b, m in SC.get("ticks", []):
    put("drums", tink(0.3, f0=hz(m + key_at(b))), bt(b), 0.9, pan=0.1, rev=0.2)

# ---------------- 止める所：乾いた音をぜんぶ止める（残響の尾は残る）
gate = np.ones(N, np.float32)
for a, b in stops:
    ia, ib = int(a * SR), int(b * SR)
    r = int(0.008 * SR)
    gate[ia:ib] = 0
    gate[max(0, ia - r) : ia] = np.minimum(gate[max(0, ia - r) : ia], np.linspace(1, 0, ia - max(0, ia - r)))
for k in ("kick", "drums", "bass", "pad", "lead"):
    bus[k] *= gate[:, None]

# ---------------- サイドチェーン：キックの合図で、低音・パッド・旋律を下げる（キックと低音がぶつからない、ポンプする感じ）
ctl = np.zeros(N, np.float32)
for kt, s_ in kicks:
    a = int(kt * SR)
    if 0 <= a < N:
        ctl[a] = max(ctl[a], s_)
ka = int(0.004 * SR)
kern = np.concatenate([np.linspace(0, 1, ka), np.exp(-np.arange(int(0.32 * SR)) / SR / 0.105)]).astype(np.float32)
m2 = 1 << int(math.ceil(math.log2(N + len(kern))))
duck = np.minimum(1.0, np.fft.irfft(np.fft.rfft(ctl, m2) * np.fft.rfft(kern, m2), m2)[:N]).astype(np.float32)
bus["bass"] *= (1 - 0.82 * duck)[:, None]
bus["pad"] *= (1 - 0.5 * duck)[:, None]
bus["lead"] *= (1 - 0.18 * duck)[:, None]

# ---------------- 音色の整え（パッドは低い所と高い所を切って奥に。低音は 30 Hz から下を切る）
for c in range(2):
    bus["pad"][:, c] = ffilt(bus["pad"][:, c], lambda f: hp(f, 180) * lp(f, 3600, 0.6) * bell(f, 900, -2, 0.8))
    bus["bass"][:, c] = ffilt(bus["bass"][:, c], lambda f: hp(f, 30) * lp(f, 2400))
    bus["lead"][:, c] = ffilt(bus["lead"][:, c], lambda f: hp(f, 150) * bell(f, 3200, -1.5, 1.0) * lp(f, 13000))
    bus["drums"][:, c] = ffilt(bus["drums"][:, c], lambda f: hp(f, 120) * lp(f, 16000))

# ---------------- 送り：残響（プレートのような 1.9 秒）とディレイ（付点 8 分の左右）
ir = make_ir(1.9, 0.02, 0.9)
wet = conv(bus["sendR"].astype(np.float64), ir) * 0.55
for c in range(2):
    wet[:, c] = ffilt(wet[:, c], lambda f: hp(f, 260) * lp(f, 9000))
dl = pingpong(bus["sendD"].astype(np.float64), 0.375, 0.36, 6, 4800) * 0.5
dl = conv(dl * 0.3, make_ir(1.2, 0.01, 0.7, seed=9)) + dl

# ---------------- 打楽器のまとまり：ピークだけ少し丸める（大きく、でもつぶれない）
drums = bus["kick"].astype(np.float64) * 0.95 + bus["drums"].astype(np.float64) * 0.62
drums = np.tanh(drums * 1.25) / 1.25

# フィルターが開いていく（盛り上げ）：段の頭から終わりへ、パッドの高い所を少しずつ通す
for s_ in secs:
    if s_["name"] in ("build", "build2", "reveal"):
        a, b = int(bt(s_["at"]) * SR), int(bt(s_["at"] + s_["len"]) * SR)
        d = (b - a) / SR
        f0, f1 = (500, 7000) if s_["name"] != "reveal" else (900, 5000)
        for c in range(2):
            bus["pad"][a:b, c] = stft_tv(bus["pad"][a:b, c].astype(np.float64), lambda tt, f: lp(f, f0 * (f1 / f0) ** min(1.0, max(0.0, tt / d)) , 1.2))
mix = drums * 1.0 + bus["bass"] * 0.16 + bus["pad"] * 0.62 + bus["lead"] * 0.95 + bus["fx"] * 0.6 + wet * 1.1 + dl * 0.75
# 段ごとの大きさ（静かな所は静かに、ドロップは大きく：つまらない平らな曲にしない）
LVL = {"hook": 0.9, "intro": 0.7, "title": 0.8, "intro2": 0.66, "verse": 0.72, "tension": 0.62, "build": 0.8, "drop": 1.0, "groove": 0.88,
       "verse2": 0.74, "light": 0.7, "bridge": 0.78, "breakdown": 0.6, "build2": 0.76, "reveal": 0.86, "final": 1.0, "outro": 0.9}
lvc = np.ones(N, np.float32) * 0.8
for s_ in secs:
    a, b = int(bt(s_["at"]) * SR), int(bt(s_["at"] + s_["len"]) * SR)
    v0 = LVL.get(s_["name"], 0.8)
    if s_["name"] in ("build", "build2"):
        lvc[a:b] = np.linspace(v0, 1.0 if s_["name"] == "build" else 0.95, b - a)
    else:
        lvc[a:b] = v0
k = int(0.12 * SR)
lvc = np.convolve(lvc, np.ones(k) / k, mode="same")
mix *= lvc[:, None]
# 仕上げの音色：いちばん低い所を少し抑え、3.5 kHz から上を少し明るく（スマホのスピーカーでも、音の輪郭が聞こえるように）
SHELF = lambda f: 1 + (10 ** (3.0 / 20) - 1) / (1 + (3500 / np.maximum(f, 1)) ** 2)  # noqa: E731
for c in range(2):
    mix[:, c] = ffilt(mix[:, c], lambda f: hp(f, 26) * bell(f, 55, -1.5, 1.0) * SHELF(f))


# ---------------- 仕上げ：ゆるいコンプ → 聞こえる大きさを -14 LUFS に → 先読みのリミッター（-1.2 dB）
def lufs(x):
    """ITU-R BS.1770 の聞こえる大きさ（K 特性・400 ms・ゲート）"""
    y = np.stack([ffilt(x[:, c], lambda f: hp(f, 38, 0.5) * (1 + (10 ** (4 / 20) - 1) / (1 + (1500 / np.maximum(f, 1)) ** 2))) for c in range(2)], 1)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    p = (y ** 2).sum(1)
    cs = np.concatenate([[0], np.cumsum(p)])
    idx = np.arange(0, len(p) - blk, hop)
    z = (cs[idx + blk] - cs[idx]) / blk
    l = -0.691 + 10 * np.log10(z + 1e-12)
    z1 = z[l > -70]
    if not len(z1):
        return -70.0
    g = -0.691 + 10 * np.log10(z1.mean()) - 10
    z2 = z[l > g]
    return -0.691 + 10 * np.log10(z2.mean() + 1e-12)


def glue(x, thr_db=-13.0, ratio=1.5, att=0.02, rel=0.25):
    """ゆるいコンプ（全体のまとまり）。制御は 64 サンプルごと"""
    blk = 64
    n = len(x) // blk
    p = (x[: n * blk] ** 2).mean(1).reshape(n, blk).mean(1)
    lvl = 10 * np.log10(p + 1e-12)
    over = np.maximum(0, lvl - thr_db)
    gr = over * (1 - 1 / ratio)
    a_, r_ = math.exp(-blk / SR / att), math.exp(-blk / SR / rel)
    g = np.zeros(n)
    cur = 0.0
    for i in range(n):
        tgt = gr[i]
        cur = tgt + (cur - tgt) * (a_ if tgt > cur else r_)
        g[i] = cur
    gain = 10 ** (-np.repeat(g, blk) / 20)
    gain = np.concatenate([gain, np.full(len(x) - len(gain), gain[-1] if len(gain) else 1.0)])
    return x * gain[:, None]


def true_peak(x):
    """サンプルの間の山も見る（4 倍にして測る）。返り値：サンプルごとの山の大きさ"""
    n = len(x)
    L = SR
    pk = np.abs(x).max(1).astype(np.float64)
    for s0 in range(0, n, L):
        a0, b0 = max(0, s0 - 256), min(n, s0 + L + 256)
        seg = x[a0:b0]
        m = b0 - a0
        for ch in range(2):
            X = np.fft.rfft(seg[:, ch])
            Y = np.zeros(m * 2 + 1, complex)
            Y[: len(X)] = X
            up = np.abs(np.fft.irfft(Y, m * 4) * 4).reshape(m, 4).max(1)
            lo, hi = s0 - a0, s0 - a0 + min(L, n - s0)
            pk[s0 : s0 + (hi - lo)] = np.maximum(pk[s0 : s0 + (hi - lo)], up[lo:hi])
    return pk


def limiter(x, ceil_db=-1.5, look=0.0015, rel=0.06):
    """先読みのリミッター。サンプルの間の山（true peak）で測る"""
    c = 10 ** (ceil_db / 20)
    pk = true_peak(x)
    need = np.minimum(1.0, c / np.maximum(pk, 1e-9))
    L = int(look * SR)
    blk = 16
    n = len(need) // blk + 1
    padn = np.concatenate([need, np.ones(n * blk - len(need) + L)])
    # 先を見て、いちばん小さい値（L サンプル先まで）
    from numpy.lib.stride_tricks import sliding_window_view as swv
    mins = swv(padn, L + 1).min(1)[: n * blk]
    bm = mins.reshape(n, blk).min(1)
    r_ = math.exp(-blk / SR / rel)
    g = np.zeros(n)
    cur = 1.0
    for i in range(n):
        tgt = bm[i]
        cur = tgt if tgt < cur else tgt + (cur - tgt) * r_
        g[i] = cur
    gain = np.repeat(g, blk)[: len(x)]
    # ブロックの角をならす（短い移動平均。先を見た分で、ピークには間に合う）
    k = np.ones(L) / L
    gs = np.convolve(np.concatenate([np.full(L, gain[0]), gain]), k, mode="valid")[: len(x)]
    gs = np.minimum(gs, gain)
    y = x * gs[:, None]
    return np.clip(y, -0.97, 0.97)  # 念のため（ここまで来ることはほとんどない）


mix = glue(mix)
s0, s1 = int(bt(B0) * SR), int((bt(B1) if B1 else TOTAL) * SR)
mix = mix[s0:s1]
for _ in range(3):
    L_ = lufs(mix)
    mix *= 10 ** ((-14.0 - L_) / 20)
    mix = limiter(mix)
L_ = lufs(mix)
# 終わり：最後の 3 秒で消す
fo = int(min(3.0, len(mix) / SR) * SR)
mix[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.5
pk = 20 * np.log10(np.abs(mix).max() + 1e-12)
with wave.open(OUTF, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
print("音楽", OUTF, round(len(mix) / SR, 1), "秒", f"{L_:.1f} LUFS", f"ピーク {pk:.1f} dBFS")
