// 帳面に残す（設計の確かめるの「職人の決まり」）・職人に聞く（学ぶ）を、本物の Claude で画面から試し、絵を撮る。
// 石なしの欄の見た目（PC・スマホ）と「生成の前に戻す」で石のある指輪に戻るかも見る。
// npx vite --port 5477 を立ててから：node scripts/robust/ui.cjs <出力フォルダ>
const { chromium } = require('playwright');
const fs = require('fs');

const out = process.argv[2] || 'out/robust-ui';
const BASE = process.env.BASE || 'http://localhost:5477';
fs.mkdirSync(out, { recursive: true });
const log = [];
const note = (id, data) => { log.push({ id, ...data }); console.log(id, JSON.stringify(data).slice(0, 300)); };

async function page(b, w = 1440, h = 900) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1 });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.addInitScript(() => {
    localStorage.setItem('tsugu.password.v1', 'dev-local');
    localStorage.setItem('tsugu.introSeen.v1', '1');
    localStorage.setItem('tsugu.studio.introSeen.v1', '1');
  });
  return p;
}

async function keepCase(b, id, said, { accept = true } = {}) {
  const p = await page(b);
  await p.goto(`${BASE}/studio.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelector('.sp-now')?.textContent?.trim() !== '—', null, { timeout: 60000 });
  await p.locator('.tabs [data-mode="refine"]').click();
  await p.waitForSelector('.ar-text');
  await p.fill('.ar-text', said);
  const t0 = Date.now();
  await p.locator('.ar-go').click();
  const cards = [];
  // 案が出たら読んで「これでいい」か「いらない」を押す。案が出ずに終わる（聞き返し）こともある
  for (let i = 0; i < 6; i++) {
    const r = await p.waitForFunction(() => {
      const box = document.querySelector('.ar-proposal');
      if (!box) return null;
      if (box.querySelector('.proposal-d')) return 'card';
      if (!box.querySelector('.pulse') && box.textContent.trim()) return 'text';
      return null;
    }, null, { timeout: 120000, polling: 300 }).then((h) => h.jsonValue()).catch(() => 'timeout');
    if (r !== 'card') break;
    const card = (await p.locator('.ar-proposal .proposal-d').innerText()).replace(/\s+/g, ' ');
    cards.push(card);
    await p.screenshot({ path: `${out}/${id}-card${cards.length}.png` });
    await p.locator(`.ar-proposal .proposal-d ${accept ? '.ok' : '.no'}`).click();
    await p.waitForTimeout(800);
  }
  await p.waitForFunction(() => !document.querySelector('.ar-proposal .pulse'), null, { timeout: 120000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const after = ((await p.locator('.ar-proposal').innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
  await p.locator('.ar-proposal').scrollIntoViewIfNeeded().catch(() => {});
  await p.screenshot({ path: `${out}/${id}.png` });
  note(id, { said, seconds: Math.round((Date.now() - t0) / 1000), cards, after, errors: p.errors });
  await p.context().close();
}

async function askCase(b, id, q) {
  const p = await page(b);
  await p.goto(`${BASE}/app.html#learn`, { waitUntil: 'load' });
  await p.waitForSelector('.composer textarea');
  const t0 = Date.now();
  await p.fill('.composer textarea', q);
  await p.locator('.composer textarea').press('Enter');
  await p.waitForFunction(() => !document.querySelector('.thinking'), null, { timeout: 120000, polling: 300 }).catch(() => {});
  await p.waitForTimeout(800);
  const answer = (await p.locator('.bubble, [class*="bubble"]').last().innerText().catch(() => '')).replace(/\s+/g, ' ');
  await p.screenshot({ path: `${out}/${id}.png` });
  note(id, { q, seconds: Math.round((Date.now() - t0) / 1000), answer, errors: p.errors });
  await p.context().close();
}

async function layout(b) {
  for (const [id, w, h] of [['L01-pc', 1440, 900], ['L02-phone', 390, 844]]) {
    const p = await page(b, w, h);
    await p.goto(`${BASE}/studio.html`, { waitUntil: 'load' });
    await p.waitForFunction(() => document.querySelector('.sp-now')?.textContent?.trim() !== '—', null, { timeout: 60000 });
    await p.waitForFunction(() => (document.querySelector('.gen-gou')?.options.length ?? 0) > 0, null, { timeout: 60000 });
    await p.locator('.gen-stone input[value="none"]').check();
    await p.waitForTimeout(500);
    const box = await p.locator('.gen-stone').boundingBox();
    const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    await p.locator('.cmd-wrap').screenshot({ path: `${out}/${id}.png` });
    note(id, { width: w, genStone: box, horizontalScroll: over, errors: p.errors });
    await p.context().close();
  }
}

async function undoBack(b) {
  // 石なしで生成 → 「生成の前に戻す」で一粒石の指輪へ戻るか
  const p = await page(b);
  await p.goto(`${BASE}/studio.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelector('.sp-now')?.textContent?.trim() !== '—', null, { timeout: 60000 });
  await p.locator('.gen-stone input[value="none"]').check();
  await p.fill('.wish', '細めで、手のひら側は薄く');
  await p.locator('.command button[type="submit"]').click();
  await p.waitForFunction(() => !document.querySelector('.make-status .pulse'), null, { timeout: 120000, polling: 300 });
  await p.waitForTimeout(1000);
  const kindAfter = await p.locator('.kinds [aria-pressed="true"]').innerText();
  await p.locator('.gen-swap').click();
  await p.waitForTimeout(1500);
  const kindBack = await p.locator('.kinds [aria-pressed="true"]').innerText();
  const radio = await p.evaluate(() => document.querySelector('.gen-stone input:checked')?.value);
  await p.screenshot({ path: `${out}/U01-back.png` });
  note('U01', { kindAfter: kindAfter.replace(/\s+/g, ' '), kindBack: kindBack.replace(/\s+/g, ' '), radio, errors: p.errors });
  await p.context().close();
}

(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const only = process.argv[3]?.split(',');
  const jobs = [
    ['L', () => layout(b)],
    ['U', () => undoBack(b)],
    ['UK01', () => keepCase(b, 'UK01', '爪はまあ、いい感じの太さで')],
    ['UK02', () => keepCase(b, 'UK02', '爪は 0.5 mm でいい。細い方がきれいだから', { accept: false })],
    ['UK06', () => keepCase(b, 'UK06', 'えーとね、昔親方に言われたのは、爪はとにかく太めにしとけってこと。何年かしたら減ってくるからね。あと腕は、手のひら側は薄い方が着けやすいけど、1.5 くらいは欲しいかな。いや 1.4 でもいけるか。それと普段使いなら石座は低めにしてる。あと鋳造のときは湯口を太めにしないと巣が入る')],
    ['UK09', () => keepCase(b, 'UK09', '今日は暑いね。お昼何にしよう')],
    ['UA06', () => askCase(b, 'UA06', 'ロウ付けのあと急いでいるので、すぐ水に入れて冷ましていいですか？')],
    ['UA02', () => askCase(b, 'UA02', 'オパールみたいなやわらかい石でも、同じ爪の太さでいいですか？')],
  ].filter(([k]) => !only || only.includes(k));
  const queue = [...jobs];
  await Promise.all([0, 1, 2].map(async () => {
    while (queue.length) {
      const [k, run] = queue.shift();
      try { await run(); } catch (e) { note(k, { failed: e.message.split('\n')[0] }); }
    }
  }));
  fs.writeFileSync(`${out}/ui.json`, JSON.stringify(log, null, 2));
  await b.close();
})();
