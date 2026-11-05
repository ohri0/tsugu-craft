// 最終案 9：最初の版（7606ee7）の指輪の形を、本物の最初の版の画面から取り出して、ファイルにする（video/work/story/first9_geom.json）。
// 今の描き方（今のアプリの viewer）で同じ形を描くため。形はそのまま。絵の質ではなく形の差だけが見えるように。
// 使い方：
//   mkdir -p /tmp/first && git archive 7606ee7 | tar -x -C /tmp/first && ln -s $PWD/node_modules /tmp/first/node_modules
//   (cd /tmp/first && npx vite build --outDir dist-first --emptyOutDir)
//   CAP_DIST=/tmp/first/dist-first CAP_PORT=5433 API_PORT=9 node video/capture/serve.cjs &
//   TSUGU_FIRST=http://localhost:5433 node video/capture/first9-dump.cjs
const fs = require('fs');
const path = require('path');
const { SP, chromium } = require('../paths.cjs');
const FIRST = process.env.TSUGU_FIRST || 'http://localhost:5433';
const OUT = path.join(SP, 'story', 'first9_geom.json');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(`${FIRST}/index.html?rec&nointro`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__studio && window.__studio.session && window.__studio.session.built, null, { timeout: 120000 });
  await p.waitForTimeout(2500);
  const data = await p.evaluate(() => {
    const r = window.__studio.session.built.ring;
    const b64 = (a) => { if (!a) return null; const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); let s = ''; const c = 0x8000; for (let i = 0; i < u.length; i += c) s += String.fromCharCode.apply(null, u.subarray(i, i + c)); return btoa(s); };
    const st = window.__studio.session.stone;
    return {
      version: '7606ee7',
      specs: document.querySelector('.sb .specs')?.innerText.replace(/\s+/g, ' '),
      dims: [...document.querySelectorAll('.dims text, .dim-label')].map((t) => t.textContent).join(' ・ '),
      prongMm: r.setting.prongs?.[0]?.diameterMm,
      metal: r.metal,
      culetGapMm: r.culetGapMm,
      shank: { outerRadiusMm: r.shank.outerRadiusMm, innerRadiusMm: r.shank.innerRadiusMm, widthMm: r.shank.widthMm, thicknessMm: r.shank.thicknessMm },
      heights: r.stone.heights,
      transform: r.transform,
      look: { color: st?.extraction?.color, colorless: st?.extraction?.colorless },
      stone: b64(r.ringPositions.stone),
      setting: b64(r.ringPositions.setting),
      settingNormals: b64(r.ringPositions.settingNormals),
      shankPositions: b64(r.ringPositions.shank),
    };
  });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data));
  console.log('取り出した', OUT, JSON.stringify({ specs: data.specs, dims: data.dims, prongMm: data.prongMm, heights: data.heights, shank: data.shank, n: [data.stone.length, data.setting.length, data.shankPositions.length] }));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
