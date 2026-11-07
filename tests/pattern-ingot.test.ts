// 重ねずに、1 つの鋳た塊の中のむらから始める操作（ingot。2026-11-08）。
// ダマスカス鋼（ウーツ鋼）のように、模様が「重ねた層」ではなく「塊の中のむらが叩いてのばされた帯」から出る技のため。
import { describe, expect, it } from "vitest";
import { buildSim, ingotCoord, section, surface, type PatternOp } from "../src/rebuild/pattern-sim";
import { modelOf } from "../src/rebuild/pattern-model";
import { opWords, parsePattern, patternPrompt, toPatternOps } from "../src/rebuild/pattern-tools";

const INGOT: PatternOp = { op: "ingot", metals: ["steel_light", "steel_dark"], cells: 40 };
const FORGED: PatternOp[] = [INGOT, { op: "forge_thin", ratio: 12, direction: "both" }, { op: "forge_thin", ratio: 8, direction: "length" }, { op: "grind", depth: 0.3 }, { op: "color", kind: "etch" }];

/** 網目（0 番）の割合 */
const share = (l: Uint16Array) => l.reduce((a, v) => a + (v === 0 ? 1 : 0), 0) / l.length;
/** となりと色が変わる所の数（dx, dy の向きに） */
function changes(l: Uint16Array, n: number, dx: number, dy: number): number {
  let c = 0;
  for (let j = 0; j < n - dy; j++) for (let i = 0; i < n - dx; i++) if (l[j * n + i] !== l[(j + dy) * n + i + dx]) c++;
  return c;
}

describe("鋳た塊の中のむら（ingot）", () => {
  it("網目の値は 0〜2 で、同じたねなら同じ。網目（0〜1）と地（1〜2）の両方が出る", () => {
    const ing = { cells: 20, seed: 3 };
    const vals: number[] = [];
    for (let k = 0; k < 400; k++) vals.push(ingotCoord(ing, (k % 20) / 20 + 0.013, Math.floor(k / 20) / 20 + 0.007, 0.37));
    expect(vals.every((v) => v >= 0 && v < 2)).toBe(true);
    expect(vals.some((v) => v < 1)).toBe(true);
    expect(vals.some((v) => v >= 1)).toBe(true);
    expect(ingotCoord(ing, 0.31, 0.62, 0.4)).toBe(ingotCoord(ing, 0.31, 0.62, 0.4));
  });

  it("1 つの塊なので、層のはがれは無く、材料は網目と地の 2 つ。説の形の仮の見込みだと知らせる", () => {
    const sim = buildSim(FORGED);
    expect(sim.count).toBe(2);
    expect(sim.unbonded).toBe(0);
    expect(sim.ingot?.cells).toBe(40);
    expect(sim.notes.join("")).toMatch(/説の形/);
    expect(sim.notes.join("")).not.toMatch(/層をつなぐ手順/);
    const s = surface(sim, 96);
    expect(s.defect.every((v) => v === 0)).toBe(true);
    // 網目は地より少ない（明るい線が、暗い地の上に出る）
    expect(share(s.layer)).toBeGreaterThan(0.05);
    expect(share(s.layer)).toBeLessThan(0.5);
  });

  it("叩いて長さの向きにのばすと、網目は長さの向きにのびる（横切る向きの方が、色の変わり目が多い）", () => {
    const n = 128;
    const cast = surface(buildSim([INGOT, { op: "color", kind: "etch" }]), n);
    const long = surface(buildSim([INGOT, { op: "forge_thin", ratio: 12, direction: "length" }, { op: "color", kind: "etch" }]), n);
    const ratio = (l: Uint16Array) => changes(l, n, 1, 0) / Math.max(1, changes(l, n, 0, 1));
    expect(ratio(long.layer)).toBeGreaterThan(ratio(cast.layer) * 2);
    expect(buildSim([INGOT]).notes.join("")).toMatch(/網目のまま/);
  });

  it("溝を彫ってから平らにすると、溝の所だけ模様が変わる（はしごの段）", () => {
    const n = 96;
    const base: PatternOp[] = [INGOT, { op: "forge_thin", ratio: 12, direction: "both" }];
    const tail: PatternOp[] = [{ op: "grind", depth: 0.3 }, { op: "color", kind: "etch" }];
    const plain = surface(buildSim([...base, { op: "flatten" }, ...tail]), n);
    const ladder = surface(buildSim([...base, { op: "carve", side: "top", shape: "lines", depth: 0.3, size: 0.03, across: 6 }, { op: "flatten" }, ...tail]), n);
    let diff = 0;
    for (let k = 0; k < plain.layer.length; k++) if (plain.layer[k] !== ladder.layer[k]) diff++;
    expect(diff / plain.layer.length).toBeGreaterThan(0.02);
  });

  it("断面にも網目と地が出る", () => {
    const sec = section(buildSim(FORGED), 80, 40);
    expect(Array.from(sec.cells).some((v) => v === 0)).toBe(true);
    expect(Array.from(sec.cells).some((v) => v === 1)).toBe(true);
  });
});

describe("道具の ingot", () => {
  const raw = (ops: unknown[]) => ({ applicable: true, reason: "鋳た塊のむら", ops, cannot_show: "", summary: "見込み" });
  const op = (o: string, amount = 0, choice = "-", metals: string[] = []) => ({ op: o, step: 1, why: "", assumed: "仮", metals, amount, size: 0, across: 0, count: 0, thickness: [], choice });

  it("最初に ingot を受け取り、計算の操作にする。言い方に網目の数", () => {
    const r = parsePattern(raw([op("ingot", 30, "-", ["steel_light", "steel_dark"]), op("forge_thin", 6, "both"), op("color", 0, "etch")]), { steps: 3 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(toPatternOps(r.value)[0]).toEqual({ op: "ingot", metals: ["steel_light", "steel_dark"], cells: 30 });
    expect(opWords(r.value.ops[0])).toMatch(/鋳た塊.*30/);
    expect(modelOf(r.value).facts).toMatch(/鋳た塊/);
  });

  it("ingot は最初に 1 回だけ。範囲の外の網目の数はおさめる。板の飾りの操作とはまぜない", () => {
    expect(parsePattern(raw([op("stack", 4, "-", ["silver", "copper"]), op("ingot", 30, "-", ["steel_light", "steel_dark"])]), { steps: 2 }).ok).toBe(false);
    expect(parsePattern(raw([op("ingot", 30, "-", ["steel_light", "steel_dark"]), { ...op("kebori", 0.1, "straight"), size: 0.01, across: 3 }]), { steps: 2 }).ok).toBe(false);
    const big = parsePattern(raw([op("ingot", 500, "-", ["steel_light", "steel_dark"])]), { steps: 1 });
    expect(big.ok && big.value.ops[0].amount).toBe(60);
  });

  it("指示の文に ingot の説明がある（重ねていない物を stack で描かない）", () => {
    expect(patternPrompt()).toMatch(/ingot：stack の代わりに/);
    expect(patternPrompt()).toMatch(/重ねていない物を stack で描かないで/);
  });
});
