import { describe, expect, it } from "vitest";
import { SECTION_PRESETS, meshVolume, openEdges, plateSolid, ringSolid, signedDistance, smoothClosed, toStl } from "../src/cad/solid";

const square = [
  { x: -10, y: -10 },
  { x: 10, y: -10 },
  { x: 10, y: 10 },
  { x: -10, y: 10 },
];

describe("板もの：すき間のない形", () => {
  it("輪郭からの距離は内側で正、外側で負", () => {
    expect(signedDistance(square, { x: 0, y: 0 })).toBeCloseTo(10);
    expect(signedDistance(square, { x: 12, y: 0 })).toBeCloseTo(-2);
  });
  it("四角の板（20 × 20 × 2 mm、ふちの丸めなし）は、体積がほぼ 800 mm³ で、開いた辺がない", () => {
    const m = plateSolid({ outline: square, thickness: 2, edgeRadius: 0, cell: 0.5 });
    expect(openEdges(m.positions)).toBe(0);
    expect(meshVolume(m.positions)).toBeGreaterThan(780);
    expect(meshVolume(m.positions)).toBeLessThan(820);
  });
  it("丸い輪郭・ふちを丸めても、すき間がない。丸めた分だけ体積が減る", () => {
    const circle = smoothClosed(Array.from({ length: 8 }, (_, i) => ({ x: 12 * Math.cos((i / 8) * Math.PI * 2), y: 12 * Math.sin((i / 8) * Math.PI * 2) })));
    const flat = plateSolid({ outline: circle, thickness: 2, edgeRadius: 0, cell: 0.4 });
    const round = plateSolid({ outline: circle, thickness: 2, edgeRadius: 0.8, cell: 0.4 });
    expect(openEdges(round.positions)).toBe(0);
    expect(meshVolume(round.positions)).toBeLessThan(meshVolume(flat.positions));
    expect(meshVolume(flat.positions)).toBeGreaterThan(Math.PI * 11.5 * 11.5 * 2 * 0.95);
  });
  it("起伏（粒）を足すと、体積が増え、すき間はない", () => {
    const base = plateSolid({ outline: square, thickness: 2, edgeRadius: 0.5, cell: 0.25 });
    const bumpy = plateSolid({ outline: square, thickness: 2, edgeRadius: 0.5, cell: 0.25, relief: (x, y) => 0.1 * Math.max(0, Math.cos(x * 3) * Math.cos(y * 3)) });
    expect(openEdges(bumpy.positions)).toBe(0);
    expect(meshVolume(bumpy.positions)).toBeGreaterThan(meshVolume(base.positions));
  });
});

describe("指輪：断面を回した形", () => {
  const spec = { innerDiameter: 16.6, top: SECTION_PRESETS.kouman(6, 1.6), bottom: SECTION_PRESETS.kouman(4, 1.4), blendDeg: 120, around: 96, across: 12 };
  it("体積は正で、おおよそ 円周 × 断面", () => {
    const r = ringSolid(spec);
    const tris = new Float32Array(r.indices.length * 3);
    r.indices.forEach((v, i) => tris.set(r.positions.subarray(v * 3, v * 3 + 3), i * 3));
    const v = meshVolume(tris);
    expect(v).toBeGreaterThan(0);
    // 断面およそ 4〜6 × 1.4〜1.6 の 0.6〜0.9 倍 × 内まわり 52 mm
    expect(v).toBeGreaterThan(150);
    expect(v).toBeLessThan(550);
    expect(openEdges(tris)).toBe(0);
  });
  it("STL にすると、三角形の数ぶんの大きさになる", () => {
    const r = ringSolid(spec);
    const buf = toStl(r.positions, r.indices);
    expect(buf.byteLength).toBe(84 + (r.indices.length / 3) * 50);
  });
});
