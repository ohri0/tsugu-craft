// 腕の場所ごとの形と、Claude が書く断面の線：形が壊れない（閉じた 1 つの形・内径が変わらない・石座とつながる）、
// 確かめが場所ごとに見る、壊れた線は分かる言葉で断る。
import { describe, expect, it } from "vitest";
import { openEdges } from "../src/cad/solid";
import { buildRing } from "../src/geometry/ring";
import { buildShank, sectionOutline, type ShankParams, type ShankStation } from "../src/geometry/shank";
import { commonRows, pchip } from "../src/geometry/shank-loft";
import { makeReliefField, reliefPattern } from "../src/geometry/shank-relief";
import { sectionCurveProblem } from "../src/geometry/section-input";
import { checkRing, checkShank } from "../src/rules/checks";
import { GUIDES, innerDiameterMm } from "../src/rules/guides";
import { parseToolCall, TOOLS } from "../src/claude/tools";
import { seedLedger } from "../src/rules/ledger";
import { PRESETS, presetOutline } from "../src/studio/presets";
import { RingSession, bandFixInput, carryDesign, DEFAULT_STATE, reliefFixInput } from "../src/studio/session";
import type { StoneParams } from "../src/geometry/stone";
import { stoneFrom, triangleStone } from "./helpers/stones";
import { ellipse } from "./helpers/synth";

const roundStone = () => stoneFrom(ellipse(0, 0, 325, 325), 6.5, 3.9);
const presetStone = (id: string): StoneParams => {
  const p = PRESETS.find((x) => x.id === id)!;
  return { outlineMm: presetOutline(p), longMm: p.longMm, widthMm: p.widthMm, depthMm: p.depthMm };
};

/** 真ん中に稜線が立つ断面（同じ点を 3 回で折る） */
const RIDGE = [
  { x: 1, y: 0 },
  { x: 1, y: 0.35 },
  { x: 0.55, y: 0.55 },
  { x: 0, y: 1 },
  { x: 0, y: 1 },
  { x: 0, y: 1 },
  { x: -0.55, y: 0.55 },
  { x: -1, y: 0.35 },
  { x: -1, y: 0 },
];
const STATIONS: ShankStation[] = [
  { atDeg: 70, widthMm: 2.4, thicknessMm: 1.7, curve: { points: RIDGE } },
  { atDeg: 180, widthMm: 1.9, thicknessMm: 1.3, section: "kouman" },
];

/** 頂点を溶接して、つながった形の数を数える */
function components(p: Float32Array): number {
  const key = (i: number) => `${Math.round(p[i] * 2e4)},${Math.round(p[i + 1] * 2e4)},${Math.round(p[i + 2] * 2e4)}`;
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = a;
    while (parent.get(c) !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  for (let t = 0; t < p.length; t += 9) {
    const ks = [key(t), key(t + 3), key(t + 6)];
    for (const k of ks) if (!parent.has(k)) parent.set(k, k);
    parent.set(find(ks[0]), find(ks[1]));
    parent.set(find(ks[1]), find(ks[2]));
  }
  const roots = new Set<string>();
  for (const k of parent.keys()) roots.add(find(k));
  return roots.size;
}

/** 指の軸からの距離のいちばん小さい値（内径の半分） */
function innerRadius(p: Float32Array): number {
  let m = Infinity;
  for (let i = 0; i < p.length; i += 3) m = Math.min(m, Math.hypot(p[i + 1], p[i + 2]));
  return m;
}

/** いちばん下（−z）での腕の外の半径と幅 */
function bottomSize(p: Float32Array): { radius: number; width: number } {
  let radius = 0;
  let xMin = Infinity;
  let xMax = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    if (p[i + 2] > 0 || Math.abs(p[i + 1]) > 0.3) continue;
    radius = Math.max(radius, -p[i + 2]);
    xMin = Math.min(xMin, p[i]);
    xMax = Math.max(xMax, p[i]);
  }
  return { radius, width: xMax - xMin };
}

const base: ShankParams = { gou: 11, widthMm: 3, thicknessMm: 2.2, section: "free", sectionCurve: { points: RIDGE }, stations: STATIONS };

describe("腕の場所ごとの形（形）", () => {
  it("行き過ぎない曲線：決めた値を通り、間で飛び出さない", () => {
    const f = pchip([0, 1, 2, 4], [3, 2, 2, 1]);
    expect(f(0)).toBe(3);
    expect(f(1)).toBeCloseTo(2, 9);
    expect(f(4)).toBe(1);
    for (let x = 0; x <= 4; x += 0.05) {
      expect(f(x)).toBeLessThanOrEqual(3 + 1e-9);
      expect(f(x)).toBeGreaterThanOrEqual(1 - 1e-9);
    }
  });

  it("断面の行：どの場所も同じ行数で、どの線の点も入る（角が丸まらない）", () => {
    const a = sectionOutline("free", undefined, { points: RIDGE });
    const b = sectionOutline("kouman");
    const [ra, rb] = commonRows([a, b]);
    expect(ra.length).toBe(rb.length);
    expect(ra.length).toBeGreaterThanOrEqual(Math.max(a.length, b.length));
    // 稜線のいちばん上の点が、そろえた行にも入っている
    expect(Math.max(...ra.map((q) => q[1]))).toBeCloseTo(1, 6);
  });

  it("閉じた 1 つの形で、内径は変わらず、いちばん上は決めた厚み、いちばん下は下の形になる", () => {
    const sh = buildShank(base);
    expect(openEdges(sh.positions)).toBe(0);
    expect(components(sh.positions)).toBe(1);
    expect(innerRadius(sh.positions)).toBeCloseTo(innerDiameterMm(11) / 2, 4);
    expect(sh.widthMm).toBe(3);
    expect(sh.thicknessMm).toBe(2.2);
    const low = bottomSize(sh.positions);
    expect(low.radius).toBeCloseTo(innerDiameterMm(11) / 2 + 1.3, 1);
    expect(low.width).toBeCloseTo(1.9, 1);
    expect(sh.minWidthMm).toBeCloseTo(1.9, 2);
    expect(sh.minThicknessMm).toBeCloseTo(1.3, 2);
    expect(sh.along?.length).toBeGreaterThan(2);
  });

  it("場所ごとの形を書かなければ、これまでと同じ数の形（三角形の並びまで同じ）", () => {
    const a = buildShank({ gou: 11, widthMm: 2.4, thicknessMm: 1.6, section: "hirauchi" });
    const b = buildShank({ gou: 11, widthMm: 2.4, thicknessMm: 1.6, section: "hirauchi", stations: [] });
    expect(b.positions.length).toBe(a.positions.length);
    expect(Array.from(b.positions.slice(0, 900))).toEqual(Array.from(a.positions.slice(0, 900)));
    expect(a.along).toBeUndefined();
    expect(a.minWidthMm).toBeUndefined();
  });

  it("腕の間に挟む石座：どの石でも、腕は閉じた 1 つの形で、両はしは石座の下の輪に当たる", () => {
    for (const id of ["round", "oval", "princess", "emerald", "pear", "marquise"]) {
      const stone = presetStone(id);
      for (const orientation of ["along", "across"] as const) {
        const r = buildRing({ stone, setting: { style: "prong", height: "standard", join: "between" }, shank: { ...base, widthMm: 2.4, thicknessMm: 1.8 }, orientation });
        expect(openEdges(r.shank.positions), `${id} ${orientation}`).toBe(0);
        expect(components(r.shank.positions), `${id} ${orientation}`).toBe(1);
        expect(innerRadius(r.shank.positions), `${id} ${orientation}`).toBeCloseTo(innerDiameterMm(11) / 2, 3);
        expect(r.shank.ends?.length, `${id} ${orientation}`).toBe(2);
        if (r.setting.collar) expect(checkRing(r).filter((p) => p.check === "band-end").map((p) => p.where), `${id} ${orientation}`).toEqual([]);
      }
    }
  }, 120000);

  it("腕の端の形は、どこも同じ形の腕と同じ（つなぎが変わらない）", () => {
    const stone = roundStone();
    const setting = { style: "prong" as const, height: "standard" as const, join: "between" as const };
    const plain = buildRing({ stone, setting, shank: { gou: 11, widthMm: 2.4, thicknessMm: 1.8 } });
    const lofted = buildRing({ stone, setting, shank: { gou: 11, widthMm: 2.4, thicknessMm: 1.8, stations: [{ atDeg: 180, widthMm: 1.8, thicknessMm: 1.3 }] } });
    expect(lofted.shank.ends).toEqual(plain.shank.ends);
    expect(lofted.culetGapMm).toBeCloseTo(plain.culetGapMm, 9);
    expect(lofted.setting.collar?.topZ).toBeCloseTo(plain.setting.collar!.topZ, 9);
  });

  it("腕の上にのせる石座：閉じた形で、ザグりと座はそのまま", () => {
    const stone = triangleStone();
    const setting = { style: "prong" as const, height: "standard" as const, join: "on" as const };
    const plain = buildRing({ stone, setting, shank: { gou: 11, widthMm: 2.6, thicknessMm: 1.8 } });
    const lofted = buildRing({ stone, setting, shank: { gou: 11, widthMm: 2.6, thicknessMm: 1.8, stations: STATIONS } });
    expect(openEdges(lofted.shank.positions)).toBe(0);
    expect(components(lofted.shank.positions)).toBe(1);
    expect(lofted.notchDepthMm).toBeCloseTo(plain.notchDepthMm, 6);
    expect(lofted.shank.railSeatDepthMm).toBeCloseTo(plain.shank.railSeatDepthMm, 6);
    expect(innerRadius(lofted.shank.positions)).toBeCloseTo(innerDiameterMm(11) / 2, 3);
  });

  it("うねり：左右で逆に寄り、いちばん下とつなぎの所では寄らない。閉じたまま", () => {
    const sh = buildShank({ gou: 11, widthMm: 2.4, thicknessMm: 1.6, stations: [{ atDeg: 80, widthMm: 2.4, thicknessMm: 1.6, swayMm: 1 }, { atDeg: 180, widthMm: 2.4, thicknessMm: 1.6 }] });
    expect(openEdges(sh.positions)).toBe(0);
    expect(components(sh.positions)).toBe(1);
    let plus = 0;
    let minus = 0;
    for (let i = 0; i < sh.positions.length; i += 3) {
      const [x, y, z] = [sh.positions[i], sh.positions[i + 1], sh.positions[i + 2]];
      if (Math.abs(z) > 1 || Math.abs(y) < 5) continue;
      if (y > 0) plus = Math.max(plus, x);
      else minus = Math.min(minus, x);
    }
    expect(plus).toBeGreaterThan(1.9);
    expect(minus).toBeLessThan(-1.9);
  });

  it("重さは、場所ごとの形を入れると変わる", () => {
    const a = buildShank({ gou: 11, widthMm: 3, thicknessMm: 2.2 });
    const b = buildShank({ gou: 11, widthMm: 3, thicknessMm: 2.2, stations: [{ atDeg: 180, widthMm: 1.8, thicknessMm: 1.3 }] });
    expect(b.weightG).toBeLessThan(a.weightG * 0.8);
  });
});

describe("腕の場所ごとの形（確かめ）", () => {
  it("いちばん細い・薄い場所で比べる", () => {
    const sh = buildShank({ gou: 11, widthMm: 3, thicknessMm: 2, stations: [{ atDeg: 180, widthMm: 1.2, thicknessMm: 1 }] });
    const probs = checkShank(sh);
    expect(probs.find((p) => p.check === "band-thin")?.currentValue).toBeCloseTo(1, 2);
    expect(probs.find((p) => p.check === "band-narrow")?.currentValue).toBeCloseTo(1.2, 2);
    expect(probs.find((p) => p.check === "band-thin")?.where).toContain("いちばん薄い場所");
  });

  it("下の方の断面のとがりも見る（場所の言葉つき）", () => {
    // 下だけ、先の鋭い断面
    const sharp = [{ x: 1, y: 0 }, { x: 0.15, y: 0.85 }, { x: 0, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 1 }, { x: -0.15, y: 0.85 }, { x: -1, y: 0 }];
    const sh = buildShank({ gou: 11, widthMm: 2.4, thicknessMm: 1.6, stations: [{ atDeg: 180, widthMm: 1.8, thicknessMm: 1.6, curve: { points: sharp } }] });
    const probs = checkShank(sh).filter((p) => p.check === "band-spike");
    expect(probs.length).toBeGreaterThan(0);
    expect(probs.some((p) => p.where.includes("腕の下の方"))).toBe(true);
  });

  it("直し方は、足りない場所だけ上げ、石座のそばは変えない", () => {
    const s = { ...DEFAULT_STATE, shankThicknessMm: 2, shankWidthMm: 3, shankStations: [{ atDeg: 90, widthMm: 2.5, thicknessMm: 1.6 }, { atDeg: 180, widthMm: 1.2, thicknessMm: 1 }] };
    const t = bandFixInput("thickerBand", s);
    expect(t.thickness_mm).toBeUndefined();
    expect(t.stations?.map((q) => q.thickness_mm)).toEqual([1.6, GUIDES.band.minThicknessMm]);
    const w = bandFixInput("widerBand", s);
    expect(w.width_mm).toBeUndefined();
    expect(w.stations?.map((q) => q.width_mm)).toEqual([2.5, GUIDES.band.minWidthMm]);
    // 場所ごとの形がなければ、前と同じ
    expect(bandFixInput("thickerBand", { ...DEFAULT_STATE })).toEqual({ thickness_mm: GUIDES.band.minThicknessMm });
  });
});

describe("Claude の道具（set_shank）", () => {
  const ok = (input: unknown) => parseToolCall("set_shank", input);
  const curve = { points: RIDGE };

  it("道具の定義に、断面の線と場所ごとの形がある。入れ子の形も strict の決まりを守る", () => {
    const t = TOOLS.find((x) => x.name === "set_shank")!;
    const props = (t.input_schema as { properties: Record<string, Record<string, unknown>> }).properties;
    expect(props.section_curve).toBeDefined();
    expect(props.stations).toBeDefined();
    const walk = (o: unknown) => {
      if (typeof o !== "object" || o === null) return;
      const s = o as Record<string, unknown>;
      if (s.type === "object") expect(s.additionalProperties, JSON.stringify(s).slice(0, 80)).toBe(false);
      for (const v of Object.values(s)) walk(v);
    };
    walk(t.input_schema);
    // 手で描いた片側の点は、Claude には出さない
    expect(props.section_points).toBeUndefined();
    expect(ok({ section_points: [{ x: 0, y: 1 }], reason: "x" }).ok).toBe(false);
  });

  it("よい線と場所は通す", () => {
    expect(ok({ section_curve: curve, width_mm: 3, thickness_mm: 2, reason: "稜線" }).ok).toBe(true);
    expect(ok({ stations: [{ at_deg: 60, width_mm: 2.4, thickness_mm: 1.7, section_curve: curve, sway_mm: 0.5 }, { at_deg: 180, width_mm: 2, thickness_mm: 1.3, section: "kouman" }], reason: "下を細く" }).ok).toBe(true);
    expect(ok({ stations: [], reason: "どこも同じに戻す" }).ok).toBe(true);
  });

  it("壊れた線は、分かる言葉で断る", () => {
    const cases: [unknown, string][] = [
      [{ points: [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }] }, "5〜40 個"],
      [{ points: [{ x: 1, y: 0.3 }, { x: 1, y: 0.6 }, { x: 0, y: 1 }, { x: -1, y: 0.6 }, { x: -1, y: 0 }] }, "y ＝ 0"],
      [{ points: [{ x: -1, y: 0 }, { x: -1, y: 0.6 }, { x: 0, y: 1 }, { x: 1, y: 0.6 }, { x: 1, y: 0 }] }, "右の端"],
      [{ points: [{ x: 2, y: 0 }, { x: 1, y: 0.6 }, { x: 0, y: 1 }, { x: -1, y: 0.6 }, { x: -1, y: 0 }] }, "x は"],
      [{ points: [{ x: 1, y: 0 }, { x: 1, y: 0.6 }, { x: 0, y: -0.1 }, { x: -1, y: 0.6 }, { x: -1, y: 0 }] }, "y は"],
      [{ points: [{ x: 1, y: 0 }, { x: 1, y: 0.8 }, { x: 0.5, y: 0.8 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: -0.5, y: 0.8 }, { x: -1, y: 0.8 }, { x: -1, y: 0 }] }, "左右に分かれ"],
      [{ points: [{ x: 1, y: 0 }, { x: -1, y: 1 }, { x: 1, y: 1 }, { x: -1, y: 0.2 }, { x: 0.8, y: 0.6 }, { x: -1, y: 0 }] }, "自分と交わ"],
      [{ points: [{ x: 1, y: 0 }, "x", { x: 0, y: 1 }, { x: -1, y: 0.6 }, { x: -1, y: 0 }] }, "数の"],
      [{ points: RIDGE, knots: [0] }, "knots"],
      ["線", "形が正しくありません"],
    ];
    for (const [section_curve, word] of cases) {
      const r = ok({ section_curve, reason: "x" });
      expect(r.ok, word).toBe(false);
      expect(!r.ok && r.error, word).toContain(word);
    }
  });

  it("場所の入力の間違いも断る", () => {
    const st = (over: object) => ({ stations: [{ at_deg: 90, width_mm: 2, thickness_mm: 1.5, ...over }], reason: "x" });
    expect(ok(st({ at_deg: 5 })).ok).toBe(false);
    expect(ok(st({ at_deg: 200 })).ok).toBe(false);
    expect(ok(st({ width_mm: 0.2 })).ok).toBe(false);
    expect(ok(st({ thickness_mm: 9 })).ok).toBe(false);
    expect(ok(st({ section: "maru" })).ok).toBe(false);
    expect(ok(st({ sway_mm: 9 })).ok).toBe(false);
    expect(ok(st({ at_deg: 180, sway_mm: 1 })).ok).toBe(false);
    expect(ok(st({ extra: 1 })).ok).toBe(false);
    expect(ok({ stations: [{ at_deg: 120, width_mm: 2, thickness_mm: 1.5 }, { at_deg: 60, width_mm: 2, thickness_mm: 1.5 }], reason: "x" }).ok).toBe(false);
    expect(ok({ stations: [1, 2], reason: "x" }).ok).toBe(false);
    expect(ok({ section: "kouman", section_curve: curve, reason: "x" }).ok).toBe(false);
    expect(ok({ stations: Array.from({ length: 5 }, (_, i) => ({ at_deg: 40 + i * 30, width_mm: 2, thickness_mm: 1.5 })), reason: "x" }).ok).toBe(false);
  });

  it("線の確かめ：決まった断面の点は、どれも通る", () => {
    for (const id of ["kouman", "hirauchi", "hangouman", "kaku"] as const) {
      const half = sectionOutline(id);
      expect(half.length).toBeGreaterThan(4);
    }
    expect(sectionCurveProblem(RIDGE)).toBeNull();
  });
});

describe("設計の場（session）", () => {
  const session = (stone = presetStone("marquise")) => new RingSession(stone, () => seedLedger(), () => undefined, () => "");

  it("set_shank の断面の線と場所ごとの形で腕が変わり、作れるかは確かめが見る", () => {
    const s = session();
    const before = s.build().ring.metalWeightG;
    const r = s.setShank({ section_curve: { points: RIDGE }, width_mm: 3, thickness_mm: 2, stations: [{ at_deg: 70, width_mm: 2.4, thickness_mm: 1.7 }, { at_deg: 180, width_mm: 1.9, thickness_mm: 1.3, section: "kouman" }], reason: "ためし" });
    expect(r.shank.section).toBe("free");
    expect(r.shank.stations?.length).toBe(2);
    expect(r.shank.min_width_mm).toBeCloseTo(1.9, 2);
    expect(r.shank.min_thickness_mm).toBeCloseTo(1.3, 2);
    expect(r.weight_g).not.toBeCloseTo(before, 1);
    const c = s.check();
    expect(c.problems.filter((p) => p.check.startsWith("腕の")).map((p) => p.check)).toEqual([]);
    // 細くしすぎると、確かめが止める
    s.setShank({ stations: [{ at_deg: 180, width_mm: 1.2, thickness_mm: 1, section: "kouman" }], reason: "細く" });
    const names = s.check().problems.map((p) => p.check);
    expect(names).toContain("腕の厚み");
    expect(names).toContain("腕の幅");
    // 空の並びで、どこも同じ形に戻る
    s.setShank({ stations: [], reason: "戻す" });
    expect(s.state.shankStations).toBeUndefined();
    expect(s.built!.ring.shank.along).toBeUndefined();
  });

  it("テンションの腕は変えない：線も場所も使わず、知らせる。出たら元の形に戻る", () => {
    const s = session(triangleStone());
    s.setShank({ stations: [{ at_deg: 180, width_mm: 2, thickness_mm: 1.4 }], reason: "下を細く" });
    s.setSetting({ style: "tension", reason: "挟む" });
    expect(s.built!.ring.setting.style).toBe("tension");
    expect(s.built!.ring.shank.along).toBeUndefined();
    expect(s.built!.ring.shank.section).toBe("maru");
    const r = s.setShank({ section_curve: { points: RIDGE }, stations: [{ at_deg: 90, width_mm: 3, thickness_mm: 2 }], reason: "ためし" });
    expect(r.note).toContain("テンション");
    expect(s.state.shankSection).toBe("maru");
    expect(s.state.shankStations?.[0].atDeg).toBe(180);
    s.setSetting({ style: "prong", reason: "戻す" });
    expect(s.built!.ring.shank.along?.length).toBeGreaterThan(0);
  });

  it("丸線の腕には使わず、知らせる", () => {
    const s = session();
    const r = s.setShank({ section: "maru", width_mm: 2.4, thickness_mm: 2.4, stations: [{ at_deg: 180, width_mm: 2, thickness_mm: 2 }], reason: "ためし" });
    expect(r.note).toContain("丸線");
    expect(s.built!.ring.shank.along).toBeUndefined();
  });

  it("石を変えても引き継ぎ、Claude の作業を戻せる", () => {
    const s = session();
    const snap = s.snapshot();
    s.setShank({ section_curve: { points: RIDGE }, stations: [{ at_deg: 180, width_mm: 1.9, thickness_mm: 1.3 }], reason: "ためし" });
    const carried = carryDesign(s.state, { ...DEFAULT_STATE });
    expect(carried.shankStations?.[0].widthMm).toBe(1.9);
    expect(carried.sectionCurve?.points.length).toBe(RIDGE.length);
    s.restore(snap);
    expect(s.state.shankStations).toBeUndefined();
    expect(s.built!.ring.shank.section).toBe(snap.shankSection ?? "kouman");
  });
});

describe("腕の彫り", () => {
  const relief = { kind: "arch" as const, count: 3, depthMm: 0.25, fromDeg: 25, toDeg: 100 };
  it.each(["arch", "diamond", "wave", "beads", "lines", "leaf"] as const)("%s：腕の間に挟む石座でも閉じた 1 つの形で、内径と腕の端は変わらない", (kind) => {
    const stone = roundStone();
    const setting = { style: "prong" as const, height: "standard" as const, join: "between" as const };
    const shank = { gou: 11, widthMm: 2.8, thicknessMm: 1.8, section: "hirauchi" as const };
    const plain = buildRing({ stone, setting, shank });
    const r = buildRing({ stone, setting, shank: { ...shank, relief: { ...relief, kind } } });
    expect(openEdges(r.shank.positions)).toBe(0);
    expect(components(r.shank.positions)).toBe(1);
    expect(innerRadius(r.shank.positions)).toBeCloseTo(innerDiameterMm(11) / 2, 3);
    expect(r.shank.ends).toEqual(plain.shank.ends);
    // 彫った分だけ軽い
    expect(r.shank.volumeMm3).toBeLessThan(plain.shank.volumeMm3);
    expect(r.shank.relief?.fromDegUsed).toBeGreaterThanOrEqual(25);
  });
  it("腕の上にのせる石座・場所ごとの形といっしょでも閉じる。彫りの下は いつも地金が残る", () => {
    const r = buildRing({ stone: triangleStone(), setting: { style: "prong", height: "standard", join: "on" }, shank: { gou: 11, widthMm: 2.8, thicknessMm: 2, section: "free", sectionCurve: { points: RIDGE }, stations: STATIONS, relief: { ...relief, columns: 2 } } });
    expect(openEdges(r.shank.positions)).toBe(0);
    expect(components(r.shank.positions)).toBe(1);
    expect(r.shank.relief!.localUnderMm).toBeGreaterThanOrEqual(GUIDES.band.relief.keepMm - 1e-9);
    expect(innerRadius(r.shank.positions)).toBeCloseTo(innerDiameterMm(11) / 2, 3);
  });
  it("彫りの下の地金が足りないと確かめが止め、直し方で通る", () => {
    const s = new RingSession(presetStone("marquise"), () => seedLedger(), () => undefined, () => "");
    s.setShank({ width_mm: 2.4, thickness_mm: 1.2, section: "hirauchi", relief: { pattern: "arch", depth_mm: 0.4 }, reason: "ためし" });
    const p = s.check().problems.find((q) => q.check === "腕の彫りの下の地金");
    expect(p?.options[0].action).toBe("彫りを浅くする");
    expect(s.built!.problems.find((q) => q.check === "band-relief")?.currentValue).toBeCloseTo(0.8, 2);
    s.setShank({ relief: reliefFixInput(s.state, s.built!.ring.shank.relief!.peakUnderMm)!, reason: "直す" });
    expect(s.state.shankRelief?.depthMm).toBeCloseTo(0.2, 2);
    expect(s.check().problems.some((q) => q.check === "腕の彫りの下の地金")).toBe(false);
    // なしに戻す
    s.setShank({ relief: { pattern: "none" }, reason: "やめる" });
    expect(s.state.shankRelief).toBeUndefined();
    expect(s.check().passed).not.toContain("腕の彫りの下の地金");
  });
  it("道具の入力を確かめる。テンションの腕には彫らない", () => {
    const ok = (relief: unknown) => parseToolCall("set_shank", { relief, reason: "x" });
    expect(ok({ pattern: "arch", count: 4, depth_mm: 0.25, from_deg: 25, to_deg: 100, columns: 2 }).ok).toBe(true);
    expect(ok({ pattern: "none" }).ok).toBe(true);
    expect(ok({ pattern: "castle" }).ok).toBe(false);
    expect(ok({ pattern: "arch", depth_mm: 2 }).ok).toBe(false);
    expect(ok({ pattern: "arch", count: 2.5 }).ok).toBe(false);
    expect(ok({ pattern: "arch", from_deg: 120, to_deg: 60 }).ok).toBe(false);
    expect(ok({ pattern: "arch", extra: 1 }).ok).toBe(false);
    const s = new RingSession(triangleStone(), () => seedLedger(), () => undefined, () => "");
    s.setSetting({ style: "tension", reason: "挟む" });
    const r = s.setShank({ relief: { pattern: "arch" }, reason: "ためし" });
    expect(r.note).toContain("テンション");
    expect(s.built!.ring.shank.relief).toBeUndefined();
  });
});

describe("腕の彫りの仕上がり（作者の声：縁がギザギザ、ブロックが貼りついたよう、2026-11-05）", () => {
  // 入口の絵と同じ数：稜線の断面、肩へ向かって細く、稜線の両側に窓
  const gothicRidge = [{ x: 1, y: 0 }, { x: 1, y: 0.28 }, { x: 0.74, y: 0.44 }, { x: 0.4, y: 0.68 }, { x: 0, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 1 }, { x: -0.4, y: 0.68 }, { x: -0.74, y: 0.44 }, { x: -1, y: 0.28 }, { x: -1, y: 0 }];
  const gothic: ShankParams = {
    gou: 11,
    widthMm: 2.1,
    thicknessMm: 1.9,
    section: "free",
    sectionCurve: { points: gothicRidge },
    stations: [
      { atDeg: 80, widthMm: 2.3, thicknessMm: 1.6, curve: { points: gothicRidge } },
      { atDeg: 180, widthMm: 2.6, thicknessMm: 1.3, section: "hangouman" },
    ],
    relief: { kind: "arch", count: 3, depthMm: 0.25, fromDeg: 24, toDeg: 118, columns: 2 },
  };

  it("どの石でも、閉じた 1 つの形で、内径は変わらず、断面のとがりの確かめも通る", () => {
    for (const id of ["round", "oval", "pear", "marquise"]) {
      for (const join of ["between", "on"] as const) {
        const r = buildRing({ stone: presetStone(id), setting: { style: "prong", height: "standard", join }, shank: gothic });
        expect(openEdges(r.shank.positions), `${id} ${join}`).toBe(0);
        expect(components(r.shank.positions), `${id} ${join}`).toBe(1);
        expect(innerRadius(r.shank.positions), `${id} ${join}`).toBeCloseTo(innerDiameterMm(11) / 2, 3);
        expect(checkShank(r.shank).map((q) => q.check), `${id} ${join}`).toEqual([]);
      }
    }
  }, 120000);

  it("重くなりすぎない。細かい網目は、入口の絵のときだけ", () => {
    const normal = buildShank(gothic);
    expect(normal.positions.length / 9).toBeLessThan(140000);
    const fine = buildShank({ ...gothic, relief: { ...gothic.relief!, fine: true } });
    expect(fine.positions.length).toBeGreaterThan(normal.positions.length);
    expect(openEdges(fine.positions)).toBe(0);
  });

  it("面の向きは、三角形と同じ並びで、長さ 1。外を向いている", () => {
    const sh = buildShank(gothic);
    const n = sh.normals!;
    expect(n.length).toBe(sh.positions.length);
    const p = sh.positions;
    let outward = 0;
    let total = 0;
    for (let i = 0; i < p.length; i += 9 * 37) {
      for (const c of [0, 3, 6]) expect(Math.hypot(n[i + c], n[i + c + 1], n[i + c + 2])).toBeCloseTo(1, 3);
      const ux = p[i + 3] - p[i], uy = p[i + 4] - p[i + 1], uz = p[i + 5] - p[i + 2];
      const vx = p[i + 6] - p[i], vy = p[i + 7] - p[i + 1], vz = p[i + 8] - p[i + 2];
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      if (Math.hypot(fx, fy, fz) < 1e-9) continue;
      total++;
      if (fx * n[i] + fy * n[i + 1] + fz * n[i + 2] > 0) outward++;
    }
    expect(outward / total).toBeGreaterThan(0.985);
  });

  it("動かしている間は彫らない。確かめに使う数は同じ", () => {
    const draft = buildShank({ ...gothic, relief: { ...gothic.relief!, draft: true } });
    const full = buildShank(gothic);
    expect(draft.normals).toBeUndefined();
    expect(draft.positions.length).toBeLessThan(full.positions.length / 2);
    expect(draft.relief!.peakUnderMm).toBeCloseTo(full.relief!.peakUnderMm, 2);
  });

  it("腕の縁には彫らない", () => {
    for (const kind of ["arch", "diamond", "wave", "beads", "lines", "leaf"] as const) {
      for (let u = 0; u < 6; u += 0.013) {
        // 外の面の線の長さの半分 1.5 mm のとき、縁から 0.12 mm の内までは、どの模様も深さ 0
        expect(reliefPattern(kind, u, 1.5 - 0.1, 4, 1.5, 1), kind).toBe(0);
        expect(reliefPattern(kind, u, -1.5 + 0.1, 4, 1.5, 2), kind).toBe(0);
      }
    }
  });

  it("はじめと終わりは、深さが 0 まで なめらかに消える。腕が細くなる所では、窓も短くなる", () => {
    const v = Array.from({ length: 41 }, (_, i) => 1 - i / 20);
    const at = (a: number) => ({ w: 3 - a * 0.5, t: 1.8, arc: (3 - a * 0.5) * 0.75 });
    const a0 = 0.5;
    const a1 = 2;
    const field = makeReliefField({ kind: "arch", count: 4, depthMm: 0.25, fromDeg: 0, toDeg: 180 }, { a0, a1, v, innerR: 8, at });
    // 真ん中の行から少しずらした所で、腕に沿って深さを見る
    const along = (phi: number) => {
      let m = 0;
      for (let r = 0; r <= 40; r += 0.25) m = Math.max(m, field.depth(r, phi));
      return m;
    };
    expect(field.depth(20, a0)).toBe(0);
    expect(field.depth(20, a1)).toBe(0);
    expect(along(a0 + 0.004)).toBeLessThan(0.01);
    expect(along(a1 - 0.004)).toBeLessThan(0.01);
    let peak = 0;
    for (let a = a0; a < a1; a += 0.005) peak = Math.max(peak, along(a));
    expect(peak).toBeGreaterThan(0.2);
    expect(peak).toBeLessThanOrEqual(0.25 + 1e-9);
    // 左の腕も右の腕も同じ深さ
    expect(field.depth(10, Math.PI * 2 - 1.3)).toBeCloseTo(field.depth(10, 1.3), 9);
  });
});

