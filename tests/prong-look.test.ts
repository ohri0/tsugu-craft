// 爪を押して、その爪だけ（または全部の爪）の形を直す（作者の声 2026-11-06：爪だけをタップしたら編集できるモードをつけたら、先を反らせるとかできる）。
// 直しても、STL は閉じたまま、石に刺さらず、確かめのルールは爪ごとの数で効く。直さなければ、今の形から 1 点も変わらない。
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openEdges } from "../src/cad/solid";
import { buildRing, type RingParams } from "../src/geometry/ring";
import { buildSetting, type ProngLook, type SettingResult } from "../src/geometry/setting";
import { girdleCenter, stoneScaleAt, type StoneParams } from "../src/geometry/stone";
import { checkRing, holdRatio } from "../src/rules/checks";
import { GUIDES } from "../src/rules/guides";
import { seedLedger } from "../src/rules/ledger";
import { presetOutline, PRESETS } from "../src/studio/presets";
import { carryDesign, DEFAULT_STATE, RingSession } from "../src/studio/session";

const stoneOf = (id: string): StoneParams => {
  const p = PRESETS.find((x) => x.id === id)!;
  return { outlineMm: presetOutline(p), longMm: p.longMm, widthMm: p.widthMm, depthMm: p.depthMm };
};
const params = (stone: StoneParams, s: Partial<RingParams["setting"]>): RingParams => ({
  stone,
  setting: { style: "prong", vAtCorners: false, join: "between", ...s },
  shank: { gou: 11, widthMm: 1.8 },
});
const hash = (a: Float32Array) => createHash("sha1").update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest("hex").slice(0, 16);

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

/** 面の点が、石の形の中へどれだけ入っているか（いちばん深い所 mm） */
function deepestInStone(stone: StoneParams, s: SettingResult): number {
  const h = s.heights;
  const pts = stone.outlineMm;
  const { x: cx, y: cy } = girdleCenter(pts);
  const n = pts.length;
  let deep = 0;
  const pos = s.positions;
  for (let i = 0; i < pos.length; i += 3) {
    const z = pos[i + 2];
    if (z <= h.culetZ || z >= h.tableZ) continue;
    const k = stoneScaleAt(h, z);
    if (k < 0.02) continue;
    const x = cx + (pos[i] - cx) / k;
    const y = cy + (pos[i + 1] - cy) / k;
    let inside = false;
    let best = Infinity;
    for (let a = 0, b = n - 1; a < n; b = a++) {
      const p = pts[a];
      const q = pts[b];
      if (p.y > y !== q.y > y && x < ((q.x - p.x) * (y - p.y)) / (q.y - p.y) + p.x) inside = !inside;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const t = Math.max(0, Math.min(1, ((x - p.x) * dx + (y - p.y) * dy) / (dx * dx + dy * dy || 1e-12)));
      best = Math.min(best, Math.hypot(p.x + dx * t - x, p.y + dy * t - y));
    }
    if (inside) deep = Math.max(deep, Math.min(best * k, Math.min(z - h.culetZ, h.tableZ - z)));
  }
  return deep;
}

/** 爪 i の三角形の点のうち、いちばん高い点 */
function tipOf(s: SettingResult, i: number): [number, number, number] {
  const r = s.prongs[i].triangles;
  const a = s.positions;
  let best: [number, number, number] = [0, 0, -Infinity];
  for (let k = r.start * 9; k < (r.start + r.count) * 9; k += 3) if (a[k + 2] > best[2]) best = [a[k], a[k + 1], a[k + 2]];
  return best;
}
/** 爪 i の、石の中心からいちばん遠い水平の距離（高さ z0〜z1 の間） */
function reachOf(s: SettingResult, i: number, c: { x: number; y: number }, z0: number, z1: number): number {
  const r = s.prongs[i].triangles;
  const a = s.positions;
  let best = 0;
  for (let k = r.start * 9; k < (r.start + r.count) * 9; k += 3) if (a[k + 2] >= z0 && a[k + 2] <= z1) best = Math.max(best, Math.hypot(a[k] - c.x, a[k + 1] - c.y));
  return best;
}

const STRONG: ProngLook = { baseScale: GUIDES.prong.edit.strong.baseScale, tipScale: GUIDES.prong.edit.strong.tipScale };
const LOOKS: [string, ProngLook][] = [
  ["反り", { flareMm: GUIDES.prong.edit.flareMm.max }],
  ["長い先", { tipLengthMm: GUIDES.prong.edit.tipLengthMm.max }],
  ["短い先", { tipLengthMm: GUIDES.prong.edit.tipLengthMm.min }],
  ["土台を太く・先を力強く", STRONG],
  ["いちばん太い土台と先", { baseScale: GUIDES.prong.edit.baseScale.max, tipScale: GUIDES.prong.edit.tipScale.max }],
  ["全部", { flareMm: 0.3, tipLengthMm: 0.2, ...STRONG }],
];

describe("直さなければ、形は変わらない", () => {
  // この直しを入れる前の形のハッシュ（2026-11-06。爪留め・覆輪。石座の形だけを見る）
  it.each([
    ["腕の上・丸い爪・管", { join: "on", prongTip: "round" }, "09ed3370ed12fd94"],
    ["腕の上・丸い爪・一体", { join: "on", prongTip: "round", solid: true, solidQuality: "preview" }, "869772d5902c8998"],
    ["腕の上・尖り爪・一体", { join: "on", prongTip: "oni", solid: true, solidQuality: "preview" }, "ae02c7ab3ac12a06"],
    ["腕の間・丸い爪・一体", { join: "between", prongTip: "round", solid: true, solidQuality: "preview" }, "289b1c16987953c9"],
    ["腕の間・尖り爪・一体", { join: "between", prongTip: "oni", solid: true, solidQuality: "preview" }, "9b8b090c2be40269"],
    ["覆輪", { style: "bezel" }, "a020dcbdf21e9865"],
  ] as [string, Partial<RingParams["setting"]>, string][])("%s：前と同じ", (_n, set, want) => {
    expect(hash(buildRing(params(stoneOf("round"), set)).setting.positions)).toBe(want);
  });
  for (const join of ["on", "between"] as const) {
    for (const tip of ["round", "oni"] as const) {
      it(`${join}・${tip}：空の直しは、直さない形と同じ`, () => {
        const stone = stoneOf("round");
        const plain = buildRing(params(stone, { join, prongTip: tip, solid: true, solidQuality: "preview" }));
        const empty = buildRing(params(stone, { join, prongTip: tip, solid: true, solidQuality: "preview", prongLook: {}, prongEdits: [null, undefined, {}, null] }));
        expect(hash(empty.setting.positions)).toBe(hash(plain.setting.positions));
      });
    }
  }
  it("爪の数と違う 1 本ずつの直しは使わない", () => {
    const stone = stoneOf("round");
    const plain = buildSetting({ stone, style: "prong", vAtCorners: false, join: "on" });
    const s = buildSetting({ stone, style: "prong", vAtCorners: false, join: "on", prongEdits: [{ flareMm: 0.5 }] });
    expect(hash(s.positions)).toBe(hash(plain.positions));
  });
  it("覆輪・テンションには効かない", () => {
    const stone = stoneOf("round");
    for (const style of ["bezel", "tension"] as const) {
      const a = buildRing(params(stone, { style }));
      const b = buildRing(params(stone, { style, prongLook: { flareMm: 0.5, baseScale: 1.5 } }));
      expect(hash(b.ringPositions.setting)).toBe(hash(a.ringPositions.setting));
    }
  });
});

describe("直した爪も、STL は閉じたまま、石に刺さらない", () => {
  for (const id of ["round", "pear", "princess"]) {
    for (const join of ["between", "on"] as const) {
      for (const tip of ["round", "oni"] as const) {
        for (const [name, look] of LOOKS) {
          it(`${id}・${join}・${tip}：${name}`, () => {
            const stone = stoneOf(id);
            const edits = [{ ...look, tip }, null, null, null];
            const s = buildRing(params(stone, { join, prongTip: tip, prongLook: look, solid: true, solidQuality: "preview" })).setting;
            expect(openEdges(s.positions)).toBe(0);
            expect(components(s.positions)).toBe(1);
            // 粗い格子では、丸い爪でも座の角で 0.03 mm くらい入る（格子の目より小さい）
            expect(deepestInStone(stone, s)).toBeLessThan(0.05);
            expect(s.heights.topZ).toBeLessThan(s.heights.tableZ + 0.35);
            // 線を管にした形も閉じている（画面の ?tube と軽い確かめの形）
            const tube = buildRing(params(stone, { join, prongTip: tip, prongEdits: edits.slice(0, s.prongs.length) })).setting;
            expect(openEdges(tube.positions)).toBe(0);
          });
        }
      }
    }
  }
  it("細かい一体の形でも、閉じてひとつながりで、石に刺さらない", () => {
    const stone = stoneOf("round");
    const s = buildRing(params(stone, { prongEdits: [{ flareMm: 0.4, ...STRONG, tip: "oni" }, { tipLengthMm: 0.3 }, null, { diameterMm: 1.4 }], solid: true, solidQuality: "final" })).setting;
    expect(openEdges(s.positions)).toBe(0);
    expect(components(s.positions)).toBe(1);
    expect(deepestInStone(stone, s)).toBeLessThan(0.03);
  }, 180000);
  it("先の長さをいちばん長くしても、形の先は石の上面より下", () => {
    const stone = stoneOf("round");
    for (const prongTip of ["round", "oni"] as const) {
      const s = buildRing(params(stone, { prongTip, prongLook: { tipLengthMm: GUIDES.prong.edit.tipLengthMm.max }, solid: true, solidQuality: "preview" })).setting;
      expect(s.heights.topZ).toBeLessThan(s.heights.tableZ);
    }
  });
  it("全部の爪の長さの範囲で、先は石の上面より下（確かめの数）", () => {
    const stone = stoneOf("round");
    const s = buildSetting({ stone, style: "prong", vAtCorners: false, join: "on", prongLook: { tipLengthMm: 5 } });
    expect(s.prongs[0].lengthMm + s.heights.upperRingZ!).toBeLessThanOrEqual(s.heights.tableZ);
    const low = buildSetting({ stone, style: "prong", vAtCorners: false, join: "on", prongLook: { tipLengthMm: -5 } });
    expect(low.prongs[0].tipZ).toBeGreaterThan(0);
  });
});

describe("1 本だけ直すと、その爪だけ変わる", () => {
  const stone = stoneOf("round");
  const c = girdleCenter(stone.outlineMm);
  const plain = buildSetting({ stone, style: "prong", vAtCorners: false, join: "on" });
  it("先の反り：その爪の先だけ外へ出る", () => {
    const s = buildSetting({ stone, style: "prong", vAtCorners: false, join: "on", prongEdits: [{ flareMm: 0.4 }, null, null, null] });
    const top = plain.heights.tipZ!;
    expect(reachOf(s, 0, c, top - 0.5, top + 1)).toBeGreaterThan(reachOf(plain, 0, c, top - 0.5, top + 1) + 0.1);
    expect(reachOf(s, 1, c, top - 0.5, top + 1)).toBeCloseTo(reachOf(plain, 1, c, top - 0.5, top + 1), 6);
    expect(s.prongs.map((p) => p.t)).toEqual(plain.prongs.map((p) => p.t));
    expect(s.heights.upperRingZ).toBe(plain.heights.upperRingZ);
  });
  it("先の長さ：その爪の先だけ高くなる", () => {
    const s = buildSetting({ stone, style: "prong", vAtCorners: false, join: "on", prongEdits: [null, { tipLengthMm: 0.3 }, null, null] });
    expect(tipOf(s, 1)[2]).toBeGreaterThan(tipOf(plain, 1)[2] + 0.2);
    expect(tipOf(s, 0)[2]).toBeCloseTo(tipOf(plain, 0)[2], 6);
    expect(s.prongs[1].lengthMm).toBeCloseTo(plain.prongs[1].lengthMm + 0.3, 6);
  });
  it("土台を太く：下の方が外へ太り、石の側は動かない", () => {
    const s = buildSetting({ stone, style: "prong", vAtCorners: false, join: "on", prongEdits: [{ baseScale: 1.5 }, null, null, null] });
    const low = plain.heights.baseZ;
    const mid = low + 0.8;
    expect(reachOf(s, 0, c, low, mid)).toBeGreaterThan(reachOf(plain, 0, c, low, mid) + 0.1);
  });
  it("先の形：1 本だけ尖り爪にできる", () => {
    const s = buildSetting({ stone, style: "prong", vAtCorners: false, join: "on", prongEdits: [{ tip: "oni" }, null, null, null] });
    expect(s.prongs.map((p) => p.tip)).toEqual(["oni", "round", "round", "round"]);
    expect(s.prongTip).toBe("oni");
    // 全体が尖り爪で、1 本だけ丸い爪
    const m = buildSetting({ stone, style: "prong", vAtCorners: false, join: "on", prongTip: "oni", prongEdits: [{ tip: "round" }, null, null, null] });
    expect(m.prongs.map((p) => p.tip)).toEqual(["round", "oni", "oni", "oni"]);
  });
});

describe("確かめのルールは今までどおり効く", () => {
  const stone = stoneOf("round");
  const guides = GUIDES;
  const ring = (edits: (ProngLook | null)[]) => buildRing(params(stone, { prongEdits: edits }));
  it("1 本だけ細くすると、その爪が「爪の最低の太さ」に引っかかる", () => {
    const r = ring([{ diameterMm: 0.4 }, null, null, null]);
    const ps = checkRing(r, { position: "top", guides }).filter((p) => p.check === "prong-thin");
    expect(ps.map((p) => p.target)).toEqual([{ kind: "prong", index: 0 }]);
  });
  it("1 本だけ細くすると、留まりが下がる", () => {
    const a = holdRatio(ring([null, null, null, null]).setting, guides);
    const b = holdRatio(ring([{ diameterMm: 0.5 }, null, null, null]).setting, guides);
    expect(b).toBeLessThan(a);
  });
  it("土台と先の直しは、留まりの計算を甘くしない（太さは爪の太さのまま）", () => {
    const a = holdRatio(ring([null, null, null, null]).setting, guides);
    const b = holdRatio(ring([STRONG, STRONG, STRONG, STRONG]).setting, guides);
    expect(b).toBeCloseTo(a, 9);
  });
  it("先を短くすると、その爪が「爪の先の高さ」に引っかかる", () => {
    const ps = checkRing(ring([{ tipLengthMm: -0.4 }, null, null, null]), { position: "top", guides }).filter((p) => p.check === "tip-height");
    expect(ps).toHaveLength(1);
    expect(ps[0].target).toEqual({ kind: "prong", index: 0 });
  });
  it("強く反らせると、押さえる長さが減って引っかかる。少しなら通る", () => {
    const big = checkRing(ring([{ flareMm: GUIDES.prong.edit.flareMm.max }, null, null, null]), { position: "top", guides }).filter((p) => p.check === "tip-height");
    expect(big).toHaveLength(1);
    const small = checkRing(ring([{ flareMm: 0.1 }, null, null, null]), { position: "top", guides }).filter((p) => p.check === "tip-height");
    expect(small).toHaveLength(0);
  });
  it("直していなければ、爪の先の高さの確かめは今までどおり 1 つにまとまる", () => {
    const r = buildRing(params(stone, {}));
    for (const p of r.setting.prongs) expect(p.tipZ).toBe(r.setting.heights.tipZ);
  });
});

describe("設計の場：全部にそろえる・戻す・残す", () => {
  const session = () => {
    const s = new RingSession(stoneOf("round"), () => seedLedger(), () => undefined, () => "");
    s.state = { ...DEFAULT_STATE };
    s.build("はじめ");
    return s;
  };
  it("この爪だけ：その爪だけが変わる。全部の爪にそろえる：そろい、1 本ずつの直しは消える", () => {
    const s = session();
    s.setProngLook(1, { flareMm: 0.2, diameterMm: 1.3 });
    expect(s.built!.ring.setting.prongs.map((p) => p.diameterMm)[1]).toBe(1.3);
    expect(s.built!.ring.setting.prongs[0].diameterMm).not.toBe(1.3);
    expect(s.prongLookAt(1).flareMm).toBe(0.2);
    expect(s.prongLookAt(0).flareMm).toBe(0);
    s.alignProngs(1);
    expect(s.state.prongEdits).toBeUndefined();
    expect(s.state.prongMm).toBe(1.3);
    expect(s.state.prongLook).toEqual({ flareMm: 0.2 });
    expect(s.built!.ring.setting.prongs.every((p) => p.diameterMm === 1.3 && p.look?.flareMm === 0.2)).toBe(true);
  });
  it("全部を直すと、その項目の 1 本ずつの直しは消える。ほかの項目は残る", () => {
    const s = session();
    s.setProngLook(0, { flareMm: 0.2, baseScale: 1.3 });
    s.setProngLook(null, { flareMm: 0.1 });
    expect(s.prongLookAt(0)).toMatchObject({ flareMm: 0.1, baseScale: 1.3 });
    expect(s.prongLookAt(2)).toMatchObject({ flareMm: 0.1, baseScale: 1 });
  });
  it("「太くする」（全部の爪の太さ）は、1 本だけ細い爪も直す", () => {
    const s = session();
    s.setProngLook(0, { diameterMm: 0.4 });
    expect(s.built!.problems.some((p) => p.check === "prong-thin")).toBe(true);
    s.setSetting({ prong_mm: 1.1, reason: "直し方から" });
    expect(s.built!.problems.some((p) => p.check === "prong-thin")).toBe(false);
    expect(s.state.prongEdits).toBeUndefined();
  });
  it("先の形を全部選ぶと、1 本ずつの先の形は消える", () => {
    const s = session();
    s.setProngLook(0, { tip: "oni", flareMm: 0.2 });
    s.setSetting({ prong_tip: "round", reason: "手で" });
    expect(s.built!.ring.setting.prongs[0].tip).toBe("round");
    expect(s.prongLookAt(0).flareMm).toBe(0.2);
  });
  it("直し方「先を上げる・下げる」：反りと長さの直しを消す", () => {
    const s = session();
    s.setProngLook(0, { flareMm: 0.6, baseScale: 1.3 });
    expect(s.built!.problems.some((p) => p.check === "tip-height")).toBe(true);
    s.resetProngTips();
    expect(s.built!.problems.some((p) => p.check === "tip-height")).toBe(false);
    expect(s.prongLookAt(0)).toMatchObject({ flareMm: 0, baseScale: 1.3 });
  });
  it("爪の数を変えると、1 本ずつの直しは消えて、知らせる", () => {
    const s = session();
    s.setProngLook(0, { flareMm: 0.2 });
    expect(s.takeEditsDropped()).toBe(false);
    s.setSetting({ prong_count: 6, reason: "手で" });
    expect(s.state.prongEdits).toBeUndefined();
    // 本数を画面が直接消したとき（自動）も、数が合わなければ消して知らせる
    s.setProngLook(0, { flareMm: 0.2 });
    s.state.prongCount = 4;
    s.build("自動");
    expect(s.state.prongEdits).toBeUndefined();
    expect(s.takeEditsDropped()).toBe(true);
  });
  it("戻す・進む（設計の写し）で戻る", () => {
    const s = session();
    const before = s.snapshot();
    const h0 = hash(s.built!.ring.ringPositions.setting);
    s.setProngLook(0, { flareMm: 0.3 });
    const h1 = hash(s.built!.ring.ringPositions.setting);
    expect(h1).not.toBe(h0);
    const after = s.snapshot();
    s.state = structuredClone(before);
    s.build("戻す");
    expect(hash(s.built!.ring.ringPositions.setting)).toBe(h0);
    s.state = structuredClone(after);
    s.build("進む");
    expect(hash(s.built!.ring.ringPositions.setting)).toBe(h1);
  });
  it("保存と読み込み（JSON）で残る。同じ石なら引き継ぎ、違う大きさなら引き継がない", () => {
    const s = session();
    s.setProngLook(0, { flareMm: 0.3, tip: "oni" });
    s.setProngLook(null, { baseScale: 1.2 });
    const kept = JSON.parse(JSON.stringify(s.snapshot()));
    const r = new RingSession(stoneOf("round"), () => seedLedger(), () => undefined, () => "");
    r.state = kept;
    r.build("読み込み");
    expect(hash(r.built!.ring.ringPositions.setting)).toBe(hash(s.built!.ring.ringPositions.setting));
    expect(r.prongLookAt(0)).toMatchObject({ flareMm: 0.3, tip: "oni", baseScale: 1.2 });
    const same = carryDesign(kept, { ...DEFAULT_STATE }, { shape: true, size: true });
    expect(same.prongEdits).toEqual(kept.prongEdits);
    expect(same.prongLook).toEqual(kept.prongLook);
    const other = carryDesign(kept, { ...DEFAULT_STATE });
    expect(other.prongEdits).toBeUndefined();
    expect(other.prongLook).toBeUndefined();
  });
});
