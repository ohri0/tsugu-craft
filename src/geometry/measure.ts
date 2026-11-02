// 写真の輪郭（px）を、長辺 1 つの実寸で mm に直す。
import { centroid, extent, toCounterClockwise, transform, type Point } from "./polygon";

export interface StoneOutline {
  /** 縁の形（mm）。重心が原点、長辺が x 軸、y は上向き、反時計回り */
  outlineMm: Point[];
  longMm: number;
  widthMm: number;
  /** 写真の比率から出した幅（測った幅で上書きする前） */
  widthFromPhotoMm: number;
  /** 幅を写真から出したか（false なら測った値で上書き） */
  widthFromPhoto: boolean;
  /** 1 px あたりの mm */
  mmPerPx: number;
  /** 写真の上での長辺の向き（ラジアン、画像座標） */
  imageAngle: number;
}

export interface MeasureInput {
  /** 写真の輪郭（px、画像の座標：y は下向き） */
  outlinePx: readonly Point[];
  /** ノギスで測った長辺（mm） */
  longMm: number;
  /** 測った幅（mm）。なければ写真から */
  widthMm?: number;
}

export function measureOutline({ outlinePx, longMm, widthMm }: MeasureInput): StoneOutline {
  const e = extent(outlinePx);
  const mmPerPx = longMm / e.long;
  const c = centroid(outlinePx);
  // 画像座標（y 下向き）→ 重心を原点に → 長辺を x 軸に → y を上向きに
  const aligned = transform(
    outlinePx.map((p) => ({ x: p.x - c.x, y: p.y - c.y })),
    -e.angle,
  ).map((p) => ({ x: p.x * mmPerPx, y: -p.y * mmPerPx }));
  const widthFromPhotoMm = e.width * mmPerPx;
  const sy = widthMm && widthMm > 0 ? widthMm / widthFromPhotoMm : 1;
  const outlineMm = toCounterClockwise(aligned.map((p) => ({ x: p.x, y: p.y * sy })));
  return {
    outlineMm,
    longMm,
    widthMm: widthFromPhotoMm * sy,
    widthFromPhotoMm,
    widthFromPhoto: sy === 1,
    mmPerPx,
    imageAngle: e.angle,
  };
}
