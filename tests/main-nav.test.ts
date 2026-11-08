// 継ぐの場所の切り替え（2026-11-08 作者：動線を分かりやすく）。app.html・studio.html・入口のページで同じ並びと言葉
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLACES, placeHref, placeOf } from "../src/ui/places";

describe("場所の切り替え", () => {
  it("並びは入口のページの話と同じ：帳面 → 設計 → 学ぶ → 技 → 技の再現。だれの場所かを添える", () => {
    expect(PLACES.map((p) => p.label)).toEqual(["帳面", "設計", "学ぶ", "技", "技の再現"]);
    expect(PLACES.map((p) => p.sub)).toEqual(["職人の決まりを見る・残す", "形を作って、作れるか確かめる", "職人に聞く・手の動きを比べる", "技ごとに、言葉と手本を残す", "手がかりや思い描いた模様から、作り方を組み立てる"]);
  });

  it("app.html の中からは # だけ（?mihon を付けたまま移る）。ほかの頁からは app.html#…。設計は studio.html", () => {
    const by = Object.fromEntries(PLACES.map((p) => [p.id, p]));
    expect(placeHref(by.ledger, "app")).toBe("#ledger");
    expect(placeHref(by.restore, "app")).toBe("#waza/restore");
    expect(placeHref(by.restore, "other")).toBe("app.html#waza/restore");
    expect(placeHref(by.design, "app")).toBe("studio.html");
    expect(placeHref(by.design, "other")).toBe("studio.html");
  });

  it("いまの場所：途切れた技を組み立て直す頁（restore・rebuild）は「途切れた技」、ほかの技の頁は「技」", () => {
    expect(placeOf("waza", "")).toBe("waza");
    expect(placeOf("waza", "kebori?step=answer")).toBe("waza");
    expect(placeOf("waza", "restore")).toBe("restore");
    expect(placeOf("waza", "restore/demo-amadare/moyou")).toBe("restore");
    expect(placeOf("waza", "rebuild/moyou")).toBe("restore");
    expect(placeOf("waza", "restorex")).toBe("waza");
    expect(placeOf("learn", "hands")).toBe("learn");
    expect(placeOf("ledger", "")).toBe("ledger");
  });

  it("入口のページのメニューも、同じ並びを読む", () => {
    const lp = readFileSync(new URL("../src/lp/main.ts", import.meta.url), "utf8");
    expect(lp).toContain('from "../ui/places"');
    expect(lp).toContain("PLACES.map");
  });
});
