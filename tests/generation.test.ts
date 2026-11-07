// 設計の「生成」：石の約束（今の石を使う・石もおまかせ）、号の約束、戻す・進む（生成の前に戻す）、腕の形の見本。
// 本物の Claude は呼ばない（偽物の返事で、道具の形と動きを確かめる）。
import { describe, expect, it } from "vitest";
import { SECTION_LIST, type PresetKind } from "../src/cad/section";
import { runClaude } from "../src/claude/loop";
import { STONE_FREE_NOTE, STONE_KEEP_NOTE, gouNote } from "../src/claude/prompt";
import { INPUT_BOUNDS, STONE_SHAPES, TOOLS, isAllowedToolName, isToolName, parseToolCall } from "../src/claude/tools";
import { cannotFrom, plainWords, toolLogLine } from "../src/claude/words";
import { seedLedger } from "../src/rules/ledger";
import { DesignHistory, generationRoute, generationTools, isTextField, keepGou, makeHost, undoKey, wantsNoStone } from "../src/studio/make-run";
import { bandPrompt } from "../src/studio/band";
import { addRule, effectiveGuides } from "../src/rules/ledger";
import { PRESETS, presetOutline, sizedPreset } from "../src/studio/presets";
import { ringSectionInput, ringSectionKind, ringSectionWord } from "../src/studio/ring-shape";
import { RingSession, STONE_LONG_RANGE, carryDesign } from "../src/studio/session";
import { isSample } from "../src/studio/samples";
import { loadWorks, removeSampleWorks } from "../src/studio/works";

const round = PRESETS[0];
const stoneOf = (p = round) => ({ outlineMm: presetOutline(p), longMm: p.longMm, widthMm: p.widthMm, depthMm: p.depthMm });
const newRing = (p = round) => new RingSession(stoneOf(p), () => seedLedger(), () => undefined, () => "");

/** 決まった順に道具を呼ぶ、偽物の Claude */
function fakeClaude(calls: { name: string; input: unknown }[]) {
  const sent: { tools: { name: string; input_schema: { properties: Record<string, unknown> } }[] }[] = [];
  let i = 0;
  const f = async (_u: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    const step = calls[i++];
    const message = step
      ? { id: "m", type: "message", role: "assistant", stop_reason: "tool_use", content: [{ type: "tool_use", id: `t${i}`, name: step.name, input: step.input }] }
      : { id: "m", type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: "やったこと：組みました" }] };
    return new Response(JSON.stringify({ ...message, model: "m", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { f: f as typeof fetch, sent };
}
const run = (host: ReturnType<typeof makeHost>, tools: ReturnType<typeof generationTools>, f: typeof fetch) =>
  runClaude({ host, messages: [{ role: "user", content: "組んでください" }], system: "指示", tools, password: "x", fetch: f, maxTurns: 8 });

describe("石を選ぶ道具", () => {
  it("名前が道具の一覧とサーバーの許可に入り、形はよくある石の札と同じ", () => {
    expect(isToolName("choose_stone")).toBe(true);
    expect(isAllowedToolName("choose_stone")).toBe(true);
    expect([...STONE_SHAPES].sort()).toEqual(PRESETS.map((p) => p.id).sort());
    expect(TOOLS.find((t) => t.name === "choose_stone")!.input_schema.required).toEqual(["shape", "long_mm", "reason"]);
  });
  it("長辺は、石の欄とつまみと同じ範囲で受ける。知らない形は断る", () => {
    expect(STONE_LONG_RANGE.min).toBe(INPUT_BOUNDS.stone_long_mm[0]);
    expect(STONE_LONG_RANGE.max).toBe(INPUT_BOUNDS.stone_long_mm[1]);
    expect(parseToolCall("choose_stone", { shape: "pear", long_mm: 9, reason: "華奢に" }).ok).toBe(true);
    expect(parseToolCall("choose_stone", { shape: "pear", long_mm: 40, reason: "大きく" }).ok).toBe(false);
    expect(parseToolCall("choose_stone", { shape: "triangle", long_mm: 8, reason: "形" }).ok).toBe(false);
  });
  it("大きさだけ変わり、幅と深さは形の例の比のまま", () => {
    const p = sizedPreset("oval", 10);
    expect(p.longMm).toBe(10);
    expect(p.widthMm).toBeCloseTo(7.5);
    expect(p.depthMm).toBeCloseTo(4.63, 1);
  });
  it("作業の記録に英字の名前を出さない", () => {
    const line = toolLogLine({ tool: "choose_stone", input: { shape: "marquise", long_mm: 10, reason: "細く見せる" }, ok: true });
    expect(line.text).toBe("石：マーキス、長辺 10 mm ― 細く見せる");
    expect(plainWords("emerald にしました")).toBe("エメラルド にしました");
  });
});

describe("今の石を使う", () => {
  it("石を選ぶ道具を渡さず、呼ばれても断り、石の形と大きさは変わらない", async () => {
    const s = newRing();
    const before = structuredClone(s.stone);
    const { f, sent } = fakeClaude([
      { name: "choose_stone", input: { shape: "pear", long_mm: 12, reason: "大きく" } },
      { name: "set_setting", input: { height: "high", reason: "高めに" } },
      { name: "set_shank", input: { width_mm: 3, reason: "太く" } },
      { name: "check", input: {} },
    ]);
    const tools = generationTools(false);
    expect(tools.map((t) => t.name)).not.toContain("choose_stone");
    const r = await run(makeHost(() => s, { gou: 11 }), tools, f);
    expect(sent[0].tools.map((t) => t.name)).not.toContain("choose_stone");
    const refused = r.log.find((e) => e.kind === "tool" && e.tool === "choose_stone");
    expect(refused && refused.kind === "tool" && refused.ok).toBe(false);
    expect(s.stone).toEqual(before);
    expect(s.state.height).toBe("high");
    expect(s.state.shankWidthMm).toBe(3);
  });
  it("道具を渡していても、受け口がなければ断る", async () => {
    const s = newRing();
    const before = structuredClone(s.stone);
    const { f } = fakeClaude([{ name: "choose_stone", input: { shape: "pear", long_mm: 12, reason: "大きく" } }]);
    const r = await run(makeHost(() => s, { gou: 11 }), generationTools(true), f);
    expect(s.stone).toEqual(before);
    expect(r.changed).toBe(false);
  });
  it("頼みの文で禁止する", () => {
    expect(STONE_KEEP_NOTE).toContain("変えません");
    expect(STONE_FREE_NOTE).toContain("choose_stone");
    expect(gouNote(13)).toContain("13 号");
  });
});

describe("石もおまかせ", () => {
  it("選んだ石に入れ替わり、そのあとの道具は新しい場で動く。腕・地金・号は引き継ぐ", async () => {
    let s = newRing();
    s.state.gou = 14;
    s.state.metal = "pt900";
    s.state.shankWidthMm = 2.8;
    const { f } = fakeClaude([
      { name: "choose_stone", input: { shape: "marquise", long_mm: 11, reason: "細く見せる" } },
      { name: "set_setting", input: { height: "low", reason: "低く" } },
    ]);
    const host = makeHost(() => s, {
      gou: 14,
      chooseStone: async (input) => {
        const p = sizedPreset(input.shape, input.long_mm);
        const next = new RingSession(stoneOf(p), () => seedLedger(), () => undefined, () => "");
        next.state = carryDesign(s.snapshot(), next.state);
        s = next;
        return { shape_name: p.name, long_mm: p.longMm, width_mm: p.widthMm, depth_mm: p.depthMm, stone: "", note: "" };
      },
    });
    const r = await run(host, generationTools(true), f);
    expect(r.changed).toBe(true);
    expect(s.stone.longMm).toBeCloseTo(11);
    expect(s.state.height).toBe("low");
    expect(s.state.gou).toBe(14);
    expect(s.state.metal).toBe("pt900");
    expect(s.state.shankWidthMm).toBe(2.8);
  });
});

describe("号の約束", () => {
  it("生成の腕の道具に号の項目がない（ほかの道具はそのまま）", () => {
    const shank = generationTools(false).find((t) => t.name === "set_shank")!;
    expect(Object.keys((shank.input_schema as { properties: object }).properties)).not.toContain("gou");
    expect(Object.keys((TOOLS.find((t) => t.name === "set_shank")!.input_schema as { properties: object }).properties)).toContain("gou");
  });
  it("Claude が号を変えようとしても断り、決めた号のまま", async () => {
    const s = newRing();
    s.state.gou = 9;
    const { f } = fakeClaude([{ name: "set_shank", input: { gou: 15, width_mm: 3, reason: "太く" } }]);
    const r = await run(makeHost(() => s, { gou: 9 }), generationTools(false), f);
    const e = r.log.find((x) => x.kind === "tool");
    expect(e && e.kind === "tool" && e.ok).toBe(false);
    expect(s.state.gou).toBe(9);
    expect(s.state.shankWidthMm).toBeUndefined();
  });
  it("地金のみの指輪の案も、欄の号にする", () => {
    expect(keepGou({ gou: 20, metal: "pt900" }, 8)).toEqual({ gou: 8, metal: "pt900" });
  });
});

describe("戻す・進む", () => {
  const hist = () => {
    const h = new DesignHistory<number>();
    const put = (v: number) => h.commit(v, String(v));
    return { h, put };
  };
  it("はじめは戻せない。同じ状態は数えない。戻して進める", () => {
    const { h, put } = hist();
    expect(put(1)).toBe(true);
    expect(h.canUndo).toBe(false);
    expect(put(1)).toBe(false);
    put(2);
    put(3);
    expect(h.undo()).toBe(2);
    expect(h.undo()).toBe(1);
    expect(h.undo()).toBeNull();
    expect(h.canRedo).toBe(true);
    expect(h.redo()).toBe(2);
  });
  it("戻した所から変えると、その先は消える", () => {
    const { h, put } = hist();
    put(1);
    put(2);
    h.undo();
    put(5);
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBe(1);
  });
  it("覚える数に上限がある", () => {
    const h = new DesignHistory<number>(3);
    for (const v of [1, 2, 3, 4, 5]) h.commit(v, String(v));
    expect(h.undo()).toBe(4);
    expect(h.undo()).toBe(3);
    expect(h.undo()).toBeNull();
  });
  it("生成の前に戻す：押すと前へ、もう一度押すと後へ。生成のあとに手で直した所も戻る", () => {
    const { h, put } = hist();
    put(1);
    const m = h.mark();
    expect(h.generationLabel).toBeNull();
    put(2); // 生成
    h.endGeneration(m);
    put(3); // 手で直した
    expect(h.generationLabel).toBe("生成の前に戻す");
    expect(h.toggleGeneration()).toBe(1);
    expect(h.generationLabel).toBe("生成のあとに戻す");
    expect(h.toggleGeneration()).toBe(3);
    expect(h.generationLabel).toBe("生成の前に戻す");
  });
  it("形が変わらなかった生成は、前の生成の覚えのまま", () => {
    const { h, put } = hist();
    put(1);
    const a = h.mark();
    put(2);
    h.endGeneration(a);
    const b = h.mark();
    h.endGeneration(b);
    expect(h.toggleGeneration()).toBe(1);
  });
  it("生成の前に戻してから変えると、生成の後は消え、ボタンも消える", () => {
    const { h, put } = hist();
    put(1);
    const m = h.mark();
    put(2);
    h.endGeneration(m);
    h.toggleGeneration();
    put(9);
    expect(h.generationLabel).toBeNull();
    expect(h.toggleGeneration()).toBeNull();
  });
  it("⌘Z で戻す、⇧⌘Z で進む（Windows は Ctrl）。ほかのキーは受けない", () => {
    const k = (o: Partial<Parameters<typeof undoKey>[0]>) => undoKey({ key: "z", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...o });
    expect(k({ metaKey: true })).toBe("undo");
    expect(k({ ctrlKey: true })).toBe("undo");
    expect(k({ metaKey: true, shiftKey: true, key: "Z" })).toBe("redo");
    expect(k({ ctrlKey: true, key: "y" })).toBe("redo");
    expect(k({})).toBeNull();
    expect(k({ metaKey: true, key: "s" })).toBeNull();
    expect(k({ metaKey: true, isComposing: true })).toBeNull();
    // かなの入力でも、キーの場所で受ける
    expect(k({ metaKey: true, key: "つ", code: "KeyZ" })).toBe("undo");
  });
  it("字を打つ欄では字の取り消しのまま。つまみや選ぶ欄は、字の取り消しがない", () => {
    expect(isTextField({ tagName: "INPUT", type: "text" })).toBe(true);
    expect(isTextField({ tagName: "INPUT", type: "number" })).toBe(true);
    expect(isTextField({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTextField({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTextField({ tagName: "INPUT", type: "range" })).toBe(false);
    expect(isTextField({ tagName: "SELECT" })).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});

describe("一粒石の指輪の腕の形", () => {
  const kinds = SECTION_LIST.map((s) => s.id);
  it.each(kinds)("見本 %s で、腕の幅と厚みが保たれ、形ができる", (k) => {
    const s = newRing();
    const w = 2.6;
    const t = 1.8;
    s.setShank({ width_mm: w, thickness_mm: t, reason: "手で" });
    s.setShank({ ...ringSectionInput(k as PresetKind, w, t), reason: "手で" });
    const b = s.built!;
    expect(b.ring.shank.widthMm).toBeCloseTo(w);
    // 角は幅と同じ厚み、丸線は線の太さ（幅）で決まる
    expect(b.ring.shank.thicknessMm).toBeCloseTo(k === "kaku" || k === "maru" ? w : t);
    expect(b.ring.ringPositions.shank.length).toBeGreaterThan(0);
    expect(b.ring.metalWeightG).toBeGreaterThan(0);
    // 石座とのつながりも今までどおり確かめて、どの見本も引っかからない
    expect(b.problems).toEqual([]);
    expect(ringSectionKind(s.state, b.ring.shank.widthMm, b.ring.shank.thicknessMm)).toBe(k);
    expect(ringSectionWord(s.state, b.ring.shank.widthMm, b.ring.shank.thicknessMm)).toBe(SECTION_LIST.find((x) => x.id === k)!.label);
  });
  it("一体の形（画面と STL の作り方）でも、くぼんだ見本で組める", () => {
    const s = newRing();
    s.solid = true;
    s.deferFinal = false;
    s.setShank({ ...ringSectionInput("vmizo", 2.2, 1.6), reason: "手で" });
    expect(s.built!.ring.ringPositions.shank.length).toBeGreaterThan(0);
    expect(s.built!.problems).toEqual([]);
  });
  it("腕の決まった断面の平打ちは、見本の平甲丸と同じ線。半甲丸は見本にないが名前は出す", () => {
    expect(ringSectionKind({ shankSection: "hirauchi" }, 2.2, 1.6)).toBe("hirakouman");
    expect(ringSectionKind({ shankSection: "hangouman" }, 2.2, 1.6)).toBeNull();
    expect(ringSectionWord({ shankSection: "hangouman" }, 2.2, 1.6)).toBe("半甲丸");
    expect(ringSectionKind({}, 2.2, 1.6)).toBe("kouman");
  });
  it("手で描いた線は free", () => {
    const curve = { points: [{ x: 1, y: 0 }, { x: 0.8, y: 0.9 }, { x: 0, y: 1 }, { x: -0.5, y: 0.6 }, { x: -1, y: 0 }] };
    expect(ringSectionKind({ shankSection: "free", sectionCurve: curve }, 2.2, 1.6)).toBe("free");
  });
  it("生成の前に戻すと、腕の形も戻る（設計の写しに入っている）", () => {
    const s = newRing();
    const before = s.snapshot();
    s.setShank({ ...ringSectionInput("mentori", 2.2, 1.6), reason: "手で" });
    expect(s.state.shankSection).toBe("free");
    s.restore(before);
    expect(s.state.shankSection).toBeUndefined();
    expect(s.state.sectionCurve).toBeUndefined();
  });
});

describe("見本の作品を外す", () => {
  const box = new Map<string, string>();
  const ls = { getItem: (k: string) => box.get(k) ?? null, setItem: (k: string, v: string) => void box.set(k, v), removeItem: (k: string) => void box.delete(k) };
  const work = (id: string, title: string, maker: string) => ({ id, title, maker, date: "2026-11-05", kind: "指輪", methodLabel: "鍛造", image: "", specs: [], problems: [], steps: [], note: "" });
  it("見本の作品だけ消え、職人が残した作品は消えない（名前の欄に見本と書いた作品も）", () => {
    (globalThis as { localStorage?: unknown }).localStorage = ls;
    box.set("tsugu.works.v1", JSON.stringify([work("a", "見本：ラウンドの一粒石の指輪（細い爪）", "見本"), work("b", "三角の一粒石の指輪", "石川"), work("c", "ペアの指輪", "見本")]));
    removeSampleWorks();
    expect(loadWorks().map((w) => w.id)).toEqual(["b", "c"]);
    expect(isSample(work("x", "x", "石川"))).toBe(false);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
});

describe("まだできないことの言葉", () => {
  it("石も号も変えなかったときは、札に出せる", () => {
    expect(cannotFrom("やったこと：組んだ\nまだできないこと：13 号にすること")).toContain("13 号");
  });
});

describe("石なし（地金だけの指輪。作者の頼み 2026-11-07）", () => {
  it("はっきり石のない指輪を頼む言い方を拾う", () => {
    for (const w of ["石なしでシンプルに", "石無しで", "石は入れないで細く", "石はいらない", "地金だけの指輪", "地金のみで", "石を付けずに", "A plain band, no stone", "without stones please"]) expect(wantsNoStone(w), w).toBe(true);
  });
  it("石のある頼み・迷う頼みは拾わない", () => {
    for (const w of ["", "かわいく", "結婚指輪にしたい", "石を大きく見せたい", "シンプルに", "石なしじゃなくて、小さい石を", "石を 20 mm に", "stone in the middle"]) expect(wantsNoStone(w), w).toBe(false);
  });
  it("石なしを選んだとき、石もおまかせで石なしを頼まれたときだけ、地金だけの指輪へ", () => {
    expect(generationRoute("none", "かわいく")).toBe("band");
    expect(generationRoute("free", "石なしでシンプルに")).toBe("band");
    expect(generationRoute("free", "かわいく")).toBe("solitaire");
    // 今の石を使うと選んだ人の石は、黙って外さない（画面は「石なしで作る →」を出す）
    expect(generationRoute("keep", "石なしでシンプルに")).toBe("solitaire");
  });
  it("地金のみの指輪の指示に、帳面の腕の厚みの決まりが入る", () => {
    expect(bandPrompt()).toContain("目安）");
    const l = addRule(seedLedger(), { title: "腕の厚み", text: "1.8 mm 以上", reason: "曲がる", param: "band.minThicknessMm", value: 1.8, source: { kind: "craftsman", name: "石川" }, date: "2026-11-07" });
    const p = bandPrompt(effectiveGuides(l));
    expect(p).toContain("厚み 1.8 mm 以上");
    expect(p).toContain("この工房の決まり");
  });
  it("石の約束の文に、石なしの道を書く", () => {
    expect(STONE_KEEP_NOTE).toContain("石なし");
    expect(STONE_FREE_NOTE).toContain("石なし");
  });
});
