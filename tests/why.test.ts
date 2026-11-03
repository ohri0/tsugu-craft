import { describe, expect, it } from "vitest";
import { LIFE, chances, whyHtml } from "../src/studio/why";

describe("なぜ継ぐ", () => {
  it("20 年ごとの作り直しに、一人の職人が関われるのは 2 回ほど", () => {
    expect(chances(LIFE.start, LIFE.end, LIFE.cycle, LIFE.build, 12)).toBe(2);
    expect(chances(20, LIFE.end, LIFE.cycle, LIFE.build, 12)).toBe(3);
  });
  it("公に知られた例（式年遷宮）は出典つきの絵と一緒に出す（作者が決めた。2026-11-03）", () => {
    const html = whyHtml();
    expect(html).toContain("20 年に一度しか作り直さない技");
    expect(html).toContain("式年遷宮");
    expect(html).toContain("/heritage/naiku-goshinpozu.jpg");
    expect(html).toContain("パブリックドメイン");
  });
});
