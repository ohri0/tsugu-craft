const { chromium, SP, BASE, VIDEO } = require('../paths.cjs');
const H = `${SP}/vc/hero/`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.log('pageerror ' + e.message));
  await p.goto(`${BASE}/studio.html?nointro&rec`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__studio?.session?.built && window.__viewer, null, { timeout: 120000 });
  await p.evaluate(() => {
    window.__studio.setMode('refine');
    window.__viewer.setDisplayMode('render');
    // 作者の好み：プラチナ系の白い地金で撮る
    window.__studio.session.setShank({ metal: 'pt900', reason: 'cine' });
    document.querySelector('.t-dims')?.click(); document.querySelector('.t-grid')?.click();
    const st = document.createElement('style');
    st.textContent = `.tb,.tools,.insp,.cmd-wrap,.sb,.vp-tl,.verdict-chip,.dims,.gizmo,.toast{display:none!important} .pro{display:block!important} .vp{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}`;
    document.head.appendChild(st);
    window.__viewer.setAutoRotate(false);
  });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { const v = window.__viewer; v.fit(); const c = v.camera, t = v.controls.target; c.position.sub(t).multiplyScalar(1.3).add(t); c.position.y -= 0; v.controls.update(); v.dirty = true; });
  await p.waitForTimeout(1500);
  const run = async (dir, n) => {
    for (let i = 0; i < n; i++) {
      await p.evaluate(() => window.__viewer.turn((Math.PI * 2) / 360));
      await p.waitForTimeout(60);
      await p.screenshot({ path: `${H}${dir}/${String(i).padStart(4, '0')}.png` });
    }
  };
  // 細い方を撮ったときと同じカメラの位置を覚えてから、太い方に切り替え、その位置に戻す
  await p.evaluate(() => { const v = window.__viewer; window.__cam = { p: v.camera.position.clone(), t: v.controls.target.clone() }; });
  await p.evaluate(() => document.querySelector('.compare-btn').click());
  await p.waitForTimeout(5000);
  await p.evaluate(() => { const v = window.__viewer; v.camera.position.copy(window.__cam.p); v.controls.target.copy(window.__cam.t); v.controls.update(); v.dirty = true; });
  await p.waitForTimeout(800);
  await run('thick', 150);
  await b.close();
})();
