// ページの中の時計を、こちらで 1 こまずつ進める（仮の時計）。
// 2 倍の細かさで 1 こま撮るのに 0.2 秒ほどかかるので、本当の時計のままだと、画面の動き（組み上がり・赤い点滅・回転・知らせ）が
// 飛び飛びに映る。setTimeout・setInterval・requestAnimationFrame・performance.now・Date.now と CSS のアニメーションを、
// この時計で動かす。1 こま撮るたびに 1000/30 ミリ秒だけ進めれば、画面の動きは 30 こま／秒でなめらかに映る。
// 待つ所（Claude の返事・形の組み直し）は、撮らずに時計だけ早送りする。
const INIT = `(() => {
  // いちばん外のページだけ（図面などの iframe の中は、ふつうの時計のまま。外から進められないので）
  if (window.__vt || window.top !== window) return;
  const realNow = performance.now.bind(performance);
  const dateBase = Date.now() - realNow();
  let T = realNow();
  let seq = 0;
  const timers = new Map();
  let rafs = new Map();
  performance.now = () => T;
  // 同じ時刻に 2 度読んでも、少しずつ増える（時計が止まっている間に作った記録の id が同じにならないように。
  // 見本の作品を 6 つ続けて作ると id がみな同じになり、1 つ直すと全部がその作品に置きかわった。2026-11-05）
  let lastNow = 0;
  Date.now = () => { const t = Math.round(dateBase + T); lastNow = t > lastNow ? t : lastNow + 1; return lastNow; };
  window.setTimeout = (fn, ms, ...args) => { const id = ++seq; timers.set(id, { at: T + Math.max(0, Number(ms) || 0), fn, args, n: id }); return id; };
  window.setInterval = (fn, ms, ...args) => { const id = ++seq; const every = Math.max(1, Number(ms) || 0); timers.set(id, { at: T + every, fn, args, every, n: id }); return id; };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  window.requestAnimationFrame = (fn) => { const id = ++seq; rafs.set(id, fn); return id; };
  window.cancelAnimationFrame = (id) => { rafs.delete(id); };
  const started = new WeakMap();
  const syncAnims = () => {
    for (const a of document.getAnimations()) {
      let st = started.get(a);
      if (st === undefined) { st = T - (Number(a.currentTime) || 0); started.set(a, st); try { a.pause(); } catch (e) {} }
      try { a.currentTime = Math.max(0, T - st); } catch (e) {}
    }
  };
  const due = (upTo) => { let best = null; for (const [id, t] of timers) if (t.at <= upTo && (!best || t.at < best.t.at || (t.at === best.t.at && t.n < best.t.n))) best = { id, t }; return best; };
  // なめらかなスクロール（behavior: 'smooth'）も、この時計で動かす（ブラウザに任せると、撮る間に飛んで見える）
  const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  const glide = (conts, before, D = 480) => {
    const after = conts.map((c) => [c.scrollLeft, c.scrollTop]);
    conts.forEach((c, i) => { c.scrollLeft = before[i][0]; c.scrollTop = before[i][1]; });
    const t0 = T;
    const tick = () => { const u = Math.min(1, (T - t0) / D); const e = ease(u); conts.forEach((c, i) => { c.scrollLeft = before[i][0] + (after[i][0] - before[i][0]) * e; c.scrollTop = before[i][1] + (after[i][1] - before[i][1]) * e; }); if (u < 1) window.requestAnimationFrame(tick); };
    window.requestAnimationFrame(tick);
  };
  const scrollers = (el) => { const out = []; for (let e = el && el.parentElement; e; e = e.parentElement) if (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1) out.push(e); if (document.scrollingElement && !out.includes(document.scrollingElement)) out.push(document.scrollingElement); return out; };
  const siv = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (arg) {
    if (!(arg && typeof arg === 'object' && arg.behavior === 'smooth')) return siv.call(this, arg);
    const conts = scrollers(this); const before = conts.map((c) => [c.scrollLeft, c.scrollTop]);
    siv.call(this, Object.assign({}, arg, { behavior: 'auto' }));
    glide(conts, before);
  };
  const sto = Element.prototype.scrollTo;
  Element.prototype.scrollTo = function (a, b) {
    if (!(a && typeof a === 'object' && a.behavior === 'smooth')) return sto.call(this, a, b);
    const before = [[this.scrollLeft, this.scrollTop]];
    sto.call(this, Object.assign({}, a, { behavior: 'auto' }));
    glide([this], before);
  };
  const wsto = window.scrollTo.bind(window);
  window.scrollTo = (a, b) => {
    if (!(a && typeof a === 'object' && a.behavior === 'smooth')) return wsto(a, b);
    const se = document.scrollingElement; const before = [[se.scrollLeft, se.scrollTop]];
    wsto(Object.assign({}, a, { behavior: 'auto' }));
    glide([se], before);
  };
  // CSS の scroll-behavior: smooth も止める（scrollTop を入れたときに、ブラウザの時計で動いてしまうので）
  document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '*{scroll-behavior:auto!important}'; document.head.appendChild(st); });
  window.__vt = {
    get T() { return T; },
    /** ms だけ進める：その間に来る時計の仕事を順に済ませ、最後に描く（requestAnimationFrame）と CSS の動き */
    async step(ms) {
      const end = T + ms;
      for (let guard = 0; guard < 5000; guard++) {
        const d = due(end); if (!d) break;
        T = Math.max(T, d.t.at);
        if (d.t.every) { d.t.at += d.t.every; d.t.n = ++seq; } else timers.delete(d.id);
        try { if (typeof d.t.fn === 'function') d.t.fn(...d.t.args); } catch (e) { console.error(e); }
        for (let k = 0; k < 4; k++) await null;
      }
      T = end;
      const list = [...rafs.values()]; rafs = new Map();
      for (const f of list) { try { f(T); } catch (e) { console.error(e); } }
      for (let k = 0; k < 4; k++) await null;
      syncAnims();
    },
  };
})();`;

/** 1 こま分（ms）進める */
const step = (p, ms = 1000 / 30) => p.evaluate((ms) => window.__vt.step(ms), ms);
/** 撮らずに早送りしながら、条件が成り立つまで待つ（本当の時計で timeout まで） */
async function until(p, fn, arg, { timeout = 180000, chunk = 100, label = '' } = {}) {
  const t0 = Date.now();
  for (;;) {
    if (await p.evaluate(fn, arg).catch(() => false)) return true;
    if (Date.now() - t0 > timeout) { console.log('待ちきれない', label || String(fn).slice(0, 80)); return false; }
    await step(p, chunk);
    await new Promise((r) => setTimeout(r, 25));
  }
}
/** 撮らずに ms だけ早送り（仮の時計で） */
async function ff(p, ms, chunk = 100) {
  for (let t = 0; t < ms; t += chunk) { await step(p, Math.min(chunk, ms - t)); await new Promise((r) => setTimeout(r, 5)); }
}
module.exports = { INIT, step, until, ff };
