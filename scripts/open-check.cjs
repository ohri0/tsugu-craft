// 設計の画面を開いて、3D の形が正しく描けているかを本物のブラウザで確かめ、絵を撮る（公開の版には入らない道具）。
// 見る物：① GPU の中の配列が、JS の配列と同じか ② 描いた三角の数 ③ STL の形の数・開いた辺 ④ 判定の札 ⑤ 絵。
// ① が要る理由：Mac の Safari 26.5.2 は、1 度に 1 MiB より大きい配列を送ると、1 MiB から先に配列の始まりを繰り返して入れる。
//   JS の配列と STL は正しいままなので、ヘッドレスのブラウザと数字だけでは見つからなかった（docs/LOG.md 2026-11-05）。
//
// 使い方（先に npm run build）：
//   node scripts/open-check.cjs                     Chromium と WebKit で、PC とスマホの縦
//   node scripts/open-check.cjs --browsers=safari   本物の Safari（open コマンドでタブを 1 つ開く。設定の変更は要らない。終わったらタブを閉じる）
//   --emulate      Safari の不具合をページの中でまねる（どのブラウザでも、見張りを外すと形が崩れる）
//   --times=10     開き直す回数（2 回目からは、はじめの形だけ見る）
//   --flow=fresh   fresh ＝ 残した設計なしで開く（既定）。reload ＝ 残した設計を読んで開く。old ＝ 古い形式の残した設計を読んで開く
//   --views=pc,phone  --designs=prong,bezel,tension,prong2,round,band  --out=絵を置く所  --port=5317  --dist=dist
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const arg = (k, d) => {
  const hit = process.argv.find((a) => a === `--${k}` || a.startsWith(`--${k}=`));
  if (!hit) return d;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
};
const PORT = +arg('port', 5317);
const DIST = path.resolve(arg('dist', path.join(__dirname, '..', 'dist')));
const OUT = path.resolve(arg('out', fs.mkdtempSync(path.join(os.tmpdir(), 'tsugu-open-'))));
const BROWSERS = String(arg('browsers', 'chromium,webkit')).split(',');
const VIEWS = String(arg('views', 'pc,phone')).split(',');
const TIMES = +arg('times', 1);
const FLOW = String(arg('flow', 'fresh'));
const DESIGNS = String(arg('designs', 'prong,bezel,tension,prong2,round,band'));
const EMULATE = !!arg('emulate', false);
fs.mkdirSync(OUT, { recursive: true });

const VIEW = {
  pc: { viewport: { width: 2000, height: 1250 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
};

// ---- ページの中で動かす札（見張りより先に動くよう、モジュールより前に読む） ----
const PAGE_JS = String(function pageCheck() {
  const q = new URLSearchParams(location.search);
  const tag = q.get('check') || 'page';
  const run = +(q.get('run') || 1);
  const of = +(q.get('of') || 1);
  const designs = (q.get('designs') || 'prong').split(',');
  const MIB = 1 << 20;
  const P = WebGL2RenderingContext.prototype;
  const raw = (d, a, b) => {
    if (!ArrayBuffer.isView(d)) return new Uint8Array(d);
    const unit = d.BYTES_PER_ELEMENT || 1;
    return new Uint8Array(d.buffer, d.byteOffset + (a || 0) * unit, b ? b * unit : d.byteLength - (a || 0) * unit);
  };
  if (q.has('emulate')) {
    // Safari 26.5.2 のまね：1 度に 1 MiB より大きい配列を送ると、1 MiB から先に配列の始まりが繰り返し入る
    const wrapped = (b) => {
      if (b.length <= MIB) return b;
      const out = new Uint8Array(b.length);
      for (let o = 0; o < b.length; o += MIB) out.set(b.subarray(0, Math.min(MIB, b.length - o)), o);
      return out;
    };
    const bd = P.bufferData;
    P.bufferData = function (t, d, u, a, b) {
      return d === null || typeof d === 'number' ? bd.call(this, t, d, u) : bd.call(this, t, wrapped(raw(d, a, b)), u);
    };
    const bs = P.bufferSubData;
    P.bufferSubData = function (t, o, d, a, b) {
      return bs.call(this, t, o, wrapped(raw(d, a, b)));
    };
  }
  // GL の配列を覚えておく（あとで読み返して比べる）
  const buffers = new Set();
  const cb = P.createBuffer;
  P.createBuffer = function () {
    const b = cb.call(this);
    if (b) buffers.add(b);
    return b;
  };
  const db = P.deleteBuffer;
  P.deleteBuffer = function (b) {
    buffers.delete(b);
    return db.call(this, b);
  };
  // 隠れたタブでは時計が遅れるので、待つのはサーバーに頼む
  const sleep = (ms) => fetch('/__sleep?ms=' + ms).then((r) => r.text());
  const send = (name, body) => fetch('/__report?name=' + encodeURIComponent(name), { method: 'POST', body });
  /** GPU の中の配列と JS の配列を比べる（描いたあとで） */
  function gpuCheck(v) {
    const gl = v.renderer.getContext();
    const sizes = new Map();
    for (const b of buffers) {
      gl.bindBuffer(gl.COPY_READ_BUFFER, b);
      if (gl.getError()) continue; // 添字の配列は、ここからは読めない
      sizes.set(b, gl.getBufferParameter(gl.COPY_READ_BUFFER, gl.BUFFER_SIZE));
    }
    const out = { checked: 0, largest: 0, bad: 0, firstBadBytes: null };
    v.content.traverse((o) => {
      if (!o.geometry) return;
      for (const name of ['position', 'normal']) {
        const at = o.geometry.getAttribute(name);
        if (!at) continue;
        const want = at.array;
        let best = null;
        for (const [b, size] of sizes) {
          if (size !== want.byteLength) continue;
          gl.bindBuffer(gl.COPY_READ_BUFFER, b);
          const back = new Float32Array(want.length);
          gl.getBufferSubData(gl.COPY_READ_BUFFER, 0, back);
          let bad = 0;
          let first = null;
          for (let i = 0; i < back.length; i++) {
            if (back[i] !== want[i] && !(back[i] !== back[i] && want[i] !== want[i])) {
              bad++;
              if (first === null) first = i * 4;
            }
          }
          if (best === null || bad < best.bad) best = { bad, first };
          if (bad === 0) break;
        }
        if (!best) continue; // まだ描いていない物（ワイヤーの線など）
        out.checked++;
        out.largest = Math.max(out.largest, want.byteLength);
        if (best.bad) {
          out.bad += best.bad;
          if (out.firstBadBytes === null) out.firstBadBytes = best.first;
        }
      }
    });
    gl.bindBuffer(gl.COPY_READ_BUFFER, null);
    return out;
  }
  /** STL の形の数と開いた辺（JS の配列から。頂点は 0.0001 mm でそろえる） */
  function stlStats(pos) {
    const ids = new Map();
    const parent = [];
    const id = (i) => {
      const k = `${pos[i].toFixed(4)},${pos[i + 1].toFixed(4)},${pos[i + 2].toFixed(4)}`;
      let n = ids.get(k);
      if (n === undefined) {
        n = parent.length;
        ids.set(k, n);
        parent.push(n);
      }
      return n;
    };
    const find = (a) => {
      while (parent[a] !== a) a = parent[a] = parent[parent[a]];
      return a;
    };
    const edges = new Map();
    for (let t = 0; t < pos.length; t += 9) {
      const v = [id(t), id(t + 3), id(t + 6)];
      parent[find(v[0])] = find(v[1]);
      parent[find(v[1])] = find(v[2]);
      for (let k = 0; k < 3; k++) {
        const a = v[k];
        const b = v[(k + 1) % 3];
        if (a === b) continue;
        const e = a < b ? a * 4294967296 + b : b * 4294967296 + a;
        edges.set(e, (edges.get(e) || 0) + 1);
      }
    }
    const roots = new Set();
    for (let i = 0; i < parent.length; i++) roots.add(find(i));
    let open = 0;
    for (const c of edges.values()) if (c % 2) open++;
    return { tris: pos.length / 9, shapes: roots.size, openEdges: open };
  }
  /** 今の形を描いて、数と絵を送る */
  async function look(design, shot) {
    const st = window.__studio;
    const v = st.viewer;
    const band = document.querySelector('.kinds [data-kind="band"]')?.getAttribute('aria-pressed') === 'true';
    const url = v.snapshot(); // 全部描く ＝ 全部 GPU へ送られる
    const drawn = { ...v.renderer.info.render };
    const gpu = gpuCheck(v);
    let pos;
    if (band) {
      v.content.traverse((o) => {
        if (o.userData && o.userData.arm) pos = o.geometry.getAttribute('position').array;
      });
    } else {
      const r = st.session.built.ring.ringPositions;
      pos = new Float32Array(r.setting.length + r.shank.length);
      pos.set(r.setting, 0);
      pos.set(r.shank, r.setting.length);
    }
    const info = {
      tag,
      run,
      design,
      ua: navigator.userAgent,
      hidden: document.hidden,
      disp: v.displayMode,
      drawnTris: drawn.triangles,
      calls: drawn.calls,
      gpu,
      stl: stlStats(pos),
      chip: document.querySelector('.verdict-chip')?.textContent,
      fault: v.drawFault,
    };
    await send(`${tag}-${run}-${design}.json`, JSON.stringify(info));
    if (shot) await send(`${tag}-${run}-${design}.png`, url);
    return info;
  }
  /** 開いたあと、はじめの形が組み上がり、見せ場が終わるのを待つ */
  async function settle() {
    for (let i = 0; i < 600; i++) {
      const s = window.__studio && window.__studio.session;
      if (s && s.built && (s.built.ring.ringPositions.settingNormals || s.built.ring.setting.tension || s.built.ring.setting.bezel)) break;
      await sleep(200);
    }
    // 見せ場（隠れたタブでは最後まで進まない）
    for (let i = 0; i < 60 && !document.hidden; i++) {
      const showing = !document.querySelector('.intro-stage').hidden || document.querySelector('.intro-timer');
      if (!showing && i > 3) break;
      await sleep(250);
    }
  }
  const STEP = {
    prong: () => undefined,
    bezel: (s) => s.setSetting({ style: 'bezel', reason: '確かめ' }),
    tension: (s) => s.setSetting({ style: 'tension', reason: '確かめ' }),
    prong2: (s) => s.setSetting({ style: 'prong', reason: '確かめ' }),
    round: () => document.querySelector('.presets button[data-preset="round"]').click(),
    band: () => document.querySelector('.kinds [data-kind="band"]').click(),
  };
  async function main() {
    await settle();
    const st = window.__studio;
    for (const d of run === 1 ? designs : designs.slice(0, 1)) {
      STEP[d](st.session);
      await sleep(d === 'round' ? 1500 : 100);
      st.session?.flush?.();
      await sleep(200);
      await look(d, true);
    }
    // Safari は外から動かさない：同じタブで開き直して、次の回へ
    if (run < of) {
      if (q.get('flow') !== 'reload') sessionStorage.clear();
      q.set('run', String(run + 1));
      location.replace(`${location.pathname}?${q}`);
      return;
    }
    await send(`${tag}-done.json`, '{}');
    document.title = '終わりました';
  }
  main().catch((e) => send(`${tag}-error.json`, JSON.stringify({ tag, run, error: String(e && e.stack) })));
});

// ---- 組んだ物を出し、結果を受け取る小さなサーバー ----
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.json': 'application/json', '.mp4': 'video/mp4' };
const reports = [];
const waiting = new Map();
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  res.setHeader('Cache-Control', 'no-store');
  if (u.pathname === '/__sleep') return void setTimeout(() => res.end('ok'), +(u.searchParams.get('ms') || 0));
  if (u.pathname === '/__check.js') {
    res.setHeader('Content-Type', 'text/javascript');
    return void res.end(`(${PAGE_JS})();`);
  }
  if (u.pathname === '/__report') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const name = path.basename(u.searchParams.get('name'));
      const body = Buffer.concat(chunks);
      if (name.endsWith('.png')) fs.writeFileSync(path.join(OUT, name), Buffer.from(body.toString('utf8').replace(/^data:image\/png;base64,/, ''), 'base64'));
      else {
        const j = JSON.parse(body.toString('utf8'));
        if (j.design) reports.push(j);
        if (j.error) console.log('ページのエラー', name, j.error);
        if (j.design) console.log(line(j));
        if (name.endsWith('-done.json') || name.endsWith('-error.json')) waiting.get(name.replace(/-(done|error)\.json$/, ''))?.();
      }
      res.end('ok');
    });
    return;
  }
  const file = path.join(DIST, u.pathname === '/' ? 'index.html' : u.pathname);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404;
    return void res.end('not found');
  }
  let data = fs.readFileSync(file);
  // モジュール（見張りをつける所）より前に札を読む
  if (u.pathname === '/studio.html' && u.searchParams.has('check')) data = Buffer.from(data.toString('utf8').replace('<head>', '<head><script src="/__check.js"></script>'));
  res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
  res.end(data);
});
const line = (j) =>
  `${j.tag} ${j.run}回目 ${j.design.padEnd(7)} 三角 ${String(j.stl.tris).padStart(6)} 形 ${j.stl.shapes} 開いた辺 ${j.stl.openEdges} | 描いた三角 ${String(j.drawnTris).padStart(6)} | GPU の配列 ${j.gpu.checked} 本・最大 ${(j.gpu.largest / 1048576).toFixed(2)} MiB・違い ${j.gpu.bad}${j.gpu.firstBadBytes !== null ? `（${j.gpu.firstBadBytes} バイトから）` : ''} | 札「${j.chip}」${j.fault ? ' 絵の乱れを検知' : ''}${j.hidden ? '（隠れたタブ）' : ''}`;
const url = (tag, extra = {}) => {
  const q = new URLSearchParams({ check: tag, of: String(TIMES), run: '1', designs: DESIGNS, flow: FLOW, ...extra });
  if (EMULATE) q.set('emulate', '1');
  return `http://localhost:${PORT}/studio.html?${q}`;
};
/** 残した設計を、前の形式に書き換える（石座の付け方の記録がなかった頃の形） */
const OLD_DESIGN = () => {
  for (const k of Object.keys(sessionStorage)) {
    if (!k.includes('design')) continue;
    const d = JSON.parse(sessionStorage.getItem(k));
    delete d.state.join;
    delete d.state.orientationSet;
    delete d.state.joinSet;
    delete d.state.prongMm;
    d.state.culetGapMm = 0.3;
    sessionStorage.setItem(k, JSON.stringify(d));
  }
};

async function viaPlaywright(name, view) {
  const pw = require('playwright');
  const browser = await pw[name].launch({ headless: true, args: name === 'chromium' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [] });
  const tag = `${name}-${view}${EMULATE ? '-emu' : ''}`;
  console.log(`--- ${tag}（${browser.version()}）`);
  const ctx = await browser.newContext(VIEW[view]);
  for (let i = 1; i <= TIMES; i++) {
    // 毎回、新しいタブ。fresh は残した設計なし、reload・old は残した設計を読む
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    const run = String(i);
    const done = new Promise((r) => waiting.set(`${tag}`, r));
    const designs = i === 1 ? DESIGNS : DESIGNS.split(',')[0];
    if (FLOW === 'fresh') await page.goto(url(tag, { run, of: run, designs }));
    else {
      // いったん開いて設計を残してから、読み直す
      await page.goto(`http://localhost:${PORT}/studio.html`);
      await page.waitForFunction(() => window.__studio?.session?.built?.ring.ringPositions.settingNormals, null, { timeout: 180000 });
      await page.waitForTimeout(600);
      await page.evaluate(() => dispatchEvent(new Event('pagehide')));
      if (FLOW === 'old') await page.evaluate(OLD_DESIGN);
      await page.goto(url(tag, { run, of: run, designs }));
    }
    await done;
    if (i === 1) await page.screenshot({ path: path.join(OUT, `${tag}-screen.png`) });
    if (errs.length) console.log('  エラー', errs.slice(0, 3));
    await page.close();
  }
  await browser.close();
}
async function viaSafari() {
  // 本物の Safari は外から動かさない（設定の変更が要るため）。タブを開くと、ページが自分で開き直して結果を送ってくる
  const tag = `safari${EMULATE ? '-emu' : ''}`;
  console.log('--- 本物の Safari（タブが 1 つ開きます。終わったら閉じてください）');
  const done = new Promise((r) => waiting.set(tag, r));
  execFile('open', ['-g', '-a', 'Safari', url(tag)]);
  await done;
}

server.listen(PORT, async () => {
  try {
    for (const b of BROWSERS) {
      if (b === 'safari') await viaSafari();
      else for (const v of VIEWS) await viaPlaywright(b, v);
    }
    const bad = reports.filter((j) => j.gpu.bad || j.fault);
    console.log(`\n${reports.length} 件。GPU の配列が違った物 ${bad.length} 件。絵：${OUT}`);
    process.exitCode = bad.length ? 1 : 0;
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  }
  server.close();
  server.closeAllConnections?.();
});
