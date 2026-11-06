// 1 本の動画から、道具の扱いの判定（src/craft/hand-judge.ts）に使う値を測る（2026-11-07 職人（石川）の言葉から）。
//   金属の固定 → 押さえる手のふらつき／ヤスリの角度 → ヤスリの線（src/craft/tool-line.ts）の角度のぶれ／ストローク → ヤスリを持つ手の往復の長さ
// 手が映っていないこまが多いときは「測れなかった」とし、数を作らない。
import { poseTrack, wobble, type PoseFrame, type PoseTrack, type Side } from "./pose";
import type { SampledLandmarks } from "./record";
import { lineAngleWobble, type ToolLine } from "./tool-line";

export const PAIR_MEASURE = {
  /** 手が見えたこまが、これより少なければ測れなかったとする */
  minSeen: 0.35,
  /** 角度のぶれ：見えたこまがこれより少なければ測れない */
  minAngleFrames: 12,
  /** 1 回の動き：これより短い動きは、往復と数えない（手のひらの長さに対して） */
  minStroke: 0.15,
  /** 1 回の動き：これより少ない回数なら、測れなかったとする（2026-11-07 のよくない例は 3 回で、長さが 0.29〜4.37 とばらばらだった） */
  minStrokes: 4,
  /** 見えないこまを、これだけ（こま）までは前後からつないで数える */
  maxGap: 3,
} as const;

const median = (xs: readonly number[]) => {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const quantile = (xs: readonly number[], q: number) => {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const pos = q * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};
const seenOf = (tr: PoseTrack) => (tr.frames.length ? tr.frames.filter(Boolean).length / tr.frames.length : 0);

/** 角度を、基準のまわり（−180〜180°）にそろえる */
const around = (a: number, ref: number) => ((((a - ref + 180) % 360) + 360) % 360) - 180;

/** 手の向きのぶれ（度）：真ん中の向きからの離れの、25〜75% の幅。外れたこまに引っぱられない */
export function angleSpread(tr: PoseTrack): number | null {
  const fs = tr.frames.filter((f): f is PoseFrame => !!f);
  if (fs.length < PAIR_MEASURE.minAngleFrames) return null;
  // 角度は 1 周でつながるので、まず真ん中を決めてから、そのまわりにそろえる
  const ref = fs[0].angle;
  const unwrapped = fs.map((f) => around(f.angle, ref));
  const mid = median(unwrapped);
  const d = unwrapped.map((a) => a - mid);
  return quantile(d, 0.75) - quantile(d, 0.25);
}

/**
 * 1 回ずつの動きの長さ（手のひらの長さを 1 として）。
 * 手のひらの中心の通り道を、いちばんよく動いた向き（主の軸）に写し、折り返し点から折り返し点までを 1 回とする。
 */
export function strokeLengths(tr: PoseTrack): number[] {
  const fs = tr.frames;
  const palm = median(fs.flatMap((f) => (f ? [f.palm] : [])));
  if (!(palm > 0)) return [];
  // 短い見えない所は前後からつなぐ。長い所は切れ目にする
  const xs: (number | null)[] = fs.map((f) => (f ? f.cx * tr.aspect : null));
  const ys: (number | null)[] = fs.map((f) => (f ? f.cy : null));
  const fill = (a: (number | null)[]) => {
    const out = a.slice();
    for (let i = 0; i < out.length; i++) {
      if (out[i] !== null) continue;
      let j = i;
      while (j < out.length && out[j] === null) j++;
      if (i > 0 && j < out.length && j - i <= PAIR_MEASURE.maxGap) {
        const a0 = out[i - 1]!;
        const a1 = out[j]!;
        for (let k = i; k < j; k++) out[k] = a0 + ((a1 - a0) * (k - i + 1)) / (j - i + 1);
      }
      i = j;
    }
    return out;
  };
  const X = fill(xs);
  const Y = fill(ys);
  const pts = X.flatMap((x, i) => (x !== null && Y[i] !== null ? [{ x, y: Y[i]! }] : []));
  if (pts.length < 6) return [];
  // 主の軸（動きのいちばん大きい向き）
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of pts) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
    syy += (p.y - my) ** 2;
  }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(th);
  const uy = Math.sin(th);
  // 切れ目ごとに、軸に写した位置の並びを作り、少しならす
  const runs: number[][] = [];
  let cur: number[] = [];
  X.forEach((x, i) => {
    if (x === null || Y[i] === null) {
      if (cur.length) runs.push(cur);
      cur = [];
    } else cur.push((x - mx) * ux + (Y[i]! - my) * uy);
  });
  if (cur.length) runs.push(cur);
  const out: number[] = [];
  const min = PAIR_MEASURE.minStroke * palm;
  for (const r of runs) {
    const s = r.map((v, i) => (r[i - 1] ?? v) * 0.25 + v * 0.5 + (r[i + 1] ?? v) * 0.25);
    // 折り返し点：そこから min 以上もどった所だけ（小さな震えは折り返しにしない）。動画の始まりは折り返しに数えない
    const turns: number[] = [];
    let hi = s[0];
    let lo = s[0];
    let hiK = 0;
    let loK = 0;
    let dir = 0;
    const push = (v: number, k: number) => {
      if (k > 0) turns.push(v);
    };
    s.forEach((v, k) => {
      if (dir >= 0 && v > hi) [hi, hiK] = [v, k];
      if (dir <= 0 && v < lo) [lo, loK] = [v, k];
      if (dir >= 0 && hi - v >= min) {
        push(hi, hiK);
        dir = -1;
        [lo, loK] = [v, k];
      } else if (dir <= 0 && v - lo >= min) {
        push(lo, loK);
        dir = 1;
        [hi, hiK] = [v, k];
      }
    });
    for (let i = 1; i < turns.length; i++) out.push(Math.abs(turns[i] - turns[i - 1]) / palm);
  }
  return out;
}

export interface HandMeasure {
  seen: number;
  /** 手のひらの中心のふらつきの平均（手のひらの長さを 1 として） */
  wobble: number | null;
  /** 手の向きのぶれ（度） */
  angleSpread: number | null;
  /** 1 回ずつの動きの長さの真ん中（手のひらの長さを 1 として） */
  stroke: number | null;
  strokes: number;
}

export function measureHand(s: SampledLandmarks, side: Side): HandMeasure {
  const tr = poseTrack(s, side);
  const seen = seenOf(tr);
  const ok = seen >= PAIR_MEASURE.minSeen;
  const w = wobble(tr).filter((v): v is number => v !== null);
  const st = strokeLengths(tr);
  return {
    seen,
    wobble: ok && w.length ? w.reduce((a, b) => a + b, 0) / w.length : null,
    angleSpread: ok ? angleSpread(tr) : null,
    stroke: ok && st.length >= PAIR_MEASURE.minStrokes ? median(st) : null,
    strokes: st.length,
  };
}

/** 押さえる手・ヤスリを持つ手が、画面の右か左か。呼び名も */
export interface PairHands {
  hold: { side: Side; name: string };
  file: { side: Side; name: string; tool: string };
}

/** こまごとのヤスリの線（scripts/mihon-tool-line.ts か、ブラウザの src/app/tool-track.ts が動画から探した物。見つからないこまは null） */
export interface PairToolLines {
  fps: number;
  lines: (ToolLine | null)[];
}

/** 1 本の動画の、判定に使う値（測れなかった物は null・空） */
export interface TakeMeasure {
  /** 押さえる手のふらつき（手のひらの長さを 1 として） */
  hold: number | null;
  /** ヤスリの角度のぶれ（度。ヤスリの線から） */
  angle: number | null;
  /** ヤスリを持つ手の、1 回ずつの往復の長さ（手のひらの長さを 1 として） */
  strokes: number[];
  /** 手が見えたこまの割合（押さえる手・ヤスリを持つ手）と、ヤスリの線が見つかったこまの割合 */
  seen: { hold: number; file: number; tool: number };
}

/** 1 本の動画を測る（手の点と、ヤスリの線から） */
export function measureTake(s: SampledLandmarks, hands: PairHands, tool: PairToolLines | null): TakeMeasure {
  const h = measureHand(s, hands.hold.side);
  const ftr = poseTrack(s, hands.file.side);
  const fileSeen = seenOf(ftr);
  const toolSeen = tool && tool.lines.length ? tool.lines.filter(Boolean).length / tool.lines.length : 0;
  return {
    hold: h.wobble,
    angle: tool ? lineAngleWobble(tool.lines, tool.fps) : null,
    strokes: fileSeen >= PAIR_MEASURE.minSeen ? strokeLengths(ftr) : [],
    seen: { hold: h.seen, file: fileSeen, tool: toolSeen },
  };
}

/** 「1.7 倍」「0.6 倍」の字 */
export const ratioText = (r: number) => `${r.toFixed(1)} 倍`;
