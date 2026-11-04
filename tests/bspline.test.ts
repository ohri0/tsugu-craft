// なめらかな線（3 次の B スプライン）の計算：線の上の点、節を足しても形が変わらない、左右対称、点の列に合わせる
import { describe, expect, it } from "vitest";
import {
  adaptiveSample,
  basis,
  evalCurve,
  findSpan,
  fitCurve,
  fitError,
  insertKnot,
  isSymmetric,
  nearestOnCurve,
  removePoint,
  sampleCurve,
  symmetrize,
  uniformKnots,
  validKnots,
  type P2,
} from "../src/geometry/bspline";

const P: P2[] = [
  { x: 2, y: 0 },
  { x: 2, y: 1 },
  { x: 1, y: 2 },
  { x: 0, y: 2.2 },
  { x: -1, y: 2 },
  { x: -2, y: 1 },
  { x: -2, y: 0 },
];

describe("B スプラインの線", () => {
  it("節：両端は 4 つ重なり、間は等しい間隔", () => {
    expect(uniformKnots(4)).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    expect(uniformKnots(6)).toEqual([0, 0, 0, 0, 1 / 3, 2 / 3, 1, 1, 1, 1]);
    expect(validKnots(6, uniformKnots(6))).toBe(true);
    expect(validKnots(6, uniformKnots(5))).toBe(false);
    expect(validKnots(6, undefined)).toBe(false);
  });

  it("基底の値は 0 以上で、足すと 1", () => {
    const u = uniformKnots(P.length);
    for (let t = 0; t <= 1; t += 0.037) {
      const N = basis(findSpan(P.length, u, t), t, u);
      expect(N.every((v) => v >= -1e-12)).toBe(true);
      expect(N.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    }
  });

  it("点が 4 つなら、ベジェ曲線と同じ（(1−t)³ P0 ＋ 3(1−t)²t P1 ＋ 3(1−t)t² P2 ＋ t³ P3）", () => {
    const Q = P.slice(0, 4);
    const u = uniformKnots(4);
    for (const t of [0, 0.2, 0.5, 0.77, 1]) {
      const s = 1 - t;
      const w = [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t];
      const want = { x: Q.reduce((a, q, i) => a + w[i] * q.x, 0), y: Q.reduce((a, q, i) => a + w[i] * q.y, 0) };
      const got = evalCurve(Q, u, t);
      expect(got.x).toBeCloseTo(want.x, 12);
      expect(got.y).toBeCloseTo(want.y, 12);
    }
  });

  it("線は最初と最後の点を通り、端の向きは となりの点へ向かう", () => {
    const u = uniformKnots(P.length);
    expect(evalCurve(P, u, 0)).toEqual(P[0]);
    const end = evalCurve(P, u, 1);
    expect(end.x).toBeCloseTo(P[6].x, 12);
    expect(end.y).toBeCloseTo(P[6].y, 12);
    const a = evalCurve(P, u, 1e-6);
    expect(Math.abs(a.x - P[0].x)).toBeLessThan(1e-6); // 右の端では真上へ向かう（P0 → P1 が縦）
    expect(a.y).toBeGreaterThan(0);
  });

  it("線は制御点の折れ線の内側にある（どの点も、x は −2〜2、y は 0〜2.2）", () => {
    for (const { p } of sampleCurve(P, uniformKnots(P.length), 30)) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(2 + 1e-12);
      expect(p.y).toBeGreaterThanOrEqual(-1e-12);
      expect(p.y).toBeLessThanOrEqual(2.2);
    }
  });

  it("節を足すと点が 1 つ増え、線の形はまったく同じ（何度足しても）", () => {
    let pts = P;
    let u = uniformKnots(P.length);
    for (const t of [0.31, 0.5, 0.05, 0.9, 0.31]) {
      const r = insertKnot(pts, u, t);
      expect(r.pts.length).toBe(pts.length + 1);
      expect(validKnots(r.pts.length, r.knots)).toBe(true);
      for (let s = 0; s <= 1; s += 0.01) {
        const a = evalCurve(pts, u, s);
        const b = evalCurve(r.pts, r.knots, s);
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-9);
      }
      pts = r.pts;
      u = r.knots;
    }
  });

  it("点を消すと、点と節が 1 つずつ減る（両端と、4 つより少なくなるときは消さない）", () => {
    const u = uniformKnots(P.length);
    const r = removePoint(P, u, 2)!;
    expect(r.pts.length).toBe(6);
    expect(validKnots(r.pts.length, r.knots)).toBe(true);
    expect(removePoint(P, u, 0)).toBeNull();
    expect(removePoint(P.slice(0, 4), uniformKnots(4), 1)).toBeNull();
  });

  it("左右対称：対称な点と節なら対称と分かり、ずれた形は左右の平均で対称になる", () => {
    const u = uniformKnots(P.length);
    expect(isSymmetric(P, u)).toBe(true);
    const bent = P.map((p, i) => (i === 1 ? { x: 2.4, y: 1.3 } : p));
    expect(isSymmetric(bent, u)).toBe(false);
    const s = symmetrize(bent, u);
    expect(isSymmetric(s.pts, s.knots)).toBe(true);
    expect(s.pts[1]).toEqual({ x: 2.2, y: 1.15 });
    // 線も左右対称：t と 1−t の点が x ＝ 0 で折り返し
    for (let t = 0; t <= 0.5; t += 0.05) {
      const a = evalCurve(s.pts, s.knots, t);
      const b = evalCurve(s.pts, s.knots, 1 - t);
      expect(a.x).toBeCloseTo(-b.x, 9);
      expect(a.y).toBeCloseTo(b.y, 9);
    }
    // 対称な節に、t と 1−t で足しても対称のまま
    const r1 = insertKnot(P, u, 0.2);
    const r2 = insertKnot(r1.pts, r1.knots, 0.8);
    expect(isSymmetric(r2.pts, r2.knots)).toBe(true);
  });

  it("線の上のいちばん近い所を探せる", () => {
    const u = uniformKnots(P.length);
    const on = evalCurve(P, u, 0.37);
    const hit = nearestOnCurve(P, u, { x: on.x, y: on.y });
    expect(hit.d).toBeLessThan(1e-6);
    expect(hit.t).toBeCloseTo(0.37, 4);
  });

  it("点の列に合わせる：同じ数の点の線から取った点なら、元の線がほぼそのまま戻る", () => {
    const u = uniformKnots(P.length);
    const data = sampleCurve(P, u, 30).map((s) => s.p);
    const r = fitCurve(data, P.length, 0);
    expect(fitError(data, r.pts, r.knots)).toBeLessThan(0.02);
    expect(r.pts[0]).toEqual(data[0]);
    expect(r.pts[r.pts.length - 1]).toEqual(data[data.length - 1]);
  });

  it("点の列に合わせる：半円を 7 点でなぞると、ずれは半径の 0.5 % 以下", () => {
    const data = Array.from({ length: 150 }, (_, i) => {
      const a = (Math.PI * i) / 149;
      return { x: Math.cos(a), y: Math.sin(a) };
    });
    const r = fitCurve(data, 7, 0);
    expect(fitError(data, r.pts, r.knots)).toBeLessThan(0.005);
  });

  it("3D 用の点：曲がる所ほど細かく、まっすぐな所は少なく（となりの線分の向きの差は 3° ＋ 少し）", () => {
    const sq = [
      { x: 1, y: 0 },
      { x: 1, y: 0.5 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: -1, y: 1 },
      { x: -1, y: 0.5 },
      { x: -1, y: 0 },
    ];
    const u = uniformKnots(sq.length);
    const out = adaptiveSample(sq, u, 3, 10);
    expect(out[0]).toEqual(sq[0]);
    const end = out[out.length - 1];
    expect(end.x).toBeCloseTo(-1, 12);
    expect(out.length).toBeLessThan(sampleCurve(sq, u, 96).length / 4);
    for (let i = 1; i < out.length - 1; i++) {
      const a = Math.atan2(out[i].y - out[i - 1].y, out[i].x - out[i - 1].x);
      const b = Math.atan2(out[i + 1].y - out[i].y, out[i + 1].x - out[i].x);
      let d = Math.abs(b - a);
      if (d > Math.PI) d = 2 * Math.PI - d;
      expect((d * 180) / Math.PI).toBeLessThan(5);
    }
  });
});
