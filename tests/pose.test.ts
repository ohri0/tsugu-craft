import { describe, expect, it } from "vitest";
import { comparePose, poseSummary, poseTrack, wobble } from "../src/craft/pose";
import type { SampledLandmarks } from "../src/craft/record";

/** 手のひらの長さ 0.1 の手を (cx, cy) に置いた 21 点 */
function hand(cx: number, cy: number, tilt = 0): number[] {
  const out: number[] = [];
  for (let i = 0; i < 21; i++) {
    const a = (i / 21) * Math.PI * 2;
    const r = i === 0 ? 0.05 : 0.04 + 0.002 * i;
    const x = cx + r * Math.cos(a + tilt);
    const y = cy + r * Math.sin(a + tilt);
    out.push(x, y);
  }
  // 手首（0）と中指の付け根（9）を、手のひらの長さ 0.1 になるように置く
  out[0] = cx;
  out[1] = cy + 0.05;
  out[18] = cx + 0.1 * Math.sin(tilt);
  out[19] = cy - 0.05 * Math.cos(tilt);
  return out;
}

function clip(durS: number, move: (t: number) => number, side: "left" | "right" = "right"): SampledLandmarks {
  const frames = [];
  for (let k = 0; k <= durS * 10; k++) {
    const t = k / 10;
    const right = hand(0.7 + move(t), 0.6);
    const left = hand(0.3, 0.7);
    frames.push({ t, hands: side === "right" ? [left, right] : [right, left] });
  }
  return { fps: 10, aspect: 1, frames };
}

describe("比べる：手のふらつき", () => {
  it("2 本の手から、画面の右の手を選ぶ", () => {
    const tr = poseTrack(clip(3, () => 0), "right");
    expect(tr.frames.every((f) => f && f.cx > 0.5)).toBe(true);
  });
  it("止まった手のふらつきはほぼ 0", () => {
    const w = wobble(poseTrack(clip(5, () => 0), "right")).filter((v): v is number => v !== null);
    expect(Math.max(...w)).toBeLessThan(1e-9);
  });
  it("学ぶ人だけが 6〜9 秒に手を揺らすと、その間が違う瞬間になり、何倍かが出る", () => {
    const master = clip(12, (t) => 0.002 * Math.sin(t * 9));
    const learner = clip(12, (t) => (t > 6 && t < 9 ? 0.04 * Math.sin(t * 9) : 0.002 * Math.sin(t * 9)));
    const c = comparePose(master, learner, "right");
    expect(c.moments.length).toBeGreaterThan(0);
    for (const m of c.moments) {
      expect(m.t).toBeGreaterThanOrEqual(5.5);
      expect(m.t).toBeLessThanOrEqual(9.5);
      expect(m.masterT).not.toBeNull();
    }
    expect(c.ratio).toBeGreaterThan(1);
    expect(poseSummary(c)).toContain("画面の右の手");
  });
  it("同じ動きなら、違う瞬間はない", () => {
    const a = clip(10, (t) => 0.002 * Math.sin(t * 9));
    expect(comparePose(a, a, "right").moments).toEqual([]);
  });
});
