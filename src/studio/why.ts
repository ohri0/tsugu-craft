// 「なぜ継ぐ」のページ：行ったり来たりの図、20 年に一度の技と職人の一生、判断を残して次の人へ渡すこと。
// 図は SVG と CSS で描く。設計の画面（studio.html）と入口のページ（index.html）の両方が、この中身を開く。
// 数字は出典のあるものだけ。作者の話から書いていた「すべての種類を一通り作るのに 10 年近く」は、公の資料で確かめられなかったので外した（docs/LOG.md 2026-11-05）。
import "./why.css";

/** 職人の一生（図のための例。特定の人や計画ではない）と、作り直しの間（20 年）。first：図で最初の作り直しの年（歳） */
export const LIFE = { start: 22, end: 65, cycle: 20, first: 24 };

/** 一人の職人が、一生のうちに関われる作り直しの回数 */
export function chances(start: number, end: number, cycle: number, offset = 0): number {
  let n = 0;
  for (let y = offset; y < 120; y += cycle) if (y >= start && y <= end) n++;
  return n;
}

/** 国土交通白書の出どころ（「この20年の周期によって、多い人で3回の遷宮に携わることができます。」。社殿を作る技能者の話） */
export const HAKUSHO_URL = "https://www.mlit.go.jp/hakusyo/mlit/h25/hakusho/h26/html/n1233c20.html";

/**
 * 行ったり来たりの図。「デザイン・設計（CAD）」→「制作」。戻りは制作から「デザイン・設計」へ（設計の人の仕事を奪う絵にしない。作者の声）。
 * 朱の線は、線と同じ path を 1 秒ほどで引く（線の上から外れない。動きを減らす設定では、線を止めて出すだけ）
 */
export function flowBeforeSvg(): string {
  return `<svg class="ff" viewBox="0 0 360 150" role="img" aria-label="デザイン・設計（CAD）から制作へ進み、制作で作れないと分かると、制作からデザイン・設計へ戻る">
    <g class="ff-labels">
      <text x="118" y="132" text-anchor="middle">デザイン・設計<tspan>（CAD）</tspan></text>
      <text x="326" y="132" text-anchor="middle">制作</text>
    </g>
    <path class="ff-go" d="M226 126H296M292 122l4 4-4 4"/>
    <path class="ff-back" d="M326 106C300 26 144 26 118 106"/>
    <path class="ff-tip" d="M113 100l5 6 7-3"/>
    <path class="ff-mark" pathLength="100" d="M326 106C300 26 144 26 118 106"/>
    <text class="ff-say" x="222" y="30" text-anchor="middle">作れない</text>
  </svg>`;
}

/**
 * 継ぐがあるとき：継ぐの枠が「デザイン・設計」と職人の判断を包み、そこから制作へまっすぐ 1 本（作者の声）。
 * 戻りは極限まで少なくなるが、なくなるとは言わないので、ごく細く薄い線を残す
 */
export function flowAfterSvg(): string {
  return `<svg class="ff" viewBox="0 0 360 150" role="img" aria-label="継ぐの枠の中に、デザイン・設計（CAD）と職人の判断がある。そこから制作へまっすぐ進む。戻りはごく細い線だけ">
    <path class="ff-faint" d="M326 66C316 14 262 6 214 18"/>
    <rect class="ff-box" x="4" y="18" width="226" height="126"/>
    <g class="ff-labels">
      <text class="ff-in" x="117" y="52" text-anchor="middle">継ぐ</text>
      <text x="117" y="92" text-anchor="middle">デザイン・設計<tspan>（CAD）</tspan></text>
      <text x="117" y="126" text-anchor="middle">職人の判断</text>
      <text x="326" y="92" text-anchor="middle">制作</text>
    </g>
    <path class="ff-go" d="M230 86H296M292 82l4 4-4 4"/>
  </svg>`;
}

/**
 * 20 年ごとの作り直しと、職人の一生。線と字は HTML（スマホでも PC でも字の大きさが変わらない）。
 * 各回は点でなく、端がぼやけた帯（1 回作るのに何年もかかる。具体的な年数は聞いていないので、長さが年数に読めないようにぼかす。年数は書かない）
 */
function lifeHtml(): string {
  const at = (age: number) => `${(((age - 15) / 55) * 100).toFixed(2)}%`;
  const marks: string[] = [];
  let n = 0;
  for (let y = LIFE.first; y <= LIFE.end; y += LIFE.cycle) {
    n++;
    marks.push(`<i class="lf-band" style="left:${at(y)}"><b>${n} 回目<small>制作</small></b></i>`);
  }
  const axis = [20, 40, 60].map((a) => `<span style="left:${at(a)}">${a} 歳</span>`).join("");
  return `<div class="lf" role="img" aria-label="20 年ごとの作り直しに、22 歳から 65 歳まで働く職人が関われるのは、多くて 3 回ほど（図は例）">
    <p class="lf-lab">20 年ごとの作り直し</p>
    <div class="lf-track">${marks.join("")}</div>
    <div class="lf-life" style="left:${at(LIFE.start)};width:calc(${at(LIFE.end)} - ${at(LIFE.start)})"></div>
    <div class="lf-axis">${axis}</div>
    <p class="lf-lab">職人の一生（例）</p>
  </div>`;
}

/** standalone：入口のページから開くとき。最後の「はじめる」は設計の画面へのリンクになる */
export function whyHtml(opts: { standalone?: boolean } = {}): string {
  return `<div class="why-in">
  <button type="button" class="why-close" aria-label="閉じる">×</button>

  <header class="wy-head">
    <h2 class="wy-title">なぜ継ぐ</h2>
    <p class="wy-lead">作れるかどうかの判断は、職人の頭の中にあります。<br>職人がいなくなれば、その判断も消えます。</p>
  </header>

  <section class="wy-sec wy-paper">
    <div class="wy-w">
      <h3>描いて、<wbr>戻されて、<wbr>また描く。</h3>
      <p>ジュエリーは、デザイン・設計（CAD）から制作へ進みます。制作の段で「これは作れない」と分かると、何度も戻ってきます。そのたびに、待つ時間と費用がかかり、思った物と違う物ができることもあります。</p>
      <div class="wy-flow">
        <figure><figcaption>これまで</figcaption>${flowBeforeSvg()}</figure>
        <figure><figcaption>継ぐがあると</figcaption>${flowAfterSvg()}</figure>
      </div>
      <p>継ぐの中で、デザインと設計を、職人の判断で確かめながら進めます。だから制作まで進み、戻りは極限まで少なくなります。設計も制作も、人の仕事のままです。</p>
    </div>
  </section>

  <section class="wy-sec">
    <div class="wy-w">
      <h3>20 年に一度の技は、<wbr>繰り返しでは<wbr>覚えられない。</h3>
      <p>何年もかけて作り、20 年に一度しか作り直さない技があります。たとえば伊勢神宮の式年遷宮では、社殿も、御装束神宝と呼ばれる品々も、すべて新しく作り直されます。</p>
      <p>神宮によると、御装束神宝は 714 種、1,576 点。国の白書によると、遷宮に関わる技能者が携われるのは、多い人で 3 回ほどです。繰り返して覚えることはできません。</p>
    </div>
    ${lifeHtml()}
    <p class="wy-src wy-w">図は例です。出典：<a href="https://www.isejingu.or.jp/sengu/the63rd/about.html" target="_blank" rel="noopener">神宮「第 63 回 式年遷宮」</a>／<a href="${HAKUSHO_URL}" target="_blank" rel="noopener">国土交通白書 平成 26 年版のコラム</a>（3 回ほどは、社殿を作る技能者の話です）</p>
    <figure class="wy-photo">
      <img src="/heritage/naiku-1953.jpg" alt="1953 年の内宮を空から撮った写真。上が新しい殿舎、下がそれまでの殿舎" loading="lazy" decoding="async" />
      <figcaption>1953 年の内宮。上が新しい殿舎、下がそれまでの殿舎。本田照夫 撮影／Wikimedia Commons・パブリックドメイン</figcaption>
    </figure>
    <figure class="wy-tachi">
      <img src="/heritage/goshinpo-gyokuhai.jpg" width="1800" height="793" alt="内宮御神宝図の一部。玉と金の飾りをつないだ玉佩の絵" loading="lazy" decoding="async" />
      <img src="/heritage/goshinpo-tachi.jpg" width="1800" height="793" alt="内宮御神宝図の一部。金の飾りのある太刀の絵" loading="lazy" decoding="async" />
      <figcaption>神宝を描いた図。内宮御神宝図（部分。江戸時代の写し）、<a href="https://commons.wikimedia.org/wiki/File:NDL2574228_%E5%86%85%E5%AE%AE%E5%BE%A1%E7%A5%9E%E5%AE%9D%E5%9B%B3.(1).pdf" target="_blank" rel="noopener">国立国会図書館所蔵／Wikimedia Commons</a>・パブリックドメイン。写真ではありません。</figcaption>
    </figure>
    <div class="wy-w">
      <h3>刀の金具も、<wbr>同じ彫金の技で。</h3>
      <p>鐔や太刀の飾り金具は、ジュエリーと同じ彫金・金工の技で作られます。</p>
    </div>
    <figure class="wy-tachi">
      <img src="/heritage/itomaki-tachi-tsuka.jpg" width="1400" height="640" alt="太刀の拵えの柄の部分。金の鐔と、柄の間からのぞく金の飾り金具" loading="lazy" decoding="async" />
      <img src="/heritage/kozuka-carp.jpg" width="1800" height="436" alt="小柄に寄ったところ。細かな地の上に、金の鯉と波" loading="lazy" decoding="async" />
      <img src="/heritage/menuki-tiger.jpg" width="1400" height="619" alt="金の目貫。竹の葉と虎。虎の毛が細い線で刻まれている" loading="lazy" decoding="async" />
      <figcaption>上から、糸巻太刀拵の柄（江戸時代）、小柄（こづか＝小刀の柄。18 世紀）、目貫（めぬき＝柄の飾り金具。17 世紀）。メトロポリタン美術館（<a href="https://www.metmuseum.org/art/collection/search/894754" target="_blank" rel="noopener">2023.735.6a–e</a>・<a href="https://www.metmuseum.org/art/collection/search/24755" target="_blank" rel="noopener">45.24.14</a>・<a href="https://www.metmuseum.org/art/collection/search/24733" target="_blank" rel="noopener">45.24.44</a>）・パブリックドメイン（CC0）</figcaption>
    </figure>
    <div class="wy-w wy-stat">
      <p class="wy-big">約 6 割</p>
      <p>国の伝統的工芸品の従業員は、約 11.5 万人（1998 年度）から約 4.8 万人（2022 年度）へ。製造業では、65.8% の事業所が、技能の継承に問題があるとしています。</p>
      <p class="wy-src">出典：<a href="https://www.bunka.go.jp/seisaku/bunkashingikai/bunkazai/kikaku/r07_r08/05/pdf/94408301_03.pdf" target="_blank" rel="noopener">経済産業省 説明資料（文化庁サイト掲載）</a>／<a href="https://www.mhlw.go.jp/stf/houdou/newpage_00233.html" target="_blank" rel="noopener">厚生労働省 令和 7 年度 能力開発基本調査</a></p>
    </div>
  </section>

  <section class="wy-sec wy-paper">
    <div class="wy-w">
      <h3>だから、<wbr>残して、渡す。</h3>
      <ol class="wy-steps">
        <li><b>残す</b><span>Claude が職人の言葉を読み取り、数字つきの決まりの案にします。職人が案を見て「これでいい」を押すと、工房の帳面に残ります。</span></li>
        <li><b>デザインする人へ</b><span>作れない所は、描いている間に赤く光ります。作り方まで、その場で出ます。</span></li>
        <li><b>学ぶ人へ</b><span>先生や先輩を待たずに、理由つきの答えが出ます。手の感覚は、人から受け取ります。</span></li>
        <li><b>次の時代へ</b><span>もし途切れても、残った手がかりから、作り方を組み立て直す試みができます。工房に入れておけば、万が一の時に役立ちます。</span></li>
      </ol>
      ${opts.standalone ? `<a class="wy-go" href="studio.html">設計してみる</a>` : `<button type="button" class="wy-go why-go">設計に戻る</button>`}
    </div>
  </section>
</div>`;
}
