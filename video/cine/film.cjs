// 言葉なしのデモ（作者があとで声を入れる）：継ぐの本物の「見せる」の画面を、本物のボタンで操作し、1 こまずつ撮る。
// 押すたびに形を組み直す待ち時間だけは撮らない（中身は同じ操作）。マウスの印もこまごとに動かして映す。
// 区切りの番号は film/marks.json に書く（組むときに使う）。node film.cjs
const { chromium, SP, BASE } = require('../paths.cjs');
const fs = require('fs');
const D = `${SP}/cine/film/`; fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D, { recursive: true });

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tsugu.password.v1', 'dev-local'); } catch {} });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('pageerror ' + e.message));
  await p.goto(`${BASE}/studio.html?nointro&rec`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__studio?.session?.built && window.__viewer, null, { timeout: 180000 });
  // マウスの印（録画には本物のマウスが映らないので、ページの中に描く）
  await p.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = `#__cur{position:fixed;left:-40px;top:-40px;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;background:rgba(255,255,255,.92);box-shadow:0 0 0 1.5px rgba(0,0,0,.5),0 2px 10px rgba(0,0,0,.5);z-index:2147483647;pointer-events:none}
    #__rip{position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:2px solid rgba(255,255,255,.9);z-index:2147483646;pointer-events:none;opacity:0}`;
    document.head.appendChild(st);
    const c = document.createElement('div'); c.id = '__cur'; document.body.appendChild(c);
    const r = document.createElement('div'); r.id = '__rip'; document.body.appendChild(r);
  });
  const prep = async () => {
    await p.click('.tabs [data-mode="refine"]'); await p.waitForTimeout(800);
    await p.evaluate(() => { const s = document.querySelector('.ws-pick'); s.value = '__new'; s.dispatchEvent(new Event('change')); });
    await p.waitForTimeout(300); await p.fill('.ws-name', '工房 B'); await p.click('.ws-make'); await p.waitForTimeout(2500);
    await p.evaluate(() => { document.querySelector('.manual-rule').open = true; });
    await p.selectOption('.mr-param', 'hold.cornerSet'); await p.fill('.mr-value', '1'); await p.fill('.mr-quote', '三角の石は、角に 1 本ずつの 3 本で留まる');
    await p.click('.mr-go'); await p.waitForTimeout(2500);
    await p.evaluate(() => window.__studio.session.setShank({ metal: 'pt900', reason: 'film' }));
    await p.waitForTimeout(1200);
  };
  await prep();

  let i = 0; const marks = {}; let cur = { x: 960, y: 1000 };
  const settle = () => p.evaluate(() => { window.__studio.session.flush?.(); });
  const lock = () => p.evaluate(() => { const v = window.__viewer; v.keepCamera = true; window.__cam = { p: v.camera.position.clone(), t: v.controls.target.clone() }; });
  const keep = () => p.evaluate(() => { const v = window.__viewer; if (!window.__cam) return; v.camera.position.copy(window.__cam.p); v.controls.target.copy(window.__cam.t); v.controls.update(); v.dirty = true; });
  const shot = async (rip = 0) => {
    await keep();
    await p.evaluate(({ x, y, rip }) => { for (const id of ['__cur', '__rip']) if (!document.getElementById(id)) { const e = document.createElement('div'); e.id = id; document.body.appendChild(e); } const c = document.getElementById('__cur'); c.style.left = x + 'px'; c.style.top = y + 'px'; const r = document.getElementById('__rip'); r.style.left = x + 'px'; r.style.top = y + 'px'; r.style.opacity = rip ? String(rip) : '0'; r.style.transform = `scale(${1.4 - rip * 0.9})`; window.__viewer.turn(0.0055); }, { ...cur, rip });
    await p.waitForTimeout(25);
    await p.screenshot({ path: `${D}${String(i++).padStart(4, '0')}.png` });
  };
  const hold = async (n) => { for (let k = 0; k < n; k++) await shot(); };
  const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
  /** マウスを sel へ n こまで動かして押す（押した後の組み直しの待ちは撮らない） */
  const press = async (sel, n = 10) => {
    const bx = await p.locator(sel).first().boundingBox();
    if (!bx) { console.log('見つからない', sel); return; }
    const to = { x: bx.x + bx.width / 2, y: bx.y + bx.height / 2 }; const from = { ...cur };
    for (let k = 1; k <= n; k++) { const u = ease(k / n); cur = { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u }; await shot(); }
    await p.evaluate((s) => document.querySelector(s).click(), sel);
    await settle(); await p.waitForTimeout(200); await settle();
    for (const r of [1, 0.7, 0.4]) await shot(r);
  };

  // 1. 見せる（工房 B ＝ ネットの公開情報だけ。爪が太い）
  await p.evaluate(() => document.querySelector('.act-present').click());
  await p.waitForTimeout(2500); await lock();
  marks.thick = i; await hold(70);
  // 2. 職人の一言を決まりにした後（閉じて、決まりを入れ、もう一度見せる。その操作は撮らない）
  await p.evaluate(() => document.querySelector('.pr-close').click()); await p.waitForTimeout(800);
  await p.evaluate(() => { document.querySelector('.manual-rule').open = true; });
  await p.selectOption('.mr-param', 'prong.minDiameterMm'); await p.fill('.mr-value', '0.7'); await p.fill('.mr-quote', 'この大きさなら、最低 0.7 mm、基本は 0.8〜1 mm');
  await p.click('.mr-go'); await p.waitForTimeout(3000); await settle();
  await p.evaluate(() => document.querySelector('.act-present').click());
  await p.waitForTimeout(2500); await p.evaluate(() => { window.__viewer.keepCamera = false; }); await keep(); await lock();
  marks.thin = i; await hold(80);
  // 3. 石の大きさ
  marks.sizes = i;
  for (const v of ['5', '8', '10', '6.5']) { await press(`.pr-opt button[data-v="${v}"]`); await hold(22); }
  // 4. 腕の断面
  marks.section = i;
  await press('.pr-tabs button[data-g="section"]', 8);
  for (const v of ['hirauchi', 'hangouman', 'kaku', 'kouman']) { await press(`.pr-opt button[data-v="${v}"]`, 8); await hold(16); }
  // 5. 留め方
  marks.setting = i;
  await press('.pr-tabs button[data-g="setting"]', 8);
  for (const v of ['6', 'bezel', '4']) { await press(`.pr-opt button[data-v="${v}"]`, 8); await hold(20); }
  // 6. 地金
  marks.metal = i;
  await press('.pr-tabs button[data-g="metal"]', 8);
  for (const v of ['k18yg', 'k18pg', 'pt900']) { await press(`.pr-opt button[data-v="${v}"]`, 8); await hold(18); }
  marks.end = i;
  fs.writeFileSync(D + 'marks.json', JSON.stringify(marks));
  console.log('film できた', i, 'こま', JSON.stringify(marks)); await b.close();
})();
