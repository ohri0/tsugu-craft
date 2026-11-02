import { describe, expect, it } from "vitest";
import { LIFE, chances, whyHtml } from "../src/studio/why";

describe("なぜ継ぐ", () => {
  it("20 年ごとの作り直しに、一人の職人が関われるのは 2〜3 回", () => {
    expect(chances(LIFE.start, LIFE.end, LIFE.cycle, LIFE.build, 12)).toBe(2);
    expect(chances(20, LIFE.end, LIFE.cycle, LIFE.build, 12)).toBe(3);
  });
  it("特定の計画の名前を書かない", () => {
    const html = whyHtml();
    expect(html).toContain("20 年に一度しか作り直さない技");
    expect(html).not.toMatch(/神宮|遷宮|神宝/);
  });
});
