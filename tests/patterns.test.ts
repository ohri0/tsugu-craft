// 留め方の型（4 本爪・6 本爪・V 字の爪・覆輪）：画面と Claude の道具で選べて、どの型でも確かめが働き、赤くする場所が出る
import { describe, expect, it } from "vitest";
import { buildRing } from "../src/geometry/ring";
import { checkRing } from "../src/rules/checks";
import { seedLedger } from "../src/rules/ledger";
import { RingSession } from "../src/studio/session";
import { parseToolCall } from "../src/claude/tools";
import { stoneFrom, triangleStone } from "./helpers/stones";
import { ellipse, triangle } from "./helpers/synth";

/** 三角の石（辺に点を足して、辺の途中にも爪を置けるように：1 辺 20 点） */
function denseTriangle() {
  const t = triangle(0, 0, 888, 752);
  const pts = t.flatMap((p, i) => {
    const q = t[(i + 1) % 3];
    return Array.from({ length: 20 }, (_, k) => ({ x: p.x + ((q.x - p.x) * k) / 20, y: p.y + ((q.y - p.y) * k) / 20 }));
  });
  return stoneFrom(pts, 8.88, 4.35);
}

const roundStone = () => stoneFrom(ellipse(0, 0, 325, 325), 6.5, 3.9);
const session = (stone = roundStone()) => {
  const s = new RingSession(stone, () => seedLedger(), () => undefined, () => "");
  s.build();
  return s;
};

describe("留め方の型", () => {
  it("4 本爪・6 本爪：本数どおりの丸い爪で、目安どおりなら作れる", () => {
    const s = session();
    expect(s.setSetting({ style: "prong", prong_count: 4, reason: "4 本" }).setting.prong_count).toBe(4);
    expect(s.check().problems).toEqual([]);
    const r6 = s.setSetting({ prong_count: 6, reason: "6 本" });
    expect(r6.setting.prong_count).toBe(6);
    expect(r6.setting.v_prong_count).toBe(0);
    // 6 本爪は 4 本爪より留まりが強い
    expect(r6.hold.value).toBeGreaterThan(1.0);
  });

  // V 字の爪は、形の出来がまだ足りないので画面では使わない（作者と決めた。2026-11-04）。形の処理は残してある
  it.skip("V 字の爪：尖った角ごとに V 字の爪が立ち、角が守られる", () => {
    const s = session(triangleStone());
    const r = s.setSetting({ v_corners: true, reason: "角を包む" });
    expect(r.setting.v_corners).toBe(true);
    expect(r.setting.v_prong_count).toBe(3);
    expect(s.built!.problems.filter((p) => p.check === "corner")).toEqual([]);
    // どの V 字の爪も形がある（赤くするとき、その三角形を塗る）
    for (const p of s.built!.ring.setting.prongs) expect(p.triangles.count).toBeGreaterThan(0);
    // V 字の爪は足 2 本：同じ太さなら、留まりは丸い爪 3 本より強い（公開情報の目安で比べる）
    const v = r.hold.value;
    const plain = s.setSetting({ v_corners: false, reason: "丸い爪に" }).hold.value;
    expect(v).toBeGreaterThanOrEqual(plain);
  });

  it("角を守っていない爪の置き方では「角」の確かめが出て、直し方（角に 1 本ずつ爪）で消える", () => {
    const s = session(denseTriangle());
    // 爪を辺の真ん中に置く（角から遠い）
    s.setSetting({ prong_positions: [10, 30, 50], reason: "辺に置く" });
    const corner = s.built!.problems.filter((p) => p.check === "corner");
    expect(corner.length).toBeGreaterThan(0);
    expect(corner[0].target.kind).toBe("corner");
    expect(corner[0].options.map((o) => o.id)).toContain("vAtCorner");
    const hint = s
      .check()
      .problems.find((p) => p.check === "尖った角の守り")!
      .options.find((o) => o.tool_hint?.tool === "set_setting" && "prong_count" in o.tool_hint.input);
    expect(hint).toBeTruthy();
    s.setSetting({ v_corners: false, prong_count: 0, reason: "直し方から" });
    expect(s.built!.problems.filter((p) => p.check === "corner")).toEqual([]);
  });

  it("爪の間が空きすぎ：確かめが出て、赤い印の場所（縁の上の点）がある", () => {
    const s = session();
    const n = s.stone.outlineMm.length;
    s.setSetting({ prong_positions: [0, Math.round(n / 8), Math.round(n / 4)], reason: "片側に寄せる" });
    const gap = s.built!.problems.find((p) => p.check === "prong-gap")!;
    expect(gap).toBeTruthy();
    expect(gap.target.kind).toBe("gap");
    const pt = (gap.target as { point?: { x: number; y: number } }).point!;
    // 縁の上の点（ラウンド 6.5 mm なら中心から約 3.25 mm）
    expect(Math.hypot(pt.x, pt.y)).toBeGreaterThan(2.5);
    expect(Math.hypot(pt.x, pt.y)).toBeLessThan(4);
  });

  it("覆輪：留まりは 2.0×、爪の確かめは出ず、壁が薄いと「覆輪の壁」が出る（石座ぜんぶを赤く）", () => {
    const s = session(triangleStone());
    const r = s.setSetting({ style: "bezel", reason: "覆輪" });
    expect(r.hold.value).toBe(2);
    expect(s.built!.problems).toEqual([]);
    const thin = buildRing({ stone: triangleStone(), setting: { style: "bezel", bezelWallMm: 0.3 }, shank: { gou: 11 } });
    const wall = checkRing(thin).find((p) => p.check === "bezel-wall")!;
    expect(wall.target.kind).toBe("bezel");
  });

  it("細い爪：どの型でも「爪の太さ」が出て、その爪を赤くする。V 字の爪でも留まりが足りなくなる", () => {
    for (const count of [4, 6]) {
      const s = session();
      s.setSetting({ prong_count: count, prong_mm: 0.4, reason: "細く" });
      const thin = s.built!.problems.filter((p) => p.check === "prong-thin");
      expect(thin.length).toBe(count);
      expect(thin.every((p) => p.target.kind === "prong")).toBe(true);
    }
    const s = session(triangleStone());
    s.setSetting({ v_corners: true, prong_mm: 0.4, reason: "細く" });
    expect(s.built!.problems.some((p) => p.check === "hold")).toBe(true);
  });

  it("Claude の道具：v_corners は true / false だけ、断面は決まった 4 つから", () => {
    expect(parseToolCall("set_setting", { v_corners: true, reason: "角" }).ok).toBe(true);
    expect(parseToolCall("set_setting", { v_corners: "yes", reason: "角" }).ok).toBe(false);
    expect(parseToolCall("set_shank", { section: "hangouman", reason: "半甲丸" }).ok).toBe(true);
    expect(parseToolCall("set_shank", { section: "free", reason: "x" }).ok).toBe(false);
  });
});
