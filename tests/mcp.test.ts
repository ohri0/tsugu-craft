// MCP サーバーの道具の中身を、標準入出力を通さず関数のまま確かめる。
// 目安帳は一時フォルダのファイルに書くので、リポジトリの ledger/jewelry.json は変わらない。
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initLedgerFile, readLedger } from "../mcp/ledger-file";
import { presetOutline, readyStone } from "../mcp/stone-input";
import { checkRingShape, checkRingTool, ledgerAsText, listRules, patternSvgTool, proposeRule, type ToolContext } from "../mcp/tools";
import { z } from "zod";
import { centroid } from "../src/geometry/polygon";
import { seedLedger } from "../src/rules/ledger";

let dir: string;
let ctx: ToolContext;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tsugu-mcp-"));
  ctx = { ledgerPath: join(dir, "ledger", "jewelry.json"), outDir: join(dir, "out"), today: () => "2026-11-03" };
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const gapRule = {
  craftsman: "試しの職人",
  title: "石の先はもっと離す",
  text: "石の一番下は、指から 2.5 mm 以上離す",
  reason: "石の先が指に当たると痛い",
  quote: "指に当たったら、つけてもらえない",
  param: "height.minFingerGapMm" as const,
  value: 2.5,
};
const triangle = { preset: "triangle" as const, long_mm: 8.88, depth_mm: 4.35 };

describe("目安帳のファイル", () => {
  it("ledger:init はなければ作り、あればそのまま", () => {
    expect(initLedgerFile(ctx.ledgerPath)).toBe(true);
    expect(readLedger(ctx.ledgerPath)).toEqual(seedLedger());
    proposeRule(ctx, gapRule);
    expect(initLedgerFile(ctx.ledgerPath)).toBe(false);
    expect(readLedger(ctx.ledgerPath).rules).toHaveLength(seedLedger().rules.length + 1);
  });
  it("リポジトリの目安帳は、出発点の目安帳と同じ形で読める", () => {
    const repo = readLedger(join(__dirname, "..", "ledger", "jewelry.json"));
    expect(repo.craft).toBe(seedLedger().craft);
    expect(repo.rules.length).toBeGreaterThanOrEqual(seedLedger().rules.length);
  });
});

describe("propose_rule", () => {
  it("ファイルに書き、同じ値の決まりを置き換える（古い決まりは履歴に残る）", () => {
    const out = proposeRule(ctx, gapRule);
    expect(out.replaced?.id).toBe("finger-gap");
    expect(existsSync(ctx.ledgerPath)).toBe(true);

    const saved = JSON.parse(readFileSync(ctx.ledgerPath, "utf8"));
    const added = saved.rules.find((r: { id: string }) => r.id === out.rule_id);
    expect(added).toMatchObject({
      replaces: "finger-gap",
      value: 2.5,
      source: { kind: "craftsman", name: "試しの職人" },
      date: "2026-11-03",
      quote: "指に当たったら、つけてもらえない",
      checks: ["finger-gap"],
    });

    const listed = listRules(ctx, { include_history: true });
    expect(listed.rules.map((r) => r.id)).toContain(out.rule_id);
    expect(listed.rules.map((r) => r.id)).not.toContain("finger-gap");
    expect(listed.history?.[0]).toMatchObject({ id: "finger-gap", replaced_by: out.rule_id });
    expect(ledgerAsText(ctx)).toContain("職人：試しの職人");
  });
  it("手の決まりは、効く工程と一緒に残り、読むと工程の名前で出る", () => {
    const out = proposeRule(ctx, { craftsman: "試しの職人", title: "ロウ付けの面", text: "相手の面に合わせて削る", reason: "すき間ができる", steps: ["solder"] });
    const saved = JSON.parse(readFileSync(ctx.ledgerPath, "utf8"));
    expect(saved.rules.find((r: { id: string }) => r.id === out.rule_id).steps).toEqual(["solder"]);
    expect(JSON.stringify(listRules(ctx))).toContain("ロウ付けで閉じる");
  });
  it("言葉だけの決まりは置き換えずに足す", () => {
    const out = proposeRule(ctx, { craftsman: "試しの職人", title: "爪の先は丸める", text: "爪の先は丸く仕上げる", reason: "服に引っかからない" });
    expect(out.replaced).toBeNull();
    expect(out.active_rules).toBe(seedLedger().rules.length + 1);
  });
  it("param と value は両方そろえる", () => {
    expect(() => proposeRule(ctx, { ...gapRule, value: undefined })).toThrow(/両方/);
    expect(existsSync(ctx.ledgerPath)).toBe(false);
  });
});

describe("check_ring", () => {
  it("職人の決まりを足すと、その決まりを根拠に問題が出る", () => {
    const before = checkRingTool(ctx, { stone: triangle });
    expect(before.problems.find((p) => p.id === "finger-gap")).toBeUndefined();

    proposeRule(ctx, gapRule);
    const after = checkRingTool(ctx, { stone: triangle });
    const gap = after.problems.find((p) => p.id === "finger-gap");
    expect(gap?.rule).toMatchObject({ title: "石の先はもっと離す", source: "職人：試しの職人", date: "2026-11-03" });
    expect(gap?.required).toBe("2.50 mm 以上");
    expect(gap?.options[0].effect_on_look).toBeTruthy();
  });
  it("留め方（V 字の爪の有無）と腕の断面を、画面と同じ言葉で選べる。細い腕は確かめで出る", () => {
    const plain = checkRingTool(ctx, { stone: triangle, design: { v_corners: false } });
    expect(plain.design.v_prong_count).toBe(0);
    const v = checkRingTool(ctx, { stone: triangle, design: { v_corners: true } });
    expect(v.design.v_prong_count).toBe(3);
    const flat = checkRingTool(ctx, { stone: triangle, design: { shank_section: "hirauchi" } });
    expect(flat.design.shank.section).toBe("hirauchi");
    expect(flat.metal_weight_g).toBeGreaterThan(v.metal_weight_g);
    // 腕の幅の赤は職人の決まりで 0.6 mm 以下（前は資料の 1.7 mm。作者が 1.6 mm でも作れると言った 2026-11-06）
    const thin = checkRingTool(ctx, { stone: triangle, design: { shank_thickness_mm: 1.0, shank_width_mm: 0.55 } });
    expect(thin.problems.map((p) => p.id)).toEqual(expect.arrayContaining(["band-thin", "band-narrow"]));
    // 1.5 mm は何も出ない。0.9 mm は黄色・0.65 mm はオレンジの注意で、problems には入らない（作れる）
    const ok = checkRingTool(ctx, { stone: triangle, design: { shank_width_mm: 1.5 } });
    expect(ok.problems.map((p) => p.id)).not.toContain("band-narrow");
    expect(ok.cautions).toEqual([]);
    for (const [w, level] of [[0.9, "yellow"], [0.65, "orange"]] as const) {
      const r = checkRingTool(ctx, { stone: triangle, design: { shank_width_mm: w } });
      expect(r.problems.map((p) => p.id)).not.toContain("band-narrow");
      expect(r.cautions.find((c) => c.id === "band-narrow")).toMatchObject({ level });
    }
  });
  it("腕の断面の線と場所ごとの形も、画面の Claude と同じ書き方で。壊れた線は分かる言葉で断る", () => {
    const ridge = [{ x: 1, y: 0 }, { x: 1, y: 0.35 }, { x: 0.5, y: 0.55 }, { x: 0, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 1 }, { x: -0.5, y: 0.55 }, { x: -1, y: 0.35 }, { x: -1, y: 0 }];
    const r = checkRingTool(ctx, {
      stone: triangle,
      design: {
        shank_section_curve: ridge,
        shank_width_mm: 2.8,
        shank_thickness_mm: 2,
        shank_stations: [
          { at_deg: 70, width_mm: 2.2, thickness_mm: 1.6, section_curve: ridge },
          { at_deg: 180, width_mm: 1.8, thickness_mm: 1.3, section: "kouman" },
        ],
      },
    });
    expect(r.design.shank.section).toBe("free");
    expect(r.design.shank.min_width_mm).toBeCloseTo(1.8, 2);
    expect(r.design.shank.min_thickness_mm).toBeCloseTo(1.3, 2);
    expect(() => checkRingTool(ctx, { stone: triangle, design: { shank_section_curve: [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }] } })).toThrow("5〜40 個");
    expect(() => checkRingTool(ctx, { stone: triangle, design: { shank_stations: [{ at_deg: 120, width_mm: 2, thickness_mm: 1.5 }, { at_deg: 60, width_mm: 2, thickness_mm: 1.5 }] } })).toThrow("角度の小さい順");
    expect(() => checkRingTool(ctx, { stone: triangle, design: { shank_stations: [{ at_deg: 180, width_mm: 2, thickness_mm: 1.5, sway_mm: 1 }] } })).toThrow("寄せられません");
  });
  it("三角の石は V 字の爪 3 つで、すき間と地金の重さも返す", () => {
    const r = checkRingTool(ctx, { stone: triangle });
    expect(r.ok).toBe(true);
    expect(r.design.v_prong_count).toBe(3);
    expect(r.culet_gap_mm).toBeGreaterThan(0.3);
    expect(r.metal_weight_g).toBeGreaterThan(0);
  });
  it("爪を細くすると、公開情報の決まりを根拠に赤くなる", () => {
    const r = checkRingTool(ctx, { stone: triangle, design: { prong_scale: 0.8 } });
    const thin = r.problems.filter((p) => p.id.startsWith("prong-thin"));
    expect(thin).toHaveLength(3);
    expect(thin[0].rule?.source).toMatch(/^公開情報/);
  });
});

describe("pattern_svg", () => {
  it("A4 の原寸の SVG を返し、out/ に書き出せる", () => {
    const r = patternSvgTool(ctx, { stone: { preset: "oval", long_mm: 7, width_mm: 5.6, depth_mm: 4.2 }, save_as: "oval" });
    expect(r.svg).toContain('width="210mm"');
    expect(r.saved_to).toBeDefined();
    expect(readFileSync(join(ctx.outDir, "oval.svg"), "utf8")).toBe(r.svg);
  });
  it("out/ の外へは書かない", () => {
    expect(() => patternSvgTool(ctx, { stone: triangle, save_as: "../escape.svg" })).toThrow(/out\//);
  });
});

describe("石の入力", () => {
  it("簡単な形は、長辺を左右・幅を上下に置き、重心が真ん中", () => {
    const pts = presetOutline("triangle", 8, 7);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(8, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(7, 6);
    expect(Math.abs(centroid(pts).y)).toBeLessThan(1e-9);
  });
  it("輪郭の点は、真ん中と向きをそろえ、長辺に合わせる", () => {
    const s = readyStone({ outline_mm: [{ x: 10, y: 10 }, { x: 13, y: 10 }, { x: 11.5, y: 12.5 }], long_mm: 6, depth_mm: 3.5 });
    expect(s.params.longMm).toBeCloseTo(6, 6);
    expect(s.corners).toHaveLength(3);
  });
});

describe("MCP の入力の形（2026-11-07 の試し）", () => {
  it("指輪の石として大きすぎる石は、MCP の入口で断る（40 mm の石でも「作れる」と返していた）", () => {
    const shape = z.object(checkRingShape);
    expect(shape.safeParse({ stone: { preset: "round", long_mm: 40, depth_mm: 3 } }).success).toBe(false);
    expect(shape.safeParse({ stone: { preset: "round", long_mm: 8, depth_mm: 30 } }).success).toBe(false);
    expect(shape.safeParse({ stone: { preset: "round", long_mm: 8, depth_mm: 4.8 } }).success).toBe(true);
    // マイナスの深さは、日本語の理由で断る（前は英語の決まり文句だった）
    const bad = shape.safeParse({ stone: { preset: "round", long_mm: 8, depth_mm: -4 } });
    expect(bad.success).toBe(false);
    expect(bad.error!.issues[0].message).toBe("深さは 0 より大きい数にしてください");
  });
});
