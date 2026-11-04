// 腕の間に挟む石座（職人 石川の言葉 2026-11-04）：腕のいちばん上を切り、腕の両端の間に、板を丸めた下の輪をはさんでロウ付けする
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openEdges } from "../src/cad/solid";
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
    const dOut = polygonDistance(c.outer, 0.02);
    let inside = 0;
    for (const [x, y, z] of verts(ring.shank.positions)) if (z > 0 && dOut(x, y) < -c.wallMm / 2) inside++;
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

  it("画面の設計の場で付け方を変えると、形と道具の答えが変わる（既定は腕の上にのせる）", () => {
    const s = new RingSession(round, () => seedLedger(), () => {}, () => "");
    s.build();
    expect(s.built!.ring.setting.join).toBe("on");
    const res = s.setSetting({ join: "between", reason: "腕の間に挟む" });
    expect(res.setting.join).toBe("between");
    expect(s.built!.ring.setting.collar).not.toBeNull();
    expect(s.check().passed).toContain("腕の端と石座の下の輪");
    s.setSetting({ join: "on", reason: "戻す" });
    expect(s.check().passed).not.toContain("腕の端と石座の下の輪");
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
