// 言葉なしのデモ（作者があとで声を入れる）のための、黒の上の指輪の場面を 1 こまずつ撮る。
// 黒の上に指輪、左下に数字の欄（小さな灰色のラベルと白い値）。値はすべて継ぐで本当に組んだ指輪から読む。
// 見出し（「職人の一言。」など）は組むときに字幕の側（ov3）が出す。node film.cjs
const { chromium, SP, BASE } = require('../paths.cjs');
const fs = require('fs');
const D = `${SP}/cine/film/`; fs.mkdirSync(D, { recursive: true });

(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.log('pageerror ' + e.message));
  await p.goto(`${BASE}/studio.html?nointro&rec`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__studio?.session?.built && window.__viewer, null, { timeout: 180000 });
  await p.evaluate(() => {
    window.__studio.setMode('refine');
    window.__viewer.setDisplayMode('render');
    document.querySelector('.t-dims')?.click(); document.querySelector('.t-grid')?.click();
    const st = document.createElement('style');
    st.textContent = `.tb,.tools,.insp,.cmd-wrap,.sb,.vp-tl,.verdict-chip,.dims,.gizmo,.toast,.intro-sheet,.intro-timer{display:none!important} .pro{display:block!important;background:#000!important} .vp{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;background:#000!important}
    .pn{position:fixed;left:120px;bottom:96px;width:760px;font-family:"Helvetica Neue","Hiragino Sans",sans-serif;font-weight:300;color:#f5f5f7;-webkit-font-smoothing:antialiased;z-index:99}
    .pn .g{display:grid;grid-template-columns:1fr 1fr;gap:22px 60px}
    .pn .k{font-size:13px;letter-spacing:.2em;color:#6e6e73}
    .pn .v{margin-top:6px;font-size:24px;font-variant-numeric:tabular-nums}
    .pn .v.ng{color:#ff6961}.pn .v.ok{color:#f5f5f7}
    .pn .q{margin-bottom:26px;font-size:30px;line-height:1.5;min-height:45px}
    .pn .q small{display:block;margin-top:6px;font-size:15px;color:#86868b;letter-spacing:.06em}
    .pn .opt{display:flex;gap:34px;margin-bottom:28px;font-size:26px}.pn .opt span{color:#5a5a5f;padding-bottom:8px;border-bottom:1.5px solid transparent}.pn .opt span.on{color:#f5f5f7;border-color:#f5f5f7}
    .pn svg{display:block;width:760px;height:150px;margin-bottom:22px;overflow:visible}
    .pn svg .ax{stroke:#3a3a3c}.pn svg .ln{fill:none;stroke:#86868b;stroke-width:1.5}.pn svg .pt{fill:#f5f5f7}.pn svg text{fill:#6e6e73;font-size:12px;letter-spacing:.12em}`;
    document.head.appendChild(st);
    const pn = document.createElement('div'); pn.className = 'pn'; document.body.appendChild(pn);
    const v = window.__viewer; v.setAutoRotate(false); v.scene.background = null; v.renderer.setClearColor(0x000000, 1);
    if (v.shadow?.plane) v.shadow.plane.visible = false;
    const s = window.__studio.session;
    s.setShank({ metal: 'pt900', reason: 'film' });
    const esc = (t) => String(t).replace(/[<&>]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' })[c]);
    /** 欄を描く。cells：[ラベル, 値, 'ng'|'ok'|''][]。top：上に出すもの（言葉・選ぶ欄・図の HTML） */
    window.__pn = (cells, top = '') => {
      pn.innerHTML = top + `<div class="g">${cells.map(([k, v, c]) => `<div><div class="k">${esc(k)}</div><div class="v ${c || ''}">${esc(v)}</div></div>`).join('')}</div>`;
    };
    window.__opt = (list, on) => `<div class="opt">${list.map((o) => `<span class="${o === on ? 'on' : ''}">${esc(o)}</span>`).join('')}</div>`;
    window.__info = () => {
      const r = s.built.ring; const st2 = r.setting;
      const sec = { domed: '甲丸', flat: '平打ち', halfround: '半甲丸', square: '角', free: '自由な断面' }[r.shank.section] ?? '';
      const metal = { pt900: 'Pt900', k18yg: 'K18 イエロー', k18pg: 'K18 ピンク', k18wg: 'K18 ホワイト', sv925: 'SV925' }[s.state.metal] ?? '';
      return { prong: st2.prongs[0]?.diameterMm, n: st2.prongs.length, bezel: st2.style === 'bezel', sec, w: r.shank.widthMm, t: r.shank.thicknessMm, gou: s.state.gou, g: r.metalWeightG, metal, probs: s.built.problems.length, stone: `${s.stone.longMm.toFixed(2)} × ${s.stone.widthMm.toFixed(2)} mm` };
    };
    window.__base = null;
    window.__size = (mm) => {
      const b0 = window.__base; const k = mm / b0.longMm;
      s.stone = { ...b0, outlineMm: b0.outlineMm.map((q) => ({ x: q.x * k, y: q.y * k })), longMm: b0.longMm * k, widthMm: b0.widthMm * k, depthMm: b0.depthMm * k };
      s.state.prongMm = undefined;
    };
    window.__go = () => { window.__viewer.keepCamera = true; s.build('film'); s.flush?.(); };
  });

  let i = 0; const marks = {};
  const keep = () => p.evaluate(() => { const v = window.__viewer; if (!window.__cam) return; v.camera.position.copy(window.__cam.p); v.controls.target.copy(window.__cam.t); v.controls.update(); v.dirty = true; });
  const frame = async (turn = 0.006) => { await keep(); await p.evaluate((r) => window.__viewer.turn(r), turn); await p.waitForTimeout(30); await p.screenshot({ path: `${D}${String(i++).padStart(4, '0')}.png` }); };
  const hold = async (n) => { for (let k = 0; k < n; k++) await frame(); };
  const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
  const setCam = (mult, dz) => p.evaluate(({ mult, dz }) => {
    const v = window.__viewer; v.keepCamera = false; v.fit();
    const c = v.camera, t = v.controls.target; c.position.sub(t).multiplyScalar(mult).add(t); c.position.z += dz; t.z += dz; c.position.x += 0; v.controls.update();
    window.__cam = { p: c.position.clone(), t: t.clone() }; v.keepCamera = true;
  }, { mult, dz });

  // ---- 1. ネットの情報で（三角の石、公開情報だけ → 爪 1.66 mm） ----
  await p.evaluate(() => { const s = window.__studio.session; s.state.prongMm = 1.66; s.build('film'); s.flush?.(); });
  await p.waitForTimeout(1500);
  await setCam(1.25, -1.6);
  const cellsTri = () => p.evaluate(() => { const x = window.__info(); return x; });
  marks.net = i;
  for (let k = 0; k < 75; k++) {
    if (k === 0) await p.evaluate(() => { const x = window.__info(); window.__pn([['石', x.stone], ['爪', `${x.prong.toFixed(2)} mm × ${x.n}`], ['出どころ', 'ネットの公開情報'], ['地金', `${x.metal} ・ 約 ${x.g.toFixed(1)} g`]]); });
    await frame();
  }
  // ---- 2. 職人の一言（言葉が出て、爪が 1.66 → 0.80 mm） ----
  marks.word = i;
  const quote = 'この大きさなら、最低 0.7、基本は 0.8〜1 mm。';
  for (let k = 0; k <= quote.length; k++) {
    await p.evaluate(({ t, done }) => { const x = window.__info(); window.__pn([['石', x.stone], ['爪', `${x.prong.toFixed(2)} mm × ${x.n}`], ['出どころ', 'ネットの公開情報'], ['地金', `${x.metal} ・ 約 ${x.g.toFixed(1)} g`]], `<div class="q">「${t}」${done ? '<small>職人：石川　→　Claude が決まりにする</small>' : ''}</div>`); }, { t: quote.slice(0, k), done: k === quote.length });
    await frame();
  }
  await hold(12);
  for (let k = 0; k < 60; k++) {
    const d = 1.66 + (0.8 - 1.66) * ease(k / 59);
    await p.evaluate(({ d, q }) => { const s = window.__studio.session; s.state.prongMm = Math.round(d * 100) / 100; window.__go(); const x = window.__info(); window.__pn([['石', x.stone], ['爪', `${x.prong.toFixed(2)} mm × ${x.n}`], ['出どころ', '職人の決まり ・ 工房 A'], ['地金', `${x.metal} ・ 約 ${x.g.toFixed(1)} g`]], `<div class="q">「${q}」<small>職人：石川　→　Claude が決まりにする</small></div>`); }, { d, q: quote });
    await frame();
  }
  await hold(30);
  // ---- 3. 確かめる（細くしすぎると赤く光る → 基本に戻すと作れる） ----
  marks.check = i;
  await p.evaluate(() => { const s = window.__studio.session; s.state.prongMm = 0.45; window.__go(); const x = window.__info(); window.__pn([['爪', `${x.prong.toFixed(2)} mm`, 'ng'], ['職人の決まり', '0.70 mm 以上'], ['確かめ', `作れない所 ${x.probs}`, 'ng'], ['理由', '細いと曲がって、石が落ちる']]); });
  await hold(75);
  await p.evaluate(() => { const s = window.__studio.session; s.state.prongMm = 0.8; window.__go(); const x = window.__info(); window.__pn([['爪', `${x.prong.toFixed(2)} mm`, 'ok'], ['職人の決まり', '0.70 mm 以上'], ['確かめ', '作れます', 'ok'], ['理由', '細いと曲がって、石が落ちる']]); });
  await hold(40);

  // ---- 4. 広げる（ラウンド 0.5 → 2.0 ct、爪は帳面の線で変わる。図の点が動く） ----
  await p.evaluate(() => [...document.querySelectorAll('.presets button')].find((x) => x.textContent.trim() === 'ラウンド').click());
  await p.waitForTimeout(7000);
  await p.evaluate(() => { const s = window.__studio.session; s.setShank({ metal: 'pt900', reason: 'film' }); window.__base = JSON.parse(JSON.stringify(s.stone)); window.__viewer.setDisplayMode('render'); });
  await p.evaluate(() => { window.__size(8.2); window.__studio.session.build('fit'); window.__studio.session.flush?.(); });
  await setCam(1.4, -2.2);
  marks.size = i;
  const CT = [['0.5 ct', 5.2], ['1.0 ct', 6.5], ['1.5 ct', 7.4], ['2.0 ct', 8.2]];
  const ctOf = (mm) => CT.reduce((a, c) => (Math.abs(c[1] - mm) < Math.abs(a[1] - mm) ? c : a))[0];
  const chart = (mm, d) => {
    const X = (v) => 20 + ((v - 4.5) / 4.5) * 720, Y = (v) => 130 - ((v - 0.6) / 0.3) * 110;
    const pts = [4.5, 5.2, 6.5, 7.4, 8.2, 9].map((v) => `${X(v)},${Y(0.6 + ((v - 2.5) / (8.2 - 2.5)) * 0.1 * 1.15 + 0.09)}`);
    return `<svg viewBox="0 0 760 150"><line class="ax" x1="20" y1="135" x2="740" y2="135"/><path class="ln" d="M${pts.join(' L')}"/><circle class="pt" cx="${X(mm)}" cy="${Y(d)}" r="7"/><text x="20" y="150">石の大きさ</text><text x="740" y="150" text-anchor="end">爪の太さ ← 帳面の決まり</text></svg>`;
  };
  for (const [from, to, n] of [[8.2, 5.2, 50], [5.2, 8.2, 90]]) {
    for (let k = 0; k < n; k++) {
      const mm = from + (to - from) * ease(k / (n - 1));
      const ct = ctOf(mm);
      await p.evaluate(({ mm, ct, ch }) => { window.__size(mm); window.__go(); const x = window.__info(); window.__pn([['石の大きさ', `ø ${mm.toFixed(1)} mm`], ['爪', `${x.prong.toFixed(2)} mm × ${x.n}`]], window.__opt(['0.5 ct', '1.0 ct', '1.5 ct', '2.0 ct'], ct) + ch(x.prong)); }, { mm, ct, ch: undefined }).catch(async () => {});
      const d = await p.evaluate(() => window.__info().prong);
      await p.evaluate(({ mm, ct, svg }) => { const x = window.__info(); window.__pn([['石の大きさ', `ø ${mm.toFixed(1)} mm`], ['爪', `${x.prong.toFixed(2)} mm × ${x.n}`]], window.__opt(['0.5 ct', '1.0 ct', '1.5 ct', '2.0 ct'], ct) + svg); }, { mm, ct, svg: chart(mm, d) });
      await frame();
    }
  }
  await p.evaluate(() => { window.__size(6.5); window.__go(); });
  // ---- 5. 選ぶ（腕の断面・幅・留め方・地金・号を次々に） ----
  marks.pick = i;
  const step = async (fn, arg, list, on, n = 22) => {
    await p.evaluate(({ fn, arg }) => { const s = window.__studio.session; s[fn]({ ...arg, reason: 'film' }); window.__go(); }, { fn, arg });
    await p.evaluate(({ list, on }) => { const x = window.__info(); window.__pn([['腕', `${x.sec} ${x.w.toFixed(1)} × ${x.t.toFixed(1)} mm`], ['留め方', x.bezel ? '覆輪' : `爪 ${x.n} 本 ・ ø ${x.prong.toFixed(2)} mm`], ['地金', `${x.metal} ・ 約 ${x.g.toFixed(1)} g`], ['号', `${x.gou} 号`]], window.__opt(list, on)); }, { list, on });
    await hold(n);
  };
  const SEC = ['甲丸', '平打ち', '半甲丸', '角'];
  for (const [sec, name] of [['flat', '平打ち'], ['halfround', '半甲丸'], ['square', '角'], ['domed', '甲丸']]) await step('setShank', { section: sec }, SEC, name);
  for (const w of [2.0, 2.6, 3.2, 2.2]) await step('setShank', { width_mm: w }, ['2.0 mm', '2.6 mm', '3.2 mm'], `${w.toFixed(1)} mm`, 16);
  for (const [inp, name] of [[{ style: 'prong', prong_count: 6 }, '6 本爪'], [{ style: 'bezel' }, '覆輪'], [{ style: 'prong', prong_count: 4 }, '4 本爪']]) await step('setSetting', inp, ['4 本爪', '6 本爪', '覆輪'], name, 26);
  for (const [m, name] of [['k18yg', 'K18 イエロー'], ['k18pg', 'K18 ピンク'], ['pt900', 'Pt900']]) await step('setShank', { metal: m }, ['Pt900', 'K18 イエロー', 'K18 ピンク'], name, 22);
  for (const g of [7, 15, 11]) await step('setShank', { gou: g }, ['7 号', '11 号', '15 号'], `${g} 号`, 16);
  marks.end = i;
  fs.writeFileSync(D + 'marks.json', JSON.stringify(marks));
  console.log('film できた', i, 'こま', JSON.stringify(marks)); await b.close();
})();
