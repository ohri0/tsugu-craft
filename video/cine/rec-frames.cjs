// 文字と図の場面（cine/html/）を、1 こまずつ撮って mp4 にする（動画で録るとカクカクするため）。
// ページの時計（performance.now と CSS のアニメーション）をこちらで進め、30 こま／秒で撮る。node rec-frames.cjs 場面…
const { chromium, SP, VIDEO } = require('../paths.cjs');
const fs = require('fs'); const { execFileSync } = require('child_process');
const D = `${SP}/cine/`;
const LEN = { q: 6, spread: 4.5, genba: 18.5, gakko: 18.5, keisho: 25, saigen: 13, end: 9, ledger: 15, finale: 11 };
(async () => {
  fs.cpSync(`${VIDEO}/cine/html`, `${D}html`, { recursive: true });
  fs.cpSync(`${VIDEO}/../public/heritage`, `${D}heritage`, { recursive: true });
  const b = await chromium.launch();
  for (const n of process.argv.slice(2)) {
    const out = `${D}frames-${n}/`; fs.mkdirSync(out, { recursive: true });
    const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
    await p.addInitScript(() => { let T = 0; performance.now = () => T; window.__setT = (t) => { T = t; }; });
    await p.goto(`file://${D}html/${n}.html`, { waitUntil: 'load' });
    await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
    const frames = Math.round((LEN[n] ?? 10) * 30);
    for (let i = 0; i < frames; i++) {
      const t = (i * 1000) / 30;
      await p.evaluate((t) => { window.__setT(t); for (const a of document.getAnimations()) { a.pause(); a.currentTime = t; } return new Promise((r) => requestAnimationFrame(() => r())); }, t);
      await p.screenshot({ path: `${out}${String(i).padStart(4, '0')}.png` });
    }
    await p.close();
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '30', '-i', `${out}%04d.png`, '-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p', `${D}${n}.mp4`]);
    console.log(n, frames);
  }
  await b.close();
})();
