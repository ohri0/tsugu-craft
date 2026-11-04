// 石座と腕のつなぎ目：腕の上の座（溝）と、両側の接点のロウの丸み（src/geometry/joint.ts）
import { describe, expect, it } from "vitest";
import { openEdges } from "../src/cad/solid";
import { bandDistance, railInRing } from "../src/geometry/joint";
import { buildRing, type RingParams } from "../src/geometry/ring";
import { meshVolume } from "../src/geometry/stone";
import { triangleStone } from "./helpers/stones";

/** 石川工房の帳面と同じ高さ（石の先〜指 0.94 mm）の、一体の石座の指輪（速い粗い形） */
const params = (o: Partial<RingParams> = {}): RingParams => ({
  stone: triangleStone(),
  setting: { style: "prong", culetGapMm: 0.94, solid: true, solidQuality: "preview" },
  shank: { gou: 11 },
  solder: true,
  ...o,
});

/** 上から見て (x, y) を通る腕の三角形のうち、いちばん高い所の z（腕の上の面） */
function bandTopAt(band: Float32Array, x: number, y: number): number {
  let top = -Infinity;
  for (let t = 0; t < band.length; t += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = band.subarray(t, t + 9);
    if ((x < ax && x < bx && x < cx) || (x > ax && x > bx && x > cx) || (y < ay && y < by && y < cy) || (y > ay && y > by && y > cy)) continue;
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(d) < 1e-12) continue;
    const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d;
    const v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
    if (u < 0 || v < 0 || u + v > 1) continue;
    top = Math.max(top, u * az + v * bz + (1 - u - v) * cz);
  }
  return top;
}

/** どの辺も、向きを逆にした辺とちょうど 1 回ずつ組になっている（閉じた形） */
function pairedEdges(p: Float32Array): boolean {
  const key = (i: number) => `${p[i]},${p[i + 1]},${p[i + 2]}`;
  const count = new Map<string, number>();
  for (let t = 0; t < p.length; t += 9)
    for (let e = 0; e < 3; e++) {
      const k = `${key(t + e * 3)}|${key(t + ((e + 1) % 3) * 3)}`;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  for (const [k, n] of count) {
    const [a, b] = k.split("|");
    if (n !== 1 || count.get(`${b}|${a}`) !== 1) return false;
  }
  return true;
}

describe("石座と腕のつなぎ目（腕の上の座と、両側のロウ）", () => {
  const ring = buildRing(params());
  const rail = railInRing(ring.setting, ring.transform)!;
  const solder = ring.ringPositions.setting.subarray(ring.solder!.triangles.start * 9);

  it("下の輪が腕を横切る 2 か所（腕に沿って前と後ろ）が接点になり、そこにロウの丸みがある", () => {
    expect(ring.solder).not.toBeNull();
    expect(ring.solder!.contacts).toBe(2);
    expect(ring.solder!.filletMm).toBeGreaterThan(0.1);
    expect(solder.length).toBeGreaterThan(0);
    // 前と後ろ（y の正と負）に 1 つずつ
    let front = 0;
    let back = 0;
    for (let i = 1; i < solder.length; i += 3) (solder[i] > 0 ? front++ : back++);
    expect(front).toBeGreaterThan(0);
    expect(back).toBeGreaterThan(0);
  });

  it("腕の上は下の輪の形に削ってあり、輪の下の面と腕の上の面の間にすき間も重なりもない（座）", () => {
    expect(ring.shank.railSeatDepthMm).toBeGreaterThan(0);
    const uncut = bandDistance(ring.shank);
    let checked = 0;
    let worst = 0;
    for (const [x, y, z] of rail.pts) {
      const bottom = z - rail.radiusMm;
      // 削る前の腕が、輪の下の面より上にある所（輪が腕に入りこむ所）だけ
      if (uncut(x, y, bottom) >= -0.02) continue;
      checked++;
      worst = Math.max(worst, Math.abs(bandTopAt(ring.shank.positions, x, y) - bottom));
    }
    expect(checked).toBeGreaterThan(4);
    expect(worst).toBeLessThan(0.01);
  });

  it("ロウの丸みは、輪にも腕にも触れている（どちらの面のそばにも点がある）", () => {
    const band = bandDistance(ring.shank);
    const tube = (x: number, y: number, z: number) => {
      let best = Infinity;
      for (const p of rail.pts) best = Math.min(best, Math.hypot(p[0] - x, p[1] - y, p[2] - z));
      return best - rail.radiusMm;
    };
    let nearRail = 0;
    let nearBand = 0;
    for (let i = 0; i < solder.length; i += 3) {
      const [x, y, z] = [solder[i], solder[i + 1], solder[i + 2]];
      if (Math.abs(tube(x, y, z)) < 0.05) nearRail++;
      if (Math.abs(band(x, y, z)) < 0.05) nearBand++;
    }
    expect(nearRail).toBeGreaterThan(20);
    expect(nearBand).toBeGreaterThan(20);
  });

  it("ロウの丸みも、座を削った腕も、閉じた形（STL に出せる）。石とはすき間を残す", () => {
    expect(openEdges(solder)).toBe(0);
    expect(pairedEdges(solder)).toBe(true);
    expect(meshVolume(solder)).toBeGreaterThan(0);
    expect(openEdges(ring.shank.positions)).toBe(0);
    expect(pairedEdges(ring.shank.positions)).toBe(true);
    // ロウの点は、石の下の面 − すき間 より上に出ない
    let over = 0;
    for (let i = 0; i < solder.length; i += 3) if (solder[i + 2] > ring.seatCut.floorAt(solder[i], solder[i + 1]) + 0.02) over++;
    expect(over).toBe(0);
  });

  it("ロウの丸みは石座の三角形の後ろに足す（爪の三角形の範囲は変わらない）", () => {
    const end = Math.max(...ring.setting.prongs.map((p) => p.triangles.start + p.triangles.count));
    expect(end).toBeLessThanOrEqual(ring.solder!.triangles.start);
    expect(ring.solder!.triangles.start * 9).toBe(ring.setting.positions.length);
  });

  it("覆輪にはロウの丸みを作らない（下の輪がない）", () => {
    const bezel = buildRing(params({ setting: { style: "bezel", culetGapMm: 0.94 } }));
    expect(bezel.solder).toBeNull();
    expect(bezel.shank.railSeatDepthMm).toBe(0);
  });
});
