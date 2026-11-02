// 0〜1 の値の地図から、0.5 の等高線（輪郭）を取る（マーチング・スクエア）。
import type { Point } from "../geometry/polygon";

/** 縦横に分けた箱ぼかし（2 回でガウスぼかしに近くなる） */
export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r <= 0) return src.slice();
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const d = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += src[y * w + Math.min(w - 1, Math.max(0, x + k))];
      tmp[y * w + x] = s / d;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x];
      out[y * w + x] = s / d;
    }
  }
  return out;
}

/**
 * 等高線の輪をすべて返す。field の外側は 0 とみなすので、輪は必ず閉じる。
 * 返す座標は画素の中心が (x + 0.5, y + 0.5) になる向き。
 */
export function marchingSquares(field: Float32Array, w: number, h: number, iso = 0.5): Point[][] {
  // 外側に 0 の枠を 1 画素足す
  const W = w + 2;
  const H = h + 2;
  const f = new Float32Array(W * H);
  for (let y = 0; y < h; y++) f.set(field.subarray(y * w, y * w + w), (y + 1) * W + 1);
  const at = (x: number, y: number) => f[y * W + x];
  const hKey = (x: number, y: number) => (y * W + x) * 2;
  const vKey = (x: number, y: number) => (y * W + x) * 2 + 1;
  const points = new Map<number, Point>();
  const links = new Map<number, number[]>();
  const pointOf = (key: number): Point => {
    let p = points.get(key);
    if (p) return p;
    const cell = key >> 1;
    const x = cell % W;
    const y = (cell - x) / W;
    if ((key & 1) === 0) {
      const a = at(x, y);
      const b = at(x + 1, y);
      p = { x: x + (iso - a) / (b - a), y };
    } else {
      const a = at(x, y);
      const b = at(x, y + 1);
      p = { x, y: y + (iso - a) / (b - a) };
    }
    p = { x: p.x - 0.5, y: p.y - 0.5 };
    points.set(key, p);
    return p;
  };
  const link = (a: number, b: number) => {
    pointOf(a);
    pointOf(b);
    (links.get(a) ?? links.set(a, []).get(a)!).push(b);
    (links.get(b) ?? links.set(b, []).get(b)!).push(a);
  };
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const tl = at(x, y);
      const tr = at(x + 1, y);
      const br = at(x + 1, y + 1);
      const bl = at(x, y + 1);
      const code = (tl >= iso ? 8 : 0) | (tr >= iso ? 4 : 0) | (br >= iso ? 2 : 0) | (bl >= iso ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const T = hKey(x, y);
      const B = hKey(x, y + 1);
      const L = vKey(x, y);
      const R = vKey(x + 1, y);
      const centerIn = (tl + tr + br + bl) / 4 >= iso;
      switch (code) {
        case 1: case 14: link(L, B); break;
        case 2: case 13: link(B, R); break;
        case 3: case 12: link(L, R); break;
        case 4: case 11: link(T, R); break;
        case 6: case 9: link(T, B); break;
        case 7: case 8: link(T, L); break;
        case 5:
          if (centerIn) { link(T, L); link(B, R); } else { link(T, R); link(L, B); }
          break;
        case 10:
          if (centerIn) { link(T, R); link(L, B); } else { link(T, L); link(B, R); }
          break;
      }
    }
  }
  const visited = new Set<number>();
  const loops: Point[][] = [];
  for (const start of links.keys()) {
    if (visited.has(start)) continue;
    const loop: Point[] = [];
    let prev = -1;
    let cur = start;
    for (;;) {
      visited.add(cur);
      loop.push(points.get(cur)!);
      const nb = links.get(cur)!;
      const next = nb[0] !== prev ? nb[0] : nb[1];
      prev = cur;
      cur = next;
      if (cur === start || cur === undefined || visited.has(cur)) break;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}
