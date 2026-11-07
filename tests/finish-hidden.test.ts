// 伝統の仕上げを出さない間（src/geometry/finish.ts の FINISHES_OFFERED が false）：画面・Claude の道具・指示・MCP に出ない。
// 前に残した設計に仕上げや色金があっても、止まらずに、ふつうの地金の指輪として開く。
// 2026-11-07 作者（職人）の判断で、提出には出さない（docs/LOG.md）。仕上げそのものの確かめは finish.test.ts・nunome.test.ts（値を true にして回す）
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FINISHES_OFFERED } from "../src/geometry/finish";
import { FINISH_OFFERED_KEYS, OFFERED_METALS, TOOLS, parseToolCall } from "../src/claude/tools";
import { JEWELER_GUIDES, SYSTEM_PROMPT } from "../src/claude/prompt";
import { z } from "zod";
import { DESCRIPTIONS, checkRingShape } from "../mcp/tools";
import { RingSession, dropHiddenFinishes, offeredMetal, type RingState, DEFAULT_STATE } from "../src/studio/session";
import { howToMake } from "../src/studio/howto";
import { bandHowTo, defaultBand, normalizeBand } from "../src/studio/band";
import { renderBandPanel, type BandPanelHost } from "../src/studio/band-panel";
import { seedLedger } from "../src/rules/ledger";
import { GUIDES } from "../src/rules/guides";
import { triangleStone } from "./helpers/stones";

const FINISH_WORDS = /槌目|ミル打ち|象嵌|赤銅|四分一|色金|煮色/;

describe("伝統の仕上げを出さない（FINISHES_OFFERED が false）", () => {
  it("はじめの値は false（提出の形）", () => {
    expect(FINISHES_OFFERED).toBe(false);
  });

  it("Claude の道具：set_shank に finish がなく、地金に色金がない。説明にも出ない", () => {
    const shank = TOOLS.find((t) => t.name === "set_shank")!;
    const props = (shank.input_schema as { properties: Record<string, { enum?: string[]; description?: string }> }).properties;
    expect(props.finish).toBeUndefined();
    expect(props.metal.enum).toEqual(["pt900", "k18yg", "k18wg", "k18pg", "sv925"]);
    expect(OFFERED_METALS).not.toContain("shakudo");
    expect(FINISH_OFFERED_KEYS).toEqual([]);
    expect(JSON.stringify(shank)).not.toMatch(FINISH_WORDS);
    // ほかの道具の説明にも、仕上げの言葉を出さない
    for (const t of TOOLS) expect(JSON.stringify(t), t.name).not.toMatch(/槌目|赤銅|四分一|煮色|布目象嵌/);
  });

  it("Claude から仕上げや色金が届いても止めずに外す。それしかなければ、今は選べないと返す", () => {
    const r = parseToolCall("set_shank", { width_mm: 3, metal: "shakudo", finish: { tsuchime: "medium" }, reason: "試し" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.call.input).toEqual({ width_mm: 3, reason: "試し" });
    const only = parseToolCall("set_shank", { finish: { inlay: "nunome" }, reason: "試し" });
    expect(only.ok).toBe(false);
    if (!only.ok) expect(only.error).toContain("今は選べません");
    expect(parseToolCall("set_shank", { metal: "copper", reason: "試し" }).ok).toBe(false);
    // ふつうの地金は今までどおり
    expect(parseToolCall("set_shank", { metal: "pt900", reason: "試し" }).ok).toBe(true);
  });

  it("アプリの中の Claude への指示に、仕上げの言い方も Skill の仕上げの節も入らない", () => {
    expect(SYSTEM_PROMPT).not.toContain("伝統の仕上げ");
    expect(SYSTEM_PROMPT).not.toMatch(FINISH_WORDS);
    expect(JEWELER_GUIDES).not.toContain("## 伝統の仕上げ");
    // ほかの節は残る
    expect(JEWELER_GUIDES).toContain("## 地金の重さ");
    expect(JEWELER_GUIDES).toContain("## テンション");
  });

  it("MCP の地金にも色金がない（アプリの道具と同じ）", () => {
    const text = JSON.stringify(z.toJSONSchema(z.object(checkRingShape)));
    expect(text).toContain("pt900");
    expect(text).not.toContain("shakudo");
    expect(text).not.toMatch(FINISH_WORDS);
    expect(JSON.stringify(DESCRIPTIONS)).not.toMatch(FINISH_WORDS);
    expect(checkRingShape.design.safeParse({ metal: "shibuichi" }).success).toBe(false);
  });

  it("前に残した設計の仕上げと色金は外し、ふつうの地金（K18 イエロー）で組む。作り方に煮色も仕上げの工程も出ない", () => {
    const s = new RingSession(triangleStone(), () => seedLedger(), () => {}, () => "");
    s.state = { ...structuredClone(DEFAULT_STATE), metal: "shakudo", finish: { tsuchime: { size: "medium", area: "outer" }, milgrain: "edges", inlay: "nunome" } } as RingState;
    const b = s.build("前の設計");
    expect(s.state.finish).toBeUndefined();
    expect(s.state.metal).toBe("k18yg");
    expect(b.ring.params.finish).toBeUndefined();
    expect(b.ring.milgrain).toBeFalsy();
    expect(b.problems.some((p) => /^(nunome-|tsuchime-|milgrain-)/.test(p.check))).toBe(false);
    const st = s.stone;
    const steps = howToMake({ ring: b.ring, outlineMm: st.outlineMm, longMm: st.longMm, widthMm: st.widthMm, depthMm: st.depthMm, metalLabel: "K18 イエロー", alloy: "k18y" }, "hand");
    const ids = steps.map((x) => x.id);
    for (const id of ["niiro", "daikon", "degrease", "tsuchime", "milgrain", "nunome"]) expect(ids).not.toContain(id);
    expect(JSON.stringify(steps)).not.toMatch(/煮色|槌目|象嵌/);
  });

  it("地金の名前と、設計を整える所", () => {
    expect(offeredMetal("shibuichi")).toBe("k18yg");
    expect(offeredMetal("pt900")).toBe("pt900");
    const st = { ...structuredClone(DEFAULT_STATE), metal: "copper", finish: { milgrain: "edges" } } as RingState;
    dropHiddenFinishes(st);
    expect(st).toEqual({ ...DEFAULT_STATE, metal: "k18yg" });
  });

  it("地金のみの指輪：残した仕上げは外して開き、作り方に仕上げの工程が出ない", () => {
    const old = { ...defaultBand(GUIDES.metals.k18y.densityGPerCm3, "K18 イエロー"), finish: { tsuchime: { size: "small" as const, area: "outer" as const }, inlay: "nunome" as const } };
    const b = normalizeBand(old);
    expect(b.finish).toBeUndefined();
    const steps = bandHowTo(b, "hand", 3, null, { goldBase: true });
    expect(JSON.stringify(steps)).not.toMatch(/煮色|槌目|象嵌|ミル/);
  });

  it("地金のみの指輪の形の欄（作るの「形」と、確かめるの「手で変える」で同じ部品）に、伝統の仕上げの欄が出ない", () => {
    const html = renderedBandPanel();
    expect(html).toContain("地金");
    expect(html).not.toContain('class="trad');
    expect(html).not.toContain("伝統の仕上げ");
    expect(html).not.toContain("模様を自分で変える");
    expect(html).not.toMatch(/data-bt=|nm-panel|赤銅|四分一|槌目|象嵌|ミル打ち/);
  });

  it("一粒石の指輪の「手で変える」も、伝統の仕上げの欄を FINISHES_OFFERED のときだけ組む", () => {
    // main.ts は画面に直につながっていて、ここでは描けない。欄を組む所が値で止められていることを見る（本物の画面はスクリーンショットで確かめた）
    const main = readFileSync("src/studio/main.ts", "utf8");
    expect(main).toContain('${FINISHES_OFFERED ? tradHtml(pick, s) : ""}');
    expect(main.match(/tradHtml\(pick, s\)/g)).toHaveLength(1);
    expect(main).toContain("if (FINISHES_OFFERED && s.finish?.inlay) bindNunomePanel");
  });
});

/** 画面のない所で、地金のみの指輪の形の欄を描いて、その HTML を返す（何を聞かれても空で返す、まねの箱） */
function renderedBandPanel(): string {
  const anyEl = (): unknown =>
    new Proxy(function () {}, {
      get: (_t, k) => (k === "querySelectorAll" ? () => [] : k === "querySelector" ? () => anyEl() : k === Symbol.toPrimitive ? () => 0 : k === "dataset" || k === "style" || k === "classList" ? anyEl() : anyEl()),
      apply: () => anyEl(),
      set: () => true,
    });
  let html = "";
  const box = new Proxy(
    {},
    {
      get: (_t, k) => (k === "innerHTML" ? html : k === "querySelectorAll" ? () => [] : k === "querySelector" ? () => anyEl() : anyEl()),
      set: (_t, k, v) => {
        if (k === "innerHTML") html = String(v);
        return true;
      },
    },
  ) as HTMLElement;
  let band = { ...defaultBand(GUIDES.metals.k18y.densityGPerCm3, "K18 イエロー"), finish: { inlay: "nunome" as const } };
  const host: BandPanelHost = {
    band: () => band,
    change: (b) => (band = { ...b, finish: band.finish }),
    metal: () => "k18yg",
    setMetal: () => {},
    cut: () => false,
    setCut: () => {},
    guides: () => GUIDES,
  };
  try {
    renderBandPanel(box, host);
  } catch {
    // 画面のない所では、断面の画面をつなぐ所で止まることがある。欄の HTML はその前にできている
  }
  return html;
}
