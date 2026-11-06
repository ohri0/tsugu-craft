// 布目象嵌の模様（選ぶ・変える・作れるかの確かめ）、地金のみの指輪の伝統の仕上げ、Claude の道具の入力（src/geometry/nunome.ts ほか）
import { describe, expect, it } from "vitest";
import {
  NUNOME_FORM,
  NUNOME_PATTERNS,
  checkNunome,
  defaultNunome,
  faceSpan,
  narrowestGround,
  nunomeLayout,
  nunomeOf,
  nunomeSvg,
  slivers,
  validateNunome,
  type NunomeContext,
} from "../src/geometry/nunome";
import { GUIDES } from "../src/rules/guides";
import { effectiveGuides, addRule, seedLedger, PARAMS } from "../src/rules/ledger";
import { openEdges } from "../src/cad/solid";
import { bandHowTo, bandMesh, checkBand, defaultBand, pickSection, specOf } from "../src/studio/band";
import { sectionLoop } from "../src/cad/section";
import { parseToolCall, nunomeInput } from "../src/claude/tools";
import { toolLogLine } from "../src/claude/words";
import { finishFrom } from "../src/studio/session";
import { buildRing, type RingParams } from "../src/geometry/ring";
import { checkRing } from "../src/rules/checks";
import { triangleStone } from "./helpers/stones";

const C = 2 * Math.PI * 9.75;
/** 平らで広い面（帯が収まるかで止まらない） */
const wide: NunomeContext = { circumferenceMm: C, face: { leftMm: 3, rightMm: 3, centerCorner: false } };

describe("布目象嵌の模様：形と値", () => {
  it("どの模様も、帯の中に線か平金を作り、帯からはみ出さない", () => {
    for (const p of NUNOME_PATTERNS) {
      const d = { ...defaultNunome(p), widthMm: 2.4 };
      const lay = nunomeLayout(d, C);
      const parts = NUNOME_FORM[p] === "fill" ? lay.fills : lay.lines;
      expect(parts.length, p).toBeGreaterThan(0);
      for (const pl of [...lay.lines, ...lay.fills, ...lay.borders]) for (const [u, v] of pl) {
        expect(Math.abs(v), p).toBeLessThanOrEqual(lay.halfMm + 1e-6);
        expect(u, p).toBeGreaterThanOrEqual(lay.u0 - 1e-6);
        expect(u, p).toBeLessThanOrEqual(lay.u1 + 1e-6);
      }
      // 小さな絵（選ぶ欄の見本）も描ける
      expect(nunomeSvg(d, { circumferenceMm: C })).toMatch(/^<svg[\s\S]*<path d="M/);
    }
  });

  it("回していない模様は、一周にちょうど整数個並ぶ（継ぎ目が出ない）", () => {
    for (const p of NUNOME_PATTERNS) {
      if (p === "naname") continue;
      const lay = nunomeLayout(defaultNunome(p), C);
      const n = C / lay.repeatMm;
      expect(Math.abs(n - Math.round(n)), p).toBeLessThan(1e-6);
    }
  });

  it("はじめの模様は、ふつうの帯（平らな面・幅 2.4 mm）で作れる", () => {
    for (const p of NUNOME_PATTERNS) {
      const d = { ...defaultNunome(p), widthMm: 2.4, scaleMm: p === "jiyu" ? 2 : defaultNunome(p).scaleMm };
      const issues = checkNunome(d, wide);
      expect(issues.map((x) => `${x.check}:${x.current}`), p).toEqual([]);
    }
  });

  it("前の記録（模様なし）は菱つなぎ。値の入力の形を確かめる", () => {
    expect(nunomeOf({ inlay: "nunome" })!.pattern).toBe("hishi");
    expect(nunomeOf({})).toBeNull();
    expect(validateNunome({ pattern: "asanoha", scaleMm: 2, lineMm: 0.2 })).toBeNull();
    expect(validateNunome({ pattern: "dragon" as never })).not.toBeNull();
    expect(validateNunome({ scaleMm: 100 })).not.toBeNull();
    expect(validateNunome({ lineMm: Number.NaN })).not.toBeNull();
    expect(validateNunome({ around: 0.7 })).not.toBeNull();
    expect(validateNunome({ cells: "0101" })).not.toBeNull();
    expect(validateNunome({ cells: "0".repeat(15) + "1" })).toBeNull();
  });

  it("模様を自分で変える：回す・伸ばす・裏返す・ずらすで形が変わる", () => {
    const base = nunomeLayout({ ...defaultNunome("asanoha"), widthMm: 2.4 }, C);
    const rot = nunomeLayout({ ...defaultNunome("asanoha"), widthMm: 2.4, rotateDeg: 30 }, C);
    const mir = nunomeLayout({ ...defaultNunome("karakusa"), widthMm: 2.4, mirror: true }, C);
    const mir0 = nunomeLayout({ ...defaultNunome("karakusa"), widthMm: 2.4 }, C);
    expect(rot.lines[0]).not.toEqual(base.lines[0]);
    expect(JSON.stringify(mir.lines)).not.toEqual(JSON.stringify(mir0.lines));
    const st = nunomeLayout({ ...defaultNunome("hishi"), stretch: 2 }, C);
    expect(st.repeatMm).toBeGreaterThan(nunomeLayout(defaultNunome("hishi"), C).repeatMm * 1.8);
  });

  it("地のすき間は、模様の形から計算した値に近い（菱：ひし形に入る円 − 線の太さ）", () => {
    const d = { ...defaultNunome("hishi"), widthMm: 3 };
    const s = d.scaleMm;
    const h = 0.6 * s;
    const side = Math.hypot(s / 2, h / 2);
    const expected = (s * h) / (2 * side) - d.lineMm;
    expect(narrowestGround(nunomeLayout(d, C))).toBeCloseTo(expected, 1);
  });
});

describe("布目象嵌の確かめ：作れない形だけを赤に", () => {
  it("線が細すぎる（0.10 mm）と止まる。直すと資料の 0.15 mm", () => {
    const d = { ...defaultNunome("asanoha"), widthMm: 2.4, lineMm: 0.1 };
    const is = checkNunome(d, wide).find((x) => x.check === "nunome-line")!;
    expect(is).toBeDefined();
    expect(is.requiredValue).toBe(GUIDES.inlay.wireMinMm);
    expect(is.patch.lineMm).toBe(0.15);
    expect(checkNunome({ ...d, ...is.patch }, wide).some((x) => x.check === "nunome-line")).toBe(false);
  });

  it("線が太すぎる（1.2 mm）も止まる（資料の線は 1 mm 以下）", () => {
    const is = checkNunome({ ...defaultNunome("suji"), widthMm: 6, scaleMm: 3, lineMm: 1.2 }, { ...wide, face: { leftMm: 5, rightMm: 5, centerCorner: false } });
    expect(is.some((x) => x.check === "nunome-line" && x.requiredValue === GUIDES.inlay.wireMaxMm)).toBe(true);
  });

  it("線の間がせまいと止まり、直し方（模様を大きくする）で通る", () => {
    const d = { ...defaultNunome("shippo"), widthMm: 2.4, scaleMm: 0.6 };
    const is = checkNunome(d, wide).find((x) => x.check === "nunome-gap")!;
    expect(is).toBeDefined();
    expect(is.currentValue).toBeLessThan(GUIDES.inlay.minGapMm);
    expect(is.patch.scaleMm!).toBeGreaterThan(d.scaleMm);
    expect(checkNunome({ ...d, ...is.patch }, wide).some((x) => x.check === "nunome-gap")).toBe(false);
  });

  it("線どうしがつながってしまう細かすぎる筋は、すき間 0 として止まる", () => {
    const d = { ...defaultNunome("suji"), widthMm: 2.4, scaleMm: 0.2, lineMm: 0.2 };
    expect(narrowestGround(nunomeLayout(d, C))).toBeLessThan(0.05);
    expect(checkNunome(d, wide).some((x) => x.check === "nunome-gap")).toBe(true);
  });

  it("離れた小さなかけら：市松を帯で切った細い平金。縁の線がない帯の端で切れた線", () => {
    // 市松の 2 段目が、帯の端で細く切れる
    const d = { ...defaultNunome("ichimatsu"), widthMm: 1.5 };
    const sl = slivers(nunomeLayout(d, C));
    expect(sl.some((x) => x.kind === "foil" && x.sizeMm < GUIDES.inlay.minPieceMm)).toBe(true);
    expect(checkNunome(d, wide).some((x) => x.check === "nunome-piece")).toBe(true);
    // 縁の線がない菱つなぎは、帯の端で切れた短い線が離れて残る。縁の線をつけると、線がつながって消える
    const open = { ...defaultNunome("hishi"), widthMm: 1.5, border: false };
    const pieces = checkNunome(open, wide).find((x) => x.check === "nunome-piece");
    if (pieces) {
      expect(pieces.patch.border).toBe(true);
      expect(checkNunome({ ...open, ...pieces.patch }, wide).some((x) => x.check === "nunome-piece")).toBe(false);
    }
    // 一周の継ぎ目で切れた物は、向こう側とつながるので数えない
    expect(slivers(nunomeLayout({ ...defaultNunome("suji"), widthMm: 2.4 }, C))).toEqual([]);
  });

  it("平金の厚みは目安の幅の外で止まる（仮の目安）", () => {
    const d = { ...defaultNunome("jiyu"), widthMm: 2.4, scaleMm: 2, foilMm: 0.5 };
    const is = checkNunome(d, wide).find((x) => x.check === "nunome-foil")!;
    expect(is.requiredValue).toBe(GUIDES.inlay.foilMaxMm);
    expect(checkNunome({ ...d, foilMm: 0.1 }, wide).some((x) => x.check === "nunome-foil")).toBe(false);
    // 線の模様には平金の確かめはない
    expect(checkNunome({ ...defaultNunome("hishi"), foilMm: 0.9 }, wide).some((x) => x.check === "nunome-foil")).toBe(false);
  });

  it("帯が腕の面からはみ出すと止まる。面の真ん中が溝の底・山の頂なら入れられない", () => {
    const narrow: NunomeContext = { circumferenceMm: C, face: { leftMm: 1, rightMm: 1, centerCorner: false } };
    const is = checkNunome({ ...defaultNunome("hishi"), widthMm: 2 }, narrow).find((x) => x.check === "nunome-fit")!;
    expect(is.requiredValue).toBeCloseTo(2 * (1 - GUIDES.inlay.edgeMarginMm), 6);
    expect(checkNunome({ ...defaultNunome("hishi"), widthMm: 2, ...is.patch }, narrow).some((x) => x.check === "nunome-fit")).toBe(false);
    const ridge = checkNunome(defaultNunome("hishi"), { circumferenceMm: C, face: { leftMm: 0, rightMm: 0, centerCorner: true } });
    expect(ridge.find((x) => x.check === "nunome-fit")!.title).toContain("角");
  });

  it("職人が目安帳で値を変えると、確かめもその値で動く（Claude に教える）", () => {
    expect(PARAMS["inlay.wireMinMm"].checks).toContain("nunome-line");
    const d = { ...defaultNunome("hishi"), widthMm: 2.4, lineMm: 0.18 };
    expect(checkNunome(d, wide).some((x) => x.check === "nunome-line")).toBe(false);
    const ledger = addRule(seedLedger(), { title: "線は 0.2 mm から", text: "布目に打つ線は 0.2 mm 以上", reason: "細い線は切れる", param: "inlay.wireMinMm", value: 0.2, source: { kind: "craftsman", name: "石川" }, date: "2026-11-07" });
    const g = effectiveGuides(ledger);
    expect(g.inlay.wireMinMm).toBe(0.2);
    expect(checkNunome(d, wide, g).some((x) => x.check === "nunome-line")).toBe(true);
  });
});

describe("腕の面：帯を入れられる広さ（断面の形から）", () => {
  const faceOf = (k: Parameters<typeof pickSection>[1]) => {
    const b = pickSection(defaultBand(8.9, "赤銅（煮色）"), k);
    return faceSpan(sectionLoop(specOf(b, "top")).map((p) => ({ x: p.x, y: p.h })), true);
  };
  it("甲丸・くぼみは広く、左右同じ。段つきは高い所だけ。V 溝と山形は真ん中が角", () => {
    const kouman = faceOf("kouman");
    expect(kouman.leftMm).toBeGreaterThan(1.2);
    expect(Math.abs(kouman.leftMm - kouman.rightMm)).toBeLessThan(0.1);
    expect(faceOf("kubomi").leftMm).toBeGreaterThan(1.8);
    const dan = faceOf("dan");
    expect(dan.leftMm).toBeLessThan(GUIDES.band.sectionSizes.dan.widthMm / 2 - 0.3);
    expect(faceOf("vmizo").centerCorner).toBe(true);
    expect(faceOf("yamagata").centerCorner).toBe(true);
  });
});

describe("地金のみの指輪の伝統の仕上げ（変わった断面にも）", () => {
  const sections = ["kouman", "hirauchi", "kubomi", "dan", "mentori", "yamagata", "vmizo"] as const;
  it("ミル打ちの粒を足しても、どの断面でも STL は閉じたまま。重さが増える", () => {
    for (const k of sections) {
      const b = pickSection(defaultBand(8.9, "赤銅（煮色）"), k);
      const plain = bandMesh(b);
      const m = bandMesh({ ...b, finish: { milgrain: "edges", tsuchime: { size: "medium", area: "outer", style: "maru" }, inlay: "nunome", nunome: defaultNunome("asanoha") } });
      expect(openEdges(m.positions), k).toBe(0);
      expect(m.milgrain!.count, k).toBeGreaterThan(50);
      expect(m.positions.length / 9 - plain.positions.length / 9).toBe(m.milgrain!.triangles);
      expect(m.weightG).toBeGreaterThan(plain.weightG);
      // 槌目と象嵌は面の仕上げ（形は変えない）
      expect(bandMesh({ ...b, finish: { tsuchime: { size: "large", area: "all" }, inlay: "nunome" } }).positions.length).toBe(plain.positions.length);
    }
  }, 120000);

  it("確かめ：V 溝の真ん中には帯を入れられない。くぼみには入る。槌目は薄い指輪で止まる", () => {
    const fin = { inlay: "nunome" as const, nunome: { ...defaultNunome("asanoha"), widthMm: 2.4 } };
    const v = { ...pickSection(defaultBand(8.9, "赤銅（煮色）"), "vmizo"), finish: fin };
    expect(checkBand(v).some((p) => p.check === "nunome-fit")).toBe(true);
    const ku = { ...pickSection(defaultBand(8.9, "赤銅（煮色）"), "kubomi"), finish: fin };
    expect(checkBand(ku).filter((p) => p.check.startsWith("nunome-"))).toEqual([]);
    // 直すと、帯が面に収まる（段つき）
    const dan = { ...pickSection(defaultBand(8.9, "赤銅（煮色）"), "dan"), finish: fin };
    const p = checkBand(dan).find((x) => x.check === "nunome-fit")!;
    expect(p).toBeDefined();
    expect(checkBand(p.fix.apply(dan)).some((x) => x.check === "nunome-fit")).toBe(false);
    const thin = { ...defaultBand(8.9, "赤銅（煮色）"), top: { width: 3, thickness: 1.25 }, bottom: { width: 3, thickness: 1.25 }, finish: { tsuchime: { size: "large" as const, area: "outer" as const } } };
    const ts = checkBand(thin).find((x) => x.check === "tsuchime-thin")!;
    expect(ts).toBeDefined();
    // 直し方を押すたびに 1 段小さく（いちばん小さくても薄ければ、やめる）。何度か押せば通る
    let x: typeof thin = thin;
    for (let k = 0; k < 3; k++) {
      const q = checkBand(x).find((y) => y.check === "tsuchime-thin");
      if (q) x = q.fix.apply(x) as typeof thin;
    }
    expect(checkBand(x).some((y) => y.check === "tsuchime-thin")).toBe(false);
  });

  it("作り方：色金の地金のみの指輪は手作りで、布目象嵌の 5 工程（模様の範囲と線の太さ）→ 仕上げ → 煮色", () => {
    const b = { ...pickSection(defaultBand(8.9, "赤銅（煮色）"), "kubomi"), finish: { inlay: "nunome" as const, nunome: { ...defaultNunome("asanoha"), widthMm: 2.4 } } };
    const steps = bandHowTo(b, "cast", 5, null, { irogane: "shakudo" });
    const ids = steps.map((s) => s.id);
    expect(ids).not.toContain("invest");
    const at = (id: string) => ids.indexOf(id);
    for (const id of ["nunome_prep", "nunome_cut", "nunome", "nunome_close", "nunome_ground"]) expect(at(id), id).toBeGreaterThan(0);
    expect(at("nunome_ground")).toBeLessThan(at("finish"));
    expect(at("finish")).toBeLessThan(at("niiro"));
    const cut = steps.find((s) => s.id === "nunome_cut")!;
    expect(cut.text).toMatch(/模様の範囲 2\.4 mm × \d+\.\d mm、線の太さ 0\.15 mm/);
    expect(steps.find((s) => s.id === "nunome_prep")!.text).toContain("麻の葉");
    expect(steps.find((s) => s.id === "nunome")!.title).toContain("純金");
    // 仕上げのない地金のみの指輪の作り方は、前と同じ
    const plain = bandHowTo(defaultBand(15.5, "K18 イエロー"), "cast", 5, "k18y");
    expect(plain.map((s) => s.id)).toContain("invest");
    expect(plain.map((s) => s.id)).not.toContain("nunome");
  });
});

describe("石の指輪：象嵌の模様の確かめと、前の記録", () => {
  const params = (o: Partial<RingParams> = {}): RingParams => ({
    stone: triangleStone(),
    setting: { style: "prong", culetGapMm: 0.94, solid: true, solidQuality: "preview", join: "between" },
    shank: { gou: 11, widthMm: 2.2, thicknessMm: 1.6 },
    ...o,
  });
  it("前の記録の布目象嵌（模様なし）は、そのまま作れる。線を細くすると止まり、腕は赤くしない", () => {
    expect(checkRing(buildRing(params({ finish: { inlay: "nunome" } }))).filter((p) => p.check.startsWith("nunome-"))).toEqual([]);
    const bad = checkRing(buildRing(params({ finish: { inlay: "nunome", nunome: { ...defaultNunome(), lineMm: 0.1 } } }))).find((p) => p.check === "nunome-line")!;
    expect(bad.target.kind).toBe("inlay");
    expect(bad.options.map((o) => o.id)).toEqual(["inlayLine", "noInlay"]);
    expect(bad.nunomePatch).toEqual({ lineMm: 0.15 });
  });
});

describe("Claude の道具：布目象嵌の模様（前の入力もそのまま通る）", () => {
  const base = { reason: "麻の葉の布目象嵌で" };
  it("「麻の葉の布目象嵌で」の入力が通り、模様が入る", () => {
    expect(parseToolCall("set_shank", { ...base, finish: { inlay_pattern: "asanoha" } }).ok).toBe(true);
    expect(parseToolCall("set_shank", { ...base, finish: { inlay: "nunome", inlay_pattern: "seigaiha", inlay_scale_mm: 2.4, inlay_line_mm: 0.2, inlay_width_mm: 2, inlay_metal: "silver", inlay_border: false, inlay_around: "half" } }).ok).toBe(true);
    expect(parseToolCall("set_shank", { ...base, finish: { inlay_pattern: "jiyu", inlay_cells: "0110100110010110", inlay_rotate_deg: 15, inlay_stretch: 1.5, inlay_mirror: true } }).ok).toBe(true);
    const f = finishFrom({ inlay_pattern: "asanoha" }, undefined)!;
    expect(f.inlay).toBe("nunome");
    expect(f.nunome!.pattern).toBe("asanoha");
    expect(f.nunome!.scaleMm).toBe(defaultNunome("asanoha").scaleMm);
    // 書いた項目だけ変わる
    const g = finishFrom({ inlay_line_mm: 0.3 }, f)!;
    expect(g.nunome).toMatchObject({ pattern: "asanoha", lineMm: 0.3 });
    expect(finishFrom({ inlay: "none" }, g)).toBeUndefined();
  });

  it("前の入力（inlay: nunome だけ）は、前と同じ（菱つなぎ）", () => {
    expect(parseToolCall("set_shank", { ...base, finish: { inlay: "nunome" } }).ok).toBe(true);
    const f = finishFrom({ inlay: "nunome" }, undefined)!;
    expect(nunomeOf(f)!.pattern).toBe("hishi");
  });

  it("知らない模様・範囲の外の数・形のちがう値は断る", () => {
    expect(parseToolCall("set_shank", { ...base, finish: { inlay_pattern: "dragon" } }).ok).toBe(false);
    expect(parseToolCall("set_shank", { ...base, finish: { inlay_scale_mm: 40 } }).ok).toBe(false);
    expect(parseToolCall("set_shank", { ...base, finish: { inlay_line_mm: "thin" } }).ok).toBe(false);
    expect(parseToolCall("set_shank", { ...base, finish: { inlay_border: "yes" } }).ok).toBe(false);
    expect(parseToolCall("set_shank", { ...base, finish: { inlay_cells: "12" } }).ok).toBe(false);
    expect(parseToolCall("set_shank", { ...base, finish: { inlay: "none", inlay_pattern: "asanoha" } }).ok).toBe(false);
  });

  it("作業の記録の言葉は日本語で、英字の名前を見せない。直し方の入力は、模様の値から作れる", () => {
    const line = toolLogLine({ tool: "set_shank", input: { ...base, finish: { inlay_pattern: "asanoha", inlay_line_mm: 0.2 } }, ok: true });
    expect(line.text).toContain("布目象嵌（麻の葉・線 0.2 mm）");
    expect(line.text).not.toMatch(/asanoha|inlay/);
    expect(nunomeInput({ lineMm: 0.15 })).toEqual({ inlay: "nunome", inlay_line_mm: 0.15 });
    expect(parseToolCall("set_shank", { ...base, finish: nunomeInput({ scaleMm: 2, border: true, around: 0.5 }) }).ok).toBe(true);
  });
});
