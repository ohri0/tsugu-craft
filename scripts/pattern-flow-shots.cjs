// 途切れた技の流れを、架空の技「雨垂れ銀」で、はじめから撮る（docs/pattern-demo/flow-*.png）。
// 空の一覧 → 名前を入れる → 手がかりを入れる → Claude の案（帳面から の印） → 模様の見込み（段が 1 つずつ） → 試した結果 → 案 2 → 見込み 2 と比べる。
// Claude の返事は、scripts/pattern-demo.ts が本物の Claude から受け取って残したもの（docs/pattern-demo/cases/amadare.replies.json）を、同じ順で返す。
// 開発用のサーバーを立てて（npx vite --port 5197）、node scripts/pattern-flow-shots.cjs [URL の頭]
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:5197';
const OUT = 'docs/pattern-demo';
const replies = JSON.parse(fs.readFileSync(`${OUT}/cases/amadare.replies.json`, 'utf8'));
// scripts/pattern-cases.ts の「雨垂れ銀」と同じ手がかり（同じ順で入れると、返事の番号 C1〜C4 が合う）
const CLUES = [
  { kind: 'object', title: '表の目', text: '【架空】小さな板の表に、雨のしずくが落ちたような丸い目が、ほぼ同じ間で並ぶ。目の中は、黒・白・赤の輪が重なって見える。', source: '架空の持ち主の話' },
  { kind: 'object', title: '裏は平ら', text: '【架空】板の裏は平らで、打った跡も穴の跡もない。', source: '架空の持ち主の話' },
  { kind: 'record', title: '古い覚え書き', text: '【架空】「赤銅、銀、銅を重ね、火にて一つとなし、錐にて浅く穴を穿ち、打ち平む。のち煮て色を揚ぐ」とある。穴の深さと間は書かれていない。', source: '架空の蔵の覚え書き' },
  { kind: 'opinion', title: '輪の数の見立て', text: '【架空】穴の深さで、見える輪の数が変わるのではないか。', source: '職人の見立て（架空）' },
];
const TRIAL = '【架空】小さな切れ端で試した。浅い穴では、黒と白の輪しか出ず、赤い輪が出なかった。もう少し深くあけた所だけ、赤い輪が出た。';

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
    const file = `${OUT}/flow-${String(n).padStart(2, '0')}.png`;
    // 頁全体を撮るときは、上の帯が途中に写らないよう、いちばん上から
    if (full) await p.evaluate(() => window.scrollTo(0, 0));
    await p.screenshot({ path: file, fullPage: full });
    console.log(file, name);
  };

  await p.goto(`${BASE}/app.html#waza/restore`);
  await p.waitForSelector('.rs-new-open');
  await shot('空の一覧');

  await p.click('.rs-new-open');
  await p.fill('.rs-new-name', '雨垂れ銀');
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
  await shot('手がかりを 4 つ入れた');

  await p.click('.rs-next-go');
  await p.waitForTimeout(500);
  await shot('Claude が考えている', false);
  await p.waitForSelector('[data-panel="2"] .rs-steps');
  await p.waitForTimeout(800);
  await shot('Claude の案 1（帳面から の印）');

  await p.click('.rs-moyou-go');
  await p.waitForSelector('.pv-stage');
  await p.waitForSelector('.pv-stage:nth-child(3).on', { timeout: 30000 });
  await shot('模様の見込み：段が 1 つずつ現れる', false);
  await p.waitForSelector('.pv.on-final', { timeout: 30000 });
  await p.waitForTimeout(1200);
  await shot('模様の見込み 1：出来上がり');

  await p.click('.pv-back');
  await p.waitForSelector('.rs-flow');
  await p.click('.rs-flow [data-view="3"]');
  // 「穴」の手順（なければ最初）に「だめだった」と、職人の言葉を入れる
  const holeIndex = await p.$$eval('.rs-try h4', (hs) => Math.max(0, hs.findIndex((h) => /穴/.test(h.textContent))));
  await p.click(`.rs-try:nth-child(${holeIndex + 1}) [data-o="ng"]`);
  const field = `.rs-try:nth-child(${holeIndex + 1}) .rs-note-field`;
  await p.fill(field, TRIAL);
  await p.$eval(field, (el) => el.blur());
  await p.waitForTimeout(600);
  await shot('試した結果を入れる');

  await p.click('.rs-next-go');
  await p.waitForSelector('.rs-pill.changed, .rs-pill.new', { timeout: 30000 });
  await p.waitForTimeout(800);
  await shot('Claude の案 2（結果から変えた所）');

  await p.click('.rs-moyou-go');
  await p.waitForSelector('.pv.on-final', { timeout: 60000 });
  await p.waitForTimeout(1500);
  await shot('模様の見込み 2：前の案と並べる');

  await p.goto(`${BASE}/app.html#waza`);
  await p.waitForTimeout(800);
  await shot('技の一覧：復元の入口');
  await b.close();
})();
