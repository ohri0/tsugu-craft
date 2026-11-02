import { describe, expect, it } from "vitest";
import { dimsSvg, gizmoSvg, labelWidth } from "../src/studio/dims";

// 上から見た、1 mm ＝ 10 px の写し方
const top = (x: number, y: number) => ({ x: 100 + x * 10, y: 100 - y * 10 });

describe("寸法の線", () => {
  it("長い寸法は、2 点の間に線と数字を出す", () => {
    const svg = dimsSvg([{ a: [-5, 0, 0], b: [5, 0, 0], label: "ø 10.0 mm" }], top);
    expect(svg).toContain('x1="50.0"');
    expect(svg).toContain('x2="150.0"');
    expect(svg).toContain("ø 10.0 mm");
    expect(svg).not.toContain("dim-leader");
  });
  it("短い寸法は、数字を横に出して引き出し線でつなぐ", () => {
    const svg = dimsSvg([{ a: [0, 0, 0], b: [0, 0.6, 0], label: "0.60", bad: true }], top);
    expect(svg).toContain("dim-leader");
    expect(svg).toContain('class="dim bad"');
  });
  it("写せない点の寸法は描かない", () => {
    expect(dimsSvg([{ a: [0, 0, 0], b: [1, 0, 0], label: "x" }], () => null)).toBe("");
  });
  it("和文は広く数える", () => {
    expect(labelWidth("内径")).toBeGreaterThan(labelWidth("ab"));
  });
  it("軸の印は 3 本", () => {
    const g = gizmoSvg({ x: [1, 0], y: [0, 1], z: [0, 0] });
    expect(g.match(/<line/g)).toHaveLength(3);
    expect(g).toContain(">Z<");
  });
});
