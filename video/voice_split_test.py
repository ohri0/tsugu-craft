# voice_split.py の試し（2026-11-07）。仮の声（work/voice/sim10）を表の順につないで「作者の長い録音」に見立て、
# 正しく行に分けられるかを確かめる。本物の work/voice には書かない（一時フォルダだけ）。
#   1. 1 本の録音：行の間 0.8〜2.5 秒（ばらばら）・部屋の音・唸り・クリック 5 つ・読み直し 1 回（1 回目は途中でやめる）・咳 1 回
#   2. 2 本に分けた録音（2 本目の頭に咳、2 本目にも読み直し。こちらは 2 回とも最後まで読む）
#   3. 一部の録り直し（--lines n5,n6）と、上書きしない・--force で写しを残す
# 使い方：video/work/.venv/bin/python -I video/voice_split_test.py
import os, sys, tempfile

import numpy as np

sys.dont_write_bytecode = True  # video/__pycache__ を作らない
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voice_split as vs  # noqa: E402

SR = vs.SR
SIM = os.path.join(vs.WORK, "voice", "sim10")
TOL = 0.2  # 始まり・終わりのずれの許し（秒）


def span(x):
    """仮の声の、声のある所（頭からの秒）"""
    db = vs.frame_db(x)
    floor, peak = vs.levels(db)
    idx = np.where(db >= floor + max(6.0, 0.22 * (peak - floor)))[0]
    return idx[0] * vs.HOP / SR, (idx[-1] + 1) * vs.HOP / SR


def room(n, rng, level_db=-58):
    # 低い方が大きい部屋の音（周波数の平方根で割る、ピンクに近い音）＋ 50 Hz の唸り
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    spec /= np.sqrt(np.maximum(f, 20.0))
    noise = np.fft.irfft(spec, n)
    noise *= 10 ** (level_db / 20) / (np.sqrt(np.mean(noise ** 2)) + 1e-12)
    hum = 10 ** ((level_db - 4) / 20) * np.sqrt(2) * np.sin(2 * np.pi * 50 * np.arange(n) / SR)
    return (noise + hum).astype(np.float32)


def click(rng):
    t = np.arange(int(0.004 * SR)) / SR
    return (0.25 * np.exp(-t / 0.0008) * np.sin(2 * np.pi * rng.uniform(2500, 4500) * t)).astype(np.float32)


def cough(rng):
    n = int(0.38 * SR)
    t = np.arange(n) / SR
    env = np.minimum(1, t / 0.01) * np.exp(-t / 0.09)
    w = rng.standard_normal(n)
    spec = np.fft.rfft(w)
    f = np.fft.rfftfreq(n, 1 / SR)
    spec[(f < 250) | (f > 3500)] *= 0.1
    y = np.fft.irfft(spec, n) * env
    return (0.3 * y / np.abs(y).max()).astype(np.float32)


class Take:
    """録音を組み立てる。正解（行ごとの声のある所）を覚えておく"""

    def __init__(self, rng, noise_db=-58):
        self.rng, self.noise_db = rng, noise_db
        self.parts, self.t = [], 0.0
        self.truth = {}

    def silence(self, sec):
        self.parts.append(np.zeros(int(sec * SR), np.float32))
        self.t += int(sec * SR) / SR

    def put(self, y):
        self.parts.append(y)
        self.t += len(y) / SR

    def line(self, n, x, partial=None):
        if partial:
            y = x[: int(len(x) * partial)].copy()
            f = int(0.02 * SR)
            y[-f:] *= np.linspace(1, 0, f)
            self.put(y)
            return
        a, b = span(x)
        self.truth[n] = (self.t + a, self.t + b)
        self.put(x)

    def render(self, path):
        y = np.concatenate(self.parts)
        y = y + room(len(y), self.rng, self.noise_db)
        vs.write_m4a(path, y)
        return y


def sims(rows):
    out = {}
    for r in rows:
        x = vs.load(os.path.join(SIM, f"n{r['n']}.wav"))
        out[r["n"]] = (0.5 * x).astype(np.float32)  # 電話で録ったくらいの大きさ
    return out


def gap(rng):
    return rng.uniform(0.8, 2.5)


def check(name, res, truth, expect_lines):
    ok = True
    got = {}
    for r in res["results"]:
        n = r["row"]["n"]
        if "s" not in r:
            print(f"  ✗ n{n} 見つからない")
            ok = False
            continue
        got[n] = r
    for n in expect_lines:
        if n not in got:
            ok = False
            continue
        r = got[n]
        f = r["file"]
        ts, te = truth[(f, n)]
        if abs(r["s"] - ts) > TOL or abs(r["e"] - te) > TOL:
            print(f"  ✗ n{n}：選んだ {r['s']:.2f}–{r['e']:.2f}、正しくは {ts:.2f}–{te:.2f}（録音 {f + 1}）")
            ok = False
    if res["warn"]:
        print(f"  ✗ あやしい印が {res['warn']} 個")
        ok = False
    right = sum(1 for n in expect_lines if n in got and abs(got[n]["s"] - truth[(got[n]["file"], n)][0]) <= TOL
                and abs(got[n]["e"] - truth[(got[n]["file"], n)][1]) <= TOL)
    errs = [max(abs(got[n]["s"] - truth[(got[n]["file"], n)][0]), abs(got[n]["e"] - truth[(got[n]["file"], n)][1])) for n in expect_lines if n in got]
    print(f"[{name}] 正しく当てた行 {right}/{len(expect_lines)}・頭と終わりのずれ 最大 {max(errs):.2f} 秒・あやしい印 {res['warn']}・"
          f"話す速さの見立て {res['rate']:.2f} → {'通った' if ok else '通らない'}")
    return ok


def long_take(voices, order, rng, noise_db=-58):
    """1 本の長い録音：行の間ばらばら・クリック・唇の音・読み直し・咳・n4 の中の間"""
    tk = Take(rng, noise_db)
    tk.silence(1.5)
    retake_n, cough_after = order[7], order[15]
    click_after = set(order[i] for i in (2, 9, 18, 24))
    for i, n in enumerate(order):
        if n == retake_n:
            tk.line(n, voices[n], partial=0.45)
            tk.silence(2.0)
        if n == 4:
            # n4「継ぐ。（間を開けて）職人の判断を、次の人へ。」は、中に 1.2 秒の間を本当に入れる
            y = np.concatenate([voices[42], np.zeros(int(1.2 * SR), np.float32), voices[41]])
            tk.line(n, y)
        else:
            tk.line(n, voices[n])
        g = gap(rng)
        if n in click_after:
            tk.silence(g * 0.4)
            tk.put(click(rng))
            tk.silence(g * 0.6)
        elif n == cough_after:
            tk.silence(1.0)
            tk.put(cough(rng))
            tk.silence(1.2)
        elif i + 1 < len(order) and order[i + 1] == order[12]:
            # 次の行の 0.3 秒前に唇の音
            tk.silence(g - 0.3)
            tk.put(click(rng))
            tk.silence(0.3)
        else:
            tk.silence(g)
    tk.silence(2.0)
    return tk


def main():
    rows = vs.read_lines(os.path.join(vs.REPO, "docs", "NARRATION-ad.md"))
    voices = sims(rows)
    order = [r["n"] for r in rows]
    tmp = tempfile.mkdtemp(prefix="voice_split_test_")
    print("一時フォルダ：", tmp)
    allok = True

    # 1. 1 本の長い録音
    tk = long_take(voices, order, np.random.default_rng(7))
    p1 = os.path.join(tmp, "take1.m4a")
    tk.render(p1)
    out1 = os.path.join(tmp, "voice1")
    res = vs.main([p1, "--voice", out1, "--sim", SIM])
    truth = {(0, n): v for n, v in tk.truth.items()}
    allok &= check("1 本の録音", res, truth, order)
    # きれいにした声と _raw の声が、時間でずれていない（afftdn の遅れを戻せている）・声の色が変わりすぎていない
    worst_lag = 0
    for n in order:
        y = vs.load(os.path.join(out1, f"n{n}.wav"))
        x = vs.load(os.path.join(out1, "_raw", f"n{n}.wav"))
        worst_lag = max(worst_lag, abs(vs.delay(x, y, 2400)))
    print(f"  きれいにした声と元の声のずれ：最大 {worst_lag} サンプル")
    if worst_lag > 48:
        print("  ✗ きれいにした声が、元の声とずれている")
        allok = False
    files = sorted(f for f in os.listdir(out1) if f.startswith("n"))
    allok &= len(files) == len(order) and os.path.exists(os.path.join(out1, "_check.m4a")) and os.path.exists(os.path.join(out1, "_raw", f"n{order[0]}.wav"))

    # 2. 2 本に分けた録音
    rng = np.random.default_rng(11)
    cut_at = 16
    takes = [Take(rng), Take(rng)]
    takes[0].silence(1.0)
    takes[1].silence(0.8)
    takes[1].put(cough(rng))
    takes[1].silence(1.5)
    twice = order[20]
    for i, n in enumerate(order):
        tk = takes[0] if i < cut_at else takes[1]
        if n == twice:
            # 2 回とも最後まで読む → あとの方を使う。あとの方は 6% ゆっくり読む（見込みの長さには 1 回目の方が合うので、長さだけでは 1 回目を選んでしまう）
            tk.line(n, voices[n])
            tk.silence(2.0)
            first = tk.truth[n]
            x = voices[n]
            slow = np.interp(np.arange(0, len(x), 0.94), np.arange(len(x)), x).astype(np.float32)
            tk.line(n, slow)
        else:
            tk.line(n, voices[n])
        tk.silence(gap(rng))
    for tk in takes:
        tk.silence(1.5)
    pa, pb = os.path.join(tmp, "take2a.m4a"), os.path.join(tmp, "take2b.m4a")
    takes[0].render(pa)
    takes[1].render(pb)
    out2 = os.path.join(tmp, "voice2")
    res = vs.main([pa, pb, "--voice", out2, "--sim", SIM])
    truth = {}
    for f, tk in enumerate(takes):
        for n, v in tk.truth.items():
            truth[(f, n)] = v
    allok &= check("2 本の録音", res, truth, order)
    chosen = [r for r in res["results"] if r["row"]["n"] == twice][0]
    if abs(chosen["s"] - first[0]) < 1.0:
        print(f"  ✗ n{twice} の読み直しで、あとの方を選んでいない")
        allok = False

    # 3. 一部の録り直し（n5・n6）。n6 は途中でやめて読み直す
    rng = np.random.default_rng(3)
    tk = Take(rng)
    tk.silence(1.2)
    tk.line(5, voices[5])
    tk.silence(1.8)
    tk.line(6, voices[6], partial=0.3)
    tk.silence(2.2)
    tk.line(6, voices[6])
    tk.silence(1.5)
    p3 = os.path.join(tmp, "take3.m4a")
    tk.render(p3)
    res = vs.main([p3, "--lines", "n5,n6", "--voice", out1, "--sim", SIM])
    truth = {(0, n): v for n, v in tk.truth.items()}
    allok &= check("一部の録り直し（上書きなし）", res, truth, [5, 6])
    if res["outdir"] == out1 or not os.path.exists(os.path.join(res["outdir"], "n6.wav")):
        print("  ✗ --force なしで上書きした")
        allok = False
    before = os.path.getsize(os.path.join(out1, "n6.wav"))
    res = vs.main([p3, "--lines", "n5,n6", "--voice", out1, "--sim", SIM, "--force"])
    allok &= check("一部の録り直し（--force）", res, truth, [5, 6])
    if not res["backup"] or os.path.getsize(os.path.join(res["backup"], "n6.wav")) != before:
        print("  ✗ 前の n6.wav の写しがない")
        allok = False

    # 4. 仮の声より 1.25 倍ゆっくり読み、部屋の音も 10 dB 大きい録音
    slow = {n: np.interp(np.arange(0, len(x), 0.8), np.arange(len(x)), x).astype(np.float32) for n, x in voices.items()}
    tk = long_take(slow, order, np.random.default_rng(23), noise_db=-48)
    p4 = os.path.join(tmp, "take4.m4a")
    tk.render(p4)
    res = vs.main([p4, "--voice", os.path.join(tmp, "voice4"), "--sim", SIM])
    allok &= check("ゆっくり・部屋の音が大きい", res, {(0, n): v for n, v in tk.truth.items()}, order)

    print("すべて通った" if allok else "通らない所がある")
    return 0 if allok else 1


if __name__ == "__main__":
    sys.exit(main())
