// 段々の肩（腕の場所を「段で」変える）と、段の立ち上がりのまわりで彫りを止めること。
// 「アールデコな感じ」がゴシックに見えた直し（2026-11-07 作者の声）で足した。形が壊れない（閉じた 1 つの形・内径が変わらない）、
// 段の前後は決めた幅・厚みのまま平らで、立ち上がりだけで替わる、道具の入力で書ける。
import { describe, expect, it } from "vitest";
import { openEdges } from "../src/cad/solid";
import { buildRing } from "../src/geometry/ring";
import { buildShank, type ShankParams, type ShankStation } from "../src/geometry/shank";
import { makeLoft, pchip, RISER_RAD, stepRise } from "../src/geometry/shank-loft";
import { combineFields, RISER_GAP_MM, withRiserGaps, type ReliefField } from "../src/geometry/shank-relief";
import { innerDiameterMm } from "../src/rules/guides";
import { parseToolCall } from "../src/claude/tools";
import { toolLogLine } from "../src/claude/words";
import { stationFrom, stationTo } from "../src/studio/session";
import { triangleStone } from "./helpers/stones";

const deg = (d: number) => (d * Math.PI) / 180;

/** 上面が平らな段の断面（同じ点 3 回で角を立てる） */
const TERRACE = [
  { x: 1, y: 0 },
  { x: 1, y: 0.6 },
  { x: 1, y: 0.6 },
  { x: 1, y: 0.6 },
  { x: 0.6, y: 1 },
  { x: 0.6, y: 1 },
  { x: 0.6, y: 1 },
  { x: -0.6, y: 1 },
  { x: -0.6, y: 1 },
  { x: -0.6, y: 1 },
  { x: -1, y: 0.6 },
  { x: -1, y: 0.6 },
  { x: -1, y: 0.6 },
  { x: -1, y: 0 },
];

const STEPPED: ShankStation[] = [
  { atDeg: 45, widthMm: 4.4, thicknessMm: 2.3, step: true },
  { atDeg: 60, widthMm: 3.6, thicknessMm: 2.0, step: true },
  { atDeg: 180, widthMm: 3.0, thicknessMm: 1.7 },
];
const base: ShankParams = { gou: 11, widthMm: 5.2, thicknessMm: 2.6, section: "free", sectionCurve: { points: TERRACE }, stations: STEPPED };

/** 頂点を溶接して、つながった形の数を数える */
function components(p: Float32Array): number {
  const key = (i: number) => `${Math.round(p[i] * 2e4)},${Math.round(p[i + 1] * 2e4)},${Math.round(p[i + 2] * 2e4)}`;
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r)!;
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

function innerRadius(p: Float32Array): number {
  let m = Infinity;
  for (let i = 0; i < p.length; i += 3) m = Math.min(m, Math.hypot(p[i + 1], p[i + 2]));
  return m;
}

/** いちばん上からの角度 a（度）の近くの、腕の幅（x の広がり） */
function widthNear(p: Float32Array, aDeg: number, tolDeg = 1.5): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    const a = (Math.abs(Math.atan2(p[i + 1], p[i + 2])) * 180) / Math.PI;
    if (Math.abs(a - aDeg) > tolDeg) continue;
    lo = Math.min(lo, p[i]);
    hi = Math.max(hi, p[i]);
  }
  return hi - lo;
}

describe("段々の肩（場所を段で変える）", () => {
  it("段の区間：ひとつ上の値のまま進み、終わりの立ち上がりだけで替わる。行き過ぎない", () => {
    const f = pchip([0, 1, 2, 3], [5, 4, 3, 2], [false, true, false]);
    expect(f(1)).toBeCloseTo(4, 9);
    expect(f(1.5)).toBeCloseTo(4, 9);
    expect(f(2 - RISER_RAD - 1e-6)).toBeCloseTo(4, 9);
    expect(f(2)).toBeCloseTo(3, 9);
    for (let x = 0; x <= 3; x += 0.01) {
      expect(f(x)).toBeLessThanOrEqual(5 + 1e-9);
      expect(f(x)).toBeGreaterThanOrEqual(2 - 1e-9);
    }
    // 立ち上がりは区間の半分より長くならない
    expect(stepRise(0.5, 0, 1, 10)).toBeCloseTo(0, 9);
    expect(stepRise(1, 0, 1, 10)).toBeCloseTo(1, 9);
  });

  it("段の場所だけが、立ち上がりの範囲を持つ（なめらかな場所は持たない）", () => {
    const out = [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }].map((q) => [q.x, q.y] as [number, number]);
    const loft = makeLoft({ widthMm: 5, thicknessMm: 2.6, outline: out }, [
      { at: deg(45), widthMm: 4.4, thicknessMm: 2.3, outline: out, swayMm: 0, step: true },
      { at: deg(90), widthMm: 3.6, thicknessMm: 2.0, outline: out, swayMm: 0 },
    ]);
    loft.setHold(deg(20));
    const r = loft.risers();
    expect(r.length).toBe(1);
    expect(r[0][1]).toBeCloseTo(deg(45), 9);
    expect(r[0][1] - r[0][0]).toBeCloseTo(RISER_RAD, 9);
    // 段の手前は上の幅、段の後は段の幅
    expect(loft.frame(deg(40)).w).toBeCloseTo(5, 9);
    expect(loft.frame(deg(45)).w).toBeCloseTo(4.4, 9);
  });

  it("閉じた 1 つの形で、内径は変わらない。段の前後で幅が段で替わる", () => {
    const sh = buildShank(base);
    expect(openEdges(sh.positions)).toBe(0);
    expect(components(sh.positions)).toBe(1);
    expect(innerRadius(sh.positions)).toBeCloseTo(innerDiameterMm(11) / 2, 4);
    // 1 段目（45°）の手前と後、2 段目（60°）の手前と後
    expect(widthNear(sh.positions, 37)).toBeCloseTo(5.2, 1);
    expect(widthNear(sh.positions, 49)).toBeCloseTo(4.4, 1);
    expect(widthNear(sh.positions, 54)).toBeCloseTo(4.4, 1);
    expect(widthNear(sh.positions, 63)).toBeLessThan(3.75);
    expect(sh.minWidthMm).toBeCloseTo(3.0, 1);
  });

  it("腕の上にのせる石座・腕の間に挟む石座のどちらでも、彫りとミルの粒をつけて閉じた形", () => {
    for (const join of ["on", "between"] as const) {
      const ring = buildRing({
        stone: triangleStone(),
        setting: { style: "prong", height: "standard", join },
        orientation: "across",
        shank: { ...base, relief: { kind: "fan", count: 1, depthMm: 0.3, fromDeg: 47, toDeg: 59, across: [0, 0.4] }, reliefMore: [{ kind: "steps", count: 2, depthMm: 0.3, fromDeg: 30, toDeg: 75, across: [0.45, 0.85] }] },
      });
      expect(openEdges(ring.shank.positions)).toBe(0);
      // ミルの粒は腕の外に半分沈めた別の閉じた形なので、粒の前の腕で数える
      expect(components(ring.shankBase?.positions ?? ring.shank.positions)).toBe(1);
    }
  });

  it("道具の入力で書け、設計に残り、作業の記録に「段で」と出る。true か false 以外は断る", () => {
    const st = [{ at_deg: 45, width_mm: 4.4, thickness_mm: 2.3, step: true }, { at_deg: 180, width_mm: 3, thickness_mm: 1.7 }];
    const r = parseToolCall("set_shank", { stations: st, reason: "段々の肩" });
    expect(r.ok).toBe(true);
    expect(parseToolCall("set_shank", { stations: [{ at_deg: 45, width_mm: 4, thickness_mm: 2, step: "yes" }], reason: "x" }).ok).toBe(false);
    const kept = stationFrom(st[0]);
    expect(kept.step).toBe(true);
    expect(stationTo(kept).step).toBe(true);
    expect(stationFrom(st[1]).step).toBeUndefined();
    expect(toolLogLine({ tool: "set_shank", input: { stations: st, reason: "x" }, ok: true }).text).toContain("段で");
  });
});

describe("段の立ち上がりのまわりでは彫らない", () => {
  const flat: ReliefField = { a0: 0, a1: Math.PI, rowMayCarve: () => true, depth: () => 0.3 };
  it("立ち上がりから gap までは 0、離れた所は元の深さ。左右同じ", () => {
    const gap = 0.02;
    const f = withRiserGaps(flat, [[deg(43), deg(45)]], gap);
    expect(f.depth(0, deg(44))).toBe(0);
    expect(f.depth(0, deg(45) + gap * 0.9)).toBe(0);
    expect(f.depth(0, deg(43) - gap * 0.9)).toBe(0);
    expect(f.depth(0, deg(60))).toBeCloseTo(0.3, 9);
    expect(f.depth(0, Math.PI * 2 - deg(44))).toBe(0);
    expect(f.depth(0, Math.PI * 2 - deg(60))).toBeCloseTo(0.3, 9);
  });
  it("段がなければ、そのまま", () => {
    expect(withRiserGaps(flat, [], 0.02)).toBe(flat);
    expect(combineFields([flat])).toBe(flat);
    expect(RISER_GAP_MM).toBeGreaterThan(0);
  });
});
