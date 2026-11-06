// テンションの「刺さり」と「入れ方」と「地金ごとの計算」を、本物の網目で確かめる（作者の声 2026-11-05「腕に刺さってるか、指の側に出てる」）。
import { describe, expect, it } from "vitest";
import realTriangle from "./fixtures/real-triangle-outline.json";
import { parseToolCall } from "../src/claude/tools";
import { measureOutline } from "../src/geometry/measure";
import { buildRing, type RingParams } from "../src/geometry/ring";
import type { StoneParams } from "../src/geometry/stone";
import { findCorners } from "../src/geometry/corners";
import { tensionGrips, type TensionGrip } from "../src/geometry/tension";
import { checkRing, tensionInsert } from "../src/rules/checks";
import { GUIDES } from "../src/rules/guides";
import { seedLedger, type Ledger } from "../src/rules/ledger";
import { SPRING_METALS, curvedWireFactor, springIdOf, tensionCautions, tensionSpring } from "../src/rules/tension-calc";
import { howToMake } from "../src/studio/howto";
import { PRESETS, presetOutline } from "../src/studio/presets";
import { DEFAULT_STATE, RingSession, nextGrip } from "../src/studio/session";
import { probe, surfaceSamples, topology } from "./helpers/solid-probe";

const phi4 = { metal: "k18y" as const, section: "maru" as const, widthMm: 4, thicknessMm: 4 };
const preset = (id: string, k = 1, depthK = 1): StoneParams => {
  const p = PRESETS.find((x) => x.id === id)!;
  return { outlineMm: presetOutline(p).map((q) => ({ x: q.x * k, y: q.y * k })), longMm: p.longMm * k, widthMm: p.widthMm * k, depthMm: p.depthMm * k * depthK };
};
/** 写真から読んだ既定の三角（8.88 × 4.24 mm） */
const tri = (): StoneParams => {
  const m = measureOutline({ outlinePx: realTriangle as { x: number; y: number }[], longMm: 8.88 });
  return { outlineMm: m.outlineMm, longMm: m.longMm, widthMm: m.widthMm, depthMm: 4.24 };
};
const ringOf = (stone: StoneParams, gou = 11, extra: Partial<RingParams> = {}) => buildRing({ stone, setting: { style: "tension", culetGapMm: GUIDES.tension.culetGapMm }, shank: { gou, ...phi4 }, ...extra });

/** 網目の細かさで出る差（mm）。三角形で丸みを近づけているので、これより浅い食いこみは形の誤りではない */
const MESH_TOLERANCE_MM = 0.01;

/** 石の面の点が地金に入る深さの最大と、石と地金のいちばん近い所（腕の幅の中の、端の面の近くだけ見る） */
function fit(ring: ReturnType<typeof buildRing>, step = 0.08) {
  const info = ring.setting.tension!;
  const pm = probe(ring.ringPositions.shank);
  let depth = 0;
  let clear = Infinity;
  let n = 0;
  surfaceSamples(ring.ringPositions.stone, step, (x, y, z) => {
    if (Math.abs(y) < info.gapMm / 2 - 0.1) return;
    if (pm.inside(x, y, z)) {
      depth = Math.max(depth, pm.distance(x, y, z, 0.7));
      return;
    }
    if (Math.abs(x) > ring.shank.widthMm / 2 + 0.2 || n++ % 9 !== 0) return;
    clear = Math.min(clear, pm.distance(x, y, z, 0.3));
  });
  return { depth, clear };
}

describe("石は地金に刺さっていない（網目で測る）", () => {
  it.each(["round", "oval", "princess", "emerald", "pear", "marquise"])("%s：11 号と 16 号で、石と地金は重ならず、すき間が残る", (id) => {
    for (const gou of [11, 16]) {
      const r = ringOf(preset(id), gou);
      const f = fit(r);
      expect(f.depth).toBeLessThan(MESH_TOLERANCE_MM);
      expect(f.clear).toBeGreaterThan(0.02);
      expect(f.clear).toBeLessThan(0.1);
      expect(topology(r.ringPositions.shank)).toMatchObject({ open: 0, flipped: 0, shells: 1, degenerate: 0 });
    }
  }, 120000);

  it("既定の三角（写真から読んだ石）も同じ。深さは戻りきらない分を見込んだおすすめ（K18・11 号でくぼみ 0.65 mm・溝 0.6 mm。仮）・石の先と指 0.5 mm・縁は腕の 7 割", () => {
    const r = ringOf(tri());
    const i = r.setting.tension!;
    const f = fit(r);
    expect(f.depth).toBeLessThan(MESH_TOLERANCE_MM);
    expect(f.clear).toBeGreaterThan(0.02);
    expect(i.ends.map((e) => [e.kind, e.depthMm])).toEqual([["pit", 0.65], ["groove", 0.6]]);
    expect(r.culetGapMm).toBeCloseTo(0.5, 6);
    expect(GUIDES.tension.girdleAtWire).toBe(0.7);
    expect(checkRing(r)).toEqual([]);
  }, 120000);

  it("浅くて大きい石でも刺さらない（石の上側が腕の線より緩いと、奥の地金に石が入っていた）", () => {
    for (const [stone, gou, wire] of [
      [{ ...tri(), outlineMm: tri().outlineMm.map((q) => ({ x: q.x * 1.4, y: q.y * 1.4 })), longMm: 8.88 * 1.4, widthMm: tri().widthMm * 1.4, depthMm: 4.24 * 1.4 * 0.6 }, 5, 3],
      [preset("pear", 1.4, 0.6), 16, 5],
      [preset("pear", 1.8, 1), 5, 4],
    ] as [StoneParams, number, number][]) {
      const r = buildRing({ stone, setting: { style: "tension", culetGapMm: 0.5 }, shank: { gou, metal: "k18y", section: "maru", widthMm: wire, thicknessMm: wire } });
      expect(fit(r).depth).toBeLessThan(MESH_TOLERANCE_MM);
      expect(topology(r.ringPositions.shank)).toMatchObject({ open: 0, shells: 1, degenerate: 0 });
    }
  }, 120000);

  it("石の先は指の円より上（どの形も 0.5 mm 以上。網目で測る）", () => {
    for (const stone of [tri(), ...PRESETS.map((p) => preset(p.id))])
      for (const gou of [11, 16]) {
        const r = ringOf(stone, gou);
        let min = Infinity;
        surfaceSamples(r.ringPositions.stone, 0.2, (_x, y, z) => (min = Math.min(min, Math.hypot(y, z) - r.shank.innerRadiusMm)));
        expect(min).toBeGreaterThanOrEqual(GUIDES.tension.culetGapMm - 1e-3);
      }
  }, 120000);
});

describe("石の先と指のすき間は、どの形も 0.5 mm（三角だけではない）", () => {
  const empty = seedLedger() as Ledger;
  const session = (stone: StoneParams, gou: number) => {
    const s = new RingSession(stone, () => empty, () => undefined, () => "");
    s.state = { ...DEFAULT_STATE, gou };
    s.setSetting({ style: "tension", reason: "挟む" });
    return s;
  };

  it.each([11, 16])("%s 号：画面の設計の場で組んでも 0.5 mm 以上", (gou) => {
    for (const stone of [tri(), ...PRESETS.map((p) => preset(p.id))]) {
      const s = session(stone, gou);
      expect(s.built!.ring.culetGapMm).toBeGreaterThanOrEqual(0.5 - 1e-9);
      expect(s.built!.problems.filter((p) => p.check === "finger-gap")).toEqual([]);
    }
  }, 120000);

  it("0.5 mm より近いと「作れない」と言う（前の公開の版は 0.30 mm で「作れます」と出ていた）", () => {
    const r = ringOf(preset("round"), 16, { setting: { style: "tension", culetGapMm: 0.3 }, tension: { culetGapMm: 0.3 } });
    expect(r.culetGapMm).toBeCloseTo(0.3, 6);
    expect(checkRing(r).find((p) => p.check === "finger-gap")?.requiredValue).toBe(0.5);
  });
});

describe("確かめのルールが、刺さった形を必ず見つける", () => {
  // 作者の絵と同じ値：石の縁は腕の真ん中、くぼみ 1 mm、石の先と指 0.3 mm。絵に出ていた数字も同じになる
  const pictured = (stone: StoneParams, gou: number) => ringOf(stone, gou, { setting: { style: "tension", culetGapMm: 0.3 }, tension: { culetGapMm: 0.3, cornerPitMm: 1, girdleAtWire: 0.5 } });
  const topAbove = (r: ReturnType<typeof pictured>) => r.setting.tension!.ends[0].wireTopZ - r.shank.innerRadiusMm;

  it("ラウンド 6.5 mm・16 号（作者の絵）：石の先が腕の内側より 0.64 mm 指の側へ、上面が腕の上より 0.85 mm 低い", () => {
    const r = pictured(preset("round"), 16);
    expect(topAbove(r)).toBeCloseTo(5.05, 1);
    expect(r.setting.tension!.culetBelowArmMm).toBeCloseTo(0.64, 1);
    expect(r.setting.tension!.tableBelowArmMm).toBeCloseTo(0.85, 1);
    const checks = checkRing(r).map((p) => p.check);
    expect(checks).toContain("finger-gap");
    expect(checks).toContain("tension-culet");
    expect(checks).toContain("tension-sunk");
  });

  it("マーキス 10 mm・エメラルド 8 mm・三角（作者の絵）も、もう「作れます」と言わない", () => {
    for (const [stone, gou, height] of [
      [preset("marquise"), 16, 4.54],
      [preset("emerald"), 16, 5.11],
      [tri(), 14, 5.29],
    ] as [StoneParams, number, number][]) {
      const r = pictured(stone, gou);
      expect(topAbove(r)).toBeCloseTo(height, 1);
      expect(checkRing(r).map((p) => p.check)).toContain("tension-sunk");
    }
  });

  it("今の決まりでは、同じ石が腕の中に収まる（石の先は腕の内側より上、上面は腕の上とそろう）", () => {
    for (const id of ["round", "marquise", "emerald"]) {
      const i = ringOf(preset(id), 16).setting.tension!;
      expect(i.culetBelowArmMm).toBeLessThan(0);
      expect(i.tableBelowArmMm).toBeLessThan(GUIDES.tension.maxTableBelowArmMm);
    }
  });

  it("深い石は「石の先が指の側へ出る」と言い、直し方は腕を太くする。太くすれば消える", () => {
    const deep = preset("round", 1, 1.4); // 深さ 5.46 mm を φ4 に
    const p = checkRing(ringOf(deep)).find((x) => x.check === "tension-culet")!;
    expect(p.options[0].id).toBe("thickerWire");
    const thick = buildRing({ stone: deep, setting: { style: "tension", culetGapMm: 0.5 }, shank: { gou: 11, metal: "k18y", section: "maru", widthMm: 5, thicknessMm: 5 } });
    expect(thick.setting.tension!.culetBelowArmMm).toBeLessThan(ringOf(deep).setting.tension!.culetBelowArmMm);
  });

  it("線の太さの上限まで来たら、太くする直し方は出さない", () => {
    const deep = preset("round", 1.4, 1.2);
    const r = buildRing({ stone: deep, setting: { style: "tension", culetGapMm: 0.5 }, shank: { gou: 11, metal: "k18y", section: "maru", widthMm: 5, thicknessMm: 5 } });
    const p = checkRing(r).find((x) => x.check === "tension-culet")!;
    expect(p.options.map((o) => o.id)).not.toContain("thickerWire");
  });

  it("小さい石を太い線に：石が腕に沈むと言い、直し方は腕を細くする", () => {
    const small = preset("round", 3.2 / 6.5);
    const p = checkRing(ringOf(small)).find((x) => x.check === "tension-sunk")!;
    expect(p.options[0].id).toBe("thinnerWire");
  });

  it("既定の三角は、どの号でも「作れない」が出ない", () => {
    for (const gou of [5, 9, 11, 13, 16, 20, 25]) expect(checkRing(ringOf(tri(), gou)).map((p) => p.check)).toEqual([]);
  });

  it("腕の幅の外へ大きくはみ出す形：作者の三角より大きいと職人に確かめる。挟まる所が 3 分の 1 より短いと作れない", () => {
    const m10 = ringOf(preset("marquise"));
    expect(checkRing(m10).map((p) => p.check)).toEqual([]);
    const spring = tensionSpring(m10.setting, m10.shank)!;
    expect(tensionCautions(m10.setting, spring, "k18y").map((c) => c.id)).toContain("overhang");
    const triRing = ringOf(tri());
    expect(tensionCautions(triRing.setting, tensionSpring(triRing.setting, triRing.shank), "k18y").map((c) => c.id)).toEqual([]);
    const big = ringOf(preset("marquise", 1.3));
    const p = checkRing(big).find((x) => x.check === "tension-overhang")!;
    expect(p.options[0].id).toBe("turnGrip");
    expect(checkRing(ringOf(preset("marquise", 1.3), 11, { tension: { grip: "corner" } })).map((x) => x.check)).not.toContain("tension-overhang");
  });
});

describe("挟む向きを選べる", () => {
  it("石の形ごとの選べる向き", () => {
    // 三角：長い辺を溝に・短い辺を溝に（作者が実際に作った指輪の向き。2026-11-07）・長い辺の両はしの角
    expect(tensionGrips(tri())).toEqual(["short", "side", "corner"]);
    expect(tensionGrips(preset("round"))).toEqual(["short"]);
    expect(tensionGrips(preset("pear"))).toEqual(["short"]);
    expect(tensionGrips(preset("oval"))).toEqual(["short", "long"]);
    expect(tensionGrips(preset("emerald"))).toEqual(["short", "long"]);
    expect(tensionGrips(preset("princess"))).toEqual(["short", "corner"]);
    expect(tensionGrips(preset("marquise"))).toEqual(["short", "corner"]);
  });

  // 石の長さ（腕の周りの向き）。開き ＝ 石の長さ − 両はしの深さ（深さの既定は、戻りきらない分を見込んだおすすめ。仮）
  it.each([
    ["marquise", "corner", 10, ["pit", "pit"]],
    ["princess", "corner", 5.5 * Math.SQRT2, ["pit", "pit"]],
    ["emerald", "long", 8, ["groove", "groove"]],
    ["oval", "long", 8, ["groove", "groove"]],
  ] as [string, TensionGrip, number, string[]][])("%s の %s：開きが変わり、閉じた形で、石は地金に入らない", (id, grip, span, kinds) => {
    // 形の確かめは前の深さ（くぼみ 0.8・溝 0.5）で。既定のおすすめの深さ（マーキスの角 0.6 など）では、網目で測るすき間が 0.015 mm ほどまで狭まる所がある（食いこみはない）
    const r = ringOf(preset(id), 11, { tension: { grip, cornerPitMm: 0.8, edgeGrooveMm: 0.5 } });
    const i = r.setting.tension!;
    expect(i.grip).toBe(grip);
    expect(i.spanMm).toBeCloseTo(span, 1);
    expect(i.gapMm).toBeCloseTo(i.spanMm - i.ends[0].depthMm - i.ends[1].depthMm, 6);
    expect(i.ends.map((e) => e.kind)).toEqual(kinds);
    expect(topology(r.ringPositions.shank)).toMatchObject({ open: 0, flipped: 0, shells: 1, degenerate: 0 });
    const f = fit(r);
    expect(f.depth).toBeLessThan(MESH_TOLERANCE_MM);
    expect(f.clear).toBeGreaterThan(0.02);
    expect(r.culetGapMm).toBeGreaterThanOrEqual(0.5 - 1e-9);
  }, 120000);

  it("三角の長い辺の両はしの角を挟む：両方くぼみ、開きは長い辺 − 両はしの深さ。深さの既定は角のくぼみの値。浅くすれば閉じた形で石は地金に入らない。はみ出しは作れないにせず、職人に聞く", () => {
    const sv14 = { shank: { gou: 14, ...phi4, metal: "sv925" as const } };
    // 前の角のくぼみの値 0.8 mm ずつ（この向きの職人の値はない）なら、開きは長い辺 − 1.6 mm。とがった角（約 60°）のくぼみは幅が広く、片方は腕の幅に収まらない（作れない、と言う）
    const deep = ringOf(tri(), 14, { tension: { grip: "corner", cornerPitMm: 0.8 }, ...sv14 }).setting.tension!;
    expect(deep.mode).toBe("corner-corner");
    expect(deep.ends.map((e) => [e.kind, e.depthMm])).toEqual([["pit", 0.8], ["pit", 0.8]]);
    expect(deep.spanMm).toBeGreaterThan(8.7);
    expect(deep.gapMm).toBeCloseTo(deep.spanMm - 1.6, 6);
    expect(checkRing(ringOf(tri(), 14, { tension: { grip: "corner", cornerPitMm: 0.8 }, ...sv14 })).map((x) => x.check)).toContain("tension-pit");
    // 既定は、戻りきらない分を見込んだおすすめ（SV925・14 号で 0.6 mm ずつ。仮）
    expect(ringOf(tri(), 14, { tension: { grip: "corner" }, ...sv14 }).setting.tension!.ends.map((e) => e.depthMm)).toEqual([0.6, 0.6]);
    // 0.5 mm ずつにすると、くぼみは収まる。残りの角は腕の幅より大きく出るが、作れないにせず、職人に聞く
    const r = ringOf(tri(), 14, { tension: { grip: "corner", cornerPitMm: 0.5 }, ...sv14 });
    const i = r.setting.tension!;
    expect(i.ends.map((e) => [e.kind, e.depthMm])).toEqual([["pit", 0.5], ["pit", 0.5]]);
    expect(i.overhangRatio).toBeGreaterThan(GUIDES.tension.maxOverhangRatio);
    expect(checkRing(r)).toEqual([]);
    const caution = tensionCautions(r.setting, tensionSpring(r.setting, r.shank), "sv925").find((c) => c.id === "long-triangle")!;
    expect(caution.text).not.toContain("作者");
    expect(topology(r.ringPositions.shank)).toMatchObject({ open: 0, flipped: 0, shells: 1, degenerate: 0 });
    const f = fit(r);
    expect(f.depth).toBeLessThan(MESH_TOLERANCE_MM);
    expect(f.clear).toBeGreaterThan(0.02);
    // 狭い幅を挟む向きは、前のまま
    expect(ringOf(tri(), 14, { tension: { grip: "short" } }).setting.tension!.mode).toBe("corner-edge");
  }, 120000);

  it("三角の短い辺を溝に・反対の角をくぼみに（作者が実際に作った指輪）：角のくぼみ 0.4 mm・辺の溝 0.3 mm。角から辺までの長い所を挟み、閉じた形で石は地金に入らない", () => {
    const stone = tri();
    const sv14 = { shank: { gou: 14, ...phi4, metal: "sv925" as const } };
    expect(GUIDES.tension.shortSidePitMm).toBe(0.4);
    expect(GUIDES.tension.shortSideGrooveMm).toBe(0.3);
    const r = ringOf(stone, 14, { tension: { grip: "side" }, ...sv14 });
    const i = r.setting.tension!;
    expect(i.grip).toBe("side");
    expect(i.mode).toBe("corner-edge");
    expect(i.ends.map((e) => [e.kind, e.depthMm])).toEqual([["pit", 0.4], ["groove", 0.3]]);
    expect(i.ends[1].straight).toBe(true);
    // 写真の輪郭の角：いちばん短い辺の反対の角が +y（くぼみ）に来る。その角は、いちばん長い辺の片はし
    const cs = findCorners(stone.outlineMm).map((c) => c.point);
    const len = (a: number, b: number) => Math.hypot(cs[a].x - cs[b].x, cs[a].y - cs[b].y);
    const opp = [0, 1, 2].map((k) => len((k + 1) % 3, (k + 2) % 3));
    const lone = opp.indexOf(Math.min(...opp));
    const longest = opp.indexOf(Math.max(...opp));
    expect(lone).not.toBe(longest);
    const turn = (q: { x: number; y: number }) => q.x * Math.sin(i.rotationZ) + q.y * Math.cos(i.rotationZ);
    expect(cs.map(turn).indexOf(Math.max(...cs.map(turn)))).toBe(lone);
    // 短い辺は x に沿う（写真の輪郭の辺は反るので、角を結ぶ線から 5° まで回して、溝はまっすぐ）
    const [p, q] = [cs[(lone + 1) % 3], cs[(lone + 2) % 3]];
    expect(Math.abs(turn(p) - turn(q)) / Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThan(Math.sin((5 * Math.PI) / 180));
    expect(Math.abs(turn(p) - turn(q))).toBeGreaterThan(0.05);
    // 挟む長さは、狭い幅を挟む向き（いちばん長い辺を溝に）より長い。腕の幅の外へ出る所は小さい
    const short = ringOf(stone, 14, { tension: { grip: "short" }, ...sv14 }).setting.tension!;
    expect(i.spanMm).toBeGreaterThan(short.spanMm + 0.5);
    expect(i.gapMm).toBeCloseTo(i.spanMm - 0.7, 6);
    expect(i.overhangMm).toBeLessThan(short.overhangMm);
    expect(checkRing(r)).toEqual([]);
    expect(topology(r.ringPositions.shank)).toMatchObject({ open: 0, flipped: 0, shells: 1, degenerate: 0 });
    const f = fit(r);
    expect(f.depth).toBeLessThan(MESH_TOLERANCE_MM);
    expect(f.clear).toBeGreaterThan(0.02);
    // 深さを渡せば、その深さ（長い辺を溝に入れるときの既定は、おすすめの 0.65・0.6。仮）
    expect(ringOf(stone, 14, { tension: { grip: "side", cornerPitMm: 0.3, edgeGrooveMm: 0.3 }, ...sv14 }).setting.tension!.ends.map((e) => e.depthMm)).toEqual([0.3, 0.3]);
    expect(short.ends.map((e) => e.depthMm)).toEqual([0.65, 0.6]);
  }, 120000);

  it("選べない向きを渡しても、壊れない（既定の向きになる）", () => {
    expect(ringOf(preset("round"), 11, { tension: { grip: "corner" } }).setting.tension!.grip).toBe("short");
    expect(ringOf(tri(), 11, { tension: { grip: "long" } }).setting.tension!.mode).toBe("corner-edge");
    // 短い辺を溝に入れる向きは三角だけ
    expect(ringOf(preset("marquise"), 11, { tension: { grip: "side" } }).setting.tension!.grip).toBe("short");
    expect(ringOf(preset("pear"), 11, { tension: { grip: "side" } }).setting.tension!.grip).toBe("short");
  });

  it("道具で変えられる。設計の場の確かめに、選べる向きが出る。直し方の行き先は角のくぼみが先", () => {
    expect(parseToolCall("set_setting", { tension_grip: "corner", reason: "向き" }).ok).toBe(true);
    expect(parseToolCall("set_setting", { tension_grip: "side", reason: "向き" }).ok).toBe(true);
    expect(parseToolCall("set_setting", { tension_grip: "ななめ", reason: "向き" }).ok).toBe(false);
    const s = new RingSession(preset("marquise"), () => seedLedger() as Ledger, () => undefined, () => "");
    s.state = { ...DEFAULT_STATE };
    const res = s.setSetting({ style: "tension", tension_grip: "corner", reason: "向き" });
    expect(res.setting.tension!.grip).toBe("corner");
    expect(res.setting.tension!.grips).toEqual(["short", "corner"]);
    expect(s.built!.ring.setting.tension!.mode).toBe("corner-corner");
    expect(nextGrip(ringOf(preset("marquise")).setting.tension)).toBe("corner");
    expect(nextGrip(ringOf(preset("emerald")).setting.tension)).toBe("long");
    // 三角は、作者が実際に作った指輪の向き（短い辺を溝に）が先
    expect(nextGrip(ringOf(tri()).setting.tension)).toBe("side");
  });
});

describe("石の入れ方（形から決まる動き）", () => {
  /** 石を x の向きへ dx ずらした所で、地金に入る点の数（横から滑らせられるかを、網目で確かめる） */
  function slideHits(ring: ReturnType<typeof buildRing>, dx: number): number {
    const pm = probe(ring.ringPositions.shank);
    const gap = ring.setting.tension!.gapMm;
    let n = 0;
    surfaceSamples(ring.ringPositions.stone, 0.15, (x, y, z) => {
      if (Math.abs(y) >= gap / 2 - 0.1 && pm.inside(x + dx, y, z)) n++;
    });
    return n;
  }

  it("両はしともまっすぐな溝（スクエア・エメラルド）は、網目の上でも横から滑り込む", () => {
    for (const id of ["princess", "emerald"]) {
      const r = ringOf(preset(id));
      expect(r.setting.tension!.slides).toBe(true);
      expect(tensionInsert(r.setting.tension!).kind).toBe("slide-or-open");
      for (const dx of [0.3, 0.8, 1.6, 3, 6]) expect(slideHits(r, dx)).toBe(0);
    }
  }, 120000);

  it("くぼみと丸みに沿う溝は、横から入らない（腕を開いて入れる）", () => {
    const cases: [StoneParams, string][] = [
      [tri(), "corner-first"],
      [preset("round"), "open"],
      [preset("oval"), "open"],
      [preset("pear"), "corner-first"],
    ];
    for (const [stone, kind] of cases) {
      const r = ringOf(stone);
      expect(r.setting.tension!.slides).toBe(false);
      expect(tensionInsert(r.setting.tension!).kind).toBe(kind);
      expect(slideHits(r, 1)).toBeGreaterThan(0);
    }
  }, 120000);

  it("向きを変えると入れ方も変わる。スクエアを角で挟むと、横にずれない", () => {
    const i = ringOf(preset("princess"), 11, { tension: { grip: "corner" } }).setting.tension!;
    expect(i.slides).toBe(false);
    expect(tensionInsert(i).kind).toBe("corners");
    expect(tensionInsert(i).noStop).toBe(false);
  });

  it("言葉：作者の考えは「考え」と書く。どの形も短い文がある", () => {
    const square = tensionInsert(ringOf(preset("princess")).setting.tension!);
    expect(square.noStop).toBe(true);
    expect(square.how).toContain("横から溝に滑らせ");
    expect(square.hold).toContain("作者の考え");
    expect(square.hold).toContain("試していません");
    const triangle = tensionInsert(ringOf(tri()).setting.tension!);
    expect(triangle.how).toContain("角を先にくぼみへ");
    expect(triangle.noStop).toBe(false);
  });

  it("横に止める物がない形は、確かめに注意を出す（緑の「作れます」にしない）", () => {
    for (const id of ["princess", "emerald"]) {
      const r = ringOf(preset(id));
      expect(checkRing(r)).toEqual([]);
      expect(tensionCautions(r.setting, tensionSpring(r.setting, r.shank), "k18y").map((c) => c.id)).toContain("no-stop");
    }
    const round = ringOf(preset("round"));
    expect(tensionCautions(round.setting, tensionSpring(round.setting, round.shank), "k18y")).toEqual([]);
  });
});

describe("地金ごとの計算（どれだけ小さめに作り、どれだけ広げて入れるか）", () => {
  // 地金ごとの計算は、前の深さ（くぼみ 0.8・溝 0.5 mm。和 1.3 mm）で確かめる（深さの既定は、2026-11-07 からおすすめ）
  const triRing = () => ringOf(tri(), 11, { tension: { cornerPitMm: 0.8, edgeGrooveMm: 0.5 } });
  const row = (t: NonNullable<ReturnType<typeof tensionSpring>>, m: string) => t.rows.find((r) => r.metal === m)!;

  it("太い輪の割合：ばねの手引きの式（C ＝ 輪の径 ÷ 線の太さ）", () => {
    const k = curvedWireFactor(10.17, 4);
    const c = (2 * 10.17) / 4;
    expect(k).toBeCloseTo((4 * c * c - c - 1) / (4 * c * (c - 1)), 9);
    expect(k).toBeCloseTo(1.17, 2);
    expect(curvedWireFactor(100, 1)).toBeLessThan(1.01);
  });

  it("既定の三角・φ4・11 号・硬い状態：K18 は余裕あり、シルバーはぎりぎり、Pt900 は足りない", () => {
    const r = triRing();
    const t = tensionSpring(r.setting, r.shank)!;
    expect(t.rows.map((x) => x.metal)).toEqual(SPRING_METALS);
    expect(t.needMm).toBeCloseTo(1.3, 9);
    expect(t.spanMm).toBeCloseTo(r.setting.tension!.gapMm + 1.3, 6);
    const k = row(t, "k18y");
    expect(k.limitMm).toBeCloseTo(1.94, 2);
    expect(k.safeMm).toBeCloseTo(1.94 / 1.172, 1);
    expect(k.verdict).toBe("room");
    expect(k.shrinkMm).toBeCloseTo(k.safeMm - 1.3, 9);
    expect(k.shrinkMaxMm).toBeCloseTo(k.limitMm - 1.3, 9);
    // 作る時の開き ＋ 広げて入れる量 ＝ 石が通る寸法
    expect(k.makeGapMm! + k.spreadMm!).toBeCloseTo(t.spanMm, 6);
    // 石を押さえる量は、縮めた量から、広げたあと戻りきらない分（安全な限界まで広げると、広げた分の springSetRatio。仮）を引いた量
    expect(k.setMm).toBeCloseTo(GUIDES.tension.springSetRatio * k.spreadMm!, 6);
    expect(k.gripMm).toBeCloseTo(k.shrinkMm! - k.setMm!, 9);
    expect(k.bentMm).toBe(0);
    const sv = row(t, "sv925");
    expect(sv.limitMm).toBeCloseTo(1.42, 2);
    expect(sv.verdict).toBe("tight");
    expect(sv.shrinkMm).toBeCloseTo(1.42 - 1.3, 1);
    const pt = row(t, "pt900");
    expect(pt.limitMm).toBeCloseTo(0.7, 2);
    expect(pt.verdict).toBe("short");
    expect(pt.shrinkMm).toBeNull();
    expect(pt.makeGapMm).toBeNull();
    expect(pt.bentMm).toBeCloseTo(1.3 - pt.limitMm, 9);
  });

  it("やわらかい状態（焼きなまし）は、どの地金も足りない（硬い状態でないと取れる）", () => {
    const r = triRing();
    const t = tensionSpring(r.setting, r.shank, "annealed")!;
    expect(t.stateLabel).toBe("焼きなまし");
    expect(t.rows.every((x) => x.verdict === "short")).toBe(true);
  });

  it("K18 は色ごとに値がある。仮の値は仮と分かる", () => {
    const r = triRing();
    const t = tensionSpring(r.setting, r.shank)!;
    expect(row(t, "k18p").young.gpa).toBe(94);
    expect(row(t, "k18w").young.gpa).toBe(110);
    expect(row(t, "k18w").young.provisional).toBe(true);
    expect(row(t, "k18p").limitMm).toBeGreaterThan(row(t, "k18y").limitMm);
    expect(t.rows.every((x) => x.provisional)).toBe(true);
    expect(springIdOf("k18yg")).toBe("k18y");
    expect(springIdOf("k18pg")).toBe("k18p");
    expect(springIdOf("k18wg")).toBe("k18w");
    expect(springIdOf("pt900")).toBe("pt900");
    expect(springIdOf("sv925")).toBe("sv925");
  });

  it("横から滑らせられる石は、開くのが締まりの分だけ：Pt900 でも小さめに作れる量が出る", () => {
    const r = ringOf(preset("princess"));
    const t = tensionSpring(r.setting, r.shank)!;
    expect(t.slides).toBe(true);
    const pt = row(t, "pt900");
    expect(pt.verdict).toBe("short");
    expect(pt.slideShrinkMm).toBeCloseTo(pt.safeMm, 9);
    expect(row(t, "k18y").slideShrinkMm!).toBeGreaterThan(row(t, "k18y").shrinkMm!);
    const triT = tensionSpring(triRing().setting, triRing().shank)!;
    expect(row(triT, "k18y").slideShrinkMm).toBeNull();
  });

  it("今の地金で足りないとき・ぎりぎりのときは注意を出す。余裕があれば出さない", () => {
    const r = triRing();
    const t = tensionSpring(r.setting, r.shank)!;
    expect(tensionCautions(r.setting, t, "k18y")).toEqual([]);
    expect(tensionCautions(r.setting, t, "sv925").map((c) => c.id)).toEqual(["open-tight"]);
    expect(tensionCautions(r.setting, t, "pt900").map((c) => c.id)).toEqual(["open-short"]);
  });

  it("Claude の確かめの結果に、計算が入る（爪留めには入らない）", () => {
    const s = new RingSession(tri(), () => seedLedger() as Ledger, () => undefined, () => "");
    s.state = { ...DEFAULT_STATE, metal: "sv925" };
    s.setSetting({ style: "tension", reason: "挟む" });
    const c = s.check();
    expect(c.tension_calc!.metals.map((m) => m.metal)).toEqual(["K18 イエロー", "K18 ピンク", "K18 ホワイト", "Pt900", "SV925"]);
    const k = c.tension_calc!.metals[0];
    expect(k.verdict).toBe("room");
    // 深さの既定は、SV925 でのおすすめ。K18 の小さめに作る量は、太い輪の分の限界 − 深さの和
    expect(k.smaller_by_mm).toBeCloseTo(k.limit_thick_ring_mm! - c.tension_calc!.need_mm!, 1);
    expect(k.stays_open_after_spread_mm).toBeGreaterThan(0);
    // SV925・11 号の既定の三角では、戻りきらない分を見込むと、おすすめの組が見つからない（仮の値で。14 号なら見つかる）
    expect(c.tension_calc!.hold!.advice!.found).toBe(false);
    expect(c.tension_calc!.hold!.advice!.text).toContain("おすすめ");
    // 前の深さ（くぼみ 0.8・溝 0.5）にすると、SV925 は開く量がぎりぎり、の注意
    s.setTensionDepths(0.8, 0.5);
    expect(s.check().tension_calc!.cautions.map((x) => x.title).join()).toContain("ぎりぎり");
    expect(c.tension_calc!.note).toContain("最後は職人が決める");
    expect(c.note).toContain("石の入れ方");
    s.setSetting({ style: "prong", reason: "戻す" });
    expect(s.check().tension_calc).toBeUndefined();
  });

  it("作り方の手順にも同じ値が出る。「職人が決める」を添える", () => {
    const r = triRing();
    const t = tensionSpring(r.setting, r.shank)!;
    const steps = howToMake({ ring: r, outlineMm: tri().outlineMm, longMm: 8.88, widthMm: 7.52, depthMm: 4.24, metalLabel: "K18 イエロー", alloy: null, springMetal: "k18y" }, "hand");
    const close = steps.find((x) => x.id === "tension_close")!;
    const k = row(t, "k18y");
    const text = JSON.stringify(close.specs);
    expect(text).toContain(`${k.shrinkMm!.toFixed(2)} mm`);
    expect(text).toContain(`${k.makeGapMm!.toFixed(2)} mm`);
    expect(text).toContain("職人が決める");
    const set = steps.find((x) => x.id === "tension_set")!;
    expect(JSON.stringify(set.specs)).toContain(`${k.spreadMm!.toFixed(2)} mm`);
    expect(set.text).toContain("角を先にくぼみへ");
  });

  // 作者（2026-11-06）：「プラチナでもテンションはできる。足りないって何？」→ できないのではなく「この腕のままでは」と書く
  it("開ききらない地金の作り方には、数を出さず、この腕のままでは開ききらないので組み直すと書く", () => {
    const r = buildRing({ stone: tri(), setting: { style: "tension", culetGapMm: 0.5 }, shank: { gou: 11, ...phi4, metal: "pt900" } });
    const steps = howToMake({ ring: r, outlineMm: tri().outlineMm, longMm: 8.88, widthMm: 7.52, depthMm: 4.24, metalLabel: "Pt900", alloy: null, springMetal: "pt900" }, "hand");
    const text = JSON.stringify(steps.find((x) => x.id === "tension_close")!.specs);
    expect(text).toContain("この腕のままでは開ききらない");
    expect(text).toContain("組み直す");
    expect(text).not.toContain("足りない見込み");
    expect(text).toContain("職人が決める");
  });
});
