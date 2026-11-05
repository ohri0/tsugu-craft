// 見本（video/look9.py）で使う、継ぐの本物の図面を細かく撮る。Claude は呼ばない（/api は届かない番号へ）。
// 使い方：CAP_DIST=video/work/dist-cap8 CAP_PORT=5522 API_PORT=9 node video/capture/serve.cjs を動かしてから
//   TSUGU_CAP=http://localhost:5522 node video/capture/draw9.cjs
const fs = require('fs');
const path = require('path');
const { SP, chromium } = require('../paths.cjs');
const BASE = process.env.TSUGU_CAP || 'http://localhost:5522';
const OUT = path.join(SP, 'story', 'draw9');
fs.mkdirSync(OUT, { recursive: true });
const tap = (p, sel) => p.evaluate((s) => document.querySelector(s).click(), sel);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 4 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(`${BASE}/studio.html?nointro&rec`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__studio && window.__studio.session && window.__studio.session.built, null, { timeout: 60000 });
  await p.waitForTimeout(2500);
  // 見せる指輪と同じ腕（平打ち 2.0 × 1.4 mm）にしてから図面を出す
  await p.evaluate(() => window.__studio.session.setShank({ section: 'hirauchi', width_mm: 2.0, thickness_mm: 1.4, reason: '撮る' }));
  await p.waitForTimeout(2500);
  await tap(p, '.tabs [data-mode="hand"]');
  await p.waitForTimeout(2000);
  await tap(p, '.disp [data-disp="draw"]');
  await p.waitForTimeout(5000);
  await p.screenshot({ path: path.join(OUT, 'draw.png'), clip: { x: 86, y: 84, width: 972, height: 702 } });
  console.log('撮った', path.join(OUT, 'draw.png'));
  await b.close();
})();
