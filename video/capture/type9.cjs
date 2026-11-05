// 見本（video/look9.py）の字の板：HTML と CSS をヘッドレスのブラウザで描き、透明の地の PNG にする。
// 字詰め（palt・vpal）・縦中横・細い線はブラウザに任せる。外のページは開かない。Claude は呼ばない。
// 使い方：node video/capture/type9.cjs 仕事.json（[{ "html": "HTML のファイル", "png": "出す PNG" }, …]）
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  for (const j of jobs) {
    await p.goto('file://' + path.resolve(j.html), { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    // 横書きは「字の並ぶ線」を y に合わせる
    await p.evaluate(() => {
      document.querySelectorAll('.h').forEach((el) => {
        const bl = el.querySelector('.bl');
        const dy = Number(el.dataset.y) - bl.getBoundingClientRect().bottom;
        el.style.top = dy + 'px';
      });
    });
    await p.screenshot({ path: j.png, omitBackground: true });
  }
  await b.close();
})();
