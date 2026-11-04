// 腕の間に挟む石座（職人 石川の言葉 2026-11-04）：腕のいちばん上を切り、腕の両端の間に、板を丸めた下の輪をはさんでロウ付けする
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openEdges } from "../src/cad/solid";
import { bandDistance, collarInRing } from "../src/geometry/joint";
import { buildRing, type RingParams } from "../src/geometry/ring";
import { polygonDistance } from "../src/geometry/setting";
import { stoneScaleAt, type StoneParams } from "../src/geometry/stone";
import { parseToolCall } from "../src/claude/tools";
import { checkRing, holdRatio } from "../src/rules/checks";
import { GUIDES } from "../src/rules/guides";
import { seedLedger } from "../src/rules/ledger";
import { howToMake } from "../src/studio/howto";
import { presetOutline, PRESETS } from "../src/studio/presets";
import { RingSession } from "../src/studio/session";
import { stoneFrom } from "./helpers/stones";
import { regular, triangle } from "./helpers/synth";

const preset = (id: string, longMm?: number, widthMm?: number, depthMm?: number): StoneParams => {
  const p0 = PRESETS.find((p) => p.id === id)!;
  const p = { ...p0, longMm: longMm ?? p0.longMm, widthMm: widthMm ?? p0.widthMm, depthMm: depthMm ?? p0.depthMm };
  return { outlineMm: presetOutline(p), longMm: p.longMm, widthMm: p.widthMm, depthMm: p.depthMm };
};
const round = preset("round");
const oval = preset("oval", 5, 4, 2.5);

const params = (o: Partial<RingParams> = {}, setting: Partial<RingParams["setting"]> = {}): RingParams => ({
  stone: round,
  setting: { style: "prong", prongCount: 4, join: "between", ...setting },
  shank: { gou: 11, widthMm: 1.8 },
  ...o,
});

/** 三角形の頂点（xyz の組）を順に */
function* verts(p: Float32Array) {
  for (let i = 0; i < p.length; i += 3) yield [p[i], p[i + 1], p[i + 2]] as const;
}

describe("腕の間に挟む石座：形", () => {
  const ring = buildRing(params());
  const c = ring.setting.collar!;

  it("付け方を書かなければ、今までどおり腕の上にのせる（下の輪の筒も、腕を切ることもない）", () => {
    const on = buildRing(params({}, { join: undefined }));
    expect(on.setting.join).toBe("on");
    expect(on.setting.collar).toBeNull();
    expect(on.shank.ends).toBeNull();
    expect(ring.setting.join).toBe("between");
  });

  it("腕のいちばん上が、下の輪の外の面のところで切ってある（輪の中に腕がない）", () => {
    const ends = ring.shank.ends!;
    expect(ends).toHaveLength(2);
    // 腕の端は ＋y と −y に 1 つずつ、輪の外の面（腕の真ん中の線で交わる所）から 0.03 mm 内
    const ys = c.ends.map((e) => Math.abs(e.v));
    for (const e of ends) expect(Math.abs(e.y)).toBeCloseTo(ys[0] - 0.03, 2);
    expect(Math.sign(ends[0].y)).not.toBe(Math.sign(ends[1].y));
    // 上の側（z > 0）で、上から見て輪の外の線より内に、腕の点は板の厚みの半分より深く入らない（端のふたの真ん中が、輪の壁の中に少し入るだけ）
    // 輪は円すいなので、その高さの外の線で見る
    const dOut = polygonDistance(c.outer, 0.02);
    const inRing = collarInRing(ring.setting, ring.transform)!;
    let inside = 0;
    for (const [x, y, z] of verts(ring.shank.positions)) if (z > 0 && dOut(x, y) + (inRing.topZ - z) * inRing.taperTan < -c.wallMm / 2) inside++;
    expect(inside).toBe(0);
    // 腕は閉じた形のまま（両端にふた）
    expect(openEdges(ring.shank.positions)).toBe(0);
    // 切った分だけ軽い
    const on = buildRing(params({}, { join: "on" }));
    expect(ring.shank.volumeMm3).toBeLessThan(on.shank.volumeMm3);
  });

  it("下の輪は板を丸めた輪：断面が四角い筒で、閉じている。高さは腕の厚み、板の厚みは目安", () => {
    const tri = ring.setting.rings[1].triangles;
    const collar = ring.setting.positions.subarray(tri.start * 9, (tri.start + tri.count) * 9);
    expect(collar.length).toBeGreaterThan(0);
    expect(openEdges(collar)).toBe(0);
    expect(c.wallMm).toBe(GUIDES.join.between.collarWallMm);
    // 高さは目安（腕の厚み × 割合）以上で、腕の端の上が輪の上からはみ出さない高さ
    expect(c.heightMm).toBeGreaterThanOrEqual(ring.shank.thicknessMm * GUIDES.join.between.collarHeightRatio - 1e-9);
    expect(c.heightMm).toBeLessThanOrEqual(ring.shank.thicknessMm + 0.1);
    // 上は平ら、下は指の丸みに合わせてある（指の真上がいちばん高く、腕の端の所で下がる）
    expect(c.topZ - c.fingerZ).toBeCloseTo(c.heightMm, 6);
    expect(c.bottomZ).toBeLessThan(c.fingerZ);
    // 内の線は外の線から板の厚みだけ内
    const d = Math.hypot(c.outer[0].x - c.inner[0].x, c.outer[0].y - c.inner[0].y);
    expect(d).toBeCloseTo(c.wallMm, 6);
  });

  it("腕の両はしが、下の輪の横にまるごと当たる（腕の端の上も輪の上からはみ出さない）", () => {
    expect(c.ends).toHaveLength(2);
    for (const e of c.ends) expect(e.ratio).toBeCloseTo(1, 6);
  });

  it("上から見て、上の輪は石に隠れる（輪の外の線が石の縁の内）。輪は縁の下で、石の下側の斜めの面に当たる", () => {
    const rail = ring.setting.upperRail!;
    const R = round.longMm / 2;
    for (const [x, y] of rail.pts) expect(Math.hypot(x, y) + rail.radiusMm).toBeLessThan(R - 0.1);
    // 輪の高さで、石の下側の面より外に輪の中心があり、輪の内の端は下側の面にくいこむ（ザグって当てる）
    const h = ring.setting.heights;
    const z = h.upperRingZ!;
    const pavR = R * stoneScaleAt(h, z);
    const rc = Math.hypot(rail.pts[0][0], rail.pts[0][1]);
    expect(rc).toBeGreaterThan(pavR);
    expect(rc - rail.radiusMm).toBeLessThan(pavR);
    // 縁の下から 1/3 ほど下（CAD の手引きの三分の一の決まり）
    expect(-z).toBeGreaterThan(h.pavilionMm * 0.25);
    expect(-z).toBeLessThan(h.pavilionMm * 0.75);
  });

  it("石は低く、下側が下の輪にくっつくぐらい：石の一番下は下の輪の上の端より下（輪の中）で、上の輪と下の輪の間は狭い", () => {
    const h = ring.setting.heights;
    expect(h.culetZ).toBeLessThan(c.topZ);
    const window = h.upperRingZ! - ring.setting.upperRail!.radiusMm - c.topZ;
    expect(window).toBeGreaterThan(0.05);
    expect(window).toBeLessThan(0.6);
  });

  it("留まりの基準は同じ付け方の標準の形：標準の太さの爪なら 1.0×（腕の上にのせる形の基準は変わらない）", () => {
    expect(holdRatio(ring.setting)).toBeCloseTo(1, 6);
    const on = buildRing(params({}, { join: "on" }));
    expect(on.setting.standardLengthMm).not.toBeCloseTo(ring.setting.standardLengthMm, 3);
  });

  it("爪はまっすぐ斜め（水平から目安の角度）。下の輪の外も同じ傾きで、指へ向かって少しすぼまる", () => {
    const tanA = Math.tan(((90 - GUIDES.join.between.prongAngleDeg) * Math.PI) / 180);
    const top = Math.hypot(c.outer[0].x, c.outer[0].y);
    const low = Math.hypot(c.outerLow[0].x, c.outerLow[0].y);
    expect((top - low) / (c.topZ - c.bottomZ)).toBeCloseTo(tanA, 1);
    expect(low).toBeLessThan(top);
  });

  it("石の下は腕がないのでザグらない。石の一番下は下の輪の中にある", () => {
    expect(ring.notchDepthMm).toBe(0);
    const h = ring.setting.heights;
    expect(h.culetZ).toBeGreaterThan(c.fingerZ);
    expect(h.culetZ).toBeLessThan(c.topZ);
    expect(ring.culetGapMm).toBeGreaterThanOrEqual(GUIDES.height.minFingerGapMm);
    // 上の輪は縁の少し下（丸線）
    expect(h.upperRingZ!).toBeLessThan(h.girdleMm / 2);
    expect(h.upperRingZ!).toBeGreaterThan(c.topZ);
  });

  it("爪は下の輪の外から立ち上がる（爪の数・留まりの数は今までどおり測れる）", () => {
    expect(ring.setting.prongs).toHaveLength(4);
    for (const p of ring.setting.prongs) {
      expect(p.lengthMm).toBeGreaterThan(0);
      expect(p.triangles.count).toBeGreaterThan(0);
    }
  });

  it("長辺を指を横切る向き（横）にしても、腕の端は下の輪に当たり、閉じた形", () => {
    const across = buildRing(params({ stone: oval, orientation: "across" }));
    const along = buildRing(params({ stone: oval, orientation: "along" }));
    // 横：オーバルの長辺（5 mm）が腕に沿う → 腕の端は、縦（幅 4 mm が腕に沿う）より遠い
    expect(Math.abs(across.shank.ends![0].y)).toBeGreaterThan(Math.abs(along.shank.ends![0].y) + 0.3);
    for (const r of [across, along]) {
      expect(openEdges(r.shank.positions)).toBe(0);
      expect(r.setting.collar!.ends.every((e) => e.ratio >= GUIDES.join.between.minEndContactRatio)).toBe(true);
    }
  });

  it("石を並べる指輪は、腕の上にのせる（腕の間に挟むのは一粒だけ）", () => {
    const multi = buildRing(params({ others: [{ stone: preset("round", 3, 3, 1.8), setting: { style: "prong", join: "between" }, atMm: 5 }] }));
    expect(multi.stones.every((s) => s.setting.join === "on")).toBe(true);
    expect(multi.shank.ends).toBeNull();
  });
});

describe("腕の間に挟む石座：一体の形と STL", () => {
  it("一体の石座・腕・ロウの丸みは、どれも閉じた形（STL にそのまま使える）。ロウは腕の両はしの 2 か所", () => {
    const ring = buildRing(params({ solder: true }, { solid: true, solidQuality: "preview" }));
    expect(ring.solder?.contacts).toBe(2);
    const solder = ring.ringPositions.setting.subarray(ring.solder!.triangles.start * 9);
    expect(openEdges(ring.setting.positions)).toBe(0);
    expect(openEdges(solder)).toBe(0);
    expect(openEdges(ring.shank.positions)).toBe(0);
    // ロウの丸みは、腕の両はしのそば（y の正と負）
    let plus = 0;
    let minus = 0;
    for (const [, y] of verts(solder)) (y > 0 ? plus++ : minus++);
    expect(plus).toBeGreaterThan(0);
    expect(minus).toBeGreaterThan(0);
    // 石座の下の面は指の中へ出ない（指の円の内側に点がない）
    const r = ring.shank.innerRadiusMm;
    let below = 0;
    for (const [, y, z] of verts(ring.ringPositions.setting)) if (z > 0 && Math.hypot(y, z) < r - 0.06) below++;
    expect(below).toBe(0);
  }, 60000);
});

/** 三角形の面を頂点でつないで、いくつの形に分かれるかを数える */
function shellCount(p: Float32Array): number {
  const key = (i: number) => `${p[i].toFixed(4)},${p[i + 1].toFixed(4)},${p[i + 2].toFixed(4)}`;
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let x = a;
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  for (let t = 0; t < p.length; t += 9) {
    const v = [key(t), key(t + 3), key(t + 6)];
    for (const a of v) if (!parent.has(a)) parent.set(a, a);
    parent.set(find(v[0]), find(v[1]));
    parent.set(find(v[1]), find(v[2]));
  }
  return new Set([...parent.keys()].map(find)).size;
}

describe("腕の間に挟む石座：角のある石の STL（2026-11-05 作者：一部つながっていない）", () => {
  const tri = (mm: number) => stoneFrom(triangle(200, 200, 160, 140), mm, mm * 0.4775);
  const sq = (mm: number) => stoneFrom(regular(0, 0, 500, 4, 0.3), mm, mm * 0.6);
  const cases: [string, StoneParams, "along" | "across"][] = [
    ["既定の三角", stoneFrom(triangle(200, 200, 160, 140), 8.88, 4.24), "along"],
    ["スクエア", preset("princess"), "along"],
    ["スクエア（横）", preset("princess"), "across"],
    // ロウの丸みが箱の面で切れていた大きさ
    ["三角 5 mm（横）", tri(5), "across"],
    ["三角 6 mm（横）", tri(6), "across"],
    ["三角 12 mm", tri(12), "along"],
    ["四角 3 mm", sq(3), "along"],
    ["スクエア 3 mm", preset("princess", 3, 3, 2.2), "along"],
  ];
  it.each(cases)("%s：石座は 1 つの形で閉じ、ロウの丸みも腕の両はしの 2 か所で閉じる", (_n, stone, orientation) => {
    // 腕は画面の既定の太さ（腕の幅で、丸みの当たり方が変わる）
    const ring = buildRing(params({ stone, orientation, solder: true, shank: { gou: 11, metal: "k18y" } }, { prongCount: undefined, solid: true, solidQuality: "preview" }));
    expect(shellCount(ring.setting.positions)).toBe(1);
    expect(openEdges(ring.setting.positions)).toBe(0);
    expect(ring.solder?.contacts).toBe(2);
    expect(openEdges(ring.ringPositions.setting.subarray(ring.solder!.triangles.start * 9))).toBe(0);
  }, 60000);

  it("三角は、高さ・爪の本数を変えても 1 つの形", () => {
    for (const height of ["low", "high"] as const) {
      for (const prongCount of [3, 6]) {
        const ring = buildRing(params({ stone: tri(8.88), shank: { gou: 11, metal: "k18y" } }, { height, prongCount, solid: true, solidQuality: "preview" }));
        expect(shellCount(ring.setting.positions)).toBe(1);
      }
    }
  }, 60000);
});

describe("腕の間に挟む石座：爪を腕へ刺さない（職人：爪を 1 本ずつ腕へ刺す作りはしない。2026-11-05 作者：腕から爪が生えている）", () => {
  const tri = stoneFrom(triangle(200, 200, 160, 140), 8.88, 4.24);
  const cases: [string, StoneParams, "along" | "across", number | undefined][] = [
    ["既定の三角", tri, "along", undefined],
    ["三角の 6 本爪", tri, "along", 6],
    ["ペア", preset("pear"), "along", undefined],
    ["ペア（横）", preset("pear"), "across", undefined],
    ["マーキス（横）", preset("marquise"), "across", undefined],
    ["ラウンドの 6 本爪", round, "along", 6],
    ["スクエアの 6 本爪", preset("princess"), "along", 6],
  ];
  it.each(cases)("%s：腕の中へ入るのは、爪を輪につなぐ分（0.3 mm）まで", (_n, stone, orientation, prongCount) => {
    const ring = buildRing(params({ stone, orientation, solder: false, shank: { gou: 11, metal: "k18y" } }, { prongCount }));
    const d = bandDistance(ring.shank);
    const pos = ring.ringPositions.setting;
    for (const pr of ring.setting.prongs) {
      let deepest = 0;
      const t = pr.triangles;
      for (let k = t.start * 9; k < (t.start + t.count) * 9; k += 3) deepest = Math.min(deepest, d(pos[k], pos[k + 1], pos[k + 2]));
      expect(-deepest).toBeLessThanOrEqual(0.3);
    }
  });
});

/** 高さ z で切った断面の輪の数 */
function loopsAt(p: Float32Array, z: number): number {
  const key = (a: number[]) => `${a[0].toFixed(3)},${a[1].toFixed(3)}`;
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let x = a;
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  for (let t = 0; t < p.length; t += 9) {
    const v = [0, 1, 2].map((k) => [p[t + k * 3], p[t + k * 3 + 1], p[t + k * 3 + 2]]);
    const pts: number[][] = [];
    for (let k = 0; k < 3; k++) {
      const a = v[k];
      const b = v[(k + 1) % 3];
      if ((a[2] - z) * (b[2] - z) < 0) {
        const u = (z - a[2]) / (b[2] - a[2]);
        pts.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
      }
    }
    if (pts.length !== 2) continue;
    const a = key(pts[0]);
    const b = key(pts[1]);
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    parent.set(find(a), find(b));
  }
  return new Set([...parent.keys()].map(find)).size;
}

describe("腕の間に挟む石座：下の輪は、どの爪にも届く（2026-11-05 作者：ペアの先で届いていない）", () => {
  const cases: [string, StoneParams][] = [
    ["ペア", preset("pear")],
    ["マーキス", preset("marquise")],
    ["スクエア", preset("princess")],
    ["既定の三角", stoneFrom(triangle(200, 200, 160, 140), 8.88, 4.24)],
    ["ラウンド", round],
    ["エメラルド", preset("emerald")],
  ];
  it.each(cases)("%s：下の輪の上の端の少し下で切ると、爪と輪が 1 つの輪郭（外と内の 2 つだけ）", (_n, stone) => {
    const ring = buildRing(params({ stone, solder: false, shank: { gou: 11, metal: "k18y" } }, { prongCount: undefined, solid: true, solidQuality: "preview" }));
    const c = ring.setting.collar!;
    expect(loopsAt(ring.setting.positions, c.topZ - 0.3)).toBe(2);
  }, 60000);
});

describe("腕の間に挟む石座：腕の端は、下の輪に下まで当たる（2026-11-05 作者：腕と石座がくっついていない）", () => {
  const tri = stoneFrom(triangle(200, 200, 160, 140), 8.88, 4.24);
  const cases: [string, StoneParams, "along" | "across"][] = [
    ["三角・縦", tri, "along"],
    ["三角・横", tri, "across"],
    ["ラウンド", round, "along"],
    ["スクエア", preset("princess"), "along"],
    ["ペア", preset("pear"), "along"],
  ];
  it.each(cases)("%s：腕の内の面の端が、その高さの輪の外の面から 0.06 mm 以内", (_n, stone, orientation) => {
    const ring = buildRing(params({ stone, orientation, solder: false, shank: { gou: 11, metal: "k18y" } }));
    const c = collarInRing(ring.setting, ring.transform)!;
    const dOut = polygonDistance(c.outer.map(([x, y]) => ({ x, y })), 0.01);
    const r = ring.shank.innerRadiusMm;
    const pos = ring.shank.positions;
    // 腕の内の面（指に当たる面）の、上の側の点で、輪の外の面にいちばん近い点の離れ（＋の側と −の側）
    let plus = Infinity;
    let minus = Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      const [x, y, z] = [pos[i], pos[i + 1], pos[i + 2]];
      if (z <= 0 || Math.abs(Math.hypot(y, z) - r) > 0.01 || Math.abs(x) > 0.7) continue;
      const d = dOut(x, y) + (c.topZ - z) * c.taperTan;
      if (y > 0) plus = Math.min(plus, d);
      else minus = Math.min(minus, d);
    }
    expect(plus).toBeLessThan(0.06);
    expect(minus).toBeLessThan(0.06);
  });
});

describe("腕の間に挟む石座：爪の位置は腕を避ける（職人 2026-11-05）", () => {
  const tri = stoneFrom(triangle(200, 200, 160, 140), 8.88, 4.24);
  it("爪の中心は、腕の幅と爪の半径より外にある（角のない石は、爪の配りをそろえたまま回す）", () => {
    for (const [stone, orientation, prongCount] of [[round, "along", 6], [round, "across", 6], [preset("oval"), "along", 6], [preset("princess"), "along", 6]] as const) {
      const ring = buildRing(params({ stone, orientation, shank: { gou: 11, metal: "k18y" } }, { prongCount }));
      const axis = ring.transform.rotationZ;
      for (const pr of ring.setting.prongs) {
        const u = pr.point.x * Math.cos(axis) - pr.point.y * Math.sin(axis);
        expect(Math.abs(u)).toBeGreaterThan(ring.shank.widthMm / 2);
      }
    }
  });
  it("既定の向きは、尖った角が腕に当たらない向き。人が向きを選べば、それに従う", () => {
    const s = new RingSession(tri, () => seedLedger(), () => undefined, () => "");
    expect(s.build("x").problems.filter((p) => p.check === "corner")).toEqual([]);
    expect(s.state.orientation).toBe("across");
    s.setSetting({ orientation: "along", reason: "x" });
    expect(s.state.orientation).toBe("along");
    s.build("y");
    expect(s.state.orientation).toBe("along");
  });
  it("丸い石は、向きを変えない", () => {
    const s = new RingSession(round, () => seedLedger(), () => undefined, () => "");
    s.build("x");
    expect(s.state.orientation).toBe("along");
  });
});

describe("腕の間に挟めない石（2026-11-05 点検：石座が塔のようにのびても「作れます」と出た）", () => {
  const small = (id: string, mm: number) => {
    const p0 = PRESETS.find((p) => p.id === id)!;
    const k = mm / p0.longMm;
    return preset(id, mm, p0.widthMm * k, p0.depthMm * k);
  };
  it.each([["marquise", 5], ["marquise", 6], ["emerald", 3.5], ["pear", 5]] as const)("%s %s mm：石座はのびず、腕の上にのる。別の留め方をすすめる印が立つ", (id, mm) => {
    const s = new RingSession(small(id, mm), () => seedLedger(), () => undefined, () => "");
    const r = s.build("x").ring;
    expect(r.culetGapMm).toBeLessThan(3);
    expect(r.setting.join).toBe("on");
  });
  it("人が「腕の間に挟む」を選べば従い、収まらないことを確かめが知らせる", () => {
    const s = new RingSession(small("marquise", 5), () => seedLedger(), () => undefined, () => "");
    s.build("x");
    s.setSetting({ join: "between", reason: "x" });
    const b = s.built!;
    expect(b.ring.setting.join).toBe("between");
    expect(b.problems.map((p) => p.check)).toContain("collar-stone");
  });
  it("7.5 mm の三角は腕の間に挟める（小さな石の扱いにならない）", () => {
    const s = new RingSession(stoneFrom(triangle(200, 200, 160, 140), 7.5, 3.6), () => seedLedger(), () => undefined, () => "");
    expect(s.build("x").ring.setting.join).toBe("between");
  });
});

describe("腕の間に挟む石座：爪の下の端（職人 2026-11-05：輪に埋まっている。丸い先が輪の下に出ることはない）", () => {
  const tri = stoneFrom(triangle(200, 200, 160, 140), 8.88, 4.24);
  const cases: [string, StoneParams, "along" | "across"][] = [
    ["ラウンド", round, "along"],
    ["スクエア", preset("princess"), "along"],
    ["既定の三角", tri, "along"],
    ["マーキス（横）", preset("marquise"), "across"],
  ];
  it.each(cases)("%s：一体の形は、指の面より下へ出ない（爪の先が輪の下にぶら下がらない）", (_n, stone, orientation) => {
    const ring = buildRing(params({ stone, orientation, solder: false, shank: { gou: 11, metal: "k18y" } }, { solid: true, solidQuality: "preview" }));
    const r = ring.shank.innerRadiusMm;
    const pos = ring.ringPositions.setting;
    let lowest = Infinity;
    for (let i = 0; i < pos.length; i += 3) if (pos[i + 2] > 0) lowest = Math.min(lowest, Math.hypot(pos[i + 1], pos[i + 2]) - r);
    // 下の輪の下の面は指の面。切る面の余裕（0.05 mm）と格子の目の分だけ許す
    expect(lowest).toBeGreaterThan(-0.12);
  }, 60000);

  it("ふつうの大きさの爪は、下の輪の下の面まで同じ太さ（細い先にならない）", () => {
    const ring = buildRing(params({ shank: { gou: 11, metal: "k18y" } }));
    const pos = ring.setting.positions;
    const c = ring.setting.collar!;
    const t = ring.setting.prongs[0].triangles;
    const z0 = c.bottomZ + 0.3;
    let xmin = Infinity;
    let xmax = -Infinity;
    let ymin = Infinity;
    let ymax = -Infinity;
    for (let k = t.start * 9; k < (t.start + t.count) * 9; k += 3) {
      if (Math.abs(pos[k + 2] - z0) > 0.25) continue;
      xmin = Math.min(xmin, pos[k]);
      xmax = Math.max(xmax, pos[k]);
      ymin = Math.min(ymin, pos[k + 1]);
      ymax = Math.max(ymax, pos[k + 1]);
    }
    const d = ring.setting.prongs[0].diameterMm;
    expect(Math.max(xmax - xmin, ymax - ymin)).toBeGreaterThan(d * 0.95);
  });
});

describe("腕の間に挟む石座：確かめ", () => {
  it("ふつうの形では、板の厚みも腕の端も問題にならない", () => {
    const ps = checkRing(buildRing(params()));
    expect(ps.filter((p) => p.check === "collar-wall" || p.check === "band-end")).toEqual([]);
  });

  it("板が薄すぎると「下の輪の板が薄い」。赤くするのは下の輪", () => {
    const ps = checkRing(buildRing(params({}, { collarWallMm: 0.3 })));
    const p = ps.find((x) => x.check === "collar-wall")!;
    expect(p).toBeDefined();
    expect(p.currentValue).toBeCloseTo(0.3, 6);
    expect(p.requiredValue).toBe(GUIDES.join.between.collarWallMinMm);
    expect(p.target).toEqual({ kind: "collar" });
    expect(p.options[0].id).toBe("thickerCollar");
  });

  it("下の輪が低すぎて腕の端が輪からはみ出すと「腕の端が届いていない」。赤い印は腕の端（指輪の座標）", () => {
    const ring = buildRing(params({}, { collarHeightMm: 0.6 }));
    const ps = checkRing(ring).filter((x) => x.check === "band-end");
    expect(ps).toHaveLength(2);
    for (const p of ps) {
      expect(p.currentValue).toBeLessThan(GUIDES.join.between.minEndContactRatio);
      expect(p.target.kind).toBe("band-end");
      if (p.target.kind !== "band-end") continue;
      const [, y, z] = p.target.point;
      // 印は腕の端のそば（腕の外側の半径の近く、y は端の所）
      expect(Math.abs(Math.abs(y) - Math.abs(ring.shank.ends![0].y))).toBeLessThan(0.1);
      expect(z).toBeGreaterThan(ring.shank.innerRadiusMm - 1);
      expect(z).toBeLessThan(ring.shank.outerRadiusMm + 0.1);
    }
    expect(ps[0].options.map((o) => o.id)).toContain("tallerCollar");
  });

  it("腕の上にのせる形には、この確かめは出ない", () => {
    const ps = checkRing(buildRing(params({}, { join: "on", collarWallMm: 0.1 })));
    expect(ps.some((p) => p.check === "collar-wall" || p.check === "band-end")).toBe(false);
  });
});

describe("腕の間に挟む石座：道具と作り方", () => {
  it("set_setting の join は on と between だけ受け付ける", () => {
    expect(parseToolCall("set_setting", { join: "between", reason: "職人の基本の作り方に" }).ok).toBe(true);
    expect(parseToolCall("set_setting", { join: "on", reason: "腕の上に戻す" }).ok).toBe(true);
    const bad = parseToolCall("set_setting", { join: "under", reason: "x" });
    expect(bad.ok).toBe(false);
  });

  it("画面の設計の場の既定は腕の間に挟む。腕の上にのせるも選べ、形と道具の答えが変わる", () => {
    const s = new RingSession(round, () => seedLedger(), () => {}, () => "");
    s.build();
    expect(s.built!.ring.setting.join).toBe("between");
    expect(s.built!.ring.setting.collar).not.toBeNull();
    expect(s.check().passed).toContain("腕の端と石座の下の輪");
    const res = s.setSetting({ join: "on", reason: "腕の上にのせる" });
    expect(res.setting.join).toBe("on");
    expect(s.built!.ring.setting.collar).toBeNull();
    expect(s.check().passed).not.toContain("腕の端と石座の下の輪");
    s.setSetting({ join: "between", reason: "戻す" });
    expect(s.built!.ring.setting.join).toBe("between");
  });

  it("手作りの作り方：腕の上を切る → 下の輪を板から作る → 腕の間に挟んでロウ付け → 上の輪と爪 → リューターでザグる → 石を留める", () => {
    const ring = buildRing(params());
    const steps = howToMake({ ring, outlineMm: round.outlineMm, longMm: round.longMm, widthMm: round.widthMm, depthMm: round.depthMm, metalLabel: "K18" }, "hand");
    const ids = steps.map((s) => s.id);
    const order = ["cut_top", "collar", "attach", "head", "bur_seat", "prong", "finish"].map((id) => ids.indexOf(id));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // 板の大きさは形から：厚み × 幅 × 長さ（長さは板の厚みの真ん中の線の周。丸い石なら π × 直径くらい）
    const collar = steps.find((s) => s.id === "collar")!;
    const sheet = collar.specs.find((x) => x.label === "下の輪の板")!.value;
    expect(sheet).toContain("厚み 0.50 mm");
    const c = ring.setting.collar!;
    const L = Number(sheet.match(/長さ 約 ([\d.]+) mm/)![1]);
    const meanR = (Math.hypot(c.outer[0].x, c.outer[0].y) + Math.hypot(c.inner[0].x, c.inner[0].y)) / 2;
    expect(L).toBeCloseTo(2 * Math.PI * meanR, 0);
    // 腕を切る幅は、腕の両はしの間
    const cut = steps.find((s) => s.id === "cut_top")!.specs[0].value;
    expect(Number(cut.match(/^([\d.]+) mm/)![1])).toBeCloseTo(Math.abs(ring.shank.ends![0].y) * 2, 1);
    // 腕の上にのせる作り方には、この工程はない
    const on = buildRing(params({}, { join: "on" }));
    const onIds = howToMake({ ring: on, outlineMm: round.outlineMm, longMm: round.longMm, widthMm: round.widthMm, depthMm: round.depthMm, metalLabel: "K18" }, "hand").map((s) => s.id);
    expect(onIds).not.toContain("cut_top");
    expect(onIds).not.toContain("bur_seat");
  });

  it("鋳造の原型の数字にも、腕の間に挟む形と下の輪が出る", () => {
    const ring = buildRing(params());
    const steps = howToMake({ ring, outlineMm: round.outlineMm, longMm: round.longMm, widthMm: round.widthMm, depthMm: round.depthMm, metalLabel: "K18" }, "cast");
    const model = steps.find((s) => s.id === "model")!;
    expect(model.specs.find((x) => x.label === "石座の座")!.value).toContain("腕の両はしの間");
    expect(model.specs.some((x) => x.label === "下の輪")).toBe(true);
  });

  it("目安帳に、職人の言葉の決まりがある（石川工房・2026-11-04・石座を組む／腕に付けるの工程）", () => {
    const book = JSON.parse(readFileSync("ledger/jewelry.json", "utf8")) as { owner: string; rules: { id: string; date: string; steps?: string[]; source: { kind: string; name?: string } }[] };
    const r = book.rules.find((x) => x.id === "rule-head-between-ishikawa")!;
    expect(book.owner).toBe("石川工房");
    expect(r.source).toEqual({ kind: "craftsman", name: "石川" });
    expect(r.date).toBe("2026-11-04");
    expect(r.steps).toEqual(["head", "attach"]);
  });
});
