import { describe, expect, it } from "vitest";
import { buildSolid } from "../src/geometry/sdf";
import { meshVolume } from "../src/cad/solid";

/** 三角形の辺がすべて 2 回ずつ（向きは逆）使われているか＝閉じた形 */
function closed(p: Float32Array): boolean {
  const key = (i: number) => `${p[i].toFixed(5)},${p[i + 1].toFixed(5)},${p[i + 2].toFixed(5)}`;
  const edges = new Map<string, number>();
  for (let t = 0; t < p.length; t += 9) {
    const v = [key(t), key(t + 3), key(t + 6)];
    for (let e = 0; e < 3; e++) {
      const a = v[e];
      const b = v[(e + 1) % 3];
      if (a === b) continue;
      edges.set(`${a}|${b}`, (edges.get(`${a}|${b}`) ?? 0) + 1);
    }
  }
  for (const [k, n] of edges) {
    const [a, b] = k.split("|");
    if ((edges.get(`${b}|${a}`) ?? 0) !== n) return false;
  }
  return true;
}

describe("一体の形（距離の場から面を作る）", () => {
  it("丸い管 1 本は、体積が計算どおりで、外向きに閉じた形", () => {
    const m = buildSolid([{ pts: [[0, 0, 0], [2, 0, 0]], radii: [1, 1], owner: 0 }], { cell: 0.05, blend: 0.1 });
    const v = meshVolume(m.positions);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeCloseTo(Math.PI * 2 + (4 / 3) * Math.PI, 0);
    expect(closed(m.positions)).toBe(true);
  });
  it("2 本の管はつなぎ目に丸みが付き、持ち主ごとに三角形が分かれる", () => {
    const a = buildSolid([{ pts: [[0, 0, 0], [3, 0, 0]], radii: [0.4, 0.4], owner: 1 }, { pts: [[1.5, -1.5, 0], [1.5, 1.5, 0]], radii: [0.4, 0.4], owner: 2 }], { cell: 0.05, blend: 0.3 });
    const b = buildSolid([{ pts: [[0, 0, 0], [3, 0, 0]], radii: [0.4, 0.4], owner: 1 }, { pts: [[1.5, -1.5, 0], [1.5, 1.5, 0]], radii: [0.4, 0.4], owner: 2 }], { cell: 0.05, blend: 0.01 });
    expect(meshVolume(a.positions)).toBeGreaterThan(meshVolume(b.positions));
    expect(a.ranges.get(1)!.count).toBeGreaterThan(0);
    expect(a.ranges.get(2)!.count).toBeGreaterThan(0);
  });
  it("引く形で座を彫れる", () => {
    const full = buildSolid([{ pts: [[0, 0, 0], [2, 0, 0]], radii: [1, 1], owner: 0 }], { cell: 0.05, blend: 0.1 });
    const cut = buildSolid([{ pts: [[0, 0, 0], [2, 0, 0]], radii: [1, 1], owner: 0 }], { cell: 0.05, blend: 0.1, subtract: (x, y, z) => Math.hypot(x - 2, y, z) - 0.8 });
    expect(meshVolume(cut.positions)).toBeLessThan(meshVolume(full.positions) - 0.5);
  });
});
