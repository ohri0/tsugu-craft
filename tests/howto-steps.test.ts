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
        for (const x of s.sources) {
          // 公開の頁は https の URL と、何を言っているかを持つ。職人の言葉だけは URL が無い
          if (x.craftsman) expect(x.url, s.title).toBeUndefined();
          else expect(x.url, s.title).toMatch(/^https:\/\//);
          expect((x.confirms ?? "").length, `${s.title}：${x.label}`).toBeGreaterThan(0);
        }
        // 弱い出どころ（店・ブログなど）だけの工程は「未確認」
        if (s.sources.every((x) => x.weak || x.unverified)) expect(s.unverified, s.title).toBe(true);
      }
    });
    it(`${id}：数字のある工程は、確かめた出どころがあるか「未確認」と書いてある`, () => {
      for (const s of HOWTO[id].steps) {
        if (!/\d/.test(s.text + (s.fail ?? ""))) continue;
        const checked = s.sources.some((x) => !x.unverified && !x.weak);
        expect(checked || s.unverified === true, s.title).toBe(true);
      }
    });
  }

  it("煮色の前に、大根おろしで脱脂する（職人の言葉と、公開の資料）", () => {
    const s = HOWTO.mokume.steps.find((x) => x.text.includes("大根"))!;
    expect(s).toBeDefined();
    expect(s.sources.some((x) => x.craftsman)).toBe(true);
    expect(s.sources.some((x) => !x.craftsman && !x.weak && !x.unverified)).toBe(true);
    const niiro = HOWTO.mokume.steps.findIndex((x) => x.title.includes("煮色"));
    expect(HOWTO.mokume.steps.indexOf(s)).toBeLessThan(niiro);
  });

  it("職人の言葉は、大根おろしの工程だけ", () => {
    for (const id of IDS)
      for (const s of HOWTO[id].steps) if (s.sources.some((x) => x.craftsman)) expect(s.text, s.title).toContain("大根");
  });

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
