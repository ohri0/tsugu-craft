// 動画の 1 こまから、道具（ヤスリ）のまっすぐな長い縁を探して、その線と角度を出す（2026-11-07 作者：大事なのはヤスリの角度）。
// 手の点ではヤスリの向きは分からない（ヤスリを持つ手は画面の外に出ることが多い）。ヤスリそのものの縁を、画面の明るさの変わり目から探す。
//
// やり方（ハフ変換を自分で書いた物）：
//   1. 明るさの変わり目（Sobel）の強い点だけを使う。
//   2. 各点は、変わり目の向きに直交する線にだけ票を入れる（向き ±6°）。強い変わり目ほど重く。
//   3. 票のいちばん多い線を選ぶ。台（すり板）や光の帯のような、ほぼ縦・ほぼ横の線は、ヤスリではないので外す。
//   4. その線にのる点の、端から端（5〜95%）を線分にする。のる点が少なければ「見つからない」。
// 画面に依存しない純粋な関数。動画から明るさを取り出すのは scripts/mihon-tool-line.ts。

export interface ToolLineOptions {
  /** 探す所（0〜1。上の端・下の端） */
  roiTop: number;
  roiBottom: number;
  /** 変わり目の強さの下限（0〜255 の明るさの差の目安） */
  minEdge: number;
  /** 縦・横からこの角度（度）以内の線は外す（台の縁・光の帯） */
  skipAxisDeg: number;
  /** 線にのる点が、画面の高さのこの割合より少なければ「見つからない」 */
  minSupport: number;
}

// 2026-11-07 の撮り分けた動画で、こまの一覧に線を描いて確かめて決めた（minEdge 40・minSupport 0.25 では、いい例の 31% しか見つからなかった）
export const TOOL_LINE: ToolLineOptions = { roiTop: 0.3, roiBottom: 1, minEdge: 20, skipAxisDeg: 12, minSupport: 0.15 };

export interface ToolLine {
  /** 線の角度（度。0° は画面の右、90° は上。0〜180） */
  angle: number;
  /** 線分の両端（0〜1、画面の幅・高さに対して） */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 線にのった点の数 ÷ 画面の高さ */
  support: number;
}

/** 1 つの点が票を入れる向きの幅（度、±）。変わり目の向きの誤差を見込む */
const VOTE_DEG = 6;

/** 明るさ（1 こま、幅 w × 高さ h、0〜255）から、道具の線を探す */
export function findToolLine(gray: Uint8Array | number[], w: number, h: number, o: ToolLineOptions = TOOL_LINE): ToolLine | null {
  const y0 = Math.max(1, Math.floor(o.roiTop * h));
  const y1 = Math.min(h - 1, Math.ceil(o.roiBottom * h));
  const diag = Math.ceil(Math.hypot(w, h));
  const NT = 180;
  const acc = new Float32Array(NT * (2 * diag + 1));
  const cos = Float64Array.from({ length: NT }, (_, k) => Math.cos((k * Math.PI) / 180));
  const sin = Float64Array.from({ length: NT }, (_, k) => Math.sin((k * Math.PI) / 180));
  const pts: { x: number; y: number; th: number; m: number }[] = [];
  // 少しぼかしてから変わり目を取る（階段のようなギザギザの縁だと、変わり目の向きが 45° の方へ寄った）
  const soft = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      let sum = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) sum += gray[(y + oy) * w + x + ox];
      soft[y * w + x] = sum / 9;
    }
  const at = (x: number, y: number) => soft[y * w + x];
  for (let y = Math.max(2, y0); y < Math.min(h - 2, y1); y++) {
    for (let x = 2; x < w - 2; x++) {
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      const m = Math.hypot(gx, gy) / 4;
      if (m < o.minEdge) continue;
      // 変わり目の向き＝線の法線。0〜180° にそろえる
      let th = (Math.atan2(gy, gx) * 180) / Math.PI;
      th = ((th % 180) + 180) % 180;
      pts.push({ x, y, th, m });
      for (let d = -VOTE_DEG; d <= VOTE_DEG; d++) {
        const k = (Math.round(th) + d + NT) % NT;
        const r = Math.round(x * cos[k] + y * sin[k]) + diag;
        acc[k * (2 * diag + 1) + r] += Math.min(m, 160);
      }
    }
  }
  // いちばん多い票。縦・横に近い線（法線が 0°・90°・180° に近い）は外す
  let best = -1;
  let bestV = 0;
  for (let k = 0; k < NT; k++) {
    const off = Math.min(k % 90, 90 - (k % 90));
    if (off < o.skipAxisDeg) continue;
    for (let r = 0; r < 2 * diag + 1; r++) {
      const v = acc[k * (2 * diag + 1) + r];
      if (v > bestV) [bestV, best] = [v, k * (2 * diag + 1) + r];
    }
  }
  if (best < 0) return null;
  const k = Math.floor(best / (2 * diag + 1));
  const rho = (best % (2 * diag + 1)) - diag;
  // 線にのる点（線から 1.5 画素以内・向きも合う）
  const on: { x: number; y: number }[] = [];
  for (const p of pts) {
    const dist = Math.abs(p.x * cos[k] + p.y * sin[k] - rho);
    const dth = Math.min(Math.abs(p.th - k), 180 - Math.abs(p.th - k));
    if (dist <= 1.5 && dth <= 6) on.push(p);
  }
  const support = on.length / h;
  if (support < o.minSupport) return null;
  // 票の角度は 1° きざみなので、のった点に直線を当てはめ直して、角度を細かく出す（主の軸）
  const mx = on.reduce((a, p) => a + p.x, 0) / on.length;
  const my = on.reduce((a, p) => a + p.y, 0) / on.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of on) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
    syy += (p.y - my) ** 2;
  }
  const phi = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const dx = Math.cos(phi);
  const dy = Math.sin(phi);
  const along = on.map((p) => (p.x - mx) * dx + (p.y - my) * dy).sort((a, b) => a - b);
  const q = (f: number) => along[Math.min(along.length - 1, Math.max(0, Math.round(f * (along.length - 1))))];
  const s0 = q(0.05);
  const s1 = q(0.95);
  let ax = mx + dx * s0;
  let ay = my + dy * s0;
  let bx = mx + dx * s1;
  let by = my + dy * s1;
  // 下の端を始まりに（ヤスリは手前＝下から入る）
  if (ay < by) [ax, ay, bx, by] = [bx, by, ax, ay];
  const angle = ((((Math.atan2(-(by - ay), bx - ax) * 180) / Math.PI) % 180) + 180) % 180;
  return { angle, x0: ax / w, y0: ay / h, x1: bx / w, y1: by / h, support };
}

/** 角度のぶれ（度）：真ん中の角度からの離れの、25〜75% の幅。見つかったこまが少なければ null */
export function lineAngleSpread(lines: readonly (ToolLine | null)[], minFrames = 12): number | null {
  const a = lines.filter((l): l is ToolLine => !!l).map((l) => l.angle);
  if (a.length < minFrames) return null;
  // 0°・180° をまたがないよう、最初の角度のまわりにそろえる
  const ref = a[0];
  const u = a.map((v) => ((((v - ref + 90) % 180) + 180) % 180) - 90).sort((x, y) => x - y);
  const q = (f: number) => {
    const pos = f * (u.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return u[lo] + (u[hi] - u[lo]) * (pos - lo);
  };
  return q(0.75) - q(0.25);
}

export const TOOL_WOBBLE = {
  /** 前後この秒の真ん中の角度と比べる（手のふらつき src/craft/pose.ts の POSE.wobbleHalfS と同じ 1 秒） */
  halfS: 1,
  /**
   * 先に、前後この秒の真ん中の角度で ならす（1 こまだけ別の縁を拾った読み違いを消す。ヤスリが 0.1 秒だけ 10° 回って戻ることはない）。
   * 2026-11-07 の動画で、ならさないと、いい例の読み違い（指の縁など 1 こまだけ 37°・45°・63°）が「ぶれ」に数えられた。
   */
  despikeS: 0.2,
  /** ならしたあとでも、これより大きく離れたこまは読み違いとして数えない（度） */
  maxDevDeg: 20,
  /** 線が見つかったこまが、これより少なければ測れない */
  minFrames: 12,
} as const;

const medianOf = (xs: number[]) => {
  const s = xs.slice().sort((p, q) => p - q);
  return s.length % 2 ? s[s.length >> 1] : (s[(s.length >> 1) - 1] + s[s.length >> 1]) / 2;
};

/** こまごとの角度を、前後 despikeS 秒の真ん中で ならした物（線のないこまは null。0〜180° をまたがないよう、最初の角度のまわりにそろえる） */
export function cleanAngles(lines: readonly (ToolLine | null)[], fps: number, despikeS: number = TOOL_WOBBLE.despikeS): (number | null)[] {
  const first = lines.find((l): l is ToolLine => !!l);
  if (!first) return lines.map(() => null);
  const ref = first.angle;
  const u = lines.map((l) => (l ? ref + ((((l.angle - ref + 90) % 180) + 180) % 180) - 90 : null));
  const k = Math.max(1, Math.round(despikeS * fps));
  return u.map((v, i) => {
    if (v === null) return null;
    const near = u.slice(Math.max(0, i - k), i + k + 1).filter((x): x is number => x !== null);
    return near.length >= 3 ? medianOf(near) : v;
  });
}

/**
 * ヤスリの角度のぶれ（度）：ならした角度で、こまごとに前後 halfS 秒の真ん中の角度からの離れを取り、その平均。
 * ゆっくり向きを変えた分（構え直し）は数えず、削っている間に角度が それる・揺れる 分を数える（手のふらつきと同じ考え方）。
 */
export function lineAngleWobble(lines: readonly (ToolLine | null)[], fps: number, halfS: number = TOOL_WOBBLE.halfS, minFrames: number = TOOL_WOBBLE.minFrames): number | null {
  if (lines.filter(Boolean).length < minFrames) return null;
  const u = cleanAngles(lines, fps);
  const half = Math.max(1, Math.round(halfS * fps));
  const dev: number[] = [];
  u.forEach((v, i) => {
    if (v === null) return;
    const near = u.slice(Math.max(0, i - half), i + half + 1).filter((x): x is number => x !== null);
    if (near.length < 3) return;
    const d = Math.abs(v - medianOf(near));
    if (d <= TOOL_WOBBLE.maxDevDeg) dev.push(d);
  });
  return dev.length >= minFrames ? dev.reduce((s, x) => s + x, 0) / dev.length : null;
}
