// 腕の断面（甲丸・平打ち・半甲丸・角・手で描く）：形がすき間なく閉じ、重さが断面に合って変わり、
// 細い・薄い腕は確かめで引っかかり、どの断面でも石座が腕の上にのる
import { describe, expect, it } from "vitest";
import { openEdges } from "../src/cad/solid";
import { buildRing } from "../src/geometry/ring";
import { SHANK_SECTIONS, buildShank, cleanPoints, freeOutline, sectionControlPoints, sectionOutline, type ShankSection } from "../src/geometry/shank";
import { checkRing } from "../src/rules/checks";
import { GUIDES } from "../src/rules/guides";
import { dragPoint, startShape } from "../src/studio/section-edit";
import { RingSession } from "../src/studio/session";
import { seedLedger } from "../src/rules/ledger";
import { stoneFrom, triangleStone } from "./helpers/stones";
import { ellipse } from "./helpers/synth";

const roundStone = () => stoneFrom(ellipse(0, 0, 325, 325), 6.5, 3.9);

function zMax(a: Float32Array): number {
  let z = -Infinity;
  for (let i = 2; i < a.length; i += 3) z = Math.max(z, a[i]);
  return z;
}

describe("腕の断面", () => {
  it("どの断面も、すき間なく閉じた形で、いちばん上が 内径 ÷ 2 ＋ 厚み", () => {
    for (const section of [...SHANK_SECTIONS, "free"] as ShankSection[]) {
      const sh = buildShank({ gou: 11, section, widthMm: 2.4, thicknessMm: 1.6 });
      expect(openEdges(sh.positions), section).toBe(0);
      expect(sh.volumeMm3, section).toBeGreaterThan(0);
      expect(zMax(sh.positions), section).toBeCloseTo(sh.innerRadiusMm + 1.6, 2);
      expect(sh.section).toBe(section);
    }
  });

  it("同じ幅と厚みなら、重さは 甲丸 < 半甲丸 < 平打ち < 角（断面の面積の順）", () => {
    const g = (section: ShankSection) => buildShank({ gou: 11, section, widthMm: 2.4, thicknessMm: 1.6 }).weightG;
    expect(g("kouman")).toBeLessThan(g("hangouman"));
    expect(g("hangouman")).toBeLessThan(g("hirauchi"));
    expect(g("hirauchi")).toBeLessThan(g("kaku"));
    // 甲丸は半楕円（面積 π/4 × 幅 × 厚み）、角は四角に近い（幅 × 厚み）。重さの比はおよそ 0.79 と 1 の比
    const ratio = g("kouman") / g("kaku");
    expect(ratio).toBeGreaterThan(0.72);
    expect(ratio).toBeLessThan(0.86);
  });

  it("角は、厚みを決めなければ幅と同じ（四角）", () => {
    const sh = buildShank({ gou: 11, section: "kaku", widthMm: 2.2 });
    expect(sh.thicknessMm).toBeCloseTo(2.2, 9);
  });

  it("甲丸は、これまでの形のまま（断面を書かないときと同じ）", () => {
    const a = buildShank({ gou: 11 });
    const b = buildShank({ gou: 11, section: "kouman" });
    expect(b.volumeMm3).toBeCloseTo(a.volumeMm3, 9);
  });

  it("手で描く：決まった断面の点から始めると、元の断面に近い形になる", () => {
    for (const section of SHANK_SECTIONS) {
      const preset = buildShank({ gou: 11, section, widthMm: 2.4, thicknessMm: 1.6 }).volumeMm3;
      const drawn = buildShank({ gou: 11, section: "free", sectionPoints: sectionControlPoints(section), widthMm: 2.4, thicknessMm: 1.6 }).volumeMm3;
      expect(Math.abs(drawn / preset - 1), section).toBeLessThan(0.05);
    }
  });

  it("手で描いた線は、幅の端が ±1、真ん中がいちばん高い 1、左右が同じ", () => {
    const out = freeOutline([{ x: 0, y: 1 }, { x: 0.6, y: 0.9 }, { x: 0.9, y: 0.4 }, { x: 1, y: 0 }]);
    const xs = out.map(([x]) => x);
    expect(Math.max(...xs)).toBeCloseTo(1, 6);
    expect(Math.min(...xs)).toBeCloseTo(-1, 1);
    expect(Math.max(...out.map(([, y]) => y))).toBeLessThanOrEqual(1);
    const mid = out.reduce((best, p) => (Math.abs(p[0]) < Math.abs(best[0]) ? p : best));
    expect(mid[1]).toBeCloseTo(1, 2);
    // 左右同じ：+x と −x の同じ所の高さ
    const at = (x: number) => out.reduce((best, p) => (Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best))[1];
    expect(at(0.5)).toBeCloseTo(at(-0.5), 1);
  });

  it("手で描いた点は整える：真ん中より高い点は真ん中の高さまで、x は順に、端は内側", () => {
    const p = cleanPoints([{ x: 0.3, y: 0.5 }, { x: 0.2, y: 0.9 }, { x: 0.8, y: 0.4 }, { x: 0.9, y: 0.3 }]);
    expect(p[0]).toEqual({ x: 0, y: 0.5 });
    expect(p[1].y).toBeLessThanOrEqual(0.5);
    expect(p[3].y).toBe(0);
    for (let i = 1; i < p.length; i++) expect(p[i].x).toBeGreaterThanOrEqual(p[i - 1].x);
  });

  it("決まった断面の線も、幅の端が ±1、真ん中が 1", () => {
    for (const section of SHANK_SECTIONS) {
      const out = sectionOutline(section);
      expect(Math.max(...out.map(([x]) => x)), section).toBeCloseTo(1, 6);
      const mid = out.reduce((best, p) => (Math.abs(p[0]) < Math.abs(best[0]) ? p : best));
      expect(mid[1], section).toBeCloseTo(1, 2);
    }
  });
});

describe("断面を手で描く画面の計算", () => {
  it("真ん中の点を下げると厚みが、端の点を外へ出すと幅が変わる", () => {
    const s0 = startShape("hirauchi", undefined, 2.2, 1.6);
    const thin = dragPoint(s0, 0, 0, 0.8);
    expect(thin.thicknessMm).toBeCloseTo(0.8, 6);
    expect(thin.widthMm).toBeCloseTo(2.2, 6);
    expect(thin.section).toBe("free");
    const wide = dragPoint(s0, s0.points.length - 1, 1.6, 0);
    expect(wide.widthMm).toBeCloseTo(3.2, 6);
    expect(wide.thicknessMm).toBeCloseTo(1.6, 6);
  });

  it("間の点は真ん中より上へ行かない", () => {
    const s0 = startShape("kouman", undefined, 2.2, 1.6);
    const s1 = dragPoint(s0, 2, 0.8, 3);
    expect(s1.points[2].y).toBeLessThanOrEqual(s1.points[0].y);
    expect(s1.thicknessMm).toBeCloseTo(1.6, 6);
  });
});

describe("指輪の腕の確かめ（断面によらず）", () => {
  it("目安より薄い・細い腕は、確かめで引っかかる（腕を赤くする場所つき）", () => {
    const ring = buildRing({ stone: roundStone(), setting: { style: "prong" }, shank: { gou: 11, section: "free", sectionPoints: sectionControlPoints("hirauchi"), widthMm: 1.5, thicknessMm: 1.0 } });
    const probs = checkRing(ring);
    const thin = probs.find((p) => p.check === "band-thin");
    const narrow = probs.find((p) => p.check === "band-narrow");
    expect(thin?.requiredValue).toBe(GUIDES.band.minThicknessMm);
    expect(narrow?.requiredValue).toBe(GUIDES.band.minWidthMm);
    expect(thin?.target.kind).toBe("shank");
    expect(thin?.options[0].id).toBe("thickerBand");
  });

  it("目安どおりの腕なら、どの断面でも引っかからない", () => {
    for (const section of SHANK_SECTIONS) {
      const ring = buildRing({ stone: roundStone(), setting: { style: "prong" }, shank: { gou: 11, section } });
      expect(checkRing(ring).filter((p) => p.check.startsWith("band")), section).toEqual([]);
    }
  });

  it("どの断面でも、石座の下の端が腕のいちばん上に当たる", () => {
    for (const section of [...SHANK_SECTIONS, "free"] as ShankSection[]) {
      const ring = buildRing({ stone: triangleStone(), setting: { style: "prong", vAtCorners: false }, shank: { gou: 11, section } });
      const top = ring.shank.outerRadiusMm;
      let bottom = Infinity;
      const a = ring.ringPositions.setting;
      for (let i = 2; i < a.length; i += 3) bottom = Math.min(bottom, a[i]);
      expect(bottom, section).toBeLessThan(top);
      expect(top - bottom, section).toBeLessThanOrEqual(ring.setting.rings[0].wireMm / 2 + 1e-4);
    }
  }, 60000);

  it("set_shank で断面を変えると、地金の重さが変わり、腕の状態に断面が出る", () => {
    const s = new RingSession(roundStone(), () => seedLedger(), () => undefined, () => "");
    const a = s.setShank({ reason: "そのまま" });
    const b = s.setShank({ section: "hirauchi", reason: "平打ちに" });
    const c = s.setShank({ section: "kaku", reason: "角に" });
    expect(a.shank.section).toBe("kouman");
    expect(b.shank.section).toBe("hirauchi");
    expect(b.weight_g).toBeGreaterThan(a.weight_g);
    expect(c.weight_g).toBeGreaterThan(b.weight_g);
    // 手で描いた点を渡すと、断面は free
    const d = s.setShank({ section_points: sectionControlPoints("hangouman"), reason: "描いた" });
    expect(d.shank.section).toBe("free");
    // 断面の名前を選び直すと、描いた点は消える
    s.setShank({ section: "kouman", reason: "戻す" });
    expect(s.state.sectionPoints).toBeUndefined();
  });
});
