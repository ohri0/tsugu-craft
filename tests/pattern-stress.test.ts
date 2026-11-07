// くせのある架空の技で通して見つけた弱い所（docs/pattern-demo/stress/README.md。2026-11-07 夜）を直した所のテスト。
// 重ねた板の表を彫る・地を抜いたより線の透かし・粒を詰めたより線・小さな渦の道すじ・丸い象嵌の大きさ・打ち出しの波・七宝の線の金属・
// 表から彫っただけで平らにしないときの知らせ。
import { describe, expect, it } from "vitest";
import { modelOf } from "../src/rebuild/pattern-model";
import { buildRelief, layerAt, pathHit, pointAt, reliefSectionImage, topMat, type ReliefOp } from "../src/rebuild/pattern-relief";
import { buildSim, carveDepth, layerOf, metalOf, section, surface, trace, type CarveShape, type PatternOp } from "../src/rebuild/pattern-sim";
import { layerEdges } from "../src/rebuild/pattern-spots";
import { opWords, parsePattern, patternPrompt, PREDICT_PATTERN, toPatternOps, toReliefOps } from "../src/rebuild/pattern-tools";

const P = (o: Partial<{ op: string; metals: string[]; amount: number; size: number; across: number; count: number; thickness: number[]; choice: string }> & { op: string }) => ({
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

// ---- 2026-11-08：まだ弱かった所（数の意味・葉の鏨・層の厚さ・打ち出しのふちの線・ねじった棒の星の先）を直した所 ----

/** 板を n × n に見て、条件に合うこまのかたまりの数（となり 4 つでつながる） */
function blobs(n: number, test: (x: number, y: number) => boolean): number {
  const on = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) on[j * n + i] = test((i + 0.5) / n, (j + 0.5) / n) ? 1 : 0;
  let count = 0;
  const stack: number[] = [];
  for (let k = 0; k < n * n; k++) {
    if (on[k] !== 1) continue;
    count++;
    on[k] = 2;
    stack.push(k);
    while (stack.length) {
      const q = stack.pop()!;
      const i = q % n;
      const j = (q - i) / n;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const a = i + di;
        const b = j + dj;
        if (a < 0 || b < 0 || a >= n || b >= n || on[b * n + a] !== 1) continue;
        on[b * n + a] = 2;
        stack.push(b * n + a);
      }
    }
  }
  return count;
}

const pred = (ops: ReturnType<typeof P>[]) => ({ applicable: true, reason: "r", cannot_show: "", summary: "s", ops });

describe("数の意味：count は品物 1 つ（板全体）の数", () => {
  it("「10 ほど」の丸い象嵌は、count 10 で、ちょうど 10 の丸になる（前は幅の中に 8 で、板全体に 60 ほど）", () => {
    const ok = parsePattern(pred([P({ op: "plate", metals: ["dark"] }), P({ op: "zogan", metals: ["light"], size: 0.03, count: 10, choice: "pits" })]), { steps: 2 });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.value.ops[1]).toMatchObject({ count: 10, across: 0 });
    expect(ok.warnings).toBeUndefined();
    const ops = toReliefOps(ok.value);
    expect(ops[1]).toMatchObject({ op: "zogan", count: 10 });
    expect(opWords(ok.value.ops[1])).toContain("板全体に 10");
    const r = buildRelief(ops, 7);
    expect(blobs(200, (x, y) => pointAt(r, x, y).fill > 0)).toBe(10);
    // 幅の中の数（across）は前と同じ意味：幅の中に 8 なら、板全体では 50 をこえる
    const old = buildRelief([{ op: "plate", metal: "dark" }, { op: "zogan", metal: "light", path: "pits", size: 0.03, across: 8 }], 7);
    expect(blobs(200, (x, y) => pointAt(old, x, y).fill > 0)).toBeGreaterThan(50);
  });
  it("並べる操作（象嵌の dots・打ち出しのふくらみ・透かし・七宝）も、count のとおりの数", () => {
    const cases: [ReliefOp, (p: ReturnType<typeof pointAt>) => boolean][] = [
      [{ op: "zogan", metal: "gold", path: "dots", size: 0.03, across: 0, count: 7 }, (p) => p.fill > 0],
      [{ op: "uchidashi", shape: "bumps", height: 0.3, size: 0.03, across: 0, count: 5 }, (p) => p.bend > 0.3],
      [{ op: "sukashi", shape: "circles", size: 0.05, across: 0, count: 6 }, (p) => p.hole],
      [{ op: "shippo", colors: ["enamel_blue"], cells: "round", size: 0.01, across: 0, count: 9 }, (p) => p.glass],
    ];
    for (const [op, test] of cases) {
      const r = buildRelief([{ op: "plate", metal: "silver" }, op], 3);
      expect(blobs(320, (x, y) => test(pointAt(r, x, y)))).toBe((op as { count: number }).count);
    }
  });
  it("重ねた板を裏から打つ・表から彫るときも、count はその時の板の全体の数", () => {
    const sim = buildSim([
      { op: "stack", metals: ["copper", "silver"], count: 6 },
      { op: "bond", quality: "good" },
      { op: "carve", side: "top", shape: "pits", depth: 0.5, size: 0.03, across: 0, count: 12 },
    ]);
    const st = sim.stages.find((s) => s.op.op === "carve")!;
    expect(blobs(200, (x, y) => carveDepth(st.op as Parameters<typeof carveDepth>[0], x, y, st.seed) > 0.02)).toBe(12);
  });
  it("count を使わない操作で count が来たら使わずに知らせ、count が無い古い記録は前と同じ（count を添えない）", () => {
    const bad = parsePattern(pred([P({ op: "plate", metals: ["silver"] }), P({ op: "kebori", amount: 0.2, size: 0.005, across: 3, count: 10, choice: "wave" })]), { steps: 2 });
    expect(bad.ok && bad.value.ops[1].count).toBe(0);
    expect(bad.ok && bad.warnings?.join("")).toContain("count");
    const old = {
      applicable: true,
      reason: "r",
      cannot_show: "",
      summary: "s",
      ops: [
        { op: "plate", step: 1, why: "", assumed: "", metals: ["silver"], amount: 0, size: 0, across: 0, choice: "-" },
        { op: "zogan", step: 1, why: "", assumed: "", metals: ["gold"], amount: 0, size: 0.02, across: 6, choice: "pits" },
      ],
    };
    const r = parsePattern(old, { steps: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toBeUndefined();
    expect(r.value.ops[1]).toMatchObject({ across: 6, count: 0, thickness: [] });
    expect(toReliefOps(r.value)[1]).not.toHaveProperty("count");
  });
});

/** 深さのある所の広がり（長い向きの長さ ÷ 短い向きの長さ） */
function elongation(f: (x: number, y: number) => number): number {
  const pts: [number, number][] = [];
  for (let y = 0; y < 1; y += 0.003) for (let x = 0; x < 1; x += 0.003) if (f(x, y) > 0.02) pts.push([x, y]);
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p[0], 0) / n;
  const my = pts.reduce((a, p) => a + p[1], 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of pts) {
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
    sxy += (x - mx) * (y - my);
  }
  const tr = (sxx + syy) / n;
  const det = (sxx * syy - sxy * sxy) / (n * n);
  const r = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  return Math.sqrt((tr / 2 + r) / Math.max(1e-12, tr / 2 - r));
}

describe("鏨の形：葉・花の形で打つ（前は丸いくぼみだけ）", () => {
  const one = (shape: CarveShape) => {
    const op = { op: "carve", side: "back", shape, depth: 0.5, size: 0.12, across: 0, count: 1 } as const;
    return (x: number, y: number) => carveDepth(op, x, y, 11);
  };
  it("葉は細長く、丸は丸い。花は、花びらの先までの円をうめない（花びらの間があく）", () => {
    expect(elongation(one("leaves"))).toBeGreaterThan(2);
    expect(elongation(one("pits"))).toBeLessThan(1.3);
    const flower = one("petals");
    let hit = 0;
    for (let y = 0; y < 1; y += 0.003) for (let x = 0; x < 1; x += 0.003) if (flower(x, y) > 0.02) hit++;
    const disc = (Math.PI * 0.12 ** 2) / 0.003 ** 2;
    expect(hit / disc).toBeLessThan(0.6);
    expect(hit / disc).toBeGreaterThan(0.1);
  });
  it("裏から葉の鏨で打って削ると、表に葉の形の輪が出る（道具の選びと言い方も葉）", () => {
    const ok = parsePattern(
      pred([
        P({ op: "stack", metals: ["copper", "silver"], amount: 10 }),
        P({ op: "bond", choice: "good" }),
        P({ op: "punch", amount: 0.45, size: 0.09, count: 16, choice: "leaves" }),
        P({ op: "grind", amount: 0.05 }),
      ]),
      { steps: 4 },
    );
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(opWords(ok.value.ops[2])).toContain("葉の形");
    expect(modelOf(ok.value, 7).notes.join("")).not.toContain("模様を出す手順");
    const s = surface(buildSim(toPatternOps(ok.value)), 120);
    // 地（いちばん上の銅）のほかに、輪の銀と、真ん中の銅が出る
    expect(new Set(Array.from(s.layer)).size).toBeGreaterThanOrEqual(3);
  });
});

describe("層の厚さを、層ごとに変えられる（前は同じ厚さだけ）", () => {
  it("厚さの割合から、層のさかいを作る。同じ厚さなら作らない（前と同じ計算）", () => {
    const e = layerEdges([2, 1], 4)!;
    [0, 1 / 3, 0.5, 5 / 6, 1].forEach((v, k) => expect(e[k]).toBeCloseTo(v, 12));
    expect(layerEdges([1, 1], 4)).toBeUndefined();
    expect(layerEdges([], 4)).toBeUndefined();
  });
  it("重ねた層：銀 3・赤銅 1 なら、断面の 4 分の 3 ほどが銀", () => {
    const share = (thickness?: number[]) => {
      const sim = buildSim([{ op: "stack", metals: ["silver", "shakudo"], count: 8, ...(thickness ? { thickness } : {}) }, { op: "bond", quality: "good" }]);
      const sec = section(sim, 10, 400);
      let silver = 0;
      let all = 0;
      for (const v of sec.cells) {
        if (v < 0) continue;
        all++;
        if (metalOf(sim, v) === "silver") silver++;
      }
      return { s: silver / all, notes: sim.notes.join("") };
    };
    expect(share().s).toBeCloseTo(0.5, 1);
    const t = share([3, 1]);
    expect(t.s).toBeGreaterThan(0.7);
    expect(t.s).toBeLessThan(0.8);
    expect(t.notes).toContain("厚さ");
  });
  it("重ねた板の表を彫る：赤銅を薄めにすると、その深さで下の銅が出る", () => {
    const r = buildRelief([{ op: "plate", metal: "silver", under: ["shakudo", "copper"], thickness: [1, 0.4, 1] }], 3);
    expect(r.edges).toBeDefined();
    expect(layerAt(r.layers, 0.45, r.edges)).toBe(1);
    expect(layerAt(r.layers, 0.6, r.edges)).toBe(2);
    // 同じ厚さなら 0.6 はまだ赤銅
    expect(layerAt(r.layers, 0.6)).toBe(1);
    expect(r.notes.join("")).toContain("1:0.4:1");
  });
  it("道具：stack・plate の thickness は metals と同じ数。同じ厚さは空に、数がちがえば使わずに知らせる", () => {
    const ok = parsePattern(pred([P({ op: "stack", metals: ["silver", "shakudo"], amount: 8, thickness: [3, 1] }), P({ op: "bond", choice: "good" })]), { steps: 2 });
    expect(ok.ok && ok.value.ops[0].thickness).toEqual([3, 1]);
    expect(ok.ok && toPatternOps(ok.value)[0]).toMatchObject({ op: "stack", thickness: [3, 1] });
    expect(ok.ok && opWords(ok.value.ops[0])).toContain("厚さの割合 3:1");
    const same = parsePattern(pred([P({ op: "stack", metals: ["silver", "shakudo"], amount: 8, thickness: [2, 2] })]), { steps: 1 });
    expect(same.ok && same.value.ops[0].thickness).toEqual([]);
    const wrong = parsePattern(pred([P({ op: "stack", metals: ["silver", "shakudo"], amount: 8, thickness: [1, 2, 3] })]), { steps: 1 });
    expect(wrong.ok && wrong.value.ops[0].thickness).toEqual([]);
    expect(wrong.ok && wrong.warnings?.join("")).toContain("thickness");
    const plate = parsePattern(pred([P({ op: "plate", metals: ["silver", "shakudo", "copper"], thickness: [1, 0.4, 1] })]), { steps: 1 });
    expect(plate.ok && toReliefOps(plate.value)[0]).toEqual({ op: "plate", metal: "silver", under: ["shakudo", "copper"], thickness: [1, 0.4, 1] });
  });
});

describe("打ち出しのふちにそった線（outline）と、ねじった棒を並べてつなぐ", () => {
  it("線は、前に打ち出したふくらみの高さが半分ほどの所を通り、平らに残したふちには引かない", () => {
    const r = buildRelief(
      [
        { op: "plate", metal: "copper" },
        { op: "uchidashi", shape: "wave", height: 0.3, size: 0.05, across: 3 },
        { op: "engrave", style: "kebori", path: "outline", depth: 0.1, size: 0.006, across: 1 },
      ],
      4,
    );
    const H = 0.3 * 3;
    let line = 0;
    let onEdge = 0;
    for (let y = 0.1; y < 0.9; y += 0.003) {
      for (let x = 0.1; x < 0.9; x += 0.003) {
        const p = pointAt(r, x, y);
        if (p.cut < 0.02) continue;
        line++;
        const f = pointAt(r, x, y, 2).bend / H;
        if (f > 0.25 && f < 0.75) onEdge++;
      }
    }
    expect(line).toBeGreaterThan(200);
    expect(onEdge / line).toBeGreaterThan(0.8);
    for (let t = 0; t < 1; t += 0.01) expect(pointAt(r, 0.02, t).cut).toBe(0);
    // 打ち出しが無ければ彫らずに知らせる
    const none = buildRelief([{ op: "plate", metal: "copper" }, { op: "engrave", style: "kebori", path: "outline", depth: 0.1, size: 0.006, across: 1 }], 4);
    expect(none.notes.join("")).toContain("打ち出す手順が無い");
    expect(share(none, (p) => p.cut > 0, 0.01)).toBe(0);
    const ok = parsePattern(pred([P({ op: "plate", metals: ["copper"] }), P({ op: "kebori", amount: 0.1, size: 0.006, across: 1, choice: "outline" })]), { steps: 2 });
    expect(ok.ok && opWords(ok.value.ops[1])).toContain("ふちにそった線");
  });
  it("ねじった棒を 2 本並べると、つなぎ目の両側に棒のふち（星の先）が来る。1 本のときと同じ層の並び", () => {
    const stack: PatternOp = { op: "stack", metals: ["iron", "light"], count: 16 };
    const bond: PatternOp = { op: "bond", quality: "good" };
    const one = buildSim([stack, bond, { op: "twist", turns: 3 }, { op: "grind", depth: 0.3 }]);
    const two = buildSim([stack, bond, { op: "twist", turns: 3, bars: 2 }, { op: "grind", depth: 0.3 }]);
    const at = (sim: typeof one, x: number, y: number) => layerOf(sim, trace(sim, x, y, 0).u0);
    const e = 0.004;
    let same = 0;
    let all = 0;
    for (let y = two.view.y0; y < two.view.y0 + two.view.size; y += 0.005) {
      all += 2;
      // 2 本の左の棒のふち（つなぎ目の左）＝ 1 本の右のふち。右の棒の左のふち ＝ 1 本の左のふち
      if (at(two, 0.5 - e, y) === at(one, 1 - 2 * e, y)) same++;
      if (at(two, 0.5 + e, y) === at(one, 2 * e, y)) same++;
    }
    expect(same / all).toBeGreaterThan(0.95);
    // 古い記録（across 0）は 1 本。2 本は言い方にも出る
    const old = parsePattern(pred([P({ op: "stack", metals: ["iron", "light"], amount: 16 }), P({ op: "twist", amount: 3, across: 0 })]), { steps: 2 });
    expect(old.ok && toPatternOps(old.value)[1]).toEqual({ op: "twist", turns: 3 });
    expect(old.ok && old.warnings).toBeUndefined();
    const bars = parsePattern(pred([P({ op: "stack", metals: ["iron", "light"], amount: 16 }), P({ op: "twist", amount: 3, across: 2 })]), { steps: 2 });
    expect(bars.ok && toPatternOps(bars.value)[1]).toEqual({ op: "twist", turns: 3, bars: 2 });
    expect(bars.ok && opWords(bars.value.ops[1])).toContain("2 本");
  });
  it("指示に、count・thickness・葉の鏨・ふちの線・棒を並べることを書く。道具の項目は全部が必ず書く項目のまま", () => {
    const s = patternPrompt();
    for (const w of ["count", "thickness", "leaves", "outline", "並べてつなぐ"]) expect(s).toContain(w);
    const items = (PREDICT_PATTERN.input_schema as { properties: { ops: { items: { properties: Record<string, unknown>; required: string[] } } } }).properties.ops.items;
    expect([...items.required].sort()).toEqual(Object.keys(items.properties).sort());
  });
});
