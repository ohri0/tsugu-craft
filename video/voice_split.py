# 作者の録音（1 本の長い録音でも、何本かでも）を、行ごとの声 work/voice/n<番号>.wav に分ける（2026-11-07）。
# final_build10.py の own_voice() が、この n<番号>.wav を読んで、前後の無音を切り、大きさをそろえて使う。
#
# 流れ：
#   1. ffmpeg で読む（1 ch・48 kHz・float）。
#   2. きれいにする：低い唸りを切る（70 Hz）→ いちばん静かな 0.6 秒を部屋の音として覚えて、やさしく消す（afftdn）
#      → 歯擦音（サ行のシュー）を少しだけ下げる（deesser）→ 口のクリック（adeclick）。
#      さらに、言葉の外の短いプチッ（舌打ち・唇の音）を、まわりの静けさの大きさまで下げる。強い処理はしない（声がロボットのようになるので）。
#   3. 音の大きさで、話している所を見つける（入る・出るで別のしきい）。0.45 秒より短い切れ目はつなぐ。
#   4. docs/NARRATION-ad.md のいちばん上の表の順に、行を当てる。仮の声（work/voice/sim10/n<番号>.wav）の長さを見込みにして、
#      動的計画法で、全体がいちばん合う当て方を探す（話す速さは、0.6〜1.8 倍から合うものを選ぶ）。
#      ・読み直し：同じ行を 2 回読んだときは、あと（最後まで読んだ方）を使う。途中でやめた分は外す。
#      ・咳・物音・クリック：声でない（声の高さが続かない）短い音は外す。
#   5. 行ごとに、前後 0.15 秒の余白をつけて n<番号>.wav（48 kHz）に書く。きれいにする前の同じ所は _raw/n<番号>.wav。
#      確かめの表 _split_report.txt と、選んだ所を 0.6 秒の間で並べた _check.m4a（耳で確かめる）。
#      すでに n<番号>.wav があれば、--force なしでは上書きしない（_new_<時刻>/ に書く）。--force のときは _backup_<時刻>/ に写してから書く。
#
# 使い方：
#   video/work/.venv/bin/python -I video/voice_split.py 録音.m4a [録音2.m4a …]
#     --lines n5,n6   その行だけの録り直し（録音の中は、表の順にその行だけ）
#     --force         今ある n<番号>.wav を _backup_<時刻>/ に写してから上書き
#     --voice DIR     書く先（ふだんは work/voice）。--sim DIR 見込みの長さに使う仮の声（ふだんは work/voice/sim10）
#     --narration F   行の表（ふだんは docs/NARRATION-ad.md）
# 録音は、書いた順に、表の順で読んだものとして扱う（何本かに分けたときは、1 本目・2 本目…の順に並べて渡す）。
import argparse, datetime, math, os, re, shutil, subprocess, sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
WORK = os.environ.get("TSUGU_VIDEO_WORK", os.path.join(HERE, "work"))
FFMPEG = shutil.which("ffmpeg") or "/usr/local/bin/ffmpeg"
SR = 48000
HOP = 480            # 10 ms
WIN = 1440           # 30 ms（大きさを測る窓）
MERGE_GAP = 0.45     # これより短い切れ目は、同じ言葉の中としてつなぐ
PAD = 0.15           # 書き出すときの前後の余白
CHECK_GAP = 0.6      # _check.m4a の行の間
SIGMA = 0.20         # 長さの合い方のゆるさ（log の差）
DROP_SPEECH = 2.5    # 声を外す重さ（読み直しの前の分・行の外のおしゃべり）
DROP_NOISE = 0.3     # 声でない音・ごく短い音を外す重さ
SKIP_LINE = 15.0     # 行が見つからないときの重さ
MAX_PIECES = 6       # 1 行を何切れまでつなぐか
GAP_MAX = 1.3        # 1 行の中の切れ目の上限（秒）
GAP_MAX_PAUSE = 4.0  # 「間を開けて」のある行の、中の切れ目の上限
VOICED_MIN = 0.25    # 声らしさ（声の高さが取れる割合）がこれより低いと、声でない音とみる


# ---------- 読む・書く ----------

def load(path):
    """ffmpeg で 1 ch・48 kHz・float32 に"""
    out = subprocess.run([FFMPEG, "-v", "error", "-nostdin", "-i", path, "-vn", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         check=True, stdout=subprocess.PIPE).stdout
    return np.frombuffer(out, dtype="<f4").astype(np.float32)


def ffilter(x, af):
    """numpy の音を ffmpeg のフィルターに通す（長さは同じにそろえる）"""
    out = subprocess.run([FFMPEG, "-v", "error", "-nostdin", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                          "-af", af, "-f", "f32le", "-ar", str(SR), "-ac", "1", "-"],
                         input=x.astype("<f4").tobytes(), check=True, stdout=subprocess.PIPE).stdout
    y = np.frombuffer(out, dtype="<f4").astype(np.float32)
    if len(y) < len(x):
        y = np.concatenate([y, np.zeros(len(x) - len(y), np.float32)])
    return y[:len(x)]


def write_wav(path, x):
    subprocess.run([FFMPEG, "-v", "error", "-nostdin", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                    "-c:a", "pcm_s24le", "-ar", str(SR), path], input=x.astype("<f4").tobytes(), check=True)


def write_m4a(path, x):
    subprocess.run([FFMPEG, "-v", "error", "-nostdin", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                    "-c:a", "aac", "-b:a", "160k", path], input=x.astype("<f4").tobytes(), check=True)


# ---------- 測る ----------

def frame_db(x, hop=HOP, win=WIN):
    """hop ごとの大きさ（dB）。窓は frame の中心に置く"""
    n = len(x) // hop
    c = np.concatenate([[0.0], np.cumsum(x.astype(np.float64) ** 2)])
    mid = np.arange(n) * hop + hop // 2
    a = np.clip(mid - win // 2, 0, len(x))
    b = np.clip(mid + win // 2, 0, len(x))
    ms = (c[b] - c[a]) / np.maximum(b - a, 1)
    return 10 * np.log10(ms + 1e-12)


def levels(db):
    """静けさ（部屋の音）と声の大きさ。まったくの 0（録音の頭など）は除く"""
    live = db[db > -110]
    if len(live) == 0:
        return -90.0, -30.0
    return float(np.percentile(live, 10)), float(np.percentile(live, 98))


def quietest(x, length=0.6):
    """いちばん静かな length 秒の頭（サンプル）。まったくの 0 は部屋の音ではないので除く"""
    db = frame_db(x)
    k = int(length * SR / HOP)
    if len(db) <= k:
        return 0
    lin = 10 ** (db / 10)
    dead = db < -110
    c = np.concatenate([[0.0], np.cumsum(lin)])
    cd = np.concatenate([[0], np.cumsum(dead)])
    mean = (c[k:] - c[:-k]) / k
    bad = (cd[k:] - cd[:-k]) > 0
    mean[bad] = np.inf
    if not np.isfinite(mean).any():
        return 0
    return int(np.argmin(mean)) * HOP


def voicing(x):
    """20 ms ごとに、声の高さ（70〜400 Hz）がはっきり取れるか。返すのは（各こまの中心の秒, 取れたか）"""
    y = x[: len(x) // 3 * 3].reshape(-1, 3).mean(axis=1)  # 16 kHz（粗い間引き。声の高さを見るだけ）
    sr, flen, hop = 16000, 640, 320
    n = max(0, (len(y) - flen) // hop + 1)
    if n == 0:
        return np.zeros(0), np.zeros(0, bool)
    idx = np.arange(flen)[None, :] + hop * np.arange(n)[:, None]
    fr = y[idx]
    fr = fr - fr.mean(axis=1, keepdims=True)
    fr = fr * np.hanning(flen)[None, :]
    spec = np.fft.rfft(fr, 2 * flen)
    ac = np.fft.irfft(np.abs(spec) ** 2)[:, :flen]
    r0 = ac[:, 0] + 1e-12
    lo, hi = sr // 400, sr // 70
    peak = ac[:, lo:hi].max(axis=1) / r0
    # 窓の形で、遅れが大きいほど下がる分を直す
    w = np.hanning(flen)
    wac = np.correlate(w, w, "full")[flen - 1:]
    lag = lo + ac[:, lo:hi].argmax(axis=1)
    peak = peak / np.maximum(wac[lag] / wac[0], 0.2)
    t = (np.arange(n) * hop + flen / 2) / sr
    return t, peak > 0.55


# ---------- きれいにする ----------

def clean(x):
    """やさしく：低い唸り → 部屋の音（静かな所で覚えて消す）→ 歯擦音を少し → 口のクリック"""
    q = quietest(x)
    prof = x[q:q + int(0.6 * SR)]
    if len(prof) < int(0.6 * SR):
        prof = np.concatenate([prof, np.zeros(int(0.6 * SR) - len(prof), np.float32)])
    nf_db = 20 * math.log10(float(np.sqrt(np.mean(prof.astype(np.float64) ** 2))) + 1e-9)
    nf_db = min(-20.0, max(-80.0, nf_db))
    pre = len(prof)
    # 部屋の音を、録音の頭に置いた静かな所で覚えさせてから、本当の録音を通す（覚えた形が頭から効くように）
    y = np.concatenate([prof, x])
    af = ",".join([
        "highpass=f=70:poles=2",
        f"asendcmd=c='0.05 afftdn sn start;{(pre / SR) - 0.05:.3f} afftdn sn stop'",
        f"afftdn=nr=10:nf={nf_db:.1f}:tn=0",
        "deesser=i=0.2:m=0.5:f=0.5",
        "adeclick=t=3",
    ])
    out = ffilter(y, af)[pre:]
    # afftdn は 25 ms ほど遅れて出す（ffmpeg 8.0 で 1200 サンプル）。いちばん大きい所で元の音と重ねて、遅れを測って戻す
    # （戻さないと、きれいにした方と _raw の切る所がずれる）
    lag = delay(x, out)
    if lag > 0:
        out = np.concatenate([out[lag:], np.zeros(lag, np.float32)])
    elif lag < 0:
        out = np.concatenate([np.zeros(-lag, np.float32), out[:lag]])
    return out, nf_db


def delay(x, y, maxlag=4800):
    """y が x よりどれだけ遅れているか（サンプル）。声のいちばん大きい 2 秒で測る"""
    db = frame_db(x)
    w = int(2 * SR / HOP)
    if len(db) <= w:
        a, b = 0, len(x)
    else:
        c = np.concatenate([[0.0], np.cumsum(10 ** (db / 10))])
        i = int(np.argmax(c[w:] - c[:-w]))
        a, b = i * HOP, i * HOP + w * HOP
    xa = x[a:b].astype(np.float64)
    ya = y[max(0, a - maxlag):b + maxlag].astype(np.float64)
    off = a - max(0, a - maxlag)
    nfft = 1 << int(math.ceil(math.log2(len(xa) + len(ya))))
    cc = np.fft.irfft(np.fft.rfft(ya, nfft) * np.conj(np.fft.rfft(xa, nfft)), nfft)
    lags = np.arange(-maxlag, maxlag + 1)
    idx = (lags + off) % nfft
    ok = (lags + off >= 0) & (lags + off <= len(ya) - len(xa))
    vals = np.where(ok, cc[idx], -np.inf)
    return int(lags[int(np.argmax(vals))])


def declick_gaps(x):
    """言葉の外の、短いプチッ（舌打ち・唇の音・机の音）を、まわりの静けさまで下げる。
    両側 100 ms に声がない所だけ（言葉の頭の「か」「た」の破裂は、すぐ後に声があるので残る）"""
    db30 = frame_db(x)
    floor, peak = levels(db30)
    on = floor + max(10.0, 0.40 * (peak - floor))
    h = 96  # 2 ms
    n = len(x) // h
    if n < 50:
        return x, 0
    e = 10 * np.log10(np.mean(x[: n * h].reshape(n, h).astype(np.float64) ** 2, axis=1) + 1e-12)
    from numpy.lib.stride_tricks import sliding_window_view
    k = 41
    padded = np.pad(e, (k // 2, k // 2), mode="edge")
    bg = np.median(sliding_window_view(padded, k), axis=1)
    hot = e - bg > 15
    y = x.copy()
    count = 0
    i = 0
    while i < n:
        if not hot[i]:
            i += 1
            continue
        j = i
        while j < n and hot[j]:
            j += 1
        if j - i <= 12:  # 24 ms より短い
            t0, t1 = i * h / SR, j * h / SR
            # 30 ms の窓がクリックそのものにかからないよう、両側 25 ms 離して 100 ms を見る
            fa = int(max(0, (t0 - 0.125)) * SR / HOP)
            fb = int(max(0, (t0 - 0.025)) * SR / HOP)
            ga = int((t1 + 0.025) * SR / HOP)
            gb = int((t1 + 0.125) * SR / HOP)
            near = np.concatenate([db30[fa:fb], db30[ga:gb]])
            if len(near) and near.max() < on:
                a, b = max(0, (i - 1) * h), min(len(x), (j + 1) * h)
                g = 10 ** ((bg[i] - e[i:j].max()) / 20)
                env = np.ones(b - a, np.float32) * g
                r = min(48, (b - a) // 3)
                if r > 0:
                    env[:r] = np.linspace(1, g, r)
                    env[-r:] = np.linspace(g, 1, r)
                y[a:b] *= env
                count += 1
        i = j
    return y, count


# ---------- 話している所 ----------

def segments(x, fi):
    """話している所の一覧（入る・出るで別のしきい。短い切れ目はつなぐ）"""
    db = frame_db(x)
    floor, peak = levels(db)
    on = floor + max(10.0, 0.40 * (peak - floor))
    off = floor + max(6.0, 0.22 * (peak - floor))
    above_off = db >= off
    regs = []
    i, n = 0, len(db)
    while i < n:
        if db[i] >= on:
            a = i
            while a > 0 and above_off[a - 1]:
                a -= 1
            b = i
            while b < n and above_off[b]:
                b += 1
            regs.append([a, b])
            i = b
        else:
            i += 1
    # 言葉の頭と終わりの小さい音（息・「へ」の消えぎわ）も入るよう、部屋の音より 4 dB 大きい間は 0.3 秒まで外へのばす
    ext = floor + 4.0
    for t, (a, b) in enumerate(regs):
        lim_a = regs[t - 1][1] if t else 0
        lim_b = regs[t + 1][0] if t + 1 < len(regs) else n
        k = 0
        while a > lim_a and k < 30 and db[a - 1] >= ext:
            a -= 1
            k += 1
        k = 0
        while b < lim_b and k < 30 and db[b] >= ext:
            b += 1
            k += 1
        regs[t] = [a, b]
    merged = []
    tiny = 6  # 60 ms より短い所（残ったクリック）は、0.15 秒より離れていれば、となりの言葉につながない（余白の頭がずれるので）
    for a, b in regs:
        g = (a - merged[-1][1]) * HOP / SR if merged else 99
        small = b - a <= tiny or (merged and merged[-1][1] - merged[-1][0] <= tiny)
        if merged and (g < 0.15 or (g < MERGE_GAP and not small)):
            merged[-1][1] = b
        else:
            merged.append([a, b])
    vt, vv = voicing(x)
    out = []
    for a, b in merged:
        s, e = a * HOP / SR, b * HOP / SR
        loud = (vt >= s) & (vt < e)
        # 声らしさは、ある程度大きいこまの中で数える
        if loud.any():
            fidx = np.clip((vt[loud] * SR / HOP).astype(int), 0, n - 1)
            strong = db[fidx] >= off
            vf = float(vv[loud][strong].mean()) if strong.any() else 0.0
        else:
            vf = 0.0
        out.append(dict(file=fi, s=s, e=e, dur=e - s, voiced=vf, peak=float(db[a:b].max())))
    return out, dict(floor=floor, peak=peak, on=on, off=off)


def active_span(x):
    """仮の声の、声のある長さ（前後の無音を除く）"""
    db = frame_db(x)
    floor, peak = levels(db)
    thr = floor + max(6.0, 0.22 * (peak - floor))
    idx = np.where(db >= thr)[0]
    if len(idx) == 0:
        return len(x) / SR
    return (idx[-1] - idx[0] + 1) * HOP / SR


# ---------- 行の表 ----------

def read_lines(path):
    """NARRATION-ad.md のいちばん上の表：番号・読む言葉（— のあとの係の書き込みは除く）"""
    rows, started = [], False
    with open(path, encoding="utf-8") as f:
        for line in f:
            m = re.match(r"^\|\s*n(\d+)\s*\|\s*([^|]*)\|\s*([^|]*)\|", line)
            if m:
                started = True
                text = m.group(3).strip()
                text = re.split(r"\s+—\s+", text)[0].strip()
                rows.append(dict(n=int(m.group(1)), ch=m.group(2).strip(), text=text))
            elif started and not line.startswith("|"):
                break
    return rows


def bare(text):
    """読みがな（ ）と、間の書き込みを除いた言葉"""
    return re.sub(r"（[^）]*）", "", text).strip()


def expected(rows, simdir):
    for r in rows:
        p = os.path.join(simdir, f"n{r['n']}.wav")
        r["inner_pause"] = "（間を開けて）" in r["text"]
        if os.path.exists(p):
            r["exp"] = active_span(load(p))
            r["exp_src"] = "仮の声"
        else:
            r["exp"] = 0.14 * len(re.sub(r"[、。\s]", "", bare(r["text"]))) + 0.3 * len(re.findall(r"[、]", bare(r["text"])))
            r["exp_src"] = "字の数"


# ---------- 当てる ----------

def span_stats(segs, j, k, row):
    """j..k-1 を 1 行にしたときの（長さ, 中の切れ目の重さ, 声らしさ）。つなげないときは None"""
    if segs[j]["file"] != segs[k - 1]["file"]:
        return None
    gmax = GAP_MAX_PAUSE if row["inner_pause"] else GAP_MAX
    d, pen = segs[j]["dur"], 0.0
    vsum = segs[j]["voiced"] * segs[j]["dur"]
    tot = segs[j]["dur"]
    for t in range(j + 1, k):
        g = segs[t]["s"] - segs[t - 1]["e"]
        if g > gmax:
            return None
        d += min(g, 0.5) + segs[t]["dur"]
        if not row["inner_pause"]:
            pen += (max(0.0, g - 0.6) / 0.5) ** 2
        vsum += segs[t]["voiced"] * segs[t]["dur"]
        tot += segs[t]["dur"]
    pen += 0.3 * (k - j - 1)
    return d, pen, vsum / tot


def drop_cost(sg):
    if sg["dur"] < 0.15 or sg["voiced"] < VOICED_MIN:
        return DROP_NOISE
    return DROP_SPEECH


def solve(segs, rows, rate):
    """動的計画法：行を順に、切れを順に。返すのは（重さ, 当て方 [(行, j, k) / (行, None)]）"""
    N, M = len(rows), len(segs)
    INF = float("inf")
    D = [[INF] * (M + 1) for _ in range(N + 1)]
    B = [[None] * (M + 1) for _ in range(N + 1)]
    D[0][0] = 0.0
    lr = math.log(rate)
    for j in range(M + 1):
        for i in range(N + 1):
            c = D[i][j]
            if c == INF:
                continue
            if j < M and c + drop_cost(segs[j]) < D[i][j + 1]:
                D[i][j + 1] = c + drop_cost(segs[j])
                B[i][j + 1] = ("drop", i, j)
            if i < N:
                if c + SKIP_LINE < D[i + 1][j]:
                    D[i + 1][j] = c + SKIP_LINE
                    B[i + 1][j] = ("skip", i, j)
                for k in range(j + 1, min(M, j + MAX_PIECES) + 1):
                    st = STATS.get((j, k, i))
                    if st is None:
                        break
                    d, pen, vf = st
                    z = (math.log(d) - lr - math.log(rows[i]["exp"])) / SIGMA
                    cost = z * z + pen + (6.0 if vf < VOICED_MIN else 0.0) - 1e-4 * j
                    if c + cost < D[i + 1][k]:
                        D[i + 1][k] = c + cost
                        B[i + 1][k] = ("take", i, j)
    i, j = N, M
    plan = []
    while (i, j) != (0, 0):
        kind, pi, pj = B[i][j]
        if kind == "take":
            plan.append((pi, pj, j))
        elif kind == "skip":
            plan.append((pi, None, None))
        i, j = pi, pj
    plan.reverse()
    return D[N][M], plan


STATS = {}


def match(segs, rows):
    STATS.clear()
    for i, r in enumerate(rows):
        for j in range(len(segs)):
            for k in range(j + 1, min(len(segs), j + MAX_PIECES) + 1):
                st = span_stats(segs, j, k, r)
                if st is None:
                    break
                STATS[(j, k, i)] = st
    best = None
    for rate in np.exp(np.linspace(math.log(0.6), math.log(1.8), 49)):
        cost, plan = solve(segs, rows, float(rate))
        if best is None or cost < best[0]:
            best = (cost, float(rate), plan)
    return best


def mel_feats(x):
    """音の並びを比べるための、20 ms ごとの声の色（メルの帯 24 本の対数。平均を引く）"""
    flen, hop = 1024, 960
    if len(x) < flen:
        x = np.concatenate([x, np.zeros(flen - len(x), np.float32)])
    n = (len(x) - flen) // hop + 1
    idx = np.arange(flen)[None, :] + hop * np.arange(n)[:, None]
    sp = np.abs(np.fft.rfft(x[idx] * np.hanning(flen)[None, :], axis=1)) ** 2
    f = np.fft.rfftfreq(flen, 1 / SR)
    edges = 700 * (10 ** (np.linspace(2595 * np.log10(1 + 100 / 700), 2595 * np.log10(1 + 7000 / 700), 26) / 2595) - 1)
    fb = np.zeros((24, len(f)))
    for b in range(24):
        lo, mid, hi = edges[b], edges[b + 1], edges[b + 2]
        fb[b] = np.clip(np.minimum((f - lo) / (mid - lo), (hi - f) / (hi - mid)), 0, None)
    m = np.log(sp @ fb.T + 1e-10)
    return m - m.mean(axis=0, keepdims=True)


def dtw(a, b):
    """2 つの声の並びのへだたり（速さのちがいは 1/2〜2 倍まで許す）。小さいほど同じ言葉"""
    c = np.sqrt(((a[:, None, :] - b[None, :, :]) ** 2).mean(axis=2))
    n, m = c.shape
    # D[i+1, j+1] が (i, j) まで。一歩は (1,1)・(1,2)・(2,1)
    D = np.full((n + 1, m + 1), np.inf)
    D[1, 1] = c[0, 0]
    for i in range(1, n):
        diag = D[i, 0:m]                                     # (i-1, j-1)
        skip_b = np.concatenate([[np.inf], D[i, 0:m - 1]])  # (i-1, j-2)
        skip_a = D[i - 1, 0:m]                               # (i-2, j-1)
        D[i + 1, 1:] = c[i] + np.minimum(diag, np.minimum(skip_b, skip_a))
    v = D[n, m]
    return float(v / (n + m)) if np.isfinite(v) else float("inf")


def prefer_last_take(segs, rows, plan, rate, cleans=None):
    """読み直し：選んだ所のあと、次の行の前に、同じ行を最後まで読み直した声があれば、あとの方にする。
    長さが近いだけでなく、音の並びが、となりの行よりもこの行に似ていること（次の行を一度読んでやめた分を取りちがえないように）"""
    feats = {}

    def feat(f, s, e):
        key = (f, round(s, 3), round(e, 3))
        if key not in feats:
            feats[key] = mel_feats(cleans[f][int(s * SR):int(e * SR)])
        return feats[key]
    took = {i: (j, k) for i, j, k in plan if j is not None}
    used = set()
    for j, k in took.values():
        used.update(range(j, k))
    notes = {}
    order = sorted(took)
    for pos, i in enumerate(order):
        j, k = took[i]
        nxt = took[order[pos + 1]][0] if pos + 1 < len(order) else len(segs)
        d0 = STATS[(j, k, i)][0]
        cands = []
        for a in range(k, nxt):
            if a in used:
                continue
            for b in range(a + 1, min(nxt, a + MAX_PIECES) + 1):
                if any(t in used for t in range(a, b)):
                    break
                st = STATS.get((a, b, i))
                if st is None:
                    break
                d, pen, vf = st
                if vf < VOICED_MIN or pen > 1.0:
                    continue
                z = (math.log(d) - math.log(rate) - math.log(rows[i]["exp"])) / SIGMA
                if abs(math.log(d / d0)) < 0.15 and z * z < 4.0:
                    if cleans is not None:
                        fc = feat(segs[a]["file"], segs[a]["s"], segs[b - 1]["e"])
                        same = dtw(fc, feat(segs[j]["file"], segs[j]["s"], segs[k - 1]["e"]))
                        others = []
                        for o in (order[pos + 1] if pos + 1 < len(order) else None, order[pos - 1] if pos > 0 else None):
                            if o is not None:
                                oj, ok_ = took[o]
                                others.append(dtw(fc, feat(segs[oj]["file"], segs[oj]["s"], segs[ok_ - 1]["e"])))
                        if others and same > 0.8 * min(others):
                            continue
                    cands.append((a, b))
        if cands:
            a, b = max(cands, key=lambda ab: (ab[0], ab[1] - ab[0]))
            notes[i] = f"読み直し：{fmt_t(segs[j]['s'])} の声をやめ、あとの {fmt_t(segs[a]['s'])} を使った"
            for t in range(j, k):
                used.discard(t)
            used.update(range(a, b))
            took[i] = (a, b)
    return took, notes


# ---------- 書き出し ----------

def fmt_t(t):
    m = int(t // 60)
    return f"{m}:{t - 60 * m:05.2f}"


def cut(x, s, e, lo, hi):
    a = int(max(lo, s - PAD) * SR)
    b = int(min(hi, e + PAD) * SR)
    y = x[a:b].copy()
    f = min(int(0.008 * SR), len(y) // 2)
    if f > 0:
        y[:f] *= np.linspace(0, 1, f)
        y[-f:] *= np.linspace(1, 0, f)
    return y


def main(argv=None):
    ap = argparse.ArgumentParser(description="作者の録音を、行ごとの声 n<番号>.wav に分ける")
    ap.add_argument("files", nargs="+")
    ap.add_argument("--lines", default="")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--voice", default=os.path.join(WORK, "voice"))
    ap.add_argument("--sim", default=None)
    ap.add_argument("--narration", default=os.path.join(REPO, "docs", "NARRATION-ad.md"))
    args = ap.parse_args(argv)
    simdir = args.sim or os.path.join(WORK, "voice", "sim10")

    rows = read_lines(args.narration)
    if args.lines:
        want = [int(w.strip().lstrip("nN")) for w in args.lines.split(",") if w.strip()]
        missing = [w for w in want if w not in {r["n"] for r in rows}]
        if missing:
            sys.exit(f"表にない番号：{missing}")
        rows = [r for r in rows if r["n"] in want]  # 表の順
    expected(rows, simdir)

    # 読む・きれいにする・切る
    raws, cleans, segs, infos = [], [], [], []
    for fi, path in enumerate(args.files):
        x = load(path)
        c, nf = clean(x)
        c, nclick = declick_gaps(c)
        sg, lv = segments(c, fi)
        raws.append(x)
        cleans.append(c)
        segs += sg
        infos.append(dict(path=path, dur=len(x) / SR, noise=nf, clicks=nclick, clip=float(np.abs(x).max()), **lv))

    cost, rate, plan = match(segs, rows)
    took, notes = prefer_last_take(segs, rows, plan, rate, cleans)

    # 行ごとの結果と、あやしい印
    results = []
    used = set()
    for i, r in enumerate(rows):
        res = dict(row=r, warn=[], note=notes.get(i, ""))
        if i not in took:
            res["warn"].append("見つからない")
            results.append(res)
            continue
        j, k = took[i]
        used.update(range(j, k))
        d, pen, vf = STATS[(j, k, i)]
        res.update(file=segs[j]["file"], s=segs[j]["s"], e=segs[k - 1]["e"], dur=d, voiced=vf, pieces=k - j)
        z = math.log(d / (rate * r["exp"]))
        res["z"] = z
        if abs(z) > 0.35:
            res["warn"].append("長さが見込みとちがう" + ("（長い）" if z > 0 else "（短い）"))
        if vf < VOICED_MIN:
            res["warn"].append("声らしくない")
        if pen > 1.0:
            res["warn"].append("中に長い切れ目")
        pk = float(np.abs(raws[res["file"]][int(res["s"] * SR):int(res["e"] * SR)]).max())
        if pk > 0.99:
            res["warn"].append("音が割れているかも")
        results.append(res)

    # 外した音
    dropped = []
    took_sorted = sorted((took[i][0], i) for i in took)
    for t, sg in enumerate(segs):
        if t in used:
            continue
        if sg["dur"] < 0.15:
            why, warn = "ごく短い音（クリック・物音）", False
        elif sg["voiced"] < VOICED_MIN:
            why, warn = "声でない音（咳・物音など）", False
        else:
            after = [i for j0, i in took_sorted if j0 > t and segs[j0]["file"] == sg["file"]]
            before = [i for j0, i in took_sorted if j0 < t and segs[j0]["file"] == sg["file"]]
            if after:
                i = after[0]
                if sg["dur"] <= results[i].get("dur", 0) * 1.15 + 0.2:
                    why, warn = f"n{rows[i]['n']} の読み直しの前の分（たぶん）", False
                else:
                    why, warn = f"n{rows[i]['n']} の前の、使わなかった声", True
            elif before:
                why, warn = "最後の行のあとの声", sg["dur"] > 1.5
            else:
                why, warn = "使わなかった声", sg["dur"] > 1.5
        dropped.append(dict(seg=sg, why=why, warn=warn))

    # 書き出し
    vo = args.voice
    os.makedirs(vo, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    targets = [os.path.join(vo, f"n{res['row']['n']}.wav") for res in results if "s" in res]
    exists = [p for p in targets if os.path.exists(p)]
    outdir, backup = vo, None
    if exists and not args.force:
        outdir = os.path.join(vo, f"_new_{stamp}")
    elif exists:
        backup = os.path.join(vo, f"_backup_{stamp}")
        os.makedirs(backup, exist_ok=True)
        for p in exists:
            shutil.copy2(p, backup)
    rawdir = os.path.join(outdir, "_raw")
    os.makedirs(rawdir, exist_ok=True)

    # 同じ録音の中の、ほかの切れに余白がかからないように
    bounds = {}
    for f in range(len(args.files)):
        bounds[f] = sorted((sg["s"], sg["e"]) for sg in segs if sg["file"] == f)
    check, ct = [], 0.0
    gap = np.zeros(int(CHECK_GAP * SR), np.float32)
    for res in results:
        if "s" not in res:
            continue
        f, s, e = res["file"], res["s"], res["e"]
        lo = max([b for a, b in bounds[f] if b <= s] + [s - PAD - 1]) + 0.03
        hi = min([a for a, b in bounds[f] if a >= e] + [e + PAD + 1]) - 0.03
        lo, hi = max(0.0, min(lo, s)), min(len(raws[f]) / SR, max(hi, e))
        y = cut(cleans[f], s, e, lo, hi)
        write_wav(os.path.join(outdir, f"n{res['row']['n']}.wav"), y)
        write_wav(os.path.join(rawdir, f"n{res['row']['n']}.wav"), cut(raws[f], s, e, lo, hi))
        res["check_at"] = ct
        check += [y, gap]
        ct += (len(y) + len(gap)) / SR
    if check:
        write_m4a(os.path.join(vo, "_check.m4a"), np.concatenate(check))

    # 表
    L = []
    L.append(f"声の切り分け（{datetime.datetime.now():%Y-%m-%d %H:%M}）")
    for k, inf in enumerate(infos):
        L.append(f"  録音 {k + 1}：{os.path.basename(inf['path'])}  {fmt_t(inf['dur'])}  部屋の音 {inf['noise']:.0f} dB  "
                 f"声 {inf['peak']:.0f} dB  言葉の外のプチッを下げた {inf['clicks']} 回" + ("  ⚠ 音が割れている所あり" if inf["clip"] > 0.99 else ""))
    L.append(f"  話す速さ：仮の声の {1 / rate:.2f} 倍の速さ（長さ {rate:.2f} 倍）。見込み ＝ 仮の声の長さ × {rate:.2f}")
    L.append(f"  書いた先：{outdir}" + (f"（今ある n ファイルは上書きしていない。よければ --force でもう一度）" if outdir != vo else ""))
    if backup:
        L.append(f"  前の n ファイルの写し：{backup}")
    L.append("")
    L.append("番号 | 読む言葉 | 録音の中の位置 | 長さ / 見込み | 確かめの音の位置 | 印")
    for res in results:
        r = res["row"]
        if "s" not in res:
            L.append(f"n{r['n']} | {bare(r['text'])} | — | — / {rate * r['exp']:.2f} 秒 | — | ⚠ {'・'.join(res['warn'])}")
            continue
        pos = (f"録音{res['file'] + 1} " if len(args.files) > 1 else "") + f"{fmt_t(res['s'])}–{fmt_t(res['e'])}"
        mark = ("⚠ " + "・".join(res["warn"])) if res["warn"] else ""
        if res["note"]:
            mark = (mark + "  " if mark else "") + res["note"]
        pieces = f"（{res['pieces']} 切れ）" if res["pieces"] > 1 else ""
        L.append(f"n{r['n']} | {bare(r['text'])} | {pos}{pieces} | {res['dur']:.2f} / {rate * r['exp']:.2f} 秒 | {fmt_t(res['check_at'])} | {mark}")
    L.append("")
    L.append(f"使わなかった音：{len(dropped)}")
    for d in dropped:
        sg = d["seg"]
        pos = (f"録音{sg['file'] + 1} " if len(args.files) > 1 else "") + f"{fmt_t(sg['s'])}–{fmt_t(sg['e'])}"
        L.append(f"  {pos}  {sg['dur']:.2f} 秒  {d['why']}" + ("  ⚠" if d["warn"] else ""))
    nwarn = sum(1 for res in results if res["warn"]) + sum(1 for d in dropped if d["warn"])
    L.append("")
    L.append(f"あやしい所：{nwarn}" + ("（_check.m4a を聞いて確かめる）" if nwarn else ""))
    text = "\n".join(L) + "\n"
    with open(os.path.join(vo, "_split_report.txt"), "w", encoding="utf-8") as f:
        f.write(text)
    print(text)
    return dict(results=results, dropped=dropped, rate=rate, outdir=outdir, backup=backup, warn=nwarn, segs=segs)


if __name__ == "__main__":
    main()
