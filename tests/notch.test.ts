// ザグり：石の下側（パビリオン）が腕に入りこむ所を、腕の上から自動で削る（src/geometry/notch.ts）
import { describe, expect, it } from "vitest";
import { openEdges } from "../src/cad/solid";
import { buildRing, rebuildShank, type RingDesign, type RingParams } from "../src/geometry/ring";
import { buildShank } from "../src/geometry/shank";
import { railInRing, railSeatZ } from "../src/geometry/joint";
import { meshVolume } from "../src/geometry/stone";
import { checkShank } from "../src/rules/checks";
import { GUIDES } from "../src/rules/guides";
import { ovalStone, triangleStone } from "./helpers/stones";

const clearance = GUIDES.bezel.clearanceMm;

/** 石が腕に入りこむ指輪：石の先と指のすき間を 0.3 mm にする（腕の厚み 1.6 mm より小さい） */
const deep = (o: Partial<RingParams> = {}): RingParams => ({ stone: triangleStone(), setting: { style: "prong", culetGapMm: 0.3 }, shank: { gou: 11 }, ...o });

/** 同じ肩の腕を、削らずに作る */
const uncutShank = (ring: RingDesign) => rebuildShank({ ...ring, seatCut: { ...ring.seatCut, floorZ: () => Infinity, floorAt: () => Infinity } }, ring.params.shank);

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

/** 上から見て (x, y) を通る腕の三角形の、その所の z の一覧（三角形は上から見た 0.25 mm の升目に分けておく） */
function bandIndex(band: Float32Array) {
  const cell = 0.25;
  const grid = new Map<string, number[]>();
  for (let t = 0; t < band.length; t += 9) {
    const xs = [band[t], band[t + 3], band[t + 6]];
    const ys = [band[t + 1], band[t + 4], band[t + 7]];
    for (let i = Math.floor(Math.min(...xs) / cell); i <= Math.floor(Math.max(...xs) / cell); i++)
      for (let j = Math.floor(Math.min(...ys) / cell); j <= Math.floor(Math.max(...ys) / cell); j++) {
        const k = `${i},${j}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k)!.push(t);
      }
  }
  return (x: number, y: number): number[] => {
    const out: number[] = [];
    for (const t of grid.get(`${Math.floor(x / cell)},${Math.floor(y / cell)}`) ?? []) {
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = band.subarray(t, t + 9);
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(d) < 1e-12) continue;
      const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d;
      const v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
      const w = 1 - u - v;
      if (u < 0 || v < 0 || w < 0) continue;
      out.push(u * az + v * bz + w * cz);
    }
    return out;
  };
}

/** 腕の中にある石の点の数（上へ光を飛ばし、腕の面を奇数回くぐれば中）と、石の点と腕の上の面のいちばん小さい縦のすき間 */
function stoneVsBand(ring: RingDesign, band: Float32Array) {
  // 腕のうち、石の下あたりの三角形だけを使う（速くするため）
  const top: number[] = [];
  const { xMin, xMax, yMin, yMax } = ring.seatCut.box;
  const inBox = (t: number) => [0, 3, 6].some((o) => band[t + o] > xMin - 1 && band[t + o] < xMax + 1 && band[t + o + 1] > yMin - 1 && band[t + o + 1] < yMax + 1);
  for (let t = 0; t < band.length; t += 9) if (band[t + 2] > ring.shank.innerRadiusMm * 0.8 && inBox(t)) for (let c = 0; c < 9; c++) top.push(band[t + c]);
  const zsAt = bandIndex(new Float32Array(top));
  let inside = 0;
  let minGap = Infinity;
  for (const [x, y, z] of stonePoints(ring)) {
    const zs = zsAt(x, y);
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

  it("石の先が腕の上より上なら、削らない（くぼみがなく、腕は削る前と同じ形）", () => {
    const ring = buildRing({ stone: triangleStone(), setting: { style: "prong", height: "high" }, shank: { gou: 11 } });
    expect(ring.culetGapMm).toBeGreaterThan(ring.shank.thicknessMm + clearance);
    expect(ring.notchDepthMm).toBe(0);
    expect(ring.shank.notchBall).toBeNull();
    // 同じ肩・同じ座（石座の下の輪の溝）で、ザグりなしに作った腕と、点がすべて同じ
    const same = buildShank({ ...ring.params.shank, head: ring.shank.head ?? undefined }, undefined, { rail: railInRing(ring.setting, ring.transform) });
    const a = ring.shank.positions;
    const b = same.positions;
    expect(a.length).toBe(b.length);
    expect(a.every((v, i) => v === b[i])).toBe(true);
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

  describe("球のビットの丸いくぼみ（作者の頼み：石の先のまわりだけ、球のビットで）", () => {
    // 石川工房の帳面と同じ高さ：石の先〜指 0.94 mm → 深さ 0.70 mm
    const ring = buildRing(deep({ setting: { style: "prong", culetGapMm: 0.94 } }));
    const R = ring.shank.notchBallDiameterMm / 2;
    const cx = ring.seatCut.culetX;
    const cy = ring.seatCut.culetY;
    const bottom = ring.shank.outerRadiusMm - ring.notchDepthMm;
    const p = ring.shank.positions;
    /** 球の面の上にある点か（くぼみの中の点） */
    const onBall = (i: number) => {
      const r2 = (p[i] - cx) ** 2 + (p[i + 1] - cy) ** 2;
      return r2 < R * R && Math.abs(p[i + 2] - (bottom + R - Math.sqrt(R * R - r2))) < 1e-4;
    };
    // 石座の下の輪の座（溝、joint.ts）は、わざと角のある溝なので、輪の下とそのまわり 0.15 mm の点は除く
    const rail = railInRing(ring.setting, ring.transform)!;
    const underRail = railSeatZ({ pts: rail.pts, radiusMm: rail.radiusMm + 0.15 });
    /** くぼみの縁のまわり（球の中心から、上から見て球の半径 ＋ 0.2 mm 以内）の、腕の上の三角形（座の所は除く） */
    const nearCut: number[] = [];
    for (let t = 0; t < p.length; t += 9) {
      if ([0, 3, 6].every((o) => Math.hypot(p[t + o] - cx, p[t + o + 1] - cy) < R + 0.2 && p[t + o + 2] > ring.shank.innerRadiusMm + 0.5 && underRail(p[t + o], p[t + o + 1]) === Infinity)) nearCut.push(t);
    }

    it("深さ 0.70 mm。球はくぼみの深さより大きく、石の先のまわりだけ（直径は石の縁の幅より十分小さい）", () => {
      expect(ring.notchDepthMm).toBeCloseTo(0.7, 2);
      expect(R).toBeGreaterThan(ring.notchDepthMm);
      expect(2 * R).toBeLessThan(ring.stone.heights.girdleMm + 3);
      expect(2 * R).toBeLessThan((ring.seatCut.box.xMax - ring.seatCut.box.xMin) / 2);
      // くぼみの底（石の先の真下）に、ちょうど点がある
      let lowest = Infinity;
      for (let i = 0; i < p.length; i += 3) if (p[i + 2] > ring.shank.innerRadiusMm + 0.1 && Math.hypot(p[i] - cx, p[i + 1] - cy) < 1e-6) lowest = Math.min(lowest, p[i + 2]);
      expect(lowest).toBeCloseTo(bottom, 5);
    });

    it("縁のまわりの三角形は細かい（どの辺も 0.15 mm 以下。長い細い三角形がない）", () => {
      expect(nearCut.length).toBeGreaterThan(500);
      let longest = 0;
      for (const t of nearCut) for (let e = 0; e < 3; e++) {
        const a = t + e * 3;
        const b = t + ((e + 1) % 3) * 3;
        longest = Math.max(longest, Math.hypot(p[a] - p[b], p[a + 1] - p[b + 1], p[a + 2] - p[b + 2]));
      }
      expect(longest).toBeLessThan(0.15);
    });

    it("くぼみの中の面は球に沿ってなめらか（面の向きが球の向きと 3° 以内）。縁も、となりの面と 40° より大きく折れない（光の筋が出ない）", () => {
      let inside = 0;
      let worst = 0;
      const normal = (t: number) => {
        const u = [p[t + 3] - p[t], p[t + 4] - p[t + 1], p[t + 5] - p[t + 2]];
        const v = [p[t + 6] - p[t], p[t + 7] - p[t + 1], p[t + 8] - p[t + 2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const l = Math.hypot(n[0], n[1], n[2]);
        return n.map((x) => x / l);
      };
      for (const t of nearCut) {
        if (![0, 3, 6].every((o) => onBall(t + o))) continue;
        inside++;
        const n = normal(t);
        const m = [0, 1, 2].map((c) => (p[t + c] + p[t + 3 + c] + p[t + 6 + c]) / 3);
        // 球の真ん中へ向かう向き（外向きの面は、球の真ん中の側を向く）
        const toC = [cx - m[0], cy - m[1], bottom + R - m[2]];
        const l = Math.hypot(toC[0], toC[1], toC[2]);
        const cos = Math.abs((n[0] * toC[0] + n[1] * toC[1] + n[2] * toC[2]) / l);
        worst = Math.max(worst, (Math.acos(Math.min(1, cos)) * 180) / Math.PI);
      }
      expect(inside).toBeGreaterThan(200);
      expect(worst).toBeLessThan(3);
      // となりの面との折れ（縁もふくむ）
      const key = (i: number) => `${p[i]},${p[i + 1]},${p[i + 2]}`;
      const faces = new Map<string, number[]>();
      for (const t of nearCut) for (let e = 0; e < 3; e++) {
        const a = key(t + e * 3);
        const b = key(t + ((e + 1) % 3) * 3);
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        faces.set(k, [...(faces.get(k) ?? []), t]);
      }
      let fold = 0;
      for (const fs of faces.values()) {
        if (fs.length !== 2) continue;
        const [a, b] = fs.map(normal);
        fold = Math.max(fold, (Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 180) / Math.PI);
      }
      expect(fold).toBeLessThan(40);
    });

    it("くぼみは丸い（上から見て、縁の点は石の先から同じくらいの距離。左右で同じ）", () => {
      // 指に沿う向き（±y）の縁までの距離が、左右で同じ
      const rimAlong = (sign: number) => {
        let far = 0;
        for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i] - cx) < 0.05 && Math.sign(p[i + 1] - cy) === sign && onBall(i)) far = Math.max(far, Math.abs(p[i + 1] - cy));
        return far;
      };
      expect(rimAlong(1)).toBeGreaterThan(0.5);
      expect(Math.abs(rimAlong(1) - rimAlong(-1))).toBeLessThan(0.1);
    });
  });
});

