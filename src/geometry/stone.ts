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
  const crownMid = ring(0.8, gTop + h.crownMm * 0.45, 2);
  const table = ring(0.55, h.tableZ, 4);
  const pavMid = ring(0.45, -gTop - h.pavilionMm * 0.6, 4);
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
