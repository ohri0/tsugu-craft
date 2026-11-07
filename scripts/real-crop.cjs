// 本物の刀の写真（メトロポリタン美術館のパブリックドメインの写真）から、刃の模様の所だけを切り出す（2026-11-08）。
// 元の写真は docs/pattern-demo/lost/real/*-original.jpg に、手を加えずに残す。切り出しは位置と大きさだけ（色・明るさは変えない）。
// 使い方：node scripts/real-crop.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const R = path.resolve('docs/pattern-demo/lost/real');
/** [元の写真, 左, 上, 幅, 高さ（元の写真の画素）, 出す名前]。刃の模様の所で、金の象嵌の字と、光の照り返しをよけた */
const CROPS = [
  ['met-30932-DP160082-original.jpg', 1420, 1500, 1140, 1140, 'met-30932-crop.png'],
  ['met-31130-DP160356-original.jpg', 1200, 20, 780, 780, 'met-31130-crop.png'],
  ['met-32739-DP160068-original.jpg', 1300, 20, 860, 860, 'met-32739-crop.png'],
];
const SIZE = 600;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const [src, x, y, w, h, out] of CROPS) {
    const data = 'data:image/jpeg;base64,' + fs.readFileSync(`${R}/${src}`).toString('base64');
    const png = await p.evaluate(async ({ data, x, y, w, h, SIZE }) => {
      const img = new Image();
      img.src = data;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = SIZE;
      c.height = Math.round((SIZE * h) / w);
      c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
      return c.toDataURL('image/png').split(',')[1];
    }, { data, x, y, w, h, SIZE });
    fs.writeFileSync(`${R}/${out}`, Buffer.from(png, 'base64'));
    console.log(out);
  }
  await b.close();
})();
