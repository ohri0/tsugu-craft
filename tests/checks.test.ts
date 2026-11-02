import { describe, expect, it } from "vitest";
import { findCorners } from "../src/geometry/corners";
import { buildRing, type RingParams } from "../src/geometry/ring";
import { buildSetting } from "../src/geometry/setting";
import { checkRing, checkSetting, cornerDistances, FIXES, HOLD_NOTE, holdRatio } from "../src/rules/checks";
import { GUIDES, minProngMm, standardProngMm, stoneSizeMm } from "../src/rules/guides";
import { ovalStone, triangleStone } from "./helpers/stones";

const ring = (setting: RingParams["setting"], stone = triangleStone()) => buildRing({ stone, setting, shank: { gou: 10 } });
const ids = (ps: { check: string }[]) => ps.map((p) => p.check);

describe("石の留まり", () => {
  it("標準の 4 本爪・標準の太さ・標準の高さは 1.0×", () => {
    const s = buildSetting({ stone: ovalStone(), style: "prong" });
    expect(s.prongs).toHaveLength(4);
    expect(holdRatio(s)).toBeCloseTo(1.0, 9);
  });
  it("V 字の爪は足 2 本と数える（三角の V 字 3 つ ＝ 1.5×）", () => {
    expect(holdRatio(buildSetting({ stone: triangleStone(), style: "prong" }))).toBeCloseTo(1.5, 9);
  });
  it("太さの 3 乗、長さに反比例", () => {
    const stone = ovalStone();
    const dStd = standardProngMm(stoneSizeMm(stone.longMm, stone.widthMm));
    expect(holdRatio(buildSetting({ stone, style: "prong", prongDiameterMm: dStd * 0.9 }))).toBeCloseTo(0.729, 9);
    const low = holdRatio(buildSetting({ stone, style: "prong", height: "low" }));
    const high = holdRatio(buildSetting({ stone, style: "prong", height: "high" }));
    expect(low).toBeGreaterThan(1);
    expect(high).toBeLessThan(1);
  });
  it("覆輪は 2.0×", () => {
    expect(holdRatio(buildSetting({ stone: ovalStone(), style: "bezel" }))).toBe(GUIDES.hold.bezel);
  });
  it("足りないと、選択肢を見た目への影響つきで返す", () => {
    const stone = ovalStone();
    const dStd = standardProngMm(stoneSizeMm(stone.longMm, stone.widthMm));
    const ps = checkRing(ring({ style: "prong", prongDiameterMm: dStd * 0.9 }, stone));
    const hold = ps.find((p) => p.check === "hold")!;
    expect(hold.currentValue).toBeCloseTo(0.729, 6);
    expect(hold.requiredValue).toBe(GUIDES.hold.requiredTop);
    expect(hold.options.map((o) => o.id)).toEqual(["thicker", "moreProngs", "lower", "bezel"]);
    expect(hold.options[0].effectOnLook).toBe("少し重く見える");
    expect(hold.reason).toContain(HOLD_NOTE);
  });
  it("石の場所で必要な留まりが変わる（上 1.0×・横 1.2×・手のひら側 1.4×）", () => {
    const r = ring({ style: "prong" }, ovalStone());
    expect(ids(checkRing(r, { position: "top" }))).not.toContain("hold");
    expect(checkRing(r, { position: "side" }).find((p) => p.check === "hold")!.requiredValue).toBe(1.2);
    expect(checkRing(r, { position: "palm" }).find((p) => p.check === "hold")!.requiredValue).toBe(1.4);
    // 三角の V 字 3 つ（1.5×）は手のひら側でも足りる
    expect(ids(checkRing(ring({ style: "prong" }), { position: "palm" }))).not.toContain("hold");
  });
  it("「強度計算の代わりではない」を画面に出すための言葉がある", () => {
    expect(HOLD_NOTE).toContain("強度計算の代わりではない");
  });
});

describe("尖った角", () => {
  it("V 字の爪があれば、3 つの角は守られている", () => {
    const r = ring({ style: "prong" });
    expect(ids(checkRing(r))).not.toContain("corner");
    for (const d of cornerDistances(r.setting)) expect(d).toBeLessThanOrEqual(GUIDES.prong.cornerReachMm);
  });
  it("爪を角から離すと、3 つとも「守られていない」", () => {
    const stone = triangleStone();
    const corners = findCorners(stone.outlineMm);
    const r = ring({ style: "prong", prongs: corners.map((c) => ({ t: c.t + 0.1 })) }, stone);
    const ps = checkRing(r).filter((p) => p.check === "corner");
    expect(ps).toHaveLength(3);
    for (const p of ps) {
      expect(p.currentValue).toBeGreaterThan(GUIDES.prong.cornerReachMm);
      expect(p.target.kind).toBe("corner");
      expect(p.options.map((o) => o.id)).toEqual(["vAtCorner", "bezel"]);
    }
  });
  it("角のすぐ横のふつうの爪でも、0.9 mm 以内なら守られている", () => {
    const stone = triangleStone();
    const corners = findCorners(stone.outlineMm);
    const r = ring({ style: "prong", prongs: corners.map((c) => ({ t: c.t + 0.01 })) }, stone);
    expect(ids(checkRing(r))).not.toContain("corner");
  });
  it("覆輪なら角は全部守られている", () => {
    expect(ids(checkRing(ring({ style: "bezel" })))).not.toContain("corner");
  });
});

describe("そのほかの確かめ", () => {
  it("三角の石・自動の V 字の爪・標準なら問題なし", () => {
    expect(checkRing(ring({ style: "prong" }))).toEqual([]);
  });
  it("覆輪・目安の壁なら問題なし", () => {
    expect(checkRing(ring({ style: "bezel" }))).toEqual([]);
    expect(checkRing(ring({ style: "bezel" }, ovalStone()))).toEqual([]);
  });
  it("石の一番下が指に近い → 石座を高くする", () => {
    const ps = checkRing(ring({ style: "prong", culetGapMm: 0.1 }));
    const p = ps.find((q) => q.check === "finger-gap")!;
    expect(p.currentValue).toBeCloseTo(0.1, 6);
    expect(p.required).toContain("0.30 mm");
    expect(p.options[0].id).toBe("raise");
  });
  it("爪が細い → 爪ごとに、太くする", () => {
    const stone = ovalStone();
    const min = minProngMm(stoneSizeMm(stone.longMm, stone.widthMm));
    const ps = checkRing(ring({ style: "prong", prongDiameterMm: min * 0.9 }, stone)).filter((p) => p.check === "prong-thin");
    expect(ps).toHaveLength(4);
    expect(ps.map((p) => p.target)).toEqual([0, 1, 2, 3].map((index) => ({ kind: "prong", index })));
  });
  it("爪の先が高すぎる → 下げる、低すぎる → 上げる", () => {
    const high = checkRing(ring({ style: "prong", tipRatio: 0.95 })).find((p) => p.check === "tip-height")!;
    expect(high.options[0].id).toBe("tipDown");
    const low = checkRing(ring({ style: "prong", tipRatio: 0.7 })).find((p) => p.check === "tip-height")!;
    expect(low.options[0].id).toBe("tipUp");
  });
  it("爪の間が周の 38% より広い → 爪を足す", () => {
    const ps = checkRing(ring({ style: "prong", prongCount: 2 }, ovalStone()));
    const p = ps.find((q) => q.check === "prong-gap")!;
    expect(p.currentValue).toBeCloseTo(0.5, 6);
    expect(p.options[0].id).toBe("addProng");
  });
  it("覆輪の壁が 0.4 mm より薄い → 壁を厚く", () => {
    const ps = checkRing(ring({ style: "bezel", bezelWallMm: 0.3 }));
    expect(ids(ps)).toEqual(["bezel-wall"]);
  });
  it("指輪に置く前の石座だけでも確かめられる", () => {
    const s = buildSetting({ stone: triangleStone(), style: "prong" });
    expect(checkSetting(s)).toEqual([]);
  });
  it("どの選択肢にも見た目への影響がある", () => {
    for (const f of Object.values(FIXES)) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.effectOnLook.length).toBeGreaterThan(0);
    }
  });
});

describe("ちょうど目安の値なら問題にしない", () => {
  it("覆輪・低めで、石の一番下と指のすき間がちょうど 0.3 mm でも「足りない」と言わない", () => {
    const ring = buildRing({ stone: triangleStone(), setting: { style: "bezel", height: "low" }, shank: { gou: 11 } });
    expect(ring.culetGapMm).toBeCloseTo(0.3, 6);
    expect(checkRing(ring).filter((p) => p.check === "finger-gap")).toHaveLength(0);
  });
});
