// 模様の見込みの絵を、きれいに・自然に描くための関数（2026-11-07 の見直し）と、重ねない技の計算（src/rebuild/pattern-relief.ts）
import { describe, expect, it } from "vitest";
import { carveDepth, diskToSquare, footprint, layerRamp, rampColor, squareToDisk, surface, buildSim, untwist, bandRows, surfaceImageAsync, type PatternOp } from "../src/rebuild/pattern-sim";
import { buildRelief, heightOf, pathHit, pointAt, reliefSectionImage, reliefTopAsync, topMat, type ReliefOp } from "../src/rebuild/pattern-relief";
import { parsePattern, patternContext, patternRequest, toReliefOps } from "../src/rebuild/pattern-tools";
import { modelOf, topImage } from "../src/rebuild/pattern-model";
import { PATTERN_VALUES } from "../src/rebuild/pattern-values";

const nop = async () => undefined;

describe("細い層をなめらかに描く", () => {
  const ramp = layerRamp([
    [0, 0, 0],
    [200, 100, 50],
    [0, 0, 0],
    [200, 100, 50],
  ]);
  it("幅が 0 なら、その層の色。幅があれば、またいだ層の色の平均", () => {
    const out = [0, 0, 0];
    rampColor(ramp, 1.5, 0, out);
    expect(out).toEqual([200, 100, 50]);
    rampColor(ramp, 2, 2, out);
    expect(out[0]).toBeCloseTo(100);
    rampColor(ramp, 1.25, 0.5, out);
    expect(out[0]).toBeCloseTo(200);
  });
  it("層の幅は、となりとの差の小さい方（層の番号が飛ぶさかいでは、ぼかさない）", () => {
    const S = new Float32Array([0, 1, 2, 30, 31]);
    expect(footprint(S, 5, 1, 1, 0)).toBeCloseTo(1);
    expect(footprint(S, 5, 1, 2, 0)).toBeCloseTo(1);
    expect(footprint(S, 5, 1, 3, 0)).toBeCloseTo(1);
    const air = new Float32Array([NaN, 4, NaN]);
    expect(footprint(air, 3, 1, 1, 0)).toBe(0);
  });
  it("帯だけ描くと、高さは帯の分。同じ所は、全体の絵と同じ色", async () => {
    const sim = buildSim([{ op: "stack", metals: ["shakudo", "silver"], count: 6 }, { op: "carve", side: "top", shape: "pits", depth: 0.5, size: 0.08, across: 4 }, { op: "flatten" }]);
    expect(bandRows(40, [0.25, 0.5])).toEqual([10, 20]);
    const all = (await surfaceImageAsync(sim, 40, 1, nop))!;
    const band = (await surfaceImageAsync(sim, 40, 1, nop, () => false, [0.25, 0.5]))!;
    expect(band.h).toBe(10);
    for (let k = 40 * 4 * 2; k < 40 * 4 * 8; k++) expect(band.data[k]).toBe(all.data[40 * 4 * 10 + k]);
  });
});

describe("手の仕事のばらつき", () => {
  const op = { op: "carve", side: "top", shape: "dots", depth: 0.5, size: 0.04, across: 6 } as const;
  it("決まった間の穴でも、穴ごとに少しずれる。同じたねなら同じ", () => {
    const centre = (i: number, j: number, seed: number) => {
      // 穴のまわりで、いちばん深い所を探す
      let best = { d: -1, x: 0, y: 0 };
      const a = 1 / 6;
      const cx = (i + 0.5 + (j % 2 ? 0.5 : 0)) * a;
      const cy = (j + 0.5) * a;
      for (let y = -0.4; y <= 0.4; y += 0.02) for (let x = -0.4; x <= 0.4; x += 0.02) {
        const d = carveDepth(op, cx + x * a, cy + y * a, seed);
        if (d > best.d) best = { d, x, y };
      }
      return best;
    };
    const a = centre(1, 2, 5);
    const b = centre(2, 2, 5);
    expect(a).toEqual(centre(1, 2, 5));
    expect(a.x !== b.x || a.y !== b.y || a.d !== b.d).toBe(true);
    // ずれは、間かくの 1 割ほどにおさまる
    for (const c of [a, b]) expect(Math.hypot(c.x, c.y)).toBeLessThanOrEqual(PATTERN_VALUES.handJitter.pos * Math.SQRT2 + 0.03);
  });
});

describe("ねじり・並べかえ", () => {
  it("四角と円の行き来は、もとにもどる。ねじらなければ、そのまま", () => {
    for (const [x, y] of [[0.3, -0.7], [-0.9, 0.2], [0.5, 0.5]]) {
      const [u, v] = squareToDisk(x, y);
      const [x2, y2] = diskToSquare(u, v);
      expect(x2).toBeCloseTo(x, 4);
      expect(y2).toBeCloseTo(y, 4);
      const [a, b] = untwist(x, y, 0);
      expect(a).toBeCloseTo(x, 4);
      expect(b).toBeCloseTo(y, 4);
    }
    // 半回りで、真ん中を通る点は反対へ
    const [a, b] = untwist(0.4, 0, Math.PI);
    expect(a).toBeCloseTo(-0.4, 3);
    expect(b).toBeCloseTo(0, 3);
  });
  it("横にして並べると、切った本数だけ、すべての層の縞がくり返す", () => {
    const base: PatternOp[] = [{ op: "stack", metals: ["dark", "light"], count: 8 }, { op: "bond", quality: "good" }];
    const stripes = (pieces: number) => {
      const s = surface(buildSim([...base, { op: "rearrange", mode: "edge_up", pieces }]), 256);
      let n = 0;
      for (let i = 1; i < 256; i++) if (s.layer[128 * 256 + i] !== s.layer[128 * 256 + i - 1]) n++;
      return n;
    };
    expect(stripes(8)).toBeGreaterThan(stripes(2) * 3);
  });
});

describe("前の案と試した結果を、見込みに添える", () => {
  const raw = {
    applicable: true,
    reason: "重ねて穴",
    ops: [
      { op: "stack", step: 1, why: "", assumed: "3 枚", metals: ["shakudo", "silver", "copper"], amount: 3, size: 0, across: 0, choice: "-" },
      { op: "carve", step: 2, why: "", assumed: "", metals: [], amount: 0.5, size: 0.04, across: 8, choice: "dots" },
    ],
    cannot_show: "",
    summary: "丸い目",
  };
  it("前の案の操作と仮の値、試した結果を、文に入れる", () => {
    const pr = parsePattern(raw, { steps: 2 });
    if (!pr.ok) throw new Error(pr.error);
    const step = { key: "s1", title: "浅く穴をあける", detail: "", clue_ids: [], basis: "prior" as const, confidence: 1 as const };
    const plan1 = { version: 1, steps: [step], summary: "案 1", pattern: { date: "2026-11-07", prediction: pr.value, notes: [] } } as never;
    const plan2 = { version: 2, steps: [step], summary: "案 2" } as never;
    const ctx = patternContext({ plans: [plan1, plan2], results: [{ id: "T1", stepKey: "s1", stepTitle: "浅く穴をあける", planVersion: 1, outcome: "ng", note: "赤が出ない", date: "2026-11-07" }] }, plan2);
    expect(ctx.prev?.version).toBe(1);
    const text = patternRequest("雨垂れ", plan2, (s) => s, ctx);
    expect(text).toContain("<prev>");
    expect(text).toContain("仮：3 枚");
    expect(text).toContain("だめだった。赤が出ない");
    // 前の案が無く、結果も無ければ、何も足さない
    expect(patternRequest("雨垂れ", plan2)).not.toContain("<prev>");
  });
});

describe("重ねない技：1 枚の板の表", () => {
  const P = (o: Partial<{ op: string; metals: string[]; amount: number; size: number; across: number; choice: string }> & { op: string }) => ({ step: 1, why: "", assumed: "", metals: [], amount: 0, size: 0, across: 0, choice: "-", ...o });
  it("plate から始まる答えを受け取り、操作をまぜたら断る", () => {
    const ok = parsePattern(
      { applicable: true, reason: "r", cannot_show: "", summary: "s", ops: [P({ op: "plate", metals: ["silver", "gold"] }), P({ op: "kebori", amount: 0.3, size: 0.005, across: 3, choice: "border" }), P({ op: "zogan", metals: ["gold"], size: 0.006, across: 4, choice: "wave" })] },
      { steps: 3 },
    );
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.value.ops[0].metals).toEqual(["silver"]);
    expect(toReliefOps(ok.value)[1]).toEqual({ op: "engrave", style: "kebori", path: "border", depth: 0.3, size: 0.005, across: 3 });
    const mixed = parsePattern({ applicable: true, reason: "r", cannot_show: "", summary: "s", ops: [P({ op: "plate", metals: ["silver"] }), P({ op: "fold", amount: 2 })] }, { steps: 3 });
    expect(mixed.ok).toBe(false);
  });
  const ops: ReliefOp[] = [
    { op: "plate", metal: "silver" },
    { op: "sukashi", shape: "circles", size: 0.08, across: 4 },
    { op: "zogan", metal: "gold", path: "straight", size: 0.01, across: 3 },
    { op: "granulate", metal: "gold", arrange: "scatter", size: 0.02, across: 5 },
    { op: "color", kind: "none" },
  ];
  it("透かすと穴、象嵌は別の金属で表と同じ高さ、粒は上にのる。同じたねなら同じ", () => {
    const r = buildRelief(ops, 3);
    expect(r.materials).toEqual(["silver", "gold"]);
    // 透かしの真ん中（ふちの残しの内側に 4 つ並ぶ格子の 1 つ目：0.09 + 0.82 / 8）
    expect(pointAt(r, 0.1925, 0.1925).hole).toBe(true);
    // ふちには開けない
    expect(pointAt(r, 0.02, 0.5).hole).toBe(false);
    let sawInlay = false;
    let sawGrain = false;
    for (let y = 0; y < 1; y += 0.01) {
      const p = pointAt(r, 0.5, y);
      if (p.fill > 0 && p.add === 0 && !p.hole) {
        sawInlay = true;
        expect(heightOf(p)).toBeCloseTo(0);
        expect(topMat(p)).toBe(1);
      }
      if (p.add > 0) sawGrain = true;
    }
    expect(sawInlay).toBe(true);
    for (let y = 0; y < 1 && !sawGrain; y += 0.003) for (let x = 0; x < 1 && !sawGrain; x += 0.01) sawGrain = pointAt(r, x, y).add > 0;
    expect(sawGrain).toBe(true);
    expect(pointAt(buildRelief(ops, 3), 0.31, 0.47)).toEqual(pointAt(r, 0.31, 0.47));
  });
  it("彫った線の道すじ：枠の線は、ふちから決まった所にある", () => {
    const h = pathHit("border", 1, 0.045, 0.5, 1);
    expect(h.d).toBeCloseTo(0, 5);
    expect(pathHit("straight", 4, 0.5, 0.25, 1).d).toBeGreaterThan(0.08);
  });
  it("絵の大きさ。板の飾りの答えは、板の計算で描く", async () => {
    const r = buildRelief(ops, 3);
    const top = (await reliefTopAsync(r, 24, 1, nop))!;
    expect(top.data.length).toBe(24 * 24 * 4);
    const sec = reliefSectionImage(r, 30, 12, 0.5, 2);
    expect(sec.data.length).toBe(30 * 12 * 4);
    const pred = { applicable: true, reason: "", cannot_show: "", summary: "", ops: [P({ op: "plate", metals: ["copper"] }), P({ op: "tsuchime", amount: 0.3, size: 0.05, choice: "round" })] } as never;
    const m = modelOf(pred, 7);
    expect(m.family).toBe("surface");
    expect((await topImage(m.stage(0), 8, 1)).w).toBe(8);
    expect(() => buildRelief([{ op: "color", kind: "none" }])).toThrow();
  });
});
