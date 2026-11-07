import { describe, expect, it } from "vitest";
import { glossShapeName } from "../src/geometry/shape";

describe("石の名前の言いかえ（2026-11-08 作者）", () => {
  it("ノンカリブレに、やさしい言いかえを添える", () => {
    expect(glossShapeName("トリリアント（ノンカリブレ）")).toBe("トリリアント（ノンカリブレ＝決まった寸法でない石）");
  });
  it("ほかの名前は、そのまま", () => {
    expect(glossShapeName("五角形")).toBe("五角形");
  });
});
