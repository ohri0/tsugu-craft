// 腕の断面（甲丸・平打ち・半甲丸・角・手で描く）：形がすき間なく閉じ、重さが断面に合って変わり、
// 細い・薄い腕は確かめで引っかかり、どの断面でも石座が腕の上にのる
import { describe, expect, it } from "vitest";
import { openEdges } from "../src/cad/solid";
import { buildRing } from "../src/geometry/ring";
import { SHANK_SECTIONS, buildShank, cleanPoints, curveKnots, freeOutline, presetCurve, sectionControlPoints, sectionOutline, type ShankSection } from "../src/geometry/shank";
import { isSymmetric, sampleCurve } from "../src/geometry/bspline";
import { checkRing } from "../src/rules/checks";
import { GUIDES } from "../src/rules/guides";
import { addPointAt, deletePoint, fitStroke, makeSymmetric, measure, movePoint, pointOn, sameShape, shapeOf, startCurve, startShape } from "../src/studio/section-edit";
import { RingSession } from "../src/studio/session";
import { seedLedger } from "../src/rules/ledger";
import { stoneFrom, triangleStone } from "./helpers/stones";
import { ellipse } from "./helpers/synth";

const roundStone = () => stoneFrom(ellipse(0, 0, 325, 325), 6.5, 3.9);

function zMax(a: Float32Array): number {
  let z = -Infinity;
  for (let i = 2; i < a.length; i += 3) z = Math.max(z, a[i]);
  return z;
}

describe("腕の断面", () => {
  it("どの断面も、すき間なく閉じた形で、いちばん上が 内径 ÷ 2 ＋ 厚み", () => {
    for (const section of [...SHANK_SECTIONS, "free"] as ShankSection[]) {
      const sh = buildShank({ gou: 11, section, widthMm: 2.4, thicknessMm: 1.6 });
      expect(openEdges(sh.positions), section).toBe(0);
      expect(sh.volumeMm3, section).toBeGreaterThan(0);
      expect(zMax(sh.positions), section).toBeCloseTo(sh.innerRadiusMm + 1.6, 2);
      expect(sh.section).toBe(section);
    }
  });

  it("同じ幅と厚みなら、重さは 甲丸 < 半甲丸 < 平打ち < 角（断面の面積の順）", () => {
    const g = (section: ShankSection) => buildShank({ gou: 11, section, widthMm: 2.4, thicknessMm: 1.6 }).weightG;
    expect(g("kouman")).toBeLessThan(g("hangouman"));
    expect(g("hangouman")).toBeLessThan(g("hirauchi"));
    expect(g("hirauchi")).toBeLessThan(g("kaku"));
    // 甲丸は半楕円（面積 π/4 × 幅 × 厚み）、角は四角に近い（幅 × 厚み）。重さの比はおよそ 0.79 と 1 の比
    const ratio = g("kouman") / g("kaku");
    expect(ratio).toBeGreaterThan(0.72);
    expect(ratio).toBeLessThan(0.86);
  });

  it("角は、厚みを決めなければ幅と同じ（四角）", () => {
    const sh = buildShank({ gou: 11, section: "kaku", widthMm: 2.2 });
    expect(sh.thicknessMm).toBeCloseTo(2.2, 9);
  });

  it("甲丸は、これまでの形のまま（断面を書かないときと同じ）", () => {
    const a = buildShank({ gou: 11 });
    const b = buildShank({ gou: 11, section: "kouman" });
    expect(b.volumeMm3).toBeCloseTo(a.volumeMm3, 9);
  });

  it("手で描く：決まった断面の点から始めると、元の断面に近い形になる", () => {
    for (const section of SHANK_SECTIONS) {
      const preset = buildShank({ gou: 11, section, widthMm: 2.4, thicknessMm: 1.6 }).volumeMm3;
      const drawn = buildShank({ gou: 11, section: "free", sectionPoints: sectionControlPoints(section), widthMm: 2.4, thicknessMm: 1.6 }).volumeMm3;
      expect(Math.abs(drawn / preset - 1), section).toBeLessThan(0.05);
    }
  });

  it("手で描いた線は、幅の端が ±1、真ん中がいちばん高い 1、左右が同じ", () => {
    const out = freeOutline([{ x: 0, y: 1 }, { x: 0.6, y: 0.9 }, { x: 0.9, y: 0.4 }, { x: 1, y: 0 }]);
    const xs = out.map(([x]) => x);
    expect(Math.max(...xs)).toBeCloseTo(1, 6);
    expect(Math.min(...xs)).toBeCloseTo(-1, 1);
    expect(Math.max(...out.map(([, y]) => y))).toBeLessThanOrEqual(1);
    const mid = out.reduce((best, p) => (Math.abs(p[0]) < Math.abs(best[0]) ? p : best));
    expect(mid[1]).toBeCloseTo(1, 2);
    // 左右同じ：+x と −x の同じ所の高さ
    const at = (x: number) => out.reduce((best, p) => (Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best))[1];
    expect(at(0.5)).toBeCloseTo(at(-0.5), 1);
  });

  it("片側の点は整える：最初は真ん中（x ＝ 0）、最後は端の内側（y ＝ 0）、負の値は 0", () => {
    const p = cleanPoints([{ x: 0.3, y: 0.5 }, { x: -0.2, y: 0.9 }, { x: 0.8, y: -0.4 }, { x: 0.9, y: 0.3 }]);
    expect(p[0]).toEqual({ x: 0, y: 0.5 });
    expect(p[1].x).toBe(0);
    expect(p[2].y).toBe(0);
    expect(p[3].y).toBe(0);
  });

  it("決まった断面の線も、幅の端が ±1、真ん中が 1", () => {
    for (const section of SHANK_SECTIONS) {
      const out = sectionOutline(section);
      expect(Math.max(...out.map(([x]) => x)), section).toBeCloseTo(1, 6);
      const mid = out.reduce((best, p) => (Math.abs(p[0]) < Math.abs(best[0]) ? p : best));
      expect(mid[1], section).toBeCloseTo(1, 2);
    }
  });

  it("決まった断面はなめらか：細かく取った線で、となりの線分の向きの差がどこも 1.5° 以下（指の側の角だけは角）", () => {
    for (const section of SHANK_SECTIONS) {
      const c = presetCurve(section);
      const pts = sampleCurve(c.points, curveKnots(c), 200).map((s) => s.p);
      expect(maxTurnDeg(pts), section).toBeLessThan(1.5);
      // 両端は内側の線の上
      expect(pts[0].y).toBeCloseTo(0, 9);
      expect(pts[pts.length - 1].y).toBeCloseTo(0, 9);
    }
  });

  it("3D に使う線も、となりの線分の向きの差が 5° 以下（腕がなめらかに見える）", () => {
    for (const section of SHANK_SECTIONS) {
      const out = sectionOutline(section).map(([x, y]) => ({ x, y }));
      expect(maxTurnDeg(out), section).toBeLessThanOrEqual(5);
    }
  });

  it("甲丸は半楕円に近い（ずれは 0.5 % 以下）、角は四角に近い（角の丸みは小さい）", () => {
    const k = sectionOutline("kouman");
    for (const [x, y] of k) expect(Math.abs(x * x + y * y - 1), `${x},${y}`).toBeLessThan(0.01);
    const kaku = sectionOutline("kaku");
    // 角の 45° の向きの点は、四角の角 (1, 1) の近く
    const corner = kaku.reduce((best, p) => (p[0] + p[1] > best[0] + best[1] ? p : best));
    expect(corner[0] + corner[1]).toBeGreaterThan(1.85);
    // 平打ちは角が角より丸い
    const hira = sectionOutline("hirauchi");
    const hc = hira.reduce((best, p) => (p[0] + p[1] > best[0] + best[1] ? p : best));
    expect(hc[0] + hc[1]).toBeLessThan(corner[0] + corner[1]);
    // 平打ちの上は平ら：幅の真ん中 60 % で高さ 1
    for (const [x, y] of hira) if (Math.abs(x) < 0.3) expect(y).toBeCloseTo(1, 3);
  });
});

function maxTurnDeg(pts: { x: number; y: number }[]): number {
  let m = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const ax = pts[i].x - pts[i - 1].x;
    const ay = pts[i].y - pts[i - 1].y;
    const bx = pts[i + 1].x - pts[i].x;
    const by = pts[i + 1].y - pts[i].y;
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    if (la < 1e-12 || lb < 1e-12) continue;
    m = Math.max(m, (Math.acos(Math.min(1, Math.max(-1, (ax * bx + ay * by) / (la * lb)))) * 180) / Math.PI);
  }
  return m;
}

describe("断面を描く画面の計算（mm）", () => {
  const sym = { sym: true, snap: false };
  it("決まった断面から始めると、幅と厚みはそのまま", () => {
    const ec = startCurve("hirauchi", undefined, undefined, 2.2, 1.6);
    const m = measure(ec);
    expect(m.widthMm).toBeCloseTo(2.2, 3);
    expect(m.thicknessMm).toBeCloseTo(1.6, 3);
  });

  it("動かす：左右対称なら反対側の点もいっしょに動き、真ん中の点は上下だけ。両端の点は内側の線の上だけ", () => {
    const ec = startCurve("kouman", undefined, undefined, 2.2, 1.6);
    const n = ec.pts.length;
    const mid = (n - 1) / 2;
    const thin = movePoint(ec, mid, 0.7, 1.0, sym);
    expect(thin.pts[mid].x).toBe(0);
    expect(measure(thin).thicknessMm).toBeLessThan(1.6);
    const wide = movePoint(ec, 0, 1.6, 0.5, sym);
    expect(wide.pts[0]).toEqual({ x: 1.6, y: 0 });
    expect(wide.pts[n - 1]).toEqual({ x: -1.6, y: 0 });
    expect(measure(wide).widthMm).toBeGreaterThan(3.1);
    const one = movePoint(ec, 1, 1.4, 0.9, sym);
    expect(one.pts[n - 2]).toEqual({ x: -1.4, y: 0.9 });
    // 左右対称でなければ、片側だけ動く
    const asym = movePoint(ec, 1, 1.4, 0.9, { sym: false, snap: false });
    expect(asym.pts[n - 2]).toEqual(ec.pts[n - 2]);
  });

  it("動かす：0.1 mm にそろえる", () => {
    const ec = startCurve("kouman", undefined, undefined, 2.2, 1.6);
    const s = movePoint(ec, 1, 1.234, 0.876, { sym: true, snap: true });
    expect(s.pts[1]).toEqual({ x: 1.2, y: 0.9 });
  });

  it("動かす：厚み 0.3 mm・幅 0.6 mm より小さくなる動きはしない。内側の線より下へは行かない", () => {
    const small = startCurve("kouman", undefined, undefined, 0.8, 0.35);
    const mid = (small.pts.length - 1) / 2;
    expect(movePoint(small, mid, 0, 0.05, sym)).toBe(small);
    const ec = startCurve("kouman", undefined, undefined, 2.2, 1.6);
    const low = movePoint(ec, 2, 0.8, -1, sym);
    expect(low.pts[2].y).toBe(0);
  });

  it("点を足す：線の上を押すと点が増え、形は変わらない。左右対称なら両側に 1 つずつ", () => {
    const ec = startCurve("hangouman", undefined, undefined, 2.4, 1.6);
    const on = pointOn(ec, 0.3);
    const added = addPointAt(ec, on.x, on.y, { sym: true, tolMm: 0.2 })!;
    expect(added.pts.length).toBe(ec.pts.length + 2);
    for (let t = 0; t <= 1; t += 0.01) {
      const a = pointOn(ec, t);
      const b = pointOn(added, t);
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-9);
    }
    expect(isSymmetric(added.pts, added.knots)).toBe(true);
    // 線から遠い所では足さない
    expect(addPointAt(ec, 0, 3, { sym: true, tolMm: 0.2 })).toBeNull();
    // 左右対称でなければ 1 つ
    expect(addPointAt(ec, on.x, on.y, { sym: false, tolMm: 0.2 })!.pts.length).toBe(ec.pts.length + 1);
  });

  it("点を消す：左右対称なら反対側もいっしょに消える。両端と、5 つより少なくなる点は消さない", () => {
    const ec = startCurve("kaku", undefined, undefined, 2.2, 2.2);
    const n = ec.pts.length;
    const d = deletePoint(ec, 2, { sym: true })!;
    expect(d.pts.length).toBe(n - 2);
    expect(d.knots.length).toBe(d.pts.length + 4);
    expect(isSymmetric(d.pts, d.knots)).toBe(true);
    expect(deletePoint(ec, 0, { sym: true })).toBeNull();
    const small = startCurve("kouman", undefined, undefined, 2.2, 1.6); // 7 点
    expect(deletePoint(small, 2, { sym: true })!.pts.length).toBe(5);
    const five = deletePoint(small, 2, { sym: true })!;
    expect(deletePoint(five, 1, { sym: true })).toBeNull();
    // 真ん中の点を消しても左右対称のまま
    const c = deletePoint(ec, (n - 1) / 2, { sym: true })!;
    expect(isSymmetric(c.pts, c.knots)).toBe(true);
  });

  it("左右対称にする：ずれた形を、左右の平均にする", () => {
    const ec = startCurve("kouman", undefined, undefined, 2.2, 1.6);
    const asym = movePoint(ec, 1, 1.5, 1.2, { sym: false, snap: false });
    expect(isSymmetric(asym.pts, asym.knots)).toBe(false);
    const s = makeSymmetric(asym);
    expect(isSymmetric(s.pts, s.knots)).toBe(true);
    expect(s.pts[1].x).toBeCloseTo((1.5 + -ec.pts[ec.pts.length - 2].x) / 2, 9);
  });

  it("自由に描く：ふるえのある指の線を、少ない点のなめらかな線にする（端は内側の線の上、左右対称）", () => {
    // 幅 2.4 mm・厚み 1.5 mm の半楕円を、左の端から右の端へ、少しふるえながらなぞる
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.04;
    const stroke = Array.from({ length: 90 }, (_, i) => {
      const a = Math.PI - (Math.PI * i) / 89;
      return { x: 1.2 * Math.cos(a) + rnd(), y: 1.5 * Math.sin(a) + rnd() };
    });
    const ec = fitStroke(stroke, { sym: true })!;
    expect(ec).not.toBeNull();
    expect(ec.pts.length).toBeGreaterThanOrEqual(6);
    expect(ec.pts.length).toBeLessThanOrEqual(11);
    expect(ec.pts[0].y).toBe(0);
    expect(ec.pts[ec.pts.length - 1].y).toBe(0);
    expect(ec.pts[0].x).toBeGreaterThan(0); // 右の端から始まる向きにそろう
    expect(isSymmetric(ec.pts, ec.knots)).toBe(true);
    const m = measure(ec);
    expect(m.widthMm).toBeCloseTo(2.4, 1);
    expect(m.thicknessMm).toBeCloseTo(1.5, 1);
    // 線は半楕円から 0.06 mm 以内
    for (const { p } of sampleCurve(ec.pts, ec.knots, 10)) expect(Math.abs(Math.hypot(p.x / 1.2, p.y / 1.5) - 1)).toBeLessThan(0.06);
    // なめらか（線のふるえを拾わない）
    expect(maxTurnDeg(sampleCurve(ec.pts, ec.knots, 100).map((s) => s.p))).toBeLessThan(2);
  });

  it("自由に描く：左右対称で片側だけ描けば、折り返して両側に。端が浮いていれば内側の線まで下ろす", () => {
    const half = Array.from({ length: 40 }, (_, i) => {
      const a = Math.PI / 2 - ((Math.PI / 2) * i) / 39;
      return { x: 1.1 * Math.cos(a), y: 0.3 + 1.2 * Math.sin(a) };
    });
    const ec = fitStroke(half, { sym: true })!;
    const m = measure(ec);
    expect(m.widthMm).toBeCloseTo(2.2, 1);
    expect(m.thicknessMm).toBeCloseTo(1.5, 1);
    expect(isSymmetric(ec.pts, ec.knots)).toBe(true);
    // 短すぎる線は使わない
    expect(fitStroke([{ x: 0, y: 0.1 }, { x: 0.01, y: 0.1 }], { sym: true })).toBeNull();
  });

  it("3D に渡す形と、作り直した画面の始まりの形が同じ（描いた線が残る）", () => {
    const ec = movePoint(startCurve("hirauchi", undefined, undefined, 2.2, 1.6), 2, 1.0, 1.3, sym);
    const out = shapeOf(ec);
    expect(out.section).toBe("free");
    const again = startShape("free", out.curve, undefined, Math.round(out.widthMm * 100) / 100, Math.round(out.thicknessMm * 100) / 100);
    expect(sameShape(again, { ...out, widthMm: Math.round(out.widthMm * 100) / 100, thicknessMm: Math.round(out.thicknessMm * 100) / 100 })).toBe(true);
    // 腕の 3D も、その線から作る：幅と厚みがそのまま
    const sh = buildShank({ gou: 11, section: "free", sectionCurve: out.curve, widthMm: out.widthMm, thicknessMm: out.thicknessMm });
    expect(openEdges(sh.positions)).toBe(0);
    expect(zMax(sh.positions)).toBeCloseTo(sh.innerRadiusMm + out.thicknessMm, 2);
  });

  it("set_shank に描いた線を渡すと、状態に残り（作品といっしょに保存される）、決まった断面を選ぶと消える", () => {
    const s = new RingSession(roundStone(), () => seedLedger(), () => undefined, () => "");
    const out = shapeOf(movePoint(startCurve("kouman", undefined, undefined, 2.2, 1.6), 1, 1.3, 1.1, sym));
    const r = s.setShank({ section_curve: out.curve, width_mm: 2.3, thickness_mm: 1.6, reason: "描いた" });
    expect(r.shank.section).toBe("free");
    expect(s.snapshot().sectionCurve?.points.length).toBe(out.curve.points.length);
    s.setShank({ section: "hirauchi", reason: "戻す" });
    expect(s.state.sectionCurve).toBeUndefined();
  });
});

describe("指輪の腕の確かめ（断面によらず）", () => {
  it("目安より薄い・細い腕は、確かめで引っかかる（腕を赤くする場所つき）", () => {
    // 腕の幅の赤は職人の決まりで 0.6 mm 以下（前は資料の 1.7 mm。作者が 1.6 mm でも作れると言った 2026-11-06）
    const ring = buildRing({ stone: roundStone(), setting: { style: "prong" }, shank: { gou: 11, section: "free", sectionPoints: sectionControlPoints("hirauchi"), widthMm: 0.55, thicknessMm: 1.0 } });
    const probs = checkRing(ring);
    const thin = probs.find((p) => p.check === "band-thin");
    const narrow = probs.find((p) => p.check === "band-narrow");
    expect(thin?.requiredValue).toBe(GUIDES.band.minThicknessMm);
    expect(narrow?.requiredValue).toBe(GUIDES.band.minWidthMm);
    expect(thin?.target.kind).toBe("shank");
    expect(thin?.options[0].id).toBe("thickerBand");
  });

  it("目安どおりの腕なら、どの断面でも引っかからない", () => {
    for (const section of SHANK_SECTIONS) {
      const ring = buildRing({ stone: roundStone(), setting: { style: "prong" }, shank: { gou: 11, section } });
      expect(checkRing(ring).filter((p) => p.check.startsWith("band")), section).toEqual([]);
    }
  });

  it("どの断面でも、石座の下の端が腕のいちばん上に当たる", () => {
    for (const section of [...SHANK_SECTIONS, "free"] as ShankSection[]) {
      const ring = buildRing({ stone: triangleStone(), setting: { style: "prong", vAtCorners: false }, shank: { gou: 11, section } });
      const top = ring.shank.outerRadiusMm;
      let bottom = Infinity;
      const a = ring.ringPositions.setting;
      for (let i = 2; i < a.length; i += 3) bottom = Math.min(bottom, a[i]);
      expect(bottom, section).toBeLessThan(top);
      expect(top - bottom, section).toBeLessThanOrEqual(ring.setting.rings[0].wireMm / 2 + 1e-4);
    }
  }, 60000);

  it("set_shank で断面を変えると、地金の重さが変わり、腕の状態に断面が出る", () => {
    const s = new RingSession(roundStone(), () => seedLedger(), () => undefined, () => "");
    const a = s.setShank({ reason: "そのまま" });
    const b = s.setShank({ section: "hirauchi", reason: "平打ちに" });
    const c = s.setShank({ section: "kaku", reason: "角に" });
    expect(a.shank.section).toBe("kouman");
    expect(b.shank.section).toBe("hirauchi");
    expect(b.weight_g).toBeGreaterThan(a.weight_g);
    expect(c.weight_g).toBeGreaterThan(b.weight_g);
    // 手で描いた点を渡すと、断面は free
    const d = s.setShank({ section_points: sectionControlPoints("hangouman"), reason: "描いた" });
    expect(d.shank.section).toBe("free");
    // 断面の名前を選び直すと、描いた点は消える
    s.setShank({ section: "kouman", reason: "戻す" });
    expect(s.state.sectionPoints).toBeUndefined();
  });
});
