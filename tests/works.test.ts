import { describe, expect, it } from "vitest";
import { parseWorks, worksBookHtml, type WorkRecord } from "../src/studio/works";

const w: WorkRecord = { id: "work-1", date: "2026-11-03", title: "三角の一粒石の指輪", kind: "一粒石の指輪", methodLabel: "手作り", image: "data:image/jpeg;base64,AAAA", specs: [{ label: "号", value: "11 号" }], problems: [], steps: [{ title: "材料を用意する", text: "線を切る。", specs: [{ label: "長さ", value: "約 56.3 mm" }] }], note: "角は V 字の爪で守る", maker: "石川" };

describe("作品の記録", () => {
  it("形の正しいものだけ読む", () => {
    expect(parseWorks([w, { id: 3 }, null, "x"])).toEqual([w]);
    expect(parseWorks("x")).toEqual([]);
  });
  it("帳面は、表紙と 1 作品 1 ページ。ひとことと工程の数字が入る", () => {
    const html = worksBookHtml([w, { ...w, id: "work-2", problems: ["爪が細い"] }], "2026-11-03");
    expect(html.match(/class="page"/g)!.length).toBe(2);
    expect(html).toContain("「角は V 字の爪で守る」");
    expect(html).toContain("約 56.3 mm");
    expect(html).toContain("作れない所があった：爪が細い");
  });
});
