// 腕の幅の 3 段（職人 石川の決まり 2026-11-06）：
// 「1 ミリ以下になったら、まあ黄色」「0.7 とかまでかな、許容。0.7 以下になったら、もう、オレンジぐらいで、0.6 以下はもう赤かな。まあ、作れなくはないけど、赤」。
// 前は資料の 1.7 mm より細いと赤（作れない所）だったが、作者が 1.6 mm で赤になったのを見て「この細さだから作れないってことはない」と言った。
import { describe, expect, it } from "vitest";
import repo from "../ledger/jewelry.json";
import { checkShank, shankWidthNote, widthFixMm, widthLevel } from "../src/rules/checks";
import { GUIDES } from "../src/rules/guides";
import { activeRules, addRule, effectiveGuides, seedLedger, type Ledger } from "../src/rules/ledger";
import { bandFixInput, DEFAULT_STATE } from "../src/studio/session";
import { bandWidthNote, checkBand, defaultBand, type Band } from "../src/studio/band";

const ring = repo as Ledger;

describe("腕の幅の段の境目", () => {
  const cases: [number, ReturnType<typeof widthLevel>][] = [
    [1.01, null],
    [1.0, "yellow"],
    [0.7, "yellow"],
    [0.69, "orange"],
    [0.61, "orange"],
    [0.6, "red"],
  ];
  for (const [w, lv] of cases) {
    it(`${w} mm は ${lv ?? "何も出さない"}`, () => {
      expect(widthLevel(w)).toBe(lv);
      // 石の付いた指輪（テンションも同じ checkShank）：赤だけが作れない所。黄色・オレンジは注意だけ
      const probs = checkShank({ widthMm: w, thicknessMm: 2 });
      expect(probs.some((p) => p.check === "band-narrow")).toBe(lv === "red");
      const note = shankWidthNote({ widthMm: w });
      expect(note?.level ?? null).toBe(lv === "yellow" || lv === "orange" ? lv : null);
      // 地金のみの指輪も同じ段
      const b: Band = { ...defaultBand(15.5, "K18"), top: { width: w, thickness: 1.6 }, bottom: { width: w, thickness: 1.6 } };
      expect(checkBand(b).some((p) => p.check === "band-narrow")).toBe(lv === "red");
      expect(bandWidthNote(b)?.level ?? null).toBe(lv === "yellow" || lv === "orange" ? lv : null);
    });
  }

  it("値は guides.ts の 1 か所（職人の決まり）。公開の資料の 1.7 mm は資料の値として残すだけ", () => {
    expect(GUIDES.band).toMatchObject({ widthYellowMm: 1.0, widthOrangeMm: 0.7, minWidthMm: 0.6, docWidthMm: 1.7 });
    expect(widthLevel(1.6)).toBeNull();
    expect(checkShank({ widthMm: 1.6, thicknessMm: 2 })).toEqual([]);
  });

  it("赤の言葉は「作れなくはないが、職人の決まりでは赤」と分かる。直すと 0.7 mm（許容）まで広げる", () => {
    const p = checkShank({ widthMm: 0.55, thicknessMm: 2 })[0];
    expect(p.reason).toContain("作れなくはない");
    expect(p.reason).toContain("職人の決まりでは赤");
    expect(p.required).toBe("0.60 mm より太く（職人の決まり）");
    expect(widthFixMm()).toBe(0.7);
    expect(bandFixInput("widerBand", { ...DEFAULT_STATE, shankWidthMm: 0.55 })).toEqual({ width_mm: 0.7 });
    const b: Band = { ...defaultBand(15.5, "K18"), top: { width: 0.55, thickness: 1.6 }, bottom: { width: 0.55, thickness: 1.6 } };
    const fixed = checkBand(b)[0].fix.apply(b);
    expect(fixed.top.width).toBe(0.7);
    expect(bandWidthNote(fixed)?.level).toBe("yellow");
  });

  it("オレンジは黄色より強い言葉（かなり細い）", () => {
    expect(shankWidthNote({ widthMm: 0.65 })!.text).toContain("かなり細い");
    expect(shankWidthNote({ widthMm: 0.9 })!.text).toContain("細め");
  });
});

describe("帳面の腕の幅", () => {
  it("リポジトリの帳面では、職人 石川の決まりが資料の決まりを置き換える", () => {
    const r = activeRules(ring).find((x) => x.param === "band.minWidthMm")!;
    expect(r).toMatchObject({ title: "腕の幅（細さの目安）", value: 0.6, date: "2026-11-06", source: { kind: "craftsman", name: "石川" } });
    expect(r.quote).toContain("0.6 以下はもう赤");
    expect(effectiveGuides(ring).band.minWidthMm).toBe(0.6);
    // 公開情報だけの帳面でも、資料の 1.7 mm で赤にしない（職人の決まりが先）
    expect(effectiveGuides(seedLedger()).band.minWidthMm).toBe(0.6);
  });

  it("工房ごとに赤の線を変えられる（帳面の band.minWidthMm）。直す幅は、その線より太い次の境目", () => {
    const l = addRule(ring, { title: "腕の幅", text: "1.2 mm 以下は赤", reason: "r", param: "band.minWidthMm", value: 1.2, source: { kind: "craftsman", name: "ためしの職人" }, date: "2026-11-06" });
    const g = effectiveGuides(l);
    expect(widthLevel(1.1, g)).toBe("red");
    expect(checkShank({ widthMm: 1.1, thicknessMm: 2 }, { guides: g }).map((p) => p.check)).toEqual(["band-narrow"]);
    expect(widthFixMm(g)).toBe(1.3);
  });
});
