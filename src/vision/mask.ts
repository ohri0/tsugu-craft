// しきい値・かたまり探し・穴埋め

/** 大津の方法でしきい値を決める */
export function otsu(values: Float32Array, bins = 256): number {
  let max = 0;
  for (const v of values) if (v > max) max = v;
  if (max <= 0) return 0;
  const hist = new Float64Array(bins);
  for (const v of values) hist[Math.min(bins - 1, Math.floor((v / max) * bins))]++;
  const total = values.length;
  let sumAll = 0;
  for (let i = 0; i < bins; i++) sumAll += i * hist[i];
  let wB = 0;
  let sumB = 0;
  let best = 0;
  let bestT = 0;
  for (let t = 0; t < bins; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      bestT = t;
    }
  }
  return ((bestT + 1) / bins) * max;
}

export function threshold(values: Float32Array, t: number): Uint8Array {
  const m = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) m[i] = values[i] >= t ? 1 : 0;
  return m;
}

/** 外とつながっていない穴を埋める（石の中の反射で抜けた所） */
export function fillHoles(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = mask.slice();
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!out[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  for (let i = 0; i < out.length; i++) if (!out[i] && !outside[i]) out[i] = 1;
  return out;
}

/** 1 画素ぶん広げてから縮める（縁の小さな切れ目をふさぐ） */
export function close(mask: Uint8Array, w: number, h: number): Uint8Array {
  const grow = (m: Uint8Array, v: 0 | 1) => {
    const o = m.slice();
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (m[i] === v) continue;
        if ((x > 0 && m[i - 1] === v) || (x < w - 1 && m[i + 1] === v) || (y > 0 && m[i - w] === v) || (y < h - 1 && m[i + w] === v)) o[i] = v;
      }
    return o;
  };
  return grow(grow(mask, 1), 0);
}

export interface Blob {
  id: number;
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
  touchesBorder: boolean;
  /** 強いしきい値を超える画素を含むか */
  strong: boolean;
}

/** 8 方向につながったかたまりに番号を振る（0 は背景、1 から） */
export function label(mask: Uint8Array, w: number, h: number, strong?: Uint8Array): { labels: Int32Array; blobs: Blob[] } {
  const labels = new Int32Array(w * h);
  const blobs: Blob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    const id = blobs.length + 1;
    const b: Blob = { id, area: 0, minX: w, minY: h, maxX: -1, maxY: -1, cx: 0, cy: 0, touchesBorder: false, strong: !strong };
    labels[start] = id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      b.area++;
      b.cx += x;
      b.cy += y;
      if (x < b.minX) b.minX = x;
      if (x > b.maxX) b.maxX = x;
      if (y < b.minY) b.minY = y;
      if (y > b.maxY) b.maxY = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) b.touchesBorder = true;
      if (strong && strong[i]) b.strong = true;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w || (dx === 0 && dy === 0)) continue;
          const j = yy * w + xx;
          if (mask[j] && !labels[j]) {
            labels[j] = id;
            stack.push(j);
          }
        }
      }
    }
    b.cx /= b.area;
    b.cy /= b.area;
    blobs.push(b);
  }
  return { labels, blobs };
}
