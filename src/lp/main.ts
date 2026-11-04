// 継ぐの入口のページ。黒の上に、大きく細い見出しと、継ぐの本物の画面の写真（public/lp/、scripts/lp-shots.cjs で撮る）。
// 書いてあることは、どれも今のアプリでできること。数字は、撮った画面の数字か、出典・記録のあるものだけ。
// 3D は読み込まない（軽く速く）。写真は 2 倍の細かさの webp で、見える所に来てから読む。
import "./lp.css";

const STUDIO = "studio.html";
const WAZA = "app.html#waza";

const arrow = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>`;

/** public/lp/ の写真。w・h は大きい方（2 倍）の画素。-sm は半分の幅 */
function shot(name: string, w: number, h: number, alt: string, sizes: string, eager = false): string {
  return `<img src="lp/${name}-sm.webp" srcset="lp/${name}-sm.webp ${w / 2}w, lp/${name}.webp ${w}w" sizes="${sizes}" width="${w / 2}" height="${h / 2}" alt="${alt}" ${eager ? `fetchpriority="high"` : `loading="lazy"`} decoding="async">`;
}

const CHOICES: { name: string; label: string; v: string; alt: string }[] = [
  { name: "c-stone5", label: "石の大きさ", v: "5 mm", alt: "長辺 5 mm の三角の石の指輪。石に合わせて、枠と爪も小さく組み直されている" },
  { name: "c-stone10", label: "石の大きさ", v: "10 mm", alt: "長辺 10 mm の三角の石の指輪" },
  { name: "c-hira", label: "腕の断面", v: "平打ち", alt: "腕の断面が平打ちの指輪" },
  { name: "c-free", label: "腕の断面", v: "手で描く", alt: "腕の断面を手で描いた指輪。腕に二本の筋が通っている" },
  { name: "c-bezel", label: "留め方", v: "覆輪", alt: "石の縁を地金の壁で包む、覆輪留めの指輪" },
  { name: "c-pt", label: "地金", v: "Pt900", alt: "白い地金（プラチナ）の指輪" },
];

/**
 * 組み立て直すの答え合わせ（2026-11-04、木目金・品物だけの手がかり 9 で Claude が組み立てた回）。
 * 本当の作り方 11 工程（research/mokume/answer.md）のうち、どこにたどり着いたか。docs/LOG.md の記録と同じ
 */
const REBUILD: { id: string; t: string; v: "ok" | "part" | "miss" }[] = [
  { id: "A1", t: "地金を用意する", v: "part" },
  { id: "A2", t: "面をみがく", v: "ok" },
  { id: "A3", t: "色ちがいの板を交互に重ねる", v: "ok" },
  { id: "A4", t: "重ねた板を締めつけて固定する", v: "miss" },
  { id: "A5", t: "熱して、ろうを使わずにつなぐ", v: "part" },
  { id: "A6", t: "火から出してすぐ叩き、つながりを仕上げる", v: "miss" },
  { id: "A7", t: "叩いて薄くのばす", v: "ok" },
  { id: "A8", t: "表面を彫って、下の層を出す", v: "ok" },
  { id: "A9", t: "また叩いて平らにする", v: "part" },
  { id: "A10", t: "品物の形にする", v: "ok" },
  { id: "A11", t: "仕上げて、煮色で色を出す", v: "ok" },
];
const RV_LABEL = { ok: "一致", part: "一部", miss: "たどり着けず" } as const;

const CLAUDE_USES: [string, string][] = [
  ["Claude Code", "開発の中心。仕様と決まりを読み、作者と話しながら、画面・形の処理・確かめる決まり・MCP を書いた。うまくいかなかったことも記録に残した。"],
  ["Skill", "職人の目安を一か所に。開発中の Claude も、アプリの中の Claude も、同じ目安を読む。"],
  ["フック", "API キーがまぎれこむのを止める。形の処理を直したら、テストを回す。"],
  ["サブエージェント", "互いに触らない部品を、別の作業場所で同時に作り、取り込んだ。"],
  ["MCP", "職人がふだん使う Claude のアプリから、帳面を読む・決まりを足す・指輪を組んで確かめる。"],
  ["アプリの中の Claude", "職人の言葉を決まりの案にする。指輪ぜんたいを読んで直す。まだ決まっていない所を聞く。途切れた技を手がかりから組み立てる。"],
];

const CREDITS: { file: string; what: string; src: string; href: string; lic: string }[] = [
  { file: "tsuba-carp.jpg", what: "鯉と藻の鐔", src: "メトロポリタン美術館", href: "https://commons.wikimedia.org/wiki/File:%E8%97%BB%E9%AF%89%E5%9B%B3%E9%90%94,_Sword_Guard_(Tsuba)_with_the_Carp_and_Seaweed_Motif.jpg", lic: "CC0" },
  { file: "kazari-tachi.jpg", what: "飾太刀（平安時代。一部を切り出し）", src: "東京国立博物館（ColBase）", href: "https://colbase.nich.go.jp/collection_items/tnm/F-356", lic: "CC BY 4.0" },
];

const heritage = (file: string, alt: string, w: number, h: number) =>
  `<img src="heritage/${file}" width="${w}" height="${h}" alt="${alt}" loading="lazy" decoding="async">`;

const html = `
<a class="skip" href="#main">本文へ</a>
<header class="hd">
  <div class="hd-in">
    <a class="brand" href="./" aria-label="継ぐ　はじめのページ"><span class="logo" aria-hidden="true">継</span>継ぐ</a>
    <nav class="nav" aria-label="ページの中">
      <a href="#rule" class="hide-sm">一文で</a>
      <a href="#check" class="hide-sm">作れない所</a>
      <a href="#ledger" class="hide-sm">帳面</a>
      <a href="#rebuild" class="hide-sm">組み立て直す</a>
      <a class="pill" href="${STUDIO}">設計する</a>
    </nav>
  </div>
</header>

<main id="main">
  <section class="hero" aria-labelledby="hero-h">
    <p class="eyebrow rv">宝飾の彫金職人が、Claude と作りました</p>
    <h1 id="hero-h" class="rv"><span class="ln"><span>職人の判断を、</span><span>蓄える。</span></span><span class="ln"><span>失われた技まで、</span><span>組み立て直す。</span></span></h1>
    <p class="lead rv">職人が話した一文が、工房の帳面の決まりになる。<br class="br-wide">その決まりで、だれの設計も、その場で確かめて直せる。</p>
    <div class="cta rv">
      <a class="btn primary" href="${STUDIO}">設計する ${arrow}</a>
      <a class="btn" href="${WAZA}">技を見る ${arrow}</a>
    </div>
    <figure class="hero-shot rv zoom">
      <picture><source media="(max-width: 600px)" srcset="lp/hero-phone-sm.webp 390w, lp/hero-phone.webp 780w" sizes="340px" width="390" height="844">
      ${shot("hero", 2880, 1800, "継ぐの「見せる」の画面。黒の上に金色の三角の石の指輪。左に、石・爪・腕・地金・号・確かめの本物の数字と、職人の言葉「このサイズの石なら最低ライン 0.7 mm は欲しい感じ」", "(max-width: 1200px) 100vw, 1200px", true)}</picture>
      <figcaption>「見せる」の画面。数字と職人の言葉は、組んだ指輪から読んでいます。</figcaption>
    </figure>
  </section>

  <section class="sec" id="rule" aria-labelledby="rule-h">
    <div class="head">
      <p class="k rv">一文の決まり</p>
      <h2 id="rule-h" class="rv">職人の一文で、<br>指輪が変わる。</h2>
      <p class="body rv">職人が話した一文を、Claude が帳面の決まり（何の値を・いくつに・だれの言葉で）にします。「これでいい」を押すと、いまの指輪をその決まりで組み直し、確かめ直します。</p>
    </div>
    <div class="ba">
      <figure class="ba-card rv">
        ${shot("before", 1440, 1600, "公開の資料の目安だけの帳面で組んだ指輪。爪が太く、丸い玉のように目立つ", "(max-width: 760px) 92vw, 560px")}
        <figcaption><span class="tag">前</span><b>公開の資料だけの帳面</b><span class="v">爪 <span class="num">ø 1.66 mm</span> ・ 地金 約 <span class="num">3.2 g</span></span></figcaption>
      </figure>
      <figure class="ba-card rv" style="--d:100ms">
        ${shot("after", 1440, 1600, "職人の決まりを足した帳面で組み直した指輪。爪が細く、石がよく見える", "(max-width: 760px) 92vw, 560px")}
        <figcaption><span class="tag gold">後</span><b>職人の一文を足した帳面</b><span class="v">爪 <span class="num">ø 0.80 mm</span> ・ 地金 約 <span class="num">2.5 g</span></span></figcaption>
      </figure>
    </div>
    <blockquote class="say rv"><p><span class="ib">「この大きさなら、</span><span class="ib">爪は基本 0.8〜1 mm」</span></p><cite>職人の一文 → 決まり「爪の太さ（最低）0.7 mm」</cite></blockquote>
    <p class="fine rv">同じ石・同じ号で、帳面だけを変えて撮りました。合言葉がなくても、「Claude なしで、数字で書く」で同じことができます。</p>
  </section>

  <section class="sec" id="check" aria-labelledby="check-h">
    <div class="head">
      <p class="k rv">作れない所の窓</p>
      <h2 id="check-h" class="rv">作れない所は、赤く。<br>押せば、理由。</h2>
      <p class="body rv">決まりを外れた所は、3D の上で赤くなります。右上の赤い札を押すと、どこが・いくつで・なぜ（職人の言葉か、資料の出どころ）が並びます。</p>
    </div>
    <figure class="wide rv zoom">
      ${shot("fixpop", 2112, 1564, "設計の画面。腕を薄く描き、爪を細くした指輪が赤い。右の窓に「作れない所 3」：爪が細い 0.65 mm → 0.70 mm 以上、石の留まりが弱い、腕が薄い 1.00 mm → 1.20 mm 以上。行ごとに「爪を太くする」「腕を厚くする」のボタン、下に「まとめて直す」と「Claude で直す」", "(max-width: 1200px) 100vw, 1200px")}
      <figcaption>腕を薄く描き、爪を細くしたところ。作れない所 <span class="num">3</span>。</figcaption>
    </figure>
    <div class="two">
      <div class="rv"><h3>ボタンで直す</h3><p>決まりごとに決まった直し方を、押した所だけ。「腕を厚くする」なら腕だけが直ります。</p></div>
      <div class="rv" style="--d:80ms"><h3>Claude で直す</h3><p>指輪ぜんたいを読み、形と見た目をなるべく保ったまま、まとめて直します。何をなぜ変えたかが残ります（合言葉が要ります）。</p></div>
    </div>
  </section>

  <section class="sec" id="draw" aria-labelledby="draw-h">
    <div class="head">
      <p class="k rv">手で描く</p>
      <h2 id="draw-h" class="rv">腕の断面は、<br>指で描く。</h2>
      <p class="body rv">なぞった線は、なめらかな線に直って、描いた形のまま指輪の腕になります。先を尖らせすぎると、尖った所だけが赤い点で出ます。</p>
      <p class="fine rv">尖りすぎ：先の角度 <span class="num">26°</span> → <span class="num">60°</span> 以上（仮の目安・最後は職人が決める）</p>
    </div>
    <figure class="wide rv zoom">
      ${shot("spike", 2280, 1600, "設計の画面。右下の断面の編集で、先の尖った山の形を描いている。山の先と、指輪の腕の上に、赤い点が出ている", "(max-width: 1200px) 100vw, 1200px")}
      <figcaption>断面の先を尖らせたところ。赤い点が、尖りすぎの所。</figcaption>
    </figure>
  </section>

  <section class="sec split-sec" id="joint" aria-labelledby="joint-h">
    <div class="head">
      <p class="k rv">ザグりとロウ</p>
      <h2 id="joint-h" class="rv">ザグりも、<br>つなぎ目も、自動で。</h2>
      <p class="body rv">石の先が腕に当たる所は、腕の上を自動でザグります（この指輪で深さ <span class="num">0.70 mm</span>、丸いビット 直径 約 <span class="num">2.5 mm</span>）。石座は、ロウ付けの丸みで腕につながります。どちらも 3D・図面・重さ・STL に入ります。</p>
    </div>
    <figure class="card-shot rv">
      ${shot("zaguri", 2112, 1564, "寄って真横から見た、石座と腕のつなぎ目。腕の上が丸くくぼみ（ザグり）、その中に石の先が入っている。石座の足は、丸みのあるロウのつなぎ目で腕につながっている", "(max-width: 900px) 92vw, 640px")}
    </figure>
  </section>

  <section class="sec" id="trio" aria-labelledby="trio-h">
    <div class="head">
      <p class="k rv">石を並べる</p>
      <h2 id="trio-h" class="rv">三石も、<br>同じ決まりで。</h2>
      <p class="body rv">「石を並べる」で三石を選ぶと、脇の石座を真ん中より低く寄せ、石座どうしを短い線でつないでロウ付けする形に組みます。脇の石は、丸い石かペア。</p>
    </div>
    <div class="ba">
      <figure class="ba-card rv">
        ${shot("trio-round", 1440, 1600, "三石の指輪。真ん中にラウンド 6.5 mm、両脇に小さめのラウンドの石", "(max-width: 760px) 92vw, 560px")}
        <figcaption><span class="tag">脇の石</span><b>ラウンド</b><span class="v">真ん中 <span class="num">6.5 mm</span> ・ 脇 <span class="num">4.2 mm</span> ・ 作れます</span></figcaption>
      </figure>
      <figure class="ba-card rv" style="--d:100ms">
        ${shot("trio-pear", 1440, 1600, "三石の指輪。真ん中にラウンド 6.5 mm、両脇に先を外へ向けたペアの石", "(max-width: 760px) 92vw, 560px")}
        <figcaption><span class="tag">脇の石</span><b>ペア</b><span class="v">真ん中 <span class="num">6.5 mm</span> ・ 脇 <span class="num">6.3 mm</span> ・ 作れます</span></figcaption>
      </figure>
    </div>
    <p class="fine rv">石どうし <span class="num">0.3 mm</span>・爪どうし <span class="num">0.15 mm</span> あけます（仮の目安・最後は職人が決める）。</p>
  </section>

  <section class="sec" id="choose" aria-labelledby="choose-h">
    <div class="head">
      <p class="k rv">選べる</p>
      <h2 id="choose-h" class="rv">変えても、<br>決まりはついてくる。</h2>
      <p class="body rv">石の大きさ、腕の断面、留め方、地金。どれを変えても、枠と爪は帳面の決まりで組み直され、作れるかがその場で出ます。</p>
    </div>
    <ul class="grid6">
      ${CHOICES.map((c, i) => `<li class="tile rv" style="--d:${(i % 3) * 80}ms">${shot(c.name, 1440, 1600, c.alt, "(max-width: 760px) 46vw, 380px")}<p><small>${c.label}</small>${c.v}</p></li>`).join("")}
    </ul>
  </section>

  <section class="sec" id="ledger" aria-labelledby="ledger-h">
    <div class="head">
      <p class="k rv">帳面</p>
      <h2 id="ledger-h" class="rv">だれの判断かを、<br>分けて蓄える。</h2>
      <p class="body rv">石川工房の帳面には、決まりが <span class="num">42</span>。職人の言葉から <span class="num">2</span>、公開の資料から <span class="num">40</span>（出どころのリンクつき）。資料に数字がない所は「仮」と書きます。そして、まだ決まっていない所を、Claude が職人に聞きに来ます。</p>
    </div>
    <ul class="who rv">
      <li><i class="dot gold"></i><b>職人</b><span>職人の言葉と日付</span></li>
      <li><i class="dot"></i><b>資料</b><span>公開の資料の出どころ</span></li>
      <li><i class="dot warn"></i><b>仮</b><span>出典のない目安。職人が決める</span></li>
    </ul>
    <div class="phones">
      <figure class="rv">${shot("ledger", 960, 1653, "石川工房の帳面。職人：石川 の決まり 2 つ（爪の最低の太さ・三角の石は爪 3 本）と、その言葉。下に「Claude から質問が 1 つあります：石の大きさが 5.5 mm くらいの石だと、爪の太さは最低何ミリにしますか？」と、話して答える・書いて答えるのボタン", "(max-width: 760px) 92vw, 480px")}<figcaption>職人の決まりと、Claude からの質問</figcaption></figure>
      <figure class="rv" style="--d:100ms">${shot("ledger-pub", 960, 932, "資料から入れた決まり 40。「石の先を指から離す」に仮の札、「爪の先の高さ」に公開情報の出どころ", "(max-width: 760px) 92vw, 480px")}<figcaption>資料から入れた決まり <span class="num">40</span>。出どころか「仮」</figcaption></figure>
    </div>
  </section>

  <section class="sec" id="waza" aria-labelledby="waza-h">
    <div class="head">
      <p class="k rv">技</p>
      <h2 id="waza-h" class="rv"><span class="ib">同じしくみを、</span><span class="ib">ほかの技へ。</span></h2>
      <p class="body rv">覆輪留め・ミル打ち・槌目・鏨彫り・布目象嵌・木目金。どの技も同じ形のページです。① 作り方（道具・失敗しやすい所・出どころ）、② 職人の決まり、③ Claude からの質問。</p>
    </div>
    <div class="waza-shots">
      <figure class="rv">${shot("waza", 960, 985, "技を選ぶ画面。指輪の石留め、彫金・金工の技（工程・決まり・質問の数つき）、木目金を組み立て直す", "(max-width: 760px) 92vw, 420px")}</figure>
      <figure class="rv" style="--d:100ms">${shot("tech", 960, 1129, "木目金のページ。① 作り方の工程に、道具・失敗しやすい所・出どころ", "(max-width: 760px) 92vw, 420px")}<figcaption>どの技も同じ形：作り方 → 職人の決まり → 質問</figcaption></figure>
    </div>
    <a class="link rv center" href="${WAZA}">技を見る ${arrow}</a>
  </section>

  <section class="sec" id="rebuild" aria-labelledby="rebuild-h">
    <div class="head">
      <p class="k rv">組み立て直す</p>
      <h2 id="rebuild-h" class="rv">失われた技を、<br>手がかりから。</h2>
      <p class="body rv">作り方が途切れた技を、残った品物の手がかりだけから Claude が組み立て、隠しておいた本当の作り方と答え合わせします。木目金では、品物だけの手がかり <span class="num">9</span> から組み立てました。</p>
    </div>
    <div class="rb">
      <figure class="rv">${shot("rebuild", 1520, 1207, "木目金を組み立て直す画面。Claude に渡す手がかり（品物だけから）と、手がかり 9 の一覧：C1 表面の模様、C2 博物館の目録にある材料、C3 縁と彫り口に見える層、C4 漆の工芸との似かより", "(max-width: 900px) 92vw, 600px")}</figure>
      <div class="rb-score rv" style="--d:100ms">
        <p class="stat-n sm"><span class="num">11</span> のうち <span class="num">9</span></p>
        <p class="stat-t">本当の工程 <span class="num">11</span> のうち <span class="num">9</span> にたどり着いた（一致 <span class="num">6</span>・一部 <span class="num">3</span>）。</p>
        <ol class="lamps">${REBUILD.map((s) => `<li class="${s.v}"><b>${s.id}</b><span>${s.t}</span><small>${RV_LABEL[s.v]}</small></li>`).join("")}</ol>
        <p class="src">2026-11-04 に Claude が組み立てた回の答え合わせ。9 のうち 3 は、手がかりではなく Claude がもともと知っていたことから、と分けて数えています。</p>
      </div>
    </div>
    <a class="link rv center" href="app.html#waza/rebuild">組み立て直す ${arrow}</a>
  </section>

  <section class="sec" id="make" aria-labelledby="make-h">
    <div class="head">
      <p class="k rv">作る</p>
      <h2 id="make-h" class="rv">作り方と、図面まで。</h2>
      <p class="body rv">鍛造と鋳造の工程ごとに、この形から計算した数字、地金の温度の目安、道具。図面は正面・側面・上面に、寸法と表題欄をつけて、A4 横で印刷できます。3D のデータ（STL）も出せます。</p>
    </div>
    <div class="make">
      <figure class="make-steps rv">${shot("make", 678, 1664, "作るの画面。工程の札「01 材料を用意する」に石・号・腕の線・爪の線材の数字、「02 焼きなまして、のばす」に焼きなましの温度の目安", "(max-width: 760px) 70vw, 340px")}</figure>
      <figure class="make-draw rv" style="--d:120ms">${shot("draw", 1944, 1404, "図面の画面。指輪の正面図・側面図・上面図に寸法、右下に表題欄", "(max-width: 760px) 92vw, 760px")}</figure>
    </div>
  </section>

  <section class="sec" id="why" aria-labelledby="why-h">
    <div class="head">
      <p class="k rv">なぜ</p>
      <h2 id="why-h" class="rv"><span class="ib">判断の流れは、</span><span class="ib">継ぐで。</span><br><span class="ib">手の感覚は、</span><span class="ib">人から。</span></h2>
    </div>
    <ul class="where">
      <li class="rv"><h3>学校で</h3><p>一人ひとり、デザインも石も材料もちがう。作れるかは先生がひとりずつ確かめるので、生徒は先生の確認を待つ。継ぐなら、帳面の決まりでその場で確かめ、分からない所だけを先生に聞ける。</p></li>
      <li class="rv" style="--d:80ms"><h3>工房で</h3><p>若い人に教えるたびに、先輩の手が止まる。作れるかと作り方の流れは継ぐで先に知り、手の感覚だけを先輩から受け取る。「なぜ？」で職人の言葉まで戻れる。</p></li>
    </ul>

    <div class="stat rv">
      <p class="k">伝統的工芸品の作り手は、24 年で</p>
      <p class="stat-n">約 <span class="num">6</span> 割減</p>
      <p class="stat-t">従業員数は約 <span class="num">11.5</span> 万人（<span class="num">1998</span> 年度）から、約 <span class="num">4.8</span> 万人（<span class="num">2022</span> 年度）に。</p>
      <p class="src">出典：経済産業省 説明資料（伝統的工芸品産業振興協会の集計データより作成）<a href="https://www.bunka.go.jp/seisaku/bunkashingikai/bunkazai/kikaku/r07_r08/05/pdf/94408301_03.pdf" target="_blank" rel="noopener">文化庁サイト掲載の PDF</a></p>
    </div>

    <div class="trad">
      <div class="head">
        <h3 class="rv">刀の金具も、<br>同じ技で。</h3>
        <p class="body rv">鐔や飾太刀の金具のような彫金・金工の品物は、ジュエリーと同じ技で作られます。伊勢神宮の式年遷宮で新しく作られる御装束神宝のように、何年もかけて作り、20 年に一度しか作り直さない技もあります。一人の職人が一生のうちに関われるのは、数えるほど。だから、判断を蓄えておきます。</p>
      </div>
      <div class="her">
        <figure class="rv">${heritage("tsuba-carp.jpg", "鯉と藻の模様の鐔", 900, 958)}<figcaption>鯉と藻の鐔</figcaption></figure>
        <figure class="rv wide-h" style="--d:80ms">${heritage("kazari-tachi.jpg", "飾太刀の金具の部分。金の地に細かな彫り", 1400, 331)}<figcaption>飾太刀（平安時代）</figcaption></figure>
      </div>
    </div>
  </section>

  <section class="sec" id="claude" aria-labelledby="claude-h">
    <div class="head">
      <p class="k rv">Claude の使い方</p>
      <h2 id="claude-h" class="rv">作るときも、<br>使うときも。</h2>
    </div>
    <dl class="uses">${CLAUDE_USES.map(([k, v], i) => `<div class="rv" style="--d:${(i % 3) * 60}ms"><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
    <p class="fine rv">Claude は答えを決めるのではなく、職人の決まりを読んで選び、理由を残す役です。</p>
  </section>

  <section class="end" aria-labelledby="end-h">
    <h2 id="end-h" class="rv">まず、石を一つ。</h2>
    <p class="rv">写真がなくても、よくある形から始められます。Claude を使う所のほかは、合言葉なしで全部使えます。</p>
    <div class="cta rv">
      <a class="btn primary" href="${STUDIO}">設計する ${arrow}</a>
      <a class="btn" href="${WAZA}">技を見る ${arrow}</a>
    </div>
  </section>
</main>

<footer class="ft">
  <div class="ft-in">
    <div class="ft-top">
      <span class="brand"><span class="logo sm" aria-hidden="true">継</span>継ぐ</span>
      <span>Built with Claude: Japan 2026 の作品</span>
      <a href="https://github.com/ohri0/tsugu-craft" rel="noopener">GitHub</a>
    </div>
    <h2 class="ft-h">画像</h2>
    <p>指輪・図面・帳面などの写真は、継ぐの画面を撮ったものです。</p>
    <ul class="credits">${CREDITS.map((c) => `<li>${c.what} ― ${c.src}、<a href="${c.href}" rel="noopener">出典</a>（${c.lic}）</li>`).join("")}</ul>
    <p class="ft-note">使っているライブラリとライセンスは、リポジトリの README に書いてあります。継ぐ自体のライセンスは、大会の運営に確かめてから決めます。数字は目安。最後は職人が決めます。</p>
  </div>
</footer>`;

const root = document.getElementById("lp")!;
root.innerHTML = html;

// 少しずつ見せる（動きを減らす設定なら、はじめから全部見せる）
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
    { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
  );
  els.forEach((e) => io.observe(e));
}

// 上の帯：少し下にスクロールしたら、背景を濃くする
const hd = root.querySelector<HTMLElement>(".hd")!;
const onScroll = () => hd.classList.toggle("solid", scrollY > 24);
addEventListener("scroll", onScroll, { passive: true });
onScroll();
