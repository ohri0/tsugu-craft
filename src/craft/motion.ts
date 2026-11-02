// 手の記録：手の点（1 こまごとに 21 点 × 2 本の手まで）から、動きの数字を出す。画面に依存しない純粋な関数。
//
// 分かるのは「動き」と「数字」だけ。技そのもの（なぜそう動かすか）は職人の言葉（メモ）で残す。
// - 位置は手のひらの中心（手首と 4 本の指の付け根の平均）。手首 1 点よりぶれが小さい。
// - 長さは「手のひらの長さ」（手首〜中指の付け根）を 1 とする。撮る距離が違う動画どうしでも比べられるように。
// - 手の向きは、手首 → 中指の付け根の向き（腕の向きの代わり。腕そのものは読まない）。0° は指先が画面の右、90° は上。
// - 1 回の動き（打つ・削る・やすりをかける）は、いちばん大きく動く向きに位置を写した 1 本の波で数える。
//   ゆっくりした位置のずれは、1 回ぶんの長さの移動平均で引いてから、上下 2 本のしきい値（ヒステリシス）で数える。
//   細かいぶれでは数が増えないように、振れ幅の下限も持つ。

export interface LandmarkPoint {
  /** 0〜1（画面の幅に対して） */
  x: number;
  /** 0〜1（画面の高さに対して。下ほど大きい） */
  y: number;
  z?: number;
}

export interface HandObservation {
  /** 21 点（MediaPipe の手の点の並び） */
  landmarks: LandmarkPoint[];
  handedness?: string;
  score?: number;
}

export interface MotionFrame {
  /** 動画の中の時刻（秒） */
  t: number;
  hands: HandObservation[];
}

export interface MotionInput {
  frames: MotionFrame[];
  /** 画面の幅 ÷ 高さ（x と y の長さをそろえるため） */
  aspect: number;
  /** 動画の長さ（秒）。なければこまの時刻から */
  durationS?: number;
}

/** 動きの読み方の値（ここ 1 か所に置く） */
export const MOTION = {
  /** これより短く手が消えたときは、前後をつないで埋める（秒） */
  maxGapS: 0.3,
  /** ぶれをならす幅（片側、秒）。こま数が変わっても同じ時間の幅でならす（広いと速い動きがつぶれる） */
  smoothHalfS: 0.05,
  /** 1 回の動きとして数える長さの範囲（秒） */
  minPeriodS: 0.15,
  maxPeriodS: 6,
  /** 1 回の長さが分からないとき、ゆっくりしたずれを引く窓（秒） */
  defaultTrendS: 2,
  /** しきい値の下限（手のひらの長さに対して）。これより小さい揺れは数えない */
  hysteresisFloor: 0.06,
  /** しきい値は、波の大きさのこの割合 */
  hysteresisFrac: 0.3,
  /** 1 回の振れ幅の下限（行き帰りの幅、手のひらの長さに対して） */
  minStrokeAmp: 0.15,
  /** 間隔がふつうのこの倍より長いときは、休みとして間隔に入れない */
  breakFactor: 2.5,
  /** この速さ（手のひらの長さ／秒）より遅いと「止まっている」 */
  pauseSpeed: 0.5,
  /** 止まっている・見えないのが、これより長いと書き出す（秒） */
  pauseMinS: 1,
  /** 速さをならす窓（秒）。止まりを探すときに使う */
  pauseSmoothS: 0.3,
  /** 前のこまの手からこれより離れた手は、別の手とみなす（画面の高さに対して） */
  newTrackDist: 0.35,
  /** 見えたこまがこれより少ない手は、読み違いとして捨てる（割合） */
  minSeenRatio: 0.05,
  /** 時間の線の点の数の上限 */
  timelineMaxPoints: 600,
} as const;

/** 比べるとき「ほぼ同じ」とみなす差 */
export const COMPARE_SAME = {
  tempoPerMin: 2,
  cvPoints: 2,
  ampRatio: 0.05,
  angleDeg: 3,
  speedRatio: 0.05,
} as const;

/** 手の骨組み（描くための点のつなぎ方） */
export const HAND_CONNECTIONS: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const PALM = [0, 5, 9, 13, 17];

export interface Stroke {
  /** 振れのいちばん端の時刻（秒） */
  t: number;
  /** 行き帰りの幅（手のひらの長さに対して） */
  amplitude: number;
}

export interface Pause {
  start: number;
  end: number;
  /** still：手は見えていて止まっている。unseen：手が見えない */
  kind: "still" | "unseen";
}

export interface Timeline {
  t0: number;
  dt: number;
  /** 速さ（手のひらの長さ／秒）。見えないところは null */
  speed: (number | null)[];
}

export interface HandMetrics {
  /** 画面の左の手・画面の右の手・手 */
  label: string;
  /** 見えたこまの割合 */
  seenRatio: number;
  /** 手のひらの長さ（画面の高さに対して）。距離の目安 */
  palmLength: number;
  /** いちばん大きく動く向き（0° は横、90° は縦） */
  axisDeg: number;
  /** 動いた道のりの合計（手のひらの長さに対して） */
  pathLength: number;
  speedMedian: number;
  speedP90: number;
  strokes: Stroke[];
  strokeCount: number;
  /** 1 分あたりの回数（数えられないときは null） */
  tempoPerMin: number | null;
  /** 間隔のばらつき（標準偏差 ÷ 平均） */
  periodCv: number | null;
  /** 振れ幅（中央の値、手のひらの長さに対して） */
  amplitudeMedian: number | null;
  amplitudeCv: number | null;
  /** 手の向き（平均、度） */
  angleMeanDeg: number | null;
  /** 手の向きの動く幅（10%〜90% の幅、度） */
  angleRangeDeg: number | null;
  /** 1 回ごとの手の向きの変わり方（中央の値、度） */
  angleSwingDeg: number | null;
  pauses: Pause[];
  /** 止まっていた時間の合計（秒、見えない時間は入れない） */
  pauseTotalS: number;
  /** 手が見えなかった時間の合計（秒） */
  unseenTotalS: number;
  timeline: Timeline;
}

export interface MotionMetrics {
  durationS: number;
  /** 読んだこまの間隔から出した、1 秒あたりのこま数 */
  fps: number;
  frameCount: number;
  /** どれかの手が見えたこまの割合 */
  seenRatio: number;
  hands: HandMetrics[];
  /** いちばん動いた手（比べるときに使う）。手がなければ null */
  mainHand: number | null;
}

// ---- 小さな道具 ----

const isNum = (v: number) => Number.isFinite(v);

export function median(xs: readonly number[]): number {
  return quantile(xs, 0.5);
}

export function quantile(xs: readonly number[], q: number): number {
  const a = xs.filter(isNum).sort((p, r) => p - r);
  if (a.length === 0) return NaN;
  const pos = (a.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

function meanOf(xs: readonly number[]): number {
  const a = xs.filter(isNum);
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
}

/** ばらつき（標準偏差 ÷ 平均） */
export function coefficientOfVariation(xs: readonly number[]): number {
  const m = meanOf(xs);
  if (!isNum(m) || m === 0) return NaN;
  const v = meanOf(xs.map((x) => (x - m) ** 2));
  return Math.sqrt(v) / m;
}

/** 手が消えた短いすき間を、前後の値でまっすぐつなぐ */
export function fillGaps(a: readonly number[], maxGap: number): number[] {
  const out = a.slice();
  let k = 0;
  while (k < out.length) {
    if (isNum(out[k])) {
      k++;
      continue;
    }
    const s = k;
    while (k < out.length && !isNum(out[k])) k++;
    const len = k - s;
    if (s > 0 && k < out.length && len <= maxGap) {
      const a0 = out[s - 1];
      const a1 = out[k];
      for (let j = 0; j < len; j++) out[s + j] = a0 + ((a1 - a0) * (j + 1)) / (len + 1);
    }
  }
  return out;
}

/** 重みつきでならす（見えないこまは使わず、見えないこまは見えないまま） */
/** 三角の重み（片側 h こま）。h = 1 なら [1, 2, 1] */
export function triangleWeights(h: number): number[] {
  return Array.from({ length: 2 * h + 1 }, (_, i) => h + 1 - Math.abs(i - h));
}

export function smoothSeries(a: readonly number[], weights: readonly number[] = [1, 2, 1]): number[] {
  const h = Math.floor(weights.length / 2);
  return a.map((v, k) => {
    if (!isNum(v)) return NaN;
    let s = 0;
    let w = 0;
    for (let j = -h; j <= h; j++) {
      const x = a[k + j];
      if (x !== undefined && isNum(x)) {
        s += x * weights[j + h];
        w += weights[j + h];
      }
    }
    return s / w;
  });
}

/** 中心の移動平均（窓は奇数のこま数。見えないこまは使わない） */
function movingAverage(a: readonly number[], win: number): number[] {
  const h = Math.max(0, Math.floor(win / 2));
  const n = a.length;
  const sum = new Float64Array(n + 1);
  const cnt = new Float64Array(n + 1);
  for (let k = 0; k < n; k++) {
    const ok = isNum(a[k]);
    sum[k + 1] = sum[k] + (ok ? a[k] : 0);
    cnt[k + 1] = cnt[k] + (ok ? 1 : 0);
  }
  return a.map((v, k) => {
    if (!isNum(v)) return NaN;
    const lo = Math.max(0, k - h);
    const hi = Math.min(n, k + h + 1);
    const c = cnt[hi] - cnt[lo];
    return c > 0 ? (sum[hi] - sum[lo]) / c : NaN;
  });
}

/** 見えている所のひと続き [start, end) */
function runsOf(a: readonly number[]): [number, number][] {
  const runs: [number, number][] = [];
  let k = 0;
  while (k < a.length) {
    if (!isNum(a[k])) {
      k++;
      continue;
    }
    const s = k;
    while (k < a.length && isNum(a[k])) k++;
    runs.push([s, k]);
  }
  return runs;
}

/** 角度を、前の値から 180° 以上飛ばないようにつなぐ */
function unwrapDeg(a: readonly number[]): number[] {
  let prev = NaN;
  return a.map((v) => {
    if (!isNum(v)) return NaN;
    if (!isNum(prev)) return (prev = v);
    let x = v;
    while (x - prev > 180) x -= 360;
    while (x - prev < -180) x += 360;
    return (prev = x);
  });
}

const wrapDeg = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

// ---- 手を、こまをまたいで同じ手につなぐ ----

interface Pt {
  x: number;
  y: number;
}

function palmCenter(lm: readonly LandmarkPoint[], aspect: number): Pt {
  let x = 0;
  let y = 0;
  for (const i of PALM) {
    x += lm[i].x * aspect;
    y += lm[i].y;
  }
  return { x: x / PALM.length, y: y / PALM.length };
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** 1 こまに 2 本まで。前のこまの位置にいちばん近い手につなぐ */
function assignTracks(frames: readonly MotionFrame[], aspect: number): (HandObservation | null)[][] {
  const tracks: { last: Pt; obs: (HandObservation | null)[] }[] = [];
  frames.forEach((f, fi) => {
    const hands = f.hands
      .filter((h) => h.landmarks && h.landmarks.length >= 21)
      .slice()
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 2);
    const centers = hands.map((h) => palmCenter(h.landmarks, aspect));
    const taken: (number | null)[] = hands.map(() => null);
    if (tracks.length === 2 && hands.length === 2) {
      const same = dist(centers[0], tracks[0].last) + dist(centers[1], tracks[1].last);
      const swap = dist(centers[0], tracks[1].last) + dist(centers[1], tracks[0].last);
      taken[0] = same <= swap ? 0 : 1;
      taken[1] = same <= swap ? 1 : 0;
    } else {
      // 近い組から順に決める
      const pairs: { h: number; t: number; d: number }[] = [];
      hands.forEach((_, h) => tracks.forEach((tr, t) => pairs.push({ h, t, d: dist(centers[h], tr.last) })));
      pairs.sort((a, b) => a.d - b.d);
      const usedT = new Set<number>();
      for (const p of pairs) {
        if (taken[p.h] !== null || usedT.has(p.t)) continue;
        if (p.d > MOTION.newTrackDist && tracks.length < 2) continue;
        taken[p.h] = p.t;
        usedT.add(p.t);
      }
    }
    hands.forEach((h, i) => {
      let t = taken[i];
      if (t === null) {
        if (tracks.length >= 2) return;
        tracks.push({ last: centers[i], obs: new Array(fi).fill(null) });
        t = tracks.length - 1;
      }
      tracks[t].obs[fi] = h;
      tracks[t].last = centers[i];
    });
    for (const tr of tracks) if (tr.obs.length <= fi) tr.obs[fi] = null;
  });
  return tracks.map((t) => t.obs);
}

// ---- 1 回の長さ（周期）の見当 ----

function estimatePeriodFrames(s: readonly number[], dt: number): number | null {
  const valid = s.filter(isNum);
  if (valid.length < 8) return null;
  const m = meanOf(valid);
  const v = meanOf(valid.map((x) => (x - m) ** 2));
  if (!(v > 0)) return null;
  const longest = Math.max(...runsOf(s).map(([a, b]) => b - a));
  const minLag = Math.max(2, Math.ceil(MOTION.minPeriodS / dt));
  const maxLag = Math.min(Math.floor(MOTION.maxPeriodS / dt), Math.floor(longest * 0.6));
  if (maxLag <= minLag) return null;
  const acf: number[] = [];
  for (let lag = 0; lag <= maxLag; lag++) {
    let sum = 0;
    let c = 0;
    for (let k = 0; k + lag < s.length; k++) {
      const a = s[k];
      const b = s[k + lag];
      if (isNum(a) && isNum(b)) {
        sum += (a - m) * (b - m);
        c++;
      }
    }
    acf.push(c >= 10 ? sum / c / v : NaN);
  }
  let start = minLag;
  while (start <= maxLag && !(acf[start] < 0)) start++;
  if (start > maxLag) return null;
  let best = -Infinity;
  for (let lag = start; lag < maxLag; lag++) if (acf[lag] > best) best = acf[lag];
  if (!(best >= 0.2)) return null;
  for (let lag = start + 1; lag < maxLag; lag++) {
    if (acf[lag] >= 0.85 * best && acf[lag] >= acf[lag - 1] && acf[lag] >= acf[lag + 1]) return lag;
  }
  return null;
}

// ---- 1 回ずつ数える ----

interface StrokeAt {
  k: number;
  t: number;
  amplitude: number;
}

function detectStrokes(d: readonly number[], t0: number, dt: number): StrokeAt[] {
  const valid = d.filter(isNum);
  if (valid.length < 4) return [];
  const big = (quantile(valid, 0.95) - quantile(valid, 0.05)) / 2;
  const h = Math.max(MOTION.hysteresisFloor, MOTION.hysteresisFrac * big);
  const out: StrokeAt[] = [];
  for (const [a, b] of runsOf(d)) {
    // 0：まだ分からない、-1：下にいる、1：上にいる
    let state = 0;
    let trough = Infinity;
    let peak = -Infinity;
    let peakK = -1;
    const finish = () => {
      const amp = peak - trough;
      if (peakK >= 0 && amp >= MOTION.minStrokeAmp) {
        // 3 点の放物線で、端の時刻をこまの間まで出す
        let off = 0;
        const y0 = d[peakK - 1];
        const y1 = d[peakK];
        const y2 = d[peakK + 1];
        if (peakK - 1 >= a && peakK + 1 < b && isNum(y0) && isNum(y2)) {
          const den = y0 - 2 * y1 + y2;
          if (den < 0) off = Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den));
        }
        out.push({ k: peakK, t: t0 + (peakK + off) * dt, amplitude: amp });
      }
    };
    for (let k = a; k < b; k++) {
      const v = d[k];
      if (state === 0) {
        if (v < -h) {
          state = -1;
          trough = v;
        }
      } else if (state === -1) {
        if (v < trough) trough = v;
        if (v > h) {
          state = 1;
          peak = v;
          peakK = k;
        }
      } else {
        if (v > peak) {
          peak = v;
          peakK = k;
        }
        if (v < -h) {
          finish();
          state = -1;
          trough = v;
          peakK = -1;
        }
      }
    }
    // 終わりで上にいたときは、端が動画の中で見えていれば数える
    if (state === 1 && peakK < b - 1) finish();
  }
  return out;
}

// ---- 1 本の手の数字 ----

function handMetrics(obs: readonly (HandObservation | null)[], aspect: number, t0: number, dt: number): HandMetrics {
  const n = obs.length;
  const cx: number[] = new Array(n).fill(NaN);
  const cy: number[] = new Array(n).fill(NaN);
  const ang: number[] = new Array(n).fill(NaN);
  const palm: number[] = [];
  obs.forEach((o, k) => {
    if (!o) return;
    const lm = o.landmarks;
    const c = palmCenter(lm, aspect);
    cx[k] = c.x;
    cy[k] = c.y;
    const vx = (lm[9].x - lm[0].x) * aspect;
    const vy = lm[9].y - lm[0].y;
    palm.push(Math.hypot(vx, vy));
    ang[k] = (Math.atan2(-vy, vx) * 180) / Math.PI;
  });
  const seen = palm.length;
  const L = Math.max(median(palm), 1e-6);
  const gap = Math.max(1, Math.round(MOTION.maxGapS / dt));
  const w = triangleWeights(Math.max(0, Math.round(MOTION.smoothHalfS / dt)));
  const sx = smoothSeries(fillGaps(cx, gap), w);
  const sy = smoothSeries(fillGaps(cy, gap), w);
  const sa = smoothSeries(fillGaps(unwrapDeg(ang), gap), w);

  // 速さ（手のひらの長さ／秒）
  const speed: number[] = sx.map((_, k) => {
    const p = k - 1;
    const q = k + 1;
    if (p >= 0 && q < n && isNum(sx[p]) && isNum(sx[q])) return Math.hypot(sx[q] - sx[p], sy[q] - sy[p]) / (2 * dt) / L;
    if (q < n && isNum(sx[k]) && isNum(sx[q])) return Math.hypot(sx[q] - sx[k], sy[q] - sy[k]) / dt / L;
    if (p >= 0 && isNum(sx[k]) && isNum(sx[p])) return Math.hypot(sx[k] - sx[p], sy[k] - sy[p]) / dt / L;
    return NaN;
  });
  let path = 0;
  for (let k = 1; k < n; k++) if (isNum(sx[k]) && isNum(sx[k - 1])) path += Math.hypot(sx[k] - sx[k - 1], sy[k] - sy[k - 1]) / L;

  // ゆっくりしたずれ（作業の位置が少しずつ移る）を、長い窓の移動平均で引く
  const longWin = Math.round(MOTION.maxPeriodS / dt) | 1;
  const mxs = movingAverage(sx, longWin);
  const mys = movingAverage(sy, longWin);
  const rx = sx.map((x, k) => x - mxs[k]);
  const ry = sy.map((y, k) => y - mys[k]);

  // いちばん大きく動く向き（ずれを引いた位置の主成分）
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let k = 0; k < n; k++) {
    if (!isNum(rx[k])) continue;
    sxx += rx[k] * rx[k];
    syy += ry[k] * ry[k];
    sxy += rx[k] * ry[k];
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  const proj = rx.map((x, k) => (isNum(x) ? (x * ux + ry[k] * uy) / L : NaN));

  // 1 回の長さを見当し、その長さの窓でもう一度ずれを引く（1 回ぶんの窓の平均には、くり返しの動きが残らない）
  const periodFrames = estimatePeriodFrames(proj, dt);
  const trendWin = periodFrames ?? Math.round(MOTION.defaultTrendS / dt);
  const detr = movingAverage(proj, trendWin).map((m, k) => proj[k] - m);
  const found = detectStrokes(detr, t0, dt);

  // 間隔：同じひと続きの中の、となりあう 2 回
  const runId: number[] = new Array(n).fill(-1);
  runsOf(proj).forEach(([a, b], i) => {
    for (let k = a; k < b; k++) runId[k] = i;
  });
  const rawPeriods: { p: number; i: number }[] = [];
  for (let i = 1; i < found.length; i++) {
    if (runId[found[i].k] === runId[found[i - 1].k]) rawPeriods.push({ p: found[i].t - found[i - 1].t, i });
  }
  const pMed = median(rawPeriods.map((r) => r.p));
  const periods = rawPeriods.filter((r) => r.p <= MOTION.breakFactor * pMed);
  const pv = periods.map((r) => r.p);
  const tempo = pv.length >= 2 ? 60 / median(pv) : null;
  const cv = pv.length >= 3 ? coefficientOfVariation(pv) : null;
  const amps = found.map((s) => s.amplitude);

  // 1 回ごとの手の向きの変わり方
  const swings: number[] = [];
  for (const r of periods) {
    const ka = found[r.i - 1].k;
    const kb = found[r.i].k;
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = ka; k <= kb; k++) {
      if (!isNum(sa[k])) continue;
      lo = Math.min(lo, sa[k]);
      hi = Math.max(hi, sa[k]);
    }
    if (hi >= lo) swings.push(hi - lo);
  }

  // 止まっている・見えない時間
  const slow = movingAverage(speed, Math.max(1, Math.round(MOTION.pauseSmoothS / dt)) | 1);
  const pauses: Pause[] = [];
  const minLen = Math.round(MOTION.pauseMinS / dt);
  const scan = (pred: (k: number) => boolean, kind: Pause["kind"]) => {
    let k = 0;
    while (k < n) {
      if (!pred(k)) {
        k++;
        continue;
      }
      const s = k;
      while (k < n && pred(k)) k++;
      if (k - s >= minLen) pauses.push({ start: t0 + s * dt, end: t0 + k * dt, kind });
    }
  };
  scan((k) => isNum(slow[k]) && slow[k] < MOTION.pauseSpeed, "still");
  scan((k) => !isNum(sx[k]), "unseen");
  pauses.sort((a, b) => a.start - b.start);
  const total = (kind: Pause["kind"]) => pauses.filter((p) => p.kind === kind).reduce((s, p) => s + p.end - p.start, 0);
  let unseen = 0;
  for (let k = 0; k < n; k++) if (!isNum(sx[k])) unseen += dt;

  const angles = sa.filter(isNum);
  const axis = ((theta * 180) / Math.PI + 180) % 180;
  return {
    label: "手",
    seenRatio: n ? seen / n : 0,
    palmLength: L,
    axisDeg: axis > 90 ? 180 - axis : axis,
    pathLength: path,
    speedMedian: median(speed),
    speedP90: quantile(speed, 0.9),
    strokes: found.map((s) => ({ t: s.t, amplitude: s.amplitude })),
    strokeCount: found.length,
    tempoPerMin: tempo,
    periodCv: cv !== null && isNum(cv) ? cv : null,
    amplitudeMedian: amps.length ? median(amps) : null,
    amplitudeCv: amps.length >= 3 ? coefficientOfVariation(amps) : null,
    angleMeanDeg: angles.length ? wrapDeg(meanOf(angles)) : null,
    angleRangeDeg: angles.length ? quantile(angles, 0.9) - quantile(angles, 0.1) : null,
    angleSwingDeg: swings.length ? median(swings) : null,
    pauses,
    pauseTotalS: total("still"),
    unseenTotalS: unseen,
    timeline: timelineOf(speed, t0, dt),
  };
}

function timelineOf(speed: readonly number[], t0: number, dt: number): Timeline {
  const f = Math.max(1, Math.ceil(speed.length / MOTION.timelineMaxPoints));
  const out: (number | null)[] = [];
  for (let k = 0; k < speed.length; k += f) {
    const m = meanOf(speed.slice(k, k + f));
    out.push(isNum(m) ? Math.round(m * 100) / 100 : null);
  }
  return { t0, dt: dt * f, speed: out };
}

/** こまの間隔（中央の値） */
function frameStep(frames: readonly MotionFrame[]): number {
  const ts = frames.map((f) => f.t);
  const d: number[] = [];
  for (let i = 1; i < ts.length; i++) if (ts[i] > ts[i - 1]) d.push(ts[i] - ts[i - 1]);
  const m = median(d);
  return isNum(m) && m > 0 ? m : 1 / 30;
}

/** こまの時刻を等しい間隔にならべ直す（同じ所に 2 こま来たら後のこま） */
function onGrid(frames: readonly MotionFrame[]): { frames: MotionFrame[]; t0: number; dt: number } {
  const sorted = frames.slice().sort((a, b) => a.t - b.t);
  if (sorted.length === 0) return { frames: [], t0: 0, dt: 1 / 30 };
  const dt = frameStep(sorted);
  const t0 = sorted[0].t;
  const n = Math.round((sorted[sorted.length - 1].t - t0) / dt) + 1;
  const grid: MotionFrame[] = Array.from({ length: n }, (_, k) => ({ t: t0 + k * dt, hands: [] }));
  for (const f of sorted) {
    const k = Math.round((f.t - t0) / dt);
    if (k >= 0 && k < n) grid[k] = { t: grid[k].t, hands: f.hands };
  }
  return { frames: grid, t0, dt };
}

/** 動画のこまの手の点から、動きの数字を出す */
export function analyzeMotion(input: MotionInput): MotionMetrics {
  const aspect = input.aspect > 0 ? input.aspect : 1;
  const { frames, t0, dt } = onGrid(input.frames);
  const n = frames.length;
  const lastT = n ? frames[n - 1].t + dt : 0;
  const durationS = input.durationS ?? lastT;
  const anySeen = frames.filter((f) => f.hands.some((h) => h.landmarks?.length >= 21)).length;
  const tracks = assignTracks(frames, aspect).filter((obs) => {
    const c = obs.filter(Boolean).length;
    return c >= 5 && c / Math.max(1, n) >= MOTION.minSeenRatio;
  });
  const hands = tracks.map((obs) => handMetrics(obs, aspect, t0, dt));
  // 左右は画面の上での並び（動画の向きによって本人の右手・左手とは限らないため）
  if (hands.length === 2) {
    const meanX = tracks.map((obs) => meanOf(obs.map((o) => (o ? palmCenter(o.landmarks, aspect).x : NaN))));
    const left = meanX[0] <= meanX[1] ? 0 : 1;
    hands[left].label = "画面の左の手";
    hands[1 - left].label = "画面の右の手";
  }
  let mainHand: number | null = null;
  hands.forEach((h, i) => {
    if (mainHand === null || h.pathLength > hands[mainHand].pathLength) mainHand = i;
  });
  return {
    durationS,
    fps: 1 / dt,
    frameCount: n,
    seenRatio: n ? anySeen / n : 0,
    hands,
    mainHand,
  };
}

// ---- 言葉にする ----

const r0 = (v: number) => Math.round(v);
const r1 = (v: number) => Math.round(v * 10) / 10;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const sec = (v: number) => `${r1(v)} 秒`;

/** 数字の見出し（画面に出す。良い悪いは言わない） */
export function summarizeMetrics(m: MotionMetrics): string[] {
  if (m.hands.length === 0 || m.mainHand === null) {
    return ["手が見つかりませんでした。手首から指先まで画面に入るように、明るい所で撮ってください。"];
  }
  const lines: string[] = [];
  m.hands.forEach((h, i) => {
    const head = m.hands.length > 1 ? `${h.label}${i === m.mainHand ? "（よく動いた手）" : ""}：` : "";
    const parts: string[] = [];
    if (h.tempoPerMin !== null) parts.push(`1 分あたり ${r0(h.tempoPerMin)} 回（数えた回数 ${h.strokeCount} 回）`);
    else parts.push(h.strokeCount > 0 ? `くり返しの動きは ${h.strokeCount} 回（少なくて 1 分あたりは出せません）` : "くり返しの動きは見つかりませんでした");
    if (h.periodCv !== null) parts.push(`間隔のばらつき ${pct(h.periodCv)}（小さいほど同じ間隔）`);
    if (h.amplitudeMedian !== null) parts.push(`振れ幅は手のひらの長さの ${r1(h.amplitudeMedian)} 倍`);
    if (h.angleRangeDeg !== null) parts.push(`手の向きの動く幅 ${r0(h.angleRangeDeg)}°`);
    if (h.angleSwingDeg !== null) parts.push(`1 回ごとの手の向きの変わり方 ${r0(h.angleSwingDeg)}°`);
    const still = h.pauses.filter((p) => p.kind === "still").length;
    if (still > 0) parts.push(`止まった時間 ${still} 回・合わせて ${sec(h.pauseTotalS)}`);
    if (h.unseenTotalS >= MOTION.pauseMinS) parts.push(`手が見えなかった時間 ${sec(h.unseenTotalS)}`);
    lines.push(head + parts.join("、"));
  });
  if (m.seenRatio < 0.6) lines.push(`手が見えたのは動画の ${pct(m.seenRatio)} だけです。数字は見えた所だけから出しています。`);
  return lines;
}

// ---- 手本と比べる ----

export type CompareKey = "tempo" | "regularity" | "amplitude" | "angleRange" | "angleSwing" | "speed" | "pauses";

export interface CompareItem {
  key: CompareKey;
  label: string;
  master: number | null;
  student: number | null;
  /** 比べる記録 − 手本（数えられないときは null） */
  diff: number | null;
  text: string;
}

export interface Comparison {
  masterHand: string | null;
  studentHand: string | null;
  items: CompareItem[];
  /** 比べるときに気をつけること */
  cautions: string[];
}

type HasMetrics = MotionMetrics | { metrics: MotionMetrics };
const metricsOf = (x: HasMetrics): MotionMetrics => ("metrics" in x ? x.metrics : x);
const mainOf = (m: MotionMetrics): HandMetrics | null => (m.mainHand === null ? null : (m.hands[m.mainHand] ?? null));

function missing(label: string, m: number | null, s: number | null): string {
  if (m === null && s === null) return `${label}：どちらも数えられませんでした`;
  return m === null ? `${label}：手本では数えられませんでした` : `${label}：比べる記録では数えられませんでした`;
}

/**
 * 手本（職人）と、比べる記録（生徒・別の日の職人）の数字の違い。良い悪いは言わず、向きと量だけを言葉にする。
 * 比べるのは、それぞれのよく動いた手。
 */
export function compareRecords(masterIn: HasMetrics, studentIn: HasMetrics): Comparison {
  const mm = metricsOf(masterIn);
  const sm = metricsOf(studentIn);
  const M = mainOf(mm);
  const S = mainOf(sm);
  const items: CompareItem[] = [];
  const cautions: string[] = [];
  if (!M) cautions.push("手本の動画で手が見つかりませんでした。");
  if (!S) cautions.push("比べる記録の動画で手が見つかりませんでした。");

  const push = (key: CompareKey, label: string, m: number | null, s: number | null, text: (m: number, s: number) => string) => {
    const ok = m !== null && s !== null && isNum(m) && isNum(s);
    items.push({ key, label, master: m, student: s, diff: ok ? s - m : null, text: ok ? text(m, s) : missing(label, m, s) });
  };

  push("tempo", "1 分あたりの回数", M?.tempoPerMin ?? null, S?.tempoPerMin ?? null, (m, s) => {
    const d = r0(s) - r0(m);
    const both = `（手本 ${r0(m)} 回・こちら ${r0(s)} 回）`;
    if (Math.abs(s - m) < COMPARE_SAME.tempoPerMin) return `1 分あたりの回数は手本とほぼ同じ${both}`;
    return `手本より 1 分あたり ${Math.abs(d)} 回${d > 0 ? "速い" : "遅い"}${both}`;
  });

  push("regularity", "間隔のばらつき", M?.periodCv ?? null, S?.periodCv ?? null, (m, s) => {
    const d = r0(s * 100) - r0(m * 100);
    const both = `（手本 ${pct(m)}・こちら ${pct(s)}）`;
    if (Math.abs(s - m) * 100 < COMPARE_SAME.cvPoints) return `間隔のばらつきは手本とほぼ同じ${both}`;
    return `間隔のばらつきが手本より ${Math.abs(d)} ポイント${d > 0 ? "大きい" : "小さい"}${both}`;
  });

  push("amplitude", "振れ幅", M?.amplitudeMedian ?? null, S?.amplitudeMedian ?? null, (m, s) => {
    const both = `（手のひらの長さの、手本 ${r1(m)} 倍・こちら ${r1(s)} 倍）`;
    if (m <= 0) return `振れ幅${both}`;
    const ratio = s / m;
    if (Math.abs(ratio - 1) < COMPARE_SAME.ampRatio) return `振れ幅は手本とほぼ同じ${both}`;
    return `振れ幅が手本の ${pct(ratio)}${both}`;
  });

  push("angleRange", "手の向きの動く幅", M?.angleRangeDeg ?? null, S?.angleRangeDeg ?? null, (m, s) => {
    const d = r0(s) - r0(m);
    const both = `（手本 ${r0(m)}°・こちら ${r0(s)}°）`;
    if (Math.abs(s - m) < COMPARE_SAME.angleDeg) return `手の向きの動く幅は手本とほぼ同じ${both}`;
    return `手の向きの動く幅が手本より ${Math.abs(d)}° ${d > 0 ? "広い" : "狭い"}${both}`;
  });

  push("angleSwing", "1 回ごとの手の向きの変わり方", M?.angleSwingDeg ?? null, S?.angleSwingDeg ?? null, (m, s) => {
    const d = r0(s) - r0(m);
    const both = `（手本 ${r0(m)}°・こちら ${r0(s)}°）`;
    if (Math.abs(s - m) < COMPARE_SAME.angleDeg) return `1 回ごとの手の向きの変わり方は手本とほぼ同じ${both}`;
    return `1 回ごとの手の向きの変わり方が手本より ${Math.abs(d)}° ${d > 0 ? "大きい" : "小さい"}${both}`;
  });

  push("speed", "速い所の速さ", M?.speedP90 ?? null, S?.speedP90 ?? null, (m, s) => {
    const both = `（手のひらの長さで 1 秒あたり、手本 ${r1(m)}・こちら ${r1(s)}）`;
    if (m <= 0) return `速い所の速さ${both}`;
    const ratio = s / m;
    if (Math.abs(ratio - 1) < COMPARE_SAME.speedRatio) return `速い所の速さは手本とほぼ同じ${both}`;
    return `速い所の速さが手本の ${pct(ratio)}${both}`;
  });

  const stillN = (h: HandMetrics | null) => (h ? h.pauses.filter((p) => p.kind === "still").length : null);
  push("pauses", "止まった回数", stillN(M), stillN(S), (m, s) => {
    const both = `（手本 ${m} 回・こちら ${s} 回）`;
    if (m === s) return `止まった回数は手本と同じ${both}`;
    return `止まった回数が手本より ${Math.abs(s - m)} 回${s > m ? "多い" : "少ない"}${both}`;
  });

  if (M && S) {
    const ratio = S.palmLength / M.palmLength;
    if (ratio < 0.6 || ratio > 1 / 0.6) cautions.push("撮った距離が大きく違います（手の大きさが画面で違う）。振れ幅は手のひらの長さで割ってそろえていますが、斜めから撮ると変わります。");
    if (M.angleMeanDeg !== null && S.angleMeanDeg !== null && Math.abs(wrapDeg(S.angleMeanDeg - M.angleMeanDeg)) > 30) {
      cautions.push("手の向きの平均が 30° 以上違います。撮る向きが違うと、手の向きの数字はそのまま比べられません。");
    }
  }
  cautions.push("数字は動きの違いだけです。どちらが良いかは、職人が決めます。");
  return { masterHand: M?.label ?? null, studentHand: S?.label ?? null, items, cautions };
}
