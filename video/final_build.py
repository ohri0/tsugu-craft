# 最終案の台本（final.json）を作る。時刻はすべて「拍」（120 拍／分 → 1 拍 0.5 秒、1 小節 4 拍）。
# 画面の切り替え・言葉・音楽の場面・声の場所を、ここ 1 か所で決める（拍に乗るように）。
# 使い方：python -I final_build.py → final.json
# 素材：work/story/<章>/（capture/story.cjs で撮った本物の画面）、public/heritage/（公開の画像）
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
clips, text, fx, music, voice, sfx = [], [], [], [], [], []
hits, risers, drops, stops, downs = [], [], [], [], []

WHITE, GOLD, RED, GREEN, GRAY = "#f5f5f7", "#e8c27a", "#ff5a4e", "#3ddc84", "#9a9aa0"


def story(at, ln, ch, **kw):
    clips.append(dict(at=at, len=ln, ch=ch, **kw))


def black(at, ln, **kw):
    clips.append(dict(at=at, len=ln, kind="black", **kw))


def img(at, ln, path, **kw):
    clips.append(dict(at=at, len=ln, kind="img", img=path, **kw))


def foot(at, ln, name, fallback, **kw):
    clips.append(dict(at=at, len=ln, kind="foot", foot=name, fallback=fallback, **kw))


def swap(at, ln, words, size=150, font="g3", **kw):
    """1 語ずつ、拍ごとに入れ替わる大きな言葉。words：[(言葉, 拍, {色・字}), ...]（拍は at から）"""
    text.append(dict(at=at, len=ln, mode="swap", lines=[[list(w) if len(w) > 2 else [w[0], w[1]] for w in words]], size=size, font=font, **kw))


def stack(at, ln, lines, size=96, font="g3", **kw):
    """言葉が積み上がって、一文になる"""
    text.append(dict(at=at, len=ln, mode="stack", lines=[[list(w) for w in ln_] for ln_ in lines], size=size, font=font, **kw))


def lower(at, ln, lines, size=60, font="g5", **kw):
    """画面の下の見出し（下に黒いぼかし）"""
    kw.setdefault("scrim", "bottom")
    kw.setdefault("anim", "rise")
    text.append(dict(at=at, len=ln, mode="lower", lines=[[list(w) for w in ln_] for ln_ in lines], size=size, font=font, **kw))


def call(at, ln, t, pos, size=84, label=None, **kw):
    text.append(dict(at=at, len=ln, mode="call", text=t, pos=pos, size=size, label=label, **kw))


def tag(at, ln, t, y=40):
    text.append(dict(at=at, len=ln, mode="tag", text=t, sfx="shimmer", y=y))


def src(at, ln, t, **kw):
    text.append(dict(at=at, len=ln, mode="src", text=t, **kw))


def say(n, at, t):
    voice.append(dict(n=n, at=at, text=t))


def part(at, ln, kind, lv=0.7, **kw):
    music.append(dict(at=at, len=ln, part=kind, lv=lv, **kw))


# 枠（ページの px）：撮った画面の中の、見せたい所
WORD_HEAD = [470, 110, 400, 220]      # word：石と爪
WORD_RING = [300, 60, 720, 800]       # word：指輪全体
FIX_HEAD = [500, 120, 330, 190]       # fix：赤く光る爪
PRES_RING = [880, 40, 480, 760]       # present：指輪全体
PRES_HEAD = [930, 50, 400, 230]       # present：石と爪
PANEL = [1255, 40, 345, 840]          # 右の欄
COL = [410, 40, 780, 840]             # app の中の列

# ================================================================ 0. つかみ（0:00–0:04）ダン・ダン・ダン
hits += [0, 1, 2]
story(0, 1, "present", **{"from": 28, "cam": [[0, {"v": PRES_HEAD, "pad": 0.05}], [1, {"v": PRES_HEAD, "pad": -0.1}, "out"]]}, drift=0.0)
story(1, 1, "fix", **{"from": 66, "cam": [[0, {"v": FIX_HEAD, "pad": 0.1}], [1, {"v": FIX_HEAD, "pad": -0.05}, "out"]]}, drift=0.0)
story(2, 1, "word", **{"from": 96, "speed": 1.0, "cam": [[0, {"v": "field", "pad": 0.25}], [1, {"v": "field", "pad": 0.1}, "out"]]}, keys=[["typed-60", "typed"]])
# 爪が細くなる：前（太い）→ 拍 4 で後（細い）。同じ構図
story(3, 1, "word", **{"from": 226, "cam": [[0, {"v": WORD_HEAD, "pad": 0.3}], [1, {"v": WORD_HEAD, "pad": 0.2}]]}, drift=0.0)
story(4, 4, "word", **{"from": 241, "speed": 0.8, "cam": [[0, {"v": WORD_HEAD, "pad": 0.2}], [1.5, {"v": [330, 50, 640, 420], "pad": 0.0}, "io"], [4, {"v": [330, 50, 640, 420], "pad": -0.06}]]}, tr={"type": "cut"})
fx.append(dict(k="flash", at=4, len=0.8, amt=0.55))
call(4, 3.6, "ø 1.66 → 0.80 mm", (1400, 860), size=92, label="職人の一言で、爪が変わる", anchor="c", anim="pop", sfx="hit")
risers.append([5, 8])
part(0, 8, "intro", 0.9)

# ================================================================ 1. 柱の一文（0:04–0:10）
story(8, 12, "present", **{"from": 30, "speed": 0.6, "cam": [[0, {"v": PRES_RING, "pad": 0.0}], [12, {"v": PRES_RING, "pad": -0.1}]]}, grade={"dim": 0.72, "blur": 7}, tr={"type": "xfade", "len": 1})
stack(8, 12, [
    [["ネットにない", 0, {"font": "g3"}], ["職人の判断を、", 1, {"font": "g6", "color": GOLD}]],
    [["形を確かめる", 3, {}], ["決まりにして、", 4, {}]],
    [["次の人へ", 6, {}], ["渡す。", 7, {"font": "g6"}]],
], size=92, gap=24, fout=0.8, sfx="tick", pos=(820, 540))
part(8, 12, "title", 0.55)

# ================================================================ 2. 継ぐ（0:10–0:12）
story(20, 4, "present", **{"from": 36, "speed": 0.8, "cam": [[0, {"v": PRES_RING, "pad": 0.08, "dx": 120}], [4, {"v": PRES_RING, "pad": 0.0, "dx": 120}]]}, grade={"dim": 0.35}, tr={"type": "xfade", "len": 0.5})
text.append(dict(at=20, len=4, mode="stack", lines=[[["継ぐ", 0, {"font": "m6", "size": 210}]], [["職人の判断を、次の人へ", 1, {"font": "g4", "size": 40, "color": "#c8c8cc"}]]], pos=(480, 540), size=210, lh=1.0, anim="depth", scrim="left2", scrimAmt=1.0, fout=0.6))
part(20, 4, "title", 0.6)

# ================================================================ 3. 組む（0:12–0:18）石の写真から
story(24, 12, "build", ramp=[[0, 0], [5, 104], [6, 128], [9, 200], [12, 262]], cam=[
    [0, {"v": "win:0.82", "rx": 9, "ry": -12}],
    [2, {"v": "photo", "pad": 0.05}, "io"],
    [5, {"v": "photo", "pad": -0.05}],
    [6.5, {"v": [140, 40, 1000, 800], "pad": 0.0}, "io"],
    [9.5, {"v": [140, 40, 1000, 800], "pad": -0.08}],
    [12, {"v": [380, 60, 900, 820], "pad": 0.0}],
], tr={"type": "zoom", "len": 0.8, "at": (0.5, 0.5)})
lower(25, 10, [[["石の写真から、", 0, {}], ["指輪を組む。", 2, {"font": "g6"}]]], size=64, sfx="tick")
say(3, 24, "私は、宝飾の彫金職人です。石の写真から、指輪を組みます。")
part(24, 12, "verse", 0.45)

# ================================================================ 4. ネットの情報だけだと（0:18–0:22）
story(36, 8, "word", ramp=[[0, 0], [8, 22]], cam=[[0, {"v": WORD_RING, "pad": 0.05}], [2, {"v": WORD_HEAD, "pad": 0.15}, "out"], [8, {"v": WORD_HEAD, "pad": 0.05}]], tr={"type": "cut"}, sfx=[[0, "whoosh"]])
swap(36, 8, [["ネットの情報だけだと、", 0, {"size": 76}], ["爪 ø 1.66 mm。", 2.5, {"size": 120, "font": "g6"}], ["太すぎる。", 5, {"size": 120, "color": RED, "font": "g6"}]], scrim="all", scrimAmt=0.6, sfx="tick")
say(4, 36, "でも、ネットの情報だけで組むと、爪が太すぎる。")
part(36, 8, "verse", 0.5, roll=True)

# ================================================================ 5. 職人の一言を（0:22–0:24）
black(44, 4)
swap(44, 4, [["職人の", 0, {"size": 170}], ["一言を、", 2, {"size": 170, "font": "g6", "color": GOLD}]], sfx="whoosh")
risers.append([44, 48])
part(44, 4, "build", 0.6)

# ================================================================ 6. 打つ（0:24–0:31）
story(48, 14, "word", ramp=[[0, 20], [2, 40], [12, 153], [14, 176]], cam=[
    [0, {"v": "full", "rx": 6, "ry": 8}],
    [1.5, {"v": "field", "pad": 0.35}, "io"],
    [12, {"v": "field", "pad": 0.3}],
    [13, {"v": [1265, 517, 331, 120], "pad": 0.25}, "io"],
    [14, {"v": [1265, 517, 331, 120], "pad": 0.25}],
], keys=[["type+17", "typed"]], tr={"type": "zoom", "len": 0.6})
say(6, 48, "職人なら、こう言います。この大きさなら、爪は最低 0.7、基本は 0.8 から 1 ミリ。")
part(48, 14, "verse", 0.6)

# ================================================================ 7. Claude が決まりに（0:31–0:38）
story(62, 14, "word", ramp=[[0, 176], [2, 186], [11, 221], [13, 236], [14, 236]], cam=[
    [0, {"v": [1265, 560, 331, 200], "pad": 0.3}],
    [2, {"v": "proposal", "pad": 0.18}, "io"],
    [10, {"v": "proposal", "pad": 0.12}],
    [12.5, {"v": [1265, 690, 331, 140], "pad": 0.3}, "io"],
    [14, {"v": [1265, 690, 331, 140], "pad": 0.3}],
], keys=[], sfx=[[2, "shimmer"]])
tag(62, 12, "が、職人の言葉を決まりにまとめる")
say(7, 64, "その一言を、Claude が決まりにします。")
part(62, 14, "verse", 0.7)
risers.append([72, 80])

# ================================================================ 8. 前（太い）→ 落ちる所で後（細い）（0:38–0:44）
story(76, 4, "word", ramp=[[0, 196], [4, 235]], cam=[[0, {"v": WORD_HEAD, "pad": 0.35}], [4, {"v": WORD_HEAD, "pad": 0.15}]], tr={"type": "whip", "len": 0.5, "dir": -1})
call(76.5, 3.4, "ø 1.66 mm", (1300, 190), size=78, label="ネットの情報だけ", anim="pop")
stops.append([79.5, 80])
drops.append(80)
story(80, 8, "word", ramp=[[0, 241], [8, 300]], cam=[[0, {"v": WORD_HEAD, "pad": 0.15}], [2, {"v": WORD_HEAD, "pad": 0.25}], [4, {"v": "full", "pad": 0.0}, "io"], [8, {"v": "full", "z": 1.03}]])
fx.append(dict(k="flash", at=80, len=0.9, amt=0.7))
call(80, 4, "ø 0.80 mm", (1300, 190), size=78, label="職人の決まり", anim="pop", color=GOLD, sfx="hit")
lower(84, 4, [[["形が、その場で変わる。", 0, {}]]], size=58)
say(8, 82, "形が、その場で変わる。")
part(76, 4, "build", 0.75)
part(80, 8, "drop", 0.95)

# ================================================================ 9. 同じ指輪で（0:44–0:50）地金
story(88, 8, "word", ramp=[[0, 340], [1.5, 356], [8, 420]], cam=[[0, {"v": PANEL, "pad": 0.0}], [1.5, {"v": "cmpTable", "pad": 0.45}, "io"], [8, {"v": "cmpTable", "pad": 0.38}]], tr={"type": "zoom", "len": 0.5, "at": (0.8, 0.45)})
call(90, 6, "地金 約 3.2 g → 約 2.5 g", (70, 520), size=64, label="同じ石・同じ形で", anim="pop", sfx="hit")
say(9, 89, "地金も、3.2 グラムから 2.5 グラムに。")
part(88, 8, "chorus", 0.85)

# ================================================================ 10. イメージの段階で（0:48–0:52）
black(96, 8)
stack(96, 8, [[["イメージの段階で、", 0, {}], ["作れるかが分かる。", 1, {"font": "g6"}]], [["清書と CAD の行き来を、", 4, {"size": 64, "color": GRAY}], ["減らせる。", 5, {"size": 64, "color": GOLD}]]], size=96, gap=20, sfx="tick")
say(10, 96, "作れるかが早く分かれば、清書と CAD の行き来が減ります。")
part(96, 8, "light", 0.7)

# ================================================================ 11. 確かめる（0:52–1:04）
story(104, 6, "fix", ramp=[[0, 0], [1, 18], [4, 50], [6, 66]], cam=[[0, {"v": "full", "rx": -5, "ry": 9}], [1, {"v": [1255, 600, 345, 130], "pad": 1.0, "dy": 40}, "io"], [3.5, {"v": [1255, 600, 345, 130], "pad": 0.92, "dy": 40}], [5, {"v": FIX_HEAD, "pad": 0.2}, "io"], [6, {"v": FIX_HEAD, "pad": 0.1}]], tr={"type": "zoom", "len": 0.6})
lower(105, 5, [[["細すぎると、", 0, {}], ["赤く光る。", 2, {"color": RED, "font": "g6"}]]], size=58, pos=(70, 690))
story(110, 8, "fix", ramp=[[0, 66], [2, 100], [3, 109], [8, 160]], cam=[[0, {"v": FIX_HEAD, "pad": 0.1}], [2.2, {"v": [700, 30, 600, 420], "pad": 0.1}, "io"], [3.2, {"v": "pop", "pad": 0.62, "dy": 70}, "io"], [8, {"v": "pop", "pad": 0.55, "dy": 70}]])
lower(112, 6, [[["押せば、", 0, {}], ["理由と直し方。", 1.5, {"font": "g6"}]]], size=60)
story(118, 10, "fix", ramp=[[0, 160], [1.5, 172], [3, 182], [7, 205], [10, 240]], cam=[[0, {"v": "pop", "pad": 0.55, "dy": 70}], [1.5, {"v": [1040, 345, 230, 70], "pad": 0.9}, "io"], [3, {"v": "log", "pad": 0.15}, "io"], [6.5, {"v": "log", "pad": 0.08}], [8, {"v": [430, 30, 840, 520], "pad": 0.0}, "io"], [10, {"v": [430, 30, 840, 520], "pad": -0.04}]])
tag(119, 9, "が check で確かめ、爪だけを直す")
call(126, 2, "作れます", (1530, 150), size=60, color=GREEN, anim="pop", sfx="ding")
say(11, 105, "細くしすぎると、赤く光る。押せば、理由と直し方。Claude にも直してもらえます。")
part(104, 24, "chorus", 0.9)

# ================================================================ 12. 正面・横・上（1:04–1:10）
black(128, 2)
swap(128, 2, [["正面・横・上。", 0, {"size": 130}]], sfx="whoosh")
story(130, 10, "views", ramp=[[0, 18], [1, 27], [3, 42], [3.01, 68], [5, 82], [5.01, 109], [7, 123], [7.01, 150], [8, 165], [8.01, 179], [9, 194], [9.01, 253], [10, 270]], cam=[
    [0, {"v": [230, 60, 820, 760], "pad": 0.0}],
    [10, {"v": [230, 60, 820, 760], "pad": -0.06}],
])
for b_, w_ in [(1, "正面"), (3, "横"), (5, "上"), (7, "斜め"), (8, "ワイヤー"), (9, "レンダー")]:
    call(130 + b_, 0.95 if b_ >= 7 else 1.95, w_, (90, 900), size=56, anim="pop", fout=0.1)
say(12, 130, "正面・横・上の平らな図で、寸法を確かめる。")
part(128, 12, "chorus", 0.95)

# ================================================================ 13. 腕の断面（1:10–1:16）
story(140, 12, "section", ramp=[[0, 24], [1, 40], [3.5, 75], [5, 100], [6, 118], [7, 134], [9.5, 164], [12, 200]], cam=[
    [0, {"v": "editor2", "pad": 0.12}],
    [4, {"v": "editor2", "pad": 0.06}],
    [5.5, {"v": [300, 40, 1300, 820], "pad": 0.0}, "io"],
    [7, {"v": [300, 40, 1300, 820], "pad": 0.0}],
    [8, {"v": "editor2", "pad": 0.1}, "io"],
    [9.5, {"v": "editor2", "pad": 0.1}],
    [10.5, {"v": [40, 40, 1560, 840], "pad": 0.0}, "io"],
    [12, {"v": [40, 40, 1560, 840], "pad": -0.05}],
], tr={"type": "whip", "len": 0.5, "dir": 1})
lower(141, 4, [[["腕の断面は、", 0, {}], ["指で描く。", 1.5, {"font": "g6"}]]], size=56, scrim="left")
lower(149.5, 2.5, [[["薄すぎると、赤。", 0, {"color": RED, "font": "g6"}]]], size=56)
say(13, 141, "腕の断面も、指で描ける。")
part(140, 12, "chorus", 0.95)

# ================================================================ 14. 見せる（1:16–1:26）石の大きさ・断面・留め方・地金（拍ごとに替わる）
black(152, 2)
swap(152, 2, [["見せる。", 0, {"size": 170, "font": "g6"}]], sfx="hit")
seq = [("stone_5", "石 5 mm", PRES_RING), ("stone_8", "8 mm", PRES_RING), ("stone_10", "10 mm", PRES_RING), ("stone_6.5", "6.5 mm", PRES_RING),
       ("section_hirauchi", "平打ち", [900, 260, 460, 540]), ("section_hangouman", "半甲丸", [900, 260, 460, 540]), ("section_kaku", "角", [900, 260, 460, 540]), ("section_kouman", "甲丸", [900, 260, 460, 540]),
       ("setting_6", "6 本爪", PRES_HEAD), ("setting_bezel", "覆輪", PRES_HEAD), ("setting_4", "4 本爪", PRES_HEAD),
       ("metal_pt900", "Pt900", PRES_RING), ("metal_k18pg", "K18 ピンク", PRES_RING), ("metal_k18wg", "K18 ホワイト", PRES_RING), ("metal_k18yg", "K18 イエロー", PRES_RING)]
b = 154
for k, (mk, label, box) in enumerate(seq):
    ln = 1 if k < 14 else 2
    story(b, ln, "present", **{"from": f"{mk}-2", "speed": 1.0, "cam": [[0, {"v": box, "pad": 0.1}], [ln, {"v": box, "pad": 0.06}]]}, drift=0.0, noblur=True)
    call(b, ln - 0.02, label, (120, 860), size=88, anim="pop", fout=0.05, font="g5")
    b += ln
# 154 + 13 + 2 = 170 → 2 拍は指輪だけ
story(170, 2, "present", **{"from": 455, "speed": 1.0, "cam": [[0, {"v": PRES_RING, "pad": 0.0}], [2, {"v": PRES_RING, "pad": -0.06}]]})
say(14, 154, "お客さまの前で、その場で替えられる。")
part(152, 20, "chorus", 1.0)

# ================================================================ 15. Claude が聞きに来る（1:26–1:40）
black(172, 2)
swap(172, 2, [["Claude が、", 0, {"size": 130}], ["聞きに来る。", 1, {"size": 130, "font": "g6", "color": GOLD}]], sfx="whoosh")
story(174, 4, "ask", ramp=[[0, 0], [1.5, 22], [4, 70]], cam=[[0, {"v": COL, "rx": 7, "ry": -8, "pad": 0.0}], [1.5, {"v": COL, "pad": 0.0}, "io"], [3, {"v": "question", "pad": 0.15}, "io"], [4, {"v": "question", "pad": 0.12}]], tr={"type": "zoom", "len": 0.6})
story(178, 4, "ask", ramp=[[0, 70], [1, 80], [4, 108]], cam=[[0, {"v": "question", "pad": 0.12}], [1.5, {"v": "interview", "pad": 0.08}, "io"], [4, {"v": "interview", "pad": 0.04}]])
tag(178, 4, "が、帳面のまだ決まっていない所を聞く")
story(182, 6, "ask", ramp=[[0, 108], [5, 196], [6, 203]], cam=[[0, {"v": "answer", "pad": 0.5}], [6, {"v": "answer", "pad": 0.4}]], keys=[["asked+30", "wait-8"]])
story(188, 8, "ask", ramp=[[0, 203], [1, 211], [6, 258], [7, 266], [8, 274]], cam=[[0, {"v": "answer", "pad": 0.4}], [1.2, {"v": "draft", "pad": 0.1}, "io"], [6, {"v": "draft", "pad": 0.05}], [7, {"v": [442, 750, 400, 70], "pad": 0.5}, "io"], [8, {"v": [442, 750, 400, 70], "pad": 0.5}]], sfx=[[1, "shimmer"]])
tag(189, 5, "が、答えを決まりにまとめる")
story(196, 4, "ask", ramp=[[0, 278], [4, 330]], cam=[[0, {"v": COL, "pad": 0.0}], [4, {"v": "cards2", "pad": 0.05}]], tr={"type": "xfade", "len": 0.5})
lower(196.5, 3.5, [[["答えが、", 0, {}], ["決まりになる。", 1, {"font": "g6", "color": GOLD}]]], size=58)
say(15, 175, "帳面のまだ決まっていない所は、Claude が自分から聞きに来ます。答えれば、それが決まりになる。")
part(172, 28, "light", 0.75)

# ================================================================ 16. 工房ごとに（1:40–1:46）
black(200, 2)
swap(200, 2, [["決まりは、", 0, {"size": 130}], ["工房ごとに。", 1, {"size": 130, "font": "g6"}]], sfx="whoosh")
clips.append(dict(at=202, len=6, kind="split", sides=[
    {"ch": "workshops", "from": 8, "speed": 0.5, "cam": [[0, {"v": [460, 70, 420, 300], "pad": 0.1}], [6, {"v": [460, 70, 420, 300], "pad": 0.0}]]},
    {"ch": "workshops", "from": 60, "speed": 0.5, "cam": [[0, {"v": [460, 70, 420, 300], "pad": 0.1}], [6, {"v": [460, 70, 420, 300], "pad": 0.0}]]},
], tr={"type": "zoom", "len": 0.5}))
call(202.5, 5.5, "工房 A ・ ø 0.80 mm", (480, 900), size=56, label="同じ石・同じ形", anchor="c", anim="pop", color=GOLD)
call(203.5, 4.5, "工房 B ・ ø 1.41 mm", (1440, 900), size=56, label="帳面だけちがう", anchor="c", anim="pop")
story(208, 4, "workshops", ramp=[[0, 98], [4, 140]], cam=[[0, {"v": PANEL, "pad": 0.0}], [1.2, {"v": [1255, 120, 345, 300], "pad": 0.1}, "io"], [4, {"v": [1255, 120, 345, 300], "pad": 0.05}]])
say(16, 202, "決まりは、工房ごとに持てます。")
part(200, 12, "light", 0.75)

# ================================================================ 17. 作り方と図面（1:46–1:54）
black(212, 2)
swap(212, 2, [["作り方と、", 0, {"size": 130}], ["図面も。", 1, {"size": 130, "font": "g6"}]], sfx="whoosh")
story(214, 6, "make", ramp=[[0, 20], [1, 40], [2, 62], [3, 80], [4, 150], [6, 190]], cam=[[0, {"v": PANEL, "pad": 0.0, "rx": 4, "ry": -10}], [1, {"v": [1260, 40, 340, 520], "pad": 0.05}, "io"], [3, {"v": [1260, 40, 340, 520], "pad": 0.02}], [4, {"v": [1260, 200, 340, 520], "pad": 0.05}, "io"], [6, {"v": [1260, 200, 340, 520], "pad": 0.0}]], tr={"type": "zoom", "len": 0.5})
story(220, 4, "make", ramp=[[0, 246], [4, 290]], cam=[[0, {"v": [40, 40, 1220, 790], "pad": 0.0}], [4, {"v": [140, 120, 1020, 640], "pad": 0.0}]], tr={"type": "xfade", "len": 0.4})
foot(224, 4, "ring1", {"ch": "make", "from": 270, "speed": 0.4, "cam": [[0, {"v": [200, 260, 700, 420], "pad": 0.0}], [4, {"v": [200, 260, 700, 420], "pad": -0.08}]]}, tr={"type": "xfade", "len": 0.4})
say(17, 214, "作り方と図面も、その場で。")
part(212, 16, "light", 0.7)

# ================================================================ 18. 学ぶ（1:54–2:00）
story(228, 12, "learn", ramp=[[0, 30], [3, 92], [3.5, 100], [6, 140], [7, 152], [12, 190]], cam=[
    [0, {"v": "composer", "pad": 0.25, "rx": -6, "ry": 6}],
    [1, {"v": "composer", "pad": 0.25}, "io"],
    [3, {"v": "composer", "pad": 0.2}],
    [4, {"v": [426, 190, 748, 230], "pad": 0.1}, "io"],
    [6.5, {"v": [426, 190, 748, 230], "pad": 0.06}],
    [8, {"v": "why", "pad": 0.1}, "io"],
    [12, {"v": "why", "pad": 0.04}],
], keys=[["start+44", "start+92"]], tr={"type": "zoom", "len": 0.5})
lower(228.5, 4, [[["学ぶ人には、", 0, {}], ["職人の言葉で。", 1.5, {"font": "g6", "color": GOLD}]]], size=56)
tag(232, 6, "が、帳面の決まりから答える", y=990)
say(18, 229, "学ぶ人には、職人の言葉で答えます。")
part(228, 12, "light", 0.65)

# ================================================================ 19. 作り手の数（2:00–2:06）
black(240, 12)
text.append(dict(at=240, len=12, mode="stack", lines=[[["伝統的工芸品の従業員数", 0, {"size": 40, "color": GRAY}]]], pos=(960, 300), size=40, fout=0.6))
text.append(dict(at=240.5, len=11.5, mode="count", **{"from": 11.5, "to": 4.8}, fmt="{:.1f} 万人", pos=(960, 470), size=150, font="g2", delay=0.6, dur=2.6, anim="fade", fout=0.6, anchor="c"))
text.append(dict(at=240.5, len=11.5, mode="bar", **{"from": 11.5, "to": 4.8}, pos=(560, 620), w=800, delay=0.6, dur=2.6, fout=0.6))
stack(246, 6, [[["1998 → 2022 年度　", 0, {"size": 34, "color": GRAY}], ["24 年で、約 6 割減。", 0, {"size": 50, "font": "g6"}]]], pos=(960, 720), size=50)
stack(247, 5, [[["70 歳代以上 18.0%", 0, {"size": 40, "color": RED}], ["　20 歳代まで 6.0%", 0.5, {"size": 40, "color": GRAY}]]], pos=(960, 810), size=40)
src(240, 12, "出典：経済産業省 説明資料（伝統的工芸品産業振興協会の集計より）。従業員数・年齢は 2022 年度", pos=(120, 1010), size=22)
say(19, 241, "伝統的工芸品の作り手は、24 年で約 6 割減りました。")
downs.append(240)
part(240, 12, "break", 0.35)

# ================================================================ 20. 式年遷宮（2:06–2:18）
img(252, 6, "public/heritage/naiku-goshinpozu.jpg", cam=[[0, [0.29, 0.0, 0.27, 1.0]], [6, [0.57, 0.0, 0.27, 1.0]]], fit="contain", area=[0, 170, 1920, 520], tr={"type": "xfade", "len": 1})
stack(252.5, 5.5, [[["伊勢神宮の式年遷宮。", 0, {"font": "m6", "size": 74}]], [["20 年に一度、御装束神宝を新しく作る。", 1.5, {"font": "m3", "size": 46}]]], pos=(960, 840), size=74, scrim="bottom")
src(252, 6, "「内宮御神宝図」江戸時代の写し 国立国会図書館所蔵（Wikimedia Commons・パブリックドメイン）", pos=(120, 1050), size=20)
img(258, 6, "public/heritage/tsuba-carp.jpg", cam=[[0, [0.05, 0.05, 0.9, 0.9]], [6, [0.15, 0.15, 0.7, 0.7]]], fit="contain", area=[960, 90, 900, 760], tr={"type": "xfade", "len": 0.6})
stack(258.5, 5.5, [[["その彫金・金工は、", 0, {"font": "m3", "size": 64}]], [["ジュエリーと同じ技。", 1.5, {"font": "m6", "size": 80, "color": GOLD}]]], pos=(120, 440), size=64, align="left")
src(258, 6, "鯉と藻の鐔（江戸時代）メトロポリタン美術館（CC0）", pos=(120, 1050), size=20)
img(264, 6, "public/heritage/naiku-1953.jpg", cam=[[0, [0.0, 0.1, 1.0, 0.8]], [6, [0.1, 0.18, 0.8, 0.64]]], tr={"type": "xfade", "len": 0.6}, grade={"dim": 0.25})
stack(264.5, 5.5, [[["だから、", 0, {"font": "m3", "size": 64}], ["このしくみが使える。", 1, {"font": "m6", "size": 72}]]], pos=(960, 900), size=64, scrim="bottom")
src(264, 6, "1953 年 内宮　本田照夫 撮影（Wikimedia Commons・パブリックドメイン）", pos=(120, 1050), size=20)
img(270, 6, "public/heritage/kazari-tachi.jpg", cam=[[0, [0.0, 0.0, 1.0, 1.0]], [6, [0.08, 0.08, 0.84, 0.84]]], fit="contain", area=[0, 220, 1920, 520], tr={"type": "xfade", "len": 0.6})
stack(270.5, 5.5, [[["同じしくみを、", 0, {"size": 64}], ["ほかの技へ。", 1, {"size": 64, "font": "g6"}]]], pos=(960, 880), size=64, scrim="bottom")
src(270, 6, "飾太刀（平安時代）東京国立博物館／ColBase（CC BY 4.0）", pos=(120, 1050), size=20)
say(20, 253, "伊勢神宮の式年遷宮では、20 年に一度、御装束神宝が作り直されます。その彫金・金工は、ジュエリーと同じ技。だから、このしくみがそのまま使える。")
part(252, 24, "break", 0.4, dense=True)

# ================================================================ 21. 魚々子（2:18–2:26）
NK = "nanako"
story(276, 16, NK, ramp=[[0, 0], [1.5, 30], [3, "ask"], [6, "ask+40"], [8, "wait"], [9, "draft"], [11, "draft+30"], [12, "saved+10"], [14, "offset"], [16, "offset+30"]], cam=[
    [0, {"v": "preview", "pad": 0.0, "rx": 6, "ry": 10}],
    [1.5, {"v": "svg", "pad": -0.25}, "io"],
    [3, {"v": "ask", "pad": 0.05}, "io"],
    [8, {"v": "ask", "pad": 0.0}],
    [9, {"v": "draft", "pad": 0.1}, "io"],
    [11, {"v": "draft", "pad": 0.06}],
    [12.5, {"v": "svg2", "pad": 0.05}, "io"],
    [14, {"v": "svg2", "pad": -0.25}, "io"],
    [16, {"v": "svg2", "pad": -0.35}],
], keys=[["ask+34", "wait-6"]], tr={"type": "zoom", "len": 0.6})
lower(276.5, 3, [[["魚々子（ななこ）", 0, {"font": "m6"}]]], size=60, scrim="bottom")
tag(279, 6, "が、魚々子の決まりを聞く")
lower(288, 4, [[["ずれた粒だけが、", 0, {}], ["赤く。", 1, {"color": RED, "font": "g6"}]]], size=56)
say(21, 277, "魚々子のような技も、Claude が聞いて、決まりで確かめる。")
part(276, 16, "rise", 0.6)

# ================================================================ 22. 組み立て直す（2:26–2:36）
black(292, 2)
swap(292, 2, [["途切れた技は、", 0, {"size": 120}]], sfx="whoosh")
story(294, 12, "rebuild", ramp=[[0, 10], [1, 30], [1.5, 37], [6, 110], [7, 135], [7.5, 142], [12, 220]], cam=[
    [0, {"v": COL, "pad": 0.0, "rx": 7, "ry": -9}],
    [1, {"v": [426, 120, 748, 220], "pad": 0.1}, "io"],
    [2, {"v": [426, 80, 748, 420], "pad": 0.05}, "io"],
    [6, {"v": [426, 380, 748, 420], "pad": 0.05}],
    [7.5, {"v": "score", "pad": 0.25}, "io"],
    [9.5, {"v": "score", "pad": 0.2}],
    [12, {"v": [426, 150, 748, 600], "pad": 0.0}],
], tr={"type": "zoom", "len": 0.5})
tag(295.5, 6, "が、残った手がかりから作り方を組む")
lower(301.5, 4.5, [[["手がかりから、", 0, {}], ["組み立て直す。", 1, {"font": "g6", "color": GOLD}]]], size=58)
say(22, 295, "途切れた技も、残った手がかりから、Claude と組み立て直す。")
part(292, 14, "rise", 0.8, roll=True)
risers.append([302, 306])

# ================================================================ 23. Claude の働き（2:33–2:41）拍ごとに
roles = [
    ("聞く。", "ask", "asked+10", "interview"),
    ("まとめる。", "word", "proposal+20", "proposal"),
    ("確かめる。", "fix", 80, FIX_HEAD),
    ("直す。", "fix", 205, "log"),
    ("教える。", "learn", 165, "why"),
    ("組み立て直す。", "rebuild", 160, "score"),
]
b = 306
for k, (w, ch, fr, box) in enumerate(roles):
    story(b, 2, ch, **{"from": fr, "speed": 0.6, "cam": [[0, {"v": box, "pad": 0.2}], [2, {"v": box, "pad": 0.12}]]}, grade={"dim": 0.74}, mute=True, noblur=True)
    swap(b, 2, [[w, 0, {"size": 150, "font": "g6", "color": GOLD if k % 2 else WHITE}]], sfx="hit")
    b += 2
tag(306, 12, "は、職人の判断を受け継ぐ手伝いをする")
drops.append(306)
part(306, 12, "final", 1.0)

# ================================================================ 24. 本物の指輪（2:41–2:47）
foot(318, 12, "ring2", {"ch": "present", "from": 441, "speed": 1.0, "cam": [[0, {"v": PRES_RING, "pad": 0.05, "dx": -60}], [12, {"v": PRES_RING, "pad": -0.06, "dx": -60}]]}, tr={"type": "xfade", "len": 1})
stack(319, 11, [[["ネットにない職人の判断を、", 0, {"size": 84}]], [["次の人へ。", 2, {"size": 120, "font": "g6", "color": GOLD}]]], pos=(140, 540), size=84, scrim="left2", scrimAmt=1.0, align="left")
say(24, 320, "職人の判断を、次の人へ。")
part(318, 12, "final", 0.85)

# ================================================================ 25. 継ぐ（2:47–2:56）
hits += [330, 331, 332]
story(330, 1, "present", **{"from": 446, "cam": [[0, {"v": PRES_HEAD, "pad": 0.05}], [1, {"v": PRES_HEAD, "pad": -0.08}, "out"]]}, drift=0.0, noblur=True)
story(331, 1, "word", **{"from": 150, "cam": [[0, {"v": "field", "pad": 0.2}], [1, {"v": "field", "pad": 0.1}, "out"]]}, drift=0.0, noblur=True, mute=True)
black(332, 20)
text.append(dict(at=332, len=20, mode="stack", lines=[[["継ぐ", 0, {"font": "m6", "size": 230}]]], pos=(960, 420), size=230, lh=1.0, anim="depth", fout=2))
text.append(dict(at=334, len=18, mode="stack", lines=[[["職人の判断を、次の人へ。", 0, {"size": 40, "color": WHITE}]], [["このアプリも、彫金職人が Claude Code と作りました（Skill ・ MCP ・ フック ・ サブエージェント）", 1, {"size": 26, "color": GRAY}]]], pos=(960, 640), size=40, lh=1.7, fout=2))
src(338, 14, "画像：内宮御神宝図・1953 年の内宮（Wikimedia Commons・パブリックドメイン）／鐔（メトロポリタン美術館・CC0）／飾太刀（東京国立博物館 ColBase・CC BY 4.0）", pos=(120, 1000), size=19)
src(338, 14, "作り手の数：経済産業省 説明資料。画面の数字は継ぐの本物の画面の値（目安・最後は職人が決める）", pos=(120, 1035), size=19)
say(25, 334, "継ぐ。このアプリも、彫金職人が Claude Code と作りました。")
part(330, 22, "outro", 0.4)
fx.append(dict(k="fade", at=348, len=4))

tl = dict(bpm=120, len=352, clips=sorted(clips, key=lambda c: c["at"]), text=text, fx=fx, music=sorted(music, key=lambda m: m["at"]),
          hits=hits, risers=risers, drops=drops, stops=stops, downs=downs, voice=voice, sfx=sfx)
# 場面が重ならず、すき間もないか確かめる
cs = tl["clips"]
for a_, b_ in zip(cs, cs[1:]):
    if abs(a_["at"] + a_["len"] - b_["at"]) > 1e-6:
        print("すき間／重なり", a_["at"], a_["len"], b_["at"])
end = cs[-1]["at"] + cs[-1]["len"]
print("長さ", end, "拍 ＝", end / 2, "秒")
json.dump(tl, open(os.path.join(HERE, "final.json"), "w"), ensure_ascii=False, indent=1)
