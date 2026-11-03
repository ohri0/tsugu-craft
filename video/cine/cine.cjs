// 黒い背景に指輪だけを置き、1 こまずつ撮る。node cine.cjs <shot> [こまの数]
const { chromium, SP, BASE, VIDEO } = require('../paths.cjs');
const C = `${SP}/cine/`;
const fs = require('fs');
const shot = process.argv[2]; const N = Number(process.argv[3] || 60);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.log('pageerror ' + e.message));
  await p.goto(`${BASE}/studio.html?nointro&rec`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__studio?.session?.built && window.__viewer, null, { timeout: 120000 });
  await p.evaluate(() => {
    window.__studio.setMode('refine');
    document.querySelector('.t-dims')?.click(); document.querySelector('.t-grid')?.click();
    const st = document.createElement('style');
    st.textContent = `.tb,.tools,.insp,.cmd-wrap,.sb,.vp-tl,.verdict-chip,.dims,.gizmo,.toast{display:none!important} .pro{display:block!important;background:#000!important} .vp{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;background:#000!important}`;
    document.head.appendChild(st);
    const v = window.__viewer; v.setAutoRotate(false);
    v.scene.background = null; v.renderer.setClearColor(0x000000, 1);
    if (v.shadow?.plane) v.shadow.plane.visible = false;
  });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { const v = window.__viewer; v.fit(); const c = v.camera, t = v.controls.target; c.position.sub(t).multiplyScalar(0.82).add(t); v.controls.update(); v.dirty = true; });
  await p.waitForTimeout(800);
  const dir = C + shot + '/'; fs.mkdirSync(dir, { recursive: true });
  const snap = async (i) => { await p.waitForTimeout(40); await p.screenshot({ path: `${dir}${String(i).padStart(4, '0')}.png` }); };
  const turn = (r) => p.evaluate((r) => window.__viewer.turn(r), r);
  if (shot === 'form') {
    // 線だけで下から組み上がる → 面 → 金
    await p.evaluate(() => { window.__viewer.setDisplayMode('wire'); window.__viewer.setReveal(0); });
    let i = 0;
    for (let k = 0; k < N; k++, i++) { await p.evaluate((u) => window.__viewer.setReveal(1 - Math.pow(1 - u, 3)), k / (N - 1)); await turn(0.006); await snap(i); }
    await p.evaluate(() => window.__viewer.setReveal(null));
    await p.evaluate(() => window.__viewer.setDisplayMode('shaded'));
    for (let k = 0; k < 24; k++, i++) { await turn(0.006); await snap(i); }
    await p.evaluate(() => window.__viewer.setDisplayMode('render'));
    for (let k = 0; k < 50; k++, i++) { await turn(0.006); await snap(i); }
  }
  if (shot === 'morph') {
    // 爪が 1.66 mm から 0.80 mm へ、なめらかに細くなる
    const s0 = 1.66, s1 = 0.80; let i = 0;
    await p.evaluate((d) => { const s = window.__studio.session; s.state.prongMm = d; s.build('cine'); s.flush?.(); }, s0);
    await p.waitForTimeout(1500);
    for (let k = 0; k < 20; k++, i++) { await turn(0.005); await snap(i); }
    for (let k = 0; k < N; k++, i++) {
      const u = k / (N - 1); const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      await p.evaluate((d) => { const s = window.__studio.session; s.state.prongMm = d; s.build('cine'); s.flush?.(); }, Math.round((s0 + (s1 - s0) * e) * 100) / 100);
      await turn(0.005); await snap(i);
    }
    for (let k = 0; k < 40; k++, i++) { await turn(0.005); await snap(i); }
  }
  if (shot === 'metal') {
    let i = 0;
    for (const m of ['k18yg', 'pt900', 'k18pg']) {
      await p.evaluate((m) => window.__studio.session.setShank({ metal: m, reason: 'cine' }), m); await p.waitForTimeout(1500);
      for (let k = 0; k < 40; k++, i++) { await turn(0.008); await snap(i); }
    }
  }
  console.log(shot, 'できた'); await b.close();
})();
