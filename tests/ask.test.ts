import { describe, expect, it } from "vitest";
import { parseAskAnswer } from "../src/claude/answer";
import { findRules, prongSizeAnswer, stoneSizeInQuestion } from "../src/rules/search";
import repo from "../ledger/jewelry.json";
import { activeRules, removeRule, type Ledger } from "../src/rules/ledger";

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
  it("決まりの行に [ ] がなくても、帳面にある id だけ拾う（2026-11-07 の試し）", () => {
    const a = parseAskAnswer("答え：ゆっくり冷ます。\nなぜ：曲がらない。\n決まり：rule-solder-slow-cool-ishikawa no-hot-quench-stones made-up", ["rule-solder-slow-cool-ishikawa", "no-hot-quench-stones"]);
    expect(a.ruleIds).toEqual(["rule-solder-slow-cool-ishikawa", "no-hot-quench-stones"]);
    expect(parseAskAnswer("答え：x\n決まり：[a-b] a-b", ["a-b"]).ruleIds).toEqual(["a-b"]);
  });
});

describe("目安帳から近い決まりを探す", () => {
  const rules = activeRules(repo as Ledger);
  it("爪の太さの質問で、石川さんの決まりが見つかる", () => {
    const found = findRules("メレの爪の太さは？", rules);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].text + found[0].title).toMatch(/爪/);
  });
  it("関係のない質問では見つからない", () => {
    expect(findRules("今日の天気は？", rules)).toEqual([]);
  });
});

describe("石の大きさと爪の問いは、帳面の値で答える", () => {
  const rules = activeRules(repo as Ledger);
  it("問いから石の大きさを読む", () => {
    expect(stoneSizeInQuestion("9 mm くらいの石の爪は、何 mm にする？")).toBe(9);
    expect(stoneSizeInQuestion("６．５ミリの石の爪は？")).toBe(6.5);
    expect(stoneSizeInQuestion("爪の太さは？")).toBeUndefined();
  });
  it("最初の例：9 mm の石の爪を、職人の決まりの線から答える（角の話を答えない）", () => {
    const a = prongSizeAnswer("9 mm くらいの石の爪は、何 mm にする？", rules)!;
    expect(a.rule.id).toBe("rule-prong-min-ishikawa");
    expect(a.short).toContain("0.71 mm");
    expect(a.short).toContain("最後は職人が決める");
    expect(a.why).toContain("線を伸ばした値");
  });
  it("点の間の石は、点をつないだ値で答える", () => {
    const a = prongSizeAnswer("6.5 mm の石の爪は何 mm？", rules)!;
    expect(a.short).toContain("0.67 mm");
    expect(a.why).toContain("まっすぐつないだ");
  });
  it("職人の決まりを消した帳面では、公開の目安の線で答える", () => {
    const a = prongSizeAnswer("6 mm の石の爪は何 mm？", activeRules(removeRule(repo as Ledger, "rule-prong-min-ishikawa")))!;
    expect(a.rule.id).toBe("prong-thickness");
    expect(a.short).toContain("公開情報");
  });
  it("本数や高さの問いは、ほかの決まりを探す", () => {
    expect(prongSizeAnswer("9 mm の石の爪は何本？", rules)).toBeNull();
    expect(prongSizeAnswer("三角の石は、爪 3 本で留まる？", rules)).toBeNull();
    expect(prongSizeAnswer("8 mm の石の爪の高さは？", rules)).toBeNull();
  });
  it("ほかの例の問いも、関わる決まりが先に出る", () => {
    expect(findRules("三角の石は、爪 3 本で留まる？", rules)[0].id).toBe("rule-corner-set-ishikawa");
    expect(findRules("エメラルドはロウ付けの前に外す？", rules)[0].id).toBe("heat-sensitive-stones");
    expect(findRules("ロウはどの順に使う？", rules)[0].id).toBe("solder-order");
    expect(findRules("10 号の内径は？", rules)[0].id).toBe("ring-size-go");
  });
});
