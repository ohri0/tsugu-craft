import { describe, expect, it } from "vitest";
import { parseAskAnswer } from "../src/claude/answer";
import { findRules } from "../src/rules/search";
import repo from "../ledger/jewelry.json";
import { activeRules, type Ledger } from "../src/rules/ledger";

describe("聞くの返事を分ける", () => {
  it("答え・なぜ・決まりの行を読む", () => {
    const a = parseAskAnswer("答え：相手の面に合わせて削る。\nなぜ：すき間があるとロウが流れない。\n決まり：[match-face] [nai]", ["match-face"]);
    expect(a.short).toBe("相手の面に合わせて削る。");
    expect(a.why).toBe("すき間があるとロウが流れない。");
    expect(a.ruleIds).toEqual(["match-face"]);
  });
  it("形が崩れていても最初の行を答えにする", () => {
    const a = parseAskAnswer("**相手に合わせます。**\n[match-face] によると…", ["match-face"]);
    expect(a.short).toBe("相手に合わせます。");
    expect(a.why).toBe("");
    expect(a.ruleIds).toEqual(["match-face"]);
  });
});

describe("目安帳から近い決まりを探す", () => {
  const rules = activeRules(repo as Ledger);
  it("ロウ付けの前の削り方の質問で、石川さんの決まりが見つかる", () => {
    const found = findRules("ロウ付けの前に、どう削ればいい？", rules);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].text + found[0].title).toMatch(/ロウ付け|削/);
  });
  it("関係のない質問では見つからない", () => {
    expect(findRules("今日の天気は？", rules)).toEqual([]);
  });
});
