// 石座と腕の「見た目の質」を数で確かめる：爪は丸い針金、形は閉じている、先に平らな面がない、同じ入力なら同じ形。
import { describe, expect, it } from "vitest";
import { buildRing } from "../src/geometry/ring";
import { buildSetting, PRONG_SIDES, type SettingResult, type TriangleRange } from "../src/geometry/setting";
import { buildShank } from "../src/geometry/shank";
import { meshVolume } from "../src/geometry/stone";
import { GUIDES } from "../src/rules/guides";
import { ovalStone, squareStone, triangleStone } from "./helpers/stones";

const part = (a: Float32Array, r: TriangleRange) => a.subarray(r.start * 9, (r.start + r.count) * 9);

/** 高さ z の水平な面で切った切り口の点（三角形の辺が面を横切る所） */
function sliceAt(a: Float32Array, z: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < a.length; i += 9) {
    for (let e = 0; e < 3; e++) {
      const p = i + e * 3;
      const q = i + ((e + 1) % 3) * 3;
      const da = a[p + 2] - z;
      const db = a[q + 2] - z;
      if (da * db >= 0) continue;
      const w = da / (da - db);
      out.push([a[p] + (a[q] - a[p]) * w, a[p + 1] + (a[q + 1] - a[p + 1]) * w]);
    }
  }
  return out;
}

/**
 * 切り口の輪郭が、いちばん急に曲がる所の角度（度）。
 * 斜めの針金の切り口は細長い楕円になるので、まず広がりの向き（主成分）ごとに縮めて円に近づけ、外側の点（凸包）を順にたどって、
 * となりの辺どうしの向きの差を測る。20 角形の丸い針金なら 20° 前後、八角形の棒なら 45°
 */
function maxTurnDeg(pts: [number, number][]): number {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y] of pts) {
    sxx += (x - cx) ** 2;
    sxy += (x - cx) * (y - cy);
    syy += (y - cy) ** 2;
  }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const [c, s] = [Math.cos(th), Math.sin(th)];
  const local = pts.map(([x, y]) => [(x - cx) * c + (y - cy) * s, -(x - cx) * s + (y - cy) * c] as [number, number]);
  const ex = Math.max(...local.map((p) => Math.abs(p[0])));
  const ey = Math.max(...local.map((p) => Math.abs(p[1])));
  const round = local.map(([x, y]) => [x / ex, y / ey] as [number, number]);
  // 凸包（左下から反時計回り）
  round.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const hull: [number, number][] = [];
  for (const pass of [round, [...round].reverse()]) {
    const start = hull.length;
    for (const p of pass) {
      while (hull.length >= start + 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 1e-12) hull.pop();
      hull.push(p);
    }
    hull.pop();
  }
  // とても近い点（同じ辺の上の 2 点）は 1 つにまとめる
  const ring: [number, number][] = [];
  for (const p of hull) if (ring.length === 0 || Math.hypot(p[0] - ring[ring.length - 1][0], p[1] - ring[ring.length - 1][1]) > 0.05) ring.push(p);
  let worst = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const d = ring[(i + 2) % ring.length];
    let t = Math.abs(Math.atan2(d[1] - b[1], d[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]));
    if (t > Math.PI) t = 2 * Math.PI - t;
    worst = Math.max(worst, (t * 180) / Math.PI);
  }
  return worst;
}

/** 向きのある辺が、向きの逆の辺とちょうど打ち消し合うか（すき間も重なりもない、閉じた面） */
function isClosed(a: Float32Array): boolean {
  const key = (i: number) => `${a[i]},${a[i + 1]},${a[i + 2]}`;
  const count = new Map<string, number>();
  for (let i = 0; i < a.length; i += 9) {
    const v = [key(i), key(i + 3), key(i + 6)];
    for (let e = 0; e < 3; e++) {
      const from = v[e];
      const to = v[(e + 1) % 3];
      if (from === to) continue; // 点に縮んだ辺（丸いふたの先など）は数えない
      count.set(`${from}>${to}`, (count.get(`${from}>${to}`) ?? 0) + 1);
      count.set(`${to}>${from}`, (count.get(`${to}>${from}`) ?? 0) - 1);
    }
  }
  for (const c of count.values()) if (c !== 0) return false;
  return true;
}

function triArea(a: Float32Array, i: number): number {
  const ux = a[i + 3] - a[i];
  const uy = a[i + 4] - a[i + 1];
  const uz = a[i + 5] - a[i + 2];
  const vx = a[i + 6] - a[i];
  const vy = a[i + 7] - a[i + 1];
  const vz = a[i + 8] - a[i + 2];
  return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}

describe("爪は丸い針金", () => {
  const stone = ovalStone();
  const s = buildSetting({ stone, style: "prong" });
  it("断面の円は 20 角形以上", () => expect(PRONG_SIDES).toBeGreaterThanOrEqual(20));
  it("上の輪と縁の間で水平に切ると、切り口はなめらかな楕円（八角形のような 45° の角がない）", () => {
    const z = (s.heights.upperRingZ! - s.heights.girdleMm / 2) / 2;
    for (const p of s.prongs) {
      const cut = sliceAt(part(s.positions, p.triangles), z);
      expect(cut.length).toBeGreaterThanOrEqual(2 * PRONG_SIDES);
      expect(maxTurnDeg(cut)).toBeLessThan(30);
    }
  });
  it("V 字の爪の足も、切り口は丸い（足 1 本ずつ）", () => {
    const t = buildSetting({ stone: triangleStone(), style: "prong" });
    // 足が分かれたあと（上の輪のすぐ下。下の方では 2 本の足が 1 本の軸へ合わさっていく）
    const z = t.heights.upperRingZ! - 0.1 * (t.heights.upperRingZ! - t.heights.lowerRingZ!);
    const p = t.prongs[0];
    const cut = sliceAt(part(t.positions, p.triangles), z);
    // 2 本の足は角をはさんで左右にある。足の中心を結ぶ向きで 2 つに分ける
    const [a, b] = p.legPoints;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const side = (q: [number, number]) => (q[0] - mx) * (b.x - a.x) + (q[1] - my) * (b.y - a.y);
    for (const half of [cut.filter((q) => side(q) < 0), cut.filter((q) => side(q) > 0)]) {
      expect(half.length).toBeGreaterThanOrEqual(2 * PRONG_SIDES);
      expect(maxTurnDeg(half)).toBeLessThan(30);
    }
  });
});

describe("形は閉じていて、体積が正", () => {
  for (const [name, stone] of [
    ["三角（V 字の爪）", triangleStone()],
    ["四角（V 字の爪）", squareStone()],
    ["楕円（ふつうの爪）", ovalStone()],
  ] as const) {
    it(name, () => {
      const s = buildSetting({ stone, style: "prong" });
      for (const r of [...s.prongs.map((p) => p.triangles), ...s.rings.map((g) => g.triangles)]) {
        const a = part(s.positions, r);
        expect(isClosed(a)).toBe(true);
        expect(meshVolume(a)).toBeGreaterThan(0);
      }
      const b = buildSetting({ stone, style: "bezel" });
      expect(isClosed(b.positions)).toBe(true);
      expect(meshVolume(b.positions)).toBeGreaterThan(0);
    });
  }
  it("肩のある腕", () => {
    const sh = buildShank({ gou: 11, head: { widthMm: 3.4, spanMm: 4, taperMm: 4 } });
    expect(isClosed(sh.positions)).toBe(true);
    expect(sh.volumeMm3).toBeGreaterThan(buildShank({ gou: 11 }).volumeMm3);
  });
});

describe("爪の先", () => {
  const check = (s: SettingResult) => {
    const tz = s.heights.tipZ!;
    for (const p of s.prongs) {
      const a = part(s.positions, p.triangles);
      let top = -Infinity;
      let biggest = 0;
      for (let i = 0; i < a.length; i += 9) {
        top = Math.max(top, a[i + 2], a[i + 5], a[i + 8]);
        // 先のあたり（先の高さより上）に、大きな平らな面（ふた）がない
        if (Math.min(a[i + 2], a[i + 5], a[i + 8]) > tz) biggest = Math.max(biggest, triArea(a, i));
      }
      // 先は石の上側にかかる（先の高さより上まで届く）が、石の上面より高くはならない
      expect(top).toBeGreaterThan(tz);
      expect(top).toBeLessThan(s.heights.tableZ);
      expect(biggest).toBeLessThan(0.02 * p.diameterMm ** 2);
    }
  };
  it("ふつうの爪（楕円）：丸い先", () => check(buildSetting({ stone: ovalStone(), style: "prong" })));
  it("V 字の爪（三角）：角の丸い板", () => check(buildSetting({ stone: triangleStone(), style: "prong" })));
  it("先の高さの目安（確かめに使う値）は形を変えても同じ物差し", () => {
    const s = buildSetting({ stone: triangleStone(), style: "prong", tipRatio: 0.8 });
    const h = s.heights;
    expect(h.tipZ!).toBeCloseTo(h.culetZ + 0.8 * (h.tableZ - h.culetZ), 9);
    for (const p of s.prongs) expect(p.lengthMm).toBeCloseTo(h.tipZ! - h.upperRingZ!, 9);
  });
});

describe("腕の肩", () => {
  it("いちばん上だけ広く、下は元の幅。石座の足は肩の幅に収まる", () => {
    const ring = buildRing({ stone: triangleStone(), setting: { style: "prong" }, shank: { gou: 11 } });
    const a = ring.ringPositions.shank;
    let topHalf = 0;
    let bottomHalf = 0;
    for (let i = 0; i < a.length; i += 3) {
      if (a[i + 2] > ring.shank.innerRadiusMm * 0.9) topHalf = Math.max(topHalf, Math.abs(a[i]));
      if (a[i + 2] < -ring.shank.innerRadiusMm * 0.5) bottomHalf = Math.max(bottomHalf, Math.abs(a[i]));
    }
    expect(bottomHalf).toBeCloseTo(GUIDES.shank.widthMm / 2, 4);
    expect(topHalf).toBeGreaterThan(GUIDES.shank.widthMm / 2);
    expect(topHalf).toBeLessThanOrEqual(GUIDES.shank.widthMm * 0.8 + 1e-6);
  });
});

describe("同じ入力なら同じ形（V 字の爪・肩・覆輪）", () => {
  const same = (x: Float32Array, y: Float32Array) => x.length === y.length && Buffer.compare(Buffer.from(x.buffer), Buffer.from(y.buffer)) === 0;
  it("三角の指輪（縦・横、爪・覆輪）", () => {
    for (const style of ["prong", "bezel"] as const) {
      for (const orientation of ["along", "across"] as const) {
        const p = { stone: triangleStone(), setting: { style }, shank: { gou: 11 }, orientation };
        const a = buildRing(p);
        const b = buildRing(p);
        expect(same(a.ringPositions.setting, b.ringPositions.setting)).toBe(true);
        expect(same(a.ringPositions.shank, b.ringPositions.shank)).toBe(true);
        expect(a.metalWeightG).toBe(b.metalWeightG);
      }
    }
  });
});
