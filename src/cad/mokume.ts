// 木目金の模様：どの層が表に出るか（層の番号の場）を作る。画面に依存しない純粋な関数。
//
// 考え方（ほんとうの金属の変形は計算しない。形の考え方だけ）：
// - 色のちがう金属の薄い層を、たくさん重ねた板とする。層の厚みはどれも同じ。表に出る層の番号 ＝ 表の深さ z（板の厚みに対して 0〜1）× 層の数。
// - 重ねて叩きのばした板は、層がゆるく波打つ。表を平らに削ると、その波の分だけ層の境が流れる線になって出る（木目の流れ）。
// - 彫る：丸いくぼみを、大きさも深さもいろいろに彫る。平らにすると、くぼみの所では深い層が表に出て、
//   まわりに層が細い輪になって並ぶ（木の年輪のような目）。深く彫るほど、一つの目の輪が多い。層が多いほど、輪は細く多い。
// - 叩いてのばすと、くぼみは一方へ少しのび、場所も少しゆがむ（目が楕円になり、線がなめらかに流れる）。
// 下の大きさ・強さの値は、見た目のための目安（職人の決まりや出典の値ではない）。作るときの値は「作り方」の側で出典つきで示す。
import { rng } from "../rebuild/sim";

export interface MokumeParams {
  /** 層の数 */
  layers: number;
  /** 彫る深さ（板の厚みに対して、0〜1） */
  depth: number;
  /** 彫る数 */
  pits: number;
  /** 乱数のたね（同じなら同じ模様） */
  seed: number;
}

/** 1 枚の大きさ（mm）。くり返して貼る */
export const MOKUME_TILE_MM = 30;

/** 見た目のための形の値（1 枚の大きさに対して） */
const LOOK = {
  /** 削った面の平均の深さと、層の波の高さ（板の厚みに対して） */
  base: 0.2,
  wave: 0.15,
  /** 叩きのばした向きにそろう、細かめの層の波（木目の平行な線） */
  grain: 0.045,
  /** 叩いたあとの細かいゆらぎ（板の厚みに対して） */
  ripple: 0.006,
  /** 場所のゆがみ（1 枚に対して） */
  warp: 0.045,
  /** くぼみの広さ（1 枚に対して、小さい〜大きい）と、叩いてのびる向きの伸び */
  rMin: 0.08,
  rMax: 0.2,
  stretch: 1.75,
  /** いちばん深い所（板を彫り抜かない） */
  floor: 0.985,
};

/** くり返す（整数の波の数の）ゆるい波を重ねたもの。値はおよそ −1〜1 */
interface Wave {
  fx: number;
  fy: number;
  ph: number;
  w: number;
}
function makeWaves(rand: () => number, count: number, fxMax: number, fyMin: number, fyMax: number): Wave[] {
  const ws: Wave[] = [];
  let sum = 0;
  for (let k = 0; k < count; k++) {
    const w = 1 / (k + 1);
    ws.push({ fx: Math.floor(rand() * (fxMax + 1)) * (rand() < 0.5 ? -1 : 1), fy: fyMin + Math.floor(rand() * (fyMax - fyMin + 1)), ph: rand() * Math.PI * 2, w });
    sum += w;
  }
  for (const x of ws) x.w /= sum;
  return ws;
}
const TAU = Math.PI * 2;
function waveAt(ws: readonly Wave[], u: number, v: number): number {
  let s = 0;
  for (const w of ws) s += w.w * Math.sin(TAU * (w.fx * u + w.fy * v) + w.ph);
  return s;
}

interface Pit {
  x: number;
  y: number;
  /** 広さ（のびる向き・その直角の向き）と、のびる向き（ラジアン） */
  ra: number;
  rb: number;
  cos: number;
  sin: number;
  /** 深さ（板の厚みに対して） */
  d: number;
}

function makePits(p: MokumeParams, rand: () => number): Pit[] {
  return Array.from({ length: Math.max(0, Math.round(p.pits)) }, () => {
    // 小さい目が多く、大きい目が少し
    const r = LOOK.rMin + (LOOK.rMax - LOOK.rMin) * rand() ** 1.6;
    const a = (rand() - 0.5) * 0.7;
    return { x: rand(), y: rand(), ra: r * LOOK.stretch, rb: r / LOOK.stretch, cos: Math.cos(a), sin: Math.sin(a), d: p.depth * (0.55 + 0.45 * rand()) };
  });
}

/** 重なったくぼみは、深い方が残る（削った所はもう戻らない）。境目で角が立たないよう、なめらかな「大きい方」にする */
const SHARP = 28;

/** 端と端をつないだ（くり返す）ときの差 */
const wrap = (a: number) => a - Math.round(a);

/** くぼみの形：真ん中がいちばん深く、ふちへなめらかに 0 になる（ふちで段ができない）。
 *  まわりへ行くほど浅く広がるので、目の輪は真ん中ほど細かく、外ほどゆったり並ぶ */
function bump(q2: number): number {
  if (q2 >= 1) return 0;
  const t = 1 - Math.sqrt(q2);
  return t * t;
}

/** 削った面の深さ zb に、彫った深さ c を足す。深くなるほどなめらかに止まり、板の底は抜かない */
function carved(zb: number, c: number): number {
  const z0 = Math.max(0, zb);
  const room = LOOK.floor - z0;
  return room > 0 ? z0 + room * (1 - Math.exp(-c / room)) : LOOK.floor;
}

/**
 * n × n のこまの、層の番号（小数）。上から k 番目の層が出ていれば k〜k+1。上下左右はつながっている（くり返して貼れる）。
 * 色は Math.floor(値) の層の色。境目をなめらかにするには、となりのこまとの差（傾き）を使う。
 */
export function mokumeField(p: MokumeParams, n: number): Float32Array {
  const rand = rng(p.seed * 7919 + 13);
  const layers = Math.max(1, p.layers);
  // 層の波：木目が横へ流れるよう、縦の波を多めに
  const wave = makeWaves(rand, 6, 2, 1, 4);
  const ripple = makeWaves(rand, 4, 4, 4, 9);
  const grain = makeWaves(rand, 3, 1, 5, 9);
  const warpU = makeWaves(rand, 3, 2, 1, 3);
  const warpV = makeWaves(rand, 3, 2, 1, 3);
  const pits = makePits(p, rand);

  // ゆがめた場所（くぼみはこの場所で測る）と、削った面の深さ。どちらもゆるやかなので、粗い格子で測って間を補う（速さのため）
  const m = Math.min(n, 256);
  const cu = new Float32Array(m * m);
  const cv = new Float32Array(m * m);
  const cz = new Float32Array(m * m);
  for (let j = 0; j < m; j++) {
    const v = (j + 0.5) / m;
    for (let i = 0; i < m; i++) {
      const u = (i + 0.5) / m;
      const o = j * m + i;
      const du = LOOK.warp * waveAt(warpU, u, v);
      const dv = LOOK.warp * waveAt(warpV, u, v);
      cu[o] = du;
      cv[o] = dv;
      cz[o] = LOOK.base + LOOK.wave * waveAt(wave, u + du, v + dv) + LOOK.grain * waveAt(grain, u + du, v + dv) + LOOK.ripple * waveAt(ripple, u, v);
    }
  }
  const wu = new Float32Array(n * n);
  const wv = new Float32Array(n * n);
  const z = new Float32Array(n * n);
  const s = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const fy = ((j + 0.5) * m) / n - 0.5;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const r0 = ((y0 % m) + m) % m;
    const r1 = (r0 + 1) % m;
    for (let i = 0; i < n; i++) {
      const fx = ((i + 0.5) * m) / n - 0.5;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const c0 = ((x0 % m) + m) % m;
      const c1 = (c0 + 1) % m;
      const a = r0 * m + c0;
      const b = r0 * m + c1;
      const c = r1 * m + c0;
      const d = r1 * m + c1;
      const w00 = (1 - tx) * (1 - ty);
      const w10 = tx * (1 - ty);
      const w01 = (1 - tx) * ty;
      const w11 = tx * ty;
      const o = j * n + i;
      wu[o] = (i + 0.5) / n + cu[a] * w00 + cu[b] * w10 + cu[c] * w01 + cu[d] * w11;
      wv[o] = (j + 0.5) / n + cv[a] * w00 + cv[b] * w10 + cv[c] * w01 + cv[d] * w11;
      z[o] = cz[a] * w00 + cz[b] * w10 + cz[c] * w01 + cz[d] * w11;
    }
  }

  // くぼみ：それぞれの広さの箱の中だけを足す（ゆがみの分だけ箱を広げる）
  const pad = LOOK.warp * 1.05;
  for (const pt of pits) {
    // 箱が 1 枚より広いと同じこまを 2 度足すので、箱は 1 枚より小さく保つ
    const R = Math.min(0.49, Math.max(pt.ra, pt.rb) + pad);
    const i0 = Math.floor((pt.x - R) * n);
    const i1 = Math.ceil((pt.x + R) * n);
    const j0 = Math.floor((pt.y - R) * n);
    const j1 = Math.ceil((pt.y + R) * n);
    const ia = 1 / (pt.ra * pt.ra);
    const ib = 1 / (pt.rb * pt.rb);
    for (let jj = j0; jj <= j1; jj++) {
      const j = ((jj % n) + n) % n;
      for (let ii = i0; ii <= i1; ii++) {
        const i = ((ii % n) + n) % n;
        const o = j * n + i;
        const dx = wrap(wu[o] - pt.x);
        const dy = wrap(wv[o] - pt.y);
        const a = dx * pt.cos + dy * pt.sin;
        const b = -dx * pt.sin + dy * pt.cos;
        const q2 = a * a * ia + b * b * ib;
        if (q2 < 1) s[o] += Math.exp(SHARP * pt.d * bump(q2)) - 1;
      }
    }
  }

  const out = new Float32Array(n * n);
  for (let o = 0; o < n * n; o++) out[o] = Math.min(layers - 1e-4, carved(z[o], Math.log1p(s[o]) / SHARP) * layers);
  return out;
}

/** 1 行に沿って、層の境目をいくつまたぐか（模様の細かさの目安） */
export function bandCrossings(field: Float32Array, n: number, row: number): number {
  let c = 0;
  for (let i = 1; i < n; i++) c += Math.abs(Math.floor(field[row * n + i]) - Math.floor(field[row * n + i - 1]));
  return c;
}
