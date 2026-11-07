import { describe, expect, it } from "vitest";
import { judgeTake, markOf, strokeStats } from "../src/craft/hand-judge";
import type { TakeMeasure } from "../src/craft/pair-measure";
import { GUIDES } from "../src/rules/guides";

const take = (hold: number | null, angle: number | null, strokes: number[]): TakeMeasure => ({ hold, angle, strokes, seen: { hold: 1, file: 1, tool: 1 } });
const NAMES = { hold: "押さえる手", tool: "ヤスリ" };
/** 2026-11-07 の いい例（職人が撮った手本）の値 */
const GOOD = take(0.27, 0.75, [3.11, 3.14, 3.09, 3.07, 3.02]);

describe("道具の扱いの判定（手本＝いい例と比べる。線は仮）", () => {
  it("線は GUIDES の仮の値：1.5 倍まで ○、2.5 倍まで △、それより悪いと ×", () => {
    expect(GUIDES.handJudge.okRatio).toBe(1.5);
    expect(GUIDES.handJudge.warnRatio).toBe(2.5);
    expect(markOf(1)).toBe("○");
    expect(markOf(1.5)).toBe("○");
    expect(markOf(1.51)).toBe("△");
    expect(markOf(2.5)).toBe("△");
    expect(markOf(2.51)).toBe("×");
  });

  it("手本どうしなら、3 つとも ○", () => {
    const rows = judgeTake(GOOD, GOOD, NAMES);
    expect(rows.map((r) => r.key)).toEqual(["hold", "angle", "stroke"]);
    expect(rows.map((r) => r.mark)).toEqual(["○", "○", "○"]);
    expect(rows[2].you).toBe("5 回・長さがそろう（手のひらの 3.0〜3.1 倍）");
  });

  it("2026-11-07 の よくない例：金属の固定 △・ヤスリの角度 △・ストローク ×（長さがばらばら）", () => {
    const bad = take(0.55, 1.48, [0.29, 4.37, 0.42]);
    const [hold, angle, stroke] = judgeTake(GOOD, bad, NAMES);
    expect(hold.mark).toBe("△");
    expect(hold.ratio!).toBeCloseTo(2.04, 1);
    expect(angle.mark).toBe("△");
    expect(angle.ratio!).toBeCloseTo(1.97, 1);
    expect(stroke.mark).toBe("×");
    expect(stroke.you).toBe("3 回・長さがばらばら（手のひらの 0.3〜4.4 倍）");
    // 2026-11-08：数に単位（手のひらの長さを 1 とした倍）を添える
    expect(hold.base).toBe("揺れ 手のひらの 0.27 倍");
    expect(hold.say).toContain("手本の");
    expect(stroke.say).toMatch(/^ストロークが安定していない/);
  });

  it("手本より良い値は 1 倍（○）として扱う", () => {
    const rows = judgeTake(GOOD, take(0.1, 0.5, [3.5, 3.4, 3.6, 3.5]), NAMES);
    expect(rows.every((r) => r.mark === "○")).toBe(true);
    expect(rows.every((r) => r.ratio === 1)).toBe(true);
  });

  it("短いがそろったストロークは「1 回の動きが短い」", () => {
    const stroke = judgeTake(GOOD, take(0.27, 0.75, [1.0, 1.05, 0.98, 1.02]), NAMES)[2];
    expect(stroke.mark).toBe("×");
    expect(stroke.say).toBe("1 回の動きが短い");
  });

  it("測れなかった項目は判定しない（○△× を付けず、わけを書く）", () => {
    const rows = judgeTake(GOOD, take(null, null, [2.9, 3.0]), NAMES);
    expect(rows.map((r) => r.mark)).toEqual([null, null, null]);
    expect(rows[0].say).toContain("押さえる手が映っていない");
    expect(rows[1].say).toContain("ヤスリの線が見つかったこまが少なく");
    expect(rows[2].say).toContain("往復を 3 回以上数えられず");
  });

  it("ストロークの様子：回数・真ん中・幅", () => {
    const s = strokeStats([0.29, 4.37, 0.42])!;
    expect(s.n).toBe(3);
    expect(s.mid).toBe(0.42);
    expect(s.spread).toBeCloseTo((4.37 - 0.29) / 0.42, 5);
    expect(strokeStats([])).toBeNull();
  });
});
