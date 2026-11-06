# 最終案 12 の音楽の、別の案（自作。外の曲・外の音・外の音源は使わない。どの音も、ここと bgm9.py で、式から計算で作る）。
# 作者の声（2026-11-06）：今の案 D3 は「おごそかでいい感じ。でもちょっと暗いかな」。
# → 品は残して、少し明るく・温かく・望みのある案を 3 つ。案 D3（bgm9.py）は変えない。楽器・残響・仕上げは bgm9.py のものをそのまま使う。
#   あかり（akari）：D3 と同じ音型 A E D A を、ニ長調の和音（3 度の入った低音）で。温かい広がる音を薄く敷き、やわらかいチェレスタが時々こたえる。
#   歩み（ayumi）  ：軽く澄んだ版。渡す 1・2 の章だけ、弱いピアノの 8 分の刻みが歩くように進む（渡す 3 では 4 分に減る）。
#   夜明け（yoake）：序と残すは D3 と同じおごそかさ。渡す 1 の頭で低音がニ長調へ開き、広がる音とチェレスタが入って、終わりまで明るくなる。
# 2 回目（作者は「夜明け」がいちばん、次の時代へで開けるのがいい）：
#   澄んだ夜明け（sumi）：夜明けの流れのまま、ピアノを澄んだ音色で前に。広がる音と残響は控えめ。次の時代へはピアノの 1 オクターブ上で開ける。
#   日の出（hinode）    ：夜明けの流れに低い弦の持続音を足して、映画のように厚く。次の時代へで高い弦がふくらんで大きく開き、結は静かに収める。
#   余白（yohaku）      ：少しちがう向き。静かで現代的。明るい和音のピアノが間をたっぷり取って鳴り、やわらかい鈴（新しい楽器）がときどき光る。
# 映像とは合わせない：変わるのは章の頭（曲の大きな区切り）だけ。拍に合わせて字を出したり、打つ音で切り替えたりしない。キック・上がる音はなし。
# 章の秒は video/final10.json の music.sections と chapters から読む（変えない）。長さのない段（次の段が先に始まる）は、次の段に入れる。
# 使い方（リポジトリの上で）：
#   nice -n 10 video/work/.venv/bin/python -I video/bgm10.py --plan akari                全長 → video/work/music10/akari.wav
#   nice -n 10 video/work/.venv/bin/python -I video/bgm10.py --plan akari --from 30 --to 75   好きな所だけ（試聴）
#   nice -n 10 video/work/.venv/bin/python -I video/bgm10.py --film video/work/music10/akari.wav --name あかり
#       → 曲を final9.py と同じ混ぜ方（声で下げる・-14 LUFS）で声と混ぜ、今のスマホ用の絵（映像は作り直さない）に載せる
# 映画に入れるには：video/work/music10/<案>.wav を video/work/music9/song.wav に写して、いつものとおり final9.py --plan 10 で組む。
import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)  # -I でも bgm9 を読む

import numpy as np  # noqa: E402

import bgm9 as B  # noqa: E402
from bgm9 import F32, TWO_PI, bell, cents, hp, hz, lp, osc, raised  # noqa: E402

WORK = os.environ.get("TSUGU_VIDEO_WORK", os.path.join(HERE, "work"))
OUT_DIR = os.path.join(WORK, "music10")
PLAN_JSON = os.path.join(HERE, "final10.json")
PICTURE = os.path.join(WORK, "vc", "継ぐ_デモ_最終案10_仮声_スマホ.mp4")
ICLOUD = os.path.expanduser("~/Library/Mobile Documents/com~apple~CloudDocs/継ぐ動画/BGM比べ")


# ================================================================ 章の秒
def load_sections(path):
    """台本の JSON から、曲の区切り・終わり・章の頭を読む"""
    with open(path, encoding="utf8") as f:
        tl = json.load(f)
    mu = tl.get("music", tl)
    secs = [(str(n), float(t)) for n, t in mu["sections"]]
    return secs, float(mu["end"]), tl.get("chapters", {})


def clean_sections(secs, end, chapters):
    """長さのない段を落とし（例：build 149.9 → peak 149.7 なら、山に入れる）、本体を渡す 1・渡す 2 の頭で分ける"""
    out = []
    for i, (n, t) in enumerate(secs):
        t1 = secs[i + 1][1] if i + 1 < len(secs) else end
        if t1 - t >= 0.5:
            out.append((n, t))
    for key, nm in (("渡す1", "pass"), ("渡す2", "learn")):
        t = chapters.get(key)
        if t is None:
            continue
        for i, (n, t0) in enumerate(out):
            t1 = out[i + 1][1] if i + 1 < len(out) else end
            if n in ("main", "pass") and t0 + 4 < t < t1 - 4:
                out.insert(i + 1, (nm, float(t)))
                break
    return out


class BeatMap(B.TimeMap):
    """bgm9 の TimeMap と同じ考え。ただし段の長さを、小節でなく拍の単位で合わせる（速さの揺れが小さい）"""

    def __init__(self, bpm, sections, end, rit=None):
        self.bpm = bpm
        self.sec = {}
        rit = rit or {}
        knots_b, knots_t = [], []
        beat = 0.0
        for i, (name, t0) in enumerate(sections):
            t1 = sections[i + 1][1] if i + 1 < len(sections) else end
            beats = max(2, int(round((t1 - t0) * bpm / 60.0)))
            self.sec[name] = dict(t0=t0, t1=t1, b0=beat, bars=beats / 4.0, beats=beats, name=name)
            u = np.linspace(0, 1, 257)
            a, start = rit.get(name, (0.0, 0.0))
            m = 1 + a * np.clip((u - start) / max(1e-6, 1 - start), 0, 1) ** 2
            g = np.concatenate([[0], np.cumsum((m[1:] + m[:-1]) / 2)])
            g /= g[-1]
            knots_b.append(beat + u * beats)
            knots_t.append(t0 + g * (t1 - t0))
            beat += beats
        self.B = np.concatenate(knots_b)
        self.T = np.concatenate(knots_t)
        self.total_beats = beat
        slope = (self.T[-1] - self.T[-2]) / (self.B[-1] - self.B[-2])
        self.B = np.concatenate([self.B, [self.B[-1] + 400]])
        self.T = np.concatenate([self.T, [self.T[-1] + 400 * slope]])
        keep = np.concatenate([[True], np.diff(self.B) > 1e-9])
        self.B, self.T = self.B[keep], self.T[keep]


# ================================================================ 新しい楽器：やわらかいチェレスタ（鉄の板を、フェルトのばちで）
def celesta(m, v, dur_s, rng, pan=0.0):
    """鉄の板の音。共鳴の箱で基音が強く、上の部分音（倍音でない 2.76・5.4 倍）は早く消える。左右で少しずらす"""
    R = B.R
    f0 = hz(m) * cents(rng.normal(0, 0.5))
    v = float(np.clip(v, 0.03, 1.0))
    t, n = B.note_time(dur_s, 1.4)
    T = 1.7 * 2 ** (-(m - 72) / 24)
    parts = ((1.0, 1.0, 1.0), (2.0, 0.06 + 0.05 * v, 0.42), (2.76, 0.025 + 0.03 * v, 0.2), (5.4, 0.006 + 0.02 * v * v, 0.07))
    out = np.zeros((n, 2))
    for c, det in enumerate((-1.4, 1.4)):
        x = np.zeros(n, F32)
        for r, a, d in parts:
            fk = f0 * r * rng.uniform(0.9995, 1.0005)
            if fk > min(11000, 0.45 * R):
                continue
            x += a * osc(fk * cents(det), t, rng.uniform(0, 0.03)) * np.exp(-t / (T * d)).astype(F32)
        out[:, c] = x
    nt = min(n, int(0.02 * R))
    tap = B.filt(rng.standard_normal(nt), lambda f: hp(f, 1500, 1) * lp(f, 7000, 1))
    tap = tap / (np.abs(tap).max() + 1e-9) * np.exp(-t[:nt] / 0.002) * (0.004 + 0.012 * v)
    env = raised(t, 0.0015 + 0.002 * (1 - v))
    i_rel = int(dur_s * R)
    if i_rel < n:
        env[i_rel:] *= np.exp(-(t[i_rel:] - dur_s) / 0.35)
    env[-int(0.03 * R):] *= np.linspace(1, 0, int(0.03 * R))
    out *= env[:, None] * (0.2 + 0.8 * v) * 0.7
    out[:nt] += tap[:, None]
    gl, gr = math.cos((pan + 1) * math.pi / 4) * 1.4142, math.sin((pan + 1) * math.pi / 4) * 1.4142
    out[:, 0] *= gl
    out[:, 1] *= gr
    return out


B.INSTR["celesta"] = celesta
# 温かい広がる音：bgm9 の warm より、高い所をもう少し閉じ、低い所の厚みを少し（ピアノの下に薄く敷くだけ）
B.TIMBRES["glow"] = dict(bw=12, bwk=0.6, tilt=1.05, fc=(800, 2000), order=1.4, form=[(380, 2.0, 0.9)], fmax=6000)


# ================================================================ 和音（ニ長調）。低い 2 音（根音とその上）・広がる音の 3 声
# 旋律の音型 A4 E5 D5 と短 9 度でぶつからない並べ方だけ（G#・D#・C# を下に置かない）
CH = {
    "D": (38, 50, (54, 57, 64)),    # D add9：F#3 A3 E4
    "G": (43, 55, (59, 62, 66)),    # G maj7：B3 D4 F#4
    "G2": (31, 43, (59, 62, 64)),   # G 6/9（深い G1）：B3 D4 E4
    "Bm": (35, 47, (57, 62, 66)),   # Bm7：A3 D4 F#4
    "DF": (42, 54, (57, 62, 64)),   # D/F#：A3 D4 E4
    "Em": (40, 52, (55, 59, 66)),   # Em9：G3 B3 F#4
    "As": (45, 57, (59, 62, 64)),   # A9sus：B3 D4 E4
    "D0": (38, 50, (54, 57, 62)),   # D：F#3 A3 D4
}
MOTIF = [(0, 69, 0.50), (6, 76, 0.40), (12, 74, 0.44), (20, 69, 0.34)]  # D3 と同じ音型（16 分の位置・音・強さ）
D3_ROOTS = [None, (29, 41), (34, 46), (31, 43), (38, 50), (34, 46), (36, 48), (29, 41)]  # D3 の低音（F・B♭・G・D …）


def pan_of(m):
    return float(np.clip((m - 62) / 70, -0.22, 0.22))


class Kit:
    """3 つの案に共通の書き方。ピアノの音型・低音・広がる音・チェレスタ・弱い脈"""

    def __init__(self, s, mute=1.25):
        self.s = s
        self.mute = mute

    def hit(self, bt, m, v, beats=14.0, mute=None, bus="piano", sub=0.0):
        self.s.note("piano", bus, bt, beats, m, v, late_ms=0, jit_ms=5, pan=pan_of(m), mute=self.mute if mute is None else mute, top=11000.0, click=1.0, sub=sub, spread_lr=0.2)

    def low(self, bt, ch, level=1.0, beats=14.0, sub=0.6):
        lo, hi, _ = CH[ch] if isinstance(ch, str) else (ch[0], ch[1], None)
        self.hit(bt, lo, 0.40 * level, beats=beats, mute=0.9, bus="pianolow", sub=sub)
        self.hit(bt + 0.01, hi, 0.16 * level, beats=beats, mute=0.9, bus="pianolow")

    def motif(self, bt, level=1.0, cut=4, octave=0.0, last_long=0.0):
        for j, (st, m, v) in enumerate(MOTIF[:cut]):
            long_ = last_long if (j == 3 and last_long) else 14.0
            self.hit(bt + st / 4, m, v * level * self.s.rng.uniform(0.96, 1.04), beats=long_)
            if octave > 0:
                self.hit(bt + st / 4 + 0.004, m + 12, v * level * octave, beats=long_)

    def pad(self, b0, b1, ch, level=1.0, layer="glow"):
        for k, m in enumerate(CH[ch][2]):
            self.s.pad(layer, b0, b1, m, level * (0.85 if k == 0 else 1.0))

    def cel(self, bt, notes, level=1.0, beats=6.0):
        """チェレスタ：[(拍のずれ, 音, 強さ), ...]"""
        for d, m, v in notes:
            self.s.note("celesta", "cel", bt + d, beats, m, v * level * self.s.rng.uniform(0.92, 1.06), late_ms=6, jit_ms=6, pan=float(np.clip((m - 80) / 30, -0.35, 0.35)))

    def pulse(self, b0, beats, notes=(57,), g0=1.0, g1=1.0, skip=lambda bar: False, base=0.17):
        """D3 と同じ、布をかけたような弱い 4 分の脈（notes を順に）"""
        bars = int(math.ceil(beats / 4))
        for bar in range(bars):
            if skip(bar):
                continue
            g = g0 + (g1 - g0) * (bar / max(1, bars - 1))
            for q, pv in enumerate((1.0, 0.62, 0.82, 0.62)):
                if bar * 4 + q >= beats:  # 段の端の、半端な小節
                    break
                m = notes[(bar * 4 + q) % len(notes)]
                self.s.note("piano", "pulse", b0 + bar * 4 + q, 0.35, m, base * g * pv * self.s.rng.uniform(0.9, 1.1), jit_ms=4, mute=0.55, rel_s=0.09)

    def phrases(self, name, cycle, start=0, level=1.0, octave_every=4, cut_every=0, low_level=1.0, pad_level=1.0, pad=True, cel=None, low=True):
        """段を 4 小節ごとの音型で埋める。和音は cycle を順に。音型が入りきらない端は、前の和音をのばす"""
        d = self.s.sec(name)
        b0, nbeat = d["b0"], d["beats"]
        starts = [b for b in range(0, nbeat, 16) if b + 8 <= nbeat] or [0]
        for i, rb in enumerate(starts):
            ch = cycle[(start + i) % len(cycle)]
            nxt = starts[i + 1] if i + 1 < len(starts) else nbeat
            bt = b0 + rb
            oc = 0.34 if (octave_every and i % octave_every == 0 and i > 0) else 0.0
            cut = 3 if (cut_every and i % cut_every == cut_every - 1) else 4
            self.motif(bt, level=level, cut=cut, octave=oc)
            if low:
                self.low(bt, ch, level=low_level)
            if pad:
                self.pad(bt, b0 + nxt, ch, level=pad_level)
            if cel is not None:
                cel(i, bt, ch)
        return starts


def standard_mix(s, hall=(3.4, 3.9, 2.5, 0.03), piano_dip=-5.0, extra_bus=None, extra_eq=None):
    bus = dict(piano=dict(hall=0.22, plate=0.10, body=0.25), pianolow=dict(hall=0.14, plate=0.06, body=0.3), pulse=dict(hall=0.03, plate=0.05),
               glow=dict(hall=0.20, plate=0.03, drift=(0.5, 0.23)), cel=dict(hall=0.36, plate=0.08, delay=0.10), walk=dict(hall=0.08, plate=0.08, body=0.2))
    eq = dict(
        piano=lambda f: hp(f, 60, 2) * bell(f, 1700, piano_dip, 1.2) * lp(f, 14000, 1),  # 声の帯を空ける（D3 より少し浅く）
        pianolow=lambda f: hp(f, 30, 2) * lp(f, 5000, 1),
        pulse=lambda f: hp(f, 90, 2) * lp(f, 6000, 1),
        glow=lambda f: hp(f, 110, 2) * bell(f, 1900, -4.0, 1.0) * lp(f, 6000, 2),
        cel=lambda f: hp(f, 420, 2) * bell(f, 2600, -3.0, 1.0) * lp(f, 12000, 1),
        walk=lambda f: hp(f, 110, 2) * bell(f, 1800, -5.0, 1.1) * lp(f, 9000, 1),
    )
    bus.update(extra_bus or {})
    eq.update(extra_eq or {})
    s.mix = dict(bus=bus, eq=eq, hall=hall, plate=(0.5, 0.6, 0.4, 0.006), delay_beats=1.5, delay_fb=0.3, wet_hi=12000,
                 master=dict(drive=0.25, fade_in=0.04, leveler=False))


def glow_cfg(s, pts):
    s.pad_cfg["glow"] = dict(timbre="glow", att=2.2, rel=3.0, width=1.0, bright=s.curve(pts, lfo=0.06, period=47.0))


def has(s, name):
    return name in s.tm.sec


# ================================================================ 案 あかり
def plan_akari(sections, end):
    """D3 の音型をニ長調の和音で。温かい広がる音を薄く敷き、渡すの章からチェレスタが時々こたえる。脈は D3 と同じ弱さ"""
    s = B.Song("akari", 1201, 96)
    s.tm = BeatMap(96, sections, end, rit={"end": (0.5, 0.3)})
    k = Kit(s, mute=1.55)
    a = s.at
    # 序：低い D から。広がる音がゆっくり入る。音型は 2 回
    d = s.sec("intro")
    b0, nb = d["b0"], d["beats"]
    k.low(b0 + 1, "D", beats=22.0, sub=0.7)
    k.pad(b0, b0 + 24, "D")
    k.motif(b0 + 8, level=0.84)
    if nb >= 30:
        k.low(b0 + 24, "G", level=0.9)
        k.pad(b0 + 24, b0 + nb, "G")
        k.motif(b0 + 24, level=0.86)
    # 残す
    k.phrases("main", ["D", "Bm"], level=1.0)
    k.pulse(s.sec("main")["b0"] + 8, s.sec("main")["beats"] - 8, notes=(57,), g0=0.6, g1=1.0)

    # 渡す 1・2：チェレスタが 1 つおきに答える。脈は A3 と D4・E4 を行き来する
    def answer(i, bt, ch):
        if i % 2 == 1:
            figs = [[(9.0, 78, 0.34), (10.0, 81, 0.30), (11.5, 88, 0.26)], [(9.0, 81, 0.32), (10.0, 78, 0.28), (11.5, 86, 0.24)]]
            k.cel(bt, figs[(i // 2) % 2])

    cyc = ["D", "G", "Bm", "G2", "DF", "Em", "As", "D"]
    n1 = len(k.phrases("pass", cyc, cel=answer))
    if has(s, "learn"):
        k.phrases("learn", cyc, start=n1, cel=answer)
    for nm in ("pass", "learn"):
        if has(s, nm):
            dd = s.sec(nm)
            k.pulse(dd["b0"], dd["beats"], notes=(57, 64, 62, 64), skip=lambda bar: bar % 16 in (14, 15))
    # 渡す 3（次の時代へ）：脈を抜く。暗くはしない（音型は最後まで鳴る）
    k.phrases("thin", ["G", "DF", "Em", "As"], level=0.82, low_level=0.85, octave_every=0)
    # 途絶えても：薄い D の和音と 1 音だけ
    d = s.sec("gap")
    k.pad(d["b0"], d["b0"] + d["beats"], "D0", level=0.8)
    k.hit(d["b0"] + 2, 69, 0.22, beats=10.0)
    k.cel(d["b0"] + 6, [(0, 81, 0.16)], beats=8.0)
    # 山（復元）：1 オクターブ上を重ね、チェレスタも音型をなぞる。IV → V で、結の I へ向かう
    for nm in ("build", "peak"):
        if not has(s, nm):
            continue

        def dbl(i, bt, ch):
            k.cel(bt, [(st / 4, m + 12, v * 0.55) for st, m, v in MOTIF], beats=8.0)

        k.phrases(nm, ["G2", "As"], level=1.05, octave_every=1, cel=dbl, low_level=1.05)
        dd = s.sec(nm)
        k.pulse(dd["b0"], dd["beats"], notes=(57, 64, 62, 64), g0=1.0, g1=0.6)
    # 結：D に落ち着く。最後の音だけ長く、チェレスタが 1 つだけ光る
    d = s.sec("end")
    b0 = d["b0"]
    for st, m, v in MOTIF[:3]:
        k.hit(b0 + st / 4, m, v * 0.9)
    k.hit(b0 + MOTIF[3][0] / 4, 69, 0.36, beats=24.0)
    k.low(b0, "D", beats=28.0, sub=0.8)
    k.pad(b0, b0 + d["beats"] - 2, "D")
    k.cel(b0 + 8, [(0, 78, 0.22), (1.5, 81, 0.18)], beats=10.0)
    glow_cfg(s, [(0, 0.15), (a("main"), 0.3), (a("pass"), 0.45), (a("thin"), 0.35), (a("gap"), 0.2), (a("peak"), 0.7), (a("end"), 0.45), (end, 0.2)])
    s.auto("piano", [(0, -8)])
    s.auto("pianolow", [(0, -7)])
    s.auto("pulse", [(0, -19)])
    s.auto("glow", [(0, -62), (a("intro", 0.4), -40), (a("intro", 1.0), -35), (a("main"), -34), (a("pass"), -33), (a("thin"), -35), (a("thin", 0.9), -38), (a("gap"), -38), (a("peak"), -31.5), (a("end", 0.4), -34), (end, -60)])
    s.auto("cel", [(0, -9)])
    standard_mix(s)
    return s


# ================================================================ 案 歩み
WALK = {  # 8 分の刻みの 3 音（低・中・高）。D4〜E4 より上は空ける（音型の場所）
    "D": (50, 57, 64), "G": (55, 62, 64), "G2": (55, 62, 64), "Bm": (50, 54, 57), "DF": (54, 57, 62), "Em": (52, 59, 62), "As": (52, 57, 62), "D0": (50, 57, 62),
}
WALK_FORM = [(0, 1.0), (1, 0.55), (2, 0.78), (1, 0.52), (0, 0.84), (1, 0.55), (2, 0.72), (1, 0.5)]


def plan_ayumi(sections, end):
    """軽く澄んだ版。ピアノだけ（広がる音は使わない）。渡す 1・2 だけ、弱い 8 分の刻みが歩く。渡す 3 では 4 分に減り、途絶えでやむ。山で戻る"""
    s = B.Song("ayumi", 1302, 100)
    s.tm = BeatMap(100, sections, end, rit={"end": (0.45, 0.3)})
    k = Kit(s, mute=1.6)
    a = s.at

    def walk(name, cycle, start=0, quarter=False, g0=1.0, g1=1.0, half=8):
        """和音は 2 小節ごと。最初の 1 小節は弱く入る"""
        d = s.sec(name)
        b0, nb = d["b0"], d["beats"]
        nbar = int(math.ceil(nb / 4))
        for bar in range(nbar):
            ch = cycle[(start + bar // 2) % len(cycle)]
            g = (g0 + (g1 - g0) * bar / max(1, nbar - 1)) * (0.6 if (bar == 0 and start == 0) else 1.0)
            for e, (w, pv) in enumerate(WALK_FORM):
                if quarter and e % 2:
                    continue
                if bar * 4 + e * 0.5 >= nb:  # 段の端の、半端な小節
                    break
                m = WALK[ch][w]
                s.note("piano", "walk", b0 + bar * 4 + e * 0.5, 0.45, m, 0.30 * g * pv * s.rng.uniform(0.9, 1.08), late_ms=3, jit_ms=4, pan=float(np.clip((m - 57) / 40, -0.25, 0.25)), mute=0.85, rel_s=0.14, top=9000.0)

    def two(name, cycle, start=0, level=1.0, octave_every=4):
        """4 小節の音型に、和音 2 つ（2 小節ずつ）"""
        d = s.sec(name)
        b0, nb = d["b0"], d["beats"]
        starts = [b for b in range(0, nb, 16) if b + 8 <= nb] or [0]
        for i, rb in enumerate(starts):
            c1, c2 = cycle[(start + 2 * i) % len(cycle)], cycle[(start + 2 * i + 1) % len(cycle)]
            k.motif(b0 + rb, level=level, octave=0.3 if (octave_every and i % octave_every == 0 and i > 0) else 0.0)
            k.low(b0 + rb, c1, beats=7.5, level=0.85, sub=0.4)
            if rb + 8 < nb:
                k.low(b0 + rb + 8, c2, beats=7.5, level=0.7, sub=0.4)
        return len(starts)

    # 序：低い D と音型。静かだが暗くしない
    d = s.sec("intro")
    b0, nb = d["b0"], d["beats"]
    k.low(b0 + 1, "D", beats=22.0, sub=0.5)
    k.motif(b0 + 8, level=0.84)
    if nb >= 30:
        k.low(b0 + 24, "G", level=0.85, sub=0.4)
        k.motif(b0 + 24, level=0.86)
    # 残す：音型と、2 小節ごとの低音だけ
    two("main", ["D", "Bm", "G", "As"])
    # 渡す 1・2：8 分の刻みが歩く
    cyc = ["D", "G", "Bm", "As", "G", "DF", "Em", "As"]
    n1 = two("pass", cyc)
    walk("pass", cyc, g0=0.8, g1=1.0)
    if has(s, "learn"):
        two("learn", cyc, start=2 * n1)
        walk("learn", cyc, start=int(s.sec("pass")["beats"] // 8))
    # 渡す 3：4 分に減る
    two("thin", ["G", "DF", "Em", "As"], level=0.85, octave_every=0)
    walk("thin", ["G", "DF", "Em", "As"], quarter=True, g0=0.8, g1=0.45)
    # 途絶えても：低い D と 1 音
    d = s.sec("gap")
    k.low(d["b0"], "D0", level=0.4, beats=12.0, sub=0.3)
    k.hit(d["b0"] + 2, 69, 0.22, beats=10.0)
    # 山：刻みが戻り、音型は 1 オクターブ上を重ねる
    for nm in ("build", "peak"):
        if has(s, nm):
            two(nm, ["G", "As", "Bm", "As"], level=1.05, octave_every=1)
            walk(nm, ["G", "As", "Bm", "As"], g0=0.9, g1=0.75)
    # 結：D に落ち着く
    d = s.sec("end")
    b0 = d["b0"]
    for st, m, v in MOTIF[:3]:
        k.hit(b0 + st / 4, m, v * 0.9)
    k.hit(b0 + MOTIF[3][0] / 4, 69, 0.36, beats=24.0)
    k.hit(b0 + 8, 66, 0.20, beats=20.0)  # F#4：長調の 3 度を最後に置く
    k.low(b0, "D", beats=28.0, sub=0.6)
    s.auto("piano", [(0, -8)])
    s.auto("pianolow", [(0, -7.5)])
    s.auto("walk", [(0, -17.5), (a("thin"), -18.5), (a("peak"), -17)])
    standard_mix(s, hall=(2.7, 3.0, 2.0, 0.025), piano_dip=-5.0, extra_bus=dict(piano=dict(hall=0.17, plate=0.10, body=0.25)))
    return s


# ================================================================ 案 夜明け
def plan_yoake(sections, end):
    """序と残すは D3 と同じ（同じ音型・同じ低音・同じ脈）。渡す 1 の頭で低音が G → D とニ長調へ開き、広がる音が入る。
    渡す 2 からチェレスタが答え、渡す 3 でも音型は最後まで鳴る。山で 1 オクターブ上とチェレスタ、結は D の和音で終わる"""
    s = B.Song("yoake", 906, 96)
    s.tm = BeatMap(96, sections, end, rit={"end": (0.5, 0.3)})
    k = Kit(s, mute=1.25)
    a = s.at

    def d3_phrase(bt, idx, level=1.0, cut=4, octave=0.0, root=True):
        k.motif(bt, level=level, cut=cut, octave=octave)
        r = D3_ROOTS[idx % len(D3_ROOTS)]
        if root and r is not None:
            k.low(bt, r, level=level, sub=0.75)

    # 序：D3 と同じ
    d = s.sec("intro")
    b0, nb = d["b0"], d["beats"] // 4
    k.hit(b0 + 1, 29, 0.42, beats=20.0, mute=0.9, bus="pianolow", sub=0.8)
    k.hit(b0 + 1.01, 41, 0.15, beats=20.0, mute=0.9, bus="pianolow")
    d3_phrase(b0 + 8, 0, level=0.82, root=False)
    if nb >= 8:
        d3_phrase(b0 + 8 + 16 + (nb - 8) * 2, 1, level=0.86)
    # 残す：D3 と同じ（4 小節に 1 回。低音は B♭ → G）
    d = s.sec("main")
    b0, nbeat = d["b0"], d["beats"]
    for idx, rb in enumerate(b for b in range(0, nbeat, 16) if b + 8 <= nbeat):
        d3_phrase(b0 + rb, idx + 2)
    k.pulse(b0 + 8, nbeat - 8)

    # 渡す 1 から：ニ長調へ。ピアノの音色も少しずつ明るく（フェルトを薄く）
    def answer(i, bt, ch):
        if i % 2 == 1:
            figs = [[(9.0, 78, 0.32), (10.0, 81, 0.28), (11.5, 88, 0.24)], [(9.0, 81, 0.30), (10.0, 78, 0.27), (11.5, 86, 0.22)]]
            k.cel(bt, figs[(i // 2) % 2])

    cyc = ["D", "G", "Bm", "G2", "DF", "Em", "As", "D"]
    k.mute = 1.4
    n1 = len(k.phrases("pass", cyc))
    if has(s, "learn"):
        k.mute = 1.55
        k.phrases("learn", cyc, start=n1, cel=answer)
    for nm, notes in (("pass", (57,)), ("learn", (57, 64, 62, 64))):
        if has(s, nm):
            dd = s.sec(nm)
            k.pulse(dd["b0"], dd["beats"], notes=notes, skip=lambda bar: bar % 16 in (14, 15))
    # 渡す 3：脈を抜く。でも音型は帰ってくる
    k.phrases("thin", ["G", "DF", "Em", "As"], level=0.82, low_level=0.85, octave_every=0)
    # 途絶えても
    d = s.sec("gap")
    k.pad(d["b0"], d["b0"] + d["beats"], "D0", level=0.75)
    k.hit(d["b0"] + 2, 69, 0.22, beats=10.0)
    # 山
    for nm in ("build", "peak"):
        if not has(s, nm):
            continue

        def dbl(i, bt, ch):
            k.cel(bt, [(st / 4, m + 12, v * 0.5) for st, m, v in MOTIF], beats=8.0)

        k.phrases(nm, ["G2", "As"], level=1.05, octave_every=1, cel=dbl, low_level=1.05)
        dd = s.sec(nm)
        k.pulse(dd["b0"], dd["beats"], notes=(57, 64, 62, 64), g0=1.0, g1=0.6)
    # 結
    d = s.sec("end")
    b0 = d["b0"]
    for st, m, v in MOTIF[:3]:
        k.hit(b0 + st / 4, m, v * 0.9)
    k.hit(b0 + MOTIF[3][0] / 4, 69, 0.36, beats=24.0)
    k.low(b0, "D", beats=28.0, sub=0.8)
    k.pad(b0, b0 + d["beats"] - 2, "D")
    k.cel(b0 + 8, [(0, 78, 0.2), (1.5, 81, 0.16)], beats=10.0)
    glow_cfg(s, [(0, 0.1), (a("pass"), 0.2), (a("learn") if has(s, "learn") else a("thin"), 0.45), (a("thin"), 0.4), (a("gap"), 0.25), (a("peak"), 0.7), (a("end"), 0.45), (end, 0.2)])
    s.auto("piano", [(0, -8)])
    s.auto("pianolow", [(0, -7)])
    s.auto("pulse", [(0, -19)])
    # 広がる音：渡す 1 の頭から 8 小節ほどかけて入る（目立つ切り替えにしない）
    s.auto("glow", [(0, -72), (a("pass"), -72), (a("pass") + 2, -48), (a("pass") + 20, -35), (a("thin"), -34), (a("thin", 0.9), -37), (a("gap"), -38), (a("peak"), -31.5), (a("end", 0.4), -34), (end, -60)])
    s.auto("cel", [(0, -9.5)])
    standard_mix(s, hall=(3.6, 4.2, 2.6, 0.03), piano_dip=-6.0)
    return s


# ================================================================ 2 回目の 3 案（2026-11-06）
# 作者の声：3 つの中では「夜明け」がいちばんいい。次の時代へ（2:00 ごろ）で開けるのがいい。序はおごそかで、だんだん明るく。
# → 夜明けの向きで、性格のちがう案を 2 つ（澄んだ夜明け・日の出）と、少しちがう向きの案を 1 つ（余白）。
#   上の 3 案（あかり・歩み・夜明け）は変えない。ここから下は、新しい案だけが使う。


# ---------------------------------------------------------------- 新しい楽器：やわらかい鈴（小さな鈴を、やわらかく鳴らす）
def suzu(m, v, dur_s, rng, pan=0.0):
    """小さな鈴の音。部分音は倍音でない（1・2.71・5.15 倍）。どの部分音も 2 本にわずかに分かれ、ゆっくりうなる（ゆらぐ光）。
    たたく音はごく小さく、立ち上がりは少しだけ丸い（チェレスタより長く、やわらかく残る）"""
    R = B.R
    f0 = hz(m) * cents(rng.normal(0, 0.6))
    v = float(np.clip(v, 0.03, 1.0))
    t, n = B.note_time(dur_s, 2.6)
    T = 2.6 * 2 ** (-(m - 84) / 30)
    parts = ((1.0, 1.0, 1.0, 0.45), (2.0, 0.05, 0.5, 0.4), (2.71, 0.09 + 0.06 * v, 0.34, 0.5), (5.15, 0.02 + 0.03 * v * v, 0.12, 0.5))
    out = np.zeros((n, 2))
    for c, side in enumerate((-1.0, 1.0)):
        x = np.zeros(n, F32)
        for r, a, d, split in parts:
            fk = f0 * r * rng.uniform(0.9997, 1.0003)
            if fk > min(11000, 0.45 * R):
                continue
            env = np.exp(-t / (T * d)).astype(F32)
            for s_ in (-1.0, 1.0):  # 2 本に分かれる（左右で逆の位相のうなり）
                x += 0.5 * a * osc(fk * cents(split * s_ + 0.6 * side), t, rng.uniform(0, 1)) * env
        out[:, c] = x
    nt = min(n, int(0.015 * R))
    tap = B.filt(rng.standard_normal(nt), lambda f: hp(f, 2500, 1) * lp(f, 9000, 1))
    tap = tap / (np.abs(tap).max() + 1e-9) * np.exp(-t[:nt] / 0.0015) * (0.002 + 0.006 * v)
    env = raised(t, 0.004 + 0.004 * (1 - v))
    i_rel = int(dur_s * R)
    if i_rel < n:
        env[i_rel:] *= np.exp(-(t[i_rel:] - dur_s) / 0.9)
    env[-int(0.05 * R):] *= np.linspace(1, 0, int(0.05 * R))
    out *= env[:, None] * (0.25 + 0.75 * v) * 0.55
    out[:nt] += tap[:, None]
    gl, gr = math.cos((pan + 1) * math.pi / 4) * 1.4142, math.sin((pan + 1) * math.pi / 4) * 1.4142
    out[:, 0] *= gl
    out[:, 1] *= gr
    return out


B.INSTR["suzu"] = suzu
# 低い弦（チェロとコントラバスを、ひとかたまりに）：低い所に厚み、高い所は閉じる
B.TIMBRES["cello"] = dict(bw=14, bwk=0.62, tilt=0.95, fc=(650, 1900), order=1.4, form=[(240, 3.0, 0.8), (620, 2.0, 0.6)], fmax=6000)
# 高い弦（ヴァイオリンとヴィオラ）：明るいが、声の帯（2 kHz あたり）は少し引く
B.TIMBRES["violins"] = dict(bw=20, bwk=0.7, tilt=0.9, fc=(1400, 3600), order=1.3, form=[(560, 2.0, 0.7), (1250, 2.0, 0.6), (2300, -3.0, 0.9)], fmax=9000)


class ClearKit(Kit):
    """澄んだピアノ：フェルトを薄く（明るい）、打った瞬間の近さを少し、弦の左右の広がりは狭く（輪郭がはっきり）"""

    def __init__(self, s, mute=1.6, click=1.4, spread=0.1):
        super().__init__(s, mute)
        self.click = click
        self.spread = spread

    def hit(self, bt, m, v, beats=14.0, mute=None, bus="piano", sub=0.0):
        self.s.note("piano", bus, bt, beats, m, v, late_ms=0, jit_ms=4, pan=pan_of(m), mute=self.mute if mute is None else mute, top=11000.0,
                    click=self.click if bus == "piano" else 0.5, sub=sub, spread_lr=self.spread)


def phrase_list(s, name):
    d = s.sec(name)
    return d["b0"], d["beats"], ([b for b in range(0, d["beats"], 16) if b + 8 <= d["beats"]] or [0])


def phrases2(k, name, cycle, start=0, level=1.0, octave=lambda i: 0.0, low_level=1.0, pad_level=1.0, pad=True, cel=None, sub=0.6):
    """Kit.phrases と同じ書き方で、オクターブ上を重ねる所を自由に決める（新しい案だけが使う）"""
    s = k.s
    b0, nbeat, starts = phrase_list(s, name)
    for i, rb in enumerate(starts):
        ch = cycle[(start + i) % len(cycle)]
        nxt = starts[i + 1] if i + 1 < len(starts) else nbeat
        bt = b0 + rb
        k.motif(bt, level=level, octave=octave(i))
        k.low(bt, ch, level=low_level, sub=sub)
        if pad:
            k.pad(bt, b0 + nxt, ch, level=pad_level)
        if cel is not None:
            cel(i, bt, ch)
    return len(starts)


def d3_opening(s, k, pulse_gain=(1.0, 1.0)):
    """序と残す：D3 と同じ（夜明けと同じ）。おごそかな始まり"""
    def d3_phrase(bt, idx, level=1.0, root=True):
        k.motif(bt, level=level)
        r = D3_ROOTS[idx % len(D3_ROOTS)]
        if root and r is not None:
            k.low(bt, r, level=level, sub=0.75)

    d = s.sec("intro")
    b0, nb = d["b0"], d["beats"] // 4
    k.hit(b0 + 1, 29, 0.42, beats=20.0, mute=0.9, bus="pianolow", sub=0.8)
    k.hit(b0 + 1.01, 41, 0.15, beats=20.0, mute=0.9, bus="pianolow")
    d3_phrase(b0 + 8, 0, level=0.82, root=False)
    if nb >= 8:
        d3_phrase(b0 + 8 + 16 + (nb - 8) * 2, 1, level=0.86)
    d = s.sec("main")
    b0, nbeat = d["b0"], d["beats"]
    roots = []
    for idx, rb in enumerate(b for b in range(0, nbeat, 16) if b + 8 <= nbeat):
        d3_phrase(b0 + rb, idx + 2)
        roots.append((b0 + rb, D3_ROOTS[(idx + 2) % len(D3_ROOTS)]))
    k.pulse(b0 + 8, nbeat - 8, g0=pulse_gain[0], g1=pulse_gain[1])
    return roots


def yoake_answer(k, level=1.0, every=2):
    def answer(i, bt, ch):
        if i % every == every - 1:
            figs = [[(9.0, 78, 0.32), (10.0, 81, 0.28), (11.5, 88, 0.24)], [(9.0, 81, 0.30), (10.0, 78, 0.27), (11.5, 86, 0.22)]]
            k.cel(bt, figs[(i // every) % 2], level=level)
    return answer


def quiet_end(s, k, cel_level=1.0, pad=True):
    """結：D に落ち着く。最後の音だけ長く"""
    d = s.sec("end")
    b0 = d["b0"]
    for st, m, v in MOTIF[:3]:
        k.hit(b0 + st / 4, m, v * 0.9)
    k.hit(b0 + MOTIF[3][0] / 4, 69, 0.36, beats=24.0)
    k.low(b0, "D", beats=28.0, sub=0.8)
    if pad:
        k.pad(b0, b0 + d["beats"] - 2, "D")
    if cel_level:
        k.cel(b0 + 8, [(0, 78, 0.2), (1.5, 81, 0.16)], level=cel_level, beats=10.0)
    return d


# ================================================================ 案 澄んだ夜明け
def plan_sumi(sections, end):
    """夜明けと同じ流れ。ピアノを澄んだ音色にして前へ出し、広がる音と残響は控えめに。
    次の時代へ（渡す 3）では、広がる音を足す代わりに、ピアノの 1 オクターブ上が重なって開ける"""
    s = B.Song("sumi", 1411, 96)
    s.tm = BeatMap(96, sections, end, rit={"end": (0.5, 0.3)})
    k = ClearKit(s, mute=1.45, click=1.3)
    a = s.at
    d3_opening(s, k, pulse_gain=(0.85, 0.85))
    cyc = ["D", "G", "Bm", "G2", "DF", "Em", "As", "D"]
    k.mute = 1.65
    n1 = phrases2(k, "pass", cyc, pad_level=0.8)
    if has(s, "learn"):
        k.mute = 1.8
        phrases2(k, "learn", cyc, start=n1, pad_level=0.8, cel=yoake_answer(k, level=0.85, every=2))
    for nm, notes in (("pass", (57,)), ("learn", (57, 64, 62, 64))):
        if has(s, nm):
            dd = s.sec(nm)
            k.pulse(dd["b0"], dd["beats"], notes=notes, skip=lambda bar: bar % 16 in (14, 15), base=0.15)
    # 渡す 3：脈を抜き、ピアノが 1 オクターブ上で開ける（明るい音の高さで、品よく）
    k.mute = 1.9
    phrases2(k, "thin", ["G", "DF", "Em", "As"], level=0.9, low_level=0.8, pad_level=0.7, octave=lambda i: 0.4 if i == 0 else 0.3)
    d = s.sec("gap")
    k.pad(d["b0"], d["b0"] + d["beats"], "D0", level=0.6)
    k.hit(d["b0"] + 2, 69, 0.24, beats=10.0)
    for nm in ("build", "peak"):
        if has(s, nm):
            phrases2(k, nm, ["G2", "As"], level=1.05, octave=lambda i: 0.36, low_level=0.95, pad_level=0.8,
                     cel=lambda i, bt, ch: k.cel(bt, [(st / 4, m + 12, v * 0.4) for st, m, v in MOTIF], beats=8.0))
            dd = s.sec(nm)
            k.pulse(dd["b0"], dd["beats"], notes=(57, 64, 62, 64), g0=0.9, g1=0.5, base=0.15)
    quiet_end(s, k, cel_level=0.8)
    glow_cfg(s, [(0, 0.1), (a("pass"), 0.15), (a("learn") if has(s, "learn") else a("thin"), 0.3), (a("thin"), 0.3), (a("gap"), 0.2), (a("peak"), 0.45), (a("end"), 0.3), (end, 0.15)])
    s.pad_cfg["glow"]["width"] = 0.75
    s.auto("piano", [(0, -6.8)])
    s.auto("pianolow", [(0, -8.5)])
    s.auto("pulse", [(0, -20)])
    s.auto("glow", [(0, -72), (a("pass"), -72), (a("pass") + 2, -52), (a("pass") + 20, -42), (a("thin"), -42), (a("thin", 0.9), -44), (a("gap"), -44), (a("peak"), -39), (a("end", 0.4), -41), (end, -64)])
    s.auto("cel", [(0, -11.5)])
    standard_mix(s, hall=(2.7, 3.1, 2.1, 0.02), piano_dip=-4.0,
                 extra_bus=dict(piano=dict(hall=0.15, plate=0.08, body=0.2), pianolow=dict(hall=0.10, plate=0.05, body=0.25), cel=dict(hall=0.28, plate=0.08, delay=0.06)),
                 extra_eq=dict(piano=lambda f: hp(f, 70, 2) * bell(f, 1700, -4.0, 1.2) * bell(f, 5500, 1.5, 1.2) * lp(f, 15000, 1),
                               pianolow=lambda f: hp(f, 34, 2) * bell(f, 250, -1.5, 1.0) * lp(f, 5000, 1)))
    s.mix["master"]["drive"] = 0.2
    return s


# ================================================================ 案 日の出
STR_LOW = {"D": (38, 50), "G": (43, 55), "G2": (43, 55), "Bm": (47, 54), "DF": (42, 54), "Em": (40, 52), "As": (45, 57), "D0": (38, 50)}  # 低い弦：根音と 1 オクターブ上（Bm は根音と 5 度）


def plan_hinode(sections, end):
    """夜明けの流れに、低い弦の持続音を足して、映画のように厚く。序はピアノだけ（おごそか）。残すから低い弦が静かに入る。
    次の時代へ（渡す 3）で高い弦が数秒かけてふくらみ、大きく開く。途絶えで引き、復元でもう一度。結は弦が消えて、ピアノで静かに収める"""
    s = B.Song("hinode", 1520, 96)
    s.tm = BeatMap(96, sections, end, rit={"end": (0.6, 0.25)})
    k = Kit(s, mute=1.25)
    a = s.at

    def cello(b0, b1, notes, level=1.0):
        for j, m in enumerate(notes):
            s.pad("cello", b0, b1, m, level * (1.0 if j == 0 else 0.7))

    def violins(b0, b1, ch, level=1.0, up=12):
        for j, m in enumerate(CH[ch][2]):
            s.pad("violins", b0, b1, m + up, level * (0.8 if j == 0 else 1.0))
        s.pad("violins", b0, b1, CH[ch][1] + 12, level * 0.7)  # 根音を、弦の下の声として

    # 序・残す：D3 と同じ。残すの頭から、低い弦が D3 の低音（F・B♭ …）を静かにのばす
    roots = d3_opening(s, k)
    for i, (bt, r) in enumerate(roots):
        nxt = roots[i + 1][0] if i + 1 < len(roots) else s.sec("pass")["b0"]
        cello(bt, nxt, (r[1], r[1] + 7), level=0.9)
    # 渡す 1・2：夜明けと同じ和音。低い弦が和音の根をのばし、広がる音も入る
    cyc = ["D", "G", "Bm", "G2", "DF", "Em", "As", "D"]
    k.mute = 1.4

    def strings_low(i, bt, ch, nm):
        b0, nbeat, starts = phrase_list(s, nm)
        nxt = starts[i + 1] if i + 1 < len(starts) else nbeat
        cello(bt, b0 + nxt, STR_LOW[ch])

    n1 = phrases2(k, "pass", cyc, cel=lambda i, bt, ch: strings_low(i, bt, ch, "pass"))
    if has(s, "learn"):
        k.mute = 1.55
        ans = yoake_answer(k)

        def learn_cel(i, bt, ch):
            strings_low(i, bt, ch, "learn")
            ans(i, bt, ch)
        phrases2(k, "learn", cyc, start=n1, cel=learn_cel)
    for nm, notes in (("pass", (57,)), ("learn", (57, 64, 62, 64))):
        if has(s, nm):
            dd = s.sec(nm)
            k.pulse(dd["b0"], dd["beats"], notes=notes, skip=lambda bar: bar % 16 in (14, 15))
    # 渡す 3（次の時代へ）：脈を抜き、和音は 2 小節ごと。高い弦がふくらんで大きく開く。ピアノは 1 オクターブ上を重ねる
    d = s.sec("thin")
    b0, nb = d["b0"], d["beats"]
    open_cyc = ["D", "Bm", "G", "As", "As"]
    for j, rb in enumerate(range(0, nb, 8)):
        if rb + 4 > nb:
            break
        ch = open_cyc[min(j, len(open_cyc) - 1)]
        e = min(nb, rb + 8) if rb + 12 <= nb else nb
        violins(b0 + rb, b0 + e, ch)
        cello(b0 + rb, b0 + e, STR_LOW[ch], level=1.1)
        k.pad(b0 + rb, b0 + e, ch, level=0.9)
    k.mute = 1.6
    for i, rb in enumerate(phrase_list(s, "thin")[2]):
        k.motif(b0 + rb, level=0.95, octave=0.38)
        k.low(b0 + rb, ["D", "G"][i % 2], level=1.0, sub=0.8)
    # 途絶えても：弦は引き、低い D だけが細く残る。ピアノは 1 音
    d = s.sec("gap")
    cello(d["b0"], d["b0"] + d["beats"], (38,), level=0.7)
    k.hit(d["b0"] + 2, 69, 0.22, beats=10.0)
    # 山（復元）：もう一度ふくらむ（次の時代へより少し小さく）
    for nm in ("build", "peak"):
        if not has(s, nm):
            continue
        b0p, nbp, starts = phrase_list(s, nm)

        def dbl(i, bt, ch, nm=nm, b0p=b0p, nbp=nbp, starts=starts):
            nxt = starts[i + 1] if i + 1 < len(starts) else nbp
            k.cel(bt, [(st / 4, m + 12, v * 0.45) for st, m, v in MOTIF], beats=8.0)
            violins(bt, b0p + nxt, ch, level=0.85)
            cello(bt, b0p + nxt, STR_LOW[ch])

        phrases2(k, nm, ["G2", "As"], level=1.05, octave=lambda i: 0.34, low_level=1.05, cel=dbl)
        k.pulse(b0p, nbp, notes=(57, 64, 62, 64), g0=0.9, g1=0.5)
    # 結：弦は前半で消え、低い D だけが少し残る。ピアノで静かに収める
    d = quiet_end(s, k, cel_level=0.7, pad=False)
    k.pad(d["b0"], d["b0"] + d["beats"] * 0.6, "D", level=0.8)
    cello(d["b0"], d["b0"] + d["beats"] * 0.7, (38, 50), level=0.85)
    glow_cfg(s, [(0, 0.1), (a("pass"), 0.2), (a("learn") if has(s, "learn") else a("thin"), 0.4), (a("thin"), 0.6), (a("gap"), 0.25), (a("peak"), 0.65), (a("end"), 0.35), (end, 0.2)])
    s.pad_cfg["cello"] = dict(timbre="cello", att=3.2, rel=3.5, width=0.7, bright=s.curve([(0, 0.15), (a("pass"), 0.3), (a("thin"), 0.6), (a("gap"), 0.2), (a("peak"), 0.55), (a("end"), 0.25)], lfo=0.05, period=37.0))
    s.pad_cfg["violins"] = dict(timbre="violins", att=3.6, rel=3.6, width=1.0, bright=s.curve([(0, 0.4), (a("thin"), 0.55), (a("thin") + 6, 0.8), (a("gap"), 0.5), (a("peak"), 0.7), (end, 0.4)], lfo=0.06, period=43.0))
    s.auto("piano", [(0, -8)])
    s.auto("pianolow", [(0, -7.5)])
    s.auto("pulse", [(0, -19.5)])
    s.auto("glow", [(0, -72), (a("pass"), -72), (a("pass") + 2, -50), (a("pass") + 20, -37), (a("thin"), -37), (a("thin") + 4, -34), (a("gap"), -38), (a("peak"), -33), (a("end", 0.3), -38), (end, -64)])
    # 低い弦：残すの頭から 2 小節かけて、とても静かに入る。渡す 3 と復元で厚く。結で引く
    s.auto("cello", [(0, -80), (a("main"), -80), (a("main") + 2, -48), (a("main") + 9, -33), (a("pass"), -30), (a("thin"), -30), (a("thin") + 5, -26.5), (a("thin", 0.92), -28), (a("gap"), -33), (a("peak"), -27.5), (a("end"), -30), (a("end", 0.6), -40), (end, -70)])
    # 高い弦：次の時代への頭で、5 秒ほどかけてふくらむ（打つ音で切り替えない）
    s.auto("violins", [(0, -80), (a("thin"), -58), (a("thin") + 1.5, -40), (a("thin") + 5.5, -25), (a("thin", 0.9), -26.5), (a("gap"), -40), (a("gap", 0.6), -70), (a("peak"), -56), (a("peak") + 4, -30.5), (a("end"), -34), (a("end", 0.45), -58), (end, -80)])
    s.auto("cel", [(0, -10)])
    standard_mix(s, hall=(3.9, 4.5, 2.7, 0.032), piano_dip=-6.0,
                 extra_bus=dict(cello=dict(hall=0.18, plate=0.02, drift=(0.6, 0.17)), violins=dict(hall=0.30, plate=0.04, drift=(0.9, 0.21))),
                 extra_eq=dict(cello=lambda f: hp(f, 36, 2) * bell(f, 160, 1.0, 1.0) * lp(f, 3200, 2),
                               violins=lambda f: hp(f, 200, 2) * bell(f, 2000, -5.0, 1.0) * lp(f, 8000, 2)))
    return s


# ================================================================ 案 余白
# 自分の和音（ニ長調）：(低い根音, 低い 5 度, 右手の 4 音)。右手は 2 度を 1 つ含む、開いた明るい響き
YH = {
    "D": (38, 45, (62, 64, 66, 69)),    # D add9：D4 E4 F#4 A4
    "Gl": (43, 50, (62, 66, 69, 73)),   # G maj9#11：D4 F#4 A4 C#5（明るく浮く）
    "Bm": (35, 42, (62, 66, 69, 73)),   # Bm9
    "Em": (40, 47, (62, 66, 67, 71)),   # Em9
    "G": (43, 50, (62, 66, 69, 71)),    # G maj9
    "DF": (42, 50, (62, 64, 69, 71)),   # D/F#（6・9）
    "As": (45, 52, (62, 64, 69, 71)),   # A sus
    "A": (45, 52, (61, 64, 66, 69)),    # A6
}
YH_TOP = {  # 上の 1 音（右手の 1 オクターブ上の中から）
    "D": (76, 78, 81), "Gl": (78, 81, 85), "Bm": (78, 81, 85), "Em": (78, 79, 83), "G": (78, 81, 83), "DF": (76, 81, 83), "As": (76, 81, 83), "A": (76, 78, 81),
}
YH_BELL = {"D": (88, 90, 93), "Gl": (90, 93, 85), "Bm": (90, 93, 85), "Em": (90, 91, 86), "G": (90, 93, 86), "DF": (88, 93, 86), "As": (88, 93, 86), "A": (88, 90, 93)}


def plan_yohaku(sections, end):
    """静かで現代的。ピアノの明るい和音が 2 小節に 1 回、間をたっぷり取って鳴り、やわらかい鈴がときどき光る。
    章ごとに少しずつ増える：序は和音だけ → 残すで上の 1 音 → 渡すで鈴 → 次の時代へで和音が 1 オクターブ上に開き、薄い光の音
    → 途絶えで 1 つの和音だけ → 復元で和音が 1 小節ごと → 結は D の和音と鈴 1 つ"""
    bpm = 80
    s = B.Song("yohaku", 1630, bpm)
    s.tm = BeatMap(bpm, sections, end, rit={"end": (0.5, 0.3)})
    a = s.at
    rng = s.rng

    def piano(bt, m, v, beats, bus="piano", mute=1.85, sub=0.0):
        s.note("piano", bus, bt, beats, m, v * rng.uniform(0.95, 1.05), late_ms=0, jit_ms=3, pan=pan_of(m), mute=mute, top=11000.0, click=1.2 if bus != "pianolow" else 0.4, sub=sub, spread_lr=0.12)

    def chord(bt, ch, v=0.27, up=0, beats=10.0, low=True, roll=0.07):
        lo, fi, rh = YH[ch]
        if low:
            piano(bt, lo, 0.34, beats + 4, bus="pianolow", mute=1.0, sub=0.5)
            piano(bt + 0.02, fi, 0.17, beats + 4, bus="pianolow", mute=1.0)
        for j, m in enumerate(rh):  # 下から、ゆっくり分けて
            piano(bt + 0.25 + j * roll, m + up, v * (0.85 + 0.1 * j), beats)

    def top(bt, ch, j, v=0.26, up=0):
        piano(bt, YH_TOP[ch][j % 3] + up, v, 8.0, bus="pianohi", mute=2.0)

    def ring(bt, ch, j, v=0.4):
        m = YH_BELL[ch][j % 3]
        s.note("suzu", "suzu", bt, 3.0, m, v * rng.uniform(0.9, 1.08), late_ms=4, jit_ms=6, pan=float(np.clip((m - 89) / 12, -0.45, 0.45)) * (1 if j % 2 else -1))

    def fill(name, cycle, slot=8, start=0, v=0.27, up=0, tops=0, bells=0, low=True):
        """段を slot 拍ごとの和音で埋める。tops：上の 1 音を何回に 1 回、bells：鈴を 1 和音に何個"""
        d = s.sec(name)
        b0, nb = d["b0"], d["beats"]
        slots = list(range(0, nb, slot))
        if len(slots) > 1 and nb - slots[-1] < slot * 0.5:  # 短すぎる最後の和音は前にまとめる
            slots.pop()
        for i, rb in enumerate(slots):
            ch = cycle[(start + i) % len(cycle)]
            bt = b0 + rb
            ln = (slots[i + 1] if i + 1 < len(slots) else nb) - rb
            chord(bt, ch, v=v, up=up, beats=max(6.0, ln + 2), low=low)
            if tops and i % tops == tops - 1 and ln >= 6:
                top(bt + 3.0, ch, start + i, up=0)
            for j in range(bells):
                if ln >= 6:
                    ring(bt + (5.5 if j == 0 else 2.5) + 0.5 * (i % 2), ch, start + i + j, v=0.42 - 0.08 * j)
        return len(slots)

    fill("intro", ["D", "Gl", "D", "Gl"], v=0.21)
    fill("main", ["D", "Bm", "G", "As"], tops=2)
    cyc = ["D", "Gl", "Bm", "Em", "G", "DF", "Em", "As"]
    n1 = fill("pass", cyc, tops=2, bells=1)
    if has(s, "learn"):
        fill("learn", cyc, start=n1, tops=1, bells=1)
    # 次の時代へ：右手が 1 オクターブ上に開き、薄い光の音（広がる音）がのる
    d = s.sec("thin")
    th = ["Gl", "D", "Em", "As"]
    fill("thin", th, v=0.30, up=12, tops=0, bells=2)
    slots = list(range(0, d["beats"], 8))
    if len(slots) > 1 and d["beats"] - slots[-1] < 4:
        slots.pop()
    for i, rb in enumerate(slots):
        ch = th[i % len(th)]
        e = slots[i + 1] if i + 1 < len(slots) else d["beats"]
        for j, m in enumerate(YH[ch][2]):  # 元の高さの和音も、下に弱く残す（開けても、薄くならない）
            piano(d["b0"] + rb + 0.27 + j * 0.07, m, 0.17, max(6.0, e - rb + 2))
        for m in YH[ch][2][1:]:
            s.pad("glow", d["b0"] + rb, d["b0"] + e, m + 12, 0.8)
    # 途絶えても：1 つの和音だけ（低音なし）
    d = s.sec("gap")
    chord(d["b0"] + 1, "Bm", v=0.2, beats=14.0, low=False)
    # 復元：和音が 1 小節ごとに。鈴も
    for nm in ("build", "peak"):
        if has(s, nm):
            fill(nm, ["G", "As", "Bm", "As", "Gl", "As"], slot=4, v=0.28, tops=2, bells=0)
            dd = s.sec(nm)
            for j, rb in enumerate(range(2, dd["beats"] - 2, 8)):
                ring(dd["b0"] + rb + 1.5, "As" if j % 2 else "G", j, v=0.36)
            for m in (66, 69, 71):
                s.pad("glow", dd["b0"], dd["b0"] + dd["beats"], m + 12, 0.7)
    # 結：D の和音、鈴 1 つ、上の音 1 つで終わる
    d = s.sec("end")
    chord(d["b0"], "D", v=0.28, beats=22.0)
    top(d["b0"] + 4, "D", 1, v=0.22)
    ring(d["b0"] + 8, "D", 0, v=0.34)
    s.pad_cfg["glow"] = dict(timbre="glow", att=3.0, rel=3.5, width=1.0, bright=s.curve([(0, 0.5), (end, 0.5)], lfo=0.08, period=31.0))
    s.auto("piano", [(0, -7.5)])
    s.auto("pianohi", [(0, -10)])
    s.auto("pianolow", [(0, -9), (a("main") - 1, -10.5), (a("main") + 1, -9)])
    s.auto("suzu", [(0, -12)])
    s.auto("glow", [(0, -70), (a("thin"), -70), (a("thin") + 3, -38), (a("thin", 0.9), -39), (a("gap"), -60), (a("peak"), -42), (a("end"), -52), (end, -70)])
    standard_mix(s, hall=(3.0, 3.5, 2.3, 0.025), piano_dip=-4.5,
                 extra_bus=dict(piano=dict(hall=0.20, plate=0.08, body=0.18), pianohi=dict(hall=0.26, plate=0.08, delay=0.10), pianolow=dict(hall=0.12, plate=0.04, body=0.22),
                                suzu=dict(hall=0.32, plate=0.06, delay=0.16), glow=dict(hall=0.25, plate=0.03, drift=(0.4, 0.2))),
                 extra_eq=dict(piano=lambda f: hp(f, 70, 2) * bell(f, 1700, -4.5, 1.2) * bell(f, 6000, 1.5, 1.2) * lp(f, 15000, 1),
                               pianohi=lambda f: hp(f, 200, 2) * bell(f, 2000, -3.0, 1.0) * lp(f, 15000, 1),
                               suzu=lambda f: hp(f, 600, 2) * bell(f, 2400, -2.0, 1.0) * lp(f, 12000, 1)))
    s.mix["master"]["drive"] = 0.18
    return s


PLANS = {"akari": plan_akari, "ayumi": plan_ayumi, "yoake": plan_yoake, "sumi": plan_sumi, "hinode": plan_hinode, "yohaku": plan_yohaku}
NAMES = {"akari": "あかり", "ayumi": "歩み", "yoake": "夜明け", "sumi": "澄んだ夜明け", "hinode": "日の出", "yohaku": "余白"}


# ================================================================ 声と混ぜて、今のスマホ用の絵に載せる（final9.py と同じ混ぜ方）
def film(bgm, plan_json, picture, out_mp4, keep_wav=None):
    with open(plan_json, encoding="utf8") as f:
        tl = json.load(f)
    total = tl["len"]
    ins = ["-i", bgm]
    flt = []
    kk = 1
    vkeys = []
    for v in tl["voice"]:
        ins += ["-i", os.path.join(WORK, v["file"])]
        ms = int(v["at"] * 1000)
        flt.append(f"[{kk}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms}[v{kk}]")
        vkeys.append(f"[v{kk}]")
        kk += 1
    flt.append("".join(vkeys) + f"amix=inputs={len(vkeys)}:normalize=0,apad,atrim=0:{total},asplit=2[vo][vk]")
    flt.append(f"[0:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:{total},volume=0.78[m]")
    flt.append("[m][vk]sidechaincompress=threshold=0.018:ratio=5:attack=40:release=500:makeup=1[md]")
    mix = ["[vo]", "[md]"]
    by_id = {s["id"]: s for s in tl["scenes"]}
    nat = [("raw/anneal.mov", "flame", 1.0, 0.20), ("raw/file_hands.mov", "hands0", 3.4, 0.30)]
    for name, sid, t0, vol in nat:
        s = by_id.get(sid)
        p = os.path.join(WORK, "footage", name)
        if not s or not os.path.exists(p):
            continue
        ins += ["-i", p]
        st, ln = s["start"], s["len"]
        ms = int(st * 1000)
        flt.append(f"[{kk}:a]atrim={t0}:{t0 + ln * 0.8},asetpts=N/SR/TB,atempo=0.8,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:d=0.5,afade=t=out:st={max(0.1, ln - 0.9)}:d=0.9,volume={vol},adelay={ms}|{ms}[n{kk}]")
        mix.append(f"[n{kk}]")
        kk += 1
    flt.append("".join(mix) + f"amix=inputs={len(mix)}:normalize=0,afade=t=out:st={total - 1.2}:d=1.2,atrim=0:{total}[a]")
    tmp = os.path.join(OUT_DIR, "_tmp")
    os.makedirs(tmp, exist_ok=True)
    raw = os.path.join(tmp, "mix_raw.wav")
    ff = ["ffmpeg", "-v", "error", "-y", "-threads", "4"]
    subprocess.run([*ff, *ins, "-filter_complex", ";".join(flt), "-map", "[a]", "-ar", "48000", raw], check=True)
    out = subprocess.run(["ffmpeg", "-hide_banner", "-threads", "4", "-i", raw, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], capture_output=True, text=True).stderr
    j = json.loads(out[out.rindex("{") : out.rindex("}") + 1])
    af = f"loudnorm=I=-13.7:TP=-1.5:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true,alimiter=limit=0.708:attack=2:release=60:level=disabled:asc=1"
    mixed = keep_wav or os.path.join(tmp, "mix.wav")
    subprocess.run([*ff, "-i", raw, "-af", af, "-ar", "48000", mixed], check=True)
    aac = "aac_at" if "aac_at" in subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True).stdout else "aac"
    os.makedirs(os.path.dirname(out_mp4), exist_ok=True)
    subprocess.run([*ff, "-i", picture, "-i", mixed, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", aac, "-b:a", "192k", "-movflags", "+faststart", "-shortest", out_mp4], check=True)
    print("できた：", out_mp4, f"{os.path.getsize(out_mp4) / 1e6:.1f} MB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", choices=sorted(PLANS))
    ap.add_argument("--sections", default=PLAN_JSON, help="章の秒を読む JSON（台本 final10.json か、music の形 {sections, end}）")
    ap.add_argument("--from", dest="t_from", type=float, default=None)
    ap.add_argument("--to", dest="t_to", type=float, default=None)
    ap.add_argument("--out", default=None)
    ap.add_argument("--notes", action="store_true", help="段の秒と拍だけ出す（音は作らない）")
    ap.add_argument("--film", default=None, help="この曲を声と混ぜ、スマホ用の絵に載せる")
    ap.add_argument("--name", default=None, help="--film の時の日本語の短い名前（iCloud の名前に使う）")
    ap.add_argument("--picture", default=PICTURE)
    ap.add_argument("--out-mp4", default=None)
    args = ap.parse_args()
    if args.film:
        name = args.name or os.path.splitext(os.path.basename(args.film))[0]
        out = args.out_mp4 or os.path.join(ICLOUD, f"最終案12_BGM_{name}_スマホ.mp4")
        film(args.film, args.sections, args.picture, out, keep_wav=os.path.join(OUT_DIR, f"_mix_{name}.wav"))
        return
    if not args.plan:
        sys.exit("--plan か --film をつけてください")
    secs, end, chapters = load_sections(args.sections)
    secs = clean_sections(secs, end, chapters)
    B.SECTIONS, B.END, B.R = secs, end, B.SR
    song = PLANS[args.plan](secs, end)
    for nm, d in song.tm.sec.items():
        print(f"  {nm:6s} {d['t0']:6.1f}〜{d['t1']:6.1f} 秒  {d['beats']:3d} 拍  およそ {d['beats'] * 60 / (d['t1'] - d['t0']):5.1f} 拍／分")
    print(f"  音符 {len(song.notes)} 個")
    if args.notes:
        return
    if args.t_from is not None or args.t_to is not None:
        t_from, t_to = args.t_from or 0.0, args.t_to if args.t_to is not None else end
        path = args.out or os.path.join(OUT_DIR, f"_{args.plan}_{int(t_from)}-{int(t_to)}.wav")
        fade = True
    else:
        t_from, t_to = 0.0, end + 0.8  # D3 と同じ長さ
        path = args.out or os.path.join(OUT_DIR, f"{args.plan}.wav")
        fade = False
    st = time.time()
    mix, t0 = B.render(song, t_from, t_to)
    y = B.master(mix, t0, t_from, t_to, fade_edges=fade, cfg=song.mix.get("master"))
    B.write_wav(path, y)
    lu = B.lufs_of(y)
    tp = 20 * math.log10(B.true_peak_env(y).max() + 1e-12)
    print(f"音楽 {path}：{len(y) / B.SR:.1f} 秒、{lu:.1f} LUFS、山 {tp:.1f} dBTP（計算 {time.time() - st:.0f} 秒）")


if __name__ == "__main__":
    main()
