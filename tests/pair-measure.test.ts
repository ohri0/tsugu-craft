import { describe, expect, it } from "vitest";
import { angleSpread, measureHand, measureTake, strokeLengths, type PairHands } from "../src/craft/pair-measure";
import { poseTrack } from "../src/craft/pose";
import type { SampledLandmarks } from "../src/craft/record";

/** 手のひらの長さ 0.1 の手を (cx, cy) に、tilt（ラジアン）だけ傾けて置いた 21 点 */
function hand(cx: number, cy: number, tilt = 0): number[] {
  const out: number[] = [];
  for (let i = 0; i < 21; i++) {
    const a = (i / 21) * Math.PI * 2;
    const r = 0.04 + 0.002 * i;
    out.push(cx + r * Math.cos(a + tilt), cy + r * Math.sin(a + tilt));
  }
  // 手首（0）と中指の付け根（9）：手のひらの長さ 0.1、向きは tilt だけ回る
  out[0] = cx - 0.05 * Math.sin(tilt);
  out[1] = cy + 0.05 * Math.cos(tilt);
  out[18] = cx + 0.05 * Math.sin(tilt);
  out[19] = cy - 0.05 * Math.cos(tilt);
  return out;
}

/** 左にヤスリを持つ手、右に押さえる手。file(t) は左の手の動き（x のずれと傾き）、hold(t) は右の手の x のずれ */
function clip(durS: number, file: (t: number) => { dx: number; tilt: number } | null, hold: (t: number) => number = () => 0): SampledLandmarks {
  const frames = [];
  for (let k = 0; k <= durS * 10; k++) {
    const t = k / 10;
    const f = file(t);
    const hands = [hand(0.75 + hold(t), 0.6)];
    if (f) hands.unshift(hand(0.3 + f.dx, 0.7, f.tilt));
    frames.push({ t, hands });
  }
  return { fps: 10, aspect: 1, frames };
}

const HANDS: PairHands = { hold: { side: "right", name: "押さえる手" }, file: { side: "left", name: "ヤスリを持つ手", tool: "ヤスリ" } };

describe("いい例とよくない例を比べる：職人の言った 3 つの所", () => {
  it("1 回の動きの長さ：往復の幅を、手のひらの長さを 1 として数える", () => {
    // 振れ幅 0.1（山から谷まで 0.2）、手のひらの長さ 0.1 → 1 回 約 2
    const s = strokeLengths(poseTrack(clip(6, (t) => ({ dx: 0.1 * Math.sin(2 * Math.PI * 0.8 * t), tilt: 0 })), "left"));
    expect(s.length).toBeGreaterThanOrEqual(5);
    for (const v of s) expect(v).toBeGreaterThan(1.7);
    for (const v of s) expect(v).toBeLessThan(2.2);
  });

  it("小さな震えは、往復と数えない", () => {
    const s = strokeLengths(poseTrack(clip(6, (t) => ({ dx: 0.004 * Math.sin(2 * Math.PI * 3 * t), tilt: 0 })), "left"));
    expect(s.length).toBe(0);
  });

  it("角度のぶれ：同じ角度ならほぼ 0、揺れるほど大きい", () => {
    const steady = angleSpread(poseTrack(clip(6, () => ({ dx: 0, tilt: 0.3 })), "left"))!;
    const wobbly = angleSpread(poseTrack(clip(6, (t) => ({ dx: 0, tilt: 0.3 + 0.2 * Math.sin(2 * Math.PI * 1.3 * t) })), "left"))!;
    expect(steady).toBeLessThan(1);
    expect(wobbly).toBeGreaterThan(10);
  });

  it("角度が ±180° をまたいでも、ぶれを大きく数えない", () => {
    const tr = poseTrack(clip(6, (t) => ({ dx: 0, tilt: Math.PI / 2 + 0.02 * Math.sin(5 * t) })), "left");
    expect(angleSpread(tr)!).toBeLessThan(5);
  });

  it("1 本の動画を測る：押さえる手のふらつき・ヤスリの線の角度のぶれ・往復の長さ", () => {
    const take = clip(8, (t) => ({ dx: 0.1 * Math.sin(2 * Math.PI * 0.7 * t), tilt: 0.3 }), (t) => 0.02 * Math.sin(2 * Math.PI * 1.1 * t));
    const line = (deg: number) => ({ angle: deg, x0: 0.2, y0: 0.9, x1: 0.5, y1: 0.5, support: 0.3 });
    const m = measureTake(take, HANDS, { fps: 10, lines: Array.from({ length: 80 }, (_, i) => line(i % 20 < 8 ? 55 : 66)) });
    expect(m.hold!).toBeGreaterThan(0.05);
    expect(m.angle!).toBeGreaterThan(2);
    expect(m.strokes.length).toBeGreaterThanOrEqual(5);
    expect(m.seen.tool).toBe(1);
  });

  it("手が映っていないこまが多い・ヤスリの線がないと、その値は作らない", () => {
    const bad = clip(6, (t) => (t < 1 ? { dx: 0, tilt: 0 } : null));
    const m = measureTake(bad, HANDS, null);
    expect(m.strokes).toEqual([]);
    expect(m.angle).toBeNull();
    expect(measureHand(bad, "left").angleSpread).toBeNull();
  });
});
