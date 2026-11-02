// テスト用の合成の写真。大きさの分かっている形を、むらのある紙の上に描く。
import { contains, type Point } from "../../src/geometry/polygon";
import type { RGBAImage } from "../../src/vision/image";

export interface Shape {
  outline: Point[];
  color: [number, number, number];
}

export interface SynthOptions {
  width: number;
  height: number;
  /** 左上と右下の紙の色（間はなめらかにつなぐ） */
  paper: [[number, number, number], [number, number, number]];
  shapes: Shape[];
  /** 雑音の大きさ（± の幅） */
  noise?: number;
  /** 左の端に触れる影（ケースの縁や影のつもり） */
  borderShadow?: boolean;
  seed?: number;
}

export function synth(o: SynthOptions): RGBAImage {
  const data = new Uint8ClampedArray(o.width * o.height * 4);
  let s = o.seed ?? 1;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
  const boxes = o.shapes.map((sh) => bbox(sh.outline));
  const SS = 4;
  for (let y = 0; y < o.height; y++) {
    for (let x = 0; x < o.width; x++) {
      const t = (x / o.width + y / o.height) / 2;
      let col = [0, 1, 2].map((c) => o.paper[0][c] * (1 - t) + o.paper[1][c] * t);
      if (o.borderShadow && x < o.width * 0.06) col = col.map((v) => v * 0.55);
      for (let k = 0; k < o.shapes.length; k++) {
        const b = boxes[k];
        if (x + 1 < b.x0 || x > b.x1 || y + 1 < b.y0 || y > b.y1) continue;
        let inside = 0;
        for (let sy = 0; sy < SS; sy++)
          for (let sx = 0; sx < SS; sx++)
            if (contains(o.shapes[k].outline, { x: x + (sx + 0.5) / SS, y: y + (sy + 0.5) / SS })) inside++;
        const a = inside / (SS * SS);
        col = col.map((v, c) => v * (1 - a) + o.shapes[k].color[c] * a);
      }
      const i = (y * o.width + x) * 4;
      const n = (o.noise ?? 0) * rand();
      data[i] = col[0] + n;
      data[i + 1] = col[1] + n;
      data[i + 2] = col[2] + n;
      data[i + 3] = 255;
    }
  }
  return { width: o.width, height: o.height, data };
}

function bbox(p: Point[]) {
  return {
    x0: Math.min(...p.map((q) => q.x)),
    x1: Math.max(...p.map((q) => q.x)),
    y0: Math.min(...p.map((q) => q.y)),
    y1: Math.max(...p.map((q) => q.y)),
  };
}

/** 底辺 base、高さ height の三角形（画像座標、中心 cx, cy、角度 rot） */
export function triangle(cx: number, cy: number, base: number, height: number, rot = 0): Point[] {
  const pts = [
    { x: -base / 2, y: height / 3 },
    { x: base / 2, y: height / 3 },
    { x: base * 0.1, y: (-2 * height) / 3 },
  ];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return pts.map((p) => ({ x: cx + p.x * c - p.y * s, y: cy + p.x * s + p.y * c }));
}

export function ellipse(cx: number, cy: number, a: number, b: number, n = 200): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return { x: cx + a * Math.cos(t), y: cy + b * Math.sin(t) };
  });
}

export function regular(cx: number, cy: number, r: number, sides: number, rot = 0): Point[] {
  return Array.from({ length: sides }, (_, i) => {
    const t = rot + (i / sides) * Math.PI * 2;
    return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) };
  });
}

/** 角を丸めた多角形（半径 r の円弧で） */
export function rounded(poly: Point[], r: number, perCorner = 12): Point[] {
  const out: Point[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const a = poly[(i - 1 + n) % n];
    const b = poly[(i + 1) % n];
    const ua = norm({ x: a.x - p.x, y: a.y - p.y });
    const ub = norm({ x: b.x - p.x, y: b.y - p.y });
    const half = Math.acos(ua.x * ub.x + ua.y * ub.y) / 2;
    const d = r / Math.tan(half);
    const bis = norm({ x: ua.x + ub.x, y: ua.y + ub.y });
    const c = { x: p.x + bis.x * (r / Math.sin(half)), y: p.y + bis.y * (r / Math.sin(half)) };
    const s0 = { x: p.x + ua.x * d, y: p.y + ua.y * d };
    const s1 = { x: p.x + ub.x * d, y: p.y + ub.y * d };
    let t0 = Math.atan2(s0.y - c.y, s0.x - c.x);
    let t1 = Math.atan2(s1.y - c.y, s1.x - c.x);
    let dt = t1 - t0;
    while (dt > Math.PI) dt -= 2 * Math.PI;
    while (dt < -Math.PI) dt += 2 * Math.PI;
    for (let k = 0; k <= perCorner; k++) {
      const t = t0 + (dt * k) / perCorner;
      out.push({ x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) });
    }
    void t1;
  }
  return out;
}

function norm(v: Point): Point {
  const l = Math.hypot(v.x, v.y);
  return { x: v.x / l, y: v.y / l };
}
