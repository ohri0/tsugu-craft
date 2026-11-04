// 一つの指輪の物語として、継ぐの本物の画面を一歩ずつ操作し、2 倍の細かさで 1 こまずつ撮る（1600×900 → 3200×1800）。
// 形の組み直しや Claude の返事を待つ間は撮らない（中身は同じ操作）。見せたい所の枠（boxes）をこまごとに残し、
// あとで camera.py が、その枠へなめらかに動くカメラを付ける。node capture/story.cjs 章…（なしなら全部）
// 作者の声：画面を並べるのでなく、一つの物が流れるように。字まで読めるように（2026-11-04）。
const { chromium, SP, BASE } = require('../paths.cjs');
const fs = require('fs');
const OUT = `${SP}/story`;

const CURSOR_CSS = `#__cur{position:fixed;left:-40px;top:-40px;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:rgba(255,255,255,.95);box-shadow:0 0 0 1.5px rgba(0,0,0,.55),0 2px 8px rgba(0,0,0,.45);z-index:2147483647;pointer-events:none}
#__rip{position:fixed;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;border:2px solid rgba(255,255,255,.95);box-shadow:0 0 0 1px rgba(0,0,0,.3);z-index:2147483646;pointer-events:none;opacity:0}`;

async function chapter(name, fn) {
  const D = `${OUT}/${name}/`; fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('tsugu.password.v1', 'dev-local'); } catch {} });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(name, 'pageerror', e.message));
  let i = 0; let cur = { x: 1500, y: 860 }; const boxes = {}; const marks = {};
  const ensureCursor = () => p.evaluate((css) => {
    if (!document.getElementById('__curcss')) { const s = document.createElement('style'); s.id = '__curcss'; s.textContent = css; document.head.appendChild(s); }
    for (const id of ['__cur', '__rip']) if (!document.getElementById(id)) { const e = document.createElement('div'); e.id = id; document.body.appendChild(e); }
  }, CURSOR_CSS);
  const api = {
    p,
    /** 1 こま撮る。rip：押した波紋の濃さ */
    shot: async (rip = 0, turn = 0) => {
      await ensureCursor();
      await p.evaluate(({ x, y, rip, turn }) => {
        const c = document.getElementById('__cur'); c.style.left = x + 'px'; c.style.top = y + 'px';
        const r = document.getElementById('__rip'); r.style.left = x + 'px'; r.style.top = y + 'px'; r.style.opacity = String(rip); r.style.transform = `scale(${1.5 - rip})`;
        if (turn && window.__viewer) window.__viewer.turn(turn);
      }, { ...cur, rip, turn });
      await p.waitForTimeout(20);
      await p.screenshot({ path: `${D}${String(i++).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
    },
    hold: async (n, turn = 0) => { for (let k = 0; k < n; k++) await api.shot(0, turn); },
    mark: (k) => { marks[k] = i; },
    /** 見せたい所の枠を、今のこまに残す（ページの px。2 倍の画像では ×2） */
    box: async (k, sel, pad = 12) => {
      const bx = await p.locator(sel).first().boundingBox();
      if (bx) boxes[k] = { f: i, x: bx.x - pad, y: bx.y - pad, w: bx.width + pad * 2, h: bx.height + pad * 2 };
      else console.log(name, '枠が見つからない', sel);
    },
    boxRaw: (k, x, y, w, h) => { boxes[k] = { f: i, x, y, w, h }; },
    move: async (sel, n = 14) => {
      const bx = await p.locator(sel).first().boundingBox();
      if (!bx) { console.log(name, '見つからない', sel); return null; }
      const to = { x: bx.x + bx.width / 2, y: bx.y + bx.height / 2 }; const from = { ...cur };
      for (let k = 1; k <= n; k++) { const u = k / n; const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; cur = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e }; await api.shot(); }
      return bx;
    },
    /** 押す：動いて、押した波紋。押した後の組み直しは撮らない（wait ミリ秒待つ） */
    press: async (sel, { n = 14, wait = 600, js = false } = {}) => {
      if (!(await api.move(sel, n))) return;
      await api.shot(0.9);
      if (js) await p.evaluate((s) => document.querySelector(s).click(), sel); else await p.click(sel);
      await p.waitForTimeout(wait);
      await p.evaluate(() => window.__studio?.session?.flush?.());
      await api.shot(0.6); await api.shot(0.3);
    },
    /** 打つ：1 字ずつ、each こまずつ */
    type: async (sel, text, each = 2) => {
      await api.press(sel, { wait: 150 });
      for (const ch of text) { await p.keyboard.type(ch); for (let k = 0; k < each; k++) await api.shot(); }
    },
    settle: async (ms = 800) => { await p.waitForTimeout(ms); await p.evaluate(() => window.__studio?.session?.flush?.()); },
  };
  try { await fn(api); } catch (e) { console.log(name, 'しくじり', e.message); }
  fs.writeFileSync(`${D}meta.json`, JSON.stringify({ frames: i, marks, boxes }));
  console.log(name, i, 'こま', JSON.stringify(marks));
  await b.close();
}

const studio = async (p) => {
  await p.goto(`${BASE}/studio.html?nointro`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__studio?.session?.built, null, { timeout: 180000 });
  await p.waitForTimeout(800);
};
/** 工房 B（ネットの公開情報だけの帳面）を作り、三角の角の決まりだけ入れておく（撮らない） */
const workshopB = async (p) => {
  await p.click('.tabs [data-mode="refine"]'); await p.waitForTimeout(800);
  await p.evaluate(() => { const s = document.querySelector('.ws-pick'); s.value = '__new'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300); await p.fill('.ws-name', '工房 B'); await p.click('.ws-make'); await p.waitForTimeout(2500);
  await p.evaluate(() => { document.querySelector('.manual-rule').open = true; });
  await p.selectOption('.mr-param', 'hold.cornerSet'); await p.fill('.mr-value', '1'); await p.fill('.mr-quote', '三角の石は、角に 1 本ずつの 3 本で留まる');
  await p.click('.mr-go'); await p.waitForTimeout(2500);
  await p.evaluate(() => { document.querySelector('.manual-rule').open = false; document.querySelector('.studio-refine').scrollTop = 0; });
  await p.waitForTimeout(800);
};

const CH = {
  // 職人の一言：太い爪の指輪 → 言葉を打つ → Claude の案 → これでいい → 爪が変わる
  word: async (a) => {
    const { p } = a;
    await studio(p); await workshopB(p);
    await a.box('ring', '.vp', 0); a.mark('start');
    await a.hold(30, 0.004);
    await p.locator('.ar-text').scrollIntoViewIfNeeded(); await a.settle(300);
    await a.box('field', '.rules-sec', 8); a.mark('type');
    await a.type('.ar-text', 'この大きさの石なら、爪は最低 0.7 ミリ、基本は 0.8 から 1 ミリくらい。細すぎると曲がって石が落ちる。', 2);
    await a.hold(8);
    a.mark('go');
    await a.press('.ar-go', { wait: 300 });
    await p.waitForFunction(() => /これでいい/.test(document.querySelector('.ar-proposal')?.innerText || ''), null, { timeout: 150000 });
    await a.box('proposal', '.ar-proposal', 10); a.mark('proposal');
    await a.hold(40);
    await a.press('.ar-proposal button:has-text("これでいい")', { wait: 2500 });
    await a.settle(1500);
    await p.evaluate(() => document.querySelector('.rule-flash')?.scrollIntoView({ block: 'start' })); await a.settle(400);
    await a.box('ring2', '.vp', 0); await a.box('flash', '.rule-flash', 10); a.mark('after');
    await a.hold(60, 0.004);
  },
  // 確かめる：爪を細くしていくと、赤く光る。赤い所を押すと理由
  thin: async (a) => {
    const { p } = a;
    await studio(p);
    await p.click('.tabs [data-mode="refine"]'); await a.settle(1000);
    if (!(await p.locator('details.manual[open]').count())) { await p.click('details.manual > summary'); await a.settle(500); }
    await p.locator('.slider[data-s="r-prong"]').scrollIntoViewIfNeeded(); await a.settle(300);
    await a.box('slider', '.slider[data-s="r-prong"]', 16); await a.box('ring', '.vp', 0); a.mark('start');
    for (let k = 0; k < 7; k++) { await a.press('.slider[data-s="r-prong"] .sl-step[data-d="-1"]', { n: k ? 4 : 14, wait: 500 }); await a.hold(3); }
    a.mark('red');
    await p.evaluate(() => document.querySelector('.studio-refine').scrollTop = 0); await a.settle(400);
    await a.box('probs', '.probs', 10);
    await a.hold(45, 0.003);
  },
  // 描く：腕の断面を指で動かす → 薄すぎると赤
  section: async (a) => {
    const { p } = a;
    await studio(p);
    await p.click('.tabs [data-mode="refine"]'); await a.settle(1000);
    if (!(await p.locator('details.manual[open]').count())) { await p.click('details.manual > summary'); await a.settle(500); }
    await p.locator('.sec-edit').scrollIntoViewIfNeeded(); await a.settle(500);
    await a.box('editor', '.sec-edit', 10); await a.box('ring', '.vp', 0); a.mark('start');
    const dot = (await p.locator('.sec-edit .se-handles .dot, .sec-edit .hit').count()) > 1 ? p.locator('.sec-edit .se-handles .dot, .sec-edit .hit').nth(1) : p.locator('.sec-edit .se-handles .dot, .sec-edit .hit').first();
    const bx = await dot.boundingBox();
    const sx = bx.x + bx.width / 2, sy = bx.y + bx.height / 2;
    await a.move('.sec-edit', 12);
    await p.mouse.move(sx, sy); await p.mouse.down();
    for (let k = 1; k <= 40; k++) { const u = k / 40; const x = sx + 30 * Math.sin(u * Math.PI) , y = sy + 60 * u; await p.mouse.move(x, y); await a.settle(120); await p.evaluate(({ x, y }) => { const c = document.getElementById('__cur'); if (c) { c.style.left = x + 'px'; c.style.top = y + 'px'; } }, { x, y }); await a.shot(0.4); }
    await p.mouse.up(); await a.settle(2500);
    a.mark('red');
    await a.hold(40, 0.003);
  },
  // 見せる：全画面の黒。押して切り替える
  present: async (a) => {
    const { p } = a;
    await studio(p);
    await p.evaluate(() => [...document.querySelectorAll('.presets button')].find((x) => x.textContent.trim() === 'ラウンド').click()); await a.settle(7000);
    await p.evaluate(() => window.__studio.session.setShank({ metal: 'pt900', reason: 'story' })); await a.settle(1200);
    a.mark('start');
    await a.press('.act-present', { wait: 2500 });
    await p.evaluate(() => { window.__viewer.setAutoRotate(false); });
    await a.box('panel', '.pr-panel', 20); a.mark('present');
    await a.hold(30, 0.006);
    for (const v of ['5', '8', '10', '6.5']) { await a.press(`.pr-opt button[data-v="${v}"]`, { n: 10, wait: 1200 }); await a.hold(16, 0.006); }
    await a.press('.pr-tabs button[data-g="section"]', { n: 8, wait: 200 });
    for (const v of ['hirauchi', 'kaku', 'kouman']) { await a.press(`.pr-opt button[data-v="${v}"]`, { n: 8, wait: 1200 }); await a.hold(14, 0.006); }
    await a.press('.pr-tabs button[data-g="setting"]', { n: 8, wait: 200 });
    for (const v of ['6', 'bezel', '4']) { await a.press(`.pr-opt button[data-v="${v}"]`, { n: 8, wait: 1500 }); await a.hold(16, 0.006); }
    await a.press('.pr-tabs button[data-g="metal"]', { n: 8, wait: 200 });
    for (const v of ['k18yg', 'k18pg', 'pt900']) { await a.press(`.pr-opt button[data-v="${v}"]`, { n: 8, wait: 1000 }); await a.hold(14, 0.006); }
    a.mark('end');
  },
  // Claude が聞きに来る：質問 → 答えを打つ → 案 → 帳面に入れる
  ask: async (a) => {
    const { p } = a;
    await p.goto(`${BASE}/app.html?nointro#waza/ring`, { waitUntil: 'networkidle' });
    await p.waitForFunction(() => /Claude が聞いています/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
    await p.waitForFunction(() => document.querySelector('.iv-q')?.innerText.length > 5, null, { timeout: 90000 }).catch(() => {});
    await a.settle(1500);
    await a.box('card', '.iv-q', 120); a.mark('question');
    await a.hold(30);
    await a.type('textarea[aria-label="答え"]', '5.5 ミリくらいの石なら、0.65 ミリはほしい', 2);
    await a.hold(8);
    await a.press('button.make', { wait: 300 });
    await p.waitForFunction(() => /帳面に入れる/.test(document.body.innerText), null, { timeout: 150000 });
    await a.settle(500);
    await a.box('draft', 'button[data-a="ok"]', 260); a.mark('draft');
    await a.hold(40);
    await a.press('button[data-a="ok"]', { wait: 1500 });
    a.mark('saved');
    await a.hold(30);
  },
  // 作り方：工程のカード → 詳しく → 言葉を押すと意味 → 図面
  make: async (a) => {
    const { p } = a;
    await studio(p);
    await a.press('.tabs [data-mode="hand"]', { wait: 1500 });
    await a.box('cards', '.build-panel', 0); a.mark('cards');
    await a.hold(24);
    await a.press('.build-panel button:has-text("詳しく"), .build-panel summary:has-text("詳しく")', { wait: 600 });
    await a.hold(16);
    await a.press('.build-panel .term', { wait: 500 });
    await a.hold(30);
    a.mark('draw');
    await a.press('.disp [data-disp="draw"]', { wait: 3500 });
    await a.box('sheet', '.vp', 0);
    await a.hold(40);
  },
};

(async () => {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CH);
  for (const n of names) await chapter(n, CH[n]);
})();
