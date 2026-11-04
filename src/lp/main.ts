// 継ぐの入口のページ。黒の上に、大きく細い見出しと、継ぐの本物の画面の写真（public/lp/、scripts/lp-shots.cjs で撮る）。
// 書いてあることは、どれも今のアプリでできること。数字は、撮った画面の数字か、出典のあるものだけ。
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

const CLAUDE_USES: [string, string][] = [
  ["Claude Code", "開発の中心。仕様と決まりを読み、作者と話しながら、画面・形の処理・確かめる決まり・MCP を書いた。うまくいかなかったことも記録に残した。"],
  ["Skill", "職人の目安を一か所に。開発中の Claude も、アプリの中の Claude も、同じ目安を読む。"],
  ["フック", "API キーがまぎれこむのを止める。形の処理を直したら、テストを回す。"],
  ["サブエージェント", "互いに触らない部品を、別の作業場所で同時に作り、取り込んだ。"],
  ["MCP", "職人がふだん使う Claude のアプリから、帳面を読む・決まりを足す・指輪を組んで確かめる。"],
  ["アプリの中の Claude", "職人の言葉を決まりの案にする。帳面の決まりで指輪を組んで直す。まだ決まっていない所を聞く。途切れた技を手がかりから組み立てる。"],
];

const CREDITS: { file: string; what: string; src: string; href: string; lic: string }[] = [
  { file: "naiku-goshinpozu.jpg", what: "内宮御神宝図（一部を切り出して横につないだもの）", src: "国立国会図書館所蔵", href: "https://commons.wikimedia.org/wiki/File:NDL2574228_%E5%86%85%E5%AE%AE%E5%BE%A1%E7%A5%9E%E5%AE%9D%E5%9B%B3.(1).pdf", lic: "パブリックドメイン" },
  { file: "kazari-tachi.jpg", what: "飾太刀（平安時代。一部を切り出し）", src: "東京国立博物館（ColBase）", href: "https://colbase.nich.go.jp/collection_items/tnm/F-356", lic: "CC BY 4.0" },
  { file: "tsuba-carp.jpg", what: "鯉と藻の鐔", src: "メトロポリタン美術館", href: "https://commons.wikimedia.org/wiki/File:%E8%97%BB%E9%AF%89%E5%9B%B3%E9%90%94,_Sword_Guard_(Tsuba)_with_the_Carp_and_Seaweed_Motif.jpg", lic: "CC0" },
  { file: "tachi.jpg", what: "太刀と拵え", src: "メトロポリタン美術館", href: "https://commons.wikimedia.org/wiki/File:Blade_and_Mounting_for_a_Slung_Sword_(Tachi)_MET_1820.jpg", lic: "CC0" },
  { file: "naiku-1953.jpg", what: "1953 年の内宮の空からの写真", src: "本田照夫 撮影", href: "https://commons.wikimedia.org/wiki/File:Ise_Shrine_Naiku_1953-8-26_cropped.jpg", lic: "パブリックドメイン" },
];

const heritage = (file: string, alt: string, w: number, h: number, cls = "") =>
  `<img class="${cls}" src="heritage/${file}" width="${w}" height="${h}" alt="${alt}" loading="lazy" decoding="async">`;

const html = `
<a class="skip" href="#main">本文へ</a>
<header class="hd">
  <div class="hd-in">
    <a class="brand" href="./" aria-label="継ぐ　はじめのページ"><span class="logo" aria-hidden="true">継</span>継ぐ</a>
    <nav class="nav" aria-label="ページの中">
      <a href="#rule" class="hide-sm">一言で</a>
      <a href="#check" class="hide-sm">確かめる</a>
      <a href="#future" class="hide-sm">その先に</a>
      <a class="pill" href="${STUDIO}">設計する</a>
    </nav>
  </div>
</header>

<main id="main">
  <section class="hero" aria-labelledby="hero-h">
    <p class="eyebrow rv">宝飾の彫金職人が、Claude と作りました</p>
    <h1 id="hero-h" class="rv"><span class="ln"><span>ネットにない</span><span>職人の判断を、</span></span><span class="ln"><span>形を確かめる</span><span>決まりにして、</span></span><span class="ln"><span>次の人へ渡す。</span></span></h1>
    <p class="lead rv">職人が話した一言が、帳面の決まりになる。<br>その決まりで、だれの設計も、その場で確かめられる。</p>
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
      <p class="k rv">帳面</p>
      <h2 id="rule-h" class="rv">職人の一言で、<br>形が変わる。</h2>
      <p class="body rv">職人が話すと、Claude がその言葉を、帳面の決まり（何の値を・いくつに・だれの言葉で）にします。「これでいい」を押すと、いまの設計も、記録したこれまでの作品も、その決まりで確かめ直します。</p>
    </div>
    <div class="ba">
      <figure class="ba-card rv">
        ${shot("before", 1440, 1600, "公開の資料の目安だけの帳面で組んだ指輪。爪が太く、丸い玉のように目立つ", "(max-width: 760px) 92vw, 560px")}
        <figcaption><span class="tag">前</span><b>公開の資料だけの帳面</b><span class="v">爪 <span class="num">ø 1.66 mm</span> ・ 地金 約 <span class="num">3.2 g</span></span></figcaption>
      </figure>
      <figure class="ba-card rv">
        ${shot("after", 1440, 1600, "職人の決まりを足した帳面で組み直した指輪。爪が細く、石がよく見える", "(max-width: 760px) 92vw, 560px")}
        <figcaption><span class="tag gold">後</span><b>職人の一言を足した帳面</b><span class="v">爪 <span class="num">ø 0.80 mm</span> ・ 地金 約 <span class="num">2.5 g</span></span></figcaption>
      </figure>
    </div>
    <blockquote class="say rv"><p><span class="ib">「この大きさなら、</span><span class="ib">爪は基本 0.8〜1 mm」</span></p><cite>職人の言葉 → 決まり「爪の太さ（最低）0.7 mm」</cite></blockquote>
    <p class="fine rv">同じ石・同じ号で、帳面だけを変えて撮りました。合言葉がなくても、「Claude なしで、数字で書く」で同じことができます。</p>
  </section>

  <section class="sec" id="check" aria-labelledby="check-h">
    <div class="head">
      <p class="k rv">確かめる</p>
      <h2 id="check-h" class="rv">細すぎる爪は、<br>赤く光る。</h2>
      <p class="body rv">決まりを外れた所は、3D の上で赤く脈を打ちます。赤い所を押すと、その決まりを話した職人の声（録ってあれば）か、職人の言葉が出ます。直すボタンを押せば、決まりの内側に戻ります。</p>
    </div>
    <figure class="wide rv zoom">
      ${shot("thin", 2880, 1800, "確かめるの画面。爪を 0.45 mm まで細くした指輪の爪が赤く光り、右に「爪が細い 0.45 mm → 0.70 mm 以上」と直すボタン。下に職人の言葉が出ている", "(max-width: 1200px) 100vw, 1200px")}
      <figcaption>爪を <span class="num">0.45 mm</span> まで細くしたところ。右に、直す所と直し方。</figcaption>
    </figure>
  </section>

  <section class="sec" id="choose" aria-labelledby="choose-h">
    <div class="head">
      <p class="k rv">選べる・広がる</p>
      <h2 id="choose-h" class="rv">変えても、<br>決まりはついてくる。</h2>
      <p class="body rv">石の大きさ、腕の断面、留め方、地金。どれを変えても、枠と爪は帳面の決まりで組み直され、作れるかがその場で出ます。腕の断面は、点を動かして手で描くこともできます。</p>
    </div>
    <ul class="grid6">
      ${CHOICES.map((c, i) => `<li class="tile rv" style="--d:${(i % 3) * 80}ms">${shot(c.name, 1440, 1600, c.alt, "(max-width: 760px) 46vw, 380px")}<p><small>${c.label}</small>${c.v}</p></li>`).join("")}
    </ul>
    <p class="fine rv">どれも「見せる」の画面で、一つずつ押して撮りました。</p>
  </section>

  <section class="sec split-sec" id="ask" aria-labelledby="ask-h">
    <div class="head">
      <p class="k rv">聞き取り</p>
      <h2 id="ask-h" class="rv">Claude が、<br>聞きに来る。</h2>
      <p class="body rv">帳面の中で、職人がまだ決めていない所を探して、一つずつ聞きます。点と点のあいだを線でつないでいるだけの所も、正直に「点が届いていない」と出します。答えは同じ帳面に入り、設計の確かめにそのまま効きます。</p>
      <p class="fine rv">合言葉を入れると、Claude が問いを言い直して聞きます。</p>
    </div>
    <figure class="card-shot rv">
      ${shot("ask", 1520, 780, "帳面の聞き取りの画面。「石の大きさが 5.5 mm くらいの石だと、爪の太さは最低何ミリにしますか？」という問いと、話す・決まりにする・とばすのボタン", "(max-width: 900px) 92vw, 640px")}
    </figure>
  </section>

  <section class="sec" id="make" aria-labelledby="make-h">
    <div class="head">
      <p class="k rv">作る</p>
      <h2 id="make-h" class="rv">作り方と、図面まで。</h2>
      <p class="body rv">鍛造と鋳造の工程ごとに、この形から計算した数字、地金の温度の目安、道具。図面は正面・側面・上面に、寸法と表題欄をつけて、A4 横で印刷できます。3D のデータ（STL）も出せます。</p>
    </div>
    <div class="make">
      <figure class="make-steps rv">${shot("make", 678, 1664, "作るの画面。工程の札「01 材料を用意する」に石・号・腕の線・爪の線材・支えの輪の数字、「02 焼きなまして、のばす」に焼きなましの温度の目安", "(max-width: 760px) 70vw, 340px")}</figure>
      <figure class="make-draw rv" style="--d:120ms">${shot("draw", 1944, 1404, "図面の画面。指輪の正面図・側面図・上面図に寸法、右下に表題欄", "(max-width: 760px) 92vw, 760px")}</figure>
    </div>
  </section>

  <section class="sec" id="where" aria-labelledby="where-h">
    <div class="head">
      <p class="k rv">使う所</p>
      <h2 id="where-h" class="rv"><span class="ib">判断の流れは、</span><span class="ib">継ぐで。</span><br><span class="ib">手の感覚は、</span><span class="ib">人から。</span></h2>
    </div>
    <ul class="where">
      <li class="rv"><h3>学校で</h3><p>生徒は、自分の設計を職人の決まりで手元で確かめる。答えられないことは、職人への質問として届く。</p></li>
      <li class="rv" style="--d:80ms"><h3>工房で</h3><p>若い職人は、先輩の手を止めずに、作れるかの判断と作り方の流れを先に知る。「なぜ？」で職人の言葉まで戻れる。</p></li>
      <li class="rv" style="--d:160ms"><h3>現場で</h3><p>「見せる」で、お客さまの前で石や地金を切り替える。作れるかも、その場で出る。</p></li>
    </ul>
    <p class="fine rv">数字は目安です。最後は職人が決めます。</p>
  </section>

  <section class="sec future" id="future" aria-labelledby="future-h">
    <div class="head">
      <p class="k rv">その先に</p>
      <h2 id="future-h" class="rv">同じしくみを、<br>伝統の技へ。</h2>
      <p class="body rv">刀の金具や神宝のような彫金・金工の品物は、ジュエリーと同じ技で作られます。伊勢神宮の式年遷宮では、御装束神宝が新しく作られます。何年もかけて作り、20 年に一度しか作り直さない技。一人の職人が一生のうちに関われるのは、数えるほどです。</p>
    </div>
    <div class="scroll rv" aria-label="内宮御神宝図（一部）">
      <div class="scroll-in">${heritage("naiku-goshinpozu.jpg", "内宮御神宝図の一部。神宝の品々が横に並んで描かれている", 10115, 560)}${heritage("naiku-goshinpozu.jpg", "", 10115, 560, "dup")}</div>
    </div>
    <div class="her">
      <figure class="rv">${heritage("kazari-tachi.jpg", "飾太刀の金具の部分。金の地に細かな彫り", 1400, 331)}<figcaption>飾太刀（平安時代）</figcaption></figure>
      <figure class="rv" style="--d:80ms">${heritage("tsuba-carp.jpg", "鯉と藻の模様の鐔", 900, 958)}<figcaption>鯉と藻の鐔</figcaption></figure>
      <figure class="rv" style="--d:160ms">${heritage("tachi.jpg", "太刀と拵え", 1400, 712)}<figcaption>太刀と拵え</figcaption></figure>
    </div>

    <div class="nanako">
      <div class="head">
        <h3 class="rv">彫金の魚々子に、<br>当ててみた。</h3>
        <p class="body rv">魚々子（ななこ）は、先が小さな輪になった鏨で、小さな丸い粒をすきまなく並べる彫金の技です。指輪と同じしくみで帳面を作りました。打つ位置が決まりより大きくずれた粒や、となりと重なった粒は、赤くなります。</p>
        <p class="fine rv">この帳面の決まりは、公開の資料から入れたものだけで、まだ職人が確かめていません。数字がない所は決まりを作らず、職人に聞きます。</p>
        <a class="link rv" href="app.html#waza/nanako">魚々子を開く ${arrow}</a>
      </div>
      <figure class="rv zoom">${shot("nanako", 1456, 840, "魚々子の図。丸い粒が並び、打つ位置が決まりより大きくずれた粒が赤く出ている。下に「合わない所 1：20 粒が、決まりの 0.1 mm より大きくずれている」", "(max-width: 900px) 92vw, 640px")}</figure>
    </div>

    <div class="stat rv">
      <p class="k">作り手は、40 年あまりで</p>
      <p class="stat-n">約 <span class="num">6</span> 分の <span class="num">1</span></p>
      <p class="stat-t">国が指定した伝統的工芸品の作り手は、<span class="num">28</span> 万 <span class="num">8</span> 千人（<span class="num">1979</span> 年）から <span class="num">4</span> 万 <span class="num">8</span> 千人（<span class="num">2022</span> 年度）に。</p>
      <p class="src">出典：伝統的工芸品産業振興協会</p>
    </div>

    <figure class="naiku rv">${heritage("naiku-1953.jpg", "1953 年の内宮を空から見た白黒の写真。森の中に社殿が並ぶ", 984, 1188)}<figcaption>1953 年の内宮（伊勢神宮）</figcaption></figure>
  </section>

  <section class="sec" id="rebuild" aria-labelledby="rebuild-h">
    <div class="head">
      <p class="k rv">途切れても</p>
      <h2 id="rebuild-h" class="rv">手がかりから、<br>組み立て直す。</h2>
      <p class="body rv">作り方が途切れた技を、残った品物と材料の手がかりだけから Claude が組み立て、隠しておいた本当の作り方と答え合わせをします。工程ごとに、どの手がかりから考えたか、もともとの知識からかを分けて数えます。</p>
      <a class="link rv" href="app.html#rebuild">組み立て直す ${arrow}</a>
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
