import { describe, expect, it } from "vitest";
import { bandCrossings, mokumeField, type MokumeParams } from "../src/cad/mokume";

const base: MokumeParams = { layers: 36, depth: 0.7, pits: 22, seed: 7 };
const n = 256;
/** 1 枚（30 mm）を横に何本の境目でまたぐか（16 行の平均） */
function crossings(p: MokumeParams): number {
  const f = mokumeField(p, n);
  let c = 0;
  for (let r = 0; r < n; r += 16) c += bandCrossings(f, n, r);
  return c / (n / 16);
}

describe("木目金の模様：層の番号の場", () => {
  it("同じたねなら同じ模様、たねを変えると変わる", () => {
    expect(mokumeField(base, 64)).toEqual(mokumeField(base, 64));
    expect(mokumeField({ ...base, seed: 8 }, 64)).not.toEqual(mokumeField(base, 64));
  });
  it("層の番号は 0〜層の数", () => {
    const f = mokumeField(base, n);
    expect(Math.min(...f)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...f)).toBeLessThan(base.layers);
  });
  it("30 mm の 1 枚を横切ると、何十本もの細い層の線をまたぐ", () => {
    expect(crossings(base)).toBeGreaterThan(24);
  });
  it("層が多いほど、線が多く細い", () => {
    expect(crossings({ ...base, layers: 40 })).toBeGreaterThan(crossings({ ...base, layers: 20 }) * 1.6);
  });
  it("深く彫るほど、目の輪が多い", () => {
    expect(crossings({ ...base, depth: 0.9 })).toBeGreaterThan(crossings({ ...base, depth: 0.3 }) * 1.4);
  });
  it("彫らなくても、層の波で木目の線は出る。彫ると目が加わって増える", () => {
    const none = crossings({ ...base, pits: 0 });
    expect(none).toBeGreaterThan(0);
    expect(crossings(base)).toBeGreaterThan(none * 1.5);
  });
  it("上下左右がつながっている（くり返して貼っても継ぎ目が出ない）", () => {
    const f = mokumeField(base, n);
    let edge = 0;
    let inner = 0;
    for (let j = 0; j < n; j++) {
      edge = Math.max(edge, Math.abs(f[j * n] - f[j * n + n - 1]));
      inner = Math.max(inner, Math.abs(f[j * n + n / 2] - f[j * n + n / 2 - 1]));
    }
    expect(edge).toBeLessThan(inner * 1.5);
  });
});
