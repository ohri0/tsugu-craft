// 一言が、どこまで効くか：よくある一粒石の指輪の設計（石の形 6 × 大きさ 5 × 高さ 3 × 号 3 ＝ 270）を、
// 公開情報の目安だけで組んだときと、今の帳面（職人の決まり入り）で組んだときで比べる。画面に依存しない。
import { PRESETS, presetOutline, type StonePreset } from "./presets";
import { DEFAULT_STATE, RingSession, type RingState } from "./session";
import type { Ledger } from "../rules/ledger";
import type { StoneParams } from "../geometry/stone";
import type { HeightOption } from "../rules/guides";

export interface SweepDesign {
  preset: StonePreset;
  scale: number;
  height: HeightOption;
  gou: number;
  stone: StoneParams;
}

export const SWEEP_SCALES = [0.6, 0.8, 1.0, 1.25, 1.5];
export const SWEEP_HEIGHTS: HeightOption[] = ["low", "standard", "high"];
export const SWEEP_GOU = [7, 11, 15];

export function sweepDesigns(): SweepDesign[] {
  const out: SweepDesign[] = [];
  for (const preset of PRESETS)
    for (const scale of SWEEP_SCALES)
      for (const height of SWEEP_HEIGHTS)
        for (const gou of SWEEP_GOU) {
          const p = { ...preset, longMm: preset.longMm * scale, widthMm: preset.widthMm * scale };
          out.push({ preset, scale, height, gou, stone: { outlineMm: presetOutline(p), longMm: p.longMm, widthMm: p.widthMm, depthMm: preset.depthMm * scale } });
        }
  return out;
}

export interface SweepSide {
  prongMm: number;
  weightG: number;
  problems: number;
}
export interface SweepResult {
  design: SweepDesign;
  before: SweepSide;
  after: SweepSide;
}

/** 爪の太さは帳面の標準から。留まりが足りなければ、画面と同じように少しずつ太くする */
function side(stone: StoneParams, state: RingState, ledger: Ledger): SweepSide {
  const s = new RingSession(stone, () => ledger, () => undefined, () => "");
  s.state = structuredClone(state);
  let b = s.build("比べる");
  for (let i = 0; i < 6 && b.problems.some((p) => p.check === "hold" || p.check === "prong-thin"); i++) {
    const cur = b.ring.setting.prongs[0]?.diameterMm ?? b.ring.setting.standardProngMm;
    s.state.prongMm = Math.ceil(cur * 1.08 * 100) / 100;
    b = s.build("比べる");
  }
  return { prongMm: b.ring.setting.prongs[0]?.diameterMm ?? 0, weightG: b.ring.metalWeightG, problems: b.problems.length };
}

export function sweepOne(d: SweepDesign, publicLedger: Ledger, craftLedger: Ledger): SweepResult {
  const state: RingState = { ...structuredClone(DEFAULT_STATE), height: d.height, gou: d.gou };
  return { design: d, before: side(d.stone, state, publicLedger), after: side(d.stone, state, craftLedger) };
}

export interface SweepSummary {
  total: number;
  /** 爪の太さが変わった設計 */
  changed: number;
  thinner: number;
  thicker: number;
  /** 地金の重さの合計の差（g、軽くなれば負） */
  weightDiffG: number;
  /** 爪の太さの平均（mm） */
  prongBefore: number;
  prongAfter: number;
}

export function summarize(rs: SweepResult[]): SweepSummary {
  const n = rs.length || 1;
  return {
    total: rs.length,
    changed: rs.filter((r) => Math.abs(r.before.prongMm - r.after.prongMm) > 0.01).length,
    thinner: rs.filter((r) => r.after.prongMm < r.before.prongMm - 0.01).length,
    thicker: rs.filter((r) => r.after.prongMm > r.before.prongMm + 0.01).length,
    weightDiffG: rs.reduce((s, r) => s + r.after.weightG - r.before.weightG, 0),
    prongBefore: rs.reduce((s, r) => s + r.before.prongMm, 0) / n,
    prongAfter: rs.reduce((s, r) => s + r.after.prongMm, 0) / n,
  };
}
