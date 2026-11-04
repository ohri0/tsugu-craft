// 一体の石座（距離の場から作る形）：STL が閉じた一つの形になるか、動かしている間の粗い形と止まってからの細かい形
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRing } from "../src/geometry/ring";
import { buildSolid, resolveAmbiguousFaces } from "../src/geometry/sdf";
import { seedLedger } from "../src/rules/ledger";
import { FINAL_DELAY_MS, RingSession, type Built } from "../src/studio/session";
import { stoneFrom } from "./helpers/stones";
import { triangle } from "./helpers/synth";

/** 辺の数え：2 枚の三角形が逆向きに 1 回ずつ使っていない辺の数と、つぶれた三角形の数 */
function edgeReport(p: Float32Array): { badEdges: number; degenerate: number; triangles: number } {
  const ids = new Map<string, number>();
  const id = (i: number) => {
    const k = `${p[i]},${p[i + 1]},${p[i + 2]}`;
    let v = ids.get(k);
    if (v === undefined) ids.set(k, (v = ids.size));
    return v;
  };
  const directed = new Map<string, number>();
  let degenerate = 0;
  for (let t = 0; t < p.length; t += 9) {
    const v = [id(t), id(t + 3), id(t + 6)];
    const ux = p[t + 3] - p[t];
    const uy = p[t + 4] - p[t + 1];
    const uz = p[t + 5] - p[t + 2];
    const wx = p[t + 6] - p[t];
    const wy = p[t + 7] - p[t + 1];
    const wz = p[t + 8] - p[t + 2];
    const area = Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2] || area < 1e-9) {
      degenerate++;
      continue;
    }
    for (let e = 0; e < 3; e++) {
      const k = `${v[e]}|${v[(e + 1) % 3]}`;
      directed.set(k, (directed.get(k) ?? 0) + 1);
    }
  }
  let badEdges = 0;
  for (const [k, n] of directed) {
    const [a, b] = k.split("|");
    if (n !== 1 || directed.get(`${b}|${a}`) !== 1) badEdges++;
  }
  return { badEdges, degenerate, triangles: p.length / 9 };
}

const stone = stoneFrom(triangle(200, 200, 160, 140), 8.88, 4.24);
const setting = { style: "prong", height: "standard", solid: true, vAtCorners: false, prongDiameterMm: 1.66 } as const;

describe("一体の石座は、閉じた一つの形（STL にそのまま使える）", () => {
  it("格子の面の市松（内・外・内・外）を、隅を 1 つ裏返して無くす", () => {
    // 2 × 2 × 1 の格子：z の面の 4 隅が市松
    const val = new Float32Array([-0.1, 0.2, 0.3, -0.05]);
    expect(resolveAmbiguousFaces(val, 2, 2, 1, 1)).toBe(1);
    const inside = [...val].map((v) => v < 0);
    expect(inside.filter(Boolean).length === 1 || inside.filter(Boolean).length === 3).toBe(true);
  });

  it("ふれ合う細い 2 本の管も、辺が 2 枚ずつで閉じる", () => {
    // ほぼ平行に並び、途中で表面が触れる 2 本（直す前は、ここで 2 本の辺を 4 枚の三角形が使っていた）
    const m = buildSolid(
      [
        { pts: [[0, 0, 0], [3, 0, 0]], radii: [0.3, 0.3], owner: 0 },
        { pts: [[0, 0.64, 0.031], [3, 0.56, 0.031]], radii: [0.3, 0.3], owner: 1 },
      ],
      { cell: 0.07, blend: 0.001 },
    );
    const r = edgeReport(m.positions);
    expect(r.badEdges).toBe(0);
    expect(r.degenerate).toBe(0);
  });

  it("最初の三角の石の指輪：石座の辺はすべて 2 枚の三角形が逆向きに使い、つぶれた三角形もない", () => {
    const ring = buildRing({ stone, setting, shank: { gou: 11, metal: "k18y" }, orientation: "along" });
    const r = edgeReport(ring.setting.positions);
    expect(r.triangles).toBeGreaterThan(10000);
    expect(r.badEdges).toBe(0);
    expect(r.degenerate).toBe(0);
  }, 60000);

  it("粗い形（動かしている間）も閉じていて、確かめに使う数は細かい形と同じ", () => {
    const fine = buildRing({ stone, setting, shank: { gou: 11, metal: "k18y" }, orientation: "along" });
    const rough = buildRing({ stone, setting: { ...setting, solidQuality: "preview" }, shank: { gou: 11, metal: "k18y" }, orientation: "along" });
    expect(edgeReport(rough.setting.positions).badEdges).toBe(0);
    expect(rough.setting.positions.length).toBeLessThan(fine.setting.positions.length / 2);
    expect(rough.setting.prongs.map((p) => [p.t, p.diameterMm, p.lengthMm])).toEqual(fine.setting.prongs.map((p) => [p.t, p.diameterMm, p.lengthMm]));
    expect(rough.culetGapMm).toBe(fine.culetGapMm);
  });
});

describe("動かしている間は粗く速く、止まったら細かく作り直す", () => {
  afterEach(() => vi.useRealTimers());

  it("細かい形への作り直しは、そうと分かる印つきで知らせ、欄に出す結果は粗い形と同じ（欄を描き直さなくてよい）", () => {
    vi.useFakeTimers();
    const seen: { b: Built; refined?: boolean }[] = [];
    const s = new RingSession(stone, () => seedLedger(), (b, _why, refined) => seen.push({ b, refined }), () => "");
    s.solid = true;
    s.deferFinal = true;
    s.build("最初");
    s.setSetting({ prong_mm: 0.4, reason: "細く" });
    vi.advanceTimersByTime(FINAL_DELAY_MS + 10);
    expect(seen.map((x) => !!x.refined)).toEqual([false, false, true]);
    const shown = ({ b }: { b: Built }) => [b.problems.map((p) => [p.check, p.current, p.required]), b.ring.setting.join, b.ring.setting.prongs.length, b.ring.setting.prongs[0]?.diameterMm, b.ring.notchDepthMm, b.ring.culetGapMm];
    expect(seen[1].b.problems.length).toBeGreaterThan(0);
    expect(shown(seen[2])).toEqual(shown(seen[1]));
  }, 60000);

  it("2 回目からは粗い形をすぐ返し、少し待って細かい形で同じ onChange をもう一度呼ぶ。確かめの結果は同じ", () => {
    vi.useFakeTimers();
    const seen: Built[] = [];
    const s = new RingSession(stone, () => seedLedger(), (b) => seen.push(b), () => "");
    s.solid = true;
    s.deferFinal = true;
    s.state.prongMm = 1.66;
    s.build("最初");
    // 最初の 1 回は細かい形だけ
    expect(seen.length).toBe(1);
    expect(s.pendingFinal).toBe(false);
    const fineTris = seen[0].ring.setting.positions.length;
    s.setSetting({ prong_mm: 1.5, reason: "細く" });
    expect(seen.length).toBe(2);
    expect(s.pendingFinal).toBe(true);
    expect(seen[1].ring.setting.positions.length).toBeLessThan(fineTris);
    vi.advanceTimersByTime(FINAL_DELAY_MS + 10);
    expect(seen.length).toBe(3);
    expect(s.pendingFinal).toBe(false);
    expect(s.built).toBe(seen[2]);
    expect(seen[2].ring.setting.positions.length).toBeGreaterThan(seen[1].ring.setting.positions.length);
    expect(seen[2].problems.map((p) => p.check)).toEqual(seen[1].problems.map((p) => p.check));
    // 戻すと（restore）粗い形 → flush で、待たずに細かい形
    s.restore({ ...s.snapshot(), prongMm: 1.66 });
    expect(s.pendingFinal).toBe(true);
    s.flush();
    expect(s.pendingFinal).toBe(false);
    expect(s.built!.ring.setting.positions.length).toBe(fineTris);
    expect(seen.length).toBe(5);
    // 細かい一体の形を何度も作るので、ほかの重い作業と同時に回すと 5 秒を超えることがある
  }, 60000);

  it("画面のないとき（テスト・MCP）は、いつも同期で細かい形", () => {
    const s = new RingSession(stone, () => seedLedger(), () => undefined, () => "");
    expect(s.deferFinal).toBe(false);
    s.build();
    s.setSetting({ height: "low", reason: "低め" });
    expect(s.pendingFinal).toBe(false);
  });
});
