// 石の 3D：縁の形 ＋ 深さ。面（ファセット）は標準的なカット風に自動で付けるだけ（本物の面とは同じにしない）。
// 座標は mm。x が長辺、y が幅、z が上（テーブル側）。z = 0 が縁（ガードル）の真ん中。
import { GUIDES, stoneSizeMm } from "../rules/guides";
import { centroid, resample, toCounterClockwise, type Point } from "./polygon";

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

/** 縁の点の数（4 の倍数にする） */
const GIRDLE_POINTS = 64;

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
  return centroid(resample(toCounterClockwise(outlineMm), GIRDLE_POINTS));
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

export function buildStone(p: StoneParams): StoneMesh {
  const h = stoneHeights(p);
  const girdle = resample(toCounterClockwise(p.outlineMm), GIRDLE_POINTS);
  const c = centroid(girdle);
  const k = stoneKnots(h);
  const ring = (scale: number, z: number, step: number): V3[] => {
    const out: V3[] = [];
    for (let i = 0; i < girdle.length; i += step) {
      const g = girdle[i];
      out.push([c.x + (g.x - c.x) * scale, c.y + (g.y - c.y) * scale, z]);
    }
    return out;
  };
  const gTop = h.girdleMm / 2;
  const tris: V3[][] = [];
  const girdleTop = ring(1, gTop, 1);
  const girdleBottom = ring(1, -gTop, 1);
  const crownMid = ring(CROWN_MID.scale, k.crownMid, 2);
  const table = ring(TABLE_SCALE, k.table, 4);
  const pavMid = ring(PAVILION_MID.scale, k.pavilionMid, 4);
  const culet: V3 = [c.x, c.y, h.culetZ];
  const tableCenter: V3 = [c.x, c.y, h.tableZ];

  // 縁の帯（外向き）
  for (let i = 0; i < girdleTop.length; i++) {
    const j = (i + 1) % girdleTop.length;
    tris.push([girdleBottom[i], girdleBottom[j], girdleTop[j]], [girdleBottom[i], girdleTop[j], girdleTop[i]]);
  }
  loft(tris, girdleTop, crownMid, true);
  loft(tris, crownMid, table, true);
  for (let i = 0; i < table.length; i++) tris.push([tableCenter, table[i], table[(i + 1) % table.length]]);
  loft(tris, girdleBottom, pavMid, false);
  for (let i = 0; i < pavMid.length; i++) tris.push([culet, pavMid[(i + 1) % pavMid.length], pavMid[i]]);

  const positions = new Float32Array(tris.length * 9);
  tris.forEach((t, k) => t.forEach((v, m) => positions.set(v, k * 9 + m * 3)));
  return { positions, heights: h };
}

type V3 = [number, number, number];

/**
 * 点の多い輪 a と、少ない輪 b（a の点の数は b の倍数）を三角形でつなぐ。
 * up = true なら上向きの面（外から見て反時計回り）、false なら下向き。
 */
function loft(tris: V3[][], a: V3[], b: V3[], up: boolean) {
  const k = a.length / b.length;
  const push = (t: V3[]) => tris.push(up ? t : [t[0], t[2], t[1]]);
  for (let j = 0; j < b.length; j++) {
    const b0 = b[j];
    const b1 = b[(j + 1) % b.length];
    for (let i = 0; i < k; i++) {
      push([a[j * k + i], a[(j * k + i + 1) % a.length], b0]);
    }
    push([a[((j + 1) * k) % a.length], b1, b0]);
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
