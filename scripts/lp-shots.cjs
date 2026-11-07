// 入口のページ（index.html）と「なぜ継ぐ」に載せる、継ぐの本物の画面を撮る。
// 毎回、新しいブラウザ（使った跡のない状態）で撮る。合言葉は使わない（Claude を呼ばない操作だけ）。手元の版なので合言葉の窓は出ない。
// 使い方：npx vite build --outDir <作業用> して npx vite preview --outDir <作業用> --port 5373 で動かしてから
//   node scripts/lp-shots.cjs [撮る物の名前…]（なしなら全部）
// 2 倍の細かさで撮り、cwebp で webp にして public/lp/ に置く（大きい物と、半分の幅の -sm の 2 つ）。
// 指輪は ?rec（細かい描き方）でレンダーにして、画面の部品を隠して黒の上で撮る。画面の写真は今の版の見た目で撮る（?rec は前の見た目になるので使わない）。
// 変えるとき：TSUGU_BASE＝継ぐを動かしている所、TSUGU_LP_WORK＝撮った PNG を置く所、TSUGU_LP_OUT＝webp を置く所
// 撮ると src/lp/shots.json（写真と動く絵の大きさ）も書き直す。入口のページはそこから枠の大きさを読む。
// 動く絵（turn・hands）は ffmpeg で webm と mp4 に。
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.env.TSUGU_BASE || 'http://localhost:5373';
const WORK = process.env.TSUGU_LP_WORK || fs.mkdtempSync(path.join(os.tmpdir(), 'tsugu-lp-'));
// TSUGU_LP_OUT：webp を置く所を変える（取り込む前のブランチで試し撮りするとき。そのときは大きさの一覧もそこに書く）
const OUT = process.env.TSUGU_LP_OUT || path.join(__dirname, '..', 'public', 'lp');
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
async function page(url, w = W, h = H, dsf = 2) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
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
async function studioNow(w = W, h = H, dsf = 2) {
  const p = await page('/studio.html', w, h, dsf);
  await ready(p);
  await p.waitForTimeout(1500);
  return p;
}
const numbers = (p) => p.evaluate(() => {
  const b = window.__studio.session.built;
  return { prong: b.ring.setting?.prongs?.[0]?.diameterMm, ringKeys: Object.keys(b.ring).join(','), settingKeys: Object.keys(b.ring.setting ?? {}).join(','), problems: b.problems.map((x) => `${x.check} ${x.current} → ${x.required}`) };
});

/** 指輪を黒の上で撮る舞台：画面の部品を隠し、レンダーにして、3D を画面いっぱいに */
async function stage(w, h, q = '', dsf = 2) {
  const p = await page(`/studio.html?nointro&rec${q}`, w, h, dsf);
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
  // 「アールデコな感じ」と本物の Claude に頼んで組んだ形（src/lp/artdeco.json。2026-11-07 作者が選んだ 9 回目＝動画と同じ回）。はじめの石のまま state を入れて組む。撮るときに Claude は呼ばない。
  // 大きく写すので、彫りだけ細かい網目（fine）で描く（形の数字は変えない）
  async artdeco() {
    const show = require('../src/lp/artdeco.json');
    for (const [name, dir, zoom] of [['ring-artdeco', { x: 0.45, y: -0.85, z: 0.3 }, 0.98], ['ring-artdeco-front', { x: 0, y: -1, z: 0.15 }, 0.98]]) {
      const p = await stage(1000, 1200);
      await p.evaluate((st) => { const s = window.__studio.session; const x = structuredClone(st); if (x.shankRelief) x.shankRelief.fine = true; Object.assign(s.state, x); s.build('撮る'); }, show.state);
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
    const only = (process.env.TSUGU_BAND_ONLY || '').split(',').filter(Boolean);
    for (const s of shapes.filter((x) => !only.length || only.includes(x.id))) {
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
    // 入口の「残す」の言葉と同じ、爪の 0.7 mm の決まりの札（畳んだ中にあれば開く）。見つからなければ 2 枚目
    await p.evaluate(() => document.querySelectorAll('details').forEach((d) => { if ([...d.querySelectorAll('.rule-cards li')].some((li) => li.textContent.includes('最低ライン'))) d.open = true; }));
    await p.waitForTimeout(500);
    await p.evaluate(() => { const li = [...document.querySelectorAll('.rule-cards li')].filter((x) => x.textContent.includes('最低ライン') && !x.querySelector('li')).pop(); if (li) li.dataset.lpPick = '1'; });
    const card = p.locator('[data-lp-pick]').first();
    await ((await card.isVisible().catch(() => false)) ? card : p.locator('.rule-cards li').nth(1)).screenshot({ path: `${WORK}/rule-card.png` });
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

  // ---- 2026-11-07 入口のページの作り直しで足した物（動く絵と、移り変わる絵） ----

  // はじめの動く絵：平打ちの指輪が、黒の上でゆっくり一回りする（12.5 秒でくり返し）。カメラをこちらで 1 こまずつ回して撮る（時計に頼らない）
  async turn() {
    const S = 900;
    const p = await stage(S, S, '', 1.2);
    await p.evaluate((f) => window.__studio.session.setShank(f), FLAT);
    await p.waitForTimeout(3000);
    console.log('turn', await numbers(p));
    await look(p, WHOLE, 0.9);
    const dir = freshDir('turn');
    const base = await p.evaluate(() => { const v = window.__viewer; const o = v.camera.position.clone().sub(v.controls.target); return [o.x, o.y, o.z]; });
    const N = 300;
    for (let i = 0; i < N; i++) {
      await p.evaluate(([o, a]) => {
        const v = window.__viewer, t = v.controls.target, c = Math.cos(a), s = Math.sin(a);
        v.camera.position.set(t.x + o[0] * c - o[1] * s, t.y + o[0] * s + o[1] * c, t.z + o[2]);
        v.camera.lookAt(t);
        v.controls.update();
        v.dirty = true;
        return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }, [base, (-2 * Math.PI * i) / N]);
      await p.screenshot({ path: path.join(dir, `f${String(i).padStart(4, '0')}.png`) });
    }
    toClip('turn', dir, 24, 960, 46);
  },
  // 確かめる：作れる → 爪を細くすると、その場で赤い印 → 押すと職人の言葉 → まとめて直す（同じ画角の 4 枚。入口で移り変わる）
  async check() {
    const p = await studioNow(1280, 800);
    // 「まとめて直しますか？」の確かめに「はい」（人が押すのと同じ）
    p.on('dialog', (d) => d.accept());
    await refine(p);
    // Claude からの質問の札は「あとで」で閉じる（人が押すのと同じ）。確かめの結果が上に来る
    await p.evaluate(() => document.querySelector('.ask-later')?.click());
    await p.waitForTimeout(800);
    const verdict = () => p.evaluate(() => document.querySelector('.verdict-chip')?.textContent.trim());
    console.log('check-ok', await verdict());
    await shot(p, 'check-ok');
    await p.evaluate(() => window.__studio.session.setSetting({ prong_mm: 0.6, reason: '撮る' }));
    await p.waitForTimeout(3000);
    console.log('check-red', await verdict());
    await shot(p, 'check-red');
    await p.evaluate(() => document.querySelector('.verdict-chip')?.click());
    await p.waitForTimeout(1500);
    await shot(p, 'check-pop');
    await p.evaluate(() => document.querySelector('.fix-pop .fp-every')?.click());
    await p.waitForTimeout(4000);
    console.log('check-fixed', await verdict(), await numbers(p));
    await shot(p, 'check-fixed');
  },
  // 模様の試し：本当の手順と Claude の手順で木目金を作ったら（計算の絵）と、本物の鐔。段ごとの絵も
  async moyou() {
    const p = await page('/app.html#waza/rebuild/moyou', 1280, 800);
    await p.waitForSelector('.mo-final');
    await p.waitForTimeout(2500);
    await hideFixed(p);
    await p.locator('.mo-final').screenshot({ path: `${WORK}/moyou-final.png` });
    await p.locator('.mo-grid').screenshot({ path: `${WORK}/moyou-steps.png` });
    made.push('moyou-final', 'moyou-steps');
  },
  // 【取り込み待ち】「Claude に教える」（設計の確かめるの右の欄）：今の設計、一行の欄と話す、職人の点と推測の点の表。
  // Claude は呼ばない（帳面にある決まりをそのまま見せる）。.teach-sec がなければ（取り込む前の版）撮らずに知らせる
  async teach() {
    const p = await studioNow(1280, 900);
    await refine(p);
    await p.evaluate(() => document.querySelector('.ask-later')?.click());
    await p.waitForTimeout(800);
    if (!(await p.locator('.teach-sec').count())) return console.log('teach：この版には「Claude に教える」がない（取り込んでから撮る）');
    // TSUGU_LP_CLAUDE=1：本物の Claude に、帳面にある職人の本当の言葉（ledger/jewelry.json の爪の決まりの quote）をそのまま教え、
    // 案（Claude の読み取り・いま → この案の表・職人／推測の印）が出た所を撮る。開発用サーバー（npx vite。.env のキー、合言葉は dev-local）で動かすときだけ。
    // なし：案は出さず、欄（いまの設計・一行の欄・話す）だけを撮る。どちらも、職人が言っていない言葉は入れない
    if (process.env.TSUGU_LP_CLAUDE) {
      const said = 'このサイズの石なら最低ライン 0.7 mm は欲しい感じ。メレだと 0.6 mm とか。石のサイズによってどんどん変わる。大きい石だったら大きい爪。今回の石なら、普通は 0.8 から 1';
      await p.evaluate(() => localStorage.setItem('tsugu.password.v1', 'dev-local'));
      await p.fill('.teach-sec .ar-text', said);
      await p.evaluate(() => document.querySelector('.teach-sec .ar-go').click());
      const got = await p.waitForSelector('.ar-proposal .pp, .ar-proposal .proposal-d', { timeout: 180000 }).then(() => true, () => false);
      console.log('teach Claude', got, await p.evaluate(() => document.querySelector('.ar-proposal')?.innerText.replace(/\s+/g, ' ').slice(0, 300)));
      await p.waitForTimeout(800);
    }
    await p.evaluate(() => document.querySelector('.teach-sec').scrollIntoView({ block: 'start' }));
    await p.waitForTimeout(600);
    const b = await p.locator('.teach-sec').boundingBox();
    // 下の端：案があれば案の終わり、なければ「Claude に教える」のボタンの下
    const end = await p.evaluate(() => {
      const pr = document.querySelector('.teach-sec .ar-proposal');
      const el = pr && pr.getBoundingClientRect().height > 4 ? pr : document.querySelector('.teach-sec .ar-go')?.closest('.row');
      const r = el?.getBoundingClientRect();
      return r ? r.bottom : null;
    });
    const bottom = Math.min(end ?? b.y + 420, 900 - 4);
    console.log('teach', JSON.stringify(b), await p.evaluate(() => document.querySelector('.teach-sec')?.innerText.replace(/\s+/g, ' ').slice(0, 200)));
    await shot(p, 'teach', { clip: { x: b.x - 4, y: b.y - 6, width: b.width + 8, height: bottom - b.y + 18 } });
  },
  // 【取り込み待ち】手を比べる：職人が撮った いい例・よくない例 と、ヤスリの角度の線。動画を流した 8 秒を、画面のまま録って動く絵（hands-clip）に
  async hands() {
    const W2 = 760, H2 = 1100;
    const p = await page('/app.html#learn/hands', W2, H2);
    const ok = await p.waitForSelector('.pair-slot .pd-grid', { timeout: 20000 }).then(() => true, () => false);
    if (!ok) return console.log('hands：この版には「いい例・よくない例」がない（取り込んでから撮る）');
    await hideFixed(p);
    await p.waitForTimeout(3500);
    const b = await p.locator('.pair-slot').boundingBox();
    console.log('hands', JSON.stringify(b), await p.evaluate(() => document.querySelector('.pair-slot')?.innerText.replace(/\s+/g, ' ').slice(0, 200)));
    // 動く絵：動画の所だけを、ふつうの時計のまま 8 秒録る（いい例・よくない例の動画と、角度の線）
    const g = await p.locator('.pair-slot .pd-grid').boundingBox();
    await p.context().close();
    const vdir = freshDir('hands-rec');
    const c = await browser.newContext({ viewport: { width: W2, height: H2 }, deviceScaleFactor: 1, recordVideo: { dir: vdir, size: { width: W2, height: H2 } } });
    const q = await c.newPage();
    await q.goto(BASE + '/app.html#learn/hands', { waitUntil: 'networkidle' });
    await q.waitForSelector('.pair-slot .pd-grid');
    await hideFixed(q);
    await q.evaluate((y) => scrollTo(0, y), 0);
    await q.waitForTimeout(9500);
    const vid = await q.video().path();
    await c.close();
    const crop = `crop=${Math.round(g.width + 8)}:${Math.round(g.height + 8)}:${Math.round(g.x - 4)}:${Math.round(g.y - 4)}`;
    // はじめの 1.5 秒（読み込みの間）を捨てて 8 秒
    const tmp = path.join(vdir, 'cut.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '1.5', '-t', '8', '-i', vid, '-vf', crop, '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', '-an', tmp]);
    const fdir = freshDir('hands-clip');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-vf', 'fps=24', '-start_number', '0', path.join(fdir, 'f%04d.png')]);
    toClip('hands-clip', fdir, 24, 640, 40);
  },
  // 取り込み待ちの 2 枚（teach・hands）がまだ撮れないときの、仮の札（写真ではない。撮れば同じ名前で上書きされる）
  async pending() {
    const card = (name) => `<body style="margin:0;background:#0d0c0b;display:grid;place-items:center;height:100vh;font:15px/1.8 -apple-system,'Hiragino Sans',sans-serif;color:#9a958c;border:1px dashed #3a3632;box-sizing:border-box;text-align:center"><p>この画面は、取り込みのあとに撮ります<br><small style="font-size:12px;color:#6d6861">node scripts/lp-shots.cjs ${name}</small></p></body>`;
    const fresh = (f) => !fs.existsSync(f) || process.env.TSUGU_PENDING_FORCE;
    // 止めた絵：teach（この回で本物を撮れた物と、もう webp がある物は作らない。本物を仮の札で上書きしない）
    if (!made.includes('teach') && fresh(`${OUT}/teach.webp`)) {
      const c = await browser.newContext({ viewport: { width: 345, height: 560 }, deviceScaleFactor: 2 });
      const p = await c.newPage();
      await p.setContent(card('teach'));
      await shot(p, 'teach');
      await c.close();
    }
    // 動く絵：hands-clip（1 秒の止まった絵の動画と poster）
    if (fresh(`${OUT}/hands-clip.webm`)) {
      const c = await browser.newContext({ viewport: { width: 640, height: 560 }, deviceScaleFactor: 1 });
      const p = await c.newPage();
      await p.setContent(card('hands'));
      const dir = freshDir('hands-pending');
      await p.screenshot({ path: path.join(dir, 'f0000.png') });
      for (let i = 1; i < 24; i++) fs.copyFileSync(path.join(dir, 'f0000.png'), path.join(dir, `f${String(i).padStart(4, '0')}.png`));
      await c.close();
      toClip('hands-clip', dir, 24, 0, 40);
    }
  },
  // 品物の写真（public/heritage/ の jpg。出どころは README と入口のページの下）を、入口のページ用に webp にする
  async heritage() {
    const H = path.join(__dirname, '..', 'public', 'heritage');
    for (const [f, w] of [['itomaki-tachi-wide', 1800], ['kozuka-carp', 1800], ['menuki-tiger', 1400], ['kashira-dragon', 1000], ['tsuba-carp', 900], ['naiku-1953', 1600], ['goshinpo-gyokuhai', 1800], ['mokume-tsuba-1-black', 1352], ['mokume-tsuba-2-black', 1400]]) {
      execFileSync('cwebp', ['-quiet', '-q', '78', '-m', '6', '-resize', String(w), '0', `${H}/${f}.jpg`, '-o', `${OUT}/h-${f}.webp`]);
      execFileSync('cwebp', ['-quiet', '-q', '78', '-m', '6', '-resize', String(Math.round(w / 2)), '0', `${H}/${f}.jpg`, '-o', `${OUT}/h-${f}-sm.webp`]);
    }
  },
  // 模様の見込み（2026-11-07）：架空の技の絵（docs/pattern-demo/*-top.png・400 px 角）と、輪打ち金筋の段が 1 つずつ現れる画面（wauchi-flow-07 の段の所を切り抜く）。
  // 撮らずに、記録の PNG を webp にするだけ。作り直すときは scripts/pattern-demo.ts と pattern-flow-shots.cjs で記録を撮り直してから
  async patterns() {
    const D = path.join(__dirname, '..', 'docs', 'pattern-demo');
    for (const f of ['kasumi', 'uzu', 'ichimatsu', 'wauchi', 'sukashibori', 'tsubukin']) {
      execFileSync('cwebp', ['-quiet', '-q', '80', '-m', '6', `${D}/${f}-top.png`, '-o', `${OUT}/pt-${f}.webp`]);
      execFileSync('cwebp', ['-quiet', '-q', '80', '-m', '6', '-resize', '200', '0', `${D}/${f}-top.png`, '-o', `${OUT}/pt-${f}-sm.webp`]);
    }
    const crop = ['-crop', '108', '362', '918', '456'];
    execFileSync('cwebp', ['-quiet', '-q', '82', '-m', '6', ...crop, `${D}/wauchi-flow-07.png`, '-o', `${OUT}/pt-stages.webp`]);
    execFileSync('cwebp', ['-quiet', '-q', '82', '-m', '6', ...crop, '-resize', '459', '0', `${D}/wauchi-flow-07.png`, '-o', `${OUT}/pt-stages-sm.webp`]);
  },
  // テンションの札（2026-11-07）：職人が実際に作った指輪と同じ値（SV925・挟む向き side・14 号・くぼみ 0.4 / 溝 0.4 mm。動画の tension16 と同じ）。
  // 欄の「浅く留めたいとき」を上へ送り、答え（ぎりぎり・職人が確かめる）から事実の表の終わりまでを切り抜く。地金ごとの比べの表の字は、ログに出す（入口の TENSION_EXAMPLE に写す）
  async tensionCard() {
    const p = await studioNow(1440, 2000);
    await p.evaluate(() => {
      const s = window.__studio.session;
      s.setSetting({ style: 'tension', reason: '撮る' });
      s.setSetting({ tension_grip: 'side', reason: '撮る' });
      s.setShank({ metal: 'sv925', gou: 14, reason: '撮る' });
      s.setTensionDepths(0.4, 0.4);
    });
    await p.waitForTimeout(1500);
    await refine(p);
    await p.waitForTimeout(800);
    console.log('tension-card 比べ', await p.evaluate(() => [...document.querySelectorAll('.tn-table tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ')).join(' ／ ')));
    console.log('tension-card 答え', await p.evaluate(() => document.querySelector('.tn-hold .tn-verdict')?.innerText.replace(/\s+/g, ' ')));
    await p.evaluate(() => { const e = document.querySelector('.tn-hold'); let c = e?.parentElement; while (c && !(c.scrollHeight > c.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(c).overflowY))) c = c.parentElement; if (e && c) c.scrollTop += e.getBoundingClientRect().top - c.getBoundingClientRect().top - 8; });
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => { const a = document.querySelector('.tn-hold').getBoundingClientRect(); const f = document.querySelector('.tn-hold .tn-facts').getBoundingClientRect(); return { x: a.x - 8, y: a.y - 8, width: a.width + 16, height: f.bottom - a.y + 20 }; });
    await p.screenshot({ path: `${WORK}/tension-card.png`, clip: r });
    made.push('tension-card');
  },
  // 職人が作ったテンションの指輪（動画の素材 video/work/footage/raw/finished.mov の 1.6 秒の 1 こま。指輪と手に寄せて 4:3 で切る）。
  // 素材は動画の作業場所にだけある（リポジトリには入れない）。TSUGU_FINISHED で場所を変えられる
  async finished() {
    const src = process.env.TSUGU_FINISHED || path.join(__dirname, '..', 'video', 'work', 'footage', 'raw', 'finished.mov');
    if (!fs.existsSync(src)) return console.log('finished：素材がない', src);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '1.6', '-i', src, '-frames:v', '1', '-vf', 'crop=992:744:329:116', `${WORK}/finished-ring.png`]);
    made.push('finished-ring');
  },
  // 大きさの一覧だけを作り直す（撮らない）
  async sizes() {},
};

/** 作業用のこまを置く、空のフォルダ */
function freshDir(name) {
  const d = path.join(WORK, name);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  return d;
}
/** こま（f0000.png…）を、音なし・くり返しの動く絵に：webm（VP9）と mp4（H.264）と、はじめのこまの poster（webp）。w＝出す幅（0 ならそのまま） */
function toClip(name, dir, fps, w, crf) {
  const inp = path.join(dir, 'f%04d.png');
  const vf = [w ? `scale=${w}:-2:flags=lanczos` : 'scale=trunc(iw/2)*2:trunc(ih/2)*2', 'format=yuv420p'].join(',');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', inp, '-vf', vf, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(crf), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-an', `${OUT}/${name}.webm`]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', inp, '-vf', vf, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(Math.round(crf * 0.68)), '-movflags', '+faststart', '-an', `${OUT}/${name}.mp4`]);
  const first = path.join(dir, 'f0000.png');
  execFileSync('cwebp', ['-quiet', '-q', '80', '-m', '6', ...(w ? ['-resize', String(w), '0'] : []), first, '-o', `${OUT}/${name}-poster.webp`]);
  for (const ext of ['webm', 'mp4', 'poster.webp']) console.log(name, ext, Math.round(fs.statSync(`${OUT}/${name}${ext === 'poster.webp' ? '-' : '.'}${ext}`).size / 1024), 'KB');
}
/** webp の大きさ（VP8X・VP8・VP8L） */
function webpSize(file) {
  const b = fs.readFileSync(file);
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') { const n = b.readUInt32LE(21); return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 }; }
  return null;
}
/** 入口のページが読む、写真と動く絵の大きさの一覧（src/lp/shots.json）。撮り直すと大きさが変わっても、ページの枠が合う */
function writeSizes() {
  const out = {};
  for (const f of fs.readdirSync(OUT).sort()) {
    const m = f.match(/^(.+?)(-sm)?\.webp$/);
    if (!m || m[2]) continue;
    const s = webpSize(path.join(OUT, f));
    if (s) out[m[1]] = [s.w, s.h];
  }
  fs.writeFileSync(process.env.TSUGU_LP_OUT ? path.join(OUT, 'shots.json') : path.join(__dirname, '..', 'src', 'lp', 'shots.json'), JSON.stringify(out, null, 0).replace(/],/g, '],\n') + '\n');
  console.log('大きさの一覧', Object.keys(out).length);
}

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
  writeSizes();
  console.log('PNG:', WORK, ' webp:', OUT);
})();
