// 入口のページの言葉と、アプリの中身を合わせる（2026-11-05 点検：隠した三石の節が残り、決まりの数が古かった）
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import repo from "../ledger/jewelry.json";
import bandShowcase from "../src/lp/band-showcase.json";
import artdeco from "../src/lp/artdeco.json";
import { activeRules, ledgerCounts, type Ledger } from "../src/rules/ledger";

const src = readFileSync(new URL("../src/lp/main.ts", import.meta.url), "utf8");

describe("入口のページ", () => {
  it("地金のみの見せ場の名前と説明は、見本のデータと同じ。切り口を見せた絵で、断面の編集で作ったと書く", () => {
    for (const x of bandShowcase.shapes) {
      expect(src).toContain(`band-${x.id}`);
      expect(src).toContain(x.name);
      expect(src).toContain(x.caption);
      expect(x.cut).toBe("top");
    }
    expect(src).toContain("アプリの断面の編集で作った形");
    expect(src).toContain("切り口を見せています");
  });

  it("言葉の場面の絵は、本物の Claude が「アールデコな感じ」から組んだ形 1 つだけ。回数は書かない（2026-11-06 作者：何度も失敗したように読める）", () => {
    const c = artdeco.claude;
    expect(src).toContain("ring-artdeco");
    expect(src).not.toContain(`Claude ${c.calls} 回`);
    expect(src).toContain(`「${artdeco.wish}」とだけ頼み`);
    expect(src).toContain(`「${artdeco.wish}」</p>`);
    expect(src).not.toContain("ring-claude-gothic");
    expect(src).not.toContain("ring-gothic-attack");
    expect(src).not.toContain("人が数字を整え");
  });

  it("欄を隠している三石・石を並べる節を書かない", () => {
    expect(src).not.toContain("三石");
    expect(src).not.toContain("石を並べる");
  });

  it("公開の版の合言葉の説明が今の仕様どおり（なしでも使える。Claude の所だけ要る。2026-11-08）", () => {
    expect(src).not.toContain("合言葉なしで全部使えます");
    expect(src).not.toContain("開くときに合言葉を聞きます");
    expect(src).toContain("Claude が考えて答える所だけ、合言葉が要ります");
  });

  it("決まりの数を出さない（職人の言葉の数が弱く見える。2026-11-05 作者）", () => {
    expect(src).not.toMatch(/決まりが <span class="num">/);
    expect(src).not.toContain("BOOK.");
  });

  it("数は、帳面の画面と同じ分け方（職人の決まり・それ以外）", () => {
    const n = ledgerCounts(repo as Ledger);
    const rules = activeRules(repo as Ledger);
    expect(n.total).toBe(rules.length);
    expect(n.craftsman).toBe(rules.filter((r) => r.source.kind === "craftsman").length);
    expect(n.craftsman + n.others).toBe(n.total);
    expect(n.craftsman).toBeGreaterThan(0);
    expect(n.others).toBeGreaterThan(0);
  });
});
