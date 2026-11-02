import { describe, expect, it } from "vitest";
import { STEP_TOOLS, TOOLS, toolsForStep } from "../src/studio/toolbox";

/** 作り方の工程の題（src/studio/howto.ts と同じ） */
const STEP_TITLES = [
  // 手作り
  "材料を用意する",
  "腕を丸めて、つなぐ",
  "石座を組む",
  "覆輪を作る",
  "石座を腕に付ける",
  "座を彫って、石を留める",
  "石を入れて、覆輪を倒す",
  "仕上げ",
  // 鋳造（座を彫って、石を留める／仕上げ は上と同じ）
  "原型を作る",
  "湯道を付ける",
  "鋳造する",
  "湯道を切り、整える",
];

/** 出典に使ってよい所（公的な機関・学校・博物館・論文・公開の技の解説）。店の頁は入れない。 */
const ALLOWED_HOSTS = [
  /(^|\.)gia\.edu$/,
  /(^|\.)javada\.or\.jp$/,
  /(^|\.)mhlw\.go\.jp$/,
  /(^|\.)pref\.yamanashi\.jp$/,
  /(^|\.)bunka\.go\.jp$/,
  /(^|\.)edu\.gov\.mb\.ca$/,
  /(^|\.)museum\.wa\.gov\.au$/,
  /(^|\.)doh\.wa\.gov$/,
  /(^|\.)southtexascollege\.edu$/,
  /(^|\.)umassd\.edu$/,
  /(^|\.)vcc\.ca$/,
  /(^|\.)ncbi\.nlm\.nih\.gov$/,
  /(^|\.)ganoksin\.com$/,
];

/** 店らしい言葉（出典の所に入っていてはいけない） */
const SHOP_WORDS = ["shop", "store", "mall", "cart", "market", "buy", "sale"];

/** 会社・商品の名前らしい書き方（どれも書かない） */
const BRAND_LIKE = ["®", "™", "©", "株式会社", "有限会社", "（株）", "(株)", "Inc.", "Ltd", "Co.,", "GmbH", "社製", "ブランド", "商品名", "製品名", "メーカー"];

const allText = (): string =>
  TOOLS.map((t) => [t.name, t.reading, t.what, ...t.how, t.watch ?? "", ...t.sources.map((s) => s.title)].join("\n")).join("\n");

describe("道具箱：一粒石の指輪を作る道具", () => {
  it("id は重ならない", () => {
    const ids = TOOLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("工程の題は、作り方の工程の題とちょうど同じ", () => {
    expect(Object.keys(STEP_TOOLS).sort()).toEqual([...STEP_TITLES].sort());
  });

  it("工程に書いた道具は、どれも道具箱にある（同じ工程で重ならない）", () => {
    const ids = new Set(TOOLS.map((t) => t.id));
    for (const [title, list] of Object.entries(STEP_TOOLS)) {
      expect(list.length, title).toBeGreaterThan(0);
      expect(new Set(list).size, title).toBe(list.length);
      for (const id of list) expect(ids.has(id), `${title} の ${id}`).toBe(true);
      expect(toolsForStep(title).map((t) => t.id)).toEqual(list);
    }
  });

  it("どの道具も、どこかの工程で使う", () => {
    const used = new Set(Object.values(STEP_TOOLS).flat());
    for (const t of TOOLS) expect(used.has(t.id), t.id).toBe(true);
  });

  it("知らない題なら空", () => {
    expect(toolsForStep("ない工程")).toEqual([]);
  });

  it("どの道具にも、名前・読み・何に使うか・使い方 2〜4 手・出典がある", () => {
    for (const t of TOOLS) {
      expect(t.name.trim(), t.id).not.toBe("");
      expect(t.reading.trim(), t.id).not.toBe("");
      expect(t.what.trim(), t.id).not.toBe("");
      expect(t.how.length, t.id).toBeGreaterThanOrEqual(2);
      expect(t.how.length, t.id).toBeLessThanOrEqual(4);
      for (const h of t.how) expect(h.trim(), t.id).not.toBe("");
      expect(t.sources.length, t.id).toBeGreaterThan(0);
    }
  });

  it("出典は https の、決めた所だけ。店らしい言葉はない", () => {
    for (const t of TOOLS) {
      for (const s of t.sources) {
        const u = new URL(s.url);
        expect(u.protocol, s.url).toBe("https:");
        expect(ALLOWED_HOSTS.some((re) => re.test(u.hostname)), s.url).toBe(true);
        const lower = s.url.toLowerCase();
        for (const w of SHOP_WORDS) expect(lower.includes(w), `${s.url} に ${w}`).toBe(false);
        expect(s.title.trim(), s.url).not.toBe("");
      }
    }
  });

  it("会社・商品の名前らしい書き方をしていない", () => {
    const text = allText();
    for (const w of BRAND_LIKE) expect(text.includes(w), w).toBe(false);
  });

  it("説明に数字を書かない（数字は目安帳と職人の言葉から）", () => {
    for (const t of TOOLS) {
      const body = [t.what, ...t.how, t.watch ?? ""].join("").replaceAll("3D", "");
      expect(/[0-9０-９]/.test(body), t.id).toBe(false);
    }
  });
});
