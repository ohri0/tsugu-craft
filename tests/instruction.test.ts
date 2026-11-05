import { describe, expect, it } from "vitest";
import { buildRing } from "../src/geometry/ring";
import { checkRing } from "../src/rules/checks";
import { instructionHtml } from "../src/pattern/instruction";
import { triangleStone } from "./helpers/stones";

describe("指示書", () => {
  const ring = buildRing({ stone: triangleStone(), setting: { style: "prong", prongDiameterMm: 0.8 }, shank: { gou: 11 } });
  const problems = checkRing(ring).map((p) => ({ ...p, rule: { id: "x", title: "爪の太さ", text: "t", reason: "r", source: { kind: "craftsman" as const, name: "作者" }, date: "2026-11-03" } }));
  const html = instructionHtml({
    ring,
    problems,
    shapeName: "トリリアント（ノンカリブレーション）",
    depthMm: 4.24,
    widthFromPhoto: true,
    reason: "角を守るため V 字の爪にした",
    patternSvg: '<svg width="210mm"></svg>',
    craftsmanRules: [],
    date: "2026-11-03",
  });
  it("何を作るかと、確かめた結果・根拠・選んだ理由が入り、2 ページ目に型紙", () => {
    expect(html).toContain("指示書");
    expect(html).toContain("11 号");
    expect(html).toContain("（写真から）");
    expect(html).toContain("根拠：爪の太さ・職人：作者");
    expect(html).toContain("角を守るため V 字の爪にした");
    expect(html).toContain('<svg width="210mm"></svg>');
    expect(html).toContain("作り方・石座の削り・最終の合わせは職人が決めます");
  });
});
