// ザグり：石の下側（パビリオン）が腕の上に入りこむ所を、腕の上から削って石の逃げを作る（職人が腕の上をヤスリでザグるのと同じ）。
// 画面に依存しない純粋な関数。座標は指輪の座標（ring.ts・shank.ts と同じ。mm、z が上）。
//
// 考え方：石の下の面を「縁の形を重心へ縮めた輪を、高さごとに積んだ形」（stone.ts の stoneScaleAt と同じ縮み）で表す。
// ある所 (x, y) の真上にある石のいちばん低い z が「石の床」。腕の外側の点がこの床 − すき間より上にあれば、点をまっすぐ下げる。
// 三角形の中の点も石に入らないよう、床は点のまわりの円（隣の点までの距離 ＋ すき間）の中のいちばん低い所で取る。
import { convexHull, toCounterClockwise } from "./polygon";
import { PAVILION_MID, stoneKnots, stoneRings, type StoneHeights, type StoneParams } from "./stone";
import type { RingTransform } from "./ring";

/** ザグりに使う石の下の面（指輪の座標） */
export interface SeatCut {
  /** 石と腕の間に残すすき間（mm） */
  clearanceMm: number;
  /** 石の一番下（キューレット）の z（指輪の座標） */
  culetZ: number;
  /** 上から見た石の広がり（指輪の座標。これより外の点は削らない） */
  box: { xMin: number; xMax: number; yMin: number; yMax: number };
  /**
   * (x, y) を中心に半径 radiusMm の円の中で、石の下の面のいちばん低い z から、すき間を引いた値。
   * 円の中に石がなければ +Infinity
   */
  floorZ(x: number, y: number, radiusMm: number): number;
}

/** 円のまわりを何点で調べるか（形を作るための決まり。多いほど正確、少ないほど速い） */
const RIM_SAMPLES = 32;

/**
 * 石の下の面を作る。stone・heights は石の座標、transform で指輪の座標へ置く。
 * 縁の形が凸でなくても、縁を包む凸の形で測るので、石の下の面より低め（削りが深め）になる。
 * 石の 3D（buildStone）の面は、この面の上か、この面より上にある（下の段の輪は角ごとの点を直線で結ぶため）
 */
export function stoneSeatCut(stone: StoneParams, heights: StoneHeights, transform: RingTransform, clearanceMm: number): SeatCut {
  const { girdle, center } = stoneRings(stone);
  const k = stoneKnots(heights);
  // 縁を包む凸の形（反時計回り）の各辺の外向きの向きと、重心からその辺までの距離。
  // σ（縮みの割合：縁 ＝ 1）＝ 各辺について（外向き・点）÷ 距離 のいちばん大きい値。凸で包むので、石の下の面より低め（削りが深め）になる
  const hull = toCounterClockwise(convexHull(girdle));
  const edges: { nx: number; ny: number; d: number }[] = [];
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    const nx = (b.y - a.y) / len;
    const ny = -(b.x - a.x) / len;
    const d = nx * (a.x - center.x) + ny * (a.y - center.y);
    if (d > 1e-9) edges.push({ nx, ny, d });
  }
  const sigma = (sx: number, sy: number) => {
    const px = sx - center.x;
    const py = sy - center.y;
    let s = 0;
    for (const e of edges) s = Math.max(s, (e.nx * px + e.ny * py) / e.d);
    return s;
  };
  // 縮み σ（縁 ＝ 1、キューレット ＝ 0）での石の下の面の z（石の座標）。stoneScaleAt の下側を逆に読む
  const pavMidScale = PAVILION_MID.scale;
  const zAtSigma = (s: number): number => {
    if (s > 1 + 1e-9) return Infinity;
    if (s <= pavMidScale) return k.culet + ((k.pavilionMid - k.culet) * s) / pavMidScale;
    return k.pavilionMid + ((k.girdleBottom - k.pavilionMid) * (s - pavMidScale)) / (1 - pavMidScale);
  };
  const c = Math.cos(transform.rotationZ);
  const s = Math.sin(transform.rotationZ);
  // 指輪の座標 → 石の座標（回転を戻す）
  const zAt = (x: number, y: number) => zAtSigma(sigma(x * c + y * s, -x * s + y * c)) + transform.translateZ;
  const culetX = center.x * c - center.y * s;
  const culetY = center.x * s + center.y * c;
  const culetZ = k.culet + transform.translateZ;
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const g of girdle) {
    const x = g.x * c - g.y * s;
    const y = g.x * s + g.y * c;
    xMin = Math.min(xMin, x);
    xMax = Math.max(xMax, x);
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
  }
  return {
    clearanceMm,
    culetZ,
    box: { xMin, xMax, yMin, yMax },
    floorZ(x, y, r) {
      // 石の下の面は下へ凸（キューレットがいちばん低い）。キューレットが円の中なら、そこがいちばん低い
      if (Math.hypot(x - culetX, y - culetY) <= r) return culetZ - clearanceMm;
      let z = zAt(x, y);
      for (let i = 0; i < RIM_SAMPLES; i++) {
        const a = (i / RIM_SAMPLES) * Math.PI * 2;
        z = Math.min(z, zAt(x + r * Math.cos(a), y + r * Math.sin(a)));
      }
      return z - clearanceMm;
    },
  };
}
