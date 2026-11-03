// hero.cjs・hero-thick.cjs で撮った 2 つの指輪（左：公開情報だけの太い爪、右：職人の決まりの細い爪）を横に並べ、mov/hero-pair.mp4 にする
const { SP } = require('../paths.cjs');
const { execFileSync } = require('child_process');
const H = `${SP}/vc/hero/`;
const half = 'scale=1920:1080,crop=960:1080:480:0';
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '30', '-i', `${H}thick/%04d.png`, '-framerate', '30', '-i', `${H}thin/%04d.png`,
  '-filter_complex', `[0:v]${half}[a];[1:v]${half}[b];[a][b]hstack=inputs=2,format=yuv420p[v]`, '-map', '[v]', '-c:v', 'libx264', '-crf', '18', `${SP}/vc/mov/hero-pair.mp4`]);
console.log('hero-pair.mp4');
