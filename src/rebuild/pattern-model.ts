// 模様の見込みの絵を、画面とファイルで同じ形で描くための入口。画面に依存しない純粋な関数。
// 答え（PatternPrediction）の最初の操作で、2 つの計算のどちらかを使う：
//   stack（重ねる）→ 重ねた層の模様（src/rebuild/pattern-sim.ts）
//   plate（1 枚の板）→ 1 枚の板の表の彫り・打ち・透かし・象嵌など（src/rebuild/pattern-relief.ts）
import { bondOf, buildSim, sectionImage, sectionRow, surfaceImageAsync, type Rgba } from "./pattern-sim";
import { buildRelief, reliefSectionImage, reliefSectionRow, reliefTopAsync } from "./pattern-relief";
import { toPatternOps, toReliefOps, type PatternPrediction } from "./pattern-tools";

export interface PatternModel {
  family: "layers" | "surface";
  /** 計算からの知らせ（やさしい日本語） */
  notes: string[];
  /** 数の短い説明（層の数など） */
  facts: string;
  /** 断面を切る所（見る所の上から 0〜1） */
  row: number;
  /** i 番目（0 から）の操作までで作った、途中の姿 */
  stage(i: number): PatternModel;
  /** 断面の絵（w × h。空気は透明） */
  section(w: number, h: number, row: number, ss: number): Rgba;
  /** 上から見た面の絵（n × n。band で帯だけ） */
  top(n: number, ss: number, pause: () => Promise<void>, stop?: () => boolean, band?: readonly [number, number]): Promise<Rgba | null>;
}

/** 答えから、絵を描く計算を作る。seed は散らばりのたね（同じたねなら同じ絵） */
export function modelOf(pred: PatternPrediction, seed = 7): PatternModel {
  if (pred.ops[0]?.op === "plate") {
    const ops = toReliefOps(pred);
    const make = (n: number, row?: number): PatternModel => {
      const r = buildRelief(ops.slice(0, n), seed);
      const rw = row ?? reliefSectionRow(r);
      return {
        family: "surface",
        notes: r.notes,
        facts: r.facts,
        row: rw,
        stage: (i) => make(i + 1, rw),
        section: (w, h, row2, ss) => reliefSectionImage(r, w, h, row2, ss),
        top: (n2, ss, pause, stop, band) => reliefTopAsync(r, n2, ss, pause, stop, band),
      };
    };
    return make(ops.length);
  }
  const ops = toPatternOps(pred);
  const bond = bondOf(ops);
  const make = (n: number, row?: number): PatternModel => {
    const sim = buildSim(ops.slice(0, n), seed, n < ops.length ? { bond } : {});
    const rw = row ?? sectionRow(sim);
    return {
      family: "layers",
      notes: sim.notes,
      facts: sim.ingot ? `1 つの鋳た塊（中のむらの網目は幅の中に ${sim.ingot.cells}・仮）` : `はじめ ${sim.count} 枚 → 最後 ${sim.layersFinal} 層（仮）`,
      row: rw,
      stage: (i) => make(i + 1, rw),
      section: (w, h, row2, ss) => sectionImage(sim, w, h, row2, ss),
      top: (n2, ss, pause, stop, band) => surfaceImageAsync(sim, n2, ss, pause, stop, band),
    };
  };
  return make(ops.length);
}

/** 上から見た面の絵を、すぐに（待たずに）描く。ファイルに残すときと、小さな絵に */
export async function topImage(m: PatternModel, n: number, ss: number): Promise<Rgba> {
  return (await m.top(n, ss, async () => undefined))!;
}
