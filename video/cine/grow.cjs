// 石の大きさが 3 mm から 12 mm へなめらかに大きくなり、爪の太さが帳面の決まりで変わっていくのを、1 こまずつ撮る。
// 下に、石の大きさと爪の太さの小さな目盛りを出す（画面の数字は、組んだ指輪から読む）。node grow.cjs [こまの数]
const { chromium, SP, BASE } = require('../paths.cjs');
const fs = require('fs');
const N = Number(process.argv[2] || 120);
const MIN = 5.2, MAX = 8.2; // 0.5 ct〜2.0 ct のラウンドの直径（作者：メレと大きすぎる石は要らない）
const D = `${SP}/cine/grow/`; fs.mkdirSync(D, { recursive: true });
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.log('pageerror ' + e.message));
  await p.goto(`${BASE}/studio.html?nointro&rec`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__studio?.session?.built && window.__viewer, null, { timeout: 120000 });
  await p.evaluate(() => [...document.querySelectorAll('.presets button')].find((x) => x.textContent.trim() === 'ラウンド').click());
  await p.waitForTimeout(6000);
  await p.evaluate(() => {
    window.__studio.setMode('refine');
    window.__viewer.setDisplayMode('render');
    document.querySelector('.t-dims')?.click(); document.querySelector('.t-grid')?.click();
    const st = document.createElement('style');
    st.textContent = `.tb,.tools,.insp,.cmd-wrap,.sb,.vp-tl,.verdict-chip,.dims,.gizmo,.toast,.intro-sheet,.intro-timer{display:none!important} .pro{display:block!important;background:#000!important} .vp{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;background:#000!important}
    .gr{position:fixed;left:1300px;top:50%;transform:translateY(-50%);width:440px;font-family:"Helvetica Neue","Hiragino Sans",sans-serif;font-weight:300;color:#f5f5f7;-webkit-font-smoothing:antialiased;z-index:99}
    .gr .l{font-size:15px;color:#86868b;letter-spacing:.04em}.gr .l b{font-weight:300;color:#d2d2d7;margin-left:10px;font-variant-numeric:tabular-nums}
    .gr .r{display:flex;justify-content:space-between;margin-top:12px;font-size:22px}.gr .r span{color:#6e6e73;padding-bottom:6px;border-bottom:1px solid transparent}.gr .r span.on{color:#f5f5f7;border-color:#f5f5f7}
    .gr .bar{position:relative;height:1px;background:#2c2c2e;margin-top:26px}.gr .bar i{position:absolute;top:-4px;width:9px;height:9px;border-radius:50%;background:#f5f5f7;margin-left:-4px}
    .gr .f{display:flex;justify-content:space-between;margin-top:30px;font-size:15px;color:#86868b}.gr .f b{font-weight:300;color:#f5f5f7;font-size:26px;margin-left:12px;font-variant-numeric:tabular-nums}`;
    document.head.appendChild(st);
    const g = document.createElement('div'); g.className = 'gr';
    g.innerHTML = `<div class="l">石の大きさ<b class="v1"></b></div><div class="r"><span data-mm="5.2">0.5 ct</span><span data-mm="6.5">1.0 ct</span><span data-mm="7.4">1.5 ct</span><span data-mm="8.2">2.0 ct</span></div><div class="bar"><i></i></div><div class="f"><span>爪の太さ<b class="v2"></b></span><span>職人の決まり ・ 設計ルールから</span></div>`;
    document.body.appendChild(g);
    const v = window.__viewer; v.setAutoRotate(false); v.scene.background = null; v.renderer.setClearColor(0x000000, 1);
    if (v.shadow?.plane) v.shadow.plane.visible = false;
    const s = window.__studio.session;
    s.setShank({ metal: 'pt900', reason: 'cine' });
    window.__base = JSON.parse(JSON.stringify(s.stone));
    window.__grow = (mm) => {
      const b0 = window.__base; const k = mm / b0.longMm;
      s.stone = { ...b0, outlineMm: b0.outlineMm.map((q) => ({ x: q.x * k, y: q.y * k })), longMm: b0.longMm * k, widthMm: b0.widthMm * k, depthMm: b0.depthMm * k };
      s.state.prongMm = undefined; s.build('cine'); s.flush?.();
      if (window.__cam) { const v = window.__viewer; v.camera.position.copy(window.__cam.p); v.controls.target.copy(window.__cam.t); v.controls.update(); v.dirty = true; }
      const d = s.built.ring.setting.prongs[0].diameterMm;
      document.querySelector('.v1').textContent = `Ø ${mm.toFixed(1)} mm`;
      document.querySelector('.v2').textContent = `${d.toFixed(2)} mm`;
      document.querySelector('.gr .bar i').style.left = `${((mm - 5.2) / 3) * 100}%`;
      document.querySelectorAll('.gr .r span').forEach((x) => x.classList.toggle('on', Math.abs(Number(x.dataset.mm) - mm) < 0.42));
      return d;
    };
  });
  // いちばん大きい石で画角を決め、そのまま動かさない
  await p.evaluate((m) => window.__grow(m), MAX); await p.waitForTimeout(1500);
  await p.evaluate(() => { const v = window.__viewer; const c = v.camera, t = v.controls.target; c.position.sub(t).multiplyScalar(1.22).add(t); c.position.z += 1.2; t.z += 1.2; v.controls.update(); window.__cam = { p: c.position.clone(), t: t.clone() }; v.dirty = true; });
  const snap = async (i) => { await p.waitForTimeout(40); await p.screenshot({ path: `${D}${String(i).padStart(4, '0')}.png` }); };
  let i = 0; const log = [];
  for (let k = 0; k < 15; k++, i++) { const d = await p.evaluate(() => window.__grow(5.2)); await p.evaluate(() => window.__viewer.turn(0.004)); await snap(i); if (!k) log.push([5.2, d]); }
  for (let k = 0; k < N; k++, i++) {
    const u = k / (N - 1); const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    const mm = MIN + (MAX - MIN) * e; const d = await p.evaluate((mm) => window.__grow(mm), mm); await p.evaluate(() => window.__viewer.turn(0.004)); await snap(i);
    if (k % 20 === 0) log.push([mm.toFixed(1), d.toFixed(2)]);
  }
  for (let k = 0; k < 30; k++, i++) { await p.evaluate(() => window.__viewer.turn(0.004)); await snap(i); }
  console.log('grow できた', i, 'こま', JSON.stringify(log)); await b.close();
})();
