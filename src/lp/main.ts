// 継ぐの入口のページ。何の道具か・なぜ作ったかを短く伝えて、エディター（studio.html）へ送る。
// 文字と図は HTML・CSS・SVG で描く（写真や外の画像は使わない）。3D の見本は、読み込みが終わってから遅れて出す。
import "./lp.css";

const START = "studio.html";

const icon = {
  make: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10l4 5-9 11L3 9z"/><path d="M3 9h18M9 4l-1.5 5L12 20M15 4l1.5 5L12 20"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.3l2.6 2.6 5-5.4"/></svg>`,
  build: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4.5h10.5l4 2.5-4 2.5H4z"/><path d="M9 9.5V20.5"/><path d="M4 4.5v5"/></svg>`,
  keep: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H11l-4.5 3.5V16H4z"/><path d="M8 9h8M8 12.5h5"/></svg>`,
  arrow: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>`,
};

/** 国が指定した伝統的工芸品の作り手の数（出典：伝統的工芸品産業振興協会） */
const MAKERS = [
  { label: "1979 年", n: 288000, text: "28 万 8 千人" },
  { label: "2022 年度", n: 48000, text: "4 万 8 千人" },
];

function makersChart(): string {
  const max = MAKERS[0].n;
  const rows = MAKERS.map(
    (m, i) => `<div class="bar-row${i ? " now" : ""}" title="${m.label}：${m.text}">
      <span class="bar-y">${m.label}</span>
      <span class="bar-track"><span class="bar" style="width:${((100 * m.n) / max).toFixed(1)}%"></span></span>
      <span class="bar-v">${m.text}</span>
    </div>`,
  ).join("");
  return `<div class="bars" role="img" aria-label="伝統的工芸品の作り手の数。1979 年 28 万 8 千人、2022 年度 4 万 8 千人。">${rows}</div>`;
}

function card(ic: string, title: string, sub: string, body: string): string {
  return `<article class="card reveal"><div class="ic">${ic}</div><div><h3>${title}<small>${sub}</small></h3><p>${body}</p></div></article>`;
}

const html = `
<header class="hd">
  <div class="hd-in">
    <a class="brand" href="./" aria-label="継ぐ"><span class="logo">継</span>継ぐ</a>
    <nav class="nav">
      <a href="#why">なぜ継ぐ</a>
      <a href="app.html#rebuild">組み立て直す</a>
      <a class="btn primary" href="${START}">はじめる</a>
    </nav>
  </div>
</header>

<main>
  <section class="hero">
    <div class="hero-text">
      <p class="eyebrow">宝飾の設計と、作り方の道具</p>
      <h1>職人の判断を、<br />次の人へ。</h1>
      <p class="lead">写真や言葉から、作れる形と作り方まで。<br class="br-wide" />宝飾の彫金職人が、Claude と作りました。</p>
      <div class="cta">
        <a class="btn primary lg" href="${START}">はじめる ${icon.arrow}</a>
        <a class="btn lg" href="#why">なぜ継ぐ</a>
      </div>
    </div>
    <figure class="stage" aria-label="見本の指輪（ゆっくり回る 3D）">
      <div class="stage-gl" id="hero-gl"></div>
      <span class="stage-tag tl">透視 · レンダリング</span>
      <figcaption class="stage-tag bl"><span>ラウンド <b class="num">6.5 mm</b></span><span>爪留め</span><span><b class="num">11</b> 号</span><span>K18</span></figcaption>
    </figure>
  </section>

  <section class="sec" id="why">
    <div class="sec-head reveal">
      <p class="k">なぜ継ぐ</p>
      <h2>描いて、戻されて、また描く。</h2>
      <p>ジュエリーは、ラフ、清書、CAD、製作と進みます。CAD の段で「これは作れない」と分かると、デザイナーへ戻る。その往復のたびに、待つ時間と費用がかかります。作れるかの判断は、職人の頭の中にあるからです。</p>
    </div>
    <div class="flow reveal">
      <div class="flow-col">
        <h4>これまで</h4>
        <ol class="steps old">
          <li><b>ディレクター</b><small>ラフ</small></li>
          <li class="bad"><b>デザイナー</b><small>清書</small><span class="back" aria-hidden="true"><span>作れない</span><span>描き直し</span></span></li>
          <li class="bad"><b>CAD</b><small>設計</small></li>
          <li><b>製作</b><small>職人・工房</small></li>
        </ol>
      </div>
      <div class="flow-col">
        <h4>継ぐ</h4>
        <ol class="steps new">
          <li><b>言葉・絵・石の写真</b><small>誰でも</small></li>
          <li class="hub"><b>継ぐ</b><small>形 · 作れるか · 作り方 · 図面</small></li>
          <li><b>製作</b><small>鋳造・鍛造</small></li>
        </ol>
      </div>
    </div>
  </section>

  <section class="sec">
    <div class="sec-head reveal">
      <p class="k">できること</p>
      <h2>形を組み、確かめ、作り方まで。</h2>
    </div>
    <div class="cards">
      ${card(icon.make, "生む", "形を組む", "石の写真、言葉、手で描いた絵から、指輪の形を組みます。")}
      ${card(icon.check, "確かめる", "作れるか", "作れるかと寸法を、職人の目安で確かめます。だめな所は、直し方といっしょに。")}
      ${card(icon.build, "作る", "作り方", "鋳造と鍛造の手順、図面、STL。道具と数字まで示します。")}
      ${card(icon.keep, "記録", "コツを残す", "職人が話すと、工程ごとのコツになります。次の人の設計に効きます。")}
    </div>
  </section>

  <section class="sec">
    <div class="split">
      <div class="sec-head reveal">
        <p class="k">目安帳</p>
        <h2>職人の一言が、全部に効く。</h2>
        <p>職人がひとこと話すと、Claude がそれを目安帳の一行にします。その一行で、これまでの作品をすべて確かめ直し、これからの設計にも同じ目安が効きます。</p>
        <p class="note">目安の値は、出典か職人の言葉から。最後は職人が決めます。</p>
        <p class="note try">合言葉がなくても試せます：「確かめる」の「Claude なしで、数字で書く」で決まりを足し、記録に「見本の作品」を入れると、これまでの作品が確かめ直されます。</p>
      </div>
      <div class="spread reveal" aria-label="一言が、これまでとこれからの設計に広がる図">
        <div class="say">
          <span class="who">職人</span>
          <q>この大きさの石なら、爪はもう少し太く。</q>
        </div>
        <div class="down" aria-hidden="true"></div>
        <div class="rule"><span class="rule-k">目安帳</span><span class="rule-t">爪の太さ · 石の大きさに合わせる</span><span class="rule-s">追加</span></div>
        <div class="fan" aria-hidden="true"></div>
        <div class="outs">
          <div class="out">
            <h4>これまでの作品</h4>
            <div class="works">${Array.from({ length: 12 }, (_, i) => `<i class="${[2, 7, 9].includes(i) ? "re" : ""}"></i>`).join("")}</div>
            <small>すべて確かめ直す</small>
          </div>
          <div class="out">
            <h4>これからの設計</h4>
            <div class="works next">${Array.from({ length: 12 }, () => "<i></i>").join("")}</div>
            <small>はじめから目安に入る</small>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="sec">
    <div class="split">
      <div class="sec-head reveal">
        <p class="k">継ぐ理由</p>
        <h2>作り手は、40 年あまりで<br />約 <span class="num">6</span> 分の <span class="num">1</span>。</h2>
        <p>国が指定した伝統工芸の作り手は、28 万 8 千人（1979 年）から 4 万 8 千人（2022 年度）に減りました。</p>
        <p>何年もかけて作り、20 年に一度しか作り直さない技があります。一人の職人が一生のうちに関われるのは、2 回か 3 回。繰り返しでは覚えきれない技は、残さないと途切れます。</p>
      </div>
      <figure class="chart reveal">
        <figcaption>伝統的工芸品の作り手の数</figcaption>
        ${makersChart()}
        <p class="src">出典：伝統的工芸品産業振興協会</p>
      </figure>
    </div>
  </section>

  <section class="sec">
    <div class="sec-head reveal">
      <p class="k">失われた技も</p>
      <h2>手がかりから、作り方を組み立て直す。</h2>
    </div>
    <div class="lost">
      <a class="lost-card reveal" href="app.html#rebuild">
        <h3>組み立て直す</h3>
        <p>作り方が途切れた技を、残った品物と材料の手がかりだけから Claude が組み立て、隠しておいた本当の作り方と答え合わせをします。最初の題材は、刀の金具などに残る、木の板の目のような模様の金属の技。名前は答え合わせまで隠します。</p>
        <span class="go">組み立て直す ${icon.arrow}</span>
      </a>
    </div>
  </section>

  <section class="sec end reveal">
    <h2>まず、石を一つ。</h2>
    <p>写真がなくても、よくある形から始められます。Claude を使う所のほかは、合言葉なしで全部使えます。</p>
    <a class="btn primary lg" href="${START}">はじめる ${icon.arrow}</a>
  </section>
</main>

<footer class="ft">
  <div class="ft-in">
    <span><span class="logo sm">継</span>Built with Claude: Japan 2026 の作品</span>
    <a href="https://github.com/ohri0/tsugu-craft" rel="noopener">GitHub</a>
    <span class="ft-note">数字は目安。最後は職人が決めます。</span>
  </div>
</footer>`;

const root = document.getElementById("lp")!;
root.innerHTML = html;

// 少しずつ見せる（動きを減らす設定なら、はじめから全部見せる）
const els = [...root.querySelectorAll<HTMLElement>(".reveal")];
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
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );
  els.forEach((e) => io.observe(e));
}

// 3D の見本は、文字が出たあとで読み込む（three.js は大きい）
const host = document.getElementById("hero-gl")!;
const light = matchMedia("(max-width: 720px), (pointer: coarse)").matches;
const later = (f: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(f, { timeout: 800 }) : setTimeout(f, 200));
later(() => {
  import("./hero3d")
    .then((m) => {
      m.startHero(host, light);
      host.parentElement?.classList.add("ready");
    })
    .catch(() => host.parentElement?.classList.add("no-gl"));
});
