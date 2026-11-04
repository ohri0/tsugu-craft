// 石を変えても、手で決めた設計が戻らないこと（2026-11-05 点検：地金・号・断面・高さが全部戻っていた）
import { describe, expect, it } from "vitest";
import { seedLedger } from "../src/rules/ledger";
import { DEFAULT_STATE, RingSession, carryDesign, type RingState } from "../src/studio/session";
import { PRESETS, presetOutline } from "../src/studio/presets";

const stoneOf = (id: string) => {
  const p = PRESETS.find((x) => x.id === id)!;
  return { outlineMm: presetOutline(p), longMm: p.longMm, widthMm: p.widthMm, depthMm: p.depthMm };
};
const session = (id: string) => new RingSession(stoneOf(id), seedLedger, () => undefined, () => "");
const fresh = (): RingState => ({ ...DEFAULT_STATE });

describe("石を変えるときに引き継ぐ物", () => {
  const hand: RingState = {
    ...DEFAULT_STATE,
    style: "bezel",
    height: "high",
    metal: "pt900",
    gou: 15,
    shankSection: "hirauchi",
    shankWidthMm: 2.6,
    shankThicknessMm: 1.8,
    culetGapMm: 1.2,
    prongCount: 6,
    prongMm: 1.1,
    prongPositions: [1, 2, 3],
    collarHeightMm: 1.5,
    collarWallMm: 0.7,
  };

  it("石の形に関係しない設定は引き継ぐ", () => {
    const out = carryDesign(hand, fresh());
    expect(out).toMatchObject({ style: "bezel", height: "high", metal: "pt900", gou: 15, shankSection: "hirauchi", shankWidthMm: 2.6, shankThicknessMm: 1.8, culetGapMm: 1.2 });
  });

  it("手で描いた断面も引き継ぐ（前の設計と同じ物を指さない）", () => {
    const curve = { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }] };
    const out = carryDesign({ ...hand, shankSection: "free", sectionCurve: curve }, fresh());
    expect(out.shankSection).toBe("free");
    expect(out.sectionCurve).toEqual(curve);
    expect(out.sectionCurve).not.toBe(curve);
  });

  it("別の形の石へは、爪の本数・位置・太さと下の輪の寸法を渡さない", () => {
    const out = carryDesign(hand, fresh());
    for (const k of ["prongCount", "prongPositions", "prongMm", "collarHeightMm", "collarWallMm"] as const) expect(out[k]).toBeUndefined();
  });

  it("長辺だけ直したら、爪の本数と位置は渡すが、太さは渡さない", () => {
    const out = carryDesign(hand, fresh(), { shape: true });
    expect(out.prongCount).toBe(6);
    expect(out.prongPositions).toEqual([1, 2, 3]);
    expect(out.prongMm).toBeUndefined();
    expect(out.collarWallMm).toBeUndefined();
  });

  it("深さだけ直したら、爪の太さも下の輪も渡す", () => {
    const out = carryDesign(hand, fresh(), { shape: true, size: true });
    expect(out).toMatchObject({ prongCount: 6, prongMm: 1.1, collarHeightMm: 1.5, collarWallMm: 0.7 });
  });

  it("向きと付け方は、人が選んだ物だけ引き継ぐ", () => {
    const auto = carryDesign({ ...hand, orientation: "across", join: "on" }, fresh());
    expect(auto.orientation).toBe(DEFAULT_STATE.orientation);
    expect(auto.orientationSet).toBeUndefined();
    expect(auto.join).toBe(DEFAULT_STATE.join);
    expect(auto.joinSet).toBeUndefined();

    const chosen = carryDesign({ ...hand, orientation: "across", orientationSet: true, join: "on", joinSet: true }, fresh());
    expect(chosen).toMatchObject({ orientation: "across", orientationSet: true, join: "on", joinSet: true });
  });

  it("石を並べる設定は引き継がない（欄を隠している間は一粒）", () => {
    const out = carryDesign({ ...hand, layout: "trio", stones: [{ atMm: 3, shape: "round", longMm: 3 }], mainAtMm: 1, spreadMm: 0.3 }, fresh());
    expect(out.layout).toBeUndefined();
    expect(out.stones).toBeUndefined();
    expect(out.mainAtMm).toBeUndefined();
    expect(out.spreadMm).toBeUndefined();
  });
});

describe("引き継いだ設計を、新しい石で組む", () => {
  it("地金・号・断面・高さが組んだ指輪に効く", () => {
    const a = session("oval");
    a.setShank({ metal: "pt900", gou: 15, section: "hirauchi", reason: "手で" });
    a.setSetting({ height: "high", reason: "手で" });
    const b = session("round");
    b.state = carryDesign(a.snapshot(), b.state);
    const built = b.build("石を変えた");
    expect(built.ring.shank.section).toBe("hirauchi");
    expect(b.state.metal).toBe("pt900");
    expect(b.state.gou).toBe(15);
    expect(b.state.height).toBe("high");
    expect(built.ring.shank.innerDiameterMm).toBeCloseTo(a.built!.ring.shank.innerDiameterMm, 6);
  });

  it("人が腕の上にのせると選んだら、丸い石へ変えても腕の上のまま", () => {
    const a = session("oval");
    a.setSetting({ join: "on", reason: "手で" });
    const b = session("round");
    b.state = carryDesign(a.snapshot(), b.state);
    expect(b.build("石を変えた").ring.setting.join).toBe("on");
  });
});
