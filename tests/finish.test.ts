// 伝統の仕上げ：ミル打ちの粒（本当の形）、槌目とミルの確かめ、色金の重さ、Claude の道具の入力（src/geometry/finish.ts ほか）
import { describe, expect, it } from "vitest";
import { openEdges } from "../src/cad/solid";
import { milgrainBeads } from "../src/geometry/finish";
import { buildRing, type RingParams } from "../src/geometry/ring";
import { meshVolume } from "../src/geometry/stone";
import { checkRing } from "../src/rules/checks";
import { GUIDES } from "../src/rules/guides";
import { parseToolCall } from "../src/claude/tools";
import { toolLogLine } from "../src/claude/words";
import { finishFrom, metalIdOf, smallerTsuchime } from "../src/studio/session";
import { triangleStone } from "./helpers/stones";
import { howToMake } from "../src/studio/howto";

const params = (o: Partial<RingParams> = {}): RingParams => ({
  stone: triangleStone(),
  setting: { style: "prong", culetGapMm: 0.94, solid: true, solidQuality: "preview", join: "between" },
  shank: { gou: 11, widthMm: 2.2, thicknessMm: 1.6 },
  ...o,
});

/** 粒の三角形だけ（腕の三角形の後ろ） */
function beadsOf(withBeads: ReturnType<typeof buildRing>, plain: ReturnType<typeof buildRing>): Float32Array {
  return withBeads.ringPositions.shank.subarray(plain.ringPositions.shank.length);
}

describe("ミル打ち：腕の縁の粒は本当の形", () => {
  const plain = buildRing(params());
  const ring = buildRing(params({ finish: { milgrain: "edges" } }));
  const beads = beadsOf(ring, plain);
  const d = GUIDES.finish.milgrain.beadMm;

  it("粒は両縁に並び、1 つずつ閉じた球で、外向き（STL に出せる）", () => {
    expect(ring.milgrain!.count).toBeGreaterThan(100);
    expect(ring.milgrain!.count % 2).toBe(0);
    expect(beads.length / 9).toBe(ring.milgrain!.count * 320);
    expect(openEdges(beads)).toBe(0);
    expect(meshVolume(beads)).toBeGreaterThan(0);
    // 粒 1 つも閉じている
    expect(openEdges(beads.subarray(0, 320 * 9))).toBe(0);
  });

  it("腕と粒を合わせた STL も閉じたまま。重さは粒の分だけ増える", () => {
    expect(openEdges(plain.ringPositions.shank)).toBe(0);
    expect(openEdges(ring.ringPositions.shank)).toBe(0);
    expect(ring.metalWeightG).toBeGreaterThan(plain.metalWeightG);
    expect(ring.metalWeightG - plain.metalWeightG).toBeLessThan(0.3);
    // 腕の確かめの数は、粒の前の腕のまま
    expect(ring.shank.widthMm).toBe(plain.shank.widthMm);
  });

  it("粒は腕の幅の外へはみ出さず、間かくは粒の大きさ（離さず、重ねず）", () => {
    let maxX = 0;
    for (let i = 0; i < plain.ringPositions.shank.length; i += 3) maxX = Math.max(maxX, Math.abs(plain.ringPositions.shank[i]));
    const centers: [number, number, number][] = [];
    for (let b = 0; b < beads.length; b += 320 * 9) {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      const n = 320 * 3;
      for (let i = b; i < b + 320 * 9; i += 3) {
        cx += beads[i];
        cy += beads[i + 1];
        cz += beads[i + 2];
      }
      centers.push([cx / n, cy / n, cz / n]);
    }
    for (const c of centers) expect(Math.abs(c[0]) + d / 2).toBeLessThan(maxX + 0.03);
    // 同じ縁のとなりの粒の間（中心どうし）は、粒の大きさ ± 少し
    const side = centers.filter((c) => c[0] > 0).sort((a, b) => Math.atan2(a[1], a[2]) - Math.atan2(b[1], b[2]));
    let near = 0;
    for (let i = 1; i < side.length; i++) {
      const g = Math.hypot(side[i][0] - side[i - 1][0], side[i][1] - side[i - 1][1], side[i][2] - side[i - 1][2]);
      if (Math.abs(g - d) < 0.08) near++;
    }
    expect(near / (side.length - 1)).toBeGreaterThan(0.9);
  });

  it("石座のそばと、腕の切れた端には打たない", () => {
    // いちばん上（石座のある所）の ±角度に粒がない
    for (let b = 0; b < beads.length; b += 9) {
      const phi = Math.abs(Math.atan2(beads[b + 1], beads[b + 2]));
      expect(phi).toBeGreaterThan(0.15);
    }
  });

  it("腕の形だけからも作れる（石座なし）", () => {
    const only = milgrainBeads(plain.ringPositions.shank, null);
    expect(only.count).toBeGreaterThan(0);
    expect(openEdges(only.positions)).toBe(0);
  });
});

describe("仕上げの確かめ（仮の決まり）", () => {
  it("ふつうの腕（厚み 1.6 mm）には、大きい槌目も打てる", () => {
    const ring = buildRing(params({ finish: { tsuchime: { size: "large", area: "outer" } } }));
    expect(checkRing(ring).some((p) => p.check === "tsuchime-thin")).toBe(false);
  });

  it("厚み 1.25 mm の腕に大きい槌目を打つと、跡の深さで目安より薄くなる", () => {
    const ring = buildRing(params({ shank: { gou: 11, widthMm: 2.2, thicknessMm: 1.25 }, finish: { tsuchime: { size: "large", area: "outer" } } }));
    const p = checkRing(ring).find((x) => x.check === "tsuchime-thin");
    expect(p).toBeDefined();
    expect(p!.currentValue).toBeCloseTo(1.25 - GUIDES.finish.tsuchime.large.depthMm, 5);
    expect(p!.options.map((o) => o.id)).toContain("smallerTsuchime");
  });

  it("腕がもう薄すぎるときは、腕の厚みの確かめだけが知らせる（同じことを 2 回言わない）", () => {
    const ring = buildRing(params({ shank: { gou: 11, widthMm: 2.2, thicknessMm: 1.0 }, finish: { tsuchime: { size: "small", area: "outer" } } }));
    const checks = checkRing(ring).map((p) => p.check);
    expect(checks).toContain("band-thin");
    expect(checks).not.toContain("tsuchime-thin");
  });

  it("細い腕の両縁には、ミルの粒が収まらない", () => {
    const ok = buildRing(params({ finish: { milgrain: "edges" } }));
    expect(checkRing(ok).some((p) => p.check === "milgrain-fit")).toBe(false);
    const thin = buildRing(params({ shank: { gou: 11, widthMm: 1.2, thicknessMm: 1.6 }, finish: { milgrain: "edges" } }));
    const p = checkRing(thin).find((x) => x.check === "milgrain-fit");
    expect(p).toBeDefined();
    expect(p!.requiredValue).toBeCloseTo(GUIDES.finish.milgrain.beadMm * GUIDES.finish.milgrain.rowsPerBeadWidth, 9);
  });

  it("仕上げがなければ、確かめも形も変わらない", () => {
    const a = buildRing(params());
    expect(a.milgrain).toBeUndefined();
    expect(checkRing(a).some((p) => p.check === "tsuchime-thin" || p.check === "milgrain-fit")).toBe(false);
  });
});

describe("色金（煮色）の地金", () => {
  it("重さは色金ごとの密度で出す（銅は資料の 8.96、赤銅・四分一は仮）", () => {
    const k18 = buildRing(params());
    const cu = buildRing(params({ shank: { gou: 11, widthMm: 2.2, thicknessMm: 1.6, metal: metalIdOf("copper") } }));
    const sb = buildRing(params({ shank: { gou: 11, widthMm: 2.2, thicknessMm: 1.6, metal: metalIdOf("shibuichi") } }));
    expect(cu.metal).toBe("copper");
    expect(GUIDES.metals.copper.densityGPerCm3).toBe(8.96);
    expect(cu.metalWeightG / k18.metalWeightG).toBeCloseTo(8.96 / GUIDES.metals.k18y.densityGPerCm3, 6);
    expect(sb.metalWeightG).toBeGreaterThan(cu.metalWeightG);
    expect(metalIdOf("shakudo")).toBe("shakudo");
  });
});

describe("Claude の道具：set_shank の地金と仕上げ", () => {
  const base = { reason: "槌目で、四分一の煮色に" };
  it("「槌目で、四分一の煮色に」の入力が通る", () => {
    expect(parseToolCall("set_shank", { ...base, metal: "shibuichi", finish: { tsuchime: "medium" } }).ok).toBe(true);
    expect(parseToolCall("set_shank", { ...base, finish: { tsuchime: "large", tsuchime_area: "all", milgrain: "edges", inlay: "nunome" } }).ok).toBe(true);
    expect(parseToolCall("set_shank", { ...base, metal: "shakudo" }).ok).toBe(true);
  });

  it("知らない項目・選べない値・空の仕上げは断る", () => {
    expect(parseToolCall("set_shank", { ...base, finish: { tsuchime: "huge" } }).ok).toBe(false);
    expect(parseToolCall("set_shank", { ...base, finish: { hammer: "small" } }).ok).toBe(false);
    expect(parseToolCall("set_shank", { ...base, finish: {} }).ok).toBe(false);
    expect(parseToolCall("set_shank", { ...base, finish: "tsuchime" }).ok).toBe(false);
    expect(parseToolCall("set_shank", { ...base, metal: "iron" }).ok).toBe(false);
  });

  it("前の入力（仕上げなし）は、そのまま通る", () => {
    expect(parseToolCall("set_shank", { ...base, metal: "k18yg", width_mm: 2.5 }).ok).toBe(true);
  });

  it("書いた項目だけ変わり、none でなくなる", () => {
    const a = finishFrom({ tsuchime: "medium" }, undefined);
    expect(a).toEqual({ tsuchime: { size: "medium", area: "outer" } });
    const b = finishFrom({ milgrain: "edges", tsuchime_area: "all" }, a);
    expect(b).toEqual({ tsuchime: { size: "medium", area: "all" }, milgrain: "edges" });
    expect(finishFrom({ tsuchime: "none", milgrain: "none" }, b)).toBeUndefined();
    expect(smallerTsuchime(b)).toBe("small");
    expect(smallerTsuchime({ tsuchime: { size: "small", area: "outer" } })).toBe("none");
  });

  it("作業の記録の言葉は、英字の名前を見せない", () => {
    const line = toolLogLine({ tool: "set_shank", input: { ...base, metal: "shibuichi", finish: { tsuchime: "medium", milgrain: "edges" } }, ok: true });
    expect(line.text).toContain("四分一");
    expect(line.text).toContain("槌目 中");
    expect(line.text).toContain("ミル打ち");
    expect(line.text).not.toMatch(/shibuichi|tsuchime|medium|milgrain/);
  });
});

describe("作り方：伝統の仕上げの工程", () => {
  const stone = triangleStone();
  const input = (ring: ReturnType<typeof buildRing>, irogane?: "shakudo" | "shibuichi" | "copper") => ({
    ring,
    outlineMm: stone.outlineMm,
    longMm: stone.longMm,
    widthMm: stone.widthMm,
    depthMm: stone.depthMm,
    metalLabel: irogane ? "四分一（煮色）" : "K18 イエロー",
    alloy: irogane ? null : ("k18y" as const),
    irogane,
  });
  const ring = buildRing(params({ shank: { gou: 11, widthMm: 2.2, thicknessMm: 1.6, metal: "shibuichi" }, finish: { tsuchime: { size: "medium", area: "outer" }, milgrain: "edges" } }));

  it("色金は鋳造の工程を出さず、板と線から作る", () => {
    const ids = howToMake(input(ring, "shibuichi"), "cast").map((s) => s.id);
    expect(ids).not.toContain("invest");
    expect(ids).not.toContain("pour");
    expect(ids).toContain("material");
  });

  it("煮色は 脱脂 → 大根おろし → 煮色 の順で、石を留める前", () => {
    const ids = howToMake(input(ring, "shibuichi"), "hand").map((s) => s.id);
    const at = (id: string) => ids.indexOf(id);
    expect(at("degrease")).toBeGreaterThan(0);
    expect(at("degrease")).toBeLessThan(at("daikon"));
    expect(at("daikon")).toBeLessThan(at("niiro"));
    expect(at("niiro")).toBeLessThan(at("prong"));
    // 槌目は腕を丸めたあと、ミルはみがきの前
    expect(at("tsuchime")).toBeGreaterThan(at("true"));
    expect(at("milgrain")).toBeLessThan(at("finish"));
  });

  it("煮色の工程の数字は、技の作り方の資料のまま", () => {
    const st = howToMake(input(ring, "shibuichi"), "hand");
    expect(st.find((s) => s.id === "daikon")!.text).toContain("10 分");
    expect(st.find((s) => s.id === "niiro")!.specs.map((x) => x.value).join()).toContain("90 ℃で 60 分");
    expect(st.find((s) => s.id === "niiro")!.specs[0].value).toContain("銀灰");
  });

  it("仕上げのない K18 の指輪の作り方は、前と同じ", () => {
    const ids = howToMake(input(buildRing(params())), "cast").map((s) => s.id);
    expect(ids).not.toContain("tsuchime");
    expect(ids).not.toContain("niiro");
    expect(ids).toContain("invest");
  });
});
