// 継ぐの入口のページ（2026-11-07 作り直し）。話は動画（docs/NARRATION-ad.md のいちばん上）と同じ：
//   職人の判断を、次の人へ → なぜ作ったか → 序の言葉（1 つずつ画面いっぱい）→ しくみ → 残す → デザインする人へ（テンションは別の節）
//   → 学ぶ人へ → 次の時代へ → 途絶えた技の復元 → 結。
// 作者の声：「読みにくい」「画像の移り変わりとかもない」「ウェブサイトもしっかり組み立てて」。
//   → 横書きの大きな字を基本にし（縦書きは題と職人の言葉だけ）、本物の画面の絵を、同じ場所でゆっくり重ねて移り変わらせる（ズームなし）。
// 2026-11-07 昼の職人の声：「元のやつも良かった」「伝えたいことがバーンって出てくるやつ」「一個一個大事にしてる感じ」
//   → 機能の説明は今の版のまま（分かりやすい）。言いたいこと（はじめ・序の言葉・約 6 割・20 年に一度・工房に・結）は、
//     前の版（6878a61 の前）のように、縦書きで 1 つずつ画面いっぱいに出す。「決まりは工房ごとに」は前の版の 2 つ並べに戻す。
//   動く絵（指輪が一回りする・手の動画）は、音なし・くり返し・画面に入っている間だけ流す。動きを減らす設定では、止めた絵だけ。
// 書いてあることは、どれも今のアプリでできること。数字は、撮った画面の数字か、出典・記録のあるものだけ。
// 写真は public/lp/（scripts/lp-shots.cjs で撮る。大きさは src/lp/shots.json）。品物の写真は public/heritage/ の jpg を webp にした物（出どころは下）。3D は読み込まない。
import "./lp.css";
import { bindFlowMotion, flowAfterSvg, flowBeforeSvg, HAKUSHO_URL, whyHtml } from "../studio/why";
import SIZES from "./shots.json";

const STUDIO = "studio.html";
const LEARN = "app.html#learn";
const WAZA = "app.html#waza";
const LEDGER = "app.html#ledger";
const RESTORE = "app.html#waza/restore";
const REBUILD_URL = "app.html#waza/rebuild";
const MOYOU_URL = "app.html#waza/rebuild/moyou";
const HANDS_URL = "app.html#learn/hands";
const GITHUB = "https://github.com/ohri0/tsugu-craft";

const sizeOf = (name: string): [number, number] => { const s = (SIZES as Record<string, number[]>)[name]; return s ? [s[0], s[1]] : [1600, 1000]; };

/** public/lp/ の写真。大きい方（2 倍）と、半分の幅の -sm。大きさは shots.json から */
function img(name: string, alt: string, sizes: string, eager = false): string {
  const [w, h] = sizeOf(name);
  const sw = Math.round(w / 2);
  return `<img src="lp/${name}-sm.webp" srcset="lp/${name}-sm.webp ${sw}w, lp/${name}.webp ${w}w" sizes="${sizes}" width="${sw}" height="${Math.round(h / 2)}" alt="${alt}" ${eager ? `fetchpriority="high"` : `loading="lazy"`} decoding="async">`;
}

/** 音なし・くり返しの動く絵（mp4 が先：同じ見た目で webm より軽かった）。画面に入ったときだけ読み込んで流す（preload="none"）。poster は止めた絵 */
function clip(name: string, label: string, cls = ""): string {
  const [w, h] = sizeOf(`${name}-poster`);
  return `<video class="clip ${cls}" muted loop playsinline preload="none" poster="lp/${name}-poster.webp" width="${w}" height="${h}" aria-label="${label}">
    <source src="lp/${name}.mp4" type="video/mp4"><source src="lp/${name}.webm" type="video/webm"></video>`;
}

/**
 * 同じ場所で、絵がゆっくり重なって移り変わる（1.2 秒の重ね。動かさない・寄らない）。下の小さなボタンで選べる。
 * 札の言葉（cap）は絵と一緒に変わる
 */
function crossfade(id: string, frames: { name: string; alt: string; cap: string }[], sizes: string, opts: { every?: number; cls?: string; ratio?: string } = {}): string {
  const [w, h] = sizeOf(frames[0].name);
  return `<div class="xf ${opts.cls ?? ""}" data-every="${opts.every ?? 4200}" style="--ratio:${opts.ratio ?? `${w} / ${h}`}" role="group" aria-roledescription="移り変わる絵" aria-label="${frames.map((f) => f.cap).join("、")}">
    <div class="xf-stage">${frames.map((f, i) => `<figure class="xf-i${i === 0 ? " on" : ""}" id="${id}-${i}" aria-hidden="${i === 0 ? "false" : "true"}">${img(f.name, f.alt, sizes)}</figure>`).join("")}</div>
    <div class="xf-bar">
      <p class="xf-cap" aria-live="polite">${frames[0].cap}</p>
      <div class="xf-dots">${frames.map((f, i) => `<button type="button" aria-label="${i + 1}. ${f.cap}" aria-controls="${id}-${i}"${i === 0 ? ` aria-current="true"` : ""}><i></i></button>`).join("")}</div>
    </div>
  </div>`;
}

/** 品物の写真（public/heritage/ の jpg を webp にした物。lp/h-*.webp） */
const heritage = (file: string, alt: string, sizes = "(max-width: 760px) 92vw, 50vw") => img(`h-${file}`, alt, sizes);

/** 章の頭：渡す先の番号と、細い糸 */
function chapter(n: string, id: string, title: string, lead: string): string {
  return `<header class="chap" id="${id}">
    <p class="chap-k rv"><span>${n}</span></p>
    <h2 class="chap-h rv">${title}</h2>
    <p class="chap-lead rv">${lead}</p>
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
/**
 * 模様の見込み（2026-11-07）：この世にない技に、本物の Claude が出した手順で描いた絵（docs/pattern-demo/）。
 * 重ねる技は層の動き、表の技は 1 枚の板の表を変える計算。どれも形だけの見込み
 */
const PATTERNS: { id: string; name: string; fam: string; how: string; alt: string }[] = [
  { id: "kasumi", name: "霞刃の小刀", fam: "重ねる", how: "2 種の鋼を重ね直し、溝を刻んで叩く", alt: "はしご状の帯と、流れる細い線" },
  { id: "uzu", name: "渦金の帯留め", fam: "重ねる", how: "重ねた棒をねじり、平たくして削る", alt: "ねじれた縞と、入れ子の山形" },
  { id: "ichimatsu", name: "市松縞の小箱", fam: "重ねる", how: "縞の板を四角に切り、互い違いに", alt: "細い縞の四角が、向きを変えて並ぶ" },
  { id: "wauchi", name: "輪打ち金筋", fam: "表面", how: "金の筋をはめ、魚々子を打つ", alt: "黒い地に小さな輪が並び、金の波の筋" },
  { id: "sukashibori", name: "花透かしの縁彫り板", fam: "表面", how: "花を透かし、毛彫り・片切彫り", alt: "花の形の透かしと、ふちの彫りの線" },
  { id: "tsubukin", name: "粒金槌目の留め具", fam: "表面", how: "槌目の地に、金の粒を房に", alt: "浅いくぼみの金の面と、粒の房" },
];

const RV_LABEL = { ok: "一致", part: "一部", miss: "たどり着けず" } as const;

/**
 * テンションの比べ：設計の画面の「地金ごとの比べ（mm）」の表を、そのまま写した値（2026-11-07 撮影。scripts/lp-shots.cjs の tension）。
 * 職人の指輪と同じ設定：三角の石 8.88 × 7.52 × 4.24 mm・挟む向き side（短い辺を溝に）・丸線 ø 4.0 mm・14 号・くぼみ 0.4 / 溝 0.4 mm・硬い状態。
 * 決まった値ではない（作者：「この石の場合、という話」）。戻りきらない分の割合と、地金の値の多くは仮（src/rules/guides.ts の tension.spring）。
 * Pt900 も値はある（Pt/Ir 900/100 の表の値。仮）。ヤング率が高く、戻れる範囲が狭いので、この腕では開ききらない見込みになる。
 *   前は「—」だけにしていた（2026-11-06 作者：ノイズになる）が、2026-11-07 職人の声「プラチナのところもちゃんと数値入れてあげて」で、曲がりが残る量を書く。
 */
const TENSION_EXAMPLE: { metal: string; shrink?: string; spread?: string; set?: string; short?: string }[] = [
  { metal: "K18 イエロー", shrink: "1.04", spread: "1.84", set: "0.09" },
  { metal: "K18 ピンク", shrink: "1.15", spread: "1.95", set: "0.10" },
  { metal: "K18 ホワイト", shrink: "0.77", spread: "1.57", set: "0.08" },
  { metal: "Pt900", short: "0.03" },
  { metal: "SV925", shrink: "0.54", spread: "1.34", set: "0.07" },
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
/** 作り手の数（docs/RESEARCH-scale.md の K3。原文で確かめた） */
const STAT_URL = "https://www.bunka.go.jp/seisaku/bunkashingikai/bunkazai/kikaku/r07_r08/05/pdf/94408301_03.pdf";
/** 木目金の歴史の言葉（docs/RESEARCH-scale.md の M1。県の無形文化財の説明。原文で確かめた） */
const MOKUME_URL = "https://www.pref.akita.lg.jp/uploads/public/archive_0000070402_00/02_%E6%9D%A2%E7%9B%AE%E9%87%91.pdf";

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
      ${img("ring-macro", "継ぐで組んだ一粒石の指輪。三角の石を、金の爪 3 本が留めている", "100vw", true)}</picture>
    </figure>
    <div class="hero-t">
      <h1 id="hero-h" class="v hero-h">継ぐ</h1>
      <p class="v hero-s">職人の判断を、<br>次の人へ。</p>
    </div>
    <div class="hero-b">
      <p class="hero-by">宝飾の彫金職人が、Claude Code と作りました。</p>
      <div class="cta"><a class="btn primary" href="${STUDIO}">設計する</a><a class="btn open-why" href="#why">なぜ継ぐ</a></div>
    </div>
  </section>

  <section class="reason" aria-labelledby="reason-h">
    <h2 id="reason-h" class="kicker rv">なぜ作ったか</h2>
    <blockquote class="reason-q rv"><p>彫金・金工の職人の判断を残し、技を継承するため。<br>そして、迷う時間を、<br class="sm">つくる時間に変えるためです。</p></blockquote>
    <p class="reason-by rv">作者（宝飾の彫金職人）</p>
  </section>

  <section class="say-full s1" aria-label="作れるかどうかの判断は、職人の頭の中にあります。">
    <p class="v sf-l rv">作れるかどうかの<br>判断は、</p>
    <p class="v sf-m rv">職人の頭の中に<br>あります。</p>
  </section>
  <section class="say-full s2" aria-label="職人がいなくなれば、その判断も消えます。">
    <p class="v sf-l rv">職人が<br>いなくなれば、</p>
    <p class="v sf-l rv">その判断も</p>
    <p class="v sf-big rv">消えます。</p>
  </section>
  <section class="say-full s3" aria-label="継ぐは、その判断を残して、次の人へ渡します。">
    <p class="v sf-k rv">継ぐは、</p>
    <p class="v sf-m rv">その判断を残して、<br>次の人へ渡します。</p>
  </section>

  <section class="how" id="how" aria-labelledby="how-h">
    <div class="wrap">
      <header class="how-head">
        <p class="kicker rv">しくみ</p>
        <h2 id="how-h" class="rv">職人の言葉が、帳面になり、<br class="sm">次の人に使われるまで。</h2>
      </header>
      <ol class="how-map rv">
        <li><a href="#keep"><span class="hm-n">1</span><figure class="hm-f">${img("teach", "設計の画面の「Claude に教える」。一行の欄と、話す ボタン", "(max-width: 760px) 40vw, 220px")}</figure><b>職人が話す</b><small>ふだんの言葉で。書いても。</small></a></li>
        <li><a href="#keep"><span class="hm-n">2</span><figure class="hm-f">${img("rule-card", "帳面の決まりの札。職人の言葉、職人の名前と日付", "(max-width: 760px) 40vw, 220px")}</figure><b>Claude が決まりにする</b><small>数字のついた決まりの案に。</small></a></li>
        <li><a href="#keep"><span class="hm-n">3</span><div class="hm-f hm-book" aria-hidden="true"><i>帳面</i><span>職人の言葉・名前・日付</span></div><b>職人が確かめて、帳面へ</b><small>「これでいい」を押した物だけ。</small></a></li>
        <li class="hm-use"><span class="hm-n">4</span><b>帳面をもとに、使う</b>
          <ul>
            <li><a href="#design">${img("fixpop-pop", "作れない所の窓。職人の言葉と、直すボタン", "120px")}<span>デザインの確かめ</span></a></li>
            <li><a href="#learn">${img("learn", "学ぶの画面。問いに、職人の言葉つきで答える", "120px")}<span>学ぶ人への答え</span></a></li>
            <li><a href="#make">${img("draw", "継ぐが描いた図面", "120px")}<span>図面と作り方</span></a></li>
            <li><a href="#restore">${img("restore-flow", "途切れた技の流れ", "120px")}<span>途絶えた技の復元</span></a></li>
          </ul>
        </li>
      </ol>
      <p class="note rv">Claude は、この工房の帳面を読んで確かめ、答え、案を出します（Claude API）。同じ帳面は、MCP の道具からも読めます。決めるのは職人です。</p>
    </div>
  </section>

  <section class="keep paper" id="keep" aria-labelledby="keep-h">
    <div class="wrap">
      <header class="keep-head">
        <p class="kicker rv">まず</p>
        <h2 id="keep-h" class="rv">残す</h2>
        <p class="lead rv">職人は、ふだんの言葉で話すだけ。</p>
      </header>
      <div class="keep-grid">
        <div class="keep-say">
          <blockquote class="say rv"><p>このサイズの石なら、<br>最低ライン 0.7 ミリは<br>欲しい感じ。</p><cite>職人の言葉</cite></blockquote>
          <ol class="steps">
            <li class="rv"><b>1</b><p><strong>話す。</strong>話しても、書いても。だれの言葉か、いつの言葉かも残ります。</p></li>
            <li class="rv"><b>2</b><p><strong>Claude が、数字のついた決まりに書き直します。</strong>職人が見て「これでいい」を押すと、帳面に残ります。</p></li>
            <li class="rv"><b>3</b><p><strong>ほかの大きさの石は、割合で推し量ります。</strong>職人が言っていない値には「推測」と書きます。</p></li>
            <li class="rv"><b>4</b><p><strong>ちがえば、話して直せます。</strong>今の設計を見ながら、Claude に一言で教えます。</p></li>
          </ol>
        </div>
        <div class="keep-shots rv">
          ${crossfade(
            "kx",
            [
              { name: "rule-card", alt: "帳面の決まりの札。職人の言葉、職人の名前と日付", cap: "帳面の札：決まりと、職人の言葉、名前と日付" },
              { name: "teach", alt: "設計の画面の「Claude に教える」。いまの設計、一行の欄、話す ボタン", cap: "Claude に教える：今の設計を見ながら、一言で" },
              { name: "ask-card", alt: "Claude から質問：石の大きさが 5.5 mm くらいの石だと、爪の太さは最低何ミリにしますか？", cap: "帳面に足りない所は、Claude が聞きに来ます" },
            ],
            "(max-width: 760px) 92vw, 460px",
            { cls: "xf-card", ratio: "4 / 3", every: 4600 },
          )}
          <p class="note">数字は目安・最後は職人が決めます。公開の資料から入れた目安には出どころのリンクがつき、数字のない所は「仮」と書きます。<a href="${LEDGER}">帳面を見る</a></p>
        </div>
      </div>
    </div>
  </section>

  <section class="book" aria-labelledby="book-h">
    <h2 id="book-h" class="v book-h rv">決まりは、<br>工房ごとに持てます。</h2>
    <div class="book-two">
      <figure class="rv">${img("book-a", "石川工房の帳面で組んだ指輪。細い丸い爪で、シンプルに見える", "(max-width: 760px) 92vw, 42vw")}<figcaption><b>石川工房</b><span>丸い爪 ø <span class="num">0.80</span> mm</span></figcaption></figure>
      <figure class="rv">${img("book-b", "見本の工房 B の帳面で組んだ指輪。先が尖って石の上に少しかかる尖り爪で、シャープに見える", "(max-width: 760px) 92vw, 42vw")}<figcaption><b>工房 B（見本）</b><span>尖り爪 ø <span class="num">1.00</span> mm</span></figcaption></figure>
    </div>
    <p class="book-n rv">同じ石・同じ号で、帳面だけを変えて撮りました。帳面には、爪の形や太さといった、工房のいつもの雰囲気も入ります。工房 B は見本の工房で、尖り爪（先が尖り、石の上に少しかかる爪）と太さは例です。数字は目安・最後は職人が決めます。</p>
  </section>

  ${chapter("渡す 一", "design", "デザインする人へ", "作れない、と制作から何度も戻ってくることがあります。継ぐは、デザインの時点で、職人の判断で確かめます。")}

  <section class="flows wrap" aria-label="行ったり来たり">
    <figure class="flow rv"><figcaption>いま</figcaption>${flowBeforeSvg()}</figure>
    <figure class="flow rv"><figcaption>継ぐがあると</figcaption>${flowAfterSvg()}</figure>
  </section>

  <section class="feat check wrap" aria-labelledby="check-h">
    <div class="feat-t">
      <h3 id="check-h" class="rv">その場で確かめ、<br>職人の言葉で教える。</h3>
      <p class="rv">形を変えると、その場で確かめます。作れない所には赤い印。押すと、なぜ作れないかを、その工房の職人の言葉で教えます。直し方のボタンで直すことも、「まとめて直す」で全部を一度に直すこともできます。</p>
      <p class="note rv">数字と言葉は、この工房の帳面から。数字は目安・最後は職人が決めます。</p>
    </div>
    <div class="feat-m rv">${crossfade(
      "cx",
      [
        { name: "check-ok", alt: "設計の画面。三角の石の指輪で、右上に「作れます」", cap: "1　作れます" },
        { name: "check-red", alt: "爪を 0.60 mm に細くした指輪。細い爪に赤い印、右の欄に「このままでは作れません」", cap: "2　爪を細くすると、その場で赤い印" },
        { name: "check-pop", alt: "作れない所の窓。爪が細い 0.60 mm → 0.70 mm 以上、職人の言葉、爪を太くする、まとめて直す、Claude で直す", cap: "3　押すと、理由を職人の言葉で" },
        { name: "check-fixed", alt: "まとめて直したあとの指輪。右上が「作れます」に戻った", cap: "4　まとめて直す" },
      ],
      "(max-width: 760px) 92vw, 760px",
      { cls: "xf-screen", every: 3800 },
    )}</div>
  </section>

  <section class="zoom wrap" aria-label="作れない所を押したところ">
    <figure class="zoom-f rv"><picture><source media="(max-width: 760px)" srcset="lp/fixpop-pop-sm.webp 368w, lp/fixpop-pop.webp 736w" sizes="92vw" width="368" height="379">${img("fixpop", "赤い印のついた爪の指輪と、作れない所の窓。爪が細い 0.60 mm → 0.70 mm 以上、職人の言葉「このサイズの石なら最低ライン 0.7 mm は欲しい感じ」、爪を太くするボタン、まとめて直す、Claude で直す", "(max-width: 760px) 92vw, 1060px")}</picture>
      <figcaption>赤い爪を押すと、こう出ます。「　」の中は、この工房の職人の言葉です。数字は目安・最後は職人が決めます。</figcaption></figure>
  </section>

  <section class="feat flip word wrap" aria-labelledby="word-h">
    <div class="feat-t">
      <p class="say-s rv">「アールデコな感じ」</p>
      <h3 id="word-h" class="rv">言葉で頼むと、<br>作れる形が出てきます。</h3>
      <p class="rv">職人が残した言葉をもとに、Claude が次の指輪を組みます。石は手持ちの石の写真からでも、よくある形からでも。断面の線、場所ごとの太さ、浅い彫りまで組み、職人の決まりで確かめて直します。</p>
      <p class="note rv">本物の Claude に「アールデコな感じ」とだけ頼み、継ぐの形の道具で組んで、職人の決まりで確かめた形です。</p>
    </div>
    <div class="feat-m rv">${crossfade(
      "wx",
      [
        { name: "ring-artdeco", alt: "本物の Claude が「アールデコな感じ」から組んだ指輪を斜めから。石座から段々に下がる肩と、段ごとの四角い窓。白い地金に三角の石", cap: "斜めから　三角の石・プラチナ" },
        { name: "ring-artdeco-front", alt: "同じ指輪を正面から。段々に下がる肩に、四角い窓が段ごとに並ぶ", cap: "正面から　段の肩と四角い窓" },
      ],
      "(max-width: 760px) 92vw, 520px",
      { cls: "xf-dark xf-tall", every: 4000 },
    )}</div>
  </section>

  <section class="feat make wrap" id="make" aria-labelledby="make-h">
    <div class="feat-t">
      <h3 id="make-h" class="rv">図面と STL まで、<br>その場で。</h3>
      <p class="rv">正面・横・上の図面と寸法、作り方の指示書を印刷でき、STL も出せます。</p>
      <blockquote class="say-b rv"><p>この STL は、そのまま鋳造に出せます。あとは仕上げだけです。</p><cite>作者（宝飾の彫金職人）の言葉</cite></blockquote>
    </div>
    <figure class="feat-m sheet-fig rv">${img("draw", "継ぐが描いた図面。正面図・側面図・上面図と寸法、実物大の図、右下の表に石・号・地金・腕・留め方", "(max-width: 760px) 92vw, 720px")}<figcaption>印刷すると、この図面と作り方が一緒に出ます。</figcaption></figure>
  </section>

  <section class="feat flip range wrap" aria-labelledby="range-h">
    <div class="feat-t">
      <h3 id="range-h" class="rv">断面も、留め方も。</h3>
      <p class="rv">手間のかかった断面の形も、見本を選ぶか、線を描くだけで作れます。上と下で変えることもできます。留め方は、爪のほかに、腕のばねで石を挟むテンションも選べます（すぐ下の節）。</p>
    </div>
    <div class="feat-m rv">${crossfade(
      "rx",
      [
        { name: "band-wing", alt: "切り口を見せた、地金のみの指輪。上で片側だけ大きく張り出し、下は細い甲丸へ戻る", cap: "片側の翼：上で片側だけ大きく張り出し、下は細い甲丸へ戻る" },
        { name: "band-molding", alt: "切り口を見せた、地金のみの指輪。上は太いモールディング、下は細い甲丸へ流れる", cap: "モールディング：上は太いモールディング、下は細い甲丸へ流れる" },
        { name: "band-stairs", alt: "切り口を見せた、地金のみの指輪。大きな段が重なる建築の腕", cap: "段の重なり：大きな段が重なる建築の腕。手のひらの側で段が減る" },
        { name: "band-crossing", alt: "切り口を見せた、地金のみの指輪。左右で違う断面。稜線が腕を渡る", cap: "渡る稜線：左右で違う断面。稜線が上は左、下は右へ、腕を渡る" },
        { name: "band-oneside", alt: "切り口を見せた、地金のみの指輪。左右で別の顔。右は段を重ね、左はなだらかに下りる", cap: "片側の段：左右で別の顔。右は段を重ね、左はなだらかに下りる" },
        { name: "band-twin", alt: "切り口を見せた、地金のみの指輪。深い溝で 2 本に見える", cap: "二本の腕：深い溝で 2 本に見え、手のひらの側で 1 本にまとまる" },
        { name: "ring-tension", alt: "テンションの指輪。丸線の腕の端が、三角の石を両側から挟んでいる", cap: "テンション　腕のばねで石を挟む" },
      ],
      "(max-width: 760px) 92vw, 520px",
      { cls: "xf-dark", ratio: "1 / 1", every: 3400 },
    )}<p class="note">切り口を見せています。どれも、アプリの断面の編集で作った形です。</p></div>
  </section>

  <section class="tension" id="tension" aria-labelledby="ten-h">
    <div class="ten-top">
      <p class="v ten-v rv">テンション</p>
      <div class="ten-intro">
        <h3 id="ten-h" class="rv">腕のばねだけで、<br>石を挟む。</h3>
        <p class="rv">テンションは、爪を使わず、腕が元に戻ろうとする力で石を挟む留め方です。人がやると大変な計算を、継ぐは組んだ形からその場で出します。</p>
        <ul class="ten-what rv">
          <li><b>どれだけ縮めて作るか</b>石を押さえるために、腕の開きを石より小さく作る量。</li>
          <li><b>どれだけ広げて入れるか</b>石を入れるとき、腕を押し広げる量。</li>
          <li><b>くぼみと溝の深さ</b>石の角を受ける「角のくぼみ」と、辺を受ける「辺の溝」の深さ。</li>
          <li><b>戻りきらない分</b>広げた腕は、手を離しても元の位置まで戻りきりません。その分も見込みます。</li>
        </ul>
      </div>
    </div>
    <div class="ten-body">
      <figure class="ten-card rv">${img("tension-card", "設計の画面のテンションの札。角のくぼみ 0.40 mm・辺の溝 0.40 mm、答えは「ぎりぎり・職人が確かめる」。石を留めるのに縮める量 約 0.53 mm、安全に縮められる量 約 0.47 mm、作る時の開き 約 7.13 mm、石を入れる時に広げる量 約 1.34 mm", "(max-width: 760px) 80vw, 340px")}<figcaption>設計の画面の札。職人の指輪と同じ値（SV925・14 号・くぼみ 0.4 mm・溝 0.4 mm）を入れると「ぎりぎり・職人が確かめる」。</figcaption></figure>
      <div class="ten-side">
        <table class="ten-t rv">
          <caption>同じ石・同じ腕で、地金ごとに（mm）</caption>
          <thead><tr><th scope="col">地金</th><th scope="col">縮めて作る</th><th scope="col">広げて入れる</th><th scope="col">戻りきらない</th></tr></thead>
          <tbody>
            ${TENSION_EXAMPLE.map((r) => `<tr${r.metal === "SV925" ? ` class="mine"` : ""}><th scope="row">${r.metal}</th>${r.short ? `<td colspan="3" class="short">この腕では開ききらない見込み（約 <span class="num">${r.short}</span> mm 曲がりが残る）。腕を太くするか、形を変えます</td>` : `<td class="num">約 ${r.shrink}</td><td class="num">約 ${r.spread}</td><td class="num">約 ${r.set}</td>`}</tr>`).join("")}
          </tbody>
        </table>
        <p class="note rv">三角の石 8.88 × 7.52 × 4.24 mm・丸線 ø 4.0 mm・14 号・加工硬化した硬い状態での、大まかな計算です。地金の値（硬さや、曲がりにくさ）には「仮」のものがあり、計算も試して確かめたものではありません。目安・最後は職人が決めます。</p>
      </div>
    </div>
    <div class="ten-real">${crossfade(
      "tx",
      [
        { name: "finished-ring", alt: "職人の手が、三角の青い石を挟んだ銀のテンションの指輪を、作業台の上で持っている", cap: "この計算をもとに、職人が確かめて作った指輪" },
        { name: "ring-tension", alt: "継ぐで組んだテンションの指輪。丸線の腕の端が、三角の石を両側から挟んでいる", cap: "継ぐで組んだテンションの形" },
      ],
      "(max-width: 760px) 92vw, 900px",
      { cls: "xf-dark xf-slow", ratio: "4 / 3", every: 8000 },
    )}</div>
  </section>

  ${chapter("渡す 二", "learn", "学ぶ人へ", "学校では、独自のデザインは先生に聞くしかなく、長いときは 1 時間待ちます（職人の経験です）。継ぐなら、すぐ答えが出ます。")}

  <section class="feat ask wrap" aria-labelledby="ask-h">
    <div class="feat-t">
      <h3 id="ask-h" class="rv">聞けば、すぐ答える。<br>職人の言葉まで添えて。</h3>
      <p class="rv">答えには、理由と、もとになった職人の言葉がついています。工房では、先輩の手を止めずに、手順や数字を確かめられます。まだ言葉にできない手の感覚は、先輩に聞きます。</p>
      <p class="links rv"><a href="${LEARN}">学ぶ を開く</a><a href="${WAZA}">技を見る</a></p>
    </div>
    <figure class="feat-m phone-fig rv">${img("learn", "学ぶの画面。9 mm の石の爪は？ という問いに、爪の太さの最低を答え、理由と職人の言葉と決まりの名前が続く", "(max-width: 760px) 92vw, 420px")}<figcaption>「9 mm の石の爪は？」に、帳面から答えました。</figcaption></figure>
  </section>

  <section class="feat flip steps-live wrap" aria-labelledby="mk-h">
    <div class="feat-t">
      <h3 id="mk-h" class="rv">作り方を、<br>自動で作ります。</h3>
      <p class="rv">3D モデルをもとに、鋳造でも鍛造でも。工程ごとに、この形から計算した数字、温度の目安、道具が出ます。下は本物の中身です。点線の言葉を押すと、説明が開きます。</p>
      <p class="note rv">数字は目安・最後は職人が決めます。</p>
    </div>
    <div class="feat-m make-live rv"><div class="mk-live" aria-live="polite"><p class="mk-loading">作り方を読み込んでいます…</p></div></div>
  </section>

  <section class="feat hands wrap" aria-labelledby="hands-h">
    <div class="feat-t">
      <h3 id="hands-h" class="rv">手の動きを、<br>職人のいい例と比べる。</h3>
      <p class="rv">手元を撮ると、動画から道具の線を追い、ヤスリの角度のぶれや動きを、職人が撮った「いい例」と比べます。どこが違うかを、数と職人の言葉で返します。</p>
      <p class="note rv">比べる数は、動画から測った値です。最後は職人が見て決めます。</p>
      <p class="links rv"><a href="${HANDS_URL}">手を比べる を開く</a></p>
    </div>
    <figure class="feat-m hands-fig rv">${clip("hands-clip", "職人が撮った、ヤスリがけのいい例とよくない例の動画。ヤスリの縁に色の線が重なる")}<figcaption>どちらも職人が撮った本物の手元です。色の線は、動画から見つけたヤスリの縁。</figcaption></figure>
  </section>

  ${chapter("渡す 三", "next", "次の時代へ", "めったに作らない技ほど、途切れます。")}

  <section class="stat" aria-labelledby="stat-h">
    <h3 id="stat-h" class="rv">伝統的工芸品の作り手は、</h3>
    <p class="stat-n rv">約 <span class="num">6</span> 割</p>
    <p class="stat-e rv">減りました。</p>
    <div class="stat-line rv" aria-hidden="true"><i></i></div>
    <p class="stat-t rv">従業員は約 <span class="num">11.5</span> 万人（<span class="num">1998</span> 年度）から、約 <span class="num">4.8</span> 万人（<span class="num">2022</span> 年度）に。</p>
    <p class="src rv">出典：<a href="${STAT_URL}" target="_blank" rel="noopener">経済産業省 説明資料（文化庁サイト掲載の PDF）</a></p>
  </section>

  <section class="naiku" aria-labelledby="naiku-h">
    <div class="naiku-full">
      <figure class="naiku-ph">${heritage("naiku-1953", "1953 年の内宮を空から撮った写真。上が新しい殿舎、下がそれまでの殿舎", "100vw")}</figure>
      <h3 id="naiku-h" class="v naiku-h rv">20 年に一度しか、<br>受け継ぐ機会が<br>ない技もあります。</h3>
    </div>
    <div class="naiku-t wrap">
      <p class="rv">伊勢神宮の式年遷宮では、社殿も御装束神宝も、20 年に一度、すべて新しく作り直されます。遷宮に関わる技能者が携われるのは、多い人で <span class="num">3</span> 回ほどです。</p>
      <p class="src rv">出典：<a href="${HAKUSHO_URL}" target="_blank" rel="noopener">国土交通白書 平成 26 年版のコラム</a>（社殿を作る技能者の話）。写真は 1953 年の内宮。上が新しい殿舎、下がそれまでの殿舎。本田照夫 撮影・パブリックドメイン。</p>
      <figure class="naiku-zu rv">${heritage("goshinpo-gyokuhai", "内宮御神宝図の一部。玉と金の飾りをつないだ玉佩の絵", "(max-width: 760px) 92vw, 640px")}<figcaption>神宝の一つ、玉佩を描いた図。内宮御神宝図（部分。江戸時代の写し）、国立国会図書館所蔵・パブリックドメイン。</figcaption></figure>
    </div>
  </section>

  <section class="craft wrap" aria-labelledby="craft-h">
    <div class="craft-t">
      <h3 id="craft-h" class="rv">こうした彫金の技も、<br>継ぐで、次へ残せます。</h3>
      <p class="rv">刀の金具も、ジュエリーと同じ彫金・金工の技で作られます。技ごとに帳面を持ち、作り方と職人の判断を残します。</p>
    </div>
    <div class="craft-x rv">${crossfade(
      "hx",
      [
        { name: "h-itomaki-tachi-wide", alt: "糸巻太刀拵の全体。金の鞘に唐草と家紋、金の鐔と飾り金具", cap: "糸巻太刀拵（江戸時代）" },
        { name: "h-kozuka-carp", alt: "小柄に寄ったところ。細かな地の上に、金の鯉と波", cap: "小柄（こづか＝小刀の柄。18 世紀）" },
        { name: "h-menuki-tiger", alt: "金の目貫。竹の葉と虎。虎の毛が細い線で刻まれている", cap: "目貫（めぬき＝柄の飾り金具。17 世紀）" },
        { name: "h-kashira-dragon", alt: "黒い地に金を入れた頭。龍の顔", cap: "頭（かしら＝柄の先の金具。江戸時代）" },
        { name: "h-tsuba-carp", alt: "鯉と藻の彫りのある鐔", cap: "鯉と藻の鐔" },
      ],
      "(max-width: 760px) 92vw, 1100px",
      { cls: "xf-dark xf-wide", ratio: "16 / 9", every: 4200 },
    )}<p class="src">いずれもメトロポリタン美術館・CC0。</p></div>
  </section>

  <section class="restore" id="restore" aria-labelledby="restore-h">
    <div class="wrap">
      <div class="restore-head">
        <figure class="restore-ts rv">${heritage("mokume-tsuba-2-black", "木目金の鐔。赤茶と黒の層が、木の年輪のような模様を作っている", "(max-width: 760px) 70vw, 420px")}</figure>
        <div>
          <p class="kicker rv">途絶えた技の復元</p>
          <h2 id="restore-h" class="rv">もし途絶えてしまっても、<br>復元を試みることができます。</h2>
          <p class="rv">たとえば、江戸時代の刀の飾りの技、木目金。一時途絶えたとされ、のちに復元されました。</p>
          <p class="src rv">出典：<a href="${MOKUME_URL}" target="_blank" rel="noopener">秋田県「杢目金」（県の無形文化財の説明・PDF）</a></p>
        </div>
      </div>
      <div class="score">
        <p class="rv">力を試すために、答えの分かっている木目金で、作り方を隠し、残った品物と材料の手がかりだけを Claude に渡しました。</p>
        <p class="score-n rv"><span class="num">11</span> のうち <span class="num">9</span></p>
        <p class="rv">隠しておいた本当の <span class="num">11</span> の手順と比べると、<span class="num">9</span> にたどり着きました（一致 <span class="num">6</span>・一部 <span class="num">3</span>）。</p>
        <div class="lines rv" role="img" aria-label="11 本の線のうち、6 本が一致、3 本が一部、2 本がたどり着けず">${REBUILD.map((s) => `<i class="${s.v}"></i>`).join("")}</div>
        <p class="lines-k rv"><span class="ok">一致</span><span class="part">一部</span><span class="miss">たどり着けず</span></p>
        <details class="score-d rv"><summary>11 の手順を見る</summary><ol>${REBUILD.map((s) => `<li class="${s.v}"><p><b>${s.t}</b>${s.d}</p><span>${RV_LABEL[s.v]}</span></li>`).join("")}</ol></details>
        <p class="src rv">2026-11-04 に Claude が組み立てた回の答え合わせ。9 のうち 3 は、手がかりではなく Claude がもともと知っていたことから、と分けて数えています。この力試しに、職人の帳面は渡していません。<a href="${REBUILD_URL}">力試しを開く</a></p>
      </div>
      <figure class="moyou rv">${img("moyou-final", "本当の手順で作ったら、Claude の手順で作ったら、本物の鐔、の 3 つの鐔の絵。Claude の手順の方には、はがれた所の黄色い縁がある", "(max-width: 760px) 92vw, 1100px")}<figcaption>その手順で木目金を作ったら、どんな模様になるか。本当の手順、Claude の手順、本物の鐔を並べました。左の 2 つは計算で描いたシミュレーションです。<a href="${MOYOU_URL}">模様の試しを開く</a></figcaption></figure>
      <div class="any">
        <p class="kicker rv">架空の技の例</p>
        <h3 class="rv">木目金だけではありません。</h3>
        <p class="rv">答えのない技でも、手がかりを入れると、Claude が手順を推し量り、その手順で作ったときの見込みを描きます。重ねる技も、彫る・打つ・透かすなど表を変える技も。この世にない技でも試せます。</p>
        <ul class="pt-grid rv">${PATTERNS.map((t) => `<li><figure>${img(`pt-${t.id}`, `架空の技「${t.name}」の模様の見込み。${t.alt}`, "(max-width: 560px) 44vw, (max-width: 900px) 28vw, 170px")}<figcaption><b>${t.name}</b><span class="pt-fam">${t.fam}</span><small>${t.how}</small></figcaption></figure></li>`).join("")}</ul>
        <figure class="pt-stages rv">${img("pt-stages", "架空の技「輪打ち金筋」の見込みの画面。左から、赤銅の板、金を波の線ではめる、魚々子の輪を打つ、の 3 段。段ごとに、横から見た切り口と上から見た面", "(max-width: 760px) 92vw, 760px")}<figcaption>架空の技「輪打ち金筋」。Claude の案の手順を、1 段ずつ描きます（赤銅の板 → 金をはめる → 輪を打つ）。手順に書かれていない数には「仮」の印がつきます。</figcaption></figure>
        <p class="src rv">どれも作り話の技に、本物の Claude が出した手順で描いた、形だけの見込みです。金属の本当の流れや熱は計算しません。どちらの描き方にも合わない技は、描かずにそう言います。本当にどうなるかは試して確かめ、最後に決めるのは職人です。<a href="${RESTORE}/demo-wauchi/moyou">この例（輪打ち金筋）を画面で見る</a></p>
      </div>
      <div class="own">
        <div class="own-t">
          <h3 class="rv">職人の帳面が加われば、<br>失われた技も、<br class="sm">組み立て直せるかもしれません。</h3>
          <p class="rv">本番は、答えのない技に使います。残った品物、古い記録、職人の帳面や見立てを渡すと、Claude が工程の案を作ります。職人が試した結果を書くと、案が組み直されます。確かめた工程だけが、その技の決まりになります。</p>
          <p class="links rv"><a href="${RESTORE}">自分の技を組み立て直す</a></p>
        </div>
        <figure class="own-f rv">${img("restore-flow", "途切れた技の流れ。分かることを入れる、Claude が作り方の案を出す、試して結果を入れる", "(max-width: 760px) 92vw, 560px")}</figure>
      </div>
    </div>
  </section>

  <section class="ifever" aria-label="工房に">
    <p class="v ifever-v rv">工房に入れておけば、<br>万が一の時に役立ちます。</p>
  </section>

  <section class="stance" aria-labelledby="stance-h">
    <h2 id="stance-h" class="rv">決めるのは、職人です。</h2>
    <p class="rv">Claude は職人の決まりを読み、案を出し、理由を残します。</p>
  </section>

  <section class="end" aria-labelledby="end-h">
    <div class="end-v">
      <h2 id="end-h" class="v end-h rv">職人の判断を、<br>次の人へ。</h2>
      <p class="v end-t rv">継ぐ</p>
    </div>
    <p class="end-made rv">このアプリも、彫金職人が Claude Code と作りました。</p>
    <div class="cta rv">
      <a class="btn primary" href="${STUDIO}">設計する</a>
      <a class="btn" href="${LEDGER}">帳面</a>
      <a class="btn" href="${LEARN}">学ぶ</a>
      <a class="btn" href="${WAZA}">技</a>
    </div>
    <p class="end-n note rv">公開の版は、開くときに合言葉を聞きます。</p>
    <p class="note rv"><a href="${GITHUB}#readme" rel="noopener">このアプリの作り方（GitHub）</a></p>
  </section>
</main>

<footer class="ft">
  <div class="ft-in">
    <p class="ft-top"><span class="brand">継ぐ</span><a href="${GITHUB}" rel="noopener">GitHub</a></p>
    <p>指輪・図面・帳面などの写真と動く絵は、継ぐの画面を撮ったものです。手の動画と、テンションの仕上がった指輪の写真は、職人が撮った本物の手元です。品物の写真：</p>
    <ul class="credits">${CREDITS.map((c) => `<li>${c.what} ― ${c.src}、<a href="${c.href}" rel="noopener">出典</a>（${c.lic}）</li>`).join("")}</ul>
    <p>ライブラリとフォントのライセンスは GitHub の README に。継ぐは MIT ライセンスです。</p>
  </div>
</footer>`;

const root = document.getElementById("lp")!;
root.innerHTML = html;
bindFlowMotion(root);

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const canWatch = "IntersectionObserver" in window;

// 字は動かさず、濃くなるだけ（動きを減らす設定なら、はじめから全部見せる）
const els = [...root.querySelectorAll<HTMLElement>(".rv")];
if (reduce || !canWatch) {
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
    { rootMargin: "0px 0px -6% 0px", threshold: 0.05 },
  );
  els.forEach((e) => io.observe(e));
}

// 移り変わる絵：画面に入っている間だけ、ゆっくり次の絵へ。ボタンを押したら、その絵で止める。動きを減らす設定では自動で変えない
function bindCrossfade(box: HTMLElement) {
  const items = [...box.querySelectorAll<HTMLElement>(".xf-i")];
  const dots = [...box.querySelectorAll<HTMLButtonElement>(".xf-dots button")];
  const cap = box.querySelector<HTMLElement>(".xf-cap")!;
  const caps = dots.map((d) => d.getAttribute("aria-label")!.replace(/^\d+\.\s*/, ""));
  const every = Number(box.dataset.every) || 4200;
  let at = 0;
  let timer = 0;
  let held = false;
  const show = (i: number) => {
    at = (i + items.length) % items.length;
    items.forEach((x, k) => {
      x.classList.toggle("on", k === at);
      x.setAttribute("aria-hidden", String(k !== at));
    });
    dots.forEach((d, k) => (k === at ? d.setAttribute("aria-current", "true") : d.removeAttribute("aria-current")));
    cap.textContent = caps[at];
  };
  const stop = () => {
    clearInterval(timer);
    timer = 0;
  };
  const run = () => {
    if (timer || held || reduce) return;
    timer = window.setInterval(() => show(at + 1), every);
  };
  dots.forEach((d, k) =>
    d.addEventListener("click", () => {
      held = true;
      stop();
      show(k);
    }),
  );
  if (canWatch) new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? run() : stop())), { threshold: 0.35 }).observe(box);
}
root.querySelectorAll<HTMLElement>(".xf").forEach(bindCrossfade);

// 動く絵：画面に入ったら流し、出たら止める。動きを減らす設定では流さない（止めた絵のまま）
const clips = [...root.querySelectorAll<HTMLVideoElement>("video.clip")];
if (!reduce && canWatch) {
  const vio = new IntersectionObserver(
    (es) =>
      es.forEach((e) => {
        const v = e.target as HTMLVideoElement;
        if (e.isIntersecting) void v.play().catch(() => undefined);
        else v.pause();
      }),
    { threshold: 0.25 },
  );
  clips.forEach((v) => vio.observe(v));
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
      <div class="mk-h"><span class="mk-n">${escH(c.no)}</span><div><h4>${escH(c.title)}</h4><p>${head}</p></div></div>
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
// 作り方の札は、近くまで来てから読む（はじめの読み込みを軽く）
const mk = root.querySelector(".mk-live");
if (mk && canWatch) {
  const mio = new IntersectionObserver((es) => {
    if (!es.some((e) => e.isIntersecting)) return;
    mio.disconnect();
    void mountMake();
  }, { rootMargin: "600px 0px" });
  mio.observe(mk);
} else void mountMake();

// 上の帯：少し下にスクロールしたら、背景を濃くする
const hd = root.querySelector<HTMLElement>(".hd")!;
const onScroll = () => hd.classList.toggle("solid", scrollY > 24);
addEventListener("scroll", onScroll, { passive: true });
onScroll();
