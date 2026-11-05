// ゴシックの見本：手で決めた数字を、Claude の道具の入力（parseToolCall）だけで作れること。本物の Claude は呼ばない
import { describe, expect, it } from "vitest";
import { openEdges } from "../src/cad/solid";
import { parseToolCall, type SetSettingInput, type SetShankInput } from "../src/claude/tools";
import showcase from "../src/lp/gothic-showcase.json" with { type: "json" };
import { grooveNote } from "../src/rules/checks";
import { seedLedger } from "../src/rules/ledger";
import { presetOutline, sizedPreset, PRESETS } from "../src/studio/presets";
import { RingSession } from "../src/studio/session";

type Relief = { kind: string; count: number; depthMm: number; fromDeg: number; toDeg: number; across?: [number, number] };
type Station = { atDeg: number; widthMm: number; thicknessMm: number; curve?: { points: { x: number; y: number }[] } };
type State = {
  metal: string;
  prongCount?: number;
  prongMm?: number;
  prongTip?: string;
  join?: string;
  culetGapMm?: number;
  sectionCurve: { points: { x: number; y: number }[] };
  shankWidthMm: number;
  shankThicknessMm: number;
  shankStations: Station[];
  shankRelief: Relief;
  shankReliefMore?: Relief[];
};
type Entry = { name?: string; stone: string; stoneLongMm?: number; state: State };

const entries = showcase as unknown as Record<string, Entry>;
const ids = ["heavy", "slim", "attack", "spire", "fortress"];

const defined = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
const reliefInput = (r: Relief) => defined({ pattern: r.kind, count: r.count, depth_mm: r.depthMm, from_deg: r.fromDeg, to_deg: r.toDeg, across_from: r.across?.[0], across_to: r.across?.[1] });

function build(e: Entry) {
  const st = e.state;
  // Claude の choose_stone と同じ大きくし方（深さも同じ比で大きくなる）
  const p = e.stoneLongMm ? sizedPreset(e.stone, e.stoneLongMm) : PRESETS.find((x) => x.id === e.stone)!;
  const s = new RingSession({ outlineMm: presetOutline(p), longMm: p.longMm, widthMm: p.widthMm, depthMm: p.depthMm }, () => seedLedger(), () => undefined, () => "");
  const shank = parseToolCall(
    "set_shank",
    defined({
      metal: st.metal,
      section_curve: { points: st.sectionCurve.points },
      width_mm: st.shankWidthMm,
      thickness_mm: st.shankThicknessMm,
      stations: st.shankStations.map((q) => defined({ at_deg: q.atDeg, width_mm: q.widthMm, thickness_mm: q.thicknessMm, section_curve: q.curve ? { points: q.curve.points } : undefined })),
      relief: reliefInput(st.shankRelief),
      relief_more: st.shankReliefMore?.map(reliefInput),
      reason: "見本",
    }),
  );
  if (!shank.ok) throw new Error(`set_shank：${shank.error}`);
  const setting = parseToolCall("set_setting", defined({ prong_count: st.prongCount, prong_mm: st.prongMm, prong_tip: st.prongTip, join: st.join, culet_gap_mm: st.culetGapMm, reason: "見本" }));
  if (!setting.ok) throw new Error(`set_setting：${setting.error}`);
  s.setShank(shank.call.input as SetShankInput);
  s.setSetting(setting.call.input as SetSettingInput);
  return s;
}

describe("ゴシックの見本", () => {
  it.each(ids)(
    "%s：道具の入力だけで作れ、閉じていて、作れない所がなく、内径は変わらない",
    (id) => {
      const s = build(entries[id]);
      const b = s.built!;
      expect(b.problems.map((p) => `${p.check}:${p.where}`)).toEqual([]);
      expect(openEdges(b.ring.shank.positions)).toBe(0);
      let inner = Infinity;
      const pos = b.ring.shank.positions;
      for (let i = 0; i < pos.length; i += 3) inner = Math.min(inner, Math.hypot(pos[i + 1], pos[i + 2]));
      expect(inner * 2).toBeCloseTo(b.ring.shank.innerDiameterMm, 3);
      expect(grooveNote(b.ring.shank)).toBeNull();
    },
    120000,
  );

  it(
    "攻めた案：肩は広く厚く、手のひらの側は細く、石の先は腕に沈む",
    () => {
      const e = entries.attack;
      const s = build(e);
      const r = s.built!.ring;
      const along = r.shank.along!;
      expect(Math.max(...along.map((q) => q.widthMm))).toBeCloseTo(10, 6);
      expect(Math.max(...along.map((q) => q.thicknessMm))).toBeCloseTo(5, 6);
      const low = along[along.length - 1];
      expect(low.widthMm).toBeLessThan(5.5);
      expect(low.thicknessMm).toBeLessThan(2.5);
      // 石座のそばより肩が厚い（横から見て肩が立ち上がる）
      expect(along[0].thicknessMm).toBeLessThan(4);
      expect(r.setting.join).toBe("on");
      expect(r.setting.prongTip).toBe("oni");
      expect(r.culetGapMm).toBeCloseTo(1, 6);
      // 石の先は腕に沈み、腕の上を石の形に削ってある
      expect(r.notchDepthMm).toBeGreaterThan(2);
      expect(e.stoneLongMm).toBe(12);
      expect(r.metalWeightG).toBeLessThan(13);
    },
    120000,
  );

  it("見本の数字は Claude の道具の上限の中（点は 40 個まで、場所は 4 か所まで）", () => {
    for (const id of ids) {
      const st = entries[id].state;
      expect(st.sectionCurve.points.length).toBeLessThanOrEqual(40);
      expect(st.shankStations.length).toBeLessThanOrEqual(4);
    }
  });
});

const presetStone = (id: string) => {
  const p = PRESETS.find((x) => x.id === id)!;
  return { outlineMm: presetOutline(p), longMm: p.longMm, widthMm: p.widthMm, depthMm: p.depthMm };
};

describe("石を腕に沈める（culet_gap_mm）", () => {
  it("道具の入力の範囲を確かめ、石が腕に沈んで、腕の上を削る。閉じた形のまま", () => {
    expect(parseToolCall("set_setting", { culet_gap_mm: 1, reason: "沈める" }).ok).toBe(true);
    expect(parseToolCall("set_setting", { culet_gap_mm: 0.1, reason: "沈める" }).ok).toBe(false);
    expect(parseToolCall("set_setting", { culet_gap_mm: "1", reason: "沈める" }).ok).toBe(false);
    const s = new RingSession(presetStone("oval"), () => seedLedger(), () => undefined, () => "");
    s.setShank({ width_mm: 7, thickness_mm: 4, reason: "太く" });
    s.setSetting({ join: "on", culet_gap_mm: 1, reason: "沈める" });
    const r = s.built!.ring;
    expect(r.culetGapMm).toBeCloseTo(1, 6);
    expect(r.notchDepthMm).toBeGreaterThan(2);
    expect(openEdges(r.shank.positions)).toBe(0);
    // 高さを選び直すと、自動の高さに戻る
    s.setSetting({ height: "standard", reason: "戻す" });
    expect(s.built!.ring.culetGapMm).toBeGreaterThan(2);
  });
});
