// 自分で引く寸法（作者の声 2026-11-06：ここからここみたいな寸法を知りたいときに、自分で線を引けると優しい）。
// 2 点の距離・吸いつく点の選び方・寸法の線の形。画面に依存しない。形は変えない（画面の表示だけ）。
import type { RingDesign } from "../geometry/ring";
import type { Dim, Project, V3 } from "./dims";

/** 引いた寸法 1 本。a・b は 3D の点（mm、画面の 3D と同じ座標） */
export interface Measure {
  id: number;
  a: V3;
  b: V3;
  /** 正面・横・上で引いたときの、見る向きと名前（その面に沿った距離を出す）。斜めで引いたらなし（実の距離） */
  plane?: { dir: V3; name: string };
  /** 吸いついた点の名前（爪の先など。なければ面の点） */
  nameA?: string;
  nameB?: string;
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** b を、a を通って見る向きに直角な面へ下ろした点（見る向きがなければ b のまま） */
export function planeEnd(a: V3, b: V3, dir?: V3): V3 {
  if (!dir) return b;
  const L = Math.hypot(...dir) || 1;
  const n: V3 = [dir[0] / L, dir[1] / L, dir[2] / L];
  const d = dot(sub(b, a), n);
  return [b[0] - n[0] * d, b[1] - n[1] * d, b[2] - n[2] * d];
}

/** 2 点の距離（mm）。見る向きがあれば、その面に沿った距離 */
export function measureMm(a: V3, b: V3, dir?: V3): number {
  return Math.hypot(...sub(planeEnd(a, b, dir), a));
}

/** 札の字：12.34 mm（正面）・12.34 mm（実の距離） */
export function measureLabel(m: Pick<Measure, "a" | "b" | "plane">): string {
  return `${measureMm(m.a, m.b, m.plane?.dir).toFixed(2)} mm（${m.plane ? m.plane.name : "実の距離"}）`;
}

/** 寸法の線（dims の形）。正面・横・上で引いた線は、その面に沿って描く */
export function measureDim(m: Measure): Dim {
  return { key: `m${m.id}`, a: m.a, b: planeEnd(m.a, m.b, m.plane?.dir), label: measureLabel(m) };
}

/** 吸いつく先の候補 */
export interface SnapPoint {
  p: V3;
  /** feature：名前のある点や形の端（爪の先・石の先・形のいちばん外など）。vertex：三角形の角。mid：三角形の辺の中点。surface：面の上の点 */
  kind: "feature" | "vertex" | "mid" | "surface";
  name?: string;
}

/** 三角形の頂点と辺の中点を、候補にする */
export function triangleSnaps(t: readonly [V3, V3, V3]): SnapPoint[] {
  const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  return [
    ...t.map((p): SnapPoint => ({ p, kind: "vertex" })),
    { p: mid(t[0], t[1]), kind: "mid" },
    { p: mid(t[1], t[2]), kind: "mid" },
    { p: mid(t[2], t[0]), kind: "mid" },
  ];
}

/**
 * 候補から、吸いつく点を選ぶ。画面の点 cur から radius px の中で、形の端や名前のある点を先に、なければ頂点と辺の中点の近い方。
 * どれも遠ければ、面の上の点（なければ null：何もない所を押した）
 */
export function pickSnap(cands: readonly SnapPoint[], cur: { x: number; y: number }, project: Project, radius: number): SnapPoint | null {
  let best: SnapPoint | null = null;
  let bestD = Infinity;
  let bestRank = Infinity;
  let surface: SnapPoint | null = null;
  let surfaceD = Infinity;
  for (const c of cands) {
    const q = project(c.p[0], c.p[1], c.p[2]);
    if (!q) continue;
    const d = Math.hypot(q.x - cur.x, q.y - cur.y);
    if (c.kind === "surface") {
      if (d < surfaceD) [surface, surfaceD] = [c, d];
      continue;
    }
    if (d > radius) continue;
    const rank = c.kind === "feature" ? 0 : 1;
    if (rank < bestRank || (rank === bestRank && d < bestD)) [best, bestD, bestRank] = [c, d, rank];
  }
  return best ?? surface;
}

/** 形のいちばん外の点（x・y・z の小さい方と大きい方の 6 点）。positions は 3 つずつの並び、z に lift を足す */
export function extremePoints(positions: ArrayLike<number>, lift = 0): V3[] {
  const n = positions.length;
  if (n < 3) return [];
  const idx = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < n; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k];
      if (v < positions[idx[k * 2] + k]) idx[k * 2] = i;
      if (v > positions[idx[k * 2 + 1] + k]) idx[k * 2 + 1] = i;
    }
  }
  const out: V3[] = [];
  const seen = new Set<number>();
  for (const i of idx) {
    if (seen.has(i)) continue;
    seen.add(i);
    out.push([positions[i], positions[i + 1], positions[i + 2] + lift]);
  }
  return out;
}

/** 三角形の範囲（start・count は三角形の番号）の中で、いちばん高い点（爪の先など） */
export function highestPoint(positions: ArrayLike<number>, start: number, count: number, lift = 0): V3 | null {
  let best = -1;
  let top = -Infinity;
  for (let i = start * 9; i < (start + count) * 9; i += 3) {
    if (positions[i + 2] > top) [top, best] = [positions[i + 2], i];
  }
  return best < 0 ? null : [positions[best], positions[best + 1], positions[best + 2] + lift];
}

/** 指輪の名前のある点（爪の先・石の先・石の上面・指のまわり）。座標は画面の 3D と同じ（腕のいちばん下が z ＝ 0） */
export function ringFeatures(ring: RingDesign): SnapPoint[] {
  const lift = ring.shank.outerRadiusMm;
  const ri = ring.shank.innerDiameterMm / 2;
  const out: SnapPoint[] = [];
  const named = (p: V3 | null | undefined, name: string) => {
    if (p) out.push({ p, kind: "feature", name });
  };
  const sp = ring.ringPositions.setting;
  const stones = ring.stones?.length ? ring.stones : [{ setting: ring.setting, ranges: { setting: { start: 0, count: sp.length / 9 } } }];
  for (const st of stones) {
    for (const pr of st.setting.prongs) named(highestPoint(sp, st.ranges.setting.start + pr.triangles.start, pr.triangles.count, lift), "爪の先");
  }
  const stone = ring.ringPositions.stone;
  if (stone.length) {
    let lo = 2;
    let hi = 2;
    for (let i = 2; i < stone.length; i += 3) {
      if (stone[i] < stone[lo]) lo = i;
      if (stone[i] > stone[hi]) hi = i;
    }
    named([stone[lo - 2], stone[lo - 1], stone[lo] + lift], "石の先");
    named([stone[hi - 2], stone[hi - 1], stone[hi] + lift], "石の上面");
  }
  // 指のまわり：内側のいちばん上・下・横
  named([0, 0, lift + ri], "指の上");
  named([0, 0, lift - ri], "腕の内側（下）");
  named([0, -ri, lift], "腕の内側（横）");
  named([0, ri, lift], "腕の内側（横）");
  named([0, 0, 0], "腕の外側（下）");
  return out;
}

/** 引いた寸法の並びの世話：足す・選ぶ・消す。形が変わったら、全部消して何本消えたかを返す */
export class MeasureList {
  items: Measure[] = [];
  selected: number | null = null;
  /** 今の寸法を測った形の印（形の設計の写しなど）。違う形になったら古い数字なので残さない */
  private key: string | null = null;
  private nextId = 1;

  add(a: V3, b: V3, plane: Measure["plane"], shapeKey: string, names: { a?: string; b?: string } = {}): Measure {
    const m: Measure = { id: this.nextId++, a, b, ...(plane ? { plane } : {}), ...(names.a ? { nameA: names.a } : {}), ...(names.b ? { nameB: names.b } : {}) };
    this.items.push(m);
    this.key = shapeKey;
    this.selected = m.id;
    return m;
  }
  remove(id: number): void {
    this.items = this.items.filter((m) => m.id !== id);
    if (this.selected === id) this.selected = null;
  }
  clear(): number {
    const n = this.items.length;
    this.items = [];
    this.selected = null;
    this.key = null;
    return n;
  }
  /** 形が変わっていたら全部消して、消した本数を返す（なければ 0） */
  syncShape(shapeKey: string): number {
    if (!this.items.length || this.key === null || this.key === shapeKey) return 0;
    return this.clear();
  }
}
