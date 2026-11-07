// 動画の上に描く線（手の 21 点・ヤスリの線）を、やわらかく動かすための処理（2026-11-07 職人（石川）の声：
// 「学ぶのところの映像、ちょっとうるさいな、動きが。もうちょっと柔らかなトラッキング映像できないかな」）。
//
// 描くためだけに使う。判定の数（src/craft/pair-measure.ts・hand-judge.ts）は、ならす前の読んだ点のままで測る。
//   1. 1 こまだけ見つかった点（読み違いが多い）は描かない。1〜3 こまだけ見失った所は、前後から線でつなぐ。
//   2. 前後のこまと重みをつけて平均する（前後の時間がそろっているので、遅れが出ない）。
//   3. こまとこまの間の時刻は、前後のこまの間を線でつなぐ（10 こま／秒でも、カクカク跳ばない）。
//   4. 見えはじめ・見えなくなる所は、すっと薄くする（ぱっと出たり消えたりしない）。
//   5.（2026-11-08 画面の見どころで、手の骨組みが手から離れて浮くこまがあった。時刻のずれではなく、読み違いの手（暗い所の小さな手・
//      親指だけを手と読んだ物）と、別の所の手どうしを「つなぐ・まぜる」ことが原因だった）
//      前のこまから大きく跳んだら別の手とみなし、つながない・まぜない。つないだ（見ていない）こまは薄く描く。
//      ほかの手よりずっと小さい手は、読み違いとして描かない（plausibleHands）。
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
  /** 前のこまからこれより大きく跳んだら、別の物とみなす（dist で測る。なければ跳びを見ない） */
  maxJump?: number;
  /** 見失った所をつないだ（見ていない）こまの濃さ（0〜1。なければ 1） */
  bridgeAlpha?: number;
}

// 2026-11-07 の いい例・よくない例（10 こま／秒）で絵を見て決めた。radiusS を 0.4 にすると、よくない例のヤスリのぶれまで消えて見えた
export const OVERLAY_SMOOTH: SmoothOptions = { radiusS: 0.2, minRunS: 0.15, bridgeS: 0.35, fadeS: 0.25 };

/**
 * 手の骨組み用（2026-11-08）。跳び：手のひらの真ん中が 1 こまで画面の高さの 0.12 より動いたら別の手（ヤスリがけの手は 0.1 秒でそこまで動かない）。
 * 2 こま（0.2 秒）より短く続いた手は描かない。つないだこまは半分の濃さ。どれも、いい例・よくない例の絵を 0.5 秒ごとに見て決めた仮の値。
 */
export const HAND_OVERLAY: SmoothOptions = { ...OVERLAY_SMOOTH, minRunS: 0.25, maxJump: 0.12, bridgeAlpha: 0.5 };

/** ほかの手の真ん中の大きさに対して、これより小さい手は読み違い（暗い所に出る小さな手） */
export const HAND_MIN_SCALE = 0.45;

export type Vec = readonly number[];

/** 手（21 点 × x,y）の、手のひらの真ん中（手首と指の付け根 4 つの平均） */
export function palmCenter(h: Vec): [number, number] {
  const P = [0, 5, 9, 13, 17];
  return [P.reduce((s, k) => s + h[2 * k], 0) / P.length, P.reduce((s, k) => s + h[2 * k + 1], 0) / P.length];
}

/** 手どうしの離れ（手のひらの真ん中の距離。画面の高さを 1 とし、横は aspect＝幅÷高さ をかける） */
export const handDist = (aspect: number) => (a: Vec, b: Vec) => {
  const [ax, ay] = palmCenter(a);
  const [bx, by] = palmCenter(b);
  return Math.hypot((ax - bx) * aspect, ay - by);
};

/** 手の大きさ（手首と小指の付け根の距離。画面の高さを 1 として） */
const handScale = (h: Vec, aspect: number) => Math.hypot((h[0] - h[34]) * aspect, h[1] - h[35]);

/** ほかの手よりずっと小さい手（読み違い）を除く。手の点そのものは変えない（判定には使わない、描くための選び） */
export function plausibleHands<F extends { hands: readonly Vec[] }>(frames: readonly F[], aspect: number, minScale = HAND_MIN_SCALE): Vec[][] {
  const all = frames.flatMap((f) => f.hands.map((h) => handScale(h, aspect))).sort((a, b) => a - b);
  if (!all.length) return frames.map(() => []);
  const median = all[all.length >> 1];
  return frames.map((f) => f.hands.filter((h) => handScale(h, aspect) >= minScale * median));
}

/** ならした線（こまの時刻と、こまごとの値。見えないこまは null） */
export interface SmoothTrack {
  ts: number[];
  vs: (number[] | null)[];
  /** こまごとの濃さ（読んだこまは 1、つないだこまは薄い、見えないこまは 0） */
  conf: number[];
  /** こまごとの続きの番号（見えないこまは -1） */
  seg: number[];
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

/** 続けて見えた所（こまの番号の、はじめと終わり）。seg はこまごとの続きの番号（見えないこまは -1） */
function runsOf(seg: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < seg.length; i++) {
    if (seg[i] < 0) continue;
    let j = i;
    while (j + 1 < seg.length && seg[j + 1] === seg[i]) j++;
    out.push([i, j]);
    i = j;
  }
  return out;
}

/** こまごとの値（同じ長さの数の並び。見えないこまは null）を、描くためにならす。dist を渡すと、跳んだ所で切る（opts.maxJump） */
export function smoothTrack(ts: readonly number[], frames: readonly (Vec | null)[], o: SmoothOptions = OVERLAY_SMOOTH, dist?: (a: Vec, b: Vec) => number): SmoothTrack {
  const n = Math.min(ts.length, frames.length);
  const step = medianStep(ts.slice(0, n));
  let vs: (number[] | null)[] = frames.slice(0, n).map((f) => (f ? f.slice() : null));
  const jumped = (a: Vec, b: Vec) => !!dist && o.maxJump !== undefined && dist(a, b) > o.maxJump;
  // 見えたこまの濃さ（読んだこまは 1、つないだこまは bridgeAlpha）
  const conf: number[] = vs.map((v) => (v ? 1 : 0));
  // 1. 短い見失いを、前後から線でつなぐ（前後が離れすぎていれば、別の物なのでつながない）
  for (let i = 1; i < n; i++) {
    if (vs[i] || !vs[i - 1]) continue;
    let j = i;
    while (j < n && !vs[j]) j++;
    if (j < n && ts[j] - ts[i - 1] <= o.bridgeS + step / 2 && vs[j]!.length === vs[i - 1]!.length && !jumped(vs[i - 1]!, vs[j]!)) {
      const a = vs[i - 1]!;
      const b = vs[j]!;
      for (let k = i; k < j; k++) {
        const u = (ts[k] - ts[i - 1]) / (ts[j] - ts[i - 1] || 1);
        vs[k] = a.map((x, c) => x + (b[c] - x) * u);
        conf[k] = o.bridgeAlpha ?? 1;
      }
    }
    i = j;
  }
  // 続けて見えた所に番号をつける（跳んだ所でも分ける）
  const seg: number[] = vs.map(() => -1);
  let id = -1;
  for (let i = 0; i < n; i++) {
    if (!vs[i]) continue;
    if (i === 0 || !vs[i - 1] || jumped(vs[i - 1]!, vs[i]!)) id++;
    seg[i] = id;
  }
  // 2. 短すぎる「見えた」は描かない（1 こまだけの読み違い）
  for (const [s, e] of runsOf(seg)) {
    if (ts[e] - ts[s] + step < o.minRunS + 1e-9) for (let k = s; k <= e; k++) [vs[k], seg[k], conf[k]] = [null, -1, 0];
  }
  // 3. 前後のこまと、重みをつけて平均する（同じ続きの中の、見えたこまだけ。重みは真ん中ほど大きい）
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
      if (!u || u.length !== v!.length || seg[k] !== seg[i]) return;
      const d = (ts[k] - ts[i]) / sigma;
      const w = Math.exp(-0.5 * d * d);
      for (let c = 0; c < u.length; c++) sum[c] += w * u[c];
      wsum += w;
    }
    return sum.map((x) => x / wsum);
  });
  return { ts: ts.slice(0, n), vs, conf, seg, runs: runsOf(seg).map(([s, e]) => [ts[s], ts[e]]), step, fadeS: o.fadeS };
}

/** その時刻の値と、濃さ（0〜1）。描かない時刻は null */
export function trackAt(tr: SmoothTrack, t: number): { v: number[]; alpha: number } | null {
  const { ts, vs, step } = tr;
  if (!ts.length) return null;
  const half = step / 2;
  // 2 つの続きが接する所では、近いほうの続き
  const near = (r: [number, number]) => (t < r[0] ? r[0] - t : t > r[1] ? t - r[1] : 0);
  const run = tr.runs.filter(([s, e]) => t >= s - half && t <= e + half).sort((a, b) => near(a) - near(b))[0];
  if (!run) return null;
  // こまの間は、前後のこまを線でつなぐ（同じ続きの中だけ）
  let i = 0;
  while (i + 1 < ts.length && ts[i + 1] <= t) i++;
  const inRun = (k: number) => k >= 0 && k < ts.length && !!vs[k] && ts[k] >= run[0] - 1e-9 && ts[k] <= run[1] + 1e-9;
  const a = inRun(i) ? vs[i] : null;
  const b = inRun(i + 1) ? vs[i + 1] : null;
  let v: number[] | null;
  let c: number;
  if (a && b) {
    const u = Math.min(1, Math.max(0, (t - ts[i]) / (ts[i + 1] - ts[i] || 1)));
    v = a.map((x, k) => x + (b[k] - x) * u);
    c = tr.conf[i] + (tr.conf[i + 1] - tr.conf[i]) * u;
  } else {
    v = a ?? b;
    c = a ? tr.conf[i] : tr.conf[i + 1] ?? 1;
  }
  if (!v) return null;
  const edge = Math.min(t - (run[0] - half), run[1] + half - t);
  const alpha = (tr.fadeS > 0 ? Math.min(1, Math.max(0, edge / tr.fadeS)) : 1) * c;
  return { v, alpha };
}

/**
 * こまごとに 0〜2 本ある手を、同じ手どうしでつなぐ（手の並びの順は、こまごとに入れ替わることがある）。
 * 1 つ前に見えた位置（手の点の真ん中）にいちばん近い組み合わせを選ぶ。戻り値は手ごとの、こまの並び。
 * こまに時刻 t があれば、forgetS 秒より前に見えた位置は忘れる（長く見えなかった手の位置に、別の手を引き寄せない）。
 */
export function splitHands(frames: readonly { hands: readonly Vec[]; t?: number }[], slots = 2, forgetS = Infinity): (Vec | null)[][] {
  const out: (Vec | null)[][] = Array.from({ length: slots }, () => []);
  const last: ([number, number] | null)[] = Array.from({ length: slots }, () => null);
  const lastT: number[] = Array.from({ length: slots }, () => -Infinity);
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
    if (f.t !== undefined) for (let s = 0; s < slots; s++) if (f.t - lastT[s] > forgetS + 1e-9) last[s] = null;
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
      if (f.t !== undefined) lastT[slot] = f.t;
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
