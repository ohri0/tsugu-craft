// 石の面の段（縁・上の段・テーブル）が、尖った形でもねじれず、縁の内側に収まるか。
// 作者の声（2026-11-04）：マーキスのシェード表示で、テーブルの線が先で矢じりのように飛び出し、マーキスに見えない。
import { describe, expect, it } from "vitest";
import { contains, centroid, type Point } from "../src/geometry/polygon";
import { buildStone, facetGirdle, stoneRings } from "../src/geometry/stone";
import { PRESETS, presetOutline } from "../src/studio/presets";
import { triangle } from "./helpers/synth";
import { measureOutline } from "../src/geometry/measure";
import { findCorners } from "../src/geometry/corners";

const preset = (id: string) => PRESETS.find((p) => p.id === id)!;
/** 写真から取った輪郭のように、始まりの点をずらす */
const rotateStart = (pts: Point[], k: number) => [...pts.slice(k), ...pts.slice(0, k)];

/** 輪の辺どうしが交わらないか（隣の辺は除く） */
function selfIntersects(pts: Point[]): boolean {
  const n = pts.length;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [a, b, c, d] = [pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n]];
      if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return true;
    }
  }
  return false;
}

/** 凸か（どの角でも左に曲がる。まっすぐは許す） */
function isConvex(pts: Point[]): boolean {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [a, b, c] = [pts[i], pts[(i + 1) % n], pts[(i + 2) % n]];
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) < -1e-9) return false;
  }
  return true;
}

function params(id: string, start = 0) {
  const p = preset(id);
  return { outlineMm: rotateStart(presetOutline(p), start), longMm: p.longMm, widthMm: p.widthMm, depthMm: p.depthMm };
}

describe("尖った形の石の面の段", () => {
  for (const id of ["marquise", "pear", "round", "oval", "princess", "emerald"]) {
    for (const start of [0, 13, 37]) {
      it(`${id}（始まりを ${start} ずらす）：テーブルと上の段が縁の内側で、交わらず、凸`, () => {
        const r = stoneRings(params(id, start));
        for (const ring of [r.crownMid, r.table]) {
          expect(selfIntersects(ring)).toBe(false);
          expect(isConvex(ring)).toBe(true);
          for (const q of ring) expect(contains(r.girdle, q)).toBe(true);
        }
        for (const q of r.table) expect(contains(r.crownMid, q)).toBe(true);
      });
    }
  }

  it("マーキスの両方の先が、縁・上の段・テーブルの点に乗る（先が長い向きの線の上に並ぶ）", () => {
    for (const start of [0, 5, 37, 90]) {
      const r = stoneRings(params("marquise", start));
      for (const ring of [r.girdle, r.crownMid, r.table]) {
        const xs = ring.map((q) => q.x);
        const iMax = xs.indexOf(Math.max(...xs));
        const iMin = xs.indexOf(Math.min(...xs));
        // 先は x 軸の上（左右対称）
        expect(Math.abs(ring[iMax].y)).toBeLessThan(1e-3);
        expect(Math.abs(ring[iMin].y)).toBeLessThan(1e-3);
        // 先の向きの点の数は左右で同じ（ねじれていない）
        expect((iMax - iMin + ring.length) % ring.length).toBe(ring.length / 2);
      }
      // テーブルの先は、縁の先を重心に向かって縮めた所
      const c = centroid(r.girdle);
      expect(Math.max(...r.table.map((q) => q.x)) - c.x).toBeCloseTo((Math.max(...r.girdle.map((q) => q.x)) - c.x) * 0.55, 3);
    }
  });

  it("ペアの先も、テーブルの点に乗る", () => {
    const r = stoneRings(params("pear", 21));
    const tip = r.table.reduce((a, b) => (b.x > a.x ? b : a));
    expect(Math.abs(tip.y)).toBeLessThan(1e-3);
  });

  it("三角の角は 3 つとも縁を区切る点（テーブルの点のもと）に乗る", () => {
    const outlineMm = measureOutline({ outlinePx: triangle(0, 0, 888, 752), longMm: 8.88 }).outlineMm;
    const g = facetGirdle(outlineMm);
    const corners = findCorners(outlineMm);
    expect(corners.length).toBe(3);
    const step4 = g.filter((_, i) => i % 4 === 0);
    for (const cn of corners) {
      const d = Math.min(...step4.map((q) => Math.hypot(q.x - cn.point.x, q.y - cn.point.y)));
      expect(d).toBeLessThan(0.1);
    }
    const r = stoneRings({ outlineMm, longMm: 8.88, widthMm: 7.52, depthMm: 4.35 });
    expect(isConvex(r.table)).toBe(true);
    for (const q of r.table) expect(contains(r.girdle, q)).toBe(true);
  });

  it("縁の点の数は 4 の倍数で、面の段の点の数が割り切れる（三角形の面が組める）", () => {
    for (const p of PRESETS) {
      const r = stoneRings(params(p.id, 7));
      expect(r.girdle.length % 4).toBe(0);
      expect(r.crownMid.length).toBe(r.girdle.length);
      expect(r.table.length * 4).toBe(r.girdle.length);
      expect(r.pavMid.length * 4).toBe(r.girdle.length);
    }
  });

  it("マーキスの石の外形は、長辺 10 mm をはみ出さず、先まで届く", () => {
    const { positions } = buildStone(params("marquise", 37));
    let [x0, x1] = [Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      x0 = Math.min(x0, positions[i]);
      x1 = Math.max(x1, positions[i]);
    }
    expect(x1 - x0).toBeGreaterThan(10 * 0.995);
    expect(x1 - x0).toBeLessThanOrEqual(10 + 1e-4);
  });

  it("マーキスの上側の折れ目の線は、縁・テーブル・先へ向かう稜線だけ（よけいな線が出ない）", () => {
    const m = buildStone(params("marquise", 37));
    const { tableZ, girdleMm } = m.heights;
    for (const [a, b] of creases(m.positions, 14)) {
      if (a[2] <= 0 || b[2] <= 0) continue; // 上側だけ
      const onTable = Math.abs(a[2] - tableZ) < 1e-4 && Math.abs(b[2] - tableZ) < 1e-4;
      const onGirdle = Math.abs(a[2] - girdleMm / 2) < 1e-4 && Math.abs(b[2] - girdleMm / 2) < 1e-4;
      const onAxis = Math.abs(a[1]) < 1e-3 && Math.abs(b[1]) < 1e-3;
      expect(onTable || onGirdle || onAxis).toBe(true);
    }
  });

  it("ラウンドの上側には、縁とテーブルの線のほかに折れ目が出ない", () => {
    const m = buildStone(params("round", 11));
    const { tableZ, girdleMm } = m.heights;
    for (const [a, b] of creases(m.positions, 14)) {
      if (a[2] <= 0 || b[2] <= 0) continue;
      const flat = (z: number) => Math.abs(a[2] - z) < 1e-4 && Math.abs(b[2] - z) < 1e-4;
      expect(flat(tableZ) || flat(girdleMm / 2)).toBe(true);
    }
  });
});

type V = [number, number, number];
/** 画面の線（three.js の EdgesGeometry）と同じ考えで、となりの面との角度が deg 度より大きい辺を返す */
function creases(pos: Float32Array, deg: number): [V, V][] {
  const key = (v: V) => v.map((x) => Math.round(x * 1e4)).join(",");
  const edges = new Map<string, { a: V; b: V; n: V[] }>();
  for (let i = 0; i < pos.length; i += 9) {
    const t: V[] = [0, 1, 2].map((k) => [pos[i + k * 3], pos[i + k * 3 + 1], pos[i + k * 3 + 2]]);
    const u = t[1].map((x, k) => x - t[0][k]);
    const w = t[2].map((x, k) => x - t[0][k]);
    const n: V = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const l = Math.hypot(...n);
    if (l < 1e-12) continue;
    const nn = n.map((x) => x / l) as V;
    for (let k = 0; k < 3; k++) {
      const a = t[k];
      const b = t[(k + 1) % 3];
      const ka = key(a);
      const kb = key(b);
      const id = ka < kb ? ka + "|" + kb : kb + "|" + ka;
      const e = edges.get(id) ?? { a, b, n: [] };
      e.n.push(nn);
      edges.set(id, e);
    }
  }
  const cos = Math.cos((deg * Math.PI) / 180);
  const out: [V, V][] = [];
  for (const e of edges.values()) {
    if (e.n.length !== 2 || e.n[0][0] * e.n[1][0] + e.n[0][1] * e.n[1][1] + e.n[0][2] * e.n[1][2] <= cos) out.push([e.a, e.b]);
  }
  return out;
}
