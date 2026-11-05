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
async function stage(w, h) {
  const p = await page('/studio.html?nointro&rec', w, h);
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

/** 工房 B（公開情報だけの帳面）を作る。三角の石は角に 3 本で留まる、という決まりだけ先に入れる */
async function workshopB(p) {
  await p.evaluate(() => { window.__studio.setMode('refine'); document.querySelectorAll('.ws-new, .ws-pick, details.ws').forEach((e) => (e.open = true)); });
  await p.waitForTimeout(800);
  await p.evaluate(() => { const s = document.querySelector('.ws-pick'); s.value = '__new'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(500);
  await p.evaluate(() => { const i = document.querySelector('.ws-name'); i.value = '工房 B'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await tap(p, '.ws-make');
  await p.waitForTimeout(2000);
  await p.evaluate(() => { document.querySelector('.manual-rule').open = true; });
  await p.evaluate(() => {
    const set = (q, v) => { const e = document.querySelector(q); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
    set('.mr-param', 'hold.cornerSet'); set('.mr-value', '1'); set('.mr-quote', '三角の石は、角に 1 本ずつの 3 本で留まる');
  });
  await tap(p, '.mr-go');
  await p.waitForTimeout(3000);
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
  // 「ゴシックな感じ」で本物の Claude が組んだ時の数字（docs/LOG.md 2026-11-05）を、Claude を呼ばずに同じ道具で組む
  async gothic() {
    const p = await stage(1000, 1200);
    await p.evaluate(() => window.__studio.loadPreset({ id: 'marquise', name: 'マーキス', longMm: 10, widthMm: 5, depthMm: 3.2 }));
    await p.waitForTimeout(3000);
    await p.evaluate(() => window.__studio.session.setSetting({ prong_count: 6, reason: '撮る' }));
    await p.evaluate(() => window.__studio.session.setShank({
      width_mm: 2.6, thickness_mm: 2.0, metal: 'k18wg',
      section_curve: { points: [{ x: 1, y: 0 }, { x: 1, y: 0.45 }, { x: 0.82, y: 0.62 }, { x: 0.42, y: 0.8 }, { x: 0, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 1 }] },
      stations: [{ at_deg: 180, width_mm: 1.9, thickness_mm: 1.4 }],
      relief: { pattern: 'arch', count: 7, depth_mm: 0.18, from_deg: 30, to_deg: 100, columns: 2 },
      reason: '撮る',
    }));
    await p.waitForTimeout(6000);
    console.log('gothic', await numbers(p));
    await look(p, { x: 0.86, y: -0.28, z: 0.42 }, 0.74);
    await shot(p, 'ring-gothic');
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
  // 石なしの指輪：断面の見本から 2 つ
  async band() {
    for (const [name, sec] of [['band-a', 'yamagata'], ['band-b', 'dan']]) {
      const p = await stage(1000, 1000);
      await p.evaluate(() => document.querySelector('.kinds [data-kind="band"]').click());
      await p.waitForTimeout(2500);
      const ok = await p.evaluate((s) => { const b = document.querySelector(`.bs-grid [data-sec="${s}"]`); if (b) b.click(); return !!b; }, sec);
      console.log(name, sec, ok, await p.evaluate(() => [...document.querySelectorAll('.bs-grid [data-sec]')].map((b) => b.dataset.sec).join(',')));
      await p.waitForTimeout(3000);
      await look(p, { x: 0.72, y: -0.6, z: 0.42 }, 0.8);
      await shot(p, name);
      await p.context().close();
    }
  },
  // 作れない所の窓：爪を細くして、赤い札を押す → 理由と直し方（今の見た目）
  async fixpop() {
    const p = await studioNow();
    await refine(p);
    await p.evaluate(() => window.__studio.viewer.setDisplayMode('render'));
    await p.evaluate(() => { window.__studio.session.setSetting({ prong_mm: 0.6, reason: '撮る' }); });
    await p.waitForTimeout(3000);
    await p.evaluate(() => document.querySelector('.verdict-chip')?.click());
    await p.waitForTimeout(1500);
    console.log('fixpop', await p.evaluate(() => document.querySelector('.fix-pop')?.innerText.replace(/\s+/g, ' ')));
    await shot(p, 'fixpop', { clip: { x: 44, y: 44, width: 1056, height: 782 } });
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
  // 石なしの指輪：断面の見本の欄
  async bandPanel() {
    const p = await studioNow(1440, 1000);
    await p.evaluate(() => document.querySelector('.kinds [data-kind="band"]').click());
    await p.waitForTimeout(2500);
    await p.evaluate(() => window.__studio.viewer.setDisplayMode('render'));
    await p.evaluate(() => document.querySelector('.bs-grid [data-sec="yamagata"]')?.click());
    await p.waitForTimeout(2500);
    await p.locator('.bs-grid').screenshot({ path: `${WORK}/band-grid.png`, scale: 'device' });
    made.push('band-grid');
  },
  // 途切れた技：自分の技を組み立て直す（作り話の例で、流れと案の見え方）
  async restore() {
    const p = await page('/app.html#waza/restore', PHONE_W, 1400);
    await p.waitForSelector('.rs-sample');
    await tap(p, '.rs-sample');
    await p.waitForTimeout(2000);
    await hideFixed(p);
    await p.waitForTimeout(500);
    await p.locator('.rs-flow').screenshot({ path: `${WORK}/restore-flow.png` });
    await p.locator('.rs-steps > li').nth(1).screenshot({ path: `${WORK}/restore-step.png` });
    made.push('restore-flow', 'restore-step');
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
    for (const m of ['hand', 'cast']) {
      await tap(p, `.build-panel .method [data-m="${m}"]`);
      await p.waitForTimeout(800);
      out.methods[m] = await p.evaluate(() => [...document.querySelectorAll('.build-panel .cards > .mk-card')].map((c) => ({
        no: c.querySelector('.n')?.textContent ?? '',
        title: c.querySelector('h3')?.textContent ?? '',
        lead: c.querySelector('.card-lead')?.textContent ?? '',
        rows: [...c.querySelectorAll('table.spec tr')].map((r) => [r.querySelector('th').textContent, r.querySelector('td').textContent]),
        watch: c.querySelector('.watch')?.textContent ?? '',
        more: [...c.querySelectorAll('details.more .lines > li')].map((l) => l.classList.contains('grp') ? { g: l.textContent } : { b: l.querySelector(':scope > b')?.textContent ?? '', t: [...l.childNodes].filter((n) => !(n.nodeType === 1 && n.tagName === 'B')).map((n) => n.textContent).join('') }),
      })));
    }
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
