// 撮るための継ぐ：組んだ物（video/work/dist-cap）をそのまま出し、/api だけ開発用のサーバー（本物の Claude）へ渡す。
// 開発用のサーバー（vite）は、ほかの作業で src が変わるとページを読み直すので、撮っている途中で画面が消える。
// 組んだ物は変わらないので、撮る間ずっと同じ画面になる。
// 使い方：npx vite build --outDir video/work/dist-cap --emptyOutDir → node video/capture/serve.cjs（5201 番。/api は 5180 番へ）
const http = require('http');
const fs = require('fs');
const path = require('path');
const { SP } = require('../paths.cjs');
const ROOT = process.env.CAP_DIST || path.join(SP, 'dist-cap');
const PORT = Number(process.env.CAP_PORT || 5201);
const API = Number(process.env.API_PORT || 5180);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wasm': 'application/wasm' };
http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    const up = http.request({ host: '127.0.0.1', port: API, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on('error', (e) => { res.writeHead(502); res.end(String(e)); });
    req.pipe(up);
    return;
  }
  let f = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (f.endsWith('/')) f += 'index.html';
  const file = path.join(ROOT, path.normalize(f).replace(/^(\.\.[/\\])+/, ''));
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    // 動画の秒を送る（currentTime）には、ブラウザが一部だけ読める（Range）必要がある。ないと秒が 0 に戻る（2026-11-08 手を比べるを撮るとき）
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m) {
      const a = m[1] ? Number(m[1]) : Math.max(0, buf.length - Number(m[2]));
      const b = m[1] && m[2] ? Math.min(buf.length - 1, Number(m[2])) : buf.length - 1;
      res.writeHead(206, { 'content-type': type, 'cache-control': 'no-store', 'accept-ranges': 'bytes', 'content-range': `bytes ${a}-${b}/${buf.length}`, 'content-length': b - a + 1 });
      res.end(buf.subarray(a, b + 1));
      return;
    }
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', 'accept-ranges': 'bytes' });
    res.end(buf);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`撮る用の継ぐ http://localhost:${PORT}（${ROOT}、/api は ${API} 番へ）`));
