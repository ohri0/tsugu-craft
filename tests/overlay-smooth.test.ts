import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HAND_OVERLAY, handDist, holdFlag, OVERLAY_SMOOTH, palmCenter, plausibleHands, smoothTrack, splitHands, trackAt } from "../src/craft/overlay-smooth";
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

describe("手の骨組みを、手のない所に描かない（2026-11-08 画面の見どころで、骨組みが手から離れて浮いた）", () => {
  const hand = (x: number, y: number, size = 0.1) => Array.from({ length: 21 }, (_, k) => [x + (k % 5) * size * 0.2, y + Math.floor(k / 5) * size * 0.2]).flat();
  const dist = handDist(1);

  it("別の所へ跳んだ手は、つながない・まぜない（間に浮いた骨組みを描かない）", () => {
    const ts = times(30);
    // 0〜1 秒は左の手、1 こま見失って、1.1 秒からは右の手（読み違いで同じ並びに入った）
    const fr = ts.map((_, i) => (i < 10 ? hand(0.2, 0.5) : i === 10 ? null : hand(0.7, 0.5)));
    const tr = smoothTrack(ts, fr, HAND_OVERLAY, dist);
    expect(tr.vs[10]).toBeNull();
    const cx = (t: number) => palmCenter(trackAt(tr, t)!.v)[0];
    expect(cx(0.85)).toBeCloseTo(palmCenter(hand(0.2, 0.5))[0], 6);
    expect(cx(1.25)).toBeCloseTo(palmCenter(hand(0.7, 0.5))[0], 6);
    // 間の時刻は、どちらかの手の所（まん中に浮かない）
    for (const t of [0.95, 1.0, 1.05, 1.1]) {
      const at = trackAt(tr, t);
      if (!at) continue;
      const x = palmCenter(at.v)[0];
      expect(Math.min(Math.abs(x - palmCenter(hand(0.2, 0.5))[0]), Math.abs(x - palmCenter(hand(0.7, 0.5))[0]))).toBeLessThan(1e-6);
    }
  });

  it("つないだ（見ていない）こまは薄く描く", () => {
    const ts = times(30);
    const fr = ts.map((_, i) => (i === 12 || i === 13 ? null : hand(0.3, 0.5)));
    const tr = smoothTrack(ts, fr, HAND_OVERLAY, dist);
    expect(trackAt(tr, 1.25)!.alpha).toBeCloseTo(HAND_OVERLAY.bridgeAlpha!, 6);
    expect(trackAt(tr, 0.8)!.alpha).toBe(1);
  });

  it("ほかの手よりずっと小さい手は、読み違いとして除く", () => {
    const frames = [{ hands: [hand(0.3, 0.5)] }, { hands: [hand(0.3, 0.5), hand(0.8, 0.2, 0.01)] }, { hands: [hand(0.31, 0.5)] }];
    expect(plausibleHands(frames, 1).map((h) => h.length)).toEqual([1, 1, 1]);
  });

  it("長く見えなかった手の位置は忘れる（別の所に出た手を、前の手の並びに引き寄せない）", () => {
    const frames = [{ t: 0, hands: [hand(0.2, 0.5)] }, { t: 0.1, hands: [hand(0.8, 0.5)] }, { t: 1.5, hands: [hand(0.5, 0.5)] }];
    const near = splitHands(frames);
    const forget = splitHands(frames, 2, 0.5);
    // 忘れないと、0.5 の手は前に見えた 0.2・0.8 の近いほうへ入る。忘れると、どちらに入ってもよいが、壊れない
    expect(near.flat().filter(Boolean)).toHaveLength(3);
    expect(forget.flat().filter(Boolean)).toHaveLength(3);
  });

  it("職人の いい例・よくない例：0.5 秒ごとに、濃く描く骨組みは、近い時刻に読んだ手の所にある", () => {
    for (const n of ["master", "learner"]) {
      const s = importRecord(readFileSync(`public/mihon/${n}.json`, "utf8")).landmarksSampled;
      const ts = s.frames.map((f) => f.t);
      const d = handDist(s.aspect);
      const kept = plausibleHands(s.frames.map((f) => ({ hands: f.hands.map((h) => h.slice(0, 42)) })), s.aspect);
      const tracks = splitHands(kept.map((hs, i) => ({ hands: hs, t: ts[i] })), 2, 0.5).map((hs) => smoothTrack(ts, hs, HAND_OVERLAY, d));
      let drawn = 0;
      for (let t = 0; t <= ts[ts.length - 1]; t += 0.5) {
        for (const tr of tracks) {
          const at = trackAt(tr, t);
          if (!at || at.alpha < 0.6) continue;
          drawn++;
          // 前後 0.25 秒に読んだ手の、どれかの近く（手の大きさほど）にある
          const near = s.frames.filter((f) => Math.abs(f.t - t) <= 0.25).flatMap((f) => f.hands);
          expect(Math.min(...near.map((h) => d(h, at.v)))).toBeLessThan(HAND_OVERLAY.maxJump!);
        }
      }
      expect(drawn).toBeGreaterThan(5);
    }
  });
});
