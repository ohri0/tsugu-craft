// ザグり：石の下側（パビリオン）が腕に入りこむ所を、腕の上から自動で削る（src/geometry/notch.ts）
import { describe, expect, it } from "vitest";
import { openEdges } from "../src/cad/solid";
import { buildRing, rebuildShank, type RingDesign, type RingParams } from "../src/geometry/ring";
import { buildShank } from "../src/geometry/shank";
import { meshVolume } from "../src/geometry/stone";
import { checkShank } from "../src/rules/checks";
import { GUIDES } from "../src/rules/guides";
import { ovalStone, triangleStone } from "./helpers/stones";

const clearance = GUIDES.bezel.clearanceMm;

/** 石が腕に入りこむ指輪：石の先と指のすき間を 0.3 mm にする（腕の厚み 1.6 mm より小さい） */
const deep = (o: Partial<RingParams> = {}): RingParams => ({ stone: triangleStone(), setting: { style: "prong", culetGapMm: 0.3 }, shank: { gou: 11 }, ...o });

/** 同じ肩の腕を、削らずに作る */
const uncutShank = (ring: RingDesign) => rebuildShank({ ...ring, seatCut: { ...ring.seatCut, floorZ: () => Infinity } }, ring.params.shank);

/** 石の面の上に、細かく点を取る（指輪の座標） */
function stonePoints(ring: RingDesign, n = 4): [number, number, number][] {
  const a = ring.ringPositions.stone;
  const out: [number, number, number][] = [];
  // 下側（パビリオン）の三角形だけ：縁の下より低い所
  const girdleBottomZ = ring.transform.translateZ - ring.stone.heights.girdleMm / 2 + 1e-6;
  for (let t = 0; t < a.length; t += 9) {
    if (Math.max(a[t + 2], a[t + 5], a[t + 8]) > girdleBottomZ) continue;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; i + j <= n; j++) {
        const u = i / n;
        const v = j / n;
        const w = 1 - u - v;
        out.push([0, 1, 2].map((c) => w * a[t + c] + u * a[t + 3 + c] + v * a[t + 6 + c]) as [number, number, number]);
      }
    }
  }
  return out;
}

/** 上から見て (x, y) を通る腕の三角形の、その所の z の一覧 */
function bandZs(band: Float32Array, x: number, y: number): number[] {
  const out: number[] = [];
  for (let t = 0; t < band.length; t += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = band.subarray(t, t + 9);
    if ((x < ax && x < bx && x < cx) || (x > ax && x > bx && x > cx) || (y < ay && y < by && y < cy) || (y > ay && y > by && y > cy)) continue;
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(d) < 1e-12) continue;
    const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d;
    const v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
    const w = 1 - u - v;
    if (u < 0 || v < 0 || w < 0) continue;
    out.push(u * az + v * bz + w * cz);
  }
  return out;
}

/** 腕の中にある石の点の数（上へ光を飛ばし、腕の面を奇数回くぐれば中）と、石の点と腕の上の面のいちばん小さい縦のすき間 */
function stoneVsBand(ring: RingDesign, band: Float32Array) {
  // 腕のうち、石の下あたりの三角形だけを使う（速くするため）
  const top: number[] = [];
  const { xMin, xMax, yMin, yMax } = ring.seatCut.box;
  const inBox = (t: number) => [0, 3, 6].some((o) => band[t + o] > xMin - 1 && band[t + o] < xMax + 1 && band[t + o + 1] > yMin - 1 && band[t + o + 1] < yMax + 1);
  for (let t = 0; t < band.length; t += 9) if (band[t + 2] > ring.shank.innerRadiusMm * 0.8 && inBox(t)) for (let c = 0; c < 9; c++) top.push(band[t + c]);
  const near = new Float32Array(top);
  let inside = 0;
  let minGap = Infinity;
  for (const [x, y, z] of stonePoints(ring)) {
    const zs = bandZs(near, x, y);
    if (zs.filter((bz) => bz > z).length % 2 === 1) inside++;
    if (zs.length) minGap = Math.min(minGap, z - Math.max(...zs));
  }
  return { inside, minGap };
}

/** どの辺も、向きを逆にした辺とちょうど 1 回ずつ組になっている（閉じた形） */
function pairedEdges(p: Float32Array): boolean {
  const key = (i: number) => `${p[i]},${p[i + 1]},${p[i + 2]}`;
  const count = new Map<string, number>();
  for (let t = 0; t < p.length; t += 9) {
    for (let e = 0; e < 3; e++) {
      const k = `${key(t + e * 3)}|${key(t + ((e + 1) % 3) * 3)}`;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  }
  for (const [k, n] of count) {
    const [a, b] = k.split("|");
    if (n !== 1 || count.get(`${b}|${a}`) !== 1) return false;
  }
  return true;
}

describe("ザグり（石の先が腕に当たる所を、腕の上から削る）", () => {
  it("削る前は石が腕に入りこみ、削ったあとは石のどの点も腕の中にない（すき間も残る）", () => {
    const ring = buildRing(deep());
    expect(ring.culetGapMm).toBeLessThan(ring.shank.thicknessMm);
    expect(stoneVsBand(ring, uncutShank(ring).positions).inside).toBeGreaterThan(0);
    const after = stoneVsBand(ring, ring.shank.positions);
    expect(after.inside).toBe(0);
    expect(after.minGap).toBeGreaterThanOrEqual(clearance - 1e-4);
  });

  it("深さ ＝ 石の先が腕に入りこむ深さ ＋ すき間", () => {
    for (const p of [deep(), deep({ orientation: "across" }), deep({ stone: ovalStone() }), deep({ setting: { style: "bezel", height: "standard" } })]) {
      const ring = buildRing(p);
      const penetration = ring.shank.outerRadiusMm - (ring.shank.innerRadiusMm + ring.culetGapMm);
      expect(penetration).toBeGreaterThan(0);
      expect(ring.notchDepthMm).toBeCloseTo(penetration + clearance, 3);
      expect(ring.shank.notchDepthMm).toBe(ring.notchDepthMm);
      expect(stoneVsBand(ring, ring.shank.positions).inside).toBe(0);
    }
  });

  it("削っても腕は閉じた形のまま（STL に出せる）。重さは削った分だけ軽い", () => {
    const ring = buildRing(deep());
    expect(openEdges(ring.shank.positions)).toBe(0);
    expect(pairedEdges(ring.shank.positions)).toBe(true);
    expect(meshVolume(ring.shank.positions)).toBeGreaterThan(0);
    const uncut = uncutShank(ring);
    expect(uncut.notchDepthMm).toBe(0);
    expect(ring.shank.volumeMm3).toBeLessThan(uncut.volumeMm3);
  });

  it("石の先が腕の上より上なら、削らない（形は削る前と同じ）", () => {
    const ring = buildRing({ stone: triangleStone(), setting: { style: "prong", height: "high" }, shank: { gou: 11 } });
    expect(ring.culetGapMm).toBeGreaterThan(ring.shank.thicknessMm + clearance);
    expect(ring.notchDepthMm).toBe(0);
    expect(ring.shank.positions).toEqual(uncutShank(ring).positions);
  });

  it("腕の厚み・幅の確かめは、ザグりの所を測らない（わざと削った所なので）", () => {
    const ring = buildRing(deep());
    const plain = buildShank(ring.params.shank);
    expect(ring.shank.thicknessMm).toBe(plain.thicknessMm);
    expect(ring.shank.outlineMm).toEqual(plain.outlineMm);
    expect(checkShank(ring.shank)).toEqual(checkShank(plain));
  });

  it("断面を動かしている間に作り直す腕（rebuildShank）も、同じように削る", () => {
    const ring = buildRing(deep());
    const t0 = performance.now();
    const sh = rebuildShank(ring, { ...ring.params.shank, thicknessMm: 1.9 });
    const ms = performance.now() - t0;
    const penetration = sh.outerRadiusMm - (ring.shank.innerRadiusMm + ring.culetGapMm);
    expect(sh.notchDepthMm).toBeCloseTo(penetration + clearance, 3);
    expect(openEdges(sh.positions)).toBe(0);
    expect(stoneVsBand(ring, sh.positions).inside).toBe(0);
    // 指の動きに遅れない（ゆるい上限。ふだんは数 ms）
    expect(ms).toBeLessThan(200);
  });
});
