const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs'); const D = '/tmp/claude-0/-home-user/1a56a488-e27d-52a5-9529-d9ee9823a3f3/scratchpad/cine/';
(async () => {
  for (const [n, ms] of [['saigen', 8000]]) {
    const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: D, size: { width: 1920, height: 1080 } } });
    const p = await ctx.newPage(); await p.goto(`file://${D}html/${n}.html`); await p.waitForTimeout(ms);
    const v = p.video(); await ctx.close(); fs.renameSync(await v.path(), `${D}${n}.webm`); await b.close(); console.log(n);
  }
})();
