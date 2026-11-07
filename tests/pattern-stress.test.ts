// くせのある架空の技で通して見つけた弱い所（docs/pattern-demo/stress/README.md。2026-11-07 夜）を直した所のテスト。
// 重ねた板の表を彫る・地を抜いたより線の透かし・粒を詰めたより線・小さな渦の道すじ・丸い象嵌の大きさ・打ち出しの波・七宝の線の金属・
// 表から彫っただけで平らにしないときの知らせ。
import { describe, expect, it } from "vitest";
import { buildRelief, layerAt, pathHit, pointAt, reliefSectionImage, topMat, type ReliefOp } from "../src/rebuild/pattern-relief";
import { buildSim } from "../src/rebuild/pattern-sim";
import { opWords, parsePattern, patternPrompt, toReliefOps } from "../src/rebuild/pattern-tools";

const P = (o: Partial<{ op: string; metals: string[]; amount: number; size: number; across: number; choice: string }> & { op: string }) => ({
  step: 1,
  why: "",
  assumed: "",
  metals: [],
  amount: 0,
  size: 0,
  across: 0,
  choice: "-",
  ...o,
});

/** 板の上を細かく見て、条件に合う点の割合 */
function share(r: ReturnType<typeof buildRelief>, test: (p: ReturnType<typeof pointAt>) => boolean, step = 0.004, lo = 0, hi = 1): number {
  let hit = 0;
  let all = 0;
  for (let y = lo; y < hi; y += step) {
    for (let x = lo; x < hi; x += step) {
      all++;
      if (test(pointAt(r, x, y))) hit++;
    }
  }
  return hit / all;
}

describe("重ねた板の表を彫る（重ねる技と、表の飾りをまぜた技）", () => {
  const ops: ReliefOp[] = [
    { op: "plate", metal: "silver", under: ["shakudo", "copper"] },
    { op: "engrave", style: "kebori", path: "straight", depth: 0.7, size: 0.02, across: 3 },
  ];
  it("層は同じ厚さ。深さで、その層の材料になる", () => {
    const r = buildRelief(ops, 3);
    expect(r.materials).toEqual(["silver", "shakudo", "copper"]);
    expect(r.layers).toEqual([0, 1, 2]);
    expect(layerAt(r.layers, 0)).toBe(0);
    expect(layerAt(r.layers, 0.4)).toBe(1);
    expect(layerAt(r.layers, 0.69)).toBe(2);
    expect(layerAt([0], 0.5)).toBe(0);
    expect(r.facts).toContain("重ねた板");
    expect(r.notes.join("")).toContain("同じ厚さ");
  });
  it("彫った溝の底は下の層、斜めの所は中の層、彫っていない所は表の層", () => {
    const r = buildRelief(ops, 3);
    const seen = new Set<number>();
    for (let y = 0; y < 1; y += 0.0005) seen.add(topMat(pointAt(r, 0.5, y), r.layers));
    expect([...seen].sort()).toEqual([0, 1, 2]);
    // 1 枚の板なら、彫っても地の金属のまま
    const one = buildRelief([{ op: "plate", metal: "silver" }, ops[1]], 3);
    for (let y = 0; y < 1; y += 0.005) expect(topMat(pointAt(one, 0.5, y), one.layers)).toBe(0);
  });
  it("断面も、深さで層の色が変わる", () => {
    const r = buildRelief([ops[0]], 3);
    const sec = reliefSectionImage(r, 10, 60, 0.5, 1);
    const colors = new Set<string>();
    for (let j = 0; j < 60; j++) {
      const o = 4 * (j * 10 + 5);
      if (sec.data[o + 3] > 0) colors.add(Array.from(sec.data.slice(o, o + 3)).join(","));
    }
    expect(colors.size).toBeGreaterThanOrEqual(3);
  });
  it("道具の答えで plate に 2〜4 つの金属を書くと、重ねた板になる。言い方も重ねた板", () => {
    const ok = parsePattern(
      { applicable: true, reason: "r", cannot_show: "", summary: "s", ops: [P({ op: "plate", metals: ["silver", "shakudo", "copper"] }), P({ op: "nanako", size: 0.01, across: 20, choice: "rows" })] },
      { steps: 2 },
    );
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(toReliefOps(ok.value)[0]).toEqual({ op: "plate", metal: "silver", under: ["shakudo", "copper"] });
    expect(opWords(ok.value.ops[0])).toContain("重ねて");
  });
});

describe("より線の透かし細工（線を組んだ、板の無い細工）", () => {
  const ops: ReliefOp[] = [
    { op: "plate", metal: "silver" },
    { op: "sukashi", shape: "ground", size: 0.005, across: 1 },
    { op: "granulate", metal: "silver", arrange: "coils", size: 0.012, across: 4 },
  ];
  it("ground は、のせた線と粒、ふちの枠だけを残して、地を抜く（手順の順によらない）", () => {
    const r = buildRelief(ops, 5);
    const hole = share(r, (p) => p.hole, 0.005, 0.1, 0.9);
    const wire = share(r, (p) => p.add > 0, 0.005, 0.1, 0.9);
    expect(share(r, (p) => p.add > 0 && p.hole)).toBe(0);
    expect(hole).toBeGreaterThan(wire);
    expect(wire).toBeGreaterThan(0.1);
    // ふちの枠は残す
    expect(pointAt(r, 0.02, 0.5).hole).toBe(false);
  });
  it("粒を道すじにそって詰めると、とぎれない線になる（となりの粒と重なる）", () => {
    const r = buildRelief([{ op: "plate", metal: "silver" }, { op: "granulate", metal: "gold", arrange: "wave", size: 0.01, across: 3 }], 5);
    // 線の上を横に進むと、粒の高さは 0 にもどらない
    let along = 0;
    let gaps = 0;
    for (let x = 0.2; x < 0.8; x += 0.004) {
      let best = 0;
      for (let y = 0; y < 0.34; y += 0.001) best = Math.max(best, pointAt(r, x, y).add);
      along++;
      if (best === 0) gaps++;
    }
    expect(gaps / along).toBeLessThan(0.02);
  });
  it("より線が太すぎて、となりの巻きと重なるときは、すき間が残る太さにして知らせる（渦が円盤にならない）", () => {
    const thick = buildRelief([{ op: "plate", metal: "silver" }, { op: "granulate", metal: "silver", arrange: "coils", size: 0.02, across: 6 }], 5);
    expect(thick.notes.join("")).toContain("細くして描きました");
    // 渦の中で、線の所とすき間の両方がある
    const cell = share(thick, (p) => p.add > 0, 0.002, 0.3, 0.45);
    expect(cell).toBeGreaterThan(0.15);
    expect(cell).toBeLessThan(0.75);
    const fine = buildRelief([{ op: "plate", metal: "silver" }, { op: "granulate", metal: "gold", arrange: "cluster", size: 0.02, across: 6 }], 5);
    expect(fine.notes.join("")).not.toContain("細くして");
  });
  it("小さな渦の道すじは、並べた渦の中のあちこちを通り、渦の外では当たらない", () => {
    let near = 0;
    let all = 0;
    for (let y = 0.05; y < 0.95; y += 0.01) {
      for (let x = 0.05; x < 0.95; x += 0.01) {
        all++;
        if (pathHit("coils", 4, x, y, 1).d < 0.008) near++;
      }
    }
    expect(near / all).toBeGreaterThan(0.1);
    expect(near / all).toBeLessThan(0.7);
  });
});

describe("丸い象嵌・打ち出しの波・七宝の線", () => {
  it("dots の丸は size の半径（前は 2.2 倍にふくらみ、となりと触れた）。pits はばらばら", () => {
    const r = buildRelief([{ op: "plate", metal: "shibuichi" }, { op: "zogan", metal: "silver", path: "dots", size: 0.02, across: 12 }], 3);
    // 12 × 12 の丸（半径 0.02）の面積は、板の 2 割ほど
    const inlay = share(r, (p) => p.fill > 0);
    expect(inlay).toBeGreaterThan(0.12);
    expect(inlay).toBeLessThan(0.3);
    const s = buildRelief([{ op: "plate", metal: "shibuichi" }, { op: "zogan", metal: "silver", path: "pits", size: 0.02, across: 4 }], 3);
    expect(share(s, (p) => p.fill > 0)).toBeGreaterThan(0.01);
  });
  it("打ち出しの波は、波の線にそった帯。同じ板の波の線は、その帯の背を通る", () => {
    const r = buildRelief(
      [
        { op: "plate", metal: "copper" },
        { op: "uchidashi", shape: "wave", height: 0.3, size: 0.05, across: 3 },
        { op: "engrave", style: "kebori", path: "wave", depth: 0.08, size: 0.006, across: 3 },
      ],
      4,
    );
    // 帯と平らな地の両方がある（前は板いっぱいのゆるい波で、低いと見えなかった）
    const up = share(r, (p) => p.bend > 0.3, 0.004, 0.1, 0.9);
    expect(up).toBeGreaterThan(0.1);
    expect(up).toBeLessThan(0.7);
    const line = share(r, (p) => p.cut > 0.02, 0.004, 0.1, 0.9);
    const lineOnBand = share(r, (p) => p.cut > 0.02 && p.bend > 0.5, 0.004, 0.1, 0.9);
    expect(lineOnBand / line).toBeGreaterThan(0.8);
  });
  it("七宝の区切りの線は、metals の enamel_ でない金属の色", () => {
    const ok = parsePattern(
      {
        applicable: true,
        reason: "r",
        cannot_show: "",
        summary: "s",
        ops: [P({ op: "plate", metals: ["copper"] }), P({ op: "shippo", metals: ["enamel_blue", "enamel_white", "silver"], size: 0.01, across: 3, choice: "petal" })],
      },
      { steps: 2 },
    );
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    const ops = toReliefOps(ok.value);
    expect(ops[1]).toMatchObject({ op: "shippo", colors: ["enamel_blue", "enamel_white"], wire: "silver" });
    expect(opWords(ok.value.ops[1])).toContain("銀の線");
    const r = buildRelief(ops, 3);
    let wire = 0;
    for (let y = 0; y < 1; y += 0.002) {
      const p = pointAt(r, 0.5, y);
      if (p.add > 0.045 && !p.glass) {
        wire++;
        expect(r.materials[topMat(p, r.layers)]).toBe("silver");
      }
    }
    expect(wire).toBeGreaterThan(0);
  });
});

describe("受け取るときに直すこと", () => {
  it("石目・魚々子の数が 0 なら、点の大きさから数を決めて知らせる（1 にすると、点がほとんど無い板になった）", () => {
    const ok = parsePattern(
      { applicable: true, reason: "r", cannot_show: "", summary: "s", ops: [P({ op: "plate", metals: ["shibuichi"] }), P({ op: "ishime", size: 0.008, across: 0 })] },
      { steps: 1 },
    );
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.value.ops[1].across).toBeGreaterThan(20);
    expect(ok.warnings?.join("")).toContain("点の大きさから");
    // ほかの操作の 0 は、今までどおり範囲におさめる
    const line = parsePattern(
      { applicable: true, reason: "r", cannot_show: "", summary: "s", ops: [P({ op: "plate", metals: ["silver"] }), P({ op: "kebori", amount: 0.2, size: 0.005, across: 0, choice: "wave" })] },
      { steps: 1 },
    );
    expect(line.ok && line.value.ops[1].across).toBe(1);
  });
});

describe("重ねた層の模様の知らせ", () => {
  it("表から彫っただけ（平らにしない）でも、彫った底に下の層が出るので「模様を出す手順が無い」とは言わない", () => {
    const sim = buildSim([
      { op: "stack", metals: ["silver", "shakudo", "copper"], count: 3 },
      { op: "bond", quality: "good" },
      { op: "carve", side: "top", shape: "waves", depth: 0.5, size: 0.03, across: 4 },
    ]);
    expect(sim.notes.join("")).not.toContain("模様を出す手順");
    expect(sim.notes.join("")).toContain("凹凸が残ります");
    // 裏から打ち出しただけ（削らない）なら、模様は出ない
    const back = buildSim([
      { op: "stack", metals: ["silver", "copper"], count: 4 },
      { op: "bond", quality: "good" },
      { op: "carve", side: "back", shape: "dots", depth: 0.5, size: 0.03, across: 4 },
    ]);
    expect(back.notes.join("")).toContain("模様を出す手順");
  });
  it("指示に、打ち出して削ると真ん中ほど下の層が出ること、重ねた板の表を彫る技の置きかえ方、地を抜く透かし、より線を書く", () => {
    const s = patternPrompt();
    expect(s).toContain("真ん中ほど深い所の層");
    expect(s).toContain("B の plate に重ねた金属");
    expect(s).toContain("ground");
    expect(s).toContain("より線");
  });
});
