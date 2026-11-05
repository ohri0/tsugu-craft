import { describe, expect, it } from "vitest";
import { buildRing } from "../src/geometry/ring";
import { howToMake } from "../src/studio/howto";
import { cardFlow, cardsPrintHtml, detailGroups, FLOW_TOOLS, flowToolsFor, glossary, glossOf, markTerms, splitLead, stepCard, toolWord, wordsIn } from "../src/studio/cards";
import { STEP_DETAILS, withDetails } from "../src/studio/steps";
import { TERMS } from "../src/studio/process";
import { STEP_TOOLS, TOOLS } from "../src/studio/toolbox";
import { bandHowTo, type Band } from "../src/studio/band";
import { stoneFrom } from "./helpers/stones";
import { triangle } from "./helpers/synth";

const stone = stoneFrom(triangle(200, 200, 160, 140), 8.88, 4.24);
const steps = (style: "prong" | "bezel", method: "hand" | "cast") => {
  const ring = buildRing({ stone, setting: { style, height: "standard" }, shank: { gou: 11 }, orientation: "along" });
  return howToMake({ ring, outlineMm: stone.outlineMm, longMm: stone.longMm, widthMm: stone.widthMm, depthMm: stone.depthMm, metalLabel: "K18", alloy: "k18y" }, method);
};
const all = [...steps("prong", "hand"), ...steps("prong", "cast"), ...steps("bezel", "hand"), ...steps("bezel", "cast")];

describe("作り方の札：1 行の頭", () => {
  it("「見出し：文」は、見出しを頭にする（間をあける頭）", () => {
    expect(splitLead("SV925：約 593 ℃。")).toEqual({ lead: "SV925", text: "約 593 ℃。", head: true });
  });
  it("見出しがなければ、はじめの「は」「、」の前を頭にする（間をあけない頭）", () => {
    expect(splitLead("地金は固まるとき縮む。")).toEqual({ lead: "地金", text: "は固まるとき縮む。", head: false });
    expect(splitLead("鋳込んだら、合金の表を見る。")).toEqual({ lead: "鋳込んだら", text: "、合金の表を見る。", head: false });
    expect(splitLead("指輪では腕の下に付ける。")).toEqual({ lead: "指輪では", text: "腕の下に付ける。", head: false });
  });
  it("頭が長すぎるときは、頭なし。文はそのまま", () => {
    const t = "腕の材料の長さ ＝（内径 ＋ 厚み）× 3.1416。";
    expect(splitLead(t)).toEqual({ lead: "", text: t, head: false });
  });
  it("頭と文をつなぐと、元の文に戻る（字を落とさない）", () => {
    for (const st of all)
      for (const d of st.details ?? []) {
        const l = splitLead(d.text);
        expect(l.head ? `${l.lead}：${l.text}` : l.lead + l.text).toBe(d.text);
      }
  });
});

describe("作り方の札：まとまり", () => {
  it("同じ見出しが続く行は、まとまり（埋没・焼成）にする", () => {
    const g = detailGroups(STEP_DETAILS.invest);
    expect(g.map((x) => x.group)).toEqual(["埋没", "焼成"]);
    expect(g[0].lines.length + g[1].lines.length).toBe(STEP_DETAILS.invest.length);
  });
  it("1 行だけの見出し（例：）は、その行の頭", () => {
    const g = detailGroups(STEP_DETAILS.pour);
    expect(g.every((x) => x.group === "")).toBe(true);
    expect(g.flatMap((x) => x.lines).some((l) => l.lead === "例" && l.head)).toBe(true);
  });
});

describe("作り方の札：工程 → 札", () => {
  it("番号は 01 から。数字の表は、工程の数字そのまま", () => {
    const s = steps("prong", "hand");
    const c = s.map(stepCard);
    expect(c.map((x) => x.no).slice(0, 3)).toEqual(["01", "02", "03"]);
    c.forEach((x, i) => expect(x.rows).toEqual(s[i].specs));
    expect(c[0].rows.map((r) => r.label)).toContain("腕の線");
  });
  it("道具の札の並びの代わりに、「詳しく」の 1 行目が「道具」。前に札があった道具がぜんぶ入る", () => {
    for (const st of all) {
      const c = stepCard(st, 0);
      const want = (STEP_TOOLS[st.title] ?? []).map((id) => toolWord(TOOLS.find((t) => t.id === id)!));
      if (!want.length) continue;
      const first = c.groups[0].lines[0];
      expect(first.lead, st.title).toBe("道具");
      for (const w of want) expect(first.text.split("、"), `${st.title} の ${w}`).toContain(w);
    }
  });
  it("道具の行の言葉は、どれも押せる（ことば帳にあり、印が付く）", () => {
    for (const st of all) {
      const c = stepCard(st, 0);
      for (const w of c.tools) {
        expect(glossOf(w), w).toBeTruthy();
        expect(wordsIn(c.groups[0].lines[0].text), `${st.title} の ${w}`).toContain(w);
      }
    }
  });
  it("指輪（地金のみの指輪）の工程も、道具の行が出る", () => {
    // tests/band.test.ts と同じ指輪で、手のひら側だけ細くする（形を整える の工程も出す）
    const band: Band = { gou: 12, kind: "kouman", top: { width: 4, thickness: 1.6 }, bottom: { width: 3, thickness: 1.6 }, density: 15.5, metalLabel: "K18" };
    for (const st of [...bandHowTo(band, "hand", 3, "k18y"), ...bandHowTo(band, "cast", 3, "k18y")]) expect(stepCard(st, 0).tools.length, st.title).toBeGreaterThan(0);
  });
});

describe("ことば帳（言葉と道具を 1 つに）", () => {
  it("今までの言葉は、意味を変えずに全部ある", () => {
    for (const t of TERMS) expect(glossOf(t.word)?.meaning, t.word).toBe(t.meaning);
  });
  it("どの道具にも言葉があり、使い方が付く。同じ言葉は 1 つ", () => {
    for (const t of TOOLS) {
      const g = glossOf(toolWord(t));
      expect(g?.tool?.how.length, t.id).toBeGreaterThan(1);
    }
    const words = glossary().map((g) => g.word);
    expect(new Set(words).size).toBe(words.length);
  });
  it("同じ物の言葉（芯金・バーナー）は、言葉の意味と道具の使い方が 1 つにまとまる", () => {
    const g = glossOf("芯金")!;
    expect(g.meaning).toBe(TERMS.find((t) => t.word === "芯金")!.meaning);
    expect(g.tool?.name).toContain("芯金");
  });
  it("長い言葉を先に印する（ロウ付けの台 は ロウ付け より先、同じ言葉は 1 回だけ）", () => {
    const h = markTerms("ロウ付けの台で、ロウ付けする。ロウ付けする。");
    expect(h).toContain('data-term="ロウ付けの台"');
    expect(h.match(/data-term="ロウ付け"/g)!.length).toBe(1);
  });
});

describe("帳面と指示書の札（印刷）", () => {
  it("記録には詳しくを入れない。工程の名前から詳しくを戻せる", () => {
    const s = steps("prong", "hand");
    const bare = s.map(({ details: _d, ...rest }) => rest);
    expect(bare.map(withDetails).map((x) => x.details)).toEqual(s.map((x) => x.details));
  });
  it("札の数字と、詳しくの行と、道具の行が入る", () => {
    const s = steps("prong", "hand");
    const html = cardsPrintHtml(s, { details: true });
    expect(html.match(/class="sc-card/g)!.length).toBe(s.length);
    expect(html).toContain(s[0].specs[0].value.replace(/&/g, "&amp;"));
    expect(html).toContain("<b class=\"h\">道具</b>");
    expect(html).toContain("座の深さ");
  });
  it("詳しくを入れないときは、詳しくの行がない", () => {
    expect(cardsPrintHtml(steps("prong", "hand"), { details: false })).not.toContain("sc-lines");
  });
});

describe("手順の札：流れの文（作者の声 2026-11-05）", () => {
  it("流れの文に「道具」の行が入らない。道具は、文に出るか、最後の一言に入る（どちらかに必ず）", () => {
    for (const [style, m] of [["prong", "hand"], ["prong", "cast"], ["bezel", "hand"], ["bezel", "cast"]] as const)
      for (const st of steps(style, m)) {
        const c = stepCard(st, 0);
        const f = cardFlow(c, m);
        const said = [c.text, f.added, ...f.lines.map((l) => l.g ?? l.t ?? ""), c.watch ?? ""].join("");
        expect(f.lines.some((l) => l.t?.startsWith("道具"))).toBe(false);
        for (const t of c.tools) expect(said.includes(t) || f.rest.includes(t), `${st.title} の ${t}`).toBe(true);
        for (const t of f.rest) expect(said.includes(t), `${st.title} の ${t} は文に出ている`).toBe(false);
      }
  });
  it("見出しの行は「見出し：文」のまま読める（K18 イエロー：620〜677 ℃）", () => {
    const f = cardFlow(stepCard(steps("prong", "hand").find((s) => s.id === "anneal")!, 0), "hand");
    expect(f.lines.some((l) => l.t?.startsWith("K18 イエロー：620"))).toBe(true);
    expect(f.lines.some((l) => l.g === "焼きなまし")).toBe(true);
  });
  it("足す文に、新しい数字を作らない。道具の言葉はことば帳にあって押せる", () => {
    for (const [k, v] of Object.entries(FLOW_TOOLS)) {
      expect(v.replace(/3D/g, ""), k).not.toMatch(/\d/);
      expect(wordsIn(v).length, k).toBeGreaterThan(0);
      const title = k.replace(/^(hand|cast):/, "");
      expect(STEP_TOOLS[title], `${k} は道具の表の工程`).toBeTruthy();
    }
  });
  it("石を並べた指輪の「（石 2）」の題でも、同じ文が引ける", () => {
    expect(flowToolsFor("石座を組む（石 2）", "hand")).toBe(FLOW_TOOLS["石座を組む"]);
    expect(flowToolsFor("仕上げ", "cast")).toBe(FLOW_TOOLS["cast:仕上げ"]);
    expect(flowToolsFor("知らない工程", "hand")).toBe("");
  });
  it("押す言葉の印は、札の中で 1 回だけ（同じ言葉の点線が並ばない）", () => {
    const seen = new Set<string>();
    const a = markTerms("バーナーで熱する", seen);
    const b = markTerms("バーナーを離す", seen);
    expect(a).toContain('class="term"');
    expect(b).not.toContain('class="term"');
  });
});
