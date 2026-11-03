const { chromium } = require('/opt/node-tools/node_modules/playwright');
const D = '/tmp/claude-0/-home-user/1a56a488-e27d-52a5-9529-d9ee9823a3f3/scratchpad/vc/mov2';
const fs = require('fs');
async function clip(name, fn) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: D, size: { width: 1920, height: 1080 } } });
  const p = await ctx.newPage();
  await fn(p);
  const v = p.video(); await ctx.close(); fs.renameSync(await v.path(), `${D}/${name}.webm`); await b.close(); console.log(name);
}
const ready = async (p, q = '?nointro') => { await p.goto('http://localhost:5200/studio.html' + q, { waitUntil: 'networkidle' }); await p.waitForFunction(() => window.__studio?.session?.built, null, { timeout: 120000 }); await p.waitForTimeout(1500); };
(async () => {
  await clip('intro', async (p) => { await p.goto('http://localhost:5200/studio.html', { waitUntil: 'networkidle' }); await p.waitForTimeout(45000); });
  await clip('compare', async (p) => { await ready(p); await p.evaluate(() => window.__studio.setMode('refine')); await p.waitForTimeout(2500); await p.evaluate(() => document.querySelector('.compare-btn').click()); await p.waitForTimeout(6000); await p.evaluate(() => document.querySelector('.compare-back').click()); await p.waitForTimeout(6000); });
  await clip('sweep', async (p) => { await ready(p); await p.evaluate(() => window.__studio.setMode('refine')); await p.waitForTimeout(1000); await p.evaluate(() => document.querySelector('.sweep-btn').click()); await p.waitForSelector('.sw-in.done', { timeout: 300000 }); await p.waitForTimeout(2000); await p.evaluate(() => document.querySelector('.sw-chart').scrollIntoView({ behavior: 'smooth', block: 'center' })); await p.waitForTimeout(4000); });
  await clip('past', async (p) => { await ready(p); await p.evaluate(() => window.__studio.setMode('refine')); await p.waitForTimeout(800); await p.evaluate(() => document.querySelector('.add-samples').click()); await p.waitForTimeout(1500);
    await p.evaluate(() => { document.querySelector('.manual-rule').open = true; document.querySelector('.mr-param').value = 'height.minFingerGapMm'; document.querySelector('.mr-value').value = '1.5'; document.querySelector('.mr-quote').value = '指の上は 1.5 mm は空ける。汗がたまるから'; });
    await p.waitForTimeout(1500); await p.evaluate(() => document.querySelector('.mr-go').click()); await p.waitForTimeout(4000);
    await p.evaluate(() => document.querySelector('.past-check')?.scrollIntoView({ behavior: 'smooth' })); await p.waitForTimeout(3000);
    await p.evaluate(() => document.querySelector('.past-fix')?.click()); await p.waitForTimeout(5000); });
  await clip('make', async (p) => { await ready(p); await p.evaluate(() => window.__studio.setMode('hand')); await p.waitForTimeout(2500);
    await p.evaluate(() => document.querySelector('.rule-in-step')?.scrollIntoView({ behavior: 'smooth', block: 'center' })); await p.waitForTimeout(5000); });
})();
