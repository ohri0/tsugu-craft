// 流れる模様のための、省ける値（2026-11-08 回 2）：鋳た塊の樹枝のむら・叩くときの打ちむら・削る面のうねり・色の濃淡。
// どれも 0 や無いときは前の絵と同じ（保存した見込みの絵の指紋は scripts/pattern-fingerprint.ts でも確かめた）。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSim, carveDepth, dendriteConc, dendriteCoord, surface, surfaceImage, undent, unswell, type PatternOp } from "../src/rebuild/pattern-sim";
import { opWords, parsePattern, patternPrompt, toPatternOps } from "../src/rebuild/pattern-tools";

const M = ["steel_light", "steel_dark"] as ("steel_light" | "steel_dark")[];
const DEND: PatternOp = { op: "ingot", metals: M, cells: 20, form: "dendrite" };
const CELLS: PatternOp = { op: "ingot", metals: M, cells: 20 };
const tail: PatternOp[] = [{ op: "grind", depth: 0.1 }, { op: "color", kind: "etch" }];
const forge = (uneven?: number): PatternOp[] => [
  { op: "forge_thin", ratio: 2, direction: "length", ...(uneven !== undefined ? { uneven } : {}) },
  { op: "forge_thin", ratio: 6, direction: "length", ...(uneven !== undefined ? { uneven } : {}) },
];
const same = (a: Float32Array, b: Float32Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const diffShare = (a: Float32Array, b: Float32Array) => a.reduce((n, v, i) => n + (Math.floor(v) !== Math.floor(b[i]) ? 1 : 0), 0) / a.length;
function changes(l: Uint16Array, n: number, dx: number, dy: number): number {
  let c = 0;
  for (let j = 0; j < n - dy; j++) for (let i = 0; i < n - dx; i++) if (l[j * n + i] !== l[(j + dy) * n + i + dx]) c++;
  return c;
}

describe("鋳た塊の樹枝のむら（ingot の dendrite）", () => {
  it("濃さは 0〜1 の切れ目のない値（となりの点との差が小さい）。同じたねなら同じ", () => {
    const ing = { cells: 20, seed: 3 };
    let maxStep = 0;
    let prev = dendriteConc(ing, 0, 0.4, 0.5);
    for (let k = 1; k <= 400; k++) {
      const c = dendriteConc(ing, k / 4000, 0.4, 0.5);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
      maxStep = Math.max(maxStep, Math.abs(c - prev));
      prev = c;
    }
    expect(maxStep).toBeLessThan(0.1);
    expect(dendriteConc(ing, 0.3, 0.6, 0.2)).toBe(dendriteConc(ing, 0.3, 0.6, 0.2));
    const s = dendriteCoord({ ...ing, cut: 0.5 }, 0.3, 0.6, 0.2);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(2);
  });

  it("明るい帯の割合は、決めた割合（仮 0.45）のあたり。知らせは「枝が重なった、切れ目のない濃さのむら」", () => {
    const sim = buildSim([DEND, { op: "color", kind: "etch" }]);
    const s = surface(sim, 96);
    const light = s.layer.reduce((a, v) => a + (v === 0 ? 1 : 0), 0) / s.layer.length;
    expect(light).toBeGreaterThan(0.25);
    expect(light).toBeLessThan(0.65);
    expect(sim.notes.join("")).toMatch(/切れ目のない濃さ/);
  });

  it("長さの向きにのばすと、むらは長さの向きにのびる", () => {
    const n = 128;
    const cast = surface(buildSim([DEND, ...tail]), n);
    const long = surface(buildSim([DEND, ...forge(), ...tail]), n);
    const ratio = (l: Uint16Array) => changes(l, n, 1, 0) / Math.max(1, changes(l, n, 0, 1));
    expect(ratio(long.layer)).toBeGreaterThan(ratio(cast.layer) * 2);
  });

  it("form が無ければ、前の網目（cells）と同じ絵", () => {
    const a = surface(buildSim([CELLS, ...forge(), ...tail]), 64);
    const b = surface(buildSim([{ ...CELLS, form: "cells" } as PatternOp, ...forge(), ...tail]), 64);
    expect(same(a.s, b.s)).toBe(true);
  });
});

describe("叩くときの打ちむら（forge_thin の uneven）", () => {
  it("むら 0 や無いときは、前と同じ絵（むらを足しても、ほかの値は変わらない）", () => {
    const plain = surface(buildSim([DEND, ...forge(), ...tail]), 64);
    expect(same(plain.s, surface(buildSim([DEND, ...forge(0), ...tail]), 64).s)).toBe(true);
    const st = surface(buildSim([{ op: "stack", metals: ["copper", "silver"], count: 16 }, { op: "bond", quality: "good" }, { op: "forge_thin", ratio: 4, direction: "both", uneven: 0 }, { op: "grind", depth: 0.3 }]), 48);
    const st0 = surface(buildSim([{ op: "stack", metals: ["copper", "silver"], count: 16 }, { op: "bond", quality: "good" }, { op: "forge_thin", ratio: 4, direction: "both" }, { op: "grind", depth: 0.3 }]), 48);
    expect(same(st.s, st0.s)).toBe(true);
  });

  it("むらがあると、削った表の模様が変わり、同じたねなら同じ。知らせにも出る", () => {
    const plain = surface(buildSim([DEND, ...forge(), ...tail]), 64);
    const sim = buildSim([DEND, ...forge(0.2), ...tail]);
    const a = surface(sim, 64);
    expect(diffShare(plain.s, a.s)).toBeGreaterThan(0.1);
    expect(same(a.s, surface(buildSim([DEND, ...forge(0.2), ...tail]), 64).s)).toBe(true);
    expect(sim.notes.join("")).toMatch(/打ちむら/);
  });

  it("重ねた層（木目金）でも、打ちむらのあとに削ると、まっすぐな層の切り口でなく輪になる（色の変わり目が増える）", () => {
    const base = (u?: number): PatternOp[] => [
      { op: "stack", metals: ["copper", "silver"], count: 16 },
      { op: "bond", quality: "good" },
      { op: "forge_thin", ratio: 4, direction: "both", ...(u ? { uneven: u } : {}) },
      // 5 枚目の層の真ん中で止まる深さ（平らなら、ほぼ 1 色）
      { op: "grind", depth: 0.28 },
    ];
    const n = 96;
    const flat = surface(buildSim(base()), n);
    const dent = surface(buildSim(base(0.3)), n);
    expect(changes(dent.layer, n, 1, 0) + changes(dent.layer, n, 0, 1)).toBeGreaterThan(2 * (changes(flat.layer, n, 1, 0) + changes(flat.layer, n, 0, 1)));
  });

  it("undent：深さ 0 なら動かない。打った所の真ん中では層が上下にずれる。表と裏のごく近くは動かない", () => {
    const d = [{ x: 0.5, y: 0.5, r: 0.1, s: 1 }];
    expect(undent(d, 0, 0.5, 0.5, 0.4)).toEqual([0.5, 0.5, 0.4]);
    const [, , u] = undent(d, 0.2, 0.5, 0.5, 0.5);
    expect(u).toBeCloseTo(0.3, 5);
    expect(undent(d, 0.2, 0.5, 0.5, 0)[2]).toBe(0);
  });
});

describe("削る面のうねり（grind の wave）と色の濃淡（color の graded）", () => {
  it("うねり 0 や無いときは前と同じ。うねりがあると変わる", () => {
    const a = surface(buildSim([DEND, ...forge(), { op: "grind", depth: 0.1 }]), 64);
    const b = surface(buildSim([DEND, ...forge(), { op: "grind", depth: 0.1, wave: 0 }]), 64);
    const c = surface(buildSim([DEND, ...forge(), { op: "grind", depth: 0.1, wave: 0.1 }]), 64);
    expect(same(a.s, b.s)).toBe(true);
    expect(diffShare(a.s, c.s)).toBeGreaterThan(0.05);
  });

  it("濃淡を入れると、2 色の間の明るさが増える。樹枝のむらでないときは使わず、そう知らせる", () => {
    const lum = (graded?: number) => {
      const im = surfaceImage(buildSim([DEND, ...forge(), { op: "grind", depth: 0.1 }, { op: "color", kind: "etch", ...(graded ? { graded } : {}) }]), 64);
      const v: number[] = [];
      for (let k = 0; k < im.data.length; k += 4) v.push(0.3 * im.data[k] + 0.59 * im.data[k + 1] + 0.11 * im.data[k + 2]);
      const lo = Math.min(...v);
      const hi = Math.max(...v);
      return v.filter((x) => x > lo + 0.3 * (hi - lo) && x < hi - 0.3 * (hi - lo)).length / v.length;
    };
    expect(lum(0.8)).toBeGreaterThan(lum() + 0.05);
    const st = buildSim([{ op: "stack", metals: ["copper", "silver"], count: 8 }, { op: "grind", depth: 0.2 }, { op: "color", kind: "patina", graded: 0.8 }]);
    expect(st.graded).toBe(0);
    expect(st.notes.join("")).toMatch(/濃淡は、鋳た塊の樹枝のむら/);
  });
});

describe("道具の値（省ける。0・- なら前のまま）", () => {
  const op = (o: Record<string, unknown>) => ({ step: 1, why: "w", assumed: "", metals: [], amount: 0, size: 0, across: 0, count: 0, thickness: [], choice: "-", ...o });
  const input = (ops: Record<string, unknown>[]) => ({
    applicable: true,
    reason: "r",
    look: [],
    ground_metal: "steel_dark",
    ground_color: "黒",
    shown_metals: ["steel_dark", "steel_light"],
    ops,
    cannot_show: "",
    summary: "s",
  });

  it("ingot の dendrite・forge_thin と grind の size・color の amount が、計算の値になる（範囲の外はおさめる）", () => {
    const r = parsePattern(
      input([
        op({ op: "ingot", metals: M, amount: 20, choice: "dendrite" }),
        op({ op: "forge_thin", amount: 6, choice: "length", size: 0.9 }),
        op({ op: "grind", amount: 0.1, size: 0.05 }),
        op({ op: "color", choice: "etch", amount: 0.7 }),
      ]),
      { steps: 3 },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ops = toPatternOps(r.value);
    expect(ops[0]).toMatchObject({ op: "ingot", form: "dendrite" });
    expect(ops[1]).toMatchObject({ op: "forge_thin", uneven: 0.4 });
    expect(ops[2]).toMatchObject({ op: "grind", wave: 0.05 });
    expect(ops[3]).toMatchObject({ op: "color", graded: 0.7 });
    expect(r.warnings?.join("")).toMatch(/0\.9 は範囲/);
    expect(opWords(r.value.ops[1])).toMatch(/打ちむら/);
    expect(opWords(r.value.ops[0])).toMatch(/枝のすき間/);
  });

  it("前の記録の形（size 0・choice -・color の amount 0）では、新しい値は入らない", () => {
    const r = parsePattern(
      input([op({ op: "ingot", metals: M, amount: 20 }), op({ op: "forge_thin", amount: 6, choice: "length" }), op({ op: "grind", amount: 0.1 }), op({ op: "color", choice: "etch" })]),
      { steps: 3 },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(toPatternOps(r.value)).toEqual([
      { op: "ingot", metals: M, cells: 20 },
      { op: "forge_thin", ratio: 6, direction: "length" },
      { op: "grind", depth: 0.1 },
      { op: "color", kind: "etch" },
    ]);
  });

  it("指示には流れる模様の値の言い方が入り、指示と帳面（ウーツ鋼）をあわせても 40,000 字より少ない", () => {
    const p = patternPrompt();
    expect(p).toContain("木目のように流れる");
    expect(p).toContain("dendrite");
    expect(p.length + readFileSync("ledger/wootz.json", "utf8").length).toBeLessThan(40_000);
  });
});

describe("大きな打ちと曲げ（forge_thin の swell）・面のうねりの数（grind の ripples）・段を品物全体の数で（2026-11-08 回 3）", () => {
  const layered = (o: { swell?: number; uneven?: number } = {}): PatternOp[] => [
    { op: "stack", metals: ["copper", "silver"], count: 16 },
    { op: "bond", quality: "good" },
    { op: "forge_thin", ratio: 4, direction: "both", uneven: o.uneven ?? 0.3, ...(o.swell ? { swell: o.swell } : {}) },
    { op: "grind", depth: 0.28 },
  ];
  /** 8×8 の区切りごとの、層の番号の平均のばらつき（大きなうねりがあると、区切りごとに出る層が大きくちがう） */
  const blockSpread = (l: Uint16Array, n: number) => {
    const b = n / 8;
    const means: number[] = [];
    for (let J = 0; J < 8; J++)
      for (let I = 0; I < 8; I++) {
        let s = 0;
        for (let j = 0; j < b; j++) for (let i = 0; i < b; i++) s += l[(J * b + j) * n + I * b + i];
        means.push(s / (b * b));
      }
    const m = means.reduce((a, v) => a + v, 0) / means.length;
    return means.reduce((a, v) => a + (v - m) ** 2, 0) / means.length;
  };

  it("swell が無い・0 なら前と同じ絵。打ちむら（uneven）が 0 なら swell は使わず、そう知らせる", () => {
    const a = surface(buildSim([DEND, ...forge(0.2), ...tail]), 48);
    const b = surface(buildSim([DEND, { ...forge(0.2)[0], swell: 0 } as PatternOp, ...forge(0.2).slice(1), ...tail]), 48);
    expect(same(a.s, b.s)).toBe(true);
    const plain = surface(buildSim([DEND, ...forge(), ...tail]), 48);
    const sim = buildSim([DEND, { ...forge()[0], swell: 3 } as PatternOp, ...forge().slice(1), ...tail]);
    expect(same(plain.s, surface(sim, 48).s)).toBe(true);
    expect(sim.notes.join("")).toMatch(/打ちむらの深さ（uneven）が 0/);
  });

  it("大きな打ちがあると、小さな打ちだけのときより、大きな広さで出る層がちがう（大きな輪・目）。知らせにも出る", () => {
    const n = 96;
    const small = surface(buildSim(layered()), n);
    const sim = buildSim(layered({ swell: 2 }));
    const big = surface(sim, n);
    expect(blockSpread(big.layer, n)).toBeGreaterThan(2 * blockSpread(small.layer, n));
    expect(sim.notes.join("")).toMatch(/大きな打ちと曲げ/);
  });

  it("unswell：深さ 0 なら動かない。真ん中では層が上下にずれる。長さの向きに長い（同じ割合の所で同じずれ）", () => {
    const d = [{ x: 0.5, y: 0.5, r: 0.2, ry: 0.4, s: 1 }];
    expect(unswell(d, 0, 0.5, 0.5, 0.4)).toEqual([0.5, 0.5, 0.4]);
    expect(unswell(d, 0.2, 0.5, 0.5, 0.5)[2]).toBeCloseTo(0.3, 5);
    expect(unswell(d, 0.2, 0.7, 0.5, 0.5)[2]).toBeCloseTo(unswell(d, 0.2, 0.5, 0.9, 0.5)[2], 9);
  });

  it("grind の ripples：無ければ前と同じ。あれば面のうねりが変わる", () => {
    const g = (o: object) => surface(buildSim([DEND, ...forge(), { op: "grind", depth: 0.1, wave: 0.1, ...o }]), 48);
    expect(same(g({}).s, g({ ripples: 0 }).s)).toBe(true);
    expect(diffShare(g({}).s, g({ ripples: 4 }).s)).toBeGreaterThan(0.05);
  });

  it("carve の lines を count で刻むと、板の長さの中に count 本（長さ 8 の板に 40 本なら、幅の中に 5 本）", () => {
    const op = { op: "carve" as const, side: "top" as const, shape: "lines" as const, depth: 0.3, size: 0.01, across: 1, count: 40 };
    let grooves = 0;
    let inG = false;
    for (let k = 0; k < 4000; k++) {
      const d = carveDepth(op, 0.5, (k + 0.5) / 4000, 3, 8);
      if (d > 0.05 && !inG) grooves++;
      inG = d > 0.05;
    }
    expect(grooves).toBeGreaterThanOrEqual(4);
    expect(grooves).toBeLessThanOrEqual(6);
  });

  it("道具の値：forge_thin と grind の across が swell・ripples になり、carve の lines は count を使える", () => {
    const op = (o: Record<string, unknown>) => ({ step: 1, why: "w", assumed: "", metals: [], amount: 0, size: 0, across: 0, count: 0, thickness: [], choice: "-", ...o });
    const r = parsePattern(
      {
        applicable: true,
        reason: "r",
        look: [],
        ground_metal: "steel_dark",
        ground_color: "黒",
        shown_metals: ["steel_dark", "steel_light"],
        ops: [
          op({ op: "ingot", metals: M, amount: 20, choice: "dendrite" }),
          op({ op: "forge_thin", amount: 6, choice: "length", size: 0.2, across: 3 }),
          op({ op: "carve", amount: 0.2, size: 0.01, count: 40, choice: "lines" }),
          op({ op: "flatten" }),
          op({ op: "grind", amount: 0.1, size: 0.1, across: 9 }),
        ],
        cannot_show: "",
        summary: "s",
      },
      { steps: 3 },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ops = toPatternOps(r.value);
    expect(ops[1]).toMatchObject({ op: "forge_thin", uneven: 0.2, swell: 3 });
    expect(ops[2]).toMatchObject({ op: "carve", shape: "lines", count: 40 });
    expect(ops[4]).toMatchObject({ op: "grind", wave: 0.1, ripples: 6 });
    expect(opWords(r.value.ops[1])).toMatch(/大きな打ち・曲げ/);
  });
});

describe("溝を手の槌でふさぐ（flatten の打ちむら）・細かさと流れを分けて選ぶ指示（2026-11-08 回 4）", () => {
  const LADDER = (flat: PatternOp): PatternOp[] => [
    { op: "ingot", metals: M, cells: 20, form: "dendrite" },
    { op: "forge_thin", ratio: 8, direction: "length", uneven: 0.2, swell: 3 },
    { op: "carve", side: "top", shape: "lines", depth: 0.3, size: 0.008, across: 1, count: 40 },
    flat,
    { op: "grind", depth: 0.3, wave: 0.1, ripples: 3 },
    { op: "color", kind: "etch" },
  ];
  /** 横 1 行ずつの、層の番号の平均（まっすぐな横のつなぎ目があると、となりの行と急にちがう行が出る） */
  const rowJump = (l: Uint16Array, n: number) => {
    const m = Array.from({ length: n }, (_, j) => l.slice(j * n, (j + 1) * n).reduce((a, v) => a + v, 0) / n);
    let max = 0;
    for (let j = 1; j < n; j++) max = Math.max(max, Math.abs(m[j] - m[j - 1]));
    return max;
  };

  it("flatten に打ちむらが無い・0 なら前と同じ絵（溝もそのまま）", () => {
    const a = surface(buildSim(LADDER({ op: "flatten" })), 64);
    const b = surface(buildSim(LADDER({ op: "flatten", uneven: 0, swell: 0 })), 64);
    expect(same(a.s, b.s)).toBe(true);
  });

  it("溝のあとに打ちむらのある槌で平らにすると、溝はなだらかにたわみ、まっすぐな横のつなぎ目が消える", () => {
    const n = 128;
    const sharp = buildSim(LADDER({ op: "flatten" }));
    const soft = buildSim(LADDER({ op: "flatten", uneven: 0.2, swell: 3 }));
    expect(sharp.stages.find((s) => s.op.op === "carve")!.sag).toBeFalsy();
    expect(soft.stages.find((s) => s.op.op === "carve")!.sag).toBe(true);
    expect(rowJump(surface(soft, n).layer, n)).toBeLessThan(rowJump(surface(sharp, n).layer, n));
    expect(soft.notes.join("")).toMatch(/打ちむら/);
  });

  it("carveDepth の sag：溝の下のたわみの幅が、溝の間に対する割合（仮）まで広がる。深さは同じ", () => {
    const op = { op: "carve" as const, side: "top" as const, shape: "lines" as const, depth: 0.3, size: 0.005, across: 5 };
    const width = (sag: boolean) => {
      let w = 0;
      for (let k = 0; k < 2000; k++) if (carveDepth(op, 0.5, k / 2000, 3, 1, sag) > 0.01) w++;
      return w;
    };
    expect(width(true)).toBeGreaterThan(3 * width(false));
    let peak = 0;
    for (let k = 0; k < 2000; k++) peak = Math.max(peak, carveDepth(op, 0.5, k / 2000, 3, 1, true));
    expect(peak).toBeLessThan(0.3 * 1.2);
  });

  it("道具の値：flatten の size・across が打ちむら・大きな打ちになる。指示に細かさと流れの言い方が入る", () => {
    const op = (o: Record<string, unknown>) => ({ step: 1, why: "w", assumed: "", metals: [], amount: 0, size: 0, across: 0, count: 0, thickness: [], choice: "-", ...o });
    const r = parsePattern(
      {
        applicable: true,
        reason: "r",
        look: [],
        ground_metal: "steel_dark",
        ground_color: "黒",
        shown_metals: ["steel_dark", "steel_light"],
        ops: [op({ op: "ingot", metals: M, amount: 30, choice: "dendrite" }), op({ op: "flatten", size: 0.2, across: 3 }), op({ op: "flatten" }), op({ op: "grind", amount: 0.1 })],
        cannot_show: "",
        summary: "s",
      },
      { steps: 3 },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ops = toPatternOps(r.value);
    expect(ops[1]).toEqual({ op: "flatten", uneven: 0.2, swell: 3 });
    expect(ops[2]).toEqual({ op: "flatten" });
    expect(opWords(r.value.ops[1])).toMatch(/打ちむら/);
    expect(opWords(r.value.ops[2])).toBe("叩いて平らにする");
    const p = patternPrompt();
    expect(p).toContain("細かさと流れは別の値");
    expect(p).toContain("まっすぐな細いつなぎ目");
  });
});

describe("熱して叩くのをくり返す（forge_thin・flatten の heats。2026-11-08 回 6）", () => {
  const op = (o: Record<string, unknown>) => ({ step: 1, why: "w", assumed: "", metals: [], amount: 0, size: 0, across: 0, count: 0, thickness: [], choice: "-", ...o });
  const withHeats = (h?: number, uneven = 0.2): PatternOp[] => [
    { op: "forge_thin", ratio: 6, direction: "length", uneven, swell: 3, ...(h !== undefined ? { heats: h } : {}) },
  ];

  it("heats が無い・1 なら前と同じ絵。打ちむらが 0 なら使わず、そう知らせる", () => {
    const a = surface(buildSim([DEND, ...withHeats(), ...tail]), 48);
    expect(same(a.s, surface(buildSim([DEND, ...withHeats(1), ...tail]), 48).s)).toBe(true);
    const sim = buildSim([DEND, ...withHeats(4, 0), ...tail]);
    expect(same(surface(buildSim([DEND, ...withHeats(undefined, 0), ...tail]), 48).s, surface(sim, 48).s)).toBe(true);
    expect(sim.notes.join("")).toMatch(/熱して叩くくり返し（heats）は、打ちむらの深さ（uneven）が 0/);
  });

  it("くり返すと、1 回目の打ちはそのままで、あとの回ほど小さく浅い打ちが多く重なる。絵も変わり、知らせに出る", () => {
    const one = buildSim([DEND, ...withHeats(), ...tail]);
    const four = buildSim([DEND, ...withHeats(4), ...tail]);
    const d1 = one.stages[0].dents!;
    const d4 = four.stages[0].dents!;
    expect(d4.slice(0, d1.length)).toEqual(d1);
    expect(d4.length).toBeGreaterThan(3 * d1.length);
    const late = d4.slice(d1.length);
    const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
    expect(mean(late.map((d) => d.r))).toBeLessThan(mean(d1.map((d) => d.r)));
    expect(late.every((d) => d.a! > 0 && d.a! < 1)).toBe(true);
    expect(diffShare(surface(one, 64).s, surface(four, 64).s)).toBeGreaterThan(0.02);
    expect(four.notes.join("")).toMatch(/熱して叩くくり返しは/);
  });

  it("undent：a があれば、そのぶんだけ小さくずれる（無ければ前のまま）", () => {
    const d = { x: 0.5, y: 0.5, r: 0.2, s: 1 };
    expect(undent([d], 0.2, 0.5, 0.5, 0.5)[2]).toBeCloseTo(0.3, 9);
    expect(undent([{ ...d, a: 0.5 }], 0.2, 0.5, 0.5, 0.5)[2]).toBeCloseTo(0.4, 9);
  });

  it("道具の値：forge_thin・flatten の count がくり返しの回数になる（1 なら無し）。言い方と指示にも出る", () => {
    const r = parsePattern(
      {
        applicable: true,
        reason: "r",
        look: [],
        ground_metal: "steel_dark",
        ground_color: "黒",
        shown_metals: ["steel_dark", "steel_light"],
        ops: [
          op({ op: "ingot", metals: M, amount: 30, choice: "dendrite" }),
          op({ op: "forge_thin", amount: 6, size: 0.2, across: 3, count: 5, choice: "length" }),
          op({ op: "forge_thin", amount: 2, size: 0.2, count: 1, choice: "length" }),
          op({ op: "flatten", size: 0.15, count: 3 }),
          op({ op: "grind", amount: 0.1 }),
        ],
        cannot_show: "",
        summary: "s",
      },
      { steps: 3 },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ops = toPatternOps(r.value);
    expect(ops[1]).toEqual({ op: "forge_thin", ratio: 6, direction: "length", uneven: 0.2, swell: 3, heats: 5 });
    expect(ops[2]).toEqual({ op: "forge_thin", ratio: 2, direction: "length", uneven: 0.2 });
    expect(ops[3]).toEqual({ op: "flatten", uneven: 0.15, heats: 3 });
    expect(opWords(r.value.ops[1])).toMatch(/熱して叩くのを 5 回くり返す/);
    expect(r.warnings ?? []).not.toContainEqual(expect.stringMatching(/count（板全体の数）は使わない/));
    expect(patternPrompt()).toContain("熱して叩くのをくり返す回数");
  });
});
