// 人に見せる文：作業の記録に、英字の名前・内部の番号・決まりの印が出ないこと（2026-11-05 作者のスマホの絵から）
import { describe, expect, it } from "vitest";
import { cannotFrom, hasJapanese, plainWords, prongPlaceWords, ruleTitles, toolLogLine, withoutCannot, type StoneWords } from "../src/claude/words";
import { designPrompt, SYSTEM_PROMPT } from "../src/claude/prompt";
import { SYSTEM_MAX_CHARS } from "../src/claude/wire";
import { parseToolCall } from "../src/claude/tools";
import { seedLedger } from "../src/rules/ledger";
import { readFileSync } from "node:fs";

const titles = ruleTitles([{ id: "v-prong-points", title: "尖った先は V 字の爪" }, { id: "corner-reach", title: "尖った角を守る" }]);

/** マーキスのような石：点 0 と 200 が尖った先、400 点 */
const marquise: StoneWords = {
  outlineMm: Array.from({ length: 400 }, (_, i) => {
    const t = (i / 400) * Math.PI * 2;
    return { x: 5 * Math.cos(t), y: 2.5 * Math.sin(t) };
  }),
  corners: [0, 200],
};

describe("人に見せる文に直す", () => {
  it("作者の絵に出ていた言葉が、全部やさしい日本語になる", () => {
    const raw = "留め方 prong、向き along。向き across。地金 k18wg。両方の先（67 番・218 番）に置く（[v-prong-points]・[corner-reach]）";
    const out = plainWords(raw, titles);
    expect(out).not.toMatch(/prong|along|across|k18wg|番|\[/);
    expect(out).toContain("爪留め");
    expect(out).toContain("縦向き");
    expect(out).toContain("横向き");
    expect(out).toContain("18 金ホワイト");
    expect(out).toContain("両方の先に置く");
    expect(out).toContain("「尖った先は V 字の爪」・「尖った角を守る」");
  });

  it("文の中の番号は「決めた所」に。ふつうの数字は残す", () => {
    expect(plainWords("輪郭の点 67 番と 218 番に爪を置く。爪は 6 本、幅 2.4 mm")).toBe("決めた所に爪を置く。爪は 6 本、幅 2.4 mm");
  });

  it("知らない決まりの印は「帳面の決まり」に。英語の文の中の言葉は壊さない", () => {
    expect(plainWords("[rule-abc-1] によると")).toBe("帳面の決まり によると");
    expect(plainWords("Tensioner, alongside")).toBe("Tensioner, alongside");
    expect(plainWords("**太字**")).toBe("太字");
  });

  it("添えた英字が同じ言葉になったら、1 つにする", () => {
    expect(plainWords("白いプラチナ（pt900）にした。確かめ（check）は通った")).toBe("白いプラチナにした。確かめは通った");
  });

  it("日本語があるかを見る", () => {
    expect(hasJapanese("Now the Gothic shape")).toBe(false);
    expect(hasJapanese("断面を入れます")).toBe(true);
  });
});

describe("爪の位置の言葉", () => {
  it("両方の先と、両わきの辺", () => {
    expect(prongPlaceWords([0, 200, 66, 133, 266, 333], marquise)).toBe("両方の先と、両わきの辺 4 か所");
    expect(prongPlaceWords([0, 200, 66, 133], marquise)).toBe("両方の先と、片側の辺 2 か所");
    expect(prongPlaceWords([0, 200], marquise)).toBe("両方の先");
  });
  it("角がない石・角が 3 つの石・石が分からないとき", () => {
    expect(prongPlaceWords([10, 20, 30, 40], { outlineMm: marquise.outlineMm, corners: [] })).toBe("縁の 4 か所");
    expect(prongPlaceWords([0, 133, 266], { outlineMm: marquise.outlineMm, corners: [0, 133, 266] })).toBe("3 つの角すべて");
    expect(prongPlaceWords([0, 50], { outlineMm: marquise.outlineMm, corners: [0] })).toBe("尖った先と、ほかの縁 1 か所");
    expect(prongPlaceWords([1, 2, 3])).toBe("石の縁の 3 か所");
    expect(prongPlaceWords([])).toBe("自動");
  });
});

describe("作業の記録の 1 行", () => {
  const line = (tool: string, input: unknown, extra: object = {}) => toolLogLine({ tool, input, ok: true, ...extra }, { stone: marquise, titles }).text;
  it("石座：英字も番号も出ない", () => {
    const t = line("set_setting", { style: "prong", prong_count: 6, v_corners: true, orientation: "along", height: "high", join: "between", prong_positions: [0, 200, 66, 133, 266, 333], prong_mm: 0.8, reason: "両方の先（0 番・200 番）を守る [v-prong-points]" });
    expect(t).toBe("石座：留め方 爪留め、爪 6 本、角の V 字の爪 あり、向き 縦向き、高さ 高め、腕への付け方 腕の間に挟む、爪の位置 両方の先と、両わきの辺 4 か所、爪の太さ 0.8 mm ― 両方の先を守る 「尖った先は V 字の爪」");
    expect(line("set_setting", { orientation: "across", reason: "横に" })).toBe("石座：向き 横向き ― 横に");
    expect(line("set_setting", { style: "tension", reason: "挟む" })).toContain("留め方 テンション");
    expect(line("set_setting", { style: "bezel", join: "on", reason: "x" })).toContain("留め方 覆輪、腕への付け方 腕の上にのせる");
  });
  it("腕：断面の線と、場所ごとの形", () => {
    const t = line("set_shank", {
      section_curve: { points: [] },
      width_mm: 3,
      thickness_mm: 2.2,
      metal: "k18wg",
      gou: 11,
      stations: [
        { at_deg: 70, width_mm: 2.2, thickness_mm: 1.6, sway_mm: -0.5 },
        { at_deg: 180, width_mm: 1.8, thickness_mm: 1.3, section: "kouman" },
      ],
      reason: "理由",
    });
    expect(t).toBe("腕：断面 自由な線、幅 3 mm、厚み 2.2 mm、地金 18 金ホワイト、11 号、場所ごとの形：肩 幅 2.2 × 厚み 1.6 mm（0.5 mm 流す）、いちばん下 幅 1.8 × 厚み 1.3 mm（甲丸） ― 理由");
    expect(line("set_shank", { section: "hangouman", metal: "k18yg", reason: "x" })).toContain("断面 半甲丸、地金 18 金イエロー");
    expect(line("set_shank", { stations: [], reason: "x" })).toContain("どこも同じ形に戻す");
    expect(line("set_shank", { relief: { pattern: "arch", count: 4, columns: 2, depth_mm: 0.25 }, reason: "x" })).toContain("彫り 尖ったアーチ（片側 4 つ・2 列・深さ 0.25 mm）");
    expect(line("set_shank", { relief: { pattern: "none" }, reason: "x" })).toContain("彫り なし");
  });
  it("確かめと見る", () => {
    expect(toolLogLine({ tool: "check", input: {}, ok: true, result: { problems: [1, 2] } })).toEqual({ text: "確かめ：作れない所 2", mark: "ng" });
    expect(toolLogLine({ tool: "check", input: {}, ok: true, result: { problems: [] } })).toEqual({ text: "確かめ：すべて決まりの内側", mark: "ok" });
    expect(line("look", { view: "front" })).toBe("見る：正面から");
  });
  it("道具が断ったときは、通ったように見せない", () => {
    const l = toolLogLine({ tool: "check", input: {}, ok: false, error: "確かめは 4 回までです" });
    expect(l.mark).toBe("ng");
    expect(l.text).toContain("やり直します");
    expect(l.text).not.toContain("決まりの内側");
    const s = toolLogLine({ tool: "set_shank", input: { section_curve: {} }, ok: false, error: "width_mm は 1〜10 の間で書いてください（今は 20）" });
    expect(s.text).toBe("腕：やり直します ― 幅 は 1〜10 の間で書いてください（今は 20）");
  });
});

describe("まだできないことの札", () => {
  it("行を取り出す。なしのときは空", () => {
    expect(cannotFrom("やったこと：x\nまだできないこと：透かし\n")).toBe("透かし");
    expect(cannotFrom("まだできないこと: 透かしと彫り")).toBe("透かしと彫り");
    expect(cannotFrom("まだできないこと：なし")).toBe("");
    expect(cannotFrom("まだできないこと：なし（V 字の爪は使っていません）")).toBe("");
    expect(cannotFrom("まだできないこと：ありません。")).toBe("");
    expect(cannotFrom("やったこと：x")).toBe("");
  });
  it("箇条書きの続きも札に入れ、言葉も直す", () => {
    expect(cannotFrom("まだできないこと：\n- 透かし\n- 彫りの模様\n\nおわり")).toBe("透かし 彫りの模様");
    expect(cannotFrom("**まだできないこと**：[v-prong-points] の形", titles)).toContain("「尖った先は V 字の爪」");
  });
  it("作業の記録からは、札の行を除く", () => {
    expect(withoutCannot("やったこと：x\nまだできないこと：透かし\n- 彫り\n残っていること：y")).toBe("やったこと：x\n残っていること：y");
    expect(withoutCannot("やったこと：x")).toBe("やったこと：x");
  });
});

describe("Claude への指示", () => {
  it("公開の窓口が受け取れる長さに収まる（目安帳が入っても）", () => {
    expect(designPrompt(seedLedger()).length).toBeLessThan(SYSTEM_MAX_CHARS);
    const repo = JSON.parse(readFileSync("ledger/jewelry.json", "utf8"));
    expect(designPrompt({ ...seedLedger(), rules: repo.rules }).length).toBeLessThan(SYSTEM_MAX_CHARS);
  });
  it("雰囲気の言葉を腕の断面と線に訳すこと、理由を書くこと、内部の番号を書かないことが入っている。特定の様式を決め打ちにしない", () => {
    expect(SYSTEM_PROMPT).toContain("雰囲気の言葉を、形に訳す");
    expect(SYSTEM_PROMPT).toContain("section_curve");
    expect(SYSTEM_PROMPT).toContain("stations");
    expect(SYSTEM_PROMPT).toContain("線の性格");
    expect(SYSTEM_PROMPT).toContain("番号");
    const head = SYSTEM_PROMPT.slice(0, SYSTEM_PROMPT.indexOf("<jeweler_guides>"));
    for (const word of ["ゴシック", "アール・デコ", "和風", "和の"]) expect(head).not.toContain(word);
  });
  it("理由だけの呼び出しは断る（形が変わったと思って先へ進まないように）", () => {
    const r = parseToolCall("set_shank", { reason: "細くした" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("変える項目");
    expect(parseToolCall("set_setting", { reason: "高くした" }).ok).toBe(false);
    expect(parseToolCall("set_shank", { gou: 11, reason: "号" }).ok).toBe(true);
  });
});
