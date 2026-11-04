// 腕の断面を自由に描く：描いた線と、できた線が合う（離れ 0.08 mm 以内・角は角のまま）。
// 局所的に薄い所（とがり・ヒレ）だけを知らせ、ふつうの 3.0×1.6 の平打ちや甲丸は知らせない（作者の言葉：2026-11-04）
import { describe, expect, it } from "vitest";
import { evalCurve, fitError, isSymmetric, sampleCurve, type P2 } from "../src/geometry/bspline";
import { findThinSpots } from "../src/geometry/section-thin";
import { buildShank } from "../src/geometry/shank";
import { checkShank, sectionSpots } from "../src/rules/checks";
import { GUIDES } from "../src/rules/guides";
import { fitStroke, measure, outlineMm, shapeOf, type EditCurve } from "../src/studio/section-edit";

/** 折れ線を、線分ごとに per 個の点に分けた線（マウスでなぞった線のかわり） */
function polyStroke(corners: [number, number][], per = 30): P2[] {
  const out: P2[] = [];
  for (let i = 1; i < corners.length; i++) {
    const [ax, ay] = corners[i - 1];
    const [bx, by] = corners[i];
    for (let k = 0; k < per; k++) out.push({ x: ax + ((bx - ax) * k) / per, y: ay + ((by - ay) * k) / per });
  }
  const [lx, ly] = corners[corners.length - 1];
  out.push({ x: lx, y: ly });
  return out;
}

/** 描いた線の点から、できた線までのいちばん大きな離れ（mm） */
const deviation = (stroke: readonly P2[], ec: EditCurve) => fitError(stroke, ec.pts, ec.knots);

/** できた線の点から、描いた線（折れ線）までのいちばん大きな離れ（mm）。両側から見て、線が勝手にふくらまないこと */
function backDeviation(stroke: readonly P2[], ec: EditCurve): number {
  let worst = 0;
  for (const { p } of sampleCurve(ec.pts, ec.knots, 16)) {
    let d = Infinity;
    for (let i = 1; i < stroke.length; i++) {
      const a = stroke[i - 1];
      const b = stroke[i];
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy || 1)));
      d = Math.min(d, Math.hypot(a.x + vx * t - p.x, a.y + vy * t - p.y));
    }
    worst = Math.max(worst, d);
  }
  return worst;
}

/** 線が点 c で折れているか：c の少し前と少し後の向きの差（度） */
function turnNear(ec: EditCurve, c: P2): number {
  const s = sampleCurve(ec.pts, ec.knots, 200);
  let k = 0;
  s.forEach((q, i) => {
    if (Math.hypot(q.p.x - c.x, q.p.y - c.y) < Math.hypot(s[k].p.x - c.x, s[k].p.y - c.y)) k = i;
  });
  const a = evalCurve(ec.pts, ec.knots, Math.max(0, s[k].t - 0.01));
  const m = evalCurve(ec.pts, ec.knots, s[k].t);
  const b = evalCurve(ec.pts, ec.knots, Math.min(1, s[k].t + 0.01));
  const d = Math.atan2(b.y - m.y, b.x - m.x) - Math.atan2(m.y - a.y, m.x - a.x);
  return Math.abs((((d * 180) / Math.PI + 540) % 360) - 180);
}

const nearest = (ec: EditCurve, c: P2) => Math.min(...sampleCurve(ec.pts, ec.knots, 200).map((q) => Math.hypot(q.p.x - c.x, q.p.y - c.y)));

// 端（y ＝ 0）から端までの線。左右対称でない形も
const STROKES: [string, P2[], boolean][] = [
  [
    "ふるえのある半楕円（幅 2.4・厚み 1.5）",
    (() => {
      let seed = 11;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.03;
      return Array.from({ length: 120 }, (_, i) => {
        const a = Math.PI - (Math.PI * i) / 119;
        return { x: 1.2 * Math.cos(a) + rnd(), y: 1.5 * Math.sin(a) + rnd() };
      });
    })(),
    true,
  ],
  [
    "上がへこんだ形（幅 3.0）",
    Array.from({ length: 160 }, (_, i) => {
      const x = 1.5 - (3 * i) / 159;
      return { x, y: Math.min(1.4, 1.1 - 0.35 * Math.cos((Math.PI * x) / 1.5) + 0.0001) * Math.min(1, (1.5 - Math.abs(x)) * 12) };
    }),
    true,
  ],
  [
    "左右がちがう、片側が高い形（左右対称を切って描く）",
    Array.from({ length: 160 }, (_, i) => {
      const x = 1.4 - (2.8 * i) / 159;
      return { x, y: (0.25 + 1.3 * Math.exp(-((x - 0.5) ** 2) / 0.4)) * Math.min(1, (1.4 - Math.abs(x)) * 15) };
    }),
    false,
  ],
  [
    "なだらかな M（2 つの山。横は縦）",
    [
      ...Array.from({ length: 20 }, (_, i) => ({ x: 1.6, y: (1.0 * i) / 20 })),
      ...Array.from({ length: 200 }, (_, i) => {
        const x = 1.6 - (3.2 * i) / 199;
        return { x, y: 1.3 + 0.3 * Math.cos((Math.PI * (Math.abs(x) - 0.8)) / 0.8) };
      }),
      ...Array.from({ length: 20 }, (_, i) => ({ x: -1.6, y: 1.0 - (1.0 * (i + 1)) / 20 })),
    ],
    true,
  ],
];

describe("自由に描く：描いた線と、できた線が合う", () => {
  for (const [name, stroke, sym] of STROKES) {
    it(`なめらかな線は、描いた線から 0.08 mm 以内：${name}`, () => {
      const ec = fitStroke(stroke, { sym })!;
      expect(ec).not.toBeNull();
      expect(deviation(stroke, ec)).toBeLessThanOrEqual(0.08);
      expect(backDeviation(stroke, ec)).toBeLessThanOrEqual(0.08);
      // 指の側は平ら（両端は内側の線の上）
      expect(ec.pts[0].y).toBe(0);
      expect(ec.pts[ec.pts.length - 1].y).toBe(0);
    });
  }

  it("描いた幅と厚みを、そのまま守る", () => {
    const [, stroke] = STROKES[0];
    const m = measure(fitStroke(stroke, { sym: true })!);
    expect(m.widthMm).toBeGreaterThan(2.4 - 0.08);
    expect(m.widthMm).toBeLessThan(2.4 + 0.1);
    expect(m.thicknessMm).toBeCloseTo(1.5, 1);
  });

  it("急に折れた所は、角のまま残す（M の形・平打ちの角）", () => {
    const M: [number, number][] = [[1.5, 0], [1.5, 1.8], [1.3, 1.8], [1.3, 1.0], [0, 0.6], [-1.3, 1.0], [-1.3, 1.8], [-1.5, 1.8], [-1.5, 0]];
    for (const sym of [true, false]) {
      const stroke = polyStroke(M);
      const ec = fitStroke(stroke, { sym })!;
      expect(deviation(stroke, ec)).toBeLessThanOrEqual(0.08);
      // 上の 6 つの角（指の側の 2 つは端の点）を通り、そこで折れている
      for (const [x, y] of M.slice(1, -1)) {
        expect(nearest(ec, { x, y }), `${sym} ${x},${y}`).toBeLessThan(0.02);
        expect(turnNear(ec, { x, y }), `${x},${y}`).toBeGreaterThan(30);
      }
    }
  });

  it("とがった山（尖り）も、とがったまま", () => {
    const stroke = polyStroke([[1.2, 0], [1.2, 0.6], [0, 1.9], [-1.2, 0.6], [-1.2, 0]]);
    const ec = fitStroke(stroke, { sym: true })!;
    expect(nearest(ec, { x: 0, y: 1.9 })).toBeLessThan(0.02);
    expect(turnNear(ec, { x: 0, y: 1.9 })).toBeGreaterThan(60);
    expect(isSymmetric(ec.pts, ec.knots)).toBe(true);
  });

  it("左右対称で両側を描いたら、左と右を平均する", () => {
    // 右は 1.6 mm、左は 1.4 mm の高さで描いた（手で描くと左右がずれる）
    const stroke = Array.from({ length: 200 }, (_, i) => {
      const a = (Math.PI * i) / 199;
      const h = Math.cos(a) > 0 ? 1.6 : 1.4;
      return { x: 1.2 * Math.cos(a), y: h * Math.sin(a) };
    });
    const ec = fitStroke(stroke, { sym: true })!;
    expect(isSymmetric(ec.pts, ec.knots)).toBe(true);
    expect(measure(ec).thicknessMm).toBeCloseTo(1.5, 1);
    // 左右対称を切れば、描いたとおり左右がちがう
    const free = fitStroke(stroke, { sym: false })!;
    expect(isSymmetric(free.pts, free.knots, 1e-3)).toBe(false);
    expect(deviation(stroke, free)).toBeLessThanOrEqual(0.08);
  });

  it("片側だけ描けば、折り返す（真ん中がへこんだ形も）", () => {
    const half = Array.from({ length: 80 }, (_, i) => {
      const x = 1.3 - (1.3 * i) / 79;
      return { x, y: 1.2 + 0.25 * Math.sin((Math.PI * x) / 1.3) };
    });
    const ec = fitStroke(half, { sym: true })!;
    expect(isSymmetric(ec.pts, ec.knots)).toBe(true);
    expect(deviation(half, ec)).toBeLessThanOrEqual(0.08);
    // 真ん中（x ＝ 0）は、山より低い
    const mid = sampleCurve(ec.pts, ec.knots, 50).reduce((b, s) => (Math.abs(s.p.x) < Math.abs(b.x) ? s.p : b), { x: 9, y: 0 });
    expect(mid.y).toBeLessThan(measure(ec).thicknessMm - 0.15);
  });
});

describe("局所的に薄い所（とがり・ヒレ）だけを知らせる", () => {
  const lim = GUIDES.band.spike;

  it("0.2 mm の薄いヒレがある M の形は、ヒレの所だけを知らせる", () => {
    const M: [number, number][] = [[1.5, 0], [1.5, 1.8], [1.3, 1.8], [1.3, 1.0], [0, 0.6], [-1.3, 1.0], [-1.3, 1.8], [-1.5, 1.8], [-1.5, 0]];
    const ec = fitStroke(polyStroke(M), { sym: true })!;
    const spots = sectionSpots(outlineMm(ec));
    expect(spots.length).toBe(2);
    for (const s of spots) {
      // ヒレ（x ＝ ±1.3〜1.5、高さ 1.0 より上）の中
      expect(Math.abs(s.at.x)).toBeGreaterThan(1.25);
      expect(s.at.y).toBeGreaterThan(1.0);
      expect(s.thicknessMm).toBeLessThan(lim.minLocalMm);
      for (const q of s.run) expect(Math.abs(q.x)).toBeGreaterThan(1.2);
    }
    // 3D の腕の確かめでも、その所だけ（腕ぜんぶの「薄い」ではない）
    const sh = buildShank({ gou: 11, section: "free", sectionCurve: shapeOf(ec).curve, widthMm: 3.0, thicknessMm: 1.8 });
    const probs = checkShank(sh);
    expect(probs.map((p) => p.check)).toEqual(["band-spike", "band-spike"]);
    for (const p of probs) {
      expect(p.target.kind).toBe("shank-spot");
      expect(p.reason).toContain("尖りすぎ");
    }
  });

  it("鋭い山（40°）は、先だけを知らせる。90° の山は知らせない", () => {
    const h = 1 / Math.tan((20 * Math.PI) / 180);
    const sharp = findThinSpots(
      [[1.0, 0], [1.0, 0.2], [0, 0.2 + h], [-1.0, 0.2], [-1.0, 0]].map(([x, y]) => ({ x, y })),
      lim,
    );
    expect(sharp.length).toBe(1);
    expect(sharp[0].kind).toBe("tip");
    expect(sharp[0].at.x).toBeCloseTo(0, 2);
    expect(sharp[0].angleDeg).toBeLessThan(lim.minTipAngleDeg);
    const blunt = findThinSpots(
      [[1.5, 0], [1.5, 0.6], [0, 2.1], [-1.5, 0.6], [-1.5, 0]].map(([x, y]) => ({ x, y })),
      lim,
    );
    expect(blunt).toEqual([]);
  });

  it("3.0×1.6 の平打ち・甲丸、なだらかな M の形は知らせない（腕ぜんぶの厚み・幅の確かめにもかからない）", () => {
    for (const section of ["hirauchi", "kouman", "hangouman", "kaku"] as const) {
      for (const [w, t] of [[3.0, 1.6], [2.2, 1.6], [1.7, 1.2], [6.0, 1.2]]) {
        const sh = buildShank({ gou: 11, section, widthMm: w, thicknessMm: t });
        expect(checkShank(sh), `${section} ${w}×${t}`).toEqual([]);
      }
    }
    // なだらかな M（画面で作者が見せた形のような、2 つの山）
    const soft = fitStroke(STROKES[3][1], { sym: true })!;
    expect(sectionSpots(outlineMm(soft))).toEqual([]);
  });

  it("本当に薄い腕は、これまでどおり腕の厚みの目安で知らせる", () => {
    const sh = buildShank({ gou: 11, section: "hirauchi", widthMm: 3.0, thicknessMm: 1.0 });
    const probs = checkShank(sh);
    expect(probs.map((p) => p.check)).toEqual(["band-thin"]);
    expect(probs[0].required).toContain("目安");
  });
});
