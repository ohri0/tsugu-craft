// 今の設計をタブの間だけ残す（2026-11-05 点検：読み直し・帳面へ行って戻ると設計が消えていた）
import { describe, expect, it } from "vitest";
import { clearDesign, introSeen, loadDesign, loadImportedPhotoUrl, loadPhotoUrl, markIntroSeen, saveDesign, saveImportedPhoto, savePhoto, type KeptDesign } from "../src/studio/keep-design";
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

describe("取り込んだ石も残す（よくある形を押しても消えない）", () => {
  const withImported = (): KeptDesign => ({ ...design(), stoneKey: "round", imported: { ...design().stone, label: "私の石.jpg", shapeName: "エメラルド", depthMm: 4.1 } });

  it("今の石がよくある形でも、取り込んだ石と札がそのまま読める", () => {
    const box = memory();
    saveDesign(box, withImported());
    const d = loadDesign(box)!;
    expect(d.stoneKey).toBe("round");
    expect(d.imported?.label).toBe("私の石.jpg");
    expect(d.imported?.depthMm).toBe(4.1);
  });

  it("取り込んだ石の写真は別に残し、消すときはいっしょに消える。入らなければ写真だけなし", () => {
    const box = memory();
    expect(saveImportedPhoto(box, "data:取り込んだ石")).toBe(true);
    expect(savePhoto(box, "data:今の石")).toBe(true);
    expect(loadImportedPhotoUrl(box)).toBe("data:取り込んだ石");
    expect(loadPhotoUrl(box)).toBe("data:今の石");
    clearDesign(box);
    expect(loadImportedPhotoUrl(box)).toBe("");
    const small = memory(10);
    small.m.set("tsugu.studio.importedPhoto.v1", "古い");
    expect(saveImportedPhoto(small, "x".repeat(20))).toBe(false);
    expect(loadImportedPhotoUrl(small)).toBe("");
  });

  it("取り込んだ石が壊れていたら、それだけ外して設計は戻す", () => {
    const box = memory();
    const d = withImported();
    d.imported!.measured.longMm = -1;
    saveDesign(box, d);
    const back = loadDesign(box)!;
    expect(back.imported).toBeUndefined();
    expect(back.stoneKey).toBe("round");
  });

  it("前に残した設計（札の記録がない）も読める", () => {
    const box = memory();
    saveDesign(box, design());
    expect(loadDesign(box)!.stoneKey).toBeUndefined();
    expect(loadDesign(box)!.imported).toBeUndefined();
  });
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
