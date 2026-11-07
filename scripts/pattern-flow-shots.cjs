// 途切れた技の流れを、架空の技で、はじめから撮る。
// 空の一覧 → 名前を入れる → 手がかりを入れる → Claude の案（帳面から の印） → 模様の見込み（段が 1 つずつ） → 出来上がり
// 試した結果のある技（雨垂れ銀）は、さらに → 試した結果 → 結果を入れて見込み 1 を作り直す → 案 2 → 見込み 2 と比べる → 技の一覧。
// Claude の返事は、scripts/pattern-demo.ts が本物の Claude から受け取って残したもの（docs/pattern-demo/cases/<id>.replies.json）を、同じ順で返す。
// 手がかりと試した結果は、同じときに残した記録（cases/<id>.json）から読む（同じ順で入れると、返事の番号 C1〜 が合う）。
// 開発用のサーバーを立てて（npx vite --port 5197）、node scripts/pattern-flow-shots.cjs [URL の頭] [技の id（はじめは amadare）]
// 出すもの：雨垂れ銀は docs/pattern-demo/flow-*.png、ほかの技は docs/pattern-demo/<id>-flow-*.png
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:5197';
const ID = process.argv[3] || 'amadare';
const OUT = 'docs/pattern-demo';
const PREFIX = ID === 'amadare' ? 'flow' : `${ID}-flow`;
const replies = JSON.parse(fs.readFileSync(`${OUT}/cases/${ID}.replies.json`, 'utf8'));
const saved = JSON.parse(fs.readFileSync(`${OUT}/cases/${ID}.json`, 'utf8')).project;
const CLUES = saved.clues;
const TRIAL = saved.results[0];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', (e) => console.log('pageerror:', e.message));
  await p.addInitScript(() => {
    localStorage.setItem('tsugu.password.v1', 'dev-local');
    localStorage.setItem('tsugu.introSeen.v1', '1');
  });
  const queue = {};
  for (const r of replies) (queue[r.tool] ||= []).push(r.response);
  await p.route('**/api/claude', async (r) => {
    const tool = JSON.parse(r.request().postData()).tools[0].name;
    const res = queue[tool].shift();
    await new Promise((ok) => setTimeout(ok, 1500));
    await r.fulfill({ status: res.status, contentType: 'application/json', body: JSON.stringify(res.body) });
  });
  let n = 0;
  const shot = async (name, full = true) => {
    n++;
    const file = `${OUT}/${PREFIX}-${String(n).padStart(2, '0')}.png`;
    // 頁全体を撮るときは、上の帯が途中に写らないよう、いちばん上から
    if (full) await p.evaluate(() => window.scrollTo(0, 0));
    await p.screenshot({ path: file, fullPage: full });
    console.log(file, name);
  };
  /** 模様の見込みの頁で、段が出そろい、出来上がりの絵が描けるまで待つ */
  const finalReady = async () => {
    await p.waitForSelector('.pv.on-final', { timeout: 60000 });
    await p.waitForTimeout(2500);
  };

  await p.goto(`${BASE}/app.html#waza/restore`);
  await p.waitForSelector('.rs-new-open');
  await shot('空の一覧');

  await p.click('.rs-new-open');
  await p.fill('.rs-new-name', saved.name);
  await shot('技の名前を入れる', false);
  await p.click('.rs-new button[type=submit]');
  await p.waitForSelector('.rs-text');

  for (const [i, c] of CLUES.entries()) {
    await p.click(`.rs-kinds [data-k="${c.kind}"]`);
    await p.fill('.rs-text', c.text);
    if (!(await p.$eval('.rs-add-more', (d) => d.open))) await p.click('.rs-add-more summary');
    await p.fill('.rs-title-in', c.title);
    await p.fill('.rs-source', c.source);
    if (i === 0) await shot('手がかりを 1 つ書く', false);
    await p.click('.rs-add-go');
    await p.waitForFunction((k) => document.querySelectorAll('.rs-fact').length === k, i + 1);
  }
  await shot(`手がかりを ${CLUES.length} つ入れた`);

  await p.click('.rs-next-go');
  await p.waitForTimeout(500);
  await shot('Claude が考えている', false);
  await p.waitForSelector('[data-panel="2"] .rs-steps');
  await p.waitForTimeout(800);
  await shot('Claude の案 1（帳面から の印）');

  await p.click('.rs-moyou-go');
  await p.waitForSelector('.pv-stage');
  await p.waitForSelector('.pv-stage:nth-child(3).on', { timeout: 30000 });
  await p.waitForTimeout(800);
  await shot('見込み：段が 1 つずつ現れる', false);
  await finalReady();
  await shot('見込み 1：出来上がり');

  if (TRIAL) {
    const projectHash = (await p.evaluate(() => location.hash)).replace(/\/moyou.*$/, '');
    await p.click('.pv-back');
    await p.waitForSelector('.rs-flow');
    await p.click('.rs-flow [data-view="3"]');
    // 試した手順（題の言葉で探す。なければ最初）に、結果と職人の言葉を入れる
    const title = TRIAL.stepTitle;
    const idx = await p.$$eval('.rs-try h4', (hs, t) => Math.max(0, hs.findIndex((h) => h.textContent.includes(t))), title);
    await p.click(`.rs-try:nth-child(${idx + 1}) [data-o="${TRIAL.outcome}"]`);
    const field = `.rs-try:nth-child(${idx + 1}) .rs-note-field`;
    await p.fill(field, TRIAL.note);
    await p.$eval(field, (el) => el.blur());
    await p.waitForTimeout(600);
    await shot('試した結果を入れる');

    // 結果を入れて、案 1 の見込みを作り直す（絵が結果に合う）
    await p.evaluate((h) => (location.hash = `${h}/moyou/1`), projectHash);
    await p.waitForSelector('.pv-again');
    await p.click('.pv-again');
    await p.waitForSelector('.pv-again:not([disabled])', { timeout: 60000 });
    await finalReady();
    await shot('結果を入れて、見込み 1 を作り直した');

    await p.click('.pv-back');
    await p.waitForSelector('.rs-flow');
    await p.click('.rs-flow [data-view="3"]');
    await p.click('.rs-next-go');
    await p.waitForSelector('.rs-pill.changed, .rs-pill.new', { timeout: 30000 });
    await p.waitForTimeout(800);
    await shot('Claude の案 2（結果から変えた所）');

    await p.click('.rs-moyou-go');
    await finalReady();
    await shot('見込み 2：前の案と並べる');
  }

  await p.goto(`${BASE}/app.html#waza`);
  await p.waitForTimeout(800);
  await shot('技の一覧：復元の入口');
  await b.close();
})();
