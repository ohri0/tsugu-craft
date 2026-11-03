// 継ぐの本物の設定を次々に変え、黒の上で回る指輪を 1 こまずつ撮る（石の大きさ・腕の断面・留め方・地金・石の形・号）。
// 下に、いま変えている設定の欄（選んでいるものに下線）を出す。値はすべて、組んだ指輪とアプリの設定から読む。
// 作者の声：いろいろできる、を見せる。刺激が途切れないように（2026-11-04）。node reel.cjs
const { chromium, SP, BASE } = require('../paths.cjs');
const fs = require('fs');
const D = `${SP}/cine/reel/`; fs.mkdirSync(D, { recursive: true });
const PER = Number(process.argv[2] || 48); // 1 つの場面のこまの数

(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.log('pageerror ' + e.message));
  await p.goto(`${BASE}/studio.html?nointro&rec`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__studio?.session?.built && window.__viewer, null, { timeout: 180000 });
  await p.evaluate(() => [...document.querySelectorAll('.presets button')].find((x) => x.textContent.trim() === 'ラウンド').click());
  await p.waitForTimeout(7000);
  await p.evaluate(() => {
    window.__studio.setMode('refine');
    window.__viewer.setDisplayMode('render');
    document.querySelector('.t-dims')?.click(); document.querySelector('.t-grid')?.click();
    const st = document.createElement('style');
    st.textContent = `.tb,.tools,.insp,.cmd-wrap,.sb,.vp-tl,.verdict-chip,.dims,.gizmo,.toast,.intro-sheet,.intro-timer{display:none!important} .pro{display:block!important;background:#000!important} .vp{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;background:#000!important}
    .rl{position:fixed;left:50%;bottom:150px;transform:translateX(-50%);width:640px;font-family:"Helvetica Neue","Hiragino Sans",sans-serif;font-weight:300;color:#f5f5f7;-webkit-font-smoothing:antialiased;z-index:99}
    .rl .l{font-size:17px;color:#86868b}.rl .l b{font-weight:300;color:#d2d2d7;margin-left:12px;font-variant-numeric:tabular-nums}
    .rl .o{display:flex;gap:34px;margin-top:14px;font-size:26px}.rl .o span{color:#6e6e73;padding-bottom:8px;border-bottom:1.5px solid transparent;transition:color .2s}.rl .o span.on{color:#f5f5f7;border-color:#f5f5f7}
    .rl .f{display:flex;justify-content:space-between;margin-top:26px;font-size:14px;color:#6e6e73}`;
    document.head.appendChild(st);
    const g = document.createElement('div'); g.className = 'rl'; g.innerHTML = '<div class="l"></div><div class="o"></div><div class="f"><span class="f1"></span><span class="f2"></span></div>'; document.body.appendChild(g);
    const v = window.__viewer; v.setAutoRotate(false); v.scene.background = null; v.renderer.setClearColor(0x000000, 1);
    if (v.shadow?.plane) v.shadow.plane.visible = false;
    const s = window.__studio.session;
    s.setShank({ metal: 'pt900', reason: 'reel' });
    window.__base = JSON.parse(JSON.stringify(s.stone));
    window.__ui = (label, value, opts, on) => {
      document.querySelector('.rl .l').innerHTML = `${label}<b>${value}</b>`;
      document.querySelector('.rl .o').innerHTML = opts.map((o) => `<span class="${o === on ? 'on' : ''}">${o}</span>`).join('');
      const r = s.built.ring; const st2 = r.setting;
      const sec = { domed: '甲丸', flat: '平打ち', halfround: '半甲丸', square: '角', free: '自由' }[r.shank.section] ?? '';
      document.querySelector('.f1').textContent = `${st2.style === 'bezel' ? '覆輪' : `爪 ${st2.prongs.length} 本 ・ ø ${st2.prongs[0]?.diameterMm.toFixed(2)} mm`}　${sec} ${r.shank.widthMm.toFixed(1)} × ${r.shank.thicknessMm.toFixed(1)} mm`;
      document.querySelector('.f2').textContent = `${s.state.gou} 号 ・ 約 ${r.metalWeightG.toFixed(1)} g`;
    };
    window.__size = (mm) => {
      const b0 = window.__base; const k = mm / b0.longMm;
      s.stone = { ...b0, outlineMm: b0.outlineMm.map((q) => ({ x: q.x * k, y: q.y * k })), longMm: b0.longMm * k, widthMm: b0.widthMm * k, depthMm: b0.depthMm * k };
      s.state.prongMm = undefined;
    };
    window.__go = () => { window.__viewer.keepCamera = true; s.build('reel'); s.flush?.(); };
  });
  await p.evaluate(() => { window.__size(6.5); window.__go(); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const v = window.__viewer; v.keepCamera = false; window.__size(8.2); v.keepCamera = false; window.__studio.session.build('fit'); window.__studio.session.flush?.(); v.fit();
    const c = v.camera, t = v.controls.target; c.position.sub(t).multiplyScalar(1.4).add(t); c.position.z -= 2.2; t.z -= 2.2; v.controls.update(); window.__cam = { p: c.position.clone(), t: t.clone() }; v.keepCamera = true; });
  await p.evaluate(() => { window.__size(6.5); window.__go(); });
  const keep = () => p.evaluate(() => { const v = window.__viewer; v.camera.position.copy(window.__cam.p); v.controls.target.copy(window.__cam.t); v.controls.update(); v.dirty = true; });
  let i = 0;
  const snap = async () => { await keep(); await p.evaluate(() => window.__viewer.turn(0.006)); await p.waitForTimeout(30); await p.screenshot({ path: `${D}${String(i++).padStart(4, '0')}.png` }); };
  const hold = async (n) => { for (let k = 0; k < n; k++) await snap(); };
  const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
  const CT = [['0.5 ct', 5.2], ['1.0 ct', 6.5], ['1.5 ct', 7.4], ['2.0 ct', 8.2]];
  const ctOf = (mm) => CT.reduce((a, c) => (Math.abs(c[1] - mm) < Math.abs(a[1] - mm) ? c : a))[0];
  const marks = {};
  // 1. 石の大きさ（なめらかに。爪は帳面の決まりで変わる）
  marks.size = i;
  for (const [from, to] of [[6.5, 8.2], [8.2, 5.2], [5.2, 6.5]]) {
    for (let k = 0; k < PER; k++) {
      const mm = from + (to - from) * ease(k / (PER - 1));
      await p.evaluate(({ mm, ct }) => { window.__size(mm); window.__go(); window.__ui('石の大きさ', `ø ${mm.toFixed(1)} mm`, ['0.5 ct', '1.0 ct', '1.5 ct', '2.0 ct'], ct); }, { mm, ct: ctOf(mm) });
      await snap();
    }
  }
  // 2. 腕の断面
  marks.section = i;
  for (const [sec, name] of [['flat', '平打ち'], ['halfround', '半甲丸'], ['square', '角'], ['domed', '甲丸']]) {
    await p.evaluate(({ sec, name }) => { window.__studio.session.setShank({ section: sec, reason: 'reel' }); window.__go(); window.__ui('腕の断面', '', ['甲丸', '平打ち', '半甲丸', '角'], name); }, { sec, name });
    await hold(Math.round(PER * 0.6));
  }
  // 3. 腕の幅
  marks.width = i;
  for (const w of [2.0, 2.5, 3.0, 2.2]) {
    await p.evaluate((w) => { window.__studio.session.setShank({ width_mm: w, reason: 'reel' }); window.__go(); window.__ui('腕の幅', '', ['2.0 mm', '2.5 mm', '3.0 mm'], `${w.toFixed(1)} mm`); }, w);
    await hold(Math.round(PER * 0.5));
  }
  // 4. 留め方
  marks.setting = i;
  for (const [inp, name] of [[{ style: 'prong', prong_count: 6 }, '6 本爪'], [{ style: 'bezel' }, '覆輪'], [{ style: 'prong', prong_count: 4 }, '4 本爪']]) {
    await p.evaluate(({ inp, name }) => { window.__studio.session.setSetting({ ...inp, reason: 'reel' }); window.__go(); window.__ui('留め方', '', ['4 本爪', '6 本爪', '覆輪'], name); }, { inp, name });
    await hold(Math.round(PER * 0.7));
  }
  // 5. 地金
  marks.metal = i;
  for (const [m, name] of [['k18yg', 'K18 イエロー'], ['k18pg', 'K18 ピンク'], ['pt900', 'Pt900']]) {
    await p.evaluate(({ m, name }) => { window.__studio.session.setShank({ metal: m, reason: 'reel' }); window.__go(); window.__ui('地金', '', ['Pt900', 'K18 イエロー', 'K18 ピンク'], name); }, { m, name });
    await hold(Math.round(PER * 0.6));
  }
  // 6. 号
  marks.gou = i;
  for (const g of [8, 15, 11]) {
    await p.evaluate((g) => { window.__studio.session.setShank({ gou: g, reason: 'reel' }); window.__go(); window.__ui('号', `${g} 号`, ['8 号', '11 号', '15 号'], `${g} 号`); }, g);
    await hold(Math.round(PER * 0.5));
  }
  marks.end = i;
  fs.writeFileSync(D + 'marks.json', JSON.stringify(marks));
  console.log('reel できた', i, 'こま', JSON.stringify(marks)); await b.close();
})();
