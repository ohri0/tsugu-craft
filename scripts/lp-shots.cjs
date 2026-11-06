// 入口のページ（index.html）と「なぜ継ぐ」に載せる、継ぐの本物の画面を撮る。
// 毎回、新しいブラウザ（使った跡のない状態）で撮る。合言葉は使わない（Claude を呼ばない操作だけ）。手元の版なので合言葉の窓は出ない。
// 使い方：npx vite build --outDir <作業用> して npx vite preview --outDir <作業用> --port 5373 で動かしてから
//   node scripts/lp-shots.cjs [撮る物の名前…]（なしなら全部）
// 2 倍の細かさで撮り、cwebp で webp にして public/lp/ に置く（大きい物と、半分の幅の -sm の 2 つ）。
// 指輪は ?rec（細かい描き方）でレンダーにして、画面の部品を隠して黒の上で撮る。画面の写真は今の版の見た目で撮る（?rec は前の見た目になるので使わない）。
// 変えるとき：TSUGU_BASE＝継ぐを動かしている所、TSUGU_LP_WORK＝撮った PNG を置く所
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.env.TSUGU_BASE || 'http://localhost:5373';
const WORK = process.env.TSUGU_LP_WORK || fs.mkdtempSync(path.join(os.tmpdir(), 'tsugu-lp-'));
const OUT = path.join(__dirname, '..', 'public', 'lp');
fs.mkdirSync(OUT, { recursive: true });
const W = 1440, H = 900;
/** 帳面・学ぶ・技は、スマホの幅で撮る（字が大きく読める） */
const PHONE_W = 480;
/** 3D を GPU で描く（ないと描くたびに長く止まり、押した後の待ちが切れる） */
const GPU = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];

let browser;
/** この回で撮った物（作業用のフォルダのほかの PNG は触らない） */
const made = [];
const shot = async (p, name, opts = {}) => {
  await p.screenshot({ path: `${WORK}/${name}.png`, ...opts });
  made.push(name);
};
async function page(url, w = W, h = H) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await c.addInitScript(() => { try { sessionStorage.setItem('tsugu.studio.introSeen.v1', '1'); localStorage.setItem('tsugu.studio.introSeen.v1', '1'); } catch {} });
  const p = await c.newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(BASE + url, { waitUntil: 'networkidle' });
  return p;
}
/** スマホの幅の下に出る、決まった位置の帯を隠す（切り取った写真に重ならないように） */
const hideFixed = (p) => p.evaluate(() => document.querySelectorAll('body *').forEach((e) => { if (getComputedStyle(e).position === 'fixed') e.style.display = 'none'; }));
/** 押す（3D を描いている間でも止まらないように、ページの中で押す） */
const tap = (p, sel) => p.evaluate((s) => document.querySelector(s).click(), sel);
const refine = async (p) => { await tap(p, '.tabs [data-mode="refine"]'); await p.waitForTimeout(1200); };
const ready = (p) => p.waitForFunction(() => window.__studio?.session?.built, null, { timeout: 120000 });

/** 設計の画面（今の見た目） */
async function studioNow(w = W, h = H) {
  const p = await page('/studio.html', w, h);
  await ready(p);
  await p.waitForTimeout(1500);
  return p;
}
const numbers = (p) => p.evaluate(() => {
  const b = window.__studio.session.built;
  return { prong: b.ring.setting?.prongs?.[0]?.diameterMm, ringKeys: Object.keys(b.ring).join(','), settingKeys: Object.keys(b.ring.setting ?? {}).join(','), problems: b.problems.map((x) => `${x.check} ${x.current} → ${x.required}`) };
});

/** 指輪を黒の上で撮る舞台：画面の部品を隠し、レンダーにして、3D を画面いっぱいに */
async function stage(w, h, q = '') {
  const p = await page(`/studio.html?nointro&rec${q}`, w, h);
  await p.waitForFunction(() => window.__studio?.session?.built && window.__viewer, null, { timeout: 120000 });
  await p.evaluate(() => {
    window.__studio.setMode('refine');
    window.__viewer.setDisplayMode('render');
    window.__viewer.setPresenting(true);
    document.querySelector('.t-dims')?.click();
    document.querySelector('.t-grid')?.click();
    const st = document.createElement('style');
    st.textContent = `.tb,.tools,.insp,.cmd-wrap,.sb,.vp-tl,.verdict-chip,.dims,.gizmo,.toast,.fix-pop,.ask-nudge,.stage-note{display:none!important} .pro{display:block!important} .vp{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}`;
    document.head.appendChild(st);
    window.__viewer.setAutoRotate(false);
    dispatchEvent(new Event('resize'));
  });
  await p.waitForTimeout(1500);
  return p;
}
/** 向き：dir は目標から見たカメラの向き。zoom は全体が入る距離に掛ける数（小さいほど寄る）。at は目標の高さ（z、mm） */
async function look(p, dir, zoom = 1, at) {
  await p.evaluate(([d, z, a]) => {
    const v = window.__viewer;
    v.setAutoRotate(false);
    v.camera.position.copy(v.controls.target).add(d);
    v.fit();
    const c = v.camera, t = v.controls.target;
    if (a !== null) { const dz = a - t.z; t.z += dz; c.position.z += dz; }
    c.position.sub(t).multiplyScalar(z).add(t);
    v.controls.update();
    v.dirty = true;
  }, [dir, zoom, at ?? null]);
  await p.waitForTimeout(3500);
}
/** 指から石の上までの中ほど（石に寄るときの目標）。腕のいちばん上より少し上 */
const stoneZ = (p) => p.evaluate(() => {
  const v = window.__viewer;
  let top = -Infinity;
  v.content.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    top = Math.max(top, bb.max.z);
  });
  return top - 2.2;
});
const FLAT = { section: 'hirauchi', width_mm: 2.0, thickness_mm: 1.4, reason: '撮る' };
const MACRO = { x: 0.62, y: -0.5, z: 0.5 };
const WHOLE = { x: 0.66, y: -0.62, z: 0.34 };

/** 見本の工房 B（爪 ø 1 mm くらい・鬼爪）を足して、その帳面に切り替える */
async function workshopB(p) {
  await p.evaluate(() => { window.__studio.setMode('refine'); });
  await p.waitForTimeout(800);
  await p.evaluate(() => { const s = document.querySelector('.ws-pick'); s.value = '__sample'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(5000);
}

const SHOTS = {
  // 指輪：平打ち 2.0 × 1.4 mm（動画と同じ腕）を、石に寄って
  async ring() {
    const p = await stage(1600, 1000);
    await p.evaluate((f) => window.__studio.session.setShank(f), FLAT);
    await p.waitForTimeout(3000);
    console.log('ring', await numbers(p));
    await look(p, MACRO, 0.42, await stoneZ(p));
    await shot(p, 'ring-macro');
    await p.context().close();
    // 全体
    const q = await stage(1000, 1200);
    await q.evaluate((f) => window.__studio.session.setShank(f), FLAT);
    await q.waitForTimeout(3000);
    await look(q, WHOLE, 1.0);
    await shot(q, 'ring-whole');
  },
  // 工房ごと：同じ石で、帳面だけを変える（どちらも甲丸）
  async book() {
    const p = await stage(1000, 1000);
    console.log('after', await numbers(p));
    await look(p, MACRO, 0.5, await stoneZ(p));
    await shot(p, 'book-a');
    await p.addStyleTag({ content: '.insp{display:block!important;position:fixed!important;left:-9999px!important}' });
    await workshopB(p);
    await p.evaluate(() => { window.__viewer.setDisplayMode('render'); window.__viewer.setPresenting(true); });
    await p.waitForTimeout(1500);
    console.log('before', await numbers(p));
    await look(p, MACRO, 0.5, await stoneZ(p));
    await shot(p, 'book-b');
  },
  // 作れない所が赤く光る（爪を細くした）
  async red() {
    const p = await stage(1600, 1000);
    await p.evaluate((f) => window.__studio.session.setShank(f), FLAT);
    await p.evaluate(() => window.__studio.session.setSetting({ prong_mm: 0.55, reason: '撮る' }));
    await p.waitForTimeout(3000);
    console.log('red', await numbers(p));
    await look(p, MACRO, 0.42, await stoneZ(p));
    await shot(p, 'ring-red');
  },
  // 「ゴシックな感じ」の見本：攻めた案（src/lp/gothic-showcase.json の attack。studio.html?gothic=attack で同じ形が開く）。
  // 本物の Claude の考え方（指示）に沿って、人が数字を整えた形。撮るときは Claude を呼ばない。大きく写すので細かい網目（fine）で
  async gothic() {
    for (const [name, dir, zoom] of [['ring-gothic-attack', { x: 0.62, y: -0.72, z: 0.36 }, 0.98], ['ring-gothic-attack-front', { x: 0, y: -1, z: 0.15 }, 0.98]]) {
      const p = await stage(1000, 1200, '&gothic=attack&fine=1');
      await p.waitForTimeout(9000);
      console.log(name, await numbers(p));
      await look(p, dir, zoom);
      await shot(p, name);
      await p.context().close();
    }
  },
  // テンション：石を腕の力で挟む
  async tension() {
    const p = await stage(1000, 1200);
    await p.evaluate(() => window.__studio.session.setSetting({ style: 'tension', reason: '撮る' }));
    await p.waitForTimeout(5000);
    console.log('tension', await numbers(p));
    await look(p, WHOLE, 0.9);
    await shot(p, 'ring-tension');
  },
  // 地金のみの指輪の見せ場：アプリの断面の編集で作った形（数字は src/lp/band-showcase.json。studio.html?band=<id> で同じ形が開く）
  async bandShow() {
    const { shapes } = require('../src/lp/band-showcase.json');
    for (const s of shapes) {
      const p = await stage(1000, 1000);
      await p.evaluate(([b, cut]) => window.__studio.openShowcaseBand(b, cut), [s.band, !!s.cut]);
      await p.waitForTimeout(3000);
      await look(p, s.camera, s.zoom ?? 0.72);
      await shot(p, `band-${s.id}`);
      await p.context().close();
    }
  },
  // 作れない所の窓：爪を細くして、赤い札を押す → 理由と職人の言葉と直すボタン（今の見た目。指輪に寄って、窓の字が読めるように切り抜く）
  async fixpop() {
    const p = await studioNow(1200, 900);
    await refine(p);
    await p.evaluate(() => {
      const v = window.__studio.viewer;
      v.setDisplayMode('render');
      document.querySelector('.t-dims')?.click();
      document.querySelector('.t-grid')?.click();
      window.__studio.session.setSetting({ prong_mm: 0.6, reason: '撮る' });
    });
    await p.waitForTimeout(3000);
    await p.evaluate(() => {
      const v = window.__studio.viewer;
      v.setAutoRotate(false);
      const t = v.controls.target;
      v.camera.position.copy(t).add({ x: 0.62, y: -0.5, z: 0.5 });
      v.fit();
      const c = v.camera;
      t.z += 7;
      c.position.z += 7;
      c.position.sub(t).multiplyScalar(0.74).add(t);
      c.updateMatrixWorld();
      // 窓に隠れないよう、指輪を左へ寄せる
      const r = c.position.clone().setFromMatrixColumn(c.matrixWorld, 0).multiplyScalar(5);
      t.add(r);
      c.position.add(r);
      v.controls.update();
      v.dirty = true;
    });
    await p.waitForTimeout(2500);
    await p.evaluate(() => document.querySelector('.verdict-chip')?.click());
    await p.waitForTimeout(1500);
    const pop = await p.locator('.fix-pop').boundingBox();
    console.log('fixpop', JSON.stringify(pop), await p.evaluate(() => document.querySelector('.fix-pop')?.innerText.replace(/\s+/g, ' ').slice(0, 160)));
    const x = Math.max(44, pop.x - 470);
    await shot(p, 'fixpop', { clip: { x, y: Math.max(44, pop.y - 8), width: pop.x + pop.width + 8 - x, height: pop.height + 16 } });
    // スマホでは窓だけを出す（字が小さくならないように）
    await shot(p, 'fixpop-pop', { clip: { x: pop.x - 4, y: pop.y - 4, width: pop.width + 8, height: pop.height + 8 } });
  },
  // 帳面：職人の決まりの札と、Claude からの質問
  async ledger() {
    const p = await page('/app.html#ledger', PHONE_W);
    await p.waitForSelector('.rule-cards li');
    await hideFixed(p);
    await p.waitForTimeout(1500);
    await p.locator('.rule-cards li').nth(1).screenshot({ path: `${WORK}/rule-card.png` });
    await p.locator('.iv-card').screenshot({ path: `${WORK}/ask-card.png` });
    made.push('rule-card', 'ask-card');
  },
  // 学ぶ：職人に聞く（Claude なしでも帳面から答える）
  async learn() {
    const p = await page('/app.html#learn', PHONE_W, 1100);
    await p.waitForSelector('.composer');
    await p.fill('.composer input, .composer textarea', '9 mm の石の爪は？');
    await p.evaluate(() => document.querySelector('.composer').requestSubmit());
    // 合言葉を聞かれたら、入れない（帳面から答える）
    await p.waitForTimeout(800);
    await p.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) (d.querySelector('[value="cancel"], .cancel, button[type="button"]') ?? d.querySelector('button')).click(); });
    await p.waitForSelector('.a-short', { timeout: 30000 });
    await p.waitForTimeout(1200);
    await p.evaluate(() => document.querySelector('.why-btn')?.click());
    await p.waitForTimeout(600);
    await hideFixed(p);
    await p.addStyleTag({ content: '.composer,.status{display:none!important}' });
    const v = await p.locator('.thread').boundingBox();
    const m = await p.locator('.thread .a-meta').last().boundingBox();
    await shot(p, 'learn', { fullPage: true, clip: { x: 0, y: v.y - 8, width: PHONE_W, height: m.y + m.height - v.y + 32 } });
  },
  // 途切れた技：自分の技を組み立て直す（作り話の例で、流れと案の見え方）
  async restore() {
    const p = await page('/app.html#waza/restore', PHONE_W, 1400);
    await p.waitForSelector('.rs-sample');
    await tap(p, '.rs-sample');
    await p.waitForTimeout(2000);
    await hideFixed(p);
    await p.waitForTimeout(500);
    // 切り抜きで端が切れないよう、まわりに画面の地を残す
    const box = async (sel, i = 0) => { const b = await p.locator(sel).nth(i).boundingBox(); return { x: 0, y: b.y - 12, width: PHONE_W, height: b.height + 24 }; };
    await shot(p, 'restore-flow', { fullPage: true, clip: await box('.rs-flow') });
    await shot(p, 'restore-step', { fullPage: true, clip: await box('.rs-steps > li', 1) });
  },
  // 作る：図面
  async draw() {
    const p = await studioNow();
    await tap(p, '.tabs [data-mode="hand"]');
    await p.waitForTimeout(2000);
    await tap(p, '.disp [data-disp="draw"]');
    await p.waitForTimeout(3500);
    await p.addStyleTag({ content: '.sheet-big{display:none!important}' });
    await shot(p, 'draw', { clip: { x: 86, y: 84, width: 972, height: 702 } });
    // 章の扉に置く、図の所だけ（枠と表は入れない）
    await shot(p, 'draw-views', { clip: { x: 196, y: 149, width: 730, height: 330 } });
  },
  // 入口のページで押して試せる「作り方」の中身：設計の画面の作るの札（鍛造・鋳造）を、そのまま JSON にする（写真ではない）
  async steps() {
    const p = await studioNow();
    await tap(p, '.tabs [data-mode="hand"]');
    await p.waitForTimeout(2000);
    const out = { title: await p.evaluate(() => window.__studio.stone?.shapeName ?? ''), methods: {} };
    for (const m of ['hand', 'cast']) out.methods[m] = await p.evaluate((x) => window.__studio.makeCards(x), m);
    fs.writeFileSync(path.join(OUT, 'make-steps.json'), JSON.stringify(out));
    console.log('steps', out.title, out.methods.hand.length, out.methods.cast.length);
  },
};

/** PNG を webp に（2 倍の物と、半分の幅の -sm） */
function toWebp(name) {
  const src = `${WORK}/${name}.png`;
  if (!fs.existsSync(src)) return;
  execFileSync('cwebp', ['-quiet', '-q', '82', '-m', '6', src, '-o', `${OUT}/${name}.webp`]);
  execFileSync('cwebp', ['-quiet', '-q', '82', '-m', '6', '-resize', String(Math.round(sizeOf(src).w / 2)), '0', src, '-o', `${OUT}/${name}-sm.webp`]);
}
function sizeOf(png) {
  const b = fs.readFileSync(png);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

(async () => {
  browser = await chromium.launch({ args: GPU });
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS);
  for (const n of names) {
    try {
      await SHOTS[n]();
    } catch (e) {
      console.log('失敗', n, String(e).slice(0, 400));
    }
    for (const c of browser.contexts()) await c.close();
  }
  await browser.close();
  for (const f of made) toWebp(f);
  for (const f of made) console.log(f, JSON.stringify(sizeOf(`${WORK}/${f}.png`)));
  console.log('PNG:', WORK, ' webp:', OUT);
})();
