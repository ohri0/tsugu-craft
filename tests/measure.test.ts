// 自分で引く寸法（作者の声 2026-11-06：ここからここみたいな寸法を知りたいときに、自分で線を引けると優しい）。
import { describe, expect, it } from "vitest";
import { buildRing } from "../src/geometry/ring";
import type { Project, V3 } from "../src/studio/dims";
import { extremePoints, highestPoint, MeasureList, measureDim, measureLabel, measureMm, pickSnap, planeEnd, ringFeatures, triangleSnaps, type SnapPoint } from "../src/studio/measure";
import { presetOutline, PRESETS } from "../src/studio/presets";

/** 手で作った写し方：1 mm ＝ 10 px、x が右、z が上（正面の図のような） */
const project: Project = (x, _y, z) => ({ x: x * 10, y: -z * 10 });

describe("距離", () => {
  const a: V3 = [0, 0, 0];
  const b: V3 = [3, 4, 12];
  it("斜めは実の距離", () => {
    expect(measureMm(a, b)).toBeCloseTo(13, 9);
  });
  it("正面（y の向きから見る）は、x と z の面に沿った距離", () => {
    expect(measureMm(a, b, [0, -1, 0])).toBeCloseTo(Math.hypot(3, 12), 9);
  });
  it("横（x の向きから見る）は、y と z の面に沿った距離", () => {
    expect(measureMm(a, b, [1, 0, 0])).toBeCloseTo(Math.hypot(4, 12), 9);
  });
  it("上（z の向きから見る）は、x と y の面に沿った距離", () => {
    expect(measureMm(a, b, [0, 0, 1])).toBeCloseTo(5, 9);
  });
  it("見る向きの長さは数えない（向きの大きさにはよらない）", () => {
    expect(measureMm([1, 2, 3], [1, 9, 3], [0, -2, 0])).toBeCloseTo(0, 9);
  });
  it("線の端は面の上に下りる", () => {
    expect(planeEnd(a, b, [0, -1, 0])).toEqual([3, 0, 12]);
    expect(planeEnd(a, b)).toBe(b);
  });
  it("札の字：数字は mm で小数 2 桁、どの面かが書いてある", () => {
    expect(measureLabel({ a, b })).toBe("13.00 mm（実の距離）");
    expect(measureLabel({ a, b, plane: { dir: [0, 0, 1], name: "上" } })).toBe("5.00 mm（上）");
  });
  it("寸法の線は、面に沿って描く", () => {
    const d = measureDim({ id: 7, a, b, plane: { dir: [0, 0, 1], name: "上" } });
    expect(d.key).toBe("m7");
    expect(d.b).toEqual([3, 4, 0]);
    expect(d.label).toContain("5.00 mm");
  });
});

describe("吸いつく点", () => {
  const tri: [V3, V3, V3] = [[0, 0, 0], [2, 0, 0], [0, 0, 2]];
  it("三角形の頂点 3 つと辺の中点 3 つが候補", () => {
    const c = triangleSnaps(tri);
    expect(c.filter((x) => x.kind === "vertex").map((x) => x.p)).toEqual(tri);
    expect(c.filter((x) => x.kind === "mid").map((x) => x.p)).toEqual([[1, 0, 0], [1, 0, 1], [0, 0, 1]]);
  });
  it("近い頂点へ吸いつく", () => {
    const s = pickSnap([...triangleSnaps(tri), { p: [0.3, 0, 0.3], kind: "surface" }], { x: 18, y: -1 }, project, 8);
    expect(s?.p).toEqual([2, 0, 0]);
  });
  it("近い辺の中点へ吸いつく", () => {
    const s = pickSnap([...triangleSnaps(tri), { p: [0.3, 0, 0.3], kind: "surface" }], { x: 9, y: -1 }, project, 6);
    expect(s?.kind).toBe("mid");
    expect(s?.p).toEqual([1, 0, 0]);
  });
  it("名前のある点を、頂点より先に選ぶ", () => {
    const f: SnapPoint = { p: [2.3, 0, 0], kind: "feature", name: "爪の先" };
    const s = pickSnap([...triangleSnaps(tri), f], { x: 20, y: 0 }, project, 8);
    expect(s?.name).toBe("爪の先");
  });
  it("どれも遠ければ、面の上の点", () => {
    const surf: SnapPoint = { p: [5, 0, 5], kind: "surface" };
    expect(pickSnap([...triangleSnaps(tri), surf], { x: 50, y: -50 }, project, 8)).toBe(surf);
  });
  it("何もなければ null（何もない所を押した）", () => {
    expect(pickSnap(triangleSnaps(tri), { x: 500, y: 500 }, project, 8)).toBeNull();
  });
  it("カメラの後ろの点は選ばない", () => {
    const f: SnapPoint = { p: [0, 0, 0], kind: "feature" };
    expect(pickSnap([f], { x: 0, y: 0 }, () => null, 8)).toBeNull();
  });
  it("形のいちばん外の 6 点（z に置いた高さを足す）", () => {
    const pos = [0, 0, 0, 2, 1, 5, -3, 4, 1];
    const e = extremePoints(pos, 10);
    expect(e).toContainEqual([-3, 4, 11]);
    expect(e).toContainEqual([2, 1, 15]);
    expect(e).toContainEqual([0, 0, 10]);
  });
  it("三角形の範囲の中でいちばん高い点", () => {
    const pos = new Float32Array([0, 0, 1, 1, 0, 2, 0, 1, 3, 0, 0, 9, 1, 0, 9, 0, 1, 9]);
    expect(highestPoint(pos, 0, 1, 1)).toEqual([0, 1, 4]);
    expect(highestPoint(pos, 1, 1)?.[2]).toBe(9);
    expect(highestPoint(pos, 0, 0)).toBeNull();
  });
  it("指輪の名前のある点：爪の先は爪の数だけ、石の先は石の上面より下", () => {
    const p = PRESETS.find((x) => x.id === "round")!;
    const ring = buildRing({ stone: { outlineMm: presetOutline(p), longMm: p.longMm, widthMm: p.widthMm, depthMm: p.depthMm }, setting: { style: "prong", vAtCorners: false }, shank: { gou: 11, widthMm: 1.8 } });
    const f = ringFeatures(ring);
    expect(f.filter((x) => x.name === "爪の先")).toHaveLength(ring.setting.prongs.length);
    const z = (n: string) => f.find((x) => x.name === n)!.p[2];
    expect(z("石の先")).toBeLessThan(z("石の上面"));
    // 石の先と指の上の差が、確かめに使う「石の先〜指」と同じ
    expect(z("石の先") - z("指の上")).toBeCloseTo(ring.culetGapMm, 5);
    // 覆輪には爪がない
    const b = buildRing({ stone: ring.params.stone, setting: { style: "bezel" }, shank: { gou: 11, widthMm: 1.8 } });
    expect(ringFeatures(b).filter((x) => x.name === "爪の先")).toHaveLength(0);
  });
});

describe("引いた寸法の並び", () => {
  const A: V3 = [0, 0, 0];
  const B: V3 = [1, 0, 0];
  it("何本も引ける。最後に引いた線が選ばれる", () => {
    const l = new MeasureList();
    const m1 = l.add(A, B, undefined, "形1");
    const m2 = l.add(A, [0, 2, 0], undefined, "形1");
    expect(l.items).toHaveLength(2);
    expect(m1.id).not.toBe(m2.id);
    expect(l.selected).toBe(m2.id);
  });
  it("選んで消せる・全部消せる", () => {
    const l = new MeasureList();
    const m1 = l.add(A, B, undefined, "形1");
    const m2 = l.add(A, B, undefined, "形1");
    l.remove(m2.id);
    expect(l.items.map((m) => m.id)).toEqual([m1.id]);
    expect(l.selected).toBeNull();
    expect(l.clear()).toBe(1);
    expect(l.items).toHaveLength(0);
  });
  it("形が変わったら全部消して、何本消えたかを返す。同じ形なら残す", () => {
    const l = new MeasureList();
    l.add(A, B, undefined, "形1");
    l.add(A, B, undefined, "形1");
    expect(l.syncShape("形1")).toBe(0);
    expect(l.items).toHaveLength(2);
    expect(l.syncShape("形2")).toBe(2);
    expect(l.items).toHaveLength(0);
    // 線がなければ、知らせることもない
    expect(l.syncShape("形3")).toBe(0);
  });
  it("名前を残す。名前がなければ入れない", () => {
    const l = new MeasureList();
    expect(l.add(A, B, undefined, "形1", { a: "爪の先" })).toMatchObject({ nameA: "爪の先" });
    expect(l.add(A, B, undefined, "形1").nameA).toBeUndefined();
  });
});
