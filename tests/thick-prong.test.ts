// 太い爪も、先から石に沿って下り、上の輪を通って下の輪まで、1 本の柱としてつながる（作者の問い：2026-11-03「どこでつながっているの？」）。
// 前は、足が縁の下でまっすぐ立ってから、下の輪の近くで急に中へ曲がっていたので、太い爪では縁のまわりの固まりと、
// 横に寝た腕に見え、下の輪までの柱が見えなかった。
import { describe, expect, it } from "vitest";
import { buildSetting, type SettingResult } from "../src/geometry/setting";
import { girdleCenter, stoneKnots } from "../src/geometry/stone";
import { triangleStone, stoneFrom } from "./helpers/stones";
import { ellipse } from "./helpers/synth";

/** 爪 i の三角形の点を、高さの帯ごとに、石の中心からの水平の距離の平均にまとめる */
function legProfile(s: SettingResult, i: number, center: { x: number; y: number }, step: number) {
  const r = s.prongs[i].triangles;
  const a = s.positions.subarray(r.start * 9, (r.start + r.count) * 9);
  const bins = new Map<number, { sum: number; n: number }>();
  for (let k = 0; k < a.length; k += 3) {
    const b = Math.floor(a[k + 2] / step);
    const e = bins.get(b) ?? { sum: 0, n: 0 };
    e.sum += Math.hypot(a[k] - center.x, a[k + 1] - center.y);
    e.n++;
    bins.set(b, e);
  }
  return bins;
}

const cases: [string, () => ReturnType<typeof triangleStone>][] = [
  ["三角", triangleStone],
  ["ラウンド", () => stoneFrom(ellipse(0, 0, 325, 325), 6.5, 3.9)],
];

describe("太い爪は、先から下の輪まで 1 本の柱", () => {
  for (const [name, mk] of cases) {
    for (const solid of [false, true]) {
      it(`${name}・${solid ? "一体の形" : "線を管にした形"}・爪 1.66 mm`, () => {
        const stone = mk();
        const s = buildSetting({ stone, style: "prong", vAtCorners: false, prongDiameterMm: 1.66, solid, solidQuality: "preview" });
        const h = s.heights;
        const k = stoneKnots(h);
        const center = girdleCenter(stone.outlineMm);
        const step = 0.2;
        for (let i = 0; i < s.prongs.length; i++) {
          const bins = legProfile(s, i, center, step);
          // 下の輪から縁まで、どの高さの帯にも爪の点がある（途中で切れていない）
          const from = Math.ceil(h.lowerRingZ! / step);
          const to = Math.floor(k.girdleBottom / step);
          for (let b = from; b <= to; b++) expect(bins.get(b)?.n ?? 0, `爪 ${i + 1}・${(b * step).toFixed(1)} mm`).toBeGreaterThan(0);
          // 柱は曲がった固まりではなく、まっすぐな柱：下の輪の少し上から縁の少し下まで、中心からの距離は高さに対してほぼまっすぐ変わる
          const pts: [number, number][] = [];
          for (let b = from + 2; b <= to - 1; b++) {
            const e = bins.get(b)!;
            pts.push([(b + 0.5) * step, e.sum / e.n]);
          }
          const n = pts.length;
          const mz = pts.reduce((t, p) => t + p[0], 0) / n;
          const mr = pts.reduce((t, p) => t + p[1], 0) / n;
          const slope = pts.reduce((t, p) => t + (p[0] - mz) * (p[1] - mr), 0) / pts.reduce((t, p) => t + (p[0] - mz) ** 2, 0);
          const worst = Math.max(...pts.map(([z, r]) => Math.abs(r - (mr + slope * (z - mz)))));
          // 前の形（縁の下で立ってから急に曲がる）は、三角の一体の形で 0.36〜0.39 mm 外れていた。今は 0.24 mm まで
          expect(worst, `爪 ${i + 1} のまっすぐからの外れ`).toBeLessThan(0.18 * s.prongs[i].diameterMm);
          // 柱は下へ行くほど中心に寄る（石に沿って下りる）
          expect(slope, `爪 ${i + 1}`).toBeGreaterThan(0.3);
        }
      }, 60000);
    }
  }
});
