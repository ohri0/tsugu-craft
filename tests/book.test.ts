import { describe, expect, it } from "vitest";
import { bookHtml } from "../src/rules/book";
import { addRule, parseSizeSteps, seedLedger } from "../src/rules/ledger";

describe("技の帳面（アプリがなくても読める形）", () => {
  const l1 = addRule(seedLedger(), {
    title: "石の先を離す",
    text: "石の一番下を指から 0.5 mm 以上離す",
    reason: "ぶつけたとき指に当たる",
    param: "height.minFingerGapMm",
    value: 0.5,
    source: { kind: "craftsman", name: "作者" },
    date: "2026-11-03",
  });
  const l2 = addRule(l1, {
    title: "爪の太さ",
    text: "爪の太さは石の大きさで決める",
    reason: "小さい石に太い爪は重い",
    quote: "石を見て決めるんだよ",
    param: "prong.minDiameterMm",
    bySize: parseSizeSteps("4:0.6, 8:1.0, 1.2"),
    source: { kind: "craftsman", name: "作者" },
    date: "2026-11-03",
  });
  const html = bookHtml({
    ledger: l2,
    date: "2026-11-03",
    answered: [{ question: "爪はなぜ V 字？", count: 3, ruleId: "corner-reach" }],
    motions: [{ title: "ヤスリがけ", craftsman: "作者", date: "2026-11-05", videoName: "file.mp4", durationS: 42, metrics: ["1 分あたり 88 回"], notes: [{ t: 12, text: "ここで角度を変える" }] }],
  });

  it("職人の決まりを、理由・言葉・段・出どころ・前の決まりと一緒に書く", () => {
    expect(html).toContain("職人の決まり（2）");
    expect(html).toContain("ぶつけたとき指に当たる");
    expect(html).toContain("「石を見て決めるんだよ」");
    expect(html).toContain("石の大きさ 4 mm まで 0.6mm");
    expect(html).toContain("職人：作者・2026-11-03");
    expect(html).toContain("前の決まり：石の先を指から離す");
  });
  it("先生に聞いたこと・手の記録も入り、印刷用の大きさが決まっている", () => {
    expect(html).toContain("爪はなぜ V 字？");
    expect(html).toContain("0:12　ここで角度を変える");
    expect(html).toContain("@page { size: A4");
  });
  it("文字は逃がす（決まりの文に < があっても壊れない）", () => {
    const l = addRule(seedLedger(), { title: "<b>x</b>", text: "a<b", reason: "r", source: { kind: "craftsman", name: "作者" }, date: "2026-11-03" });
    expect(bookHtml({ ledger: l, date: "2026-11-03" })).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
