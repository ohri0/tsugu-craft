// 帳面ごとの比べの表と、実際に帳面を切り替えた後の爪の太さが同じこと（2026-11-05 点検：表 1.57 mm、切り替えると 1.66 mm）
import { describe, expect, it } from "vitest";
import repo from "../ledger/jewelry.json";
import { FIXES } from "../src/rules/checks";
import { seedLedger, type Ledger } from "../src/rules/ledger";
import { DEFAULT_STATE, RingSession, tuneProngMm, underLedger } from "../src/studio/session";
import { PRESETS, presetOutline } from "../src/studio/presets";

const stoneOf = (id: string, k = 1) => {
  const p = PRESETS.find((x) => x.id === id)!;
  const q = { ...p, longMm: p.longMm * k, widthMm: p.widthMm * k, depthMm: p.depthMm * k };
  return { outlineMm: presetOutline(q), longMm: q.longMm, widthMm: q.widthMm, depthMm: q.depthMm };
};

describe("帳面ごとの比べ", () => {
  const books: [string, Ledger][] = [["公開情報だけ", seedLedger()], ["職人の決まり入り", repo as Ledger]];

  for (const id of ["round", "pear", "oval", "marquise"])
    for (const k of [0.8, 1, 1.5])
      it(`${id} ×${k}：表の数は、切り替えた後の数と同じ`, () => {
        const stone = stoneOf(id, k);
        // 今の帳面で手で太さを決めた設計から、帳面を切り替える
        let now: Ledger = seedLedger();
        const s = new RingSession(stone, () => now, () => undefined, () => "");
        s.state = { ...DEFAULT_STATE, prongMm: 1.3 };
        s.build("手で");
        for (const [, book] of books) {
          const table = underLedger(stone, s.snapshot(), book);
          // 切り替え：手で決めた太さを外し、決め直して組む
          now = book;
          s.state.prongMm = undefined;
          tuneProngMm(s);
          const after = s.build("帳面を切り替えた");
          expect(table.ring.setting.prongs[0]?.diameterMm).toBeCloseTo(after.ring.setting.prongs[0]?.diameterMm ?? 0, 6);
          expect(table.problems.map((p) => p.check)).toEqual(after.problems.map((p) => p.check));
        }
      });

  it("比べても、今の設計は変わらない", () => {
    const s = new RingSession(stoneOf("round"), seedLedger, () => undefined, () => "");
    s.state = { ...DEFAULT_STATE, prongMm: 1.3 };
    s.build("手で");
    const before = s.snapshot();
    underLedger(s.stone, s.snapshot(), repo as Ledger);
    expect(s.snapshot()).toEqual(before);
  });
});

describe("直し方の名前", () => {
  it("押しても形を変えない直し方は、直すと言わず、行き先を言う", () => {
    expect(FIXES.bluntTip.label).toContain("断面を直す");
  });
});
