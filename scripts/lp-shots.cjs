// 入口のページ（index.html）に載せる、継ぐの本物の画面を撮る。
// 毎回、新しいブラウザ（使った跡のない状態）で撮る。合言葉は使わない（Claude を呼ばない操作だけ）。
// 使い方：npx vite build --outDir <作業用> して npx vite preview --outDir <作業用> --port 5360 で動かしてから
//   node scripts/lp-shots.cjs [撮る物の名前…]（なしなら全部）
// 2 倍の細かさで撮り、cwebp で webp にして public/lp/ に置く（大きい物と、半分の幅の -sm の 2 つ）。
// 変えるとき：TSUGU_BASE＝継ぐを動かしている所、TSUGU_LP_WORK＝撮った PNG を置く所
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.env.TSUGU_BASE || 'http://localhost:5360';
const WORK = process.env.TSUGU_LP_WORK || fs.mkdtempSync(path.join(os.tmpdir(), 'tsugu-lp-'));
const OUT = path.join(__dirname, '..', 'public', 'lp');
fs.mkdirSync(OUT, { recursive: true });
const W = 1440, H = 900;
/** 見せるの表示で、指輪が入る所（右半分） */
const RING = { x: 620, y: 30, width: 720, height: 800 };
/** 設計の画面の 3D の所（左の道具の帯・上の帯・下の希望の欄を除く） */
const VP = { x: 44, y: 44, width: 1056, height: 782 };
/** 帳面・技は、スマホの幅で撮る（字が大きく読める） */
const PHONE_W = 480;
/** 3D を GPU で描く（ないと描くたびに長く止まり、押した後の待ちが切れる） */
const GPU = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];

let browser;
/** この回で撮った物（作業用のフォルダのほかの PNG は触らない） */
const made = [];
const shot = async (p, name, opts = {}) => {
  await p.screenshot({ path: `${WORK}/${name}.png`, ...opts });
  made.push(name);
};
async function page(url, w = W) {
  const p = await (await browser.newContext({ viewport: { width: w, height: H }, deviceScaleFactor: 2 })).newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(BASE + url, { waitUntil: 'networkidle' });
  return p;
}
/** スマホの幅の下に出る、決まった位置の帯（設計・帳面・学ぶ・技）を隠す（切り取った写真に重ならないように） */
const hideFixed = (p) => p.evaluate(() => document.querySelectorAll('body *').forEach((e) => { if (getComputedStyle(e).position === 'fixed') e.style.display = 'none'; }));
/** 押す（3D を描いている間でも止まらないように、ページの中で押す） */
const tap = (p, sel) => p.evaluate((s) => document.querySelector(s).click(), sel);
const refine = async (p) => { await tap(p, '.tabs [data-mode="refine"]'); await p.waitForTimeout(1200); };
const render = async (p) => { await tap(p, '.disp [data-disp="render"]'); await p.waitForTimeout(1200); };
const openManual = async (p) => {
  if (!(await p.locator('details.manual[open]').count())) { await tap(p, 'details.manual > summary'); await p.waitForTimeout(600); }
};
const probs = (p) => p.evaluate(() => (window.__studio.session.built?.problems ?? []).map((x) => x.check));
/** 断面の編集の SVG の mm → ページの px */
async function secMap(p) {
  await p.evaluate(() => document.querySelector('.sec-edit')?.scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(400);
  const m = await p.evaluate(() => { const c = document.querySelector('.sec-edit svg').getScreenCTM(); return { a: c.a, d: c.d, e: c.e, f: c.f }; });
  return (x, y) => ({ x: m.a * x + m.e, y: m.d * y + m.f });
}
/** 断面を「自由に描く」で、点の列をなぞる */
async function drawSection(p, pts) {
  await tap(p, '.se-mode[data-mode="draw"]');
  await p.waitForTimeout(200);
  await p.mouse.move(pts[0].x, pts[0].y);
  await p.mouse.down();
  for (const q of pts.slice(1)) await p.mouse.move(q.x, q.y, { steps: 2 });
  await p.mouse.up();
  await p.waitForTimeout(2500);
}
async function studio() {
  const p = await page('/studio.html?nointro&rec');
  await p.waitForFunction(() => window.__studio?.session?.built && window.__viewer, null, { timeout: 120000 });
  await p.waitForTimeout(1200);
  return p;
}
/** 見せるを開き、回るのを止めて、いつも同じ向き（斜め前）から見る */
async function present(p) {
  await tap(p, '.act-present');
  await p.evaluate(() => window.__viewer.setAutoRotate(false));
  await p.waitForTimeout(400);
  await still(p);
}
async function still(p, dir = { x: 0.62, y: 0.42, z: 0.66 }) {
  await p.evaluate((d) => {
    const v = window.__viewer;
    v.setAutoRotate(false);
    const t = v.controls.target;
    v.camera.position.copy(t).add(d);
    v.fit();
    v.dirty = true;
  }, dir);
  await p.waitForTimeout(2500);
}
const numbers = (p) => p.evaluate(() => [...document.querySelectorAll('.pr-grid > div')].map((d) => d.innerText.replace(/\n/g, '：')).join(' / '));

/** 工房 B（公開情報だけの帳面）を作る。三角の石は角に 3 本で留まる、という決まりだけ先に入れる */
async function workshopB(p) {
  await refine(p);
  await p.evaluate(() => { const s = document.querySelector('.ws-pick'); s.value = '__new'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(500);
  await p.fill('.ws-name', '工房 B');
  await tap(p, '.ws-make');
  await p.waitForTimeout(2000);
  await manualRule(p, 'hold.cornerSet', '1', '三角の石は、角に 1 本ずつの 3 本で留まる');
}
async function manualRule(p, param, value, quote) {
  await p.evaluate(() => { document.querySelector('.manual-rule').open = true; });
  await p.selectOption('.mr-param', param);
  await p.fill('.mr-value', value);
  await p.fill('.mr-quote', quote);
  await tap(p, '.mr-go');
  await p.waitForTimeout(3000);
}

const SHOTS = {
  // 1. 見せる：全画面の黒の上の指輪と、本物の数字と職人の言葉
  async hero() {
    const p = await studio();
    await present(p);
    console.log('hero', await numbers(p));
    await shot(p, 'hero');
  },
  // 1'. 同じ「見せる」を、スマホの縦の画面で（入口のページをスマホで見たときの写真）
  async heroPhone() {
    const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
    p.on('pageerror', (e) => console.log('pageerror', e.message));
    await p.goto(BASE + '/studio.html?nointro&rec', { waitUntil: 'networkidle' });
    await p.waitForFunction(() => window.__studio?.session?.built && window.__viewer, null, { timeout: 120000 });
    await p.waitForTimeout(1200);
    await present(p);
    await shot(p, 'hero-phone');
  },
  // 2. 公開情報だけの帳面（太い爪）→ 職人の一言（一文の決まり）を足した後
  async rule() {
    const p = await studio();
    await workshopB(p);
    await present(p);
    console.log('before', await numbers(p));
    await shot(p, 'before', { clip: RING });
    await tap(p, '.pr-close');
    await p.waitForTimeout(800);
    await manualRule(p, 'prong.minDiameterMm', '0.7', 'この大きさなら、爪は基本 0.8〜1 mm');
    await present(p);
    console.log('after', await numbers(p));
    await shot(p, 'after', { clip: RING });
  },
  // 3. 作れない所の窓：腕を薄く描き、爪を細くして、赤い札（作れない所）を押す → 理由と、ボタン・Claude で直す
  async fixpop() {
    const p = await studio();
    await refine(p);
    await openManual(p);
    await render(p);
    // 平らで薄い腕の断面（厚み 約 0.95 mm）
    const px = await secMap(p);
    const pts = [];
    for (let k = 0; k <= 40; k++) { const th = Math.PI * (k / 40); pts.push(px(1.5 * Math.cos(th), -0.05 - 0.95 * Math.pow(Math.sin(th), 0.35))); }
    await drawSection(p, pts);
    for (let k = 0; k < 8; k++) {
      await tap(p, '.slider[data-s="r-prong"] .sl-step[data-d="-1"]');
      await p.waitForTimeout(500);
      if ((await probs(p)).includes('prong-thin') && k >= 2) break;
    }
    await p.evaluate(() => (document.querySelector('.studio-refine').scrollTop = 0));
    await tap(p, '.verdict-chip');
    await p.waitForTimeout(1500);
    console.log('fixpop', await p.evaluate(() => document.querySelector('.fix-pop')?.innerText.replace(/\s+/g, ' ')));
    await shot(p, 'fixpop', { clip: VP });
  },
  // 4. 腕の断面を手で描いて、先を尖らせる → 尖った先だけが赤い点になる
  async spike() {
    const p = await studio();
    await refine(p);
    await openManual(p);
    await render(p);
    const px = await secMap(p);
    const P = [[1.4, -0.05], [1.2, -0.6], [0.7, -1.1], [0.12, -1.7], [0.0, -2.15], [-0.12, -1.7], [-0.7, -1.1], [-1.2, -0.6], [-1.4, -0.05]];
    const pts = [];
    for (let k = 0; k < P.length - 1; k++) for (let j = 0; j < 6; j++) { const u = j / 6; pts.push(px(P[k][0] + (P[k + 1][0] - P[k][0]) * u, P[k][1] + (P[k + 1][1] - P[k][1]) * u)); }
    pts.push(px(...P[P.length - 1]));
    await drawSection(p, pts);
    console.log('spike', await p.evaluate(() => window.__studio.session.built.problems.map((x) => `${x.check} ${x.current} → ${x.required}`).join(' / ')));
    // 指輪と、右下の断面の編集が入る所
    await shot(p, 'spike', { clip: { x: 300, y: 44, width: 1140, height: 800 } });
  },
  // 5. 石の先が当たる所の自動のザグりと、石座と腕のロウのつなぎ目（寄って、真横から）
  async zaguri() {
    const p = await studio();
    await refine(p);
    await render(p);
    console.log('zaguri', await p.evaluate(() => [...document.querySelectorAll('.look-note')].map((e) => e.innerText.replace(/\s+/g, ' ')).join(' / ')));
    await p.evaluate(() => {
      const v = window.__viewer;
      // 腕（いちばん長い形）のいちばん上 ＝ 石座の足がつく所
      let top = -Infinity;
      v.content.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
        if (bb.max.y - bb.min.y > 15) top = Math.max(top, bb.max.z);
      });
      const t = v.controls.target;
      t.set(0, 0, top + 0.15);
      v.camera.position.set(t.x + 10, t.y, t.z);
      v.controls.update();
      v.dirty = true;
    });
    await p.waitForTimeout(2500);
    await shot(p, 'zaguri', { clip: VP });
  },
  // 6. 三石：「石を並べる」で三石にする（真ん中はラウンド 6.5 mm）。脇の石は丸い石、つぎにペア
  async trio() {
    const p = await studio();
    await tap(p, '.tabs [data-mode="make"]');
    await p.waitForTimeout(400);
    await tap(p, '.presets button[data-preset="round"]');
    await p.waitForTimeout(2000);
    await p.waitForFunction(() => window.__studio.session?.built, null, { timeout: 60000 });
    await refine(p);
    await tap(p, '.stones-sec > summary');
    await p.waitForTimeout(500);
    await tap(p, '.stones-sec button[data-sk="並べ方"][data-v="trio"]');
    await p.waitForTimeout(3000);
    for (const [name, side] of [['trio-round', null], ['trio-pear', 'pear']]) {
      if (side) {
        await tap(p, '.pr-close');
        await p.waitForTimeout(800);
        await tap(p, `.stones-sec button[data-sk="脇の石"][data-v="${side}"]`);
        await p.waitForTimeout(3000);
      }
      console.log(name, await p.evaluate(() => document.querySelector('.verdict-chip')?.innerText), await p.evaluate(() => document.querySelector('.stone-list')?.innerText.replace(/\s+/g, ' ')));
      await tap(p, '.act-present');
      await p.waitForTimeout(600);
      await still(p, { x: 0.8, y: -0.25, z: 0.55 });
      await shot(p, name, { clip: RING });
    }
  },
  // 7. 見せるで選べるもの（一つずつ、元の指輪から変える）
  async choices() {
    const variants = {
      'c-stone5': async (p) => { await tap(p, '.pr-tabs [data-g="stone"]'); await tap(p, '.pr-opt [data-v="5"]'); },
      'c-stone10': async (p) => { await tap(p, '.pr-tabs [data-g="stone"]'); await tap(p, '.pr-opt [data-v="10"]'); },
      'c-free': (p) => p.evaluate(() => window.__studio.session.setShank({ section_points: [{ x: 0, y: 1 }, { x: 0.3, y: 0.55 }, { x: 0.7, y: 0.8 }, { x: 1, y: 0 }], width_mm: 3, thickness_mm: 1.8, reason: '断面を手で描いた' })),
      'c-hira': async (p) => { await tap(p, '.pr-tabs [data-g="section"]'); await tap(p, '.pr-opt [data-v="hirauchi"]'); },
      'c-bezel': async (p) => { await tap(p, '.pr-tabs [data-g="setting"]'); await tap(p, '.pr-opt [data-v="bezel"]'); },
      'c-pt': async (p) => { await tap(p, '.pr-tabs [data-g="metal"]'); await tap(p, '.pr-opt [data-v="pt900"]'); },
    };
    for (const [name, f] of Object.entries(variants)) {
      const p = await studio();
      await present(p);
      await f(p);
      await p.waitForTimeout(2500);
      await still(p);
      console.log(name, await numbers(p));
      await shot(p, name, { clip: RING });
      await p.context().close();
    }
  },
  // 8. 帳面：石川工房の帳面（職人の決まり）と、Claude からの質問。下に、資料から入れた決まり（出どころ・仮）
  async ledger() {
    const p = await page('/app.html?nointro#ledger', PHONE_W);
    await p.waitForSelector('.rule-cards li');
    await hideFixed(p);
    await p.waitForTimeout(1500);
    const top = await p.locator('.view.keep .view-head').boundingBox();
    const ask = await p.locator('.iv-card').boundingBox();
    console.log('ledger', await p.evaluate(() => document.querySelector('.iv-card')?.innerText.replace(/\s+/g, ' ')));
    await shot(p, 'ledger', { fullPage: true, clip: { x: 0, y: top.y - 12, width: PHONE_W, height: ask.y + ask.height - top.y + 28 } });
    const pub = await p.locator('.public-rules').boundingBox();
    const c3 = await p.locator('.rule-cards.pub li:nth-child(3)').boundingBox();
    console.log('ledger-pub', await p.evaluate(() => document.querySelector('.public-sum')?.innerText));
    await shot(p, 'ledger-pub', { fullPage: true, clip: { x: 0, y: pub.y - 12, width: PHONE_W, height: c3.y + c3.height - pub.y + 24 } });
  },
  // 9. 技：技の一覧（指輪の石留め・彫金・金工の技・木目金を組み立て直す）
  async waza() {
    const p = await page('/app.html?nointro#waza', PHONE_W);
    await p.waitForSelector('.big-techs');
    await hideFixed(p);
    await p.waitForTimeout(1200);
    const v = await p.locator('.view.waza').boundingBox();
    const last = await p.locator('.big-techs').nth(1).locator('li:nth-child(2)').boundingBox();
    console.log('waza', await p.evaluate(() => document.querySelector('.view.waza')?.innerText.replace(/\s+/g, ' ').slice(0, 300)));
    await shot(p, 'waza', { fullPage: true, clip: { x: 0, y: v.y, width: PHONE_W, height: last.y + last.height - v.y + 20 } });
  },
  // 10. 技の頁（木目金）：どの技も同じ形。① 作り方の工程（道具・失敗しやすい所・出どころ）
  async tech() {
    const p = await page('/app.html?nointro#waza/mokume', PHONE_W);
    await p.waitForSelector('.tp-steps');
    await hideFixed(p);
    await p.waitForTimeout(1000);
    const v = await p.locator('.view.tp').boundingBox();
    const st = await p.locator('.tp-steps li:nth-child(1)').boundingBox();
    console.log('tech', await p.evaluate(() => document.querySelector('.view.tp')?.innerText.replace(/\s+/g, ' ').slice(0, 300)));
    await shot(p, 'tech', { fullPage: true, clip: { x: 0, y: v.y, width: PHONE_W, height: st.y + st.height - v.y + 20 } });
  },
  // 11. 組み立て直す：木目金の手がかり 9 を開いたところ（組み立てるのは Claude。合言葉が要るので、ここでは押さない）
  async rebuild() {
    const p = await page('/app.html?nointro#waza/rebuild');
    await p.waitForSelector('details.clues');
    await p.evaluate(() => (document.querySelector('details.clues').open = true));
    await p.waitForTimeout(800);
    const v = await p.locator('.view.rebuild').boundingBox();
    const li = await p.locator('details.clues .clue-list li:nth-child(4)').boundingBox();
    await shot(p, 'rebuild', { fullPage: true, clip: { x: v.x - 16, y: v.y + 44, width: v.width + 32, height: li.y + li.height - v.y - 28 } });
  },
  // 12. 作る：工程の札と、図面
  async make() {
    const p = await studio();
    await tap(p, '.tabs [data-mode="hand"]');
    await p.waitForTimeout(2000);
    await shot(p, 'make', { clip: { x: 1101, y: 44, width: 339, height: 832 } });
    await tap(p, '.disp [data-disp="draw"]');
    await p.waitForTimeout(3500);
    await shot(p, 'draw', { clip: { x: 86, y: 84, width: 972, height: 702 } });
  },
};

/** PNG を webp に（2 倍の物と、半分の幅の -sm） */
function toWebp(name) {
  const src = `${WORK}/${name}.png`;
  if (!fs.existsSync(src)) return;
  execFileSync('cwebp', ['-quiet', '-q', '80', '-m', '6', src, '-o', `${OUT}/${name}.webp`]);
  execFileSync('cwebp', ['-quiet', '-q', '80', '-m', '6', '-resize', String(Math.round(sizeOf(src).w / 2)), '0', src, '-o', `${OUT}/${name}-sm.webp`]);
}
function sizeOf(png) {
  const b = fs.readFileSync(png);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

(async () => {
  browser = await chromium.launch({ args: GPU });
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS);
  for (const n of names) {
    await SHOTS[n]();
    for (const c of browser.contexts()) await c.close();
  }
  await browser.close();
  for (const f of made) toWebp(f);
  for (const f of made) console.log(f, JSON.stringify(sizeOf(`${WORK}/${f}.png`)));
  console.log('PNG:', WORK, ' webp:', OUT);
})();
