// 流れの通しの確かめ（本当の帳面の画面で、毛彫りを最後まで）。Claude は偽物の返事、手を読む道具も偽物（見本の記録を返す）。
// 開発用のサーバーを立てて（npx vite --port 5191）、node scripts/flow-check.cjs <絵を置くフォルダ> [幅 高さ] [URL の頭]
// どの段で止まったかを出す。止まれば終了コード 1。
const { chromium } = require('playwright');
const assert = require('assert');
const fs = require('fs');

const out = process.argv[2] || 'out/check';
const W = Number(process.argv[3] || 1440);
const H = Number(process.argv[4] || 900);
const BASE = process.argv[5] || 'http://localhost:5191';
const ANSWER = '試しの答え：幅は図案で変える';
const UNKNOWN = '失敗した線は消せますか？';

/** 偽物の Claude：道具の名前を見て、決まった返事を返す */
function fakeClaude(body) {
  const tools = (body.tools || []).map((t) => t.name);
  const msg = (content, stop = 'end_turn') => ({ id: 'msg_x', type: 'message', role: 'assistant', model: 'fake', content, stop_reason: stop, usage: { input_tokens: 1, output_tokens: 1 } });
  const use = (name, input) => msg([{ type: 'tool_use', id: `tu_${name}`, name, input }], 'tool_use');
  if (tools.includes('ask_gap')) return use('ask_gap', { question: 'Claude の言い直し：毛彫りの線は、どこまで彫りますか？' });
  if (tools.includes('gap_rule')) {
    // 届いた質問への答えと、Claude の問いへの答えで、決まりの名前を分ける
    const asked = JSON.stringify(body.messages).includes('失敗した線');
    return use('gap_rule', { has_value: false, value: 0, title: asked ? '失敗した線は消せますか' : '線の幅と深さ', text: asked ? '浅い線なら磨いて消す' : ANSWER, reason: '（理由はまだ聞いていない）', follow_up: '' });
  }
  if (tools.includes('ask_teacher')) {
    const all = JSON.stringify(body.messages);
    const last = body.messages[body.messages.length - 1];
    const lastText = typeof last.content === 'string' ? last.content : JSON.stringify(last.content);
    if (lastText.includes('消せ')) {
      // 帳面にその答えの決まりがあれば答える。なければ職人に回す
      const known = /\[([^\]]+)\] 失敗した線/.exec(body.system);
      if (known) return msg([{ type: 'text', text: `答え：浅い線なら磨いて消す\nなぜ：職人の言葉です。\n決まり：[${known[1]}]` }]);
      return use('ask_teacher', { question: UNKNOWN, why_unanswered: '帳面にない' });
    }
    if (lastText.includes('tool_result')) return msg([{ type: 'text', text: `答え：職人に聞いておきます。答えが届いたら、ここで答えられるようになります。\nなぜ：帳面にありません。\n決まり：` }]);
    // 作者の本当の決まりにも同じ題があるので、いちばん後に足した決まり（この確かめで入れた答え）を選ぶ
    const id = [...body.system.matchAll(/\[([^\]]+)\] 線の幅と深さ/g)].pop()?.[1];
    assert(id, `帳面に職人の決まりが渡っていない：${all.slice(0, 80)}`);
    return msg([{ type: 'text', text: `答え：図案で変えます。\nなぜ：職人がそう言いました。\n決まり：[${id}]` }]);
  }
  throw new Error(`思っていない道具：${tools}`);
}

const FAKE_TRACKER = `
import { inputFromSampled, importRecord } from '/src/craft/record.ts';
export const MAX_TRACK_S = 60;
let n = 0;
export async function trackVideo(video, opts) {
  const name = n++ === 0 ? 'master' : 'learner';
  const r = importRecord(await (await fetch('/mihon/' + name + '.json')).text());
  opts.onProgress?.(1, 1);
  return inputFromSampled(r.landmarksSampled, r.durationS);
}`;

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: W < 500 ? 2 : 1 });
  const p = await ctx.newPage();
  const bad = [];
  p.on('pageerror', (e) => bad.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.addInitScript(() => { localStorage.setItem('tsugu.password.v1', 'test'); localStorage.setItem('tsugu.introSeen.v1', '1'); });
  await p.route('**/api/claude', async (r) => {
    try {
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeClaude(r.request().postDataJSON())) });
    } catch (e) { bad.push(e.message); r.abort(); }
  });
  await p.route('**/src/craft/hand-tracker.ts*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_TRACKER }));
  const shot = async (name) => { await p.waitForTimeout(500); await p.screenshot({ path: `${out}/${name}.png` }); };
  const step = (t) => console.log('・', t);
  const dots = () => p.locator('.flow:visible .fl-step').evaluateAll((els) => els.map((e) => (e.classList.contains('done') ? '済' : e.classList.contains('current') ? '今' : '-')).join(''));
  // 届いた質問の数（赤い帯。ないときは 0）
  const asked = async () => ((await p.locator('.flow:visible .fl-back b').count()) ? Number(await p.locator('.flow:visible .fl-back b').innerText()) : 0);

  step('はじめの画面は技の一覧');
  await p.goto(`${BASE}/app.html`, { waitUntil: 'load' });
  await p.waitForSelector('.big-tech[href="#waza/kebori"]');
  assert.equal(await p.locator('.big-tech').first().getAttribute('href'), '#waza/kebori');
  assert.equal((await p.locator('.nav a').first().innerText()).trim(), '技');
  await shot('1-list');

  step('毛彫りを開く：帳面に作者の決まりがあるので、次は「手本を残す」。答える段へ切り替えられる');
  await p.locator('.big-tech[href="#waza/kebori"]').click();
  await p.waitForSelector('.flow:visible');
  assert.equal(await dots(), '済今--');
  assert.equal(await p.locator('.fl-step.at a').getAttribute('data-step'), 'model');
  await p.locator('.fl-slot a[data-step="answer"]').click();
  await p.waitForSelector('#tp-ask:not([hidden])');
  assert.equal(await p.locator('.fl-step.at a').getAttribute('data-step'), 'answer');
  // 答えている間は、大きな「次」を出さない（目立つボタンは「決まりにする」の 1 つ）
  assert.equal(await p.locator('.fl-go:visible').count(), 0, '答えている間に大きな「次」が出ている');
  await p.waitForFunction(() => document.querySelector('#tp-ask .iv-q')?.textContent.includes('言い直し'));
  const y = await p.locator('#tp-ask').evaluate((e) => e.getBoundingClientRect().top + scrollY);
  assert(y < H * 1.3, `答える所が遠い：${y}`);
  await shot('2-kebori');

  step('職人が答える → 案 → これでいい → だれの言葉か・いつ');
  await p.locator('.iv-root textarea').fill(ANSWER);
  await p.locator('.iv-root .make').click();
  await p.waitForSelector('.iv-root .proposal');
  await shot('3-draft');
  await p.locator('.iv-root [data-a="ok"]').click();
  await p.waitForSelector('.fl-saved');
  const saved = await p.locator('.fl-saved').innerText();
  assert(saved.includes(ANSWER) && saved.includes('職人：') && /\d{4}-\d{2}-\d{2}/.test(saved), saved);
  assert.equal(await dots(), '済今--');
  assert.equal(await p.locator('.fl-go:visible').count(), 1);
  await shot('4-saved');

  step('次：手本を残す（撮るだけ）');
  await p.locator('.fl-go').click();
  await p.waitForSelector('#tp-model:not([hidden]) .motion-pick');
  assert.equal(await p.locator('.motion-export').isVisible(), false);
  assert.equal(await p.locator('.motion-pick input[type=file]:visible').count(), 0, '選ぶ欄の英語が出ている');
  await p.locator('.motion-pick input[type=file]:not([capture])').setInputFiles('public/mihon/master.webm');
  await p.waitForSelector('.motion-save:visible');
  await shot('5-model');
  await p.locator('.motion-save').click();
  await p.waitForSelector('.fl-saved');
  assert.equal(await dots(), '済済今-');
  assert.equal(await asked(), 0);
  await shot('6-model-saved');

  step('次：学ぶ人が聞く（その技が選ばれている）→ 職人の言葉つきの答え');
  await p.locator('.fl-go').click();
  await p.waitForFunction(() => location.hash === '#learn/kebori');
  assert.equal(await p.locator('.tech-pick select:visible').inputValue(), 'kebori');
  assert((await p.locator('.chip:visible').allInnerTexts()).some((t) => t.includes('鏨')));
  await p.locator('.composer textarea').fill('毛彫りの線の幅と深さは？');
  await p.locator('.composer .send').click();
  await p.waitForSelector('.a-voice.quoted');
  const voice = await p.locator('.a-voice').first().innerText();
  assert(voice.includes(ANSWER) && voice.includes('職人：'), voice);
  await shot('7-answer');

  step('帳面にないこと → 職人への質問として届く');
  await p.locator('.composer textarea').fill(UNKNOWN);
  await p.locator('.composer .send').click();
  await p.waitForSelector('.to-master');
  await shot('8-unknown');

  step('手の動きを比べる');
  await p.locator('a[data-step="hands"]:visible').click();
  await p.waitForFunction(() => location.hash === '#learn/hands/kebori');
  await p.waitForSelector('.see .ex:visible');
  await p.locator('.pick-file').setInputFiles('public/mihon/learner.webm');
  await p.waitForSelector('.result .verdict');
  await p.waitForSelector('.moment canvas.cl');
  await shot('9-compare');
  // 学ぶの画面には職人の段を出さない（聞く・手を比べるの切り替えだけ）
  assert.equal(await p.locator('#screen-learn .flow').count(), 0);
  assert.equal(await p.locator('.learn-nav:visible a[aria-current="page"]').getAttribute('data-step'), 'hands');

  step('届いた質問が、毛彫りの頁に来ている（技の札と印）');
  assert.equal((await p.locator('.nav a[data-view="waza"] .badge').innerText()).trim(), '1');
  assert.equal(await p.locator('.nav a[data-view="ledger"] .badge').isVisible(), false);
  await p.goto(`${BASE}/app.html#waza/kebori?step=answer`);
  await p.waitForFunction((q) => document.querySelector('#tp-ask .iv-q')?.textContent === q, UNKNOWN);
  assert.equal(await dots(), '済済済済');
  assert.equal(await asked(), 1);
  await shot('10-question');
  await p.locator('.iv-root textarea').fill('浅い線なら磨いて消す');
  await p.locator('.iv-root .make').click();
  await p.waitForSelector('.iv-root .proposal');
  await p.locator('.iv-root [data-a="ok"]').click();
  await p.waitForSelector('.fl-saved');
  assert.equal(await asked(), 0);

  step('同じ質問に、こんどは答えられる');
  await p.evaluate(() => (location.hash = '#learn/kebori'));
  await p.waitForSelector('.composer textarea:visible');
  await p.locator('.composer textarea').fill(UNKNOWN);
  await p.locator('.composer .send').click();
  await p.waitForFunction(() => document.querySelector('.thread .a:last-child .a-voice'));
  assert.equal(await p.locator('.thread .a:last-child .to-master').count(), 0);
  await shot('11-answered');

  step('技の一覧で、育ったのが分かる。指輪の帳面に混ざっていない');
  await p.evaluate(() => (location.hash = '#waza'));
  await p.waitForSelector('.big-tech[href="#waza/kebori"] .bt-stats');
  const stats = (await p.locator('.big-tech[href="#waza/kebori"] .bt-stats').innerText()).replace(/\s+/g, ' ');
  // 作者の決まり 1 ＋ この確かめで足した 2
  assert.match(stats, /職人の決まり 3 手本 1 届いた質問 0/);
  await shot('12-grown');
  await p.evaluate(() => (location.hash = '#ledger'));
  await p.waitForSelector('.book-techs a[href^="#waza/kebori"]');
  assert(!(await p.locator('#screen-ledger .rule-cards').first().innerText()).includes(ANSWER));
  assert((await p.locator('.book-techs a[href^="#waza/kebori"]').innerText()).includes('手本 1'));
  await shot('13-book');

  step('見本は本当の帳面に触らない。前の撮影の画面（?nointro）は前のまま');
  const before = await p.evaluate(() => localStorage.getItem('tsugu.ledger.tech.kebori.v1'));
  await p.goto(`${BASE}/app.html?mihon#waza/kebori`);
  await p.waitForSelector('.mihon-bar');
  assert((await p.locator('.tp-mine').innerText()).includes('まだありません'));
  await p.goto(`${BASE}/app.html#waza/kebori`);
  assert.equal(await p.evaluate(() => localStorage.getItem('tsugu.ledger.tech.kebori.v1')), before);
  await p.goto(`${BASE}/app.html?nointro`);
  await p.goto(`${BASE}/app.html?nointro#waza/mokume`);
  await p.waitForSelector('.tp-steps:visible');
  assert.equal(await p.locator('#screen-waza .flow').count(), 0);
  assert.equal((await p.locator('.nav a').first().innerText()).trim(), '設計');

  await b.close();
  if (bad.length) { console.error('画面のエラー', bad); process.exit(1); }
  console.log('通った');
})().catch((e) => { console.error(e); process.exit(1); });
