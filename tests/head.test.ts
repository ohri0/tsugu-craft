// 石座（爪 ＋ 輪）は 1 つの部品で、腕の上にのせてロウ付けする（作者：2026-11-03）。
// 爪が 1 本ずつ下へのびて腕へささる形にしない。石座の下の端（下の輪の下の面）が、腕の上の溝に当たる。
import { describe, expect, it } from "vitest";
import { buildRing } from "../src/geometry/ring";
import { buildSetting, type SettingParams, type SettingResult, type TriangleRange } from "../src/geometry/setting";
import { GUIDES } from "../src/rules/guides";
import { stoneFrom, triangleStone } from "./helpers/stones";
import { ellipse } from "./helpers/synth";

const part = (a: Float32Array, r: TriangleRange) => a.subarray(r.start * 9, (r.start + r.count) * 9);
const roundStone = () => stoneFrom(ellipse(0, 0, 325, 325), 6.5, 3.9);

function minZ(a: Float32Array): number {
  let z = Infinity;
  for (let i = 2; i < a.length; i += 3) z = Math.min(z, a[i]);
  return z;
}

/** 爪の、下の輪より下にある点が、すべて下の輪のすぐそば（輪の線の太さ ＋ 爪の太さの内）にあるか */
function prongBottomsOnRail(s: SettingResult): boolean {
  const rail = part(s.positions, s.rings[1].triangles);
  const railPts: [number, number][] = [];
  for (let i = 0; i < rail.length; i += 3) railPts.push([rail[i], rail[i + 1]]);
  const lowZ = s.heights.lowerRingZ!;
  for (const p of s.prongs) {
    const a = part(s.positions, p.triangles);
    const reach = s.rings[1].wireMm / 2 + p.diameterMm;
    for (let i = 0; i < a.length; i += 3) {
      if (a[i + 2] >= lowZ) continue;
      let best = Infinity;
      for (const [x, y] of railPts) best = Math.min(best, Math.hypot(a[i] - x, a[i + 1] - y));
      if (best > reach) return false;
    }
  }
  return true;
}

const cases: [string, () => Omit<SettingParams, "style">][] = [
  ["ラウンド 4 本爪", () => ({ stone: roundStone(), prongCount: 4 })],
  ["ラウンド 6 本爪", () => ({ stone: roundStone(), prongCount: 6 })],
  ["三角・丸い爪 3 本（画面と同じ）", () => ({ stone: triangleStone(), vAtCorners: false })],
  ["三角・V 字の爪 3 本", () => ({ stone: triangleStone(), vAtCorners: true })],
];

describe("石座は 1 つの部品で、腕の上にのる（爪は腕へささらない）", () => {
  for (const [name, mk] of cases) {
    it(name, () => {
      const s = buildSetting({ ...mk(), style: "prong" });
      const h = s.heights;
      const wire = s.rings[0].wireMm;
      // 石座の下の端 ＝ 下の輪の下の面。腕の上の溝に、決めた深さだけ沈む
      expect(h.baseZ).toBeCloseTo(h.lowerRingZ! - wire / 2, 9);
      expect(h.shankTopZ - h.baseZ).toBeCloseTo(GUIDES.gallery.seatInShankRatio * wire, 9);
      // どの部分も、石座の下の端より下へ出ない
      expect(minZ(s.positions)).toBeGreaterThanOrEqual(h.baseZ - 1e-4);
      for (const p of s.prongs) expect(minZ(part(s.positions, p.triangles))).toBeGreaterThanOrEqual(h.baseZ - 1e-4);
      // 爪の下の端は下の輪の所にそろう（中心へ寄って 1 本の柱になったり、離れた所で腕へささったりしない）
      expect(prongBottomsOnRail(s)).toBe(true);
    }, 60000);
  }

  it("指輪に組むと、石座の下の端が腕のいちばん上に当たる（離れず、深くささらない）", () => {
    for (const [, mk] of cases) {
      const p = mk();
      const ring = buildRing({ stone: p.stone, setting: { ...p, style: "prong" }, shank: { gou: 11 } });
      const top = ring.shank.outerRadiusMm;
      const bottom = minZ(ring.ringPositions.setting);
      const wire = ring.setting.rings[0].wireMm;
      expect(bottom).toBeLessThan(top);
      expect(top - bottom).toBeLessThanOrEqual(wire / 2 + 1e-4);
    }
  }, 60000);

  it("一体の石座（画面の形）も、下の輪で腕にのる", () => {
    for (const stone of [roundStone(), triangleStone()]) {
      const ring = buildRing({
        stone,
        setting: { style: "prong", vAtCorners: false, solid: true, solidQuality: "preview" },
        shank: { gou: 11 },
      });
      const h = ring.setting.heights;
      const top = ring.shank.outerRadiusMm;
      const bottom = minZ(ring.ringPositions.setting);
      // 一体の形は格子とつなぎ目の丸みの分だけ、線の形よりわずかに下がる（0.05 mm まで）
      expect(bottom - ring.transform.translateZ).toBeGreaterThanOrEqual(h.baseZ - 0.05);
      expect(bottom).toBeLessThan(top);
      expect(top - bottom).toBeLessThanOrEqual(ring.setting.rings[0].wireMm / 2 + 0.05);
    }
  }, 120000);
});
