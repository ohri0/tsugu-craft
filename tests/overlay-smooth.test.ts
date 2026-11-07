import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { holdFlag, OVERLAY_SMOOTH, smoothTrack, splitHands, trackAt } from "../src/craft/overlay-smooth";
import { importRecord } from "../src/craft/record";
import { measureTake, type PairHands } from "../src/craft/pair-measure";
import { judgeTake } from "../src/craft/hand-judge";

const times = (n: number, fps = 10) => Array.from({ length: n }, (_, i) => i / fps);

describe("描く線をならす（smoothTrack・trackAt）", () => {
  it("ジグザグに揺れる点は、ならすと揺れが小さくなる。まっすぐ動く点は、遅れずにそのまま", () => {
    const ts = times(40);
    const zig = ts.map((_, i) => [0.5 + (i % 2 ? 0.02 : -0.02)]);
    const z = smoothTrack(ts, zig);
    const amp = (vs: (number[] | null)[]) => Math.max(...vs.slice(5, 35).map((v) => Math.abs(v![0] - 0.5)));
    expect(amp(z.vs)).toBeLessThan(0.02 * 0.6);
    const ramp = ts.map((t) => [t]);
    const r = smoothTrack(ts, ramp);
    // 前後が同じ重みなので、真ん中の値はずれない（遅れが出ない）
    for (let i = 5; i < 35; i++) expect(r.vs[i]![0]).toBeCloseTo(ts[i], 6);
  });

  it("こまの間の時刻は、前後のこまを線でつなぐ（跳ばない）", () => {
    const ts = times(20);
    const tr = smoothTrack(ts, ts.map((t) => [t * 2]), { ...OVERLAY_SMOOTH, radiusS: 0 });
    expect(trackAt(tr, 0.55)!.v[0]).toBeCloseTo(1.1, 6);
    expect(trackAt(tr, 0.51)!.v[0]).toBeCloseTo(1.02, 6);
  });

  it("1 こまだけ見つかった点は描かない。1〜3 こまの見失いは前後からつなぐ", () => {
    const ts = times(30);
    const fr = ts.map((_, i) => (i === 3 ? [1] : i >= 10 && i < 25 && i !== 15 && i !== 16 ? [i] : null));
    const tr = smoothTrack(ts, fr, { ...OVERLAY_SMOOTH, radiusS: 0 });
    expect(tr.vs[3]).toBeNull();
    expect(trackAt(tr, 0.3)).toBeNull();
    expect(tr.vs[15]![0]).toBeCloseTo(15, 6);
    expect(tr.vs[16]![0]).toBeCloseTo(16, 6);
    expect(tr.runs).toEqual([[1, 2.4]]);
  });

  it("見えはじめと見えなくなる所は薄く、真ん中は濃い", () => {
    const ts = times(30);
    const fr = ts.map((_, i) => (i >= 10 && i < 20 ? [0] : null));
    const tr = smoothTrack(ts, fr);
    const start = trackAt(tr, 0.96)!.alpha;
    const mid = trackAt(tr, 1.45)!.alpha;
    const end = trackAt(tr, 1.94)!.alpha;
    expect(mid).toBe(1);
    expect(start).toBeGreaterThan(0);
    expect(start).toBeLessThan(0.5);
    expect(end).toBeLessThan(0.5);
    expect(trackAt(tr, 2.5)).toBeNull();
  });

  it("見えないこまばかりでも壊れない", () => {
    const tr = smoothTrack([0, 0.1, 0.2], [null, null, null]);
    expect(trackAt(tr, 0.1)).toBeNull();
    expect(trackAt(smoothTrack([], []), 0)).toBeNull();
  });
});

describe("手をつなぐ（splitHands）", () => {
  const hand = (x: number, y: number) => Array.from({ length: 21 }, () => [x, y]).flat();
  it("手の並びの順がこまごとに入れ替わっても、同じ手は同じ並びに入る", () => {
    const frames = [
      { hands: [hand(0.2, 0.5), hand(0.8, 0.5)] },
      { hands: [hand(0.81, 0.5), hand(0.21, 0.5)] },
      { hands: [hand(0.82, 0.5)] },
      { hands: [hand(0.22, 0.5), hand(0.83, 0.5)] },
    ];
    const [a, b] = splitHands(frames);
    const xs = (s: (readonly number[] | null)[]) => s.map((h) => (h ? h[0] : null));
    const [left, right] = xs(a)[0]! < 0.5 ? [a, b] : [b, a];
    expect(xs(left)).toEqual([0.2, 0.21, null, 0.22]);
    expect(xs(right)).toEqual([0.8, 0.81, 0.82, 0.83]);
  });
});

describe("札を読める長さだけ出す（holdFlag）", () => {
  it("一度立つと holdS 秒は立ったまま", () => {
    const ts = times(30);
    const hits = ts.map((_, i) => i === 5);
    const h = holdFlag(hits, ts, 1);
    expect(h.slice(0, 5).some(Boolean)).toBe(false);
    expect(h.slice(5, 16).every(Boolean)).toBe(true);
    expect(h[16]).toBe(false);
  });
});

describe("ならしても判定は変わらない（判定は読んだ点のままで測る）", () => {
  it("職人の いい例・よくない例 の判定は、描く線をならす前と同じ", () => {
    const info = JSON.parse(readFileSync("public/mihon/pair.json", "utf8")) as PairHands;
    const read = (n: string) => importRecord(readFileSync(`public/mihon/${n}.json`, "utf8")).landmarksSampled;
    const g = read("master");
    const b = read("learner");
    const before = judgeTake(measureTake(g, info, null), measureTake(b, info, null), { hold: info.hold.name, tool: info.file.tool });
    // 描くためにならす（こちらは手の点の写しを使う。読んだ点は変えない）
    for (const s of [g, b]) for (const hs of splitHands(s.frames)) smoothTrack(s.frames.map((f) => f.t), hs);
    const after = judgeTake(measureTake(g, info, null), measureTake(b, info, null), { hold: info.hold.name, tool: info.file.tool });
    expect(after).toEqual(before);
  });
});
