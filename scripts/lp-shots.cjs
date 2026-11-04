// 入口のページ（index.html）に載せる、継ぐの本物の画面を撮る。
// 使い方：npx vite build --outDir <作業用> して npx vite preview --outDir <作業用> --port 5360 で動かしてから
//   node scripts/lp-shots.cjs
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

let browser;
/** この回で撮った物（作業用のフォルダのほかの PNG は触らない） */
const made = [];
const shot = async (p, name, opts = {}) => {
  await p.screenshot({ path: `${WORK}/${name}.png`, ...opts });
  made.push(name);
};
async function page(url) {
  const p = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })).newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(BASE + url, { waitUntil: 'networkidle' });
  return p;
}
async function studio() {
  const p = await page('/studio.html?nointro&rec');
  await p.waitForFunction(() => window.__studio?.session?.built && window.__viewer, null, { timeout: 120000 });
  await p.waitForTimeout(1200);
  return p;
}
/** 見せるを開き、回るのを止めて、いつも同じ向き（斜め前）から見る */
async function present(p) {
  await p.click('.act-present');
  await p.evaluate(() => window.__viewer.setAutoRotate(false));
  await p.waitForTimeout(400);
  await still(p);
}
async function still(p) {
  await p.evaluate(() => {
    const v = window.__viewer;
    v.setAutoRotate(false);
    const t = v.controls.target;
    v.camera.position.copy(t).add({ x: 0.62, y: 0.42, z: 0.66 });
    v.fit();
    v.dirty = true;
  });
  await p.waitForTimeout(2500);
}
const numbers = (p) => p.evaluate(() => [...document.querySelectorAll('.pr-grid > div')].map((d) => d.innerText.replace(/\n/g, '：')).join(' / '));

/** 工房 B（公開情報だけの帳面）を作る。三角の石は角に 3 本で留まる、という決まりだけ先に入れる */
async function workshopB(p) {
  await p.click('.tabs [data-mode="refine"]');
  await p.waitForTimeout(1200);
  await p.evaluate(() => { const s = document.querySelector('.ws-pick'); s.value = '__new'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(500);
  await p.fill('.ws-name', '工房 B');
  await p.click('.ws-make');
  await p.waitForTimeout(2000);
  await manualRule(p, 'hold.cornerSet', '1', '三角の石は、角に 1 本ずつの 3 本で留まる');
}
async function manualRule(p, param, value, quote) {
  await p.evaluate(() => { document.querySelector('.manual-rule').open = true; });
  await p.selectOption('.mr-param', param);
  await p.fill('.mr-value', value);
  await p.fill('.mr-quote', quote);
  await p.click('.mr-go');
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
    await p.evaluate(() => document.querySelector('.act-present').click());
    await p.evaluate(() => window.__viewer.setAutoRotate(false));
    await p.waitForTimeout(400);
    await still(p);
    await shot(p, 'hero-phone');
  },
  // 2. 公開情報だけの帳面（太い爪）→ 職人の一言を決まりにした後
  async rule() {
    const p = await studio();
    await workshopB(p);
    await present(p);
    console.log('before', await numbers(p));
    await shot(p, 'before', { clip: RING });
    await p.click('.pr-close');
    await p.waitForTimeout(800);
    await manualRule(p, 'prong.minDiameterMm', '0.7', 'この大きさなら、爪は基本 0.8〜1 mm');
    await present(p);
    console.log('after', await numbers(p));
    await shot(p, 'after', { clip: RING });
  },
  // 3. 爪を細くしすぎると赤く光る。赤い所を押すと、職人の言葉が出る
  async thin() {
    const p = await studio();
    await p.click('.tabs [data-mode="refine"]');
    await p.waitForTimeout(1500);
    if (!(await p.locator('details.manual[open]').count())) { await p.click('details.manual > summary'); await p.waitForTimeout(600); }
    for (let i = 0; i < 7; i++) { await p.locator('.slider[data-s="r-prong"] .sl-step[data-d="-1"]').first().click(); await p.waitForTimeout(450); }
    await p.waitForTimeout(1500);
    // 画面の中で赤い所をさがして押す
    const png = (await p.screenshot()).toString('base64');
    const hit = await p.evaluate(async (b64) => {
      const img = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
      const c = new OffscreenCanvas(img.width, img.height); const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data; const xs = [], ys = [];
      for (let y = 100; y < img.height * 0.9; y += 2) for (let x = 100; x < img.width * 0.75; x += 2) {
        const i = (y * img.width + x) * 4; if (d[i] > 200 && d[i + 1] < 90 && d[i + 2] < 90) { xs.push(x); ys.push(y); }
      }
      if (!xs.length) return null;
      // 赤い点のうち、赤い所の真ん中にいちばん近い点（真ん中そのものは赤でないことがある）
      const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
      let k = 0;
      for (let i = 1; i < xs.length; i++) if (Math.hypot(xs[i] - mx, ys[i] - my) < Math.hypot(xs[k] - mx, ys[k] - my)) k = i;
      return { x: xs[k] / 2, y: ys[k] / 2, n: xs.length };
    }, png);
    console.log('red', hit);
    if (hit) await p.mouse.click(hit.x, hit.y);
    await p.waitForTimeout(700);
    await shot(p, 'thin');
  },
  // 4. 見せるで選べるもの（一つずつ、元の指輪から変える）
  async choices() {
    const variants = {
      'c-stone5': (p) => p.click('.pr-tabs [data-g="stone"]').then(() => p.click('.pr-opt [data-v="5"]')),
      'c-stone10': (p) => p.click('.pr-tabs [data-g="stone"]').then(() => p.click('.pr-opt [data-v="10"]')),
      'c-free': (p) => p.evaluate(() => window.__studio.session.setShank({ section_points: [{ x: 0, y: 1 }, { x: 0.3, y: 0.55 }, { x: 0.7, y: 0.8 }, { x: 1, y: 0 }], width_mm: 3, thickness_mm: 1.8, reason: '断面を手で描いた' })),
      'c-hira': (p) => p.click('.pr-tabs [data-g="section"]').then(() => p.click('.pr-opt [data-v="hirauchi"]')),
      'c-bezel': (p) => p.click('.pr-tabs [data-g="setting"]').then(() => p.click('.pr-opt [data-v="bezel"]')),
      'c-pt': (p) => p.click('.pr-tabs [data-g="metal"]').then(() => p.click('.pr-opt [data-v="pt900"]')),
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
  // 5. Claude が、帳面のまだ決まっていない所を聞きに来る
  async ask() {
    const p = await page('/app.html?nointro#waza/ring');
    await p.waitForTimeout(2500);
    await shot(p, 'ask', { clip: { x: 340, y: 96, width: 760, height: 390 } });
  },
  // 6. 作る：工程の札と、図面
  async make() {
    const p = await studio();
    await p.click('.tabs [data-mode="hand"]');
    await p.waitForTimeout(2000);
    await shot(p, 'make', { clip: { x: 1101, y: 44, width: 339, height: 832 } });
    await p.click('.disp [data-disp="draw"]');
    await p.waitForTimeout(3500);
    await shot(p, 'draw', { clip: { x: 86, y: 84, width: 972, height: 702 } });
  },
  // 8. 魚々子：粒の間を詰めすぎると、重なった粒が赤くなる
  async nanako() {
    const p = await page('/app.html?nointro#waza/nanako');
    await p.waitForTimeout(2000);
    await p.evaluate(() => {
      const set = (k, v) => { const r = document.querySelector(`.nk-ctrl input[data-k=${k}]`); r.value = String(v); r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); };
      set('grainMm', 0.6); set('pitchMm', 0.65); set('rows', 6); set('offsetMm', 0.12);
    });
    await p.waitForTimeout(1500);
    const box = await p.locator('.nk-preview').boundingBox();
    await shot(p, 'nanako', { fullPage: true, clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 420) } });
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
  browser = await chromium.launch();
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS);
  for (const n of names) {
    await SHOTS[n]();
    for (const c of browser.contexts()) await c.close();
  }
  await browser.close();
  for (const f of made) toWebp(f);
  console.log('PNG:', WORK, ' webp:', OUT);
})();
