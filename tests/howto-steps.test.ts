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

  // 2026-11-04 職人の言葉：脂は重曹・洗剤で落とす。大根おろしの汁は脱脂ではなく、そのあと 10 分ほど浸す
  it("煮色の前に、重曹・洗剤で脂を落とし、それから大根おろしの汁に浸す（職人の言葉と、公開の資料）", () => {
    const steps = HOWTO.mokume.steps;
    const de = steps.findIndex((x) => x.title.includes("重曹"));
    const dk = steps.findIndex((x) => x.title.includes("大根"));
    const niiro = steps.findIndex((x) => x.title.startsWith("煮色"));
    expect(de).toBeGreaterThanOrEqual(0);
    expect(dk).toBe(de + 1);
    expect(dk).toBeLessThan(niiro);
    // 大根おろしを「脱脂」とは言わない
    expect(steps[dk].title).not.toContain("脱脂");
    expect(steps[de].title).not.toContain("大根");
    for (const s of [steps[de], steps[dk]]) {
      expect(s.sources.some((x) => x.craftsman), s.title).toBe(true);
      expect(s.sources.some((x) => !x.craftsman && !x.weak && !x.unverified), s.title).toBe(true);
      expect(s.checkedBy, s.title).toContain("石川工房");
    }
  });

  // 2026-11-04 職人の言葉：焼きなましたら、ゆっくり冷ます（水で急に冷やすと曲がる）
  it("焼きなましの工程は、石川工房の「ゆっくり冷ます」が本文で、水で冷やすは小さな注だけ", () => {
    const anneal: [HowtoId, string][] = [
      ["ring", "地金を焼きなます"],
      ["bezel", "覆輪（輪）の帯を作る"],
      ["tsuchime", "焼きなましてから打つ"],
      ["kebori", "地金を切り出し、焼きなます"],
      ["mokume", "鍛えて、のばす（焼きなましをはさむ）"],
    ];
    for (const [id, title] of anneal) {
      const s = HOWTO[id].steps.find((x) => x.title === title)!;
      expect(s, title).toBeDefined();
      expect(s.text, title).toMatch(/石川工房：[^。]*ゆっくり冷ます（水で急に冷やすと曲がる）/);
      expect(s.sources.some((x) => x.craftsman), title).toBe(true);
      const note = s.text.indexOf("小さな注");
      const water = s.text.indexOf("水で冷やす");
      if (water >= 0) expect(note >= 0 && water > note, title).toBe(true);
    }
  });

  it("職人の言葉のある工程は、本文に「石川工房」と書く", () => {
    for (const id of IDS)
      for (const s of HOWTO[id].steps) if (s.sources.some((x) => x.craftsman)) expect(s.text, s.title).toContain("石川工房");
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
