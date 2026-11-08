# 最終案 10 の台本（final10.json）を作る。最終案 9（final_build9.py）から、作者の声「速すぎる・急に寄った画面から入る」で直した。時刻はすべて「秒」。拍に縛らない（音楽の大きな区切りも秒で持つ）。
# 設計は PLAN-final10.md、見た目の決まりは LOOK9.md、声の表は ../docs/NARRATION-ad.md のいちばん上。
#
# 声が場面の長さを決める：場面の長さ ＝ 前の間 ＋ 声 ＋ 後の間。間は全体が目標の長さ（TARGET）に入るように、同じ割合でのばす・つめる。
#   作者の録音 work/voice/n<番号>.wav があれば、無音を切って大きさをそろえて（work/voice/_own10/）使う。なければ仮の声 work/voice/sim10/n<番号>.wav（1.0 倍）。
#   作者の映像：footage/raw/finished.mov（完成した指輪）・footage/ring2.mov か raw/ring2.mov（本物の指輪）・footage/raw/kebori.mov（毛彫りの手本）を置くと、その場面が替わる。
# 曲：work/music9/song.wav（作者が選んだ曲）と song.json を置くと、章の頭を曲の大きな区切りの秒に寄せる（章ごとに間をのばす・つめる）。
#   song.json：{"marks": {"残す": 秒, "渡す1": 秒, "渡す2": 秒, "渡す3": 秒, "途絶え": 秒, "復元": 秒, "山": 秒, "結": 秒}}（耳で聞くか、波形を見て秒で書く）
#   なければ計算の曲（bgm9.py の案 D3）を、章の秒に合わせて作る。
# 使い方：python -I final_build10.py → final10.json
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
WORK = os.environ.get("TSUGU_VIDEO_WORK", os.path.join(HERE, "work"))
VO = os.path.join(WORK, "voice")
SIM = os.path.join(VO, "sim10")
OWN = os.path.join(VO, "_own10")
# 2026-11-08 作者の声：口の音（くちゃ・プチッ）を消し、落ち着いたプロのナレーションのように聞きやすく。NARR_FX=pro なら、
#   口の音を消す → 低い唸りを切る → やさしく圧縮（大小の差を少し縮める）→ 低い所を少し温かく・耳に刺さる所を少し丸く → ごく小さな部屋の響き。
#   NARR_FX=plain（ふだん）は、口の音を消すだけ。どちらも、無音を切ってから足すので、声の長さ（場面の長さ）は変わらない
NARR_FX = os.environ.get("NARR_FX", "plain")
if NARR_FX == "pro":
    OWN = OWN + "_pro"
NARR_CHAIN = {
    "plain": "adeclick=w=40:o=75:t=2",
    "pro": "adeclick=w=40:o=75:t=2,highpass=f=80,acompressor=threshold=-21dB:ratio=2.2:attack=10:release=160:makeup=1.4,equalizer=f=200:t=q:w=1.0:g=1.2,equalizer=f=4200:t=q:w=1.2:g=-1.0,aecho=0.9:0.6:24|39:0.06|0.035",
}[NARR_FX]
FOOT = os.path.join(WORK, "footage")
RAW = os.path.join(FOOT, "raw")
FPS = 30
TARGET = float(os.environ.get("TARGET", "179.8"))  # 全体の長さ（秒）。3:00 を越えない

# n20 の言い方（N20=long で作者の案のまま。3:00 に入らないので、ふだんは短い言い方）
#   short は画面の順（手順 → 鋳造 → 鍛造 → ロウ付けの札の職人の決まり）に言葉の順をそろえた
N20 = {"long": "3D モデルと、帳面に残った職人の言葉をもとに、鋳造でも鍛造でも、作り方を自動で作ります。",
       "mid": "3D モデルと、帳面の職人の言葉から、鋳造でも鍛造でも、作り方を自動で作ります。",
       # 最終案 16（作者の声：「作ります」が重なる）：作り方を自動で「出します」
       "short": "鋳造でも鍛造でも、3D モデルと帳面の言葉から、作り方を自動で出します。"}[os.environ.get("N20", "short")]

# 声の表（番号は docs/NARRATION-ad.md と同じ。足す・変えるときは両方）
VOICE = {
    1: "私は、彫金の職人です。",
    2: "作れるかどうかの判断は、職人の頭の中にあります。",
    3: "職人がいなくなれば、その判断も消えます。",
    5: "職人は、ふだんの言葉で話すだけ。",
    # 最終案 14（作者の声：Claude は書き写すのでなく、読み取る）。n7 はそのまま（作者）、n8 は新しい行
    # 最終案 15（作者の声：推測を強く言わない。計算すると言う）
    # 2026-11-08 作者の声：「ふだんの言葉で話すだけ」のあとの間が長い・石留めのほかの設計にも効くと見せたい → ほかの設計も、と言い足す
    6: "Claude が決まりにし、ほかの設計も、帳面をもとに計算します。",
    7: "職人がよければ、帳面に残ります。",
    8: "違えば、ひとこと話すだけで直せます。",
    10: "まず、デザインする人へ。",
    11: "作れない、と制作から何度も戻ってくることがあります。",
    12: "継ぐがあれば、制作から戻ることは、ごく少なくなります。",
    13: "職人が残した言葉をもとに、Claude が、作れる指輪を自動で組みます。",
    15: "好きな雰囲気や細かい希望を打ち込むだけで、職人の決まりを守った、作れる形が出てきます。",
    18: "作れない所は、職人の言葉で教えます。",
    19: "なぜ作れないのか、どう直せばよいのかを。",
    # 最終案 14（作者の声：作り方は 3D の形だけでなく、帳面の職人の言葉からも作る）。作者の案「3D モデルと、帳面に残った職人の言葉をもとに、…」を 3:00 に入る長さに
    20: N20,
    21: "次に、学ぶ人へ。",
    # 2026-11-08 作者の声：独自のデザインの「作り方」は、先生に聞くしかない
    22: "学校では、独自のデザインの作り方は、先生に聞くしかありません。",
    23: "先生が確かめられる数には限りがあり、1 時間ほど待つこともあります。",
    24: "継ぐなら、すぐ答えが出ます。",
    27: "そして、次の時代へ。",
    28: "伝統的工芸品の作り手は、約 6 割減りました。",
    29: "20 年に一度しか、受け継ぐ機会がない技もあります。",
    30: "こうした彫金の技も、継ぐで、次へ残せます。",
    32: "もし途絶えてしまっても、復元を試みることができます。",
    33: "たとえば、江戸時代の刀の飾りの技、木目金。",
    37: "隠しておいた、本当の 11 の手順と比べると、9 に、たどり着きました。",
    39: "職人の帳面が加われば、失われた技も、組み立て直せるかもしれません。",
    41: "職人の判断を、次の人へ。",
    42: "継ぐ。",
    # 2026-11-08：冒頭の「私は、彫金の職人です。」と対に、アプリ → 道具（職人の道具）
    43: "この道具も、私が Claude Code と作りました。",
}
# 最終案 10 で外した行（番号は詰めない）：n9・n12（図の字だけ残す）・n14・n25・n26・n31・n34・n38。
# 最終案 11 で、手で変える操作の「号を変える」「腕の形を選ぶ」を外した（言葉 → 決まりの字の場面・彫りの場面・行ったり来たりの朱入れを、ゆっくり見せる時間に回す）。
# 実際に使っている所を中心にしたとき（2026-11-06 作者の声）に、さらに外した：n8・n16・n17・n35・n36・n40（手で変える操作・模様の試しの時間に回す。Claude が職人に聞く所は、残すの画面と重なるので外した）


def has_foot(*names):
    for n in names:
        p = os.path.join(FOOT, n)
        if os.path.exists(p):
            return n
    return None


REAL_FIN = has_foot("raw/finished.mov", "finished.mov")   # 完成した指輪（渡す 1 の終わり）。なければこの場面を外す（時間を声の間に回す）
REAL_RING = has_foot("raw/ring2.mov", "ring2.mov")        # 本物の指輪（結の頭）。なければ今の描き方のテンションの指輪
REAL_KEBORI = has_foot("raw/kebori.mov", "kebori.mov")    # 毛彫りの手本（作者が撮る）。なければ仮の映像（kari_kebori.mov。出典と改変を画面に書く）

# 場面の並び。pre：声の前の間、post：声の後の間、gap：同じ場面の声の間、xf：前の場面との重ね（秒）。dip：黒をはさむ（章の変わり目）。hold：のばす分
# ch は章（音楽の区切りと、確かめの表に使う）
STORY = os.path.join(WORK, "story")
# 最終案 14：デザインする人への章の「伝統の仕上げ」（槌目・四分一や赤銅の煮色・ミル打ち。別の係が作っている）。撮った章 finish14 があるときだけ入れる（FINISH14=0 で外す）
HAS_FINISH = os.path.exists(os.path.join(STORY, "finish15", "meta.json")) and os.environ.get("FINISH14", "1") != "0"
# 最終案 16b（作者の頼み）：伝統の仕上げは、石のない地金のみの指輪（撮った章 finish16）で。FINISH16=0 で前の石の指輪（finish15）に戻せる
# 最終案 17（作者の声：見本を選ぶだけに見える。模様を作る所と、作れない → 直すと作れる、を見せる）：自分の模様の章 finish17（FIN=16 で 16b の章）
_FIN = os.environ.get("FIN", "17")
FIN_ID = next((k for k in ([f"finish{_FIN}"] + ["finish17", "finish16"]) if os.path.exists(os.path.join(STORY, k, "meta.json"))), "finish15")
if os.environ.get("FINISH16") == "0":
    FIN_ID = "finish15"
FIN_HOLD = float(os.environ.get("FIN_HOLD", {"finish17": "8.5", "finish16": "6.4"}.get(FIN_ID, "6.05")))  # 17：8.5 秒（16b より ＋2.1 秒。声のない所から）
# 最終案 16：本物の指輪の前の、テンションの計算（撮った章 tension16 があるときだけ。TENSION16=0 で外す）
HAS_TENSION = os.path.exists(os.path.join(STORY, "tension16", "meta.json")) and os.environ.get("TENSION16", "1") != "0"
# 最終案 15（作者の声：彫りが入ると、はじめが速く感じる）：ふだんは炎とヤスリだけ。OPENING=kebori で最終案 14 の彫りを戻せる（reel9 も同じ値を読む）
OPENING = os.environ.get("OPENING", "plain")
# 最終案 17（作者が伝統の仕上げを動画から外すか考えている）：FINISH=0 で伝統の仕上げの場面を外し、空いた約 8.5 秒を、詰めていた所へ返す
#   （話して直す・11 のうち 9 と 3 枚の鐔・図面と STL・本物の指輪・テンション ほか）。nf(ふだん, 外したとき)
#   2026-11-07 作者が決めた：伝統の仕上げは動画からもアプリからも外す。ふだんは外した形（FINISH=1 で前の形に戻せる）
SHOW_FIN = os.environ.get("FINISH", "0") != "0"


# 最終案 17e（作者の声：「新しいパターンとかもあったら見てみたい」。17d と比べる別の案）：V17E=1 で、模様の試しの 3 枚の鐔のあとに、
#   架空の技 6 つの模様の見込み（重ねる 3・重ねない 3。途切れた技の頁で撮った章 waza17e）を約 3 秒、字「架空の技でも。重ねない技でも。」と出す。
#   時間は模様の試しの中から：n37 と n39 の間 3.6 → 3.3 秒（言い終わってから表のまま 2.1 → 1.8 秒。作者の頼みの 1.5 秒は残る）、言い終わったあと 1.4 → 1.7 秒。
#   場面の長さ・章の頭の秒・ほかの場面は 17d のまま（曲もそのまま）。台本は final10e.json、動画は 継ぐ_デモ_最終案10e_仮声.mp4（final9.py も V17E を読む）
V17E = os.environ.get("V17E") == "1" and os.path.exists(os.path.join(WORK, "story", "waza17e", "meta.json"))
TAG = "e" if os.environ.get("V17E") == "1" else ""


def nf(a, b):
    return a if SHOW_FIN else b

# 場面の並び。pre：声の前の間、post：声の後の間、gap：同じ場面の声の間、xf：前の場面との重ね（秒）。dip：黒をはさむ（章の変わり目）。hold：のばす分
# ch は章（音楽の区切りと、確かめの表に使う）。nat：その場面の本物の音（炎・ヤスリ）を鳴らす長さ（なければ場面の長さ）
SCENES = [
    # 最終案 12（作者の声）：はじめの 3 行は、1 行ずつ間を開けて（各行のあとに 1 秒ほどの静けさ。間 ＝ post − 次の xf ＋ 次の pre）
    # 最終案 14：「彫金の職人です」で、伝統の彫りの手元（彫る手元の映像）を 2〜3 秒重ねる（reel9 の flame）。炎の音は彫りに替わる所で消す
    #   最終案 14：3:00 に入れるため、n1・n2 のあとの静けさを約 1.15 → 1.0 秒に（作者の頼みの「1 秒ほど」は残す）
    dict(id="flame", ch="序", v=[1], pre=nf(1.7, 1.9), post=1.2, xf=0, fixed=True, **({"nat": 3.3} if OPENING == "kebori" else {})),
    dict(id="hands0", ch="序", v=[2], pre=0.7, post=1.3, xf=0.9, fixed=True),
    # 最終案 14：3:00 に入れるため、n3 のあとの静けさを 1.9 → 1.6 秒に（題の字が出てくる間。作者の頼みの 1 秒は残る）
    dict(id="vanish10", ch="序", v=[3], pre=0.6, post=1.4, xf=0.9, fixed=True),
    # 題：「継ぐ。」（間）「職人の判断を、次の人へ。」。声は n42 → n41（結と同じ言葉）。絵も長めに
    dict(id="title10", ch="序", v=[42, 41], gap=1.2, pre=nf(0.6, 0.9), post=1.15, xf=0.8, fixed=True),  # 最終案 16：n3 のあとの静けさ 1.5 → 1.2 秒（作者の頼みの 1 秒は残す）
    # 残す（最終案 15。作者の声：前の字の札の方が、見ていて入ってきた。推測を強く言わない）：字の札（言葉 → Claude → 決まり。ほかの大きさの石も計算した数字）
    #   →「これでいい」→ 帳面に残る → 設計の確かめに使う（n5〜n7）→ 本物の画面を短く：話して直す「18 ミリなら 1.2 は欲しい」→ 18 mm が 1.20 → これでいい（n8）
    dict(id="rule15", ch="残す", v=[5, 6, 7], gap=0.45, pre=0.8, post=nf(0.7, 1.0), xf=1.0, dip=True, fixed=True),
    dict(id="teach15", ch="残す", v=[8], pre=nf(0.8, 0.9), post=nf(1.75, 2.65), xf=0.6, fixed=True),  # 最終案 16（作者の声：速くて追えない）：4.5 → 5.5 秒。動きそのものをゆっくり（等倍）
    # 渡す 1：デザインする人へ。行き来の図 → 手で変える操作（声なし・見出し 1 つずつ）→ 最初の版と今の版 → 言葉で頼む → 人が直す → 職人の言葉 → 図面と STL
    # 最終案 17q（2026-11-08 作者の声：「まず、デザインする人へ」と最後の出典を、ほんの少し長く・2:40 あたりが長い）：
    #   「デザインする人へ」のあと 0.63 → 0.93 秒、出典 1.8 → 2.1 秒。模様の試しの n37 と n39 の間を 0.6 秒つめて回した（全体の長さは同じ）
    dict(id="door1h", ch="渡す1", v=[10], pre=0.25, post=0.93, xf=1.0, dip=True, fixed=True),
    # 最終案 13：行き来の図に声を足す（n12「継ぐがあれば、制作から戻ることは、ごく少なくなります。」）。2 回目の朱入れ（石の深さの寸法つき）を読んでから継ぐの枠へ。
    #   n12 の頭は、継ぐの枠に替わり始めて 0.5 秒（reel9 の flow11 が n12 の頭から替わる秒を決める）
    dict(id="flow11", ch="渡す1", v=[11, 12], gap=2.3, pre=1.0, post=0.9, xf=0.8, fixed=True),  # 2026-11-08 作者の声：「まず、デザインする人へ」から「作れない、と…」が急 → 前の間 0.6 → 1.0 秒  # 最終案 17b・17c：2 回目の朱入れを読む間 2.87 → 2.3 秒（最終案 16 と同じ。テンションへ回した）
    # 手で変える（最終案 14）：断面をパッパッパと 3 回（印は止めない）→ 伝統の仕上げ（四分一 → 丸槌目 → 少し寄る、切り替えて 赤銅 → 布目象嵌 → 腕の肌。ミル打ちは見せない）。
    #   爪を押す（prong12）は外した（人が直すの場面で同じ爪の欄を見せる）。留め方（setting12）は、伝統の仕上げを撮ったら、それに替える（3:00 に入れるため）
    dict(id="section13", ch="渡す1", v=[], hold=nf(4.3, 4.7), xf=0.5),  # 最終案 15：赤を 1 秒ほど見せる。最終案 17b：点 1・点 2 → 点 3 を引きすぎて赤 → 離さず戻す → 離す（4.4 → 4.8 秒）
] + (([dict(id=FIN_ID, ch="渡す1", v=[], hold=FIN_HOLD, xf=0.0)] if HAS_FINISH else [dict(id="setting12", ch="渡す1", v=[], hold=2.3, xf=0.0)]) if SHOW_FIN else []) + [  # 最終案 15：仕上げのあと、布目象嵌の作り方まで
    dict(id="firstnow10", ch="渡す1", v=[13], pre=1.2, post=2.0, xf=0.6),
    # 最終案 13：n15 は「好きな雰囲気や細かい希望を打ち込むだけで、…」。打つ所は声の前半に重ねる（画面の字はアールデコのまま）
    dict(id="deco11", ch="渡す1", v=[15], pre=0.85, post=0.3, xf=0.8, fixed=True),  # 最終案 17b・17c：0.6 → 0.3 秒（テンションへ回した）
    # 最終案 13：爪のつまみを 2 秒かけてゆっくり（目盛りごとに形が変わる → 0.65 mm で赤）。そのあと n18。最終案 14：頭の全体 → 確かめるを少しだけ詰めた
    dict(id="fix11", ch="渡す1", v=[18, 19], gap=0.7, pre=4.6, post=0.4, xf=0.8, fixed=True),  # 最終案 17b・17c：言い終わったあと 0.8 → 0.4 秒（図面と STL・テンションへ回した）  # 最終案 15：頭の動きは、印が動く所を等倍（印が跳ばない）。n18 と n19 の間は 0.7 秒のまま
    # 図面と STL：章の終わり。STL のあとに「この 3D データは、そのまま鋳造できます。」（作者の言葉。最終案 17b で「あとは仕上げだけ。」を外した）と、章が変わる前の一息
    #   最終案 17b（作者の声：速くて飛び飛び）：図面 → STL へ 1 つのなめらかな動き → 押す → 留まる（3.0 → 3.8 秒）
    dict(id="out11", ch="渡す1", v=[], hold=nf(2.1, 4.6), xf=0.8),  # 2026-11-08 作者の声：STL のまま鋳造できる、が一瞬で読まれないかも → 3.8 → 4.6 秒
    # 最終案 16（作者の声：本物の指輪が、アールデコの生成のすぐあとに急に出て、その指輪に見える）：テンションの「浅く留めたいとき」を短く（声なし・見出し）
] + ([dict(id="tension16", ch="渡す1", v=[], hold=nf(2.9, 5.0), xf=0.6)] if HAS_TENSION else []) + ([dict(id="finished", ch="渡す1", v=[], hold=nf(2.3, 2.8), xf=0.8, **({"fin_cap": "calc"} if HAS_TENSION else {}))] if REAL_FIN else []) + [  # 最終案 14：作者が継ぐのデータから作った本物の指輪（2026-11-06）
    # 渡す 2：学ぶ人へ（最終案 13：作り方はおもに学ぶ人のため → この章の頭へ）。「次に、学ぶ人へ。」のあと 1 秒ほど静かに
    dict(id="door2", ch="渡す2", v=[21], pre=0.5, post=1.2, xf=1.0, dip=True, fixed=True),
    # 最終案 14：作り方は、帳面の職人の言葉からも作る（n20）。手順のロウ付けの札の「職人の決まり」まで送って寄る（make14）
    dict(id="make14", ch="渡す2", v=[20], pre=1.2, post=1.35, xf=0.8, fixed=True),  # 言い終わったあと 1 拍（作者の声）→ 学校
    dict(id="school10", ch="渡す2", v=[22, 23], gap=0.45, pre=0.4, post=0.35, xf=0.8, fixed=True),  # 最終案 17b：0.6 → 0.35 秒（テンションへ回した）
    # 最終案 14：問いは職人が言っていない 9.3 mm の石。答えと表（職人の点と推測）、職人の言葉（名前・日付）を読める長さ
    dict(id="learn10", ch="渡す2", v=[24], pre=2.4, post=1.8, xf=0.8, fixed=True),  # 最終案 17b：言い終わったあと 2.6 → 2.1 秒（最終案 16 と同じ。図面と STL・断面へ回した）
    # 最終案 17d（作者の声：「次の時代へ」のあと、吸って入るような間がほしい・「復元を試みることができます」のあと、もうひとこま）：
    #   n27→n28 0.4 → 0.9 秒、n32→n33 0.45 → 0.75 秒。学ぶの後 0.3・彫りの画面の後 0.25・模様の頁の前 0.25 秒を回した
    dict(id="door3h", ch="渡す3", v=[27], pre=0.5, post=1.0, xf=1.0, dip=True, fixed=True),
    # 最終案 13（作者の声：約 6 割から 20 年に一度へ移るのが速い）：約 6 割の札を読める長さ残し、n28 と n29 の間に 1 秒あまりの静けさ
    dict(id="stat", ch="渡す3", v=[28], pre=0.9, post=1.75, xf=1.0, fixed=True),
    dict(id="naiku", ch="渡す3", v=[29], pre=0.3, post=0.5, xf=1.0, fixed=True),
    # 職人が残す → 学ぶ人が受け取る：それぞれの画面を読める長さ（作者の声：移るのが速すぎる）。中の段の秒は kebori10 が声の頭から決める
    dict(id="kebori10", ch="渡す3", v=[30], pre=1.25, post=5.5, xf=0.9, fixed=True),  # 2026-11-08 作者の声：「20 年に一度…」から「こうした彫金の技も…」が急 → 前の間 0.8 → 1.25 秒
    # 途切れた技：木目金の鐔（n32・n33）→ 模様の試し（別の係の新しい頁。頁の全体 → 表に寄って段が順に出る（n37）→ 下の行を読める大きさで → 3 枚へゆっくり → n39）
    dict(id="mokume11", ch="途絶え", v=[32, 33], gap=0.75, pre=nf(0.15, 0.25), post=0.25, xf=1.0, dip=True, fixed=True),
    dict(id="moyou11", ch="復元", v=[37, 39], pre=nf(2.0, 2.35), gap=nf(3.0, 3.6) - (0.9 if V17E else 0), post=nf(0.8, 1.4) + (0.3 if V17E else 0), xf=0.8, fixed=True, **({"waza": 1} if V17E else {})),  # 最終案 16：本当の手順 → Claude の手順を段ごと → 本当の 11 の手順を 1 行ずつ数える（n37）。言い終わって 1.5 秒は表の下の行（作者の頼み）。最終案 17b：Claude の手順 → 隠しておいた本当の手順を開く → 数える
    # 結（最終案 12）：CG の指輪をやめ、実写の手元（磨いて仕上げる）→ 題「継ぐ」→ 間 →「職人の判断を、次の人へ。」。最終案 14：映像 2.4 → 2.0 秒
    dict(id="endhands", ch="結", v=[], hold=1.3, xf=1.0, dip=True),  # 最終案 17b：1.8 → 1.3 秒（最終案 16 と同じ。図面と STL・断面へ回した）
    dict(id="title3", ch="結", v=[42, 41], gap=1.2, pre=0.8, post=0.8, xf=1.2, fixed=True),
    dict(id="credit", ch="結", v=[], hold=3.6, xf=0.8, dip=True),  # 2026-11-08 作者：ここは語りなし（字だけ）。前は n43 の声つき  # 題と字が重ならないよう、黒をはさむ（最終案 13）
    # 出典（作者の判断：途中の画面には出さず、最後にまとめて 2〜3 秒）
    dict(id="sources", ch="結", v=[], hold=nf(1.5, 2.1), xf=0.8),
]
FIXED_PRE = {"flame", "moyou11", "deco11", "fix11", "make10", "make14", "learn10", "naiku", "teach14", "rule15", "teach15"}  # 声の前の間を、全体の倍率でのばし縮みしない場面（本物の画面は、まず全体 → 押す所を見せる時間。模様の試しは、最後の 3 枚が出てから n39）


def dur(f):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).decode())


def own_voice(n):
    """作者の録音：前後の無音を切り、大きさをそろえて _own10 に置く。元の録音が新しければ作り直す"""
    src = os.path.join(VO, f"n{n}.wav")
    if not os.path.exists(src):
        return None
    os.makedirs(OWN, exist_ok=True)
    dst = os.path.join(OWN, f"n{n}.wav")
    if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src):
        cut = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12,areverse"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-af", f"{cut},{NARR_CHAIN},loudnorm=I=-16:TP=-1.5", "-ar", "48000", "-ac", "2", dst], check=True)
    return dst


def voice_file(n):
    return own_voice(n) or os.path.join(SIM, f"n{n}.wav")


def layout(durs, kk):
    """間の倍率で並べる（kk は数か、章ごとの {章: 倍率}）。返すのは（場面の並び、全体の長さ）"""
    out, t = [], 0.0
    for i, sc in enumerate(SCENES):
        k = kk.get(sc["ch"], 1.0) if isinstance(kk, dict) else kk
        xf = sc.get("xf", 0.5) if i else 0.0
        start = max(0.0, t - xf)
        kf = 1.0 if sc.get("fixed") else k  # fixed：間を全体の倍率でのばし縮みしない（中で段が決まった速さで進む場面）
        pre = sc.get("pre", 0.5) * (1.0 if sc["id"] in FIXED_PRE else kf)
        gap = sc.get("gap", 0.3) * kf
        post = sc.get("post", 0.5) * kf
        voices, at = [], pre
        for n in sc["v"]:
            voices.append(dict(n=n, at=round(at, 3), dur=round(durs[n], 3), text=VOICE[n], file=os.path.relpath(voice_file(n), WORK)))
            at += durs[n] + gap
        body = (at - gap + post) if sc["v"] else sc.get("hold", 3.0) * max(1.0, min(k, 1.3))
        ln = body
        # フレームの区切りにそろえる
        ln = round(ln * FPS) / FPS
        start = round(start * FPS) / FPS
        out.append(dict(id=sc["id"], ch=sc["ch"], start=start, len=ln, xf=round(xf * FPS) / FPS, dip=bool(sc.get("dip")), voice=voices, **({"nat": sc["nat"]} if "nat" in sc else {}), **({"fin_cap": sc["fin_cap"]} if "fin_cap" in sc else {}), **({"waza": sc["waza"]} if "waza" in sc else {})))
        t = start + ln
    return out, t


def solve(durs):
    lo, hi = 0.2, 3.0
    for _ in range(40):
        k = (lo + hi) / 2
        _, tt = layout(durs, k)
        if tt > TARGET:
            hi = k
        else:
            lo = k
    return lo


CHAPTERS = list(dict.fromkeys(sc["ch"] for sc in SCENES))


def chapter_starts(scenes):
    out = {}
    for x in scenes:
        out.setdefault(x["ch"], x["start"])
    return out


def solve_marks(durs, marks):
    """作者の曲の大きな区切り（秒）に、章の頭を寄せる。前の章から順に、章ごとの間の倍率を決める。寄せきれない所は知らせる"""
    kmap = {c: 1.0 for c in CHAPTERS}
    for i, ch in enumerate(CHAPTERS):
        nxt = CHAPTERS[i + 1] if i + 1 < len(CHAPTERS) else None
        goal = marks.get(nxt) if nxt else TARGET
        if goal is None:
            continue
        lo, hi = 0.3, 3.0
        for _ in range(40):
            kmap[ch] = (lo + hi) / 2
            sc, tt = layout(durs, kmap)
            at = chapter_starts(sc)[nxt] if nxt else tt
            if at > goal:
                hi = kmap[ch]
            else:
                lo = kmap[ch]
        kmap[ch] = lo
        sc, tt = layout(durs, kmap)
        at = chapter_starts(sc)[nxt] if nxt else tt
        if abs(at - goal) > 0.2:
            where = nxt or "終わり"
            print(f"注意：「{where}」を曲の {goal:.1f} 秒に寄せきれない（{at:.1f} 秒）。間の倍率 {kmap[ch]:.2f}", file=sys.stderr)
    return kmap


def main():
    durs = {n: dur(voice_file(n)) for n in VOICE}
    own = sum(1 for n in VOICE if own_voice(n))
    song_marks = os.path.join(WORK, "music9", "song.json")
    if os.path.exists(os.path.join(WORK, "music9", "song.wav")) and os.path.exists(song_marks):
        # 作者の曲：曲の大きな区切りに、章の頭を寄せる
        with open(song_marks, encoding="utf8") as f:
            k = solve_marks(durs, json.load(f)["marks"])
    else:
        k = solve(durs)
    scenes, total = layout(durs, k)
    kk = min(k.values()) if isinstance(k, dict) else k
    if kk < 0.6:
        print(f"注意：声が長くて、間が足りません（間の倍率 {kk:.2f}）。声の行を減らすか、OWN_TEMPO を考える", file=sys.stderr)
    # 章の頭の秒（音楽の区切り）
    ch_at = {}
    for s in scenes:
        ch_at.setdefault(s["ch"], s["start"])
    voice = []
    for s in scenes:
        for v in s["voice"]:
            voice.append(dict(n=v["n"], at=round(s["start"] + v["at"], 3), dur=v["dur"], text=v["text"], file=v["file"]))
    voice.sort(key=lambda x: x["at"])
    # 最終案 13：声と声の間の静けさを確かめる（最終案 12 は n28 の終わりに n29 が 0.2 秒重なっていた。仮の声は前後の無音がほぼない）
    for p0, p1 in zip(voice, voice[1:]):
        quiet = p1["at"] - (p0["at"] + p0["dur"])
        if quiet < 0.4:
            print(f"注意：n{p0['n']} と n{p1['n']} の間の静けさが {quiet:.2f} 秒（0.4 秒より短い）", file=sys.stderr)
    # 曲の区切り（bgm9.py の段の名前）
    # 山：模様の試しの、最後の 3 枚が出る所（n39 の少し前）
    moy = next(x for x in scenes if x["id"] == "moyou11")
    peak = moy["start"] + (moy["voice"][0]["at"] - 1.6 if moy["voice"] else 9.0)
    # 最終案 17（作者の声：2:32 あたりの脈のような音）：復元の頭に、短い build の段（16b は 0.6 秒）が残ると、音型が 0.6 秒ずれて 2 度始まった。
    #   山は章の頭より後ろにしない（短い build の段を作らない。最終案 12 と同じ形）
    peak = min(peak, ch_at["復元"])
    sections = [["intro", 0.0], ["main", ch_at["残す"]], ["thin", ch_at["渡す3"]], ["gap", ch_at["途絶え"]], ["build", ch_at["復元"]], ["peak", round(peak, 3)], ["end", ch_at["結"]]]
    commits = subprocess.run(["git", "-C", REPO, "rev-list", "--count", "HEAD"], capture_output=True, text=True).stdout.strip()
    first_day = subprocess.run(["git", "-C", REPO, "log", "--reverse", "--format=%ad", "--date=short"], capture_output=True, text=True).stdout.split("\n")[0].strip()
    # 最終案 17e：くらべる案なので、終わりのコミットの数も 17d の台本（final10.json）と同じにする（ちがうのは足した所だけ）
    # 2026-11-08（最終案 17f・17g：表示のボタンだけの直し）：GIT_KEEP=1 なら、17d の台本のコミットの数のままにする（直した所のほかは変えない）
    # 2026-11-08（作者の声：コミットの数は新しくなっているのでは）：17e の台本の数に止めるのは GIT_KEEP=1 のときだけ。ふだんは組む時の本当の数
    if os.environ.get("GIT_KEEP") == "1" and os.path.exists(os.path.join(HERE, "final10.json")):
        with open(os.path.join(HERE, "final10.json"), encoding="utf8") as f:
            g17d = json.load(f).get("git") or {}
        commits, first_day = g17d.get("commits", commits), g17d.get("first_day", first_day)
    doc = dict(
        fps=FPS,
        len=round(total * FPS) / FPS,
        pad={c: round(v, 3) for c, v in k.items()} if isinstance(k, dict) else round(k, 3),
        voice_own=own,
        voice=voice,
        scenes=scenes,
        chapters=ch_at,
        music=dict(sections=sections, end=round(total, 2)),
        foot=dict(finished=REAL_FIN, ring2=REAL_RING, kebori=REAL_KEBORI),
        git=dict(commits=commits, first_day=first_day),
    )
    if TAG and not V17E:
        print("注意：V17E=1 だが、撮った章 waza17e がない（zsh video/capture10.sh waza17e）", file=sys.stderr)
    with open(os.path.join(HERE, f"final10{TAG}.json"), "w", encoding="utf8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    vs = sum(durs[n] for n in VOICE)
    print(f"final10{TAG}.json：{total:.2f} 秒（声 {vs:.1f} 秒・間の倍率 {kk:.2f}・場面 {len(scenes)}・作者の録音 {own}/{len(VOICE)}）")
    for s in scenes:
        print(f"  {s['start']:7.2f} {s['len']:5.2f} {s['ch']:<4} {s['id']:<9} " + " ".join(f"n{v['n']}" for v in s["voice"]))


if __name__ == "__main__":
    main()
