// 断面の溝の幅：0.3 mm より細い溝は止めない。黄色の注意だけ（職人 石川 2026-11-06「0.1 以下も黄色でいい。止めることはない」）
import { describe, expect, it } from "vitest";
import repo from "../ledger/jewelry.json";
import { openEdges } from "../src/cad/solid";
import { sectionCurveProblem } from "../src/geometry/section-input";
import { buildShank, type SectionPoint } from "../src/geometry/shank";
import { GROOVE_HAND_TEXT, checkShank, grooveNote, narrowGroove, outlineValleys } from "../src/rules/checks";
import { GUIDES } from "../src/rules/guides";
import { ruleForCheck, type Ledger } from "../src/rules/ledger";
import { bandGrooveNote, bandMesh, checkBand, defaultBand, normalizeBand, type Band } from "../src/studio/band";

const corner = (x: number, y: number): SectionPoint[] => [{ x, y }, { x, y }, { x, y }];

/** 縦の壁の溝を左右に 1 本ずつ持つ断面（溝の幅は mm。幅 w mm の腕で） */
function grooved(widthMm: number, w = 4): SectionPoint[] {
  const dx = widthMm / w;
  const half = [{ x: 1, y: 0 }, ...corner(1, 0.6), ...corner(0.5 + dx, 0.7), ...corner(0.5 + dx, 0.36), ...corner(0.5 - dx, 0.36), ...corner(0.5 - dx, 0.7), { x: 0, y: 1 }, { x: 0, y: 1 }];
  return [...half, ...[...half].reverse().filter((q) => q.x !== 0).map((q) => ({ x: -q.x, y: q.y }))];
}

const arm = (widthMm: number) => buildShank({ gou: 12, widthMm: 4, thicknessMm: 3, section: "free", sectionCurve: { points: grooved(widthMm) }, stations: [{ atDeg: 120, widthMm: 4, thicknessMm: 3 }] });
const band = (widthMm: number): Band => normalizeBand({ ...defaultBand(15.5, "K18 イエロー"), kind: "free", curve: { points: grooved(widthMm) }, top: { width: 4, thickness: 3 }, bottom: { width: 4, thickness: 3 }, dimsSet: true, gou: 12 });

describe("断面の溝の幅", () => {
  it("値は 1 か所にあり、作者の 0.3 mm", () => {
    expect(GUIDES.band.grooveCastMinMm).toBe(0.3);
  });

  it("0.3 mm 以上は、そのまま（注意なし）", () => {
    expect(grooveNote(arm(0.5))).toBeNull();
    expect(grooveNote(arm(0.31))).toBeNull();
    expect(bandGrooveNote(band(0.5))).toBeNull();
  });

  it.each([0.25, 0.1, 0.05, 0.02])("%s mm の溝：止めない。黄色の注意だけで、溝の幅と分かる言葉", (w) => {
    const sh = arm(w);
    expect(sectionCurveProblem(grooved(w))).toBeNull();
    expect(checkShank(sh).map((p) => p.check)).not.toContain("band-groove");
    const n = grooveNote(sh)!;
    expect(n.where).toContain("溝の幅");
    expect(n.text).toBe(GROOVE_HAND_TEXT);
    expect(n.text).toContain("あとから手で彫ります");
    expect(n.widthMm).toBeCloseTo(w, 1);

    const b = band(w);
    expect(checkBand(b).map((p) => p.check)).toEqual([]);
    expect(bandGrooveNote(b)!.where).toContain("溝の幅");
  });

  it("形の処理は、細い溝でも閉じた形を作る", () => {
    for (const w of [0.3, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.001]) {
      expect(openEdges(arm(w).positions)).toBe(0);
      expect(openEdges(bandMesh(band(w)).positions)).toBe(0);
    }
  });

  it("V の字の溝は、底の細さで細いと言わない（深さの半分の高さで測る）", () => {
    const v = outlineValleys([[2, 0], [2, 1], [1.2, 1.6], [1, 1], [0.8, 1.6], [0, 2], [-0.8, 1.6], [-1, 1], [-1.2, 1.6], [-2, 1], [-2, 0]]);
    expect(v.length).toBe(2);
    expect(v[0].widthMm).toBeCloseTo(0.2, 6);
    const wide = outlineValleys([[2, 0], [2, 1], [1.6, 1.6], [1, 1], [0.4, 1.6], [0, 2], [-0.4, 1.6], [-1, 1], [-1.6, 1.6], [-2, 1], [-2, 0]]);
    expect(wide[0].widthMm).toBeCloseTo(0.6, 6);
    expect(narrowGroove([{ label: "", pts: wide.length ? [[2, 0], [2, 1], [1.6, 1.6], [1, 1], [0.4, 1.6], [0, 2], [-0.4, 1.6], [-1, 1], [-1.6, 1.6], [-2, 1], [-2, 0]] : [] }])).toBeNull();
  });

  it("帳面に職人の言葉がある（出どころは職人 石川、2026-11-06）。作れない所にはしない", () => {
    const r = ruleForCheck(repo as unknown as Ledger, "band-groove")!;
    expect(r.source).toEqual({ kind: "craftsman", name: "石川" });
    expect(r.date).toBe("2026-11-06");
    expect(r.quote).toContain("0.3 より細いのは");
    expect(r.text).toContain("手で彫る");
  });
});
