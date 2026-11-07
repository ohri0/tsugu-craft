// 最終案 10・11：行き来の図に使う、継ぐの本物の図面を撮る（Claude は呼ばない）。
//   thin.png：爪を見た目で分かるほど細くした図面（0.25 mm。作れない形）／ ok.png：帳面の決まりの爪（今の既定）
//   low.png（最終案 12）：直した 2 回目の図面。爪は直ったが、石の下の余裕が少ない（石と指のすき間 0.15 mm）
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
  const only = process.env.DRAW10 ? process.env.DRAW10.split(',') : null;
  // low：最終案 12（作者の声）。石の先が指に当たる（−0.6 mm）では、デザインの人なら誰でも分かる失敗でリアルでない。
  //   デザインでは 0.5 mm ほど取るが、鍛造で丸線を叩くと内側がへこむので、0.1〜0.2 mm しか取っていないと当たることがある → 石の下の余裕 0.15 mm
  for (const [name, prong, gap] of [['thin', 0.25, null], ['ok', null, null], ['low', null, 0.15]].filter(([n]) => !only || only.includes(n))) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 4 });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('pageerror', e.message));
    await p.goto(`${BASE}/studio.html?nointro&rec`, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__studio && window.__studio.session && window.__studio.session.built, null, { timeout: 60000 });
    await p.waitForTimeout(2500);
    await p.evaluate(({ prong, gap }) => {
      const s = window.__studio.session;
      s.setShank({ section: 'hirauchi', width_mm: 2.0, thickness_mm: 1.4, reason: '撮る' });
      if (prong) s.setSetting({ prong_mm: prong, reason: '撮る' });
      if (gap !== null) { s.state = { ...s.state, culetGapMm: gap, joinSet: true }; s.build('撮る'); }
    }, { prong, gap });
    await p.waitForTimeout(3000);
    console.log(name, await p.evaluate(() => document.querySelector('.sb .specs')?.innerText.replace(/\s+/g, ' ')), await p.evaluate(() => JSON.stringify(window.__studio.session.built.problems.map((x) => x.check))));
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
