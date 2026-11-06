// 一体の石座の重い所を別の糸（Web Worker）で作っても、形・STL・確かめの結果は、この糸で全部作ったときと同じか（2026-11-06 つまみが重い）。
// 本物の Worker の代わりに、同じ関数（solidsForJob）を少し後に呼ぶ偽物の口で確かめる。
import { afterEach, describe, expect, it, vi } from "vitest";
import { heavy, recordHeavy, replayHeavy } from "../src/geometry/sdf";
import { vertexIds } from "../src/geometry/setting";
import { seedLedger } from "../src/rules/ledger";
import { OFFLOAD_FINAL_DELAY_MS, RingSession, shapeFromSolids, solidsForJob, type Built, type RingState, type ShapeJob, type ShapeOffload } from "../src/studio/session";
import { stoneFrom } from "./helpers/stones";
import { regular, triangle } from "./helpers/synth";

const tri = stoneFrom(triangle(200, 200, 160, 140), 8.88, 4.24);
const round = stoneFrom(regular(200, 200, 100, 64), 6.5, 3.9);
const ledger = seedLedger();

/** 形の配列の指紋（ビットのまま） */
function hash(a: Float32Array | undefined): string {
  if (!a) return "none";
  let x = 2166136261 >>> 0;
  const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  for (let i = 0; i < u.length; i++) x = Math.imul(x ^ u[i], 16777619) >>> 0;
  return `${a.length}:${x.toString(16)}`;
}
/** 画面・STL・確かめに出る物 */
function look(b: Built) {
  const r = b.ring;
  return {
    stone: hash(r.ringPositions.stone),
    setting: hash(r.ringPositions.setting),
    normals: hash(r.ringPositions.settingNormals),
    shank: hash(r.ringPositions.shank),
    weight: r.metalWeightG,
    culet: r.culetGapMm,
    prongs: r.setting.prongs.map((p) => [p.t, p.diameterMm, p.triangles.start, p.triangles.count]),
    problems: JSON.stringify(b.problems),
  };
}
/** この糸で全部作った形 */
function direct(stone: typeof tri, state: RingState, quality: "preview" | "final"): Built {
  const s = new RingSession(stone, () => ledger, () => undefined, () => "");
  s.solid = true;
  s.state = structuredClone(state);
  return s.shapeOnly(quality);
}
const base = (over: Partial<RingState> = {}): RingState => ({ style: "prong", height: "standard", orientation: "along", metal: "k18yg", gou: 11, position: "top", join: "between", prongMm: 1.2, ...over });

describe("別の糸で作った重い所から組んでも、同じ形", () => {
  it.each([
    ["三角の石・腕の間に挟む（細かい形）", tri, base(), "final"],
    ["三角の石・腕の上にのせる（粗い形）", tri, base({ join: "on", joinSet: true }), "preview"],
    ["丸い石・腕の上にのせる（細かい形）", round, base({ join: "on", joinSet: true, prongMm: undefined }), "final"],
  ] as const)("%s：STL の配列・三角の数・確かめの結果が同じ", (_n, stone, state, quality) => {
    const job: ShapeJob = { stone, state: structuredClone(state), ledger, quality };
    // 別の糸へは写しが届き、写しが戻る
    const got = structuredClone(solidsForJob(structuredClone(job)));
    expect(got.list.length).toBeGreaterThan(0);
    const replayed = shapeFromSolids(job, got);
    expect(look(replayed)).toEqual(look(direct(stone, state, quality)));
  }, 180000);

  it("覚えた重い所の数や順が合わなければ、形を出さずに止まる", () => {
    const { list, sigs } = recordHeavy(() => [heavy("a", () => new Float32Array([1, 2])), heavy("b", () => 3)]);
    expect(list).toEqual([new Float32Array([1, 2]), 3]);
    expect(replayHeavy(list, sigs, () => [heavy("a", () => new Float32Array(0)), heavy("b", () => 0)])).toEqual([new Float32Array([1, 2]), 3]);
    expect(() => replayHeavy(list, sigs, () => heavy("b", () => 0))).toThrow();
    expect(() => replayHeavy(list, sigs, () => heavy("a", () => 0))).toThrow();
    // ふだん（覚えも使いもしない）は、作るだけ
    expect(heavy("a", () => 5)).toBe(5);
  });

  it("頂点の番号は、前の分け方（xyz を小数 4 桁の字にして比べる）と同じ", () => {
    const pos = new Float32Array([0, 0, 0, -0, 0, 0, 1.00001, 2, 3, 1.00002, 2, 3, 1.00006, 2, 3, 0.12345, 0.5, -0.5, 0.12345, 0.5, -0.5, 7, 8, 9]);
    const keys = Array.from({ length: pos.length / 3 }, (_, v) => `${pos[v * 3].toFixed(4)},${pos[v * 3 + 1].toFixed(4)},${pos[v * 3 + 2].toFixed(4)}`);
    const { of, count } = vertexIds(pos);
    expect(count).toBe(new Set(keys).size);
    for (let a = 0; a < keys.length; a++) for (let b = 0; b < keys.length; b++) expect(of[a] === of[b]).toBe(keys[a] === keys[b]);
  });
});

describe("つまみを動かしている間は、すぐの形を返し、一体の形は別の糸から届く", () => {
  afterEach(() => vi.useRealTimers());

  /** 偽物の別の糸：同じ関数を、少し後に呼ぶ（届く物は写し） */
  function fakeOffload(log: string[]): ShapeOffload {
    return {
      request(lane, job, done) {
        const j = structuredClone(job);
        log.push(lane);
        setTimeout(() => done(structuredClone(solidsForJob(j))), lane === "preview" ? 30 : 100);
      },
    };
  }

  it("続けて動かしても、最後に届く細かい形は、この糸で全部作った形と同じ。古い設計の形は出さない", () => {
    vi.useFakeTimers();
    const seen: { b: Built; refined?: boolean; quick: boolean }[] = [];
    const s = new RingSession(tri, () => ledger, (b, _w, refined) => seen.push({ b, refined, quick: s.quick }), () => "");
    s.solid = true;
    s.deferFinal = true;
    const log: string[] = [];
    s.offload = fakeOffload(log);
    s.state = base();
    s.build("最初");
    // 最初の 1 回は、この糸で細かい形（別の糸には頼まない）
    expect(log).toEqual([]);
    expect(seen[0].b.ring.ringPositions.settingNormals).toBeTruthy();
    // ＋ を続けて押す（細かい形を頼む前に、次を押す）
    for (const w of [2.3, 2.4, 2.5]) {
      s.setShank({ width_mm: w, reason: "手で" });
      expect(s.quick).toBe(true);
      expect(s.pendingFinal).toBe(true);
      // すぐの形は一体にしない（管を重ねた形）。確かめの結果は出ている
      expect(s.built!.ring.ringPositions.settingNormals).toBeUndefined();
      vi.advanceTimersByTime(10);
    }
    const quick = s.built!;
    vi.advanceTimersByTime(OFFLOAD_FINAL_DELAY_MS + 200);
    expect(s.pendingFinal).toBe(false);
    expect(s.quick).toBe(false);
    // 細かい形は最後の設計の 1 回だけ頼んだ
    expect(log.filter((l) => l === "final").length).toBe(1);
    const fine = s.built!;
    expect(look(fine)).toEqual(look(direct(tri, s.state, "final")));
    // 届いた形は「同じ設計の細かい形」の印つき。確かめの結果は、すぐの形と同じ
    expect(seen[seen.length - 1].refined).toBe(true);
    expect(JSON.stringify(fine.problems)).toBe(JSON.stringify(quick.problems));
    // 古い設計（2.3・2.4 mm）の形は出していない
    for (const x of seen.filter((x) => x.refined)) expect(x.b.ring.shank.widthMm).toBe(2.5);
  }, 180000);

  it("待っている間に flush すると、この糸で細かい形を作り、あとから届く形は使わない", () => {
    vi.useFakeTimers();
    const seen: Built[] = [];
    const s = new RingSession(tri, () => ledger, (b) => seen.push(b), () => "");
    s.solid = true;
    s.deferFinal = true;
    s.offload = fakeOffload([]);
    s.state = base();
    s.build("最初");
    s.setShank({ thickness_mm: 1.8, reason: "手で" });
    s.flush();
    expect(s.pendingFinal).toBe(false);
    const n = seen.length;
    const fine = s.built!;
    vi.advanceTimersByTime(OFFLOAD_FINAL_DELAY_MS + 200);
    expect(seen.length).toBe(n);
    expect(s.built).toBe(fine);
    expect(look(fine)).toEqual(look(direct(tri, s.state, "final")));
  }, 180000);

  it("別の糸が使えないときは、前と同じく、この糸で少し後に細かい形を作る", () => {
    vi.useFakeTimers();
    const s = new RingSession(tri, () => ledger, () => undefined, () => "");
    s.solid = true;
    s.deferFinal = true;
    s.offload = { request: (_l, _j, done) => setTimeout(() => done(null), 0) };
    s.state = base();
    s.build("最初");
    s.setShank({ width_mm: 2.4, reason: "手で" });
    vi.advanceTimersByTime(5000);
    expect(s.offload).toBe(null);
    expect(s.pendingFinal).toBe(false);
    expect(s.built!.ring.ringPositions.settingNormals).toBeTruthy();
    expect(look(s.built!)).toEqual(look(direct(tri, s.state, "final")));
  }, 180000);
});
