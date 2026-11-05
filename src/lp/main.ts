// 継ぐの入口のページ。話は動画と同じ：職人の判断を、次の人へ。序 → 残す → 渡す 3 つ（デザインする人・学ぶ人・次の時代）→ 結。
// 見た目は video/LOOK9.md（黒と紙、縦書きの明朝、細い線、字に金を使わない）。字は動かさず、濃くなるだけ。
// 書いてあることは、どれも今のアプリでできること。数字は、撮った画面の数字か、出典・記録のあるものだけ。
// 写真は public/lp/（scripts/lp-shots.cjs で撮る）と public/heritage/（README に出どころ）。3D は読み込まない。
import "./lp.css";
import { bindFlowMotion, flowBeforeSvg, HAKUSHO_URL, whyHtml } from "../studio/why";

const STUDIO = "studio.html";
const LEARN = "app.html#learn";
const WAZA = "app.html#waza";
const LEDGER = "app.html#ledger";
const RESTORE = "app.html#waza/restore";
const REBUILD_URL = "app.html#waza/rebuild";
/** 帳面の決まりの数（数字を書かず、はじめて開いた人に見えるリポジトリの帳面から数える） */

/** public/lp/ の写真。w・h は大きい方（2 倍）の画素。-sm は半分の幅 */
function shot(name: string, w: number, h: number, alt: string, sizes: string, eager = false): string {
  return `<img src="lp/${name}-sm.webp" srcset="lp/${name}-sm.webp ${Math.round(w / 2)}w, lp/${name}.webp ${w}w" sizes="${sizes}" width="${w / 2}" height="${h / 2}" alt="${alt}" ${eager ? `fetchpriority="high"` : `loading="lazy"`} decoding="async">`;
}
const heritage = (file: string, alt: string, w: number, h: number) =>
  `<img src="heritage/${file}" width="${w}" height="${h}" alt="${alt}" loading="lazy" decoding="async">`;

/** 章の扉。糸（細い線）と 3 つの目印。字は章ごとに右から左へ渡っていく */
function door(n: 1 | 2 | 3, id: string, title: string, inner = "", cls = ""): string {
  const marks = [3, 2, 1].map((m) => `<span class="${m === n ? "on" : ""}">${["一", "二", "三"][m - 1]}</span>`).join("");
  return `<header class="door d${n} ${cls}" id="${id}">
    ${inner}
    <div class="door-t"><p class="door-k">渡す</p><h2 class="v door-h rv">${title}</h2></div>
    <div class="thread rv" aria-hidden="true"><i></i>${marks}</div>
  </header>`;
}

/**
 * 力試しの答え合わせ（2026-11-04、木目金・品物だけの手がかり 9 で Claude が組み立てた回）。
 * 本当の作り方 11 工程（research/mokume/answer.md）のうち、どこにたどり着いたか。docs/LOG.md の記録と同じ
 */
const REBUILD: { t: string; d: string; v: "ok" | "part" | "miss" }[] = [
  { t: "地金を用意する", d: "銅、赤銅、銀、金、四分一など、色のちがう金属の板を、同じ大きさに切りそろえる。", v: "part" },
  { t: "面をみがく", d: "重ねる面をみがいて、きれいにする。さびや汚れは、つながりをじゃまする。", v: "ok" },
  { t: "色ちがいの板を交互に重ねる", d: "切りそろえた板を、色が交互になるように重ねる。", v: "ok" },
  { t: "重ねた板を締めつけて固定する", d: "二枚の鉄の板ではさみ、太い鉄の針金で縛る。", v: "miss" },
  { t: "熱して、ろうを使わずにつなぐ", d: "木炭の火床で熱する。金属ごとにとける温度がちがうので、経験に裏打ちされた高い技がいる。", v: "part" },
  { t: "火から出してすぐ叩き、つながりを仕上げる", d: "地金を火床から出し、金床の上で金づちで叩く。", v: "miss" },
  { t: "叩いて薄くのばす", d: "鍛えて圧し、焼きなましをくり返して、板にのばす。", v: "ok" },
  { t: "表面を彫って、下の層を出す", d: "鏨で表面を彫り、下の層を出す。", v: "ok" },
  { t: "また叩いて平らにする", d: "溝の深さと形が、同心円のような色の帯になって表に出る。彫る・平らにするを、くり返す。", v: "part" },
  { t: "品物の形にする", d: "鐔などの刀の金具の形に切り出す。器なら、板を金づちで打ち絞って形を作る。", v: "ok" },
  { t: "仕上げて、煮色で色を出す", d: "みがいたあと、硫酸銅と緑青をとかした水で煮る。赤銅は黒、四分一は灰色、銅は赤茶色になり、層の色の差がはっきりする。", v: "ok" },
];
const RV_LABEL = { ok: "一致", part: "一部", miss: "たどり着けず" } as const;

/** テンションの比べ（三角の石 8.88 × 7.52 × 4.24 mm、設計の画面の札と同じ計算の値。決まった値ではない。作者：「この石の場合、という話」） */
const TENSION_EXAMPLE: { metal: string; small?: string; open?: string; note?: string }[] = [
  { metal: "K18 イエロー", small: "0.36", open: "1.66" },
  { metal: "Pt900", note: "足りない（戻りきらず、約 0.60 mm 曲がったまま）" },
  { metal: "SV925", small: "0.12", open: "1.42" },
];

const MET = "メトロポリタン美術館";
const CREDITS: { what: string; src: string; href: string; lic: string }[] = [
  { what: "糸巻太刀拵（江戸時代）", src: MET, href: "https://www.metmuseum.org/art/collection/search/894754", lic: "CC0" },
  { what: "小柄（18 世紀）", src: MET, href: "https://www.metmuseum.org/art/collection/search/24755", lic: "CC0" },
  { what: "目貫（17 世紀）", src: MET, href: "https://www.metmuseum.org/art/collection/search/24733", lic: "CC0" },
  { what: "頭（江戸時代）", src: MET, href: "https://www.metmuseum.org/art/collection/search/34756", lic: "CC0" },
  { what: "鯉と藻の鐔", src: MET, href: "https://commons.wikimedia.org/wiki/File:%E8%97%BB%E9%AF%89%E5%9B%B3%E9%90%94,_Sword_Guard_(Tsuba)_with_the_Carp_and_Seaweed_Motif.jpg", lic: "CC0" },
  { what: "木目金の鐔 2 点（19 世紀。地を黒に抜いた）", src: MET, href: "https://www.metmuseum.org/art/collection/search/34992", lic: "CC0" },
  { what: "1953 年の内宮", src: "本田照夫 撮影、Wikimedia Commons", href: "https://commons.wikimedia.org/wiki/File:Ise_Shrine_Naiku_1953-8-26_cropped.jpg", lic: "パブリックドメイン" },
  { what: "内宮御神宝図（部分）", src: "国立国会図書館、Wikimedia Commons", href: "https://commons.wikimedia.org/wiki/File:NDL2574228_%E5%86%85%E5%AE%AE%E5%BE%A1%E7%A5%9E%E5%AE%9D%E5%9B%B3.(1).pdf", lic: "パブリックドメイン" },
];

const html = `
<a class="skip" href="#main">本文へ</a>
<header class="hd">
  <a class="brand" href="./" aria-label="継ぐ　はじめのページ">継ぐ</a>
  <nav class="nav" aria-label="ページの中">
    <a href="#keep" class="hide-sm">残す</a>
    <a href="#design" class="hide-sm">デザインする人へ</a>
    <a href="#learn" class="hide-sm">学ぶ人へ</a>
    <a href="#next" class="hide-sm">次の時代へ</a>
    <a href="#why" class="open-why">なぜ継ぐ</a>
    <a class="go" href="${STUDIO}">設計する</a>
  </nav>
</header>

<main id="main">
  <section class="hero" aria-labelledby="hero-h">
    <figure class="hero-ring">
      <picture><source media="(max-width: 760px)" srcset="lp/ring-whole-sm.webp 1000w, lp/ring-whole.webp 2000w" sizes="100vw" width="1000" height="1200">
      ${shot("ring-macro", 3200, 2000, "継ぐで組んだ一粒石の指輪。三角の石を、金の爪 3 本が留めている", "100vw", true)}</picture>
    </figure>
    <div class="hero-t">
      <h1 id="hero-h" class="v hero-h">継ぐ</h1>
      <p class="v hero-s">職人の判断を、<br>次の人へ。</p>
    </div>
    <div class="hero-b">
      <p>宝飾の彫金職人が、Claude Code と作りました。</p>
      <div class="cta"><a class="btn primary" href="${STUDIO}">設計する</a><a class="btn open-why" href="#why">なぜ継ぐ</a></div>
    </div>
  </section>

  <section class="prologue" aria-label="はじめに">
    <div class="pro-v">
      <p class="v pro-1 rv">作れるかどうかの判断は、<br>職人の頭の中にあります。</p>
      <p class="v pro-2 rv">職人がいなくなれば、<br>その判断も</p>
      <p class="v pro-3 rv">消えます。</p>
    </div>
    <p class="pro-b rv">継ぐは、その判断を残して、次の人へ渡す道具です。残すのは職人の言葉。渡す先は 3 つ。デザインする人、学ぶ人、そして次の時代です。</p>
  </section>

  <section class="keep" id="keep" aria-labelledby="keep-h">
    <div class="paper-ruled">
      <div class="keep-q">
        <p class="say-k">職人の言葉</p>
        <blockquote class="v say-q rv">このサイズの石なら、<br>最低ライン 0.7 ミリは<br>欲しい感じ。</blockquote>
      </div>
      <div class="keep-t">
        <h2 id="keep-h" class="v keep-h rv">残す</h2>
        <ol class="keep-steps">
          <li class="rv"><b>一</b>継ぐは、職人の言葉を受け取ります。話しても、書いても。</li>
          <li class="rv"><b>二</b>Claude が言葉を読み取り、数字つきの決まりの案にします。</li>
          <li class="rv"><b>三</b>職人が案を見て「これでいい」を押すと、帳面に残ります。だれの言葉か、いつの言葉かも一緒に。</li>
        </ol>
      </div>
    </div>
    <div class="keep-card">
      <figure class="rv">${shot("rule-card", 896, 542, "帳面の決まりの札。三角の石を 3 本爪で留めるときの決まりと、職人の言葉、職人の名前と日付", "(max-width: 760px) 92vw, 448px")}<figcaption>帳面の本物の札。決まり、職人の言葉、名前と日付。</figcaption></figure>
      <p class="keep-n rv">決まりには、職人の言葉と名前と日付が残ります。公開の資料から入れた目安には、出どころのリンクがつきます。資料に数字がない所は「仮」と書きます。<a href="${LEDGER}">帳面を見る</a></p>
    </div>
  </section>

  <section class="book" aria-labelledby="book-h">
    <h2 id="book-h" class="v book-h rv">決まりは、<br>工房ごとに持てます。</h2>
    <div class="book-two">
      <figure class="rv">${shot("book-a", 2000, 2000, "石川工房の帳面で組んだ指輪。細い丸い爪で、シンプルに見える", "(max-width: 760px) 92vw, 46vw")}<figcaption><b>石川工房</b><span>丸い爪 ø <span class="num">0.80</span> mm</span></figcaption></figure>
      <figure class="rv">${shot("book-b", 2000, 2000, "見本の工房 B の帳面で組んだ指輪。先が尖って石の上に少しかかる尖り爪で、シャープに見える", "(max-width: 760px) 92vw, 46vw")}<figcaption><b>工房 B（見本）</b><span>尖り爪 ø <span class="num">1.00</span> mm</span></figcaption></figure>
    </div>
    <p class="book-n rv">同じ石・同じ号で、帳面だけを変えて撮りました。帳面には、爪の形や太さといった、工房のいつもの雰囲気も入ります。あとで直せます。工房 B は見本の工房で、尖り爪（先が尖り、石の上に少しかかる爪）と太さは例です。数字は目安・最後は職人が決めます。</p>
  </section>

  ${door(1, "design", "デザインする人へ", `<figure class="door-draw">${shot("draw-views", 1460, 660, "継ぐが描いた図面の一部。指輪の正面図・側面図・上面図と寸法", "(max-width: 760px) 92vw, 56vw")}</figure>`)}

  <section class="sheet flow-sec" aria-label="行ったり来たり">
    <div class="flow-in">
      <p class="lede rv">作れない、と<wbr>制作から何度も<wbr>戻ってくることが<wbr>あります。</p>
      <div class="flow-fig rv">${flowBeforeSvg()}</div>
      <a class="more rv open-why" href="#why">この話を「なぜ継ぐ」で読む</a>
    </div>
  </section>

  <section class="word" aria-labelledby="word-h">
    <figure class="word-ring rv">${shot("ring-gothic", 2000, 2400, "言葉から腕の形まで組んだ指輪。稜線の立つ腕に、尖ったアーチの彫りが並び、下へ細くなる。白い地金にマーキスの石", "(max-width: 760px) 100vw, 56vw")}</figure>
    <div class="word-t">
      <p class="v word-q rv">「ゴシックな感じ」</p>
      <div class="word-b">
        <h2 id="word-h" class="rv">言葉で、<wbr>腕の形まで<wbr>変わる。</h2>
        <p class="rv">残した言葉から、Claude が、次の石の作りを推測します。石は手持ちの写真でも、よくある形からでも選べます。「ゴシックな感じ」と言葉で頼むと、断面の線、場所ごとの太さ、浅い彫りまで組み、職人の決まりで確かめて直します。</p>
        <p class="note rv">写真は、本物の Claude が組んだ時の断面・細り・彫りと同じ考えの数字で、撮り直したものです。</p>
      </div>
    </div>
  </section>

  <section class="sheet ask" aria-labelledby="ask-h">
    <div class="ask-in">
      <h2 id="ask-h" class="v ask-h rv">分からない所は、<br>職人に聞きます。</h2>
      <div class="ask-b">
        <figure class="rv">${shot("ask-card", 896, 310, "Claude から質問が 1 つあります：石の大きさが 5.5 mm くらいの石だと、爪の太さは最低何ミリにしますか？ 話して答える、書いて答える、あとで のボタン", "(max-width: 760px) 92vw, 448px")}</figure>
        <p class="rv">帳面のまだ決まっていない所を、Claude が見つけて聞きに来ます。答えると、それが決まりになります。</p>
        <p class="note rv">※ 決まりは、あとから編集できます。</p>
      </div>
    </div>
  </section>

  <section class="red" aria-labelledby="red-h">
    <figure class="red-ring rv">${shot("ring-red", 3200, 2000, "爪を細くした指輪。細すぎる爪 3 本が赤く光っている", "100vw")}</figure>
    <h2 id="red-h" class="v red-h rv">作れない所を、<br>職人の言葉で<br>教えます。</h2>
    <div class="red-b">
      <p class="rv">赤く光る所を押すと、なぜ作れないかを、その工房の職人の言葉で教えます。直し方のボタンを押すと、その場で直ります。</p>
      <figure class="rv"><picture><source media="(max-width: 760px)" srcset="lp/fixpop-pop-sm.webp 368w, lp/fixpop-pop.webp 736w" sizes="92vw" width="368" height="361">${shot("fixpop", 1624, 738, "赤く光る爪の指輪と、作れない所の窓。爪が細い 0.60 mm → 0.70 mm 以上、職人の言葉「このサイズの石なら最低ライン 0.7 mm は欲しい感じ」、爪を太くするボタン、まとめて直す、Claude で直す", "(max-width: 900px) 92vw, 860px")}</picture><figcaption>数字と言葉は、この工房の帳面から。数字は目安・最後は職人が決めます。</figcaption></figure>
    </div>
  </section>

  <section class="sheet make" id="make" aria-labelledby="make-h">
    <div class="make-head">
      <h2 id="make-h" class="rv">作り方まで、<wbr>提案します。</h2>
      <p class="rv">3D モデルをもとに、鋳造でも鍛造でも。工程ごとに、この形から計算した数字、温度の目安、道具が出ます。図面と作り方を印刷でき、STL も出せます。下は本物の中身です。点線の言葉は、押すと説明が開きます。数字は目安・最後は職人が決めます。</p>
    </div>
    <div class="make-live rv"><div class="mk-live" aria-live="polite"><p class="mk-loading">作り方を読み込んでいます…</p></div></div>
    <figure class="make-sheet rv">${shot("draw", 1944, 1404, "継ぐが描いた図面の全体。正面図・側面図・上面図と寸法、実物大の図、右下の表に石・号・地金・腕・留め方・尺度・日付", "(max-width: 760px) 92vw, 860px")}<figcaption>印刷すると、この図面と作り方が一緒に出ます。</figcaption></figure>
  </section>

  <section class="tension" aria-labelledby="ten-h">
    <figure class="ten-ring rv">${shot("ring-tension", 2000, 2400, "テンションの指輪。丸線の腕の端が、三角の石を両側から挟んでいる", "(max-width: 760px) 92vw, 44vw")}</figure>
    <div class="ten-b">
      <h2 id="ten-h" class="rv">地金ごとに、<wbr>どれだけ小さく作り、<wbr>どれだけ広げて入れるかを<wbr>計算します。</h2>
      <p class="rv">腕のばねで石を挟むテンションは、人がやると大変な計算です。石の形と地金によって、答えが変わります。継ぐは、組んだ形からその場で出します。</p>
      <table class="ten-t rv">
        <caption>この三角の石の場合の例（mm）</caption>
        <thead><tr><th scope="col">地金</th><th scope="col">小さく作る</th><th scope="col">広げて入れる</th></tr></thead>
        <tbody>
          ${TENSION_EXAMPLE.map((r) => `<tr><th scope="row">${r.metal}</th>${r.small ? `<td class="num">約 ${r.small}</td><td class="num">約 ${r.open}</td>` : `<td colspan="2">${r.note}</td>`}</tr>`).join("")}
        </tbody>
      </table>
      <p class="note rv">値は仮です。目安・最後は職人が決めます。くぼみや溝の深さも、石によって変わります。</p>
    </div>
  </section>

  <section class="band" aria-labelledby="band-h">
    <div class="band-t">
      <h2 id="band-h" class="rv">断面の形づくりも、<wbr>驚くほど<wbr>シンプルに。</h2>
      <p class="rv">今まで手間のかかった断面の形も、見本を選ぶか、線を描くだけで作れます。上と下で変えることもできます。</p>
    </div>
    <div class="band-p">
      <figure class="rv">${shot("band-a", 2000, 2000, "断面が山形の、地金のみの指輪", "(max-width: 760px) 46vw, 30vw")}<figcaption>山形</figcaption></figure>
      <figure class="rv">${shot("band-b", 2000, 2000, "断面が段つきの、地金のみの指輪", "(max-width: 760px) 46vw, 30vw")}<figcaption>段つき</figcaption></figure>
      <figure class="band-grid rv">${shot("band-grid", 622, 382, "断面の見本の欄。甲丸、かまぼこ、平甲丸、平打ち、角、丸線、面取り、山形、V 溝、段つき、くぼみ、手で描く", "(max-width: 760px) 92vw, 30vw")}</figure>
    </div>
  </section>

  ${door(2, "learn", "学ぶ人へ")}

  <section class="wait" aria-labelledby="wait-h">
    <div class="wait-big rv" aria-hidden="true">${Array.from({ length: 24 }, () => "<i></i>").join("")}</div>
    <h2 id="wait-h" class="rv">長いときは、<br><span class="big">1 時間</span>待ちます。</h2>
    <p class="rv">学校では、独自のデザインは、先生に聞くしかありません（職人の経験です）。継ぐなら、すぐ答えが出ます。答えには、理由と、もとになった職人の言葉がついています。</p>
  </section>

  <section class="learn-sec" aria-label="学ぶの画面">
    <figure class="learn-shot rv">${shot("learn", 960, 997, "学ぶの画面。9 mm の石の爪は？ という問いに、爪の太さは最低 0.71 mm です、と答え、理由と職人の言葉と決まりの名前が続く", "(max-width: 760px) 92vw, 440px")}<figcaption>「9 mm の石の爪は？」。帳面の線から答えました（Claude なしでも答えます）。</figcaption></figure>
    <div class="learn-b">
      <p class="v learn-v rv">手の感覚は、<br>人から。</p>
      <div>
        <p class="rv">工房では、先輩の手を止めずに、手順や数字を確かめられます。先輩や先生には、まだ言葉にできない手の感覚を聞きます。</p>
        <p class="rv">覆輪留め・ミル打ち・槌目・鏨彫り・布目象嵌・木目金。どの技も、作り方と職人の決まりが同じ形で読めます。帳面に足りない所は、Claude が職人に聞きに来ます。</p>
        <p class="links rv"><a href="${LEARN}">学ぶ</a><a href="${WAZA}">技を見る</a></p>
      </div>
    </div>
  </section>

  ${door(3, "next", "次の時代へ", `<figure class="door-tsuba">${heritage("mokume-tsuba-2-black.jpg", "木目金の鐔。赤茶と黒の層が、木の年輪のような模様を作っている", 1400, 1400)}</figure>`)}

  <section class="stat" aria-labelledby="stat-h">
    <h2 id="stat-h" class="rv">伝統的工芸品の作り手は、</h2>
    <p class="stat-n rv">約 <span class="num">6</span> 割</p>
    <p class="stat-e rv">減りました。</p>
    <div class="stat-line rv" aria-hidden="true"><i></i></div>
    <p class="stat-t rv">従業員は約 <span class="num">11.5</span> 万人（<span class="num">1998</span> 年度）から、約 <span class="num">4.8</span> 万人（<span class="num">2022</span> 年度）に。</p>
    <p class="src rv">出典：<a href="https://www.bunka.go.jp/seisaku/bunkashingikai/bunkazai/kikaku/r07_r08/05/pdf/94408301_03.pdf" target="_blank" rel="noopener">経済産業省 説明資料（文化庁サイト掲載の PDF）</a></p>
  </section>

  <section class="naiku" aria-labelledby="naiku-h">
    <figure class="naiku-ph">${heritage("naiku-1953.jpg", "1953 年の内宮を空から撮った写真。上が新しい殿舎、下がそれまでの殿舎", 1600, 1067)}</figure>
    <h2 id="naiku-h" class="v naiku-h rv">20 年に一度しか、<br>受け継ぐ機会が<br>ない技もあります。</h2>
    <div class="naiku-b">
      <p class="rv">伊勢神宮の式年遷宮では、社殿も御装束神宝も、20 年に一度、すべて新しく作り直されます。遷宮に関わる技能者が携われるのは、多い人で <span class="num">3</span> 回ほどです。</p>
      <p class="src rv">出典：<a href="${HAKUSHO_URL}" target="_blank" rel="noopener">国土交通白書 平成 26 年版のコラム</a>（社殿を作る技能者の話）。写真は 1953 年の内宮。上が新しい殿舎、下がそれまでの殿舎。本田照夫 撮影・パブリックドメイン。</p>
      <figure class="naiku-zu rv">${heritage("goshinpo-gyokuhai.jpg", "内宮御神宝図の一部。玉と金の飾りをつないだ玉佩の絵", 1800, 793)}<figcaption>神宝の一つ、玉佩を描いた図。内宮御神宝図（部分。江戸時代の写し）、国立国会図書館所蔵・パブリックドメイン。</figcaption></figure>
    </div>
  </section>

  <section class="craft" aria-labelledby="craft-h">
    <figure class="craft-wide rv">${heritage("itomaki-tachi-wide.jpg", "糸巻太刀拵の全体。金の鞘に唐草と家紋、金の鐔と飾り金具", 1800, 780)}</figure>
    <div class="craft-t">
      <h2 id="craft-h" class="rv">こうした彫金の技も、<br>継ぐで、次へ残せます。</h2>
      <p class="rv">刀の金具も、ジュエリーと同じ彫金・金工の技で作られます。技ごとに帳面を持ち、作り方と職人の判断を残します。</p>
    </div>
    <figure class="craft-strip rv">${heritage("kozuka-carp.jpg", "小柄に寄ったところ。細かな地の上に、金の鯉と波", 1800, 436)}</figure>
    <div class="craft-three">
      <figure class="rv">${heritage("menuki-tiger.jpg", "金の目貫。竹の葉と虎。虎の毛が細い線で刻まれている", 1400, 619)}<figcaption>目貫（めぬき＝柄の飾り金具）</figcaption></figure>
      <figure class="rv">${heritage("kashira-dragon.jpg", "黒い地に金を入れた頭。龍の顔", 1000, 1329)}<figcaption>頭（かしら＝柄の先の金具）</figcaption></figure>
      <figure class="rv">${heritage("tsuba-carp.jpg", "鯉と藻の彫りのある鐔", 900, 958)}<figcaption>鐔</figcaption></figure>
    </div>
    <p class="src rv">上から、糸巻太刀拵（江戸時代）、小柄（こづか＝小刀の柄。18 世紀）、目貫（17 世紀）、頭（江戸時代）、鯉と藻の鐔。いずれもメトロポリタン美術館・CC0。</p>
  </section>

  <section class="restore" id="restore" aria-labelledby="restore-h">
    <figure class="restore-ts">${heritage("mokume-tsuba-1-black.jpg", "木目金の鐔の別の一枚", 1352, 1400)}</figure>
    <div class="restore-t">
      <p class="v restore-v rv">もし途絶えて<br>しまっても。</p>
      <div>
        <h2 id="restore-h" class="rv">手がかりと、<wbr>職人の帳面から、<wbr>組み立て直す。</h2>
        <p class="rv">途切れた技を組み立て直すとき、残った手がかりと、職人の帳面や記録を Claude に渡します。職人が試して確かめ、確かになった工程だけを残します。</p>
      </div>
    </div>
    <div class="score">
      <p class="rv">力を試すために、答えの分かっている江戸時代の刀の飾りの技、木目金で、作り方を隠し、手がかりだけを渡しました。</p>
      <p class="score-n rv"><span class="num">11</span> のうち <span class="num">9</span></p>
      <p class="rv">隠しておいた本当の <span class="num">11</span> の手順と比べると、<span class="num">9</span> にたどり着きました（一致 <span class="num">6</span>・一部 <span class="num">3</span>）。</p>
      <div class="lines rv" role="img" aria-label="11 本の線のうち、6 本が一致、3 本が一部、2 本がたどり着けず">${REBUILD.map((s) => `<i class="${s.v}"></i>`).join("")}</div>
      <details class="score-d rv"><summary>11 の手順を見る</summary><ol>${REBUILD.map((s) => `<li class="${s.v}"><p><b>${s.t}</b>${s.d}</p><span>${RV_LABEL[s.v]}</span></li>`).join("")}</ol></details>
      <p class="src rv">2026-11-04 に Claude が組み立てた回の答え合わせ。9 のうち 3 は、手がかりではなく Claude がもともと知っていたことから、と分けて数えています。この力試しに、職人の帳面は渡していません。<a href="${REBUILD_URL}">力試しを開く</a></p>
    </div>
    <div class="own">
      <div class="own-t">
        <h3 class="rv">本番は、<wbr>自分の技で。</h3>
        <p class="rv">答えのない技に使います。残った品物、古い記録、職人の帳面や見立てを渡すと、Claude が工程の案を作ります。もとにしたもの、まだ分からないこと、危ない所が工程ごとに並びます。職人が試した結果を書くと、案が組み直されます。うまくいった工程は、職人が確かめて、その技の決まりになります。</p>
        <p class="note rv">案は、試して確かめるためのものです。最後は職人が試して決めます。</p>
        <p class="links rv"><a href="${RESTORE}">自分の技を組み立て直す</a></p>
      </div>
      
    </div>
    <div class="own-shots">
      <figure class="own-flow rv">${shot("restore-flow", 960, 245, "途切れた技の流れ。分かることを入れる、Claude が作り方の案を出す、試して結果を入れる", "(max-width: 760px) 92vw, 760px")}</figure>
      <figure class="own-step rv">${shot("restore-step", 960, 871, "工程の案の 1 つ。灰を洗う。もとにしたもの、危ない所", "(max-width: 760px) 92vw, 600px")}<figcaption>作り話の例で見た、工程の案。</figcaption></figure>
    </div>
    <p class="restore-e rv">公開の情報や、職人の帳面・記録をもとに、失われた技も、組み立て直せるかもしれません。</p>
  </section>

  <section class="sheet ifever" aria-label="工房に">
    <p class="v ifever-v rv">工房に入れておけば、<br>万が一の時に役立ちます。</p>
  </section>

  <section class="stance" aria-labelledby="stance-h">
    <h2 id="stance-h" class="rv">決めるのは、<wbr>職人です。</h2>
    <p class="rv">Claude は職人の決まりを読み、案を出し、理由を残します。</p>
    <p class="note rv"><a href="https://github.com/ohri0/tsugu-craft#readme" rel="noopener">このアプリの作り方（GitHub）</a></p>
  </section>

  <section class="end" aria-labelledby="end-h">
    <h2 id="end-h" class="v end-h rv">職人の判断を、<br>次の人へ。</h2>
    <p class="v end-t rv">継ぐ</p>
    <div class="cta rv">
      <a class="btn primary" href="${STUDIO}">設計する</a>
      <a class="btn" href="${LEDGER}">帳面</a>
      <a class="btn" href="${LEARN}">学ぶ</a>
      <a class="btn" href="${WAZA}">技</a>
    </div>
    <p class="end-n note rv">公開の版は、開くときに合言葉を聞きます。</p>
  </section>
</main>

<footer class="ft">
  <div class="ft-in">
    <p class="ft-top"><span class="brand">継ぐ</span><a href="https://github.com/ohri0/tsugu-craft" rel="noopener">GitHub</a></p>
    <p>指輪・図面・帳面などの写真は、継ぐの画面を撮ったものです。品物の写真：</p>
    <ul class="credits">${CREDITS.map((c) => `<li>${c.what} ― ${c.src}、<a href="${c.href}" rel="noopener">出典</a>（${c.lic}）</li>`).join("")}</ul>
    <p>ライブラリとフォントのライセンスは GitHub の README に。継ぐは MIT ライセンスです。</p>
  </div>
</footer>`;

const root = document.getElementById("lp")!;
root.innerHTML = html;
bindFlowMotion(root);

// 字は動かさず、濃くなるだけ（動きを減らす設定なら、はじめから全部見せる）
const els = [...root.querySelectorAll<HTMLElement>(".rv")];
if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
  els.forEach((e) => e.classList.add("in"));
} else {
  const io = new IntersectionObserver(
    (es) => {
      for (const e of es) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -5% 0px", threshold: 0.05 },
  );
  els.forEach((e) => io.observe(e));
}

// なぜ継ぐ：入口のページの上に開く（合言葉なしで読める）。アドレスは #why
function openWhy() {
  let el = document.querySelector<HTMLElement>(".why");
  if (!el) {
    el = document.createElement("div");
    el.className = "why";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "なぜ継ぐ");
    el.tabIndex = -1;
    el.innerHTML = whyHtml({ standalone: true });
    bindFlowMotion(el);
    document.body.appendChild(el);
    el.querySelector(".why-close")!.addEventListener("click", closeWhy);
  }
  el.hidden = false;
  el.scrollTop = 0;
  document.documentElement.style.overflow = "hidden";
  el.focus({ preventScroll: true });
}
function closeWhy() {
  const el = document.querySelector<HTMLElement>(".why");
  if (el) el.hidden = true;
  document.documentElement.style.overflow = "";
  if (location.hash === "#why") history.replaceState(null, "", location.pathname + location.search);
}
root.querySelectorAll<HTMLAnchorElement>(".open-why").forEach((a) =>
  a.addEventListener("click", (e) => {
    e.preventDefault();
    history.replaceState(null, "", "#why");
    openWhy();
  }),
);
addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeWhy();
});
if (location.hash === "#why") openWhy();

// 手順の札：設計の画面の「手順」と同じ中身（scripts/lp-shots.cjs の steps が JSON にした物）。鍛造・鋳造を押して切り替える。
// 流れを文で読む。点線の言葉を押すと、その行のすぐ下に説明が開き、もう一度押すと閉じる（設計の画面と同じことば帳。src/studio/cards.ts）。開くのは 1 つだけ
interface MkLine { g?: string; t?: string }
interface MkCard { no: string; title: string; lead: string; rows: [string, string][]; watch: string; tools: string[]; more: MkLine[] }
const MK_LABEL: Record<string, string> = { hand: "鍛造", cast: "鋳造" };
const escH = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
type Cards = typeof import("../studio/cards");
function mkCards(list: MkCard[], method: string, words: Cards): string {
  return `<ol class="mk-cards">${list
    .map((c) => {
      const seen = new Set<string>();
      const mark = (t: string) => words.markTerms(escH(t), seen);
      // 道具の文は設計の画面と同じ（src/studio/cards.ts の FLOW_TOOLS）。文に出てこない道具は、札の最後に一言で
      const added = words.flowToolsFor(c.title, method);
      const said = c.lead + added + c.more.map((l) => l.g ?? l.t ?? "").join("") + c.watch;
      const rest = c.tools.filter((t) => !said.includes(t));
      const head = mark(c.lead);
      const addHtml = added ? `<li>${mark(added)}</li>` : "";
      return `<li class="mk-c">
      <div class="mk-h"><span class="mk-n">${escH(c.no)}</span><div><h3>${escH(c.title)}</h3><p>${head}</p></div></div>
      ${c.rows.length ? `<dl class="mk-rows">${c.rows.map(([k, v]) => `<div><dt>${escH(k)}</dt><dd>${escH(v)}</dd></div>`).join("")}</dl>` : ""}
      ${addHtml || c.more.length ? `<ul class="mk-flow">${addHtml}${c.more.map((l) => (l.g ? `<li class="g">${mark(l.g)}</li>` : `<li>${mark(l.t ?? "")}</li>`)).join("")}</ul>` : ""}
      ${c.watch ? `<p class="mk-watch">${mark(c.watch)}</p>` : ""}
      ${rest.length ? `<p class="mk-tools">ほかに使う道具：${mark(rest.join("、"))}</p>` : ""}
    </li>`;
    })
    .join("")}</ol>`;
}
function termBox(word: string, words: Cards): HTMLElement | null {
  const g = words.glossOf(word);
  if (!g) return null;
  const el = document.createElement("div");
  el.className = "term-def";
  el.dataset.term = word;
  const t = g.tool;
  el.innerHTML = `<p class="td-h"><b>${escH(g.word)}</b>${g.reading ? `<small>${escH(g.reading)}</small>` : ""}</p>
    <p>${escH(g.meaning)}</p>${t && t.what !== g.meaning ? `<p>${escH(t.what)}</p>` : ""}
    ${t ? `<ol>${t.how.map((h) => `<li>${escH(h)}</li>`).join("")}</ol>` : ""}`;
  return el;
}
async function mountMake() {
  const box = root.querySelector<HTMLElement>(".mk-live");
  if (!box) return;
  try {
    const [d, words]: [{ methods: Record<string, MkCard[]> }, Cards] = await Promise.all([fetch("lp/make-steps.json").then((r) => r.json()), import("../studio/cards")]);
    let m = "hand";
    const stone = d.methods.hand[0]?.rows.find((r) => r[0] === "石")?.[1] ?? "";
    const gou = d.methods.hand[0]?.rows.find((r) => r[0] === "号")?.[1] ?? "";
    const draw = () => {
      box.innerHTML = `<div class="mk-top"><div class="mk-seg" role="group" aria-label="作り方">${Object.keys(d.methods).map((k) => `<button type="button" data-m="${k}" aria-pressed="${k === m}">${MK_LABEL[k] ?? k}</button>`).join("")}</div><small>見本：三角の石 ${escH(stone)} ・ ${escH(gou)}</small></div>
        ${mkCards(d.methods[m], m, words)}`;
      box.querySelectorAll<HTMLButtonElement>(".mk-seg button").forEach((b) =>
        b.addEventListener("click", () => {
          if (b.dataset.m === m) return;
          m = b.dataset.m!;
          draw();
          box.querySelector<HTMLButtonElement>(`.mk-seg [data-m="${m}"]`)?.focus();
        }),
      );
    };
    // 言葉を押す：その行のすぐ下に開く。ほかに開いていたら閉じる
    box.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".term");
      if (!b) return;
      const wasOpen = b.getAttribute("aria-expanded") === "true";
      box.querySelectorAll(".term-def").forEach((x) => x.remove());
      box.querySelectorAll(".term[aria-expanded]").forEach((x) => x.removeAttribute("aria-expanded"));
      if (wasOpen) return;
      const el = termBox(b.dataset.term!, words);
      if (!el) return;
      b.setAttribute("aria-expanded", "true");
      const line = b.closest<HTMLElement>("li:not(.mk-c), p")!;
      if (line.tagName === "LI") line.appendChild(el);
      else line.after(el);
    });
    draw();
  } catch {
    box.innerHTML = `<p class="mk-loading">作り方を読み込めませんでした。<a href="${STUDIO}">設計の画面</a>の「手順」で見られます。</p>`;
  }
}
mountMake();

// 上の帯：少し下にスクロールしたら、背景を濃くする
const hd = root.querySelector<HTMLElement>(".hd")!;
const onScroll = () => hd.classList.toggle("solid", scrollY > 24);
addEventListener("scroll", onScroll, { passive: true });
onScroll();
