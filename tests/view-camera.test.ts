import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { gridSpacing, labelStep, ViewCameras } from "../src/ui/view-camera";
import { flatDims, type Dim } from "../src/studio/dims";

describe("方眼の線の間", () => {
  it("1・2・5 の並びから、細い線の間が 9 px 以上になるいちばん細かいもの", () => {
    expect(gridSpacing(40)).toEqual({ minor: 0.5, major: 5 });
    expect(gridSpacing(10)).toEqual({ minor: 1, major: 10 });
    expect(gridSpacing(5)).toEqual({ minor: 2, major: 10 });
    expect(gridSpacing(2)).toEqual({ minor: 5, major: 50 });
    expect(gridSpacing(0.5)).toEqual({ minor: 20, major: 100 });
  });
  it("細い線の間は、いつも 9 px 以上", () => {
    for (const ppm of [0.3, 1, 3.3, 7, 12, 55, 200]) expect(gridSpacing(ppm).minor * ppm).toBeGreaterThanOrEqual(9);
  });
  it("目盛りの数字は、間が 46 px 以上", () => {
    expect(labelStep(5, 40)).toBe(5);
    expect(labelStep(10, 3)).toBe(20);
  });
});

describe("斜めと平らな図のカメラ", () => {
  const setup = () => {
    const c = new ViewCameras();
    c.setAspect(1.5);
    const target = new THREE.Vector3(0, 0, 10);
    c.frame(target, 12, 1, new THREE.Vector3(0.9, -1.1, 0.75));
    return { c, target };
  };
  it("はじめは斜め（パースのあるカメラ）", () => {
    const { c } = setup();
    expect(c.flat).toBe(false);
    expect(c.active).toBeInstanceOf(THREE.PerspectiveCamera);
    expect(c.pxPerMm(800)).toBeNull();
  });
  it("正面・横・上は、正射のカメラ。見る向きはまっすぐ", () => {
    const { c, target } = setup();
    for (const [v, dir] of [["front", [0, -1, 0]], ["side", [1, 0, 0]], ["top", [0, 0, 1]]] as const) {
      const cam = c.setView(v, target);
      expect(cam).toBeInstanceOf(THREE.OrthographicCamera);
      const d = cam.position.clone().sub(target).normalize();
      expect(d.x).toBeCloseTo(dir[0], 3);
      expect(d.y).toBeCloseTo(dir[1], 3);
      expect(d.z).toBeCloseTo(dir[2], 3);
    }
  });
  it("平らな図にしても、見ている所の大きさは変わらない（斜めの見ている所の高さ）", () => {
    const { c, target } = setup();
    const half = c.persp.position.distanceTo(target) * Math.tan((15 * Math.PI) / 180);
    c.setView("front", target);
    expect(c.pxPerMm(800)).toBeCloseTo(800 / (2 * half), 6);
    // 寄ると（zoom）、1 mm の px も大きくなる
    c.ortho.zoom = 2;
    expect(c.pxPerMm(800)).toBeCloseTo((2 * 800) / (2 * half), 6);
  });
  it("斜めに戻すと、前の斜めの視点と見ている所に戻る", () => {
    const { c, target } = setup();
    const pos = c.persp.position.clone();
    const t0 = target.clone();
    c.setView("front", target);
    // 平らな図の間に動かした（見ている所が動いた）
    target.add(new THREE.Vector3(3, 0, 2));
    c.setView("side", target);
    c.setView("top", target);
    const cam = c.setView("angle", target);
    expect(cam).toBeInstanceOf(THREE.PerspectiveCamera);
    expect(cam.position.distanceTo(pos)).toBeLessThan(1e-9);
    expect(target.distanceTo(t0)).toBeLessThan(1e-9);
  });
  it("斜めのまま斜めを押すと、決まった斜めの向きに（距離はそのまま）", () => {
    const { c, target } = setup();
    const r = c.persp.position.distanceTo(target);
    c.setView("angle", target);
    expect(c.persp.position.distanceTo(target)).toBeCloseTo(r, 9);
    const d = c.persp.position.clone().sub(target).normalize();
    expect(d.x).toBeCloseTo(0.6 / Math.hypot(0.6, 0.8, 0.6), 6);
  });
  it("平らな図の間に寄せ直すと、戻ったときの斜めの視点も新しい形に合う", () => {
    const { c, target } = setup();
    c.setView("front", target);
    const center = new THREE.Vector3(1, 2, 3);
    c.frame(center, 5, 1, c.angleDir(target));
    target.copy(center);
    c.setView("angle", target);
    expect(c.persp.position.distanceTo(center)).toBeCloseTo(5 * 3.6, 6);
  });
  it("覚えた状態に戻せる（look の道具が別の向きの画像を撮った後）", () => {
    const { c, target } = setup();
    c.setView("side", target);
    const s = c.state(target);
    c.setView("angle", target);
    c.setView("top", target);
    c.restore(s, target);
    expect(c.view).toBe("side");
    expect(c.active).toBeInstanceOf(THREE.OrthographicCamera);
  });
});

describe("平らな図の寸法", () => {
  const box = { min: [-3, -10, 0] as [number, number, number], max: [3, 10, 24] as [number, number, number] };
  const front = { dir: [0, -1, 0] as [number, number, number], right: [1, 0, 0] as [number, number, number], up: [0, 0, 1] as [number, number, number], mmPerPx: 0.05, box };
  const side = { dir: [1, 0, 0] as [number, number, number], right: [0, 1, 0] as [number, number, number], up: [0, 0, 1] as [number, number, number], mmPerPx: 0.05, box };
  const dims: Dim[] = [
    { a: [0, -8, 10], b: [0, 8, 10], label: "内径 ø16.0", key: "inner" },
    { a: [-4, 0, 22], b: [4, 0, 22], label: "石 8.00", key: "stone" },
    { a: [0, 0, 18], b: [0, 0, 19], label: "石の先〜指 1.00", key: "culet" },
    { a: [0, -6, 18], b: [0, -6, 23], label: "指から上 5.00", key: "height" },
  ];
  it("見る向きに沿った寸法は出さない。内径は輪が丸く見える図（横）だけ", () => {
    expect(flatDims(dims, front).map((d) => d.key)).toEqual(["stone", "culet", "height"]);
    expect(flatDims(dims, side).map((d) => d.key)).toEqual(["inner", "culet", "height"]);
  });
  it("数字はそのまま。引き出し線は画面の面の中で、形の外まで", () => {
    const out = flatDims(dims, side);
    const inner = out.find((d) => d.key === "inner")!;
    expect(inner.ext).toBeUndefined();
    expect(inner.label).toBe("内径 ø16.0");
    const h = out.find((d) => d.key === "height")!;
    // 左（-y）にある寸法は、左の形の外（y < -10）へ
    expect(h.ext![0]).toBe(0);
    expect(h.ext![2]).toBe(0);
    expect(h.a[1] + h.ext![1]).toBeLessThan(-10);
    // まん中の寸法は、右（+y）の外へ
    const c = out.find((d) => d.key === "culet")!;
    expect(c.a[1] + c.ext![1]).toBeGreaterThan(10);
  });
  it("同じ側に並ぶ寸法は、順に外へ", () => {
    const out = flatDims(dims, front);
    const c = out.find((d) => d.key === "culet")!;
    const h = out.find((d) => d.key === "height")!;
    // 正面の図では、どちらも右（+x）へ。後のものほど外
    expect(c.ext![0]).toBeGreaterThan(0);
    expect(h.a[0] + h.ext![0]).toBeGreaterThan(c.a[0] + c.ext![0]);
  });
});
