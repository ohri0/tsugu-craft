// 動画の台本が使う場所を 1 か所にまとめる。どのパソコンでも、同じ手順で撮って組めるように。
// 作業用のフォルダ（録った画面・こま・声・素材・組んだ動画）は、大きいのでリポジトリに入れない。
// 変えるとき：TSUGU_VIDEO_WORK＝作業用のフォルダ、TSUGU_BASE＝継ぐを動かしている所
const path = require('path');
const fs = require('fs');
const SP = process.env.TSUGU_VIDEO_WORK || path.join(__dirname, 'work');
const BASE = process.env.TSUGU_BASE || 'http://localhost:5200';
const VIDEO = __dirname;
for (const d of ['vc/mov', 'vc/mov2', 'vc/hero/thin', 'vc/hero/thick', 'vc/m3', 'cine/sizes', 'voice', 'footage']) fs.mkdirSync(path.join(SP, d), { recursive: true });
const { chromium } = require('playwright');
module.exports = { SP, BASE, VIDEO, chromium };
