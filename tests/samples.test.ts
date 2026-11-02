import { describe, expect, it } from "vitest";
import { SAMPLE_DESIGNS, SAMPLE_NOTE, isSample, outlineThumb, sampleState, sampleStone, tuneSample } from "../src/studio/samples";
import { RingSession } from "../src/studio/session";
import { addRule, seedLedger, type Ledger } from "../src/rules/ledger";

const build = (ledger: Ledger) =>
  SAMPLE_DESIGNS.map((d) => {
    const s = new RingSession(sampleStone(d.preset).stone, () => ledger, () => undefined, () => "");
    s.state = sampleState(d);
    tuneSample(s);
    return s.build("見本").problems.length;
  });

describe("見本の作品", () => {
  it("どの見本も、よくある形の石から組め、今の目安では作れる形から始まる", () => {
    for (const d of SAMPLE_DESIGNS) {
      expect(sampleStone(d.preset).stone.outlineMm.length).toBeGreaterThan(3);
    }
    expect(build(seedLedger())).toEqual(SAMPLE_DESIGNS.map(() => 0));
  });
  it("職人が「指の上は 2.5 mm 空ける」と決めると、作れなくなる見本と、作れるままの見本が混ざる", () => {
    const strict = addRule(seedLedger(), { title: "すき間", text: "2.5 mm", reason: "汗", param: "height.minFingerGapMm", value: 2.5, source: { kind: "craftsman", name: "石川" }, date: "2026-11-03" });
    const n = build(strict);
    expect(n.some((x) => x > 0)).toBe(true);
    expect(n.some((x) => x === 0)).toBe(true);
  });
  it("見本は見本と分かる", () => {
    expect(isSample({ maker: "見本" })).toBe(true);
    expect(isSample({ maker: "石川" })).toBe(false);
    expect(SAMPLE_NOTE).toContain("職人の作品ではありません");
    expect(outlineThumb(sampleStone("round").stone)).toMatch(/^data:image\/svg\+xml/);
  });
});
