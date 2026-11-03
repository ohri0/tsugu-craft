const { chromium } = require('/opt/node-tools/node_modules/playwright');
const D = '/tmp/claude-0/-home-user/1a56a488-e27d-52a5-9529-d9ee9823a3f3/scratchpad/vc/mov2';
const fs = require('fs');
async function clip(name, fn) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: D, size: { width: 1920, height: 1080 } } });
  const p = await ctx.newPage(); await fn(p);
  const v = p.video(); await ctx.close(); fs.renameSync(await v.path(), `${D}/${name}.webm`); await b.close(); console.log(name);
}
const ready = async (p) => { await p.goto('http://localhost:5200/studio.html?nointro', { waitUntil: 'networkidle' }); await p.waitForFunction(() => window.__studio?.session?.built, null, { timeout: 120000 }); await p.waitForTimeout(1500); };
(async () => {
  await clip('chart', async (p) => { await p.goto('file:///tmp/claude-0/-home-user/1a56a488-e27d-52a5-9529-d9ee9823a3f3/scratchpad/vc/chart.html'); await p.waitForTimeout(7000); });
  await clip('workshops', async (p) => { await ready(p); await p.evaluate(() => window.__studio.setMode('refine')); await p.waitForTimeout(1500);
    await p.evaluate(() => { const s = document.querySelector('.ws-pick'); s.value = '__new'; s.dispatchEvent(new Event('change')); }); await p.waitForTimeout(1200);
    await p.type('.ws-name', '工房 B', { delay: 120 }); await p.waitForTimeout(500); await p.evaluate(() => document.querySelector('.ws-make').click()); await p.waitForTimeout(3500);
    await p.evaluate(() => { document.querySelector('.manual-rule').open = true; document.querySelector('.manual-rule').scrollIntoView({ behavior: 'smooth', block: 'center' }); }); await p.waitForTimeout(1500);
    await p.evaluate(() => { document.querySelector('.mr-param').value = 'prong.minDiameterMm'; }); await p.type('.mr-value', '1.0', { delay: 150 }); await p.type('.mr-quote', 'うちは爪を太めに見せる', { delay: 60 }); await p.waitForTimeout(600);
    await p.evaluate(() => document.querySelector('.mr-go').click()); await p.waitForTimeout(3500);
    await p.evaluate(() => { const s = document.querySelector('.ws-pick'); s.value = 'main'; s.dispatchEvent(new Event('change')); }); await p.waitForTimeout(3500);
    await p.evaluate(() => { document.querySelector('.ws-bar').scrollIntoView({ behavior: 'smooth' }); document.querySelector('.ws-cmp').click(); }); await p.waitForTimeout(5000); });
  await clip('drawing', async (p) => { await ready(p); await p.waitForTimeout(1500); await p.evaluate(() => document.querySelector('.disp [data-disp=draw]').click()); await p.waitForTimeout(6000);
    await p.evaluate(() => document.querySelector('.disp [data-disp=render]').click()); await p.waitForTimeout(2000); });
  await clip('rebuild', async (p) => { await p.goto('http://localhost:5200/app.html#rebuild', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500); await p.evaluate(() => document.querySelector('.tech.ready').click()); await p.waitForTimeout(2500);
    await p.evaluate(() => { const d = document.querySelector('details.clues'); d.open = true; d.scrollIntoView({ behavior: 'smooth' }); }); await p.waitForTimeout(5000); });
})();
