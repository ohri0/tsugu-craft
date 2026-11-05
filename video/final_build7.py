# 最終案 7 の台本（final7.json ／ 工房ごとを外す版は final7B.json）を作る。時刻はすべて「拍」（120 拍／分 → 1 拍 0.5 秒、1 小節 ＝ 4 拍 ＝ 2 秒）。
# 設計は PLAN-final7.md（いちばん上の「作者の答え」が最優先）、声の 40 行は ../docs/NARRATION-ad.md。作りは final_build6.py のまま。
#  - 急いでたくさん見せない：絵は 36 くらい。細かい字の画面を読ませない。枠は動かさない（動くのは、ページが本当に動く所だけ）
#  - 指輪を見せる場面（つかみ・ネット・形が変わる・柱の一文）は、アプリの「見せる」の黒の上、斜め上から大きく。同じ場所で指輪だけ替わる
#  - 上がる音（ズームのような音）なし（risers は空）。ドロップ前のスネアの連打もなし（no_roll）
#  - VARIANT=A：工房ごとを入れる（348 拍 ＝ 2:54）／ VARIANT=B：外す（340 拍 ＝ 2:50。n15 は使わない。番号は詰めない）
#  - 作者の映像（work/footage/ring1.mov・ring2.mov）があれば差し替わる。ないときの代わりの絵は、下の HAND・REAL_RING で決まる
# 使い方：python -I final_build7.py → final7.json（VARIANT=B で final7B.json）。音楽の楽譜 score も同じ台本に書く（bgm5.py が読む）
import json, os, subprocess, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get("TSUGU_VIDEO_WORK", os.path.join(HERE, "work"))
VARIANT = os.environ.get("VARIANT", "A")
clips, text, voice, events = [], [], [], []

BG = "#000000"
WHITE, GOLD, GRAY, GREEN, RED = "#f5f5f7", "#e8c27a", "#a1a1a6", "#3ddc84", "#ff5a4e"
NOTE = "#7c7c80"                    # 下の小さな字（出どころ・見本の注）
WIN = [740, 90, 1100, 900]          # 右の窓（出力の px）。比 1.222
CENTER = [410, 30, 1100, 900]       # 真ん中の窓（指輪だけを見せる場面）
HX, HY = 120, 400                   # 見出しの左と、1 行目の字の下の線（どの場面も同じ）
H, S = 64, 32                       # 字の大きさは 2 つだけ
COLW = 590                          # 左の欄の幅（見出しと本文がはみ出さないか確かめる）
LOWY = (1000, 1045)                 # 下の小さな字の線（指輪を真ん中に置く場面）

# 撮った画面の中の枠（ページの px。比 1.222）
PRES7 = [655, 40, 892, 730]         # 「見せる」の指輪（hero7・first7。同じカメラ・同じ枠で、腕の輪が重なる。どの向きでも y 60〜749・x 912〜1328 に入る）
PRES7B = [700, 100, 806, 660]       # 右の窓の指輪（今の指輪だけなので、少し大きく。y 121〜749 が入る）
CELL = [804, 25, 632, 780]          # 見本 6 つの 1 つ（比 0.81。窓を 3 × 2 に分けた形）
CLOSE = [700, 60, 840, 687]         # 細い爪に寄った絵（word7 の closeRed・closeFixed）
WS_HALF = [840, 20, 520, 860]       # 工房ごと：半分の窓（比 0.60）
SPIKE = [800, 40, 800, 654]         # 尖った所：指輪・右上の札・断面の図が 1 つの枠に
FIELD = [1170, 376, 430, 352]       # 職人の言葉の欄（word7）。撮った枠の場所で下の word7 の所で直す
PROP = [1170, 548, 430, 352]        # Claude の案
PHONE = 480                         # スマホの幅で撮った画面の幅（ページの px）
PH = lambda y: [0, y, PHONE, 393]   # noqa: E731（スマホの幅の画面を、窓いっぱいに）


def has_foot(name):
    d = os.path.join(WORK, "footage")
    return os.path.isdir(d) and any(f.startswith(name) and f.lower().endswith((".mov", ".mp4", ".m4v")) for f in os.listdir(d))


# 作者の映像があるか。ないときは台本の代わりの絵で埋める（字も、言っていないことを言わないように変える）
HAND = has_foot("ring1")        # 作業台の手元（0:00–0:04）
REAL_RING = has_foot("ring2")   # 本物の指輪（2:44–2:47.5）。継ぐの図面から作った指輪（作者が書いてよいと言った）


def has(ch):
    return os.path.exists(os.path.join(WORK, "story", ch, "meta.json"))


def ev(b, what, owner=None):
    """新しく出るもの（拍・名前・持ち主の場面の頭）"""
    events.append([round(b * 2) / 2, what, b if owner is None else owner])


def win(at, ln, ch, cam=None, cut=True, **kw):
    """窓に本物の画面。cam は [[拍, 枠], ...]（枠は [x, y, w, h] か、名前）"""
    kw.setdefault("win", WIN)
    kw.setdefault("bg", BG)
    kw.setdefault("noblur", True)
    kw.setdefault("borderColor", "#2a2a2e")
    kw.setdefault("radius", 18)
    if cam is not None:
        kw["cam"] = [[k[0], {"v": k[1], "pad": 0.0}] + ([k[2]] if len(k) > 2 else []) for k in cam]
    clips.append(dict(at=at, len=ln, ch=ch, **kw))
    if cut:
        ev(at, f"絵：{ch}")


def ring(at, ln, ch, frm, spot=None, **kw):
    """黒の上の指輪（見せる）。枠の縁なし。frm は撮ったこまの番号か区切りの名前。spot なし：真ん中の窓（最初の版と重なる枠）。spot あり：右の窓（少し大きく）"""
    win(at, ln, ch, cam=[[0, PRES7B if spot else PRES7]], border=False, win=spot or CENTER, radius=0, **{"from": frm}, **kw)


def kind(at, ln, kd, cut=True, **kw):
    kw.setdefault("win", WIN)
    kw.setdefault("bg", BG)
    kw.setdefault("borderColor", "#2a2a2e")
    kw.setdefault("radius", 18)
    clips.append(dict(at=at, len=ln, kind=kd, **kw))
    if cut:
        ev(at, f"絵：{kd}")


def img(at, ln, path, area=None, **kw):
    kw.setdefault("win", WIN)
    kw.setdefault("bg", BG)
    kw.setdefault("border", False)
    clips.append(dict(at=at, len=ln, kind="img", img=path, fit="contain", area=area or [0, 0, WIN[2], WIN[3]], cam=[[0, [0, 0, 1, 1]], [ln, [0, 0, 1, 1]]], **kw))
    ev(at, f"絵：{os.path.basename(path)}")


def head(at, ln, lines, body=(), t0=1, bt=None, fout=0.5, step=1, **kw):
    """左の見出し：lines は行の並び。'/' で言葉に分け、'*' から始まる言葉は金色。言葉は t0 拍目から step 拍ずつ。本文は見出しの次の拍から 1 行ずつ（bt で拍を決めてもよい）"""
    out, r = [], t0
    for line in lines:
        chunks = []
        for w in line.split("/"):
            acc = w.startswith("*")
            chunks.append([w.lstrip("*"), r, acc])
            ev(at + r, f"見出し：{w.lstrip('*')}", at)
            r += step
        out.append(chunks)
    bl = []
    for i, b_ in enumerate(body):
        rr = bt[i] if bt else r + i
        bl.append([b_, rr])
        ev(at + rr, f"本文：{b_}", at)
    text.append(dict(mode="head", at=at, len=ln, lines=out, body=bl, fout=fout, x=HX, y=HY, H=H, S=S, **kw))


def low(at, ln, t, rel=0, y=None, color=NOTE, x=HX, fout=0.3):
    """下の小さな字（出どころ・注）"""
    text.append(dict(mode="head", at=at, len=ln, lines=[], body=[[t, rel, color]], fout=fout, x=x, y=y or 1040, H=H, S=S))
    ev(at + rel, f"本文：{t}", at)


def big(at, ln, t, pos, color=WHITE, sub=None, size=None):
    """絵の上の大きな数字（点と線なし）"""
    d = dict(mode="tag3", at=at, len=ln, text=t, label=pos, color=color, fout=0.4, size=size or H)
    if sub:
        d["sub"] = sub
    text.append(d)
    ev(at, f"札：{t}")


def logo(at, ln, x=HX, y=560, size=210, center=False):
    text.append(dict(mode="logo", at=at, len=ln, text="継ぐ", x=x, y=y, size=size, font="g3", center=center, fout=1.0))
    ev(at, "題：継ぐ")


def say(n, at, t):
    """声。番号は台本（docs/NARRATION-ad.md）のまま。工房ごとを外す版でも詰めない"""
    voice.append(dict(n=n, at=at, text=t))


sfx = []
# 細かい字をなくした（作者の声）ので、ここの数字はみな撮った画面から読んだ（2026-11-05。docs/LOG.md）
N_FIRST = {"prong": "1.66", "top": "6.30"}      # 最初の版（7606ee7）の画面：爪 ø 1.66 mm・高さ 6.30（その版の「高さ」は、今の「指から上」と同じ測り方）
N_NOW = {"prong": "0.80", "top": "3.97"}        # 今の既定の三角：爪 ø 0.80 mm・指から上 3.97 mm
N_WS = {"A": "0.80", "B": "1.41"}               # 工房ごと：石川工房・工房 B の画面の数字
N_THIN = {"before": "0.60", "after": "0.81", "rule": "0.7"}  # 見本（6 mm の石）：word7 の「これまでの作品」の数字


# ================================================================ 0:00 手元 → 職人の一言 → 指輪 2 つ（丸 Pt900 → 三角 K18）。同じ場所で指輪だけ替わる
QUOTE = [["この大きさの石なら、", False], ["爪はだいたい", False], ["0.8〜1 ミリ。", True]]
CPS, DELAY = 8.0, 0.25
K0 = 8 if HAND else 0   # 字を打ちはじめる拍。手元の映像がないときは、黒に 0 拍から打つ（台本の代わりの絵）
if HAND:
    clips.append(dict(at=0, len=8, kind="foot", foot="ring1", fallback=dict(kind="black", color=BG)))
    ev(0, "手元")
    clips.append(dict(at=8, len=4, kind="black", color=BG))
    ev(8, "黒")
    ring(12, 4, "hero7", "round", spot=WIN)
else:
    clips.append(dict(at=0, len=8, kind="black", color=BG))
    ev(0, "黒")
    ring(8, 8, "hero7", "round", spot=WIN, tr={"type": "xfade", "len": 1.0})
ring(16, 4, "hero7", "tri", spot=WIN)
text.append(dict(mode="type3", at=K0, len=19.6 - K0, lines=QUOTE, x=HX, y=HY, H=H, cps=CPS, delay=DELAY, fout=0.4))
n_ch = sum(len(t_) for t_, _ in QUOTE)
for i in range(n_ch):
    sfx.append([K0 + (DELAY + i / CPS) / 0.5, "key"])
ev(K0 + 0.5, "打つ字")
text.append(dict(mode="head", at=K0 + 4, len=19.6 - (K0 + 4), lines=[], body=[["職人の一言", 0, GRAY]], fout=0.4, x=HX, y=HY + 83 * 2 + 100, H=H, S=S))
ev(K0 + 4, "本文：職人の一言")
say(1, 0.5, "私は、彫金の職人です。")
say(2, 8.5, "作れるかどうかの判断は、職人の頭の中にしかない。")

# ================================================================ 0:10 題
clips.append(dict(at=20, len=4, kind="black", color=BG))
logo(20, 4, y=560)
text.append(dict(mode="head", at=20, len=4, lines=[], body=[["職人の判断を、次の人へ。", 1, "#c8c8cc"]], fout=0.5, x=HX, y=655, H=H, S=S))
ev(21, "本文：職人の判断を、次の人へ。")
say(3, 20.5, "継ぐは、それを蓄えます。")

# ================================================================ 0:12 行き来の図：デザイン → 制作、作れない、と戻る ／ 継ぐなら、デザインの時点で作れる
T = 24
FLOW = {"p2": 8, "go2": [10, 12], "ok": 12, "arc": [2, 0], "arcH": 0.26, "okText": "作れる",
        "path": [[0.9, 0, False], [2.4, 2, False], [3.2, 0, True], [4.4, 2, False], [5.2, 0, True], [6.4, 2, False], [7.0, 0, True], [7.8, 2, False]]}
kind(T, 16, "flow4", k=FLOW)
ev(T + 2.4, "図：作れない 1", T); ev(T + 4.4, "図：作れない 2", T); ev(T + 6.4, "図：作れない 3", T); ev(T + 8, "図：継ぐ", T); ev(T + 12, "図：作れる", T)
head(T, 8, ["デザインと制作を、", "*行ったり来たり。"], ["作れない、と戻ってくる。"], bt=[3])
head(T + 8, 8, ["デザインの時点で、", "*作れる 3D に。"], ["職人の判断で、作れるか分かる。"], bt=[3])
say(4, T + 1, "作れない、と何度もデザインに戻ってくる。")
say(5, T + 9, "継ぐなら、デザインの時点で、作れるか分かる。")

# ================================================================ 0:20 ネットの情報だけ：本物の最初の版（7606ee7）。黒の上、斜め上から、真ん中に
T = 40
ring(T, 8, "first7", 0, speed=0.6)  # ゆっくり回る（横を向きすぎないところまで）
text.append(dict(mode="head", at=T, len=8, lines=[], body=[["継ぐの最初の版 ・ ネットの情報だけ", 1, WHITE]], fout=0.4, x=HX, y=LOWY[0], H=H, S=S))
text.append(dict(mode="head", at=T, len=8, lines=[], body=[["爪が太く、腕から生えている。", 2.5, GRAY]], fout=0.4, x=HX, y=LOWY[1], H=H, S=S))
ev(T + 1, "本文：最初の版"); ev(T + 2.5, "本文：爪が太く")
say(6, T + 1, "ネットの情報だけだと、不自然な形になる。")

# ================================================================ 0:24 職人の言葉 → Claude が決まりに（アプリの画面のまま。2 つの枠は切ってつなぐ。枠は動かさない）
T = 48
# word7 の区切り（撮ったこまの meta.json）を読む
WM = json.load(open(os.path.join(WORK, "story", "word7", "meta.json")))["marks"] if has("word7") else {}
WB = json.load(open(os.path.join(WORK, "story", "word7", "meta.json")))["boxes"] if has("word7") else {}
if WB.get("field"):
    b_ = WB["field"]
    FIELD = [1170, max(60, b_["y"] - 60), 430, 352]
if WB.get("proposal"):
    b_ = WB["proposal"]
    PROP = [1170, max(60, b_["y"] - 40), 430, 352]
if WM:
    win(T, 8, "word7", cam=[[0, FIELD]], ramp=[[0, "type-14"], [0.5, "type"], [6.2, "typed"], [7.2, "typed+8"], [8, "wait"]], keys=[["type", "typed"]])
    win(T + 8, 8, "word7", cam=[[0, PROP]], ramp=[[0, "proposal"], [5.0, "proposal+40"], [6.2, "applied-3"], [7.0, "applied+3"], [8, "applied+18"]],
        focus=[[4.4, "ok", 0.0], [5.0, "ok", 1.0], [6.4, "ok", 1.0], [6.8, "ok", 0.0]], focusDim=0.5, focusWidth=2)
    ev(T + 13, "枠：これでいい")
else:
    kind(T, 16, "black", color=BG)
head(T, 8, ["職人の言葉を、", "*そのまま入れる。"], fout=0.35)
head(T + 8, 8, ["Claude が、", "*決まりにする。"], ["言葉から、数字つきの決まりに。"], bt=[3])
say(7, T + 1, "職人の言葉を、そのまま入れる。")
say(8, T + 9, "Claude が、それを決まりにする。")

# ================================================================ 0:32 形が変わる：最初の版の止まった絵 → 音楽の一打で、今の版。同じ場所・同じカメラ。そこからゆっくり回る
T = 64
ring(T, 4, "first7", 0, hold=True)
ring(T + 4, 12, "hero7", "tri", speed=0.6)
text.append(dict(mode="head", at=T + 4, len=12, lines=[], body=[[f"爪 ø {N_FIRST['prong']} → {N_NOW['prong']} mm ・ 指から上 {N_FIRST['top']} → {N_NOW['top']} mm", 1.5, WHITE]], fout=0.4, x=HX, y=LOWY[0], H=H, S=S))
text.append(dict(mode="head", at=T + 4, len=12, lines=[], body=[["石座（石を留める所）は、腕の間に挟む。石は、低く。", 5, GRAY]], fout=0.4, x=HX, y=LOWY[1], H=H, S=S))
ev(T + 5.5, "本文：数字"); ev(T + 9, "本文：石座")
say(9, T + 4.5, "職人の言葉で、爪も、石座のデザインも変わった。")

# ================================================================ 0:40 これまでの作品：見本 6 つが並ぶ → 1 つだけ赤く → 大きく → 同じ場所で直る
T = 80
SP7 = 0.5  # 並びの指輪は半分の速さで回す（撮ったのは 1 つ 70 こま）
def cells(thin, skip=0.0):
    out = []
    for i in range(5):
        out.append({"ch": "word7", "from": f"s{i}+{skip}", "speed": SP7, "cam": [[0, {"v": CELL, "pad": 0.0}]], "noblur": True})
    out.append({"ch": "word7", "from": f"{thin}+{skip}", "speed": SP7, "cam": [[0, {"v": CELL, "pad": 0.0}]], "noblur": True})
    return out


if WM:
    kind(T, 5, "grid", cells=cells("thinPlain"), cols=3, rows=2, border=False, radius=0)
    kind(T + 5, 3, "grid", cells=cells("thinRed", 5 * 15 * SP7), cols=3, rows=2, border=False, radius=0)
    ev(T + 5, "絵：1 つだけ赤く")
    win(T + 8, 6, "word7", cam=[[0, CLOSE]], border=False, radius=0, **{"from": "closeRed"})
    win(T + 14, 6, "word7", cam=[[0, CLOSE]], border=False, radius=0, **{"from": "closeFixed"})
else:
    kind(T, 20, "black", color=BG)
head(T, 8, ["これまでの作品も、", "*確かめ直す。"], ["6 作品のうち、1 作品が作れない。"], bt=[5])
head(T + 8, 6, ["この作品の爪が、", "*細すぎた。"], fout=0.3)
big(T + 9, 5, f"爪 ø {N_THIN['before']} mm", (WIN[0] + 44, WIN[1] + 74), color=RED, sub=f"職人の決まり：最低 {N_THIN['rule']} mm")
head(T + 14, 6, ["まとめて、", "*直す。"])
big(T + 15, 5, f"爪 ø {N_THIN['after']} mm", (WIN[0] + 44, WIN[1] + 74), color=GOLD)
low(T, 20, "記録の作品は見本（継ぐが組んだ物。職人の作品ではない）", rel=0.5)
say(10, T + 1, "これまでの作品も、その決まりで確かめ直す。")
say(11, T + 8.5, "この作品の爪が、細すぎた。")
say(12, T + 14.5, "まとめて直す。")

# ================================================================ 0:50 Claude が聞きに来る（帳面。スマホの幅。枠は動かさない）→ 答えると決まりに
T = 100
LM = json.load(open(os.path.join(WORK, "story", "ledger7m", "meta.json"))) if has("ledger7m") else None
if LM:
    B_ = LM["boxes"]
    box_ = lambda k: [B_[k]["x"], B_[k]["y"], B_[k]["w"], B_[k]["h"]]  # noqa: E731
    # Claude の問い → 職人の言葉を打つ（問いは Claude が言い直した本物。答えは作者の言葉）
    win(T, 12, "ledger7m", cam=[[0, [0, 46, PHONE, 393]]], ramp=[[0, "asked"], [3, "asked+36"], [9.5, "typed"], [12, "typed+10"]], keys=[["asked+40", "typed"]],
        focus=[[0.3, box_("q"), 0.0], [0.9, box_("q"), 1.0], [3.0, box_("q"), 1.0], [3.6, box_("answer"), 1.0], [11.5, box_("answer"), 1.0]], focusDim=0.45, focusWidth=2)
    # Claude がまとめた決まり。「帳面に入れる」を押す手前で切る（押すと画面が上に戻るので）
    win(T + 12, 8, "ledger7m", cam=[[0, [22, 276, 437, 358]]], ramp=[[0, "draft"], [8, "draft+60"]])
else:
    kind(T, 20, "black", color=BG)
ev(T + 1, "枠：問い"); ev(T + 4, "枠：答え")
head(T, 12, ["帳面に足りない所は、", "Claude が、", "*聞きに来る。"], fout=0.35)
head(T + 12, 8, ["答えると、", "*それが決まりになる。"], ["職人の言葉も、そのまま残る。"], bt=[3])
low(T, 20, "帳面：職人の言葉と、選んだ資料。", rel=0.5)
say(13, T + 1, "帳面に足りない所は、Claude が聞きに来る。")
say(14, T + 13, "答えると、それが決まりになる。")

# ================================================================ 1:00 決まりは、工房ごとに（入れた版だけ）
T = 120
WSLEN = 0 if VARIANT == "B" else 8   # 工房ごとの拍。外す版では、うしろが 4 秒早くなる
if WSLEN:
    clips.append(dict(at=T, len=8, kind="split", win=WIN, bg=BG, border=False, radius=0, sides=[
        # 撮った素材は A・B の区切りが別（各 130 こま）。この場面は 120 こま使う：左が工房 B に替わることはない（下の「確かめ」で確かめる）
        {"ch": "workshops7", "from": "A", "speed": 1.0, "cam": [[0, {"v": WS_HALF, "pad": 0.0}]], "noblur": True},
        {"ch": "workshops7", "from": "B", "speed": 1.0, "cam": [[0, {"v": WS_HALF, "pad": 0.0}]], "noblur": True}]))
    ev(T, "絵：工房ごと")
    head(T, 8, ["決まりは、", "*工房ごとに。"])
    big(T + 3, 5, f"ø {N_WS['A']} mm", (WIN[0] + 36, WIN[1] + 74), color=GOLD, sub="石川工房")
    big(T + 4, 4, f"ø {N_WS['B']} mm", (WIN[0] + WIN[2] // 2 + 42, WIN[1] + 74), color=WHITE, sub="工房 B")
    say(15, T + 1, "決まりは、工房ごとに。")
T += WSLEN

# ================================================================ 1:04 尖った所：赤く点滅 → 断面を丸く描き直す → 消えて「作れます」
# spike7 を 1 倍のまま流す：拍 8.7 までカーソルなしで赤が点滅（撮った 60〜190 こま）、拍 9.6 から描く、拍 12 で描き終わって消える（240 こま目）
if has("spike7"):
    win(T, 16, "spike7", cam=[[0, SPIKE]], **{"from": "red+60"})
else:
    kind(T, 16, "black", color=BG)
ev(T + 9.5, "カーソル"); ev(T + 12, "枠：作れます")
head(T, 16, ["尖った所は、", "*赤く知らせる。"], ["薄い先は、欠けたり曲がったりする。"], bt=[4])
say(16, T + 1, "腕に尖った所があると、赤く点滅して、作れないと分かる。")
say(17, T + 11.5, "直すと、消える。")
T += 16

# ================================================================ 1:12 形から、作り方まで（札をゆっくり。枠は札の幅。字は大きい）
# make7m を 1 倍のまま流す：03 で 1 秒（12〜42 こま）→ ゆっくり下へ 4.3 秒（42〜172）→ 04 の「職人の決まり」で止める 2.7 秒（172〜252）
if has("make7m"):
    MM = json.load(open(os.path.join(WORK, "story", "make7m", "meta.json")))
    MK = [0, MM["boxes"]["panel"]["y"] if False else 404, PHONE, 393]
    RB = MM["boxes"]["rule"]
    win(T, 16, "make7m", cam=[[0, MK]], **{"from": "card3+10"},
        focus=[[10.0, [RB["x"], RB["y"], RB["w"], RB["h"]], 0.0], [11.0, [RB["x"], RB["y"], RB["w"], RB["h"]], 1.0], [15.8, [RB["x"], RB["y"], RB["w"], RB["h"]], 1.0]], focusDim=0.5, focusWidth=2)
    ev(T + 11, "枠：職人の決まり")
else:
    kind(T, 16, "black", color=BG)
head(T, 16, ["形から、", "*作り方まで。"], ["職人の言葉は、その工程に。"], bt=[9])
say(18, T + 1, "形から、作り方まで出る。")
say(19, T + 9, "職人の言葉は、その工程に残る。")
T += 16

# ================================================================ 1:20 学校：独自のデザインは、先生に聞くしかない
kind(T, 16, "school3", k={"checks": [8, 10], "clock": 12, "clockText": "長いとき 1 時間", "shapes": ["round", "oval", "tri", "square", "emerald", "marq"]})
ev(T + 8, "図：確認 1", T); ev(T + 10, "図：確認 2", T); ev(T + 12, "図：待ち時間", T)
head(T, 16, ["独自のデザインは、", "*先生に聞くしかない。"], ["生徒は多く、先生は少ない。", "長いときは 1 時間待つ。"], bt=[8.5, 11], fout=0.35)
low(T, 16, "1 時間は、作者が見てきた例。", rel=12)
say(20, T + 1, "独自のデザインは、先生に聞くしかない。")
say(21, T + 8, "生徒は多く、先生は少ない。長いときは 1 時間待つ。")
T += 16

# ================================================================ 1:28 継ぐなら、すぐ答えが出る（枠は動かさない）
win(T, 8, "learn4m", ramp=[[0, 96], [1, 106], [5.5, 146], [7, 165], [8, 166]], cam=[[0, PH(270)]])
head(T, 8, ["継ぐなら、", "*すぐ答えが出る。"], ["帳面の決まりから、出どころつきで。"], bt=[4])
say(22, T + 1, "継ぐなら、すぐ答えが出る。")
T += 8

# ================================================================ 1:32 工房：順番と数字は継ぐに聞く ／ 先輩に教わるのは手の感覚だけ
kind(T, 16, "senior5", k={"q1": 1.5, "q2": 2.5, "ans": 3.5, "feel": 9.5, "feelText": "手の感覚"})
ev(T + 1.5, "図：順番は？", T); ev(T + 2.5, "図：何 mm？", T); ev(T + 3.5, "図：継ぐの答え", T); ev(T + 9.5, "図：手の感覚", T)
head(T, 8, ["工房では、", "順番と数字を、", "*継ぐに聞く。"], fout=0.35)
head(T + 8, 8, ["先輩に教わるのは、", "*手の感覚だけ。"], ["言葉にできたら、それも帳面に。"], t0=1, bt=[4])
say(23, T + 1, "工房では、順番や数字は継ぐに聞く。")
say(24, T + 9, "先輩には、まだ言葉にできない手の感覚を。")
T += 16

# ================================================================ 1:40 つなぎ → 作り手の数 → 20 年に一度 → 鐔・太刀 → もし途絶えても（静かな所）
clips.append(dict(at=T, len=8, kind="black", color=BG))
ev(T, "黒")
head(T, 8, ["そして、", "伝統工芸の", "*継承にも使える。"], fout=0.5)
say(25, T + 1, "そして、伝統工芸の継承にも使える。")
T += 8
kind(T, 12, "stat3", k={"grow": 3})
ev(T + 3, "図：帯が縮む")
head(T, 12, ["技を知る人が、", "*減っていく。"], ["24 年で、約 6 割減。"], bt=[6])
low(T, 12, "出典：経済産業省 説明資料（伝統的工芸品産業振興協会の集計。2022 年度）", rel=4)
say(26, T + 1, "伝統的工芸品の作り手は、約 6 割減った。")
T += 12
img(T, 12, "public/heritage/naiku-1953.jpg")
head(T, 12, ["20 年に一度しか、", "受け継ぐ機会が", "*ない技もある。"], ["伊勢神宮の神宝は、20 年に一度、作り直す。", "彫金・金工の技も、使われる。"], bt=[3.5, 6])
low(T, 12, "写真：1953 年の内宮（本田照夫 撮影・Wikimedia Commons・パブリックドメイン）")
say(27, T + 1, "20 年に一度しか、受け継ぐ機会がない技もある。")
T += 12
ITEMS = [
    {"img": "public/heritage/tsuba-carp.jpg", "area": [40, 40, 470, 500]},
    {"img": "public/heritage/tachi.jpg", "area": [540, 110, 520, 330]},
    {"img": "public/heritage/kazari-tachi.jpg", "area": [40, 600, 1020, 250]}]
kind(T, 8, "imgs", border=False, items=ITEMS)
head(T, 8, ["彫金・金工は、", "*ジュエリーと同じ技。"])
low(T, 8, "鐔・太刀：メトロポリタン美術館（CC0）／飾太刀：東京国立博物館 ColBase（CC BY 4.0）")
say(28, T + 1, "彫金・金工は、ジュエリーと同じ技。")
T += 8
# 同じ絵のまま、2 秒でゆっくり黒くなる（絵の中は動かさない。出る時刻をはじめから止める）
ITEMS_STILL = [dict(it, at=-10) for it in ITEMS]
kind(T, 4, "imgs", border=False, items=ITEMS_STILL, grade={"dim": [0.0, 1.0]}, cut=False)
head(T, 4, ["もし、", "*途絶えてしまっても。"], fout=0.3)
say(29, T + 0.5, "もし、途絶えてしまっても。")
T += 4

# ================================================================ 2:02 木目金の歴史（秋田県の無形文化財「杢目金」の説明の言葉だけ）
win(T, 16, "rebuild3", ramp=[[0, 0], [16, 36]], cam=[[0, [416, 40, 768, 628]]])
head(T, 16, ["木目金は、", "江戸時代の", "*刀の飾りの技。"], ["一時途絶えたとされ、", "のちに復元された。"], bt=[9, 10])
low(T, 16, "出典：秋田県 無形文化財「杢目金」の説明（秋田県のウェブサイト）", rel=0.5)
say(30, T + 1, "木目金は、江戸時代の刀の飾りの技。")
say(31, T + 9, "一時途絶えたとされ、のちに復元された。")
T += 16

# ================================================================ 2:10 作り方を Claude に隠す → 2:14 Claude が復元を試みる（rebuild3。撮り直さない）
# 前の場面と同じ枠から始めて、1.5 拍で手がかりの所へ下げる（ページが本当に動く所）
win(T, 8, "rebuild3", ramp=[[0, 37], [8, 120]], cam=[[0, [416, 40, 768, 628]], [1.5, [416, 300, 768, 628], "cio"]])
head(T, 8, ["作り方を、", "*Claude に隠す。"], ["渡すのは、残った品物の手がかりだけ。"], bt=[4])
say(32, T + 1, "作り方を隠して、手がかりだけを渡す。")
T += 8
win(T, 8, "rebuild3", ramp=[[0, 130], [0.8, 137], [1.6, 160], [2.4, 186], [3.2, 202], [8, 270]], cam=[[0, [416, 470, 768, 628]], [2.4, [416, 470, 768, 628]], [3.4, [416, 170, 768, 628], "cio"]])
head(T, 8, ["Claude が、", "作り方の復元を、", "*試みる。"], ["手がかりから、一つずつ。"], bt=[4])
say(33, T + 1, "Claude が、作り方の復元を試みる。")
T += 8

# ================================================================ 2:18 本当の 11 の手順と比べる（36 拍。本物の答え合わせ grade.json）：灯り → 9 / 11 → 組み立て直せるかもしれない
G = json.load(open(os.path.join(WORK, "story", "rebuild3", "grade.json"))) if has("rebuild3") else None
# 本当の工程の名前は、research/mokume/answer.md の言葉から（短く）
NAMES = ["銅・赤銅・四分一など、色のちがう地金の板を用意する", "重ねる面をみがいて、きれいにする", "色ちがいの板を、交互に重ねる", "重ねた板を、鉄の板ではさんで縛る",
         "木炭の火床で熱し、ろうを使わずにつなぐ", "火から出してすぐ叩き、つながりを仕上げる", "叩いてのばす（焼きなましをはさむ）", "表面を鏨で彫って、下の層を出す",
         "叩いて平らにし、彫りとくり返す", "鍔などの品物の形にする", "磨いて煮色で、層の色を出す"]
kinds = ["miss"] * 11
if G:
    best = {}
    for s_ in G["steps"]:
        for aid in s_["answer"].replace(" ", "").split("・"):
            if aid.startswith("A"):
                i = int(aid[1:]) - 1
                v = "ok" if s_["verdict"] == "ok" else "part"
                if best.get(i) != "ok":
                    best[i] = v
    for i, v in best.items():
        kinds[i] = v
lit = [i for i in range(11) if kinds[i] != "miss"]
n_ok, n_part = sum(1 for k in kinds if k == "ok"), sum(1 for k in kinds if k == "part")
rows = [[f"A{i + 1}", NAMES[i], kinds[i]] for i in range(11)]
lights = [[3 + j, i] for j, i in enumerate(lit)]
kind(T, 36, "check3", k={"rows": rows, "lights": lights, "hit": 12, "title": "本当の手順（隠しておいた答え）", "score": f"{len(lit)} / 11", "legend": f"● 一致 {n_ok}　◐ 一部 {n_part}　○ たどり着けず {11 - len(lit)}"})
for b_, _ in lights:
    ev(T + b_, "図：灯り", T)
ev(T + 12, "図：9 / 11", T); ev(T + 13, "図：凡例", T)
HIT = T + 12
head(T, 12, ["隠しておいた、", "*本当の 11 の手順。"], fout=0.4)
# 同じ手がかりで、本物の Claude で 4 回組み立てた（動画の 9 / 11 は rebuild3 を撮った回。ほかに 9/11・10/11・公開の記録の 10/11。2026-11-05）
TRIES = os.environ.get("REBUILD_TRIES", "4 回試して、9〜10 / 11。")
# 手がかりから 6、もともとの知識から 3：撮ったときの答え合わせの結果（アプリの画面の言葉）
head(T + 12, 12, ["11 のうち、", f"*{len(lit)} に、たどり着いた。"], ["手がかりから 6、もともとの知識から 3。", TRIES], bt=[3, 5])
head(T + 24, 12, ["失われた技も、", "手がかりから、", "*組み立て直せる", "*かもしれない。"], fout=0.4)
say(34, T + 1, "隠しておいた、本当の 11 の手順と比べる。")
say(35, T + 12.5, f"11 のうち {len(lit)} に、たどり着いた。")
say(36, T + 25, "失われた技も、手がかりから組み立て直せるかもしれない。")
T += 36

# ================================================================ 2:36 柱の一文（黒の上、右に今の指輪。ゆっくり回る）
FINAL = T
ring(T, 16, "hero7", "tri+400", spot=WIN, speed=0.62)  # うしろの側からの絵（前の場面と同じ向きを繰り返さない）。少しゆっくり
head(T, 8, ["職人の判断を、", "*蓄える。"], fout=0.4)
head(T + 8, 8, ["失われた技まで、", "*組み立て直す。"], fout=0.6)
say(37, T + 1, "職人の判断を、蓄える。")
say(38, T + 9, "失われた技まで、組み立て直す。")
T += 16

# ================================================================ 2:44 本物の指輪（作者の映像。全画面）。ないときは hero7 の指輪を真ん中に大きく（字なし：本物ではないので）
RING_FB = dict(ch="hero7", win=CENTER, bg=BG, noblur=True, border=False, radius=0, cam=[[0, {"v": PRES7, "pad": 0.0}]], **{"from": "tri+20"})
clips.append(dict(at=T, len=7, kind="foot", foot="ring2", fallback=RING_FB))
ev(T, "本物の指輪" if REAL_RING else "指輪（代わりの絵）")
if REAL_RING:
    text.append(dict(mode="head", at=T, len=7, lines=[], body=[["継ぐの図面から作った指輪。", 1, WHITE]], fout=0.4, x=HX, y=LOWY[1], H=H, S=S))
    ev(T + 1, "本文：継ぐの図面から作った指輪")
T += 7

# ================================================================ 2:47.5 継ぐ：黒 → 題（一打）→ 右に本物の git の履歴
E = T
clips.append(dict(at=E, len=5, kind="black", color=BG))
ev(E, "黒")
REPO = os.path.dirname(HERE)
try:
    # 作者が映したくない言葉（魚々子）のある行は出さない（2026-11-04 作者の声）。残りは本物の履歴の順のまま
    NOSHOW = ("魚々子",)
    LOGL = [l_ for l_ in subprocess.run(["git", "-C", REPO, "log", "--oneline", "-n", "40"], capture_output=True, text=True).stdout.strip().splitlines()
            if not any(w in l_ for w in NOSHOW)][:11]
    NCOM = subprocess.run(["git", "-C", REPO, "rev-list", "--count", "HEAD"], capture_output=True, text=True).stdout.strip()
except Exception:
    LOGL, NCOM = [], "?"
cut = lambda t, n=23: t if len(t) <= n else t[: n - 1] + "…"  # noqa: E731
TERM = {"cmd": "$ git log --oneline", "lines": [[l_.split(" ", 1)[0], cut(l_.split(" ", 1)[1] if " " in l_ else "")] for l_ in LOGL],
        "foot": f"11 月 2 日から、{NCOM} コミット（並行の作業も Claude Code）", "foot_at": 1.0}
kind(E + 5, 8, "term", k=TERM, border=True, win=[740, 90, 1100, 820])
logo(E + 1, 12, y=520)
text.append(dict(mode="head", at=E + 1, len=12, lines=[], body=[["職人の判断を、次の人へ。", 1, WHITE], ["このアプリも、彫金職人が", 3, GRAY], ["Claude Code と作りました。", 4, GRAY]], fout=1.5, x=HX, y=615, H=H, S=S))
ev(E + 2, "本文：次の人へ"); ev(E + 4, "本文：このアプリも"); ev(E + 5, "本文：Claude Code と"); ev(E + 6, "図：コミット数")
# おわりの小さな字（作者の映像があるときだけ「作者の撮影」と書く）
CR1 = ("手元と本物の指輪は、作者の撮影。" if HAND and REAL_RING else "本物の指輪は、作者の撮影。" if REAL_RING else "手元は、作者の撮影。" if HAND else "") + "指輪と画面は、継ぐの実際の出力（並べ方は編集）。"
CR2 = "Claude の答えも、撮ったときのまま。音楽と効果音は、自作の合成。"
text.append(dict(mode="head", at=E + 3, len=10, lines=[], body=[[CR1, 0, NOTE], [CR2, 0, NOTE]], fout=1.5, x=HX, y=985, H=H, S=S))
ev(E + 3, "出どころ")
LEN = E + 13   # 入れた版 348 拍 ＝ 2:54 ／ 外した版 340 拍 ＝ 2:50
say(39, E + 1, "継ぐ。")
say(40, E + 3, "このアプリも、私が Claude Code と作りました。")

# ================================================================ 音楽の楽譜（bgm5.py が読む）。段・止める所・一打は、上の並びに合わせた。上がる音はなし
O_ = WSLEN - 8  # 工房ごとを外すと、1:00 からうしろが 8 拍早くなる（light の段が 8 拍短くなる）
SECT = [(0, "hook"), (8, "intro"), (20, "title"), (24, "intro2"), (32, "verse"), (40, "tension"), (48, "build"), (68, "drop"), (80, "groove"), (100, "light"),
        (128 + O_, "groove"), (160 + O_, "bridge"), (200 + O_, "breakdown"), (244 + O_, "build2"), (276 + O_, "reveal"), (312 + O_, "final"), (328 + O_, "outro")]
RING_B = [12, 16] if HAND else [8, 16]   # 指輪が出る・替わる所の金床（手元の映像がないときは、拍 8 に丸が出る）
score = {
    "key": [[0, 0], [312 + O_, 2]],
    "hook_drone": True,
    "no_roll": True,   # ドロップ前のスネアの連打をやめる（上がる音と同じく、作者が嫌う「上げて落とす」感じなので。一度止めて、静かな所から一打）
    "sections": [{"at": a, "len": b_ - a, "name": n} for (a, n), (b_, _) in zip(SECT, SECT[1:] + [(LEN, "")])],
    "stops": [[67, 68], [287.5 + O_, 288 + O_], [335 + O_, 336 + O_]],
    "impacts": [68, 288 + O_],
    "reveal_hit": 288 + O_,
    "anvil": [[RING_B[0], 76, "motif"], [RING_B[1], 74, "motif"], [20, 69, "title"],
              [328 + O_, 78, "motif"], [329 + O_, 76, "motif"], [330 + O_, 74, "motif"], [336 + O_, 81, "title"]],
    "risers": [],
    "pings": [],
    "ticks": [[276 + O_ + b, m] for (b, _), m in zip(lights, [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96])],
}

# ---------------------------------------------------------------- 作者の声に合わせて、場面をのばす（つめる動きは、最終案 7 ではやめた：ゆっくり見せる場面が短くなるため）
# 作者の録音 work/voice/n<番号>.wav（.m4a・.mp3・.aif なども可）があれば、その長さで場面の長さを決める。録音の速さは変えない。
#  1. 録音を整える：前とうしろの無音を切る・低い雑音を除く・大きさをそろえる → work/voice/_own/n<番号>.wav（final.py はこれを使う）
#  2. 声が入りきらないとき：その場面のおわり（次の見出しの頭）で、絵をその所で止めて、小節（4 拍 ＝ 2 秒）ずつのばす。音楽も同じ所でのびる
#  録音がない行は、今までどおり機械の声（仮声）で、時刻も変えない。切り替えは小節の頭のまま
import math  # noqa: E402

OWN_DIR = os.environ.get("TSUGU_OWN_VOICE", os.path.join(WORK, "voice"))
OWN_EXT = (".wav", ".m4a", ".mp3", ".aif", ".aiff", ".flac", ".caf")
SEC = 0.5                  # 1 拍の秒
HEAD_S, GAP_S = 0.15, 0.3  # final.py と同じ：声は拍の頭 + 0.15 秒から。前の声が長ければ、終わって 0.3 秒あけてから
OVER, PUSH = 2.0, 1.5      # 声が次の場面へはみ出してよい拍 ／ 次の場面の声が遅れてよい拍
fit_log = []


def probe(f):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).decode())


def own_src(n):
    for e_ in OWN_EXT:
        f = os.path.join(OWN_DIR, f"n{n}{e_}")
        if os.path.exists(f):
            return f
    return None


def prep_own(n, src):
    """録音を整える（速さは変えない）：前とうしろの無音を切る（0.06 秒・0.15 秒だけ残す）、75 Hz より低い音を除く、
    聞こえる大きさを -16 LUFS（機械の声と同じ）、山 -1.5 dB に。結果は work/voice/_own/n<番号>.wav"""
    import numpy as np
    d_ = os.path.join(OWN_DIR, "_own")
    os.makedirs(d_, exist_ok=True)
    dst = os.path.join(d_, f"n{n}.wav")
    st = os.stat(src)
    key = f"{os.path.basename(src)} {st.st_size} {st.st_mtime_ns}"  # 録り直したら、作り直す
    kf = dst[:-4] + ".key"
    if os.path.exists(dst) and os.path.exists(kf) and open(kf).read() == key:
        return dst, probe(dst)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-ac", "1", "-ar", "48000", "-f", "f32le", "-"], capture_output=True, check=True).stdout
    a_ = np.frombuffer(raw, np.float32)
    hop = 480  # 10 ミリ秒
    nfr = max(1, len(a_) // hop)
    db = 20 * np.log10(np.sqrt(np.mean(a_[: nfr * hop].reshape(nfr, hop) ** 2, axis=1) + 1e-12))
    thr = max(np.percentile(db, 10) + 10, np.percentile(db, 99) - 35)  # 部屋の静かさに合わせた、声のはじまりの大きさ
    on = np.where(db > thr)[0]
    t0_ = max(0.0, (on[0] if len(on) else 0) * hop / 48000 - 0.06)
    t1_ = min(len(a_) / 48000, ((on[-1] if len(on) else nfr - 1) + 1) * hop / 48000 + 0.15)
    ln_ = t1_ - t0_
    chain = f"atrim={t0_:.3f}:{t1_:.3f},asetpts=PTS-STARTPTS,highpass=f=75,afade=t=in:d=0.03,afade=t=out:st={max(0.0, ln_ - 0.08):.3f}:d=0.08"
    out_ = subprocess.run(["ffmpeg", "-hide_banner", "-i", src, "-af", chain + ",loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], capture_output=True, text=True).stderr
    try:
        j = json.loads(out_[out_.rindex("{"): out_.rindex("}") + 1])
        float(j["input_i"]), float(j["input_tp"])
        if not math.isfinite(float(j["input_i"])):
            raise ValueError
        chain += (f",loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}"
                  f":measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true")
    except Exception:
        pass  # 測れないとき（ほとんど無音など）は、切るだけ
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-af", chain, "-ar", "48000", "-ac", "2", dst], check=True)
    open(kf, "w").write(key)
    return dst, probe(dst)


_tts = {}


def tts_dur(v):
    f = os.path.join(WORK, "voice", f"k7_n{v['n']}.wav")
    if f not in _tts:
        _tts[f] = probe(f) if os.path.exists(f) else 0.0
    return _tts[f]


def place(vs):
    """final.py と同じ置き方：各行の（はじめ, おわり）秒。機械の声は、次に間に合わないとき 1.25 倍まで速める"""
    se, prev = [], 0.0
    for i, v in enumerate(vs):
        d = v["own_dur"] if v.get("own") else tts_dur(v)
        at = max(v["at"] * SEC + HEAD_S, prev + GAP_S)
        if d > 0 and not v.get("own") and i + 1 < len(vs):
            room = vs[i + 1]["at"] * SEC + HEAD_S - GAP_S - at
            if 0 < room < d:
                d = d / min(1.25, d / room)
        se.append((at, at + d))
        if d > 0:
            prev = at + d
    return se


def bounds():
    """場面の切れ目：見出しの頭（左の字が替わる所）・はじめ・おわり"""
    return sorted({round(t["at"], 3) for t in text if t["mode"] == "head" and t.get("lines")} | {0.0, float(LEN)})


def wv(w, r):
    if r <= w[0][0]:
        return w[0][1]
    for (o0, i0), (o1, i1) in zip(w, w[1:]):
        if r <= o1:
            return i0 + (i1 - i0) * (r - o0) / max(1e-6, o1 - o0)
    return w[-1][1] + (r - w[-1][0])


def hold(c, r, k):
    """絵の中の r 拍の所で、k 拍止める（reel.py の warp）"""
    if "warp" not in c:
        c["len0"] = c["len"]
        c["warp"] = [[0, 0], [c["len"], c["len"]]]
    w, ir = c["warp"], wv(c["warp"], r)
    c["warp"] = [p_ for p_ in w if p_[0] < r - 1e-6] + [[r, ir], [r + k, ir]] + [[p_[0] + k, p_[1]] for p_ in w if p_[0] > r + 1e-6]
    c["len"] += k


def move_score(t0, k):
    for s_ in score["sections"]:
        if s_["at"] >= t0 - 1e-6:
            s_["at"] += k
        elif s_["at"] < t0 <= s_["at"] + s_["len"] + 1e-6:
            s_["len"] += k  # t0 で終わる段（その場面の音楽）が、のびる
    for key in ("stops", "risers"):  # 止める所は、おわりの所（切り替え）についていく
        score[key] = [[a_ + k, b_ + k] if b_ >= t0 - 1e-6 else [a_, b_] for a_, b_ in score[key]]
    for key in ("anvil", "pings", "ticks"):
        score[key] = [[x[0] + (k if x[0] >= t0 - 1e-6 else 0)] + list(x[1:]) for x in score[key]]
    score["impacts"] = [x + (k if x >= t0 - 1e-6 else 0) for x in score["impacts"]]
    score["key"] = [[a_ + (k if a_ >= t0 - 1e-6 else 0), k_] for a_, k_ in score["key"]]
    if score.get("reveal_hit", 0) >= t0 - 1e-6:
        score["reveal_hit"] += k


def stretch(t0, k):
    """t0 拍に k 拍を足す。t0 をまたぐ絵・t0 で終わる絵は、その所で止める。そのとき出ている字は、その分長く出る"""
    global LEN
    for c in clips:
        if c["at"] >= t0 - 1e-6:
            c["at"] += k
        elif c["at"] + c["len"] >= t0 - 1e-6:
            hold(c, t0 - c["at"], k)
    for t in text:
        if t["at"] >= t0 - 1e-6:
            t["at"] += k
        elif t["at"] + t["len"] >= t0 - 1.0:
            r = t0 - t["at"]
            t["len"] += k
            for line in t.get("lines", []) if t["mode"] == "head" else []:
                for ch_ in line:
                    if ch_[1] >= r - 1e-6:
                        ch_[1] += k
            for bl in t.get("body", []) if t["mode"] == "head" else []:
                if bl[1] >= r - 1e-6:
                    bl[1] += k
    for v in voice:
        if v["at"] >= t0 - 1e-6:
            v["at"] += k
    for e_ in events:
        if e_[0] >= t0 - 1e-6:
            e_[0] += k
    for x_ in sfx:
        if x_[0] >= t0 - 1e-6:
            x_[0] += k
    move_score(t0, k)
    LEN += k


own_rows = []
for v_ in sorted(voice, key=lambda v: v["at"]):
    f_ = own_src(v_["n"])
    if f_:
        v_["own"], v_["own_raw"] = prep_own(v_["n"], f_)
        v_["own_dur"] = v_["own_raw"]
        if os.path.abspath(v_["own"]).startswith(os.path.abspath(WORK) + os.sep):
            v_["own"] = os.path.relpath(v_["own"], WORK)  # final.py は WORK から読む（外の所なら、そのままの場所）
        own_rows.append(v_["n"])
# 作者の声を少しだけ速めてよいとき（作者が良いと言ったときだけ）：OWN_TEMPO=1.05 のように数で、または OWN_TEMPO=auto
# （auto：1.00 から 1.10 まで 0.02 ずつ試して、全体が 3 分に入るいちばん遅い速さ）。ふだんは 1（速さを変えない）
OWN_TEMPO = os.environ.get("OWN_TEMPO", "1")


def fit(tempo):
    """作者の声の長さで、場面をのばす（tempo：作者の声の速さ。ふだん 1）"""
    fit_log.clear()
    for v_ in voice:
        if v_.get("own"):
            v_["own_dur"] = v_["own_raw"] / tempo
    for _ in range(300):
        vs_ = sorted(voice, key=lambda v: v["at"])
        se_ = place(vs_)
        B_ = bounds()
        fix = None
        for i_, v_ in enumerate(vs_):
            if not v_.get("own"):
                continue
            bn = next((b for b in B_ if b > v_["at"] + 1.0 + 1e-6), float(LEN))  # 切り替えの直前（1 拍以内）から入る声は、次の場面の声
            e_b = se_[i_][1] / SEC
            need = e_b - (bn + OVER) if bn < LEN - 1e-6 else e_b - (LEN - 2.0)  # おわりの声は、音が消える 1 秒の前に
            if i_ + 1 < len(vs_) and vs_[i_ + 1]["at"] >= bn - 1e-6:
                need = max(need, (se_[i_][1] + GAP_S) / SEC - (vs_[i_ + 1]["at"] + HEAD_S / SEC + PUSH))
            if need > 1e-6:
                fix = (bn, 4 * math.ceil(need / 4 - 1e-9), v_["n"])
                break
        if not fix:
            break
        stretch(fix[0], fix[1])
        fit_log.append(f"のばす：n{fix[2]} の声のため、{fix[0] / 2:.1f} 秒の所で {fix[1] // 2} 秒")


if own_rows:
    import copy  # noqa: E402
    snap = copy.deepcopy((clips, text, voice, events, sfx, score, LEN))
    TMAX = float(os.environ.get("OWN_TEMPO_MAX", "1.10"))  # auto で試す速さの上限
    tries = [1.0] if OWN_TEMPO != "auto" else [1.0 + 0.02 * i for i in range(int(round((TMAX - 1.0) / 0.02)) + 1)]
    if OWN_TEMPO not in ("auto", ""):
        tries = [max(1.0, min(1.25, float(OWN_TEMPO)))]
    for tempo in tries:
        c_, t_, v_, e_, x_, s_, L_ = copy.deepcopy(snap)
        clips[:], text[:], voice[:], events[:], sfx[:] = c_, t_, v_, e_, x_
        score.clear(); score.update(s_)
        LEN = L_
        fit(tempo)
        if LEN <= 360:
            break
    OWN_TEMPO_USED = tempo
    for l_ in fit_log:
        print("声に合わせて", l_)
    print("作者の録音", len(own_rows), "行", f"（速さ {tempo:.2f} 倍）" if tempo > 1.001 else "（速さはそのまま）", "／ 長さ", LEN / 2, "秒")
else:
    OWN_TEMPO_USED = 1.0


# ---------------------------------------------------------------- 確かめ
def width(t, size, fk="g6"):
    try:
        from PIL import ImageFont
        fd = "/System/Library/Fonts"
        names = {"g6": "ヒラギノ角ゴシック W6.ttc", "g4": "ヒラギノ角ゴシック W4.ttc"}
        files = {unicodedata.normalize("NFC", f): os.path.join(fd, f) for f in os.listdir(fd)}
        f = ImageFont.truetype(files[unicodedata.normalize("NFC", names[fk])], size, layout_engine=ImageFont.Layout.RAQM)
        return f.getlength(t, features=["palt"])
    except Exception:
        return len(t) * size


problems = []
for c in text:
    if c["mode"] != "head":
        continue
    for line in c["lines"]:
        w_ = width("".join(ch[0] for ch in line), c.get("H", H), "g6")
        if w_ > COLW:
            problems.append(f"見出しが長い（{w_:.0f} px）：{''.join(ch[0] for ch in line)}")
    for b_ in c["body"]:
        w_ = width(b_[0], c.get("S", S), "g4")
        if c.get("y", HY) < 900 and w_ > COLW + 10:
            problems.append(f"本文が長い（{w_:.0f} px）：{b_[0]}")
        if c.get("x", HX) + w_ > 1920 - 60:
            problems.append(f"字が右にはみ出す（{w_:.0f} px）：{b_[0]}")
by = {}
for b, w_, _o in events:
    by.setdefault(b, []).append(w_)
for b in sorted(by):
    if len(by[b]) > 1:
        problems.append(f"拍 {b}：{len(by[b])} つ同時 → {' ／ '.join(by[b])}")
for c in clips:
    if c["at"] % 1 and c.get("kind") != "black" and c.get("foot") is None:
        problems.append(f"拍の途中で切り替え：{c['at']}")
cs = sorted(clips, key=lambda c: c["at"])
for a_, b_ in zip(cs, cs[1:]):
    if abs(a_["at"] + a_["len"] - b_["at"]) > 1e-6:
        problems.append(f"すき間／重なり：{a_['at']}+{a_['len']} → {b_['at']}")
if LEN > 360:
    problems.append(f"3 分を越える：{LEN / 2:.1f} 秒（作者の声に合わせてのばした分。上の「声に合わせて」を見る）")
# 工房ごと：左が工房 B に替わらないこと（素材の区切りを越えない）
if has("workshops7") and WSLEN:
    wm_ = json.load(open(os.path.join(WORK, "story", "workshops7", "meta.json")))
    for c in clips:
        if c.get("kind") == "split":
            used = c.get("len0", c["len"]) * SEC * 30
            if wm_["marks"]["A"] + used >= wm_["marks"]["B"]:
                problems.append(f"工房ごと：左が工房 B のこまに入る（{used:.0f} こま使う）")
            if wm_["marks"]["B"] + used >= wm_["frames"]:
                problems.append(f"工房ごと：右の素材が足りない（{used:.0f} こま使う）")


# 読む時間：字の場面ごとに、1 秒に何字か（数字のかたまりは 1 字に数える。声と同じ字はあとで目で見る）
import re  # noqa: E402


def read_chars(t):
    t = re.sub(r"\s", "", t)
    t = re.sub(r"[0-9.]+", "#", t)
    t = re.sub(r"[A-Za-zø]+", "#", t)
    return len(t)


rd = []
for c in text:
    if c["mode"] == "head" and (c["lines"] or c["body"]):
        if c.get("y", HY) >= 980 and not c["lines"] and c["body"] and c["body"][0][2:] == [NOTE]:
            continue  # 出どころ・注は読まなくてもよい字（別に見る）
        tx = "".join(ch[0] for line in c["lines"] for ch in line) + "".join(b_[0] for b_ in c["body"])
        rels = [ch[1] for line in c["lines"] for ch in line] + [b_[1] for b_ in c["body"]]
        sec_ = (c["len"] - min(rels)) * SEC
        rd.append((c["at"], read_chars(tx), sec_, tx))
    elif c["mode"] == "type3":
        tx = "".join(l_[0] for l_ in c["lines"])
        rd.append((c["at"], read_chars(tx), c["len"] * SEC, tx))
    elif c["mode"] == "tag3":
        tx = c["text"] + c.get("sub", "")
        rd.append((c["at"], read_chars(tx), c["len"] * SEC, tx))
rd.sort()
for at_, n_, s_, tx in rd:
    if n_ / max(0.1, s_) > 6.0:
        print(f"読む字（{at_ / 2:.1f} 秒）：{n_} 字 ／ {s_:.1f} 秒 ＝ 1 秒 {n_ / s_:.1f} 字：{tx}")

for p_ in problems:
    print("！", p_)

voice.sort(key=lambda v: v["at"])
tl = dict(bpm=120, len=LEN, style=3, clips=cs, text=text, fx=[], music=[], hits=[], risers=[], drops=[], stops=[], downs=[], voice=[v for v in voice], sfx=sfx,
          grain=0.9, vignette=0.14, score=score, own_tempo=round(OWN_TEMPO_USED, 3),
          own_sim=bool(own_rows) and os.path.abspath(OWN_DIR) != os.path.abspath(os.path.join(WORK, "voice")))  # 作者の録音のまね（仮声）なら True
end = cs[-1]["at"] + cs[-1]["len"]
print("長さ", end, "拍 ＝", end / 2, "秒", "／ 声", len(voice), "行 ／ 気になる所", len(problems), "／ 手元の映像", "あり" if HAND else "なし（黒に字）", "／ 本物の指輪の映像", "あり" if REAL_RING else "なし（hero7 の指輪）")
json.dump(tl, open(os.path.join(HERE, "final7.json" if VARIANT == "A" else f"final7{VARIANT}.json"), "w"), ensure_ascii=False, indent=1)
