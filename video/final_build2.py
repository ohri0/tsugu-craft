# 最終案 2 の台本（final2.json）を作る。時刻はすべて「拍」（120 拍／分 → 1 拍 0.5 秒）。
# 作者の声（最終案 1 を見て）：「よくなったが、まだ AI が作った感じ」「専門外の人にも分かるように。目を向ける所は 1 つ」。
# 見本（左に見出し、右に動く絵。目がいつも同じ所で読める）から、作り方を決めた：
#  - 説明の場面は、左に見出し（同じ所。1 行目を打ち、2 行目は金色）、右の窓に本物の画面。窓の中は、見せたい所へカメラが寄り、細い金の枠で囲む
#  - 見せ場（指輪が変わる・赤く光る・ダン）は、画面いっぱいに
#  - 下に細い進み具合の線と、いまの段の名前。「実際の操作画面」と書く
#  - 伝統の所（作り手の数・式年遷宮）は、生成りの紙の色に明朝
# 使い方：python -I final_build2.py → final2.json
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
VARIANT = os.environ.get("VARIANT", "A")
WORK = os.environ.get("TSUGU_VIDEO_WORK", os.path.join(HERE, "work"))
clips, text, fx, music, voice, sfx = [], [], [], [], [], []
hits, risers, drops, stops, downs = [], [], [], [], []

WHITE, GOLD, RED, GREEN, GRAY = "#f5f5f7", "#e8c27a", "#ff5a4e", "#3ddc84", "#a1a1a6"
CREAM, INK, BENGARA, INKGRAY = "#efe9de", "#1d1d1f", "#a8432a", "#6e6a63"
DARK = "#0c0c0e"
WIN = [740, 96, 1100, 884]          # 右の窓（出力の px）
STEP_POS = (110, 300)               # 左の見出し

# 撮り直しを待つ章（アプリが変わったら、新しい章に切り替える）
CH = {"ask": os.environ.get("CH_ASK", "ask2"), "section": os.environ.get("CH_SECTION", "section2"), "learn": os.environ.get("CH_LEARN", "learn2"),
      "waza": os.environ.get("CH_WAZA", "waza2"), "rebuild": os.environ.get("CH_REBUILD", "rebuild2"), "fix": os.environ.get("CH_FIX", "fix2"),
      "make": os.environ.get("CH_MAKE", "make2"), "stones": os.environ.get("CH_STONES", "stones"), "word": "word", "build": "build",
      "present": "present", "workshops": "workshops"}


def has(ch):
    return os.path.exists(os.path.join(WORK, "story", ch, "meta.json"))


def story(at, ln, ch, **kw):
    clips.append(dict(at=at, len=ln, ch=CH.get(ch, ch), **kw))


def win(at, ln, ch, **kw):
    """右の窓に本物の画面"""
    kw.setdefault("win", WIN)
    kw.setdefault("bg", DARK)
    story(at, ln, ch, **kw)


def black(at, ln, color=DARK, **kw):
    clips.append(dict(at=at, len=ln, kind="black", color=color, **kw))


def img(at, ln, path, **kw):
    clips.append(dict(at=at, len=ln, kind="img", img=path, **kw))


def step(at, ln, label, l1, l2, desc=(), light=False, **kw):
    """左の見出し（いつも同じ所）"""
    d = dict(at=at, len=ln, mode="step", label=label, l1=l1, l2=l2, desc=list(desc), pos=kw.pop("pos", STEP_POS), size=kw.pop("size", 70), sfx=kw.pop("sfx", "tink"), fout=kw.pop("fout", 0.3))
    if light:
        d.update(color=INK, accent=BENGARA, dcolor=INKGRAY, font="m6", dfont="m3")
    d.update(kw)
    text.append(d)


def swap(at, ln, words, size=150, font="g6", **kw):
    text.append(dict(at=at, len=ln, mode="swap", lines=[[list(w) for w in words]], size=size, font=font, **kw))


def call(at, ln, t, pos, size=84, label=None, **kw):
    text.append(dict(at=at, len=ln, mode="call", text=t, pos=pos, size=size, label=label, **kw))


def tag(at, ln, t, y=40):
    text.append(dict(at=at, len=ln, mode="tag", text=t, sfx="shimmer", y=y))


def src(at, ln, t, light=False, **kw):
    text.append(dict(at=at, len=ln, mode="src", text=t, color=INKGRAY if light else "#8e8e93", **kw))


def say(n, at, t):
    voice.append(dict(n=n, at=at, text=t))


def part(at, ln, kind, lv=0.7, **kw):
    music.append(dict(at=at, len=ln, part=kind, lv=lv, **kw))


# 枠（ページの px）
WORD_HEAD = [470, 110, 400, 220]
WORD_RING = [330, 50, 640, 420]
FIX_HEAD = [500, 120, 330, 190]
PRES_RING = [880, 40, 480, 760]
PRES_HEAD = [930, 50, 400, 230]
PANEL = [1255, 40, 345, 840]
COL = [410, 40, 780, 840]

# ================================================================ つかみ（0:00–0:04）ダン・ダン・ダン（金床の音）
hits += [0, 1, 2]
story(0, 1, "present", **{"from": 28, "cam": [[0, {"v": PRES_HEAD, "pad": 0.05}], [1, {"v": PRES_HEAD, "pad": -0.1}, "out"]]}, drift=0.0)
story(1, 1, "fix", **{"from": "red+14", "cam": [[0, {"v": FIX_HEAD, "pad": 0.1}], [1, {"v": FIX_HEAD, "pad": -0.05}, "out"]]}, drift=0.0)
story(2, 1, "word", **{"from": 96, "cam": [[0, {"v": "field", "pad": 0.25}], [1, {"v": "field", "pad": 0.1}, "out"]]}, keys=[["typed-60", "typed"]])
story(3, 1, "word", **{"from": 226, "cam": [[0, {"v": WORD_HEAD, "pad": 0.3}], [1, {"v": WORD_HEAD, "pad": 0.2}]]}, drift=0.0)
story(4, 4, "word", **{"from": 241, "speed": 0.8, "cam": [[0, {"v": WORD_HEAD, "pad": 0.2}], [1.5, {"v": WORD_RING, "pad": 0.0}, "io"], [4, {"v": WORD_RING, "pad": -0.06}]]})
fx.append(dict(k="flash", at=4, len=0.8, amt=0.5))
call(4, 3.6, "ø 1.66 → 0.80 mm", (1400, 860), size=92, label="職人の一言で、爪が変わる", anchor="c", anim="pop", sfx="kan")
risers.append([5, 8])
part(0, 8, "intro", 0.9)

# ================================================================ 柱の一文（0:04–0:12）：蓄える → 組み立て直す → 継ぐ
story(8, 6, "present", **{"from": 30, "speed": 0.6, "cam": [[0, {"v": PRES_RING, "pad": 0.0, "dx": -160}], [6, {"v": PRES_RING, "pad": -0.1, "dx": -160}]]}, grade={"dim": 0.7, "blur": 6}, tr={"type": "xfade", "len": 1})
step(8, 6, "", "職人の判断を、", "蓄える。", pos=(150, 380), size=104, cps=14, sfx="tink")
story(14, 6, "rebuild", **{"from": 128, "speed": 0.3, "cam": [[0, {"v": [440, 160, 520, 420], "pad": 0.0}], [6, {"v": [440, 160, 520, 420], "pad": -0.1}]]}, grade={"dim": 0.66, "blur": 5}, tr={"type": "xfade", "len": 1})
step(14, 6, "", "失われた技まで、", "組み立て直す。", pos=(150, 380), size=104, cps=14, sfx="tink")
# 左を暗くするのは、言葉の札でなく画面の側で（札が消えるときも、つなぎの間も、「見せる」の左の欄の字が出てこない）
story(20, 4, "present", **{"from": 36, "speed": 0.8, "cam": [[0, {"v": PRES_RING, "pad": 0.08, "dx": 120}], [4, {"v": PRES_RING, "pad": 0.0, "dx": 120}]]}, grade={"dim": 0.35, "scrim": "left2", "scrimAmt": 1.04}, tr={"type": "xfade", "len": 0.5})
text.append(dict(at=20, len=4, mode="stack", lines=[[["継ぐ", 0, {"font": "m6", "size": 210}]], [["職人の判断を、次の人へ。", 1, {"font": "g4", "size": 40, "color": "#c8c8cc"}]]], pos=(480, 540), size=210, lh=1.0, anim="depth", fout=0.6, sfx="kan"))
part(8, 16, "title", 0.6)

# ================================================================ 01 困りごと（0:12–0:22）：作れない、と戻ってくる → 絵の段階で確かめる
clips.append(dict(at=24, len=20, kind="loop", win=WIN, bg=DARK, num="01", phase2=12, tr={"type": "xfade", "len": 0.6}))
step(24, 12, "01 ／ 困りごと", "作れない、と", "戻ってくる。", ["デザインの絵が、作る所で止まる。", "その理由は、職人の頭の中だけ。"])
step(36, 8, "01 ／ 困りごと", "絵の段階で、", "確かめる。", ["継ぐは、職人の判断を決まりにして、", "形をその場で確かめる。"])
say(1, 25, "デザインの絵が、「作れない」と戻ってくる。理由は、職人の頭の中だけ。")
say(2, 37, "継ぐは、その判断を決まりにして、絵の段階で確かめます。")
part(24, 20, "problem", 0.5)

# ================================================================ 02 組む（0:22–0:32）
clips.append(dict(at=44, len=4, kind="foot", foot="ring1", win=WIN, bg=DARK, num="02", tr={"type": "xfade", "len": 0.5},
                  fallback={"ch": CH["build"], "from": 0, "speed": 1.0, "cam": [[0, {"v": "photo", "pad": 0.1}], [4, {"v": "photo", "pad": 0.0}]]}))
win(48, 8, "build", ramp=[[0, 70], [2, 126], [4, 172], [6, 200], [8, 240]], cam=[[0, {"v": "photo", "pad": 0.05}], [2, {"v": [140, 40, 1000, 800], "pad": 0.0}, "io"], [8, {"v": [300, 40, 800, 640], "pad": 0.0}]], num="02")
step(44, 12, "02 ／ 組む", "石の写真から、", "指輪を組む。", ["写真 1 枚から、", "形・図面・作り方まで。"])
win(56, 8, "word", ramp=[[0, 0], [8, 22]], cam=[[0, {"v": WORD_RING, "pad": 0.05}], [2, {"v": WORD_HEAD, "pad": 0.25}, "io"], [8, {"v": WORD_HEAD, "pad": 0.18}]],
    focus=[[2.5, WORD_HEAD, 0.0], [3.2, [500, 120, 340, 170], 1.0]], num="02")
step(56, 8, "02 ／ 組む", "ネットの情報だけだと、", "爪が太すぎる。", ["公開情報の目安だけで組んだ爪：ø 1.66 mm"])
say(3, 45, "私は、宝飾の彫金職人です。継ぐは、石の写真から指輪を組みます。")
say(4, 57, "でも、ネットの情報だけだと、爪が太すぎる。")
part(44, 20, "verse", 0.5)

# ================================================================ 03 職人の一言（0:32–0:52）
win(64, 14, "word", ramp=[[0, 20], [2, 40], [12, 153], [14, 176]], cam=[[0, {"v": PANEL, "pad": 0.0}], [1.5, {"v": [1253, 427, 355, 397], "pad": 0.08}, "io"], [14, {"v": [1253, 427, 355, 397], "pad": 0.05}]],
    focus=[[1.0, "field", 0.0], [2.0, "field", 1.0], [12.5, "field", 1.0], [13.5, "go", 1.0]], keys=[["type+17", "typed"]], num="03")
step(64, 14, "03 ／ 職人の一言", "職人の言葉を、", "そのまま入れる。", ["打っても、話してもいい。"])
win(78, 12, "word", ramp=[[0, 176], [2, 186], [10, 221], [12, 236]], cam=[[0, {"v": [1253, 427, 355, 397], "pad": 0.05}], [2, {"v": [1253, 540, 355, 300], "pad": 0.05}, "io"], [12, {"v": [1253, 540, 355, 300], "pad": 0.03}]],
    focus=[[1.5, "proposal", 0.0], [2.5, "proposal", 1.0], [10, "proposal", 1.0], [11.2, "ok", 1.0]], sfx=[[2, "shimmer"]], num="03")
step(78, 12, "03 ／ 職人の一言", "Claude が、", "決まりにする。", ["言葉から、数字つきの決まりに。", "「これでいい」で、帳面に入る。"])
tag(80, 9, "が、職人の言葉を決まりにまとめる", y=36)
# 前（太い）→ 落ちる所で後（細い）：画面いっぱい
story(90, 8, "word", ramp=[[0, 186], [8, 235]], cam=[[0, {"v": WORD_HEAD, "pad": 0.4}], [8, {"v": WORD_HEAD, "pad": 0.15}]], tr={"type": "zoom", "len": 0.6})
call(91, 6.9, "ø 1.66 mm", (1300, 190), size=78, label="ネットの情報だけ", anim="pop")
stops.append([97.5, 98])
drops.append(98)
story(98, 6, "word", ramp=[[0, 241], [6, 290]], cam=[[0, {"v": WORD_HEAD, "pad": 0.15}], [2, {"v": WORD_HEAD, "pad": 0.25}], [6, {"v": WORD_RING, "pad": 0.05}, "io"]])
fx.append(dict(k="flash", at=98, len=0.9, amt=0.65))
call(98, 6, "ø 0.80 mm", (1300, 190), size=78, label="職人の決まり", anim="pop", color=GOLD, sfx="kan")
say(6, 65, "職人なら、こう言います。この大きさなら、爪は最低 0.7、基本は 0.8 から 1 ミリ。")
say(7, 79, "その一言を、Claude が決まりにします。")
say(8, 99, "形が、その場で変わる。")
part(64, 26, "verse", 0.65)
part(90, 8, "build", 0.75)
risers.append([90, 98])
part(98, 6, "drop", 0.95)

# ================================================================ 04 確かめる・直す（0:52–1:06）
F = CH["fix"]
win(104, 6, "fix", ramp=[[0, 0], [1, 16], [4, "red"], [6, "red+20"]], cam=[[0, {"v": [1255, 560, 345, 220], "pad": 0.1}], [3.5, {"v": [1255, 560, 345, 220], "pad": 0.1}], [4.5, {"v": FIX_HEAD, "pad": 0.25}, "io"], [6, {"v": FIX_HEAD, "pad": 0.15}]],
    num="04", tr={"type": "xfade", "len": 0.5})
step(104, 6, "04 ／ 確かめる", "細すぎると、", "赤く光る。", ["職人の決まりより細い爪を、", "その場で知らせる。"])
win(110, 6, "fix", ramp=[[0, "red+20"], [1.5, "pop-4"], [6, "pop+30"]], cam=[[0, {"v": FIX_HEAD, "pad": 0.15}], [1.5, {"v": "pop", "pad": 0.12}, "io"], [6, {"v": "pop", "pad": 0.06}]],
    focus=[[1.6, "pop", 0.0], [2.4, "pop", 0.8]], num="04")
step(110, 6, "04 ／ 確かめる", "押すと、", "理由と直し方。", ["職人の言葉も、いっしょに出る。"])
win(116, 2, "fix", ramp=[[0, "pop+30"], [2, "fixed1-3"]], cam=[[0, {"v": "pop", "pad": 0.1}], [2, {"v": "pop", "pad": 0.08}]], focus=[[0, "every", 1.0]], num="04", noblur=True)
win(118, 4, "fix", ramp=[[0, "fixed1-1"], [4, "fixed1+40"]], cam=[[0, {"v": [430, 30, 840, 520], "pad": 0.0}], [4, {"v": [430, 30, 840, 520], "pad": -0.05}]], focus=[[0.3, "chip2", 0.0], [0.8, "chip2", 0.9], [3.2, "chip2", 0.9]], num="04")
step(116, 6, "04 ／ 直す", "押せば、", "一瞬で直る。", ["決まりに合う太さまで、", "まとめて直す。"])
call(118.4, 3.6, "作れます", (1500, 830), size=56, color=GREEN, anim="pop", sfx="ding")
win(122, 10, "fix", ramp=[[0, "pop2"], [1.5, "claude"], [7, "fixed2"], [10, "fixed2+40"]], cam=[[0, {"v": "pop", "pad": 0.1}], [1.5, {"v": "log", "pad": 0.1}, "io"], [8, {"v": "log", "pad": 0.06}], [9.2, {"v": [430, 30, 840, 520], "pad": 0.0}, "io"]],
    focus=[[0.3, "claudeBtn", 1.0], [1.4, "claudeBtn", 1.0], [2.2, "log", 0.9], [8.6, "log", 0.0]], num="04")
step(122, 10, "04 ／ 直す", "Claude も、", "直してくれる。", ["check で確かめ、", "形はそのまま、爪だけ太くする。"])
tag(123, 8, "が、帳面の決まりで確かめて直す", y=36)
say(11, 105, "細くしすぎると、赤く光る。押すと、理由と直し方。")
say(12, 117, "押せば、一瞬で直る。Claude に直してもらうこともできます。")
part(104, 28, "chorus", 0.9)

# ================================================================ 05 描く（1:06–1:12）断面を自由に描く → 尖った所だけが赤
win(132, 12, "section", ramp=[[0, "start+20"], [1, "draw1"], [3.5, "draw1End"], [4.5, "draw1End+24"], [5.2, "draw2"], [7.5, "draw2End"], [10.5, "sharp+50"], [11.2, "fixed-2"], [12, "fixed+20"]],
    cam=[[0, {"v": "svg", "pad": 0.3}], [3.5, {"v": "svg", "pad": 0.25}], [4.1, {"v": [300, 40, 960, 800], "pad": 0.0}, "io"], [4.8, {"v": [300, 40, 960, 800], "pad": 0.0}], [5.3, {"v": "svg", "pad": 0.3}, "io"],
         [7.6, {"v": "svg", "pad": 0.25}], [8.2, {"v": "editor3", "pad": 0.06}, "io"], [12, {"v": "editor3", "pad": 0.04}]],
    focus=[[0.4, "svg", 0.9], [3.5, "svg", 0.9], [4.0, "svg", 0.0], [5.4, "svg", 0.9], [7.6, "svg", 0.9], [8.3, [1268, 640, 325, 195], 1.0], [10.6, [1268, 640, 325, 195], 1.0], [11.0, [1268, 640, 325, 195], 0.0]],
    focusColor=RED, num="05")
step(132, 6, "05 ／ 描く", "腕の断面を、", "指で描く。", ["描いた線に、なめらかな線が合う。", "そのまま指輪になる。"])
step(138, 6, "05 ／ 描く", "尖りすぎると、", "そこだけ赤く。", ["欠けやすい先だけを、", "その場で知らせる。"])
say(13, 133, "腕の断面も、指で描ける。尖りすぎた所だけ、赤く知らせる。")
part(132, 12, "chorus", 0.95)

# ================================================================ 06 どんな石でも（1:12–1:17）
ST = CH["stones"]
if has(ST):
    b = 144
    for k, mk in enumerate(["round", "marquise", "emerald", "pear"]):
        win(b, 2.5, ST, **{"from": mk, "speed": 1.0, "cam": [[0, {"v": [900, 60, 500, 720], "pad": 0.05}], [2.5, {"v": [900, 60, 500, 720], "pad": -0.02}]]}, num="06", noblur=True, bg="#000000", border=False)
        b += 2.5
else:
    win(144, 10, "present", **{"from": "stone_5", "speed": 1.0, "cam": [[0, {"v": PRES_RING, "pad": 0.05}], [10, {"v": PRES_RING, "pad": 0.0}]]}, num="06", bg="#000000", border=False)
step(144, 10, "06 ／ どんな石でも", "石が変わっても、", "同じ決まりで。", ["ラウンド・マーキス・エメラルド・ペア。", "留め方も地金も、その場で。"])
say(14, 145, "石の形が変わっても、同じ決まりで組みます。")
part(144, 10, "chorus", 1.0)

# ================================================================ 07 聞きに来る（1:17–1:30）帳面（石川工房）→ Claude から質問 → 書いて答える → 決まりに
win(154, 12, "ask", ramp=[[0, 0], [2, 20], [4, "question"], [6, "speak"], [8, "speak+20"], [9.5, "asked"], [12, "asked+28"]],
    cam=[[0, {"v": COL, "pad": 0.0}], [3, {"v": "question", "pad": 0.1}, "io"], [8, {"v": "question", "pad": 0.08}], [9.5, {"v": "interview", "pad": 0.06}, "io"], [12, {"v": "interview", "pad": 0.04}]],
    focus=[[3.5, "question", 1.0], [5.5, "speak", 1.0], [7.3, "speak", 1.0], [7.8, "write", 1.0], [8.3, "write", 0.0], [9.8, "interview", 0.8]], num="07", tr={"type": "xfade", "len": 0.5})
step(154, 12, "07 ／ 聞きに来る", "Claude が、", "聞きに来る。", ["帳面のまだ決まっていない所を、", "職人に、ひとつずつ聞く。声でも答えられる。"])
tag(156, 9, "が、帳面の足りない所を聞く", y=36)
win(166, 14, "ask", ramp=[[0, "asked+28"], [5, "typed"], [6, "wait"], [7, "draft"], [11.5, "draft+40"], [12.5, "saved"], [14, "top+20"]],
    cam=[[0, {"v": "answer", "pad": 0.45}], [6, {"v": "answer", "pad": 0.4}], [7.5, {"v": "draft", "pad": 0.08}, "io"], [12, {"v": "draft", "pad": 0.05}], [13.5, {"v": "cards2", "pad": 0.04}, "io"]],
    focus=[[0.3, "answer", 1.0], [5.5, "make", 1.0], [7.5, "draft", 0.9], [11.6, "ok", 1.0], [12.6, "ok", 0.0]], keys=[["asked+30", "typed"]], num="07")
step(166, 14, "07 ／ 聞きに来る", "答えると、", "決まりになる。", ["Claude が言葉を決まりにまとめ、", "職人の言葉もそのまま帳面に残る。"])
say(15, 155, "帳面のまだ決まっていない所は、Claude が自分から聞きに来ます。声でも答えられる。")
say(16, 167, "答えれば、それが決まりになる。")
part(154, 26, "light", 0.75)

# ================================================================ 08 工房ごとに（1:30–1:35）
clips.append(dict(at=180, len=10, kind="split", win=WIN, bg=DARK, num="08", sides=[
    {"ch": "workshops", "from": 8, "speed": 0.4, "cam": [[0, {"v": [460, 70, 420, 300], "pad": 0.12}], [10, {"v": [460, 70, 420, 300], "pad": 0.02}]]},
    {"ch": "workshops", "from": 60, "speed": 0.4, "cam": [[0, {"v": [460, 70, 420, 300], "pad": 0.12}], [10, {"v": [460, 70, 420, 300], "pad": 0.02}]]},
], tr={"type": "xfade", "len": 0.5}))
call(181, 9, "石川工房 ・ ø 0.80 mm", (1015, 900), size=40, anchor="c", anim="pop", color=GOLD)
call(182, 8, "工房 B ・ ø 1.41 mm", (1565, 900), size=40, anchor="c", anim="pop")
step(180, 10, "08 ／ 工房ごとに", "決まりは、", "工房ごとに。", ["同じ石・同じ形でも、", "帳面がちがえば、爪がちがう。"])
say(17, 181, "決まりは、工房ごとに持てます。")
part(180, 10, "light", 0.75)

# ================================================================ 09 作り方（1:35–1:44）
M = CH["make"]
if has(M) and M == "make2":
    MK = [1258, 84, 342, 340]
    win(190, 14, M, ramp=[[0, "cards"], [1.5, "card0+8"], [3.5, "card1+10"], [5.5, "card3+6"], [7, "open3-2"], [9.5, "open3+26"], [11.5, "card5+12"], [14, "card6+16"]],
        cam=[[0, {"v": PANEL, "pad": 0.0}], [1.5, {"v": MK, "pad": 0.0}, "io"], [7, {"v": MK, "pad": 0.0}], [7.8, {"v": [1258, 84, 342, 640], "pad": 0.0}, "io"], [9.8, {"v": [1258, 84, 342, 640], "pad": 0.0}], [10.6, {"v": MK, "pad": 0.0}, "io"], [14, {"v": MK, "pad": 0.0}]],
        focus=[[7.0, [1262, 88, 334, 70], 0.0], [7.6, [1262, 88, 334, 620], 0.8], [9.6, [1262, 88, 334, 620], 0.8], [10.2, [1262, 88, 334, 620], 0.0]], num="09", noblur=True)
else:
    win(190, 14, "make", ramp=[[0, 20], [14, 190]], cam=[[0, {"v": PANEL, "pad": 0.0}], [14, {"v": [1260, 200, 340, 520], "pad": 0.0}]], num="09")
step(190, 14, "09 ／ 作り方", "形から、", "作り方まで。", ["寸法・道具・ロウ付けの順まで、", "形からその場で出る。"])
win(204, 4, M, **{"from": "draw" if M == "make2" else 246, "speed": 0.5, "cam": [[0, {"v": [40, 40, 1220, 790], "pad": 0.0}], [4, {"v": [40, 40, 1220, 790], "pad": 0.0}]]}, num="09", drift=0.0)
step(204, 4, "09 ／ 作り方", "図面も、", "その場で。", [])
say(18, 191, "形から、作り方まで。寸法も、道具も、ロウ付けの順も、その場で出ます。")
part(190, 18, "light", 0.7)

# ================================================================ 10 学ぶ（1:44–1:50）
win(208, 12, "learn", ramp=[[0, "start"], [1, "start+12"], [4, "typed"], [5, "wait+2"], [6, "answer"], [8.5, "answer+34"], [9.5, "why2-4"], [12, "why2+36"]],
    cam=[[0, {"v": "composer", "pad": 0.3}], [4.5, {"v": "composer", "pad": 0.25}], [6, {"v": "short", "pad": 0.25}, "io"], [8.5, {"v": "short", "pad": 0.2}], [9.8, {"v": "why2", "pad": 0.08}, "io"], [12, {"v": "why2", "pad": 0.05}]],
    focus=[[0.5, "composer", 1.0], [4.5, "composer", 1.0], [6, "short", 0.9], [8.5, "short", 0.9], [9.8, "why2", 0.8]], keys=[["start+26", "typed"]], num="10", tr={"type": "xfade", "len": 0.5})
step(208, 12, "10 ／ 学ぶ", "学ぶ人には、", "職人の言葉で。", ["「なぜ？」と聞けば、", "帳面の決まりと出どころから答える。"])
say(19, 209, "学ぶ人には、帳面の決まりから、理由つきで答えます。")
part(208, 12, "light", 0.65)

# ================================================================ 受け継ぐ（1:50–2:10）生成りの紙の色に明朝：減っていく → 20 年に一度の技 → 式年遷宮 → 同じ技
L = dict(light=True)
black(220, 8, color=CREAM, tr={"type": "xfade", "len": 0.8})
step(220, 8, "受け継ぐ", "技を知る人が、", "減っていく。", ["伝統的工芸品の従業員数"], **L)
text.append(dict(at=220.5, len=7.5, mode="count", **{"from": 11.5, "to": 4.8}, fmt="{:.1f} 万人", pos=(1290, 430), size=150, font="m3", color=INK, delay=0.5, dur=2.4, anim="fade", fout=0.5, anchor="c"))
text.append(dict(at=220.5, len=7.5, mode="bar", **{"from": 11.5, "to": 4.8}, pos=(890, 560), w=800, delay=0.5, dur=2.4, fout=0.5, color=BENGARA))
text.append(dict(at=223.5, len=4.5, mode="stack", lines=[[["1998 → 2022 年度　", 0, {"size": 30, "color": INKGRAY, "font": "m3"}], ["24 年で、約 6 割減。", 0, {"size": 44, "color": INK, "font": "m6"}]]], pos=(1290, 650), size=44, fout=0.5))
text.append(dict(at=224.5, len=3.5, mode="stack", lines=[[["70 歳代以上 18.0%", 0, {"size": 34, "color": BENGARA, "font": "m6"}], ["　20 歳代まで 6.0%", 0.4, {"size": 34, "color": INKGRAY, "font": "m3"}]]], pos=(1290, 740), size=34, fout=0.5))
src(220, 8, "出典：経済産業省 説明資料（伝統的工芸品産業振興協会の集計より）。従業員数・年齢は 2022 年度", light=True, pos=(890, 990), size=20)
img(228, 6, "public/heritage/naiku-1953.jpg", win=[740, 96, 1100, 884], bg=CREAM, fit="contain", area=[0, 0, 1100, 884], cam=[[0, [0, 0, 1, 1]], [6, [0, 0, 1, 1]]], border=False)
step(228, 6, "受け継ぐ", "20 年に一度しか、", "作らない技もある。", ["伊勢神宮の式年遷宮。", "20 年ごとに、社殿も品々も新しく。"], **L)
src(228, 6, "1953 年 内宮（上：新しい殿舎　下：それまでの殿舎）本田照夫 撮影（Wikimedia Commons・パブリックドメイン）", light=True, pos=(110, 1000), size=19)
clips.append(dict(at=234, len=8, kind="rows", img="public/heritage/naiku-goshinpozu.jpg", n=3, each=1.0, win=[740, 96, 1100, 884], bg=CREAM, border=False))
step(234, 8, "受け継ぐ", "御装束神宝。", "20 年ごとに作り直す。", ["神さまの衣と、道具の品々。", "その中に、彫金・金工の品がある。"], **L)
src(234, 8, "「内宮御神宝図」江戸時代の写し 国立国会図書館所蔵（Wikimedia Commons・パブリックドメイン）", light=True, pos=(110, 1000), size=19)
img(242, 4, "public/heritage/tsuba-carp.jpg", win=[740, 96, 1100, 884], bg=CREAM, fit="contain", area=[60, 40, 980, 804], cam=[[0, [0, 0, 1, 1]], [4, [0, 0, 1, 1]]], border=False)
img(246, 4, "public/heritage/kazari-tachi.jpg", win=[740, 96, 1100, 884], bg=CREAM, fit="contain", area=[0, 200, 1100, 484], cam=[[0, [0, 0, 1, 1]], [4, [0, 0, 1, 1]]], border=False)
step(242, 8, "受け継ぐ", "彫金・金工の技も、", "受け継ぐために。", ["鐔や太刀の金具を彫る技は、", "ジュエリーと同じ技。"], **L)
src(242, 4, "鯉と藻の鐔（江戸時代）メトロポリタン美術館（CC0）", light=True, pos=(110, 1000), size=19)
src(246, 4, "飾太刀（平安時代）東京国立博物館／ColBase（CC BY 4.0）", light=True, pos=(110, 1000), size=19)
win(250, 10, "ask", ramp=[[0, 0], [10, 36]], cam=[[0, {"v": COL, "pad": 0.0}], [10, {"v": COL, "pad": -0.04}]], bg=CREAM, border=False, num="")
step(250, 10, "受け継ぐ", "だから、", "継ぐのしくみが使える。", ["職人の判断を帳面にためて、", "次の人と、Claude が読む。"], **L, size=74)
say(20, 221, "伝統的工芸品の作り手は、24 年で約 6 割減りました。")
say(21, 230, "なかには、20 年に一度しか作らない技もあります。式年遷宮の、御装束神宝です。")
say(22, 243, "その彫金・金工の技は、ジュエリーと同じ技。だから、このしくみがそのまま使える。")
downs.append(220)
part(220, 40, "break", 0.45, dense=True)

# ================================================================ 11 ほかの技へ（2:10–2:14）技の一覧 → 木目金の帳面 → Claude の質問
win(260, 4, "waza", ramp=[[0, "list"], [2, "others"], [4, "others+16"]], cam=[[0, {"v": COL, "pad": 0.0}], [2, {"v": "others", "pad": 0.04}, "io"], [4, {"v": "others", "pad": 0.04}]],
    focus=[[2.2, "mokume", 1.0]], num="11", tr={"type": "xfade", "len": 0.8})
win(264, 4, "waza", ramp=[[0, "ask"], [4, "ask+44"]], cam=[[0, {"v": "ask", "pad": 0.08}], [4, {"v": "ask", "pad": 0.04}]], focus=[[0.4, "ask", 0.9]], num="11", noblur=True)
step(260, 8, "11 ／ ほかの技へ", "同じしくみを、", "ほかの技へ。", ["木目金・象嵌・彫りなど、技ごとの帳面。", "どの技でも、Claude が聞きに来る。"])
say(23, 261, "同じしくみを、ほかの技へ。")
part(260, 8, "rise", 0.55)

# ================================================================ 12 組み立て直す（2:14–2:30）手がかり → Claude が考える → 手順 → 答え合わせ
R = CH["rebuild"]
win(268, 6, "rebuild", ramp=[[0, "start"], [2, "clues"], [6, "clues+60"]], cam=[[0, {"v": [426, 50, 748, 330], "pad": 0.06}], [2, {"v": "clues", "pad": 0.06}, "io"], [6, {"v": "clues", "pad": 0.04}]],
    focus=[[2.2, "clues", 0.9]], num="12", tr={"type": "xfade", "len": 0.5})
step(268, 6, "12 ／ 組み立て直す", "途切れた技を、", "組み立て直す。", ["木目金（もくめがね）。", "残った手がかりは、9 つだけ。"])
win(274, 4, "rebuild", ramp=[[0, "wait-14"], [4, "wait+30"]], cam=[[0, {"v": [420, 560, 760, 300], "pad": 0.06}], [4, {"v": [420, 560, 760, 300], "pad": 0.04}]], focus=[[0.3, "go", 1.0], [1.5, "waiting", 0.8]], num="12", noblur=True)
step(274, 4, "12 ／ 組み立て直す", "Claude が、", "手がかりから考える。", ["手がかりを読み、", "作り方を一工程ずつ組む。"])
tag(274, 4, "が、残った手がかりから作り方を組む", y=36)
win(278, 12, "rebuild", ramp=[[0, "step1-4"], [3, "step1+24"], [3.6, "step2-2"], [6, "step2+24"], [6.6, "step3-2"], [9, "step3+24"], [9.6, "step4-2"], [12, "step4+24"]],
    cam=[[0, {"v": [426, 180, 748, 440], "pad": 0.04}], [12, {"v": [426, 180, 748, 440], "pad": 0.02}]],
    focus=[[0.2, "step1", 0.8], [2.9, "step1", 0.8], [3.2, "step1", 0.0], [3.7, "step2", 0.8], [5.9, "step2", 0.8], [6.2, "step2", 0.0], [6.7, "step3", 0.8], [8.9, "step3", 0.8], [9.2, "step3", 0.0], [9.7, "step4", 0.8]],
    num="12", noblur=True)
step(278, 12, "12 ／ 組み立て直す", "組み立てた、", "作り方。", ["工程ごとに、どの手がかりからか、", "確からしさをつけて。"])
win(290, 2, "rebuild", ramp=[[0, "checking-28"], [2, "checking-1"]], cam=[[0, {"v": [420, 380, 760, 300], "pad": 0.06}], [2, {"v": [420, 380, 760, 300], "pad": 0.04}]], focus=[[0.2, "check", 1.0]], num="12", noblur=True)
win(292, 5, "rebuild", ramp=[[0, "score"], [5, "score+40"]], cam=[[0, {"v": "score", "pad": 0.3}], [5, {"v": "score", "pad": 0.22}]], focus=[[0.3, "score", 1.0]], num="12", noblur=True, tr={"type": "xfade", "len": 0.3})
win(297, 3, "rebuild", ramp=[[0, "verdict1-6"], [3, "verdict1+40"]], cam=[[0, {"v": "verdict1", "pad": 0.12}], [3, {"v": "verdict1", "pad": 0.08}]], focus=[[0.3, "verdict1", 0.8]], num="12", noblur=True)
step(290, 10, "12 ／ 組み立て直す", "本当の作り方と、", "答え合わせ。", [os.environ.get("REBUILD_SCORE_TEXT", "11 の工程のうち、9 にたどり着いた。")])
say(24, 269, "途切れた技も、残った手がかりから、Claude と組み立て直す。")
say(25, 291, os.environ.get("REBUILD_SCORE_SAY", "本当の作り方と比べると、11 の工程のうち 9 にたどり着きました。"))
part(268, 32, "rise", 0.8, roll=True)
risers.append([296, 300])

# ================================================================ Claude の働き（2:30–2:36）拍ごとに
roles = [("聞く。", "ask", "asked+10", "interview"), ("まとめる。", "word", "proposal+20", "proposal"), ("確かめる。", "fix", "red+30", FIX_HEAD),
         ("直す。", "fix", "fixed2", "log"), ("教える。", "learn", "why2+10", "why2"), ("組み立て直す。", "rebuild", "score+10", "score")]
b = 300
for k, (w, ch, fr, box) in enumerate(roles):
    story(b, 2, ch, **{"from": fr, "speed": 0.6, "cam": [[0, {"v": box, "pad": 0.2}], [2, {"v": box, "pad": 0.12}]]}, grade={"dim": 0.74}, mute=True, noblur=True)
    swap(b, 2, [[w, 0, {"size": 150, "font": "g7", "color": GOLD if k % 2 else WHITE}]], sfx="kan" if k == 0 else "tink")
    b += 2
tag(300, 12, "は、職人の判断を受け継ぐ手伝いをする", y=36)
drops.append(300)
part(300, 12, "final", 1.0)

# ================================================================ 本物の指輪（2:36–2:42）
clips.append(dict(at=312, len=12, kind="foot", foot="ring2", tr={"type": "xfade", "len": 1}, grade={"scrim": "left2", "scrimAmt": 1.04},
                  fallback={"ch": "present", "from": 441, "speed": 1.0, "cam": [[0, {"v": PRES_RING, "pad": 0.05, "dx": -60}], [12, {"v": PRES_RING, "pad": -0.06, "dx": -60}]]}))
step(312, 12, "", "職人の判断を蓄えて、", "失われた技まで。", [], pos=(120, 420), size=80, cps=12)
say(26, 313, "職人の判断を蓄えて、失われた技まで、組み立て直す。")
part(312, 12, "final", 0.85)
E = 324
if VARIANT == "B":
    # 未来の一行：写真 1 枚から、形・図面・作り方まで（いつか、だれでも作れるように）
    win(E, 12, "build", ramp=[[0, 194], [4, 236], [12, 330]], cam=[[0, {"v": [140, 40, 1000, 800], "pad": 0.0}], [4, {"v": [140, 40, 1000, 800], "pad": 0.0}], [5.5, {"v": [400, 280, 900, 600], "pad": 0.0}, "io"], [12, {"v": [400, 280, 900, 600], "pad": -0.04}]],
        focus=[[4.5, "card", 0.0], [5.5, "card", 0.9], [11, "card", 0.9]], num="", tr={"type": "xfade", "len": 0.8})
    step(E, 12, "", "職人の判断があるから、", "いつか、だれでも作れるように。", ["写真 1 枚から、形・図面・作り方まで。"], pos=(110, 380), size=64)
    say(-1, E + 1, "職人の判断があるから、いつか、だれでも作れるように。")
    part(E, 12, "final", 0.75)
    E += 12

# ================================================================ 継ぐ
hits += [E, E + 1, E + 2]
story(E, 1, "present", **{"from": 446, "cam": [[0, {"v": PRES_HEAD, "pad": 0.05}], [1, {"v": PRES_HEAD, "pad": -0.08}, "out"]]}, drift=0.0, noblur=True)
story(E + 1, 1, "word", **{"from": 150, "cam": [[0, {"v": "field", "pad": 0.2}], [1, {"v": "field", "pad": 0.1}, "out"]]}, drift=0.0, noblur=True, mute=True)
black(E + 2, 18)
text.append(dict(at=E + 2, len=18, mode="stack", lines=[[["継ぐ", 0, {"font": "m6", "size": 230}]]], pos=(960, 420), size=230, lh=1.0, anim="depth", fout=2))
text.append(dict(at=E + 4, len=16, mode="stack", lines=[[["職人の判断を、次の人へ。", 0, {"size": 42, "color": WHITE}]], [["このアプリも、彫金職人が Claude Code と作りました（Skill ・ MCP ・ フック ・ サブエージェント）", 1, {"size": 26, "color": GRAY}]]], pos=(960, 640), size=42, lh=1.7, fout=2))
src(E + 7, 13, "画像：内宮御神宝図・1953 年の内宮（Wikimedia Commons・パブリックドメイン）／鐔（メトロポリタン美術館・CC0）／飾太刀（東京国立博物館 ColBase・CC BY 4.0）", pos=(120, 1000), size=19)
src(E + 7, 13, "作り手の数：経済産業省 説明資料。画面の数字は継ぐの実際の画面の値（目安・最後は職人が決める）", pos=(120, 1035), size=19)
say(27, E + 4, "継ぐ。このアプリも、彫金職人が Claude Code と作りました。")
part(E, 20, "outro", 0.4)
fx.append(dict(k="fade", at=E + 16, len=4))
LEN = E + 20

chrome = dict(**{"from": 24, "to": 300}, accent=GOLD, note="実際の操作画面", light=[[220, 260]],
              steps=[[24, "01", "困りごと"], [44, "02", "組む"], [64, "03", "職人の一言"], [104, "04", "確かめる・直す"], [132, "05", "描く"], [144, "06", "どんな石でも"],
                     [154, "07", "聞きに来る"], [180, "08", "工房ごとに"], [190, "09", "作り方"], [208, "10", "学ぶ"], [220, "—", "受け継ぐ"], [260, "11", "ほかの技へ"], [268, "12", "組み立て直す"]])
# 声の番号は、出てくる順に 1 から（作者が録るファイルの名前 n<番号>.wav）。B 案だけの一行は、いちばん後ろの番号（A と B で番号がずれないように）
voice.sort(key=lambda v: v["at"])
k = 0
for v in voice:
    if v["n"] != -1:
        k += 1
        v["n"] = k
for v in voice:
    if v["n"] == -1:
        v["n"] = k + 1
tl = dict(bpm=120, len=LEN, clips=sorted(clips, key=lambda c: c["at"]), text=text, fx=fx, music=sorted(music, key=lambda m: m["at"]),
          hits=hits, risers=risers, drops=drops, stops=stops, downs=downs, voice=voice, sfx=sfx, chrome=chrome, grain=1.3, variant=VARIANT)
cs = tl["clips"]
for a_, b_ in zip(cs, cs[1:]):
    if abs(a_["at"] + a_["len"] - b_["at"]) > 1e-6:
        print("すき間／重なり", a_["at"], a_["len"], b_["at"])
end = cs[-1]["at"] + cs[-1]["len"]
print("案", VARIANT, "長さ", end, "拍 ＝", end / 2, "秒")
json.dump(tl, open(os.path.join(HERE, "final2.json" if VARIANT == "A" else f"final2{VARIANT}.json"), "w"), ensure_ascii=False, indent=1)
