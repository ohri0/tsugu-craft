# 最終案 6 の台本（final6.json）を作る。時刻はすべて「拍」（120 拍／分 → 1 拍 0.5 秒、1 小節 ＝ 4 拍 ＝ 2 秒）。
# 最終案 5（final_build5.py）の作りのまま、作者の決めで直した（並びは、はじめから拍で書く。前の版のように、あとからずらさない）：
#  0 組み立て：つかみ → 行き来の図 → ネット → 職人の一言 → ドロップ → これまでの作品（heart6）→ 最初の版と今の版 → Claude が聞きに来る
#    → 工房ごと → 形づくりの早回し → 学校・学ぶ → 工房 → つなぎ → 作り手の数 → 伊勢神宮 → 鐔・太刀 → 伝統の技 → 木目金の歴史
#    → 作り方を隠す → 順番を考える → 本当の 11 の手順と比べる → 柱の一文 → 継ぐ（336 拍 ＝ 2:48）
#  1 石座の既定は「腕の間に挟む」（アプリの既定を変えた）→ 指輪の場面は、みな撮り直し（最初の版と今の版の「今」も）
#  2 声は、ふつうの速さに近く（1.0〜1.1 倍）：ふつうの速さで読むと声だけで 156.5 秒（53 行）→ 行をまとめ、絵が言っている所は声を外し、
#    声のない場面もつくって 40 行に（どの行を外した・まとめたかは docs/LOG.md）
#  3 工房：「先輩に教わるのは、まだ言葉になっていない、手の感覚だけ」（言葉にできたら、それも帳面に）
# 使い方：python -I final_build6.py → final6.json（音楽の楽譜 score も同じ台本に書く。bgm5.py が読む）
import json, os, subprocess, unicodedata

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


def ev(b, what, owner=None):
    """新しく出るもの（拍・名前・持ち主の場面の頭）。あとで時間をずらすときは、持ち主の頭で決める"""
    events.append([round(b * 2) / 2, what, b if owner is None else owner])


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
            ev(at + r, f"見出し：{w.lstrip('*')}", at)
            r += step
        out.append(chunks)
    bl = []
    for i, b_ in enumerate(body):
        rr = bt[i] if bt else r + i
        bl.append([b_, rr])
        ev(at + rr, f"本文：{b_}", at)
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



# 撮った画面の中の枠（最終案 4 で足したもの）
HOOK_B = [300, 60, 660, 540]                    # つかみ：職人の決まりの指輪（斜め。石座に寄る）
HOOK_A = [316.2, 90.0, 628.6, 514.3]            # つかみ：公開情報だけの指輪。アプリが形に合わせて 5% 寄り直すので、腕が重なるよう合わせた
EDIT = [1087, 400, 513, 420]
PH = lambda y: [0, y, PHONE, 393]  # noqa: E731（スマホの幅の画面を、窓いっぱいに）
sfx = []

# ================================================================ 0:00 つかみ：黒に職人の一言を打つ → 公開情報だけの指輪 → 打つ音で、職人の指輪に変わる
QUOTE = [["この大きさの石なら、", False], ["爪は最低 0.7 ミリ。", True]]
CPS, DELAY = 9.0, 0.25
clips.append(dict(at=0, len=4, kind="black", color=BG))
ev(0, "黒")
text.append(dict(mode="type3", at=0, len=11.6, lines=QUOTE, x=HX, y=HY, H=H, cps=CPS, delay=DELAY, fout=0.4))
n_ch = sum(len(t_) for t_, _ in QUOTE)
for i in range(n_ch):
    sfx.append([(DELAY + i / CPS) / 0.5, "key"])
ev(0.5, "打つ字")
win(4, 4, "hook4", cam=[[0, HOOK_A]], ramp=[[0, 18], [4, 44]])
text.append(dict(mode="head", at=5, len=6.6, lines=[], body=[["職人の一言", 0, GRAY]], fout=0.4, x=HX, y=HY + 83 + 100, H=H, S=S))
ev(5, "本文：職人の一言")
win(8, 4, "hook4", cam=[[0, HOOK_B]], ramp=[[0, 50], [4, 74]], tr={"type": "xfade", "len": 0.25})
text.append(dict(mode="head", at=9, len=2.6, lines=[], body=[["この一言で、指輪が変わる。", 0, WHITE]], fout=0.4, x=HX, y=HY + 83 + 149, H=H, S=S))
ev(9, "本文：この一言で")
# 見た目のちがう指輪を 1 拍ずつ（石の形・覆輪・地金）。同じ所・同じ大きさでつなぐ
# 三石は使わない（既定の石座「腕の間に挟む」では、石を並べる指輪の形がくずれるので、アプリから外した。2026-11-05 作者の指摘）
# → multi4 48（三石・脇ペア）を hero3 334（プリンセス・金）に、multi4 8（三石・脇ラウンド）を hero3 64（ラウンド・白）に替えた
MONT = [("hero3", 334), ("multi4", 88), ("multi4", 128), ("hero3", 64), ("hero3", 226), ("hero3", 280), ("multi4", 168), ("hero3", 12)]
for i, (ch, fr) in enumerate(MONT):
    win(12 + i, 1, ch, cam=[[0, PRES]], border=False, **{"from": fr})
clips.append(dict(at=20, len=4, kind="black", color=BG))
logo(20, 4, y=560)
text.append(dict(mode="head", at=20, len=4, lines=[], body=[["職人の判断を、次の人へ。", 1, "#c8c8cc"]], fout=0.5, x=HX, y=655, H=H, S=S))
ev(21, "本文：職人の判断を、次の人へ。")
say(0, 0.5, "私は、彫金の職人です。")
say(0, 8.5, "作れるかどうかの判断は、職人の頭の中にしかない。")
say(0, 20.5, "継ぐは、それを蓄えます。")

# ================================================================ 0:12 行き来の図（16 拍）：デザイン → 制作、作れない、と戻る（大きな輪）／ 継ぐなら、デザインの時点で作れる
T = 24
FLOW = {"p2": 8, "go2": [10, 12], "ok": 12, "arc": [2, 0], "arcH": 0.26, "okText": "作れる",
        "path": [[0.9, 0, False], [2.4, 2, False], [3.2, 0, True], [4.4, 2, False], [5.2, 0, True], [6.4, 2, False], [7.0, 0, True], [7.8, 2, False]]}
kind(T, 16, "flow4", k=FLOW)
ev(T + 2.4, "図：作れない 1", T); ev(T + 4.4, "図：作れない 2", T); ev(T + 6.4, "図：作れない 3", T); ev(T + 8, "図：継ぐ", T); ev(T + 12, "図：作れる", T)
head(T, 8, ["デザインと制作を、", "*行ったり来たり。"], ["作れない、と戻ってくる。"], bt=[3])
head(T + 8, 8, ["デザインの時点で、", "*作れる 3D に。"], ["職人の判断で、作れるか分かる。", "戻らずに、そのまま制作へ。"], bt=[3, 5])
say(0, T + 1, "作れない、と何度もデザインに戻ってくる。")
say(0, T + 9, "継ぐなら、デザインの時点で、作れるか分かる。")

# ================================================================ 0:20 ネットの情報だけだと：不自然な形に（横から）
T = 40
win(T, 8, "word3", cam=[[0, SIDE_B]], ramp=[[0, 0], [8, 36]])
head(T, 8, ["ネットの", "情報だけだと、", "*不自然な形に。"], ["基本から、ずれた形になる。", "ロウ付けの所なども、無理が多い。"], bt=[4, 5])
say(0, T + 1, "ネットの情報だけだと、不自然な形になる。")

# ================================================================ 0:24 職人の一言：言葉を打つ → Claude が決まりに → これでいい
T = 48
FIELD = [1170, 376, 430, 352]
PROP = [1170, 548, 430, 352]
win(T, 16, "word3", ramp=[[0, 40], [1, 44], [6.5, 169], [7.5, 192], [8.2, 206], [13.2, 254], [14.4, 262], [15.0, 268], [16, 270]],
    cam=[[0, FIELD], [7.5, FIELD], [8.6, PROP, "cio"]],
    focus=[[13.6, "ok", 0.0], [14.0, "ok", 1.0], [15.2, "ok", 1.0], [15.6, "ok", 0.0]], focusDim=0.5, focusWidth=2, keys=[["type", "typed"]])
ev(T + 14.0, "枠：これでいい")
head(T, 8.5, ["職人の言葉を、", "*そのまま入れる。"], fout=0.35)
head(T + 9, 11, ["Claude が、", "*決まりにする。"], ["言葉から、数字つきの決まりに。"], bt=[3])
win(T + 16, 4, "word3", cam=[[0, SIDE_B]], **{"from": 266, "hold": True})
say(0, T + 1, "職人の言葉を、そのまま入れる。")
say(0, T + 9, "Claude が、それを決まりにする。")

# ================================================================ 0:34 ドロップ：職人の一言で、形が変わる（同じ構図で重ねてつなぐ）。声なし（絵と数字が言う）
T = 68
win(T, 8, "word3", cam=[[0, SIDE_A]], ramp=[[0, 280], [8, 345]], tr={"type": "xfade", "len": 0.3})
# 数字は撮った word3 の画面から読んだ（2026-11-05：腕の間に挟む石座。指から上は 4.98 → 4.13 mm）
head(T, 8, ["職人の一言で、", "*形が変わる。"], ["爪 ø 1.66 → 0.80 mm", "指から上 4.98 → 4.13 mm"], t0=1, bt=[3, 4], fout=0.4)

# ================================================================ 0:38 これまでの作品も確かめ直す → まとめて直す（heart6。話の芯）
# 同じ職人の一言のあと、記録の作品（見本）を確かめ直す。見本の小粒の指輪の爪が細い → まとめて直す（本物の画面）
T = 76
PAST = [1180, 80, 420, 344]
win(T, 12, "heart6", ramp=[[0, 236], [1, 251], [5, 290], [5.6, 306], [6.2, 316], [12, 358]], cam=[[0, PAST]])
head(T, 12, ["これまでの作品も、", "*確かめ直す。"], ["爪が細くて、留まりが弱い物が 1 つ。", "まとめて直す。"], bt=[3, 7])
text.append(dict(mode="head", at=T, len=12, lines=[], body=[["記録の作品は見本（継ぐが組んだ物。職人の作品ではない）", 0.5, "#7c7c80"]], fout=0.3, x=HX, y=1040, H=H, S=S))
ev(T + 0.5, "本文：見本", T)
say(0, T + 1, "これまでの作品も、その決まりで確かめ直す。")
say(0, T + 7, "爪が細い物は、まとめて直す。")

# ================================================================ 0:44 最初の版から、今の版へ（git の最初の版 7606ee7 と今の版。同じ石・同じ号・同じカメラ）
# 撮影は別の作業（work/beforeafter/notes.md）：ラウンド 6.5 mm・11 号・甲丸 2.2 × 1.6 mm・K18。画面の値は、その版のアプリが出した数字
BA = os.path.join(WORK, "beforeafter")
BA6 = os.path.join(WORK, "beforeafter6")  # 最終案 6：今の版は、既定が「腕の間に挟む」になってから、同じカメラ・同じ地で撮り直した
# [絵の名前, 場面の中の拍, 前の長さ, 後の長さ, 切り取り（絵の中の割合。窓の比 1.222）, 拭う長さ, 前の札, 後の札]
BA_SHOTS = [
    ("hero", 0, 4, 4, [0.0, 0.025, 1.0, 0.9], 1.5, "最初の版 ・ 爪 ø 1.16 mm", "今の版 ・ 爪 ø 0.77 mm"),   # 爪の太さ・石座の高さ
    ("seat", 8, 2, 2, [0.0, 0.09, 1.0, 0.818], 1.0, "最初の版", "今の版"),                                # 石座と腕のつなぎ目
    ("under_gray", 12, 2, 2, [0.0, 0.09, 1.0, 0.818], 1.0, "最初の版", "今の版"),                         # 手前を切って石の下（ザグり）
]


def corner(path):
    try:
        from PIL import Image
        return "#%02x%02x%02x" % Image.open(path).convert("RGB").getpixel((4, 4))[:3]
    except Exception:
        return BG


def add_slot(t0, L=16):
    after_dir = BA6 if os.path.isdir(BA6) else BA
    have = all(os.path.exists(os.path.join(BA, f"before_{v[0]}.png")) and os.path.exists(os.path.join(after_dir, f"after_{v[0]}.png")) for v in BA_SHOTS)
    LB = (WIN[0] + 4, WIN[1] - 30)  # 札：窓の左上の外（黒の上。どの絵の上でも読める）
    if have:
        for name, r, lb, la, rect, wl, tb, ta in BA_SHOTS:
            for j, (w, at, ln) in enumerate((("before", t0 + r, lb), ("after", t0 + r + lb, la))):
                f = os.path.join(BA if w == "before" else after_dir, f"{w}_{name}.png")
                d = dict(at=at, len=ln, kind="img", img=f, fit="contain", area=[0, 0, WIN[2], WIN[3]], cam=[[0, rect], [ln, rect]],
                         win=WIN, bg=BG, innerBg=corner(f), border=True, borderColor="#2a2a2e", radius=18)
                if j:
                    d["tr"] = {"type": "wipe", "len": wl}
                clips.append(d)
                ev(at, f"絵：{w}_{name}")
                text.append(dict(mode="tag3", at=at + 0.5, len=ln - 0.5, text=ta if j else tb, label=LB, color=GOLD if j else GRAY, fout=0.25))
                ev(at + 0.5, "札：" + (ta if j else tb))
    else:
        clips.append(dict(at=t0, len=L, kind="black", color="#0b0b0d", win=WIN, bg=BG, borderColor="#2a2a2e", radius=18))
        ev(t0, "絵：（最初の版と今の版。準備中）")
        text.append(dict(mode="head", at=t0, len=L, lines=[], body=[["（最初の版と今の版の比べ。準備中）", 0, "#5f5f64"]], fout=0.3, x=WIN[0] + 60, y=WIN[1] + WIN[3] // 2, H=H, S=S))
    head(t0, L, ["最初の版から、", "*今の版へ。"], ["職人：この大きさなら、爪は最低 0.7 mm", "職人：石の台は、腕の間に挟む", "職人：石は、下の台にくっつくぐらい低く"], bt=[5, 9, 13])
    say(0, t0 + 1, "最初の版から、今の版へ。")
    say(0, t0 + 12, "どれも、職人の判断から。")


add_slot(88, 16)

# ================================================================ 0:52 Claude が聞きに来る（20 拍）：帳面は職人が育てる → 足りない所は Claude が聞く → 答えると決まりに
T = 104
win(T, 8, "ledger3m", ramp=[[0, 0], [4.6, 46], [5.6, 74], [8, 100]], cam=[[0, PH(110)], [4.6, PH(110)], [5.6, PH(10), "cio"]])
head(T, 8, ["この帳面は、", "*職人が育てる。"], ["職人の言葉と、選んだ資料。", "どれも、出どころつき。"], bt=[3, 4])
win(T + 8, 12, "ledger3m", ramp=[[0, 140], [1.6, 172], [2.4, 189], [4.4, 220], [6.0, 292], [6.6, 300], [7.0, 323], [9.4, 373], [10.0, 396], [10.6, 418], [12, 450]],
    cam=[[0, PH(330)], [2.0, PH(330)], [2.6, PH(20), "cio"], [6.6, PH(20)], [7.2, PH(200), "cio"], [9.6, PH(200)], [10.6, PH(50), "cio"]])
head(T + 8, 6, ["足りない所は、", "Claude が、", "*聞きに来る。"], fout=0.35)
head(T + 14, 6, ["答えると、", "*それが決まりになる。"], ["職人の言葉も、そのまま残る。"], bt=[3])
say(0, T + 1, "帳面は、私が話した言葉と、選んだ資料。")
say(0, T + 9, "足りない所は、Claude が聞きに来る。")
say(0, T + 15, "答えると、それが決まりになる。")

# ================================================================ 1:02 決まりは、工房ごとに
T = 124
HALF = [436, 95, 387, 640]
clips.append(dict(at=T, len=8, kind="split", win=WIN, bg=BG, borderColor="#2a2a2e", radius=18, sides=[
    # 撮った素材は 0〜49 こまが石川工房、50〜99 こまが工房 B。速さ 0.5 だと左が 50 こまを越えて工房 B に替わり、左右が同じ指輪になっていた（作者の指摘）
    {"ch": "workshops3", "from": 10, "speed": 0.25, "cam": [[0, {"v": HALF, "pad": 0.0}]], "noblur": True},
    {"ch": "workshops3", "from": 60, "speed": 0.25, "cam": [[0, {"v": HALF, "pad": 0.0}]], "noblur": True}]))
ev(T, "絵：工房ごと")
head(T, 8, ["決まりは、", "*工房ごとに。"])
tag(T + 3, 5, "石川工房 ・ ø 0.80 mm", (WIN[0] + 60, WIN[1] + WIN[3] - 70), color=GOLD)
tag(T + 4, 4, "工房 B ・ ø 1.41 mm", (WIN[0] + WIN[2] // 2 + 66, WIN[1] + WIN[3] - 70))
say(0, T + 1, "決まりは、工房ごとに。")

# ================================================================ 1:06 形づくりの早回し（24 拍。1 つ 4 拍）：組み上がる・赤・作れます・描く・同じ決まりで・作り方
T = 132
MK = [1185, 80, 420, 344]
TAGP = (WIN[0] + 60, WIN[1] + WIN[3] - 70)
win(T, 4, "build3", ramp=[[0, 60], [0.8, 126], [1.4, 194], [2.2, 232], [4, 300]], cam=[[0, [180, 60, 900, 736]]])
win(T + 4, 4, "red4", ramp=[[0, 30], [1.5, 56], [4, 112]], cam=[[0, STUDIO]])
win(T + 8, 4, "fix3", ramp=[[0, 312], [4, 376]], cam=[[0, STUDIO]])          # Claude で直したあと「作れます」（撮り直しで 10 こま後ろへ：318 こま目）
win(T + 12, 4, "section3", ramp=[[0, 87], [0.8, 127], [1.8, 175], [2.4, 190], [4, 250]], cam=[[0, EDIT]])
# 一粒（ラウンド）1 拍・マーキス 1 拍・覆輪 2 拍。三石（53・98）は使わない（上の MONT と同じ理由。2026-11-05）
for at_, ln_, fr in [(T + 16, 1, 8), (T + 17, 1, 188), (T + 18, 2, 143)]:
    win(at_, ln_, "same4", cam=[[0, STUDIO]], **{"from": fr})
win(T + 20, 4, "make3", ramp=[[0, 222], [4, 300]], cam=[[0, MK]])             # 作り方の札（撮り直しで印が変わった：card4 222・card6 286）
head(T, 24, ["形づくりも、", "*同じ決まりで。"])
for i, t_ in enumerate(["写真から、一瞬で組み上がる", "作るのが難しい所だけ、赤く", "Claude で直して、作れます", "描いた形のまま、指輪に", "石の形も、留め方も", "形から、作り方まで"]):
    tag(T + 4 * i + 1.5, 2.5, t_, TAGP, color=GREEN if i == 2 else WHITE)
say(0, T + 1, "形づくりも、作り方も、同じ決まりで。")

# ================================================================ 1:18 学校では：一人ひとりちがう → 継ぐなら、すぐ答えが出る（学ぶ：エメラルドと超音波洗浄機）
T = 156
kind(T, 12, "school3", k={"checks": [7, 8], "clock": 9, "shapes": ["round", "oval", "tri", "square", "emerald", "marq"]})
ev(T + 7, "図：確認 1", T); ev(T + 8, "図：確認 2", T); ev(T + 9, "図：待ち時間", T)
head(T, 12, ["学校では、", "*一人ひとりちがう。"], ["ジュエリーのデザインや、", "扱う石や材料が、ちがう。"], bt=[3, 4], fout=0.35)
win(T + 12, 8, "learn4m", ramp=[[0, 24], [2.6, 77], [3.0, 90], [3.4, 106], [8, 165]], cam=[[0, PH(470)], [3.0, PH(470)], [3.8, PH(200), "cio"]])
head(T + 12, 8, ["継ぐなら、", "*すぐ答えが出る。"], ["帳面の決まりから、出どころつきで。"], bt=[5])
say(0, T + 1, "学校では、一人ひとりジュエリーのデザインや、扱う石や材料がちがう。")
say(0, T + 13, "継ぐなら、すぐ答えが出る。")

# ================================================================ 1:28 工房では：新人が順番と数字を継ぐに聞く ／ 先輩に教わるのは、手の感覚だけ
T = 176
kind(T, 12, "senior5", k={"q1": 1.5, "q2": 2.5, "ans": 3.5, "feel": 7.5, "feelText": "手の感覚"})
ev(T + 1.5, "図：順番は？", T); ev(T + 2.5, "図：何 mm？", T); ev(T + 3.5, "図：継ぐの答え", T); ev(T + 7.5, "図：手の感覚", T)
head(T, 6, ["工房では、", "順番と数字を、", "*継ぐに聞く。"], fout=0.35)
head(T + 6, 6, ["先輩に教わるのは、", "*手の感覚だけ。"], ["まだ、言葉になっていない所。", "言葉にできたら、それも帳面に。"], t0=1, bt=[3, 4])
say(0, T + 1, "工房では、順番や数字は継ぐに聞く。")
say(0, T + 6.5, "先輩には、まだ言葉にできない手の感覚を。")

# ================================================================ 1:34 つなぎ → 作り手の数 → 伊勢神宮 → 鐔・太刀（静かな所）
T = 188
clips.append(dict(at=T, len=8, kind="black", color=BG))
ev(T, "黒")
head(T, 8, ["そして、", "伝統工芸の", "*継承にも使える。"], fout=0.5)
say(0, T + 1, "そして、伝統工芸の継承にも使える。")
T = 196
kind(T, 8, "stat3", k={"grow": 3})
ev(T + 3, "図：帯が縮む")
head(T, 8, ["技を知る人が、", "*減っていく。"], ["24 年で、約 6 割減。"], bt=[5])
text.append(dict(mode="head", at=T, len=8, lines=[], body=[["出典：経済産業省 説明資料（伝統的工芸品産業振興協会の集計。2022 年度）", 4, "#7c7c80"]], fout=0.4, x=HX, y=1040, H=H, S=S))
say(0, T + 1, "伝統的工芸品の作り手は、約 6 割減った。")
T = 204
img(T, 8, "public/heritage/naiku-1953.jpg")
head(T, 8, ["20 年に一度、", "*作り直す技もある。"], ["伊勢神宮の神宝。", "彫金・金工の技も、使われる。"], bt=[3, 5])
text.append(dict(mode="head", at=T, len=8, lines=[], body=[["写真：1953 年の内宮（本田照夫 撮影・Wikimedia Commons・パブリックドメイン）", 0, "#7c7c80"]], fout=0.3, x=HX, y=1040, H=H, S=S))
say(0, T + 1, "伊勢神宮の神宝は、20 年に一度、作り直す。")
T = 212
kind(T, 12, "imgs", border=False, items=[
    {"img": "public/heritage/tsuba-carp.jpg", "area": [40, 40, 470, 500]},
    {"img": "public/heritage/tachi.jpg", "area": [540, 110, 520, 330]},
    {"img": "public/heritage/kazari-tachi.jpg", "area": [40, 600, 1020, 250]}])
head(T, 12, ["彫金・金工は、", "*ジュエリーと同じ技。"], ["でも、工房ごとに決まりがあるように、", "神宝にも、作るときの決まりがある。"], bt=[5, 6])
text.append(dict(mode="head", at=T, len=12, lines=[], body=[["鐔・太刀：メトロポリタン美術館（CC0）／飾太刀：東京国立博物館 ColBase（CC BY 4.0）", 0, "#7c7c80"]], fout=0.3, x=HX, y=1040, H=H, S=S))
say(0, T + 1, "その彫金・金工は、ジュエリーと同じ技。")
say(0, T + 7, "でも、作るときの決まりがある。")

# ================================================================ 1:52 伝統の技も、同じしくみで（技の頁：木目金 → Claude が職人に聞く → 決まりに）
T = 224
win(T, 12, "waza3m", ramp=[[0, 26], [1.4, 46], [2.4, 70], [3.0, 89], [5.4, 150], [7.0, 214], [7.6, 237], [8.0, 245], [9.8, 295], [10.3, 318], [10.8, 342], [12, 380]],
    cam=[[0, PH(560)], [2.6, PH(560)], [3.3, PH(180), "cio"], [7.8, PH(180)], [8.3, PH(400), "cio"], [10.3, PH(400)], [10.9, PH(40), "cio"]])
head(T, 12, ["伝統の技も、", "*同じしくみで。"], ["たとえば、木目金（もくめがね）。", "Claude が職人に聞いて、決まりにする。"], bt=[4, 5])
say(0, T + 1, "木目金のような伝統の技も、同じしくみで残せる。")

# ================================================================ 1:58 木目金の歴史（12 拍）。秋田県の無形文化財「杢目金」の説明の言葉だけ（2026-11-05 原文で確かめた）。年・廃刀令・秘伝などは言わない（資料にない）
T = 236
win(T, 12, "rebuild3", ramp=[[0, 0], [12, 36]], cam=[[0, [416, 40, 768, 628]]])
head(T, 12, ["木目金は、", "江戸時代の", "*刀の飾りの技。"], ["一時途絶えたとされ、", "のちに復元された。"], bt=[5, 6])
text.append(dict(mode="head", at=T, len=12, lines=[], body=[["出典：秋田県 無形文化財「杢目金」の説明（秋田県のウェブサイト）", 0.5, "#7c7c80"]], fout=0.3, x=HX, y=1040, H=H, S=S))
ev(T + 0.5, "本文：出典", T)
say(0, T + 1, "木目金は、江戸時代の刀の飾りの技。")
say(0, T + 6, "一時途絶えたとされ、のちに復元された。")

# ================================================================ 2:04 作り方を Claude に隠し、手がかりだけ（12 拍）→ 順番を考える（8 拍）
T = 248
# 前の場面（木目金の歴史）と同じ枠から始めて、1.5 拍で手がかりの所へ下げる（同じ画面が 260 px 飛んで見えないように。2026-11-05）
win(T, 12, "rebuild3", ramp=[[0, 37], [12, 120]], cam=[[0, [416, 40, 768, 628]], [1.5, [416, 300, 768, 628], "cio"]])
head(T, 12, ["作り方を、", "*Claude に隠す。"], ["渡すのは、残った品物の手がかりだけ。"], bt=[4])
say(0, T + 1, "作り方を Claude に隠して、手がかりだけを渡す。")
T = 260
win(T, 8, "rebuild3", ramp=[[0, 130], [0.8, 137], [1.6, 160], [2.4, 186], [3.2, 202], [8, 270]], cam=[[0, [416, 470, 768, 628]], [2.4, [416, 470, 768, 628]], [3.4, [416, 170, 768, 628], "cio"]])
head(T, 8, ["Claude が、", "作り方の順番を、", "*考える。"], ["手がかりから、一つずつ。"], bt=[4])
say(0, T + 1, "Claude が、作り方の順番を考える。")

# ================================================================ 2:14 本当の 11 の手順と比べる（36 拍）：灯り → 9 / 11 → 3 回試して → 失われた技も
T = 268
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
head(T, 16, ["隠しておいた、", "*本当の 11 の手順。"], fout=0.4)
# 同じ手がかりで、本物の Claude で 3 回組み立てた（rebuild3：9/11、ほかに 9/11 と 10/11。2026-11-04）
TRIES = os.environ.get("REBUILD_TRIES", "3 回試して、9〜10 / 11。")
head(T + 16, 12, ["11 のうち、", f"*{len(lit)} に、たどり着いた。"], ["答えは隠したまま、手がかりだけで。", TRIES], bt=[4, 6])
head(T + 28, 8, ["失われた技も、", "手がかりから、", "*組み立て直せる", "*かもしれない。"], fout=0.4)
say(0, T + 1, "隠しておいた、本当の 11 の手順と比べる。")
say(0, T + 17, f"11 のうち {len(lit)} に、たどり着いた。")
say(0, T + 29, "失われた技も、手がかりから組み立て直せるかもしれない。")

# ================================================================ 2:32 柱の一文（終わりの指輪の上に）→ 金床の 3 音 → 継ぐ
T = 304
win(T, 16, "hero4", cam=[[0, PRES]], border=False, ramp=[[0, 0], [16, 239]])
head(T, 8, ["職人の判断を、", "*蓄える。"], fout=0.4)
head(T + 8, 8, ["失われた技まで、", "*組み立て直す。"], fout=0.6)
for i, (ch, fr) in enumerate(MONT[:3]):  # つかみのはじめの 3 つと同じ指輪（三石の multi4 48 は、つかみと同じく hero3 334 に替えた）
    win(T + 16 + i, 1, ch, cam=[[0, PRES]], border=False, **{"from": fr})
E = T + 19  # 323
clips.append(dict(at=E, len=5, kind="black", color=BG))
ev(E, "黒")
# 作った記録：本物の git の履歴（このリポジトリ。大会の期間に、職人が Claude Code と書いたもの）
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
text.append(dict(mode="head", at=E + 1, len=12, lines=[], body=[["職人の判断を、次の人へ。", 1, WHITE], ["このアプリも、彫金職人が", 2, GRAY], ["Claude Code と作りました。", 3, GRAY]], fout=1.5, x=HX, y=615, H=H, S=S))
ev(E + 2, "本文：次の人へ"); ev(E + 3, "本文：このアプリも"); ev(E + 4, "本文：Claude Code と"); ev(E + 6, "図：コミット数")
text.append(dict(mode="head", at=E + 7, len=6, lines=[], body=[
    ["画面はすべて継ぐの実際の操作（Claude の答えも、撮ったときのまま）。", 0, "#7c7c80"],
    ["画像の出どころは、それぞれの場面に。音楽と効果音は、自作の合成。", 0, "#7c7c80"]], fout=1.5, x=HX, y=980, H=H, S=S))
ev(E + 7, "出どころ")
LEN = E + 13  # 336 拍 ＝ 2:48
say(0, T + 1, "職人の判断を、蓄える。")
say(0, T + 9, "失われた技まで、組み立て直す。")
say(0, E + 0.5, "継ぐ。")
say(0, E + 2.5, "このアプリも、私が Claude Code と作りました。")

# ================================================================ 音楽の楽譜（bgm5.py が読む）。段・止める所・一打は、上の並びに合わせた
score = {
    "key": [[0, 0], [304, 2]],
    "hook_drone": True,
    "sections": [{"at": a, "len": l_, "name": n} for a, l_, n in [
        (0, 8, "hook"), (8, 4, "intro"), (12, 8, "montage"), (20, 4, "title"), (24, 8, "intro2"), (32, 8, "verse"), (40, 8, "tension"), (48, 20, "build"),
        (68, 12, "drop"), (80, 24, "groove"), (104, 28, "light"), (132, 24, "groove"), (156, 32, "bridge"), (188, 36, "breakdown"),
        (224, 44, "build2"), (268, 36, "reveal"), (304, 16, "final"), (320, 16, "outro")]],
    "stops": [[7.5, 8], [67, 68], [279.5, 280], [323, 324]],
    "impacts": [8, 68, 280],
    "reveal_hit": 280,
    # つかみ：指輪が並ぶ所で金床のミ・レ・ド・ソ。終わり：同じ 4 音を全音上げて（ファ#・ミ・レ … 題でラ）
    "anvil": [[12, 76, "motif"], [13, 74, "motif"], [14, 72, "motif"], [15, 79, "motif"], [20, 69, "title"], [320, 78, "motif"], [321, 76, "motif"], [322, 74, "motif"], [324, 81, "title"]],
    "risers": [[4, 8], [60, 68], [220, 224], [274, 280], [300, 304]],
    "pings": [[16, 76], [17, 74], [18, 72], [19, 67]] + [[148 + i, m] for i, m in enumerate([76, 74, 72, 79])],
    "ticks": [[268 + b, m] for (b, _), m in zip(lights, [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96])],
}

# ---------------------------------------------------------------- 作者の声に合わせて、場面をのばす・つめる
# 作者の録音 work/voice/n<番号>.wav（.m4a・.mp3・.aif なども可）があれば、その長さで場面の長さを決める。録音の速さは変えない。
#  1. 録音を整える：前とうしろの無音を切る・低い雑音を除く・大きさをそろえる → work/voice/_own/n<番号>.wav（final.py はこれを使う）
#  2. 声が入りきらないとき：その場面のおわり（次の見出しの頭）で、絵をその所で止めて、小節（4 拍 ＝ 2 秒）ずつのばす。音楽も同じ所でのびる
#  3. 声が短くて、場面のおわりに 1 小節以上あまるとき：そのおわりを小節ずつつめる（切り替えの所だけ。見せたい動きと字が、みな出たあとだけ）
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
    f = os.path.join(WORK, "voice", f"k6_n{v['n']}.wav")
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
            s_["len"] += k  # t0 で終わる段（その場面の音楽）が、のびる・つまる
    for key in ("stops", "risers"):  # 止める所・上がる音は、おわりの所（切り替え）についていく
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


def trim(t0, k):
    """t0 拍の手前 k 拍をつめる（t0 で終わる絵のおわりを切る）"""
    global LEN
    for c in clips:
        if c["at"] >= t0 - 1e-6:
            c["at"] -= k
        elif c["at"] + c["len"] >= t0 - 1e-6:
            c["len"] -= k
            if "warp" in c:
                c["warp"] = [p_ for p_ in c["warp"] if p_[0] < c["len"] - 1e-6] + [[c["len"], wv(c["warp"], c["len"])]]
    for t in text:
        if t["at"] >= t0 - 1e-6:
            t["at"] -= k
        elif t["at"] + t["len"] >= t0 - k - 1.0:
            t["len"] = max(1.0, t["len"] - k)
    for v in voice:
        if v["at"] >= t0 - 1e-6:
            v["at"] -= k
    for e_ in events:
        if e_[0] >= t0 - 1e-6:
            e_[0] -= k
    for x_ in sfx:
        if x_[0] >= t0 - 1e-6:
            x_[0] -= k
    move_score(t0, -k)
    LEN -= k


def content_end(b0, b1):
    """場面 [b0, b1) で、見せたい物がみな出終わる拍：新しく出る物 + 2 拍、カメラ・撮った画面の動き・枠 + 2 拍、字 + 2 拍"""
    m = b0
    for e_ in events:
        if b0 - 1e-6 <= e_[0] < b1 - 1e-6:
            m = max(m, e_[0] + 2)
    for t in text:
        if b0 - 1e-6 <= t["at"] < b1 - 1e-6:
            m = max(m, t["at"] + 2)
    for c in clips:
        if c["at"] < b1 - 1e-6 and c["at"] + c["len"] > b0 + 1e-6:
            ks = [k_[0] for k_ in c.get("cam", []) if isinstance(k_[1], (dict, str))] + [k_[0] for k_ in c.get("focus", [])] + [k_[0] for k_ in c.get("ramp", [])[:-1]]
            for k_ in ks:
                m = max(m, c["at"] + wv(c["warp"], k_) + 2 if "warp" in c else c["at"] + k_ + 2)
            if c.get("kind") in KINDS_T:
                m = max(m, b1)  # 図の動き（中の時刻）は、ここでは数えない：つめない
    return m


KINDS_T = ("flow4", "school3", "senior3", "check3", "stat3", "term", "split")
own_rows = []
for i_, v_ in enumerate(sorted(voice, key=lambda v: v["at"])):
    v_["n"] = i_ + 1
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
    """作者の声の長さで、場面をのばす・つめる（tempo：作者の声の速さ。ふだん 1）"""
    global LEN
    fit_log.clear()
    for v_ in voice:
        if v_.get("own"):
            v_["own_dur"] = v_["own_raw"] / tempo
    # 2. のばす：作者の声が、その場面に入りきらない所
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
    # 3. つめる：場面のおわりに 1 小節以上あまる所（その場面の声がみな作者の録音のときだけ。はじめのつかみ・おわりの題はつめない）
    for _ in range(100):
        vs_ = sorted(voice, key=lambda v: v["at"])
        se_ = place(vs_)
        B_ = bounds()
        cut_ = None
        for b0, b1 in zip(B_, B_[1:]):
            if b0 < 24 or b1 >= LEN - 1e-6 or not any(abs(c["at"] - b1) < 1e-6 for c in clips):
                continue
            rows_ = [(v_, se_[i_]) for i_, v_ in enumerate(vs_) if b0 - 1.0 - 1e-6 <= v_["at"] < b1 - 1.0 - 1e-6]
            if not rows_ or not all(v_.get("own") for v_, _ in rows_):
                continue
            m = max(content_end(b0, b1), max(e_ / SEC + 1.0 for _, (_, e_) in rows_))
            k = 4 * int((b1 - m) // 4)
            if k < 4:
                continue
            last = [c for c in clips if c["at"] < b1 - 1e-6 and c["at"] + c["len"] >= b1 - 1e-6]
            sec_ = [s_ for s_ in score["sections"] if s_["at"] < b1 <= s_["at"] + s_["len"] + 1e-6]
            pts = [x[0] for key in ("anvil", "pings", "ticks") for x in score[key]] + score["impacts"] + [a_ for a_, _ in score["key"]]
            if any(c["len"] - k < 2 or c["at"] > b1 - k - 1e-6 for c in last) or any(s_["len"] - k < 4 for s_ in sec_) or any(b1 - k - 1e-6 <= p_ < b1 - 1e-6 for p_ in pts):
                continue
            cut_ = (b1, k)
            break
        if not cut_:
            break
        trim(cut_[0], cut_[1])
        fit_log.append(f"つめる：{cut_[0] / 2:.1f} 秒の所の手前を {cut_[1] // 2} 秒")



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
        if c.get("y", HY) < 900:
            w_ = width(b_[0], c.get("S", S), "g4")
            if w_ > COLW + 10:
                problems.append(f"本文が長い（{w_:.0f} px）：{b_[0]}")
by = {}
for b, w_, _o in events:
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
if LEN > 360:
    problems.append(f"3 分を越える：{LEN / 2:.1f} 秒（作者の声に合わせてのばした分。上の「声に合わせて」を見る）")
for p_ in problems:
    print("！", p_)

voice.sort(key=lambda v: v["at"])
for i_, v_ in enumerate(voice):
    v_["n"] = i_ + 1
tl = dict(bpm=120, len=LEN, style=3, clips=cs, text=text, fx=[], music=[], hits=[], risers=[], drops=[], stops=[], downs=[], voice=voice, sfx=sfx,
          grain=0.9, vignette=0.14, score=score, own_tempo=round(OWN_TEMPO_USED, 3),
          own_sim=bool(own_rows) and os.path.abspath(OWN_DIR) != os.path.abspath(os.path.join(WORK, "voice")))  # 作者の録音のまね（仮声）なら True
end = cs[-1]["at"] + cs[-1]["len"]
print("長さ", end, "拍 ＝", end / 2, "秒", "／ 気になる所", len(problems))
json.dump(tl, open(os.path.join(HERE, "final6.json"), "w"), ensure_ascii=False, indent=1)
