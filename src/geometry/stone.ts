// 石の 3D：縁の形 ＋ 深さ。面（ファセット）は標準的なカット風に自動で付けるだけ（本物の面とは同じにしない）。
// 座標は mm。x が長辺、y が幅、z が上（テーブル側）。z = 0 が縁（ガードル）の真ん中。
import { GUIDES, stoneSizeMm } from "../rules/guides";
import { findCorners } from "./corners";
import { boxExtent, centroid, perimeter, resample, toCounterClockwise, type Point } from "./polygon";

export interface StoneParams {
  /** 縁の形（mm、反時計回り） */
  outlineMm: readonly Point[];
  longMm: number;
  widthMm: number;
  /** 深さ（ノギス） */
  depthMm: number;
  /** 上側 ÷（上側＋下側）。横からの写真がなければ目安の 3:7 */
  crownRatio?: number;
}

export interface StoneHeights {
  girdleMm: number;
  crownMm: number;
  pavilionMm: number;
  /** 上面（テーブル）の z */
  tableZ: number;
  /** 一番下（キューレット）の z */
  culetZ: number;
}

export interface StoneMesh {
  /** 三角形ごとに 3 頂点 × xyz（面ごとに平らに見せるため、頂点は共有しない） */
  positions: Float32Array;
  heights: StoneHeights;
}

/** 縁の点の数のめやす（区切りごとに 4 の倍数にそろえるので、少し増減する） */
const GIRDLE_POINTS = 64;
/** 縁の目印（尖った角）を探す前に、縁を細かく取り直す点の数 */
const FINE_POINTS = 720;
/** 尖った角がこれより多い形は、角をそろえず、丸い石と同じに扱う */
const MAX_ANCHORS = 8;
/**
 * テーブルの角 1 つあたりの縁の点の数（前と同じ 4。縁 64 点ならテーブルは 16 角）。形の決まりで、職人の目安ではない。
 * 縁は、角と角の間をこの数の倍数で区切るので、尖った先は必ずテーブルの角になる。
 * 8 にしてテーブルを 8 角にも試したが、エメラルドの角の面取りがテーブルに出なくなったのでやめた（docs/LOG.md）。
 */
const SECTION_UNIT = 4;

// 面を付けるための形の決まり（職人の目安ではない）。縁から上・下へ、どの高さで縁の形を何倍に縮めるか。
// 石座はこの形に沿わせるので、ここだけで決める。
/** 上側の途中の段：上側の高さの at の所で、縁の scale 倍 */
const CROWN_MID = { at: 0.45, scale: 0.8 };
/** 上面（テーブル）は縁の scale 倍 */
const TABLE_SCALE = 0.55;
/** 下側の途中の段：下側の高さの at の所で、縁の scale 倍 */
const PAVILION_MID = { at: 0.6, scale: 0.45 };

/** 石の面の段の高さ（z） */
export function stoneKnots(h: StoneHeights) {
  const gTop = h.girdleMm / 2;
  return {
    girdleTop: gTop,
    girdleBottom: -gTop,
    crownMid: gTop + h.crownMm * CROWN_MID.at,
    pavilionMid: -gTop - h.pavilionMm * PAVILION_MID.at,
    table: h.tableZ,
    culet: h.culetZ,
  };
}

/**
 * 高さ z での、石の外形の縮み（縁 ＝ 1）。重心を中心に縁の形をこの倍率に縮めると、その高さの石の外側になる。
 * テーブルより上は TABLE_SCALE、キューレットより下は 0。
 */
export function stoneScaleAt(h: StoneHeights, z: number): number {
  const k = stoneKnots(h);
  const lerp = (z0: number, s0: number, z1: number, s1: number) => (z1 === z0 ? s1 : s0 + ((s1 - s0) * (z - z0)) / (z1 - z0));
  if (z >= k.table) return TABLE_SCALE;
  if (z >= k.crownMid) return lerp(k.crownMid, CROWN_MID.scale, k.table, TABLE_SCALE);
  if (z >= k.girdleTop) return lerp(k.girdleTop, 1, k.crownMid, CROWN_MID.scale);
  if (z >= k.girdleBottom) return 1;
  if (z >= k.pavilionMid) return lerp(k.girdleBottom, 1, k.pavilionMid, PAVILION_MID.scale);
  if (z >= k.culet) return lerp(k.pavilionMid, PAVILION_MID.scale, k.culet, 0);
  return 0;
}

/** 石の 3D で使う縁の点と重心（石座も同じ中心で縮める） */
export function girdleCenter(outlineMm: readonly Point[]): Point {
  return centroid(facetGirdle(outlineMm));
}

/**
 * 面を付けるための縁の点（反時計回り）。
 * 尖った角（マーキス・ペアの先、三角・四角の角）が、上の段・テーブル・下の段の点に必ず乗るよう、
 * 角と角の間を、SECTION_UNIT の倍数の数で等しく区切る。角のない丸い石は、長い向き・短い向きの両端 4 か所で区切る。
 * 前は縁の始まりの点から等しく取っていたので、先が点の間に落ち、テーブルの先がねじれて矢じりのように見えた。
 */
export function facetGirdle(outlineMm: readonly Point[]): Point[] {
  const fine = resample(toCounterClockwise(outlineMm), FINE_POINTS);
  const n = fine.length;
  const c = centroid(fine);
  const anchors = findAnchors(fine, c);
  // 尖った先は、細かく取り直した点の間に落ちることがあるので、元の輪郭のいちばん近い点に置きかえる（先を丸めない）
  const src = toCounterClockwise(outlineMm);
  const step = perimeter(fine) / n;
  for (const a of anchors) {
    const near = src.reduce((b, q) => (Math.hypot(q.x - fine[a].x, q.y - fine[a].y) < Math.hypot(b.x - fine[a].x, b.y - fine[a].y) ? q : b));
    if (Math.hypot(near.x - fine[a].x, near.y - fine[a].y) < step) fine[a] = near;
  }
  // 角と角の間の周の長さ
  const cum: number[] = [0];
  for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + Math.hypot(fine[i % n].x - fine[i - 1].x, fine[i % n].y - fine[i - 1].y));
  const total = cum[n];
  const at = (s: number): Point => {
    // 周に沿って s だけ進んだ所の点（s は 0〜total の外でもよい）
    const u = ((s % total) + total) % total;
    let lo = 0;
    let hi = n;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (cum[m] <= u) lo = m;
      else hi = m;
    }
    const seg = cum[lo + 1] - cum[lo];
    const t = seg > 0 ? (u - cum[lo]) / seg : 0;
    const p = fine[lo];
    const q = fine[(lo + 1) % n];
    return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
  };
  const out: Point[] = [];
  for (let k = 0; k < anchors.length; k++) {
    const s0 = cum[anchors[k]];
    let s1 = cum[anchors[(k + 1) % anchors.length]];
    if (s1 <= s0) s1 += total;
    const count = Math.max(SECTION_UNIT, Math.round(((s1 - s0) / total) * (GIRDLE_POINTS / SECTION_UNIT)) * SECTION_UNIT);
    for (let i = 0; i < count; i++) out.push(at(s0 + ((s1 - s0) * i) / count));
  }
  return out;
}

/** 縁を区切る目印の点（fine の番号、昇順） */
function findAnchors(fine: Point[], c: Point): number[] {
  const n = fine.length;
  const corners = findCorners(fine);
  let idx: number[];
  if (corners.length > 0 && corners.length <= MAX_ANCHORS) {
    // 角の点は少し粗く取り直した所にあるので、近くで重心からいちばん遠い点（本当の先）に寄せる
    const win = Math.round(n * 0.02);
    idx = corners.map((cn) => {
      const i0 = Math.round(cn.t * n);
      let best = i0;
      let bd = -1;
      for (let d = -win; d <= win; d++) {
        const i = (i0 + d + n) % n;
        const dd = Math.hypot(fine[i].x - c.x, fine[i].y - c.y);
        if (dd > bd) {
          bd = dd;
          best = i;
        }
      }
      return best;
    });
  } else {
    // 角のない石：長い向きと短い向きの両端（重心から見て、その向きにいちばん遠い点）
    const { angle } = boxExtent(fine);
    idx = [0, 1, 2, 3].map((q) => {
      const ux = Math.cos(angle + (q * Math.PI) / 2);
      const uy = Math.sin(angle + (q * Math.PI) / 2);
      let best = 0;
      let bv = -Infinity;
      fine.forEach((p, i) => {
        const v = (p.x - c.x) * ux + (p.y - c.y) * uy;
        if (v > bv) {
          bv = v;
          best = i;
        }
      });
      return best;
    });
  }
  return [...new Set(idx)].sort((a, b) => a - b);
}

export function stoneHeights(p: StoneParams): StoneHeights {
  const [c, v] = GUIDES.stone.defaultCrownPavilion;
  const crownRatio = p.crownRatio ?? c / (c + v);
  const girdleMm = GUIDES.stone.girdleThicknessRatio * stoneSizeMm(p.longMm, p.widthMm);
  const body = Math.max(0, p.depthMm - girdleMm);
  const crownMm = body * crownRatio;
  const pavilionMm = body - crownMm;
  return { girdleMm, crownMm, pavilionMm, tableZ: girdleMm / 2 + crownMm, culetZ: -(girdleMm / 2 + pavilionMm) };
}

/** 上から見た面の段の輪（縁・上の段・テーブル・下の段）。どれも縁を重心に向かって縮めた形 */
export function stoneRings(p: StoneParams): { girdle: Point[]; crownMid: Point[]; table: Point[]; pavMid: Point[]; center: Point } {
  const girdle = facetGirdle(p.outlineMm);
  const c = centroid(girdle);
  const ring = (scale: number, step: number): Point[] =>
    girdle.filter((_, i) => i % step === 0).map((g) => ({ x: c.x + (g.x - c.x) * scale, y: c.y + (g.y - c.y) * scale }));
  // 上の段は縁と同じ細かさ（縁から上の段までは、縁に沿った細い帯）。テーブルと下の段は、区切りごとに 1 点
  return { girdle, crownMid: ring(CROWN_MID.scale, 1), table: ring(TABLE_SCALE, SECTION_UNIT), pavMid: ring(PAVILION_MID.scale, SECTION_UNIT), center: c };
}

export function buildStone(p: StoneParams): StoneMesh {
  const h = stoneHeights(p);
  const r = stoneRings(p);
  const c = r.center;
  const k = stoneKnots(h);
  const lift = (pts: Point[], z: number): V3[] => pts.map((q) => [q.x, q.y, z]);
  const gTop = h.girdleMm / 2;
  const tris: V3[][] = [];
  const girdleTop = lift(r.girdle, gTop);
  const girdleBottom = lift(r.girdle, -gTop);
  const crownMid = lift(r.crownMid, k.crownMid);
  const table = lift(r.table, k.table);
  const pavMid = lift(r.pavMid, k.pavilionMid);
  const culet: V3 = [c.x, c.y, h.culetZ];
  const tableCenter: V3 = [c.x, c.y, h.tableZ];

  // 縁の帯（外向き）
  for (let i = 0; i < girdleTop.length; i++) {
    const j = (i + 1) % girdleTop.length;
    tris.push([girdleBottom[i], girdleBottom[j], girdleTop[j]], [girdleBottom[i], girdleTop[j], girdleTop[i]]);
  }
  band(tris, girdleTop, crownMid);
  loft(tris, crownMid, table, true);
  for (let i = 0; i < table.length; i++) tris.push([tableCenter, table[i], table[(i + 1) % table.length]]);
  loft(tris, girdleBottom, pavMid, false);
  for (let i = 0; i < pavMid.length; i++) tris.push([culet, pavMid[(i + 1) % pavMid.length], pavMid[i]]);

  const positions = new Float32Array(tris.length * 9);
  tris.forEach((t, k) => t.forEach((v, m) => positions.set(v, k * 9 + m * 3)));
  return { positions, heights: h };
}

type V3 = [number, number, number];

/** 同じ点の数の 2 つの輪（外 a・内 b）を、上向きの四角の帯でつなぐ */
function band(tris: V3[][], a: V3[], b: V3[]) {
  for (let i = 0; i < a.length; i++) {
    const j = (i + 1) % a.length;
    tris.push([a[i], a[j], b[j]], [a[i], b[j], b[i]]);
  }
}

/**
 * 点の多い輪 a と、少ない輪 b（a の点の数は b の倍数）を三角形でつなぐ。
 * b の角と角の間（1 区切り）ごとに、前の半分は b の始めの角へ、後ろの半分は終わりの角へ扇形に結ぶ。
 * こうすると区切りの中の三角形はほぼ同じ向きになり、折れ目の線は「テーブルの角から縁へ」の線にだけ出る。
 * 前は区切り全部を始めの角へ結んでいたので、細い三角形があちこち折れ、線が途切れて見えた。
 * up = true なら上向きの面（外から見て反時計回り）、false なら下向き。
 */
function loft(tris: V3[][], a: V3[], b: V3[], up: boolean) {
  const k = a.length / b.length;
  const half = Math.floor(k / 2);
  const push = (t: V3[]) => tris.push(up ? t : [t[0], t[2], t[1]]);
  for (let j = 0; j < b.length; j++) {
    const b0 = b[j];
    const b1 = b[(j + 1) % b.length];
    for (let i = 0; i < k; i++) push([a[j * k + i], a[(j * k + i + 1) % a.length], i < half ? b0 : b1]);
    push([a[j * k + half], b1, b0]);
  }
}

/** 三角形の集まりの体積（向きがそろっていれば正）。テスト用 */
export function meshVolume(positions: Float32Array): number {
  let v = 0;
  for (let i = 0; i < positions.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.subarray(i, i + 9);
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}
