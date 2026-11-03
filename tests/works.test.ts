import { describe, expect, it } from "vitest";
import { parseWorks, worksBookHtml, type WorkRecord } from "../src/studio/works";

const w: WorkRecord = { id: "work-1", date: "2026-11-03", title: "三角の一粒石の指輪", kind: "一粒石の指輪", methodLabel: "手作り", image: "data:image/jpeg;base64,AAAA", specs: [{ label: "号", value: "11 号" }], problems: [], steps: [{ title: "材料を用意する", text: "線を切る。", specs: [{ label: "長さ", value: "約 56.3 mm" }] }], note: "角は V 字の爪で守る", maker: "石川" };

describe("作品の記録", () => {
  it("形の正しいものだけ読む", () => {
    expect(parseWorks([w, { id: 3 }, null, "x"])).toEqual([w]);
    expect(parseWorks("x")).toEqual([]);
  });
  it("帳面は、表紙と 1 作品ずつ。ひとことと工程の数字が入る", () => {
    const html = worksBookHtml([w, { ...w, id: "work-2", problems: ["爪が細い"] }], "2026-11-03");
    expect(html.match(/<article class="work">/g)!.length).toBe(2);
    expect(html).toContain("「角は V 字の爪で守る」");
    expect(html).toContain("約 56.3 mm");
    expect(html).toContain("作れない所があった：爪が細い");
  });
  it("図面があれば入れる（紙では作り方のあと、A4 横の 1 ページ）。なければ図面の枠を出さない", () => {
    const html = worksBookHtml([{ ...w, drawing: '<section class="dw">正面図</section>' }, { ...w, id: "work-2" }], "2026-11-03");
    expect(html.match(/class="dwbox"/g)!.length).toBe(1);
    expect(html.indexOf("正面図")).toBeGreaterThan(html.indexOf("材料を用意する"));
    expect(html).toContain("@page land");
  });
  it("記録に詳しくがなくても、工程の名前から詳しくを戻して入れる", () => {
    const html = worksBookHtml([{ ...w, steps: [{ ...w.steps[0], id: "material" }] }], "2026-11-03");
    expect(html).toContain("3.1416");
  });
  it("スマホの画面では、ページの高さを決めない（印刷の A4 の高さで、大きな空きが出ないように）", () => {
    const html = worksBookHtml([w], "2026-11-03");
    expect(html).toContain('name="viewport"');
    expect(html).not.toMatch(/min-height:\s*297mm/);
  });
});
