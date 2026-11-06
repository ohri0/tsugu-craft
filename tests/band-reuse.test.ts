// 爪の太さ・先の形だけを変えている間は、腕を作り直さず、前の細かい形の腕（彫りとミルの粒つき）を使う（2026-11-07 作者の声：
// 爪のつまみを動かしている間、腕の彫りが消えて、動画でノイズに見えた）。使い回しても、作り直したときと同じ形になること。
import { describe, expect, it } from "vitest";
import { buildRing, type RingParams } from "../src/geometry/ring";
import { seedLedger } from "../src/rules/ledger";
import { RingSession, type Built } from "../src/studio/session";
import { triangleStone } from "./helpers/stones";

const stone = triangleStone();
const shank: RingParams["shank"] = {
  gou: 11,
  widthMm: 5,
  thicknessMm: 2.6,
  stations: [
    { atDeg: 45, widthMm: 4.2, thicknessMm: 2.3, step: true },
    { atDeg: 180, widthMm: 3, thicknessMm: 1.7 },
  ],
  relief: { kind: "fan", count: 1, depthMm: 0.3, fromDeg: 47, toDeg: 70, across: [0, 0.4] },
};
const params = (over: Partial<RingParams["setting"]> = {}): RingParams => ({
  stone,
  orientation: "across",
  setting: { style: "prong", height: "standard", join: "on", prongDiameterMm: 1.4, ...over },
  shank,
  finish: { milgrain: "edges" },
});
const same = (a: Float32Array, b: Float32Array) => a.length === b.length && a.every((v, i) => v === b[i]);

describe("腕の使い回し（形）", () => {
  it("材料が同じなら、前の腕（粒の前）を使い、粒は打ち直す。作り直したのと同じ形", () => {
    const first = buildRing(params());
    const again = buildRing({ ...params(), reuseShankOf: first });
    expect(again.shankReused).toBeFalsy();
    expect(again.shankBase).toBe(first.shankBase);
    expect(same(again.shank.positions, first.shank.positions)).toBe(true);
    expect(again.metalWeightG).toBeCloseTo(first.metalWeightG, 9);
    expect(again.milgrain?.count).toBe(first.milgrain?.count);
  }, 120000);

  it("すぐの形（preview）で爪だけ変えたときは、前の腕を彫りと粒ごと使う", () => {
    const first = buildRing(params());
    const quick = buildRing({ ...params({ prongDiameterMm: 0.9, solidQuality: "preview" }), shank: { ...shank, relief: { ...shank.relief!, draft: true } }, reuseShankOf: first });
    expect(quick.shank).toBe(first.shank);
    expect(quick.milgrain?.count).toBe(first.milgrain?.count);
    expect(quick.setting.prongs[0].diameterMm).toBeCloseTo(0.9, 6);
  }, 120000);

  it("細かい形では、材料がちがえば使い回さず、作り直したのと同じ形にする", () => {
    const first = buildRing(params());
    const next = buildRing({ ...params({ prongDiameterMm: 0.9 }), reuseShankOf: first });
    const fresh = buildRing(params({ prongDiameterMm: 0.9 }));
    expect(next.shankReused).toBeFalsy();
    expect(same(next.shank.positions, fresh.shank.positions)).toBe(true);
  }, 120000);

  it("向き・付け方がちがえば、すぐの形でも使わない", () => {
    const first = buildRing(params());
    const other = buildRing({ ...params({ join: "between", solidQuality: "preview" }), reuseShankOf: first });
    expect(other.shankReused).toBeFalsy();
    expect(other.shank).not.toBe(first.shank);
  }, 120000);
});

describe("腕の使い回し（設計の場）", () => {
  type Compose = { compose: (q: "preview" | "final", solid: boolean) => Built };
  const session = () => {
    const s = new RingSession(stone, () => seedLedger(), () => {}, () => "");
    s.state = { ...s.state, orientation: "across", orientationSet: true, join: "on", joinSet: true, shankWidthMm: 5, shankThicknessMm: 2.6, shankStations: [...(shank.stations ?? [])], shankRelief: shank.relief, finish: { milgrain: "edges" } };
    return s;
  };

  it("爪の太さを変えたすぐの形は、最後の細かい形の彫った腕のまま（彫りが消えない）", () => {
    const s = session();
    const c = s as unknown as Compose;
    const fin = c.compose("final", false);
    s.state.prongMm = 0.9;
    const quick = c.compose("preview", false);
    expect(quick.ring.params.shank.relief?.draft).toBe(true);
    expect(quick.ring.shankReused).toBe(true);
    expect(quick.ring.shank).toBe(fin.ring.shank);
    expect(quick.ring.setting.prongs[0].diameterMm).toBeCloseTo(0.9, 6);
  }, 120000);

  it("腕の数を変えたすぐの形は、使い回さない（今までどおり、彫りを省いて速く）", () => {
    const s = session();
    const c = s as unknown as Compose;
    c.compose("final", false);
    s.state.shankWidthMm = 4.6;
    const quick = c.compose("preview", false);
    expect(quick.ring.shankReused).toBeFalsy();
    expect(quick.ring.shank.widthMm).toBeCloseTo(4.6, 6);
  }, 120000);
});
