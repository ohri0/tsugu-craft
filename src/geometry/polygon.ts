// 多角形（石の縁の輪郭）の基本の計算。画面に依存しない純粋な関数。

export interface Point {
  x: number;
  y: number;
}

/** 符号つき面積。y が上向きの座標で反時計回りなら正。 */
export function signedArea(pts: readonly Point[]): number {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function perimeter(pts: readonly Point[]): number {
  let s = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    s += Math.hypot(q.x - p.x, q.y - p.y);
  }
  return s;
}

/** 面積の重心 */
export function centroid(pts: readonly Point[]): Point {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    const c = p.x * q.y - q.x * p.y;
    a += c;
    cx += (p.x + q.x) * c;
    cy += (p.y + q.y) * c;
  }
  if (Math.abs(a) < 1e-12) {
    const m = pts.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 });
    return { x: m.x / pts.length, y: m.y / pts.length };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** 反時計回り（y 上向き）にそろえる */
export function toCounterClockwise(pts: readonly Point[]): Point[] {
  return signedArea(pts) < 0 ? [...pts].reverse() : [...pts];
}

/** 凸包（Andrew の方法）。反時計回り。 */
export function convexHull(pts: readonly Point[]): Point[] {
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (s.length < 3) return s;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export interface Extent {
  /** 長辺：いちばん離れた 2 点の距離（ノギスで挟んだ最大の長さ） */
  long: number;
  /** 幅：長辺に直角な向きの幅 */
  width: number;
  /** 長辺の向き（ラジアン、x 軸から） */
  angle: number;
  /** 長辺の両端 */
  ends: [Point, Point];
}

/** 長辺と、それに直角な幅 */
export function extent(pts: readonly Point[]): Extent {
  const h = convexHull(pts);
  let best = -1;
  let a = h[0];
  let b = h[0];
  for (let i = 0; i < h.length; i++) {
    for (let j = i + 1; j < h.length; j++) {
      const d = (h[i].x - h[j].x) ** 2 + (h[i].y - h[j].y) ** 2;
      if (d > best) {
        best = d;
        a = h[i];
        b = h[j];
      }
    }
  }
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const vx = -Math.sin(angle);
  const vy = Math.cos(angle);
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of h) {
    const t = p.x * vx + p.y * vy;
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  return { long: Math.sqrt(best), width: hi - lo, angle, ends: [a, b] };
}

/** 周に沿って等間隔に n 点を取り直す */
export function resample(pts: readonly Point[], n: number): Point[] {
  const total = perimeter(pts);
  const step = total / n;
  const out: Point[] = [];
  let i = 0;
  let segStart = 0; // これまでの辺の長さの合計
  const len = pts.length;
  for (let k = 0; k < n; k++) {
    const target = k * step;
    for (;;) {
      const p = pts[i % len];
      const q = pts[(i + 1) % len];
      const seg = Math.hypot(q.x - p.x, q.y - p.y);
      if (segStart + seg >= target || i >= len * 2) {
        const t = seg > 0 ? (target - segStart) / seg : 0;
        out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
        break;
      }
      segStart += seg;
      i++;
    }
  }
  return out;
}

/** 輪郭のぎざぎざを、両隣との移動平均で少しならす（閉じた輪） */
export function smoothClosed(pts: readonly Point[], radius: number): Point[] {
  const n = pts.length;
  if (radius <= 0) return [...pts];
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    let sx = 0;
    let sy = 0;
    for (let k = -radius; k <= radius; k++) {
      const p = pts[(i + k + n) % n];
      sx += p.x;
      sy += p.y;
    }
    out.push({ x: sx / (2 * radius + 1), y: sy / (2 * radius + 1) });
  }
  return out;
}

/** 回して、ずらす */
export function transform(pts: readonly Point[], angle: number, offset: Point = { x: 0, y: 0 }): Point[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return pts.map((p) => ({ x: p.x * c - p.y * s + offset.x, y: p.x * s + p.y * c + offset.y }));
}

/** 点が多角形の中にあるか */
export function contains(pts: readonly Point[], p: Point): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** 点から多角形の縁までの最短距離 */
export function distanceToOutline(pts: readonly Point[], p: Point): number {
  let best = Infinity;
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    const d = Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
    if (d < best) best = d;
  }
  return best;
}
