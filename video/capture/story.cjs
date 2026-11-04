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
const OUT = `${SP}/story`;
const PY = process.env.PY || path.join(__dirname, '..', 'work', '.venv', 'bin', 'python');
// 3D を GPU で描く（ないと 1 こま 2 秒かかる。あると 5 ミリ秒）
const GPU = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

// マウスの印：矢印（自作の線）と、押したときの輪
const CURSOR_CSS = `#__cur{position:fixed;left:-60px;top:-60px;width:26px;height:30px;margin:-3px 0 0 -5px;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
#__rip{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:2.5px solid rgba(255,255,255,.95);box-shadow:0 0 0 1px rgba(0,0,0,.25),0 0 14px rgba(255,255,255,.35);z-index:2147483646;pointer-events:none;opacity:0}`;
const ARROW = `<svg width="26" height="30" viewBox="0 0 26 30"><path d="M5 3v20.5l5.2-4.9 3.6 8.2 3.6-1.6-3.6-8.1h7.1z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

async function chapter(name, fn) {
  const D = `${OUT}/${name}/`;
  fs.rmSync(D, { recursive: true, force: true });
  fs.mkdirSync(D, { recursive: true });
  const b = await chromium.launch({ args: GPU });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('tsugu.password.v1', 'dev-local'); } catch {} });
  await ctx.addInitScript(VT.INIT);
  const p = await ctx.newPage();
  p.setDefaultTimeout(120000);
  p.on('pageerror', (e) => console.log(name, 'pageerror', e.message));
  let i = 0;
  let cur = { x: 1480, y: 860 };
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
      await p.evaluate(({ x, y, rip, turn, hide }) => {
        const c = document.getElementById('__cur'); c.style.left = x + 'px'; c.style.top = y + 'px'; c.style.opacity = hide ? '0' : '1';
        const r = document.getElementById('__rip'); r.style.left = x + 'px'; r.style.top = y + 'px'; r.style.opacity = String(rip); r.style.transform = `scale(${1.6 - rip * 0.9})`;
        if (turn && window.__viewer) window.__viewer.turn(turn);
        return window.__vt.step(1000 / 30);
      }, { ...cur, rip, turn, hide });
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
  fs.writeFileSync(`${D}meta.json`, JSON.stringify({ frames: i, marks, boxes, cur: curs }));
  await b.close();
  execFileSync(PY, ['-I', path.join(__dirname, 'tojpg.py'), D], { stdio: 'inherit' });
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
const workshopB = async (a) => {
  const { p } = a;
  await p.click('.tabs [data-mode="refine"]'); await a.settle(800);
  await p.evaluate(() => { const s = document.querySelector('.ws-pick'); s.value = '__new'; s.dispatchEvent(new Event('change')); });
  await a.settle(300); await p.fill('.ws-name', '工房 B'); await p.click('.ws-make'); await a.settle(2500);
  await p.evaluate(() => { document.querySelector('.manual-rule').open = true; });
  await p.selectOption('.mr-param', 'hold.cornerSet'); await p.fill('.mr-value', '1'); await p.fill('.mr-quote', '三角の石は、角に 1 本ずつの 3 本で留まる');
  await p.click('.mr-go'); await a.settle(2500);
  await p.evaluate(() => { document.querySelector('.manual-rule').open = false; document.querySelector('.studio-refine').scrollTop = 0; });
  await a.settle(800);
};
const refine = async (a) => { await a.p.click('.tabs [data-mode="refine"]'); await a.settle(1000); };
const openManual = async (a) => {
  if (!(await a.p.locator('details.manual[open]').count())) { await a.p.click('details.manual > summary'); await a.settle(500); }
};
const specsText = (p) => p.evaluate(() => document.querySelector('.sb .specs')?.innerText.replace(/\s+/g, ' '));

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
      if (/石座を組む|覆輪を作る|ロウ付け/.test(title || '') && (await p.locator(sel + ' details.more > summary').count())) {
        await a.hold(10);
        await a.press(sel + ' details.more > summary', { n: 12, after: 4 });
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
  // 最終案 2：ほかの技。技の一覧（6 つの技の帳面）→ 鏨彫り・毛彫り → Claude の質問
  waza2: async (a) => {
    const { p } = a;
    await p.goto(`${BASE}/app.html?nointro#waza`, { waitUntil: 'load' });
    await a.settle(1500);
    await a.box('list', '.view.waza', 0); a.mark('list');
    await a.hold(16);
    await a.scroll('.pub-sec-h', { block: 'start', n: 24, offset: 20 });
    await a.box('others', '.pub-sec-h + .big-techs', 10); a.mark('others');
    await a.hold(20);
    await a.press('.big-tech[href="#waza/kebori"]', { n: 14, after: 2 });
    await a.until(() => { const q = document.querySelector('.iv-q'); return q && !q.classList.contains('pending'); }, null, { label: '毛彫りの問い', timeout: 120000 });
    await a.settle(300);
    await p.evaluate(() => window.scrollTo(0, 0)); await a.settle(200);
    await a.box('kebori', '.view', 0); await a.box('ask', '.iv-root, .iv', 10); a.mark('ask');
    console.log('waza2 の問い', await p.evaluate(() => document.querySelector('.iv-q')?.innerText));
    await a.hold(50);
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

(async () => {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CH);
  for (const n of names) {
    if (!CH[n]) { console.log('ない章', n); continue; }
    await chapter(n, CH[n]);
  }
})();
