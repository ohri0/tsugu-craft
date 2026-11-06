// いい例とよくない例を、職人が言った所で比べる（2026-11-07 職人（石川）の言葉から）。
//   1. ヤスリの角度：同じ角度を保っているか → ヤスリの線（src/craft/tool-line.ts）の角度のぶれ。線がなければ手の向き
//   2. 1 回の動きの長さ：ヤスリを長く使っているか → ヤスリを持つ手の、1 回の往復で動いた長さ（手のひらの長さを 1 として）
// 押さえる手のふらつきも測れるが（measureHand の wobble）、作者の声で画面には出さない。手が映っていないこまが多い・回数が足りないときは「測れなかった」とし、数を出さない。
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
  /** 違いとして見せる倍（これより 1 に近ければ「ほぼ同じ」） */
  showOver: 1.3,
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

export type PairKey = "angle" | "stroke";

export interface PairItem {
  key: PairKey;
  /** 画面の 1 行（例：ヤスリの角度のぶれ） */
  label: string;
  good: number | null;
  bad: number | null;
  /** よくない例 ÷ いい例（測れなかったら null） */
  ratio: number | null;
  /** 単位（° など。手のひらの長さを 1 とした値は空） */
  unit: string;
  /** 何から測ったか（ヤスリの線・手の点） */
  from: "tool" | "hand";
  /** 測れなかったわけ（測れたら空） */
  missing: string;
}

/** 押さえる手・ヤスリを持つ手が、画面の右か左か。呼び名も */
export interface PairHands {
  hold: { side: Side; name: string };
  file: { side: Side; name: string; tool: string };
}

/** こまごとのヤスリの線（scripts/mihon-tool-line.ts が動画から探した物。見つからないこまは null） */
export interface PairToolLines {
  fps: number;
  good: (ToolLine | null)[];
  bad: (ToolLine | null)[];
}

/**
 * いい例とよくない例を比べる（2026-11-07 作者：大事なのはヤスリの角度。手の動きそのものは大事ではない）。
 *   1. ヤスリの角度のぶれ（いちばん大事）：ヤスリそのものの線から。線がなければ、ヤスリを持つ手の向きから（そう書く）
 *   2. 1 回の動きの長さ：ヤスリを持つ手の、1 回の往復で動いた長さ（測れたときだけ）
 * 押さえる手のふらつきは、作者の声で外した（手の動きより、ヤスリの角度）。
 */
export function comparePair(good: SampledLandmarks, bad: SampledLandmarks, hands: PairHands, tools?: PairToolLines): PairItem[] {
  const gf = measureHand(good, hands.file.side);
  const bf = measureHand(bad, hands.file.side);
  const why = (need: string) => (gf.seen < PAIR_MEASURE.minSeen || bf.seen < PAIR_MEASURE.minSeen ? "ヤスリを持つ手が映っていない所が多い" : need);
  // いい例がほとんど 0 のときに、倍が大きくなりすぎないよう下限で割る
  const item = (key: PairKey, label: string, g: number | null, b: number | null, unit: string, from: PairItem["from"], missing: string, floor = 0): PairItem => ({
    key,
    label,
    good: g,
    bad: b,
    unit,
    from,
    ratio: g !== null && b !== null && Math.max(g, floor) > 0 ? Math.max(b, floor) / Math.max(g, floor) : null,
    missing: g !== null && b !== null ? "" : missing,
  });
  const tg = tools ? lineAngleWobble(tools.good, tools.fps) : null;
  const tb = tools ? lineAngleWobble(tools.bad, tools.fps) : null;
  const angle =
    tg !== null && tb !== null
      ? item("angle", `${hands.file.tool}の角度のぶれ`, tg, tb, "°", "tool", "", 0.2)
      : item("angle", `手の向きから見た${hands.file.tool}の角度のぶれ`, gf.angleSpread, bf.angleSpread, "°", "hand", tools ? `${hands.file.tool}の線が見つかったこまが少なく、手の向きも${why("読めたこまが少ない")}` : why("角度を読めたこまが少ない"), 1);
  return [angle, item("stroke", "1 回の動きの長さ", gf.stroke, bf.stroke, "", "hand", why(`往復を数えられたのが いい例 ${gf.strokes} 回・よくない例 ${bf.strokes} 回で足りない`))];
}

/** 見せてよい違い（測れて、1 から十分に離れている物）。多くても max 個 */
export function shownDifferences(items: readonly PairItem[], max = 3): PairItem[] {
  return items.filter((x) => x.ratio !== null && (x.ratio >= PAIR_MEASURE.showOver || x.ratio <= 1 / PAIR_MEASURE.showOver)).slice(0, max);
}

/** 「1.7 倍」「0.6 倍」の字 */
export const ratioText = (r: number) => `${r.toFixed(1)} 倍`;
