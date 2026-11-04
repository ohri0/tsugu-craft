// 今の設計をタブの間だけ残す（2026-11-05 点検：読み直し・帳面へ行って戻ると設計が消えていた）
import { describe, expect, it } from "vitest";
import { clearDesign, introSeen, loadDesign, loadPhotoUrl, markIntroSeen, saveDesign, savePhoto, type KeptDesign } from "../src/studio/keep-design";
import { DEFAULT_STATE } from "../src/studio/session";

function memory(limit = Infinity) {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (v.length > limit) throw new Error("入りません");
      m.set(k, v);
    },
    removeItem: (k: string) => void m.delete(k),
  };
}

const design = (): KeptDesign => ({
  kind: "solitaire",
  mode: "refine",
  presetId: "round",
  stone: {
    label: "ラウンドの石",
    depthMm: 3.9,
    shapeName: "丸",
    cornerIdx: [],
    measured: { outlineMm: [{ x: 3, y: 0 }, { x: 0, y: 3 }, { x: -3, y: 0 }], longMm: 6.5, widthMm: 6.5, widthFromPhotoMm: 6.5, widthFromPhoto: true, mmPerPx: 0.02, imageAngle: 0 },
    outlinePx: [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }],
    color: { r: 200, g: 200, b: 200 },
    colorless: true,
    photoWidth: 720,
    photoHeight: 720,
  },
  state: { ...DEFAULT_STATE, metal: "pt900", gou: 15, height: "high", shankSection: "hirauchi" },
  band: { gou: 12, kind: "kouman", top: { width: 4, thickness: 1.6 }, bottom: { width: 3.2, thickness: 1.4 }, density: 15.6, metalLabel: "K18 イエロー" },
  bandMetal: "k18yg",
});

describe("今の設計をタブの間だけ残す", () => {
  it("残した設計をそのまま読める", () => {
    const box = memory();
    expect(saveDesign(box, design())).toBe(true);
    expect(loadDesign(box)).toEqual(design());
  });

  it("何も残っていなければ null", () => {
    expect(loadDesign(memory())).toBeNull();
  });

  it("壊れた中身や、形のちがう中身は読まない", () => {
    const box = memory();
    box.setItem("tsugu.studio.design.v1", "{こわれた");
    expect(loadDesign(box)).toBeNull();
    box.setItem("tsugu.studio.design.v1", JSON.stringify({ kind: "solitaire", stone: {} }));
    expect(loadDesign(box)).toBeNull();
    const d = design();
    d.stone.measured.longMm = -5;
    saveDesign(box, d);
    expect(loadDesign(box)).toBeNull();
  });

  it("入れ物に入らなくても止まらない。写真が入らなければ前の写真も消す", () => {
    const box = memory(100);
    expect(saveDesign(box, design())).toBe(false);
    box.m.set("tsugu.studio.photo.v1", "古い写真");
    expect(savePhoto(box, "x".repeat(200))).toBe(false);
    expect(loadPhotoUrl(box)).toBe("");
  });

  it("はじめの設計に戻すと設計と写真は消えるが、見せ場を見たことは残る", () => {
    const box = memory();
    saveDesign(box, design());
    savePhoto(box, "data:image/jpeg;base64,xx");
    markIntroSeen(box);
    clearDesign(box);
    expect(loadDesign(box)).toBeNull();
    expect(loadPhotoUrl(box)).toBe("");
    expect(introSeen(box)).toBe(true);
  });

  it("見せ場は、見るまでは見ていない", () => {
    const box = memory();
    expect(introSeen(box)).toBe(false);
    markIntroSeen(box);
    expect(introSeen(box)).toBe(true);
  });
});
