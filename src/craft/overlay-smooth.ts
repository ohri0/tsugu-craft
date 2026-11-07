// 動画の上に描く線（手の 21 点・ヤスリの線）を、やわらかく動かすための処理（2026-11-07 職人（石川）の声：
// 「学ぶのところの映像、ちょっとうるさいな、動きが。もうちょっと柔らかなトラッキング映像できないかな」）。
//
// 描くためだけに使う。判定の数（src/craft/pair-measure.ts・hand-judge.ts）は、ならす前の読んだ点のままで測る。
//   1. 1 こまだけ見つかった点（読み違いが多い）は描かない。1〜3 こまだけ見失った所は、前後から線でつなぐ。
//   2. 前後のこまと重みをつけて平均する（前後の時間がそろっているので、遅れが出ない）。
//   3. こまとこまの間の時刻は、前後のこまの間を線でつなぐ（10 こま／秒でも、カクカク跳ばない）。
//   4. 見えはじめ・見えなくなる所は、すっと薄くする（ぱっと出たり消えたりしない）。
// 画面に依存しない純粋な関数。

export interface SmoothOptions {
  /** 前後この秒のこまで平均する（重みは真ん中ほど大きい） */
  radiusS: number;
  /** 続けて見えた長さがこれより短ければ、描かない（秒） */
  minRunS: number;
  /** 見失った長さがこれ以下なら、前後から線でつなぐ（秒） */
  bridgeS: number;
  /** 見えはじめ・見えなくなる所で、薄くする長さ（秒） */
  fadeS: number;
}

// 2026-11-07 の いい例・よくない例（10 こま／秒）で絵を見て決めた。radiusS を 0.4 にすると、よくない例のヤスリのぶれまで消えて見えた
export const OVERLAY_SMOOTH: SmoothOptions = { radiusS: 0.2, minRunS: 0.15, bridgeS: 0.35, fadeS: 0.25 };

export type Vec = readonly number[];

/** ならした線（こまの時刻と、こまごとの値。見えないこまは null） */
export interface SmoothTrack {
  ts: number[];
  vs: (number[] | null)[];
  /** 続けて見えた所の、はじめと終わりの時刻 */
  runs: [number, number][];
  /** こまの間の時間の真ん中（秒） */
  step: number;
  fadeS: number;
}

const medianStep = (ts: readonly number[]) => {
  const d = ts.slice(1).map((t, i) => t - ts[i]).filter((x) => x > 0).sort((a, b) => a - b);
  return d.length ? d[d.length >> 1] : 0.1;
};

/** 続けて見えた所（こまの番号の、はじめと終わり） */
function runsOf(vs: readonly (Vec | null)[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < vs.length; i++) {
    if (!vs[i]) continue;
    let j = i;
    while (j + 1 < vs.length && vs[j + 1]) j++;
    out.push([i, j]);
    i = j;
  }
  return out;
}

/** こまごとの値（同じ長さの数の並び。見えないこまは null）を、描くためにならす */
export function smoothTrack(ts: readonly number[], frames: readonly (Vec | null)[], o: SmoothOptions = OVERLAY_SMOOTH): SmoothTrack {
  const n = Math.min(ts.length, frames.length);
  const step = medianStep(ts.slice(0, n));
  let vs: (number[] | null)[] = frames.slice(0, n).map((f) => (f ? f.slice() : null));
  // 1. 短い見失いを、前後から線でつなぐ
  for (let i = 1; i < n; i++) {
    if (vs[i] || !vs[i - 1]) continue;
    let j = i;
    while (j < n && !vs[j]) j++;
    if (j < n && ts[j] - ts[i - 1] <= o.bridgeS + step / 2 && vs[j]!.length === vs[i - 1]!.length) {
      const a = vs[i - 1]!;
      const b = vs[j]!;
      for (let k = i; k < j; k++) {
        const u = (ts[k] - ts[i - 1]) / (ts[j] - ts[i - 1] || 1);
        vs[k] = a.map((x, c) => x + (b[c] - x) * u);
      }
    }
    i = j;
  }
  // 2. 短すぎる「見えた」は描かない（1 こまだけの読み違い）
  for (const [s, e] of runsOf(vs)) {
    if (ts[e] - ts[s] + step < o.minRunS + 1e-9) for (let k = s; k <= e; k++) vs[k] = null;
  }
  // 3. 前後のこまと、重みをつけて平均する（見えたこまだけ。重みは真ん中ほど大きい）
  const sigma = Math.max(1e-6, o.radiusS / 2);
  const src = vs;
  vs = src.map((v, i) => {
    if (!v) return null;
    const sum = v.map(() => 0);
    let wsum = 0;
    for (let k = i; k >= 0 && ts[i] - ts[k] <= o.radiusS + 1e-9; k--) add(k);
    for (let k = i + 1; k < n && ts[k] - ts[i] <= o.radiusS + 1e-9; k++) add(k);
    function add(k: number) {
      const u = src[k];
      if (!u || u.length !== v!.length) return;
      const d = (ts[k] - ts[i]) / sigma;
      const w = Math.exp(-0.5 * d * d);
      for (let c = 0; c < u.length; c++) sum[c] += w * u[c];
      wsum += w;
    }
    return sum.map((x) => x / wsum);
  });
  return { ts: ts.slice(0, n), vs, runs: runsOf(vs).map(([s, e]) => [ts[s], ts[e]]), step, fadeS: o.fadeS };
}

/** その時刻の値と、濃さ（0〜1）。描かない時刻は null */
export function trackAt(tr: SmoothTrack, t: number): { v: number[]; alpha: number } | null {
  const { ts, vs, step } = tr;
  if (!ts.length) return null;
  const half = step / 2;
  const run = tr.runs.find(([s, e]) => t >= s - half && t <= e + half);
  if (!run) return null;
  // こまの間は、前後のこまを線でつなぐ
  let i = 0;
  while (i + 1 < ts.length && ts[i + 1] <= t) i++;
  const a = vs[i];
  const b = i + 1 < ts.length ? vs[i + 1] : null;
  let v: number[] | null;
  if (t < ts[0]) v = vs[0];
  else if (a && b) {
    const u = Math.min(1, Math.max(0, (t - ts[i]) / (ts[i + 1] - ts[i] || 1)));
    v = a.map((x, c) => x + (b[c] - x) * u);
  } else v = a ?? b;
  if (!v) return null;
  const edge = Math.min(t - (run[0] - half), run[1] + half - t);
  const alpha = tr.fadeS > 0 ? Math.min(1, Math.max(0, edge / tr.fadeS)) : 1;
  return { v, alpha };
}

/**
 * こまごとに 0〜2 本ある手を、同じ手どうしでつなぐ（手の並びの順は、こまごとに入れ替わることがある）。
 * 1 つ前に見えた位置（手の点の真ん中）にいちばん近い組み合わせを選ぶ。戻り値は手ごとの、こまの並び。
 */
export function splitHands(frames: readonly { hands: readonly Vec[] }[], slots = 2): (Vec | null)[][] {
  const out: (Vec | null)[][] = Array.from({ length: slots }, () => []);
  const last: ([number, number] | null)[] = Array.from({ length: slots }, () => null);
  const center = (h: Vec): [number, number] => {
    let x = 0;
    let y = 0;
    const m = Math.floor(h.length / 2);
    for (let k = 0; k < m; k++) {
      x += h[2 * k];
      y += h[2 * k + 1];
    }
    return [x / m, y / m];
  };
  // まだ一度も見えていない入れ物へ入れるときの重さ（画面の幅・高さを 1 として）
  const NEW = 0.35;
  for (const f of frames) {
    const hs = f.hands.slice(0, slots);
    const cs = hs.map(center);
    // 入れ方をすべて試す（手は 2 本までなので少ない）
    let best: number[] = [];
    let bestCost = Infinity;
    const perm = (used: boolean[], pick: number[]) => {
      if (pick.length === hs.length) {
        const cost = pick.reduce((s, slot, h) => s + (last[slot] ? Math.hypot(cs[h][0] - last[slot]![0], cs[h][1] - last[slot]![1]) : NEW), 0);
        if (cost < bestCost) [bestCost, best] = [cost, pick.slice()];
        return;
      }
      for (let s = 0; s < slots; s++) if (!used[s]) {
        used[s] = true;
        pick.push(s);
        perm(used, pick);
        pick.pop();
        used[s] = false;
      }
    };
    perm(Array(slots).fill(false), []);
    for (let s = 0; s < slots; s++) out[s].push(null);
    best.forEach((slot, h) => {
      out[slot][out[slot].length - 1] = hs[h];
      last[slot] = cs[h];
    });
  }
  return out;
}

/** 直前 holdS 秒に一度でも立った印を、立ちつづけているとみなす（ぱっと出て消える札を、読める長さだけ出しておく） */
export function holdFlag(hits: readonly boolean[], ts: readonly number[], holdS: number): boolean[] {
  let lastHit = -Infinity;
  return hits.map((h, i) => {
    if (h) lastHit = ts[i];
    return ts[i] - lastHit <= holdS + 1e-9;
  });
}
