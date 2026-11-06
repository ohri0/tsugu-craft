import { describe, expect, it } from "vitest";
import { findToolLine, lineAngleSpread, lineAngleWobble, type ToolLine } from "../src/craft/tool-line";

/** 暗い地に、明るい帯（ヤスリ）を角度 deg で描いた w × h の明るさ。帯の真ん中は (cx, cy)（0〜1） */
function bar(w: number, h: number, deg: number, cx = 0.45, cy = 0.7, len = 0.5, width = 10, extra?: (x: number, y: number) => number): Uint8Array {
  const g = new Uint8Array(w * h).fill(20);
  const a = (deg * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = -Math.sin(a);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const px = x - cx * w;
      const py = y - cy * h;
      const along = px * ux + py * uy;
      const across = -px * uy + py * ux;
      if (Math.abs(along) <= (len * h) / 2 && Math.abs(across) <= width / 2) g[y * w + x] = 150;
      if (extra) g[y * w + x] = Math.max(g[y * w + x], extra(x, y));
    }
  return g;
}

const L = (deg: number): ToolLine => ({ angle: deg, x0: 0, y0: 1, x1: 1, y1: 0, support: 1 });

describe("ヤスリの線を、動画のこまから探す", () => {
  it("斜めの帯の角度を、1.5° 以内で当てる", () => {
    for (const deg of [35, 55, 70, 120]) {
      const l = findToolLine(bar(270, 480, deg), 270, 480)!;
      expect(l).not.toBeNull();
      expect(Math.abs(l.angle - deg)).toBeLessThan(1.5);
    }
  });

  it("線分は帯の上にのり、下の端から始まる", () => {
    const l = findToolLine(bar(270, 480, 60), 270, 480)!;
    expect(l.y0).toBeGreaterThan(l.y1);
    expect(Math.abs((l.x0 + l.x1) / 2 - 0.45)).toBeLessThan(0.06);
    expect(Math.abs((l.y0 + l.y1) / 2 - 0.7)).toBeLessThan(0.06);
  });

  it("縦の縁（台）は、ヤスリとして選ばない", () => {
    const g = bar(270, 480, 58, 0.45, 0.72, 0.4, 8, (x) => (x > 160 && x < 230 ? 120 : 0));
    const l = findToolLine(g, 270, 480)!;
    expect(Math.abs(l.angle - 58)).toBeLessThan(2);
  });

  it("何もないこまでは見つけない", () => {
    expect(findToolLine(new Uint8Array(270 * 480).fill(30), 270, 480)).toBeNull();
  });

  it("角度のぶれ：ゆっくり向きを変えるのは小さく、1 秒の中で行ったり来たりするのは大きく数える", () => {
    const drift = Array.from({ length: 100 }, (_, i) => L(50 + i * 0.1));
    const jumpy = Array.from({ length: 100 }, (_, i) => L(i % 16 < 8 ? 58 : 67));
    expect(lineAngleWobble(drift, 10)!).toBeLessThan(1);
    expect(lineAngleWobble(jumpy, 10)!).toBeGreaterThan(3);
    // 全体の幅（25〜75%）では、ゆっくりの方が大きく出てしまう（だから画面では小刻みなぶれを使う）
    expect(lineAngleSpread(drift)!).toBeGreaterThan(4);
  });

  it("1 こまだけ大きく飛ぶ読み違いは数えない。見つかったこまが少なければ測れない", () => {
    const one = Array.from({ length: 60 }, (_, i) => L(i === 30 ? 151 : 57));
    expect(lineAngleWobble(one, 10)!).toBeLessThan(0.1);
    expect(lineAngleWobble([L(50), null, L(52)], 10)).toBeNull();
  });
});
