// 石を並べる指輪（三石・横一列）：形が正しく組めるか、腕が閉じた形のままか、間の確かめが働くか
import { describe, expect, it, vi } from "vitest";
import { openEdges } from "../src/cad/solid";
import { buildRing, placePoint, type RingParams } from "../src/geometry/ring";
import { roundStone, layoutRow, layoutTrio, scaleStone, trioClearance } from "../src/geometry/multi";
import { joinMesh } from "../src/geometry/bridge";
import { checkRing } from "../src/rules/checks";
import { GUIDES } from "../src/rules/guides";
import { seedLedger } from "../src/rules/ledger";
import { RingSession, slotStone } from "../src/studio/session";
import { parseToolCall } from "../src/claude/tools";
import { howToMake } from "../src/studio/howto";

// 石座を石の数だけ作るので、ふつうのテストより時間がかかる
vi.setConfig({ testTimeout: 30000 });

const center = roundStone(6.5);
const shank = { gou: 11 };

function trio(sideMm = 4, extra = 0): RingParams {
  const side = scaleStone(center, sideMm / center.longMm);
  const lay = layoutTrio(center, side, { style: "prong" }, shank, extra);
  return { stone: center, setting: { style: "prong" }, shank, others: lay.map((atMm) => ({ stone: side, setting: { style: "prong" as const }, atMm })) };
}

describe("三石", () => {
  const ring = buildRing(trio());
  it("石が 3 つ、真ん中の石はいちばん上、両脇は左右に同じ距離", () => {
    expect(ring.stones).toHaveLength(3);
    expect(ring.stones[0].atMm).toBe(0);
    expect(ring.stones[1].atMm).toBeCloseTo(-ring.stones[2].atMm, 6);
    expect(Math.abs(ring.stones[1].atMm)).toBeGreaterThan(3);
  });
  it("腕は閉じた形（STL にそのまま出せる）", () => {
    expect(openEdges(ring.shank.positions)).toBe(0);
  });
  it("石を低くすると、石ごとにザグり（球のビット）と下の輪の座が入り、腕は閉じたまま", () => {
    const p = trio();
    const low = buildRing({ ...p, setting: { ...p.setting, culetGapMm: 0.3 }, others: p.others!.map((o) => ({ ...o, setting: { ...o.setting, culetGapMm: 0.3 } })) });
    expect(low.shank.notchBalls).toHaveLength(3);
    // 球はどれも、その石の真下（その石の座標で x・y がほぼ 0）
    for (const b of low.shank.notchBalls) expect(Math.hypot(b.cx, b.cy)).toBeLessThan(0.3);
    expect(low.shank.railSeatDepthMm).toBeGreaterThan(0);
    expect(openEdges(low.shank.positions)).toBe(0);
    // 両脇の石の真下の腕の上が、削られて低くなっている（その石の座標で、石の先の真下の腕の高さが、外側の半径より低い）
    for (const st of low.stones) {
      const c = Math.cos(st.phi);
      const s = Math.sin(st.phi);
      let top = -Infinity;
      const a = low.shank.positions;
      for (let i = 0; i < a.length; i += 3) {
        const x = a[i];
        const yl = a[i + 1] * c - a[i + 2] * s;
        const zl = a[i + 1] * s + a[i + 2] * c;
        if (Math.abs(x) < 0.05 && Math.abs(yl) < 0.05) top = Math.max(top, zl);
      }
      expect(top).toBeLessThan(low.shank.outerRadiusMm - 0.05);
    }
  });
  it("ロウの丸みは石ごとに付く（一体の石座の仕上げ）", () => {
    const p = trio();
    const r = buildRing({ ...p, solder: true });
    for (const st of r.stones) expect(st.solder?.contacts ?? 0).toBeGreaterThan(0);
  });
  it("両脇の石座は、腕に直角に立つ（腕の丸みに沿って傾く）", () => {
    for (const st of ring.stones.slice(1)) {
      // 石の真ん中（石の座標の原点）から、上（テーブルの側）への向きが、指の軸からの向きと同じ
      const a = placePoint(st.transform, 0, 0, 0);
      const b = placePoint(st.transform, 0, 0, 1);
      const up = [b[1] - a[1], b[2] - a[2]];
      const radial = [a[1], a[2]].map((v) => v / Math.hypot(a[1], a[2]));
      expect(up[0] * radial[0] + up[1] * radial[1]).toBeCloseTo(1, 6);
    }
  });
  it("どの石も指に当たらない（石ごとの指とのすき間）", () => {
    for (const st of ring.stones) expect(st.culetGapMm).toBeGreaterThan(GUIDES.height.minFingerGapMm - 1e-6);
  });
  it("石ごとの三角形の範囲が、並べた形の中で重ならずに続く", () => {
    let s = 0;
    let t = 0;
    for (const st of ring.stones) {
      expect(st.ranges.stone.start).toBe(s);
      expect(st.ranges.setting.start).toBe(t);
      s += st.ranges.stone.count;
      t += st.ranges.setting.count;
    }
    expect(s).toBe(ring.ringPositions.stone.length / 9);
    expect(t).toBe(ring.ringPositions.setting.length / 9);
  });
  it("並べ方のとおりなら、石の間の確かめは出ない", () => {
    const probs = checkRing(ring);
    expect(probs.filter((p) => p.check === "stone-space" || p.check === "metal-space")).toEqual([]);
  });
});

// 三石（2026-11-04 作者の頼み）：脇の石座を真ん中より低く寄せ、石座どうしを短い線でつなぐ
function joinedTrio(side: ReturnType<typeof roundStone>, turn?: number, sideProngs?: number): RingParams {
  const sideHead = { style: "prong" as const, height: GUIDES.multi.trio.sideHeight, prongCount: sideProngs };
  const lay = layoutTrio(center, side, { style: "prong" }, shank, 0, "along", sideHead, turn);
  return {
    stone: center,
    setting: { style: "prong" },
    shank,
    joinHeads: true,
    others: lay.map((atMm) => ({ stone: side, setting: sideHead, atMm, turnRad: turn === undefined ? undefined : Math.sign(atMm) * turn })),
  };
}

describe("三石：寄せて、つなぐ（丸い石の両脇に丸い石）", () => {
  const side = roundStone(center.longMm * GUIDES.multi.sideRatio);
  const ring = buildRing(joinedTrio(side));
  const girdle = (i: number) => placePoint(ring.stones[i].transform, 0, 0, 0);
  it("両脇の石は真ん中の石のそばにあり、腕に沿って少しだけ傾く（30° より小さい）", () => {
    for (const st of ring.stones.slice(1)) {
      expect(Math.abs(st.phi)).toBeLessThan((30 * Math.PI) / 180);
      expect(Math.abs(st.phi)).toBeGreaterThan((10 * Math.PI) / 180);
    }
  });
  it("両脇の石の縁は、真ん中の石の縁より低い（3 つの縁が ゆるい弧）", () => {
    const zc = girdle(0)[2];
    for (const i of [1, 2]) {
      const g = girdle(i);
      expect(g[2]).toBeLessThan(zc - 1);
      // 指の軸からの距離も、真ん中より小さい（脇の石座が低い）
      expect(Math.hypot(g[1], g[2])).toBeLessThan(Math.hypot(girdle(0)[1], zc));
    }
  });
  it("石どうし・爪どうしが当たらず、爪がとなりの石に入りこまない", () => {
    for (const i of [1, 2]) {
      const c = trioClearance(ring.stones[0], ring.stones[i]);
      expect(c.stoneGapMm).toBeGreaterThan(GUIDES.multi.trio.stoneGapMm - 0.02);
      expect(c.prongGapMm).toBeGreaterThan(GUIDES.multi.trio.prongGapMm - 0.02);
      expect(c.prongInStone).toBe(false);
    }
  });
  it("真ん中と両脇の石座は、短い線でつながる（線の両端が、それぞれの石座の輪の中）", () => {
    expect(ring.joins.map((j) => [j.a, j.b])).toEqual([
      [0, 1],
      [0, 2],
    ]);
    const railPts = (i: number) => {
      const st = ring.stones[i];
      return [st.setting.upperRail!, st.setting.lowerRail!].flatMap((r) => r.pts.map(([x, y, z]) => placePoint(st.transform, x, y, z)));
    };
    const near = (p: number[], pts: number[][]) => Math.min(...pts.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])));
    for (const j of ring.joins) {
      expect(near(j.from, railPts(j.a))).toBeLessThan(1e-6);
      expect(near(j.to, railPts(j.b))).toBeLessThan(1e-6);
      expect(j.radiusMm).toBeGreaterThan(0.1);
      // 線は閉じた形（STL にそのまま出せる）
      expect(openEdges(joinMesh(j).positions)).toBe(0);
    }
  });
  it("つなぐ線の形は、脇の石の石座の三角形の後ろに入り、範囲は続いたまま", () => {
    let t = 0;
    for (const st of ring.stones) {
      expect(st.ranges.setting.start).toBe(t);
      t += st.ranges.setting.count;
    }
    expect(t).toBe(ring.ringPositions.setting.length / 9);
    expect(ring.stones[1].ranges.setting.count).toBeGreaterThan(ring.stones[1].setting.positions.length / 9);
    expect(ring.ringPositions.settingNormals!.length).toBe(ring.ringPositions.setting.length);
  });
  it("腕は閉じた形で、石ごとにロウ付けの座がある", () => {
    expect(openEdges(ring.shank.positions)).toBe(0);
    const r = buildRing({ ...joinedTrio(side), solder: true });
    for (const st of r.stones) expect(st.solder?.contacts ?? 0).toBeGreaterThan(0);
  });
  it("このまま作れます（確かめがひとつも出ない）", () => {
    expect(checkRing(ring)).toEqual([]);
  });
  it("つないだ石座どうしは地金の間を数えないが、つながないと間の確かめは前のとおり働く", () => {
    const loose = buildRing({ ...joinedTrio(side), joinHeads: false });
    expect(loose.joins).toEqual([]);
    expect(checkRing(ring).some((p) => p.check === "metal-space")).toBe(false);
  });
});

describe("三石：両脇にペア（先を外へ）", () => {
  const pear = slotStone(center, { shape: "pear", longMm: Math.round(center.longMm * GUIDES.multi.sideRatio * 1.5 * 10) / 10 });
  const ring = buildRing(joinedTrio(pear, Math.PI / 2, GUIDES.multi.trio.pearProngCount));
  it("ペアの先（形の +x）は、真ん中の石から遠い側を向く", () => {
    for (const st of ring.stones.slice(1)) {
      const tip = placePoint(st.transform, pear.longMm / 2, 0, 0);
      const back = placePoint(st.transform, -pear.longMm / 2, 0, 0);
      expect(Math.abs(tip[1])).toBeGreaterThan(Math.abs(back[1]));
    }
  });
  it("当たらず、つながり、確かめも出ない", () => {
    for (const i of [1, 2]) {
      const c = trioClearance(ring.stones[0], ring.stones[i]);
      expect(c.stoneGapMm).toBeGreaterThan(GUIDES.multi.trio.stoneGapMm - 0.02);
      expect(c.prongInStone).toBe(false);
    }
    expect(ring.joins).toHaveLength(2);
    expect(checkRing(ring)).toEqual([]);
  });
});

describe("横一列（同じ石を 5 つ）", () => {
  const small = roundStone(3);
  const at = layoutRow(small, 5, { style: "prong" }, shank);
  const ring = buildRing({ stone: small, setting: { style: "prong" }, shank, atMm: at[0], others: at.slice(1).map((a) => ({ stone: small, setting: { style: "prong" as const }, atMm: a })) });
  it("5 つの石が、腕に沿って等しい間で並ぶ", () => {
    expect(ring.stones).toHaveLength(5);
    const sorted = [...ring.stones].map((s) => s.atMm).sort((a, b) => a - b);
    const d = sorted.slice(1).map((v, i) => v - sorted[i]);
    for (const x of d) expect(x).toBeCloseTo(d[0], 6);
  });
  it("腕は閉じた形のまま", () => {
    expect(openEdges(ring.shank.positions)).toBe(0);
  });
  it("石ごとに、爪の確かめが走る（石の番号つき）", () => {
    // 細い爪にすると、5 つの石のどれでも爪の太さの確かめが出る
    const thin = buildRing({ stone: small, setting: { style: "prong", prongDiameterMm: 0.3 }, shank, atMm: at[0], others: at.slice(1).map((a) => ({ stone: small, setting: { style: "prong" as const, prongDiameterMm: 0.3 }, atMm: a })) });
    const probs = checkRing(thin).filter((p) => p.check === "prong-thin");
    const stones = new Set(probs.map((p) => p.stone ?? 0));
    expect(stones.size).toBe(5);
    expect(probs.some((p) => p.where.startsWith("石 3"))).toBe(true);
  });
});

describe("石の間の確かめ", () => {
  it("石を寄せすぎると、石の間の確かめが出て、場所の点がある", () => {
    const side = scaleStone(center, 4 / center.longMm);
    const ring = buildRing({ stone: center, setting: { style: "prong" }, shank, others: [{ stone: side, setting: { style: "prong" }, atMm: 5 }] });
    const probs = checkRing(ring).filter((p) => p.check === "stone-space" || p.check === "metal-space");
    expect(probs.length).toBeGreaterThan(0);
    const p = probs[0];
    expect(p.target.kind).toBe("space");
    if (p.target.kind === "space") expect(p.target.point.every(Number.isFinite)).toBe(true);
    expect(p.options.map((o) => o.id)).toContain("spreadStones");
  });
  it("石座どうしが少しだけ離れている（つながらず、目安より狭い）と、地金の間の確かめが出る", () => {
    const side = scaleStone(center, 4 / center.longMm);
    // ちょうど離れる所を探して、その少し外に置く
    let at = 4;
    for (; at < 10; at += 0.05) {
      const r = buildRing({ stone: center, setting: { style: "prong" }, shank, others: [{ stone: side, setting: { style: "prong" }, atMm: at }] });
      const m = checkRing(r).find((p) => p.check === "metal-space");
      if (m && m.currentValue > 0) {
        expect(m.currentValue).toBeLessThan(GUIDES.multi.metalGapMinMm);
        return;
      }
    }
    throw new Error("地金の間が狭い所が見つからない");
  });
  it("広げる直し方で、石の間の確かめが消える", () => {
    const side = scaleStone(center, 4 / center.longMm);
    const lay = layoutTrio(center, side, { style: "prong" }, shank, 0);
    const ring = buildRing({ stone: center, setting: { style: "prong" }, shank, others: lay.map((atMm) => ({ stone: side, setting: { style: "prong" as const }, atMm })) });
    expect(checkRing(ring).some((p) => p.check === "metal-space" || p.check === "stone-space")).toBe(false);
  });
});

describe("作り方：石座の工程を石ごとにくり返す", () => {
  const ring = buildRing(trio());
  const input = { ring, outlineMm: center.outlineMm, longMm: center.longMm, widthMm: center.widthMm, depthMm: center.depthMm, metalLabel: "K18" };
  it("手作り：石座を組む・腕に付ける・石を留めるが、石の数だけ。腕と仕上げは 1 回", () => {
    const steps = howToMake(input, "hand");
    const titles = steps.map((s) => s.title);
    for (const n of [1, 2, 3]) {
      expect(titles).toContain(`石座を組む（石 ${n}）`);
      expect(titles).toContain(`石座を腕に付ける（石 ${n}）`);
    }
    expect(titles.filter((t) => t === "仕上げ")).toHaveLength(1);
    expect(titles).toContain("石の並びを腕に写す");
    expect(steps.find((s) => s.title === "石座を腕に付ける（石 2）")!.specs[0].value).toContain("腕に沿って");
  });
  it("鋳造：原型は 1 つ、石留めは石の数だけ", () => {
    const titles = howToMake(input, "cast").map((s) => s.title);
    expect(titles.filter((t) => t.startsWith("原型を作る"))).toHaveLength(1);
    expect(titles.filter((t) => t.includes("（石 "))).toHaveLength(3);
  });
});

describe("設計の場（RingSession）で石を並べる", () => {
  const make = () => new RingSession(roundStone(6), () => seedLedger(), () => undefined, () => "");
  it("set_stones の道具で三石にすると、両脇に小さめの石が並び、確かめが石ごとに走る", () => {
    const s = make();
    const r = s.setStones({ layout: "trio", reason: "三石にしたい" });
    expect(r.stones).toHaveLength(3);
    expect(r.stones[1].long_mm).toBeCloseTo(6 * GUIDES.multi.sideRatio, 1);
    expect(s.built!.ring.stones).toHaveLength(3);
    expect(s.built!.problems.filter((p) => p.target.kind === "space")).toEqual([]);
    // 既定：両脇は丸い石、低めの石座、つないで 1 つ。確かめはひとつも出ない
    expect(s.state.stones!.map((x) => x.shape)).toEqual(["round", "round"]);
    expect(s.built!.ring.stones[1].setting.heights.culetGapMm).toBeLessThan(s.built!.ring.stones[0].setting.heights.culetGapMm);
    expect(s.built!.ring.joins).toHaveLength(2);
    expect(s.built!.problems).toEqual([]);
  });
  it("三石の脇の石をペアにすると、先が外を向き、確かめが出ない", () => {
    const s = make();
    s.arrange("trio", { sideShape: "pear" });
    const b = s.build();
    expect(b.ring.stones[2].transform.rotationZ).toBeCloseTo(Math.PI / 2, 6);
    expect(b.ring.stones[1].transform.rotationZ).toBeCloseTo(-Math.PI / 2, 6);
    expect(b.problems).toEqual([]);
  });
  it("横一列 5 つ、一粒へ戻す", () => {
    const s = make();
    s.setStones({ layout: "row", count: 5, reason: "ハーフエタニティ風" });
    expect(s.built!.ring.stones).toHaveLength(5);
    s.setStones({ layout: "solo", reason: "一粒に戻す" });
    expect(s.built!.ring.stones).toHaveLength(1);
    expect(s.state.stones).toBeUndefined();
  });
  it("人が置いた石を寄せすぎると間の確かめが出て、直し方「石の間を広げる」をくり返すと消える", () => {
    const s = make();
    s.addStone(2.5, { shape: "round", longMm: 3.5 });
    let b = s.build();
    expect(b.problems.some((p) => p.target.kind === "space")).toBe(true);
    for (let k = 0; k < 10 && b.problems.some((p) => p.target.kind === "space"); k++) {
      const p = b.problems.find((q) => q.target.kind === "space")!;
      s.spreadStones(p.target.kind === "space" ? p.target.stones : undefined);
      b = s.build();
    }
    expect(b.problems.some((p) => p.target.kind === "space")).toBe(false);
  });
  it("動かす・外す", () => {
    const s = make();
    s.addStone(7);
    s.moveStone(1, -7);
    expect(s.build().ring.stones[1].atMm).toBe(-7);
    s.removeStone(1);
    expect(s.build().ring.stones).toHaveLength(1);
  });
  it("道具の入力：石の数の範囲を確かめる", () => {
    expect(parseToolCall("set_stones", { layout: "row", count: 5, reason: "並べる" }).ok).toBe(true);
    expect(parseToolCall("set_stones", { layout: "row", count: 50, reason: "並べる" }).ok).toBe(false);
    expect(parseToolCall("set_stones", { layout: "ring", reason: "並べる" }).ok).toBe(false);
  });
});
