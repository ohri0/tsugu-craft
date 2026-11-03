// デモの本物の画面を、操作しているところごと録る（マウスの印つき）。node capture/demo.cjs [場面…]（なしなら全部）
// 作者の声：コンセプトの動画ではなくデモ。説明と同時に、本当に動いている画面を見せる（2026-11-03）。
// 録る大きさは 1600×900（画面の字が小さくなりすぎないように）。組むときに 1920×1080 へ広げる。
const { chromium, SP, BASE } = require('../paths.cjs');
const fs = require('fs');
const D = `${SP}/vc/demo`;
fs.mkdirSync(D, { recursive: true });
const W = 1600, H = 900;

// マウスの印（白い丸。押すと波紋）。録画にはマウスが映らないので、ページの中に描く
const CURSOR = () => {
  const add = () => {
    if (document.getElementById('__cur')) return;
    const st = document.createElement('style');
    st.textContent = `#__cur{position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(255,255,255,.92);box-shadow:0 0 0 1.5px rgba(0,0,0,.55),0 2px 10px rgba(0,0,0,.4);z-index:2147483647;pointer-events:none;transition:transform .12s}
    #__cur.down{transform:scale(.72)}
    .__rip{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:2px solid rgba(255,255,255,.9);z-index:2147483646;pointer-events:none;animation:__r .5s ease-out forwards}
    @keyframes __r{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}`;
    document.head.appendChild(st);
    const c = document.createElement('div'); c.id = '__cur'; document.body.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', (e) => { c.classList.add('down'); const r = document.createElement('div'); r.className = '__rip'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 600); }, true);
    addEventListener('mouseup', () => c.classList.remove('down'), true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', add); else add();
};

let mouse = { x: W / 2, y: H / 2 };
// 録画の中の時刻（秒）に印を付ける。組むときに、どこから切り出すかをこれで決める
let t0 = 0; let marks = {};
const M = (label) => { marks[label] = Number(((Date.now() - t0) / 1000).toFixed(2)); };
async function moveTo(p, sel, opts = {}) {
  const el = typeof sel === 'string' ? p.locator(sel).first() : sel;
  await el.scrollIntoViewIfNeeded().catch(() => {});
  const b = await el.boundingBox();
  if (!b) throw new Error('見つからない：' + sel);
  const x = b.x + b.width * (opts.fx ?? 0.5), y = b.y + b.height * (opts.fy ?? 0.5);
  await p.mouse.move(x, y, { steps: opts.steps ?? 28 });
  mouse = { x, y };
  return b;
}
async function click(p, sel, opts) {
  await moveTo(p, sel, opts);
  await p.waitForTimeout(180);
  await p.mouse.down(); await p.waitForTimeout(90); await p.mouse.up();
  await p.waitForTimeout(opts?.after ?? 600);
}
async function type(p, sel, text, delay = 70) {
  await click(p, sel, { after: 200 });
  await p.keyboard.type(text, { delay });
}
/** つまみを from から to の値までなめらかにドラッグ */
async function drag(p, rangeSel, from, to, ms = 4000) {
  const el = p.locator(rangeSel).first();
  await el.scrollIntoViewIfNeeded();
  const b = await el.boundingBox();
  const [min, max] = await el.evaluate((r) => [Number(r.min), Number(r.max)]);
  const at = (v) => b.x + 12 + (b.width - 24) * ((v - min) / (max - min));
  const y = b.y + b.height / 2;
  await p.mouse.move(at(from), y, { steps: 24 });
  await p.waitForTimeout(250);
  await p.mouse.down();
  const n = Math.round(ms / 50);
  for (let i = 1; i <= n; i++) {
    const u = i / n; const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    await p.mouse.move(at(from + (to - from) * e), y);
    await p.waitForTimeout(50);
  }
  await p.mouse.up();
}
const studioReady = async (p, q = '?nointro') => {
  await p.goto(`${BASE}/studio.html${q}`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__studio?.session?.built, null, { timeout: 120000 });
  await p.waitForTimeout(1200);
};

async function clip(name, fn) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: D, size: { width: W, height: H } } });
  await ctx.addInitScript(CURSOR);
  const p = await ctx.newPage();
  t0 = Date.now(); marks = {};
  p.on('pageerror', (e) => console.log(name, 'pageerror', e.message));
  try { await fn(p); } catch (e) { console.log(name, 'しくじり', e.message); }
  await p.waitForTimeout(800);
  M('end'); fs.writeFileSync(`${D}/${name}.json`, JSON.stringify(marks));
  const v = p.video(); await ctx.close(); fs.renameSync(await v.path(), `${D}/${name}.webm`); await b.close(); console.log(name, JSON.stringify(marks));
}

const CLIPS = {
  // 本物の Claude：公開情報だけの帳面（工房 B）で、職人の言葉を打つ → Claude が決まりの案にする → 「これでいい」で指輪が変わる
  // 開発用のサーバー（npm run dev。.env にキー）で録る。合言葉はこのパソコンの試し用
  claude: async (p) => {
    await p.addInitScript(() => { try { localStorage.setItem('tsugu.password.v1', 'dev-local'); } catch {} });
    await studioReady(p);
    await click(p, '.tabs [data-mode="refine"]', { after: 1500 });
    await p.evaluate(() => { const s = document.querySelector('.ws-pick'); s.value = '__new'; s.dispatchEvent(new Event('change')); });
    await p.waitForTimeout(600);
    await type(p, '.ws-name', '工房 B', 90);
    await click(p, '.ws-make', { after: 2500 });
    // 工房 B には、前に「三角の石は角に 3 本で留まる」を入れてあった、という形から始める（ここは録った動画では使わない）
    await p.evaluate(() => { document.querySelector('.manual-rule').open = true; });
    await p.selectOption('.mr-param', 'hold.cornerSet');
    await p.fill('.mr-value', '1');
    await p.fill('.mr-quote', '三角の石は、角に 1 本ずつの 3 本で留まる');
    await p.click('.mr-go'); await p.waitForTimeout(2500);
    await p.evaluate(() => { document.querySelector('.manual-rule').open = false; window.scrollTo(0, 0); });
    await p.waitForTimeout(1500);
    M('thick');
    await p.locator('.ar-text').scrollIntoViewIfNeeded();
    await type(p, '.ar-text', 'この大きさの石なら、爪は最低 0.7 ミリ、基本は 0.8 から 1 ミリくらい。細すぎると曲がって石が落ちる。', 55);
    M('go');
    await click(p, '.ar-go', { after: 300 });
    await p.waitForFunction(() => { const e = document.querySelector('.ar-proposal'); return e && /これでいい/.test(e.innerText); }, null, { timeout: 150000 });
    M('proposal');
    await p.waitForTimeout(2500);
    await click(p, '.ar-proposal button:has-text("これでいい")', { after: 300 });
    M('accept');
    await p.waitForTimeout(5000);
  },
  // 本物の Claude：帳面の足りない所を、Claude が言い直して聞きに来る
  claudeAsk: async (p) => {
    await p.addInitScript(() => { try { localStorage.setItem('tsugu.password.v1', 'dev-local'); } catch {} });
    await p.goto(`${BASE}/app.html?nointro#waza`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(2000);
    M('start');
    await moveTo(p, 'text=Claude から質問が 1 つあります');
    await p.waitForTimeout(2000);
    await click(p, 'a[href="#waza/ring"], button:has-text("聞き取り")', { after: 6000 });
    M('asked');
    await p.waitForTimeout(3000);
  },
  // 公開情報だけの帳面（工房 B）に、職人の一言を数字で入れると、爪が細くなって作れる形になる
  rule: async (p) => {
    await studioReady(p);
    M('start');
    await click(p, '.tabs [data-mode="refine"]', { after: 1500 });
    await p.evaluate(() => { const s = document.querySelector('.ws-pick'); s.value = '__new'; s.dispatchEvent(new Event('change')); });
    await p.waitForTimeout(800);
    await type(p, '.ws-name', '工房 B', 90);
    await click(p, '.ws-make', { after: 2500 });
    M('thick');
    await click(p, '.manual-rule > summary', { after: 900 });
    await p.selectOption('.mr-param', 'prong.minDiameterMm');
    await type(p, '.mr-value', '0.7', 140);
    await type(p, '.mr-quote', 'この大きさなら、爪は基本 0.8〜1 mm', 60);
    await p.waitForTimeout(400);
    M('go');
    await click(p, '.mr-go', { after: 4500 });
  },
  // 爪を細くしすぎると、赤く光る（シェードの灰色の画面で）。赤い所を押す
  thin: async (p) => {
    await studioReady(p);
    await click(p, '.tabs [data-mode="refine"]', { after: 1500 });
    if (!(await p.locator('details.manual[open]').count())) await click(p, 'details.manual > summary', { after: 800 });
    M('start');
    for (let i = 0; i < 7; i++) await click(p, '.slider[data-s="r-prong"] .sl-step[data-d="-1"]', { after: 650, steps: i ? 6 : 28 });
    M('red');
    await p.waitForTimeout(1500);
    await moveTo(p, '.probs li:first-child');
    await p.waitForTimeout(2500);
  },
  // 石の大きさのつまみを動かすと、爪も帳面の決まりで変わる（ラウンド）
  size: async (p) => {
    await studioReady(p);
    await click(p, '.presets button:has-text("ラウンド")', { after: 6000 });
    await click(p, '.tabs [data-mode="refine"]', { after: 1500 });
    if (!(await p.locator('details.manual[open]').count())) await click(p, 'details.manual > summary', { after: 800 });
    await p.locator('.slider[data-s="r-stone"]').scrollIntoViewIfNeeded();
    M('start');
    await drag(p, '.slider[data-s="r-stone"] input[type=range]', 6.5, 5.2, 1500);
    await p.waitForTimeout(2500);
    await drag(p, '.slider[data-s="r-stone"] input[type=range]', 5.2, 8.2, 4500);
    await p.waitForTimeout(3500);
  },
  // 作る：工程・数字・道具・詳しく・言葉の意味、図面
  make: async (p) => {
    await studioReady(p);
    M('start');
    await click(p, '.tabs [data-mode="hand"]', { after: 2000 });
    await click(p, 'details.more > summary', { after: 1200 });
    await click(p, 'details.more .term', { after: 1500 });
    await p.mouse.wheel(0, 500); await p.waitForTimeout(1500);
    M('draw');
    await click(p, '.disp [data-disp="draw"]', { after: 3500 });
    await click(p, '.disp [data-disp="render"]', { after: 1500 });
  },
  // 工房ごとの帳面で、同じ指輪を比べる
  workshops: async (p) => {
    await studioReady(p);
    await click(p, '.tabs [data-mode="refine"]', { after: 1500 });
    await p.evaluate(() => { const s = document.querySelector('.ws-pick'); s.value = '__new'; s.dispatchEvent(new Event('change')); });
    await p.waitForTimeout(600);
    await type(p, '.ws-name', '工房 B', 90);
    await click(p, '.ws-make', { after: 2500 });
    M('cmp');
    await click(p, '.ws-cmp', { after: 4000 });
  },
  // Claude が、帳面のまだ決まっていない所を職人に聞きに来る
  ask: async (p) => {
    await p.goto(`${BASE}/app.html?nointro#waza`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(2500);
    M('start');
    await moveTo(p, 'text=Claude から質問が 1 つあります');
    await p.waitForTimeout(2500);
    await click(p, 'a[href="#waza/ring"], button:has-text("聞き取り")', { after: 3000 });
    await p.mouse.wheel(0, 400); await p.waitForTimeout(2500);
  },
  // 魚々子：同じしくみを伝統の技に。決まりから外れた粒が赤くなる
  nanako: async (p) => {
    await p.goto(`${BASE}/app.html?nointro#waza/nanako`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(2500);
    M('start');
    const ranges = p.locator('input[type=range]');
    if (await ranges.count()) {
      await ranges.first().scrollIntoViewIfNeeded();
      const b = await ranges.first().boundingBox();
      await p.mouse.move(b.x + b.width * 0.5, b.y + b.height / 2, { steps: 24 });
      await p.mouse.down();
      for (let i = 0; i <= 40; i++) { await p.mouse.move(b.x + b.width * (0.5 + 0.4 * i / 40), b.y + b.height / 2); await p.waitForTimeout(50); }
      await p.mouse.up();
    }
    await p.waitForTimeout(3000);
  },
  // 学ぶ：言葉で聞くと、帳面の職人の言葉まで戻って答える
  learn: async (p) => {
    await p.goto(`${BASE}/app.html?nointro#ask`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(2000);
    M('start');
    await click(p, '.chips .chip', { after: 4500 });
  },
  // 組み立て直す：手がかりを開いて見る
  rebuild: async (p) => {
    await p.goto(`${BASE}/app.html?nointro#rebuild`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(1500);
    M('start');
    await click(p, '.tech', { after: 2500 });
    await click(p, 'details.clues > summary', { after: 1500 });
    for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, 220); await p.waitForTimeout(700); }
    await p.waitForTimeout(1500);
  },
};

(async () => {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CLIPS);
  for (const n of names) await clip(n, CLIPS[n]);
})();
