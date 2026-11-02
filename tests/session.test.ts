import { describe, expect, it } from "vitest";
import { RingSession } from "../src/studio/session";
import { seedLedger, addRule } from "../src/rules/ledger";
import { stoneFrom } from "./helpers/stones";
import { triangle } from "./helpers/synth";

const stone = stoneFrom(triangle(200, 200, 160, 140), 8.88, 4.24);

describe("指輪の設計の場（Claude の道具を、人と同じ関数で）", () => {
  it("set_setting で形が変わり、check は根拠つきの問題と、通った項目を返す", () => {
    let ledger = seedLedger();
    let changes = 0;
    const s = new RingSession(stone, () => ledger, () => changes++, () => "");
    s.build();
    const r = s.setSetting({ prong_mm: 0.4, reason: "細くしてみる" });
    expect(r.setting.prong_mm).toBeCloseTo(0.4, 2);
    const c = s.check();
    expect(c.problems.some((p) => p.check === "爪の太さ")).toBe(true);
    expect(c.problems.find((p) => p.check === "爪の太さ")!.reason).toContain("根拠");
    expect(c.passed.length).toBeGreaterThan(0);
    expect(changes).toBeGreaterThanOrEqual(2);
    // 直し方には、見た目への影響と、使える道具の例がつく
    const opt = c.problems.find((p) => p.check === "爪の太さ")!.options[0];
    expect(opt.appearance.length).toBeGreaterThan(0);
  });
  it("職人が決まりを足すと、同じ設計でも確かめが変わる", () => {
    let ledger = seedLedger();
    const s = new RingSession(stone, () => ledger, () => undefined, () => "");
    s.setSetting({ height: "low", reason: "低め" });
    const before = s.check().problems.length;
    // 石の一番下と指のすき間を 2 mm 以上に、という職人の決まり
    ledger = addRule(ledger, { title: "すき間は 2 mm", text: "石の一番下と指の間は 2 mm 空ける", reason: "汗と汚れがたまる", param: "height.minFingerGapMm", value: 2, source: { kind: "craftsman", name: "石川" }, date: "2026-11-03" });
    s.build("決まりが変わった");
    const after = s.check();
    expect(after.problems.length).toBeGreaterThan(before);
    expect(after.problems.find((p) => p.check === "石の一番下と指のすき間")!.reason).toContain("石川");
  });
  it("snapshot と restore で、Claude の作業を戻せる", () => {
    const s = new RingSession(stone, () => seedLedger(), () => undefined, () => "");
    s.build();
    const snap = s.snapshot();
    s.setSetting({ style: "bezel", reason: "覆輪" });
    s.setShank({ gou: 15, reason: "号を変える" });
    s.restore(snap);
    expect(s.state.style).toBe("prong");
    expect(s.state.gou).toBe(snap.gou);
  });
});
