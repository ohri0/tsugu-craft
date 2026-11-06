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
FOOT = os.path.join(WORK, "footage")
RAW = os.path.join(FOOT, "raw")
FPS = 30
TARGET = float(os.environ.get("TARGET", "179.5"))  # 全体の長さ（秒）。3:00 を越えない

# 声の表（番号は docs/NARRATION-ad.md と同じ。足す・変えるときは両方）
VOICE = {
    1: "私は、彫金の職人です。",
    2: "作れるかどうかの判断は、職人の頭の中にあります。",
    3: "職人がいなくなれば、その判断も消えます。",
    4: "継ぐ。職人の判断を、次の人へ。",
    5: "継ぐは、職人の言葉を受け取ります。",
    6: "Claude が読み取って、数字つきの決まりの案にします。",
    7: "職人が見てよければ、帳面に残ります。",
    10: "まず、デザインする人へ。",
    11: "作れない、と制作から何度も戻ってくることがあります。",
    13: "職人が残した言葉をもとに、Claude が、次の指輪を組みます。",
    15: "「ゴシックな感じ」と言葉で頼むだけで、職人の決まりを守った形になります。",
    18: "作れない所は、職人の言葉で教えます。",
    19: "なぜ作れないのか、どう直せばよいのかを。",
    20: "3D モデルをもとに、鋳造でも鍛造でも、作り方を自動で作ります。",
    21: "次に、学ぶ人へ。",
    22: "学校では、独自のデザインは、先生に聞くしかありません。",
    23: "長いときは 1 時間待ちます。",
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
    43: "このアプリも、私が Claude Code と作りました。",
}
# 最終案 10 で外した行（番号は詰めない）：n9・n12（図の字だけ残す）・n14・n25・n26・n31・n34・n38。
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
SCENES = [
    dict(id="flame", ch="序", v=[1], pre=2.2, post=1.4, xf=0),
    dict(id="hands0", ch="序", v=[2], pre=0.8, post=1.4, xf=0.9),
    dict(id="vanish10", ch="序", v=[3], pre=0.8, post=2.4, xf=0.9),
    dict(id="title10", ch="序", v=[4], pre=0.8, post=3.2, xf=0.8),
    # 残す：本物の画面（全体 → 確かめるを押す → 職人の言葉を入れる → Claude の案 → これでいい → 帳面に入る）
    dict(id="word10", ch="残す", v=[5, 6, 7], gap=1.2, pre=2.6, post=2.0, xf=1.0, dip=True),
    # 渡す 1：デザインする人へ。手で変える操作（声なし・見出し 1 つずつ）→ 言葉で頼む → 人が直す → 職人の言葉 → 図面と STL → 作り方
    dict(id="door1h", ch="渡す1", v=[10], pre=0.8, post=1.6, xf=1.0, dip=True),
    dict(id="flow11", ch="渡す1", v=[11], pre=0.6, post=5.6, xf=0.8, fixed=True),
    # 操作の結果が、次の場面に重ねて替わる前に 1 秒ほど見えるように（hold ＝ 結果の秒 ＋ 約 1.1 秒 ＋ 次の重ね）
    dict(id="shape11", ch="渡す1", v=[], hold=4.2, xf=0.8),
    dict(id="section11", ch="渡す1", v=[], hold=4.8, xf=0.6),
    dict(id="size11", ch="渡す1", v=[], hold=4.0, xf=0.6),
    dict(id="measure11", ch="渡す1", v=[], hold=4.85, xf=0.6),
    dict(id="firstnow10", ch="渡す1", v=[13], pre=1.2, post=2.0, xf=0.9),
    dict(id="gothic11", ch="渡す1", v=[15], pre=2.8, post=2.2, xf=0.8),
    dict(id="fix11", ch="渡す1", v=[18, 19], gap=1.2, pre=4.2, post=2.2, xf=0.8, fixed=True),
    dict(id="out11", ch="渡す1", v=[], hold=4.4, xf=0.8),
    dict(id="make10", ch="渡す1", v=[20], pre=1.8, post=2.4, xf=0.8),
] + ([dict(id="finished", ch="渡す1", v=[], hold=3.0, xf=0.8)] if REAL_FIN else []) + [
    dict(id="door2", ch="渡す2", v=[21], pre=0.8, post=1.6, xf=1.0, dip=True),
    dict(id="school10", ch="渡す2", v=[22, 23], gap=2.2, pre=0.8, post=2.2, xf=0.8),
    dict(id="learn10", ch="渡す2", v=[24], pre=2.2, post=2.6, xf=0.8),
    dict(id="door3h", ch="渡す3", v=[27], pre=0.8, post=3.0, xf=1.0, dip=True),
    dict(id="stat", ch="渡す3", v=[28], pre=1.4, post=1.6, xf=1.0),
    dict(id="naiku", ch="渡す3", v=[29], pre=0.8, post=1.6, xf=0.9),
    dict(id="kebori10", ch="渡す3", v=[30], pre=0.8, post=3.6, xf=0.9),
    # 途切れた技：木目金の鐔（n32・n33）→ 模様の試し（別の係の新しい頁。頁の全体の上で n37「11 のうち 9」→ 段が順に出る → 最後の 3 枚に寄って n39）
    dict(id="mokume11", ch="途絶え", v=[32, 33], gap=1.0, pre=0.9, post=1.6, xf=1.0, dip=True),
    dict(id="moyou11", ch="復元", v=[37, 39], pre=1.4, gap=2.6, post=1.6, xf=0.8, fixed=True),
    dict(id="shapes10", ch="結", v=[], hold=5.0, xf=1.0, dip=True),
    dict(id="finale", ch="結", v=[41], pre=1.0, post=1.8, xf=1.0),
    dict(id="title2", ch="結", v=[42], pre=1.0, post=2.2, xf=0.9),
    dict(id="credit", ch="結", v=[43], pre=0.8, post=1.4, xf=0.8),
    # 出典（作者の判断：途中の画面には出さず、最後にまとめて 2〜3 秒）
    dict(id="sources", ch="結", v=[], hold=4.0, xf=0.8),
]
FIXED_PRE = {"flame", "moyou11", "word10", "gothic11", "fix11", "make10", "learn10"}  # 声の前の間を、全体の倍率でのばし縮みしない場面（本物の画面は、まず全体 → 押す所を見せる時間。模様の試しは、最後の 3 枚が出てから n39）


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
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-af", f"{cut},loudnorm=I=-16:TP=-1.5", "-ar", "48000", "-ac", "2", dst], check=True)
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
        out.append(dict(id=sc["id"], ch=sc["ch"], start=start, len=ln, xf=round(xf * FPS) / FPS, dip=bool(sc.get("dip")), voice=voices))
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
    # 曲の区切り（bgm9.py の段の名前）
    # 山：模様の試しの、最後の 3 枚が出る所（n39 の少し前）
    moy = next(x for x in scenes if x["id"] == "moyou11")
    peak = moy["start"] + (moy["voice"][0]["at"] - 1.6 if moy["voice"] else 9.0)
    sections = [["intro", 0.0], ["main", ch_at["残す"]], ["thin", ch_at["渡す3"]], ["gap", ch_at["途絶え"]], ["build", ch_at["復元"]], ["peak", round(peak, 3)], ["end", ch_at["結"]]]
    commits = subprocess.run(["git", "-C", REPO, "rev-list", "--count", "HEAD"], capture_output=True, text=True).stdout.strip()
    first_day = subprocess.run(["git", "-C", REPO, "log", "--reverse", "--format=%ad", "--date=short"], capture_output=True, text=True).stdout.split("\n")[0].strip()
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
    with open(os.path.join(HERE, "final10.json"), "w", encoding="utf8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    vs = sum(durs[n] for n in VOICE)
    print(f"final10.json：{total:.2f} 秒（声 {vs:.1f} 秒・間の倍率 {kk:.2f}・場面 {len(scenes)}・作者の録音 {own}/{len(VOICE)}）")
    for s in scenes:
        print(f"  {s['start']:7.2f} {s['len']:5.2f} {s['ch']:<4} {s['id']:<9} " + " ".join(f"n{v['n']}" for v in s["voice"]))


if __name__ == "__main__":
    main()
