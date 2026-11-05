// 石の中の光を追うための平面と、撮影台の光の表（画面に依存しない計算だけ）
import { describe, expect, it } from "vitest";
import { buildStone } from "../src/geometry/stone";
import { stonePlanes } from "../src/ui/gem";
import { expandLights, GEM_STUDIO, lightDir, METAL_COLOR, METAL_STUDIO, radiance } from "../src/ui/studio-light";
import { ovalStone, triangleStone } from "./helpers/stones";

/** 1 辺 2 の立方体（三角形 12 枚） */
function cube(): Float32Array {
  const f: number[][] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => f.push([...a, ...b, ...c], [...a, ...c, ...d]);
  const p = (x: number, y: number, z: number) => [x, y, z];
  quad(p(1, -1, -1), p(1, 1, -1), p(1, 1, 1), p(1, -1, 1));
  quad(p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1));
  quad(p(-1, 1, -1), p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1));
  quad(p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1));
  quad(p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1));
  quad(p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1), p(1, -1, -1));
  return new Float32Array(f.flat());
}

describe("石の面の平面", () => {
  it("立方体は 6 面。どの面も外向きで、真ん中から 1 離れている", () => {
    const planes = stonePlanes(cube());
    expect(planes.length).toBe(6);
    for (const [x, y, z, d] of planes) {
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5);
      expect(d).toBeCloseTo(1, 5);
    }
  });
  it("三角形の範囲を指定すると、その石の面だけを読む（石を並べた指輪）", () => {
    const one = cube();
    const two = new Float32Array(one.length * 2);
    two.set(one, 0);
    two.set(one.map((v, i) => (i % 3 === 0 ? v + 10 : v)), one.length);
    expect(stonePlanes(two, 12, 12).every(([x, , , d]) => (x > 0.5 ? Math.abs(d - 11) < 1e-5 : x < -0.5 ? Math.abs(d + 9) < 1e-5 : Math.abs(d - 1) < 1e-5))).toBe(true);
  });
  it.each([["三角", triangleStone()], ["楕円", ovalStone()]] as const)("%s：面はまとめられて 120 枚以下、石の点はどの平面の内側にもある", (_, st) => {
    const { positions } = buildStone(st);
    const planes = stonePlanes(positions);
    expect(planes.length).toBeGreaterThan(5);
    expect(planes.length).toBeLessThanOrEqual(120);
    for (let i = 0; i < positions.length; i += 3) {
      for (const [x, y, z, d] of planes) expect(x * positions[i] + y * positions[i + 1] + z * positions[i + 2] - d).toBeLessThan(0.3);
    }
  });
});

describe("撮影台の光", () => {
  it("光の真ん中は地より明るく、真下はとても暗い", () => {
    for (const spec of [METAL_STUDIO, GEM_STUDIO]) {
      const lights = expandLights(spec);
      const first = spec.lights[0];
      if (first.kind !== "panel") throw new Error("はじめの光は面");
      expect(radiance(spec, lights, lightDir(first.az, first.el, 0), 0)).toBeGreaterThan(1);
      expect(radiance(spec, lights, [0, 0, -1], 0)).toBeLessThan(0.05);
    }
  });
  it("小さな光の場所は、いつも同じ", () => {
    expect(expandLights(GEM_STUDIO)).toEqual(expandLights(GEM_STUDIO));
  });
  it("カメラが回ると、光も一緒に回る", () => {
    const lights = expandLights(METAL_STUDIO);
    const a = radiance(METAL_STUDIO, lights, lightDir(40, 25, 0), 0);
    const b = radiance(METAL_STUDIO, lights, lightDir(40, 25, 70), 70);
    expect(b).toBeCloseTo(a, 5);
  });
});

describe("地金の色", () => {
  it("K18 ホワイトはシルバー寄り、K18 ピンクは赤み、K18 イエローは黄色。Pt900 と SV925 は色がほとんどない", () => {
    const warm = (m: keyof typeof METAL_COLOR) => METAL_COLOR[m][2] / METAL_COLOR[m][0];
    expect(warm("k18y")).toBeLessThan(0.65);
    expect(warm("k18wg")).toBeGreaterThan(0.88);
    expect(warm("pt900")).toBeGreaterThan(0.95);
    expect(warm("sv925")).toBeGreaterThan(0.92);
    // ピンクは、緑が赤よりはっきり少ない（イエローより赤い）
    expect(METAL_COLOR.k18pg[1] / METAL_COLOR.k18pg[0]).toBeLessThan(METAL_COLOR.k18y[1] / METAL_COLOR.k18y[0] - 0.1);
  });
});
