// テスト用の合成の手。手首の位置と手の向きを決めて、21 点を作る（本物の手の写真は使わない）。
import type { LandmarkPoint, MotionFrame, MotionInput } from "../../src/craft/motion";

/** 手の点の形（手首 → 中指の付け根を 1、横向きのずれを v）。おおよその並びでよい */
const TEMPLATE: [number, number][] = [
  [0, 0],
  [0.25, -0.3], [0.45, -0.5], [0.65, -0.65], [0.85, -0.75],
  [0.95, -0.3], [1.35, -0.32], [1.6, -0.33], [1.8, -0.34],
  [1, 0], [1.45, 0], [1.7, 0], [1.95, 0],
  [0.95, 0.25], [1.35, 0.27], [1.6, 0.28], [1.8, 0.29],
  [0.85, 0.45], [1.15, 0.5], [1.35, 0.53], [1.5, 0.55],
];

export function rng(seed: number) {
  let s = seed >>> 0;
  const u = () => ((s = (s * 1664525 + 1013904223) >>> 0) + 0.5) / 2 ** 32;
  return {
    uniform: u,
    /** 平均 0、標準偏差 1 */
    gauss: () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()),
  };
}

export interface HandPose {
  /** 手首（x は画面の幅、y は高さに対して 0〜1） */
  x: number;
  y: number;
  /** 手首 → 中指の付け根の長さ（画面の高さに対して） */
  palm: number;
  /** 手の向き（度、0 は右、90 は上） */
  angle: number;
}

export function handLandmarks(p: HandPose, aspect: number, noise = 0, r = rng(1)): LandmarkPoint[] {
  const a = (p.angle * Math.PI) / 180;
  // 画面の上で（y は下向き）、手の向きの単位ベクトルと横のベクトル
  const ux = Math.cos(a);
  const uy = -Math.sin(a);
  const vx = -uy;
  const vy = ux;
  return TEMPLATE.map(([u, v]) => {
    const X = p.x * aspect + (u * ux + v * vx) * p.palm;
    const Y = p.y + (u * uy + v * vy) * p.palm;
    return { x: X / aspect + (noise * r.gauss()) / aspect, y: Y + noise * r.gauss() };
  });
}

export interface SynthMotion {
  durationS: number;
  fps: number;
  aspect?: number;
  /** 時刻 → 手の形（null は見えない）。2 本の手なら配列で */
  pose: (t: number) => HandPose | null | (HandPose | null)[];
  /** 手の点のぶれ（標準偏差、画面の高さに対して） */
  noise?: number;
  seed?: number;
}

export function synthMotion(o: SynthMotion): MotionInput {
  const aspect = o.aspect ?? 16 / 9;
  const r = rng(o.seed ?? 7);
  const frames: MotionFrame[] = [];
  const n = Math.round(o.durationS * o.fps);
  for (let i = 0; i < n; i++) {
    const t = i / o.fps;
    const p = o.pose(t);
    const list = Array.isArray(p) ? p : [p];
    frames.push({
      t,
      hands: list.filter((x): x is HandPose => x !== null).map((x) => ({ landmarks: handLandmarks(x, aspect, o.noise ?? 0, r), score: 0.9 })),
    });
  }
  return { frames, aspect, durationS: o.durationS };
}

/** 1 分あたり perMin 回の上下の動き（振れ幅 amp は片側、画面の高さに対して） */
export function strokesAt(perMin: number, amp: number, opts: { x?: number; y?: number; palm?: number; angle?: number; angleSwing?: number; drift?: number } = {}) {
  const f = perMin / 60;
  return (t: number): HandPose => {
    const ph = 2 * Math.PI * f * t;
    return {
      x: (opts.x ?? 0.5) + (opts.drift ?? 0) * t,
      y: (opts.y ?? 0.5) + amp * Math.sin(ph),
      palm: opts.palm ?? 0.15,
      angle: (opts.angle ?? 80) + (opts.angleSwing ?? 0) * Math.sin(ph),
    };
  };
}

/** 1 回ごとの長さがばらつく動き（位相を足していく） */
export function irregularStrokes(meanPerMin: number, spread: number, amp: number, seed = 3) {
  const r = rng(seed);
  const meanP = 60 / meanPerMin;
  const edges: number[] = [0];
  while (edges[edges.length - 1] < 600) edges.push(edges[edges.length - 1] + meanP * (1 + spread * (2 * r.uniform() - 1)));
  return (t: number): HandPose => {
    let i = 0;
    while (edges[i + 1] <= t) i++;
    const ph = (2 * Math.PI * (t - edges[i])) / (edges[i + 1] - edges[i]);
    return { x: 0.5, y: 0.5 + amp * Math.sin(ph), palm: 0.15, angle: 80 };
  };
}
