// 文字と図の場面（cine/html/）を、動いたまま録る。node rec-html.cjs [場面の名前…]（なしなら全部）
// sizes-public・sizes-craft は、sizes.cjs で撮った指輪の絵を使うので、先に sizes.cjs を回す。2 つをつないで sizes.mp4 にする
const { chromium, SP, VIDEO } = require('../paths.cjs');
const fs = require('fs'); const { execFileSync } = require('child_process');
const D = `${SP}/cine/`;
// 長さは台本（scenes11.json）の場面より少し長めに（ミリ秒）
const ALL = { q: 7000, spread: 4500, genba: 18500, gakko: 18500, keisho: 27000, saigen: 13000, end: 11000, 'sizes-public': 9000, 'sizes-craft': 9000 };
(async () => {
  // html は ../sizes/ の絵を読むので、作業用のフォルダに写してから開く
  fs.cpSync(`${VIDEO}/cine/html`, `${D}html`, { recursive: true });
  fs.cpSync(`${VIDEO}/../public/heritage`, `${D}heritage`, { recursive: true });
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ALL);
  for (const n of names) {
    const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: D, size: { width: 1920, height: 1080 } } });
    const p = await ctx.newPage(); await p.goto(`file://${D}html/${n}.html`); await p.waitForTimeout(ALL[n] ?? 10000);
    const v = p.video(); await ctx.close(); fs.renameSync(await v.path(), `${D}${n}.webm`); await b.close(); console.log(n);
  }
  if (fs.existsSync(`${D}sizes-public.webm`) && fs.existsSync(`${D}sizes-craft.webm`)) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', `${D}sizes-public.webm`, '-i', `${D}sizes-craft.webm`, '-filter_complex', '[0:v][1:v]concat=n=2:v=1[v]', '-map', '[v]', '-r', '30', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', `${D}sizes.mp4`]);
    console.log('sizes.mp4');
  }
})();
