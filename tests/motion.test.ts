// 手の記録：動きの数字と、手本との比べ方と、記録の書き出し・読み込みのテスト。合成の手の点で確かめる。
import { describe, expect, it } from "vitest";
import { analyzeMotion, compareRecords, fillGaps, summarizeMetrics, type HandMetrics, type MotionMetrics } from "../src/craft/motion";
import { addNote, createRecord, exportRecord, importRecord, inputFromSampled, RecordFormatError, removeNote } from "../src/craft/record";
import { irregularStrokes, strokesAt, synthMotion } from "./helpers/hands";

const main = (m: MotionMetrics): HandMetrics => {
  expect(m.mainHand).not.toBeNull();
  return m.hands[m.mainHand!];
};

describe("1 分あたりの回数", () => {
  it("1 分あたり 90 回の上下の動きを、およそ 90 回と数える", () => {
    const m = analyzeMotion(synthMotion({ durationS: 20, fps: 20, pose: strokesAt(90, 0.06), noise: 0.003 }));
    const h = main(m);
    expect(h.tempoPerMin!).toBeGreaterThan(87);
    expect(h.tempoPerMin!).toBeLessThan(93);
    expect(Math.abs(h.strokeCount - 30)).toBeLessThanOrEqual(1);
    // 片側 0.06 → 行き帰り 0.12、手のひら 0.15 で割って 0.8
    expect(h.amplitudeMedian!).toBeGreaterThan(0.65);
    expect(h.amplitudeMedian!).toBeLessThan(0.9);
    expect(h.axisDeg).toBeGreaterThan(80); // 縦の動き
  });

  it.each([
    [40, 30],
    [150, 30],
    [200, 30],
  ])("1 分あたり %i 回（%i こま／秒）も数える", (perMin, fps) => {
    const h = main(analyzeMotion(synthMotion({ durationS: 30, fps, pose: strokesAt(perMin, 0.05), noise: 0.003 })));
    expect(Math.abs(h.tempoPerMin! - perMin) / perMin).toBeLessThan(0.04);
  });

  it("手がゆっくり横にずれていっても、回数は変わらない", () => {
    const h = main(analyzeMotion(synthMotion({ durationS: 20, fps: 20, pose: strokesAt(90, 0.05, { x: 0.3, drift: 0.02 }), noise: 0.003 })));
    expect(Math.abs(h.tempoPerMin! - 90)).toBeLessThan(3);
  });

  it("手がしばらく見えない（0.2 秒）所があっても、つないで数える", () => {
    const pose = strokesAt(90, 0.06);
    const input = synthMotion({ durationS: 20, fps: 20, pose: (t) => ((t > 5 && t < 5.2) || (t > 11 && t < 11.15) ? null : pose(t)), noise: 0.003 });
    const h = main(analyzeMotion(input));
    expect(Math.abs(h.tempoPerMin! - 90)).toBeLessThan(3);
  });
});

describe("細かいぶれ", () => {
  it("止めた手のぶれでは、1 回も数えない", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const m = analyzeMotion(synthMotion({ durationS: 20, fps: 30, pose: () => ({ x: 0.5, y: 0.5, palm: 0.15, angle: 80 }), noise: 0.004, seed }));
      const h = main(m);
      expect(h.strokeCount).toBe(0);
      expect(h.tempoPerMin).toBeNull();
      // ずっと止まっている
      expect(h.pauseTotalS).toBeGreaterThan(18);
      expect(summarizeMetrics(m).join()).toContain("くり返しの動きは見つかりませんでした");
    }
  });

  it("ぶれが大きくても、動きの回数は増えない", () => {
    const h = main(analyzeMotion(synthMotion({ durationS: 20, fps: 30, pose: strokesAt(60, 0.06), noise: 0.008, seed: 9 })));
    expect(h.strokeCount).toBeGreaterThanOrEqual(19);
    expect(h.strokeCount).toBeLessThanOrEqual(21);
  });
});

describe("間隔のそろい方と、止まった時間", () => {
  it("そろった動きは、ばらついた動きよりばらつきが小さい", () => {
    const reg = main(analyzeMotion(synthMotion({ durationS: 30, fps: 30, pose: strokesAt(80, 0.06), noise: 0.003 })));
    const irr = main(analyzeMotion(synthMotion({ durationS: 30, fps: 30, pose: irregularStrokes(80, 0.4, 0.06), noise: 0.003 })));
    expect(reg.periodCv!).toBeLessThan(0.05);
    expect(irr.periodCv!).toBeGreaterThan(0.12);
    expect(irr.periodCv!).toBeGreaterThan(3 * reg.periodCv!);
  });

  it("途中で 3 秒止まると、止まった時間に出て、間隔には入れない", () => {
    const go = strokesAt(90, 0.06);
    const pose = (t: number) => (t >= 10 && t < 13 ? { x: 0.5, y: 0.5, palm: 0.15, angle: 80 } : go(t < 10 ? t : t - 3));
    const h = main(analyzeMotion(synthMotion({ durationS: 25, fps: 20, pose, noise: 0.003 })));
    const still = h.pauses.filter((p) => p.kind === "still");
    expect(still.length).toBe(1);
    expect(still[0].start).toBeGreaterThan(9.5);
    expect(still[0].end).toBeLessThan(13.6);
    expect(Math.abs(h.tempoPerMin! - 90)).toBeLessThan(3);
    expect(h.periodCv!).toBeLessThan(0.08);
  });

  it("手の向きが 1 回ごとに ±10° 変わると、変わり方は 20° ぐらい", () => {
    const h = main(analyzeMotion(synthMotion({ durationS: 20, fps: 30, pose: strokesAt(60, 0.05, { angleSwing: 10 }), noise: 0.002 })));
    expect(h.angleSwingDeg!).toBeGreaterThan(16);
    expect(h.angleSwingDeg!).toBeLessThan(23);
    expect(Math.abs(h.angleMeanDeg! - 80)).toBeLessThan(3);
  });
});

describe("2 本の手と、手が見えないとき", () => {
  it("押さえる手と動かす手を分け、よく動いた手を選ぶ", () => {
    const work = strokesAt(90, 0.06, { x: 0.7 });
    const m = analyzeMotion(synthMotion({ durationS: 15, fps: 20, pose: (t) => [{ x: 0.3, y: 0.55, palm: 0.15, angle: 60 }, work(t)], noise: 0.003 }));
    expect(m.hands.length).toBe(2);
    const h = main(m);
    expect(h.label).toBe("画面の右の手");
    expect(Math.abs(h.tempoPerMin! - 90)).toBeLessThan(3);
    const other = m.hands.find((x) => x !== h)!;
    expect(other.label).toBe("画面の左の手");
    expect(other.strokeCount).toBe(0);
  });

  it("手が 1 こまもないと、手が見つからないと言う", () => {
    const m = analyzeMotion({ aspect: 16 / 9, frames: Array.from({ length: 40 }, (_, i) => ({ t: i / 20, hands: [] })) });
    expect(m.hands).toEqual([]);
    expect(m.mainHand).toBeNull();
    expect(summarizeMetrics(m)[0]).toContain("手が見つかりませんでした");
    const c = compareRecords(m, m);
    expect(c.items.find((i) => i.key === "tempo")!.text).toContain("どちらも数えられませんでした");
  });

  it("短いすき間だけを埋める", () => {
    expect(fillGaps([1, NaN, 3, NaN, NaN, NaN, 7], 2).map((v) => (Number.isNaN(v) ? null : v))).toEqual([1, 2, 3, null, null, null, 7]);
  });
});

describe("手本と比べる", () => {
  const master = analyzeMotion(synthMotion({ durationS: 30, fps: 30, pose: strokesAt(90, 0.06), noise: 0.003 }));

  it("速さの向きと量を言葉にする", () => {
    const fast = analyzeMotion(synthMotion({ durationS: 30, fps: 30, pose: strokesAt(102, 0.06), noise: 0.003 }));
    const tempo = compareRecords(master, fast).items.find((i) => i.key === "tempo")!;
    expect(tempo.text).toContain("手本より 1 分あたり 12 回速い");
    const slow = analyzeMotion(synthMotion({ durationS: 30, fps: 30, pose: strokesAt(75, 0.06), noise: 0.003 }));
    expect(compareRecords(master, slow).items.find((i) => i.key === "tempo")!.text).toContain("手本より 1 分あたり 15 回遅い");
    expect(compareRecords(master, master).items.find((i) => i.key === "tempo")!.text).toContain("ほぼ同じ");
  });

  it("振れ幅を手本の何 % かで言う（撮る距離が違っても、手のひらの長さでそろえる）", () => {
    const small = analyzeMotion(synthMotion({ durationS: 30, fps: 30, pose: strokesAt(90, 0.036), noise: 0.003 }));
    expect(compareRecords(master, small).items.find((i) => i.key === "amplitude")!.text).toMatch(/振れ幅が手本の (59|60|61)%/);
    // 半分の大きさに写っていても、手のひらに対して同じ動きなら同じ
    const far = analyzeMotion(synthMotion({ durationS: 30, fps: 30, pose: strokesAt(90, 0.03, { palm: 0.075 }), noise: 0.0015 }));
    const c = compareRecords(master, far);
    expect(c.items.find((i) => i.key === "amplitude")!.text).toContain("ほぼ同じ");
    expect(c.cautions.join()).toContain("撮った距離が大きく違います");
  });

  it("ばらつきと手の向きの幅の違いも言い、良い悪いは言わない", () => {
    const irr = analyzeMotion(synthMotion({ durationS: 30, fps: 30, pose: irregularStrokes(90, 0.4, 0.06), noise: 0.003 }));
    const c = compareRecords(master, irr);
    expect(c.items.find((i) => i.key === "regularity")!.text).toMatch(/間隔のばらつきが手本より \d+ ポイント大きい/);
    const turn = analyzeMotion(synthMotion({ durationS: 30, fps: 30, pose: strokesAt(90, 0.06, { angleSwing: 12 }), noise: 0.003 }));
    expect(compareRecords(master, turn).items.find((i) => i.key === "angleRange")!.text).toMatch(/手の向きの動く幅が手本より \d+° 広い/);
    const all = c.items.map((i) => i.text).join();
    expect(all).not.toMatch(/良い|悪い|上手|下手|正しい/);
    expect(c.cautions.join()).toContain("職人が決めます");
  });
});

describe("記録", () => {
  const input = synthMotion({ durationS: 12, fps: 30, pose: strokesAt(90, 0.06), noise: 0.003 });

  it("書き出して読み込むと、元と同じ", () => {
    let r = createRecord(input, { title: "やすりがけ", craftsman: "山田", videoName: "a.mp4", date: "2026-11-02" });
    r = addNote(r, 6.2, "ここで力を抜く");
    r = addNote(r, 1.5, "最初は軽く当てる");
    expect(r.notes.map((n) => n.t)).toEqual([1.5, 6.2]);
    const back = importRecord(exportRecord(r));
    expect(back).toEqual(r);
    expect(removeNote(back, 0).notes).toEqual([{ t: 6.2, text: "ここで力を抜く" }]);
  });

  it("間引いて残した手の点からも、ほぼ同じ数字が出る", () => {
    const r = createRecord(input, { title: "", craftsman: "", videoName: "a.mp4" });
    expect(r.landmarksSampled.fps).toBe(10);
    expect(r.landmarksSampled.frames.length).toBe(120);
    const { metrics: _drop, ...rest } = r;
    const again = importRecord(JSON.parse(JSON.stringify(rest)));
    const a = main(r.metrics).tempoPerMin!;
    const b = main(again.metrics).tempoPerMin!;
    expect(Math.abs(a - b)).toBeLessThan(3);
    expect(inputFromSampled(r.landmarksSampled).frames[0].hands[0].landmarks.length).toBe(21);
  });

  it("形の違う JSON は、わけを言って断る", () => {
    expect(() => importRecord("{")).toThrow(RecordFormatError);
    expect(() => importRecord({ title: "x" })).toThrow("手の点");
  });
});
