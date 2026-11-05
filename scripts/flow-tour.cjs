// 撮影用の見本（app.html?rec&mihon）を決まった順に進め、1 歩ごとに絵を撮る。動画を撮る台本のもとにも使う。
// 使い方：開発用のサーバーを立てて（npx vite --port 5191）、node scripts/flow-tour.cjs <絵を置くフォルダ> [幅 高さ] [URL の頭]
const { chromium } = require('playwright');
const fs = require('fs');

const out = process.argv[2] || 'out/flow';
const W = Number(process.argv[3] || 1440);
const H = Number(process.argv[4] || 900);
const BASE = process.argv[5] || 'http://localhost:5191';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: W < 500 ? 2 : 1 });
  const p = await ctx.newPage();
  let bad = 0;
  p.on('pageerror', (e) => { bad++; console.log('画面のエラー', e.message); });
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) { bad++; console.log('console', m.text()); } });
  // 見本は Claude を呼ばない
  await p.route('**/api/claude', (r) => { bad++; console.log('Claude を呼んだ'); return r.abort(); });
  await p.goto(`${BASE}/app.html?rec&mihon`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.tsuguTour);
  const names = await p.evaluate(() => window.tsuguTour.names);
  for (let i = 0; i < names.length; i++) {
    const name = await p.evaluate(() => window.tsuguTour.next());
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${out}/${String(i + 1).padStart(2, '0')}-${name}.png` });
    console.log(i + 1, name, '縦', await p.evaluate(() => document.documentElement.scrollHeight), '横にはみ出す', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  }
  await b.close();
  if (bad) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
