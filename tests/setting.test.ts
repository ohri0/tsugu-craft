import { describe, expect, it } from "vitest";
import { findCorners } from "../src/geometry/corners";
import { distanceToOutline } from "../src/geometry/polygon";
import { buildRing, type RingParams } from "../src/geometry/ring";
import { autoProngCount, buildSetting, outlineIndexAtT, tAtOutlineIndex, tipMeasures, type TriangleRange } from "../src/geometry/setting";
import { buildShank } from "../src/geometry/shank";
import { meshVolume } from "../src/geometry/stone";
import { maxProngGap } from "../src/rules/checks";
import { GUIDES, innerDiameterMm } from "../src/rules/guides";
import { elongatedStone, largeRoundStone, ovalStone, squareStone, triangleStone } from "./helpers/stones";

const part = (a: Float32Array, r: TriangleRange) => a.subarray(r.start * 9, (r.start + r.count) * 9);

describe("爪の本数（自動）", () => {
  it("決まり：角 3〜6 つなら角の数、細長い・大きい石は 6、それ以外は 4", () => {
    expect(autoProngCount(8, 7, 3)).toBe(3);
    expect(autoProngCount(8, 7, 6)).toBe(6);
    expect(autoProngCount(7, 5.6, 0)).toBe(4);
    expect(autoProngCount(8, 5, 0)).toBe(6); // 細長い
    expect(autoProngCount(10, 10, 0)).toBe(6); // 大きい
    expect(autoProngCount(7, 5.6, 2)).toBe(4); // 角 2 つ（舟形風）は 4
  });
  it("三角は 3 本（全部 V 字）", () => {
    const s = buildSetting({ stone: triangleStone(), style: "prong" });
    expect(s.prongs).toHaveLength(3);
    expect(s.prongs.every((p) => p.isV && p.legs === 2)).toBe(true);
  });
  it("四角は 4 本（全部 V 字）", () => {
    const s = buildSetting({ stone: squareStone(), style: "prong" });
    expect(s.corners).toHaveLength(4);
    expect(s.prongs).toHaveLength(4);
    expect(s.prongs.every((p) => p.isV)).toBe(true);
  });
  it("楕円は 4 本、均等（いちばん空いた所が周の 25%）", () => {
    const s = buildSetting({ stone: ovalStone(), style: "prong" });
    expect(s.prongs).toHaveLength(4);
    expect(s.prongs.some((p) => p.isV)).toBe(false);
    expect(maxProngGap(s).ratio).toBeCloseTo(0.25, 6);
  });
  it("細長い楕円と大きな丸は 6 本", () => {
    expect(buildSetting({ stone: elongatedStone(), style: "prong" }).prongs).toHaveLength(6);
    expect(buildSetting({ stone: largeRoundStone(), style: "prong" }).prongs).toHaveLength(6);
  });
  it("本数を手で決めると、選んだ角を先に守り、残りを広い所へ", () => {
    const stone = triangleStone();
    const s = buildSetting({ stone, style: "prong", prongCount: 5 });
    expect(s.prongs).toHaveLength(5);
    expect(s.prongs.filter((p) => p.isV)).toHaveLength(3);
    expect(maxProngGap(s).ratio).toBeLessThan(GUIDES.prong.maxGapRatio);
  });
});

describe("V 字の爪", () => {
  it("三角の 3 つの角に、角を挟む 2 本の足", () => {
    const stone = triangleStone();
    const corners = findCorners(stone.outlineMm);
    const s = buildSetting({ stone, style: "prong" });
    const ts = s.prongs.map((p) => p.t).sort();
    expect(ts).toEqual(corners.map((c) => c.t).sort());
    for (const p of s.prongs) {
      expect(p.legTs).toHaveLength(2);
      const c = corners.find((k) => k.t === p.t)!;
      // 2 本の足は角の両側に、角から同じくらい離れて
      const d = p.legPoints.map((q) => Math.hypot(q.x - c.point.x, q.y - c.point.y));
      expect(Math.abs(d[0] - d[1])).toBeLessThan(0.3);
      expect(Math.min(...d)).toBeGreaterThan(p.diameterMm / 2);
    }
  });
});

describe("覆輪", () => {
  it("内側の線は縁 ＋ 0.04 mm、外側は ＋ 壁の厚み（楕円）", () => {
    const stone = ovalStone();
    const s = buildSetting({ stone, style: "bezel" });
    const b = s.bezel!;
    for (const p of b.innerOutline) expect(Math.abs(distanceToOutline(stone.outlineMm, p) - GUIDES.bezel.clearanceMm)).toBeLessThan(0.003);
    for (const p of b.outerOutline)
      expect(Math.abs(distanceToOutline(stone.outlineMm, p) - GUIDES.bezel.clearanceMm - GUIDES.bezel.wallMm)).toBeLessThan(0.005);
  });
  it("三角でも、内側の線の距離の真ん中の値は 0.04 mm", () => {
    const stone = triangleStone();
    const b = buildSetting({ stone, style: "bezel" }).bezel!;
    const d = b.innerOutline.map((p) => distanceToOutline(stone.outlineMm, p)).sort((x, y) => x - y);
    expect(d[Math.floor(d.length / 2)]).toBeCloseTo(GUIDES.bezel.clearanceMm, 3);
  });
  it("上の端は石の上側に少しかかる（上側の 3 割、0.35 mm まで）", () => {
    const stone = triangleStone();
    const s = buildSetting({ stone, style: "bezel" });
    const want = Math.min(GUIDES.bezel.crownCoverRatio * s.heights.crownMm, GUIDES.bezel.crownCoverMaxMm);
    expect(s.bezel!.coverMm).toBeCloseTo(want, 9);
    expect(s.bezel!.topZ).toBeCloseTo(s.heights.girdleMm / 2 + want, 9);
    expect(s.heights.topZ).toBeCloseTo(s.bezel!.topZ, 4);
  });
});

describe("閉じた形で、面の向きがそろっている（体積が正）", () => {
  for (const [name, stone] of [
    ["三角", triangleStone()],
    ["四角", squareStone()],
    ["楕円", ovalStone()],
    ["細長い楕円", elongatedStone()],
  ] as const) {
    it(`${name}：爪・輪・覆輪の 1 つずつ`, () => {
      const p = buildSetting({ stone, style: "prong" });
      expect(meshVolume(p.positions)).toBeGreaterThan(0);
      for (const q of p.prongs) expect(meshVolume(part(p.positions, q.triangles))).toBeGreaterThan(0);
      expect(p.rings).toHaveLength(2);
      for (const r of p.rings) expect(meshVolume(part(p.positions, r.triangles))).toBeGreaterThan(0);
      const b = buildSetting({ stone, style: "bezel" });
      expect(meshVolume(b.positions)).toBeGreaterThan(0);
    });
  }
  it("腕", () => {
    const sh = buildShank({ gou: 10 });
    expect(meshVolume(sh.positions)).toBeGreaterThan(0);
    expect(sh.volumeMm3).toBeGreaterThan(0);
  });
});

describe("爪の先の高さと石座の輪", () => {
  const stone = triangleStone();
  const s = buildSetting({ stone, style: "prong" });
  it("目安の範囲（上面までの 75〜85%、上側にかかる 33〜50%）に入る", () => {
    const m = tipMeasures(s.heights, s.heights.tipZ!);
    expect(m.ratio).toBeGreaterThanOrEqual(GUIDES.prong.tipHeightRatio[0]);
    expect(m.ratio).toBeLessThanOrEqual(GUIDES.prong.tipHeightRatio[1]);
    expect(m.overlap).toBeGreaterThanOrEqual(GUIDES.prong.crownOverlapRatio[0]);
    expect(m.overlap).toBeLessThanOrEqual(GUIDES.prong.crownOverlapRatio[1]);
  });
  it("輪は 2 段：上は石の下側の途中、下は腕のすぐ上", () => {
    const h = s.heights;
    expect(h.upperRingZ!).toBeLessThan(-h.girdleMm / 2);
    expect(h.upperRingZ!).toBeGreaterThan(h.lowerRingZ!);
    expect(h.lowerRingZ!).toBeGreaterThan(h.shankTopZ);
    expect(h.lowerRingZ! - h.shankTopZ).toBeLessThan(s.rings[1].wireMm);
  });
  it("爪は下側の面に沿って内へ傾く（下ほど中心に近い）", () => {
    const r = part(s.positions, s.prongs[0].triangles);
    let top = { z: -Infinity, d: 0 };
    let bottom = { z: Infinity, d: 0 };
    for (let i = 0; i < r.length; i += 3) {
      const d = Math.hypot(r[i], r[i + 1]);
      if (r[i + 2] > top.z) top = { z: r[i + 2], d };
      if (r[i + 2] < bottom.z) bottom = { z: r[i + 2], d };
    }
    expect(bottom.d).toBeLessThan(top.d);
  });
});

describe("高さ", () => {
  const stone = ovalStone();
  const gap = (height: "low" | "standard" | "high", style: "prong" | "bezel" = "prong") =>
    buildSetting({ stone, style, height }).heights.culetGapMm;
  it("低め ＋0 / 標準 ＋0.5 / 高め ＋1.0 mm", () => {
    expect(gap("standard") - gap("low")).toBeCloseTo(GUIDES.height.options.standard, 9);
    expect(gap("high") - gap("low")).toBeCloseTo(GUIDES.height.options.high, 9);
  });
  it("低めでも、石の一番下は指から 0.3 mm 以上", () => {
    expect(gap("low")).toBeGreaterThanOrEqual(GUIDES.height.minFingerGapMm);
    expect(gap("low", "bezel")).toBeGreaterThanOrEqual(GUIDES.height.minFingerGapMm);
  });
  it("高いほど爪が長い", () => {
    const len = (height: "low" | "high") => buildSetting({ stone, style: "prong", height }).prongs[0].lengthMm;
    expect(len("high")).toBeGreaterThan(len("low"));
  });
});

describe("縁の番号と位置", () => {
  it("番号 → 位置 → 番号で元に戻る", () => {
    const stone = ovalStone();
    for (const i of [0, 7, 50, 199]) expect(outlineIndexAtT(stone.outlineMm, tAtOutlineIndex(stone.outlineMm, i))).toBe(i);
  });
});

describe("腕", () => {
  it("号数から内径（10 号 ＝ 16.0 mm）、幅と厚みは目安", () => {
    const sh = buildShank({ gou: 10 });
    expect(sh.innerDiameterMm).toBeCloseTo(innerDiameterMm(10), 9);
    expect(sh.widthMm).toBe(GUIDES.shank.widthMm);
    expect(sh.thicknessMm).toBe(GUIDES.shank.thicknessMm);
    let rMin = Infinity;
    let rMax = -Infinity;
    let xMax = 0;
    const a = sh.positions;
    for (let i = 0; i < a.length; i += 3) {
      const r = Math.hypot(a[i + 1], a[i + 2]);
      rMin = Math.min(rMin, r);
      rMax = Math.max(rMax, r);
      xMax = Math.max(xMax, Math.abs(a[i]));
    }
    expect(rMin).toBeCloseTo(8.0, 3);
    expect(rMax).toBeCloseTo(8.0 + GUIDES.shank.thicknessMm, 2);
    expect(xMax).toBeCloseTo(GUIDES.shank.widthMm / 2, 4);
  });
  it("重さ ＝ 体積 × 密度。甲丸の断面（半楕円）から見積もった体積に近い", () => {
    const sh = buildShank({ gou: 10, metal: "pt900" });
    const w = sh.widthMm;
    const t = sh.thicknessMm;
    const area = (Math.PI * (w / 2) * t) / 2;
    const meanR = sh.innerRadiusMm + (4 * t) / (3 * Math.PI);
    expect(sh.volumeMm3).toBeGreaterThan(2 * Math.PI * meanR * area * 0.97);
    expect(sh.volumeMm3).toBeLessThan(2 * Math.PI * meanR * area * 1.0);
    expect(sh.weightG).toBeCloseTo((sh.volumeMm3 / 1000) * GUIDES.metals.pt900.densityGPerCm3, 9);
  });
});

describe("指輪にまとめる", () => {
  const params = (over: Partial<RingParams["setting"]> = {}, orientation: "along" | "across" = "along"): RingParams => ({
    stone: triangleStone(),
    setting: { style: "prong", ...over },
    shank: { gou: 10 },
    orientation,
  });
  /** 石のどの点も、指（半径 ＝ 内径 ÷ 2 の円柱、軸は x）から離れている距離の最小 */
  const clearance = (p: RingParams) => {
    const ring = buildRing(p);
    const a = ring.ringPositions.stone;
    let m = Infinity;
    for (let i = 0; i < a.length; i += 3) m = Math.min(m, Math.hypot(a[i + 1], a[i + 2]) - ring.shank.innerRadiusMm);
    return { m, ring };
  };
  for (const height of ["low", "standard", "high"] as const) {
    for (const orientation of ["along", "across"] as const) {
      for (const style of ["prong", "bezel"] as const) {
        it(`石の一番下は指から 0.3 mm 以上（${height}・${orientation}・${style}）`, () => {
          const { m, ring } = clearance(params({ height, style }, orientation));
          expect(m).toBeGreaterThanOrEqual(GUIDES.height.minFingerGapMm - 1e-4);
          expect(ring.culetGapMm).toBeCloseTo(ring.setting.heights.culetGapMm, 9);
        });
      }
    }
  }
  it("向き：縦は長辺が指に沿い（x）、横は指を横切る（y）", () => {
    const span = (a: Float32Array, c: number) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = c; i < a.length; i += 3) {
        lo = Math.min(lo, a[i]);
        hi = Math.max(hi, a[i]);
      }
      return hi - lo;
    };
    const along = buildRing(params({}, "along")).ringPositions.stone;
    const across = buildRing(params({}, "across")).ringPositions.stone;
    expect(span(along, 0)).toBeGreaterThan(8.88 * 0.97);
    expect(span(along, 0)).toBeGreaterThan(span(along, 1));
    expect(span(across, 1)).toBeCloseTo(span(along, 0), 4);
    expect(span(across, 0)).toBeCloseTo(span(along, 1), 4);
  });
  it("石座の下の端は腕の中まで届く（つながっている）", () => {
    const ring = buildRing(params());
    let zMin = Infinity;
    const a = ring.ringPositions.setting;
    for (let i = 2; i < a.length; i += 3) zMin = Math.min(zMin, a[i]);
    expect(zMin).toBeLessThan(ring.shank.outerRadiusMm);
    expect(zMin).toBeGreaterThan(ring.shank.innerRadiusMm);
  });
  it("重さは腕だけより重く、密度に比例", () => {
    const k18 = buildRing({ ...params(), shank: { gou: 10, metal: "k18y" } });
    const sv = buildRing({ ...params(), shank: { gou: 10, metal: "sv925" } });
    expect(k18.metalWeightG).toBeGreaterThan(k18.shank.weightG);
    expect(k18.metalWeightG / sv.metalWeightG).toBeCloseTo(GUIDES.metals.k18y.densityGPerCm3 / GUIDES.metals.sv925.densityGPerCm3, 6);
  });
});

describe("同じ入力なら同じ形", () => {
  it("石座（爪・覆輪）と指輪", () => {
    const stone = triangleStone();
    expect(buildSetting({ stone, style: "prong" }).positions).toEqual(buildSetting({ stone, style: "prong" }).positions);
    expect(buildSetting({ stone, style: "bezel" }).positions).toEqual(buildSetting({ stone, style: "bezel" }).positions);
    const p: RingParams = { stone, setting: { style: "prong", height: "high" }, shank: { gou: 12 }, orientation: "across" };
    const a = buildRing(p);
    const b = buildRing(p);
    expect(a.ringPositions).toEqual(b.ringPositions);
    expect(a.setting.prongs).toEqual(b.setting.prongs);
    expect(a.metalWeightG).toBe(b.metalWeightG);
  });
});
