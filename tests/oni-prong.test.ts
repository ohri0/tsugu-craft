// 鬼爪（先が尖り、石の上に少しかかる爪。作者が確かめた形 2026-11-05）と、工房のベーシックの雰囲気
import { describe, expect, it } from "vitest";
import { openEdges } from "../src/cad/solid";
import { parseToolCall } from "../src/claude/tools";
import { toolLogLine } from "../src/claude/words";
import { checkRingTool } from "../mcp/tools";
import { buildRing, type RingParams } from "../src/geometry/ring";
import { buildSetting } from "../src/geometry/setting";
import { girdleCenter, stoneScaleAt, type StoneParams } from "../src/geometry/stone";
import { GUIDES } from "../src/rules/guides";
import { seedLedger } from "../src/rules/ledger";
import { addSampleWorkshop, emptyWorkshops, parseWorkshops, prongBasicMm, prongBasicSteps, setBasics, setProngBasic } from "../src/rules/workshops";
import { howToMake } from "../src/studio/howto";
import { presetOutline, PRESETS } from "../src/studio/presets";
import { carryDesign, DEFAULT_STATE, RingSession, underLedger } from "../src/studio/session";
import { stoneFrom } from "./helpers/stones";
import { triangle } from "./helpers/synth";

const stoneOf = (id: string): StoneParams => {
  const p = PRESETS.find((x) => x.id === id)!;
  return { outlineMm: presetOutline(p), longMm: p.longMm, widthMm: p.widthMm, depthMm: p.depthMm };
};
/** 既定の三角の石（8.88 × 7.52 × 4.24 mm） */
const trillion = (): StoneParams => stoneFrom(triangle(0, 0, 888, 752), 8.88, 4.24);
const params = (stone: StoneParams, s: Partial<RingParams["setting"]>): RingParams => ({
  stone,
  setting: { style: "prong", vAtCorners: false, join: "between", ...s },
  shank: { gou: 11, widthMm: 1.8 },
});

/** 三角形の面を、頂点でつないだときのかたまりの数 */
function components(pos: Float32Array): number {
  const key = (i: number) => `${pos[i].toFixed(4)},${pos[i + 1].toFixed(4)},${pos[i + 2].toFixed(4)}`;
  const par = new Map<string, string>();
  const find = (a: string): string => {
    let x = a;
    while (par.get(x) !== x) {
      par.set(x, par.get(par.get(x)!)!);
      x = par.get(x)!;
    }
    return x;
  };
  for (let t = 0; t < pos.length / 9; t++) {
    const v = [key(t * 9), key(t * 9 + 3), key(t * 9 + 6)];
    for (const a of v) if (!par.has(a)) par.set(a, a);
    par.set(find(v[0]), find(v[1]));
    par.set(find(v[1]), find(v[2]));
  }
  return new Set([...par.keys()].map(find)).size;
}

/** 面の点が、石の形の中へどれだけ入っているか（いちばん深い所 mm。入っていなければ 0） */
function deepestInStone(stone: StoneParams, s: ReturnType<typeof buildSetting>): number {
  const h = s.heights;
  const pts = stone.outlineMm;
  const { x: cx, y: cy } = girdleCenter(pts);
  let deep = 0;
  const pos = s.positions;
  for (let i = 0; i < pos.length; i += 3) {
    const z = pos[i + 2];
    if (z <= h.culetZ || z >= h.tableZ) continue;
    const k = stoneScaleAt(h, z);
    // 高さ z の石の輪郭（縁の形を縮めたもの）の中か
    let inside = false;
    let best = Infinity;
    for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
      const ax = cx + (pts[b].x - cx) * k;
      const ay = cy + (pts[b].y - cy) * k;
      const bx = cx + (pts[a].x - cx) * k;
      const by = cy + (pts[a].y - cy) * k;
      if (by > pos[i + 1] !== ay > pos[i + 1] && pos[i] < ((ax - bx) * (pos[i + 1] - by)) / (ay - by || 1e-12) + bx) inside = !inside;
      const dx = bx - ax;
      const dy = by - ay;
      const L2 = dx * dx + dy * dy || 1e-12;
      const t = Math.max(0, Math.min(1, ((pos[i] - ax) * dx + (pos[i + 1] - ay) * dy) / L2));
      best = Math.min(best, Math.hypot(ax + dx * t - pos[i], ay + dy * t - pos[i + 1]));
    }
    if (inside) deep = Math.max(deep, best);
  }
  return deep;
}

/** 爪の真上の高さ（縁より上）で、面の点がいちばん石の中心へ寄った距離（縁からどれだけ内へかかるか mm） */
function overlapAt(stone: StoneParams, s: ReturnType<typeof buildSetting>): number[] {
  const pts = stone.outlineMm;
  const { x: cx, y: cy } = girdleCenter(pts);
  return s.prongs.map((pr) => {
    const r = pr.triangles;
    const a = s.positions.subarray(r.start * 9, (r.start + r.count) * 9);
    const out = Math.hypot(pr.point.x - cx, pr.point.y - cy);
    let near = Infinity;
    for (let i = 0; i < a.length; i += 3) {
      if (a[i + 2] <= 0.1) continue;
      const along = ((a[i] - cx) * (pr.point.x - cx) + (a[i + 1] - cy) * (pr.point.y - cy)) / out;
      near = Math.min(near, along);
    }
    return out - near;
  });
}

describe("鬼爪の形", () => {
  for (const id of ["round", "pear", "marquise", "princess"]) {
    for (const join of ["between", "on"] as const) {
      const stone = stoneOf(id);
      const round = buildRing(params(stone, { join, solid: true, solidQuality: "preview" }));
      const oni = buildRing(params(stone, { join, prongTip: "oni", solid: true, solidQuality: "preview" }));
      it(`${id}・${join}：STL が閉じ、ひとつながりで、石に刺さらない`, () => {
        expect(oni.setting.prongTip).toBe("oni");
        expect(openEdges(oni.setting.positions)).toBe(0);
        expect(components(oni.setting.positions)).toBe(1);
        // 粗い格子では、丸い爪でも座の角で 0.03 mm くらい入る（格子の目より小さい）
        expect(deepestInStone(stone, oni.setting)).toBeLessThan(0.05);
      });
      it(`${id}・${join}：爪の位置・本数・太さ・確かめの数は丸い爪と同じ（腕を避ける・輪に沿うは変わらない）`, () => {
        expect(oni.setting.prongs.map((p) => p.t)).toEqual(round.setting.prongs.map((p) => p.t));
        expect(oni.setting.prongs.map((p) => p.diameterMm)).toEqual(round.setting.prongs.map((p) => p.diameterMm));
        expect(oni.setting.prongs.map((p) => p.lengthMm)).toEqual(round.setting.prongs.map((p) => p.lengthMm));
        expect(oni.setting.heights.tipZ).toBe(round.setting.heights.tipZ);
        expect(oni.setting.heights.baseZ).toBe(round.setting.heights.baseZ);
        expect(oni.setting.prongsOnArm).toBe(round.setting.prongsOnArm);
      });
      it(`${id}・${join}：先は丸い爪より石の上へ入り、石の上面より低い`, () => {
        const a = overlapAt(stone, oni.setting);
        const b = overlapAt(stone, round.setting);
        a.forEach((v, i) => expect(v, `爪 ${i + 1}`).toBeGreaterThan(b[i]));
        expect(oni.setting.heights.topZ).toBeLessThan(oni.setting.heights.tableZ);
      });
    }
  }
  it("細かい一体の形でも、閉じてひとつながりで、石に刺さらない", () => {
    const stone = trillion();
    const s = buildRing(params(stone, { prongTip: "oni", prongDiameterMm: 1, solid: true, solidQuality: "final" })).setting;
    expect(openEdges(s.positions)).toBe(0);
    expect(components(s.positions)).toBe(1);
    expect(deepestInStone(stone, s)).toBeLessThan(0.03);
  });
  it("線を管にした形でも選べて、閉じている（爪ごと）", () => {
    for (const join of ["between", "on"] as const) {
      const s = buildSetting({ stone: stoneOf("pear"), style: "prong", vAtCorners: false, join, prongTip: "oni" });
      const r = s.prongs[0].triangles;
      expect(openEdges(s.positions.subarray(r.start * 9, (r.start + r.count) * 9))).toBe(0);
    }
  });
  it("V 字の爪は、鬼爪を選んでも V 字のまま作れる", () => {
    const s = buildSetting({ stone: stoneOf("pear"), style: "prong", vAtCorners: true, join: "on", prongTip: "oni", solid: true, solidQuality: "preview" });
    expect(s.prongs.some((p) => p.isV)).toBe(true);
    expect(openEdges(s.positions)).toBe(0);
  });
  it("覆輪とテンションには効かない", () => {
    expect(buildSetting({ stone: stoneOf("round"), style: "bezel", prongTip: "oni" }).prongTip).toBe("round");
    expect(buildRing(params(stoneOf("round"), { style: "tension", prongTip: "oni" })).setting.prongTip).toBe("round");
  });
  it("丸い爪は、選んでも選ばなくても同じ形（1 点も動かない）", () => {
    const stone = stoneOf("pear");
    for (const solid of [false, true]) {
      const a = buildSetting({ stone, style: "prong", vAtCorners: false, join: "between", solid, solidQuality: "preview" });
      const b = buildSetting({ stone, style: "prong", vAtCorners: false, join: "between", prongTip: "round", solid, solidQuality: "preview" });
      expect(Buffer.from(a.positions.buffer).equals(Buffer.from(b.positions.buffer))).toBe(true);
    }
  });
  it("値はぜんぶ src/rules の 1 か所", () => {
    expect(GUIDES.prong.oni.tipRadiusMm).toBeGreaterThan(0);
    expect(GUIDES.prong.oni.overCrownRatio).toBeLessThanOrEqual(GUIDES.prong.crownOverlapRatio[1]);
  });
});

describe("工房のベーシックの雰囲気", () => {
  const today = "2026-11-05";
  const main = seedLedger();
  const sampleLedger = () => addSampleWorkshop(emptyWorkshops(), seedLedger(), today).list[0];

  it("見本の工房 B：印が付き、三角の石で 爪 ø 1 mm くらい・鬼爪・作れない所なし", () => {
    const w = sampleLedger();
    expect(w.sample).toBe(true);
    expect(w.name).toBe(GUIDES.prong.sampleWorkshop.name);
    const b = underLedger(trillion(), { ...DEFAULT_STATE }, w.ledger);
    expect(b.ring.setting.prongTip).toBe("oni");
    expect(b.ring.setting.prongs[0].diameterMm).toBeCloseTo(1, 1);
    expect(b.problems).toEqual([]);
  });
  it("見本の工房は 2 つ作らない。読み直しても残る", () => {
    const one = addSampleWorkshop(emptyWorkshops(), seedLedger(), today);
    const two = addSampleWorkshop({ ...one, active: "main" }, seedLedger(), today);
    expect(two.list).toHaveLength(1);
    expect(two.active).toBe(one.list[0].id);
    const again = parseWorkshops(JSON.stringify(one));
    expect(again.list[0].sample).toBe(true);
    expect(again.list[0].ledger.basics?.prongTip).toBe("oni");
  });
  it("はじめの帳面と公開情報だけの帳面は丸い爪のまま", () => {
    expect(underLedger(trillion(), { ...DEFAULT_STATE }, main).ring.setting.prongTip).toBe("round");
  });
  it("小さな石は公開の資料の細さのまま。大きな石でも太くならない", () => {
    const steps = prongBasicSteps(1);
    expect(steps[0].value).toBe(GUIDES.prong.minByStoneSize[0][1]);
    expect(steps[steps.length - 1].value).toBe(steps[steps.length - 2].value);
    const led = setProngBasic(seedLedger(), 1, today);
    expect(prongBasicMm(led)).toBeCloseTo(1, 2);
    const big: StoneParams = { ...trillion(), longMm: 12, widthMm: 11 };
    expect(underLedger(big, { ...DEFAULT_STATE, prongCount: 6 }, led).ring.setting.standardProngMm).toBeCloseTo(1, 1);
  });
  it("あとで編集できる：形と太さを直すと、組む指輪が変わる。前の太さの決まりは履歴に残る", () => {
    const w = sampleLedger();
    const led = setProngBasic(setBasics(w.ledger, { prongTip: "round" }), 1.2, today);
    const b = underLedger(trillion(), { ...DEFAULT_STATE }, led);
    expect(b.ring.setting.prongTip).toBe("round");
    expect(b.ring.setting.prongs[0].diameterMm).toBeCloseTo(1.2, 1);
    expect(led.rules.filter((r) => r.param === "prong.minDiameterMm")).toHaveLength(2);
  });
  it("設計で選んだ形は帳面より先。帳面ごとの比べと、石を替えて持ち越すとき", () => {
    const w = sampleLedger();
    const s = new RingSession(trillion(), () => w.ledger, () => undefined, () => "");
    s.solid = false;
    expect(s.build("x").ring.setting.prongTip).toBe("oni");
    s.setSetting({ prong_tip: "round", reason: "手で" });
    expect(s.built!.ring.setting.prongTip).toBe("round");
    expect(s.setSetting({ reason: "そのまま" }).setting.prong_tip).toBe("round");
    // 比べの表は、手で選んだ形でなく、その帳面のベーシックで見る
    expect(underLedger(trillion(), s.state, w.ledger).ring.setting.prongTip).toBe("oni");
    expect(carryDesign(s.state, { ...DEFAULT_STATE }).prongTip).toBe("round");
  });
});

describe("鬼爪：Claude の道具・MCP・手順の言葉", () => {
  it("set_setting の prong_tip：round と oni だけ通す", () => {
    expect(parseToolCall("set_setting", { prong_tip: "oni", reason: "シャープに" }).ok).toBe(true);
    expect(parseToolCall("set_setting", { prong_tip: "round", reason: "シンプルに" }).ok).toBe(true);
    expect(parseToolCall("set_setting", { prong_tip: "star", reason: "x" }).ok).toBe(false);
  });
  it("作業の記録の言葉になる", () => {
    expect(toolLogLine({ tool: "set_setting", input: { prong_tip: "oni", reason: "x" }, ok: true }, {}).text).toContain("爪の形 鬼爪");
  });
  it("手順：丸い爪は今のまま。鬼爪は「丸くする」と書かない。新しい数字を足さない", () => {
    const input = (prongTip: "round" | "oni") => {
      const stone = trillion();
      return { ring: buildRing(params(stone, { prongTip })), outlineMm: stone.outlineMm, longMm: stone.longMm, widthMm: stone.widthMm, depthMm: stone.depthMm, metalLabel: "K18" };
    };
    for (const m of ["hand", "cast"] as const) {
      const round = howToMake(input("round"), m);
      const oni = howToMake(input("oni"), m);
      const text = (l: typeof round) => JSON.stringify(l);
      expect(text(round)).not.toContain("鬼爪");
      expect(text(round)).toContain("先をヤスリで丸くして");
      expect(text(oni)).toContain("鬼爪");
      expect(text(oni)).not.toContain("先をヤスリで丸くして");
      expect(text(oni)).not.toContain("爪の先を丸め");
      // 足した言葉に数字がない
      const added = oni.flatMap((s) => s.details ?? []).find((d) => d.text.includes("鬼爪"))!;
      expect(added.text).not.toMatch(/\d/);
    }
  });
});

describe("MCP の check_ring", () => {
  it("prong_tip を受け取り、結果に出す。省くと帳面のベーシック（なければ丸い爪）", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "tsugu-oni-"));
    const ledgerPath = join(dir, "ledger.json");
    writeFileSync(ledgerPath, JSON.stringify(seedLedger()));
    const ctx = { ledgerPath, outDir: dir };
    const stone = { preset: "round", long_mm: 6.5, depth_mm: 3.9 };
    const on = checkRingTool(ctx, { stone, design: { prong_tip: "oni" } } as never) as { design: { prong_tip: string } };
    expect(on.design.prong_tip).toBe("oni");
    const off = checkRingTool(ctx, { stone } as never) as { design: { prong_tip: string } };
    expect(off.design.prong_tip).toBe("round");
    writeFileSync(ledgerPath, JSON.stringify({ ...seedLedger(), basics: { prongTip: "oni" } }));
    const book = checkRingTool(ctx, { stone } as never) as { design: { prong_tip: string } };
    expect(book.design.prong_tip).toBe("oni");
  });
});
