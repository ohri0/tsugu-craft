# 最終案 3 の台本（final3.json）を作る。時刻はすべて「拍」（120 拍／分 → 1 拍 0.5 秒、1 小節 ＝ 4 拍 ＝ 2 秒）。
# 作者の声（最終案 2 B を見て）：「ずっとよくなった。でも編集が少し素人っぽい。Apple のような、本物の広告に」。決めたこと：
#  - 切り替えは小節の頭（ダウンビート）。字のある絵は 1.5 拍以上。カメラは「見せる所へ」「カーソルを追う」ときだけ、3 次のゆっくり・速く・ゆっくりで動く。理由なく寄らない
#  - 字の決まり：1 つの書体（ヒラギノ角ゴシック）、大きさは 2 つ（見出し 64・本文 32）、左の同じ所から。見出しは言葉ごとに拍で出る
#  - 1 拍に新しく出るものは 1 つまで（下の確かめで数える）。余白を広く。粒とふちの暗さはごく少し。色はどこも同じ（黒に金）
#  - スマホで読める：画面の字が 1080p で 28 px 以上になるまで寄る。帳面・学ぶ・技は、スマホの幅で撮った画面を使う
# 使い方：python -I final_build3.py → final3.json（音楽の楽譜 score も同じ台本に書く。bgm5.py が読む）
import json, os, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get("TSUGU_VIDEO_WORK", os.path.join(HERE, "work"))
clips, text, voice, events = [], [], [], []

BG = "#000000"
WHITE, GOLD, GRAY, GREEN, RED = "#f5f5f7", "#e8c27a", "#a1a1a6", "#3ddc84", "#ff5a4e"
WIN = [740, 90, 1100, 900]          # 右の窓（出力の px）。比 1.222
HX, HY = 120, 400                   # 見出しの左と、1 行目の字の下の線（どの場面も同じ）
H, S = 64, 32                       # 字の大きさは 2 つだけ
COLW = 590                          # 左の欄の幅（見出しと本文がはみ出さないか確かめる）

# 撮った画面の中の枠（ページの px。比 1.222 にそろえた切り取り）
PRES = [643, 45, 953, 780]                      # 「見せる」の金の指輪（どの組み合わせも同じ所）
STUDIO = [239, 95, 782, 640]                    # 設計の画面の指輪（斜め）
SIDE_A = [256, 120, 788, 645]                   # 横から：職人の決まりのあと
SIDE_B = [274.2, 149.3, 752.6, 616.0]           # 横から：前。アプリが形に合わせて少し寄り直すので、腕の輪がちょうど重なるよう枠を合わせた（1.047 倍）
PHONE = 480                                     # スマホの幅で撮った画面の幅（ページの px）


def has(ch):
    return os.path.exists(os.path.join(WORK, "story", ch, "meta.json"))


def ev(b, what):
    events.append((round(b * 2) / 2, what))


def win(at, ln, ch, cam=None, cut=True, **kw):
    """右の窓に本物の画面。cam は [[拍, 枠], ...]（枠は [x, y, w, h] か、名前）"""
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
            ev(at + r, f"見出し：{w.lstrip('*')}")
            r += step
        out.append(chunks)
    bl = []
    for i, b_ in enumerate(body):
        rr = bt[i] if bt else r + i
        bl.append([b_, rr])
        ev(at + rr, f"本文：{b_}")
    text.append(dict(mode="head", at=at, len=ln, lines=out, body=bl, fout=fout, x=HX, y=HY, H=H, S=S, **kw))


def tag(at, ln, t, label, src=None, clip=None, pt=None, color=WHITE, sub=None, mark=True):
    d = dict(mode="tag3", at=at, len=ln, text=t, label=label, color=color, fout=0.4)
    if src:
        d.update(src=src, clip=clip)
    if pt:
        d.update(pt=pt)
    if sub:
        d["sub"] = sub
    text.append(d)
    if mark:
        ev(at, f"札：{t}")


def logo(at, ln, x=HX, y=560, size=210, center=False):
    text.append(dict(mode="logo", at=at, len=ln, text="継ぐ", x=x, y=y, size=size, font="g3", center=center, fout=1.0))
    ev(at, "題：継ぐ")


def say(n, at, t):
    voice.append(dict(n=n, at=at, text=t))


M = lambda ch, k: k  # noqa: E731（区切りの名前をそのまま使う印）

# ================================================================ 0:00 つかみ：金床の 4 音（ミ・レ・ド・ソ）に、指輪 → 指輪（同じ所にそろえてつなぐ）
for i, (mk, fr) in enumerate([("tri", 12), ("round", 64), ("marquise", 118), ("emerald", 172)]):
    win(i, 1, "hero3", cam=[[0, PRES]], border=False, **{"from": fr})

# ================================================================ 0:02 柱の一文（2 つ）→ 題
win(4, 8, "hero3", cam=[[0, PRES]], border=False, ramp=[[0, 0], [8, 53]])
head(4, 8, ["職人の判断を、", "*蓄える。"])
win(12, 8, "rebuild3", cam=[[0, [426, 200, 748, 612]]], ramp=[[0, 202], [8, 286]], grade={"dim": 0.45})
head(12, 8, ["失われた技まで、", "*組み立て直す。"])
clips.append(dict(at=20, len=4, kind="black", color=BG))
logo(20, 4, y=560)
text.append(dict(mode="head", at=20, len=4, lines=[], body=[["職人の判断を、次の人へ。", 1, "#c8c8cc"]], fout=0.5, x=HX, y=655, H=H, S=S))
ev(21, "本文：職人の判断を、次の人へ。")

# ================================================================ 0:12 困りごと：イメージ（ラフ）→ デザイン ⇄ CAD（作れない、と何度も戻る）→ 職人 ／ 継ぐなら、はじめから作れる 3D
FLOW = {"p2": 20, "go2": [23, 25], "ok": 25,
        "path": [[1.5, 0, False], [2.5, 1, False], [3.5, 2, False], [4.5, 1, True], [6.0, 2, False], [7.0, 1, True], [8.0, 2, False], [8.8, 1, True], [9.6, 2, False], [11.0, 3, False]]}
kind(24, 32, "flow3", k=FLOW)
ev(24 + 3.5, "図：作れない 1"); ev(24 + 6.0, "図：作れない 2"); ev(24 + 8.0, "図：作れない 3"); ev(44, "図：たたまれる"); ev(49, "図：作れる")
head(24, 20, ["デザインと CAD を、", "*行ったり来たり。"], ["作れるかは、職人の頭の中だけ。"], bt=[5])
head(44, 6, ["ラフも清書も、", "*いらない。"], fout=0.35)
head(50, 6, ["はじめから、", "*作れる 3D に。"])
say(1, 25, "デザインと CAD の間を、何度も行き来する。作れるかどうかは、職人の頭の中だけ。")
say(2, 45, "継ぐなら、ラフも清書もいらない。はじめから、作れる 3D に。")

# ================================================================ 0:28 一瞬で組み上がる：石の写真 → 指輪が組み上がる → いろいろなジュエリー（指輪 → 指輪でつなぐ）
win(56, 8, "build3", ramp=[[0, 8], [2, 72], [2.6, 126], [3.2, 172], [3.7, 194], [5.0, 232], [8, 300]],
    cam=[[0, [212, 75, 880, 720]], [2.6, [212, 75, 880, 720]], [4.0, [180, 60, 900, 736], "cio"]])
head(56, 20, ["あらゆる", "ジュエリーが、", "*一瞬で組み上がる。"], ["職人の判断と、設計の決まりで。"], bt=[5])
for i, (mk, fr) in enumerate([("round", 64), ("marquise", 118), ("emerald", 172), ("oval", 226), ("pear", 280), ("princess", 334)]):
    win(64 + 2 * i, 2, "hero3", cam=[[0, PRES]], border=False, **{"from": fr})
say(3, 57, "私は、彫金の職人です。あらゆるジュエリーが、職人の判断と設計の決まりで、一瞬で組み上がる。")

# ================================================================ 0:38 ネットの情報だけだと：太く、高い（横から）
win(76, 8, "word3", cam=[[0, SIDE_B]], ramp=[[0, 0], [8, 36]])
head(76, 8, ["ネットの", "情報だけだと、", "*太く、高い。"], ["爪 ø 1.66 mm", "指から上 6.30 mm", "職人なら、こうは作らない。"], bt=[4, 5, 6])
say(4, 77, "ネットの情報だけだと、太く、高い。")

# ================================================================ 0:42 職人の一言：言葉を打つ → Claude が決まりに → これでいい
FIELD = [1170, 376, 430, 352]
PROP = [1170, 548, 430, 352]
win(84, 16, "word3", ramp=[[0, 40], [1, 44], [6.5, 169], [7.5, 192], [8.2, 206], [13.2, 254], [14.4, 262], [15.0, 268], [16, 270]],
    cam=[[0, FIELD], [7.5, FIELD], [8.6, PROP, "cio"]],
    focus=[[13.6, "ok", 0.0], [14.0, "ok", 1.0], [15.2, "ok", 1.0], [15.6, "ok", 0.0]], focusDim=0.5, focusWidth=2, keys=[["type", "typed"]])
ev(84 + 14.0, "枠：これでいい")
head(84, 8.5, ["職人の言葉を、", "*そのまま入れる。"], fout=0.35)
head(93, 11, ["Claude が、", "*決まりにする。"], ["言葉から、数字つきの決まりに。"], bt=[3])
say(5, 85, "職人の言葉を、そのまま入れる。Claude が、それを決まりにする。")
# 押した直後：前の指輪（横から）→ 一拍止めて → 落ちる所で、同じ構図のまま後へ
win(100, 4, "word3", cam=[[0, SIDE_B]], **{"from": 266, "hold": True})

# ================================================================ 0:52 ドロップ：職人の一言で、爪も高さも変わる（同じ構図で重ねてつなぐ）
win(104, 8, "word3", cam=[[0, SIDE_A]], ramp=[[0, 280], [8, 345]], tr={"type": "xfade", "len": 0.3})
head(104, 12, ["職人の一言で、", "*形が変わる。"], ["爪 ø 1.66 → 0.80 mm", "指から上 6.30 → 4.61 mm"], t0=1, bt=[3, 4])
win(112, 4, "word3", cam=[[0, STUDIO]], ramp=[[0, 370], [4, 440]])
say(6, 107, "一言で、爪も高さも変わる。")

# ================================================================ 0:58 確かめる：赤く光る → 押すと、直し方 → ボタンは決まった直し方を 1 つずつ
ROWS = [833, 129, 470, 385]
win(116, 12, "fix3", ramp=[[0, 0], [3.4, 45], [4.4, 61], [8.4, 82], [9.2, 101], [9.8, 112], [10.4, 120], [12, 160]],
    cam=[[0, STUDIO], [3.6, STUDIO], [4.6, ROWS, "cio"], [10.6, ROWS], [11.4, STUDIO, "cio"]],
    focus=[[7.8, "oneBtn", 0.0], [8.3, "oneBtn", 1.0], [9.6, "oneBtn", 1.0], [10.0, "oneBtn", 0.0]], focusDim=0.45, focusWidth=2)
ev(116 + 8.3, "枠：腕を厚くする")
head(116, 4.5, ["細すぎると、", "*赤く光る。"], fout=0.35)
head(121, 7, ["ボタンは、", "決まった直し方を、", "*1 つずつ。"], fout=0.4)
say(7, 117, "細すぎると、赤く光る。ボタンは、決まった直し方を、1 つずつ。")

# ================================================================ 1:04 Claude は、ぜんたいを読んで、まとめて直す（形はそのまま、理由も残す）→ 作れます
LOG = [1160, 300, 440, 360]
POP2 = [833, 129, 470, 385]
win(128, 12, "fix3", ramp=[[0, 170], [1.4, 190], [2.4, 205], [4.4, 228], [4.9, 238], [5.4, 248], [12, 300]],
    cam=[[0, STUDIO], [1.5, STUDIO], [2.6, POP2, "cio"], [4.9, POP2], [5.8, LOG, "cio"]],
    focus=[[3.6, "claudeBtn", 0.0], [4.0, "claudeBtn", 1.0], [4.9, "claudeBtn", 1.0], [5.2, "claudeBtn", 0.0]], focusDim=0.45, focusWidth=2)
ev(128 + 4.0, "枠：Claude で直す")
head(128, 12, ["Claude は、", "ぜんたいを読んで、", "*まとめて直す。"], ["指輪と帳面を読み、形は保ったまま。", "直した理由も、残す。"], bt=[6, 7])
win(140, 8, "fix3", cam=[[0, STUDIO]], ramp=[[0, 304], [8, 367]])
tag(141, 7, "作れます", (790, 820), color=GREEN)
head(140, 8, ["形はそのまま、", "*作れる形に。"], t0=2)
say(8, 129, "Claude は、指輪ぜんたいと帳面を読んで、形を保ったまま、まとめて直す。直した理由も残す。")

# ================================================================ 1:14 描く：描いた形のまま → 尖りすぎて機能しない所だけ赤く（一度だけ）
EDIT = [1087, 400, 513, 420]
CHIPV = [300, 30, 1000, 818]                    # 指輪と「作れます」の札が両方入る枠
win(148, 12, "section3", ramp=[[0, 34], [1, 39], [3.4, 87], [5, 110], [5.6, 127], [7.6, 175], [8, 190], [10.4, 240], [11, 252], [12, 270]],
    cam=[[0, EDIT]])
head(148, 12, ["描いた形のまま、", "*指輪に。"], ["尖りすぎて、ジュエリーとして", "機能しない所だけ、赤く。"], bt=[8, 9])
say(9, 149, "描いた形のまま、指輪に。尖りすぎて、ジュエリーとして機能しない所だけ、赤く。")

# ================================================================ 1:20 同じ決まりで：石も腕も変わっても（指輪 → 指輪）
for i, (mk, fr) in enumerate([("round", 8), ("marquise", 53), ("pear", 98), ("emerald", 143), ("oval", 188)]):
    win(160 + 2 * i, 2 if i < 4 else 4, "same3", cam=[[0, STUDIO]], **{"from": fr})
head(160, 12, ["石も腕も変わっても、", "*同じ決まりで。"], ["どれも、作れる形に組む。"], bt=[9], step=2)
say(10, 161, "石も腕も変わっても、同じ決まりで組む。")

# ================================================================ 1:26 帳面：職人が育てる（職人の言葉と、選んだ資料。出どころつき）
PH = lambda y: [0, y, PHONE, 393]  # noqa: E731（スマホの幅の画面を、窓いっぱいに）
win(172, 8, "ledger3m", ramp=[[0, 0], [4.6, 46], [5.6, 74], [8, 100]], cam=[[0, PH(110)], [4.6, PH(110)], [5.6, PH(10), "cio"]])
head(172, 8, ["この帳面は、", "*職人が育てる。"], ["職人の言葉と、選んだ資料。", "どれも、出どころつき。"], bt=[3, 4])
say(11, 173, "帳面は、私が話した言葉と、選んだ資料。")

# ================================================================ 1:30 足りない所は、Claude が聞きに来る → 答えると、決まりになる
win(180, 12, "ledger3m", ramp=[[0, 140], [1.6, 172], [2.4, 189], [4.4, 220], [6.0, 292], [6.6, 300], [7.0, 323], [9.4, 373], [10.0, 396], [10.6, 418], [12, 450]],
    cam=[[0, PH(330)], [2.0, PH(330)], [2.6, PH(20), "cio"], [6.6, PH(20)], [7.2, PH(200), "cio"], [9.6, PH(200)], [10.6, PH(50), "cio"]])
head(180, 6, ["足りない所は、", "Claude が、", "*聞きに来る。"], fout=0.35)
head(186, 6, ["答えると、", "*それが決まりになる。"], ["職人の言葉も、そのまま残る。"], bt=[3])
say(12, 181, "足りない所は、Claude が聞きに来る。答えると、それが決まりになる。")

# ================================================================ 1:36 決まりは、工房ごとに（同じ指輪を左右に）
HALF = [436, 95, 387, 640]
clips.append(dict(at=192, len=8, kind="split", win=WIN, bg=BG, borderColor="#2a2a2e", radius=18, sides=[
    {"ch": "workshops3", "from": 10, "speed": 0.5, "cam": [[0, {"v": HALF, "pad": 0.0}]], "noblur": True},
    {"ch": "workshops3", "from": 60, "speed": 0.5, "cam": [[0, {"v": HALF, "pad": 0.0}]], "noblur": True}]))
ev(192, "絵：工房ごと")
head(192, 8, ["決まりは、", "*工房ごとに。"])
tag(195, 5, "石川工房 ・ ø 0.80 mm", (WIN[0] + 60, WIN[1] + WIN[3] - 70), color=GOLD)
tag(196, 4, "工房 B ・ ø 1.41 mm", (WIN[0] + WIN[2] // 2 + 66, WIN[1] + WIN[3] - 70))
say(13, 193, "決まりは、工房ごとに。")

# ================================================================ 1:40 形から、作り方まで
MK = [1185, 80, 420, 344]
win(200, 8, "make3", ramp=[[0, 222], [2.5, 286], [3.3, 300], [4.0, 315], [8, 362]],
    cam=[[0, MK], [4.0, MK], [5.5, [1185, 240, 420, 344], "cio"]])
head(200, 8, ["形から、", "*作り方まで。"], ["寸法も道具も、ロウ付けの順も。"], bt=[4])
say(14, 201, "形から、作り方まで。")

# ================================================================ 1:44 学校では：ひとりずつちがう → 先生の確認を待つ ／ 継ぐなら、すぐ答えが出る
kind(208, 8, "school3", k={"checks": [3, 5], "clock": 7})
ev(208 + 3, "図：確認 1"); ev(208 + 5, "図：確認 2"); ev(208 + 7, "図：待ち時間")
head(208, 8, ["学校では、", "*先生の確認を待つ。"], ["石も形も、ひとりずつちがう。", "1 時間近く待つことも。"], bt=[4, 6], fout=0.35)
win(216, 8, "learn3m", ramp=[[0, 24], [2.6, 67], [3.0, 80], [3.4, 96], [8, 150]], cam=[[0, PH(470)], [3.0, PH(470)], [3.8, PH(200), "cio"]])
head(216, 8, ["継ぐなら、", "*すぐ答えが出る。"], ["よくある問いは、帳面の決まりから。"], bt=[5])
say(15, 209, "学校では、石も形もひとりずつちがい、先生の確認を 1 時間近く待つことも。継ぐなら、すぐ答えが出る。")

# ================================================================ 1:52 工房では：先輩が手を止める ／ 流れは継ぐが、細かい所だけ人に
kind(224, 12, "senior3", k={"stop": 3, "p2": 6, "resume": 9})
ev(224 + 3, "図：手が止まる"); ev(224 + 6, "図：継ぐ"); ev(224 + 9, "図：細かい所だけ")
head(224, 6, ["工房では、", "*先輩が手を止める。"], fout=0.35)
head(230, 6, ["流れは、継ぐが。", "*細かい所だけ、人に。"], t0=1)
say(16, 225, "工房では、先輩が手を止めて教える。流れは継ぐが答え、細かい所だけ人に聞く。")

# ================================================================ 1:58 受け継ぐ（静かな所）：作り手の数 → 20 年に一度 → 同じ技、でも決まりがある → だから職人の判断を残す
kind(236, 8, "stat3", k={"grow": 3})
ev(236 + 3, "図：帯が縮む")
head(236, 8, ["技を知る人が、", "*減っていく。"], ["24 年で、約 6 割減。"], bt=[5])
text.append(dict(mode="head", at=236, len=8, lines=[], body=[["出典：経済産業省 説明資料（伝統的工芸品産業振興協会の集計。2022 年度）", 4, "#7c7c80"]], fout=0.4, x=HX, y=1040, H=H, S=S))
img(244, 4, "public/heritage/naiku-1953.jpg")
clips.append(dict(at=248, len=4, kind="rows", img="public/heritage/naiku-goshinpozu.jpg", n=3, each=0.8, win=WIN, bg=BG, border=False))
ev(248, "絵：御神宝図")
head(244, 8, ["20 年に一度、", "*作り直す技もある。"], ["伊勢神宮の式年遷宮。", "御装束神宝の、彫金・金工。"], bt=[3, 5])
text.append(dict(mode="head", at=244, len=4, lines=[], body=[["写真：1953 年の内宮（本田照夫 撮影・Wikimedia Commons・パブリックドメイン）", 0, "#7c7c80"]], fout=0.3, x=HX, y=1040, H=H, S=S))
text.append(dict(mode="head", at=248, len=4, lines=[], body=[["「内宮御神宝図」江戸時代の写し・国立国会図書館（Wikimedia Commons・パブリックドメイン）", 0, "#7c7c80"]], fout=0.3, x=HX, y=1040, H=H, S=S))
img(252, 4, "public/heritage/tsuba-carp.jpg", area=[80, 40, 940, 820])
img(256, 8, "public/heritage/kazari-tachi.jpg", area=[0, 220, 1100, 460])
head(252, 12, ["彫金・金工は、", "*ジュエリーと同じ技。"], ["でも、工房ごとに決まりがあるように、", "神宝にも、作るときの決まりがある。"], bt=[5, 6])
text.append(dict(mode="head", at=252, len=4, lines=[], body=[["鯉と藻の鐔（江戸時代）メトロポリタン美術館（CC0）", 0, "#7c7c80"]], fout=0.3, x=HX, y=1040, H=H, S=S))
text.append(dict(mode="head", at=256, len=8, lines=[], body=[["飾太刀（平安時代）東京国立博物館／ColBase（CC BY 4.0）", 0, "#7c7c80"]], fout=0.3, x=HX, y=1040, H=H, S=S))
win(264, 12, "ledger3m", cam=[[0, PH(130)]], ramp=[[0, 0], [12, 44]])
head(264, 6, ["世に出ている", "知識だけでは、", "*同じ物は作れない。"], fout=0.35)
head(270, 6, ["だから、", "*職人の判断を残す。"], t0=1)
say(17, 237, "伝統的工芸品の作り手は、24 年で約 6 割減った。")
say(18, 245, "式年遷宮では、20 年ごとに作り直す。")
say(19, 253, "その彫金・金工は、ジュエリーと同じ技。でも、作るときの決まりがある。")
say(20, 265, "世に出ている知識だけでは、同じ物は作れない。だから、職人の判断を残す。")

# ================================================================ 2:18 ほかの技も、同じしくみで：木目金 → Claude が職人に聞く → 答えが決まりになる
win(276, 16, "waza3m", ramp=[[0, 20], [2, 46], [3.4, 70], [4.2, 89], [7.5, 150], [9.5, 214], [10.2, 237], [10.6, 245], [13.2, 295], [13.8, 318], [14.4, 342], [16, 390]],
    cam=[[0, PH(560)], [3.6, PH(560)], [4.4, PH(180), "cio"], [10.4, PH(180)], [11.0, PH(400), "cio"], [13.8, PH(400)], [14.6, PH(40), "cio"]])
head(276, 16, ["ほかの技も、", "*同じしくみで。"], ["木目金も、Claude が職人に聞き、", "答えが決まりになる。"], bt=[5, 6])
say(21, 277, "ほかの技も、同じしくみで。木目金も、Claude が職人に聞き、答えが決まりになる。")

# ================================================================ 2:26 組み立て直す：万が一、途切れた技も、残った手がかりから
win(292, 16, "rebuild3", ramp=[[0, 30], [3, 97], [5, 137], [5.5, 145], [6.5, 160], [7.5, 186], [8.5, 202], [11, 244], [13.5, 286], [16, 330]],
    cam=[[0, [416, 300, 768, 628]], [7.0, [416, 300, 768, 628]], [8.0, [416, 170, 768, 628], "cio"]])
head(292, 16, ["万が一、", "途切れた技も、", "*組み立て直す。"], ["残った品物や資料の手がかりから、", "Claude ができる限り。"], bt=[5, 6])
say(22, 293, "万が一、途切れた技も、残った品物や資料の手がかりから、Claude が作り方を組み立て直す。")

# ================================================================ 2:36 答え合わせ：本当の 11 工程。たどり着いた 9 つに灯り → 9 / 11
G = json.load(open(os.path.join(WORK, "story", "rebuild3", "grade.json"))) if has("rebuild3") else None
NAMES = ["地金を用意する", "面をみがく", "色ちがいの板を重ねる", "締めつけて固定する", "火床で熱してつなぐ", "すぐ叩いて仕上げる", "叩いて薄くのばす", "彫って下の層を出す", "叩いて平らにする", "品物の形にする", "煮色で色を出す"]
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
lights = [[3 + 0.5 * j, i] for j, i in enumerate(lit)]
kind(308, 16, "check3", k={"rows": rows, "lights": lights, "hit": 8, "legend": f"● 一致 {n_ok}　◐ 一部 {n_part}　○ たどり着けず {11 - len(lit)}"})
ev(308 + 8, "図：9 / 11"); ev(308 + 9, "図：凡例")
head(308, 16, ["本当の作り方と、", "*答え合わせ。"], ["答えは隠したまま、", "手がかりだけで。"], bt=[10, 11])
say(23, 309, f"答えは隠したまま。手がかりだけで、11 の工程のうち {len(lit)} つにたどり着いた。")

# ================================================================ 2:44 誘い（作者の声：もう誰でも使える）：石の写真 → 指輪が組み上がる → 腕を描く → 作れます → 見せる。ひと続きの本物の流れ
#   前半「石を持っていたら、写真を 1 枚。そのまま、作れる指輪になる。」→ 後半「職人の判断から、誰でも使えるソフトへ。」
E = "anyone3b"
EM = json.load(open(os.path.join(WORK, "story", E, "meta.json")))["marks"] if has(E) else {}
if EM:
    d0 = EM.get("done", 330)
    win(324, 8, E, ramp=[[0, 6], [1.8, 100], [2.4, 126], [3.0, 172], [3.5, EM.get("render", 194)], [4.5, EM.get("sheet", 225) + 6], [8, EM.get("sheet", 225) + 70]],
        cam=[[0, [212, 75, 880, 720]], [2.4, [212, 75, 880, 720]], [3.6, [180, 60, 900, 736], "cio"]])
    win(332, 4, E, ramp=[[0, EM["draw"] - 24], [0.8, EM["draw"] - 2], [2.6, EM["drawn"]], [4, EM["drawn"] + 20]], cam=[[0, EDIT]])
    win(336, 4, E, ramp=[[0, EM["drawn"] + 20], [4, EM["drawn"] + 50]], cam=[[0, CHIPV]])
    win(340, 4, E, ramp=[[0, EM["present"] + 4], [4, EM["present"] + 64]], cam=[[0, PRES]], border=False)
    tag(338, 6, "作れます", (790, 820), color=GREEN)
head(324, 8, ["石を持っていたら、", "*写真を 1 枚。"], ["そのまま、作れる指輪になる。"], bt=[5], fout=0.4)
head(332, 12, ["職人の判断から、", "誰でも使える", "*ソフトへ。"], ["難しかった設計が、誰にでも。", "ひとりで学ぶ人にも。"], bt=[7, 9])
say(24, 325, "石を持っていたら、写真を撮ってみてください。そのまま、作れる指輪になります。")
say(25, 337, "職人の判断から、誰でも使えるソフトへ。")

# ================================================================ 2:52 継ぐ（金床の 3 音で指輪 → 指輪、一拍止めて、題）
for i, fr in enumerate([30, 84, 138]):
    win(344 + i, 1, "hero3", cam=[[0, PRES]], border=False, **{"from": fr})
clips.append(dict(at=347, len=11, kind="black", color=BG))
ev(347, "黒")
logo(348, 10, y=520)
text.append(dict(mode="head", at=348, len=10, lines=[], body=[["職人の判断を、次の人へ。", 1, WHITE], ["このアプリも、彫金職人が", 2, GRAY], ["Claude Code と作りました。", 3, GRAY]], fout=1.5, x=HX, y=615, H=H, S=S))
ev(349, "本文：次の人へ"); ev(350, "本文：このアプリも"); ev(351, "本文：Claude Code と")
text.append(dict(mode="head", at=352, len=6, lines=[], body=[
    ["画面はすべて継ぐの実際の操作（Claude の答えも、撮ったときのまま）。", 0, "#7c7c80"],
    ["画像の出どころは、それぞれの場面に。音楽と効果音は、自作の合成。", 0, "#7c7c80"]], fout=1.5, x=HX, y=980, H=H, S=S))
ev(352, "出どころ")
say(26, 348, "継ぐ。このアプリも、彫金職人が Claude Code と作りました。")
LEN = 358

# ================================================================ 音楽の楽譜（bgm5.py が読む）
score = {
    "key": [[0, 0], [324, 2]],
    "sections": [{"at": a, "len": l_, "name": n} for a, l_, n in [
        (0, 4, "hook"), (4, 16, "intro"), (20, 4, "title"), (24, 8, "intro2"), (32, 44, "verse"), (76, 8, "tension"), (84, 20, "build"),
        (104, 12, "drop"), (116, 32, "groove"), (148, 24, "verse2"), (172, 36, "light"), (208, 28, "bridge"), (236, 40, "breakdown"),
        (276, 32, "build2"), (308, 16, "reveal"), (324, 20, "final"), (344, 14, "outro")]],
    "stops": [[103, 104], [139.5, 140], [315.5, 316], [347, 348]],
    "impacts": [104, 140, 316],
    "reveal_hit": 316,
    # はじめ：ミ・レ・ド・ソ（ハ長調）。終わり：同じ 4 音を全音上げて（ファ#・ミ・レ … 題でラ）
    "anvil": [[0, 76, "motif"], [1, 74, "motif"], [2, 72, "motif"], [3, 79, "motif"], [20, 69, "title"], [344, 78, "motif"], [345, 76, "motif"], [346, 74, "motif"], [348, 81, "title"]],
    "risers": [[96, 104], [136, 140], [268, 276], [310, 316], [320, 324]],
    "pings": [[64 + 2 * i, m] for i, m in enumerate([76, 74, 72, 79, 76, 74])] + [[160 + 2 * i, m] for i, m in enumerate([76, 74, 72, 79, 67])],
    "ticks": [[308 + b, m] for (b, _), m in zip(lights, [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96])],
}

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
        if c.get("y", HY) < 900:
            w_ = width(b_[0], c.get("S", S), "g4")
            if w_ > COLW + 10:
                problems.append(f"本文が長い（{w_:.0f} px）：{b_[0]}")
by = {}
for b, w_ in events:
    by.setdefault(b, []).append(w_)
for b in sorted(by):
    if len(by[b]) > 1:
        problems.append(f"拍 {b}：{len(by[b])} つ同時 → {' ／ '.join(by[b])}")
for c in clips:
    if c["at"] % 1 and c.get("kind") != "black":
        problems.append(f"拍の途中で切り替え：{c['at']}")
cs = sorted(clips, key=lambda c: c["at"])
for a_, b_ in zip(cs, cs[1:]):
    if abs(a_["at"] + a_["len"] - b_["at"]) > 1e-6:
        problems.append(f"すき間／重なり：{a_['at']}+{a_['len']} → {b_['at']}")
for p_ in problems:
    print("！", p_)

voice.sort(key=lambda v: v["at"])
tl = dict(bpm=120, len=LEN, style=3, clips=cs, text=text, fx=[], music=[], hits=[], risers=[], drops=[], stops=[], downs=[], voice=voice, sfx=[],
          grain=0.9, vignette=0.14, score=score)
end = cs[-1]["at"] + cs[-1]["len"]
print("長さ", end, "拍 ＝", end / 2, "秒", "／ 気になる所", len(problems))
json.dump(tl, open(os.path.join(HERE, "final3.json"), "w"), ensure_ascii=False, indent=1)
