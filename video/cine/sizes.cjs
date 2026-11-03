// 石の大きさを変えて、公開情報だけ／職人の決まり、の 2 つの指輪を黒の上で撮る
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const D = '/tmp/claude-0/-home-user/1a56a488-e27d-52a5-9529-d9ee9823a3f3/scratchpad/cine/sizes/';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 1200 } });
  p.on('pageerror', (e) => console.log('pageerror ' + e.message));
  await p.goto('http://localhost:5200/studio.html?nointro&rec', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__studio?.session?.built && window.__viewer, null, { timeout: 120000 });
  await p.evaluate(() => [...document.querySelectorAll('.presets button')].find((x) => x.textContent.trim() === 'ラウンド').click());
  await p.waitForTimeout(6000);
  await p.evaluate(() => {
    window.__studio.setMode('refine');
    document.querySelector('.t-dims')?.click(); document.querySelector('.t-grid')?.click();
    const st = document.createElement('style');
    st.textContent = `.tb,.tools,.insp,.cmd-wrap,.sb,.vp-tl,.verdict-chip,.dims,.gizmo,.toast,.intro-sheet,.intro-timer{display:none!important} .pro{display:block!important;background:#000!important} .vp{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;background:#000!important}`;
    document.head.appendChild(st);
    const v = window.__viewer; v.setAutoRotate(false); v.scene.background = null; v.renderer.setClearColor(0x000000, 1);
    if (v.shadow?.plane) v.shadow.plane.visible = false;
  });
  const info = [];
  for (const mm of [3, 5, 8, 12]) {
    await p.evaluate((mm) => { const l = document.querySelector('.in-long'); const d = document.querySelector('.in-depth'); l.value = String(mm); d.value = String((mm * 0.6).toFixed(2)); l.dispatchEvent(new Event('change', { bubbles: true })); }, mm);
    await p.waitForTimeout(9000);
    await p.evaluate(() => { const v = window.__viewer; v.fit(); const c = v.camera, t = v.controls.target; c.position.sub(t).multiplyScalar(0.92).add(t); v.controls.update(); v.dirty = true; });
    await p.waitForTimeout(1500);
    const craft = await p.evaluate(() => window.__studio.session.built.ring.setting.prongs[0].diameterMm);
    await p.screenshot({ path: `${D}craft-${mm}.png` });
    await p.evaluate(() => { window.__cam = { p: window.__viewer.camera.position.clone(), t: window.__viewer.controls.target.clone() }; document.querySelector('.compare-btn').click(); });
    await p.waitForTimeout(6000);
    await p.evaluate(() => { const v = window.__viewer; v.camera.position.copy(window.__cam.p); v.controls.target.copy(window.__cam.t); v.controls.update(); v.dirty = true; });
    await p.waitForTimeout(1200);
    const pub = await p.evaluate(() => window.__studio.session.built.ring.setting.prongs[0].diameterMm);
    await p.screenshot({ path: `${D}public-${mm}.png` });
    await p.evaluate(() => document.querySelector('.compare-back').click());
    await p.waitForTimeout(5000);
    info.push({ mm, craft: craft.toFixed(2), pub: pub.toFixed(2) });
    console.log(mm, '職人', craft.toFixed(2), '公開', pub.toFixed(2));
  }
  require('fs').writeFileSync(D + 'info.json', JSON.stringify(info));
  await b.close();
})();
