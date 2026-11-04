// 入口のページの言葉と、アプリの中身を合わせる（2026-11-05 点検：隠した三石の節が残り、決まりの数が古かった）
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import repo from "../ledger/jewelry.json";
import { activeRules, ledgerCounts, type Ledger } from "../src/rules/ledger";

const src = readFileSync(new URL("../src/lp/main.ts", import.meta.url), "utf8");

describe("入口のページ", () => {
  it("欄を隠している三石・石を並べる節を書かない", () => {
    expect(src).not.toContain("三石");
    expect(src).not.toContain("石を並べる");
  });

  it("決まりの数を直書きせず、帳面から読む", () => {
    expect(src).toContain("BOOK.total");
    expect(src).not.toMatch(/決まりが <span class="num">\d/);
    expect(src).not.toMatch(/資料から入れた決まり (<span class="num">)?\d/);
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
