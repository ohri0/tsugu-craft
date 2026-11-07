// 本当に途切れた技（ダマスカス鋼）の絵を、動画の場面の候補と、帳面のあり・なしの比べに並べる（2026-11-08）。
// 絵は scripts/pattern-lost.ts と scripts/pattern-demo.ts が描いた物をそのまま使う。ここでは並べて字を足すだけ。
// 使い方：node scripts/lost-compose.cjs
// 出すもの：docs/pattern-demo/lost/beat-candidate.png（1920×1080）・beat-candidate-<n>.png（字の候補ちがい）・damascus-compare.png
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DIR = path.resolve('docs/pattern-demo');
const LOST = `${DIR}/lost`;
const url = (f) => 'file://' + f;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** 動画の場面の字の候補（作者が選ぶ） */
const CAPTIONS = [
  ['本当に途切れた技も、作り話の技も。', '手順から、模様を見込みます。'],
  ['途切れた技を、手順から描き直す。', 'まだこの世にない技でも。'],
  ['昔に失われた技でも、思い描いただけの技でも、', '作り方の案から、模様が見えてきます。'],
];

const REAL = [
  { img: `${LOST}/wootz-book-stage1.png`, label: '鋳た塊の中のむら' },
  { img: `${LOST}/wootz-book-stage2.png`, label: '叩いてのばす' },
  { img: `${LOST}/wootz-book-top.png`, label: '溝を彫って平らにし、色を出す' },
];
const MADE = [
  { img: `${DIR}/kasumi-top.png`, label: '霞刃の小刀' },
  { img: `${DIR}/uzu-top.png`, label: '渦金の帯留め' },
  { img: `${DIR}/sukashibori-top.png`, label: '花透かしの縁彫り板' },
];

const BASE_CSS = `*{box-sizing:border-box}html,body{margin:0;background:#0b0b0c;color:#f5f5f7;font-family:"Hiragino Sans","Noto Sans JP",sans-serif;-webkit-font-smoothing:antialiased}`;

function beatHtml(cap) {
  const row = (head, sub, tiles) => `
    <div class="row"><div class="rh"><b>${head}</b><span>${sub}</span></div>
      ${tiles.map((t) => `<figure><img src="${url(t.img)}"><figcaption>${esc(t.label)}</figcaption></figure>`).join('')}
    </div>`;
  return `<!doctype html><meta charset="utf-8"><style>${BASE_CSS}
  body{width:1920px;height:1080px;overflow:hidden;padding:56px 0 0}
  h1{margin:0 0 34px;text-align:center;font:400 46px/1.35 "Hiragino Mincho ProN","Noto Serif JP",serif;letter-spacing:.04em}
  .row{display:flex;align-items:flex-start;justify-content:center;gap:28px;margin-bottom:22px}
  .rh{width:250px;padding-top:110px;text-align:right}
  .rh b{display:block;font-size:26px;font-weight:600;color:#e8c27a}.rh span{display:block;margin-top:8px;font-size:17px;color:#9a9aa2;line-height:1.5}
  figure{margin:0;width:300px}img{width:300px;height:300px;display:block;border-radius:6px}
  figcaption{margin-top:9px;text-align:center;font-size:19px;color:#d8d8dc}
  .foot{position:absolute;left:0;right:0;bottom:26px;text-align:center;font-size:16px;color:#8a8a92;line-height:1.6}
  .row:first-of-type figure:not(:last-child)::after{content:""}
  </style><body>
  <h1>${cap.map(esc).join('<br>')}</h1>
  ${row('本当に途切れた技', 'ダマスカス鋼（ウーツ鋼）<br>資料の手がかりから', REAL)}
  ${row('架空の技', '作り話の手がかりから', MADE)}
  <div class="foot">※ どれも、Claude が出した手順を計算で描いた、形だけの見込み。数は絵のための仮の値。<br>上の段の網目の形と数は仮（模様の元は、説が分かれていて、まだはっきりしない）。</div>
  </body>`;
}

function compareHtml() {
  const side = (v, label, note) => {
    const f = JSON.parse(fs.readFileSync(`${LOST}/cases/wootz-${v}.json`, 'utf8')).project;
    const plan = f.plans[0];
    const title = (id) => plan.book.find((b) => b.id === id)?.title ?? id;
    const steps = plan.steps
      .map((s, i) => {
        const tag = s.book_ids?.length
          ? `<em class="bk">職人の帳面から：${s.book_ids.map((b) => esc(title(b))).join('・')}</em>`
          : s.basis === 'prior'
            ? '<em class="pr">Claude がもともと知っていること</em>'
            : '<em class="cl">手がかりから</em>';
        return `<li><b>${i + 1}. ${esc(s.title)}</b>${tag}</li>`;
      })
      .join('');
    const nb = plan.steps.filter((s) => s.book_ids?.length).length;
    const np = plan.steps.filter((s) => s.basis === 'prior').length;
    return `<section><h2>${label}</h2><p class="n">${note}　帳面から ${nb}・もともとの知識 ${np}（工程 ${plan.steps.length}）</p>
      <img src="${url(`${LOST}/wootz-${v}-top.png`)}"><ol>${steps}</ol></section>`;
  };
  return `<!doctype html><meta charset="utf-8"><style>${BASE_CSS}
  body{width:1600px;padding:40px 48px}
  h1{margin:0 0 6px;font-size:30px;font-weight:600}.lead{margin:0 0 26px;color:#a8a8b0;font-size:17px;line-height:1.6}
  .cols{display:flex;gap:48px}section{flex:1}
  h2{margin:0 0 4px;font-size:26px;color:#e8c27a}.n{margin:0 0 14px;color:#9a9aa2;font-size:15px}
  img{width:420px;height:420px;display:block;border-radius:6px;margin-bottom:16px}
  ol{list-style:none;margin:0;padding:0}li{padding:9px 0;border-top:1px solid #26262a;font-size:17px;line-height:1.45}
  li b{display:block;font-weight:500}em{font-style:normal;font-size:14px;display:inline-block;margin-top:4px;padding:2px 8px;border-radius:4px}
  .bk{background:#3a2f14;color:#f0cf86}.pr{background:#2c2533;color:#c9b6e0}.cl{background:#1b2a33;color:#9fc6dc}
  .foot{margin-top:22px;color:#8a8a92;font-size:14px;line-height:1.6}
  </style><body>
  <h1>ダマスカス鋼（ウーツ鋼）の模様：同じ手がかり 6 つで、本物の Claude に 2 回</h1>
  <p class="lead">左は職人の帳面を外して、右は帳面を渡して（2026-11-08 に足した、石川さんの木目金の帳面の言葉 5 つも入る）。どちらも案 1 と、その手順から描いた模様の見込み。</p>
  <div class="cols">${side('solo', 'Claude だけで組み立てた', '帳面なし。')}${side('book', '帳面の言葉も使った', '帳面あり。')}</div>
  <p class="foot">絵はほぼ同じ（どちらの案も、塊 → のばす → 溝を彫って平らに → 削る → 色を出す、になった）。ちがうのは根拠：帳面なしでは、はしごの段と色を出す工程が「Claude がもともと知っていること」の推し量りで、帳面ありでは、その所が職人の帳面の言葉に支えられた。<br>※ 絵は、Claude が手順を計算の操作に置きかえ、形だけで描いた見込み。網目の数・のばす割合・溝の深さなどは、絵のための仮の値（Claude が決めた）。<br>記録：docs/pattern-demo/lost/cases/wootz-solo.log.md・wootz-book.log.md</p>
  </body>`;
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const tmp = path.resolve('docs/pattern-demo/lost/.compose.html');
  const render = async (html, out, full) => {
    fs.writeFileSync(tmp, html);
    await p.goto(url(tmp));
    await p.waitForTimeout(300);
    await p.screenshot({ path: out, fullPage: full });
    console.log(out);
  };
  await render(beatHtml(CAPTIONS[0]), `${LOST}/beat-candidate.png`, false);
  for (const [i, c] of CAPTIONS.entries()) if (i > 0) await render(beatHtml(c), `${LOST}/beat-candidate-${i + 1}.png`, false);
  await p.setViewportSize({ width: 1600, height: 900 });
  await render(compareHtml(), `${LOST}/damascus-compare.png`, true);
  fs.unlinkSync(tmp);
  await b.close();
})();
