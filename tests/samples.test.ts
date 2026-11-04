import { describe, expect, it } from "vitest";
import { SAMPLE_DESIGNS, SAMPLE_NOTE, fixProngSize, isSample, outlineThumb, sampleState, sampleStone, tuneSample } from "../src/studio/samples";
import { RingSession } from "../src/studio/session";
import { addRule, seedLedger, type Ledger } from "../src/rules/ledger";

const build = (ledger: Ledger) =>
  SAMPLE_DESIGNS.map((d) => {
    const s = new RingSession(sampleStone(d.preset, d.sizeMm).stone, () => ledger, () => undefined, () => "");
    s.state = sampleState(d);
    tuneSample(s);
    return s.build("見本").problems.length;
  });
/** 見本を今の目安で作って記録し（爪の太さは決まる）、あとから帳面を変えて確かめ直す */
const recheck = (later: Ledger) =>
  SAMPLE_DESIGNS.map((d) => {
    let ledger = seedLedger();
    const s = new RingSession(sampleStone(d.preset, d.sizeMm).stone, () => ledger, () => undefined, () => "");
    s.state = sampleState(d);
    tuneSample(s);
    fixProngSize(s);
    ledger = later;
    return s.build("確かめ直す").problems.map((p) => p.check);
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
  it("職人が「爪は最低 0.7 mm」と決めると、小粒の見本だけ、爪が細くて留まりが弱いと分かる（記録の爪は勝手に太くならない）", () => {
    const prong = addRule(seedLedger(), { title: "爪の太さ", text: "最低 0.7 mm", reason: "細すぎると曲がって石が落ちる", param: "prong.minDiameterMm", value: 0.7, source: { kind: "craftsman", name: "工房 B" }, date: "2026-11-05" });
    const r = recheck(prong);
    const small = SAMPLE_DESIGNS.findIndex((d) => d.label === "小粒");
    expect(r[small]).toContain("prong-thin");
    expect(r.filter((x, i) => i !== small).every((x) => x.length === 0)).toBe(true);
    expect(sampleStone("round", 3.5).stone.longMm).toBeCloseTo(3.5);
  });
  it("見本は見本と分かる", () => {
    expect(isSample({ maker: "見本" })).toBe(true);
    expect(isSample({ maker: "石川" })).toBe(false);
    expect(SAMPLE_NOTE).toContain("職人の作品ではありません");
    expect(outlineThumb(sampleStone("round").stone)).toMatch(/^data:image\/svg\+xml/);
  });
});
