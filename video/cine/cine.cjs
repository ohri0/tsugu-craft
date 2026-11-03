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
  // 調整の場面（morph・thin）は、アプリのシェード表示（CAD のような灰色の画面）で撮る。ほかは黒の上のレンダー
  const editor = shot === 'morph' || shot === 'thin';
  await p.evaluate((editor) => {
    window.__studio.setMode('refine');
    // 作者の好み：プラチナ系の白い地金で撮る
    window.__studio.session.setShank({ metal: 'pt900', reason: 'cine' });
    document.querySelector('.t-dims')?.click(); document.querySelector('.t-grid')?.click();
    const st = document.createElement('style');
    st.textContent = `.tb,.tools,.insp,.cmd-wrap,.sb,.vp-tl,.verdict-chip,.dims,.gizmo,.toast{display:none!important} .pro{display:block!important;background:#000!important} .vp{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;background:#000!important}`;
    document.head.appendChild(st);
    const v = window.__viewer; v.setAutoRotate(false);
    if (editor) {
      v.setDisplayMode('shaded');
      const ed = document.createElement('style');
      ed.textContent = `.gr{color:#1d1d1f!important}.gr .l,.gr b small,.gr .s{color:#3a3a3c!important}.gr .s.on{color:#000!important;font-weight:400}.gr .s.bad{color:#c4141a!important;font-weight:400}.gr .bar{background:#6e6e73!important}`;
      document.head.appendChild(ed);
    } else {
      v.setDisplayMode('render');
      v.scene.background = null; v.renderer.setClearColor(0x000000, 1);
    }
    if (v.shadow?.plane) v.shadow.plane.visible = false;
  }, editor);
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
    // 右に、爪の太さの読み（grow.cjs と同じ見た目）。数字は組んだ指輪から読む
    await p.evaluate(() => {
      const st = document.createElement('style');
      st.textContent = `.gr{position:fixed;left:1480px;top:50%;transform:translateY(-50%);width:360px;font-family:"Helvetica Neue","Hiragino Sans",sans-serif;font-weight:300;color:#f5f5f7;-webkit-font-smoothing:antialiased;z-index:99}
      .gr .l{font-size:15px;color:#86868b;letter-spacing:.04em}.gr b{display:block;margin-top:10px;font-weight:300;font-size:64px;font-variant-numeric:tabular-nums}.gr b small{font-size:24px;color:#86868b;margin-left:8px}
      .gr .s{margin-top:22px;font-size:20px;color:#86868b;transition:color .3s}.gr .s.on{color:#f5f5f7}.gr .bar{height:1px;background:#2c2c2e;margin-top:26px}`;
      document.head.appendChild(st);
      const g = document.createElement('div'); g.className = 'gr';
      g.innerHTML = '<div class="l">爪の太さ</div><b><span class="v">-</span><small>mm</small></b><div class="bar"></div><div class="s s1">ネットの公開情報だけ</div><div class="s s2">職人の一言 ・ 基本 0.8〜1 mm</div>';
      document.body.appendChild(g);
      window.__read = () => { const d = window.__studio.session.built.ring.setting.prongs[0].diameterMm; document.querySelector('.gr .v').textContent = d.toFixed(2); document.querySelector('.s1').classList.toggle('on', d > 1.2); document.querySelector('.s2').classList.toggle('on', d < 0.9); };
    });
    // 爪が 1.66 mm から 0.80 mm へ、なめらかに細くなる
    const s0 = 1.66, s1 = 0.80; let i = 0;
    await p.evaluate((d) => { const s = window.__studio.session; s.state.prongMm = d; s.build('cine'); s.flush?.(); }, s0);
    await p.waitForTimeout(1500); await p.evaluate(() => window.__read());
    for (let k = 0; k < 20; k++, i++) { await turn(0.005); await snap(i); }
    for (let k = 0; k < N; k++, i++) {
      const u = k / (N - 1); const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      await p.evaluate((d) => { const s = window.__studio.session; s.state.prongMm = d; s.build('cine'); s.flush?.(); }, Math.round((s0 + (s1 - s0) * e) * 100) / 100);
      await p.evaluate(() => window.__read()); await turn(0.005); await snap(i);
    }
    for (let k = 0; k < 40; k++, i++) { await turn(0.005); await snap(i); }
  }
  if (shot === 'thin') {
    // 爪を細くしすぎると、強さが足りない爪が赤く点滅する（画面の確かめそのまま）
    await p.evaluate(() => {
      const st = document.createElement('style');
      st.textContent = `.gr{position:fixed;left:1480px;top:50%;transform:translateY(-50%);width:360px;font-family:"Helvetica Neue","Hiragino Sans",sans-serif;font-weight:300;color:#f5f5f7;-webkit-font-smoothing:antialiased;z-index:99}
      .gr .l{font-size:15px;color:#86868b}.gr b{display:block;margin-top:10px;font-weight:300;font-size:64px;font-variant-numeric:tabular-nums}.gr b small{font-size:24px;color:#86868b;margin-left:8px}
      .gr .bar{height:1px;background:#2c2c2e;margin-top:26px}.gr .s{margin-top:22px;font-size:20px;color:#86868b}.gr .s.bad{color:#ff6961}`;
      document.head.appendChild(st);
      const g = document.createElement('div'); g.className = 'gr';
      g.innerHTML = '<div class="l">爪の太さ</div><b><span class="v">0.80</span><small>mm</small></b><div class="bar"></div><div class="s">基本の形</div>';
      document.body.appendChild(g);
      window.__thin = () => { document.querySelector('.gr .v').textContent = '0.45'; const s = document.querySelector('.gr .s'); s.textContent = '細すぎて、強さが足りない'; s.classList.add('bad'); };
    });
    let i = 0;
    await p.evaluate(() => { const s = window.__studio.session; s.state.prongMm = 0.8; s.build('cine'); s.flush?.(); });
    await p.waitForTimeout(1200);
    for (let k = 0; k < 20; k++, i++) { await turn(0.004); await snap(i); }
    await p.evaluate(() => { const s = window.__studio.session; s.state.prongMm = 0.45; s.build('cine'); s.flush?.(); window.__thin(); });
    await p.waitForTimeout(1200);
    for (let k = 0; k < N; k++, i++) { await turn(0.004); await snap(i); }
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
