import { describe, expect, it } from "vitest";
import { buildRing } from "../src/geometry/ring";
import { howToMake, measures } from "../src/studio/howto";
import { stoneFrom } from "./helpers/stones";
import { triangle } from "./helpers/synth";
import { MAKING_STEPS } from "../src/rules/making";

const stone = stoneFrom(triangle(200, 200, 160, 140), 8.88, 4.24);
const input = (style: "prong" | "bezel") => {
  const ring = buildRing({ stone, setting: { style, height: "standard" }, shank: { gou: 11 }, orientation: "along" });
  return { ring, outlineMm: stone.outlineMm, longMm: stone.longMm, widthMm: stone.widthMm, depthMm: stone.depthMm, metalLabel: "K18" };
};

describe("作り方：この石・このデザインから、工程と数字を出す", () => {
  it("腕の線の長さは（内径 ＋ 厚み）× π", () => {
    const i = input("prong");
    const m = measures(i);
    expect(m.shankLength).toBeCloseTo((i.ring.shank.innerDiameterMm + i.ring.shank.thicknessMm) * Math.PI, 5);
  });
  it("爪の線材は、爪の太さで、足の数だけ（V 字の爪は 2 本）", () => {
    const i = input("prong");
    const m = measures(i);
    expect(m.prongWire!.count).toBe(i.ring.setting.prongs.reduce((n, p) => n + p.legs, 0));
    expect(m.prongWire!.diameter).toBeCloseTo(i.ring.setting.prongs[0].diameterMm);
    expect(m.seatFromTip!).toBeGreaterThan(0);
  });
  it("鋳造と手作りで、工程が分かれる。どちらも最後は仕上げ", () => {
    const cast = howToMake(input("prong"), "cast");
    const hand = howToMake(input("prong"), "hand");
    expect(cast[0].title).toContain("原型");
    expect(hand[0].title).toContain("材料");
    expect(cast.at(-1)!.title).toBe("仕上げ");
    expect(hand.at(-1)!.title).toBe("仕上げ");
  });
  it("覆輪では、帯の長さと壁の厚みが出る", () => {
    const hand = howToMake(input("bezel"), "hand");
    const all = hand.flatMap((s) => s.specs.map((x) => x.label));
    expect(all).toContain("覆輪の壁");
    expect(all).toContain("帯の長さ");
  });
  it("石の大きさが変わると、数字も変わる", () => {
    const small = stoneFrom(triangle(200, 200, 160, 140), 5, 3);
    const a = measures(input("prong"));
    const ring = buildRing({ stone: small, setting: { style: "prong", height: "standard" }, shank: { gou: 11 }, orientation: "along" });
    const b = measures({ ring, outlineMm: small.outlineMm, longMm: small.longMm, widthMm: small.widthMm, depthMm: small.depthMm, metalLabel: "K18" });
    expect(b.prongWire!.diameter).toBeLessThan(a.prongWire!.diameter);
    expect(b.girdleLen).toBeLessThan(a.girdleLen);
  });
});

describe("工程の id と題は、作り方の決まりの工程の一覧と同じ", () => {
  it("鋳造・手作り・爪・覆輪のどの工程も、一覧にある", () => {
    for (const style of ["prong", "bezel"] as const)
      for (const route of ["cast", "hand"] as const)
        for (const st of howToMake(input(style), route)) {
          expect(st.id).toBeDefined();
          expect(MAKING_STEPS[st.id as keyof typeof MAKING_STEPS]).toBe(st.title);
        }
  });
});
