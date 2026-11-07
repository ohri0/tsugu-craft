// 模様の見込みの 2 つの計算（重ねた層：pattern-sim.ts、1 枚の板：pattern-relief.ts）で使う、並べる・散らす物の置き場所と、鏨の形。画面に依存しない純粋な関数。
//
// 置き場所：前は「幅の中に across 個」の格子だけで、板全体の数は across の 2 乗になった。手がかりの「10 ほど」に Claude が幅の中 8 を選び、
// 板全体で 60 ほどの丸になった（2026-11-07 夜、くせのある架空の技の通し）。そこで、板全体（品物 1 つ）の数 count で置く方法を足した。
// count で置くときは、ちょうど count 個を、列に並べる（rows）か、ばらばらに散らす（scatter：となりと離れるように選ぶ）。
// 鏨の形：葉（先がとがり、根元が丸い）と、花（5 枚の花びら）。1 枚の板の打ち出しと、重ねた板の打ち出し・彫りの両方で同じ形を使う。

/** 決まった散らばり（同じ i, j, k, たねなら同じ 0〜1） */
function hash(i: number, j: number, k: number, seed: number): number {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647 + seed * 974634469) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const jit = (i: number, j: number, k: number, seed: number) => 2 * hash(i, j, k, seed) - 1;

/** count 個の置き場所。いちばん近い物を早く探すために、間かくほどの升に分けておく */
export interface Spots {
  /** 置いた数 */
  count: number;
  /** x, y の順 */
  pts: Float64Array;
  /** ならした間かく（面積 ÷ 数 の平方根） */
  a: number;
  w: number;
  h: number;
  gw: number;
  gh: number;
  /** 升ごとの物の番号 */
  cells: number[][];
}

export interface SpotOpts {
  /** rows：列に並べる。scatter：ばらばらに散らす（となりと離れる所を選ぶ） */
  arrange: "rows" | "scatter";
  /** rows の手のずれ（間かくに対して） */
  jitter?: number;
  /** rows で 1 列おきに少しずらす */
  stagger?: boolean;
  /** scatter で、板のふちから離す幅（板の幅に対して。物がふちで切れないように） */
  margin?: number;
}

/** 板（w × h）の上に、count 個を置く。同じ値とたねなら同じ所 */
export function makeSpots(count: number, w: number, h: number, seed: number, o: SpotOpts): Spots {
  const n = Math.max(1, Math.round(count));
  const a = Math.sqrt((w * h) / n);
  const pts = new Float64Array(2 * n);
  if (o.arrange === "rows") {
    // 列の数と行の数を、板の形に合わせる。最後の行が欠けるときは、その行を真ん中に寄せる
    const c = Math.max(1, Math.min(n, Math.round(Math.sqrt((n * w) / h))));
    const r = Math.ceil(n / c);
    const ax = w / c;
    const ay = h / r;
    const J = o.jitter ?? 0;
    for (let k = 0; k < n; k++) {
      const j = Math.floor(k / c);
      const m = j < r - 1 ? c : n - c * (r - 1);
      const i = k - j * c;
      const sx = o.stagger && r > 1 && m === c ? (j % 2 ? 0.25 : -0.25) : 0;
      pts[2 * k] = (i + 0.5 + (c - m) / 2 + sx + J * jit(k, 0, 61, seed)) * ax;
      pts[2 * k + 1] = (j + 0.5 + J * jit(k, 0, 62, seed)) * ay;
    }
  } else {
    // となりと離れる所を、いくつかの候補から選ぶ（ばらばらだが、固まりすぎない）
    const m = Math.min(o.margin ?? 0.3 * a, 0.45 * Math.min(w, h));
    const tries = 14;
    for (let k = 0; k < n; k++) {
      let bx = 0;
      let by = 0;
      let best = -1;
      for (let t = 0; t < tries; t++) {
        const x = m + (w - 2 * m) * hash(k, t, 63, seed);
        const y = m + (h - 2 * m) * hash(k, t, 64, seed);
        let near = Infinity;
        for (let q = 0; q < k; q++) near = Math.min(near, Math.hypot(x - pts[2 * q], y - pts[2 * q + 1]));
        if (near > best) {
          best = near;
          bx = x;
          by = y;
        }
      }
      pts[2 * k] = bx;
      pts[2 * k + 1] = by;
    }
  }
  const gw = Math.max(1, Math.ceil(w / a));
  const gh = Math.max(1, Math.ceil(h / a));
  const cells: number[][] = Array.from({ length: gw * gh }, () => []);
  for (let k = 0; k < n; k++) {
    const i = Math.min(gw - 1, Math.max(0, Math.floor(pts[2 * k] / a)));
    const j = Math.min(gh - 1, Math.max(0, Math.floor(pts[2 * k + 1] / a)));
    cells[j * gw + i].push(k);
  }
  return { count: n, pts, a, w, h, gw, gh, cells };
}

/** いちばん近い物（間かくの 1 升となりまで探す。それより遠い物は、描く大きさの外）。i が物の番号、j は 0 */
export function nearestSpot(s: Spots, x: number, y: number): { d: number; dx: number; dy: number; i: number; j: number } {
  const ci = Math.floor(x / s.a);
  const cj = Math.floor(y / s.a);
  let best = { d: Infinity, dx: 0, dy: 0, i: 0, j: 0 };
  for (let j = cj - 1; j <= cj + 1; j++) {
    if (j < 0 || j >= s.gh) continue;
    for (let i = ci - 1; i <= ci + 1; i++) {
      if (i < 0 || i >= s.gw) continue;
      for (const k of s.cells[j * s.gw + i]) {
        const dx = x - s.pts[2 * k];
        const dy = y - s.pts[2 * k + 1];
        const d = Math.hypot(dx, dy);
        if (d < best.d) best = { d, dx, dy, i: k, j: 0 };
      }
    }
  }
  return best;
}

/** 点 (x, y) の近くの物（間かくの 1 升となりまで）ごとに fn(番号, x − 中心, y − 中心) を呼ぶ（となりの物と形が重なるときに、深い方を取るため） */
export function eachSpotNear(s: Spots, x: number, y: number, fn: (k: number, dx: number, dy: number) => void): void {
  const ci = Math.floor(x / s.a);
  const cj = Math.floor(y / s.a);
  for (let j = cj - 1; j <= cj + 1; j++) {
    if (j < 0 || j >= s.gh) continue;
    for (let i = ci - 1; i <= ci + 1; i++) {
      if (i < 0 || i >= s.gw) continue;
      for (const k of s.cells[j * s.gw + i]) fn(k, x - s.pts[2 * k], y - s.pts[2 * k + 1]);
    }
  }
}

const cache = new WeakMap<object, Map<string, Spots>>();

/** 操作ごとに覚えておく makeSpots（1 点ごとに作り直さない）。key は操作のオブジェクト */
export function spotsFor(key: object, count: number, w: number, h: number, seed: number, o: SpotOpts): Spots {
  let m = cache.get(key);
  if (!m) cache.set(key, (m = new Map()));
  const k = `${count}|${w}|${h}|${seed}|${o.arrange}|${o.jitter ?? 0}|${o.stagger ? 1 : 0}|${o.margin ?? -1}`;
  let s = m.get(k);
  if (!s) m.set(k, (s = makeSpots(count, w, h, seed, o)));
  return s;
}

/**
 * 葉の形のふくらみ（真ん中で 1 ほど、外で 0）。(dx, dy) は葉の真ん中からの位置、L は葉の長さの半分、a は向き。
 * 根元から先へ細くなり、真ん中の葉脈と斜めの細い葉脈が少しくぼむ
 */
export function leafBump(dx: number, dy: number, L: number, a: number): number {
  const l = (dx * Math.cos(a) + dy * Math.sin(a)) / L;
  const w = (-dx * Math.sin(a) + dy * Math.cos(a)) / L;
  if (!(l > -1 && l < 1)) return 0;
  // 根元（l = -1）寄りが太い
  const half = 0.36 * Math.sqrt(1 - l * l) * (1 - 0.3 * l);
  const bendW = w - 0.12 * (1 - l * l);
  const q = Math.abs(bendW) / half;
  if (q >= 1) return 0;
  const ph = (l - 2.2 * Math.abs(bendW)) * 3.4;
  const lateral = Math.exp(-((ph - Math.floor(ph) - 0.5) ** 2) / 0.01);
  const vein = 1 - 0.22 * Math.exp(-((bendW / 0.03) ** 2)) - (q > 0.15 ? 0.07 * lateral : 0);
  return (1 - q * q) ** 0.7 * Math.sqrt(1 - l * l) * vein;
}

/**
 * 花の形のふくらみ：真ん中の小さな丸と、まわりの 5 枚の花びら。花びらは根元が細く先が丸い、すじが少しくぼむ。
 * (dx, dy) は花の真ん中からの位置、R は花びらの長さ、a0 は 1 枚目の向き
 */
export function flowerBump(dx: number, dy: number, R: number, a0: number): number {
  const d = Math.hypot(dx, dy);
  let b = 0.75 * Math.exp(-((d / (0.2 * R)) ** 2));
  for (let k = 0; k < 5; k++) {
    const a = a0 + (2 * Math.PI * k) / 5;
    const l = dx * Math.cos(a) + dy * Math.sin(a);
    const w = -dx * Math.sin(a) + dy * Math.cos(a);
    const t = l / R;
    if (t <= 0.05 || t >= 1.05) continue;
    const half = 0.3 * R * Math.sqrt(Math.max(0, Math.sin(Math.PI * Math.min(1, t) * 0.92)));
    const q = Math.abs(w) / Math.max(1e-6, half);
    if (q >= 1) continue;
    const crease = 1 - 0.18 * Math.exp(-((w / (0.05 * R)) ** 2));
    b = Math.max(b, (1 - q * q) ** 0.6 * Math.sin(Math.PI * Math.min(1, t)) ** 0.5 * crease);
  }
  return b;
}

/**
 * 層の厚さの割合から、層のさかいの深さ（0〜1、n + 1 個）を作る。thickness は材料の順で、n 枚の層にくり返して使う。
 * 無い・空・どれも同じ厚さなら undefined（同じ厚さの層として、前と同じ計算にする）
 */
export function layerEdges(thickness: readonly number[] | undefined, n: number): number[] | undefined {
  const t = (thickness ?? []).filter((v) => Number.isFinite(v) && v > 0);
  if (!t.length || t.length !== (thickness ?? []).length) return undefined;
  const per = Array.from({ length: n }, (_, k) => t[k % t.length]);
  if (per.every((v) => v === per[0])) return undefined;
  const sum = per.reduce((a, b) => a + b, 0);
  const out = [0];
  for (const v of per) out.push(out[out.length - 1] + v / sum);
  out[n] = 1;
  return out;
}

/** 深さ u（0〜1）が、さかい edges の何番の層の中の、どこにあるか（層の番号 + 層の中の割合。同じ厚さなら u × 層の数） */
export function layerCoordOf(edges: readonly number[] | undefined, n: number, u: number): number {
  if (!edges) return u * n;
  if (u <= 0) return u / Math.max(1e-9, edges[1]);
  if (u >= 1) return n + (u - 1) / Math.max(1e-9, 1 - edges[n - 1]);
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (edges[m] <= u) lo = m;
    else hi = m;
  }
  return lo + (u - edges[lo]) / Math.max(1e-9, edges[lo + 1] - edges[lo]);
}
