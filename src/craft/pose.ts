// 比べる：手本と学ぶ人の、手の点（間引いたもの）から「どの瞬間が、どれだけ違うか」を出す。画面に依存しない純粋な関数。
//
// 見ているのは、手の点で確かに読めることだけ：
// - 手のふらつき：手のひらの中心が、前後 1 秒の真ん中の位置から、どれだけ離れたか（手のひらの長さを 1 とする）。
//   「金属を持つ手は、すり板に押し付けて動かさない」のような決まりを、目で見える形にする。
// - 手の向き：手首 → 中指の付け根の向き（度）。
// - いちばん似た形：学ぶ人のある瞬間の手の形に、いちばん近い手本の瞬間（並べて見せるため）。
// 道具（ヤスリ）の角度そのものは手の点からは読めない。それは画像を見る Claude（赤ペン）に任せる。
import type { SampledLandmarks } from "./record";

export type Side = "left" | "right";

/** 1 こまの、1 本の手（0〜1 の座標、21 点） */
export interface PoseFrame {
  t: number;
  /** 手のひらの中心（x は画面の高さに合わせて縮めた値ではなく、画面の幅に対する 0〜1） */
  cx: number;
  cy: number;
  /** 手のひらの長さ（画面の高さに対して） */
  palm: number;
  /** 手の向き（度。0° は指先が画面の右、90° は上） */
  angle: number;
  /** 21 点 [x0, y0, …]（0〜1） */
  pts: number[];
}

/** 手の 1 本ぶんの時間の並び。見えないこまは null */
export interface PoseTrack {
  side: Side;
  aspect: number;
  frames: (PoseFrame | null)[];
  times: number[];
}

/** 比べる値（ここ 1 か所に置く） */
export const POSE = {
  /** ふらつきを測る窓（片側、秒） */
  wobbleHalfS: 1,
  /** 手本のふらつきの、この割合の値を「手本のふつう」とする */
  masterQuantile: 0.9,
  /** 手本のふつうのこの倍を超えたら「違う」 */
  overFactor: 1.5,
  /** これより小さいふらつきは、違いとして扱わない（手のひらの長さに対して） */
  minWobble: 0.08,
  /** 違う所として見せる数 */
  maxMoments: 3,
  /** 違う所どうしを、これより近ければ 1 つにまとめる（秒） */
  mergeS: 0.8,
} as const;

function palmOf(flat: readonly number[], aspect: number) {
  const P = [0, 5, 9, 13, 17];
  const cx = P.reduce((s, i) => s + flat[2 * i], 0) / P.length;
  const cy = P.reduce((s, i) => s + flat[2 * i + 1], 0) / P.length;
  // 長さは画面の高さに合わせる（x は幅に対する値なので aspect を掛ける）
  const dx = (flat[18] - flat[0]) * aspect;
  const dy = flat[19] - flat[1];
  const palm = Math.hypot(dx, dy);
  const angle = (Math.atan2(-dy, dx) * 180) / Math.PI;
  return { cx, cy, palm, angle };
}

/**
 * 画面の右（または左）にある手を、1 本の時間の並びにする。
 * 2 本見えているこまは、手のひらの中心の x で左右を決める。1 本だけのこまは、前に見えた同じ側の手に近ければその手とする。
 */
export function poseTrack(s: SampledLandmarks, side: Side): PoseTrack {
  let last: { cx: number; cy: number } | null = null;
  const frames = s.frames.map((f) => {
    const hands = f.hands.filter((h) => h.length >= 42).map((h) => ({ h, ...palmOf(h, s.aspect) }));
    let pick: (typeof hands)[number] | undefined;
    if (hands.length >= 2) {
      const sorted = hands.slice().sort((a, b) => a.cx - b.cx);
      pick = side === "left" ? sorted[0] : sorted[sorted.length - 1];
    } else if (hands.length === 1) {
      const one = hands[0];
      if (last) pick = Math.hypot((one.cx - last.cx) * s.aspect, one.cy - last.cy) < 0.25 ? one : undefined;
      else pick = side === "right" ? (one.cx >= 0.4 ? one : undefined) : one.cx <= 0.6 ? one : undefined;
    }
    if (!pick) return null;
    last = { cx: pick.cx, cy: pick.cy };
    return { t: f.t, cx: pick.cx, cy: pick.cy, palm: pick.palm, angle: pick.angle, pts: pick.h.slice(0, 42) };
  });
  return { side, aspect: s.aspect, frames, times: s.frames.map((f) => f.t) };
}

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const quantile = (xs: number[], q: number) => {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))));
  return s[i];
};

/** 手のふらつき：前後 wobbleHalfS 秒の真ん中の位置からの離れ（手のひらの長さに対して）。見えないこまは null */
export function wobble(tr: PoseTrack, halfS: number = POSE.wobbleHalfS): (number | null)[] {
  const palm = median(tr.frames.flatMap((f) => (f ? [f.palm] : [])));
  return tr.frames.map((f, i) => {
    if (!f || !(palm > 0)) return null;
    const near = tr.frames.filter((g, j) => g && Math.abs(tr.times[j] - tr.times[i]) <= halfS) as PoseFrame[];
    if (near.length < 3) return null;
    const mx = median(near.map((g) => g.cx));
    const my = median(near.map((g) => g.cy));
    return Math.hypot((f.cx - mx) * tr.aspect, f.cy - my) / palm;
  });
}

/** 手本と比べて、違う瞬間（学ぶ人の動画の時刻） */
export interface Moment {
  /** 学ぶ人の動画の時刻（いちばん違うこま） */
  t: number;
  /** 違いが続いた区間 */
  t0: number;
  t1: number;
  /** その瞬間のふらつき（手のひらの長さに対して） */
  wobble: number;
  /** 並べて見せる、いちばん似た形の手本の時刻 */
  masterT: number | null;
  /** 手本と比べた手の向きの差（度、学ぶ人 − 手本） */
  angleDiff: number | null;
}

export interface PoseComparison {
  side: Side;
  /** ふらつきの平均（手のひらの長さに対して） */
  masterWobble: number;
  learnerWobble: number;
  /** 学ぶ人 ÷ 手本（手本がほぼ動かないときは、下限で割る） */
  ratio: number;
  /** 「違う」とした境目 */
  threshold: number;
  /** 学ぶ人の時刻ごとの、違いの強さ（0〜1。境目で 0.5） */
  heat: { t: number; v: number | null }[];
  moments: Moment[];
  /** 両方で手が見えたこまの割合 */
  seen: { master: number; learner: number };
}

/** 手の形の違い：手のひらの中心と大きさをそろえ、21 点の平均の離れ */
export function poseDistance(a: PoseFrame, b: PoseFrame, aspect: number): number {
  let s = 0;
  for (let i = 0; i < 21; i++) {
    const ax = ((a.pts[2 * i] - a.cx) * aspect) / a.palm;
    const ay = (a.pts[2 * i + 1] - a.cy) / a.palm;
    const bx = ((b.pts[2 * i] - b.cx) * aspect) / b.palm;
    const by = (b.pts[2 * i + 1] - b.cy) / b.palm;
    s += Math.hypot(ax - bx, ay - by);
  }
  return s / 21;
}

/** 学ぶ人の 1 こまに、いちばん似た形の手本のこま */
export function nearestPose(master: PoseTrack, f: PoseFrame): PoseFrame | null {
  let best: PoseFrame | null = null;
  let bd = Infinity;
  for (const m of master.frames) {
    if (!m) continue;
    const d = poseDistance(m, f, master.aspect);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}

/** 手本と学ぶ人を、同じ側の手で比べる */
export function comparePose(masterS: SampledLandmarks, learnerS: SampledLandmarks, side: Side): PoseComparison {
  const master = poseTrack(masterS, side);
  const learner = poseTrack(learnerS, side);
  const wm = wobble(master).filter((v): v is number => v !== null);
  const wlAll = wobble(learner);
  const wl = wlAll.filter((v): v is number => v !== null);
  // 全体のふらつきは平均で（真ん中の値だと、ときどき大きく揺れるのが消える）
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const masterWobble = mean(wm);
  const learnerWobble = mean(wl);
  const threshold = Math.max(POSE.minWobble, quantile(wm, POSE.masterQuantile) * POSE.overFactor || 0);
  const heat = wlAll.map((v, i) => ({ t: learner.times[i], v: v === null ? null : Math.min(1, v / (2 * threshold)) }));

  // 境目を超えた区間を集め、いちばん強い順に、近いものはまとめて選ぶ
  const runs: { t0: number; t1: number; i: number; w: number }[] = [];
  let cur: { t0: number; t1: number; i: number; w: number } | null = null;
  wlAll.forEach((v, i) => {
    const t = learner.times[i];
    if (v !== null && v > threshold) {
      if (!cur) cur = { t0: t, t1: t, i, w: v };
      cur.t1 = t;
      if (v > cur.w) Object.assign(cur, { i, w: v });
    } else if (cur) {
      runs.push(cur);
      cur = null;
    }
  });
  if (cur) runs.push(cur);
  const chosen: typeof runs = [];
  for (const r of runs.slice().sort((a, b) => b.w - a.w)) {
    if (chosen.some((c) => Math.abs(c.t0 - r.t0) < POSE.mergeS || Math.abs(c.t1 - r.t1) < POSE.mergeS)) continue;
    chosen.push(r);
    if (chosen.length >= POSE.maxMoments) break;
  }
  const moments = chosen
    .sort((a, b) => a.t0 - b.t0)
    .map((r): Moment => {
      const f = learner.frames[r.i]!;
      const m = nearestPose(master, f);
      let angleDiff = m ? f.angle - m.angle : null;
      if (angleDiff !== null) angleDiff = ((((angleDiff + 180) % 360) + 360) % 360) - 180;
      return { t: learner.times[r.i], t0: r.t0, t1: r.t1, wobble: r.w, masterT: m?.t ?? null, angleDiff };
    });

  const seenRatio = (tr: PoseTrack) => (tr.frames.length ? tr.frames.filter(Boolean).length / tr.frames.length : 0);
  return {
    side,
    masterWobble,
    learnerWobble,
    ratio: learnerWobble / Math.max(masterWobble, POSE.minWobble / 4),
    threshold,
    heat,
    moments,
    seen: { master: seenRatio(master), learner: seenRatio(learner) },
  };
}

/** ひとことで（画面と Claude に渡す） */
export function poseSummary(c: PoseComparison): string {
  const r = c.ratio;
  const how = r >= 1.3 ? `手本の約 ${r.toFixed(1)} 倍動いています` : r <= 0.77 ? `手本より動きが小さいです（約 ${r.toFixed(1)} 倍）` : "手本とほぼ同じです";
  return `${c.side === "right" ? "画面の右の手" : "画面の左の手"}のふらつき：${how}（手本 ${c.masterWobble.toFixed(2)}・あなた ${c.learnerWobble.toFixed(2)}、手のひらの長さを 1 として）。`;
}
