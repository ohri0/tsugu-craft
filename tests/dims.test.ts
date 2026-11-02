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
  it("数字の札は、避ける所と重ならない所へ動き、細い線でつなぐ", () => {
    const dims = [{ a: [-5, 0, 0] as [number, number, number], b: [5, 0, 0] as [number, number, number], label: "ø 10.0" }];
    const plain = dimsSvg(dims, top);
    const ty = (svg: string) => Number(/<rect class="dim-tag" x="[^"]+" y="([^"]+)"/.exec(svg)![1]);
    // 元の札は線の少し上（y ≈ 87 の中心）。そこを避けさせる
    const moved = dimsSvg(dims, top, 1, { avoid: [{ x: 40, y: 70, w: 120, h: 26 }] });
    expect(ty(moved)).not.toBe(ty(plain));
    expect(moved).toContain("dim-leader");
  });
  it("2 つの札は重ならない", () => {
    const dims = [
      { a: [-5, 0, 0] as [number, number, number], b: [5, 0, 0] as [number, number, number], label: "A 10.0" },
      { a: [-5, 0.2, 0] as [number, number, number], b: [5, 0.2, 0] as [number, number, number], label: "B 10.0" },
    ];
    const svg = dimsSvg(dims, top);
    const rects = [...svg.matchAll(/<rect class="dim-tag" x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)].map((m) => m.slice(1).map(Number));
    const [a, b] = rects;
    const over = a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
    expect(over).toBe(false);
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
