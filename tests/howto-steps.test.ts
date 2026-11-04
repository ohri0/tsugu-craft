// 技の頁の「作り方」：どの技も同じ形で、工程に出どころがあるか。数字は出どころのある工程だけか。
import { describe, expect, it } from "vitest";
import { HOWTO, howtoText, type HowtoId } from "../src/rules/howto-steps";
import { TECH_IDS } from "../src/rules/techniques";

const IDS: HowtoId[] = ["ring", ...TECH_IDS];

describe("作り方（技の頁の ①）", () => {
  it("指輪の石留めと六つの技に、4 工程以上の作り方がある。魚々子はない", () => {
    expect(Object.keys(HOWTO).sort()).toEqual([...IDS].sort());
    for (const id of IDS) expect(HOWTO[id].steps.length, id).toBeGreaterThanOrEqual(4);
  });

  for (const id of IDS) {
    it(`${id}：どの工程にも、https の出どころがある`, () => {
      for (const s of HOWTO[id].steps) {
        expect(s.title.length).toBeGreaterThan(0);
        expect(s.text.length).toBeGreaterThan(0);
        expect(s.sources.length, s.title).toBeGreaterThan(0);
        for (const x of s.sources) expect(x.url).toMatch(/^https:\/\//);
      }
    });
    it(`${id}：数字のある工程は、確かめた出どころがあるか「未確認」と書いてある`, () => {
      for (const s of HOWTO[id].steps) {
        if (!/\d/.test(s.text + (s.fail ?? ""))) continue;
        const checked = s.sources.some((x) => !x.unverified);
        expect(checked || s.unverified === true, s.title).toBe(true);
      }
    });
  }

  it("指輪の石留めには名前と説明がある", () => {
    expect(HOWTO.ring.name).toBe("指輪の石留め");
    expect(HOWTO.ring.lead!.length).toBeGreaterThan(0);
  });

  it("Claude に渡す文に、工程と出どころが入る", () => {
    const t = howtoText("mokume");
    expect(t).toContain("1. 色金（いろがね）を選ぶ");
    expect(t).toContain("出どころ：");
  });
});
