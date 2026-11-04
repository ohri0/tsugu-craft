// ザグり：石の下側（パビリオン）が腕の上に入りこむ所を、腕の上から削って石の逃げを作る。
// 画面に依存しない純粋な関数。座標は指輪の座標（ring.ts・shank.ts と同じ。mm、z が上）。
//
// 考え方：石の下の面を「縁の形を重心へ縮めた輪を、高さごとに積んだ形」（stone.ts の stoneScaleAt と同じ縮み）で表す。
// 削り方は、職人が先の丸いビット（球のビット）を石の先の真下にまっすぐ下ろして削るのと同じ（2026-11-04 作者の頼み）。
// くぼみの底は「石の先 − すき間」、球の大きさは、石がどこでも腕に当たらない、いちばん小さいもの（ballCut）。
import { convexHull, toCounterClockwise } from "./polygon";
import { PAVILION_MID, stoneKnots, stoneRings, type StoneHeights, type StoneParams } from "./stone";
import type { RingTransform } from "./ring";

/** ザグりに使う石の下の面（指輪の座標） */
export interface SeatCut {
  /** 石と腕の間に残すすき間（mm） */
  clearanceMm: number;
  /** 石の一番下（キューレット）の z（指輪の座標） */
  culetZ: number;
  /** 石の一番下（キューレット）の x・y（指輪の座標。球のビットの真ん中はこの真下） */
  culetX: number;
  culetY: number;
  /** 上から見た石の広がり（指輪の座標。これより外の点は削らない） */
  box: { xMin: number; xMax: number; yMin: number; yMax: number };
  /**
   * (x, y) を中心に半径 radiusMm の円の中で、石の下の面のいちばん低い z から、すき間を引いた値。
   * 円の中に石がなければ +Infinity
   */
  floorZ(x: number, y: number, radiusMm: number): number;
  /** (x, y) の真上の、石の下の面の z から、すき間を引いた値（円は取らない。石がなければ +Infinity） */
  floorAt(x: number, y: number): number;
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
    culetX,
    culetY,
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
    floorAt(x, y) {
      return zAt(x, y) - clearanceMm;
    },
  };
}

/**
 * 球のビットのザグりの決まり（形を作るための決まり。職人の目安の数ではない）。
 * stepMm：削る所のまわりの腕の三角形の辺の長さ（指を離したとき）。dragStepMm：断面を動かしている間（粗く、速く）。
 * easeMm：ザグりの縁を、ほんの少しだけ丸める幅（縁が刃のように立たないように。**仮**：作者が見て直す）。
 * marginMm：球と石の間に、すき間のほかに残す小さなゆとり（三角形の面が球からわずかに浮く分）
 */
export const BALL_CUT = { stepMm: 0.06, dragStepMm: 0.12, easeMm: 0.15, marginMm: 0.002 };

/** 球のビットのザグり：石の先の真下に、まっすぐ下ろした球（先が丸いビット）で削った丸いくぼみ */
export interface BallCut {
  /** 球の真ん中の x・y（石の先の真下） */
  cx: number;
  cy: number;
  /** くぼみのいちばん底の z ＝ 石の先 − すき間 */
  bottomZ: number;
  /** 球の半径（mm） */
  radiusMm: number;
  /** 上から見て、削る所がこの半径の円の中に入る（mm。縁の丸めもふくむ） */
  reachMm: number;
  /** 腕の外側の点 (x, y, z) を削ったあとの z（削らない所は z のまま） */
  carve(x: number, y: number, z: number): number;
}

/**
 * 石の先の真下に、いちばん小さい球のビットを決める。くぼみの底は「石の先 − すき間」（深さ ＝ 入りこむ深さ ＋ すき間）。
 * 球は、石の下の面（すき間を引いた面）が腕の上の面より下に来る所を、ぜんぶ球の中に入れる大きさ。
 * topZ(x, y)：削る前の腕の上の面の z（腕がない所は −Infinity）。outerTop：腕の外側のいちばん上の z。
 * 削る所がなければ null
 */
export function ballCut(cut: SeatCut, topZ: (x: number, y: number) => number, outerTop: number): BallCut | null {
  const cx = cut.culetX;
  const cy = cut.culetY;
  const bottomZ = cut.culetZ - cut.clearanceMm;
  if (!(topZ(cx, cy) > bottomZ)) return null;
  // 石の先から外へ、輪ごとに調べる。石の下の面が腕の上の面より下にある所ごとに、そこを球の中に入れる半径を求め、いちばん大きいものを取る。
  // 底から高さ g・横へ ρ の所を通る球の半径 ＝ (ρ² ＋ g²) ÷ (2g)。g が ρ より大きければ、球の横の壁の内側なので、半径は ρ より大きければよい
  const step = 0.03;
  const around = 72;
  let radius = 0;
  let touched = false;
  for (let i = 1; i <= 400; i++) {
    const rho = i * step;
    let touching = false;
    for (let a = 0; a < around; a++) {
      const th = (a / around) * Math.PI * 2;
      const x = cx + rho * Math.cos(th);
      const y = cy + rho * Math.sin(th);
      // 腕の上の面は outerTop より高くないので、石がそれより上なら腕の面を調べない（速くするため）
      const f = cut.floorAt(x, y);
      if (f >= outerTop || f >= topZ(x, y)) continue;
      touching = true;
      const g = Math.max(1e-6, f - bottomZ - BALL_CUT.marginMm * Math.min(1, rho / 0.1));
      radius = Math.max(radius, g > rho ? rho + 1e-6 : (rho * rho + g * g) / (2 * g));
    }
    if (!touching) break;
    touched = true;
  }
  if (!touched) return null;
  // 球の半径は、くぼみの深さより小さくしない（小さいと、球の上の筒の壁がまっすぐ立つ）
  radius = Math.max(radius, outerTop - bottomZ);
  const k = BALL_CUT.easeMm;
  const rise = Math.min(radius, outerTop + k - bottomZ);
  const reachMm = Math.sqrt(Math.max(0, radius * radius - (radius - rise) * (radius - rise)));
  const bowl = (x: number, y: number) => {
    const rho2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
    return rho2 < radius * radius ? bottomZ + radius - Math.sqrt(radius * radius - rho2) : Infinity;
  };
  return {
    cx,
    cy,
    bottomZ,
    radiusMm: radius,
    reachMm,
    carve(x, y, z) {
      const b = bowl(x, y);
      // なめらかな小さい方（縁だけ、幅 k で丸める。どちらよりも少し低い＝石からは遠い側）
      const h = Math.max(k - Math.abs(z - b), 0) / k;
      return Math.min(z, b) - (h * h * k) / 4;
    },
  };
}
