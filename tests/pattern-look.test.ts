// 模様の見込みの絵を、きれいに・自然に描くための関数（2026-11-07 の見直し）と、重ねない技の計算（src/rebuild/pattern-relief.ts）
import { describe, expect, it } from "vitest";
import { carveDepth, diskToSquare, footprint, layerRamp, pressBack, rampColor, squareToDisk, surface, buildSim, untwist, bandRows, surfaceImageAsync, type PatternOp } from "../src/rebuild/pattern-sim";
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
      // ねじらなければ、横の位置はそのまま。深さは真ん中へ寄る（叩いて、出っぱった角が表の薄い皮に押しこまれる）が、表と裏と真ん中はそのまま
      const [a, b] = untwist(x, y, 0);
      expect(a).toBeCloseTo(x, 4);
      expect(Math.sign(b)).toBe(Math.sign(y));
      expect(Math.abs(b)).toBeLessThanOrEqual(Math.abs(y) + 1e-9);
    }
    expect(untwist(0.2, 1, 0)[1]).toBeCloseTo(1, 4);
    expect(untwist(0.2, -1, 0)[1]).toBeCloseTo(-1, 4);
    // 半回りで、真ん中を通る点は反対へ
    const [a, b] = untwist(0.4, 0, Math.PI);
    expect(a).toBeCloseTo(-0.4, 3);
    expect(b).toBeCloseTo(0, 3);
  });
  it("回った四角を押しもどす：回さなければそのまま、45 度回すと、四角のふちの点は回った四角の角から来る", () => {
    for (const [x, z] of [[0.3, -0.7], [-0.9, 0.2]]) {
      const [a, b] = pressBack(x, z, 0);
      expect(a).toBeCloseTo(x, 6);
      expect(b).toBeCloseTo(z, 6);
    }
    // 45 度：左のふちの点は、どの深さでも、もとの四角の 1 つの角（層が 1 点に集まる。星の先）
    const c1 = pressBack(-1, -0.5, Math.PI / 4);
    const c2 = pressBack(-1, 0.5, Math.PI / 4);
    expect(Math.hypot(c1[0] - c2[0], c1[1] - c2[1])).toBeLessThan(1e-6);
    expect(Math.abs(c1[0]) + Math.abs(c1[1])).toBeCloseTo(2, 4);
  });
  const changes = (s: ReturnType<typeof surface>, rows: boolean, from: number, to: number) => {
    const n = s.n;
    let c = 0;
    for (let a = Math.floor(from * n); a < Math.floor(to * n); a++) {
      for (let b = 1; b < n; b++) {
        const p = rows ? s.layer[a * n + b] : s.layer[b * n + a];
        const q = rows ? s.layer[a * n + b - 1] : s.layer[(b - 1) * n + a];
        if (p !== q) c++;
      }
    }
    return c;
  };
  it("四角い棒をねじって平たくして削ると、棒のふちに層が集まる星の先が、半回りごとに出る", () => {
    const s = surface(buildSim([{ op: "stack", metals: ["iron", "light"], count: 16 }, { op: "bond", quality: "good" }, { op: "twist", turns: 3 }, { op: "flatten" }, { op: "grind", depth: 0.3 }]), 128);
    // ふちの列（星の先）は、真ん中の列（入れ子の形のまん中）より、ずっと多く層が入れ替わる
    expect(changes(s, false, 0, 0.08)).toBeGreaterThan(changes(s, false, 0.46, 0.54) * 4);
  });
  it("長さの向きにのばすと、層の波打ちは、のばした向きに長い筋になる（まるいまだらにならない）", () => {
    const ops = (direction: "length" | "both"): PatternOp[] => [
      { op: "stack", metals: ["steel_dark", "steel_light"], count: 8 },
      { op: "bond", quality: "good" },
      { op: "fold", times: 3 },
      { op: "forge_thin", ratio: 2, direction },
      { op: "grind", depth: 0.1 },
    ];
    const len = surface(buildSim(ops("length")), 128);
    // 横に見ると線を何本も横切り、縦（のばした向き）に見ると、ほとんど横切らない
    expect(changes(len, true, 0, 1)).toBeGreaterThan(changes(len, false, 0, 1) * 3);
    const both = surface(buildSim(ops("both")), 128);
    expect(changes(both, true, 0, 1)).toBeLessThan(changes(both, false, 0, 1) * 2);
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
  it("片切彫り：鋭い壁は片側だけ。斜めの面は、左上からの光を受ける側（横の線なら下）にある", () => {
    const r = buildRelief([{ op: "plate", metal: "silver" }, { op: "engrave", style: "katakiri", path: "straight", depth: 0.3, size: 0.01, across: 4 }], 5);
    let ymax = 0;
    let cmax = 0;
    for (let y = 0.02; y < 0.23; y += 0.0002) {
      const c = pointAt(r, 0.5, y).cut;
      if (c > cmax) {
        cmax = c;
        ymax = y;
      }
    }
    expect(cmax).toBeGreaterThan(0.2);
    // 下（光を受ける面）は浅くなりながら続き、上（壁の外）は、もう彫っていない
    expect(pointAt(r, 0.5, ymax + 0.008).cut).toBeGreaterThan(0);
    expect(pointAt(r, 0.5, ymax - 0.004).cut).toBe(0);
  });
  it("唐草の道すじ：つるの波に、巻いた先と葉がつく。散らした草は、透かしの穴をよける", () => {
    // つる・渦・葉のどれかが、列の中のあちこちにある
    let near = 0;
    for (let y = 0.05; y < 0.95; y += 0.01) for (let x = 0.05; x < 0.95; x += 0.01) if (pathHit("scroll", 3, x, y, 1).d < 0.01) near++;
    expect(near).toBeGreaterThan(300);
    // 草：穴にかかる株は置きなおすので、彫った所のすぐそばに穴は無い
    const g = buildRelief([{ op: "plate", metal: "silver" }, { op: "sukashi", shape: "petals", size: 0.08, across: 4 }, { op: "engrave", style: "katakiri", path: "scatter", depth: 0.2, size: 0.01, across: 12 }], 7);
    let cuts = 0;
    for (let y = 0.1; y < 0.9; y += 0.004) {
      for (let x = 0.1; x < 0.9; x += 0.004) {
        if (pointAt(g, x, y).cut > 0) {
          cuts++;
          expect(pointAt(g, x + 0.006, y).hole || pointAt(g, x - 0.006, y).hole).toBe(false);
        }
      }
    }
    expect(cuts).toBeGreaterThan(50);
  });
  it("打ち出しの花びらと葉は、形のあるふくらみになる（同じたねなら同じ）", () => {
    for (const shape of ["petals", "leaves"] as const) {
      const r = buildRelief([{ op: "plate", metal: "copper" }, { op: "uchidashi", shape, height: 0.2, size: 0.06, across: 3 }], 4);
      let up = 0;
      let all = 0;
      for (let y = 0.1; y < 0.9; y += 0.01) {
        for (let x = 0.1; x < 0.9; x += 0.01) {
          all++;
          if (pointAt(r, x, y).bend > 0.05) up++;
        }
      }
      // ふくらんだ所と平らな地の両方がある
      expect(up / all).toBeGreaterThan(0.08);
      expect(up / all).toBeLessThan(0.7);
      expect(pointAt(r, 0.37, 0.41)).toEqual(pointAt(buildRelief(r.ops, 4), 0.37, 0.41));
    }
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
