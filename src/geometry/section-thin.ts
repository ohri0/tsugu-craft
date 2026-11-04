// 腕の断面の中で、局所的に薄い所（とがり・ヒレ・ナイフのような縁）を探す。画面に依存しない純粋な関数。
// 作者の言葉（2026-11-04）：3.0×1.6 の平打ちや M の形は「薄すぎ」ではない。危ないのは、とがった先や薄いヒレだけ。
// だから腕ぜんぶを赤くするのではなく、その場所だけを示す。
// 局所の厚み：直径 minLocalMm の円が、形の中に入れるか。入る円のどれにも届かず、届かない深さが半径より大きい所を「薄い所」とする。
// 先の角度：線が折れる所（とがり）の、金属の側の角度。端の点では、外側の線と指の側の平らな線のなす角度。
import type { P2 } from "./bspline";

export interface ThinLimits {
  /** 局所の厚みがこれより薄い所を「薄い」とする（mm） */
  minLocalMm: number;
  /** とがった先の、金属の側の角度がこれより小さければ知らせる（度） */
  minTipAngleDeg: number;
}

export interface ThinSpot {
  kind: "fin" | "tip";
  /** 知らせる所（いちばん薄い所、またはとがった先）。断面の座標（mm：x は幅の向き、y は指の側からの高さ） */
  at: P2;
  /** 薄い所の線（赤く描く所）。とがった先なら、先のまわりの短い線 */
  run: P2[];
  /** 薄い所のいちばん薄い厚み（mm）。とがった先なら、先から minLocalMm 入った所の厚み */
  thicknessMm: number;
  /** とがった先の角度（度）。ヒレなら、いちばん鋭い所の角度（なければ 180） */
  angleDeg: number;
}

const dist = (a: P2, b: P2) => Math.hypot(a.x - b.x, a.y - b.y);

/** 半直線 p + s·d（s > 0）と線分 a–b が交わる s（交わらなければ Infinity） */
function rayHit(p: P2, d: P2, a: P2, b: P2): number {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const den = d.x * ey - d.y * ex;
  if (Math.abs(den) < 1e-14) return Infinity;
  const wx = a.x - p.x;
  const wy = a.y - p.y;
  const s = (wx * ey - wy * ex) / den;
  const t = (wx * d.y - wy * d.x) / den;
  return s > 1e-9 && t >= -1e-9 && t <= 1 + 1e-9 ? s : Infinity;
}

/**
 * 外側の線（右の端の内側 → 上 → 左の端の内側。両端は y ＝ 0）から、局所的に薄い所を探す。
 * 線は細かく取った点の列で渡す（角の点をふくむこと）。指の側は、両端をまっすぐ結んだ平らな線
 */
export function findThinSpots(outer: readonly P2[], lim: ThinLimits): ThinSpot[] {
  // 細かさをそろえる（長い線分を分ける）：厚みの見落としを防ぐ
  const step = Math.max(0.01, lim.minLocalMm / 8);
  const line: P2[] = [];
  outer.forEach((p, i) => {
    if (i > 0) {
      const q = outer[i - 1];
      const n = Math.ceil(dist(p, q) / step);
      for (let k = 1; k < n; k++) line.push({ x: q.x + ((p.x - q.x) * k) / n, y: q.y + ((p.y - q.y) * k) / n });
    }
    if (i === 0 || dist(p, outer[i - 1]) > 1e-9) line.push({ ...p });
  });
  const N = line.length;
  if (N < 3) return [];
  // 閉じた形（外側の線 ＋ 指の側の線）の辺
  const poly = [...line, line[0]];
  let area = 0;
  for (let i = 0; i + 1 < poly.length; i++) area += poly[i].x * poly[i + 1].y - poly[i + 1].x * poly[i].y;
  const ccw = area > 0 ? 1 : -1;
  // 線に沿った長さ
  const L = [0];
  for (let i = 1; i < N; i++) L.push(L[i - 1] + dist(line[i], line[i - 1]));
  // ある長さだけ前後に離れた点の番号
  const back = (i: number, s: number) => {
    let j = i;
    while (j > 0 && L[i] - L[j] < s) j--;
    return j;
  };
  const fwd = (i: number, s: number) => {
    let j = i;
    while (j < N - 1 && L[j] - L[i] < s) j++;
    return j;
  };

  // 1. 局所の厚み：直径 minLocalMm の円（半径 r）が、形の中に入れる所を探す。
  //    外側の線の各点で、線に接して内側に置いた円が、はみ出さずに入るか。入る円の、どれにも届かない所が「薄い所」。
  //    円の届かない深さ（いちばん近い入る円の縁からの距離）が r より大きければ、薄いヒレやとがった先
  //    （90° の角の届かない深さは r ×（√2 − 1）なので、ふつうの角は数えない。60° の先でちょうど r）
  const r = lim.minLocalMm / 2;
  const edgeDist = (c: P2): number => {
    let best = Infinity;
    for (let k = 0; k + 1 < poly.length; k++) {
      const a = poly[k];
      const b = poly[k + 1];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const l2 = ex * ex + ey * ey || 1e-18;
      const t = Math.min(1, Math.max(0, ((c.x - a.x) * ex + (c.y - a.y) * ey) / l2));
      best = Math.min(best, Math.hypot(a.x + ex * t - c.x, a.y + ey * t - c.y));
    }
    return best;
  };
  const inside = (c: P2): boolean => {
    let w = false;
    for (let k = 0; k + 1 < poly.length; k++) {
      const a = poly[k];
      const b = poly[k + 1];
      if (a.y > c.y !== b.y > c.y && c.x < a.x + ((c.y - a.y) * (b.x - a.x)) / (b.y - a.y)) w = !w;
    }
    return w;
  };
  // 円の真ん中の候補：外側の線の各点から内側へ r。指の側の平らな線の上からも
  const cands: P2[] = [];
  line.forEach((p, i) => {
    if (i === 0 || i === N - 1) return;
    const a = line[i - 1];
    const b = line[i + 1];
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const tl = Math.hypot(tx, ty);
    if (tl < 1e-12) return;
    // 反時計回りの形では、内側は進む向きの左
    cands.push({ x: p.x + ((-ty / tl) * ccw) * r, y: p.y + ((tx / tl) * ccw) * r });
  });
  const x0 = line[N - 1].x;
  const x1 = line[0].x;
  const nf = Math.max(2, Math.ceil(Math.abs(x1 - x0) / step));
  for (let k = 0; k <= nf; k++) cands.push({ x: x0 + ((x1 - x0) * k) / nf, y: line[0].y + (line[N - 1].y - line[0].y) * (1 - k / nf) + r * ccw });
  const fit = cands.filter((c) => inside(c) && edgeDist(c) >= r * 0.98);
  /** 円の届かない深さ */
  const depth = line.map((p) => {
    let best = Infinity;
    for (const c of fit) best = Math.min(best, dist(p, c) - r);
    return Math.max(0, best);
  });
  /** その所の厚み（いちばん近い入る円まで足りない分を、円の直径から引いた見積もり）。知らせるときの数に使う */
  const thick = line.map((p, i) => {
    if (i === 0 || i === N - 1) return Infinity;
    // 内側へ直角に進んで、反対側に当たるまでの長さ
    const a = line[i - 1];
    const b = line[i + 1];
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const tl = Math.hypot(tx, ty);
    if (tl < 1e-12) return 0;
    const d = { x: (-ty / tl) * ccw, y: (tx / tl) * ccw };
    let best = Infinity;
    for (let k = 0; k + 1 < poly.length; k++) {
      if (k === i || k === i - 1) continue;
      best = Math.min(best, rayHit(p, d, poly[k], poly[k + 1]));
    }
    return best;
  });

  // 2. 先の角度（金属の側）。向きを測る長さは minLocalMm の半分（細かいふるえは拾わない）
  const scale = lim.minLocalMm / 2;
  const angle = line.map((p, i) => {
    if (i === 0 || i === N - 1) {
      // 端：外側の線と、指の側の線のなす角度
      const q = line[i === 0 ? fwd(0, scale) : back(N - 1, scale)];
      const f = line[i === 0 ? N - 1 : 0];
      const v1 = { x: q.x - p.x, y: q.y - p.y };
      const v2 = { x: f.x - p.x, y: f.y - p.y };
      const c = (v1.x * v2.x + v1.y * v2.y) / ((Math.hypot(v1.x, v1.y) || 1) * (Math.hypot(v2.x, v2.y) || 1));
      return (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI;
    }
    const a = line[back(i, scale)];
    const b = line[fwd(i, scale)];
    const v1 = { x: a.x - p.x, y: a.y - p.y };
    const v2 = { x: b.x - p.x, y: b.y - p.y };
    const c = (v1.x * v2.x + v1.y * v2.y) / ((Math.hypot(v1.x, v1.y) || 1) * (Math.hypot(v2.x, v2.y) || 1));
    const open = (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI;
    // 外へ出っぱる所（反時計回りで左に曲がる所）だけ。へこむ所の角度は金属の側では 360 − open
    const cross = (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x);
    return cross * ccw > 0 ? open : 360 - open;
  });

  const out: ThinSpot[] = [];
  // 3. 円の届かない深さが r より大きい所が続く区間（ヒレ・ナイフのような縁・とがった先）
  const thin = (k: number) => depth[k] > r + 1e-9;
  let i = 0;
  while (i < N) {
    if (!thin(i)) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < N && thin(j + 1)) j++;
    const run = line.slice(i, j + 1);
    // 知らせる所：いちばん深い所（先）。厚みは、その区間でいちばん薄い所
    let k = i;
    for (let m = i; m <= j; m++) if (depth[m] > depth[k]) k = m;
    let t = Infinity;
    for (let m = i; m <= j; m++) t = Math.min(t, thick[m]);
    if (!Number.isFinite(t)) t = 2 * r;
    let sharp = 180;
    for (let m = i; m <= j; m++) sharp = Math.min(sharp, angle[m]);
    out.push({ kind: sharp < lim.minTipAngleDeg ? "tip" : "fin", at: { ...line[k] }, run, thicknessMm: Math.min(t, 2 * r), angleDeg: sharp });
    i = j + 1;
  }
  // 4. とがった先（局所でいちばん鋭い所）
  for (let k = 0; k < N; k++) {
    if (!(angle[k] < lim.minTipAngleDeg)) continue;
    const a = back(k, scale);
    const b = fwd(k, scale);
    let isMin = true;
    for (let m = a; m <= b; m++) if (angle[m] < angle[k] || (angle[m] === angle[k] && m < k)) isMin = false;
    if (!isMin) continue;
    // もう知らせた薄い所の中なら、そこに角度を書く
    const inRun = out.find((s) => s.run.some((q) => dist(q, line[k]) < 1e-9));
    if (inRun) {
      inRun.angleDeg = Math.min(inRun.angleDeg, angle[k]);
      inRun.kind = "tip";
      inRun.at = { ...line[k] };
      continue;
    }
    // 先から minLocalMm 入った所の厚み（先の両側の点の間）
    const t = dist(line[back(k, lim.minLocalMm)], line[fwd(k, lim.minLocalMm)]);
    out.push({ kind: "tip", at: { ...line[k] }, run: line.slice(back(k, scale), fwd(k, scale) + 1), thicknessMm: t, angleDeg: angle[k] });
  }
  return out;
}
