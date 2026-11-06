import { describe, expect, it } from "vitest";
import {
  AIR,
  GAP,
  TRUE_STATUSES,
  buildModel,
  defectShare,
  fineness,
  gapCells,
  layerColors,
  layersShown,
  recipeFrom,
  section,
  statusesFromGrade,
  surface,
  type Statuses,
} from "../src/rebuild/mokume-pattern";
import { MOKUME_METALS, MOKUME_VALUES } from "../src/rebuild/mokume-values";
import { CLAUDE_RECIPE, CLAUDE_STATUSES, MOKUME_TRIAL, TRUE_RECIPE, reached } from "../src/rebuild/mokume-trial";
import { PUBLISHED_RUNS } from "../src/rebuild/published";

const N = 70;
const with_ = (patch: Partial<Statuses>): Statuses => ({ ...TRUE_STATUSES, ...patch });

describe("模様の試し：手順から作り方を読む", () => {
  it("11-04 の回は、本当の 11 のうち 9 にたどり着き、締めつけ（A4）とすぐ叩く（A6）が無い", () => {
    expect(reached(CLAUDE_STATUSES)).toBe(9);
    expect(CLAUDE_STATUSES.A4).toBe("miss");
    expect(CLAUDE_STATUSES.A6).toBe("miss");
    expect(CLAUDE_STATUSES.A9).toBe("part");
    expect(MOKUME_TRIAL.missed).toHaveLength(2);
  });
  it("Claude の手順：切りそろえない・打ち出しあり・くり返し 1 回・つながりが弱い", () => {
    expect(CLAUDE_RECIPE.sameSize).toBe(false);
    expect(CLAUDE_RECIPE.punch).toBe(true);
    expect(CLAUDE_RECIPE.cycles).toBe(1);
    expect(CLAUDE_RECIPE.clamp).toBe(0);
    expect(CLAUDE_RECIPE.hotHammer).toBe(0);
    expect(CLAUDE_RECIPE.unbonded).toBeGreaterThan(0.1);
  });
  it("本当の手順：つながらない所はない。くり返しは値の表の回数", () => {
    expect(TRUE_RECIPE.unbonded).toBe(0);
    expect(TRUE_RECIPE.cycles).toBe(MOKUME_VALUES.cycles.value);
    expect(TRUE_RECIPE.punch).toBe(false);
  });
  it("組み立て直すの画面の採点（公開の記録）からも読める", () => {
    const run = PUBLISHED_RUNS.find((r) => r.technique === "mokume" && r.grade);
    expect(run).toBeTruthy();
    const st = statusesFromGrade(run!.grade!);
    expect(st.A6).toBe("miss");
    expect(st.A1).toBe("ok");
  });
  it("値の表：出典のない値には「仮」の印と理由がある", () => {
    for (const v of Object.values(MOKUME_VALUES)) {
      expect(v.source.length).toBeGreaterThan(3);
      if (!("kari" in v) || !v.kari) expect(v.source).toMatch(/A\d+/);
    }
  });
});

describe("模様の試し：計算", () => {
  it("本当の手順：模様が出て、はがれは無い", () => {
    const s = surface(buildModel(TRUE_RECIPE), N);
    expect(fineness(s)).toBeGreaterThan(0.05);
    expect(layersShown(s)).toBeGreaterThanOrEqual(5);
    expect(defectShare(s)).toBe(0);
  });
  it("Claude の手順：締めつけとすぐ叩くが無いので、はがれが出る", () => {
    const s = surface(buildModel(CLAUDE_RECIPE), N);
    expect(defectShare(s)).toBeGreaterThan(0.005);
    expect(gapCells(section(buildModel(CLAUDE_RECIPE), 4, 120, 60))).toBeGreaterThan(0);
    expect(gapCells(section(buildModel(TRUE_RECIPE), 4, 120, 60))).toBe(0);
  });
  it("くり返すと、模様が細かくなる（1 回より 2 回）", () => {
    const once = surface(buildModel(recipeFrom(with_({ A9: "part" }))), N);
    const twice = surface(buildModel(TRUE_RECIPE), N);
    expect(fineness(twice)).toBeGreaterThan(fineness(once));
  });
  it("彫らなければ、平らにしても一番上の層しか出ない", () => {
    const s = surface(buildModel(recipeFrom(with_({ A8: "miss" }))), N);
    expect(layersShown(s)).toBe(1);
    expect(fineness(s)).toBe(0);
  });
  it("つなぐ手順が欠けるほど、はがれが増える", () => {
    const a = defectShare(surface(buildModel(recipeFrom(with_({ A6: "miss" }))), N));
    const b = defectShare(surface(buildModel(recipeFrom(with_({ A4: "miss", A6: "miss" }))), N));
    const c = defectShare(surface(buildModel(recipeFrom(with_({ A2: "miss", A4: "miss", A5: "miss", A6: "miss" }))), N));
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
  it("同じたねなら同じ絵。本当と Claude で 1 回目に彫る所は同じ", () => {
    expect(surface(buildModel(CLAUDE_RECIPE), 30)).toEqual(surface(buildModel(CLAUDE_RECIPE), 30));
    const t = buildModel(TRUE_RECIPE).cycles[0];
    const c = buildModel(CLAUDE_RECIPE).cycles[0];
    expect(c.slice(0, t.length)).toEqual(t);
  });
  it("煮色をしないと、層の色は煮色の前の色のまま", () => {
    const m = buildModel(recipeFrom(with_({ A11: "miss" })));
    expect(layerColors(m, true)[0]).toBe(MOKUME_METALS.shakudo.raw);
    expect(layerColors(buildModel(TRUE_RECIPE), true)[0]).toBe(MOKUME_METALS.shakudo.niiro);
  });
});

describe("模様の試し：断面", () => {
  const W = 120;
  const H = 60;
  it("① 重ねた板の間には、すき間がある", () => {
    // 板 16 枚とすき間が、こまに分かれて見える高さで
    const tall = 240;
    const sec = section(buildModel(TRUE_RECIPE), 1, W, tall);
    const col = Array.from({ length: tall }, (_, y) => sec.cells[y * W + W / 2]);
    const runs = col.filter((v, i) => v !== AIR && (i === 0 || col[i - 1] === AIR)).length;
    expect(runs).toBe(MOKUME_VALUES.layers.value);
  });
  it("① 切りそろえないと、板のはしがそろわない", () => {
    const ends = (st: Statuses) => {
      const sec = section(buildModel(recipeFrom(st)), 1, W, H);
      const lefts = new Set<number>();
      for (let y = 0; y < H; y++) {
        const x = Array.from({ length: W }, (_, i) => sec.cells[y * W + i]).findIndex((v) => v >= 0);
        if (x >= 0) lefts.add(x);
      }
      return lefts.size;
    };
    expect(ends(TRUE_STATUSES)).toBe(1);
    expect(ends(with_({ A1: "part" }))).toBeGreaterThan(1);
  });
  it("③ 彫った所は、表から空いている", () => {
    const sec = section(buildModel(TRUE_RECIPE), 3, W, H);
    let carved = 0;
    for (let x = 0; x < W; x++) if (sec.cells[(sec.top + 1) * W + x] === AIR) carved++;
    expect(carved).toBeGreaterThan(0);
  });
  it("④ 平らにしたあとは、表に空きがない", () => {
    const sec = section(buildModel(TRUE_RECIPE), 4, W, H);
    for (let x = 0; x < W; x++) expect(sec.cells[sec.top * W + x]).not.toBe(AIR);
    expect(sec.cells.includes(GAP)).toBe(false);
  });
});
