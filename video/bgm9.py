# 最終案 9 の音楽（自作。外の曲・外の音・外の音源は使わない。どの音も、ここで式から計算で作る）。
# 作者の声：今の曲は安っぽい。音ハメが TikTok のよう。素人の動画のよう。もっとスマートで美しく。ただし、静かなだけのクラシックもなし。
# ねらい（数字の目安）：穏やかな脈（約 110 拍／分）・長調に 7 度などを足した和音・深く温かい低音（120 Hz 以下に力の 5〜8 割）・
#   音色は暗め（明るさの中心 600〜800 Hz）・打つ音はまばら（1 秒に 1〜2 回）。声の邪魔をしないよう、1〜4 kHz を空ける。
# 映像とは合わせない：曲の大きな区切りだけが場面に対応する。字や効果音を音に合わせない。キック・クラップ・止めてから打つ・上がる音は使わない。
# 安っぽくしないための作り：
#   ・素の正弦波を使わない → 弦を 2〜3 本ずつ少しずらして鳴らす・高い倍音ほど早く消える・鳴らすたびに打ち方（倍音の割合）が少し変わる
#   ・広がる音は、倍音ごとに幅を持たせた表（位相はばらばら）から読む → 同じうなりがくり返さない。音色は、暗い表と明るい表の間をゆっくり動く
#   ・残響は、減衰する雑音で畳み込む（帯ごとに消える速さが違う）→ 箱の響きの山がない
#   ・ぶつかる周波数を避ける → 和音の並べ方を、低い所の音程の決まりで選ぶ。低音は左右の真ん中に寄せる
# 使い方：
#   python -I bgm9.py --plan A                      全長を video/work/music9/ に書く（wav と m4a）
#   python -I bgm9.py --plan A --preview            0:20 からの 45 秒だけ（試聴）
#   python -I bgm9.py --plan A --from 100 --to 130  好きな所だけ
#   python -I bgm9.py --plan A --notes              和音の並び・音の高さの確かめだけ（音は作らない）
#   --icloud を足すと、m4a を作者の iCloud の「継ぐ動画/音楽」へ写す
#   案 D・E は今のところ本体の試聴だけ（--preview）。全長は作者が選んでから作る
#   案 D3 は D2 の全長（最終案 9 の仮の曲）。--sections 区切り.json で章の秒に合わせる（video/final9.py が作る）
# 台本が変わったら、下の SECTIONS と END の秒だけ変える。小節の数と速さは、そこから決まる（1 小節の長さを少し変えて、区切りに小節の頭を合わせる）。

import argparse
import math
import os
import shutil
import subprocess
import sys
import time
import wave
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

import numpy as np

# ================================================================ 場面の区切り（秒）。ここだけ変えれば、曲が組み直される
SECTIONS = [
    ("intro", 0.0),    # 始まり：静かに立ち上がる（指輪と職人の話）
    ("main", 20.0),    # 本体：脈があり、前へ進む（機能を見せる所）
    ("thin", 100.0),   # 伝統工芸の話：薄くなる
    ("gap", 120.0),    # 「途絶えても」：ほとんど消える
    ("build", 126.0),  # 復元の試み：少しずつ積み上がる
    ("peak", 162.0),   # 山は 1 回だけ。品よく
    ("end", 172.0),    # 静かに終わる
]
END = 179.0  # 音が消えきる秒。3:00 を越えないこと

SR = 48000  # 書き出す細かさ
R = 24000   # 計算する細かさ（暗い音なので 10 kHz より上は使わない。最後に SR へ上げる）
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "work", "music9")
ICLOUD = os.path.expanduser("~/Library/Mobile Documents/com~apple~CloudDocs/継ぐ動画/音楽")
TARGET_LUFS = -16.0
CEIL_DB = -1.5

TWO_PI = 2 * math.pi
F32 = np.float32


def hz(m):
    return 440.0 * 2.0 ** ((m - 69) / 12)


def cents(c):
    return 2.0 ** (c / 1200)


def db(x):
    return 10.0 ** (x / 20)


# ================================================================ 速さの地図（拍 → 秒）
class TimeMap:
    """区切りの秒に小節の頭が来るよう、段ごとに速さを少し変える。rit は段の後ろをゆっくりにする量"""

    def __init__(self, bpm, sections, end, multiple=None, rit=None):
        self.bpm = bpm
        self.sec = {}
        multiple = multiple or {}
        rit = rit or {}
        bar = 240.0 / bpm
        knots_b, knots_t = [], []
        beat = 0.0
        for i, (name, t0) in enumerate(sections):
            t1 = sections[i + 1][1] if i + 1 < len(sections) else end
            mul = multiple.get(name, 1)
            bars = max(mul, int(round((t1 - t0) / bar / mul)) * mul)
            self.sec[name] = dict(t0=t0, t1=t1, b0=beat, bars=bars, name=name)
            n = 256
            u = np.linspace(0, 1, n + 1)
            a, start = rit.get(name, (0.0, 0.0))
            m = 1 + a * np.clip((u - start) / max(1e-6, 1 - start), 0, 1) ** 2  # 1 拍の長さの倍率
            g = np.concatenate([[0], np.cumsum((m[1:] + m[:-1]) / 2)])
            g /= g[-1]
            knots_b.append(beat + u * bars * 4)
            knots_t.append(t0 + g * (t1 - t0))
            beat += bars * 4
        self.B = np.concatenate(knots_b)
        self.T = np.concatenate(knots_t)
        self.total_beats = beat
        # 終わりのあとの余り（鳴り残り）のため、最後の速さでのばす
        slope = (self.T[-1] - self.T[-2]) / (self.B[-1] - self.B[-2])
        self.B = np.concatenate([self.B, [self.B[-1] + 400]])
        self.T = np.concatenate([self.T, [self.T[-1] + 400 * slope]])
        # 同じ拍が 2 回並ぶ所（段の境目）を除く
        keep = np.concatenate([[True], np.diff(self.B) > 1e-9])
        self.B, self.T = self.B[keep], self.T[keep]

    def t(self, beat):
        return float(np.interp(beat, self.B, self.T))

    def beat(self, sec):
        return float(np.interp(sec, self.T, self.B))


# ================================================================ 和音
PC = {"C": 0, "Db": 1, "D": 2, "Eb": 3, "E": 4, "F": 5, "Gb": 6, "G": 7, "Ab": 8, "A": 9, "Bb": 10, "B": 11, "Cb": 11}
# 和音の種類：（必ず入れる音、入れてもよい音）を根音からの半音で。根音は低音が鳴らすので、ふつうは上の声に入れない
QUAL = {
    "maj9": ((4, 11, 14), (7,)),
    "maj7": ((4, 11), (7, 14)),
    "maj13": ((4, 11, 14, 21), (7,)),
    "maj9#11": ((4, 11, 14, 18), (7,)),
    "add9": ((4, 14), (7,)),
    "69": ((4, 9, 14), (7,)),
    "6": ((4, 9), (7, 14)),
    "": ((4, 7), (14,)),
    "m": ((3, 7), (14,)),
    "m7": ((3, 10), (7,)),
    "m9": ((3, 10, 14), (7,)),
    "m11": ((3, 10, 17), (7, 14)),
    "m6": ((3, 9), (7,)),
    "7": ((4, 10), (7, 14)),
    "9": ((4, 10, 14), (7,)),
    "13": ((4, 10, 14, 21), ()),
    "7sus": ((5, 10), (7, 14)),
    "13sus": ((5, 10, 14), (21, 7)),
    "9sus": ((5, 10, 14), (7,)),
    "sus2": ((14, 7), ()),
    "m7b5": ((3, 6, 10), ()),
}


def parse_chord(tok):
    """'Ebmaj9/G' → (根音の音名番号, 種類, 低音の音名番号)"""
    body, _, bass = tok.partition("/")
    root = body[:2] if len(body) > 1 and body[1] == "b" else body[:1]
    return PC[root], body[len(root):], PC[bass] if bass else PC[root]


def voice_chord(tok, prev, lo, hi, n, other=()):
    """和音を lo〜hi の中に n 音で並べる。前の和音からの動きが少なく、低い所で音がぶつからない並べ方を選ぶ。other は同時に鳴る別の層の音"""
    root, qual, _ = parse_chord(tok)
    req, opt = QUAL[qual]
    req_pc = [(root + i) % 12 for i in req]
    opt_pc = [(root + i) % 12 for i in opt]
    pcs = list(req_pc)
    for p in opt_pc:
        if len(pcs) < n:
            pcs.append(p)
    # 足りない時は、根音も入れてよい
    if len(pcs) < n:
        pcs.append(root)
    cand = [[m for m in range(lo, hi + 1) if m % 12 == p] for p in pcs]
    best, best_cost = None, 1e18

    def rec(i, cur):
        nonlocal best, best_cost
        if i == len(cand):
            v = sorted(cur)
            cost = 0.0
            for a, b in zip(v, v[1:]):
                d = b - a
                if d == 0:
                    return
                if d == 1:
                    cost += 40 if a < 72 else 14
                if d == 2:
                    cost += 14 if a < 55 else 7  # 全音で固まらない（開いた並べ方のほうが、線が見える）
                if d <= 4 and a < 48:
                    cost += 18
                if d == 6 and a < 52:
                    cost += 6
            for i_, a in enumerate(v):  # どの 2 音も、短 9 度（13 半音）にしない
                for b in v[i_ + 1:]:
                    if (b - a) == 13:
                        cost += 26
                for b in other:  # 別の層とも
                    d2 = abs(b - a)
                    if d2 % 12 == 1 and d2 <= 25:
                        cost += 60
            if prev:
                p = sorted(prev)
                if len(p) == len(v):
                    cost += sum(abs(x - y) for x, y in zip(v, p))
                else:
                    cost += sum(min(abs(x - y) for y in p) for x in v)
            # 真ん中あたりを好む（範囲の端に寄らない）
            cost += 0.15 * abs(sum(v) / len(v) - (lo + hi) / 2)
            if cost < best_cost:
                best, best_cost = v, cost
            return
        for m in cand[i]:
            rec(i + 1, cur + [m])

    rec(0, [])
    return best


# ================================================================ 周波数の側のフィルター（位相を変えない）。ゆるやかな形だけ使う
def lp(f, fc, order=2):
    return 1.0 / np.sqrt(1.0 + (np.maximum(f, 0) / fc) ** (2 * order))


def hp(f, fc, order=2):
    r = np.maximum(f, 1e-3) / fc
    return r ** order / np.sqrt(1.0 + r ** (2 * order))


def bell(f, fc, gain_db, width_oct=1.0):
    """対数の周波数で、なめらかな山・谷"""
    x = np.log2(np.maximum(f, 1.0) / fc) / width_oct
    return 10.0 ** (gain_db * np.exp(-0.5 * x * x) / 20)


def filt(x, fn, rate=None):
    """x は (n,) か (n, 2)。fn(f) が大きさ。rate を省くと、計算の細かさ R"""
    rate = rate or R
    if x.ndim == 2:
        return np.stack([filt(x[:, c], fn, rate) for c in range(x.shape[1])], 1)
    n = len(x)
    m = 1 << int(math.ceil(math.log2(n + rate // 2)))
    X = np.fft.rfft(x, m)
    f = np.fft.rfftfreq(m, 1.0 / rate)
    return np.fft.irfft(X * fn(f), m)[:n]


def convolve(x, ir):
    """x (n, 2) を ir (k, 2) で畳み込む"""
    n = len(x) + len(ir)
    m = 1 << int(math.ceil(math.log2(n)))
    out = np.zeros_like(x, dtype=np.float64)
    for c in range(2):
        out[:, c] = np.fft.irfft(np.fft.rfft(x[:, c], m) * np.fft.rfft(ir[:, c], m), m)[: len(x)]
    return out


def osc(f, t, ph=0.0):
    """正弦波（位相を 0〜1 に畳んでから 32 ビットで計算する。速い）"""
    x = f * t + ph
    x = x - np.floor(x)
    return np.sin((TWO_PI * x).astype(F32))


def raised(t, ta):
    """音の始まりの形（なめらかに立ち上がる。折れない）"""
    u = np.clip(t / ta, 0, 1)
    return 0.5 - 0.5 * np.cos(np.pi * u)


# ================================================================ 残響（減衰する雑音で畳み込む）。帯ごとに消える速さが違う
def make_ir(rt_low, rt_mid, rt_high, pre, seed, onset=0.012, length=None):
    length = length or max(rt_low, rt_mid) * 1.25
    n = int(length * R)
    m = 1 << int(math.ceil(math.log2(n * 2)))
    t = np.arange(n) / R
    rng = np.random.default_rng(seed)
    f = np.fft.rfftfreq(m, 1.0 / R)
    g_lo = lp(f, 320, 2)
    g_hi = hp(f, 2100, 2)
    g_mid = np.sqrt(np.maximum(0, 1 - g_lo ** 2 - g_hi ** 2))
    ir = np.zeros((n, 2))
    for c in range(2):
        W = np.fft.rfft(rng.standard_normal(n), m)
        for g, rt in ((g_lo, rt_low), (g_mid, rt_mid), (g_hi, rt_high)):
            ir[:, c] += np.fft.irfft(W * g, m)[:n] * np.exp(-6.91 * t / rt)
    ir *= raised(t, onset)[:, None]  # 始まりをなめらかに（壁の反射の粒を作らない）
    p = int(pre * R)
    ir = np.concatenate([np.zeros((p, 2)), ir[: n - p]])
    ir /= np.sqrt((ir ** 2).sum(0, keepdims=True))
    return ir


_body = None


def body_ir():
    """木の胴の、ごく短い響き（40 ms ほど。暖かさを足すだけ。箱の響きにならないよう、山を作らず短く）"""
    global _body
    if _body is None:
        n = int(0.09 * R)
        t = np.arange(n) / R
        rng = np.random.default_rng(71)
        x = np.stack([filt(rng.standard_normal(n), lambda f: bell(f, 180, 5, 1.4) * bell(f, 420, 2, 0.9) * lp(f, 1600, 2) * hp(f, 70, 2)) for _ in range(2)], 1)
        x *= (np.exp(-t / 0.016) * raised(t, 0.001))[:, None]
        x /= np.sqrt((x ** 2).sum(0, keepdims=True))
        _body = x
    return _body


def tempo_delay(x, d, fb, taps, hi=2400.0, lo=220.0, cross=True):
    """やわらかく消えるディレイ。くり返すほど高い所が丸くなる。cross なら左右を交互に"""
    n = len(x)
    pad = int(d * R * (taps + 1))
    m = 1 << int(math.ceil(math.log2(n + pad)))
    f = np.fft.rfftfreq(m, 1.0 / R)
    H = lp(f, hi, 1) * hp(f, lo, 1)
    XL, XR = np.fft.rfft(x[:, 0], m), np.fft.rfft(x[:, 1], m)
    YL, YR = np.zeros_like(XL), np.zeros_like(XR)
    for k in range(1, taps + 1):
        g = (fb ** (k - 1)) * (H ** k) * np.exp(-2j * np.pi * f * k * d)
        if cross and k % 2:
            YL += XR * g
            YR += XL * g
        else:
            YL += XL * g
            YR += XR * g
    return np.stack([np.fft.irfft(YL, m)[:n], np.fft.irfft(YR, m)[:n]], 1)


def drift_warp(x, depth_ms, rate_hz, seed):
    """ごくゆっくりと音の高さが揺れる（テープのような揺れ）。左右で少し違う"""
    n = len(x)
    rng = np.random.default_rng(seed)
    out = np.zeros_like(x)
    idx = np.arange(n, dtype=np.float64)
    t = idx / R
    for c in range(2):
        a = rng.uniform(0, TWO_PI, 3)
        w = (np.sin(TWO_PI * rate_hz * t + a[0]) + 0.6 * np.sin(TWO_PI * rate_hz * 0.37 * t + a[1]) + 0.3 * np.sin(TWO_PI * rate_hz * 2.3 * t + a[2])) / 1.9
        out[:, c] = np.interp(idx + depth_ms * 1e-3 * R * (1 + w), idx, x[:, c])
    return out


# ================================================================ 楽器
def note_time(dur_s, tail):
    n = int((dur_s + tail) * R)
    return np.arange(n, dtype=np.float64) / R, n


def felt_piano(m, v, dur_s, rng, pan=0.0, mute=1.0, top=6500.0, sub=0.0, click=0.0, rel_s=None, spread_lr=0.45):
    """フェルトの弱音ピアノ。弦を少しずつずらして鳴らす（うなりが自然に出る）。
    高い倍音ほど早く消え、消え方は 2 段（はじめ速く、あとゆっくり）。強く弾くほど明るい。"""
    f0 = hz(m) * cents(rng.normal(0, 0.5))
    rel = rel_s if rel_s else 0.32 + 0.20 * np.clip((60 - m) / 24, 0, 1)
    tail = 0.9
    t, n = note_time(dur_s, tail)
    v = float(np.clip(v, 0.03, 1.0))
    B = 2.8e-4 * 2 ** ((m - 60) / 12 * 0.75)
    B = float(np.clip(B, 1.6e-4, 3.5e-3))
    fc = (480 + 2100 * v ** 1.4) * mute * rng.uniform(0.94, 1.06)  # 鳴らすたびに打ち方が少し違う
    p = 0.123 * rng.uniform(0.97, 1.03)  # 打つ位置
    T1 = 1.7 * 2 ** (-(m - 60) / 26)
    T2 = 7.5 * 2 ** (-(m - 60) / 22)
    det = rng.uniform(0.35, 0.95)  # 弦のずれ（セント）
    if m >= 50:
        offs = (-det, det * rng.uniform(-0.25, 0.25), det * rng.uniform(0.8, 1.1))
    elif m >= 38:
        offs = (-det * 0.6, det * 0.6)
    else:
        offs = (0.0,)
    gl, gr = math.cos((pan + 1) * math.pi / 4) * 1.4142, math.sin((pan + 1) * math.pi / 4) * 1.4142
    ns = len(offs)
    spread = np.linspace(-spread_lr, spread_lr, ns) if ns > 1 else np.zeros(1)
    L = np.zeros(n, F32)
    Rr = np.zeros(n, F32)
    a1 = None
    damp = np.ones(n, F32)
    i_rel = int(dur_s * R)
    if i_rel < n:
        tr = t[i_rel:] - dur_s
        damp[i_rel:] = np.exp(-tr / rel).astype(F32)
    for k in range(1, 64):
        fk = k * f0 * math.sqrt(1 + B * k * k)
        if fk > top or fk > 0.42 * R:
            break
        # 打つ位置で抜ける倍音・やわらかいフェルト（高い所が落ちる）・胴は低い音を出しにくい
        a = (abs(math.sin(math.pi * k * p)) ** 0.75 + 0.03) * k ** -0.6 / (1 + (fk / fc) ** 1.9) * (fk / (fk + 75.0)) ** 1.3
        a *= rng.uniform(0.92, 1.08)
        if a1 is None:
            a1 = a
        if a < 0.0025 * a1:
            continue
        tau1 = T1 / (1 + 0.20 * (k - 1) * (f0 / 262) ** 0.35)
        tau2 = T2 / (1 + 0.14 * (k - 1))
        w = 0.28 + 0.1 * rng.uniform(-1, 1)
        env = ((1 - w) * np.exp(-t / tau1) + w * np.exp(-t / tau2)).astype(F32)
        # 低い倍音はゆっくり立ち上がる
        ta = (0.0035 + 0.006 * (1 - v)) / (1 + 0.25 * (k - 1))
        env = env * raised(t, ta).astype(F32)
        strings = offs if k <= 10 else offs[:1]
        for s, off in enumerate(strings):
            x = osc(fk * cents(off), t, rng.uniform(0, 0.05)) * env * (a / (len(strings) ** 0.5))
            sp = spread[s] if k <= 10 else 0.0
            L += x * (gl * (1 + sp))
            Rr += x * (gr * (1 - sp))
    # フェルトがあたる「トン」（低い帯の、とても短い雑音）
    nt = min(n, int(0.09 * R))
    knock = rng.standard_normal(nt)
    knock = filt(knock, lambda f: bell(f, 170 + 90 * v, 8, 1.0) * lp(f, 650 + 700 * v, 2) * hp(f, 60, 2))
    ee = np.exp(-t[:nt] / (0.012 + 0.012 * (1 - v))) * raised(t[:nt], 0.0015)
    knock = knock * ee / (np.abs(knock).max() + 1e-9) * (0.018 + 0.05 * v)
    out = np.stack([L * damp, Rr * damp], 1).astype(np.float64)
    out[:nt] += np.stack([knock * gl, knock * gr], 1)
    if click:  # ひとりで鳴らす時：打った瞬間のごく小さな明るい音（近さ）
        ck = filt(rng.standard_normal(nt), lambda f: hp(f, 1800, 1) * lp(f, 9000, 1))
        ck = ck / (np.abs(ck).max() + 1e-9) * np.exp(-t[:nt] / 0.004) * raised(t[:nt], 0.001) * (0.003 + 0.016 * v) * click
        out[:nt] += np.stack([ck * gl, ck * gr], 1)
    if sub:  # 低い音の下を少し支える（ピアノの胴は、いちばん低い音を出しにくい）
        y = sub * (0.18 + 0.82 * v) * osc(f0, t) * (0.75 * np.exp(-t / 2.2) + 0.25 * np.exp(-t / 6.0)) * raised(t, 0.012)
        out += (y * damp)[:, None]
    tail_n = int(0.1 * R)
    out[-tail_n:] *= np.linspace(1, 0, tail_n)[:, None]
    return out * (0.14 + 0.86 * v) * 1.1


def epiano(m, v, dur_s, rng, pan=0.0, bright=1.5, glass=0.0):
    """やわらかい電気ピアノ。ふつうの FM ではなく、鳴る音に、受ける部分のひずみ（強く弾くと倍音が増える）を足す。"""
    f = hz(m) * cents(rng.normal(0, 1.0))
    v = float(np.clip(v, 0.03, 1.0))
    tail = 0.5
    t, n = note_time(dur_s, tail)
    tau = 2.4 * 2 ** (-(m - 60) / 20)
    out = np.zeros((n, 2))
    a2 = (0.14 + 0.26 * v) * bright * rng.uniform(0.9, 1.1)
    a3 = (0.05 + 0.16 * v ** 1.3) * bright * rng.uniform(0.85, 1.15)
    ping_ratio = 6.97 * rng.uniform(0.995, 1.005)
    a_ping = (0.006 + 0.05 * v * v) * bright
    k2 = 0.09 + 0.20 * v
    k3 = 0.02 + 0.06 * v
    for c, det in enumerate((-0.9, 0.9)):
        fd = f * cents(det + rng.normal(0, 0.15))
        ph = rng.uniform(0, 0.03)
        x = osc(fd, t, ph) * (0.72 * np.exp(-t / tau) + 0.28 * np.exp(-t / (tau * 3.2))).astype(F32)
        x = x + a2 * osc(fd * 2, t, ph) * np.exp(-t / (tau * 0.42)).astype(F32)
        x = x + a3 * osc(fd * 3, t, ph) * np.exp(-t / (tau * 0.22)).astype(F32)
        x = x + a3 * 0.45 * osc(fd * 4, t, ph) * np.exp(-t / (tau * 0.15)).astype(F32)
        x = x + a3 * 0.22 * osc(fd * 5, t, ph) * np.exp(-t / (tau * 0.1)).astype(F32)
        if fd * ping_ratio < 7500:
            x = x + a_ping * osc(fd * ping_ratio, t, ph) * np.exp(-t / 0.05).astype(F32)
        if glass > 0:
            # ガラスのような上の響き（少しずらして 2 本。ゆっくりうなる）
            for r_, g_, d_ in ((2.0, 0.16, 0.8), (4.0, 0.05, 0.45), (6.0, 0.012, 0.25)):
                if fd * r_ < 8000:
                    x = x + glass * g_ * (0.5 + 0.5 * v) * osc(fd * r_ * cents(1.6 if c else -1.6), t, ph) * np.exp(-t / (tau * d_)).astype(F32)
        x = x * (0.25 + 0.75 * v) * 0.8
        y = x + k2 * x * x - k3 * x * x * x
        out[:, c] = y
    nt = min(n, int(0.03 * R))
    nz = filt(rng.standard_normal(nt), lambda ff: hp(ff, 2200, 1) * lp(ff, 9000, 1))
    nz = nz / (np.abs(nz).max() + 1e-9) * np.exp(-t[:nt] / 0.006) * (0.002 + 0.012 * v) * bright
    out[:nt] += nz[:, None]
    ta = 0.0018 + 0.0035 * (1 - v) + 0.002 * np.clip((60 - m) / 24, 0, 1)
    env = raised(t, ta)
    i_rel = int(dur_s * R)
    if i_rel < n:
        tr = t[i_rel:] - dur_s
        env[i_rel:] *= np.exp(-tr / 0.11)
    env[-int(0.04 * R):] *= np.linspace(1, 0, int(0.04 * R))
    out *= env[:, None]
    gl, gr = math.cos((pan + 1) * math.pi / 4) * 1.4142, math.sin((pan + 1) * math.pi / 4) * 1.4142
    out[:, 0] *= gl
    out[:, 1] *= gr
    return out


def round_bass(m, v, dur_s, rng, tone=1.0):
    """丸く深い低音。根の音のほか、スマホでも線が聞こえるよう 2〜6 倍音を少し持つ。鳴らすたびに少し違う。"""
    f = hz(m) * cents(rng.normal(0, 1.5))
    v = float(np.clip(v, 0.03, 1.0))
    tail = 0.22
    t, n = note_time(dur_s, tail)
    # 始まりだけ少し高い所から落ち着く（指で弾いたときの押さえ）
    fm = 1 + (cents(rng.uniform(6, 14)) - 1) * np.exp(-t / 0.035)
    ph = np.cumsum(fm) * f / R
    ph = ph - np.floor(ph)
    fc = (250 + 420 * v ** 1.2) * tone * rng.uniform(0.93, 1.07)
    x = np.zeros(n, F32)
    T = 1.7 + 1.2 * np.clip((48 - m) / 18, 0, 1)
    amp = [1.0, 0.30, 0.17, 0.10, 0.07, 0.05, 0.035, 0.025, 0.018, 0.012]
    for k, a in enumerate(amp, 1):
        fk = f * k
        if fk > 1500:
            break
        g = a / math.sqrt(1 + (fk / fc) ** 4) * rng.uniform(0.92, 1.08)
        tauk = T / (1 + 0.65 * (k - 1))
        y = np.sin((TWO_PI * ((ph * k) % 1.0)).astype(F32)) * (0.8 * np.exp(-t / tauk) + 0.2).astype(F32) * g
        x += y
    # 指があたる小さな音（高くない帯）
    nt = min(n, int(0.05 * R))
    nz = filt(rng.standard_normal(nt), lambda ff: bell(ff, 420, 6, 0.9) * lp(ff, 1300, 2) * hp(ff, 120, 2))
    nz = nz / (np.abs(nz).max() + 1e-9) * np.exp(-t[:nt] / 0.008) * raised(t[:nt], 0.0015) * (0.012 + 0.04 * v)
    x = x.astype(np.float64)
    x = x + 0.10 * x * x  # 偶数の倍音（暖かさ）
    x = np.tanh(1.1 * x) / np.tanh(1.1)  # 穏やかな飽和
    ta = 0.006 + 0.010 * (1 - v)
    env = raised(t, ta)
    i_rel = int(dur_s * R)
    if i_rel < n:
        tr = t[i_rel:] - dur_s
        env[i_rel:] *= np.exp(-tr / 0.055)
    env[-int(0.03 * R):] *= np.linspace(1, 0, int(0.03 * R))
    x = x * env
    x[:nt] += nz
    x *= 0.25 + 0.75 * v
    return np.stack([x, x], 1)


def felt_thump(v, f_end, rng, tap=1.0):
    """フェルトで胴をたたくような、低く丸い一打。カチッという音は入れない。音の高さは弧を描いて落ち、今の和音の音に着く。"""
    t, n = note_time(0.5, 0.0)
    sweep = rng.uniform(3.6, 4.4) * (0.6 + 0.5 * v)
    f = f_end * (1 + sweep * np.exp(-t / 0.016) + 0.30 * np.exp(-t / 0.07))
    ph = np.cumsum(f) / R
    x = np.sin((TWO_PI * (ph - np.floor(ph))).astype(F32)).astype(np.float64)
    x = x * np.exp(-t / (0.15 + 0.05 * v)) * raised(t, 0.004)
    x += 0.17 * np.sin(TWO_PI * (2 * ph - np.floor(2 * ph)) + 0.4) * np.exp(-t / 0.05) * raised(t, 0.003)
    nz = filt(rng.standard_normal(n), lambda ff: bell(ff, 340, 8, 0.9) * lp(ff, 1300, 2) * hp(ff, 120, 2))
    nz = nz / (np.abs(nz).max() + 1e-9) * np.exp(-t / 0.022) * raised(t, 0.002) * (0.07 + 0.14 * v) * tap
    x = np.tanh(1.15 * (x + nz)) / np.tanh(1.15)
    x[-int(0.05 * R):] *= np.linspace(1, 0, int(0.05 * R))
    x *= 0.25 + 0.75 * v
    return np.stack([x, x], 1)


def soft_pluck(m, v, dur_s, rng, pan=0.0):
    """ハープのようなやわらかいはじく音。短く消える。分散和音の飾りに。"""
    f0 = hz(m) * cents(rng.normal(0, 1.2))
    v = float(np.clip(v, 0.03, 1.0))
    tail = 0.6
    t, n = note_time(dur_s, tail)
    p = 0.2 * rng.uniform(0.9, 1.1)
    fc = max(800 + 1400 * v, hz(m) * 2.5) * rng.uniform(0.92, 1.08)
    T = 1.15 * 2 ** (-(m - 60) / 22)
    out = np.zeros((n, 2))
    for c, det in enumerate((-1.1, 1.1)):
        x = np.zeros(n, F32)
        for k in range(1, 14):
            fk = k * f0
            if fk > 8500:
                break
            a = (abs(math.sin(math.pi * k * p)) + 0.05) / k ** 0.9 / (1 + (fk / fc) ** 2.0)
            x += osc(fk * cents(det), t, rng.uniform(0, 0.02)) * np.exp(-t / (T / (1 + 0.35 * (k - 1)))).astype(F32) * a
        out[:, c] = x
    env = raised(t, 0.0025 + 0.003 * (1 - v))
    env[-int(0.05 * R):] *= np.linspace(1, 0, int(0.05 * R))
    out *= env[:, None] * (0.2 + 0.8 * v) * 0.8
    gl, gr = math.cos((pan + 1) * math.pi / 4) * 1.4142, math.sin((pan + 1) * math.pi / 4) * 1.4142
    out[:, 0] *= gl
    out[:, 1] *= gr
    return out


def soft_mallet(m, v, dur_s, rng, pan=0.0):
    """やわらかいばちでたたく、木の鍵盤のような音（マリンバを暗くしたもの）。"""
    f0 = hz(m) * cents(rng.normal(0, 1.0))
    v = float(np.clip(v, 0.03, 1.0))
    tail = 0.8
    t, n = note_time(dur_s, tail)
    T = 1.0 * 2 ** (-(m - 60) / 18)
    modes = [(1.0, 1.0, 1.0), (3.93, 0.10 + 0.22 * v, 0.28), (9.2, 0.015 + 0.05 * v * v, 0.1)]
    out = np.zeros((n, 2))
    for c, det in enumerate((-0.8, 0.8)):
        x = np.zeros(n, F32)
        for r, a, d in modes:
            fk = f0 * r * rng.uniform(0.999, 1.001)
            if fk > 4800:
                continue
            x += osc(fk * cents(det), t, rng.uniform(0, 0.02)) * np.exp(-t / (T * d)).astype(F32) * a
        out[:, c] = x
    nt = min(n, int(0.03 * R))
    knock = filt(rng.standard_normal(nt), lambda ff: bell(ff, hz(m) * 2, 5, 0.8) * lp(ff, 1500, 2) * hp(ff, 110, 2))
    knock = knock / (np.abs(knock).max() + 1e-9) * np.exp(-t[:nt] / 0.005) * raised(t[:nt], 0.002) * (0.02 + 0.05 * v)
    env = raised(t, 0.003 + 0.0045 * (1 - v))
    env[-int(0.05 * R):] *= np.linspace(1, 0, int(0.05 * R))
    out *= env[:, None] * (0.2 + 0.8 * v) * 0.8
    out[:nt] += knock[:, None]
    gl, gr = math.cos((pan + 1) * math.pi / 4) * 1.4142, math.sin((pan + 1) * math.pi / 4) * 1.4142
    out[:, 0] *= gl
    out[:, 1] *= gr
    return out


INSTR = {"piano": felt_piano, "ep": epiano, "bass": round_bass, "pluck": soft_pluck, "mallet": soft_mallet}

# ---------------------------------------------------------------- 広がる音（倍音ごとに幅を持つ表。位相はばらばら）
TIMBRES = {
    # bw：倍音の幅（セント）、bwk：高い倍音ほど広がる割合、tilt：倍音の落ち方、fc：暗い時・明るい時の高い所の落ち始め、form：(周波数, dB, 幅(オクターブ))
    "line": dict(bw=6, bwk=0.55, tilt=0.92, fc=(1700, 3800), order=1.0, form=[(800, 2.5, 1.0)], fmax=9000),
    "warm": dict(bw=14, bwk=0.6, tilt=1.0, fc=(900, 2400), order=1.3, form=[(420, 2, 0.9)], fmax=7000),
    "low": dict(bw=8, bwk=0.5, tilt=1.3, fc=(420, 900), order=2.0, form=[(260, 2, 1.0)], fmax=2600),
    "string": dict(bw=18, bwk=0.65, tilt=0.88, fc=(1300, 3000), order=1.3, form=[(560, 3, 0.7), (1150, 1.5, 0.6)], fmax=8000),
    "choir": dict(bw=34, bwk=0.8, tilt=0.8, fc=(1100, 2400), order=1.6, form=[(380, 7, 0.55), (820, 4.5, 0.5), (1500, -4, 0.8)], fmax=7000),
    "air": dict(bw=80, bwk=0.9, tilt=0.55, fc=(4000, 9000), order=1.5, form=[], fmax=10000),
}
_tables = {}
TAB_N = 1 << 19


def pad_table(timbre, m):
    key = (timbre, m)
    if key in _tables:
        return _tables[key]
    sp = TIMBRES[timbre]
    f = np.fft.rfftfreq(TAB_N, 1.0 / R)
    f0 = hz(m)
    A = np.zeros((2, len(f)))
    for k in range(1, 128):
        fk = f0 * k
        if fk >= min(sp["fmax"], 0.42 * R):
            break
        bw_hz = (2 ** (sp["bw"] / 1200) - 1) * f0 * k ** sp["bwk"]
        sg = max(bw_hz / 2.355, 0.12)
        i0 = int(np.searchsorted(f, fk - 4 * sg))
        i1 = int(np.searchsorted(f, fk + 4 * sg))
        if i1 <= i0 + 1:
            continue
        g = np.exp(-0.5 * ((f[i0:i1] - fk) / sg) ** 2)
        g /= math.sqrt((g * g).sum())
        form = 1.0
        for ff, dbv, w in sp["form"]:
            form = form * float(bell(np.array([fk]), ff, dbv, w)[0])
        base = k ** -sp["tilt"] * form
        for j, fc in enumerate(sp["fc"]):
            a = base / math.sqrt(1 + (fk / fc) ** (2 * sp["order"]))
            A[j, i0:i1] += a * g
    seed = (m * 131 + sum(ord(ch) for ch in timbre) * 7) & 0xFFFF
    rng = np.random.default_rng(seed)
    ph = rng.uniform(0, TWO_PI, (2, len(f)))
    tabs = np.zeros((2, 2, TAB_N), F32)
    for j in range(2):  # 暗い・明るい
        for c in range(2):  # 左・右（位相が別なので、広く聞こえる）
            tabs[j, c] = np.fft.irfft(A[j] * np.exp(1j * ph[c]) * (TAB_N / 2.0), TAB_N).astype(F32)
    _tables[key] = tabs
    return tabs


# ================================================================ 楽譜を書く道具
class Song:
    def __init__(self, name, seed, bpm, multiple=None, rit=None, swing=0.5):
        self.name = name
        self.seed = seed
        self.tm = TimeMap(bpm, SECTIONS, END, multiple, rit)
        self.notes = []  # (楽器, 鳴らすバス, 開始秒, 長さ秒, 音, 強さ, その他)
        self.pads = defaultdict(list)  # 層の名前 → [(始め秒, 終わり秒, 音, 大きさ)]
        self.pad_cfg = {}
        self.autos = {}
        self.chords = []  # (拍, 拍数, 和音の名前)
        self.swing = swing
        self.rng = np.random.default_rng(seed)
        self.mix = {}
        self.thumps = []
        self.melody = []
        self.voiced = []
        self.bass_lo = 29
        self.scale = {3, 5, 7, 8, 10, 0, 2}

    def sec(self, name):
        return self.tm.sec[name]

    def at(self, name, frac=0.0):
        s = self.tm.sec[name]
        return s["t0"] + (s["t1"] - s["t0"]) * frac

    def step(self, beat, step16=0):
        """拍 ＋ 16 分の位置 → 拍（裏の 16 分を少しうしろへ）"""
        odd = step16 % 2
        return beat + step16 / 4 + (self.swing - 0.5) * 0.5 * odd

    def note(self, inst, bus, beat, dur_beats, m, v, late_ms=0.0, jit_ms=4.0, **kw):
        t0 = self.tm.t(beat)
        t1 = self.tm.t(beat + dur_beats)
        at = t0 + (late_ms + self.rng.normal(0, jit_ms)) * 1e-3
        # フレーズの弧：8 拍と 16 拍の波を、ほんの少し
        v = v * (1 + 0.06 * math.sin(TWO_PI * beat / 16 - 1.2) + 0.03 * math.sin(TWO_PI * beat / 7.0))
        self.notes.append((inst, bus, at, max(0.02, t1 - t0), int(m), float(v), kw))

    def pad(self, layer, beat0, beat1, m, level=1.0, jit_ms=25.0):
        a = self.tm.t(beat0) + self.rng.normal(0, jit_ms) * 1e-3
        b = self.tm.t(beat1) + self.rng.normal(0, jit_ms) * 1e-3
        self.pads[layer].append((a, b, int(m), float(level)))

    def auto(self, bus, pts):
        """バスの大きさの動き：[(秒, dB), ...]。間は直線でつなぐ"""
        self.autos[bus] = sorted(pts)

    def fill_groups(self, sec, groups, tail, repeat, drop):
        """段を「組」（8 小節など）で埋める。多ければ repeat をくり返し、少なければ drop を順に抜く。端数は tail をのばす"""
        d = self.tm.sec[sec]
        n = d["bars"]
        bars = lambda toks: sum(float(t.partition(":")[2] or 4) for t in toks.split()) / 4  # noqa: E731
        g = list(groups)
        total = sum(bars(c) for _, c in g)
        rep = next(c for nm, c in g if nm == repeat)
        while n >= total + bars(rep):
            g.insert(1, (repeat, rep))
            total += bars(rep)
        for nm_d in drop:
            if n >= total:
                break
            for x in list(g):
                if x[0] == nm_d:
                    g.remove(x)
                    total -= bars(x[1])
                    break
        out = []
        b = d["b0"]
        for nm, c in g:
            out.append((nm, b))
            b = self.add_chords(b, c)
        while b < d["b0"] + n * 4:
            b = self.add_chords(b, tail)
        return out

    def group_of(self, groups, beat):
        cur = None
        for nm, gb in groups:
            if gb <= beat:
                cur = (nm, gb)
        return cur

    def voice_all(self, pad, ep):
        """和音の並べ方を、前から順に決める。pad・ep は（低い限り, 高い限り, 音の数）"""
        pv_pad, pv_ep = None, None
        self.voiced = []
        for b0, ln, tok in self.chords:
            pv_ep = voice_chord(tok, pv_ep, ep[0], ep[1], ep[2])
            pv_pad = voice_chord(tok, pv_pad, pad[0], pad[1], pad[2], other=pv_ep)
            self.voiced.append((b0, ln, tok, pv_pad, pv_ep))

    def sec_of(self, beat):
        for nm, d in self.tm.sec.items():
            if d["b0"] <= beat < d["b0"] + d["bars"] * 4:
                return nm
        return "end"

    def rel(self, beat):
        """段の中の位置（0〜1）"""
        d = self.tm.sec[self.sec_of(beat)]
        return (beat - d["b0"]) / (d["bars"] * 4)

    def root_midi(self, tok):
        return bass_midi(parse_chord(tok)[2], self.bass_lo)

    def low_line(self, tok):
        """根音のオクターブ上の、暖かい線（B♭2〜A3）"""
        pc = parse_chord(tok)[2]
        return 46 + ((pc - 46) % 12)

    def next_root(self, i):
        v = self.voiced
        return parse_chord(v[i + 1][2])[2] if i + 1 < len(v) else parse_chord(v[i][2])[2]

    def approach(self, pc_now, pc_next):
        """次の根音へ歩く音：次の根音の半音か全音となりで、音階の中の音"""
        for d in (-1, -2, 1, 2):
            c = (pc_next + d) % 12
            if c in self.scale and c != pc_now:
                return c
        return (pc_next + 7) % 12

    def thump(self, beat, v, ff):
        self.thumps.append((beat, float(max(0.02, v)), ff))

    def bass(self, table, pat, b0, tok, i, v0):
        """低音の形を置く：table[pat] は [(拍, 長さ, 強さの倍率, 音), ...]。音は r 根音・5 5 度・a 次の根音へ歩く音"""
        root = self.root_midi(tok)
        pc = parse_chord(tok)[2]
        for bt, dur, vm, kind in table[pat]:
            if kind == "r":
                m = root
            elif kind == "5":
                m = root + 7 if root + 7 <= 41 else root - 5
            else:
                m = bass_midi(self.approach(pc, self.next_root(i)))
            self.note("bass", "bass", self.step(b0 + int(bt), int(round((bt % 1) * 4))), dur, m, v0 * vm * self.rng.uniform(0.97, 1.03), late_ms=9)

    def pulse(self, table, pat, b0, tok, vm):
        ff = thump_freq(tok)
        for bt, pv in table[pat]:
            self.thump(b0 + bt, vm * pv * self.rng.uniform(0.95, 1.05), ff)

    def comp(self, form, b0, ln, voicing, base, jit=3.0, inst="ep", bus="ep", pedal=False):
        """和音をまばらに鳴らす。form は [(16 分の位置, 長さの拍, 強さの倍率, 音の数), ...]。上の声から数える。pedal なら和音が変わるまで鳴らしたまま"""
        for st, dur, vm, count in form:
            if st / 4 >= ln:
                continue
            dt = 0.0
            for m in voicing[-count:]:
                d = ln - st / 4 - 0.05 if pedal else min(dur, ln - st / 4)
                self.note(inst, bus, self.step(b0, st) + dt, d, m, base * vm * self.rng.uniform(0.9, 1.1), late_ms=2, jit_ms=jit)
                dt += 0.006

    def dots(self, b0, voicing, v, steps=(8, 10, 12, 14), oct_=24):
        """小節のうしろで、和音を順に上がる小さな粒（2 オクターブ上。声より弱い細い線）"""
        up = sorted(voicing)
        for j, st in enumerate(steps):
            m = up[j % len(up)] + oct_
            while m > 91:  # 高すぎると耳に刺さる（G6 まで）
                m -= 12
            self.note("pluck", "arp", self.step(b0, st), 1.0, m, v * (0.8 + 0.1 * j) * self.rng.uniform(0.85, 1.1), late_ms=4, jit_ms=4, pan=(-0.45 + 0.3 * j))

    def line(self, inst, bus, beat0, notes, oct_=0, g=1.0, **kw):
        """旋律を置く：[(拍, 長さ, 音, 強さ), ...]"""
        for bt, dur, m, v in notes:
            self.note(inst, bus, beat0 + bt, dur, m + oct_, v * g * self.rng.uniform(0.95, 1.05), late_ms=12, jit_ms=5, **kw)
            self.melody.append((beat0 + bt, dur, m + oct_))

    def curve(self, pts, lfo=0.0, period=41.0, phase=0.0):
        """秒 → 値の折れ線に、ゆっくりした揺れを足す（音色がずっと少しずつ変わる）"""
        ts = [p[0] for p in pts]
        vs = [p[1] for p in pts]
        return lambda t: np.interp(t, ts, vs) + lfo * np.sin(TWO_PI * t / period + phase)

    def chord_at(self, beat):
        cur = None
        for b, l, tok in self.chords:
            if b <= beat + 1e-6:
                cur = tok
            else:
                break
        return cur

    def add_chords(self, beat, tokens):
        """'Ebmaj9 Fm9:2 Bb13:2' のように書く（: のあとは拍数。ないと 1 小節）"""
        for tk in tokens.split():
            name, _, ln = tk.partition(":")
            ln = float(ln) if ln else 4.0
            self.chords.append((beat, ln, name))
            beat += ln
        return beat


def fit_bars(tokens, n):
    """和音の並び（小節単位）を n 小節に合わせる。短ければ頭を削り、長ければ最初の和音をのばす。終わりの形を残す"""
    toks = tokens.split()
    bars = sum(float(t.partition(":")[2] or 4) for t in toks) / 4
    while bars > n and len(toks) > 1:
        bars -= float(toks[0].partition(":")[2] or 4) / 4
        toks.pop(0)
    if bars < n:
        toks = [toks[0]] * int(n - bars) + toks
    return " ".join(toks)


def bass_midi(pc, lo=29):
    """低音の高さ：44〜82 Hz あたり（F1〜E2）に収める"""
    m = lo + ((pc - lo) % 12)
    return m


def thump_freq(tok):
    """一打の音程：今の和音の根音か 5 度で、46〜74 Hz に入るもの（ぶつからない）"""
    _, _, b = parse_chord(tok)
    for pc in (b, (b + 7) % 12):
        for m in range(24, 44):
            if m % 12 == pc and 42 <= hz(m) < 62:
                return hz(m)
    return 55.0


# ================================================================ 案 A：温かい和音と低音（変ホ長調）
# 主題は「上へ 6 度、順に下りて、導音から主音へ」。伝統の所では最後の音（主音）が抜け、復元で断片から戻り、山ではじめて上の高さで解決する。
MOTIF_A = [
    (-0.5, 0.5, 70, 0.42),  # 拾い上げ B♭4
    (0.0, 1.4, 79, 0.58),   # G5
    (1.5, 0.9, 77, 0.47),   # F5
    (2.5, 1.4, 74, 0.45),   # D5
    (4.0, 3.2, 75, 0.54),   # E♭5（解決）
]
ANSWER_A = [  # 答え（A♭maj9 の上で #11 の色を通って下りる）
    (7.5, 0.5, 67, 0.34),
    (8.0, 1.4, 75, 0.47),
    (9.5, 0.9, 74, 0.40),
    (10.5, 1.4, 70, 0.38),
    (12.0, 2.5, 72, 0.45),
]
COMP_A = {
    "a": [(0, 3.0, 1.0, 3)],
    "b": [(6, 1.5, 0.78, 2)],
    "c": [(0, 1.5, 0.9, 2), (10, 1.2, 0.7, 2)],
    "d": [(2, 1.5, 0.7, 2), (8, 2.0, 0.85, 3)],
    "e": [(0, 3.5, 0.9, 3)],
}
# 低音の形：（拍, 長さ, 強さの倍率, 音）。音は "r" 根音・"5" 5 度・"a" 次の根音へ歩く音。小節のうしろを空ける
BASS_A = {
    "X": [(0, 2.6, 1.0, "r")],
    "Y": [(0, 1.6, 1.0, "r"), (2, 1.4, 0.66, "5")],
    "S": [(0, 1.3, 1.0, "r"), (1.5, 1.2, 0.62, "r")],
    "W": [(0, 2.4, 1.0, "r"), (3, 0.8, 0.6, "a")],
    "Z": [(0, 2.0, 0.92, "r")],
    "L": [(0, 3.5, 0.9, "r")],
}
# 脈の形：（拍, 強さ）
PULSE_A = {
    "X": [(0, 1.0), (1, 0.72), (2, 0.86)],
    "Y": [(0, 1.0), (2, 0.84), (3, 0.62)],
    "W": [(0, 1.0), (1, 0.7), (2, 0.84), (3, 0.6)],
    "Z": [(0, 0.92)],
    "L": [(0, 0.8), (2, 0.56)],
}


def plan_a():
    s = Song("A", 901, 108, multiple={"main": 4, "build": 4}, rit={"peak": (0.35, 0.5), "end": (1.1, 0.25)}, swing=0.52)
    sc = s.tm.sec
    P1 = "Ebmaj9 Ebadd9/G Abmaj9 Bb13sus Cm9 Abmaj9 Fm11 Bb13sus"
    P1b = "Ebmaj9 Gm7 Abmaj9 Bb6 Cm9 Bbm7:2 Eb9:2 Abmaj9 Fm9:2 Bb13:2"
    P2 = "Abmaj9 Gm7 Fm7 Bb13sus Gm7 C9 Fm7 Bb9"
    TAG = "Abmaj9 Abmaj9 Fm11 Bb13sus"
    s.add_chords(sc["intro"]["b0"], fit_bars("Ebmaj9 Ebmaj9 Ebmaj9 Abmaj9 Abmaj9 Ebadd9/G Abmaj9 Fm11 Bb13sus", sc["intro"]["bars"]))
    main_groups = s.fill_groups("main", [("P1", P1), ("P1b", P1b), ("P2", P2), ("P1c", P1), ("TAG", TAG)], tail="Bb13sus", repeat="P1b", drop=("P1b", "P2"))
    s.add_chords(sc["thin"]["b0"], fit_bars("Cm9 Cm9 Abmaj9 Abmaj9 Fm11 Fm11 Bbsus2 Bbsus2 Bbsus2", sc["thin"]["bars"]))
    s.add_chords(sc["gap"]["b0"], " ".join(["Bbsus2"] * sc["gap"]["bars"]))
    s.add_chords(sc["build"]["b0"], fit_bars("Abadd9 Abadd9 Fm9 Fm9 Cm7 Cm7 Abmaj9 Abmaj9 Ebadd9/G Abmaj9 Bb6 Cm9 Abmaj9 Fm11 Ebadd9/G Bb13sus", sc["build"]["bars"]))
    s.add_chords(sc["peak"]["b0"], fit_bars("Ebmaj9 Ebadd9/G Abmaj9 Bb13sus", sc["peak"]["bars"]))
    s.add_chords(sc["end"]["b0"], fit_bars("Cm9 Abm6 Ebmaj9", sc["end"]["bars"]))
    s.voice_all(pad=(55, 76, 3), ep=(55, 74, 4))

    bright = s.curve([(s.at("intro"), 0.2), (s.at("main"), 0.45), (s.at("main", 0.7), 0.6), (s.at("thin"), 0.45), (s.at("thin", 1.0), 0.15), (s.at("build"), 0.15), (s.at("peak"), 0.85), (s.at("end"), 0.6), (s.at("end", 1.0), 0.2)], lfo=0.08)
    s.pad_cfg["pad"] = dict(timbre="line", att=0.5, rel=1.0, width=1.0, bright=bright)
    s.pad_cfg["padlow"] = dict(timbre="low", att=0.14, rel=0.4, width=0.2, bright=bright)
    s.pad_cfg["strings"] = dict(timbre="string", att=0.9, rel=1.4, width=1.0, bright=bright)
    s.pad_cfg["air"] = dict(timbre="air", att=1.2, rel=1.6, width=1.0)
    rng = s.rng
    GUIDE_P2 = [72, 70, 68, 67, 70, 70, 68, 68]  # 中ほどの弦の線：和音の 3 度と 7 度を、順に
    RISE = [63, 63, 65, 65, 67, 67, 68, 68, 70, 70, 72, 72, 72, 74, 74, 74]  # 復元の弦：少しずつ上がる

    def play_bass(pat, b0, tok, i, v0):
        root = s.root_midi(tok)
        pc = parse_chord(tok)[2]
        for bt, dur, vm, kind in BASS_A[pat]:
            if kind == "r":
                m = root
            elif kind == "5":
                m = root + 7 if root + 7 <= 41 else root - 5
            else:
                m = bass_midi(s.approach(pc, s.next_root(i)))
            s.note("bass", "bass", s.step(b0 + int(bt), int(round((bt % 1) * 4))), dur, m, v0 * vm * rng.uniform(0.97, 1.03), late_ms=9)

    def play_pulse(pat, b0, tok, vm):
        ff = thump_freq(tok)
        for bt, pv in PULSE_A[pat]:
            s.thump(b0 + bt, vm * pv * rng.uniform(0.95, 1.05), ff)

    for i, (b0, ln, tok, vp, ve) in enumerate(s.voiced):
        nm = s.sec_of(b0)
        rel = s.rel(b0)
        root = s.root_midi(tok)
        lowm = s.low_line(tok)
        ff = thump_freq(tok)
        # ---- 広がる音
        if nm != "gap":
            for m in vp:
                s.pad("pad", b0, b0 + ln, m, 1.0)
            s.pad("padlow", b0, b0 + ln - (0.7 if ln >= 4 else 0.3), lowm, 1.0)
            s.pad("air", b0, b0 + ln, sorted(vp)[-1] + 12, 1.0)
            s.pad("air", b0, b0 + ln, sorted(vp)[0] + 24, 0.8)
        # ---- 段ごとの中身
        if nm == "intro":
            if rel >= 0.3:
                s.note("bass", "bass", b0, ln - 0.8, root, 0.36 + 0.34 * rel, late_ms=8)
            if rel >= 0.75:
                s.thump(b0, 0.2 + 0.26 * (rel - 0.75) * 4, ff)
                s.thump(b0 + 2, 0.14 + 0.22 * (rel - 0.75) * 4, ff)
        elif nm == "main":
            gname, gb = s.group_of(main_groups, b0)
            bar_i = int((b0 - gb) // 4)
            v0 = {"P1": 0.82, "P1b": 0.84, "P2": 0.78, "P1c": 0.88, "TAG": 0.66}[gname] * rng.uniform(0.97, 1.03)
            vm = {"P1": 0.72, "P1b": 0.76, "P2": 0.62, "P1c": 0.82, "TAG": 0.56 - 0.06 * bar_i}[gname]
            if ln < 4:
                s.note("bass", "bass", b0, ln - 0.3, root, v0, late_ms=9)
                s.thump(b0, vm * 0.9, ff)
            else:
                if gname in ("P1", "P1c"):
                    form = "XYXWXYXZ"[bar_i % 8]
                    bform = form if gname == "P1" else "SYSWSYSZ"[bar_i % 8]
                elif gname == "P1b":
                    form = "XYXWXYXZ"[bar_i % 8]
                    bform = "SYSWSYSZ"[bar_i % 8]
                else:
                    form = bform = "L"
                play_bass(bform, b0, tok, i, v0)
                play_pulse(form, b0, tok, vm)
            # 電気ピアノ：まばらに
            forms = {"P1": "abacabdc", "P1b": "dcabcabd", "P2": "aeaeaeae", "P1c": "abdcabdc", "TAG": "eeee"}[gname]
            base = {"P1": 0.40, "P1b": 0.42, "P2": 0.34, "P1c": 0.46, "TAG": 0.3}[gname]
            s.comp(COMP_A[forms[bar_i % len(forms)]] if ln >= 4 else [(0, ln - 0.5, 0.9, 2)], b0, ln, ve, base)
            # 分散の飾り
            if gname in ("P1b", "P1c") and ln >= 4 and bar_i % 2 == 1:
                s.dots(b0, ve, 0.30 if gname == "P1b" else 0.34)
            # 弦
            if gname == "P2" and bar_i < len(GUIDE_P2):
                s.pad("strings", b0, b0 + ln, GUIDE_P2[bar_i], 1.0)
            if gname == "P1c":
                s.pad("strings", b0, b0 + ln, sorted(vp)[-1] + 12, 0.9)
        elif nm == "thin":
            if rel < 0.72:
                s.note("bass", "bass", b0, ln - 0.8, root, 0.62 * (1 - 0.65 * rel), late_ms=8)
            if rel < 0.25:
                s.thump(b0, 0.18 - rel * 0.4, ff)
            if rel < 0.5:
                s.comp([(0, 3.2, 1.0, 2)], b0, ln, ve, 0.22 * (1 - 0.6 * rel))
        elif nm == "build":
            bar_b = int((b0 - sc["build"]["b0"]) // 4)
            if rel < 0.25:  # 1 音の脈だけ
                s.note("ep", "ep", b0, 1.6, 56, 0.13 + 0.05 * rel * 4, late_ms=2)
                s.note("ep", "ep", b0 + 2, 1.6, 56, 0.10 + 0.05 * rel * 4, late_ms=2)
            elif rel < 0.5:
                play_bass("L", b0, tok, i, 0.46 + 0.8 * (rel - 0.25))
                s.comp([(0, 3.0, 1.0, 2)], b0, ln, ve, 0.2 + 0.2 * (rel - 0.25))
                s.note("ep", "ep", b0 + 2, 1.4, sorted(ve)[0], 0.14, late_ms=2)
            elif rel < 0.75:
                play_bass("XY"[bar_b % 2], b0, tok, i, 0.68 + 0.5 * (rel - 0.5))
                play_pulse("L", b0, tok, 0.52 + 0.8 * (rel - 0.5))
                s.comp(COMP_A["ca"[bar_b % 2]], b0, ln, ve, 0.3 + 0.1 * (rel - 0.5) * 4)
                if bar_b % 2 == 1:
                    s.dots(b0, ve, 0.22 + 0.2 * (rel - 0.5))
            else:
                play_bass("SW"[bar_b % 2], b0, tok, i, 0.82 + 0.5 * (rel - 0.75))
                play_pulse("XW"[bar_b % 2], b0, tok, 0.66 + 0.8 * (rel - 0.75))
                s.comp(COMP_A["dcbc"[bar_b % 4]], b0, ln, ve, 0.38 + 0.1 * (rel - 0.75) * 4)
                s.dots(b0, ve, 0.28 + 0.3 * (rel - 0.75))
            if rel >= 0.5 and bar_b < len(RISE):
                s.pad("strings", b0, b0 + ln, RISE[bar_b], 0.9)
        elif nm == "peak":
            bar_p = int((b0 - sc["peak"]["b0"]) // 4)
            play_bass("WS"[bar_p % 2] if bar_p < sc["peak"]["bars"] - 1 else "X", b0, tok, i, 0.98)
            play_pulse("WX"[bar_p % 2], b0, tok, 0.86)
            s.comp(COMP_A["cd"[bar_p % 2]], b0, ln, ve, 0.5)
            s.dots(b0, ve, 0.36)
            s.pad("strings", b0, b0 + ln, sorted(vp)[-1] + 12, 1.0)
            s.pad("strings", b0, b0 + ln, sorted(vp)[-2] + 12, 0.75)
        elif nm == "end":
            s.note("bass", "bass", b0, ln - 0.3, root, 0.62 - 0.14 * rel, late_ms=10)
            s.comp([(0, ln - 0.2, 1.0, 3)], b0, ln, ve, 0.3 - 0.08 * rel, jit=9)

    # ---- 旋律
    bi = sc["intro"]["b0"]
    ni = sc["intro"]["bars"]
    gl = 0.9
    s.line("ep", "lead", bi + 4 * max(1, ni - 7), MOTIF_A[:4], oct_=-12, g=0.78, glass=gl * 0.7)
    s.line("ep", "lead", bi + 4 * max(1, ni - 4), MOTIF_A[:4], oct_=-12, g=0.86, glass=gl * 0.7)
    for gname, gb in main_groups:
        if gname == "P1":
            s.line("ep", "lead", gb, MOTIF_A, glass=gl)
            s.line("ep", "lead", gb, ANSWER_A, glass=gl)
        if gname == "P1b":
            s.line("ep", "lead", gb + 16, MOTIF_A, g=0.9, glass=gl)
        if gname == "P1c":
            s.line("ep", "lead", gb, MOTIF_A, g=1.05, glass=gl * 1.2)
            s.line("ep", "lead", gb, ANSWER_A, g=1.0, glass=gl * 1.2)
            s.line("ep", "lead", gb + 16, MOTIF_A, g=0.92, glass=gl * 1.2)
    tb = sc["thin"]["b0"]
    if sc["thin"]["bars"] >= 5:
        s.line("ep", "lead2", tb + 4, MOTIF_A[:4], oct_=-12, g=1.0, glass=gl * 0.8)  # 解決の音を抜く
        s.line("ep", "lead2", tb + 20, MOTIF_A[:3], oct_=-12, g=0.7, glass=gl * 0.8)  # もっと短く
    bb = sc["build"]["b0"]
    nb = sc["build"]["bars"]
    if nb >= 8:
        s.line("ep", "lead", bb + 8, MOTIF_A[:2], oct_=-12, g=0.72, glass=gl * 0.8)
        s.line("ep", "lead", bb + nb * 2 - 8, MOTIF_A[:3], oct_=-12, g=0.8, glass=gl * 0.8)
        s.line("ep", "lead", bb + nb * 3 - 8, MOTIF_A[:4], oct_=-12, g=0.9, glass=gl * 0.8)
        s.line("ep", "lead", bb + nb * 4 - 8, MOTIF_A[:4], oct_=-12, g=1.0, glass=gl)
    pb = sc["peak"]["b0"]
    s.line("ep", "lead", pb, MOTIF_A, g=1.28, glass=gl * 1.5)
    s.line("ep", "lead", pb, ANSWER_A, g=1.15, glass=gl * 1.5)
    eb = sc["end"]["b0"]
    if sc["end"]["bars"] >= 3:
        s.line("ep", "lead2", eb + 4, [(0.0, 3.0, 71, 0.36), (3.0, 1.0, 70, 0.3)], glass=gl)  # C♭5 → B♭4
        s.line("ep", "lead2", eb + 8, [(0.0, 3.5, 67, 0.3)], glass=gl)
    # ---- 途絶えても：5 度の 2 音だけ
    gp = sc["gap"]
    s.pad("pad", gp["b0"], gp["b0"] + gp["bars"] * 4 - 1, 65, 0.9)
    s.pad("pad", gp["b0"], gp["b0"] + gp["bars"] * 4 - 1, 58, 0.5)

    # ---- 全体の動き
    a = s.at
    s.auto("pad", [(0, -55), (a("intro", 0.1), -48), (a("intro", 0.4), -38), (a("intro", 1.0), -35), (a("main", 0.45), -35), (a("main", 0.9), -34), (a("thin", 0.1), -34), (a("thin", 0.9), -38), (a("gap", 0.2), -42), (a("gap", 0.8), -50),
                   (a("build", 0.02), -48), (a("build", 0.25), -42), (a("build", 0.5), -37), (a("build", 1.0), -33), (a("peak"), -31), (a("peak", 1.0), -32), (a("end", 0.5), -36), (a("end", 1.0), -60)])
    s.auto("air", [(0, -57), (a("intro", 0.5), -43), (a("main"), -36), (a("thin", 0.2), -40), (a("thin", 0.9), -49), (a("gap"), -67), (a("build", 0.3), -51), (a("build", 1.0), -36), (a("peak"), -31), (a("end", 0.7), -45), (a("end", 1.0), -67)])
    s.auto("padlow", [(0, -60), (a("intro", 0.05), -42), (a("intro", 0.4), -30), (a("intro", 1.0), -20), (a("main"), -18), (a("main", 0.88), -18), (a("main", 1.0), -21), (a("thin"), -25), (a("thin", 0.7), -37), (a("gap"), -70), (a("build", 0.25), -60), (a("build", 0.4), -28), (a("build", 1.0), -19), (a("peak"), -16), (a("end", 0.6), -23), (a("end", 1.0), -60)])
    s.auto("strings", [(0, -30), (a("build", 1.0), -29), (a("peak"), -25), (a("end", 0.3), -42)])
    s.auto("bass", [(0, -20), (a("intro", 0.6), -15), (a("main"), -9.5), (a("main", 0.9), -10.5), (a("main", 1.0), -13), (a("thin"), -18), (a("thin", 0.7), -23), (a("build", 0.25), -16), (a("build", 0.6), -11), (a("build", 1.0), -10), (a("peak"), -7), (a("end", 1.0), -14)])
    s.auto("thump", [(0, -4), (a("build", 1.0), -4), (a("peak"), -2)])
    s.auto("ep", [(0, -16), (a("main"), -16), (a("thin", 1.0), -18), (a("build", 1.0), -16), (a("peak"), -13.5), (a("end", 1.0), -21)])
    s.auto("lead", [(0, -9.5), (a("main"), -9.5), (a("build", 1.0), -9), (a("peak"), -6.5), (a("end", 1.0), -12)])
    s.auto("lead2", [(0, -11), (a("thin"), -11), (a("end"), -11), (a("end", 1.0), -13)])
    s.auto("arp", [(0, -12), (a("build", 1.0), -12), (a("peak"), -9)])
    s.mix = dict(
        bus=dict(
            pad=dict(hall=0.14, plate=0.05, drift=(0.5, 0.31)),
            padlow=dict(hall=0.03, plate=0.03),
            strings=dict(hall=0.26, plate=0.05, drift=(0.5, 0.27)),
            bass=dict(),
            thump=dict(),
            ep=dict(hall=0.16, plate=0.12, drift=(0.45, 0.42)),
            lead=dict(hall=0.24, plate=0.10, delay=0.10, drift=(0.4, 0.47)),
            lead2=dict(hall=0.55, plate=0.12, delay=0.22, drift=(0.4, 0.47)),
            arp=dict(hall=0.30, plate=0.05, delay=0.28),
            air=dict(hall=0.3, plate=0.0),
        ),
        hall=(3.1, 3.4, 2.2, 0.028),
        plate=(1.0, 1.25, 0.85, 0.008),
        delay_beats=0.75,
        delay_fb=0.42,
    )
    return s


# ================================================================ 案 B：ピアノのような音とやわらかな脈（変イ長調）
# 低音が 1 段ずつ下がる和音の上で、旋律は 10 度で一緒に下りる（C B♭ A♭ G ／ F E♭ D♭ C）。右手は 3+3+2 のやわらかな刻み。
TETRA1_B = [(0.0, 3.4, 72, 0.50), (3.5, 4.4, 70, 0.46), (8.0, 3.4, 68, 0.47), (11.5, 3.4, 67, 0.42)]
TETRA2_B = [(15.5, 3.9, 77, 0.50), (19.5, 4.4, 75, 0.46), (24.0, 3.4, 73, 0.47), (27.5, 4.0, 72, 0.44)]
TURN_B = [(2.5, 0.5, 75, 0.30), (3.0, 0.5, 72, 0.27), (6.5, 0.5, 72, 0.30), (7.0, 0.5, 70, 0.27), (10.5, 0.5, 72, 0.30), (11.0, 0.5, 70, 0.27),
          (18.5, 0.5, 80, 0.31), (19.0, 0.5, 79, 0.26), (22.5, 0.5, 77, 0.30), (23.0, 0.5, 75, 0.27), (26.5, 0.5, 75, 0.30), (27.0, 0.5, 73, 0.27)]
MID_B = [(0.0, 3.8, 72, 0.44), (7.5, 0.5, 72, 0.3), (8.0, 3.5, 73, 0.46), (11.5, 4.0, 76, 0.5), (16.0, 7.5, 77, 0.52), (24.0, 3.8, 75, 0.46), (28.0, 3.8, 73, 0.42)]
PIANO_FORMS_B = {
    "p": [(0, 2.0, 1.0, 3), (6, 1.0, 0.74, 2), (12, 1.0, 0.62, 2)],  # 1・2 の裏・4（3+3+2）
    "q": [(0, 2.0, 0.95, 3), (8, 1.6, 0.7, 2)],                      # 1・3
    "r": [(0, 3.5, 0.85, 3)],                                        # 長く
    "s": [(6, 1.0, 0.74, 2), (12, 1.0, 0.62, 2)],                    # 頭は左手に任せる
    "t": [(0, 1.5, 0.9, 2), (10, 1.5, 0.66, 2)],                     # 1・3 の裏
}
BASS_B = {
    "L": [(0, 3.3, 1.0, "r")],
    "X": [(0, 2.4, 1.0, "r")],
    "Y": [(0, 1.6, 1.0, "r"), (3.5, 0.5, 0.5, "a")],
    "W": [(0, 2.4, 1.0, "r"), (3, 0.8, 0.6, "a")],
}
PULSE_B = {
    "o": [(0, 1.0)],
    "q": [(0, 1.0), (2, 0.66)],
    "w": [(0, 1.0), (1, 0.5), (2, 0.72), (3, 0.5)],
}


def plan_b():
    s = Song("B", 902, 112, multiple={"main": 2, "build": 4, "peak": 2}, rit={"peak": (0.35, 0.5), "end": (1.1, 0.25)}, swing=0.5)
    s.scale = {8, 10, 0, 1, 3, 5, 7}
    sc = s.tm.sec
    P1 = "Abmaj9 Eb/G Fm7 Cm7/Eb Dbmaj9 Ab/C Bbm7 Eb13sus"
    P1b = "Abmaj9 Eb/G Cm7 Fm9 Dbmaj9 Ab/C Bbm7 Eb13sus"
    P2 = "Fm9 Dbmaj9 Bbm7 C7 Fm9 Bbm7 Dbmaj9/Eb Eb9"
    TAG = "Dbmaj9 Dbmaj9 Bbm9 Bbm9 Eb13sus Eb13sus"
    s.add_chords(sc["intro"]["b0"], fit_bars("Abmaj9 Abmaj9 Eb/G Fm7 Cm7/Eb Dbmaj9 Ab/C Bbm7 Eb13sus", sc["intro"]["bars"]))
    main_groups = s.fill_groups("main", [("P1", P1), ("P1b", P1b), ("P2", P2), ("P1c", P1), ("TAG", TAG)], tail="Eb13sus", repeat="P1b", drop=("P1b", "P2"))
    s.add_chords(sc["thin"]["b0"], fit_bars("Fm9 Fm9 Dbmaj9 Dbmaj9 Bbm9 Bbm9 Ebsus2 Ebsus2 Ebsus2", sc["thin"]["bars"]))
    s.add_chords(sc["gap"]["b0"], " ".join(["Ebsus2"] * sc["gap"]["bars"]))
    s.add_chords(sc["build"]["b0"], fit_bars("Dbadd9 Dbadd9 Bbm9 Bbm9 Fm9 Fm9 Dbmaj9 Dbmaj9 Ab/C Dbmaj9 Eb6 Fm9 Dbmaj9 Bbm7 Ab/C Eb13sus", sc["build"]["bars"]))
    s.add_chords(sc["peak"]["b0"], fit_bars("Abmaj9 Eb/G Fm7 Eb9sus", sc["peak"]["bars"]))
    s.add_chords(sc["end"]["b0"], fit_bars("Fm9 Dbm6 Abmaj9", sc["end"]["bars"]))
    s.voice_all(pad=(55, 76, 3), ep=(55, 74, 4))
    bright = s.curve([(s.at("intro"), 0.2), (s.at("main"), 0.4), (s.at("main", 0.7), 0.55), (s.at("thin"), 0.4), (s.at("thin", 1.0), 0.15), (s.at("build"), 0.15), (s.at("peak"), 0.8), (s.at("end"), 0.5), (s.at("end", 1.0), 0.2)], lfo=0.08, period=47.0)
    s.pad_cfg["pad"] = dict(timbre="string", att=0.8, rel=1.2, width=1.0, bright=bright)
    s.pad_cfg["padlow"] = dict(timbre="low", att=0.2, rel=0.5, width=0.2, bright=bright)
    s.pad_cfg["strings"] = dict(timbre="string", att=1.0, rel=1.5, width=1.0, bright=bright)
    s.pad_cfg["air"] = dict(timbre="air", att=1.4, rel=1.8, width=1.0)
    rng = s.rng
    RISE = [63, 63, 65, 65, 65, 67, 67, 68, 68, 68, 70, 72, 72, 73, 75, 77]

    def lh(tok):
        pc = parse_chord(tok)[2]
        return 40 + ((pc - 40) % 12)  # E2〜D♯3

    for i, (b0, ln, tok, vp, ve) in enumerate(s.voiced):
        nm = s.sec_of(b0)
        rel = s.rel(b0)
        L = lh(tok)
        if nm != "gap":
            for m in vp:
                s.pad("pad", b0, b0 + ln, m, 1.0)
            s.pad("padlow", b0, b0 + ln - 0.5, s.low_line(tok), 1.0)
            s.pad("air", b0, b0 + ln, sorted(vp)[-1] + 12, 1.0)
        if nm == "intro":
            bar_i = int((b0 - sc["intro"]["b0"]) // 4)
            s.note("piano", "pianolow", b0, ln - 0.2, L, 0.20 + 0.25 * rel, late_ms=6, jit_ms=6)
            if rel >= 0.45:
                s.note("bass", "bass", b0, ln - 1.0, s.root_midi(tok), 0.34 + 0.34 * rel, late_ms=8)
            if rel >= 0.78:
                s.comp(PIANO_FORMS_B["p"], b0, ln, ve, 0.17 + 0.25 * (rel - 0.78) * 4.5, inst="piano", bus="piano", pedal=True)
            elif rel >= 0.33:
                s.comp([(8, 2.0, 0.8, 2)], b0, ln, ve, 0.16, inst="piano", bus="piano", pedal=True)
            if rel >= 0.78:
                s.thump(b0, 0.26 + 0.25 * (rel - 0.78) * 4.5, thump_freq(tok))
        elif nm == "main":
            gname, gb = s.group_of(main_groups, b0)
            bar_i = int((b0 - gb) // 4)
            v0 = {"P1": 0.78, "P1b": 0.8, "P2": 0.74, "P1c": 0.86, "TAG": 0.62}[gname] * rng.uniform(0.97, 1.03)
            s.bass(BASS_B, {"P1": "XYXW", "P1b": "XYXW", "P2": "L", "P1c": "XWXW", "TAG": "L"}[gname][bar_i % (4 if gname not in ("P2", "TAG") else 1)], b0, tok, i, v0)
            # 脈：頭を中心に
            pform = {"P1": "qqqq", "P1b": "qwqw", "P2": "oqoq", "P1c": "wwww", "TAG": "oooo"}[gname][bar_i % 4]
            vm = {"P1": 0.6, "P1b": 0.64, "P2": 0.5, "P1c": 0.68, "TAG": 0.45 - 0.05 * bar_i}[gname]
            s.pulse(PULSE_B, pform, b0, tok, vm)
            # 左手：根音と 5 度
            vL = {"P1": 0.34, "P1b": 0.36, "P2": 0.30, "P1c": 0.40, "TAG": 0.26}[gname]
            s.note("piano", "pianolow", b0, ln - 0.1, L, vL * rng.uniform(0.92, 1.08), late_ms=4, jit_ms=4)
            if gname != "TAG" and bar_i % 2 == 1:
                s.note("piano", "pianolow", s.step(b0, 6), 2.0, L + 7, vL * 0.62 * rng.uniform(0.9, 1.1), late_ms=4, jit_ms=4)
            # 右手
            forms = {"P1": "pqpt", "P1b": "ptpq", "P2": "rrtr", "P1c": "psps", "TAG": "rr"}[gname]
            base = {"P1": 0.30, "P1b": 0.32, "P2": 0.26, "P1c": 0.36, "TAG": 0.22}[gname]
            s.comp(PIANO_FORMS_B[forms[bar_i % len(forms)]], b0, ln, ve, base, inst="piano", bus="piano", pedal=True, jit=4)
            if gname == "P1c" and bar_i % 2 == 0:
                s.pad("strings", b0, b0 + ln * 2, sorted(vp)[-1] + 12, 0.8)
        elif nm == "thin":
            if rel < 0.7:
                s.note("piano", "pianolow", b0, ln - 0.1, L, 0.28 * (1 - 0.6 * rel), late_ms=4, jit_ms=5)
                s.note("bass", "bass", b0, ln - 1.0, s.root_midi(tok), 0.56 * (1 - 0.6 * rel), late_ms=8)
            if rel < 0.2:
                s.thump(b0, 0.2 - rel * 0.5, thump_freq(tok))
            if rel < 0.55:
                s.comp([(8, 2.5, 0.9, 2)], b0, ln, ve, 0.2 * (1 - 0.5 * rel), inst="piano", bus="piano", pedal=True, jit=8)
        elif nm == "build":
            bar_b = int((b0 - sc["build"]["b0"]) // 4)
            # 1 つの音（E♭4）が続く。だんだん強く、細かく
            eb = 63
            if rel < 0.5:
                for q in range(4):
                    s.note("piano", "piano", b0 + q, 0.95, eb, (0.10 + 0.24 * rel) * (1.0 if q % 2 == 0 else 0.8) * rng.uniform(0.94, 1.06), late_ms=3, jit_ms=3)
            else:
                for q in range(8):
                    s.note("piano", "piano", b0 + q / 2, 0.48, eb, (0.16 + 0.26 * (rel - 0.5)) * (1.0 if q % 2 == 0 else 0.72) * rng.uniform(0.94, 1.06), late_ms=3, jit_ms=3)
            if rel >= 0.25:
                s.note("piano", "pianolow", b0, ln - 0.1, L, 0.2 + 0.3 * rel, late_ms=4, jit_ms=4)
                s.bass(BASS_B, "L" if rel < 0.5 else ("X" if rel < 0.75 else "W"), b0, tok, i, 0.42 + 0.46 * rel)
            if rel >= 0.5:
                s.pulse(PULSE_B, "q" if rel < 0.75 else "w", b0, tok, 0.42 + 0.34 * rel)
                s.comp(PIANO_FORMS_B["q" if rel < 0.75 else "p"], b0, ln, ve, 0.2 + 0.2 * rel, inst="piano", bus="piano", pedal=True, jit=4)
            if rel >= 0.45 and bar_b < len(RISE):
                s.pad("strings", b0, b0 + ln, RISE[bar_b], 0.9)
        elif nm == "peak":
            bar_p = int((b0 - sc["peak"]["b0"]) // 4)
            s.bass(BASS_B, "W" if bar_p < sc["peak"]["bars"] - 1 else "L", b0, tok, i, 0.96)
            s.pulse(PULSE_B, "w", b0, tok, 0.74)
            s.note("piano", "pianolow", b0, ln - 0.1, L, 0.56, late_ms=3)
            s.note("piano", "pianolow", b0, ln - 0.1, L + 12, 0.42, late_ms=3)
            s.comp(PIANO_FORMS_B["p"], b0, ln, ve, 0.44, inst="piano", bus="piano", pedal=True, jit=4)
            s.pad("strings", b0, b0 + ln, sorted(vp)[-1] + 12, 1.0)
            s.pad("strings", b0, b0 + ln, sorted(vp)[-2] + 12, 0.7)
        elif nm == "end":
            s.note("bass", "bass", b0, ln - 0.4, s.root_midi(tok), 0.56 - 0.12 * rel, late_ms=10)
            s.note("piano", "pianolow", b0, ln - 0.1, L, 0.3 - 0.1 * rel, late_ms=6, jit_ms=8)
            s.comp([(0, ln - 0.2, 1.0, 3)], b0, ln, ve, 0.24 - 0.06 * rel, inst="piano", bus="piano", pedal=True, jit=10)

    # ---- 旋律
    ib = sc["intro"]["b0"]
    ni = sc["intro"]["bars"]
    s.line("piano", "lead", ib + 4 * max(0, ni - 8), TETRA1_B[:3], g=0.62)
    for gname, gb in main_groups:
        if gname == "P1":
            s.line("piano", "lead", gb, TETRA1_B, g=1.0)
        if gname == "P1b":
            s.line("piano", "lead", gb, TETRA2_B, g=0.96)
        if gname == "P2":
            s.line("piano", "lead", gb, MID_B, g=0.92)
        if gname == "P1c":
            s.line("piano", "lead", gb, TETRA1_B, g=1.08)
            s.line("piano", "lead", gb, TETRA2_B, g=1.05)
            s.line("piano", "lead", gb, TURN_B, g=1.0)
    tb = sc["thin"]["b0"]
    if sc["thin"]["bars"] >= 6:
        s.line("piano", "lead2", tb + 4, [(0.0, 3.9, 72, 0.36), (4.0, 3.9, 70, 0.32), (8.0, 4.0, 68, 0.28)], g=1.0)  # 最後の音まで行かない
    bb = sc["build"]["b0"]
    nb = sc["build"]["bars"]
    if nb >= 12:
        s.line("piano", "lead", bb + nb * 2, [(0.0, 3.8, 72, 0.34), (4.0, 3.8, 72, 0.34), (8.0, 3.8, 75, 0.38), (12.0, 3.8, 77, 0.42)], g=1.0)
    if nb >= 16:
        s.line("piano", "lead", bb + nb * 3, [(0.0, 7.8, 77, 0.46), (8.0, 3.8, 75, 0.46), (12.0, 1.4, 77, 0.46), (13.5, 1.0, 79, 0.48), (14.5, 1.0, 80, 0.5), (15.5, 0.5, 82, 0.52)], g=1.0)
    pb = sc["peak"]["b0"]
    for g_, oc in ((1.15, 12), (0.9, 0)):
        s.line("piano", "lead", pb, TETRA1_B, oct_=oc, g=g_)
    eb = sc["end"]["b0"]
    if sc["end"]["bars"] >= 3:
        s.line("piano", "lead2", eb, [(0.0, 3.5, 72, 0.34)], g=1.0)
        s.line("piano", "lead2", eb + 4, [(0.0, 2.6, 76, 0.32), (3.0, 1.0, 75, 0.3)], g=1.0)  # F♭5 → E♭5
        s.line("piano", "lead2", eb + 8, [(0.0, 3.5, 72, 0.28)], g=1.0)
    # ---- 途絶えても：1 音だけ
    gp = sc["gap"]
    s.note("piano", "piano", gp["b0"], 3.0, 63, 0.09, late_ms=0)
    s.pad("pad", gp["b0"], gp["b0"] + gp["bars"] * 4 - 1, 63, 0.7)

    a = s.at
    s.auto("pad", [(0, -60), (a("intro", 0.1), -50), (a("intro", 0.5), -41), (a("intro", 1.0), -38), (a("main", 0.2), -38), (a("main", 0.4), -35), (a("main", 0.9), -34), (a("thin", 0.1), -35), (a("thin", 0.9), -40), (a("gap", 0.2), -44), (a("gap", 0.8), -50),
                   (a("build", 0.02), -48), (a("build", 0.25), -44), (a("build", 0.5), -38), (a("build", 1.0), -33), (a("peak"), -31), (a("peak", 1.0), -32), (a("end", 0.5), -36), (a("end", 1.0), -60)])
    s.auto("air", [(0, -57), (a("intro", 0.5), -47), (a("main"), -38), (a("thin", 0.2), -43), (a("thin", 0.9), -53), (a("gap"), -67), (a("build", 0.3), -55), (a("build", 1.0), -38), (a("peak"), -35), (a("end", 0.7), -47), (a("end", 1.0), -67)])
    s.auto("padlow", [(0, -60), (a("intro", 0.3), -40), (a("intro", 1.0), -24), (a("main"), -22), (a("thin", 0.1), -24), (a("thin", 0.8), -36), (a("gap"), -70), (a("build", 0.3), -60), (a("build", 0.5), -30), (a("build", 1.0), -22), (a("peak"), -20), (a("end", 0.6), -26), (a("end", 1.0), -60)])
    s.auto("strings", [(0, -29), (a("build", 1.0), -29), (a("peak"), -25), (a("end", 0.3), -42)])
    s.auto("bass", [(0, -20), (a("intro", 0.6), -15), (a("main"), -9.5), (a("main", 0.9), -10.5), (a("main", 1.0), -13), (a("thin"), -18), (a("thin", 0.7), -23), (a("build", 0.25), -16), (a("build", 0.6), -11), (a("build", 1.0), -10), (a("peak"), -7), (a("end", 1.0), -14)])
    s.auto("thump", [(0, -5.5), (a("build", 1.0), -5.5), (a("peak"), -3.5)])
    s.auto("piano", [(0, -24), (a("intro", 0.6), -19), (a("main"), -15.5), (a("main", 1.0), -16.5), (a("thin"), -18), (a("build"), -18), (a("build", 1.0), -15.5), (a("peak"), -13), (a("end", 1.0), -19)])
    s.auto("pianolow", [(0, -24), (a("intro", 0.6), -18), (a("main"), -14.5), (a("main", 1.0), -16), (a("thin"), -18), (a("build"), -18), (a("build", 1.0), -14.5), (a("peak"), -12), (a("end", 1.0), -18)])
    s.auto("lead", [(0, -16), (a("intro", 0.5), -13), (a("main"), -10.5), (a("build", 1.0), -10), (a("peak"), -7.5), (a("end", 1.0), -13)])
    s.auto("lead2", [(0, -12), (a("thin"), -12), (a("end"), -12), (a("end", 1.0), -14)])
    s.mix = dict(
        bus=dict(
            pad=dict(hall=0.20, plate=0.04, drift=(0.5, 0.29)),
            padlow=dict(hall=0.03, plate=0.03),
            strings=dict(hall=0.28, plate=0.05, drift=(0.5, 0.27)),
            bass=dict(),
            thump=dict(),
            piano=dict(hall=0.20, plate=0.14, body=0.35),
            pianolow=dict(hall=0.08, plate=0.08, body=0.35),
            lead=dict(hall=0.26, plate=0.12, body=0.3),
            lead2=dict(hall=0.55, plate=0.14, body=0.3),
            air=dict(hall=0.3),
        ),
        tap=1.8,
        hall=(2.6, 3.0, 1.9, 0.024),
        plate=(0.9, 1.1, 0.8, 0.007),
    )
    return s


# ================================================================ 案 C：広がる音の層とゆっくりした脈（ヘ長調）
# 音の層が 2 拍ごとに息をする。木の鍵盤の小さな粒が 3+3+2 で流れ、低音はゆっくり。
LINE_C = [69, 72, 74, 72, 74, 74, 77, 74]  # 上の線（2 小節に 1 音）：A C D C D D F D
# 主題：和音ごとに「5 度・根音・7 度」。和音が 3 度ずつ下がるのに合わせて、同じ形が下りていく
THEME_C = [(72, 77, 76), (69, 74, 72), (65, 70, 69), (64, 69, 67), (62, 67, 65), (65, 70, 69), (69, 74, 72), (67, 72, 70)]
RIPPLE_C = [(0, 2, 0.9), (3, 0, 0.55), (6, 1, 0.74), (8, 2, 0.66), (11, 0, 0.5), (14, 1, 0.6)]  # 8 分の 3+3+2（16 分の位置, 声, 強さ）


def plan_c():
    s = Song("C", 903, 96, multiple={"main": 4, "build": 2}, rit={"peak": (0.30, 0.5), "end": (0.9, 0.25)}, swing=0.5)
    s.scale = {5, 7, 9, 10, 0, 2, 4}
    sc = s.tm.sec
    # 2 小節に 1 つの和音（ゆっくり）
    two = lambda toks: " ".join(f"{t}:8" for t in toks.split())  # noqa: E731
    P1 = two("Fadd9 Dm9 Bbadd9 Am7 Gm11 Bbadd9 Dm7 C9sus")
    P2 = two("Bbmaj9 Am7 Gm9 C13sus Dm7 Am7 Bbadd9 C9")
    s.add_chords(sc["intro"]["b0"], fit_bars("Fmaj9 Fmaj9 Dm9 Dm9 Bbmaj9 Bbmaj9 Gm11 C9sus", sc["intro"]["bars"]))
    main_groups = s.fill_groups("main", [("P1", P1), ("P2", P2)], tail="C13sus", repeat="P1", drop=("P2",))
    s.add_chords(sc["thin"]["b0"], fit_bars("Dm9 Dm9 Bbadd9 Bbadd9 Gm11 Gm11 Csus2 Csus2", sc["thin"]["bars"]))
    s.add_chords(sc["gap"]["b0"], " ".join(["Csus2"] * sc["gap"]["bars"]))
    s.add_chords(sc["build"]["b0"], fit_bars("Bbadd9 Bbadd9 Gm9 Gm9 Dm7 Dm7 Bbadd9 Bbadd9 Fadd9/A Fadd9/A C9 C9 Bbadd9 C9sus", sc["build"]["bars"]))
    s.add_chords(sc["peak"]["b0"], fit_bars("Fadd9 Fadd9/A Bbadd9 C9sus", sc["peak"]["bars"]))
    s.add_chords(sc["end"]["b0"], fit_bars("Dm9 Bbm6 Fmaj9", sc["end"]["bars"]))
    s.voice_all(pad=(53, 76, 4), ep=(58, 79, 3))
    tm = s.tm
    beat_of = lambda t: np.interp(t, tm.T, tm.B)  # noqa: E731

    def breathe(depth, offset=0.0):
        """2 拍ごとに息をする（なめらかな形。ポンプのように切らない）"""
        return lambda t: 1 - depth * 0.5 * (1 + np.cos(TWO_PI * (beat_of(t) + offset) / 2 + math.pi))

    bright = s.curve([(s.at("intro"), 0.15), (s.at("main"), 0.4), (s.at("main", 0.7), 0.6), (s.at("thin"), 0.4), (s.at("thin", 1.0), 0.1), (s.at("build"), 0.1), (s.at("peak"), 0.85), (s.at("end"), 0.5), (s.at("end", 1.0), 0.15)], lfo=0.1, period=37.0)
    s.pad_cfg["pad"] = dict(timbre="warm", att=0.9, rel=1.4, width=1.0, pulse=breathe(0.22), bright=bright)
    s.pad_cfg["padlow"] = dict(timbre="low", att=0.3, rel=0.8, width=0.2)
    s.pad_cfg["choir"] = dict(timbre="choir", att=1.4, rel=2.0, width=1.0, pulse=breathe(0.14, 0.5), bright=s.curve([(s.at("intro"), 0.2), (s.at("main"), 0.35), (s.at("peak"), 0.8), (s.at("end", 1.0), 0.2)], lfo=0.12, period=53.0, phase=1.0))
    s.pad_cfg["strings"] = dict(timbre="string", att=1.3, rel=1.8, width=1.0, bright=bright)
    s.pad_cfg["air"] = dict(timbre="air", att=2.0, rel=2.4, width=1.0, pulse=breathe(0.2, 1.0))
    rng = s.rng

    def ripple(b0, ln, ve, v, pat=RIPPLE_C, up=0):
        for st, idx, vm in pat:
            if st / 4 >= ln:
                continue
            m = sorted(ve)[idx % len(ve)] + up
            s.note("mallet", "mallet", s.step(b0, st), 1.4, m, v * vm * rng.uniform(0.85, 1.12), late_ms=2, jit_ms=4, pan=(-0.5 + 0.5 * (idx % 3)) * rng.uniform(0.6, 1.0))

    for i, (b0, ln, tok, vp, ve) in enumerate(s.voiced):
        nm = s.sec_of(b0)
        rel = s.rel(b0)
        ff = thump_freq(tok)
        root = s.root_midi(tok)
        if nm != "gap":
            for m in vp:
                s.pad("pad", b0, b0 + ln, m, 1.0)
            s.pad("padlow", b0, b0 + ln - 0.5, s.low_line(tok), 1.0)
            s.pad("air", b0, b0 + ln, sorted(vp)[-1] + 12, 1.0)
            s.pad("air", b0, b0 + ln, sorted(vp)[0] + 24, 0.8)
        nbars = int(ln // 4)
        for k in range(nbars):
            bb = b0 + k * 4
            if nm == "intro":
                if rel >= 0.5:
                    s.note("bass", "bass", bb, 3.4, root, 0.34 + 0.4 * rel, late_ms=10)
                if rel >= 0.75:
                    ripple(bb, 4, ve, 0.13)
            elif nm == "main":
                gname, gb = s.group_of(main_groups, b0)
                gi = int((bb - gb) // 4)
                v0 = (0.74 + 0.1 * rel) * rng.uniform(0.97, 1.03)
                s.note("bass", "bass", bb, 3.3 if gi % 2 == 0 else 2.6, root, v0, late_ms=10)
                if gi % 2 == 1:
                    s.note("bass", "bass", s.step(bb + 3, 0), 0.8, bass_midi(s.approach(parse_chord(tok)[2], s.next_root(i))) if k == nbars - 1 else root, v0 * 0.55, late_ms=9)
                for q, pv in enumerate((1.0, 0.5, 0.8, 0.5) if gi % 4 != 3 else (1.0, 0.5, 0.8)):
                    s.thump(bb + q, (0.60 + 0.2 * rel) * pv * rng.uniform(0.95, 1.05), ff)
                ripple(bb, 4, ve, 0.20 + 0.2 * rel)
                if gname == "P2" or gi >= 8:
                    ripple(bb, 4, ve, 0.10 + 0.1 * rel, pat=[(2, 1, 0.8), (10, 2, 0.7)], up=12)
            elif nm == "thin":
                if rel < 0.6:
                    s.note("bass", "bass", bb, 3.4, root, 0.56 * (1 - 0.6 * rel), late_ms=10)
                if rel < 0.25:
                    s.thump(bb, 0.2 - rel * 0.4, ff)
                if rel < 0.5:
                    ripple(bb, 4, ve, 0.16 * (1 - rel), pat=RIPPLE_C[:3])
            elif nm == "build":
                if rel >= 0.28:
                    s.note("bass", "bass", bb, 3.3, root, 0.42 + 0.5 * rel, late_ms=10)
                ripple(bb, 4, ve, 0.10 + 0.24 * rel, pat=RIPPLE_C if rel >= 0.4 else (RIPPLE_C[:3] if rel >= 0.15 else [(0, 2, 0.9), (8, 2, 0.7)]))
                if rel >= 0.5:
                    for q, pv in enumerate((1.0, 0.5, 0.8, 0.5) if rel >= 0.72 else (1.0, 0.0, 0.76, 0.0)):
                        if pv:
                            s.thump(bb + q, (0.42 + 0.46 * rel) * pv, ff)
                if rel >= 0.72:
                    ripple(bb, 4, ve, 0.2, pat=[(2, 1, 0.8), (10, 2, 0.7)], up=12)
            elif nm == "peak":
                s.note("bass", "bass", bb, 3.4, root, 0.96, late_ms=8)
                for q, pv in enumerate((1.0, 0.55, 0.82, 0.55)):
                    s.thump(bb + q, 0.86 * pv, ff)
                ripple(bb, 4, ve, 0.46)
                ripple(bb, 4, ve, 0.26, pat=[(2, 1, 0.8), (10, 2, 0.7)], up=12)
            elif nm == "end":
                s.note("bass", "bass", bb, 3.4, root, 0.56 - 0.1 * rel, late_ms=10)
        # 声の層（合唱のような）
        if nm == "main":
            gname, gb = s.group_of(main_groups, b0)
            for m in sorted(vp)[-3:]:
                s.pad("choir", b0, b0 + ln, m, 1.0)
        elif nm in ("thin", "peak", "end") or (nm == "intro" and rel >= 0.5) or (nm == "build" and rel >= 0.2):
            for m in sorted(vp)[-3:]:
                s.pad("choir", b0, b0 + ln, m, 1.0)
    # ---- 主題（ベルのような音）。伝統の所では最後の音が抜ける。山で 1 オクターブ上へ
    def theme(beat0, j, g=1.0, oct_=0, cut=3):
        a_, b_, c_ = THEME_C[j % len(THEME_C)]
        notes = [(0.0, 1.4, a_, 0.34), (1.5, 1.4, b_, 0.42), (3.0, 4.6, c_, 0.38)][:cut]
        s.line("ep", "lead", beat0, notes, oct_=oct_, g=g, glass=1.2, bright=0.9)

    for gname, gb in main_groups:
        if gname == "P1":
            for j in range(8):
                theme(gb + j * 8, j, g=0.92 + 0.02 * j)
        if gname == "P2":
            for j, jj in ((4, 1), (5, 3), (6, 2), (7, 7)):  # 後半：同じ形を 1 オクターブ上で、弱く
                theme(gb + j * 8, jj, g=0.78, oct_=12)
    tb = sc["thin"]["b0"]
    if sc["thin"]["bars"] >= 6:
        theme(tb, 1, g=0.8, cut=2)
        theme(tb + 8, 2, g=0.7, cut=2)
        theme(tb + 16, 4, g=0.6, cut=1)
    bb0 = sc["build"]["b0"]
    nb0 = sc["build"]["bars"]
    for j, (bar, jj) in enumerate(((4, 1), (6, 2), (8, 0), (10, 7), (12, 2))):
        if bar + 2 <= nb0:
            theme(bb0 + bar * 4, jj, g=0.72 + 0.07 * j, cut=min(3, 1 + j))
    pb0 = sc["peak"]["b0"]
    for j, jj in enumerate((0, 0, 2, 7)):
        if j < sc["peak"]["bars"]:
            theme(pb0 + j * 4, jj, g=1.15, oct_=12 if j < 3 else 12)
    # ---- 上の線（弦）
    for gname, gb in main_groups:
        line = LINE_C
        if gname == "P2":
            line = [74, 72, 74, 77, 77, 76, 74, 72]  # 2 回目は少し上で
        for j, m in enumerate(line):
            s.pad("strings", gb + j * 8, gb + (j + 1) * 8, m, 1.0)
            s.melody.append((gb + j * 8, 8, m))
    bb = sc["build"]["b0"]
    nb = sc["build"]["bars"]
    for j, m in enumerate([65, 65, 67, 67, 69, 69, 70, 72, 72, 74, 74, 76, 77, 79]):
        if j >= nb:
            break
        if j >= 4:
            s.pad("strings", bb + j * 4, bb + (j + 1) * 4, m, 1.0)
    pb = sc["peak"]["b0"]
    for j, m in enumerate([81, 79, 77, 76]):
        if j < sc["peak"]["bars"]:
            s.pad("strings", pb + j * 4, pb + (j + 1) * 4, m, 1.0)
            s.pad("strings", pb + j * 4, pb + (j + 1) * 4, m - 12, 0.8)
    eb = sc["end"]["b0"]
    for j, m in enumerate([74, 73, 72]):
        if j < sc["end"]["bars"]:
            s.pad("strings", eb + j * 4, eb + (j + 1) * 4, m, 1.0)
    # ---- 途絶えても：高い 1 音だけ
    gp = sc["gap"]
    s.pad("strings", gp["b0"], gp["b0"] + gp["bars"] * 4 - 0.5, 72, 0.9)

    a = s.at
    s.auto("pad", [(0, -60), (a("intro", 0.12), -46), (a("intro", 0.6), -35), (a("intro", 1.0), -31), (a("main", 0.5), -30.5), (a("main", 0.95), -30), (a("thin"), -32), (a("thin", 0.9), -40), (a("gap", 0.3), -60),
                   (a("build"), -52), (a("build", 0.05), -43), (a("build", 0.25), -38), (a("build", 0.5), -34), (a("build", 1.0), -29), (a("peak"), -25), (a("peak", 1.0), -26), (a("end", 0.5), -32), (a("end", 1.0), -60)])
    s.auto("choir", [(0, -60), (a("intro", 0.6), -40), (a("intro", 1.0), -33), (a("main", 0.5), -31.5), (a("main", 0.95), -30), (a("thin"), -31), (a("thin", 0.9), -40), (a("gap"), -60), (a("build", 0.1), -54), (a("build", 0.4), -39), (a("build", 0.7), -34), (a("build", 1.0), -30), (a("peak"), -25), (a("peak", 1.0), -27), (a("end", 0.6), -36), (a("end", 1.0), -60)])
    s.auto("air", [(0, -57), (a("intro", 0.5), -43), (a("main"), -35), (a("thin", 0.2), -38), (a("thin", 0.9), -49), (a("gap"), -67), (a("build", 0.3), -51), (a("build", 1.0), -35), (a("peak"), -32), (a("end", 0.7), -45), (a("end", 1.0), -67)])
    s.auto("padlow", [(0, -60), (a("intro", 0.1), -38), (a("intro", 0.5), -26), (a("intro", 1.0), -20), (a("main"), -18.5), (a("thin", 0.1), -20), (a("thin", 0.8), -32), (a("gap"), -70), (a("build", 0.15), -60), (a("build", 0.35), -28), (a("build", 1.0), -19), (a("peak"), -17), (a("end", 0.6), -23), (a("end", 1.0), -60)])
    s.auto("strings", [(0, -60), (a("main"), -60), (a("main", 0.03), -29), (a("main", 1.0), -27), (a("thin", 0.05), -46), (a("gap"), -36), (a("gap", 1.0), -44), (a("build", 0.3), -46), (a("build", 1.0), -28), (a("peak"), -25), (a("peak", 1.0), -27), (a("end", 0.5), -32), (a("end", 1.0), -60)])
    s.auto("bass", [(0, -20), (a("intro", 0.7), -15), (a("main"), -9.5), (a("main", 0.9), -10.5), (a("main", 1.0), -12), (a("thin"), -18), (a("thin", 0.7), -23), (a("build", 0.25), -16), (a("build", 0.6), -11), (a("build", 1.0), -10), (a("peak"), -7), (a("end", 1.0), -14)])
    s.auto("thump", [(0, -5.5), (a("build", 1.0), -5.5), (a("peak"), -3)])
    s.auto("mallet", [(0, -12.5), (a("main"), -12.5), (a("build", 1.0), -12.5), (a("peak"), -10)])
    s.auto("lead", [(0, -11.5), (a("main"), -11.5), (a("build", 1.0), -10.5), (a("peak"), -7.5), (a("end", 1.0), -13)])
    s.mix = dict(
        bus=dict(
            pad=dict(hall=0.22, plate=0.04, drift=(0.5, 0.23)),
            padlow=dict(hall=0.04, plate=0.03),
            choir=dict(hall=0.34, plate=0.03, drift=(0.6, 0.19)),
            strings=dict(hall=0.34, plate=0.04, drift=(0.5, 0.27)),
            bass=dict(),
            thump=dict(),
            lead=dict(hall=0.42, plate=0.08, delay=0.16, drift=(0.4, 0.47)),
            mallet=dict(hall=0.34, plate=0.10, delay=0.22),
            air=dict(hall=0.3),
        ),
        hall=(3.6, 4.2, 2.6, 0.034),
        plate=(1.1, 1.4, 0.9, 0.01),
        delay_beats=1.5,
        delay_fb=0.38,
    )
    return s


# ================================================================ 案 D・案 E（作者の声：A〜C はフリー BGM のよう。安っぽい。プロっぽくない）
# 作りを変える：和音の上に旋律を乗せない。1 つの短い音型が主役で、下で深い低音だけが動く（同じ音型の意味が、低音で変わる）。
# 音は 4 種類まで：音型・低音・小さな刻み・空気。ふだんは乾いて近く、区切りの音だけ遠くへ響かせる。8 小節ごとに、足す・抜く・一瞬止まる。
def dry_wood(m, v, dur_s, rng, pan=0.0):
    """近くで鳴る、短く乾いた木のはじき音。高い倍音ほど早く消える。はじいた瞬間に音が少し高い。爪があたる音と、胴の小さな音"""
    f0 = hz(m) * cents(rng.normal(0, 0.4))
    v = float(np.clip(v, 0.03, 1.0))
    t, n = note_time(dur_s, 0.45)
    T = 0.46 * 2 ** (-(m - 69) / 20) * (0.85 + 0.3 * v)
    p = 0.18 * rng.uniform(0.96, 1.04)
    tilt = 0.72 + 0.5 * (1 - v)
    td = 0.016
    tw = t + (cents(rng.uniform(7, 11)) - 1) * td * (1 - np.exp(-t / td))
    L, Rr = np.zeros(n, F32), np.zeros(n, F32)
    gl, gr = math.cos((pan + 1) * math.pi / 4) * 1.4142, math.sin((pan + 1) * math.pi / 4) * 1.4142
    for k in range(1, 48):
        fk = k * f0 * math.sqrt(1 + 3.0e-4 * k * k)
        if fk > 15000 or fk > 0.45 * R:
            break
        a = (abs(math.sin(math.pi * k * p)) ** 0.6 + 0.05) / k ** tilt / (1 + (fk / 6500) ** 2)
        a *= float(bell(np.array([fk]), 260, 3.0, 0.9)[0] * bell(np.array([fk]), 760, 2.0, 0.8)[0]) * rng.uniform(0.94, 1.06)
        tau = T / (1 + 0.6 * (k - 1) ** 0.9)
        x1 = osc(fk, tw, rng.uniform(0, 0.02)) * np.exp(-t / tau).astype(F32)
        x2 = osc(fk * cents(rng.uniform(0.3, 0.9)), tw, rng.uniform(0, 0.02)) * np.exp(-t / (tau * 1.7)).astype(F32)
        L += a * (0.82 * x1 + 0.34 * x2)
        Rr += a * (0.82 * x1 - 0.10 * x2)
    out = np.stack([L * gl, Rr * gr], 1).astype(np.float64)
    nt = min(n, int(0.02 * R))
    nail = filt(rng.standard_normal(nt), lambda f: hp(f, 1300, 2) * lp(f, 11000, 1))
    nail = nail / (np.abs(nail).max() + 1e-9) * np.exp(-t[:nt] / 0.0028) * (0.02 + 0.055 * v)
    thup = filt(rng.standard_normal(nt), lambda f: bell(f, 240, 8, 0.8) * lp(f, 700, 2) * hp(f, 90, 2))
    thup = thup / (np.abs(thup).max() + 1e-9) * np.exp(-t[:nt] / 0.006) * (0.03 + 0.07 * v)
    out[:nt] += (nail + thup)[:, None]
    env = raised(t, 0.0009 + 0.0009 * (1 - v))
    i_rel = int(dur_s * R)
    if i_rel < n:
        env[i_rel:] *= np.exp(-(t[i_rel:] - dur_s) / 0.07)
    env[-int(0.02 * R):] *= np.linspace(1, 0, int(0.02 * R))
    out *= env[:, None]
    return out / (np.abs(out).max() + 1e-9) * (0.2 + 0.8 * v)


def clean_pluck(m, v, dur_s, rng, pan=0.0):
    """澄んだはじき音。はじめは倍音が高くまであり、高い倍音から順に、すぐ閉じていく。左右で少しずらす"""
    f0 = hz(m) * cents(rng.normal(0, 0.3))
    v = float(np.clip(v, 0.03, 1.0))
    t, n = note_time(dur_s, 0.5)
    T = 0.62 * 2 ** (-(m - 72) / 22) * (0.85 + 0.3 * v)
    close = 0.85 + 0.7 * (1 - v)  # 弱いほど早く閉じる
    out = np.zeros((n, 2))
    gl, gr = math.cos((pan + 1) * math.pi / 4) * 1.4142, math.sin((pan + 1) * math.pi / 4) * 1.4142
    for c, det in enumerate((-2.2, 2.2)):
        x = np.zeros(n, F32)
        for k in range(1, 40):
            fk = k * f0 * cents(det)
            if fk > 15000 or fk > 0.45 * R:
                break
            a = rng.uniform(0.95, 1.05) / k ** 1.0 / (1 + (fk / 9000) ** 2)
            x += a * osc(fk, t, rng.uniform(0, 0.03)) * np.exp(-t / (T / (1 + close * (k - 1)))).astype(F32)
        out[:, c] = x
    env = raised(t, 0.0012 + 0.001 * (1 - v))
    i_rel = int(dur_s * R)
    if i_rel < n:
        env[i_rel:] *= np.exp(-(t[i_rel:] - dur_s) / 0.08)
    env[-int(0.02 * R):] *= np.linspace(1, 0, int(0.02 * R))
    out *= env[:, None]
    out[:, 0] *= gl
    out[:, 1] *= gr
    return out / (np.abs(out).max() + 1e-9) * (0.2 + 0.8 * v)


def deep_bass(m, v, dur_s, rng, **_):
    """深く、線のきれいな低音。頭だけ倍音が咲いて消える。スマホでも分かるよう、上の倍音を少しだけ残す"""
    f = hz(m) * cents(rng.normal(0, 0.8))
    v = float(np.clip(v, 0.03, 1.0))
    t, n = note_time(dur_s, 0.2)
    fm = 1 + (cents(rng.uniform(14, 22)) - 1) * np.exp(-t / 0.028)
    ph = np.cumsum(f * fm) / R
    x = np.sin(TWO_PI * (ph - np.floor(ph)))
    for k, a, tau, keep in ((2, 0.32, 0.30, 0.15), (3, 0.20, 0.20, 0.09), (4, 0.14, 0.14, 0.06), (5, 0.11, 0.10, 0.04), (6, 0.09, 0.08, 0.03), (8, 0.08, 0.07, 0.02), (10, 0.06, 0.05, 0.012), (12, 0.05, 0.04, 0.008)):
        if f * k < 1400:
            x = x + ((a - keep) * np.exp(-t / tau) + keep) * np.sin(TWO_PI * ((ph * k) % 1.0) + 0.3 * k)
    x = np.tanh(1.05 * x) / np.tanh(1.05)
    env = raised(t, 0.004) * (0.8 * np.exp(-t / 1.8) + 0.2)
    i_rel = int(dur_s * R)
    if i_rel < n:
        env[i_rel:] *= np.exp(-(t[i_rel:] - dur_s) / 0.05)
    env[-int(0.02 * R):] *= np.linspace(1, 0, int(0.02 * R))
    x = x * env * (0.25 + 0.75 * v)
    return np.stack([x, x], 1)


def tiny_tick(m, v, dur_s, rng, pan=0.0):
    """打つ音はこれ 1 種類：小さく精密な、高い帯の一瞬の音（声より上。7 kHz あたり）。打つたびに少し違う"""
    n = int(0.05 * R)
    t = np.arange(n) / R
    fc = rng.uniform(7000, 8300)
    common = rng.standard_normal(n)
    out = np.zeros((n, 2))
    for c in range(2):
        nz = 0.85 * common + 0.5 * rng.standard_normal(n)
        out[:, c] = filt(nz, lambda f: bell(f, fc, 8, 0.8) * hp(f, 4300, 3) * lp(f, 15000, 2))
    metal = sum(a * np.sin(TWO_PI * fq * rng.uniform(0.99, 1.01) * t + rng.uniform(0, 6)) for fq, a in ((6100, 0.5), (8700, 0.35), (11900, 0.25)) if fq < 0.45 * R)
    out += (metal * np.exp(-t / 0.0035))[:, None] * np.abs(out).max() * 0.5
    out *= ((0.85 * np.exp(-t / 0.0028) + 0.15 * np.exp(-t / 0.014)) * raised(t, 0.00025))[:, None]
    out[-int(0.01 * R):] *= np.linspace(1, 0, int(0.01 * R))[:, None]
    gl, gr = math.cos((pan + 1) * math.pi / 4) * 1.4142, math.sin((pan + 1) * math.pi / 4) * 1.4142
    out[:, 0] *= gl
    out[:, 1] *= gr
    return out / (np.abs(out).max() + 1e-9) * (0.25 + 0.75 * v)


INSTR.update({"wood": dry_wood, "clean": clean_pluck, "deep": deep_bass, "tick": tiny_tick})
TIMBRES["air2"] = dict(bw=90, bwk=0.9, tilt=0.45, fc=(6000, 12000), order=1.5, form=[], fmax=16000)
PREVIEW_ONLY = {"D", "E", "D2"}  # 全長は、作者が選んでから作る


def small_song(name, seed, bpm, mul, inst, room, hall, delay_beats, master_cfg, wet=1.0):
    """D・E に共通の下ごしらえ：乾いた音型のバスと、区切りだけ遠くへ響かせるバス"""
    s = Song(name, seed, bpm, multiple={"main": mul}, swing=0.5)
    s.pad_cfg["air"] = dict(timbre="air2", att=1.6, rel=0.35, width=1.0, bright=lambda t: np.full_like(t, 0.6))
    s.mix = dict(
        bus={inst: dict(plate=room), "throw": dict(dry=0.0, hall=0.8, delay=0.65), "deep": dict(), "tick": dict(plate=0.06), "air": dict(hall=0.12)},
        eq={
            inst: lambda f: hp(f, 110, 2) * bell(f, 2300, -3.5, 0.9) * lp(f, 17000, 1),
            "throw": lambda f: hp(f, 250, 2) * bell(f, 2300, -4, 0.9) * lp(f, 9000, 1),
            "deep": lambda f: hp(f, 28, 2) * lp(f, 1800, 1),
            "tick": lambda f: np.ones_like(f),
            "air": lambda f: hp(f, 5200, 2) * lp(f, 15000, 2),
        },
        hall=hall,
        plate=(0.28, 0.32, 0.22, 0.003),
        delay_beats=delay_beats,
        delay_fb=0.34,
        wet=wet,
        wet_hi=13000,
        master=master_cfg,
    )
    return s


def plan_d():
    """案 D：木の音型と深い低音。音型 A E D A（5 度上がり、順に下り、4 度下りる。3 度のない開いた音）。下で低音だけが F・G・B♭・C・D と動く"""
    s = small_song("D", 904, 96, 4, "wood", 0.15, (2.2, 2.6, 1.8, 0.03), 0.75, dict(drive=0.3, fade_in=0.04, leveler=False))
    d = s.tm.sec["main"]
    b0, nb = d["b0"], d["bars"]
    F1, G1, BB1, C2, D2 = 29, 31, 34, 36, 38
    MOTIF = [(0, 69, 0.74), (3, 76, 0.54), (6, 74, 0.62), (10, 69, 0.46)]

    def motif(bar, vm=1.0, last=None, cut=4, throw=None, up=0.0):
        for j, (st, m, v) in enumerate(MOTIF[:cut]):
            mm = last if (last is not None and j == 3) else m
            bt = b0 + bar * 4 + st / 4
            s.note("wood", "wood", bt, 0.85, mm, v * vm * s.rng.uniform(0.97, 1.03), jit_ms=0.6)
            if up:
                s.note("wood", "wood", bt + 0.004, 0.7, mm + 12, v * vm * up * s.rng.uniform(0.95, 1.05), jit_ms=0.6, pan=0.25 if j % 2 else -0.25)
            if throw == j:
                s.note("wood", "throw", bt, 0.85, mm, v * vm, jit_ms=0.0)

    def bass(bar, st, beats, m, v=0.95):
        s.note("deep", "deep", b0 + bar * 4 + st / 4, beats, m, v, jit_ms=0.5)

    def ticks(bar, pat, g=1.0, until=16):
        for st, v in pat:
            if st < until:
                s.note("tick", "tick", b0 + bar * 4 + st / 4, 0.1, 96, v * g * s.rng.uniform(0.92, 1.08), jit_ms=0.4, pan=0.12 if st % 8 else -0.08)

    PAT = [(4, 0.72), (8, 0.42), (12, 0.82), (14, 0.34)]
    PAT2 = [(4, 0.72), (8, 0.42), (12, 0.82), (15, 0.3)]
    PAT3 = [(2, 0.26), (4, 0.74), (8, 0.46), (10, 0.24), (12, 0.86), (14, 0.36)]
    for bar in range(nb):
        blk, i = bar // 8, bar % 8
        if blk == 0:  # 音型だけ → 深い低音が入る
            motif(bar, 0.9 + 0.03 * i, throw=3 if i == 7 else None)
            if i == 4:
                bass(bar, 0, 3.6, F1)
            if i == 5:
                bass(bar, 14, 0.45, G1, 0.58)
            if i == 6:
                bass(bar, 0, 3.6, G1)
            if i == 7:
                bass(bar, 14, 0.45, BB1, 0.58)
        elif blk == 1:  # 刻みを足す → 抜く → 一瞬止まる
            if i <= 3:
                motif(bar, 1.0)
                ticks(bar, PAT if i % 2 == 0 else PAT2)
                if i == 0:
                    bass(bar, 0, 3.6, BB1)
                if i == 1:
                    bass(bar, 14, 0.45, C2, 0.58)
                if i == 2:
                    bass(bar, 0, 3.6, C2)
            elif i == 4:  # 低音を抜く。最後の音だけ遠くへ
                motif(bar, 0.95, throw=3)
                ticks(bar, PAT)
            elif i == 5:  # 音型も抜く。刻みと、遠くの響きだけ
                ticks(bar, PAT2, 0.85)
            elif i == 6:
                motif(bar, 1.0)
                ticks(bar, PAT)
                bass(bar, 0, 3.2, F1)
            else:  # 2 音で切り、止まる
                motif(bar, 1.05, cut=2, throw=1)
                ticks(bar, PAT, until=5)
        elif blk == 2:  # 戻る。1 オクターブ上を薄く重ね、空気が入る
            motif(bar, 1.02, up=0.3, last=67 if i >= 4 else None, throw=3 if i == 7 else None)
            ticks(bar, PAT3 if i % 2 else PAT)
            root = {0: D2, 2: BB1, 4: C2, 6: F1}.get(i)
            if root is not None:
                bass(bar, 0, 3.6, root)
            nxt = {1: BB1, 3: C2, 5: F1}.get(i)
            if nxt is not None:
                bass(bar, 14, 0.45, nxt, 0.58)
        else:  # 終わりへ：また音型と低音だけ
            if i % 2 == 0 or i < 4:
                motif(bar, 0.92 - 0.03 * i)
            root = {0: BB1, 2: C2, 4: F1}.get(i)
            if root is not None:
                bass(bar, 0, 5.5, root, 0.8)
    # 空気：刻みの間と、戻ってから
    bt = lambda bar: b0 + bar * 4  # noqa: E731
    for m_ in (88, 93):
        s.pad("air", bt(8), bt(12), m_, 0.55)
        s.pad("air", bt(16), bt(24), m_, 1.0)
    s.auto("wood", [(0, -10)])
    s.auto("throw", [(0, -13)])
    s.auto("deep", [(0, -10.5)])
    s.auto("tick", [(0, -23)])
    s.auto("air", [(0, -35)])
    return s


def plan_e():
    """案 E：澄んだ音型と細かな刻み。音型 F F C G（短短長長）。低音は D♭・E♭・B♭・A♭ で、音型の色がリディアの明るさに変わる。低音は遅れて入る"""
    s = small_song("E", 905, 102, 2, "clean", 0.12, (1.9, 2.2, 1.6, 0.024), 0.75, dict(drive=0.3, fade_in=0.04, leveler=False))
    d = s.tm.sec["main"]
    b0, nb = d["b0"], d["bars"]
    AB1, BB1, DB2, EB2 = 32, 34, 37, 39
    MOTIF = [(0, 77, 0.66), (2, 77, 0.44), (6, 72, 0.58), (10, 79, 0.52)]

    def motif(bar, vm=1.0, last=None, cut=4, throw=None, low=0.0):
        for j, (st, m, v) in enumerate(MOTIF[:cut]):
            mm = last if (last is not None and j == 3) else m
            bt = b0 + bar * 4 + st / 4
            s.note("clean", "clean", bt, 0.6, mm, v * vm * s.rng.uniform(0.97, 1.03), jit_ms=0.5)
            if low:
                s.note("clean", "clean", bt, 0.6, mm - 12, v * vm * low * s.rng.uniform(0.95, 1.05), jit_ms=0.5)
            if throw == j:
                s.note("clean", "throw", bt, 0.6, mm, v * vm, jit_ms=0.0)

    def bass(bar, st, beats, m, v=0.95):
        s.note("deep", "deep", b0 + bar * 4 + st / 4, beats, m, v, jit_ms=0.5)

    def ticks(bar, pat, g=1.0, until=16):
        for st, v in pat:
            if st < until:
                s.note("tick", "tick", b0 + bar * 4 + st / 4, 0.1, 96, v * g * s.rng.uniform(0.92, 1.08), jit_ms=0.4, pan=0.14 if st % 4 else -0.1)

    PAT = [(4, 0.7), (8, 0.46), (11, 0.3), (14, 0.74)]
    PAT2 = [(4, 0.7), (8, 0.46), (12, 0.58), (14, 0.34), (15, 0.26)]

    def groove(bar, root, full=False, v=0.95):
        bass(bar, 0, 1.6, root, v)
        if full:
            bass(bar, 7, 0.4, root, v * 0.6)
        bass(bar, 12, 0.75, root, v * 0.7)

    for bar in range(nb):
        blk, i = bar // 8, bar % 8
        if blk == 0:  # 音型だけ → 刻みを足す（低音はまだ）
            motif(bar, 0.9 + 0.025 * i, throw=3 if i == 7 else None)
            if i >= 4:
                ticks(bar, PAT if i % 2 == 0 else PAT2, 0.6 + 0.08 * (i - 4))
        elif blk == 1:  # 深い低音が入る → 音型を抜く → 一瞬止まる
            if i <= 3:
                motif(bar, 1.0)
                ticks(bar, PAT if i % 2 == 0 else PAT2)
                groove(bar, DB2 if i < 2 else EB2)
            elif i <= 5:  # 音型を抜く。低音と刻みだけ
                ticks(bar, PAT if i % 2 == 0 else PAT2)
                groove(bar, BB1, full=True, v=0.9)
            elif i == 6:
                motif(bar, 1.0)
                ticks(bar, PAT)
                groove(bar, AB1)
            else:  # 3 音で切り、止まる
                motif(bar, 1.05, cut=3, throw=2)
                ticks(bar, PAT, until=5)
                bass(bar, 0, 1.3, AB1, 0.85)
        elif blk == 2:  # 戻る。1 オクターブ下を重ね、空気が入る
            motif(bar, 1.0, low=0.45, last=80 if i in (3, 7) else None, throw=3 if i == 7 else None)
            ticks(bar, PAT2 if i % 2 else PAT)
            groove(bar, {0: DB2, 1: DB2, 2: EB2, 3: EB2, 4: BB1, 5: BB1, 6: AB1, 7: EB2}[i], full=True)
        else:  # 終わりへ
            if i < 4 or i % 2 == 0:
                motif(bar, 0.92 - 0.03 * i)
            if i <= 5:
                bass(bar, 0, 2.5, {0: DB2, 1: DB2, 2: BB1, 3: BB1}.get(i, AB1), 0.8)
    bt = lambda bar: b0 + bar * 4  # noqa: E731
    for m_ in (89, 94):
        s.pad("air", bt(12), bt(15), m_, 0.6)
        s.pad("air", bt(16), bt(24), m_, 1.0)
    s.auto("clean", [(0, -11)])
    s.auto("throw", [(0, -13)])
    s.auto("deep", [(0, -11)])
    s.auto("tick", [(0, -23)])
    s.auto("air", [(0, -35)])
    return s


def plan_d2():
    """案 D2（作者の声：ミニマルで、静かな間のあるピアノ。声が乗るので音は少なく）。
    案 D の音型 A E D A をゆっくりピアノで置き、長い余韻と間を聞かせる。4 小節に 1 回だけ。下の低い 1 音で色が変わる。
    止まって暗いだけにしないよう、音型の最初の音（A3）を、布をかけたようにごく弱く毎拍くり返して、前へ進める。"""
    s = Song("D2", 906, 96, multiple={"main": 4}, swing=0.5)
    d = s.tm.sec["main"]
    b0, nb = d["b0"], d["bars"]
    MOTIF = [(0, 69, 0.50), (6, 76, 0.40), (12, 74, 0.44), (20, 69, 0.34)]  # 16 分の位置・音・強さ
    # 4 小節ごとの低音（なし → F → B♭ → G → D ...）。解決させない。同じ音型が、低音で明るくも遠くもなる
    ROOTS = [None, (29, 41), (34, 46), (31, 43), (38, 50), (34, 46), (36, 48), (29, 41)]

    def pan_of(m):
        return float(np.clip((m - 62) / 70, -0.22, 0.22))

    def hit(bt, m, v, beats=14.0, mute=1.25, bus="piano", sub=0.0):
        s.note("piano", bus, bt, beats, m, v, late_ms=0, jit_ms=5, pan=pan_of(m), mute=mute, top=11000.0, click=1.0, sub=sub, spread_lr=0.2)

    for idx, bar in enumerate(range(0, nb, 4)):
        bt = b0 + bar * 4
        cut = 3 if idx % 4 == 3 else 4  # 4 回に 1 回は、最後の音を鳴らさない（間が残る）
        for j, (st, m, v) in enumerate(MOTIF[:cut]):
            hit(bt + st / 4, m, v * s.rng.uniform(0.96, 1.04))
            if idx % 4 == 0 and idx > 0:  # 8 小節の区切りを過ぎて戻る時は、1 オクターブ上を薄く重ねる
                hit(bt + st / 4 + 0.004, m + 12, v * 0.34)
        root = ROOTS[idx % len(ROOTS)]
        if root is not None:
            hit(bt, root[0], 0.40, mute=0.9, bus="pianolow", sub=0.75)
            hit(bt + 0.01, root[1], 0.16, mute=0.9, bus="pianolow")
        # 間に 1 音だけ置く
        if idx % 8 == 1:
            hit(bt + 8 + 1, 60, 0.20)  # C4
        if idx % 8 == 2:
            hit(bt + 8, 81, 0.20)  # A5
    # ごく弱い脈：布をかけたような短い A3。最初の 2 小節と、8 小節の組の終わりの 2 小節は休む
    for bar in range(nb):
        i16 = bar % 16
        if bar < 2 or i16 in (14, 15):
            continue
        g = 0.55 + 0.2 * (bar - 2) if bar < 4 else 1.0
        for q, pv in enumerate((1.0, 0.62, 0.82, 0.62)):
            s.note("piano", "pulse", b0 + bar * 4 + q, 0.35, 57, 0.17 * g * pv * s.rng.uniform(0.9, 1.1), jit_ms=4, mute=0.55, rel_s=0.09)
    s.auto("piano", [(0, -8)])
    s.auto("pianolow", [(0, -7)])
    s.auto("pulse", [(0, -19)])
    s.mix = dict(
        bus=dict(piano=dict(hall=0.24, plate=0.10, body=0.25), pianolow=dict(hall=0.14, plate=0.06, body=0.3), pulse=dict(hall=0.02, plate=0.04)),
        eq=dict(
            piano=lambda f: hp(f, 60, 2) * bell(f, 1700, -6.5, 1.2) * lp(f, 14000, 1),  # 声の帯を空ける
            pianolow=lambda f: hp(f, 28, 2) * lp(f, 5000, 1),
            pulse=lambda f: hp(f, 90, 2) * lp(f, 5000, 1),
        ),
        hall=(3.6, 4.2, 2.6, 0.03),
        plate=(0.5, 0.6, 0.4, 0.006),
        wet_hi=12000,
        master=dict(drive=0.25, fade_in=0.04, leveler=False),
    )
    return s


def plan_d3():
    """案 D2 の全長（最終案 9 の仮の曲。作者が曲を選ぶまで）。音型 A E D A をゆっくりピアノで置き、声の邪魔をしない。
    段は章に対応する：intro 序（低い 1 音と音型だけ）／ main 残す・渡す 1・渡す 2（D2 の脈あり）／ thin 次の時代へ（脈なし。最後の音が抜ける）／
    gap 途絶えても（ほとんど消える）／ build 復元（脈が戻り、少しずつ積み上がる）／ peak 山は 1 回だけ（1 オクターブ上を薄く重ねる）／ end 結（最後の音だけ長く）。
    映像とは大きな区切りだけが合う。字や効果音を音に合わせない"""
    s = Song("D3", 906, 96, multiple={"main": 4, "thin": 4, "build": 2, "peak": 2}, rit={"end": (0.5, 0.3)})
    MOTIF = [(0, 69, 0.50), (6, 76, 0.40), (12, 74, 0.44), (20, 69, 0.34)]  # 16 分の位置・音・強さ
    ROOTS = [None, (29, 41), (34, 46), (31, 43), (38, 50), (34, 46), (36, 48), (29, 41)]

    def pan_of(m):
        return float(np.clip((m - 62) / 70, -0.22, 0.22))

    def hit(bt, m, v, beats=14.0, mute=1.25, bus="piano", sub=0.0):
        s.note("piano", bus, bt, beats, m, v, late_ms=0, jit_ms=5, pan=pan_of(m), mute=mute, top=11000.0, click=1.0, sub=sub, spread_lr=0.2)

    def phrase(bt, idx, level=1.0, cut=4, octave=0.0, root=True):
        for j, (st, m, v) in enumerate(MOTIF[:cut]):
            hit(bt + st / 4, m, v * level * s.rng.uniform(0.96, 1.04))
            if octave > 0:
                hit(bt + st / 4 + 0.004, m + 12, v * level * octave)
        r = ROOTS[idx % len(ROOTS)]
        if root and r is not None:
            hit(bt, r[0], 0.40 * level, mute=0.9, bus="pianolow", sub=0.75)
            hit(bt + 0.01, r[1], 0.16 * level, mute=0.9, bus="pianolow")

    def pulse(bt0, bars, g0=1.0, g1=1.0, skip=lambda bar: False):
        for bar in range(bars):
            if skip(bar):
                continue
            g = g0 + (g1 - g0) * (bar / max(1, bars - 1))
            for q, pv in enumerate((1.0, 0.62, 0.82, 0.62)):
                s.note("piano", "pulse", bt0 + bar * 4 + q, 0.35, 57, 0.17 * g * pv * s.rng.uniform(0.9, 1.1), jit_ms=4, mute=0.55, rel_s=0.09)

    # 序：低い 1 音から。音型は 1 度か 2 度だけ
    d = s.sec("intro")
    b0, nb = d["b0"], d["bars"]
    hit(b0 + 1, 29, 0.42, beats=20.0, mute=0.9, bus="pianolow", sub=0.8)
    hit(b0 + 1.01, 41, 0.15, beats=20.0, mute=0.9, bus="pianolow")
    phrase(b0 + 8, 0, level=0.82, root=False)
    if nb >= 8:
        phrase(b0 + 8 + 16 + (nb - 8) * 2, 1, level=0.86)
    # 本体：D2 と同じ。4 小節に 1 回、下の低い 1 音で色が変わる。ごく弱い脈
    d = s.sec("main")
    b0, nb = d["b0"], d["bars"]
    for idx, bar in enumerate(range(0, nb, 4)):
        bt = b0 + bar * 4
        phrase(bt, idx + 2, cut=3 if idx % 4 == 3 else 4, octave=0.34 if (idx % 4 == 0 and idx > 0) else 0.0)
        if idx % 8 == 1:
            hit(bt + 9, 60, 0.20)
        if idx % 8 == 2:
            hit(bt + 8, 81, 0.20)
    pulse(b0, nb, skip=lambda bar: bar < 2 or bar % 16 in (14, 15))
    # 次の時代へ：脈を抜く。最後の音が帰ってこない
    d = s.sec("thin")
    b0, nb = d["b0"], d["bars"]
    for idx, bar in enumerate(range(0, nb, 4)):
        last = bar + 4 >= nb
        phrase(b0 + bar * 4, idx + 4, level=0.8, cut=3 if last else 4, root=not last)
    # 途絶えても：ほとんど消える。残りの響きと 1 音だけ
    d = s.sec("gap")
    hit(d["b0"] + 2, 69, 0.20, beats=10.0)
    # 復元：脈が戻り、1 音ずつ足していく
    d = s.sec("build")
    b0, nb = d["b0"], d["bars"]
    steps = max(1, nb // 4)
    for idx, bar in enumerate(range(0, nb, 4)):
        u = idx / max(1, steps - 1)
        phrase(b0 + bar * 4, idx + 1, level=0.72 + 0.26 * u, cut=2 + min(2, idx), octave=0.16 * u, root=idx > 0)
    pulse(b0 + 8 if nb > 2 else b0, max(0, nb - 2), g0=0.5, g1=1.0)
    # 山：1 回だけ。品よく
    d = s.sec("peak")
    b0, nb = d["b0"], d["bars"]
    for idx, bar in enumerate(range(0, nb, 4)):
        phrase(b0 + bar * 4, 1 + idx * 3, level=1.05, octave=0.36)
    pulse(b0, nb, g0=1.0, g1=0.55)
    # 結：最後の音だけ長く
    d = s.sec("end")
    b0 = d["b0"]
    for st, m, v in MOTIF[:3]:
        hit(b0 + st / 4, m, v * 0.9)
    hit(b0 + MOTIF[3][0] / 4, 69, 0.36, beats=24.0)
    hit(b0, 29, 0.40, beats=28.0, mute=0.9, bus="pianolow", sub=0.8)
    hit(b0 + 0.01, 41, 0.16, beats=28.0, mute=0.9, bus="pianolow")
    s.auto("piano", [(0, -8)])
    s.auto("pianolow", [(0, -7)])
    s.auto("pulse", [(0, -19)])
    s.mix = dict(
        bus=dict(piano=dict(hall=0.24, plate=0.10, body=0.25), pianolow=dict(hall=0.14, plate=0.06, body=0.3), pulse=dict(hall=0.02, plate=0.04)),
        eq=dict(
            piano=lambda f: hp(f, 60, 2) * bell(f, 1700, -6.5, 1.2) * lp(f, 14000, 1),  # 声の帯を空ける
            pianolow=lambda f: hp(f, 28, 2) * lp(f, 5000, 1),
            pulse=lambda f: hp(f, 90, 2) * lp(f, 5000, 1),
        ),
        hall=(3.6, 4.2, 2.6, 0.03),
        plate=(0.5, 0.6, 0.4, 0.006),
        wet_hi=12000,
        master=dict(drive=0.25, fade_in=0.04, leveler=False),
    )
    return s


PLANS = {"A": plan_a, "B": plan_b, "C": plan_c, "D": plan_d, "E": plan_e, "D2": plan_d2, "D3": plan_d3}
PLAN_INFO = {"A": "温かい和音と低音", "B": "ピアノとやわらかな脈", "C": "広がる音の層", "D": "木の音型と深い低音", "E": "澄んだ音型と細かな刻み", "D2": "ピアノと間", "D3": "ピアノと間の全長"}


# ================================================================ 音にする
def render_pad_layer(song, layer, events, cfg, t0, t1):
    n = int(round((t1 - t0) * R))
    ctl = 200
    nc = int((t1 - t0) * ctl) + 3
    tc = t0 + np.arange(nc) / ctl
    mids = sorted({e[2] for e in events})
    if not mids:
        return np.zeros((n, 2), F32)
    target = np.zeros((len(mids), nc), F32)
    idx = {m: i for i, m in enumerate(mids)}
    for a, b, m, lev in events:
        i0 = int(max(0, math.floor((a - t0) * ctl)))
        i1 = int(min(nc, math.ceil((b - t0) * ctl)))
        if i1 > i0:
            target[idx[m], i0:i1] = np.maximum(target[idx[m], i0:i1], lev)
    # 立ち上がりと消えるのを別の速さで、2 回なめらかに
    att, rel = cfg["att"], cfg["rel"]
    env = target
    for _ in range(2):
        ka = 1 - math.exp(-1.0 / (ctl * att / 2))
        kr = 1 - math.exp(-1.0 / (ctl * rel / 2))
        out = np.zeros_like(env)
        cur = env[:, 0].copy()
        for i in range(nc):
            tg = env[:, i]
            k = np.where(tg > cur, ka, kr)
            cur = cur + (tg - cur) * k
            out[:, i] = cur
        env = out
    t_a = t0 + np.arange(n) / R
    bright = cfg.get("bright")
    width = cfg.get("width", 1.0)
    bvals = bright(t_a) if bright is not None else np.full(n, 0.35)
    bvals = np.clip(bvals, 0, 1).astype(F32)
    pulse = cfg.get("pulse")
    pulse_vals = pulse(t_a).astype(F32) if pulse is not None else None
    start = int(round(t0 * R))

    def one(mi):
        m = mids[mi]
        e = np.interp(t_a, tc, env[mi]).astype(F32)
        if e.max() < 1e-4:
            return None
        tabs = pad_table(cfg["timbre"], m)
        off = (start + (m * 7919 + sum(ord(ch) for ch in layer) * 104729)) % TAB_N
        ii = (np.arange(n) + off) % TAB_N
        res = np.zeros((n, 2), F32)
        vol = cents_level(m)
        for c in range(2):
            res[:, c] = (tabs[0, c][ii] * (1 - bvals) + tabs[1, c][ii] * bvals) * e * vol
        if pulse_vals is not None:
            res *= pulse_vals[:, None]
        return res

    out = np.zeros((n, 2), F32)
    with ThreadPoolExecutor(8) as ex:
        for r in ex.map(one, range(len(mids))):
            if r is not None:
                out += r
    if width != 1.0:
        mid = out.mean(1, keepdims=True)
        out = mid + (out - mid) * width
    return out


def moving_avg(x, k):
    """移動平均（累積和で。長い窓でも速い）"""
    cs = np.concatenate([[0.0], np.cumsum(np.pad(x, (k // 2, k - k // 2 - 1), mode="edge"))])
    return (cs[k:] - cs[:-k]) / k


def cents_level(m):
    """高い音ほど少し小さく（上の声が前に出すぎない）"""
    return float(db(-0.12 * max(0, m - 60)))


def lufs_filter(x):
    """BS.1770 の K 特性（48 kHz の係数を、周波数の側で使う）"""
    n = x.shape[0]
    m = 1 << int(math.ceil(math.log2(n + 4096)))
    w = np.fft.rfftfreq(m, 1.0) * TWO_PI
    z1 = np.exp(-1j * w)
    z2 = z1 * z1
    h1 = (1.53512485958697 - 2.69169618940638 * z1 + 1.19839281085285 * z2) / (1 - 1.69065929318241 * z1 + 0.73248077421585 * z2)
    h2 = (1 - 2 * z1 + z2) / (1 - 1.99004745483398 * z1 + 0.99007225036621 * z2)
    H = np.abs(h1 * h2)
    return np.stack([np.fft.irfft(np.fft.rfft(x[:, c], m) * H, m)[:n] for c in range(2)], 1)


def blocks(p, win, hop):
    cs = np.concatenate([[0], np.cumsum(p)])
    idx = np.arange(0, max(1, len(p) - win), hop)
    return (cs[idx + win] - cs[idx]) / win


def lufs_of(x):
    y = lufs_filter(x)
    p = (y ** 2).sum(1)
    z = blocks(p, int(0.4 * SR), int(0.1 * SR))
    l_ = -0.691 + 10 * np.log10(z + 1e-12)
    keep = l_ > -70
    if not keep.any():
        return -70.0
    g = -0.691 + 10 * np.log10(z[keep].mean()) - 10
    keep2 = l_ > g
    return float(-0.691 + 10 * np.log10(z[keep2].mean() + 1e-12))


def short_term(x):
    y = lufs_filter(x)
    p = (y ** 2).sum(1)
    z = blocks(p, int(3.0 * SR), int(1.0 * SR))
    return -0.691 + 10 * np.log10(z + 1e-12)


def true_peak_env(x):
    """4 倍に細かくして、サンプルの間の山も見る"""
    n = len(x)
    pk = np.abs(x).max(1).astype(np.float64)
    step = SR
    for s0 in range(0, n, step):
        a0, b0 = max(0, s0 - 256), min(n, s0 + step + 256)
        seg = x[a0:b0]
        m = b0 - a0
        for c in range(2):
            X = np.fft.rfft(seg[:, c])
            Y = np.zeros(m * 2 + 1, complex)
            Y[: len(X)] = X
            up = np.abs(np.fft.irfft(Y, m * 4) * 4).reshape(m, 4).max(1)
            lo, hi = s0 - a0, s0 - a0 + min(step, n - s0)
            pk[s0 : s0 + (hi - lo)] = np.maximum(pk[s0 : s0 + (hi - lo)], up[lo:hi])
    return pk


def limiter(x, ceil_db=CEIL_DB, look=0.005, rel=0.15):
    c = db(ceil_db)
    pk = true_peak_env(x)
    need = np.minimum(1.0, c / np.maximum(pk, 1e-9))
    if need.min() >= 1.0:
        return x, 0.0
    L = int(look * SR)
    blk = 32
    nb = len(need) // blk + 1
    padn = np.concatenate([need, np.ones(nb * blk - len(need) + L)])
    bm = np.lib.stride_tricks.sliding_window_view(padn, L + 1).min(1)[: nb * blk].reshape(nb, blk).min(1)
    rr = math.exp(-blk / SR / rel)
    g = np.zeros(nb)
    cur = 1.0
    for i in range(nb):
        tg = bm[i]
        cur = tg if tg < cur else tg + (cur - tg) * rr
        g[i] = cur
    gain = np.repeat(g, blk)[: len(x)]
    k = np.ones(L) / L
    # 先を見た最小の値を、過去 L サンプルで平均する。どの値も今のサンプルの山を見ているので、はみ出さず、段差も出ない
    gs = np.convolve(np.concatenate([np.full(L, gain[0]), gain]), k, mode="valid")[: len(x)]
    return x * gs[:, None], float(-20 * np.log10(gs.min()))


def leveler(x, thr_db, ratio, att=0.03, rel=0.45):
    """ゆるいコンプ（全体のまとまり）。64 サンプルごとに"""
    blk = 64
    nb = len(x) // blk
    p = (x[: nb * blk] ** 2).mean(1).reshape(nb, blk).mean(1)
    lvl = 10 * np.log10(p + 1e-12)
    over = np.maximum(0, lvl - thr_db)
    gr = over * (1 - 1 / ratio)
    a_, r_ = math.exp(-blk / SR / att), math.exp(-blk / SR / rel)
    g = np.zeros(nb)
    cur = 0.0
    for i in range(nb):
        tg = gr[i]
        cur = tg + (cur - tg) * (a_ if tg > cur else r_)
        g[i] = cur
    gain = np.repeat(10 ** (-g / 20), blk)
    gain = np.concatenate([gain, np.full(len(x) - len(gain), gain[-1] if len(gain) else 1.0)])
    return x * gain[:, None]


def bus_level(y, t_axis, t_from, t_to):
    """t_from〜t_to のバスの大きさ：そのままと、人の耳の感じ方に近い重み（A 特性）をつけたもの"""
    i0 = int(np.searchsorted(t_axis, t_from))
    i1 = int(np.searchsorted(t_axis, t_to))
    seg = y[i0:i1]
    if len(seg) < 100:
        return (-99.0, -99.0)
    rms = math.sqrt((seg ** 2).mean() + 1e-20)

    def a_w(f):
        f2 = np.maximum(f, 1.0) ** 2
        ra = (12194.0 ** 2 * f2 ** 2) / ((f2 + 20.6 ** 2) * np.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194.0 ** 2))
        return ra * 1.2589

    sw = filt(seg, a_w)
    return (20 * math.log10(rms), 20 * math.log10(math.sqrt((sw ** 2).mean() + 1e-20)))


def upsample2(x):
    """R → SR（周波数の側で 0 を足す）"""
    if SR == R:
        return x
    ratio = SR // R
    n = len(x)
    out = np.zeros((n * ratio, 2))
    for c in range(2):
        X = np.fft.rfft(x[:, c])
        Y = np.zeros(n * ratio // 2 + 1, complex)
        Y[: len(X)] = X
        out[:, c] = np.fft.irfft(Y, n * ratio) * ratio
    return out


def render(song, t_from, t_to, verbose=True):
    """t_from〜t_to の音を作る（ステレオ、SR）。前に鳴っていた音と残響のため、少し前から計算する"""
    t0 = max(0.0, t_from - 9.0)
    t1 = min(END + 1.5, t_to + 0.5)
    n = int(round((t1 - t0) * R))
    t_axis = t0 + np.arange(n) / R
    buses = defaultdict(lambda: np.zeros((n, 2), F32))
    st = time.time()

    # ---------------- 音符
    jobs = []
    for idx, (inst, bus, at, dur, m, v, kw) in enumerate(song.notes):
        if at + dur + 2.0 < t0 or at > t1:
            continue
        jobs.append((idx, inst, bus, at, dur, m, v, kw))

    def do(j):
        idx, inst, bus, at, dur, m, v, kw = j
        rng = np.random.default_rng([song.seed, idx])
        return j, INSTR[inst](m, v, dur, rng, **kw)

    def put(bus, x, at):
        a = int(round((at - t0) * R))
        if a < 0:
            x = x[-a:]
            a = 0
        b = min(n, a + len(x))
        if b > a:
            buses[bus][a:b] += x[: b - a].astype(F32)

    with ThreadPoolExecutor(12) as ex:
        for j, x in ex.map(do, jobs):
            put(j[2], x, j[3])
    # ---------------- 一打
    for k, (bt, v, ff) in enumerate(song.thumps):
        at = song.tm.t(bt) + song.rng.normal(0.004, 0.002)
        if at + 0.6 < t0 or at > t1:
            continue
        rng = np.random.default_rng([song.seed, 77, k])
        put("thump", felt_thump(v, ff, rng, tap=song.mix.get("tap", 1.0)), at)
    if verbose:
        print(f"  音符 {len(jobs)} 個：{time.time() - st:.1f} 秒")
        st = time.time()

    # ---------------- 広がる音
    for layer, events in song.pads.items():
        buses[layer] += render_pad_layer(song, layer, events, song.pad_cfg[layer], t0, t1)
    if verbose:
        print(f"  広がる音：{time.time() - st:.1f} 秒")
        st = time.time()

    # ---------------- 大きさの動き → 残響へ送る → 混ぜる
    mx = song.mix
    hall_in = np.zeros((n, 2))
    plate_in = np.zeros((n, 2))
    delay_in = np.zeros((n, 2))
    dry = np.zeros((n, 2))
    eq = mx.get("eq", {})
    defaults = {
        "pad": lambda f: hp(f, 150, 2) * lp(f, 7000, 2),
        "padlow": lambda f: hp(f, 80, 2) * lp(f, 2400, 2),
        "strings": lambda f: hp(f, 190, 2) * lp(f, 6500, 2),
        "bass": lambda f: hp(f, 30, 2) * lp(f, 1700, 1),
        "thump": lambda f: hp(f, 30, 2) * lp(f, 800, 2),
        "ep": lambda f: hp(f, 120, 2) * lp(f, 8000, 2),
        "lead": lambda f: hp(f, 150, 2) * lp(f, 8000, 2),
        "arp": lambda f: hp(f, 180, 2) * lp(f, 7000, 2),
        "piano": lambda f: hp(f, 55, 2) * lp(f, 5200, 1) * bell(f, 2600, -4, 1.0) * bell(f, 240, 1.0, 0.8),
        "pianolow": lambda f: hp(f, 45, 2) * lp(f, 3400, 1),
        "mallet": lambda f: hp(f, 120, 2) * lp(f, 3600, 2),
        "choir": lambda f: hp(f, 150, 2) * lp(f, 4200, 2),
        "air": lambda f: hp(f, 3200, 2) * lp(f, 9800, 2),
    }
    levels = {}
    for name, x in buses.items():
        cfg = mx["bus"].get(name, {})
        y = x.astype(np.float64)
        y = filt(y, eq.get(name, defaults.get(name, lambda f: np.ones_like(f))))
        if "drift" in cfg:
            depth, rate = cfg["drift"]
            y = drift_warp(y, depth, rate, 100 + sum(ord(ch) for ch in name))
        pts = song.autos.get(name)
        if pts:
            ts = [p[0] for p in pts]
            vs = [p[1] for p in pts]
            lev = np.interp(t_axis, ts, vs)
            # 角を丸める
            lev = moving_avg(lev, int(0.25 * R))
            y = y * (10.0 ** (lev / 20))[:, None]
        if cfg.get("body"):
            y = y + convolve(y, body_ir()) * cfg["body"]
        if verbose:
            levels[name] = bus_level(y, t_axis, t_from, t_to)
        dry += y * cfg.get("dry", 1.0)
        hall_in += y * cfg.get("hall", 0.0)
        plate_in += y * cfg.get("plate", 0.0)
        delay_in += y * cfg.get("delay", 0.0)
    del buses
    h = mx["hall"]
    ir_h = make_ir(h[0], h[1], h[2], h[3], seed=31)
    p_ = mx["plate"]
    ir_p = make_ir(p_[0], p_[1], p_[2], p_[3], seed=47, onset=0.006)
    beat_s = 60.0 / song.tm.bpm * (song.tm.sec["main"]["bars"] * 4) / ((song.tm.sec["main"]["t1"] - song.tm.sec["main"]["t0"]) * song.tm.bpm / 60.0)
    if np.abs(delay_in).max() > 0:
        dl = tempo_delay(delay_in, beat_s * mx.get("delay_beats", 0.75), mx.get("delay_fb", 0.4), 6)
        hall_in += dl * 0.5
        dry += dl * 0.8
    wet = convolve(hall_in, ir_h) + convolve(plate_in, ir_p)
    wet = filt(wet, lambda f: hp(f, 190, 2) * lp(f, mx.get("wet_hi", 8500), 2) * bell(f, 420, -1.5, 0.8))
    mix = dry + wet * mx.get("wet", 1.0)
    if verbose:
        print(f"  残響と混ぜ：{time.time() - st:.1f} 秒")
        print("  楽器ごとの大きさ（dB、そのまま／聞こえ方の重みつき）：" + "  ".join(f"{k} {a:.0f}/{b:.0f}" for k, (a, b) in sorted(levels.items(), key=lambda kv: -kv[1][1])))
    return mix, t0


def master(mix, t0, t_from, t_to, lufs_target=TARGET_LUFS, fade_edges=False, cfg=None):
    st = time.time()
    cfg = cfg or {}
    x = upsample2(mix)
    del mix
    # 穏やかな飽和（低い音がある時に、上の倍音が少しだけ増える。暖かさ）
    drive = cfg.get("drive", 0.55) / (np.abs(x).max() + 1e-9)
    y = np.tanh(x * drive) / drive
    # 音色の仕上げ：声の帯を空ける（1〜4 kHz）。高い所はなだらかに落とす
    if "leveler" in cfg:  # 乾いた音の案：声の帯を少しだけ空け、上は閉じない
        y = filt(y, lambda f: hp(f, 27, 2) * bell(f, 2200, -2.0, 0.8), SR)
    else:
        y = filt(y, lambda f: hp(f, 27, 2) * bell(f, 850, 3.0, 0.7) * bell(f, 2200, -3.0, 0.7) * lp(f, 11000, 2), SR)
    # 低い所は真ん中に（電話やひとつのスピーカーでも低音が消えない）。上は少し広げる
    mid = y.mean(1)
    side = (y[:, 0] - y[:, 1]) / 2
    side = filt(side, lambda f: hp(f, 140, 3) * (1 + 0.12 * (f > 400)), SR)
    y = np.stack([mid + side, mid - side], 1)
    # ゆるいコンプ
    if cfg.get("leveler", True):
        pre = y * db(-8)
        y = leveler(pre, -16.0, 1.35) * db(8)
    a = int(round((t_from - t0) * SR))
    b = min(len(y), int(round((t_to - t0) * SR)))
    y = y[a:b]
    for _ in range(2):
        l_ = lufs_of(y)
        y *= db(lufs_target - l_)
        y, gr = limiter(y)
    if fade_edges:
        fi = max(1, int(cfg.get("fade_in", 1.2) * SR))
        fo = int(2.5 * SR)
        y[:fi] *= (np.linspace(0, 1, fi) ** 1.5)[:, None]
        y[-fo:] *= (np.linspace(1, 0, fo) ** 1.5)[:, None]
    else:
        fo = int(0.5 * SR)
        y[-fo:] *= (np.linspace(1, 0, fo) ** 2)[:, None]
    print(f"  仕上げ：{time.time() - st:.1f} 秒。リミッターは最大 {gr:.2f} dB")
    return y


def write_wav(path, y):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        # ごく小さな揺らぎ（三角の雑音）を足して 16 ビットにする
        rng = np.random.default_rng(5)
        d = (rng.uniform(-0.5, 0.5, y.shape) + rng.uniform(-0.5, 0.5, y.shape))
        w.writeframes(np.clip(y * 32767 + d, -32768, 32767).astype(np.int16).tobytes())


def write_m4a(wav_path, m4a_path):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav_path, "-c:a", "aac_at", "-b:a", "256k", m4a_path], check=True)


def check_clash(song):
    """旋律と和音の声・低音が、短 2 度（短 9 度）でぶつかる所を出す"""
    bad = 0
    for bt, dur, m in song.melody:
        for b0, ln, tok, vp, ve in song.voiced:
            if b0 - 1e-6 <= bt < b0 + ln:
                root, qual, bpc = parse_chord(tok)
                msgs = []
                for v in list(vp) + list(ve):
                    if (m - v) % 12 == 1 and m > v:
                        msgs.append(f"声 {v}")
                if (m - bpc) % 12 == 1:
                    msgs.append("低音")
                if qual in ("maj9", "maj7", "add9", "6", "69") and (m - root) % 12 == 5 and dur >= 1:
                    msgs.append("長和音の 4 度")
                if msgs:
                    bad += 1
                    print(f"  ぶつかり？ {song.tm.t(bt):6.1f} 秒 旋律 {m} 長さ {dur} ／ {tok} ／ {sorted(set(msgs))}")
                break
    print(f"  旋律のぶつかりの候補：{bad} 個")
    bad2 = 0
    for a, b_, m, lev in song.pads.get("strings", []):
        bt = song.tm.beat(a + 0.3)
        for b0, ln, tok, vp, ve in song.voiced:
            if b0 - 1e-6 <= bt < b0 + ln:
                root, qual, bpc = parse_chord(tok)
                hit = [v for v in list(vp) + list(ve) if (m - v) % 12 == 1 and m > v]
                if hit or (m - bpc) % 12 == 1:
                    bad2 += 1
                    print(f"  弦のぶつかり？ {a:6.1f} 秒 音 {m} ／ {tok} ／ {hit}")
                break
    bad3 = 0
    for b0, ln, tok, vp, ve in song.voiced:
        for x in vp:
            for y in ve:
                d = abs(x - y)
                if d % 12 == 1 and d <= 25:
                    bad3 += 1
                    print(f"  層の間のぶつかり？ {song.tm.t(b0):6.1f} 秒 {tok} {sorted(vp)} {sorted(ve)}")
    print(f"  弦のぶつかりの候補：{bad2} 個、層の間：{bad3} 個")


def print_notes(song):
    print(f"案 {song.name}（{PLAN_INFO.get(song.name, '')}）")
    for name, d in song.tm.sec.items():
        dur = d["t1"] - d["t0"]
        print(f"  {name:6s} {d['t0']:6.1f}〜{d['t1']:6.1f} 秒  {d['bars']:3d} 小節  およそ {d['bars'] * 240 / dur:5.1f} 拍／分")
    if hasattr(song, "voiced"):
        names = ["ド", "レ♭", "レ", "ミ♭", "ミ", "ファ", "ソ♭", "ソ", "ラ♭", "ラ", "シ♭", "シ"]
        for b0, ln, tok, vp, ve in song.voiced:
            print(f"  {song.tm.t(b0):6.1f} 秒 {tok:12s} {int(ln):2d} 拍  広がる音 {vp}  電気ピアノ {ve}")
    print(f"  音符 {len(song.notes)} 個")
    check_clash(song)


def main():
    global R
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", default="A")
    ap.add_argument("--preview", action="store_true", help="本体の頭から 45 秒だけ")
    ap.add_argument("--from", dest="t_from", type=float, default=None)
    ap.add_argument("--to", dest="t_to", type=float, default=None)
    ap.add_argument("--out", default=None)
    ap.add_argument("--notes", action="store_true")
    ap.add_argument("--no-m4a", action="store_true")
    ap.add_argument("--icloud", action="store_true", help="m4a を作者の iCloud の 音楽 フォルダへ写す")
    ap.add_argument("--sections", default=None, help="場面の区切りの秒を書いた JSON（{\"sections\": [[名前, 秒], ...], \"end\": 秒}）。なければ上の SECTIONS")
    args = ap.parse_args()
    if args.sections:
        global SECTIONS, END
        import json as _json

        with open(args.sections, encoding="utf8") as _f:
            _d = _json.load(_f)
        SECTIONS = [(str(n), float(t)) for n, t in _d["sections"]]
        END = float(_d["end"])
    if args.plan == "D3":
        R = SR
    if args.plan in PREVIEW_ONLY:
        R = SR  # 小さな刻みに 10 kHz より上を使う
        if not (args.preview or args.notes or args.t_from is not None):
            sys.exit(f"案 {args.plan} は、まだ本体の試聴だけです（--preview）。全長は作者が選んでから作ります")
    song = PLANS[args.plan]()
    if args.notes:
        print_notes(song)
        return
    info = PLAN_INFO.get(args.plan, "")
    if args.preview:
        t_from = song.at("main") - (0.25 if args.plan in PREVIEW_ONLY else 1.0)  # 拾い上げの音が聞こえるよう、少し前から
        t_to = t_from + 45.0
        fname = f"継ぐ_音楽9_案{args.plan}_{info}_試聴45秒"
    elif args.t_from is not None or args.t_to is not None:
        t_from = args.t_from or 0.0
        t_to = args.t_to if args.t_to is not None else END
        fname = f"継ぐ_音楽9_案{args.plan}_{int(t_from)}-{int(t_to)}秒"
    else:
        t_from, t_to = 0.0, END + 0.8
        fname = f"継ぐ_音楽9_案{args.plan}_{info}_全長"
    wav_path = args.out or os.path.join(OUT_DIR, fname + ".wav")
    st = time.time()
    mix, t0 = render(song, t_from, t_to)
    y = master(mix, t0, t_from, t_to, fade_edges=args.preview or args.t_from is not None, cfg=song.mix.get("master"))
    write_wav(wav_path, y)
    l_ = lufs_of(y)
    tp = 20 * math.log10(true_peak_env(y).max() + 1e-12)
    print(f"音楽 {wav_path}：{len(y) / SR:.1f} 秒、{l_:.1f} LUFS、山 {tp:.1f} dBTP（計算 {time.time() - st:.0f} 秒）")
    if not args.no_m4a:
        m4a = os.path.splitext(wav_path)[0] + ".m4a"
        write_m4a(wav_path, m4a)
        if args.icloud:
            os.makedirs(ICLOUD, exist_ok=True)
            shutil.copy2(m4a, ICLOUD)
            print("写した：", ICLOUD)


if __name__ == "__main__":
    sys.exit(main())
