import { describe, expect, it } from "vitest";
import { LIFE, chances, whyHtml } from "../src/studio/why";

describe("なぜ継ぐ", () => {
  it("20 年ごとの作り直しに関われるのは、多い人で 3 回ほど（国土交通白書と同じ。回り合わせが悪いと 2 回）", () => {
    expect(chances(LIFE.start, LIFE.end, LIFE.cycle, LIFE.first)).toBe(3);
    expect(chances(LIFE.start, LIFE.end, LIFE.cycle, 12)).toBe(2);
  });
  it("確かめられない数字を書かない（2 回ほど・10 年近く）", () => {
    const html = whyHtml();
    expect(html).not.toContain("10 年近く");
    expect(html).not.toContain("2 回ほど");
    expect(html).toContain("多い人で 3 回ほど");
  });
  it("行き来の図は「デザイン・設計（CAD）」と「制作」の 2 つ。戻りは制作から「デザイン・設計」へ", () => {
    const html = whyHtml();
    expect(html).toContain("制作からデザイン・設計へ何度も戻る");
    expect(html).toContain("デザイン・設計<tspan>（CAD）</tspan>");
    // 印は、線と同じ道を通る（線の上から外れない）
    const m = /class="ff-back" d="([^"]+)"/.exec(html);
    const k = /class="ff-run-back" pathLength="100" d="([^"]+)"/.exec(html);
    expect(m?.[1]).toBeTruthy();
    expect(k?.[1]).toBe(m?.[1]);
    const go = /class="ff-go" d="([^"]+)"/.exec(html)?.[1] ?? "";
    const run = /class="ff-run-go" pathLength="100" d="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(run).toBeTruthy();
    expect(go.startsWith(run)).toBe(true);
  });
  it("往復のたびに数が変わる。動きを減らす設定では字で分かる", () => {
    const html = whyHtml();
    for (const n of [1, 2, 3]) expect(html).toContain(`${n} 回目</text>`);
    expect(html).toContain("何度も戻る</text>");
  });
  it("継ぐの枠が「デザイン・設計」と職人の判断を包み、制作へまっすぐ。戻りはなくなるとは言わない", () => {
    const html = whyHtml();
    expect(html).toContain("ff-box");
    expect(html).toContain("職人の判断</text>");
    expect(html).toContain("戻りは極限まで少なくなります");
    expect(html).toContain("人の仕事のまま");
  });
  it("20 年の図：各回は端のぼやけた帯。年数を書かない", () => {
    const html = whyHtml();
    expect(html.match(/class="lf-band"/g)?.length).toBe(3);
    expect(html).toContain("<small>制作</small>");
    expect(html).not.toMatch(/作るのに \d+ 年|\d+ 年かけ|\d+ 年近く/);
  });
  it("公に知られた例（式年遷宮）は出典つきの絵と一緒に出す（作者が決めた。2026-11-03）", () => {
    const html = whyHtml();
    expect(html).toContain("20 年に一度しか作り直さない技");
    expect(html).toContain("式年遷宮");
    // 太刀はカラーで金具が大きく分かる写真に替えた（2026-11-05 作者）。内宮の写真は残す
    expect(html).toContain("/heritage/naiku-1953.jpg");
    expect(html).toContain("/heritage/itomaki-tachi-tsuka.jpg");
    expect(html).toContain("パブリックドメイン");
    expect(html).toContain("CC0");
  });
});
