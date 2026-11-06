// 一つの指輪の物語として、継ぐの本物の画面を一歩ずつ操作し、2 倍の細かさで 1 こまずつ撮る（1600×900 → 3200×1800）。
// ページの中の時計は vt.cjs でこちらが進める（1 こま ＝ 1/30 秒）。組み上がり・赤い点滅・回転・知らせが、30 こま／秒でなめらかに映る。
// 形の組み直しや Claude の返事を待つ間は、撮らずに時計だけ早送りする（中身は同じ操作）。
// こまごとに、マウスの位置（cur）と、見せたい所の枠（boxes）・区切り（marks）を meta.json に残す。
// あとで reel.py が、その枠へなめらかに動くカメラを付ける。
// 使い方：node capture/story.cjs 章…（なしなら全部）。撮る相手は TSUGU_CAP（既定 http://localhost:5201 ＝ capture/serve.cjs）。
// 作者の声：画面を並べるのでなく、一つの物が流れるように。字まで読めるように（2026-11-04）。
const { chromium, SP } = require('../paths.cjs');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const VT = require('./vt.cjs');
const BASE = process.env.TSUGU_CAP || 'http://localhost:5201';
// 最終案 7：本物の最初の版（7606ee7）を、別の worktree で組んで出している所（first7 の章だけ使う）
const FIRST = process.env.TSUGU_FIRST || 'http://localhost:5212';
// 試しに少しだけ撮る（CAP_TEST=1。こまの数を 3 までに）
const N = (k) => (process.env.CAP_TEST ? Math.min(k, 3) : k);
const OUT = `${SP}/story`;
const PY = process.env.PY || path.join(__dirname, '..', 'work', '.venv', 'bin', 'python');
// 3D を GPU で描く（ないと 1 こま 2 秒かかる。あると 5 ミリ秒）
const GPU = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

// マウスの印：矢印（自作の線）と、押したときの輪
const CURSOR_CSS = `#__cur{position:fixed;left:-60px;top:-60px;width:26px;height:30px;margin:-3px 0 0 -5px;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
#__rip{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:2.5px solid rgba(255,255,255,.95);box-shadow:0 0 0 1px rgba(0,0,0,.25),0 0 14px rgba(255,255,255,.35);z-index:2147483646;pointer-events:none;opacity:0}`;
const ARROW = `<svg width="26" height="30" viewBox="0 0 26 30"><path d="M5 3v20.5l5.2-4.9 3.6 8.2 3.6-1.6-3.6-8.1h7.1z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

// 章ごとの画面の大きさ（なければ 1600×900）。帳面・学ぶ・技は、スマホの幅（480）で撮る（字が大きく読める。作者も iPhone で使う）
const SIZE = { ledger3m: [480, 900], waza3m: [480, 900], learn3m: [480, 900], learn4m: [480, 900], ledger7m: [480, 900], make7m: [480, 900], ask8m: [480, 900], make8m: [480, 1000],
  // 最終案 9：設計の画面は 960×540 の 3 倍（組むと字が 2 倍になる）。欄だけの場面は幅 860（スマホの形にならない幅）の真ん中 480 を 4 倍。帳面と学ぶはスマホの幅の 4 倍
  photo9: [960, 540], gothic9: [960, 540], reason9: [960, 540], make9: [960, 540], word9: [860, 540], ask9: [480, 540], learn9: [480, 540],
  // 最終案 10：全体を見せてから寄る。設計は 1280×720 の 3 倍、帳面・学ぶ・技は 960×540 の 4 倍（全体はそのまま縮め、寄るときは切り抜く）
  word10: [1280, 720], gothic10: [1280, 720], reason10: [1280, 720], make10: [1280, 720], ask10: [960, 540], learn10: [960, 540], rebuild10: [960, 540], ledger10: [960, 540],
  // 最終案 10（作者の声：実際に使っている所を中心に）：手で変える操作と、生成のあとに人が直す流れ
  ops11: [1280, 720], gothic11: [1280, 720], moyou11: [1280, 720], deco11: [1280, 720], gen12: [1280, 720] };
const DSF = { photo9: 3, gothic9: 3, reason9: 3, make9: 3, word9: 4, ask9: 4, learn9: 4,
  word10: 3, gothic10: 3, reason10: 3, make10: 3, ask10: 4, learn10: 4, rebuild10: 4, ledger10: 4, ops11: 3, gothic11: 3, moyou11: 3, deco11: 3, gen12: 3 };
// マウスの印の大きさ（4 倍で撮る章で大きくなりすぎないように）
const CURK = { word9: 0.5, ask9: 0.5, learn9: 0.5, photo9: 0.72, gothic9: 0.72, reason9: 0.72, make9: 0.72,
  word10: 0.8, gothic10: 0.8, reason10: 0.8, make10: 0.8, ask10: 0.62, learn10: 0.62, rebuild10: 0.62, ledger10: 0.62, ops11: 0.8, gothic11: 0.8, moyou11: 0.8, deco11: 0.8, gen12: 0.8 };
// 最終案 9：本物の Claude の返事を章ごと・順番ごとに覚える（work/story/_claude9/）。撮り直しでは覚えた返事を使うので、Claude は呼ばない（呼ぶのは最初の 1 回だけ）
const CLAUDE9 = new Set(['word9', 'ask9', 'learn9', 'gothic9', 'reason9', 'word10', 'ask10', 'learn10', 'gothic10', 'reason10', 'gothic11', 'deco11', 'gen12']);
// 最終案 10：同じ操作の章は、前に覚えた本物の Claude の返事をそのまま使う（新しく呼ばない）。gothic11 は gothic10（今のアプリで本物の Claude が組んだ「ゴシックな感じ」）の返事
const CLAUDE_ALIAS = { word10: 'word9', ask10: 'ask9', learn10: 'learn9', gothic11: 'gothic10',
  // 「アールデコな感じ」：試した回ごとに別に覚える（DECO_TRY=1〜4）。使う回は DECO_USE（撮り直しは、その回の返事で）
  deco11: `deco11_t${process.env.DECO_USE || process.env.DECO_TRY || '1'}`,
  // 最終の「ゴシックな感じ」（2026-11-06 作者が確定）：GEN_TAG の回ごとに覚える（goth12_t1〜3）。gothic10 の回を使うなら GEN_TAG=gothic10 DECO_USE=（なし）
  gen12: process.env.GEN_TAG === 'gothic10' ? 'gothic10' : `${process.env.GEN_TAG || 'goth12'}_t${process.env.DECO_USE || process.env.DECO_TRY || '1'}` };
// 覚えた返事を返す前に待つ時間（ミリ秒。作業の記録が 1 行ずつ増える所を撮るため）
const CLAUDE9_WAIT = { gothic9: 1600, gothic10: 1600, gothic11: 1600, deco11: 1600, gen12: 1600 };
async function cacheClaude(p, name) {
  const dir = `${OUT}/_claude9/${CLAUDE_ALIAS[name] || name}`;
  fs.mkdirSync(dir, { recursive: true });
  let k = 0;
  await p.route('**/api/claude', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.continue();
    if ((req.postData() || '') === '{}') return route.fulfill({ status: 400, contentType: 'application/json', body: '{}' });
    const f = `${dir}/${String(k).padStart(3, '0')}.json`;
    k++;
    if (fs.existsSync(f)) {
      const c = JSON.parse(fs.readFileSync(f, 'utf8'));
      console.log(name, 'Claude：覚えた返事を使う', path.basename(f));
      // 覚えた返事はすぐ返るので、作業の記録が 1 行ずつ増える所が撮れない。本物の時のように少し待ってから返す
      const wait = CLAUDE9_WAIT[name] || 0;
      if (wait) await new Promise((r) => setTimeout(r, wait));
      return route.fulfill({ status: c.status, headers: c.headers, body: c.body });
    }
    if (process.env.CLAUDE9_OFF) { console.log(name, 'Claude を呼ばない設定なので止めた', k); return route.abort(); }
    const r = await route.fetch({ timeout: 280000 });
    const body = await r.text();
    const headers = { 'content-type': r.headers()['content-type'] || 'application/json' };
    fs.writeFileSync(f, JSON.stringify({ status: r.status(), headers, body }));
    fs.appendFileSync(`${OUT}/_claude9/calls.log`, `${new Date().toISOString()} ${name} ${k} ${r.status()}\n`);
    console.log(name, 'Claude を本当に呼んだ', k, r.status());
    return route.fulfill({ status: r.status(), headers, body });
  });
}
async function chapter(name, fn) {
  // 撮っている間は別のフォルダに置き、撮り終えてから入れ替える（撮っている途中でも、前のこまで動画を組めるように）
  const D = `${OUT}/${name}.new/`;
  fs.rmSync(D, { recursive: true, force: true });
  fs.mkdirSync(D, { recursive: true });
  const b = await chromium.launch({ args: GPU });
  const [VW, VH] = SIZE[name] || [1600, 900];
  const K = DSF[name] || 2;
  const ctx = await b.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: K });
  await ctx.addInitScript(() => { try { localStorage.setItem('tsugu.password.v1', 'dev-local'); } catch {} });
  await ctx.addInitScript(VT.INIT);
  const p = await ctx.newPage();
  p.setDefaultTimeout(120000);
  p.on('pageerror', (e) => console.log(name, 'pageerror', e.message));
  if (CLAUDE9.has(name)) await cacheClaude(p, name);
  let i = 0;
  let cur = { x: VW - 120, y: VH - 40 };
  const boxes = {};
  const marks = {};
  const curs = [];
  const t0 = Date.now();
  const ensure = () => p.evaluate(({ css, arrow }) => {
    if (!document.getElementById('__curcss')) { const s = document.createElement('style'); s.id = '__curcss'; s.textContent = css; document.head.appendChild(s); }
    if (!document.getElementById('__cur')) { const e = document.createElement('div'); e.id = '__cur'; e.innerHTML = arrow; document.body.appendChild(e); }
    if (!document.getElementById('__rip')) { const e = document.createElement('div'); e.id = '__rip'; document.body.appendChild(e); }
  }, { css: CURSOR_CSS, arrow: ARROW });
  const centerOf = async (sel) => {
    const bx = await p.locator(sel).first().boundingBox();
    if (!bx) { console.log(name, '見つからない', sel); return null; }
    return { x: bx.x + bx.width / 2, y: bx.y + bx.height / 2, bx };
  };
  const a = {
    p,
    get i() { return i; },
    /** 1 こま撮る（時計を 1/30 秒進めてから）。rip：押した輪の濃さ。turn：3D を回す角（ラジアン） */
    shot: async ({ rip = 0, turn = 0, hide = false } = {}) => {
      await ensure();
      await p.evaluate(({ x, y, rip, turn, hide, curk }) => {
        const c = document.getElementById('__cur'); c.style.left = x + 'px'; c.style.top = y + 'px'; c.style.opacity = hide ? '0' : '1';
        if (curk !== 1) { c.style.transform = `scale(${curk})`; c.style.transformOrigin = '5px 3px'; }
        const r = document.getElementById('__rip'); r.style.left = x + 'px'; r.style.top = y + 'px'; r.style.opacity = String(rip); r.style.transform = `scale(${(1.6 - rip * 0.9) * curk})`;
        if (turn && window.__viewer) window.__viewer.turn(turn);
        return window.__vt.step(1000 / 30);
      }, { ...cur, rip, turn, hide, curk: CURK[name] || 1 });
      await p.screenshot({ path: `${D}${String(i).padStart(4, '0')}.png`, timeout: 180000 });
      curs.push([Math.round(cur.x), Math.round(cur.y), Math.round(rip * 100) / 100]);
      i++;
    },
    hold: async (n, o = {}) => { for (let k = 0; k < n; k++) await a.shot(o); },
    mark: (k) => { marks[k] = i; },
    /** 見せたい所の枠を、今のこまに残す（ページの px。2 倍の画像では ×2） */
    box: async (k, sel, pad = 12) => {
      const bx = await p.locator(sel).first().boundingBox().catch(() => null);
      if (bx) boxes[k] = { f: i, x: Math.round(bx.x - pad), y: Math.round(bx.y - pad), w: Math.round(bx.width + pad * 2), h: Math.round(bx.height + pad * 2) };
      else console.log(name, '枠が見つからない', sel);
    },
    boxRaw: (k, x, y, w, h) => { boxes[k] = { f: i, x, y, w, h }; },
    /** マウスを sel（または {x, y}）へ n こまで動かす。本物のマウスも動かす（指したときの色が出る） */
    move: async (to, n = 14, o = {}) => {
      const c = typeof to === 'string' ? await centerOf(to) : to;
      if (!c) return null;
      const from = { ...cur };
      for (let k = 1; k <= n; k++) {
        const e = ease(k / n);
        cur = { x: from.x + (c.x - from.x) * e, y: from.y + (c.y - from.y) * e };
        await p.mouse.move(cur.x, cur.y);
        await a.shot(o);
      }
      return c;
    },
    /** 押す：動いて、押した輪。押した後は after こま撮る（形の組み直しは押した中で済む） */
    press: async (sel, { n = 14, after = 4, js = false, turn = 0 } = {}) => {
      const c = await a.move(sel, n, { turn });
      if (!c) return false;
      await a.shot({ rip: 1, turn });
      if (js) await p.evaluate((s) => document.querySelector(s).click(), sel);
      else await p.mouse.click(c.x, c.y);
      await a.shot({ rip: 0.65, turn });
      await a.shot({ rip: 0.3, turn });
      await a.hold(after, { turn });
      return true;
    },
    /** つまんで動かす（最終案 10）：from（sel か {x, y}）で押したまま、to へ n こまかけて動かして離す。押している間は輪を薄く残す */
    drag: async (from, to, { n = 24, pre = 12, o = {}, hold = 2 } = {}) => {
      const c = await a.move(from, pre, o);
      if (!c) return false;
      await a.shot({ ...o, rip: 1 });
      await p.mouse.down();
      await a.shot({ ...o, rip: 0.8 });
      const s = { ...cur };
      for (let k = 1; k <= n; k++) {
        const e = ease(k / n);
        cur = { x: s.x + (to.x - s.x) * e, y: s.y + (to.y - s.y) * e };
        await p.mouse.move(cur.x, cur.y);
        await a.shot({ ...o, rip: 0.55 });
      }
      for (let k = 0; k < hold; k++) await a.shot({ ...o, rip: 0.55 });
      await p.mouse.up();
      await a.shot({ ...o, rip: 0.3 });
      return true;
    },
    /** 打つ：1 字ずつ、each こまずつ */
    type: async (sel, text, { each = 2, n = 12 } = {}) => {
      await a.press(sel, { n, after: 2 });
      for (const ch of text) {
        await p.keyboard.insertText(ch);
        for (let k = 0; k < each; k++) await a.shot();
      }
    },
    /** 撮らずに早送りして、条件が成り立つまで待つ */
    until: (fn, arg, o = {}) => VT.until(p, fn, arg, o),
    /** 撮らずに早送り（仮の時計で ms） */
    ff: (ms) => VT.ff(p, ms),
    /** 待つ間、probe の値が変わったら per こま撮る（Claude の作業の記録が 1 行ずつ増えるのを、早回しで見せる） */
    watch: async (done, probe, { per = 6, timeout = 240000, onChange } = {}) => {
      const t = Date.now();
      let last = await p.evaluate(probe).catch(() => null);
      for (;;) {
        if (await p.evaluate(done).catch(() => false)) return true;
        if (Date.now() - t > timeout) { console.log(name, '待ちきれない（watch）'); return false; }
        const v = await p.evaluate(probe).catch(() => null);
        if (v !== last) { last = v; if (onChange) await onChange(); await a.hold(per); }
        else { await VT.step(p, 100); await new Promise((r) => setTimeout(r, 40)); }
      }
    },
    /** sel が見える所まで、入れ物を n こまかけてなめらかにスクロールする */
    scroll: async (sel, { block = 'start', n = 16, offset = 0 } = {}) => {
      const plan = await p.evaluate(({ sel, block, offset }) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        let c = el.parentElement;
        while (c && !(c.scrollHeight > c.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(c).overflowY))) c = c.parentElement;
        c = c || document.scrollingElement;
        const before = c.scrollTop;
        el.scrollIntoView({ block });
        const after = Math.max(0, c.scrollTop - offset);
        c.scrollTop = before;
        window.__scr = c;
        return { before, after };
      }, { sel, block, offset });
      if (!plan) { console.log(name, 'スクロールの先がない', sel); return; }
      for (let k = 1; k <= n; k++) {
        const y = plan.before + (plan.after - plan.before) * ease(k / n);
        await p.evaluate((y) => { window.__scr.scrollTop = y; }, y);
        await a.shot();
      }
    },
    /** 場面を整える（撮らない） */
    settle: (ms = 800) => VT.ff(p, ms),
  };
  try {
    await fn(a);
  } catch (e) {
    console.log(name, 'しくじり', e.message.split('\n')[0]);
  }
  fs.writeFileSync(`${D}meta.json`, JSON.stringify({ frames: i, marks, boxes, cur: curs, size: [VW * K, VH * K] }));
  await b.close();
  execFileSync(PY, ['-I', path.join(__dirname, 'tojpg.py'), D], { stdio: 'inherit' });
  const keep = `${OUT}/${name}/`;
  for (const f of ['info.json', 'camera.json', 'track.json', 'grade.json']) if (fs.existsSync(`${keep}${f}`) && !fs.existsSync(`${D}${f}`)) fs.copyFileSync(`${keep}${f}`, `${D}${f}`);
  fs.rmSync(keep, { recursive: true, force: true });
  fs.renameSync(D, keep);
  console.log(name, i, 'こま', Math.round((Date.now() - t0) / 1000), '秒', JSON.stringify(marks));
}

/** 継ぐのエディター（設計）を開いて、組み上がるまで待つ（撮らない） */
const studio = async (a, { intro = false } = {}) => {
  const { p } = a;
  await p.goto(`${BASE}/studio.html?rec${intro ? '' : '&nointro'}`, { waitUntil: 'load' });
  await a.until(() => !!(window.__studio && window.__studio.session && window.__studio.session.built && window.__viewer), null, { label: '組み上がり', chunk: 50 });
  await a.settle(1200);
};
/** 工房 B（ネットの公開情報だけの帳面）を作り、三角の角の決まりだけ入れておく（撮らない） */
const workshopB = async (a, name = '工房 B') => {
  const { p } = a;
  await p.click('.tabs [data-mode="refine"]'); await a.settle(800);
  await p.evaluate(() => { const s = document.querySelector('.ws-pick'); s.value = '__new'; s.dispatchEvent(new Event('change')); });
  await a.settle(300); await p.fill('.ws-name', name); await p.click('.ws-make'); await a.settle(2500);
  await p.evaluate(() => { document.querySelector('.manual-rule').open = true; });
  await p.selectOption('.mr-param', 'hold.cornerSet'); await p.fill('.mr-value', '1'); await p.fill('.mr-quote', '三角の石は、角に 1 本ずつの 3 本で留まる');
  await p.click('.mr-go'); await a.settle(2500);
  await p.evaluate(() => { document.querySelector('.manual-rule').open = false; document.querySelector('.studio-refine').scrollTop = 0; });
  await a.settle(800);
};
const refine = async (a) => { await a.p.click('.tabs [data-mode="refine"]'); await a.settle(1000); };
// 最終案 3：3D はいつもレンダー（暗い背景に金）。映像の色をそろえるため
const renderDisp = async (a) => { await a.p.click('.disp [data-disp="render"]'); await a.settle(500); };
const probsOf = (p) => p.evaluate(() => (window.__studio.session.built?.problems ?? []).map((x) => x.check));
/** 断面の編集の SVG の mm → ページの px */
const secMap = async (p) => {
  const m = await p.evaluate(() => { const c = document.querySelector('.sec-edit svg').getScreenCTM(); return { a: c.a, d: c.d, e: c.e, f: c.f }; });
  return (x, y) => ({ x: m.a * x + m.e, y: m.d * y + m.f });
};
/** 撮らずに、断面を自由に描く（設定のための操作） */
const drawSectionQuiet = async (a, pts) => {
  const { p } = a;
  await p.click('.se-mode[data-mode="draw"]'); await a.settle(200);
  await p.mouse.move(pts[0].x, pts[0].y); await p.mouse.down();
  for (const q of pts.slice(1)) await p.mouse.move(q.x, q.y);
  await p.mouse.up(); await a.settle(1500);
};
/** 平らで薄い腕の断面（厚み 約 0.95 mm）：腕が薄い、になる */
const thinFlat = (px) => { const o = []; for (let k = 0; k <= 40; k++) { const th = Math.PI * (k / 40); o.push(px(1.5 * Math.cos(th), -0.05 - 0.95 * Math.pow(Math.sin(th), 0.35))); } return o; };
/** 爪が細くなるまで、−を押す（撮らない） */
const thinProngsQuiet = async (a) => {
  const { p } = a;
  await p.locator('.slider[data-s="r-prong"]').scrollIntoViewIfNeeded();
  for (let k = 0; k < 8; k++) {
    await p.click('.slider[data-s="r-prong"] .sl-step[data-d="-1"]'); await a.settle(500);
    const pr = await probsOf(p);
    if (pr.includes('prong-thin') && k >= 2) break;
  }
};
/** 「見せる」で 1 つの組み合わせを作る（撮らない）。向きは斜めに戻す（どの指輪も同じ向きから回り始める） */
const presentCombo = async (a, { preset, setting, metal, section }) => {
  const { p } = a;
  if (await p.locator('.present:not([hidden])').count()) { await p.click('.pr-close'); await a.settle(600); }
  if (preset) {
    await p.click('.tabs [data-mode="make"]'); await a.settle(300);
    await p.click(`.presets button[data-preset="${preset}"]`); await a.settle(600);
    await a.until(() => !!(window.__studio.session && window.__studio.session.built), null, { label: preset });
    await a.settle(2000);
  }
  await p.click('.act-present'); await a.settle(1200);
  const pick = async (g, v) => { if (!v) return; await p.click(`.pr-tabs button[data-g="${g}"]`); await a.settle(200); await p.click(`.pr-opt button[data-v="${v}"]`); await a.settle(1500); };
  await pick('setting', setting); await pick('section', section); await pick('metal', metal);
  await p.evaluate(() => window.__viewer.setView('angle'));
  await a.settle(300);
};
const openManual = async (a) => {
  if (!(await a.p.locator('details.manual[open]').count())) { await a.p.click('details.manual > summary'); await a.settle(500); }
};
const specsText = (p) => p.evaluate(() => document.querySelector('.sb .specs')?.innerText.replace(/\s+/g, ' '));

// ================================================================ 最終案 7 の道具（2026-11-05）
/** 細かい形になるまで待つ（待ちは FINAL_DELAY_MS ＝ 500 ms。粗い形のまま撮らない） */
const fine = async (a, ms = 400) => {
  await a.settle(800);
  await a.until(() => !window.__studio.session.pendingFinal, null, { label: '細かい形', chunk: 50 });
  await a.settle(ms);
};
const camOf = (p) => p.evaluate(() => {
  const v = window.__viewer; const c = v.camera;
  return { pos: c.position.toArray(), tgt: v.controls.target.toArray(), fov: c.fov, aspect: c.aspect, view: c.view ? { ...c.view } : null };
});
const setCam = (p, cam) => p.evaluate((cam) => {
  const v = window.__viewer; const c = v.camera;
  c.position.set(...cam.pos); v.controls.target.set(...cam.tgt); c.up.set(0, 0, 1); c.lookAt(...cam.tgt);
  v.controls.update(); v.dirty = true;
}, cam);
/** 見せるの右上の × は動画に要らない（押さない。切り取りの中に入らないように透かす） */
const hideClose = (p) => p.addStyleTag({ content: '.pr-close{opacity:0!important}' });
/** 記録の設計（石と設計）を、今の設計の場で組む（見本の作品を見せるの上で見るため。赤い爪・点滅はアプリのまま） */
const showDesign = async (a, d) => {
  await a.p.evaluate((d) => { const s = window.__studio.session; s.stone = d.stone; s.state = JSON.parse(JSON.stringify(d.state)); s.build('見本を見る'); }, d);
  await fine(a);
};
/** 帳面の決まりで組んだ今の設計を、問題の印なしで描き直す（確かめる前の見本の絵。形はまったく同じ） */
const plainRing = (p) => p.evaluate(() => {
  const v = window.__viewer; const s = window.__studio.session;
  v.setRing(s.built.ring, window.__lastLook, []);
});
const watchLook = (p) => p.evaluate(() => {
  const v = window.__viewer; const o = v.setRing.bind(v);
  v.setRing = (r, look, probs) => { window.__lastLook = look; return o(r, look, probs); };
});
/** カメラを dir の向き・距離 d に。点 at が、3D の真ん中から (sx, sy) px（右・上）に来るように target をずらす */
const aimAt = (p, at, D, d, sx = 0, sy = 0) => p.evaluate(({ at, D, d, sx, sy }) => {
  const v = window.__viewer; const c = v.camera; const V = c.position.constructor;
  const m = new V(at[0], at[1], at[2]);
  const dir = new V(D[0], D[1], D[2]).normalize();
  const right = new V().crossVectors(new V(0, 0, 1), dir).normalize();
  const up = new V().crossVectors(dir, right).normalize();
  const h = v.renderer.domElement.clientHeight || 900;
  const pxmm = h / (2 * d * Math.tan(c.fov * Math.PI / 360));
  const tgt = m.clone().sub(right.clone().multiplyScalar(sx / pxmm)).sub(up.clone().multiplyScalar(sy / pxmm));
  v.controls.target.copy(tgt);
  c.position.copy(tgt).add(dir.clone().multiplyScalar(d));
  c.up.set(0, 0, 1); c.lookAt(tgt);
  v.controls.update(); v.dirty = true;
  return { pxmm, tgt: tgt.toArray(), pos: c.position.toArray() };
}, { at, D, d, sx, sy });
const WORD7 = 'この大きさの石なら、爪はだいたい 0.8〜1 ミリ。最低でも 0.7 ミリ。細いと曲がって石が落ちる。';
const ANSWER7 = '5.5 ミリくらいの石なら、0.7 ミリはほしい。';
// 最終案 8（作者が決めた言葉。どの大きさの石の話かを、はじめに言う）
const WORD8 = '8 mm くらいの石なら、爪はだいたい 0.8〜1 ミリ。最低でも 0.7 ミリ。細いと曲がって石が落ちる。';
const ANSWER8 = ANSWER7;
const dimsText = (p) => p.evaluate(() => [...document.querySelectorAll('.dims text, .dims .dim-label, .dim-label')].map((t) => t.textContent).join(' ・ '));
/** 石の大きさを変える（確かめるの「手で変える」の石の大きさの数の欄に打つ。本物の操作）。細かい形まで待つ */
const setStone = async (a, mm) => {
  const { p } = a;
  await refine(a); await openManual(a);
  const sel = '.slider[data-s="r-stone"] .sl-num input';
  await p.locator(sel).scrollIntoViewIfNeeded();
  await p.fill(sel, String(mm)); await p.press(sel, 'Enter');
  await fine(a, 800);
};

const CH = {
  // 組む：石の写真に輪郭 → 石が立体に → 線から指輪が組み上がる → 寸法 → 図面と作り方（工房 B ＝ ネットの公開情報だけ。爪が太い）
  build: async (a) => {
    const { p } = a;
    await studio(a); await workshopB(a);
    await p.click('.tabs [data-mode="make"]'); await a.settle(500);
    await p.goto(`${BASE}/studio.html?rec`, { waitUntil: 'load' });
    await a.until(() => { const s = document.querySelector('.intro-stage'); return s && !s.hidden; }, null, { label: '写真', chunk: 33 });
    await a.box('photo', '.intro-frame', 10); a.mark('photo');
    let stage = 'photo';
    for (let k = 0; k < 600; k++) {
      await a.shot({ hide: true });
      const st = await p.evaluate(() => ({ stage: !document.querySelector('.intro-stage').hidden, sheet: !!document.querySelector('.intro-sheet'), disp: document.querySelector('.disp [aria-pressed="true"]')?.dataset.disp, timer: !!document.querySelector('.intro-timer') }));
      if (stage === 'photo' && !st.stage) { stage = 'stone'; a.mark('stone'); await a.box('ring', '.vp', 0); }
      if (stage === 'stone' && st.disp === 'wire') { stage = 'wire'; a.mark('wire'); }
      if (stage === 'wire' && st.disp === 'shaded') { stage = 'shaded'; a.mark('shaded'); }
      if (stage === 'shaded' && st.disp === 'render') { stage = 'render'; a.mark('render'); }
      if (stage === 'render' && st.sheet) { stage = 'sheet'; a.mark('sheet'); await a.box('card', '.intro-sheet', 10); await a.box('timer', '.intro-timer', 10); }
      if (stage === 'sheet' && !st.sheet && !st.timer) { stage = 'done'; a.mark('done'); break; }
    }
    await a.box('specs', '.sb .specs', 6); await a.box('ring2', '.vp', 0);
    console.log('build の数字', await specsText(p));
    await a.hold(45, { turn: 0.004, hide: true });
  },
  // 職人の一言：太い爪の指輪 → 言葉を打つ → Claude の案 → これでいい → 爪が変わる → 決まりを外して比べる（表）
  word: async (a) => {
    const { p } = a;
    await studio(a); await workshopB(a);
    await p.locator('.ar-text').scrollIntoViewIfNeeded(); await a.settle(300);
    console.log('word 前の数字', await specsText(p));
    await a.box('ring', '.vp', 0); await a.box('specs', '.sb .specs', 6); a.mark('start');
    await a.hold(24, { turn: 0.004 });
    await a.box('field', '.ar-text', 10); await a.box('rules', '.rules-sec', 8); a.mark('type');
    await a.type('.ar-text', 'この大きさの石なら、爪は最低 0.7 ミリ、基本は 0.8 から 1 ミリくらい。細すぎると曲がって石が落ちる。', { each: 2 });
    a.mark('typed');
    await a.hold(6);
    await a.box('go', '.ar-go', 8);
    await a.press('.ar-go', { after: 0 });
    a.mark('wait');
    await a.hold(10);
    await a.until(() => /これでいい/.test(document.querySelector('.ar-proposal')?.innerText || ''), null, { label: 'Claude の案', timeout: 180000 });
    await a.box('proposal', '.ar-proposal', 10); a.mark('proposal');
    await a.hold(36);
    await a.box('ok', '.ar-proposal button.ok', 8);
    await a.press('.ar-proposal button.ok', { after: 0 });
    a.mark('applied');
    await a.hold(30, { turn: 0.003 });
    await a.box('flash', '.rule-flash', 10); await a.box('ring2', '.vp', 0); await a.box('specs2', '.sb .specs', 6); a.mark('after');
    console.log('word 後の数字', await specsText(p));
    await a.hold(50, { turn: 0.004 });
    // 決まりを外して比べる：公開情報だけの形と、職人の決まりの形
    await a.scroll('.compare-btn', { block: 'center', n: 14 });
    await a.press('.compare-btn', { after: 6 });
    a.mark('cmp');
    await a.box('cmpTable', '.compare', 8); await a.box('ring3', '.vp', 0);
    console.log('比べる', await p.evaluate(() => document.querySelector('.compare')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(60, { turn: 0.003 });
    await a.press('.compare-back', { after: 4 });
    a.mark('back');
    await a.hold(30, { turn: 0.003 });
  },
  // 確かめる：爪を細くしていくと、赤く点滅。「作れない所」を押す → どこが・なぜ・直す → Claude で直す
  fix: async (a) => {
    const { p } = a;
    await studio(a); await refine(a); await openManual(a);
    await p.locator('.slider[data-s="r-prong"]').scrollIntoViewIfNeeded(); await a.settle(300);
    await a.box('slider', '.slider[data-s="r-prong"]', 14); await a.box('ring', '.vp', 0); a.mark('start');
    await a.hold(12, { turn: 0.003 });
    for (let k = 0; k < 8; k++) {
      const ok = await a.press('.slider[data-s="r-prong"] .sl-step[data-d="-1"]', { n: k ? 4 : 14, after: 3 });
      if (!ok) break;
      const n = await p.evaluate(() => window.__studio.session.built.problems.length);
      if (n > 0 && k >= 2) break;
    }
    a.mark('red');
    await a.box('chip', '.verdict-chip', 8);
    await a.hold(40, { turn: 0.002 });
    await a.press('.verdict-chip', { n: 16, after: 2 });
    await a.box('pop', '.fix-pop', 10); a.mark('pop');
    console.log('fix の札', await p.evaluate(() => document.querySelector('.fix-pop')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(45);
    await a.press('.fix-pop .fp-claude', { after: 2 });
    a.mark('claude');
    await p.evaluate(() => document.querySelector('.fix-log')?.scrollIntoView({ block: 'center' }));
    await a.box('log', '.fix-log', 10);
    await a.watch(
      () => !/直しています/.test(document.querySelector('.fix-log')?.innerText || '') && document.querySelectorAll('.fix-log li').length > 2,
      () => document.querySelector('.fix-log')?.innerText.length || 0,
      { per: 8, onChange: async () => { await p.evaluate(() => document.querySelector('.fix-log')?.scrollIntoView({ block: 'center' })); await a.box('log', '.fix-log', 10); } },
    );
    await p.evaluate(() => document.querySelector('.fix-log')?.scrollIntoView({ block: 'center' }));
    await a.box('log', '.fix-log', 10); a.mark('fixed');
    console.log('fix の記録', await p.evaluate(() => document.querySelector('.fix-log')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(30);
    await a.box('chip2', '.verdict-chip', 8); await a.box('ring2', '.vp', 0);
    await a.hold(40, { turn: 0.004 });
  },
  // 正面・横・上：パースのない平らな図。ワイヤー・シェード・レンダー
  views: async (a) => {
    const { p } = a;
    await studio(a); await refine(a);
    await a.box('ring', '.vp', 0); await a.box('tools', '.tools', 6); a.mark('start');
    await a.hold(16, { turn: 0.004 });
    for (const v of ['front', 'side', 'top']) {
      await a.press(`.view-btn[data-view="${v}"]`, { n: 10, after: 2 });
      a.mark(v); await a.box(`vp_${v}`, '.vp', 0);
      await a.hold(26);
    }
    await a.press('.view-btn[data-view="angle"]', { n: 10, after: 2 }); a.mark('angle');
    await a.hold(14, { turn: 0.004 });
    await a.box('disp', '.disp', 6);
    for (const d of ['wire', 'shaded', 'render']) {
      await a.press(`.disp [data-disp="${d}"]`, { n: 10, after: 2 });
      a.mark(d);
      await a.hold(22, { turn: 0.004 });
    }
  },
  // 描く：腕の断面を、自由に描く → なめらかな線に直る → 点を動かして薄くすると赤
  section: async (a) => {
    const { p } = a;
    await studio(a); await refine(a); await openManual(a);
    await a.p.evaluate(() => document.querySelector('.sec-edit')?.scrollIntoView({ block: 'center' })); await a.settle(400);
    await a.box('editor', '.sec-edit', 10); await a.box('ring', '.vp', 0); a.mark('start');
    await a.hold(10, { turn: 0.003 });
    await a.press('.se-mode[data-mode="draw"]', { n: 14, after: 2 });
    // SVG の mm の座標 → ページの px
    const map = await p.evaluate(() => {
      const svg = document.querySelector('.sec-edit svg'); const m = svg.getScreenCTM();
      return { a: m.a, d: m.d, e: m.e, f: m.f };
    });
    const px = (x, y) => ({ x: map.a * x + map.e, y: map.d * y + map.f });
    // 外側を、右の端 → 上 → 左の端へなぞる（高めの丸い断面）。y は上が負（SVG の上向き）
    const pts = [];
    for (let k = 0; k <= 36; k++) { const u = k / 36; const th = Math.PI * u; pts.push(px(1.5 * Math.cos(th), -0.05 - 2.1 * Math.pow(Math.sin(th), 0.8))); }
    await a.move(pts[0], 10);
    await p.mouse.down();
    a.mark('draw');
    for (const q of pts.slice(1)) await a.move(q, 1, { rip: 0.15 });
    await p.mouse.up();
    a.mark('drawn');
    await a.hold(30, { turn: 0.004 });
    await a.box('editor2', '.sec-edit', 10);
    // 点を動かす：いちばん上の点を下へ（薄くする）
    await a.press('.se-mode[data-mode="move"]', { n: 12, after: 2 });
    const top = await p.evaluate(() => {
      const hs = [...document.querySelectorAll('.sec-edit .se-handles .se-h:not(.end)')];
      let best = null; for (const h of hs) { const r = h.getBoundingClientRect(); if (!best || r.y < best.y) best = { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }
      return best;
    });
    if (top) {
      await a.move(top, 12);
      await p.mouse.down();
      a.mark('thin');
      for (let k = 1; k <= 30; k++) { const q = { x: top.x, y: top.y + (k / 30) * (map.d * 1.75) }; await a.move(q, 1, { rip: 0.15 }); }
      await p.mouse.up();
      a.mark('thinned');
      await a.hold(40, { turn: 0.003 });
    }
  },
  // 見せる：全画面の黒。押して、石の大きさ・腕の断面・留め方・地金を切り替える
  present: async (a) => {
    const { p } = a;
    await studio(a);
    a.mark('start');
    await a.hold(6);
    await a.press('.act-present', { n: 16, after: 0 });
    await a.settle(200);
    a.mark('present');
    await a.box('panel', '.pr-panel', 20); await a.box('ring', '.vp', 0);
    await a.hold(30);
    const groups = { stone: ['5', '8', '10', '6.5'], section: null, setting: ['6', 'bezel', '4'], metal: ['pt900', 'k18pg', 'k18wg', 'k18yg'] };
    for (const [g, vals] of Object.entries(groups)) {
      if (g !== 'stone') { await a.press(`.pr-tabs button[data-g="${g}"]`, { n: 8, after: 2 }); }
      const list = vals || (await p.evaluate(() => [...document.querySelectorAll('.pr-opt button')].map((b) => b.dataset.v).filter((v) => v !== 'free')));
      const order = g === 'section' ? [...list.filter((v) => v !== 'kouman'), 'kouman'] : list;
      a.mark(g);
      for (const v of order) {
        await a.press(`.pr-opt button[data-v="${v}"]`, { n: 8, after: 0 });
        a.mark(`${g}_${v}`);
        await a.hold(13);
      }
    }
    a.mark('end');
    await a.hold(20);
  },
  // 最終案 2：確かめる・直す。細くする → 赤く点滅 → 押す → 理由 → まとめて直す（一瞬）→ もう一度細くする → Claude で直す
  fix2: async (a) => {
    const { p } = a;
    await studio(a); await refine(a); await openManual(a);
    await p.locator('.slider[data-s="r-prong"]').scrollIntoViewIfNeeded(); await a.settle(300);
    await a.box('slider', '.slider[data-s="r-prong"]', 14); await a.box('ring', '.vp', 0); a.mark('start');
    await a.hold(10, { turn: 0.003 });
    const thin = async () => {
      for (let k = 0; k < 8; k++) {
        const ok = await a.press('.slider[data-s="r-prong"] .sl-step[data-d="-1"]', { n: k ? 4 : 14, after: 3 });
        if (!ok) break;
        const n = await p.evaluate(() => window.__studio.session.built.problems.length);
        if (n > 0 && k >= 2) break;
      }
    };
    await thin();
    a.mark('red'); await a.box('chip', '.verdict-chip', 8); await a.box('sliderR', '.slider[data-s="r-prong"]', 14);
    await a.hold(36, { turn: 0.002 });
    await a.press('.verdict-chip', { n: 16, after: 2 });
    await a.box('pop', '.fix-pop', 10); a.mark('pop');
    console.log('fix2 の札', await p.evaluate(() => document.querySelector('.fix-pop')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(40);
    await a.box('every', '.fix-pop .fp-every', 8);
    await a.press('.fix-pop .fp-every', { n: 12, after: 2 });
    a.mark('fixed1'); await a.box('chip2', '.verdict-chip', 8); await a.box('ring2', '.vp', 0);
    console.log('fix2 まとめて直す', await specsText(p));
    await a.hold(40, { turn: 0.003 });
    // もう一度細くして、今度は Claude に直してもらう
    await p.locator('.slider[data-s="r-prong"]').scrollIntoViewIfNeeded(); await a.settle(200);
    await thin();
    a.mark('red2');
    await a.hold(14, { turn: 0.002 });
    await a.press('.verdict-chip', { n: 14, after: 2 });
    a.mark('pop2');
    await a.hold(14);
    await a.box('claudeBtn', '.fix-pop .fp-claude', 8);
    await a.press('.fix-pop .fp-claude', { n: 12, after: 2 });
    a.mark('claude');
    const showLog = async () => { await p.evaluate(() => document.querySelector('.fix-log')?.scrollIntoView({ block: 'center' })); await a.box('log', '.fix-log', 10); };
    await showLog();
    await a.watch(
      () => document.querySelector('.verdict-chip')?.classList.contains('ok') && document.querySelectorAll('.fix-log li').length >= 4,
      () => document.querySelector('.fix-log')?.innerText.length || 0,
      { per: 10, onChange: showLog },
    );
    await showLog(); a.mark('fixed2');
    console.log('fix2 の記録', await p.evaluate(() => document.querySelector('.fix-log')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(36);
    await a.box('chip3', '.verdict-chip', 8); await a.box('ring3', '.vp', 0);
    await a.hold(30, { turn: 0.004 });
  },
  // 最終案 2：どんな石でも。よくある形（ラウンド・マーキス・エメラルド・ペア）を、留め方と地金を替えて「見せる」で
  stones: async (a) => {
    const { p } = a;
    await studio(a);
    // 形・留め方・地金がはっきりちがうように（ピンクとホワイトは画面で金と見分けにくいので、プラチナと金を交互に）。
    // 向き：マーキスとエメラルドは、そのままだと横から見えるので、3D を少し回す（人がドラッグで回すのと同じ）
    const combos = [['round', '4', 'pt900', 0], ['marquise', '6', 'k18yg', 0.6], ['emerald', 'bezel', 'pt900', 0.6], ['pear', '4', 'k18yg', 0.3]];
    for (const [preset, setting, metal, turn] of combos) {
      await p.click('.tabs [data-mode="make"]'); await a.settle(300);
      await p.click(`.presets button[data-preset="${preset}"]`);
      await a.settle(600);
      await a.until(() => !!(window.__studio.session && window.__studio.session.built), null, { label: preset });
      await a.settle(2500);
      await p.click('.act-present'); await a.settle(1500);
      await p.click('.pr-tabs button[data-g="setting"]'); await a.settle(200);
      await p.click(`.pr-opt button[data-v="${setting}"]`); await a.settle(1500);
      await p.click('.pr-tabs button[data-g="metal"]'); await a.settle(200);
      await p.click(`.pr-opt button[data-v="${metal}"]`); await a.settle(1200);
      if (turn) await p.evaluate((t) => window.__viewer.turn(t), turn);
      a.mark(preset);
      console.log('stones', preset, await p.evaluate(() => document.querySelector('.pr-grid')?.innerText.replace(/\s+/g, ' ')));
      await a.hold(40, { hide: true });
      await p.click('.pr-close'); await a.settle(800);
    }
  },
  // 最終案 2：作り方。形から、工程の札がその場で出る。上から順に、字が読める速さで（ロウ付けの札は詳しくも開く）→ 図面（寄らない）
  make2: async (a) => {
    const { p } = a;
    await studio(a);
    await a.hold(4);
    await a.press('.tabs [data-mode="hand"]', { after: 2 });
    await a.box('panel', '.build-panel', 0); a.mark('cards');
    await a.hold(14);
    const n = await p.locator('.build-panel .mk-card').count();
    for (let k = 0; k < n; k++) {
      const sel = `.build-panel .mk-card:nth-child(${k + 1})`;
      await a.scroll(sel, { block: 'start', n: 12, offset: 12 });
      await a.box(`card${k}`, sel, 6); a.mark(`card${k}`);
      const title = await p.evaluate((s) => document.querySelector(s + ' h3')?.innerText, sel);
      console.log('make2', k, title);
      if (/石座を組む|覆輪を作る|ロウ付け/.test(title || '') && (await p.locator(sel + ' .flow .term').count())) {
        await a.hold(10);
        await a.press(sel + ' .flow .term', { n: 12, after: 4 });
        await a.box(`card${k}open`, sel, 6); a.mark(`open${k}`);
        await a.hold(30);
      } else {
        await a.hold(22);
      }
    }
    a.mark('cardsEnd');
    await a.press('.disp [data-disp="draw"]', { after: 2 });
    a.mark('draw');
    await a.settle(400);
    await a.box('sheet', '.vp', 0);
    await a.hold(50);
  },
  // 最終案 2：断面を自由に描く（描いた線どおりに、なめらかな線が合う）→ 尖った所だけが赤 → 元に戻す
  section2: async (a) => {
    const { p } = a;
    await studio(a); await refine(a); await openManual(a);
    await p.evaluate(() => document.querySelector('.sec-edit')?.scrollIntoView({ block: 'center' })); await a.settle(400);
    await a.box('editor', '.sec-edit', 10); await a.box('svg', '.sec-edit svg', 6); await a.box('ring', '.vp', 0); a.mark('start');
    await a.hold(10, { turn: 0.003 });
    await a.press('.se-mode[data-mode="draw"]', { n: 14, after: 2 });
    const map = await p.evaluate(() => { const m = document.querySelector('.sec-edit svg').getScreenCTM(); return { a: m.a, d: m.d, e: m.e, f: m.f }; });
    const px = (x, y) => ({ x: map.a * x + map.e, y: map.d * y + map.f });
    const stroke = async (pts, name) => {
      await a.move(pts[0], 10);
      await p.mouse.down();
      a.mark(name);
      for (const q of pts.slice(1)) await a.move(q, 1, { rip: 0.15 });
      await p.mouse.up();
      a.mark(name + 'End');
    };
    // 1 本目：なめらかな丸い断面（ゆっくり、48 こま）
    const arc = [];
    for (let k = 0; k <= 48; k++) { const u = k / 48; const th = Math.PI * u; arc.push(px(1.45 * Math.cos(th), -0.05 - 1.95 * Math.pow(Math.sin(th), 0.85))); }
    await stroke(arc, 'draw1');
    await a.hold(30, { turn: 0.004 });
    await a.box('editor2', '.sec-edit', 10);
    // 2 本目：てっぺんを尖らせる（とがり）
    const peak = [];
    const P = [[1.4, -0.05], [1.2, -0.6], [0.7, -1.1], [0.12, -1.7], [0.0, -2.15], [-0.12, -1.7], [-0.7, -1.1], [-1.2, -0.6], [-1.4, -0.05]];
    for (let k = 0; k < P.length - 1; k++) for (let j = 0; j < 6; j++) { const u = j / 6; peak.push(px(P[k][0] + (P[k + 1][0] - P[k][0]) * u, P[k][1] + (P[k + 1][1] - P[k][1]) * u)); }
    peak.push(px(...P[P.length - 1]));
    await stroke(peak, 'draw2');
    await a.hold(10);
    await a.box('editor3', '.sec-edit', 10);
    console.log('section2 とがり', await p.evaluate(() => ({ chip: document.querySelector('.verdict-chip')?.innerText, read: document.querySelector('.sec-edit .se-read')?.innerText.replace(/\s+/g, ' '), probs: window.__studio.session.built?.problems?.map((x) => x.check + ':' + x.where).join(',') })));
    a.mark('sharp');
    await a.hold(45, { turn: 0.003 });
    await a.press('.se-act.se-undo', { n: 12, after: 2 });
    a.mark('fixed');
    await a.hold(30, { turn: 0.004 });
  },
  // 最終案 2：Claude が聞きに来る。帳面（石川工房）→ 質問の札（話して答える・書いて答える）→ 書いて答える → Claude の案 → 帳面に入れる
  ask2: async (a) => {
    const { p } = a;
    await p.goto(`${BASE}/app.html?nointro#ledger`, { waitUntil: 'load' });
    await a.until(() => !!document.querySelector('.rule-card, .rule-cards li'), null, { label: '帳面' });
    await a.settle(800);
    await a.box('cards', '.rule-cards', 10); a.mark('ledger');
    await a.hold(20);
    await a.scroll('.iv-card', { block: 'center', n: 20 });
    await a.box('question', '.iv-card', 14); a.mark('question');
    console.log('ask2 の質問', await p.evaluate(() => document.querySelector('.iv-card')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(16);
    await a.box('speak', '.iv-card .speak, .iv-card .voice-cta', 8);
    await a.move('.iv-card .speak, .iv-card .voice-cta', 14); a.mark('speak');
    await a.hold(20);
    await a.box('write', '.iv-card button.answer', 8);
    await a.press('.iv-card button.answer', { n: 10, after: 2 });
    await a.until(() => { const q = document.querySelector('.iv-q'); return q && !q.classList.contains('pending') && /Claude が聞いています/.test(document.body.innerText); }, null, { label: 'Claude の問い', timeout: 120000 });
    await a.settle(300);
    await p.evaluate(() => document.querySelector('.iv-card')?.scrollIntoView({ block: 'start' })); await a.settle(200);
    await a.box('interview', '.iv-card', 12); a.mark('asked');
    console.log('ask2 の問い（Claude）', await p.evaluate(() => document.querySelector('.iv-q')?.innerText));
    await a.hold(30);
    await a.box('answer', '.answer-box textarea', 10);
    await a.type('.answer-box textarea', '5.5 ミリくらいの石なら、0.65 ミリはほしい', { each: 2 });
    a.mark('typed');
    await a.hold(6);
    await a.box('make', '.answer-box button.make', 8);
    await a.press('.answer-box button.make', { after: 0 });
    a.mark('wait');
    await a.hold(8);
    await a.until(() => /帳面に入れる/.test(document.querySelector('.proposal-slot')?.innerText || ''), null, { label: 'Claude の決まり', timeout: 180000 });
    await a.settle(200);
    await a.box('draft', '.proposal-slot .proposal', 10); a.mark('draft');
    console.log('ask2 の案', await p.evaluate(() => document.querySelector('.proposal-slot')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(40);
    await a.box('ok', '.proposal-slot [data-a="ok"]', 8);
    await a.press('.proposal-slot [data-a="ok"]', { after: 6 });
    a.mark('saved');
    await a.scroll('.rule-cards', { block: 'start', n: 22, offset: 80 });
    await a.box('cards2', '.rule-cards', 10); a.mark('top');
    await a.hold(40);
  },
  // 最終案 2：学ぶ。ロウ付けの前にエメラルドを外すか → 帳面の決まりから答え → なぜ？
  learn2: async (a) => {
    const { p } = a;
    await p.goto(`${BASE}/app.html?nointro#learn`, { waitUntil: 'load' });
    await a.settle(1500);
    await a.box('page', '.view.ask', 0); a.mark('start');
    await a.hold(12);
    await a.box('composer', '.composer', 10);
    await a.type('.composer textarea', 'エメラルドは、ロウ付けの前に外す？', { each: 2 });
    a.mark('typed');
    await a.hold(6);
    await a.press('.composer .send', { after: 6 });
    a.mark('wait');
    await a.until(() => !!document.querySelector('.thread .a-short'), null, { label: '学ぶの答え', timeout: 180000 });
    await a.settle(300);
    await a.box('answer', '.thread', 10); await a.box('short', '.thread .a-short', 10); a.mark('answer');
    console.log('learn2 の答え', await p.evaluate(() => document.querySelector('.thread')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(36);
    if (await p.locator('.thread .why-btn').count()) {
      await a.press('.thread .why-btn', { after: 4 });
      a.mark('why');
      await a.box('why', '.thread .a-why', 10);
      await a.hold(10);
      await a.scroll('.thread .a-why', { block: 'center', n: 20 });
      await a.box('why2', '.thread .a-why', 10); a.mark('why2');
      await a.hold(40);
    }
  },
  // 最終案 2：ほかの技。技の一覧（6 つの技の帳面）→ 木目金の帳面 → Claude の質問（組み立て直すと同じ技）
  waza2: async (a) => {
    const { p } = a;
    await p.goto(`${BASE}/app.html?nointro#waza`, { waitUntil: 'load' });
    await a.settle(1500);
    await a.box('list', '#screen-waza .view.waza', 0); a.mark('list');
    await a.hold(16);
    await a.scroll('.big-tech[href="#waza/mokume"]', { block: 'center', n: 26 });
    await a.box('others', '.pub-sec-h + .big-techs', 10); await a.box('mokume', '.big-tech[href="#waza/mokume"]', 8); a.mark('others');
    await a.hold(18);
    await a.press('.big-tech[href="#waza/mokume"]', { n: 14, after: 2 });
    await a.until(() => { const s = document.querySelector('#screen-waza'); const q = s && s.querySelector('.iv-q'); return q && !q.classList.contains('pending') && /Claude が聞いています/.test(s.innerText); }, null, { label: '木目金の問い', timeout: 120000 });
    await a.settle(300);
    await p.evaluate(() => window.scrollTo(0, 0)); await a.settle(200);
    await a.box('page', '#screen-waza .tech-page', 0); await a.box('ask', '#screen-waza .iv-root', 10); a.mark('ask');
    console.log('waza2 の問い', await p.evaluate(() => document.querySelector('#screen-waza .iv-q')?.innerText));
    await a.hold(40);
    await a.scroll('#screen-waza .tech-rules', { block: 'start', n: 24, offset: 60 });
    await a.box('rules', '#screen-waza .tech-rules', 10); a.mark('rules');
    await a.hold(30);
  },
  // 最終案 2：組み立て直す。手がかり（9 つ）を開いて見る → 組み立てる（Claude）→ 手順を 1 つずつ → 答え合わせ（9/11）
  rebuild2: async (a) => {
    const { p } = a;
    await p.goto(`${BASE}/app.html?nointro#waza/rebuild`, { waitUntil: 'load' });
    await a.settle(1500);
    await a.box('head', '.view-head', 10); a.mark('start');
    await a.hold(16);
    await a.press('details.clues > summary', { n: 14, after: 4 });
    await a.box('clues', 'details.clues', 8); a.mark('clues');
    console.log('rebuild2 手がかり', await p.evaluate(() => document.querySelector('details.clues')?.innerText.slice(0, 400).replace(/\s+/g, ' ')));
    await a.hold(30);
    await a.scroll('details.clues .clue-list li:nth-child(5)', { block: 'center', n: 30 });
    await a.hold(20);
    await a.scroll('.actions .go', { block: 'center', n: 20 });
    await a.box('go', '.actions .go', 8);
    await a.press('.actions .go', { after: 2 });
    a.mark('wait');
    await a.box('waiting', '.actions', 30);
    await a.hold(30);
    await a.until(() => !!document.querySelector('.steps-h li'), null, { label: '組み立て', timeout: 300000 });
    await a.settle(400);
    await p.evaluate(() => document.querySelector('.steps-h')?.scrollIntoView({ block: 'start' })); await a.settle(200);
    a.mark('steps');
    for (let k = 1; k <= 4; k++) {
      await a.scroll(`.steps-h li:nth-child(${k})`, { block: 'center', n: 16 });
      await a.box(`step${k}`, `.steps-h li:nth-child(${k})`, 8); a.mark(`step${k}`);
      await a.hold(26);
    }
    console.log('rebuild2 手順', await p.evaluate(() => document.querySelector('.steps-h')?.innerText.slice(0, 500).replace(/\s+/g, ' ')));
    if (await p.locator('.actions .check').count()) {
      await a.scroll('.actions', { block: 'center', n: 22 });
      await a.box('check', '.actions .check', 8);
      await a.press('.actions .check', { after: 4 });
      a.mark('checking');
      await a.until(() => !!document.querySelector('.score'), null, { label: '答え合わせ', timeout: 300000 });
      await a.settle(400);
      await p.evaluate(() => document.querySelector('.score')?.scrollIntoView({ block: 'center' })); await a.settle(200);
      await a.box('score', '.score', 12); a.mark('score');
      console.log('rebuild2 答え合わせ', await p.evaluate(() => document.querySelector('.score')?.innerText.replace(/\s+/g, ' ')));
      await a.hold(40);
      await a.scroll('.steps-h li:nth-child(1)', { block: 'center', n: 24 });
      await a.box('verdict1', '.steps-h li:nth-child(1)', 8); a.mark('verdict1');
      await a.hold(40);
    }
  },
  // ================================================================ 最終案 3（2026-11-04 夜）
  // 見せる（黒の上の金の指輪）の並び：つかみ・一瞬で組み上がる・題。どれも同じ向きから回り始める（指輪 → 指輪でつなぐため）
  hero3: async (a) => {
    const { p } = a;
    await studio(a);
    const combos = [
      { name: 'tri', metal: 'k18yg' },
      { name: 'round', preset: 'round', setting: '4', metal: 'pt900' },
      { name: 'marquise', preset: 'marquise', setting: '6', metal: 'k18yg' },
      { name: 'emerald', preset: 'emerald', setting: 'bezel', metal: 'pt900', section: 'hirauchi' },
      { name: 'oval', preset: 'oval', setting: '4', metal: 'k18yg', section: 'hangouman' },
      { name: 'pear', preset: 'pear', setting: '4', metal: 'pt900', section: 'kaku' },
      { name: 'princess', preset: 'princess', setting: '4', metal: 'k18yg' },
    ];
    for (const c of combos) {
      await presentCombo(a, c);
      a.mark(c.name); await a.box(`ring_${c.name}`, '.vp', 0);
      console.log('hero3', c.name, await p.evaluate(() => document.querySelector('.pr-panel')?.innerText.replace(/\s+/g, ' ').slice(0, 200)));
      await a.hold(54, { hide: true });
    }
  },
  // 一瞬で組み上がる：石の写真 → 輪郭 → 石が立体に → 線から指輪 → 金 → 図面と作り方（石川工房の帳面のまま＝職人の決まりで組む）
  build3: async (a) => {
    const { p } = a;
    await p.goto(`${BASE}/studio.html?rec`, { waitUntil: 'load' });
    await a.until(() => { const s = document.querySelector('.intro-stage'); return s && !s.hidden; }, null, { label: '写真', chunk: 33 });
    await a.box('photo', '.intro-frame', 10); a.mark('photo');
    let stage = 'photo';
    for (let k = 0; k < 600; k++) {
      await a.shot({ hide: true });
      const st = await p.evaluate(() => ({ stage: !document.querySelector('.intro-stage').hidden, sheet: !!document.querySelector('.intro-sheet'), disp: document.querySelector('.disp [aria-pressed="true"]')?.dataset.disp, timer: !!document.querySelector('.intro-timer') }));
      if (stage === 'photo' && !st.stage) { stage = 'stone'; a.mark('stone'); await a.box('ring', '.vp', 0); }
      if (stage === 'stone' && st.disp === 'wire') { stage = 'wire'; a.mark('wire'); }
      if (stage === 'wire' && st.disp === 'shaded') { stage = 'shaded'; a.mark('shaded'); }
      if (stage === 'shaded' && st.disp === 'render') { stage = 'render'; a.mark('render'); await a.box('timer', '.intro-timer', 10); }
      if (stage === 'render' && st.sheet) { stage = 'sheet'; a.mark('sheet'); await a.box('card', '.intro-sheet', 10); await a.box('timer', '.intro-timer', 10); console.log('build3 timer', await p.evaluate(() => document.querySelector('.intro-timer')?.innerText.replace(/\s+/g, ' '))); }
      if (stage === 'sheet' && !st.sheet && !st.timer) { stage = 'done'; a.mark('done'); break; }
    }
    console.log('build3 の数字', await specsText(p));
    await a.hold(40, { turn: 0.004, hide: true });
  },
  // 職人の一言（丸く見える向きから）：工房 B（ネットの公開情報だけ）の太く高い指輪 → 職人の言葉を打つ → Claude の案 → これでいい → 爪も高さも変わる → 斜めから
  // 2026-11-06：画面の「正面」が図面の正面図の向き（指の軸から、丸く見える）に変わった（082dd79）。前の「横」で見ていた絵は、今は「正面」
  word3: async (a) => {
    const { p } = a;
    await studio(a); await workshopB(a); await renderDisp(a);
    await p.click('.view-btn[data-view="front"]'); await a.settle(800);
    await p.locator('.ar-text').scrollIntoViewIfNeeded(); await a.settle(300);
    console.log('word3 前の数字', await specsText(p));
    await a.box('ring', '.vp', 0); await a.box('panel', '.studio-refine', 0); a.mark('start');
    await a.hold(40);
    await a.box('field', '.ar-text', 10); await a.box('rules', '.rules-sec', 8); a.mark('type');
    await a.type('.ar-text', 'この大きさの石なら、爪は最低 0.7 ミリ、基本は 0.8 から 1 ミリくらい。細すぎると曲がって石が落ちる。', { each: 2 });
    a.mark('typed');
    await a.hold(8);
    await a.box('go', '.ar-go', 8);
    await a.press('.ar-go', { after: 0 });
    a.mark('wait');
    await a.hold(10);
    await a.until(() => /これでいい/.test(document.querySelector('.ar-proposal')?.innerText || ''), null, { label: 'Claude の案', timeout: 180000 });
    await a.box('proposal', '.ar-proposal', 10); a.mark('proposal');
    console.log('word3 の案', await p.evaluate(() => document.querySelector('.ar-proposal')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(50);
    await a.box('ok', '.ar-proposal button.ok', 8);
    await a.press('.ar-proposal button.ok', { after: 0 });
    a.mark('applied');
    await a.hold(40);
    await a.box('ring2', '.vp', 0); await a.box('flash', '.rule-flash', 10); a.mark('after');
    console.log('word3 後の数字', await specsText(p));
    await a.hold(40);
    await p.click('.view-btn[data-view="angle"]'); await a.settle(400);
    a.mark('angle'); await a.box('ring3', '.vp', 0);
    await a.hold(90, { turn: 0.004, hide: true });
  },
  // 最終案 6（話の芯）：職人の一言 → Claude が決まりに → これでいい → 今の設計と「これまでの作品」を確かめ直す → まとめて直す。
  // 記録に作品がないので、アプリの「見本の作品を入れて試す」で見本を入れる（見本は、職人の作品ではないと画面に書かれている）
  heart6: async (a) => {
    const { p } = a;
    await studio(a); await workshopB(a); await renderDisp(a);
    if (await p.locator('.add-samples').count()) {
      await p.locator('.add-samples').first().scrollIntoViewIfNeeded(); await a.settle(300);
      await p.click('.add-samples'); await a.settle(1500);
    }
    console.log('heart6 前の数字', await specsText(p));
    await p.locator('.ar-text').scrollIntoViewIfNeeded(); await a.settle(300);
    await a.box('ring', '.vp', 0); await a.box('panel', '.studio-refine', 0); a.mark('start');
    await a.hold(20);
    await a.box('field', '.ar-text', 10); a.mark('type');
    await a.type('.ar-text', 'この大きさの石なら、爪は最低 0.7 ミリ、基本は 0.8 から 1 ミリくらい。細すぎると曲がって石が落ちる。', { each: 2 });
    a.mark('typed');
    await a.hold(8);
    await a.press('.ar-go', { after: 0 });
    a.mark('wait');
    await a.until(() => /これでいい/.test(document.querySelector('.ar-proposal')?.innerText || ''), null, { label: 'Claude の案', timeout: 180000 });
    await a.box('proposal', '.ar-proposal', 10); a.mark('proposal');
    console.log('heart6 の案', await p.evaluate(() => document.querySelector('.ar-proposal')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(30);
    await a.press('.ar-proposal button.ok', { after: 0 });
    a.mark('applied');
    await a.hold(30);
    await a.until(() => !!document.querySelector('.past-check'), null, { label: 'これまでの作品', timeout: 60000 });
    await p.evaluate(() => document.querySelector('.past-check').scrollIntoView({ block: 'start' }));
    await a.settle(500);
    await a.box('past', '.past-check', 10); a.mark('past');
    console.log('heart6 これまでの作品', await p.evaluate(() => document.querySelector('.past-check')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(40);
    if (await p.locator('.past-fix').count()) {
      await a.press('.past-fix', { after: 0 });
      a.mark('fixed');
      await a.settle(800);
      await p.evaluate(() => document.querySelector('.past-check')?.scrollIntoView({ block: 'start' }));
      await a.settle(300);
      await a.box('past2', '.past-check', 10);
      console.log('heart6 直したあと', await p.evaluate(() => document.querySelector('.past-check')?.innerText.replace(/\s+/g, ' ')));
      // 押したあとの矢印が「次に作る人の設計にも、この決まりが効きます。」の字に重ならないよう、
      // 動画の枠（ページの y 80〜424）の外、右下へよける（2026-11-05。こまの数は前と同じ 50）
      await a.move({ x: 1560, y: 480 }, 10);
      await a.hold(40);
    }
    console.log('heart6 後の数字', await specsText(p));
  },
  // 確かめる・直す：爪が細い＋腕が薄い（作れない所がいくつも）→ 札 → ボタンは決まった直し方を 1 つずつ → （同じ所から）Claude はまとめて直す
  fix3: async (a) => {
    const { p } = a;
    const setup = async () => {
      await studio(a); await refine(a); await openManual(a); await renderDisp(a);
      await p.evaluate(() => document.querySelector('.sec-edit')?.scrollIntoView({ block: 'center' })); await a.settle(400);
      await drawSectionQuiet(a, thinFlat(await secMap(p)));
      await thinProngsQuiet(a);
      await p.evaluate(() => document.querySelector('.studio-refine').scrollTop = 0); await a.settle(600);
      console.log('fix3 の問題', (await probsOf(p)).join(','));
    };
    await setup();
    await a.box('ring', '.vp', 0); await a.box('chip', '.verdict-chip', 8); await a.box('verdict', '.big-verdict', 8); a.mark('start');
    await a.hold(40, { turn: 0.002 });
    await a.press('.verdict-chip', { n: 16, after: 2 });
    await a.box('pop', '.fix-pop', 10); a.mark('pop');
    console.log('fix3 の札', await p.evaluate(() => document.querySelector('.fix-pop')?.innerText.replace(/\s+/g, ' ')));
    const rows = await p.evaluate(() => [...document.querySelectorAll('.fix-pop li')].map((li) => li.innerText.split('\n')[0]));
    console.log('fix3 の行', rows.join(' / '));
    for (let k = 0; k < rows.length; k++) await a.box(`row${k}`, `.fix-pop li:nth-child(${k + 1})`, 6);
    await a.box('fixes', '.fix-pop ul', 6);
    await a.hold(40);
    // ボタン：腕の行の「腕を厚くする」だけを押す（決まった直し方が 1 つ）
    const bandIdx = rows.findIndex((r) => /腕/.test(r));
    const sel = `.fix-pop li:nth-child(${(bandIdx >= 0 ? bandIdx : 0) + 1}) .fp-fix`;
    await a.box('oneBtn', sel, 8);
    await a.press(sel, { n: 14, after: 2 });
    a.mark('one');
    await a.box('pop1', '.fix-pop', 10); await a.box('chip1', '.verdict-chip', 8);
    console.log('fix3 1 つ直した', (await probsOf(p)).join(','));
    await a.hold(50, { turn: 0.002 });
    // 同じ所からもう一度（撮らない）→ Claude で直す
    await setup();
    a.mark('again'); await a.box('chip2', '.verdict-chip', 8);
    await a.hold(16, { turn: 0.002 });
    await a.press('.verdict-chip', { n: 14, after: 2 });
    a.mark('pop2'); await a.box('claudeBtn', '.fix-pop .fp-claude', 8);
    await a.hold(16);
    await a.press('.fix-pop .fp-claude', { n: 12, after: 2 });
    a.mark('claude');
    const showLog = async () => { await p.evaluate(() => document.querySelector('.fix-log')?.scrollIntoView({ block: 'center' })); await a.box('log', '.fix-log', 10); };
    await showLog();
    await a.watch(
      () => document.querySelector('.verdict-chip')?.classList.contains('ok') && document.querySelectorAll('.fix-log li').length >= 4,
      () => document.querySelector('.fix-log')?.innerText.length || 0,
      { per: 10, onChange: showLog },
    );
    await showLog(); a.mark('fixed');
    console.log('fix3 の記録', await p.evaluate(() => document.querySelector('.fix-log')?.innerText.replace(/\s+/g, ' ')));
    console.log('fix3 直したあと', (await probsOf(p)).join(','), await specsText(p));
    await a.hold(60);
    await a.box('chip3', '.verdict-chip', 8); await a.box('ring3', '.vp', 0); a.mark('ok');
    await a.hold(60, { turn: 0.004 });
  },
  // 描く：断面を自由に描く → 描いた形のまま → 尖らせる → 先だけ赤 → 元に戻す（レンダーで）
  section3: async (a) => {
    const { p } = a;
    await studio(a); await refine(a); await openManual(a); await renderDisp(a);
    await p.evaluate(() => document.querySelector('.sec-edit')?.scrollIntoView({ block: 'center' })); await a.settle(400);
    await a.box('editor', '.sec-edit', 10); await a.box('svg', '.sec-edit svg', 6); await a.box('ring', '.vp', 0); a.mark('start');
    await a.hold(10, { turn: 0.003 });
    await a.press('.se-mode[data-mode="draw"]', { n: 14, after: 2 });
    const px = await secMap(p);
    const stroke = async (pts, name) => {
      await a.move(pts[0], 10);
      await p.mouse.down();
      a.mark(name);
      for (const q of pts.slice(1)) await a.move(q, 1, { rip: 0.15 });
      await p.mouse.up();
      a.mark(name + 'End');
    };
    const arc = [];
    for (let k = 0; k <= 48; k++) { const th = Math.PI * (k / 48); arc.push(px(1.45 * Math.cos(th), -0.05 - 1.95 * Math.pow(Math.sin(th), 0.85))); }
    await stroke(arc, 'draw1');
    await a.hold(30, { turn: 0.004 });
    await a.box('editor2', '.sec-edit', 10);
    const peak = [];
    const P = [[1.4, -0.05], [1.2, -0.6], [0.7, -1.1], [0.12, -1.7], [0.0, -2.15], [-0.12, -1.7], [-0.7, -1.1], [-1.2, -0.6], [-1.4, -0.05]];
    for (let k = 0; k < P.length - 1; k++) for (let j = 0; j < 6; j++) { const u = j / 6; peak.push(px(P[k][0] + (P[k + 1][0] - P[k][0]) * u, P[k][1] + (P[k + 1][1] - P[k][1]) * u)); }
    peak.push(px(...P[P.length - 1]));
    await stroke(peak, 'draw2');
    await a.hold(10);
    await a.box('editor3', '.sec-edit', 10); await a.box('read', '.sec-edit .se-read', 6);
    console.log('section3 とがり', await p.evaluate(() => ({ chip: document.querySelector('.verdict-chip')?.innerText, read: document.querySelector('.sec-edit .se-read')?.innerText.replace(/\s+/g, ' ') })));
    a.mark('sharp');
    await a.hold(50, { turn: 0.003 });
    await a.press('.se-act.se-undo', { n: 12, after: 2 });
    a.mark('fixed');
    await a.hold(30, { turn: 0.004 });
  },
  // 同じ決まりで：石の形と腕の断面・留め方を替えても、「作れます」のまま（設計の画面、レンダー）
  same3: async (a) => {
    const { p } = a;
    await studio(a); await refine(a); await openManual(a); await renderDisp(a);
    const combos = [
      { name: 'round', preset: 'round', section: 'kouman' },
      { name: 'marquise', preset: 'marquise', section: 'hirauchi' },
      { name: 'pear', preset: 'pear', section: 'kaku' },
      { name: 'emerald', preset: 'emerald', section: 'hangouman', pattern: 'bezel' },
      { name: 'oval', preset: 'oval', section: 'hirauchi' },
    ];
    for (const c of combos) {
      await p.click('.tabs [data-mode="make"]'); await a.settle(300);
      await p.click(`.presets button[data-preset="${c.preset}"]`); await a.settle(600);
      await a.until(() => !!(window.__studio.session && window.__studio.session.built), null, { label: c.preset });
      await a.settle(1500);
      await refine(a); await openManual(a); await renderDisp(a);
      await p.click(`.pick button[data-k="腕の断面"][data-v="${c.section}"]`).catch(() => console.log('same3 断面なし', c.section)); await a.settle(1500);
      if (c.pattern) { await p.click(`.pick button[data-k="留め方"][data-v="${c.pattern}"]`).catch(() => console.log('same3 留め方なし')); await a.settle(1500); }
      await p.evaluate(() => window.__viewer.setView('angle')); await a.settle(400);
      await p.evaluate(() => document.querySelector('.studio-refine').scrollTop = 0); await a.settle(300);
      a.mark(c.name); await a.box(`chip_${c.name}`, '.verdict-chip', 8); await a.box(`verdict_${c.name}`, '.big-verdict', 8);
      console.log('same3', c.name, (await probsOf(p)).join(',') || '作れます', await specsText(p));
      await a.hold(45, { turn: 0.004, hide: true });
    }
  },
  // 帳面：職人（石川）の決まり → 資料から入れた決まり（出どころつき）→ Claude から質問 → 書いて答える → Claude の案 → 帳面に入れる
  ledger3: async (a) => {
    const { p } = a;
    await p.goto(`${BASE}/app.html?nointro#ledger`, { waitUntil: 'load' });
    await a.until(() => !!document.querySelector('.rule-card, .rule-cards li'), null, { label: '帳面' });
    await a.settle(800);
    await a.box('head', '#screen-ledger .view-head, .view.keep .view-head', 10); await a.box('cards', '.rule-cards', 10);
    await a.box('card1', '.rule-cards li:nth-child(1)', 8); await a.box('card2', '.rule-cards li:nth-child(2)', 8); a.mark('ledger');
    console.log('ledger3 職人の決まり', await p.evaluate(() => document.querySelector('.rule-cards')?.innerText.replace(/\s+/g, ' ').slice(0, 400)));
    await a.hold(50);
    await a.scroll('.public-rules', { block: 'start', n: 24, offset: 40 });
    await a.box('pub', '.public-rules', 10); await a.box('pubHead', '.public-rules .pub-sec-h', 8); await a.box('pub1', '.rule-cards.pub li:nth-child(1)', 8); await a.box('pub2', '.rule-cards.pub li:nth-child(2)', 8); a.mark('pub');
    console.log('ledger3 資料', await p.evaluate(() => document.querySelector('.public-rules')?.innerText.replace(/\s+/g, ' ').slice(0, 300)));
    await a.hold(50);
    await a.scroll('.iv-card', { block: 'center', n: 24 });
    await a.box('question', '.iv-card', 14); a.mark('question');
    await a.hold(24);
    await a.box('write', '.iv-card button.answer', 8);
    await a.press('.iv-card button.answer', { n: 12, after: 2 });
    await a.until(() => { const q = document.querySelector('.iv-q'); return q && !q.classList.contains('pending') && /Claude が聞いています/.test(document.body.innerText); }, null, { label: 'Claude の問い', timeout: 120000 });
    await a.settle(300);
    await p.evaluate(() => document.querySelector('.iv-card')?.scrollIntoView({ block: 'start' })); await a.settle(200);
    await a.box('interview', '.iv-card', 12); await a.box('q', '.iv-q', 8); a.mark('asked');
    console.log('ledger3 の問い（Claude）', await p.evaluate(() => document.querySelector('.iv-q')?.innerText));
    await a.hold(36);
    await a.box('answer', '.answer-box textarea', 10);
    await a.type('.answer-box textarea', '5.5 ミリくらいの石なら、0.65 ミリはほしい', { each: 2 });
    a.mark('typed');
    await a.hold(6);
    await a.box('make', '.answer-box button.make', 8);
    await a.press('.answer-box button.make', { after: 0 });
    a.mark('wait');
    await a.hold(8);
    await a.until(() => /帳面に入れる/.test(document.querySelector('.proposal-slot')?.innerText || ''), null, { label: 'Claude の決まり', timeout: 180000 });
    await a.settle(200);
    await a.box('draft', '.proposal-slot .proposal', 10); a.mark('draft');
    console.log('ledger3 の案', await p.evaluate(() => document.querySelector('.proposal-slot')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(50);
    await a.box('ok', '.proposal-slot [data-a="ok"]', 8);
    await a.press('.proposal-slot [data-a="ok"]', { after: 6 });
    a.mark('saved');
    await a.scroll('.rule-cards', { block: 'start', n: 22, offset: 80 });
    await a.box('cards2', '.rule-cards', 10); await a.box('new1', '.rule-cards li:nth-child(1)', 8); a.mark('top');
    await a.hold(50);
  },
  // 工房ごとに：同じ指輪を、石川工房と工房 B の帳面で（同じ向き・レンダー）
  workshops3: async (a) => {
    const { p } = a;
    await studio(a); await workshopB(a); await renderDisp(a);
    const mainVal = await p.evaluate(() => document.querySelector('.ws-pick option').value);
    await p.selectOption('.ws-pick', mainVal); await a.settle(2000);
    await p.evaluate(() => window.__viewer.setView('angle')); await a.settle(400);
    await p.evaluate(() => { document.querySelector('.studio-refine').scrollTop = 0; });
    await a.box('ring', '.vp', 0); await a.box('bar', '.ws-bar', 8); a.mark('A');
    console.log('workshops3 石川工房', await specsText(p));
    await a.hold(50, { hide: true });
    const bVal = await p.evaluate(() => [...document.querySelectorAll('.ws-pick option')].find((o) => /工房 B/.test(o.textContent))?.value);
    await p.selectOption('.ws-pick', bVal); await a.settle(2000);
    await p.evaluate(() => window.__viewer.setView('angle')); await a.settle(400);
    a.mark('B');
    console.log('workshops3 工房 B', await specsText(p));
    await a.hold(50, { hide: true });
  },
  // 作り方：工程の札（形からその場で）→ ロウ付けの札を開く → 図面
  make3: async (a) => {
    const { p } = a;
    await studio(a); await renderDisp(a);
    await a.hold(4);
    await a.press('.tabs [data-mode="hand"]', { after: 2 });
    await renderDisp(a);
    await a.box('panel', '.build-panel', 0); a.mark('cards');
    await a.hold(14);
    const n = await p.locator('.build-panel .mk-card').count();
    for (let k = 0; k < n; k++) {
      const sel = `.build-panel .mk-card:nth-child(${k + 1})`;
      await a.scroll(sel, { block: 'start', n: 12, offset: 12 });
      await a.box(`card${k}`, sel, 6); a.mark(`card${k}`);
      const title = await p.evaluate((s) => document.querySelector(s + ' h3')?.innerText, sel);
      console.log('make3', k, title);
      if (/ロウ付け|石座を腕に付ける/.test(title || '') && (await p.locator(sel + ' .flow .term').count())) {
        await a.hold(10);
        await a.press(sel + ' .flow .term', { n: 12, after: 4 });
        await a.box(`card${k}open`, sel, 6); a.mark(`open${k}`);
        await a.hold(36);
      } else {
        await a.hold(20);
      }
    }
    a.mark('cardsEnd');
    await a.press('.disp [data-disp="draw"]', { after: 2 });
    a.mark('draw');
    await a.settle(400);
    await a.box('sheet', '.vp', 0);
    await a.hold(40);
  },
  // ほかの技へ：技の一覧（木目金など）→ 木目金 → Claude が職人に聞く → 答える → Claude の案 → 帳面に入る（職人の決まり）
  waza3: async (a) => {
    const { p } = a;
    await p.goto(`${BASE}/app.html?nointro#waza`, { waitUntil: 'load' });
    await a.settle(1500);
    await a.box('list', '#screen-waza .view.waza', 0); a.mark('list');
    await a.hold(20);
    await a.scroll('.big-tech[href="#waza/mokume"]', { block: 'center', n: 26 });
    await a.box('others', '.pub-sec-h + .big-techs', 10); await a.box('mokume', '.big-tech[href="#waza/mokume"]', 8); a.mark('others');
    // 聞く所は「彫る深さ」にしておく（公開の資料の 1/3 と食いちがわない答えにするため。押すのは本物の札）
    await p.evaluate(() => document.querySelector('.big-tech[href="#waza/mokume"]').setAttribute('href', '#waza/mokume?gap=mokume:carve-mm'));
    await a.hold(24);
    await a.press('.big-tech[href^="#waza/mokume"]', { n: 14, after: 2 });
    await a.until(() => { const s = document.querySelector('#screen-waza'); const q = s && s.querySelector('.iv-q'); return q && !q.classList.contains('pending') && /Claude が聞いています/.test(s.innerText); }, null, { label: '木目金の問い', timeout: 120000 });
    await a.settle(300);
    await p.evaluate(() => window.scrollTo(0, 0)); await a.settle(200);
    await a.box('page', '#screen-waza .tech-page', 0); await a.box('ask', '#screen-waza .iv-root', 10); await a.box('q', '#screen-waza .iv-q', 8); a.mark('ask');
    console.log('waza3 の問い', await p.evaluate(() => document.querySelector('#screen-waza .iv-q')?.innerText));
    await a.hold(40);
    await a.box('answer', '#screen-waza .iv-root textarea', 10);
    await a.type('#screen-waza .iv-root textarea', '地金が 3 ミリなら、1 ミリまで。3 分の 1 より深くは彫らない', { each: 2 });
    a.mark('typed');
    await a.hold(6);
    await a.press('#screen-waza .iv-root button.make', { after: 0 });
    a.mark('wait');
    await a.hold(8);
    await a.until(() => /帳面に入れる/.test(document.querySelector('#screen-waza .iv-root .proposal-slot')?.innerText || ''), null, { label: '木目金の決まり', timeout: 180000 });
    await a.settle(200);
    await a.box('draft', '#screen-waza .iv-root .proposal', 10); a.mark('draft');
    console.log('waza3 の案', await p.evaluate(() => document.querySelector('#screen-waza .iv-root .proposal-slot')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(50);
    await a.box('ok', '#screen-waza .iv-root [data-a="ok"]', 8);
    await a.press('#screen-waza .iv-root [data-a="ok"]', { after: 6 });
    a.mark('saved');
    await a.scroll('#screen-waza .tech-rules', { block: 'start', n: 24, offset: 60 });
    await a.box('rules', '#screen-waza .tech-rules', 10); await a.box('rule1', '#screen-waza .tech-rules li:nth-child(1)', 8); a.mark('rules');
    console.log('waza3 帳面', await p.evaluate(() => document.querySelector('#screen-waza .tech-rules li')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(50);
  },
  // 組み立て直す：手がかり → Claude が組み立てる → 手順 → 答え合わせ。答え合わせの中身（どの本当の工程にたどり着いたか）を grade.json に残す（チェックリストの絵に使う）
  rebuild3: async (a) => {
    const { p } = a;
    await p.goto(`${BASE}/app.html?nointro#waza/rebuild`, { waitUntil: 'load' });
    await a.settle(1500);
    await a.box('head', '.view.rebuild .view-head', 10); a.mark('start');
    await a.hold(16);
    await a.press('details.clues > summary', { n: 14, after: 4 });
    await a.box('clues', 'details.clues', 8); a.mark('clues');
    await a.hold(30);
    await a.scroll('details.clues .clue-list li:nth-child(5)', { block: 'center', n: 30 });
    await a.box('clue5', 'details.clues .clue-list li:nth-child(5)', 8);
    await a.hold(20);
    await a.scroll('.actions .go', { block: 'center', n: 20 });
    await a.box('go', '.actions .go', 8);
    await a.press('.actions .go', { after: 2 });
    a.mark('wait');
    await a.box('waiting', '.actions', 30);
    await a.hold(30);
    await a.until(() => !!document.querySelector('.steps-h li'), null, { label: '組み立て', timeout: 300000 });
    await a.settle(400);
    await p.evaluate(() => document.querySelector('.steps-h')?.scrollIntoView({ block: 'start' })); await a.settle(200);
    a.mark('steps');
    for (let k = 1; k <= 4; k++) {
      await a.scroll(`.steps-h li:nth-child(${k})`, { block: 'center', n: 16 });
      await a.box(`step${k}`, `.steps-h li:nth-child(${k})`, 8); a.mark(`step${k}`);
      await a.hold(26);
    }
    if (await p.locator('.actions .check').count()) {
      await a.scroll('.actions', { block: 'center', n: 22 });
      await a.box('check', '.actions .check', 8);
      await a.press('.actions .check', { after: 4 });
      a.mark('checking');
      await a.until(() => !!document.querySelector('.score'), null, { label: '答え合わせ', timeout: 300000 });
      await a.settle(400);
      await p.evaluate(() => document.querySelector('.score')?.scrollIntoView({ block: 'center' })); await a.settle(200);
      await a.box('score', '.score', 12); a.mark('score');
      const grade = await p.evaluate(() => ({
        score: document.querySelector('.score')?.innerText.replace(/\s+/g, ' '),
        steps: [...document.querySelectorAll('.steps-h li')].map((li) => ({ title: li.querySelector('.stitle')?.childNodes[0]?.textContent, verdict: li.querySelector('.verdict')?.className.replace('verdict', '').trim(), label: li.querySelector('.verdict')?.innerText, answer: li.querySelector('.gnote b')?.innerText ?? '', note: li.querySelector('.gnote')?.innerText ?? '', basis: li.classList.contains('prior') ? 'prior' : 'clues' })),
        missed: [...document.querySelectorAll('.missed li')].map((li) => li.querySelector('b')?.innerText),
      }));
      require('fs').writeFileSync(`${OUT}/rebuild3/grade.json`, JSON.stringify(grade, null, 1));
      console.log('rebuild3 答え合わせ', JSON.stringify(grade).slice(0, 1500));
      await a.hold(50);
      await a.scroll('.steps-h li:nth-child(1)', { block: 'center', n: 24 });
      await a.box('verdict1', '.steps-h li:nth-child(1)', 8); a.mark('verdict1');
      await a.hold(40);
    }
  },
  // 誰でも（作者の声：いまもう誰でも使える）：石の写真 → 指輪が組み上がる → 腕の断面を指で描く → 作れます → 見せる。ひと続きの本物の流れ
  anyone3b: async (a) => {
    const { p } = a;
    await p.goto(`${BASE}/studio.html?rec`, { waitUntil: 'load' });
    await a.until(() => { const s = document.querySelector('.intro-stage'); return s && !s.hidden; }, null, { label: '写真', chunk: 33 });
    await a.box('photo', '.intro-frame', 10); a.mark('photo');
    let stage = 'photo';
    for (let k = 0; k < 600; k++) {
      await a.shot({ hide: true });
      const st = await p.evaluate(() => ({ stage: !document.querySelector('.intro-stage').hidden, sheet: !!document.querySelector('.intro-sheet'), disp: document.querySelector('.disp [aria-pressed="true"]')?.dataset.disp, timer: !!document.querySelector('.intro-timer') }));
      if (stage === 'photo' && !st.stage) { stage = 'stone'; a.mark('stone'); }
      if (stage === 'stone' && st.disp === 'render') { stage = 'render'; a.mark('render'); }
      if (stage === 'render' && st.sheet) { stage = 'sheet'; a.mark('sheet'); }
      if (stage === 'sheet' && !st.sheet && !st.timer) { stage = 'done'; a.mark('done'); break; }
    }
    await a.hold(6, { hide: true });
    await a.press('.tabs [data-mode="refine"]', { n: 14, after: 2 });
    await openManual(a); await renderDisp(a);
    await p.evaluate(() => document.querySelector('.sec-edit')?.scrollIntoView({ block: 'center' })); await a.settle(300);
    await a.box('editor', '.sec-edit', 10);
    await a.press('.se-mode[data-mode="draw"]', { n: 12, after: 2 });
    const px = await secMap(p);
    // ゆるやかに平たい、幅の広い腕（厚み 1.5 mm）
    const pts = [];
    for (let k = 0; k <= 30; k++) { const th = Math.PI * (k / 30); pts.push(px(1.7 * Math.cos(th), -0.05 - 1.5 * Math.pow(Math.sin(th), 0.5))); }
    await a.move(pts[0], 8);
    await p.mouse.down(); a.mark('draw');
    for (const q of pts.slice(1)) await a.move(q, 1, { rip: 0.15 });
    await p.mouse.up(); a.mark('drawn');
    await a.box('chip', '.verdict-chip', 8); await a.box('verdict', '.big-verdict', 8);
    console.log('anyone3b', (await probsOf(p)).join(',') || '作れます', await specsText(p));
    await a.hold(36, { turn: 0.003 });
    await a.press('.act-present', { n: 14, after: 0 });
    await a.settle(200);
    await p.evaluate(() => window.__viewer.setView('angle'));
    a.mark('present'); await a.box('ring2', '.vp', 0);
    await a.hold(80, { hide: true });
  },
  // 誰でも：石を選ぶ → 腕の断面を指で描く → 作れます → 見せる（金の指輪）。カーソルの動きをそのまま
  anyone3: async (a) => {
    const { p } = a;
    await studio(a); await renderDisp(a);
    await p.click('.tabs [data-mode="make"]'); await a.settle(600);
    await a.box('presets', '.presets', 8); await a.box('ring', '.vp', 0); a.mark('start');
    await a.hold(10);
    await a.press('.presets button[data-preset="oval"]', { n: 12, after: 2 });
    await a.until(() => !!(window.__studio.session && window.__studio.session.built), null, { label: 'oval' });
    a.mark('stone'); await a.box('chip', '.verdict-chip', 8);
    await a.hold(24, { turn: 0.003 });
    await a.press('.tabs [data-mode="refine"]', { n: 12, after: 2 });
    await openManual(a); await renderDisp(a);
    await p.evaluate(() => document.querySelector('.sec-edit')?.scrollIntoView({ block: 'center' })); await a.settle(300);
    await a.box('editor', '.sec-edit', 10);
    await a.press('.se-mode[data-mode="draw"]', { n: 12, after: 2 });
    const px = await secMap(p);
    // ゆるやかに平たい、幅の広い腕（厚み 1.5 mm）
    const pts = [];
    for (let k = 0; k <= 30; k++) { const th = Math.PI * (k / 30); pts.push(px(1.7 * Math.cos(th), -0.05 - 1.5 * Math.pow(Math.sin(th), 0.5))); }
    await a.move(pts[0], 8);
    await p.mouse.down(); a.mark('draw');
    for (const q of pts.slice(1)) await a.move(q, 1, { rip: 0.15 });
    await p.mouse.up(); a.mark('drawn');
    await a.box('chip2', '.verdict-chip', 8); await a.box('verdict', '.big-verdict', 8);
    console.log('anyone3', (await probsOf(p)).join(',') || '作れます', await specsText(p));
    await a.hold(36, { turn: 0.003 });
    await a.press('.act-present', { n: 14, after: 0 });
    await a.settle(200);
    await p.evaluate(() => window.__viewer.setView('angle'));
    a.mark('present'); await a.box('ring2', '.vp', 0);
    await a.hold(70, { hide: true });
  },
  // スマホの幅で：帳面・技・学ぶ（中身は同じ操作）
  ledger3m: async (a) => CH.ledger3(a),
  waza3m: async (a) => CH.waza3(a),
  learn3m: async (a) => {
    const { p } = a;
    await p.goto(`${BASE}/app.html?nointro#learn`, { waitUntil: 'load' });
    await a.settle(1500);
    await a.box('page', '.view.ask', 0); a.mark('start');
    await a.hold(16);
    await a.box('composer', '.composer', 10);
    await a.type('.composer textarea', 'エメラルドは、ロウ付けの前に外す？', { each: 2 });
    a.mark('typed');
    await a.hold(6);
    await a.press('.composer .send', { after: 6 });
    a.mark('wait');
    await a.until(() => !!document.querySelector('.thread .a-short'), null, { label: '学ぶの答え', timeout: 180000 });
    await a.settle(300);
    await a.box('answer', '.thread', 10); await a.box('short', '.thread .a-short', 10); a.mark('answer');
    console.log('learn3m の答え', await p.evaluate(() => document.querySelector('.thread')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(40);
    if (await p.locator('.thread .why-btn').count()) {
      await a.press('.thread .why-btn', { after: 4 });
      a.mark('why');
      await a.scroll('.thread .a-why', { block: 'center', n: 20 });
      await a.box('why2', '.thread .a-why', 10); a.mark('why2');
      await a.hold(40);
    }
  },

  // ================================================================ 最終案 7（2026-11-05）
  // 見せる（黒の上）：今の既定の三角・K18（長く回す。つかみ・形が変わる・柱の一文）と、丸・Pt900。カメラは 1 つにそろえ、同じ場所で指輪だけ替わる
  hero7: async (a) => {
    const { p } = a;
    await studio(a);
    await p.click('.act-present'); await a.settle(1500);
    await hideClose(p);
    await p.evaluate(() => { window.__viewer.setView('angle'); window.__viewer.keepCamera = true; }); await a.settle(400);
    await p.evaluate(() => window.__viewer.setView('angle')); await a.settle(100);
    // 最初の版（2.3 mm 高い）も枠に入るよう、少しだけ引く（見せるの中でホイールで引くのと同じ）。腕の輪は最初の版と重なる
    const cam0 = await camOf(p);
    const cam = { ...cam0, pos: cam0.pos.map((v, i) => cam0.tgt[i] + (v - cam0.tgt[i]) * 1.12) };
    fs.writeFileSync(`${OUT}/hero7/camera.json`, JSON.stringify(cam));
    console.log('hero7 カメラ', JSON.stringify(cam));
    console.log('hero7 三角', await p.evaluate(() => document.querySelector('.pr-panel')?.innerText.replace(/\s+/g, ' ')));
    await setCam(p, cam);
    a.mark('tri'); await a.box('ring', '.gl', 0);
    // こまごとのカメラを残す（first7 が同じ道を通る。autoRotate は damping で少しずつ速くなるので、角の計算でなく記録を使う）
    const track = [];
    for (let k = 0; k < N(560); k++) { await a.shot({ hide: true }); track.push((await camOf(p)).pos); }
    fs.writeFileSync(`${OUT}/hero7/track.json`, JSON.stringify(track));
    await p.click('.pr-close'); await a.settle(600);
    await p.click('.tabs [data-mode="make"]'); await a.settle(300);
    await p.click('.presets button[data-preset="round"]'); await a.settle(600);
    await a.until(() => !!(window.__studio.session && window.__studio.session.built), null, { label: 'round' });
    await fine(a, 1200);
    await p.click('.act-present'); await a.settle(1200);
    await p.click('.pr-tabs button[data-g="setting"]'); await a.settle(200); await p.click('.pr-opt button[data-v="4"]'); await fine(a);
    await p.click('.pr-tabs button[data-g="metal"]'); await a.settle(200); await p.click('.pr-opt button[data-v="pt900"]'); await fine(a);
    console.log('hero7 丸', await p.evaluate(() => document.querySelector('.pr-panel')?.innerText.replace(/\s+/g, ' ')));
    await setCam(p, cam);
    a.mark('round');
    await a.hold(N(140), { hide: true });
  },
  // 見せる（黒の上）：柱の一文の指輪。同じカメラのまま、回る向きの先の側（輪が開いて、石も見える向き）から
  hero7b: async (a) => {
    const { p } = a;
    const cam = JSON.parse(fs.readFileSync(`${OUT}/hero7/camera.json`, 'utf8'));
    await studio(a);
    await p.click('.act-present'); await a.settle(1500);
    await hideClose(p);
    await p.evaluate(() => { window.__viewer.setView('angle'); window.__viewer.keepCamera = true; }); await a.settle(300);
    const th = 118 * Math.PI / 180;
    const [ox, oy] = [cam.pos[0] - cam.tgt[0], cam.pos[1] - cam.tgt[1]];
    await setCam(p, { pos: [cam.tgt[0] + ox * Math.cos(th) - oy * Math.sin(th), cam.tgt[1] + ox * Math.sin(th) + oy * Math.cos(th), cam.pos[2]], tgt: cam.tgt });
    a.mark('start');
    await a.hold(N(270), { hide: true });
  },
  // 本物の最初の版（7606ee7）：既定の三角。hero7 と同じカメラ・同じ大きさの 3D の所で、地だけ黒に（形はその版のまま）。「作れます」の札や寸法は映さない
  first7: async (a) => {
    const { p } = a;
    const cam = JSON.parse(fs.readFileSync(`${OUT}/hero7/camera.json`, 'utf8'));
    await p.goto(`${FIRST}/index.html?rec&nointro`, { waitUntil: 'load' });
    await a.until(() => !!(window.__studio && window.__studio.session && window.__studio.session.built && window.__viewer), null, { label: '組み上がり', chunk: 50 });
    await a.settle(1500);
    console.log('first7 の数字', await specsText(p), '／', await p.evaluate(() => [...document.querySelectorAll('.dims text')].map((t) => t.textContent).join(' ・ ')), '／ 札', await p.evaluate(() => document.querySelector('.verdict-chip')?.innerText));
    await p.addStyleTag({ content: `.tb,.tools,.insp,.cmd-wrap,.sb,.vp-tl,.verdict-chip,.dims,.gizmo,.toast,.fix-pop{display:none!important}
      .vp{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:50!important;background:#000!important}
      .gl{position:absolute!important;top:0!important;bottom:0!important;left:40vw!important;right:0!important;width:auto!important;height:auto!important}
      html,body{background:#000!important}` });
    await a.settle(800);
    await p.evaluate(() => {
      const v = window.__viewer;
      v.setAutoRotate?.(false); v.setGrid(false);
      v.scene.background = null; v.renderer.setClearColor(0x000000, 1);
      if (v.shadow) v.shadow.plane.visible = false;
      v.dirty = true;
    });
    await p.evaluate(() => { const c = window.__viewer.controls; c.autoRotate = false; c._sphericalDelta?.set(0, 0, 0); c._panOffset?.set(0, 0, 0); });
    await a.settle(300);
    const track = JSON.parse(fs.readFileSync(`${OUT}/hero7/track.json`, 'utf8'));
    a.mark('start');
    for (let k = 0; k < Math.min(track.length, N(200)); k++) {
      await setCam(p, { pos: track[k], tgt: cam.tgt });
      await a.shot({ hide: true });
      if (k === 0) console.log('first7 カメラ', JSON.stringify(await camOf(p)), '／ 見せるの 1 こま目', JSON.stringify(track[0]));
    }
  },
  // 職人の言葉 → Claude の案 → これでいい → これまでの作品（見本 6 つ）を確かめ直す → まとめて直す → 見本 6 つを見せるの黒の上で（Claude は 1 回だけ）
  word7: async (a) => {
    const { p } = a;
    await studio(a); await workshopB(a, '試しの工房');
    // 読み直す：工房の決まり（三角の角）のあとに見本を入れると、すぐ「これまでの作品」の欄が出てしまう（直前の決まりで確かめ直す）。
    // 欄は、これから入れる職人の言葉のあとに出したい。帳面と工房は残る
    await p.reload({ waitUntil: 'load' });
    await a.until(() => !!(window.__studio && window.__studio.session && window.__studio.session.built && window.__viewer), null, { label: '組み上がり', chunk: 50 });
    await a.settle(1200);
    await refine(a); await renderDisp(a);
    await watchLook(p);
    await p.locator('.add-samples').first().scrollIntoViewIfNeeded(); await a.settle(300);
    await p.click('.add-samples'); await a.settle(1500);
    console.log('word7 前の数字', await specsText(p));
    await p.locator('.ar-text').scrollIntoViewIfNeeded(); await a.settle(300);
    await a.box('ring', '.vp', 0); await a.box('panel', '.studio-refine', 0); a.mark('start');
    await a.hold(N(20));
    await a.box('field', '.ar-text', 10); a.mark('type');
    await a.type('.ar-text', process.env.CAP_TEST ? WORD7.slice(0, 4) : WORD7, { each: 2 });
    a.mark('typed');
    await a.hold(N(8));
    await a.box('go', '.ar-go', 8);
    if (process.env.CAP_TEST) await p.evaluate((q) => { window.__propose({ title: '爪の太さ（試し）', text: '試し', reason: '試し', quote: q, param: 'prong.minDiameterMm', value: 0.7 }); }, WORD7);
    else await a.press('.ar-go', { after: 0 });
    a.mark('wait');
    await a.until(() => /これでいい/.test(document.querySelector('.ar-proposal')?.innerText || ''), null, { label: 'Claude の案', timeout: 180000 });
    // 案が欄の下に隠れないように（人がスクロールして見るのと同じ。隠れたままだと押せない）
    await p.evaluate(() => document.querySelector('.ar-proposal')?.scrollIntoView({ block: 'center' })); await a.settle(300);
    await a.box('proposal', '.ar-proposal', 10); a.mark('proposal');
    console.log('word7 の案', await p.evaluate(() => document.querySelector('.ar-proposal')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(N(40));
    await a.box('ok', '.ar-proposal button.ok', 8);
    await a.press('.ar-proposal button.ok', { after: 0 });
    a.mark('applied');
    await a.until(() => /爪の太さ|0\.7/.test(document.querySelector('.rule-flash')?.innerText || ''), null, { label: '決まりが入る', timeout: 20000 });
    await fine(a);
    await a.hold(N(20));
    console.log('word7 後の数字', await specsText(p));
    console.log('word7 決まりの字', await p.evaluate(() => document.querySelector('.rule-flash')?.innerText.replace(/\s+/g, ' ')));
    await a.until(() => !!document.querySelector('.past-check'), null, { label: 'これまでの作品', timeout: 60000 });
    await p.evaluate(() => document.querySelector('.past-check').scrollIntoView({ block: 'start' }));
    await a.settle(500);
    await a.box('past', '.past-check', 10); a.mark('past');
    console.log('word7 これまでの作品', await p.evaluate(() => document.querySelector('.past-check')?.innerText.replace(/\s+/g, ' ')));
    const works0 = await p.evaluate(() => JSON.parse(localStorage.getItem('tsugu.works.v1')).map((w) => ({ title: w.title, design: w.design })));
    const thinBefore = works0.find((w) => /細い爪/.test(w.title));
    await a.hold(N(30));
    await a.press('.past-fix', { after: 0 });
    a.mark('fixed');
    await a.settle(800);
    await p.evaluate(() => document.querySelector('.past-check')?.scrollIntoView({ block: 'start' }));
    await a.settle(300);
    await a.box('past2', '.past-check', 10);
    console.log('word7 直したあと', await p.evaluate(() => document.querySelector('.past-check')?.innerText.replace(/\s+/g, ' ')));
    await a.move({ x: 1560, y: 860 }, 10);
    await a.hold(N(30));
    // ---- 見本 6 つを、見せるの黒の上で（同じ向きから回り始める）
    const works1 = await p.evaluate(() => JSON.parse(localStorage.getItem('tsugu.works.v1')).map((w) => ({ title: w.title, design: w.design, problems: w.problems, revisions: w.revisions })));
    const thinAfter = works1.find((w) => /細い爪/.test(w.title));
    console.log('word7 細い爪の記録', JSON.stringify({ before: thinBefore.design.state.prongMm, after: thinAfter.design.state.prongMm, problems: thinAfter.problems, rev: thinAfter.revisions }));
    await p.click('.act-present'); await a.settle(1200);
    await hideClose(p);
    await p.evaluate(() => window.__viewer.setView('angle')); await a.settle(300);
    const c0 = await camOf(p);
    const dir0 = [c0.pos[0] - c0.tgt[0], c0.pos[1] - c0.tgt[1], c0.pos[2] - c0.tgt[2]];
    const L0 = Math.hypot(...dir0);
    const frameRing = async () => {
      await p.evaluate(() => { const v = window.__viewer; v.keepCamera = false; v.fit(); v.keepCamera = true; });
      await a.settle(100);
      const c = await camOf(p);
      const d = Math.hypot(c.pos[0] - c.tgt[0], c.pos[1] - c.tgt[1], c.pos[2] - c.tgt[2]);
      await setCam(p, { ...c, pos: [c.tgt[0] + dir0[0] / L0 * d, c.tgt[1] + dir0[1] / L0 * d, c.tgt[2] + dir0[2] / L0 * d] });
    };
    const order = ['ふだん使い', 'オーバル', 'ペア', 'マーキス', 'エメラルド'];
    for (let i = 0; i < order.length; i++) {
      const w = works1.find((x) => x.title.includes(order[i]));
      if (!w) console.log('word7 見本がない', order[i], works1.map((x) => x.title).join(' / '));
      await p.evaluate(() => { window.__viewer.keepCamera = false; });
      await showDesign(a, w.design);
      await frameRing();
      a.mark(`s${i}`);
      console.log('word7 見本', w.title, await p.evaluate(() => { const b = window.__studio.session.built; return JSON.stringify({ prong: b.ring.setting.prongs[0]?.diameterMm, probs: b.problems.map((x) => x.check) }); }));
      await a.hold(N(70), { hide: true });
    }
    // 細い爪：確かめる前の絵（印なし）と、赤い絵。同じ向きから
    await p.evaluate(() => { window.__viewer.keepCamera = false; });
    await showDesign(a, thinBefore.design);
    await frameRing();
    const thinCam = await camOf(p);
    console.log('word7 細い爪（直す前）', await p.evaluate(() => { const b = window.__studio.session.built; return JSON.stringify({ prong: b.ring.setting.prongs[0]?.diameterMm, probs: b.problems.map((x) => `${x.check}:${x.current}→${x.required}`), panel: document.querySelector('.pr-panel')?.innerText.replace(/\s+/g, ' ').slice(-120) }); }));
    a.mark('thinRed');
    await a.hold(N(70), { hide: true });
    await setCam(p, thinCam);
    await plainRing(p); await a.settle(100);
    await setCam(p, thinCam);
    a.mark('thinPlain');
    await a.hold(N(70), { hide: true });
    // 細い爪を大きく：石と爪に寄る。直す前（赤の点滅）→ 同じ場所で、直したあと
    await p.evaluate(() => { window.__viewer.keepCamera = true; });
    await showDesign(a, thinBefore.design);
    const seat = await p.evaluate(() => { const r = window.__studio.session.built.ring; const h = r.stone.heights; const lift = r.shank.outerRadiusMm; return [0, 0, r.transform.translateZ + lift + 0.4]; });
    const close = await aimAt(p, seat, dir0, 22);
    const closeCam = await camOf(p);
    console.log('word7 寄る', JSON.stringify(close));
    a.mark('closeRed');
    let cam90 = closeCam;
    for (let k = 0; k < N(100); k++) { await a.shot({ hide: true }); if (k === 89) cam90 = await camOf(p); }
    await showDesign(a, thinAfter.design);
    // 同じ場所で、直した指輪へ：直す前の 90 こま目のカメラから続ける（動画は 90 こま目で切り替える）
    await setCam(p, cam90);
    console.log('word7 細い爪（直したあと）', await p.evaluate(() => { const b = window.__studio.session.built; return JSON.stringify({ prong: b.ring.setting.prongs[0]?.diameterMm, probs: b.problems.map((x) => x.check), panel: document.querySelector('.pr-panel')?.innerText.replace(/\s+/g, ' ').slice(-120) }); }));
    a.mark('closeFixed');
    await a.hold(N(100), { hide: true });
  },
  // 帳面（スマホの幅）：Claude が聞きに来る → 作者の言葉で答える → Claude がまとめる → 帳面に入れる（Claude は問いと案の 2 回）
  ledger7m: async (a) => {
    const { p } = a;
    await p.goto(`${BASE}/app.html?nointro#ledger`, { waitUntil: 'load' });
    await a.until(() => !!document.querySelector('.rule-card, .rule-cards li'), null, { label: '帳面' });
    await a.settle(800);
    await p.evaluate(() => document.querySelector('.iv-card')?.scrollIntoView({ block: 'center' })); await a.settle(400);
    console.log('ledger7m はじめの問い', await p.evaluate(() => document.querySelector('.iv-card .iv-q')?.innerText));
    await a.box('question', '.iv-card', 14); a.mark('question');
    await a.hold(N(24));
    await a.box('write', '.iv-card button.answer', 8);
    await a.press('.iv-card button.answer', { n: 12, after: 2 });
    await a.until(() => { const q = document.querySelector('.iv-q'); return q && !q.classList.contains('pending') && /Claude が聞いています|つながらない/.test(document.body.innerText); }, null, { label: 'Claude の問い', timeout: 120000 });
    await a.settle(300);
    await p.evaluate(() => document.querySelector('.iv-card')?.scrollIntoView({ block: 'start' })); await a.settle(200);
    await a.box('interview', '.iv-card', 12); await a.box('q', '.iv-q', 8); a.mark('asked');
    console.log('ledger7m の問い（Claude）', await p.evaluate(() => document.querySelector('.iv-q')?.innerText));
    console.log('ledger7m 問いのわけ', await p.evaluate(() => document.querySelector('.iv-why')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(N(36));
    await a.box('answer', '.answer-box textarea', 10);
    await a.type('.answer-box textarea', process.env.CAP_TEST ? ANSWER7.slice(0, 3) : ANSWER7, { each: 3 });
    a.mark('typed');
    await a.hold(N(10));
    await a.box('make', '.answer-box button.make', 8);
    await a.press('.answer-box button.make', { after: 0 });
    a.mark('wait');
    await a.hold(N(8));
    await a.until(() => /帳面に入れる/.test(document.querySelector('.proposal-slot')?.innerText || ''), null, { label: 'Claude の決まり', timeout: 180000 });
    await a.settle(200);
    await p.evaluate(() => document.querySelector('.proposal-slot .proposal')?.scrollIntoView({ block: 'center' })); await a.settle(200);
    await a.box('draft', '.proposal-slot .proposal', 10); a.mark('draft');
    console.log('ledger7m の案', await p.evaluate(() => document.querySelector('.proposal-slot')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(N(60));
    await a.box('ok', '.proposal-slot [data-a="ok"]', 8);
    await a.press('.proposal-slot [data-a="ok"]', { after: 6 });
    a.mark('saved');
    await a.hold(N(20));
  },
  // 工房ごとに：同じ指輪を、石川工房と工房 B の帳面で。見せるの黒の上で、石座に寄る（爪の太さの差が見えるように）。A と B は別の区切り
  workshops7: async (a) => {
    const { p } = a;
    await studio(a); await workshopB(a); await renderDisp(a);
    const mainVal = await p.evaluate(() => document.querySelector('.ws-pick option').value);
    const bVal = await p.evaluate(() => [...document.querySelectorAll('.ws-pick option')].find((o) => /工房 B/.test(o.textContent))?.value);
    const shoot = async (val, name, frames) => {
      await p.selectOption('.ws-pick', val); await fine(a, 1200);
      console.log('workshops7', name, await specsText(p));
      await p.click('.act-present'); await a.settle(1200);
      await hideClose(p);
      await p.evaluate(() => { window.__viewer.keepCamera = true; window.__viewer.setView('angle'); }); await a.settle(200);
      const seat = await p.evaluate(() => { const r = window.__studio.session.built.ring; return [0, 0, r.shank.outerRadiusMm + r.shank.innerRadiusMm + 2.2]; });
      await aimAt(p, seat, [0.75, -1.0, 0.62], 38);
      a.mark(name);
      await a.hold(N(frames), { hide: true });
      await p.click('.pr-close'); await a.settle(600);
      await p.evaluate(() => { window.__viewer.keepCamera = false; });
    };
    await shoot(mainVal, 'A', 130);
    await shoot(bVal, 'B', 130);
  },
  // 尖った所：腕の断面を尖らせた指輪に寄る（レンダー・方眼と寸法なし）→ 赤く点滅 → 断面を丸く描き直す（本物の手順）→ 赤が消えて「作れます」
  spike7: async (a) => {
    const { p } = a;
    await studio(a); await refine(a); await openManual(a); await renderDisp(a);
    await p.click('.t-grid'); await p.click('.t-dims'); await a.settle(300);
    await p.evaluate(() => document.querySelector('.sec-edit')?.scrollIntoView({ block: 'center' })); await a.settle(400);
    await p.click('.se-mode[data-mode="draw"]'); await a.settle(200);
    let px = await secMap(p);
    const seg = (P, each = 6) => { const o = []; for (let k = 0; k < P.length - 1; k++) for (let j = 0; j < each; j++) { const u = j / each; o.push(px(P[k][0] + (P[k + 1][0] - P[k][0]) * u, P[k][1] + (P[k + 1][1] - P[k][1]) * u)); } o.push(px(...P[P.length - 1])); return o; };
    const pointed = [[1.1, -0.05], [1.02, -0.55], [0.62, -1.05], [0.1, -1.65], [0.0, -2.05], [-0.1, -1.65], [-0.62, -1.05], [-1.02, -0.55], [-1.1, -0.05]];
    await drawSectionQuiet(a, seg(pointed));
    await fine(a, 800);
    console.log('spike7 尖らせた', await p.evaluate(() => ({ chip: document.querySelector('.verdict-chip')?.innerText, read: document.querySelector('.sec-edit .se-read')?.innerText.replace(/\s+/g, ' '), probs: window.__studio.session.built.problems.map((x) => `${x.check}:${x.current}→${x.required}`) })));
    // 断面の図を、枠（ページの y 40〜694）の中へ
    const svgTop = 398;
    const pin = () => p.evaluate((top) => { const r = document.querySelector('.studio-refine'); const s = document.querySelector('.sec-edit svg')?.getBoundingClientRect(); if (s) r.scrollTop += s.top - top; }, svgTop);
    await pin(); await a.settle(200);
    px = await secMap(p);
    await p.evaluate(() => { window.__viewer.keepCamera = true; });
    const mark = await p.evaluate(() => { const b = window.__studio.session.built; const q = b.problems.find((x) => x.target.kind === 'shank-spot'); const sh = b.ring.shank; return [(q.target.x * sh.sideWidthMm) / sh.widthMm, -(sh.innerRadiusMm + q.target.y), sh.outerRadiusMm]; });
    // 3D の所の真ん中はページの (652, 434)。赤い印を、切り取りの枠の左の真ん中（ページの 1030, 400）へ
    const aim = await aimAt(p, mark, [0.35, -0.85, 0.75], 30, 1030 - 652, 434 - 400);
    console.log('spike7 カメラ', JSON.stringify(aim));
    await a.settle(200);
    await a.box('chip', '.verdict-chip', 8); await a.box('editor', '.sec-edit', 8); await a.box('svg', '.sec-edit svg', 6); a.mark('red');
    await a.hold(N(190), { turn: 0.0008 });
    // 断面を丸く描き直す（カーソルが動く。本物の「自由に描く」）
    const round = []; for (let k = 0; k <= 36; k++) { const th = Math.PI * (k / 36); round.push(px(1.1 * Math.cos(th), -0.05 - 1.6 * Math.pow(Math.sin(th), 0.8))); }
    a.mark('goDraw');
    await a.move(round[0], 14, { turn: 0.0008 });
    await p.mouse.down();
    a.mark('draw');
    for (const q of round.slice(1)) await a.move(q, 1, { rip: 0.15, turn: 0.0008 });
    await p.mouse.up();
    await pin();
    a.mark('drawEnd');
    for (let k = 0; k < 6; k++) { await a.shot({ turn: 0.0008 }); await pin(); }
    await a.until(() => !window.__studio.session.pendingFinal, null, { label: '細かい形', chunk: 50 });
    await pin();
    a.mark('fixed'); await a.box('chip2', '.verdict-chip', 8);
    console.log('spike7 直した', await p.evaluate(() => ({ chip: document.querySelector('.verdict-chip')?.innerText, read: document.querySelector('.sec-edit .se-read')?.innerText.replace(/\s+/g, ' '), probs: window.__studio.session.built.problems.map((x) => x.check) })));
    for (let k = 0; k < N(90); k++) { await a.shot({ turn: 0.0008 }); await pin(); }
  },
  // 作り方の札（スマホの幅。字が大きく、はっきり読める）：03 → ゆっくり → 04 の「職人の決まり」で止める
  make7m: async (a) => {
    const { p } = a;
    await studio(a); await renderDisp(a);
    await p.click('.tabs [data-mode="hand"]'); await a.settle(1000);
    await renderDisp(a);
    console.log('make7m 札', await p.evaluate(() => [...document.querySelectorAll('.build-panel .mk-card h3')].map((h) => h.innerText).join(' / ')));
    const glide = async (sel, n, sub, offset = 0) => {
      const plan = await p.evaluate(({ sel, sub, offset }) => {
        let el = document.querySelector(sel); if (sub) el = el.querySelector(sub) || el;
        let c = el.parentElement;
        while (c && !(c.scrollHeight > c.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(c).overflowY))) c = c.parentElement;
        c = c || document.scrollingElement; window.__scr = c;
        const y = c.scrollTop + el.getBoundingClientRect().top - c.getBoundingClientRect().top - offset;
        return { from: c.scrollTop, to: y };
      }, { sel, sub, offset });
      for (let k = 1; k <= n; k++) {
        const y = plan.from + (plan.to - plan.from) * ease(k / n);
        await p.evaluate((y) => { window.__scr.scrollTop = y; }, y);
        await a.shot({ hide: true });
      }
    };
    const c3 = '.build-panel .mk-card:nth-child(3)';
    const c4 = '.build-panel .mk-card:nth-child(4)';
    await glide(c3, 2, null, 16);
    await a.box('panel', '.build-panel', 0); await a.box('card3', c3, 6); a.mark('card3');
    await a.hold(N(40), { hide: true });
    a.mark('go');
    await glide(c4, N(130), '.rule-in-step', 16);
    await a.box('card4', c4, 6); await a.box('rule', `${c4} .rule-in-step`, 8); a.mark('rule');
    console.log('make7m 職人の決まり', await p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' '), `${c4} .rule-in-step`));
    await a.hold(N(120), { hide: true });
  },
  // ================================================================ 最終案 8（2026-11-05。今の形で撮り直す。最初の版 first7 は撮り直さない）
  // 見せる（黒の上）：今の既定の三角・K18 と、丸 8 mm・Pt900。カメラは hero7 と同じ（first7 と腕の輪が重なる）
  hero8: async (a) => {
    const { p } = a;
    const cam = JSON.parse(fs.readFileSync(`${OUT}/hero7/camera.json`, 'utf8'));
    await studio(a);
    await p.click('.act-present'); await a.settle(1500);
    await hideClose(p);
    await p.evaluate(() => { window.__viewer.setView('angle'); window.__viewer.keepCamera = true; }); await a.settle(400);
    console.log('hero8 三角', await p.evaluate(() => document.querySelector('.pr-panel')?.innerText.replace(/\s+/g, ' ')), '／', await specsText(p), '／', await dimsText(p));
    await setCam(p, cam);
    a.mark('tri'); await a.box('ring', '.gl', 0);
    await a.hold(N(280), { hide: true });
    await p.click('.pr-close'); await a.settle(600);
    await p.click('.tabs [data-mode="make"]'); await a.settle(300);
    await p.click('.presets button[data-preset="round"]'); await a.settle(600);
    await a.until(() => !!(window.__studio.session && window.__studio.session.built), null, { label: 'round' });
    await fine(a, 1200);
    await setStone(a, 8);
    await p.click('.act-present'); await a.settle(1200);
    await p.click('.pr-tabs button[data-g="setting"]'); await a.settle(200); await p.click('.pr-opt button[data-v="4"]'); await fine(a);
    await p.click('.pr-tabs button[data-g="metal"]'); await a.settle(200); await p.click('.pr-opt button[data-v="pt900"]'); await fine(a);
    console.log('hero8 丸', await p.evaluate(() => document.querySelector('.pr-panel')?.innerText.replace(/\s+/g, ' ')), '／', await specsText(p));
    await setCam(p, cam);
    a.mark('round');
    await a.hold(N(140), { hide: true });
  },
  // 見せる（黒の上）：柱の一文の指輪。同じカメラのまま、回る向きの先の側から（hero7b のやり方）
  hero8b: async (a) => {
    const { p } = a;
    const cam = JSON.parse(fs.readFileSync(`${OUT}/hero7/camera.json`, 'utf8'));
    await studio(a);
    await p.click('.act-present'); await a.settle(1500);
    await hideClose(p);
    await p.evaluate(() => { window.__viewer.setView('angle'); window.__viewer.keepCamera = true; }); await a.settle(300);
    const th = 118 * Math.PI / 180;
    const [ox, oy] = [cam.pos[0] - cam.tgt[0], cam.pos[1] - cam.tgt[1]];
    await setCam(p, { pos: [cam.tgt[0] + ox * Math.cos(th) - oy * Math.sin(th), cam.tgt[1] + ox * Math.sin(th) + oy * Math.cos(th), cam.pos[2]], tgt: cam.tgt });
    a.mark('start');
    await a.hold(N(270), { hide: true });
  },
  // 職人の言葉 → Claude の案 → これでいい（Claude は 1 回）。word7 の前半と同じ手順で、言葉だけ替えた。これまでの作品の場面は外した
  word8: async (a) => {
    const { p } = a;
    await studio(a); await workshopB(a, '試しの工房');
    await p.reload({ waitUntil: 'load' });
    await a.until(() => !!(window.__studio && window.__studio.session && window.__studio.session.built && window.__viewer), null, { label: '組み上がり', chunk: 50 });
    await a.settle(1200);
    await refine(a); await renderDisp(a);
    await watchLook(p);
    await p.locator('.add-samples').first().scrollIntoViewIfNeeded(); await a.settle(300);
    await p.click('.add-samples'); await a.settle(1500);
    console.log('word8 前の数字', await specsText(p));
    await p.locator('.ar-text').scrollIntoViewIfNeeded(); await a.settle(300);
    await a.box('ring', '.vp', 0); await a.box('panel', '.studio-refine', 0); a.mark('start');
    await a.hold(N(20));
    await a.box('field', '.ar-text', 10); a.mark('type');
    // 押したあと、カーソルを字の上からよける（職人の言葉が隠れないように）
    await a.press('.ar-text', { n: 12, after: 2 });
    const fb8 = await p.locator('.ar-text').boundingBox();
    await a.move({ x: fb8.x + fb8.width - 10, y: fb8.y + fb8.height + 16 }, 8);
    a.mark('typeGo');
    for (const ch of (process.env.CAP_TEST ? WORD8.slice(0, 4) : WORD8)) { await p.keyboard.insertText(ch); await a.hold(2); }
    a.mark('typed');
    await a.hold(N(8));
    await a.box('go', '.ar-go', 8);
    if (process.env.CAP_TEST) await p.evaluate((q) => { window.__propose({ title: '爪の太さ（試し）', text: '試し', reason: '試し', quote: q, param: 'prong.minDiameterMm', value: 0.7 }); }, WORD8);
    else await a.press('.ar-go', { after: 0 });
    a.mark('wait');
    await a.until(() => /これでいい/.test(document.querySelector('.ar-proposal')?.innerText || ''), null, { label: 'Claude の案', timeout: 180000 });
    // 案が欄の下に隠れないように（既知の不具合。人がスクロールして見るのと同じ）
    await p.evaluate(() => document.querySelector('.ar-proposal')?.scrollIntoView({ block: 'center' })); await a.settle(300);
    await a.box('proposal', '.ar-proposal', 10); a.mark('proposal');
    console.log('word8 の案', await p.evaluate(() => document.querySelector('.ar-proposal')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(N(60));
    await a.box('ok', '.ar-proposal button.ok', 8);
    await a.press('.ar-proposal button.ok', { after: 0 });
    a.mark('applied');
    await a.until(() => /爪の太さ|0\.7/.test(document.querySelector('.rule-flash')?.innerText || ''), null, { label: '決まりが入る', timeout: 20000 });
    await fine(a);
    await a.hold(N(10));
    console.log('word8 後の数字', await specsText(p));
    console.log('word8 決まりの字', await p.evaluate(() => document.querySelector('.rule-flash')?.innerText.replace(/\s+/g, ' ')));
    console.log('word8 帳面の決まり', await p.evaluate(() => { const w = JSON.parse(localStorage.getItem('tsugu.workshops.v1') || '{}'); const l = (w.list || []).find((x) => /試し/.test(x.name)); const r = l?.ledger?.rules?.slice(-1)[0]; return JSON.stringify(r ? { title: r.title, text: r.text, value: r.value, bySize: r.bySize, bySizeLine: r.bySizeLine, quote: r.quote } : null); }));
  },
  // 石の大きさのちがう指輪 3 つ（石川工房の帳面：爪の決まりは石の大きさの線）。同じカメラ・同じ向きから回り始める。大きさのちがいがそのまま見える
  sizes8: async (a) => {
    const { p } = a;
    const cam0 = JSON.parse(fs.readFileSync(`${OUT}/hero7/camera.json`, 'utf8'));
    // 3 つ並べるので引く。上下は石まで入るように、見る所を少し上へ
    const K = 1.2;
    const cam = { ...cam0, pos: cam0.pos.map((v, i) => cam0.tgt[i] + (v - cam0.tgt[i]) * K) };
    await studio(a);
    await p.click('.tabs [data-mode="make"]'); await a.settle(300);
    await p.click('.presets button[data-preset="round"]'); await a.settle(600);
    await a.until(() => !!(window.__studio.session && window.__studio.session.built), null, { label: 'round' });
    await fine(a, 1200);
    for (const [mm, name] of [[6, 'S6'], [8, 'S8'], [10, 'S10']]) {
      await setStone(a, mm);
      console.log('sizes8', mm, await specsText(p), '／', await p.evaluate(() => { const s = window.__studio.session; const b = s.built; return JSON.stringify({ long: s.stone.longMm, width: s.stone.widthMm, prong: b.ring.setting.prongs[0]?.diameterMm, std: b.ring.setting.standardProngMm, n: b.ring.setting.prongs.length, join: b.ring.params?.setting?.join, probs: b.problems.map((x) => x.check) }); }));
      await p.click('.act-present'); await a.settle(1200);
      await hideClose(p);
      await p.evaluate(() => { window.__viewer.keepCamera = true; }); await a.settle(100);
      await setCam(p, cam);
      a.mark(name);
      await a.box('ring', '.gl', 0);
      await a.hold(N(130), { hide: true });
      await p.click('.pr-close'); await a.settle(600);
      await p.evaluate(() => { window.__viewer.keepCamera = false; });
    }
  },
  // Claude が聞きに来る（スマホの幅）：確かめるの画面に質問の札（?rec では出ないので ?rec&ask）→ 答える → 帳面の問い → 作者の言葉で答える → Claude の案 → 帳面に入れる
  ask8m: async (a) => {
    const { p } = a;
    p.on('dialog', (d) => d.accept());  // 帳面の頁は ?rec なしで開くので、確かめの窓が出る（人が OK を押すのと同じ）
    await p.goto(`${BASE}/studio.html?rec&ask&nointro`, { waitUntil: 'load' });
    await a.until(() => !!(window.__studio && window.__studio.session && window.__studio.session.built && window.__viewer), null, { label: '組み上がり', chunk: 50 });
    await a.settle(1200);
    await p.click('.tabs [data-mode="make"]'); await a.settle(300);
    await p.click('.presets button[data-preset="round"]'); await a.settle(600);
    await a.until(() => !!(window.__studio.session && window.__studio.session.built), null, { label: 'round' });
    await fine(a, 1200);
    await refine(a); await renderDisp(a);
    await p.click('.t-grid'); await p.click('.t-dims'); await a.settle(300);
    await p.evaluate(() => { window.__viewer.keepCamera = true; }); await a.settle(100);
    const seat = await p.evaluate(() => { const r = window.__studio.session.built.ring; return [0, 0, r.shank.outerRadiusMm + r.shank.innerRadiusMm + 2.2]; });
    // 石を 3D の所の下の方へ（切り取りの枠に、石と札が入るように）。3D の所の真ん中はページの (240, 215)
    await aimAt(p, seat, [0.75, -1.0, 0.62], 27, 0, 215 - 262);
    await a.settle(200);
    console.log('ask8m 札', await p.evaluate(() => document.querySelector('.ask-nudge')?.innerText.replace(/\s+/g, ' ')), '／', await specsText(p));
    await a.box('nudge', '.ask-nudge', 2); await a.box('btn', '.ask-nudge a.primary', 6); a.mark('card');
    await a.hold(N(60), { turn: 0.0012 });
    a.mark('go');
    const c = await a.move('.ask-nudge a.primary', 16, { turn: 0.0012 });
    await a.shot({ rip: 1 });
    a.mark('press');
    await a.shot({ rip: 0.8 });
    await Promise.all([p.waitForURL(/app\.html/, { timeout: 30000 }), p.mouse.click(c.x, c.y)]);
    console.log('ask8m url', p.url());
    await a.until(() => { const q = document.querySelector('.iv-q'); return q && !q.classList.contains('pending') && /Claude が聞いています|つながらない/.test(document.body.innerText); }, null, { label: 'Claude の問い', timeout: 120000 });
    await a.settle(900);
    await p.evaluate(() => document.querySelector('.iv-card')?.scrollIntoView({ block: 'start' })); await a.settle(200);
    await a.box('interview', '.iv-card', 12); await a.box('q', '.iv-q', 8); a.mark('asked');
    console.log('ask8m の問い（Claude）', await p.evaluate(() => document.querySelector('.iv-q')?.innerText));
    console.log('ask8m 問いのわけ', await p.evaluate(() => document.querySelector('.iv-why')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(N(40));
    await a.box('answer', '.answer-box textarea', 10);
    await a.type('.answer-box textarea', process.env.CAP_TEST ? ANSWER8.slice(0, 3) : ANSWER8, { each: 3 });
    a.mark('typed');
    await a.hold(N(30));
    await a.box('make', '.answer-box button.make', 8);
    await a.press('.answer-box button.make', { after: 0 });
    a.mark('wait');
    await a.hold(N(4));
    await a.until(() => /帳面に入れる/.test(document.querySelector('.proposal-slot')?.innerText || ''), null, { label: 'Claude の決まり', timeout: 180000 });
    await a.settle(200);
    await p.evaluate(() => document.querySelector('.proposal-slot .proposal')?.scrollIntoView({ block: 'center' })); await a.settle(200);
    await a.box('draft', '.proposal-slot .proposal', 10); await a.box('title', '.proposal-slot .iv-rule', 8); await a.box('quote', '.proposal-slot blockquote', 8); a.mark('draft');
    console.log('ask8m の案', await p.evaluate(() => document.querySelector('.proposal-slot')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(N(100));
    await a.box('ok', '.proposal-slot [data-a="ok"]', 8);
    await a.press('.proposal-slot [data-a="ok"]', { after: 6 });
    a.mark('saved');
    await a.hold(N(10));
    console.log('ask8m 帳面の点', await p.evaluate(() => { const l = JSON.parse(localStorage.getItem('tsugu.ledger.v1') || 'null'); const r = l?.rules?.filter((x) => x.param === 'prong.minDiameterMm' && !x.replacedBy).slice(-1)[0]; return JSON.stringify(r ? { title: r.title, text: r.text, bySize: r.bySize, quote: r.quote } : null); }));
  },
  // 工房ごとに：同じ指輪を、石川工房と工房 B の帳面で。石と爪に寄る（爪の太さの差がはっきり見えるように）。A と B は別の区切り。同じカメラ・同じ速さで回る
  workshops8: async (a) => {
    const { p } = a;
    await studio(a); await workshopB(a); await renderDisp(a);
    const mainVal = await p.evaluate(() => document.querySelector('.ws-pick option').value);
    const bVal = await p.evaluate(() => [...document.querySelectorAll('.ws-pick option')].find((o) => /工房 B/.test(o.textContent))?.value);
    const shoot = async (val, name, frames) => {
      await p.selectOption('.ws-pick', val); await fine(a, 1200);
      console.log('workshops8', name, await specsText(p));
      await p.click('.act-present'); await a.settle(1200);
      await hideClose(p);
      await p.evaluate(() => { window.__viewer.keepCamera = true; window.__viewer.setView('angle'); }); await a.settle(200);
      const seat = await p.evaluate(() => { const r = window.__studio.session.built.ring; return [0, 0, r.shank.outerRadiusMm + r.shank.innerRadiusMm + 3.0]; });
      await aimAt(p, seat, [0.55, -1.0, 0.95], 34);
      a.mark(name);
      await a.hold(N(frames), { hide: true });
      await p.click('.pr-close'); await a.settle(600);
      await p.evaluate(() => { window.__viewer.keepCamera = false; });
    };
    await shoot(mainVal, 'A', 130);
    await shoot(bVal, 'B', 130);
  },
  // 作れない所は、赤く光る：爪のつまみで細くする → 爪が赤く光る → 太くする → 消える。腕の尖りは使わない。粗い形のこまは撮らない
  red8: async (a) => {
    const { p } = a;
    await studio(a); await refine(a); await openManual(a); await renderDisp(a);
    await p.click('.t-grid'); await p.click('.t-dims'); await a.settle(300);
    await p.evaluate(() => { window.__viewer.keepCamera = true; }); await a.settle(100);
    const sl = '.slider[data-s="r-prong"]';
    // つまみの行を、枠の決まった高さに留める（問題が出ると上に欄が増えるので、こまごとに合わせる）
    const pin = () => p.evaluate(({ sl, y }) => { const r = document.querySelector('.studio-refine'); const s = document.querySelector(sl)?.getBoundingClientRect(); if (s) r.scrollTop += s.top - y; }, { sl, y: 560 });
    await pin(); await a.settle(200);
    const seat = await p.evaluate(() => { const r = window.__studio.session.built.ring; return [0, 0, r.shank.outerRadiusMm + r.shank.innerRadiusMm + 2.4]; });
    // 3D の所の真ん中はページの (652, 434)。石座を、切り取りの枠 [160, 44, 1100, 700] の真ん中（ページの 710, 394）へ
    await aimAt(p, seat, [0.62, -1.0, 0.78], 21, 58, 40);
    await a.settle(200);
    const thumb = (v) => p.evaluate(({ sl, v }) => { const r = document.querySelector(`${sl} input[type="range"]`); const b = r.getBoundingClientRect(); const u = (v - Number(r.min)) / (Number(r.max) - Number(r.min)); const T = 18; return { x: b.left + T / 2 + u * (b.width - T), y: b.top + b.height / 2 }; }, { sl, v });
    const num = () => p.evaluate((sl) => document.querySelector(`${sl} .sl-num input`)?.value, sl);
    const drag = async (from, to, near, n) => {
      const c0 = await thumb(from); const c1 = await thumb(to);
      await a.move(c0, near, { turn: 0.001 }); await pin();
      await a.shot({ rip: 1, turn: 0.001 });
      await p.mouse.down();
      for (let k = 1; k <= n; k++) {
        const e = ease(k / n);
        await a.move({ x: c0.x + (c1.x - c0.x) * e, y: c0.y }, 1, { rip: 0.5, turn: 0.001 });
      }
      await p.mouse.up();
    };
    // こまの数は、そのまま 1 倍で流して 180 こま（12 拍）になるように決めた：12（はじめ）＋ 29（細くする）＋ 50（赤く光る）＋ 27（太くする）＋ 62（消えた）
    await a.box('slider', sl, 8); await a.box('chip', '.verdict-chip', 8); a.mark('start');
    console.log('red8 はじめ', await specsText(p), await num());
    for (let k = 0; k < N(12); k++) { await a.shot({ turn: 0.001 }); await pin(); }
    a.mark('go');
    await drag(0.8, 0.55, 10, N(18));
    a.mark('up');
    await a.until(() => !window.__studio.session.pendingFinal, null, { label: '細かい形', chunk: 50 });
    await a.settle(100); await pin();
    a.mark('red'); await a.box('chip2', '.verdict-chip', 8); await a.box('slider2', sl, 8);
    console.log('red8 細くした', await specsText(p), await num(), JSON.stringify(await p.evaluate(() => window.__studio.session.built.problems.map((x) => `${x.check}:${x.current}→${x.required}`))), await p.evaluate(() => document.querySelector('.verdict-chip')?.innerText));
    for (let k = 0; k < N(50); k++) { await a.shot({ turn: 0.001 }); await pin(); }
    a.mark('back');
    const v1 = Number(await num());
    // 0.80 mm に戻すと、留まりが 0.998× で「作れない所 1」が残る（標準の太さが 0.8004 mm のため。アプリの小さな不具合。作者に報告）。なので 0.85 mm まで太くする
    await drag(v1, 0.85, 8, N(18));
    a.mark('up2');
    await a.until(() => !window.__studio.session.pendingFinal, null, { label: '細かい形', chunk: 50 });
    await a.settle(100); await pin();
    a.mark('fixed'); await a.box('chip3', '.verdict-chip', 8); await a.box('slider3', sl, 8);
    console.log('red8 太くした', await specsText(p), await num(), JSON.stringify(await p.evaluate(() => window.__studio.session.built.problems.map((x) => `${x.check}:${x.current}→${x.required}`))), await p.evaluate(() => document.querySelector('.verdict-chip')?.innerText));
    for (let k = 0; k < N(90); k++) { await a.shot({ turn: 0.001 }); await pin(); }
  },
  // 完成した指輪（仮。本物の映像 finished.mov が来るまで）：今の既定の三角を、ほぼ真上から。黒と白の地で 1 枚ずつ撮り、foot8.py が紙の上に重ねる（2 枚の差で、指輪の形を切り抜く）
  finished8: async (a) => {
    const { p } = a;
    await studio(a);
    await p.click('.act-present'); await a.settle(1500);
    await p.addStyleTag({ content: '.pr-panel,.pr-close{display:none!important}' });
    const D = [0.5, 0, 1];
    const info = await p.evaluate(({ D }) => {
      const v = window.__viewer; const c = v.camera; const V = c.position.constructor;
      v.keepCamera = true; v.controls.autoRotate = false; v.setGrid?.(false);
      if (v.shadow) v.shadow.plane.visible = false;
      const r = window.__studio.session.built.ring;
      const tgt = new V(0, 0, r.shank.innerRadiusMm + 0.5);
      const dir = new V(D[0], D[1], D[2]).normalize();
      v.controls.target.copy(tgt); c.position.copy(tgt).add(dir.multiplyScalar(90));
      c.up.set(0, 0, 1); c.lookAt(tgt); v.controls.update(); v.dirty = true;
      c.updateMatrixWorld();
      // 石のまん中がこまのどこに来るか（ページの px）
      const q = new V(0, 0, r.shank.outerRadiusMm + r.shank.innerRadiusMm + 3.0).project(c);
      const g = document.querySelector('.gl').getBoundingClientRect();
      const h = g.height; const pxmm = h / (2 * 90 * Math.tan(c.fov * Math.PI / 360));
      return { stone: [g.x + (q.x + 1) / 2 * g.width, g.y + (1 - q.y) / 2 * g.height], pxmm, long: window.__studio.session.stone.longMm };
    }, { D });
    console.log('finished8', JSON.stringify(info), await specsText(p));
    fs.writeFileSync(`${OUT}/finished8/info.json`, JSON.stringify(info));
    const paint = (hex) => p.evaluate((hex) => { const v = window.__viewer; v.scene.background = null; v.renderer.setClearColor(hex, 1); v.dirty = true; }, hex);
    await paint(0x000000); await a.settle(400); a.mark('black'); await a.shot({ hide: true });
    await paint(0xffffff); await a.settle(400); a.mark('white'); await a.shot({ hide: true });
  },
  // 作り方の札（スマホの幅）：04 ロウ付けで閉じる で止める（スクロールしない）→ 流れの文の中の点線の言葉を押すと、すぐ下に開く。職人の決まりの札を読む。
  // 08「下の輪を腕の間に挟んでロウ付けする」は札が長いので、職人の決まりと流れの文の言葉が同じ札にある 04 にした
  make8m: async (a) => {
    const { p } = a;
    await studio(a); await renderDisp(a);
    await p.click('.tabs [data-mode="hand"]'); await a.settle(1000);
    await renderDisp(a);
    const c4 = '.build-panel .mk-card:nth-child(4)';
    console.log('make8m 札', await p.evaluate((s) => document.querySelector(`${s} h3`)?.innerText, c4));
    // 札の頭を、パネルの頭に合わせる（ここまでは撮らない）
    await p.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'start' }), c4); await a.settle(300);
    await a.box('panel', '.build-panel', 0); await a.box('card', c4, 4); await a.box('rule', `${c4} .rule-in-step:not(.pub-in-step)`, 6); await a.box('more', `${c4} .flow .term`, 6);
    await a.box('quote', `${c4} .rule-in-step:not(.pub-in-step) .r-q`, 4); await a.box('text', `${c4} .rule-in-step:not(.pub-in-step) .r-text`, 4);
    console.log('make8m 職人の決まり', await p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' '), `${c4} .rule-in-step:not(.pub-in-step)`));
    a.mark('card');
    await a.hold(N(60), { hide: true });
    a.mark('go');
    await a.move(`${c4} .flow .term`, 20);
    await a.shot({ rip: 1 });
    a.mark('press');
    { const t = await p.locator(`${c4} .flow .term`).first().boundingBox(); await p.mouse.click(t.x + t.width / 2, t.y + t.height / 2); }
    await a.shot({ rip: 0.65 }); await a.shot({ rip: 0.3 });
    await a.settle(50);
    await a.box('lines', `${c4} .term-def`, 6);
    a.mark('open');
    console.log('make8m 言葉', await p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').slice(0, 200), `${c4} .term-def`));
    await a.move({ x: 470, y: 980 }, 14);
    a.mark('away');
    await a.hold(N(200), { hide: true });
  },
  // ================================================================ 最終案 4（2026-11-04 夜）
  // つかみ：公開情報だけの指輪（太く高い）→ 職人の決まりの指輪へ、同じ構図のまま切り替わる（斜め・レンダー）
  hook4: async (a) => {
    const { p } = a;
    await studio(a); await refine(a); await renderDisp(a);
    await p.evaluate(() => window.__viewer.setView('angle')); await a.settle(400);
    await p.click('.compare-btn'); await a.settle(2500);
    a.mark('pub'); await a.box('ring', '.vp', 0);
    console.log('hook4 公開情報だけ', await specsText(p));
    await a.hold(45, { hide: true });
    await p.click('.compare-back'); await a.settle(2500);
    a.mark('craft');
    console.log('hook4 職人の決まり', await specsText(p));
    await a.hold(45, { hide: true });
    await a.hold(60, { turn: 0.004, hide: true });
  },
  // いろいろな指輪（見せる・黒の上）：三石（脇ラウンド・脇ペア）・覆輪・角・地金。どれも同じ向きから回り始める
  multi4: async (a) => {
    const { p } = a;
    await studio(a);
    const trio = async (side) => {
      await refine(a);
      if (!(await p.locator('details.stones-sec[open]').count())) { await p.click('details.stones-sec > summary'); await a.settle(400); }
      await p.click('.stones-sec .pick button[data-sk="並べ方"][data-v="trio"]'); await a.settle(2500);
      await p.click(`.stones-sec .pick button[data-sk="脇の石"][data-v="${side}"]`); await a.settle(2500);
    };
    const manual = async (k, v) => { await refine(a); await openManual(a); await p.click(`.pick button[data-k="${k}"][data-v="${v}"]`).catch(() => console.log('multi4 なし', k, v)); await a.settle(1800); };
    const preset = async (id) => {
      if (await p.locator('.present:not([hidden])').count()) { await p.click('.pr-close'); await a.settle(600); }
      await p.click('.tabs [data-mode="make"]'); await a.settle(300);
      await p.click(`.presets button[data-preset="${id}"]`); await a.settle(600);
      await a.until(() => !!(window.__studio.session && window.__studio.session.built), null, { label: id });
      await a.settle(2000);
    };
    const show = async (name) => {
      await p.click('.act-present'); await a.settle(1500);
      await p.evaluate(() => window.__viewer.setView('angle')); await a.settle(400);
      a.mark(name);
      console.log('multi4', name, await p.evaluate(() => document.querySelector('.pr-panel')?.innerText.replace(/\s+/g, ' ').slice(-160)));
      await a.hold(40, { hide: true });
      await p.click('.pr-close'); await a.settle(800);
    };
    await preset('round'); await trio('round'); await manual('地金', 'pt900'); await show('trioRound');
    await preset('oval'); await trio('pear'); await manual('地金', 'k18yg'); await show('trioPear');
    await preset('emerald'); await manual('留め方', 'bezel'); await manual('腕の断面', 'hirauchi'); await manual('地金', 'pt900'); await show('bezel');
    await preset('marquise'); await manual('腕の断面', 'kaku'); await manual('地金', 'k18yg'); await show('kaku');
    await preset('pear'); await manual('腕の断面', 'hangouman'); await manual('地金', 'k18pg'); await show('pearPink');
    await preset('round'); await manual('爪の本数', '6'); await manual('地金', 'k18wg'); await show('round6');
  },
  // 終わりの指輪（見せる・黒の上）：三角の石・K18。ゆっくり回るのを長く（柱の一文の下に）
  hero4: async (a) => {
    const { p } = a;
    await studio(a);
    await p.click('.act-present'); await a.settle(1500);
    await p.evaluate(() => window.__viewer.setView('angle')); await a.settle(400);
    a.mark('start'); await a.box('ring', '.vp', 0);
    await a.hold(280, { hide: true });
  },
  // 細すぎると、赤く光る（爪だけ。腕はそのまま）→ 押すと、理由と直し方
  red4: async (a) => {
    const { p } = a;
    await studio(a); await refine(a); await openManual(a); await renderDisp(a);
    await p.evaluate(() => window.__viewer.setView('angle')); await a.settle(400);
    await p.locator('.slider[data-s="r-prong"]').scrollIntoViewIfNeeded(); await a.settle(300);
    await a.box('ring', '.vp', 0); await a.box('slider', '.slider[data-s="r-prong"]', 14); a.mark('start');
    await a.hold(16, { turn: 0.002 });
    for (let k = 0; k < 8; k++) {
      const ok = await a.press('.slider[data-s="r-prong"] .sl-step[data-d="-1"]', { n: k ? 4 : 14, after: 3, turn: 0.002 });
      if (!ok) break;
      const pr = await probsOf(p);
      if (pr.includes('prong-thin') && k >= 2) break;
    }
    a.mark('red'); await a.box('chip', '.verdict-chip', 8);
    console.log('red4 の問題', (await probsOf(p)).join(','));
    await a.hold(40, { turn: 0.002 });
    await a.press('.verdict-chip', { n: 16, after: 2 });
    await a.box('pop', '.fix-pop', 10); a.mark('pop');
    console.log('red4 の札', await p.evaluate(() => document.querySelector('.fix-pop')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(50);
  },
  // 学ぶ（スマホの幅）：エメラルドは超音波で洗っていい？（帳面の資料の決まりから）
  learn4m: async (a) => {
    const { p } = a;
    await p.goto(`${BASE}/app.html?nointro#learn`, { waitUntil: 'load' });
    await a.settle(1500);
    await a.box('page', '.view.ask', 0); a.mark('start');
    await a.hold(16);
    await a.box('composer', '.composer', 10);
    await a.type('.composer textarea', 'エメラルドの指輪、超音波洗浄機で洗っていい？', { each: 2 });
    a.mark('typed');
    await a.hold(6);
    await a.press('.composer .send', { after: 6 });
    a.mark('wait');
    await a.until(() => !!document.querySelector('.thread .a-short'), null, { label: '学ぶの答え', timeout: 180000 });
    await a.settle(300);
    await a.box('answer', '.thread', 10); await a.box('short', '.thread .a-short', 10); a.mark('answer');
    console.log('learn4m の答え', await p.evaluate(() => document.querySelector('.thread')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(40);
    if (await p.locator('.thread .why-btn').count()) {
      await a.press('.thread .why-btn', { after: 4 });
      a.mark('why');
      await a.scroll('.thread .a-why', { block: 'center', n: 20 });
      await a.box('why2', '.thread .a-why', 10); a.mark('why2');
      await a.hold(40);
    }
  },
  // 同じ決まりで（設計の画面）：一粒・三石（脇ラウンド）・三石（脇ペア）・覆輪・断面がちがっても「作れます」
  same4: async (a) => {
    const { p } = a;
    await studio(a); await refine(a); await openManual(a); await renderDisp(a);
    const preset = async (id) => {
      await p.click('.tabs [data-mode="make"]'); await a.settle(300);
      await p.click(`.presets button[data-preset="${id}"]`); await a.settle(600);
      await a.until(() => !!(window.__studio.session && window.__studio.session.built), null, { label: id });
      await a.settle(1500);
      await refine(a); await openManual(a); await renderDisp(a);
    };
    const trio = async (side) => {
      if (!(await p.locator('details.stones-sec[open]').count())) { await p.click('details.stones-sec > summary'); await a.settle(400); }
      await p.click('.stones-sec .pick button[data-sk="並べ方"][data-v="trio"]'); await a.settle(2500);
      await p.click(`.stones-sec .pick button[data-sk="脇の石"][data-v="${side}"]`); await a.settle(2500);
    };
    const pick = async (k, v) => { await p.click(`.pick button[data-k="${k}"][data-v="${v}"]`).catch(() => console.log('same4 なし', k, v)); await a.settle(1500); };
    const shoot = async (name) => {
      await p.evaluate(() => window.__viewer.setView('angle')); await a.settle(400);
      await p.evaluate(() => { const r = document.querySelector('.studio-refine'); if (r) r.scrollTop = 0; }); await a.settle(300);
      a.mark(name); await a.box(`chip_${name}`, '.verdict-chip', 8);
      console.log('same4', name, (await probsOf(p)).join(',') || '作れます', await specsText(p));
      await a.hold(45, { turn: 0.004, hide: true });
    };
    await preset('round'); await pick('腕の断面', 'kouman'); await shoot('round');
    await trio('round'); await shoot('trioRound');
    await preset('oval'); await trio('pear'); await pick('腕の断面', 'hirauchi'); await shoot('trioPear');
    await preset('emerald'); await pick('留め方', 'bezel'); await pick('腕の断面', 'hangouman'); await shoot('bezel');
    await preset('marquise'); await pick('腕の断面', 'kaku'); await shoot('marquise');
  },
  // Claude が聞きに来る：帳面 → Claude から質問 → 答える → 打つ → 案 → 帳面に入れる
  ask: async (a) => {
    const { p } = a;
    await p.goto(`${BASE}/app.html?nointro#ledger`, { waitUntil: 'load' });
    await a.until(() => !!document.querySelector('.rule-card, .rule-cards li'), null, { label: '帳面' });
    await a.settle(800);
    await a.box('cards', '.rule-cards', 10); a.mark('ledger');
    await a.hold(20);
    await a.scroll('.iv-card', { block: 'center', n: 18 });
    await a.box('question', '.iv-card', 14); a.mark('question');
    console.log('ask の質問', await p.evaluate(() => document.querySelector('.iv-card')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(26);
    await a.press('.iv-card .answer', { after: 2 });
    await a.until(() => { const q = document.querySelector('.iv-q'); return q && !q.classList.contains('pending') && /Claude が聞いています/.test(document.body.innerText); }, null, { label: 'Claude の問い', timeout: 120000 });
    await a.settle(300);
    await p.evaluate(() => document.querySelector('.iv-card')?.scrollIntoView({ block: 'start' })); await a.settle(200);
    await a.box('interview', '.iv-card', 12); a.mark('asked');
    console.log('ask の問い（Claude）', await p.evaluate(() => document.querySelector('.iv-q')?.innerText));
    await a.hold(30);
    await a.box('answer', '.answer-box textarea', 10);
    await a.type('.answer-box textarea', '5.5 ミリくらいの石なら、0.65 ミリはほしい', { each: 2 });
    await a.hold(6);
    await a.press('.answer-box button.make', { after: 0 });
    a.mark('wait');
    await a.hold(8);
    await a.until(() => /帳面に入れる/.test(document.querySelector('.proposal-slot')?.innerText || ''), null, { label: 'Claude の決まり', timeout: 180000 });
    await a.settle(200);
    await a.box('draft', '.proposal-slot .proposal', 10); a.mark('draft');
    console.log('ask の案', await p.evaluate(() => document.querySelector('.proposal-slot')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(40);
    await a.press('.proposal-slot [data-a="ok"]', { after: 6 });
    a.mark('saved');
    await a.scroll('.rule-cards', { block: 'start', n: 20, offset: 80 });
    await a.box('cards2', '.rule-cards', 10);
    await a.hold(40);
  },
  // 工房ごとに：同じ指輪を、工房 A（職人の決まり）と工房 B（公開情報だけ）で。帳面ごとに比べる表
  workshops: async (a) => {
    const { p } = a;
    await studio(a); await workshopB(a);
    // 工房 A に戻してから撮る
    const mainVal = await p.evaluate(() => document.querySelector('.ws-pick option').value);
    await p.selectOption('.ws-pick', mainVal); await a.settle(2000);
    await p.evaluate(() => { document.querySelector('.studio-refine').scrollTop = 0; });
    await a.box('ring', '.vp', 0); await a.box('bar', '.ws-bar', 8); a.mark('A');
    console.log('工房 A', await specsText(p));
    await a.hold(30);
    const bVal = await p.evaluate(() => [...document.querySelectorAll('.ws-pick option')].find((o) => /工房 B/.test(o.textContent))?.value);
    await a.move('.ws-pick', 14); await a.shot({ rip: 1 });
    await p.selectOption('.ws-pick', bVal); await a.shot({ rip: 0.6 }); await a.shot({ rip: 0.3 });
    a.mark('B');
    console.log('工房 B', await specsText(p));
    await a.hold(30);
    await a.press('.ws-cmp', { after: 4 });
    await a.box('table', '.ws-table', 8); a.mark('table');
    console.log('帳面ごと', await p.evaluate(() => document.querySelector('.ws-table')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(45);
  },
  // 作り方：工程の札 → 詳しく → 言葉を押すと意味 → 図面
  make: async (a) => {
    const { p } = a;
    await studio(a);
    await a.hold(4);
    await a.press('.tabs [data-mode="hand"]', { after: 2 });
    await a.box('cards', '.build-panel', 0); a.mark('cards');
    await a.hold(16);
    await a.press('.build-panel .method button[data-m="cast"]', { n: 12, after: 2 }); a.mark('cast');
    await a.hold(18);
    await a.press('.build-panel .method button[data-m="hand"]', { n: 8, after: 2 }); a.mark('hand');
    await a.hold(10);
    const det = await p.evaluate(() => { const d = [...document.querySelectorAll('.build-panel details.more > summary')]; return d.length; });
    if (det) {
      await a.scroll('.build-panel details.more', { block: 'center', n: 14 });
      await a.press('.build-panel details.more > summary', { after: 4 });
      a.mark('more');
      await a.hold(16);
      if (await p.locator('.build-panel details.more[open] .term').count()) {
        await a.press('.build-panel details.more[open] .term', { after: 4 });
        a.mark('term');
        await a.hold(26);
      }
    }
    await a.scroll('.build-panel .p-instr', { block: 'center', n: 22 });
    a.mark('scrolled');
    await a.hold(10);
    await a.press('.disp [data-disp="draw"]', { after: 2 });
    a.mark('draw');
    await a.settle(300);
    await a.box('sheet', '.vp', 0);
    await a.hold(50);
  },
  // 学ぶ：次の人が、職人の決まりに聞く
  learn: async (a) => {
    const { p } = a;
    await p.goto(`${BASE}/app.html?nointro#learn`, { waitUntil: 'load' });
    await a.settle(1500);
    await a.box('page', '.view.ask', 0); a.mark('start');
    await a.hold(16);
    await a.box('composer', '.composer', 10);
    await a.type('.composer textarea', '三角の石は、爪 3 本で大丈夫ですか？', { each: 2 });
    await a.hold(6);
    await a.press('.composer .send', { after: 6 });
    a.mark('wait');
    await a.until(() => !!document.querySelector('.thread .a-short'), null, { label: '学ぶの答え', timeout: 180000 });
    await a.settle(300);
    await a.box('answer', '.thread', 10); a.mark('answer');
    console.log('学ぶの答え', await p.evaluate(() => document.querySelector('.thread')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(30);
    if (await p.locator('.thread .why-btn').count()) {
      await a.press('.thread .why-btn', { after: 4 });
      a.mark('why');
      await a.box('why', '.thread .a-why', 10);
      await a.hold(40);
    }
  },
  // 魚々子：Claude が「打つ位置のずれ」を聞く → 職人が答える → 決まり → ずれた粒だけが赤くなる。荒らし（重ねる）にも
  nanako: async (a) => {
    const { p } = a;
    await p.goto(`${BASE}/app.html?nointro#waza/nanako?gap=nanako:strike.maxOffsetMm`, { waitUntil: 'load' });
    await a.settle(1200);
    await p.evaluate(() => { window.scrollTo(0, 0); });
    await a.settle(300);
    await a.box('svg', '.nk-svg', 8); await a.box('preview', '.nk-preview', 8); a.mark('start');
    await a.hold(14);
    const drag = async (key, to, frames = 24) => {
      const r = await p.evaluate((key) => { const i = document.querySelector(`.nk-ctrl input[data-k="${key}"]`); const b = i.getBoundingClientRect(); return { x: b.x, y: b.y + b.height / 2, w: b.width, min: +i.min, max: +i.max, v: +i.value }; }, key);
      const xOf = (v) => r.x + 8 + ((v - r.min) / (r.max - r.min)) * (r.w - 16);
      await a.move({ x: xOf(r.v), y: r.y }, 12);
      await p.mouse.down();
      for (let k = 1; k <= frames; k++) { const v = r.v + (to - r.v) * ease(k / frames); await a.move({ x: xOf(v), y: r.y }, 1, { rip: 0.15 }); }
      await p.mouse.up();
    };
    await drag('rows', 10, 16); a.mark('rows');
    await a.hold(8);
    // Claude の質問（打つ位置のずれ）
    await a.until(() => { const q = document.querySelector('.iv-root .iv-q'); return q && !q.classList.contains('pending'); }, null, { label: '魚々子の問い', timeout: 120000 });
    await a.scroll('.iv-root', { block: 'start', n: 20, offset: 40 });
    await a.box('ask', '.iv-root', 10); a.mark('ask');
    console.log('魚々子の質問', await p.evaluate(() => document.querySelector('.iv-root .iv-q')?.innerText));
    await a.hold(30);
    await a.type('.iv-root textarea', 'はい。0.1 ミリまで。それよりずれると、後の粒がそろわない', { each: 2 });
    await a.hold(4);
    await a.press('.iv-root button.make', { after: 0 });
    a.mark('wait');
    await a.hold(6);
    await a.until(() => /帳面に入れる/.test(document.querySelector('.iv-root .proposal-slot')?.innerText || ''), null, { label: '魚々子の決まり', timeout: 180000 });
    await a.settle(200);
    await a.box('draft', '.iv-root .proposal', 10); a.mark('draft');
    console.log('魚々子の案', await p.evaluate(() => document.querySelector('.iv-root .proposal-slot')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(30);
    await a.press('.iv-root [data-a="ok"]', { after: 4 });
    a.mark('saved');
    await a.scroll('.nk-preview', { block: 'start', n: 22, offset: 20 });
    await a.box('svg2', '.nk-svg', 8); await a.box('preview2', '.nk-preview', 8);
    await a.hold(6);
    await drag('offsetMm', 0.22, 36); a.mark('offset');
    await a.box('verdict', '.nk-verdict', 8);
    console.log('魚々子', await p.evaluate(() => document.querySelector('.nk-verdict')?.innerText));
    await a.hold(30);
    await a.press('.nk-layout button[data-layout="arashi"]', { after: 2 }); a.mark('arashi');
    await a.hold(26);
  },
  // 組み立て直す：手がかりだけから、Claude が作り方を組み立てる → 答え合わせ
  rebuild: async (a) => {
    const { p } = a;
    await p.goto(`${BASE}/app.html?nointro#waza/rebuild`, { waitUntil: 'load' });
    await a.settle(1500);
    await a.box('page', '.view', 0); a.mark('start');
    await a.hold(16);
    await a.press('.actions .go', { after: 4 });
    a.mark('wait');
    await a.until(() => !!document.querySelector('.steps-h li'), null, { label: '組み立て', timeout: 300000 });
    await a.settle(400);
    await a.box('steps', '.steps-h', 10); a.mark('steps');
    console.log('組み立て直す', await p.evaluate(() => document.querySelector('.steps-h')?.innerText.slice(0, 300).replace(/\s+/g, ' ')));
    await a.hold(20);
    await a.scroll('.steps-h li:nth-child(3)', { block: 'center', n: 30 });
    await a.hold(10);
    if (await p.locator('.actions .check').count()) {
      await a.scroll('.actions', { block: 'center', n: 24 });
      await a.press('.actions .check', { after: 4 });
      a.mark('check');
      await a.until(() => !!document.querySelector('.score'), null, { label: '答え合わせ', timeout: 300000 });
      await a.settle(400);
      await p.evaluate(() => document.querySelector('.score')?.scrollIntoView({ block: 'center' }));
      await a.box('score', '.score', 12); a.mark('score');
      console.log('答え合わせ', await p.evaluate(() => document.querySelector('.score')?.innerText.replace(/\s+/g, ' ')));
      await a.hold(30);
      await a.scroll('.steps-h li:nth-child(2)', { block: 'center', n: 26 });
      await a.hold(30);
    }
  },
};

// ================================================================ 最終案 9（2026-11-06）。設計は video/PLAN-final9.md。
// 指輪は今の描き方（レンダー・見せると同じ。?rec で細かい映り込み）。画面は今の見た目（?rec なし）で撮る。Claude の返事は _claude9 に覚える。
const FLAT9 = { section: 'hirauchi', width_mm: 2.0, thickness_mm: 1.4, reason: '撮る' };
const STAGE_CSS9 = `.tb,.tools,.insp,.cmd-wrap,.sb,.vp-tl,.verdict-chip,.dims,.gizmo,.toast,.fix-pop,.ask-nudge,.stage-note,.stone-tags,.gen-swap,.present{display:none!important}
  .pro{display:block!important} .vp{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;background:#000!important} html,body{background:#000!important}`;
const WHOLE9 = { x: 0.66, y: -0.62, z: 0.34 };
const MACRO9 = { x: 0.62, y: -0.5, z: 0.5 };
/** 黒の舞台：画面の部品を消して、3D を全画面に（見せると同じ描き方）。撮らない */
const stage9 = async (a) => {
  const { p } = a;
  await p.goto(`${BASE}/studio.html?nointro&rec`, { waitUntil: 'load' });
  await a.until(() => !!(window.__studio && window.__studio.session && window.__studio.session.built && window.__viewer), null, { label: '組み上がり', chunk: 50 });
  await a.settle(1000);
  await p.addStyleTag({ content: STAGE_CSS9 });
  await p.evaluate(() => {
    const v = window.__viewer;
    window.__studio.setMode('refine');
    v.setDisplayMode('render'); v.setPresenting(true);
    document.querySelector('.t-dims')?.click(); document.querySelector('.t-grid')?.click();
    v.setAutoRotate(false); v.keepCamera = true;
    dispatchEvent(new Event('resize'));
  });
  await new Promise((r) => setTimeout(r, 1500));
  await a.settle(1000);
  await watchLook(p);
};
/** 向き・寄り・高さ（scripts/lp-shots.cjs の look と同じ。v.fit で全体を入れてから寄る） */
const look9 = async (a, dir, zoom = 1, at = null, up = 0) => {
  await a.p.evaluate(([d, z, at_, up_]) => {
    const v = window.__viewer;
    v.setAutoRotate(false);
    v.camera.position.copy(v.controls.target).add(d);
    v.fit();
    const c = v.camera, t = v.controls.target;
    if (at_ !== null) { const dz = at_ - t.z; t.z += dz; c.position.z += dz; }
    c.position.sub(t).multiplyScalar(z).add(t);
    if (up_) { t.z += up_; c.position.z += up_; }
    v.controls.update(); v.dirty = true;
  }, [dir, zoom, at, up]);
  await a.settle(600);
};
const topZ9 = (p) => p.evaluate(() => { const v = window.__viewer; let top = -Infinity; v.content.traverse((o) => { if (!o.isMesh || !o.geometry) return; o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); top = Math.max(top, bb.max.z); }); return top - 2.2; });
const camNow9 = (p) => p.evaluate(() => { const v = window.__viewer; return { pos: v.camera.position.toArray(), tgt: v.controls.target.toArray() }; });
const TURN9 = 0.0016; // 1 こまに回す角（ラジアン）。1 秒に約 2.7 度
/** 今の指輪の数字をログに残す（字に書く数字は、ここで読む） */
const numbers9 = (p, label) => p.evaluate(() => { const b = window.__studio.session.built; const r = b.ring; return JSON.stringify({ prong: r.setting.prongs?.[0]?.diameterMm, n: r.setting.prongs?.length, tip: r.setting.prongs?.[0]?.tip, gap: r.culetGapMm, probs: b.problems.map((x) => `${x.check} ${x.current} → ${x.required}`) }); }).then((j) => console.log(label, j));

/** 動かない画面を 1 枚ずつ撮る（時計は本物のまま）。chapter と同じ形で残す：0000.jpg …、meta.json の marks に名前 */
async function stills9(name, [VW, VH], K, fn) {
  const D = `${OUT}/${name}.new/`;
  fs.rmSync(D, { recursive: true, force: true });
  fs.mkdirSync(D, { recursive: true });
  const b = await chromium.launch({ args: GPU });
  const ctx = await b.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: K });
  const p = await ctx.newPage();
  p.setDefaultTimeout(60000);
  p.on('pageerror', (e) => console.log(name, 'pageerror', e.message));
  p.on('dialog', (d) => d.accept());
  await p.route('**/api/claude', (r) => { console.log(name, 'Claude は呼ばない'); return r.abort(); });
  let i = 0;
  const marks = {}, boxes = {};
  const s = {
    p,
    shot: async (mark, opt = {}) => { marks[mark] = i; await p.screenshot({ path: `${D}${String(i).padStart(4, '0')}.png`, ...opt }); i++; },
    box: async (k, sel, pad = 8) => { const bx = await p.locator(sel).first().boundingBox().catch(() => null); if (bx) boxes[k] = { x: bx.x - pad, y: bx.y - pad, w: bx.width + pad * 2, h: bx.height + pad * 2 }; else console.log(name, '枠が見つからない', sel); return bx; },
    wait: (ms) => p.waitForTimeout(ms),
    hideFixed: () => p.evaluate(() => document.querySelectorAll('body *').forEach((e) => { if (getComputedStyle(e).position === 'fixed') e.style.display = 'none'; })),
  };
  try { await fn(s); } catch (e) { console.log(name, 'しくじり', e.message.split('\n')[0]); }
  fs.writeFileSync(`${D}meta.json`, JSON.stringify({ frames: i, marks, boxes, size: [VW * K, VH * K] }));
  await b.close();
  execFileSync(PY, ['-I', path.join(__dirname, 'tojpg.py'), D], { stdio: 'inherit' });
  fs.rmSync(`${OUT}/${name}/`, { recursive: true, force: true });
  fs.renameSync(D, `${OUT}/${name}/`);
  console.log(name, i, '枚', JSON.stringify(marks));
}

Object.assign(CH, {
  // 平打ち 2.0 × 1.4 mm の指輪。全体（結の場面）と、石に寄った絵
  ring9: async (a) => {
    const { p } = a;
    await stage9(a);
    await p.evaluate((f) => window.__studio.session.setShank(f), FLAT9);
    await fine(a, 600);
    await numbers9(p, 'ring9');
    console.log('ring9', await specsText(p));
    await look9(a, WHOLE9, 1.0);
    a.mark('whole');
    await a.hold(N(210), { turn: TURN9, hide: true });
    await look9(a, MACRO9, 0.42, await topZ9(p));
    a.mark('macro');
    await a.hold(N(210), { turn: TURN9, hide: true });
  },
  // 最初の版（7606ee7）と今の版。どちらも甲丸。形は本物の最初の版から取り出した物（capture/first9-dump.cjs）を、今の描き方で描く。同じカメラ・同じ回り方
  first9: async (a) => {
    const { p } = a;
    await stage9(a);
    await p.evaluate(() => window.__studio.session.build('撮る'));
    await fine(a, 600);
    await numbers9(p, 'first9 今');
    console.log('first9 今', await specsText(p));
    const CAM = async () => {
      await look9(a, { x: 0.55, y: -0.8, z: 0.5 }, 0.66, await topZ9(p) - 2.6);
      return camNow9(p);
    };
    const cam = await CAM();
    const geom = fs.readFileSync(`${OUT}/first9_geom.json`, 'utf8');
    console.log('first9 最初', JSON.parse(geom).specs);
    await p.evaluate((g0) => {
      const g = JSON.parse(g0);
      const f32 = (s) => { if (!s) return undefined; const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Float32Array(u.buffer); };
      window.__first = { stone: { heights: g.heights }, setting: { prongs: [] }, shank: { ...g.shank, positions: f32(g.shankPositions) }, transform: g.transform, metal: 'k18y', ringPositions: { stone: f32(g.stone), setting: f32(g.setting), shank: f32(g.shankPositions), settingNormals: f32(g.settingNormals) } };
      window.__viewer.setRing(window.__first, { ...window.__lastLook, shade: 'k18y' }, []);
      window.__viewer.dirty = true;
    }, geom);
    await a.settle(800);
    await setCam(p, cam);
    a.mark('first');
    await a.hold(N(190), { turn: TURN9, hide: true });
    await p.evaluate(() => window.__viewer.setRing(window.__studio.session.built.ring, window.__lastLook, []));
    await a.settle(800);
    await setCam(p, cam);
    a.mark('now');
    await a.hold(N(330), { turn: TURN9, hide: true });
  },
  // 工房ごと：同じ石、平打ち。石川工房の帳面（丸い爪）と、見本の工房 B（尖り爪）
  book9: async (a) => {
    const { p } = a;
    await stage9(a);
    await p.evaluate((f) => window.__studio.session.setShank(f), FLAT9);
    await fine(a, 600);
    await numbers9(p, 'book9 A');
    console.log('book9 A', await specsText(p));
    // 爪の太さと先の形の違いが見えるように、石座に寄る
    await look9(a, { x: 0.62, y: -0.58, z: 0.42 }, 0.40, await topZ9(p) + 0.1);
    const cam = await camNow9(p);
    a.mark('A');
    await a.hold(N(170), { turn: TURN9, hide: true });
    await p.addStyleTag({ content: '.insp{display:block!important;position:fixed!important;left:-9999px!important}' });
    await p.evaluate(() => { const s = document.querySelector('.ws-pick'); s.value = '__sample'; s.dispatchEvent(new Event('change')); });
    await fine(a, 1500);
    await p.evaluate((f) => { const v = window.__viewer; window.__studio.session.setShank(f); v.setDisplayMode('render'); v.setPresenting(true); }, FLAT9);
    await fine(a, 1500);
    await numbers9(p, 'book9 B');
    console.log('book9 B', await specsText(p));
    await setCam(p, cam);
    a.mark('B');
    await a.hold(N(170), { turn: TURN9, hide: true });
  },
  // 本物のテンションの指輪の映像が来るまでの絵：同じ三角の石・丸線 4 mm・シルバー
  tension9: async (a) => {
    const { p } = a;
    await stage9(a);
    await p.evaluate(() => { const s = window.__studio.session; s.setSetting({ style: 'tension', reason: '撮る' }); s.setShank({ metal: 'sv925', reason: '撮る' }); });
    await fine(a, 1500);
    await numbers9(p, 'tension9');
    console.log('tension9', await specsText(p));
    await look9(a, { x: 0.66, y: -0.62, z: 0.42 }, 0.86);
    a.mark('whole');
    await a.hold(N(170), { turn: TURN9, hide: true });
  },
});

// ---- 最終案 9：本物の画面（今の見た目）
/** 設計の今の画面。見せたい所だけ残す。stage=true で背景を黒に（見せると同じ映り込み） */
const CHROME9 = `.tb,.tools,.sb,.vp-tl,.gizmo,.toast,.stage-note,.undo-redo{display:none!important}
  .pro{grid-template-rows:0 1fr auto 0!important;grid-template-columns:0 1fr 340px!important;background:#101012!important} .act-why{display:none}`;
const studioNow9 = async (a, { intro = false } = {}) => {
  const { p } = a;
  p.on('dialog', (d) => d.accept());
  if (!intro) await p.addInitScript(() => { try { sessionStorage.setItem('tsugu.studio.introSeen.v1', '1'); localStorage.setItem('tsugu.studio.introSeen.v1', '1'); } catch {} });
  await p.goto(`${BASE}/studio.html`, { waitUntil: 'load' });
};
const builtNow9 = async (a) => {
  const { p } = a;
  await a.until(() => !!(window.__studio && window.__studio.session && window.__studio.session.built), null, { label: '組み上がり', chunk: 50 });
  await a.settle(1200);
  await p.evaluate(() => { window.__viewer = window.__studio.viewer; });
};
/** 方眼と寸法を消して、レンダーの黒い地に */
const blackVp9 = async (a) => {
  const { p } = a;
  await p.evaluate(() => {
    const v = window.__viewer;
    document.querySelector('.t-dims[aria-pressed="true"]')?.click(); document.querySelector('.t-grid[aria-pressed="true"]')?.click();
    v.setDisplayMode('render'); v.setPresenting(true); v.setAutoRotate(false); v.keepCamera = true;
  });
  await p.addStyleTag({ content: '.dims,.stone-tags{display:none!important} .vp{background:#000!important}' });
  await a.settle(500);
};
Object.assign(CH, {
  // 写真 → 輪郭 → 指輪が組み上がる（はじめて開いたときの見せ場）→ よくある形を押す
  photo9: async (a) => {
    const { p } = a;
    await studioNow9(a, { intro: true });
    await p.addStyleTag({ content: CHROME9 });
    await a.until(() => { const s = document.querySelector('.intro-stage'); return s && !s.hidden; }, null, { label: '写真', chunk: 33 });
    await p.evaluate(() => { window.__viewer = window.__studio.viewer; });
    await a.box('photo', '.intro-frame', 10); a.mark('photo');
    let stage = 'photo';
    for (let k = 0; k < N(420); k++) {
      await a.shot({ hide: true });
      const st = await p.evaluate(() => ({ stage: !document.querySelector('.intro-stage').hidden, sheet: !!document.querySelector('.intro-sheet'), disp: document.querySelector('.disp [aria-pressed="true"]')?.dataset.disp, timer: !!document.querySelector('.intro-timer') }));
      if (stage === 'photo' && !st.stage) { stage = 'stone'; a.mark('stone'); await a.box('ring', '.vp', 0); }
      if (stage === 'stone' && st.disp === 'wire') { stage = 'wire'; a.mark('wire'); }
      if (stage === 'wire' && st.disp === 'shaded') { stage = 'shaded'; a.mark('shaded'); }
      if (stage === 'shaded' && st.disp === 'render') { stage = 'render'; a.mark('render'); }
      if (stage === 'render' && st.sheet) { stage = 'sheet'; a.mark('sheet'); }
      if (stage === 'sheet' && !st.sheet && !st.timer) { stage = 'done'; a.mark('done'); break; }
    }
    console.log('photo9 区切り', stage);
    await a.until(() => !!(window.__studio.session && window.__studio.session.built), null, { label: '組み上がり' });
    await a.settle(600);
    await blackVp9(a);
    await p.evaluate(() => document.querySelector('.presets')?.scrollIntoView({ block: 'center' }));
    a.mark('stoneCard'); await a.box('presets', '.presets', 8); await a.box('card', '.stone-card', 8);
    await a.hold(N(24), { turn: TURN9 });
    const pearAt = await a.move('.presets button[data-preset="pear"]', 16, { turn: TURN9 });
    await a.shot({ rip: 1, turn: TURN9 });
    await p.mouse.click(pearAt.x, pearAt.y);
    await a.until(() => !!(window.__studio.session && window.__studio.session.built), null, { label: 'ペア' });
    await fine(a, 300);
    await blackVp9(a);
    await p.evaluate(() => document.querySelector('.presets')?.scrollIntoView({ block: 'center' }));
    a.mark('pear');
    console.log('photo9 ペア', await specsText(p));
    await a.hold(N(50), { turn: TURN9 });
  },
  // 言葉で腕まで変わる：写真の石のまま「ゴシックな感じ」→ 本物の Claude が組む → 見せる。覚えた返事があれば Claude は呼ばない
  gothic9: async (a) => {
    const { p } = a;
    await studioNow9(a);
    await builtNow9(a);
    await p.addStyleTag({ content: CHROME9 });
    await p.addStyleTag({ content: '.worklog{max-height:none!important}' });
    await blackVp9(a);
    await p.evaluate(() => document.querySelector('.worklog')?.scrollIntoView({ block: 'center' }));
    await a.settle(300);
    await a.box('wish', '.command', 6); a.mark('start');
    console.log('gothic9 前', await specsText(p));
    await a.hold(N(20), { turn: TURN9 });
    a.mark('type');
    await a.type('.wish', 'ゴシックな感じ', { each: 4, n: 16 });
    a.mark('typed');
    await a.hold(N(14), { turn: TURN9 });
    await a.press('.command button[type="submit"]', { n: 10, after: 2 });
    a.mark('go');
    const t0 = Date.now();
    const done = () => { const s = document.querySelector('.make-status')?.textContent || ''; return !/組んで、作れるか/.test(s) && document.querySelectorAll('.worklog li').length > 1; };
    const probe = () => document.querySelectorAll('.worklog li').length;
    await a.watch(done, probe, { per: 6, timeout: 420000, onChange: () => p.evaluate(() => { const w = document.querySelector('.worklog'); if (w) w.lastElementChild?.scrollIntoView({ block: 'end' }); }) });
    console.log('gothic9 Claude', Math.round((Date.now() - t0) / 1000), '秒');
    await fine(a, 400);
    await blackVp9(a);
    a.mark('done');
    await a.box('chip', '.verdict-chip', 6);
    console.log('gothic9 後', await specsText(p));
    await numbers9(p, 'gothic9');
    console.log('gothic9 作業の記録', await p.evaluate(() => [...document.querySelectorAll('.worklog li')].map((l) => l.innerText.replace(/\s+/g, ' ')).join(' ／ ')));
    console.log('gothic9 腕', await p.evaluate(() => JSON.stringify({ state: { section: window.__studio.session.state.shankSection, width: window.__studio.session.state.shankWidthMm, th: window.__studio.session.state.shankThicknessMm, metal: window.__studio.session.state.metal, relief: window.__studio.session.state.shankRelief, more: window.__studio.session.state.shankReliefMore } })));
    await a.hold(N(70), { turn: TURN9 });
    // 見せるの黒の上で大きく（右の字は外す）
    await p.evaluate(() => document.querySelector('.act-present').click());
    await a.settle(1200);
    await p.addStyleTag({ content: '.pr-panel,.pr-close,.insp,.cmd-wrap{display:none!important} .pro{grid-template-columns:0 1fr 0!important;grid-template-rows:0 1fr 0 0!important}' });
    await p.evaluate(() => { dispatchEvent(new Event('resize')); window.__viewer.setHighQuality(true); });
    await new Promise((r) => setTimeout(r, 1200));
    await a.settle(800);
    await p.evaluate(() => { const v = window.__viewer; v.setAutoRotate(false); v.keepCamera = true; });
    await look9(a, { x: 0.8, y: -0.62, z: 0.5 }, 0.9);
    a.mark('present');
    await a.hold(N(170), { turn: TURN9, hide: true });
  },
  // 作れない所を、職人の言葉で教える：細い爪が赤く光る → 札を押して理由の窓 → まとめて直す → 作れます
  reason9: async (a) => {
    const { p } = a;
    await studioNow9(a);
    await builtNow9(a);
    await p.addStyleTag({ content: CHROME9 + `.insp,.cmd-wrap{display:none!important} .pro{grid-template-columns:0 1fr 0!important;grid-template-rows:0 1fr 0 0!important}
      .fix-pop{zoom:1.25;right:16px!important;top:34px!important;width:350px!important;max-height:none!important} .verdict-chip{zoom:1.3}` });
    await p.evaluate(() => { dispatchEvent(new Event('resize')); window.__studio.setMode('refine'); });
    await a.settle(400);
    await blackVp9(a);
    await p.evaluate((f) => { const s = window.__studio.session; s.setShank(f); s.setSetting({ prong_mm: 0.6, reason: '撮る' }); }, FLAT9);
    await fine(a, 400);
    await blackVp9(a);
    console.log('reason9 細い', await specsText(p), await p.evaluate(() => document.querySelector('.verdict-chip')?.innerText));
    await numbers9(p, 'reason9');
    const seat = await p.evaluate(() => { const r = window.__studio.session.built.ring; return [0, 0, r.shank.outerRadiusMm + r.shank.innerRadiusMm + 2.4]; });
    // 窓に隠れないよう、指輪を左へ
    await aimAt(p, seat, [0.62, -1.0, 0.78], 25, -216, 6);
    await a.settle(300);
    a.mark('red'); await a.box('chip', '.verdict-chip', 6);
    await a.hold(N(40), { turn: 0.001 });
    await a.press('.verdict-chip', { n: 16, after: 2, turn: 0.001 });
    await a.settle(100);
    a.mark('open'); await a.box('pop', '.fix-pop', 6);
    console.log('reason9 窓', await p.evaluate(() => document.querySelector('.fix-pop')?.innerText.replace(/\s+/g, ' ')));
    await a.move({ x: 500, y: 500 }, 16, { turn: 0.001 });
    a.mark('read');
    await a.hold(N(80), { turn: 0.001, hide: true });
    await a.move('.fp-every', 18, { turn: 0.001 });
    await a.shot({ rip: 1, turn: 0.001 });
    a.mark('press');
    await p.evaluate(() => document.querySelector('.fp-every').click());
    await a.shot({ rip: 0.65, turn: 0.001 }); await a.shot({ rip: 0.3, turn: 0.001 });
    await a.until(() => !window.__studio.session.pendingFinal, null, { label: '細かい形', chunk: 50 });
    await a.settle(200);
    await blackVp9(a);
    a.mark('fixed'); await a.box('chip2', '.verdict-chip', 6);
    console.log('reason9 直した', await specsText(p), await p.evaluate(() => document.querySelector('.verdict-chip')?.innerText));
    await numbers9(p, 'reason9 直した');
    await a.hold(N(70), { turn: 0.001, hide: true });
  },
  // 作り方：3D モデルを見せたまま、手順の札。鋳造 → 鍛造 → 流れの文の中の言葉を押すと、すぐ下に開く
  make9: async (a) => {
    const { p } = a;
    await studioNow9(a);
    await builtNow9(a);
    await p.addStyleTag({ content: CHROME9 + `.cmd-wrap{display:none!important} .pro{grid-template-columns:0 1fr 470px!important;grid-template-rows:0 1fr 0 0!important;background:#000!important} .insp{border-left:0!important;background:#0c0c0e!important} .insp-head{display:none!important}` });
    await p.evaluate(() => dispatchEvent(new Event('resize')));
    await p.evaluate((f) => window.__studio.session.setShank(f), FLAT9);
    await fine(a, 300);
    await p.evaluate(() => window.__studio.setMode('hand'));
    await a.settle(800);
    await blackVp9(a);
    await p.evaluate(() => window.__viewer.setHighQuality(true));
    await new Promise((r) => setTimeout(r, 1000));
    await a.settle(400);
    const seat = await p.evaluate(() => { const r = window.__studio.session.built.ring; return [0, 0, r.shank.outerRadiusMm + r.shank.innerRadiusMm - 4]; });
    await aimAt(p, seat, [0.62, -1.0, 0.62], 62, 0, 0);
    await a.settle(300);
    const bp = '.build-panel';
    console.log('make9 手順のボタン', await p.evaluate((s) => [...document.querySelectorAll(`${s} button`)].slice(0, 6).map((b) => `${b.className}|${b.dataset.m || b.dataset.method || ''}|${b.innerText}`).join(' ／ '), bp));
    // 鋳造の札 → 鍛造を押す → 04 ロウ付けで閉じる（職人の決まりが同じ札にある）→ 流れの文の中の言葉を押すと、すぐ下に開く
    await p.evaluate((s) => document.querySelector(`${s} [data-m="cast"]`).click(), bp);
    await a.settle(600);
    await p.evaluate((s) => { const c = document.querySelector(s); if (c) c.scrollTop = 0; }, bp);
    a.mark('cast');
    console.log('make9 鋳造の札', await p.evaluate((s) => [...document.querySelectorAll(`${s} .mk-card h3`)].map((h) => h.innerText).join(' ・ '), bp));
    await a.hold(N(46), { turn: TURN9, hide: true });
    await a.press(`${bp} [data-m="hand"]`, { n: 16, after: 2, turn: TURN9 });
    await a.settle(200);
    a.mark('forge');
    console.log('make9 鍛造の札', await p.evaluate((s) => [...document.querySelectorAll(`${s} .mk-card h3`)].map((h) => h.innerText).join(' ・ '), bp));
    await a.hold(N(16), { turn: TURN9 });
    const c4 = `${bp} .mk-card:nth-child(4)`;
    await a.scroll(c4, { block: 'start', n: 22 });
    a.mark('card');
    await a.box('card', c4, 4); await a.box('more', `${c4} .flow .term`, 6);
    console.log('make9 04', await p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').slice(0, 300), c4));
    await a.hold(N(16), { turn: TURN9 });
    const tm = await p.locator(`${c4} .flow .term`).first().boundingBox();
    await a.move({ x: tm.x + tm.width / 2, y: tm.y + tm.height / 2 }, 18, { turn: TURN9 });
    await a.shot({ rip: 1, turn: TURN9 });
    a.mark('press');
    await p.mouse.click(tm.x + tm.width / 2, tm.y + tm.height / 2);
    await a.shot({ rip: 0.65, turn: TURN9 }); await a.shot({ rip: 0.3, turn: TURN9 });
    await a.settle(60);
    a.mark('open');
    await a.box('def', `${c4} .term-def`, 6);
    console.log('make9 言葉', await p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').slice(0, 200), `${c4} .term-def`));
    await a.move({ x: 200, y: 500 }, 12, { turn: TURN9 });
    await a.hold(N(70), { turn: TURN9, hide: true });
  },
  // 職人の言葉 → Claude の案 → これでいい。確かめるの欄だけを、幅 480 に見える形で（4 倍）
  word9: async (a) => {
    const { p } = a;
    await studioNow9(a);
    await builtNow9(a);
    await p.addStyleTag({ content: `.pro{grid-template-columns:0 0 1fr!important;grid-template-rows:0 1fr 0 0!important;background:#101012!important}.tb,.tools,.sb,.cmd-wrap,.toast{display:none!important}.vp{visibility:hidden}.insp{border:0!important}.insp-head{display:none!important}.studio-refine{max-width:480px;margin:0 auto;width:100%}` });
    await p.evaluate(() => window.__studio.setMode('refine'));
    await a.settle(800);
    await p.evaluate(() => document.querySelector('.ar-text')?.scrollIntoView({ block: 'start' }));
    await p.evaluate(() => { const r = document.querySelector('.studio-refine'); r.scrollTop -= 40; });
    await a.settle(300);
    console.log('word9 前の数字', await specsText(p));
    a.mark('start'); await a.box('field', '.ar-text', 10); await a.box('go', '.ar-go', 8);
    await a.hold(N(8), { hide: true });
    const fb = await p.locator('.ar-text').boundingBox();
    await p.mouse.click(fb.x + 40, fb.y + 16);
    a.mark('type');
    for (const ch of (process.env.CAP_TEST ? WORD8.slice(0, 4) : WORD8)) { await p.keyboard.insertText(ch); await a.hold(1, { hide: true }); }
    a.mark('typed');
    await a.hold(N(10), { hide: true });
    await a.press('.ar-go', { n: 14, after: 0 });
    a.mark('wait');
    await a.until(() => /これでいい/.test(document.querySelector('.ar-proposal')?.innerText || ''), null, { label: 'Claude の案', timeout: 240000 });
    await p.evaluate(() => { const e = document.querySelector('.ar-proposal'); const r = document.querySelector('.studio-refine'); r.scrollTop += e.getBoundingClientRect().top - 20; });
    await a.settle(300);
    await a.box('proposal', '.ar-proposal', 10); a.mark('proposal');
    console.log('word9 の案', await p.evaluate(() => document.querySelector('.ar-proposal')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(N(30), { hide: true });
    await a.box('ok', '.ar-proposal button.ok', 8);
    await a.press('.ar-proposal button.ok', { n: 18, after: 0 });
    a.mark('applied');
    await a.settle(800);
    await a.hold(N(20), { hide: true });
    console.log('word9 後の数字', await specsText(p));
    console.log('word9 決まりの字', await p.evaluate(() => document.querySelector('.rule-flash')?.innerText.replace(/\s+/g, ' ')));
  },
  // Claude が職人に聞く（スマホの幅の 4 倍）：帳面の質問の札 → 書いて答える → Claude の案 → 帳面に入れる
  ask9: async (a) => {
    const { p } = a;
    p.on('dialog', (d) => d.accept());
    await p.goto(`${BASE}/app.html#ledger`, { waitUntil: 'load' });
    await a.settle(800);
    await p.addStyleTag({ content: '.tabbar,.bottom-nav,nav.tabs,.toast{display:none!important} .bar{display:none!important} body{background:#101012!important}' });
    await p.evaluate(() => document.querySelectorAll('body *').forEach((e) => { if (getComputedStyle(e).position === 'fixed') e.style.display = 'none'; }));
    await a.until(() => { const q = document.querySelector('.iv-q'); return q && !q.classList.contains('pending'); }, null, { label: 'Claude の問い', timeout: 180000 });
    await a.settle(600);
    await p.evaluate(() => { const c = document.querySelector('.iv-card'); c?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -24); });
    await a.settle(200);
    a.mark('card'); await a.box('q', '.iv-q', 8); await a.box('cardBox', '.iv-card', 8);
    console.log('ask9 の問い', await p.evaluate(() => document.querySelector('.iv-q')?.innerText));
    await a.hold(N(12), { hide: true });
    const ansBtn = await p.locator('.iv-card .answer').count();
    if (ansBtn) { await a.press('.iv-card .answer', { n: 12, after: 2 }); await a.settle(200); }
    await p.evaluate(() => { const c = document.querySelector('.iv-card'); c?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -24); });
    a.mark('answerOpen');
    await a.box('answer', '.answer-box textarea', 10);
    await a.press('.answer-box textarea', { n: 10, after: 0 });
    a.mark('type');
    for (const ch of (process.env.CAP_TEST ? ANSWER8.slice(0, 3) : ANSWER8)) { await p.keyboard.insertText(ch); await a.hold(2, { hide: true }); }
    a.mark('typed');
    await a.hold(N(8), { hide: true });
    await a.box('make', '.answer-box button.make', 8);
    await a.press('.answer-box button.make', { n: 12, after: 0 });
    a.mark('wait');
    await a.until(() => /帳面に入れる|これでいい/.test(document.querySelector('.proposal-slot')?.innerText || ''), null, { label: 'Claude の決まり', timeout: 240000 });
    await a.settle(300);
    await p.evaluate(() => { const c = document.querySelector('.proposal-slot .proposal'); c?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -24); });
    await a.settle(200);
    a.mark('draft'); await a.box('draftBox', '.proposal-slot .proposal', 10);
    console.log('ask9 の案', await p.evaluate(() => document.querySelector('.proposal-slot')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(N(30), { hide: true });
    await a.press('.proposal-slot [data-a="ok"]', { n: 18, after: 6 });
    a.mark('saved');
    await a.hold(N(20), { hide: true });
  },
  // 学ぶ（スマホの幅の 4 倍）：言葉で聞く → すぐ答え（職人の言葉つき）
  learn9: async (a) => {
    const { p } = a;
    await p.goto(`${BASE}/app.html#learn`, { waitUntil: 'load' });
    await a.settle(1000);
    await p.addStyleTag({ content: '.bar,.toast{display:none!important} body{background:#101012!important}' });
    await p.evaluate(() => document.querySelectorAll('body *').forEach((e) => { if (getComputedStyle(e).position === 'fixed' && !e.closest('.composer') && !e.classList.contains('composer')) e.style.display = 'none'; }));
    a.mark('start'); await a.box('composer', '.composer', 8);
    await a.hold(N(6), { hide: true });
    const f = '.composer textarea';
    const fb = await p.locator(f).boundingBox();
    await p.mouse.click(fb.x + 30, fb.y + 12);
    a.mark('type');
    for (const ch of (process.env.CAP_TEST ? LEARN9.slice(0, 3) : LEARN9)) { await p.keyboard.insertText(ch); await a.hold(1, { hide: true }); }
    a.mark('typed');
    await a.hold(N(8), { hide: true });
    await a.press('.composer .send', { n: 10, after: 2 });
    a.mark('wait');
    await a.until(() => !!document.querySelector('.thread .a-short'), null, { label: '学ぶの答え', timeout: 240000 });
    await a.settle(400);
    await p.addStyleTag({ content: '.composer{display:none!important}' });
    await p.evaluate(() => { document.querySelector('.thread')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -20); });
    await a.settle(100);
    await a.box('answer', '.thread', 10); await a.box('short', '.thread .a-short', 8); a.mark('answer');
    console.log('learn9 の答え', await p.evaluate(() => document.querySelector('.thread')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(N(30), { hide: true });
  },
});
const LEARN9 = '三角の石を留めたい。爪は何本で、太さはどれくらい？';


// ================================================================ 最終案 10（2026-11-06）：どの画面も、まず全体を見せて、押す所を示してから寄る（寄るのは組むときの切り抜き。枠は動かさない）
const APP_CSS10 = '.pw-state,.toast{display:none!important}';
const app10 = async (a, hash) => {
  const { p } = a;
  p.on('dialog', (d) => d.accept());
  await p.goto(`${BASE}/app.html${hash}`, { waitUntil: 'load' });
  await a.settle(1200);
  await p.addStyleTag({ content: APP_CSS10 });
  await a.settle(200);
};
Object.assign(CH, {
  // 職人の言葉 → Claude の数字つきの案 → これでいい → 帳面に入る（全体 → 確かめるを押す → 職人の決まりの欄 → …）
  word10: async (a) => {
    const { p } = a;
    await studioNow9(a); await builtNow9(a);
    await p.addStyleTag({ content: '.toast{display:none!important}' });
    await a.settle(300);
    a.mark('full'); await a.box('tab', '.tabs [data-mode="refine"]', 6);
    await a.hold(N(24));
    await a.press('.tabs [data-mode="refine"]', { n: 18, after: 6 });
    a.mark('refine');
    await a.scroll('.ar-text', { block: 'center', n: 22 });
    await a.settle(100);
    a.mark('field'); await a.box('field', '.ar-text', 10); await a.box('panel', '.studio-refine', 0);
    await a.hold(N(8));
    await a.press('.ar-text', { n: 14, after: 2 });
    a.mark('type');
    for (const ch of (process.env.CAP_TEST ? WORD8.slice(0, 4) : WORD8)) { await p.keyboard.insertText(ch); await a.hold(1); }
    a.mark('typed');
    await a.hold(N(10));
    await a.box('go', '.ar-go', 8);
    await a.press('.ar-go', { n: 12, after: 0 });
    a.mark('wait');
    await a.until(() => /これでいい/.test(document.querySelector('.ar-proposal')?.innerText || ''), null, { label: 'Claude の案', timeout: 240000 });
    await p.evaluate(() => { const e = document.querySelector('.ar-proposal'); const r = document.querySelector('.studio-refine'); r.scrollTop += e.getBoundingClientRect().top - r.getBoundingClientRect().top - 60; });
    await a.settle(300);
    await a.box('proposal', '.ar-proposal', 10); a.mark('proposal');
    console.log('word10 の案', await p.evaluate(() => document.querySelector('.ar-proposal')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(N(40));
    await a.box('ok', '.ar-proposal button.ok', 8);
    await a.press('.ar-proposal button.ok', { n: 18, after: 0 });
    a.mark('applied');
    await a.settle(600);
    await p.evaluate(() => { const e = document.querySelector('.rule-flash'); const r = document.querySelector('.studio-refine'); if (e) r.scrollTop += e.getBoundingClientRect().top - r.getBoundingClientRect().top - 20; });
    await a.settle(200);
    await a.box('flash', '.rule-flash', 8);
    await a.hold(N(40), { hide: true });
    console.log('word10 決まりの字', await p.evaluate(() => document.querySelector('.rule-flash')?.innerText.replace(/\s+/g, ' ')));
  },
  // 言葉で腕まで変わる：今のアプリで、本物の Claude に「ゴシックな感じ」（全体 → 希望の欄を押す → 打つ → 生成 → 見せるを押す）
  gothic10: async (a) => {
    const { p } = a;
    await studioNow9(a); await builtNow9(a);
    await p.addStyleTag({ content: '.toast{display:none!important} .worklog{max-height:none!important}' });
    await blackVp9(a);
    await p.evaluate(() => document.querySelector('.worklog')?.scrollIntoView({ block: 'center' }));
    await a.settle(300);
    console.log('gothic10 前', await specsText(p));
    a.mark('full'); await a.box('wish', '.command', 6);
    await a.hold(N(24), { turn: TURN9 });
    a.mark('type');
    await a.type('.wish', 'ゴシックな感じ', { each: 4, n: 18 });
    a.mark('typed');
    await a.hold(N(12), { turn: TURN9 });
    await a.box('go', '.command button[type="submit"]', 6);
    await a.press('.command button[type="submit"]', { n: 10, after: 2 });
    a.mark('go');
    const t0 = Date.now();
    const done = () => { const s = document.querySelector('.make-status')?.textContent || ''; return !/組んで、作れるか/.test(s) && document.querySelectorAll('.worklog li').length > 1; };
    const probe = () => document.querySelectorAll('.worklog li').length + (document.querySelector('.verdict-chip')?.textContent || '');
    await a.watch(done, probe, { per: 8, timeout: 480000, onChange: () => p.evaluate(() => { const w = document.querySelector('.worklog'); if (w) w.lastElementChild?.scrollIntoView({ block: 'end' }); }) });
    console.log('gothic10 Claude', Math.round((Date.now() - t0) / 1000), '秒');
    await fine(a, 400);
    await blackVp9(a);
    a.mark('done');
    await a.box('chip', '.verdict-chip', 6); await a.box('log', '.worklog', 6);
    console.log('gothic10 後', await specsText(p));
    await numbers9(p, 'gothic10');
    console.log('gothic10 作業の記録', await p.evaluate(() => [...document.querySelectorAll('.worklog li')].map((l) => l.innerText.replace(/\s+/g, ' ')).join(' ／ ')));
    console.log('gothic10 腕', await p.evaluate(() => { const st = window.__studio.session.state; return JSON.stringify({ section: st.shankSection, width: st.shankWidthMm, th: st.shankThicknessMm, metal: st.metal, stations: st.shankStations, relief: st.shankRelief, more: st.shankReliefMore, prongTip: st.prongTip, prongCount: st.prongCount, join: st.join }); }));
    await a.hold(N(50), { turn: TURN9 });
    // 見せるを押す（上の帯）
    await a.box('present', '.act-present', 6);
    await a.press('.act-present', { n: 16, after: 0 });
    await a.settle(1200);
    await p.evaluate(() => { const v = window.__viewer; v.setAutoRotate(false); v.keepCamera = true; v.setHighQuality(true); });
    await new Promise((r) => setTimeout(r, 1200));
    await a.settle(600);
    await look9(a, { x: 0.8, y: -0.62, z: 0.5 }, 0.95);
    a.mark('present');
    console.log('gothic10 見せる', await p.evaluate(() => document.querySelector('.pr-panel')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(N(150), { turn: TURN9, hide: true });
  },
  // 作れない所を、職人の言葉で教える（全体 → 赤く光る → 札を押す → 理由の窓 → まとめて直す）
  reason10: async (a) => {
    const { p } = a;
    await studioNow9(a); await builtNow9(a);
    await p.addStyleTag({ content: '.toast{display:none!important}' });
    await p.evaluate(() => window.__studio.setMode('refine'));
    await a.settle(400);
    await blackVp9(a);
    await p.evaluate((f) => { const s = window.__studio.session; s.setShank(f); s.setSetting({ prong_mm: 0.6, reason: '撮る' }); }, FLAT9);
    await fine(a, 400);
    await blackVp9(a);
    const seat = await p.evaluate(() => { const r = window.__studio.session.built.ring; return [0, 0, r.shank.outerRadiusMm + r.shank.innerRadiusMm + 2.4]; });
    await aimAt(p, seat, [0.62, -1.0, 0.78], 30, -150, 0);
    await a.settle(300);
    console.log('reason10 細い', await specsText(p), await p.evaluate(() => document.querySelector('.verdict-chip')?.innerText));
    a.mark('red'); await a.box('chip', '.verdict-chip', 6); await a.box('vp', '.vp', 0);
    await a.hold(N(46), { turn: 0.001 });
    await a.press('.verdict-chip', { n: 18, after: 2, turn: 0.001 });
    await a.settle(100);
    a.mark('open'); await a.box('pop', '.fix-pop', 6);
    console.log('reason10 窓', await p.evaluate(() => document.querySelector('.fix-pop')?.innerText.replace(/\s+/g, ' ')));
    await a.move({ x: 500, y: 600 }, 14, { turn: 0.001 });
    a.mark('read');
    await a.hold(N(70), { turn: 0.001, hide: true });
    await a.move('.fp-every', 18, { turn: 0.001 });
    await a.shot({ rip: 1, turn: 0.001 });
    a.mark('press');
    await p.evaluate(() => document.querySelector('.fp-every').click());
    await a.shot({ rip: 0.65, turn: 0.001 }); await a.shot({ rip: 0.3, turn: 0.001 });
    await a.until(() => !window.__studio.session.pendingFinal, null, { label: '細かい形', chunk: 50 });
    await a.settle(200);
    await blackVp9(a);
    a.mark('fixed'); await a.box('chip2', '.verdict-chip', 6);
    console.log('reason10 直した', await specsText(p), await p.evaluate(() => document.querySelector('.verdict-chip')?.innerText));
    await a.hold(N(60), { turn: 0.001, hide: true });
  },
  // 作り方を自動で作る（全体 → 手順を押す → 鋳造 → 鍛造 → 文の中の言葉を押すと開く）
  make10: async (a) => {
    const { p } = a;
    await studioNow9(a); await builtNow9(a);
    await p.addStyleTag({ content: '.toast{display:none!important}' });
    await p.evaluate((f) => window.__studio.session.setShank(f), FLAT9);
    await fine(a, 300);
    await blackVp9(a);
    a.mark('full'); await a.box('tab', '.tabs [data-mode="hand"]', 6);
    await a.hold(N(20), { turn: TURN9 });
    await a.press('.tabs [data-mode="hand"]', { n: 18, after: 4, turn: TURN9 });
    await a.settle(600);
    await blackVp9(a);
    const bp = '.build-panel';
    await p.evaluate((s) => document.querySelector(`${s} [data-m="cast"]`).click(), bp);
    await a.settle(500);
    await p.evaluate((s) => { const c = document.querySelector(s); if (c) c.scrollTop = 0; }, bp);
    a.mark('cast'); await a.box('panel', '.insp', 0);
    await a.hold(N(40), { turn: TURN9 });
    await a.press(`${bp} [data-m="hand"]`, { n: 16, after: 2, turn: TURN9 });
    a.mark('forge');
    await a.hold(N(14), { turn: TURN9 });
    const c4 = `${bp} .mk-card:nth-child(4)`;
    await a.scroll(c4, { block: 'start', n: 22 });
    a.mark('card'); await a.box('card', c4, 4);
    await a.hold(N(14), { turn: TURN9 });
    const tm = await p.locator(`${c4} .flow .term`).first().boundingBox();
    await a.move({ x: tm.x + tm.width / 2, y: tm.y + tm.height / 2 }, 18, { turn: TURN9 });
    await a.shot({ rip: 1, turn: TURN9 });
    a.mark('press');
    await p.mouse.click(tm.x + tm.width / 2, tm.y + tm.height / 2);
    await a.shot({ rip: 0.65, turn: TURN9 }); await a.shot({ rip: 0.3, turn: TURN9 });
    await a.settle(60);
    a.mark('open'); await a.box('def', `${c4} .term-def`, 6);
    console.log('make10 言葉', await p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').slice(0, 120), `${c4} .term-def`));
    await a.move({ x: 300, y: 600 }, 12, { turn: TURN9 });
    await a.hold(N(60), { turn: TURN9, hide: true });
  },
  // Claude が職人に聞く（帳面の画面の全体 → 書いて答えるを押す → 答える → Claude の案 → 帳面に入れる）
  ask10: async (a) => {
    const { p } = a;
    await app10(a, '#ledger');
    await a.until(() => { const q = document.querySelector('.iv-q'); return q && !q.classList.contains('pending'); }, null, { label: 'Claude の問い', timeout: 180000 });
    await a.settle(600);
    a.mark('full'); await a.box('card', '.iv-card', 6); await a.box('answerBtn', '.iv-card .answer', 6);
    console.log('ask10 の問い', await p.evaluate(() => document.querySelector('.iv-q')?.innerText));
    await a.hold(N(30));
    await a.press('.iv-card .answer', { n: 16, after: 4 });
    await p.evaluate(() => { document.querySelector('.iv-card')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); });
    await a.settle(200);
    a.mark('answerOpen'); await a.box('cardOpen', '.iv-card', 6); await a.box('answer', '.answer-box textarea', 8);
    await a.press('.answer-box textarea', { n: 10, after: 0 });
    a.mark('type');
    for (const ch of (process.env.CAP_TEST ? ANSWER8.slice(0, 3) : ANSWER8)) { await p.keyboard.insertText(ch); await a.hold(2); }
    a.mark('typed');
    await a.hold(N(8));
    await a.press('.answer-box button.make', { n: 12, after: 0 });
    a.mark('wait');
    await a.until(() => /帳面に入れる|これでいい/.test(document.querySelector('.proposal-slot')?.innerText || ''), null, { label: 'Claude の決まり', timeout: 240000 });
    await a.settle(300);
    await p.evaluate(() => { document.querySelector('.proposal-slot .proposal')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -40); });
    await a.settle(200);
    a.mark('draft'); await a.box('draftBox', '.proposal-slot .proposal', 8);
    console.log('ask10 の案', await p.evaluate(() => document.querySelector('.proposal-slot')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(N(30));
    await a.press('.proposal-slot [data-a="ok"]', { n: 18, after: 6 });
    a.mark('saved');
    await a.hold(N(24), { hide: true });
  },
  // 学ぶ（全体 → 問いを打つ → 聞くを押す → すぐ答え）
  learn10: async (a) => {
    const { p } = a;
    await app10(a, '#learn');
    a.mark('full'); await a.box('composer', '.composer', 6);
    await a.hold(N(24));
    await a.press('.composer textarea', { n: 14, after: 2 });
    a.mark('type');
    for (const ch of (process.env.CAP_TEST ? LEARN9.slice(0, 3) : LEARN9)) { await p.keyboard.insertText(ch); await a.hold(1); }
    a.mark('typed');
    await a.hold(N(8));
    await a.box('send', '.composer .send', 6);
    await a.press('.composer .send', { n: 10, after: 2 });
    a.mark('wait');
    await a.until(() => !!document.querySelector('.thread .a-short'), null, { label: '学ぶの答え', timeout: 240000 });
    await a.settle(400);
    await p.evaluate(() => { const q = [...document.querySelectorAll('.thread .q, .thread .bubble, .thread > *')].pop(); document.querySelector('.thread')?.lastElementChild?.scrollIntoView({ block: 'center' }); });
    await a.settle(200);
    a.mark('answer'); await a.box('answer', '.thread .a-short', 8); await a.box('thread', '.thread', 6);
    console.log('learn10 の答え', await p.evaluate(() => document.querySelector('.thread')?.innerText.replace(/\s+/g, ' ').slice(0, 200)));
    await a.hold(N(40), { hide: true });
  },
  // 答えの分かっている技（木目金）：全体 → 手がかりの欄を押して開く → 手がかり 9
  rebuild10: async (a) => {
    const { p } = a;
    await app10(a, '#waza/rebuild');
    a.mark('full'); await a.box('clues', 'details.clues > summary', 6);
    await a.hold(N(24));
    await a.press('details.clues > summary', { n: 16, after: 4 });
    await a.scroll('details.clues', { block: 'start', n: 18, offset: 70 });
    a.mark('open'); await a.box('cluesBox', 'details.clues', 0);
    await a.hold(N(40), { hide: true });
  },
  // 帳面の全体（工房に入れておけば）
  ledger10: async (a) => {
    await app10(a, '#ledger');
    a.mark('full');
    await a.hold(N(6), { hide: true });
  },
});

// 結の前に並べる「継ぐで作れる形の幅」：見本の形（入口のページの地金のみの指輪・攻めたゴシック）を、黒の上で少しずつ回す
const SHAPES10 = [
  ['attack', 'gothic=attack'],
  ['crossing', 'band=crossing'],
  ['stairs', 'band=stairs'],
  ['twin', 'band=twin'],
];
Object.assign(CH, {
  shapes10: async (a) => {
    const { p } = a;
    for (const [name, q] of (process.env.SHAPES ? SHAPES10.filter(([n]) => process.env.SHAPES.split(',').includes(n)) : SHAPES10)) {
      await p.goto(`${BASE}/studio.html?nointro&rec&${q}`, { waitUntil: 'load' });
      await a.until(() => !!(window.__studio && window.__viewer), null, { label: name, chunk: 50 });
      await a.settle(2500);
      await new Promise((r) => setTimeout(r, 2500));
      await a.settle(1500);
      await p.addStyleTag({ content: STAGE_CSS9 });
      await p.evaluate(() => {
        const v = window.__viewer;
        v.setDisplayMode('render'); v.setPresenting(true);
        document.querySelector('.t-dims[aria-pressed="true"]')?.click(); document.querySelector('.t-grid[aria-pressed="true"]')?.click();
        v.setAutoRotate(false); v.keepCamera = true;
        dispatchEvent(new Event('resize'));
      });
      await new Promise((r) => setTimeout(r, 1500));
      await a.settle(800);
      await look9(a, { x: 0.66, y: -0.62, z: 0.42 }, 1.0);
      console.log('shapes10', name, await p.evaluate(() => document.querySelector('.sb .specs')?.innerText.replace(/\s+/g, ' ').slice(0, 200)));
      a.mark(name);
      await a.hold(N(80), { turn: TURN9, hide: true });
    }
  },
});
// ================================================================ 最終案 10 の続き（2026-11-06 作者の声：実際に使っている所を中心に。カーソルが本当に操作して、指輪がその場で変わる）
/** 3D の絵を横に dx px ずらす（カメラの見る先はそのまま。回しても指輪はその場所で回る。押す・寸法の吸いつきも同じカメラなので合う） */
const shiftView11 = (p, dx) => p.evaluate((dx) => {
  const v = window.__viewer;
  const w = v.host.clientWidth || 1; const h = v.host.clientHeight || 1;
  const dy = h * (v.lift || 0) + ((v.insets?.bottom || 0) - (v.insets?.top || 0)) / 2;
  for (const cam of [v.cams.persp, v.cams.ortho]) {
    if (dx || dy) cam.setViewOffset(w, h, -dx, dy, w, h); else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }
  v.dirty = true; v.draw?.();
}, dx);
/** 爪 i の、画面の点（ページの px）。爪の三角形の真ん中より少し上 */
const prongAt11 = (p, i) => p.evaluate((i) => {
  const v = window.__viewer; const m = v.settingMesh; const b = window.__studio.session.built;
  const r = b.ring.setting.prongs[i].triangles; const pos = m.geometry.getAttribute('position').array;
  let x = 0, y = 0, z = 0, n = 0, zmax = -1e9;
  for (let k = r.start * 9; k < (r.start + r.count) * 9; k += 3) { x += pos[k]; y += pos[k + 1]; z += pos[k + 2]; n++; zmax = Math.max(zmax, pos[k + 2]); }
  m.updateMatrixWorld();
  const V = v.camera.position.constructor;
  const w = new V(x / n, y / n, (z / n) * 0.4 + zmax * 0.6).applyMatrix4(m.matrixWorld);
  const cam = new V().copy(v.camera.position);
  const s = v.project(w.x, w.y, w.z); const rr = v.host.getBoundingClientRect();
  return s && { x: s.x + rr.left, y: s.y + rr.top, dist: cam.distanceTo(w) };
}, i);
/** 指輪の中身の箱（mm）の真ん中と大きさ */
const ringBox11 = (p) => p.evaluate(() => {
  const v = window.__viewer; const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  v.content.traverse((o) => { if (!o.isMesh || !o.geometry) return; o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); for (const [k, a] of [['x', 0], ['y', 1], ['z', 2]]) { lo[a] = Math.min(lo[a], bb.min[k]); hi[a] = Math.max(hi[a], bb.max[k]); } });
  return { c: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], size: Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) };
});
/** 指輪を、向き dir から、いちばん長い所が 3D の高さの frac になるように見る。そのあと横に dx px ずらす */
const frame11 = async (a, dir, frac, dx) => {
  const { p } = a;
  const bx = await ringBox11(p);
  await p.evaluate(({ c, size, dir, frac }) => {
    const v = window.__viewer; const cam = v.camera; const V = cam.position.constructor;
    const h = v.host.clientHeight || 600;
    const d = size / frac / (2 * Math.tan(cam.fov * Math.PI / 360));
    v.setAutoRotate(false); v.keepCamera = true;
    v.controls.target.set(c[0], c[1], c[2]);
    cam.position.copy(new V(c[0], c[1], c[2])).add(new V(dir.x, dir.y, dir.z).normalize().multiplyScalar(d));
    cam.up.set(0, 0, 1); cam.lookAt(v.controls.target); v.controls.update(); v.dirty = true;
    return h;
  }, { c: bx.c, size: bx.size, dir, frac });
  await shiftView11(p, dx);
  await a.settle(300);
};
/** 黒い地（方眼と寸法の線は消す。自分で引く寸法の線は残す）。レンダーで */
const OPS_CSS11 = '.toast{display:none!important} .dims:not(.measures),.stone-tags{display:none!important} .vp{background:#000!important}';
const blackVp11 = async (a) => {
  await a.p.evaluate(() => {
    const v = window.__viewer;
    document.querySelector('.t-dims[aria-pressed="true"]')?.click(); document.querySelector('.t-grid[aria-pressed="true"]')?.click();
    document.querySelector('.disp [data-disp="render"]')?.click();
    v.setDisplayMode('render'); v.setPresenting(true); v.setAutoRotate(false); v.keepCamera = true;
  });
  await a.settle(400);
};
const DIR11 = { x: 0.7, y: -0.62, z: 0.42 };
Object.assign(CH, {
  // 手で変える：腕の形を選ぶ → 断面を手で描く（点をつまんで動かすと、腕がその場で変わる）→ 号を変える → 寸法を 2 点で引く
  ops11: async (a) => {
    const { p } = a;
    await studioNow9(a); await builtNow9(a);
    await p.addStyleTag({ content: OPS_CSS11 });
    await blackVp11(a);
    await p.evaluate(() => { const s = document.querySelector('.ring-shape')?.closest('section'); const c = document.querySelector('.make-panel'); if (s && c) c.scrollTop += s.getBoundingClientRect().top - c.getBoundingClientRect().top - 6; });
    await frame11(a, DIR11, 0.7, 170);
    console.log('ops11 はじめ', await specsText(p));
    a.mark('full'); await a.box('grid', '.ring-shape .bs-grid', 6); await a.box('vp', '.vp', 0); await a.box('panel', '.insp', 0);
    await a.hold(N(30), { turn: TURN9 });
    // 腕の形を選ぶ
    await a.press('.ring-shape [data-sec="yamagata"]', { n: 20, after: 0, turn: TURN9 });
    await fine(a, 100);
    a.mark('yamagata');
    console.log('ops11 山形', await specsText(p), JSON.stringify(await probsOf(p)));
    await a.hold(N(40), { turn: TURN9 });
    await a.press('.ring-shape [data-sec="hirauchi"]', { n: 12, after: 0, turn: TURN9 });
    await fine(a, 100);
    a.mark('hirauchi');
    console.log('ops11 平打ち', await specsText(p), JSON.stringify(await probsOf(p)));
    await a.hold(N(40), { turn: TURN9 });
    // 断面を手で描く
    await a.press('.ring-shape details.ring-draw > summary', { n: 16, after: 2, turn: TURN9 });
    await a.scroll('.ring-shape details.ring-draw .sec-edit svg', { block: 'center', n: 18 });
    a.mark('draw'); await a.box('sec', '.ring-shape details.ring-draw .sec-edit', 4);
    await a.hold(N(12), { turn: TURN9 });
    const pick = () => p.evaluate(() => {
      const svg = document.querySelector('.ring-shape details.ring-draw .sec-edit svg'); const sr = svg.getBoundingClientRect(); const cx = sr.x + sr.width / 2;
      const gs = [...svg.querySelectorAll('g.se-h:not(.ghost)')].map((g) => { const r = g.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      gs.sort((q, w) => q.y - w.y);
      const top = gs.filter((q) => q.y < gs[0].y + 4).sort((q, w) => Math.abs(q.x - cx) - Math.abs(w.x - cx))[0];
      const side = gs.filter((q) => q.y > gs[0].y + 12 && q.y < sr.y + sr.height - 30).sort((q, w) => w.x - q.x)[0];
      return { top, side };
    });
    const pt = await pick();
    await a.drag(pt.top, { x: pt.top.x, y: pt.top.y - 24 }, { n: 34, o: { turn: TURN9 } });
    await fine(a, 100);
    a.mark('dragged');
    console.log('ops11 描いた', await p.evaluate(() => document.querySelector('.ring-shape .se-read')?.innerText.replace(/\s+/g, ' ')), await specsText(p), JSON.stringify(await probsOf(p)));
    await a.hold(N(50), { turn: TURN9 });
    // 号を変える（確かめるの「手で変える」のつまみ）
    await a.press('.tabs [data-mode="refine"]', { n: 18, after: 0, turn: TURN9 });
    await a.settle(600);
    await blackVp11(a);
    await shiftView11(p, 170);
    a.mark('refine');
    await a.hold(N(10), { turn: TURN9 });
    await a.scroll('.slider[data-s="r-gou"]', { block: 'center', n: 20 });
    a.mark('gou0'); await a.box('gou', '.slider[data-s="r-gou"]', 6);
    console.log('ops11 号の前', await p.evaluate(() => window.__studio.session.state.gou));
    await a.hold(N(8), { turn: TURN9 });
    for (let k = 0; k < 2; k++) {
      await a.press('.slider[data-s="r-gou"] .sl-step[data-d="1"]', { n: k ? 6 : 16, after: 0, turn: TURN9 });
      await fine(a, 100);
      await a.hold(N(10), { turn: TURN9 });
    }
    a.mark('gou2');
    console.log('ops11 号', await p.evaluate(() => window.__studio.session.state.gou), await specsText(p));
    await a.hold(N(26), { turn: TURN9 });
    // 寸法を 2 点で引く（正面から。内径）
    await a.press('.view-btn[data-view="front"]', { n: 18, after: 0 });
    await a.settle(900);
    await shiftView11(p, 0);
    await a.settle(200);
    a.mark('front');
    await a.hold(N(10));
    await a.press('.t-measure', { n: 10, after: 2 });
    a.mark('measure');
    const g = await p.evaluate(() => {
      const v = window.__viewer; const r = window.__studio.session.built.ring; const ri = r.shank.innerRadiusMm, ro = r.shank.outerRadiusMm;
      const rr = v.host.getBoundingClientRect();
      const P = (x, y, z) => { const s = v.project(x, y, z); return s && { x: s.x + rr.left, y: s.y + rr.top }; };
      const A = P(0, -ri, ro), B = P(0, ri, ro);
      return A.x < B.x ? { A, B } : { A: B, B: A };
    });
    await a.press({ x: g.A.x - 2, y: g.A.y }, { n: 16, after: 6 });
    await a.press({ x: g.B.x + 2, y: g.B.y }, { n: 20, after: 2 });
    a.mark('measured'); await a.box('ms', '.ms-panel', 6);
    console.log('ops11 寸法', await p.evaluate(() => document.querySelector('.ms-panel')?.innerText.replace(/\s+/g, ' ')));
    await a.move({ x: g.B.x + 120, y: g.B.y + 150 }, 14);
    await a.hold(N(50), { hide: true });
  },
  // 言葉で頼む（本物の Claude の「ゴシックな感じ」。gothic10 で覚えた返事）→ 作れます → 人が爪を細くする → その場で作れない所 → 職人の言葉 → まとめて直す → 作れます → 図面 → STL
  gothic11: async (a) => {
    const { p } = a;
    await studioNow9(a); await builtNow9(a);
    const hideToast = await p.addStyleTag({ content: '.toast{display:none!important} .worklog{max-height:none!important}' });
    await blackVp9(a);
    await p.evaluate(() => document.querySelector('.worklog')?.scrollIntoView({ block: 'center' }));
    await a.settle(300);
    a.mark('full'); await a.box('wish', '.command', 6);
    await a.hold(N(24), { turn: TURN9 });
    a.mark('type');
    await a.type('.wish', 'ゴシックな感じ', { each: 4, n: 18 });
    a.mark('typed');
    await a.hold(N(12), { turn: TURN9 });
    await a.box('go', '.command button[type="submit"]', 6);
    await a.press('.command button[type="submit"]', { n: 10, after: 2 });
    a.mark('go');
    const done = () => { const s = document.querySelector('.make-status')?.textContent || ''; return !/組んで、作れるか/.test(s) && document.querySelectorAll('.worklog li').length > 1; };
    const probe = () => document.querySelectorAll('.worklog li').length + (document.querySelector('.verdict-chip')?.textContent || '');
    await a.watch(done, probe, { per: 6, timeout: 480000, onChange: () => p.evaluate(() => { const w = document.querySelector('.worklog'); if (w) w.lastElementChild?.scrollIntoView({ block: 'end' }); }) });
    await fine(a, 400);
    await blackVp9(a);
    a.mark('done'); await a.box('chip', '.verdict-chip', 6);
    const verdict = await p.evaluate(() => ({ chip: document.querySelector('.verdict-chip')?.innerText, hidden: document.querySelector('.verdict-chip')?.hidden, probs: window.__studio.session.built.problems.map((x) => `${x.check} ${x.current} → ${x.required}`) }));
    console.log('gothic11 生成の終わり', JSON.stringify(verdict), await specsText(p));
    if (verdict.probs.length) console.log('gothic11 ！！ 作れます で終わっていない（この回は使わない）');
    await numbers9(p, 'gothic11');
    await a.hold(N(60), { turn: TURN9 });
    // 人が直す：確かめるへ
    await a.press('.tabs [data-mode="refine"]', { n: 18, after: 0, turn: TURN9 });
    await a.settle(700);
    await blackVp9(a);
    await frame11(a, { x: 0.62, y: -0.95, z: 0.62 }, 0.66, -170);
    a.mark('refine');
    await a.hold(N(16), { turn: 0.0008 });
    // 爪を押す（いちばん手前の爪）
    const ps = [];
    for (let i = 0; i < 3; i++) ps.push({ i, ...(await prongAt11(p, i)) });
    ps.sort((q, w) => q.dist - w.dist);
    const pr = ps[0];
    console.log('gothic11 押す爪', JSON.stringify(ps));
    await a.press({ x: pr.x, y: pr.y }, { n: 22, after: 4 });
    a.mark('pop'); await a.box('pop', '.prong-pop', 6);
    console.log('gothic11 爪の欄', await p.evaluate(() => document.querySelector('.prong-pop')?.innerText.replace(/\s+/g, ' ').slice(0, 200)));
    await a.hold(N(20));
    // 太さのつまみを左へ（0.55 mm）
    const th = await p.evaluate(() => {
      const r = document.querySelector('.prong-pop .slider[data-s="pp-dia"] input[type=range]'); const b = r.getBoundingClientRect();
      const min = +r.min, max = +r.max, v = +r.value, half = 10;
      const X = (val) => b.x + half + ((val - min) / (max - min)) * (b.width - 2 * half);
      return { from: { x: X(v), y: b.y + b.height / 2 }, to: { x: X(0.55), y: b.y + b.height / 2 }, v };
    });
    await a.drag(th.from, th.to, { n: 30 });
    await fine(a, 200);
    a.mark('thin'); await a.box('chip2', '.verdict-chip', 6); await a.box('bad', '.prong-pop .pp-check', 6);
    console.log('gothic11 細くした', await p.evaluate(() => document.querySelector('.verdict-chip')?.innerText), await p.evaluate(() => document.querySelector('.prong-pop .pp-check')?.innerText.replace(/\s+/g, ' ')));
    await a.hold(N(46));
    // 赤の札 → 職人の言葉
    await a.press('.prong-pop .pp-x', { n: 14, after: 2 });
    await a.press('.verdict-chip', { n: 18, after: 2 });
    await a.settle(100);
    a.mark('reason'); await a.box('fix', '.fix-pop', 6);
    console.log('gothic11 理由の窓', await p.evaluate(() => document.querySelector('.fix-pop')?.innerText.replace(/\s+/g, ' ')));
    await a.move({ x: 380, y: 560 }, 14);
    await a.hold(N(66), { hide: true });
    await a.move('.fix-pop .fp-every', 18);
    await a.shot({ rip: 1 });
    a.mark('press');
    await p.evaluate(() => document.querySelector('.fix-pop .fp-every').click());
    await a.shot({ rip: 0.65 }); await a.shot({ rip: 0.3 });
    await a.until(() => !window.__studio.session.pendingFinal, null, { label: '細かい形', chunk: 50 });
    await a.settle(200);
    await blackVp9(a);
    a.mark('fixed'); await a.box('chip3', '.verdict-chip', 6);
    console.log('gothic11 直した', await p.evaluate(() => document.querySelector('.verdict-chip')?.innerText), await specsText(p));
    await a.hold(N(50), { turn: 0.0008 });
    // 図面（3D の上の表示を「図面」に）→ STL
    await a.press('.disp [data-disp="draw"]', { n: 20, after: 2 });
    await a.settle(1200);
    a.mark('draw'); await a.box('vp', '.vp', 0);
    await a.hold(N(50));
    await hideToast.evaluate((e) => e.remove());
    await a.press('.act-stl', { n: 22, after: 2 });
    await a.settle(200);
    a.mark('stl'); await a.box('toast', '.toast', 6);
    console.log('gothic11 STL', await p.evaluate(() => document.querySelector('.toast')?.innerText));
    await a.hold(N(46), { hide: true });
  },
});
// 「アールデコな感じ」（2026-11-06 作者の変更：ゴシックは有機的な所がまだ難しい。和の雰囲気にはアールデコが合う）。gothic11 と同じ流れ：
// 言葉で頼む（本物の Claude）→ 作れます → 人が爪を押して細くする → その場で赤 → 職人の言葉 → まとめて直す → 図面 → STL。
// 試す回（DECO_TRY=k、DECO_ONLY=1）：生成だけ撮り、設計（石と state）・Claude の作業の記録・道具を呼んだ回数・秒を work/story/_deco/try<k>.json に残す
const DECO_WISH = process.env.GEN_WISH || 'アールデコな感じ';
const genChapter = (chName) => async (a) => {
    const { p } = a;
    const only = !!process.env.DECO_ONLY;
    const tryNo = process.env.DECO_USE || process.env.DECO_TRY || '1';
    const tag = chName === 'gen12' ? (process.env.GEN_TAG || 'goth12') : 'deco11';
    await studioNow9(a); await builtNow9(a);
    const hideToast = await p.addStyleTag({ content: '.toast{display:none!important} .worklog{max-height:none!important}' });
    await blackVp9(a);
    await p.evaluate(() => document.querySelector('.worklog')?.scrollIntoView({ block: 'center' }));
    await a.settle(300);
    a.mark('full'); await a.box('wish', '.command', 6);
    await a.hold(N(24), { turn: TURN9 });
    a.mark('type');
    await a.type('.wish', DECO_WISH, { each: 4, n: 18 });
    a.mark('typed');
    await a.hold(N(12), { turn: TURN9 });
    await a.box('go', '.command button[type="submit"]', 6);
    await a.press('.command button[type="submit"]', { n: 10, after: 2 });
    a.mark('go');
    const t0 = Date.now();
    const done = () => { const s = document.querySelector('.make-status')?.textContent || ''; return !/組んで、作れるか/.test(s) && document.querySelectorAll('.worklog li').length > 1; };
    const probe = () => document.querySelectorAll('.worklog li').length + (document.querySelector('.verdict-chip')?.textContent || '');
    await a.watch(done, probe, { per: 6, timeout: 600000, onChange: () => p.evaluate(() => { const w = document.querySelector('.worklog'); if (w) w.lastElementChild?.scrollIntoView({ block: 'end' }); }) });
    const secs = Math.round((Date.now() - t0) / 1000);
    await fine(a, 400);
    await blackVp9(a);
    a.mark('done'); await a.box('chip', '.verdict-chip', 6);
    const res = await p.evaluate(() => {
      const s = window.__studio.session; const b = s.built; const r = b.ring;
      return {
        chip: document.querySelector('.verdict-chip')?.innerText, probs: b.problems.map((x) => `${x.check} ${x.current} → ${x.required}`),
        specs: document.querySelector('.sb .specs')?.innerText.replace(/\s+/g, ' '),
        worklog: [...document.querySelectorAll('.worklog li')].map((l) => l.innerText.replace(/\s+/g, ' ')),
        numbers: { style: r.setting.style, prongs: r.setting.prongs?.length, prongMm: r.setting.prongs?.[0]?.diameterMm, tip: r.setting.prongs?.[0]?.tip, culetGapMm: r.culetGapMm },
        stone: s.stone, state: s.state,
      };
    });
    console.log('deco11 生成の終わり', JSON.stringify({ chip: res.chip, probs: res.probs, secs }), res.specs);
    if (res.probs.length) console.log('deco11 ！！ 作れます で終わっていない（この回は使わない）');
    console.log('deco11 作業の記録', res.worklog.join(' ／ '));
    // Claude を呼んだ回数と、道具を呼んだ回数（覚えた返事から数える）
    const dir = `${OUT}/_claude9/${CLAUDE_ALIAS[chName]}`;
    let calls = 0, tools = 0; const names = {};
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((x) => /^\d+\.json$/.test(x)).sort()) {
      calls++;
      try { const j = JSON.parse(JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')).body); for (const c of j.content || []) if (c.type === 'tool_use') { tools++; names[c.name] = (names[c.name] || 0) + 1; } } catch {}
    }
    fs.mkdirSync(`${OUT}/_deco`, { recursive: true });
    const stem = tag === 'deco11' ? `try${tryNo}` : `${tag}_try${tryNo}`;
    fs.writeFileSync(`${OUT}/_deco/${stem}.json`, JSON.stringify({ wish: DECO_WISH, try: Number(tryNo), cache: CLAUDE_ALIAS[chName], at: new Date().toISOString(), seconds: secs, apiCalls: calls, toolCalls: tools, toolNames: names, ...res }, null, 1));
    console.log('deco11 Claude', calls, '回・道具', tools, '回', JSON.stringify(names), secs, '秒');
    if (only) {
      // 形を見るための静止画（撮影のこまとは別。斜め・横・上）
      for (const [k, d] of [['angle', { x: 0.7, y: -0.62, z: 0.42 }], ['side', { x: 0.05, y: -1, z: 0.28 }], ['top', { x: 0.25, y: -0.35, z: 1 }]]) {
        await look9(a, d, 0.9);
        await p.screenshot({ path: `${OUT}/_deco/${stem}_${k}.png` });
      }
      await a.hold(N(10), { turn: TURN9 });
      return;
    }
    await a.hold(N(60), { turn: TURN9 });
    // 人が直す：確かめるへ
    await a.press('.tabs [data-mode="refine"]', { n: 18, after: 0, turn: TURN9 });
    await a.settle(700);
    await blackVp9(a);
    await frame11(a, { x: 0.62, y: -0.95, z: 0.62 }, 0.66, -170);
    a.mark('refine');
    await a.hold(N(16), { turn: 0.0008 });
    const n = await p.evaluate(() => window.__studio.session.built.ring.setting.prongs?.length || 0);
    if (n) {
      // 爪を押す（いちばん手前の爪）→ 太さのつまみを左へ（0.55 mm）
      const ps = [];
      for (let i = 0; i < n; i++) ps.push({ i, ...(await prongAt11(p, i)) });
      ps.sort((q, w) => q.dist - w.dist);
      const pr = ps[0];
      await a.press({ x: pr.x, y: pr.y }, { n: 22, after: 4 });
      a.mark('pop'); await a.box('pop', '.prong-pop', 6);
      await a.hold(N(20));
      const th = await p.evaluate(() => {
        const r = document.querySelector('.prong-pop .slider[data-s="pp-dia"] input[type=range]'); const b = r.getBoundingClientRect();
        const min = +r.min, max = +r.max, v = +r.value, half = 10;
        const X = (val) => b.x + half + ((val - min) / (max - min)) * (b.width - 2 * half);
        return { from: { x: X(v), y: b.y + b.height / 2 }, to: { x: X(0.55), y: b.y + b.height / 2 }, v };
      });
      await a.drag(th.from, th.to, { n: 30 });
      await fine(a, 200);
      a.mark('thin'); await a.box('chip2', '.verdict-chip', 6); await a.box('bad', '.prong-pop .pp-check', 6);
      console.log('deco11 細くした', await p.evaluate(() => document.querySelector('.verdict-chip')?.innerText), await p.evaluate(() => document.querySelector('.prong-pop .pp-check')?.innerText.replace(/\s+/g, ' ')));
      await a.hold(N(46));
      await a.press('.prong-pop .pp-x', { n: 14, after: 2 });
    } else {
      console.log('deco11 爪がない留め方（爪の流れは撮れない）');
    }
    await a.press('.verdict-chip', { n: 18, after: 2 });
    await a.settle(100);
    a.mark('reason'); await a.box('fix', '.fix-pop', 6);
    console.log('deco11 理由の窓', await p.evaluate(() => document.querySelector('.fix-pop')?.innerText.replace(/\s+/g, ' ')));
    await a.move({ x: 380, y: 560 }, 14);
    await a.hold(N(66), { hide: true });
    await a.move('.fix-pop .fp-every', 18);
    await a.shot({ rip: 1 });
    a.mark('press');
    await p.evaluate(() => document.querySelector('.fix-pop .fp-every').click());
    await a.shot({ rip: 0.65 }); await a.shot({ rip: 0.3 });
    await a.until(() => !window.__studio.session.pendingFinal, null, { label: '細かい形', chunk: 50 });
    await a.settle(200);
    await blackVp9(a);
    a.mark('fixed'); await a.box('chip3', '.verdict-chip', 6);
    console.log('deco11 直した', await p.evaluate(() => document.querySelector('.verdict-chip')?.innerText), await specsText(p));
    await a.hold(N(50), { turn: 0.0008 });
    await a.press('.disp [data-disp="draw"]', { n: 20, after: 2 });
    await a.settle(1200);
    a.mark('draw'); await a.box('vp', '.vp', 0);
    await a.hold(N(50));
    await hideToast.evaluate((e) => e.remove());
    await a.press('.act-stl', { n: 22, after: 2 });
    await a.settle(200);
    a.mark('stl'); await a.box('toast', '.toast', 6);
    console.log('deco11 STL', await p.evaluate(() => document.querySelector('.toast')?.innerText));
    await a.hold(N(46), { hide: true });
};
Object.assign(CH, { deco11: genChapter('deco11'), gen12: genChapter('gen12') });
// 模様の試し（別の係が作った頁。#waza/rebuild/moyou?rec）：頁の全体 → 段が 1 つずつ出る → 最後の鐔の形の 3 枚（寄るのは組むとき）
Object.assign(CH, {
  moyou11: async (a) => {
    const { p } = a;
    await p.goto(`${BASE}/app.html?rec#waza/rebuild/moyou`, { waitUntil: 'load' });
    await a.settle(1500);
    await p.addStyleTag({ content: APP_CSS10 });
    await a.settle(300);
    a.mark('full'); await a.box('head', '.moyou h2, .moyou h1', 6);
    console.log('moyou11 段', await p.evaluate(() => document.querySelector('.moyou')?.dataset.step));
    await a.hold(N(36), { hide: true });
    for (let k = 1; k <= 5; k++) {
      await p.keyboard.press('ArrowRight');
      a.mark(`s${k}`);
      await a.hold(N(k === 5 ? 60 : 45), { hide: true });
    }
    await p.keyboard.press('ArrowRight');
    a.mark('final');
    await a.hold(N(40), { hide: true });
    a.mark('finalIn'); await a.box('final', '.moyou .mo-final', 0);
    const bigs = await p.evaluate(() => [...document.querySelectorAll('.moyou .mo-final .mo-big')].map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }));
    console.log('moyou11 3 枚', JSON.stringify(bigs), await p.evaluate(() => [window.scrollY, document.documentElement.scrollHeight]));
    bigs.forEach((b, i) => a.boxRaw(`big${i}`, b.x, b.y, b.w, b.h));
    await a.hold(N(150), { hide: true });
  },
});
// 動かない画面（時計は本物のまま。Claude は呼ばない）
const STILLS9 = {
  // 毛彫り：本当の帳面のまま（?rec&flow）。作者の言葉「線の幅と深さ」。学ぶ人が聞く → 帳面から答える（合言葉なし）
  kebori9: [[480, 900], 4, async (s) => {
    const { p } = s;
    await p.goto(`${BASE}/app.html?rec&flow#waza/kebori`, { waitUntil: 'load' });
    await s.wait(1500);
    await p.addStyleTag({ content: 'header.bar{display:none!important} body{background:#101012!important}' });
    await s.hideFixed();
    await p.evaluate(() => window.scrollTo(0, 0));
    await s.shot('top');
    await s.box('guide', '.fl-guide, .flow-guide, .fl-steps', 8);
    await p.evaluate(() => { const h = [...document.querySelectorAll('h3, h4')].find((x) => /帳面に残った決まり/.test(x.innerText)); h?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -20); });
    await s.wait(300);
    await s.shot('rule');
    await s.box('ruleHead', 'h3:has-text("帳面に残った決まり"), h4:has-text("帳面に残った決まり")', 0);
    console.log('kebori9 決まり', await p.evaluate(() => document.querySelector('.rule-cards li, .rc')?.innerText.replace(/\s+/g, ' ')));
    await p.evaluate(() => { const h = [...document.querySelectorAll('h3, h4')].find((x) => /手本を残す/.test(x.innerText)); h?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -20); });
    await s.wait(300);
    await s.shot('model');
    await p.goto(`${BASE}/app.html?rec&flow#learn/kebori`, { waitUntil: 'load' });
    await s.wait(1200);
    await p.addStyleTag({ content: 'header.bar{display:none!important} body{background:#101012!important}' });
    await s.hideFixed();
    await p.fill('.composer textarea', '毛彫りの線の幅と深さは？');
    await s.shot('ask');
    await p.evaluate(() => document.querySelector('.composer .send').click());
    await s.wait(700);
    const nopass = p.locator('dialog[open] button', { hasText: '合言葉なしで使う' });
    if (await nopass.count()) { await nopass.first().click(); await s.wait(500); }
    await p.waitForSelector('.thread .a-short');
    await s.wait(500);
    await s.hideFixed();
    await p.addStyleTag({ content: '.composer,.composer-wrap{display:none!important}' });
    await p.evaluate(() => { document.querySelector('.thread')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -20); });
    await s.wait(300);
    await s.shot('answer');
    await s.box('thread', '.thread', 0);
    console.log('kebori9 答え', await p.evaluate(() => document.querySelector('.thread')?.innerText.replace(/\s+/g, ' ')));
  }],
  // 手を比べる：作り話の見本（?rec&mihon）。画面に「見本・作り話」が出ている。Claude は呼ばない
  hands9: [[480, 900], 4, async (s) => {
    const { p } = s;
    await p.goto(`${BASE}/app.html?rec&mihon#waza/kebori?step=model`, { waitUntil: 'load' });
    await s.wait(1500);
    await p.waitForSelector('.use-mihon-model', { timeout: 15000 });
    await p.evaluate(() => document.querySelector('.use-mihon-model').click());
    await s.wait(1200);
    await p.evaluate(() => { location.hash = '#learn/hands/kebori'; });
    await s.wait(1500);
    await p.waitForSelector('.try-sample', { timeout: 15000 });
    await p.evaluate(() => document.querySelector('.try-sample').click());
    await p.waitForSelector('.result .verdict', { timeout: 120000 });
    await s.wait(2000);
    await s.hideFixed();
    await p.evaluate(() => { document.querySelector('.result')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -20); });
    await s.wait(500);
    await s.shot('result');
    console.log('hands9 結果', await p.evaluate(() => document.querySelector('.result')?.innerText.replace(/\s+/g, ' ').slice(0, 300)));
    await p.evaluate(() => { window.scrollTo(0, 0); });
    await s.wait(300);
    await s.shot('top');
  }],
  // 途切れた技：分かることを入れて、職人の帳面も渡す（例は作り話。画面に「これは作り話の例です」）
  restore9: [[480, 900], 4, async (s) => {
    const { p } = s;
    await p.goto(`${BASE}/app.html#waza/restore`, { waitUntil: 'load' });
    await s.wait(1500);
    await p.addStyleTag({ content: 'header.bar{display:none!important} body{background:#101012!important}' });
    await s.hideFixed();
    await p.evaluate(() => document.querySelector('.rs-sample')?.click());
    await s.wait(1500);
    await s.hideFixed();
    await p.evaluate(() => document.querySelector('.rs-flow button[data-view="1"]')?.click());
    await s.wait(800);
    await p.evaluate(() => { const c = document.querySelector('.rs-book-on'); if (c && !c.checked) c.click(); });
    await s.wait(500);
    await p.evaluate(() => window.scrollTo(0, 0));
    await s.shot('flow');
    await p.evaluate(() => { document.querySelector('.rs-book')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -24); });
    await s.wait(400);
    await s.shot('book');
    await s.box('bookCard', '.rs-book', 0);
    console.log('restore9 帳面', await p.evaluate(() => document.querySelector('.rs-book')?.innerText.replace(/\s+/g, ' ')), '／', await p.evaluate(() => document.querySelector('.rs-book-on')?.checked));
    console.log('restore9 分かること', await p.evaluate(() => [...document.querySelectorAll('.rs-facts > li')].map((x) => x.innerText.replace(/\s+/g, ' ').slice(0, 50)).join(' ／ ')));
  }],
  // 答えの分かっている技で試す（木目金）：渡した手がかりの一覧。技の名前と本当の作り方は渡さない
  rebuild9: [[480, 900], 4, async (s) => {
    const { p } = s;
    await p.goto(`${BASE}/app.html#waza/rebuild`, { waitUntil: 'load' });
    await s.wait(1500);
    await p.addStyleTag({ content: 'header.bar{display:none!important} body{background:#101012!important}' });
    await s.hideFixed();
    await p.evaluate(() => { document.querySelector('details.clues').open = true; });
    await s.wait(300);
    await p.evaluate(() => { document.querySelector('.tp-block')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -16); });
    await s.wait(300);
    await s.shot('top');
    await p.evaluate(() => { document.querySelector('details.clues')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -16); });
    await s.wait(300);
    await s.shot('clues');
    await s.box('cluesBox', 'details.clues', 0);
    console.log('rebuild9', await p.evaluate(() => [...document.querySelectorAll('details.clues .clue-list li span')].map((x) => x.innerText).join(' ・ ')));
  }],
};
(async () => {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CH);
  for (const n of names) {
    if (STILLS9[n]) { const [v, k, fn] = STILLS9[n]; await stills9(n, v, k, fn); continue; }
    if (!CH[n]) { console.log('ない章', n); continue; }
    await chapter(n, CH[n]);
  }
})();
