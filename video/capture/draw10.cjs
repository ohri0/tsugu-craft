// 最終案 10：行き来の図に使う、継ぐの本物の図面を 2 枚撮る（Claude は呼ばない）。
//   thin.png：爪を見た目で分かるほど細くした図面（0.25 mm。作れない形）／ ok.png：帳面の決まりの爪（今の既定）
// 使い方：撮る用のサーバー（capture/serve.cjs）を動かしてから TSUGU_CAP=http://localhost:5431 node video/capture/draw10.cjs
const fs = require('fs');
const path = require('path');
const { SP, chromium } = require('../paths.cjs');
const BASE = process.env.TSUGU_CAP || 'http://localhost:5431';
const OUT = path.join(SP, 'story', 'draw10');
fs.mkdirSync(OUT, { recursive: true });
const tap = (p, sel) => p.evaluate((s) => document.querySelector(s).click(), sel);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  for (const [name, prong] of [['thin', 0.25], ['ok', null]]) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 4 });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('pageerror', e.message));
    await p.goto(`${BASE}/studio.html?nointro&rec`, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__studio && window.__studio.session && window.__studio.session.built, null, { timeout: 60000 });
    await p.waitForTimeout(2500);
    await p.evaluate(({ prong }) => {
      const s = window.__studio.session;
      s.setShank({ section: 'hirauchi', width_mm: 2.0, thickness_mm: 1.4, reason: '撮る' });
      if (prong) s.setSetting({ prong_mm: prong, reason: '撮る' });
    }, { prong });
    await p.waitForTimeout(3000);
    console.log(name, await p.evaluate(() => document.querySelector('.sb .specs')?.innerText.replace(/\s+/g, ' ')));
    await tap(p, '.tabs [data-mode="hand"]');
    await p.waitForTimeout(2000);
    await tap(p, '.disp [data-disp="draw"]');
    await p.waitForTimeout(5000);
    await p.screenshot({ path: path.join(OUT, `${name}.png`), clip: { x: 86, y: 84, width: 972, height: 702 } });
    console.log('撮った', path.join(OUT, `${name}.png`));
    await ctx.close();
  }
  await b.close();
})();
