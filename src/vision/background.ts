// 背景（紙）の明るさのむらを、なめらかな曲面（2 次式）で近似する。
// 石の画素は外れ値として何度か除きながら当てはめ直す。
import type { RGBAImage } from "./image";

/** 2 次式の係数（R, G, B ごとに 6 つ）。座標は元の写真の全体を −1〜1 にした値 */
export interface BackgroundModel {
  coef: [number[], number[], number[]];
  /** 元の写真の大きさ */
  fullWidth: number;
  fullHeight: number;
}

function basis(u: number, v: number): number[] {
  return [1, u, v, u * u, u * v, v * v];
}

/** 元の写真の画素の位置 → −1〜1 */
export function normalized(model: BackgroundModel, X: number, Y: number): [number, number] {
  return [((X + 0.5) / model.fullWidth) * 2 - 1, ((Y + 0.5) / model.fullHeight) * 2 - 1];
}

export function evalBackground(model: BackgroundModel, u: number, v: number): [number, number, number] {
  const b = basis(u, v);
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    let s = 0;
    for (let k = 0; k < 6; k++) s += model.coef[c][k] * b[k];
    out[c] = s;
  }
  return out;
}

/**
 * img は元の写真を factor 倍に縮めたもの（factor = 1 なら元のまま）。
 */
export function fitBackground(img: RGBAImage, factor: number, fullWidth: number, fullHeight: number, iterations: number): BackgroundModel {
  const step = Math.max(1, Math.floor(Math.sqrt((img.width * img.height) / 20000)));
  const us: number[] = [];
  const vs: number[] = [];
  const cols: number[][] = [[], [], []];
  for (let y = 0; y < img.height; y += step) {
    for (let x = 0; x < img.width; x += step) {
      const i = (y * img.width + x) * 4;
      us.push(((x * factor + factor / 2) / fullWidth) * 2 - 1);
      vs.push(((y * factor + factor / 2) / fullHeight) * 2 - 1);
      for (let c = 0; c < 3; c++) cols[c].push(img.data[i + c]);
    }
  }
  const n = us.length;
  let keep = new Uint8Array(n).fill(1);
  const model: BackgroundModel = { coef: [[], [], []], fullWidth, fullHeight };
  for (let it = 0; it <= iterations; it++) {
    for (let c = 0; c < 3; c++) model.coef[c] = leastSquares(us, vs, cols[c], keep);
    if (it === iterations) break;
    const res = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const bg = evalBackground(model, us[i], vs[i]);
      res[i] = Math.hypot(cols[0][i] - bg[0], cols[1][i] - bg[1], cols[2][i] - bg[2]);
    }
    const kept = [...res].filter((_, i) => keep[i]).sort((a, b) => a - b);
    const median = kept[Math.floor(kept.length / 2)] ?? 0;
    const limit = median * 2.5 + 3;
    const next = new Uint8Array(n);
    for (let i = 0; i < n; i++) next[i] = res[i] < limit ? 1 : 0;
    keep = next;
  }
  return model;
}

function leastSquares(us: number[], vs: number[], ys: number[], keep: Uint8Array): number[] {
  const A = Array.from({ length: 6 }, () => new Array<number>(7).fill(0));
  for (let i = 0; i < us.length; i++) {
    if (!keep[i]) continue;
    const b = basis(us[i], vs[i]);
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) A[r][c] += b[r] * b[c];
      A[r][6] += b[r] * ys[i];
    }
  }
  // 少しだけ正則化（点が偏っても解けるように）
  for (let r = 0; r < 6; r++) A[r][r] += 1e-6;
  for (let col = 0; col < 6; col++) {
    let piv = col;
    for (let r = col + 1; r < 6; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    const d = A[col][col] || 1e-12;
    for (let r = 0; r < 6; r++) {
      if (r === col) continue;
      const f = A[r][col] / d;
      for (let c = col; c < 7; c++) A[r][c] -= f * A[col][c];
    }
  }
  return A.map((row, r) => row[6] / (A[r][r] || 1e-12));
}

/**
 * 各画素と背景の色の差（RGB の距離）。
 * img は元の写真の (x0, y0) から factor 倍に縮めて切り出したもの。
 */
export function differenceMap(img: RGBAImage, model: BackgroundModel, factor: number, x0 = 0, y0 = 0): Float32Array {
  const out = new Float32Array(img.width * img.height);
  for (let y = 0; y < img.height; y++) {
    const v = (((y0 + y * factor + factor / 2) / model.fullHeight) * 2) - 1;
    for (let x = 0; x < img.width; x++) {
      const u = (((x0 + x * factor + factor / 2) / model.fullWidth) * 2) - 1;
      const bg = evalBackground(model, u, v);
      const i = (y * img.width + x) * 4;
      out[y * img.width + x] = Math.hypot(img.data[i] - bg[0], img.data[i + 1] - bg[1], img.data[i + 2] - bg[2]);
    }
  }
  return out;
}
