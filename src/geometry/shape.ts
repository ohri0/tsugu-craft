// 形の呼び名（読み取り表に出す、ふつうの言葉）
import { DETECTION } from "../rules/detection";
import type { Corner } from "./corners";
import { convexHull, extent, signedArea, type Point } from "./polygon";

export interface ShapeName {
  /** 画面に出す呼び名 */
  name: string;
  /** 根拠（読み取り表の「根拠」欄） */
  reason: string;
  /** へこみのある、いびつな形か */
  irregular: boolean;
}

/** 画面に出すときの石の名前。「ノンカリブレ」に、やさしい言いかえを添える（2026-11-08 作者） */
export function glossShapeName(name: string): string {
  return name.replace("（ノンカリブレ）", "（ノンカリブレ＝決まった寸法にそろえていない石）");
}

export function nameShape(outline: readonly Point[], corners: readonly Corner[], opts = DETECTION.shape): ShapeName {
  const e = extent(outline);
  const ratio = e.long / e.width;
  const solidity = Math.abs(signedArea(outline)) / Math.abs(signedArea(convexHull(outline)));
  const irregular = solidity < opts.solidityMin;
  const r = `長辺 ÷ 幅 ＝ ${ratio.toFixed(2)}、尖った角 ${corners.length} か所`;
  // 写真から読む石は、決まった寸法の石ではないので「（ノンカリブレ）」と添える（2026-11-05 作者）
  const byCorners: Record<number, string> = {
    1: "ペア（ノンカリブレ）",
    2: "マーキス（ノンカリブレ）",
    3: "トリリアント（ノンカリブレ）",
    4: "スクエア（ノンカリブレ）",
    5: "五角形",
    6: "六角形",
  };
  let name = byCorners[corners.length];
  if (!name) {
    if (corners.length > 6) name = "角の多い形";
    else if (ratio < opts.roundRatio) name = "ラウンド（ノンカリブレ）";
    else if (ratio < opts.elongatedRatio) name = "オーバル（ノンカリブレ）";
    else name = "細長い楕円";
  }
  if (irregular) name = `いびつな${name}`;
  return { name, reason: irregular ? `${r}、へこみあり（凸包に対し ${(solidity * 100).toFixed(0)}%）` : r, irregular };
}
