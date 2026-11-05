// なめらかな線（3 次の B スプライン）の計算。画面に依存しない純粋な関数。
// 線は「制御点」（線を引っぱる点）と「節」（ノット：線のつなぎ目の位置 0〜1）で決まる。
// 線は制御点を通らず、制御点のつくる折れ線の内側をなめらかに通る（両端の点だけは通る）。
// 節は両端で 4 つ重ねる（クランプ）ので、線は最初と最後の制御点で始まり、終わる。
// 腕の断面を描く画面で使う（作者の求め：2026-11-04「Rhino のように、なめらかな線で」）。

export interface P2 {
  x: number;
  y: number;
}

/** 線の次数（3 次） */
export const DEGREE = 3;

/** 点が n 個のときの、等しい間隔の節（両端は 4 つ重ねる）。長さは n ＋ 4 */
export function uniformKnots(n: number): number[] {
  const p = DEGREE;
  const inner = Math.max(0, n - p - 1);
  const u: number[] = [];
  for (let i = 0; i <= p; i++) u.push(0);
  for (let i = 1; i <= inner; i++) u.push(i / (inner + 1));
  for (let i = 0; i <= p; i++) u.push(1);
  return u;
}

/** 節が使えるか（長さが点の数 ＋ 4、小さい順、両端が 0 と 1 で 4 つずつ） */
export function validKnots(n: number, u: readonly number[] | undefined): boolean {
  if (!u || u.length !== n + DEGREE + 1 || n < DEGREE + 1) return false;
  for (let i = 0; i <= DEGREE; i++) if (u[i] !== 0 || u[u.length - 1 - i] !== 1) return false;
  for (let i = 1; i < u.length; i++) if (!(u[i] >= u[i - 1])) return false;
  return true;
}

/** t が入る区間の番号 k（u[k] ≤ t < u[k+1]、k は 3〜n−1） */
export function findSpan(n: number, u: readonly number[], t: number): number {
  const p = DEGREE;
  if (t >= u[n]) return n - 1;
  if (t <= u[p]) return p;
  let lo = p;
  let hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t < u[mid]) hi = mid;
    else lo = mid;
  }
  return lo;
}

/** 区間 k で 0 でない 4 つの基底の値（制御点 k−3〜k の重み。足すと 1） */
export function basis(k: number, t: number, u: readonly number[]): number[] {
  const p = DEGREE;
  const N = [1, 0, 0, 0];
  const left = [0, 0, 0, 0];
  const right = [0, 0, 0, 0];
  for (let j = 1; j <= p; j++) {
    left[j] = t - u[k + 1 - j];
    right[j] = u[k + j] - t;
    let saved = 0;
    for (let r = 0; r < j; r++) {
      const den = right[r + 1] + left[j - r];
      const tmp = den === 0 ? 0 : N[r] / den;
      N[r] = saved + right[r + 1] * tmp;
      saved = left[j - r] * tmp;
    }
    N[j] = saved;
  }
  return N;
}

/** 線の上の点（t：0〜1） */
export function evalCurve(pts: readonly P2[], u: readonly number[], t: number): P2 {
  const n = pts.length;
  const k = findSpan(n, u, t);
  const N = basis(k, t, u);
  let x = 0;
  let y = 0;
  for (let j = 0; j <= DEGREE; j++) {
    const q = pts[k - DEGREE + j];
    x += N[j] * q.x;
    y += N[j] * q.y;
  }
  return { x, y };
}

/** 線を細かく取る：節と節の間をそれぞれ perSpan に分ける。t の値もいっしょに返す */
export function sampleCurve(pts: readonly P2[], u: readonly number[], perSpan = 24): { p: P2; t: number }[] {
  const out: { p: P2; t: number }[] = [];
  const n = pts.length;
  for (let k = DEGREE; k < n; k++) {
    const a = u[k];
    const b = u[k + 1];
    if (b - a < 1e-12) continue;
    for (let s = 0; s < perSpan; s++) {
      const t = a + ((b - a) * s) / perSpan;
      out.push({ p: evalCurve(pts, u, t), t });
    }
  }
  out.push({ p: evalCurve(pts, u, 1), t: 1 });
  return out;
}

/**
 * 3D の形に使う点：細かく取った線から、曲がりの少ない所の点を間引く。
 * 前に残した点からの向きの変わりが maxTurnDeg を超える手前、または maxLen より離れる手前で点を残す（曲がる所ほど点が多い）
 */
export function adaptiveSample(pts: readonly P2[], u: readonly number[], maxTurnDeg = 3, maxLen = 0.08): P2[] {
  return adaptiveParams(pts, u, maxTurnDeg, maxLen).map((s) => s.p);
}

/** adaptiveSample の点と、その t（線の上の位置）。2 本の線の点を同じ所でそろえるときに使う */
export function adaptiveParams(pts: readonly P2[], u: readonly number[], maxTurnDeg = 3, maxLen = 0.08): { p: P2; t: number }[] {
  const dense = sampleCurve(pts, u, 96);
  const out = [dense[0]];
  const cosMax = Math.cos((maxTurnDeg * Math.PI) / 180);
  let last = dense[0].p;
  // 前に残した点での線の向き（細かい線分の向き）
  const dirAt = (i: number) => ({ x: dense[i + 1].p.x - dense[i].p.x, y: dense[i + 1].p.y - dense[i].p.y });
  let dir = dirAt(0);
  for (let i = 1; i < dense.length - 1; i++) {
    const next = dense[i + 1].p;
    // 次の点での線の向きが、前に残した点での向きから曲がりすぎるか、次の点が遠すぎるなら、いまの点を残す
    const b = dirAt(i);
    const la = Math.hypot(dir.x, dir.y);
    const lb = Math.hypot(b.x, b.y);
    const turned = la > 1e-12 && lb > 1e-12 && (dir.x * b.x + dir.y * b.y) / (la * lb) < cosMax;
    if (turned || Math.hypot(next.x - last.x, next.y - last.y) > maxLen) {
      dir = dirAt(i);
      out.push(dense[i]);
      last = dense[i].p;
    }
  }
  out.push(dense[dense.length - 1]);
  return out;
}

/**
 * 節を 1 つ足して、制御点を 1 つ増やす（形は少しも変わらない）。
 * t の所に節を入れ、まわりの 3 つの点を、元の点の間に置き直す
 */
export function insertKnot(pts: readonly P2[], u: readonly number[], t: number): { pts: P2[]; knots: number[] } {
  const p = DEGREE;
  const n = pts.length;
  const k = findSpan(n, u, Math.min(Math.max(t, 0), 1 - 1e-9));
  const q: P2[] = [];
  for (let i = 0; i <= k - p; i++) q.push({ ...pts[i] });
  for (let i = k - p + 1; i <= k; i++) {
    const den = u[i + p] - u[i];
    const a = den === 0 ? 0 : (t - u[i]) / den;
    q.push({ x: (1 - a) * pts[i - 1].x + a * pts[i].x, y: (1 - a) * pts[i - 1].y + a * pts[i].y });
  }
  for (let i = k + 1; i <= n; i++) q.push({ ...pts[i - 1] });
  const knots = [...u.slice(0, k + 1), t, ...u.slice(k + 1)];
  return { pts: q, knots };
}

/** 制御点 i の「受け持ちの位置」（グレビルの点：まわりの 3 つの節の平均）。点がどの辺りの線を引っぱるか */
export function greville(u: readonly number[], i: number): number {
  return (u[i + 1] + u[i + 2] + u[i + 3]) / 3;
}

/**
 * 制御点を消す（両端の点は消さない）。いっしょに、その点にいちばん近い中の節を 1 つ消す。
 * 形はまわりだけ少し変わる。点が 4 つ（3 次の線の最少）なら消さない
 */
export function removePoint(pts: readonly P2[], u: readonly number[], i: number, avoidKnot?: (j: number) => boolean): { pts: P2[]; knots: number[] } | null {
  const n = pts.length;
  if (n <= DEGREE + 1 || i <= 0 || i >= n - 1) return null;
  const g = greville(u, i);
  let best = -1;
  for (let j = DEGREE + 1; j < n; j++) {
    if (avoidKnot?.(j)) continue;
    if (best < 0 || Math.abs(u[j] - g) < Math.abs(u[best] - g)) best = j;
  }
  if (best < 0) return null;
  return { pts: pts.filter((_, j) => j !== i).map((q) => ({ ...q })), knots: u.filter((_, j) => j !== best) };
}

/** 線の上で、点 q にいちばん近い所（t と、そこまでの距離） */
export function nearestOnCurve(pts: readonly P2[], u: readonly number[], q: P2): { t: number; d: number; p: P2 } {
  const s = sampleCurve(pts, u, 40);
  let best = s[0];
  let bd = Infinity;
  for (const x of s) {
    const d = Math.hypot(x.p.x - q.x, x.p.y - q.y);
    if (d < bd) {
      bd = d;
      best = x;
    }
  }
  // となりの間で、もう少し近い所を探す（3 分割を数回）
  let lo = Math.max(0, best.t - 0.03);
  let hi = Math.min(1, best.t + 0.03);
  for (let it = 0; it < 30; it++) {
    const a = lo + (hi - lo) / 3;
    const b = hi - (hi - lo) / 3;
    const pa = evalCurve(pts, u, a);
    const pb = evalCurve(pts, u, b);
    if (Math.hypot(pa.x - q.x, pa.y - q.y) < Math.hypot(pb.x - q.x, pb.y - q.y)) hi = b;
    else lo = a;
  }
  const t = (lo + hi) / 2;
  const p = evalCurve(pts, u, t);
  const d = Math.hypot(p.x - q.x, p.y - q.y);
  return d < bd ? { t, d, p } : { t: best.t, d: bd, p: best.p };
}

/**
 * 左右対称にする（x ＝ 0 を軸に）。点 i と、反対の端から数えて i 番目の点を、折り返して平均する。節も同じように平均する。
 * 点は右の端から左の端へ並んでいるとする
 */
export function symmetrize(pts: readonly P2[], u: readonly number[]): { pts: P2[]; knots: number[] } {
  const n = pts.length;
  const m = u.length - 1;
  return {
    pts: pts.map((p, i) => ({ x: (p.x - pts[n - 1 - i].x) / 2, y: (p.y + pts[n - 1 - i].y) / 2 })),
    knots: u.map((v, j) => (v + 1 - u[m - j]) / 2),
  };
}

/** 左右対称か（点・節とも、許す差 eps） */
export function isSymmetric(pts: readonly P2[], u: readonly number[], eps = 1e-6): boolean {
  const n = pts.length;
  const m = u.length - 1;
  for (let i = 0; i < n; i++) if (Math.abs(pts[i].x + pts[n - 1 - i].x) > eps || Math.abs(pts[i].y - pts[n - 1 - i].y) > eps) return false;
  for (let j = 0; j <= m; j++) if (Math.abs(u[j] + u[m - j] - 1) > eps) return false;
  return true;
}

/** 折れ線の長さに沿って、count 個の点に取り直す */
export function resample(line: readonly P2[], count: number): P2[] {
  const L = [0];
  for (let i = 1; i < line.length; i++) L.push(L[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y));
  const total = L[L.length - 1];
  if (total < 1e-12) return line.map((p) => ({ ...p }));
  const out: P2[] = [];
  let j = 1;
  for (let k = 0; k < count; k++) {
    const s = (total * k) / (count - 1);
    while (j < line.length - 1 && L[j] < s) j++;
    const a = line[j - 1];
    const b = line[j];
    const seg = L[j] - L[j - 1];
    const f = seg < 1e-12 ? 0 : Math.min(1, Math.max(0, (s - L[j - 1]) / seg));
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  return out;
}

/** 小さい連立一次方程式 A x ＝ b（掃き出し法。A は n × n） */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / d;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-12));
}

/**
 * 並んだ点（指で描いた線など）に、n 個の制御点のなめらかな線を合わせる（最小二乗）。
 * 両端の制御点は、最初と最後の点にそのまま置く。点の位置は、線に沿った長さの割合で t を決める。
 * smooth：となりの点の曲がり（2 階の差）を小さくする重み。手のふるえで線が波打たないように
 */
export function fitCurve(data: readonly P2[], n: number, smooth = 1e-4): { pts: P2[]; knots: number[] } {
  const u = uniformKnots(n);
  const L = [0];
  for (let i = 1; i < data.length; i++) L.push(L[i - 1] + Math.hypot(data[i].x - data[i - 1].x, data[i].y - data[i - 1].y));
  const total = L[L.length - 1] || 1;
  const first = data[0];
  const last = data[data.length - 1];
  const m = n - 2; // 中の点の数
  const A = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const bx = new Array<number>(m).fill(0);
  const by = new Array<number>(m).fill(0);
  data.forEach((d, s) => {
    const t = L[s] / total;
    const k = findSpan(n, u, t);
    const N = basis(k, t, u);
    // この点にかかる制御点の重み（全体の番号 → 重み）
    const w: [number, number][] = N.map((v, j) => [k - DEGREE + j, v]);
    let rx = d.x;
    let ry = d.y;
    for (const [i, v] of w) {
      if (i === 0) {
        rx -= v * first.x;
        ry -= v * first.y;
      } else if (i === n - 1) {
        rx -= v * last.x;
        ry -= v * last.y;
      }
    }
    for (const [i, v] of w) {
      if (i <= 0 || i >= n - 1) continue;
      bx[i - 1] += v * rx;
      by[i - 1] += v * ry;
      for (const [j, vj] of w) if (j > 0 && j < n - 1) A[i - 1][j - 1] += v * vj;
    }
  });
  // なめらかさの重み：P[i−1] − 2P[i] ＋ P[i+1] を小さく（両端の点は決まっているので右辺へ）
  const lam = smooth * data.length;
  for (let i = 1; i < n - 1; i++) {
    const row = [i - 1, i, i + 1];
    const c = [1, -2, 1];
    for (let a = 0; a < 3; a++) {
      const ia = row[a];
      if (ia <= 0 || ia >= n - 1) continue;
      for (let b = 0; b < 3; b++) {
        const ib = row[b];
        const v = lam * c[a] * c[b];
        if (ib <= 0) {
          bx[ia - 1] -= v * first.x;
          by[ia - 1] -= v * first.y;
        } else if (ib >= n - 1) {
          bx[ia - 1] -= v * last.x;
          by[ia - 1] -= v * last.y;
        } else A[ia - 1][ib - 1] += v;
      }
    }
  }
  const xs = solve(A.map((r) => [...r]), bx);
  const ys = solve(A.map((r) => [...r]), by);
  const pts = [{ ...first }, ...xs.map((x, i) => ({ x, y: ys[i] })), { ...last }];
  return { pts, knots: u };
}

/** 点の列から、線までのいちばん大きな離れ */
export function fitError(data: readonly P2[], pts: readonly P2[], u: readonly number[]): number {
  let e = 0;
  for (const d of data) e = Math.max(e, nearestOnCurve(pts, u, d).d);
  return e;
}

// ---- 指で描いた線に、ぴったり合わせる（作者の求め：2026-11-04「描いた線と、できた線がちがいすぎる」） ----

/**
 * いくつかの線を、角でつないで 1 本の線にする。つなぎ目の節は 3 つ重ねる（線はつなぎ目の点を通り、そこで折れてよい）。
 * 各線の最後の点と、次の線の最初の点は同じ所とする。lengths：各線が受け持つ長さ（節の位置の割り振りに使う）
 */
export function joinCurves(parts: readonly { pts: readonly P2[]; knots: readonly number[] }[], lengths: readonly number[]): { pts: P2[]; knots: number[] } {
  const total = lengths.reduce((a, b) => a + b, 0) || 1;
  const pts: P2[] = [];
  const knots: number[] = [0, 0, 0, 0];
  let start = 0;
  parts.forEach((c, k) => {
    const span = lengths[k] / total;
    const end = k === parts.length - 1 ? 1 : start + span;
    // 中の節（両端の 4 つずつを除く）を、この線の受け持ちの区間へ
    for (let j = DEGREE + 1; j < c.knots.length - DEGREE - 1; j++) knots.push(start + c.knots[j] * (end - start));
    if (k < parts.length - 1) knots.push(end, end, end);
    (k === 0 ? c.pts : c.pts.slice(1)).forEach((p) => pts.push({ ...p }));
    start = end;
  });
  knots.push(1, 1, 1, 1);
  return { pts, knots };
}

/** 折れ線の、長さに沿った向きの変わり（度）。scale：前後どれだけ離れた点で向きを測るか（長さ） */
function turnAt(line: readonly P2[], i: number, k: number): number {
  const a = line[Math.max(0, i - k)];
  const b = line[i];
  const c = line[Math.min(line.length - 1, i + k)];
  const v1 = { x: b.x - a.x, y: b.y - a.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const l1 = Math.hypot(v1.x, v1.y);
  const l2 = Math.hypot(v2.x, v2.y);
  if (l1 < 1e-12 || l2 < 1e-12) return 0;
  const cos = Math.min(1, Math.max(-1, (v1.x * v2.x + v1.y * v2.y) / (l1 * l2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * 折れ線（長さに沿って等しい間隔に取り直したもの）の中で、急に折れる所（角）の番号。
 * 短い間（scale）とその倍の間の両方で向きが minTurnDeg より大きく変わり、まわりでいちばん大きく変わる所を角とする。両端の近くは数えない
 */
export function findCorners(line: readonly P2[], step: number, o: { scale: number; minTurnDeg: number }): number[] {
  const k = Math.max(1, Math.round(o.scale / step));
  // 本当の角は、短い間でも長い間でも同じだけ折れる。手のふるえは短い間でしか折れない（長い間では消える）ので、
  // 短い間（k）と、その倍の間（2k）の小さい方で比べる
  const turn = line.map((_, i) => (i < 2 * k || i > line.length - 1 - 2 * k ? 0 : Math.min(turnAt(line, i, k), turnAt(line, i, 2 * k))));
  const out: number[] = [];
  for (let i = k; i <= line.length - 1 - k; i++) {
    if (turn[i] < o.minTurnDeg) continue;
    let isMax = true;
    for (let j = Math.max(0, i - 2 * k); j <= Math.min(line.length - 1, i + 2 * k); j++) {
      if (turn[j] > turn[i] || (turn[j] === turn[i] && j < i)) {
        isMax = false;
        break;
      }
    }
    if (isMax) out.push(i);
  }
  return out;
}

/** 折れ線を少しならす（両端は動かさない）。手のふるえ（細かい波）だけを消す */
function smoothLine(line: readonly P2[], passes: number): P2[] {
  let cur = line.map((p) => ({ ...p }));
  for (let s = 0; s < passes; s++) {
    cur = cur.map((p, i) => (i === 0 || i === cur.length - 1 ? p : { x: (cur[i - 1].x + 2 * p.x + cur[i + 1].x) / 4, y: (cur[i - 1].y + 2 * p.y + cur[i + 1].y) / 4 }));
  }
  return cur;
}

/** 点の列と、t を長さの割合で決めたときの線との、いちばん大きな離れ（速い見積もり。本当の離れはこれ以下） */
function quickError(data: readonly P2[], pts: readonly P2[], u: readonly number[]): number {
  const L = [0];
  for (let i = 1; i < data.length; i++) L.push(L[i - 1] + Math.hypot(data[i].x - data[i - 1].x, data[i].y - data[i - 1].y));
  const total = L[L.length - 1] || 1;
  let e = 0;
  data.forEach((d, i) => {
    const p = evalCurve(pts, u, L[i] / total);
    e = Math.max(e, Math.hypot(p.x - d.x, p.y - d.y));
  });
  return e;
}

export interface FitOptions {
  /** 許す離れ（長さ） */
  tol: number;
  /** 1 つの区間（角と角の間）に使う点の数の上限 */
  maxPerPart: number;
  /** 取り直す間隔（長さ） */
  step: number;
  /** 角を探す：向きを測る長さと、角とみなす向きの変わり（度） */
  cornerScale: number;
  cornerTurnDeg: number;
  /** 必ず角にする所（線の長さの割合 0〜1） */
  forceCorners?: number[];
}

type Curve = { pts: P2[]; knots: number[] };

/** 角と角の間の 1 つの区間に、離れが tol に収まるいちばん少ない点の数で合わせる（ふるえは少しならしてから） */
export function fitSegment(raw: readonly P2[], o: Pick<FitOptions, "tol" | "maxPerPart">): Curve {
  const seg = smoothLine(raw, 2);
  let best: Curve | null = null;
  for (let n = DEGREE + 1; n <= o.maxPerPart; n++) {
    if (n > seg.length - 1) break;
    const r = fitCurve(seg, n, 1e-7);
    best = r;
    if (quickError(raw, r.pts, r.knots) <= o.tol) break;
  }
  if (best) return best;
  const a = raw[0];
  const b = raw[raw.length - 1];
  return { pts: [0, 1 / 3, 2 / 3, 1].map((f) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f })), knots: uniformKnots(4) };
}

/**
 * 指で描いた線（折れ線）を、角で区間に分ける。長さに沿って等しい間隔に取り直し、急に折れる所（角）を探す。
 * 返すのは区間ごとの折れ線（となりの区間と、角の点を共有する）
 */
export function splitAtCorners(line: readonly P2[], o: Pick<FitOptions, "step" | "cornerScale" | "cornerTurnDeg" | "forceCorners">): { segs: P2[][]; corners: P2[] } {
  const L = [0];
  for (let i = 1; i < line.length; i++) L.push(L[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y));
  const total = L[L.length - 1];
  const count = Math.max(24, Math.min(1500, Math.round(total / o.step) + 1));
  const dense = resample(line, count);
  const h = total / (count - 1);
  const cs = new Set(findCorners(dense, h, { scale: o.cornerScale, minTurnDeg: o.cornerTurnDeg }));
  for (const f of o.forceCorners ?? []) {
    const i = Math.round(f * (count - 1));
    if (i > 0 && i < count - 1) cs.add(i);
  }
  // 近すぎる角はまとめる（区間には点が 4 つ以上いる）
  const cuts = [0, ...[...cs].sort((a, b) => a - b).filter((i) => i >= 4 && i <= count - 5), count - 1].filter((v, i, a) => i === 0 || v - a[i - 1] >= 4);
  if (cuts[cuts.length - 1] !== count - 1) cuts[cuts.length - 1] = count - 1;
  const segs: P2[][] = [];
  for (let c = 0; c + 1 < cuts.length; c++) segs.push(dense.slice(cuts[c], cuts[c + 1] + 1));
  return { segs, corners: cuts.slice(1, -1).map((i) => ({ ...dense[i] })) };
}

/** 折れ線の長さ */
export function lineLength(line: readonly P2[]): number {
  let s = 0;
  for (let i = 1; i < line.length; i++) s += Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y);
  return s;
}

/**
 * 指で描いた線（折れ線）に、なめらかな線をぴったり合わせる。
 * 角で区間に分け、区間ごとに、離れが tol に収まるいちばん少ない点の数で合わせ、角で 1 本につなぐ（角は折れたまま）
 */
export function fitPolyline(line: readonly P2[], o: FitOptions): Curve & { corners: P2[] } {
  const { segs, corners } = splitAtCorners(line, o);
  const r = joinCurves(
    segs.map((s) => fitSegment(s, o)),
    segs.map(lineLength),
  );
  return { ...r, corners };
}

/** 線を左右に折り返す（x ＝ 0 を軸に。向きも逆にする） */
export function mirrorCurve(c: { pts: readonly P2[]; knots: readonly number[] }): Curve {
  return { pts: [...c.pts].reverse().map((p) => ({ x: -p.x, y: p.y })), knots: [...c.knots].reverse().map((v) => 1 - v) };
}
