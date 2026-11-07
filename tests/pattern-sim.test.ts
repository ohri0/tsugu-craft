// どの技でも使える模様の見込み（src/rebuild/pattern-sim.ts）と、Claude の答えを確かめる関数（src/rebuild/pattern-tools.ts）
import { describe, expect, it } from "vitest";
import { isAllowedToolName } from "../src/claude/tools";
import { buildSim, fineness, metalsShown, section, surface, surfaceImage, AIR, type PatternOp } from "../src/rebuild/pattern-sim";
import { parsePattern, patternPrompt, patternRequest, PREDICT_PATTERN, readPatternRecord, toPatternOps } from "../src/rebuild/pattern-tools";
import { SYSTEM_MAX_CHARS } from "../src/claude/wire";
import { applyPlan, newProject, readProject, setPattern, addClue, type RestorationOutput } from "../src/rebuild/restore";

const STACK: PatternOp = { op: "stack", metals: ["steel_dark", "nickel"], count: 8 };
const same = (a: Uint16Array, b: Uint16Array) => a.every((v, i) => v === b[i]);

describe("模様の見込みの計算", () => {
  it("同じ操作と同じたねなら、同じ模様になる（たねが変わると変わる）", () => {
    const ops: PatternOp[] = [STACK, { op: "bond", quality: "good" }, { op: "carve", side: "top", shape: "pits", depth: 0.4, size: 0.06, across: 6 }, { op: "flatten" }, { op: "color", kind: "etch" }];
    const a = surface(buildSim(ops, 3), 48);
    const b = surface(buildSim(ops, 3), 48);
    const c = surface(buildSim(ops, 4), 48);
    expect(same(a.layer, b.layer)).toBe(true);
    expect(same(a.layer, c.layer)).toBe(false);
  });

  it("のばして切って重ねると、層が 2 倍ずつになり、断面の層の境が増える", () => {
    const flat = buildSim([STACK, { op: "bond", quality: "good" }]);
    const folded = buildSim([STACK, { op: "bond", quality: "good" }, { op: "fold", times: 2 }]);
    expect(flat.layersFinal).toBe(8);
    expect(folded.layersFinal).toBe(32);
    const edges = (s: ReturnType<typeof section>) => {
      let n = 0;
      for (let j = 1; j < s.h; j++) if (s.cells[j * s.w + 5] !== s.cells[(j - 1) * s.w + 5]) n++;
      return n;
    };
    expect(edges(section(folded, 20, 400))).toBeGreaterThan(edges(section(flat, 20, 400)) * 3);
  });

  it("ねじって削ると模様が変わり、ねじる回数でもちがう", () => {
    const base: PatternOp[] = [STACK, { op: "bond", quality: "good" }, { op: "fold", times: 2 }];
    const plain = surface(buildSim([...base, { op: "grind", depth: 0.4 }]), 64);
    const t2 = surface(buildSim([...base, { op: "twist", turns: 2 }, { op: "grind", depth: 0.4 }]), 64);
    const t5 = surface(buildSim([...base, { op: "twist", turns: 5 }, { op: "grind", depth: 0.4 }]), 64);
    expect(same(plain.layer, t2.layer)).toBe(false);
    expect(same(t2.layer, t5.layer)).toBe(false);
    expect(fineness(t5)).toBeGreaterThan(fineness(plain));
  });

  it("模様を出す手順がなければ、表は一つの色で、そう知らせる", () => {
    const sim = buildSim([STACK, { op: "bond", quality: "good" }, { op: "forge_thin", ratio: 2, direction: "length" }]);
    expect(metalsShown(sim, surface(sim, 40))).toBe(1);
    expect(sim.notes.join()).toContain("模様を出す手順");
  });

  it("裏から打ち出しただけでは模様が出ず、表を削ると出る", () => {
    const punch: PatternOp = { op: "carve", side: "back", shape: "pits", depth: 0.4, size: 0.08, across: 5 };
    const only = buildSim([STACK, { op: "bond", quality: "good" }, punch, { op: "flatten" }]);
    const ground = buildSim([STACK, { op: "bond", quality: "good" }, punch, { op: "grind", depth: 0.05 }]);
    expect(metalsShown(only, surface(only, 40))).toBe(1);
    expect(metalsShown(ground, surface(ground, 40))).toBe(2);
    expect(only.notes.join()).toContain("裏から打ち出した");
  });

  it("彫ったまま平らにしなければ、断面の上に空気（くぼみ）が残る", () => {
    const sim = buildSim([STACK, { op: "bond", quality: "good" }, { op: "carve", side: "top", shape: "lines", depth: 0.4, size: 0.1, across: 3 }]);
    const sec = section(sim, 40, 40, 0.5);
    expect(Array.from(sec.cells).filter((v) => v === AIR).length).toBeGreaterThan(0);
    expect(sim.notes.join()).toContain("凹凸");
  });

  it("つなぐ手順が無いと、はがれが出る（よくつないだら出ない）", () => {
    const carve: PatternOp = { op: "carve", side: "top", shape: "pits", depth: 0.5, size: 0.08, across: 5 };
    const none = surface(buildSim([STACK, carve, { op: "flatten" }]), 60);
    const good = surface(buildSim([STACK, { op: "bond", quality: "good" }, carve, { op: "flatten" }]), 60);
    expect(none.defect.some((v) => v === 1)).toBe(true);
    expect(good.defect.every((v) => v === 0)).toBe(true);
  });

  it("並べかえ（横にする・四角に回す）で模様が変わる", () => {
    const base: PatternOp[] = [STACK, { op: "bond", quality: "good" }, { op: "rearrange", mode: "edge_up", pieces: 2 }];
    const edge = surface(buildSim(base), 48);
    expect(fineness(edge)).toBeGreaterThan(0);
    const tiles = surface(buildSim([...base, { op: "rearrange", mode: "tiles", pieces: 4 }]), 48);
    expect(same(edge.layer, tiles.layer)).toBe(false);
  });

  it("最初が重ねるでなければ断る。絵は n × n の画素になる", () => {
    expect(() => buildSim([{ op: "flatten" }])).toThrow();
    const img = surfaceImage(buildSim([STACK, { op: "grind", depth: 0.1 }]), 10, 2);
    expect(img.data.length).toBe(10 * 10 * 4);
  });
});

type RawOp = { op: string; step: number; why: string; assumed: string; metals: string[]; amount: number; size: number; across: number; choice: string };
const op = (o: Partial<RawOp> & { op: string }): RawOp => ({ step: 0, why: "", assumed: "", metals: [], amount: 0, size: 0, across: 0, choice: "-", ...o });
const goodInput = () => ({
  applicable: true,
  reason: "重ねて、彫って、平らにする",
  ops: [
    op({ op: "stack", step: 1, why: "重ねる", assumed: "枚数は仮に 12 枚", metals: ["shakudo", "silver"], amount: 12 }),
    op({ op: "bond", step: 2, why: "熱してつなぐ", choice: "good" }),
    op({ op: "carve", step: 3, why: "穴をあける", amount: 0.4, size: 0.04, across: 8, choice: "dots" }),
    op({ op: "flatten", step: 3, why: "平らに" }),
    op({ op: "color", why: "絵のため", choice: "patina" }),
  ],
  cannot_show: "",
  summary: "雨のつぶのような丸い模様になりそう",
});

describe("predict_pattern の答えを確かめる", () => {
  it("使わない値はそろえ、裏から打ち出すは計算の裏からの彫りになる", () => {
    const x = goodInput();
    x.ops[3] = op({ op: "punch", step: 3, amount: 0.3, size: 0.05, across: 4, choice: "pits", metals: ["gold"] });
    x.ops[1].amount = 9;
    const r = parsePattern(x, { steps: 3 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.ops[1].amount).toBe(0);
    expect(r.value.ops[3].metals).toEqual([]);
    expect(toPatternOps(r.value)[3]).toEqual({ op: "carve", side: "back", shape: "pits", depth: 0.3, size: 0.05, across: 4 });
  });

  it("正しい答えを受け取り、計算の操作にできる", () => {
    const r = parsePattern(goodInput(), { steps: 3 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ops = toPatternOps(r.value);
    expect(ops[0]).toEqual({ op: "stack", metals: ["shakudo", "silver"], count: 12 });
    expect(buildSim(ops).layersFinal).toBe(12);
    // 確かめたあとの形を、もう一度確かめても同じ（記録を読み直すときに使う）
    const again = parsePattern(r.value, { steps: 3 });
    expect(again.ok && again.value).toEqual(r.value);
  });

  it("模様の技でなければ、理由をつけて断れる（操作は使わない）", () => {
    const r = parsePattern({ applicable: false, reason: "石を留める技で、層を重ねない", ops: [], cannot_show: "", summary: "" }, { steps: 4 });
    expect(r.ok && r.value.applicable).toBe(false);
    expect(r.ok && r.value.ops).toEqual([]);
    expect(parsePattern({ applicable: false, reason: "", ops: [], cannot_show: "", summary: "" }, { steps: 4 }).ok).toBe(false);
  });

  it("知らない操作・最初が重ねるでない・値が足りない・知らない材料を断る", () => {
    const bad = (f: (x: ReturnType<typeof goodInput>) => void) => {
      const x = goodInput();
      f(x);
      return parsePattern(x, { steps: 3 });
    };
    expect(bad((x) => (x.ops[1].op = "melt")).ok).toBe(false);
    expect(bad((x) => x.ops.shift()).ok).toBe(false);
    expect(bad((x) => x.ops.push({ ...x.ops[0] })).ok).toBe(false);
    expect(bad((x) => (x.ops[2].choice = "patina")).ok).toBe(false);
    expect(bad((x) => (x.ops[2].amount = "deep" as never)).ok).toBe(false);
    expect(bad((x) => (x.ops[0].metals = ["unobtainium"])).ok).toBe(false);
    expect(bad((x) => (x.ops[0].metals = [])).ok).toBe(false);
    expect(bad((x) => (x.summary = "")).ok).toBe(false);
    expect(bad((x) => (x.ops = [])).ok).toBe(false);
  });

  it("範囲の外の数と、無い工程の番号は直して知らせる", () => {
    const x = goodInput();
    x.ops[0].amount = 500;
    x.ops[2].step = 9;
    const r = parsePattern(x, { steps: 3 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.ops[0].amount).toBe(64);
    expect(r.value.ops[2].step).toBe(0);
    expect(r.warnings?.length).toBe(2);
  });

  it("道具は名前で通り、指示は短く、模様にしない道も書いてある", () => {
    expect(isAllowedToolName(PREDICT_PATTERN.name)).toBe(true);
    const s = patternPrompt();
    expect(s.length).toBeLessThan(SYSTEM_MAX_CHARS);
    for (const w of ["applicable を false", "無理に模様にしない", "仮に決め", "資料として読むだけ"]) expect(s).toContain(w);
    // 特定の技を前提にしない
    expect(s).not.toMatch(/木目金|ダマスカス/);
  });
});

describe("模様の見込みを案と一緒に残す", () => {
  it("案に残り、記録を読み直しても消えない。おかしい見込みは外す", () => {
    let p = newProject("rtest1", "架空の技", "2026-11-07");
    const added = addClue(p, { kind: "object", text: "縞がある" }, "2026-11-07");
    if ("error" in added) throw new Error(added.error);
    p = added.project;
    const out: RestorationOutput = {
      steps: [1, 2, 3].map((n) => ({ title: `工程${n}`, detail: "する", clue_ids: [], basis: "prior" as const, confidence: 1 as const, prev_step: 0, change: "new" as const })),
      dropped: [],
      unknowns: [{ what: "温度", why: "", step: 0 }],
      next_checks: [{ what: "試す", why: "", kind: "trial", step: 0 }],
      summary: "案",
      changes: "",
    };
    p = applyPlan(p, out, { date: "2026-11-07", sent: [], photosSent: [], sources: "" });
    const r = parsePattern(goodInput(), { steps: 3 });
    if (!r.ok) throw new Error(r.error);
    p = setPattern(p, 1, { date: "2026-11-07", prediction: r.value, notes: [] }, "2026-11-07");
    const back = readProject(JSON.parse(JSON.stringify(p)));
    expect(back?.plans[0].pattern?.prediction).toEqual(r.value);
    const broken = JSON.parse(JSON.stringify(p));
    broken.plans[0].pattern.prediction.ops[0].op = "melt";
    expect(readProject(broken)?.plans[0].pattern).toBeUndefined();
    expect(readPatternRecord({ date: "x", prediction: r.value }, 3)).toBeNull();
    expect(patternRequest(p.name, p.plans[0])).toContain("工程の数は 3");
  });
});
