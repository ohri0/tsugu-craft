// 見本（video/look9.py）で使う、継ぐの本物の帳面を細かく撮る（幅 480 の 4 倍＝1920 px。切り抜けばそのまま全画面になる）。Claude は呼ばない。
// 使い方：CAP_DIST=video/work/dist-cap8 CAP_PORT=5522 API_PORT=9 node video/capture/serve.cjs を動かしてから
//   TSUGU_CAP=http://localhost:5522 node video/capture/ledger9.cjs
const fs = require('fs');
const path = require('path');
const { SP, chromium } = require('../paths.cjs');
const BASE = process.env.TSUGU_CAP || 'http://localhost:5522';
const OUT = path.join(SP, 'story', 'ledger9');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 480, height: 900 }, deviceScaleFactor: 4 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(`${BASE}/app.html?nointro#ledger`, { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  // 下に固定の帯を隠す（切り抜きに重ならないように）
  await p.evaluate(() => document.querySelectorAll('body *').forEach((e) => { if (getComputedStyle(e).position === 'fixed') e.style.display = 'none'; }));
  await p.screenshot({ path: path.join(OUT, 'page.png'), fullPage: true });
  console.log('撮った', path.join(OUT, 'page.png'));
  await b.close();
})();
