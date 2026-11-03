import { describe, expect, it } from "vitest";
import { summarize, sweepDesigns, sweepOne } from "../src/studio/sweep";
import { addRule, seedLedger } from "../src/rules/ledger";

const craft = addRule(seedLedger(), { title: "爪", text: "爪", reason: "落ちる", param: "prong.minDiameterMm", value: 0.7, bySize: [{ upToMm: 3, value: 0.6 }, { upToMm: null, value: 0.7 }], source: { kind: "craftsman", name: "石川" }, date: "2026-11-03" });

describe("一言が、よくある設計にどこまで効くか", () => {
  it("よくある設計は 270（形 6 × 大きさ 5 × 高さ 3 × 号 3）", () => {
    expect(sweepDesigns()).toHaveLength(270);
  });
  it("公開情報と職人の決まりで組み比べ、爪の太さと重さの差を数える", () => {
    const ds = sweepDesigns();
    const big = ds.find((d) => d.preset.id === "round" && d.scale === 1.25 && d.height === "standard" && d.gou === 11)!;
    const r = sweepOne(big, seedLedger(), craft);
    expect(r.after.prongMm).toBeLessThan(r.before.prongMm);
    expect(r.after.weightG).toBeLessThan(r.before.weightG);
    const s = summarize([r]);
    expect(s.changed).toBe(1);
    expect(s.weightDiffG).toBeLessThan(0);
  });
});
