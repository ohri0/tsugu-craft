import { describe, expect, it } from "vitest";
import { pickPublished, validRun } from "../src/rebuild/runs";

const h = { steps: [{ title: "重ねる", detail: "板を重ねる", clue_ids: ["C1"], basis: "clue", confidence: 2 }], trials: [], summary: "" };
const run = (o: Record<string, unknown> = {}) => ({ technique: "mokume", condition: "observe", date: "2026-11-04", hypothesis: h, ...o });

describe("組み立て直しの公開の記録", () => {
  it("書き出した形だけを受け取る", () => {
    expect(validRun(run())).toBe(true);
    expect(validRun({ ...run(), hypothesis: { steps: "x" } })).toBe(false);
    expect(validRun({ technique: "mokume" })).toBe(false);
    expect(validRun(run({ grade: { steps: [], missed: [] } }))).toBe(true);
    expect(validRun(run({ grade: { steps: 1 } }))).toBe(false);
  });
  it("技と渡し方ごとに、新しい 1 つ。同じ日なら答え合わせまであるもの。公開の印が付く", () => {
    const out = pickPublished([run({ date: "2026-11-03" }), run(), run({ grade: { steps: [], missed: [] } }), run({ condition: "all" }), { bad: true }]);
    expect(out).toHaveLength(2);
    const ob = out.find((r) => r.condition === "observe")!;
    expect(ob.date).toBe("2026-11-04");
    expect(ob.grade).toBeDefined();
    expect(out.every((r) => r.published)).toBe(true);
  });
});
