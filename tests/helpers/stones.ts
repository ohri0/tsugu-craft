// テスト用の石。合成の輪郭（px）を、長辺の実寸で mm に直して石の入力にする。
import { measureOutline } from "../../src/geometry/measure";
import type { Point } from "../../src/geometry/polygon";
import type { StoneParams } from "../../src/geometry/stone";
import { ellipse, regular, triangle } from "./synth";

export function stoneFrom(outlinePx: Point[], longMm: number, depthMm: number): StoneParams {
  const m = measureOutline({ outlinePx, longMm });
  return { outlineMm: m.outlineMm, longMm: m.longMm, widthMm: m.widthMm, depthMm };
}

/** 試作と同じ三角の石（長辺 8.88 mm・深さ 4.35 mm） */
export const triangleStone = () => stoneFrom(triangle(0, 0, 888, 752), 8.88, 4.35);
/** 四角（角 4 つ） */
export const squareStone = () => stoneFrom(regular(0, 0, 500, 4, 0.3), 7, 4.2);
/** 楕円（長辺 ÷ 幅 1.25、長辺 7 mm）：ふつうの 4 本爪 */
export const ovalStone = () => stoneFrom(ellipse(0, 0, 350, 280), 7, 4.2);
/** 細長い楕円（長辺 ÷ 幅 1.6） */
export const elongatedStone = () => stoneFrom(ellipse(0, 0, 400, 250), 8, 4.5);
/** 大きな丸（長辺 10 mm） */
export const largeRoundStone = () => stoneFrom(ellipse(0, 0, 500, 500), 10, 6);
